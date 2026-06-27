import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
    `${transformed}
return {
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
    overrides.fetchIngredientMatchCatalog ?? (async () => [])
  );
}

const { dedupeProductIngredientsForDisplay, getSupplementById } =
  loadGetSupplementHelpers();

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
