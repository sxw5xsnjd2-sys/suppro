import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertActiveRevenueCatEntitlement,
  authenticateSupabaseUser,
} from "../_shared/revenuecat.ts";
import { enforceEdgeFunctionQuota } from "../_shared/quota.ts";
import {
  buildEnrichProductImageResponse,
  validateEnrichProductImageRequest,
} from "../_shared/enrich-product-image-policy.js";
import { isTrustedEdgeFunctionRequest } from "../_shared/auth-policy.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TABLES = {
  products: "off_products",
  supplementProducts: "supplement_products_master",
  naming: "off_products_ai_naming",
};

const IMAGE_PROVIDER = "serpapi_google_images";
const SERPAPI_URL = "https://serpapi.com/search.json";
const SUPPLEMENT_PRODUCT_PREFIX = "product:";

const GENERIC_INGREDIENT_NAMES = new Set([
  "magnesium",
  "creatine",
  "creatine monohydrate",
  "vitamin d",
  "vitamin d3",
  "vitamin c",
  "zinc",
  "omega 3",
  "omega-3",
  "ashwagandha",
  "berberine",
  "collagen",
  "whey protein",
  "calcium",
  "iron",
  "probiotics",
  "probiotic",
  "caffeine",
  "electrolyte",
  "electrolytes",
  "multivitamin",
]);

const GENERIC_PATTERNS = [
  /^vitamin\s+[a-z0-9]+(?:\s+\d+\s*(?:iu|mg|mcg|ug))?$/i,
  /^(?:magnesium|zinc|calcium|iron)\s+[a-z]+$/i,
  /^(?:l[-\s])?(?:theanine|carnitine|citrulline|arginine|glutamine|tyrosine)$/i,
  /^(?:fish oil|cod liver oil|coq10|coenzyme q10|folate|biotin|melatonin)$/i,
];

const TRUSTED_SOURCE_PATTERNS = [
  /iherb\./i,
  /hollandandbarrett\./i,
  /holland\s*&\s*barrett/i,
  /boots\./i,
  /myprotein\./i,
  /vitabiotics\./i,
  /centrum\./i,
  /solgar\./i,
  /gnc\./i,
  /vitaminshoppe\./i,
  /bodybuilding\./i,
  /supplement/i,
  /nutrition/i,
  /pharmacy/i,
  /chemist/i,
  /healthspan\./i,
  /official/i,
  /\/products?\//i,
  /\/shop\//i,
  /\/p\//i,
];

const MARKETPLACE_SOURCE_PATTERNS = [
  /amazon\./i,
  /ebay\./i,
  /walmart\./i,
  /marketplace/i,
];

const BAD_SOURCE_PATTERNS = [
  /pinterest\./i,
  /facebook\./i,
  /instagram\./i,
  /tiktok\./i,
  /reddit\./i,
  /x\.com/i,
  /twitter\./i,
  /shutterstock\./i,
  /istockphoto\./i,
  /gettyimages\./i,
  /alamy\./i,
  /dreamstime\./i,
  /stockphoto/i,
  /recipe/i,
  /blogspot\./i,
  /wordpress\./i,
];

const UNRELATED_TERMS = [
  "recipe",
  "smoothie",
  "food",
  "meal",
  "wallpaper",
  "clipart",
  "stock photo",
  "side effects",
  "benefits",
  "deficiency",
];

const GENERIC_IMAGE_TERMS = [
  "ingredient",
  "powder scoop",
  "chemical structure",
  "molecule",
  "capsules isolated",
  "white powder",
  "raw powder",
  "food sources",
];

const GENERIC_CORE_WORDS = new Set([
  "magnesium",
  "creatine",
  "vitamin",
  "zinc",
  "omega",
  "ashwagandha",
  "berberine",
  "collagen",
  "whey",
  "protein",
  "calcium",
  "iron",
  "probiotics",
  "probiotic",
  "caffeine",
  "electrolyte",
  "electrolytes",
  "multivitamin",
  "d",
  "d3",
  "c",
  "3",
]);

const PRODUCT_FORM_PATTERNS = [
  { form: "tablets", pattern: /\b(?:tablets?|tabs?)\b/i },
  { form: "capsules", pattern: /\bcapsules?\b/i },
  { form: "softgels", pattern: /\bsoftgels?\b/i },
  { form: "gummies", pattern: /\bgummies?\b/i },
  { form: "powder", pattern: /\bpowder\b/i },
  { form: "sachets", pattern: /\bsachets?\b/i },
  { form: "liquid", pattern: /\bliquid\b/i },
  { form: "drops", pattern: /\bdrops?\b/i },
] as const;

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const edgeFunctionDebugFlag = trimString(
  Deno.env.get("EDGE_FUNCTION_DEBUG_LOGS")
).toLowerCase();
const EDGE_VERBOSE_LOGS_ENABLED =
  edgeFunctionDebugFlag === "1" ||
  edgeFunctionDebugFlag === "true" ||
  edgeFunctionDebugFlag === "yes" ||
  edgeFunctionDebugFlag === "on" ||
  !trimString(Deno.env.get("DENO_DEPLOYMENT_ID"));

const adminSupabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
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

function normalizeBarcodeValue(value: unknown): string {
  return trimString(value).replace(/\D/g, "");
}

function normalizeLookupText(value: unknown): string {
  return trimString(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomainText(value: unknown): string {
  return normalizeLookupText(value).replace(/\s+/g, "");
}

function normalizeProductId(value: unknown): string {
  const clean = trimString(value);
  return clean.startsWith(SUPPLEMENT_PRODUCT_PREFIX)
    ? clean.slice(SUPPLEMENT_PRODUCT_PREFIX.length)
    : clean;
}

function logEdgeDiagnostic(
  level: "log" | "warn" | "error",
  message: string,
  details?: unknown
) {
  if (!EDGE_VERBOSE_LOGS_ENABLED && level === "log") {
    return;
  }

  const log =
    level === "warn"
      ? console.warn
      : level === "error"
      ? console.error
      : console.log;

  if (!EDGE_VERBOSE_LOGS_ENABLED || typeof details === "undefined") {
    log(message);
    return;
  }

  log(message, details);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getProductName(product: Record<string, unknown> | null): string {
  return (
    trimString(product?.display_name) ||
    trimString(product?.name) ||
    trimString(product?.product_name) ||
    trimString(product?.productName)
  );
}

function getProductBrand(product: Record<string, unknown> | null): string {
  return (
    trimString(product?.brand_name) ||
    trimString(product?.brand) ||
    trimString(product?.brandName)
  );
}

function stripBrandFromName(name: string, brand: string): string {
  const cleanName = trimString(name);
  const cleanBrand = trimString(brand);
  if (!cleanName || !cleanBrand) return cleanName;

  const normalizedName = normalizeLookupText(cleanName);
  const normalizedBrand = normalizeLookupText(cleanBrand);
  if (!normalizedName.startsWith(normalizedBrand)) return cleanName;

  return cleanName.slice(cleanBrand.length).replace(/^[-:\s]+/, "").trim() || cleanName;
}

function uniqueWords(words: string[]): string[] {
  const seen = new Set<string>();
  const nextWords: string[] = [];

  words.forEach((word) => {
    const normalized = normalizeLookupText(word);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    nextWords.push(word);
  });

  return nextWords;
}

function collapseRepeatedWords(value: string): string {
  const words = trimString(value).split(/\s+/).filter(Boolean);
  const nextWords: string[] = [];

  words.forEach((word) => {
    const previous = nextWords[nextWords.length - 1] ?? "";
    if (normalizeLookupText(previous) === normalizeLookupText(word)) {
      return;
    }

    nextWords.push(word);
  });

  return nextWords.join(" ");
}

function cleanProductDisplayName(name: string, brand = ""): string {
  const cleanBrand = collapseRepeatedWords(brand);
  let cleaned = collapseRepeatedWords(name)
    .replace(/\b(?:supplement\s+)?(?:bottle|pack|product|official)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanBrand) {
    const normalizedBrand = normalizeLookupText(cleanBrand);
    const words = cleaned.split(/\s+/).filter(Boolean);

    if (
      words.length > 1 &&
      normalizeLookupText(words.slice(0, cleanBrand.split(/\s+/).length).join(" ")) ===
        normalizedBrand &&
      normalizeLookupText(words.slice(cleanBrand.split(/\s+/).length).join(" ")).startsWith(normalizedBrand)
    ) {
      cleaned = words.slice(cleanBrand.split(/\s+/).length).join(" ");
    }
  }

  return collapseRepeatedWords(cleaned).replace(/\s+/g, " ").trim();
}

function buildCleanQueryBase(product: Record<string, unknown>): string {
  const brand = getProductBrand(product);
  const displayName =
    trimString(product.naming_display_name) || getProductName(product);
  const productName = stripBrandFromName(displayName, brand);
  const base = cleanProductDisplayName(
    brand ? `${brand} ${productName}` : displayName,
    brand
  );

  if (/\bag1\b/i.test(base) && /\bathletic greens\b/i.test(base)) {
    return "AG1 Athletic Greens";
  }

  return base;
}

function productNameKeywords(name: string): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "with",
    "plus",
    "supplement",
    "capsules",
    "capsule",
    "tablets",
    "tablet",
    "powder",
    "bottle",
    "vegan",
  ]);

  return uniqueWords(
    normalizeLookupText(name)
      .split(" ")
      .filter((word) => word.length >= 3 && !stopWords.has(word))
  ).slice(0, 6);
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    const clean = trimString(value);
    if (clean) output.push(clean);
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }

  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectStrings(item, output)
    );
  }

  return output;
}

