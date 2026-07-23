import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedEdgeFunctionRequest } from "../_shared/auth-policy.js";
import {
  createSupabaseProductScoreRepository,
  MAX_PRODUCT_SCORE_REFRESH_BATCH,
  PRODUCT_SCORE_CALCULATION_VERSION,
  runProductScoreRefresh,
} from "../_shared/product-ranking-worker.js";

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

function parseLimit(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) &&
      parsed >= 1 &&
      parsed <= MAX_PRODUCT_SCORE_REFRESH_BATCH
    ? parsed
    : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!adminSupabase) {
    return jsonResponse(
      { error: "Missing Supabase service configuration." },
      500,
    );
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const limit = parseLimit(body.limit ?? MAX_PRODUCT_SCORE_REFRESH_BATCH);
  const productIds = body.productIds;
  const calculationVersion = typeof body.calculationVersion === "string"
    ? body.calculationVersion.trim()
    : PRODUCT_SCORE_CALCULATION_VERSION;
  const write = body.write !== false;
  if (!limit) {
    return jsonResponse(
      {
        error:
          `limit must be between 1 and ${MAX_PRODUCT_SCORE_REFRESH_BATCH}.`,
      },
      400,
    );
  }
  if (!calculationVersion || calculationVersion.length > 120) {
    return jsonResponse(
      { error: "calculationVersion must contain 1 to 120 characters." },
      400,
    );
  }
  if (productIds !== undefined && !Array.isArray(productIds)) {
    return jsonResponse(
      { error: "productIds must be an array when supplied." },
      400,
    );
  }
  if (Array.isArray(productIds) && productIds.length > limit) {
    return jsonResponse(
      { error: "productIds exceeds the bounded request limit." },
      400,
    );
  }
  if (!write && !Array.isArray(productIds)) {
    return jsonResponse(
      { error: "Dry-run requests must supply explicit productIds." },
      400,
    );
  }

  try {
    const result = await runProductScoreRefresh({
      repository: createSupabaseProductScoreRepository(adminSupabase),
      productIds: Array.isArray(productIds) ? productIds : null,
      limit,
      workerId: `edge:${crypto.randomUUID()}`,
      calculationVersion,
      write,
    });
    return jsonResponse({
      calculationVersion,
      dryRun: !write,
      ...result,
    });
  } catch (error) {
    console.error("[refresh-product-scores] bounded refresh failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Product score refresh failed." }, 500);
  }
});
