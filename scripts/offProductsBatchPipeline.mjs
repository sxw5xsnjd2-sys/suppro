import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { access, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { hostname as getHostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
loadDotEnv(path.join(PROJECT_ROOT, ".env"), {
  overrideKeys: new Set(["OPENAI_API_KEY"]),
});
const DEFAULT_MAX_BATCH_SIZE = 10000;
const DEFAULT_MAX_POLL_MS = 12 * 60 * 60 * 1000;
const MAX_BATCH_SIZE = Math.max(
  1,
  Number.parseInt(process.env.OFF_PRODUCTS_MAX_BATCH_SIZE || "", 10) ||
    DEFAULT_MAX_BATCH_SIZE
);
let artifactSequence = 0;
const CONFIGURED_MAX_POLL_MS = parseOptionalInteger(
  process.env.OFF_PRODUCTS_MAX_POLL_MS
);

const CONFIG = {
  tmpDir: process.env.OFF_PRODUCTS_BATCH_TMP_DIR || "/tmp/suppro-off-batch",
  completionWindow: "24h",
  defaultBatchSize: clampBatchSizeRaw(
    Number.parseInt(process.env.OFF_PRODUCTS_BATCH_SIZE || "", 10) || 2000
  ),
  maxBatchSize: MAX_BATCH_SIZE,
  defaultParallelJobs: Math.max(
    1,
    Number.parseInt(process.env.OFF_PRODUCTS_MAX_PARALLEL_JOBS || "", 10) || 20
  ),
  pageSize: 500,
  fetchChunkSize: Math.max(
    25,
    Number.parseInt(process.env.OFF_PRODUCTS_FETCH_CHUNK_SIZE || "", 10) || 100
  ),
  maxRetries: 3,
  pollMs: 5000,
  maxPollMs:
    CONFIGURED_MAX_POLL_MS && CONFIGURED_MAX_POLL_MS > 0
      ? CONFIGURED_MAX_POLL_MS
      : DEFAULT_MAX_POLL_MS,
  supabaseRetryAttempts: Math.max(
    1,
    Number.parseInt(process.env.OFF_PRODUCTS_SUPABASE_RETRY_ATTEMPTS || "", 10) ||
      5
  ),
  supabaseRetryBaseMs: Math.max(
    250,
    Number.parseInt(process.env.OFF_PRODUCTS_SUPABASE_RETRY_BASE_MS || "", 10) ||
      1500
  ),
  openAiEnqueuedTokenLimit: Math.max(
    1,
    Number.parseInt(
      process.env.OFF_PRODUCTS_OPENAI_ENQUEUED_TOKEN_LIMIT || "",
      10
    ) || 2_000_000
  ),
  openAiEnqueuedTokenSafetyFraction: Math.min(
    0.95,
    Math.max(
      0.1,
      parseOptionalNumber(
        process.env.OFF_PRODUCTS_OPENAI_ENQUEUED_TOKEN_SAFETY_FRACTION
      ) ?? 0.7
    )
  ),
  openAiCharsPerTokenEstimate: Math.max(
    1,
    parseOptionalNumber(process.env.OFF_PRODUCTS_OPENAI_CHARS_PER_TOKEN) ?? 3
  ),
  openAiEnqueueRetryBaseMs: Math.max(
    1000,
    Number.parseInt(
      process.env.OFF_PRODUCTS_OPENAI_ENQUEUE_RETRY_BASE_MS || "",
      10
    ) || 30000
  ),
  openAiEnqueueRetryMaxAttempts: Math.max(
    1,
    Number.parseInt(
      process.env.OFF_PRODUCTS_OPENAI_ENQUEUE_RETRY_MAX_ATTEMPTS || "",
      10
    ) || 20
  ),
  openAiRequestRetryAttempts: Math.max(
    1,
    Number.parseInt(
      process.env.OFF_PRODUCTS_OPENAI_REQUEST_RETRY_ATTEMPTS || "",
      10
    ) || 5
  ),
  openAiRequestRetryBaseMs: Math.max(
    500,
    Number.parseInt(
      process.env.OFF_PRODUCTS_OPENAI_REQUEST_RETRY_BASE_MS || "",
      10
    ) || 2000
  ),
  pipelineBlockedResumeMs: Math.max(
    5000,
    Number.parseInt(
      process.env.OFF_PRODUCTS_PIPELINE_BLOCKED_RESUME_MS || "",
      10
    ) || 60000
  ),
  pipelineRunnerLockStaleMs: Math.max(
    60000,
    Number.parseInt(
      process.env.OFF_PRODUCTS_PIPELINE_RUNNER_LOCK_STALE_MS || "",
      10
    ) || 10 * 60 * 1000
  ),
  pipelineJobRecoveryBaseMs: Math.max(
    1000,
    Number.parseInt(
      process.env.OFF_PRODUCTS_PIPELINE_JOB_RECOVERY_BASE_MS || "",
      10
    ) || 15000
  ),
  pipelineJobRecoveryMaxRetries: Math.max(
    1,
    Number.parseInt(
      process.env.OFF_PRODUCTS_PIPELINE_JOB_RECOVERY_MAX_RETRIES || "",
      10
    ) || 12
  ),
  classifyPromptVersion: "off_classify_v1",
  extractPromptVersion: "off_extract_v1",
  namingPromptVersion: "off_naming_v1",
  models: {
    classify: {
      nano_primary:
        process.env.OFF_PRODUCTS_CLASSIFY_NANO_MODEL || "gpt-5.4-nano",
      mini_fallback:
        process.env.OFF_PRODUCTS_CLASSIFY_MINI_MODEL || "gpt-5.4-mini",
    },
    extract: {
      nano_primary:
        process.env.OFF_PRODUCTS_EXTRACT_NANO_MODEL || "gpt-5.4-nano",
      mini_fallback:
        process.env.OFF_PRODUCTS_EXTRACT_MINI_MODEL || "gpt-5.4-mini",
    },
    naming: {
      nano_primary:
        process.env.OFF_PRODUCTS_NAMING_NANO_MODEL || "gpt-5.4-nano",
      mini_fallback:
        process.env.OFF_PRODUCTS_NAMING_MINI_MODEL || "gpt-5.4-mini",
    },
    aliasMatch:
      process.env.OFF_PRODUCTS_ALIAS_MATCH_MODEL || "gpt-5.4-mini",
  },
  thresholds: {
    extract: 0.85,
    miniFallback: 0.6,
    namingMiniFallback: 0.75,
  },
  pricingUsdPer1M: {
    "gpt-5.4-nano": {
      input:
        parseOptionalNumber(process.env.PRICE_GPT_5_4_NANO_INPUT_USD_PER_1M) ??
        null,
      output:
        parseOptionalNumber(process.env.PRICE_GPT_5_4_NANO_OUTPUT_USD_PER_1M) ??
        null,
    },
    "gpt-5.4-mini": {
      input:
        parseOptionalNumber(process.env.PRICE_GPT_5_4_MINI_INPUT_USD_PER_1M) ??
        null,
      output:
        parseOptionalNumber(process.env.PRICE_GPT_5_4_MINI_OUTPUT_USD_PER_1M) ??
        null,
    },
  },
  tables: {
    candidates: "off_products_non_obvious_food",
    products: "off_products",
    classification: "off_products_ai_classification",
    extraction: "off_products_ai_extraction",
    naming: "off_products_ai_naming",
    supplementMaster: "supplement_products_master",
    supplements: "supplements",
    missingSupplements: "supplement_missing_catalog_candidates",
    missingSupplementOccurrences: "supplement_missing_catalog_occurrences",
    aliases: "supplement_aliases",
    activeIngredients: "product_active_ingredients",
    catalogReviewCandidates: "supplement_catalog_review_candidates",
    reviewQueue: "supplement_review_queue",
    pipelineRuns: "off_products_pipeline_runs",
    pipelineJobs: "off_products_pipeline_jobs",
    pipelineRetryQueue: "off_products_pipeline_retry_queue",
  },
  columns: {
    candidates: {
      productId: "id",
    },
    products: {
      productId: "id",
      barcode: "barcode",
      name: "name",
      ingredients: "ingredients",
    },
    classification: {
      productId: "product_id",
      barcode: "barcode",
      name: "name",
      ingredients: "ingredients",
      contentHash: "content_hash",
      model: "classification_model",
      promptVersion: "classification_prompt_version",
      batchId: "batch_id",
      rawResponse: "raw_ai_json",
      isSupplement: "is_supplement",
      confidence: "supplement_confidence",
      category: "supplement_category",
      shouldExtract: "should_extract",
      reason: "classification_reason",
      processedAt: "processed_at",
    },
    extraction: {
      productId: "product_id",
      contentHash: "content_hash",
      model: "extraction_model",
      promptVersion: "extraction_prompt_version",
      batchId: "batch_id",
      rawResponse: "raw_ai_json",
      status: "extraction_status",
      servingSizeText: "serving_size_text",
      notes: "notes",
      processedAt: "processed_at",
    },
    naming: {
      productId: "product_id",
      contentHash: "content_hash",
      model: "naming_model",
      promptVersion: "naming_prompt_version",
      batchId: "batch_id",
      rawResponse: "raw_ai_json",
      displayName: "display_name",
      brandName: "brand_name",
      productType: "product_type",
      formFactor: "form_factor",
      flavor: "flavor",
      confidence: "confidence",
      notes: "notes",
      processedAt: "processed_at",
    },
    supplementMaster: {
      productId: "product_id",
      displayName: "display_name",
      servingSizeText: "serving_size_text",
      nameSource: "name_source",
      namingConfidence: "naming_confidence",
      activeIngredientsJson: "active_ingredients_json",
      ingredientCount: "ingredient_count",
      processedAt: "processed_at",
    },
    supplements: {
      supplementId: "id",
      name: "name",
      status: "status",
    },
    missingSupplements: {
      normalizedName: "normalized_name",
      displayName: "display_name",
      occurrenceCount: "occurrence_count",
      firstSeenAt: "first_seen_at",
      lastSeenAt: "last_seen_at",
    },
    missingSupplementOccurrences: {
      normalizedName: "normalized_name",
      productId: "product_id",
      displayName: "display_name",
      firstSeenAt: "first_seen_at",
      lastSeenAt: "last_seen_at",
    },
    aliases: {
      aliasNameCandidates: ["alias"],
      normalizedNameCandidates: ["alias_normalized"],
      supplementIdCandidates: ["supplement_id"],
      canonicalNameCandidates: ["alias"],
    },
    activeIngredients: {
      productId: "product_id",
      rawName: "raw_name",
      canonicalName: "canonical_name",
      ingredientType: "ingredient_type",
      dosageValue: "dosage_value",
      dosageUnit: "dosage_unit",
      dosageOriginalText: "dosage_original_text",
      chemicalForm: "chemical_form",
      amountBasis: "amount_basis",
      supplementId: "canonical_supplement_id",
      resolutionStatus: "resolution_status",
      resolutionConfidence: "resolution_confidence",
      sourceModel: "source_model",
      sourcePromptVersion: "source_prompt_version",
      createdAt: "created_at",
    },
    catalogReviewCandidates: {
      normalizedName: "normalized_name",
      displayName: "display_name",
      occurrenceCount: "occurrence_count",
      sampleActiveIngredientsJson: "sample_active_ingredients_json",
      sampleProductsJson: "sample_products_json",
      suggestedAction: "suggested_action",
      suggestedSupplementName: "suggested_supplement_name",
      suggestionConfidence: "suggestion_confidence",
      suggestionReason: "suggestion_reason",
      sourceLatestCreatedAt: "source_latest_created_at",
      reviewStatus: "review_status",
      approvedSupplementId: "approved_supplement_id",
      approvedSupplementName: "approved_supplement_name",
      reviewNotes: "review_notes",
      createdAt: "created_at",
      updatedAt: "updated_at",
      firstSeenAt: "first_seen_at",
      lastSeenAt: "last_seen_at",
    },
    reviewQueue: {
      productId: "product_id",
      reviewType: "review_type",
      payload: "payload",
      status: "status",
      reviewedAt: "reviewed_at",
      createdAt: "created_at",
    },
    pipelineRuns: {
      runId: "id",
      status: "status",
      requestedWaves: "requested_waves",
      requestedJobs: "requested_jobs",
      classifyLimit: "classify_limit",
      namingLimit: "naming_limit",
      extractLimit: "extract_limit",
      aliasLimit: "alias_limit",
      classifyPass: "classify_pass",
      namingPass: "naming_pass",
      extractPass: "extract_pass",
      startProductId: "start_product_id",
      lastCompletedProductId: "last_completed_product_id",
      currentWaveIndex: "current_wave_index",
      createdAt: "created_at",
      updatedAt: "updated_at",
      completedAt: "completed_at",
      blockedAt: "blocked_at",
    },
    pipelineJobs: {
      runId: "run_id",
      waveIndex: "wave_index",
      stage: "stage",
      jobIndex: "job_index",
      status: "status",
      passType: "pass_type",
      startProductId: "start_product_id",
      endProductId: "end_product_id",
      rowCount: "row_count",
      manifestPath: "manifest_path",
      jsonlPath: "jsonl_path",
      inputFileId: "input_file_id",
      batchId: "batch_id",
      errorMessage: "error_message",
      retryCount: "retry_count",
      createdAt: "created_at",
      updatedAt: "updated_at",
      submittedAt: "submitted_at",
      completedAt: "completed_at",
    },
    pipelineRetryQueue: {
      queueId: "id",
      sourceRunId: "source_run_id",
      sourceWaveIndex: "source_wave_index",
      sourceStage: "source_stage",
      sourceJobIndex: "source_job_index",
      status: "status",
      passType: "pass_type",
      startProductId: "start_product_id",
      endProductId: "end_product_id",
      rowCount: "row_count",
      lastBatchId: "last_batch_id",
      lastErrorMessage: "last_error_message",
      failureCount: "failure_count",
      retryAttemptCount: "retry_attempt_count",
      createdAt: "created_at",
      updatedAt: "updated_at",
      firstFailedAt: "first_failed_at",
      lastFailedAt: "last_failed_at",
      lastRetryAt: "last_retry_at",
      resolvedAt: "resolved_at",
    },
  },
  reviewTypes: {
    classificationLowConfidence: "classification_low_confidence",
    extractionFailed: "extraction_failed",
    dosageMalformed: "dosage_malformed",
    aliasUnresolved: "alias_unresolved",
    retryExhausted: "retry_exhausted",
  },
  allowedUnits: new Set(["mcg", "mg", "g", "ml", "IU", "CFU"]),
};

const CLASSIFICATION_RESPONSE_SCHEMA = {
  name: "off_products_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      is_supplement: { type: "boolean" },
      confidence: { type: "number" },
      category: {
        type: "string",
        enum: [
          "vitamin_mineral",
          "herbal_botanical",
          "sports_nutrition",
          "protein",
          "electrolyte",
          "probiotic",
          "omega_fatty_acid",
          "other_supplement",
          "not_supplement",
        ],
      },
      should_extract: { type: "boolean" },
      reason: { type: "string" },
    },
    required: [
      "is_supplement",
      "confidence",
      "category",
      "should_extract",
      "reason",
    ],
  },
};

const EXTRACTION_RESPONSE_SCHEMA = {
  name: "off_products_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      is_supplement: { type: "boolean" },
      serving_size_text: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
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
              enum: [
                "per_serving",
                "per_capsule",
                "per_tablet",
                "per_softgel",
                "per_scoop",
                "per_100g",
                "unknown",
                null,
              ],
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
      "serving_size_text",
      "notes",
      "ingredients_found",
    ],
  },
};

const NAMING_RESPONSE_SCHEMA = {
  name: "off_products_naming",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      display_name: { type: "string" },
      brand_name: { type: ["string", "null"] },
      product_type: { type: ["string", "null"] },
      form_factor: { type: ["string", "null"] },
      flavor: { type: ["string", "null"] },
      confidence: { type: "number" },
      notes: { type: ["string", "null"] },
    },
    required: [
      "display_name",
      "brand_name",
      "product_type",
      "form_factor",
      "flavor",
      "confidence",
      "notes",
    ],
  },
};

const ALIAS_MATCH_RESPONSE_SCHEMA = {
  name: "off_products_alias_match",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: {
        type: "string",
        enum: ["match_existing", "no_match"],
      },
      supplement_id: { type: ["string", "null"] },
      alias: { type: ["string", "null"] },
      confidence: { type: "number" },
      reason: { type: "string" },
    },
    required: [
      "decision",
      "supplement_id",
      "alias",
      "confidence",
      "reason",
    ],
  },
};

const ALIAS_TRIAGE_RESPONSE_SCHEMA = {
  name: "off_products_alias_triage",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: {
        type: "string",
        enum: ["match_existing", "no_match"],
      },
      supplement_id: { type: ["string", "null"] },
      supplement_name: { type: ["string", "null"] },
      alias: { type: ["string", "null"] },
      confidence: { type: "number" },
      reason: { type: "string" },
    },
    required: [
      "decision",
      "supplement_id",
      "supplement_name",
      "alias",
      "confidence",
      "reason",
    ],
  },
};

const CATALOG_REVIEW_RESPONSE_SCHEMA = {
  name: "off_products_catalog_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: {
        type: "string",
        enum: ["create_canonical", "ignore", "manual_review"],
      },
      suggested_supplement_name: { type: ["string", "null"] },
      confidence: { type: "number" },
      reason: { type: "string" },
    },
    required: [
      "decision",
      "suggested_supplement_name",
      "confidence",
      "reason",
    ],
  },
};

const HELP_TEXT = `
Usage:
  node scripts/offProductsBatchPipeline.mjs classify:build --pass nano_primary|mini_fallback [--limit 2000] [--after-product-id 0]
  node scripts/offProductsBatchPipeline.mjs classify:parallel [--jobs 20] [--limit 10000] [--pass nano_primary|mini_fallback] [--after-product-id 0]
  node scripts/offProductsBatchPipeline.mjs batch:submit --manifest /tmp/suppro-off-batch/manifest.json
  node scripts/offProductsBatchPipeline.mjs classify:ingest --batch-id batch_...
  node scripts/offProductsBatchPipeline.mjs naming:build --pass nano_primary|mini_fallback [--limit 2000] [--after-product-id 0]
  node scripts/offProductsBatchPipeline.mjs naming:ingest --batch-id batch_...
  node scripts/offProductsBatchPipeline.mjs extract:build --pass nano_primary|mini_fallback [--limit 2000] [--after-product-id 0]
  node scripts/offProductsBatchPipeline.mjs extract:ingest --batch-id batch_...
  node scripts/offProductsBatchPipeline.mjs aliases:resolve [--limit 500]
  node scripts/offProductsBatchPipeline.mjs aliases:backfill [--limit 5000] [--product-ids uuid,uuid] [--start-product-id uuid] [--end-product-id uuid]
  node scripts/offProductsBatchPipeline.mjs aliases:ai-match [--limit 100] [--min-confidence 0.9] [--candidate-limit 20] [--dry-run]
  node scripts/offProductsBatchPipeline.mjs aliases:ai-match-loop [--limit 100] [--cycles 100] [--min-confidence 0.9] [--candidate-limit 20] [--dry-run]
  node scripts/offProductsBatchPipeline.mjs aliases:ai-triage [--limit 100] [--min-confidence 0.9] [--candidate-limit 20] [--dry-run]
  node scripts/offProductsBatchPipeline.mjs aliases:ai-triage-loop [--limit 100] [--cycles 100] [--min-confidence 0.9] [--candidate-limit 20] [--dry-run]
  node scripts/offProductsBatchPipeline.mjs catalog:review [--limit 100] [--min-confidence 0.85] [--dry-run]
  node scripts/offProductsBatchPipeline.mjs catalog:review-loop [--limit 100] [--cycles 100] [--min-confidence 0.85] [--dry-run]
  node scripts/offProductsBatchPipeline.mjs run:cycle [--classify-limit 1000] [--naming-limit 200] [--extract-limit 200] [--alias-limit 500] [--after-product-id uuid]
  node scripts/offProductsBatchPipeline.mjs run:loop [--cycles 50] [--classify-limit 1000] [--naming-limit 200] [--extract-limit 200] [--alias-limit 500] [--after-product-id uuid]
  node scripts/offProductsBatchPipeline.mjs run:parallel [--waves 10] [--jobs 20] [--classify-limit 10000] [--naming-limit 10000] [--extract-limit 10000] [--alias-limit 10000] [--classify-pass nano_primary|mini_fallback] [--naming-pass nano_primary|mini_fallback] [--extract-pass nano_primary|mini_fallback] [--after-product-id uuid]
  node scripts/offProductsBatchPipeline.mjs retry:drain [--limit-jobs 25] [--stage classification|naming|extraction|alias]
  node scripts/offProductsBatchPipeline.mjs eval:sample [--limit-random 500] [--limit-likely 250] [--limit-edge 250]
  node scripts/offProductsBatchPipeline.mjs eval:score --input /absolute/path/to/labeled.csv

Required env:
  SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  OPENAI_API_KEY

Optional env:
  OFF_PRODUCTS_BATCH_SIZE
  OFF_PRODUCTS_MAX_BATCH_SIZE
  OFF_PRODUCTS_MAX_PARALLEL_JOBS
  OFF_PRODUCTS_SUPABASE_RETRY_ATTEMPTS
  OFF_PRODUCTS_SUPABASE_RETRY_BASE_MS
  OFF_PRODUCTS_OPENAI_ENQUEUED_TOKEN_LIMIT
  OFF_PRODUCTS_OPENAI_ENQUEUED_TOKEN_SAFETY_FRACTION
  OFF_PRODUCTS_OPENAI_CHARS_PER_TOKEN
  OFF_PRODUCTS_OPENAI_ENQUEUE_RETRY_BASE_MS
  OFF_PRODUCTS_OPENAI_ENQUEUE_RETRY_MAX_ATTEMPTS
  OFF_PRODUCTS_OPENAI_REQUEST_RETRY_ATTEMPTS
  OFF_PRODUCTS_OPENAI_REQUEST_RETRY_BASE_MS
  OFF_PRODUCTS_PIPELINE_BLOCKED_RESUME_MS
  OFF_PRODUCTS_PIPELINE_RUNNER_LOCK_STALE_MS
  OFF_PRODUCTS_PIPELINE_JOB_RECOVERY_BASE_MS
  OFF_PRODUCTS_PIPELINE_JOB_RECOVERY_MAX_RETRIES
  OFF_PRODUCTS_MAX_POLL_MS
  OFF_PRODUCTS_BATCH_TMP_DIR
  OFF_PRODUCTS_CLASSIFY_NANO_MODEL
  OFF_PRODUCTS_CLASSIFY_MINI_MODEL
  OFF_PRODUCTS_EXTRACT_NANO_MODEL
  OFF_PRODUCTS_EXTRACT_MINI_MODEL
  OFF_PRODUCTS_NAMING_NANO_MODEL
  OFF_PRODUCTS_NAMING_MINI_MODEL
  OFF_PRODUCTS_ALIAS_MATCH_MODEL
  OFF_PRODUCTS_ALIAS_MATCH_MIN_CONFIDENCE
  PRICE_GPT_5_4_NANO_INPUT_USD_PER_1M
  PRICE_GPT_5_4_NANO_OUTPUT_USD_PER_1M
  PRICE_GPT_5_4_MINI_INPUT_USD_PER_1M
  PRICE_GPT_5_4_MINI_OUTPUT_USD_PER_1M
`.trim();

const TERMINAL_BATCH_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);
const SUCCESSFUL_BATCH_STATUSES = new Set(["completed"]);
const PIPELINE_STAGE_ORDER = ["classification", "naming", "extraction", "alias"];

class BatchWaitTimeoutError extends Error {
  constructor(batchId, status, maxPollMs) {
    super(
      `Timed out waiting for batch ${batchId} after ${maxPollMs}ms. Last status: ${
        status || "unknown"
      }`
    );
    this.name = "BatchWaitTimeoutError";
    this.batchId = trimString(batchId);
    this.batchStatus = trimString(status);
    this.maxPollMs = maxPollMs;
  }
}

main().catch((error) => {
  console.error(
    "[off-products-batch] fatal",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === "--help" || command === "help") {
    console.log(HELP_TEXT);
    return;
  }

  await ensureDir(CONFIG.tmpDir);

  switch (command) {
    case "classify:build":
      await buildClassificationBatch(flags);
      return;
    case "classify:parallel":
      await runParallelClassificationBatches(flags);
      return;
    case "batch:submit":
      await submitBatch(flags);
      return;
    case "classify:ingest":
      await ingestClassificationBatch(flags);
      return;
    case "naming:build":
      await buildNamingBatch(flags);
      return;
    case "naming:ingest":
      await ingestNamingBatch(flags);
      return;
    case "extract:build":
      await buildExtractionBatch(flags);
      return;
    case "extract:ingest":
      await ingestExtractionBatch(flags);
      return;
    case "aliases:resolve":
      await resolveAliases(flags);
      return;
    case "aliases:backfill":
      await backfillResolvedAliases(flags);
      return;
    case "aliases:ai-match":
      await runAiAliasMatch(flags);
      return;
    case "aliases:ai-match-loop":
      await runAiAliasMatchLoop(flags);
      return;
    case "aliases:ai-triage":
      await runAiAliasTriage(flags);
      return;
    case "aliases:ai-triage-loop":
      await runAiAliasTriageLoop(flags);
      return;
    case "catalog:review":
      await runCatalogReview(flags);
      return;
    case "catalog:review-loop":
      await runCatalogReviewLoop(flags);
      return;
    case "run:cycle":
      await runPipelineCycle(flags);
      return;
    case "run:loop":
      await runPipelineLoop(flags);
      return;
    case "run:parallel":
      await runParallelPipeline(flags);
      return;
    case "retry:drain":
      await drainPipelineRetryQueue(flags);
      return;
    case "eval:sample":
      await exportEvalSample(flags);
      return;
    case "eval:score":
      await scoreEval(flags);
      return;
    default:
      throw new Error(`Unknown command "${command}".\n\n${HELP_TEXT}`);
  }
}

async function runPipelineCycle(flags) {
  const classifyLimit = resolveLimit(
    flags["classify-limit"] || flags.limit || 1000
  );
  const namingLimit = resolveLimit(
    flags["naming-limit"] || flags["namingLimit"] || 200
  );
  const extractLimit = resolveLimit(
    flags["extract-limit"] || flags["extractLimit"] || 200
  );
  const aliasLimit = Math.max(
    1,
    parseOptionalInteger(flags["alias-limit"] || flags["aliasLimit"]) || 500
  );
  const classifyPass = requirePassType(flags["classify-pass"] || "nano_primary", [
    "nano_primary",
    "mini_fallback",
  ]);
  const namingPass = requirePassType(flags["naming-pass"] || "nano_primary", [
    "nano_primary",
    "mini_fallback",
  ]);
  const extractPass = requirePassType(flags["extract-pass"] || "nano_primary", [
    "nano_primary",
    "mini_fallback",
  ]);

  const supabase = createAdminClient();
  const afterProductId =
    normalizeId(flags["after-product-id"]) ||
    (await fetchLastProcessedClassificationProductId(supabase));

  console.log(
    "[run:cycle] starting",
    JSON.stringify({
      after_product_id: afterProductId || null,
      classify_limit: classifyLimit,
      naming_limit: namingLimit,
      extract_limit: extractLimit,
      alias_limit: aliasLimit,
      classify_pass: classifyPass,
      naming_pass: namingPass,
      extract_pass: extractPass,
    })
  );

  const classificationManifest = await buildClassificationBatch({
    pass: classifyPass,
    limit: classifyLimit,
    "after-product-id": afterProductId || "",
  });

  if (!classificationManifest) {
    console.log("[run:cycle] no classification candidates");
    return {
      classification_rows: 0,
      naming_rows: 0,
      extraction_rows: 0,
      last_product_id: afterProductId || null,
    };
  }

  const classificationSubmission = await submitBatch({
    manifest: classificationManifest.manifest_path,
  });
  let classificationRows = 0;
  try {
    const classificationIngestion = await ingestClassificationBatch({
      "batch-id": classificationSubmission.batch_id,
    });
    classificationRows =
      parseOptionalInteger(classificationIngestion?.inserted) ||
      classificationManifest.row_count ||
      0;
  } catch (error) {
    if (isBatchWaitTimeoutError(error)) {
      return buildBlockedCycleResult({
        stage: "classification",
        batchId: classificationSubmission.batch_id,
        classificationRows: 0,
        namingRows: 0,
        extractionRows: 0,
        lastProductId: afterProductId || null,
      });
    }
    throw error;
  }

  const namingAfterProductId =
    normalizeId(flags["naming-after-product-id"]) ||
    (await fetchLastProcessedNamingProductId(supabase));
  const namingManifest = await buildNamingBatch({
    pass: namingPass,
    limit: namingLimit,
    "after-product-id": namingAfterProductId || "",
  });

  let namingRows = 0;
  if (namingManifest) {
    const namingSubmission = await submitBatch({
      manifest: namingManifest.manifest_path,
    });
    try {
      const namingIngestion = await ingestNamingBatch({
        "batch-id": namingSubmission.batch_id,
      });
      namingRows =
        parseOptionalInteger(namingIngestion?.inserted) ||
        namingManifest.row_count ||
        0;
    } catch (error) {
      if (isBatchWaitTimeoutError(error)) {
        return buildBlockedCycleResult({
          stage: "naming",
          batchId: namingSubmission.batch_id,
          classificationRows,
          namingRows: 0,
          extractionRows: 0,
          lastProductId:
            classificationManifest.items?.at(-1)?.product_id || afterProductId || null,
        });
      }
      throw error;
    }
  }

  const extractionManifest = await buildExtractionBatch({
    pass: extractPass,
    limit: extractLimit,
  });

  let extractionRows = 0;
  if (extractionManifest) {
    const extractionSubmission = await submitBatch({
      manifest: extractionManifest.manifest_path,
    });
    try {
      const extractionIngestion = await ingestExtractionBatch({
        "batch-id": extractionSubmission.batch_id,
      });
      extractionRows =
        parseOptionalInteger(extractionIngestion?.inserted) ||
        extractionManifest.row_count ||
        0;
    } catch (error) {
      if (isBatchWaitTimeoutError(error)) {
        return buildBlockedCycleResult({
          stage: "extraction",
          batchId: extractionSubmission.batch_id,
          classificationRows,
          namingRows,
          extractionRows: 0,
          lastProductId:
            classificationManifest.items?.at(-1)?.product_id || afterProductId || null,
        });
      }
      throw error;
    }
  } else {
    console.log("[run:cycle] no extraction candidates");
  }

  await resolveAliases({ limit: aliasLimit });

  const lastProductId =
    classificationManifest.items?.at(-1)?.product_id || afterProductId || null;
  console.log(
    "[run:cycle] completed",
    JSON.stringify({
      classification_rows: classificationManifest.row_count || 0,
      naming_rows: namingRows,
      extraction_rows: extractionRows,
      last_product_id: lastProductId,
    })
  );

  return {
    classification_rows: classificationManifest.row_count || 0,
    naming_rows: namingRows,
    extraction_rows: extractionRows,
    last_product_id: lastProductId,
  };
}

async function runPipelineLoop(flags) {
  const cycles = Math.max(1, parseOptionalInteger(flags.cycles) || 50);
  let nextAfterProductId = normalizeId(flags["after-product-id"]);

  for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex += 1) {
    console.log(`[run:loop] cycle ${cycleIndex + 1}/${cycles}`);
    const result = await runPipelineCycle({
      ...flags,
      "after-product-id": nextAfterProductId || flags["after-product-id"] || "",
    });

    if (result?.status === "blocked") {
      console.log(
        "[run:loop] stopping because cycle is blocked",
        JSON.stringify({
          stage: result.stage,
          batch_id: result.batch_id || null,
        })
      );
      return result;
    }

    if (!result?.classification_rows) {
      console.log("[run:loop] stopping because no classification candidates remain");
      return;
    }

    nextAfterProductId = normalizeId(result.last_product_id);
  }
}

async function runParallelPipeline(flags) {
  let runnerLease = null;
  runnerLease = await acquirePipelineRunnerLease();

  try {
    const requestedWaves = Math.max(1, parseOptionalInteger(flags.waves) || 10);
    const requestedJobs = resolveParallelJobCount(flags.jobs || flags.concurrency);
    const classifyLimit = resolveLimit(
      flags["classify-limit"] || flags.limit || 10000
    );
    const namingLimit = resolveLimit(
      flags["naming-limit"] || flags["namingLimit"] || classifyLimit
    );
    const extractLimit = resolveLimit(
      flags["extract-limit"] || flags["extractLimit"] || classifyLimit
    );
    const aliasLimit = resolveLimit(
      flags["alias-limit"] || flags["aliasLimit"] || classifyLimit
    );
    const classifyPass = requirePassType(flags["classify-pass"] || "nano_primary", [
      "nano_primary",
      "mini_fallback",
    ]);
    const namingPass = requirePassType(flags["naming-pass"] || "nano_primary", [
      "nano_primary",
      "mini_fallback",
    ]);
    const extractPass = requirePassType(flags["extract-pass"] || "nano_primary", [
      "nano_primary",
      "mini_fallback",
    ]);

    const supabase = createAdminClient();
    const requestedStartProductId =
      normalizeId(flags["after-product-id"]) ||
      (await fetchLastProcessedClassificationProductId(supabase));

    let run = await fetchLatestIncompletePipelineRun(supabase);
    if (run) {
      run = await reconcileParallelRunIntegrity(supabase, run);
      runnerLease = await touchPipelineRunnerLease(runnerLease, {
        runId: run.id,
        waveIndex: run.current_wave_index + 1,
      });
      console.log(
        "[run:parallel] resuming existing run",
        JSON.stringify({
          run_id: run.id,
          status: run.status,
          current_wave_index: run.current_wave_index,
          last_completed_product_id: run.last_completed_product_id || null,
        })
      );
      run = await updatePipelineRunFields(supabase, run.id, {
        [CONFIG.columns.pipelineRuns.status]: "running",
        [CONFIG.columns.pipelineRuns.blockedAt]: null,
        [CONFIG.columns.pipelineRuns.updatedAt]: new Date().toISOString(),
      });
    } else {
      run = await createPipelineRun(supabase, {
        requestedWaves,
        requestedJobs,
        classifyLimit,
        namingLimit,
        extractLimit,
        aliasLimit,
        classifyPass,
        namingPass,
        extractPass,
        startProductId: requestedStartProductId || null,
      });
      runnerLease = await touchPipelineRunnerLease(runnerLease, {
        runId: run.id,
        waveIndex: 1,
      });
      console.log(
        "[run:parallel] created run",
        JSON.stringify({
          run_id: run.id,
          requested_waves: run.requested_waves,
          requested_jobs: run.requested_jobs,
          start_product_id: run.start_product_id || null,
        })
      );
    }

    while (run.current_wave_index < run.requested_waves) {
      const waveIndex = run.current_wave_index + 1;
      runnerLease = await touchPipelineRunnerLease(runnerLease, {
        runId: run.id,
        waveIndex,
      });
      console.log(`[run:parallel] wave ${waveIndex}/${run.requested_waves}`);

      const result = await runParallelPipelineWave({
        supabase,
        run,
        waveIndex,
      });

      if (result.status === "no_candidates") {
        run = await updatePipelineRunFields(supabase, run.id, {
          [CONFIG.columns.pipelineRuns.status]: "completed",
          [CONFIG.columns.pipelineRuns.completedAt]: new Date().toISOString(),
          [CONFIG.columns.pipelineRuns.updatedAt]: new Date().toISOString(),
        });
        console.log("[run:parallel] no more candidates");
        return run;
      }

      if (result.status === "blocked") {
        run = await updatePipelineRunFields(supabase, run.id, {
          [CONFIG.columns.pipelineRuns.status]: "blocked",
          [CONFIG.columns.pipelineRuns.currentWaveIndex]: waveIndex - 1,
          [CONFIG.columns.pipelineRuns.blockedAt]: new Date().toISOString(),
          [CONFIG.columns.pipelineRuns.updatedAt]: new Date().toISOString(),
        });
        console.log(
          "[run:parallel] blocked awaiting stage recovery",
          JSON.stringify({
            run_id: run.id,
            wave_index: waveIndex,
            stage: result.stage,
            batch_id: result.batch_id || null,
          })
        );
        console.log(
          "[run:parallel] retrying blocked wave after delay",
          JSON.stringify({
            run_id: run.id,
            wave_index: waveIndex,
            delay_ms: CONFIG.pipelineBlockedResumeMs,
          })
        );
        await sleep(CONFIG.pipelineBlockedResumeMs);
        run = await fetchPipelineRunById(supabase, run.id);
        continue;
      }

      if (result.status !== "succeeded") {
        run = await updatePipelineRunFields(supabase, run.id, {
          [CONFIG.columns.pipelineRuns.status]: "blocked",
          [CONFIG.columns.pipelineRuns.currentWaveIndex]: waveIndex - 1,
          [CONFIG.columns.pipelineRuns.blockedAt]: new Date().toISOString(),
          [CONFIG.columns.pipelineRuns.updatedAt]: new Date().toISOString(),
        });
        throw new Error(
          result.error_message ||
            `[run:parallel] wave ${waveIndex} failed during ${result.stage}`
        );
      }

      run = await fetchPipelineRunById(supabase, run.id);
    }

    run = await updatePipelineRunFields(supabase, run.id, {
      [CONFIG.columns.pipelineRuns.status]: "completed",
      [CONFIG.columns.pipelineRuns.completedAt]: new Date().toISOString(),
      [CONFIG.columns.pipelineRuns.updatedAt]: new Date().toISOString(),
    });

    console.log(
      "[run:parallel] completed",
      JSON.stringify({
        run_id: run.id,
        waves_completed: run.current_wave_index,
        last_completed_product_id: run.last_completed_product_id || null,
      })
    );
    return run;
  } finally {
    await releasePipelineRunnerLease(runnerLease);
  }
}

