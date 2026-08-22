import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadSelectProductBenefitDriver() {
  const source = readFileSync(
    new URL(
      "../../features/supplements/productBenefitScoring.js",
      import.meta.url,
    ),
    "utf8"
  );
  const contractSource = source
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ");

  return new Function(
    `${contractSource}\nreturn selectProductBenefitDriver;`
  )();
}

const selectProductBenefitDriver = loadSelectProductBenefitDriver();

function loadBuildLinkedSupplementPayload(scoredMatchedIngredients) {
  const source = readFileSync(
    new URL("../../src/data/buildLinkedSupplementPayload.js", import.meta.url),
    "utf8"
  );
  const transformed = source
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"@\/features\/supplements\/recommendedDoseScoring";\n/,
      ""
    )
    .replace(
      /import\s+\{\s*selectProductBenefitDriver\s*\}\s+from\s+"@\/features\/supplements\/benefits";\n/,
      ""
    )
    .replace(/export function /g, "function ");
  const factory = new Function(
    "buildProductEvidenceScoreData",
    "scoreMatchedIngredientsForProduct",
    "selectProductBenefitDriver",
    `${transformed}\nreturn { buildLinkedSupplementPayload };`
  );

  return factory(
    () => ({
      evidenceScore: 80,
      baseEvidenceScore: 80,
      scoreAdjustmentSummary: null,
      scoreAdjustmentReasonCode: null,
    }),
    () => scoredMatchedIngredients,
    selectProductBenefitDriver
  ).buildLinkedSupplementPayload;
}

test("tracked matched-ingredient snapshots keep the normalized ingredient name", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "lactase",
      ingredientRaw: "Lactase 3000 FCC",
      ingredientName: "Lactase 3000 FCC",
      normalizedDose: {
        contractVersion: 3,
        ingredientName: "Lactase",
        value: 3000,
        unit: "FCC",
        displayText: "3000 FCC",
      },
    },
  ];
  const buildLinkedSupplementPayload =
    loadBuildLinkedSupplementPayload(scoredMatchedIngredients);
  const payload = buildLinkedSupplementPayload({
    name: "Enzyme product",
    matchedIngredients: scoredMatchedIngredients,
    supplementsByCatalogId: new Map([
      ["lactase", { name: "Lactase", supplement_benefits: [] }],
    ]),
  });

  assert.equal(payload.matchedIngredients[0].ingredientName, "Lactase");
  assert.equal(
    payload.matchedIngredients[0].normalizedDose.displayText,
    "3000 FCC",
  );
});

test("selects the scan support driver by benefit score weighted by dose factor", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "magnesium",
      ingredientName: "Magnesium Glycinate",
      ingredientRaw: "Magnesium Glycinate",
      doseFactor: 0.7,
      validatedDoseFactor: 0.7,
      doseComparisonStatus: "below_effective_min",
      doseComparisonValid: true,
      doseBand: "underdosed",
    },
    {
      catalogId: "theanine",
      ingredientName: "L-Theanine",
      ingredientRaw: "L-Theanine",
      doseFactor: 1,
      validatedDoseFactor: 1,
      doseComparisonStatus: "within_target_range",
      doseComparisonValid: true,
      doseBand: "optimal",
    },
  ];
  const buildLinkedSupplementPayload =
    loadBuildLinkedSupplementPayload(scoredMatchedIngredients);
  const supplementsByCatalogId = new Map([
    [
      "magnesium",
      {
        name: "Magnesium",
        evidence: "Magnesium evidence",
        supplement_benefits: [
          {
            label: "Sleep support",
            score: 90,
            evidence: "Magnesium helps with sleep.",
            evidence_source: "https://pubmed.ncbi.nlm.nih.gov/11111111/",
          },
        ],
      },
    ],
    [
      "theanine",
      {
        name: "L-Theanine",
        evidence: "Theanine evidence",
        supplement_benefits: [
          {
            label: "Sleep support",
            score: 70,
            evidence: "Theanine promotes calm before bed.",
            evidence_source: "https://doi.org/10.1000/theanine",
          },
        ],
      },
    ],
  ]);

  const payload = buildLinkedSupplementPayload({
    name: "Night blend",
    matchedIngredients: scoredMatchedIngredients,
    supplementsByCatalogId,
  });

  assert.equal(payload.supplement_benefits.length, 1);
  assert.equal(payload.evidence_score, 80);
  assert.equal(payload.base_evidence_score, 80);
  assert.equal(
    payload.supplement_benefits[0].activeIngredientBenefitScore,
    90
  );
  assert.equal(payload.supplement_benefits[0].productBenefitScore, 70);
  assert.equal(payload.supplement_benefits[0].score, 90);
  assert.deepEqual(payload.supplement_benefits[0].evidenceItems, [
    "Magnesium helps with sleep.",
    "Theanine promotes calm before bed.",
  ]);
  assert.equal(
    payload.supplement_benefits[0].evidence_source,
    "https://pubmed.ncbi.nlm.nih.gov/11111111"
  );
  assert.deepEqual(payload.supplement_benefits[0].evidence_source_urls, [
    "https://pubmed.ncbi.nlm.nih.gov/11111111",
    "https://doi.org/10.1000/theanine",
  ]);
  assert.deepEqual(payload.supplement_benefits[0].scanSupportDriver, {
    canonicalIngredientId: "theanine",
    catalogId: "theanine",
    ingredientName: "L-Theanine",
    productBenefitScore: 70,
    rawActiveIngredientBenefitScore: 70,
    benefitScore: 70,
    validatedDoseFactor: 1,
    doseFactor: 1,
    doseComparisonStatus: "within_target_range",
    doseComparisonValid: true,
    doseBand: "optimal",
    hasBenefitStudy: true,
    benefitEvidenceSourceUrls: ["https://doi.org/10.1000/theanine"],
  });
  assert.deepEqual(
    payload.supplement_benefits[0].productBenefitDriver,
    payload.supplement_benefits[0].scanSupportDriver
  );
});

