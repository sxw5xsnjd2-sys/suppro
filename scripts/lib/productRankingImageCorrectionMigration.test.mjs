import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607250001_correct_product_ranking_images.sql",
    import.meta.url,
  ),
  "utf8",
);

test("corrective ranking RPC returns independent thumbnail and full image fields", () => {
  assert.match(
    migration,
    /returns table \([\s\S]*?image_thumbnail_url text,[\s\S]*?image_url text,/u,
  );
  assert.match(
    migration,
    /master\.image_thumbnail_url[\s\S]*?as image_thumbnail_url/u,
  );
  assert.match(migration, /master\.image_url[\s\S]*?as image_url/u);
  assert.doesNotMatch(
    migration,
    /coalesce\(\s*nullif\(pg_catalog\.btrim\(master\.image_thumbnail_url\)/u,
  );
});

test("corrective migration removes only transient SerpApi thumbnails", () => {
  assert.match(
    migration,
    /update public\.supplement_products_master\s+set image_thumbnail_url = null/u,
  );
  assert.match(migration, /serpapi\\\.com/u);
  assert.doesNotMatch(migration, /set[\s\S]{0,80}image_url\s*=\s*null/iu);
});

test("corrective migration replaces the already-deployed RPC signature", () => {
  assert.match(
    migration,
    /drop function if exists public\.get_product_benefit_rankings/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_product_benefit_rankings[\s\S]*?to anon, authenticated, service_role/u,
  );
});
