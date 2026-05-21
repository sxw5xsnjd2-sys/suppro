import { create } from "zustand";
import {
  canonicalizeBarcodeType,
  fetchOpenFoodFactsProduct,
  isRetailBarcodeType,
  isValidBarcode,
  normalizeBarcode,
} from "@src/data/getOpenFoodFactsProduct";
import { fetchLocalBarcodeScanProduct } from "@src/data/getLocalBarcodeScanProduct";
import {
  buildScanDebugMetadata,
  getOpenFoodFactsQuality,
  shouldCheckDsld,
} from "@src/data/dsldSourceDecision";
import { maybeFetchDsldScanMatch } from "@src/data/getDsldScanProduct";
import { fetchIngredientMatchCatalog } from "@src/data/getIngredientMatchCatalog";
import { queueMissingActiveIngredients } from "@src/data/queueMissingActiveIngredients";
import { scanSupplementPhotos } from "@src/data/scanSupplementPhotos";
import {
  buildPartialProductDetailFailure,
  createScannerFailure,
  normalizeBarcodeScanFailure,
  normalizePhotoRescueFailure,
  SCANNER_FAILURE_CATEGORIES,
} from "@src/lib/scannerFailure";
import {
  ENABLE_DSLD_LOOKUP,
  logBuildAwareDiagnostic,
  logDevelopmentDiagnostic,
} from "@src/lib/runtimeConfig";
import {
  extractIngredientCandidatesFromList,
  extractBestIngredientCandidates,
  matchIngredientsToCatalog,
} from "./ingredientMatching";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
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
    typeof ingredient.dosageValue === "number" && Number.isFinite(ingredient.dosageValue)
      ? ingredient.dosageValue
      : typeof ingredient.dosage_value === "number" && Number.isFinite(ingredient.dosage_value)
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
    ...(currentProduct && typeof currentProduct === "object" ? currentProduct : {}),
    barcode: trimString(barcode) || trimString(currentProduct?.barcode),
    productId: trimString(productId) || trimString(currentProduct?.productId) || null,
    productName: nextProductName,
    name: nextProductName,
    ingredientsText:
      ingredientDisplayNames.join(", ") || trimString(currentProduct?.ingredientsText),
    sourceIngredients: nextSourceIngredients,
    sourceStatus:
      typeof currentProduct?.sourceStatus === "number"
        ? currentProduct.sourceStatus
        : 1,
    sourceStatusVerbose:
      wroteCanonicalData
        ? "photo_rescue_canonical"
        : trimString(currentProduct?.sourceStatusVerbose) || "photo_rescue",
    scanDataSource: wroteCanonicalData
      ? "supplement_products_master"
      : trimString(currentProduct?.scanDataSource) || "photo_rescue",
    servingSizeText:
      trimString(servingSizeText) || trimString(currentProduct?.servingSizeText),
  };
}

function createInitialState() {
  return {
    status: "idle",
    error: null,
    permissionState: null,
    scanSessionId: 0,
    barcode: "",
    barcodeType: null,
    product: null,
    ingredients: [],
    matchedIngredients: [],
    matches: [],
    unmatchedIngredients: [],
    photoRescueStatus: "idle",
    photoRescueError: null,
    extractionSource: null,
    extractionConfidence: null,
  };
}

function shouldUseStructuredLocalIngredients(product) {
  return (
    trimString(product?.scanDataSource) === "supplement_products_master" &&
    Array.isArray(product?.sourceIngredients) &&
    product.sourceIngredients.length > 0
  );
}

