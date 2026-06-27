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

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_ENRICHMENT_TIMEOUT_MS = 10_000;
const OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS = 600;
const OPENAI_WEB_SEARCH_TOOL_TYPES = ["web_search", "web_search_preview"];

const adminSupabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

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

function normalizeProvisionalIngredientText(value: unknown) {
  return trimString(value)
    .normalize("NFKC")
    .replace(
      /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\uFEFF]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeProvisionalIngredientText(item))
    .filter(Boolean);
}

function normalizeDosageUnit(value: string) {
  const normalized = trimString(value).toLowerCase().replace(/[µμ]/g, "u");
  if (!normalized) {
    return null;
  }
  if (normalized === "ug") {
    return "mcg";
  }
  if (normalized === "iu") {
    return "IU";
  }
  return normalized;
}

function stripProvisionalMarketingText(value: string) {
  const trimmed = normalizeProvisionalIngredientText(value)
    .replace(
      /^(?:the supplement includes key ingredients such as|the supplement includes|key ingredients(?: include| are| such as)?|includes key ingredients such as|ingredients include|contains)\s+/i,
      "",
    );

  const keptSentences = trimmed
    .split(/(?<!\d)[.!?]+(?!\d)/)
    .map((sentence) => normalizeProvisionalIngredientText(sentence))
    .filter(Boolean)
    .filter(
      (sentence) =>
        !/^(?:these components|these ingredients|carefully selected|selected to|designed to|formulated to|to support|supporting|helps?\b|helping\b|promotes?\b|promoting\b|provides?\b|providing\b)/i
          .test(sentence),
    )
    .map((sentence) =>
      sentence.replace(
        /\b(?:these components|these ingredients|carefully selected|selected to|designed to|formulated to|to support|supporting|helps?\b|helping\b|promotes?\b|promoting\b|provides?\b|providing\b).*$/i,
        "",
      )
    )
    .map((sentence) => normalizeProvisionalIngredientText(sentence))
    .filter(Boolean);

  return keptSentences.join(", ");
}

