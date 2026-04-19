begin;
;
drop materialized view if exists off_products_non_obvious_food;

create materialized view off_products_non_obvious_food as
select p.id
from off_products p
where not exists (
  select 1
  from food_exclusion_keywords k
  where k.is_active = true
    and (
      (k.match_target in ('name', 'both') and p.name ilike '%' || k.keyword || '%')
      or
      (k.match_target in ('ingredients', 'both') and p.ingredients ilike '%' || k.keyword || '%')
    )
);

create unique index off_products_non_obvious_food_id_idx
on off_products_non_obvious_food (id);

truncate table
  off_products_pipeline_retry_queue,
  off_products_pipeline_jobs,
  off_products_pipeline_runs,
  supplement_catalog_review_candidates;

commit;
