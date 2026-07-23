-- Baseline for the public schema that pre-dated this repository's migration
-- history. Reconstructed from a schema-only, read-only dump of the linked
-- project on 2026-07-22 and deliberately rolled back to the state required
-- immediately before 202605050001.
--
-- Objects introduced by later repository migrations are intentionally absent:
-- account_setup_completions, edge_function_quotas and its RPC,
-- supplement_taxonomy_policies, product image columns, benefit evidence_source,
-- master barcode/verification fields, federated search storage, and all product
-- ranking cache/queue objects.

create table public.barcode_product_seed (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  product_name text,
  brand text,
  category text,
  description text,
  image_url text,
  source_provider text not null,
  raw_json jsonb not null default '{}'::jsonb,
  is_likely_supplement boolean,
  enrichment_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.dsld_products_cache (
  dsld_id bigint primary key,
  product_name text,
  brand_name text,
  barcode_raw text,
  barcode_normalized text,
  market_status text not null default 'unknown',
  serving_size text,
  supplement_form text,
  suggested_use text,
  source_url text,
  raw_json jsonb not null,
  fetched_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.dsld_product_ingredients (
  id bigint generated always as identity primary key,
  dsld_id bigint not null
    references public.dsld_products_cache(dsld_id) on delete cascade,
  ingredient_name text not null,
  ingredient_category text,
  amount_per_serving numeric,
  amount_unit text,
  percent_daily_value numeric,
  daily_value_target_group text,
  serving_size text,
  row_order integer not null,
  raw_json jsonb not null
);

create table public.dsld_product_label_statements (
  id bigint generated always as identity primary key,
  dsld_id bigint not null
    references public.dsld_products_cache(dsld_id) on delete cascade,
  statement_type text,
  statement text not null,
  raw_json jsonb not null
);

create table public.dsld_lookup_attempts (
  id bigint generated always as identity primary key,
  input_barcode text,
  normalized_barcode text,
  input_brand text,
  input_product_name text,
  matched_dsld_id bigint references public.dsld_products_cache(dsld_id),
  confidence text,
  match_reasons text[] not null default '{}'::text[],
  search_path text,
  success boolean not null default false,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.food_exclusion_keywords (
  id bigint generated always as identity primary key,
  keyword text not null,
  keyword_normalized text not null unique,
  match_target text not null check (match_target in ('name', 'ingredients', 'both')),
  exclusion_group text not null,
  is_active boolean default true
);

create table public.off_products (
  id uuid primary key default gen_random_uuid(),
  barcode text,
  name text,
  ingredients text
);

create table public.off_products_ai_classification (
  product_id uuid primary key references public.off_products(id),
  barcode text,
  name text,
  ingredients text,
  content_hash text not null,
  excluded_by_sql boolean default false,
  exclusion_reason text,
  classification_model text,
  classification_prompt_version text,
  is_supplement boolean,
  supplement_confidence numeric,
  supplement_category text,
  should_extract boolean,
  classification_reason text,
  raw_ai_json jsonb,
  batch_id text,
  processed_at timestamptz
);

create table public.off_products_ai_extraction (
  product_id uuid primary key references public.off_products(id),
  content_hash text not null,
  extraction_model text,
  extraction_prompt_version text,
  extraction_status text,
  serving_size_text text,
  notes text,
  raw_ai_json jsonb,
  batch_id text,
  processed_at timestamptz
);

create table public.off_products_ai_naming (
  product_id uuid primary key
    references public.off_products(id) on delete cascade,
  content_hash text not null,
  naming_model text,
  naming_prompt_version text not null,
  batch_id text,
  display_name text,
  brand_name text,
  product_type text,
  form_factor text,
  flavor text,
  confidence double precision,
  notes text,
  raw_ai_json jsonb,
  processed_at timestamptz not null default now()
);

create materialized view public.off_products_non_obvious_food as
select product.id
from public.off_products as product
where not exists (
  select 1
  from public.food_exclusion_keywords as keyword
  where keyword.is_active = true
    and (
      (
        keyword.match_target in ('name', 'both')
        and product.name ilike '%' || keyword.keyword || '%'
      )
      or (
        keyword.match_target in ('ingredients', 'both')
        and product.ingredients ilike '%' || keyword.keyword || '%'
      )
    )
)
with no data;

create unique index off_products_non_obvious_food_id_idx
  on public.off_products_non_obvious_food(id);

create table public.off_products_pipeline_runs (
  id uuid primary key,
  status text not null,
  requested_waves integer not null,
  requested_jobs integer not null,
  classify_limit integer not null,
  naming_limit integer not null,
  extract_limit integer not null,
  alias_limit integer not null,
  classify_pass text not null,
  naming_pass text not null,
  extract_pass text not null,
  start_product_id uuid references public.off_products(id) on delete set null,
  last_completed_product_id uuid references public.off_products(id) on delete set null,
  current_wave_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  blocked_at timestamptz
);

create table public.off_products_pipeline_jobs (
  run_id uuid not null
    references public.off_products_pipeline_runs(id) on delete cascade,
  wave_index integer not null,
  stage text not null check (stage in ('classification', 'naming', 'extraction', 'alias')),
  job_index integer not null,
  status text not null check (
    status in ('planned', 'built', 'submitted', 'ingesting', 'succeeded', 'failed', 'skipped')
  ),
  pass_type text,
  start_product_id uuid references public.off_products(id) on delete set null,
  end_product_id uuid references public.off_products(id) on delete set null,
  row_count integer,
  manifest_path text,
  jsonl_path text,
  input_file_id text,
  batch_id text,
  error_message text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  primary key (run_id, wave_index, stage, job_index)
);

create table public.off_products_pipeline_retry_queue (
  id uuid primary key default gen_random_uuid(),
  source_run_id uuid
    references public.off_products_pipeline_runs(id) on delete set null,
  source_wave_index integer not null,
  source_stage text not null check (
    source_stage in ('classification', 'naming', 'extraction', 'alias')
  ),
  source_job_index integer not null,
  status text not null check (
    status in ('pending', 'running', 'succeeded', 'cancelled')
  ),
  pass_type text,
  start_product_id uuid references public.off_products(id) on delete set null,
  end_product_id uuid references public.off_products(id) on delete set null,
  row_count integer,
  last_batch_id text,
  last_error_message text,
  failure_count integer not null default 1,
  retry_attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  last_retry_at timestamptz,
  resolved_at timestamptz,
  unique (source_run_id, source_wave_index, source_stage, source_job_index)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  name text,
  age integer,
  sex text,
  height_cm numeric,
  weight_kg numeric
);

create table public.supplements (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  what_is_it text,
  why_use_it text,
  risks_and_interactions text,
  evidence text,
  evidence_score integer check (evidence_score between 0 and 100),
  status text,
  how_to_use text,
  recommended_dose_status text not null default 'missing'
    check (recommended_dose_status in ('parsed', 'ambiguous', 'unscorable', 'missing')),
  recommended_dose_json jsonb,
  dose_scoring_profile_json jsonb,
  how_does_it_work text,
  side_effects text,
  who_might_benefit text
);

create table public.supplement_aliases (
  id bigint generated always as identity primary key,
  supplement_id uuid not null references public.supplements(id),
  alias text not null,
  alias_normalized text not null unique,
  alias_type text,
  created_at timestamptz default now(),
  supplement_name text
);

create table public.supplement_benefits (
  id bigint generated by default as identity primary key,
  supplement_id uuid not null
    references public.supplements(id) on delete cascade,
  supplement_name text,
  label text not null,
  icon text,
  score numeric,
  evidence text,
  ranking_reason text,
  unique (supplement_id, label)
);

create table public.supplement_canonical_map (
  id bigint generated always as identity primary key,
  canonical_name text not null,
  normalized_name text not null unique,
  supplement_id uuid not null references public.supplements(id),
  created_at timestamptz default now()
);

create table public.supplement_products_master (
  product_id uuid primary key
    references public.off_products(id) on delete cascade,
  display_name text not null,
  name_source text not null,
  naming_confidence double precision,
  active_ingredients_json jsonb not null default '[]'::jsonb,
  ingredient_count integer not null default 0,
  processed_at timestamptz not null default now(),
  serving_size_text text
);

create table public.product_active_ingredients (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.off_products(id),
  canonical_supplement_id uuid references public.supplements(id),
  raw_name text not null,
  canonical_name text,
  chemical_form text,
  dosage_value numeric,
  dosage_unit text,
  dosage_original_text text,
  amount_basis text,
  ingredient_type text,
  resolution_status text default 'pending',
  resolution_confidence numeric,
  source_model text,
  source_prompt_version text,
  created_at timestamptz default now(),
  display_name text,
  dose_confidence text check (
    dose_confidence in ('verified', 'unverified', 'missing')
  ),
  dose_review_reason text
);

create table public.supplement_catalog_review_candidates (
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
  source_latest_created_at timestamptz,
  review_status text not null default 'pending' check (
    review_status in ('pending', 'approved', 'rejected', 'applied')
  ),
  approved_supplement_id uuid
    references public.supplements(id) on delete set null,
  approved_supplement_name text,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  research_json jsonb
);

create table public.supplement_missing_catalog_candidates (
  normalized_name text primary key,
  display_name text not null,
  occurrence_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.supplement_missing_catalog_occurrences (
  normalized_name text not null,
  product_id uuid not null
    references public.off_products(id) on delete cascade,
  display_name text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1,
  primary key (normalized_name, product_id)
);

create table public.supplement_research_manual_reviews (
  normalized_name text primary key,
  display_name text not null,
  suggested_supplement_name text,
  occurrence_count integer not null default 0,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'resolved', 'ignored')),
  decision text not null default 'manual_review'
    check (decision in ('manual_review', 'failed', 'skipped_product_like')),
  reason text not null default '',
  validation_issues_json jsonb not null default '[]'::jsonb,
  candidate_json jsonb not null default '{}'::jsonb,
  research_json jsonb,
  citations_json jsonb not null default '[]'::jsonb,
  sample_active_ingredients_json jsonb not null default '[]'::jsonb,
  sample_products_json jsonb not null default '[]'::jsonb,
  source_latest_created_at timestamptz,
  linked_supplement_id uuid
    references public.supplements(id) on delete set null,
  linked_supplement_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.supplement_review_queue (
  id bigint generated always as identity primary key,
  product_id uuid references public.off_products(id),
  review_type text not null,
  payload jsonb not null,
  status text default 'pending',
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  supplement_id uuid references public.supplements(id)
);

create table public.retail_supplement_product_staging (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  retailer text,
  brand text,
  product_name text not null,
  barcode text,
  serving_size_text text,
  ingredients_text text,
  active_ingredients_json jsonb not null default '[]'::jsonb,
  raw_product_json jsonb not null default '{}'::jsonb,
  scrape_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_custom_supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  notes text,
  ingredients jsonb,
  serving_size text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  supplement_id uuid
);

create table public.user_supplements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  what_is_it text,
  why_use_it text,
  risks_and_interactions text,
  evidence_summary text,
  created_at timestamptz not null default now(),
  client_id text not null default current_setting(
    'request.header.x-client-id', true
  ),
  custom_supplement_id uuid
    references public.user_custom_supplements(id) on delete cascade,
  constraint user_supplements_one_source_check check (
    custom_supplement_id is null or name is not null
  )
);

create index dsld_lookup_attempts_confidence_idx
  on public.dsld_lookup_attempts(confidence);
create index dsld_lookup_attempts_created_at_idx
  on public.dsld_lookup_attempts(created_at desc);
create index dsld_lookup_attempts_matched_dsld_id_idx
  on public.dsld_lookup_attempts(matched_dsld_id);
create index dsld_product_ingredients_dsld_id_idx
  on public.dsld_product_ingredients(dsld_id);
create index dsld_product_label_statements_dsld_id_idx
  on public.dsld_product_label_statements(dsld_id);
create index dsld_products_cache_barcode_normalized_idx
  on public.dsld_products_cache(barcode_normalized);
create index dsld_products_cache_brand_name_lower_idx
  on public.dsld_products_cache(lower(brand_name));
create index dsld_products_cache_product_name_lower_idx
  on public.dsld_products_cache(lower(product_name));
create index idx_user_custom_supplements_user_id_name
  on public.user_custom_supplements(user_id, name);
create index idx_user_supplements_custom_supplement_id
  on public.user_supplements(custom_supplement_id);
create index off_products_ai_naming_prompt_product_idx
  on public.off_products_ai_naming(naming_prompt_version, product_id);
create index off_products_full_barcode_idx on public.off_products(barcode);
create index off_products_pipeline_jobs_run_wave_stage_status_idx
  on public.off_products_pipeline_jobs(run_id, wave_index, stage, status);
create index off_products_pipeline_jobs_stage_status_idx
  on public.off_products_pipeline_jobs(stage, status);
create index off_products_pipeline_retry_queue_stage_status_idx
  on public.off_products_pipeline_retry_queue(source_stage, status);
create index off_products_pipeline_retry_queue_status_failed_idx
  on public.off_products_pipeline_retry_queue(status, last_failed_at);
create index supplement_catalog_review_candidates_occurrence_idx
  on public.supplement_catalog_review_candidates(
    occurrence_count desc,
    last_seen_at desc
  );
create index supplement_catalog_review_candidates_status_idx
  on public.supplement_catalog_review_candidates(
    review_status,
    suggested_action,
    occurrence_count desc
  );
create index supplement_missing_catalog_occurrences_product_idx
  on public.supplement_missing_catalog_occurrences(product_id);
create index supplement_research_manual_reviews_decision_idx
  on public.supplement_research_manual_reviews(
    decision,
    review_status,
    occurrence_count desc
  );
create index supplement_research_manual_reviews_status_idx
  on public.supplement_research_manual_reviews(
    review_status,
    occurrence_count desc,
    last_seen_at desc
  );
create index supplements_recommended_dose_status_idx
  on public.supplements(recommended_dose_status);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.profiles(id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create function public.set_dsld_cache_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create function public.set_product_active_ingredient_display_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is null then
    select coalesce(naming.display_name, product.name)
    into new.display_name
    from public.off_products as product
    left join public.off_products_ai_naming as naming
      on naming.product_id = product.id
    where product.id = new.product_id;
  end if;
  return new;
end;
$$;

create function public.sync_supplement_alias_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select supplement.name
  into new.supplement_name
  from public.supplements as supplement
  where supplement.id = new.supplement_id;
  return new;
end;
$$;

create trigger set_dsld_products_cache_updated_at
before update on public.dsld_products_cache
for each row execute function public.set_dsld_cache_updated_at();

create trigger supplement_aliases_sync_name
before insert or update of supplement_id on public.supplement_aliases
for each row execute function public.sync_supplement_alias_name();

create trigger trg_set_product_active_ingredient_display_name
before insert or update of product_id, display_name
on public.product_active_ingredients
for each row execute function public.set_product_active_ingredient_display_name();

alter table public.barcode_product_seed enable row level security;
alter table public.chat_usage enable row level security;
alter table public.retail_supplement_product_staging enable row level security;
alter table public.supplement_catalog_review_candidates enable row level security;
alter table public.supplement_research_manual_reviews enable row level security;
alter table public.user_custom_supplements enable row level security;
alter table public.user_supplements enable row level security;

create policy "No client access to barcode seed"
  on public.barcode_product_seed
  using (false)
  with check (false);
create policy "No client access to retail staging"
  on public.retail_supplement_product_staging
  using (false)
  with check (false);
create policy "Users can read their own usage"
  on public.chat_usage
  for select
  using (auth.uid() = user_id);
create policy "Users can view their own custom supplements"
  on public.user_custom_supplements
  for select
  using (auth.uid() = user_id);
create policy "Users can insert their own custom supplements"
  on public.user_custom_supplements
  for insert
  with check (auth.uid() = user_id);
create policy "Users can update their own custom supplements"
  on public.user_custom_supplements
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Users can delete their own custom supplements"
  on public.user_custom_supplements
  for delete
  using (auth.uid() = user_id);
create policy "client can read own user supplements"
  on public.user_supplements
  for select
  to anon, authenticated
  using (client_id = current_setting('request.header.x-client-id', true));
create policy "client can insert own user supplements"
  on public.user_supplements
  for insert
  to anon, authenticated
  with check (
    client_id = current_setting('request.header.x-client-id', true)
  );
create policy "client can update own user supplements"
  on public.user_supplements
  for update
  using (client_id = current_setting('request.header.x-client-id', true))
  with check (
    client_id = current_setting('request.header.x-client-id', true)
  );
create policy "client can delete own user supplements"
  on public.user_supplements
  for delete
  using (client_id = current_setting('request.header.x-client-id', true));

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on function public.handle_new_user() to anon, authenticated, service_role;
grant execute on function public.set_dsld_cache_updated_at() to anon, authenticated, service_role;
grant execute on function public.set_product_active_ingredient_display_name() to anon, authenticated, service_role;
grant execute on function public.sync_supplement_alias_name() to anon, authenticated, service_role;

-- The 202605080002 migration establishes final catalogue RLS policies and
-- removes direct client access to dsld_lookup_attempts. Later lock-down
-- migrations then reduce privileges on the internal pipeline tables.
