import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECOMMENDED_DOSE_REVIEW_TYPE,
  buildRecommendedDoseReviewPayload,
  normalizeRecommendedDoseResult,
  parseRecommendedDoseFromHowToUse,
} from "./lib/recommendedDoseParser.mjs";

const DEFAULT_MODEL =
  process.env.SUPPLEMENT_RECOMMENDED_DOSE_MODEL || "gpt-5.4-mini";
const REVIEW_QUEUE_TABLE = "supplement_review_queue";
const SUPPLEMENTS_TABLE = "supplements";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function loadDotEnv() {
  const envPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    ".env"
  );

  let text = "";
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [key, maybeValue] = token.slice(2).split("=", 2);
    if (typeof maybeValue === "string") {
      flags[key] = maybeValue;
      continue;
    }

    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = nextToken;
    index += 1;
  }

  return flags;
}

function sanitizeForDatabase(value) {
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForDatabase(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeForDatabase(item),
      ])
    );
  }

  return value;
}

function requireEnv(name, fallback = "") {
  const value = trimString(process.env[name] || fallback);
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function createAdminClient() {
  const supabaseUrl = requireEnv(
    "SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL
  );
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeStatuses(value) {
  const allowed = new Set(["approved", "pending"]);
  const requested = trimString(value)
    .split(",")
    .map((item) => trimString(item).toLowerCase())
    .filter(Boolean);

  if (requested.length === 0) {
    return ["approved", "pending"];
  }

  const unique = Array.from(new Set(requested)).filter((status) =>
    allowed.has(status)
  );

  return unique.length > 0 ? unique : ["approved", "pending"];
}

async function fetchSupplements({ supabase, ids, limit, statuses }) {
  let query = supabase
    .from(SUPPLEMENTS_TABLE)
    .select("id, name, how_to_use, status")
    .in("status", statuses)
    .order("name", { ascending: true });

  if (ids.length > 0) {
    query = query.in("id", ids);
  }

  if (Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`[supabase:${SUPPLEMENTS_TABLE}] ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

function buildLlmSchema() {
  return {
    name: "supplement_recommended_dose",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: ["parsed", "ambiguous", "unscorable", "missing"],
        },
        source_text: { type: ["string", "null"] },
        confidence: { type: ["number", "null"] },
        per_intake_min_value: { type: ["number", "null"] },
        per_intake_max_value: { type: ["number", "null"] },
        unit: {
          type: ["string", "null"],
          enum: ["mcg", "mg", "ml", "IU", "CFU", null],
        },
        frequency_min_per_day: { type: ["number", "null"] },
        frequency_max_per_day: { type: ["number", "null"] },
        flags: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: [
        "status",
        "source_text",
        "confidence",
        "per_intake_min_value",
        "per_intake_max_value",
        "unit",
        "frequency_min_per_day",
        "frequency_max_per_day",
        "flags",
      ],
    },
  };
}

function extractCompletionContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (part?.type === "text" && typeof part.text === "string") {
        return part.text;
      }

      return "";
    })
    .join("")
    .trim();
}

async function openAiFetchWithRetry(url, options, retries = 3) {
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, options);

      if (
        response.ok ||
        ![408, 409, 429, 500, 502, 503, 504].includes(response.status)
      ) {
        return response;
      }

      lastError = new Error(`OpenAI retryable status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    const backoffMs = 500 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  throw lastError ?? new Error("OpenAI request failed");
}

function buildSystemPrompt() {
  return [
    "You extract supplement recommended intake metadata from a curated how_to_use text.",
    "Only extract biochemical intake amounts expressed in mcg, mg, ml, IU, or CFU.",
    "If the text only gives capsule/tablet/softgel/scoop counts and no biochemical amount, return status unscorable.",
    "If the text is blank or does not contain usable dose guidance, return status missing.",
    "If the text contains conflicting comparable dose guidance, return status ambiguous.",
    "Return a per-intake dose, not a full daily total.",
    "Use the exact source fragment you relied on when possible.",
  ].join(" ");
}

async function requestLlmFallback({ supplement, openAiApiKey, model }) {
  const response = await openAiFetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: buildLlmSchema(),
        },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                supplement_id: supplement.id,
                supplement_name: supplement.name,
                how_to_use: supplement.how_to_use,
              },
              null,
              2
            ),
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `[recommended-dose-llm] ${response.status} ${await response.text()}`
    );
  }

  const body = await response.json();
  const rawContent = extractCompletionContent(
    body?.choices?.[0]?.message?.content
  );
  if (!rawContent) {
    throw new Error("[recommended-dose-llm] OpenAI returned empty content");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(
      `[recommended-dose-llm] failed to parse JSON: ${rawContent.slice(0, 500)}`
    );
  }

  return normalizeRecommendedDoseResult(parsed, "llm");
}

