const OPEN_FOOD_FACTS_BASE_URL =
  "https://world.openfoodfacts.org/api/v0/product";

export const RETAIL_BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e"];
export const ALPHANUMERIC_BARCODE_TYPES = ["code128", "code39", "code93"];
const SAFE_ALPHANUMERIC_BARCODE_PATTERN = /^[A-Za-z0-9._-]{4,40}$/;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function canonicalizeBarcodeType(barcodeType) {
  const rawType = trimString(barcodeType);
  if (!rawType) {
    return "";
  }

  const lowered = rawType.toLowerCase();

  if (lowered.includes("ean13") || lowered.includes("ean-13")) {
    return "ean13";
  }

  if (lowered.includes("ean8") || lowered.includes("ean-8")) {
    return "ean8";
  }

  if (
    lowered.includes("upca") ||
    lowered.includes("upc-a") ||
    lowered.includes("upc_a")
  ) {
    return "upc_a";
  }

  if (
    lowered.includes("upce") ||
    lowered.includes("upc-e") ||
    lowered.includes("upc_e")
  ) {
    return "upc_e";
  }

  if (
    lowered.includes("code128") ||
    lowered.includes("code-128") ||
    lowered.includes("code_128")
  ) {
    return "code128";
  }

  if (
    lowered.includes("code39") ||
    lowered.includes("code-39") ||
    lowered.includes("code_39")
  ) {
    return "code39";
  }

  if (
    lowered.includes("code93") ||
    lowered.includes("code-93") ||
    lowered.includes("code_93")
  ) {
    return "code93";
  }

  return lowered;
}

export function normalizeBarcode(barcode, barcodeType) {
  const rawBarcode = trimString(barcode);
  const normalizedType = canonicalizeBarcodeType(barcodeType);

  // Retail EAN/UPC lookups rely on canonical digit-only barcodes.
  if (RETAIL_BARCODE_TYPES.includes(normalizedType)) {
    const cleaned = rawBarcode.replace(/\D/g, "");

    // Some scanners report UPC-A codes as ean13 but strip the leading 0.
    // Restore it so OpenFoodFacts receives the full EAN-13 barcode.
    if (normalizedType === "ean13" && /^\d{12}$/.test(cleaned)) {
      return `0${cleaned}`;
    }

    return cleaned;
  }

  // Code128/39/93 may encode manufacturer IDs with letters, so preserve them.
  if (ALPHANUMERIC_BARCODE_TYPES.includes(normalizedType)) {
    return rawBarcode;
  }

  return rawBarcode;
}

export function isValidBarcode(barcode, barcodeType) {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);
  const normalizedType = canonicalizeBarcodeType(barcodeType);

  if (normalizedType === "ean13") {
    return /^\d{13}$/.test(normalizedBarcode);
  }

  if (normalizedType === "ean8") {
    return /^\d{8}$/.test(normalizedBarcode);
  }

  if (normalizedType === "upc_a") {
    return /^\d{12}$/.test(normalizedBarcode);
  }

  if (normalizedType === "upc_e") {
    return /^\d{6,8}$/.test(normalizedBarcode);
  }

  if (ALPHANUMERIC_BARCODE_TYPES.includes(normalizedType)) {
    return SAFE_ALPHANUMERIC_BARCODE_PATTERN.test(normalizedBarcode);
  }

  // Unknown platform-specific types still need a safe character set, not
  // arbitrary trimmed strings, before we let them flow into the fallback UX.
  return SAFE_ALPHANUMERIC_BARCODE_PATTERN.test(normalizedBarcode);
}

export function isRetailBarcodeType(barcodeType) {
  return RETAIL_BARCODE_TYPES.includes(canonicalizeBarcodeType(barcodeType));
}

function createOpenFoodFactsError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function formatOpenFoodFactsIngredientLabel(ingredient, depth = 0) {
  if (!ingredient || typeof ingredient !== "object") {
    return "";
  }

  const text = trimString(ingredient.text);
  const id = trimString(ingredient.id).replace(/^[a-z]{2}:/i, "");
  const percent =
    typeof ingredient.percent_estimate === "number"
      ? ` (${ingredient.percent_estimate}%)`
      : "";
  const label = text || id;

  if (!label) {
    return "";
  }

  return `${"  ".repeat(depth)}${label}${percent}`;
}

function flattenOpenFoodFactsIngredients(ingredients, depth = 0) {
  if (!Array.isArray(ingredients)) {
    return [];
  }

  return ingredients.flatMap((ingredient) => {
    const label = formatOpenFoodFactsIngredientLabel(ingredient, depth);
    const nested = flattenOpenFoodFactsIngredients(
      ingredient?.ingredients,
      depth + 1
    );

    return [label, ...nested].filter(Boolean);
  });
}

export async function fetchOpenFoodFactsProduct(barcode, barcodeType) {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);

  if (!isValidBarcode(normalizedBarcode, barcodeType)) {
    throw createOpenFoodFactsError(
      "invalid_barcode",
      "That barcode could not be read."
    );
  }

  const response = await fetch(
    `${OPEN_FOOD_FACTS_BASE_URL}/${normalizedBarcode}.json`
  );

  if (!response.ok) {
    throw createOpenFoodFactsError(
      "open_food_facts_unavailable",
      "We couldn't check that product right now."
    );
  }

  const payload = await response.json();

  if (payload?.status === 0) {
    throw createOpenFoodFactsError(
      "product_not_found",
      "Sorry, we couldn't find that product, please take pictures to add it to the app"
    );
  }

  return {
    barcode: normalizedBarcode,
    productName: trimString(payload?.product?.product_name),
    ingredientsText: trimString(payload?.product?.ingredients_text),
    sourceIngredients: flattenOpenFoodFactsIngredients(
      payload?.product?.ingredients
    ),
    sourceStatus: typeof payload?.status === "number" ? payload.status : null,
    sourceStatusVerbose: trimString(payload?.status_verbose),
  };
}
