import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime:
  | {
      waitUntil?: (promise: Promise<unknown>) => void;
    }
  | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TABLES = {
  products: "off_products",
  activeIngredients: "product_active_ingredients",
  missingOccurrences: "supplement_missing_catalog_occurrences",
  reviewQueue: "supplement_review_queue",
  catalogReviewCandidates: "supplement_catalog_review_candidates",
};

const REVIEW_TYPES = {
  aliasUnresolved: "alias_unresolved",
};

const RESEARCH_FUNCTION = "research-pending-supplements";

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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveSuggestedAction(existingRow: Record<string, unknown> | null) {
  return trimString(existingRow?.suggested_action) || "manual_review";
}

function normalizeSecretToken(value: unknown) {
  return trimString(value)
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function parseJwtPayload(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isServiceRoleRequest(req: Request) {
  const token = trimString(req.headers.get("Authorization")?.replace(/^Bearer\s+/i, ""));
  const payload = parseJwtPayload(token);
  return payload?.role === "service_role";
}

function normalizeWhitespace(value: unknown): string {
  return trimString(value).replace(/\s+/g, " ").trim();
}

function normalizePlainText(value: unknown) {
  return trimString(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[_/|]+/g, " ")
    .replace(/[()[\]{}.,:;!?+-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
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
  normalized = normalized.replace(/\s+/g, " ").trim();

  const synonymMaps = [
    {
      broad: "vitamin a",
      aliases: ["vitamin a", "retinol", "beta carotene", "beta-carotene"],
    },
    { broad: "vitamin b1", aliases: ["vitamin b1", "thiamine", "thiamin"] },
    { broad: "vitamin b2", aliases: ["vitamin b2", "riboflavin"] },
    {
      broad: "vitamin b3",
      aliases: ["vitamin b3", "niacin", "niacinamide", "nicotinamide"],
    },
    { broad: "vitamin b5", aliases: ["vitamin b5", "pantothenic acid"] },
    {
      broad: "vitamin b6",
      aliases: ["vitamin b6", "pyridoxine", "p5p", "pyridoxal phosphate"],
    },
    { broad: "vitamin b7", aliases: ["vitamin b7", "biotin"] },
    {
      broad: "vitamin b9",
      aliases: ["vitamin b9", "folate", "folic acid", "methylfolate", "5 mthf"],
    },
    {
      broad: "vitamin b12",
      aliases: [
        "vitamin b12",
        "cobalamin",
        "methylcobalamin",
        "cyanocobalamin",
        "adenosylcobalamin",
        "hydroxocobalamin",
      ],
    },
    {
      broad: "vitamin c",
      aliases: [
        "vitamin c",
        "ascorbic acid",
        "sodium ascorbate",
        "calcium ascorbate",
      ],
    },
    {
      broad: "vitamin d",
      aliases: [
        "vitamin d",
        "vitamin d2",
        "vitamin d3",
        "cholecalciferol",
        "ergocalciferol",
      ],
    },
    {
      broad: "vitamin e",
      aliases: ["vitamin e", "tocopherol", "alpha tocopherol"],
    },
    {
      broad: "vitamin k",
      aliases: [
        "vitamin k",
        "vitamin k1",
        "vitamin k2",
        "phylloquinone",
        "menaquinone",
      ],
    },
  ];

  for (const entry of synonymMaps) {
    if (entry.aliases.some((alias) => normalized.includes(alias))) {
      return entry.broad;
    }
  }

  const removableForms = new Set([
    "citrate",
    "glycinate",
    "oxide",
    "gluconate",
    "bisglycinate",
    "picolinate",
    "malate",
    "chloride",
    "taurate",
    "threonate",
    "aspartate",
    "chelate",
    "monohydrate",
    "hydrochloride",
    "acetate",
    "softgel",
    "capsule",
    "tablet",
  ]);

  const tokens = normalized.split(" ").filter(Boolean);
  while (tokens.length > 1 && removableForms.has(tokens.at(-1) || "")) {
    tokens.pop();
  }

  return tokens.join(" ").trim();
}

function parseNormalizedNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => normalizeBroadIngredientName(item))
        .filter(Boolean)
    )
  );
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function mergeSampleRows<T>(
  existingItems: unknown,
  freshItems: T[],
  getKey: (item: T) => string,
  limit = 5
) {
  const existing = Array.isArray(existingItems) ? (existingItems as T[]) : [];
  return dedupeByKey(
    [...freshItems, ...existing].filter(Boolean) as T[],
    getKey
  ).slice(0, limit);
}

function maxTimestamp(left: string, right: string) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function minTimestamp(left: string, right: string) {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

async function fetchPendingReviewNames() {
  const { data, error } = await adminSupabase!
    .from(TABLES.reviewQueue)
    .select("payload")
    .eq("review_type", REVIEW_TYPES.aliasUnresolved)
    .eq("status", "pending");

  if (error) {
    throw new Error(`[supabase:${TABLES.reviewQueue}] ${error.message}`);
  }

  const names = [];

  for (const row of data ?? []) {
    const unresolvedNames = Array.isArray(row?.payload?.unresolved_names)
      ? row.payload.unresolved_names
      : [];

    unresolvedNames.forEach((item) => {
      const normalizedName = normalizeBroadIngredientName(item?.normalized_name);
      if (normalizedName) {
        names.push(normalizedName);
      }
    });
  }

  return Array.from(new Set(names));
}

async function fetchExistingCandidateRows(normalizedNames: string[]) {
  if (!normalizedNames.length) {
    return [];
  }

  const { data, error } = await adminSupabase!
    .from(TABLES.catalogReviewCandidates)
    .select("*")
    .in("normalized_name", normalizedNames);

  if (error) {
    throw new Error(
      `[supabase:${TABLES.catalogReviewCandidates}] ${error.message}`
    );
  }

  return data ?? [];
}

async function fetchOccurrenceRows(normalizedNames: string[]) {
  if (!normalizedNames.length) {
    return [];
  }

  const { data, error } = await adminSupabase!
    .from(TABLES.missingOccurrences)
    .select("*")
    .in("normalized_name", normalizedNames)
    .order("last_seen_at", { ascending: false })
    .order("first_seen_at", { ascending: true });

  if (error) {
    throw new Error(`[supabase:${TABLES.missingOccurrences}] ${error.message}`);
  }

  return data ?? [];
}

async function fetchProductRows(productIds: string[]) {
  if (!productIds.length) {
    return [];
  }

  const { data, error } = await adminSupabase!
    .from(TABLES.products)
    .select("id, name, ingredients")
    .in("id", productIds);

  if (error) {
    throw new Error(`[supabase:${TABLES.products}] ${error.message}`);
  }

  return data ?? [];
}

async function fetchActiveIngredientRows(productIds: string[]) {
  if (!productIds.length) {
    return [];
  }

  const { data, error } = await adminSupabase!
    .from(TABLES.activeIngredients)
    .select(
      "product_id, raw_name, canonical_name, dosage_original_text, chemical_form, resolution_status, created_at, ingredient_type"
    )
    .in("product_id", productIds)
    .eq("ingredient_type", "active");

  if (error) {
    throw new Error(`[supabase:${TABLES.activeIngredients}] ${error.message}`);
  }

  return data ?? [];
}

function scheduleBackgroundTask(promise: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(promise);
    return;
  }

  promise.catch((error) => {
    console.error("Background task failed", error);
  });
}

function queueSupplementResearch(normalizedNames: string[]) {
  if (!supabaseUrl || !supabaseServiceRoleKey || !normalizedNames.length) {
    return;
  }

  const uniqueNames = Array.from(new Set(normalizedNames.filter(Boolean)));
  if (!uniqueNames.length) {
    return;
  }

  scheduleBackgroundTask(
    fetch(`${supabaseUrl}/functions/v1/${RESEARCH_FUNCTION}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        normalizedNames: uniqueNames,
        limit: Math.min(uniqueNames.length, 5),
      }),
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Supplement research failed: ${response.status} ${await response.text()}`
        );
      }
    })
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    if (!adminSupabase || !supabaseServiceRoleKey) {
      return jsonResponse(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret." },
        500
      );
    }

    if (!isServiceRoleRequest(req)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const requestedNames = parseNormalizedNames(body?.normalizedNames);
    const normalizedNames = requestedNames.length
      ? requestedNames
      : await fetchPendingReviewNames();

    if (!normalizedNames.length) {
      return jsonResponse({
        processedNames: 0,
        upsertedRows: 0,
      });
    }

    const [existingRows, occurrenceRows] = await Promise.all([
      fetchExistingCandidateRows(normalizedNames),
      fetchOccurrenceRows(normalizedNames),
    ]);
    const existingByName = new Map(
      existingRows.map((row) => [trimString(row.normalized_name), row])
    );
    const productIds = Array.from(
      new Set(
        occurrenceRows.map((row) => trimString(row.product_id)).filter(Boolean)
      )
    );
    const [productRows, activeIngredientRows] = await Promise.all([
      fetchProductRows(productIds),
      fetchActiveIngredientRows(productIds),
    ]);
    const productById = new Map(
      productRows.map((row) => [trimString(row.id), row])
    );
    const activeRowsByName = new Map<string, Record<string, unknown>[]>();

    for (const row of activeIngredientRows) {
      if (trimString(row.resolution_status) !== "needs_alias_review") {
        continue;
      }

      const normalizedName = normalizeBroadIngredientName(
        row.canonical_name || row.raw_name
      );
      if (!normalizedName) {
        continue;
      }

      const current = activeRowsByName.get(normalizedName) || [];
      current.push(row);
      activeRowsByName.set(normalizedName, current);
    }

    const now = new Date().toISOString();
    const upserts = [];

    for (const normalizedName of normalizedNames) {
      const matchingOccurrences = occurrenceRows.filter(
        (row) => trimString(row.normalized_name) === normalizedName
      );
      const existingRow = existingByName.get(normalizedName) || null;

      if (!matchingOccurrences.length && !existingRow) {
        continue;
      }

      const sampleActiveIngredients = mergeSampleRows(
        existingRow?.sample_active_ingredients_json,
        (activeRowsByName.get(normalizedName) || [])
          .sort((left, right) =>
            trimString(right.created_at).localeCompare(trimString(left.created_at))
          )
          .map((row) => ({
            product_id: trimString(row.product_id) || null,
            raw_name: normalizeWhitespace(row.raw_name) || null,
            canonical_name: normalizeWhitespace(row.canonical_name) || null,
            dosage_original_text: normalizeWhitespace(row.dosage_original_text) || null,
            chemical_form: normalizeWhitespace(row.chemical_form) || null,
          })),
        (item) =>
          [
            item.product_id,
            item.raw_name,
            item.canonical_name,
            item.dosage_original_text,
            item.chemical_form,
          ].join("|"),
        5
      );

      const sampleProducts = mergeSampleRows(
        existingRow?.sample_products_json,
        matchingOccurrences
          .map((row) => {
            const productId = trimString(row.product_id);
            const product = productById.get(productId);
            if (!productId || !product) {
              return null;
            }

            return {
              product_id: productId,
              name: normalizeWhitespace(product.name) || null,
              ingredients: normalizeWhitespace(product.ingredients) || null,
            };
          })
          .filter(Boolean),
        (item) => trimString(item?.product_id),
        5
      );

      const firstSeenFromOccurrences = matchingOccurrences
        .map((row) => trimString(row.first_seen_at))
        .filter(Boolean)
        .sort()[0];
      const lastSeenFromOccurrences = matchingOccurrences
        .map((row) => trimString(row.last_seen_at))
        .filter(Boolean)
        .sort()
        .at(-1);
      const occurrenceCountFromOccurrences = matchingOccurrences.reduce(
        (sum, row) => {
          const count = Number(row.occurrence_count);
          return sum + (Number.isFinite(count) && count > 0 ? count : 1);
        },
        0
      );
      const latestCreatedAt = (activeRowsByName.get(normalizedName) || [])
        .map((row) => trimString(row.created_at))
        .filter(Boolean)
        .sort()
        .at(-1);
      const displayName =
        normalizeWhitespace(existingRow?.display_name) ||
        normalizeWhitespace(matchingOccurrences[0]?.display_name) ||
        normalizeWhitespace(sampleActiveIngredients[0]?.canonical_name) ||
        normalizeWhitespace(sampleActiveIngredients[0]?.raw_name) ||
        normalizedName;

      upserts.push({
        normalized_name: normalizedName,
        display_name: displayName,
        occurrence_count: occurrenceCountFromOccurrences,
        sample_active_ingredients_json: sampleActiveIngredients,
        sample_products_json: sampleProducts,
        suggested_action: resolveSuggestedAction(existingRow),
        suggested_supplement_name:
          trimString(existingRow?.suggested_supplement_name) || null,
        suggestion_confidence:
          typeof existingRow?.suggestion_confidence === "number"
            ? existingRow.suggestion_confidence
            : null,
        suggestion_reason: trimString(existingRow?.suggestion_reason) || "",
        source_latest_created_at: latestCreatedAt || null,
        review_status: trimString(existingRow?.review_status) || "pending",
        approved_supplement_id:
          trimString(existingRow?.approved_supplement_id) || null,
        approved_supplement_name:
          trimString(existingRow?.approved_supplement_name) || null,
        review_notes: trimString(existingRow?.review_notes) || null,
        created_at: trimString(existingRow?.created_at) || now,
        updated_at: now,
        first_seen_at: minTimestamp(
          trimString(existingRow?.first_seen_at),
          firstSeenFromOccurrences || now
        ),
        last_seen_at: maxTimestamp(
          trimString(existingRow?.last_seen_at),
          lastSeenFromOccurrences || now
        ),
      });
    }

    if (upserts.length) {
      const { error: upsertError } = await adminSupabase!
        .from(TABLES.catalogReviewCandidates)
        .upsert(upserts, {
          onConflict: "normalized_name",
        });

      if (upsertError) {
        throw new Error(
          `[supabase:${TABLES.catalogReviewCandidates}] ${upsertError.message}`
        );
      }

      queueSupplementResearch(
        upserts
          .map((row) => trimString(row.normalized_name))
          .filter(Boolean)
      );
    }

    return jsonResponse({
      processedNames: normalizedNames.length,
      upsertedRows: upserts.length,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected process-photo-rescue-reviews failure",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