function summarizeResults(results) {
  return results.reduce(
    (acc, item) => {
      const status = trimString(item?.result?.status) || "missing";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { parsed: 0, ambiguous: 0, unscorable: 0, missing: 0 }
  );
}

async function applyResults({ supabase, results }) {
  const supplementRows = results.map((item) => ({
    id: item.supplement.id,
    recommended_dose_status: item.result.status,
    recommended_dose_json: sanitizeForDatabase(
      item.result.recommended_dose_json
    ),
  }));

  for (let index = 0; index < supplementRows.length; index += 100) {
    const chunk = supplementRows.slice(index, index + 100);

    for (const row of chunk) {
      const { error } = await supabase
        .from(SUPPLEMENTS_TABLE)
        .update({
          recommended_dose_status: row.recommended_dose_status,
          recommended_dose_json: row.recommended_dose_json,
        })
        .eq("id", row.id);

      if (error) {
        throw new Error(`[supabase:${SUPPLEMENTS_TABLE}] ${error.message}`);
      }
    }
  }

  const supplementIds = results
    .map((item) => trimString(item.supplement.id))
    .filter(Boolean);

  if (supplementIds.length > 0) {
    const { error: deleteError } = await supabase
      .from(REVIEW_QUEUE_TABLE)
      .delete()
      .in("supplement_id", supplementIds)
      .eq("review_type", RECOMMENDED_DOSE_REVIEW_TYPE)
      .eq("status", "pending");

    if (deleteError) {
      throw new Error(
        `[supabase:${REVIEW_QUEUE_TABLE}] ${deleteError.message}`
      );
    }
  }

  const reviewRows = results
    .filter((item) => item.result.status !== "parsed")
    .map((item) => ({
      supplement_id: item.supplement.id,
      product_id: null,
      review_type: RECOMMENDED_DOSE_REVIEW_TYPE,
      payload: sanitizeForDatabase(
        buildRecommendedDoseReviewPayload({
          supplement: item.supplement,
          result: item.result,
        })
      ),
      status: "pending",
    }));

  for (let index = 0; index < reviewRows.length; index += 100) {
    const chunk = reviewRows.slice(index, index + 100);
    const { error } = await supabase.from(REVIEW_QUEUE_TABLE).insert(chunk);
    if (error) {
      throw new Error(`[supabase:${REVIEW_QUEUE_TABLE}] ${error.message}`);
    }
  }
}

async function main() {
  loadDotEnv();
  const flags = parseArgs(process.argv.slice(2));
  const apply = Boolean(flags.apply);
  const skipLlm = Boolean(flags["skip-llm"]);
  const limit = parseOptionalNumber(flags.limit);
  const statuses = normalizeStatuses(flags.status);
  const ids = trimString(flags.ids)
    .split(",")
    .map((item) => trimString(item))
    .filter(Boolean);

  const supabase = createAdminClient();
  const openAiApiKey = trimString(process.env.OPENAI_API_KEY);
  const model = trimString(flags.model) || DEFAULT_MODEL;
  const supplements = await fetchSupplements({ supabase, ids, limit, statuses });
  const results = [];

  for (const supplement of supplements) {
    let result = parseRecommendedDoseFromHowToUse(supplement.how_to_use);

    if (
      result.status !== "parsed" &&
      !skipLlm &&
      openAiApiKey &&
      trimString(supplement.how_to_use)
    ) {
      try {
        result = await requestLlmFallback({
          supplement,
          openAiApiKey,
          model,
        });
      } catch (error) {
        result = {
          ...result,
          recommended_dose_json: {
            ...result.recommended_dose_json,
            flags: Array.from(
              new Set([
                ...(result.recommended_dose_json?.flags ?? []),
                `llm_fallback_failed:${
                  error instanceof Error ? error.message : String(error)
                }`,
              ])
            ),
          },
        };
      }
    }

    results.push({
      supplement,
      result,
    });
  }

  const summary = summarizeResults(results);
  console.log(
    JSON.stringify(
      {
        apply,
        statuses,
        total: results.length,
        summary,
        usedLlmFallback: !skipLlm && Boolean(openAiApiKey),
        sample: results.slice(0, 10).map((item) => ({
          id: item.supplement.id,
          name: item.supplement.name,
          status: item.result.status,
          recommended_dose_json: item.result.recommended_dose_json,
        })),
      },
      null,
      2
    )
  );

  if (!apply) {
    return;
  }

  await applyResults({ supabase, results });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
