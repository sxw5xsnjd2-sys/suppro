const OPEN_FOOD_FACTS_BASE_URL =
  "https://world.openfoodfacts.org/api/v3.6/product";
const OPEN_FOOD_FACTS_USER_AGENT = "Suppro/1.0 (support@suppro.co.uk)";
const OPEN_FOOD_FACTS_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "brands",
  "quantity",
  "ingredients_text",
  "ingredients_text_en",
  "image_url",
  "selected_images",
  "categories_tags",
  "status",
  "status_verbose",
];

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

function createOpenFoodFactsError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function fetchOpenFoodFactsProduct(barcode, barcodeType) {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);

  if (!isValidBarcode(normalizedBarcode, barcodeType)) {
    throw createOpenFoodFactsError(
      "invalid_barcode",
      "That barcode could not be read.",
    );
  }

  const url = new URL(
    `${OPEN_FOOD_FACTS_BASE_URL}/${encodeURIComponent(normalizedBarcode)}.json`,
  );
  url.searchParams.set("fields", OPEN_FOOD_FACTS_FIELDS.join(","));

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": OPEN_FOOD_FACTS_USER_AGENT,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    if (response.status === 429 || response.status === 503) {
      throw createOpenFoodFactsError(
        response.status === 429
          ? "open_food_facts_rate_limited"
          : "open_food_facts_unavailable",
        "Open Food Facts did not return a usable product.",
        response.status,
      );
    }

    throw createOpenFoodFactsError(
      "open_food_facts_unavailable",
      "Open Food Facts did not return a usable product.",
      response.status,
    );
  }

  const payload = await response.json();

  if (payload?.status === 0 || !payload?.product) {
    return null;
  }

  const product = payload.product;
  const productName =
    trimString(product.product_name) || trimString(product.product_name_en);
  const imageUrl =
    trimString(product.image_url) ||
    trimString(product.selected_images?.front?.display?.en) ||
    trimString(product.selected_images?.front?.display?.fr) ||
    trimString(product.selected_images?.front?.small?.en) ||
    trimString(product.selected_images?.front?.small?.fr);
  const ingredientsText =
    trimString(product.ingredients_text) ||
    trimString(product.ingredients_text_en);

  if (!productName) {
    return null;
  }

  return {
    barcode: normalizedBarcode,
    productName,
    name: productName,
    brand: trimString(product.brands),
    servingSizeText: trimString(product.quantity) || null,
    ingredientsText,
    sourceIngredients: [],
    sourceStatus: 1,
    sourceStatusVerbose: "open_food_facts",
    scanDataSource: "open_food_facts",
    source: "open_food_facts",
    imageUrl: imageUrl || null,
    imageSourceUrl: imageUrl || null,
    imageProvider: imageUrl ? "open_food_facts" : null,
    categoryTags: Array.isArray(product.categories_tags)
      ? product.categories_tags.filter(Boolean)
      : [],
    categoriesTags: Array.isArray(product.categories_tags)
      ? product.categories_tags.filter(Boolean)
      : [],
    active_ingredients_json: [],
    activeIngredientsJson: [],
    ingredient_count: 0,
    ingredientCount: 0,
    verificationStatus: "open_food_facts_unverified",
    verification_status: "open_food_facts_unverified",
    hasIncompleteDetails: true,
  };
}
