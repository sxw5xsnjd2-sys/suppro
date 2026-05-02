import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

function normalizePlainText(value: unknown) {
  return trimString(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9µμ%.,/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDosageFragments(value: string) {
  return value
    .replace(/\b\d+([.,]\d+)?\s*(mcg|mg|g|ml|iu|cfu|ug|µg|μg)\b/gi, " ")
    .replace(/\bproviding\b.*$/gi, " ")
    .replace(/\(\s*providing[^)]*\)/gi, " ")
    .replace(/\(\s*\d+[^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLabelWrappers(value: string) {
  return value
    .replace(/\bingredients?\b:?/gi, " ")
    .replace(/\bcontains\b:?/gi, " ")
    .replace(/\bfood supplement\b/gi, " ")
    .replace(/\bsupplement facts\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBroadIngredientName(value: unknown) {
  let normalized = normalizePlainText(value);
  normalized = stripDosageFragments(normalized);
  normalized = stripLabelWrappers(normalized);
  normalized = normalized.replace(/\bvit[.]?\b/g, "vitamin");
  return normalized.replace(/\s+/g, " ").trim();
}

function ingredientDisplayName(value: unknown) {
  if (typeof value === "string") return trimString(value);
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return (
    trimString(row.name) ||
    trimString(row.canonicalName) ||
    trimString(row.canonical_name) ||
    trimString(row.rawName) ||
    trimString(row.raw_name)
  );
}

function normalizeIngredientRows(input: unknown) {
  if (!Array.isArray(input)) return [];
  const byName = new Map<string, { normalized_name: string; display_name: string }>();

  for (const item of input) {
    const displayName = ingredientDisplayName(item);
    const normalizedName = normalizeBroadIngredientName(displayName);
    if (!displayName || !normalizedName) continue;
    byName.set(normalizedName, {
      normalized_name: normalizedName,
      display_name: displayName,
    });
  }

  return Array.from(byName.values()).slice(0, 25);
}

function occurrenceKey(normalizedName: string, productId: string) {
  return `${normalizedName}|${productId}`;
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
    throw new Error(
      `Review refresh failed: ${response.status} ${JSON.stringify(responseBody)}`
    );
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

    const body = await req.json().catch(() => ({}));
    const productId = trimString(body?.productId);
    const ingredients = normalizeIngredientRows(body?.ingredients);

    if (!productId) {
      return jsonResponse({ error: "Missing productId." }, 400);
    }
    if (!ingredients.length) {
      return jsonResponse({ queued: 0, normalizedNames: [] });
    }

    const { data: masterRow, error: masterError } = await adminSupabase
      .from(TABLES.supplementMaster)
      .select("product_id")
      .eq("product_id", productId)
      .maybeSingle();

    if (masterError) {
      throw new Error(`[supabase:${TABLES.supplementMaster}] ${masterError.message}`);
    }
    if (!masterRow?.product_id) {
      return jsonResponse(
        { error: "Product is not present in supplement_products_master." },
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
      throw new Error(
        `[supabase:${TABLES.missingOccurrences}] ${existingOccurrencesError.message}`
      );
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
      throw new Error(`[supabase:${TABLES.missingOccurrences}] ${occurrenceError.message}`);
    }

    const { error: queueDeleteError } = await adminSupabase
      .from(TABLES.reviewQueue)
      .delete()
      .eq("product_id", productId)
      .eq("review_type", REVIEW_TYPES.aliasUnresolved)
      .eq("status", "pending");

    if (queueDeleteError) {
      throw new Error(`[supabase:${TABLES.reviewQueue}] ${queueDeleteError.message}`);
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
      throw new Error(`[supabase:${TABLES.reviewQueue}] ${queueInsertError.message}`);
    }

    const refreshResult = await refreshReviewCandidates(normalizedNames);

    return jsonResponse({
      queued: ingredients.length,
      normalizedNames,
      refreshResult,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected queue-missing-active-ingredients failure",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
