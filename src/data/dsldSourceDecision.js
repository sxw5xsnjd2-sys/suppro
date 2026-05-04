function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const SUPPLEMENT_DOSE_PATTERN =
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|ug|μg|g|iu|cfu|billion|million|ml)\b/i;

export function hasUsefulSupplementFactsData(product) {
  const ingredientsText = trimString(product?.ingredientsText);
  const sourceIngredients = Array.isArray(product?.sourceIngredients)
    ? product.sourceIngredients
    : [];

  if (SUPPLEMENT_DOSE_PATTERN.test(ingredientsText)) {
    return true;
  }

  return sourceIngredients.some((ingredient) => {
    if (typeof ingredient === "string") {
      return SUPPLEMENT_DOSE_PATTERN.test(ingredient);
    }

    if (!ingredient || typeof ingredient !== "object") {
      return false;
    }

    const dosageValue =
      typeof ingredient.dosageValue === "number" && Number.isFinite(ingredient.dosageValue)
        ? ingredient.dosageValue
        : typeof ingredient.dosage_value === "number" &&
          Number.isFinite(ingredient.dosage_value)
        ? ingredient.dosage_value
        : null;
    const dosageUnit =
      trimString(ingredient.dosageUnit) || trimString(ingredient.dosage_unit);

    if (Number.isFinite(dosageValue) && dosageUnit) {
      return true;
    }

    const rawText = [
      trimString(ingredient.name),
      trimString(ingredient.rawName),
      trimString(ingredient.raw_name),
      trimString(ingredient.dosageDisplay),
      trimString(ingredient.dosage_display),
      trimString(ingredient.dosageOriginalText),
      trimString(ingredient.dosage_original_text),
    ]
      .filter(Boolean)
      .join(" ");

    return SUPPLEMENT_DOSE_PATTERN.test(rawText);
  });
}

export function getOpenFoodFactsQuality(product) {
  if (!product || typeof product !== "object") {
    return "missing";
  }

  if (!trimString(product.productName)) {
    return "low";
  }

  if (!trimString(product.ingredientsText)) {
    return "low";
  }

  if (!hasUsefulSupplementFactsData(product)) {
    return "low";
  }

  return "good";
}

export function shouldCheckDsld({
  barcode,
  featureEnabled,
  primaryProduct,
  openFoodFactsQuality,
}) {
  if (!trimString(barcode) || !featureEnabled) {
    return false;
  }

  if (
    trimString(primaryProduct?.scanDataSource) &&
    trimString(primaryProduct?.scanDataSource) !== "open_food_facts"
  ) {
    return false;
  }

  return openFoodFactsQuality !== "good";
}

export function buildScanDebugMetadata({
  offFound,
  offQuality,
  dsldChecked,
  dsldCacheHit,
  dsldConfidence,
  finalSourceUsed,
}) {
  return {
    off_found: Boolean(offFound),
    off_quality: offQuality || "missing",
    dsld_checked: Boolean(dsldChecked),
    dsld_cache_hit: Boolean(dsldCacheHit),
    dsld_confidence: dsldConfidence || null,
    final_source_used: finalSourceUsed || "unknown",
  };
}
