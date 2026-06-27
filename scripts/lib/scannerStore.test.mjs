import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function createTestStore(initializer) {
  let state;

  const setState = (updater) => {
    const partial =
      typeof updater === "function" ? updater(state) : updater ?? {};
    state = {
      ...state,
      ...partial,
    };
  };

  const getState = () => state;
  state = initializer(setState, getState);

  return {
    getState,
    setState,
  };
}

function loadScannerStoreModule(overrides = {}) {
  const source = readFileSync(
    new URL("../../features/scanner/store.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace("export const useScannerStore =", "const useScannerStore =");

  const factory = new Function(
    "create",
    "canonicalizeBarcodeType",
    "isRetailBarcodeType",
    "isValidBarcode",
    "normalizeBarcode",
    "fetchOffProductsBarcodeScanProduct",
    "fetchSupplementProductsMasterScanProduct",
    "buildScanDebugMetadata",
    "maybeFetchDsldScanMatch",
    "fetchGoUpcProduct",
    "persistDsldProduct",
    "persistGoUpcProduct",
    "fetchIngredientMatchCatalog",
    "queueMissingActiveIngredients",
    "scanSupplementPhotos",
    "buildPartialProductDetailFailure",
    "createScannerFailure",
    "normalizeBarcodeScanFailure",
    "normalizePhotoRescueFailure",
    "SCANNER_FAILURE_CATEGORIES",
    "ENABLE_DSLD_LOOKUP",
    "logBuildAwareDiagnostic",
    "logDevelopmentDiagnostic",
    "extractIngredientCandidatesFromList",
    "extractBestIngredientCandidates",
    "matchIngredientsToCatalog",
    `${transformed}
return { useScannerStore };`
  );

  const defaultNormalizeBarcodeScanFailure = (error) => {
    if (error?.code === "product_not_found") {
      return {
        status: "not_found",
        error: {
          category: "barcode_not_found",
          code: "product_not_found",
          message:
            "Sorry, we couldn't find that product, please take pictures to add it to the app",
        },
      };
    }

    if (error?.code === "partial_product_detail") {
      return {
        status: "no_ingredients",
        error: error,
      };
    }

    return {
      status: "error",
      error: {
        category: error?.category ?? "network_error",
        code: error?.code ?? null,
        message: error?.message ?? "Unknown scanner error",
      },
    };
  };

  return factory(
    overrides.create ?? createTestStore,
    overrides.canonicalizeBarcodeType ?? ((value) => value),
    overrides.isRetailBarcodeType ?? (() => true),
    overrides.isValidBarcode ?? (() => true),
    overrides.normalizeBarcode ?? ((value) => value),
    overrides.fetchOffProductsBarcodeScanProduct ?? (async () => null),
    overrides.fetchSupplementProductsMasterScanProduct ??
      overrides.fetchLocalBarcodeScanProduct ??
      (async () => null),
    overrides.buildScanDebugMetadata ??
      (({
        offFound,
        offQuality,
        dsldChecked,
        dsldCacheHit,
        dsldConfidence,
        finalSourceUsed,
      }) => ({
        off_found: Boolean(offFound),
        off_quality: offQuality ?? "missing",
        dsld_checked: Boolean(dsldChecked),
        dsld_cache_hit: Boolean(dsldCacheHit),
        dsld_confidence: dsldConfidence ?? null,
        final_source_used: finalSourceUsed ?? "unknown",
      })),
    overrides.maybeFetchDsldScanMatch ??
      (async () => ({
        checked: false,
        cacheHit: false,
        confidence: null,
        dsldMatch: null,
      })),
    overrides.fetchGoUpcProduct ?? (async () => null),
    overrides.persistDsldProduct ?? (async () => null),
    overrides.persistGoUpcProduct ?? (async () => null),
    overrides.fetchIngredientMatchCatalog ?? (async () => []),
    overrides.queueMissingActiveIngredients ?? (async () => {}),
    overrides.scanSupplementPhotos ?? (async () => null),
    overrides.buildPartialProductDetailFailure ??
      (() => ({
        category: "partial_product_detail",
        code: "partial_product_detail",
        message:
          "We found the product, but there were no usable supplement ingredients to match.",
      })),
    overrides.createScannerFailure ??
      ((fields) => ({ message: fields?.message ?? "", ...fields })),
    overrides.normalizeBarcodeScanFailure ?? defaultNormalizeBarcodeScanFailure,
    overrides.normalizePhotoRescueFailure ?? ((error) => error),
    overrides.SCANNER_FAILURE_CATEGORIES ?? {
      expiredScanSession: "expired_scan_session",
      backendValidationFailure: "backend_validation_failure",
      aiExtractionFailure: "ai_extraction_failure",
    },
    overrides.ENABLE_DSLD_LOOKUP ?? true,
    overrides.logBuildAwareDiagnostic ?? (() => {}),
    overrides.logDevelopmentDiagnostic ?? (() => {}),
    overrides.extractIngredientCandidatesFromList ??
      ((ingredients) => (Array.isArray(ingredients) ? ingredients : [])),
    overrides.extractBestIngredientCandidates ??
      (() => [{ name: "Fallback Ingredient" }]),
    overrides.matchIngredientsToCatalog ??
      ((ingredients) => ({
        matchedIngredients: [],
        matches: [],
        unmatchedIngredients: Array.isArray(ingredients) ? ingredients : [],
      }))
  );
}

test("scanner barcode orchestration checks supplement master before fallbacks", async () => {
  const sequence = [];
  const { useScannerStore } = loadScannerStoreModule({
    canonicalizeBarcodeType: () => "ean13",
    normalizeBarcode: (value) => value.replace(/\D/g, ""),
    fetchLocalBarcodeScanProduct: async () => {
      sequence.push("local");
      return {
        barcode: "0123456789012",
        productId: "prod_local",
        productName: "Local Magnesium",
        ingredientsText: "Magnesium 200 mg",
        sourceIngredients: [{ name: "Magnesium", dosageValue: 200, dosageUnit: "mg" }],
        scanDataSource: "supplement_products_master",
        sourceStatus: 1,
      };
    },
    fetchOpenFoodFactsProduct: async () => {
      sequence.push("off");
      return null;
    },
    maybeFetchDsldScanMatch: async () => {
      sequence.push("dsld");
      return {
        checked: true,
        cacheHit: true,
        confidence: "high",
        dsldMatch: { source: "dsld" },
      };
    },
    shouldCheckDsld: () => false,
    extractIngredientCandidatesFromList: (ingredients) => ingredients,
    matchIngredientsToCatalog: () => ({
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: [],
    }),
  });

  const state = await useScannerStore
    .getState()
    .processBarcode("0123456789012", "ean13");

  assert.deepEqual(sequence, ["local"]);
  assert.equal(state.status, "success");
  assert.equal(state.product.productId, "prod_local");
  assert.equal(
    state.product.sourceDecision.final_source_used,
    "supplement_products_master"
  );
});

test("scanner barcode orchestration checks DSLD before Go-UPC and off_products after master misses", async () => {
  const sequence = [];
  let persistedDsldPayload = null;
  let persistedDsldBarcodeType = null;
  const { useScannerStore } = loadScannerStoreModule({
    canonicalizeBarcodeType: () => "ean13",
    normalizeBarcode: (value) => value.replace(/\D/g, ""),
    fetchLocalBarcodeScanProduct: async () => {
      sequence.push("local");
      return null;
    },
    maybeFetchDsldScanMatch: async () => {
      sequence.push("dsld");
      return {
        checked: true,
        cacheHit: false,
        confidence: "high",
        dsldMatch: {
          source: "dsld",
          product_name: "Natrol Melatonin 5 mg",
          brand_name: "Natrol",
          serving_size: "1 tablet",
          active_ingredients_with_disclosed_dose: [
            {
              ingredient_name: "Melatonin",
              amount_per_serving: "5",
              amount_unit: "mg",
            },
          ],
        },
      };
    },
    fetchGoUpcProduct: async () => {
      sequence.push("go_upc");
      return {
        productName: "Go-UPC Melatonin Display",
        brand: "Go-UPC Brand",
        imageUrl: "https://cdn.example.com/go-upc-melatonin.png",
        imageSourceUrl: "https://cdn.example.com/go-upc-melatonin.png",
        ingredientsText: "Go-UPC ingredients should not be used",
        sourceIngredients: [{ name: "Wrong ingredient" }],
        scanDataSource: "go_upc",
      };
    },
    persistDsldProduct: async (product, barcodeType) => {
      sequence.push("persist_dsld");
      persistedDsldPayload = product;
      persistedDsldBarcodeType = barcodeType;
      return {
        productId: "prod_dsld",
        verificationStatus: "dsld_verified",
      };
    },
    extractIngredientCandidatesFromList: (ingredients) => ingredients,
    matchIngredientsToCatalog: () => ({
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: [],
    }),
  });

  const state = await useScannerStore
    .getState()
    .processBarcode("0474690758590", "ean13");

  assert.deepEqual(sequence, ["local", "dsld", "go_upc", "persist_dsld"]);
  assert.equal(state.status, "success");
  assert.equal(state.product.scanDataSource, "dsld");
  assert.equal(state.product.productId, "prod_dsld");
  assert.equal(state.product.verificationStatus, "dsld_verified");
  assert.equal(state.product.productName, "Natrol Melatonin 5 mg");
  assert.deepEqual(state.product.dsldMatch, {
    source: "dsld",
    product_name: "Natrol Melatonin 5 mg",
    brand_name: "Natrol",
    serving_size: "1 tablet",
    active_ingredients_with_disclosed_dose: [
      {
        ingredient_name: "Melatonin",
        amount_per_serving: "5",
        amount_unit: "mg",
      },
    ],
  });
  assert.equal(state.product.brand, "Natrol");
  assert.equal(state.product.servingSizeText, "1 tablet");
  assert.equal(
    state.product.imageUrl,
    "https://cdn.example.com/go-upc-melatonin.png"
  );
  assert.equal(state.product.imageDataSource, "go_upc");
  assert.equal(state.product.imageProvider, "go_upc");
  assert.equal(state.product.displayName, "Go-UPC Melatonin Display");
  assert.equal(persistedDsldBarcodeType, "ean13");
  assert.deepEqual(persistedDsldPayload.sourceIngredients, [
    {
      ingredient_name: "Melatonin",
      amount_per_serving: "5",
      amount_unit: "mg",
      name: "Melatonin",
      amount: 5,
      unit: "mg",
      dosageValue: 5,
      dosageUnit: "mg",
      dosageDisplay: "5mg",
      ingredientType: "active_with_disclosed_dose",
      ingredient_type: "active_with_disclosed_dose",
      parentBlend: null,
      parent_blend: null,
    },
  ]);
  assert.deepEqual(state.product.sourceIngredients, [
    {
      ingredient_name: "Melatonin",
      amount_per_serving: "5",
      amount_unit: "mg",
      name: "Melatonin",
      amount: 5,
      unit: "mg",
      dosageValue: 5,
      dosageUnit: "mg",
      dosageDisplay: "5mg",
      ingredientType: "active_with_disclosed_dose",
      ingredient_type: "active_with_disclosed_dose",
      parentBlend: null,
      parent_blend: null,
    },
  ]);
  assert.equal(
    state.product.sourceDecision.final_source_used,
    "dsld"
  );
});

test("scanner barcode orchestration uses DSLD before Go-UPC when master misses", async () => {
  const sequence = [];
  const { useScannerStore } = loadScannerStoreModule({
    canonicalizeBarcodeType: () => "ean13",
    normalizeBarcode: (value) => value.replace(/\D/g, ""),
    fetchLocalBarcodeScanProduct: async () => {
      sequence.push("local");
      return null;
    },
    maybeFetchDsldScanMatch: async () => {
      sequence.push("dsld");
      return {
        checked: true,
        cacheHit: true,
        confidence: "high",
        dsldMatch: {
          source: "dsld",
          product_name: "Vitamin D3 25 mcg",
          active_ingredients_with_disclosed_dose: [
            { ingredient_name: "Vitamin D3" },
          ],
        },
      };
    },
    extractBestIngredientCandidates: () => [{ name: "Vitamin D3" }],
    matchIngredientsToCatalog: () => ({
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: [],
    }),
  });

  const state = await useScannerStore
    .getState()
    .processBarcode("0123456789012", "ean13");

  assert.deepEqual(sequence, ["local", "dsld"]);
  assert.equal(state.status, "success");
  assert.equal(state.product.productName, "Vitamin D3 25 mcg");
  assert.deepEqual(state.product.dsldMatch, {
    source: "dsld",
    product_name: "Vitamin D3 25 mcg",
    active_ingredients_with_disclosed_dose: [
      { ingredient_name: "Vitamin D3" },
    ],
  });
});

test("scanner barcode orchestration persists provisional Go-UPC matches", async () => {
  const sequence = [];
  let persistedPayload = null;
  let persistedBarcodeType = null;
  const { useScannerStore } = loadScannerStoreModule({
    canonicalizeBarcodeType: () => "ean13",
    normalizeBarcode: (value) => value.replace(/\D/g, ""),
    fetchLocalBarcodeScanProduct: async () => {
      sequence.push("local");
      return null;
    },
    maybeFetchDsldScanMatch: async () => {
      sequence.push("dsld");
      return {
        checked: true,
        cacheHit: false,
        confidence: "low",
        dsldMatch: null,
      };
    },
    persistGoUpcProduct: async (product, barcodeType) => {
      persistedPayload = product;
      persistedBarcodeType = barcodeType;
      return {
        productId: "prod_go_upc",
        imageUrl: "https://cdn.example.com/go-upc.png",
        imageSourceUrl: "https://cdn.example.com/go-upc.png",
        imageProvider: "go_upc",
        verificationStatus: "go_upc_unverified",
      };
    },
    fetchGoUpcProduct: async () => {
      sequence.push("go_upc");
      return {
        barcode: "0123456789012",
        productName: "Go UPC Magnesium",
        ingredientsText: "Magnesium",
        imageUrl: "https://cdn.example.com/go-upc.png",
        scanDataSource: "go_upc",
      };
    },
    extractBestIngredientCandidates: () => [{ name: "Magnesium" }],
    matchIngredientsToCatalog: () => ({
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: [],
    }),
  });

  const state = await useScannerStore
    .getState()
    .processBarcode("0123456789012", "ean13");

  assert.deepEqual(sequence, ["local", "dsld", "go_upc"]);
  assert.equal(persistedPayload?.productName, "Go UPC Magnesium");
  assert.equal(persistedBarcodeType, "ean13");
  assert.equal(state.status, "success");
  assert.equal(state.product.productId, "prod_go_upc");
  assert.equal(state.product.verificationStatus, "go_upc_unverified");
  assert.equal(state.product.hasIncompleteDetails, true);
});

test("scanner barcode orchestration uses off_products only after DSLD and Go-UPC miss", async () => {
  const sequence = [];
  const { useScannerStore } = loadScannerStoreModule({
    canonicalizeBarcodeType: () => "ean13",
    normalizeBarcode: (value) => value.replace(/\D/g, ""),
    fetchLocalBarcodeScanProduct: async () => {
      sequence.push("local");
      return null;
    },
    maybeFetchDsldScanMatch: async () => {
      sequence.push("dsld");
      return {
        checked: true,
        cacheHit: false,
        confidence: "low",
        dsldMatch: null,
      };
    },
    fetchGoUpcProduct: async () => {
      sequence.push("go_upc");
      return null;
    },
    fetchOffProductsBarcodeScanProduct: async () => {
      sequence.push("off_products");
      return {
        barcode: "0123456789012",
        productId: "off_product",
        productName: "Cached OFF Product",
        ingredientsText: "Vitamin C",
        sourceIngredients: [],
        scanDataSource: "off_products",
        sourceStatus: 1,
      };
    },
    extractBestIngredientCandidates: () => [{ name: "Vitamin C" }],
    matchIngredientsToCatalog: () => ({
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: [],
    }),
  });

  const state = await useScannerStore
    .getState()
    .processBarcode("0123456789012", "ean13");

  assert.deepEqual(sequence, ["local", "dsld", "go_upc", "off_products"]);
  assert.equal(state.status, "success");
  assert.equal(state.product.scanDataSource, "off_products");
});

test("non-retail barcodes check the local cache before taking the not_found path", async () => {
  const sequence = [];
  const { useScannerStore } = loadScannerStoreModule({
    canonicalizeBarcodeType: () => "code128",
    isRetailBarcodeType: () => false,
    fetchLocalBarcodeScanProduct: async () => {
      sequence.push("local");
      return null;
    },
    fetchOpenFoodFactsProduct: async () => {
      sequence.push("off");
      return null;
    },
  });

  const state = await useScannerStore
    .getState()
    .processBarcode("ABC12345", "code128");

  assert.equal(state, null);
  const finalState = useScannerStore.getState();
  assert.equal(finalState.status, "not_found");
  assert.equal(finalState.error.code, "product_not_found");
  assert.deepEqual(sequence, ["local"]);
});

test("photo rescue forwards barcodeType from scanner state", async () => {
  let capturedPayload = null;
  const { useScannerStore } = loadScannerStoreModule({
    scanSupplementPhotos: async (payload) => {
      capturedPayload = payload;
      return {
        productId: "",
        displayName: "Scanned supplement",
        productName: "Scanned supplement",
        ingredients: ["Magnesium 200 mg"],
        servingSizeText: "",
        source: "photo_rescue",
        confidence: null,
        classificationConfidence: null,
        createdProduct: false,
        wroteCanonicalData: false,
        isSupplement: true,
        category: "",
        message: "",
        unresolvedIngredientCount: 0,
        rawText: "",
      };
    },
    fetchIngredientMatchCatalog: async () => [],
    matchIngredientsToCatalog: (ingredients) => ({
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: Array.isArray(ingredients) ? ingredients : [],
    }),
    extractIngredientCandidatesFromList: (ingredients) =>
      Array.isArray(ingredients) ? ingredients : [],
  });

  useScannerStore.setState({
    scanSessionId: 11,
    barcode: "X00131RGZ5",
    barcodeType: "code128",
    product: null,
  });

  await useScannerStore.getState().enhanceScanWithPhotos({
    scanSessionId: 11,
    ingredientsPhoto: "data:image/png;base64,abcd",
    productPhoto: "data:image/png;base64,efgh",
  });

  assert.equal(capturedPayload?.barcode, "X00131RGZ5");
  assert.equal(capturedPayload?.barcodeType, "code128");
  assert.equal(capturedPayload?.scanSessionId, "11");
});
