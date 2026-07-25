-- Correct the deployed product-ranking image projection and remove transient
-- SerpApi proxy thumbnails. Full canonical image URLs are never modified.

update public.supplement_products_master
set image_thumbnail_url = null
where pg_catalog.lower(pg_catalog.btrim(image_thumbnail_url))
    ~ '^https?://([a-z0-9-]+\.)*serpapi\.com([/:]|$)';

drop function if exists public.get_product_benefit_rankings(
  text,
  text,
  integer,
  numeric,
  numeric,
  integer,
  text,
  uuid
);

create function public.get_product_benefit_rankings(
  p_benefit_key text,
  p_calculation_version text,
  p_limit integer default 25,
  p_after_product_benefit_score numeric default null,
  p_after_overall_evidence_sort_score numeric default null,
  p_after_verification_precedence integer default null,
  p_after_normalized_product_name text default null,
  p_after_product_id uuid default null
)
returns table (
  product_id uuid,
  product_name text,
  product_brand text,
  image_thumbnail_url text,
  image_url text,
  image_status text,
  image_last_checked_at timestamptz,
  normalized_product_name text,
  verification_status text,
  verification_precedence integer,
  benefit_label text,
  benefit_key text,
  product_benefit_score numeric,
  overall_evidence_score numeric,
  overall_evidence_sort_score numeric,
  overall_evidence_calculation_version text,
  overall_evidence_calculated_at timestamptz,
  driver_canonical_ingredient_id uuid,
  driver_ingredient_name text,
  raw_active_ingredient_benefit_score numeric,
  validated_dose_factor numeric,
  dose_comparison_status text,
  calculation_version text,
  calculated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_benefit_key text := pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(p_benefit_key, '')),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
  v_calculation_version text := pg_catalog.btrim(
    coalesce(p_calculation_version, '')
  );
  v_cursor_field_count integer := pg_catalog.num_nonnulls(
    p_after_product_benefit_score,
    p_after_overall_evidence_sort_score,
    p_after_verification_precedence,
    p_after_normalized_product_name,
    p_after_product_id
  );
