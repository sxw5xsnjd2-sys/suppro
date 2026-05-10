const MAX_REQUEST_BYTES = 4_096
const MAX_APPLE_USER_ID_LENGTH = 255
const MAX_EMAIL_LENGTH = 320

function trimString(value) {
  return typeof value === "string" ? value.trim() : ""
}

function getByteLength(value) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(String(value ?? "")).length
  }

  return String(value ?? "").length
}

function normalizeEmail(value) {
  return trimString(value).toLowerCase()
}

function isLikelyEmail(value) {
  return /^\S+@\S+\.\S+$/.test(value)
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

export function userHasAppleProvider(user) {
  const identities = Array.isArray(user?.identities) ? user.identities : []

  if (
    identities.some(
      (identity) =>
        identity &&
        typeof identity === "object" &&
        trimString(identity.provider) === "apple"
    )
  ) {
    return true
  }

  const appMetadata =
    user?.app_metadata && typeof user.app_metadata === "object"
      ? user.app_metadata
      : null
  const providers = Array.isArray(appMetadata?.providers)
    ? appMetadata.providers
    : []

  return providers.some((provider) => trimString(provider) === "apple")
}

export function getAuthenticatedAppleAccount(user) {
  const identities = Array.isArray(user?.identities) ? user.identities : []
  const appleIds = new Set()
  const appleEmails = new Set()

  for (const identity of identities) {
    if (!identity || typeof identity !== "object") {
      continue
    }

    if (trimString(identity.provider) !== "apple") {
      continue
    }

    const identityData =
      identity.identity_data && typeof identity.identity_data === "object"
        ? identity.identity_data
        : null

    ;[
      trimString(identity.id),
      trimString(identity.identity_id),
      trimString(identity.user_id),
      trimString(identityData?.sub),
    ]
      .filter(Boolean)
      .forEach((candidateId) => appleIds.add(candidateId))

    const identityEmail = normalizeEmail(identityData?.email)
    if (identityEmail) {
      appleEmails.add(identityEmail)
    }
  }

  const userEmail = normalizeEmail(user?.email)
  if (userEmail && userHasAppleProvider(user)) {
    appleEmails.add(userEmail)
  }

  return {
    hasAppleProvider: userHasAppleProvider(user),
    appleIds,
    appleEmails,
  }
}

export function validateLookupAppleAccountRequest(rawBodyText) {
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

  let parsed
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return buildInvalidPayloadResponse("Request body must be valid JSON.")
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return buildInvalidPayloadResponse("Request body must be a JSON object.")
  }

  const appleUserId = trimString(parsed.appleUserId).slice(
    0,
    MAX_APPLE_USER_ID_LENGTH
  )
  const email = normalizeEmail(parsed.email).slice(0, MAX_EMAIL_LENGTH)

  if (!appleUserId && !email) {
    return buildInvalidPayloadResponse("appleUserId or email is required.")
  }

  if (email && !isLikelyEmail(email)) {
    return buildInvalidPayloadResponse("Invalid email.")
  }

  return {
    ok: true,
    value: {
      appleUserId,
      email,
    },
  }
}
