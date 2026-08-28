import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertActiveRevenueCatEntitlement,
  authenticateSupabaseUser,
} from "../_shared/revenuecat.ts";
import { enforceEdgeFunctionQuota } from "../_shared/quota.ts";
import { enqueueProductScoreRefresh } from "../_shared/product-score-refresh.ts";
import { validateScanSupplementPhotosRequest } from "../_shared/scan-supplement-photos-policy.js";
import {
  assessDoseVerificationRequirement,
  assessVerificationPersistenceGate,
  buildOcrLineIngredientCandidateGroups,
  buildOcrLineIngredientRowGroups,
  estimateTileBasedImageTokens,
  executeConditionalDoseVerification,
  getAcceptedImageDoseCorrectionEvidenceRows,
  getAcceptedImageVerifiedEvidenceRows,
  recoverImageVerifiedIngredients,
  recoverStructuredTableIngredients,
  selectPhotoExtractionStrategy,
  summarizeIngredientRowLifecycle,
  verifyDoseAgainstWrappedOcr,
} from "../_shared/photo-extraction-completeness.js";
import {
  assessPanelCropTokenSavings,
  buildOpenAiPanelCropDataUrl,
  buildTargetedJpegDataUrl,
  extractAzureVisualRowRegions,
  selectCompleteAzurePanelRegions,
  selectTargetedVisualRegions,
  selectVisualVerificationStrategy,
  shouldFallbackToFullVisualVerification,
} from "../_shared/targeted-visual-verification.js";
import {
  createLatencyTrace,
  getLatencyTraceHeaders,
  instrumentEdgeRequest,
} from "../../../src/lib/latencyTelemetry.js";

type LatencyTrace = ReturnType<typeof createLatencyTrace>;

declare const EdgeRuntime:
  | {
      waitUntil?: (promise: Promise<unknown>) => void;
    }
  | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trace-id, x-latency-flow, x-latency-action",
  "Access-Control-Expose-Headers":
    "x-trace-id, x-edge-duration-ms, server-timing",
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
const CLASSIFICATION_PROMPT_VERSION = "photo_rescue_classify_v2";
const EXTRACTION_PROMPT_VERSION = "photo_rescue_extract_v6";
const NAMING_PROMPT_VERSION = "photo_rescue_naming_v2";
const REVIEW_PROCESSOR_FUNCTION = "process-photo-rescue-reviews";

class PhotoVerificationUnresolvedError extends Error {
  constructor() {
    super("Photo verification could not resolve every questionable label row.");
    this.name = "PhotoVerificationUnresolvedError";
  }
}

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
          "Compact ingredient-panel excerpt, or empty when dedicated OCR is supplied.",
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
      ingredient_panel_complete: { type: "boolean" },
      visual_audit_complete: { type: "boolean" },
      visual_unresolved_region_count: { type: "integer", minimum: 0 },
      dose_verification_required: { type: "boolean" },
      dose_verification_reason: {
        type: "string",
        enum: [
          "none",
          "missing_dose",
          "ambiguous_dose",
          "incomplete_panel",
          "ocr_conflict",
          "possible_omitted_rows",
          "multiple_quantities",
          "serving_size_unclear",
          "other",
        ],
      },
      raw_text: {
        type: "string",
        description:
          "Compact relied-on text excerpt, or empty when dedicated OCR is supplied.",
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
            dose_confidence: {
              type: "string",
              enum: ["verified", "ambiguous", "missing"],
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
            "dose_confidence",
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
      "ingredient_panel_complete",
      "visual_audit_complete",
      "visual_unresolved_region_count",
      "dose_verification_required",
      "dose_verification_reason",
      "raw_text",
      "ingredients_found",
    ],
  },
};

const doseVerificationResponseSchema = {
  name: "photo_rescue_dose_verification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      verified_ingredients: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            index: { type: "integer" },
            raw_name: { type: "string" },
            canonical_name: { type: "string" },
            ingredient_type: {
              type: "string",
              enum: ["active", "inactive", "uncertain"],
            },
            dosage_value: { type: ["number", "null"] },
            dosage_unit: { type: ["string", "null"] },
            dosage_original_text: { type: ["string", "null"] },
            amount_basis: {
              type: ["string", "null"],
              enum: [...AMOUNT_BASIS_VALUES, null],
            },
          },
          required: [
            "index",
            "raw_name",
            "canonical_name",
            "ingredient_type",
            "dosage_value",
            "dosage_unit",
            "dosage_original_text",
            "amount_basis",
          ],
        },
      },
      missing_ingredients: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            raw_name: { type: "string" },
            canonical_name: { type: "string" },
            dosage_value: { type: "number" },
            dosage_unit: { type: "string" },
            dosage_original_text: { type: "string" },
            chemical_form: { type: ["string", "null"] },
            amount_basis: {
              type: "string",
              enum: AMOUNT_BASIS_VALUES,
            },
          },
          required: [
            "raw_name",
            "canonical_name",
            "dosage_value",
            "dosage_unit",
            "dosage_original_text",
            "chemical_form",
            "amount_basis",
          ],
        },
      },
      verification_scope_resolved: { type: "boolean" },
      serving_size_text: { type: ["string", "null"] },
    },
    required: [
      "verified_ingredients",
      "missing_ingredients",
      "verification_scope_resolved",
      "serving_size_text",
    ],
  },
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const internalServiceRoleKey = Deno.env.get("INTERNAL_SERVICE_ROLE_KEY");
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const azureDocumentIntelligenceEndpoint = Deno.env.get(
  "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
);
const azureDocumentIntelligenceKey = Deno.env.get(
  "AZURE_DOCUMENT_INTELLIGENCE_KEY",
);
const openAiModel =
  Deno.env.get("OPENAI_VISION_MODEL") ??
  Deno.env.get("OPENAI_MODEL") ??
  "gpt-4o-mini";
// Temporary kill switch. Set to true to restore the existing second-pass
// verifier, targeted-image preparation, fallback, and fail-closed gate.
const PHOTO_DOSE_VERIFICATION_ENABLED = false;
const AZURE_DOCUMENT_INTELLIGENCE_MODEL = "prebuilt-layout";
const AZURE_DOCUMENT_INTELLIGENCE_API_VERSION = "2024-11-30";
const AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS = 1000;
const AZURE_DOCUMENT_INTELLIGENCE_MAX_POLL_ATTEMPTS = 15;
const AZURE_OCR_LOW_CONFIDENCE_WORD_THRESHOLD = 0.85;
const AZURE_OCR_RELIABLE_AVERAGE_CONFIDENCE = 0.9;
const AZURE_OCR_RELIABLE_LOW_CONFIDENCE_FRACTION = 0.1;

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
  dose_confidence: "verified" | "ambiguous" | "missing" | null;
};

type AzureIngredientPanelOcr = {
  fullText: string;
  lines: string[];
  tableRows: string[];
  tableRowGroups: string[][];
  combinedText: string;
  promptText: string;
  promptTableCharacters: number;
  promptLineCharacters: number;
  promptFallbackCharacters: number;
  wordCount: number;
  averageWordConfidence: number | null;
  lowConfidenceWordCount: number;
  ocrCandidateGroups: AzureOcrCandidate[][];
  visualRowRegions: AzureVisualRowRegion[];
  panelCropPlan?: {
    completeCoverage: boolean;
    fallbackReason: string;
    regions: Array<Record<string, unknown>>;
  };
};

