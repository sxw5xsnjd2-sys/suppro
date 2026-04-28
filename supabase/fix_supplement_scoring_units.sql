-- Fix scoring profile units for vitamins stored in mcg but with "mg" unit in DB.
-- Run these in the Supabase SQL Editor.
-- Each statement is safe to run multiple times (idempotent).

-- ─── 1. Fix unit in dose_scoring_profile_json ──────────────────────────────

UPDATE supplements
SET dose_scoring_profile_json = jsonb_set(
  dose_scoring_profile_json::jsonb,
  '{unit}',
  '"mcg"'::jsonb
)
WHERE id IN (
  '4f02cc51-35eb-4905-abfd-f87961fad7f6',  -- Biotin (Vitamin B7)
  'ca46ea38-635a-4561-aa1b-111c7a5298d6',  -- Folate (Folic Acid / Vitamin B9)
  '53af13f0-f6b0-4dd5-b77f-1804bfd0a98b'   -- Vitamin K
)
AND dose_scoring_profile_json IS NOT NULL
AND (dose_scoring_profile_json::jsonb)->>'unit' = 'mg';

-- ─── 2. Fix unit in recommended_dose_json ──────────────────────────────────

UPDATE supplements
SET recommended_dose_json = jsonb_set(
  recommended_dose_json::jsonb,
  '{unit}',
  '"mcg"'::jsonb
)
WHERE id IN (
  '4f02cc51-35eb-4905-abfd-f87961fad7f6',  -- Biotin (Vitamin B7)
  'ca46ea38-635a-4561-aa1b-111c7a5298d6',  -- Folate (Folic Acid / Vitamin B9)
  '53af13f0-f6b0-4dd5-b77f-1804bfd0a98b'   -- Vitamin K
)
AND recommended_dose_json IS NOT NULL
AND (recommended_dose_json::jsonb)->>'unit' = 'mg';

-- ─── 3. Fix ALL Vitamin B12 rows wrongly linked to Thiamine ─────────────────
-- "Vitamin B12" was wrongly linked to Thiamine (a4cac635) across 662+ products
-- because the edge function matched "vitamin b12" as a substring of "vitamin b1".
-- Fixed in code for future scans. This single statement fixes all existing rows.
--
-- If a B12 supplement exists in the catalog it will be linked; otherwise the
-- rows will be unlinked (NULL), which shows "Dose target unavailable" rather
-- than the misleading "Dose unavailable".

UPDATE product_active_ingredients
SET canonical_supplement_id = (
  SELECT id FROM supplements
  WHERE (name ILIKE '%b12%' OR name ILIKE '%cobalamin%')
    AND status = 'approved'
  ORDER BY name
  LIMIT 1
)
WHERE canonical_name ILIKE 'vitamin b12%'
  AND canonical_supplement_id = 'a4cac635-4400-4513-b569-99da3528ba0f';

-- Verify: should return 0 rows after running the UPDATE above
-- SELECT COUNT(*) FROM product_active_ingredients
-- WHERE canonical_name ILIKE 'vitamin b12%'
--   AND canonical_supplement_id = 'a4cac635-4400-4513-b569-99da3528ba0f';

-- ─── 4. Add missing Vitamin E row ──────────────────────────────────────────
-- Vitamin E is absent from product_active_ingredients for this product.
-- Step A: find the Vitamin E supplement ID:
--   SELECT id, name FROM supplements WHERE name ILIKE '%vitamin e%' AND status = 'approved';
--
-- Step B: insert the row (replace values to match the packet):
--
-- INSERT INTO product_active_ingredients
--   (product_id, canonical_supplement_id, canonical_name, ingredient_type,
--    dosage_value, dosage_unit, dosage_original_text, chemical_form, amount_basis)
-- VALUES
--   ('11d42a04-c949-491c-b3a8-7b725bcb6141',
--    '<vitamin_e_supplement_id>',  -- from the SELECT above
--    'Vitamin E',
--    'active',
--    <dose_value>,   -- e.g. 12 (for 12mg)
--    'mg',           -- or 'IU' if the packet uses IU
--    '<original text from packet, e.g. 12mg>',
--    NULL,
--    'per_serving');
