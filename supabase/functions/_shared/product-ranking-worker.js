import {
  buildProductEvidenceScoreData,
  scoreMatchedIngredientsForProduct,
} from "../../../features/supplements/recommendedDoseScoring.js";
import { selectProductBenefitDriver } from "../../../features/supplements/productBenefitScoring.js";
import { PRODUCT_SCORE_CALCULATION_VERSION } from "../../../features/supplements/productRankingContract.js";

export { PRODUCT_SCORE_CALCULATION_VERSION };
export const MAX_PRODUCT_SCORE_REFRESH_BATCH = 25;
export const MAX_PRODUCT_BENEFIT_ROWS_PER_PRODUCT = 200;
export const RANKING_ELIGIBLE_VERIFICATION_STATUSES = new Set([
  "verified",
  "photo_verified",
  "dsld_verified",
]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = typeof value === "string" && value.trim()
    ? Number(value)
    : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTextKey(value) {
  return trimString(value).replace(/\s+/g, " ").toLowerCase();
}

export function isRankingEligibleVerificationStatus(value) {
  return RANKING_ELIGIBLE_VERIFICATION_STATUSES.has(trimString(value));
}

export function normalizeBoundedProductIds(
  productIds,
  maximum = MAX_PRODUCT_SCORE_REFRESH_BATCH,
) {
  const limit = Math.min(
    MAX_PRODUCT_SCORE_REFRESH_BATCH,
    Math.max(1, Math.floor(finiteNumber(maximum) ?? 1)),
  );
  const seen = new Set();
  const normalized = [];

  for (const value of Array.isArray(productIds) ? productIds : []) {
    const productId = trimString(value);
    if (!productId || seen.has(productId)) continue;
    if (normalized.length >= limit) {
      throw new Error(
        `At most ${limit} canonical product IDs may be refreshed.`,
      );
    }
    seen.add(productId);
    normalized.push(productId);
  }

  return normalized;
}

function buildMatchedIngredient(row, supplement) {
  const ingredientName = trimString(row?.canonical_name) ||
    trimString(row?.display_name) ||
    trimString(supplement?.name) ||
    trimString(row?.raw_name) ||
    "Matched ingredient";

  return {
    stableIngredientId: trimString(row?.id),
    catalogId: trimString(row?.canonical_supplement_id),
    catalogName: trimString(supplement?.name),
    ingredientName,
    ingredientRaw: trimString(row?.raw_name) || ingredientName,
    ingredientNormalized: trimString(row?.canonical_name) || ingredientName,
    dosageValue: finiteNumber(row?.dosage_value),
    dosageUnit: trimString(row?.dosage_unit) || null,
    dosageDisplay: trimString(row?.dosage_original_text) || null,
    chemicalForm: trimString(row?.chemical_form) || null,
    amountBasis: trimString(row?.amount_basis) || null,
  };
}

function buildBenefitRows(scoredIngredients, supplementsById) {
  const driversByBenefit = new Map();

  for (const ingredient of scoredIngredients) {
    const supplement = supplementsById.get(trimString(ingredient?.catalogId));
    const benefits = Array.isArray(supplement?.supplement_benefits)
      ? supplement.supplement_benefits
      : [];

    for (const benefit of benefits) {
      const benefitLabel = trimString(benefit?.label).replace(/\s+/g, " ");
      const benefitKey = normalizeTextKey(benefitLabel);
      const rawScore = finiteNumber(benefit?.score);
      if (!benefitKey || !Number.isFinite(rawScore)) continue;

      const drivers = driversByBenefit.get(benefitKey) ?? [];
      drivers.push({
        benefitLabel,
        canonicalIngredientId: trimString(ingredient?.catalogId) || null,
        stableIngredientId: trimString(ingredient?.stableIngredientId) ||
          trimString(ingredient?.catalogId),
        ingredientName: trimString(ingredient?.ingredientName) ||
          trimString(supplement?.name) ||
          "Matched ingredient",
        rawActiveIngredientBenefitScore: rawScore,
        validatedDoseFactor: Number.isFinite(ingredient?.validatedDoseFactor)
          ? ingredient.validatedDoseFactor
          : null,
        doseComparisonStatus: trimString(ingredient?.doseComparisonStatus) ||
          null,
        doseComparisonValid: ingredient?.doseComparisonValid === true,
      });
      driversByBenefit.set(benefitKey, drivers);
    }
  }

  const rows = [];
  for (const [benefitKey, drivers] of driversByBenefit) {
    const winner = selectProductBenefitDriver(drivers);
    if (!winner) continue;

    rows.push({
      benefitLabel: winner.benefitLabel,
      benefitKey,
      productBenefitScore: winner.productBenefitScore,
      driverCanonicalIngredientId: winner.canonicalIngredientId,
      driverIngredientName: winner.ingredientName,
      rawActiveIngredientBenefitScore: winner.rawActiveIngredientBenefitScore,
      validatedDoseFactor: winner.validatedDoseFactor,
      doseComparisonStatus: winner.doseComparisonStatus,
    });
  }

  const sortedRows = rows.sort(
    (left, right) =>
      left.benefitKey.localeCompare(right.benefitKey) ||
      left.driverCanonicalIngredientId.localeCompare(
        right.driverCanonicalIngredientId,
      ),
  );
  if (sortedRows.length > MAX_PRODUCT_BENEFIT_ROWS_PER_PRODUCT) {
    throw new Error("Product benefit row limit exceeded.");
  }
  return sortedRows;
}

export function buildProductScoreCachePayload({
  masterProduct,
  ingredientRows,
  supplementRows,
  calculationVersion = PRODUCT_SCORE_CALCULATION_VERSION,
  calculatedAt = new Date().toISOString(),
}) {
  const productId = trimString(masterProduct?.product_id);
  if (!productId) return null;

  const supplementsById = new Map(
    (supplementRows ?? [])
      .filter((row) => trimString(row?.id))
      .map((row) => [trimString(row.id), row]),
  );
  const matchedIngredients = (ingredientRows ?? [])
    .filter(
      (row) =>
        trimString(row?.product_id) === productId &&
        supplementsById.has(trimString(row?.canonical_supplement_id)),
    )
    .map((row) =>
      buildMatchedIngredient(
        row,
        supplementsById.get(trimString(row?.canonical_supplement_id)),
      )
    );
  const scoredIngredients = scoreMatchedIngredientsForProduct({
    matchedIngredients,
    supplementsByCatalogId: supplementsById,
    servingSizeText: trimString(masterProduct?.serving_size_text) || null,
  });
  const overallEvidence = buildProductEvidenceScoreData(scoredIngredients);

  return {
    productId,
    calculationVersion: trimString(calculationVersion),
    calculatedAt,
    verificationStatus: trimString(masterProduct?.verification_status),
    rankingEligible: isRankingEligibleVerificationStatus(
      masterProduct?.verification_status,
    ),
    overallEvidenceScore: Number.isFinite(overallEvidence?.evidenceScore)
      ? overallEvidence.evidenceScore
      : null,
    benefitRows: buildBenefitRows(scoredIngredients, supplementsById),
  };
}

async function queryRows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`[${label}] ${error.message}`);
  return data ?? [];
}

