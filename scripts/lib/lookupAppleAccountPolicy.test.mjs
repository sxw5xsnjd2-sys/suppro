import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function loadLookupAppleAccountPolicyModule() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/_shared/lookup-apple-account-policy.js",
      import.meta.url
    ),
    "utf8"
  )

  const transformed = source.replace(/export function /g, "function ")

  const factory = new Function(
    `${transformed}
return {
  userHasAppleProvider,
  getAuthenticatedAppleAccount,
  validateLookupAppleAccountRequest,
};`
  )

  return factory()
}

test("lookup validator rejects invalid payloads and oversized bodies", () => {
  const { validateLookupAppleAccountRequest } =
    loadLookupAppleAccountPolicyModule()

  assert.deepEqual(validateLookupAppleAccountRequest("not json"), {
    ok: false,
    status: 400,
    body: {
      error: "Request body must be valid JSON.",
      code: "invalid_request_payload",
    },
  })

  assert.deepEqual(
    validateLookupAppleAccountRequest(
      JSON.stringify({ email: `${"a".repeat(5000)}@example.com` })
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

test("lookup validator normalizes accepted email requests", () => {
  const { validateLookupAppleAccountRequest } =
    loadLookupAppleAccountPolicyModule()

  assert.deepEqual(
    validateLookupAppleAccountRequest(
      JSON.stringify({ email: "  USER@Example.com " })
    ),
    {
      ok: true,
      value: {
        appleUserId: "",
        email: "user@example.com",
      },
    }
  )
})

test("apple account helper only trusts authenticated apple-linked identities", () => {
  const { userHasAppleProvider, getAuthenticatedAppleAccount } =
    loadLookupAppleAccountPolicyModule()
  const user = {
    email: "relay@example.com",
    identities: [
      {
        provider: "apple",
        id: "apple-id-1",
        identity_id: "apple-identity-1",
        user_id: "apple-user-1",
        identity_data: {
          sub: "apple-sub-1",
          email: "relay@example.com",
        },
      },
      {
        provider: "google",
        identity_data: {
          email: "other@example.com",
        },
      },
    ],
    app_metadata: {
      providers: ["apple", "google"],
    },
  }

  const account = getAuthenticatedAppleAccount(user)

  assert.equal(userHasAppleProvider(user), true)
  assert.equal(account.hasAppleProvider, true)
  assert.equal(account.appleIds.has("apple-id-1"), true)
  assert.equal(account.appleIds.has("apple-sub-1"), true)
  assert.equal(account.appleEmails.has("relay@example.com"), true)
  assert.equal(account.appleEmails.has("other@example.com"), false)
})
