import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function loadAiSupplementChatModule() {
  const source = readFileSync(
    new URL("../../supabase/functions/_shared/ai-supplement-chat.js", import.meta.url),
    "utf8"
  )

  const transformed = source.replace(/export function /g, "function ")

  const factory = new Function(
    `${transformed}
return {
  resolveAiChatResult,
  isHealthTrackingQuestion,
  fallbackHealthTrackingReply,
  isSupplementContextQuestion,
  fallbackSupplementContextReply,
};`
  )

  return factory()
}

function buildStats(overrides = {}) {
  return {
    supplements: [],
    evidenceCatalog: {
      byBenefit: {},
      benefitRoutes: {},
      bySupplement: {},
    },
    healthMetrics: [
      { key: "sleep", label: "Sleep duration", unit: "hours" },
      { key: "weight", label: "Body weight", unit: "kg" },
      { key: "blood_pressure_control", label: "Blood pressure", unit: null },
    ],
    healthEntries: [
      {
        id: "sleep-1",
        type: "sleep",
        value: 7.1,
        date: "2026-07-05",
        source: "apple_health",
      },
      {
        id: "sleep-2",
        type: "sleep",
        value: 7.8,
        date: "2026-07-06",
        source: "apple_health",
      },
      {
        id: "weight-1",
        type: "weight",
        value: 72.1,
        date: "2026-07-06",
        source: "apple_health",
      },
      {
        id: "bp-1",
        type: "blood_pressure_control",
        value: { systolic: 118, diastolic: 76 },
        date: "2026-07-06",
        source: "apple_health",
      },
    ],
    ...overrides,
  }
}

test("health tracking questions stay in scope even when the model emits refusal-like copy", () => {
  const { resolveAiChatResult, isHealthTrackingQuestion } =
    loadAiSupplementChatModule()
  const question = "What do you think about my health tracking data?"

  assert.equal(isHealthTrackingQuestion(question), true)

  const result = resolveAiChatResult({
    question,
    stats: buildStats(),
    parsedDecision: "answer",
    parsedReply:
      "I can only help with your supplements and Suppro supplement data.",
  })

  assert.equal(result.decision, "answer")
  assert.match(result.reply, /recent tracked data/i)
  assert.match(result.reply, /Sleep duration/i)
  assert.doesNotMatch(result.reply, /I can only help/i)
})

test("Apple Health review requests return an answer using available tracked data", () => {
  const { resolveAiChatResult } = loadAiSupplementChatModule()

  const result = resolveAiChatResult({
    question: "Can you review my Apple Health data?",
    stats: buildStats(),
    parsedDecision: "refuse",
    parsedReply:
      "I can only help with your supplements and Suppro supplement data.",
  })

  assert.equal(result.decision, "answer")
  assert.match(result.reply, /Apple Health data/i)
  assert.match(result.reply, /Sleep duration|Body weight|Blood pressure/i)
})

test("sleep questions get a sleep-focused fallback instead of a refusal", () => {
  const { resolveAiChatResult } = loadAiSupplementChatModule()

  const result = resolveAiChatResult({
    question: "How is my sleep looking?",
    stats: buildStats(),
    parsedDecision: "refuse",
    parsedReply: "",
  })

  assert.equal(result.decision, "answer")
  assert.match(result.reply, /Sleep duration/i)
  assert.match(result.reply, /latest 7\.8 hours/i)
})

test("activity questions stay answerable when no steps or activity entries are present", () => {
  const { resolveAiChatResult } = loadAiSupplementChatModule()

  const result = resolveAiChatResult({
    question: "What do you think about my steps and activity?",
    stats: buildStats(),
    parsedDecision: "refuse",
    parsedReply: "",
  })

  assert.equal(result.decision, "answer")
  assert.match(result.reply, /can't see any recent steps or activity entries/i)
  assert.doesNotMatch(result.reply, /I can only help/i)
})

test("unrelated requests still refuse", () => {
  const { resolveAiChatResult } = loadAiSupplementChatModule()

  const result = resolveAiChatResult({
    question: "Write me a Python script for web scraping.",
    stats: buildStats(),
    parsedDecision: "refuse",
    parsedReply: "",
  })

  assert.equal(result.decision, "refuse")
  assert.match(result.reply, /I can only help with your supplements/i)
})

test("named supplement questions stay in scope even when the supplement is not in the tracked stack", () => {
  const { resolveAiChatResult, isSupplementContextQuestion } =
    loadAiSupplementChatModule()
  const stats = buildStats({
    supplements: [{ id: "omega-3", name: "Omega-3" }],
    evidenceCatalog: {
      byBenefit: {},
      benefitRoutes: {},
      bySupplement: {
        magnesium: {
          id: "magnesium",
          name: "Magnesium",
          evidenceScore: 78,
          benefits: ["Sleep"],
        },
      },
    },
  })

  const question = "How consistent has my magnesium been?"
  assert.equal(isSupplementContextQuestion(question, stats), true)

  const result = resolveAiChatResult({
    question,
    stats,
    parsedDecision: "refuse",
    parsedReply:
      "I can only help with your supplements and Suppro supplement data.",
  })

  assert.equal(result.decision, "answer")
  assert.match(result.reply, /can't see Magnesium in your tracked supplements/i)
  assert.match(result.reply, /Omega-3/i)
  assert.doesNotMatch(result.reply, /I can only help/i)
})
