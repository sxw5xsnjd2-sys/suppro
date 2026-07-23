import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607220002_add_product_ranking_cache.sql",
    import.meta.url,
  ),
  "utf8",
);

function between(startMarker, endMarker) {
  const start = migration.indexOf(startMarker);
  const end = migration.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return migration.slice(start, end);
}

test("migration records verified live key and relationship types", () => {
  assert.match(
    migration,
    /supplement_products_master\.product_id: uuid primary key/u,
  );
  assert.match(migration, /supplements\.id: uuid primary key/u);
  assert.match(migration, /product_active_ingredients\.id: bigint/u);
  assert.match(
    migration,
    /product_active_ingredients\.canonical_supplement_id: uuid/u,
  );
  assert.match(migration, /supplement_benefits\.id: bigint/u);
  assert.match(migration, /supplement_benefits\.label: required text/u);
  assert.match(
    migration,
    /off_products_ai_naming\.product_id: uuid, canonical product key/u,
  );
  assert.match(
    migration,
    /off_products_ai_naming\.brand_name: nullable text canonical brand/u,
  );
  assert.match(
    migration,
    /product_id uuid not null\s+references public\.supplement_products_master\(product_id\)/u,
  );
  assert.match(
    migration,
    /driver_canonical_ingredient_id uuid not null\s+references public\.supplements\(id\)/u,
  );
});