async function drainPipelineRetryQueue(flags) {
  const limitJobs = Math.max(
    1,
    parseOptionalInteger(flags["limit-jobs"] || flags.limit) || 25
  );
  const stage = trimString(flags.stage);
  if (stage && !PIPELINE_STAGE_ORDER.includes(stage)) {
    throw new Error(`Unsupported --stage "${stage}"`);
  }

  const supabase = createAdminClient();
  const entries = await fetchPipelineRetryQueueEntries(supabase, {
    limitJobs,
    stage,
  });

  if (!entries.length) {
    console.log("[retry:drain] no queued jobs");
    return {
      queued_jobs: 0,
      succeeded_jobs: 0,
      failed_jobs: 0,
      skipped_jobs: 0,
    };
  }

  let succeededJobs = 0;
  let failedJobs = 0;
  let skippedJobs = 0;

  for (const entry of entries) {
    console.log(
      "[retry:drain] processing",
      JSON.stringify({
        queue_id: entry.id,
        source_run_id: entry.source_run_id,
        wave_index: entry.source_wave_index,
        stage: entry.source_stage,
        job_index: entry.source_job_index,
      })
    );

    const result = await runPipelineRetryQueueEntry({ supabase, entry });
    if (result.status === "succeeded") {
      succeededJobs += 1;
    } else if (result.status === "skipped") {
      skippedJobs += 1;
    } else {
      failedJobs += 1;
    }
  }

  const summary = {
    queued_jobs: entries.length,
    succeeded_jobs: succeededJobs,
    failed_jobs: failedJobs,
    skipped_jobs: skippedJobs,
  };
  console.log("[retry:drain] completed", JSON.stringify(summary));
  return summary;
}

async function runPipelineRetryQueueEntry({ supabase, entry }) {
  const startedAt = new Date().toISOString();
  await updatePipelineRetryQueueEntry(supabase, entry.id, {
    [CONFIG.columns.pipelineRetryQueue.status]: "running",
    [CONFIG.columns.pipelineRetryQueue.updatedAt]: startedAt,
    [CONFIG.columns.pipelineRetryQueue.lastRetryAt]: startedAt,
  });

  let lastBatchId = trimString(entry.last_batch_id) || null;

  try {
    if (entry.source_stage === "alias") {
      const result = await resolveAliases({
        limit: entry.row_count || CONFIG.maxBatchSize,
        "start-product-id": entry.start_product_id || "",
        "end-product-id": entry.end_product_id || "",
      });

      await upsertPipelineJobRowsBestEffort(
        supabase,
        [
          buildPipelineRetrySourceJobPatch(entry, {
            status: "succeeded",
            rowCount:
              parseOptionalInteger(result?.extraction_rows_processed) ||
              entry.row_count ||
              0,
            errorMessage: null,
            completedAt: new Date().toISOString(),
          }),
        ],
        "retry:drain:alias-source-job"
      );
      await updatePipelineRetryQueueEntry(supabase, entry.id, {
        [CONFIG.columns.pipelineRetryQueue.status]: "succeeded",
        [CONFIG.columns.pipelineRetryQueue.lastErrorMessage]: null,
        [CONFIG.columns.pipelineRetryQueue.updatedAt]: new Date().toISOString(),
        [CONFIG.columns.pipelineRetryQueue.resolvedAt]: new Date().toISOString(),
      });
      return { status: "succeeded" };
    }

    const manifest = await buildPipelineRetryManifest(entry);
    if (!manifest) {
      await upsertPipelineJobRowsBestEffort(
        supabase,
        [
          buildPipelineRetrySourceJobPatch(entry, {
            status: "skipped",
            errorMessage: "No eligible rows remained for deferred retry",
            completedAt: new Date().toISOString(),
          }),
        ],
        "retry:drain:skip-source-job"
      );
      await updatePipelineRetryQueueEntry(supabase, entry.id, {
        [CONFIG.columns.pipelineRetryQueue.status]: "succeeded",
        [CONFIG.columns.pipelineRetryQueue.lastErrorMessage]:
          "No eligible rows remained for deferred retry",
        [CONFIG.columns.pipelineRetryQueue.updatedAt]: new Date().toISOString(),
        [CONFIG.columns.pipelineRetryQueue.resolvedAt]: new Date().toISOString(),
      });
      await enqueueDownstreamRetryQueueEntriesAfterRetry({
        supabase,
        entry,
      });
      return { status: "skipped" };
    }

    const submission = await submitBatch({
      manifest: manifest.manifest_path,
    });
    lastBatchId = trimString(submission?.batch_id) || lastBatchId;

    await ingestPipelineRetryBatch(entry.source_stage, lastBatchId);

    await upsertPipelineJobRowsBestEffort(
      supabase,
      [
        buildPipelineRetrySourceJobPatch(entry, {
          status: "succeeded",
          passType: manifest.pass_type || entry.pass_type || null,
          startProductId: manifest.start_product_id || entry.start_product_id,
          endProductId: manifest.end_product_id || entry.end_product_id,
          rowCount: manifest.row_count || entry.row_count || 0,
          manifestPath: manifest.manifest_path,
          jsonlPath: manifest.jsonl_path,
          inputFileId: submission.input_file_id || null,
          batchId: submission.batch_id || null,
          errorMessage: null,
          submittedAt: submission.submitted_at || startedAt,
          completedAt: new Date().toISOString(),
        }),
      ],
      "retry:drain:source-job"
    );

    await updatePipelineRetryQueueEntry(supabase, entry.id, {
      [CONFIG.columns.pipelineRetryQueue.status]: "succeeded",
      [CONFIG.columns.pipelineRetryQueue.lastBatchId]: lastBatchId,
      [CONFIG.columns.pipelineRetryQueue.lastErrorMessage]: null,
      [CONFIG.columns.pipelineRetryQueue.updatedAt]: new Date().toISOString(),
      [CONFIG.columns.pipelineRetryQueue.resolvedAt]: new Date().toISOString(),
    });
    await enqueueDownstreamRetryQueueEntriesAfterRetry({
      supabase,
      entry,
    });
    return { status: "succeeded" };
  } catch (error) {
    const errorMessage = trimString(error?.message) || String(error);
    const now = new Date().toISOString();
    await updatePipelineRetryQueueEntry(supabase, entry.id, {
      [CONFIG.columns.pipelineRetryQueue.status]: "pending",
      [CONFIG.columns.pipelineRetryQueue.lastBatchId]: lastBatchId,
      [CONFIG.columns.pipelineRetryQueue.lastErrorMessage]: errorMessage,
      [CONFIG.columns.pipelineRetryQueue.retryAttemptCount]:
        (entry.retry_attempt_count || 0) + 1,
      [CONFIG.columns.pipelineRetryQueue.updatedAt]: now,
      [CONFIG.columns.pipelineRetryQueue.lastFailedAt]: now,
      [CONFIG.columns.pipelineRetryQueue.resolvedAt]: null,
    });
    return { status: "failed", error_message: errorMessage };
  }
}

async function buildPipelineRetryManifest(entry) {
  const flags = {
    pass: entry.pass_type || "nano_primary",
    limit: entry.row_count || CONFIG.maxBatchSize,
    "start-product-id": entry.start_product_id || "",
    "end-product-id": entry.end_product_id || "",
  };

  if (entry.source_stage === "classification") {
    return buildClassificationBatch(flags);
  }
  if (entry.source_stage === "naming") {
    return buildNamingBatch(flags);
  }
  if (entry.source_stage === "extraction") {
    return buildExtractionBatch(flags);
  }

  throw new Error(`Unsupported retry stage "${entry.source_stage}"`);
}

async function ingestPipelineRetryBatch(stage, batchId) {
  if (!trimString(batchId)) {
    throw new Error("Missing batch id for retry ingestion");
  }

  if (stage === "classification") {
    return ingestClassificationBatch({ "batch-id": batchId });
  }
  if (stage === "naming") {
    return ingestNamingBatch({ "batch-id": batchId });
  }
  if (stage === "extraction") {
    return ingestExtractionBatch({ "batch-id": batchId });
  }

  throw new Error(`Unsupported retry stage "${stage}"`);
}

function buildPipelineRetrySourceJobPatch(entry, overrides = {}) {
  const now = new Date().toISOString();
  return {
    [CONFIG.columns.pipelineJobs.runId]: entry.source_run_id,
    [CONFIG.columns.pipelineJobs.waveIndex]: entry.source_wave_index,
    [CONFIG.columns.pipelineJobs.stage]: entry.source_stage,
    [CONFIG.columns.pipelineJobs.jobIndex]: entry.source_job_index,
    [CONFIG.columns.pipelineJobs.status]: overrides.status || "succeeded",
    [CONFIG.columns.pipelineJobs.passType]:
      overrides.passType ?? entry.pass_type ?? null,
    [CONFIG.columns.pipelineJobs.startProductId]:
      overrides.startProductId ?? entry.start_product_id ?? null,
    [CONFIG.columns.pipelineJobs.endProductId]:
      overrides.endProductId ?? entry.end_product_id ?? null,
    [CONFIG.columns.pipelineJobs.rowCount]:
      overrides.rowCount ?? entry.row_count ?? 0,
    [CONFIG.columns.pipelineJobs.manifestPath]:
      overrides.manifestPath ?? null,
    [CONFIG.columns.pipelineJobs.jsonlPath]:
      overrides.jsonlPath ?? null,
    [CONFIG.columns.pipelineJobs.inputFileId]:
      overrides.inputFileId ?? null,
    [CONFIG.columns.pipelineJobs.batchId]: overrides.batchId ?? null,
    [CONFIG.columns.pipelineJobs.errorMessage]:
      overrides.errorMessage ?? null,
    [CONFIG.columns.pipelineJobs.retryCount]:
      parseOptionalInteger(entry.failure_count) || 0,
    [CONFIG.columns.pipelineJobs.updatedAt]: now,
    [CONFIG.columns.pipelineJobs.submittedAt]: overrides.submittedAt ?? null,
    [CONFIG.columns.pipelineJobs.completedAt]: overrides.completedAt ?? null,
  };
}

async function enqueueDownstreamRetryQueueEntriesAfterRetry({
  supabase,
  entry,
}) {
  if (!entry?.source_run_id) {
    return;
  }

  const run = await fetchPipelineRunById(supabase, entry.source_run_id);
  if (!run) {
    return;
  }

  const downstreamRows = [];
  if (entry.source_stage === "classification") {
    downstreamRows.push(
      buildPipelineRetryQueueRow({
        stage: "naming",
        jobRow: {
          run_id: entry.source_run_id,
          wave_index: entry.source_wave_index,
          stage: "naming",
          job_index: entry.source_job_index,
          pass_type: run.naming_pass,
          start_product_id: entry.start_product_id,
          end_product_id: entry.end_product_id,
          row_count: run.naming_limit,
          batch_id: null,
          retry_count: 1,
          status: "failed",
        },
        errorMessage: "Queued after deferred classification retry",
      })
    );
    downstreamRows.push(
      buildPipelineRetryQueueRow({
        stage: "extraction",
        jobRow: {
          run_id: entry.source_run_id,
          wave_index: entry.source_wave_index,
          stage: "extraction",
          job_index: entry.source_job_index,
          pass_type: run.extract_pass,
          start_product_id: entry.start_product_id,
          end_product_id: entry.end_product_id,
          row_count: run.extract_limit,
          batch_id: null,
          retry_count: 1,
          status: "failed",
        },
        errorMessage: "Queued after deferred classification retry",
      })
    );
  }

  if (entry.source_stage === "extraction") {
    downstreamRows.push(
      buildPipelineRetryQueueRow({
        stage: "alias",
        jobRow: {
          run_id: entry.source_run_id,
          wave_index: entry.source_wave_index,
          stage: "alias",
          job_index: entry.source_job_index,
          start_product_id: entry.start_product_id,
          end_product_id: entry.end_product_id,
          row_count: run.alias_limit,
          batch_id: null,
          retry_count: 1,
          status: "failed",
        },
        errorMessage: "Queued after deferred extraction retry",
      })
    );
  }

  if (!downstreamRows.length) {
    return;
  }

  await upsertPipelineRetryQueueRowsBestEffort(
    supabase,
    downstreamRows,
    "retry:drain:downstream-queue"
  );
}

async function runParallelPipelineWave({ supabase, run, waveIndex }) {
  await restorePipelineBatchBackups({
    supabase,
    runId: run.id,
    waveIndex,
  });

  await updatePipelineRunFields(supabase, run.id, {
    [CONFIG.columns.pipelineRuns.status]: "running",
    [CONFIG.columns.pipelineRuns.currentWaveIndex]: waveIndex - 1,
    [CONFIG.columns.pipelineRuns.updatedAt]: new Date().toISOString(),
  });

  const classificationJobs = await ensureClassificationWaveJobs({
    supabase,
    run,
    waveIndex,
  });

  if (!classificationJobs.length) {
    return { status: "no_candidates", stage: "classification" };
  }

  const classificationStage = await executeBatchStageJobs({
    supabase,
    runId: run.id,
    waveIndex,
    stage: "classification",
    ingestBatch: ingestClassificationBatch,
    maxActiveBatches: run.requested_jobs,
  });

  if (classificationStage.status === "blocked") {
    return {
      status: "blocked",
      stage: "classification",
      batch_id: classificationStage.batch_id || null,
    };
  }

  if (!classificationStage.succeeded) {
    return {
      status: "failed",
      stage: "classification",
      error_message:
        classificationStage.error_message ||
        "[classification] one or more jobs failed",
    };
  }

  const completedClassificationJobs = classificationStage.jobs.filter(
    (job) => job.status === "succeeded"
  );
  const classificationSweepJobs = classificationStage.jobs.filter((job) =>
    isPipelineJobDoneForMainSweep(job)
  );

  const namingJobs = await ensureBoundedBatchStageJobs({
    supabase,
    runId: run.id,
    waveIndex,
    stage: "naming",
    passType: run.naming_pass,
    limit: run.naming_limit,
    rangeJobs: completedClassificationJobs,
    buildManifest: buildNamingBatch,
  });
  const namingStage = await executeBatchStageJobs({
    supabase,
    runId: run.id,
    waveIndex,
    stage: "naming",
    ingestBatch: ingestNamingBatch,
    maxActiveBatches: run.requested_jobs,
  });

  if (namingStage.status === "blocked") {
    return {
      status: "blocked",
      stage: "naming",
      batch_id: namingStage.batch_id || null,
    };
  }

  if (!namingStage.succeeded) {
    return {
      status: "failed",
      stage: "naming",
      error_message:
        namingStage.error_message || "[naming] one or more jobs failed",
    };
  }

  const extractionJobs = await ensureBoundedBatchStageJobs({
    supabase,
    runId: run.id,
    waveIndex,
    stage: "extraction",
    passType: run.extract_pass,
    limit: run.extract_limit,
    rangeJobs: completedClassificationJobs,
    buildManifest: buildExtractionBatch,
  });
  const extractionStage = await executeBatchStageJobs({
    supabase,
    runId: run.id,
    waveIndex,
    stage: "extraction",
    ingestBatch: ingestExtractionBatch,
    maxActiveBatches: run.requested_jobs,
  });

  if (extractionStage.status === "blocked") {
    return {
      status: "blocked",
      stage: "extraction",
      batch_id: extractionStage.batch_id || null,
    };
  }

  if (!extractionStage.succeeded) {
    return {
      status: "failed",
      stage: "extraction",
      error_message:
        extractionStage.error_message || "[extraction] one or more jobs failed",
    };
  }

  const completedExtractionJobs = extractionStage.jobs.filter(
    (job) => job.status === "succeeded"
  );
  const aliasJobs = await ensureAliasStageJobs({
    supabase,
    runId: run.id,
    waveIndex,
    rangeJobs: completedExtractionJobs,
  });
  const aliasStage = await executeAliasStageJobs({
    supabase,
    runId: run.id,
    waveIndex,
    limit: run.alias_limit,
  });

  if (aliasStage.status === "blocked") {
    return {
      status: "blocked",
      stage: "alias",
    };
  }

  if (!aliasStage.succeeded) {
    return {
      status: "failed",
      stage: "alias",
      error_message: buildPipelineStageFailureMessage("alias", aliasStage.jobs),
    };
  }

  const maxEndProductId = classificationSweepJobs
    .map((job) => normalizeId(job.end_product_id))
    .filter(Boolean)
    .sort()
    .at(-1);

  await updatePipelineRunFields(supabase, run.id, {
    [CONFIG.columns.pipelineRuns.status]: "running",
    [CONFIG.columns.pipelineRuns.currentWaveIndex]: waveIndex,
    [CONFIG.columns.pipelineRuns.lastCompletedProductId]: maxEndProductId || null,
    [CONFIG.columns.pipelineRuns.updatedAt]: new Date().toISOString(),
    [CONFIG.columns.pipelineRuns.blockedAt]: null,
  });

  console.log(
    "[run:parallel] wave completed",
    JSON.stringify({
      run_id: run.id,
      wave_index: waveIndex,
      classification_jobs: completedClassificationJobs.length,
      classification_jobs_deferred:
        classificationSweepJobs.length - completedClassificationJobs.length,
      naming_jobs: namingJobs.length,
      extraction_jobs: extractionJobs.length,
      alias_jobs: aliasJobs.length,
      last_completed_product_id: maxEndProductId || null,
    })
  );

  return { status: "succeeded" };
}

async function runParallelClassificationBatches(flags) {
  const passType = requirePassType(flags.pass || "nano_primary", [
    "nano_primary",
    "mini_fallback",
  ]);
  const jobCount = resolveParallelJobCount(flags.jobs || flags.concurrency);
  const batchSize = resolveLimit(flags.limit || 10000);
  const supabase = createAdminClient();
  let nextAfterProductId =
    normalizeId(flags["after-product-id"]) ||
    (await fetchLastProcessedClassificationProductId(supabase));
  const ledgerPath = buildParallelRunLedgerPath("classification", passType);
  const ledger = {
    stage: "classification",
    pass_type: passType,
    requested_jobs: jobCount,
    batch_size: batchSize,
    started_after_product_id: nextAfterProductId || null,
    created_at: new Date().toISOString(),
    status: "building",
    ledger_path: ledgerPath,
    jobs: [],
  };

  await writeJsonFile(ledgerPath, ledger);

  console.log("[classify:parallel] ledger", ledgerPath);
  console.log(
    "[classify:parallel] starting",
    JSON.stringify({
      pass_type: passType,
      jobs: jobCount,
      batch_size: batchSize,
      after_product_id: nextAfterProductId || null,
    })
  );

  for (let jobIndex = 0; jobIndex < jobCount; jobIndex += 1) {
    const manifest = await buildClassificationBatch({
      pass: passType,
      limit: batchSize,
      "after-product-id": nextAfterProductId || "",
    });

    if (!manifest) {
      break;
    }

    const job = {
      job_index: jobIndex + 1,
      manifest_path: manifest.manifest_path,
      jsonl_path: manifest.jsonl_path,
      row_count: manifest.row_count || 0,
      start_product_id: manifest.start_product_id || null,
      end_product_id: manifest.end_product_id || null,
      status: "built",
      created_at: manifest.created_at || new Date().toISOString(),
    };

    ledger.jobs.push(job);
    ledger.last_built_product_id = job.end_product_id || nextAfterProductId || null;
    await writeJsonFile(ledgerPath, ledger);
    nextAfterProductId = job.end_product_id || nextAfterProductId;
  }

  if (!ledger.jobs.length) {
    ledger.status = "no_candidates";
    await writeJsonFile(ledgerPath, ledger);
    console.log("[classify:parallel] no eligible rows");
    return {
      built_jobs: 0,
      submitted_jobs: 0,
      ingested_jobs: 0,
      failed_jobs: 0,
      last_product_id: ledger.started_after_product_id,
      ledger_path: ledgerPath,
    };
  }

  ledger.status = "submitting";
  await writeJsonFile(ledgerPath, ledger);

  const submissionResults = await Promise.allSettled(
    ledger.jobs.map((job) =>
      submitBatch({
        manifest: job.manifest_path,
      })
    )
  );

  for (let index = 0; index < ledger.jobs.length; index += 1) {
    const job = ledger.jobs[index];
    const result = submissionResults[index];

    if (result.status === "fulfilled") {
      const submission = result.value;
      job.batch_id = submission.batch_id;
      job.input_file_id = submission.input_file_id;
      job.submitted_at = submission.submitted_at || new Date().toISOString();
      job.status = "submitted";
      job.batch_status = submission.batch_status || null;
      continue;
    }

    job.status = "submit_failed";
    job.error_message =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
  }

  await writeJsonFile(ledgerPath, ledger);

  const submittedJobs = ledger.jobs.filter((job) => trimString(job.batch_id));
  if (!submittedJobs.length) {
    ledger.status = "failed";
    await writeJsonFile(ledgerPath, ledger);
    throw new Error(
      `[classify:parallel] Failed to submit any classification batches. Ledger: ${ledgerPath}`
    );
  }

  ledger.status = "ingesting";
  await writeJsonFile(ledgerPath, ledger);

  const ingestionResults = await Promise.allSettled(
    submittedJobs.map((job) =>
      ingestClassificationBatch({
        "batch-id": job.batch_id,
      })
    )
  );

  let ingestedJobs = 0;
  let failedJobs = ledger.jobs.filter((job) => job.status === "submit_failed").length;

  for (let index = 0; index < submittedJobs.length; index += 1) {
    const job = submittedJobs[index];
    const result = ingestionResults[index];

    if (result.status === "fulfilled") {
      job.status = "ingested";
      job.ingested_at = new Date().toISOString();
      job.inserted = result.value.inserted || 0;
      ingestedJobs += 1;
      continue;
    }

    job.status = "ingest_failed";
    job.error_message =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    failedJobs += 1;
  }

  ledger.status = failedJobs ? "completed_with_errors" : "completed";
  ledger.completed_at = new Date().toISOString();
  await writeJsonFile(ledgerPath, ledger);

  const summary = {
    built_jobs: ledger.jobs.length,
    submitted_jobs: submittedJobs.length,
    ingested_jobs: ingestedJobs,
    failed_jobs: failedJobs,
    total_rows: ledger.jobs.reduce(
      (sum, job) => sum + (parseOptionalInteger(job.row_count) || 0),
      0
    ),
    last_product_id: ledger.last_built_product_id || null,
    ledger_path: ledgerPath,
  };

  console.log("[classify:parallel] completed", JSON.stringify(summary));

  if (failedJobs) {
    throw new Error(
      `[classify:parallel] ${failedJobs} job(s) failed. Inspect ${ledgerPath}`
    );
  }

  return summary;
}

async function ensureClassificationWaveJobs({ supabase, run, waveIndex }) {
  let jobs = await fetchPipelineStageJobs(
    supabase,
    run.id,
    waveIndex,
    "classification"
  );
  const existingJobIndices = new Set(jobs.map((job) => job.job_index));
  let nextJobIndex = jobs.length
    ? Math.max(...jobs.map((job) => job.job_index)) + 1
    : 1;
  let cursor = normalizeId(run.last_completed_product_id || run.start_product_id);
  if (jobs.length) {
    cursor =
      jobs
        .map((job) => normalizeId(job.end_product_id))
        .filter(Boolean)
        .sort()
        .at(-1) || cursor;
  }
  const inserts = [];

  for (
    let jobIndex = nextJobIndex;
    jobIndex <= run.requested_jobs;
    jobIndex += 1
  ) {
    if (existingJobIndices.has(jobIndex)) {
      continue;
    }

    const manifest = await buildClassificationBatch({
      pass: run.classify_pass,
      limit: run.classify_limit,
      "after-product-id": cursor || "",
    });

    if (!manifest) {
      break;
    }

    inserts.push(
      buildPipelineJobRow({
        runId: run.id,
        waveIndex,
        stage: "classification",
        jobIndex,
        status: "built",
        passType: run.classify_pass,
        startProductId: manifest.start_product_id,
        endProductId: manifest.end_product_id,
        rowCount: manifest.row_count || 0,
        manifestPath: manifest.manifest_path,
        jsonlPath: manifest.jsonl_path,
      })
    );
    cursor = manifest.end_product_id || cursor;
  }

  if (inserts.length) {
    await upsertPipelineJobRows(supabase, inserts);
  }

  return fetchPipelineStageJobs(supabase, run.id, waveIndex, "classification");
}

async function ensureBoundedBatchStageJobs({
  supabase,
  runId,
  waveIndex,
  stage,
  passType,
  limit,
  rangeJobs,
  buildManifest,
}) {
  let jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, stage);
  const existingJobIndices = new Set(jobs.map((job) => job.job_index));

  const inserts = [];

  for (const rangeJob of rangeJobs || []) {
    if (existingJobIndices.has(rangeJob.job_index)) {
      continue;
    }

    const startProductId = normalizeId(rangeJob.start_product_id);
    const endProductId = normalizeId(rangeJob.end_product_id);
    if (!startProductId || !endProductId) {
      continue;
    }

    const manifest = await buildManifest({
      pass: passType,
      limit,
      "start-product-id": startProductId,
      "end-product-id": endProductId,
    });

    inserts.push(
      buildPipelineJobRow({
        runId,
        waveIndex,
        stage,
        jobIndex: rangeJob.job_index,
        status: manifest ? "built" : "skipped",
        passType,
        startProductId,
        endProductId,
        rowCount: manifest?.row_count || 0,
        manifestPath: manifest?.manifest_path || null,
        jsonlPath: manifest?.jsonl_path || null,
      })
    );
  }

  if (inserts.length) {
    await upsertPipelineJobRows(supabase, inserts);
  }

  return fetchPipelineStageJobs(supabase, runId, waveIndex, stage);
}

async function ensureAliasStageJobs({ supabase, runId, waveIndex, rangeJobs }) {
  let jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, "alias");
  const existingJobIndices = new Set(jobs.map((job) => job.job_index));

  const inserts = (rangeJobs || [])
    .filter(
      (job) =>
        normalizeId(job.start_product_id) &&
        normalizeId(job.end_product_id) &&
        !existingJobIndices.has(job.job_index)
    )
    .map((job) =>
      buildPipelineJobRow({
        runId,
        waveIndex,
        stage: "alias",
        jobIndex: job.job_index,
        status: "built",
        startProductId: job.start_product_id,
        endProductId: job.end_product_id,
        rowCount: job.row_count || null,
      })
    );

  if (inserts.length) {
    await upsertPipelineJobRows(supabase, inserts);
  }

  return fetchPipelineStageJobs(supabase, runId, waveIndex, "alias");
}

async function executeBatchStageJobs({
  supabase,
  runId,
  waveIndex,
  stage,
  ingestBatch,
  maxActiveBatches = CONFIG.defaultParallelJobs,
}) {
  let jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, stage);
  if (!jobs.length) {
    return { succeeded: true, status: "succeeded", jobs: [] };
  }

  jobs = await reconcileBatchStageJobsForResume({
    supabase,
    runId,
    waveIndex,
    stage,
    jobs,
  });

  const manifestResolvedRows = [];
  for (const job of jobs) {
    if (job.status === "succeeded" || job.status === "skipped") {
      continue;
    }
    if (isTerminalPipelineJobFailure(job)) {
      continue;
    }
    if (trimString(job.batch_id)) {
      continue;
    }

    const manifest = await ensurePipelineJobManifest(stage, job);
    if (!manifest) {
      manifestResolvedRows.push({
        ...job,
        status: "skipped",
        error_message: null,
        updated_at: new Date().toISOString(),
      });
      continue;
    }

    manifestResolvedRows.push({
      ...job,
      status: trimString(manifest.batch_id) ? "submitted" : "built",
      pass_type: manifest.pass_type || job.pass_type || null,
      start_product_id: manifest.start_product_id || job.start_product_id || null,
      end_product_id: manifest.end_product_id || job.end_product_id || null,
      row_count: manifest.row_count || job.row_count || 0,
      manifest_path: manifest.manifest_path,
      jsonl_path: manifest.jsonl_path,
      input_file_id:
        trimString(manifest.input_file_id) || job.input_file_id || null,
      batch_id: trimString(manifest.batch_id) || job.batch_id || null,
      submitted_at:
        trimString(manifest.submitted_at) || job.submitted_at || null,
      error_message: null,
      updated_at: new Date().toISOString(),
    });
  }

  if (manifestResolvedRows.length) {
    await upsertPipelineJobRows(supabase, manifestResolvedRows);
  }

  jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, stage);
  jobs = await deferPipelineJobsForRetryBestEffort({
    supabase,
    stage,
    jobs,
  });

  if (
    jobs.some(
      (job) =>
        isTerminalPipelineJobFailure(job) && !isPipelineJobDeferredForRetry(job)
    )
  ) {
    return {
      succeeded: false,
      status: "failed",
      jobs,
      error_message: buildPipelineStageFailureMessage(stage, jobs),
    };
  }
  const activeTokenBudget = Math.floor(
    CONFIG.openAiEnqueuedTokenLimit * CONFIG.openAiEnqueuedTokenSafetyFraction
  );
  let activeJobs = await buildActiveBatchJobsForStage(jobs);

  while (true) {
    jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, stage);
    jobs = await deferPipelineJobsForRetryBestEffort({
      supabase,
      stage,
      jobs,
    });
    const outstandingJobs = jobs.filter(
      (job) => !isPipelineJobDoneForMainSweep(job)
    );

    if (!outstandingJobs.length && !activeJobs.length) {
      break;
    }

    const activeBatchIds = new Set(activeJobs.map((job) => trimString(job.batch_id)));
    const queuedJobs = jobs.filter(
      (job) =>
        !isPipelineJobDoneForMainSweep(job) &&
        job.status !== "failed" &&
        !activeBatchIds.has(trimString(job.batch_id)) &&
        !trimString(job.batch_id)
    );

    let submittedThisPass = false;
    for (const job of queuedJobs) {
      if (activeJobs.length >= maxActiveBatches) {
        break;
      }

      const estimatedTokens = await estimateManifestTokensForJob(job);
      const activeTokens = activeJobs.reduce(
        (sum, activeJob) => sum + (activeJob.estimated_tokens || 0),
        0
      );

      if (estimatedTokens > activeTokenBudget) {
        await persistPipelineJobFailureBestEffort({
          supabase,
          stage,
          jobRow: {
            ...job,
            status: "failed",
            retry_count: (job.retry_count || 0) + 1,
            error_message: buildPipelineJobTokenBudgetErrorMessage({
              stage,
              estimatedTokens,
              activeTokenBudget,
            }),
            updated_at: new Date().toISOString(),
          },
          error: buildPipelineJobTokenBudgetErrorMessage({
            stage,
            estimatedTokens,
            activeTokenBudget,
          }),
        });
        continue;
      }

      if (
        activeJobs.length > 0 &&
        activeTokens + estimatedTokens > activeTokenBudget
      ) {
        break;
      }

      while (true) {
        try {
          const submission = await submitBatch({
            manifest: job.manifest_path,
          });
          const updatedJob = {
            ...job,
            status: "submitted",
            input_file_id: submission.input_file_id || null,
            batch_id: submission.batch_id || null,
            error_message: null,
            submitted_at: submission.submitted_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await upsertPipelineJobRows(supabase, [updatedJob]);
          activeJobs.push({
            ...updatedJob,
            estimated_tokens: estimatedTokens,
          });
          submittedThisPass = true;
          break;
        } catch (error) {
          if (isOpenAiEnqueuedTokenLimitError(error)) {
            await persistPipelineJobFailureBestEffort({
              supabase,
              stage,
              jobRow: {
                ...job,
                status: "failed",
                retry_count: (job.retry_count || 0) + 1,
                error_message:
                  error instanceof Error ? error.message : String(error),
                updated_at: new Date().toISOString(),
              },
              error,
            });
            break;
          }

          await persistPipelineJobFailureBestEffort({
            supabase,
            stage,
            jobRow: {
              ...job,
              status: "failed",
              retry_count: (job.retry_count || 0) + 1,
              error_message:
                error instanceof Error ? error.message : String(error),
              updated_at: new Date().toISOString(),
            },
            error,
          });
          break;
        }
      }
    }

    if (!activeJobs.length) {
      if (!submittedThisPass) {
        break;
      }
      continue;
    }

    const nextActiveJob = activeJobs.shift();
    try {
      await upsertPipelineJobRows(supabase, [
        {
          ...omitPipelineJobRuntimeFields(nextActiveJob),
          status: "ingesting",
          updated_at: new Date().toISOString(),
        },
      ]);

      await ingestBatch({
        "batch-id": nextActiveJob.batch_id,
      });
      const succeededRow = {
        ...omitPipelineJobRuntimeFields(nextActiveJob),
        status: "succeeded",
        error_message: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await upsertPipelineJobRows(supabase, [succeededRow]);
      await resolvePipelineRetryQueueEntryBestEffort({
        supabase,
        job: succeededRow,
      });
    } catch (error) {
      if (isBatchWaitTimeoutError(error)) {
        await persistPipelineJobFailureBestEffort({
          supabase,
          stage,
          jobRow: {
            ...omitPipelineJobRuntimeFields(nextActiveJob),
            status: "failed",
            retry_count: (nextActiveJob.retry_count || 0) + 1,
            error_message: "Timed out locally; batch still pending",
            updated_at: new Date().toISOString(),
          },
          error,
        });
        continue;
      }

      await persistPipelineJobFailureBestEffort({
        supabase,
        stage,
        jobRow: {
          ...omitPipelineJobRuntimeFields(nextActiveJob),
          status: "failed",
          retry_count: (nextActiveJob.retry_count || 0) + 1,
          error_message:
            error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        },
        error,
      });
    }
  }

  jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, stage);
  jobs = await deferPipelineJobsForRetryBestEffort({
    supabase,
    stage,
    jobs,
  });
  const succeeded = jobs.every(
    (job) => isPipelineJobDoneForMainSweep(job)
  );
  return {
    succeeded,
    status: succeeded ? "succeeded" : "failed",
    jobs,
    error_message: succeeded
      ? null
      : buildPipelineStageFailureMessage(stage, jobs),
  };
}

async function buildActiveBatchJobsForStage(jobs) {
  const activeJobs = [];
  const pendingJobs = jobs.filter(
    (job) =>
      job.status !== "succeeded" &&
      job.status !== "skipped" &&
      job.status !== "failed" &&
      trimString(job.batch_id)
  );

  for (const job of pendingJobs) {
    const estimatedTokens = (await estimateManifestTokensForJob(job)) || 0;
    activeJobs.push({ ...job, estimated_tokens: estimatedTokens });
  }

  return activeJobs;
}

async function recoverFailedBatchStageJobs({
  supabase,
  runId,
  waveIndex,
  stage,
  jobs,
}) {
  const failedJobs = (jobs || []).filter(isRecoverablePipelineJobFailure);
  if (!failedJobs.length) {
    return { recovered: false, jobs };
  }

  const retryAttempt = failedJobs.reduce(
    (maxValue, job) =>
      Math.max(maxValue, parseOptionalInteger(job.retry_count) || 1),
    1
  );
  const delayMs = computeRetryDelayMs(
    CONFIG.pipelineJobRecoveryBaseMs,
    retryAttempt
  );

  console.log(
    `[${stage}] retrying failed jobs after delay`,
    JSON.stringify({
      run_id: runId,
      wave_index: waveIndex,
      failed_jobs: failedJobs.map((job) => ({
        job_index: job.job_index,
        retry_count: job.retry_count,
        batch_id: trimString(job.batch_id) || null,
        error_message: trimString(job.error_message) || null,
      })),
      delay_ms: delayMs,
    })
  );
  await sleep(delayMs);

  const failedJobKeys = new Set(failedJobs.map(buildPipelineJobKey));
  const reconciledJobs = await reconcileBatchStageJobsForResume({
    supabase,
    runId,
    waveIndex,
    stage,
    jobs,
  });

  return {
    recovered: reconciledJobs.some(
      (job) =>
        failedJobKeys.has(buildPipelineJobKey(job)) && job.status !== "failed"
    ),
    jobs: reconciledJobs,
  };
}

async function recoverFailedAliasStageJobs({ supabase, runId, waveIndex, jobs }) {
  const failedJobs = (jobs || []).filter(isRecoverablePipelineJobFailure);
  if (!failedJobs.length) {
    return { recovered: false, jobs };
  }

  const retryAttempt = failedJobs.reduce(
    (maxValue, job) =>
      Math.max(maxValue, parseOptionalInteger(job.retry_count) || 1),
    1
  );
  const delayMs = computeRetryDelayMs(
    CONFIG.pipelineJobRecoveryBaseMs,
    retryAttempt
  );

  console.log(
    "[alias] retrying failed jobs after delay",
    JSON.stringify({
      run_id: runId,
      wave_index: waveIndex,
      failed_jobs: failedJobs.map((job) => ({
        job_index: job.job_index,
        retry_count: job.retry_count,
        error_message: trimString(job.error_message) || null,
      })),
      delay_ms: delayMs,
    })
  );
  await sleep(delayMs);

  const resetRows = failedJobs.map((job) => ({
    ...job,
    status: "built",
    error_message: null,
    updated_at: new Date().toISOString(),
  }));
  const persisted = await upsertPipelineJobRowsBestEffort(
    supabase,
    resetRows,
    "alias:retry-reset"
  );

  return {
    recovered: persisted,
    jobs: await fetchPipelineStageJobs(supabase, runId, waveIndex, "alias"),
  };
}