function titleCaseFallback(value: string) {
  if (!value || /[A-Z]/.test(value)) {
    return value;
  }

  return value.replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function normalizeProvisionalIngredientName(
  value: string,
  preferVitaminPrefix: boolean,
) {
  let next = normalizeProvisionalIngredientText(value)
    .replace(/^ingredients?\s*:\s*/i, "")
    .replace(/^(?:and|with|plus)\b[\s,:-]*/i, "")
    .replace(/^[,;:•·-]+/, "")
    .replace(/[,;:•·-]+$/, "")
    .trim();

  if (!next) {
    return { name: "", carriesVitaminContext: preferVitaminPrefix };
  }

  let carriesVitaminContext = preferVitaminPrefix;
  if (/^vitamins?\s+/i.test(next)) {
    next = next.replace(/^vitamins?\s+/i, "").trim();
    carriesVitaminContext = true;
  } else if (/^minerals?\s+/i.test(next)) {
    next = next.replace(/^minerals?\s+/i, "").trim();
  }

  const vitaminCodeMatch = next.match(/^([A-Za-z])(?:[\s-]*([0-9]{0,2}))?$/);
  if (
    vitaminCodeMatch &&
    (carriesVitaminContext ||
      /^(?:A|B|C|D|E|K)$/i.test(vitaminCodeMatch[1]))
  ) {
    const vitaminSuffix = `${vitaminCodeMatch[1].toUpperCase()}${
      vitaminCodeMatch[2] ?? ""
    }`;
    return {
      name: `Vitamin ${vitaminSuffix}`,
      carriesVitaminContext: true,
    };
  }

  const explicitVitaminMatch = next.match(
    /^vitamin\s+([A-Za-z])(?:[\s-]*([0-9]{0,2}))?$/i,
  );
  if (explicitVitaminMatch) {
    return {
      name: `Vitamin ${explicitVitaminMatch[1].toUpperCase()}${
        explicitVitaminMatch[2] ?? ""
      }`,
      carriesVitaminContext: true,
    };
  }

  return {
    name: titleCaseFallback(next),
    carriesVitaminContext,
  };
}

function parseProvisionalIngredient(
  value: string,
  preferVitaminPrefix: boolean,
) {
  let next = normalizeProvisionalIngredientText(value)
    .replace(
      /\b(?:these components|these ingredients|carefully selected|selected to|designed to|formulated to|to support|supporting|helps?\b|helping\b|promotes?\b|promoting\b|provides?\b|providing\b).*$/i,
      "",
    )
    .trim();

  if (!next) {
    return { ingredient: null, carriesVitaminContext: preferVitaminPrefix };
  }

  const dosageMatch = next.match(
    /\b(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|μg|ug|g|kg|iu|ml|l)\b/i,
  );
  const dosageValue = dosageMatch
    ? Number.parseFloat(dosageMatch[1].replace(",", "."))
    : null;
  const dosageUnit = dosageMatch ? normalizeDosageUnit(dosageMatch[2]) : null;
  const dosageDisplay = Number.isFinite(dosageValue) && dosageUnit
    ? `${String(dosageValue).replace(/\.0$/, "")} ${dosageUnit}`
    : null;

  if (dosageMatch) {
    next = next
      .replace(
        /\(?\b\d+(?:[.,]\d+)?\s*(mg|mcg|µg|μg|ug|g|kg|iu|ml|l)\b(?:\s*\/\s*serving)?\)?/i,
        "",
      )
      .replace(/\(\s*\)/g, "")
      .trim();
  }

  const normalizedName = normalizeProvisionalIngredientName(
    next,
    preferVitaminPrefix,
  );
  if (!normalizedName.name) {
    return {
      ingredient: null,
      carriesVitaminContext: normalizedName.carriesVitaminContext,
    };
  }

  return {
    ingredient: {
      name: normalizedName.name,
      dosageValue: Number.isFinite(dosageValue) ? dosageValue : null,
      dosageUnit,
      dosageDisplay,
    },
    carriesVitaminContext: normalizedName.carriesVitaminContext,
  };
}

function buildProvisionalActiveIngredients(
  sourceIngredients: unknown,
  ingredientsText: string,
) {
  const providedIngredients = sanitizeStringArray(sourceIngredients);
  const normalizedText = stripProvisionalMarketingText(ingredientsText)
    .replace(/\s+(?:and|plus)\s+/gi, ", ");
  const rawIngredients = providedIngredients.length > 0
    ? providedIngredients
    : normalizedText
      .split(/\s*,\s*(?=[A-Za-z])|[;\n]+/)
      .map((item) => normalizeProvisionalIngredientText(item))
      .filter(Boolean);

  const parsedIngredients = [];
  const seenIngredients = new Set<string>();
  let carriesVitaminContext = false;

  rawIngredients.forEach((item) => {
    const parsed = parseProvisionalIngredient(item, carriesVitaminContext);
    carriesVitaminContext = parsed.carriesVitaminContext;

    if (!parsed.ingredient?.name) {
      return;
    }

    const key = [
      parsed.ingredient.name.toLowerCase(),
      parsed.ingredient.dosageDisplay ?? "",
    ].join("|");
    if (seenIngredients.has(key)) {
      return;
    }

    seenIngredients.add(key);
    parsedIngredients.push(parsed.ingredient);
  });

  return parsedIngredients.slice(0, 80);
}

function sanitizeDsldActiveIngredients(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIngredients = new Set<string>();
  const ingredients = [];

  value.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const row = item as Record<string, unknown>;
    const name = normalizeProvisionalIngredientText(row.name);
    if (!name) {
      return;
    }

    const dosageValueRaw = row.dosageValue;
    const dosageValue = typeof dosageValueRaw === "number" &&
        Number.isFinite(dosageValueRaw)
      ? dosageValueRaw
      : null;
    const dosageUnit = trimString(row.dosageUnit) || null;
    const dosageDisplay = trimString(row.dosageDisplay) ||
      (Number.isFinite(dosageValue) && dosageUnit
        ? `${dosageValue} ${dosageUnit}`
        : null);
    const ingredientType = trimString(row.ingredientType) || null;
    const parentBlend = trimString(row.parentBlend) || null;
    const key = [
      name.toLowerCase(),
      dosageDisplay ?? "",
      ingredientType ?? "",
      parentBlend ?? "",
    ].join("|");

    if (seenIngredients.has(key)) {
      return;
    }

    seenIngredients.add(key);
    ingredients.push({
      name,
      dosageValue,
      dosageUnit,
      dosageDisplay,
      ingredientType,
      parentBlend,
    });
  });

  return ingredients.slice(0, 120);
}

