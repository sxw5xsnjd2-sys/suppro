begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(30);

insert into public.off_products (id, barcode, name, ingredients)
values (
  '10000000-0000-0000-0000-000000000001'::uuid,
  '0123456789012',
  'Atomic photo test',
  'Magnesium'
);

select is(
  (
    select transaction_outcome
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012',
      'attempt-1',
      0,
      1,
      '[{"raw_name":"Magnesium","canonical_name":"Magnesium","ingredient_type":"active","dosage_value":100,"dosage_unit":"mg","dosage_original_text":"100 mg","amount_basis":"per_serving","resolution_status":"resolved","resolution_confidence":1,"dose_confidence":"verified"}]'::jsonb,
      '[{"name":"Magnesium","dosageValue":100,"dosageUnit":"mg"}]'::jsonb,
      'Atomic photo version 1',
      '1 capsule',
      0.9,
      'test-model',
      'test-prompt-v1'
    )
  ),
  'applied',
  'revision 0 normally commits revision 1'
);

select is(
  (
    select committed_revision
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-1', 0, 1,
      '[{"raw_name":"Magnesium","canonical_name":"Magnesium","ingredient_type":"active","dosage_value":100,"dosage_unit":"mg"}]'::jsonb,
      '[{"name":"Magnesium","dosageValue":100,"dosageUnit":"mg"}]'::jsonb,
      'Atomic photo version 1', null, 0.9, 'test-model', 'test-prompt-v1'
    )
  ),
  1::bigint,
  'exact retry returns committed revision 1'
);

select is(
  (
    select photo_improvement_revision
    from public.supplement_products_master
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  1::bigint,
  'master stores revision 1'
);

select is(
  (
    select dosage_value::integer
    from public.product_active_ingredients
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  100,
  'revision 1 stores its ingredient row'
);

select is(
  (
    select transaction_outcome
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-2', 1, 2,
      '[{"raw_name":"Magnesium","canonical_name":"Magnesium","ingredient_type":"active","dosage_value":200,"dosage_unit":"mg","dosage_original_text":"200 mg","amount_basis":"per_serving","resolution_status":"resolved","resolution_confidence":1,"dose_confidence":"verified"}]'::jsonb,
      '[{"name":"Magnesium","dosageValue":200,"dosageUnit":"mg"}]'::jsonb,
      'Atomic photo version 2', '2 capsules', 0.95, 'test-model', 'test-prompt-v1'
    )
  ),
  'applied',
  'second improvement commits revision 2'
);

select is(
  (
    select committed_revision
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-2', 1, 2,
      '[{"raw_name":"Magnesium","canonical_name":"Magnesium","ingredient_type":"active","dosage_value":200,"dosage_unit":"mg"}]'::jsonb,
      '[{"name":"Magnesium","dosageValue":200,"dosageUnit":"mg"}]'::jsonb,
      'Atomic photo version 2', null, 0.95, 'test-model', 'test-prompt-v1'
    )
  ),
  2::bigint,
  'revision 2 is the committed version'
);

select is(
  (
    select display_name
    from public.supplement_products_master
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  'Atomic photo version 2',
  'second master update is visible'
);

select is(
  (
    select transaction_outcome
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-3', 1, 2,
      '[{"raw_name":"Wrong stale ingredient","canonical_name":"Wrong stale ingredient","ingredient_type":"active","dosage_value":999,"dosage_unit":"mg"}]'::jsonb,
      '[{"name":"Wrong stale ingredient","dosageValue":999,"dosageUnit":"mg"}]'::jsonb,
      'Wrong stale version', null, 0.1, 'test-model', 'test-prompt-v1'
    )
  ),
  'rejected_stale',
  'competing request based on revision 1 is rejected'
);