async function executeAliasStageJobs({ supabase, runId, waveIndex, limit }) {
  let jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, "alias");
  jobs = await deferPipelineJobsForRetryBestEffort({
    supabase,
    stage: "alias",
    jobs,
  });
  if (!jobs.length) {
    return { succeeded: true, status: "succeeded", jobs: [] };
  }

  while (true) {
    const updates = [];

    for (const job of jobs) {
      if (job.status === "succeeded" || job.status === "skipped") {
        continue;
      }
      if (isTerminalPipelineJobFailure(job)) {
        continue;
      }

      try {
        const result = await resolveAliases({
          limit,
          "start-product-id": job.start_product_id || "",
          "end-product-id": job.end_product_id || "",
        });
        updates.push({
          ...job,
          status: "succeeded",
          row_count:
            parseOptionalInteger(result.extraction_rows_processed) ||
            job.row_count ||
            0,
          error_message: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        updates.push({
          ...job,
          status: "failed",
          retry_count: (job.retry_count || 0) + 1,
          error_message: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (updates.length) {
      const persisted = await upsertPipelineJobRowsBestEffort(
        supabase,
        updates,
        "alias:job-status"
      );
      if (!persisted) {
        jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, "alias");
        return {
          succeeded: false,
          status: "blocked",
          jobs,
          error_message: "[alias] failed to persist alias job status updates",
        };
      }
    }

    jobs = await fetchPipelineStageJobs(supabase, runId, waveIndex, "alias");
    jobs = await deferPipelineJobsForRetryBestEffort({
      supabase,
      stage: "alias",
      jobs,
    });
    const succeeded = jobs.every(
      (job) => isPipelineJobDoneForMainSweep(job)
    );

    if (succeeded) {
      for (const job of jobs.filter(
        (item) => trimString(item?.status) === "succeeded"
      )) {
        await resolvePipelineRetryQueueEntryBestEffort({
          supabase,
          job,
        });
      }
      return {
        succeeded: true,
        status: "succeeded",
        jobs,
      };
    }

    if (
      jobs.some(
        (job) =>
          isTerminalPipelineJobFailure(job) && !isPipelineJobDeferredForRetry(job)
      )
    ) {
      return {
        succeeded: false,
        status: "failed",
        jobs,
      };
    }

    return {
      succeeded: false,
      status: "failed",
      jobs,
    };
  }
}

async function reconcileBatchStageJobsForResume({
  supabase,
  runId,
  waveIndex,
  stage,
  jobs,
}) {
  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const updates = [];

  for (const job of jobs) {
    if (job.status !== "failed") {
      continue;
    }

    if (isTerminalPipelineJobFailure(job)) {
      continue;
    }

    const batchId = trimString(job.batch_id);
    if (!batchId) {
      updates.push(resetPipelineBatchJobForResubmit(job));
      continue;
    }

    try {
      const batch = await fetchOpenAiBatch(openAiApiKey, batchId);
      const batchStatus = trimString(batch?.status);

      if (
        batchStatus &&
        !TERMINAL_BATCH_STATUSES.has(batchStatus)
      ) {
        updates.push({
          ...job,
          status: "submitted",
          error_message: null,
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      if (SUCCESSFUL_BATCH_STATUSES.has(batchStatus)) {
        updates.push({
          ...job,
          status: "submitted",
          error_message: null,
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      const resetReason = `Previous batch ${batchId} ended with status ${
        batchStatus || "unknown"
      }`;
      await recordPipelineJobFailureArtifact({
        job,
        stage,
        error: resetReason,
      });
      updates.push(resetPipelineBatchJobForResubmit(job, resetReason));
    } catch (error) {
      if (isUnreadableOpenAiBatchError(error)) {
        const retryReason = trimString(error?.message) || String(error);
        await recordPipelineJobFailureArtifact({
          job,
          stage,
          error: retryReason,
        });
        updates.push({
          ...job,
          status: "submitted",
          error_message: retryReason,
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      if (isMissingOpenAiBatchError(error)) {
        const resetReason = `Previous batch ${batchId} was not found`;
        await recordPipelineJobFailureArtifact({
          job,
          stage,
          error: resetReason,
        });
        updates.push(resetPipelineBatchJobForResubmit(job, resetReason));
        continue;
      }
      throw error;
    }
  }

  if (updates.length) {
    await upsertPipelineJobRows(supabase, updates);
  }

  return fetchPipelineStageJobs(supabase, runId, waveIndex, stage);
}

function resetPipelineBatchJobForResubmit(job, reason = "") {
  return {
    ...omitPipelineJobRuntimeFields(job),
    status: "built",
    manifest_path: null,
    jsonl_path: null,
    batch_id: null,
    input_file_id: null,
    submitted_at: null,
    completed_at: null,
    error_message: reason || null,
    updated_at: new Date().toISOString(),
  };
}

async function reducePipelineStageLimitForOversizedJob({
  supabase,
  runId,
  waveIndex,
  stage,
  job,
  estimatedTokens,
  activeTokenBudget,
}) {
  const limitColumn = getPipelineRunLimitColumn(stage);
  if (!limitColumn) {
    return false;
  }

  const run = await fetchPipelineRunById(supabase, runId);
  const currentLimit = Math.max(
    1,
    getPipelineRunLimitValue(run, stage) ||
      parseOptionalInteger(job?.row_count) ||
      1
  );
  const scaledLimit = Math.floor(
    currentLimit * (activeTokenBudget / Math.max(1, estimatedTokens)) * 0.9
  );
  const nextLimit = Math.max(1, Math.min(currentLimit - 1, scaledLimit));

  if (nextLimit >= currentLimit) {
    return false;
  }

  await updatePipelineRunFields(supabase, runId, {
    [limitColumn]: nextLimit,
    [CONFIG.columns.pipelineRuns.status]: "blocked",
    [CONFIG.columns.pipelineRuns.blockedAt]: new Date().toISOString(),
    [CONFIG.columns.pipelineRuns.updatedAt]: new Date().toISOString(),
  });
  await deletePipelineWaveStageJobs(
    supabase,
    runId,
    waveIndex,
    getPipelineStagesFrom(stage)
  );

  console.log(
    `[${stage}] reduced stage limit after oversized manifest`,
    JSON.stringify({
      run_id: runId,
      wave_index: waveIndex,
      job_index: job?.job_index || null,
      previous_limit: currentLimit,
      next_limit: nextLimit,
      estimated_tokens: estimatedTokens,
      token_budget: activeTokenBudget,
    })
  );

  return true;
}

function buildPipelineJobTokenBudgetErrorMessage({
  stage,
  estimatedTokens,
  activeTokenBudget,
}) {
  return [
    `[${stage}] Estimated enqueued tokens ${estimatedTokens} exceed local budget ${activeTokenBudget}.`,
    "Reduce batch size or increase OFF_PRODUCTS_OPENAI_ENQUEUED_TOKEN_LIMIT / OFF_PRODUCTS_OPENAI_ENQUEUED_TOKEN_SAFETY_FRACTION.",
  ].join(" ");
}

function isTerminalPipelineJobFailure(job) {
  return (
    isPipelineJobTokenBudgetFailure(job) ||
    hasExhaustedPipelineJobRecoveryRetries(job)
  );
}

function isRecoverablePipelineJobFailure(job) {
  return (
    trimString(job?.status) === "failed" &&
    !hasExhaustedPipelineJobRecoveryRetries(job) &&
    !isPipelineJobTokenBudgetFailure(job)
  );
}

function isPipelineJobTokenBudgetFailure(job) {
  return /exceed local budget/i.test(trimString(job?.error_message));
}

function hasExhaustedPipelineJobRecoveryRetries(job) {
  return (
    trimString(job?.status) === "failed" &&
    (parseOptionalInteger(job?.retry_count) || 0) >=
      CONFIG.pipelineJobRecoveryMaxRetries
  );
}

function omitPipelineJobRuntimeFields(job) {
  if (!job || typeof job !== "object") {
    return job;
  }

  const { estimated_tokens, ...rest } = job;
  return rest;
}

async function ensurePipelineJobManifest(stage, job) {
  const manifestPath = trimString(job.manifest_path);
  if (manifestPath && (await pathExists(manifestPath))) {
    return readJsonFile(manifestPath);
  }

  const startProductId = normalizeId(job.start_product_id);
  const endProductId = normalizeId(job.end_product_id);
  const passType = trimString(job.pass_type) || "nano_primary";

  if (!startProductId || !endProductId) {
    return null;
  }

  if (stage === "classification") {
    return buildClassificationBatch({
      pass: passType,
      limit: job.row_count || CONFIG.maxBatchSize,
      "start-product-id": startProductId,
      "end-product-id": endProductId,
    });
  }

  if (stage === "naming") {
    return buildNamingBatch({
      pass: passType,
      limit: job.row_count || CONFIG.maxBatchSize,
      "start-product-id": startProductId,
      "end-product-id": endProductId,
    });
  }

  if (stage === "extraction") {
    return buildExtractionBatch({
      pass: passType,
      limit: job.row_count || CONFIG.maxBatchSize,
      "start-product-id": startProductId,
      "end-product-id": endProductId,
    });
  }

  return null;
}

async function reconcileParallelRunIntegrity(supabase, run) {
  if (!run || run.current_wave_index <= 0) {
    return run;
  }

  // These stage result tables are upserted by product_id, so batch_id row counts
  // are not stable after retries or reruns. Rewinding waves based on batch_id
  // counts causes false corruption detection and rebuilds already-covered ranges.
  return run;
}

async function deletePipelineJobsFromWave(supabase, runId, fromWaveIndex) {
  await backupPipelineJobsForRecovery({
    supabase,
    runId,
    fromWaveIndex,
    reason: `Deleting pipeline jobs from wave ${fromWaveIndex}`,
  });

  const { error } = await supabase
    .from(CONFIG.tables.pipelineJobs)
    .delete()
    .eq(CONFIG.columns.pipelineJobs.runId, runId)
    .gte(CONFIG.columns.pipelineJobs.waveIndex, fromWaveIndex);

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineJobs}] ${error.message}`);
  }
}

async function deletePipelineWaveStageJobs(supabase, runId, waveIndex, stages) {
  const stagesSet = new Set(stages || []);
  const normalizedStages = PIPELINE_STAGE_ORDER.filter((stage) =>
    stagesSet.has(stage)
  );
  if (!normalizedStages.length) {
    return;
  }

  await backupPipelineJobsForRecovery({
    supabase,
    runId,
    waveIndex,
    stages: normalizedStages,
    reason: `Deleting wave ${waveIndex} stages ${normalizedStages.join(",")}`,
  });

  const { error } = await supabase
    .from(CONFIG.tables.pipelineJobs)
    .delete()
    .eq(CONFIG.columns.pipelineJobs.runId, runId)
    .eq(CONFIG.columns.pipelineJobs.waveIndex, waveIndex)
    .in(CONFIG.columns.pipelineJobs.stage, normalizedStages);

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineJobs}] ${error.message}`);
  }
}

function getPipelineStagesFrom(stage) {
  const startIndex = PIPELINE_STAGE_ORDER.indexOf(stage);
  return startIndex >= 0 ? PIPELINE_STAGE_ORDER.slice(startIndex) : [];
}

function getPipelineBatchBackupPath(runId) {
  return path.join(CONFIG.tmpDir, `pipeline-batch-backup-${runId}.json`);
}

async function readPipelineBatchBackup(runId) {
  const backupPath = getPipelineBatchBackupPath(runId);
  if (!(await pathExists(backupPath))) {
    return {
      run_id: trimString(runId),
      updated_at: null,
      entries: [],
    };
  }

  const parsed = await readJsonFile(backupPath);
  return {
    run_id: trimString(parsed?.run_id || runId),
    updated_at: trimString(parsed?.updated_at) || null,
    entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
  };
}

async function writePipelineBatchBackup(runId, backup) {
  await writeJsonFile(getPipelineBatchBackupPath(runId), {
    run_id: trimString(runId),
    updated_at: new Date().toISOString(),
    entries: Array.isArray(backup?.entries) ? backup.entries : [],
  });
}

function buildPipelineBatchBackupEntry(job, extra = {}) {
  return {
    key: buildPipelineJobKey(job),
    run_id: trimString(job?.run_id),
    wave_index: parseOptionalInteger(job?.wave_index) || 0,
    stage: trimString(job?.stage),
    job_index: parseOptionalInteger(job?.job_index) || 0,
    status: trimString(job?.status),
    pass_type: trimString(job?.pass_type) || null,
    start_product_id: normalizeId(job?.start_product_id),
    end_product_id: normalizeId(job?.end_product_id),
    row_count: parseOptionalInteger(job?.row_count) || 0,
    manifest_path: trimString(job?.manifest_path) || null,
    jsonl_path: trimString(job?.jsonl_path) || null,
    input_file_id: trimString(job?.input_file_id) || null,
    batch_id: trimString(job?.batch_id) || null,
    error_message: trimString(job?.error_message) || null,
    retry_count: parseOptionalInteger(job?.retry_count) || 0,
    created_at: trimString(job?.created_at) || null,
    updated_at: trimString(job?.updated_at) || null,
    submitted_at: trimString(job?.submitted_at) || null,
    completed_at: trimString(job?.completed_at) || null,
    ...extra,
  };
}

async function backupPipelineJobsForRecovery({
  supabase,
  runId,
  waveIndex = null,
  fromWaveIndex = null,
  stages = null,
  reason = "",
}) {
  let query = supabase
    .from(CONFIG.tables.pipelineJobs)
    .select("*")
    .eq(CONFIG.columns.pipelineJobs.runId, runId);

  if (Number.isInteger(waveIndex)) {
    query = query.eq(CONFIG.columns.pipelineJobs.waveIndex, waveIndex);
  }
  if (Number.isInteger(fromWaveIndex)) {
    query = query.gte(CONFIG.columns.pipelineJobs.waveIndex, fromWaveIndex);
  }
  if (Array.isArray(stages) && stages.length) {
    query = query.in(CONFIG.columns.pipelineJobs.stage, stages);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineJobs}] ${error.message}`);
  }

  const jobsToBackup = (data || [])
    .map((row) => normalizePipelineJobRow(row))
    .filter((job) => trimString(job?.batch_id));

  if (!jobsToBackup.length) {
    return 0;
  }

  const existingBackup = await readPipelineBatchBackup(runId);
  const entriesByKey = new Map(
    (existingBackup.entries || []).map((entry) => [trimString(entry?.key), entry])
  );
  const backedUpAt = new Date().toISOString();

  for (const job of jobsToBackup) {
    const entry = buildPipelineBatchBackupEntry(job, {
      backup_reason: trimString(reason) || null,
      backed_up_at: backedUpAt,
      restore_state: "available",
      restored_at: null,
    });
    entriesByKey.set(entry.key, {
      ...(entriesByKey.get(entry.key) || {}),
      ...entry,
    });
  }

  await writePipelineBatchBackup(runId, {
    entries: [...entriesByKey.values()].sort((left, right) =>
      trimString(left?.key).localeCompare(trimString(right?.key))
    ),
  });
  return jobsToBackup.length;
}

async function restorePipelineBatchBackups({ supabase, runId, waveIndex = null }) {
  const backup = await readPipelineBatchBackup(runId);
  const candidateEntries = (backup.entries || []).filter((entry) => {
    if (!trimString(entry?.batch_id)) {
      return false;
    }
    if (!Number.isInteger(waveIndex)) {
      return true;
    }
    return (parseOptionalInteger(entry?.wave_index) || 0) === waveIndex;
  });

  if (!candidateEntries.length) {
    return { restored: 0 };
  }

  let query = supabase
    .from(CONFIG.tables.pipelineJobs)
    .select("*")
    .eq(CONFIG.columns.pipelineJobs.runId, runId);
  if (Number.isInteger(waveIndex)) {
    query = query.eq(CONFIG.columns.pipelineJobs.waveIndex, waveIndex);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineJobs}] ${error.message}`);
  }

  const existingKeys = new Set(
    (data || [])
      .map((row) => normalizePipelineJobRow(row))
      .map((job) => buildPipelineJobKey(job))
  );
  const rowsToRestore = [];
  const restoredAt = new Date().toISOString();
  let backupChanged = false;

  for (const entry of candidateEntries) {
    const key = trimString(entry?.key);
    if (!key) {
      continue;
    }

    if (existingKeys.has(key)) {
      if (trimString(entry?.restore_state) !== "present") {
        entry.restore_state = "present";
        entry.restored_at = trimString(entry?.restored_at) || restoredAt;
        backupChanged = true;
      }
      continue;
    }

    rowsToRestore.push({
      [CONFIG.columns.pipelineJobs.runId]: trimString(entry.run_id) || runId,
      [CONFIG.columns.pipelineJobs.waveIndex]:
        parseOptionalInteger(entry.wave_index) || 0,
      [CONFIG.columns.pipelineJobs.stage]: trimString(entry.stage),
      [CONFIG.columns.pipelineJobs.jobIndex]:
        parseOptionalInteger(entry.job_index) || 0,
      [CONFIG.columns.pipelineJobs.status]:
        trimString(entry.status) || "submitted",
      [CONFIG.columns.pipelineJobs.passType]: trimString(entry.pass_type) || null,
      [CONFIG.columns.pipelineJobs.startProductId]:
        normalizeId(entry.start_product_id),
      [CONFIG.columns.pipelineJobs.endProductId]:
        normalizeId(entry.end_product_id),
      [CONFIG.columns.pipelineJobs.rowCount]:
        parseOptionalInteger(entry.row_count) || 0,
      [CONFIG.columns.pipelineJobs.manifestPath]:
        trimString(entry.manifest_path) || null,
      [CONFIG.columns.pipelineJobs.jsonlPath]:
        trimString(entry.jsonl_path) || null,
      [CONFIG.columns.pipelineJobs.inputFileId]:
        trimString(entry.input_file_id) || null,
      [CONFIG.columns.pipelineJobs.batchId]: trimString(entry.batch_id) || null,
      [CONFIG.columns.pipelineJobs.errorMessage]:
        trimString(entry.error_message) || null,
      [CONFIG.columns.pipelineJobs.retryCount]:
        parseOptionalInteger(entry.retry_count) || 0,
      [CONFIG.columns.pipelineJobs.createdAt]:
        trimString(entry.created_at) || restoredAt,
      [CONFIG.columns.pipelineJobs.updatedAt]: restoredAt,
      [CONFIG.columns.pipelineJobs.submittedAt]:
        trimString(entry.submitted_at) || null,
      [CONFIG.columns.pipelineJobs.completedAt]:
        trimString(entry.completed_at) || null,
    });
    entry.restore_state = "restored";
    entry.restored_at = restoredAt;
    backupChanged = true;
  }

  if (rowsToRestore.length) {
    await upsertPipelineJobRows(supabase, rowsToRestore);
    console.log(
      "[pipeline-backup] restored jobs",
      JSON.stringify({
        run_id: runId,
        wave_index: waveIndex,
        restored: rowsToRestore.length,
        jobs: rowsToRestore.map((row) => ({
          wave_index: row[CONFIG.columns.pipelineJobs.waveIndex],
          stage: row[CONFIG.columns.pipelineJobs.stage],
          job_index: row[CONFIG.columns.pipelineJobs.jobIndex],
          batch_id: row[CONFIG.columns.pipelineJobs.batchId],
        })),
      })
    );
  }

  if (backupChanged) {
    await writePipelineBatchBackup(runId, backup);
  }

  return { restored: rowsToRestore.length };
}

function getPipelineRunLimitColumn(stage) {
  if (stage === "classification") {
    return CONFIG.columns.pipelineRuns.classifyLimit;
  }

  if (stage === "naming") {
    return CONFIG.columns.pipelineRuns.namingLimit;
  }

  if (stage === "extraction") {
    return CONFIG.columns.pipelineRuns.extractLimit;
  }

  return null;
}

function getPipelineRunLimitValue(run, stage) {
  if (stage === "classification") {
    return parseOptionalInteger(run?.classify_limit) || 0;
  }

  if (stage === "naming") {
    return parseOptionalInteger(run?.naming_limit) || 0;
  }

  if (stage === "extraction") {
    return parseOptionalInteger(run?.extract_limit) || 0;
  }

  return 0;
}

function getBatchStageIntegrityConfig(stage) {
  if (stage === "classification") {
    return {
      table: CONFIG.tables.classification,
      batchIdColumn: CONFIG.columns.classification.batchId,
    };
  }

  if (stage === "naming") {
    return {
      table: CONFIG.tables.naming,
      batchIdColumn: CONFIG.columns.naming.batchId,
    };
  }

  if (stage === "extraction") {
    return {
      table: CONFIG.tables.extraction,
      batchIdColumn: CONFIG.columns.extraction.batchId,
    };
  }

  return null;
}

async function fetchBatchRowCountsByStage(supabase, config, batchIds) {
  if (!config) {
    return new Map();
  }

  const normalizedBatchIds = dedupeByKey(
    (batchIds || []).map((batchId) => trimString(batchId)).filter(Boolean),
    (value) => value
  );
  const counts = new Map();

  for (const batchId of normalizedBatchIds) {
    counts.set(batchId, 0);
  }

  for (const chunk of chunkArray(normalizedBatchIds, CONFIG.fetchChunkSize)) {
    const { data, error } = await supabase
      .from(config.table)
      .select(config.batchIdColumn)
      .in(config.batchIdColumn, chunk);

    if (error) {
      throw new Error(`[supabase:${config.table}] ${error.message}`);
    }

    for (const row of data || []) {
      const batchId = trimString(row?.[config.batchIdColumn]);
      if (batchId) {
        counts.set(batchId, (counts.get(batchId) || 0) + 1);
      }
    }
  }

  return counts;
}

async function fetchLatestCompletedWaveEndProductId(supabase, runId, waveIndex) {
  const jobs = await fetchPipelineStageJobs(
    supabase,
    runId,
    waveIndex,
    "classification"
  );

  return (
    jobs
      .filter(
        (job) => job.status === "succeeded" && normalizeId(job.end_product_id)
      )
      .map((job) => normalizeId(job.end_product_id))
      .sort()
      .at(-1) || null
  );
}

async function fetchLatestIncompletePipelineRun(supabase) {
  const { data, error } = await supabase
    .from(CONFIG.tables.pipelineRuns)
    .select("*")
    .in(CONFIG.columns.pipelineRuns.status, ["running", "blocked"])
    .order(CONFIG.columns.pipelineRuns.createdAt, {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1);

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineRuns}] ${error.message}`);
  }

  return normalizePipelineRunRow(data?.[0] || null);
}

async function fetchPipelineRunById(supabase, runId) {
  const { data, error } = await supabase
    .from(CONFIG.tables.pipelineRuns)
    .select("*")
    .eq(CONFIG.columns.pipelineRuns.runId, runId)
    .limit(1);

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineRuns}] ${error.message}`);
  }

  return normalizePipelineRunRow(data?.[0] || null);
}

async function createPipelineRun(supabase, settings) {
  const now = new Date().toISOString();
  const row = {
    [CONFIG.columns.pipelineRuns.runId]: randomUUID(),
    [CONFIG.columns.pipelineRuns.status]: "running",
    [CONFIG.columns.pipelineRuns.requestedWaves]: settings.requestedWaves,
    [CONFIG.columns.pipelineRuns.requestedJobs]: settings.requestedJobs,
    [CONFIG.columns.pipelineRuns.classifyLimit]: settings.classifyLimit,
    [CONFIG.columns.pipelineRuns.namingLimit]: settings.namingLimit,
    [CONFIG.columns.pipelineRuns.extractLimit]: settings.extractLimit,
    [CONFIG.columns.pipelineRuns.aliasLimit]: settings.aliasLimit,
    [CONFIG.columns.pipelineRuns.classifyPass]: settings.classifyPass,
    [CONFIG.columns.pipelineRuns.namingPass]: settings.namingPass,
    [CONFIG.columns.pipelineRuns.extractPass]: settings.extractPass,
    [CONFIG.columns.pipelineRuns.startProductId]: settings.startProductId || null,
    [CONFIG.columns.pipelineRuns.lastCompletedProductId]:
      settings.startProductId || null,
    [CONFIG.columns.pipelineRuns.currentWaveIndex]: 0,
    [CONFIG.columns.pipelineRuns.createdAt]: now,
    [CONFIG.columns.pipelineRuns.updatedAt]: now,
    [CONFIG.columns.pipelineRuns.completedAt]: null,
    [CONFIG.columns.pipelineRuns.blockedAt]: null,
  };

  const { error } = await supabase.from(CONFIG.tables.pipelineRuns).insert(row);
  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineRuns}] ${error.message}`);
  }

  return fetchPipelineRunById(supabase, row[CONFIG.columns.pipelineRuns.runId]);
}

async function updatePipelineRunFields(supabase, runId, patch) {
  const { error } = await supabase
    .from(CONFIG.tables.pipelineRuns)
    .update(patch)
    .eq(CONFIG.columns.pipelineRuns.runId, runId);

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineRuns}] ${error.message}`);
  }

  return fetchPipelineRunById(supabase, runId);
}

function getPipelineRunnerLeasePath() {
  return path.join(CONFIG.tmpDir, "off-products-run-parallel.lock.json");
}

function serializePipelineRunnerLease(lease) {
  return {
    runner_id: trimString(lease?.runner_id) || null,
    command: "run:parallel",
    pid: parseOptionalInteger(lease?.pid) || null,
    host: trimString(lease?.host) || null,
    run_id: normalizeId(lease?.run_id),
    wave_index: parseOptionalInteger(lease?.wave_index),
    acquired_at: trimString(lease?.acquired_at) || null,
    updated_at: trimString(lease?.updated_at) || null,
  };
}

async function readPipelineRunnerLease() {
  const leasePath = getPipelineRunnerLeasePath();
  if (!(await pathExists(leasePath))) {
    return null;
  }

  try {
    const parsed = JSON.parse(await readFile(leasePath, "utf8"));
    return normalizeObject(parsed) || { invalid: true };
  } catch {
    return { invalid: true };
  }
}

function isProcessAlive(pid) {
  const normalizedPid = parseOptionalInteger(pid);
  if (!normalizedPid) {
    return false;
  }

  try {
    process.kill(normalizedPid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function isPipelineRunnerLeaseAlive(lease) {
  if (!lease || lease.invalid) {
    return false;
  }

  const host = trimString(lease.host);
  const pid = parseOptionalInteger(lease.pid);
  if (host && host === getHostname() && pid) {
    return isProcessAlive(pid);
  }

  const updatedAtMs = Date.parse(
    trimString(lease.updated_at) || trimString(lease.acquired_at) || ""
  );
  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }

  return Date.now() - updatedAtMs <= CONFIG.pipelineRunnerLockStaleMs;
}

async function acquirePipelineRunnerLease() {
  const leasePath = getPipelineRunnerLeasePath();
  const now = new Date().toISOString();
  const lease = {
    runner_id: randomUUID(),
    pid: process.pid,
    host: getHostname(),
    run_id: null,
    wave_index: null,
    acquired_at: now,
    updated_at: now,
    path: leasePath,
  };

  while (true) {
    try {
      await writeFile(
        leasePath,
        JSON.stringify(serializePipelineRunnerLease(lease), null, 2),
        { flag: "wx" }
      );
      return lease;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      const existingLease = await readPipelineRunnerLease();
      if (!isPipelineRunnerLeaseAlive(existingLease)) {
        try {
          await unlink(leasePath);
        } catch (unlinkError) {
          if (unlinkError?.code !== "ENOENT") {
            throw unlinkError;
          }
        }
        continue;
      }

      throw new Error(
        [
          "[run:parallel] Another local runner is already active.",
          `pid=${parseOptionalInteger(existingLease?.pid) || "unknown"}`,
          `host=${trimString(existingLease?.host) || "unknown"}`,
          `run_id=${normalizeId(existingLease?.run_id) || "unknown"}`,
          `updated_at=${trimString(existingLease?.updated_at) || "unknown"}`,
        ].join(" ")
      );
    }
  }
}

async function touchPipelineRunnerLease(lease, patch = {}) {
  if (!lease) {
    return lease;
  }

  const nextLease = {
    ...lease,
    run_id: normalizeId(patch.runId ?? lease.run_id),
    wave_index: parseOptionalInteger(
      patch.waveIndex ?? patch.wave_index ?? lease.wave_index
    ),
    updated_at: new Date().toISOString(),
  };
  const existingLease = await readPipelineRunnerLease();

  if (
    existingLease &&
    !existingLease.invalid &&
    trimString(existingLease.runner_id) &&
    trimString(existingLease.runner_id) !== trimString(lease.runner_id)
  ) {
    throw new Error(
      `[run:parallel] Lost local runner lease to ${trimString(
        existingLease.runner_id
      )}`
    );
  }

  await writeJsonFile(lease.path, serializePipelineRunnerLease(nextLease));
  return nextLease;
}

async function releasePipelineRunnerLease(lease) {
  if (!lease) {
    return;
  }

  try {
    const existingLease = await readPipelineRunnerLease();
    if (
      existingLease &&
      !existingLease.invalid &&
      trimString(existingLease.runner_id) &&
      trimString(existingLease.runner_id) !== trimString(lease.runner_id)
    ) {
      return;
    }

    await unlink(lease.path);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(
        "[run:parallel] failed to release local runner lease",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

async function fetchPipelineStageJobs(supabase, runId, waveIndex, stage) {
  const { data, error } = await supabase
    .from(CONFIG.tables.pipelineJobs)
    .select("*")
    .eq(CONFIG.columns.pipelineJobs.runId, runId)
    .eq(CONFIG.columns.pipelineJobs.waveIndex, waveIndex)
    .eq(CONFIG.columns.pipelineJobs.stage, stage)
    .order(CONFIG.columns.pipelineJobs.jobIndex, { ascending: true });

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.pipelineJobs}] ${error.message}`);
  }

  return (data || []).map((row) => normalizePipelineJobRow(row));
}

async function fetchPipelineRetryQueueEntries(supabase, { limitJobs, stage } = {}) {
  let query = supabase
    .from(CONFIG.tables.pipelineRetryQueue)
    .select("*")
    .eq(CONFIG.columns.pipelineRetryQueue.status, "pending")
    .order(CONFIG.columns.pipelineRetryQueue.lastFailedAt, {
      ascending: true,
      nullsFirst: false,
    })
    .limit(Math.max(1, parseOptionalInteger(limitJobs) || 25));

  if (trimString(stage)) {
    query = query.eq(CONFIG.columns.pipelineRetryQueue.sourceStage, stage);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `[supabase:${CONFIG.tables.pipelineRetryQueue}] ${error.message}`
    );
  }

  return (data || []).map((row) => normalizePipelineRetryQueueRow(row));
}

async function updatePipelineRetryQueueEntry(supabase, queueId, patch) {
  const { error } = await supabase
    .from(CONFIG.tables.pipelineRetryQueue)
    .update(patch)
    .eq(CONFIG.columns.pipelineRetryQueue.queueId, queueId);

  if (error) {
    throw new Error(
      `[supabase:${CONFIG.tables.pipelineRetryQueue}] ${error.message}`
    );
  }
}

async function upsertPipelineJobRows(supabase, rows) {
  if (!rows.length) {
    return;
  }

  await insertRowsInChunks(supabase, CONFIG.tables.pipelineJobs, rows);
}

async function upsertPipelineJobRowsBestEffort(supabase, rows, label) {
  if (!rows.length) {
    return true;
  }

  let attempt = 1;
  while (true) {
    try {
      await upsertPipelineJobRows(supabase, rows);
      return true;
    } catch (error) {
      if (attempt >= CONFIG.supabaseRetryAttempts) {
        console.warn(
          `[${label || "pipelineJobs"}] failed to persist job rows after ${attempt} attempt(s): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return false;
      }

      console.warn(
        `[${label || "pipelineJobs"}] retrying failed job-row persistence: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await sleep(computeRetryDelayMs(CONFIG.supabaseRetryBaseMs, attempt));
      attempt += 1;
    }
  }
}

async function upsertPipelineRetryQueueRows(supabase, rows) {
  if (!rows.length) {
    return;
  }

  await insertRowsInChunks(supabase, CONFIG.tables.pipelineRetryQueue, rows);
}

async function upsertPipelineRetryQueueRowsBestEffort(supabase, rows, label) {
  if (!rows.length) {
    return true;
  }

  let attempt = 1;
  while (true) {
    try {
      await upsertPipelineRetryQueueRows(supabase, rows);
      return true;
    } catch (error) {
      if (attempt >= CONFIG.supabaseRetryAttempts) {
        console.warn(
          `[${label || "pipelineRetryQueue"}] failed to persist retry queue rows after ${attempt} attempt(s): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return false;
      }

      console.warn(
        `[${label || "pipelineRetryQueue"}] retrying failed retry-queue persistence: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await sleep(computeRetryDelayMs(CONFIG.supabaseRetryBaseMs, attempt));
      attempt += 1;
    }
  }
}

function buildDeferredRetryErrorMessage(value) {
  const message = trimString(value);
  if (!message) {
    return "[deferred_retry]";
  }
  return /^\[deferred_retry\]/i.test(message)
    ? message
    : `[deferred_retry] ${message}`;
}

function stripDeferredRetryErrorPrefix(value) {
  return trimString(value).replace(/^\[deferred_retry\]\s*/i, "");
}

function isPipelineJobDeferredForRetry(job) {
  return /^\[deferred_retry\]/i.test(trimString(job?.error_message));
}

function isPipelineJobDoneForMainSweep(job) {
  return (
    trimString(job?.status) === "succeeded" ||
    trimString(job?.status) === "skipped" ||
    (trimString(job?.status) === "failed" && isPipelineJobDeferredForRetry(job))
  );
}

function buildPipelineRetryQueueRow({ stage, jobRow, errorMessage }) {
  const now = new Date().toISOString();
  return {
    [CONFIG.columns.pipelineRetryQueue.sourceRunId]: trimString(jobRow?.run_id),
    [CONFIG.columns.pipelineRetryQueue.sourceWaveIndex]:
      parseOptionalInteger(jobRow?.wave_index) || 0,
    [CONFIG.columns.pipelineRetryQueue.sourceStage]:
      trimString(stage || jobRow?.stage),
    [CONFIG.columns.pipelineRetryQueue.sourceJobIndex]:
      parseOptionalInteger(jobRow?.job_index) || 0,
    [CONFIG.columns.pipelineRetryQueue.status]: "pending",
    [CONFIG.columns.pipelineRetryQueue.passType]:
      trimString(jobRow?.pass_type) || null,
    [CONFIG.columns.pipelineRetryQueue.startProductId]:
      normalizeId(jobRow?.start_product_id),
    [CONFIG.columns.pipelineRetryQueue.endProductId]:
      normalizeId(jobRow?.end_product_id),
    [CONFIG.columns.pipelineRetryQueue.rowCount]:
      parseOptionalInteger(jobRow?.row_count) || 0,
    [CONFIG.columns.pipelineRetryQueue.lastBatchId]:
      trimString(jobRow?.batch_id) || null,
    [CONFIG.columns.pipelineRetryQueue.lastErrorMessage]:
      trimString(errorMessage) || null,
    [CONFIG.columns.pipelineRetryQueue.failureCount]: Math.max(
      1,
      parseOptionalInteger(jobRow?.retry_count) || 1
    ),
    [CONFIG.columns.pipelineRetryQueue.updatedAt]: now,
    [CONFIG.columns.pipelineRetryQueue.lastFailedAt]: now,
    [CONFIG.columns.pipelineRetryQueue.resolvedAt]: null,
  };
}

async function enqueuePipelineRetryJobBestEffort({
  supabase,
  stage,
  jobRow,
  error,
}) {
  if (!jobRow || trimString(jobRow?.status) !== "failed") {
    return false;
  }

  const errorMessage =
    stripDeferredRetryErrorPrefix(
      trimString(error?.message) || trimString(error) || jobRow?.error_message
    ) || "Unknown pipeline job failure";

  return upsertPipelineRetryQueueRowsBestEffort(
    supabase,
    [buildPipelineRetryQueueRow({ stage, jobRow, errorMessage })],
    `${stage}:retry-queue`
  );
}

async function resolvePipelineRetryQueueEntryBestEffort({ supabase, job }) {
  if (!job) {
    return false;
  }

  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(CONFIG.tables.pipelineRetryQueue)
      .update({
        [CONFIG.columns.pipelineRetryQueue.status]: "succeeded",
        [CONFIG.columns.pipelineRetryQueue.lastErrorMessage]: null,
        [CONFIG.columns.pipelineRetryQueue.updatedAt]: now,
        [CONFIG.columns.pipelineRetryQueue.resolvedAt]: now,
      })
      .eq(CONFIG.columns.pipelineRetryQueue.sourceRunId, trimString(job.run_id))
      .eq(
        CONFIG.columns.pipelineRetryQueue.sourceWaveIndex,
        parseOptionalInteger(job.wave_index) || 0
      )
      .eq(CONFIG.columns.pipelineRetryQueue.sourceStage, trimString(job.stage))
      .eq(
        CONFIG.columns.pipelineRetryQueue.sourceJobIndex,
        parseOptionalInteger(job.job_index) || 0
      );

    if (error) {
      throw new Error(
        `[supabase:${CONFIG.tables.pipelineRetryQueue}] ${error.message}`
      );
    }

    return true;
  } catch (error) {
    console.warn(
      `[pipelineRetryQueue] failed to resolve retry entry: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}

async function deferPipelineJobsForRetryBestEffort({ supabase, stage, jobs }) {
  const failedJobs = (jobs || []).filter(
    (job) =>
      trimString(job?.status) === "failed" && !isPipelineJobDeferredForRetry(job)
  );
  if (!failedJobs.length) {
    return jobs;
  }

  const updates = [];
  for (const job of failedJobs) {
    await enqueuePipelineRetryJobBestEffort({
      supabase,
      stage: stage || job.stage,
      jobRow: job,
      error: job.error_message,
    });
    updates.push({
      ...job,
      error_message: buildDeferredRetryErrorMessage(job.error_message),
      updated_at: new Date().toISOString(),
    });
  }

  await upsertPipelineJobRowsBestEffort(
    supabase,
    updates,
    `${stage || "pipeline"}:defer-retry`
  );

  if (!failedJobs[0]?.run_id) {
    return jobs;
  }

  return fetchPipelineStageJobs(
    supabase,
    failedJobs[0].run_id,
    failedJobs[0].wave_index,
    stage || failedJobs[0].stage
  );
}

async function persistPipelineJobFailureBestEffort({
  supabase,
  stage,
  jobRow,
  error,
}) {
  const persistedJobRow =
    jobRow && trimString(jobRow?.status) === "failed"
      ? {
          ...jobRow,
          error_message: buildDeferredRetryErrorMessage(
            trimString(jobRow?.error_message) ||
              trimString(error?.message) ||
              trimString(error)
          ),
        }
      : jobRow;

  await upsertPipelineJobRowsBestEffort(
    supabase,
    persistedJobRow ? [persistedJobRow] : [],
    `${stage}:failure-state`
  );

  try {
    await recordPipelineJobFailureArtifact({
      job: persistedJobRow,
      stage,
      error,
    });
  } catch (artifactError) {
    console.warn(
      `[${stage}] failed to record pipeline failure artifact: ${
        artifactError instanceof Error
          ? artifactError.message
          : String(artifactError)
      }`
    );
  }

  if (persistedJobRow && trimString(persistedJobRow?.status) === "failed") {
    await enqueuePipelineRetryJobBestEffort({
      supabase,
      stage,
      jobRow: persistedJobRow,
      error,
    });
  }
}

function buildPipelineJobRow({
  runId,
  waveIndex,
  stage,
  jobIndex,
  status,
  passType = null,
  startProductId = null,
  endProductId = null,
  rowCount = null,
  manifestPath = null,
  jsonlPath = null,
  inputFileId = null,
  batchId = null,
  errorMessage = null,
  retryCount = 0,
}) {
  const now = new Date().toISOString();
  return {
    [CONFIG.columns.pipelineJobs.runId]: runId,
    [CONFIG.columns.pipelineJobs.waveIndex]: waveIndex,
    [CONFIG.columns.pipelineJobs.stage]: stage,
    [CONFIG.columns.pipelineJobs.jobIndex]: jobIndex,
    [CONFIG.columns.pipelineJobs.status]: status,
    [CONFIG.columns.pipelineJobs.passType]: passType,
    [CONFIG.columns.pipelineJobs.startProductId]: startProductId,
    [CONFIG.columns.pipelineJobs.endProductId]: endProductId,
    [CONFIG.columns.pipelineJobs.rowCount]: rowCount,
    [CONFIG.columns.pipelineJobs.manifestPath]: manifestPath,
    [CONFIG.columns.pipelineJobs.jsonlPath]: jsonlPath,
    [CONFIG.columns.pipelineJobs.inputFileId]: inputFileId,
    [CONFIG.columns.pipelineJobs.batchId]: batchId,
    [CONFIG.columns.pipelineJobs.errorMessage]: errorMessage,
    [CONFIG.columns.pipelineJobs.retryCount]: retryCount,
    [CONFIG.columns.pipelineJobs.createdAt]: now,
    [CONFIG.columns.pipelineJobs.updatedAt]: now,
    [CONFIG.columns.pipelineJobs.submittedAt]: null,
    [CONFIG.columns.pipelineJobs.completedAt]: null,
  };
}

async function buildClassificationBatch(flags) {
  const passType = requirePassType(flags.pass, [
    "nano_primary",
    "mini_fallback",
  ]);
  const limit = resolveLimit(flags.limit);
  const afterProductId = normalizeId(flags["after-product-id"]);
  const startProductId = normalizeId(flags["start-product-id"]);
  const endProductId = normalizeId(flags["end-product-id"]);
  const supabase = createAdminClient();

  const candidates = await collectClassificationCandidates(supabase, {
    passType,
    limit,
    afterProductId,
    startProductId,
    endProductId,
  });

  if (!candidates.length) {
    console.log("[classify:build] no eligible rows");
    return null;
  }

  const model = CONFIG.models.classify[passType];
  const items = candidates.map((candidate) => {
    const customId = buildCustomId(
      "classify",
      passType,
      candidate.product_id,
      candidate.content_hash
    );
    const request = {
      custom_id: customId,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: CLASSIFICATION_RESPONSE_SCHEMA,
        },
        messages: [
          {
            role: "system",
            content: buildClassificationSystemPrompt(),
          },
          {
            role: "user",
            content: buildClassificationUserPrompt(candidate),
          },
        ],
      },
    };

    return {
      ...candidate,
      custom_id: customId,
      request,
    };
  });

  const manifest = await writeBatchArtifacts({
    stage: "classification",
    passType,
    model,
    promptVersion: CONFIG.classifyPromptVersion,
    items,
  });

  console.log("[classify:build] manifest", manifest.manifest_path);
  console.log("[classify:build] jsonl", manifest.jsonl_path);
  console.log("[classify:build] rows", manifest.row_count);
  return manifest;
}

async function submitBatch(flags) {
  const manifestPath = resolveRequiredPath(
    flags.manifest,
    "Missing --manifest"
  );
  const manifest = await readJsonFile(manifestPath);
  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const jsonlPath = resolveRequiredPath(
    manifest.jsonl_path,
    "Manifest missing jsonl_path"
  );

  const inputFile = await uploadBatchInputFile(openAiApiKey, jsonlPath);
  const batch = await createOpenAiBatch(openAiApiKey, {
    inputFileId: inputFile.id,
    metadata: {
      stage: manifest.stage,
      pass_type: manifest.pass_type,
      model: manifest.model,
      prompt_version: manifest.prompt_version,
      start_product_id: trimString(manifest.start_product_id),
      end_product_id: trimString(manifest.end_product_id),
      row_count: String(manifest.row_count || 0),
    },
  });

  const nextManifest = {
    ...manifest,
    input_file_id: inputFile.id,
    batch_id: batch.id,
    batch_status: batch.status,
    submitted_at: new Date().toISOString(),
  };

  await writeJsonFile(manifestPath, nextManifest);

  console.log("[batch:submit] manifest", manifestPath);
  console.log("[batch:submit] input file", inputFile.id);
  console.log("[batch:submit] batch", batch.id);
  return nextManifest;
}

async function ingestClassificationBatch(flags) {
  const batchId = trimString(flags["batch-id"]);
  if (!batchId) {
    throw new Error("Missing --batch-id");
  }

  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const supabase = createAdminClient();
  const batch = await waitForBatch(openAiApiKey, batchId);
  assertBatchReadyForIngestion(batch, batchId);

  const downloads = await downloadBatchArtifacts(openAiApiKey, batch);
  const outputLines = downloads.outputFilePath
    ? await readJsonlFile(downloads.outputFilePath)
    : [];
  const errorLines = downloads.errorFilePath
    ? await readJsonlFile(downloads.errorFilePath)
    : [];
  const productIds = dedupeByKey(
    [...outputLines, ...errorLines]
      .map((line) => normalizeId(parseCustomId(trimString(line.custom_id)).productId))
      .filter(Boolean),
    (value) => String(value)
  );
  const productsById = await fetchProductsById(supabase, productIds);

  const inserts = [];

  for (const line of outputLines) {
    inserts.push(
      buildClassificationInsertFromBatchLine({
        line,
        batch,
        outputFileId: batch.output_file_id || null,
        productsById,
      })
    );
  }

  for (const line of errorLines) {
    inserts.push(
      buildClassificationInsertFromBatchLine({
        line,
        batch,
        outputFileId: batch.error_file_id || null,
        forceStatus: "batch_failed",
        productsById,
      })
    );
  }

  await insertRowsInChunks(supabase, CONFIG.tables.classification, inserts);
  await enqueueClassificationReviewRows(supabase, inserts);

  console.log("[classify:ingest] batch", batch.id);
  console.log("[classify:ingest] inserted", inserts.length);
  return { batch_id: batch.id, inserted: inserts.length };
}

async function buildNamingBatch(flags) {
  const passType = requirePassType(flags.pass, [
    "nano_primary",
    "mini_fallback",
  ]);
  const limit = resolveLimit(flags.limit);
  const afterProductId = normalizeId(flags["after-product-id"]);
  const startProductId = normalizeId(flags["start-product-id"]);
  const endProductId = normalizeId(flags["end-product-id"]);
  const supabase = createAdminClient();

  const candidates = await collectNamingCandidates(supabase, {
    passType,
    limit,
    afterProductId,
    startProductId,
    endProductId,
  });

  if (!candidates.length) {
    console.log("[naming:build] no eligible rows");
    return null;
  }

  const model = CONFIG.models.naming[passType];
  const items = candidates.map((candidate) => {
    const customId = buildCustomId(
      "naming",
      passType,
      candidate.product_id,
      candidate.content_hash
    );
    const request = {
      custom_id: customId,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: NAMING_RESPONSE_SCHEMA,
        },
        messages: [
          {
            role: "system",
            content: buildNamingSystemPrompt(),
          },
          {
            role: "user",
            content: buildNamingUserPrompt(candidate),
          },
        ],
      },
    };

    return {
      ...candidate,
      custom_id: customId,
      request,
    };
  });

  const manifest = await writeBatchArtifacts({
    stage: "naming",
    passType,
    model,
    promptVersion: CONFIG.namingPromptVersion,
    items,
  });

  console.log("[naming:build] manifest", manifest.manifest_path);
  console.log("[naming:build] jsonl", manifest.jsonl_path);
  console.log("[naming:build] rows", manifest.row_count);
  return manifest;
}

