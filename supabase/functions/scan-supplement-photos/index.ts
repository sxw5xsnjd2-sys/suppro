import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertActiveRevenueCatEntitlement,
  authenticateSupabaseUser,
} from "../_shared/revenuecat.ts";
import { enforceEdgeFunctionQuota } from "../_shared/quota.ts";
import { validateScanSupplementPhotosRequest } from "../_shared/scan-supplement-photos-policy.js";

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
  classification: "off_products_ai_classification",
  extraction: "off_products_ai_extraction",
  naming: "off_products_ai_naming",
  supplementMaster: "supplement_products_master",
  supplements: "supplements",
  aliases: "supplement_aliases",
  activeIngredients: "product_active_ingredients",
  missingSupplements: "supplement_missing_catalog_candidates",
  missingOccurrences: "supplement_missing_catalog_occurrences",
  reviewQueue: "supplement_review_queue",
};

const REVIEW_TYPES = {
  aliasUnresolved: "alias_unresolved",
  dosageMalformed: "dosage_malformed",
  doseUnverified: "dose_unverified",
};

const RETAIL_BARCODE_TYPES = new Set(["ean13", "ean8", "upc_a", "upc_e"]);
const ALPHANUMERIC_BARCODE_TYPES = new Set(["code128", "code39", "code93"]);
const ALLOWED_UNITS = new Set(["mcg", "mg", "g", "ml", "IU", "CFU"]);
const CLASSIFICATION_PROMPT_VERSION = "photo_rescue_classify_v1";
const EXTRACTION_PROMPT_VERSION = "photo_rescue_extract_v1";
const NAMING_PROMPT_VERSION = "photo_rescue_naming_v1";
const REVIEW_PROCESSOR_FUNCTION = "process-photo-rescue-reviews";

const CATEGORY_VALUES = [
  "vitamin_mineral",
  "herbal_botanical",
  "sports_nutrition",
  "protein",
  "electrolyte",
  "probiotic",
  "omega_fatty_acid",
  "other_supplement",
  "not_supplement",
] as const;

const AMOUNT_BASIS_VALUES = [
  "per_serving",
  "per_capsule",
  "per_tablet",
  "per_softgel",
  "per_scoop",
  "per_100g",
  "unknown",
] as const;

const photoRescueResponseSchema = {
  name: "photo_rescue_ingestion",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      is_supplement: { type: "boolean" },
      classification_confidence: { type: "number" },
      category: {
        type: "string",
        enum: [...CATEGORY_VALUES],
      },
      should_extract: { type: "boolean" },
      classification_reason: { type: "string" },
      front_label_name: {
        type: "string",
        description:
          "The best visible product name from the front label. Empty string if unclear.",
      },
      ingredient_panel_text: {
        type: "string",
        description:
          "OCR-like excerpt of the useful supplement facts or ingredient panel text.",
      },
      display_name: {
        type: "string",
        description:
          "Concise user-facing display name for the supplement product.",
      },
      product_name: {
        type: ["string", "null"],
        description:
          "The product name without the brand, taken from the front label when visible.",
      },
      full_product_name: {
        type: ["string", "null"],
        description:
          "Brand plus product name when both are visible on the front label.",
      },
      brand_name: { type: ["string", "null"] },
      product_type: { type: ["string", "null"] },
      form_factor: { type: ["string", "null"] },
      flavor: { type: ["string", "null"] },
      naming_confidence: { type: "number" },
      naming_notes: { type: ["string", "null"] },
      serving_size_text: { type: ["string", "null"] },
      extraction_notes: { type: ["string", "null"] },
      raw_text: {
        type: "string",
        description:
          "Compact OCR-like excerpt of the useful text you relied on across both images.",
      },
      ingredients_found: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            raw_name: { type: "string" },
            canonical_name: { type: "string" },
            ingredient_type: {
              type: "string",
              enum: ["active", "inactive", "uncertain"],
            },
            dosage_value: { type: ["number", "null"] },
            dosage_unit: { type: ["string", "null"] },
            dosage_original_text: { type: ["string", "null"] },
            chemical_form: { type: ["string", "null"] },
            amount_basis: {
              type: ["string", "null"],
              enum: [...AMOUNT_BASIS_VALUES, null],
            },
          },
          required: [
            "raw_name",
            "canonical_name",
            "ingredient_type",
            "dosage_value",
            "dosage_unit",
            "dosage_original_text",
            "chemical_form",
            "amount_basis",
          ],
        },
      },
    },
    required: [
      "is_supplement",
      "classification_confidence",
      "category",
      "should_extract",
      "classification_reason",
      "front_label_name",
      "ingredient_panel_text",
      "display_name",
      "product_name",
      "full_product_name",
      "brand_name",
      "product_type",
      "form_factor",
      "flavor",
      "naming_confidence",
      "naming_notes",
      "serving_size_text",
      "extraction_notes",
      "raw_text",
      "ingredients_found",
    ],
  },
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const openAiModel =
  Deno.env.get("OPENAI_VISION_MODEL") ??
  Deno.env.get("OPENAI_MODEL") ??
  "gpt-4o-mini";

const adminSupabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

type CurrentProductContext = {
  productId: string;
  productName: string;
  ingredientsText: string;
  sourceIngredients: string[];
  sourceStatusVerbose: string;
} | null;

type NormalizedIngredient = {
  raw_name: string;
  canonical_name: string;
  ingredient_type: "active" | "inactive" | "uncertain";
  dosage_value: number | null;
  dosage_unit: string | null;
  dosage_original_text: string | null;
  chemical_form: string | null;
  amount_basis: string | null;
};

type NormalizedPhotoRescueResult = {
  classification: {
    is_supplement: boolean;
    confidence: number;
    category: (typeof CATEGORY_VALUES)[number];
    should_extract: boolean;
    reason: string;
  };
  naming: {
    display_name: string;
    product_name: string | null;
    full_product_name: string | null;
    brand_name: string | null;
    product_type: string | null;
    form_factor: string | null;
    flavor: string | null;
    confidence: number;
    notes: string | null;
  };
  extraction: {
    serving_size_text: string | null;
    notes: string | null;
    ingredients_found: NormalizedIngredient[];
  };
  productText: {
    front_label_name: string;
    ingredient_panel_text: string;
    raw_text: string;
  };
};

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

function buildOpenAiHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const projectId = Deno.env.get("OPENAI_PROJECT_ID");
  const organizationId = Deno.env.get("OPENAI_ORGANIZATION_ID");

  if (projectId) {
    headers["OpenAI-Project"] = projectId;
  }

  if (organizationId) {
    headers["OpenAI-Organization"] = organizationId;
  }

  return headers;
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value: unknown): string {
  return trimString(value).replace(/\s+/g, " ").trim();
}

function normalizeTextKey(value: unknown): string {
  return normalizeWhitespace(value).toLowerCase();
}

