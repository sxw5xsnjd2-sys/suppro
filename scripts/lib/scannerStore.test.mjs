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
    "fetchOpenFoodFactsProduct",
    "isRetailBarcodeType",
    "isValidBarcode",
    "normalizeBarcode",
    "fetchLocalBarcodeScanProduct",
    "buildScanDebugMetadata",
    "getOpenFoodFactsQuality",
    "shouldCheckDsld",
    "maybeFetchDsldScanMatch",
    "fetchGoUpcProduct",
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
    overrides.fetchOpenFoodFactsProduct ?? (async () => null),
    overrides.isRetailBarcodeType ?? (() => true),
    overrides.isValidBarcode ?? (() => true),
    overrides.normalizeBarcode ?? ((value) => value),
    overrides.fetchLocalBarcodeScanProduct ?? (async () => null),
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
    overrides.getOpenFoodFactsQuality ?? (() => "missing"),
    overrides.shouldCheckDsld ?? (() => false),
    overrides.maybeFetchDsldScanMatch ??
      (async () => ({
        checked: false,
        cacheHit: false,
        confidence: null,
        dsldMatch: null,
      })),
    overrides.fetchGoUpcProduct ?? (async () => null),
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

test("scanner barcode orchestration checks local cache before OpenFoodFacts", async () => {
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

test("scanner barcode orchestration falls back from local to OpenFoodFacts and then DSLD for weak OFF data", async () => {
  const sequence = [];
  const { useScannerStore } = loadScannerStoreModule({
    canonicalizeBarcodeType: () => "ean13",
    normalizeBarcode: (value) => value.replace(/\D/g, ""),
    fetchLocalBarcodeScanProduct: async () => {
      sequence.push("local");
      return null;
    },
    fetchOpenFoodFactsProduct: async () => {
      sequence.push("off");
      return {
        barcode: "0474690758590",
        productName: "Natrol Melatonin",
        ingredientsText: "Melatonin",
        sourceIngredients: ["Melatonin"],
        scanDataSource: "open_food_facts",
        sourceStatus: 1,
      };
    },
    getOpenFoodFactsQuality: () => "low",
    shouldCheckDsld: ({ openFoodFactsQuality, featureEnabled }) =>
      featureEnabled && openFoodFactsQuality !== "good",
    maybeFetchDsldScanMatch: async () => {
      sequence.push("dsld");
      return {
        checked: true,
        cacheHit: false,
        confidence: "high",
        dsldMatch: {
          source: "dsld",
          product_name: "Natrol Melatonin 5 mg",
        },
      };
    },
    extractBestIngredientCandidates: () => [{ name: "Melatonin" }],
    matchIngredientsToCatalog: () => ({
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: [],
    }),
  });

  const state = await useScannerStore
    .getState()
    .processBarcode("0474690758590", "ean13");

  assert.deepEqual(sequence, ["local", "off", "dsld"]);
  assert.equal(state.status, "success");
  assert.equal(state.product.scanDataSource, "open_food_facts");
  assert.deepEqual(state.product.dsldMatch, {
    source: "dsld",
    product_name: "Natrol Melatonin 5 mg",
  });
  assert.equal(
    state.product.sourceDecision.final_source_used,
    "open_food_facts_with_dsld"
  );
});

test("scanner barcode orchestration preserves the DSLD secondary match when OpenFoodFacts fails", async () => {
  const sequence = [];
  const { useScannerStore } = loadScannerStoreModule({
    canonicalizeBarcodeType: () => "ean13",
    normalizeBarcode: (value) => value.replace(/\D/g, ""),
    fetchLocalBarcodeScanProduct: async () => {
      sequence.push("local");
      return null;
    },
    fetchOpenFoodFactsProduct: async () => {
      sequence.push("off");
      throw new Error("OpenFoodFacts unavailable");
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

  assert.deepEqual(sequence, ["local", "off", "dsld"]);
  assert.equal(state.status, "no_ingredients");
  assert.equal(state.product.productName, null);
  assert.deepEqual(state.product.dsldMatch, {
    source: "dsld",
    product_name: "Vitamin D3 25 mcg",
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
    fetchOpenFoodFactsProduct: async () => {
      sequence.push("off");
      throw new Error("OpenFoodFacts unavailable");
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

  assert.deepEqual(sequence, ["local", "off", "dsld", "go_upc"]);
  assert.equal(persistedPayload?.productName, "Go UPC Magnesium");
  assert.equal(persistedBarcodeType, "ean13");
  assert.equal(state.status, "success");
  assert.equal(state.product.productId, "prod_go_upc");
  assert.equal(state.product.verificationStatus, "go_upc_unverified");
  assert.equal(state.product.hasIncompleteDetails, true);
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
