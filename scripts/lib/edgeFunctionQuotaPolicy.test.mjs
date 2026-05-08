import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function loadEdgeFunctionQuotaPolicyModule() {
  const source = readFileSync(
    new URL("../../supabase/functions/_shared/quota-policy.js", import.meta.url),
    "utf8"
  )

  const transformed = source
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")

  const factory = new Function(
    `${transformed}
return {
  EDGE_FUNCTION_QUOTAS,
  getEdgeFunctionQuotaPolicy,
  buildQuotaExceededBody,
};`
  )

  return factory()
}

test("scan and image enrichment quotas stay stricter than AI chat", () => {
  const { getEdgeFunctionQuotaPolicy } = loadEdgeFunctionQuotaPolicyModule()

  const chat = getEdgeFunctionQuotaPolicy("ai-supplement-chat")
  const scan = getEdgeFunctionQuotaPolicy("scan-supplement-photos")
  const enrich = getEdgeFunctionQuotaPolicy("enrich-product-image")
  const queue = getEdgeFunctionQuotaPolicy("queue-missing-active-ingredients")

  assert.equal(chat.shortWindowSeconds, 60)
  assert.equal(chat.shortWindowLimit, 6)
  assert.equal(chat.dailyLimit, 100)

  assert.equal(scan.shortWindowSeconds, 600)
  assert.equal(scan.shortWindowLimit, 4)
  assert.equal(scan.dailyLimit, 30)

  assert.equal(enrich.shortWindowSeconds, 600)
  assert.equal(enrich.shortWindowLimit, 2)
  assert.equal(enrich.dailyLimit, 20)

  assert.equal(queue.shortWindowSeconds, 600)
  assert.equal(queue.shortWindowLimit, 10)
  assert.equal(queue.dailyLimit, 50)

  assert.ok(enrich.shortWindowLimit < scan.shortWindowLimit)
  assert.ok(scan.shortWindowLimit < chat.shortWindowLimit)
  assert.ok(queue.shortWindowLimit >= scan.shortWindowLimit)
})

test("quota exceeded body distinguishes short-window throttles from daily caps", () => {
  const { buildQuotaExceededBody, getEdgeFunctionQuotaPolicy } =
    loadEdgeFunctionQuotaPolicyModule()

  const policy = getEdgeFunctionQuotaPolicy("scan-supplement-photos")
  const shortWindowBody = buildQuotaExceededBody(policy, {
    code: "rate_limit_exceeded",
    retry_after_seconds: 120,
  })
  const dailyBody = buildQuotaExceededBody(policy, {
    code: "daily_quota_exceeded",
    retry_after_seconds: 3600,
  })

  assert.deepEqual(shortWindowBody, {
    error: "Too many photo scan requests. Please wait a few minutes and try again.",
    code: "rate_limit_exceeded",
    retryAfterSeconds: 120,
  })
  assert.deepEqual(dailyBody, {
    error: "Daily photo scan limit reached. Please try again tomorrow.",
    code: "daily_quota_exceeded",
    retryAfterSeconds: 3600,
  })
})
