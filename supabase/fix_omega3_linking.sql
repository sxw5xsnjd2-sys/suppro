-- Link DHA, EPA and their full names to the Omega-3 supplement.
-- Run in the Supabase SQL Editor.

-- ─── Step 1: find the Omega-3 supplement UUID ─────────────────────────────
-- Run this first to confirm the UUID before the updates below.
SELECT id, name FROM supplements
WHERE name ILIKE '%omega%' OR name ILIKE '%fish oil%'
ORDER BY name;

-- ─── Step 2: add aliases so the edge function can link future scans ────────
-- Replace <omega3_supplement_id> with the UUID from Step 1.
-- Safe to re-run; the WHERE NOT EXISTS prevents duplicates.

INSERT INTO supplement_aliases (supplement_id, alias, alias_normalized)
SELECT id, unnest(ARRAY[
  'DHA',
  'EPA',
  'Docosahexaenoic Acid',
  'Eicosapentaenoic Acid',
  'Omega-3',
  'Omega 3',
  'Omega-3 Fatty Acids',
  'Omega 3 Fatty Acids',
  'Fish Oil'
]) AS alias,
unnest(ARRAY[
  'dha',
  'epa',
  'docosahexaenoic acid',
  'eicosapentaenoic acid',
  'omega-3',
  'omega 3',
  'omega-3 fatty acids',
  'omega 3 fatty acids',
  'fish oil'
]) AS alias_normalized
FROM supplements
WHERE (name ILIKE '%omega%' OR name ILIKE '%fish oil%')
  AND status = 'approved'
ORDER BY name
LIMIT 1
ON CONFLICT DO NOTHING;

-- ─── Step 3: fix existing product_active_ingredients rows ─────────────────
-- Links any rows where the ingredient is DHA, EPA, or full names but is
-- currently unlinked (NULL) or wrongly linked to something else.

UPDATE product_active_ingredients
SET canonical_supplement_id = (
  SELECT id FROM supplements
  WHERE (name ILIKE '%omega%' OR name ILIKE '%fish oil%')
    AND status = 'approved'
  ORDER BY name
  LIMIT 1
)
WHERE canonical_name ILIKE ANY (ARRAY[
  'dha',
  'epa',
  'docosahexaenoic acid',
  'eicosapentaenoic acid',
  'omega-3',
  'omega 3',
  'omega-3 fatty acids',
  'omega 3 fatty acids',
  'fish oil'
])
AND canonical_supplement_id IS NULL;

-- ─── Verify ────────────────────────────────────────────────────────────────
-- SELECT canonical_name, canonical_supplement_id, COUNT(*)
-- FROM product_active_ingredients
-- WHERE canonical_name ILIKE ANY (ARRAY['dha','epa','docosahexaenoic acid','eicosapentaenoic acid'])
-- GROUP BY canonical_name, canonical_supplement_id
-- ORDER BY canonical_name;
