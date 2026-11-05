-- Paste this whole file into Supabase > SQL Editor and click Run (project fjtzqgnhfgrbwylgamcz).
-- Applies the 3 protocol automation migrations in order, in one transaction.
-- Automatic protocol emails are switched OFF at the end; turn on after PostHog setup with:
--   update protocol_config set enabled = true;
BEGIN;

-- ===== 1/3 20261102000000_protocol_foundation.sql =====
/*
  # Protocol automation foundation (shared by Feature A + Feature B)

  Additive only: new columns/tables/functions. Existing protocol rows, columns and policies are untouched
  here (the RLS lockdown lives in 20261102000200_protocol_lockdown.sql).

  All NEW tables have RLS ENABLED with NO policies => only service_role (edge functions) can touch them.
  Secrets live in Supabase Vault (provisioned at deploy time, see docs/protocol-automation/DEPLOY.md):
    protocol_session_secret   HMAC key for admin/portal session tokens
    protocol_dispatch_secret  shared secret: DB trigger -> protocol-delivery edge function
    protocol_webhook_secret   shared secret: PostHog destination -> protocol-delivery-status
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- protocols: version counter + private storage path
-- ---------------------------------------------------------------------------
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS file_path TEXT; -- object path inside bucket 'protocol-files'
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'text';
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS file_url TEXT;

CREATE OR REPLACE FUNCTION public.protocols_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.name, NEW.category, NEW.dosage, NEW.frequency, NEW.duration, NEW.notes, NEW.storage,
      NEW.content_type, NEW.file_url, NEW.file_path)
     IS DISTINCT FROM
     (OLD.name, OLD.category, OLD.dosage, OLD.frequency, OLD.duration, OLD.notes, OLD.storage,
      OLD.content_type, OLD.file_url, OLD.file_path) THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protocols_bump_version ON protocols;
CREATE TRIGGER trg_protocols_bump_version
  BEFORE UPDATE ON protocols FOR EACH ROW
  EXECUTE FUNCTION public.protocols_bump_version();

-- ---------------------------------------------------------------------------
-- product <-> protocol assignment (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_protocols (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, protocol_id)
);
CREATE INDEX IF NOT EXISTS idx_product_protocols_protocol ON product_protocols(protocol_id);
ALTER TABLE product_protocols ENABLE ROW LEVEL SECURITY;

INSERT INTO product_protocols (product_id, protocol_id)
SELECT p.product_id, p.id
FROM protocols p
JOIN products pr ON pr.id = p.product_id
WHERE p.product_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Singletons (service-role only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocol_config (
  id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,          -- master switch for auto emails
  function_base_url   TEXT CHECK (function_base_url IS NULL OR function_base_url LIKE 'https://%'),
  posthog_project_key TEXT,
  posthog_host        TEXT NOT NULL DEFAULT 'https://us.i.posthog.com',
  link_ttl_days       INTEGER NOT NULL DEFAULT 30 CHECK (link_ttl_days BETWEEN 1 AND 365),
  site_url            TEXT NOT NULL DEFAULT 'https://pepperanni.com',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE protocol_config ENABLE ROW LEVEL SECURITY;

-- Reuse the non-secret values already configured for the Telegram bot.
INSERT INTO protocol_config (id, function_base_url, posthog_project_key, posthog_host)
SELECT TRUE, t.function_base_url, t.posthog_project_key, t.posthog_host
FROM telegram_config t WHERE t.id = TRUE
ON CONFLICT (id) DO NOTHING;
INSERT INTO protocol_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS protocol_portal_settings (
  id               BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  password_hash    TEXT,            -- crypt(pw, gen_salt('bf'))
  password_plain   TEXT,            -- kept server-side only so it can be included in protocol emails
  password_version INTEGER NOT NULL DEFAULT 1, -- bump => all portal sessions invalidated
  session_hours    INTEGER NOT NULL DEFAULT 720 CHECK (session_hours BETWEEN 1 AND 8760),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE protocol_portal_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO protocol_portal_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_credentials (
  id               BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  password_hash    TEXT NOT NULL,
  password_version INTEGER NOT NULL DEFAULT 1,
  must_rotate      BOOLEAN NOT NULL DEFAULT TRUE, -- seeded password is public (old JS bundle) => rotate
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE admin_credentials ENABLE ROW LEVEL SECURITY;
-- Seed with the CURRENT admin password so login keeps working after deploy; the UI forces a change.
INSERT INTO admin_credentials (id, password_hash)
VALUES (TRUE, extensions.crypt('PepperAnni@Admin!2026', extensions.gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;

-- Password helpers (service_role only)
CREATE OR REPLACE FUNCTION public.protocol_check_password(p_kind TEXT, p_password TEXT)
RETURNS INTEGER -- password_version when valid, NULL otherwise
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash TEXT; v_ver INTEGER;
BEGIN
  IF p_kind = 'admin' THEN
    SELECT password_hash, password_version INTO v_hash, v_ver FROM admin_credentials WHERE id = TRUE;
  ELSIF p_kind = 'portal' THEN
    SELECT password_hash, password_version INTO v_hash, v_ver FROM protocol_portal_settings WHERE id = TRUE;
  ELSE
    RETURN NULL;
  END IF;
  IF v_hash IS NULL OR p_password IS NULL OR crypt(p_password, v_hash) <> v_hash THEN
    RETURN NULL;
  END IF;
  RETURN v_ver;
END;
$$;

CREATE OR REPLACE FUNCTION public.protocol_set_password(p_kind TEXT, p_password TEXT)
RETURNS INTEGER -- new password_version
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ver INTEGER;
BEGIN
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'password must be at least 8 characters';
  END IF;
  IF p_kind = 'admin' THEN
    UPDATE admin_credentials
       SET password_hash = crypt(p_password, gen_salt('bf')), password_version = password_version + 1,
           must_rotate = FALSE, updated_at = NOW()
     WHERE id = TRUE RETURNING password_version INTO v_ver;
  ELSIF p_kind = 'portal' THEN
    UPDATE protocol_portal_settings
       SET password_hash = crypt(p_password, gen_salt('bf')), password_plain = p_password,
           password_version = password_version + 1, updated_at = NOW()
     WHERE id = TRUE RETURNING password_version INTO v_ver;
  ELSE
    RAISE EXCEPTION 'unknown kind %', p_kind;
  END IF;
  RETURN v_ver;
END;
$$;

REVOKE ALL ON FUNCTION public.protocol_check_password(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protocol_set_password(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protocol_check_password(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.protocol_set_password(TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Delivery log (Feature A)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocol_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_number      TEXT,
  customer_email    TEXT,
  customer_name     TEXT,
  trigger_source    TEXT NOT NULL CHECK (trigger_source IN ('auto', 'manual')),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','handed_off','sent','delivered','failed','bounced','skipped')),
  status_reason     TEXT,
  protocols         JSONB NOT NULL DEFAULT '[]'::jsonb, -- snapshot [{protocol_id,name,version}]
  attempts          INTEGER NOT NULL DEFAULT 0,
  requested_by      TEXT,          -- 'system' | 'admin'
  handed_off_at     TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Duplicate guard: at most ONE automatic delivery per order, ever.
CREATE UNIQUE INDEX IF NOT EXISTS uq_protocol_deliveries_auto_per_order
  ON protocol_deliveries(order_id) WHERE trigger_source = 'auto';
CREATE INDEX IF NOT EXISTS idx_protocol_deliveries_status ON protocol_deliveries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_protocol_deliveries_email ON protocol_deliveries(lower(customer_email), created_at DESC);
ALTER TABLE protocol_deliveries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Vault reader (protocol_* namespace only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protocol_get_secret(p_name TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = vault, public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = p_name AND name LIKE 'protocol\_%' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.protocol_get_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protocol_get_secret(TEXT) TO service_role;

-- ===== 2/3 20261102000100_protocol_delivery.sql =====
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

-- ===== 3/3 20261102000200_protocol_lockdown.sql =====
/*
  # Protocol lockdown (Feature B: real, server-enforced portal lock)

  After this migration:
    - `protocols` has RLS enabled with NO policies and no anon/authenticated grants, so the public anon key
      can neither read nor write it. Only service_role (the protocol-admin / protocol-portal / protocol-delivery
      edge functions) can touch it.
    - The `protocol-files` storage bucket is private and has no anon policies. Files are served only through
      short-lived signed URLs minted by the edge functions (service_role bypasses storage RLS).
    - `protocols.file_path` is backfilled from legacy public Supabase Storage URLs in `file_url`.
      `file_url` is left untouched for history.

  Idempotent and safe to re-run; tolerates a missing bucket, missing policies or a missing storage schema.
*/

