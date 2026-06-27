import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`Could not find ${functionName} in source`);
  }

  const bodyStart = source.indexOf("{", start);
  if (bodyStart === -1) {
    throw new Error(`Could not find ${functionName} body start`);
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not find ${functionName} body end`);
}

function loadPersistGoUpcHelpers() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/persist-go-upc-product/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const transformed = [
    extractFunctionSource(source, "trimString").replace(
      /function trimString\(value: unknown\): string \{/,
      "function trimString(value) {",
    ),
    extractFunctionSource(source, "normalizeProvisionalIngredientText").replace(
      /function normalizeProvisionalIngredientText\(value: unknown\) \{/,
      "function normalizeProvisionalIngredientText(value) {",
    ),
    extractFunctionSource(source, "sanitizeStringArray").replace(
      /function sanitizeStringArray\(value: unknown\): string\[\] \{/,
      "function sanitizeStringArray(value) {",
    ),
    extractFunctionSource(source, "normalizeDosageUnit").replace(
      /function normalizeDosageUnit\(value: string\) \{/,
      "function normalizeDosageUnit(value) {",
    ),
    extractFunctionSource(source, "stripProvisionalMarketingText").replace(
      /function stripProvisionalMarketingText\(value: string\) \{/,
      "function stripProvisionalMarketingText(value) {",
    ),
    extractFunctionSource(source, "titleCaseFallback").replace(
      /function titleCaseFallback\(value: string\) \{/,
      "function titleCaseFallback(value) {",
    ),
    extractFunctionSource(source, "normalizeProvisionalIngredientName")
      .replace(
        /function normalizeProvisionalIngredientName\(\s*value: string,\s*preferVitaminPrefix: boolean,\s*\) \{/,
        "function normalizeProvisionalIngredientName(value, preferVitaminPrefix) {",
      ),
    extractFunctionSource(source, "parseProvisionalIngredient")
      .replace(
        /function parseProvisionalIngredient\(\s*value: string,\s*preferVitaminPrefix: boolean,\s*\) \{/,
        "function parseProvisionalIngredient(value, preferVitaminPrefix) {",
      ),
    extractFunctionSource(source, "buildProvisionalActiveIngredients")
      .replace(
        /function buildProvisionalActiveIngredients\(\s*sourceIngredients: unknown,\s*ingredientsText: string,\s*\) \{/,
        "function buildProvisionalActiveIngredients(sourceIngredients, ingredientsText) {",
      )
      .replace(
        /const seenIngredients = new Set<string>\(\);/,
        "const seenIngredients = new Set();",
      ),
    extractFunctionSource(source, "sanitizeDsldActiveIngredients")
      .replace(
        /function sanitizeDsldActiveIngredients\(value: unknown\) \{/,
        "function sanitizeDsldActiveIngredients(value) {",
      )
      .replace(/const seenIngredients = new Set<string>\(\);/, "const seenIngredients = new Set();")
      .replace(/const row = item as Record<string, unknown>;/, "const row = item;"),
    extractFunctionSource(source, "getVerificationStatusRank").replace(
      /function getVerificationStatusRank\(value: unknown\) \{/,
      "function getVerificationStatusRank(value) {",
    ),
  ].join("\n\n");

  return new Function(
    `${transformed}\nreturn { buildProvisionalActiveIngredients, parseProvisionalIngredient, sanitizeDsldActiveIngredients, getVerificationStatusRank };`,
  )();
}

function loadResolveOrCreateProduct({
  fetchOffProductByBarcode = async () => null,
  adminSupabase,
  normalizeBarcodeValue = (value) => value,
  cryptoImpl = { randomUUID: () => "generated-product-id" },
} = {}) {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/persist-go-upc-product/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const resolveStart = source.indexOf("async function resolveOrCreateProduct");
  if (resolveStart === -1) {
    throw new Error("Could not find resolveOrCreateProduct in source");
  }

  const signatureSlice = source.slice(resolveStart);
  const bodySignatureMatch = signatureSlice.match(/\)\s*\{/);
  if (!bodySignatureMatch) {
    throw new Error("Could not find resolveOrCreateProduct body start");
  }

  const bodyStart =
    resolveStart + bodySignatureMatch.index + bodySignatureMatch[0].length - 1;
  let depth = 0;
  let resolveEnd = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        resolveEnd = index + 1;
        break;
      }
    }
  }

  if (resolveEnd === -1) {
    throw new Error("Could not find resolveOrCreateProduct body end");
  }

  const resolveSource = source.slice(resolveStart, resolveEnd);

  const transformed = [
    extractFunctionSource(source, "trimString").replace(
      /function trimString\(value: unknown\): string \{/,
      "function trimString(value) {",
    ),
    resolveSource.replace(
      /async function resolveOrCreateProduct\([\s\S]*?\)\s*\{/,
      "async function resolveOrCreateProduct({ barcode, barcodeType, productName, ingredientsText }) {",
    ).replace(/adminSupabase!/g, "adminSupabase"),
  ].join("\n\n");

  return new Function(
    "fetchOffProductByBarcode",
    "adminSupabase",
    "TABLES",
    "normalizeBarcodeValue",
    "crypto",
    `${transformed}\nreturn resolveOrCreateProduct;`,
  )(
    fetchOffProductByBarcode,
    adminSupabase,
    { products: "off_products" },
    normalizeBarcodeValue,
    cryptoImpl,
  );
}

const {
  buildProvisionalActiveIngredients,
  getVerificationStatusRank,
  parseProvisionalIngredient,
  sanitizeDsldActiveIngredients,
} = loadPersistGoUpcHelpers();

test("provisional ingredient extraction strips marketing text, invisible unicode, and keeps clean names", () => {
  const ingredients = buildProvisionalActiveIngredients(
    null,
    "The supplement includes key ingredients such as \u200cvitamins D, B6, B12, \u200d Calcium, Zinc, \u200d And Selenium. These components are carefully selected to support everyday wellness.",
  );

  assert.deepEqual(
    ingredients.map((item) => item.name),
    ["Vitamin D", "Vitamin B6", "Vitamin B12", "Calcium", "Zinc", "Selenium"],
  );
});

test("provisional ingredient extraction keeps dosages when available", () => {
  const ingredients = buildProvisionalActiveIngredients(
    null,
    "The supplement includes key ingredients such as Vitamin D 25 mcg, B6 1.4 mg, B12 2.5 mcg, Calcium 120 mg, Zinc 10 mg, and Selenium 55 mcg. These components are carefully selected for daily support.",
  );

  assert.deepEqual(ingredients, [
    {
      name: "Vitamin D",
      dosageValue: 25,
      dosageUnit: "mcg",
      dosageDisplay: "25 mcg",
    },
    {
      name: "Vitamin B6",
      dosageValue: 1.4,
      dosageUnit: "mg",
      dosageDisplay: "1.4 mg",
    },
    {
      name: "Vitamin B12",
      dosageValue: 2.5,
      dosageUnit: "mcg",
      dosageDisplay: "2.5 mcg",
    },
    {
      name: "Calcium",
      dosageValue: 120,
      dosageUnit: "mg",
      dosageDisplay: "120 mg",
    },
    {
      name: "Zinc",
      dosageValue: 10,
      dosageUnit: "mg",
      dosageDisplay: "10 mg",
    },
    {
      name: "Selenium",
      dosageValue: 55,
      dosageUnit: "mcg",
      dosageDisplay: "55 mcg",
    },
  ]);
});

test("single provisional ingredient parsing removes filler words at the start", () => {
  const parsed = parseProvisionalIngredient("and Selenium 55 mcg", false);

  assert.deepEqual(parsed, {
    ingredient: {
      name: "Selenium",
      dosageValue: 55,
      dosageUnit: "mcg",
      dosageDisplay: "55 mcg",
    },
    carriesVitaminContext: false,
  });
});

test("DSLD ingredient sanitizer keeps canonical fields and deduplicates rows", () => {
  const ingredients = sanitizeDsldActiveIngredients([
    {
      name: " Melatonin ",
      dosageValue: 5,
      dosageUnit: "mg",
      dosageDisplay: "5mg",
      ingredientType: "active_with_disclosed_dose",
      parentBlend: "",
      ignored: "not persisted",
    },
    {
      name: "Melatonin",
      dosageValue: 5,
      dosageUnit: "mg",
      dosageDisplay: "5mg",
      ingredientType: "active_with_disclosed_dose",
    },
    {
      name: " Proprietary blend ",
      dosageValue: null,
      dosageUnit: "",
      dosageDisplay: "",
      ingredientType: "proprietary_blend",
      parentBlend: "Sleep blend",
    },
  ]);

  assert.deepEqual(ingredients, [
    {
      name: "Melatonin",
      dosageValue: 5,
      dosageUnit: "mg",
      dosageDisplay: "5mg",
      ingredientType: "active_with_disclosed_dose",
      parentBlend: null,
    },
    {
      name: "Proprietary blend",
      dosageValue: null,
      dosageUnit: null,
      dosageDisplay: null,
      ingredientType: "proprietary_blend",
      parentBlend: "Sleep blend",
    },
  ]);
});

test("verification status ranking lets DSLD replace only lower-quality rows", () => {
  assert.ok(
    getVerificationStatusRank("dsld_verified") >
      getVerificationStatusRank("go_upc_unverified"),
  );
  assert.ok(
    getVerificationStatusRank("verified") >
      getVerificationStatusRank("dsld_verified"),
  );
  assert.ok(
    getVerificationStatusRank("photo_verified") >
      getVerificationStatusRank("dsld_verified"),
  );
});

test("resolveOrCreateProduct updates blank existing rows instead of duplicating them", async () => {
  const updates = [];
  const adminSupabase = {
    from(table) {
      assert.equal(table, "off_products");
      return {
        update(payload) {
          return {
            async eq(column, value) {
              updates.push({ payload, column, value });
              return { error: null };
            },
          };
        },
        async insert() {
          throw new Error("insert should not be called for an existing product");
        },
      };
    },
  };

  const resolveOrCreateProduct = loadResolveOrCreateProduct({
    adminSupabase,
    fetchOffProductByBarcode: async () => ({
      id: "prod_existing",
      barcode: "5045094051748",
      name: "Boots Marine Collagen",
      ingredients: "",
    }),
  });

  const result = await resolveOrCreateProduct({
    barcode: "5045094051748",
    barcodeType: "ean13",
    productName: "Boots Marine Collagen",
    ingredientsText: "Marine collagen 5000 mg, Vitamin C 80 mg",
  });

  assert.deepEqual(updates, [
    {
      payload: {
        ingredients: "Marine collagen 5000 mg, Vitamin C 80 mg",
      },
      column: "id",
      value: "prod_existing",
    },
  ]);
  assert.equal(result.productId, "prod_existing");
  assert.equal(result.createdProduct, false);
  assert.deepEqual(result.product, {
    id: "prod_existing",
    barcode: "5045094051748",
    name: "Boots Marine Collagen",
    ingredients: "Marine collagen 5000 mg, Vitamin C 80 mg",
  });
});
