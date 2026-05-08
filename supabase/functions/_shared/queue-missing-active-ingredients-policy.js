function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const MAX_REQUEST_BYTES = 12_000;
const MAX_PRODUCT_ID_LENGTH = 120;
const MAX_INGREDIENTS = 25;
const MAX_INGREDIENT_NAME_LENGTH = 160;
const FORBIDDEN_REQUEST_KEYS = new Set([
  "admin",
  "deepSearch",
  "force",
  "payload",
  "reviewType",
  "review_type",
  "status",
  "trusted",
]);

function getByteLength(value) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(String(value ?? "")).length;
  }

  return String(value ?? "").length;
}

function normalizePlainText(value) {
  return trimString(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9µμ%.,/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDosageFragments(value) {
  return value
    .replace(/\b\d+([.,]\d+)?\s*(mcg|mg|g|ml|iu|cfu|ug|µg|μg)\b/gi, " ")
    .replace(/\bproviding\b.*$/gi, " ")
    .replace(/\(\s*providing[^)]*\)/gi, " ")
    .replace(/\(\s*\d+[^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLabelWrappers(value) {
  return value
    .replace(/\bingredients?\b:?/gi, " ")
    .replace(/\bcontains\b:?/gi, " ")
    .replace(/\bfood supplement\b/gi, " ")
    .replace(/\bsupplement facts\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBroadIngredientName(value) {
  let normalized = normalizePlainText(value);
  normalized = stripDosageFragments(normalized);
  normalized = stripLabelWrappers(normalized);
  normalized = normalized.replace(/\bvit\.?(?=\s|$)/g, "vitamin");
  return normalized.replace(/\s+/g, " ").trim();
}

function ingredientDisplayName(value) {
  if (typeof value === "string") return trimString(value);
  if (!value || typeof value !== "object") return "";

  return (
    trimString(value.name) ||
    trimString(value.canonicalName) ||
    trimString(value.canonical_name) ||
    trimString(value.rawName) ||
    trimString(value.raw_name)
  );
}

function buildInvalidPayloadResponse(message, code = "invalid_request_payload") {
  return {
    ok: false,
    status: 400,
    body: {
      error: message,
      code,
    },
  };
}

export function validateQueueMissingActiveIngredientsRequest(rawBodyText) {
  const bodyText = typeof rawBodyText === "string" ? rawBodyText : "";

  if (!bodyText.trim()) {
    return buildInvalidPayloadResponse("Missing request body.");
  }

  if (getByteLength(bodyText) > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      status: 413,
      body: {
        error: "Request payload is too large.",
        code: "payload_too_large",
      },
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return buildInvalidPayloadResponse("Request body must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return buildInvalidPayloadResponse("Request body must be a JSON object.");
  }

  for (const key of Object.keys(parsed)) {
    if (FORBIDDEN_REQUEST_KEYS.has(key)) {
      return buildInvalidPayloadResponse("Request contains unsupported fields.");
    }
  }

  const productId = trimString(parsed.productId);
  if (!productId || productId.length > MAX_PRODUCT_ID_LENGTH) {
    return buildInvalidPayloadResponse("Missing or invalid productId.");
  }

  if (!Array.isArray(parsed.ingredients)) {
    return buildInvalidPayloadResponse("ingredients must be an array.");
  }

  const byName = new Map();
  for (const item of parsed.ingredients.slice(0, MAX_INGREDIENTS)) {
    const displayName = ingredientDisplayName(item).slice(
      0,
      MAX_INGREDIENT_NAME_LENGTH
    );
    const normalizedName = normalizeBroadIngredientName(displayName);
    if (!displayName || !normalizedName) continue;

    if (!byName.has(normalizedName)) {
      byName.set(normalizedName, {
        normalized_name: normalizedName,
        display_name: displayName,
      });
    }
  }

  const ingredients = Array.from(byName.values());
  if (!ingredients.length) {
    return buildInvalidPayloadResponse(
      "No usable ingredient names were provided."
    );
  }

  return {
    ok: true,
    value: {
      productId,
      ingredients,
    },
  };
}
