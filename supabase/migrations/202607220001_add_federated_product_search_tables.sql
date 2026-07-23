create table if not exists public.supplement_product_search_cache (
  cache_key text primary key,
  cache_version text not null,
  provider text not null,
  normalized_query text not null,
  provider_status text not null,
  response_json jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint supplement_product_search_cache_provider_status_check check (
    provider_status in (
      'success',
      'timeout',
      'rate_limit',
      'unavailable',
      'error',
      'cached',
      'config_blocked',
      'skipped',
      'skipped_min_length'
    )
  ),
  constraint supplement_product_search_cache_time_order_check check (
    expires_at >= fetched_at
  )
);

create index if not exists supplement_product_search_cache_expiry_idx
  on public.supplement_product_search_cache (expires_at);

create index if not exists supplement_product_search_cache_provider_query_idx
  on public.supplement_product_search_cache (provider, normalized_query);

create table if not exists public.supplement_product_source_links (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  provider_stable_id text not null,
  normalized_barcode text,
  canonical_product_id uuid references public.off_products(id) on delete set null,
  source_metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint supplement_product_source_links_source_stable_unique
    unique (source, provider_stable_id)
);

create index if not exists supplement_product_source_links_barcode_idx
  on public.supplement_product_source_links (normalized_barcode)
  where normalized_barcode is not null;

create index if not exists supplement_product_source_links_product_idx
  on public.supplement_product_source_links (canonical_product_id)
  where canonical_product_id is not null;

create or replace function public.set_federated_product_search_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  if tg_table_name = 'supplement_product_source_links' then
    new.last_seen_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists set_supplement_product_search_cache_updated_at
  on public.supplement_product_search_cache;
create trigger set_supplement_product_search_cache_updated_at
before update on public.supplement_product_search_cache
for each row execute function public.set_federated_product_search_updated_at();

drop trigger if exists set_supplement_product_source_links_updated_at
  on public.supplement_product_source_links;
create trigger set_supplement_product_source_links_updated_at
before update on public.supplement_product_source_links
for each row execute function public.set_federated_product_search_updated_at();

alter table public.supplement_product_search_cache enable row level security;
alter table public.supplement_product_source_links enable row level security;

revoke all on table public.supplement_product_search_cache from anon, authenticated;
revoke all on table public.supplement_product_source_links from anon, authenticated;
grant all on table public.supplement_product_search_cache to service_role;
grant all on table public.supplement_product_source_links to service_role;
