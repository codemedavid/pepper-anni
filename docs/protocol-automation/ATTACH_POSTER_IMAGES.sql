-- Paste into Supabase > SQL Editor and click Run (project fjtzqgnhfgrbwylgamcz).
-- 1) Removes the temporary upload rule used to upload the 20 protocol posters.
-- 2) Attaches each poster image to its protocol. The text stays, so the Protocol page
--    and the emails show both the image and the text.
BEGIN;

DROP POLICY IF EXISTS "tmp_poster_upload" ON storage.objects;

UPDATE protocols p
   SET content_type = 'image', file_path = m.path
  FROM (VALUES
    ('Semax 10 mg', 'posters/semax-10mg.jpg'),
    ('DSIP 15 mg', 'posters/dsip-15mg.jpg'),
    ('AOD 9604 10 mg', 'posters/aod9604-10mg.jpg'),
    ('AOD 9604 5 mg', 'posters/aod9604-5mg.jpg'),
    ('Cagrilintide 10 mg', 'posters/cagrilintide-10mg.jpg'),
    ('Cagrilintide 5 mg', 'posters/cagrilintide-5mg.jpg'),
    ('Tirzepatide 60 mg (6 mL reconstitution)', 'posters/tirzepatide-60mg-6ml.jpg'),
    ('Tirzepatide 60 mg (3 mL reconstitution)', 'posters/tirzepatide-60mg-3ml.jpg'),
    ('Tirzepatide 30 mg', 'posters/tirzepatide-30mg.jpg'),
    ('Tirzepatide 15 mg', 'posters/tirzepatide-15mg.jpg'),
    ('SS-31 (Elamipretide) 50 mg', 'posters/ss31-50mg.jpg'),
    ('SS-31 (Elamipretide) 10 mg', 'posters/ss31-10mg.jpg'),
    ('Tesamorelin 10 mg', 'posters/tesamorelin-10mg.jpg'),
    ('Eloralintide 10 mg', 'posters/eloralintide-10mg.jpg'),
    ('NAD+ 500 mg', 'posters/nad-500mg.jpg'),
    ('5 Amino 1MQ 50 mg', 'posters/5-amino-1mq-50mg.jpg'),
    ('L-Carnitine (Lipotropic Injection)', 'posters/l-carnitine.jpg'),
    ('Lipo C with B12 (Lipotropic Injection)', 'posters/lipo-c-b12.jpg'),
    ('Selank 10 mg', 'posters/selank-10mg.jpg'),
    ('Lipo C Fat Blaster (Lipotropic Injection)', 'posters/lipo-c-fat-blaster.jpg')
  ) AS m(name, path)
 WHERE p.name = m.name;

COMMIT;

-- Check: should return one row: 0, 20, 20
select (select count(*) from pg_policies where policyname = 'tmp_poster_upload') as temp_rule_left,
       (select count(*) from storage.objects where bucket_id = 'protocol-files' and name like 'posters/%') as posters_uploaded,
       (select count(*) from protocols where file_path like 'posters/%' and dosage <> '') as protocols_with_image_and_text;