async function ingestNamingBatch(flags) {
  const batchId = trimString(flags["batch-id"]);
  if (!batchId) {
    throw new Error("Missing --batch-id");
  }

  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const supabase = createAdminClient();
  const batch = await waitForBatch(openAiApiKey, batchId);
  assertBatchReadyForIngestion(batch, batchId);

  const downloads = await downloadBatchArtifacts(openAiApiKey, batch);
  const outputLines = downloads.outputFilePath
    ? await readJsonlFile(downloads.outputFilePath)
    : [];
  const errorLines = downloads.errorFilePath
    ? await readJsonlFile(downloads.errorFilePath)
    : [];

  const inserts = [];

  for (const line of outputLines) {
    inserts.push(buildNamingInsertFromBatchLine({ line, batch }));
  }

  for (const line of errorLines) {
    inserts.push(
      buildNamingInsertFromBatchLine({
        line,
        batch,
        forceStatus: "batch_failed",
      })
    );
  }

  await insertRowsInChunks(supabase, CONFIG.tables.naming, inserts);
  await refreshSupplementMasterForProductIds(
    supabase,
    inserts.map((row) => row[CONFIG.columns.naming.productId])
  );

  console.log("[naming:ingest] batch", batch.id);
  console.log("[naming:ingest] inserted", inserts.length);
  return { batch_id: batch.id, inserted: inserts.length };
}

async function buildExtractionBatch(flags) {
  const passType = requirePassType(flags.pass, [
    "nano_primary",
    "mini_fallback",
  ]);
  const limit = resolveLimit(flags.limit);
  const afterProductId = normalizeId(flags["after-product-id"]);
  const startProductId = normalizeId(flags["start-product-id"]);
  const endProductId = normalizeId(flags["end-product-id"]);
  const supabase = createAdminClient();

  const candidates = await collectExtractionCandidates(supabase, {
    passType,
    limit,
    afterProductId,
    startProductId,
    endProductId,
  });

  if (!candidates.length) {
    console.log("[extract:build] no eligible rows");
    return null;
  }

  const model = CONFIG.models.extract[passType];
  const items = candidates.map((candidate) => {
    const customId = buildCustomId(
      "extract",
      passType,
      candidate.product_id,
      candidate.content_hash
    );
    const request = {
      custom_id: customId,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: EXTRACTION_RESPONSE_SCHEMA,
        },
        messages: [
          {
            role: "system",
            content: buildExtractionSystemPrompt(),
          },
          {
            role: "user",
            content: buildExtractionUserPrompt(candidate),
          },
        ],
      },
    };

    return {
      ...candidate,
      custom_id: customId,
      request,
    };
  });

  const manifest = await writeBatchArtifacts({
    stage: "extraction",
    passType,
    model,
    promptVersion: CONFIG.extractPromptVersion,
    items,
  });

  console.log("[extract:build] manifest", manifest.manifest_path);
  console.log("[extract:build] jsonl", manifest.jsonl_path);
  console.log("[extract:build] rows", manifest.row_count);
  return manifest;
}

async function ingestExtractionBatch(flags) {
  const batchId = trimString(flags["batch-id"]);
  if (!batchId) {
    throw new Error("Missing --batch-id");
  }

  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const supabase = createAdminClient();
  const batch = await waitForBatch(openAiApiKey, batchId);
  assertBatchReadyForIngestion(batch, batchId);

  const downloads = await downloadBatchArtifacts(openAiApiKey, batch);
  const outputLines = downloads.outputFilePath
    ? await readJsonlFile(downloads.outputFilePath)
    : [];
  const errorLines = downloads.errorFilePath
    ? await readJsonlFile(downloads.errorFilePath)
    : [];

  const inserts = [];

  for (const line of outputLines) {
    inserts.push(
      buildExtractionInsertFromBatchLine({
        line,
        batch,
        outputFileId: batch.output_file_id || null,
      })
    );
  }

  for (const line of errorLines) {
    inserts.push(
      buildExtractionInsertFromBatchLine({
        line,
        batch,
        outputFileId: batch.error_file_id || null,
        forceStatus: "batch_failed",
      })
    );
  }

  await insertRowsInChunks(supabase, CONFIG.tables.extraction, inserts);
  await enqueueExtractionReviewRows(supabase, inserts);

  console.log("[extract:ingest] batch", batch.id);
  console.log("[extract:ingest] inserted", inserts.length);
  return { batch_id: batch.id, inserted: inserts.length };
}

async function resolveAliases(flags) {
  const limit = Math.max(1, parseOptionalInteger(flags.limit) || 500);
  const productIds = parseIdList(flags["product-ids"]);
  const startProductId = normalizeId(flags["start-product-id"]);
  const endProductId = normalizeId(flags["end-product-id"]);
  const supabase = createAdminClient();
  const extractionRows = await fetchSuccessfulExtractionRows(supabase, {
    limit,
    productIds,
    startProductId,
    endProductId,
  });

  if (!extractionRows.length) {
    console.log("[aliases:resolve] no successful extraction rows");
    return { extraction_rows_processed: 0, active_ingredient_inserts: 0 };
  }

  const aliasRows = await fetchAliasRows(supabase);
  const approvedSupplements = await fetchApprovedSupplements(supabase);
  const aliasIndex = buildAliasIndex(aliasRows);
  const supplementNameIndex = buildSupplementNameIndex(approvedSupplements);
  const existingActiveRows = await fetchRowsForProductIds(
    supabase,
    CONFIG.tables.activeIngredients,
    extractionRows.map((row) => row[CONFIG.columns.extraction.productId])
  );
  const existingActiveRowsBySignature = groupActiveIngredientRowsBySignature(
    existingActiveRows
  );

  const activeIngredientInserts = [];
  const activeIngredientUpdates = [];
  const missingSupplementRows = [];
  let resolvedCount = 0;

  for (const row of extractionRows) {
    const productId = row[CONFIG.columns.extraction.productId];
    const sourceCustomId = getPipelineCustomId(row);
    const parsedOutput = getParsedOutput(row) || {};
    const ingredients = Array.isArray(parsedOutput.ingredients_found)
      ? parsedOutput.ingredients_found
      : [];

    for (const ingredient of ingredients) {
      const normalized = normalizeExtractedIngredient(ingredient);
      if (normalized.ingredient_type === "inactive") {
        continue;
      }

      const normalizedLookupName = normalizeBroadIngredientName(
        normalized.canonical_name || normalized.raw_name
      );
      const matchedAlias =
        aliasIndex.get(normalizedLookupName) ||
        supplementNameIndex.get(normalizedLookupName) ||
        null;
      const dosage = normalizeDosage({
        dosageValue: normalized.dosage_value,
        dosageUnit: normalized.dosage_unit,
        dosageOriginalText: normalized.dosage_original_text,
      });
      const signature = buildActiveIngredientSignature({
        [CONFIG.columns.activeIngredients.productId]: productId,
        [CONFIG.columns.activeIngredients.rawName]: normalized.raw_name,
        [CONFIG.columns.activeIngredients.canonicalName]:
          normalized.canonical_name || normalized.raw_name,
        [CONFIG.columns.activeIngredients.dosageValue]: dosage.value,
        [CONFIG.columns.activeIngredients.dosageUnit]: dosage.unit,
        [CONFIG.columns.activeIngredients.chemicalForm]: normalized.chemical_form,
        [CONFIG.columns.activeIngredients.amountBasis]: normalized.amount_basis,
      });
      const existingRowsForSignature =
        existingActiveRowsBySignature.get(signature) || [];

      if (
        !matchedAlias &&
        existingRowsForSignature.some(
          (existingRow) =>
            trimString(
              existingRow?.[CONFIG.columns.activeIngredients.resolutionStatus]
            ) === "ignored"
        )
      ) {
        continue;
      }

      let resolutionStatus = "matched";
      if (normalized.ingredient_type === "uncertain") {
        resolutionStatus = "uncertain";
      } else if (!matchedAlias) {
        resolutionStatus = "needs_alias_review";
      }

      if (
        resolutionStatus === "needs_alias_review" &&
        isPlausibleActiveIngredient(normalized)
      ) {
        await insertReviewQueueOnce(
          supabase,
          productId,
          CONFIG.reviewTypes.aliasUnresolved,
          {
            source_custom_id: sourceCustomId,
            raw_name: normalized.raw_name,
            canonical_name: normalized.canonical_name,
            normalized_name: normalizedLookupName,
          }
        );
      }

      if (dosage.invalidReason) {
        await insertReviewQueueOnce(
          supabase,
          productId,
          CONFIG.reviewTypes.dosageMalformed,
          {
            source_custom_id: sourceCustomId,
            raw_name: normalized.raw_name,
            dosage_original_text: normalized.dosage_original_text,
            invalid_reason: dosage.invalidReason,
          }
        );
      }

      const nextInsert = {
        [CONFIG.columns.activeIngredients.productId]: productId,
        [CONFIG.columns.activeIngredients.rawName]: normalized.raw_name,
        [CONFIG.columns.activeIngredients.canonicalName]:
          normalized.canonical_name || normalized.raw_name,
        [CONFIG.columns.activeIngredients.ingredientType]:
          normalized.ingredient_type,
        [CONFIG.columns.activeIngredients.dosageValue]: dosage.value,
        [CONFIG.columns.activeIngredients.dosageUnit]: dosage.unit,
        [CONFIG.columns.activeIngredients.dosageOriginalText]:
          normalized.dosage_original_text,
        [CONFIG.columns.activeIngredients.chemicalForm]:
          normalized.chemical_form,
        [CONFIG.columns.activeIngredients.amountBasis]: normalized.amount_basis,
        [CONFIG.columns.activeIngredients.supplementId]:
          matchedAlias?.supplement_id || null,
        [CONFIG.columns.activeIngredients.resolutionStatus]: resolutionStatus,
        [CONFIG.columns.activeIngredients.resolutionConfidence]:
          resolutionStatus === "matched"
            ? 1
            : resolutionStatus === "uncertain"
            ? 0.25
            : 0.5,
        [CONFIG.columns.activeIngredients.sourceModel]:
          row[CONFIG.columns.extraction.model] || null,
        [CONFIG.columns.activeIngredients.sourcePromptVersion]:
          row[CONFIG.columns.extraction.promptVersion] || null,
      };
      if (existingRowsForSignature.length > 0) {
        if (
          matchedAlias?.supplement_id &&
          existingRowsForSignature.some(
            (existingRow) =>
              !trimString(
                existingRow?.[CONFIG.columns.activeIngredients.supplementId]
              )
          )
        ) {
          activeIngredientUpdates.push({
            [CONFIG.columns.activeIngredients.productId]:
              nextInsert[CONFIG.columns.activeIngredients.productId],
            [CONFIG.columns.activeIngredients.rawName]:
              nextInsert[CONFIG.columns.activeIngredients.rawName],
            [CONFIG.columns.activeIngredients.canonicalName]:
              nextInsert[CONFIG.columns.activeIngredients.canonicalName],
            [CONFIG.columns.activeIngredients.ingredientType]:
              nextInsert[CONFIG.columns.activeIngredients.ingredientType],
            [CONFIG.columns.activeIngredients.dosageValue]:
              nextInsert[CONFIG.columns.activeIngredients.dosageValue],
            [CONFIG.columns.activeIngredients.dosageUnit]:
              nextInsert[CONFIG.columns.activeIngredients.dosageUnit],
            [CONFIG.columns.activeIngredients.chemicalForm]:
              nextInsert[CONFIG.columns.activeIngredients.chemicalForm],
            [CONFIG.columns.activeIngredients.amountBasis]:
              nextInsert[CONFIG.columns.activeIngredients.amountBasis],
            supplement_id: matchedAlias.supplement_id,
            resolution_status: "matched",
            resolution_confidence: 1,
          });
          existingActiveRowsBySignature.set(
            signature,
            existingRowsForSignature.map((existingRow) => ({
              ...existingRow,
              [CONFIG.columns.activeIngredients.supplementId]:
                matchedAlias.supplement_id,
              [CONFIG.columns.activeIngredients.resolutionStatus]: "matched",
              [CONFIG.columns.activeIngredients.resolutionConfidence]: 1,
            }))
          );
        }
        continue;
      }

      existingActiveRowsBySignature.set(signature, [nextInsert]);
      activeIngredientInserts.push(nextInsert);
      if (
        resolutionStatus === "needs_alias_review" &&
        isPlausibleActiveIngredient(normalized)
      ) {
        missingSupplementRows.push({
          product_id: productId,
          normalized_name: normalizedLookupName,
          display_name:
            normalized.canonical_name || normalized.raw_name || normalizedLookupName,
        });
      }
    }

    resolvedCount += 1;
  }

  const activeIngredientUpdateCount = await updateResolvedActiveIngredientRows(
    supabase,
    activeIngredientUpdates
  );
  await insertRowsInChunks(
    supabase,
    CONFIG.tables.activeIngredients,
    activeIngredientInserts
  );
  const missingSupplementRefresh = await incrementMissingSupplementCounts(
    supabase,
    missingSupplementRows
  );
  const masterRefresh = await refreshSupplementMasterForProductIds(
    supabase,
    extractionRows.map((row) => row[CONFIG.columns.extraction.productId])
  );

  console.log("[aliases:resolve] extraction rows processed", resolvedCount);
  console.log(
    "[aliases:resolve] active ingredient inserts",
    activeIngredientInserts.length
  );
  console.log(
    "[aliases:resolve] active ingredient updates",
    activeIngredientUpdateCount
  );
  console.log(
    "[aliases:resolve] missing supplement candidates upserted",
    missingSupplementRefresh.upserted
  );
  console.log("[aliases:resolve] master rows upserted", masterRefresh.upserted);
  return {
    extraction_rows_processed: resolvedCount,
    active_ingredient_inserts: activeIngredientInserts.length,
    active_ingredient_updates: activeIngredientUpdateCount,
    missing_supplement_candidate_upserts: missingSupplementRefresh.upserted,
    supplement_master_upserts: masterRefresh.upserted,
  };
}

async function backfillResolvedAliases(flags) {
  const limit = Math.max(1, parseOptionalInteger(flags.limit) || 5000);
  const productIds = parseIdList(flags["product-ids"]);
  const startProductId = normalizeId(flags["start-product-id"]);
  const endProductId = normalizeId(flags["end-product-id"]);
  const supabase = createAdminClient();
  const unresolvedRows = await fetchNeedsAliasReviewActiveIngredientRows(
    supabase,
    {
      limit,
      productIds,
      startProductId,
      endProductId,
    }
  );

  if (!unresolvedRows.length) {
    console.log("[aliases:backfill] no unresolved active ingredient rows");
    return {
      unresolved_rows_scanned: 0,
      matched_updates: 0,
      supplement_master_upserts: 0,
    };
  }

  const aliasRows = await fetchAliasRows(supabase);
  const approvedSupplements = await fetchApprovedSupplements(supabase);
  const aliasIndex = buildAliasIndex(aliasRows);
  const supplementNameIndex = buildSupplementNameIndex(approvedSupplements);
  const updates = [];
  const affectedProductIds = new Set();

  for (const row of unresolvedRows) {
    const normalizedLookupName = normalizeBroadIngredientName(
      row?.[CONFIG.columns.activeIngredients.canonicalName] ||
        row?.[CONFIG.columns.activeIngredients.rawName]
    );
    if (!normalizedLookupName) {
      continue;
    }

    const matchedAlias =
      aliasIndex.get(normalizedLookupName) ||
      supplementNameIndex.get(normalizedLookupName) ||
      null;

    if (!matchedAlias?.supplement_id) {
      continue;
    }

    updates.push({
      [CONFIG.columns.activeIngredients.productId]:
        row?.[CONFIG.columns.activeIngredients.productId],
      [CONFIG.columns.activeIngredients.rawName]:
        row?.[CONFIG.columns.activeIngredients.rawName],
      [CONFIG.columns.activeIngredients.canonicalName]:
        row?.[CONFIG.columns.activeIngredients.canonicalName],
      [CONFIG.columns.activeIngredients.ingredientType]:
        row?.[CONFIG.columns.activeIngredients.ingredientType],
      [CONFIG.columns.activeIngredients.dosageValue]:
        row?.[CONFIG.columns.activeIngredients.dosageValue],
      [CONFIG.columns.activeIngredients.dosageUnit]:
        row?.[CONFIG.columns.activeIngredients.dosageUnit],
      [CONFIG.columns.activeIngredients.chemicalForm]:
        row?.[CONFIG.columns.activeIngredients.chemicalForm],
      [CONFIG.columns.activeIngredients.amountBasis]:
        row?.[CONFIG.columns.activeIngredients.amountBasis],
      supplement_id: matchedAlias.supplement_id,
      resolution_status: "matched",
      resolution_confidence: 1,
    });

    const productId = normalizeId(
      row?.[CONFIG.columns.activeIngredients.productId]
    );
    if (productId) {
      affectedProductIds.add(productId);
    }
  }

  const matchedUpdates = await updateResolvedActiveIngredientRows(
    supabase,
    updates
  );
  const masterRefresh = await refreshSupplementMasterForProductIds(
    supabase,
    [...affectedProductIds]
  );

  console.log("[aliases:backfill] unresolved rows scanned", unresolvedRows.length);
  console.log("[aliases:backfill] matched updates", matchedUpdates);
  console.log(
    "[aliases:backfill] master rows upserted",
    masterRefresh.upserted
  );

  return {
    unresolved_rows_scanned: unresolvedRows.length,
    matched_updates: matchedUpdates,
    supplement_master_upserts: masterRefresh.upserted,
  };
}

async function runAiAliasMatch(flags) {
  const limit = Math.max(1, parseOptionalInteger(flags.limit) || 100);
  const candidateLimit = Math.max(
    5,
    parseOptionalInteger(flags["candidate-limit"]) || 20
  );
  const minConfidence = Math.max(
    0,
    Math.min(
      1,
      parseOptionalNumber(
        flags["min-confidence"] ||
          process.env.OFF_PRODUCTS_ALIAS_MATCH_MIN_CONFIDENCE
      ) ?? 0.9
    )
  );
  const dryRun =
    flags["dry-run"] === true ||
    parseOptionalBoolean(flags["dry-run"]) === true;
  const excludeNormalizedNames = new Set(
    (Array.isArray(flags.__excludeNormalizedNames)
      ? flags.__excludeNormalizedNames
      : String(flags.__excludeNormalizedNames || "")
          .split(",")
          .map((item) => trimString(item))
    ).filter(Boolean)
  );
  const sourceOffset = Math.max(
    0,
    parseOptionalInteger(flags.__sourceOffset) || 0
  );
  const maxSourceRows = Math.max(
    1,
    parseOptionalInteger(flags["max-source-rows"] || flags.__maxSourceRows) ||
      1000000
  );

  const supabase = createAdminClient();
  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const unresolvedCandidates = await fetchNeedsAliasReviewCandidates(supabase, {
    limitNames: limit,
    excludeNormalizedNames,
    startOffset: sourceOffset,
    maxRows: maxSourceRows,
  });

  if (!unresolvedCandidates.length) {
    console.log("[aliases:ai-match] no unresolved active ingredients");
    return {
      unresolved_candidates: 0,
      inserted_aliases: 0,
      reresolved_products: 0,
    };
  }

  const aliasRows = await fetchAliasRows(supabase);
  const approvedSupplements = await fetchApprovedSupplements(supabase);
  const aliasIndex = buildAliasIndex(aliasRows);
  const supplementNameIndex = buildSupplementNameIndex(approvedSupplements);
  const aliasRowsBySupplementId = groupAliasRowsBySupplementId(aliasRows);
  const supplementCatalog = buildAliasMatchSupplementCatalog({
    approvedSupplements,
    aliasRowsBySupplementId,
  });
  const approvedSupplementIds = new Set(
    approvedSupplements
      .map((row) => trimString(row?.[CONFIG.columns.supplements.supplementId]))
      .filter(Boolean)
  );

  const sampleProductIds = dedupeByKey(
    unresolvedCandidates.flatMap((candidate) => candidate.product_ids),
    (item) => String(item)
  );
  const productsById = await fetchProductsById(supabase, sampleProductIds);

  const aliasesToInsert = [];
  const aliasKeySet = new Set(
    aliasRows
      .map((row) => {
        const supplementId = trimString(
          pickFirstValue(row, CONFIG.columns.aliases.supplementIdCandidates)
        );
        const normalizedName =
          trimString(
            pickFirstValue(row, CONFIG.columns.aliases.normalizedNameCandidates)
          ) ||
          normalizeBroadIngredientName(
            pickFirstValue(row, CONFIG.columns.aliases.aliasNameCandidates)
          );
        return supplementId && normalizedName
          ? `${supplementId}|${normalizedName}`
          : "";
      })
      .filter(Boolean)
  );

  let alreadyResolvable = 0;
  let insertedAliases = 0;
  let noMatchCount = 0;
  let lowConfidenceCount = 0;
  let conflictingExistingAliasCount = 0;
  const affectedProductIds = new Set();
  const attemptedNormalizedNames = [];
  const insertedNormalizedNames = [];

  for (const candidate of unresolvedCandidates) {
    attemptedNormalizedNames.push(candidate.normalized_name);
    const deterministicMatch =
      aliasIndex.get(candidate.normalized_name) ||
      supplementNameIndex.get(candidate.normalized_name) ||
      null;
    if (deterministicMatch) {
      alreadyResolvable += 1;
      candidate.product_ids.forEach((productId) => affectedProductIds.add(productId));
      continue;
    }

    const shortlist = shortlistSupplementsForAliasMatch({
      candidate,
      supplementCatalog,
      limit: candidateLimit,
    });

    if (!shortlist.length) {
      noMatchCount += 1;
      continue;
    }

    const suggestion = await requestAliasMatchSuggestion(openAiApiKey, {
      candidate,
      shortlist,
      productsById,
    });

    if (suggestion.decision !== "match_existing") {
      noMatchCount += 1;
      continue;
    }

    const supplementId = trimString(suggestion.supplement_id);
    if (!supplementId || !approvedSupplementIds.has(supplementId)) {
      noMatchCount += 1;
      continue;
    }

    if (suggestion.confidence < minConfidence) {
      lowConfidenceCount += 1;
      continue;
    }

    const conflictingAlias =
      aliasIndex.get(candidate.normalized_name) ||
      supplementNameIndex.get(candidate.normalized_name) ||
      null;
    if (conflictingAlias && conflictingAlias.supplement_id !== supplementId) {
      conflictingExistingAliasCount += 1;
      continue;
    }

    const aliasLabel =
      trimString(suggestion.alias) ||
      trimString(candidate.display_name) ||
      candidate.normalized_name;
    const aliasKey = `${supplementId}|${candidate.normalized_name}`;
    if (aliasKeySet.has(aliasKey)) {
      candidate.product_ids.forEach((productId) => affectedProductIds.add(productId));
      continue;
    }

    aliasesToInsert.push({
      supplement_id: supplementId,
      alias: aliasLabel,
      alias_normalized: candidate.normalized_name,
      alias_type: "ai_match",
    });
    insertedNormalizedNames.push(candidate.normalized_name);
    aliasKeySet.add(aliasKey);
    candidate.product_ids.forEach((productId) => affectedProductIds.add(productId));
  }

  if (!dryRun && aliasesToInsert.length) {
    await insertRowsInChunks(supabase, CONFIG.tables.aliases, aliasesToInsert);
    insertedAliases = aliasesToInsert.length;
  }

  let reresolvedProducts = 0;
  if (!dryRun && affectedProductIds.size) {
    const productIds = [...affectedProductIds];
    reresolvedProducts = productIds.length;
    for (const productIdChunk of chunkArray(productIds, 250)) {
      await resolveAliases({
        limit: productIdChunk.length,
        "product-ids": productIdChunk.join(","),
      });
    }
  }

  const summary = {
    unresolved_candidates: unresolvedCandidates.length,
    inserted_aliases: dryRun ? aliasesToInsert.length : insertedAliases,
    already_resolvable: alreadyResolvable,
    no_match: noMatchCount,
    low_confidence: lowConfidenceCount,
    conflicting_existing_alias: conflictingExistingAliasCount,
    reresolved_products: dryRun ? 0 : reresolvedProducts,
    dry_run: dryRun,
    attempted_normalized_names: attemptedNormalizedNames,
    inserted_normalized_names: insertedNormalizedNames,
    source_offset: sourceOffset,
    source_rows_scanned: unresolvedCandidates.source_rows_scanned || 0,
    source_exhausted: unresolvedCandidates.source_exhausted === true,
  };
  console.log("[aliases:ai-match] completed", JSON.stringify(summary));
  return summary;
}

async function runAiAliasMatchLoop(flags) {
  const cycles = Math.max(1, parseOptionalInteger(flags.cycles) || 100);
  const excludedNormalizedNames = new Set();
  let totalInsertedAliases = 0;
  let totalReresolvedProducts = 0;
  let processedCandidates = 0;
  let passesRun = 0;
  let sourceOffset = 0;
  const maxSourceRows = Math.max(
    1,
    parseOptionalInteger(flags["max-source-rows"]) || 1000000
  );

  for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex += 1) {
    console.log(`[aliases:ai-match-loop] pass ${cycleIndex + 1}/${cycles}`);
    const result = await runAiAliasMatch({
      ...flags,
      __excludeNormalizedNames: [...excludedNormalizedNames],
      __sourceOffset: sourceOffset,
      __maxSourceRows: maxSourceRows,
    });

    passesRun += 1;
    processedCandidates += result.unresolved_candidates || 0;
    totalInsertedAliases += result.inserted_aliases || 0;
    totalReresolvedProducts += result.reresolved_products || 0;

    for (const normalizedName of result.attempted_normalized_names || []) {
      if (trimString(normalizedName)) {
        excludedNormalizedNames.add(trimString(normalizedName));
      }
    }

    sourceOffset += Math.max(0, result.source_rows_scanned || 0);

    if (!(result.unresolved_candidates > 0)) {
      if (result.source_exhausted) {
        break;
      }

      continue;
    }

    if (!(result.attempted_normalized_names || []).length) {
      if (result.source_exhausted) {
        break;
      }

      continue;
    }
  }

  const summary = {
    passes_run: passesRun,
    processed_candidates: processedCandidates,
    inserted_aliases: totalInsertedAliases,
    reresolved_products: totalReresolvedProducts,
    excluded_candidates: excludedNormalizedNames.size,
    final_source_offset: sourceOffset,
  };
  console.log("[aliases:ai-match-loop] completed", JSON.stringify(summary));
  return summary;
}

async function runAiAliasTriage(flags) {
  const limit = Math.max(1, parseOptionalInteger(flags.limit) || 100);
  const candidateLimit = Math.max(
    5,
    parseOptionalInteger(flags["candidate-limit"]) || 20
  );
  const minConfidence = Math.max(
    0,
    Math.min(
      1,
      parseOptionalNumber(
        flags["min-confidence"] ||
          process.env.OFF_PRODUCTS_ALIAS_MATCH_MIN_CONFIDENCE
      ) ?? 0.9
    )
  );
  const dryRun =
    flags["dry-run"] === true ||
    parseOptionalBoolean(flags["dry-run"]) === true;
  const excludeNormalizedNames = new Set(
    (Array.isArray(flags.__excludeNormalizedNames)
      ? flags.__excludeNormalizedNames
      : String(flags.__excludeNormalizedNames || "")
          .split(",")
          .map((item) => trimString(item))
    ).filter(Boolean)
  );
  const sourceOffset = Math.max(
    0,
    parseOptionalInteger(flags.__sourceOffset) || 0
  );
  const maxSourceRows = Math.max(
    1,
    parseOptionalInteger(flags["max-source-rows"] || flags.__maxSourceRows) ||
      1000000
  );

  const supabase = createAdminClient();
  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const unresolvedCandidates = await fetchNeedsAliasReviewCandidates(supabase, {
    limitNames: limit,
    excludeNormalizedNames,
    startOffset: sourceOffset,
    maxRows: maxSourceRows,
  });

  if (!unresolvedCandidates.length) {
    console.log("[aliases:ai-triage] no unresolved active ingredients");
    return {
      unresolved_candidates: 0,
      inserted_aliases: 0,
      created_supplements: 0,
      ignored_rows: 0,
      reresolved_products: 0,
    };
  }

  const [aliasRows, supplementRows] = await Promise.all([
    fetchAliasRows(supabase),
    fetchSupplementRows(supabase),
  ]);
  const aliasIndex = buildAliasIndex(aliasRows);
  const supplementNameIndex = buildSupplementNameIndex(supplementRows);
  const aliasRowsBySupplementId = groupAliasRowsBySupplementId(aliasRows);
  const supplementCatalog = buildAliasMatchSupplementCatalog({
    approvedSupplements: supplementRows,
    aliasRowsBySupplementId,
  });
  const supplementIds = new Set(
    supplementRows
      .map((row) => trimString(row?.[CONFIG.columns.supplements.supplementId]))
      .filter(Boolean)
  );
  const occurrenceRows = await fetchMissingSupplementOccurrenceRows(
    supabase,
    unresolvedCandidates.map((candidate) => candidate.normalized_name)
  );
  const productIdsByNormalizedName =
    buildProductIdsByNormalizedNameFromOccurrences(occurrenceRows);
  const sampleProductIds = dedupeByKey(
    unresolvedCandidates.flatMap(
      (candidate) =>
        productIdsByNormalizedName.get(candidate.normalized_name) ||
        candidate.product_ids ||
        []
    ),
    (item) => String(item)
  );
  const productsById = await fetchProductsById(supabase, sampleProductIds);

  const aliasKeySet = new Set(
    aliasRows
      .map((row) => {
        const supplementId = trimString(
          pickFirstValue(row, CONFIG.columns.aliases.supplementIdCandidates)
        );
        const normalizedName =
          trimString(
            pickFirstValue(row, CONFIG.columns.aliases.normalizedNameCandidates)
          ) ||
          normalizeBroadIngredientName(
            pickFirstValue(row, CONFIG.columns.aliases.aliasNameCandidates)
          );
        return supplementId && normalizedName
          ? `${supplementId}|${normalizedName}`
          : "";
      })
      .filter(Boolean)
  );

  const aliasesToInsert = [];
  const affectedProductIds = new Set();
  const attemptedNormalizedNames = [];
  const insertedNormalizedNames = [];

  let alreadyResolvable = 0;
  let insertedAliases = 0;
  let lowConfidenceCount = 0;
  let noActionCount = 0;

  for (const candidate of unresolvedCandidates) {
    attemptedNormalizedNames.push(candidate.normalized_name);
    const candidateProductIds =
      productIdsByNormalizedName.get(candidate.normalized_name) ||
      candidate.product_ids ||
      [];
    const deterministicMatch =
      aliasIndex.get(candidate.normalized_name) ||
      supplementNameIndex.get(candidate.normalized_name) ||
      null;
    if (deterministicMatch?.supplement_id) {
      alreadyResolvable += 1;
      candidateProductIds.forEach((productId) => affectedProductIds.add(productId));
      continue;
    }

    const shortlist = shortlistSupplementsForAliasMatch({
      candidate,
      supplementCatalog,
      limit: candidateLimit,
    });
    const suggestion = await requestAliasTriageSuggestion(openAiApiKey, {
      candidate,
      shortlist,
      productsById,
    });

    if (suggestion.confidence < minConfidence) {
      lowConfidenceCount += 1;
      continue;
    }

    if (suggestion.decision !== "match_existing") {
      noActionCount += 1;
      continue;
    }

    let supplementId = trimString(suggestion.supplement_id) || null;
    let supplementName =
      normalizeWhitespace(
        trimString(suggestion.supplement_name) ||
          trimString(candidate.display_name) ||
          candidate.normalized_name
      ) || null;

    if (!supplementId || !supplementIds.has(supplementId)) {
      noActionCount += 1;
      continue;
    }

    if (!supplementId) {
      noActionCount += 1;
      continue;
    }

    const aliasLabel =
      trimString(suggestion.alias) ||
      trimString(candidate.display_name) ||
      supplementName ||
      candidate.normalized_name;
    const aliasKey = `${supplementId}|${candidate.normalized_name}`;
    if (aliasKeySet.has(aliasKey)) {
      candidateProductIds.forEach((productId) => affectedProductIds.add(productId));
      continue;
    }

    aliasesToInsert.push({
      supplement_id: supplementId,
      alias: aliasLabel,
      alias_normalized: candidate.normalized_name,
      alias_type: "ai_triage_match",
    });
    insertedNormalizedNames.push(candidate.normalized_name);
    aliasKeySet.add(aliasKey);
    candidateProductIds.forEach((productId) => affectedProductIds.add(productId));
  }

  if (!dryRun && aliasesToInsert.length) {
    await insertRowsInChunks(supabase, CONFIG.tables.aliases, aliasesToInsert);
    insertedAliases = aliasesToInsert.length;
  }

  let reresolvedProducts = 0;
  if (!dryRun && affectedProductIds.size) {
    const productIds = [...affectedProductIds];
    reresolvedProducts = productIds.length;
    for (const productIdChunk of chunkArray(productIds, 250)) {
      await resolveAliases({
        limit: productIdChunk.length,
        "product-ids": productIdChunk.join(","),
      });
    }
  }

  const summary = {
    unresolved_candidates: unresolvedCandidates.length,
    inserted_aliases: dryRun ? aliasesToInsert.length : insertedAliases,
    created_supplements: 0,
    created_supplement_names: [],
    ignored_rows: 0,
    ignored_names: [],
    already_resolvable: alreadyResolvable,
    low_confidence: lowConfidenceCount,
    no_action: noActionCount,
    reresolved_products: dryRun ? 0 : reresolvedProducts,
    dry_run: dryRun,
    attempted_normalized_names: attemptedNormalizedNames,
    inserted_normalized_names: insertedNormalizedNames,
    source_offset: sourceOffset,
    source_rows_scanned: unresolvedCandidates.source_rows_scanned || 0,
    source_exhausted: unresolvedCandidates.source_exhausted === true,
  };
  console.log("[aliases:ai-triage] completed", JSON.stringify(summary));
  return summary;
}

