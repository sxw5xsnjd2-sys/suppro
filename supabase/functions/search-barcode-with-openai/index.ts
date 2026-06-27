import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TABLES = {
  products: "off_products",
  supplementProducts: "supplement_products_master",
};

const PROVIDER = "openai_web_search";
const MASTER_VERIFICATION_STATUS = "go_upc_unverified";
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_SEARCH_TIMEOUT_MS = 15_000;
const OPENAI_SEARCH_MAX_OUTPUT_TOKENS = 1_200;
const OPENAI_WEB_SEARCH_TOOL_TYPES = ["web_search", "web_search_preview"];
const VERIFICATION_STATUS = "ai_web_search_provisional";
const nullableStringSchema = { anyOf: [{ type: "string" }, { type: "null" }] };

const adminSupabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

const barcodeSearchResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    barcode: { type: "string" },
    product_name: nullableStringSchema,
    brand: nullableStringSchema,
    serving_size: nullableStringSchema,
    ingredients_text: nullableStringSchema,
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: nullableStringSchema,
          amount: nullableStringSchema,
          unit: nullableStringSchema,
          per: { type: "string", enum: ["serving"] },
          raw_text: nullableStringSchema,
        },
        required: ["name", "amount", "unit", "per", "raw_text"],
      },
    },
    source_urls: {
      type: "array",
      items: { type: "string" },
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    verification_status: {
      type: "string",
      enum: [VERIFICATION_STATUS],
    },
  },
  required: [
    "barcode",
    "product_name",
    "brand",
    "serving_size",
    "ingredients_text",
    "ingredients",
    "source_urls",
    "confidence",
    "verification_status",
  ],
};

type Confidence = "low" | "medium" | "high";

type Ingredient = {
  name: string | null;
  amount: string | null;
  unit: string | null;
  per: "serving";
  raw_text: string | null;
};

type BarcodeSearchResult = {
  barcode: string;
  product_name: string | null;
  brand: string | null;
  serving_size: string | null;
  ingredients_text: string | null;
  ingredients: Ingredient[];
  source_urls: string[];
  confidence: Confidence;
  verification_status: typeof VERIFICATION_STATUS;
  persisted: boolean;
  persistence_error?: string;
};

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value: unknown): string {
  return trimString(value).replace(/\s+/g, " ");
}

function normalizeBarcode(value: unknown): string {
  return trimString(value).replace(/[\s-]+/g, "");
}

function isValidBarcode(value: string): boolean {
  return /^\d{6,14}$/.test(value);
}

function buildBarcodeLookupCandidates(barcode: string) {
  const candidates = [barcode];

  if (/^\d{12}$/.test(barcode)) {
    candidates.push(`0${barcode}`);
  } else if (/^0\d{12}$/.test(barcode)) {
    candidates.push(barcode.slice(1));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function getBodyByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function emptyResult(barcode: string): BarcodeSearchResult {
  return {
    barcode,
    product_name: null,
    brand: null,
    serving_size: null,
    ingredients_text: null,
    ingredients: [],
    source_urls: [],
    confidence: "low",
    verification_status: VERIFICATION_STATUS,
    persisted: false,
  };
}

function emptyOpenAiResultShape(barcode: string) {
  const {
    persisted: _persisted,
    persistence_error: _persistenceError,
    ...shape
  } = emptyResult(barcode);
  return shape;
}

function extractResponseText(body: Record<string, unknown>) {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  const chunks: string[] = [];
  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;
      const typedContent = contentItem as Record<string, unknown>;
      if (
        typedContent.type === "output_text" &&
        typeof typedContent.text === "string"
      ) {
        chunks.push(typedContent.text);
      }
    }
  }

  return chunks.join("");
}

function sanitizeNullableString(value: unknown, maxLength: number) {
  const text = normalizeWhitespace(value);
  return text ? text.slice(0, maxLength) : null;
}

function sanitizeUrl(value: unknown) {
  const rawUrl = trimString(value);
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function collectSourceUrls(value: unknown, urls = new Set<string>()) {
  if (!value) return urls;
  if (typeof value === "string") {
    const url = sanitizeUrl(value);
    if (url) urls.add(url);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSourceUrls(item, urls));
    return urls;
  }
  if (typeof value !== "object") return urls;

  const record = value as Record<string, unknown>;
  for (const key of ["url", "source_url", "sourceUrl"]) {
    collectSourceUrls(record[key], urls);
  }
  for (
    const nestedKey of [
      "action",
      "annotations",
      "citations",
      "content",
      "output",
      "results",
      "sources",
    ]
  ) {
    collectSourceUrls(record[nestedKey], urls);
  }
  return urls;
}

