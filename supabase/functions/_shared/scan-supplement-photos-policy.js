const MAX_REQUEST_BYTES = 8_000_000

function trimString(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeWhitespace(value) {
  return trimString(value).replace(/\s+/g, " ").trim()
}

function getByteLength(value) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(String(value ?? "")).length
  }

  return String(value ?? "").length
}

function normalizeBarcode(value) {
  return String(value ?? "").replace(/\D/g, "")
}

function parseIntegerLike(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function sanitizeImageDataUrl(value) {
  const dataUrl = trimString(value)
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl) ? dataUrl : ""
}

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => normalizeWhitespace(item)).filter(Boolean)
}

function sanitizeCurrentProduct(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return {
    productId: trimString(value.productId),
    productName: normalizeWhitespace(value.productName),
    ingredientsText: normalizeWhitespace(value.ingredientsText),
    sourceIngredients: sanitizeStringArray(value.sourceIngredients).slice(0, 80),
    sourceStatusVerbose: trimString(value.sourceStatusVerbose),
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

export function validateScanSupplementPhotosRequest(rawBodyText) {
  const bodyText = typeof rawBodyText === "string" ? rawBodyText : ""

  if (!bodyText.trim()) {
    return buildInvalidPayloadResponse("Missing request body.")
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

  const scanSessionId = parseIntegerLike(body.scanSessionId)
  const barcode = normalizeBarcode(body.barcode)
  const ingredientsImage = sanitizeImageDataUrl(body.ingredientsImage)
  const productImage = sanitizeImageDataUrl(body.productImage)
  const currentProduct = sanitizeCurrentProduct(body.currentProduct)
  const requestedProductId =
    trimString(body.productId) || trimString(currentProduct?.productId)

  if (!Number.isFinite(scanSessionId) || (scanSessionId ?? 0) <= 0) {
    return buildInvalidPayloadResponse("Missing scanSessionId.")
  }

  if (!barcode) {
    return buildInvalidPayloadResponse("Missing barcode.")
  }

  if (!ingredientsImage || !productImage) {
    return buildInvalidPayloadResponse(
      "Both ingredientsImage and productImage are required."
    )
  }

  return {
    ok: true,
    value: {
      body,
      scanSessionId,
      barcode,
      ingredientsImage,
      productImage,
      currentProduct,
      requestedProductId,
    },
  }
}
