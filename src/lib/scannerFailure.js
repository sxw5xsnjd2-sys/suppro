function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const SCANNER_FAILURE_CATEGORIES = {
  networkError: "network_error",
  expiredScanSession: "expired_scan_session",
  authSessionRequired: "auth_session_required",
  barcodeNotFound: "barcode_not_found",
  partialProductDetail: "partial_product_detail",
  aiExtractionFailure: "ai_extraction_failure",
  backendValidationFailure: "backend_validation_failure",
};

const VALID_FAILURE_CATEGORIES = new Set(
  Object.values(SCANNER_FAILURE_CATEGORIES)
);
const QUOTA_ERROR_CODES = new Set([
  "daily_quota_exceeded",
  "rate_limit_exceeded",
  "quota_exceeded",
  "edge_function_quota_exceeded",
]);
const AUTH_ERROR_CODES = new Set([
  "auth_required",
  "invalid_jwt",
  "jwt_expired",
  "premium_entitlement_required",
  "unauthorized",
]);

function fallbackMessageForCategory(category) {
  switch (category) {
    case SCANNER_FAILURE_CATEGORIES.expiredScanSession:
      return "That scan expired. Rescan the barcode and try photo rescue again.";
    case SCANNER_FAILURE_CATEGORIES.authSessionRequired:
      return "Please sign in again to continue.";
    case SCANNER_FAILURE_CATEGORIES.barcodeNotFound:
      return "Sorry, we couldn't find that product, please take pictures to add it to the app";
    case SCANNER_FAILURE_CATEGORIES.partialProductDetail:
      return "We found the product, but there were no usable supplement ingredients to match.";
    case SCANNER_FAILURE_CATEGORIES.aiExtractionFailure:
      return "We couldn't read enough from those photos. Retake them and try again.";
    case SCANNER_FAILURE_CATEGORIES.backendValidationFailure:
      return "We couldn't use that request right now. Please try again.";
    case SCANNER_FAILURE_CATEGORIES.networkError:
    default:
      return "We couldn't connect, please try again.";
  }
}

export function createScannerFailure({
  category,
  code,
  message,
  status = null,
  retryAfterSeconds = null,
  isQuotaLimited = false,
} = {}) {
  const normalizedCategory = VALID_FAILURE_CATEGORIES.has(category)
    ? category
    : SCANNER_FAILURE_CATEGORIES.networkError;
  const normalizedMessage =
    trimString(message) || fallbackMessageForCategory(normalizedCategory);
  const error = new Error(normalizedMessage);

  error.category = normalizedCategory;
  error.code = trimString(code) || null;
  error.status = Number.isFinite(status) ? Number(status) : null;
  error.retryAfterSeconds =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds)
      : null;
  error.isQuotaLimited = Boolean(isQuotaLimited);

  return error;
}

function messageLooksLikeExpiredSession(message) {
  const normalized = trimString(message).toLowerCase();
  return (
    normalized.includes("scansessionid") ||
    normalized.includes("scan session") ||
    normalized.includes("scan is no longer active") ||
    normalized.includes("scan expired")
  );
}

function messageLooksLikeAiFailure(message) {
  const normalized = trimString(message).toLowerCase();
  return (
    normalized.includes("couldn't confirm") ||
    normalized.includes("could not confirm") ||
    normalized.includes("couldn't read any usable supplement ingredients") ||
    normalized.includes("could not read any usable supplement ingredients") ||
    normalized.includes("not a supplement")
  );
}

function messageLooksLikeNetworkFailure(message) {
  const normalized = trimString(message).toLowerCase();
  return (
    normalized.includes("network") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("timed out") ||
    normalized.includes("offline") ||
    normalized.includes("couldn't connect") ||
    normalized.includes("could not connect")
  );
}

function messageLooksLikeAuthRequired(message) {
  const normalized = trimString(message).toLowerCase();
  return (
    normalized.includes("sign in") ||
    normalized.includes("signed in") ||
    normalized.includes("session required") ||
    normalized.includes("logged in")
  );
}

