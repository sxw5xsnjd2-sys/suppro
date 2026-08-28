import { create } from "zustand";
import {
  canonicalizeBarcodeType,
  fetchOpenFoodFactsProduct,
  isRetailBarcodeType,
  isValidBarcode,
  normalizeBarcode,
} from "@src/data/getOpenFoodFactsProduct";
import {
  fetchSupplementProductsMasterScanProduct,
} from "@src/data/getLocalBarcodeScanProduct";
import { buildScanDebugMetadata } from "@src/data/dsldSourceDecision";
import { maybeFetchDsldScanMatch } from "@src/data/getDsldScanProduct";
import { fetchEanSearchProduct } from "@src/data/getEanSearchProduct";
import { fetchGoUpcProduct } from "@src/data/getGoUpcProduct";
import { fetchIngredientMatchCatalog } from "@src/data/getIngredientMatchCatalog";
import {
  persistDsldProduct,
  persistGoUpcProduct,
} from "@src/data/persistGoUpcProduct";
import { queueMissingActiveIngredients } from "@src/data/queueMissingActiveIngredients";
import { scanSupplementPhotos } from "@src/data/scanSupplementPhotos";
import { enrichProductImageIfNeeded } from "@src/lib/productImages";
import {
  createLatencyTrace,
  createLatencyTraceId,
} from "@src/lib/latencyTelemetry";
import { supabase } from "@src/lib/supabase";
import {
  buildPartialProductDetailFailure,
  createScannerFailure,
  normalizeBarcodeScanFailure,
  normalizePhotoRescueFailure,
  SCANNER_FAILURE_CATEGORIES,
} from "@src/lib/scannerFailure";
import {
  logBuildAwareDiagnostic,
  logDevelopmentDiagnostic,
} from "@src/lib/runtimeConfig";
import {
  extractIngredientCandidatesFromList,
  extractBestIngredientCandidates,
  matchIngredientsToCatalog,
} from "./ingredientMatching";
import {
  buildScanResultHydrationKey,
  invalidateScanResultHydration,
} from "./resultHydration";
import { createScanRequestId, logScanTiming } from "./scanTiming";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const PROVISIONAL_BARCODE_SOURCE_CONFIG = {
  go_upc: {
    source: "go_upc",
    unverifiedStatus: "go_upc_unverified",
  },
  ean_search: {
    source: "ean_search",
    unverifiedStatus: "ean_search_unverified",
  },
  open_food_facts: {
    source: "open_food_facts",
    unverifiedStatus: "open_food_facts_unverified",
  },
};

function getProvisionalBarcodeSource(product) {
  const values = [
    product?.scanDataSource,
    product?.source,
    product?.sourceStatusVerbose,
    product?.verificationStatus,
    product?.verification_status,
  ]
    .map((value) => trimString(value).toLowerCase())
    .filter(Boolean);

  if (
    values.some(
      (value) =>
        value === "ean_search" ||
        value === "ean_search_plus_openai" ||
        value.includes("ean_search_unverified"),
    )
  ) {
    return "ean_search";
  }

  if (
    values.some(
      (value) =>
        value === "go_upc" ||
        value === "go_upc_plus_openai" ||
        value.includes("go_upc_unverified"),
    )
  ) {
    return "go_upc";
  }

  if (
    values.some(
      (value) =>
        value === "open_food_facts" ||
        value === "open_food_facts_plus_openai" ||
        value.includes("open_food_facts_unverified"),
    )
  ) {
    return "open_food_facts";
  }

  return null;
}

function getProvisionalBarcodeSourceConfig(product) {
  return PROVISIONAL_BARCODE_SOURCE_CONFIG[
    getProvisionalBarcodeSource(product)
  ];
}

function getIngredientDisplayName(ingredient) {
  if (typeof ingredient === "string") {
    return trimString(ingredient);
  }

  if (!ingredient || typeof ingredient !== "object") {
    return "";
  }

  const name =
    trimString(ingredient.name) ||
    trimString(ingredient.canonicalName) ||
    trimString(ingredient.canonical_name) ||
    trimString(ingredient.rawName) ||
    trimString(ingredient.raw_name);
  const dosageDisplay =
    trimString(ingredient.dosageDisplay) ||
    trimString(ingredient.dosage_display) ||
    trimString(ingredient.dosageOriginalText) ||
    trimString(ingredient.dosage_original_text);
  const dosageValue =
    typeof ingredient.dosageValue === "number" &&
    Number.isFinite(ingredient.dosageValue)
      ? ingredient.dosageValue
      : typeof ingredient.dosage_value === "number" &&
          Number.isFinite(ingredient.dosage_value)
        ? ingredient.dosage_value
        : null;
  const dosageUnit =
    trimString(ingredient.dosageUnit) || trimString(ingredient.dosage_unit);

  if (!name) {
    return "";
  }

  if (dosageDisplay) {
    return `${name} ${dosageDisplay}`;
  }

  if (Number.isFinite(dosageValue) && dosageUnit) {
    return `${name} ${dosageValue}${dosageUnit}`;
  }

  return name;
}

function buildPhotoRescueProduct({
  barcode,
  currentProduct,
  productId,
  displayName,
  productName,
  ingredients,
  servingSizeText,
  wroteCanonicalData,
  resultRevision,
  acceptedAttemptId,
}) {
  const nextProductName =
    trimString(displayName) ||
    trimString(productName) ||
    trimString(currentProduct?.productName) ||
    trimString(currentProduct?.name) ||
    "Scanned supplement";
  const nextSourceIngredients = Array.isArray(ingredients)
    ? ingredients.filter((item) => getIngredientDisplayName(item))
    : [];
  const ingredientDisplayNames = nextSourceIngredients
    .map((item) => getIngredientDisplayName(item))
    .filter(Boolean);

  return {
    ...(currentProduct && typeof currentProduct === "object"
      ? currentProduct
      : {}),
    barcode: trimString(barcode) || trimString(currentProduct?.barcode),
    productId:
      trimString(productId) || trimString(currentProduct?.productId) || null,
    productName: nextProductName,
    name: nextProductName,
    ingredientsText:
      ingredientDisplayNames.join(", ") ||
      trimString(currentProduct?.ingredientsText),
    sourceIngredients: nextSourceIngredients,
    sourceStatus:
      typeof currentProduct?.sourceStatus === "number"
        ? currentProduct.sourceStatus
        : 1,
    sourceStatusVerbose: wroteCanonicalData
      ? "photo_rescue_canonical"
      : trimString(currentProduct?.sourceStatusVerbose) || "photo_rescue",
    scanDataSource: wroteCanonicalData
      ? "supplement_products_master"
      : trimString(currentProduct?.scanDataSource) || "photo_rescue",
    verificationStatus: wroteCanonicalData
      ? "photo_verified"
      : trimString(currentProduct?.verificationStatus) || null,
    hasIncompleteDetails: wroteCanonicalData
      ? false
      : Boolean(currentProduct?.hasIncompleteDetails),
    servingSizeText:
      trimString(servingSizeText) ||
      trimString(currentProduct?.servingSizeText),
    photoImprovementRevision: Number.isSafeInteger(resultRevision)
      ? resultRevision
      : getPhotoImprovementRevision(currentProduct),
    photo_improvement_revision: Number.isSafeInteger(resultRevision)
      ? resultRevision
      : getPhotoImprovementRevision(currentProduct),
    photoImprovementAcceptedAttemptId:
      trimString(acceptedAttemptId) ||
      trimString(currentProduct?.photoImprovementAcceptedAttemptId) ||
      trimString(currentProduct?.photo_improvement_accepted_attempt_id) ||
      null,
    photo_improvement_accepted_attempt_id:
      trimString(acceptedAttemptId) ||
      trimString(currentProduct?.photoImprovementAcceptedAttemptId) ||
      trimString(currentProduct?.photo_improvement_accepted_attempt_id) ||
      null,
  };
}

