do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'supplement_products_master_verification_status_check'
      and conrelid = 'public.supplement_products_master'::regclass
  ) then
    alter table public.supplement_products_master
      drop constraint supplement_products_master_verification_status_check;
  end if;

  alter table public.supplement_products_master
    add constraint supplement_products_master_verification_status_check
    check (
      verification_status is null
      or verification_status in (
        'verified',
        'go_upc_unverified',
        'ean_search_unverified',
        'photo_verified',
        'dsld_verified'
      )
    );
end $$;
