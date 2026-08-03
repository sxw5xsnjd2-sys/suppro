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
#variable_conflict use_column
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
