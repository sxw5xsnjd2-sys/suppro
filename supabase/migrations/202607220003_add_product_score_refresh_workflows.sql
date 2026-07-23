-- Product score refresh queue mechanics, atomic cache commit, and bounded
-- invalidation triggers. Requires 202607220002_add_product_ranking_cache.sql.
--
-- This migration creates no schedule and performs no backfill. Trigger work is
-- limited to deduplicated queue insertion; score calculation remains in the
-- separately deployed service-role worker.
--
-- Rollback (only after stopping all score workers):
--   1. Drop the four invalidation triggers and their trigger functions.
--   2. Revoke/drop enqueue_product_score_refresh_for_supplement,
--      enqueue_product_score_refresh, claim_product_score_refresh_queue,
--      retry_product_score_refresh, and commit_product_score_refresh.
-- Cache rows from Phase 6 may be retained or cleared separately. Canonical
-- catalogue rows are never replaced by this migration.

create or replace function public.current_product_score_calculation_version()
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select 'recommended-dose-product-ranking.v1'::text
$$;

create or replace function public.enqueue_product_score_refresh(
  p_product_id uuid,
  p_invalidation_reason text,
  p_calculation_version text default public.current_product_score_calculation_version()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_reason text := pg_catalog.btrim(coalesce(p_invalidation_reason, ''));
  v_version text := pg_catalog.btrim(coalesce(p_calculation_version, ''));
  v_queue_id uuid;
begin
  if p_product_id is null
    or nullif(v_reason, '') is null
    or pg_catalog.char_length(v_reason) > 160
    or nullif(v_version, '') is null
    or pg_catalog.char_length(v_version) > 120 then
    raise exception using
      errcode = '22023',
      message = 'invalid product score refresh enqueue request';
  end if;

  -- Ingredient rows may be written before the corresponding master row during
  -- canonical ingestion. The later master INSERT trigger performs the enqueue.
  if not exists (
    select 1
    from public.supplement_products_master as master
    where master.product_id = p_product_id
  ) then
    return null;
  end if;

  insert into public.product_score_refresh_queue (
    product_id,
    calculation_version,
    invalidation_reason,
    status,
    available_at,
    updated_at
  ) values (
    p_product_id,
    v_version,
    v_reason,
    'pending',
    pg_catalog.timezone('utc', pg_catalog.now()),
    pg_catalog.timezone('utc', pg_catalog.now())
  )
  on conflict (product_id, calculation_version)
    where status in ('pending', 'processing', 'retry')
  do update set
    invalidation_reason = excluded.invalidation_reason,
    available_at = case
      when public.product_score_refresh_queue.status = 'processing'
        then excluded.available_at
      else least(
        public.product_score_refresh_queue.available_at,
        excluded.available_at
      )
    end,
    updated_at = excluded.updated_at
  returning id into v_queue_id;

  return v_queue_id;
end;
$$;

create or replace function public.enqueue_product_score_refresh_for_supplement(
  p_supplement_id uuid,
  p_invalidation_reason text,
  p_calculation_version text default public.current_product_score_calculation_version()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_count integer := 0;
begin
  if p_supplement_id is null then
    raise exception using errcode = '22023', message = 'supplement ID is required';
  end if;

  for v_product_id in
    select distinct ingredient.product_id
    from public.product_active_ingredients as ingredient
    inner join public.supplement_products_master as master
      on master.product_id = ingredient.product_id
    where ingredient.canonical_supplement_id = p_supplement_id
  loop
    perform public.enqueue_product_score_refresh(
      v_product_id,
      p_invalidation_reason,
      p_calculation_version
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.claim_product_score_refresh_queue(
  p_limit integer,
  p_worker_id text,
  p_calculation_version text default public.current_product_score_calculation_version()
)
returns table (
  id uuid,
  product_id uuid,
  calculation_version text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_worker_id text := pg_catalog.btrim(coalesce(p_worker_id, ''));
  v_version text := pg_catalog.btrim(coalesce(p_calculation_version, ''));
begin
  if p_limit is null or p_limit < 1 or p_limit > 25
    or nullif(v_worker_id, '') is null
    or pg_catalog.char_length(v_worker_id) > 160
    or nullif(v_version, '') is null
    or pg_catalog.char_length(v_version) > 120 then
    raise exception using errcode = '22023', message = 'invalid queue claim request';
  end if;

  return query
  with candidates as (
    select queue.id
    from public.product_score_refresh_queue as queue
    where queue.calculation_version = v_version
      and (
        (
          queue.status in ('pending', 'retry')
          and queue.available_at <= pg_catalog.timezone('utc', pg_catalog.now())
        )
        or (
          queue.status = 'processing'
          and queue.locked_at <
            pg_catalog.timezone('utc', pg_catalog.now()) - interval '15 minutes'
        )
      )
    order by queue.available_at, queue.created_at, queue.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.product_score_refresh_queue as queue
    set
      status = 'processing',
      attempt_count = queue.attempt_count + 1,
      locked_at = pg_catalog.timezone('utc', pg_catalog.now()),
      locked_by = v_worker_id,
      last_error = null,
      updated_at = pg_catalog.timezone('utc', pg_catalog.now())
    from candidates
    where queue.id = candidates.id
    returning
      queue.id,
      queue.product_id,
      queue.calculation_version,
      queue.attempt_count
  )
  select claimed.id, claimed.product_id, claimed.calculation_version,
    claimed.attempt_count
  from claimed
  order by claimed.id;
end;
$$;

create or replace function public.retry_product_score_refresh(
  p_queue_id uuid,
  p_worker_id text,
  p_error text,
  p_retry_after_seconds integer default 60
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
begin
  if p_queue_id is null
    or nullif(pg_catalog.btrim(coalesce(p_worker_id, '')), '') is null
    or p_retry_after_seconds is null
    or p_retry_after_seconds < 1
    or p_retry_after_seconds > 3600 then
    raise exception using errcode = '22023', message = 'invalid queue retry request';
  end if;

  update public.product_score_refresh_queue as queue
  set
    status = case when queue.attempt_count >= 5 then 'failed' else 'retry' end,
    available_at = pg_catalog.timezone('utc', pg_catalog.now())
      + pg_catalog.make_interval(secs => p_retry_after_seconds),
    locked_at = null,
    locked_by = null,
    last_error = pg_catalog.left(coalesce(p_error, 'refresh failed'), 500),
    updated_at = pg_catalog.timezone('utc', pg_catalog.now())
  where queue.id = p_queue_id
    and queue.status = 'processing'
    and queue.locked_by = pg_catalog.btrim(p_worker_id)
  returning queue.status into v_status;

  if v_status is null then
    raise exception using errcode = '55000', message = 'queue row is not owned by this worker';
  end if;
  return v_status;
end;
$$;

create or replace function public.commit_product_score_refresh(
  p_product_id uuid,
  p_calculation_version text,
  p_calculated_at timestamptz,
  p_overall_evidence_score numeric,
  p_benefit_rows jsonb,
  p_queue_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_version text := pg_catalog.btrim(coalesce(p_calculation_version, ''));
  v_benefit_count integer;
begin
  if p_product_id is null
    or nullif(v_version, '') is null
    or pg_catalog.char_length(v_version) > 120
    or p_calculated_at is null
    or (p_overall_evidence_score is not null and p_overall_evidence_score not between 0 and 100)
    or p_benefit_rows is null
    or pg_catalog.jsonb_typeof(p_benefit_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid product score commit request';
  end if;

  v_benefit_count := pg_catalog.jsonb_array_length(p_benefit_rows);
  if v_benefit_count > 200 then
    raise exception using errcode = '22023', message = 'benefit row limit exceeded';
  end if;

  if not exists (
    select 1 from public.supplement_products_master as master
    where master.product_id = p_product_id
  ) then
    raise exception using errcode = '23503', message = 'canonical product does not exist';
  end if;

  update public.supplement_products_master as master
  set
    overall_evidence_score = p_overall_evidence_score,
    overall_evidence_calculation_version = case
      when p_overall_evidence_score is null then null else v_version end,
    overall_evidence_calculated_at = case
      when p_overall_evidence_score is null then null else p_calculated_at end
  where master.product_id = p_product_id;

  delete from public.product_benefit_scores as existing
  where existing.product_id = p_product_id
    and (
      existing.calculation_version <> v_version
      or not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_benefit_rows) as incoming(value)
        where pg_catalog.lower(
          pg_catalog.regexp_replace(
            pg_catalog.btrim(incoming.value ->> 'benefit_label'),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ) = existing.benefit_key
      )
    );

  insert into public.product_benefit_scores (
    product_id,
    benefit_label,
    product_benefit_score,
    driver_canonical_ingredient_id,
    driver_ingredient_name,
    raw_active_ingredient_benefit_score,
    validated_dose_factor,
    dose_comparison_status,
    calculation_version,
    calculated_at,
    updated_at
  )
  select
    p_product_id,
    incoming.value ->> 'benefit_label',
    (incoming.value ->> 'product_benefit_score')::numeric,
    (incoming.value ->> 'driver_canonical_ingredient_id')::uuid,
    incoming.value ->> 'driver_ingredient_name',
    (incoming.value ->> 'raw_active_ingredient_benefit_score')::numeric,
    (incoming.value ->> 'validated_dose_factor')::numeric,
    incoming.value ->> 'dose_comparison_status',
    v_version,
    p_calculated_at,
    pg_catalog.timezone('utc', pg_catalog.now())
  from pg_catalog.jsonb_array_elements(p_benefit_rows) as incoming(value)
  on conflict (product_id, benefit_key, calculation_version)
  do update set
    benefit_label = excluded.benefit_label,
    product_benefit_score = excluded.product_benefit_score,
    driver_canonical_ingredient_id = excluded.driver_canonical_ingredient_id,
    driver_ingredient_name = excluded.driver_ingredient_name,
    raw_active_ingredient_benefit_score = excluded.raw_active_ingredient_benefit_score,
    validated_dose_factor = excluded.validated_dose_factor,
    dose_comparison_status = excluded.dose_comparison_status,
    calculated_at = excluded.calculated_at,
    updated_at = excluded.updated_at;

  if p_queue_id is not null then
    update public.product_score_refresh_queue as queue
    set
      status = case
        when queue.updated_at > queue.locked_at then 'pending'
        else 'completed'
      end,
      locked_at = null,
      locked_by = null,
      last_error = null,
      updated_at = pg_catalog.timezone('utc', pg_catalog.now())
    where queue.id = p_queue_id
      and queue.product_id = p_product_id
      and queue.calculation_version = v_version
      and queue.status = 'processing';

    if not found then
      raise exception using errcode = '55000', message = 'queue completion state is invalid';
    end if;
  end if;
end;
$$;

create or replace function public.queue_product_scores_for_benefit_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_product_score_refresh_for_supplement(
      new.supplement_id,
      'supplement_benefits_changed'
    );
  elsif tg_op = 'DELETE' then
    perform public.enqueue_product_score_refresh_for_supplement(
      old.supplement_id,
      'supplement_benefits_changed'
    );
  else
    perform public.enqueue_product_score_refresh_for_supplement(
      new.supplement_id,
      'supplement_benefits_changed'
    );
    if old.supplement_id is distinct from new.supplement_id then
      perform public.enqueue_product_score_refresh_for_supplement(
        old.supplement_id,
        'supplement_benefits_changed'
      );
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.queue_product_scores_for_supplement_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.enqueue_product_score_refresh_for_supplement(
    new.id,
    'supplement_scoring_profile_changed'
  );
  return null;
end;
$$;

create or replace function public.queue_product_scores_for_ingredient_link_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_product_score_refresh(new.product_id, 'product_ingredient_link_changed');
  elsif tg_op = 'DELETE' then
    perform public.enqueue_product_score_refresh(old.product_id, 'product_ingredient_link_changed');
  else
    perform public.enqueue_product_score_refresh(new.product_id, 'product_ingredient_link_changed');
    if old.product_id is distinct from new.product_id then
      perform public.enqueue_product_score_refresh(old.product_id, 'product_ingredient_link_changed');
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.queue_product_scores_for_master_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_product_score_refresh(new.product_id, 'product_master_changed');
  elsif old.verification_status is distinct from new.verification_status
    or old.serving_size_text is distinct from new.serving_size_text then
    perform public.enqueue_product_score_refresh(new.product_id, 'product_master_changed');
  end if;
  return null;
end;
$$;

drop trigger if exists supplement_benefits_product_score_invalidation
  on public.supplement_benefits;
create trigger supplement_benefits_product_score_invalidation
after insert or update or delete on public.supplement_benefits
for each row execute function public.queue_product_scores_for_benefit_change();

drop trigger if exists supplements_product_score_invalidation
  on public.supplements;
create trigger supplements_product_score_invalidation
after update of evidence_score, how_to_use, recommended_dose_json,
  dose_scoring_profile_json on public.supplements
for each row execute function public.queue_product_scores_for_supplement_change();

drop trigger if exists product_active_ingredients_score_invalidation
  on public.product_active_ingredients;
create trigger product_active_ingredients_score_invalidation
after insert or update or delete on public.product_active_ingredients
for each row execute function public.queue_product_scores_for_ingredient_link_change();

drop trigger if exists supplement_products_master_score_invalidation
  on public.supplement_products_master;
create trigger supplement_products_master_score_invalidation
after insert or update on public.supplement_products_master
for each row execute function public.queue_product_scores_for_master_change();

revoke all on function public.current_product_score_calculation_version()
  from public, anon, authenticated;
revoke all on function public.enqueue_product_score_refresh(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_product_score_refresh_for_supplement(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_product_score_refresh_queue(integer, text, text)
  from public, anon, authenticated;
revoke all on function public.retry_product_score_refresh(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.commit_product_score_refresh(uuid, text, timestamptz, numeric, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.queue_product_scores_for_benefit_change()
  from public, anon, authenticated;
revoke all on function public.queue_product_scores_for_supplement_change()
  from public, anon, authenticated;
revoke all on function public.queue_product_scores_for_ingredient_link_change()
  from public, anon, authenticated;
revoke all on function public.queue_product_scores_for_master_change()
  from public, anon, authenticated;

grant execute on function public.current_product_score_calculation_version()
  to service_role;
grant execute on function public.enqueue_product_score_refresh(uuid, text, text)
  to service_role;
grant execute on function public.enqueue_product_score_refresh_for_supplement(uuid, text, text)
  to service_role;
grant execute on function public.claim_product_score_refresh_queue(integer, text, text)
  to service_role;
grant execute on function public.retry_product_score_refresh(uuid, text, text, integer)
  to service_role;
grant execute on function public.commit_product_score_refresh(uuid, text, timestamptz, numeric, jsonb, uuid)
  to service_role;
