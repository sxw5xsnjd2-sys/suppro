-- Master rows still missing barcode despite a linked OFF product barcode.
select
  master.product_id,
  master.display_name,
  btrim(source.barcode) as off_barcode
from public.supplement_products_master as master
join public.off_products as source
  on source.id = master.product_id
where nullif(btrim(master.barcode), '') is null
  and nullif(btrim(source.barcode), '') is not null
order by master.display_name nulls last, master.product_id;

-- Duplicate non-empty master barcodes.
select
  normalized.barcode,
  count(*) as row_count,
  array_agg(normalized.product_id order by normalized.product_id) as product_ids
from (
  select
    product_id,
    btrim(barcode) as barcode
  from public.supplement_products_master
  where nullif(btrim(barcode), '') is not null
) as normalized
group by normalized.barcode
having count(*) > 1
order by row_count desc, normalized.barcode;

-- Rows where master barcode differs from linked OFF barcode.
select
  master.product_id,
  master.display_name,
  btrim(master.barcode) as master_barcode,
  btrim(source.barcode) as off_barcode
from public.supplement_products_master as master
join public.off_products as source
  on source.id = master.product_id
where nullif(btrim(master.barcode), '') is not null
  and nullif(btrim(source.barcode), '') is not null
  and btrim(master.barcode) <> btrim(source.barcode)
order by master.display_name nulls last, master.product_id;
