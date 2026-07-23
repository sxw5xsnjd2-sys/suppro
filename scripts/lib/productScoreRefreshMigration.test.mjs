import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607220003_add_product_score_refresh_workflows.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name, nextMarker) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf(nextMarker, start + 1);
  assert.ok(start >= 0, `missing ${name}`);
  assert.ok(end > start, `missing end marker for ${name}`);
  return migration.slice(start, end);
}

test("queue enqueue is current-version deduplicated and never calculates in triggers", () => {
  const enqueue = functionBody(
    "enqueue_product_score_refresh(",
    "create or replace function public.enqueue_product_score_refresh_for_supplement",
  );
  assert.match(enqueue, /on conflict \(product_id, calculation_version\)/u);
  assert.match(enqueue, /where status in \('pending', 'processing', 'retry'\)/u);
  assert.match(enqueue, /v_reason,\s+'pending',/u);
  assert.doesNotMatch(enqueue, /product_benefit_scores/u);
  assert.match(
    migration,
    /select 'recommended-dose-product-ranking\.v1'::text/u,
  );
});

test("claims are capped, skip locked, resumable, and reclaim stale work", () => {
  const claim = functionBody(
    "claim_product_score_refresh_queue(",
    "create or replace function public.retry_product_score_refresh",
  );
  assert.match(claim, /p_limit > 25/u);
  assert.match(claim, /for update skip locked/u);
  assert.match(claim, /interval '15 minutes'/u);
  assert.match(claim, /attempt_count = queue\.attempt_count \+ 1/u);
});

test("retry is bounded and transitions repeated failures to failed", () => {
  const retry = functionBody(
    "retry_product_score_refresh(",
    "create or replace function public.commit_product_score_refresh",
  );
  assert.match(retry, /p_retry_after_seconds > 3600/u);
  assert.match(retry, /attempt_count >= 5 then 'failed' else 'retry'/u);
  assert.match(retry, /queue\.locked_by = pg_catalog\.btrim\(p_worker_id\)/u);
});

test("commit atomically replaces versions, removes obsolete benefits, and completes queue", () => {
  const commit = functionBody(
    "commit_product_score_refresh(",
    "create or replace function public.queue_product_scores_for_benefit_change",
  );
  assert.match(commit, /jsonb_array_length\(p_benefit_rows\)/u);
  assert.match(commit, /v_benefit_count > 200/u);
  assert.match(commit, /overall_evidence_score = p_overall_evidence_score/u);
  assert.match(commit, /existing\.calculation_version <> v_version/u);
  assert.match(commit, /not exists \(/u);
  assert.match(commit, /on conflict \(product_id, benefit_key, calculation_version\)/u);
  assert.match(commit, /when queue\.updated_at > queue\.locked_at then 'pending'/u);
  assert.match(commit, /else 'completed'/u);
});

test("every scoring input source only enqueues affected canonical products", () => {
  for (const trigger of [
    "supplement_benefits_product_score_invalidation",
    "supplements_product_score_invalidation",
    "product_active_ingredients_score_invalidation",
    "supplement_products_master_score_invalidation",
  ]) {
    assert.match(migration, new RegExp(`create trigger ${trigger}`, "u"));
  }
  assert.match(
    migration,
    /after update of evidence_score, how_to_use, recommended_dose_json,\s+dose_scoring_profile_json on public\.supplements/u,
  );
  assert.match(migration, /supplement_benefits_changed/u);
  assert.match(migration, /product_ingredient_link_changed/u);
  assert.match(migration, /verification_status is distinct from/u);
  assert.match(migration, /serving_size_text is distinct from/u);
});

test("all queue and cache mutation functions remain service-role-only", () => {
  for (const signature of [
    "enqueue_product_score_refresh\\(uuid, text, text\\)",
    "enqueue_product_score_refresh_for_supplement\\(uuid, text, text\\)",
    "claim_product_score_refresh_queue\\(integer, text, text\\)",
    "retry_product_score_refresh\\(uuid, text, text, integer\\)",
    "commit_product_score_refresh\\(uuid, text, timestamptz, numeric, jsonb, uuid\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature}\\s+from public, anon, authenticated`, "u"),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${signature}\\s+to service_role`, "u"),
    );
  }
  assert.doesNotMatch(migration, /grant execute[\s\S]*?to anon/u);
  assert.doesNotMatch(migration, /cron\.schedule|create\s+extension\s+.*pg_cron/iu);
});

test("migration is additive, rollback-aware, and contains no backfill", () => {
  assert.match(migration, /Rollback \(only after stopping all score workers\)/u);
  assert.match(migration, /creates no schedule and performs no backfill/u);
  assert.doesNotMatch(migration, /truncate table/iu);
  assert.doesNotMatch(migration, /drop table/iu);
});
