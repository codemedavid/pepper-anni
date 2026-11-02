/*
  # Protocol delivery (Feature A): order confirmed -> protocol email

  FLOW
    orders.order_status changes INTO 'confirmed' (dashboard direct update OR Telegram tg_confirm_order)
      -> AFTER UPDATE trigger trg_orders_protocol_delivery
      -> protocol_post_dispatch(order_id): pg_net POST {order_id} to
         protocol_config.function_base_url || '/protocol-delivery'  with header x-dispatch-secret
      -> edge function inserts the 'auto' protocol_deliveries row (partial unique index = one per order)
         and hands the email to PostHog (event tbs_protocols_ready).

  SAFETY
    - Additive only. The trigger and dispatcher are exception-wrapped: an order UPDATE can NEVER fail or
      roll back because of this feature (network, Vault, config problems only RAISE WARNING).
    - pg_net is asynchronous: the order transaction does not wait for the HTTP call.
    - https-only, respects protocol_config.enabled, needs Vault secret `protocol_dispatch_secret`
      (provisioned at deploy, never committed).

  DUPLICATES
    - Trigger condition: OLD.order_status IS DISTINCT FROM 'confirmed' AND NEW.order_status = 'confirmed'.
    - Hard guarantee: uq_protocol_deliveries_auto_per_order (foundation migration). The edge function
      inserts with ON CONFLICT DO NOTHING, so retries, re-confirms and the sweep below collapse to one email.

  SWEEP (self-heal for a dropped pg_net call)
    Every 10 minutes, re-dispatch orders that are still 'confirmed', were updated in the last 48h
    (and after this feature went live: protocol_config.auto_sweep_since), and have no 'auto' delivery row.
    Orders confirmed BEFORE go-live are never swept, so deploying does not email old customers.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Go-live marker for the sweep (set to the moment this migration runs).
ALTER TABLE protocol_config ADD COLUMN IF NOT EXISTS auto_sweep_since TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- Optional: the PostHog Workflow id of the "Protocol delivery" workflow. When set, the status webhook
-- ignores engagement events from any other workflow (e.g. the tbs_order_* emails to the same customer).
-- When NULL, the webhook falls back to requiring "protocol" in $email_subject.
ALTER TABLE protocol_config ADD COLUMN IF NOT EXISTS status_workflow_id TEXT;

-- Lookup used by the status webhook (most recent non-final delivery per email).
CREATE INDEX IF NOT EXISTS idx_protocol_deliveries_order ON protocol_deliveries(order_id, created_at DESC);

-- ===========================================================================
-- Dispatcher: POST {order_id} to the protocol-delivery edge function.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.protocol_post_dispatch(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_cfg    protocol_config%ROWTYPE;
  v_secret TEXT;
  v_url    TEXT;
BEGIN
  SELECT * INTO v_cfg FROM protocol_config WHERE id = TRUE;
  IF v_cfg.id IS NULL OR v_cfg.enabled IS NOT TRUE OR v_cfg.function_base_url IS NULL THEN
    RETURN;
  END IF;

  v_url := rtrim(v_cfg.function_base_url, '/') || '/protocol-delivery';
  IF v_url NOT LIKE 'https://%' THEN
    RAISE WARNING 'protocol_post_dispatch: refusing non-https url %', v_url;
    RETURN;
  END IF;

  v_secret := public.protocol_get_secret('protocol_dispatch_secret');
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING 'protocol_post_dispatch: Vault secret protocol_dispatch_secret is missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    body    := jsonb_build_object('order_id', p_order_id),
    -- Async (pg_net background worker): this does not hold the order transaction. Generous so the
    -- function can sign file URLs and call PostHog before the connection is dropped.
    timeout_milliseconds := 30000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'protocol_post_dispatch failed for order %: %', p_order_id, SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.protocol_post_dispatch(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protocol_post_dispatch(UUID) TO service_role;

-- ===========================================================================
-- Trigger: fire only on the transition INTO 'confirmed'.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_protocol_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.protocol_post_dispatch(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_protocol_delivery failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_protocol_delivery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_protocol_delivery ON orders;
CREATE TRIGGER trg_orders_protocol_delivery
  AFTER UPDATE OF order_status ON orders
  FOR EACH ROW
  WHEN (OLD.order_status IS DISTINCT FROM 'confirmed' AND NEW.order_status = 'confirmed')
  EXECUTE FUNCTION public.notify_protocol_delivery();

-- ===========================================================================
-- Sweep: re-dispatch recently confirmed orders that never got an 'auto' row.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.protocol_delivery_sweep()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg   protocol_config%ROWTYPE;
  v_count INTEGER := 0;
  rec     RECORD;
BEGIN
  SELECT * INTO v_cfg FROM protocol_config WHERE id = TRUE;
  IF v_cfg.id IS NULL OR v_cfg.enabled IS NOT TRUE THEN
    RETURN 0;
  END IF;

  FOR rec IN
    SELECT o.id
    FROM orders o
    WHERE o.order_status = 'confirmed'
      AND o.updated_at >= GREATEST(NOW() - INTERVAL '48 hours', v_cfg.auto_sweep_since)
      AND o.updated_at <  NOW() - INTERVAL '2 minutes'   -- leave the live trigger call time to land
      AND NOT EXISTS (
        SELECT 1 FROM protocol_deliveries d WHERE d.order_id = o.id AND d.trigger_source = 'auto'
      )
    ORDER BY o.updated_at
    LIMIT 50
  LOOP
    PERFORM public.protocol_post_dispatch(rec.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'protocol_delivery_sweep failed: %', SQLERRM;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.protocol_delivery_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protocol_delivery_sweep() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('protocol-delivery-sweep')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'protocol-delivery-sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('protocol-delivery-sweep', '*/10 * * * *', $$SELECT public.protocol_delivery_sweep();$$);
