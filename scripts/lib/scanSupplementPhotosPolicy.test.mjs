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
      barcode: " 0123-4567-8901 ",
      ingredientsImage: "data:image/png;base64,abcd",
      productImage: "data:image/jpeg;base64,efgh",
      currentProduct: {
        productId: " prod_123 ",
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
      barcode: " 0123-4567-8901 ",
      ingredientsImage: "data:image/png;base64,abcd",
      productImage: "data:image/jpeg;base64,efgh",
      currentProduct: {
        productId: " prod_123 ",
        productName: " Magnesium Glycinate ",
        ingredientsText: " Magnesium 200 mg ",
        sourceIngredients: [" Magnesium ", " Vitamin D3 "],
      },
    },
    scanSessionId: 42,
    barcode: "012345678901",
    ingredientsImage: "data:image/png;base64,abcd",
    productImage: "data:image/jpeg;base64,efgh",
    currentProduct: {
      productId: "prod_123",
      productName: "Magnesium Glycinate",
      ingredientsText: "Magnesium 200 mg",
      sourceIngredients: ["Magnesium", "Vitamin D3"],
      sourceStatusVerbose: "",
    },
    requestedProductId: "prod_123",
  })
})
