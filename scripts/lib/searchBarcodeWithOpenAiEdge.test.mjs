import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const BROAD_FALLBACK_NOISE_WORDS = new Set([
  "capsule",
  "capsules",
  "tablet",
  "tablets",
  "sachet",
  "sachets",
  "softgel",
  "softgels",
  "gummy",
  "gummies",
  "pack",
  "packs",
  "expiry",
  "flavour",
  "flavor",
  "vegan",
  "vegetarian",
]);

const FLAVOR_WORDS = new Set([
  "peach",
  "berry",
  "orange",
  "lemon",
  "lime",
  "cherry",
  "apple",
  "mango",
  "vanilla",
  "chocolate",
  "mint",
  "raspberry",
  "strawberry",
  "banana",
  "grape",
  "watermelon",
  "natural",
  "unflavoured",
  "unflavored",
]);

const LIKELY_ACTIVE_INGREDIENT_WORDS = new Set([
  "collagen",
  "magnesium",
  "turmeric",
  "berberine",
  "vitamin",
  "zinc",
  "iron",
  "omega",
  "creatine",
  "ashwagandha",
  "probiotic",
  "electrolyte",
  "protein",
  "b12",
  "d3",
  "multivitamin",
]);

const INACTIVE_SUPPLEMENT_INGREDIENT_NAMES = new Set([
  "acidity regulator",
  "acidity regulators",
  "citric acid",
  "colour",
  "colours",
  "color",
  "colors",
  "flavour",
  "flavours",
  "flavouring",
  "flavourings",
  "flavor",
  "flavors",
  "flavoring",
  "flavorings",
  "glucose syrup",
  "glycerin",
  "glycerine",
  "glycerol",
  "juice",
  "preservative",
  "preservatives",
  "purified water",
  "salt",
  "stabiliser",
  "stabilisers",
  "stabilizer",
  "stabilizers",
  "sucralose",
  "sugar",
  "sweetener",
  "sweeteners",
  "thickener",
  "thickeners",
  "water",
]);