select is(
  (
    select photo_improvement_revision
    from public.supplement_products_master
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  2::bigint,
  'stale write leaves revision 2 intact'
);

select is(
  (
    select dosage_value::integer
    from public.product_active_ingredients
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  200,
  'stale write cannot replace revision 2 ingredients'
);

select is(
  (
    select transaction_outcome
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-2', 1, 2,
      '[{"raw_name":"Magnesium","canonical_name":"Magnesium","ingredient_type":"active","dosage_value":200,"dosage_unit":"mg"}]'::jsonb,
      '[{"name":"Magnesium","dosageValue":200,"dosageUnit":"mg"}]'::jsonb,
      'Atomic photo version 2', null, 0.95, 'test-model', 'test-prompt-v1'
    )
  ),
  'already_applied',
  'exact same attempt is idempotent'
);

select is(
  (
    select transaction_outcome
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-2', 2, 3,
      '[{"raw_name":"Reused attempt","canonical_name":"Reused attempt","ingredient_type":"active"}]'::jsonb,
      '[{"name":"Reused attempt"}]'::jsonb,
      'Reused attempt', null, 0.5, 'test-model', 'test-prompt-v1'
    )
  ),
  'rejected_stale',
  'an accepted attempt ID cannot be reused for a new revision'
);

select is(
  (
    select transaction_outcome
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-4', 1, 2,
      '[{"raw_name":"Other","canonical_name":"Other","ingredient_type":"active","dosage_value":1,"dosage_unit":"mg"}]'::jsonb,
      '[{"name":"Other","dosageValue":1,"dosageUnit":"mg"}]'::jsonb,
      'Other attempt', null, 0.5, 'test-model', 'test-prompt-v1'
    )
  ),
  'rejected_stale',
  'different attempt cannot reuse an accepted revision'
);

select throws_ok(
  $$
    select * from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-5', 2, 3,
      '[{"raw_name":"Broken","canonical_name":"Broken","canonical_supplement_id":"not-a-uuid","ingredient_type":"active","dosage_value":1,"dosage_unit":"mg"}]'::jsonb,
      '[{"name":"Broken","dosageValue":1,"dosageUnit":"mg"}]'::jsonb,
      'Broken ingredient insert', null, 0.5, 'test-model', 'test-prompt-v1'
    )
  $$,
  '22P02',
  'invalid input syntax for type uuid: "not-a-uuid"',
  'ingredient insertion failure aborts the transaction'
);

