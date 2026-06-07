-- Public storage bucket for review screenshots / images
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-images', 'review-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read
DROP POLICY IF EXISTS "review-images public read" ON storage.objects;
CREATE POLICY "review-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-images');

-- Uploads (anon key, used by admin panel)
DROP POLICY IF EXISTS "review-images insert" ON storage.objects;
CREATE POLICY "review-images insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-images');

-- Updates
DROP POLICY IF EXISTS "review-images update" ON storage.objects;
CREATE POLICY "review-images update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'review-images');

-- Deletes
DROP POLICY IF EXISTS "review-images delete" ON storage.objects;
CREATE POLICY "review-images delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'review-images');
