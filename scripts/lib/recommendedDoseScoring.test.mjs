import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function importLocalJsModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const sourceText = readFileSync(sourceUrl, "utf8");
  const dataUrl = `data:text/javascript;base64,${Buffer.from(
    sourceText,
    "utf8"
  ).toString("base64")}`;
  return import(dataUrl);
}

const {
  buildProductEvidenceScoreData,
  scoreMatchedIngredientsForProduct,
} = await importLocalJsModule(
  "../../features/supplements/recommendedDoseScoring.js"
);
const { computeBlendEvidenceScore } = await importLocalJsModule(
  "../../features/supplements/evidenceScoring.js"
);

function createSupplement({
  id,
  evidenceScore,
  minValue = null,
  maxValue = null,
  unit = "mg",
  doseScoringProfile = null,
  howToUse = null,
  recommendedDoseStatus = null,
  recommendedDoseJson = undefined,
}) {
  const derivedRecommendedDoseJson =
    recommendedDoseJson !== undefined
      ? recommendedDoseJson
      : Number.isFinite(minValue)
      ? {
          source_text: `Take ${minValue}${maxValue ? `-${maxValue}` : ""} ${unit} daily`,
          confidence: 0.95,
          parser_method: "rule",
          per_intake_min_value: minValue,
          per_intake_max_value: maxValue,
          unit,
          frequency_min_per_day: 1,
          frequency_max_per_day: 1,
          flags: [],
        }
      : null;

  return [
    id,
    {
      evidence_score: evidenceScore,
      recommended_dose_status:
        recommendedDoseStatus ??
        (derivedRecommendedDoseJson ? "parsed" : "missing"),
      recommended_dose_json: derivedRecommendedDoseJson,
      dose_scoring_profile_json: doseScoringProfile,
      how_to_use: howToUse,
    },
  ];
}

test("normalizes per-capsule doses using serving size text", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "magnesium",
      evidenceScore: 90,
      minValue: 300,
      maxValue: 600,
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "magnesium",
        dosageValue: 150,
        dosageUnit: "mg",
        amountBasis: "per_capsule",
      },
    ],
    supplementsByCatalogId,
    servingSizeText: "Serving size: 2 capsules",
  });

  assert.deepEqual(ingredient.normalizedServingDose, {
    value: 300,
    unit: "mg",
    amountBasis: "per_capsule",
    multiplier: 2,
  });
  assert.equal(ingredient.doseComparisonStatus, "within_target_range");
  assert.equal(ingredient.doseFactor, 1);
  assert.equal(ingredient.adjustedEvidenceScore, 90);
  assert.equal(ingredient.doseBand, "optimal");
});

test("keeps per-tablet and per-serving amounts directly comparable", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "tablet",
      evidenceScore: 88,
      minValue: 200,
    }),
    createSupplement({
      id: "serving",
      evidenceScore: 77,
      minValue: 500,
    }),
  ]);

  const [tablet, serving] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "tablet",
        dosageValue: 200,
        dosageUnit: "mg",
        amountBasis: "per_tablet",
      },
      {
        catalogId: "serving",
        dosageValue: 500,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
    servingSizeText: "1 tablet",
  });

  assert.equal(tablet.normalizedServingDose?.value, 200);
  assert.equal(tablet.normalizedServingDose?.multiplier, 1);
  assert.equal(tablet.adjustedEvidenceScore, 88);
  assert.equal(serving.normalizedServingDose?.value, 500);
  assert.equal(serving.normalizedServingDose?.multiplier, 1);
  assert.equal(serving.adjustedEvidenceScore, 77);
});

test("converts vitamin D micrograms to IU when comparing doses", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "vitamin-d",
      evidenceScore: 86,
      minValue: 200,
      unit: "IU",
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "vitamin-d",
        catalogName: "Vitamin D",
        ingredientName: "Vitamin D3",
        ingredientRaw: "Vitamin D3",
        dosageValue: 5,
        dosageUnit: "ug",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.deepEqual(ingredient.normalizedServingDose, {
    value: 200,
    unit: "IU",
    amountBasis: "per_serving",
    multiplier: 1,
    convertedFromUnit: "mcg",
  });
  assert.equal(ingredient.doseComparisonStatus, "within_target_range");
  assert.equal(ingredient.doseStatusLabel, "Meets target dose");
  assert.equal(ingredient.adjustedEvidenceScore, 86);
});

