export const PRODUCT_SCORE_CALCULATION_VERSION =
  "recommended-dose-product-ranking.v1";
export const PRODUCT_RANKING_PAGE_LIMIT = 25;
export const PRODUCT_RANKING_MAX_PAGE_LIMIT = 100;

export const BENEFIT_RANKING_ENTITY_TYPES = {
  ACTIVE_INGREDIENT: "active_ingredient",
  PRODUCT: "product",
};

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveBenefitRankingEntityType(value) {
  return trimString(value).toLowerCase() ===
      BENEFIT_RANKING_ENTITY_TYPES.PRODUCT
    ? BENEFIT_RANKING_ENTITY_TYPES.PRODUCT
    : BENEFIT_RANKING_ENTITY_TYPES.ACTIVE_INGREDIENT;
}

export function normalizeProductRankingLimit(value) {
  const parsed = Math.floor(finiteNumber(value) ?? PRODUCT_RANKING_PAGE_LIMIT);
  return Math.min(Math.max(parsed, 1), PRODUCT_RANKING_MAX_PAGE_LIMIT);
}

export function normalizeProductRankingRow(row) {
  const productId = trimString(row?.product_id || row?.productId);
  const productName = trimString(row?.product_name || row?.productName);
  const productBenefitScore = finiteNumber(
    row?.product_benefit_score ?? row?.productBenefitScore,
  );

  if (
    !productId ||
    !productName ||
    !Number.isFinite(productBenefitScore) ||
    productBenefitScore < 0 ||
    productBenefitScore > 100
  ) {
    return null;
  }

  return {
    productId,
    productName,
    normalizedProductName:
      trimString(row?.normalized_product_name || row?.normalizedProductName) ||
      productName.toLowerCase(),
    productBrand: trimString(row?.product_brand) || null,
    productImageUrl:
      trimString(row?.product_image_url || row?.productImageUrl) || null,
    verificationStatus:
      trimString(row?.verification_status || row?.verificationStatus) || null,
    verificationPrecedence: finiteNumber(
      row?.verification_precedence ?? row?.verificationPrecedence,
    ),
    benefitLabel:
      trimString(row?.benefit_label || row?.benefitLabel) || null,
    benefitKey: trimString(row?.benefit_key || row?.benefitKey) || null,
    productBenefitScore,
    overallEvidenceScore: finiteNumber(
      row?.overall_evidence_score ?? row?.overallEvidenceScore,
    ),
    overallEvidenceSortScore: finiteNumber(
      row?.overall_evidence_sort_score ?? row?.overallEvidenceSortScore,
    ),
    driverCanonicalIngredientId:
      trimString(
        row?.driver_canonical_ingredient_id ||
          row?.driverCanonicalIngredientId,
      ) || null,
    driverIngredientName:
      trimString(row?.driver_ingredient_name || row?.driverIngredientName) ||
      null,
    rawActiveIngredientBenefitScore: finiteNumber(
      row?.raw_active_ingredient_benefit_score ??
        row?.rawActiveIngredientBenefitScore,
    ),
    validatedDoseFactor: finiteNumber(
      row?.validated_dose_factor ?? row?.validatedDoseFactor,
    ),
    doseComparisonStatus:
      trimString(row?.dose_comparison_status || row?.doseComparisonStatus) ||
      null,
    calculationVersion:
      trimString(row?.calculation_version || row?.calculationVersion) || null,
    calculatedAt: trimString(row?.calculated_at || row?.calculatedAt) || null,
  };
}

export function buildProductRankingCursor(row) {
  const normalized = normalizeProductRankingRow(row);
  if (
    !normalized ||
    !Number.isFinite(normalized.overallEvidenceSortScore) ||
    !Number.isFinite(normalized.verificationPrecedence) ||
    !normalized.normalizedProductName
  ) {
    return null;
  }

  return {
    productBenefitScore: normalized.productBenefitScore,
    overallEvidenceSortScore: normalized.overallEvidenceSortScore,
    verificationPrecedence: normalized.verificationPrecedence,
    normalizedProductName: normalized.normalizedProductName,
    productId: normalized.productId,
  };
}

export function buildProductRankingRpcArgs({
  benefitLabel,
  calculationVersion = PRODUCT_SCORE_CALCULATION_VERSION,
  limit = PRODUCT_RANKING_PAGE_LIMIT,
  cursor = null,
}) {
  const cursorCandidate = cursor
    ? {
        productBenefitScore: finiteNumber(cursor.productBenefitScore),
        overallEvidenceSortScore: finiteNumber(cursor.overallEvidenceSortScore),
        verificationPrecedence: finiteNumber(cursor.verificationPrecedence),
        normalizedProductName: trimString(cursor.normalizedProductName),
        productId: trimString(cursor.productId),
      }
    : null;
  const normalizedCursor =
    cursorCandidate &&
    Number.isFinite(cursorCandidate.productBenefitScore) &&
    Number.isFinite(cursorCandidate.overallEvidenceSortScore) &&
    Number.isFinite(cursorCandidate.verificationPrecedence) &&
    cursorCandidate.normalizedProductName &&
    cursorCandidate.productId
      ? cursorCandidate
      : null;

  return {
    p_benefit_key: trimString(benefitLabel),
    p_calculation_version: trimString(calculationVersion),
    p_limit: normalizeProductRankingLimit(limit),
    p_after_product_benefit_score:
      normalizedCursor?.productBenefitScore ?? null,
    p_after_overall_evidence_sort_score:
      normalizedCursor?.overallEvidenceSortScore ?? null,
    p_after_verification_precedence:
      normalizedCursor?.verificationPrecedence ?? null,
    p_after_normalized_product_name:
      normalizedCursor?.normalizedProductName || null,
    p_after_product_id: normalizedCursor?.productId || null,
  };
}

export function normalizeProductRankingPage(rows) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const normalized = normalizeProductRankingRow(row);
    return normalized ? [normalized] : [];
  });
}

export function appendProductRankingPage(currentItems, nextItems) {
  const seenProductIds = new Set();
  return [...(currentItems ?? []), ...(nextItems ?? [])].flatMap((item) => {
    const productId = trimString(item?.productId);
    if (!productId || seenProductIds.has(productId)) return [];
    seenProductIds.add(productId);
    return [item];
  });
}