function createInitialState() {
  return {
    status: "idle",
    error: null,
    permissionState: null,
    scanSessionId: 0,
    scanRequestId: null,
    latencyTraceId: null,
    barcode: "",
    barcodeType: null,
    product: null,
    ingredients: [],
    matchedIngredients: [],
    matches: [],
    unmatchedIngredients: [],
    photoRescueStatus: "idle",
    photoRescueError: null,
    photoRescueAttemptId: 0,
    photoRescueRevision: 0,
    extractionSource: null,
    extractionConfidence: null,
  };
}

function shouldUseStructuredLocalIngredients(product) {
  return (
    (trimString(product?.scanDataSource) === "supplement_products_master" ||
      trimString(product?.scanDataSource) === "dsld") &&
    Array.isArray(product?.sourceIngredients) &&
    product.sourceIngredients.length > 0
  );
}

function mapDsldIngredientRow(row, ingredientType) {
  const name = trimString(row?.ingredient_name) || trimString(row?.name);
  if (!name) {
    return null;
  }

  const dosageValueRaw = row?.amount_per_serving;
  const dosageValue =
    typeof dosageValueRaw === "number" && Number.isFinite(dosageValueRaw)
      ? dosageValueRaw
      : Number.parseFloat(String(dosageValueRaw ?? "").trim());
  const dosageUnit = trimString(row?.amount_unit) || null;
  const hasValidDosageValue = Number.isFinite(dosageValue);
  const dosageDisplay =
    hasValidDosageValue && dosageUnit ? `${dosageValue}${dosageUnit}` : null;

  return {
    ...row,
    name,
    amount: hasValidDosageValue ? dosageValue : null,
    unit: dosageUnit,
    dosageValue: hasValidDosageValue ? dosageValue : null,
    dosageUnit,
    dosageDisplay,
    ingredientType,
    ingredient_type: ingredientType,
    parentBlend:
      trimString(row?.parentBlend) ||
      trimString(row?.parent_blend) ||
      trimString(row?.blend_name) ||
      null,
    parent_blend:
      trimString(row?.parent_blend) ||
      trimString(row?.parentBlend) ||
      trimString(row?.blend_name) ||
      null,
  };
}

function buildDsldSecondaryProduct({
  barcode,
  product,
  dsldMatch,
  sourceDecision,
}) {
  const dsldSourceIngredients = [
    ...(Array.isArray(dsldMatch?.active_ingredients_with_disclosed_dose)
      ? dsldMatch.active_ingredients_with_disclosed_dose.map((row) =>
          mapDsldIngredientRow(row, "active_with_disclosed_dose"),
        )
      : []),
    ...(Array.isArray(dsldMatch?.active_ingredients_without_disclosed_dose)
      ? dsldMatch.active_ingredients_without_disclosed_dose.map((row) =>
          mapDsldIngredientRow(row, "active_without_disclosed_dose"),
        )
      : []),
    ...(Array.isArray(dsldMatch?.proprietary_blend_rows)
      ? dsldMatch.proprietary_blend_rows.map((row) =>
          mapDsldIngredientRow(row, "proprietary_blend"),
        )
      : []),
  ].filter(Boolean);
  const dsldIngredientsText = dsldSourceIngredients
    .map((row) => trimString(row.name))
    .filter(Boolean)
    .join(", ");
  const productSourceIngredients = Array.isArray(product?.sourceIngredients)
    ? product.sourceIngredients
    : [];

  return {
    ...(product && typeof product === "object" ? product : {}),
    barcode: trimString(barcode) || trimString(product?.barcode),
    brand:
      trimString(product?.brand) || trimString(dsldMatch?.brand_name) || null,
    productName:
      trimString(product?.productName) ||
      trimString(dsldMatch?.product_name) ||
      null,
    ingredientsText:
      trimString(product?.ingredientsText) || dsldIngredientsText,
    sourceIngredients:
      productSourceIngredients.length > 0
        ? productSourceIngredients
        : dsldSourceIngredients,
    sourceStatus:
      typeof product?.sourceStatus === "number" ? product.sourceStatus : null,
    sourceStatusVerbose: trimString(product?.sourceStatusVerbose) || null,
    scanDataSource: trimString(product?.scanDataSource) || "dsld",
    servingSizeText:
      trimString(product?.servingSizeText) ||
      trimString(dsldMatch?.serving_size) ||
      null,
    imageUrl: trimString(product?.imageUrl) || null,
    imageSourceUrl: trimString(product?.imageSourceUrl) || null,
    dsldMatch,
    sourceDecision,
  };
}

function getProductImageUrl(product) {
  return (
    trimString(product?.imageUrl) ||
    trimString(product?.image_url) ||
    trimString(product?.image) ||
    null
  );
}

