export const VALID_PRODUCT_BENEFIT_DOSE_STATUSES = new Set([
  "above_target_range",
  "below_effective_min",
  "effective_below_target",
  "severely_underdosed",
  "within_target_range",
]);

function clampProductBenefitScore(value) {
  return Math.min(Math.max(value, 0), 100);
}

export function calculateProductBenefitScore({
  rawActiveIngredientBenefitScore,
  validatedDoseFactor,
  doseComparisonStatus,
  doseComparisonValid,
}) {
  if (
    !Number.isFinite(rawActiveIngredientBenefitScore) ||
    !Number.isFinite(validatedDoseFactor) ||
    doseComparisonValid !== true ||
    !VALID_PRODUCT_BENEFIT_DOSE_STATUSES.has(doseComparisonStatus)
  ) {
    return null;
  }

  const rawScore = clampProductBenefitScore(
    rawActiveIngredientBenefitScore,
  );
  return clampProductBenefitScore(rawScore * validatedDoseFactor);
}

export function formatProductBenefitScoreText(productBenefitScore) {
  if (!Number.isFinite(productBenefitScore)) return null;
  return `${Math.round(clampProductBenefitScore(productBenefitScore))}/100`;
}

export function formatProductBenefitScoreValue(productBenefitScore) {
  if (!Number.isFinite(productBenefitScore)) return null;
  return String(Math.round(clampProductBenefitScore(productBenefitScore)));
}

export function getProductBenefitScoreProgress(productBenefitScore) {
  if (!Number.isFinite(productBenefitScore)) return null;
  return clampProductBenefitScore(productBenefitScore) / 100;
}

function normalizeDriverName(value) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLowerCase()
    : "";
}

function normalizeStableIngredientId(driver) {
  const value = [
    driver?.stableIngredientId,
    driver?.canonicalIngredientId,
    driver?.catalogId,
    driver?.id,
  ].find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : "";
}

function compareDrivers(left, right) {
  const compareText = (leftValue, rightValue) =>
    leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  return (
    right.productBenefitScore - left.productBenefitScore ||
    right.rawActiveIngredientBenefitScore -
      left.rawActiveIngredientBenefitScore ||
    right.validatedDoseFactor - left.validatedDoseFactor ||
    compareText(
      left.normalizedIngredientName,
      right.normalizedIngredientName,
    ) ||
    compareText(left.stableIngredientId, right.stableIngredientId)
  );
}

export function selectProductBenefitDriver(ingredientDrivers) {
  const validDrivers = (ingredientDrivers ?? []).flatMap((driver) => {
    const productBenefitScore = calculateProductBenefitScore({
      rawActiveIngredientBenefitScore:
        driver?.rawActiveIngredientBenefitScore,
      validatedDoseFactor: driver?.validatedDoseFactor,
      doseComparisonStatus: driver?.doseComparisonStatus,
      doseComparisonValid: driver?.doseComparisonValid,
    });

    if (!Number.isFinite(productBenefitScore)) return [];

    const canonicalIngredientId =
      typeof driver?.canonicalIngredientId === "string" &&
      driver.canonicalIngredientId.trim()
        ? driver.canonicalIngredientId.trim()
        : null;

    return [{
      ...driver,
      canonicalIngredientId,
      doseComparisonValid: true,
      normalizedIngredientName: normalizeDriverName(driver?.ingredientName),
      productBenefitScore,
      rawActiveIngredientBenefitScore:
        driver.rawActiveIngredientBenefitScore,
      stableIngredientId: normalizeStableIngredientId(driver),
      validatedDoseFactor: driver.validatedDoseFactor,
    }];
  });

  if (!validDrivers.length) return null;

  const [winner] = validDrivers.sort(compareDrivers);
  const { normalizedIngredientName, stableIngredientId, ...driver } = winner;
  return driver;
}