select is(
  (
    select photo_improvement_revision
    from public.supplement_products_master
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  2::bigint,
  'ingredient insertion failure preserves the master revision'
);

select is(
  (
    select dosage_value::integer
    from public.product_active_ingredients
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  200,
  'ingredient insertion failure restores deleted ingredient rows'
);

create function pg_temp.reject_photo_master_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'forced master update failure';
end;
$$;

create trigger reject_photo_master_update
before update on public.supplement_products_master
for each row execute function pg_temp.reject_photo_master_update();

select throws_ok(
  $$
    select * from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-6', 2, 3,
      '[{"raw_name":"Zinc","canonical_name":"Zinc","ingredient_type":"active","dosage_value":15,"dosage_unit":"mg"}]'::jsonb,
      '[{"name":"Zinc","dosageValue":15,"dosageUnit":"mg"}]'::jsonb,
      'Forced master failure', null, 0.5, 'test-model', 'test-prompt-v1'
    )
  $$,
  'P0001',
  'forced master update failure',
  'master update failure aborts the transaction'
);

drop trigger reject_photo_master_update on public.supplement_products_master;

select is(
  (
    select photo_improvement_revision
    from public.supplement_products_master
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  2::bigint,
  'master update failure preserves the previous revision'
);

select is(
  (
    select dosage_value::integer
    from public.product_active_ingredients
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  200,
  'master update failure rolls back ingredient replacement'
);

select is(
  (
    select canonical_product ->> 'display_name'
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-2', 1, 2,
      '[{"raw_name":"ignored","canonical_name":"ignored","ingredient_type":"active"}]'::jsonb,
      '[{"name":"ignored"}]'::jsonb,
      'ignored', null, 0.1, 'test-model', 'test-prompt-v1'
    )
  ),
  'Atomic photo version 2',
  'idempotent response returns the committed master row'
);

select is(
  (
    select active_ingredient_rows -> 0 ->> 'raw_name'
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '0123456789012', 'attempt-2', 1, 2,
      '[{"raw_name":"ignored","canonical_name":"ignored","ingredient_type":"active"}]'::jsonb,
      '[{"name":"ignored"}]'::jsonb,
      'ignored', null, 0.1, 'test-model', 'test-prompt-v1'
    )
  ),
  'Magnesium',
  'idempotent response returns committed ingredient rows'
);

select is(
  (
    select count(*)::integer
    from public.product_score_refresh_queue
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
      and status in ('pending', 'processing', 'retry')
  ),
  1,
  'applied writes deduplicate score follow-up work'
);

insert into public.off_products (id, barcode, name, ingredients)
values (
  '10000000-0000-0000-0000-000000000002'::uuid,
  '0123456789012',
  'Concurrent duplicate target',
  'Wrong stale ingredient'
);

select is(
  (
    select transaction_outcome
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000002'::uuid,
      '0123456789012', 'attempt-duplicate-target', 0, 1,
      '[{"raw_name":"Wrong stale ingredient","canonical_name":"Wrong stale ingredient","ingredient_type":"active","dosage_value":999,"dosage_unit":"mg"}]'::jsonb,
      '[{"name":"Wrong stale ingredient","dosageValue":999,"dosageUnit":"mg"}]'::jsonb,
      'Concurrent duplicate target', null, 0.2, 'test-model', 'test-prompt-v1'
    )
  ),
  'rejected_stale',
  'a concurrent duplicate product cannot replace the barcode winner'
);

select is(
  (
    select canonical_product ->> 'product_id'
    from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000002'::uuid,
      '0123456789012', 'attempt-duplicate-target', 0, 1,
      '[{"raw_name":"Wrong stale ingredient","canonical_name":"Wrong stale ingredient","ingredient_type":"active"}]'::jsonb,
      '[{"name":"Wrong stale ingredient"}]'::jsonb,
      'Concurrent duplicate target', null, 0.2, 'test-model', 'test-prompt-v1'
    )
  ),
  '10000000-0000-0000-0000-000000000001',
  'duplicate-target response returns the committed barcode winner'
);

select is(
  (
    select count(*)::integer
    from public.supplement_products_master
    where product_id = '10000000-0000-0000-0000-000000000002'::uuid
  ),
  0,
  'duplicate target does not create a second canonical master product'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.commit_photo_improvement(uuid,text,text,bigint,bigint,jsonb,jsonb,text,text,double precision,text,text)',
    'execute'
  ),
  'service role can execute the RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.commit_photo_improvement(uuid,text,text,bigint,bigint,jsonb,jsonb,text,text,double precision,text,text)',
    'execute'
  ),
  'authenticated clients cannot execute the RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.commit_photo_improvement(uuid,text,text,bigint,bigint,jsonb,jsonb,text,text,double precision,text,text)',
    'execute'
  ),
  'anonymous clients cannot execute the RPC'
);

select throws_ok(
  $$
    select * from public.commit_photo_improvement(
      '10000000-0000-0000-0000-000000000001'::uuid,
      '9999999999999', 'attempt-7', 2, 3,
      '[{"raw_name":"Zinc","canonical_name":"Zinc","ingredient_type":"active"}]'::jsonb,
      '[{"name":"Zinc"}]'::jsonb,
      'Wrong target', null, 0.5, 'test-model', 'test-prompt-v1'
    )
  $$,
  '22023',
  'invalid photo improvement target',
  'RPC rejects a barcode-mismatched product target'
);

select is(
  (
    select photo_improvement_revision
    from public.supplement_products_master
    where product_id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  2::bigint,
  'invalid target leaves canonical state unchanged'
);

select * from finish();
rollback;
