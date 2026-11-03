-- Protocol guides transcribed from PepperAnni posters (Nov 2026, batch 3). Idempotent by name.
-- Owner-approved corrections: SS-31 50 mg and 5 Amino 1MQ units recalculated to match the mL column
-- (posters had 22/26 and 20/26/32 units); Eloralintide gets a note that >100 units needs two draws.
WITH src (name, category, dosage, frequency, duration, notes, storage, sort_order, product_id) AS (
  VALUES
  (
    'SS-31 (Elamipretide) 50 mg', 'Mitochondrial Support',
    'Reconstitute 50 mg with 3 mL bacteriostatic water = 16.67 mg/mL (1 mg = 0.06 mL = 6 units). Dose options (U-100 syringe): 2.5 mg = 0.15 mL = 15 units · 3 mg = 0.18 mL = 18 units · 3.5 mg = 0.21 mL = 21 units · 4 mg = 0.24 mL = 24 units · 4.5 mg = 0.27 mL = 27 units · 5 mg = 0.30 mL = 30 units.',
    '5 times a week, in the evening',
    '12 weeks on, 4 weeks off',
    ARRAY[
      'Mitochondria-targeted peptide that helps protect cardiolipin, studied for mitochondrial function, oxidative stress, cellular energy, endurance, recovery and healthy aging.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous only: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly area, thigh, or upper arm).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before starting or adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    61, '2d146237-fb7d-40e2-bb37-522bbc1fe5f8'::uuid
  ),
  (
    '5 Amino 1MQ 50 mg', 'Fat Metabolism',
    'Reconstitute 50 mg with 3 mL bacteriostatic water = 16.67 mg/mL (1 mg = 0.06 mL = 6 units). Dose options (U-100 syringe): 1 mg = 0.06 mL = 6 units · 2 mg = 0.12 mL = 12 units · 3 mg = 0.18 mL = 18 units · 4 mg = 0.24 mL = 24 units · 5 mg = 0.30 mL = 30 units.',
    'Daily, in the morning',
    '16 weeks on, 4 weeks off',
    ARRAY[
      '5-Amino-1-Methylquinoline, a small molecule studied for cellular energy, fat metabolism, exercise performance and metabolic health when combined with a healthy diet and lifestyle.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous only: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly area, thigh, or upper arm).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before starting or adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    32, '35259ac9-337d-4921-ac5f-d53b55759ed9'::uuid
  ),
  (
    'Eloralintide 10 mg', 'Weight Management',
    'Reconstitute 10 mg with 2 mL bacteriostatic water = 5 mg/mL (1 mg = 0.20 mL = 20 units). Dose options (U-100 syringe): 1 mg = 0.20 mL = 20 units · 2 mg = 0.40 mL = 40 units · 3 mg = 0.60 mL = 60 units · 4 mg = 0.80 mL = 80 units · 5 mg = 1.00 mL = 100 units · 6 mg = 1.20 mL = 120 units · 7 mg = 1.40 mL = 140 units · 8 mg = 1.60 mL = 160 units · 9 mg = 1.80 mL = 180 units.',
    'Once a week, in the evening',
    '24 weeks on, 4 weeks off',
    ARRAY[
      'Amylin receptor agonist that works like natural amylin to help regulate appetite, slow gastric emptying, support portion control and promote fullness. Often used together with other metabolic peptides.',
      'A U-100 insulin syringe holds at most 100 units (1 mL). Doses above 5 mg (over 100 units) need two separate syringe draws.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly area, thigh, or upper arm).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    42, '08da7417-f77d-424e-a288-4e019b5d73e6'::uuid
  )
)
INSERT INTO protocols (name, category, dosage, frequency, duration, notes, storage, sort_order, active, content_type, product_id)
SELECT s.name, s.category, s.dosage, s.frequency, s.duration, s.notes, s.storage, s.sort_order, TRUE, 'text', s.product_id
FROM src s
WHERE NOT EXISTS (SELECT 1 FROM protocols p WHERE p.name = s.name)
RETURNING name;