function getVerificationStatusRank(value: unknown) {
  switch (trimString(value)) {
    case "open_food_facts_unverified":
    case "ean_search_unverified":
    case "go_upc_unverified":
      return 10;
    case "dsld_verified":
      return 80;
    case "photo_verified":
      return 90;
    case "verified":
      return 100;
    default:
      return 0;
  }
}

function getProvisionalBaseSource(source: string) {
  if (source === "ean_search" || source === "ean_search_plus_openai") {
    return "ean_search";
  }
  if (
    source === "open_food_facts" ||
    source === "open_food_facts_plus_openai"
  ) {
    return "open_food_facts";
  }
  return "go_upc";
}

function getProvisionalVerificationStatus(source: string) {
  const baseSource = getProvisionalBaseSource(source);
  if (baseSource === "ean_search") {
    return "ean_search_unverified";
  }
  if (baseSource === "open_food_facts") {
    return "open_food_facts_unverified";
  }
  return "go_upc_unverified";
}

function isProvisionalVerificationStatus(value: unknown) {
  const status = trimString(value);
  return (
    status === "go_upc_unverified" ||
    status === "ean_search_unverified" ||
    status === "open_food_facts_unverified"
  );
}

const RETAIL_BARCODE_TYPES = new Set(["ean13", "ean8", "upc_a", "upc_e"]);
const ALPHANUMERIC_BARCODE_TYPES = new Set(["code128", "code39", "code93"]);
const SAFE_ALPHANUMERIC_BARCODE_PATTERN = /^[A-Za-z0-9._-]{4,40}$/;

function canonicalizeBarcodeType(value: unknown): string {
  const rawType = trimString(value).toLowerCase();
  if (!rawType) {
    return "";
  }

  if (rawType.includes("ean13") || rawType.includes("ean-13")) {
    return "ean13";
  }
  if (rawType.includes("ean8") || rawType.includes("ean-8")) {
    return "ean8";
  }
  if (
    rawType.includes("upca") ||
    rawType.includes("upc-a") ||
    rawType.includes("upc_a")
  ) {
    return "upc_a";
  }
  if (
    rawType.includes("upce") ||
    rawType.includes("upc-e") ||
    rawType.includes("upc_e")
  ) {
    return "upc_e";
  }
  if (
    rawType.includes("code128") ||
    rawType.includes("code-128") ||
    rawType.includes("code_128")
  ) {
    return "code128";
  }
  if (
    rawType.includes("code39") ||
    rawType.includes("code-39") ||
    rawType.includes("code_39")
  ) {
    return "code39";
  }
  if (
    rawType.includes("code93") ||
    rawType.includes("code-93") ||
    rawType.includes("code_93")
  ) {
    return "code93";
  }

  return rawType;
}

function normalizeBarcodeValue(value: unknown, barcodeType: unknown): string {
  const rawBarcode = trimString(value);
  const normalizedType = canonicalizeBarcodeType(barcodeType);

  if (RETAIL_BARCODE_TYPES.has(normalizedType)) {
    const cleaned = rawBarcode.replace(/\D/g, "");
    if (normalizedType === "ean13" && /^\d{12}$/.test(cleaned)) {
      return `0${cleaned}`;
    }
    return cleaned;
  }

  if (ALPHANUMERIC_BARCODE_TYPES.has(normalizedType)) {
    return rawBarcode;
  }

  return rawBarcode;
}

