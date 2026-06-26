import {
  GO_UPC_API_KEY,
  logBuildAwareDiagnostic,
} from "@src/lib/runtimeConfig";
import {
  isValidBarcode,
  normalizeBarcode,
} from "./getOpenFoodFactsProduct";

const GO_UPC_BASE_URL = "https://go-upc.com/api/v1/code";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createGoUpcError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getIngredientsText(product) {
  if (typeof product?.ingredients === "string") {
    return trimString(product.ingredients);
  }

  return trimString(product?.ingredients?.text);
}

export async function fetchGoUpcProduct(barcode, barcodeType) {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);

  if (!isValidBarcode(normalizedBarcode, barcodeType)) {
    throw createGoUpcError(
      "invalid_barcode",
      "That barcode could not be read."
    );
  }

  if (!GO_UPC_API_KEY) {
    logBuildAwareDiagnostic(
      "warn",
      "[scanner-source] Go-UPC lookup skipped: API key is not configured",
      {
        developmentDetails: {
          acceptedEnvironmentVariables: [
            "EXPO_PUBLIC_GO_UPC_API_KEY",
            "GO_UPC_API_KEY",
          ],
        },
      }
    );
    return null;
  }

  const response = await fetch(
    `${GO_UPC_BASE_URL}/${encodeURIComponent(normalizedBarcode)}`,
    {
      headers: {
        Authorization: `Bearer ${GO_UPC_API_KEY}`,
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw createGoUpcError(
      response.status === 401 || response.status === 403
        ? "go_upc_unauthorized"
        : response.status === 429
          ? "go_upc_rate_limited"
          : "go_upc_unavailable",
      "We couldn't check Go-UPC right now.",
      response.status
    );
  }

  const payload = await response.json();
  const product = payload?.product;

  if (!product || typeof product !== "object") {
    return null;
  }

  const brand = trimString(product.brand);
  const productName = trimString(product.name) || brand;

  if (!productName) {
    return null;
  }

  return {
    productName,
    name: productName,
    brand,
    barcode: trimString(payload?.code) || normalizedBarcode,
    imageUrl: trimString(product.imageUrl),
    imageSourceUrl: trimString(product.imageUrl),
    ingredientsText: getIngredientsText(product),
    sourceIngredients: [],
    sourceStatus: 1,
    sourceStatusVerbose: "go_upc",
    scanDataSource: "go_upc",
    source: "go_upc",
    verificationStatus: "go_upc_unverified",
  };
}