async function runAiAliasTriageLoop(flags) {
  const cycles = Math.max(1, parseOptionalInteger(flags.cycles) || 100);
  const excludedNormalizedNames = new Set();
  let totalInsertedAliases = 0;
  let totalCreatedSupplements = 0;
  let totalIgnoredRows = 0;
  let totalReresolvedProducts = 0;
  let processedCandidates = 0;
  let passesRun = 0;
  let sourceOffset = 0;
  const maxSourceRows = Math.max(
    1,
    parseOptionalInteger(flags["max-source-rows"]) || 1000000
  );

  for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex += 1) {
    console.log(`[aliases:ai-triage-loop] pass ${cycleIndex + 1}/${cycles}`);
    const result = await runAiAliasTriage({
      ...flags,
      __excludeNormalizedNames: [...excludedNormalizedNames],
      __sourceOffset: sourceOffset,
      __maxSourceRows: maxSourceRows,
    });

    passesRun += 1;
    processedCandidates += result.unresolved_candidates || 0;
    totalInsertedAliases += result.inserted_aliases || 0;
    totalCreatedSupplements += result.created_supplements || 0;
    totalIgnoredRows += result.ignored_rows || 0;
    totalReresolvedProducts += result.reresolved_products || 0;

    for (const normalizedName of result.attempted_normalized_names || []) {
      if (trimString(normalizedName)) {
        excludedNormalizedNames.add(trimString(normalizedName));
      }
    }

    sourceOffset += Math.max(0, result.source_rows_scanned || 0);

    if (!(result.unresolved_candidates > 0)) {
      if (result.source_exhausted) {
        break;
      }
      continue;
    }

    if (!(result.attempted_normalized_names || []).length) {
      if (result.source_exhausted) {
        break;
      }
      continue;
    }
  }

  const summary = {
    passes_run: passesRun,
    processed_candidates: processedCandidates,
    inserted_aliases: totalInsertedAliases,
    created_supplements: totalCreatedSupplements,
    ignored_rows: totalIgnoredRows,
    reresolved_products: totalReresolvedProducts,
    excluded_candidates: excludedNormalizedNames.size,
    final_source_offset: sourceOffset,
  };
  console.log("[aliases:ai-triage-loop] completed", JSON.stringify(summary));
  return summary;
}

async function runCatalogReview(flags) {
  const limit = Math.max(1, parseOptionalInteger(flags.limit) || 100);
  const minConfidence = Math.max(
    0,
    Math.min(
      1,
      parseOptionalNumber(flags["min-confidence"]) ?? 0.85
    )
  );
  const dryRun =
    flags["dry-run"] === true ||
    parseOptionalBoolean(flags["dry-run"]) === true;
  const excludeNormalizedNames = new Set(
    (Array.isArray(flags.__excludeNormalizedNames)
      ? flags.__excludeNormalizedNames
      : String(flags.__excludeNormalizedNames || "")
          .split(",")
          .map((item) => trimString(item))
    ).filter(Boolean)
  );
  const sourceOffset = Math.max(
    0,
    parseOptionalInteger(flags.__sourceOffset) || 0
  );
  const maxSourceRows = Math.max(
    1,
    parseOptionalInteger(flags["max-source-rows"] || flags.__maxSourceRows) ||
      1000000
  );

  const supabase = createAdminClient();
  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const unresolvedCandidates = await fetchNeedsAliasReviewCandidates(supabase, {
    limitNames: limit,
    excludeNormalizedNames,
    startOffset: sourceOffset,
    maxRows: maxSourceRows,
  });

  if (!unresolvedCandidates.length) {
    console.log("[catalog:review] no unresolved active ingredients");
    return {
      unresolved_candidates: 0,
      review_rows_upserted: 0,
      create_canonical: 0,
      ignore: 0,
      manual_review: 0,
      already_resolvable: 0,
    };
  }

  const [aliasRows, supplementRows, existingReviewRows] = await Promise.all([
    fetchAliasRows(supabase),
    fetchSupplementRows(supabase),
    fetchCatalogReviewCandidateRowsByNames(
      supabase,
      unresolvedCandidates.map((candidate) => candidate.normalized_name)
    ),
  ]);
  const aliasIndex = buildAliasIndex(aliasRows);
  const supplementNameIndex = buildSupplementNameIndex(supplementRows);
  const existingReviewByName = new Map(
    (existingReviewRows || [])
      .map((row) => [
        trimString(
          row?.[CONFIG.columns.catalogReviewCandidates.normalizedName]
        ),
        row,
      ])
      .filter(([normalizedName]) => normalizedName)
  );
  const occurrenceRows = await fetchMissingSupplementOccurrenceRows(
    supabase,
    unresolvedCandidates.map((candidate) => candidate.normalized_name)
  );
  const productIdsByNormalizedName =
    buildProductIdsByNormalizedNameFromOccurrences(occurrenceRows);
  const sampleProductIds = dedupeByKey(
    unresolvedCandidates.flatMap(
      (candidate) =>
        productIdsByNormalizedName.get(candidate.normalized_name) ||
        candidate.product_ids ||
        []
    ),
    (item) => String(item)
  );
  const productsById = await fetchProductsById(supabase, sampleProductIds);
  const now = new Date().toISOString();

  const upserts = [];
  const attemptedNormalizedNames = [];
  let createCanonicalCount = 0;
  let ignoreCount = 0;
  let manualReviewCount = 0;
  let alreadyResolvable = 0;
  let lowConfidencePromoted = 0;

  for (const candidate of unresolvedCandidates) {
    const occurrenceProductIds =
      productIdsByNormalizedName.get(candidate.normalized_name) ||
      candidate.product_ids ||
      [];
    const reviewCandidate = {
      ...candidate,
      occurrence_count:
        occurrenceProductIds.length || candidate.occurrence_count || 0,
      product_ids: occurrenceProductIds,
    };
    attemptedNormalizedNames.push(reviewCandidate.normalized_name);
    const deterministicMatch =
      aliasIndex.get(reviewCandidate.normalized_name) ||
      supplementNameIndex.get(reviewCandidate.normalized_name) ||
      null;
    if (deterministicMatch?.supplement_id) {
      alreadyResolvable += 1;
      continue;
    }

    const suggestion = await requestCatalogReviewSuggestion(openAiApiKey, {
      candidate: reviewCandidate,
      productsById,
    });
    let suggestedAction = suggestion.decision;
    if (suggestion.confidence < minConfidence) {
      suggestedAction = "manual_review";
      lowConfidencePromoted += 1;
    }

    if (suggestedAction === "create_canonical") {
      createCanonicalCount += 1;
    } else if (suggestedAction === "ignore") {
      ignoreCount += 1;
    } else {
      manualReviewCount += 1;
    }

    const existingRow =
      existingReviewByName.get(reviewCandidate.normalized_name) || null;
    upserts.push({
      [CONFIG.columns.catalogReviewCandidates.normalizedName]:
        reviewCandidate.normalized_name,
      [CONFIG.columns.catalogReviewCandidates.displayName]:
        trimString(reviewCandidate.display_name) || reviewCandidate.normalized_name,
      [CONFIG.columns.catalogReviewCandidates.occurrenceCount]:
        reviewCandidate.occurrence_count || 0,
      [CONFIG.columns.catalogReviewCandidates.sampleActiveIngredientsJson]:
        (reviewCandidate.sample_rows || []).map((row) => ({
          raw_name: row.raw_name,
          canonical_name: row.canonical_name,
          dosage_original_text: row.dosage_original_text,
          chemical_form: row.chemical_form,
          product_id: row.product_id,
        })),
      [CONFIG.columns.catalogReviewCandidates.sampleProductsJson]:
        buildCandidateSampleProducts(reviewCandidate, productsById),
      [CONFIG.columns.catalogReviewCandidates.suggestedAction]:
        suggestedAction,
      [CONFIG.columns.catalogReviewCandidates.suggestedSupplementName]:
        suggestedAction === "create_canonical"
          ? normalizeWhitespace(
              trimString(suggestion.suggested_supplement_name) ||
                trimString(reviewCandidate.display_name) ||
                reviewCandidate.normalized_name
            )
          : null,
      [CONFIG.columns.catalogReviewCandidates.suggestionConfidence]:
        suggestion.confidence,
      [CONFIG.columns.catalogReviewCandidates.suggestionReason]:
        trimString(suggestion.reason) || "",
      [CONFIG.columns.catalogReviewCandidates.sourceLatestCreatedAt]:
        trimString(reviewCandidate.latest_created_at) || null,
      [CONFIG.columns.catalogReviewCandidates.reviewStatus]:
        trimString(
          existingRow?.[CONFIG.columns.catalogReviewCandidates.reviewStatus]
        ) || "pending",
      [CONFIG.columns.catalogReviewCandidates.approvedSupplementId]:
        normalizeId(
          existingRow?.[CONFIG.columns.catalogReviewCandidates.approvedSupplementId]
        ) || null,
      [CONFIG.columns.catalogReviewCandidates.approvedSupplementName]:
        trimString(
          existingRow?.[CONFIG.columns.catalogReviewCandidates.approvedSupplementName]
        ) || null,
      [CONFIG.columns.catalogReviewCandidates.reviewNotes]:
        trimString(
          existingRow?.[CONFIG.columns.catalogReviewCandidates.reviewNotes]
        ) || null,
      [CONFIG.columns.catalogReviewCandidates.createdAt]:
        trimString(existingRow?.[CONFIG.columns.catalogReviewCandidates.createdAt]) ||
        now,
      [CONFIG.columns.catalogReviewCandidates.updatedAt]: now,
      [CONFIG.columns.catalogReviewCandidates.firstSeenAt]:
        trimString(
          existingRow?.[CONFIG.columns.catalogReviewCandidates.firstSeenAt]
        ) || now,
      [CONFIG.columns.catalogReviewCandidates.lastSeenAt]: now,
    });
  }

  if (!dryRun && upserts.length) {
    await insertRowsInChunks(
      supabase,
      CONFIG.tables.catalogReviewCandidates,
      upserts
    );
  }

  const summary = {
    unresolved_candidates: unresolvedCandidates.length,
    review_rows_upserted: dryRun ? upserts.length : upserts.length,
    create_canonical: createCanonicalCount,
    ignore: ignoreCount,
    manual_review: manualReviewCount,
    already_resolvable: alreadyResolvable,
    low_confidence_promoted: lowConfidencePromoted,
    dry_run: dryRun,
    attempted_normalized_names: attemptedNormalizedNames,
    source_offset: sourceOffset,
    source_rows_scanned: unresolvedCandidates.source_rows_scanned || 0,
    source_exhausted: unresolvedCandidates.source_exhausted === true,
  };
  console.log("[catalog:review] completed", JSON.stringify(summary));
  return summary;
}

async function runCatalogReviewLoop(flags) {
  const cycles = Math.max(1, parseOptionalInteger(flags.cycles) || 100);
  const excludedNormalizedNames = new Set();
  let totalUpserts = 0;
  let totalCreateCanonical = 0;
  let totalIgnore = 0;
  let totalManualReview = 0;
  let totalAlreadyResolvable = 0;
  let totalLowConfidencePromoted = 0;
  let processedCandidates = 0;
  let passesRun = 0;
  let sourceOffset = 0;
  const maxSourceRows = Math.max(
    1,
    parseOptionalInteger(flags["max-source-rows"]) || 1000000
  );

  for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex += 1) {
    console.log(`[catalog:review-loop] pass ${cycleIndex + 1}/${cycles}`);
    const result = await runCatalogReview({
      ...flags,
      __excludeNormalizedNames: [...excludedNormalizedNames],
      __sourceOffset: sourceOffset,
      __maxSourceRows: maxSourceRows,
    });

    passesRun += 1;
    processedCandidates += result.unresolved_candidates || 0;
    totalUpserts += result.review_rows_upserted || 0;
    totalCreateCanonical += result.create_canonical || 0;
    totalIgnore += result.ignore || 0;
    totalManualReview += result.manual_review || 0;
    totalAlreadyResolvable += result.already_resolvable || 0;
    totalLowConfidencePromoted += result.low_confidence_promoted || 0;

    for (const normalizedName of result.attempted_normalized_names || []) {
      if (trimString(normalizedName)) {
        excludedNormalizedNames.add(trimString(normalizedName));
      }
    }

    sourceOffset += Math.max(0, result.source_rows_scanned || 0);

    if (!(result.unresolved_candidates > 0)) {
      if (result.source_exhausted) {
        break;
      }
      continue;
    }

    if (!(result.attempted_normalized_names || []).length) {
      if (result.source_exhausted) {
        break;
      }
      continue;
    }
  }

  const summary = {
    passes_run: passesRun,
    processed_candidates: processedCandidates,
    review_rows_upserted: totalUpserts,
    create_canonical: totalCreateCanonical,
    ignore: totalIgnore,
    manual_review: totalManualReview,
    already_resolvable: totalAlreadyResolvable,
    low_confidence_promoted: totalLowConfidencePromoted,
    excluded_candidates: excludedNormalizedNames.size,
    final_source_offset: sourceOffset,
  };
  console.log("[catalog:review-loop] completed", JSON.stringify(summary));
  return summary;
}

async function exportEvalSample(flags) {
  const randomLimit = Math.max(
    1,
    parseOptionalInteger(flags["limit-random"]) || 500
  );
  const likelyLimit = Math.max(
    1,
    parseOptionalInteger(flags["limit-likely"]) || 250
  );
  const edgeLimit = Math.max(
    1,
    parseOptionalInteger(flags["limit-edge"]) || 250
  );
  const supabase = createAdminClient();

  const randomProducts = await fetchRandomCandidateProducts(
    supabase,
    randomLimit
  );
  const likelyProducts = await fetchLikelySupplementProducts(
    supabase,
    likelyLimit
  );
  const edgeProducts = await fetchEdgeCaseProducts(supabase, edgeLimit);

  const combined = dedupeByKey(
    [
      ...randomProducts.map((row) => ({
        bucket: "random_non_obvious_food",
        ...row,
      })),
      ...likelyProducts.map((row) => ({ bucket: "likely_supplement", ...row })),
      ...edgeProducts.map((row) => ({ bucket: "edge_case", ...row })),
    ],
    (row) => String(row.product_id)
  );

  const productIds = combined.map((row) => row.product_id);
  const supContext = await buildEvaluationContext(supabase, productIds);

  const csvRows = combined.map((row) =>
    serializeEvalSampleRow(row, supContext.get(String(row.product_id)))
  );
  const header = [
    "sample_bucket",
    "product_id",
    "barcode",
    "name",
    "ingredients",
    "predicted_is_supplement",
    "predicted_confidence",
    "predicted_active_ingredients_json",
    "predicted_resolution_statuses_json",
    "expected_is_supplement",
    "expected_active_ingredients_json",
    "expected_dosages_json",
    "notes",
  ];

  const timestamp = fileSafeTimestamp();
  const outputPath = path.join(CONFIG.tmpDir, `eval-sample-${timestamp}.csv`);
  const csv = [header.join(","), ...csvRows].join("\n");
  await writeFile(outputPath, `${csv}\n`, "utf8");

  console.log("[eval:sample] path", outputPath);
  console.log("[eval:sample] rows", combined.length);
}

async function scoreEval(flags) {
  const inputPath = resolveRequiredPath(flags.input, "Missing --input");
  const supabase = createAdminClient();
  const csvText = await readFile(inputPath, "utf8");
  const rows = parseCsv(csvText);

  if (!rows.length) {
    throw new Error("The input CSV is empty.");
  }

  const labeledRows = rows.filter((row) => trimString(row.product_id));
  const productIds = labeledRows
    .map((row) => normalizeId(row.product_id))
    .filter(Boolean);
  const context = await buildEvaluationContext(supabase, productIds);
  const scored = labeledRows.map((row) =>
    scoreEvaluationRow(row, context.get(String(normalizeId(row.product_id))))
  );
  const metrics = summarizeEvaluationMetrics(scored);
  const outputPath = path.join(
    CONFIG.tmpDir,
    `eval-score-${fileSafeTimestamp()}.json`
  );

  await writeJsonFile(outputPath, {
    input_path: inputPath,
    generated_at: new Date().toISOString(),
    row_count: scored.length,
    metrics,
    rows: scored,
  });

  console.log("[eval:score] output", outputPath);
  console.log(JSON.stringify(metrics, null, 2));
}

async function collectClassificationCandidates(
  supabase,
  { passType, limit, afterProductId, startProductId, endProductId }
) {
  const candidates = [];
  let cursor = normalizeId(afterProductId) || null;

  while (candidates.length < limit) {
    const pageRows =
      startProductId || endProductId
        ? await fetchCandidateViewRowsInRange(supabase, {
            afterProductId: cursor,
            startProductId,
            endProductId,
            limit: Math.min(CONFIG.pageSize, limit - candidates.length),
          })
        : await fetchCandidateViewRows(
            supabase,
            cursor,
            Math.min(CONFIG.pageSize, limit - candidates.length)
          );
    if (!pageRows.length) {
      break;
    }

    const pageProductIds = pageRows
      .map((row) => normalizeId(row[CONFIG.columns.candidates.productId]))
      .filter(Boolean);
    cursor = pageProductIds.at(-1) || cursor;

    const [productsById, classificationRows] = await Promise.all([
      fetchProductsById(supabase, pageProductIds),
      fetchRowsForProductIds(
        supabase,
        CONFIG.tables.classification,
        pageProductIds
      ),
    ]);

    const classificationByProductId = groupRowsByProductId(
      classificationRows,
      CONFIG.columns.classification.productId
    );

    for (const productId of pageProductIds) {
      if (candidates.length >= limit) {
        break;
      }

      const product = productsById.get(String(productId));
      if (!product) {
        continue;
      }

      const reduced = reduceProductForAi(product);
      if (!reduced.name && !reduced.ingredients) {
        continue;
      }

      const contentHash = buildContentHash(reduced);
      const attempts = classificationByProductId.get(String(productId)) || [];
      const eligibility = evaluateClassificationEligibility({
        attempts,
        passType,
        model: CONFIG.models.classify[passType],
        contentHash,
      });

      if (eligibility.reviewQueue) {
        await insertReviewQueueOnce(
          supabase,
          productId,
          CONFIG.reviewTypes.retryExhausted,
          eligibility.reviewQueue
        );
      }

      if (!eligibility.eligible) {
        continue;
      }

      candidates.push({
        product_id: productId,
        barcode: reduced.barcode,
        name: reduced.name,
        ingredients: reduced.ingredients,
        content_hash: contentHash,
      });
    }
  }

  return candidates;
}

async function collectNamingCandidates(
  supabase,
  { passType, limit, afterProductId, startProductId, endProductId }
) {
  const candidates = [];
  let cursor = afterProductId || null;

  while (candidates.length < limit) {
    const classificationPageRows = await fetchNamingEligibleClassificationRows(
      supabase,
      cursor,
      Math.min(CONFIG.pageSize, Math.max(25, (limit - candidates.length) * 5)),
      startProductId,
      endProductId
    );
    if (!classificationPageRows.length) {
      break;
    }

    const pageProductIds = classificationPageRows
      .map((row) => normalizeId(row[CONFIG.columns.classification.productId]))
      .filter(Boolean);
    cursor = pageProductIds.at(-1) || cursor;

    const [productsById, namingRows] = await Promise.all([
      fetchProductsById(supabase, pageProductIds),
      fetchRowsForProductIds(supabase, CONFIG.tables.naming, pageProductIds),
    ]);

    const classificationByProductId = groupRowsByProductId(
      classificationPageRows,
      CONFIG.columns.classification.productId
    );
    const namingByProductId = groupRowsByProductId(
      namingRows,
      CONFIG.columns.naming.productId
    );

    for (const productId of pageProductIds) {
      if (candidates.length >= limit) {
        break;
      }

      const product = productsById.get(String(productId));
      if (!product) {
        continue;
      }

      const reduced = reduceProductForAi(product);
      if (!reduced.name && !reduced.ingredients) {
        continue;
      }

      const contentHash = buildContentHash(reduced);
      const classificationAttempts =
        classificationByProductId.get(String(productId)) || [];
      const namingAttempts = namingByProductId.get(String(productId)) || [];
      const eligibility = evaluateNamingEligibility({
        classificationAttempts,
        namingAttempts,
        passType,
        model: CONFIG.models.naming[passType],
        contentHash,
      });

      if (eligibility.reviewQueue) {
        await insertReviewQueueOnce(
          supabase,
          productId,
          CONFIG.reviewTypes.retryExhausted,
          eligibility.reviewQueue
        );
      }

      if (!eligibility.eligible) {
        continue;
      }

      candidates.push({
        product_id: productId,
        barcode: reduced.barcode,
        name: reduced.name,
        ingredients: reduced.ingredients,
        content_hash: contentHash,
      });
    }
  }

  return candidates;
}

async function collectExtractionCandidates(
  supabase,
  { passType, limit, afterProductId, startProductId, endProductId }
) {
  const candidates = [];
  let cursor = afterProductId || null;

  while (candidates.length < limit) {
    const classificationPageRows = await fetchExtractionEligibleClassificationRows(
      supabase,
      cursor,
      Math.min(CONFIG.pageSize, Math.max(25, (limit - candidates.length) * 5)),
      startProductId,
      endProductId
    );
    if (!classificationPageRows.length) {
      break;
    }

    const pageProductIds = classificationPageRows
      .map((row) => normalizeId(row[CONFIG.columns.classification.productId]))
      .filter(Boolean);
    cursor = pageProductIds.at(-1) || cursor;

    const [productsById, extractionRows] =
      await Promise.all([
        fetchProductsById(supabase, pageProductIds),
        fetchRowsForProductIds(
          supabase,
          CONFIG.tables.extraction,
          pageProductIds
        ),
      ]);

    const classificationByProductId = groupRowsByProductId(
      classificationPageRows,
      CONFIG.columns.classification.productId
    );
    const extractionByProductId = groupRowsByProductId(
      extractionRows,
      CONFIG.columns.extraction.productId
    );

    for (const productId of pageProductIds) {
      if (candidates.length >= limit) {
        break;
      }

      const product = productsById.get(String(productId));
      if (!product) {
        continue;
      }

      const reduced = reduceProductForAi(product);
      if (!reduced.name && !reduced.ingredients) {
        continue;
      }

      const contentHash = buildContentHash(reduced);
      const classificationAttempts =
        classificationByProductId.get(String(productId)) || [];
      const extractionAttempts =
        extractionByProductId.get(String(productId)) || [];
      const eligibility = evaluateExtractionEligibility({
        classificationAttempts,
        extractionAttempts,
        passType,
        model: CONFIG.models.extract[passType],
        contentHash,
      });

      if (eligibility.reviewQueue) {
        await insertReviewQueueOnce(
          supabase,
          productId,
          CONFIG.reviewTypes.retryExhausted,
          eligibility.reviewQueue
        );
      }

      if (!eligibility.eligible) {
        continue;
      }

      candidates.push({
        product_id: productId,
        barcode: reduced.barcode,
        name: reduced.name,
        ingredients: reduced.ingredients,
        content_hash: contentHash,
      });
    }
  }

  return candidates;
}

async function fetchNamingEligibleClassificationRows(
  supabase,
  afterProductId,
  limit = CONFIG.pageSize,
  startProductId = null,
  endProductId = null
) {
  const selectColumns = [
    CONFIG.columns.classification.productId,
    CONFIG.columns.classification.contentHash,
    CONFIG.columns.classification.model,
    CONFIG.columns.classification.promptVersion,
    CONFIG.columns.classification.batchId,
    CONFIG.columns.classification.rawResponse,
    CONFIG.columns.classification.isSupplement,
    CONFIG.columns.classification.confidence,
    CONFIG.columns.classification.category,
    CONFIG.columns.classification.shouldExtract,
    CONFIG.columns.classification.reason,
    CONFIG.columns.classification.processedAt,
  ];

  let data;
  let error;

  try {
    let query = supabase
      .from(CONFIG.tables.classification)
      .select(selectColumns.join(", "))
      .eq(
        CONFIG.columns.classification.promptVersion,
        CONFIG.classifyPromptVersion
      )
      .eq(CONFIG.columns.classification.isSupplement, true)
      .gte(
        CONFIG.columns.classification.confidence,
        CONFIG.thresholds.extract
      )
      .order(CONFIG.columns.classification.productId, { ascending: true })
      .limit(Math.max(1, limit));

    if (startProductId) {
      query = query.gte(CONFIG.columns.classification.productId, startProductId);
    }
    if (endProductId) {
      query = query.lte(CONFIG.columns.classification.productId, endProductId);
    }

    const result = afterProductId
      ? await query.gt(CONFIG.columns.classification.productId, afterProductId)
      : await query;
    data = result.data;
    error = result.error;
  } catch (fetchError) {
    throw new Error(
      `[supabase:${CONFIG.tables.classification}] ${formatFetchFailure(fetchError)}`
    );
  }

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.classification}] ${error.message}`);
  }

  return (data || []).filter((row) => getPipelineStatus(row) === "succeeded");
}

async function fetchExtractionEligibleClassificationRows(
  supabase,
  afterProductId,
  limit = CONFIG.pageSize,
  startProductId = null,
  endProductId = null
) {
  const selectColumns = [
    CONFIG.columns.classification.productId,
    CONFIG.columns.classification.contentHash,
    CONFIG.columns.classification.model,
    CONFIG.columns.classification.promptVersion,
    CONFIG.columns.classification.batchId,
    CONFIG.columns.classification.rawResponse,
    CONFIG.columns.classification.isSupplement,
    CONFIG.columns.classification.confidence,
    CONFIG.columns.classification.category,
    CONFIG.columns.classification.shouldExtract,
    CONFIG.columns.classification.reason,
    CONFIG.columns.classification.processedAt,
  ];

  let data;
  let error;

  try {
    let query = supabase
      .from(CONFIG.tables.classification)
      .select(selectColumns.join(", "))
      .eq(
        CONFIG.columns.classification.promptVersion,
        CONFIG.classifyPromptVersion
      )
      .eq(CONFIG.columns.classification.isSupplement, true)
      .eq(CONFIG.columns.classification.shouldExtract, true)
      .gte(
        CONFIG.columns.classification.confidence,
        CONFIG.thresholds.extract
      )
      .order(CONFIG.columns.classification.productId, { ascending: true })
      .limit(Math.max(1, limit));

    if (startProductId) {
      query = query.gte(CONFIG.columns.classification.productId, startProductId);
    }
    if (endProductId) {
      query = query.lte(CONFIG.columns.classification.productId, endProductId);
    }

    const result = afterProductId
      ? await query.gt(CONFIG.columns.classification.productId, afterProductId)
      : await query;
    data = result.data;
    error = result.error;
  } catch (fetchError) {
    throw new Error(
      `[supabase:${CONFIG.tables.classification}] ${formatFetchFailure(fetchError)}`
    );
  }

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.classification}] ${error.message}`);
  }

  return (data || []).filter((row) => getPipelineStatus(row) === "succeeded");
}

function evaluateClassificationEligibility({
  attempts,
  passType,
  model,
  contentHash,
}) {
  const relevantAttempts = attempts.filter(
    (row) =>
      trimString(row[CONFIG.columns.classification.promptVersion]) ===
        CONFIG.classifyPromptVersion &&
      trimString(row[CONFIG.columns.classification.contentHash]) === contentHash
  );
  const passAttempts = relevantAttempts.filter(
    (row) => getPipelinePassType(row) === passType
  );
  const hasSuccessfulPass = passAttempts.some(
    (row) =>
      getPipelineStatus(row) === "succeeded" &&
      trimString(row[CONFIG.columns.classification.model]) === model
  );

  if (hasSuccessfulPass) {
    return { eligible: false };
  }

  if (passAttempts.length >= CONFIG.maxRetries) {
    return {
      eligible: false,
      reviewQueue: {
        stage: "classification",
        pass_type: passType,
        content_hash: contentHash,
        attempts: passAttempts.length,
      },
    };
  }

  if (passType === "mini_fallback") {
    const latestNano = getLatestSuccessfulRow(
      relevantAttempts.filter(
        (row) => getPipelinePassType(row) === "nano_primary"
      ),
      CONFIG.columns.classification.processedAt
    );

    if (!latestNano) {
      return { eligible: false };
    }

    if (getDownstreamAction(latestNano) !== "mini_fallback") {
      return { eligible: false };
    }
  }

  return { eligible: true };
}

function evaluateExtractionEligibility({
  classificationAttempts,
  extractionAttempts,
  passType,
  model,
  contentHash,
}) {
  const relevantClassifications = classificationAttempts.filter(
    (row) =>
      trimString(row[CONFIG.columns.classification.promptVersion]) ===
        CONFIG.classifyPromptVersion &&
      getPipelineStatus(row) === "succeeded" &&
      trimString(row[CONFIG.columns.classification.contentHash]) === contentHash
  );
  const finalClassification = getLatestSuccessfulRow(
    relevantClassifications,
    CONFIG.columns.classification.processedAt
  );

  if (
    !finalClassification ||
    getDownstreamAction(finalClassification) !== "extract"
  ) {
    return { eligible: false };
  }

  const relevantExtractions = extractionAttempts.filter(
    (row) =>
      trimString(row[CONFIG.columns.extraction.promptVersion]) ===
        CONFIG.extractPromptVersion &&
      trimString(row[CONFIG.columns.extraction.contentHash]) === contentHash
  );
  const passAttempts = relevantExtractions.filter(
    (row) => getPipelinePassType(row) === passType
  );

  if (
    passAttempts.some(
      (row) =>
        trimString(row[CONFIG.columns.extraction.status]) === "succeeded" &&
        trimString(row[CONFIG.columns.extraction.model]) === model
    )
  ) {
    return { eligible: false };
  }

  if (passAttempts.length >= CONFIG.maxRetries) {
    return {
      eligible: false,
      reviewQueue: {
        stage: "extraction",
        pass_type: passType,
        content_hash: contentHash,
        attempts: passAttempts.length,
      },
    };
  }

  if (passType === "mini_fallback") {
    const latestNano = getLatestRow(
      relevantExtractions.filter(
        (row) => getPipelinePassType(row) === "nano_primary"
      ),
      CONFIG.columns.extraction.processedAt
    );

    if (!latestNano) {
      return { eligible: false };
    }

    const latestStatus = getPipelineStatus(latestNano);
    const needsFallback = Boolean(
      getPipelineFlag(latestNano, "needs_fallback")
    );

    if (
      !(
        needsFallback ||
        latestStatus === "validation_failed" ||
        latestStatus === "parse_failed" ||
        latestStatus === "batch_failed" ||
        latestStatus === "ingest_failed"
      )
    ) {
      return { eligible: false };
    }
  }

  return { eligible: true };
}

function evaluateNamingEligibility({
  classificationAttempts,
  namingAttempts,
  passType,
  model,
  contentHash,
}) {
  const relevantClassifications = classificationAttempts.filter(
    (row) =>
      trimString(row[CONFIG.columns.classification.promptVersion]) ===
        CONFIG.classifyPromptVersion &&
      getPipelineStatus(row) === "succeeded" &&
      trimString(row[CONFIG.columns.classification.contentHash]) === contentHash
  );
  const finalClassification = getLatestSuccessfulRow(
    relevantClassifications,
    CONFIG.columns.classification.processedAt
  );

  if (
    !finalClassification ||
    finalClassification[CONFIG.columns.classification.isSupplement] !== true ||
    Number(finalClassification[CONFIG.columns.classification.confidence] ?? 0) <
      CONFIG.thresholds.extract
  ) {
    return { eligible: false };
  }

  const relevantNamingRows = namingAttempts.filter(
    (row) =>
      trimString(row[CONFIG.columns.naming.promptVersion]) ===
        CONFIG.namingPromptVersion &&
      trimString(row[CONFIG.columns.naming.contentHash]) === contentHash
  );
  const passAttempts = relevantNamingRows.filter(
    (row) => getPipelinePassType(row) === passType
  );

  if (
    passAttempts.some(
      (row) =>
        getPipelineStatus(row) === "succeeded" &&
        trimString(row[CONFIG.columns.naming.model]) === model
    )
  ) {
    return { eligible: false };
  }

  if (passAttempts.length >= CONFIG.maxRetries) {
    return {
      eligible: false,
      reviewQueue: {
        stage: "naming",
        pass_type: passType,
        content_hash: contentHash,
        attempts: passAttempts.length,
      },
    };
  }

  if (passType === "mini_fallback") {
    const latestNano = getLatestRow(
      relevantNamingRows.filter(
        (row) => getPipelinePassType(row) === "nano_primary"
      ),
      CONFIG.columns.naming.processedAt
    );

    if (!latestNano) {
      return { eligible: false };
    }

    const latestStatus = getPipelineStatus(latestNano);
    const latestConfidence = Number(
      latestNano?.[CONFIG.columns.naming.confidence] ?? NaN
    );

    if (
      latestStatus === "succeeded" &&
      Number.isFinite(latestConfidence) &&
      latestConfidence >= CONFIG.thresholds.namingMiniFallback
    ) {
      return { eligible: false };
    }
  }

  return { eligible: true };
}

