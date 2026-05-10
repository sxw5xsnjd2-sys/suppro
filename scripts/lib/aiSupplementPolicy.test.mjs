import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function loadAiSupplementPolicyModule() {
  const source = readFileSync(
    new URL("../../supabase/functions/_shared/ai-supplement-policy.js", import.meta.url),
    "utf8"
  )

  const transformed = source.replace(/export function /g, "function ")

  const factory = new Function(
    `${transformed}
return {
  validateAiSupplementRequest,
  buildAiChatResponse,
  buildAiSummaryResponse,
};`
  )

  return factory()
}

test("ai-supplement validator rejects invalid and missing payloads", () => {
  const { validateAiSupplementRequest } = loadAiSupplementPolicyModule()

  assert.deepEqual(validateAiSupplementRequest(""), {
    ok: false,
    status: 400,
    body: {
      error: "Missing request body.",
      code: "invalid_request_payload",
    },
  })

  assert.deepEqual(validateAiSupplementRequest("[]"), {
    ok: false,
    status: 400,
    body: {
      error: "Request body must be a JSON object.",
      code: "invalid_request_payload",
    },
  })

  assert.deepEqual(
    validateAiSupplementRequest(JSON.stringify({ mode: "chat", stats: {} })),
    {
      ok: false,
      status: 400,
      body: {
        error: "Missing question for chat mode.",
        code: "invalid_request_payload",
      },
    }
  )
})

test("ai-supplement validator rejects oversized payloads", () => {
  const { validateAiSupplementRequest } = loadAiSupplementPolicyModule()
  const oversized = JSON.stringify({
    mode: "summary",
    stats: {
      raw: "x".repeat(160_000),
    },
  })

  assert.deepEqual(validateAiSupplementRequest(oversized), {
    ok: false,
    status: 413,
    body: {
      error: "Request payload is too large.",
      code: "payload_too_large",
    },
  })
})

test("ai-supplement response builders preserve the public response shape", () => {
  const { buildAiChatResponse, buildAiSummaryResponse } =
    loadAiSupplementPolicyModule()

  assert.deepEqual(
    buildAiChatResponse({ decision: "answer", reply: "  Use sleep support.  " }),
    {
      decision: "answer",
      reply: "Use sleep support.",
    }
  )

  assert.deepEqual(
    buildAiSummaryResponse({
      summary: "  Stable adherence.  ",
      recommendations: ["keep schedule consistency"],
    }),
    {
      summary: "Stable adherence.",
      recommendations: ["keep schedule consistency"],
    }
  )
})
