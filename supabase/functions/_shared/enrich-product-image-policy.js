const MAX_REQUEST_BYTES = 60_000
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
      requestProduct,
    },
  }
}
