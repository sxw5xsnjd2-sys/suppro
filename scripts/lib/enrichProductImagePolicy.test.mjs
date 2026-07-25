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

  const transformed = source
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")

  const factory = new Function(
    `${transformed}
return {
  buildEnrichProductImageResponse,
  getPersistableProductThumbnailUrl,
  getProductImageCooldownDecision,
  MAX_PRODUCT_IMAGE_ENQUEUE_BATCH,
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

test("batch enqueue validation is bounded, deduplicated, and UUID-only", () => {
  const {
    MAX_PRODUCT_IMAGE_ENQUEUE_BATCH,
    validateEnrichProductImageRequest,
  } = loadEnrichProductImagePolicyModule()
  const productId = "11111111-1111-4111-8111-111111111111"
  const validated = validateEnrichProductImageRequest(
    JSON.stringify({ productIds: [productId, productId] })
  )

  assert.equal(validated.ok, true)
  assert.deepEqual(validated.value.productIds, [productId])
  assert.equal(MAX_PRODUCT_IMAGE_ENQUEUE_BATCH, 25)
  assert.equal(
    validateEnrichProductImageRequest(
      JSON.stringify({
        productIds: Array.from(
          { length: MAX_PRODUCT_IMAGE_ENQUEUE_BATCH + 1 },
          (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`
        ),
      })
    ).ok,
    false
  )
  assert.equal(
    validateEnrichProductImageRequest(
      JSON.stringify({ productIds: [productId], force: true })
    ).ok,
    false
  )
})

test("recent failures and skips observe distinct cooldowns", () => {
  const { getProductImageCooldownDecision } =
    loadEnrichProductImagePolicyModule()
  const now = Date.parse("2026-07-24T12:00:00.000Z")

  const failed = getProductImageCooldownDecision(
    {
      image_status: "failed",
      image_last_checked_at: "2026-07-23T12:00:00.000Z",
    },
    { now }
  )
  const expiredFailure = getProductImageCooldownDecision(
    {
      image_status: "failed",
      image_last_checked_at: "2026-07-16T11:59:59.000Z",
    },
    { now }
  )
  const skipped = getProductImageCooldownDecision(
    {
      image_status: "skipped",
      image_last_checked_at: "2026-07-01T12:00:00.000Z",
    },
    { now }
  )

  assert.equal(failed.status, "failed")
  assert.ok(failed.retryAfterSeconds > 0)
  assert.equal(expiredFailure, null)
  assert.equal(skipped.status, "skipped")
})

test("future enrichment does not persist transient SerpApi thumbnails", () => {
  const { getPersistableProductThumbnailUrl } =
    loadEnrichProductImagePolicyModule()

  assert.equal(
    getPersistableProductThumbnailUrl(
      "https://serpapi.com/searches/abc/images/thumbnail.jpg"
    ),
    null
  )
  assert.equal(
    getPersistableProductThumbnailUrl(
      "https://cdn.serpapi.com/searches/abc/images/thumbnail.jpg"
    ),
    null
  )
  assert.equal(
    getPersistableProductThumbnailUrl(
      "https://images.example.com/products/thumbnail.jpg"
    ),
    "https://images.example.com/products/thumbnail.jpg"
  )

  const enrichmentFunction = readFileSync(
    new URL(
      "../../supabase/functions/enrich-product-image/index.ts",
      import.meta.url
    ),
    "utf8"
  )
  assert.match(
    enrichmentFunction,
    /imageUrl: original \|\| getPersistableProductThumbnailUrl\(thumbnail\)/u
  )
  assert.match(
    enrichmentFunction,
    /thumbnailUrl: getPersistableProductThumbnailUrl\(thumbnail\)/u
  )
})
