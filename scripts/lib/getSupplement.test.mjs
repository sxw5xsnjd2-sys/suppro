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

const doseNormalization = loadDoseNormalizationModule();

function loadGetSupplementHelpers(overrides = {}) {
  const source = readFileSync(
    new URL("../../src/data/getSupplement.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace(/\bexport\s+/g, "");

  const factory = new Function(
    "extractIngredientCandidatesFromList",
    "matchIngredientsToCatalog",
    "CATALOG_TYPES",
    "createSupplementProductCatalogId",
    "getCatalogEntityId",
    "getCatalogType",
    "supabase",
    "buildLinkedSupplementPayload",
    "buildSupplementReferenceItems",
    "fetchIngredientMatchCatalog",
    "logScanTiming",
    "normalizeIngredientDose",
    `${transformed}
return {
  buildProductIngredientMatch,
  dedupeProductIngredientsForDisplay,
  getSupplementById,
};`
  );

  const catalogTypes = {
    ACTIVE_INGREDIENT: "active_ingredient",
    CUSTOM: "custom",
    LEGACY_CUSTOM: "legacy_custom",
    SUPPLEMENT_PRODUCT: "supplement_product",
  };

  return factory(
    overrides.extractIngredientCandidatesFromList ?? (() => []),
    overrides.matchIngredientsToCatalog ??
      (() => ({ matchedIngredients: [], unmatchedIngredients: [] })),
    catalogTypes,
    overrides.createSupplementProductCatalogId ?? (() => null),
    overrides.getCatalogEntityId ?? (() => null),
    overrides.getCatalogType ??
      ((value) =>
        String(value ?? "").startsWith("custom:") ? catalogTypes.CUSTOM : null),
    overrides.supabase ?? {},
    overrides.buildLinkedSupplementPayload ?? (() => null),
    overrides.buildSupplementReferenceItems ?? (() => []),
    overrides.fetchIngredientMatchCatalog ?? (async () => []),
    overrides.logScanTiming ?? (() => {}),
    overrides.normalizeIngredientDose ??
      doseNormalization.normalizeIngredientDose,
  );
}

const { dedupeProductIngredientsForDisplay, getSupplementById } =
  loadGetSupplementHelpers();

test("database hydration preserves verified dose confidence and review reason", () => {
  const helpers = loadGetSupplementHelpers();
  const match = helpers.buildProductIngredientMatch(
    {
      canonical_supplement_id: "magnesium",
      canonical_name: "Magnesium",
      dosage_value: "200",
      dosage_unit: "mg",
      dosage_original_text: "Magnesium 200 mg",
      amount_basis: "per_serving",
      dose_confidence: "verified",
      dose_review_reason: "Matched the OCR row",
    },
    new Map([["magnesium", "Magnesium"]]),
  );

  assert.equal(match.dosageValue, 200);
  assert.equal(match.dosageUnit, "mg");
  assert.equal(match.dosageOriginalText, "Magnesium 200 mg");
  assert.equal(match.dosageDisplay, "200 mg");
  assert.equal(match.amountBasis, "per_serving");
  assert.equal(match.doseConfidence, "verified");
  assert.equal(match.doseReviewReason, "Matched the OCR row");
  assert.equal(match.normalizedDose.isVerified, true);
  assert.equal(match.normalizedDose.isScoringEligible, true);
});

test("database hydration preserves and formats verified CFU doses", () => {
  const helpers = loadGetSupplementHelpers();
  const match = helpers.buildProductIngredientMatch(
    {
      canonical_supplement_id: "probiotic-blend",
      canonical_name: "Probiotic blend",
      dosage_value: "10000000000",
      dosage_unit: "CFU",
      dosage_original_text: "Probiotic blend 10 billion CFU per serving",
      amount_basis: null,
      dose_confidence: "verified",
      dose_review_reason: null,
    },
    new Map([["probiotic-blend", "Probiotic blend"]]),
  );

  assert.equal(match.dosageValue, 10_000_000_000);
  assert.equal(match.dosageUnit, "CFU");
  assert.equal(match.dosageDisplay, "10 billion CFU");
  assert.equal(match.amountBasis, "per_serving");
  assert.equal(match.doseConfidence, "verified");
  assert.equal(match.normalizedDose.isScoringEligible, true);
});

test("database hydration restores decimal CFU multipliers without coefficient loss", () => {
  const helpers = loadGetSupplementHelpers();
  const fixtures = [
    [
      "streptococcus-thermophilus",
      "Streptococcus thermophilus",
      "1",
      "Streptococcus thermophilus — 1 billion CFU",
      1_000_000_000,
      "1 billion CFU",
    ],
    [
      "lactobacillus-acidophilus",
      "Lactobacillus acidophilus",
      "39.5",
      "Lactobacillus acidophilus — 39.5 billion CFU",
      39_500_000_000,
      "39.5 billion CFU",
    ],
  ];

  fixtures.forEach(
    ([catalogId, name, storedValue, originalText, expectedValue, display]) => {
      const match = helpers.buildProductIngredientMatch(
        {
          canonical_supplement_id: catalogId,
          canonical_name: name,
          dosage_value: storedValue,
          dosage_unit: "CFU",
          dosage_original_text: originalText,
          amount_basis: "per_serving",
          dose_confidence: "verified",
        },
        new Map([[catalogId, name]]),
      );

      assert.equal(match.dosageValue, expectedValue);
      assert.equal(match.dosageDisplay, display);
      assert.equal(match.normalizedDose.value, expectedValue);
      assert.equal(match.normalizedDose.displayText, display);
      assert.equal(Number.isSafeInteger(match.dosageValue), true);
    },
  );
});

test("hydration preserves sixteen distinct probiotic species with expanded CFU doses", () => {
  const helpers = loadGetSupplementHelpers();
  const names = [
    "Lactobacillus acidophilus",
    "Bifidobacterium lactis",
    "Bifidobacterium longum",
    "Lactobacillus casei",
    "Lactobacillus gasseri",
    "Streptococcus thermophilus",
    "Bifidobacterium bifidum",
    "Lactobacillus rhamnosus",
    "Lactobacillus bulgaricus",
    "Lactobacillus plantarum",
    "Lactobacillus salivarius",
    "Lactobacillus brevis",
    "Bifidobacterium breve",
    "Lactobacillus paracasei",
    "Lactococcus lactis",
    "Saccharomyces boulardii",
  ];
  const catalogNames = new Map(
    names.map((name, index) => [`strain-${index}`, name]),
  );
  const hydrated = names.map((name, index) =>
    helpers.buildProductIngredientMatch(
      {
        canonical_supplement_id: `strain-${index}`,
        canonical_name: name,
        dosage_value: String(index + 1),
        dosage_unit: "CFU",
        dosage_original_text: `${name} — ${index + 1} billion CFU`,
        amount_basis: "per_serving",
        dose_confidence: "verified",
      },
      catalogNames,
    ),
  );
  const displayed = helpers.dedupeProductIngredientsForDisplay(hydrated);

  assert.equal(displayed.length, 16);
  assert.deepEqual(
    displayed.map((ingredient) => ingredient.ingredientName),
    names,
  );
  assert.deepEqual(
    displayed.map((ingredient) => ingredient.dosageValue),
    names.map((_, index) => (index + 1) * 1_000_000_000),
  );
  assert.ok(
    displayed.every(
      (ingredient) =>
        ingredient.dosageUnit === "CFU" &&
        ingredient.normalizedDose.isScoringEligible,
    ),
  );
});

test("database hydration removes an embedded enzyme dose without losing it", () => {
  const helpers = loadGetSupplementHelpers();
  const match = helpers.buildProductIngredientMatch(
    {
      canonical_supplement_id: "lactase",
      canonical_name: "Lactase 3000 FCC",
      dosage_value: "3000",
      dosage_unit: "FCC",
      dosage_original_text: "Lactase 3000 FCC per daily dose",
      amount_basis: "per_daily_dose",
      dose_confidence: "verified",
    },
    new Map([["lactase", "Lactase"]]),
  );

  assert.equal(match.ingredientName, "Lactase");
  assert.equal(match.dosageValue, 3000);
  assert.equal(match.dosageUnit, "FCC");
  assert.equal(match.dosageDisplay, "3000 FCC");
  assert.equal(match.amountBasis, "per_daily_dose");
  assert.equal(match.normalizedDose.isScoringEligible, true);
});

test("custom supplement ids do not fall through to master supplement lookup", async () => {
  const supplement = await getSupplementById("custom:user-row-id");

  assert.equal(supplement, null);
});

test("display dedupe preserves EPA and DHA rows sharing one omega-3 catalog id", () => {
  const rows = dedupeProductIngredientsForDisplay([
    {
      catalogId: "omega3",
      catalogName: "Omega-3 fatty acids",
      ingredientName: "Eicosapentaenoic Acid",
      ingredientRaw: "Eicosapentaenoic Acid",
      dosageValue: 800,
      dosageUnit: "mg",
      chemicalForm: null,
    },
    {
      catalogId: "omega3",
      catalogName: "Omega-3 fatty acids",
      ingredientName: "Docosahexaenoic Acid",
      ingredientRaw: "Docosahexaenoic Acid",
      dosageValue: 400,
      dosageUnit: "mg",
      chemicalForm: null,
    },
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.ingredientRaw),
    ["Eicosapentaenoic Acid", "Docosahexaenoic Acid"]
  );
});

test("display dedupe still collapses near-duplicate rows with the same ingredient and dose", () => {
  const rows = dedupeProductIngredientsForDisplay([
    {
      catalogId: "coq10",
      catalogName: "Coenzyme Q10",
      ingredientName: "Coenzyme Q10 (Ubiquinone)",
      ingredientRaw: "Coenzyme Q10 (Ubiquinone)",
      dosageValue: 100,
      dosageUnit: "mg",
      chemicalForm: null,
    },
    {
      catalogId: "coq10",
      catalogName: "Coenzyme Q10",
      ingredientName: "Coenzyme Q10",
      ingredientRaw: "Coenzyme Q10",
      dosageValue: 100,
      dosageUnit: "mg",
      chemicalForm: null,
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].catalogId, "coq10");
  assert.equal(rows[0].dosageValue, 100);
  assert.equal(rows[0].dosageUnit, "mg");
});

test("hydration display dedupe preserves a blend and sixteen distinct undosed strains", () => {
  const names = [
    "16-strain probiotic blend",
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
  const hydrated = names.map((ingredientRaw, index) => ({
    catalogId: "probiotic-parent",
    ingredientRaw,
    ingredientName: ingredientRaw,
    dosageValue: index === 0 ? 10_000_000_000 : null,
    dosageUnit: index === 0 ? "CFU" : null,
    dosageDisplay: index === 0 ? "10 billion CFU" : null,
    chemicalForm: null,
  }));

  const deduped = dedupeProductIngredientsForDisplay(hydrated);

  assert.equal(deduped.length, 17);
  assert.deepEqual(
    deduped.map((ingredient) => ingredient.ingredientRaw),
    names,
  );
  assert.equal(deduped[0].dosageDisplay, "10 billion CFU");
  deduped.slice(1).forEach((ingredient) => {
    assert.equal(ingredient.dosageValue, null, ingredient.ingredientRaw);
    assert.equal(ingredient.dosageUnit, null, ingredient.ingredientRaw);
    assert.equal(ingredient.dosageDisplay, null, ingredient.ingredientRaw);
  });
});

test("hydration keeps an active formal-panel ingredient without a canonical match", () => {
  const helpers = loadGetSupplementHelpers();
  const match = helpers.buildProductIngredientMatch(
    {
      canonical_supplement_id: null,
      canonical_name: "Bifidobacterium longum BL-99",
      dosage_value: null,
      dosage_unit: null,
      dosage_original_text: null,
      amount_basis: "unknown",
      dose_confidence: "missing",
      dose_review_reason: null,
    },
    new Map(),
  );

  assert.equal(match.catalogId, null);
  assert.equal(match.ingredientName, "Bifidobacterium longum BL-99");
  assert.equal(match.normalizedDose.presentation.statusLabel, "Dose unavailable");
});

function createQueryResult(data) {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    order() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve({ data, error: null });
    },
    then(resolve, reject) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
}

test("supplement product falls back to active_ingredients_json when linked rows are empty", async () => {
  const catalogTypes = {
    ACTIVE_INGREDIENT: "active_ingredient",
    CUSTOM: "custom",
    LEGACY_CUSTOM: "legacy_custom",
    SUPPLEMENT_PRODUCT: "supplement_product",
  };
  const productId = "product-5017174314890";
  const activeIngredientsJson = [
    { name: "Vitamin D" },
    { name: "Zinc" },
  ];
  const matchedIngredients = [
    {
      ingredientRaw: "Vitamin D",
      catalogId: "vitamin-d",
      catalogName: "Vitamin D",
      verified: true,
      matchType: "alias",
      score: 90,
      classification: "active",
      dosageValue: null,
      dosageUnit: null,
      dosageDisplay: null,
    },
    {
      ingredientRaw: "Zinc",
      catalogId: "zinc",
      catalogName: "Zinc",
      verified: true,
      matchType: "exact",
      score: 100,
      classification: "active",
      dosageValue: null,
      dosageUnit: null,
      dosageDisplay: null,
    },
  ];
  const supplementRows = [
    { id: "vitamin-d", name: "Vitamin D", status: "approved" },
    { id: "zinc", name: "Zinc", status: "approved" },
  ];
  const payloadCalls = [];
  const helpers = loadGetSupplementHelpers({
    extractIngredientCandidatesFromList(values) {
      assert.deepEqual(values, activeIngredientsJson);
      return values.map((value) => ({
        raw: value.name,
        normalized: value.name.toLowerCase(),
      }));
    },
    fetchIngredientMatchCatalog: async () => [
      { catalogId: "vitamin-d", catalogName: "Vitamin D" },
      { catalogId: "zinc", catalogName: "Zinc" },
    ],
    matchIngredientsToCatalog(candidates) {
      assert.deepEqual(
        candidates.map((candidate) => candidate.raw),
        ["Vitamin D", "Zinc"]
      );
      return { matchedIngredients, unmatchedIngredients: [] };
    },
    createSupplementProductCatalogId: (id) => `supplement_product:${id}`,
    getCatalogEntityId: (id) =>
      String(id ?? "").replace(/^supplement_product:/, ""),
    getCatalogType: (id) =>
      String(id ?? "").startsWith("supplement_product:")
        ? catalogTypes.SUPPLEMENT_PRODUCT
        : null,
    supabase: {
      from(table) {
        if (table === "supplement_products_master") {
          return createQueryResult({
            product_id: productId,
            barcode: "5017174314890",
            display_name: "Holland & Barrett Ultra Man",
            active_ingredients_json: activeIngredientsJson,
            verification_status: "go_upc_unverified",
          });
        }

        if (table === "product_active_ingredients") {
          return createQueryResult([]);
        }

        if (table === "supplements") {
          return createQueryResult(supplementRows);
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
    buildLinkedSupplementPayload(args) {
      payloadCalls.push(args);
      return {
        id: args.id,
        name: args.name,
        matchedIngredients: args.displayIngredients,
        evidence_score: args.matchedIngredients.length ? 72 : 0,
      };
    },
  });

  const product = await helpers.getSupplementById(
    `supplement_product:${productId}`
  );

  assert.equal(product.name, "Holland & Barrett Ultra Man");
  assert.equal(product.ingredient_count, 2);
  assert.equal(product.evidence_score, 72);
  assert.deepEqual(
    product.matchedIngredients.map((ingredient) => ingredient.catalogId),
    ["vitamin-d", "zinc"]
  );
  assert.equal(payloadCalls.length, 1);
  assert.deepEqual(
    Array.from(payloadCalls[0].supplementsByCatalogId.keys()),
    ["vitamin-d", "zinc"]
  );
});