function canonicalizeBarcodeType(value: unknown): string {
  const rawType = trimString(value);
  if (!rawType) {
    return "";
  }

  const lowered = rawType.toLowerCase();

  if (lowered.includes("ean13") || lowered.includes("ean-13")) {
    return "ean13";
  }

  if (lowered.includes("ean8") || lowered.includes("ean-8")) {
    return "ean8";
  }

  if (
    lowered.includes("upca") ||
    lowered.includes("upc-a") ||
    lowered.includes("upc_a")
  ) {
    return "upc_a";
  }

  if (
    lowered.includes("upce") ||
    lowered.includes("upc-e") ||
    lowered.includes("upc_e")
  ) {
    return "upc_e";
  }

  if (
    lowered.includes("code128") ||
    lowered.includes("code-128") ||
    lowered.includes("code_128")
  ) {
    return "code128";
  }

  if (
    lowered.includes("code39") ||
    lowered.includes("code-39") ||
    lowered.includes("code_39")
  ) {
    return "code39";
  }

  if (
    lowered.includes("code93") ||
    lowered.includes("code-93") ||
    lowered.includes("code_93")
  ) {
    return "code93";
  }

  return lowered;
}

function normalizeBarcode(value: unknown, barcodeType?: unknown): string {
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

function parseIntegerLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function clampConfidence(value: unknown): number {
  const nextValue =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? ""));

  if (!Number.isFinite(nextValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(nextValue)));
}

function roundTo(value: number, places: number) {
  const factor = 10 ** Math.max(0, places);
  return Math.round(value * factor) / factor;
}

function sanitizeImageDataUrl(value: unknown): string {
  const dataUrl = trimString(value);
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl) ? dataUrl : "";
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeWhitespace(item)).filter(Boolean);
}

function sanitizeCurrentProduct(value: unknown): CurrentProductContext {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;

  return {
    productId: trimString(row.productId),
    productName: normalizeWhitespace(row.productName),
    ingredientsText: normalizeWhitespace(row.ingredientsText),
    sourceIngredients: sanitizeStringArray(row.sourceIngredients).slice(0, 80),
    sourceStatusVerbose: trimString(row.sourceStatusVerbose),
  };
}

function buildBarcodeLookupCandidates(
  barcode: string,
  barcodeType?: string | null
): string[] {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);
  const candidates = [normalizedBarcode];

  if (/^\d{12}$/.test(normalizedBarcode)) {
    candidates.push(`0${normalizedBarcode}`);
  } else if (/^0\d{12}$/.test(normalizedBarcode)) {
    candidates.push(normalizedBarcode.slice(1));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function extractCompletionContent(rawContent: unknown): string {
  if (typeof rawContent === "string") {
    return rawContent.trim();
  }

  if (!Array.isArray(rawContent)) {
    return "";
  }

  return rawContent
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      return "";
    })
    .join("")
    .trim();
}

