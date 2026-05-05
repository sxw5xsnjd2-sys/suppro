import { getAccessTokenOrCreateSession } from "@src/lib/supabase";
import { SUPABASE_URL } from "@src/lib/runtimeConfig";

const FUNCTION_NAME = "scan-supplement-photos";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIngredient(item) {
  if (typeof item === "string") {
    return normalizeString(item);
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const name =
    normalizeString(item.name) ||
    normalizeString(item.canonicalName) ||
    normalizeString(item.canonical_name) ||
    normalizeString(item.raw_name);

  if (!name) {
    return null;
  }

  const rawDoseConfidence = item.doseConfidence ?? item.dose_confidence ?? null;
  const doseConfidence = ["verified", "unverified", "missing"].includes(
    rawDoseConfidence
  )
    ? rawDoseConfidence
    : null;

  return {
    name,
    dosageValue: normalizeNumber(item.dosageValue ?? item.dosage_value),
    dosageUnit: normalizeString(item.dosageUnit ?? item.dosage_unit) || null,
    dosageDisplay:
      normalizeString(
        item.dosageDisplay ??
          item.dosage_display ??
          item.dosageOriginalText ??
          item.dosage_original_text
      ) || null,
    chemicalForm:
      normalizeString(item.chemicalForm ?? item.chemical_form) || null,
    amountBasis: normalizeString(item.amountBasis ?? item.amount_basis) || null,
    doseConfidence,
    doseReviewReason:
      normalizeString(item.doseReviewReason ?? item.dose_review_reason) || null,
  };
}

function normalizeIngredients(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeIngredient(item)).filter(Boolean);
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

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    console.log("scan-supplement-photos error response", {
      status: response.status,
      statusText: response.statusText,
      errorText,
    });

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
