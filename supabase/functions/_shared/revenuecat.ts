import {
  parseBearerToken,
  resolveSupabaseAuthResult,
} from "./auth-policy.js"

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSecretToken(value: unknown) {
  return trimString(value)
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function getRevenueCatSecretApiKey() {
  return normalizeSecretToken(Deno.env.get("REVENUECAT_SECRET_API_KEY"));
}

function getRevenueCatEntitlementId() {
  return (
    trimString(Deno.env.get("EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID")) ||
    "Suppro Premium"
  );
}

function logRevenueCatEntitlementError(message: string, details?: unknown) {
  const edgeFunctionDebugFlag = trimString(
    Deno.env.get("EDGE_FUNCTION_DEBUG_LOGS")
  ).toLowerCase();
  const verboseLoggingEnabled =
    edgeFunctionDebugFlag === "1" ||
    edgeFunctionDebugFlag === "true" ||
    edgeFunctionDebugFlag === "yes" ||
    edgeFunctionDebugFlag === "on" ||
    !trimString(Deno.env.get("DENO_DEPLOYMENT_ID"));

  if (!verboseLoggingEnabled || typeof details === "undefined") {
    console.error(message);
    return;
  }

  console.error(message, details);
}

function parseTimestamp(value: unknown) {
  const text = trimString(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRevenueCatEntitlementActive(entitlement: Record<string, unknown> | null) {
  if (!entitlement || typeof entitlement !== "object") {
    return false;
  }

  const expiresAt = parseTimestamp(entitlement.expires_date);
  const gracePeriodExpiresAt = parseTimestamp(entitlement.grace_period_expires_date);
  const latestExpiry = Math.max(expiresAt ?? -1, gracePeriodExpiresAt ?? -1);

  if (latestExpiry < 0) {
    return true;
  }

  return latestExpiry > Date.now();
}

export async function authenticateSupabaseUser({
  adminSupabase,
  authHeader,
}: {
  adminSupabase: any;
  authHeader: string | null;
}) {
  const token = parseBearerToken(authHeader ?? "")
  if (!token) {
    return resolveSupabaseAuthResult({ authHeader })
  }

  const {
    data: { user },
    error: authError,
  } = await adminSupabase.auth.getUser(token)

  return resolveSupabaseAuthResult({
    authHeader,
    user,
    authError,
  })
}

export async function assertActiveRevenueCatEntitlement({
  userId,
}: {
  userId: string;
}) {
  const revenueCatSecretApiKey = getRevenueCatSecretApiKey();
  const entitlementId = getRevenueCatEntitlementId();

  if (!revenueCatSecretApiKey) {
    return {
      ok: false as const,
      status: 500,
      body: {
        error: "Missing REVENUECAT_SECRET_API_KEY secret.",
      },
    };
  }

  const response = await fetch(
    `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(userId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${revenueCatSecretApiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    logRevenueCatEntitlementError(
      "[revenuecat] entitlement check failed",
      {
        status: response.status,
        upstreamErrorPresent: Boolean(trimString(errorText)),
      }
    );
    return {
      ok: false as const,
      status: 502,
      body: {
        error: "RevenueCat entitlement check failed.",
        code: "revenuecat_entitlement_unavailable",
      },
    };
  }

  const payload = await response.json().catch(() => null);
  const entitlement =
    payload?.subscriber?.entitlements &&
    typeof payload.subscriber.entitlements === "object"
      ? payload.subscriber.entitlements[entitlementId] ?? null
      : null;

  if (!isRevenueCatEntitlementActive(entitlement)) {
    return {
      ok: false as const,
      status: 403,
      body: {
        error: "Active premium subscription required.",
        code: "premium_entitlement_required",
      },
    };
  }

  return {
    ok: true as const,
  };
}
