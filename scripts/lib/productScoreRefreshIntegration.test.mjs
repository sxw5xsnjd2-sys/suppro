import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const edge = read("../../supabase/functions/refresh-product-scores/index.ts");
const config = read("../../supabase/config.toml");
const researchEdge = read(
  "../../supabase/functions/research-pending-supplements/index.ts",
);
const researchScript = read("../../scripts/researchPendingSupplements.mjs");
const photoIngestion = read(
  "../../supabase/functions/scan-supplement-photos/index.ts",
);
const externalIngestion = read(
  "../../supabase/functions/persist-go-upc-product/index.ts",
);

test("refresh endpoint is service-protected and strictly bounded", () => {
  assert.match(edge, /isTrustedEdgeFunctionRequest/u);
  assert.match(edge, /MAX_PRODUCT_SCORE_REFRESH_BATCH/u);
  assert.match(edge, /productIds\.length > limit/u);
  assert.match(edge, /Dry-run requests must supply explicit productIds/u);
  assert.match(edge, /body\.write !== false/u);
  assert.match(
    config,
    /\[functions\.refresh-product-scores\][\s\S]*?verify_jwt = false[\s\S]*?refresh-product-scores\/index\.ts/u,
  );
});

test("research completion explicitly enqueues linked products", () => {
  assert.match(researchEdge, /enqueueProductScoreRefreshForSupplement/u);
  assert.match(researchEdge, /research_pending_supplement_completed/u);
  assert.match(
    researchScript,
    /enqueue_product_score_refresh_for_supplement/u,
  );
  assert.match(researchScript, /research_pending_supplement_completed/u);
});

test("canonical product and ingredient persistence explicitly enqueue refresh", () => {
  assert.match(photoIngestion, /enqueueProductScoreRefresh/u);
  assert.match(photoIngestion, /photo_product_ingredients_persisted/u);
  assert.match(externalIngestion, /enqueueProductScoreRefresh/u);
  assert.match(externalIngestion, /external_product_canonicalized/u);
});

test("worker configuration embeds no scheduler or provider secret", () => {
  assert.doesNotMatch(config, /refresh-product-scores[\s\S]*?schedule\s*=/u);
  assert.doesNotMatch(edge, /set\s+secret|GO_UPC|EAN_SEARCH|OPENAI_API_KEY/iu);
});
