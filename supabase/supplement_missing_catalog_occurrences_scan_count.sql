alter table if exists supplement_missing_catalog_occurrences
add column if not exists occurrence_count integer not null default 1;

update supplement_missing_catalog_occurrences
set occurrence_count = 1
where occurrence_count is null or occurrence_count < 1;
