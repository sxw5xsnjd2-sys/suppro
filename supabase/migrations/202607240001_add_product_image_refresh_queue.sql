-- Generic, service-owned product image enrichment queue.
-- Images remain stored only on supplement_products_master; this table tracks
-- bounded background work and global provider usage.

create table public.product_image_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.supplement_products_master(product_id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  last_outcome text,
  attempted_on date,
  daily_attempt_count integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint product_image_refresh_queue_status_check check (
    status in ('pending', 'processing', 'retry', 'completed', 'failed')
  ),
  constraint product_image_refresh_queue_attempt_count_check check (
    attempt_count >= 0 and daily_attempt_count >= 0
  )
);

comment on table public.product_image_refresh_queue is
  'Generic deduplicated work queue for shared canonical product image enrichment. No image data is stored here.';

create unique index product_image_refresh_queue_active_dedupe_idx
  on public.product_image_refresh_queue (product_id)
  where status in ('pending', 'processing', 'retry');

create index product_image_refresh_queue_ready_idx
  on public.product_image_refresh_queue (available_at, created_at, id)
  where status in ('pending', 'retry');

alter table public.product_image_refresh_queue enable row level security;
revoke all on table public.product_image_refresh_queue
  from public, anon, authenticated;
grant all on table public.product_image_refresh_queue to service_role;

