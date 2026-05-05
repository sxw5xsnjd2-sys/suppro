alter table public.supplement_products_master
add column if not exists image_url text,
add column if not exists image_thumbnail_url text,
add column if not exists image_source_url text,
add column if not exists image_provider text,
add column if not exists image_query text,
add column if not exists image_confidence numeric,
add column if not exists image_status text default 'missing',
add column if not exists image_error text,
add column if not exists image_manual_override boolean default false,
add column if not exists image_last_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplement_products_master_image_status_check'
      and conrelid = 'public.supplement_products_master'::regclass
  )
  and not exists (
    select 1
    from public.supplement_products_master
    where image_status is not null
      and image_status not in ('missing', 'found', 'failed', 'skipped', 'manual')
  )
  then
    alter table public.supplement_products_master
      add constraint supplement_products_master_image_status_check
      check (
        image_status is null
        or image_status in ('missing', 'found', 'failed', 'skipped', 'manual')
      );
  end if;
end $$;