test("rejects a neutral missing-profile fallback when selecting a driver", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "collagen",
      ingredientName: "Collagen Peptides",
      ingredientRaw: "Collagen Peptides",
      doseFactor: 1,
      validatedDoseFactor: null,
      doseComparisonStatus: "missing_dose_scoring_profile",
      doseComparisonValid: false,
      doseBand: "unknown",
    },
    {
      catalogId: "vitamin-c",
      ingredientName: "Vitamin C",
      ingredientRaw: "Vitamin C",
      doseFactor: 0.8,
      validatedDoseFactor: 0.8,
      doseComparisonStatus: "below_effective_min",
      doseComparisonValid: true,
      doseBand: "underdosed",
    },
  ];
  const buildLinkedSupplementPayload =
    loadBuildLinkedSupplementPayload(scoredMatchedIngredients);
  const supplementsByCatalogId = new Map([
    [
      "collagen",
      {
        name: "Collagen Peptides",
        supplement_benefits: [
          {
            label: "Skin health",
            score: 82,
            evidence: "Collagen supports skin elasticity.",
            evidence_source: "https://doi.org/10.1000/collagen",
          },
        ],
      },
    ],
    [
      "vitamin-c",
      {
        name: "Vitamin C",
        supplement_benefits: [
          {
            label: "Skin health",
            score: 90,
            evidence: "Vitamin C supports collagen synthesis.",
            evidence_source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/",
          },
        ],
      },
    ],
  ]);

  const payload = buildLinkedSupplementPayload({
    name: "Skin blend",
    matchedIngredients: scoredMatchedIngredients,
    supplementsByCatalogId,
  });

  assert.equal(payload.supplement_benefits.length, 1);
  assert.equal(
    payload.supplement_benefits[0].activeIngredientBenefitScore,
    90
  );
  assert.equal(payload.supplement_benefits[0].productBenefitScore, 72);
  assert.equal(payload.supplement_benefits[0].score, 90);
  assert.equal(
    payload.supplement_benefits[0].evidence_source,
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567"
  );
  assert.deepEqual(payload.supplement_benefits[0].evidence_source_urls, [
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567",
    "https://doi.org/10.1000/collagen",
  ]);
  assert.deepEqual(payload.supplement_benefits[0].scanSupportDriver, {
    canonicalIngredientId: "vitamin-c",
    catalogId: "vitamin-c",
    ingredientName: "Vitamin C",
    productBenefitScore: 72,
    rawActiveIngredientBenefitScore: 90,
    benefitScore: 90,
    validatedDoseFactor: 0.8,
    doseFactor: 0.8,
    doseComparisonStatus: "below_effective_min",
    doseComparisonValid: true,
    doseBand: "underdosed",
    hasBenefitStudy: true,
    benefitEvidenceSourceUrls: [
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567",
    ],
  });
  assert.deepEqual(
    payload.supplement_benefits[0].productBenefitDriver,
    payload.supplement_benefits[0].scanSupportDriver
  );
});

test("preserves full precision and selects the highest valid product-benefit driver", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "lower",
      ingredientName: "Lower driver",
      doseFactor: 0.7249,
      validatedDoseFactor: 0.7249,
      doseComparisonStatus: "below_effective_min",
      doseComparisonValid: true,
    },
    {
      catalogId: "winner",
      ingredientName: "Winning driver",
      doseFactor: 0.725,
      validatedDoseFactor: 0.725,
      doseComparisonStatus: "below_effective_min",
      doseComparisonValid: true,
    },
  ];
  const buildLinkedSupplementPayload =
    loadBuildLinkedSupplementPayload(scoredMatchedIngredients);
  const supplementsByCatalogId = new Map(
    scoredMatchedIngredients.map((ingredient) => [
      ingredient.catalogId,
      {
        name: ingredient.ingredientName,
        supplement_benefits: [{ label: "Sleep support", score: 100 }],
      },
    ])
  );

  const payload = buildLinkedSupplementPayload({
    name: "Precision blend",
    matchedIngredients: scoredMatchedIngredients,
    supplementsByCatalogId,
  });
  const [benefit] = payload.supplement_benefits;

  assert.equal(benefit.productBenefitScore, 72.5);
  assert.equal(benefit.productBenefitDriver.ingredientName, "Winning driver");
  assert.equal(benefit.productBenefitDriver.validatedDoseFactor, 0.725);
  assert.deepEqual(
    benefit.productBenefitDrivers.map((driver) => driver.ingredientName),
    ["Lower driver", "Winning driver"]
  );
  assert.deepEqual(
    benefit.productBenefitDrivers.map((driver) => driver.productBenefitScore),
    [72.49, 72.5]
  );
});