test("overall evidence and product-benefit scores remain separate and versioned", () => {
  assert.match(
    migration,
    /add column if not exists overall_evidence_score numeric/u,
  );
  assert.match(
    migration,
    /overall_evidence_calculation_version text/u,
  );
  assert.match(migration, /overall_evidence_calculated_at timestamptz/u);
  assert.match(migration, /product_benefit_score numeric not null/u);
  assert.match(migration, /calculation_version text not null/u);
  assert.match(migration, /calculated_at timestamptz not null/u);
  assert.match(migration, /product_benefit_score between 0 and 100/u);
  assert.doesNotMatch(migration, /product_benefit_score numeric\s*\(/u);
});

test("benefit cache retains the complete valid winning-driver contract", () => {
  assert.match(migration, /benefit_label text not null/u);
  assert.match(migration, /benefit_key text generated always as/u);
  assert.match(migration, /driver_ingredient_name text not null/u);
  assert.match(
    migration,
    /raw_active_ingredient_benefit_score numeric not null/u,
  );
  assert.match(migration, /validated_dose_factor numeric not null/u);
  assert.match(migration, /dose_comparison_status text not null/u);
  for (const status of [
    "above_target_range",
    "below_effective_min",
    "effective_below_target",
    "severely_underdosed",
    "within_target_range",
  ]) {
    assert.match(migration, new RegExp(`'${status}'`, "u"));
  }
});

test("ranking read is bounded, keyset paginated, canonical, and trusted-only", () => {
  const rankingFunction = between(
    "create or replace function public.get_product_benefit_rankings(",
    "comment on function public.get_product_benefit_rankings(",
  );

  assert.match(rankingFunction, /p_limit integer default 25/u);
  assert.match(rankingFunction, /p_limit > 100/u);
  assert.match(rankingFunction, /all keyset cursor fields must be supplied/u);
  assert.match(
    rankingFunction,
    /inner join public\.supplement_products_master as master\s+on master\.product_id = score\.product_id/u,
  );
  assert.match(rankingFunction, /product_brand text/u);
  assert.match(rankingFunction, /product_image_url text/u);
  assert.match(
    rankingFunction,
    /nullif\(pg_catalog\.btrim\(naming\.brand_name\), ''\) as product_brand/u,
  );
  assert.match(
    rankingFunction,
    /left join public\.off_products_ai_naming as naming\s+on naming\.product_id = master\.product_id/u,
  );
  assert.match(rankingFunction, /ranked\.product_brand/u);
  assert.match(
    rankingFunction,
    /nullif\(pg_catalog\.btrim\(master\.image_thumbnail_url\), ''\)[\s\S]*?nullif\(pg_catalog\.btrim\(master\.image_url\), ''\)[\s\S]*?as product_image_url/u,
  );
  assert.match(rankingFunction, /ranked\.product_image_url/u);
  assert.match(
    rankingFunction,
    /score\.product_benefit_score is not null/u,
  );
  assert.match(
    rankingFunction,
    /master\.verification_status in \(\s*'verified',\s*'photo_verified',\s*'dsld_verified'/u,
  );
  assert.doesNotMatch(rankingFunction, /ean_search_unverified/u);
  assert.doesNotMatch(rankingFunction, /go_upc_unverified/u);
  assert.match(rankingFunction, /ranked\.product_benefit_score desc/u);
  assert.match(rankingFunction, /ranked\.overall_evidence_sort_score desc/u);
  assert.match(rankingFunction, /ranked\.verification_precedence desc/u);
  assert.match(
    rankingFunction,
    /ranked\.normalized_product_name collate "C" asc/u,
  );
  assert.match(rankingFunction, /ranked\.product_id asc/u);
  assert.match(rankingFunction, /ranked\.product_id > p_after_product_id/u);
  assert.match(rankingFunction, /limit p_limit/u);
});

test("history snapshot read has a strict bulk-ID maximum and preserves null", () => {
  const snapshotFunction = between(
    "create or replace function public.get_product_score_snapshots(",
    "comment on function public.get_product_score_snapshots(uuid[])",
  );

  assert.match(snapshotFunction, /p_product_ids uuid\[\]/u);
  assert.match(snapshotFunction, /cardinality\(p_product_ids\) > 50/u);
  assert.match(snapshotFunction, /array_position\(p_product_ids, null\)/u);
  assert.match(
    snapshotFunction,
    /master\.overall_evidence_score as score/u,
  );
  assert.doesNotMatch(snapshotFunction, /coalesce\(master\.overall_evidence_score/u);
  assert.match(snapshotFunction, /master\.product_id = any\(p_product_ids\)/u);
});

test("cache and queue writes remain service-role-only behind RLS", () => {
  assert.match(
    migration,
    /alter table public\.product_benefit_scores enable row level security/u,
  );
  assert.match(
    migration,
    /alter table public\.product_score_refresh_queue enable row level security/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.product_benefit_scores\s+from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.product_score_refresh_queue\s+from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant all on table public\.product_benefit_scores to service_role/u,
  );
  assert.match(
    migration,
    /grant all on table public\.product_score_refresh_queue to service_role/u,
  );
  assert.doesNotMatch(migration, /create policy/iu);
  assert.doesNotMatch(migration, /create trigger/iu);
});

test("RPC grants are narrow and SECURITY DEFINER is constrained", () => {
  const rankingFunction = between(
    "create or replace function public.get_product_benefit_rankings(",
    "comment on function public.get_product_benefit_rankings(",
  );
  const snapshotFunction = between(
    "create or replace function public.get_product_score_snapshots(",
    "comment on function public.get_product_score_snapshots(uuid[])",
  );

  assert.match(rankingFunction, /security definer\s+set search_path = pg_catalog/u);
  assert.match(snapshotFunction, /security invoker\s+set search_path = pg_catalog/u);
  assert.match(
    migration,
    /grant execute on function public\.get_product_benefit_rankings\([\s\S]*?\) to anon, authenticated, service_role/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_product_score_snapshots\(uuid\[\]\)\s+to anon, authenticated, service_role/u,
  );
  assert.doesNotMatch(migration, /grant select on table public\.product_benefit_scores/iu);
});

test("ranking, product, version, and queue indexes are present", () => {
  assert.match(migration, /product_benefit_scores_benefit_rank_idx/u);
  assert.match(migration, /product_benefit_scores_product_idx/u);
  assert.match(migration, /supplement_products_master_ranking_ties_idx/u);
  assert.match(
    migration,
    /supplement_products_master_overall_evidence_version_idx/u,
  );
  assert.match(migration, /product_score_refresh_queue_active_dedupe_idx/u);
  assert.match(migration, /product_score_refresh_queue_ready_idx/u);
  assert.match(migration, /where status in \('pending', 'processing', 'retry'\)/u);
  assert.match(migration, /where status in \('pending', 'retry'\)/u);
});

test("migration is additive, rollback-aware, and performs no backfill", () => {
  assert.match(migration, /Rollback \(only while no later writer depends/u);
  assert.match(migration, /canonical catalogue\/product rows are untouched/u);
  assert.doesNotMatch(migration, /drop table(?!.*Rollback)/iu);
  assert.doesNotMatch(migration, /update public\.supplement_products_master/iu);
  assert.doesNotMatch(migration, /insert into public\.product_benefit_scores/iu);
  assert.doesNotMatch(migration, /insert into public\.product_score_refresh_queue/iu);
});
