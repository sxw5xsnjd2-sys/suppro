revoke all on table public.dsld_lookup_attempts from anon, authenticated;
grant insert on table public.dsld_lookup_attempts to authenticated;

alter table if exists public.dsld_lookup_attempts enable row level security;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.dsld_lookup_attempts') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'dsld_lookup_attempts'
    loop
      execute format(
        'drop policy if exists %I on public.dsld_lookup_attempts',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Authenticated users can insert DSLD lookup attempts"
        on public.dsld_lookup_attempts
        for insert
        to authenticated
        with check (true)
    $policy$;
  end if;
end $$;
