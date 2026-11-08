-- Protocol guides transcribed from PepperAnni posters (Nov 2026, batch 4). Idempotent by name.
-- Unit corrections (posters' units did not match their own concentration / mL column):
--   MOTS-C 40 mg: 2 mg = 15 units (poster 16).
--   GHK-Cu 100 mg: 1 mg = 3 units (poster 4), 3 mg = 9 units (poster 10), 5 mg = 15 units (poster 16).
--   KPV 30 mg: 0.5 mg = 0.05 mL = 5 units (poster 0.06 mL / 6 units).
--   KPV 10 mg: 0.5 mg = 0.15 mL = 15 units (poster 16); 1 unit = 0.0333 mg (poster 0.333 mg).
--   GHK-Cu + KPV: syringe amounts kept as printed; GHK-Cu column recalculated from the 33.33 mg/mL
--     concentration (poster listed half the actual GHK-Cu per draw, its KPV column was already right).
-- Kisspeptin 10 mg is not linked to a product: the store only sells KISSPEPTIN 5mg.
WITH common (n) AS (
  VALUES (ARRAY[
    'Use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
    'Inject subcutaneously (belly area, thigh, or upper arm). Rotate injection sites.',
    'Always talk to your provider before starting or adjusting your dose.',
    'Individual response may vary. For research and educational purposes only. Not medical advice.'
  ])
),
recon (n) AS (VALUES ('Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.')),
cold (txt) AS (VALUES ('Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.')),
src (name, category, dosage, frequency, duration, intro, extra, storage, sort_order, product_id) AS (
  VALUES
  (
    'MOTS-C 40 mg', 'Mitochondrial Support',
    'Reconstitute 40 mg with 3 mL bacteriostatic water = 13.33 mg/mL (1 unit = 0.133 mg). Dose options (U-100 syringe): 1 mg = 0.075 mL ≈ 8 units · 2 mg = 0.15 mL = 15 units · 3 mg = 0.225 mL ≈ 22 units · 4 mg = 0.30 mL = 30 units · 5 mg = 0.375 mL ≈ 38 units.',
    'Daily or 5 days a week, in the morning', '16 weeks on, 4 weeks off',
    'Mitochondrial-derived peptide encoded in mitochondrial DNA that helps regulate metabolism, energy balance and cellular stress response. Studied for metabolic health, insulin sensitivity, exercise performance and healthy aging.',
    ARRAY['The poster lists 2 mg as 16 units; 0.15 mL is 15 units on a U-100 syringe.'],
    NULL, 62, '10aca2b3-1851-4036-9f4c-5dc3143a4128'::uuid
  ),
  (
    'MOTS-C 10 mg', 'Mitochondrial Support',
    'Reconstitute 10 mg with 2 mL bacteriostatic water = 5 mg/mL (1 unit = 0.05 mg). Dose options (U-100 syringe): 1 mg = 0.20 mL = 20 units · 2 mg = 0.40 mL = 40 units · 3 mg = 0.60 mL = 60 units · 4 mg = 0.80 mL = 80 units · 5 mg = 1.00 mL = 100 units.',
    'Daily or 5 days a week, in the morning', '16 weeks on, 4 weeks off',
    'Mitochondrial-derived peptide encoded in mitochondrial DNA that helps regulate metabolism, energy balance and cellular stress response. Studied for metabolic health, insulin sensitivity, exercise performance and healthy aging.',
    ARRAY[]::text[], NULL, 63, '705fc63c-45bd-4490-8287-ada503789fd9'::uuid
  ),
  (
    'Retatrutide 30 mg', 'Weight Management',
    'Reconstitute 30 mg with 3 mL bacteriostatic water = 10 mg/mL (1 unit = 0.1 mg). Dose options (U-100 syringe): 2 mg = 0.20 mL = 20 units · 4 mg = 0.40 mL = 40 units · 6 mg = 0.60 mL = 60 units · 8 mg = 0.80 mL = 80 units · 10 mg = 1.00 mL = 100 units · 12 mg = 1.20 mL = 120 units.',
    'Once a week, before bedtime', 'Talk to your provider',
    'Next-generation triple agonist peptide targeting GLP-1, GIP and glucagon receptors. Studied for weight management, appetite regulation, metabolic health and body composition.',
    ARRAY['A U-100 insulin syringe holds at most 100 units (1 mL). The 12 mg dose (120 units) needs two separate syringe draws.'],
    NULL, 54, '2a7e8e3d-a757-4f3d-a948-ff090b74dc9a'::uuid
  ),
  (
    'Retatrutide 20 mg', 'Weight Management',
    'Reconstitute 20 mg with 2 mL bacteriostatic water = 10 mg/mL (1 unit = 0.1 mg). Dose options (U-100 syringe): 2 mg = 0.20 mL = 20 units · 4 mg = 0.40 mL = 40 units · 6 mg = 0.60 mL = 60 units · 8 mg = 0.80 mL = 80 units · 10 mg = 1.00 mL = 100 units · 12 mg = 1.20 mL = 120 units.',
    'Once a week, before bedtime', 'Talk to your provider',
    'Next-generation triple agonist peptide targeting GLP-1, GIP and glucagon receptors. Studied for weight management, appetite regulation, metabolic health and body composition.',
    ARRAY['A U-100 insulin syringe holds at most 100 units (1 mL). The 12 mg dose (120 units) needs two separate syringe draws.'],
    NULL, 55, 'fb884d32-8c32-4233-85e1-429803fd645c'::uuid
  ),
  (
    'GHK-Cu 100 mg', 'Skin & Regeneration',
    'Reconstitute 100 mg with 3 mL bacteriostatic water = 33.33 mg/mL (1 unit = 0.333 mg). Dose options (U-100 syringe): 1 mg = 0.03 mL = 3 units · 2 mg = 0.06 mL = 6 units · 3 mg = 0.09 mL = 9 units · 4 mg = 0.12 mL = 12 units · 5 mg = 0.15 mL = 15 units. Example weekly guide: Week 1 = 1 mg (3 units) · Week 2 = 2 mg (6 units) · Week 3 = 3 mg (9 units) · Week 4 = 4 mg (12 units).',
    '5 times a week, in the evening', '12 weeks on, 2–4 weeks off',
    'GHK-Cu (Glycyl-L-Histidyl-L-Lysine Copper) is a naturally occurring copper peptide known for its regenerative, repair and anti-aging properties. Supports skin, hair, connective tissue and overall cellular health.',
    ARRAY['Units here follow the 33.33 mg/mL concentration; the poster shows 4, 10 and 16 units for 1, 3 and 5 mg.'],
    NULL, 100, 'bcb4672a-fde8-40cb-9e21-d42d5ee150c2'::uuid
  ),
  (
    'GHK-Cu 50 mg', 'Skin & Regeneration',
    'Reconstitute 50 mg with 3 mL bacteriostatic water = 16.67 mg/mL (1 unit = 0.1667 mg). Dose options (U-100 syringe): 1 mg = 0.06 mL = 6 units · 2 mg = 0.12 mL = 12 units · 3 mg = 0.18 mL = 18 units · 4 mg = 0.24 mL = 24 units · 5 mg = 0.30 mL = 30 units. Example weekly guide: Week 1 = 1 mg (6 units) · Week 2 = 2 mg (12 units) · Week 3 = 3 mg (18 units) · Week 4 = 4 mg (24 units).',
    '5 times a week or daily, in the evening', '12 weeks on, 2–4 weeks off',
    'GHK-Cu (Glycyl-L-Histidyl-L-Lysine Copper) is a naturally occurring copper peptide known for its regenerative, repair and anti-aging properties. Supports skin, hair, connective tissue and overall cellular health.',
    ARRAY[]::text[], NULL, 101, 'd073b3bd-0ced-4e0c-9963-3120589a3b14'::uuid
  ),
  (
    'GHK-Cu + KPV (100 mg + 10 mg)', 'Skin & Regeneration',
    'Reconstitute the 100 mg GHK-Cu + 10 mg KPV blend with 3 mL bacteriostatic water = 33.33 mg/mL GHK-Cu + 3.33 mg/mL KPV. Dose options (U-100 syringe): 6 units = 0.06 mL = 2.0 mg GHK-Cu + 0.20 mg KPV · 9 units = 0.09 mL = 3.0 mg GHK-Cu + 0.30 mg KPV · 12 units = 0.12 mL = 4.0 mg GHK-Cu + 0.40 mg KPV · 15 units = 0.15 mL = 5.0 mg GHK-Cu + 0.50 mg KPV · 18 units (max) = 0.18 mL = 6.0 mg GHK-Cu + 0.60 mg KPV.',
    '5 times a week, in the evening', '12 weeks on, 4 weeks off',
    'Peptide blend combining the skin-renewing and healing properties of GHK-Cu with the anti-inflammatory and regenerative benefits of KPV, to support skin repair, collagen, reduced inflammation and overall wellness.',
    ARRAY['The poster labels these syringe amounts as 1–3 mg GHK-Cu; at 33.33 mg/mL each amount actually holds twice that (the KPV amounts on the poster are correct). Follow the units.'],
    NULL, 102, 'e846ecdc-a9bf-45f5-a3c9-aad70103a5d0'::uuid
  ),
  (
    'KPV 50 mg', 'Gut & Immune Support',
    'Reconstitute 50 mg with 10 mL bacteriostatic water = 5 mg/mL (1 unit = 0.05 mg). Dose (U-100 syringe): 0.5 mg = 0.10 mL = 10 units.',
    '5 times a week or daily, in the evening', '12 weeks on, 2–4 weeks off',
    'KPV (Lysine-Proline-Valine) is a naturally occurring peptide derived from alpha-melanocyte stimulating hormone (α-MSH), known for its anti-inflammatory, immune-modulating and tissue-repairing properties, especially in the gut and skin.',
    ARRAY[]::text[], NULL, 110, '47e89342-159f-454b-b7ff-6f353d07b82e'::uuid
  ),
  (
    'KPV 30 mg', 'Gut & Immune Support',
    'Reconstitute 30 mg with 3 mL bacteriostatic water = 10 mg/mL (1 unit = 0.1 mg). Dose (U-100 syringe): 0.5 mg = 0.05 mL = 5 units.',
    '5 times a week or daily, in the evening', '12 weeks on, 2–4 weeks off',
    'KPV (Lysine-Proline-Valine) is a naturally occurring peptide derived from alpha-melanocyte stimulating hormone (α-MSH), known for its anti-inflammatory, immune-modulating and tissue-repairing properties, especially in the gut and skin.',
    ARRAY['At 10 mg/mL, 0.5 mg is 5 units (0.05 mL); the poster shows 6 units (0.06 mL), which is 0.6 mg.'],
    NULL, 111, 'be4d60b5-1057-4eb4-9994-a0751ba16e7b'::uuid
  ),
  (
    'KPV 10 mg', 'Gut & Immune Support',
    'Reconstitute 10 mg with 3 mL bacteriostatic water = 3.33 mg/mL (1 unit = 0.0333 mg). Dose (U-100 syringe): 0.5 mg = 0.15 mL = 15 units. Example weekly guide: 0.5 mg (15 units) each week, weeks 1–4.',
    '5 times a week or daily, in the evening', '12 weeks on, 2–4 weeks off',
    'KPV (Lysine-Proline-Valine) is a naturally occurring peptide derived from alpha-melanocyte stimulating hormone (α-MSH), known for its anti-inflammatory, immune-modulating and tissue-repairing properties, especially in the gut and skin.',
    ARRAY['At 3.33 mg/mL, 0.5 mg is 15 units (0.15 mL); the poster shows 16 units.'],
    NULL, 112, 'ba16ac1b-ffc3-497c-ab87-31ba65c510f6'::uuid
  ),
  (
    'Super Human Blend (SHB) 10 mL', 'Performance & Recovery',
    'Ready to use (10 mL vial). No reconstitution needed. Per 10 mL vial: L-Arginine 110 mg · L-Ornithine 110 mg · L-Citrulline 120 mg · L-Lysine 70 mg · L-Glutamine 40 mg · L-Proline 60 mg · L-Taurine 60 mg · L-Carnitine 220 mg · NAC 75 mg. Dose options (U-100 syringe): 30 units = 0.30 mL · 50 units = 0.50 mL · 75 units = 0.75 mL · 100 units = 1.00 mL.',
    '3 times a week, in the morning (before workout on gym days)', '12 weeks on, 4 weeks off',
    'Combination of amino acids and synergistic nutrients designed to support performance, recovery, energy production, fat metabolism, detoxification and overall wellness.',
    ARRAY[
      'Titration: start at 30 units (0.30 mL) to assess tolerance, then increase by about 25 units (0.25 mL) at a time. You do not need to reach 100 units (1 mL); stop at a dose that works for you.',
      'Subcutaneous with a U-100 insulin syringe, or intramuscular (IM).',
      'Avoid taking late at night or close to bed: may be stimulating.',
      'Do not combine with other stimulant or fat-burning, L-carnitine or B-vitamin blends. Avoid if you have severe liver disease or L-carnitine sensitivity.',
      'Inject slowly: you may feel warmth or flushing (arginine). A mild sulfur smell in urine (from NAC) is normal. Stay well hydrated.'
    ],
    'Store at room temperature in a cool, dry place. Do not refrigerate. Do not freeze.',
    85, '82cda6ce-6fc9-4501-a72b-2515a028978b'::uuid
  ),
  (
    'Semax + Selank (10 mg + 10 mg)', 'Cognitive Enhancement',
    'Reconstitute the 10 mg Semax + 10 mg Selank blend with 3 mL bacteriostatic water = 6.67 mg/mL total (3.33 mg/mL each). Dose options (U-100 syringe): 1 mg total (0.50 mg Semax + 0.50 mg Selank) = 0.15 mL = 15 units · 1.6 mg total, max (0.80 mg Semax + 0.80 mg Selank) = 0.24 mL = 24 units.',
    'Daily, in the morning', '12 weeks on, 2–4 weeks off',
    'Neuroregulatory peptides that work together: Semax for focus, mental clarity and neuroprotection; Selank for calm, reduced anxiety and stress resilience. Each dose delivers a 1:1 ratio.',
    ARRAY['Do not use if the solution is cloudy or contains particles. Keep out of reach of children. Discontinue use if irritation or an adverse reaction occurs.'],
    NULL, 12, 'a98517e3-89eb-4cb0-9894-2df37f9048cc'::uuid
  ),
  (
    'Lipo C Supershred (Lipotropic Injection)', 'Lipotropic',
    'Ready to use (10 mL vial). No reconstitution needed. Dose options (U-100 syringe): 20 units = 0.20 mL · 50 units = 0.50 mL · 75 units = 0.75 mL.',
    '3 times a week, in the morning', '8 weeks on, 2–4 weeks off',
    'Lipotropic blend with L-Carnitine, Methionine, Inositol, Choline, Vitamin B12 and other synergistic ingredients, designed to support fat metabolism, energy, focus and body composition as part of a balanced lifestyle.',
    ARRAY['Subcutaneous with a U-100 insulin syringe, or intramuscular (IM).', 'Use as part of a healthy lifestyle.'],
    'Store at room temperature in a dark place. Keep the vial tightly closed. Do not refrigerate. Do not freeze.',
    93, '9d7699ca-6c39-4dad-a421-eb7c968a84aa'::uuid
  ),
  (
    'HHB 10 mL (Skin, Hair & Nails Blend)', 'Beauty & Wellness',
    'Ready to use (10 mL vial). No reconstitution needed. Dose options (U-100 syringe): 30 units = 0.30 mL · 50 units = 0.50 mL · 75 units = 0.75 mL · 100 units = 1.00 mL.',
    'Daily, in the evening', '12 weeks on, 2–4 weeks off',
    'Multi-peptide blend designed to support skin health, hair strength, nail growth, collagen and overall beauty and wellness from within.',
    ARRAY['Subcutaneous with a U-100 insulin syringe, or intramuscular (IM).', 'Use as part of a healthy lifestyle.'],
    'Store at room temperature in a dark place. Keep the vial tightly closed. Do not refrigerate. Do not freeze.',
    95, '0dcc517d-c1e5-4f87-b4a6-c81b3373a746'::uuid
  ),
  (
    'Kisspeptin 10 mg', 'Hormonal Health',
    'Reconstitute 10 mg with 3 mL bacteriostatic water = 3.33 mg/mL (1 mg = 0.30 mL = 30 units). Dose options (U-100 syringe): 100 mcg (0.10 mg) = 0.03 mL = 3 units · 200 mcg (0.20 mg) = 0.06 mL = 6 units.',
    'Daily, morning or evening', '8 weeks on, 4 weeks off',
    'Naturally occurring peptide that stimulates the body''s natural release of reproductive hormones by acting on the hypothalamus. Studied for hormonal balance, reproductive health, libido and overall wellness in men and women.',
    ARRAY['This guide is for a 10 mg vial. For a 5 mg vial the concentration and units are different.', 'Subcutaneous only.'],
    NULL, 130, NULL::uuid
  ),
  (
    'Thymosin Alpha 1 10 mg', 'Immune Support',
    'Reconstitute 10 mg with 2 mL bacteriostatic water = 5 mg/mL (1 mg = 0.20 mL = 20 units). Dose options (U-100 syringe): 0.5 mg = 0.10 mL = 10 units · 1 mg = 0.20 mL = 20 units · 1.5 mg = 0.30 mL = 30 units · 2 mg = 0.40 mL = 40 units.',
    '3 times a week, morning or evening', '12 weeks on, 2–4 weeks off',
    'Thymosin Alpha 1 (Ta1) is a naturally occurring peptide hormone produced by the thymus gland, important for immune system development and regulation. Studied for immune function, the body''s defense response and overall wellness.',
    ARRAY['Subcutaneous only.'],
    NULL, 120, '1cd1dccd-5bf4-4ea7-bb08-ffc2d24307e1'::uuid
  )
)
INSERT INTO protocols (name, category, dosage, frequency, duration, notes, storage, sort_order, active, content_type, product_id)
SELECT s.name, s.category, s.dosage, s.frequency, s.duration,
       ARRAY[s.intro]
         || CASE WHEN s.dosage LIKE 'Ready to use%' THEN ARRAY[]::text[] ELSE ARRAY[(SELECT n FROM recon)] END
         || s.extra || (SELECT n FROM common),
       COALESCE(s.storage, (SELECT txt FROM cold)), s.sort_order, TRUE, 'text', s.product_id
FROM src s
WHERE NOT EXISTS (SELECT 1 FROM protocols p WHERE p.name = s.name)
RETURNING name;
