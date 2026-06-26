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
  const productName = trimString(body?.productName);
  const brand = trimString(body?.brand);
  let ingredientsText = trimString(body?.ingredientsText);
  const imageUrl = trimString(body?.imageUrl);
  const imageSourceUrl = trimString(body?.imageSourceUrl) || imageUrl;

  if (!barcode || !productName || !isValidBarcode(barcode, barcodeType)) {
    return jsonResponse(
      {
        error: "barcode, valid barcodeType, and productName are required.",
        code: "invalid_request_payload",
      },
      400,
    );
  }

  if (!ingredientsText) {
    ingredientsText = await enrichIngredientsWithOpenAI({
      barcode,
      productName,
      brand,
    });
  }

  if (ingredientsText) {
    console.log(
      "[go-upc-persist] Ingredients available for provisional product",
      {
        barcode,
        productName,
        source: body?.ingredientsText ? "request_body" : "openai_enrichment",
      },
    );
  }

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
          "product_id, barcode, display_name, active_ingredients_json, image_url, image_source_url, image_provider, image_status, verification_status",
        )
        .eq("product_id", productResolution.productId)
        .maybeSingle();

    if (masterReadError) {
      throw new Error(
        `[supabase:${TABLES.supplementProducts}] ${masterReadError.message}`,
      );
    }

    const shouldPreserveCanonicalStatus =
      hasCanonicalIngredients(existingMaster?.active_ingredients_json) &&
      trimString(existingMaster?.verification_status) !== "go_upc_unverified";

    const verificationStatus = shouldPreserveCanonicalStatus
      ? trimString(existingMaster?.verification_status) || "verified"
      : "go_upc_unverified";
    const resolvedImageUrl = imageUrl ||
      trimString(existingMaster?.image_url) || null;
    const resolvedImageSourceUrl = imageSourceUrl ||
      trimString(existingMaster?.image_source_url) || null;
    const resolvedImageProvider = imageUrl
      ? "go_upc"
      : trimString(existingMaster?.image_provider) || null;
    const resolvedImageStatus = resolvedImageUrl
      ? "found"
      : trimString(existingMaster?.image_status) || "missing";

    const { error: masterWriteError } = await adminSupabase!
      .from(TABLES.supplementProducts)
      .upsert(
        {
          product_id: productResolution.productId,
          barcode,
          display_name: trimString(existingMaster?.display_name) || productName,
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

    console.log("[go-upc-persist] persisted provisional product", {
      barcode,
      productId: productResolution.productId,
      verificationStatus,
      createdProduct: productResolution.createdProduct,
      hasImage: Boolean(resolvedImageUrl),
    });

    return jsonResponse({
      productId: productResolution.productId,
      createdProduct: productResolution.createdProduct,
      barcode,
      displayName: trimString(existingMaster?.display_name) || productName,
      imageUrl: resolvedImageUrl,
      imageSourceUrl: resolvedImageSourceUrl,
      imageProvider: resolvedImageProvider,
      imageStatus: resolvedImageStatus,
      verificationStatus,
      isProvisional: verificationStatus === "go_upc_unverified",
    });
  } catch (error) {
    console.error("[go-upc-persist] failed", error);
    return jsonResponse(
      {
        error: "Failed to persist Go-UPC product.",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
