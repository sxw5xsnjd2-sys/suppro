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
    `${doseNormalizationSource}\nreturn { DOSE_CONTRACT_VERSION, normalizeIngredientDose };`,
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
    "normalizeIngredientDose",
    `${transformed}
return { classifyIngredientText, extractIngredientCandidatesFromList, matchIngredientsToCatalog };`,
  )(
    doseNormalization.DOSE_CONTRACT_VERSION,
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
