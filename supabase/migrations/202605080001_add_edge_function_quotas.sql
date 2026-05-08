create table if not exists public.edge_function_quotas (
  user_id uuid not null,
  quota_key text not null,
  bucket_kind text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, quota_key, bucket_kind, bucket_start),
  constraint edge_function_quotas_bucket_kind_check
    check (bucket_kind in ('short_window', 'day')),
  constraint edge_function_quotas_request_count_check
    check (request_count >= 0)
);

create index if not exists edge_function_quotas_lookup_idx
  on public.edge_function_quotas (quota_key, user_id, bucket_kind, bucket_start desc);

alter table public.edge_function_quotas enable row level security;

create or replace function public.enforce_edge_function_quota(
  p_user_id uuid,
  p_quota_key text,
  p_short_window_seconds integer,
  p_short_window_limit integer,
  p_daily_limit integer,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  allowed boolean,
  code text,
  retry_after_seconds integer,
  short_window_count integer,
  daily_count integer
)
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_short_window_start timestamptz;
  v_short_window_end timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_short_window_count integer := 0;
  v_daily_count integer := 0;
begin
  if p_user_id is null
    or nullif(trim(coalesce(p_quota_key, '')), '') is null
    or coalesce(p_short_window_seconds, 0) <= 0
    or coalesce(p_short_window_limit, 0) <= 0
    or coalesce(p_daily_limit, 0) <= 0 then
    raise exception 'Invalid edge function quota configuration.';
  end if;

  v_short_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_short_window_seconds) * p_short_window_seconds
  );
  v_short_window_end := v_short_window_start + make_interval(secs => p_short_window_seconds);
  v_day_start := date_trunc('day', v_now at time zone 'utc') at time zone 'utc';
  v_day_end := v_day_start + interval '1 day';

  perform pg_advisory_xact_lock(
    hashtextextended(p_quota_key || ':' || p_user_id::text, 0)
  );

  select q.request_count
  into v_short_window_count
  from public.edge_function_quotas q
  where q.user_id = p_user_id
    and q.quota_key = p_quota_key
    and q.bucket_kind = 'short_window'
    and q.bucket_start = v_short_window_start;

  select q.request_count
  into v_daily_count
  from public.edge_function_quotas q
  where q.user_id = p_user_id
    and q.quota_key = p_quota_key
    and q.bucket_kind = 'day'
    and q.bucket_start = v_day_start;

  v_short_window_count := coalesce(v_short_window_count, 0);
  v_daily_count := coalesce(v_daily_count, 0);

  if v_short_window_count >= p_short_window_limit then
    return query
    select
      false,
      'rate_limit_exceeded',
      greatest(1, ceil(extract(epoch from (v_short_window_end - v_now)))::integer),
      v_short_window_count,
      v_daily_count;
    return;
  end if;

  if v_daily_count >= p_daily_limit then
    return query
    select
      false,
      'daily_quota_exceeded',
      greatest(1, ceil(extract(epoch from (v_day_end - v_now)))::integer),
      v_short_window_count,
      v_daily_count;
    return;
  end if;

  insert into public.edge_function_quotas as q (
    user_id,
    quota_key,
    bucket_kind,
    bucket_start,
    request_count,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_quota_key,
    'short_window',
    v_short_window_start,
    1,
    v_now,
    v_now
  )
  on conflict (user_id, quota_key, bucket_kind, bucket_start)
  do update
    set request_count = q.request_count + 1,
        updated_at = excluded.updated_at
  returning request_count
  into v_short_window_count;

  insert into public.edge_function_quotas as q (
    user_id,
    quota_key,
    bucket_kind,
    bucket_start,
    request_count,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_quota_key,
    'day',
    v_day_start,
    1,
    v_now,
    v_now
  )
  on conflict (user_id, quota_key, bucket_kind, bucket_start)
  do update
    set request_count = q.request_count + 1,
        updated_at = excluded.updated_at
  returning request_count
  into v_daily_count;

  return query
  select
    true,
    'ok',
    null::integer,
    v_short_window_count,
    v_daily_count;
end;
$$;

revoke all on table public.edge_function_quotas from public, anon, authenticated;
grant select, insert, update on table public.edge_function_quotas to service_role;
revoke all on function public.enforce_edge_function_quota(
  uuid,
  text,
  integer,
  integer,
  integer,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.enforce_edge_function_quota(
  uuid,
  text,
  integer,
  integer,
  integer,
  timestamptz
) to service_role;
