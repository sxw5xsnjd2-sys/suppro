import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedEdgeFunctionRequest } from "../_shared/auth-policy.js";
import {
  createSupabaseProductImageRefreshRepository,
  MAX_PRODUCT_IMAGE_REFRESH_BATCH,
  PRODUCT_IMAGE_REFRESH_DAILY_LIMIT,
  runProductImageRefresh,
} from "../_shared/product-image-refresh-worker.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const internalServiceRoleKey = Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") ?? "";
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBoundedInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : null;
}

async function invokeSharedImageEnrichment(productId: string) {
  const authorizationCredential = internalServiceRoleKey || serviceRoleKey;
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/u, "")}/functions/v1/enrich-product-image`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorizationCredential}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productId }),
    },
  );
  const body = await response.json().catch(() => null);

  if (body?.status && ["found", "cached", "failed", "skipped"].includes(body.status)) {
    return body;
  }
  const error = new Error(
    typeof body?.error === "string"
      ? body.error
      : `Image enrichment failed with status ${response.status}.`,
  ) as Error & { retryAfterSeconds?: number };
  const retryAfterSeconds = Number(
    body?.retryAfterSeconds ?? response.headers.get("Retry-After"),
  );
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    error.retryAfterSeconds = retryAfterSeconds;
  }
  throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!adminSupabase || !(internalServiceRoleKey || serviceRoleKey)) {
    return jsonResponse({ error: "Missing Supabase service configuration." }, 500);
  }
  if (
    !isTrustedEdgeFunctionRequest({
      authorizationHeader: req.headers.get("Authorization") ?? "",
      apiKeyHeader: req.headers.get("apikey") ?? "",
      serviceRoleKey,
      internalServiceRoleKey,
    })
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const limit = parseBoundedInteger(
    body?.limit,
    MAX_PRODUCT_IMAGE_REFRESH_BATCH,
    MAX_PRODUCT_IMAGE_REFRESH_BATCH,
  );
  const dailyLimit = parseBoundedInteger(
    body?.dailyLimit,
    PRODUCT_IMAGE_REFRESH_DAILY_LIMIT,
    5000,
  );
  if (!limit || !dailyLimit) {
    return jsonResponse({ error: "Invalid image refresh limits." }, 400);
  }

  try {
    const result = await runProductImageRefresh({
      repository: createSupabaseProductImageRefreshRepository(adminSupabase),
      enrichProduct: invokeSharedImageEnrichment,
      limit,
      dailyLimit,
      workerId: `edge:${crypto.randomUUID()}`,
    });
    return jsonResponse({ limit, dailyLimit, ...result });
  } catch (error) {
    console.error("[refresh-product-images] bounded refresh failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Product image refresh failed." }, 500);
  }
});
