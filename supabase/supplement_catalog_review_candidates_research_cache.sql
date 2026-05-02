alter table if exists supplement_catalog_review_candidates
add column if not exists research_json jsonb;