function extractFunctionByHeader(source, headerPattern, functionName) {
  const match = source.match(headerPattern);
  if (!match || typeof match.index !== "number") {
    throw new Error(`Could not find ${functionName} in source`);
  }

  const start = match.index;
  const bodyStart = start + match[0].lastIndexOf("{");
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

function transformFunction(source, headerPattern, functionName, replacements = []) {
  let transformed = extractFunctionByHeader(source, headerPattern, functionName);
  for (const [pattern, replacement] of replacements) {
    transformed = transformed.replace(pattern, replacement);
  }
  return transformed;
}

function loadSearchBarcodeHelpers({
  requestOpenAiSearch = async () => {
    throw new Error("requestOpenAiSearch stub is required");
  },
  consoleImpl = { log() {} },
} = {}) {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/search-barcode-with-openai/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const transformed = [
    transformFunction(
      source,
      /function trimString\(value: unknown\): string \{/,
      "trimString",
      [[/function trimString\(value: unknown\): string \{/, "function trimString(value) {"]],
    ),
    transformFunction(
      source,
      /function normalizeWhitespace\(value: unknown\): string \{/,
      "normalizeWhitespace",
      [[/function normalizeWhitespace\(value: unknown\): string \{/, "function normalizeWhitespace(value) {"]],
    ),
    transformFunction(
      source,
      /function normalizeSearchTokenCase\(value: string\) \{/,
      "normalizeSearchTokenCase",
      [[/function normalizeSearchTokenCase\(value: string\) \{/, "function normalizeSearchTokenCase(value) {"]],
    ),
    transformFunction(
      source,
      /function cleanProductNameForSearch\(value: unknown\) \{/,
      "cleanProductNameForSearch",
      [[/function cleanProductNameForSearch\(value: unknown\) \{/, "function cleanProductNameForSearch(value) {"]],
    ),
    transformFunction(
      source,
      /function removePackSizeText\(value: string\) \{/,
      "removePackSizeText",
      [[/function removePackSizeText\(value: string\) \{/, "function removePackSizeText(value) {"]],
    ),
    transformFunction(
      source,
      /function removeFlavorWordsForBroadFallback\(value: string\) \{/,
      "removeFlavorWordsForBroadFallback",
      [[/function removeFlavorWordsForBroadFallback\(value: string\) \{/, "function removeFlavorWordsForBroadFallback(value) {"]],
    ),
    transformFunction(
      source,
      /function removeBroadFallbackNoise\(value: string\) \{/,
      "removeBroadFallbackNoise",
      [[/function removeBroadFallbackNoise\(value: string\) \{/, "function removeBroadFallbackNoise(value) {"]],
    ),
    transformFunction(
      source,
      /function sanitizeQueryToken\(value: string\) \{/,
      "sanitizeQueryToken",
      [[/function sanitizeQueryToken\(value: string\) \{/, "function sanitizeQueryToken(value) {"]],
    ),
    transformFunction(
      source,
      /function buildMeaningfulProductTokens\(value: string\) \{/,
      "buildMeaningfulProductTokens",
      [
        [/function buildMeaningfulProductTokens\(value: string\) \{/, "function buildMeaningfulProductTokens(value) {"],
        [/const result: string\[\] = \[\];/, "const result = [];"],
      ],
    ),
    transformFunction(
      source,
      /function capQueryTokens\(tokens: string\[\], maxTokens: number, maxChars: number\) \{/,
      "capQueryTokens",
      [
        [/function capQueryTokens\(tokens: string\[\], maxTokens: number, maxChars: number\) \{/, "function capQueryTokens(tokens, maxTokens, maxChars) {"],
        [/const result: string\[\] = \[\];/, "const result = [];"],
      ],
    ),
    transformFunction(
      source,
      /function buildBroadSearchText\(cleanedProductName: string\) \{/,
      "buildBroadSearchText",
      [[/function buildBroadSearchText\(cleanedProductName: string\) \{/, "function buildBroadSearchText(cleanedProductName) {"]],
    ),
    transformFunction(
      source,
      /function buildIngredientSignalText\(cleanedProductName: string, brand: string\) \{/,
      "buildIngredientSignalText",
      [[/function buildIngredientSignalText\(cleanedProductName: string, brand: string\) \{/, "function buildIngredientSignalText(cleanedProductName, brand) {"]],
    ),
    transformFunction(
      source,
      /function buildBrandQueryPrefix\(brand: string, broadSearchText: string\) \{/,
      "buildBrandQueryPrefix",
      [[/function buildBrandQueryPrefix\(brand: string, broadSearchText: string\) \{/, "function buildBrandQueryPrefix(brand, broadSearchText) {"]],
    ),
    transformFunction(
      source,
      /function buildLikelySiteQuery\(brand: string, broadSearchText: string\) \{/,
      "buildLikelySiteQuery",
      [[/function buildLikelySiteQuery\(brand: string, broadSearchText: string\) \{/, "function buildLikelySiteQuery(brand, broadSearchText) {"]],
    ),
    transformFunction(
      source,
      /function buildBroadProductNameQueries\([\s\S]*?\)\s*\{/,
      "buildBroadProductNameQueries",
      [[/function buildBroadProductNameQueries\([\s\S]*?\)\s*\{/, "function buildBroadProductNameQueries(cleanedProductName, brand) {"]],
    ),
    transformFunction(
      source,
      /function buildSearchQueries\([\s\S]*?\)\s*\{/,
      "buildSearchQueries",
      [[/function buildSearchQueries\([\s\S]*?\)\s*\{/, "function buildSearchQueries({ barcode, cleanedProductName, brand }, mode) {"]],
    ),
    transformFunction(
      source,
      /function emptyResult\(barcode: string\): BarcodeSearchResult \{/,
      "emptyResult",
      [
        [/function emptyResult\(barcode: string\): BarcodeSearchResult \{/, "function emptyResult(barcode) {"],
        [/verification_status: VERIFICATION_STATUS,/, 'verification_status: "openai_unverified",'],
      ],
    ),
    transformFunction(
      source,
      /function sanitizeNullableString\(value: unknown, maxLength: number\) \{/,
      "sanitizeNullableString",
      [[/function sanitizeNullableString\(value: unknown, maxLength: number\) \{/, "function sanitizeNullableString(value, maxLength) {"]],
    ),
    transformFunction(
      source,
      /function sanitizeUrl\(value: unknown\) \{/,
      "sanitizeUrl",
      [[/function sanitizeUrl\(value: unknown\) \{/, "function sanitizeUrl(value) {"]],
    ),
    transformFunction(
      source,
      /function sanitizeIngredients\(value: unknown\): Ingredient\[\] \{/,
      "sanitizeIngredients",
      [
        [/function sanitizeIngredients\(value: unknown\): Ingredient\[\] \{/, "function sanitizeIngredients(value) {"],
        [/const seen = new Set<string>\(\);/, "const seen = new Set();"],
        [/const ingredients: Ingredient\[\] = \[\];/, "const ingredients = [];"],
        [/const row = item as Record<string, unknown>;/g, "const row = item;"],
        [/const ingredient: Ingredient = \{/, "const ingredient = {"],
      ],
    ),
    transformFunction(
      source,
      /function normalizeConfidence\(value: unknown\): Confidence \{/,
      "normalizeConfidence",
      [[/function normalizeConfidence\(value: unknown\): Confidence \{/, "function normalizeConfidence(value) {"]],
    ),
    transformFunction(
      source,
      /function normalizeActiveIngredientFilterText\(value: unknown\) \{/,
      "normalizeActiveIngredientFilterText",
      [[/function normalizeActiveIngredientFilterText\(value: unknown\) \{/, "function normalizeActiveIngredientFilterText(value) {"]],
    ),
    transformFunction(
      source,
      /function isInactiveSupplementIngredient\(ingredient: Ingredient\) \{/,
      "isInactiveSupplementIngredient",
      [[/function isInactiveSupplementIngredient\(ingredient: Ingredient\) \{/, "function isInactiveSupplementIngredient(ingredient) {"]],
    ),
    transformFunction(
      source,
      /function filterActiveSupplementIngredients\(ingredients: Ingredient\[\]\) \{/,
      "filterActiveSupplementIngredients",
      [[/function filterActiveSupplementIngredients\(ingredients: Ingredient\[\]\) \{/, "function filterActiveSupplementIngredients(ingredients) {"]],
    ),
    transformFunction(
      source,
      /function hasVisibleDosage\(ingredients: Ingredient\[\]\) \{/,
      "hasVisibleDosage",
      [[/function hasVisibleDosage\(ingredients: Ingredient\[\]\) \{/, "function hasVisibleDosage(ingredients) {"]],
    ),
    transformFunction(
      source,
      /function resolveConfidence\(result: BarcodeSearchResult\): Confidence \{/,
      "resolveConfidence",
      [[/function resolveConfidence\(result: BarcodeSearchResult\): Confidence \{/, "function resolveConfidence(result) {"]],
    ),
    transformFunction(
      source,
      /function hasStructuredIngredientEvidence\(result: BarcodeSearchResult\) \{/,
      "hasStructuredIngredientEvidence",
      [[/function hasStructuredIngredientEvidence\(result: BarcodeSearchResult\) \{/, "function hasStructuredIngredientEvidence(result) {"]],
    ),
    transformFunction(
      source,
      /function isEmptySearchResult\(result: BarcodeSearchResult\) \{/,
      "isEmptySearchResult",
      [[/function isEmptySearchResult\(result: BarcodeSearchResult\) \{/, "function isEmptySearchResult(result) {"]],
    ),
    transformFunction(
      source,
      /function parseAmountValue\(value: string \| null\) \{/,
      "parseAmountValue",
      [[/function parseAmountValue\(value: string \| null\) \{/, "function parseAmountValue(value) {"]],
    ),
    transformFunction(
      source,
      /function buildDosageDisplay\(ingredient: Ingredient\) \{/,
      "buildDosageDisplay",
      [[/function buildDosageDisplay\(ingredient: Ingredient\) \{/, "function buildDosageDisplay(ingredient) {"]],
    ),
    transformFunction(
      source,
      /function buildMasterActiveIngredients\(result: BarcodeSearchResult\) \{/,
      "buildMasterActiveIngredients",
      [[/function buildMasterActiveIngredients\(result: BarcodeSearchResult\) \{/, "function buildMasterActiveIngredients(result) {"]],
    ),
    transformFunction(
      source,
      /function sanitizeSearchResult\([\s\S]*?\): SanitizedSearchResult \{/,
      "sanitizeSearchResult",
      [
        [/function sanitizeSearchResult\([\s\S]*?\): SanitizedSearchResult \{/, "function sanitizeSearchResult(value, barcode, responseSources, mode) {"],
        [/const record = value as Record<string, unknown>;/, "const record = value;"],
        [/const result: BarcodeSearchResult = \{/, "const result = {"],
      ],
    ),
    transformFunction(
      source,
      /function shouldUseProductNameFallback\([\s\S]*?\)\s*\{/,
      "shouldUseProductNameFallback",
      [[/function shouldUseProductNameFallback\(\s*result: BarcodeSearchResult,\s*cleanedProductName: string,\s*\) \{/, "function shouldUseProductNameFallback(result, cleanedProductName) {"]],
    ),
    transformFunction(
      source,
      /async function requestBarcodeSearch\([\s\S]*?\)\s*\{/,
      "requestBarcodeSearch",
      [[/async function requestBarcodeSearch\([\s\S]*?\)\s*\{/, "async function requestBarcodeSearch(searchContext, telemetry) {"]],
    ),
  ].join("\n\n");

  return new Function(
    "requestOpenAiSearch",
    "console",
    "VERIFICATION_STATUS",
    "BROAD_FALLBACK_NOISE_WORDS",
    "FLAVOR_WORDS",
    "LIKELY_ACTIVE_INGREDIENT_WORDS",
    "INACTIVE_SUPPLEMENT_INGREDIENT_NAMES",
    "PROVIDER",
    `${transformed}\nreturn { cleanProductNameForSearch, buildSearchQueries, emptyResult, requestBarcodeSearch, sanitizeSearchResult, buildMasterActiveIngredients };`,
  )(
    requestOpenAiSearch,
    consoleImpl,
    "openai_unverified",
    BROAD_FALLBACK_NOISE_WORDS,
    FLAVOR_WORDS,
    LIKELY_ACTIVE_INGREDIENT_WORDS,
    INACTIVE_SUPPLEMENT_INGREDIENT_NAMES,
    "openai_web_search",
  );
}

test("exact product-name search fails but broad fallback succeeds", async () => {
  const calls = [];
  const { cleanProductNameForSearch, buildSearchQueries, requestBarcodeSearch } =
    loadSearchBarcodeHelpers({
      requestOpenAiSearch: async (searchContext, mode) => {
        calls.push({
          mode,
          queries: buildSearchQueries(searchContext, mode),
        });

        if (mode === "barcode") {
          return {
            result: {
              barcode: searchContext.barcode,
              product_name: null,
              brand: null,
              serving_size: null,
              ingredients_text: null,
              ingredients: [],
              source_urls: [],
              confidence: "low",
              verification_status: "openai_unverified",
              persisted: false,
            },
            emptyReason: "no_product_identity_or_ingredients",
            mode,
          };
        }

        if (mode === "product_name_exact") {
          return {
            result: {
              barcode: searchContext.barcode,
              product_name: null,
              brand: null,
              serving_size: null,
              ingredients_text: null,
              ingredients: [],
              source_urls: [],
              confidence: "low",
              verification_status: "openai_unverified",
              persisted: false,
            },
            emptyReason: "no_source_urls",
            mode,
          };
        }

        return {
          result: {
            barcode: searchContext.barcode,
            product_name:
              "Boots Marine Collagen Skin Formula Liquid Drink 14 Sachets Peach",
            brand: "Boots",
            serving_size: "1 sachet",
            ingredients_text: "Marine Collagen 5000 mg",
            ingredients: [
              {
                name: "Marine Collagen",
                amount: "5000",
                unit: "mg",
                per: "serving",
                raw_text: "Marine Collagen 5000 mg",
              },
            ],
            source_urls: ["https://www.boots.com/example-product"],
            confidence: "medium",
            verification_status: "openai_unverified",
            persisted: false,
          },
          emptyReason: null,
          mode,
        };
      },
    });

  const cleanedProductName = cleanProductNameForSearch(
    "Boots Marine Collagen - Skin Formula Liquid Drink - 14 Sachets - PEACH - EXPIRY 9/26",
  );
  const outcome = await requestBarcodeSearch({
    barcode: "5045094051748",
    rawProductName:
      "Boots Marine Collagen - Skin Formula Liquid Drink - 14 Sachets - PEACH - EXPIRY 9/26",
    cleanedProductName,
    brand: "Boots",
  });

  assert.deepEqual(
    calls.map((call) => call.mode),
    ["barcode", "product_name_exact", "product_name_broad"],
  );
  assert.ok(
    calls[1].queries.includes(
      "\"Boots Marine Collagen Skin Formula Liquid Drink 14 Sachets Peach\" ingredients",
    ),
  );
  assert.ok(
    calls[2].queries.includes(
      "Boots Marine Collagen Skin Formula Liquid Drink ingredients",
    ),
  );
  assert.ok(
    calls[2].queries.includes(
      "Boots Marine Collagen Skin Formula Liquid Drink active ingredients",
    ),
  );
  assert.ok(
    calls[2].queries.includes(
      "site:boots.com Boots Marine Collagen Skin Formula Liquid Drink",
    ),
  );
  assert.equal(outcome.mode, "product_name_broad");
  assert.equal(outcome.result?.brand, "Boots");
  assert.equal(outcome.result?.verification_status, "openai_unverified");
});

test("noisy product names are cleaned and broadened generically", () => {
  const { cleanProductNameForSearch, buildSearchQueries } = loadSearchBarcodeHelpers();
  const cleanedProductName = cleanProductNameForSearch(
    "Generic Magnesium Capsules 120 Pack Orange High Strength EXPIRY 08/27",
  );

  const broadQueries = buildSearchQueries(
    {
      barcode: "1234567890123",
      rawProductName:
        "Generic Magnesium Capsules 120 Pack Orange High Strength EXPIRY 08/27",
      cleanedProductName,
      brand: "Generic",
    },
    "product_name_broad",
  );

  assert.equal(
    cleanedProductName,
    "Generic Magnesium Capsules 120 Pack Orange High Strength",
  );
  assert.ok(broadQueries.includes("Generic Magnesium ingredients"));
  assert.ok(broadQueries.includes("Generic Magnesium active ingredients"));
  assert.ok(broadQueries.includes("Generic Magnesium nutrition"));
});

test("product-name match without barcode confirmation stays openai_unverified", () => {
  const { sanitizeSearchResult } = loadSearchBarcodeHelpers();

  const sanitized = sanitizeSearchResult(
    {
      product_name: "Generic Magnesium",
      brand: "Generic",
      serving_size: "2 capsules",
      ingredients_text: "Magnesium 200 mg",
      ingredients: [
        {
          name: "Magnesium",
          amount: "200",
          unit: "mg",
          per: "serving",
          raw_text: "Magnesium 200 mg",
        },
      ],
      source_urls: [],
      confidence: "high",
      verification_status: "openai_unverified",
    },
    "1234567890123",
    [],
    "product_name_broad",
  );

  assert.equal(sanitized.reason, null);
  assert.equal(sanitized.result.verification_status, "openai_unverified");
  assert.equal(sanitized.result.confidence, "medium");
  assert.equal(sanitized.result.ingredients.length, 1);
});

test("raw OpenAI sources are preserved when JSON omits source_urls", () => {
  const { sanitizeSearchResult } = loadSearchBarcodeHelpers();

  const sanitized = sanitizeSearchResult(
    {
      product_name: "Boots Marine Collagen Liquid Drink",
      brand: "Boots",
      serving_size: "1 sachet",
      ingredients_text: "Marine Collagen 5000 mg",
      ingredients: [
        {
          name: "Marine Collagen",
          amount: "5000",
          unit: "mg",
          per: "serving",
          raw_text: "Marine Collagen 5000 mg",
        },
      ],
      source_urls: [],
      confidence: "medium",
      verification_status: "openai_unverified",
    },
    "5045094051748",
    ["https://www.boots.com/boots-marine-collagen-liquid-drink-14-sachets-10353992"],
    "product_name_broad",
  );

  assert.equal(sanitized.reason, null);
  assert.deepEqual(sanitized.result.source_urls, [
    "https://www.boots.com/boots-marine-collagen-liquid-drink-14-sachets-10353992",
  ]);
  assert.equal(sanitized.result.ingredients.length, 1);
});

test("water is removed from active_ingredients_json", () => {
  const { sanitizeSearchResult, buildMasterActiveIngredients } =
    loadSearchBarcodeHelpers();

  const sanitized = sanitizeSearchResult(
    {
      product_name: "Boots Marine Collagen Liquid Drink",
      brand: "Boots",
      serving_size: "1 sachet",
      ingredients_text: "Water, Marine Collagen 5000 mg",
      ingredients: [
        {
          name: "Water",
          amount: null,
          unit: null,
          per: "serving",
          raw_text: "Water",
        },
        {
          name: "Marine Collagen",
          amount: "5000",
          unit: "mg",
          per: "serving",
          raw_text: "Marine Collagen 5000 mg",
        },
      ],
      source_urls: ["https://www.boots.com/example-product"],
      confidence: "medium",
      verification_status: "openai_unverified",
    },
    "5045094051748",
    [],
    "product_name_broad",
  );
  const activeIngredients = buildMasterActiveIngredients(sanitized.result);

  assert.deepEqual(
    sanitized.result.ingredients.map((ingredient) => ingredient.name),
    ["Marine Collagen"],
  );
  assert.deepEqual(
    activeIngredients.map((ingredient) => ingredient.name),
    ["Marine Collagen"],
  );
});

test("purified water flavouring and sweetener are removed from active ingredients", () => {
  const { sanitizeSearchResult, buildMasterActiveIngredients } =
    loadSearchBarcodeHelpers();

  const sanitized = sanitizeSearchResult(
    {
      product_name: "Example Collagen Drink",
      brand: "Example",
      serving_size: "1 sachet",
      ingredients_text:
        "Purified water, flavouring, sweetener, Vitamin C 80 mg, Zinc 10 mg",
      ingredients: [
        {
          name: "Purified Water",
          amount: null,
          unit: null,
          per: "serving",
          raw_text: "Purified Water",
        },
        {
          name: "Flavouring",
          amount: null,
          unit: null,
          per: "serving",
          raw_text: "Flavouring",
        },
        {
          name: "Sweetener",
          amount: null,
          unit: null,
          per: "serving",
          raw_text: "Sweetener",
        },
        {
          name: "Vitamin C",
          amount: "80",
          unit: "mg",
          per: "serving",
          raw_text: "Vitamin C 80 mg",
        },
        {
          name: "Zinc",
          amount: "10",
          unit: "mg",
          per: "serving",
          raw_text: "Zinc 10 mg",
        },
      ],
      source_urls: ["https://example.com/product"],
      confidence: "medium",
      verification_status: "openai_unverified",
    },
    "1234567890123",
    [],
    "product_name_broad",
  );
  const activeIngredients = buildMasterActiveIngredients(sanitized.result);

  assert.deepEqual(
    sanitized.result.ingredients.map((ingredient) => ingredient.name),
    ["Vitamin C", "Zinc"],
  );
  assert.deepEqual(
    activeIngredients.map((ingredient) => ingredient.name),
    ["Vitamin C", "Zinc"],
  );
});

test("watermelon extract is allowed when explicitly extracted", () => {
  const { sanitizeSearchResult, buildMasterActiveIngredients } =
    loadSearchBarcodeHelpers();

  const sanitized = sanitizeSearchResult(
    {
      product_name: "Example Watermelon Extract",
      brand: "Example",
      serving_size: "1 capsule",
      ingredients_text: "Watermelon Extract 500 mg",
      ingredients: [
        {
          name: "Watermelon Extract",
          amount: "500",
          unit: "mg",
          per: "serving",
          raw_text: "Watermelon Extract 500 mg",
        },
      ],
      source_urls: ["https://example.com/watermelon-extract"],
      confidence: "medium",
      verification_status: "openai_unverified",
    },
    "1234567890123",
    [],
    "product_name_broad",
  );
  const activeIngredients = buildMasterActiveIngredients(sanitized.result);

  assert.equal(sanitized.reason, null);
  assert.deepEqual(
    activeIngredients.map((ingredient) => ingredient.name),
    ["Watermelon Extract"],
  );
});

test("product-name fallback with credible source and ingredients succeeds without barcode", async () => {
  const { cleanProductNameForSearch, requestBarcodeSearch } =
    loadSearchBarcodeHelpers({
      requestOpenAiSearch: async (searchContext, mode) => {
        if (mode === "barcode") {
          return {
            result: {
              barcode: searchContext.barcode,
              product_name: null,
              brand: null,
              serving_size: null,
              ingredients_text: null,
              ingredients: [],
              source_urls: [],
              confidence: "low",
              verification_status: "openai_unverified",
              persisted: false,
            },
            emptyReason: "no_product_identity_or_ingredients",
            mode,
          };
        }

        return {
          result: {
            barcode: searchContext.barcode,
            product_name: "Boots Marine Collagen Liquid Drink",
            brand: "Boots",
            serving_size: "1 sachet",
            ingredients_text: "Marine Collagen 5000 mg",
            ingredients: [
              {
                name: "Marine Collagen",
                amount: "5000",
                unit: "mg",
                per: "serving",
                raw_text: "Marine Collagen 5000 mg",
              },
            ],
            source_urls: ["https://www.boots.com/boots-marine-collagen-liquid-drink-14-sachets-10353992"],
            confidence: "medium",
            verification_status: "openai_unverified",
            persisted: false,
          },
          emptyReason: null,
          mode,
        };
      },
    });

  const outcome = await requestBarcodeSearch({
    barcode: "5045094051748",
    rawProductName:
      "Boots Marine Collagen - Skin Formula Liquid Drink - 14 Sachets - PEACH - EXPIRY 9/26",
    cleanedProductName: cleanProductNameForSearch(
      "Boots Marine Collagen - Skin Formula Liquid Drink - 14 Sachets - PEACH - EXPIRY 9/26",
    ),
    brand: "Boots",
  });

  assert.equal(outcome.mode, "product_name_exact");
  assert.equal(outcome.emptyReason, null);
  assert.equal(outcome.result?.verification_status, "openai_unverified");
  assert.equal(outcome.result?.confidence, "medium");
  assert.equal(outcome.result?.ingredients.length, 1);
});

test("source URLs without ingredients return sources_found_no_ingredients", async () => {
  const { cleanProductNameForSearch, sanitizeSearchResult, requestBarcodeSearch } =
    loadSearchBarcodeHelpers({
      requestOpenAiSearch: async (searchContext, mode) => {
        if (mode === "barcode") {
          return {
            result: {
              barcode: searchContext.barcode,
              product_name: null,
              brand: null,
              serving_size: null,
              ingredients_text: null,
              ingredients: [],
              source_urls: [],
              confidence: "low",
              verification_status: "openai_unverified",
              persisted: false,
            },
            emptyReason: "no_product_identity_or_ingredients",
            mode,
          };
        }

        return {
          result: {
            barcode: searchContext.barcode,
            product_name: null,
            brand: null,
            serving_size: null,
            ingredients_text: null,
            ingredients: [],
            source_urls: ["https://www.example.com/product"],
            confidence: "low",
            verification_status: "openai_unverified",
            persisted: false,
          },
          emptyReason: "sources_found_no_ingredients",
          mode,
        };
      },
    });

  const sanitized = sanitizeSearchResult(
    {
      product_name: null,
      brand: null,
      serving_size: null,
      ingredients_text: null,
      ingredients: [],
      source_urls: [],
      confidence: "low",
      verification_status: "openai_unverified",
    },
    "5045094051748",
    ["https://www.example.com/product"],
    "product_name_broad",
  );

  assert.equal(sanitized.reason, "sources_found_no_ingredients");
  assert.deepEqual(sanitized.result.source_urls, ["https://www.example.com/product"]);
  assert.equal(sanitized.result.ingredients.length, 0);

  const outcome = await requestBarcodeSearch({
    barcode: "5045094051748",
    rawProductName: "Example Collagen Drink 14 Sachets Peach",
    cleanedProductName: cleanProductNameForSearch(
      "Example Collagen Drink 14 Sachets Peach",
    ),
    brand: "Example",
  });

  assert.equal(outcome.emptyReason, "sources_found_no_ingredients");
  assert.deepEqual(outcome.result?.source_urls, ["https://www.example.com/product"]);
});

test("barcode-confirmed result keeps high confidence", () => {
  const { sanitizeSearchResult } = loadSearchBarcodeHelpers();

  const sanitized = sanitizeSearchResult(
    {
      product_name: "Confirmed Magnesium",
      brand: "Confirmed",
      serving_size: "1 tablet",
      ingredients_text: "Magnesium 200 mg",
      ingredients: [
        {
          name: "Magnesium",
          amount: "200",
          unit: "mg",
          per: "serving",
          raw_text: "Magnesium 200 mg",
        },
      ],
      source_urls: ["https://example.com/confirmed"],
      confidence: "high",
      verification_status: "openai_unverified",
    },
    "1234567890123",
    [],
    "barcode",
  );

  assert.equal(sanitized.reason, null);
  assert.equal(sanitized.result.confidence, "high");
  assert.equal(sanitized.result.verification_status, "openai_unverified");
  assert.deepEqual(sanitized.result.source_urls, ["https://example.com/confirmed"]);
});

test("no credible ingredient evidence still returns found false", async () => {
  const { cleanProductNameForSearch, requestBarcodeSearch } =
    loadSearchBarcodeHelpers({
      requestOpenAiSearch: async (searchContext, mode) => ({
        result: {
          barcode: searchContext.barcode,
          product_name: mode === "barcode" ? null : "Generic Magnesium",
          brand: mode === "barcode" ? null : "Generic",
          serving_size: null,
          ingredients_text: null,
          ingredients: [],
          source_urls: mode === "barcode" ? [] : ["https://example.com/product"],
          confidence: "low",
          verification_status: "openai_unverified",
          persisted: false,
        },
        emptyReason: mode === "barcode"
          ? "no_product_identity_or_ingredients"
          : "no_ingredients_found",
        mode,
      }),
    });

  const outcome = await requestBarcodeSearch({
    barcode: "1234567890123",
    rawProductName: "Generic Magnesium Tablets 60 Pack Berry EXPIRY 10/27",
    cleanedProductName: cleanProductNameForSearch(
      "Generic Magnesium Tablets 60 Pack Berry EXPIRY 10/27",
    ),
    brand: "Generic",
  });

  assert.equal(outcome.result?.product_name, null);
  assert.equal(outcome.result?.brand, null);
  assert.equal(outcome.result?.ingredients.length, 0);
  assert.equal(outcome.result?.verification_status, "openai_unverified");
});