function cleanIngredientText(value: unknown): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  const directFixes = new Map([
    ["absorbic acid", "Ascorbic acid"],
    ["robiflavin", "Riboflavin"],
    ["ron", "Iron"],
  ]);
  const directMatch = directFixes.get(normalized.toLowerCase());
  if (directMatch) {
    return directMatch;
  }

  return normalized
    .replace(/\babsorbic acid\b/gi, "Ascorbic acid")
    .replace(/\brobiflavin\b/gi, "Riboflavin")
    .replace(/\bvitamin d 0?3\b/gi, "Vitamin D3")
    .trim();
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
    {
      broad: "omega 3 fatty acids",
      aliases: [
        "omega 3 fatty acids",
        "omega-3 fatty acids",
        "omega 3",
        "omega-3",
        "fish oil",
        "dha",
        "epa",
        "docosahexaenoic acid",
        "eicosapentaenoic acid",
      ],
    },
  ];

  for (const entry of synonymMaps) {
    if (
      entry.aliases.some((alias) =>
        new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized)
      )
    ) {
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

function buildSupplementNameLookupKeys(value: unknown) {
  const rawValue = trimString(value);
  if (!rawValue) {
    return [];
  }

  const keys = new Set<string>();

  const addKey = (candidate: string) => {
    const normalized = normalizeBroadIngredientName(candidate);
    if (normalized) {
      keys.add(normalized);
    }
  };

  addKey(rawValue);

  rawValue
    .split(/\s*[\/|]\s*/)
    .map((segment) => trimString(segment))
    .filter(Boolean)
    .forEach(addKey);

  return Array.from(keys);
}

function normalizeUnit(value: unknown) {
  const normalized = normalizeWhitespace(String(value || ""))
    .toLowerCase()
    .replace(/[µμ]/g, "u");

  if (!normalized) return null;
  if (normalized === "ug") return "mcg";
  if (normalized === "mcg") return "mcg";
  if (normalized === "mg") return "mg";
  if (normalized === "g") return "g";
  if (normalized === "ml") return "ml";
  if (normalized === "iu") return "IU";
  if (normalized === "cfu") return "CFU";
  return normalized;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getUnitSearchVariants(rawUnit: string): string[] {
  const normalized = normalizeUnit(rawUnit);
  switch (normalized) {
    case "mcg":
      return ["mcg", "µg", "μg", "ug", "micrograms", "microgram"];
    case "mg":
      return ["mg", "milligrams", "milligram"];
    case "g":
      return ["g", "grams", "gram"];
    case "ml":
      return ["ml", "mL"];
    case "IU":
      return ["IU", "i.u.", "iu"];
    case "CFU":
      return ["CFU", "cfu"];
    default:
      return rawUnit ? [rawUnit] : [];
  }
}

function buildDoseSearchPatterns(
  rawValue: number,
  rawUnit: string | null,
  originalText: string | null
): RegExp[] {
  const patterns: RegExp[] = [];

  if (originalText) {
    try {
      patterns.push(new RegExp(escapeRegExp(originalText.trim()), "i"));
    } catch {}
  }

  if (!rawUnit) return patterns;

  const unitVariants = getUnitSearchVariants(rawUnit);
  const valueStr = String(rawValue);

  for (const unitVariant of unitVariants) {
    try {
      patterns.push(
        new RegExp(
          `\\b${escapeRegExp(valueStr)}\\s*${escapeRegExp(unitVariant)}\\b`,
          "i"
        )
      );
    } catch {}
  }

  return patterns;
}

function verifyDoseAgainstOcr({
  ingredientName,
  rawDosageValue,
  rawDosageUnit,
  dosageOriginalText,
  ocrText,
}: {
  ingredientName: string;
  rawDosageValue: number | null;
  rawDosageUnit: string | null;
  dosageOriginalText: string | null;
  ocrText: string;
}): { confidence: "verified" | "unverified" | "missing"; reason: string | null } {
  if (!Number.isFinite(rawDosageValue)) {
    return { confidence: "missing", reason: null };
  }

  const cleanedOcr = ocrText.trim();
  if (!cleanedOcr) {
    return {
      confidence: "unverified",
      reason: "No OCR text available for verification",
    };
  }

  const dosePatterns = buildDoseSearchPatterns(
    rawDosageValue as number,
    rawDosageUnit,
    dosageOriginalText
  );

  if (!dosePatterns.length) {
    return { confidence: "unverified", reason: "No dose patterns to verify" };
  }

  const ingredientKey = normalizeBroadIngredientName(ingredientName);
  if (!ingredientKey) {
    return {
      confidence: "unverified",
      reason: "Could not normalize ingredient name",
    };
  }

  const ingredientWords = ingredientKey.split(" ").filter(Boolean);
  const lines = cleanedOcr
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const normalizedLine = normalizePlainText(lines[i]);

    const ingredientOnLine =
      normalizedLine.includes(ingredientKey) ||
      (ingredientWords.length > 1 &&
        ingredientWords.every((word) => normalizedLine.includes(word)));

    if (!ingredientOnLine) continue;

    const start = Math.max(0, i - 1);
    const end = Math.min(lines.length - 1, i + 2);
    const context = lines.slice(start, end + 1).join(" ");

    for (const pattern of dosePatterns) {
      if (pattern.test(context)) {
        return { confidence: "verified", reason: null };
      }
    }
  }

  return {
    confidence: "unverified",
    reason: "Extracted dose could not be verified against OCR text",
  };
}

function normalizeDosage({
  dosageValue,
  dosageUnit,
  dosageOriginalText,
}: {
  dosageValue: unknown;
  dosageUnit: unknown;
  dosageOriginalText: unknown;
}) {
  const value = parseOptionalNumber(dosageValue);
  const unit = normalizeUnit(dosageUnit);
  const originalText = trimString(dosageOriginalText);

  if (!unit) {
    return {
      value,
      unit: null,
      originalText: originalText || null,
      invalidReason: null,
    };
  }

  if (!ALLOWED_UNITS.has(unit)) {
    return {
      value,
      unit,
      originalText: originalText || null,
      invalidReason: unit === "pg" ? "ocr_unit_noise" : "unsupported_unit",
    };
  }

  if (!Number.isFinite(value)) {
    return {
      value: null,
      unit,
      originalText: originalText || null,
      invalidReason: null,
    };
  }

  if (unit === "g") {
    return {
      value: roundTo(value * 1000, 6),
      unit: "mg",
      originalText: originalText || null,
      invalidReason: null,
    };
  }

  if (unit === "mg" && Math.abs(value) < 1) {
    return {
      value: roundTo(value * 1000, 6),
      unit: "mcg",
      originalText: originalText || null,
      invalidReason: null,
    };
  }

  return {
    value,
    unit,
    originalText: originalText || null,
    invalidReason: null,
  };
}

function stringifyDosage(value: unknown, unit: unknown) {
  const parsedValue = parseOptionalNumber(value);
  const normalizedUnit = normalizeUnit(unit);

  if (!Number.isFinite(parsedValue) || !normalizedUnit) {
    return null;
  }

  return `${
    Number.isInteger(parsedValue) ? parsedValue : parsedValue
  }${normalizedUnit}`;
}

function normalizeIngredient(item: unknown): NormalizedIngredient {
  const ingredient = item as Record<string, unknown>;
  const amountBasis = trimString(ingredient?.amount_basis);

  return {
    raw_name: cleanIngredientText(ingredient?.raw_name),
    canonical_name: cleanIngredientText(ingredient?.canonical_name),
    ingredient_type: ["active", "inactive", "uncertain"].includes(
      trimString(ingredient?.ingredient_type)
    )
      ? (trimString(ingredient?.ingredient_type) as
          | "active"
          | "inactive"
          | "uncertain")
      : "uncertain",
    dosage_value: parseOptionalNumber(ingredient?.dosage_value),
    dosage_unit: trimString(ingredient?.dosage_unit) || null,
    dosage_original_text: trimString(ingredient?.dosage_original_text) || null,
    chemical_form: cleanIngredientText(ingredient?.chemical_form) || null,
    amount_basis: (amountBasis &&
    AMOUNT_BASIS_VALUES.includes(amountBasis as never)
      ? amountBasis
      : "unknown") as (typeof AMOUNT_BASIS_VALUES)[number] | null,
  };
}

function normalizePhotoRescueOutput(
  value: unknown
): NormalizedPhotoRescueResult {
  const row = (value ?? {}) as Record<string, unknown>;
  const category = trimString(row.category);
  const normalizedCategory = CATEGORY_VALUES.includes(category as never)
    ? (category as (typeof CATEGORY_VALUES)[number])
    : "not_supplement";

  const ingredients = Array.isArray(row.ingredients_found)
    ? row.ingredients_found.map((item) => normalizeIngredient(item))
    : [];

  return {
    classification: {
      is_supplement: Boolean(row.is_supplement),
      confidence: clampConfidence(row.classification_confidence),
      category: normalizedCategory,
      should_extract: Boolean(row.should_extract),
      reason: trimString(row.classification_reason),
    },
    naming: {
      display_name: normalizeWhitespace(row.display_name),
      product_name: normalizeWhitespace(row.product_name) || null,
      full_product_name: normalizeWhitespace(row.full_product_name) || null,
      brand_name: normalizeWhitespace(row.brand_name) || null,
      product_type: normalizeWhitespace(row.product_type) || null,
      form_factor: normalizeWhitespace(row.form_factor) || null,
      flavor: normalizeWhitespace(row.flavor) || null,
      confidence: clampConfidence(row.naming_confidence),
      notes: normalizeWhitespace(row.naming_notes) || null,
    },
    extraction: {
      serving_size_text: normalizeWhitespace(row.serving_size_text) || null,
      notes: normalizeWhitespace(row.extraction_notes) || null,
      ingredients_found: ingredients,
    },
    productText: {
      front_label_name: normalizeWhitespace(row.front_label_name),
      ingredient_panel_text: normalizeWhitespace(row.ingredient_panel_text),
      raw_text: normalizeWhitespace(row.raw_text),
    },
  };
}

function buildSystemPrompt() {
  return [
    "You classify whether the photographed product is a dietary supplement, normalize its product name, and extract structured supplement ingredients.",
    "Use the images as the source of truth.",
    "Return valid JSON that exactly matches the provided schema.",
    "If the product is not clearly a dietary supplement, set is_supplement false.",
    "For supplement naming, produce a concise user-facing display name.",
    "Prefer full_product_name for display_name when both brand and product are visible.",
    "Extract brand_name and product_name separately whenever the front label supports it.",
    "If the front label reads like '<Brand> <Product>', split the first part into brand_name and the remainder into product_name when that split is visually supported.",
    "For extraction, keep only active supplement ingredients where possible.",
    "Use a dose-extraction hierarchy: structured table first, inline ingredient doses second, ingredient names without doses last.",
    "If a structured table exists, treat it as the primary source of truth and extract every row with an explicit numeric dose.",
    "If multiple sections exist, merge them without duplicating ingredients and prefer entries with explicit numeric doses over undosed mentions.",
    "If a label gives a compound/form dose plus an active/equivalent amount, such as 'Creatine monohydrate 3g of which creatine 2.6g', return ONE row only: canonical_name 'Creatine', dosage_value 2.6, dosage_unit 'g', chemical_form 'Creatine monohydrate'. Do not also return Creatine monohydrate 3g as a separate active ingredient.",
    "Apply the same rule to wording like 'providing', 'equivalent to', 'yielding', 'of which', or 'elemental'. Prefer the actual active/equivalent amount for dosage_value.",
    "Rows from structured tables should normally map to active ingredients with dosage_value, dosage_unit, and amount_basis 'per_serving' unless the label clearly states another basis.",
    "Mark excipients, fillers, capsule materials, sweeteners, preservatives, and colors as inactive.",
    "Do not invent missing dosages.",
    "Preserve the original dosage text.",
    "Return broad canonical names such as Vitamin D, Magnesium, Zinc.",
    "Put specific salt or form into chemical_form.",
    "If dosage is ambiguous, set numeric dosage to null.",
    "Use the front label for product naming and the back panel for ingredient extraction.",
  ].join(" ");
}

function buildUserPrompt({
  scanSessionId,
  barcode,
  currentProduct,
}: {
  scanSessionId: number;
  barcode: string;
  currentProduct: CurrentProductContext;
}) {
  const scanContext = {
    scanSessionId,
    barcode,
    existingProductContext: currentProduct,
  };

  return `
You are processing two supplement photos after a barcode scan.

Image order:
1. Ingredients panel / supplement facts
2. Front label / product name

Return:
- supplement classification
- product naming fields
- ingredient extraction fields
- front_label_name and ingredient_panel_text
- brand_name (string)
- product_name (string)
- full_product_name (string)

- For each ingredient, extract:
  - name
  - dosageValue (number, if shown)
  - dosageUnit (mg, mcg, g, IU, etc.)
  - amountBasis ("per_serving", "per_capsule", "per_tablet", etc.)

Dosage rules:
- Use ONLY values explicitly visible in the supplement facts panel
- If an ingredient is part of a proprietary blend without a specific dose → set dosageValue = null
- If only total blend weight is shown → do NOT assign it to individual ingredients
- If serving size is shown (e.g. "2 capsules"), use that to infer amountBasis
- Never guess or estimate doses

Dose extraction priority (apply in order):

1. If a structured table exists (e.g. "Supplement Facts", "Vitamins & Minerals", "Nutrition", "Active Ingredients"):
   - Extract ALL rows with numeric doses
   - Treat this as the PRIMARY source of truth

2. If no structured table exists:
   - Extract doses from inline ingredient listings (e.g. "Magnesium 200mg")

3. If neither exists:
   - Extract ingredient names only and set dosageValue = null

General rules:
- Never ignore a structured table if present
- Multiple sections may exist (e.g. vitamins table + ingredient list) → merge them
- Do not duplicate ingredients across sections
- Prefer entries with explicit numeric doses over those without

Naming rules:
- Extract the brand from the front label (usually top of the packaging)
- Extract the product name separately (e.g. "Mango Greens")
- full_product_name = "<brand_name> <product_name>"
- If both are present, ALWAYS include both in full_product_name
- Do not merge brand into product_name
- If brand is unclear, set brand_name = null (do not guess)
- If the front label contains a phrase like "<Brand> <Product>" (e.g. "Free Soul Greens"), extract:
  - brand_name = first part ("Free Soul")
  - product_name = second part ("Greens")

Hard rules:
- Use the images as the source of truth. Existing scan context is only a fallback hint.
- Exclude directions, warnings, allergens, bulking agents, capsule shell, cellulose, magnesium stearate, silicon dioxide, sweeteners, flavors, preservatives, and other inactive ingredients.
- Do not invent ingredients or claims that are not visible.
- Prefer ingredient names or nutrient forms such as "Creatine monohydrate", "Vitamin D3", "Magnesium glycinate".
- If a blend name is shown without sub-ingredients, include it only if it is clearly an active supplement ingredient.
- If uncertain, lower confidence and use ingredient_type "uncertain" instead of guessing.

Barcode scan context:
${JSON.stringify(scanContext)}
`.trim();
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function buildContentHash({
  barcode,
  barcodeType,
  name,
  ingredients,
}: {
  barcode: string;
  barcodeType?: string | null;
  name: string;
  ingredients: string;
}) {
  return sha256Hex(
    [
      normalizeBarcode(barcode, barcodeType),
      normalizePlainText(name),
      normalizePlainText(ingredients),
    ].join("|")
  );
}

async function fetchOpenAiExtraction({
  scanSessionId,
  barcode,
  currentProduct,
  ingredientsImage,
  productImage,
}: {
  scanSessionId: number;
  barcode: string;
  currentProduct: CurrentProductContext;
  ingredientsImage: string;
  productImage: string;
}) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: buildOpenAiHeaders(openAiApiKey || ""),
    body: JSON.stringify({
      model: openAiModel,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: photoRescueResponseSchema,
      },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildUserPrompt({
                scanSessionId,
                barcode,
                currentProduct,
              }),
            },
            {
              type: "image_url",
              image_url: {
                url: ingredientsImage,
              },
            },
            {
              type: "image_url",
              image_url: {
                url: productImage,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${errorText.slice(0, 500)}`);
  }

  const completion = await response.json();
  const content = extractCompletionContent(
    completion?.choices?.[0]?.message?.content
  );

  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Could not parse OpenAI JSON response.");
  }

  return normalizePhotoRescueOutput(parsed);
}

async function fetchOffProductById(productId: string) {
  const { data, error } = await adminSupabase!
    .from(TABLES.products)
    .select("id, barcode, name, ingredients")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase:${TABLES.products}] ${error.message}`);
  }

  return data;
}

async function fetchOffProductByBarcode(
  barcode: string,
  barcodeType?: string | null
) {
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
  requestedProductId,
  barcode,
  barcodeType,
  fallbackName,
  fallbackIngredients,
}: {
  requestedProductId: string;
  barcode: string;
  barcodeType?: string | null;
  fallbackName: string;
  fallbackIngredients: string;
}) {
  const cleanProductId = trimString(requestedProductId);

  if (cleanProductId) {
    const existingById = await fetchOffProductById(cleanProductId);
    if (existingById?.id) {
      return {
        productId: trimString(existingById.id),
        product: existingById,
        createdProduct: false,
      };
    }
  }

  const existingByBarcode = await fetchOffProductByBarcode(barcode, barcodeType);
  if (existingByBarcode?.id) {
    return {
      productId: trimString(existingByBarcode.id),
      product: existingByBarcode,
      createdProduct: false,
    };
  }

  const nextProduct = {
    id: crypto.randomUUID(),
    barcode: normalizeBarcode(barcode, barcodeType),
    name: fallbackName || "Scanned supplement",
    ingredients: fallbackIngredients || "",
  };

  const { error: insertError } = await adminSupabase!
    .from(TABLES.products)
    .insert(nextProduct);

  if (insertError) {
    const winningRow = await fetchOffProductByBarcode(barcode, barcodeType);
    if (winningRow?.id) {
      return {
        productId: trimString(winningRow.id),
        product: winningRow,
        createdProduct: false,
      };
    }

    throw new Error(`[supabase:${TABLES.products}] ${insertError.message}`);
  }

  return {
    productId: nextProduct.id,
    product: nextProduct,
    createdProduct: true,
  };
}

