import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadDecisionModule() {
  const source = readFileSync(
    new URL("../../src/data/dsldSourceDecision.js", import.meta.url),
    "utf8"
  );
  const transformed = source.replace(/export function /g, "function ");
  const factory = new Function(
    `${transformed}\nreturn { hasUsefulSupplementFactsData, getOpenFoodFactsQuality, shouldCheckDsld, buildScanDebugMetadata };`
  );
  return factory();
}

const {
  getOpenFoodFactsQuality,
  shouldCheckDsld,
  buildScanDebugMetadata,
} = loadDecisionModule();

test("good OpenFoodFacts result skips DSLD", () => {
  const product = {
    scanDataSource: "open_food_facts",
    productName: "Vitamin D3",
    ingredientsText: "Vitamin D3 25 mcg, olive oil",
    sourceIngredients: ["Vitamin D3 25 mcg", "Olive oil"],
  };

  assert.equal(getOpenFoodFactsQuality(product), "good");
  assert.equal(
    shouldCheckDsld({
      barcode: "123456789012",
      featureEnabled: true,
      primaryProduct: product,
      openFoodFactsQuality: "good",
    }),
    false
  );
});

test("poor OpenFoodFacts result allows DSLD attachment", () => {
  const product = {
    scanDataSource: "open_food_facts",
    productName: "Natrol Melatonin",
    ingredientsText: "Melatonin, tapioca syrup",
    sourceIngredients: ["Melatonin", "Tapioca Syrup"],
  };

  assert.equal(getOpenFoodFactsQuality(product), "low");
  assert.equal(
    shouldCheckDsld({
      barcode: "047469075859",
      featureEnabled: true,
      primaryProduct: product,
      openFoodFactsQuality: "low",
    }),
    true
  );
});

test("poor OpenFoodFacts result plus DSLD miss keeps photo fallback path unchanged", () => {
  const debug = buildScanDebugMetadata({
    offFound: false,
    offQuality: "missing",
    dsldChecked: true,
    dsldCacheHit: false,
    dsldConfidence: "low",
    finalSourceUsed: "photo_fallback_pending",
  });

  assert.deepEqual(debug, {
    off_found: false,
    off_quality: "missing",
    dsld_checked: true,
    dsld_cache_hit: false,
    dsld_confidence: "low",
    final_source_used: "photo_fallback_pending",
  });
});