test("keeps slightly under-target products in the mid/high 80s via the generic fallback profile", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "creatine",
      evidenceScore: 90,
      minValue: 5000,
      unit: "mg",
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "creatine",
        dosageValue: 3,
        dosageUnit: "g",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });
  const productScore = buildProductEvidenceScoreData([ingredient]);

  assert.equal(ingredient.doseComparisonStatus, "effective_below_target");
  assert.equal(ingredient.doseBand, "effective_below_target");
  assert.equal(ingredient.doseFactor, 0.95);
  assert.equal(ingredient.adjustedEvidenceScore, 85.5);
  assert.equal(ingredient.doseScoringProfile?.source, "recommended_dose_fallback");
  assert.equal(productScore.baseEvidenceScore, 90);
  assert.equal(productScore.evidenceScore, 85.5);
  assert.equal(
    productScore.scoreAdjustmentSummary,
    "3 g per serving. Slightly below 5 g target; still within effective range."
  );
});

test("uses parseable recommended dose JSON even when the stored status is stale", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "taurine-json",
      evidenceScore: 84,
      recommendedDoseStatus: "missing",
      recommendedDoseJson: {
        source_text: "Take 1,000 mg daily",
        confidence: 0.95,
        parser_method: "rule",
        per_intake_min_value: 1000,
        per_intake_max_value: null,
        unit: "mg",
        frequency_min_per_day: 1,
        frequency_max_per_day: 1,
        flags: [],
      },
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "taurine-json",
        dosageValue: 1000,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.doseComparisonStatus, "within_target_range");
  assert.equal(ingredient.doseFactor, 1);
  assert.equal(ingredient.adjustedEvidenceScore, 84);
});

test("falls back to parsing how_to_use when recommended dose columns are missing", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "taurine-how-to-use",
      evidenceScore: 84,
      howToUse: "Take 1,000-2,000 mg daily with water.",
      recommendedDoseStatus: "missing",
      recommendedDoseJson: null,
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "taurine-how-to-use",
        dosageValue: 1000,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.doseComparisonStatus, "within_target_range");
  assert.equal(ingredient.doseFactor, 1);
  assert.equal(ingredient.adjustedEvidenceScore, 84);
  assert.equal(ingredient.doseScoringProfile?.source, "recommended_dose_fallback");
});

test("applies a moderate penalty below the effective minimum", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "underdosed",
      evidenceScore: 92,
      minValue: 200,
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "underdosed",
        dosageValue: 80,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.doseComparisonStatus, "below_effective_min");
  assert.equal(ingredient.doseBand, "underdosed");
  assert.equal(ingredient.doseFactor, 0.8167);
  assert.equal(ingredient.adjustedEvidenceScore, 75.1364);
});

test("applies a strong floor-based penalty when severely underdosed", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "severely-underdosed",
      evidenceScore: 92,
      minValue: 200,
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "severely-underdosed",
        dosageValue: 20,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.doseComparisonStatus, "severely_underdosed");
  assert.equal(ingredient.doseBand, "severely_underdosed");
  assert.equal(ingredient.doseFactor, 0.5167);
  assert.equal(ingredient.adjustedEvidenceScore, 47.5364);
});

test("slightly downgrades above-range doses and leaves missing recommendations neutral", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "above-range",
      evidenceScore: 85,
      minValue: 300,
      maxValue: 600,
    }),
    createSupplement({
      id: "missing-recommended",
      evidenceScore: 64,
    }),
  ]);

  const [aboveRange, missingRecommended] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "above-range",
        dosageValue: 700,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
      {
        catalogId: "missing-recommended",
        dosageValue: 200,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(aboveRange.doseComparisonStatus, "above_target_range");
  assert.equal(aboveRange.doseFactor, 0.95);
  assert.equal(aboveRange.adjustedEvidenceScore, 80.75);
  assert.equal(missingRecommended.doseComparisonStatus, "missing_dose_scoring_profile");
  assert.equal(missingRecommended.doseStatusLabel, "Dose target unavailable");
  assert.equal(missingRecommended.scoreAdjustmentSummary, null);
  assert.equal(missingRecommended.doseFactor, 1);
  assert.equal(missingRecommended.adjustedEvidenceScore, 64);
  assert.deepEqual(missingRecommended.doseFlags, ["missing_dose_scoring_profile"]);
});

