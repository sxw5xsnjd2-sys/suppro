import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadScannerFailureModule() {
  const source = readFileSync(
    new URL("../../src/lib/scannerFailure.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  SCANNER_FAILURE_CATEGORIES,
  buildPartialProductDetailFailure,
  createScannerFailure,
  getPhotoRescueFailurePresentation,
  getScannerFailureCategory,
  normalizeBarcodeScanFailure,
  normalizePhotoRescueFailure,
};`
  );

  return factory();
}

const {
  SCANNER_FAILURE_CATEGORIES,
  buildPartialProductDetailFailure,
  createScannerFailure,
  getPhotoRescueFailurePresentation,
  getScannerFailureCategory,
  normalizeBarcodeScanFailure,
  normalizePhotoRescueFailure,
} = loadScannerFailureModule();

test("barcode not found is normalized into the not_found scan state", () => {
  const normalized = normalizeBarcodeScanFailure({
    code: "product_not_found",
    message: "Missing",
  });

  assert.equal(normalized.status, "not_found");
  assert.equal(
    normalized.error.category,
    SCANNER_FAILURE_CATEGORIES.barcodeNotFound
  );
  assert.equal(normalized.error.code, "product_not_found");
});

test("partial product detail keeps the no_ingredients flow with a stable category", () => {
  const partial = buildPartialProductDetailFailure();
  const normalized = normalizeBarcodeScanFailure(partial);

  assert.equal(normalized.status, "no_ingredients");
  assert.equal(
    normalized.error.category,
    SCANNER_FAILURE_CATEGORIES.partialProductDetail
  );
  assert.equal(normalized.error.code, "partial_product_detail");
});

test("photo rescue auth failures normalize into auth_session_required", () => {
  const normalized = normalizePhotoRescueFailure({
    status: 401,
    code: "auth_required",
    message: "Please sign in to use photo rescue.",
  });

  assert.equal(
    normalized.category,
    SCANNER_FAILURE_CATEGORIES.authSessionRequired
  );
  assert.equal(normalized.message, "Please sign in again to use photo rescue.");
});

test("photo rescue rate-limit failures keep backend validation category and retry delay", () => {
  const normalized = normalizePhotoRescueFailure({
    status: 429,
    code: "daily_quota_exceeded",
    message:
      "You're doing that a bit too quickly. Please try again in a few minutes.",
    retryAfterSeconds: 600,
    isQuotaLimited: true,
  });

  assert.equal(
    normalized.category,
    SCANNER_FAILURE_CATEGORIES.backendValidationFailure
  );
  assert.equal(normalized.retryAfterSeconds, 600);
  assert.equal(normalized.isQuotaLimited, true);
});

test("expired photo rescue sessions present a rescan action", () => {
  const failure = createScannerFailure({
    category: SCANNER_FAILURE_CATEGORIES.expiredScanSession,
    code: "expired_scan_session",
  });
  const presentation = getPhotoRescueFailurePresentation(failure);

  assert.equal(presentation.title, "Scan expired");
  assert.equal(presentation.primaryLabel, "Rescan barcode");
});

test("network-style fetch errors classify as network errors", () => {
  const category = getScannerFailureCategory({
    message: "Failed to fetch",
  });

  assert.equal(category, SCANNER_FAILURE_CATEGORIES.networkError);
});