export function getScannerFailureCategory(error) {
  const directCategory = trimString(error?.category);
  if (VALID_FAILURE_CATEGORIES.has(directCategory)) {
    return directCategory;
  }

  const code = trimString(error?.code).toLowerCase();
  const status = Number.isFinite(error?.status) ? Number(error.status) : null;
  const message = trimString(error?.message);

  if (messageLooksLikeExpiredSession(message)) {
    return SCANNER_FAILURE_CATEGORIES.expiredScanSession;
  }

  if (code === "product_not_found") {
    return SCANNER_FAILURE_CATEGORIES.barcodeNotFound;
  }

  if (code === "partial_product_detail") {
    return SCANNER_FAILURE_CATEGORIES.partialProductDetail;
  }

  if (code === "ai_extraction_failed" || messageLooksLikeAiFailure(message)) {
    return SCANNER_FAILURE_CATEGORIES.aiExtractionFailure;
  }

  if (
    status === 401 ||
    status === 403 ||
    AUTH_ERROR_CODES.has(code) ||
    messageLooksLikeAuthRequired(message)
  ) {
    return SCANNER_FAILURE_CATEGORIES.authSessionRequired;
  }

  if (
    status === 400 ||
    status === 413 ||
    status === 422 ||
    status === 429 ||
    QUOTA_ERROR_CODES.has(code)
  ) {
    return SCANNER_FAILURE_CATEGORIES.backendValidationFailure;
  }

  if (
    code === "open_food_facts_unavailable" ||
    code === "network_error" ||
    messageLooksLikeNetworkFailure(message)
  ) {
    return SCANNER_FAILURE_CATEGORIES.networkError;
  }

  return SCANNER_FAILURE_CATEGORIES.networkError;
}

export function buildPartialProductDetailFailure() {
  return createScannerFailure({
    category: SCANNER_FAILURE_CATEGORIES.partialProductDetail,
    code: "partial_product_detail",
  });
}

export function normalizeBarcodeScanFailure(error) {
  const category = getScannerFailureCategory(error);
  const code = trimString(error?.code).toLowerCase() || null;

  if (category === SCANNER_FAILURE_CATEGORIES.barcodeNotFound) {
    return {
      status: "not_found",
      error: createScannerFailure({
        category,
        code: code || "product_not_found",
      }),
    };
  }

  if (category === SCANNER_FAILURE_CATEGORIES.partialProductDetail) {
    return {
      status: "no_ingredients",
      error: buildPartialProductDetailFailure(),
    };
  }

  if (code === "invalid_barcode") {
    return {
      status: "error",
      error: createScannerFailure({
        category: SCANNER_FAILURE_CATEGORIES.backendValidationFailure,
        code,
        message: "That barcode could not be read. Try scanning again.",
        status: error?.status ?? null,
      }),
    };
  }

  return {
    status: "error",
    error: createScannerFailure({
      category,
      code,
      message: trimString(error?.message) || fallbackMessageForCategory(category),
      status: error?.status ?? null,
      retryAfterSeconds: error?.retryAfterSeconds ?? null,
      isQuotaLimited: Boolean(error?.isQuotaLimited),
    }),
  };
}

export function normalizePhotoRescueFailure(error) {
  const category = getScannerFailureCategory(error);
  const code = trimString(error?.code).toLowerCase() || null;
  const retryAfterSeconds = error?.retryAfterSeconds ?? null;
  const status = error?.status ?? null;
  let message = trimString(error?.message);

  switch (category) {
    case SCANNER_FAILURE_CATEGORIES.expiredScanSession:
      message = fallbackMessageForCategory(category);
      break;
    case SCANNER_FAILURE_CATEGORIES.authSessionRequired:
      message = "Please sign in again to use photo rescue.";
      break;
    case SCANNER_FAILURE_CATEGORIES.aiExtractionFailure:
      message = message || fallbackMessageForCategory(category);
      break;
    case SCANNER_FAILURE_CATEGORIES.backendValidationFailure:
      message = message || fallbackMessageForCategory(category);
      break;
    case SCANNER_FAILURE_CATEGORIES.networkError:
    default:
      message =
        message && !messageLooksLikeNetworkFailure(message)
          ? message
          : fallbackMessageForCategory(
              SCANNER_FAILURE_CATEGORIES.networkError
            );
      break;
  }

  return createScannerFailure({
    category,
    code,
    message,
    status,
    retryAfterSeconds,
    isQuotaLimited: Boolean(error?.isQuotaLimited),
  });
}

export function getPhotoRescueFailurePresentation(error) {
  const category = getScannerFailureCategory(error);
  const message =
    trimString(error?.message) || fallbackMessageForCategory(category);

  if (category === SCANNER_FAILURE_CATEGORIES.expiredScanSession) {
    return {
      title: "Scan expired",
      message,
      primaryLabel: "Rescan barcode",
      secondaryLabel: "Back",
    };
  }

  if (category === SCANNER_FAILURE_CATEGORIES.authSessionRequired) {
    return {
      title: "Session required",
      message,
      primaryLabel: "Back",
      secondaryLabel: "Cancel",
    };
  }

  if (category === SCANNER_FAILURE_CATEGORIES.networkError) {
    return {
      title: "Connection issue",
      message,
      primaryLabel: "Try again",
      secondaryLabel: "Cancel",
    };
  }

  return {
    title: "Photo rescue failed",
    message,
    primaryLabel: "Retake photos",
    secondaryLabel: "Cancel",
  };
}
