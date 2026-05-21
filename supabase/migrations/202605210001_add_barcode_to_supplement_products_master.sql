alter table public.supplement_products_master
add column if not exists barcode text;

create index if not exists supplement_products_master_barcode_idx
on public.supplement_products_master (barcode)
where barcode is not null and barcode <> '';

update public.supplement_products_master as master
set barcode = btrim(source.barcode)
from public.off_products as source
where master.product_id = source.id
  and nullif(btrim(master.barcode), '') is null
  and nullif(btrim(source.barcode), '') is not null;
