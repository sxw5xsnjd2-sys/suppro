export const EDGE_FUNCTION_QUOTAS = {
  "ai-supplement-chat": {
    quotaKey: "ai_supplement_chat",
    functionName: "ai-supplement",
    shortWindowSeconds: 60,
    shortWindowLimit: 6,
    dailyLimit: 100,
    shortWindowMessage:
      "Too many AI chat requests. Please wait a minute and try again.",
    dailyLimitMessage:
      "Daily AI chat limit reached. Please try again tomorrow.",
  },
  "ai-supplement-summary": {
    quotaKey: "ai_supplement_summary",
    functionName: "ai-supplement",
    shortWindowSeconds: 60,
    shortWindowLimit: 10,
    dailyLimit: 200,
    shortWindowMessage:
      "Too many AI summary requests. Please wait a minute and try again.",
    dailyLimitMessage:
      "Daily AI summary limit reached. Please try again tomorrow.",
  },
  "scan-supplement-photos": {
    quotaKey: "scan_supplement_photos",
    functionName: "scan-supplement-photos",
    shortWindowSeconds: 600,
    shortWindowLimit: 4,
    dailyLimit: 30,
    shortWindowMessage:
      "Too many photo scan requests. Please wait a few minutes and try again.",
    dailyLimitMessage:
      "Daily photo scan limit reached. Please try again tomorrow.",
  },
  "enrich-product-image": {
    quotaKey: "enrich_product_image",
    functionName: "enrich-product-image",
    shortWindowSeconds: 600,
    shortWindowLimit: 2,
    dailyLimit: 20,
    shortWindowMessage:
      "Too many image enrichment requests. Please wait a few minutes and try again.",
    dailyLimitMessage:
      "Daily image enrichment limit reached. Please try again tomorrow.",
  },
}

export function getEdgeFunctionQuotaPolicy(policyKey) {
  if (typeof policyKey !== "string") {
    return null
  }

  return EDGE_FUNCTION_QUOTAS[policyKey] ?? null
}

export function buildQuotaExceededBody(policy, result) {
  const code =
    result?.code === "daily_quota_exceeded"
      ? "daily_quota_exceeded"
      : "rate_limit_exceeded"
  const retryAfterSeconds =
    Number.isFinite(result?.retry_after_seconds) && result.retry_after_seconds > 0
      ? Math.ceil(result.retry_after_seconds)
      : policy.shortWindowSeconds

  return {
    error:
      code === "daily_quota_exceeded"
        ? policy.dailyLimitMessage
        : policy.shortWindowMessage,
    code,
    retryAfterSeconds,
  }
}
