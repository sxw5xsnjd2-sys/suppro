import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadScanSupplementPhotosModule() {
  const source = readFileSync(
    new URL("../../src/data/scanSupplementPhotos.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(
      /import \{ getAccessTokenOrCreateSession \} from "@src\/lib\/supabase";\n/,
      ""
    )
    .replace(
      /import \{ normalizeEdgeFunctionError \} from "@src\/lib\/edgeFunctionErrors";\n/,
      ""
    )
    .replace(
      /import \{\n(?:.|\n)*?\} from "@src\/lib\/scannerFailure";\n/,
      ""
    )
    .replace(
      /import \{ SUPABASE_URL \} from "@src\/lib\/runtimeConfig";\n/,
      ""
    )
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    "getAccessTokenOrCreateSession",
    "normalizeEdgeFunctionError",
    "createScannerFailure",
    "SCANNER_FAILURE_CATEGORIES",
    "SUPABASE_URL",
    `${transformed}
return {
  normalizePhotoRescueIngredient,
};`
  );

  return factory(
    async () => "",
    () => ({}),
    () => null,
    {},
    "https://example.supabase.co"
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
