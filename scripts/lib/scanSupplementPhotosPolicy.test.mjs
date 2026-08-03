import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function loadScanSupplementPhotosPolicyModule() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/_shared/scan-supplement-photos-policy.js",
      import.meta.url
    ),
    "utf8"
  )

  const transformed = source.replace(/export function /g, "function ")

  const factory = new Function(
    `${transformed}
return {
  validateScanSupplementPhotosRequest,
};`
  )

  return factory()
}

test("scan/photo rescue validator rejects invalid and missing payloads", () => {
  const { validateScanSupplementPhotosRequest } =
    loadScanSupplementPhotosPolicyModule()

  assert.deepEqual(validateScanSupplementPhotosRequest("not json"), {
    ok: false,
    status: 400,
    body: {
      error: "Request body must be valid JSON.",
      code: "invalid_request_payload",
    },
  })

  assert.deepEqual(
    validateScanSupplementPhotosRequest(JSON.stringify({ barcode: "123" })),
    {
      ok: false,
      status: 400,
      body: {
        error: "Missing scanSessionId.",
        code: "invalid_request_payload",
      },
    }
  )
})

test("scan/photo rescue validator rejects oversized payloads", () => {
  const { validateScanSupplementPhotosRequest } =
    loadScanSupplementPhotosPolicyModule()
  const oversized = JSON.stringify({
    scanSessionId: 1,
    barcode: "123456789012",
    ingredientsImage: `data:image/png;base64,${"A".repeat(4_100_000)}`,
    productImage: `data:image/png;base64,${"B".repeat(4_100_000)}`,
  })

  assert.deepEqual(validateScanSupplementPhotosRequest(oversized), {
    ok: false,
    status: 413,
    body: {
      error: "Request payload is too large.",
      code: "payload_too_large",
    },
  })
})

test("scan/photo rescue validator normalizes accepted payloads", () => {
  const { validateScanSupplementPhotosRequest } =
    loadScanSupplementPhotosPolicyModule()

  const result = validateScanSupplementPhotosRequest(
    JSON.stringify({
      scanSessionId: "42",
      photoAttemptId: "attempt-3",
      expectedRevision: "0",
      proposedRevision: "1",
      barcode: " 0123-4567-8901 ",
      barcodeType: "ean13",
      ingredientsImage: "data:image/png;base64,abcd",
      productImage: "data:image/jpeg;base64,efgh",
      currentProduct: {
        productId: " 11111111-1111-4111-8111-111111111111 ",
        productName: " Magnesium Glycinate ",
        ingredientsText: " Magnesium 200 mg ",
        sourceIngredients: [" Magnesium ", " Vitamin D3 "],
      },
    })
  )

  assert.equal(result.ok, true)
  assert.deepEqual(result.value, {
    body: {
      scanSessionId: "42",
      photoAttemptId: "attempt-3",
      expectedRevision: "0",
      proposedRevision: "1",
      barcode: " 0123-4567-8901 ",
      barcodeType: "ean13",
      ingredientsImage: "data:image/png;base64,abcd",
      productImage: "data:image/jpeg;base64,efgh",
      currentProduct: {
        productId: " 11111111-1111-4111-8111-111111111111 ",
        productName: " Magnesium Glycinate ",
        ingredientsText: " Magnesium 200 mg ",
        sourceIngredients: [" Magnesium ", " Vitamin D3 "],
      },
    },
    scanSessionId: 42,
    photoAttemptId: "attempt-3",
    expectedRevision: 0,
    proposedRevision: 1,
    barcode: "0012345678901",
    barcodeType: "ean13",
    ingredientsImage: "data:image/png;base64,abcd",
    productImage: "data:image/jpeg;base64,efgh",
    currentProduct: {
      productId: "11111111-1111-4111-8111-111111111111",
      productName: "Magnesium Glycinate",
      ingredientsText: "Magnesium 200 mg",
      sourceIngredients: ["Magnesium", "Vitamin D3"],
      sourceStatusVerbose: "",
    },
    requestedProductId: "11111111-1111-4111-8111-111111111111",
  })
})

test("scan/photo rescue validator preserves alphanumeric non-retail barcodes", () => {
  const { validateScanSupplementPhotosRequest } =
    loadScanSupplementPhotosPolicyModule()

  const result = validateScanSupplementPhotosRequest(
    JSON.stringify({
      scanSessionId: 7,
      photoAttemptId: "attempt-1",
      expectedRevision: 0,
      proposedRevision: 1,
      barcode: " X00131RGZ5 ",
      barcodeType: "code128",
      ingredientsImage: "data:image/png;base64,abcd",
      productImage: "data:image/jpeg;base64,efgh",
    })
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.barcode, "X00131RGZ5")
  assert.equal(result.value.barcodeType, "code128")
})

test("scan/photo rescue validator requires a valid optimistic revision contract", () => {
  const { validateScanSupplementPhotosRequest } =
    loadScanSupplementPhotosPolicyModule()
  const basePayload = {
    scanSessionId: 7,
    photoAttemptId: "attempt-2",
    expectedRevision: 1,
    proposedRevision: 2,
    barcode: "X00131RGZ5",
    barcodeType: "code128",
    ingredientsImage: "data:image/png;base64,abcd",
    productImage: "data:image/jpeg;base64,efgh",
  }

  for (const invalidFields of [
    { photoAttemptId: "bad" },
    { expectedRevision: -1 },
    { proposedRevision: 1 },
    { proposedRevision: 3 },
  ]) {
    const result = validateScanSupplementPhotosRequest(
      JSON.stringify({ ...basePayload, ...invalidFields })
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
    assert.equal(result.body.code, "invalid_photo_improvement_version")
  }
})

test("scan/photo rescue validator rejects a non-canonical product target", () => {
  const { validateScanSupplementPhotosRequest } =
    loadScanSupplementPhotosPolicyModule()
  const result = validateScanSupplementPhotosRequest(
    JSON.stringify({
      scanSessionId: 7,
      photoAttemptId: "attempt-target",
      expectedRevision: 0,
      proposedRevision: 1,
      barcode: "X00131RGZ5",
      barcodeType: "code128",
      productId: "not-a-product-uuid",
      ingredientsImage: "data:image/png;base64,abcd",
      productImage: "data:image/jpeg;base64,efgh",
    })
  )

  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.body.code, "invalid_photo_improvement_target")
})