function variantClues(product: Record<string, unknown>): string[] {
  const rawText = [
    trimString(product.serving_size_text),
    trimString(product.flavour),
    trimString(product.flavor),
    trimString(product.form_factor),
    trimString(product.product_type),
    ...collectStrings(product.active_ingredients_json),
  ].join(" ");
  const clues: string[] = [];
  const patterns = [
    /\b\d+\s*(?:sachets?|capsules?|tablets?|tabs?|gummies?|servings?|sticks?|shots?|bottles?)\b/gi,
    /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|g|ml|iu)\b/gi,
    /\b(?:marine\s+)?(?:liquid\s+)?collagen\b/gi,
    /\b(?:mango|mandarin|orange|berry|strawberry|vanilla|chocolate|lemon|lime|peach|unflavou?red)\b(?:\s+\b(?:mango|mandarin|orange|berry|strawberry|vanilla|chocolate|lemon|lime|peach)\b)?/gi,
    /\b(?:sachets?|capsules?|tablets?|tabs?|gummies?|powder|liquid|drink|shot|sticks?)\b/gi,
  ];

  patterns.forEach((pattern) => {
    const matches = rawText.match(pattern) ?? [];
    matches.forEach((match) => {
      const clean = match.replace(/\s+/g, " ").trim();
      if (clean) clues.push(clean);
    });
  });

  return uniqueWords(clues).slice(0, 8);
}

function expectedProductForm(product: Record<string, unknown>): string | null {
  const servingSizeText = trimString(product.serving_size_text);
  if (!servingSizeText) return null;

  const match = PRODUCT_FORM_PATTERNS.find(({ pattern }) =>
    pattern.test(servingSizeText)
  );

  return match?.form ?? null;
}

function isGenericActiveIngredient(product: Record<string, unknown>): boolean {
  const name = getProductName(product);
  const brand = getProductBrand(product);
  const barcode = trimString(product.barcode);
  const catalogType = trimString(product.catalogType ?? product.catalog_type);
  const normalizedName = normalizeLookupText(name);
  const hasProductSignal = Boolean(brand || barcode);

  if (catalogType === "active_ingredient") return true;
  if (catalogType === "supplement_product" && hasProductSignal) return false;
  if (!normalizedName) return true;
  if (hasProductSignal) return false;

  if (GENERIC_INGREDIENT_NAMES.has(normalizedName)) return true;
  if (GENERIC_PATTERNS.some((pattern) => pattern.test(name))) return true;

  const words = normalizedName.split(" ").filter(Boolean);
  if (
    catalogType === "supplement_product" &&
    words.length >= 2 &&
    words.some((word) => !GENERIC_CORE_WORDS.has(word))
  ) {
    return false;
  }

  if (words.length <= 3 && /\b(?:vitamin|magnesium|creatine|zinc|omega|collagen|probiotic|protein|electrolyte|calcium|iron|berberine|ashwagandha)\b/.test(normalizedName)) {
    return true;
  }

  return false;
}

function isRealSupplementProduct(product: Record<string, unknown>): boolean {
  const productId = normalizeProductId(product.product_id ?? product.id);
  const catalogType = trimString(product.catalogType ?? product.catalog_type);
  const name = getProductName(product);

  return Boolean(
    productId &&
      name &&
      (catalogType === "supplement_product" ||
        trimString(product.barcode) ||
        getProductBrand(product) ||
        product.product_id)
  );
}

