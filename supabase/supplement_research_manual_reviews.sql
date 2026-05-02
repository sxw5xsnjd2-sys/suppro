create table if not exists supplement_research_manual_reviews (
  normalized_name text primary key,
  display_name text not null,
  suggested_supplement_name text,
  occurrence_count integer not null default 0,
  review_status text not null default 'pending' check (
    review_status in ('pending', 'resolved', 'ignored')
  ),
  decision text not null default 'manual_review' check (
    decision in ('manual_review', 'failed', 'skipped_product_like')
  ),
  reason text not null default '',
  validation_issues_json jsonb not null default '[]'::jsonb,
  candidate_json jsonb not null default '{}'::jsonb,
  research_json jsonb,
  citations_json jsonb not null default '[]'::jsonb,
  sample_active_ingredients_json jsonb not null default '[]'::jsonb,
  sample_products_json jsonb not null default '[]'::jsonb,
  source_latest_created_at timestamptz,
  linked_supplement_id uuid references supplements (id) on delete set null,
  linked_supplement_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists supplement_research_manual_reviews_status_idx
on supplement_research_manual_reviews (review_status, occurrence_count desc, last_seen_at desc);

create index if not exists supplement_research_manual_reviews_decision_idx
on supplement_research_manual_reviews (decision, review_status, occurrence_count desc);
