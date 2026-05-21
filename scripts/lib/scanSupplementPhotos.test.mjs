import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadEdgeFunctionErrorsModule() {
  const source = readFileSync(
    new URL("../../src/lib/edgeFunctionErrors.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  normalizeEdgeFunctionError,
};`
  );

  return factory();
}

function createFailure({
  category,
  code = null,
  message = "",
  status = null,
  retryAfterSeconds = null,
  isQuotaLimited = false,
}) {
  const error = new Error(message || code || category || "scanner failure");
  error.category = category;
  error.code = code;
  error.status = status;
  error.retryAfterSeconds = retryAfterSeconds;
  error.isQuotaLimited = isQuotaLimited;
  return error;
}

function loadScanSupplementPhotosModule(overrides = {}) {
  const source = readFileSync(
    new URL("../../src/data/scanSupplementPhotos.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(
      /import\s+\{\s*getAccessTokenOrCreateSession\s*\}\s+from\s+"@src\/lib\/supabase";\n/,
      ""
    )
    .replace(
      /import\s+\{\s*normalizeEdgeFunctionError\s*\}\s+from\s+"@src\/lib\/edgeFunctionErrors";\n/,
      ""
    )
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"@src\/lib\/scannerFailure";\n/,
      ""
    )
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"@src\/lib\/runtimeConfig";\n/,
      ""
    )
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    "getAccessTokenOrCreateSession",
    "normalizeEdgeFunctionError",
    "createScannerFailure",
    "SCANNER_FAILURE_CATEGORIES",
    "logBuildAwareDiagnostic",
    "SUPABASE_URL",
    "fetch",
    `${transformed}
return {
  normalizePhotoRescueResponseShape,
  normalizePhotoRescueIngredient,
  scanSupplementPhotos,
};`
  );

  return factory(
    overrides.getAccessTokenOrCreateSession ?? (async () => ""),
    overrides.normalizeEdgeFunctionError ??
      loadEdgeFunctionErrorsModule().normalizeEdgeFunctionError,
    overrides.createScannerFailure ?? createFailure,
    overrides.SCANNER_FAILURE_CATEGORIES ?? {
      networkError: "network_error",
      authSessionRequired: "auth_session_required",
      backendValidationFailure: "backend_validation_failure",
    },
    overrides.logBuildAwareDiagnostic ?? (() => {}),
    overrides.SUPABASE_URL ?? "https://example.supabase.co",
    overrides.fetch ??
      (async () => ({
        ok: true,
        json: async () => ({}),
      }))
  );
}

async function importLocalJsModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const sourceText = readFileSync(sourceUrl, "utf8");
  const dataUrl = `data:text/javascript;base64,${Buffer.from(
    sourceText,
    "utf8"
  ).toString("base64")}`;
  return import(dataUrl);
}

const { normalizePhotoRescueIngredient } = loadScanSupplementPhotosModule();
const { scoreMatchedIngredientsForProduct } = await importLocalJsModule(
  "../../features/supplements/recommendedDoseScoring.js"
);

function createSupplement({
  id,
  name = id,
  evidenceScore,
  minValue,
  maxValue = null,
  unit = "g",
}) {
  return [
    id,
    {
      name,
      evidence_score: evidenceScore,
      recommended_dose_status: "parsed",
      recommended_dose_json: {
        source_text: `Take ${minValue}${maxValue ? `-${maxValue}` : ""} ${unit} daily`,
        confidence: 0.95,
        parser_method: "rule",
        per_intake_min_value: minValue,
        per_intake_max_value: maxValue,
        unit,
        frequency_min_per_day: 1,
        frequency_max_per_day: 1,
        flags: [],
      },
      dose_scoring_profile_json: null,
      how_to_use: null,
    },
  ];
}

test("photo-rescue ingredient names with trailing doses are normalized into structured dose fields", () => {
  const ingredient = normalizePhotoRescueIngredient({
    name: "Creatine 3 g",
    dose_confidence: "verified",
  });

  assert.deepEqual(ingredient, {
    name: "Creatine",
    raw_name: "Creatine",
    dosageValue: 3,
    dosageUnit: "g",
    dosageDisplay: "3 g",
    chemicalForm: null,
    amountBasis: null,
    doseConfidence: "verified",
    doseReviewReason: null,
  });
});

test("photo-rescue display-only doses are normalized into structured dose fields", () => {
  const ingredient = normalizePhotoRescueIngredient({
    raw_name: "Magnesium Glycinate",
    dosage_display: "200 mg",
    amount_basis: "per_capsule",
    dose_confidence: "verified",
  });

  assert.deepEqual(ingredient, {
    name: "Magnesium Glycinate",
    raw_name: "Magnesium Glycinate",
    dosageValue: 200,
    dosageUnit: "mg",
    dosageDisplay: "200 mg",
    chemicalForm: null,
    amountBasis: "per_capsule",
    doseConfidence: "verified",
    doseReviewReason: null,
  });
});

test("photo-rescue normalized doses are not treated as missing_actual_dose downstream", () => {
  const ingredient = normalizePhotoRescueIngredient({
    name: "Creatine Monohydrate 3 g",
    dose_confidence: "verified",
  });

  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "creatine",
      name: "Creatine",
      evidenceScore: 87,
      minValue: 3,
      maxValue: 5,
      unit: "g",
    }),
  ]);

  const [scored] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "creatine",
        catalogName: "Creatine",
        ingredientName: ingredient.name,
        ingredientRaw: ingredient.raw_name,
        dosageValue: ingredient.dosageValue,
        dosageUnit: ingredient.dosageUnit,
        dosageDisplay: ingredient.dosageDisplay,
        amountBasis: "per_serving",
        doseConfidence: ingredient.doseConfidence,
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(scored.doseComparisonStatus, "within_target_range");
  assert.equal(scored.doseStatusLabel, "Meets target dose");
  assert.notEqual(scored.doseComparisonStatus, "missing_actual_dose");
});

test("photo-rescue display-only doses are not treated as missing_actual_dose downstream", () => {
  const ingredient = normalizePhotoRescueIngredient({
    raw_name: "Magnesium Glycinate",
    dosage_display: "200 mg",
    amount_basis: "per_capsule",
    dose_confidence: "verified",
  });

  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "magnesium",
      name: "Magnesium",
      evidenceScore: 90,
      minValue: 300,
      maxValue: 600,
      unit: "mg",
    }),
  ]);

  const [scored] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "magnesium",
        catalogName: "Magnesium",
        ingredientName: ingredient.name,
        ingredientRaw: ingredient.raw_name,
        dosageValue: ingredient.dosageValue,
        dosageUnit: ingredient.dosageUnit,
        dosageDisplay: ingredient.dosageDisplay,
        amountBasis: ingredient.amountBasis,
        doseConfidence: ingredient.doseConfidence,
      },
    ],
    supplementsByCatalogId,
    servingSizeText: "Serving size: 2 capsules",
  });

  assert.equal(scored.normalizedServingDose?.value, 400);
  assert.equal(scored.normalizedServingDose?.unit, "mg");
  assert.equal(scored.doseComparisonStatus, "within_target_range");
  assert.equal(scored.doseStatusLabel, "Meets target dose");
  assert.notEqual(scored.doseComparisonStatus, "missing_actual_dose");
});

test("scanSupplementPhotos normalizes nested response envelopes and snake_case fields", async () => {
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        data: {
          product_id: " prod_123 ",
          display_name: " Magnesium Glycinate ",
          product_name: " Magnesium Glycinate ",
          ingredients_found: [
            "Magnesium 200 mg",
            {
              raw_name: "Vitamin D3 25 mcg",
              dosage_original_text: "25 mcg",
              amount_basis: "per_capsule",
            },
          ],
          serving_size_text: " 2 capsules ",
          source: " photo_rescue_canonical ",
          confidence: "0.91",
          classification_confidence: "0.72",
          created_product: 1,
          wrote_canonical_data: "yes",
          is_supplement: true,
          category: " vitamin_mineral ",
          error: " Parsed successfully ",
          unresolved_ingredient_count: "3",
          raw_text: " OCR text ",
        },
      }),
    }),
  });

  const result = await scanSupplementPhotos({ barcode: "0123456789012" });

  assert.deepEqual(result, {
    productId: "prod_123",
    displayName: "Magnesium Glycinate",
    productName: "Magnesium Glycinate",
    ingredients: [
      {
        name: "Magnesium",
        raw_name: "Magnesium",
        dosageValue: 200,
        dosageUnit: "mg",
        dosageDisplay: "200 mg",
        chemicalForm: null,
        amountBasis: null,
        doseConfidence: null,
        doseReviewReason: null,
      },
      {
        name: "Vitamin D3",
        raw_name: "Vitamin D3",
        dosageValue: 25,
        dosageUnit: "mcg",
        dosageDisplay: "25 mcg",
        chemicalForm: null,
        amountBasis: "per_capsule",
        doseConfidence: null,
        doseReviewReason: null,
      },
    ],
    servingSizeText: "2 capsules",
    source: "photo_rescue_canonical",
    confidence: 0.91,
    classificationConfidence: 0.72,
    createdProduct: true,
    wroteCanonicalData: true,
    isSupplement: true,
    category: "vitamin_mineral",
    message: "Parsed successfully",
    unresolvedIngredientCount: 3,
    rawText: "OCR text",
  });
});

test("scanSupplementPhotos forwards barcodeType to the edge function payload", async () => {
  let capturedBody = null;
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({}),
      };
    },
  });

  await scanSupplementPhotos({
    barcode: "X00131RGZ5",
    barcodeType: "code128",
    scanSessionId: "9",
  });

  assert.equal(capturedBody?.barcode, "X00131RGZ5");
  assert.equal(capturedBody?.barcodeType, "code128");
  assert.equal(capturedBody?.scanSessionId, "9");
});

test("scanSupplementPhotos normalizes backend validation failures with safe messages", async () => {
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => ({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          error:
            "We couldn't read any usable active supplement ingredients from those photos.",
        }),
      headers: { get: () => null },
    }),
  });

  await assert.rejects(
    () => scanSupplementPhotos({ barcode: "0123456789012" }),
    (error) => {
      assert.equal(error.category, "backend_validation_failure");
      assert.equal(error.status, 422);
      assert.equal(
        error.message,
        "We couldn't read any usable active supplement ingredients from those photos."
      );
      return true;
    }
  );
});

test("scanSupplementPhotos normalizes network transport failures", async () => {
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  });

  await assert.rejects(
    () => scanSupplementPhotos({ barcode: "0123456789012" }),
    (error) => {
      assert.equal(error.category, "network_error");
      assert.equal(error.code, "network_error");
      return true;
    }
  );
});
