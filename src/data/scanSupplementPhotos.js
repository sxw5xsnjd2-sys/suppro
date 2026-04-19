import { getAccessTokenOrCreateSession } from "@src/lib/supabase";
import { SUPABASE_URL } from "@src/lib/runtimeConfig";

const FUNCTION_NAME = "scan-supplement-photos";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIngredients(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function scanSupplementPhotos(payload) {
  if (!SUPABASE_URL) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
  }

  const accessToken = await getAccessTokenOrCreateSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = "";

    try {
      const parsed = JSON.parse(errorText);
      errorMessage =
        normalizeString(parsed?.error) || normalizeString(parsed?.details);
    } catch {}

    throw new Error(errorMessage || errorText || "Photo scan request failed.");
  }

  const data = await response.json();

  return {
    productId: normalizeString(data?.productId),
    displayName: normalizeString(data?.displayName),
    productName: normalizeString(data?.productName),
    ingredients: normalizeIngredients(data?.ingredients),
    servingSizeText: normalizeString(data?.servingSizeText),
    source: normalizeString(data?.source) || "photo_rescue",
    confidence: normalizeNumber(data?.confidence),
    classificationConfidence: normalizeNumber(data?.classificationConfidence),
    createdProduct: Boolean(data?.createdProduct),
    wroteCanonicalData: Boolean(data?.wroteCanonicalData),
    isSupplement:
      typeof data?.isSupplement === "boolean" ? data.isSupplement : null,
    category: normalizeString(data?.category),
    message: normalizeString(data?.message),
    unresolvedIngredientCount: Number.isFinite(data?.unresolvedIngredientCount)
      ? data.unresolvedIngredientCount
      : 0,
    rawText: normalizeString(data?.rawText),
  };
}