function sanitizeIngredients(value: unknown): Ingredient[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ingredients: Ingredient[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const ingredient: Ingredient = {
      name: sanitizeNullableString(row.name, 120),
      amount: sanitizeNullableString(row.amount, 40),
      unit: sanitizeNullableString(row.unit, 24),
      per: "serving",
      raw_text: sanitizeNullableString(row.raw_text, 500),
    };

    if (!ingredient.name && !ingredient.raw_text) continue;

    const key = [
      ingredient.name ?? "",
      ingredient.amount ?? "",
      ingredient.unit ?? "",
      ingredient.raw_text ?? "",
    ].join("|").toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    ingredients.push(ingredient);
  }

  return ingredients.slice(0, 80);
}

function normalizeConfidence(value: unknown): Confidence {
  return value === "high" || value === "medium" ? value : "low";
}

function hasVisibleDosage(ingredients: Ingredient[]) {
  return ingredients.some((ingredient) =>
    Boolean(ingredient.name && ingredient.amount && ingredient.unit)
  );
}

function resolveConfidence(result: BarcodeSearchResult): Confidence {
  if (!result.product_name || !result.brand) {
    return "low";
  }

  if (result.confidence === "high" && !hasVisibleDosage(result.ingredients)) {
    return "medium";
  }

  return result.confidence;
}

function buildDisplayName(result: BarcodeSearchResult) {
  const productName = trimString(result.product_name);
  const brand = trimString(result.brand);

  if (productName && brand) {
    return productName.toLowerCase().includes(brand.toLowerCase())
      ? productName
      : `${brand} ${productName}`;
  }

  return productName || brand;
}

function confidenceToScore(confidence: Confidence) {
  switch (confidence) {
    case "high":
      return 0.9;
    case "medium":
      return 0.65;
    default:
      return 0.35;
  }
}

function parseAmountValue(value: string | null) {
  if (!value) return null;

  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (!match) return null;

  const amount = Number.parseFloat(match[0]);
  return Number.isFinite(amount) ? amount : null;
}

function buildDosageDisplay(ingredient: Ingredient) {
  const amount = trimString(ingredient.amount);
  const unit = trimString(ingredient.unit);

  if (amount && unit) return `${amount} ${unit}`;
  return amount || trimString(ingredient.raw_text) || null;
}

function buildMasterActiveIngredients(result: BarcodeSearchResult) {
  return result.ingredients
    .map((ingredient) => {
      const name = trimString(ingredient.name);
      if (!name) return null;

      return {
        name,
        dosageValue: parseAmountValue(ingredient.amount),
        dosageUnit: trimString(ingredient.unit) || null,
        dosageDisplay: buildDosageDisplay(ingredient),
        amountBasis: "per_serving",
        rawText: trimString(ingredient.raw_text) || null,
        source: PROVIDER,
        sourceUrls: result.source_urls,
      };
    })
    .filter(Boolean);
}

function withPersistenceResult(
  result: BarcodeSearchResult,
  persisted: boolean,
  persistenceError?: string,
): BarcodeSearchResult {
  return {
    ...result,
    persisted,
    ...(persistenceError ? { persistence_error: persistenceError } : {}),
  };
}

async function fetchExistingMasterByBarcode(barcode: string) {
  const barcodeCandidates = buildBarcodeLookupCandidates(barcode);
  const { data, error } = await adminSupabase!
    .from(TABLES.supplementProducts)
    .select("product_id, barcode")
    .in("barcode", barcodeCandidates);

  if (error) {
    throw new Error(`[supabase:${TABLES.supplementProducts}] ${error.message}`);
  }

  return barcodeCandidates
    .map((candidate) =>
      (data ?? []).find((row) => trimString(row?.barcode) === candidate)
    )
    .find(Boolean) ?? null;
}

