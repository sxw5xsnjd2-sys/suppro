import { create } from "zustand";
import {
  fetchOpenFoodFactsProduct,
  isValidBarcode,
  normalizeBarcode,
} from "@src/data/getOpenFoodFactsProduct";
import { fetchLocalBarcodeScanProduct } from "@src/data/getLocalBarcodeScanProduct";
import { fetchIngredientMatchCatalog } from "@src/data/getIngredientMatchCatalog";
import { queueMissingActiveIngredients } from "@src/data/queueMissingActiveIngredients";
import { scanSupplementPhotos } from "@src/data/scanSupplementPhotos";
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

function normalizePhotoRescueErrorMessage(value) {
  const message = trimString(value);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("scansessionid") ||
    normalized.includes("scan session") ||
    normalized.includes("scan is no longer active") ||
    normalized.includes("scan expired")
  ) {
    return "That scan expired. Rescan the barcode and try photo rescue again.";
  }

  if (
    normalized.includes("not a supplement") ||
    normalized.includes("couldn't confirm") ||
    normalized.includes("could not confirm")
  ) {
    return "We couldn't confirm from those photos that this product is a supplement.";
  }

  return message || "We could not improve that scan with the photos you captured.";
}

function createInitialState() {
  return {
    status: "idle",
    error: null,
    permissionState: null,
    scanSessionId: 0,
    barcode: "",
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

function normalizeScannerError(error) {
  const code = error?.code || "scanner_error";

  if (code === "invalid_barcode") {
    return {
      status: "error",
      error: {
        code,
        message: "That barcode could not be read. Try scanning again.",
      },
    };
  }

  if (code === "product_not_found") {
    return {
      status: "not_found",
      error: {
        code,
        message:
          "Sorry, we couldn't find that product, please take pictures to add it to the app",
      },
    };
  }

  if (code === "open_food_facts_unavailable") {
    return {
      status: "error",
      error: {
        code,
        message: "We couldn't connect, please try again.",
      },
    };
  }

  return {
    status: "error",
    error: {
      code,
      message:
        error?.message || "Something went wrong while processing that barcode.",
    },
  };
}

function shouldUseStructuredLocalIngredients(product) {
  return (
    trimString(product?.scanDataSource) === "supplement_products_master" &&
    Array.isArray(product?.sourceIngredients) &&
    product.sourceIngredients.length > 0
  );
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

  processBarcode: async (barcode) => {
    const nextBarcode = normalizeBarcode(barcode);
    const nextScanSessionId = get().scanSessionId + 1;

    if (!isValidBarcode(nextBarcode)) {
      const invalid = normalizeScannerError({ code: "invalid_barcode" });

      set(() => ({
        status: invalid.status,
        error: invalid.error,
        scanSessionId: nextScanSessionId,
        barcode: nextBarcode,
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

      try {
        product = await fetchLocalBarcodeScanProduct(nextBarcode);
        extractionSource = trimString(product?.scanDataSource) || null;
      } catch (localLookupError) {
        console.error(
          "Local barcode lookup failed; falling back to OpenFoodFacts",
          localLookupError
        );
      }

      if (!product) {
        product = await fetchOpenFoodFactsProduct(nextBarcode);
        extractionSource = "open_food_facts";
      }

      const ingredients = shouldUseStructuredLocalIngredients(product)
        ? extractIngredientCandidatesFromList(product.sourceIngredients)
        : extractBestIngredientCandidates(product);

      if (!product.ingredientsText || ingredients.length === 0) {
        set(() => ({
          status: "no_ingredients",
          error: null,
          scanSessionId: nextScanSessionId,
          barcode: nextBarcode,
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
        }).catch((queueError) => {
          console.warn(
            "[scanner] failed to queue missing active ingredients",
            queueError
          );
        });
      }

      return get();
    } catch (error) {
      const normalized = normalizeScannerError(error);

      set(() => ({
        status: normalized.status,
        error: normalized.error,
        scanSessionId: nextScanSessionId,
        barcode: nextBarcode,
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

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: error.message,
      }));

      throw error;
    }

    const ingredientsImage = trimString(ingredientsPhoto);
    const productImage = trimString(productPhoto);

    if (!ingredientsImage || !productImage) {
      const error = new Error("Both photos are required to improve this scan.");

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: error.message,
      }));

      throw error;
    }

    set(() => ({
      photoRescueStatus: "processing",
      photoRescueError: null,
    }));

    try {
      console.info("[scanner-photo-rescue] submitting", {
        scanSessionId: requestedScanSessionId,
        barcode: currentState.barcode,
        hasExistingProductId: Boolean(trimString(currentState.product?.productId)),
      });

      const extraction = await scanSupplementPhotos({
        scanSessionId: String(requestedScanSessionId),
        barcode: currentState.barcode,
        productId: trimString(currentState.product?.productId) || undefined,
        currentProduct: currentState.product,
        ingredientsImage,
        productImage,
      });

      const ingredients = extractIngredientCandidatesFromList(
        extraction.ingredients
      );

      if (extraction.isSupplement === false) {
        throw new Error(
          extraction.message ||
            "We couldn't confirm from those photos that this product is a supplement."
        );
      }

      if (extraction.wroteCanonicalData && !trimString(extraction.productId)) {
        throw new Error(
          "Photo rescue finished without returning a canonical supplement product."
        );
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
          console.error(
            "[scanner-photo-rescue] ingredient catalog matching failed",
            matchError
          );

          if (!extraction.wroteCanonicalData) {
            throw matchError;
          }
        }
      }

      if (!extraction.wroteCanonicalData && !ingredients.length) {
        throw new Error(
          "We couldn't read any usable supplement ingredients from those photos."
        );
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

      console.info("[scanner-photo-rescue] completed", {
        productId: extraction.productId || null,
        createdProduct: extraction.createdProduct,
        wroteCanonicalData: extraction.wroteCanonicalData,
        unmatchedIngredientCount: unmatchedIngredients.length,
      });

      return get();
    } catch (error) {
      const message = normalizePhotoRescueErrorMessage(
        error instanceof Error ? error.message : ""
      );

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: message,
      }));

      throw new Error(message);
    }
  },
}));
