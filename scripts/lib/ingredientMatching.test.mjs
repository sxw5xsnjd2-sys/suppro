import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadIngredientMatchingHelpers() {
  const doseNormalizationSource = readFileSync(
    new URL(
      "../../features/supplements/doseNormalization.js",
      import.meta.url,
    ),
    "utf8",
  ).replace(/\bexport\s+/gu, "");
  const doseNormalization = new Function(
    `${doseNormalizationSource}\nreturn { DOSE_CONTRACT_VERSION, getProbioticIdentityCompatibility, normalizeIngredientDose };`,
  )();
  const source = readFileSync(
    new URL("../../features/scanner/ingredientMatching.js", import.meta.url),
    "utf8",
  );
  const transformed = source
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+"@\/features\/supplements\/doseNormalization";\n/u, "")
    .replace(/^export function /gm, "function ");

  return new Function(
    "DOSE_CONTRACT_VERSION",
    "getProbioticIdentityCompatibility",
    "normalizeIngredientDose",
    `${transformed}
return { classifyIngredientText, extractIngredientCandidatesFromList, matchIngredientsToCatalog };`,
  )(
    doseNormalization.DOSE_CONTRACT_VERSION,
    doseNormalization.getProbioticIdentityCompatibility,
    doseNormalization.normalizeIngredientDose,
  );
}

test("exact water is inactive and never matches watermelon extract", () => {
  const {
    classifyIngredientText,
    extractIngredientCandidatesFromList,
    matchIngredientsToCatalog,
  } =
    loadIngredientMatchingHelpers();

  assert.equal(classifyIngredientText("water"), "inactive");

  const result = matchIngredientsToCatalog(
    extractIngredientCandidatesFromList(["water"]),
    [
      {
        catalogId: "watermelon-extract",
        catalogName: "Watermelon Extract",
        verified: true,
        sourceTable: "supplement_ingredients",
      },
    ],
  );

  assert.deepEqual(result.matchedIngredients, []);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.unmatchedIngredients, []);
});

test("watermelon extract is still allowed when explicitly extracted", () => {
  const {
    classifyIngredientText,
    extractIngredientCandidatesFromList,
    matchIngredientsToCatalog,
  } =
    loadIngredientMatchingHelpers();

  assert.equal(classifyIngredientText("watermelon extract"), "active");

  const result = matchIngredientsToCatalog(
    extractIngredientCandidatesFromList(["watermelon extract"]),
    [
      {
        catalogId: "watermelon-extract",
        catalogName: "Watermelon Extract",
        verified: true,
        sourceTable: "supplement_ingredients",
      },
    ],
  );

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].catalogName, "Watermelon Extract");
  assert.equal(result.matches[0].matchType, "exact");
});

test("structured probiotic candidates preserve strain identifiers and CFU doses", () => {
  const { extractIngredientCandidatesFromList } =
    loadIngredientMatchingHelpers();
  const candidates = extractIngredientCandidatesFromList([
    {
      raw_name: "Lactobacillus acidophilus LA-14",
      canonical_name: "Lactobacillus acidophilus LA-14",
      dosage_display: "10 billion CFU",
      amount_basis: "per_serving",
      dose_confidence: "verified",
    },
    {
      raw_name: "Bacillus coagulans GBI-30, 6086",
      canonical_name: "Bacillus coagulans GBI-30, 6086",
      dosage_value: 500_000_000,
      dosage_unit: "viable organisms",
      amount_basis: "per_serving",
      dose_confidence: "verified",
    },
  ]);

  assert.deepEqual(
    candidates.map((candidate) => candidate.raw),
    [
      "Lactobacillus acidophilus LA-14",
      "Bacillus coagulans GBI-30, 6086",
    ],
  );
  assert.deepEqual(
    candidates.map((candidate) => [candidate.amount, candidate.unit]),
    [
      [10_000_000_000, "CFU"],
      [500_000_000, "CFU"],
    ],
  );
});

