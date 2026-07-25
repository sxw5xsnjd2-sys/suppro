import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607240002_schedule_product_image_refresh.sql",
    import.meta.url,
  ),
  "utf8",
);
const config = readFileSync(
  new URL("../../supabase/config.toml", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL(
    "../../supabase/functions/refresh-product-images/index.ts",
    import.meta.url,
  ),
  "utf8",
);

test("image worker is scheduled conservatively with bounded provider usage", () => {
  assert.match(
    migration,
    /cron\.schedule\(\s*'suppro-refresh-product-images',\s*'\*\/2 \* \* \* \*'/u,
  );
  assert.match(migration, /'limit', 2/u);
  assert.match(migration, /'dailyLimit', 100/u);
  assert.match(migration, /timeout_milliseconds := 120000/u);
});

test("image schedule uses named Vault secrets and is idempotently replaced", () => {
  assert.match(migration, /suppro_refresh_product_images_url/u);
  assert.match(migration, /suppro_refresh_product_images_server_credential/u);
  assert.match(migration, /from vault\.decrypted_secrets as secret/u);
  assert.match(migration, /perform cron\.unschedule\(v_job_id\)/u);
  assert.doesNotMatch(migration, /vault\.create_secret/u);
  assert.doesNotMatch(migration, /https?:\/\//iu);
});

test("refresh image worker performs internal auth with gateway JWT checks disabled", () => {
  assert.match(
    config,
    /\[functions\.refresh-product-images\][\s\S]*?verify_jwt = false[\s\S]*?refresh-product-images\/index\.ts/u,
  );
  assert.match(
    config,
    /\[functions\.enrich-product-image\][\s\S]*?verify_jwt = false/u,
  );
  assert.match(worker, /isTrustedEdgeFunctionRequest/u);
  assert.match(worker, /apikey: serviceRoleKey/u);
});