function enrichDsldProductWithGoUpcCosmetics(product, goUpcProduct) {
  const goUpcImageUrl = getProductImageUrl(goUpcProduct);
  const productImageUrl = getProductImageUrl(product);
  const goUpcProductName =
    trimString(goUpcProduct?.productName) || trimString(goUpcProduct?.name);

  return {
    ...product,
    imageUrl: productImageUrl || goUpcImageUrl,
    imageSourceUrl:
      trimString(product?.imageSourceUrl) ||
      trimString(product?.image_source_url) ||
      trimString(goUpcProduct?.imageSourceUrl) ||
      trimString(goUpcProduct?.image_source_url) ||
      goUpcImageUrl ||
      null,
    imageProvider:
      trimString(product?.imageProvider) ||
      trimString(product?.image_provider) ||
      (goUpcImageUrl ? "go_upc" : null),
    imageDataSource:
      trimString(product?.imageDataSource) ||
      trimString(product?.image_data_source) ||
      (goUpcImageUrl ? "go_upc" : null),
    displayName:
      trimString(product?.displayName) ||
      trimString(product?.display_name) ||
      goUpcProductName ||
      null,
  };
}

function getActiveIngredientsJson(product) {
  const ingredients =
    product?.active_ingredients_json ?? product?.activeIngredientsJson;

  return Array.isArray(ingredients) ? ingredients.filter(Boolean) : [];
}

