import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function importLocalJsModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  let sourceText = readFileSync(sourceUrl, "utf8");
  if (relativePath.endsWith("recommendedDoseScoring.js")) {
    const doseNormalizationSource = readFileSync(
      new URL(
        "../../features/supplements/doseNormalization.js",
        import.meta.url,
      ),
      "utf8",
    );
    const doseNormalizationDataUrl = `data:text/javascript;base64,${Buffer.from(
      doseNormalizationSource,
      "utf8",
    ).toString("base64")}`;
    sourceText = sourceText.replace(
      "./doseNormalization.js",
      doseNormalizationDataUrl,
    );
  }
  const dataUrl = `data:text/javascript;base64,${Buffer.from(
    sourceText,
    "utf8"
  ).toString("base64")}`;
  return import(dataUrl);
}

const {
  buildProductEvidenceScoreData,
  normalizeIngredientDose,
  scoreMatchedIngredientsForProduct,
} = await importLocalJsModule(
  "../../features/supplements/recommendedDoseScoring.js"
);
const { computeBlendEvidenceScore } = await importLocalJsModule(
  "../../features/supplements/evidenceScoring.js"
);

function createSupplement({
  id,
  name = id,
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
      name,
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
  assert.equal(ingredient.validatedDoseFactor, 1);
  assert.equal(ingredient.doseComparisonValid, true);
  assert.equal(ingredient.adjustedEvidenceScore, 90);
  assert.equal(ingredient.doseBand, "optimal");
});

test("treats explicit singular serving wording as a one-unit serving", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "vitamin-d",
      name: "Vitamin D",
      evidenceScore: 90,
      minValue: 5,
      unit: "mcg",
    }),
  ]);

  for (const servingSizeText of [
    "Each capsule",
    "Amount per capsule",
    "Serving size: one capsule",
    "Take a capsule daily",
  ]) {
    const [ingredient] = scoreMatchedIngredientsForProduct({
      matchedIngredients: [
        {
          catalogId: "vitamin-d",
          ingredientName: "Vitamin D",
          dosageValue: 5,
          dosageUnit: "mcg",
          dosageOriginalText: "5µg (200 I.U.)",
          amountBasis: "per_capsule",
          doseConfidence: "verified",
        },
      ],
      supplementsByCatalogId,
      servingSizeText,
    });

    assert.deepEqual(
      ingredient.normalizedServingDose,
      {
        value: 5,
        unit: "mcg",
        amountBasis: "per_capsule",
        multiplier: 1,
      },
      servingSizeText,
    );
    assert.equal(
      ingredient.doseComparisonStatus,
      "within_target_range",
      servingSizeText,
    );
    assert.equal(ingredient.doseComparisonValid, true, servingSizeText);
    assert.equal(ingredient.dosePresentationMatchesScoringDose, true);
  }
});

test("label dose text without structured fields is not displayed as a parsed dose", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "magnesium",
      evidenceScore: 90,
      minValue: 200,
      maxValue: 400,
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "magnesium",
        dosageOriginalText: "200 mg",
        dosageValue: null,
        dosageUnit: null,
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
    servingSizeText: "Serving size: 1 capsule",
  });

  assert.equal(ingredient.dosageDisplay, null);
  assert.equal(ingredient.normalizedDose.displayText, null);
  assert.equal(ingredient.doseComparisonStatus, "dose_could_not_be_parsed");
  assert.equal(ingredient.doseStatusLabel, "Dose could not be analysed");
  assert.equal(ingredient.validatedDoseFactor, null);
});

test("an unusable dose status takes precedence when the target profile is missing", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "unverified-without-target",
      evidenceScore: 90,
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "unverified-without-target",
        dosageValue: 200,
        dosageUnit: "mg",
        amountBasis: "per_serving",
        doseConfidence: "unverified",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.dosageDisplay, "200 mg");
  assert.equal(ingredient.doseComparisonStatus, "dose_not_verified");
  assert.equal(ingredient.doseStatusLabel, "Dose not verified");
  assert.equal(ingredient.validatedDoseFactor, null);
});

