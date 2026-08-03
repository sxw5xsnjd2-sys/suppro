-- Atomic, optimistic persistence for the authenticated photo-improvement route.
-- Existing products start at revision 0. Only the service-role edge function may
-- call the route-specific commit RPC.
--
-- Rollback (after stopping scan-supplement-photos traffic):
--   drop function public.commit_photo_improvement(
--     uuid, text, text, bigint, bigint, jsonb, jsonb, text, text,
--     double precision, text, text
--   );
--   drop index public.supplement_products_master_photo_improvement_revision_idx;
--   alter table public.supplement_products_master
--     drop constraint supplement_products_master_photo_improvement_attempt_check,
--     drop constraint supplement_products_master_photo_improvement_revision_check,
--     drop column photo_improvement_accepted_attempt_id,
--     drop column photo_improvement_revision;

alter table public.supplement_products_master
  add column if not exists photo_improvement_revision bigint,
  add column if not exists photo_improvement_accepted_attempt_id text;

update public.supplement_products_master
set photo_improvement_revision = 0
where photo_improvement_revision is null;

alter table public.supplement_products_master
  alter column photo_improvement_revision set default 0,
  alter column photo_improvement_revision set not null;

alter table public.supplement_products_master
  drop constraint if exists supplement_products_master_photo_improvement_revision_check,
  add constraint supplement_products_master_photo_improvement_revision_check
    check (photo_improvement_revision >= 0),
  drop constraint if exists supplement_products_master_photo_improvement_attempt_check,
  add constraint supplement_products_master_photo_improvement_attempt_check
    check (
      (photo_improvement_revision = 0 and photo_improvement_accepted_attempt_id is null)
      or
      (
        photo_improvement_revision > 0
        and nullif(pg_catalog.btrim(photo_improvement_accepted_attempt_id), '') is not null
        and pg_catalog.char_length(photo_improvement_accepted_attempt_id) <= 160
      )
    );

create index if not exists supplement_products_master_photo_improvement_revision_idx
  on public.supplement_products_master (photo_improvement_revision)
  where photo_improvement_revision > 0;

