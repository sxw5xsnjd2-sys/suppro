create table if not exists off_products_pipeline_runs (
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
  start_product_id uuid references off_products (id) on delete set null,
  last_completed_product_id uuid references off_products (id) on delete set null,
  current_wave_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  blocked_at timestamptz
);

create table if not exists off_products_pipeline_jobs (
  run_id uuid not null references off_products_pipeline_runs (id) on delete cascade,
  wave_index integer not null,
  stage text not null check (stage in ('classification', 'naming', 'extraction', 'alias')),
  job_index integer not null,
  status text not null check (status in ('planned', 'built', 'submitted', 'ingesting', 'succeeded', 'failed', 'skipped')),
  pass_type text,
  start_product_id uuid references off_products (id) on delete set null,
  end_product_id uuid references off_products (id) on delete set null,
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

create index if not exists off_products_pipeline_jobs_run_wave_stage_status_idx
on off_products_pipeline_jobs (run_id, wave_index, stage, status);

create index if not exists off_products_pipeline_jobs_stage_status_idx
on off_products_pipeline_jobs (stage, status);

create table if not exists off_products_pipeline_retry_queue (
  id uuid primary key default gen_random_uuid(),
  source_run_id uuid references off_products_pipeline_runs (id) on delete set null,
  source_wave_index integer not null,
  source_stage text not null check (source_stage in ('classification', 'naming', 'extraction', 'alias')),
  source_job_index integer not null,
  status text not null check (status in ('pending', 'running', 'succeeded', 'cancelled')),
  pass_type text,
  start_product_id uuid references off_products (id) on delete set null,
  end_product_id uuid references off_products (id) on delete set null,
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

create index if not exists off_products_pipeline_retry_queue_status_failed_idx
on off_products_pipeline_retry_queue (status, last_failed_at);

create index if not exists off_products_pipeline_retry_queue_stage_status_idx
on off_products_pipeline_retry_queue (source_stage, status);

create table if not exists supplement_missing_catalog_occurrences (
  normalized_name text not null,
  product_id uuid not null references off_products (id) on delete cascade,
  display_name text not null,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (normalized_name, product_id)
);

create index if not exists supplement_missing_catalog_occurrences_product_idx
on supplement_missing_catalog_occurrences (product_id);