-- ---------------------------------------------------------------------------
-- 1. protocols: drop every policy, keep RLS on, revoke client grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'protocols'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.protocols', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.protocols ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.protocols FROM anon, authenticated;
GRANT ALL ON public.protocols TO service_role;

-- product_protocols / settings tables are created RLS-on with no policies by the foundation migration.
-- Revoke client grants there too (defence in depth; default privileges may have granted them).
REVOKE ALL ON public.product_protocols FROM anon, authenticated;
REVOKE ALL ON public.protocol_portal_settings FROM anon, authenticated;
REVOKE ALL ON public.admin_credentials FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Backfill file_path from legacy public Supabase Storage URLs
--    e.g. https://<ref>.supabase.co/storage/v1/object/public/protocol-files/1700000000-abc.pdf
--         -> 1700000000-abc.pdf
--    (Newer uploads went to ImageKit; those URLs do not match and keep file_path NULL.)
-- ---------------------------------------------------------------------------
UPDATE public.protocols
   SET file_path = regexp_replace(
         split_part(split_part(file_url, '?', 1), '#', 1),
         '^.*/storage/v1/object/(public|sign|authenticated)/protocol-files/',
         ''
       )
 WHERE file_path IS NULL
   AND file_url ~ '/storage/v1/object/(public|sign|authenticated)/protocol-files/.+';

-- ---------------------------------------------------------------------------
-- 3. Storage: private bucket, no anon policies
-- ---------------------------------------------------------------------------
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    -- Create the bucket private if it does not exist yet (uploads go through signed upload URLs).
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('protocol-files', 'protocol-files', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public can read protocol files" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can upload protocol files" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can update protocol files" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can delete protocol files" ON storage.objects';
    -- Any other (hand-made) policy scoped to this bucket.
    FOR pol IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
         AND (coalesce(qual, '') LIKE '%protocol-files%' OR coalesce(with_check, '') LIKE '%protocol-files%')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
  END IF;
END;
$$;

-- Keep automatic emails off until the PostHog Workflow is set up.
UPDATE protocol_config SET enabled = FALSE WHERE id = TRUE;
COMMIT;

-- Check: should return one row: true, true, false, 20, true, false
select to_regclass('public.protocol_config') is not null as foundation, to_regclass('public.admin_credentials') is not null as admin_login, (select enabled from protocol_config) as emails_enabled, (select count(*) from product_protocols) as protocol_links, exists(select 1 from pg_trigger where tgname='trg_orders_protocol_delivery') as email_trigger, (select public from storage.buckets where id='protocol-files') as files_public;
