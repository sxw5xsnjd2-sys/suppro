const OPEN_FOOD_FACTS_BASE_URL =
  "https://world.openfoodfacts.org/api/v0/product";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeBarcode(barcode) {
  return String(barcode ?? "").replace(/\D/g, "");
}

export function isValidBarcode(barcode) {
  const normalizedBarcode = normalizeBarcode(barcode);
  return /^\d{8,18}$/.test(normalizedBarcode);
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
    const nested = flattenOpenFoodFactsIngredients(ingredient?.ingredients, depth + 1);

    return [label, ...nested].filter(Boolean);
  });
}

export async function fetchOpenFoodFactsProduct(barcode) {
  const normalizedBarcode = normalizeBarcode(barcode);

  if (!isValidBarcode(normalizedBarcode)) {
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
