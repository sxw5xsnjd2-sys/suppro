import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createLatencyTrace,
  instrumentEdgeRequest,
} from "../../../src/lib/latencyTelemetry.js";

type LatencyTrace = ReturnType<typeof createLatencyTrace>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trace-id, x-latency-flow, x-latency-action",
  "Access-Control-Expose-Headers": "x-trace-id, x-edge-duration-ms, server-timing",
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
const VERIFICATION_STATUS = "openai_unverified";
const nullableStringSchema = { anyOf: [{ type: "string" }, { type: "null" }] };
const BROAD_FALLBACK_NOISE_WORDS = new Set([
  "capsule",
  "capsules",
  "tablet",
  "tablets",
  "sachet",
  "sachets",
  "softgel",
  "softgels",
  "gummy",
  "gummies",
  "pack",
  "packs",
  "expiry",
  "flavour",
  "flavor",
  "vegan",
  "vegetarian",
]);
const FLAVOR_WORDS = new Set([
  "peach",
  "berry",
  "orange",
  "lemon",
  "lime",
  "cherry",
  "apple",
  "mango",
  "vanilla",
  "chocolate",
  "mint",
  "raspberry",
  "strawberry",
  "banana",
  "grape",
  "watermelon",
  "natural",
  "unflavoured",
  "unflavored",
]);
const LIKELY_ACTIVE_INGREDIENT_WORDS = new Set([
  "collagen",
  "magnesium",
  "turmeric",
  "berberine",
  "vitamin",
  "zinc",
  "iron",
  "omega",
  "creatine",
  "ashwagandha",
  "probiotic",
  "electrolyte",
  "protein",
  "b12",
  "d3",
  "multivitamin",
]);
const INACTIVE_SUPPLEMENT_INGREDIENT_NAMES = new Set([
  "acidity regulator",
  "acidity regulators",
  "citric acid",
  "colour",
  "colours",
  "color",
  "colors",
  "flavour",
  "flavours",
  "flavouring",
  "flavourings",
  "flavor",
  "flavors",
  "flavoring",
  "flavorings",
  "glucose syrup",
  "glycerin",
  "glycerine",
  "glycerol",
  "juice",
  "preservative",
  "preservatives",
  "purified water",
  "salt",
  "stabiliser",
  "stabilisers",
  "stabilizer",
  "stabilizers",
  "sucralose",
  "sugar",
  "sweetener",
  "sweeteners",
  "thickener",
  "thickeners",
  "water",
]);

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
type SearchMode = "barcode" | "product_name_exact" | "product_name_broad";

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

type SanitizedSearchResult = {
  result: BarcodeSearchResult;
  reason: string | null;
};

type SearchAttemptResult = {
  result: BarcodeSearchResult | null;
  emptyReason: string | null;
  mode: SearchMode;
};

