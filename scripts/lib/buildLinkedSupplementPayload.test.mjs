import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadBuildLinkedSupplementPayload(scoredMatchedIngredients) {
  const source = readFileSync(
    new URL("../../src/data/buildLinkedSupplementPayload.js", import.meta.url),
    "utf8"
  );
  const transformed = source
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"@\/features\/supplements\/recommendedDoseScoring";\n\n/,
      ""
    )
    .replace(/export function /g, "function ");
  const factory = new Function(
    "buildProductEvidenceScoreData",
    "scoreMatchedIngredientsForProduct",
    `${transformed}\nreturn { buildLinkedSupplementPayload };`
  );

  return factory(
    () => ({
      evidenceScore: 80,
      baseEvidenceScore: 80,
      scoreAdjustmentSummary: null,
      scoreAdjustmentReasonCode: null,
    }),
    () => scoredMatchedIngredients
  ).buildLinkedSupplementPayload;
}

test("selects the scan support driver by benefit score weighted by dose factor", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "magnesium",
      ingredientName: "Magnesium Glycinate",
      ingredientRaw: "Magnesium Glycinate",
      doseFactor: 0.7,
      doseBand: "underdosed",
    },
    {
      catalogId: "theanine",
      ingredientName: "L-Theanine",
      ingredientRaw: "L-Theanine",
      doseFactor: 1,
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
    catalogId: "theanine",
    ingredientName: "L-Theanine",
    benefitScore: 70,
    doseFactor: 1,
    doseBand: "optimal",
  });
});

test("keeps missing dose-profile matches neutral when selecting a scan support driver", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "collagen",
      ingredientName: "Collagen Peptides",
      ingredientRaw: "Collagen Peptides",
      doseFactor: 1,
      doseBand: "unknown",
    },
    {
      catalogId: "vitamin-c",
      ingredientName: "Vitamin C",
      ingredientRaw: "Vitamin C",
      doseFactor: 0.8,
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
    catalogId: "collagen",
    ingredientName: "Collagen Peptides",
    benefitScore: 82,
    doseFactor: 1,
    doseBand: "unknown",
  });
});

test("builds deduplicated reference items with benefit metadata", () => {
  const scoredMatchedIngredients = [
    {
      catalogId: "theanine",
      ingredientName: "L-Theanine",
      ingredientRaw: "L-Theanine",
      doseFactor: 1,
      doseBand: "optimal",
    },
    {
      catalogId: "magnesium",
      ingredientName: "Magnesium Glycinate",
      ingredientRaw: "Magnesium Glycinate",
      doseFactor: 1,
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