test("canonical matching keeps distinct probiotic species on distinct canonical IDs", () => {
  const { extractIngredientCandidatesFromList, matchIngredientsToCatalog } =
    loadIngredientMatchingHelpers();
  const strainNames = [
    "Lactobacillus acidophilus LA-14",
    "Bifidobacterium lactis HN019",
    "Lactobacillus rhamnosus GG",
    "Bacillus coagulans GBI-30, 6086",
    "Lactobacillus plantarum Lp-115",
    "Lactobacillus casei Lc-11",
    "Lactobacillus paracasei Lpc-37",
    "Lactobacillus salivarius Ls-33",
    "Lactobacillus brevis Lbr-35",
    "Lactobacillus gasseri Lg-36",
    "Bifidobacterium breve Bb-03",
    "Bifidobacterium bifidum Bb-06",
    "Bifidobacterium longum Bl-05",
    "Lactococcus lactis Ll-23",
    "Streptococcus thermophilus St-21",
    "Saccharomyces boulardii SB-01",
  ];
  const candidates = extractIngredientCandidatesFromList(
    strainNames.map((name) => ({
      name,
      dosageValue: null,
      dosageUnit: null,
      doseConfidence: "missing",
    })),
  );
  const catalog = strainNames.map((catalogName, index) => ({
    catalogId: `probiotic-strain-${index}`,
    catalogName,
    canonicalName: catalogName,
    verified: true,
    sourceTable: "supplements",
  }));

  const result = matchIngredientsToCatalog(candidates, catalog);

  assert.equal(candidates.length, 16);
  assert.equal(result.matchedIngredients.length, 16);
  assert.equal(result.matches.length, 16);
  assert.deepEqual(
    result.matchedIngredients.map((match) => match.ingredientRaw),
    strainNames,
  );
});

test("species aliases cannot map distinct probiotics onto one generic canonical", () => {
  const { extractIngredientCandidatesFromList, matchIngredientsToCatalog } =
    loadIngredientMatchingHelpers();
  const names = [
    "Bifidobacterium lactis",
    "Bifidobacterium longum",
    "Lactobacillus gasseri",
    "Streptococcus thermophilus",
  ];
  const candidates = extractIngredientCandidatesFromList(names);
  const catalog = names.map((catalogName) => ({
    catalogId: "generic-probiotic-id",
    catalogName,
    canonicalName: "Probiotics",
    verified: true,
    sourceTable: "supplement_aliases",
  }));

  const result = matchIngredientsToCatalog(candidates, catalog);

  assert.deepEqual(result.matchedIngredients, []);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.unmatchedIngredients, names);
});

test("probiotic OCR genus corrections remain species-specific", () => {
  const { extractIngredientCandidatesFromList, matchIngredientsToCatalog } =
    loadIngredientMatchingHelpers();
  const candidates = extractIngredientCandidatesFromList([
    "Lactobacilus casei",
    "Bifidobactertum longum",
    "Lactobilus salivarius",
  ]);
  const result = matchIngredientsToCatalog(candidates, [
    {
      catalogId: "casei",
      catalogName: "Lactobacillus casei",
      canonicalName: "Lactobacillus casei",
      verified: true,
      sourceTable: "supplements",
    },
    {
      catalogId: "longum",
      catalogName: "Bifidobacterium longum",
      canonicalName: "Bifidobacterium longum",
      verified: true,
      sourceTable: "supplements",
    },
    {
      catalogId: "salivarius",
      catalogName: "Lactobacillus salivarius",
      canonicalName: "Lactobacillus salivarius",
      verified: true,
      sourceTable: "supplements",
    },
    {
      catalogId: "wrong-species",
      catalogName: "Lactobacillus gasseri",
      canonicalName: "Lactobacillus gasseri",
      verified: true,
      sourceTable: "supplements",
    },
  ]);

  assert.deepEqual(
    result.matchedIngredients.map((match) => match.catalogId),
    ["casei", "longum", "salivarius"],
  );
});