function buildDsldSecondaryProduct({
  barcode,
  product,
  dsldMatch,
  sourceDecision,
}) {
  return {
    ...(product && typeof product === "object" ? product : {}),
    barcode: trimString(barcode) || trimString(product?.barcode),
    productName: trimString(product?.productName) || null,
    ingredientsText: trimString(product?.ingredientsText) || "",
    sourceIngredients: Array.isArray(product?.sourceIngredients)
      ? product.sourceIngredients
      : [],
    sourceStatus:
      typeof product?.sourceStatus === "number" ? product.sourceStatus : null,
    sourceStatusVerbose: trimString(product?.sourceStatusVerbose) || null,
    scanDataSource: trimString(product?.scanDataSource) || "open_food_facts",
    dsldMatch,
    sourceDecision,
  };
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
    set(() => ({
      photoRescueStatus: "idle",
      photoRescueError: null,
    })),

  processBarcode: async (barcode, barcodeType) => {
    const nextBarcode = normalizeBarcode(barcode, barcodeType);
    const nextBarcodeType = canonicalizeBarcodeType(barcodeType) || null;
    const nextScanSessionId = get().scanSessionId + 1;

    if (!isValidBarcode(nextBarcode, nextBarcodeType)) {
      const invalid = normalizeScannerError({ code: "invalid_barcode" });

      set(() => ({
        status: invalid.status,
        error: invalid.error,
        scanSessionId: nextScanSessionId,
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

      return null;
    }

    set(() => ({
      status: "processing",
      error: null,
      scanSessionId: nextScanSessionId,
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

    try {
      let product = null;
      let extractionSource = null;
      const retailBarcode = isRetailBarcodeType(nextBarcodeType);
      let offFound = false;
      let offQuality = "missing";
      let dsldChecked = false;
      let dsldCacheHit = false;
      let dsldConfidence = null;

      try {
        product = await fetchLocalBarcodeScanProduct(nextBarcode, nextBarcodeType);
        extractionSource = trimString(product?.scanDataSource) || null;
      } catch (localLookupError) {
        logBuildAwareDiagnostic(
          "warn",
          "[scanner] local barcode lookup failed; falling back to OpenFoodFacts",
          {
            developmentDetails: {
              message:
                typeof localLookupError?.message === "string"
                  ? localLookupError.message
                  : "Unknown error",
            },
          }
        );
      }

      if (!product && !retailBarcode) {
        const notFound = normalizeBarcodeScanFailure({
          code: "product_not_found",
        });

        set(() => ({
          status: notFound.status,
          error: notFound.error,
          scanSessionId: nextScanSessionId,
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

        return null;
      }

      if (!product) {
        try {
          product = await fetchOpenFoodFactsProduct(nextBarcode, nextBarcodeType);
          extractionSource = "open_food_facts";
          offFound = Boolean(product);
          offQuality = getOpenFoodFactsQuality(product);
        } catch (openFoodFactsError) {
          offFound = false;
          offQuality = "missing";

          const dsldResult = await maybeFetchDsldScanMatch({
            barcode: nextBarcode,
            barcodeType: nextBarcodeType,
            productName: "",
          });
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
            extractionSource = "open_food_facts";
            logDevelopmentDiagnostic(
              "log",
              "[scanner-source-decision]",
              sourceDecision
            );
          } else {
            throw openFoodFactsError;
          }
        }
      }

      if (product && shouldCheckDsld({
        barcode: nextBarcode,
        featureEnabled: ENABLE_DSLD_LOOKUP,
        primaryProduct: product,
        openFoodFactsQuality: offQuality,
      })) {
        const dsldResult = await maybeFetchDsldScanMatch({
          barcode: nextBarcode,
          barcodeType: nextBarcodeType,
          productName: trimString(product?.productName),
        });
        dsldChecked = dsldResult.checked;
        dsldCacheHit = dsldResult.cacheHit;
        dsldConfidence = dsldResult.confidence;

        if (dsldResult.dsldMatch) {
          product = {
            ...product,
            dsldMatch: dsldResult.dsldMatch,
          };
        }
      }

      const ingredients = shouldUseStructuredLocalIngredients(product)
        ? extractIngredientCandidatesFromList(product.sourceIngredients)
        : extractBestIngredientCandidates(product);

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
          trimString(product?.scanDataSource) === "supplement_products_master" ||
          trimString(product?.scanDataSource) === "off_products"
            ? trimString(product.scanDataSource)
            : trimString(product?.dsldMatch?.source)
              ? "open_food_facts_with_dsld"
              : trimString(product?.scanDataSource) === "open_food_facts"
                ? "open_food_facts"
                : "photo_fallback_pending",
      });
      if (product && typeof product === "object") {
        product = {
          ...product,
          sourceDecision,
        };
      }
      logDevelopmentDiagnostic("log", "[scanner-source-decision]", sourceDecision);

      if (!product.ingredientsText || ingredients.length === 0) {
        set(() => ({
          status: "no_ingredients",
          error: buildPartialProductDetailFailure(),
          scanSessionId: nextScanSessionId,
          barcode: nextBarcode,
          barcodeType: nextBarcodeType,
          product,
          ingredients: [],
          matchedIngredients: [],
          matches: [],
          unmatchedIngredients: [],
          photoRescueStatus: "idle",
          photoRescueError: null,
          extractionSource,
          extractionConfidence: null,
        }));

        return get();
      }

      const catalogRows = await fetchIngredientMatchCatalog();
      const { matchedIngredients, matches, unmatchedIngredients } =
        matchIngredientsToCatalog(ingredients, catalogRows);

      set(() => ({
        status: "success",
        error: null,
        scanSessionId: nextScanSessionId,
        barcode: nextBarcode,
        barcodeType: nextBarcodeType,
        product,
        ingredients,
        matchedIngredients,
        matches,
        unmatchedIngredients,
        photoRescueStatus: "idle",
        photoRescueError: null,
        extractionSource,
        extractionConfidence: null,
      }));

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
            }
          );
        });
      }

      return get();
    } catch (error) {
      const normalized = normalizeBarcodeScanFailure(error);

      set(() => ({
        status: normalized.status,
        error: normalized.error,
        scanSessionId: nextScanSessionId,
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

      return null;
    }
  },

  enhanceScanWithPhotos: async ({
    scanSessionId,
    ingredientsPhoto,
    productPhoto,
  }) => {
    const currentState = get();
    const requestedScanSessionId = Number.parseInt(
      String(scanSessionId ?? ""),
      10
    );

    if (
      !Number.isFinite(requestedScanSessionId) ||
      requestedScanSessionId !== currentState.scanSessionId
    ) {
      const error = new Error(
        "That scan is no longer active. Please rescan the barcode and try again."
      );
      error.category = SCANNER_FAILURE_CATEGORIES.expiredScanSession;
      error.code = "expired_scan_session";

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: normalizePhotoRescueFailure(error),
      }));

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

      throw error;
    }

    set(() => ({
      photoRescueStatus: "processing",
      photoRescueError: null,
    }));

    try {
      logDevelopmentDiagnostic("info", "[scanner-photo-rescue] submitting", {
        hasExistingProductId: Boolean(trimString(currentState.product?.productId)),
      });

      const extraction = await scanSupplementPhotos({
        scanSessionId: String(requestedScanSessionId),
        barcode: currentState.barcode,
        barcodeType: currentState.barcodeType,
        productId: trimString(currentState.product?.productId) || undefined,
        currentProduct: currentState.product,
        ingredientsImage,
        productImage,
      });

      const ingredients = extractIngredientCandidatesFromList(
        extraction.ingredients
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
          const nextMatches = matchIngredientsToCatalog(ingredients, catalogRows);
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
            }
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
        }),
        ingredients,
        matchedIngredients,
        matches,
        unmatchedIngredients,
        photoRescueStatus: "success",
        photoRescueError: null,
        extractionSource: extraction.source || "photo_rescue",
        extractionConfidence: Number.isFinite(extraction.classificationConfidence)
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

      return get();
    } catch (error) {
      const normalized = normalizePhotoRescueFailure(error);

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: normalized,
      }));

      throw normalized;
    }
  },
}));