function isValidBarcode(value: string, barcodeType: unknown): boolean {
  const normalizedType = canonicalizeBarcodeType(barcodeType);

  if (normalizedType === "ean13") {
    return /^\d{13}$/.test(value);
  }
  if (normalizedType === "ean8") {
    return /^\d{8}$/.test(value);
  }
  if (normalizedType === "upc_a") {
    return /^\d{12}$/.test(value);
  }
  if (normalizedType === "upc_e") {
    return /^\d{6,8}$/.test(value);
  }
  if (ALPHANUMERIC_BARCODE_TYPES.has(normalizedType)) {
    return SAFE_ALPHANUMERIC_BARCODE_PATTERN.test(value);
  }

  return SAFE_ALPHANUMERIC_BARCODE_PATTERN.test(value);
}

function buildBarcodeLookupCandidates(barcode: string, barcodeType: string) {
  const normalizedBarcode = normalizeBarcodeValue(barcode, barcodeType);
  const candidates = [normalizedBarcode];

  if (/^\d{12}$/.test(normalizedBarcode)) {
    candidates.push(`0${normalizedBarcode}`);
  } else if (/^0\d{12}$/.test(normalizedBarcode)) {
    candidates.push(normalizedBarcode.slice(1));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function getBodyByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function hasCanonicalIngredients(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

async function fetchOffProductByBarcode(barcode: string, barcodeType: string) {
  const barcodeCandidates = buildBarcodeLookupCandidates(barcode, barcodeType);
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
    .find(Boolean);
}

async function resolveOrCreateProduct({
  barcode,
  barcodeType,
  productName,
  ingredientsText,
}: {
  barcode: string;
  barcodeType: string;
  productName: string;
  ingredientsText: string;
}) {
  const existingProduct = await fetchOffProductByBarcode(barcode, barcodeType);
  if (existingProduct?.id) {
    if (ingredientsText && !trimString(existingProduct.ingredients)) {
      const { error } = await adminSupabase!
        .from(TABLES.products)
        .update({ ingredients: ingredientsText })
        .eq("id", existingProduct.id);

      if (error) {
        throw new Error(`[supabase:${TABLES.products}] ${error.message}`);
      }

      return {
        productId: trimString(existingProduct.id),
        createdProduct: false,
        product: {
          ...existingProduct,
          ingredients: ingredientsText,
        },
      };
    }

    return {
      productId: trimString(existingProduct.id),
      createdProduct: false,
      product: existingProduct,
    };
  }

  const nextProduct = {
    id: crypto.randomUUID(),
    barcode: normalizeBarcodeValue(barcode, barcodeType),
    name: productName,
    ingredients: ingredientsText,
  };

  const { error } = await adminSupabase!
    .from(TABLES.products)
    .insert(nextProduct);

  if (error) {
    const winner = await fetchOffProductByBarcode(barcode, barcodeType);
    if (winner?.id) {
      if (ingredientsText && !trimString(winner.ingredients)) {
        const { error: updateWinnerError } = await adminSupabase!
          .from(TABLES.products)
          .update({ ingredients: ingredientsText })
          .eq("id", winner.id);

        if (updateWinnerError) {
          throw new Error(
            `[supabase:${TABLES.products}] ${updateWinnerError.message}`,
          );
        }

        return {
          productId: trimString(winner.id),
          createdProduct: false,
          product: {
            ...winner,
            ingredients: ingredientsText,
          },
        };
      }

      return {
        productId: trimString(winner.id),
        createdProduct: false,
        product: winner,
      };
    }

    throw new Error(`[supabase:${TABLES.products}] ${error.message}`);
  }

  return {
    productId: nextProduct.id,
    createdProduct: true,
    product: nextProduct,
  };
}

async function enrichIngredientsWithOpenAI({
  barcode,
  productName,
  brand,
}: {
  barcode: string;
  productName: string;
  brand: string;
}) {
  if (!openAiApiKey || !productName) {
    return "";
  }

  const searchName = brand ? `${brand} ${productName}`.trim() : productName;
  const requestBodyBase = {
    model: OPENAI_MODEL,
    max_output_tokens: OPENAI_ENRICHMENT_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: "system",
        content:
          "You find supplement product ingredient lists from public manufacturer or retailer label/product pages. Return only the full supplement ingredient list as plain text. Do not include marketing claims. If no reliable ingredient list is found, return an empty string.",
      },
      {
        role: "user",
        content: [
          "Use web search to find the ingredient list for this exact supplement product.",
          `Product name: ${searchName}`,
          `Brand: ${brand || "unknown"}`,
          `Barcode: ${barcode}`,
          "Only accept public manufacturer or retailer label/product pages.",
          "The product name plus brand or barcode must match.",
          "Reject near-matches, different flavours, variants, sizes, or similar products unless the page clearly identifies the same product.",
          "Return only the full supplement ingredient list as plain text, including amounts or dosages when available.",
          "Return an empty string if uncertain or if no reliable ingredient list is found.",
        ].join("\n"),
      },
    ],
  };

  for (const toolType of OPENAI_WEB_SEARCH_TOOL_TYPES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      OPENAI_ENRICHMENT_TIMEOUT_MS,
    );

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          ...requestBodyBase,
          tools: [{ type: toolType }],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        const shouldTryPreview = toolType === "web_search" &&
          response.status === 400;

        console.error("[go-upc-persist] OpenAI enrichment failed", {
          status: response.status,
          toolType,
          body,
        });

        if (shouldTryPreview) {
          continue;
        }

        return "";
      }

      const data = await response.json();
      const text = trimString(data?.output_text);

      if (!text || text.length < 5) {
        return "";
      }

      return text.slice(0, 4000);
    } catch (error) {
      console.error("[go-upc-persist] OpenAI enrichment failed", {
        toolType,
        message: error instanceof Error ? error.message : String(error),
      });

      return "";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!adminSupabase) {
    return jsonResponse(
      { error: "Missing Supabase service role configuration." },
      500,
    );
  }

  const rawBodyText = await request.text();
  if (!trimString(rawBodyText)) {
    return jsonResponse(
      {
        error: "Request body is required.",
        code: "invalid_request_payload",
      },
      400,
    );
  }

  if (getBodyByteLength(rawBodyText) > 30_000) {
    return jsonResponse(
      {
        error: "Request payload is too large.",
        code: "payload_too_large",
      },
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

  const barcodeType = canonicalizeBarcodeType(body?.barcodeType);
  const barcode = normalizeBarcodeValue(body?.barcode, barcodeType);
  const requestedSource = trimString(body?.source).toLowerCase();
  const source = requestedSource === "dsld"
    ? "dsld"
    : requestedSource === "ean_search"
    ? "ean_search"
    : requestedSource === "ean_search_plus_openai"
    ? "ean_search_plus_openai"
    : requestedSource === "open_food_facts"
    ? "open_food_facts"
    : requestedSource === "open_food_facts_plus_openai"
    ? "open_food_facts_plus_openai"
    : requestedSource === "go_upc_plus_openai"
    ? "go_upc_plus_openai"
    : "go_upc";
  const isProvisionalSource = source !== "dsld";
  const provisionalBaseSource = getProvisionalBaseSource(source);
  const provisionalVerificationStatus = getProvisionalVerificationStatus(
    source,
  );
  const productName = trimString(body?.productName);
  const brand = trimString(body?.brand);
  const servingSizeText = trimString(body?.servingSizeText);
  let ingredientsText = trimString(body?.ingredientsText);
  const hadRequestIngredientsText = Boolean(ingredientsText);
  const imageUrl = trimString(body?.imageUrl);
  const imageSourceUrl = trimString(body?.imageSourceUrl) || imageUrl;
  const imageProvider = trimString(body?.imageProvider) ||
    (imageUrl ? provisionalBaseSource : "");

  if (!barcode || !productName || !isValidBarcode(barcode, barcodeType)) {
    return jsonResponse(
      {
        error: "barcode, valid barcodeType, and productName are required.",
        code: "invalid_request_payload",
      },
      400,
    );
  }

  const dsldActiveIngredients = source === "dsld"
    ? sanitizeDsldActiveIngredients(body?.sourceIngredients)
    : [];
  const dsldConfidence = trimString(body?.dsldConfidence).toLowerCase();
  const hasExactDsldBarcodeMatch = body?.exactBarcodeMatch === true ||
    dsldConfidence === "high";

  if (
    source === "dsld" &&
    (!hasExactDsldBarcodeMatch || dsldActiveIngredients.length === 0)
  ) {
    return jsonResponse(
      {
        error:
          "DSLD persistence requires an exact high-confidence match with structured ingredients.",
        code: "invalid_request_payload",
      },
      400,
    );
  }

  if (isProvisionalSource && !ingredientsText) {
    ingredientsText = await enrichIngredientsWithOpenAI({
      barcode,
      productName,
      brand,
    });
  }
  const usedOpenAiIngredientEnrichment = Boolean(
    !hadRequestIngredientsText && ingredientsText,
  );
  const sourceForName =
    source === "open_food_facts" && usedOpenAiIngredientEnrichment
      ? "open_food_facts_plus_openai"
      : source;

  if (isProvisionalSource && ingredientsText) {
    console.log(
      "[go-upc-persist] Ingredients available for provisional product",
      {
        barcode,
        productName,
        source: hadRequestIngredientsText
          ? "request_body"
          : "openai_enrichment",
      },
    );
  }

  const structuredGoUpcIngredients = isProvisionalSource
    ? sanitizeDsldActiveIngredients(
      Array.isArray(body?.active_ingredients_json)
        ? body.active_ingredients_json
        : Array.isArray(body?.activeIngredientsJson)
        ? body.activeIngredientsJson
        : body?.sourceIngredients,
    )
    : [];
  const provisionalActiveIngredients = isProvisionalSource
    ? structuredGoUpcIngredients.length > 0
      ? structuredGoUpcIngredients
      : buildProvisionalActiveIngredients(
        body?.sourceIngredients,
        ingredientsText,
      )
    : [];

  try {
    const productResolution = await resolveOrCreateProduct({
      barcode,
      barcodeType,
      productName: brand ? `${brand} ${productName}`.trim() : productName,
      ingredientsText,
    });

    const { data: existingMaster, error: masterReadError } =
      await adminSupabase!
        .from(TABLES.supplementProducts)
        .select(
          "product_id, barcode, display_name, name_source, naming_confidence, serving_size_text, active_ingredients_json, ingredient_count, processed_at, image_url, image_source_url, image_provider, image_status, verification_status",
        )
        .eq("product_id", productResolution.productId)
        .maybeSingle();

    if (masterReadError) {
      throw new Error(
        `[supabase:${TABLES.supplementProducts}] ${masterReadError.message}`,
      );
    }

    const existingVerificationStatus = trimString(
      existingMaster?.verification_status,
    );
    const incomingVerificationStatus = source === "dsld"
      ? "dsld_verified"
      : provisionalVerificationStatus;
    const existingQualityRank = getVerificationStatusRank(
      existingVerificationStatus,
    );
    const incomingQualityRank = getVerificationStatusRank(
      incomingVerificationStatus,
    );
    const shouldPreserveHigherQualityExisting =
      Boolean(existingMaster?.product_id) &&
      existingQualityRank > incomingQualityRank;
    const shouldPreserveCanonicalStatus =
      hasCanonicalIngredients(existingMaster?.active_ingredients_json) &&
      !isProvisionalVerificationStatus(existingMaster?.verification_status);
    const existingDisplayName = trimString(existingMaster?.display_name);
    const existingNameSource = trimString(existingMaster?.name_source);
    const shouldPreserveExistingName = Boolean(existingDisplayName) &&
      Boolean(existingNameSource) &&
      existingNameSource !== "go_upc" &&
      existingNameSource !== "go_upc_plus_openai" &&
      existingNameSource !== "ean_search" &&
      existingNameSource !== "ean_search_plus_openai" &&
      existingNameSource !== "open_food_facts" &&
      existingNameSource !== "open_food_facts_plus_openai";

    const verificationStatus = shouldPreserveHigherQualityExisting
      ? existingVerificationStatus || "verified"
      : source === "dsld"
      ? "dsld_verified"
      : shouldPreserveCanonicalStatus
      ? existingVerificationStatus || "verified"
      : provisionalVerificationStatus;
    const resolvedDisplayName = shouldPreserveHigherQualityExisting ||
        (isProvisionalSource && shouldPreserveExistingName)
      ? existingDisplayName
      : productName;
    const resolvedNameSource = shouldPreserveHigherQualityExisting ||
        (isProvisionalSource && shouldPreserveExistingName)
      ? existingNameSource
      : sourceForName;
    const resolvedNamingConfidence = shouldPreserveHigherQualityExisting ||
        (isProvisionalSource && shouldPreserveExistingName)
      ? shouldPreserveExistingName &&
          typeof existingMaster?.naming_confidence === "number" &&
          Number.isFinite(existingMaster.naming_confidence)
        ? existingMaster.naming_confidence
        : null
      : source === "dsld" && hasExactDsldBarcodeMatch
      ? 1
      : null;
    const existingActiveIngredients = Array.isArray(
        existingMaster?.active_ingredients_json,
      )
      ? existingMaster.active_ingredients_json
      : [];
    const resolvedActiveIngredients = shouldPreserveHigherQualityExisting ||
        (isProvisionalSource && existingActiveIngredients.length > 0)
      ? existingActiveIngredients
      : source === "dsld"
      ? dsldActiveIngredients
      : provisionalActiveIngredients;
    const resolvedIngredientCount = resolvedActiveIngredients.length;
    const processedAt = new Date().toISOString();
    const resolvedImageUrl = imageUrl ||
      trimString(existingMaster?.image_url) || null;
    const resolvedImageSourceUrl = imageSourceUrl ||
      trimString(existingMaster?.image_source_url) || null;
    const resolvedImageProvider = imageUrl
      ? imageProvider || provisionalBaseSource
      : trimString(existingMaster?.image_provider) || null;
    const resolvedImageStatus = resolvedImageUrl
      ? "found"
      : trimString(existingMaster?.image_status) || "missing";
    const resolvedServingSizeText = shouldPreserveHigherQualityExisting
      ? trimString(existingMaster?.serving_size_text) || null
      : servingSizeText || null;

    const { error: masterWriteError } = await adminSupabase!
      .from(TABLES.supplementProducts)
      .upsert(
        {
          product_id: productResolution.productId,
          barcode,
          display_name: resolvedDisplayName,
          name_source: resolvedNameSource,
          naming_confidence: resolvedNamingConfidence,
          serving_size_text: resolvedServingSizeText,
          active_ingredients_json: resolvedActiveIngredients,
          ingredient_count: resolvedIngredientCount,
          processed_at: processedAt,
          image_url: resolvedImageUrl,
          image_source_url: resolvedImageSourceUrl,
          image_provider: resolvedImageProvider,
          image_status: resolvedImageStatus,
          verification_status: verificationStatus,
        },
        {
          onConflict: "product_id",
        },
      );

    if (masterWriteError) {
      throw new Error(
        `[supabase:${TABLES.supplementProducts}] ${masterWriteError.message}`,
      );
    }

    console.log("[go-upc-persist] persisted product", {
      barcode,
      productId: productResolution.productId,
      source: sourceForName,
      displayName: resolvedDisplayName,
      nameSource: resolvedNameSource,
      verificationStatus,
      preservedHigherQualityExisting: shouldPreserveHigherQualityExisting,
      createdProduct: productResolution.createdProduct,
      hasImage: Boolean(resolvedImageUrl),
    });

    return jsonResponse({
      productId: productResolution.productId,
      createdProduct: productResolution.createdProduct,
      barcode,
      displayName: resolvedDisplayName,
      nameSource: resolvedNameSource,
      ingredientsText,
      servingSizeText: resolvedServingSizeText,
      activeIngredientsJson: resolvedActiveIngredients,
      active_ingredients_json: resolvedActiveIngredients,
      ingredientCount: resolvedIngredientCount,
      ingredient_count: resolvedIngredientCount,
      imageUrl: resolvedImageUrl,
      imageSourceUrl: resolvedImageSourceUrl,
      imageProvider: resolvedImageProvider,
      imageStatus: resolvedImageStatus,
      verificationStatus,
      isProvisional: isProvisionalVerificationStatus(verificationStatus),
      preservedHigherQualityExisting: shouldPreserveHigherQualityExisting,
    });
  } catch (error) {
    console.error("[go-upc-persist] failed", error);
    return jsonResponse(
      {
        error: "Failed to persist product.",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