test("verified structured dose uses one display and scoring contract", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "magnesium",
      evidenceScore: 90,
      minValue: 200,
      maxValue: 400,
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "magnesium",
        dosageValue: 200,
        dosageUnit: "mg",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.normalizedDose.displayText, "200 mg");
  assert.equal(ingredient.dosageDisplay, "200 mg");
  assert.equal(ingredient.normalizedDose.isStructurallyUsable, true);
  assert.equal(ingredient.normalizedDose.isVerified, true);
  assert.equal(ingredient.normalizedDose.isScoringEligible, true);
  assert.equal(ingredient.doseComparisonStatus, "within_target_range");
  assert.equal(ingredient.doseStatusLabel, "Meets target dose");
  assert.equal(ingredient.validatedDoseFactor, 1);
});

test("all supported dose units use the same verified scoring contract", () => {
  const cases = [
    ["mcg", 500],
    ["mg", 200],
    ["g", 1],
    ["ml", 5],
    ["IU", 1000],
    ["CFU", 10_000_000_000],
    ["FCC", 3000],
    ["HUT", 5000],
    ["DU", 1200],
    ["FIP", 100],
    ["ALU", 400],
    ["GDU", 2400],
    ["PU", 6000],
  ];
  const supplementsByCatalogId = new Map(
    cases.map(([unit, value]) =>
      createSupplement({
        id: `dose-${unit}`,
        evidenceScore: 80,
        minValue: value,
        maxValue: value,
        unit,
      }),
    ),
  );

  const results = scoreMatchedIngredientsForProduct({
    matchedIngredients: cases.map(([unit, value]) => ({
      catalogId: `dose-${unit}`,
      ingredientName: `Ingredient ${unit}`,
      dosageValue: value,
      dosageUnit: unit,
      amountBasis: "per_serving",
      doseConfidence: "verified",
    })),
    supplementsByCatalogId,
  });

  results.forEach((result) => {
    assert.equal(result.normalizedDose.isStructurallyUsable, true, result.catalogId);
    assert.equal(result.normalizedDose.isScoringEligible, true, result.catalogId);
    assert.equal(result.doseComparisonStatus, "within_target_range", result.catalogId);
    assert.equal(result.doseStatusLabel, "Meets target dose", result.catalogId);
    assert.notEqual(
      result.dosePresentation.statusLabel,
      "Dose could not be analysed",
      result.catalogId,
    );
    assert.equal(result.validatedDoseFactor, 1, result.catalogId);
  });
});

test("verified CFU is displayed readably and scored while unverified CFU is excluded", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "probiotic-blend",
      name: "Probiotic blend",
      evidenceScore: 88,
      minValue: 10_000_000_000,
      maxValue: 20_000_000_000,
      unit: "CFU",
    }),
  ]);

  const [verified, unverified] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "probiotic-blend",
        ingredientRaw: "Probiotic blend",
        dosageValue: 10_000_000_000,
        dosageUnit: "CFU",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
      {
        catalogId: "probiotic-blend",
        ingredientRaw: "Lactobacillus acidophilus LA-14",
        dosageValue: 10_000_000_000,
        dosageUnit: "CFU",
        amountBasis: "per_serving",
        doseConfidence: "unverified",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(verified.dosageDisplay, "10 billion CFU");
  assert.equal(verified.doseComparisonStatus, "within_target_range");
  assert.equal(verified.validatedDoseFactor, 1);
  assert.equal(unverified.dosageDisplay, "10 billion CFU");
  assert.equal(unverified.doseComparisonStatus, "dose_not_verified");
  assert.equal(unverified.doseStatusLabel, "Dose not verified");
  assert.equal(unverified.validatedDoseFactor, null);
});

