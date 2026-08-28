import { getAccessTokenOrCreateSession } from "@src/lib/supabase";
import { normalizeEdgeFunctionError } from "@src/lib/edgeFunctionErrors";
import {
  createScannerFailure,
  SCANNER_FAILURE_CATEGORIES,
} from "@src/lib/scannerFailure";
import { logBuildAwareDiagnostic, SUPABASE_URL } from "@src/lib/runtimeConfig";
import { getLatencyTraceHeaders } from "@src/lib/latencyTelemetry";

const FUNCTION_NAME = "scan-supplement-photos";
const TRAILING_DOSE_PATTERN =
  /^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|μg|ug|pg|g|kg|ml|l|iu|cfu)\b(?:\s*(?:[A-Z]{1,4}|% ?NRV|NRV))?$/i;
const DOSE_ONLY_PATTERN =
  /^(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|μg|ug|pg|g|kg|ml|l|iu|cfu)\b(?:\s*(?:[A-Z]{1,4}|% ?NRV|NRV))?$/i;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDoseUnit(value) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[µμ]/g, "u");

  if (!normalized) {
    return null;
  }

  if (normalized === "ug") return "mcg";
  if (normalized === "iu") return "IU";
  if (normalized === "cfu") return "CFU";
  return normalized;
}

function formatDoseDisplay(value, unit) {
  if (!Number.isFinite(value) || !unit) {
    return null;
  }

  const displayValue = Number.isInteger(value) ? String(value) : String(value);
  return `${displayValue} ${unit}`;
}