test("treats missing actual dose, unknown amount bases, and unclear serving text as neutral but flagged", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "missing-actual",
      evidenceScore: 75,
      minValue: 100,
    }),
    createSupplement({
      id: "unknown-basis",
      evidenceScore: 70,
      minValue: 100,
    }),
    createSupplement({
      id: "unclear-serving",
      evidenceScore: 72,
      minValue: 100,
    }),
  ]);

  const [missingActual, unknownBasis, unclearServing] =
    scoreMatchedIngredientsForProduct({
      matchedIngredients: [
        {
          catalogId: "missing-actual",
          dosageValue: null,
          dosageUnit: null,
          amountBasis: "per_serving",
        },
        {
          catalogId: "unknown-basis",
          dosageValue: 100,
          dosageUnit: "mg",
          amountBasis: "per_packet",
        },
        {
          catalogId: "unclear-serving",
          dosageValue: 50,
          dosageUnit: "mg",
          amountBasis: "per_capsule",
        },
      ],
      supplementsByCatalogId,
      servingSizeText: "Take with breakfast",
    });

  assert.equal(missingActual.doseComparisonStatus, "missing_actual_dose");
  assert.equal(missingActual.doseStatusLabel, "Dose unavailable");
  assert.equal(missingActual.scoreAdjustmentSummary, null);
  assert.equal(missingActual.doseFactor, 1);
  assert.equal(missingActual.adjustedEvidenceScore, 75);
  assert.equal(unknownBasis.doseComparisonStatus, "unknown_amount_basis");
  assert.equal(unknownBasis.doseStatusLabel, "Dose unavailable");
  assert.equal(unknownBasis.scoreAdjustmentSummary, null);
  assert.equal(unknownBasis.doseFactor, 1);
  assert.equal(unknownBasis.adjustedEvidenceScore, 70);
  assert.deepEqual(unknownBasis.doseFlags, ["unknown_amount_basis"]);
  assert.equal(unclearServing.doseComparisonStatus, "serving_size_unparseable");
  assert.equal(unclearServing.doseStatusLabel, "Dose unavailable");
  assert.equal(unclearServing.scoreAdjustmentSummary, null);
  assert.equal(unclearServing.doseFactor, 1);
  assert.equal(unclearServing.adjustedEvidenceScore, 72);
  assert.deepEqual(unclearServing.doseFlags, ["serving_size_unparseable"]);
});

test("feeds adjusted ingredient scores into the top-weighted blend scorer", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "core-a",
      evidenceScore: 95,
      minValue: 100,
    }),
    createSupplement({
      id: "core-b",
      evidenceScore: 90,
      minValue: 100,
    }),
    createSupplement({
      id: "core-c",
      evidenceScore: 85,
      minValue: 100,
    }),
    createSupplement({
      id: "tail",
      evidenceScore: 80,
      minValue: 100,
    }),
  ]);

  const scoredIngredients = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "core-a",
        dosageValue: 100,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
      {
        catalogId: "core-b",
        dosageValue: 100,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
      {
        catalogId: "core-c",
        dosageValue: 50,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
      {
        catalogId: "tail",
        dosageValue: 25,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  const adjustedScores = scoredIngredients.map((item) => item.adjustedEvidenceScore);
  const blendedScore = computeBlendEvidenceScore(adjustedScores);
  const expectedBlendedScore =
    (((95 + 90 + 75.0805) / 3) * 0.8) + (55.336 * 0.2);

  assert.deepEqual(adjustedScores, [95, 90, 75.0805, 55.336]);
  assert.ok(Math.abs(blendedScore - expectedBlendedScore) < 0.000001);
});