test("leaves product benefit unrated when every driver has an invalid dose comparison", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "missing-dose",
      ingredientName: "Missing dose",
      doseFactor: 1,
      validatedDoseFactor: null,
      doseComparisonStatus: "missing_actual_dose",
      doseComparisonValid: false,
    },
  ];
  const buildLinkedSupplementPayload =
    loadBuildLinkedSupplementPayload(scoredMatchedIngredients);
  const payload = buildLinkedSupplementPayload({
    name: "Unknown dose",
    matchedIngredients: scoredMatchedIngredients,
    supplementsByCatalogId: new Map([
      [
        "missing-dose",
        {
          name: "Missing dose",
          supplement_benefits: [{ label: "Sleep support", score: 90 }],
        },
      ],
    ]),
  });
  const [benefit] = payload.supplement_benefits;

  assert.equal(benefit.productBenefitScore, null);
  assert.equal(benefit.productBenefitDriver, undefined);
  assert.equal(benefit.scanSupportDriver, undefined);
  assert.equal(benefit.productBenefitDrivers.length, 1);
  assert.equal(benefit.productBenefitDrivers[0].ingredientName, "Missing dose");
  assert.equal(benefit.productBenefitDrivers[0].productBenefitScore, null);
});

test("canonical identity conflicts cannot contribute evidence, benefits, or guidance", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "wrong-probiotic",
      ingredientName: "Streptococcus thermophilus",
      canonicalIdentityCompatible: false,
      doseFactor: 1,
      validatedDoseFactor: null,
      doseComparisonStatus: "canonical_identity_mismatch",
      doseComparisonValid: false,
    },
  ];
  const buildLinkedSupplementPayload =
    loadBuildLinkedSupplementPayload(scoredMatchedIngredients);
  const payload = buildLinkedSupplementPayload({
    name: "Probiotic product",
    matchedIngredients: scoredMatchedIngredients,
    supplementsByCatalogId: new Map([
      [
        "wrong-probiotic",
        {
          name: "Bifidobacterium lactis",
          evidence: "Evidence belonging to a different species.",
          how_to_use: "Dose guidance belonging to a different species.",
          supplement_benefits: [
            { label: "Wrong inherited benefit", score: 95 },
          ],
        },
      ],
    ]),
  });

  assert.equal(payload.matchedIngredients.length, 1);
  assert.equal(payload.evidence, null);
  assert.deepEqual(payload.supplement_benefits, []);
  assert.equal(payload.how_to_use, null);
});

test("builds deduplicated reference items with benefit metadata", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "theanine",
      ingredientName: "L-Theanine",
      ingredientRaw: "L-Theanine",
      doseFactor: 1,
      validatedDoseFactor: 1,
      doseComparisonStatus: "within_target_range",
      doseComparisonValid: true,
      doseBand: "optimal",
    },
    {
      catalogId: "magnesium",
      ingredientName: "Magnesium Glycinate",
      ingredientRaw: "Magnesium Glycinate",
      doseFactor: 1,
      validatedDoseFactor: 1,
      doseComparisonStatus: "within_target_range",
      doseComparisonValid: true,
      doseBand: "optimal",
    },
  ];
  const buildLinkedSupplementPayload =
    loadBuildLinkedSupplementPayload(scoredMatchedIngredients);
  const supplementsByCatalogId = new Map([
    [
      "theanine",
      {
        name: "L-Theanine",
        supplement_benefits: [
          {
            label: "Stress relief",
            score: 78,
            evidence:
              'White et al. (2024), Nutrients: "L-theanine and acute stress response." Randomized human data showed modest stress-marker reductions.',
            evidence_source: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
          },
        ],
      },
    ],
    [
      "magnesium",
      {
        name: "Magnesium",
        supplement_benefits: [
          {
            label: "Sleep support",
            score: 82,
            evidence:
              'White et al. (2024), Nutrients: "L-theanine and acute stress response." Sleep outcomes also improved in a subset of participants.',
            evidence_source: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
          },
        ],
      },
    ],
  ]);

  const payload = buildLinkedSupplementPayload({
    name: "Calm blend",
    matchedIngredients: scoredMatchedIngredients,
    supplementsByCatalogId,
  });

  assert.deepEqual(payload.referenceItems, [
    {
      url: "https://pubmed.ncbi.nlm.nih.gov/12345678",
      benefitLabels: ["Stress relief", "Sleep support"],
      citationTitle: "L-theanine and acute stress response",
      sourceLabel: "Nutrients",
      year: 2024,
    },
  ]);
});
