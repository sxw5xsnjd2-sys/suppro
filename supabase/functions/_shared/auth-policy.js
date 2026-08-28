function trimString(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeSecretToken(value) {
  return trimString(value)
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim()
}

function decodeBase64Text(value) {
  if (typeof atob === "function") {
    return atob(value)
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8")
  }

  throw new Error("No base64 decoder available.")
}

export function parseBearerToken(authHeader) {
  const match = trimString(authHeader).match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ""
}

export function parseJwtPayload(token) {
  const normalizedToken = trimString(token)
  if (!normalizedToken) {
    return null
  }

  try {
    const [, payload] = normalizedToken.split(".")
    if (!payload) return null

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    )
    return JSON.parse(decodeBase64Text(padded))
  } catch {
    return null
  }
}

export function isServiceRoleAuthorization(authHeader) {
  const token = parseBearerToken(authHeader)
  const payload = parseJwtPayload(token)
  return payload?.role === "service_role"
}

export function isTrustedEdgeFunctionRequest({
  authorizationHeader = "",
  apiKeyHeader = "",
  serviceRoleKey = "",
  internalServiceRoleKey = "",
} = {}) {
  const trustedKeys = [internalServiceRoleKey, serviceRoleKey]
    .map(normalizeSecretToken)
    .filter(Boolean)
  const candidateAuthorization = normalizeSecretToken(
    parseBearerToken(authorizationHeader)
  )
  if (
    candidateAuthorization &&
    isServiceRoleAuthorization(authorizationHeader) &&
    trustedKeys.includes(candidateAuthorization)
  ) {
    return true
  }

  const candidateApiKey = normalizeSecretToken(apiKeyHeader)
  if (!candidateApiKey) {
    return false
  }

  return trustedKeys.includes(candidateApiKey)
}

export function resolveSupabaseAuthResult({
  authHeader = "",
  user = null,
  authError = null,
} = {}) {
  if (!parseBearerToken(authHeader)) {
    return {
      ok: false,
      status: 401,
      body: { error: "Unauthorized" },
    }
  }

  if (authError || !user || user.is_anonymous === true) {
    return {
      ok: false,
      status: 401,
      body: { error: "Unauthorized" },
    }
  }

  return {
    ok: true,
    user,
  }
}