function buildClassificationInsertFromBatchLine({
  line,
  batch,
  forceStatus = "",
  productsById = new Map(),
}) {
  const parsedRef = parseCustomId(trimString(line.custom_id));
  const product = productsById.get(String(parsedRef.productId)) || null;
  const baseRaw = {
    custom_id: trimString(line.custom_id),
    pass_type: trimString(batch.metadata?.pass_type) || parsedRef.passType,
    input_file_id: batch.input_file_id || null,
    output_file_id: batch.output_file_id || batch.error_file_id || null,
    response: line.response || null,
    error: line.error || null,
  };
  const base = {
    [CONFIG.columns.classification.productId]: parsedRef.productId,
    [CONFIG.columns.classification.barcode]:
      normalizeBarcode(product?.[CONFIG.columns.products.barcode]) || null,
    [CONFIG.columns.classification.name]:
      normalizeWhitespace(product?.[CONFIG.columns.products.name] || "") || null,
    [CONFIG.columns.classification.ingredients]:
      normalizeWhitespace(
        product?.[CONFIG.columns.products.ingredients] || ""
      ) || null,
    [CONFIG.columns.classification.contentHash]: parsedRef.contentHash,
    [CONFIG.columns.classification.model]:
      trimString(batch.metadata?.model) ||
      trimString(line.response?.body?.model),
    [CONFIG.columns.classification.promptVersion]:
      trimString(batch.metadata?.prompt_version) ||
      CONFIG.classifyPromptVersion,
    [CONFIG.columns.classification.batchId]: batch.id,
    [CONFIG.columns.classification.processedAt]: new Date().toISOString(),
  };

  if (forceStatus) {
    return {
      ...base,
      [CONFIG.columns.classification.isSupplement]: null,
      [CONFIG.columns.classification.confidence]: null,
      [CONFIG.columns.classification.category]: null,
      [CONFIG.columns.classification.shouldExtract]: null,
      [CONFIG.columns.classification.reason]: null,
      [CONFIG.columns.classification.rawResponse]: {
        ...baseRaw,
        status: forceStatus,
        error_message: extractErrorMessage(line) || "Batch error file entry",
        parsed_output: null,
        downstream_action: null,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  if (Number(line.response?.status_code) !== 200) {
    return {
      ...base,
      [CONFIG.columns.classification.isSupplement]: null,
      [CONFIG.columns.classification.confidence]: null,
      [CONFIG.columns.classification.category]: null,
      [CONFIG.columns.classification.shouldExtract]: null,
      [CONFIG.columns.classification.reason]: null,
      [CONFIG.columns.classification.rawResponse]: {
        ...baseRaw,
        status: "batch_failed",
        error_message:
          extractErrorMessage(line) ||
          `OpenAI status ${line.response?.status_code}`,
        parsed_output: null,
        downstream_action: null,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  const rawContent = extractCompletionContent(
    line.response?.body?.choices?.[0]?.message?.content
  );
  if (!rawContent) {
    return {
      ...base,
      [CONFIG.columns.classification.isSupplement]: null,
      [CONFIG.columns.classification.confidence]: null,
      [CONFIG.columns.classification.category]: null,
      [CONFIG.columns.classification.shouldExtract]: null,
      [CONFIG.columns.classification.reason]: null,
      [CONFIG.columns.classification.rawResponse]: {
        ...baseRaw,
        status: "parse_failed",
        error_message: "OpenAI returned empty content",
        parsed_output: null,
        downstream_action: null,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      ...base,
      [CONFIG.columns.classification.isSupplement]: null,
      [CONFIG.columns.classification.confidence]: null,
      [CONFIG.columns.classification.category]: null,
      [CONFIG.columns.classification.shouldExtract]: null,
      [CONFIG.columns.classification.reason]: null,
      [CONFIG.columns.classification.rawResponse]: {
        ...baseRaw,
        status: "parse_failed",
        error_message: rawContent.slice(0, 500),
        parsed_output: null,
        downstream_action: null,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  const normalized = normalizeClassificationOutput(parsed);
  const downstreamAction = deriveClassificationAction(normalized);

  return {
    ...base,
    [CONFIG.columns.classification.isSupplement]: normalized.is_supplement,
    [CONFIG.columns.classification.confidence]: normalized.confidence,
    [CONFIG.columns.classification.category]: normalized.category,
    [CONFIG.columns.classification.shouldExtract]: normalized.should_extract,
    [CONFIG.columns.classification.reason]: normalized.reason,
    [CONFIG.columns.classification.rawResponse]: {
      ...baseRaw,
      status: "succeeded",
      error_message: null,
      parsed_output: normalized,
      downstream_action: downstreamAction,
      usage: attachUsageModel(
        line.response?.body?.usage || null,
        trimString(batch.metadata?.model) ||
          trimString(line.response?.body?.model)
      ),
    },
  };
}

function buildNamingInsertFromBatchLine({ line, batch, forceStatus = "" }) {
  const parsedRef = parseCustomId(trimString(line.custom_id));
  const baseRaw = {
    custom_id: trimString(line.custom_id),
    pass_type: trimString(batch.metadata?.pass_type) || parsedRef.passType,
    input_file_id: batch.input_file_id || null,
    output_file_id: batch.output_file_id || batch.error_file_id || null,
    response: line.response || null,
    error: line.error || null,
  };
  const base = {
    [CONFIG.columns.naming.productId]: parsedRef.productId,
    [CONFIG.columns.naming.contentHash]: parsedRef.contentHash,
    [CONFIG.columns.naming.model]:
      trimString(batch.metadata?.model) ||
      trimString(line.response?.body?.model),
    [CONFIG.columns.naming.promptVersion]:
      trimString(batch.metadata?.prompt_version) || CONFIG.namingPromptVersion,
    [CONFIG.columns.naming.batchId]: batch.id,
    [CONFIG.columns.naming.processedAt]: new Date().toISOString(),
  };

  if (forceStatus) {
    return {
      ...base,
      [CONFIG.columns.naming.displayName]: null,
      [CONFIG.columns.naming.brandName]: null,
      [CONFIG.columns.naming.productType]: null,
      [CONFIG.columns.naming.formFactor]: null,
      [CONFIG.columns.naming.flavor]: null,
      [CONFIG.columns.naming.confidence]: null,
      [CONFIG.columns.naming.notes]: null,
      [CONFIG.columns.naming.rawResponse]: {
        ...baseRaw,
        status: forceStatus,
        error_message: extractErrorMessage(line) || "Batch error file entry",
        parsed_output: null,
        validation_errors: ["batch_error"],
        needs_fallback: true,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  if (Number(line.response?.status_code) !== 200) {
    return {
      ...base,
      [CONFIG.columns.naming.displayName]: null,
      [CONFIG.columns.naming.brandName]: null,
      [CONFIG.columns.naming.productType]: null,
      [CONFIG.columns.naming.formFactor]: null,
      [CONFIG.columns.naming.flavor]: null,
      [CONFIG.columns.naming.confidence]: null,
      [CONFIG.columns.naming.notes]: null,
      [CONFIG.columns.naming.rawResponse]: {
        ...baseRaw,
        status: "batch_failed",
        error_message:
          extractErrorMessage(line) ||
          `OpenAI status ${line.response?.status_code}`,
        parsed_output: null,
        validation_errors: ["batch_error"],
        needs_fallback: true,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  const rawContent = extractCompletionContent(
    line.response?.body?.choices?.[0]?.message?.content
  );
  if (!rawContent) {
    return {
      ...base,
      [CONFIG.columns.naming.displayName]: null,
      [CONFIG.columns.naming.brandName]: null,
      [CONFIG.columns.naming.productType]: null,
      [CONFIG.columns.naming.formFactor]: null,
      [CONFIG.columns.naming.flavor]: null,
      [CONFIG.columns.naming.confidence]: null,
      [CONFIG.columns.naming.notes]: null,
      [CONFIG.columns.naming.rawResponse]: {
        ...baseRaw,
        status: "parse_failed",
        error_message: "OpenAI returned empty content",
        parsed_output: null,
        validation_errors: ["empty_content"],
        needs_fallback: true,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      ...base,
      [CONFIG.columns.naming.displayName]: null,
      [CONFIG.columns.naming.brandName]: null,
      [CONFIG.columns.naming.productType]: null,
      [CONFIG.columns.naming.formFactor]: null,
      [CONFIG.columns.naming.flavor]: null,
      [CONFIG.columns.naming.confidence]: null,
      [CONFIG.columns.naming.notes]: null,
      [CONFIG.columns.naming.rawResponse]: {
        ...baseRaw,
        status: "parse_failed",
        error_message: rawContent.slice(0, 500),
        parsed_output: null,
        validation_errors: ["json_parse_failed"],
        needs_fallback: true,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  const normalized = normalizeNamingOutput(parsed);
  const evaluation = evaluateNamingOutput(normalized);

  return {
    ...base,
    [CONFIG.columns.naming.displayName]: evaluation.data.display_name,
    [CONFIG.columns.naming.brandName]: evaluation.data.brand_name,
    [CONFIG.columns.naming.productType]: evaluation.data.product_type,
    [CONFIG.columns.naming.formFactor]: evaluation.data.form_factor,
    [CONFIG.columns.naming.flavor]: evaluation.data.flavor,
    [CONFIG.columns.naming.confidence]: evaluation.data.confidence,
    [CONFIG.columns.naming.notes]: evaluation.data.notes,
    [CONFIG.columns.naming.rawResponse]: {
      ...baseRaw,
      status: evaluation.status,
      error_message:
        evaluation.status === "validation_failed"
          ? evaluation.validation_errors.join("; ")
          : null,
      parsed_output: evaluation.data,
      validation_errors: evaluation.validation_errors,
      needs_fallback:
        evaluation.status !== "succeeded" ||
        Number(evaluation.data.confidence ?? 0) <
          CONFIG.thresholds.namingMiniFallback,
      usage: attachUsageModel(
        line.response?.body?.usage || null,
        trimString(batch.metadata?.model) ||
          trimString(line.response?.body?.model)
      ),
    },
  };
}

function buildExtractionInsertFromBatchLine({ line, batch, forceStatus = "" }) {
  const parsedRef = parseCustomId(trimString(line.custom_id));
  const baseRaw = {
    custom_id: trimString(line.custom_id),
    pass_type: trimString(batch.metadata?.pass_type) || parsedRef.passType,
    input_file_id: batch.input_file_id || null,
    output_file_id: batch.output_file_id || batch.error_file_id || null,
    response: line.response || null,
    error: line.error || null,
  };
  const base = {
    [CONFIG.columns.extraction.productId]: parsedRef.productId,
    [CONFIG.columns.extraction.contentHash]: parsedRef.contentHash,
    [CONFIG.columns.extraction.model]:
      trimString(batch.metadata?.model) ||
      trimString(line.response?.body?.model),
    [CONFIG.columns.extraction.promptVersion]:
      trimString(batch.metadata?.prompt_version) || CONFIG.extractPromptVersion,
    [CONFIG.columns.extraction.batchId]: batch.id,
    [CONFIG.columns.extraction.processedAt]: new Date().toISOString(),
  };

  if (forceStatus) {
    return {
      ...base,
      [CONFIG.columns.extraction.status]: forceStatus,
      [CONFIG.columns.extraction.servingSizeText]: null,
      [CONFIG.columns.extraction.notes]: null,
      [CONFIG.columns.extraction.rawResponse]: {
        ...baseRaw,
        status: forceStatus,
        error_message: extractErrorMessage(line) || "Batch error file entry",
        parsed_output: null,
        validation_errors: ["batch_error"],
        needs_fallback: true,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  if (Number(line.response?.status_code) !== 200) {
    return {
      ...base,
      [CONFIG.columns.extraction.status]: "batch_failed",
      [CONFIG.columns.extraction.servingSizeText]: null,
      [CONFIG.columns.extraction.notes]: null,
      [CONFIG.columns.extraction.rawResponse]: {
        ...baseRaw,
        status: "batch_failed",
        error_message:
          extractErrorMessage(line) ||
          `OpenAI status ${line.response?.status_code}`,
        parsed_output: null,
        validation_errors: ["batch_error"],
        needs_fallback: true,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  const rawContent = extractCompletionContent(
    line.response?.body?.choices?.[0]?.message?.content
  );
  if (!rawContent) {
    return {
      ...base,
      [CONFIG.columns.extraction.status]: "parse_failed",
      [CONFIG.columns.extraction.servingSizeText]: null,
      [CONFIG.columns.extraction.notes]: null,
      [CONFIG.columns.extraction.rawResponse]: {
        ...baseRaw,
        status: "parse_failed",
        error_message: "OpenAI returned empty content",
        parsed_output: null,
        validation_errors: ["empty_content"],
        needs_fallback: true,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return {
      ...base,
      [CONFIG.columns.extraction.status]: "parse_failed",
      [CONFIG.columns.extraction.servingSizeText]: null,
      [CONFIG.columns.extraction.notes]: null,
      [CONFIG.columns.extraction.rawResponse]: {
        ...baseRaw,
        status: "parse_failed",
        error_message: rawContent.slice(0, 500),
        parsed_output: null,
        validation_errors: ["json_parse_failed"],
        needs_fallback: true,
        usage: attachUsageModel(
          line.response?.body?.usage || null,
          trimString(batch.metadata?.model) ||
            trimString(line.response?.body?.model)
        ),
      },
    };
  }

  const normalized = normalizeExtractionOutput(parsed);
  const evaluation = evaluateExtractionOutput(normalized);
  const activeCount = evaluation.data.ingredients_found.filter(
    (item) => item.ingredient_type === "active"
  ).length;

  return {
    ...base,
    [CONFIG.columns.extraction.status]: evaluation.status,
    [CONFIG.columns.extraction.servingSizeText]:
      evaluation.data.serving_size_text,
    [CONFIG.columns.extraction.notes]: evaluation.data.notes,
    [CONFIG.columns.extraction.rawResponse]: {
      ...baseRaw,
      status: evaluation.status,
      error_message: evaluation.status === "validation_failed"
        ? evaluation.validation_errors.join("; ")
        : null,
      parsed_output: evaluation.data,
      active_ingredient_count: activeCount,
      validation_errors: evaluation.validation_errors,
      recovery_action: evaluation.recovery_action,
      needs_fallback: evaluation.needs_fallback,
      usage: attachUsageModel(
        line.response?.body?.usage || null,
        trimString(batch.metadata?.model) ||
          trimString(line.response?.body?.model)
      ),
    },
  };
}

async function enqueueClassificationReviewRows(supabase, inserts) {
  for (const row of inserts) {
    if (
      getPipelineStatus(row) !== "succeeded" ||
      getPipelinePassType(row) !== "mini_fallback"
    ) {
      continue;
    }

    const confidence = Number(
      row[CONFIG.columns.classification.confidence] ?? NaN
    );
    if (
      Number.isFinite(confidence) &&
      confidence >= CONFIG.thresholds.extract
    ) {
      continue;
    }

    await insertReviewQueueOnce(
      supabase,
      row[CONFIG.columns.classification.productId],
      CONFIG.reviewTypes.classificationLowConfidence,
      {
        custom_id: getPipelineCustomId(row),
        confidence: row[CONFIG.columns.classification.confidence],
        parsed_output: getParsedOutput(row),
      }
    );
  }
}

async function enqueueExtractionReviewRows(supabase, inserts) {
  for (const row of inserts) {
    const status = trimString(row[CONFIG.columns.extraction.status]);
    const passType = getPipelinePassType(row);
    const productId = row[CONFIG.columns.extraction.productId];
    const validationErrors = getValidationErrors(row);

    if (status === "validation_failed" && passType === "mini_fallback") {
      const reviewType = validationErrors.includes("dosage_malformed")
        ? CONFIG.reviewTypes.dosageMalformed
        : CONFIG.reviewTypes.extractionFailed;
      await insertReviewQueueOnce(supabase, productId, reviewType, {
        custom_id: getPipelineCustomId(row),
        validation_errors: validationErrors,
        parsed_output: getParsedOutput(row),
      });
    }

    if (status === "parse_failed" || status === "batch_failed") {
      await insertReviewQueueOnce(
        supabase,
        productId,
        CONFIG.reviewTypes.extractionFailed,
        {
          custom_id: getPipelineCustomId(row),
          status,
          error_message: getPipelineError(row),
        }
      );
    }
  }
}

async function waitForBatch(openAiApiKey, batchId) {
  const startedAt = Date.now();
  let lastStatus = "";

  while (true) {
    let batch;
    let status = "";

    try {
      batch = await fetchOpenAiBatch(openAiApiKey, batchId);
      status = trimString(batch.status);
      if (status) {
        lastStatus = status;
      }
    } catch (error) {
      if (!isUnreadableOpenAiBatchError(error)) {
        throw error;
      }

      if (
        Number.isFinite(CONFIG.maxPollMs) &&
        CONFIG.maxPollMs > 0 &&
        Date.now() - startedAt > CONFIG.maxPollMs
      ) {
        throw new BatchWaitTimeoutError(
          batchId,
          lastStatus || "read_unavailable",
          CONFIG.maxPollMs
        );
      }

      console.log(
        "[batch] waiting",
        batchId,
        lastStatus
          ? `${lastStatus} (read temporarily unavailable)`
          : "read temporarily unavailable"
      );
      await sleep(CONFIG.pollMs);
      continue;
    }

    if (TERMINAL_BATCH_STATUSES.has(status)) {
      return batch;
    }

    if (
      Number.isFinite(CONFIG.maxPollMs) &&
      CONFIG.maxPollMs > 0 &&
      Date.now() - startedAt > CONFIG.maxPollMs
    ) {
      throw new BatchWaitTimeoutError(
        batchId,
        status,
        CONFIG.maxPollMs
      );
    }

    console.log("[batch] waiting", batchId, status || "(unknown)");
    await sleep(CONFIG.pollMs);
  }
}

function assertBatchReadyForIngestion(batch, batchId) {
  const status = trimString(batch?.status);
  if (!SUCCESSFUL_BATCH_STATUSES.has(status)) {
    throw new Error(
      `[batch:${batchId}] terminal status ${status || "unknown"} is not ingestable`
    );
  }

  if (!batch?.output_file_id && !batch?.error_file_id) {
    throw new Error(
      `[batch:${batchId}] completed without output or error artifacts`
    );
  }
}

async function downloadBatchArtifacts(openAiApiKey, batch) {
  const batchDir = path.join(CONFIG.tmpDir, batch.id);
  await ensureDir(batchDir);

  let outputFilePath = null;
  let errorFilePath = null;

  if (batch.output_file_id) {
    outputFilePath = path.join(batchDir, "output.jsonl");
    await downloadOpenAiFile(
      openAiApiKey,
      batch.output_file_id,
      outputFilePath
    );
  }

  if (batch.error_file_id) {
    errorFilePath = path.join(batchDir, "error.jsonl");
    await downloadOpenAiFile(openAiApiKey, batch.error_file_id, errorFilePath);
  }

  return { outputFilePath, errorFilePath };
}

async function uploadBatchInputFile(openAiApiKey, inputPath) {
  const body = new FormData();
  const fileBuffer = await readFile(inputPath);

  body.append("purpose", "batch");
  body.append(
    "file",
    new Blob([fileBuffer], { type: "application/jsonl" }),
    path.basename(inputPath)
  );

  const response = await openAiFetchWithRetry("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`[files] ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function createOpenAiBatch(openAiApiKey, { inputFileId, metadata }) {
  const response = await openAiFetchWithRetry("https://api.openai.com/v1/batches", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input_file_id: inputFileId,
      endpoint: "/v1/chat/completions",
      completion_window: CONFIG.completionWindow,
      metadata,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`[batches] ${response.status} ${errorText}`);
    if (isOpenAiEnqueuedTokenLimitError(errorText)) {
      error.code = "openai_enqueued_token_limit";
    }
    throw error;
  }

  return response.json();
}

async function fetchOpenAiBatch(openAiApiKey, batchId) {
  const response = await openAiFetchWithRetry(`https://api.openai.com/v1/batches/${batchId}`, {
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `[batch:${batchId}] ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

async function downloadOpenAiFile(openAiApiKey, fileId, outputPath) {
  const response = await openAiFetchWithRetry(
    `https://api.openai.com/v1/files/${fileId}/content`,
    {
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `[file:${fileId}] ${response.status} ${await response.text()}`
    );
  }

  const text = await response.text();
  await writeFile(outputPath, text, "utf8");
}

async function writeBatchArtifacts({
  stage,
  passType,
  model,
  promptVersion,
  items,
}) {
  const timestamp = fileSafeTimestamp();
  const prefix = `${stage}-${passType}-${timestamp}-${nextArtifactSequence()}`;
  const jsonlPath = path.join(CONFIG.tmpDir, `${prefix}.jsonl`);
  const manifestPath = path.join(CONFIG.tmpDir, `${prefix}.manifest.json`);
  const jsonlText = `${items
    .map((item) => JSON.stringify(item.request))
    .join("\n")}\n`;

  await writeFile(jsonlPath, jsonlText, "utf8");

  const manifest = {
    stage,
    pass_type: passType,
    model,
    prompt_version: promptVersion,
    row_count: items.length,
    start_product_id: items[0]?.product_id || null,
    end_product_id: items.at(-1)?.product_id || null,
    file_path: jsonlPath,
    jsonl_path: jsonlPath,
    manifest_path: manifestPath,
    created_at: new Date().toISOString(),
    content_hashes: items.map((item) => item.content_hash),
    items: items.map((item) => ({
      product_id: item.product_id,
      custom_id: item.custom_id,
      content_hash: item.content_hash,
      barcode: item.barcode,
      name: item.name,
    })),
  };

  await writeJsonFile(manifestPath, manifest);
  return manifest;
}

async function recordPipelineJobFailureArtifact({ job, stage, error }) {
  const manifestPath = trimString(job?.manifest_path);
  if (!manifestPath || !(await pathExists(manifestPath))) {
    return;
  }

  let manifest;
  try {
    manifest = await readJsonFile(manifestPath);
  } catch {
    return;
  }

  const errorMessage =
    trimString(error?.message) ||
    trimString(error) ||
    "Unknown pipeline job failure";
  const failureRecord = {
    occurred_at: new Date().toISOString(),
    stage: trimString(stage),
    run_id: trimString(job?.run_id) || null,
    wave_index: parseOptionalInteger(job?.wave_index) || 0,
    job_index: parseOptionalInteger(job?.job_index) || 0,
    status: trimString(job?.status) || null,
    batch_id: trimString(job?.batch_id) || null,
    retry_count: parseOptionalInteger(job?.retry_count) || 0,
    error_message: errorMessage,
  };
  const failureHistory = Array.isArray(manifest?.pipeline_failures)
    ? manifest.pipeline_failures
    : [];

  await writeJsonFile(manifestPath, {
    ...manifest,
    last_pipeline_failure: failureRecord,
    pipeline_failures: [...failureHistory, failureRecord].slice(-10),
  });
}

async function fetchCandidateViewRows(supabase, afterProductId, limit = CONFIG.pageSize) {
  const productIdColumn = CONFIG.columns.candidates.productId;
  let data;
  let error;

  try {
    const query = supabase
      .from(CONFIG.tables.candidates)
      .select(productIdColumn)
      .order(productIdColumn, { ascending: true })
      .limit(Math.max(1, limit));

    const result = afterProductId
      ? await query.gt(productIdColumn, afterProductId)
      : await query;
    data = result.data;
    error = result.error;
  } catch (fetchError) {
    throw new Error(
      `[supabase:candidates] ${formatFetchFailure(fetchError)}`
    );
  }

  if (error) {
    throw new Error(`[supabase:candidates] ${error.message}`);
  }

  return data || [];
}

async function fetchCandidateViewRowsInRange(
  supabase,
  { afterProductId, startProductId, endProductId, limit = CONFIG.pageSize }
) {
  const productIdColumn = CONFIG.columns.candidates.productId;
  let data;
  let error;

  try {
    let query = supabase
      .from(CONFIG.tables.candidates)
      .select(productIdColumn)
      .order(productIdColumn, { ascending: true })
      .limit(Math.max(1, limit));

    if (startProductId) {
      query = query.gte(productIdColumn, startProductId);
    }
    if (endProductId) {
      query = query.lte(productIdColumn, endProductId);
    }

    const result = afterProductId
      ? await query.gt(productIdColumn, afterProductId)
      : await query;
    data = result.data;
    error = result.error;
  } catch (fetchError) {
    throw new Error(
      `[supabase:${CONFIG.tables.candidates}] ${formatFetchFailure(fetchError)}`
    );
  }

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.candidates}] ${error.message}`);
  }

  return data || [];
}

async function fetchProductsById(supabase, productIds) {
  const uniqueIds = Array.from(
    new Set(productIds.map((id) => String(id)))
  ).filter(Boolean);
  if (!uniqueIds.length) {
    return new Map();
  }

  const rows = [];
  const selectColumns = [
    CONFIG.columns.products.productId,
    CONFIG.columns.products.barcode,
    CONFIG.columns.products.name,
    CONFIG.columns.products.ingredients,
  ].join(", ");

  for (
    let index = 0;
    index < uniqueIds.length;
    index += CONFIG.fetchChunkSize
  ) {
    const idChunk = uniqueIds.slice(index, index + CONFIG.fetchChunkSize);
    let data;
    let error;

    try {
      const result = await supabase
        .from(CONFIG.tables.products)
        .select(selectColumns)
        .in(CONFIG.columns.products.productId, idChunk);
      data = result.data;
      error = result.error;
    } catch (fetchError) {
      throw new Error(
        `[supabase:products] ${formatFetchFailure(fetchError)}`
      );
    }

    if (error) {
      throw new Error(`[supabase:products] ${error.message}`);
    }

    rows.push(...(data || []));
  }

  return new Map(
    rows.map((row) => [
      String(row[CONFIG.columns.products.productId]),
      row,
    ])
  );
}

async function fetchRowsForProductIds(supabase, table, productIds) {
  const uniqueIds = Array.from(
    new Set(productIds.map((id) => String(id)))
  ).filter(Boolean);
  if (!uniqueIds.length) {
    return [];
  }

  const productIdColumn =
    table === CONFIG.tables.classification
      ? CONFIG.columns.classification.productId
      : table === CONFIG.tables.naming
      ? CONFIG.columns.naming.productId
      : table === CONFIG.tables.extraction
      ? CONFIG.columns.extraction.productId
      : CONFIG.columns.activeIngredients.productId;
  const createdAtColumn =
    table === CONFIG.tables.classification
      ? CONFIG.columns.classification.processedAt
      : table === CONFIG.tables.naming
      ? CONFIG.columns.naming.processedAt
      : table === CONFIG.tables.extraction
      ? CONFIG.columns.extraction.processedAt
      : CONFIG.columns.activeIngredients.createdAt;

  const selectColumns =
    table === CONFIG.tables.classification
      ? [
          CONFIG.columns.classification.productId,
          CONFIG.columns.classification.contentHash,
          CONFIG.columns.classification.model,
          CONFIG.columns.classification.promptVersion,
          CONFIG.columns.classification.batchId,
          CONFIG.columns.classification.isSupplement,
          CONFIG.columns.classification.confidence,
          CONFIG.columns.classification.category,
          CONFIG.columns.classification.shouldExtract,
          CONFIG.columns.classification.reason,
          CONFIG.columns.classification.processedAt,
        ]
      : table === CONFIG.tables.naming
      ? [
          CONFIG.columns.naming.productId,
          CONFIG.columns.naming.contentHash,
          CONFIG.columns.naming.model,
          CONFIG.columns.naming.promptVersion,
          CONFIG.columns.naming.batchId,
          CONFIG.columns.naming.rawResponse,
          CONFIG.columns.naming.displayName,
          CONFIG.columns.naming.brandName,
          CONFIG.columns.naming.productType,
          CONFIG.columns.naming.formFactor,
          CONFIG.columns.naming.flavor,
          CONFIG.columns.naming.confidence,
          CONFIG.columns.naming.notes,
          CONFIG.columns.naming.processedAt,
        ]
      : table === CONFIG.tables.extraction
      ? [
          CONFIG.columns.extraction.productId,
          CONFIG.columns.extraction.contentHash,
          CONFIG.columns.extraction.model,
          CONFIG.columns.extraction.promptVersion,
          CONFIG.columns.extraction.batchId,
          CONFIG.columns.extraction.rawResponse,
          CONFIG.columns.extraction.status,
          CONFIG.columns.extraction.servingSizeText,
          CONFIG.columns.extraction.notes,
          CONFIG.columns.extraction.processedAt,
        ]
      : table === CONFIG.tables.activeIngredients
      ? [
          CONFIG.columns.activeIngredients.productId,
          CONFIG.columns.activeIngredients.rawName,
          CONFIG.columns.activeIngredients.canonicalName,
          CONFIG.columns.activeIngredients.ingredientType,
          CONFIG.columns.activeIngredients.dosageValue,
          CONFIG.columns.activeIngredients.dosageUnit,
          CONFIG.columns.activeIngredients.dosageOriginalText,
          CONFIG.columns.activeIngredients.chemicalForm,
          CONFIG.columns.activeIngredients.amountBasis,
          CONFIG.columns.activeIngredients.supplementId,
          CONFIG.columns.activeIngredients.resolutionStatus,
          CONFIG.columns.activeIngredients.resolutionConfidence,
          CONFIG.columns.activeIngredients.sourceModel,
          CONFIG.columns.activeIngredients.sourcePromptVersion,
          CONFIG.columns.activeIngredients.createdAt,
        ]
      : ["*"];

  const rows = [];

  for (
    let index = 0;
    index < uniqueIds.length;
    index += CONFIG.fetchChunkSize
  ) {
    const idChunk = uniqueIds.slice(index, index + CONFIG.fetchChunkSize);
    let data;
    let error;

    try {
      const result = await supabase
        .from(table)
        .select(selectColumns.join(", "))
        .in(productIdColumn, idChunk)
        .order(createdAtColumn, { ascending: false, nullsFirst: false });
      data = result.data;
      error = result.error;
    } catch (fetchError) {
      throw new Error(`[supabase:${table}] ${formatFetchFailure(fetchError)}`);
    }

    if (error) {
      throw new Error(`[supabase:${table}] ${error.message}`);
    }

    rows.push(...(data || []));
  }

  return rows;
}

async function fetchSuccessfulExtractionRows(supabase, value) {
  const options =
    typeof value === "number" ? { limit: value } : normalizeObject(value) || {};
  const limit = Math.max(1, parseOptionalInteger(options.limit) || 500);
  const productIds = dedupeByKey(
    (Array.isArray(options.productIds) ? options.productIds : [])
      .map((item) => normalizeId(item))
      .filter(Boolean),
    (item) => String(item)
  );
  const startProductId = normalizeId(options.startProductId);
  const endProductId = normalizeId(options.endProductId);

  if (productIds.length) {
    const rows = await fetchRowsForProductIds(
      supabase,
      CONFIG.tables.extraction,
      productIds
    );
    return dedupeLatestRowsByProductId(
      rows.filter(
        (row) =>
          trimString(row?.[CONFIG.columns.extraction.status]) === "succeeded" &&
          trimString(row?.[CONFIG.columns.extraction.promptVersion]) ===
            CONFIG.extractPromptVersion
      ),
      CONFIG.columns.extraction.productId,
      CONFIG.columns.extraction.processedAt
    ).slice(0, limit);
  }

  let query = supabase
    .from(CONFIG.tables.extraction)
    .select("*")
    .eq(CONFIG.columns.extraction.status, "succeeded")
    .eq(CONFIG.columns.extraction.promptVersion, CONFIG.extractPromptVersion)
    .order(CONFIG.columns.extraction.processedAt, {
      ascending: false,
      nullsFirst: false,
    })
    .limit(Math.max(limit, limit * CONFIG.maxRetries));

  if (startProductId) {
    query = query.gte(CONFIG.columns.extraction.productId, startProductId);
  }
  if (endProductId) {
    query = query.lte(CONFIG.columns.extraction.productId, endProductId);
  }
  const pageSize = Math.max(CONFIG.pageSize, 1000);
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`[supabase:${CONFIG.tables.extraction}] ${error.message}`);
    }

    const pageRows = data || [];
    rows.push(...pageRows);

    const uniqueRows = dedupeLatestRowsByProductId(
      rows,
      CONFIG.columns.extraction.productId,
      CONFIG.columns.extraction.processedAt
    );
    if (uniqueRows.length >= limit) {
      return uniqueRows.slice(0, limit);
    }

    if (pageRows.length < pageSize) {
      return uniqueRows.slice(0, limit);
    }

    offset += pageSize;
  }
}

async function fetchNeedsAliasReviewActiveIngredientRows(supabase, value) {
  const options =
    typeof value === "number" ? { limit: value } : normalizeObject(value) || {};
  const limit = Math.max(1, parseOptionalInteger(options.limit) || 5000);
  const productIds = dedupeByKey(
    (Array.isArray(options.productIds) ? options.productIds : [])
      .map((item) => normalizeId(item))
      .filter(Boolean),
    (item) => String(item)
  );
  const startProductId = normalizeId(options.startProductId);
  const endProductId = normalizeId(options.endProductId);

  const filterRows = (rows) =>
    (rows || []).filter(
      (row) =>
        trimString(row?.[CONFIG.columns.activeIngredients.resolutionStatus]) ===
          "needs_alias_review" &&
        trimString(row?.[CONFIG.columns.activeIngredients.ingredientType]) ===
          "active" &&
        !trimString(row?.[CONFIG.columns.activeIngredients.supplementId])
    );

  if (productIds.length) {
    return filterRows(
      (
        await fetchRowsForProductIds(
          supabase,
          CONFIG.tables.activeIngredients,
          productIds
        )
      ).slice(0, limit)
    );
  }

  let query = supabase
    .from(CONFIG.tables.activeIngredients)
    .select("*")
    .eq(CONFIG.columns.activeIngredients.resolutionStatus, "needs_alias_review")
    .eq(CONFIG.columns.activeIngredients.ingredientType, "active")
    .is(CONFIG.columns.activeIngredients.supplementId, null)
    .order(CONFIG.columns.activeIngredients.createdAt, {
      ascending: false,
      nullsFirst: false,
    })
    .limit(limit);

  if (startProductId) {
    query = query.gte(CONFIG.columns.activeIngredients.productId, startProductId);
  }
  if (endProductId) {
    query = query.lte(CONFIG.columns.activeIngredients.productId, endProductId);
  }

  const pageSize = Math.max(CONFIG.pageSize, 1000);
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(
        `[supabase:${CONFIG.tables.activeIngredients}] ${error.message}`
      );
    }

    const pageRows = data || [];
    rows.push(...pageRows);

    if (rows.length >= limit) {
      return rows.slice(0, limit);
    }

    if (pageRows.length < pageSize) {
      return rows.slice(0, limit);
    }

    offset += pageSize;
  }
}

async function fetchLastProcessedClassificationProductId(supabase) {
  const { data, error } = await supabase
    .from(CONFIG.tables.classification)
    .select(CONFIG.columns.classification.productId)
    .eq(
      CONFIG.columns.classification.promptVersion,
      CONFIG.classifyPromptVersion
    )
    .order(CONFIG.columns.classification.productId, { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(
      `[supabase:${CONFIG.tables.classification}] ${error.message}`
    );
  }

  return normalizeId(data?.[0]?.[CONFIG.columns.classification.productId]);
}

async function fetchLastProcessedNamingProductId(supabase) {
  const { data, error } = await supabase
    .from(CONFIG.tables.naming)
    .select(CONFIG.columns.naming.productId)
    .eq(CONFIG.columns.naming.promptVersion, CONFIG.namingPromptVersion)
    .order(CONFIG.columns.naming.productId, { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.naming}] ${error.message}`);
  }

  return normalizeId(data?.[0]?.[CONFIG.columns.naming.productId]);
}

async function fetchAliasRows(supabase) {
  const { data, error } = await supabase
    .from(CONFIG.tables.aliases)
    .select("*");

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.aliases}] ${error.message}`);
  }

  return data || [];
}

async function fetchSupplementRows(supabase, options = {}) {
  const status = trimString(options?.status);
  let query = supabase
    .from(CONFIG.tables.supplements)
    .select(
      [
        CONFIG.columns.supplements.supplementId,
        CONFIG.columns.supplements.name,
        CONFIG.columns.supplements.status,
      ].join(", ")
    );

  if (status) {
    query = query.eq(CONFIG.columns.supplements.status, status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.supplements}] ${error.message}`);
  }

  return data || [];
}

async function fetchApprovedSupplements(supabase) {
  return fetchSupplementRows(supabase, { status: "approved" });
}

async function fetchCatalogReviewCandidateRowsByNames(supabase, normalizedNames) {
  const uniqueNames = dedupeByKey(
    (normalizedNames || []).map((name) => trimString(name)).filter(Boolean),
    (name) => name
  );
  if (!uniqueNames.length) {
    return [];
  }

  const rows = [];
  for (
    let index = 0;
    index < uniqueNames.length;
    index += CONFIG.fetchChunkSize
  ) {
    const nameChunk = uniqueNames.slice(index, index + CONFIG.fetchChunkSize);
    const { data, error } = await supabase
      .from(CONFIG.tables.catalogReviewCandidates)
      .select("*")
      .in(CONFIG.columns.catalogReviewCandidates.normalizedName, nameChunk);

    if (error) {
      throw new Error(
        `[supabase:${CONFIG.tables.catalogReviewCandidates}] ${error.message}`
      );
    }

    rows.push(...(data || []));
  }

  return rows;
}

async function refreshSupplementMasterForProductIds(supabase, productIds) {
  const uniqueIds = dedupeByKey(
    (productIds || []).map((value) => normalizeId(value)).filter(Boolean),
    (value) => String(value)
  );
  if (!uniqueIds.length) {
    return { upserted: 0 };
  }

  const [productsById, namingRows, activeRows, extractionRows] = await Promise.all([
    fetchProductsById(supabase, uniqueIds),
    fetchRowsForProductIds(supabase, CONFIG.tables.naming, uniqueIds),
    fetchRowsForProductIds(supabase, CONFIG.tables.activeIngredients, uniqueIds),
    fetchRowsForProductIds(supabase, CONFIG.tables.extraction, uniqueIds),
  ]);

  const namingByProductId = groupRowsByProductId(
    namingRows,
    CONFIG.columns.naming.productId
  );
  const activeByProductId = groupRowsByProductId(
    activeRows,
    CONFIG.columns.activeIngredients.productId
  );
  const extractionByProductId = groupRowsByProductId(
    extractionRows,
    CONFIG.columns.extraction.productId
  );

  const processedAt = new Date().toISOString();
  const upserts = [];

  for (const productId of uniqueIds) {
    const key = String(productId);
    const namingRow = getLatestSuccessfulRow(
      namingByProductId.get(key) || [],
      CONFIG.columns.naming.processedAt
    );
    const product = productsById.get(key) || null;
    const extractionRow = getLatestSuccessfulRow(
      extractionByProductId.get(key) || [],
      CONFIG.columns.extraction.processedAt
    );
    const displayName =
      trimString(namingRow?.[CONFIG.columns.naming.displayName]) ||
      normalizeWhitespace(product?.[CONFIG.columns.products.name] || "");

    const activeIngredients = dedupeByKey(
      (activeByProductId.get(key) || [])
        .filter(
          (row) =>
            trimString(row?.[CONFIG.columns.activeIngredients.canonicalName]) &&
            trimString(row?.[CONFIG.columns.activeIngredients.ingredientType]) ===
              "active"
        )
        .map((row) => ({
          name: trimString(row[CONFIG.columns.activeIngredients.canonicalName]),
          dosage_value:
            row[CONFIG.columns.activeIngredients.dosageValue] ?? null,
          dosage_unit:
            trimString(row[CONFIG.columns.activeIngredients.dosageUnit]) || null,
          dosage_display:
            trimString(
              row[CONFIG.columns.activeIngredients.dosageOriginalText]
            ) ||
            stringifyDosage(
              row[CONFIG.columns.activeIngredients.dosageValue],
              row[CONFIG.columns.activeIngredients.dosageUnit]
            ) ||
            null,
          chemical_form:
            trimString(row[CONFIG.columns.activeIngredients.chemicalForm]) || null,
          amount_basis:
            trimString(row[CONFIG.columns.activeIngredients.amountBasis]) ||
            "unknown",
        }))
        .sort((left, right) => {
          const byName = left.name.localeCompare(right.name);
          if (byName !== 0) {
            return byName;
          }
          return (left.dosage_display || "").localeCompare(
            right.dosage_display || ""
          );
        }),
      (item) =>
        [
          item.name,
          item.dosage_value ?? "",
          item.dosage_unit ?? "",
          item.dosage_display ?? "",
          item.chemical_form ?? "",
          item.amount_basis ?? "",
        ].join("|")
    );

    if (!displayName || !activeIngredients.length) {
      continue;
    }

    upserts.push({
      [CONFIG.columns.supplementMaster.productId]: productId,
      [CONFIG.columns.supplementMaster.displayName]: displayName,
      [CONFIG.columns.supplementMaster.servingSizeText]:
        trimString(extractionRow?.[CONFIG.columns.extraction.servingSizeText]) ||
        null,
      [CONFIG.columns.supplementMaster.nameSource]: namingRow ? "ai" : "raw",
      [CONFIG.columns.supplementMaster.namingConfidence]:
        parseOptionalNumber(
          namingRow?.[CONFIG.columns.naming.confidence]
        ) ?? null,
      [CONFIG.columns.supplementMaster.activeIngredientsJson]:
        activeIngredients,
      [CONFIG.columns.supplementMaster.ingredientCount]:
        activeIngredients.length,
      [CONFIG.columns.supplementMaster.processedAt]: processedAt,
    });
  }

  await insertRowsInChunks(supabase, CONFIG.tables.supplementMaster, upserts);
  return { upserted: upserts.length };
}

function buildSupplementNameIndex(rows) {
  const index = new Map();

  for (const row of rows || []) {
    const supplementId = trimString(row?.[CONFIG.columns.supplements.supplementId]);
    const name = trimString(row?.[CONFIG.columns.supplements.name]);
    const normalizedNames = buildSupplementNameLookupKeys(name);

    if (!supplementId || !normalizedNames.length) {
      continue;
    }

    normalizedNames.forEach((normalizedName) => {
      if (index.has(normalizedName)) {
        return;
      }

      index.set(normalizedName, {
        supplement_id: supplementId,
        canonical_name: name,
      });
    });
  }

  return index;
}

function groupActiveIngredientRowsBySignature(rows) {
  const grouped = new Map();

  for (const row of rows || []) {
    const signature = buildActiveIngredientSignature(row);
    if (!signature) {
      continue;
    }

    const current = grouped.get(signature) || [];
    current.push(row);
    grouped.set(signature, current);
  }

  return grouped;
}

async function updateResolvedActiveIngredientRows(supabase, rows) {
  if (!rows.length) {
    return 0;
  }

  let updatedCount = 0;

  for (const row of rows) {
    const patch = {
      [CONFIG.columns.activeIngredients.supplementId]: row.supplement_id,
      [CONFIG.columns.activeIngredients.resolutionStatus]:
        row.resolution_status,
      [CONFIG.columns.activeIngredients.resolutionConfidence]:
        row.resolution_confidence,
    };

    let query = supabase
      .from(CONFIG.tables.activeIngredients)
      .update(patch)
      .eq(
        CONFIG.columns.activeIngredients.productId,
        row[CONFIG.columns.activeIngredients.productId]
      )
      .eq(
        CONFIG.columns.activeIngredients.ingredientType,
        row[CONFIG.columns.activeIngredients.ingredientType]
      )
      .is(CONFIG.columns.activeIngredients.supplementId, null);

    query = applyNullableColumnFilter(
      query,
      CONFIG.columns.activeIngredients.rawName,
      row[CONFIG.columns.activeIngredients.rawName]
    );
    query = applyNullableColumnFilter(
      query,
      CONFIG.columns.activeIngredients.canonicalName,
      row[CONFIG.columns.activeIngredients.canonicalName]
    );
    query = applyNullableColumnFilter(
      query,
      CONFIG.columns.activeIngredients.dosageValue,
      row[CONFIG.columns.activeIngredients.dosageValue]
    );
    query = applyNullableColumnFilter(
      query,
      CONFIG.columns.activeIngredients.dosageUnit,
      row[CONFIG.columns.activeIngredients.dosageUnit]
    );
    query = applyNullableColumnFilter(
      query,
      CONFIG.columns.activeIngredients.chemicalForm,
      row[CONFIG.columns.activeIngredients.chemicalForm]
    );
    query = applyNullableColumnFilter(
      query,
      CONFIG.columns.activeIngredients.amountBasis,
      row[CONFIG.columns.activeIngredients.amountBasis]
    );

    const { data, error } = await query.select(
      CONFIG.columns.activeIngredients.productId
    );

    if (error) {
      throw new Error(`[supabase:${CONFIG.tables.activeIngredients}] ${error.message}`);
    }

    updatedCount += (data || []).length;
  }

  return updatedCount;
}

async function incrementMissingSupplementCounts(supabase, rows) {
  const grouped = new Map();
  const now = new Date().toISOString();

  for (const row of rows || []) {
    const normalizedName = trimString(row?.normalized_name);
    if (!normalizedName) {
      continue;
    }

    if (!grouped.has(normalizedName)) {
      grouped.set(normalizedName, {
        normalized_name: normalizedName,
        display_name:
          trimString(row?.display_name) ||
          trimString(row?.normalized_name) ||
          normalizedName,
        product_ids: new Set(),
      });
    }

    const entry = grouped.get(normalizedName);
    const productId = normalizeId(row?.product_id);
    if (productId) {
      entry.product_ids.add(String(productId));
    }
  }

  if (!grouped.size) {
    return { upserted: 0 };
  }

  const occurrenceUpserts = [];
  for (const entry of grouped.values()) {
    for (const productId of entry.product_ids) {
      occurrenceUpserts.push({
        [CONFIG.columns.missingSupplementOccurrences.normalizedName]:
          entry.normalized_name,
        [CONFIG.columns.missingSupplementOccurrences.productId]: productId,
        [CONFIG.columns.missingSupplementOccurrences.displayName]:
          entry.display_name,
        [CONFIG.columns.missingSupplementOccurrences.firstSeenAt]: now,
        [CONFIG.columns.missingSupplementOccurrences.lastSeenAt]: now,
      });
    }
  }

  await insertRowsInChunks(
    supabase,
    CONFIG.tables.missingSupplementOccurrences,
    occurrenceUpserts
  );

  const occurrenceRows = await fetchMissingSupplementOccurrenceRows(
    supabase,
    [...grouped.keys()]
  );
  const summaryByName = new Map();

  for (const row of occurrenceRows) {
    const normalizedName = trimString(
      row?.[CONFIG.columns.missingSupplementOccurrences.normalizedName]
    );
    if (!normalizedName) {
      continue;
    }

    if (!summaryByName.has(normalizedName)) {
      summaryByName.set(normalizedName, {
        count: 0,
        firstSeenAt:
          trimString(row?.[CONFIG.columns.missingSupplementOccurrences.firstSeenAt]) ||
          now,
        lastSeenAt:
          trimString(row?.[CONFIG.columns.missingSupplementOccurrences.lastSeenAt]) ||
          now,
      });
    }

    const summary = summaryByName.get(normalizedName);
    summary.count += 1;
    const rowFirstSeen = trimString(
      row?.[CONFIG.columns.missingSupplementOccurrences.firstSeenAt]
    );
    const rowLastSeen = trimString(
      row?.[CONFIG.columns.missingSupplementOccurrences.lastSeenAt]
    );

    if (rowFirstSeen && rowFirstSeen < summary.firstSeenAt) {
      summary.firstSeenAt = rowFirstSeen;
    }
    if (rowLastSeen && rowLastSeen > summary.lastSeenAt) {
      summary.lastSeenAt = rowLastSeen;
    }
  }

  const upserts = [...grouped.values()].map((entry) => {
    const summary = summaryByName.get(entry.normalized_name) || {
      count: entry.product_ids.size,
      firstSeenAt: now,
      lastSeenAt: now,
    };

    return {
      [CONFIG.columns.missingSupplements.normalizedName]: entry.normalized_name,
      [CONFIG.columns.missingSupplements.displayName]: entry.display_name,
      [CONFIG.columns.missingSupplements.occurrenceCount]: summary.count,
      [CONFIG.columns.missingSupplements.firstSeenAt]: summary.firstSeenAt,
      [CONFIG.columns.missingSupplements.lastSeenAt]: summary.lastSeenAt,
    };
  });

  await insertRowsInChunks(supabase, CONFIG.tables.missingSupplements, upserts);
  return { upserted: upserts.length };
}

async function fetchMissingSupplementOccurrenceRows(supabase, normalizedNames) {
  const uniqueNames = dedupeByKey(
    (normalizedNames || []).map((name) => trimString(name)).filter(Boolean),
    (name) => name
  );
  if (!uniqueNames.length) {
    return [];
  }

  const rows = [];

  for (
    let index = 0;
    index < uniqueNames.length;
    index += CONFIG.fetchChunkSize
  ) {
    const nameChunk = uniqueNames.slice(index, index + CONFIG.fetchChunkSize);
    const { data, error } = await supabase
      .from(CONFIG.tables.missingSupplementOccurrences)
      .select("*")
      .in(CONFIG.columns.missingSupplementOccurrences.normalizedName, nameChunk);

    if (error) {
      throw new Error(
        `[supabase:${CONFIG.tables.missingSupplementOccurrences}] ${error.message}`
      );
    }

    rows.push(...(data || []));
  }

  return rows;
}

async function fetchNeedsAliasReviewCandidates(
  supabase,
  {
    limitNames = 100,
    maxRows = 10000,
    chunkSize = 1000,
    excludeNormalizedNames = new Set(),
    startOffset = 0,
  } = {}
) {
  const grouped = new Map();
  let offset = Math.max(0, parseOptionalInteger(startOffset) || 0);
  const maxScanRows = Math.max(1, parseOptionalInteger(maxRows) || 10000);
  const stopOffset = offset + maxScanRows;
  let rowsScanned = 0;
  let sourceExhausted = false;

  while (grouped.size < limitNames && offset < stopOffset) {
    const upperBound = Math.min(offset + chunkSize - 1, stopOffset - 1);
    const { data, error } = await supabase
      .from(CONFIG.tables.activeIngredients)
      .select(
        [
          CONFIG.columns.activeIngredients.productId,
          CONFIG.columns.activeIngredients.rawName,
          CONFIG.columns.activeIngredients.canonicalName,
          CONFIG.columns.activeIngredients.dosageOriginalText,
          CONFIG.columns.activeIngredients.chemicalForm,
          CONFIG.columns.activeIngredients.resolutionStatus,
          CONFIG.columns.activeIngredients.ingredientType,
          CONFIG.columns.activeIngredients.createdAt,
        ].join(", ")
      )
      .eq(CONFIG.columns.activeIngredients.resolutionStatus, "needs_alias_review")
      .eq(CONFIG.columns.activeIngredients.ingredientType, "active")
      .order(CONFIG.columns.activeIngredients.createdAt, {
        ascending: false,
        nullsFirst: false,
      })
      .range(offset, upperBound);

    if (error) {
      throw new Error(`[supabase:${CONFIG.tables.activeIngredients}] ${error.message}`);
    }

    if (!data?.length) {
      sourceExhausted = true;
      break;
    }

    rowsScanned += data.length;

    for (const row of data) {
      const normalizedName = normalizeBroadIngredientName(
        row?.[CONFIG.columns.activeIngredients.canonicalName] ||
          row?.[CONFIG.columns.activeIngredients.rawName]
      );
      if (!normalizedName) {
        continue;
      }
      if (
        excludeNormalizedNames instanceof Set &&
        excludeNormalizedNames.has(normalizedName)
      ) {
        continue;
      }

      const productId = normalizeId(
        row?.[CONFIG.columns.activeIngredients.productId]
      );
      if (!grouped.has(normalizedName)) {
        grouped.set(normalizedName, {
          normalized_name: normalizedName,
          display_name:
            trimString(row?.[CONFIG.columns.activeIngredients.canonicalName]) ||
            trimString(row?.[CONFIG.columns.activeIngredients.rawName]) ||
            normalizedName,
          occurrence_count: 0,
          product_ids: [],
          sample_rows: [],
          latest_created_at:
            trimString(row?.[CONFIG.columns.activeIngredients.createdAt]) || null,
        });
      }

      const entry = grouped.get(normalizedName);
      entry.occurrence_count += 1;
      if (productId && !entry.product_ids.includes(productId)) {
        entry.product_ids.push(productId);
      }
      if (entry.sample_rows.length < 5) {
        entry.sample_rows.push({
          raw_name:
            trimString(row?.[CONFIG.columns.activeIngredients.rawName]) || null,
          canonical_name:
            trimString(row?.[CONFIG.columns.activeIngredients.canonicalName]) ||
            null,
          dosage_original_text:
            trimString(
              row?.[CONFIG.columns.activeIngredients.dosageOriginalText]
            ) || null,
          chemical_form:
            trimString(row?.[CONFIG.columns.activeIngredients.chemicalForm]) ||
            null,
          product_id: productId,
        });
      }
    }

    offset += data.length;
    if (data.length < chunkSize) {
      sourceExhausted = true;
      break;
    }
  }

  const candidates = [...grouped.values()]
    .sort((left, right) => {
      const byCount = right.occurrence_count - left.occurrence_count;
      if (byCount !== 0) {
        return byCount;
      }
      return left.normalized_name.localeCompare(right.normalized_name);
    })
    .slice(0, limitNames);

  candidates.source_rows_scanned = rowsScanned;
  candidates.source_exhausted = sourceExhausted;
  return candidates;
}

async function fetchRandomCandidateProducts(supabase, limit) {
  const pageRows = await fetchCandidateViewRows(supabase, 0);
  const shuffledIds = shuffle(
    pageRows
      .map((row) => normalizeId(row[CONFIG.columns.candidates.productId]))
      .filter(Boolean)
  ).slice(0, limit);
  const productsById = await fetchProductsById(supabase, shuffledIds);
  return shuffledIds.map((productId) => ({
    product_id: productId,
    ...reduceProductForAi(productsById.get(String(productId)) || {}),
  }));
}

async function fetchLikelySupplementProducts(supabase, limit) {
  const { data, error } = await supabase
    .from(CONFIG.tables.classification)
    .select("*")
    .eq(
      CONFIG.columns.classification.promptVersion,
      CONFIG.classifyPromptVersion
    )
    .eq(CONFIG.columns.classification.isSupplement, true)
    .gte(CONFIG.columns.classification.confidence, CONFIG.thresholds.extract)
    .order(CONFIG.columns.classification.processedAt, {
      ascending: false,
      nullsFirst: false,
    })
    .limit(limit * 5);

  if (error) {
    throw new Error(
      `[supabase:${CONFIG.tables.classification}] ${error.message}`
    );
  }

  const latest = dedupeByKey(data || [], (row) =>
    String(row[CONFIG.columns.classification.productId])
  ).slice(0, limit);
  const productIds = latest.map(
    (row) => row[CONFIG.columns.classification.productId]
  );
  const productsById = await fetchProductsById(supabase, productIds);

  return latest
    .map((row) => {
      const productId = row[CONFIG.columns.classification.productId];
      const product = productsById.get(String(productId));
      if (!product) {
        return null;
      }
      return {
        product_id: productId,
        ...reduceProductForAi(product),
      };
    })
    .filter(Boolean);
}

async function fetchEdgeCaseProducts(supabase, limit) {
  const [reviewRows, extractionRows, classificationRows] = await Promise.all([
    supabase
      .from(CONFIG.tables.reviewQueue)
      .select("*")
      .order(CONFIG.columns.reviewQueue.createdAt, {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit * 3),
    supabase
      .from(CONFIG.tables.extraction)
      .select("*")
      .eq(CONFIG.columns.extraction.status, "validation_failed")
      .order(CONFIG.columns.extraction.processedAt, {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit * 3),
    supabase
      .from(CONFIG.tables.classification)
      .select("*")
      .eq(
        CONFIG.columns.classification.promptVersion,
        CONFIG.classifyPromptVersion
      )
      .order(CONFIG.columns.classification.processedAt, {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit * 3),
  ]);

  if (reviewRows.error) {
    throw new Error(
      `[supabase:${CONFIG.tables.reviewQueue}] ${reviewRows.error.message}`
    );
  }
  if (extractionRows.error) {
    throw new Error(
      `[supabase:${CONFIG.tables.extraction}] ${extractionRows.error.message}`
    );
  }
  if (classificationRows.error) {
    throw new Error(
      `[supabase:${CONFIG.tables.classification}] ${classificationRows.error.message}`
    );
  }

  const ids = shuffle(
    dedupeByKey(
      [
        ...(reviewRows.data || []).map(
          (row) => row[CONFIG.columns.reviewQueue.productId]
        ),
        ...(extractionRows.data || []).map(
          (row) => row[CONFIG.columns.extraction.productId]
        ),
        ...(classificationRows.data || [])
          .filter((row) => getDownstreamAction(row) === "mini_fallback")
          .map((row) => row[CONFIG.columns.classification.productId]),
      ]
        .map((value) => normalizeId(value))
        .filter(Boolean),
      (value) => String(value)
    )
  ).slice(0, limit);

  const productsById = await fetchProductsById(supabase, ids);
  return ids
    .map((productId) => {
      const product = productsById.get(String(productId));
      if (!product) {
        return null;
      }
      return {
        product_id: productId,
        ...reduceProductForAi(product),
      };
    })
    .filter(Boolean);
}

async function buildEvaluationContext(supabase, productIds) {
  const [classificationRows, extractionRows, activeRows] = await Promise.all([
    fetchRowsForProductIds(supabase, CONFIG.tables.classification, productIds),
    fetchRowsForProductIds(supabase, CONFIG.tables.extraction, productIds),
    fetchRowsForProductIds(
      supabase,
      CONFIG.tables.activeIngredients,
      productIds
    ),
  ]);

  const classificationByProductId = groupRowsByProductId(
    classificationRows,
    CONFIG.columns.classification.productId
  );
  const extractionByProductId = groupRowsByProductId(
    extractionRows,
    CONFIG.columns.extraction.productId
  );
  const activeByProductId = groupRowsByProductId(
    activeRows,
    CONFIG.columns.activeIngredients.productId
  );

  const context = new Map();

  for (const productId of productIds) {
    const key = String(productId);
    context.set(key, {
      classification: getLatestSuccessfulRow(
        classificationByProductId.get(key) || [],
        CONFIG.columns.classification.processedAt
      ),
      extraction: getLatestSuccessfulRow(
        extractionByProductId.get(key) || [],
        CONFIG.columns.extraction.processedAt
      ),
      activeIngredients: activeByProductId.get(key) || [],
    });
  }

  return context;
}

function serializeEvalSampleRow(row, prediction) {
  const activeIngredients = (prediction?.activeIngredients || [])
    .map((item) => ({
      canonical_name: item[CONFIG.columns.activeIngredients.canonicalName],
      resolution_status:
        item[CONFIG.columns.activeIngredients.resolutionStatus],
      dosage_value: item[CONFIG.columns.activeIngredients.dosageValue],
      dosage_unit: item[CONFIG.columns.activeIngredients.dosageUnit],
    }))
    .filter((item) => item.canonical_name);
  const predictedResolutionStatuses = activeIngredients.map(
    (item) => item.resolution_status
  );

  return [
    csvValue(row.bucket),
    csvValue(row.product_id),
    csvValue(row.barcode),
    csvValue(row.name),
    csvValue(row.ingredients),
    csvValue(
      prediction?.classification?.[
        CONFIG.columns.classification.isSupplement
      ] ?? ""
    ),
    csvValue(
      prediction?.classification?.[CONFIG.columns.classification.confidence] ??
        ""
    ),
    csvValue(JSON.stringify(activeIngredients)),
    csvValue(JSON.stringify(predictedResolutionStatuses)),
    "",
    "",
    "",
    "",
  ].join(",");
}

function scoreEvaluationRow(row, prediction) {
  const expectedIsSupplement = parseOptionalBoolean(row.expected_is_supplement);
  const expectedActive = parseJsonArray(
    row.expected_active_ingredients_json
  ).map(normalizeBroadIngredientName);
  const expectedDosages = parseOptionalJson(row.expected_dosages_json);
  const predictedClassification = prediction?.classification || null;
  const predictedExtraction = prediction?.extraction || null;
  const predictedActive = (prediction?.activeIngredients || [])
    .map((item) =>
      normalizeBroadIngredientName(
        item[CONFIG.columns.activeIngredients.canonicalName]
      )
    )
    .filter(Boolean);

  const predictedDosages = Object.fromEntries(
    (prediction?.activeIngredients || [])
      .filter((item) => item[CONFIG.columns.activeIngredients.canonicalName])
      .map((item) => [
        normalizeBroadIngredientName(
          item[CONFIG.columns.activeIngredients.canonicalName]
        ),
        stringifyDosage(
          item[CONFIG.columns.activeIngredients.dosageValue],
          item[CONFIG.columns.activeIngredients.dosageUnit]
        ),
      ])
  );

  return {
    product_id: normalizeId(row.product_id),
    expected_is_supplement: expectedIsSupplement,
    predicted_is_supplement:
      predictedClassification?.[CONFIG.columns.classification.isSupplement] ??
      null,
    expected_active_ingredients: expectedActive,
    predicted_active_ingredients: predictedActive,
    expected_dosages: expectedDosages,
    predicted_dosages: predictedDosages,
    alias_statuses: (prediction?.activeIngredients || []).map(
      (item) => item[CONFIG.columns.activeIngredients.resolutionStatus]
    ),
    usage: {
      classification: getUsage(predictedClassification),
      extraction: getUsage(predictedExtraction),
    },
  };
}

function summarizeEvaluationMetrics(rows) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  let ingredientTruePositive = 0;
  let ingredientFalsePositive = 0;
  let ingredientFalseNegative = 0;

  let dosageChecks = 0;
  let dosageCorrect = 0;

  let normalizedUnitChecks = 0;
  let normalizedUnitSuccess = 0;

  let aliasMatched = 0;
  let aliasTotal = 0;
  let aliasUnresolved = 0;

  let totalUsd = 0;
  let totalUsageRows = 0;

  for (const row of rows) {
    if (typeof row.expected_is_supplement === "boolean") {
      const predicted = Boolean(row.predicted_is_supplement);
      const expected = row.expected_is_supplement;

      if (predicted && expected) truePositive += 1;
      if (predicted && !expected) falsePositive += 1;
      if (!predicted && expected) falseNegative += 1;
    }

    if (
      Array.isArray(row.expected_active_ingredients) &&
      row.expected_active_ingredients.length
    ) {
      const predictedSet = new Set(row.predicted_active_ingredients);
      const expectedSet = new Set(row.expected_active_ingredients);

      for (const item of predictedSet) {
        if (expectedSet.has(item)) {
          ingredientTruePositive += 1;
        } else {
          ingredientFalsePositive += 1;
        }
      }

      for (const item of expectedSet) {
        if (!predictedSet.has(item)) {
          ingredientFalseNegative += 1;
        }
      }
    }

    if (row.expected_dosages && typeof row.expected_dosages === "object") {
      for (const [canonicalName, expectedValue] of Object.entries(
        row.expected_dosages
      )) {
        dosageChecks += 1;
        if (
          normalizeWhitespace(
            String(
              row.predicted_dosages?.[
                normalizeBroadIngredientName(canonicalName)
              ] || ""
            )
          ) === normalizeWhitespace(String(expectedValue || ""))
        ) {
          dosageCorrect += 1;
        }
      }
    }

    for (const unit of Object.values(row.predicted_dosages || {})) {
      normalizedUnitChecks += 1;
      if (isNormalizedDosageString(unit)) {
        normalizedUnitSuccess += 1;
      }
    }

    for (const status of row.alias_statuses || []) {
      aliasTotal += 1;
      if (status === "matched") aliasMatched += 1;
      if (status === "needs_alias_review") aliasUnresolved += 1;
    }

    const rowUsd = estimateRowCostUsd(row.usage);
    if (rowUsd != null) {
      totalUsd += rowUsd;
      totalUsageRows += 1;
    }
  }

  return {
    classification_precision: ratio(truePositive, truePositive + falsePositive),
    classification_recall: ratio(truePositive, truePositive + falseNegative),
    extraction_precision: ratio(
      ingredientTruePositive,
      ingredientTruePositive + ingredientFalsePositive
    ),
    extraction_recall: ratio(
      ingredientTruePositive,
      ingredientTruePositive + ingredientFalseNegative
    ),
    dosage_accuracy: ratio(dosageCorrect, dosageChecks),
    unit_normalization_success_rate: ratio(
      normalizedUnitSuccess,
      normalizedUnitChecks
    ),
    alias_match_rate: ratio(aliasMatched, aliasTotal),
    unresolved_alias_rate: ratio(aliasUnresolved, aliasTotal),
    estimated_cost_usd: totalUsageRows ? roundTo(totalUsd, 6) : null,
    estimated_cost_usd_per_1k_rows: totalUsageRows
      ? roundTo((totalUsd / totalUsageRows) * 1000, 6)
      : null,
  };
}

function buildClassificationSystemPrompt() {
  return [
    "You classify whether a product is primarily a dietary supplement.",
    "Respond with valid JSON that matches the provided schema.",
    "Ordinary food is not a supplement.",
    "Fortified food is still usually not a supplement.",
    "Protein powder, vitamin gummies, creatine, electrolyte tablets, probiotics, omega oils, and herbal capsules usually are supplements.",
    "If uncertain, lower confidence instead of guessing.",
  ].join(" ");
}

function buildClassificationUserPrompt(payload) {
  return [
    "Classify whether this product is primarily a supplement.",
    "Use only the fields below.",
    JSON.stringify({
      product_id: payload.product_id,
      barcode: payload.barcode,
      name: payload.name,
      ingredients: payload.ingredients,
    }),
  ].join("\n");
}

function buildExtractionSystemPrompt() {
  return [
    "You extract structured supplement ingredient data from product text.",
    "Respond with valid JSON that matches the provided schema.",
    "Extract only active ingredients where possible.",
    "Mark excipients as inactive.",
    "Do not invent missing dosages.",
    "Preserve the original dosage text.",
    "Return broad canonical names such as Vitamin D, Magnesium, Zinc.",
    "Put specific salt or form into chemical_form.",
    "If dosage is ambiguous, set numeric dosage to null.",
  ].join(" ");
}

function buildExtractionUserPrompt(payload) {
  return [
    "Extract supplement ingredients from this product.",
    "Use only the fields below.",
    JSON.stringify({
      product_id: payload.product_id,
      barcode: payload.barcode,
      name: payload.name,
      ingredients: payload.ingredients,
    }),
  ].join("\n");
}

function buildNamingSystemPrompt() {
  return [
    "You clean and enrich dietary supplement product names into a concise user-facing display name.",
    "Respond with valid JSON that matches the provided schema.",
    "Use correct capitalization and grammar for the display name.",
    "Preserve brand capitalization and known acronyms such as BCAA, DHA, EPA, D3, and NAD+.",
    "Use only the supplied fields.",
    "Do not invent brands, flavors, forms, or claims that are not strongly supported by the input.",
    "If the source name is generic, improve it cautiously using the ingredient text when strongly supported.",
    "The display_name must remain concise and suitable for app UI.",
  ].join(" ");
}

function buildNamingUserPrompt(payload) {
  return [
    "Clean and enrich the supplement name for this product.",
    "Return a polished display_name with proper capitalization.",
    "Keep uncertain structured fields as null.",
    JSON.stringify({
      product_id: payload.product_id,
      barcode: payload.barcode,
      name: payload.name,
      ingredients: payload.ingredients,
    }),
  ].join("\n");
}

function normalizeClassificationOutput(value) {
  return {
    is_supplement: Boolean(value?.is_supplement),
    confidence: clampConfidence(value?.confidence),
    category: trimString(value?.category) || "not_supplement",
    should_extract: Boolean(value?.should_extract),
    reason: trimString(value?.reason),
  };
}

function deriveClassificationAction(value) {
  if (!value?.is_supplement) {
    return "stop";
  }

  if (Number(value.confidence) >= CONFIG.thresholds.extract) {
    return "extract";
  }

  if (Number(value.confidence) >= CONFIG.thresholds.miniFallback) {
    return "mini_fallback";
  }

  return "stop";
}

function normalizeExtractionOutput(value) {
  const ingredients = Array.isArray(value?.ingredients_found)
    ? value.ingredients_found.map(normalizeExtractedIngredient)
    : [];

  return {
    is_supplement: Boolean(value?.is_supplement),
    serving_size_text: trimString(value?.serving_size_text) || null,
    notes: trimString(value?.notes) || null,
    ingredients_found: ingredients,
  };
}

function normalizeNamingOutput(value) {
  return {
    display_name: normalizeWhitespace(trimString(value?.display_name) || ""),
    brand_name: normalizeWhitespace(trimString(value?.brand_name) || "") || null,
    product_type:
      normalizeWhitespace(trimString(value?.product_type) || "") || null,
    form_factor:
      normalizeWhitespace(trimString(value?.form_factor) || "") || null,
    flavor: normalizeWhitespace(trimString(value?.flavor) || "") || null,
    confidence: clampConfidence(value?.confidence),
    notes: normalizeWhitespace(trimString(value?.notes) || "") || null,
  };
}

function normalizeExtractedIngredient(value) {
  return {
    raw_name: cleanIngredientText(value?.raw_name),
    canonical_name: cleanIngredientText(value?.canonical_name),
    ingredient_type: ["active", "inactive", "uncertain"].includes(
      value?.ingredient_type
    )
      ? value.ingredient_type
      : "uncertain",
    dosage_value: parseOptionalNumber(value?.dosage_value),
    dosage_unit: trimString(value?.dosage_unit) || null,
    dosage_original_text: trimString(value?.dosage_original_text) || null,
    chemical_form: cleanIngredientText(value?.chemical_form) || null,
    amount_basis: trimString(value?.amount_basis) || "unknown",
  };
}

function evaluateNamingOutput(value) {
  const errors = [];

  if (!trimString(value?.display_name)) {
    errors.push("missing_display_name");
  }

  return {
    status: errors.length ? "validation_failed" : "succeeded",
    data: value,
    validation_errors: errors,
  };
}

function evaluateExtractionOutput(value) {
  const fatalErrors = validateExtractionOutput(value);
  const warnings = collectExtractionWarnings(value);
  const recovery = handleValidationFailure(value, fatalErrors, warnings);
  const recoveredData = recovery.data || value;
  const recoveredFatalErrors = validateExtractionOutput(recoveredData);
  const recoveredWarnings = collectExtractionWarnings(recoveredData);

  return {
    status: recoveredFatalErrors.length ? "validation_failed" : "succeeded",
    data: recoveredData,
    validation_errors: Array.from(
      new Set([...recoveredFatalErrors, ...recoveredWarnings, ...recovery.warnings])
    ),
    recovery_action: recovery.action,
    needs_fallback: recoveredFatalErrors.length > 0,
  };
}

function validateExtractionOutput(value) {
  const errors = [];
  const ingredients = Array.isArray(value?.ingredients_found)
    ? value.ingredients_found
    : [];
  const activeIngredients = ingredients.filter(
    (item) => item.ingredient_type === "active"
  );
  const validActiveIngredients = activeIngredients.filter(isValidActiveIngredient);

  if (value?.is_supplement !== true) {
    errors.push("not_supplement");
  }
  if (!ingredients.length) {
    errors.push("no_ingredients_found");
  }
  if (!activeIngredients.length || !validActiveIngredients.length) {
    errors.push("no_active_ingredients");
  }

  return Array.from(new Set(errors));
}

function collectExtractionWarnings(value) {
  const warnings = [];
  const ingredients = Array.isArray(value?.ingredients_found)
    ? value.ingredients_found
    : [];

  for (const ingredient of ingredients) {
    const dosage = normalizeDosage({
      dosageValue: ingredient.dosage_value,
      dosageUnit: ingredient.dosage_unit,
      dosageOriginalText: ingredient.dosage_original_text,
    });
    if (dosage.invalidReason) {
      warnings.push(dosage.invalidReason);
    }
    if (
      looksMergedIngredient(ingredient.raw_name) ||
      looksMergedIngredient(ingredient.canonical_name)
    ) {
      warnings.push("merged_ingredient_text");
    }
    if (looksOcrUnitNoise(ingredient.dosage_original_text)) {
      warnings.push("ocr_unit_noise");
    }
  }

  return Array.from(new Set(warnings));
}

function handleValidationFailure(parsed, fatalErrors, warnings) {
  if (
    fatalErrors.includes("not_supplement") ||
    fatalErrors.includes("no_ingredients_found") ||
    fatalErrors.includes("no_active_ingredients")
  ) {
    return {
      action: "discard",
      data: parsed,
      warnings: [],
    };
  }

  if (warnings.includes("merged_ingredient_text")) {
    return {
      action: "clean_and_retry",
      data: cleanMergedIngredients(parsed),
      warnings: ["cleaned_merged_ingredient_text"],
    };
  }

  if (warnings.length) {
    return {
      action: "accept_with_flag",
      data: parsed,
      warnings,
    };
  }

  return {
    action: "accept",
    data: parsed,
    warnings: [],
  };
}

function cleanMergedIngredients(parsed) {
  return {
    ...parsed,
    ingredients_found: (parsed.ingredients_found || []).map((ingredient) =>
      cleanMergedIngredient(ingredient)
    ),
  };
}

function cleanMergedIngredient(ingredient) {
  const normalized = normalizeExtractedIngredient(ingredient);
  const rawNameLower = normalizeWhitespace(normalized.raw_name).toLowerCase();
  const canonicalNameLower = normalizeWhitespace(
    normalized.canonical_name
  ).toLowerCase();
  const combined = `${rawNameLower} ${canonicalNameLower}`.trim();

  if (combined.includes("enzyme") && combined.includes("blend")) {
    return {
      ...normalized,
      raw_name: "Digestive enzymes",
      canonical_name: "Digestive enzymes",
      chemical_form: normalized.chemical_form || "enzyme blend",
    };
  }

  return normalized;
}

function isValidActiveIngredient(ingredient) {
  const name = cleanIngredientText(
    ingredient?.canonical_name || ingredient?.raw_name
  );
  return Boolean(name) && name.length > 3;
}

function cleanIngredientText(value) {
  const normalized = normalizeWhitespace(String(value || ""));
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

function normalizeDosage({ dosageValue, dosageUnit, dosageOriginalText }) {
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

  if (!CONFIG.allowedUnits.has(unit)) {
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

function normalizeUnit(value) {
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

function normalizeBroadIngredientName(value) {
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
  while (tokens.length > 1 && removableForms.has(tokens.at(-1))) {
    tokens.pop();
  }

  return tokens.join(" ").trim();
}

function buildSupplementNameLookupKeys(value) {
  const rawValue = trimString(value);
  if (!rawValue) {
    return [];
  }

  const keys = new Set();
  const addKey = (candidate) => {
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

function applyNullableColumnFilter(query, column, value) {
  return value === null || value === undefined
    ? query.is(column, null)
    : query.eq(column, value);
}

function stripDosageFragments(value) {
  return value
    .replace(/\b\d+([.,]\d+)?\s*(mcg|mg|g|ml|iu|cfu|ug|µg|μg)\b/gi, " ")
    .replace(/\bproviding\b.*$/gi, " ")
    .replace(/\(\s*providing[^)]*\)/gi, " ")
    .replace(/\(\s*\d+[^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLabelWrappers(value) {
  return value
    .replace(/\bingredients?\b:?/gi, " ")
    .replace(/\bcontains\b:?/gi, " ")
    .replace(/\bfood supplement\b/gi, " ")
    .replace(/\bsupplement facts\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlainText(value) {
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

function reduceProductForAi(product) {
  return {
    product_id: normalizeId(product?.[CONFIG.columns.products.productId]),
    barcode: normalizeBarcode(product?.[CONFIG.columns.products.barcode]),
    name: normalizeWhitespace(product?.[CONFIG.columns.products.name] || ""),
    ingredients: normalizeWhitespace(
      product?.[CONFIG.columns.products.ingredients] || ""
    ),
  };
}

function buildContentHash(reducedProduct) {
  const content = [
    normalizeBarcode(reducedProduct.barcode),
    normalizePlainText(reducedProduct.name),
    normalizePlainText(reducedProduct.ingredients),
  ].join("|");

  return createHash("sha256").update(content).digest("hex");
}

function buildCustomId(stagePrefix, passType, productId, contentHash) {
  return `${stagePrefix}:${passType}:${productId}:${contentHash}`;
}

function parseCustomId(value) {
  const [stagePrefix, passType, productId, contentHash] = value.split(":");
  return {
    stagePrefix,
    passType,
    productId: normalizeId(productId),
    contentHash: trimString(contentHash),
  };
}

function buildAliasIndex(aliasRows) {
  const index = new Map();

  for (const row of aliasRows) {
    const aliasName = trimString(
      pickFirstValue(row, CONFIG.columns.aliases.aliasNameCandidates)
    );
    const normalizedName =
      trimString(
        pickFirstValue(row, CONFIG.columns.aliases.normalizedNameCandidates)
      ) || normalizeBroadIngredientName(aliasName);
    const supplementId = pickFirstValue(
      row,
      CONFIG.columns.aliases.supplementIdCandidates
    );
    const canonicalName = trimString(
      pickFirstValue(row, CONFIG.columns.aliases.canonicalNameCandidates)
    );

    if (!normalizedName || !supplementId) {
      continue;
    }

    index.set(normalizedName, {
      supplement_id: supplementId,
      alias_name: aliasName,
      canonical_name: canonicalName || aliasName,
    });
  }

  return index;
}

function groupAliasRowsBySupplementId(aliasRows) {
  const grouped = new Map();

  for (const row of aliasRows || []) {
    const supplementId = trimString(
      pickFirstValue(row, CONFIG.columns.aliases.supplementIdCandidates)
    );
    if (!supplementId) {
      continue;
    }

    const current = grouped.get(supplementId) || [];
    current.push(row);
    grouped.set(supplementId, current);
  }

  return grouped;
}

function buildAliasMatchSupplementCatalog({
  approvedSupplements,
  aliasRowsBySupplementId,
}) {
  return (approvedSupplements || [])
    .map((row) => {
      const supplementId = trimString(
        row?.[CONFIG.columns.supplements.supplementId]
      );
      const name = trimString(row?.[CONFIG.columns.supplements.name]);
      if (!supplementId || !name) {
        return null;
      }

      const aliasRows = aliasRowsBySupplementId.get(supplementId) || [];
      const aliasNames = dedupeByKey(
        aliasRows
          .map((aliasRow) =>
            trimString(
              pickFirstValue(aliasRow, CONFIG.columns.aliases.aliasNameCandidates)
            )
          )
          .filter(Boolean),
        (item) => item.toLowerCase()
      );
      const lookupKeys = dedupeByKey(
        [name, ...aliasNames]
          .flatMap((value) => buildSupplementNameLookupKeys(value))
          .filter(Boolean),
        (item) => item
      );

      return {
        supplement_id: supplementId,
        name,
        alias_names: aliasNames,
        lookup_keys: lookupKeys,
      };
    })
    .filter(Boolean);
}

function shortlistSupplementsForAliasMatch({
  candidate,
  supplementCatalog,
  limit = 20,
}) {
  const normalizedName = trimString(candidate?.normalized_name);
  const displayName = trimString(candidate?.display_name);
  const scored = (supplementCatalog || [])
    .map((catalogEntry) => ({
      ...catalogEntry,
      score: scoreSupplementAliasMatchCandidate({
        normalizedName,
        displayName,
        catalogEntry,
      }),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      const byScore = right.score - left.score;
      if (byScore !== 0) {
        return byScore;
      }
      return left.name.localeCompare(right.name);
    });

  return scored.slice(0, Math.max(1, limit));
}

function scoreSupplementAliasMatchCandidate({
  normalizedName,
  displayName,
  catalogEntry,
}) {
  const inputTokens = tokenizeAliasMatchText(normalizedName || displayName);
  const normalizedInput = normalizeBroadIngredientName(normalizedName || displayName);
  let bestScore = 0;

  for (const key of catalogEntry.lookup_keys || []) {
    const normalizedKey = normalizeBroadIngredientName(key);
    if (!normalizedKey) {
      continue;
    }

    let score = 0;
    if (normalizedKey === normalizedInput) {
      score = 100;
    } else if (
      normalizedKey.includes(normalizedInput) ||
      normalizedInput.includes(normalizedKey)
    ) {
      score = 70;
    } else {
      const keyTokens = tokenizeAliasMatchText(normalizedKey);
      const overlapCount = [...inputTokens].filter((token) =>
        keyTokens.has(token)
      ).length;
      if (overlapCount > 0) {
        score = overlapCount * 15;
        if ([...inputTokens][0] && [...inputTokens][0] === [...keyTokens][0]) {
          score += 10;
        }
      }
    }

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

function tokenizeAliasMatchText(value) {
  return new Set(
    normalizeBroadIngredientName(value)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
  );
}

async function requestAliasMatchSuggestion(openAiApiKey, context) {
  const response = await openAiFetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CONFIG.models.aliasMatch,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: ALIAS_MATCH_RESPONSE_SCHEMA,
        },
        messages: [
          {
            role: "system",
            content: buildAliasMatchSystemPrompt(),
          },
          {
            role: "user",
            content: buildAliasMatchUserPrompt(context),
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`[alias-match] ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const rawContent = extractCompletionContent(
    body?.choices?.[0]?.message?.content
  );
  if (!rawContent) {
    throw new Error("[alias-match] OpenAI returned empty content");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`[alias-match] failed to parse JSON: ${rawContent.slice(0, 500)}`);
  }

  return normalizeAliasMatchSuggestion(parsed);
}

function buildAliasMatchSystemPrompt() {
  return [
    "You map unresolved supplement ingredient names to an existing approved supplement record.",
    "Choose only from the provided candidates.",
    "If none of the candidates are clearly the same ingredient, return no_match.",
    "Do not invent supplements or IDs.",
    "Use high confidence only for genuinely strong matches.",
  ].join(" ");
}

function buildAliasMatchUserPrompt({ candidate, shortlist, productsById }) {
  return JSON.stringify(
    {
      unresolved_name: candidate.normalized_name,
      display_name: candidate.display_name,
      occurrence_count: candidate.occurrence_count,
      sample_active_ingredients: (candidate.sample_rows || []).map((row) => ({
        raw_name: row.raw_name,
        canonical_name: row.canonical_name,
        dosage_original_text: row.dosage_original_text,
        chemical_form: row.chemical_form,
      })),
      sample_products: dedupeByKey(
        (candidate.product_ids || [])
          .slice(0, 5)
          .map((productId) => {
            const product = productsById.get(String(productId));
            if (!product) {
              return null;
            }
            return {
              product_id: productId,
              name:
                normalizeWhitespace(
                  product?.[CONFIG.columns.products.name] || ""
                ) || null,
              ingredients:
                normalizeWhitespace(
                  product?.[CONFIG.columns.products.ingredients] || ""
                ) || null,
            };
          })
          .filter(Boolean),
        (item) => String(item.product_id)
      ),
      candidates: shortlist.map((item) => ({
        supplement_id: item.supplement_id,
        name: item.name,
        alias_names: item.alias_names.slice(0, 5),
        lookup_keys: item.lookup_keys.slice(0, 5),
      })),
    },
    null,
    2
  );
}

function normalizeAliasMatchSuggestion(value) {
  const decision =
    trimString(value?.decision) === "match_existing"
      ? "match_existing"
      : "no_match";

  return {
    decision,
    supplement_id: trimString(value?.supplement_id) || null,
    alias: normalizeWhitespace(trimString(value?.alias) || "") || null,
    confidence: clampConfidence(value?.confidence),
    reason: trimString(value?.reason) || "",
  };
}

async function requestAliasTriageSuggestion(openAiApiKey, context) {
  const response = await openAiFetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CONFIG.models.aliasMatch,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: ALIAS_TRIAGE_RESPONSE_SCHEMA,
        },
        messages: [
          {
            role: "system",
            content: buildAliasTriageSystemPrompt(),
          },
          {
            role: "user",
            content: buildAliasTriageUserPrompt(context),
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`[alias-triage] ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const rawContent = extractCompletionContent(
    body?.choices?.[0]?.message?.content
  );
  if (!rawContent) {
    throw new Error("[alias-triage] OpenAI returned empty content");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(
      `[alias-triage] failed to parse JSON: ${rawContent.slice(0, 500)}`
    );
  }

  return normalizeAliasTriageSuggestion(parsed);
}

function buildAliasTriageSystemPrompt() {
  return [
    "You triage unresolved active ingredient names for supplement normalization.",
    "Choose one of two actions only: match_existing or no_match.",
    "Use match_existing only when one provided supplement candidate is clearly the same ingredient.",
    "Use no_match whenever no provided supplement candidate is clearly correct.",
    "Do not invent a supplement_id.",
    "Do not propose creating new supplement records.",
    "Only return high confidence for clear decisions.",
  ].join(" ");
}

function buildAliasTriageUserPrompt({ candidate, shortlist, productsById }) {
  return JSON.stringify(
    {
      unresolved_name: candidate.normalized_name,
      display_name: candidate.display_name,
      occurrence_count: candidate.occurrence_count,
      sample_active_ingredients: (candidate.sample_rows || []).map((row) => ({
        raw_name: row.raw_name,
        canonical_name: row.canonical_name,
        dosage_original_text: row.dosage_original_text,
        chemical_form: row.chemical_form,
      })),
      sample_products: dedupeByKey(
        (candidate.product_ids || [])
          .slice(0, 5)
          .map((productId) => {
            const product = productsById.get(String(productId));
            if (!product) {
              return null;
            }
            return {
              product_id: productId,
              name:
                normalizeWhitespace(
                  product?.[CONFIG.columns.products.name] || ""
                ) || null,
              ingredients:
                normalizeWhitespace(
                  product?.[CONFIG.columns.products.ingredients] || ""
                ) || null,
            };
          })
          .filter(Boolean),
        (item) => String(item.product_id)
      ),
      existing_supplement_candidates: shortlist.map((item) => ({
        supplement_id: item.supplement_id,
        name: item.name,
        alias_names: item.alias_names.slice(0, 5),
        lookup_keys: item.lookup_keys.slice(0, 5),
      })),
    },
    null,
    2
  );
}

function normalizeAliasTriageSuggestion(value) {
  const decision = ["match_existing", "no_match"].includes(
    trimString(value?.decision)
  )
    ? trimString(value?.decision)
    : "no_match";

  return {
    decision,
    supplement_id: trimString(value?.supplement_id) || null,
    supplement_name:
      normalizeWhitespace(trimString(value?.supplement_name) || "") || null,
    alias: normalizeWhitespace(trimString(value?.alias) || "") || null,
    confidence: clampConfidence(value?.confidence),
    reason: trimString(value?.reason) || "",
  };
}

async function requestCatalogReviewSuggestion(openAiApiKey, context) {
  const response = await openAiFetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CONFIG.models.aliasMatch,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: CATALOG_REVIEW_RESPONSE_SCHEMA,
        },
        messages: [
          {
            role: "system",
            content: buildCatalogReviewSystemPrompt(),
          },
          {
            role: "user",
            content: buildCatalogReviewUserPrompt(context),
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `[catalog-review] ${response.status} ${await response.text()}`
    );
  }

  const body = await response.json();
  const rawContent = extractCompletionContent(
    body?.choices?.[0]?.message?.content
  );
  if (!rawContent) {
    throw new Error("[catalog-review] OpenAI returned empty content");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(
      `[catalog-review] failed to parse JSON: ${rawContent.slice(0, 500)}`
    );
  }

  return normalizeCatalogReviewSuggestion(parsed);
}

function buildCatalogReviewSystemPrompt() {
  return [
    "You classify unresolved active supplement ingredient names for canonical catalog review.",
    "Choose one of three actions only: create_canonical, ignore, or manual_review.",
    "Use create_canonical only for specific supplement ingredients that should exist as standalone canonical entries.",
    "Use ignore for generic food ingredients, excipients, carriers, sweeteners, broad macronutrient buckets, and non-canonical noise.",
    "Use manual_review when the name is ambiguous, overly broad, could map to multiple canonical entities, or you are not confident.",
    "For create_canonical, provide a concise canonical supplement name.",
    "Do not invent benefits, evidence, or IDs.",
    "Only return high confidence for clear decisions.",
  ].join(" ");
}

function buildCatalogReviewUserPrompt({ candidate, productsById }) {
  return JSON.stringify(
    {
      unresolved_name: candidate.normalized_name,
      display_name: candidate.display_name,
      occurrence_count: candidate.occurrence_count,
      sample_active_ingredients: (candidate.sample_rows || []).map((row) => ({
        raw_name: row.raw_name,
        canonical_name: row.canonical_name,
        dosage_original_text: row.dosage_original_text,
        chemical_form: row.chemical_form,
      })),
      sample_products: buildCandidateSampleProducts(candidate, productsById),
    },
    null,
    2
  );
}

function normalizeCatalogReviewSuggestion(value) {
  const decision = [
    "create_canonical",
    "ignore",
    "manual_review",
  ].includes(trimString(value?.decision))
    ? trimString(value?.decision)
    : "manual_review";

  return {
    decision,
    suggested_supplement_name:
      normalizeWhitespace(
        trimString(value?.suggested_supplement_name) || ""
      ) || null,
    confidence: clampConfidence(value?.confidence),
    reason: trimString(value?.reason) || "",
  };
}

function buildCandidateSampleProducts(candidate, productsById, limit = 5) {
  return dedupeByKey(
    (candidate?.product_ids || [])
      .slice(0, limit)
      .map((productId) => {
        const product = productsById.get(String(productId));
        if (!product) {
          return null;
        }
        return {
          product_id: productId,
          name:
            normalizeWhitespace(product?.[CONFIG.columns.products.name] || "") ||
            null,
          ingredients:
            normalizeWhitespace(
              product?.[CONFIG.columns.products.ingredients] || ""
            ) || null,
        };
      })
      .filter(Boolean),
    (item) => String(item.product_id)
  );
}

function buildProductIdsByNormalizedNameFromOccurrences(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const normalizedName = trimString(
      row?.[CONFIG.columns.missingSupplementOccurrences.normalizedName]
    );
    const productId = normalizeId(
      row?.[CONFIG.columns.missingSupplementOccurrences.productId]
    );

    if (!normalizedName || !productId) {
      continue;
    }

    const current = map.get(normalizedName) || [];
    if (!current.includes(productId)) {
      current.push(productId);
    }
    map.set(normalizedName, current);
  }

  return map;
}

async function createSupplementRow(supabase, { name, status = "pending" }) {
  const normalizedName = normalizeWhitespace(trimString(name) || "");
  if (!normalizedName) {
    throw new Error("Missing supplement name for creation");
  }

  const row = {
    [CONFIG.columns.supplements.supplementId]: randomUUID(),
    [CONFIG.columns.supplements.name]: normalizedName,
    [CONFIG.columns.supplements.status]: trimString(status) || "pending",
  };

  const { error } = await supabase.from(CONFIG.tables.supplements).insert(row);
  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.supplements}] ${error.message}`);
  }

  return row;
}

async function insertReviewQueueOnce(supabase, productId, reviewType, payload) {
  if (!normalizeId(productId) || !trimString(reviewType)) {
    return;
  }

  const { data, error } = await supabase
    .from(CONFIG.tables.reviewQueue)
    .select(
      [
        CONFIG.columns.reviewQueue.productId,
        CONFIG.columns.reviewQueue.reviewType,
        CONFIG.columns.reviewQueue.status,
      ].join(", ")
    )
    .eq(CONFIG.columns.reviewQueue.productId, productId)
    .eq(CONFIG.columns.reviewQueue.reviewType, reviewType)
    .eq(CONFIG.columns.reviewQueue.status, "pending")
    .limit(1);

  if (error) {
    throw new Error(`[supabase:${CONFIG.tables.reviewQueue}] ${error.message}`);
  }

  if ((data || []).length > 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from(CONFIG.tables.reviewQueue)
    .insert({
      [CONFIG.columns.reviewQueue.productId]: productId,
      [CONFIG.columns.reviewQueue.reviewType]: reviewType,
      [CONFIG.columns.reviewQueue.payload]: sanitizeValueForDatabase(payload),
      [CONFIG.columns.reviewQueue.status]: "pending",
    });

  if (insertError) {
    throw new Error(
      `[supabase:${CONFIG.tables.reviewQueue}] ${insertError.message}`
    );
  }
}

async function insertRowsInChunks(supabase, table, rows, chunkSize = 100) {
  if (!rows.length) {
    return;
  }

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows
      .slice(index, index + chunkSize)
      .map((row) => sanitizeValueForDatabase(row));
    const query =
      table === CONFIG.tables.classification
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: CONFIG.columns.classification.productId,
            })
        : table === CONFIG.tables.missingSupplements
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: CONFIG.columns.missingSupplements.normalizedName,
            })
        : table === CONFIG.tables.missingSupplementOccurrences
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: [
                CONFIG.columns.missingSupplementOccurrences.normalizedName,
                CONFIG.columns.missingSupplementOccurrences.productId,
              ].join(","),
            })
        : table === CONFIG.tables.supplementMaster
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: CONFIG.columns.supplementMaster.productId,
            })
        : table === CONFIG.tables.pipelineJobs
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: [
                CONFIG.columns.pipelineJobs.runId,
                CONFIG.columns.pipelineJobs.waveIndex,
                CONFIG.columns.pipelineJobs.stage,
                CONFIG.columns.pipelineJobs.jobIndex,
              ].join(","),
            })
        : table === CONFIG.tables.naming
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: CONFIG.columns.naming.productId,
            })
        : table === CONFIG.tables.extraction
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: CONFIG.columns.extraction.productId,
            })
        : table === CONFIG.tables.pipelineRetryQueue
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: [
                CONFIG.columns.pipelineRetryQueue.sourceRunId,
                CONFIG.columns.pipelineRetryQueue.sourceWaveIndex,
                CONFIG.columns.pipelineRetryQueue.sourceStage,
                CONFIG.columns.pipelineRetryQueue.sourceJobIndex,
              ].join(","),
            })
        : table === CONFIG.tables.catalogReviewCandidates
        ? supabase
            .from(table)
            .upsert(chunk, {
              onConflict: CONFIG.columns.catalogReviewCandidates.normalizedName,
            })
        : supabase.from(table).insert(chunk);
    const { error } = await query;
    if (error) {
      throw new Error(`[supabase:${table}] ${error.message}`);
    }
  }
}

function sanitizeValueForDatabase(value) {
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValueForDatabase(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeValueForDatabase(nestedValue),
      ])
    );
  }

  return value;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function groupRowsByProductId(rows, productIdColumn) {
  const grouped = new Map();

  for (const row of rows || []) {
    const productId = normalizeId(row?.[productIdColumn]);
    if (!productId) {
      continue;
    }

    const key = String(productId);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  }

  return grouped;
}

function dedupeLatestRowsByProductId(rows, productIdColumn, createdAtColumn) {
  const grouped = groupRowsByProductId(rows, productIdColumn);
  return [...grouped.values()]
    .map((group) => getLatestRow(group, createdAtColumn))
    .filter(Boolean);
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return dedupeByKey(
      value.map((item) => normalizeId(item)).filter(Boolean),
      (item) => String(item)
    );
  }

  const rawValue = trimString(value);
  if (!rawValue) {
    return [];
  }

  return dedupeByKey(
    rawValue
      .split(",")
      .map((item) => normalizeId(item))
      .filter(Boolean),
    (item) => String(item)
  );
}

function normalizePipelineRunRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: trimString(row?.[CONFIG.columns.pipelineRuns.runId]),
    status: trimString(row?.[CONFIG.columns.pipelineRuns.status]),
    requested_waves:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineRuns.requestedWaves]) || 0,
    requested_jobs:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineRuns.requestedJobs]) || 0,
    classify_limit:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineRuns.classifyLimit]) || 0,
    naming_limit:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineRuns.namingLimit]) || 0,
    extract_limit:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineRuns.extractLimit]) || 0,
    alias_limit:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineRuns.aliasLimit]) || 0,
    classify_pass: trimString(row?.[CONFIG.columns.pipelineRuns.classifyPass]),
    naming_pass: trimString(row?.[CONFIG.columns.pipelineRuns.namingPass]),
    extract_pass: trimString(row?.[CONFIG.columns.pipelineRuns.extractPass]),
    start_product_id: normalizeId(
      row?.[CONFIG.columns.pipelineRuns.startProductId]
    ),
    last_completed_product_id: normalizeId(
      row?.[CONFIG.columns.pipelineRuns.lastCompletedProductId]
    ),
    current_wave_index:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineRuns.currentWaveIndex]) || 0,
    created_at: trimString(row?.[CONFIG.columns.pipelineRuns.createdAt]) || null,
    updated_at: trimString(row?.[CONFIG.columns.pipelineRuns.updatedAt]) || null,
    completed_at:
      trimString(row?.[CONFIG.columns.pipelineRuns.completedAt]) || null,
    blocked_at: trimString(row?.[CONFIG.columns.pipelineRuns.blockedAt]) || null,
  };
}

function normalizePipelineJobRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    run_id: trimString(row?.[CONFIG.columns.pipelineJobs.runId]),
    wave_index:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineJobs.waveIndex]) || 0,
    stage: trimString(row?.[CONFIG.columns.pipelineJobs.stage]),
    job_index:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineJobs.jobIndex]) || 0,
    status: trimString(row?.[CONFIG.columns.pipelineJobs.status]),
    pass_type: trimString(row?.[CONFIG.columns.pipelineJobs.passType]) || null,
    start_product_id: normalizeId(
      row?.[CONFIG.columns.pipelineJobs.startProductId]
    ),
    end_product_id: normalizeId(row?.[CONFIG.columns.pipelineJobs.endProductId]),
    row_count:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineJobs.rowCount]) || 0,
    manifest_path:
      trimString(row?.[CONFIG.columns.pipelineJobs.manifestPath]) || null,
    jsonl_path: trimString(row?.[CONFIG.columns.pipelineJobs.jsonlPath]) || null,
    input_file_id:
      trimString(row?.[CONFIG.columns.pipelineJobs.inputFileId]) || null,
    batch_id: trimString(row?.[CONFIG.columns.pipelineJobs.batchId]) || null,
    error_message:
      trimString(row?.[CONFIG.columns.pipelineJobs.errorMessage]) || null,
    retry_count:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineJobs.retryCount]) || 0,
    created_at: trimString(row?.[CONFIG.columns.pipelineJobs.createdAt]) || null,
    updated_at: trimString(row?.[CONFIG.columns.pipelineJobs.updatedAt]) || null,
    submitted_at:
      trimString(row?.[CONFIG.columns.pipelineJobs.submittedAt]) || null,
    completed_at:
      trimString(row?.[CONFIG.columns.pipelineJobs.completedAt]) || null,
  };
}

function normalizePipelineRetryQueueRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: trimString(row?.[CONFIG.columns.pipelineRetryQueue.queueId]),
    source_run_id: trimString(
      row?.[CONFIG.columns.pipelineRetryQueue.sourceRunId]
    ),
    source_wave_index:
      parseOptionalInteger(
        row?.[CONFIG.columns.pipelineRetryQueue.sourceWaveIndex]
      ) || 0,
    source_stage: trimString(
      row?.[CONFIG.columns.pipelineRetryQueue.sourceStage]
    ),
    source_job_index:
      parseOptionalInteger(
        row?.[CONFIG.columns.pipelineRetryQueue.sourceJobIndex]
      ) || 0,
    status: trimString(row?.[CONFIG.columns.pipelineRetryQueue.status]),
    pass_type:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.passType]) || null,
    start_product_id: normalizeId(
      row?.[CONFIG.columns.pipelineRetryQueue.startProductId]
    ),
    end_product_id: normalizeId(
      row?.[CONFIG.columns.pipelineRetryQueue.endProductId]
    ),
    row_count:
      parseOptionalInteger(row?.[CONFIG.columns.pipelineRetryQueue.rowCount]) || 0,
    last_batch_id:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.lastBatchId]) || null,
    last_error_message:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.lastErrorMessage]) || null,
    failure_count:
      parseOptionalInteger(
        row?.[CONFIG.columns.pipelineRetryQueue.failureCount]
      ) || 0,
    retry_attempt_count:
      parseOptionalInteger(
        row?.[CONFIG.columns.pipelineRetryQueue.retryAttemptCount]
      ) || 0,
    created_at:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.createdAt]) || null,
    updated_at:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.updatedAt]) || null,
    first_failed_at:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.firstFailedAt]) || null,
    last_failed_at:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.lastFailedAt]) || null,
    last_retry_at:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.lastRetryAt]) || null,
    resolved_at:
      trimString(row?.[CONFIG.columns.pipelineRetryQueue.resolvedAt]) || null,
  };
}

async function supabaseFetchWithRetry(input, init) {
  return fetchWithRetry(input, init, {
    label: "supabase",
    attempts: CONFIG.supabaseRetryAttempts,
    baseDelayMs: CONFIG.supabaseRetryBaseMs,
    retryForeverOnError: true,
    retryForeverOnResponse: true,
    shouldRetryResponse: (response) =>
      isRetryableHttpStatus(response?.status),
    shouldRetryError: (error) => isRetryableFetchError(error),
  });
}

async function openAiFetchWithRetry(input, init) {
  return fetchWithRetry(input, init, {
    label: "openai",
    attempts: CONFIG.openAiRequestRetryAttempts,
    baseDelayMs: CONFIG.openAiRequestRetryBaseMs,
    retryForeverOnError: true,
    retryForeverOnResponse: true,
    shouldRetryResponse: (response) => isRetryableHttpStatus(response?.status),
    shouldRetryError: (error) => isRetryableFetchError(error),
  });
}

async function fetchWithRetry(input, init, options) {
  const attempts = Math.max(1, options?.attempts || 1);
  const baseDelayMs = Math.max(1, options?.baseDelayMs || 1000);
  let attempt = 1;

  while (true) {
    try {
      const response = await fetch(input, init);
      const shouldRetry = options?.shouldRetryResponse?.(response) || false;
      if (!shouldRetry) {
        return response;
      }

      if (attempt >= attempts && !options?.retryForeverOnResponse) {
        return response;
      }
      console.log(
        `[${options?.label || "fetch"}] retrying after HTTP ${
          response.status
        }`
      );
      await sleep(computeRetryDelayMs(baseDelayMs, attempt));
    } catch (error) {
      const shouldRetry = options?.shouldRetryError?.(error) || false;
      if (!shouldRetry) {
        throw error;
      }
      if (attempt >= attempts && !options?.retryForeverOnError) {
        throw error;
      }
      console.log(
        `[${options?.label || "fetch"}] retrying after network error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await sleep(computeRetryDelayMs(baseDelayMs, attempt));
    }

    attempt += 1;
  }
}

function isRetryableHttpStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRetryableFetchError(error) {
  const message = trimString(error?.message || "");
  if (!message) {
    return false;
  }

  return (
    /ECONNRESET/i.test(message) ||
    /ETIMEDOUT/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /network/i.test(message) ||
    /fetch failed/i.test(message) ||
    /socket hang up/i.test(message)
  );
}

function computeRetryDelayMs(baseDelayMs, attempt) {
  const jitter = Math.floor(Math.random() * baseDelayMs);
  return Math.min(baseDelayMs * 2 ** (attempt - 1) + jitter, 60_000);
}

function buildPipelineJobKey(job) {
  return [
    trimString(job?.run_id),
    parseOptionalInteger(job?.wave_index) || 0,
    trimString(job?.stage),
    parseOptionalInteger(job?.job_index) || 0,
  ].join(":");
}

function buildPipelineStageFailureMessage(stage, jobs) {
  const failedJobs = (jobs || []).filter(
    (job) => trimString(job?.status) === "failed"
  );
  if (!failedJobs.length) {
    return `[${stage}] stage did not complete`;
  }

  const fragments = failedJobs.slice(0, 3).map((job) => {
    const reason = hasExhaustedPipelineJobRecoveryRetries(job)
      ? `retry limit ${CONFIG.pipelineJobRecoveryMaxRetries} reached`
      : trimString(job.error_message) || "unknown error";
    return `job ${job.job_index}: ${reason}`;
  });
  const remaining = failedJobs.length - fragments.length;

  return `[${stage}] ${failedJobs.length} job(s) failed: ${fragments.join(
    " | "
  )}${remaining > 0 ? ` | +${remaining} more` : ""}`;
}

function isOpenAiEnqueuedTokenLimitError(error) {
  const message = trimString(error?.message || error || "");
  return /enqueued token limit reached/i.test(message);
}

function isMissingOpenAiBatchError(error) {
  const message = trimString(error?.message || error || "");
  return /\[batch:[^\]]+\]\s+404\b/i.test(message) || /not found/i.test(message);
}

function isUnreadableOpenAiBatchError(error) {
  const message = trimString(error?.message || error || "");
  return (
    /\[batch:[^\]]+\]\s+401\b/i.test(message) &&
    /api\.batch\.read/i.test(message)
  );
}

function isBatchWaitTimeoutError(error) {
  return error instanceof BatchWaitTimeoutError;
}

async function estimateManifestEnqueuedTokens(manifestPath) {
  const manifest = await readJsonFile(manifestPath);
  const jsonlPath = resolveRequiredPath(
    manifest?.jsonl_path || manifest?.file_path || manifestPath,
    `Missing jsonl for manifest ${manifestPath}`
  );
  const stats = await stat(jsonlPath);
  return Math.max(
    1,
    Math.ceil(stats.size / CONFIG.openAiCharsPerTokenEstimate)
  );
}

async function estimateManifestTokensForJob(job) {
  const manifestPath = trimString(job?.manifest_path);
  if (!manifestPath) {
    return 0;
  }

  return estimateManifestEnqueuedTokens(manifestPath);
}

function getLatestRow(rows, createdAtColumn) {
  return (
    [...(rows || [])].sort((left, right) => {
      const leftValue = trimString(left?.[createdAtColumn]);
      const rightValue = trimString(right?.[createdAtColumn]);
      return rightValue.localeCompare(leftValue);
    })[0] || null
  );
}

function getLatestSuccessfulRow(rows, createdAtColumn) {
  return getLatestRow(
    (rows || []).filter((row) => getPipelineStatus(row) === "succeeded"),
    createdAtColumn
  );
}

function getPipelineState(row) {
  return (
    normalizeObject(row?.[CONFIG.columns.classification.rawResponse]) ||
    normalizeObject(row?.[CONFIG.columns.naming.rawResponse]) ||
    normalizeObject(row?.[CONFIG.columns.extraction.rawResponse]) ||
    {}
  );
}

function getPipelineStatus(row) {
  const fromState = trimString(getPipelineState(row)?.status);
  if (fromState) {
    return fromState;
  }

  if (row?.[CONFIG.columns.extraction.status]) {
    return trimString(row[CONFIG.columns.extraction.status]);
  }

  if (
    row?.[CONFIG.columns.naming.processedAt] ||
    row?.[CONFIG.columns.naming.model]
  ) {
    return "succeeded";
  }

  if (
    row?.[CONFIG.columns.classification.processedAt] ||
    row?.[CONFIG.columns.classification.model]
  ) {
    return "succeeded";
  }

  return "";
}

function getPipelinePassType(row) {
  const fromState = trimString(getPipelineState(row)?.pass_type);
  if (fromState) {
    return fromState;
  }

  const classificationModel = trimString(row?.[CONFIG.columns.classification.model]);
  if (classificationModel) {
    if (classificationModel === CONFIG.models.classify.nano_primary) {
      return "nano_primary";
    }
    if (classificationModel === CONFIG.models.classify.mini_fallback) {
      return "mini_fallback";
    }
  }

  const extractionModel = trimString(row?.[CONFIG.columns.extraction.model]);
  if (extractionModel) {
    if (extractionModel === CONFIG.models.extract.nano_primary) {
      return "nano_primary";
    }
    if (extractionModel === CONFIG.models.extract.mini_fallback) {
      return "mini_fallback";
    }
  }

  const namingModel = trimString(row?.[CONFIG.columns.naming.model]);
  if (namingModel) {
    if (namingModel === CONFIG.models.naming.nano_primary) {
      return "nano_primary";
    }
    if (namingModel === CONFIG.models.naming.mini_fallback) {
      return "mini_fallback";
    }
  }

  return "";
}

function getPipelineCustomId(row) {
  return trimString(getPipelineState(row)?.custom_id);
}

function getPipelineError(row) {
  return trimString(getPipelineState(row)?.error_message);
}

function getParsedOutput(row) {
  return normalizeObject(getPipelineState(row)?.parsed_output);
}

function getDownstreamAction(row) {
  const fromState = trimString(getPipelineState(row)?.downstream_action);
  if (fromState) {
    return fromState;
  }

  if (row?.[CONFIG.columns.classification.model]) {
    return deriveClassificationAction({
      is_supplement: row?.[CONFIG.columns.classification.isSupplement],
      confidence: row?.[CONFIG.columns.classification.confidence],
    });
  }

  return "";
}

function getUsage(row) {
  return normalizeObject(getPipelineState(row)?.usage);
}

function getPipelineFlag(row, key) {
  return getPipelineState(row)?.[key];
}

function getValidationErrors(row) {
  const value = getPipelineState(row)?.validation_errors;
  return Array.isArray(value) ? value : [];
}

function attachUsageModel(usage, model) {
  const normalizedUsage = normalizeObject(usage);
  if (!normalizedUsage) {
    return null;
  }

  return {
    ...normalizedUsage,
    model: trimString(model) || null,
  };
}

function buildActiveIngredientSignature(row) {
  return [
    normalizeId(row?.[CONFIG.columns.activeIngredients.productId]),
    normalizeBroadIngredientName(
      row?.[CONFIG.columns.activeIngredients.canonicalName]
    ),
    normalizeWhitespace(row?.[CONFIG.columns.activeIngredients.rawName] || ""),
    stringifyDosage(
      row?.[CONFIG.columns.activeIngredients.dosageValue],
      row?.[CONFIG.columns.activeIngredients.dosageUnit]
    ),
    trimString(row?.[CONFIG.columns.activeIngredients.chemicalForm]),
    trimString(row?.[CONFIG.columns.activeIngredients.amountBasis]),
  ].join("|");
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawKey, maybeValue] = token.slice(2).split("=", 2);
    if (typeof maybeValue === "string") {
      flags[rawKey] = maybeValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[rawKey] = true;
      continue;
    }

    flags[rawKey] = next;
    index += 1;
  }

  return {
    command: positionals[0] || "",
    flags,
  };
}

function requirePassType(value, allowed) {
  const normalized = trimString(value);
  if (!allowed.includes(normalized)) {
    throw new Error(`Invalid --pass. Allowed values: ${allowed.join(", ")}`);
  }
  return normalized;
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
    global: {
      fetch: supabaseFetchWithRetry,
    },
  });
}

function requireEnv(name, fallback = "") {
  const value = trimString(process.env[name] || fallback);
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function loadDotEnv(envPath, options = {}) {
  let fileText = "";

  try {
    fileText = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of fileText.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const overrideKeys = options?.overrideKeys;
    const key = line.slice(0, separatorIndex).trim();
    const shouldOverride =
      overrideKeys instanceof Set ? overrideKeys.has(key) : false;
    if (!key || (process.env[key] && !shouldOverride)) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function readJsonFile(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonlFile(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function extractCompletionContent(rawContent) {
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

function extractErrorMessage(line) {
  return (
    trimString(line?.error?.message) ||
    trimString(line?.response?.body?.error?.message) ||
    trimString(line?.response?.body?.message) ||
    ""
  );
}

function clampConfidence(value) {
  const numeric = parseOptionalNumber(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function parseOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInteger(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalBoolean(value) {
  const normalized = normalizeWhitespace(String(value ?? "")).toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function resolveLimit(value) {
  const numeric = parseOptionalInteger(value) || CONFIG.defaultBatchSize;
  return clampBatchSize(numeric);
}

function clampBatchSize(value) {
  return Math.max(1, Math.min(CONFIG?.maxBatchSize || 5000, value));
}

function clampBatchSizeRaw(value) {
  return Math.max(1, Math.min(MAX_BATCH_SIZE, value));
}

function resolveRequiredPath(value, message) {
  const normalized = trimString(value);
  if (!normalized) {
    throw new Error(message);
  }
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(PROJECT_ROOT, normalized);
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value) {
  return trimString(String(value ?? "")).replace(/\s+/g, " ");
}

function normalizeBarcode(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function formatFetchFailure(error) {
  if (!error) {
    return "Unknown fetch error";
  }

  const message = error instanceof Error ? error.message : String(error);
  const causeMessage =
    error instanceof Error && error.cause
      ? ` | cause: ${
          error.cause instanceof Error ? error.cause.message : String(error.cause)
        }`
      : "";

  return `${message}${causeMessage}`;
}

function pickFirstValue(row, keys) {
  for (const key of keys) {
    if (row?.[key] != null) {
      return row[key];
    }
  }
  return null;
}

function looksMergedIngredient(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return false;
  if (/[;,]/.test(normalized)) return true;
  if (
    /\b(and|plus|with)\b/.test(normalized) &&
    normalized.split(" ").length > 4
  ) {
    return true;
  }
  return false;
}

function looksOcrUnitNoise(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return /\b\d+([.,]\d+)?\s*pg\b/.test(normalized);
}

function isPlausibleActiveIngredient(ingredient) {
  const name = normalizeWhitespace(
    ingredient.canonical_name || ingredient.raw_name
  );
  return Boolean(name) && name.length >= 3;
}

function stringifyDosage(value, unit) {
  const numeric = parseOptionalNumber(value);
  const normalizedUnit = trimString(unit);
  if (!Number.isFinite(numeric) || !normalizedUnit) {
    return "";
  }
  return `${roundTo(numeric, 6)} ${normalizedUnit}`.trim();
}

function isNormalizedDosageString(value) {
  const normalized = normalizeWhitespace(String(value || ""));
  return /^\d+(\.\d+)?\s+(mcg|mg|g|ml|IU|CFU)$/i.test(normalized);
}

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return roundTo(numerator / denominator, 6);
}

function roundTo(value, precision = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function estimateRowCostUsd(usageByStage) {
  let total = 0;
  let hasAny = false;

  for (const usage of Object.values(usageByStage || {})) {
    if (!usage) {
      continue;
    }
    const model = trimString(usage.model) || "";
    const promptTokens = parseOptionalNumber(usage.prompt_tokens) || 0;
    const completionTokens = parseOptionalNumber(usage.completion_tokens) || 0;
    const pricing = CONFIG.pricingUsdPer1M[model];
    if (!pricing || pricing.input == null || pricing.output == null) {
      continue;
    }

    total += (promptTokens / 1_000_000) * pricing.input;
    total += (completionTokens / 1_000_000) * pricing.output;
    hasAny = true;
  }

  return hasAny ? total : null;
}

function parseJsonArray(value) {
  const parsed = parseOptionalJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function parseOptionalJson(value) {
  const normalized = trimString(value);
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function fileSafeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function nextArtifactSequence() {
  artifactSequence += 1;
  return String(artifactSequence).padStart(4, "0");
}

function buildParallelRunLedgerPath(stage, passType) {
  return path.join(
    CONFIG.tmpDir,
    `${stage}-${passType}-parallel-${fileSafeTimestamp()}-${nextArtifactSequence()}.json`
  );
}

function resolveParallelJobCount(value) {
  return Math.max(1, parseOptionalInteger(value) || CONFIG.defaultParallelJobs);
}

function dedupeByKey(items, getKey) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function buildBlockedCycleResult({
  stage,
  batchId,
  classificationRows = 0,
  namingRows = 0,
  extractionRows = 0,
  lastProductId = null,
}) {
  const result = {
    status: "blocked",
    stage,
    batch_id: trimString(batchId) || null,
    classification_rows: classificationRows,
    naming_rows: namingRows,
    extraction_rows: extractionRows,
    last_product_id: lastProductId || null,
  };

  console.log("[run:cycle] blocked awaiting batch completion", JSON.stringify(result));
  return result;
}

function chunkArray(items, size) {
  const chunkSize = Math.max(1, parseOptionalInteger(size) || 1);
  const output = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    output.push(items.slice(index, index + chunkSize));
  }

  return output;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function csvValue(value) {
  const stringified =
    value == null ? "" : typeof value === "string" ? value : String(value);
  return `"${stringified.replace(/"/g, '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/g).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return rows;
  }

  const headers = parseCsvLine(lines[0]);
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}
