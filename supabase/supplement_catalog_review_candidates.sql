create table if not exists supplement_catalog_review_candidates (
  normalized_name text primary key,
  display_name text not null,
  occurrence_count integer not null default 0,
  sample_active_ingredients_json jsonb not null default '[]'::jsonb,
  sample_products_json jsonb not null default '[]'::jsonb,
  suggested_action text not null check (
    suggested_action in ('create_canonical', 'ignore', 'manual_review')
  ),
  suggested_supplement_name text,
  suggestion_confidence double precision,
  suggestion_reason text not null default '',
  research_json jsonb,
  source_latest_created_at timestamptz,
  review_status text not null default 'pending' check (
    review_status in ('pending', 'approved', 'rejected', 'applied')
  ),
  approved_supplement_id uuid references supplements (id) on delete set null,
  approved_supplement_name text,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists supplement_catalog_review_candidates_status_idx
on supplement_catalog_review_candidates (review_status, suggested_action, occurrence_count desc);

create index if not exists supplement_catalog_review_candidates_occurrence_idx
on supplement_catalog_review_candidates (occurrence_count desc, last_seen_at desc);