test("probiotic CFU display and scoring share the same reconciled magnitude", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "streptococcus-thermophilus",
      evidenceScore: 88,
      minValue: 10_000_000_000,
      maxValue: 20_000_000_000,
      unit: "CFU",
    }),
    createSupplement({
      id: "lactobacillus-acidophilus",
      evidenceScore: 86,
      minValue: 39_500_000_000,
      maxValue: 50_000_000_000,
      unit: "CFU",
    }),
  ]);

  const [streptococcus, acidophilus] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "streptococcus-thermophilus",
        ingredientName: "Streptococcus thermophilus",
        dosageValue: 1,
        dosageUnit: "CFU",
        dosageOriginalText: "Streptococcus thermophilus — 1 billion CFU",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
      {
        catalogId: "lactobacillus-acidophilus",
        ingredientName: "Lactobacillus acidophilus",
        dosageValue: 39.5,
        dosageUnit: "CFU",
        dosageOriginalText: "Lactobacillus acidophilus — 39.5 billion CFU",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(streptococcus.normalizedDose.value, 1_000_000_000);
  assert.equal(streptococcus.dosePresentation.displayText, "1 billion CFU");
  assert.equal(streptococcus.normalizedServingDose.value, 1_000_000_000);
  assert.equal(streptococcus.dosePresentationMatchesScoringDose, true);
  assert.equal(streptococcus.doseComparisonStatus, "severely_underdosed");

  assert.equal(acidophilus.normalizedDose.value, 39_500_000_000);
  assert.equal(acidophilus.dosePresentation.displayText, "39.5 billion CFU");
  assert.equal(acidophilus.normalizedServingDose.value, 39_500_000_000);
  assert.equal(acidophilus.dosePresentationMatchesScoringDose, true);
  assert.equal(acidophilus.doseComparisonStatus, "within_target_range");
});

test("a comparison is rejected when its normalized source dose is not visibly represented", () => {
  const normalizedDose = normalizeIngredientDose({
    ingredientName: "Lactobacillus acidophilus",
    dosageValue: 1_000_000_000,
    dosageUnit: "CFU",
    amountBasis: "per_serving",
    doseConfidence: "verified",
  });
  normalizedDose.displayText = null;
  normalizedDose.presentation = {
    ...normalizedDose.presentation,
    displayText: null,
  };
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "hidden-probiotic-dose",
      name: "Lactobacillus acidophilus",
      evidenceScore: 90,
      minValue: 10_000_000_000,
      unit: "CFU",
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "hidden-probiotic-dose",
        normalizedDose,
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.dosePresentation.displayText, null);
  assert.equal(ingredient.dosePresentationMatchesScoringDose, false);
  assert.equal(ingredient.doseComparisonStatus, "dose_presentation_mismatch");
  assert.equal(ingredient.doseStatusLabel, "Dose comparison unavailable");
  assert.equal(ingredient.doseComparisonValid, false);
  assert.equal(ingredient.validatedDoseFactor, null);
  assert.equal(ingredient.doseFactor, 1);
  assert.equal(ingredient.adjustedEvidenceScore, 90);
});

test("a probiotic species cannot inherit scoring from an incompatible canonical ingredient", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "shared-probiotic",
      name: "Bifidobacterium lactis",
      evidenceScore: 90,
      minValue: 10_000_000_000,
      unit: "CFU",
    }),
    createSupplement({
      id: "acidophilus",
      name: "Lactobacillus acidophilus",
      evidenceScore: 88,
      minValue: 10_000_000_000,
      unit: "CFU",
    }),
  ]);
  const [conflict, compatible] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "shared-probiotic",
        ingredientName: "Streptococcus thermophilus",
        dosageValue: 1_000_000_000,
        dosageUnit: "CFU",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
      {
        catalogId: "acidophilus",
        ingredientName: "Lactobacillus acidophilus",
        dosageValue: 1_000_000_000,
        dosageUnit: "CFU",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(conflict.dosageDisplay, "1 billion CFU");
  assert.equal(conflict.canonicalIdentityCompatible, false);
  assert.equal(conflict.evidenceScore, null);
  assert.equal(conflict.doseScoringProfile, null);
  assert.equal(conflict.doseComparisonStatus, "canonical_identity_mismatch");
  assert.equal(conflict.doseComparisonValid, false);
  assert.equal(conflict.validatedDoseFactor, null);
  assert.notEqual(conflict.doseStatusLabel, "Severely underdosed");

  assert.equal(compatible.canonicalIdentityCompatible, true);
  assert.equal(compatible.normalizedDose.value, 1_000_000_000);
  assert.equal(compatible.normalizedServingDose.value, 1_000_000_000);
  assert.equal(compatible.dosePresentation.displayText, "1 billion CFU");
  assert.equal(compatible.doseComparisonStatus, "severely_underdosed");
});