async function fetchExistingMasterByProductId(productId: string) {
  const { data, error } = await adminSupabase!
    .from(TABLES.supplementProducts)
    .select("product_id")
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase:${TABLES.supplementProducts}] ${error.message}`);
  }

  return data ?? null;
}

async function fetchOffProductByBarcode(barcode: string) {
  const barcodeCandidates = buildBarcodeLookupCandidates(barcode);
  const { data, error } = await adminSupabase!
    .from(TABLES.products)
    .select("id, barcode, name, ingredients")
    .in("barcode", barcodeCandidates);

  if (error) {
    throw new Error(`[supabase:${TABLES.products}] ${error.message}`);
  }

  return barcodeCandidates
    .map((candidate) =>
      (data ?? []).find((row) => trimString(row?.barcode) === candidate)
    )
    .find(Boolean) ?? null;
}

async function resolveOrCreateProduct(
  result: BarcodeSearchResult,
  displayName: string,
) {
  const existingProduct = await fetchOffProductByBarcode(result.barcode);
  if (existingProduct?.id) {
    return {
      productId: trimString(existingProduct.id),
      createdProduct: false,
    };
  }

  const nextProduct = {
    id: crypto.randomUUID(),
    barcode: result.barcode,
    name: displayName,
    ingredients: trimString(result.ingredients_text),
  };

  const { error } = await adminSupabase!
    .from(TABLES.products)
    .insert(nextProduct);

  if (error) {
    const winner = await fetchOffProductByBarcode(result.barcode);
    if (winner?.id) {
      return {
        productId: trimString(winner.id),
        createdProduct: false,
      };
    }

    throw new Error(`[supabase:${TABLES.products}] ${error.message}`);
  }

  return {
    productId: nextProduct.id,
    createdProduct: true,
  };
}

async function persistSearchResult(result: BarcodeSearchResult) {
  const displayName = buildDisplayName(result);
  if (!displayName) {
    return { persisted: false };
  }

  if (!adminSupabase) {
    throw new Error("Missing Supabase service role configuration.");
  }

  const existingMaster = await fetchExistingMasterByBarcode(result.barcode);
  if (existingMaster?.product_id) {
    return { persisted: false };
  }

  const productResolution = await resolveOrCreateProduct(result, displayName);
  const existingProductMaster = await fetchExistingMasterByProductId(
    productResolution.productId,
  );
  if (existingProductMaster?.product_id) {
    return { persisted: false };
  }

  const activeIngredients = buildMasterActiveIngredients(result);
  const { error } = await adminSupabase!
    .from(TABLES.supplementProducts)
    .insert({
      product_id: productResolution.productId,
      barcode: result.barcode,
      display_name: displayName,
      name_source: PROVIDER,
      naming_confidence: confidenceToScore(result.confidence),
      serving_size_text: result.serving_size,
      active_ingredients_json: activeIngredients,
      ingredient_count: activeIngredients.length,
      processed_at: new Date().toISOString(),
      image_status: "missing",
      verification_status: MASTER_VERIFICATION_STATUS,
    });

  if (error) {
    throw new Error(`[supabase:${TABLES.supplementProducts}] ${error.message}`);
  }

  console.log("[search-barcode-with-openai] persisted product", {
    barcode: result.barcode,
    productId: productResolution.productId,
    createdProduct: productResolution.createdProduct,
    displayName,
    provider: PROVIDER,
    verificationStatus: MASTER_VERIFICATION_STATUS,
  });

  return { persisted: true };
}

function sanitizeSearchResult(
  value: unknown,
  barcode: string,
  responseSources: string[],
): BarcodeSearchResult {
  if (!value || typeof value !== "object") {
    return emptyResult(barcode);
  }

  const record = value as Record<string, unknown>;
  const sourceUrls = Array.from(
    new Set(
      [
        ...(
          Array.isArray(record.source_urls)
            ? record.source_urls.map((item) => sanitizeUrl(item))
            : []
        ),
        ...responseSources,
      ].filter(Boolean),
    ),
  ).slice(0, 12);

  if (sourceUrls.length === 0) {
    return emptyResult(barcode);
  }

  const result: BarcodeSearchResult = {
    barcode,
    product_name: sanitizeNullableString(record.product_name, 180),
    brand: sanitizeNullableString(record.brand, 120),
    serving_size: sanitizeNullableString(record.serving_size, 120),
    ingredients_text: sanitizeNullableString(record.ingredients_text, 4000),
    ingredients: sanitizeIngredients(record.ingredients),
    source_urls: sourceUrls,
    confidence: normalizeConfidence(record.confidence),
    verification_status: VERIFICATION_STATUS,
    persisted: false,
  };

  result.confidence = resolveConfidence(result);

  if (
    !result.product_name && !result.brand && result.ingredients.length === 0
  ) {
    return emptyResult(barcode);
  }

  return result;
}

function buildOpenAiRequestBody(barcode: string, toolType: string) {
  return {
    model: OPENAI_MODEL,
    max_output_tokens: OPENAI_SEARCH_MAX_OUTPUT_TOKENS,
    instructions: [
      "You search the public web for exact supplement product matches by barcode.",
      "Use only visible information from web pages returned by web search.",
      "Never guess, infer from similar products, or copy data from near-matches, alternate flavours, alternate sizes, or lookalike labels.",
      "Accept a source only when the page visibly identifies the exact barcode or the exact same product identity with enough evidence to avoid a near-match.",
      "Only return supplement product data. If the barcode resolves to a non-supplement or no reliable exact match, return null fields and empty arrays.",
      "Return dosage amounts only when explicitly visible in a source. Do not infer serving size or dosage from product names.",
      "Include only source URLs that you used for the returned fields.",
      "Return JSON only and follow the schema exactly.",
    ].join(" "),
    input: JSON.stringify(
      {
        task:
          "Find provisional supplement product data for this scanned barcode.",
        barcode,
        required_output_shape: emptyOpenAiResultShape(barcode),
        confidence_rules: {
          high:
            "Only when product name, brand, ingredients, and dosage amounts are confirmed from a reliable source.",
          medium:
            "Use when product name and brand are found but ingredients or dosages are incomplete.",
          low:
            "Use when only partial product identity is found or nothing reliable is found.",
        },
      },
      null,
      2,
    ),
    tools: [{ type: toolType }],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"],
    text: {
      format: {
        type: "json_schema",
        name: "barcode_supplement_web_search",
        strict: true,
        schema: barcodeSearchResponseSchema,
      },
    },
  };
}

async function requestBarcodeSearch(barcode: string) {
  for (const toolType of OPENAI_WEB_SEARCH_TOOL_TYPES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      OPENAI_SEARCH_TIMEOUT_MS,
    );

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(buildOpenAiRequestBody(barcode, toolType)),
      });

      if (!response.ok) {
        const body = await response.text();
        const shouldTryPreview = toolType === "web_search" &&
          response.status === 400;

        console.error("[search-barcode-with-openai] OpenAI request failed", {
          status: response.status,
          toolType,
          body: body.slice(0, 400),
        });

        if (shouldTryPreview) {
          continue;
        }

        return null;
      }

      const data = await response.json();
      const text = extractResponseText(data);
      const responseSources = Array.from(collectSourceUrls(data)).slice(0, 12);
      if (!text) {
        return emptyResult(barcode);
      }

      try {
        return sanitizeSearchResult(JSON.parse(text), barcode, responseSources);
      } catch (error) {
        console.error("[search-barcode-with-openai] Invalid OpenAI JSON", {
          toolType,
          message: error instanceof Error ? error.message : String(error),
        });
        return emptyResult(barcode);
      }
    } catch (error) {
      console.error("[search-barcode-with-openai] OpenAI request failed", {
        toolType,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed.", code: "method_not_allowed" },
      405,
      { Allow: "POST, OPTIONS" },
    );
  }

  if (!openAiApiKey) {
    return jsonResponse(
      { error: "AI service unavailable.", code: "server_configuration_error" },
      500,
    );
  }

  const rawBodyText = await request.text();
  if (!trimString(rawBodyText)) {
    return jsonResponse(
      { error: "Request body is required.", code: "invalid_request_payload" },
      400,
    );
  }

  if (getBodyByteLength(rawBodyText) > 5_000) {
    return jsonResponse(
      { error: "Request payload is too large.", code: "payload_too_large" },
      413,
    );
  }

  let body;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return jsonResponse(
      {
        error: "Request body must be valid JSON.",
        code: "invalid_request_payload",
      },
      400,
    );
  }

  const barcode = normalizeBarcode(body?.barcode);
  if (!barcode || !isValidBarcode(barcode)) {
    return jsonResponse(
      {
        error: "A valid numeric barcode is required.",
        code: "invalid_request_payload",
      },
      400,
    );
  }

  const result = await requestBarcodeSearch(barcode);
  if (!result) {
    return jsonResponse(
      { error: "AI service unavailable.", code: "ai_service_unavailable" },
      502,
    );
  }

  try {
    const persistence = await persistSearchResult(result);
    return jsonResponse(withPersistenceResult(result, persistence.persisted));
  } catch (error) {
    console.error("[search-barcode-with-openai] persistence failed", error);
    return jsonResponse(
      withPersistenceResult(
        result,
        false,
        "Failed to persist OpenAI barcode result.",
      ),
    );
  }
});