begin
  if nullif(v_benefit_key, '') is null
    or pg_catalog.char_length(v_benefit_key) > 160 then
    raise exception using
      errcode = '22023',
      message = 'benefit key must contain between 1 and 160 characters';
  end if;

  if nullif(v_calculation_version, '') is null
    or pg_catalog.char_length(v_calculation_version) > 120 then
    raise exception using
      errcode = '22023',
      message = 'calculation version must contain between 1 and 120 characters';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using
      errcode = '22023',
      message = 'limit must be between 1 and 100';
  end if;

  if v_cursor_field_count not in (0, 5) then
    raise exception using
      errcode = '22023',
      message = 'all keyset cursor fields must be supplied together';
  end if;

  if v_cursor_field_count = 5 and (
    p_after_product_benefit_score not between 0 and 100
    or p_after_overall_evidence_sort_score not between -1 and 100
    or p_after_verification_precedence not in (80, 90, 100)
    or nullif(p_after_normalized_product_name, '') is null
    or pg_catalog.char_length(p_after_normalized_product_name) > 300
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid keyset cursor';
  end if;

  return query
  with rankable as (
    select
      master.product_id,
      master.display_name as product_name,
      nullif(pg_catalog.btrim(naming.brand_name), '') as product_brand,
      nullif(pg_catalog.btrim(master.image_thumbnail_url), '')
        as image_thumbnail_url,
      nullif(pg_catalog.btrim(master.image_url), '') as image_url,
      master.image_status,
      master.image_last_checked_at,
      pg_catalog.lower(
        pg_catalog.regexp_replace(
          pg_catalog.btrim(master.display_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ) collate "C" as normalized_product_name,
      master.verification_status,
      case master.verification_status
        when 'verified' then 100
        when 'photo_verified' then 90
        when 'dsld_verified' then 80
      end as verification_precedence,
      score.benefit_label,
      score.benefit_key,
      score.product_benefit_score,
      master.overall_evidence_score,
      coalesce(master.overall_evidence_score, '-1'::numeric)
        as overall_evidence_sort_score,
      master.overall_evidence_calculation_version,
      master.overall_evidence_calculated_at,
      score.driver_canonical_ingredient_id,
      score.driver_ingredient_name,
      score.raw_active_ingredient_benefit_score,
      score.validated_dose_factor,
      score.dose_comparison_status,
      score.calculation_version,
      score.calculated_at
    from public.product_benefit_scores as score
    inner join public.supplement_products_master as master
      on master.product_id = score.product_id
    left join public.off_products_ai_naming as naming
      on naming.product_id = master.product_id
    where score.benefit_key = v_benefit_key
      and score.calculation_version = v_calculation_version
      and score.product_benefit_score is not null
      and master.verification_status in (
        'verified',
        'photo_verified',
        'dsld_verified'
      )
  )
  select
    ranked.product_id,
    ranked.product_name,
    ranked.product_brand,
    ranked.image_thumbnail_url,
    ranked.image_url,
    ranked.image_status,
    ranked.image_last_checked_at,
    ranked.normalized_product_name,
    ranked.verification_status,
    ranked.verification_precedence,
    ranked.benefit_label,
    ranked.benefit_key,
    ranked.product_benefit_score,
    ranked.overall_evidence_score,
    ranked.overall_evidence_sort_score,
    ranked.overall_evidence_calculation_version,
    ranked.overall_evidence_calculated_at,
    ranked.driver_canonical_ingredient_id,
    ranked.driver_ingredient_name,
    ranked.raw_active_ingredient_benefit_score,
    ranked.validated_dose_factor,
    ranked.dose_comparison_status,
    ranked.calculation_version,
    ranked.calculated_at
  from rankable as ranked
  where v_cursor_field_count = 0
    or ranked.product_benefit_score < p_after_product_benefit_score
    or (
      ranked.product_benefit_score = p_after_product_benefit_score
      and ranked.overall_evidence_sort_score
        < p_after_overall_evidence_sort_score
    )
    or (
      ranked.product_benefit_score = p_after_product_benefit_score
      and ranked.overall_evidence_sort_score
        = p_after_overall_evidence_sort_score
      and ranked.verification_precedence < p_after_verification_precedence
    )
    or (
      ranked.product_benefit_score = p_after_product_benefit_score
      and ranked.overall_evidence_sort_score
        = p_after_overall_evidence_sort_score
      and ranked.verification_precedence = p_after_verification_precedence
      and ranked.normalized_product_name
        > p_after_normalized_product_name collate "C"
    )
    or (
      ranked.product_benefit_score = p_after_product_benefit_score
      and ranked.overall_evidence_sort_score
        = p_after_overall_evidence_sort_score
      and ranked.verification_precedence = p_after_verification_precedence
      and ranked.normalized_product_name
        = p_after_normalized_product_name collate "C"
      and ranked.product_id > p_after_product_id
    )
  order by
    ranked.product_benefit_score desc,
    ranked.overall_evidence_sort_score desc,
    ranked.verification_precedence desc,
    ranked.normalized_product_name collate "C" asc,
    ranked.product_id asc
  limit p_limit;
end;
$$;

comment on function public.get_product_benefit_rankings(
  text,
  text,
  integer,
  numeric,
  numeric,
  integer,
  text,
  uuid
) is
  'Bounded keyset product rankings with independent canonical thumbnail, full image, and image lookup state fields.';

revoke all on function public.get_product_benefit_rankings(
  text,
  text,
  integer,
  numeric,
  numeric,
  integer,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.get_product_benefit_rankings(
  text,
  text,
  integer,
  numeric,
  numeric,
  integer,
  text,
  uuid
) to anon, authenticated, service_role;
