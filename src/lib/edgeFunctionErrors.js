function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const QUOTA_ERROR_CODES = new Set([
  "daily_quota_exceeded",
  "rate_limit_exceeded",
  "quota_exceeded",
  "edge_function_quota_exceeded",
]);

function parseJsonObject(raw) {
  const text = trimString(raw);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function formatRetryDelayText(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "";
  }

  if (totalSeconds < 90) {
    return " Try again in about a minute.";
  }

  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes < 60) {
    return ` Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }

  const hours = Math.ceil(minutes / 60);
  return ` Try again in ${hours} hour${hours === 1 ? "" : "s"}.`;
}

export function getFriendlyQuotaMessage(retryAfterSeconds) {
  return (
    "You're doing that a bit too quickly. Please try again in a few minutes." +
    formatRetryDelayText(retryAfterSeconds)
  );
}

export function normalizeEdgeFunctionError({
  status,
  responseText,
  retryAfterHeader,
  fallbackMessage,
  unauthorizedMessage,
  quotaMessage,
  serviceUnavailableMessage,
}) {
  const parsed = parseJsonObject(responseText);
  const parsedError = trimString(parsed?.error);
  const parsedCode = trimString(parsed?.code).toLowerCase();
  const parsedRetryAfter = Number(parsed?.retryAfterSeconds);
  const headerRetryAfter = Number(retryAfterHeader);
  const retryAfterSeconds = Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
    ? Math.ceil(parsedRetryAfter)
    : Number.isFinite(headerRetryAfter) && headerRetryAfter > 0
    ? Math.ceil(headerRetryAfter)
    : null;

  if (status === 401) {
    return {
      message: unauthorizedMessage || fallbackMessage,
      isQuotaLimited: false,
      retryAfterSeconds: null,
      status,
      code: parsedCode || null,
    };
  }

  if (status === 429 || QUOTA_ERROR_CODES.has(parsedCode)) {
    return {
      message: quotaMessage || getFriendlyQuotaMessage(retryAfterSeconds),
      isQuotaLimited: true,
      retryAfterSeconds,
      status,
      code: parsedCode || "rate_limit_exceeded",
    };
  }

  if (parsedError === "AI service unavailable" && serviceUnavailableMessage) {
    return {
      message: serviceUnavailableMessage,
      isQuotaLimited: false,
      retryAfterSeconds: null,
      status,
      code: parsedCode || null,
    };
  }

  return {
    message: parsedError || fallbackMessage,
    isQuotaLimited: false,
    retryAfterSeconds: retryAfterSeconds,
    status,
    code: parsedCode || null,
  };
}

export async function normalizeEdgeFunctionInvokeError(error, options) {
  const context = error?.context;
  if (
    context &&
    typeof context.status === "number" &&
    typeof context.text === "function"
  ) {
    const responseText = await context.text().catch(() => "");
    return normalizeEdgeFunctionError({
      ...options,
      status: context.status,
      responseText,
      retryAfterHeader:
        typeof context.headers?.get === "function"
          ? context.headers.get("Retry-After")
          : null,
    });
  }

  return {
    message: options?.fallbackMessage || "Something went wrong.",
    isQuotaLimited: false,
    retryAfterSeconds: null,
    status: null,
    code: null,
  };
}
