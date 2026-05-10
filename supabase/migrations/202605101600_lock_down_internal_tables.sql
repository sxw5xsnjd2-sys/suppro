revoke insert, update, delete, truncate, trigger, references
on table
  public.food_exclusion_keywords,
  public.off_products_ai_classification,
  public.off_products_ai_extraction,
  public.off_products_ai_naming,
  public.off_products_pipeline_jobs,
  public.off_products_pipeline_retry_queue,
  public.off_products_pipeline_runs,
  public.supplement_canonical_map,
  public.supplement_missing_catalog_candidates,
  public.supplement_missing_catalog_occurrences,
  public.supplement_review_queue
from anon, authenticated;

revoke select
on table
  public.food_exclusion_keywords,
  public.off_products_ai_classification,
  public.off_products_ai_extraction,
  public.off_products_ai_naming,
  public.off_products_pipeline_jobs,
  public.off_products_pipeline_retry_queue,
  public.off_products_pipeline_runs,
  public.supplement_canonical_map,
  public.supplement_missing_catalog_candidates,
  public.supplement_missing_catalog_occurrences,
  public.supplement_review_queue
from anon, authenticated;
