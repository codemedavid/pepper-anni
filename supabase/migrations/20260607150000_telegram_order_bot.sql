/*
  # Telegram Order Bot — schema, atomic transitions, config, secrets, outbound sync

  PURPOSE
    Mirror every order into a Telegram forum (group with topics) in real time, let staff advance an order's
    status from inline buttons, and keep PostHog + the admin dashboard perfectly in sync. Every status change
    (dashboard OR Telegram) flows through ONE outbound path so the `orders` table stays the source of truth.

  SAFETY ("don't destroy anything")
    - 100% additive: no existing table/column/policy/row is modified.
    - The outbound trigger uses pg_net (async) and is exception-wrapped, so a Telegram/network failure can NEVER
      fail or slow an order INSERT/UPDATE.
    - All NEW tables have RLS ENABLED with NO policies => only service_role can touch them. This project leaves
      RLS off on most tables (so they're readable with the anon key); these new tables hold chat ids, topic ids,
      per-order Telegram metadata and customer PII bookkeeping that must never be anon-readable.
    - The bot token + webhook secrets live in Supabase Vault (encrypted at rest), provisioned out-of-band
      (see deploy step), never in this committed file.

  CORRECTNESS
    - Confirm (new->confirmed) is a single atomic RPC: it locks the order + stock rows, verifies + deducts stock
      with a conditional `stock >= qty` decrement, sets payment_status='paid', and records the acting staffer —
      all in one transaction. No oversell, no partial-deduct-then-commit, idempotent (only acts from 'new').
    - Ship/Complete/Cancel use a conditional-claim RPC so concurrent taps can't double-apply.
    - A pg_cron reconcile job re-fires the sync for any order whose Telegram card drifted from its true status
      (e.g. a dropped pg_net delivery), so the mirror self-heals.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ===========================================================================
-- Config (non-secret). Locked to service_role via RLS.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS telegram_config (
  id                  BOOLEAN PRIMARY KEY DEFAULT TRUE,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  chat_id             BIGINT,
  posthog_project_key TEXT,
  posthog_host        TEXT NOT NULL DEFAULT 'https://us.i.posthog.com',
  function_base_url    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_config_singleton CHECK (id = TRUE),
  CONSTRAINT telegram_config_https CHECK (function_base_url IS NULL OR function_base_url LIKE 'https://%')
);
ALTER TABLE telegram_config ENABLE ROW LEVEL SECURITY;

-- Seed the singleton with the known NON-SECRET config. chat_id is also re-captured
-- automatically from the real group on the first /bind, so it self-corrects.
INSERT INTO telegram_config (id, enabled, chat_id, function_base_url, posthog_project_key, posthog_host)
VALUES (
  TRUE, TRUE, -1003997121933,
  'https://wdebbxcykvztyxfrrrxp.supabase.co/functions/v1',
  'phc_CNDCh5Qx4NpEqUKBMtVyFwCMwpSTR85VwiXBwDfwvTpS',
  'https://us.i.posthog.com'
)
ON CONFLICT (id) DO UPDATE SET
  function_base_url   = EXCLUDED.function_base_url,
  posthog_project_key = EXCLUDED.posthog_project_key,
  posthog_host        = EXCLUDED.posthog_host;

-- ===========================================================================
-- Status-group -> forum topic mapping. Populated by the /bind flow.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS telegram_topic_map (
  topic_key         TEXT PRIMARY KEY,
  message_thread_id BIGINT,
  label             TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE telegram_topic_map ENABLE ROW LEVEL SECURITY;

INSERT INTO telegram_topic_map (topic_key, label) VALUES
  ('new_orders', 'New Orders'),
  ('to_prepare', 'To Prepare'),
  ('to_ship',    'To Ship'),
  ('completed',  'Completed'),
  ('cancelled',  'Cancelled')
ON CONFLICT (topic_key) DO NOTHING;

-- ===========================================================================
-- Per-order Telegram bookkeeping + audit.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS order_telegram_messages (
  order_id             UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  chat_id              BIGINT,
  message_thread_id    BIGINT,
  main_message_id      BIGINT,
  proof_message_id     BIGINT,
  current_status       TEXT,
  confirmed_by         TEXT,
  confirmed_at         TIMESTAMPTZ,
  pending_actor        TEXT,
  pending_actor_status TEXT,
  audit                JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE order_telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_otm_chat_main_msg ON order_telegram_messages (chat_id, main_message_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_otm_updated_at ON order_telegram_messages;
CREATE TRIGGER trg_otm_updated_at BEFORE UPDATE ON order_telegram_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_telegram_config_updated_at ON telegram_config;
CREATE TRIGGER trg_telegram_config_updated_at BEFORE UPDATE ON telegram_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================================================
-- Vault secret reader. SECURITY DEFINER; service_role only; telegram namespace only.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.telegram_get_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name AND name LIKE 'telegram\_%'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.telegram_get_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_get_secret(TEXT) TO service_role;

-- ===========================================================================
-- Outbound notifier: POST {order_id} to the sync edge function via pg_net.
-- Shared by the order trigger AND the reconcile job. Exception-safe + https-only.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.telegram_post_sync(p_order_id UUID, p_type TEXT, p_new_status TEXT, p_old_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_cfg         telegram_config%ROWTYPE;
  v_sync_secret TEXT;
  v_url         TEXT;
BEGIN
  SELECT * INTO v_cfg FROM telegram_config WHERE id = TRUE;
  IF v_cfg.id IS NULL OR v_cfg.enabled IS NOT TRUE OR v_cfg.function_base_url IS NULL THEN
    RETURN;
  END IF;

  v_url := rtrim(v_cfg.function_base_url, '/') || '/telegram-order-sync';
  IF v_url NOT LIKE 'https://%' THEN
    RAISE WARNING 'telegram_post_sync: refusing non-https url %', v_url;
    RETURN;
  END IF;

  v_sync_secret := public.telegram_get_secret('telegram_sync_secret');
  IF v_sync_secret IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_sync_secret),
    body    := jsonb_build_object('type', p_type, 'order_id', p_order_id,
                                  'new_status', p_new_status, 'old_status', p_old_status),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'telegram_post_sync failed for order %: %', p_order_id, SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.telegram_post_sync(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_post_sync(UUID, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_telegram_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.telegram_post_sync(
    NEW.id, TG_OP, NEW.order_status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.order_status ELSE NULL END
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_telegram_order failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_telegram_insert ON orders;
CREATE TRIGGER trg_orders_telegram_insert
  AFTER INSERT ON orders FOR EACH ROW
  WHEN (NEW.order_status = 'new')
  EXECUTE FUNCTION public.notify_telegram_order();

DROP TRIGGER IF EXISTS trg_orders_telegram_update ON orders;
CREATE TRIGGER trg_orders_telegram_update
  AFTER UPDATE ON orders FOR EACH ROW
  WHEN (OLD.order_status IS DISTINCT FROM NEW.order_status)
  EXECUTE FUNCTION public.notify_telegram_order();

-- ===========================================================================
-- ATOMIC confirm: lock order + stock, verify ALL items, then deduct ALL,
-- set paid + confirmed, record the acting staffer. One transaction.
-- Returns: {status: ok | already | not_found | insufficient_stock, item?}
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.tg_confirm_order(p_order_id UUID, p_actor TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  orders%ROWTYPE;
  v_items  JSONB;
  rec      RECORD;
  v_stock  INT;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_order.order_status <> 'new' THEN
    RETURN jsonb_build_object('status', 'already', 'current', v_order.order_status);
  END IF;

  v_items := CASE WHEN jsonb_typeof(v_order.order_items) = 'array' THEN v_order.order_items ELSE '[]'::jsonb END;

  -- Pass 1: lock + verify AGGREGATED quantity per SKU (so duplicate line items for the
  -- same product/variation can't each pass the check and then oversell on deduct).
  -- ORDER BY gives a deterministic lock order, so concurrent confirms can't deadlock.
  FOR rec IN
    SELECT
      NULLIF(value->>'variation_id', '')            AS vid,
      value->>'product_id'                          AS pid,
      SUM(COALESCE((value->>'quantity')::int, 0))   AS qty,
      MAX(COALESCE(value->>'product_name', 'item')) AS pname,
      MAX(COALESCE(value->>'variation_name', ''))   AS vname
    FROM jsonb_array_elements(v_items) AS t(value)
    GROUP BY 1, 2
    ORDER BY 1 NULLS LAST, 2
  LOOP
    IF rec.vid IS NOT NULL THEN
      SELECT stock_quantity INTO v_stock FROM product_variations WHERE id = rec.vid::uuid FOR UPDATE;
      IF v_stock IS NULL OR v_stock < rec.qty THEN
        RETURN jsonb_build_object('status', 'insufficient_stock',
          'item', trim(rec.pname || ' ' || rec.vname), 'have', COALESCE(v_stock, 0), 'need', rec.qty);
      END IF;
    ELSE
      SELECT stock_quantity INTO v_stock FROM products WHERE id = rec.pid::uuid FOR UPDATE;
      IF v_stock IS NULL OR v_stock < rec.qty THEN
        RETURN jsonb_build_object('status', 'insufficient_stock',
          'item', rec.pname, 'have', COALESCE(v_stock, 0), 'need', rec.qty);
      END IF;
    END IF;
  END LOOP;

  -- Pass 2: deduct AGGREGATED quantity per SKU (locks from Pass 1 are still held).
  FOR rec IN
    SELECT
      NULLIF(value->>'variation_id', '')          AS vid,
      value->>'product_id'                        AS pid,
      SUM(COALESCE((value->>'quantity')::int, 0)) AS qty
    FROM jsonb_array_elements(v_items) AS t(value)
    GROUP BY 1, 2
    ORDER BY 1 NULLS LAST, 2
  LOOP
    IF rec.vid IS NOT NULL THEN
      UPDATE product_variations SET stock_quantity = stock_quantity - rec.qty WHERE id = rec.vid::uuid;
    ELSE
      UPDATE products SET stock_quantity = stock_quantity - rec.qty WHERE id = rec.pid::uuid;
    END IF;
  END LOOP;

  -- Durably record the confirming staffer in the SAME txn (so the "Confirmed by"
  -- footer survives even a sub-second Confirm->Ship before the confirmed card renders).
  INSERT INTO order_telegram_messages (order_id, pending_actor, pending_actor_status, confirmed_by, confirmed_at)
  VALUES (p_order_id, p_actor, 'confirmed', p_actor, NOW())
  ON CONFLICT (order_id) DO UPDATE SET
    pending_actor        = EXCLUDED.pending_actor,
    pending_actor_status = EXCLUDED.pending_actor_status,
    confirmed_by         = EXCLUDED.confirmed_by,
    confirmed_at         = EXCLUDED.confirmed_at;

  UPDATE orders SET order_status = 'confirmed', payment_status = 'paid', updated_at = NOW()
    WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.tg_confirm_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_confirm_order(UUID, TEXT) TO service_role;

-- ===========================================================================
-- Conditional status advance (ship/complete/cancel). Claims only from allowed
-- states; records the actor in the same transaction. Returns {status: ok|already}.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.tg_advance_order(p_order_id UUID, p_from TEXT[], p_to TEXT, p_actor TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_affected INT;
BEGIN
  UPDATE orders SET order_status = p_to, updated_at = NOW()
    WHERE id = p_order_id AND order_status = ANY(p_from);
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RETURN jsonb_build_object('status', 'already');
  END IF;

  -- record the acting staffer (only reached on a winning claim); upsert so it
  -- survives even if the bookkeeping row hasn't been created by the sync yet.
  INSERT INTO order_telegram_messages (order_id, pending_actor, pending_actor_status)
  VALUES (p_order_id, p_actor, p_to)
  ON CONFLICT (order_id) DO UPDATE SET
    pending_actor        = EXCLUDED.pending_actor,
    pending_actor_status = EXCLUDED.pending_actor_status;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.tg_advance_order(UUID, TEXT[], TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_advance_order(UUID, TEXT[], TEXT, TEXT) TO service_role;

-- ===========================================================================
-- Reconcile safety net: re-fire the sync for any order whose Telegram card has
-- drifted from its true status (e.g. a dropped pg_net delivery). Skips orders
-- changed in the last 90s so it never races a live trigger. Runs every minute.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.telegram_reconcile()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT o.id, o.order_status
    FROM orders o
    LEFT JOIN order_telegram_messages m ON m.order_id = o.id
    WHERE o.created_at > NOW() - INTERVAL '7 days'
      AND o.updated_at < NOW() - INTERVAL '90 seconds'
      AND (m.order_id IS NULL OR m.current_status IS DISTINCT FROM o.order_status)
    ORDER BY o.updated_at
    LIMIT 25
  LOOP
    PERFORM public.telegram_post_sync(r.id, 'RECONCILE', r.order_status, NULL);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.telegram_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_reconcile() TO service_role;

-- (re)schedule the reconcile job
DO $$
BEGIN
  PERFORM cron.unschedule('telegram-reconcile') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'telegram-reconcile');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('telegram-reconcile', '* * * * *', $$SELECT public.telegram_reconcile();$$);
