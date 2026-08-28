import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function loadEdgeAuthPolicyModule() {
  const source = readFileSync(
    new URL("../../supabase/functions/_shared/auth-policy.js", import.meta.url),
    "utf8"
  )

  const transformed = source.replace(/export function /g, "function ")

  const factory = new Function(
    `${transformed}
return {
  parseBearerToken,
  parseJwtPayload,
  isServiceRoleAuthorization,
  isTrustedEdgeFunctionRequest,
  resolveSupabaseAuthResult,
};`
  )

  return factory()
}

function createJwt(payload) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value), "utf8")
      .toString("base64url")
      .replace(/=/g, "")

  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`
}

test("missing auth is rejected before any user lookup result matters", () => {
  const { resolveSupabaseAuthResult } = loadEdgeAuthPolicyModule()

  assert.deepEqual(resolveSupabaseAuthResult({ authHeader: "" }), {
    ok: false,
    status: 401,
    body: { error: "Unauthorized" },
  })
})

test("anonymous Supabase users are rejected while real users are allowed", () => {
  const { resolveSupabaseAuthResult } = loadEdgeAuthPolicyModule()

  assert.deepEqual(
    resolveSupabaseAuthResult({
      authHeader: "Bearer token",
      user: { id: "anon-user", is_anonymous: true },
    }),
    {
      ok: false,
      status: 401,
      body: { error: "Unauthorized" },
    }
  )

  const authenticated = resolveSupabaseAuthResult({
    authHeader: "Bearer token",
    user: { id: "real-user", is_anonymous: false },
  })

  assert.equal(authenticated.ok, true)
  assert.equal(authenticated.user.id, "real-user")
})

test("trusted edge requests accept service role jwt or trusted api keys", () => {
  const {
    parseBearerToken,
    parseJwtPayload,
    isServiceRoleAuthorization,
    isTrustedEdgeFunctionRequest,
  } = loadEdgeAuthPolicyModule()
  const serviceRoleJwt = createJwt({ role: "service_role" })

  assert.equal(parseBearerToken(`Bearer ${serviceRoleJwt}`), serviceRoleJwt)
  assert.equal(parseJwtPayload(serviceRoleJwt).role, "service_role")
  assert.equal(isServiceRoleAuthorization(`Bearer ${serviceRoleJwt}`), true)
  assert.equal(
    isTrustedEdgeFunctionRequest({
      authorizationHeader: `Bearer ${serviceRoleJwt}`,
      serviceRoleKey: serviceRoleJwt,
    }),
    true
  )
  assert.equal(
    isTrustedEdgeFunctionRequest({
      apiKeyHeader: "service-role-secret",
      serviceRoleKey: "service-role-secret",
    }),
    true
  )
  assert.equal(
    isTrustedEdgeFunctionRequest({
      apiKeyHeader: "anon-public-key",
      serviceRoleKey: "service-role-secret",
      internalServiceRoleKey: "internal-secret",
    }),
    false
  )

  const forgedServiceRoleJwt = createJwt({ role: "service_role" })
  assert.equal(
    isTrustedEdgeFunctionRequest({
      authorizationHeader: `Bearer ${forgedServiceRoleJwt}`,
      serviceRoleKey: "different-configured-key",
    }),
    false
  )

  assert.equal(
    isTrustedEdgeFunctionRequest({
      authorizationHeader: "Bearer sb_secret_example",
      internalServiceRoleKey: "sb_secret_example",
    }),
    false
  )
  assert.equal(
    isTrustedEdgeFunctionRequest({
      apiKeyHeader: "sb_secret_example",
      internalServiceRoleKey: "sb_secret_example",
    }),
    true
  )
})

test("photo review worker authenticates opaque internal calls inside the function", () => {
  const worker = readFileSync(
    new URL(
      "../../supabase/functions/process-photo-rescue-reviews/index.ts",
      import.meta.url
    ),
    "utf8"
  )
  const scanner = readFileSync(
    new URL(
      "../../supabase/functions/scan-supplement-photos/index.ts",
      import.meta.url
    ),
    "utf8"
  )
  const config = readFileSync(
    new URL("../../supabase/config.toml", import.meta.url),
    "utf8"
  )

  assert.match(worker, /isTrustedEdgeFunctionRequest/u)
  assert.match(worker, /apiKeyHeader:\s*req\.headers\.get\("apikey"\)/u)
  assert.match(scanner, /apikey:\s*reviewRefreshKey/u)
  assert.match(scanner, /\.\.\.getLatencyTraceHeaders\(telemetry\)/u)
  assert.match(
    config,
    /\[functions\.process-photo-rescue-reviews\][\s\S]*?verify_jwt = false[\s\S]*?process-photo-rescue-reviews\/index\.ts/u
  )
})
