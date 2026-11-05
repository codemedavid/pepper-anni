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