create or replace function public.enqueue_product_image_refreshes(
  p_product_ids uuid[],
  p_failed_cooldown_seconds integer default 604800,
  p_skipped_cooldown_seconds integer default 2592000
)
returns table (
  product_id uuid,
  enqueue_status text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_master record;
  v_queue_id uuid;
begin
  if p_product_ids is null
    or pg_catalog.cardinality(p_product_ids) < 1
    or pg_catalog.cardinality(p_product_ids) > 25
    or pg_catalog.array_position(p_product_ids, null) is not null
    or p_failed_cooldown_seconds < 3600
    or p_failed_cooldown_seconds > 2592000
    or p_skipped_cooldown_seconds < 3600
    or p_skipped_cooldown_seconds > 7776000 then
    raise exception using
      errcode = '22023',
      message = 'invalid product image refresh enqueue request';
  end if;

  for v_product_id in
    select distinct requested.product_id
    from pg_catalog.unnest(p_product_ids) as requested(product_id)
  loop
    select
      master.image_url,
      master.image_thumbnail_url,
      master.image_status,
      master.image_last_checked_at
    into v_master
    from public.supplement_products_master as master
    where master.product_id = v_product_id;

    product_id := v_product_id;
    if not found then
      enqueue_status := 'missing_product';
      return next;
      continue;
    end if;

    if nullif(pg_catalog.btrim(coalesce(v_master.image_thumbnail_url, '')), '') is not null
      or nullif(pg_catalog.btrim(coalesce(v_master.image_url, '')), '') is not null then
      enqueue_status := 'cached';
      return next;
      continue;
    end if;

    if v_master.image_status = 'failed'
      and v_master.image_last_checked_at is not null
      and v_master.image_last_checked_at >
        pg_catalog.timezone('utc', pg_catalog.now())
          - pg_catalog.make_interval(secs => p_failed_cooldown_seconds) then
      enqueue_status := 'cooldown';
      return next;
      continue;
    end if;

    if v_master.image_status = 'skipped'
      and v_master.image_last_checked_at is not null
      and v_master.image_last_checked_at >
        pg_catalog.timezone('utc', pg_catalog.now())
          - pg_catalog.make_interval(secs => p_skipped_cooldown_seconds) then
      enqueue_status := 'cooldown';
      return next;
      continue;
    end if;

    if exists (
      select 1
      from public.product_image_refresh_queue as previous
      where previous.product_id = v_product_id
        and previous.status = 'failed'
        and previous.completed_at is not null
        and previous.completed_at >
          pg_catalog.timezone('utc', pg_catalog.now())
            - pg_catalog.make_interval(secs => p_failed_cooldown_seconds)
    ) then
      enqueue_status := 'cooldown';
      return next;
      continue;
    end if;

    v_queue_id := null;
    insert into public.product_image_refresh_queue (
      product_id,
      status,
      available_at,
      updated_at
    ) values (
      v_product_id,
      'pending',
      pg_catalog.timezone('utc', pg_catalog.now()),
      pg_catalog.timezone('utc', pg_catalog.now())
    )
    on conflict (product_id)
      where status in ('pending', 'processing', 'retry')
    do nothing
    returning id into v_queue_id;

    enqueue_status := case
      when v_queue_id is null then 'deduplicated'
      else 'queued'
    end;
    return next;
  end loop;
end;
$$;

create or replace function public.claim_product_image_refresh_queue(
  p_limit integer,
  p_worker_id text,
  p_daily_limit integer default 100
)
returns table (
  id uuid,
  product_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_worker_id text := pg_catalog.btrim(coalesce(p_worker_id, ''));
  v_today date := pg_catalog.timezone('utc', pg_catalog.now())::date;
  v_attempts_today integer;
  v_claim_limit integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10
    or nullif(v_worker_id, '') is null
    or pg_catalog.char_length(v_worker_id) > 160
    or p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 5000 then
    raise exception using errcode = '22023', message = 'invalid image queue claim request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('product-image-refresh-daily-budget'));

  select coalesce(pg_catalog.sum(queue.daily_attempt_count), 0)::integer
  into v_attempts_today
  from public.product_image_refresh_queue as queue
  where queue.attempted_on = v_today;

  v_claim_limit := least(p_limit, greatest(p_daily_limit - v_attempts_today, 0));
  if v_claim_limit = 0 then
    return;
  end if;

  return query
  with candidates as (
    select queue.id
    from public.product_image_refresh_queue as queue
    where (
      queue.status in ('pending', 'retry')
      and queue.available_at <= pg_catalog.timezone('utc', pg_catalog.now())
    ) or (
      queue.status = 'processing'
      and queue.locked_at <
        pg_catalog.timezone('utc', pg_catalog.now()) - interval '15 minutes'
    )
    order by queue.available_at, queue.created_at, queue.id
    for update skip locked
    limit v_claim_limit
  ), claimed as (
    update public.product_image_refresh_queue as queue
    set
      status = 'processing',
      attempt_count = queue.attempt_count + 1,
      attempted_on = v_today,
      daily_attempt_count = case
        when queue.attempted_on = v_today then queue.daily_attempt_count + 1
        else 1
      end,
      locked_at = pg_catalog.timezone('utc', pg_catalog.now()),
      locked_by = v_worker_id,
      last_error = null,
      updated_at = pg_catalog.timezone('utc', pg_catalog.now())
    from candidates
    where queue.id = candidates.id
    returning queue.id, queue.product_id, queue.attempt_count
  )
  select claimed.id, claimed.product_id, claimed.attempt_count
  from claimed
  order by claimed.id;
end;
$$;

create or replace function public.retry_product_image_refresh(
  p_queue_id uuid,
  p_worker_id text,
  p_error text,
  p_retry_after_seconds integer default 300
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
    or p_retry_after_seconds < 1
    or p_retry_after_seconds > 86400 then
    raise exception using errcode = '22023', message = 'invalid image queue retry request';
  end if;

  update public.product_image_refresh_queue as queue
  set
    status = case when queue.attempt_count >= 5 then 'failed' else 'retry' end,
    available_at = pg_catalog.timezone('utc', pg_catalog.now())
      + pg_catalog.make_interval(secs => p_retry_after_seconds),
    locked_at = null,
    locked_by = null,
    last_error = pg_catalog.left(coalesce(p_error, 'image refresh failed'), 500),
    completed_at = case
      when queue.attempt_count >= 5 then pg_catalog.timezone('utc', pg_catalog.now())
      else null
    end,
    updated_at = pg_catalog.timezone('utc', pg_catalog.now())
  where queue.id = p_queue_id
    and queue.status = 'processing'
    and queue.locked_by = pg_catalog.btrim(p_worker_id)
  returning queue.status into v_status;

  if v_status is null then
    raise exception using errcode = '55000', message = 'image queue row is not owned by this worker';
  end if;
  return v_status;
end;
$$;

create or replace function public.complete_product_image_refresh(
  p_queue_id uuid,
  p_worker_id text,
  p_outcome text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_outcome text := pg_catalog.btrim(coalesce(p_outcome, ''));
begin
  if p_queue_id is null
    or nullif(pg_catalog.btrim(coalesce(p_worker_id, '')), '') is null
    or v_outcome not in ('found', 'cached', 'failed', 'skipped') then
    raise exception using errcode = '22023', message = 'invalid image queue completion request';
  end if;

  update public.product_image_refresh_queue as queue
  set
    status = case when v_outcome in ('found', 'cached') then 'completed' else 'failed' end,
    last_outcome = v_outcome,
    last_error = nullif(pg_catalog.left(coalesce(p_error, ''), 500), ''),
    locked_at = null,
    locked_by = null,
    completed_at = pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at = pg_catalog.timezone('utc', pg_catalog.now())
  where queue.id = p_queue_id
    and queue.status = 'processing'
    and queue.locked_by = pg_catalog.btrim(p_worker_id);

  if not found then
    raise exception using errcode = '55000', message = 'image queue row is not owned by this worker';
  end if;
end;
$$;

revoke all on function public.enqueue_product_image_refreshes(uuid[], integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_product_image_refresh_queue(integer, text, integer)
  from public, anon, authenticated;
revoke all on function public.retry_product_image_refresh(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_product_image_refresh(uuid, text, text, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_product_image_refreshes(uuid[], integer, integer)
  to service_role;
grant execute on function public.claim_product_image_refresh_queue(integer, text, integer)
  to service_role;
grant execute on function public.retry_product_image_refresh(uuid, text, text, integer)
  to service_role;
grant execute on function public.complete_product_image_refresh(uuid, text, text, text)
  to service_role;