export function createSupabaseProductScoreRepository(adminSupabase) {
  return {
    async claim({ limit, workerId, calculationVersion }) {
      const { data, error } = await adminSupabase.rpc(
        "claim_product_score_refresh_queue",
        {
          p_limit: limit,
          p_worker_id: workerId,
          p_calculation_version: calculationVersion,
        },
      );
      if (error) {
        throw new Error(`[claim_product_score_refresh_queue] ${error.message}`);
      }
      return data ?? [];
    },

    async load(productIds) {
      const [masterRows, ingredientRows] = await Promise.all([
        queryRows(
          adminSupabase
            .from("supplement_products_master")
            .select(
              "product_id, display_name, serving_size_text, verification_status",
            )
            .in("product_id", productIds),
          "supplement_products_master",
        ),
        queryRows(
          adminSupabase
            .from("product_active_ingredients")
            .select(
              "id, product_id, canonical_supplement_id, raw_name, canonical_name, display_name, dosage_value, dosage_unit, dosage_original_text, chemical_form, amount_basis",
            )
            .in("product_id", productIds)
            .eq("ingredient_type", "active")
            .not("canonical_supplement_id", "is", null),
          "product_active_ingredients",
        ),
      ]);
      const supplementIds = Array.from(
        new Set(
          ingredientRows
            .map((row) => trimString(row?.canonical_supplement_id))
            .filter(Boolean),
        ),
      );
      const supplementRows = supplementIds.length
        ? await queryRows(
          adminSupabase
            .from("supplements")
            .select(
              "id, name, status, evidence_score, how_to_use, recommended_dose_json, dose_scoring_profile_json, supplement_benefits(label, score)",
            )
            .in("id", supplementIds),
          "supplements",
        )
        : [];

      return { masterRows, ingredientRows, supplementRows };
    },

    async commit(payload, queueId = null) {
      const { error } = await adminSupabase.rpc(
        "commit_product_score_refresh",
        {
          p_product_id: payload.productId,
          p_calculation_version: payload.calculationVersion,
          p_calculated_at: payload.calculatedAt,
          p_overall_evidence_score: payload.overallEvidenceScore,
          p_benefit_rows: payload.benefitRows.map((row) => ({
            benefit_label: row.benefitLabel,
            product_benefit_score: row.productBenefitScore,
            driver_canonical_ingredient_id: row.driverCanonicalIngredientId,
            driver_ingredient_name: row.driverIngredientName,
            raw_active_ingredient_benefit_score:
              row.rawActiveIngredientBenefitScore,
            validated_dose_factor: row.validatedDoseFactor,
            dose_comparison_status: row.doseComparisonStatus,
          })),
          p_queue_id: queueId,
        },
      );
      if (error) {
        throw new Error(`[commit_product_score_refresh] ${error.message}`);
      }
    },

    async retry({ queueId, workerId, errorMessage, retryAfterSeconds }) {
      if (!queueId) return;
      const { error } = await adminSupabase.rpc(
        "retry_product_score_refresh",
        {
          p_queue_id: queueId,
          p_worker_id: workerId,
          p_error: trimString(errorMessage).slice(0, 500),
          p_retry_after_seconds: retryAfterSeconds,
        },
      );
      if (error) {
        throw new Error(`[retry_product_score_refresh] ${error.message}`);
      }
    },
  };
}

