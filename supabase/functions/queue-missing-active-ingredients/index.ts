import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceEdgeFunctionQuota } from "../_shared/quota.ts";
import {
  authenticateSupabaseUser,
  assertActiveRevenueCatEntitlement,
} from "../_shared/revenuecat.ts";
import { validateQueueMissingActiveIngredientsRequest } from "../_shared/queue-missing-active-ingredients-policy.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TABLES = {
  missingOccurrences: "supplement_missing_catalog_occurrences",
  reviewQueue: "supplement_review_queue",
  supplementMaster: "supplement_products_master",
};

const REVIEW_TYPES = {
  aliasUnresolved: "alias_unresolved",
};

const REVIEW_PROCESSOR_FUNCTION = "process-photo-rescue-reviews";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = normalizeSecretToken(
  Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

const adminSupabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSecretToken(value: unknown) {
  return trimString(value)
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function occurrenceKey(normalizedName: string, productId: string) {
  return `${normalizedName}|${productId}`;
}

function logQueueOperationFailure(stage: string, error: unknown) {
  console.error("[queue-missing-active-ingredients] failed", {
    stage,
    message: error instanceof Error ? error.message : String(error),
  });
}

async function refreshReviewCandidates(normalizedNames: string[]) {
  if (!supabaseUrl || !supabaseServiceRoleKey || !normalizedNames.length) {
    return { processed: false, reason: "missing_configuration_or_names" };
  }

  const uniqueNames = Array.from(new Set(normalizedNames.filter(Boolean)));
  if (!uniqueNames.length) {
    return { processed: false, reason: "empty_names" };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/${REVIEW_PROCESSOR_FUNCTION}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
    body: JSON.stringify({ normalizedNames: uniqueNames }),
  });

  const responseText = await response.text();
  let responseBody: unknown = null;
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
  }

  if (!response.ok) {
    throw new Error(`Review refresh failed with status ${response.status}`);
  }

  return responseBody;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    if (!adminSupabase || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Missing Supabase service configuration." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    const authenticatedUser = await authenticateSupabaseUser({
      adminSupabase,
      authHeader,
    });
    if (!authenticatedUser.ok) {
      return jsonResponse(authenticatedUser.body, authenticatedUser.status);
    }

    const authenticatedUserId = authenticatedUser.user.id;
    const entitlementAccess = await assertActiveRevenueCatEntitlement({
      userId: authenticatedUserId,
    });
    if (!entitlementAccess.ok) {
      return jsonResponse(entitlementAccess.body, entitlementAccess.status);
    }

    const quotaAccess = await enforceEdgeFunctionQuota({
      adminSupabase,
      policyKey: "queue-missing-active-ingredients",
      userId: authenticatedUserId,
    });
    if (!quotaAccess.ok) {
      return jsonResponse(
        quotaAccess.body,
        quotaAccess.status,
        quotaAccess.headers
      );
    }

    const rawBodyText = await req.text();
    const payloadValidation =
      validateQueueMissingActiveIngredientsRequest(rawBodyText);
    if (!payloadValidation.ok) {
      return jsonResponse(
        payloadValidation.body,
        payloadValidation.status
      );
    }
    const { productId, ingredients } = payloadValidation.value;

    const { data: masterRow, error: masterError } = await adminSupabase
      .from(TABLES.supplementMaster)
      .select("product_id")
      .eq("product_id", productId)
      .maybeSingle();

    if (masterError) {
      logQueueOperationFailure("lookup_product", masterError);
      return jsonResponse({ error: "Queue request failed." }, 500);
    }
    if (!masterRow?.product_id) {
      return jsonResponse(
        { error: "Product was not found.", code: "product_not_found" },
        404
      );
    }

    const now = new Date().toISOString();
    const normalizedNames = ingredients.map((row) => row.normalized_name);
    const { data: existingOccurrenceRows, error: existingOccurrencesError } =
      await adminSupabase
        .from(TABLES.missingOccurrences)
        .select("normalized_name, product_id, first_seen_at, occurrence_count")
        .eq("product_id", productId)
        .in("normalized_name", normalizedNames);

    if (existingOccurrencesError) {
      logQueueOperationFailure("load_occurrences", existingOccurrencesError);
      return jsonResponse({ error: "Queue request failed." }, 500);
    }

    const existingByKey = new Map(
      (existingOccurrenceRows ?? []).map((row) => [
        occurrenceKey(trimString(row.normalized_name), trimString(row.product_id)),
        row,
      ])
    );

    const { error: occurrenceError } = await adminSupabase
      .from(TABLES.missingOccurrences)
      .upsert(
        ingredients.map((row) => {
          const existing = existingByKey.get(
            occurrenceKey(row.normalized_name, productId)
          );
          const existingCount = Number(existing?.occurrence_count);

          return {
            normalized_name: row.normalized_name,
            product_id: productId,
            display_name: row.display_name,
            first_seen_at: trimString(existing?.first_seen_at) || now,
            last_seen_at: now,
            occurrence_count: Number.isFinite(existingCount)
              ? existingCount + 1
              : 1,
          };
        }),
        { onConflict: "normalized_name,product_id" }
      );

    if (occurrenceError) {
      logQueueOperationFailure("write_occurrences", occurrenceError);
      return jsonResponse({ error: "Queue request failed." }, 500);
    }

    const { error: queueDeleteError } = await adminSupabase
      .from(TABLES.reviewQueue)
      .delete()
      .eq("product_id", productId)
      .eq("review_type", REVIEW_TYPES.aliasUnresolved)
      .eq("status", "pending");

    if (queueDeleteError) {
      logQueueOperationFailure("delete_existing_queue_rows", queueDeleteError);
      return jsonResponse({ error: "Queue request failed." }, 500);
    }

    const { error: queueInsertError } = await adminSupabase
      .from(TABLES.reviewQueue)
      .insert({
        product_id: productId,
        review_type: REVIEW_TYPES.aliasUnresolved,
        payload: {
          unresolved_names: ingredients,
          count: ingredients.length,
          source: "barcode_found_scan",
        },
        status: "pending",
      });

    if (queueInsertError) {
      logQueueOperationFailure("insert_queue_row", queueInsertError);
      return jsonResponse({ error: "Queue request failed." }, 500);
    }

    let refreshResult: unknown = {
      processed: false,
      reason: "not_attempted",
    };
    try {
      refreshResult = await refreshReviewCandidates(normalizedNames);
    } catch (refreshError) {
      logQueueOperationFailure("refresh_review_candidates", refreshError);
      refreshResult = {
        processed: false,
        reason: "refresh_failed",
      };
    }

    return jsonResponse({
      queued: ingredients.length,
      normalizedNames,
      refreshResult,
    });
  } catch (error) {
    logQueueOperationFailure("unexpected", error);
    return jsonResponse(
      {
        error: "Queue request failed.",
        code: "queue_request_failed",
      },
      500
    );
  }
});
