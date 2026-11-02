-- Protocol guides transcribed from the PepperAnni protocol posters (Nov 2026).
-- Each row is linked to its product via protocols.product_id (backfilled into
-- product_protocols by 20261102000000_protocol_foundation.sql). Idempotent by name.

WITH src (name, category, dosage, frequency, duration, notes, storage, sort_order, product_id) AS (
  VALUES
  (
    'Semax 10 mg', 'Cognitive Enhancement',
    'Reconstitute 10 mg with 3 mL bacteriostatic water = 3.33 mg/mL (0.033 mg per unit). Dose options (U-100 syringe): 0.5 mg = 0.15 mL = 15 units · 0.6 mg = 0.18 mL = 18 units · 0.7 mg = 0.21 mL = 21 units · 0.8 mg = 0.24 mL = 24 units.',
    'Daily, in the morning',
    '12 weeks on, 4 weeks off',
    ARRAY[
      'Synthetic analog of ACTH (4–10) studied for focus, memory, mental clarity, neuroprotection and stress resilience.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your intended dose and always talk to your provider before adjusting or continuing.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    10, 'b2f33c5c-2f29-4d72-92c2-c2e35989cf58'::uuid
  ),
  (
    'DSIP 15 mg', 'Sleep & Recovery',
    'Reconstitute 15 mg with 3 mL bacteriostatic water = 5 mg/mL (0.05 mg per unit). Dose (U-100 syringe): 0.5 mg = 0.10 mL = 10 units.',
    'Daily, before bedtime',
    '12 weeks on, 4 weeks off',
    ARRAY[
      'Delta Sleep Inducing Peptide, studied for sleep quality, stress balance, cognitive function, recovery and overall wellness.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your intended dose and always talk to your provider before adjusting or continuing.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    20, 'ce5ab9d8-473f-4562-bd7a-d59f0a65fab8'::uuid
  ),
  (
    'AOD 9604 10 mg', 'Fat Metabolism',
    'Reconstitute 10 mg with 2 mL bacteriostatic water = 5 mg/mL (0.05 mg per unit). Dose (U-100 syringe): 0.5 mg = 0.10 mL = 10 units.',
    'Daily, fasted in the morning',
    '12 weeks on, 4 weeks off',
    ARRAY[
      'Anti-Obesity Domain peptide, a modified fragment of hGH (176–191) studied for fat metabolism, body composition and weight management.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your intended dose and always talk to your provider before adjusting or continuing.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    30, '84da4600-05cc-4e0e-92b5-e2e8c372c04b'::uuid
  ),
  (
    'AOD 9604 5 mg', 'Fat Metabolism',
    'Reconstitute 5 mg with 1 mL bacteriostatic water = 5 mg/mL (0.05 mg per unit). Dose (U-100 syringe): 0.5 mg = 0.10 mL = 10 units.',
    'Daily, fasted in the morning',
    '12 weeks on, 4 weeks off',
    ARRAY[
      'Anti-Obesity Domain peptide, a modified fragment of hGH (176–191) studied for fat metabolism, body composition and weight management.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your intended dose and always talk to your provider before adjusting or continuing.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    31, '16a5d88e-f157-45f5-b6ba-cc34c67bfa8b'::uuid
  ),
  (
    'Cagrilintide 10 mg', 'Weight Management',
    'Reconstitute 10 mg with 2 mL bacteriostatic water = 5 mg/mL (0.05 mg per unit). Dose options (U-100 syringe): 1 mg = 0.20 mL = 20 units · 1.5 mg = 0.30 mL = 30 units · 2 mg = 0.40 mL = 40 units · 2.5 mg = 0.50 mL = 50 units · 3 mg = 0.60 mL = 60 units · 3.5 mg = 0.70 mL = 70 units · 4 mg = 0.80 mL = 80 units · 4.5 mg = 0.90 mL = 90 units.',
    'Once a week, in the evening',
    '12–16 weeks on, 4 weeks off',
    ARRAY[
      'Long-acting amylin receptor agonist studied for appetite control, weight management, metabolic health and body composition.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your intended dose and always talk to your provider before adjusting or continuing.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    40, 'f2a192f7-e338-4517-a573-890fdbe2da95'::uuid
  ),
  (
    'Cagrilintide 5 mg', 'Weight Management',
    'Reconstitute 5 mg with 1 mL bacteriostatic water = 5 mg/mL (0.05 mg per unit). Dose options (U-100 syringe): 1 mg = 0.20 mL = 20 units · 1.5 mg = 0.30 mL = 30 units · 2 mg = 0.40 mL = 40 units · 2.5 mg = 0.50 mL = 50 units · 3 mg = 0.60 mL = 60 units · 3.5 mg = 0.70 mL = 70 units · 4 mg = 0.80 mL = 80 units · 4.5 mg = 0.90 mL = 90 units.',
    'Once a week, in the evening',
    '12–16 weeks on, 4 weeks off',
    ARRAY[
      'Long-acting amylin receptor agonist studied for appetite control, weight management, metabolic health and body composition.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your intended dose and always talk to your provider before adjusting or continuing.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    41, '48f3fb91-370d-4177-8baf-c423dce43892'::uuid
  ),
  (
    'Tirzepatide 60 mg (6 mL reconstitution)', 'Weight Management',
    'Reconstitute 60 mg with 6 mL bacteriostatic water = 10 mg/mL. Weekly guide: weeks 1–6 = 7.5 mg = 75 units. Dose options (U-100 syringe): 2.5 mg = 0.25 mL = 25 units · 5 mg = 0.50 mL = 50 units · 7.5 mg = 0.75 mL = 75 units · 10 mg = 1.00 mL = 100 units.',
    'Once a week, before bedtime',
    '6-week guide: 7.5 mg (75 units) each week, weeks 1–6',
    ARRAY[
      'Dual GLP-1 / GIP receptor agonist that helps regulate blood sugar, reduce appetite, slow gastric emptying and support weight management.',
      'Subcutaneous: clean the injection site with an alcohol swab and use a U-100 insulin syringe.',
      'Inject slowly into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your therapeutic dose and always talk to your provider before adjusting or continuing.',
      'For educational purposes only. Not medical advice. Individual response may vary. Always consult a qualified healthcare professional before starting any peptide therapy.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    50, 'b0894e0a-7d0b-41ce-8993-d48138348e7c'::uuid
  ),
  (
    'Tirzepatide 60 mg (3 mL reconstitution)', 'Weight Management',
    'Reconstitute 60 mg with 3 mL bacteriostatic water = 20 mg/mL. Weekly guide: weeks 1–6 = 7.5 mg = 38 units. Dose options (U-100 syringe): 2.5 mg = 0.125 mL = 13 units · 5 mg = 0.25 mL = 25 units · 7.5 mg = 0.375 mL = 38 units · 10 mg = 0.50 mL = 50 units.',
    'Once a week, before bedtime',
    '6-week guide: 7.5 mg (38 units) each week, weeks 1–6',
    ARRAY[
      'Dual GLP-1 / GIP receptor agonist that helps regulate blood sugar, reduce appetite, slow gastric emptying and support weight management.',
      'Subcutaneous: clean the injection site with an alcohol swab and use a U-100 insulin syringe.',
      'Inject slowly into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your therapeutic dose and always talk to your provider before adjusting or continuing.',
      'For educational purposes only. Not medical advice. Individual response may vary. Always consult a qualified healthcare professional before starting any peptide therapy.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    51, 'b0894e0a-7d0b-41ce-8993-d48138348e7c'::uuid
  ),
  (
    'Tirzepatide 30 mg', 'Weight Management',
    'Reconstitute 30 mg with 3 mL bacteriostatic water = 10 mg/mL. Weekly guide: weeks 1–6 = 5 mg = 50 units. Dose options (U-100 syringe): 2.5 mg = 0.25 mL = 25 units · 5 mg = 0.50 mL = 50 units · 7.5 mg = 0.75 mL = 75 units.',
    'Once a week, before bedtime',
    '6-week guide: 5 mg (50 units) each week, weeks 1–6',
    ARRAY[
      'Dual GLP-1 / GIP receptor agonist that helps regulate blood sugar, reduce appetite, slow gastric emptying and support weight management.',
      'Subcutaneous: clean the injection site with an alcohol swab and use a U-100 insulin syringe.',
      'Inject slowly into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'For educational purposes only. Not medical advice. Individual response may vary. Always consult a qualified healthcare professional before starting any peptide therapy.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    52, '7e652645-43fd-408b-a62b-ea7aeec10c44'::uuid
  ),
  (
    'Tirzepatide 15 mg', 'Weight Management',
    'Reconstitute 15 mg with 1.5 mL bacteriostatic water = 10 mg/mL. Weekly guide: weeks 1–6 = 2.5 mg = 25 units. Dose options (U-100 syringe): 2.5 mg = 25 units · 5 mg = 50 units.',
    'Once a week, before bedtime',
    '6-week guide: 2.5 mg (25 units) each week, weeks 1–6',
    ARRAY[
      'Dual GLP-1 / GIP receptor agonist that helps regulate blood sugar, reduce appetite, slow gastric emptying and support weight management.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: clean the injection site with an alcohol swab and use a U-100 insulin syringe.',
      'Inject slowly into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your therapeutic dose and always talk to your provider before adjusting or continuing.',
      'For educational purposes only. Not medical advice. Individual response may vary. Always consult a qualified healthcare professional before starting any peptide therapy.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    53, '87cb5a00-7533-4cba-9bf1-7a86a6682184'::uuid
  )
)
INSERT INTO protocols (name, category, dosage, frequency, duration, notes, storage, sort_order, active, content_type, product_id)
SELECT s.name, s.category, s.dosage, s.frequency, s.duration, s.notes, s.storage, s.sort_order, TRUE, 'text', s.product_id
FROM src s
WHERE NOT EXISTS (SELECT 1 FROM protocols p WHERE p.name = s.name)
RETURNING name, product_id;
