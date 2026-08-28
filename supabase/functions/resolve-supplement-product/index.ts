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
import { instrumentEdgeRequest } from "../../../src/lib/latencyTelemetry.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trace-id, x-latency-flow, x-latency-action",
  "Access-Control-Expose-Headers": "x-trace-id, x-edge-duration-ms, server-timing",
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
  return instrumentEdgeRequest(
    req,
    {
      flow: "external_product_selection",
      action: "select_external_product",
    },
    async (telemetry) => {
      if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }
      if (!adminSupabase) {
        return jsonResponse({ error: "Missing Supabase service configuration." }, 500);
      }

      const finishAuthentication = telemetry.start("authentication", {
        provider: "supabase",
      });
      let authenticatedUser;
      try {
        authenticatedUser = await authenticateSupabaseUser({
          adminSupabase,
          authHeader: req.headers.get("Authorization"),
        });
        finishAuthentication({
          httpStatus: authenticatedUser.status,
          success: authenticatedUser.ok,
        });
      } catch (error) {
        finishAuthentication({ success: false, error });
        throw error;
      }
      if (!authenticatedUser.ok) {
        return jsonResponse(authenticatedUser.body, authenticatedUser.status);
      }

      const finishEntitlement = telemetry.start("revenuecat_entitlement_check", {
        provider: "revenuecat",
      });
      let entitlement;
      try {
        entitlement = await assertActiveRevenueCatEntitlement({
          userId: authenticatedUser.user.id,
        });
        finishEntitlement({
          httpStatus: entitlement.status,
          success: entitlement.ok,
        });
      } catch (error) {
        finishEntitlement({ success: false, error });
        throw error;
      }
      if (!entitlement.ok) {
        return jsonResponse(entitlement.body, entitlement.status);
      }

      const finishQuota = telemetry.start("quota_check", {
        provider: "supabase",
      });
      let quota;
      try {
        quota = await enforceEdgeFunctionQuota({
          adminSupabase,
          policyKey: "resolve-supplement-product",
          userId: authenticatedUser.user.id,
        });
        finishQuota({ httpStatus: quota.status, success: quota.ok });
      } catch (error) {
        finishQuota({ success: false, error });
        throw error;
      }
      if (quota.ok === false) {
        return jsonResponse(quota.body, quota.status, quota.headers);
      }

      const finishValidation = telemetry.start("request_validation");
      const validation = validateResolveProductRequest(await req.text());
      finishValidation({ success: validation.ok });
      if (!validation.ok) return jsonResponse(validation.body, validation.status);
      const { requestId, candidate } = validation.value;

      const finishResolution = telemetry.start("external_candidate_resolution", {
        provider: candidate.provider,
      });
      try {
        const result = await resolveExternalCandidate({
          candidate,
          adminSupabase,
          supabaseUrl,
          serviceRoleKey,
          goUpcApiKey,
          telemetry,
        });
        finishResolution({
          externalEnrichment: true,
          found: Boolean(result?.canonicalProductId),
          resultStatus: result?.canonicalProductId ? "resolved" : "incomplete",
          success: Boolean(result?.canonicalProductId),
        });
        return jsonResponse({
          requestId,
          status: result?.canonicalProductId ? "resolved" : "incomplete",
          product: result ?? normalizeFederatedCandidate(candidate, candidate.provider),
        });
      } catch (error) {
        finishResolution({ success: false, error });
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
    },
  );
});
