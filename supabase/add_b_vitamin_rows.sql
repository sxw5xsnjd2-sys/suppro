-- Create dedicated B2, B5 and B6 supplement rows with curated dose profiles,
-- add aliases for future scans, and relink existing product ingredients.
-- Run in the Supabase SQL Editor.

-- ─── Step 1: create the supplement rows ────────────────────────────────────
-- These rows inherit the current B Complex evidence score as a temporary
-- placeholder so dose scoring can work immediately, while keeping the copy and
-- dosing metadata ingredient-specific.

WITH b_complex_template AS (
  SELECT evidence_score
  FROM supplements
  WHERE name = 'B Complex Vitamins'
    AND status = 'approved'
  ORDER BY name
  LIMIT 1
),
target_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        'Riboflavin (Vitamin B2)',
        'Riboflavin is vitamin B2, a water-soluble vitamin involved in cellular energy production, red blood cell function, and antioxidant enzyme activity.',
        'Riboflavin is commonly used to support energy metabolism and to prevent or correct low B2 intake, especially when diet quality is poor or requirements are increased.',
        'Riboflavin has no established upper limit and excess amounts are usually excreted. Bright yellow urine is a common harmless effect after supplementation.',
        'Practical benchmark: 1.3 mg daily.',
        jsonb_build_object(
          'unit', 'mg',
          'flags', jsonb_build_array(),
          'confidence', 0.95,
          'source_text', 'Recommended dose: 1.3 mg/day practical benchmark.',
          'parser_method', 'curated_override',
          'per_intake_max_value', 1.3,
          'per_intake_min_value', 1.3,
          'frequency_max_per_day', 1,
          'frequency_min_per_day', 1
        ),
        jsonb_build_object(
          'unit', 'mg',
          'source', 'curated_override',
          'notes', 'Practical benchmark uses 1.3 mg/day. No established upper limit.',
          'target_max_value', null,
          'target_min_value', 1.3,
          'effective_min_value', 0.78
        )
      ),
      (
        'Pantothenic Acid (Vitamin B5)',
        'Pantothenic acid is vitamin B5, a water-soluble vitamin required for coenzyme A production and normal fat, carbohydrate, and hormone metabolism.',
        'Pantothenic acid is used to support general nutritional adequacy and energy metabolism when intake is low or supplementation is preferred.',
        'Pantothenic acid has no established upper limit and is generally well tolerated at standard supplemental doses.',
        'Practical benchmark: 5 mg daily.',
        jsonb_build_object(
          'unit', 'mg',
          'flags', jsonb_build_array(),
          'confidence', 0.95,
          'source_text', 'Recommended dose: 5 mg/day practical benchmark.',
          'parser_method', 'curated_override',
          'per_intake_max_value', 5,
          'per_intake_min_value', 5,
          'frequency_max_per_day', 1,
          'frequency_min_per_day', 1
        ),
        jsonb_build_object(
          'unit', 'mg',
          'source', 'curated_override',
          'notes', 'Practical benchmark uses 5 mg/day. No established upper limit.',
          'target_max_value', null,
          'target_min_value', 5,
          'effective_min_value', 3
        )
      ),
      (
        'Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)',
        'Vitamin B6 refers to pyridoxine and related active forms including pyridoxal-5-phosphate, which support amino acid metabolism, neurotransmitter synthesis, and nervous system function.',
        'Vitamin B6 is commonly used to support general nutritional adequacy, nerve function, and amino acid metabolism when intake is low or supplementation is indicated.',
        'Vitamin B6 safety is more dose-sensitive than several other B vitamins. For long-term wellness use, a conservative ceiling of about 12 mg/day is used here because chronic higher doses may increase neuropathy risk.',
        'Practical benchmark: 1.7 mg daily. Long-term conservative ceiling: 12 mg daily.',
        jsonb_build_object(
          'unit', 'mg',
          'flags', jsonb_build_array(),
          'confidence', 0.95,
          'source_text', 'Recommended dose is 1.3-1.7 mg/day depending on age and sex; practical benchmark for app scoring is 1.7 mg/day.',
          'parser_method', 'curated_override',
          'per_intake_max_value', 1.7,
          'per_intake_min_value', 1.7,
          'frequency_max_per_day', 1,
          'frequency_min_per_day', 1
        ),
        jsonb_build_object(
          'unit', 'mg',
          'source', 'curated_override',
          'notes', 'Practical benchmark uses 1.7 mg/day. Target max uses a conservative long-term ceiling of 12 mg/day rather than the older 100 mg UL.',
          'target_max_value', 12,
          'target_min_value', 1.7,
          'effective_min_value', 1.02
        )
      )
  ) AS t(
    name,
    what_is_it,
    why_use_it,
    risks_and_interactions,
    how_to_use,
    recommended_dose_json,
    dose_scoring_profile_json
  )
)
INSERT INTO supplements (
  name,
  description,
  what_is_it,
  why_use_it,
  risks_and_interactions,
  evidence,
  evidence_score,
  status,
  how_to_use,
  recommended_dose_status,
  recommended_dose_json,
  dose_scoring_profile_json
)
SELECT
  target_rows.name,
  NULL,
  target_rows.what_is_it,
  target_rows.why_use_it,
  target_rows.risks_and_interactions,
  'Evidence score currently inherits the B Complex Vitamins benchmark until ingredient-specific evidence curation is added.',
  COALESCE(b_complex_template.evidence_score, 53),
  'approved',
  target_rows.how_to_use,
  'parsed',
  target_rows.recommended_dose_json,
  target_rows.dose_scoring_profile_json
