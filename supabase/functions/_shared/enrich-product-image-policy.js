const MAX_REQUEST_BYTES = 60_000
export const MAX_PRODUCT_IMAGE_ENQUEUE_BATCH = 25
export const PRODUCT_IMAGE_FAILED_COOLDOWN_SECONDS = 7 * 24 * 60 * 60
export const PRODUCT_IMAGE_SKIPPED_COOLDOWN_SECONDS = 30 * 24 * 60 * 60
const FORBIDDEN_REQUEST_KEYS = new Set(["trusted", "admin"])

function trimString(value) {
  return typeof value === "string" ? value.trim() : ""
}

function getByteLength(value) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(String(value ?? "")).length
  }

  return String(value ?? "").length
}

function normalizeProductId(value) {
  const clean = trimString(value)
  return clean.startsWith("supplement_product_")
    ? clean.slice("supplement_product_".length)
    : clean
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    trimString(value)
  )
}

export function getPersistableProductThumbnailUrl(value) {
  const clean = trimString(value)
  if (!clean) return null

  try {
    const hostname = new URL(clean).hostname.toLowerCase()
    if (hostname === "serpapi.com" || hostname.endsWith(".serpapi.com")) {
      return null
    }
  } catch {
    return null
  }

  return clean
}

export function getProductImageCooldownDecision(
  product,
  { now = Date.now() } = {}
) {
  const status = trimString(product?.image_status)
  const lastCheckedAt = Date.parse(trimString(product?.image_last_checked_at))
  if (!Number.isFinite(lastCheckedAt)) return null

  const cooldownSeconds = status === "failed"
    ? PRODUCT_IMAGE_FAILED_COOLDOWN_SECONDS
    : status === "skipped"
    ? PRODUCT_IMAGE_SKIPPED_COOLDOWN_SECONDS
    : 0
  if (!cooldownSeconds || now - lastCheckedAt >= cooldownSeconds * 1000) {
    return null
  }

  return {
    status,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((lastCheckedAt + cooldownSeconds * 1000 - now) / 1000)
    ),
  }
}

function buildInvalidPayloadResponse(message, code = "invalid_request_payload") {
  return {
    ok: false,
    status: 400,
    body: {
      error: message,
      code,
    },
  }
}

export function buildEnrichProductImageResponse({
  status,
  productId,
  imageUrl = null,
  thumbnailUrl = null,
  sourceUrl = null,
  confidence = null,
  query = null,
  reason = null,
}) {
  return {
    ok: true,
    status,
    productId,
    imageUrl,
    thumbnailUrl,
    sourceUrl,
    confidence,
    query,
    reason,
  }
}

export function validateEnrichProductImageRequest(
  rawBodyText,
  { isTrusted = false } = {}
) {
  const bodyText = typeof rawBodyText === "string" ? rawBodyText : ""

  if (!bodyText.trim()) {
    return {
      ok: true,
      value: {
        body: {},
        force: false,
        deepSearch: false,
        productId: "",
        productIds: [],
        requestProduct: null,
      },
    }
  }

  if (getByteLength(bodyText) > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      status: 413,
      body: {
        error: "Request payload is too large.",
        code: "payload_too_large",
      },
    }
  }

  let body
  try {
    body = JSON.parse(bodyText)
  } catch {
    return buildInvalidPayloadResponse("Request body must be valid JSON.")
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return buildInvalidPayloadResponse("Request body must be a JSON object.")
  }

  for (const key of Object.keys(body)) {
    if (FORBIDDEN_REQUEST_KEYS.has(key)) {
      return buildInvalidPayloadResponse("Request contains unsupported fields.")
    }
  }

  const force = body.force === true
  const deepSearch = body.deepSearch === true

  if (typeof body.productIds !== "undefined") {
    if (
      !Array.isArray(body.productIds) ||
      body.productIds.length < 1 ||
      body.productIds.length > MAX_PRODUCT_IMAGE_ENQUEUE_BATCH
    ) {
      return buildInvalidPayloadResponse(
        `productIds must contain between 1 and ${MAX_PRODUCT_IMAGE_ENQUEUE_BATCH} IDs.`
      )
    }

    const productIds = [...new Set(body.productIds.map(normalizeProductId))]
    if (
      productIds.some((productId) => !isUuid(productId)) ||
      typeof body.productId !== "undefined" ||
      typeof body.product !== "undefined" ||
      force ||
      deepSearch
    ) {
      return buildInvalidPayloadResponse(
        "Batch image enqueue requests contain unsupported fields."
      )
    }

    return {
      ok: true,
      value: {
        body,
        force: false,
        deepSearch: false,
        productId: "",
        productIds,
        requestProduct: null,
      },
    }
  }

  if ((force || deepSearch) && !isTrusted) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "Forbidden.",
        code: "trusted_request_required",
      },
    }
  }

  if (
    typeof body.product !== "undefined" &&
    (!body.product || typeof body.product !== "object" || Array.isArray(body.product))
  ) {
    return buildInvalidPayloadResponse("product must be a JSON object when provided.")
  }

  const productId = normalizeProductId(body.productId ?? body.product?.id)
  const requestProduct =
    body.product && typeof body.product === "object"
      ? {
          ...body.product,
          id: normalizeProductId(body.product.id),
          product_id: normalizeProductId(
            body.product.product_id ?? body.product.id
          ),
        }
      : null

  return {
    ok: true,
    value: {
      body,
      force,
      deepSearch,
      productId,
      productIds: [],
      requestProduct,
    },
  }
}
