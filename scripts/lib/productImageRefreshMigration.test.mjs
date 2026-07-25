import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607240001_add_product_image_refresh_queue.sql",
    import.meta.url,
  ),
  "utf8",
);

test("image queue stores work metadata only and remains service-owned", () => {
  assert.match(migration, /create table public\.product_image_refresh_queue/u);
  assert.doesNotMatch(
    migration,
    /product_image_refresh_queue[\s\S]*?image_url\s+text/iu,
  );
  assert.match(
    migration,
    /alter table public\.product_image_refresh_queue enable row level security/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.product_image_refresh_queue\s+from public, anon, authenticated/u,
  );
  assert.match(migration, /grant all on table public\.product_image_refresh_queue to service_role/u);
});

test("enqueue is bounded, cooldown-aware, and actively deduplicated", () => {
  assert.match(migration, /pg_catalog\.cardinality\(p_product_ids\) > 25/u);
  assert.match(migration, /image_status = 'failed'/u);
  assert.match(migration, /image_status = 'skipped'/u);
  assert.match(migration, /image_last_checked_at/u);
  assert.match(
    migration,
    /previous\.status = 'failed'[\s\S]*?previous\.completed_at/u,
  );
  assert.match(migration, /product_image_refresh_queue_active_dedupe_idx/u);
  assert.match(
    migration,
    /on conflict \(product_id\)[\s\S]*?where status in \('pending', 'processing', 'retry'\)/u,
  );
});

test("queue claims are skip-locked, globally budgeted, and recover stale work", () => {
  assert.match(migration, /pg_advisory_xact_lock/u);
  assert.match(migration, /p_daily_limit integer default 100/u);
  assert.match(migration, /for update skip locked/u);
  assert.match(migration, /interval '15 minutes'/u);
  assert.match(migration, /daily_attempt_count/u);
  assert.match(migration, /attempt_count >= 5/u);
});

test("all queue mutation functions are service-role-only", () => {
  for (const signature of [
    "enqueue_product_image_refreshes\\(uuid\\[\\], integer, integer\\)",
    "claim_product_image_refresh_queue\\(integer, text, integer\\)",
    "retry_product_image_refresh\\(uuid, text, text, integer\\)",
    "complete_product_image_refresh\\(uuid, text, text, text\\)",
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
});
