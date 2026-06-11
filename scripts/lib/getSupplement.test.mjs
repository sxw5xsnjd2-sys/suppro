import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadGetSupplementHelpers() {
  const source = readFileSync(
    new URL("../../src/data/getSupplement.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace(/\bexport\s+/g, "");

  const factory = new Function(
    "CATALOG_TYPES",
    "createSupplementProductCatalogId",
    "getCatalogEntityId",
    "getCatalogType",
    "supabase",
    "buildLinkedSupplementPayload",
    "buildSupplementReferenceItems",
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
    catalogTypes,
    () => null,
    () => null,
    (value) => (String(value ?? "").startsWith("custom:") ? catalogTypes.CUSTOM : null),
    {},
    () => null,
    () => []
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
