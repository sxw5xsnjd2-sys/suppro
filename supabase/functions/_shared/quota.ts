import {
  buildQuotaExceededBody,
  getEdgeFunctionQuotaPolicy,
} from "./quota-policy.js"

type QuotaCheckResult = {
  allowed: boolean
  code: string
  retry_after_seconds: number | null
  short_window_count: number
  daily_count: number
}

type EnforceEdgeFunctionQuotaArgs = {
  adminSupabase: any
  policyKey: string
  userId: string
}

type EnforceEdgeFunctionQuotaResult =
  | {
      ok: true
      policy: NonNullable<ReturnType<typeof getEdgeFunctionQuotaPolicy>>
      result: QuotaCheckResult
    }
  | {
      ok: false
      status: number
      body: {
        error: string
        code?: string
        retryAfterSeconds?: number
      }
      headers?: Record<string, string>
    }

export async function enforceEdgeFunctionQuota({
  adminSupabase,
  policyKey,
  userId,
}: EnforceEdgeFunctionQuotaArgs): Promise<EnforceEdgeFunctionQuotaResult> {
  const policy = getEdgeFunctionQuotaPolicy(policyKey)
  if (!policy) {
    throw new Error(`Unknown edge-function quota policy: ${policyKey}`)
  }

  const { data, error } = await adminSupabase
    .rpc("enforce_edge_function_quota", {
      p_user_id: userId,
      p_quota_key: policy.quotaKey,
      p_short_window_seconds: policy.shortWindowSeconds,
      p_short_window_limit: policy.shortWindowLimit,
      p_daily_limit: policy.dailyLimit,
    })
    .single()

  if (error) {
    console.error("[quota] failed to enforce edge-function quota", {
      functionName: policy.functionName,
      quotaKey: policy.quotaKey,
      message: error.message,
    })
    return {
      ok: false,
      status: 500,
      body: {
        error: "Rate limit check failed.",
      },
    }
  }

  const result = data as QuotaCheckResult | null
  if (!result?.allowed) {
    const body = buildQuotaExceededBody(policy, result)
    return {
      ok: false,
      status: 429,
      body,
      headers: {
        "Retry-After": String(body.retryAfterSeconds),
      },
    }
  }

  return {
    ok: true,
    policy,
    result,
  }
}
