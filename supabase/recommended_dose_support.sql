alter table if exists supplements
add column if not exists recommended_dose_status text not null default 'missing'
check (recommended_dose_status in ('parsed', 'ambiguous', 'unscorable', 'missing'));

alter table if exists supplements
add column if not exists recommended_dose_json jsonb;

alter table if exists supplements
add column if not exists dose_scoring_profile_json jsonb;

create index if not exists supplements_recommended_dose_status_idx
on supplements (recommended_dose_status);

alter table if exists supplement_products_master
add column if not exists serving_size_text text;