function findFirstFiniteNumber(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function findFirstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function readDoseCandidate(source) {
  if (!source || typeof source !== "object") {
    return {
      dosageValue: null,
      dosageUnit: null,
      dosageDisplay: null,
      amountBasis: null,
    };
  }

  return {
    dosageValue: normalizeNumber(
      source.dosageValue ??
        source.dosage_value ??
        source.amountValue ??
        source.amount_value ??
        source.value ??
        source.amount
    ),
    dosageUnit: normalizeDoseUnit(
      source.dosageUnit ??
        source.dosage_unit ??
        source.amountUnit ??
        source.amount_unit ??
        source.unit
    ),
    dosageDisplay: findFirstNonEmptyString(
      source.dosageDisplay,
      source.dosage_display,
      source.dosageOriginalText,
      source.dosage_original_text,
      source.display,
      source.originalText,
      source.original_text,
      source.text,
      source.label
    ),
    amountBasis: findFirstNonEmptyString(
      source.amountBasis,
      source.amount_basis
    ),
  };
}

function parseDoseDisplayText(value) {
  const text = normalizeString(value);
  if (!text) {
    return null;
  }

  const match = text.match(DOSE_ONLY_PATTERN);
  if (!match) {
    return null;
  }

  const dosageValue = normalizeNumber(match[1]);
  const dosageUnit = normalizeDoseUnit(match[2]);

  if (!Number.isFinite(dosageValue) || !dosageUnit) {
    return null;
  }

  return {
    dosageValue,
    dosageUnit,
    dosageDisplay: formatDoseDisplay(dosageValue, dosageUnit),
  };
}

function parseTrailingDoseFromText(value) {
  const text = normalizeString(value);
  if (!text) {
    return null;
  }

  const match = text.match(TRAILING_DOSE_PATTERN);
  if (!match) {
    return null;
  }

  const name = normalizeString(match[1]).replace(/[-,;:]+$/g, "").trim();
  const dosageValue = normalizeNumber(match[2]);
  const dosageUnit = normalizeDoseUnit(match[3]);

  if (!name || !Number.isFinite(dosageValue) || !dosageUnit) {
    return null;
  }

  return {
    name,
    dosageValue,
    dosageUnit,
    dosageDisplay: formatDoseDisplay(dosageValue, dosageUnit),
  };
}

export function normalizePhotoRescueIngredient(item) {
  if (typeof item === "string") {
    const parsed = parseTrailingDoseFromText(item);
    const cleanedName = parsed?.name || normalizeString(item);

    return cleanedName
      ? {
          name: cleanedName,
          raw_name: cleanedName,
          dosageValue: parsed?.dosageValue ?? null,
          dosageUnit: parsed?.dosageUnit ?? null,
          dosageDisplay: parsed?.dosageDisplay ?? null,
          chemicalForm: null,
          amountBasis: null,
          doseConfidence: null,
          doseReviewReason: null,
        }
      : null;
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const rawName =
    normalizeString(item.name) ||
    normalizeString(item.raw_name) ||
    normalizeString(item.rawName) ||
    normalizeString(item.canonicalName) ||
    normalizeString(item.canonical_name);
  const parsedFromName = parseTrailingDoseFromText(rawName);
  const rootDose = readDoseCandidate(item);
  const nestedDoseCandidates = [
    readDoseCandidate(item.dosage),
    readDoseCandidate(item.dose),
    readDoseCandidate(item.amount),
    readDoseCandidate(item.quantity),
  ];
  const explicitValue = findFirstFiniteNumber(
    rootDose.dosageValue,
    ...nestedDoseCandidates.map((candidate) => candidate.dosageValue)
  );
  const explicitUnit = findFirstNonEmptyString(
    rootDose.dosageUnit,
    ...nestedDoseCandidates.map((candidate) => candidate.dosageUnit)
  );
  const explicitDisplay = findFirstNonEmptyString(
    rootDose.dosageDisplay,
    ...nestedDoseCandidates.map((candidate) => candidate.dosageDisplay)
  );
  const hasExplicitDose =
    Number.isFinite(explicitValue) && Boolean(explicitUnit);
  const parsedFromDisplay = parseDoseDisplayText(explicitDisplay);
  const name = parsedFromName?.name || rawName;
  const dosageValue = hasExplicitDose
    ? explicitValue
    : parsedFromName?.dosageValue ?? parsedFromDisplay?.dosageValue ?? null;
  const dosageUnit = hasExplicitDose
    ? explicitUnit
    : parsedFromName?.dosageUnit ?? parsedFromDisplay?.dosageUnit ?? null;
  const dosageDisplay =
    explicitDisplay &&
    normalizeString(explicitDisplay).toLowerCase() !== rawName.toLowerCase()
      ? explicitDisplay
      : formatDoseDisplay(dosageValue, dosageUnit) ||
        parsedFromName?.dosageDisplay ||
        parsedFromDisplay?.dosageDisplay ||
        null;
  const rawDoseConfidence = item.doseConfidence ?? item.dose_confidence ?? null;
  const doseConfidence = ["verified", "unverified", "missing"].includes(
    rawDoseConfidence
  )
    ? rawDoseConfidence
    : null;

  if (!name) {
    return null;
  }

  return {
    name,
    raw_name: name,
    dosageValue,
    dosageUnit,
    dosageDisplay,
    chemicalForm:
      normalizeString(item.chemicalForm ?? item.chemical_form) || null,
    amountBasis:
      findFirstNonEmptyString(
        item.amountBasis,
        item.amount_basis,
        rootDose.amountBasis,
        ...nestedDoseCandidates.map((candidate) => candidate.amountBasis)
      ) || null,
    doseConfidence,
    doseReviewReason:
      normalizeString(item.doseReviewReason ?? item.dose_review_reason) || null,
  };
}

function normalizeIngredient(item) {
  return normalizePhotoRescueIngredient(item);
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

function normalizeNonNegativeInteger(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const numeric =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function unwrapResponsePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  if (payload.data && typeof payload.data === "object") {
    return payload.data;
  }

  if (payload.result && typeof payload.result === "object") {
    return payload.result;
  }

  return payload;
}

export function normalizePhotoRescueResponseShape(payload) {
  const data = unwrapResponsePayload(payload);
  const unresolvedIngredientCount = normalizeNumber(
    firstDefined(
      data?.unresolvedIngredientCount,
      data?.unresolved_ingredient_count
    )
  );

  return {
    productId: normalizeString(firstDefined(data?.productId, data?.product_id)),
    displayName: normalizeString(
      firstDefined(data?.displayName, data?.display_name)
    ),
    productName: normalizeString(
      firstDefined(data?.productName, data?.product_name, data?.name)
    ),
    ingredients: normalizeIngredients(
      firstDefined(data?.ingredients, data?.ingredients_found)
    ),
    servingSizeText: normalizeString(
      firstDefined(data?.servingSizeText, data?.serving_size_text)
    ),
    source:
      normalizeString(firstDefined(data?.source, data?.scanDataSource)) ||
      "photo_rescue",
    confidence: normalizeNumber(data?.confidence),
    classificationConfidence: normalizeNumber(
      firstDefined(
        data?.classificationConfidence,
        data?.classification_confidence
      )
    ),
    createdProduct: Boolean(
      firstDefined(data?.createdProduct, data?.created_product)
    ),
    wroteCanonicalData: Boolean(
      firstDefined(data?.wroteCanonicalData, data?.wrote_canonical_data)
    ),
    isSupplement:
      typeof firstDefined(data?.isSupplement, data?.is_supplement) === "boolean"
        ? firstDefined(data?.isSupplement, data?.is_supplement)
        : null,
    category: normalizeString(data?.category),
    message: normalizeString(firstDefined(data?.message, data?.error)),
    unresolvedIngredientCount: Number.isFinite(unresolvedIngredientCount)
      ? Math.max(0, Math.trunc(unresolvedIngredientCount))
      : 0,
    rawText: normalizeString(firstDefined(data?.rawText, data?.raw_text)),
    committedRevision: normalizeNonNegativeInteger(
      firstDefined(data?.committedRevision, data?.committed_revision)
    ),
    acceptedAttemptId: normalizeString(
      firstDefined(data?.acceptedAttemptId, data?.accepted_attempt_id)
    ),
  };
}

export async function scanSupplementPhotos(payload, options = {}) {
  if (!SUPABASE_URL) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
  }

  const telemetry = options.telemetry;
  const accessToken = await (telemetry?.measure
    ? telemetry.measure(
        "client_authentication",
        () => getAccessTokenOrCreateSession(),
        { provider: "supabase" },
      )
    : getAccessTokenOrCreateSession());
  let response;
  const finishRequest = telemetry?.start?.("request_upload_round_trip", {
    provider: "supabase_edge_function",
  });

  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...getLatencyTraceHeaders(telemetry),
      },
      body: JSON.stringify(payload),
    });
    finishRequest?.({
      edgeDurationMs: Number.parseFloat(
        response.headers?.get?.("x-edge-duration-ms") || "",
      ),
      httpStatus: response.status,
      success: response.ok,
    });
  } catch (error) {
    finishRequest?.({ success: false, error });
    throw createScannerFailure({
      category: SCANNER_FAILURE_CATEGORIES.networkError,
      code: "network_error",
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    const normalizedError = normalizeEdgeFunctionError({
      status: response.status,
      responseText: errorText,
      retryAfterHeader: response.headers.get("Retry-After"),
      fallbackMessage: "Photo scan request failed.",
      unauthorizedMessage: "Please sign in to use photo rescue.",
    });

    logBuildAwareDiagnostic("warn", "[scanner-photo-rescue] request failed", {
      developmentDetails: {
        status: response.status,
        code: normalizedError.code,
        isQuotaLimited: normalizedError.isQuotaLimited,
        retryAfterSeconds: normalizedError.retryAfterSeconds,
      },
      productionDetails: {
        status: response.status,
        code: normalizedError.code,
        isQuotaLimited: normalizedError.isQuotaLimited,
      },
    });

    throw createScannerFailure({
      category:
        response.status === 401
          ? SCANNER_FAILURE_CATEGORIES.authSessionRequired
          : normalizedError.isQuotaLimited ||
            response.status === 400 ||
            response.status === 413 ||
            response.status === 422 ||
            response.status === 429
          ? SCANNER_FAILURE_CATEGORIES.backendValidationFailure
          : SCANNER_FAILURE_CATEGORIES.networkError,
      code: normalizedError.code,
      message: normalizedError.message,
      status: response.status,
      retryAfterSeconds: normalizedError.retryAfterSeconds,
      isQuotaLimited: normalizedError.isQuotaLimited,
    });
  }

  const finishProcessing = telemetry?.start?.(
    "client_response_parse_and_normalize",
  );
  try {
    const data = await response.json();
    const normalized = normalizePhotoRescueResponseShape(data);
    finishProcessing?.({
      ingredientCount: normalized.ingredients.length,
      success: true,
    });
    return normalized;
  } catch (error) {
    finishProcessing?.({ success: false, error });
    throw error;
  }
}
