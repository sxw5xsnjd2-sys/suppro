import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607230001_schedule_product_score_refresh.sql",
    import.meta.url,
  ),
  "utf8",
);
const edge = readFileSync(
  new URL(
    "../../supabase/functions/refresh-product-scores/index.ts",
    import.meta.url,
  ),
  "utf8",
);
const worker = readFileSync(
  new URL(
    "../../supabase/functions/_shared/product-ranking-worker.js",
    import.meta.url,
  ),
  "utf8",
);

test("scheduler runs the bounded worker daily at 03:00", () => {
  assert.match(
    migration,
    /cron\.schedule\(\s*'suppro-refresh-product-scores',\s*'0 3 \* \* \*'/u,
  );
  assert.match(migration, /net\.http_post\(/u);
  assert.match(
    migration,
    /body := jsonb_build_object\(\s*'limit', 25,\s*'write', true\s*\)/u,
  );
  assert.doesNotMatch(migration, /'productIds'/u);

  const workerLimit = worker.match(/MAX_PRODUCT_SCORE_REFRESH_BATCH = (\d+)/u);
  const scheduledLimit = migration.match(/'limit', (\d+)/u);
  assert.ok(workerLimit);
  assert.ok(scheduledLimit);
  assert.equal(scheduledLimit[1], workerLimit[1]);
});

test("scheduler reads URL and server credential only from named Vault secrets", () => {
  assert.match(migration, /from vault\.decrypted_secrets as secret/u);
  assert.match(migration, /suppro_refresh_product_scores_url/u);
  assert.match(
    migration,
    /suppro_refresh_product_scores_server_credential/u,
  );
  assert.match(
    migration,
    /'Authorization', 'Bearer ' \|\| scheduler_secrets\.server_credential/u,
  );
  assert.match(
    migration,
    /'apikey', scheduler_secrets\.server_credential/u,
  );
  assert.match(edge, /req\.headers\.get\("Authorization"\)/u);
  assert.match(edge, /req\.headers\.get\("apikey"\)/u);
  assert.doesNotMatch(migration, /vault\.create_secret/u);
});

test("migration contains no hardcoded URL, API key, JWT, or service credential", () => {
  assert.doesNotMatch(migration, /https?:\/\//iu);
  assert.doesNotMatch(migration, /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./u);
  assert.doesNotMatch(migration, /sb_(?:secret|publishable)_[a-zA-Z0-9_-]+/u);
  assert.doesNotMatch(
    migration,
    /(?:SUPABASE_SERVICE_ROLE_KEY|INTERNAL_SERVICE_ROLE_KEY)\s*[:=]\s*['"][^'"]+['"]/u,
  );
});

test("job replacement is idempotent and operational comments are present", () => {
  const unscheduleIndex = migration.indexOf("perform cron.unschedule(v_job_id)");
  const scheduleIndex = migration.indexOf("select cron.schedule(");
  assert.ok(unscheduleIndex >= 0);
  assert.ok(scheduleIndex > unscheduleIndex);
  assert.match(migration, /Inspect:/u);
  assert.match(migration, /Pause:/u);
  assert.match(migration, /Resume:/u);
  assert.match(migration, /Unschedule:/u);
});

test("required extensions and Vault preflight are explicit", () => {
  assert.match(
    migration,
    /create extension if not exists pg_cron with schema pg_catalog/u,
  );
  assert.match(
    migration,
    /create extension if not exists pg_net with schema extensions/u,
  );
  assert.match(migration, /from vault\.secrets as secret/u);
  assert.match(migration, /required product score refresh Vault secrets are missing/u);
});
