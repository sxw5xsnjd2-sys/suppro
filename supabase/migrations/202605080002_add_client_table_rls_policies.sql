alter table if exists public.profiles enable row level security;
alter table if exists public.supplements enable row level security;
alter table if exists public.supplement_aliases enable row level security;
alter table if exists public.supplement_benefits enable row level security;
alter table if exists public.off_products enable row level security;
alter table if exists public.product_active_ingredients enable row level security;
alter table if exists public.supplement_products_master enable row level security;
alter table if exists public.dsld_products_cache enable row level security;
alter table if exists public.dsld_product_ingredients enable row level security;
alter table if exists public.dsld_product_label_statements enable row level security;
alter table if exists public.dsld_lookup_attempts enable row level security;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.profiles') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
    loop
      execute format(
        'drop policy if exists %I on public.profiles',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Users can read their own profile"
        on public.profiles
        for select
        to authenticated
        using (auth.uid() = id)
    $policy$;

    execute $policy$
      create policy "Users can insert their own profile"
        on public.profiles
        for insert
        to authenticated
        with check (auth.uid() = id)
    $policy$;

    execute $policy$
      create policy "Users can update their own profile"
        on public.profiles
        for update
        to authenticated
        using (auth.uid() = id)
        with check (auth.uid() = id)
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.supplements') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'supplements'
    loop
      execute format(
        'drop policy if exists %I on public.supplements',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read launch supplement catalog"
        on public.supplements
        for select
        to anon, authenticated
        using (status in ('approved', 'pending'))
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.supplement_aliases') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'supplement_aliases'
    loop
      execute format(
        'drop policy if exists %I on public.supplement_aliases',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read aliases for launch supplements"
        on public.supplement_aliases
        for select
        to anon, authenticated
        using (
          exists (
            select 1
            from public.supplements
            where supplements.id = supplement_aliases.supplement_id
              and supplements.status in ('approved', 'pending')
          )
        )
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.supplement_benefits') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'supplement_benefits'
    loop
      execute format(
        'drop policy if exists %I on public.supplement_benefits',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read benefits for launch supplements"
        on public.supplement_benefits
        for select
        to anon, authenticated
        using (
          exists (
            select 1
            from public.supplements
            where supplements.id = supplement_benefits.supplement_id
              and supplements.status in ('approved', 'pending')
          )
        )
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.off_products') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'off_products'
    loop
      execute format(
        'drop policy if exists %I on public.off_products',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read barcode source products"
        on public.off_products
        for select
        to anon, authenticated
        using (true)
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.product_active_ingredients') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'product_active_ingredients'
    loop
      execute format(
        'drop policy if exists %I on public.product_active_ingredients',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read product active ingredients"
        on public.product_active_ingredients
        for select
        to anon, authenticated
        using (
          exists (
            select 1
            from public.supplement_products_master
            where supplement_products_master.product_id = product_active_ingredients.product_id
          )
        )
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.supplement_products_master') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'supplement_products_master'
    loop
      execute format(
        'drop policy if exists %I on public.supplement_products_master',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read supplement products master"
        on public.supplement_products_master
        for select
        to anon, authenticated
        using (true)
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.dsld_products_cache') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'dsld_products_cache'
    loop
      execute format(
        'drop policy if exists %I on public.dsld_products_cache',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read DSLD product cache"
        on public.dsld_products_cache
        for select
        to anon, authenticated
        using (true)
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.dsld_product_ingredients') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'dsld_product_ingredients'
    loop
      execute format(
        'drop policy if exists %I on public.dsld_product_ingredients',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read DSLD product ingredients"
        on public.dsld_product_ingredients
        for select
        to anon, authenticated
        using (true)
    $policy$;
  end if;
end $$;

do $$
declare
  policy_record record;
begin
  if to_regclass('public.dsld_product_label_statements') is not null then
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = 'dsld_product_label_statements'
    loop
      execute format(
        'drop policy if exists %I on public.dsld_product_label_statements',
        policy_record.policyname
      );
    end loop;

    execute $policy$
      create policy "Public can read DSLD product label statements"
        on public.dsld_product_label_statements
        for select
        to anon, authenticated
        using (true)
    $policy$;
  end if;
end $$;

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

    execute 'revoke all on table public.dsld_lookup_attempts from public, anon, authenticated';
  end if;
end $$;
