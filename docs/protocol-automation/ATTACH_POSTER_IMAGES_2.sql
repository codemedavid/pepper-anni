-- Attach the second batch of protocol posters (16 images in docs/protocol-automation/posters/).
-- The protocols themselves (text) were added on 2026-11-08 by supabase/seed_protocols_2026_11d.sql.
--
-- Option A (easiest): Admin > Protocols > Edit each protocol below > Image > choose the poster > Save.
-- Option B: Supabase dashboard > Storage > protocol-files > create folder "posters" > upload the 16 jpgs
--           with the file names below, then paste this file into SQL Editor and Run (project fjtzqgnhfgrbwylgamcz).
UPDATE protocols p
   SET content_type = 'image', file_path = m.path
  FROM (VALUES
    ('MOTS-C 40 mg', 'posters/mots-c-40mg.jpg'),
    ('MOTS-C 10 mg', 'posters/mots-c-10mg.jpg'),
    ('Retatrutide 30 mg', 'posters/retatrutide-30mg.jpg'),
    ('Retatrutide 20 mg', 'posters/retatrutide-20mg.jpg'),
    ('GHK-Cu 100 mg', 'posters/ghk-cu-100mg.jpg'),
    ('GHK-Cu 50 mg', 'posters/ghk-cu-50mg.jpg'),
    ('GHK-Cu + KPV (100 mg + 10 mg)', 'posters/ghk-cu-kpv.jpg'),
    ('KPV 50 mg', 'posters/kpv-50mg.jpg'),
    ('KPV 30 mg', 'posters/kpv-30mg.jpg'),
    ('KPV 10 mg', 'posters/kpv-10mg.jpg'),
    ('Super Human Blend (SHB) 10 mL', 'posters/super-human-blend.jpg'),
    ('Semax + Selank (10 mg + 10 mg)', 'posters/semax-selank.jpg'),
    ('Lipo C Supershred (Lipotropic Injection)', 'posters/lipo-c-supershred.jpg'),
    ('HHB 10 mL (Skin, Hair & Nails Blend)', 'posters/hhb.jpg'),
    ('Kisspeptin 10 mg', 'posters/kisspeptin-10mg.jpg'),
    ('Thymosin Alpha 1 10 mg', 'posters/thymosin-alpha-1-10mg.jpg')
  ) AS m(name, path)
 WHERE p.name = m.name
   AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'protocol-files' AND o.name = m.path);

-- Check: should return 16
select count(*) from protocols where file_path in (
  select 'posters/' || x from unnest(array['mots-c-40mg.jpg','mots-c-10mg.jpg','retatrutide-30mg.jpg','retatrutide-20mg.jpg',
  'ghk-cu-100mg.jpg','ghk-cu-50mg.jpg','ghk-cu-kpv.jpg','kpv-50mg.jpg','kpv-30mg.jpg','kpv-10mg.jpg','super-human-blend.jpg',
  'semax-selank.jpg','lipo-c-supershred.jpg','hhb.jpg','kisspeptin-10mg.jpg','thymosin-alpha-1-10mg.jpg']) x);