type AzureOcrCandidate = {
  candidateId: string;
  text: string;
  sourceKind: "table_row" | "ocr_line";
  geometryCandidateIds: string[];
  geometryRegions: Array<{
    pageNumber: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>;
  hasGeometry: boolean;
  mergedFromWrappedLines: boolean;
  sourceRefs: Array<{
    sourceKind: "table_row" | "ocr_line";
    tableIndex?: number;
    rowIndex: number;
    pageNumber?: number;
  }>;
};

type AzureVisualRowRegion = {
  candidateId: string;
  text: string;
  regionType: "table_row" | "ocr_line" | "serving_context";
  isServingContext: boolean;
  tableIndex: number;
  rowIndex: number;
  pageNumber: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
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
    ingredient_panel_complete: boolean;
    visual_audit_complete: boolean;
    visual_unresolved_region_count: number;
    dose_verification_required: boolean;
    dose_verification_reason: string;
  };
  productText: {
    front_label_name: string;
    ingredient_panel_text: string;
    raw_text: string;
  };
  rowLifecycle: {
    modelExtractedRowCount: number;
    initialModelIngredientTypes: Array<"active" | "inactive" | "uncertain">;
    deterministicallyRecoveredModelRowIndexes: number[];
    visuallyVerifiedRecoveredRowIndexes: number[];
    ocrLogicalCandidateCount: number;
    unmatchedOcrCandidateRowCount: number;
    ocrRows: Array<Record<string, unknown>>;
  };
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

function appendUniqueEvidenceRows(value: unknown, rows: string[]): string {
  const existingText = trimString(value);
  const existingKey = normalizeTextKey(existingText);
  const seenRows = new Set<string>();
  const additionalRows = rows.filter((row) => {
    const cleanRow = normalizeWhitespace(row);
    const rowKey = normalizeTextKey(cleanRow);
    if (!rowKey || seenRows.has(rowKey) || existingKey.includes(rowKey)) {
      return false;
    }
    seenRows.add(rowKey);
    return true;
  });

  return [existingText, ...additionalRows].filter(Boolean).join("\n").trim();
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

function extractBase64PayloadFromDataUrl(value: unknown): string {
  const dataUrl = sanitizeImageDataUrl(value);
  const separatorIndex = dataUrl.indexOf(",");
  return separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1).trim() : "";
}

function estimateImagePayloadBytes(value: unknown) {
  const base64Payload = extractBase64PayloadFromDataUrl(value);
  if (!base64Payload) return 0;
  const paddingLength = base64Payload.endsWith("==")
    ? 2
    : base64Payload.endsWith("=")
      ? 1
      : 0;
  return Math.max(
    0,
    Math.floor((base64Payload.length * 3) / 4) - paddingLength,
  );
}

function estimateTextTokens(value: unknown) {
  const characterCount =
    typeof value === "string" ? value.length : Number(value);
  return Number.isFinite(characterCount)
    ? Math.max(0, Math.ceil(characterCount / 4))
    : 0;
}

function decodeImagePrefix(value: unknown) {
  const base64Payload = extractBase64PayloadFromDataUrl(value);
  if (!base64Payload || typeof atob !== "function") return null;

  try {
    const prefixLength = Math.min(base64Payload.length, 87_380);
    const alignedPrefixLength = prefixLength - (prefixLength % 4);
    const decoded = atob(base64Payload.slice(0, alignedPrefixLength));
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function readImageDimensions(value: unknown) {
  const bytes = decodeImagePrefix(value);
  if (!bytes || bytes.length < 24) return null;

  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (isPng) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      return null;
    }
    if (startOfFrameMarkers.has(marker)) {
      return {
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
      };
    }
    offset += 2 + segmentLength;
  }

  return null;
}

function estimateTileImageTokens({
  image,
  detail,
  model,
}: {
  image: string;
  detail: string;
  model: string;
}) {
  const dimensions = detail === "high" ? readImageDimensions(image) : null;
  return estimateTileBasedImageTokens({
    width: dimensions?.width,
    height: dimensions?.height,
    detail,
    model,
  });
}

function getOpenAiUsageMetadata(
  completion: unknown,
  estimatedInputTokens?: number,
) {
  const usage = (completion as Record<string, unknown>)?.usage as
    | Record<string, unknown>
    | undefined;
  const promptTokens = Number(usage?.prompt_tokens);
  const completionTokens = Number(usage?.completion_tokens);
  const totalTokens = Number(usage?.total_tokens);

  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : undefined,
    promptTokenEstimateDelta:
      Number.isFinite(promptTokens) && Number.isFinite(estimatedInputTokens)
        ? promptTokens - Number(estimatedInputTokens)
        : undefined,
    completionTokens: Number.isFinite(completionTokens)
      ? completionTokens
      : undefined,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : undefined,
  };
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
  barcodeType?: string | null,
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
        new RegExp(
          `\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        ).test(normalized),
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
  if (
    [
      "mg ne",
      "milligram ne",
      "milligrams ne",
      "mg niacin equivalent",
      "mg niacin equivalents",
    ].includes(normalized)
  ) {
    return "mg";
  }
  if (normalized === "g") return "g";
  if (normalized === "ml") return "ml";
  if (normalized === "iu") return "IU";
  if (normalized === "cfu") return "CFU";
  return normalized;
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
}): {
  confidence: "verified" | "unverified" | "missing";
  reason: string | null;
} {
  return verifyDoseAgainstWrappedOcr({
    ingredientName,
    rawDosageValue,
    rawDosageUnit,
    dosageOriginalText,
    ocrText,
    normalizeIngredientName: normalizeBroadIngredientName,
  }) as {
    confidence: "verified" | "unverified" | "missing";
    reason: string | null;
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

  if (value === null || !Number.isFinite(value)) {
    return {
      value: null,
      unit,
      originalText: originalText || null,
      invalidReason: null,
    };
  }

  if (unit === "g") {
    const convertedValue = roundTo(value * 1000, 6);
    const malformedParentheticalOcr = /\b(?:las|fas|los)\b/iu.test(
      originalText,
    );
    if (Math.abs(convertedValue) >= 1_000_000 || malformedParentheticalOcr) {
      return {
        value: null,
        unit: null,
        originalText: originalText || null,
        invalidReason: "implausible_ocr_mass_magnitude",
      };
    }
    return {
      value: convertedValue,
      unit: "mg",
      originalText: originalText || null,
      invalidReason: null,
    };
  }

  if (unit === "mg" && Math.abs(value) >= 1_000_000) {
    return {
      value: null,
      unit: null,
      originalText: originalText || null,
      invalidReason: "implausible_mass_magnitude",
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

function normalizeAzureDocumentEndpoint(value: unknown) {
  return trimString(value).replace(/\/+$/, "");
}

function buildAzureDocumentIntelligenceHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": apiKey,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAzureTableRowGroups(tables: unknown): string[][] {
  if (!Array.isArray(tables)) {
    return [];
  }

  const rowGroups: string[][] = [];

  tables.forEach((table) => {
    const cells = Array.isArray((table as Record<string, unknown>)?.cells)
      ? (((table as Record<string, unknown>).cells as unknown[]) ?? [])
      : [];
    const rowMap = new Map<number, Map<number, string>>();

    cells.forEach((candidate) => {
      const cell = candidate as Record<string, unknown>;
      const rowIndex = parseIntegerLike(cell?.rowIndex);
      const columnIndex = parseIntegerLike(cell?.columnIndex);
      const content = normalizeWhitespace(cell?.content);

      if (rowIndex === null || columnIndex === null || !content) {
        return;
      }

      const nextRow = rowMap.get(rowIndex) ?? new Map<number, string>();
      const existing = nextRow.get(columnIndex);
      nextRow.set(
        columnIndex,
        existing ? `${existing} ${content}`.trim() : content,
      );
      rowMap.set(rowIndex, nextRow);
    });

    const rows = Array.from(rowMap.keys())
      .sort((a, b) => a - b)
      .map((rowIndex) => {
        const columns = rowMap.get(rowIndex);
        if (!columns) {
          return "";
        }

        const orderedValues = Array.from(columns.entries())
          .sort(([left], [right]) => left - right)
          .map(([, value]) => normalizeWhitespace(value));

        while (orderedValues.length && !orderedValues.at(-1)) {
          orderedValues.pop();
        }

        if (!orderedValues.some(Boolean)) {
          return "";
        }

        return orderedValues.join("\t");
      })
      .filter(Boolean);

    if (rows.length) {
      rowGroups.push(Array.from(new Set(rows)));
    }
  });

  return rowGroups;
}

function extractAzureTableCandidateGroups(
  tables: unknown,
  visualRowRegions: AzureVisualRowRegion[],
): AzureOcrCandidate[][] {
  if (!Array.isArray(tables)) return [];

  const geometryIds = new Set(
    visualRowRegions
      .filter((region) => region.regionType === "table_row")
      .map((region) => region.candidateId),
  );
  const geometryById = new Map(
    visualRowRegions.map((region) => [region.candidateId, region]),
  );
  const candidateGroups: AzureOcrCandidate[][] = [];

  tables.forEach((table, tableIndex) => {
    const cells = Array.isArray((table as Record<string, unknown>)?.cells)
      ? (((table as Record<string, unknown>).cells as unknown[]) ?? [])
      : [];
    const rowMap = new Map<number, Map<number, string>>();

    cells.forEach((candidate) => {
      const cell = candidate as Record<string, unknown>;
      const rowIndex = parseIntegerLike(cell?.rowIndex);
      const columnIndex = parseIntegerLike(cell?.columnIndex);
      const content = normalizeWhitespace(cell?.content);
      if (rowIndex === null || columnIndex === null || !content) return;

      const nextRow = rowMap.get(rowIndex) ?? new Map<number, string>();
      const existing = nextRow.get(columnIndex);
      nextRow.set(
        columnIndex,
        existing ? `${existing} ${content}`.trim() : content,
      );
      rowMap.set(rowIndex, nextRow);
    });

    const candidates: AzureOcrCandidate[] = Array.from(rowMap.keys())
      .sort((left, right) => left - right)
      .map((rowIndex) => {
        const columns = rowMap.get(rowIndex);
        if (!columns) return null;
        const text = Array.from(columns.entries())
          .sort(([left], [right]) => left - right)
          .map(([, content]) => normalizeWhitespace(content))
          .join("\t")
          .trim();
        if (!text) return null;
        const candidateId = `table:${tableIndex}:${rowIndex}`;
        const geometry = geometryById.get(candidateId);
        return {
          candidateId,
          text,
          sourceKind: "table_row" as const,
          geometryCandidateIds: [candidateId],
          geometryRegions: geometry
            ? [
                {
                  pageNumber: geometry.pageNumber,
                  left: geometry.left,
                  top: geometry.top,
                  right: geometry.right,
                  bottom: geometry.bottom,
                },
              ]
            : [],
          hasGeometry: geometryIds.has(candidateId),
          mergedFromWrappedLines: false,
          sourceRefs: [
            {
              sourceKind: "table_row" as const,
              tableIndex,
              rowIndex,
            },
          ],
        };
      })
      .filter((candidate) => candidate !== null);

    if (candidates.length) candidateGroups.push(candidates);
  });

  return candidateGroups;
}

function extractAzureLineCandidateGroups(
  value: unknown,
  visualRowRegions: AzureVisualRowRegion[],
): AzureOcrCandidate[][] {
  const row = (value ?? {}) as Record<string, unknown>;
  const analyzeResult =
    row?.analyzeResult && typeof row.analyzeResult === "object"
      ? (row.analyzeResult as Record<string, unknown>)
      : row;
  const pages = Array.isArray(analyzeResult?.pages)
    ? (analyzeResult.pages as unknown[])
    : [];
  const geometryIds = new Set(
    visualRowRegions
      .filter(
        (region) =>
          region.regionType === "ocr_line" ||
          region.regionType === "serving_context",
      )
      .map((region) => region.candidateId),
  );
  const geometryById = new Map(
    visualRowRegions.map((region) => [region.candidateId, region]),
  );

  return pages.flatMap((page, pageIndex) => {
    const pageRecord = page as Record<string, unknown>;
    const pageNumber = parseIntegerLike(pageRecord.pageNumber) ?? pageIndex + 1;
    const lines = Array.isArray(pageRecord.lines)
      ? (pageRecord.lines as unknown[])
      : [];
    const lineSources = lines.map((line, lineIndex) => {
      const candidateId = `line:${pageNumber}:${lineIndex}`;
      const geometry = geometryById.get(candidateId);
      return {
        candidateId,
        text: normalizeWhitespace((line as Record<string, unknown>)?.content),
        geometryCandidateIds: [candidateId],
        geometryRegions: geometry
          ? [
              {
                pageNumber: geometry.pageNumber,
                left: geometry.left,
                top: geometry.top,
                right: geometry.right,
                bottom: geometry.bottom,
              },
            ]
          : [],
        hasGeometry: geometryIds.has(candidateId),
        sourceRefs: [
          {
            sourceKind: "ocr_line" as const,
            rowIndex: lineIndex,
            pageNumber,
          },
        ],
      };
    });
    return buildOcrLineIngredientCandidateGroups(
      lineSources,
    ) as AzureOcrCandidate[][];
  });
}

function extractAzureOcrCandidateGroups(
  value: unknown,
  visualRowRegions: AzureVisualRowRegion[],
): AzureOcrCandidate[][] {
  const row = (value ?? {}) as Record<string, unknown>;
  const analyzeResult =
    row?.analyzeResult && typeof row.analyzeResult === "object"
      ? (row.analyzeResult as Record<string, unknown>)
      : row;
  return [
    ...extractAzureTableCandidateGroups(
      analyzeResult?.tables,
      visualRowRegions,
    ),
    ...extractAzureLineCandidateGroups(value, visualRowRegions),
  ];
}

function extractAzureTableRows(tables: unknown): string[] {
  return Array.from(new Set(extractAzureTableRowGroups(tables).flat()));
}

function normalizeAzureIngredientPanelOcr(
  value: unknown,
): AzureIngredientPanelOcr | null {
  const row = (value ?? {}) as Record<string, unknown>;
  const analyzeResult =
    row?.analyzeResult && typeof row.analyzeResult === "object"
      ? (row.analyzeResult as Record<string, unknown>)
      : row;

  const pages = Array.isArray(analyzeResult?.pages)
    ? (analyzeResult.pages as unknown[])
    : [];
  const wordConfidences = pages
    .flatMap((page) =>
      Array.isArray((page as Record<string, unknown>)?.words)
        ? (((page as Record<string, unknown>).words as unknown[]) ?? [])
        : [],
    )
    .map((word) => Number((word as Record<string, unknown>)?.confidence))
    .filter((confidence) => Number.isFinite(confidence));
  const averageWordConfidence = wordConfidences.length
    ? wordConfidences.reduce((sum, confidence) => sum + confidence, 0) /
      wordConfidences.length
    : null;
  const lowConfidenceWordCount = wordConfidences.filter(
    (confidence) => confidence < AZURE_OCR_LOW_CONFIDENCE_WORD_THRESHOLD,
  ).length;
  const lines = Array.from(
    new Set(
      pages
        .flatMap((page) =>
          Array.isArray((page as Record<string, unknown>)?.lines)
            ? (((page as Record<string, unknown>).lines as unknown[]) ?? [])
            : [],
        )
        .map((line) =>
          normalizeWhitespace((line as Record<string, unknown>)?.content),
        )
        .filter(Boolean),
    ),
  );
  const tableRowGroups = extractAzureTableRowGroups(analyzeResult?.tables);
  const tableRows = Array.from(new Set(tableRowGroups.flat()));
  const fullText = trimString(analyzeResult?.content);
  const tableRowKeys = new Set(tableRows.map(normalizeTextKey));
  const additionalLines = lines.filter(
    (line) => !tableRowKeys.has(normalizeTextKey(line)),
  );
  const promptText = [
    tableRows.length ? ["Table rows (TSV):", ...tableRows].join("\n") : "",
    additionalLines.length
      ? ["Additional OCR lines:", ...additionalLines].join("\n")
      : "",
    !tableRows.length && !additionalLines.length && fullText
      ? `OCR text:\n${fullText}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const promptTableCharacters = tableRows.length
    ? ["Table rows (TSV):", ...tableRows].join("\n").length
    : 0;
  const promptLineCharacters = additionalLines.length
    ? ["Additional OCR lines:", ...additionalLines].join("\n").length
    : 0;
  const promptFallbackCharacters =
    !tableRows.length && !additionalLines.length && fullText
      ? `OCR text:\n${fullText}`.length
      : 0;

  const combinedText = [
    tableRows.length ? ["Table rows (TSV):", ...tableRows].join("\n") : "",
    lines.length ? ["OCR lines:", ...lines].join("\n") : "",
    fullText ? `Full OCR text:\n${fullText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!combinedText) {
    return null;
  }

  return {
    fullText,
    lines,
    tableRows,
    tableRowGroups,
    combinedText,
    promptText,
    promptTableCharacters,
    promptLineCharacters,
    promptFallbackCharacters,
    wordCount: wordConfidences.length,
    averageWordConfidence,
    lowConfidenceWordCount,
    ocrCandidateGroups: [],
    visualRowRegions: [],
  };
}

function isReliableIngredientPanelOcr(
  ingredientsOcr: AzureIngredientPanelOcr | null,
) {
  if (
    !ingredientsOcr?.combinedText ||
    !ingredientsOcr.tableRowGroups.length ||
    !ingredientsOcr.wordCount ||
    !Number.isFinite(ingredientsOcr.averageWordConfidence)
  ) {
    return false;
  }

  return (
    ingredientsOcr.averageWordConfidence! >=
      AZURE_OCR_RELIABLE_AVERAGE_CONFIDENCE &&
    ingredientsOcr.lowConfidenceWordCount / ingredientsOcr.wordCount <=
      AZURE_OCR_RELIABLE_LOW_CONFIDENCE_FRACTION
  );
}

async function fetchAzureIngredientPanelOcr(
  ingredientsImage: string,
  telemetry?: LatencyTrace,
) {
  const endpoint = normalizeAzureDocumentEndpoint(
    azureDocumentIntelligenceEndpoint,
  );
  const apiKey = trimString(azureDocumentIntelligenceKey);
  const base64Source = extractBase64PayloadFromDataUrl(ingredientsImage);

  if (!endpoint || !apiKey || !base64Source) {
    return null;
  }

  const analyzeUrl =
    `${endpoint}/documentintelligence/documentModels/` +
    `${AZURE_DOCUMENT_INTELLIGENCE_MODEL}:analyze` +
    `?api-version=${AZURE_DOCUMENT_INTELLIGENCE_API_VERSION}`;
  const finishSubmission = telemetry?.start("azure_ocr_submission", {
    provider: "azure_document_intelligence",
  });
  let analyzeResponse: Response;
  try {
    analyzeResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: buildAzureDocumentIntelligenceHeaders(apiKey),
      body: JSON.stringify({
        base64Source,
      }),
    });
    finishSubmission?.({
      httpStatus: analyzeResponse.status,
      success: analyzeResponse.ok,
    });
  } catch (error) {
    finishSubmission?.({ success: false, error });
    throw error;
  }

  if (!analyzeResponse.ok) {
    const errorText = await analyzeResponse.text();
    throw new Error(
      `Azure OCR analyze request failed: ${errorText.slice(0, 500)}`,
    );
  }

  const operationLocation =
    analyzeResponse.headers.get("Operation-Location") ??
    analyzeResponse.headers.get("operation-location");

  if (!operationLocation) {
    throw new Error("Azure OCR response missing Operation-Location header.");
  }

  for (
    let attempt = 0;
    attempt < AZURE_DOCUMENT_INTELLIGENCE_MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    if (attempt > 0) {
      await sleep(AZURE_DOCUMENT_INTELLIGENCE_POLL_INTERVAL_MS);
    }

    const finishPoll = telemetry?.start("azure_ocr_poll", {
      attempt: attempt + 1,
      provider: "azure_document_intelligence",
    });
    let resultResponse: Response;
    try {
      resultResponse = await fetch(operationLocation, {
        method: "GET",
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey,
        },
      });
      finishPoll?.({
        httpStatus: resultResponse.status,
        success: resultResponse.ok,
      });
    } catch (error) {
      finishPoll?.({ success: false, error });
      throw error;
    }

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      throw new Error(
        `Azure OCR result request failed: ${errorText.slice(0, 500)}`,
      );
    }

    const result = await resultResponse.json();
    const status = trimString(
      (result as Record<string, unknown>)?.status,
    ).toLowerCase();

    if (status === "succeeded") {
      const normalized = normalizeAzureIngredientPanelOcr(result);
      if (!normalized) return null;
      const visualRowRegions = extractAzureVisualRowRegions(
        result,
      ) as AzureVisualRowRegion[];
      let panelCropPlan;
      try {
        panelCropPlan = selectCompleteAzurePanelRegions(result);
      } catch {
        panelCropPlan = {
          completeCoverage: false,
          fallbackReason: "panel_geometry_evaluation_failed",
          regions: [],
        };
      }
      return {
        ...normalized,
        ocrCandidateGroups: extractAzureOcrCandidateGroups(
          result,
          visualRowRegions,
        ),
        visualRowRegions,
        panelCropPlan,
      };
    }

    if (status === "failed" || status === "cancelled") {
      throw new Error(`Azure OCR analysis ended with status '${status}'.`);
    }
  }

  throw new Error("Azure OCR analysis timed out.");
}

async function tryFetchAzureIngredientPanelOcr(
  ingredientsImage: string,
  telemetry?: LatencyTrace,
) {
  const finish = telemetry?.start("azure_ocr_total", {
    provider: "azure_document_intelligence",
  });
  try {
    const result = await fetchAzureIngredientPanelOcr(
      ingredientsImage,
      telemetry,
    );
    finish?.({ found: Boolean(result), success: true });
    return result;
  } catch (error) {
    finish?.({ success: false, error });
    return null;
  }
}

function normalizeIngredient(item: unknown): NormalizedIngredient {
  const ingredient = item as Record<string, unknown>;
  const amountBasis = trimString(ingredient?.amount_basis);
  const doseConfidence = trimString(ingredient?.dose_confidence);

  return {
    raw_name: cleanIngredientText(ingredient?.raw_name),
    canonical_name: cleanIngredientText(ingredient?.canonical_name),
    ingredient_type: ["active", "inactive", "uncertain"].includes(
      trimString(ingredient?.ingredient_type),
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
    dose_confidence: ["verified", "ambiguous", "missing"].includes(
      doseConfidence,
    )
      ? (doseConfidence as "verified" | "ambiguous" | "missing")
      : null,
  };
}

function normalizePhotoRescueOutput(
  value: unknown,
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
      ingredient_panel_complete: row.ingredient_panel_complete === true,
      visual_audit_complete: row.visual_audit_complete === true,
      visual_unresolved_region_count:
        Number.isInteger(row.visual_unresolved_region_count) &&
        Number(row.visual_unresolved_region_count) >= 0
          ? Number(row.visual_unresolved_region_count)
          : 0,
      dose_verification_required: row.dose_verification_required !== false,
      dose_verification_reason:
        normalizeWhitespace(row.dose_verification_reason) || "other",
    },
    productText: {
      front_label_name: normalizeWhitespace(row.front_label_name),
      ingredient_panel_text: normalizeWhitespace(row.ingredient_panel_text),
      raw_text: normalizeWhitespace(row.raw_text),
    },
    rowLifecycle: {
      modelExtractedRowCount: ingredients.length,
      initialModelIngredientTypes: ingredients.map(
        (ingredient) => ingredient.ingredient_type,
      ),
      deterministicallyRecoveredModelRowIndexes: [],
      visuallyVerifiedRecoveredRowIndexes: [],
      ocrLogicalCandidateCount: 0,
      unmatchedOcrCandidateRowCount: 0,
      ocrRows: [],
    },
  };
}

function buildSystemPrompt({
  hasDedicatedOcr,
  hasIngredientImage,
}: {
  hasDedicatedOcr?: boolean;
  hasIngredientImage?: boolean;
} = {}) {
  return [
    "You classify whether the photographed product is a dietary supplement, normalize its product name, and extract structured supplement ingredients.",
    "Use only the photographed label images as the source of truth.",
    "Return valid JSON that exactly matches the provided schema.",
    "If the product is not clearly a dietary supplement, set is_supplement false.",
    "For supplement naming, produce a concise user-facing display name.",
    "Prefer full_product_name for display_name when both brand and product are visible.",
    "Extract brand_name and product_name separately whenever the front label supports it.",
    "If the front label reads like '<Brand> <Product>', split the first part into brand_name and the remainder into product_name when that split is visually supported.",
    "For extraction, keep only active supplement ingredients where possible.",
    "Internally reconstruct any visible supplement facts or nutrition table row-by-row before producing ingredients_found. Do not output that reconstruction.",
    "Before returning, perform an internal verification pass: account for every visible active row, confirm each dose against its same-row evidence, and check serving-size interpretation.",
    hasIngredientImage
      ? "After drafting the extraction, perform a separate visual audit of the ingredient-panel image: scan the panel row-by-row independently of the OCR, reconcile every supplied OCR table candidate, re-read every questionable dose from its visible row, and check for active rows absent from OCR before setting completeness fields."
      : "",
    "Use a dose-extraction hierarchy: structured table first, inline ingredient doses second, ingredient names without doses last.",
    "If a structured table exists, treat it as the primary source of truth and extract every row with an explicit numeric dose.",
    hasDedicatedOcr
      ? hasIngredientImage
        ? "Dedicated OCR text and table rows are provided as the PRIMARY ingredient source. Also compare questionable rows with the ingredient-panel image to resolve OCR corruption or missing content."
        : "Dedicated high-confidence OCR text and table rows are provided as the PRIMARY and only ingredient-panel input. Resolve only obvious OCR corruption from row context; otherwise mark the row ambiguous and request dose verification."
      : "",
    hasDedicatedOcr
      ? "Do not repeat the supplied OCR in ingredient_panel_text or raw_text; return those two fields as empty strings because the server preserves the canonical OCR after extraction. Keep all reason and notes fields concise."
      : "",
    "If multiple sections exist, merge them without duplicating ingredients and prefer entries with explicit numeric doses over undosed mentions.",
    "Extract doses only from text visibly present on the label. Never infer, estimate, or substitute common or typical supplement doses.",
    "A dosage is valid only when the raw evidence text contains both the ingredient name and the dose in the same clearly readable row or inline phrase.",
    "Never borrow numbers from nearby rows, adjacent columns, headers, footnotes, % NRV, % DV, RI, target ranges, app labels, or surrounding text.",
    "Ignore % NRV, % DV, RI, and similar reference-intake columns for dosage extraction.",
    "If a label gives a compound/form dose plus an active/equivalent amount, such as 'Creatine monohydrate 3g of which creatine 2.6g', return ONE row only: canonical_name 'Creatine', dosage_value 2.6, dosage_unit 'g', chemical_form 'Creatine monohydrate'. Do not also return Creatine monohydrate 3g as a separate active ingredient.",
    "Apply the same rule to wording like 'providing', 'equivalent to', 'yielding', 'of which', or 'elemental'. Prefer the actual active/equivalent amount for dosage_value.",
    "Rows from structured tables should normally map to active ingredients with dosage_value, dosage_unit, and amount_basis 'per_serving' unless the label clearly states another basis.",
    "Use explicit serving-size wording such as 'per 2 capsules' to select the amount basis; never multiply or divide a printed dose unless the label explicitly requires it.",
    "For a proprietary blend, never assign the total blend weight to individual ingredients that do not have their own printed doses.",
    "Mark excipients, fillers, capsule materials, sweeteners, preservatives, and colors as inactive.",
    "Do not mark a row inactive merely because its ingredient name, form, or dose is unfamiliar. A row inside a supplement-facts or explicitly active-ingredients table should be active when the label presents it as a dosed supplement ingredient, or uncertain when that role is genuinely unclear. Use inactive only when the label context supports an excipient or other non-active role.",
    "Do not invent missing dosages.",
    "For each ingredient, dosage_original_text must contain the exact raw row or phrase used as evidence, not just the dose.",
    "If a dosage is valid, the dosage_original_text evidence must contain both the ingredient name and the dose.",
    "If the number or unit is uncertain, or the ingredient name and dose are not clearly readable together, set dosage_value and dosage_unit to null and explain the uncertainty in dosage_original_text using the exact raw row or phrase.",
    "Return broad canonical names such as Vitamin D, Magnesium, Zinc.",
    "Put specific salt or form into chemical_form.",
    "If dosage is ambiguous, set numeric dosage to null.",
    "Set dose_confidence to verified only when the exact evidence row supports the ingredient and dose; otherwise use ambiguous or missing.",
    "Set ingredient_panel_complete true only when every visible active row is represented in ingredients_found.",
    "Set visual_audit_complete true only after the separate image-based audit has inspected every visible ingredient-table row or region, even if a bounded number remain unreadable. Set it false if any part of the panel is cut off, uninspected, or globally unreadable.",
    "Set visual_unresolved_region_count to the number of visible active rows or bounded table regions that the visual audit still cannot confidently reconcile with ingredients_found. Use 0 only when the audit found no unresolved region.",
    "Set dose_verification_required true whenever a row is missing, ambiguous, conflicts with OCR, may have been omitted, contains multiple quantities, or the serving-size basis is unclear.",
    "Set dose_verification_reason to the single best matching reason; use none only when the full panel and every dose are complete and verified.",
    "Use the front label for product naming and the back panel for ingredient extraction.",
  ].join(" ");
}

function buildUserPrompt({
  currentProduct,
  ingredientsOcr,
  includesIngredientsImage,
}: {
  currentProduct: CurrentProductContext;
  ingredientsOcr?: AzureIngredientPanelOcr | null;
  includesIngredientsImage: boolean;
}) {
  const existingProductContext = currentProduct?.productName
    ? { existingProductName: currentProduct.productName }
    : null;
  const contextText = JSON.stringify(existingProductContext);
  const ocrPromptText = ingredientsOcr?.promptText || "";
  const instructionText = [
    "Process this supplement label input and return the exact response schema.",
    includesIngredientsImage
      ? "Image order: 1) ingredient panel / supplement facts at high detail; 2) front label at low detail."
      : "The only image is the front label at low detail. The ingredient panel is supplied as high-confidence dedicated OCR below; use that OCR as the primary and only ingredient-panel input.",
    "Classify the product, derive naming fields from the front label, and extract every active ingredient row and its same-row printed dose.",
    "Use the existing product name only as a fallback naming hint. Never use existing product data to invent or override photographed ingredients.",
    "Set ingredient_panel_complete and all dose verification fields conservatively. Any missing, ambiguous, conflicting, multi-quantity, or unclear-serving row must request verification.",
    `Existing product naming context: ${contextText}`,
  ].join("\n");
  const ocrSection = ocrPromptText
    ? [
        "Dedicated Azure OCR for the ingredient panel (primary ingredient/dose evidence):",
        ocrPromptText,
      ].join("\n\n")
    : "";

  return {
    text: [instructionText, ocrSection].filter(Boolean).join("\n\n").trim(),
    contextCharacters: contextText.length,
    instructionCharacters: instructionText.length - contextText.length,
    ocrCharacters: ocrPromptText.length,
  };
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
    ].join("|"),
  );
}

function buildDoseVerificationPrompt({
  ingredients,
  rowIndexes,
  servingSizeText,
  unmatchedOcrRows,
  visualVerificationMode,
}: {
  ingredients: NormalizedIngredient[];
  rowIndexes: number[];
  servingSizeText: string | null;
  unmatchedOcrRows: string[];
  visualVerificationMode: string;
}) {
  const requestedIndexes = new Set(rowIndexes);
  const indexedIngredients = ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(({ index }) => requestedIndexes.has(index))
    .map(({ ingredient, index }) => ({
      index,
      raw_name: ingredient.raw_name,
      canonical_name: ingredient.canonical_name,
      ingredient_type: ingredient.ingredient_type,
      dosage_value: ingredient.dosage_value,
      dosage_unit: ingredient.dosage_unit,
      dosage_original_text: ingredient.dosage_original_text,
      amount_basis: ingredient.amount_basis,
    }));
  const knownIngredientNames = ingredients
    .map((ingredient) => ingredient.canonical_name || ingredient.raw_name)
    .filter(Boolean);
  const targetedRegionInstructions =
    visualVerificationMode === "targeted_crop"
      ? [
          "The attached image is a targeted crop created from Azure table bounding polygons. It contains every requested unresolved row, adjacent-row context, and any table rows lying between those bounded regions.",
          "When dose basis requires it, the crop also contains the located serving-size or table-header context.",
          "Resolve only the supplied questionable rows and unmatched OCR candidates. Do not infer anything about panel regions that are not shown.",
        ].join(" ")
      : "The attached image is the complete ingredient-panel photograph.";

  return `
You are verifying previously extracted supplement ingredient doses against the attached ingredient-panel image.

You will receive the questionable indexed rows from a first extraction pass, plus all known ingredient names.
Your task is to inspect the image directly, return the best visible dose and amount basis for each supplied index, verify the serving size, and report any clearly visible active supplement rows omitted from the known list.
${targetedRegionInstructions}

Rules:
- Preserve the supplied indexes exactly as given and return verification entries only for those indexes.
- Return raw_name and canonical_name for every supplied index. Preserve them unless the visible row clearly proves that the first pass confused a nutrient with its chemical form (for example, Iodine shown as "Iodine (as Potassium Iodide)").
- canonical_name must identify the labelled nutrient; raw_name may retain the visible parenthetical form.
- A row currently marked inactive may have been misclassified by the text-only extraction. Mark it active only when the photographed facts/active-ingredient table clearly presents it as a supplement ingredient rather than an excipient, filler, capsule material, sweetener, preservative, color, direction, warning, or ordinary nutrition metadata.
- Keep an active row active. Do not remove an active ingredient during dose verification.
- Check each ingredient-dose pair against the visible nutrition table or ingredient row for that ingredient.
- Use only the visible row containing that ingredient name.
- Do not use typical supplement doses, prior knowledge, or inferred values.
- Do not borrow values from neighbouring rows, % NRV, % DV, headers, footnotes, or UI text.
- Correct likely OCR errors when clearly supported by the visible row, including:
  - lost decimal point: 0.5mg vs 5mg, 1.5mg vs 15mg
  - lost zero: 500mg vs 50mg, 50µg vs 5µg
  - added digit: 30mg vs 130mg
  - wrong nearby row: 40mg vs 30mg, 10µg vs 50µg
- If the visible row clearly supports a better dose, return the corrected dosage_value, dosage_unit, and dosage_original_text.
- If the row is uncertain or unreadable, keep the original extracted dose unchanged rather than returning null.
- Put an omitted row in missing_ingredients only when its ingredient name and one unambiguous numeric dose are clearly visible together on the image.
- For every missing ingredient, dosage_original_text must reproduce the complete visible row containing both its name and dose.
- Compare names conceptually so aliases, forms, or abbreviations already represented in the indexed list are not returned again.
- Do not return table headers, serving instructions, excipients, or general nutrition rows unless the label explicitly presents them as active supplement ingredients.
- If a missing row contains multiple distinct compound/equivalent doses or its row association is uncertain, omit it rather than choosing a value.
- Return an empty missing_ingredients array when no additional row meets these rules.
- Set verification_scope_resolved true only when every supplied questionable row and unmatched OCR candidate is readable enough to resolve conservatively. Set it false if any target remains unreadable or ambiguous.
- Return the visible serving-size wording such as "Each capsule" or "per 2 tablets" when clear; otherwise preserve the supplied serving size or return null.

Return only JSON matching the schema.

Current serving size:
${JSON.stringify(servingSizeText)}

All known ingredient names:
${JSON.stringify(knownIngredientNames)}

Questionable indexed ingredients:
${JSON.stringify(indexedIngredients)}

Unmatched OCR candidate rows requiring visual classification:
${JSON.stringify(unmatchedOcrRows)}
  `.trim();
}

async function verifyOpenAiExtractedDoses({
  ingredientsImage,
  ingredients,
  rowIndexes,
  servingSizeText,
  verificationReason,
  unmatchedOcrRows = [],
  visualVerificationMode = "full_image",
  firstExtractionUsedHighDetailIngredientVision = false,
  estimatedFullVerificationImageTokens,
  estimatedVerificationImageTokens,
  targetRegionCount = 0,
  verificationTriggers = {},
  telemetry,
}: {
  ingredientsImage: string;
  ingredients: NormalizedIngredient[];
  rowIndexes: number[];
  servingSizeText: string | null;
  verificationReason: string;
  unmatchedOcrRows?: string[];
  visualVerificationMode?: string;
  firstExtractionUsedHighDetailIngredientVision?: boolean;
  estimatedFullVerificationImageTokens?: number;
  estimatedVerificationImageTokens?: number;
  targetRegionCount?: number;
  verificationTriggers?: {
    lowRecognitionConfidence?: boolean;
    unmatchedCandidates?: boolean;
    omittedRowRisk?: boolean;
    doseMismatch?: boolean;
  };
  telemetry?: LatencyTrace;
}) {
  const verificationPrompt = buildDoseVerificationPrompt({
    ingredients,
    rowIndexes,
    servingSizeText,
    unmatchedOcrRows,
    visualVerificationMode,
  });
  const estimatedImageTokensAvoided =
    Number.isFinite(estimatedFullVerificationImageTokens) &&
    Number.isFinite(estimatedVerificationImageTokens)
      ? Math.max(
          0,
          Number(estimatedFullVerificationImageTokens) -
            Number(estimatedVerificationImageTokens),
        )
      : undefined;
  const finish = telemetry?.start("openai_dose_verification_call", {
    estimatedFullVerificationImageTokens,
    estimatedImageTokensAvoided,
    estimatedVerificationImageTokens,
    initialHighDetailVisualAudit: firstExtractionUsedHighDetailIngredientVision,
    inputMode:
      visualVerificationMode === "targeted_crop"
        ? "targeted_ingredient_regions_and_questionable_rows"
        : "ingredient_image_and_questionable_rows",
    inputTextCharacters: verificationPrompt.length,
    model: openAiModel,
    provider: "openai",
    verificationReason,
    verificationRequired: true,
    verificationReusedFullVisualInput:
      visualVerificationMode !== "targeted_crop",
    verificationRowCount: rowIndexes.length,
    verificationRowIndexes: rowIndexes,
    verificationScope: visualVerificationMode,
    verificationTriggerDoseMismatch: verificationTriggers.doseMismatch === true,
    verificationTriggerLowRecognitionConfidence:
      verificationTriggers.lowRecognitionConfidence === true,
    verificationTriggerOmittedRowRisk:
      verificationTriggers.omittedRowRisk === true,
    verificationTriggerUnmatchedCandidates:
      verificationTriggers.unmatchedCandidates === true,
    targetedVisualRegionCount: targetRegionCount,
    unresolvedCandidateCount: unmatchedOcrRows.length,
    visualInputCount: 1,
    visualPayloadBytes: estimateImagePayloadBytes(ingredientsImage),
  });
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: buildOpenAiHeaders(openAiApiKey || ""),
      body: JSON.stringify({
        model: openAiModel,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: doseVerificationResponseSchema,
        },
        messages: [
          {
            role: "system",
            content:
              "You verify supplement ingredient identities and doses from a single ingredient-panel image. Correct only obvious errors supported by the visible row. If any supplied uncertainty remains, set verification_scope_resolved false.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: verificationPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: ingredientsImage,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    finish?.({ resultStatus: "request_failed", success: false, error });
    throw error;
  }

  if (!response.ok) {
    finish?.({
      httpStatus: response.status,
      resultStatus: "request_rejected",
      success: false,
    });
    const errorText = await response.text();
    throw new Error(
      `OpenAI dose verification failed: ${errorText.slice(0, 500)}`,
    );
  }

  let completion;
  try {
    completion = await response.json();
  } catch (error) {
    finish?.({
      httpStatus: response.status,
      resultStatus: "invalid_response",
      success: false,
      error,
    });
    throw error;
  }
  const content = extractCompletionContent(
    completion?.choices?.[0]?.message?.content,
  );

  if (!content) {
    finish?.({
      ...getOpenAiUsageMetadata(completion),
      httpStatus: response.status,
      resultStatus: "empty_response",
      success: false,
      errorCategory: "invalid_response",
    });
    throw new Error("OpenAI returned empty dose verification content.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    finish?.({
      ...getOpenAiUsageMetadata(completion),
      httpStatus: response.status,
      resultStatus: "invalid_response",
      success: false,
      error,
    });
    throw new Error("Could not parse OpenAI dose verification JSON response.");
  }

  finish?.({
    ...getOpenAiUsageMetadata(completion),
    httpStatus: response.status,
    resultStatus: "completed",
    success: true,
    targetedScopeResolved: parsed?.verification_scope_resolved === true,
  });

  return {
    corrections: Array.isArray(parsed?.verified_ingredients)
      ? parsed.verified_ingredients
      : [],
    missingIngredients: Array.isArray(parsed?.missing_ingredients)
      ? parsed.missing_ingredients.map((ingredient: unknown) =>
          normalizeIngredient({
            ...(ingredient as Record<string, unknown>),
            ingredient_type: "active",
          }),
        )
      : [],
    scopeResolved: parsed?.verification_scope_resolved === true,
    servingSizeText: normalizeWhitespace(parsed?.serving_size_text) || null,
  };
}

function mergeDoseCorrections(
  ingredients: NormalizedIngredient[],
  corrections: unknown[],
  reclassifiableIndexes: number[] = [],
) {
  const allowedReclassificationIndexes = new Set(reclassifiableIndexes);
  const correctionsByIndex = new Map<
    number,
    {
      raw_name: string | null;
      canonical_name: string | null;
      ingredient_type: "active" | "inactive" | "uncertain" | null;
      dosage_value: number | null;
      dosage_unit: string | null;
      dosage_original_text: string | null;
      amount_basis: string | null;
    }
  >();

  corrections.forEach((candidate) => {
    const row = candidate as Record<string, unknown>;
    const index =
      typeof row?.index === "number" && Number.isInteger(row.index)
        ? row.index
        : null;

    if (index === null || index < 0 || index >= ingredients.length) {
      return;
    }

    correctionsByIndex.set(index, {
      raw_name: trimString(row?.raw_name) || null,
      canonical_name: trimString(row?.canonical_name) || null,
      ingredient_type: ["active", "inactive", "uncertain"].includes(
        trimString(row?.ingredient_type),
      )
        ? (trimString(row?.ingredient_type) as
            | "active"
            | "inactive"
            | "uncertain")
        : null,
      dosage_value: parseOptionalNumber(row?.dosage_value),
      dosage_unit: trimString(row?.dosage_unit) || null,
      dosage_original_text: trimString(row?.dosage_original_text) || null,
      amount_basis: AMOUNT_BASIS_VALUES.includes(
        trimString(row?.amount_basis) as never,
      )
        ? trimString(row?.amount_basis)
        : null,
    });
  });

  return ingredients.map((ingredient, index) => {
    const correction = correctionsByIndex.get(index);
    if (!correction) {
      return ingredient;
    }

    const nextValue = correction.dosage_value;
    const nextUnit = correction.dosage_unit;
    const hasVerifiedDose = Number.isFinite(nextValue) && Boolean(nextUnit);
    const hasExistingDose =
      Number.isFinite(ingredient.dosage_value) &&
      Boolean(ingredient.dosage_unit);
    const verifiedIngredientType =
      ingredient.ingredient_type === "inactive" &&
      allowedReclassificationIndexes.has(index) &&
      correction.ingredient_type === "active"
        ? "active"
        : ingredient.ingredient_type;
    const ingredientWithVerifiedBasis = {
      ...ingredient,
      ...(correction.raw_name ? { raw_name: correction.raw_name } : {}),
      ...(correction.canonical_name
        ? { canonical_name: correction.canonical_name }
        : {}),
      ingredient_type: verifiedIngredientType,
      ...(correction.amount_basis
        ? { amount_basis: correction.amount_basis }
        : {}),
    };

    if (!hasVerifiedDose && hasExistingDose) {
      return ingredientWithVerifiedBasis;
    }

    if (!hasVerifiedDose && !hasExistingDose) {
      return {
        ...ingredientWithVerifiedBasis,
        dosage_original_text:
          correction.dosage_original_text || ingredient.dosage_original_text,
      };
    }

    return {
      ...ingredientWithVerifiedBasis,
      dosage_value: nextValue,
      dosage_unit: nextUnit,
      dosage_original_text:
        correction.dosage_original_text || ingredient.dosage_original_text,
    };
  });
}

function findNewlyRecoveredDoseIndexes(
  before: NormalizedIngredient[],
  after: NormalizedIngredient[],
  modelExtractedRowCount: number,
) {
  const limit = Math.min(before.length, after.length, modelExtractedRowCount);
  const recoveredIndexes: number[] = [];
  for (let index = 0; index < limit; index += 1) {
    const beforeHasDose =
      Number.isFinite(before[index]?.dosage_value) &&
      Boolean(before[index]?.dosage_unit);
    const afterHasDose =
      Number.isFinite(after[index]?.dosage_value) &&
      Boolean(after[index]?.dosage_unit);
    if (!beforeHasDose && afterHasDose) recoveredIndexes.push(index);
  }
  return recoveredIndexes;
}

async function prepareOpenAiIngredientPanelImage({
  ingredientsImage,
  ingredientsOcr,
  telemetry,
}: {
  ingredientsImage: string;
  ingredientsOcr: AzureIngredientPanelOcr | null;
  telemetry?: LatencyTrace;
}) {
  const originalDimensions = readImageDimensions(ingredientsImage);
  const estimatedOriginalIngredientTokens = estimateTileImageTokens({
    image: ingredientsImage,
    detail: "high",
    model: openAiModel,
  });
  const finishCrop = telemetry?.start(
    "openai_ingredient_panel_crop_preparation",
    { provider: "azure_document_intelligence" },
  );
  const fullImageMetadata = (fallbackReason: string) => ({
    ingredientOriginalWidth: originalDimensions?.width,
    ingredientOriginalHeight: originalDimensions?.height,
    ingredientOpenAiWidth: originalDimensions?.width,
    ingredientOpenAiHeight: originalDimensions?.height,
    ingredientOpenAiImageMode: "full_image",
    panelCropCreated: false,
    estimatedOriginalIngredientTokens,
    estimatedIngredientTokensAvoided: 0,
    panelCropFallbackReason: fallbackReason,
  });

  try {
    if (!originalDimensions) {
      const metadata = fullImageMetadata("original_dimensions_unavailable");
      finishCrop?.({ ...metadata, resultStatus: "full_image", success: true });
      return { image: ingredientsImage, metadata };
    }

    const panelCropPlan = ingredientsOcr?.panelCropPlan;
    if (!panelCropPlan?.completeCoverage) {
      const metadata = fullImageMetadata(
        panelCropPlan?.fallbackReason || "panel_geometry_unavailable",
      );
      finishCrop?.({ ...metadata, resultStatus: "full_image", success: true });
      return { image: ingredientsImage, metadata };
    }

    const crop = await buildOpenAiPanelCropDataUrl({
      imageDataUrl: ingredientsImage,
      regions: panelCropPlan.regions,
    });
    if (!crop?.dataUrl || !crop.width || !crop.height) {
      const metadata = fullImageMetadata(
        crop?.fallbackReason || "crop_generation_failed",
      );
      finishCrop?.({ ...metadata, resultStatus: "full_image", success: true });
      return { image: ingredientsImage, metadata };
    }

    const estimatedCroppedIngredientTokens = estimateTileBasedImageTokens({
      width: crop.width,
      height: crop.height,
      detail: "high",
      model: openAiModel,
    });
    const selection = assessPanelCropTokenSavings({
      originalTokens: estimatedOriginalIngredientTokens,
      croppedTokens: estimatedCroppedIngredientTokens,
    });
    const sharedMetadata = {
      ingredientOriginalWidth: crop.sourceWidth || originalDimensions.width,
      ingredientOriginalHeight: crop.sourceHeight || originalDimensions.height,
      panelCropCreated: true,
      panelCropCoveragePercent: crop.coveragePercent,
      panelCropMarginPercent: crop.marginPercent,
      estimatedOriginalIngredientTokens,
      estimatedCroppedIngredientTokens,
    };

    if (!selection.useCrop) {
      const metadata = {
        ...sharedMetadata,
        ingredientOpenAiWidth: originalDimensions.width,
        ingredientOpenAiHeight: originalDimensions.height,
        ingredientOpenAiImageMode: "full_image",
        estimatedIngredientTokensAvoided: 0,
        panelCropFallbackReason: selection.fallbackReason,
      };
      finishCrop?.({ ...metadata, resultStatus: "full_image", success: true });
      return { image: ingredientsImage, metadata };
    }

    const metadata = {
      ...sharedMetadata,
      ingredientOpenAiWidth: crop.width,
      ingredientOpenAiHeight: crop.height,
      ingredientOpenAiImageMode: "azure_panel_crop",
      estimatedIngredientTokensAvoided: selection.tokensAvoided,
      panelCropFallbackReason: "none",
    };
    finishCrop?.({
      ...metadata,
      resultStatus: "azure_panel_crop",
      success: true,
    });
    return { image: crop.dataUrl, metadata };
  } catch (error) {
    const metadata = fullImageMetadata("crop_preparation_failed");
    finishCrop?.({
      ...metadata,
      resultStatus: "full_image",
      success: false,
      error,
    });
    return { image: ingredientsImage, metadata };
  }
}

async function fetchOpenAiExtraction({
  currentProduct,
  ingredientsImage,
  productImage,
  ingredientsOcr,
  telemetry,
}: {
  currentProduct: CurrentProductContext;
  ingredientsImage: string;
  productImage: string;
  ingredientsOcr: AzureIngredientPanelOcr | null;
  telemetry?: LatencyTrace;
}) {
  const reliableDedicatedOcr = isReliableIngredientPanelOcr(ingredientsOcr);
  const extractionStrategy = selectPhotoExtractionStrategy({
    ocrReliable: reliableDedicatedOcr,
    hasStructuredTable: Boolean(ingredientsOcr?.tableRowGroups.length),
  });
  const includesIngredientsImage =
    extractionStrategy.includeIngredientPanelImage;
  const preparedIngredientPanel = includesIngredientsImage
    ? await prepareOpenAiIngredientPanelImage({
        ingredientsImage,
        ingredientsOcr,
        telemetry,
      })
    : { image: ingredientsImage, metadata: {} };
  const openAiIngredientImage = preparedIngredientPanel.image;
  const systemPrompt = buildSystemPrompt({
    hasDedicatedOcr: Boolean(ingredientsOcr),
    hasIngredientImage: includesIngredientsImage,
  });
  const userPromptParts = buildUserPrompt({
    currentProduct,
    ingredientsOcr,
    includesIngredientsImage,
  });
  const userPrompt = userPromptParts.text;
  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: userPrompt,
    },
  ];

  if (includesIngredientsImage) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: openAiIngredientImage,
        detail: extractionStrategy.ingredientPanelImageDetail,
      },
    });
  }

  userContent.push({
    type: "image_url",
    image_url: {
      url: productImage,
      detail: extractionStrategy.productImageDetail,
    },
  });

  const schemaCharacters = JSON.stringify(photoRescueResponseSchema).length;
  const estimatedSystemPromptTokens = estimateTextTokens(systemPrompt);
  const estimatedUserInstructionTokens = estimateTextTokens(
    userPromptParts.instructionCharacters,
  );
  const estimatedExistingContextTokens = estimateTextTokens(
    userPromptParts.contextCharacters,
  );
  const estimatedAzureTableTokens = estimateTextTokens(
    ingredientsOcr?.promptTableCharacters ?? 0,
  );
  const estimatedAzureLineTokens = estimateTextTokens(
    ingredientsOcr?.promptLineCharacters ?? 0,
  );
  const estimatedAzureFallbackTokens = estimateTextTokens(
    ingredientsOcr?.promptFallbackCharacters ?? 0,
  );
  const estimatedSchemaTokens = estimateTextTokens(schemaCharacters);
  const estimatedIngredientPanelTokens = includesIngredientsImage
    ? estimateTileImageTokens({
        image: openAiIngredientImage,
        detail: extractionStrategy.ingredientPanelImageDetail,
        model: openAiModel,
      })
    : 0;
  const estimatedProductFrontTokens = estimateTileImageTokens({
    image: productImage,
    detail: extractionStrategy.productImageDetail,
    model: openAiModel,
  });
  const estimatedTokenComponents: Array<number | undefined> = [
    estimatedSystemPromptTokens,
    estimatedUserInstructionTokens,
    estimatedExistingContextTokens,
    estimatedAzureTableTokens,
    estimatedAzureLineTokens,
    estimatedAzureFallbackTokens,
    estimatedSchemaTokens,
    estimatedIngredientPanelTokens,
    estimatedProductFrontTokens,
  ];
  const estimatedInputTokens = estimatedTokenComponents.every((value) =>
    Number.isFinite(value),
  )
    ? estimatedTokenComponents.reduce<number>(
        (sum, value) => sum + Number(value),
        0,
      )
    : undefined;
  const visualPayloadBytes =
    estimateImagePayloadBytes(productImage) +
    (includesIngredientsImage
      ? estimateImagePayloadBytes(openAiIngredientImage)
      : 0);

  const finishExtraction = telemetry?.start("openai_extraction_call", {
    ...preparedIngredientPanel.metadata,
    azureFallbackCharacters: ingredientsOcr?.promptFallbackCharacters ?? 0,
    azureLineCharacters: ingredientsOcr?.promptLineCharacters ?? 0,
    azureTableCharacters: ingredientsOcr?.promptTableCharacters ?? 0,
    estimatedAzureFallbackTokens,
    estimatedAzureLineTokens,
    estimatedAzureTableTokens,
    estimatedExistingContextTokens,
    estimatedIngredientPanelTokens,
    estimatedInputTokens,
    estimatedProductFrontTokens,
    estimatedSchemaTokens,
    estimatedSystemPromptTokens,
    estimatedUserInstructionTokens,
    existingContextCharacters: userPromptParts.contextCharacters,
    extractionStrategy: extractionStrategy.name,
    ingredientPanelDetail: extractionStrategy.ingredientPanelImageDetail,
    ingredientPanelIncluded: includesIngredientsImage,
    inputMode: reliableDedicatedOcr
      ? "reliable_ocr_and_front_image"
      : ingredientsOcr
        ? "ocr_and_both_images"
        : "both_images",
    inputTextCharacters: systemPrompt.length + userPrompt.length,
    model: openAiModel,
    productFrontDetail: extractionStrategy.productImageDetail,
    productFrontIncluded: extractionStrategy.includeProductImage,
    provider: "openai",
    recognitionConfidence: ingredientsOcr?.averageWordConfidence,
    schemaCharacters,
    systemPromptCharacters: systemPrompt.length,
    userInstructionCharacters: userPromptParts.instructionCharacters,
    userPromptCharacters: userPrompt.length,
    visualFallbackRequired: extractionStrategy.visualFallbackRequired,
    visualInputCount: includesIngredientsImage ? 2 : 1,
    visualPayloadBytes,
  });
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
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
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    });
  } catch (error) {
    finishExtraction?.({
      resultStatus: "request_failed",
      success: false,
      error,
    });
    throw error;
  }

  if (!response.ok) {
    finishExtraction?.({
      httpStatus: response.status,
      resultStatus: "request_rejected",
      success: false,
    });
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${errorText.slice(0, 500)}`);
  }

  let completion;
  try {
    completion = await response.json();
  } catch (error) {
    finishExtraction?.({
      httpStatus: response.status,
      resultStatus: "invalid_response",
      success: false,
      error,
    });
    throw error;
  }
  const content = extractCompletionContent(
    completion?.choices?.[0]?.message?.content,
  );

  if (!content) {
    finishExtraction?.({
      ...getOpenAiUsageMetadata(completion, estimatedInputTokens),
      httpStatus: response.status,
      resultStatus: "empty_response",
      success: false,
      errorCategory: "invalid_response",
    });
    throw new Error("OpenAI returned empty content.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    finishExtraction?.({
      ...getOpenAiUsageMetadata(completion, estimatedInputTokens),
      httpStatus: response.status,
      resultStatus: "invalid_response",
      success: false,
      error,
    });
    throw new Error("Could not parse OpenAI JSON response.");
  }

  const initialResult = normalizePhotoRescueOutput(parsed);
  const modelExtractedRowCount =
    initialResult.extraction.ingredients_found.length;
  initialResult.rowLifecycle.modelExtractedRowCount = modelExtractedRowCount;
  finishExtraction?.({
    ...getOpenAiUsageMetadata(completion, estimatedInputTokens),
    httpStatus: response.status,
    ingredientCount: modelExtractedRowCount,
    resultStatus: initialResult.classification.is_supplement
      ? "supplement_extracted"
      : "not_supplement",
    success: true,
  });

  if (ingredientsOcr?.combinedText) {
    initialResult.productText.ingredient_panel_text =
      ingredientsOcr.combinedText;
    initialResult.productText.raw_text = [
      initialResult.productText.front_label_name,
      ingredientsOcr.combinedText,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  let imageVerificationMissingIngredients: NormalizedIngredient[] = [];
  let imageVerificationEvidenceRows: string[] = [];
  let recoveredOcrRowCount = 0;
  const ocrIngredientRowGroups = ingredientsOcr
    ? [
        ...ingredientsOcr.tableRowGroups,
        ...buildOcrLineIngredientRowGroups(ingredientsOcr.lines),
      ]
    : [];

  if (
    initialResult.classification.is_supplement === true &&
    ocrIngredientRowGroups.length > 0
  ) {
    const preRecoveryIngredients = initialResult.extraction.ingredients_found;
    const preRecoveryRowCount = preRecoveryIngredients.length;
    initialResult.extraction.ingredients_found =
      recoverStructuredTableIngredients({
        ingredients: preRecoveryIngredients,
        tableRowGroups: ocrIngredientRowGroups,
        normalizeIngredientName: normalizeBroadIngredientName,
        allowNewIngredients: false,
        allowDoseRecovery: reliableDedicatedOcr,
      });
    initialResult.rowLifecycle.deterministicallyRecoveredModelRowIndexes =
      findNewlyRecoveredDoseIndexes(
        preRecoveryIngredients,
        initialResult.extraction.ingredients_found,
        modelExtractedRowCount,
      );
    recoveredOcrRowCount = Math.max(
      0,
      initialResult.extraction.ingredients_found.length - preRecoveryRowCount,
    );
  }

  const verificationPlan = initialResult.classification.is_supplement
    ? assessDoseVerificationRequirement({
        ingredients: initialResult.extraction.ingredients_found,
        ocrText: ingredientsOcr?.combinedText || "",
        tableRowGroups: ocrIngredientRowGroups,
        ocrCandidateGroups: ingredientsOcr?.ocrCandidateGroups ?? [],
        modelPanelComplete: initialResult.extraction.ingredient_panel_complete,
        modelVerificationRequired:
          initialResult.extraction.dose_verification_required,
        modelVerificationReason:
          initialResult.extraction.dose_verification_reason,
        recoveredOcrRowCount,
        modelExtractedRowCount,
        ocrReliable: reliableDedicatedOcr,
        normalizeIngredientName: normalizeBroadIngredientName,
      })
    : {
        required: false,
        reason: "not_supplement",
        reasons: [],
        reasonDetails: [],
        questionableRowIndexes: [],
        questionableRowCount: 0,
        rowIndexes: [],
        rowCount: 0,
        extractedRowCount: initialResult.extraction.ingredients_found.length,
        activeExtractedRowCount: 0,
        ocrCandidateRowCount: 0,
        recoveredOcrRowCount: 0,
        unmatchedOcrCandidateRowCount: 0,
        unmatchedOcrCandidateRows: [],
        unmatchedOcrCandidateIdGroups: [],
        unmatchedOcrCandidateWithGeometryCount: 0,
        questionableOcrRows: [],
        questionableOcrRowGroups: [],
        questionableOcrCandidateIdGroups: [],
        questionableOcrMappedRowCount: 0,
        questionableOcrRowWithGeometryCount: 0,
        totalOcrCandidateCount: 0,
        ocrCandidateWithGeometryCount: 0,
        activeRowWithOcrCandidateIdCount: 0,
        inactiveReviewRowIndexes: [],
        inactiveReviewRowCount: 0,
        ocrRowLifecycle: [],
        ambiguousOcrCandidateAssociationCount: 0,
        mappingProvenanceDirectCount: 0,
        mappingProvenanceRecoveredCount: 0,
        mappingProvenanceWrappedRowMergeCount: 0,
        mappingProvenanceDeterministicEquivalentCount: 0,
        incompletenessStateBeforeRecovery: "not_applicable",
        incompletenessStateAfterRecovery: "not_applicable",
        incompletePanelGlobalReasonAdded: false,
        incompletePanelEscalationReason: "not_applicable",
        modelIncompleteGlobalReasonDisposition: "not_present",
        selectionScope: "none",
        selectionExpanded: false,
        selectionExpansionReason: "none",
      };
  initialResult.rowLifecycle.ocrRows = verificationPlan.ocrRowLifecycle;
  initialResult.rowLifecycle.ocrLogicalCandidateCount =
    verificationPlan.totalOcrCandidateCount;
  initialResult.rowLifecycle.unmatchedOcrCandidateRowCount =
    verificationPlan.unmatchedOcrCandidateRowCount;

  const firstExtractionUsedHighDetailIngredientVision =
    includesIngredientsImage &&
    extractionStrategy.ingredientPanelImageDetail === "high";
  const verificationReasonSet = new Set(verificationPlan.reasons);
  const servingContextRequired = verificationReasonSet.has(
    "serving_size_unclear",
  );
  const targetSelection = selectTargetedVisualRegions({
    availableRegions: ingredientsOcr?.visualRowRegions ?? [],
    questionableRowGroups: verificationPlan.questionableOcrRowGroups,
    unmatchedRows: verificationPlan.unmatchedOcrCandidateRows,
    questionableCandidateIdGroups:
      verificationPlan.questionableOcrCandidateIdGroups,
    unmatchedCandidateIdGroups: verificationPlan.unmatchedOcrCandidateIdGroups,
    includeAdjacentRows: true,
    includeServingContext: servingContextRequired,
  });
  const structuredGeometryAvailable =
    ingredientsOcr?.visualRowRegions.some(
      (region) =>
        region.regionType === "table_row" || region.regionType === "ocr_line",
    ) === true;
  const geometryFailureNoCandidateCount = Math.max(
    0,
    verificationPlan.questionableRowCount -
      verificationPlan.questionableOcrMappedRowCount,
  );
  const geometryFailureMissingBoundsCount = Math.max(
    0,
    verificationPlan.questionableOcrMappedRowCount -
      targetSelection.mappedQuestionableRowCount,
  );
  const geometryFailureUnmatchedMissingBoundsCount = Math.max(
    0,
    verificationPlan.unmatchedOcrCandidateRowCount -
      targetSelection.mappedUnmatchedCandidateCount,
  );
  const verificationStrategy = selectVisualVerificationStrategy({
    required: verificationPlan.required,
    reasonDetails: verificationPlan.reasonDetails,
    activeRowCount: verificationPlan.activeExtractedRowCount,
    questionableRowCount: verificationPlan.questionableRowCount,
    unmatchedCandidateCount: verificationPlan.unmatchedOcrCandidateRowCount,
    firstExtractionUsedHighDetailIngredientVision,
    firstVisualAuditComplete: initialResult.extraction.visual_audit_complete,
    firstVisualUnresolvedRegionCount:
      initialResult.extraction.visual_unresolved_region_count,
    reliableOcr: reliableDedicatedOcr,
    structuredGeometryAvailable,
    mappedQuestionableRowCount: targetSelection.mappedQuestionableRowCount,
    mappedUnmatchedCandidateCount:
      targetSelection.mappedUnmatchedCandidateCount,
    servingContextLocated: targetSelection.servingContextLocated,
  });
  const verificationTriggers = {
    lowRecognitionConfidence: verificationReasonSet.has(
      "ocr_confidence_insufficient",
    ),
    unmatchedCandidates: verificationPlan.unmatchedOcrCandidateRowCount > 0,
    omittedRowRisk:
      verificationReasonSet.has("possible_omitted_row") ||
      verificationReasonSet.has("possible_omitted_rows") ||
      verificationReasonSet.has("model_incomplete_panel") ||
      verificationReasonSet.has("incomplete_panel"),
    doseMismatch:
      verificationReasonSet.has("ocr_dose_mismatch") ||
      verificationReasonSet.has("dose_not_verified_against_ocr"),
  };
  const estimatedFullVerificationImageTokens = estimateTileImageTokens({
    image: ingredientsImage,
    detail: "high",
    model: openAiModel,
  });
  let verificationImage = ingredientsImage;
  let verificationVisualMode = "full_image";
  let verificationRowIndexes = verificationPlan.rowIndexes;
  let targetedVisualRegionCount = 0;
  let targetCropBounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    area: number;
  } | null = null;
  let estimatedCropImageTokens: number | undefined;
  let estimatedVerificationImageTokens = estimatedFullVerificationImageTokens;
  let secondPassRequired =
    PHOTO_DOSE_VERIFICATION_ENABLED && verificationPlan.required;
  let verificationStrategyReason = verificationStrategy.reason;
  let targetedFallbackReason =
    verificationStrategy.mode === "targeted_regions"
      ? "none"
      : verificationStrategy.reason;

  if (!PHOTO_DOSE_VERIFICATION_ENABLED) {
    verificationVisualMode = "verification_disabled";
    verificationRowIndexes = [];
    estimatedVerificationImageTokens = 0;
    verificationStrategyReason = "temporarily_disabled";
    targetedFallbackReason = "temporarily_disabled";
  } else if (verificationStrategy.mode === "first_pass_high_detail") {
    secondPassRequired = false;
    verificationVisualMode = "first_pass_high_detail";
    verificationRowIndexes = [];
    estimatedVerificationImageTokens = 0;
  } else if (verificationStrategy.mode === "targeted_regions") {
    const finishTargetedImagePreparation = telemetry?.start(
      "targeted_verification_image_preparation",
      {
        adjacentRowCount: targetSelection.adjacentContextRowCount,
        activeRowCandidateMapCount:
          verificationPlan.activeRowWithOcrCandidateIdCount,
        candidateGeometryCount: verificationPlan.ocrCandidateWithGeometryCount,
        geometryFailureAmbiguousCount:
          verificationPlan.ambiguousOcrCandidateAssociationCount,
        geometryFailureMissingBoundsCount,
        geometryFailureNoCandidateCount,
        geometryFailureUnmatchedMissingBoundsCount,
        globalConcernTargetable: verificationStrategy.globalConcernTargetable,
        globalConcernTargetabilityReason:
          verificationStrategy.globalConcernTargetabilityReason,
        inactiveReviewRowCount: verificationPlan.inactiveReviewRowCount,
        mappedQuestionableRowCount: targetSelection.mappedQuestionableRowCount,
        mappedUnmatchedCandidateCount:
          targetSelection.mappedUnmatchedCandidateCount,
        mappingDirectCount: verificationPlan.mappingProvenanceDirectCount,
        mappingDeterministicEquivalentCount:
          verificationPlan.mappingProvenanceDeterministicEquivalentCount,
        mappingRecoveredCount: verificationPlan.mappingProvenanceRecoveredCount,
        mappingWrappedRowMergeCount:
          verificationPlan.mappingProvenanceWrappedRowMergeCount,
        questionableRowGeometryCount:
          verificationPlan.questionableOcrRowWithGeometryCount,
        reliableGeometryTargeting:
          verificationStrategy.reliableGeometryTargeting,
        servingRegionCount: targetSelection.servingContextRegionCount,
        servingRegionLocated: targetSelection.servingContextLocated,
        servingRegionRequired: servingContextRequired,
        structuredGeometryAvailable,
        totalCandidateCount: verificationPlan.totalOcrCandidateCount,
        targetedVisualRegionCount: targetSelection.regions.length,
        unresolvedCandidateCount:
          verificationPlan.unmatchedOcrCandidateRowCount,
        unmatchedCandidateGeometryCount:
          verificationPlan.unmatchedOcrCandidateWithGeometryCount,
      },
    );
    const targetedImage = targetSelection.completeCoverage
      ? await buildTargetedJpegDataUrl({
          imageDataUrl: ingredientsImage,
          regions: targetSelection.regions,
        })
      : null;
    const targetedImageTokens = targetedImage
      ? estimateTileBasedImageTokens({
          width: targetedImage.width,
          height: targetedImage.height,
          detail: "high",
          model: openAiModel,
        })
      : undefined;
    estimatedCropImageTokens = targetedImageTokens;
    const targetedImageReducesTokens =
      Number.isFinite(targetedImageTokens) &&
      Number.isFinite(estimatedFullVerificationImageTokens) &&
      Number(targetedImageTokens) <
        Number(estimatedFullVerificationImageTokens);

    if (targetedImage && targetedImageReducesTokens) {
      verificationImage = targetedImage.dataUrl;
      verificationVisualMode = "targeted_crop";
      verificationRowIndexes = verificationPlan.questionableRowIndexes;
      targetedVisualRegionCount = targetedImage.selectedRegionCount;
      targetCropBounds = targetedImage.normalizedBounds;
      targetedFallbackReason = "none";
      estimatedVerificationImageTokens = targetedImageTokens;
      finishTargetedImagePreparation?.({
        estimatedFullVerificationImageTokens,
        estimatedImageTokensAvoided:
          Number(estimatedFullVerificationImageTokens) -
          Number(targetedImageTokens),
        estimatedVerificationImageTokens: targetedImageTokens,
        estimatedCropImageTokens: targetedImageTokens,
        resultStatus: "targeted_crop_created",
        success: true,
        targetCropArea: targetCropBounds?.area,
        cropCoveragePercent: Number(targetCropBounds?.area) * 100,
        targetCropBottom: targetCropBounds?.bottom,
        targetCropLeft: targetCropBounds?.left,
        targetCropRight: targetCropBounds?.right,
        targetCropTop: targetCropBounds?.top,
        targetedVisualRegionCount,
      });
    } else {
      verificationVisualMode = "full_image_targeted_rows";
      verificationRowIndexes = verificationPlan.questionableRowIndexes;
      verificationStrategyReason = !targetSelection.completeCoverage
        ? "targeted_region_geometry_incomplete"
        : !targetedImage
          ? "targeted_crop_preparation_failed"
          : !Number.isFinite(targetedImageTokens)
            ? "targeted_crop_token_estimate_unavailable"
            : "targeted_crop_no_token_saving";
      targetedFallbackReason = verificationStrategyReason;
      finishTargetedImagePreparation?.({
        estimatedCropImageTokens: targetedImageTokens,
        resultStatus: verificationStrategyReason,
        success: false,
      });
    }
  }

  const verificationExecutionPlan = {
    ...verificationPlan,
    required: secondPassRequired,
    rowIndexes: verificationRowIndexes,
    rowCount: verificationRowIndexes.length,
  };

  telemetry?.record("dose_verification_decision", 0, {
    activeExtractedRowCount: verificationPlan.activeExtractedRowCount,
    activeRowCandidateMapCount:
      verificationPlan.activeRowWithOcrCandidateIdCount,
    adjacentRowCount: targetSelection.adjacentContextRowCount,
    candidateGeometryCount: verificationPlan.ocrCandidateWithGeometryCount,
    cropCoveragePercent: Number(targetCropBounds?.area) * 100,
    estimatedCropImageTokens,
    estimatedFullVerificationImageTokens,
    estimatedImageTokensAvoided:
      Number.isFinite(estimatedFullVerificationImageTokens) &&
      Number.isFinite(estimatedVerificationImageTokens)
        ? Math.max(
            0,
            Number(estimatedFullVerificationImageTokens) -
              Number(estimatedVerificationImageTokens),
          )
        : undefined,
    estimatedVerificationImageTokens,
    extractedRowCount: verificationPlan.extractedRowCount,
    initialHighDetailVisualAudit: firstExtractionUsedHighDetailIngredientVision,
    initialVisualAuditComplete: initialResult.extraction.visual_audit_complete,
    initialVisualUnresolvedRegionCount:
      initialResult.extraction.visual_unresolved_region_count,
    inputMode: reliableDedicatedOcr
      ? "reliable_ocr"
      : ingredientsOcr
        ? "ocr_and_images"
        : "images_only",
    model: openAiModel,
    modelExtractedRowCount,
    incompletenessStateBeforeRecovery:
      verificationPlan.incompletenessStateBeforeRecovery,
    incompletenessStateAfterRecovery:
      verificationPlan.incompletenessStateAfterRecovery,
    incompletePanelGlobalReasonAdded:
      verificationPlan.incompletePanelGlobalReasonAdded,
    incompletePanelEscalationReason:
      verificationPlan.incompletePanelEscalationReason,
    inactiveReviewRowCount: verificationPlan.inactiveReviewRowCount,
    modelIncompleteGlobalReasonDisposition:
      verificationPlan.modelIncompleteGlobalReasonDisposition,
    globalConcernTargetable: verificationStrategy.globalConcernTargetable,
    globalConcernTargetabilityReason:
      verificationStrategy.globalConcernTargetabilityReason,
    geometryFailureAmbiguousCount:
      verificationPlan.ambiguousOcrCandidateAssociationCount,
    geometryFailureMissingBoundsCount,
    geometryFailureNoCandidateCount,
    geometryFailureUnmatchedMissingBoundsCount,
    mappedQuestionableRowCount: targetSelection.mappedQuestionableRowCount,
    mappedUnmatchedCandidateCount:
      targetSelection.mappedUnmatchedCandidateCount,
    mappingDirectCount: verificationPlan.mappingProvenanceDirectCount,
    mappingDeterministicEquivalentCount:
      verificationPlan.mappingProvenanceDeterministicEquivalentCount,
    mappingRecoveredCount: verificationPlan.mappingProvenanceRecoveredCount,
    mappingWrappedRowMergeCount:
      verificationPlan.mappingProvenanceWrappedRowMergeCount,
    ocrCandidateRowCount: verificationPlan.ocrCandidateRowCount,
    questionableRowCount: verificationPlan.questionableRowCount,
    questionableRowGeometryCount:
      verificationPlan.questionableOcrRowWithGeometryCount,
    questionableRowIndexes: verificationPlan.questionableRowIndexes,
    recognitionConfidence: ingredientsOcr?.averageWordConfidence,
    recoveredOcrRowCount: verificationPlan.recoveredOcrRowCount,
    resultStatus: !PHOTO_DOSE_VERIFICATION_ENABLED
      ? "temporarily_disabled"
      : secondPassRequired
        ? "required"
        : verificationStrategy.mode === "first_pass_high_detail"
          ? "covered_by_first_high_detail_visual_audit"
          : "skipped",
    secondPassRequired,
    reliableGeometryTargeting: verificationStrategy.reliableGeometryTargeting,
    servingRegionCount: targetSelection.servingContextRegionCount,
    servingRegionLocated: targetSelection.servingContextLocated,
    servingRegionRequired: servingContextRequired,
    structuredGeometryAvailable,
    targetCropArea: targetCropBounds?.area,
    targetCropBottom: targetCropBounds?.bottom,
    targetCropLeft: targetCropBounds?.left,
    targetCropRight: targetCropBounds?.right,
    targetCropTop: targetCropBounds?.top,
    targetedVisualRegionCount,
    targetedFallbackReason,
    totalCandidateCount: verificationPlan.totalOcrCandidateCount,
    unmatchedCandidateGeometryCount:
      verificationPlan.unmatchedOcrCandidateWithGeometryCount,
    unresolvedCandidateCount: verificationPlan.unmatchedOcrCandidateRowCount,
    verificationReasonDetails: verificationPlan.reasonDetails,
    verificationReason: verificationPlan.reason,
    verificationRequired: secondPassRequired,
    verificationReusedFullVisualInput:
      secondPassRequired && verificationVisualMode === "full_image",
    verificationRowCount: verificationExecutionPlan.rowCount,
    verificationRowIndexes: verificationExecutionPlan.rowIndexes,
    verificationScope: verificationVisualMode,
    verificationSelectionExpanded:
      verificationVisualMode === "full_image" &&
      verificationPlan.selectionExpanded,
    verificationSelectionExpansionReason:
      verificationPlan.selectionExpansionReason,
    verificationSelectionScope:
      verificationVisualMode === "verification_disabled"
        ? "disabled"
        : verificationVisualMode === "targeted_crop"
          ? "targeted_regions"
          : verificationVisualMode === "full_image_targeted_rows"
            ? "targeted_rows_full_image"
            : verificationVisualMode === "first_pass_high_detail"
              ? "first_pass_high_detail"
              : verificationPlan.selectionScope,
    verificationStrategyReason,
    verificationTriggerDoseMismatch: verificationTriggers.doseMismatch,
    verificationTriggerLowRecognitionConfidence:
      verificationTriggers.lowRecognitionConfidence,
    verificationTriggerOmittedRowRisk: verificationTriggers.omittedRowRisk,
    verificationTriggerUnmatchedCandidates:
      verificationTriggers.unmatchedCandidates,
    unmatchedOcrCandidateRowCount:
      verificationPlan.unmatchedOcrCandidateRowCount,
  });

  if (!secondPassRequired) {
    telemetry?.record("openai_dose_verification_call", 0, {
      inputMode: "not_sent",
      model: openAiModel,
      provider: "openai",
      resultStatus: "skipped",
      initialHighDetailVisualAudit:
        firstExtractionUsedHighDetailIngredientVision,
      initialVisualAuditComplete:
        initialResult.extraction.visual_audit_complete,
      initialVisualUnresolvedRegionCount:
        initialResult.extraction.visual_unresolved_region_count,
      verificationReason: verificationPlan.reason,
      verificationRequired: false,
      verificationRowCount: 0,
      verificationRowIndexes: [],
      verificationScope: verificationVisualMode,
      verificationStrategyReason,
    });
  }

  let verificationExecution = await executeConditionalDoseVerification({
    plan: verificationExecutionPlan,
    verify: (rowIndexes: number[]) =>
      verifyOpenAiExtractedDoses({
        ingredientsImage: verificationImage,
        ingredients: initialResult.extraction.ingredients_found,
        rowIndexes,
        servingSizeText: initialResult.extraction.serving_size_text,
        verificationReason: verificationPlan.reason,
        unmatchedOcrRows: verificationPlan.unmatchedOcrCandidateRows,
        visualVerificationMode: verificationVisualMode,
        firstExtractionUsedHighDetailIngredientVision,
        estimatedFullVerificationImageTokens,
        estimatedVerificationImageTokens,
        targetRegionCount: targetedVisualRegionCount,
        verificationTriggers,
        telemetry,
      }),
  });

  if (
    verificationExecution.ran &&
    shouldFallbackToFullVisualVerification({
      mode: verificationVisualMode,
      scopeResolved: verificationExecution.result?.scopeResolved,
    })
  ) {
    telemetry?.record("dose_verification_targeted_fallback", 0, {
      resultStatus: "target_scope_unresolved",
      success: true,
      targetedFallbackReason: "target_scope_unresolved",
      verificationScope: "full_image_fallback",
    });
    verificationExecution = {
      ran: true,
      result: await verifyOpenAiExtractedDoses({
        ingredientsImage,
        ingredients: initialResult.extraction.ingredients_found,
        rowIndexes: verificationPlan.rowIndexes,
        servingSizeText: initialResult.extraction.serving_size_text,
        verificationReason: verificationPlan.reason,
        unmatchedOcrRows: verificationPlan.unmatchedOcrCandidateRows,
        visualVerificationMode: "full_image_fallback",
        firstExtractionUsedHighDetailIngredientVision,
        estimatedFullVerificationImageTokens,
        estimatedVerificationImageTokens: estimatedFullVerificationImageTokens,
        verificationTriggers,
        telemetry,
      }),
    };
  }

  const verificationPersistenceGate = assessVerificationPersistenceGate({
    verificationRan: verificationExecution.ran,
    scopeResolved: verificationExecution.result?.scopeResolved,
  });
  telemetry?.record("verification_persistence_gate", 0, {
    resultStatus: verificationPersistenceGate.reason,
    success: verificationPersistenceGate.allowed,
    targetedScopeResolved: verificationExecution.result?.scopeResolved === true,
  });
  if (!verificationPersistenceGate.allowed) {
    throw new PhotoVerificationUnresolvedError();
  }

  if (verificationExecution.ran && verificationExecution.result) {
    const verification = verificationExecution.result;
    imageVerificationEvidenceRows = getAcceptedImageDoseCorrectionEvidenceRows({
      ingredients: initialResult.extraction.ingredients_found,
      corrections: verification.corrections,
      normalizeIngredientName: normalizeBroadIngredientName,
    }).filter((row): row is string => typeof row === "string");
    initialResult.extraction.ingredients_found = mergeDoseCorrections(
      initialResult.extraction.ingredients_found,
      verification.corrections,
      verificationPlan.inactiveReviewRowIndexes,
    );
    imageVerificationMissingIngredients = verification.missingIngredients;
    initialResult.extraction.serving_size_text =
      verification.servingSizeText ||
      initialResult.extraction.serving_size_text;
  }

  if (
    initialResult.classification.is_supplement === true &&
    ocrIngredientRowGroups.length
  ) {
    const preRecoveryIngredients = initialResult.extraction.ingredients_found;
    initialResult.extraction.ingredients_found =
      recoverStructuredTableIngredients({
        ingredients: preRecoveryIngredients,
        tableRowGroups: ocrIngredientRowGroups,
        normalizeIngredientName: normalizeBroadIngredientName,
        allowNewIngredients: false,
        allowDoseRecovery: reliableDedicatedOcr,
      });
    initialResult.rowLifecycle.deterministicallyRecoveredModelRowIndexes =
      Array.from(
        new Set([
          ...initialResult.rowLifecycle
            .deterministicallyRecoveredModelRowIndexes,
          ...findNewlyRecoveredDoseIndexes(
            preRecoveryIngredients,
            initialResult.extraction.ingredients_found,
            modelExtractedRowCount,
          ),
        ]),
      ).sort((left, right) => left - right);
  }

  if (
    initialResult.classification.is_supplement === true &&
    imageVerificationMissingIngredients.length > 0
  ) {
    const preVisualRecoveryRowCount =
      initialResult.extraction.ingredients_found.length;
    initialResult.extraction.ingredients_found =
      recoverImageVerifiedIngredients({
        ingredients: initialResult.extraction.ingredients_found,
        missingIngredients: imageVerificationMissingIngredients,
        normalizeIngredientName: normalizeBroadIngredientName,
      });
    initialResult.rowLifecycle.visuallyVerifiedRecoveredRowIndexes = Array.from(
      {
        length: Math.max(
          0,
          initialResult.extraction.ingredients_found.length -
            preVisualRecoveryRowCount,
        ),
      },
      (_, index) => preVisualRecoveryRowCount + index,
    );

    const acceptedImageEvidenceRows = getAcceptedImageVerifiedEvidenceRows({
      ingredients: initialResult.extraction.ingredients_found,
      missingIngredients: imageVerificationMissingIngredients,
      normalizeIngredientName: normalizeBroadIngredientName,
    });
    imageVerificationEvidenceRows = [
      ...imageVerificationEvidenceRows,
      ...acceptedImageEvidenceRows,
    ];
  }

  if (imageVerificationEvidenceRows.length > 0) {
    initialResult.productText.ingredient_panel_text = appendUniqueEvidenceRows(
      initialResult.productText.ingredient_panel_text,
      imageVerificationEvidenceRows,
    );
    initialResult.productText.raw_text = appendUniqueEvidenceRows(
      initialResult.productText.raw_text,
      imageVerificationEvidenceRows,
    );
  }

  return initialResult;
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
  barcodeType?: string | null,
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
      (data ?? []).find((row) => trimString(row?.barcode) === candidate),
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

  const existingByBarcode = await fetchOffProductByBarcode(
    barcode,
    barcodeType,
  );
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
  modelExtractedRowCount,
  initialModelIngredientTypes,
  deterministicallyRecoveredModelRowIndexes,
  visuallyVerifiedRecoveredRowIndexes,
  aliasIndex,
  supplementNameIndex,
  ocrText,
}: {
  productId: string;
  ingredients: NormalizedIngredient[];
  modelExtractedRowCount: number;
  initialModelIngredientTypes: Array<"active" | "inactive" | "uncertain">;
  deterministicallyRecoveredModelRowIndexes: number[];
  visuallyVerifiedRecoveredRowIndexes: number[];
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
  const deterministicallyRecoveredModelRowIndexSet = new Set(
    deterministicallyRecoveredModelRowIndexes,
  );
  const visuallyVerifiedRecoveredRowIndexSet = new Set(
    visuallyVerifiedRecoveredRowIndexes,
  );
  const rowsBySignature = new Map<string, Record<string, unknown>>();
  const rowIndexBySignature = new Map<string, number>();
  const rowLifecycle = new Map<
    number,
    {
      rowId: string;
      sourceType:
        | "model_extraction"
        | "deterministic_recovery"
        | "visual_verifier_recovery";
      disposition: string;
      ingredientType: string;
      hasDose: boolean;
      reasonCategory?: string;
    }
  >();
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

  for (const [ingredientIndex, ingredient] of ingredients.entries()) {
    const lifecycleBase = {
      rowId:
        ingredientIndex < modelExtractedRowCount
          ? `model:${ingredientIndex}`
          : `recovered:${ingredientIndex - modelExtractedRowCount}`,
      sourceType:
        ingredientIndex < modelExtractedRowCount
          ? ("model_extraction" as const)
          : visuallyVerifiedRecoveredRowIndexSet.has(ingredientIndex)
            ? ("visual_verifier_recovery" as const)
            : ("deterministic_recovery" as const),
      ingredientType: ingredient.ingredient_type,
      hasDose:
        Number.isFinite(ingredient.dosage_value) &&
        Boolean(ingredient.dosage_unit),
    };
    if (
      ingredientIndex >= modelExtractedRowCount &&
      !visuallyVerifiedRecoveredRowIndexSet.has(ingredientIndex)
    ) {
      rowLifecycle.set(ingredientIndex, {
        ...lifecycleBase,
        disposition: "rejected_unverified_recovery",
        reasonCategory: "missing_independent_visual_evidence",
      });
      continue;
    }
    if (ingredient.ingredient_type === "inactive") {
      rowLifecycle.set(ingredientIndex, {
        ...lifecycleBase,
        disposition: "filtered_inactive",
      });
      continue;
    }

    const canonicalName = cleanIngredientText(
      ingredient.canonical_name || ingredient.raw_name,
    );
    const rawName = cleanIngredientText(ingredient.raw_name || canonicalName);

    if (!canonicalName && !rawName) {
      rowLifecycle.set(ingredientIndex, {
        ...lifecycleBase,
        disposition: "rejected_missing_name",
      });
      continue;
    }

    const normalizedLookupName = normalizeBroadIngredientName(
      canonicalName || rawName,
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
    const existingIngredientIndex = rowIndexBySignature.get(signature);
    const retainedDisposition =
      ingredient.ingredient_type === "uncertain"
        ? "filtered_uncertain"
        : deterministicallyRecoveredModelRowIndexSet.has(ingredientIndex)
          ? "recovered"
          : ingredientIndex < modelExtractedRowCount
            ? "retained"
            : "recovered";

    if (
      !existing ||
      (!trimString(existing.canonical_supplement_id) &&
        trimString(nextRow.canonical_supplement_id))
    ) {
      if (existing && Number.isInteger(existingIngredientIndex)) {
        const previousLifecycle = rowLifecycle.get(existingIngredientIndex!);
        if (previousLifecycle) {
          rowLifecycle.set(existingIngredientIndex!, {
            ...previousLifecycle,
            disposition: "merged_duplicate",
          });
        }
      }
      rowsBySignature.set(signature, nextRow);
      rowIndexBySignature.set(signature, ingredientIndex);
      rowLifecycle.set(ingredientIndex, {
        ...lifecycleBase,
        disposition: retainedDisposition,
        ...(ingredientIndex < modelExtractedRowCount &&
        initialModelIngredientTypes[ingredientIndex] === "inactive" &&
        ingredient.ingredient_type === "active"
          ? { reasonCategory: "verifier_reclassified_active" }
          : deterministicallyRecoveredModelRowIndexSet.has(ingredientIndex)
            ? { reasonCategory: "deterministic_dose_recovery" }
            : dosage.invalidReason
              ? { reasonCategory: dosage.invalidReason }
              : {}),
      });
    } else {
      rowLifecycle.set(ingredientIndex, {
        ...lifecycleBase,
        disposition: "merged_duplicate",
        ...(dosage.invalidReason
          ? { reasonCategory: dosage.invalidReason }
          : {}),
      });
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
      (row) => `${row.normalized_name}|${row.product_id}`,
    ),
    malformedDosages: dedupeByKey(
      malformedDosages,
      (row) =>
        `${row.raw_name}|${row.dosage_original_text}|${row.invalid_reason}`,
    ),
    unverifiedDoses: dedupeByKey(
      unverifiedDoses,
      (row) => `${row.ingredient_name}|${row.extracted_dose}`,
    ),
    rowLifecycle: Array.from(rowLifecycle.values()),
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
          trimString(row.dose_confidence),
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
          String(right.dosageDisplay ?? ""),
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
      ].join("|"),
  );
}

