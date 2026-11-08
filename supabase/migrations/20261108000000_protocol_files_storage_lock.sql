/*
  # Close the protocol-files gap left by the generic storage policies

  The project has blanket storage.objects policies "Public Select" / "Public Insert" / "Public Update"
  (USING/WITH CHECK true) covering every bucket. 20261102000200_protocol_lockdown.sql only dropped
  policies that mention 'protocol-files', so these still let the public anon key list, download,
  upload and overwrite protocol files. Exclude that bucket; every other bucket keeps its current access.
  Protocol files are served only through signed URLs from the edge functions (service_role bypasses RLS).

  Also neutralises the temporary poster-upload policy used on 2026-11-06 (DROP needed dashboard approval).
  Applied to the live project on 2026-11-08.
*/
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public Select') THEN
    EXECUTE $p$ALTER POLICY "Public Select" ON storage.objects USING (bucket_id <> 'protocol-files')$p$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public Insert') THEN
    EXECUTE $p$ALTER POLICY "Public Insert" ON storage.objects WITH CHECK (bucket_id <> 'protocol-files')$p$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public Update') THEN
    EXECUTE $p$ALTER POLICY "Public Update" ON storage.objects USING (bucket_id <> 'protocol-files')$p$;
  END IF;
END $$;

DROP POLICY IF EXISTS "tmp_poster_upload" ON storage.objects;
