const MAX_REQUEST_BYTES = 150_000

function getByteLength(value) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(String(value ?? "")).length
  }

  return String(value ?? "").length
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : ""
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

export function validateAiSupplementRequest(rawBodyText) {
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

  const mode = body.mode === "chat" ? "chat" : "summary"
  const stats = body.stats

  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return buildInvalidPayloadResponse("Missing stats payload.")
  }

  if (mode === "chat" && !trimString(body.question)) {
    return buildInvalidPayloadResponse("Missing question for chat mode.")
  }

  return {
    ok: true,
    value: {
      body,
      mode,
    },
  }
}

export function buildAiChatResponse({ decision, reply }) {
  return {
    decision: decision === "answer" ? "answer" : "refuse",
    reply: trimString(reply),
  }
}

export function buildAiSummaryResponse({ summary, recommendations }) {
  return {
    summary: trimString(summary),
    recommendations: Array.isArray(recommendations) ? recommendations : [],
  }
}