function emitIngredientRowLifecycleTelemetry({
  telemetry,
  modelInputRowCount,
  ocrLogicalCandidateCount,
  unmatchedOcrCandidateRowCount,
  ocrRows,
  finalRows,
  persistenceInputRowCount,
  persistenceActiveRowCount,
}: {
  telemetry: LatencyTrace;
  modelInputRowCount: number;
  ocrLogicalCandidateCount: number;
  unmatchedOcrCandidateRowCount: number;
  ocrRows: Array<Record<string, unknown>>;
  finalRows: Array<Record<string, unknown>>;
  persistenceInputRowCount: number;
  persistenceActiveRowCount: number;
}) {
  try {
    ocrRows.forEach((row) =>
      telemetry.record("ingredient_row_lifecycle", 0, {
        ...row,
        lifecyclePhase: "ocr_model_reconciliation",
      }),
    );
    finalRows.forEach((row) =>
      telemetry.record("ingredient_row_lifecycle", 0, {
        ...row,
        lifecyclePhase: "validated_final_set",
      }),
    );

    telemetry.record("ingredient_row_lifecycle_summary", 0, {
      ...summarizeIngredientRowLifecycle({
        modelInputRowCount,
        ocrLogicalCandidateCount,
        unmatchedOcrCandidateRowCount,
        ocrRows,
        finalRows,
        persistenceInputRowCount,
        persistenceActiveRowCount,
      }),
    });
  } catch {
    // Row lifecycle telemetry must never affect the supplement workflow.
  }
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
        restoreIngredientsError,
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
        restoreMasterError,
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
        deleteMasterError,
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
  const previousActiveRows =
    await fetchProductActiveIngredientSnapshot(productId);
  const previousMasterRow = await fetchMasterSnapshot(productId);
  const previousRevision =
    parseIntegerLike(previousMasterRow?.photo_improvement_revision) ?? 0;
  const committedRevision = previousRevision + 1;
  const acceptedAttemptId = `photo-v1-${crypto.randomUUID()}`;

  try {
    const { error: deleteIngredientsError } = await adminSupabase!
      .from(TABLES.activeIngredients)
      .delete()
      .eq("product_id", productId);

    if (deleteIngredientsError) {
      throw new Error(
        `[supabase:${TABLES.activeIngredients}] ${deleteIngredientsError.message}`,
      );
    }

    if (rowsToInsert.length) {
      const { error: insertIngredientsError } = await adminSupabase!
        .from(TABLES.activeIngredients)
        .insert(rowsToInsert);

      if (insertIngredientsError) {
        throw new Error(
          `[supabase:${TABLES.activeIngredients}] ${insertIngredientsError.message}`,
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
          verification_status: "photo_verified",
          name_source: "photo_rescue_ai",
          naming_confidence:
            typeof namingConfidence === "number" ? namingConfidence : null,
          active_ingredients_json: masterActiveIngredients,
          ingredient_count: masterActiveIngredients.length,
          processed_at: new Date().toISOString(),
          photo_improvement_revision: committedRevision,
          photo_improvement_accepted_attempt_id: acceptedAttemptId,
        },
        {
          onConflict: "product_id",
        },
      );

    if (masterError) {
      throw new Error(
        `[supabase:${TABLES.supplementMaster}] ${masterError.message}`,
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

  return { committedRevision, acceptedAttemptId };
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
        `[supabase:${TABLES.missingSupplements}] ${upsertError.message}`,
      );
    }
  }

  const namesWithoutRows = uniqueNames.filter(
    (name) => !summaryByName.has(name),
  );
  if (namesWithoutRows.length) {
    const { error: deleteError } = await adminSupabase!
      .from(TABLES.missingSupplements)
      .delete()
      .in("normalized_name", namesWithoutRows);

    if (deleteError) {
      throw new Error(
        `[supabase:${TABLES.missingSupplements}] ${deleteError.message}`,
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
  const previousOccurrences =
    await fetchMissingOccurrencesForProduct(productId);
  const previousNames = previousOccurrences
    .map((row) => trimString(row.normalized_name))
    .filter(Boolean);

  const { error: deleteOccurrencesError } = await adminSupabase!
    .from(TABLES.missingOccurrences)
    .delete()
    .eq("product_id", productId);

  if (deleteOccurrencesError) {
    throw new Error(
      `[supabase:${TABLES.missingOccurrences}] ${deleteOccurrencesError.message}`,
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
      `[supabase:${TABLES.reviewQueue}] ${deleteReviewQueueError.message}`,
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
          Array.from(
            new Set(existingOccurrenceKeys.map((row) => row.normalized_name)),
          ),
        )
        .eq("product_id", productId);

    if (existingOccurrencesError) {
      throw new Error(
        `[supabase:${TABLES.missingOccurrences}] ${existingOccurrencesError.message}`,
      );
    }

    const existingFirstSeenByKey = new Map(
      (existingOccurrenceRows ?? []).map((row) => [
        `${trimString(row.normalized_name)}|${trimString(row.product_id)}`,
        {
          first_seen_at: trimString(row.first_seen_at),
          occurrence_count: Number(row.occurrence_count),
        },
      ]),
    );

    const now = new Date().toISOString();
    const occurrenceRows = unresolvedRows.map((row) => {
      const existing = existingFirstSeenByKey.get(
        `${trimString(row.normalized_name)}|${trimString(row.product_id)}`,
      );

      return {
        normalized_name: row.normalized_name,
        product_id: row.product_id,
        display_name: row.display_name,
        first_seen_at: existing?.first_seen_at || now,
        last_seen_at: now,
        occurrence_count:
          existing && Number.isFinite(existing.occurrence_count)
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
        `[supabase:${TABLES.missingOccurrences}] ${upsertOccurrencesError.message}`,
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
        `[supabase:${TABLES.reviewQueue}] ${aliasReviewInsertError.message}`,
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
        `[supabase:${TABLES.reviewQueue}] ${dosageReviewInsertError.message}`,
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
        `[supabase:${TABLES.reviewQueue}] ${unverifiedReviewInsertError.message}`,
      );
    }
  }

  await refreshMissingSupplementSummaries(
    Array.from(
      new Set([
        ...previousNames,
        ...unresolvedRows.map((row) => row.normalized_name),
      ]),
    ),
  );

  return Array.from(
    new Set([
      ...previousNames,
      ...unresolvedRows.map((row) => row.normalized_name),
    ]),
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

function queueReviewCandidateRefresh(
  normalizedNames: string[],
  telemetry: LatencyTrace,
) {
  const reviewRefreshKey =
    trimString(internalServiceRoleKey) || trimString(supabaseServiceRoleKey);
  if (!supabaseUrl || !reviewRefreshKey || !normalizedNames.length) {
    return false;
  }

  const uniqueNames = Array.from(new Set(normalizedNames.filter(Boolean)));
  if (!uniqueNames.length) {
    return false;
  }

  const finishRequest = telemetry.start("review_follow_up_request", {
    provider: REVIEW_PROCESSOR_FUNCTION,
  });
  scheduleBackgroundTask(
    fetch(`${supabaseUrl}/functions/v1/${REVIEW_PROCESSOR_FUNCTION}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: reviewRefreshKey,
        ...getLatencyTraceHeaders(telemetry),
      },
      body: JSON.stringify({
        normalizedNames: uniqueNames,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = Object.assign(
            new Error(`Review refresh failed with status ${response.status}`),
            { status: response.status },
          );
          finishRequest({
            httpStatus: response.status,
            success: false,
            error,
          });
          return;
        }
        finishRequest({ httpStatus: response.status, success: true });
      })
      .catch((error) => {
        finishRequest({ success: false, error });
      }),
  );

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return instrumentEdgeRequest(
    req,
    { flow: "photo_improvement", action: "improve_with_photos" },
    async (telemetry: LatencyTrace) => {
      if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      let finishCanonicalPersistence:
        | ReturnType<LatencyTrace["start"]>
        | undefined;
      try {
        if (!adminSupabase) {
          return jsonResponse(
            {
              error:
                "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.",
            },
            500,
          );
        }

        if (!openAiApiKey) {
          return jsonResponse(
            {
              error:
                "Missing OPENAI_API_KEY secret for scan-supplement-photos function.",
            },
            500,
          );
        }

        const authHeader = req.headers.get("Authorization");
        const finishAuthentication = telemetry.start("authentication", {
          provider: "supabase",
        });
        let authenticatedUser;
        try {
          authenticatedUser = await authenticateSupabaseUser({
            adminSupabase,
            authHeader,
          });
          finishAuthentication({
            httpStatus: authenticatedUser.ok ? 200 : authenticatedUser.status,
            success: authenticatedUser.ok,
          });
        } catch (error) {
          finishAuthentication({ success: false, error });
          throw error;
        }

        if (!authenticatedUser.ok) {
          return jsonResponse(authenticatedUser.body, authenticatedUser.status);
        }

        const finishEntitlement = telemetry.start(
          "revenuecat_entitlement_check",
          {
            provider: "revenuecat",
          },
        );
        let entitlementAccess;
        try {
          entitlementAccess = await assertActiveRevenueCatEntitlement({
            userId: authenticatedUser.user.id,
          });
          finishEntitlement({
            httpStatus: entitlementAccess.status,
            success: entitlementAccess.ok,
          });
        } catch (error) {
          finishEntitlement({ success: false, error });
          throw error;
        }
        if (!entitlementAccess.ok) {
          return jsonResponse(entitlementAccess.body, entitlementAccess.status);
        }

        const finishRequestValidation = telemetry.start("request_validation");
        const validatedRequest = validateScanSupplementPhotosRequest(
          await req.text(),
        );
        finishRequestValidation({ success: !("body" in validatedRequest) });
        if ("body" in validatedRequest) {
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
        const finishQuota = telemetry.start("quota_check", {
          provider: "supabase",
        });
        let quotaAccess;
        try {
          quotaAccess = await enforceEdgeFunctionQuota({
            adminSupabase,
            policyKey: "scan-supplement-photos",
            userId: authenticatedUser.user.id,
          });
          finishQuota({
            httpStatus: quotaAccess.ok ? 200 : quotaAccess.status,
            success: quotaAccess.ok,
          });
        } catch (error) {
          finishQuota({ success: false, error });
          throw error;
        }
        if (quotaAccess.ok === false) {
          return jsonResponse(
            quotaAccess.body,
            quotaAccess.status,
            quotaAccess.headers,
          );
        }

        const ingredientsOcr = await tryFetchAzureIngredientPanelOcr(
          ingredientsImage,
          telemetry,
        );
        const aiResult = await fetchOpenAiExtraction({
          currentProduct,
          ingredientsImage,
          productImage,
          ingredientsOcr,
          telemetry,
        });

        finishCanonicalPersistence = telemetry.start(
          "canonical_persistence_database_work",
          { provider: "supabase" },
        );

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
            },
          );

        if (offProductsError) {
          throw new Error(
            `[supabase:${TABLES.products}] ${offProductsError.message}`,
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
            },
          );

        if (classificationError) {
          throw new Error(
            `[supabase:${TABLES.classification}] ${classificationError.message}`,
          );
        }

        if (!aiResult.classification.is_supplement) {
          finishCanonicalPersistence?.({
            resultStatus: "not_supplement",
            success: true,
          });
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
            },
          );

        if (extractionError) {
          throw new Error(
            `[supabase:${TABLES.extraction}] ${extractionError.message}`,
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
            },
          );

        if (namingError) {
          throw new Error(`[supabase:${TABLES.naming}] ${namingError.message}`);
        }

        const [aliasRows, approvedSupplements] = await Promise.all([
          fetchAliasRows(),
          fetchApprovedSupplements(),
        ]);

        const aliasIndex = buildAliasIndex(aliasRows);
        const supplementNameIndex =
          buildSupplementNameIndex(approvedSupplements);
        const rawOcrText =
          aiResult.productText.ingredient_panel_text ||
          aiResult.productText.raw_text ||
          "";
        const resolvedIngredients = buildResolvedActiveIngredientRows({
          productId: productResolution.productId,
          ingredients: aiResult.extraction.ingredients_found,
          modelExtractedRowCount: aiResult.rowLifecycle.modelExtractedRowCount,
          initialModelIngredientTypes:
            aiResult.rowLifecycle.initialModelIngredientTypes,
          deterministicallyRecoveredModelRowIndexes:
            aiResult.rowLifecycle.deterministicallyRecoveredModelRowIndexes,
          visuallyVerifiedRecoveredRowIndexes:
            aiResult.rowLifecycle.visuallyVerifiedRecoveredRowIndexes,
          aliasIndex,
          supplementNameIndex,
          ocrText: rawOcrText,
        });

        if (!resolvedIngredients.activeRows.length) {
          finishCanonicalPersistence?.({
            resultStatus: "no_active_ingredients",
            success: false,
            errorCategory: "no_active_ingredients",
          });
          emitIngredientRowLifecycleTelemetry({
            telemetry,
            modelInputRowCount: aiResult.rowLifecycle.modelExtractedRowCount,
            ocrLogicalCandidateCount:
              aiResult.rowLifecycle.ocrLogicalCandidateCount,
            unmatchedOcrCandidateRowCount:
              aiResult.rowLifecycle.unmatchedOcrCandidateRowCount,
            ocrRows: aiResult.rowLifecycle.ocrRows,
            finalRows: resolvedIngredients.rowLifecycle,
            persistenceInputRowCount: resolvedIngredients.rows.length,
            persistenceActiveRowCount: 0,
          });
          return jsonResponse(
            {
              error:
                "We couldn't read any usable active supplement ingredients from those photos.",
            },
            422,
          );
        }

        const persistenceResult = await replaceCanonicalRows({
          productId: productResolution.productId,
          barcode,
          rowsToInsert: resolvedIngredients.rows,
          masterRows: resolvedIngredients.activeRows,
          displayName,
          servingSizeText: aiResult.extraction.serving_size_text,
          namingConfidence: aiResult.naming.confidence,
        });
        finishCanonicalPersistence?.({
          ingredientCount: resolvedIngredients.activeRows.length,
          rowCount: resolvedIngredients.rows.length,
          success: true,
        });
        emitIngredientRowLifecycleTelemetry({
          telemetry,
          modelInputRowCount: aiResult.rowLifecycle.modelExtractedRowCount,
          ocrLogicalCandidateCount:
            aiResult.rowLifecycle.ocrLogicalCandidateCount,
          unmatchedOcrCandidateRowCount:
            aiResult.rowLifecycle.unmatchedOcrCandidateRowCount,
          ocrRows: aiResult.rowLifecycle.ocrRows,
          finalRows: resolvedIngredients.rowLifecycle,
          persistenceInputRowCount: resolvedIngredients.rows.length,
          persistenceActiveRowCount: resolvedIngredients.activeRows.length,
        });

        const finishScoreRefresh = telemetry.start("score_refresh_follow_up", {
          provider: "supabase",
        });
        try {
          const queuedScoreRefresh = await enqueueProductScoreRefresh({
            adminSupabase,
            productId: productResolution.productId,
            reason: "photo_product_ingredients_persisted",
          });
          if (!queuedScoreRefresh) {
            console.warn("[photo-improvement-follow-up]", {
              productId: productResolution.productId,
              warning: "score_refresh_enqueue_failed",
            });
          }
          finishScoreRefresh({ success: Boolean(queuedScoreRefresh) });
        } catch (error) {
          finishScoreRefresh({ success: false, error });
          console.warn("[photo-improvement-follow-up]", {
            productId: productResolution.productId,
            warning: "score_refresh_enqueue_failed",
          });
        }

        const finishReviewArtifacts = telemetry.start(
          "review_provenance_artifact_creation",
          { provider: "supabase" },
        );
        let affectedReviewNames;
        try {
          affectedReviewNames = await replaceReviewArtifacts({
            productId: productResolution.productId,
            unresolvedRows: resolvedIngredients.unresolvedRows,
            malformedDosages: resolvedIngredients.malformedDosages,
            unverifiedDoses: resolvedIngredients.unverifiedDoses,
          });
          finishReviewArtifacts({
            rowCount: affectedReviewNames.length,
            success: true,
          });
        } catch (error) {
          finishReviewArtifacts({ success: false, error });
          throw error;
        }

        const finishReviewFollowUp = telemetry.start(
          "review_follow_up_scheduling",
        );
        const queuedReviewFollowUp = queueReviewCandidateRefresh(
          affectedReviewNames,
          telemetry,
        );
        finishReviewFollowUp({
          resultStatus: queuedReviewFollowUp ? "queued" : "not_required",
          rowCount: affectedReviewNames.length,
          success: true,
        });

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
          ingredients: buildMasterActiveIngredients(
            resolvedIngredients.activeRows,
          ),
          servingSizeText: aiResult.extraction.serving_size_text,
          rawText: aiResult.productText.raw_text,
          unresolvedIngredientCount: resolvedIngredients.unresolvedRows.length,
          committedRevision: persistenceResult.committedRevision,
          acceptedAttemptId: persistenceResult.acceptedAttemptId,
        });
      } catch (error) {
        finishCanonicalPersistence?.({ success: false, error });
        if (error instanceof PhotoVerificationUnresolvedError) {
          return jsonResponse(
            {
              error:
                "We couldn't verify every questionable ingredient row. Please retake a clear, straight-on photo of the full ingredient panel.",
              code: "photo_verification_unresolved",
            },
            422,
          );
        }
        return jsonResponse(
          {
            error: "Unexpected scan-supplement-photos failure",
            details: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    },
  );
});
