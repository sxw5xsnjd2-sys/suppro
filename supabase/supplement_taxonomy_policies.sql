create table if not exists supplement_taxonomy_policies (
  normalized_name text primary key,
  action text not null check (
    action in ('create_canonical', 'alias_existing', 'ignore', 'manual_review')
  ),
  canonical_name text,
  target_supplement_id uuid references supplements (id) on delete restrict,
  target_supplement_name text,
  reason text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      action = 'create_canonical' and
      canonical_name is not null and
      target_supplement_id is null and
      target_supplement_name is null
    ) or (
      action = 'alias_existing' and
      canonical_name is null and
      target_supplement_id is not null and
      target_supplement_name is not null
    ) or (
      action = 'ignore' and
      canonical_name is null and
      target_supplement_id is null and
      target_supplement_name is null
    ) or (
      action = 'manual_review' and
      canonical_name is null and
      target_supplement_id is null and
      target_supplement_name is null
    )
  )
);

create index if not exists supplement_taxonomy_policies_active_action_idx
on supplement_taxonomy_policies (active, action);

create index if not exists supplement_taxonomy_policies_alias_target_idx
on supplement_taxonomy_policies (target_supplement_id)
where action = 'alias_existing' and active = true;

insert into supplement_taxonomy_policies (
  normalized_name,
  action,
  canonical_name,
  target_supplement_id,
  target_supplement_name,
  reason,
  active
)
values
  (
    'electrolytes',
    'ignore',
    null,
    null,
    null,
    'Generic hydration bucket, not one canonical supplement ingredient.',
    true
  ),
  (
    'digestive enzymes',
    'create_canonical',
    'Digestive Enzymes',
    null,
    null,
    'Stable supplement-market umbrella term users search directly.',
    true
  ),
  (
    'bioflavonoids',
    'create_canonical',
    'Bioflavonoids',
    null,
    null,
    'Broad marketed supplement label intentionally allowed as its own page.',
    true
  ),
  (
    'protease',
    'create_canonical',
    'Protease',
    null,
    null,
    'Single enzyme ingredient used directly as a supplement ingredient name.',
    true
  ),
  (
    'lipase',
    'create_canonical',
    'Lipase',
    null,
    null,
    'Single enzyme ingredient used directly as a supplement ingredient name.',
    true
  ),
  (
    'lactase',
    'create_canonical',
    'Lactase',
    null,
    null,
    'Single enzyme ingredient used directly as a supplement ingredient name.',
    true
  ),
  (
    'cellulase',
    'create_canonical',
    'Cellulase',
    null,
    null,
    'Single enzyme ingredient used directly as a supplement ingredient name.',
    true
  ),
  (
    'olive extract',
    'manual_review',
    null,
    null,
    null,
    'Ambiguous botanical extract lacking plant-part and preparation specificity.',
    true
  )
on conflict (normalized_name) do update
set
  action = excluded.action,
  canonical_name = excluded.canonical_name,
  target_supplement_id = excluded.target_supplement_id,
  target_supplement_name = excluded.target_supplement_name,
  reason = excluded.reason,
  active = excluded.active,
  updated_at = now();

insert into supplement_taxonomy_policies (
  normalized_name,
  action,
  canonical_name,
  target_supplement_id,
  target_supplement_name,
  reason,
  active
)
select
  'live cultures',
  'alias_existing',
  null,
  'cda42a67-b951-48f7-8941-1221fd9e6117'::uuid,
  'Probiotics',
  'Exact consumer synonym for probiotics in supplement labeling.',
  true
where exists (
  select 1
  from supplements
  where id = 'cda42a67-b951-48f7-8941-1221fd9e6117'::uuid
)
on conflict (normalized_name) do update
set
  action = excluded.action,
  canonical_name = excluded.canonical_name,
  target_supplement_id = excluded.target_supplement_id,
  target_supplement_name = excluded.target_supplement_name,
  reason = excluded.reason,
  active = excluded.active,
  updated_at = now();
