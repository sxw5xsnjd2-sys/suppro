import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadEdgeFunctionErrorsModule() {
  const source = readFileSync(
    new URL("../../src/lib/edgeFunctionErrors.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  formatRetryDelayText,
  getFriendlyQuotaMessage,
  normalizeEdgeFunctionError,
};`
  );

  return factory();
}

test("quota responses are normalized to friendly retry guidance", () => {
  const { normalizeEdgeFunctionError } = loadEdgeFunctionErrorsModule();

  const normalized = normalizeEdgeFunctionError({
    status: 429,
    responseText: JSON.stringify({
      error: "Daily image enrichment limit reached. Please try again tomorrow.",
      code: "daily_quota_exceeded",
      retryAfterSeconds: 600,
    }),
    retryAfterHeader: "600",
    fallbackMessage: "Image enrichment failed.",
  });

  assert.deepEqual(normalized, {
    message:
      "You're doing that a bit too quickly. Please try again in a few minutes. Try again in 10 minutes.",
    isQuotaLimited: true,
    retryAfterSeconds: 600,
    status: 429,
    code: "daily_quota_exceeded",
  });
});

test("non-quota JSON errors keep safe user-facing messages", () => {
  const { normalizeEdgeFunctionError } = loadEdgeFunctionErrorsModule();

  const normalized = normalizeEdgeFunctionError({
    status: 422,
    responseText: JSON.stringify({
      error:
        "We couldn't read any usable active supplement ingredients from those photos.",
    }),
    retryAfterHeader: null,
    fallbackMessage: "Photo scan request failed.",
  });

  assert.deepEqual(normalized, {
    message:
      "We couldn't read any usable active supplement ingredients from those photos.",
    isQuotaLimited: false,
    retryAfterSeconds: null,
    status: 422,
    code: null,
  });
});

test("short retry windows are rounded to about a minute", () => {
  const { getFriendlyQuotaMessage } = loadEdgeFunctionErrorsModule();

  assert.equal(
    getFriendlyQuotaMessage(45),
    "You're doing that a bit too quickly. Please try again in a few minutes. Try again in about a minute."
  );
});