function groupByProduct(rows) {
  const grouped = new Map();
  for (const row of rows ?? []) {
    const productId = trimString(row?.product_id);
    if (!productId) continue;
    const values = grouped.get(productId) ?? [];
    values.push(row);
    grouped.set(productId, values);
  }
  return grouped;
}

export async function runProductScoreRefresh({
  repository,
  productIds = null,
  limit = MAX_PRODUCT_SCORE_REFRESH_BATCH,
  workerId = `product-score-worker:${crypto.randomUUID()}`,
  calculationVersion = PRODUCT_SCORE_CALCULATION_VERSION,
  calculatedAt = new Date().toISOString(),
  write = true,
}) {
  const boundedLimit = Math.min(
    MAX_PRODUCT_SCORE_REFRESH_BATCH,
    Math.max(1, Math.floor(finiteNumber(limit) ?? 1)),
  );
  let queueRows = [];
  let boundedProductIds;

  if (Array.isArray(productIds)) {
    boundedProductIds = normalizeBoundedProductIds(productIds, boundedLimit);
  } else {
    if (!write) throw new Error("Queue claims require write mode.");
    queueRows = await repository.claim({
      limit: boundedLimit,
      workerId,
      calculationVersion,
    });
    boundedProductIds = normalizeBoundedProductIds(
      queueRows.map((row) => row?.product_id),
      boundedLimit,
    );
  }

  if (!boundedProductIds.length) {
    return { requested: 0, computed: 0, written: 0, failed: 0, results: [] };
  }

  const queueByProductId = new Map(
    queueRows.map((row) => [trimString(row?.product_id), row]),
  );
  let loaded;
  try {
    loaded = await repository.load(boundedProductIds);
  } catch (error) {
    await Promise.allSettled(
      queueRows.map((row) =>
        repository.retry({
          queueId: trimString(row?.id),
          workerId,
          errorMessage: error instanceof Error ? error.message : String(error),
          retryAfterSeconds: 60,
        })
      ),
    );
    throw error;
  }

  const masterByProductId = new Map(
    (loaded.masterRows ?? []).map((row) => [trimString(row?.product_id), row]),
  );
  const ingredientsByProductId = groupByProduct(loaded.ingredientRows);
  const results = [];
  const retrySafely = async (value) => {
    try {
      await repository.retry(value);
    } catch (retryError) {
      console.error("[product-score-worker] failed to transition queue retry", {
        message: retryError instanceof Error
          ? retryError.message
          : String(retryError),
      });
    }
  };

  for (const productId of boundedProductIds) {
    const queueRow = queueByProductId.get(productId);
    try {
      const payload = buildProductScoreCachePayload({
        masterProduct: masterByProductId.get(productId),
        ingredientRows: ingredientsByProductId.get(productId) ?? [],
        supplementRows: loaded.supplementRows ?? [],
        calculationVersion,
        calculatedAt,
      });
      if (!payload) {
        throw new Error("Canonical master product no longer exists.");
      }
      if (write) {
        await repository.commit(payload, trimString(queueRow?.id) || null);
      }
      results.push({
        productId,
        status: write ? "written" : "computed",
        overallEvidenceScore: payload.overallEvidenceScore,
        benefitCount: payload.benefitRows.length,
        rankingEligible: payload.rankingEligible,
      });
    } catch (error) {
      await retrySafely({
        queueId: trimString(queueRow?.id),
        workerId,
        errorMessage: error instanceof Error ? error.message : String(error),
        retryAfterSeconds: 60,
      });
      results.push({
        productId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    requested: boundedProductIds.length,
    computed: results.filter((result) => result.status !== "failed").length,
    written: results.filter((result) => result.status === "written").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}