test("embedded mass and enzyme doses are split before ingredient matching", () => {
  const { extractIngredientCandidatesFromList, matchIngredientsToCatalog } =
    loadIngredientMatchingHelpers();
  const candidates = extractIngredientCandidatesFromList([
    "Vitamin B12 500 μg",
    "Lactase 3000 FCC",
  ]);

  assert.deepEqual(
    candidates.map((candidate) => [candidate.raw, candidate.amount, candidate.unit]),
    [
      ["Vitamin B12", 500, "mcg"],
      ["Lactase", 3000, "FCC"],
    ],
  );

  const result = matchIngredientsToCatalog(candidates, [
    {
      catalogId: "vitamin-b12",
      catalogName: "Vitamin B12",
      verified: true,
      sourceTable: "supplements",
    },
    {
      catalogId: "lactase",
      catalogName: "Lactase",
      verified: true,
      sourceTable: "supplements",
    },
  ]);
  assert.deepEqual(
    result.matchedIngredients.map((match) => [
      match.catalogId,
      match.dosageDisplay,
    ]),
    [
      ["vitamin-b12", "500 mcg"],
      ["lactase", "3000 FCC"],
    ],
  );
});

test("indexed matching preserves exact, alias, fuzzy, and unmatched results", () => {
  const { extractIngredientCandidatesFromList, matchIngredientsToCatalog } =
    loadIngredientMatchingHelpers();
  const ingredients = extractIngredientCandidatesFromList([
    {
      name: "Magnesium",
      dosageValue: 200,
      dosageUnit: "mg",
      amountBasis: "per_100g",
      doseConfidence: "unverified",
      doseReviewReason: "Panel row unclear",
    },
    "Ascorbic Acid",
    "Green Tea Extract Powder",
    "Mystery Compound",
  ]);
  const catalog = [
    {
      catalogId: "magnesium",
      catalogName: "Magnesium",
      verified: true,
      sourceTable: "supplements",
    },
    {
      catalogId: "vitamin-c",
      catalogName: "Vitamin C",
      verified: true,
      sourceTable: "supplements",
    },
    {
      catalogId: "green-tea",
      catalogName: "Green Tea Extract",
      verified: true,
      sourceTable: "supplements",
    },
  ];

  const result = matchIngredientsToCatalog(ingredients, catalog);

  assert.deepEqual(
    result.matchedIngredients.map((match) => [
      match.catalogId,
      match.matchType,
    ]),
    [
      ["magnesium", "exact"],
      ["vitamin-c", "alias"],
      ["green-tea", "partial"],
    ],
  );
  assert.equal(result.matchedIngredients[0].dosageValue, 200);
  assert.equal(result.matchedIngredients[0].dosageUnit, "mg");
  assert.equal(result.matchedIngredients[0].dosageDisplay, "200 mg");
  assert.equal(result.matchedIngredients[0].amountBasis, "per_100g");
  assert.equal(result.matchedIngredients[0].doseConfidence, "unverified");
  assert.equal(
    result.matchedIngredients[0].doseReviewReason,
    "Panel row unclear",
  );
  assert.equal(
    result.matchedIngredients[0].normalizedDose.unavailableReason,
    "dose_not_verified",
  );
  assert.deepEqual(result.unmatchedIngredients, ["Mystery Compound"]);
});

test("a second match reuses the processed catalog lookup", () => {
  const { extractIngredientCandidatesFromList, matchIngredientsToCatalog } =
    loadIngredientMatchingHelpers();
  const ingredients = extractIngredientCandidatesFromList(["Magnesium"]);
  const catalog = [
    {
      catalogId: "magnesium",
      catalogName: "Magnesium",
      verified: true,
      sourceTable: "supplements",
    },
  ];
  const cacheEvents = [];
  const options = {
    scanRequestId: "cache-test",
    logTiming(_requestId, stage, details) {
      if (stage === "ingredient_matching_catalog_index_completed") {
        cacheEvents.push(details.cacheHit);
      }
    },
  };

  matchIngredientsToCatalog(ingredients, catalog, options);
  matchIngredientsToCatalog(ingredients, catalog, options);

  assert.deepEqual(cacheEvents, [false, true]);
});
