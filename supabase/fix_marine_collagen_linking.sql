-- Link Marine Collagen to the Collagen Peptides (Hydrolyzed Collagen) row.
-- Run in the Supabase SQL Editor.

-- ─── Step 1: confirm the collagen supplement row ───────────────────────────
SELECT id, name
FROM supplements
WHERE name ILIKE '%collagen%'
ORDER BY name;

-- ─── Step 2: add aliases for future scans ──────────────────────────────────
-- Safe to re-run; ON CONFLICT DO NOTHING prevents duplicate inserts.

INSERT INTO supplement_aliases (supplement_id, alias, alias_normalized)
SELECT id, unnest(ARRAY[
  'Collagen',
  'Collagen Peptides',
  'Hydrolyzed Collagen',
  'Hydrolysed Collagen',
  'Marine Collagen'
]) AS alias,
unnest(ARRAY[
  'collagen',
  'collagen peptides',
  'hydrolyzed collagen',
  'hydrolysed collagen',
  'marine collagen'
]) AS alias_normalized
FROM supplements
WHERE name = 'Collagen Peptides (Hydrolyzed Collagen)'
  AND status = 'approved'
LIMIT 1
ON CONFLICT DO NOTHING;

-- ─── Step 3: relink existing product_active_ingredients rows ───────────────
-- This updates already-scanned products where Marine Collagen is currently
-- unlinked, and also keeps collagen naming variants consistent.

UPDATE product_active_ingredients
SET canonical_supplement_id = (
  SELECT id
  FROM supplements
  WHERE name = 'Collagen Peptides (Hydrolyzed Collagen)'
    AND status = 'approved'
  LIMIT 1
)
WHERE canonical_name ILIKE ANY (ARRAY[
  'collagen',
  'marine collagen',
  'collagen peptides',
  'hydrolyzed collagen',
  'hydrolysed collagen'
]);

-- ─── Verify ────────────────────────────────────────────────────────────────
-- SELECT s.name, sa.alias, sa.alias_normalized
-- FROM supplement_aliases sa
-- JOIN supplements s ON s.id = sa.supplement_id
-- WHERE s.name = 'Collagen Peptides (Hydrolyzed Collagen)'
-- ORDER BY sa.alias_normalized;
--
-- SELECT canonical_name, canonical_supplement_id, COUNT(*)
-- FROM product_active_ingredients
-- WHERE canonical_name ILIKE ANY (ARRAY[
--   'collagen',
--   'marine collagen',
--   'collagen peptides',
--   'hydrolyzed collagen',
--   'hydrolysed collagen'
-- ])
-- GROUP BY canonical_name, canonical_supplement_id
-- ORDER BY canonical_name, canonical_supplement_id;