async function fetchAliasRows() {
  const { data, error } = await adminSupabase!.from(TABLES.aliases).select("*");

  if (error) {
    throw new Error(`[supabase:${TABLES.aliases}] ${error.message}`);
  }

  return data ?? [];
}

async function fetchApprovedSupplements() {
  const { data, error } = await adminSupabase!
    .from(TABLES.supplements)
    .select("id, name, status")
    .eq("status", "approved");

  if (error) {
    throw new Error(`[supabase:${TABLES.supplements}] ${error.message}`);
  }

  return data ?? [];
}

function buildAliasIndex(aliasRows: Record<string, unknown>[]) {
  const index = new Map<
    string,
    { supplement_id: string; canonical_name: string; alias_name: string }
  >();

  for (const row of aliasRows) {
    const aliasName = trimString(row.alias);
    const normalizedName =
      trimString(row.alias_normalized) ||
      normalizeBroadIngredientName(aliasName);
    const supplementId = trimString(row.supplement_id);
    const canonicalName = trimString(row.alias) || aliasName;

    if (!normalizedName || !supplementId || index.has(normalizedName)) {
      continue;
    }

    index.set(normalizedName, {
      supplement_id: supplementId,
      canonical_name: canonicalName || aliasName,
      alias_name: aliasName,
    });
  }

  return index;
}

