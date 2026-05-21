const MAX_REQUEST_BYTES = 8_000_000
const RETAIL_BARCODE_TYPES = new Set(["ean13", "ean8", "upc_a", "upc_e"])
const ALPHANUMERIC_BARCODE_TYPES = new Set(["code128", "code39", "code93"])
const SAFE_ALPHANUMERIC_BARCODE_PATTERN = /^[A-Za-z0-9._-]{4,40}$/

function trimString(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeWhitespace(value) {
  return trimString(value).replace(/\s+/g, " ").trim()
}

function canonicalizeBarcodeType(value) {
  const rawType = trimString(value)
  if (!rawType) {
    return ""
  }

  const lowered = rawType.toLowerCase()

  if (lowered.includes("ean13") || lowered.includes("ean-13")) {
    return "ean13"
  }

  if (lowered.includes("ean8") || lowered.includes("ean-8")) {
    return "ean8"
  }

  if (
    lowered.includes("upca") ||
    lowered.includes("upc-a") ||
    lowered.includes("upc_a")
  ) {
    return "upc_a"
  }

  if (
    lowered.includes("upce") ||
    lowered.includes("upc-e") ||
    lowered.includes("upc_e")
  ) {
    return "upc_e"
  }

  if (
    lowered.includes("code128") ||
    lowered.includes("code-128") ||
    lowered.includes("code_128")
  ) {
    return "code128"
  }

  if (
    lowered.includes("code39") ||
    lowered.includes("code-39") ||
    lowered.includes("code_39")
  ) {
    return "code39"
  }

  if (
    lowered.includes("code93") ||
    lowered.includes("code-93") ||
    lowered.includes("code_93")
  ) {
    return "code93"
  }

  return lowered
}

function getByteLength(value) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(String(value ?? "")).length
  }

  return String(value ?? "").length
}

function normalizeBarcode(value, barcodeType) {
  const rawBarcode = trimString(value)
  const normalizedType = canonicalizeBarcodeType(barcodeType)

  if (RETAIL_BARCODE_TYPES.has(normalizedType)) {
    const cleaned = rawBarcode.replace(/\D/g, "")

    if (normalizedType === "ean13" && /^\d{12}$/.test(cleaned)) {
      return `0${cleaned}`
    }

    return cleaned
  }

  return rawBarcode
}

function isValidBarcode(barcode, barcodeType) {
  const normalizedType = canonicalizeBarcodeType(barcodeType)

  if (normalizedType === "ean13") {
    return /^\d{13}$/.test(barcode)
  }

  if (normalizedType === "ean8") {
    return /^\d{8}$/.test(barcode)
  }

  if (normalizedType === "upc_a") {
    return /^\d{12}$/.test(barcode)
  }

  if (normalizedType === "upc_e") {
    return /^\d{6,8}$/.test(barcode)
  }

  if (ALPHANUMERIC_BARCODE_TYPES.has(normalizedType)) {
    return SAFE_ALPHANUMERIC_BARCODE_PATTERN.test(barcode)
  }

  return SAFE_ALPHANUMERIC_BARCODE_PATTERN.test(barcode)
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
  const barcodeType = canonicalizeBarcodeType(body.barcodeType)
  const barcode = normalizeBarcode(body.barcode, barcodeType)
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

  if (!isValidBarcode(barcode, barcodeType)) {
    return buildInvalidPayloadResponse("Invalid barcode.")
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
      barcodeType,
      ingredientsImage,
      productImage,
      currentProduct,
      requestedProductId,
    },
  }
}
