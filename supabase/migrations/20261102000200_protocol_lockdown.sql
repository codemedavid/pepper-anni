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
