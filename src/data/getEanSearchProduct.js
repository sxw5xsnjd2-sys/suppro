import {
  EAN_SEARCH_TOKEN,
  logBuildAwareDiagnostic,
} from "@src/lib/runtimeConfig";
import {
  isValidBarcode,
  normalizeBarcode,
} from "./getOpenFoodFactsProduct";

const EAN_SEARCH_BASE_URL = "https://api.ean-search.org/api";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createEanSearchError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function firstNonEmptyString(candidates) {
  for (const candidate of candidates) {
    const value = trimString(candidate);
    if (value) {
      return value;
    }
  }

  return "";
}

function getImageUrl(product) {
  const directImage = firstNonEmptyString([
    product?.image,
    product?.imageUrl,
    product?.image_url,
    product?.imageLink,
    product?.image_link,
    product?.picture,
    product?.photo,
  ]);
  if (directImage) {
    return directImage;
  }

  if (Array.isArray(product?.images)) {
    return firstNonEmptyString(product.images);
  }

  return "";
}

function getFirstProduct(payload) {
  if (!Array.isArray(payload)) {
    return null;
  }

  return payload.find((item) => item && typeof item === "object") ?? null;
}

export async function fetchEanSearchProduct(barcode, barcodeType) {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);

  if (!isValidBarcode(normalizedBarcode, barcodeType)) {
    throw createEanSearchError(
      "invalid_barcode",
      "That barcode could not be read."
    );
  }

  if (!EAN_SEARCH_TOKEN) {
    logBuildAwareDiagnostic(
      "warn",
      "[scanner-source] EAN-Search lookup skipped: token is not configured",
      {
        developmentDetails: {
          acceptedEnvironmentVariables: ["EXPO_PUBLIC_EAN_SEARCH_TOKEN"],
        },
      }
    );
    return null;
  }

  const url = new URL(EAN_SEARCH_BASE_URL);
  url.searchParams.set("op", "barcode-lookup");
  url.searchParams.set("format", "json");
  url.searchParams.set("token", EAN_SEARCH_TOKEN);
  url.searchParams.set("ean", normalizedBarcode);

  const response = await fetch(url.toString());

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw createEanSearchError(
      response.status === 401 || response.status === 403
        ? "ean_search_unauthorized"
        : response.status === 402
          ? "ean_search_payment_required"
          : response.status === 429
            ? "ean_search_rate_limited"
            : "ean_search_unavailable",
      "We couldn't check EAN-Search right now.",
      response.status
    );
  }

  const product = getFirstProduct(await response.json());

  if (!product) {
    return null;
  }

  const productName = trimString(product.name);

  if (!productName) {
    return null;
  }

  const imageUrl = getImageUrl(product);

  return {
    productName,
    name: productName,
    brand: "",
    barcode: trimString(product.ean) || normalizedBarcode,
    categoryId: trimString(product.categoryId) || null,
    categoryName: trimString(product.categoryName) || null,
    googleCategoryId: trimString(product.googleCategoryId) || null,
    issuingCountry: trimString(product.issuingCountry) || null,
    imageUrl: imageUrl || null,
    imageSourceUrl: imageUrl || null,
    imageProvider: imageUrl ? "ean_search" : null,
    ingredientsText: "",
    sourceIngredients: [],
    active_ingredients_json: [],
    activeIngredientsJson: [],
    ingredient_count: 0,
    ingredientCount: 0,
    sourceStatus: 1,
    sourceStatusVerbose: "ean_search",
    scanDataSource: "ean_search",
    source: "ean_search",
    verificationStatus: "ean_search_unverified",
    verification_status: "ean_search_unverified",
  };
}
