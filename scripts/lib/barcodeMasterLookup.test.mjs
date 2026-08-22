import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadDoseNormalizationModule() {
  const source = readFileSync(
    new URL(
      "../../features/supplements/doseNormalization.js",
      import.meta.url,
    ),
    "utf8",
  ).replace(/\bexport\s+/gu, "");

  return new Function(
    `${source}\nreturn { normalizeIngredientDose };`,
  )();
}

function loadMasterLookup(masterRows) {
  const source = readFileSync(
    new URL("../../src/data/getLocalBarcodeScanProduct.js", import.meta.url),
    "utf8",
  );
  const transformed = source
    .replace(/import\s+[\s\S]*?;\n/gu, "")
    .replace(/export async function /gu, "async function ");
  const calls = [];
  let barcodeCandidates = [];
  const supabase = {
    from(table) {
      calls.push(table);
      if (table !== "supplement_products_master") {
        throw new Error(`Unexpected lookup after master hit: ${table}`);
      }

      return {
        select() {
          return {
            async in(column, values) {
              assert.equal(column, "barcode");
              barcodeCandidates = values;
              return { data: masterRows, error: null };
            },
          };
        },
      };
    },
  };
  const factory = new Function(
    "supabase",
    "logScanTiming",
    "isValidBarcode",
    "normalizeBarcode",
    "normalizeIngredientDose",
    `${transformed}\nreturn { fetchSupplementProductsMasterScanProduct };`,
  );
  const module = factory(
    supabase,
    () => {},
    (barcode) => /^\d{12,13}$/u.test(barcode),
    (barcode) => String(barcode).trim().replace(/[\s-]/gu, ""),
    loadDoseNormalizationModule().normalizeIngredientDose,
  );

  return {
    ...module,
    calls,
    getBarcodeCandidates: () => barcodeCandidates,
  };
}

test("UPC-A resolves a master row stored as its leading-zero EAN-13 variant", async () => {
  const lookup = loadMasterLookup([
    {
      product_id: "product-ean13",
      barcode: "0851387008437",
      display_name: "Leading-zero EAN product",
      active_ingredients_json: [
        {
          name: "Magnesium",
          dosageValue: "200",
          dosageUnit: "mg",
          dosageOriginalText: "200 mg",
          amountBasis: "per_serving",
          doseConfidence: "verified",
          doseReviewReason: "Matched the OCR row",
        },
      ],
      verification_status: "verified",
      photo_improvement_revision: 3,
    },
  ]);

  const product = await lookup.fetchSupplementProductsMasterScanProduct(
    "851387008437",
    "upc_a",
  );

  assert.deepEqual(lookup.getBarcodeCandidates(), [
    "851387008437",
    "0851387008437",
  ]);
  assert.deepEqual(lookup.calls, ["supplement_products_master"]);
  assert.equal(product.productId, "product-ean13");
  assert.equal(product.sourceIngredients[0].dosageValue, 200);
  assert.equal(product.sourceIngredients[0].dosageUnit, "mg");
  assert.equal(product.sourceIngredients[0].dosageOriginalText, "200 mg");
  assert.equal(product.sourceIngredients[0].dosageDisplay, "200 mg");
  assert.equal(product.sourceIngredients[0].amountBasis, "per_serving");
  assert.equal(product.sourceIngredients[0].doseConfidence, "verified");
  assert.equal(product.photoImprovementRevision, 3);
  assert.equal(product.photo_improvement_revision, 3);
  assert.equal(
    product.sourceIngredients[0].doseReviewReason,
    "Matched the OCR row",
  );
});

test("EAN-13 with a leading zero resolves a master row stored as UPC-A", async () => {
  const lookup = loadMasterLookup([
    {
      product_id: "product-upca",
      barcode: "851387008437",
      display_name: "UPC product",
      active_ingredients_json: [{ name: "Vitamin C" }],
      verification_status: "verified",
    },
  ]);

  const product = await lookup.fetchSupplementProductsMasterScanProduct(
    "0851387008437",
    "ean13",
  );

  assert.deepEqual(lookup.getBarcodeCandidates(), [
    "0851387008437",
    "851387008437",
  ]);
  assert.deepEqual(lookup.calls, ["supplement_products_master"]);
  assert.equal(product.productId, "product-upca");
});

test("legacy display-only master doses are promoted during local hydration", async () => {
  const lookup = loadMasterLookup([
    {
      product_id: "product-display-only",
      barcode: "0616612990570",
      display_name: "Legacy enzyme product",
      active_ingredients_json: [
        {
          name: "Lactase",
          dosageDisplay: "3000 FCC per capsule",
          doseConfidence: null,
        },
      ],
      verification_status: "verified",
    },
  ]);

  const product = await lookup.fetchSupplementProductsMasterScanProduct(
    "0616612990570",
    "ean13",
  );
  const [ingredient] = product.sourceIngredients;

  assert.equal(ingredient.name, "Lactase");
  assert.equal(ingredient.dosageValue, 3000);
  assert.equal(ingredient.dosageUnit, "FCC");
  assert.equal(ingredient.dosageDisplay, "3000 FCC");
  assert.equal(ingredient.amountBasis, "per_capsule");
  assert.equal(ingredient.normalizedDose.isLegacyConfidence, true);
  assert.equal(ingredient.normalizedDose.isScoringEligible, true);
});