create or replace function public.commit_photo_improvement(
  p_product_id uuid,
  p_barcode text,
  p_photo_attempt_id text,
  p_expected_revision bigint,
  p_proposed_revision bigint,
  p_active_ingredient_rows jsonb,
  p_master_active_ingredients jsonb,
  p_display_name text,
  p_serving_size_text text,
  p_naming_confidence double precision,
  p_source_model text,
  p_source_prompt_version text
)
returns table (
  transaction_outcome text,
  committed_revision bigint,
  accepted_photo_attempt_id text,
  stored_revision bigint,
  canonical_product jsonb,
  active_ingredient_rows jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.off_products%rowtype;
  v_master public.supplement_products_master%rowtype;
  v_master_exists boolean := false;
  v_conflicting_product boolean := false;
  v_stored_revision bigint := 0;
  v_accepted_attempt_id text := null;
  v_active_rows jsonb := '[]'::jsonb;
  v_requested_barcode text := pg_catalog.btrim(coalesce(p_barcode, ''));
  v_product_barcode text;
  v_requested_numeric_barcode text;
  v_product_numeric_barcode text;
  v_lock_barcode text;
begin
  if p_product_id is null
    or nullif(pg_catalog.btrim(coalesce(p_photo_attempt_id, '')), '') is null
    or pg_catalog.char_length(pg_catalog.btrim(p_photo_attempt_id)) > 160
    or pg_catalog.btrim(p_photo_attempt_id) !~ '^[A-Za-z0-9._:-]+$'
    or p_expected_revision is null
    or p_expected_revision < 0
    or p_proposed_revision is null
    or p_proposed_revision <> p_expected_revision + 1
    or nullif(v_requested_barcode, '') is null
    or nullif(pg_catalog.btrim(coalesce(p_display_name, '')), '') is null
    or pg_catalog.char_length(pg_catalog.btrim(p_display_name)) > 300
    or nullif(pg_catalog.btrim(coalesce(p_source_model, '')), '') is null
    or nullif(pg_catalog.btrim(coalesce(p_source_prompt_version, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'invalid photo improvement version or metadata';
  end if;

  if p_active_ingredient_rows is null
    or pg_catalog.jsonb_typeof(p_active_ingredient_rows) <> 'array'
    or pg_catalog.jsonb_array_length(p_active_ingredient_rows) < 1
    or pg_catalog.jsonb_array_length(p_active_ingredient_rows) > 250
    or p_master_active_ingredients is null
    or pg_catalog.jsonb_typeof(p_master_active_ingredients) <> 'array'
    or pg_catalog.jsonb_array_length(p_master_active_ingredients) < 1
    or pg_catalog.jsonb_array_length(p_master_active_ingredients) > 250 then
    raise exception using
      errcode = '22023',
      message = 'invalid photo improvement canonical rows';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_active_ingredient_rows) as item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
      or nullif(pg_catalog.btrim(coalesce(item.value ->> 'raw_name', '')), '') is null
      or coalesce(item.value ->> 'ingredient_type', '') not in (
        'active', 'inactive', 'uncertain'
      )
  ) or not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_active_ingredient_rows) as item(value)
    where item.value ->> 'ingredient_type' = 'active'
  ) then
    raise exception using
      errcode = '22023',
      message = 'invalid photo improvement ingredient rows';
  end if;

  v_lock_barcode := case
    when v_requested_barcode ~ '^[0-9]+$' then coalesce(
      nullif(pg_catalog.ltrim(v_requested_barcode, '0'), ''),
      '0'
    )
    else v_requested_barcode
  end;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('photo-improvement:' || v_lock_barcode, 0)
  );

  -- The off_products row is the stable per-product serialization point. It
  -- also serializes two first improvements before a master row exists.
  select product.*
  into v_product
  from public.off_products as product
  where product.id = p_product_id
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'invalid photo improvement target';
  end if;

  v_product_barcode := pg_catalog.btrim(coalesce(v_product.barcode, ''));
  if nullif(v_product_barcode, '') is not null then
    if v_product_barcode ~ '^[0-9]+$' and v_requested_barcode ~ '^[0-9]+$' then
      v_product_numeric_barcode := coalesce(
        nullif(pg_catalog.ltrim(v_product_barcode, '0'), ''),
        '0'
      );
      v_requested_numeric_barcode := coalesce(
        nullif(pg_catalog.ltrim(v_requested_barcode, '0'), ''),
        '0'
      );
      if v_product_numeric_barcode <> v_requested_numeric_barcode then
        raise exception using
          errcode = '22023',
          message = 'invalid photo improvement target';
      end if;
    elsif v_product_barcode <> v_requested_barcode then
      raise exception using
        errcode = '22023',
        message = 'invalid photo improvement target';
    end if;
  end if;

  select master.*
  into v_master
  from public.supplement_products_master as master
  where master.product_id = p_product_id
  for update;
  v_master_exists := found;

  -- Two first-time requests can race before either has a canonical master row.
  -- The barcode advisory lock makes an already-committed winner authoritative
  -- even if the legacy off_products table contains duplicate barcode rows.
  if not v_master_exists then
    select master.*
    into v_master
    from public.supplement_products_master as master
    where master.product_id <> p_product_id
      and nullif(pg_catalog.btrim(coalesce(master.barcode, '')), '') is not null
      and (
        pg_catalog.btrim(master.barcode) = v_requested_barcode
        or (
          pg_catalog.btrim(master.barcode) ~ '^[0-9]+$'
          and v_requested_barcode ~ '^[0-9]+$'
          and coalesce(
            nullif(pg_catalog.ltrim(pg_catalog.btrim(master.barcode), '0'), ''),
            '0'
          ) = v_lock_barcode
        )
      )
    order by master.photo_improvement_revision desc, master.processed_at desc
    limit 1
    for update;
    if found then
      v_master_exists := true;
      v_conflicting_product := true;
    end if;
  end if;

  if v_master_exists then
    v_stored_revision := coalesce(v_master.photo_improvement_revision, 0);
    v_accepted_attempt_id := v_master.photo_improvement_accepted_attempt_id;
  end if;
  stored_revision := v_stored_revision;

  if v_conflicting_product then
    transaction_outcome := 'rejected_stale';
    committed_revision := v_stored_revision;
    accepted_photo_attempt_id := v_accepted_attempt_id;
  elsif v_master_exists
    and v_accepted_attempt_id = pg_catalog.btrim(p_photo_attempt_id)
    and v_stored_revision = p_proposed_revision then
    transaction_outcome := 'already_applied';
    committed_revision := v_stored_revision;
    accepted_photo_attempt_id := v_accepted_attempt_id;
  elsif v_master_exists
    and v_accepted_attempt_id = pg_catalog.btrim(p_photo_attempt_id) then
    transaction_outcome := 'rejected_stale';
    committed_revision := v_stored_revision;
    accepted_photo_attempt_id := v_accepted_attempt_id;
  elsif v_stored_revision <> p_expected_revision
    or v_stored_revision >= p_proposed_revision then
    transaction_outcome := 'rejected_stale';
    committed_revision := v_stored_revision;
    accepted_photo_attempt_id := v_accepted_attempt_id;
  else
    delete from public.product_active_ingredients as ingredient
    where ingredient.product_id = p_product_id;

    insert into public.product_active_ingredients (
      product_id,
      canonical_supplement_id,
      raw_name,
      canonical_name,
      chemical_form,
      dosage_value,
      dosage_unit,
      dosage_original_text,
      amount_basis,
      ingredient_type,
      resolution_status,
      resolution_confidence,
      source_model,
      source_prompt_version,
      display_name,
      dose_confidence,
      dose_review_reason
    )
    select
      p_product_id,
      row_data.canonical_supplement_id,
      pg_catalog.btrim(row_data.raw_name),
      nullif(pg_catalog.btrim(row_data.canonical_name), ''),
      nullif(pg_catalog.btrim(row_data.chemical_form), ''),
      row_data.dosage_value,
      nullif(pg_catalog.btrim(row_data.dosage_unit), ''),
      nullif(pg_catalog.btrim(row_data.dosage_original_text), ''),
      nullif(pg_catalog.btrim(row_data.amount_basis), ''),
      row_data.ingredient_type,
      nullif(pg_catalog.btrim(row_data.resolution_status), ''),
      row_data.resolution_confidence,
      pg_catalog.btrim(p_source_model),
      pg_catalog.btrim(p_source_prompt_version),
      nullif(pg_catalog.btrim(row_data.display_name), ''),
      nullif(pg_catalog.btrim(row_data.dose_confidence), ''),
      nullif(pg_catalog.btrim(row_data.dose_review_reason), '')
    from pg_catalog.jsonb_to_recordset(p_active_ingredient_rows) as row_data (
      canonical_supplement_id uuid,
      raw_name text,
      canonical_name text,
      chemical_form text,
      dosage_value numeric,
      dosage_unit text,
      dosage_original_text text,
      amount_basis text,
      ingredient_type text,
      resolution_status text,
      resolution_confidence numeric,
      display_name text,
      dose_confidence text,
      dose_review_reason text
    );

    insert into public.supplement_products_master (
      product_id,
      barcode,
      display_name,
      serving_size_text,
      verification_status,
      name_source,
      naming_confidence,
      active_ingredients_json,
      ingredient_count,
      processed_at,
      photo_improvement_revision,
      photo_improvement_accepted_attempt_id
    ) values (
      p_product_id,
      v_requested_barcode,
      pg_catalog.btrim(p_display_name),
      nullif(pg_catalog.btrim(coalesce(p_serving_size_text, '')), ''),
      'photo_verified',
      'photo_rescue_ai',
      p_naming_confidence,
      p_master_active_ingredients,
      pg_catalog.jsonb_array_length(p_master_active_ingredients),
      pg_catalog.timezone('utc', pg_catalog.now()),
      p_proposed_revision,
      pg_catalog.btrim(p_photo_attempt_id)
    )
    on conflict (product_id) do update set
      barcode = excluded.barcode,
      display_name = excluded.display_name,
      serving_size_text = excluded.serving_size_text,
      verification_status = excluded.verification_status,
      name_source = excluded.name_source,
      naming_confidence = excluded.naming_confidence,
      active_ingredients_json = excluded.active_ingredients_json,
      ingredient_count = excluded.ingredient_count,
      processed_at = excluded.processed_at,
      photo_improvement_revision = excluded.photo_improvement_revision,
      photo_improvement_accepted_attempt_id =
        excluded.photo_improvement_accepted_attempt_id
    returning * into v_master;

    transaction_outcome := 'applied';
    committed_revision := v_master.photo_improvement_revision;
    accepted_photo_attempt_id :=
      v_master.photo_improvement_accepted_attempt_id;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(ingredient) order by ingredient.id),
    '[]'::jsonb
  )
  into v_active_rows
  from public.product_active_ingredients as ingredient
  where ingredient.product_id = p_product_id;

  canonical_product := pg_catalog.to_jsonb(v_master);
  active_ingredient_rows := v_active_rows;
  return next;
end;
$$;

revoke all on function public.commit_photo_improvement(
  uuid, text, text, bigint, bigint, jsonb, jsonb, text, text,
  double precision, text, text
)
from public, anon, authenticated;

grant execute on function public.commit_photo_improvement(
  uuid, text, text, bigint, bigint, jsonb, jsonb, text, text,
  double precision, text, text
)
to service_role;