type SearchContext = {
  barcode: string;
  rawProductName: string;
  cleanedProductName: string;
  brand: string;
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

function normalizeSearchTokenCase(value: string) {
  return value.replace(/\b[A-Z]{3,}\b/g, (token) => {
    if (!/^[A-Z]+$/.test(token)) {
      return token;
    }

    return `${token.slice(0, 1)}${token.slice(1).toLowerCase()}`;
  });
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

function cleanProductNameForSearch(value: unknown) {
  const stripped = normalizeWhitespace(value)
    .replace(
      /\b(?:exp(?:iry)?|best before|use by|bb(?:e)?)\b[\s:.-]*\d{1,2}[/-]\d{2,4}\b/gi,
      " ",
    )
    .replace(
      /\b(?:exp(?:iry)?|best before|use by|bb(?:e)?)\b[\s:.-]*[A-Za-z]{3,9}\s+\d{4}\b/gi,
      " ",
    )
    .replace(/\s*[-–—]+\s*/g, " ")
    .replace(/[|_/]+/g, " ")
    .replace(/[()]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return normalizeSearchTokenCase(stripped).slice(0, 180);
}

function removePackSizeText(value: string) {
  return normalizeWhitespace(
    value.replace(
      /\b\d+\s*(?:x\s*)?(?:sachets?|capsules?|tablets?|softgels?|gummies|servings?|packs?|ct|count)\b/gi,
      " ",
    ),
  ).trim();
}

function removeFlavorWordsForBroadFallback(value: string) {
  const tokens = normalizeWhitespace(value).split(" ").filter(Boolean);
  if (tokens.length < 4) {
    return value;
  }

  const filtered = tokens.filter((token, index) => {
    const normalized = token.toLowerCase();
    if (!FLAVOR_WORDS.has(normalized)) {
      return true;
    }

    return index < 2;
  });

  return normalizeWhitespace(filtered.join(" "));
}

function removeBroadFallbackNoise(value: string) {
  return normalizeWhitespace(
    value
      .replace(/\bhigh\s+strength\b/gi, " ")
      .replace(
        /\b(?:flavour|flavor)\s+[A-Za-z]+\b/gi,
        " ",
      )
      .replace(
        /\b(?:capsules?|tablets?|sachets?|softgels?|gummies|packs?|vegan|vegetarian|expiry)\b/gi,
        " ",
      ),
  ).trim();
}

function sanitizeQueryToken(value: string) {
  return normalizeSearchTokenCase(
    value.replace(/^[^A-Za-z0-9+]+|[^A-Za-z0-9+]+$/g, ""),
  );
}

function buildMeaningfulProductTokens(value: string) {
  const tokens = normalizeWhitespace(value).split(" ").filter(Boolean);
  const result: string[] = [];
  let previousNormalized = "";

  for (const token of tokens) {
    const cleanedToken = sanitizeQueryToken(token);
    const normalized = cleanedToken.toLowerCase();
    if (!cleanedToken) {
      previousNormalized = normalized;
      continue;
    }
    if (/^\d+$/.test(normalized)) {
      previousNormalized = normalized;
      continue;
    }
    if (BROAD_FALLBACK_NOISE_WORDS.has(normalized)) {
      previousNormalized = normalized;
      continue;
    }

    const keepShortVitaminSuffix =
      previousNormalized === "vitamin" && /^[a-z0-9]{1,3}$/i.test(normalized);
    const isLikelyIngredient = LIKELY_ACTIVE_INGREDIENT_WORDS.has(normalized);
    if (
      cleanedToken.length <= 2 &&
      !keepShortVitaminSuffix &&
      !isLikelyIngredient
    ) {
      previousNormalized = normalized;
      continue;
    }

    result.push(cleanedToken);
    previousNormalized = normalized;
  }

  return result;
}

function capQueryTokens(tokens: string[], maxTokens: number, maxChars: number) {
  const result: string[] = [];
  let length = 0;

  for (const token of tokens) {
    const nextLength = length === 0 ? token.length : length + token.length + 1;
    if (result.length >= maxTokens || nextLength > maxChars) {
      break;
    }
    result.push(token);
    length = nextLength;
  }

  return result;
}

function buildBroadSearchText(cleanedProductName: string) {
  const broadBase = removeBroadFallbackNoise(
    removeFlavorWordsForBroadFallback(removePackSizeText(cleanedProductName)),
  );
  const tokens = buildMeaningfulProductTokens(broadBase);

  return capQueryTokens(tokens, 8, 64).join(" ");
}

function buildIngredientSignalText(cleanedProductName: string, brand: string) {
  const tokens = buildMeaningfulProductTokens(
    removeBroadFallbackNoise(removePackSizeText(cleanedProductName)),
  );
  const ingredientTokens = tokens.filter((token, index) => {
    const normalized = token.toLowerCase();
    return LIKELY_ACTIVE_INGREDIENT_WORDS.has(normalized) ||
      (index > 0 && tokens[index - 1].toLowerCase() === "vitamin");
  });
  const mergedTokens = ingredientTokens.length > 0
    ? ingredientTokens
    : tokens;
  const capped = capQueryTokens(mergedTokens, 6, 48).join(" ");

  if (!brand) {
    return capped;
  }

  return capped.toLowerCase().startsWith(brand.toLowerCase())
    ? capped
    : `${brand} ${capped}`.trim();
}

function buildBrandQueryPrefix(brand: string, broadSearchText: string) {
  if (!brand) {
    return broadSearchText;
  }

  return broadSearchText.toLowerCase().startsWith(brand.toLowerCase())
    ? broadSearchText
    : `${brand} ${broadSearchText}`.trim();
}

function buildLikelySiteQuery(brand: string, broadSearchText: string) {
  const domainToken = brand.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!domainToken || !broadSearchText) {
    return "";
  }

  return `site:${domainToken}.com ${broadSearchText}`;
}

function buildBroadProductNameQueries(
  cleanedProductName: string,
  brand: string,
) {
  const broadSearchText = buildBroadSearchText(cleanedProductName);
  const brandQueryPrefix = buildBrandQueryPrefix(brand, broadSearchText);
  const ingredientSignalText = buildIngredientSignalText(
    cleanedProductName,
    brand,
  );

  return [
    cleanedProductName ? `${cleanedProductName} ingredients` : "",
    brandQueryPrefix ? `${brandQueryPrefix} ingredients` : "",
    ingredientSignalText ? `${ingredientSignalText} ingredients` : "",
    brandQueryPrefix ? `${brandQueryPrefix} active ingredients` : "",
    brandQueryPrefix ? `${brandQueryPrefix} nutrition` : "",
    buildLikelySiteQuery(brand, broadSearchText),
  ];
}

function buildSearchQueries(
  { barcode, cleanedProductName, brand }: SearchContext,
  mode: SearchMode,
) {
  const queries = mode === "barcode"
    ? [
      `"${barcode}" supplement`,
      cleanedProductName ? `"${barcode}" "${cleanedProductName}"` : "",
      cleanedProductName
        ? `${barcode} ${cleanedProductName} ingredients`
        : `${barcode} supplement ingredients`,
    ]
    : mode === "product_name_exact"
    ? [
      cleanedProductName ? `"${cleanedProductName}" ingredients` : "",
      cleanedProductName ? `"${cleanedProductName}" supplement facts` : "",
      cleanedProductName && brand &&
          !cleanedProductName.toLowerCase().includes(brand.toLowerCase())
        ? `"${brand}" "${cleanedProductName}" ingredients`
        : "",
    ]
    : [
      ...buildBroadProductNameQueries(cleanedProductName, brand),
    ];

  return Array.from(
    new Set(queries.map((query) => normalizeWhitespace(query)).filter(Boolean)),
  );
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

function normalizeActiveIngredientFilterText(value: unknown) {
  return trimString(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isInactiveSupplementIngredient(ingredient: Ingredient) {
  const values = [
    ingredient.name,
    ingredient.raw_text,
  ].map(normalizeActiveIngredientFilterText).filter(Boolean);

  return values.some((value) =>
    INACTIVE_SUPPLEMENT_INGREDIENT_NAMES.has(value)
  );
}

function filterActiveSupplementIngredients(ingredients: Ingredient[]) {
  return ingredients.filter((ingredient) =>
    !isInactiveSupplementIngredient(ingredient)
  );
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

function hasStructuredIngredientEvidence(result: BarcodeSearchResult) {
  return Boolean(
    (result.product_name || result.brand) &&
      result.ingredients.some((ingredient) =>
        Boolean(trimString(ingredient.name) || trimString(ingredient.raw_text))
      ),
  );
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
  return filterActiveSupplementIngredients(result.ingredients)
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

function isEmptySearchResult(result: BarcodeSearchResult) {
  return !result.product_name && !result.brand && result.ingredients.length === 0;
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
  mode: SearchMode,
): SanitizedSearchResult {
  if (!value || typeof value !== "object") {
    return {
      result: emptyResult(barcode),
      reason: "non_object_response",
    };
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

  const result: BarcodeSearchResult = {
    barcode,
    product_name: sanitizeNullableString(record.product_name, 180),
    brand: sanitizeNullableString(record.brand, 120),
    serving_size: sanitizeNullableString(record.serving_size, 120),
    ingredients_text: sanitizeNullableString(record.ingredients_text, 4000),
    ingredients: filterActiveSupplementIngredients(
      sanitizeIngredients(record.ingredients),
    ),
    source_urls: sourceUrls,
    confidence: normalizeConfidence(record.confidence),
    verification_status: VERIFICATION_STATUS,
    persisted: false,
  };

  result.confidence = resolveConfidence(result);
  if (mode !== "barcode" && result.confidence === "high") {
    result.confidence = "medium";
  }

  if (sourceUrls.length > 0 && result.ingredients.length === 0) {
    return {
      result,
      reason: "sources_found_no_ingredients",
    };
  }

  if (sourceUrls.length === 0 && !hasStructuredIngredientEvidence(result)) {
    return {
      result: emptyResult(barcode),
      reason: "no_source_urls",
    };
  }

  if (sourceUrls.length === 0 && result.confidence === "high") {
    result.confidence = "medium";
  }

  if (isEmptySearchResult(result)) {
    return {
      result: emptyResult(barcode),
      reason: "no_product_identity_or_ingredients",
    };
  }

  if (result.ingredients.length === 0) {
    return {
      result,
      reason: "no_ingredients_found",
    };
  }

  return {
    result,
    reason: null,
  };
}

function buildOpenAiRequestBody(
  searchContext: SearchContext,
  toolType: string,
  mode: SearchMode,
) {
  const queries = buildSearchQueries(searchContext, mode);
  const isProductNameMode = mode !== "barcode";
  const isBroadProductNameMode = mode === "product_name_broad";

  return {
    model: OPENAI_MODEL,
    max_output_tokens: OPENAI_SEARCH_MAX_OUTPUT_TOKENS,
    instructions: [
      isProductNameMode
        ? "You search the public web for a credible supplement product match by product name when barcode search did not find usable ingredients."
        : "You search the public web for exact supplement product matches by barcode.",
      "Use only visible information from web pages returned by web search.",
      "Return ACTIVE SUPPLEMENT INGREDIENTS only. Do not return base liquids, carriers, excipients, flavours, sweeteners, acidity regulators, preservatives, colours, stabilisers, thickeners, sugars, salts, juices, or ordinary food/base ingredients.",
      "Examples of excluded inactive ingredients include water, purified water, flavouring, sweetener, acidity regulator, preservative, colour, stabiliser, thickener, citric acid, sucralose, glycerol, glucose syrup, juice, sugar, and salt.",
      "Never guess, infer from similar products, or copy data from near-matches, alternate flavours, alternate sizes, or lookalike labels.",
      isProductNameMode
        ? "If the barcode is not visible on the page, you may still accept a credible retailer or manufacturer source when the brand and core product identity match. Do not require an exact flavour or pack-size match for provisional ingredient extraction."
        : "Accept a source only when the page visibly identifies the exact barcode or the exact same product identity with enough evidence to avoid a near-match.",
      isProductNameMode
        ? "A manufacturer page, brand page, pharmacy, or reputable retailer listing that matches the core product identity is enough for provisional ingredient extraction even without barcode confirmation."
        : "Prefer barcode-confirmed sources whenever possible.",
      "Only return supplement product data. If the barcode resolves to a non-supplement or no reliable exact match, return null fields and empty arrays.",
      "Return dosage amounts only when explicitly visible in a source. Do not infer serving size or dosage from product names.",
      "Include only source URLs that you used for the returned fields.",
      isProductNameMode
        ? "Extract only ingredients that are explicitly visible in the searched page or web-search context. If sources are found but no ingredients are visible, return empty ingredients."
        : "Extract only ingredients that are explicitly visible in the barcode-confirmed source.",
      isProductNameMode
        ? "For this fallback mode, return provisional ingredients when a credible product-name match is found, even if the barcode itself is not shown."
        : "If no reliable barcode-confirmed result exists, return empty fields and arrays.",
      isBroadProductNameMode
        ? "These broader queries intentionally drop strict quoting. Use them to find a credible brand page or retailer listing for the same product identity."
        : "Prefer exact quoted identity matches when they are available.",
      "Return JSON only and follow the schema exactly.",
    ].join(" "),
    input: JSON.stringify(
      {
        task: isBroadProductNameMode
          ? "Find provisional supplement product data for this scanned supplement using broader product-name queries after exact quoted searches failed to find usable ingredients."
          : isProductNameMode
          ? "Find provisional supplement product data for this scanned supplement using the cleaned product name after barcode search failed to find usable ingredients."
          : "Find provisional supplement product data for this scanned barcode.",
        barcode: searchContext.barcode,
        product_name_from_scan: searchContext.cleanedProductName || null,
        original_product_name_from_scan: searchContext.rawProductName || null,
        brand_from_scan: searchContext.brand || null,
        suggested_search_queries: queries,
        required_output_shape: emptyOpenAiResultShape(searchContext.barcode),
        confidence_rules: {
          high:
            "Only when product name, brand, ingredients, and dosage amounts are confirmed from a reliable source, ideally with barcode confirmation.",
          medium:
            isProductNameMode
              ? "Use when the cleaned product name credibly matches a product page and ingredients are visible, even if the barcode is absent."
              : "Use when product name and brand are found but ingredients or dosages are incomplete.",
          low:
            isProductNameMode
              ? "Use when a likely product-name match is found with partial ingredient data."
              : "Use when only partial product identity is found or nothing reliable is found.",
        },
        verification_status: VERIFICATION_STATUS,
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

async function requestOpenAiSearch(
  searchContext: SearchContext,
  mode: SearchMode,
  telemetry?: LatencyTrace,
): Promise<SearchAttemptResult> {
  for (const toolType of OPENAI_WEB_SEARCH_TOOL_TYPES) {
    const finishSearch = telemetry?.start("openai_web_search_provider_call", {
      attempt: OPENAI_WEB_SEARCH_TOOL_TYPES.indexOf(toolType) + 1,
      mode,
      provider: "openai",
      timeoutMs: OPENAI_SEARCH_TIMEOUT_MS,
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      OPENAI_SEARCH_TIMEOUT_MS,
    );
    const searchQueries = buildSearchQueries(searchContext, mode);

    console.log("[search-barcode-with-openai] OpenAI search request", {
      barcode: searchContext.barcode,
      mode,
      toolType,
      cleanedProductName: searchContext.cleanedProductName || null,
      searchQueries,
    });

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify(
          buildOpenAiRequestBody(searchContext, toolType, mode),
        ),
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
        finishSearch?.({ httpStatus: response.status, success: false });

        if (shouldTryPreview) {
          continue;
        }

        return {
          result: null,
          emptyReason: `request_failed_${response.status}`,
          mode,
        };
      }

      const data = await response.json();
      const text = extractResponseText(data);
      const responseSources = Array.from(collectSourceUrls(data)).slice(0, 12);
      if (!text) {
        finishSearch?.({ found: false, success: true });
        console.log("[search-barcode-with-openai] returning empty result", {
          barcode: searchContext.barcode,
          mode,
          toolType,
          reason: "no_output_text",
          sourceUrls: responseSources,
        });
        return {
          result: emptyResult(searchContext.barcode),
          emptyReason: "no_output_text",
          mode,
        };
      }

      try {
        const sanitized = sanitizeSearchResult(
          JSON.parse(text),
          searchContext.barcode,
          responseSources,
          mode,
        );
        console.log("[search-barcode-with-openai] OpenAI search result", {
          barcode: searchContext.barcode,
          mode,
          toolType,
          sourceUrls: sanitized.result.source_urls,
          productName: sanitized.result.product_name,
          brand: sanitized.result.brand,
          ingredientCount: sanitized.result.ingredients.length,
          confidence: sanitized.result.confidence,
          emptyReason: sanitized.reason,
        });
        if (sanitized.reason) {
          console.log("[search-barcode-with-openai] returning empty result", {
            barcode: searchContext.barcode,
            mode,
            toolType,
            reason: sanitized.reason,
            sourceUrls: sanitized.result.source_urls,
            productName: sanitized.result.product_name,
            brand: sanitized.result.brand,
            ingredientCount: sanitized.result.ingredients.length,
          });
        }
        finishSearch?.({
          found: !sanitized.reason,
          ingredientCount: sanitized.result.ingredients.length,
          success: true,
        });
        return {
          result: sanitized.result,
          emptyReason: sanitized.reason,
          mode,
        };
      } catch (error) {
        finishSearch?.({
          success: false,
          error,
          errorCategory: "invalid_provider_response",
        });
        console.error("[search-barcode-with-openai] Invalid OpenAI JSON", {
          toolType,
          mode,
          message: error instanceof Error ? error.message : String(error),
        });
        return {
          result: emptyResult(searchContext.barcode),
          emptyReason: "invalid_json",
          mode,
        };
      }
    } catch (error) {
      finishSearch?.({ success: false, error });
      console.error("[search-barcode-with-openai] OpenAI request failed", {
        toolType,
        mode,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        result: null,
        emptyReason: "request_exception",
        mode,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    result: null,
    emptyReason: "unsupported_search_tool",
    mode,
  };
}

function shouldUseProductNameFallback(
  result: BarcodeSearchResult,
  cleanedProductName: string,
) {
  return Boolean(cleanedProductName) &&
    (isEmptySearchResult(result) || result.ingredients.length === 0);
}

async function requestBarcodeSearch(
  searchContext: SearchContext,
  telemetry?: LatencyTrace,
) {
  const barcodeAttempt = await requestOpenAiSearch(
    searchContext,
    "barcode",
    telemetry,
  );
  if (!barcodeAttempt.result) {
    return barcodeAttempt;
  }

  if (
    !shouldUseProductNameFallback(
      barcodeAttempt.result,
      searchContext.cleanedProductName,
    )
  ) {
    return barcodeAttempt;
  }

  console.log("[search-barcode-with-openai] falling back to cleaned product-name search", {
    barcode: searchContext.barcode,
    cleanedProductName: searchContext.cleanedProductName || null,
    reason: barcodeAttempt.emptyReason || "barcode_search_returned_no_ingredients",
  });

  const productNameExactAttempt = await requestOpenAiSearch(
    searchContext,
    "product_name_exact",
    telemetry,
  );
  if (!productNameExactAttempt.result) {
    return barcodeAttempt;
  }

  if (!productNameExactAttempt.emptyReason) {
    return productNameExactAttempt;
  }

  console.log("[search-barcode-with-openai] broadening product-name search", {
    barcode: searchContext.barcode,
    cleanedProductName: searchContext.cleanedProductName || null,
    reason:
      productNameExactAttempt.emptyReason ||
      "exact_product_name_search_returned_no_ingredients",
  });

  const productNameBroadAttempt = await requestOpenAiSearch(
    searchContext,
    "product_name_broad",
    telemetry,
  );
  if (productNameBroadAttempt.result && !productNameBroadAttempt.emptyReason) {
    return productNameBroadAttempt;
  }
  if (
    productNameBroadAttempt.result &&
    productNameBroadAttempt.emptyReason === "sources_found_no_ingredients"
  ) {
    return productNameBroadAttempt;
  }
  if (
    productNameExactAttempt.result &&
    productNameExactAttempt.emptyReason === "sources_found_no_ingredients"
  ) {
    return productNameExactAttempt;
  }

  return barcodeAttempt;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return instrumentEdgeRequest(
    request,
    { flow: "barcode_scan", action: "resolve_unknown_barcode" },
    async (telemetry) => {
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

  const rawProductName = trimString(body?.productName);
  const brand = trimString(body?.brand);
  const cleanedProductName = cleanProductNameForSearch(rawProductName);

  console.log("[search-barcode-with-openai] cleaned product context", {
    barcode,
    rawProductName: rawProductName || null,
    cleanedProductName: cleanedProductName || null,
    brand: brand || null,
  });

  const searchOutcome = await requestBarcodeSearch(
    {
      barcode,
      rawProductName,
      cleanedProductName,
      brand,
    },
    telemetry,
  );
  if (!searchOutcome.result) {
    return jsonResponse(
      { error: "AI service unavailable.", code: "ai_service_unavailable" },
      502,
    );
  }

  const result = searchOutcome.result;

  const finishPersistence = telemetry.start("product_persistence", {
    provider: "supabase",
  });
  try {
    const persistence = await persistSearchResult(result);
    finishPersistence({ success: true });
    return jsonResponse(withPersistenceResult(result, persistence.persisted));
  } catch (error) {
    finishPersistence({ success: false, error });
    console.error("[search-barcode-with-openai] persistence failed", error);
    return jsonResponse(
      withPersistenceResult(
        result,
        false,
        "Failed to persist OpenAI barcode result.",
      ),
    );
  }
    },
  );
});
