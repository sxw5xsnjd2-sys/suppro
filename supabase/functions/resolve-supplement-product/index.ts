import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceEdgeFunctionQuota } from "../_shared/quota.ts";
import {
  authenticateSupabaseUser,
  assertActiveRevenueCatEntitlement,
} from "../_shared/revenuecat.ts";
import {
  normalizeFederatedCandidate,
  validateResolveProductRequest,
} from "../_shared/federated-product-search-policy.js";
import {
  createFederatedDiagnosticLogger,
  resolveExternalCandidate,
} from "../_shared/federated-product-providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const eanSearchToken = Deno.env.get("EAN_SEARCH_TOKEN") ?? "";
const goUpcApiKey = Deno.env.get("GO_UPC_API_KEY") ?? "";
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;
const logDiagnostic = createFederatedDiagnosticLogger(
  "resolve-supplement-product",
  [eanSearchToken, goUpcApiKey, serviceRoleKey],
);

function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!adminSupabase) return jsonResponse({ error: "Missing Supabase service configuration." }, 500);

  const authenticatedUser = await authenticateSupabaseUser({
    adminSupabase,
    authHeader: req.headers.get("Authorization"),
  });
  if (!authenticatedUser.ok) return jsonResponse(authenticatedUser.body, authenticatedUser.status);
  const entitlement = await assertActiveRevenueCatEntitlement({ userId: authenticatedUser.user.id });
  if (!entitlement.ok) return jsonResponse(entitlement.body, entitlement.status);
  const quota = await enforceEdgeFunctionQuota({
    adminSupabase,
    policyKey: "resolve-supplement-product",
    userId: authenticatedUser.user.id,
  });
  if (quota.ok === false) {
    return jsonResponse(quota.body, quota.status, quota.headers);
  }

  const validation = validateResolveProductRequest(await req.text());
  if (!validation.ok) return jsonResponse(validation.body, validation.status);
  const { requestId, candidate } = validation.value;

  try {
    const result = await resolveExternalCandidate({
      candidate,
      adminSupabase,
      supabaseUrl,
      serviceRoleKey,
      goUpcApiKey,
    });
    return jsonResponse({
      requestId,
      status: result?.canonicalProductId ? "resolved" : "incomplete",
      product: result ?? normalizeFederatedCandidate(candidate, candidate.provider),
    });
  } catch (error) {
    logDiagnostic("resolve", error);
    return jsonResponse({
      requestId,
      status: "incomplete",
      product: normalizeFederatedCandidate({
        ...candidate,
        completenessStatus: "incomplete",
        evidenceSnapshot: null,
      }, candidate.provider),
    });
  }
});