FROM target_rows
LEFT JOIN b_complex_template ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM supplements existing
  WHERE existing.name = target_rows.name
);

-- ─── Step 2: add aliases for future scans ──────────────────────────────────
-- Safe to re-run; ON CONFLICT DO NOTHING avoids duplicate aliases.

WITH alias_rows AS (
  SELECT *
  FROM (
    VALUES
      ('Riboflavin (Vitamin B2)', 'Riboflavin', 'riboflavin'),
      ('Riboflavin (Vitamin B2)', 'Vitamin B2', 'vitamin b2'),
      ('Pantothenic Acid (Vitamin B5)', 'Pantothenic Acid', 'pantothenic acid'),
      ('Pantothenic Acid (Vitamin B5)', 'Pantothenate', 'pantothenate'),
      ('Pantothenic Acid (Vitamin B5)', 'Vitamin B5', 'vitamin b5'),
      ('Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)', 'Vitamin B6', 'vitamin b6'),
      ('Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)', 'Pyridoxine', 'pyridoxine'),
      ('Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)', 'P5P', 'p5p'),
      ('Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)', 'PLP', 'plp'),
      ('Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)', 'Pyridoxal Phosphate', 'pyridoxal phosphate'),
      ('Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)', 'Pyridoxal-5-Phosphate', 'pyridoxal-5-phosphate'),
      ('Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)', 'Pyridoxal 5 Phosphate', 'pyridoxal 5 phosphate')
  ) AS t(supplement_name, alias, alias_normalized)
)
INSERT INTO supplement_aliases (supplement_id, alias, alias_normalized)
SELECT supplements.id, alias_rows.alias, alias_rows.alias_normalized
FROM alias_rows
JOIN supplements
  ON supplements.name = alias_rows.supplement_name
 AND supplements.status = 'approved'
ON CONFLICT DO NOTHING;

-- ─── Step 3: relink existing product_active_ingredients rows ───────────────
-- This updates any already-scanned ingredient rows so the UI can score B2/B5/B6
-- separately instead of falling back to B Complex or staying unlinked.

UPDATE product_active_ingredients
SET canonical_supplement_id = (
  SELECT id
  FROM supplements
  WHERE name = 'Riboflavin (Vitamin B2)'
    AND status = 'approved'
  LIMIT 1
)
WHERE canonical_name ILIKE ANY (ARRAY[
  'riboflavin',
  'vitamin b2'
]);

UPDATE product_active_ingredients
SET canonical_supplement_id = (
  SELECT id
  FROM supplements
  WHERE name = 'Pantothenic Acid (Vitamin B5)'
    AND status = 'approved'
  LIMIT 1
)
WHERE canonical_name ILIKE ANY (ARRAY[
  'pantothenic acid',
  'pantothenate',
  'vitamin b5'
]);

UPDATE product_active_ingredients
SET canonical_supplement_id = (
  SELECT id
  FROM supplements
  WHERE name = 'Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)'
    AND status = 'approved'
  LIMIT 1
)
WHERE canonical_name ILIKE ANY (ARRAY[
  'vitamin b6',
  'pyridoxine',
  'p5p',
  'plp',
  'pyridoxal phosphate',
  'pyridoxal-5-phosphate',
  'pyridoxal 5 phosphate'
]);

-- ─── Verify ────────────────────────────────────────────────────────────────
-- SELECT id, name, recommended_dose_json, dose_scoring_profile_json
-- FROM supplements
-- WHERE name IN (
--   'Riboflavin (Vitamin B2)',
--   'Pantothenic Acid (Vitamin B5)',
--   'Vitamin B6 (Pyridoxine / P5P / Pyridoxal-5-Phosphate)'
-- )
-- ORDER BY name;
--
-- SELECT canonical_name, canonical_supplement_id, COUNT(*)
-- FROM product_active_ingredients
-- WHERE canonical_name ILIKE ANY (ARRAY[
--   'riboflavin',
--   'vitamin b2',
--   'pantothenic acid',
--   'pantothenate',
--   'vitamin b5',
--   'vitamin b6',
--   'pyridoxine',
--   'p5p',
--   'plp',
--   'pyridoxal phosphate',
--   'pyridoxal-5-phosphate',
--   'pyridoxal 5 phosphate'
-- ])
-- GROUP BY canonical_name, canonical_supplement_id
-- ORDER BY canonical_name, canonical_supplement_id;