test("partial, unverified, unsupported, and sentinel doses are explicit and unscored", () => {
  const supplementsByCatalogId = new Map(
    [
      "missing-unit",
      "missing-value",
      "unsupported-unit",
      "unverified",
      "per-100g",
      "sentinel",
      "malformed",
    ].map((id) =>
      createSupplement({ id, evidenceScore: 80, minValue: 100 }),
    ),
  );

  const results = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "missing-unit",
        dosageValue: 200,
        dosageUnit: null,
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
      {
        catalogId: "missing-value",
        dosageValue: null,
        dosageUnit: "mg",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
      {
        catalogId: "unsupported-unit",
        dosageValue: 200,
        dosageUnit: "%",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
      {
        catalogId: "unverified",
        dosageValue: 200,
        dosageUnit: "mg",
        amountBasis: "per_serving",
        doseConfidence: "unverified",
        doseReviewReason: "OCR row mismatch",
      },
      {
        catalogId: "per-100g",
        dosageValue: 200,
        dosageUnit: "mg",
        amountBasis: "per_100g",
        doseConfidence: "verified",
      },
      {
        catalogId: "sentinel",
        dosageValue: "not available",
        dosageUnit: "unknown",
        amountBasis: "unknown",
        doseConfidence: "missing",
      },
      {
        catalogId: "malformed",
        dosageValue: "two hundred mg",
        dosageUnit: null,
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
    ],
    supplementsByCatalogId,
  });
  const byId = new Map(results.map((result) => [result.catalogId, result]));

  assert.equal(
    byId.get("missing-unit").doseStatusLabel,
    "Dose could not be analysed",
  );
  assert.equal(
    byId.get("missing-value").doseStatusLabel,
    "Dose could not be analysed",
  );
  assert.equal(
    byId.get("unsupported-unit").doseStatusLabel,
    "Dose could not be analysed",
  );
  assert.equal(
    byId.get("unverified").doseStatusLabel,
    "Dose not verified",
  );
  assert.equal(byId.get("unverified").doseReviewReason, "OCR row mismatch");
  assert.equal(byId.get("per-100g").amountBasis, "per_100g");
  assert.equal(
    byId.get("per-100g").doseStatusLabel,
    "Dose comparison unavailable",
  );
  assert.equal(byId.get("sentinel").dosageValue, null);
  assert.equal(byId.get("sentinel").dosageUnit, null);
  assert.equal(byId.get("sentinel").amountBasis, null);
  assert.equal(
    byId.get("malformed").doseStatusLabel,
    "Dose could not be analysed",
  );
  results.forEach((result) => {
    assert.equal(result.validatedDoseFactor, null);
    assert.equal(result.doseComparisonValid, false);
  });
});

test("missing confidence follows the legacy-compatible scoring policy", () => {
  const normalizedDose = normalizeIngredientDose({
    dosageValue: "200",
    dosageUnit: "μg",
    amountBasis: "per_serving",
    doseConfidence: null,
  });

  assert.equal(normalizedDose.value, 200);
  assert.equal(normalizedDose.unit, "mcg");
  assert.equal(normalizedDose.confidenceStatus, "legacy");
  assert.equal(normalizedDose.isVerified, false);
  assert.equal(normalizedDose.isLegacyConfidence, true);
  assert.equal(normalizedDose.isScoringEligible, true);

  const zeroDose = normalizeIngredientDose({
    dosageValue: "0",
    dosageUnit: "mg",
    amountBasis: "per_serving",
  });
  assert.equal(zeroDose.value, 0);
  assert.equal(zeroDose.displayText, "0 mg");
  assert.equal(zeroDose.isScoringEligible, true);
});