function buildSupplementNameIndex(supplements: Record<string, unknown>[]) {
  const index = new Map<
    string,
    { supplement_id: string; canonical_name: string }
  >();

  for (const supplement of supplements) {
    const supplementId = trimString(supplement.id);
    const name = trimString(supplement.name);

    if (!supplementId || !name) {
      continue;
    }

    buildSupplementNameLookupKeys(name).forEach((key) => {
      if (!index.has(key)) {
        index.set(key, {
          supplement_id: supplementId,
          canonical_name: name,
        });
      }
    });
  }

  return index;
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

function buildActiveIngredientSignature(row: Record<string, unknown>) {
  return [
    trimString(row.product_id),
    trimString(row.raw_name).toLowerCase(),
    trimString(row.canonical_name).toLowerCase(),
    row.dosage_value ?? "",
    trimString(row.dosage_unit),
    trimString(row.chemical_form).toLowerCase(),
    trimString(row.amount_basis).toLowerCase(),
    trimString(row.ingredient_type).toLowerCase(),
  ].join("|");
}

function buildResolvedActiveIngredientRows({
  productId,
  ingredients,
  aliasIndex,
  supplementNameIndex,
  ocrText,
}: {
  productId: string;
  ingredients: NormalizedIngredient[];
  aliasIndex: Map<
    string,
    { supplement_id: string; canonical_name: string; alias_name: string }
  >;
  supplementNameIndex: Map<
    string,
    { supplement_id: string; canonical_name: string }
  >;
  ocrText: string;
}) {
  const rowsBySignature = new Map<string, Record<string, unknown>>();
  const unresolvedRows: {
    normalized_name: string;
    display_name: string;
    product_id: string;
  }[] = [];
  const malformedDosages: {
    raw_name: string;
    dosage_original_text: string | null;
    invalid_reason: string;
  }[] = [];
  const unverifiedDoses: {
    ingredient_name: string;
    extracted_dose: string | null;
    reason: string;
  }[] = [];

  for (const ingredient of ingredients) {
    if (ingredient.ingredient_type === "inactive") {
      continue;
    }

    const canonicalName = cleanIngredientText(
      ingredient.canonical_name || ingredient.raw_name
    );
    const rawName = cleanIngredientText(ingredient.raw_name || canonicalName);

    if (!canonicalName && !rawName) {
      continue;
    }

    const normalizedLookupName = normalizeBroadIngredientName(
      canonicalName || rawName
    );
    const matchedAlias =
      aliasIndex.get(normalizedLookupName) ||
      supplementNameIndex.get(normalizedLookupName) ||
      null;
    const dosage = normalizeDosage({
      dosageValue: ingredient.dosage_value,
      dosageUnit: ingredient.dosage_unit,
      dosageOriginalText: ingredient.dosage_original_text,
    });

    let resolutionStatus = "matched";
    if (ingredient.ingredient_type === "uncertain") {
      resolutionStatus = "uncertain";
    } else if (!matchedAlias) {
      resolutionStatus = "needs_alias_review";
    }

    if (dosage.invalidReason) {
      malformedDosages.push({
        raw_name: rawName || canonicalName,
        dosage_original_text: dosage.originalText,
        invalid_reason: dosage.invalidReason,
      });
    }

    const doseVerification = verifyDoseAgainstOcr({
      ingredientName: canonicalName || rawName,
      rawDosageValue: ingredient.dosage_value,
      rawDosageUnit: ingredient.dosage_unit,
      dosageOriginalText: ingredient.dosage_original_text,
      ocrText,
    });

    if (doseVerification.confidence === "unverified") {
      unverifiedDoses.push({
        ingredient_name: canonicalName || rawName,
        extracted_dose:
          dosage.originalText ||
          stringifyDosage(ingredient.dosage_value, ingredient.dosage_unit) ||
          null,
        reason:
          doseVerification.reason ||
          "Extracted dose could not be verified against OCR text",
      });
    }

    const nextRow = {
      product_id: productId,
      raw_name: rawName || canonicalName,
      canonical_name: canonicalName || rawName,
      canonical_supplement_id: matchedAlias?.supplement_id || null,
      chemical_form: ingredient.chemical_form || null,
      dosage_value: dosage.value,
      dosage_unit: dosage.unit,
      dosage_original_text:
        dosage.originalText || ingredient.dosage_original_text || null,
      amount_basis: ingredient.amount_basis || "unknown",
      ingredient_type:
        ingredient.ingredient_type === "uncertain" ? "uncertain" : "active",
      resolution_status: resolutionStatus,
      resolution_confidence:
        resolutionStatus === "matched"
          ? 1
          : resolutionStatus === "uncertain"
          ? 0.25
          : 0.5,
      source_model: openAiModel,
      source_prompt_version: EXTRACTION_PROMPT_VERSION,
      display_name: canonicalName || rawName,
      dose_confidence: doseVerification.confidence,
      dose_review_reason: doseVerification.reason,
    };

    const signature = buildActiveIngredientSignature(nextRow);
    const existing = rowsBySignature.get(signature);

    if (
      !existing ||
      (!trimString(existing.canonical_supplement_id) &&
        trimString(nextRow.canonical_supplement_id))
    ) {
      rowsBySignature.set(signature, nextRow);
    }

    if (
      resolutionStatus === "needs_alias_review" &&
      nextRow.ingredient_type === "active" &&
      normalizedLookupName
    ) {
      unresolvedRows.push({
        normalized_name: normalizedLookupName,
        display_name: canonicalName || rawName || normalizedLookupName,
        product_id: productId,
      });
    }
  }

  const rows = Array.from(rowsBySignature.values());
  const activeRows = rows.filter((row) => row.ingredient_type === "active");

  return {
    rows,
    activeRows,
    unresolvedRows: dedupeByKey(
      unresolvedRows,
      (row) => `${row.normalized_name}|${row.product_id}`
    ),
    malformedDosages: dedupeByKey(
      malformedDosages,
      (row) =>
        `${row.raw_name}|${row.dosage_original_text}|${row.invalid_reason}`
    ),
    unverifiedDoses: dedupeByKey(
      unverifiedDoses,
      (row) => `${row.ingredient_name}|${row.extracted_dose}`
    ),
  };
}

function buildMasterActiveIngredients(activeRows: Record<string, unknown>[]) {
  return dedupeByKey(
    activeRows
      .map((row) => ({
        name: trimString(row.canonical_name),
        dosageValue:
          typeof row.dosage_value === "number" ? row.dosage_value : null,
        dosageUnit: trimString(row.dosage_unit) || null,
        dosageDisplay:
          trimString(row.dosage_original_text) ||
          stringifyDosage(row.dosage_value, row.dosage_unit) ||
          null,
        chemicalForm: trimString(row.chemical_form) || null,
        amountBasis: trimString(row.amount_basis) || "unknown",
        doseConfidence: ["verified", "unverified", "missing"].includes(
          trimString(row.dose_confidence)
        )
          ? (trimString(row.dose_confidence) as
              | "verified"
              | "unverified"
              | "missing")
          : null,
        doseReviewReason: trimString(row.dose_review_reason) || null,
      }))
      .filter((row) => row.name)
      .sort((left, right) => {
        const byName = left.name.localeCompare(right.name);
        if (byName !== 0) {
          return byName;
        }

        return String(left.dosageDisplay ?? "").localeCompare(
          String(right.dosageDisplay ?? "")
        );
      }),
    (row) =>
      [
        row.name,
        row.dosageValue ?? "",
        row.dosageUnit ?? "",
        row.dosageDisplay ?? "",
        row.chemicalForm ?? "",
        row.amountBasis ?? "",
      ].join("|")
  );
}

async function fetchProductActiveIngredientSnapshot(productId: string) {
  const { data, error } = await adminSupabase!
    .from(TABLES.activeIngredients)
    .select("*")
    .eq("product_id", productId);

  if (error) {
    throw new Error(`[supabase:${TABLES.activeIngredients}] ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const { id: _id, ...rest } = row;
    return rest;
  });
}

async function fetchMasterSnapshot(productId: string) {
  const { data, error } = await adminSupabase!
    .from(TABLES.supplementMaster)
    .select("*")
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase:${TABLES.supplementMaster}] ${error.message}`);
  }

  return data;
}

async function restoreCanonicalSnapshot({
  productId,
  activeRows,
  masterRow,
}: {
  productId: string;
  activeRows: Record<string, unknown>[];
  masterRow: Record<string, unknown> | null;
}) {
  await adminSupabase!
    .from(TABLES.activeIngredients)
    .delete()
    .eq("product_id", productId);

  if (activeRows.length) {
    const { error: restoreIngredientsError } = await adminSupabase!
      .from(TABLES.activeIngredients)
      .insert(activeRows);

    if (restoreIngredientsError) {
      console.error(
        "Failed to restore product_active_ingredients",
        restoreIngredientsError
      );
    }
  }

  if (masterRow) {
    const { error: restoreMasterError } = await adminSupabase!
      .from(TABLES.supplementMaster)
      .upsert(masterRow, {
        onConflict: "product_id",
      });

    if (restoreMasterError) {
      console.error(
        "Failed to restore supplement_products_master",
        restoreMasterError
      );
    }
  } else {
    const { error: deleteMasterError } = await adminSupabase!
      .from(TABLES.supplementMaster)
      .delete()
      .eq("product_id", productId);

    if (deleteMasterError) {
      console.error(
        "Failed to clear restored supplement_products_master",
        deleteMasterError
      );
    }
  }
}

async function replaceCanonicalRows({
  productId,
  barcode,
  rowsToInsert,
  masterRows,
  displayName,
  servingSizeText,
  namingConfidence,
}: {
  productId: string;
  barcode: string | null;
  rowsToInsert: Record<string, unknown>[];
  masterRows: Record<string, unknown>[];
  displayName: string;
  servingSizeText: string | null;
  namingConfidence: number | null;
}) {
  const previousActiveRows = await fetchProductActiveIngredientSnapshot(
    productId
  );
  const previousMasterRow = await fetchMasterSnapshot(productId);

  try {
    const { error: deleteIngredientsError } = await adminSupabase!
      .from(TABLES.activeIngredients)
      .delete()
      .eq("product_id", productId);

    if (deleteIngredientsError) {
      throw new Error(
        `[supabase:${TABLES.activeIngredients}] ${deleteIngredientsError.message}`
      );
    }

    if (rowsToInsert.length) {
      const { error: insertIngredientsError } = await adminSupabase!
        .from(TABLES.activeIngredients)
        .insert(rowsToInsert);

      if (insertIngredientsError) {
        throw new Error(
          `[supabase:${TABLES.activeIngredients}] ${insertIngredientsError.message}`
        );
      }
    }

    const masterActiveIngredients = buildMasterActiveIngredients(masterRows);
    const { error: masterError } = await adminSupabase!
      .from(TABLES.supplementMaster)
      .upsert(
        {
          product_id: productId,
          barcode: trimString(barcode) || null,
          display_name: displayName,
          serving_size_text: servingSizeText,
          name_source: "photo_rescue_ai",
          naming_confidence:
            typeof namingConfidence === "number" ? namingConfidence : null,
          active_ingredients_json: masterActiveIngredients,
          ingredient_count: masterActiveIngredients.length,
          processed_at: new Date().toISOString(),
        },
        {
          onConflict: "product_id",
        }
      );

    if (masterError) {
      throw new Error(
        `[supabase:${TABLES.supplementMaster}] ${masterError.message}`
      );
    }
  } catch (error) {
    await restoreCanonicalSnapshot({
      productId,
      activeRows: previousActiveRows,
      masterRow: previousMasterRow,
    });
    throw error;
  }
}

async function fetchMissingOccurrencesForProduct(productId: string) {
  const { data, error } = await adminSupabase!
    .from(TABLES.missingOccurrences)
    .select("*")
    .eq("product_id", productId);

  if (error) {
    throw new Error(`[supabase:${TABLES.missingOccurrences}] ${error.message}`);
  }

  return data ?? [];
}

async function fetchMissingOccurrencesByNames(normalizedNames: string[]) {
  if (!normalizedNames.length) {
    return [];
  }

  const { data, error } = await adminSupabase!
    .from(TABLES.missingOccurrences)
    .select("*")
    .in("normalized_name", normalizedNames);

  if (error) {
    throw new Error(`[supabase:${TABLES.missingOccurrences}] ${error.message}`);
  }

  return data ?? [];
}

async function refreshMissingSupplementSummaries(normalizedNames: string[]) {
  const uniqueNames = Array.from(new Set(normalizedNames.filter(Boolean)));
  if (!uniqueNames.length) {
    return;
  }

  const occurrenceRows = await fetchMissingOccurrencesByNames(uniqueNames);
  const summaryByName = new Map<
    string,
    {
      normalized_name: string;
      display_name: string;
      occurrence_count: number;
      first_seen_at: string;
      last_seen_at: string;
    }
  >();

  occurrenceRows.forEach((row) => {
    const normalizedName = trimString(row.normalized_name);
    if (!normalizedName) {
      return;
    }

    const current = summaryByName.get(normalizedName) ?? {
      normalized_name: normalizedName,
      display_name: trimString(row.display_name) || normalizedName,
      occurrence_count: 0,
      first_seen_at: trimString(row.first_seen_at) || new Date().toISOString(),
      last_seen_at: trimString(row.last_seen_at) || new Date().toISOString(),
    };

    current.occurrence_count += 1;

    const rowFirstSeen = trimString(row.first_seen_at);
    const rowLastSeen = trimString(row.last_seen_at);

    if (rowFirstSeen && rowFirstSeen < current.first_seen_at) {
      current.first_seen_at = rowFirstSeen;
    }

    if (rowLastSeen && rowLastSeen > current.last_seen_at) {
      current.last_seen_at = rowLastSeen;
    }

    if (!current.display_name && trimString(row.display_name)) {
      current.display_name = trimString(row.display_name);
    }

    summaryByName.set(normalizedName, current);
  });

  const nextRows = Array.from(summaryByName.values());

  if (nextRows.length) {
    const { error: upsertError } = await adminSupabase!
      .from(TABLES.missingSupplements)
      .upsert(nextRows, {
        onConflict: "normalized_name",
      });

    if (upsertError) {
      throw new Error(
        `[supabase:${TABLES.missingSupplements}] ${upsertError.message}`
      );
    }
  }

  const namesWithoutRows = uniqueNames.filter(
    (name) => !summaryByName.has(name)
  );
  if (namesWithoutRows.length) {
    const { error: deleteError } = await adminSupabase!
      .from(TABLES.missingSupplements)
      .delete()
      .in("normalized_name", namesWithoutRows);

    if (deleteError) {
      throw new Error(
        `[supabase:${TABLES.missingSupplements}] ${deleteError.message}`
      );
    }
  }
}

async function replaceReviewArtifacts({
  productId,
  unresolvedRows,
  malformedDosages,
  unverifiedDoses,
}: {
  productId: string;
  unresolvedRows: {
    normalized_name: string;
    display_name: string;
    product_id: string;
  }[];
  malformedDosages: {
    raw_name: string;
    dosage_original_text: string | null;
    invalid_reason: string;
  }[];
  unverifiedDoses: {
    ingredient_name: string;
    extracted_dose: string | null;
    reason: string;
  }[];
}) {
  const previousOccurrences = await fetchMissingOccurrencesForProduct(
    productId
  );
  const previousNames = previousOccurrences
    .map((row) => trimString(row.normalized_name))
    .filter(Boolean);

  const { error: deleteOccurrencesError } = await adminSupabase!
    .from(TABLES.missingOccurrences)
    .delete()
    .eq("product_id", productId);

  if (deleteOccurrencesError) {
    throw new Error(
      `[supabase:${TABLES.missingOccurrences}] ${deleteOccurrencesError.message}`
    );
  }

  const { error: deleteReviewQueueError } = await adminSupabase!
    .from(TABLES.reviewQueue)
    .delete()
    .eq("product_id", productId)
    .in("review_type", [
      REVIEW_TYPES.aliasUnresolved,
      REVIEW_TYPES.dosageMalformed,
      REVIEW_TYPES.doseUnverified,
    ])
    .eq("status", "pending");

  if (deleteReviewQueueError) {
    throw new Error(
      `[supabase:${TABLES.reviewQueue}] ${deleteReviewQueueError.message}`
    );
  }

  if (unresolvedRows.length) {
    const existingOccurrenceKeys = unresolvedRows.map((row) => ({
      normalized_name: row.normalized_name,
      product_id: row.product_id,
    }));
    const { data: existingOccurrenceRows, error: existingOccurrencesError } =
      await adminSupabase!
        .from(TABLES.missingOccurrences)
        .select("normalized_name, product_id, first_seen_at, occurrence_count")
        .in(
          "normalized_name",
          Array.from(new Set(existingOccurrenceKeys.map((row) => row.normalized_name)))
        )
        .eq("product_id", productId);

    if (existingOccurrencesError) {
      throw new Error(
        `[supabase:${TABLES.missingOccurrences}] ${existingOccurrencesError.message}`
      );
    }

    const existingFirstSeenByKey = new Map(
      (existingOccurrenceRows ?? []).map((row) => [
        `${trimString(row.normalized_name)}|${trimString(row.product_id)}`,
        {
          first_seen_at: trimString(row.first_seen_at),
          occurrence_count: Number(row.occurrence_count),
        },
      ])
    );

    const now = new Date().toISOString();
    const occurrenceRows = unresolvedRows.map((row) => {
      const existing = existingFirstSeenByKey.get(
        `${trimString(row.normalized_name)}|${trimString(row.product_id)}`
      );

      return {
        normalized_name: row.normalized_name,
        product_id: row.product_id,
        display_name: row.display_name,
        first_seen_at: existing?.first_seen_at || now,
        last_seen_at: now,
        occurrence_count: Number.isFinite(existing?.occurrence_count)
          ? Number(existing.occurrence_count) + 1
          : 1,
      };
    });

    const { error: upsertOccurrencesError } = await adminSupabase!
      .from(TABLES.missingOccurrences)
      .upsert(occurrenceRows, {
        onConflict: "normalized_name,product_id",
      });

    if (upsertOccurrencesError) {
      throw new Error(
        `[supabase:${TABLES.missingOccurrences}] ${upsertOccurrencesError.message}`
      );
    }

    const { error: aliasReviewInsertError } = await adminSupabase!
      .from(TABLES.reviewQueue)
      .insert({
        product_id: productId,
        review_type: REVIEW_TYPES.aliasUnresolved,
        payload: {
          unresolved_names: unresolvedRows.map((row) => ({
            normalized_name: row.normalized_name,
            display_name: row.display_name,
          })),
          count: unresolvedRows.length,
        },
        status: "pending",
      });

    if (aliasReviewInsertError) {
      throw new Error(
        `[supabase:${TABLES.reviewQueue}] ${aliasReviewInsertError.message}`
      );
    }
  }

  if (malformedDosages.length) {
    const { error: dosageReviewInsertError } = await adminSupabase!
      .from(TABLES.reviewQueue)
      .insert({
        product_id: productId,
        review_type: REVIEW_TYPES.dosageMalformed,
        payload: {
          items: malformedDosages,
          count: malformedDosages.length,
        },
        status: "pending",
      });

    if (dosageReviewInsertError) {
      throw new Error(
        `[supabase:${TABLES.reviewQueue}] ${dosageReviewInsertError.message}`
      );
    }
  }

  if (unverifiedDoses.length) {
    const { error: unverifiedReviewInsertError } = await adminSupabase!
      .from(TABLES.reviewQueue)
      .insert({
        product_id: productId,
        review_type: REVIEW_TYPES.doseUnverified,
        payload: {
          items: unverifiedDoses,
          count: unverifiedDoses.length,
        },
        status: "pending",
      });

    if (unverifiedReviewInsertError) {
      throw new Error(
        `[supabase:${TABLES.reviewQueue}] ${unverifiedReviewInsertError.message}`
      );
    }
  }

  await refreshMissingSupplementSummaries(
    Array.from(
      new Set([
        ...previousNames,
        ...unresolvedRows.map((row) => row.normalized_name),
      ])
    )
  );

  return Array.from(
    new Set([
      ...previousNames,
      ...unresolvedRows.map((row) => row.normalized_name),
    ])
  );
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

function queueReviewCandidateRefresh(normalizedNames: string[]) {
  if (!supabaseUrl || !supabaseServiceRoleKey || !normalizedNames.length) {
    return;
  }

  const uniqueNames = Array.from(new Set(normalizedNames.filter(Boolean)));
  if (!uniqueNames.length) {
    return;
  }

  scheduleBackgroundTask(
    fetch(`${supabaseUrl}/functions/v1/${REVIEW_PROCESSOR_FUNCTION}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        normalizedNames: uniqueNames,
      }),
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Review refresh failed: ${response.status} ${await response.text()}`
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
    if (!adminSupabase) {
      return jsonResponse(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret." },
        500
      );
    }

    if (!openAiApiKey) {
      return jsonResponse(
        {
          error:
            "Missing OPENAI_API_KEY secret for scan-supplement-photos function.",
        },
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

    const validatedRequest = validateScanSupplementPhotosRequest(await req.text());
    if (!validatedRequest.ok) {
      return jsonResponse(validatedRequest.body, validatedRequest.status);
    }

    const {
      scanSessionId,
      barcode,
      barcodeType,
      ingredientsImage,
      productImage,
      currentProduct,
      requestedProductId,
    } = validatedRequest.value;
    const quotaAccess = await enforceEdgeFunctionQuota({
      adminSupabase,
      policyKey: "scan-supplement-photos",
      userId: authenticatedUser.user.id,
    });
    if (!quotaAccess.ok) {
      return jsonResponse(
        quotaAccess.body,
        quotaAccess.status,
        quotaAccess.headers
      );
    }

    const aiResult = await fetchOpenAiExtraction({
      scanSessionId: scanSessionId!,
      barcode,
      currentProduct,
      ingredientsImage,
      productImage,
    });

    const rawProductName =
      aiResult.productText.front_label_name ||
      currentProduct?.productName ||
      "Scanned supplement";
    const rawIngredientText =
      aiResult.productText.ingredient_panel_text ||
      currentProduct?.ingredientsText ||
      aiResult.productText.raw_text ||
      "";

    const productResolution = await resolveOrCreateProduct({
      requestedProductId,
      barcode,
      barcodeType,
      fallbackName: rawProductName,
      fallbackIngredients: rawIngredientText,
    });

    const processedAt = new Date().toISOString();
    const offProductName =
      rawProductName ||
      trimString(productResolution.product?.name) ||
      "Scanned supplement";
    const contentHash = await buildContentHash({
      barcode,
      barcodeType,
      name: offProductName,
      ingredients: rawIngredientText,
    });

    const { error: offProductsError } = await adminSupabase
      .from(TABLES.products)
      .upsert(
        {
          id: productResolution.productId,
          barcode,
          name: offProductName,
          ingredients: rawIngredientText,
        },
        {
          onConflict: "id",
        }
      );

    if (offProductsError) {
      throw new Error(
        `[supabase:${TABLES.products}] ${offProductsError.message}`
      );
    }

    const { error: classificationError } = await adminSupabase
      .from(TABLES.classification)
      .upsert(
        {
          product_id: productResolution.productId,
          barcode,
          name: offProductName,
          ingredients: rawIngredientText,
          content_hash: contentHash,
          excluded_by_sql: null,
          exclusion_reason: null,
          classification_model: openAiModel,
          classification_prompt_version: CLASSIFICATION_PROMPT_VERSION,
          is_supplement: aiResult.classification.is_supplement,
          supplement_confidence: aiResult.classification.confidence,
          supplement_category: aiResult.classification.category,
          should_extract: aiResult.classification.should_extract,
          classification_reason: aiResult.classification.reason,
          raw_ai_json: aiResult.classification,
          batch_id: null,
          processed_at: processedAt,
        },
        {
          onConflict: "product_id",
        }
      );

    if (classificationError) {
      throw new Error(
        `[supabase:${TABLES.classification}] ${classificationError.message}`
      );
    }

    if (!aiResult.classification.is_supplement) {
      return jsonResponse({
        productId: productResolution.productId,
        displayName: offProductName,
        productName: offProductName,
        createdProduct: productResolution.createdProduct,
        wroteCanonicalData: false,
        isSupplement: false,
        classificationConfidence: aiResult.classification.confidence,
        category: aiResult.classification.category,
        source: "photo_rescue_not_supplement",
        confidence: aiResult.classification.confidence,
        ingredients: [],
        rawText: aiResult.productText.raw_text,
        message:
          "We couldn't confirm from those photos that this product is a supplement.",
      });
    }

    const displayName =
      aiResult.naming.full_product_name ||
      aiResult.naming.product_name ||
      aiResult.naming.display_name ||
      rawProductName ||
      trimString(productResolution.product?.name) ||
      "Scanned supplement";

    const { error: extractionError } = await adminSupabase
      .from(TABLES.extraction)
      .upsert(
        {
          product_id: productResolution.productId,
          content_hash: contentHash,
          extraction_model: openAiModel,
          extraction_prompt_version: EXTRACTION_PROMPT_VERSION,
          extraction_status: "succeeded",
          serving_size_text: aiResult.extraction.serving_size_text,
          notes: aiResult.extraction.notes,
          raw_ai_json: aiResult.extraction,
          batch_id: null,
          processed_at: processedAt,
        },
        {
          onConflict: "product_id",
        }
      );

    if (extractionError) {
      throw new Error(
        `[supabase:${TABLES.extraction}] ${extractionError.message}`
      );
    }

    const { error: namingError } = await adminSupabase
      .from(TABLES.naming)
      .upsert(
        {
          product_id: productResolution.productId,
          content_hash: contentHash,
          naming_model: openAiModel,
          naming_prompt_version: NAMING_PROMPT_VERSION,
          batch_id: null,
          display_name: displayName,
          brand_name: aiResult.naming.brand_name,
          product_type: aiResult.naming.product_type,
          form_factor: aiResult.naming.form_factor,
          flavor: aiResult.naming.flavor,
          confidence: aiResult.naming.confidence,
          notes: aiResult.naming.notes,
          raw_ai_json: aiResult.naming,
          processed_at: processedAt,
        },
        {
          onConflict: "product_id",
        }
      );

    if (namingError) {
      throw new Error(`[supabase:${TABLES.naming}] ${namingError.message}`);
    }

    const [aliasRows, approvedSupplements] = await Promise.all([
      fetchAliasRows(),
      fetchApprovedSupplements(),
    ]);

    const aliasIndex = buildAliasIndex(aliasRows);
    const supplementNameIndex = buildSupplementNameIndex(approvedSupplements);
    const rawOcrText =
      aiResult.productText.ingredient_panel_text ||
      aiResult.productText.raw_text ||
      "";
    const resolvedIngredients = buildResolvedActiveIngredientRows({
      productId: productResolution.productId,
      ingredients: aiResult.extraction.ingredients_found,
      aliasIndex,
      supplementNameIndex,
      ocrText: rawOcrText,
    });

    if (!resolvedIngredients.activeRows.length) {
      return jsonResponse(
        {
          error:
            "We couldn't read any usable active supplement ingredients from those photos.",
        },
        422
      );
    }

    await replaceCanonicalRows({
      productId: productResolution.productId,
      barcode,
      rowsToInsert: resolvedIngredients.rows,
      masterRows: resolvedIngredients.activeRows,
      displayName,
      servingSizeText: aiResult.extraction.serving_size_text,
      namingConfidence: aiResult.naming.confidence,
    });

    const affectedReviewNames = await replaceReviewArtifacts({
      productId: productResolution.productId,
      unresolvedRows: resolvedIngredients.unresolvedRows,
      malformedDosages: resolvedIngredients.malformedDosages,
      unverifiedDoses: resolvedIngredients.unverifiedDoses,
    });

    if (affectedReviewNames.length) {
      queueReviewCandidateRefresh(affectedReviewNames);
    }

    return jsonResponse({
      productId: productResolution.productId,
      displayName,
      productName: displayName,
      createdProduct: productResolution.createdProduct,
      wroteCanonicalData: true,
      isSupplement: true,
      classificationConfidence: aiResult.classification.confidence,
      category: aiResult.classification.category,
      source: "photo_rescue_canonical",
      confidence:
        aiResult.naming.confidence || aiResult.classification.confidence,
      ingredients: buildMasterActiveIngredients(resolvedIngredients.activeRows),
      servingSizeText: aiResult.extraction.serving_size_text,
      rawText: aiResult.productText.raw_text,
      unresolvedIngredientCount: resolvedIngredients.unresolvedRows.length,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected scan-supplement-photos failure",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