async function fetchProduct(productId: string) {
  const { data, error } = await adminSupabase!
    .from(TABLES.supplementProducts)
    .select(
      "product_id, barcode, display_name, active_ingredients_json, serving_size_text, image_url, image_thumbnail_url, image_source_url, image_provider, image_query, image_confidence, image_status, image_error, image_manual_override, image_last_checked_at"
    )
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase:${TABLES.supplementProducts}] ${error.message}`);
  }

  if (!data?.product_id) {
    return null;
  }

  const { data: naming, error: namingError } = await adminSupabase!
    .from(TABLES.naming)
    .select("brand_name, display_name, product_type, form_factor, flavor")
    .eq("product_id", productId)
    .maybeSingle();

  if (namingError) {
    logEdgeDiagnostic("warn", "[enrich-product-image] naming lookup failed", {
      productId,
      message: namingError.message,
    });
  }

  const masterBarcode = trimString(data?.barcode) || null;
  let sourceProductBarcode: string | null = null;

  if (!masterBarcode) {
    const { data: sourceProduct, error: sourceProductError } =
      await adminSupabase!
        .from(TABLES.products)
        .select("barcode")
        .eq("id", productId)
        .maybeSingle();

    if (sourceProductError) {
      logEdgeDiagnostic(
        "warn",
        "[enrich-product-image] source product barcode lookup failed",
        {
          productId,
          message: sourceProductError.message,
        }
      );
    } else {
      sourceProductBarcode = trimString(sourceProduct?.barcode) || null;
    }
  }

  return {
    ...data,
    id: String(data.product_id),
    catalogType: "supplement_product",
    barcode: masterBarcode || sourceProductBarcode,
    brand_name: trimString(naming?.brand_name) || null,
    naming_display_name: trimString(naming?.display_name) || null,
    product_type: trimString(naming?.product_type) || null,
    form_factor: trimString(naming?.form_factor) || null,
    flavor: trimString(naming?.flavor) || null,
  };
}

function buildSearchQueries(product: Record<string, unknown>): string[] {
  const barcode = normalizeBarcodeValue(product.barcode);
  const queryBase = buildCleanQueryBase(product);
  const clueText = variantClues(product).slice(0, 4).join(" ");
  const queries = [];

  if (barcode) {
    queries.push(`${queryBase} ${barcode}`);
    queries.push(`${queryBase} ${barcode} product`);
  }

  if (clueText) {
    queries.push(`${queryBase} ${clueText}`);
  }

  queries.push(
    `${queryBase} official`,
    `${queryBase} product`,
    `${queryBase} supplement bottle`
  );

  return uniqueWords(queries)
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function buildFallbackVariantQuery(product: Record<string, unknown>): string {
  const barcode = normalizeBarcodeValue(product.barcode);
  const queryBase = buildCleanQueryBase(product);
  const clueText = variantClues(product).slice(0, 4).join(" ");

  const query = clueText
    ? `${queryBase} ${clueText}`
    : barcode
    ? `${queryBase} ${barcode}`
    : `${queryBase} supplement`;

  return query.replace(/\s+/g, " ").trim();
}

function buildPrimaryOfficialQuery(product: Record<string, unknown>): string {
  const form = expectedProductForm(product);

  return `${buildCleanQueryBase(product)} ${form ?? ""} official product`
    .replace(/\s+/g, " ")
    .trim();
}

function buildDeepSearchBottleQuery(product: Record<string, unknown>): string {
  return `${buildCleanQueryBase(product)} supplement bottle`
    .replace(/\s+/g, " ")
    .trim();
}

function buildQueryPlan(
  product: Record<string, unknown>,
  deepSearch: boolean
): Array<{ query: string; queryStrategy: string }> {
  const plan = [
    {
      query: buildPrimaryOfficialQuery(product),
      queryStrategy: "primary_official_product",
    },
    {
      query: buildFallbackVariantQuery(product),
      queryStrategy: "variant_or_barcode_fallback",
    },
  ];

  if (deepSearch) {
    plan.push({
      query: buildDeepSearchBottleQuery(product),
      queryStrategy: "deep_search_supplement_bottle",
    });
  }

  return plan.filter(
    (entry, index, all) =>
      entry.query &&
      all.findIndex((candidate) => candidate.query === entry.query) === index
  );
}

function textIncludesAny(text: string, terms: string[]) {
  const normalized = normalizeLookupText(text);
  return terms.some((term) => normalized.includes(normalizeLookupText(term)));
}

function sourceText(result: Record<string, unknown>): string {
  return [
    trimString(result.title),
    trimString(result.source),
    trimString(result.link),
    trimString(result.original),
  ].join(" ");
}

function getHostname(value: unknown): string {
  const raw = trimString(value);
  if (!raw) return "";

  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function getResultDomain(result: Record<string, unknown>): string {
  return (
    getHostname(result.link) ||
    getHostname(result.original) ||
    trimString(result.source).toLowerCase().replace(/^www\./, "")
  );
}

function brandDomainTokens(product: Record<string, unknown>): string[] {
  const brand = getProductBrand(product);
  const productName = getProductName(product);
  const display = cleanProductDisplayName(productName, brand);
  const candidates = uniqueWords([
    brand,
    display,
    ...productNameKeywords(display),
  ]).map(normalizeDomainText);

  return candidates.filter((candidate) => candidate.length >= 6);
}

function isOfficialBrandDomain(
  result: Record<string, unknown>,
  product: Record<string, unknown>
): boolean {
  const domain = normalizeDomainText(getResultDomain(result));
  if (!domain) return false;

  return brandDomainTokens(product).some((token) => domain.includes(token));
}

function sourceTier(
  result: Record<string, unknown>,
  product: Record<string, unknown>
) {
  const combined = sourceText(result);
  if (isOfficialBrandDomain(result, product)) return 0;
  if (TRUSTED_SOURCE_PATTERNS.some((pattern) => pattern.test(combined))) return 1;
  if (MARKETPLACE_SOURCE_PATTERNS.some((pattern) => pattern.test(combined))) return 2;
  if (BAD_SOURCE_PATTERNS.some((pattern) => pattern.test(combined))) return 3;
  return 4;
}

function getSerpApiImageResults(body: Record<string, unknown>): unknown[] {
  if (Array.isArray(body.image_results)) {
    return body.image_results;
  }

  if (Array.isArray(body.images_results)) {
    return body.images_results;
  }

  return [];
}

function countMatchedKeyProductWords(
  text: string,
  product: Record<string, unknown>
): number {
  const productName = getProductName(product);
  const brand = getProductBrand(product);
  const keywords = productNameKeywords(stripBrandFromName(productName, brand));
  const normalizedText = normalizeLookupText(text);

  return keywords.filter((word) => normalizedText.includes(word)).length;
}

function hasAtLeastTwoKeyProductWords(
  result: Record<string, unknown>,
  product: Record<string, unknown>
): boolean {
  return countMatchedKeyProductWords(sourceText(result), product) >= 2;
}

function countMatchedVariantClues(
  text: string,
  product: Record<string, unknown>
): number {
  const normalizedText = normalizeLookupText(text);

  return variantClues(product).filter((clue) =>
    normalizedText.includes(normalizeLookupText(clue))
  ).length;
}

function getDimension(result: Record<string, unknown>, key: string): number | null {
  const direct = Number(result[key]);
  if (Number.isFinite(direct)) return direct;

  const original = result.original_width && key === "original_width"
    ? Number(result.original_width)
    : result.original_height && key === "original_height"
    ? Number(result.original_height)
    : null;
  return Number.isFinite(original) ? original : null;
}

function hasPlaceholderImageSignal(result: Record<string, unknown>): boolean {
  const original = trimString(result.original);
  const thumbnail = trimString(result.thumbnail);
  const title = trimString(result.title);
  const combined = normalizeLookupText([original, thumbnail, title].join(" "));
  const width = getDimension(result, "original_width");
  const height = getDimension(result, "original_height");

  if (!original && !thumbnail) return true;
  if (/^data:/i.test(original) || /^data:/i.test(thumbnail)) return true;
  if (/\.svg(?:$|[?#])/i.test(original) || /\.svg(?:$|[?#])/i.test(thumbnail)) {
    return true;
  }
  if (
    /\b(?:placeholder|transparent|blank|fallback|default|missing|no[\s_-]?image|spacer|pixel)\b/i.test(
      combined
    )
  ) {
    return true;
  }
  if (
    (Number.isFinite(width) && width! < 120) ||
    (Number.isFinite(height) && height! < 120)
  ) {
    return true;
  }

  return false;
}

function matchedProductForms(text: string): string[] {
  return PRODUCT_FORM_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ form }) => form
  );
}

function scoreImageResult(
  result: Record<string, unknown>,
  product: Record<string, unknown>,
  query: string
) {
  let score = 0;
  const title = trimString(result.title);
  const original = trimString(result.original);
  const thumbnail = trimString(result.thumbnail);
  const combined = sourceText(result);
  const productName = getProductName(product);
  const brand = getProductBrand(product);
  const keywords = productNameKeywords(stripBrandFromName(productName, brand));
  const normalizedTitle = normalizeLookupText(title);
  const normalizedCombined = normalizeLookupText(combined);
  const width = getDimension(result, "original_width");
  const height = getDimension(result, "original_height");
  const hasPlaceholderSignal = hasPlaceholderImageSignal(result);
  const expectedForm = expectedProductForm(product);
  const formsInCandidate = matchedProductForms(combined);
  const formMatch = Boolean(expectedForm && formsInCandidate.includes(expectedForm));
  const formMismatch = Boolean(
    expectedForm &&
      formsInCandidate.some((form) => form !== expectedForm)
  );

  const normalizedProductName = normalizeLookupText(cleanProductDisplayName(productName, brand));
  const barcode = normalizeBarcodeValue(product.barcode);
  const matchedTitleKeywords = keywords.filter((word) =>
    normalizedTitle.includes(word)
  );
  const matchedCombinedKeywords = keywords.filter((word) =>
    normalizedCombined.includes(word)
  );

  if (normalizedProductName && normalizedTitle.includes(normalizedProductName)) {
    score += 40;
  } else if (matchedTitleKeywords.length >= 2) {
    score += 32;
  } else if (matchedTitleKeywords.length === 1) {
    score += 18;
  } else if (matchedCombinedKeywords.length >= 2) {
    score += 24;
  }

  if (brand && normalizedCombined.includes(normalizeLookupText(brand))) {
    score += 30;
  }

  if (normalizedCombined.includes("absolute collagen")) {
    score += 30;
  }

  const hasBarcodeMatch =
    Boolean(barcode) && normalizeBarcodeValue(combined).includes(barcode);
  const matchedVariantClueCount = countMatchedVariantClues(combined, product);

  if (hasBarcodeMatch) {
    score += 50;
  }

  if (matchedVariantClueCount > 0) {
    score += Math.min(matchedVariantClueCount, 2) * 12;
  }

  if (formMatch) {
    score += 18;
  }

  if (formMismatch) {
    score -= 55;
  }

  if (matchedTitleKeywords.length >= 2) {
    score += 20;
  }

  if (isOfficialBrandDomain(result, product)) {
    score += 40;
  }

  if (TRUSTED_SOURCE_PATTERNS.some((pattern) => pattern.test(combined))) {
    score += 20;
  }

  if (MARKETPLACE_SOURCE_PATTERNS.some((pattern) => pattern.test(combined))) {
    score -= 20;
  }

  if (Number.isFinite(width) && Number.isFinite(height) && width! >= 500 && height! >= 500) {
    score += 10;
  }

  if (textIncludesAny(combined, UNRELATED_TERMS)) {
    score -= 30;
  }

  if (!original) {
    score -= 40;
  }

  if (
    (Number.isFinite(width) && width! < 300) ||
    (Number.isFinite(height) && height! < 300)
  ) {
    score -= 40;
  }

  if (hasPlaceholderSignal) {
    score -= 120;
  }

  if (BAD_SOURCE_PATTERNS.some((pattern) => pattern.test(combined))) {
    score -= 60;
  }

  const looksBrandedProduct =
    Boolean(brand && normalizedCombined.includes(normalizeLookupText(brand))) ||
    normalizedCombined.includes("absolute collagen") ||
    /\b(?:bottle|jar|pack|capsules|tablets|gummies|sachets|product)\b/i.test(combined);
  const looksGenericIngredient =
    textIncludesAny(combined, GENERIC_IMAGE_TERMS) ||
    (!looksBrandedProduct && keywords.length <= 2);
  if (looksGenericIngredient) {
    score -= 80;
  }

  return {
    result,
    score,
    sourceTier: sourceTier(result, product),
    officialDomain: isOfficialBrandDomain(result, product),
    barcodeMatch: hasBarcodeMatch,
    variantClueMatches: matchedVariantClueCount,
    expectedProductForm: expectedForm,
    formMatch,
    formMismatch,
    placeholderLike: hasPlaceholderSignal,
    query,
    imageUrl: original || thumbnail,
    originalUrl: original || null,
    thumbnailUrl: thumbnail || null,
    sourceUrl: trimString(result.link) || null,
  };
}

function selectionReason(selected: ReturnType<typeof scoreImageResult>) {
  if (selected.barcodeMatch) return "barcode_match_preferred";
  if (selected.sourceTier === 0) return "official_domain_preferred";
  if (selected.variantClueMatches > 0) return "variant_clues_preferred";
  if (selected.sourceTier === 1) return "retailer_preferred";
  if (selected.sourceTier === 2) return "marketplace_selected";
  if (selected.sourceTier === 3) return "low_quality_source_selected";
  return "highest_score_selected";
}

function isClearlyDifferentProduct(
  scored: ReturnType<typeof scoreImageResult>,
  product: Record<string, unknown>
) {
  if (scored.barcodeMatch) return false;
  if (scored.placeholderLike) return true;

  const combined = sourceText(scored.result);
  const matchedKeyWords = countMatchedKeyProductWords(combined, product);
  const normalizedCombined = normalizeLookupText(combined);
  const normalizedProductName = normalizeLookupText(
    cleanProductDisplayName(getProductName(product), getProductBrand(product))
  );

  if (normalizedProductName && normalizedCombined.includes(normalizedProductName)) {
    return false;
  }

  return matchedKeyWords === 0 && scored.variantClueMatches === 0;
}

function compareScoredResults(
  left: ReturnType<typeof scoreImageResult>,
  right: ReturnType<typeof scoreImageResult>,
  product: Record<string, unknown>
) {
  if (left.barcodeMatch !== right.barcodeMatch) {
    return left.barcodeMatch ? -1 : 1;
  }

  if (left.placeholderLike !== right.placeholderLike) {
    return left.placeholderLike ? 1 : -1;
  }

  if (left.officialDomain !== right.officialDomain) {
    const leftOfficialUsable = left.officialDomain && !isClearlyDifferentProduct(left, product);
    const rightOfficialUsable =
      right.officialDomain && !isClearlyDifferentProduct(right, product);

    if (leftOfficialUsable !== rightOfficialUsable) {
      return leftOfficialUsable ? -1 : 1;
    }
  }

  if (left.variantClueMatches !== right.variantClueMatches) {
    const variantDelta = right.variantClueMatches - left.variantClueMatches;
    if (Math.abs(variantDelta) >= 2) {
      return variantDelta;
    }
  }

  const scoreDelta = right.score - left.score;
  if (Math.abs(scoreDelta) <= 40 && left.sourceTier !== right.sourceTier) {
    return left.sourceTier - right.sourceTier;
  }

  if (scoreDelta !== 0) return scoreDelta;
  return left.sourceTier - right.sourceTier;
}

function isAcceptableImageMatch(
  scored: ReturnType<typeof scoreImageResult> | null,
  product: Record<string, unknown>
) {
  if (!scored?.imageUrl || scored.placeholderLike) return false;
  if (scored.score >= 35) return true;

  return scored.score >= 25 && hasAtLeastTwoKeyProductWords(scored.result, product);
}

function shouldEarlyStop(
  scored: ReturnType<typeof scoreImageResult> | null,
  product: Record<string, unknown>
) {
  if (!isAcceptableImageMatch(scored, product) || !scored) return false;
  if (!scored.officialDomain && !scored.barcodeMatch) return false;
  if (scored.formMismatch) return false;
  if (scored.sourceTier > 1) return false;
  return scored.score >= 55;
}

async function updateProductImage(
  productId: string,
  patch: Record<string, unknown>
) {
  const { error } = await adminSupabase!
    .from(TABLES.supplementProducts)
    .update(patch)
    .eq("product_id", productId)
    .or("image_manual_override.is.false,image_manual_override.is.null");

  if (error) {
    throw new Error(`[supabase:${TABLES.supplementProducts}] ${error.message}`);
  }
}

async function markSkipped(productId: string, reason: string) {
  await updateProductImage(productId, {
    image_status: "skipped",
    image_error: reason,
    image_last_checked_at: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    if (!adminSupabase) {
      return jsonResponse(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret." },
        500
      );
    }

    const authHeader = req.headers.get("Authorization");
    const authenticatedUser = await authenticateSupabaseUser({
      adminSupabase,
      authHeader,
    });
    if (!authenticatedUser.ok) {
      return jsonResponse(authenticatedUser.body, authenticatedUser.status);
    }

    const entitlementAccess = await assertActiveRevenueCatEntitlement({
      userId: authenticatedUser.user.id,
    });
    if (!entitlementAccess.ok) {
      return jsonResponse(entitlementAccess.body, entitlementAccess.status);
    }

    const isTrustedRequest = isTrustedEdgeFunctionRequest({
      authorizationHeader: authHeader ?? "",
      apiKeyHeader: req.headers.get("apikey") ?? "",
      serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      internalServiceRoleKey: Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") ?? "",
    });
    const validatedRequest = validateEnrichProductImageRequest(await req.text(), {
      isTrusted: isTrustedRequest,
    });
    if (!validatedRequest.ok) {
      return jsonResponse(validatedRequest.body, validatedRequest.status);
    }

    const { force, deepSearch, productId, requestProduct } =
      validatedRequest.value;
    const product = productId ? await fetchProduct(productId) : requestProduct;
    const effectiveProductId = normalizeProductId(
      product?.product_id ?? product?.id ?? productId
    );

    if (!product || !effectiveProductId) {
      return jsonResponse(
        buildEnrichProductImageResponse({
          status: "skipped",
          productId: effectiveProductId || null,
          reason: "Product missing",
        })
      );
    }

    if (product.image_manual_override === true && trimString(product.image_url)) {
      logEdgeDiagnostic("log", "[enrich-product-image] cached manual image used", {
        productId: effectiveProductId,
      });
      return jsonResponse(
        buildEnrichProductImageResponse({
          status: "cached",
          productId: effectiveProductId,
          imageUrl: trimString(product.image_url) || null,
          thumbnailUrl: trimString(product.image_thumbnail_url) || null,
          sourceUrl: trimString(product.image_source_url) || null,
          confidence: Number(product.image_confidence) || null,
          query: trimString(product.image_query) || null,
          reason: "Manual image override",
        })
      );
    }

    if (trimString(product.image_url) && !force) {
      logEdgeDiagnostic("log", "[enrich-product-image] cached image used", {
        productId: effectiveProductId,
      });
      return jsonResponse(
        buildEnrichProductImageResponse({
          status: "cached",
          productId: effectiveProductId,
          imageUrl: trimString(product.image_url),
          thumbnailUrl: trimString(product.image_thumbnail_url) || null,
          sourceUrl: trimString(product.image_source_url) || null,
          confidence: Number(product.image_confidence) || null,
          query: trimString(product.image_query) || null,
          reason: "Cached image used",
        })
      );
    }

    if (trimString(product.image_url) && force) {
      logEdgeDiagnostic("log", "[enrich-product-image] force refresh requested", {
        productId: effectiveProductId,
      });
    }

    if (!isRealSupplementProduct(product)) {
      await markSkipped(effectiveProductId, "Not a supplement product");
      return jsonResponse(
        buildEnrichProductImageResponse({
          status: "skipped",
          productId: effectiveProductId,
          reason: "Not a supplement product",
        })
      );
    }

    if (!getProductName(product)) {
      await markSkipped(effectiveProductId, "Product name missing");
      return jsonResponse(
        buildEnrichProductImageResponse({
          status: "skipped",
          productId: effectiveProductId,
          reason: "Product name missing",
        })
      );
    }

    if (isGenericActiveIngredient(product)) {
      logEdgeDiagnostic("log", "[enrich-product-image] skipped generic ingredient", {
        productId: effectiveProductId,
        name: getProductName(product),
      });
      await markSkipped(effectiveProductId, "Generic active ingredient");
      return jsonResponse(
        buildEnrichProductImageResponse({
          status: "skipped",
          productId: effectiveProductId,
          reason: "Generic active ingredient",
        })
      );
    }

    const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
    if (!serpApiKey) {
      await updateProductImage(effectiveProductId, {
        image_status: "failed",
        image_error: "Missing SERPAPI_API_KEY secret",
        image_last_checked_at: new Date().toISOString(),
      });
      return jsonResponse(
        buildEnrichProductImageResponse({
          status: "failed",
          productId: effectiveProductId,
          reason: "Missing SERPAPI_API_KEY secret",
        }),
        500
      );
    }
    const quotaAccess = await enforceEdgeFunctionQuota({
      adminSupabase,
      policyKey: "enrich-product-image",
      userId: authenticatedUser.user.id,
    });
    if (!quotaAccess.ok) {
      return jsonResponse(
        quotaAccess.body,
        quotaAccess.status,
        quotaAccess.headers
      );
    }

    const queryPlan = buildQueryPlan(product, deepSearch);
    const scoredResults: ReturnType<typeof scoreImageResult>[] = [];
    let lastSerpApiError = "";
    let serpApiCallCount = 0;
    let earlyStop = false;
    let selectedResult: ReturnType<typeof scoreImageResult> | null = null;

    for (let index = 0; index < queryPlan.length; index += 1) {
      const { query, queryStrategy } = queryPlan[index];
      const params = new URLSearchParams({
        engine: "google_images",
        q: query,
        api_key: serpApiKey,
        tbs: "itp:photos,isz:l",
      });

      serpApiCallCount += 1;
      const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);
      const responseBody = await response.json().catch(() => ({}));
      const responseObject =
        responseBody && typeof responseBody === "object"
          ? (responseBody as Record<string, unknown>)
          : {};
      const queryResults = getSerpApiImageResults(responseObject);
      const scoredForQuery: ReturnType<typeof scoreImageResult>[] = [];

      if (!response.ok) {
        lastSerpApiError =
          trimString(responseObject.error) ||
          trimString(responseObject.error_message) ||
          `SerpApi request failed with status ${response.status}`;
        continue;
      }

      const results = queryResults.slice(0, 10);
      for (const result of results) {
        if (!result || typeof result !== "object") {
          continue;
        }

        const scored = scoreImageResult(
          result as Record<string, unknown>,
          product,
          query
        );
        scoredForQuery.push(scored);
        scoredResults.push(scored);
      }

      const bestForQuery =
        scoredForQuery.length > 0
          ? [...scoredForQuery].sort((left, right) =>
              compareScoredResults(left, right, product)
            )[0]
          : null;

      logEdgeDiagnostic("log", "[enrich-product-image] firstResults", {
        productId: effectiveProductId,
        query,
        queryStrategy,
        expectedProductForm: expectedProductForm(product),
        firstResults: scoredForQuery.slice(0, 3).map((entry) => ({
          title: trimString(entry.result.title) || null,
          source: trimString(entry.result.source) || null,
          link: trimString(entry.result.link) || null,
          score: entry.score,
          officialDomain: entry.officialDomain,
          formMatch: entry.formMatch,
          formMismatch: entry.formMismatch,
        })),
      });

      if (shouldEarlyStop(bestForQuery, product)) {
        selectedResult = bestForQuery;
        earlyStop = true;
        break;
      }
    }

    const scored = scoredResults.sort((left, right) =>
      compareScoredResults(left, right, product)
    );
    const best = selectedResult ?? scored[0] ?? null;

    if (!isAcceptableImageMatch(best, product)) {
      const failureReason = scoredResults.length
        ? "No confident image match"
        : lastSerpApiError || "No confident image match";
      logEdgeDiagnostic("log", "[enrich-product-image] failed no confident match", {
        productId: effectiveProductId,
        score: best?.score ?? null,
        deepSearch,
        serpApiCallCount,
        earlyStop,
      });
      await updateProductImage(effectiveProductId, {
        image_status: "failed",
        image_error: failureReason,
        image_query: queryPlan.map((entry) => entry.query).join(" | "),
        image_confidence: best?.score ?? null,
        image_last_checked_at: new Date().toISOString(),
      });
      return jsonResponse(
        buildEnrichProductImageResponse({
          status: "failed",
          productId: effectiveProductId,
          confidence: best?.score ?? null,
          query: queryPlan.map((entry) => entry.query).join(" | "),
          reason: failureReason,
        })
      );
    }

    logEdgeDiagnostic("log", "[enrich-product-image] found image with score", {
      productId: effectiveProductId,
      score: best.score,
      deepSearch,
      serpApiCallCount,
      earlyStop,
    });
    logEdgeDiagnostic("log", "[enrich-product-image] selected image", {
      productId: effectiveProductId,
      expectedProductForm: best.expectedProductForm,
      selectedTitle: trimString(best.result.title) || null,
      selectedSource: trimString(best.result.source) || null,
      selectedLink: trimString(best.result.link) || null,
      selectedImageUrl: best.imageUrl,
      selectedOriginalUrl: best.originalUrl,
      selectedThumbnailUrl: best.thumbnailUrl,
      finalScore: best.score,
      selectedQuery: best.query,
      selectionReason: selectionReason(best),
      officialDomain: best.officialDomain,
      barcodeMatch: best.barcodeMatch,
      formMatch: best.formMatch,
      formMismatch: best.formMismatch,
      placeholderLike: best.placeholderLike,
      deepSearch,
      serpApiCallCount,
      earlyStop,
    });

    await updateProductImage(effectiveProductId, {
      image_url: best.imageUrl,
      image_thumbnail_url: best.thumbnailUrl,
      image_source_url: best.sourceUrl,
      image_provider: IMAGE_PROVIDER,
      image_query: best.query,
      image_confidence: best.score,
      image_status: "found",
      image_error: null,
      image_last_checked_at: new Date().toISOString(),
    });

    return jsonResponse(
      buildEnrichProductImageResponse({
        status: "found",
        productId: effectiveProductId,
        imageUrl: best.imageUrl,
        thumbnailUrl: best.thumbnailUrl,
        sourceUrl: best.sourceUrl,
        confidence: best.score,
        query: best.query,
        reason: "Image found",
      })
    );
  } catch (error) {
    logEdgeDiagnostic("error", "[enrich-product-image] unexpected failure", {
      message: getErrorMessage(error),
    });
    return jsonResponse(
      {
        ok: false,
        status: "failed",
        error: "Unexpected enrich-product-image failure.",
        code: "unexpected_failure",
      },
      500
    );
  }
});
