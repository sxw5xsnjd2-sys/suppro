-- Server-side product ranking cache and bounded public read contracts.
--
-- Verified against the linked public schema on 2026-07-22:
--   supplement_products_master.product_id: uuid primary key, FK off_products.id
--   supplements.id: uuid primary key
--   product_active_ingredients.id: bigint primary key
--   product_active_ingredients.product_id: uuid, FK off_products.id
--   product_active_ingredients.canonical_supplement_id: uuid, FK supplements.id
--   supplement_benefits.id: bigint primary key
--   supplement_benefits.supplement_id: uuid, FK supplements.id
--   supplement_benefits.label: required text; supplement_benefits.score: numeric
--   off_products_ai_naming.product_id: uuid, canonical product key
--   off_products_ai_naming.brand_name: nullable text canonical brand
--
-- The master product table already uses additive nullable enrichment columns.
-- These nullable overall-evidence columns therefore avoid a table rewrite and
-- keep overall product evidence distinct from benefit-specific product scores.
-- No rows are populated and no refresh triggers are installed by this migration.
--
-- Rollback (only while no later writer depends on these contracts):
--   1. Revoke and drop get_product_benefit_rankings(text, text, integer,
--      numeric, numeric, integer, text, uuid) and
--      get_product_score_snapshots(uuid[]).
--   2. Drop product_score_refresh_queue, then product_benefit_scores.
--   3. Drop the three supplement_products_master ranking/evidence indexes.
--   4. Drop supplement_products_master_overall_evidence_check, then the three
--      overall_evidence_* columns.
-- This removes cache data only; canonical catalogue/product rows are untouched.

alter table public.supplement_products_master
  add column if not exists overall_evidence_score numeric,
  add column if not exists overall_evidence_calculation_version text,
  add column if not exists overall_evidence_calculated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'supplement_products_master_overall_evidence_check'
      and conrelid = 'public.supplement_products_master'::regclass
  ) then
    alter table public.supplement_products_master
      add constraint supplement_products_master_overall_evidence_check
      check (
        (
          overall_evidence_score is null
          and overall_evidence_calculation_version is null
          and overall_evidence_calculated_at is null
        )
        or (
          overall_evidence_score between 0 and 100
          and nullif(pg_catalog.btrim(overall_evidence_calculation_version), '') is not null
          and pg_catalog.char_length(overall_evidence_calculation_version) <= 120
          and overall_evidence_calculated_at is not null
        )
      ) not valid;
  end if;
end
$$;

alter table public.supplement_products_master
  validate constraint supplement_products_master_overall_evidence_check;

