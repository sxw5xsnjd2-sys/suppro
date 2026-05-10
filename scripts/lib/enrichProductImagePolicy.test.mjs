import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function loadEnrichProductImagePolicyModule() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/_shared/enrich-product-image-policy.js",
      import.meta.url
    ),
    "utf8"
  )

  const transformed = source.replace(/export function /g, "function ")

  const factory = new Function(
    `${transformed}
return {
  buildEnrichProductImageResponse,
  validateEnrichProductImageRequest,
};`
  )

  return factory()
}

test("enrich-product-image validator rejects invalid payloads", () => {
  const { validateEnrichProductImageRequest } =
    loadEnrichProductImagePolicyModule()

  assert.deepEqual(validateEnrichProductImageRequest("not json"), {
    ok: false,
    status: 400,
    body: {
      error: "Request body must be valid JSON.",
      code: "invalid_request_payload",
    },
  })

  assert.deepEqual(
    validateEnrichProductImageRequest(JSON.stringify({ product: "bad" })),
    {
      ok: false,
      status: 400,
      body: {
        error: "product must be a JSON object when provided.",
        code: "invalid_request_payload",
      },
    }
  )
})

test("enrich-product-image validator rejects oversized payloads", () => {
  const { validateEnrichProductImageRequest } =
    loadEnrichProductImagePolicyModule()

  assert.deepEqual(
    validateEnrichProductImageRequest(
      JSON.stringify({ productId: "prod_123", raw: "x".repeat(70_000) })
    ),
    {
      ok: false,
      status: 413,
      body: {
        error: "Request payload is too large.",
        code: "payload_too_large",
      },
    }
  )
})

test("force and deepSearch are restricted to trusted callers", () => {
  const { validateEnrichProductImageRequest } =
    loadEnrichProductImagePolicyModule()

  assert.deepEqual(
    validateEnrichProductImageRequest(
      JSON.stringify({ productId: "prod_123", force: true, deepSearch: true }),
      { isTrusted: false }
    ),
    {
      ok: false,
      status: 403,
      body: {
        error: "Forbidden.",
        code: "trusted_request_required",
      },
    }
  )

  const trusted = validateEnrichProductImageRequest(
    JSON.stringify({
      productId: "supplement_product_prod_123",
      force: true,
      deepSearch: true,
      product: {
        id: "supplement_product_prod_123",
      },
    }),
    { isTrusted: true }
  )

  assert.equal(trusted.ok, true)
  assert.equal(trusted.value.force, true)
  assert.equal(trusted.value.deepSearch, true)
  assert.equal(trusted.value.productId, "prod_123")
  assert.equal(trusted.value.requestProduct.id, "prod_123")
  assert.equal(trusted.value.requestProduct.product_id, "prod_123")
})

test("enrich-product-image response builder preserves the public response shape", () => {
  const { buildEnrichProductImageResponse } =
    loadEnrichProductImagePolicyModule()

  assert.deepEqual(
    buildEnrichProductImageResponse({
      status: "found",
      productId: "prod_123",
      imageUrl: "https://example.com/image.png",
      thumbnailUrl: "https://example.com/thumb.png",
      sourceUrl: "https://example.com",
      confidence: 91,
      query: "magnesium glycinate official product",
      reason: "Image found",
    }),
    {
      ok: true,
      status: "found",
      productId: "prod_123",
      imageUrl: "https://example.com/image.png",
      thumbnailUrl: "https://example.com/thumb.png",
      sourceUrl: "https://example.com",
      confidence: 91,
      query: "magnesium glycinate official product",
      reason: "Image found",
    }
  )
})