function getIngredientCount(product) {
  const count = product?.ingredient_count ?? product?.ingredientCount;
  if (typeof count === "number" && Number.isFinite(count)) {
    return count;
  }

  const parsed = Number.parseInt(String(count ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPhotoImprovementRevision(product) {
  const value =
    product?.photoImprovementRevision ?? product?.photo_improvement_revision;
  const revision =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function buildIngredientsTextFromActiveIngredients(product) {
  return getActiveIngredientsJson(product)
    .map((ingredient) => getIngredientDisplayName(ingredient))
    .filter(Boolean)
    .join(", ");
}

function isVerifiedMasterBarcodeProduct(product) {
  return Boolean(
    trimString(product?.productId) &&
      trimString(product?.scanDataSource) === "supplement_products_master" &&
      trimString(product?.verificationStatus).toLowerCase() === "verified",
  );
}

async function persistCanonicalDsldProduct(product, barcodeType, telemetry) {
  const persisted = await persistDsldProduct(product, barcodeType, telemetry);
  if (!persisted || typeof persisted !== "object") {
    return product;
  }

  return {
    ...product,
    productId:
      trimString(persisted.productId) || trimString(product?.productId) || null,
    verificationStatus:
      trimString(persisted.verificationStatus) ||
      trimString(product?.verificationStatus) ||
      "dsld_verified",
    hasIncompleteDetails: false,
  };
}

function logScannerSource(source, product) {
  logDevelopmentDiagnostic("log", "[scanner-source]", {
    source,
    scanDataSource: trimString(product?.scanDataSource) || null,
    barcode: trimString(product?.barcode) || null,
    productName:
      trimString(product?.productName) || trimString(product?.name) || null,
  });
}

async function persistProvisionalGoUpcProduct(product, barcodeType, telemetry) {
  const persisted = await persistGoUpcProduct(product, barcodeType, telemetry);
  if (!persisted || typeof persisted !== "object") {
    return product;
  }

  return {
    ...product,
    productId:
      trimString(persisted.productId) || trimString(product?.productId) || null,
    product_id:
      trimString(persisted.productId) ||
      trimString(persisted.product_id) ||
      trimString(product?.product_id) ||
      trimString(product?.productId) ||
      null,
    displayName:
      trimString(persisted.displayName) ||
      trimString(product?.displayName) ||
      trimString(product?.display_name) ||
      null,
    display_name:
      trimString(persisted.displayName) ||
      trimString(persisted.display_name) ||
      trimString(product?.display_name) ||
      trimString(product?.displayName) ||
      null,
    imageUrl:
      trimString(persisted.imageUrl) || trimString(product?.imageUrl) || null,
    image_url:
      trimString(persisted.imageUrl) ||
      trimString(persisted.image_url) ||
      trimString(product?.image_url) ||
      trimString(product?.imageUrl) ||
      null,
    imageSourceUrl:
      trimString(persisted.imageSourceUrl) ||
      trimString(product?.imageSourceUrl) ||
      null,
    image_source_url:
      trimString(persisted.imageSourceUrl) ||
      trimString(persisted.image_source_url) ||
      trimString(product?.image_source_url) ||
      trimString(product?.imageSourceUrl) ||
      null,
    imageProvider:
      trimString(persisted.imageProvider) ||
      trimString(product?.imageProvider) ||
      null,
    nameSource:
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      trimString(product?.nameSource) ||
      trimString(product?.name_source) ||
      null,
    name_source:
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      trimString(product?.name_source) ||
      trimString(product?.nameSource) ||
      null,
    namingSource:
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      trimString(product?.namingSource) ||
      trimString(product?.naming_source) ||
      null,
    naming_source:
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      trimString(product?.naming_source) ||
      trimString(product?.namingSource) ||
      null,
    sourceStatusVerbose:
      trimString(product?.sourceStatusVerbose) ||
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      null,
    scanDataSource:
      trimString(product?.scanDataSource) ||
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      null,
    source:
      trimString(product?.source) ||
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      null,
    serving_size_text:
      trimString(persisted.servingSizeText) ||
      trimString(persisted.serving_size_text) ||
      trimString(product?.serving_size_text) ||
      trimString(product?.servingSizeText) ||
      null,
    ingredientsText:
      trimString(persisted.ingredientsText) ||
      trimString(persisted.ingredients_text) ||
      trimString(product?.ingredientsText) ||
      buildIngredientsTextFromActiveIngredients(persisted) ||
      buildIngredientsTextFromActiveIngredients(product),
    servingSizeText:
      trimString(persisted.servingSizeText) ||
      trimString(persisted.serving_size_text) ||
      trimString(product?.servingSizeText) ||
      trimString(product?.serving_size_text) ||
      null,
    active_ingredients_json:
      getActiveIngredientsJson(persisted).length > 0
        ? getActiveIngredientsJson(persisted)
        : getActiveIngredientsJson(product),
    activeIngredientsJson:
      getActiveIngredientsJson(persisted).length > 0
        ? getActiveIngredientsJson(persisted)
        : getActiveIngredientsJson(product),
    ingredient_count:
      getIngredientCount(persisted) ?? getIngredientCount(product),
    ingredientCount:
      getIngredientCount(persisted) ?? getIngredientCount(product),
    verificationStatus:
      trimString(persisted.verificationStatus) ||
      trimString(product?.verificationStatus) ||
      getProvisionalBarcodeSourceConfig(product)?.unverifiedStatus ||
      "go_upc_unverified",
    verification_status:
      trimString(persisted.verificationStatus) ||
      trimString(persisted.verification_status) ||
      trimString(product?.verification_status) ||
      trimString(product?.verificationStatus) ||
      getProvisionalBarcodeSourceConfig(product)?.unverifiedStatus ||
      "go_upc_unverified",
  };
}

async function maybeApplyImageFallback(product) {
  if (!product || typeof product !== "object" || getProductImageUrl(product)) {
    return product;
  }

  const productId =
    trimString(product?.product_id) || trimString(product?.productId);
  if (!productId) {
    return product;
  }

  try {
    const imageResult = await enrichProductImageIfNeeded({
      ...product,
      product_id: productId,
    });

    if (
      !imageResult?.imageUrl ||
      (imageResult.status !== "found" && imageResult.status !== "cached")
    ) {
      return product;
    }

    return {
      ...product,
      imageUrl: imageResult.imageUrl,
      image_url: imageResult.imageUrl,
      imageSourceUrl:
        trimString(imageResult.sourceUrl) ||
        trimString(product?.imageSourceUrl) ||
        trimString(product?.image_source_url) ||
        imageResult.imageUrl,
      image_source_url:
        trimString(imageResult.sourceUrl) ||
        trimString(product?.image_source_url) ||
        trimString(product?.imageSourceUrl) ||
        imageResult.imageUrl,
      imageProvider:
        trimString(product?.imageProvider) || "enrich_product_image",
    };
  } catch (imageFallbackError) {
    logBuildAwareDiagnostic(
      "warn",
      "[scanner] image fallback failed after Open Food Facts match",
      {
        developmentDetails: {
          message:
            typeof imageFallbackError?.message === "string"
              ? imageFallbackError.message
              : "Unknown error",
        },
      },
    );
    return product;
  }
}

function queueDeferredVerifiedMasterIngredientMatching({
  product,
  ingredients,
  barcode,
  scanRequestId,
  scanSessionId,
  get,
  set,
}) {
  logScanTiming(scanRequestId, "background_ingredient_matching_scheduled", {
    ingredientCount: ingredients.length,
  });

  setTimeout(async () => {
    const stateBeforeMatching = get();
    if (
      stateBeforeMatching.scanSessionId !== scanSessionId ||
      stateBeforeMatching.scanRequestId !== scanRequestId ||
      stateBeforeMatching.barcode !== barcode
    ) {
      logScanTiming(scanRequestId, "background_ingredient_matching_skipped", {
        reason: "stale_scan_session",
      });
      return;
    }

    try {
      logScanTiming(scanRequestId, "subsequent_database_query_started", {
        query: "ingredient_match_catalog_background",
      });
      const catalogRows = await fetchIngredientMatchCatalog();
      logScanTiming(scanRequestId, "subsequent_database_query_completed", {
        query: "ingredient_match_catalog_background",
        rowCount: catalogRows.length,
      });
      const nextMatches = matchIngredientsToCatalog(ingredients, catalogRows, {
        scanRequestId,
        logTiming: logScanTiming,
      });

      let applied = false;
      set((currentState) => {
        if (
          currentState.scanSessionId !== scanSessionId ||
          currentState.scanRequestId !== scanRequestId ||
          currentState.barcode !== barcode
        ) {
          return currentState;
        }

        applied = true;
        return {
          matchedIngredients: nextMatches.matchedIngredients,
          matches: nextMatches.matches,
          unmatchedIngredients: nextMatches.unmatchedIngredients,
        };
      });
      logScanTiming(scanRequestId, "background_ingredient_matching_completed", {
        applied,
        stale: !applied,
        matchedIngredientCount: nextMatches.matchedIngredients.length,
        unmatchedIngredientCount: nextMatches.unmatchedIngredients.length,
      });

      if (
        applied &&
        trimString(product?.productId) &&
        nextMatches.unmatchedIngredients.length
      ) {
        queueMissingActiveIngredients({
          productId: product.productId,
          ingredients: nextMatches.unmatchedIngredients,
        }).catch(() => {
          logBuildAwareDiagnostic(
            "warn",
            "[scanner] failed to queue missing active ingredients",
            {
              developmentDetails: { reason: "unexpected_queue_error" },
            },
          );
        });
      }
    } catch (error) {
      logScanTiming(scanRequestId, "background_ingredient_matching_completed", {
        failed: true,
        error: trimString(error?.message) || "unknown_error",
      });
      logBuildAwareDiagnostic(
        "warn",
        "[scanner] deferred verified-master ingredient matching failed",
        {
          developmentDetails: {
            message: trimString(error?.message) || "Unknown error",
          },
        },
      );
    }
  }, 0);
}

export const useScannerStore = create((set, get) => ({
  ...createInitialState(),

  setPermissionState: (permission) =>
    set(() => ({
      permissionState: permission
        ? {
            granted: Boolean(permission.granted),
            canAskAgain: Boolean(permission.canAskAgain),
            status: permission.status ?? "unknown",
          }
        : null,
    })),

  resetScan: () =>
    set((state) => ({
      ...createInitialState(),
      permissionState: state.permissionState,
      scanSessionId: state.scanSessionId,
    })),

  resetPhotoRescueState: () =>
    set((state) => ({
      photoRescueStatus: "idle",
      photoRescueError: null,
      photoRescueAttemptId:
        (Number.isFinite(state.photoRescueAttemptId)
          ? state.photoRescueAttemptId
          : 0) + 1,
    })),

  processBarcode: async (barcode, barcodeType, options = {}) => {
    const nextBarcode = normalizeBarcode(barcode, barcodeType);
    const nextBarcodeType = canonicalizeBarcodeType(barcodeType) || null;
    const nextScanSessionId = get().scanSessionId + 1;
    const scanRequestId =
      trimString(options?.scanRequestId) ||
      createScanRequestId(nextScanSessionId);
    const latencyTrace = createLatencyTrace({
      traceId:
        trimString(options?.latencyTraceId) ||
        createLatencyTraceId("barcode_scan"),
      flow: "barcode_scan",
      action: "resolve_unknown_barcode",
    });
    const finishScanResolution = latencyTrace.start("scan_resolution_total");

    logScanTiming(scanRequestId, "store_barcode_normalized", {
      barcode: nextBarcode,
      barcodeType: nextBarcodeType,
      scanSessionId: nextScanSessionId,
    });
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          logScanTiming(scanRequestId, "authentication_session_ready", {
            authenticated: Boolean(data?.session?.access_token),
            error: trimString(error?.message) || null,
            explicitlyAwaitedByScan: false,
          });
        })
        .catch((error) => {
          logScanTiming(scanRequestId, "authentication_session_ready", {
            authenticated: false,
            error: trimString(error?.message) || "session_check_failed",
            explicitlyAwaitedByScan: false,
          });
        });
    }

    if (!isValidBarcode(nextBarcode, nextBarcodeType)) {
      const invalid = normalizeBarcodeScanFailure({
        code: "invalid_barcode",
      });

      set(() => ({
        status: invalid.status,
        error: invalid.error,
        scanSessionId: nextScanSessionId,
        scanRequestId,
        latencyTraceId: latencyTrace.traceId,
        barcode: nextBarcode,
        barcodeType: nextBarcodeType,
        product: null,
        ingredients: [],
        matchedIngredients: [],
        matches: [],
        unmatchedIngredients: [],
        photoRescueStatus: "idle",
        photoRescueError: null,
        photoRescueAttemptId: 0,
        photoRescueRevision: 0,
        extractionSource: null,
        extractionConfidence: null,
      }));
      logScanTiming(scanRequestId, "scanner_state_updated", {
        status: invalid.status,
      });
      finishScanResolution({
        resultStatus: invalid.status,
        success: false,
        errorCategory: "invalid_barcode",
      });

      return null;
    }

    set(() => ({
      status: "processing",
      error: null,
      scanSessionId: nextScanSessionId,
      scanRequestId,
      latencyTraceId: latencyTrace.traceId,
      barcode: nextBarcode,
      barcodeType: nextBarcodeType,
      product: null,
      ingredients: [],
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: [],
      photoRescueStatus: "idle",
      photoRescueError: null,
      photoRescueAttemptId: 0,
      photoRescueRevision: 0,
      extractionSource: null,
      extractionConfidence: null,
    }));
    logScanTiming(scanRequestId, "scanner_state_updated", {
      status: "processing",
    });

    try {
      let product = null;
      let extractionSource = null;
      const retailBarcode = isRetailBarcodeType(nextBarcodeType);
      let offFound = false;
      let offQuality = "missing";
      let dsldChecked = false;
      let dsldCacheHit = false;
      let dsldConfidence = null;
      const lookupFailures = [];

      const finishMasterLookup = latencyTrace.start(
        "master_database_lookup",
        { provider: "supplement_products_master" },
      );
      try {
        logScanTiming(scanRequestId, "master_lookup_started", {
          barcode: nextBarcode,
          barcodeType: nextBarcodeType,
        });
        product = await fetchSupplementProductsMasterScanProduct(
          nextBarcode,
          nextBarcodeType,
          { scanRequestId },
        );
        finishMasterLookup({
          cacheHit: Boolean(product),
          cacheStatus: product ? "hit" : "miss",
          found: Boolean(product),
          masterDatabaseHit: Boolean(product),
          success: true,
        });
        logScanTiming(scanRequestId, "master_lookup_completed", {
          found: Boolean(product),
          productId: trimString(product?.productId) || null,
        });
        logScanTiming(
          scanRequestId,
          product ? "master_product_found" : "master_product_missed",
          {
            verificationStatus:
              trimString(product?.verificationStatus) || null,
          },
        );
        extractionSource = trimString(product?.scanDataSource) || null;
        if (product) {
          logScannerSource("local", product);
        }
      } catch (localLookupError) {
        lookupFailures.push(localLookupError);
        finishMasterLookup({
          success: false,
          error: localLookupError,
        });
        logScanTiming(scanRequestId, "master_lookup_completed", {
          found: false,
          failed: true,
          error: trimString(localLookupError?.message) || "unknown_error",
        });
        logBuildAwareDiagnostic(
          "warn",
          "[scanner] supplement master lookup failed; falling back to DSLD",
          {
            developmentDetails: {
              message:
                typeof localLookupError?.message === "string"
                  ? localLookupError.message
                  : "Unknown error",
            },
          },
        );
      }

      if (!product && retailBarcode) {
        logScanTiming(scanRequestId, "fallback_lookup_started", {
          fallback: "dsld",
        });
        const finishDsld = latencyTrace.start("dsld_total", {
          provider: "dsld",
        });
        let dsldResult;
        try {
          dsldResult = await maybeFetchDsldScanMatch({
            barcode: nextBarcode,
            barcodeType: nextBarcodeType,
            productName: "",
            telemetry: latencyTrace,
          });
          finishDsld({
            cacheHit: dsldResult.cacheHit,
            cacheStatus: dsldResult.cacheHit ? "hit" : "miss",
            found: Boolean(dsldResult.dsldMatch),
            success: true,
          });
        } catch (error) {
          finishDsld({ success: false, error });
          throw error;
        }
        dsldChecked = dsldResult.checked;
        dsldCacheHit = dsldResult.cacheHit;
        dsldConfidence = dsldResult.confidence;

        if (dsldResult.dsldMatch) {
          const sourceDecision = buildScanDebugMetadata({
            offFound,
            offQuality,
            dsldChecked,
            dsldCacheHit,
            dsldConfidence,
            finalSourceUsed: "photo_fallback_with_dsld",
          });
          product = buildDsldSecondaryProduct({
            barcode: nextBarcode,
            product: null,
            dsldMatch: dsldResult.dsldMatch,
            sourceDecision,
          });
          if (!getProductImageUrl(product)) {
            try {
              logScanTiming(scanRequestId, "fallback_lookup_started", {
                fallback: "go_upc_cosmetic_enrichment",
              });
              const finishGoUpcCosmetics = latencyTrace.start(
                "external_provider_call",
                { mode: "cosmetic_enrichment", provider: "go_upc" },
              );
              let goUpcCosmetics;
              try {
                goUpcCosmetics = await fetchGoUpcProduct(
                  nextBarcode,
                  nextBarcodeType,
                );
                finishGoUpcCosmetics({
                  found: Boolean(goUpcCosmetics),
                  success: true,
                });
              } catch (error) {
                finishGoUpcCosmetics({ success: false, error });
                throw error;
              }
              if (goUpcCosmetics) {
                product = enrichDsldProductWithGoUpcCosmetics(
                  product,
                  goUpcCosmetics,
                );
              }
            } catch (goUpcError) {
              logBuildAwareDiagnostic(
                "warn",
                "[scanner] Go-UPC cosmetic enrichment failed after DSLD match",
                {
                  developmentDetails: {
                    message:
                      typeof goUpcError?.message === "string"
                        ? goUpcError.message
                        : "Unknown error",
                  },
                },
              );
            }
          }
          product = await latencyTrace.measure(
            "product_persistence",
            () =>
              persistCanonicalDsldProduct(
                product,
                nextBarcodeType,
                latencyTrace,
              ),
            { provider: "supabase", source: "dsld" },
          );
          extractionSource = "dsld";
          logScannerSource("dsld", product);
        } else {
          try {
            logScanTiming(scanRequestId, "fallback_lookup_started", {
              fallback: "go_upc",
            });
            const finishGoUpc = latencyTrace.start("external_provider_call", {
              provider: "go_upc",
            });
            try {
              product = await fetchGoUpcProduct(
                nextBarcode,
                nextBarcodeType,
              );
              finishGoUpc({ found: Boolean(product), success: true });
            } catch (error) {
              finishGoUpc({ success: false, error });
              throw error;
            }
            if (product) {
              product = await latencyTrace.measure(
                "product_persistence",
                () =>
                  persistProvisionalGoUpcProduct(
                    product,
                    nextBarcodeType,
                    latencyTrace,
                  ),
                { provider: "supabase", source: "go_upc" },
              );
              product = {
                ...product,
                hasIncompleteDetails: true,
              };
              extractionSource =
                trimString(product?.scanDataSource) || "go_upc";
              logScannerSource(extractionSource, product);
            }
          } catch (goUpcError) {
            lookupFailures.push(goUpcError);
            logBuildAwareDiagnostic(
              "warn",
              "[scanner] Go-UPC lookup failed after DSLD miss",
              {
                developmentDetails: {
                  message:
                    typeof goUpcError?.message === "string"
                      ? goUpcError.message
                      : "Unknown error",
                },
              },
            );
          }

          if (!product) {
            try {
              logScanTiming(scanRequestId, "fallback_lookup_started", {
                fallback: "ean_search",
              });
              const finishEanSearch = latencyTrace.start(
                "external_provider_call",
                { provider: "ean_search" },
              );
              try {
                product = await fetchEanSearchProduct(
                  nextBarcode,
                  nextBarcodeType,
                );
                finishEanSearch({ found: Boolean(product), success: true });
              } catch (error) {
                finishEanSearch({ success: false, error });
                throw error;
              }
              if (product) {
                product = await latencyTrace.measure(
                  "product_persistence",
                  () =>
                    persistProvisionalGoUpcProduct(
                      product,
                      nextBarcodeType,
                      latencyTrace,
                    ),
                  { provider: "supabase", source: "ean_search" },
                );
                product = {
                  ...product,
                  hasIncompleteDetails: true,
                };
                extractionSource =
                  trimString(product?.scanDataSource) || "ean_search";
                logScannerSource(extractionSource, product);
              }
            } catch (eanSearchError) {
              lookupFailures.push(eanSearchError);
              logBuildAwareDiagnostic(
                "warn",
                "[scanner] EAN-Search lookup failed after Go-UPC miss",
                {
                  developmentDetails: {
                    message:
                      typeof eanSearchError?.message === "string"
                        ? eanSearchError.message
                        : "Unknown error",
                  },
                },
              );
            }
          }
        }
      }

      if (!product && retailBarcode) {
        try {
          logScanTiming(scanRequestId, "fallback_lookup_started", {
            fallback: "open_food_facts",
          });
          const finishOpenFoodFacts = latencyTrace.start(
            "external_provider_call",
            { provider: "open_food_facts" },
          );
          try {
            product = await fetchOpenFoodFactsProduct(
              nextBarcode,
              nextBarcodeType,
            );
            finishOpenFoodFacts({ found: Boolean(product), success: true });
          } catch (error) {
            finishOpenFoodFacts({ success: false, error });
            throw error;
          }
          offFound = Boolean(product);
          offQuality = product
            ? trimString(product?.ingredientsText)
              ? "ingredient_text"
              : "metadata_only"
            : "missing";
          if (product) {
            product = await latencyTrace.measure(
              "product_persistence",
              () =>
                persistProvisionalGoUpcProduct(
                  product,
                  nextBarcodeType,
                  latencyTrace,
                ),
              { provider: "supabase", source: "open_food_facts" },
            );
            product = {
              ...product,
              hasIncompleteDetails: true,
            };
            product = await latencyTrace.measure(
              "product_image_enrichment",
              () => maybeApplyImageFallback(product),
              { provider: "enrich_product_image" },
            );
            extractionSource =
              trimString(product?.scanDataSource) || "open_food_facts";
            logScannerSource("open_food_facts", product);
          }
        } catch (openFoodFactsError) {
          lookupFailures.push(openFoodFactsError);
          offFound = false;
          offQuality = "missing";
          logBuildAwareDiagnostic(
            "warn",
            "[scanner] Open Food Facts lookup failed after database provider misses",
            {
              developmentDetails: {
                status:
                  typeof openFoodFactsError?.status === "number"
                    ? openFoodFactsError.status
                    : null,
                code: trimString(openFoodFactsError?.code) || null,
                message:
                  typeof openFoodFactsError?.message === "string"
                    ? openFoodFactsError.message
                    : "Unknown error",
              },
            },
          );
        }
      }

      if (!product) {
        if (lookupFailures.length > 0) {
          throw createScannerFailure({
            category: SCANNER_FAILURE_CATEGORIES.networkError,
            code: "barcode_lookup_failed",
            message:
              "We couldn't finish checking product databases. Please try again.",
          });
        }
        throw { code: "product_not_found" };
      }

      const finishClientProcessing = latencyTrace.start(
        "client_result_processing",
        {
          externalEnrichment:
            trimString(product?.scanDataSource) !==
            "supplement_products_master",
          masterDatabaseHit:
            trimString(product?.scanDataSource) ===
            "supplement_products_master",
        },
      );

      logScanTiming(scanRequestId, "ingredient_extraction_started", {
        sourceIngredientCount: product?.sourceIngredients?.length ?? 0,
      });
      const ingredientExtractionStartedAt =
        globalThis.performance?.now?.() ?? Date.now();
      const ingredients = shouldUseStructuredLocalIngredients(product)
        ? extractIngredientCandidatesFromList(product.sourceIngredients, {
            scanRequestId,
            logTiming: logScanTiming,
          })
        : extractBestIngredientCandidates(product);
      const ingredientExtractionCompletedAt =
        globalThis.performance?.now?.() ?? Date.now();
      logScanTiming(scanRequestId, "ingredient_extraction_completed", {
        durationMs:
          Math.round(
            (ingredientExtractionCompletedAt - ingredientExtractionStartedAt) *
              10,
          ) / 10,
        ingredientCount: ingredients.length,
      });

      const sourceDecision = buildScanDebugMetadata({
        offFound,
        offQuality:
          trimString(product?.scanDataSource) === "open_food_facts"
            ? offQuality
            : "local_cache",
        dsldChecked,
        dsldCacheHit,
        dsldConfidence,
        finalSourceUsed:
          trimString(product?.scanDataSource) ===
            "supplement_products_master" ||
          trimString(product?.scanDataSource) === "off_products"
            ? trimString(product.scanDataSource)
            : trimString(product?.scanDataSource) === "go_upc"
              ? "go_upc"
              : trimString(product?.scanDataSource) === "go_upc_plus_openai"
                ? "go_upc_plus_openai"
                : trimString(product?.scanDataSource) === "ean_search"
                  ? "ean_search"
                  : trimString(product?.scanDataSource) ===
                      "ean_search_plus_openai"
                    ? "ean_search_plus_openai"
                    : trimString(product?.scanDataSource) === "dsld"
                      ? "dsld"
                      : trimString(product?.scanDataSource) ===
                          "openai_web_search"
                        ? "openai_web_search"
                        : trimString(product?.dsldMatch?.source)
                          ? "open_food_facts_with_dsld"
                          : trimString(product?.scanDataSource) ===
                              "open_food_facts"
                            ? "open_food_facts"
                            : trimString(product?.scanDataSource) ===
                                "open_food_facts_plus_openai"
                              ? "open_food_facts"
                            : "photo_fallback_pending",
      });
      if (product && typeof product === "object") {
        product = {
          ...product,
          sourceDecision,
        };
      }
      logDevelopmentDiagnostic(
        "log",
        "[scanner-source-decision]",
        sourceDecision,
      );

      if (!product.ingredientsText || ingredients.length === 0) {
        set(() => ({
          status: "no_ingredients",
          error: buildPartialProductDetailFailure(),
          scanSessionId: nextScanSessionId,
          scanRequestId,
          barcode: nextBarcode,
          barcodeType: nextBarcodeType,
          product,
          ingredients: [],
          matchedIngredients: [],
          matches: [],
          unmatchedIngredients: [],
          photoRescueStatus: "idle",
          photoRescueError: null,
          photoRescueRevision: getPhotoImprovementRevision(product),
          extractionSource,
          extractionConfidence: null,
        }));
        logScanTiming(scanRequestId, "scanner_state_updated", {
          status: "no_ingredients",
        });
        finishClientProcessing({
          ingredientCount: 0,
          resultStatus: "no_ingredients",
          success: true,
        });
        finishScanResolution({
          externalEnrichment:
            trimString(product?.scanDataSource) !==
            "supplement_products_master",
          masterDatabaseHit:
            trimString(product?.scanDataSource) ===
            "supplement_products_master",
          resultStatus: "no_ingredients",
          success: true,
        });

        return get();
      }

      if (isVerifiedMasterBarcodeProduct(product)) {
        set(() => ({
          status: "success",
          error: null,
          scanSessionId: nextScanSessionId,
          scanRequestId,
          barcode: nextBarcode,
          barcodeType: nextBarcodeType,
          product,
          ingredients,
          matchedIngredients: [],
          matches: [],
          unmatchedIngredients: [],
          photoRescueStatus: "idle",
          photoRescueError: null,
          photoRescueRevision: getPhotoImprovementRevision(product),
          extractionSource,
          extractionConfidence: null,
        }));
        logScanTiming(scanRequestId, "scanner_state_updated", {
          status: "success",
          ingredientMatchingDeferred: true,
        });
        queueDeferredVerifiedMasterIngredientMatching({
          product,
          ingredients,
          barcode: nextBarcode,
          scanRequestId,
          scanSessionId: nextScanSessionId,
          get,
          set,
        });

        finishClientProcessing({
          ingredientCount: ingredients.length,
          resultStatus: "success",
          success: true,
        });
        finishScanResolution({
          cacheStatus: "hit",
          masterDatabaseHit: true,
          resultStatus: "success",
          success: true,
        });

        return get();
      }

      logScanTiming(scanRequestId, "subsequent_database_query_started", {
        query: "ingredient_match_catalog",
      });
      const catalogRows = await fetchIngredientMatchCatalog();
      logScanTiming(scanRequestId, "subsequent_database_query_completed", {
        query: "ingredient_match_catalog",
        rowCount: catalogRows.length,
      });
      const { matchedIngredients, matches, unmatchedIngredients } =
        matchIngredientsToCatalog(ingredients, catalogRows, {
          scanRequestId,
          logTiming: logScanTiming,
        });

      set(() => ({
        status: "success",
        error: null,
        scanSessionId: nextScanSessionId,
        scanRequestId,
        barcode: nextBarcode,
        barcodeType: nextBarcodeType,
        product,
        ingredients,
        matchedIngredients,
        matches,
        unmatchedIngredients,
        photoRescueStatus: "idle",
        photoRescueError: null,
        photoRescueRevision: getPhotoImprovementRevision(product),
        extractionSource,
        extractionConfidence: null,
      }));
      logScanTiming(scanRequestId, "scanner_state_updated", {
        status: "success",
        matchedIngredientCount: matchedIngredients.length,
        unmatchedIngredientCount: unmatchedIngredients.length,
      });
      if (
        trimString(product?.scanDataSource) === "supplement_products_master" &&
        trimString(product?.productId) &&
        unmatchedIngredients.length
      ) {
        queueMissingActiveIngredients({
          productId: product.productId,
          ingredients: unmatchedIngredients,
        }).catch(() => {
          logBuildAwareDiagnostic(
            "warn",
            "[scanner] failed to queue missing active ingredients",
            {
              developmentDetails: { reason: "unexpected_queue_error" },
            },
          );
        });
      }

      finishClientProcessing({
        ingredientCount: ingredients.length,
        resultStatus: "success",
        success: true,
      });
      finishScanResolution({
        externalEnrichment:
          trimString(product?.scanDataSource) !==
          "supplement_products_master",
        masterDatabaseHit:
          trimString(product?.scanDataSource) ===
          "supplement_products_master",
        resultStatus: "success",
        success: true,
      });

      return get();
    } catch (error) {
      const normalized = normalizeBarcodeScanFailure(error);

      set(() => ({
        status: normalized.status,
        error: normalized.error,
        scanSessionId: nextScanSessionId,
        scanRequestId,
        latencyTraceId: latencyTrace.traceId,
        barcode: nextBarcode,
        barcodeType: nextBarcodeType,
        product: null,
        ingredients: [],
        matchedIngredients: [],
        matches: [],
        unmatchedIngredients: [],
        photoRescueStatus: "idle",
        photoRescueError: null,
        extractionSource: null,
        extractionConfidence: null,
      }));
      logScanTiming(scanRequestId, "scanner_state_updated", {
        status: normalized.status,
      });
      finishScanResolution({
        externalEnrichment: isRetailBarcodeType(nextBarcodeType),
        masterDatabaseHit: false,
        resultStatus: normalized.status,
        success: false,
        error,
      });

      return null;
    }
  },

  enhanceScanWithPhotos: async ({
    scanSessionId,
    ingredientsPhoto,
    latencyTraceId,
    productPhoto,
  }) => {
    const latencyTrace = createLatencyTrace({
      traceId:
        trimString(latencyTraceId) || createLatencyTraceId("photo_improvement"),
      flow: "photo_improvement",
      action: "improve_with_photos",
    });
    const finishStoreProcessing = latencyTrace.start(
      "client_store_processing_total",
    );
    const currentState = get();
    const requestedScanSessionId = Number.parseInt(
      String(scanSessionId ?? ""),
      10,
    );

    if (
      !Number.isFinite(requestedScanSessionId) ||
      requestedScanSessionId !== currentState.scanSessionId
    ) {
      const error = new Error(
        "That scan is no longer active. Please rescan the barcode and try again.",
      );
      error.category = SCANNER_FAILURE_CATEGORIES.expiredScanSession;
      error.code = "expired_scan_session";

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: normalizePhotoRescueFailure(error),
      }));

      finishStoreProcessing({ success: false, error });

      throw error;
    }

    const ingredientsImage = trimString(ingredientsPhoto);
    const productImage = trimString(productPhoto);

    if (!ingredientsImage || !productImage) {
      const error = new Error("Both photos are required to improve this scan.");
      error.category = SCANNER_FAILURE_CATEGORIES.backendValidationFailure;
      error.code = "missing_photo_payload";

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: normalizePhotoRescueFailure(error),
      }));

      finishStoreProcessing({ success: false, error });

      throw error;
    }

    set(() => ({
      photoRescueStatus: "processing",
      photoRescueError: null,
    }));

    try {
      logDevelopmentDiagnostic("info", "[scanner-photo-rescue] submitting", {
        hasExistingProductId: Boolean(
          trimString(currentState.product?.productId),
        ),
      });

      const extraction = await scanSupplementPhotos(
        {
          scanSessionId: String(requestedScanSessionId),
          barcode: currentState.barcode,
          barcodeType: currentState.barcodeType,
          productId: trimString(currentState.product?.productId) || undefined,
          currentProduct: currentState.product,
          ingredientsImage,
          productImage,
        },
        { telemetry: latencyTrace },
      );

      const finishAfterEdge = latencyTrace.start(
        "client_store_processing_after_edge_return",
      );
      const ingredients = extractIngredientCandidatesFromList(
        extraction.ingredients,
      );

      if (extraction.isSupplement === false) {
        throw createScannerFailure({
          category: SCANNER_FAILURE_CATEGORIES.aiExtractionFailure,
          code: "ai_extraction_failed",
          message:
            extraction.message ||
            "We couldn't confirm from those photos that this product is a supplement.",
        });
      }

      if (extraction.wroteCanonicalData && !trimString(extraction.productId)) {
        throw createScannerFailure({
          category: SCANNER_FAILURE_CATEGORIES.backendValidationFailure,
          code: "missing_canonical_product",
          message:
            "Photo rescue finished without returning a canonical supplement product.",
        });
      }

      let matchedIngredients = [];
      let matches = [];
      let unmatchedIngredients = ingredients;

      if (ingredients.length) {
        try {
          const catalogRows = await fetchIngredientMatchCatalog();
          const nextMatches = matchIngredientsToCatalog(
            ingredients,
            catalogRows,
          );
          matchedIngredients = nextMatches.matchedIngredients;
          matches = nextMatches.matches;
          unmatchedIngredients = nextMatches.unmatchedIngredients;
        } catch (matchError) {
          logBuildAwareDiagnostic(
            "warn",
            "[scanner-photo-rescue] ingredient catalog matching failed",
            {
              developmentDetails: {
                message:
                  typeof matchError?.message === "string"
                    ? matchError.message
                    : "Unknown error",
              },
            },
          );

          if (!extraction.wroteCanonicalData) {
            throw matchError;
          }
        }
      }

      if (!extraction.wroteCanonicalData && !ingredients.length) {
        throw createScannerFailure({
          category: SCANNER_FAILURE_CATEGORIES.aiExtractionFailure,
          code: "ai_extraction_failed",
          message:
            "We couldn't read any usable supplement ingredients from those photos.",
        });
      }

      const stateBeforeApply = get();
      const previousRevision = Math.max(
        Number.isSafeInteger(stateBeforeApply.photoRescueRevision)
          ? Math.max(0, stateBeforeApply.photoRescueRevision)
          : 0,
        getPhotoImprovementRevision(stateBeforeApply.product),
      );
      const resultRevision =
        Number.isSafeInteger(extraction.committedRevision) &&
        extraction.committedRevision > previousRevision
          ? extraction.committedRevision
          : previousRevision + 1;
      const previousHydrationKey = buildScanResultHydrationKey({
        scanRequestId: stateBeforeApply.scanRequestId,
        productId: stateBeforeApply.product?.productId,
        scanSessionId: requestedScanSessionId,
        resultRevision: previousRevision,
      });
      invalidateScanResultHydration(previousHydrationKey);

      set(() => ({
        status: "success",
        error: null,
        product: buildPhotoRescueProduct({
          barcode: currentState.barcode,
          currentProduct: currentState.product,
          productId: extraction.productId,
          displayName: extraction.displayName,
          productName: extraction.productName,
          ingredients: extraction.ingredients,
          servingSizeText: extraction.servingSizeText,
          wroteCanonicalData: extraction.wroteCanonicalData,
          resultRevision,
          acceptedAttemptId: extraction.acceptedAttemptId,
        }),
        ingredients,
        matchedIngredients,
        matches,
        unmatchedIngredients,
        photoRescueStatus: "success",
        photoRescueError: null,
        photoRescueRevision: resultRevision,
        extractionSource: extraction.source || "photo_rescue",
        extractionConfidence: Number.isFinite(
          extraction.classificationConfidence,
        )
          ? extraction.classificationConfidence
          : Number.isFinite(extraction.confidence)
            ? extraction.confidence
            : null,
      }));

      logDevelopmentDiagnostic("info", "[scanner-photo-rescue] completed", {
        createdProduct: extraction.createdProduct,
        wroteCanonicalData: extraction.wroteCanonicalData,
        unmatchedIngredientCount: unmatchedIngredients.length,
      });
      finishAfterEdge({
        ingredientCount: ingredients.length,
        resultStatus: "usable",
        success: true,
      });
      finishStoreProcessing({ resultStatus: "success", success: true });
      return get();
    } catch (error) {
      const normalized = normalizePhotoRescueFailure(error);

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: normalized,
      }));

      finishStoreProcessing({ success: false, error });

      throw normalized;
    }
  },
}));
