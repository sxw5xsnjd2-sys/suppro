alter table public.supplement_products_master
add column if not exists verification_status text;

update public.supplement_products_master
set verification_status = 'verified'
where verification_status is null;

alter table public.supplement_products_master
alter column verification_status set default 'verified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplement_products_master_verification_status_check'
      and conrelid = 'public.supplement_products_master'::regclass
  )
  and not exists (
    select 1
    from public.supplement_products_master
    where verification_status is not null
      and verification_status not in ('verified', 'go_upc_unverified', 'photo_verified')
  )
  then
    alter table public.supplement_products_master
      add constraint supplement_products_master_verification_status_check
      check (
        verification_status is null
        or verification_status in ('verified', 'go_upc_unverified', 'photo_verified')
      );
  end if;
end $$;