test("aggregates DHA and EPA against a shared omega-3 target", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "omega3",
      name: "Omega-3 fatty acids",
      evidenceScore: 95,
      minValue: 1000,
      maxValue: 2000,
    }),
  ]);

  const [dha, epa] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        ingredientRaw: "Docosahexaenoic Acid",
        ingredientNormalized: "docosahexaenoic acid",
        catalogId: "omega3",
        catalogName: "Docosahexaenoic Acid",
        dosageValue: 300,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
      {
        ingredientRaw: "Eicosapentaenoic Acid",
        ingredientNormalized: "eicosapentaenoic acid",
        catalogId: "omega3",
        catalogName: "Eicosapentaenoic Acid",
        dosageValue: 400,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(dha.normalizedServingDose?.value, 700);
  assert.equal(epa.normalizedServingDose?.value, 700);
  assert.equal(dha.normalizedServingDose?.unit, "mg");
  assert.equal(epa.normalizedServingDose?.unit, "mg");
  assert.equal(dha.doseComparisonStatus, "effective_below_target");
  assert.equal(epa.doseComparisonStatus, "effective_below_target");
  assert.equal(dha.doseStatusLabel, "Effective, slightly below target");
  assert.equal(epa.doseStatusLabel, "Effective, slightly below target");
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

test("parses a CFU target from probiotic how-to-use text", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "probiotic-how-to-use",
      evidenceScore: 86,
      howToUse: "Take 1 × 10^10 CFU daily.",
      recommendedDoseStatus: "missing",
      recommendedDoseJson: null,
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "probiotic-how-to-use",
        dosageValue: 10_000_000_000,
        dosageUnit: "CFU",
        amountBasis: "per_serving",
        doseConfidence: "verified",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.doseComparisonStatus, "within_target_range");
  assert.equal(ingredient.validatedDoseFactor, 1);
  assert.equal(ingredient.doseScoringProfile?.unit, "CFU");
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
  assert.equal(missingRecommended.validatedDoseFactor, null);
  assert.equal(missingRecommended.doseComparisonValid, false);
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

  assert.equal(missingActual.doseComparisonStatus, "missing_dose_information");
  assert.equal(missingActual.doseStatusLabel, "Dose unavailable");
  assert.equal(missingActual.scoreAdjustmentSummary, null);
  assert.equal(missingActual.doseFactor, 1);
  assert.equal(missingActual.validatedDoseFactor, null);
  assert.equal(missingActual.doseComparisonValid, false);
  assert.equal(missingActual.adjustedEvidenceScore, 75);
  assert.equal(unknownBasis.doseComparisonStatus, "unsupported_amount_basis");
  assert.equal(unknownBasis.doseStatusLabel, "Dose comparison unavailable");
  assert.equal(unknownBasis.scoreAdjustmentSummary, null);
  assert.equal(unknownBasis.doseFactor, 1);
  assert.equal(unknownBasis.validatedDoseFactor, null);
  assert.equal(unknownBasis.doseComparisonValid, false);
  assert.equal(unknownBasis.adjustedEvidenceScore, 70);
  assert.deepEqual(unknownBasis.doseFlags, ["unsupported_amount_basis"]);
  assert.equal(unclearServing.doseComparisonStatus, "serving_size_unparseable");
  assert.equal(unclearServing.doseStatusLabel, "Dose comparison unavailable");
  assert.equal(unclearServing.scoreAdjustmentSummary, null);
  assert.equal(unclearServing.doseFactor, 1);
  assert.equal(unclearServing.validatedDoseFactor, null);
  assert.equal(unclearServing.doseComparisonValid, false);
  assert.equal(unclearServing.adjustedEvidenceScore, 72);
  assert.deepEqual(unclearServing.doseFlags, ["serving_size_unparseable"]);
});

test("marks incomparable dose units invalid despite a neutral factor", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "unit-mismatch",
      evidenceScore: 80,
      minValue: 100,
      unit: "mg",
    }),
  ]);

  const [ingredient] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "unit-mismatch",
        dosageValue: 100,
        dosageUnit: "ml",
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(ingredient.doseComparisonStatus, "unit_mismatch");
  assert.equal(ingredient.doseFactor, 1);
  assert.equal(ingredient.validatedDoseFactor, null);
  assert.equal(ingredient.doseComparisonValid, false);
  assert.equal(ingredient.adjustedEvidenceScore, 80);
});

test("keeps legacy neutral factors separate from validated product-benefit factors", () => {
  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "valid-dose",
      evidenceScore: 80,
      minValue: 100,
    }),
    createSupplement({
      id: "missing-dose",
      evidenceScore: 80,
      minValue: 100,
    }),
  ]);
  const [validDose, missingDose] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "valid-dose",
        dosageValue: 100,
        dosageUnit: "mg",
        amountBasis: "per_serving",
      },
      {
        catalogId: "missing-dose",
        dosageValue: null,
        dosageUnit: null,
        amountBasis: "per_serving",
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(validDose.doseFactor, 1);
  assert.equal(validDose.validatedDoseFactor, 1);
  assert.equal(validDose.doseComparisonValid, true);
  assert.equal(missingDose.doseFactor, 1);
  assert.equal(missingDose.validatedDoseFactor, null);
  assert.equal(missingDose.doseComparisonValid, false);
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
