-- Protocol guides transcribed from PepperAnni posters (Nov 2026, batch 5). Idempotent by name.
-- Applied to the live project on 2026-11-08. Posters: docs/protocol-automation/posters/{pt-141-10mg,slu-pp-332-5mg,epitalon-50mg}.jpg
-- Notes vs posters: Epitalon poster says 1 mg = 0.06 mL = 6.67 units; 0.06 mL is 6 units. A 20-day cycle at 5 mg/day needs 100 mg (two vials).
-- SLU-PP 332 poster calls it a GLP-1/GIP receptor agonist; it is usually described as an ERR agonist ("exercise mimetic"), so the text avoids that claim.
WITH common (n) AS (VALUES (ARRAY[
 'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
 'Subcutaneous only: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
 'Inject subcutaneously (belly area, thigh, or upper arm).',
 'Always talk to your provider before starting or adjusting your dose.',
 'Individual response may vary. For research and educational purposes only. Not medical advice.'])),
src (name, category, dosage, frequency, duration, intro, extra, sort_order, product_id) AS (VALUES
 ('PT-141 (Bremelanotide) 10 mg','Sexual Wellness',
  'Reconstitute 10 mg with 2 mL bacteriostatic water = 5 mg/mL (1 mg = 0.20 mL = 20 units). Dose options (U-100 syringe): 0.5 mg = 0.10 mL = 10 units · 1 mg = 0.20 mL = 20 units · 1.5 mg = 0.30 mL = 30 units · 2 mg = 0.40 mL = 40 units.',
  'As needed','8 weeks on, 2 weeks off',
  'PT-141 (Bremelanotide) is a melanocortin receptor agonist that acts on the central nervous system, studied for sexual desire, arousal and intimacy in both men and women as a non-hormonal option.',
  ARRAY['Use as part of a healthy lifestyle.'], 140, 'd6644af4-0e66-455f-9384-20332ea325ac'::uuid),
 ('SLU-PP 332 5 mg','Fat Metabolism',
  'Reconstitute 5 mg with 2 mL bacteriostatic water = 2.5 mg/mL (1 mg = 0.40 mL = 40 units). Dose options (U-100 syringe): 0.5 mg = 0.20 mL = 20 units · 0.75 mg = 0.30 mL = 30 units · 1 mg = 0.40 mL = 40 units · 1.25 mg = 0.50 mL = 50 units · 1.5 mg = 0.60 mL = 60 units.',
  'Daily, in the morning','16 weeks on, 4 weeks off',
  'SLU-PP 332 is a small molecule studied as an "exercise mimetic" for metabolism, energy use, fat metabolism, insulin sensitivity and body composition as part of an overall wellness plan.',
  ARRAY['Use as part of a healthy diet and exercise plan.'], 33, 'beb14749-3fb2-411c-81a3-a1e7c24cdf06'::uuid),
 ('Epitalon 50 mg','Longevity & Energy',
  'Reconstitute 50 mg with 3 mL bacteriostatic water = 16.67 mg/mL (1 mg = 0.06 mL = 6 units). Dose (U-100 syringe): 5 mg = 0.30 mL = 30 units.',
  'Daily for 20 days straight, in the evening','20 days on, then off; repeat the cycle after 6 months',
  'Epitalon is a synthetic four-amino-acid peptide that mimics epithalamin, a peptide made by the pineal gland. Studied for cellular rejuvenation, telomere support, healthy aging, hormonal balance and sleep.',
  ARRAY['A full 20-day cycle at 5 mg a day uses 100 mg, which is two 50 mg vials.', 'Use as part of a healthy diet and exercise plan.'], 81, '29c283e7-fd22-48bc-acdc-ce6eb1343604'::uuid))
INSERT INTO protocols (name, category, dosage, frequency, duration, notes, storage, sort_order, active, content_type, product_id)
SELECT s.name, s.category, s.dosage, s.frequency, s.duration, ARRAY[s.intro] || s.extra || (SELECT n FROM common),
 'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
 s.sort_order, TRUE, 'text', s.product_id
FROM src s WHERE NOT EXISTS (SELECT 1 FROM protocols p WHERE p.name = s.name)
RETURNING name;

-- After uploading the 3 posters to protocol-files/posters/:
-- UPDATE protocols p SET content_type = 'image', file_path = m.path FROM (VALUES
--   ('PT-141 (Bremelanotide) 10 mg','posters/pt-141-10mg.jpg'),('SLU-PP 332 5 mg','posters/slu-pp-332-5mg.jpg'),
--   ('Epitalon 50 mg','posters/epitalon-50mg.jpg')) AS m(name, path) WHERE p.name = m.name;