create table public.product_benefit_scores (
  product_id uuid not null
    references public.supplement_products_master(product_id) on delete cascade,
  benefit_label text not null,
  benefit_key text generated always as (
    pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(benefit_label),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  ) stored,
  product_benefit_score numeric not null,
  driver_canonical_ingredient_id uuid not null
    references public.supplements(id) on delete cascade,
  driver_ingredient_name text not null,
  driver_ingredient_name_key text generated always as (
    pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(driver_ingredient_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  ) stored,
  raw_active_ingredient_benefit_score numeric not null,
  validated_dose_factor numeric not null,
  dose_comparison_status text not null,
  calculation_version text not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  primary key (product_id, benefit_key, calculation_version),
  constraint product_benefit_scores_benefit_label_check check (
    nullif(pg_catalog.btrim(benefit_label), '') is not null
    and pg_catalog.char_length(benefit_label) <= 160
  ),
  constraint product_benefit_scores_score_check check (
    product_benefit_score between 0 and 100
  ),
  constraint product_benefit_scores_driver_name_check check (
    nullif(pg_catalog.btrim(driver_ingredient_name), '') is not null
    and pg_catalog.char_length(driver_ingredient_name) <= 240
  ),
  constraint product_benefit_scores_raw_score_check check (
    raw_active_ingredient_benefit_score between 0 and 100
  ),
  constraint product_benefit_scores_validated_factor_check check (
    validated_dose_factor between 0 and 1
  ),
  constraint product_benefit_scores_comparison_status_check check (
    dose_comparison_status in (
      'above_target_range',
      'below_effective_min',
      'effective_below_target',
      'severely_underdosed',
      'within_target_range'
    )
  ),
  constraint product_benefit_scores_calculation_version_check check (
    nullif(pg_catalog.btrim(calculation_version), '') is not null
    and pg_catalog.char_length(calculation_version) <= 120
  )
);

comment on table public.product_benefit_scores is
  'Versioned full-precision canonical product-benefit scores. Server-written; read through bounded RPCs.';
comment on column public.product_benefit_scores.product_benefit_score is
  'Canonical product-benefit score. Distinct from supplement_products_master.overall_evidence_score.';
comment on column public.product_benefit_scores.raw_active_ingredient_benefit_score is
  'Winning driver active-ingredient benefit score before the validated dose factor.';
comment on column public.product_benefit_scores.validated_dose_factor is
  'Dose factor only from a genuinely comparable dose result.';

create index product_benefit_scores_benefit_rank_idx
  on public.product_benefit_scores (
    benefit_key collate "C",
    calculation_version collate "C",
    product_benefit_score desc,
    raw_active_ingredient_benefit_score desc,
    validated_dose_factor desc,
    driver_ingredient_name_key collate "C",
    driver_canonical_ingredient_id,
    product_id
  );

create index product_benefit_scores_product_idx
  on public.product_benefit_scores (product_id, calculation_version);

create index supplement_products_master_ranking_ties_idx
  on public.supplement_products_master (
    (coalesce(overall_evidence_score, '-1'::numeric)) desc,
    (
      case verification_status
        when 'verified' then 100
        when 'photo_verified' then 90
        when 'dsld_verified' then 80
        else 0
      end
    ) desc,
    (
      pg_catalog.lower(
        pg_catalog.regexp_replace(
          pg_catalog.btrim(display_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ) collate "C"
    ),
    product_id
  )
  where verification_status in ('verified', 'photo_verified', 'dsld_verified');

create index supplement_products_master_overall_evidence_version_idx
  on public.supplement_products_master (
    overall_evidence_calculation_version,
    product_id
  )
  where overall_evidence_score is not null;

create table public.product_score_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.supplement_products_master(product_id) on delete cascade,
  calculation_version text not null,
  invalidation_reason text not null,
  status text not null default 'pending',
  available_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  attempt_count integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint product_score_refresh_queue_version_check check (
    nullif(pg_catalog.btrim(calculation_version), '') is not null
    and pg_catalog.char_length(calculation_version) <= 120
  ),
  constraint product_score_refresh_queue_reason_check check (
    nullif(pg_catalog.btrim(invalidation_reason), '') is not null
    and pg_catalog.char_length(invalidation_reason) <= 160
  ),
  constraint product_score_refresh_queue_status_check check (
    status in ('pending', 'processing', 'retry', 'completed', 'failed')
  ),
  constraint product_score_refresh_queue_attempt_count_check check (
    attempt_count >= 0
  )
);

comment on table public.product_score_refresh_queue is
  'Bounded invalidation work queue schema only. Phase 7 will add controlled enqueue/worker behavior.';

create unique index product_score_refresh_queue_active_dedupe_idx
  on public.product_score_refresh_queue (product_id, calculation_version)
  where status in ('pending', 'processing', 'retry');

create index product_score_refresh_queue_ready_idx
  on public.product_score_refresh_queue (available_at, created_at, id)
  where status in ('pending', 'retry');

alter table public.product_benefit_scores enable row level security;
alter table public.product_score_refresh_queue enable row level security;

revoke all on table public.product_benefit_scores
  from public, anon, authenticated;
revoke all on table public.product_score_refresh_queue
  from public, anon, authenticated;
grant all on table public.product_benefit_scores to service_role;
grant all on table public.product_score_refresh_queue to service_role;

-- Existing catalogue policy is SELECT-only. Explicitly keep all master score
-- cache mutation paths unavailable to clients while preserving catalogue reads.
revoke insert, update, delete, truncate, references, trigger
  on table public.supplement_products_master
  from public, anon, authenticated;
grant update (
  overall_evidence_score,
  overall_evidence_calculation_version,
  overall_evidence_calculated_at
) on table public.supplement_products_master to service_role;

create or replace function public.get_product_benefit_rankings(
  p_benefit_key text,
  p_calculation_version text,
  p_limit integer default 25,
  p_after_product_benefit_score numeric default null,
  p_after_overall_evidence_sort_score numeric default null,
  p_after_verification_precedence integer default null,
  p_after_normalized_product_name text default null,
  p_after_product_id uuid default null
)
returns table (
  product_id uuid,
  product_name text,
  product_brand text,
  product_image_url text,
  normalized_product_name text,
  verification_status text,
  verification_precedence integer,
  benefit_label text,
  benefit_key text,
  product_benefit_score numeric,
  overall_evidence_score numeric,
  overall_evidence_sort_score numeric,
  overall_evidence_calculation_version text,
  overall_evidence_calculated_at timestamptz,
  driver_canonical_ingredient_id uuid,
  driver_ingredient_name text,
  raw_active_ingredient_benefit_score numeric,
  validated_dose_factor numeric,
  dose_comparison_status text,
  calculation_version text,
  calculated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_benefit_key text := pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(p_benefit_key, '')),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
  v_calculation_version text := pg_catalog.btrim(
    coalesce(p_calculation_version, '')
  );
  v_cursor_field_count integer := pg_catalog.num_nonnulls(
    p_after_product_benefit_score,
    p_after_overall_evidence_sort_score,
    p_after_verification_precedence,
    p_after_normalized_product_name,
    p_after_product_id
  );
begin
  if nullif(v_benefit_key, '') is null
    or pg_catalog.char_length(v_benefit_key) > 160 then
    raise exception using
      errcode = '22023',
      message = 'benefit key must contain between 1 and 160 characters';
  end if;

  if nullif(v_calculation_version, '') is null
    or pg_catalog.char_length(v_calculation_version) > 120 then
    raise exception using
      errcode = '22023',
      message = 'calculation version must contain between 1 and 120 characters';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using
      errcode = '22023',
      message = 'limit must be between 1 and 100';
  end if;

  if v_cursor_field_count not in (0, 5) then
    raise exception using
      errcode = '22023',
      message = 'all keyset cursor fields must be supplied together';
  end if;

  if v_cursor_field_count = 5 and (
    p_after_product_benefit_score not between 0 and 100
    or p_after_overall_evidence_sort_score not between -1 and 100
    or p_after_verification_precedence not in (80, 90, 100)
    or nullif(p_after_normalized_product_name, '') is null
    or pg_catalog.char_length(p_after_normalized_product_name) > 300
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid keyset cursor';
  end if;

  return query
  with rankable as (
    select
      master.product_id,
      master.display_name as product_name,
      nullif(pg_catalog.btrim(naming.brand_name), '') as product_brand,
      coalesce(
        nullif(pg_catalog.btrim(master.image_thumbnail_url), ''),
        nullif(pg_catalog.btrim(master.image_url), '')
      ) as product_image_url,
      pg_catalog.lower(
        pg_catalog.regexp_replace(
          pg_catalog.btrim(master.display_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ) collate "C" as normalized_product_name,
      master.verification_status,
      case master.verification_status
        when 'verified' then 100
        when 'photo_verified' then 90
        when 'dsld_verified' then 80
      end as verification_precedence,
      score.benefit_label,
      score.benefit_key,
      score.product_benefit_score,
      master.overall_evidence_score,
      coalesce(master.overall_evidence_score, '-1'::numeric)
        as overall_evidence_sort_score,
      master.overall_evidence_calculation_version,
      master.overall_evidence_calculated_at,
      score.driver_canonical_ingredient_id,
      score.driver_ingredient_name,
      score.raw_active_ingredient_benefit_score,
      score.validated_dose_factor,
      score.dose_comparison_status,
      score.calculation_version,
      score.calculated_at
    from public.product_benefit_scores as score
    inner join public.supplement_products_master as master
      on master.product_id = score.product_id
    left join public.off_products_ai_naming as naming
      on naming.product_id = master.product_id
    where score.benefit_key = v_benefit_key
      and score.calculation_version = v_calculation_version
      and score.product_benefit_score is not null
      and master.verification_status in (
        'verified',
        'photo_verified',
        'dsld_verified'
      )
  )
  select
    ranked.product_id,
    ranked.product_name,
    ranked.product_brand,
    ranked.product_image_url,
    ranked.normalized_product_name,
    ranked.verification_status,
    ranked.verification_precedence,
    ranked.benefit_label,
    ranked.benefit_key,
    ranked.product_benefit_score,
    ranked.overall_evidence_score,
    ranked.overall_evidence_sort_score,
    ranked.overall_evidence_calculation_version,
    ranked.overall_evidence_calculated_at,
    ranked.driver_canonical_ingredient_id,
    ranked.driver_ingredient_name,
    ranked.raw_active_ingredient_benefit_score,
    ranked.validated_dose_factor,
    ranked.dose_comparison_status,
    ranked.calculation_version,
    ranked.calculated_at
  from rankable as ranked
  where v_cursor_field_count = 0
    or ranked.product_benefit_score < p_after_product_benefit_score
    or (
      ranked.product_benefit_score = p_after_product_benefit_score
      and ranked.overall_evidence_sort_score
        < p_after_overall_evidence_sort_score
    )
    or (
      ranked.product_benefit_score = p_after_product_benefit_score
      and ranked.overall_evidence_sort_score
        = p_after_overall_evidence_sort_score
      and ranked.verification_precedence < p_after_verification_precedence
    )
    or (
      ranked.product_benefit_score = p_after_product_benefit_score
      and ranked.overall_evidence_sort_score
        = p_after_overall_evidence_sort_score
      and ranked.verification_precedence = p_after_verification_precedence
      and ranked.normalized_product_name
        > p_after_normalized_product_name collate "C"
    )
    or (
      ranked.product_benefit_score = p_after_product_benefit_score
      and ranked.overall_evidence_sort_score
        = p_after_overall_evidence_sort_score
      and ranked.verification_precedence = p_after_verification_precedence
      and ranked.normalized_product_name
        = p_after_normalized_product_name collate "C"
      and ranked.product_id > p_after_product_id
    )
  order by
    ranked.product_benefit_score desc,
    ranked.overall_evidence_sort_score desc,
    ranked.verification_precedence desc,
    ranked.normalized_product_name collate "C" asc,
    ranked.product_id asc
  limit p_limit;
end;
$$;

comment on function public.get_product_benefit_rankings(
  text,
  text,
  integer,
  numeric,
  numeric,
  integer,
  text,
  uuid
) is
  'Bounded keyset product rankings with canonical product brand and image. SECURITY DEFINER is limited to fixed SQL over server-only cache tables.';

create or replace function public.get_product_score_snapshots(
  p_product_ids uuid[]
)
returns table (
  product_id uuid,
  score numeric,
  calculated_at timestamptz,
  calculation_version text,
  verification_status text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
begin
  if p_product_ids is null
    or pg_catalog.cardinality(p_product_ids) < 1
    or pg_catalog.cardinality(p_product_ids) > 50
    or pg_catalog.array_position(p_product_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'product_ids must contain between 1 and 50 non-null UUIDs';
  end if;

  return query
  select
    master.product_id,
    master.overall_evidence_score as score,
    master.overall_evidence_calculated_at as calculated_at,
    master.overall_evidence_calculation_version as calculation_version,
    master.verification_status
  from public.supplement_products_master as master
  where master.product_id = any(p_product_ids)
  order by master.product_id;
end;
$$;

comment on function public.get_product_score_snapshots(uuid[]) is
  'Bounded overall-evidence snapshots for local Search history reconciliation. Null score means not rated.';

revoke all on function public.get_product_benefit_rankings(
  text,
  text,
  integer,
  numeric,
  numeric,
  integer,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function public.get_product_score_snapshots(uuid[])
  from public, anon, authenticated;

grant execute on function public.get_product_benefit_rankings(
  text,
  text,
  integer,
  numeric,
  numeric,
  integer,
  text,
  uuid
) to anon, authenticated, service_role;
grant execute on function public.get_product_score_snapshots(uuid[])
  to anon, authenticated, service_role;
