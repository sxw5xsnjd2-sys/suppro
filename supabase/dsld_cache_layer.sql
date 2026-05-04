create or replace function public.set_dsld_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.dsld_products_cache (
  dsld_id bigint primary key,
  product_name text,
  brand_name text,
  barcode_raw text,
  barcode_normalized text,
  market_status text not null default 'unknown',
  serving_size text,
  supplement_form text,
  suggested_use text,
  source_url text,
  raw_json jsonb not null,
  fetched_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_dsld_products_cache_updated_at on public.dsld_products_cache;
create trigger set_dsld_products_cache_updated_at
before update on public.dsld_products_cache
for each row
execute function public.set_dsld_cache_updated_at();

create table if not exists public.dsld_product_ingredients (
  id bigint generated always as identity primary key,
  dsld_id bigint not null references public.dsld_products_cache(dsld_id) on delete cascade,
  ingredient_name text not null,
  ingredient_category text,
  amount_per_serving numeric,
  amount_unit text,
  percent_daily_value numeric,
  daily_value_target_group text,
  serving_size text,
  row_order integer not null,
  raw_json jsonb not null
);

create table if not exists public.dsld_product_label_statements (
  id bigint generated always as identity primary key,
  dsld_id bigint not null references public.dsld_products_cache(dsld_id) on delete cascade,
  statement_type text,
  statement text not null,
  raw_json jsonb not null
);

create table if not exists public.dsld_lookup_attempts (
  id bigint generated always as identity primary key,
  input_barcode text,
  normalized_barcode text,
  input_brand text,
  input_product_name text,
  matched_dsld_id bigint references public.dsld_products_cache(dsld_id) on delete set null,
  confidence text,
  match_reasons text[] not null default '{}',
  search_path text,
  success boolean not null default false,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists dsld_products_cache_barcode_normalized_idx
  on public.dsld_products_cache (barcode_normalized);

create index if not exists dsld_products_cache_product_name_lower_idx
  on public.dsld_products_cache (lower(product_name));

create index if not exists dsld_products_cache_brand_name_lower_idx
  on public.dsld_products_cache (lower(brand_name));

create index if not exists dsld_product_ingredients_dsld_id_idx
  on public.dsld_product_ingredients (dsld_id);

create index if not exists dsld_product_label_statements_dsld_id_idx
  on public.dsld_product_label_statements (dsld_id);

create index if not exists dsld_lookup_attempts_matched_dsld_id_idx
  on public.dsld_lookup_attempts (matched_dsld_id);

create index if not exists dsld_lookup_attempts_confidence_idx
  on public.dsld_lookup_attempts (confidence);

create index if not exists dsld_lookup_attempts_created_at_idx
  on public.dsld_lookup_attempts (created_at desc);
