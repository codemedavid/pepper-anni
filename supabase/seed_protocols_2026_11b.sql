-- Protocol guides transcribed from PepperAnni posters (Nov 2026, batch 2). Idempotent by name.
WITH src (name, category, dosage, frequency, duration, notes, storage, sort_order, product_id) AS (
  VALUES
  (
    'SS-31 (Elamipretide) 10 mg', 'Mitochondrial Support',
    'Reconstitute 10 mg with 2 mL bacteriostatic water = 5 mg/mL (1 mg = 0.20 mL = 20 units). Dose options (U-100 syringe): 2.5 mg = 0.50 mL = 50 units · 3 mg = 0.60 mL = 60 units · 3.5 mg = 0.70 mL = 70 units · 4 mg = 0.80 mL = 80 units · 4.5 mg = 0.90 mL = 90 units · 5 mg = 1.00 mL = 100 units.',
    '5 times a week, in the evening',
    '12 weeks on, 4 weeks off',
    ARRAY[
      'Mitochondria-targeted peptide that helps protect cardiolipin, studied for mitochondrial function, oxidative stress, cellular energy, endurance, recovery and healthy aging.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous only: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly area, thigh, or upper arm).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    60, '4f0532eb-b06b-400e-9633-67e2a2715de6'::uuid
  ),
  (
    'Tesamorelin 10 mg', 'Growth Hormone Support',
    'Reconstitute 10 mg with 3 mL bacteriostatic water = 3.33 mg/mL (1 mg = 0.30 mL = 30 units). Dose options (U-100 syringe): 0.5 mg = 0.15 mL = 15 units · 1 mg = 0.30 mL = 30 units · 1.5 mg = 0.45 mL = 45 units · 2 mg = 0.60 mL = 60 units.',
    'Daily, in the evening',
    '16 weeks on, 4 weeks off',
    ARRAY[
      'Growth hormone-releasing hormone (GHRH) analog that signals the pituitary to release growth hormone, studied for fat metabolism, lean muscle, body composition, recovery and sleep.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous only: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly area, thigh, or upper arm).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before starting or adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    70, '108dad5b-b84f-4fd3-babb-0fb2314dab31'::uuid
  ),
  (
    'NAD+ 500 mg', 'Longevity & Energy',
    'Reconstitute 500 mg with 5 mL bacteriostatic water = 100 mg/mL (1 mg = 1 unit). Dose options (U-100 syringe): 25 mg = 0.25 mL = 25 units · 50 mg = 0.50 mL = 50 units · 75 mg = 0.75 mL = 75 units · 100 mg = 1.00 mL = 100 units.',
    '3 times a week, in the morning',
    '12 weeks on, 4 weeks off',
    ARRAY[
      'Nicotinamide Adenine Dinucleotide, a coenzyme found in every cell, involved in energy production, DNA repair, cellular metabolism and healthy aging.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous or intramuscular: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly, thigh, upper arm) or intramuscularly (gluteal area).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    80, '6c26b97e-57ce-4b7c-8157-8d0073ff54a8'::uuid
  ),
  (
    'L-Carnitine (Lipotropic Injection)', 'Lipotropic',
    'Ready to use (10 mL vial). No reconstitution needed: do not add bacteriostatic water. Dose options (U-100 syringe): 25 units = 0.25 mL (lower) · 50 units = 0.50 mL (standard) · 75 units = 0.75 mL (higher) · 100 units = 1.00 mL (maximum).',
    '3 times a week, in the morning',
    '12 weeks on, 2–4 weeks off',
    ARRAY[
      'Naturally occurring amino acid that transports long-chain fatty acids into the mitochondria to be converted into energy; used for fat metabolism, energy and exercise performance.',
      'Subcutaneous or intramuscular: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly, thigh, upper arm) or intramuscularly (gluteal area).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before starting or adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Keep at room temperature (15–30°C / 59–86°F). Store in a dark place, away from direct sunlight and heat. Keep the vial tightly closed. Do not refrigerate. Do not freeze.',
    90, '9da6735d-1622-4348-a25b-3de0fedb5e1c'::uuid
  ),
  (
    'Lipo C with B12 (Lipotropic Injection)', 'Lipotropic',
    'Ready to use (10 mL vial). No reconstitution needed: do not add bacteriostatic water. Dose options (U-100 syringe): 25 units = 0.25 mL (lower) · 50 units = 0.50 mL (standard) · 75 units = 0.75 mL (higher) · 100 units = 1.00 mL (maximum).',
    '3 times a week, in the morning',
    '12 weeks on, 2–4 weeks off',
    ARRAY[
      'Lipotropic blend of L-Carnitine, Methionine, Inositol, Choline (vitamin B complex) and Vitamin B12 to support fat metabolism, energy, liver health and overall wellness.',
      'Subcutaneous or intramuscular: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly, thigh, upper arm) or intramuscularly (gluteal area).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before starting or adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Keep at room temperature (15–30°C / 59–86°F). Store in a dark place, away from direct sunlight and heat. Keep the vial tightly closed. Do not refrigerate. Do not freeze.',
    91, '4135e3cf-16a1-4a15-b1e2-a1521834c901'::uuid
  ),
  (
    'Lipo C Fat Blaster (Lipotropic Injection)', 'Lipotropic',
    'Ready to use (10 mL vial). No reconstitution needed: do not add bacteriostatic water. Dose options (U-100 syringe): 25 units = 0.25 mL (lower) · 50 units = 0.50 mL (standard) · 75 units = 0.75 mL (higher) · 100 units = 1.00 mL (maximum).',
    '3 times a week, in the morning',
    '12 weeks on, 2–4 weeks off',
    ARRAY[
      'Lipotropic blend of Methionine, Inositol, Choline, L-Carnitine and Vitamin B12 to support fat metabolism, energy, liver health and detox pathways.',
      'Subcutaneous or intramuscular: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject subcutaneously (belly, thigh, upper arm) or intramuscularly (gluteal area).',
      'Use as part of a healthy diet and exercise plan. Always talk to your provider before starting or adjusting your dose.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Keep at room temperature (15–30°C / 59–86°F). Store in a dark place, away from direct sunlight and heat. Keep the vial tightly closed. Do not refrigerate. Do not freeze.',
    92, '2373acaa-473a-4eec-98fc-267ea854e5a5'::uuid
  ),
  (
    'Selank 10 mg', 'Anxiety & Mood',
    'Reconstitute 10 mg with 3 mL bacteriostatic water = 3.33 mg/mL (0.033 mg per unit). Dose options (U-100 syringe): 0.5 mg = 0.15 mL = 15 units · 0.6 mg = 0.18 mL = 18 units · 0.7 mg = 0.21 mL = 21 units · 0.8 mg = 0.24 mL = 24 units.',
    'Daily, morning or evening',
    '12 weeks on, 4 weeks off',
    ARRAY[
      'Synthetic heptapeptide (tuftsin analog) studied for anxiolytic, nootropic and stress-modulating effects: calmer mood, stress resilience, mental clarity and focus.',
      'Reconstitution: add the water to the vial and gently swirl until fully dissolved. Do not shake.',
      'Subcutaneous: use a U-100 insulin syringe and clean the injection site with an alcohol swab.',
      'Inject into the subcutaneous fat (e.g. abdomen, thigh, or upper arm). Rotate injection sites each week.',
      'Stay at your intended dose and always talk to your provider before adjusting or continuing.',
      'Individual response may vary. For research and educational purposes only. Not medical advice.'
    ],
    'Once reconstituted, keep refrigerated at 2–8°C (36–46°F). Protect from direct light. Keep the vial tightly closed. Do not freeze.',
    11, '3ff7f74f-0f3f-4c62-9fba-6ddcf63b9b29'::uuid
  )
)
INSERT INTO protocols (name, category, dosage, frequency, duration, notes, storage, sort_order, active, content_type, product_id)
SELECT s.name, s.category, s.dosage, s.frequency, s.duration, s.notes, s.storage, s.sort_order, TRUE, 'text', s.product_id
FROM src s
WHERE NOT EXISTS (SELECT 1 FROM protocols p WHERE p.name = s.name)
RETURNING name;
