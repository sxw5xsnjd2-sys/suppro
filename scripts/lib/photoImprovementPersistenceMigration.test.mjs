import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202608030001_atomic_photo_improvement_persistence.sql",
    import.meta.url,
  ),
  "utf8",
);

function commitFunctionBody() {
  const start = migration.indexOf(
    "create or replace function public.commit_photo_improvement",
  );
  const end = migration.indexOf(
    "revoke all on function public.commit_photo_improvement",
    start,
  );
  assert.ok(start >= 0, "missing commit_photo_improvement RPC");
  assert.ok(end > start, "missing RPC privilege boundary");
  return migration.slice(start, end);
}

test("photo improvements store a constrained revision and accepted attempt", () => {
  assert.match(migration, /photo_improvement_revision bigint/u);
  assert.match(migration, /photo_improvement_accepted_attempt_id text/u);
  assert.match(migration, /set photo_improvement_revision = 0/u);
  assert.match(
    migration,
    /supplement_products_master_photo_improvement_revision_check/u,
  );
  assert.match(
    migration,
    /supplement_products_master_photo_improvement_revision_idx/u,
  );
});

test("RPC locks the target and applies only the next expected revision", () => {
  const body = commitFunctionBody();

  assert.match(body, /pg_advisory_xact_lock/u);
  assert.match(body, /from public\.off_products[\s\S]*?for update/u);
  assert.match(body, /p_proposed_revision <> p_expected_revision \+ 1/u);
  assert.match(body, /v_stored_revision <> p_expected_revision/u);
  assert.match(body, /v_stored_revision >= p_proposed_revision/u);
  assert.match(body, /transaction_outcome := 'rejected_stale'/u);
});

test("same attempt and revision are idempotent while competing attempts are stale", () => {
  const body = commitFunctionBody();

  assert.match(
    body,
    /v_accepted_attempt_id = pg_catalog\.btrim\(p_photo_attempt_id\)[\s\S]*?v_stored_revision = p_proposed_revision/u,
  );
  assert.match(body, /transaction_outcome := 'already_applied'/u);
  assert.match(body, /transaction_outcome := 'applied'/u);
});

test("ingredient replacement and master update are contained in one database function", () => {
  const body = commitFunctionBody();

  assert.match(body, /delete from public\.product_active_ingredients/u);
  assert.match(body, /insert into public\.product_active_ingredients/u);
  assert.match(body, /insert into public\.supplement_products_master/u);
  assert.match(body, /on conflict \(product_id\)[\s\S]*?do update/u);
  assert.match(
    body,
    /canonical_product := pg_catalog\.to_jsonb\(v_master\)/u,
  );
  assert.match(body, /active_ingredient_rows := v_active_rows/u);
  assert.match(
    body,
    /pg_catalog\.jsonb_array_length\(p_master_active_ingredients\)/u,
  );
  assert.doesNotMatch(body, /row_data\.dosage_value\s+is\s+not\s+null/iu);
  assert.doesNotMatch(body, /row_data\.dosage_unit\s+is\s+not\s+null/iu);
  assert.doesNotMatch(body, /exception\s+when[\s\S]*?restore/iu);
});

test("RPC is route-specific, validates the product barcode, and is service-role-only", () => {
  const body = commitFunctionBody();

  assert.match(body, /security definer/u);
  assert.match(body, /set search_path = ''/u);
  assert.match(body, /invalid photo improvement target/u);
  assert.match(
    migration,
    /revoke all on function public\.commit_photo_improvement[\s\S]*?from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.commit_photo_improvement[\s\S]*?to service_role/u,
  );
  assert.doesNotMatch(migration, /to anon\b|to authenticated\b/u);
});

test("migration documents a practical rollback", () => {
  assert.match(migration, /Rollback/u);
  assert.match(migration, /drop function public\.commit_photo_improvement/u);
  assert.match(migration, /drop column photo_improvement_revision/u);
});
