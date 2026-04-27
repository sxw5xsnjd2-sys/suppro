const BLEND_CORE_INGREDIENT_LIMIT = 3;
const BLEND_CORE_WEIGHT = 0.8;
const BLEND_TAIL_WEIGHT = 0.2;
const COMPARABLE_UNITS = new Set(["mcg", "mg", "ml", "IU", "CFU"]);
const UNIT_ALIASES = {
  ug: "mcg",
  "µg": "mcg",
  "μg": "mcg",
  iu: "IU",
  cfu: "CFU",
};
const SERVING_BASIS_KEYWORDS = {
  per_capsule: ["capsule", "capsules", "cap", "caps"],
  per_tablet: ["tablet", "tablets", "tab", "tabs"],
  per_softgel: ["softgel", "softgels"],
  per_scoop: ["scoop", "scoops"],
};
const DOSE_BANDS = {
  OPTIMAL: "optimal",
  EFFECTIVE_BELOW_TARGET: "effective_below_target",
  UNDERDOSED: "underdosed",
  SEVERELY_UNDERDOSED: "severely_underdosed",
  ABOVE_TARGET: "above_target",
  UNKNOWN: "unknown",
};
const DEFAULT_EFFECTIVE_MIN_FRACTION = 0.6;
const HOW_TO_USE_MULTIPLIERS = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
};
const VITAMIN_D_IU_PER_MCG = 40;
const HOW_TO_USE_FORM_ONLY_PATTERNS = [
  /\bcapsule(?:s)?\b/i,
  /\btablet(?:s)?\b/i,
  /\bsoftgel(?:s)?\b/i,
  /\bscoop(?:s)?\b/i,
  /\bdrop(?:s)?\b/i,
];

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumberString(value) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return "";
  }

  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) {
    return trimmed.replace(/,/g, "");
  }

  if (/^\d+,\d+$/.test(trimmed) && !trimmed.includes(".")) {
    return trimmed.replace(",", ".");
  }

  return trimmed.replace(/,/g, "");
}

function parseOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(normalizeNumberString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value, decimals = 6) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function interpolate(start, end, progress) {
  return start + (end - start) * clamp(progress, 0, 1);
}

function computeMean(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeBlendEvidenceScore(values) {
  const scores = (values ?? [])
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left);

  if (!scores.length) {
    return null;
  }

  if (scores.length <= BLEND_CORE_INGREDIENT_LIMIT) {
    return computeMean(scores);
  }

  const coreScores = scores.slice(0, BLEND_CORE_INGREDIENT_LIMIT);
  const tailScores = scores.slice(BLEND_CORE_INGREDIENT_LIMIT);
  const coreMean = computeMean(coreScores);
  const tailMean = computeMean(tailScores);

  if (!Number.isFinite(tailMean)) {
    return coreMean;
  }

  return coreMean * BLEND_CORE_WEIGHT + tailMean * BLEND_TAIL_WEIGHT;
}

function formatDisplayNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const rounded = roundTo(value, 3);
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}

function formatDoseText(value, unit) {
  if (!Number.isFinite(value) || !unit) {
    return null;
  }

  let displayValue = value;
  let displayUnit = unit;

  if (unit === "mcg" && Math.abs(value) >= 1000) {
    displayValue = value / 1000;
    displayUnit = "mg";
  } else if (unit === "mg" && Math.abs(value) >= 1000) {
    displayValue = value / 1000;
    displayUnit = "g";
  }

  const formattedValue = formatDisplayNumber(displayValue);
  return formattedValue ? `${formattedValue} ${displayUnit}` : null;
}

function normalizeValueForComparableUnit(value, originalUnit, expectedUnit) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const normalized = normalizeComparableDose({
    value,
    unit: originalUnit,
  });

  if (!normalized) {
    return null;
  }

  if (expectedUnit && normalized.unit !== expectedUnit) {
    return null;
  }

  return normalized.value;
}

function matchesVitaminDIdentifier(value) {
  const normalized = trimString(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  return /\bvitamin d\b|\bvitamin d2\b|\bvitamin d3\b|\bd2\b|\bd3\b|\bcholecalciferol\b|\bergocalciferol\b/.test(
    normalized
  );
}

function isVitaminDMatch(match, supplement) {
  return [
    match?.ingredientName,
    match?.ingredientRaw,
    match?.catalogName,
    supplement?.name,
  ].some(matchesVitaminDIdentifier);
}

function convertVitaminDDose(value, fromUnit, toUnit) {
  if (!Number.isFinite(value) || fromUnit === toUnit) {
    return Number.isFinite(value) ? roundTo(value) : null;
  }

  if (fromUnit === "mcg" && toUnit === "IU") {
    return roundTo(value * VITAMIN_D_IU_PER_MCG);
  }

  if (fromUnit === "IU" && toUnit === "mcg") {
    return roundTo(value / VITAMIN_D_IU_PER_MCG);
  }

  return null;
}

function alignDoseUnitsForIngredient({
  normalizedServingDose,
  doseScoringProfile,
  match,
  supplement,
}) {
  if (!normalizedServingDose || !doseScoringProfile) {
    return normalizedServingDose;
  }

  if (normalizedServingDose.unit === doseScoringProfile.unit) {
    return normalizedServingDose;
  }

  if (!isVitaminDMatch(match, supplement)) {
    return normalizedServingDose;
  }

  const convertedValue = convertVitaminDDose(
    normalizedServingDose.value,
    normalizedServingDose.unit,
    doseScoringProfile.unit
  );

  if (!Number.isFinite(convertedValue)) {
    return normalizedServingDose;
  }

  return {
    ...normalizedServingDose,
    value: convertedValue,
    unit: doseScoringProfile.unit,
    convertedFromUnit: normalizedServingDose.unit,
  };
}

export function normalizeDoseUnit(value) {
  const normalized = trimString(value).replace(/[µμ]/g, "μ");
  if (!normalized) return null;

  const lowered = normalized.toLowerCase();
  if (UNIT_ALIASES[normalized]) {
    return UNIT_ALIASES[normalized];
  }
  if (UNIT_ALIASES[lowered]) {
    return UNIT_ALIASES[lowered];
  }
  if (lowered === "mg") return "mg";
  if (lowered === "g") return "g";
  if (lowered === "ml") return "ml";
  return normalized;
}

export function normalizeComparableDose({ value, unit }) {
  const parsedValue = parseOptionalNumber(value);
  const normalizedUnit = normalizeDoseUnit(unit);

  if (!Number.isFinite(parsedValue) || !normalizedUnit) {
    return null;
  }

  if (normalizedUnit === "g") {
    return {
      value: roundTo(parsedValue * 1000),
      unit: "mg",
    };
  }

  if (normalizedUnit === "mg" && Math.abs(parsedValue) < 1) {
    return {
      value: roundTo(parsedValue * 1000),
      unit: "mcg",
    };
  }

  if (!COMPARABLE_UNITS.has(normalizedUnit)) {
    return null;
  }

  return {
    value: roundTo(parsedValue),
    unit: normalizedUnit,
  };
}

function buildRecommendedDosePayload(recommendedDose) {
  if (!recommendedDose || typeof recommendedDose !== "object") {
    return null;
  }

  const minValue = parseOptionalNumber(recommendedDose.per_intake_min_value);
  const maxValue = parseOptionalNumber(recommendedDose.per_intake_max_value);
  const normalizedUnit = normalizeDoseUnit(recommendedDose.unit);
  const frequencyMin = parseOptionalNumber(
    recommendedDose.frequency_min_per_day
  );
  const frequencyMax = parseOptionalNumber(
    recommendedDose.frequency_max_per_day
  );
  const normalizedDose = normalizeComparableDose({
    value: Number.isFinite(minValue) ? minValue : maxValue,
    unit: normalizedUnit,
  });

  if (!normalizedDose) {
    return null;
  }

  const unit = normalizedDose.unit;
  const normalizedMin = normalizeValueForComparableUnit(minValue, normalizedUnit, unit);
  const normalizedMax = normalizeValueForComparableUnit(maxValue, normalizedUnit, unit);

  return {
    sourceText: trimString(recommendedDose.source_text) || null,
    confidence: parseOptionalNumber(recommendedDose.confidence),
    parserMethod: trimString(recommendedDose.parser_method) || null,
    minValue: Number.isFinite(normalizedMin)
      ? normalizedMin
      : normalizedDose.value,
    maxValue: Number.isFinite(normalizedMax) ? normalizedMax : null,
    unit,
    frequencyMinPerDay: Number.isFinite(frequencyMin) ? frequencyMin : null,
    frequencyMaxPerDay: Number.isFinite(frequencyMax) ? frequencyMax : null,
    flags: Array.isArray(recommendedDose.flags)
      ? recommendedDose.flags.map((item) => trimString(item)).filter(Boolean)
      : [],
  };
}

function buildDoseScoringProfilePayload(profile) {
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const originalUnit = normalizeDoseUnit(profile.unit);
  const effectiveMinValue = parseOptionalNumber(profile.effective_min_value);
  const targetMinValue = parseOptionalNumber(profile.target_min_value);
  const targetMaxValue = parseOptionalNumber(profile.target_max_value);
  const initialComparableDose = normalizeComparableDose({
    value: Number.isFinite(targetMinValue)
      ? targetMinValue
      : Number.isFinite(effectiveMinValue)
      ? effectiveMinValue
      : targetMaxValue,
    unit: originalUnit,
  });

  if (!initialComparableDose) {
    return null;
  }

  const unit = initialComparableDose.unit;
  const normalizedEffectiveMin = normalizeValueForComparableUnit(
    effectiveMinValue,
    originalUnit,
    unit
  );
  const normalizedTargetMin = normalizeValueForComparableUnit(
    targetMinValue,
    originalUnit,
    unit
  );
  const normalizedTargetMax = normalizeValueForComparableUnit(
    targetMaxValue,
    originalUnit,
    unit
  );
  const resolvedTargetMin = Number.isFinite(normalizedTargetMin)
    ? normalizedTargetMin
    : Number.isFinite(normalizedEffectiveMin)
    ? normalizedEffectiveMin
    : initialComparableDose.value;
  const resolvedEffectiveMin = Number.isFinite(normalizedEffectiveMin)
    ? normalizedEffectiveMin
    : resolvedTargetMin;

  return {
    effectiveMinValue: resolvedEffectiveMin,
    targetMinValue: resolvedTargetMin,
    targetMaxValue:
      Number.isFinite(normalizedTargetMax) &&
      normalizedTargetMax >= resolvedTargetMin
        ? normalizedTargetMax
        : null,
    unit,
    source: trimString(profile.source) || "curated_override",
    notes: trimString(profile.notes) || null,
    flags: [],
  };
}

function splitHowToUseFragments(text) {
  return trimString(text)
    .split(/\r?\n|[;•]+|(?<=\.)\s+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function scoreHowToUseFragment(fragment) {
  const value = trimString(fragment);

  if (!value) {
    return 0;
  }

  let score = 0;

  if (/\b\d+(?:[.,]\d+)?\s*(?:mcg|mg|g|ml|iu|cfu)\b/i.test(value)) {
    score += 60;
  }
  if (/\b(?:take|use|dosage|suggested use|direction(?:s)?)\b/i.test(value)) {
    score += 15;
  }
  if (/\b(?:once|twice|daily|times daily|per day)\b/i.test(value)) {
    score += 10;
  }
  if (HOW_TO_USE_FORM_ONLY_PATTERNS.some((pattern) => pattern.test(value))) {
    score += 5;
  }

  return score;
}

function selectHowToUseDoseFragment(text) {
  const fragments = splitHowToUseFragments(text);

  if (!fragments.length) {
    return null;
  }

  const bestMatch = fragments
    .map((fragment) => ({
      fragment,
      score: scoreHowToUseFragment(fragment),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (!bestMatch || bestMatch.score <= 0) {
    return null;
  }

  return bestMatch.fragment;
}

function parseHowToUseDoseAmount(valueText, multiplierWord) {
  const parsedValue = parseOptionalNumber(valueText);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  const multiplier =
    HOW_TO_USE_MULTIPLIERS[trimString(multiplierWord).toLowerCase()] ?? 1;

  return parsedValue * multiplier;
}

function normalizeDoseMatch(value) {
  if (!value) {
    return null;
  }

  const minDose = normalizeComparableDose({
    value: value.minValue,
    unit: value.unit,
  });
  const maxDose = Number.isFinite(value.maxValue)
    ? normalizeComparableDose({
        value: value.maxValue,
        unit: value.unit,
      })
    : null;

  if (!minDose) {
    return null;
  }

  return {
    minValue: minDose.value,
    maxValue:
      maxDose?.unit === minDose.unit && Number.isFinite(maxDose.value)
        ? maxDose.value
        : null,
    unit: minDose.unit,
  };
}

function parseComparableDoseMatchesFromHowToUse(fragment) {
  const value = trimString(fragment);

  if (!value) {
    return [];
  }

  const matches = [];
  const occupiedRanges = [];
  const rangePattern =
    /(\d+(?:[.,]\d+)?)\s*(thousand|million|billion)?\s*(?:-|–|—|to)\s*(\d+(?:[.,]\d+)?)\s*(thousand|million|billion)?\s*(mcg|mg|g|ml|iu|cfu)\b/gi;
  const singlePattern =
    /(\d+(?:[.,]\d+)?)\s*(thousand|million|billion)?\s*(mcg|mg|g|ml|iu|cfu)\b/gi;

  let match;

  while ((match = rangePattern.exec(value)) !== null) {
    const normalized = normalizeDoseMatch({
      minValue: parseHowToUseDoseAmount(match[1], match[2]),
      maxValue: parseHowToUseDoseAmount(match[3], match[4]),
      unit: match[5],
    });

    if (!normalized) {
      continue;
    }

    occupiedRanges.push([match.index, match.index + match[0].length]);
    matches.push(normalized);
  }

  while ((match = singlePattern.exec(value)) !== null) {
    const insideRange = occupiedRanges.some(
      ([start, end]) => match.index >= start && match.index < end
    );

    if (insideRange) {
      continue;
    }

    const normalized = normalizeDoseMatch({
      minValue: parseHowToUseDoseAmount(match[1], match[2]),
      maxValue: null,
      unit: match[3],
    });

    if (!normalized) {
      continue;
    }

    matches.push(normalized);
  }

  const dedupedMatches = new Map();

  matches.forEach((item) => {
    const key = `${item.minValue}|${item.maxValue ?? ""}|${item.unit}`;

    if (!dedupedMatches.has(key)) {
      dedupedMatches.set(key, item);
    }
  });

  return Array.from(dedupedMatches.values());
}

function parseHowToUseFrequency(fragment) {
  const value = trimString(fragment).toLowerCase();

  if (!value) {
    return {
      minPerDay: null,
      maxPerDay: null,
    };
  }

  const rangeMatch = value.match(
    /(\d+(?:[.,]\d+)?)\s*(?:-|to)\s*(\d+(?:[.,]\d+)?)\s*(?:times?|x)\s*(?:daily|per day)/
  );

  if (rangeMatch) {
    return {
      minPerDay: parseOptionalNumber(rangeMatch[1]),
      maxPerDay: parseOptionalNumber(rangeMatch[2]),
    };
  }

  const numericMatch = value.match(
    /(\d+(?:[.,]\d+)?)\s*(?:times?|x)\s*(?:daily|per day)/
  );

  if (numericMatch) {
    const parsed = parseOptionalNumber(numericMatch[1]);

    return {
      minPerDay: parsed,
      maxPerDay: parsed,
    };
  }

  if (/\bonce daily\b|\bonce per day\b|\bdaily\b|\beach day\b/.test(value)) {
    return {
      minPerDay: 1,
      maxPerDay: 1,
    };
  }

  if (/\btwice daily\b|\btwice per day\b/.test(value)) {
    return {
      minPerDay: 2,
      maxPerDay: 2,
    };
  }

  if (/\bthree times daily\b|\bthrice daily\b/.test(value)) {
    return {
      minPerDay: 3,
      maxPerDay: 3,
    };
  }

  return {
    minPerDay: null,
    maxPerDay: null,
  };
}

function parseRecommendedDoseFromHowToUseText(howToUse) {
  const fragment = selectHowToUseDoseFragment(howToUse);

  if (!fragment) {
    return null;
  }

  const doseMatches = parseComparableDoseMatchesFromHowToUse(fragment);

  if (doseMatches.length !== 1) {
    return null;
  }

  const [doseMatch] = doseMatches;
  const frequency = parseHowToUseFrequency(fragment);

  return buildRecommendedDosePayload({
    source_text: fragment,
    confidence: 0.85,
    parser_method: "runtime_rule",
    per_intake_min_value: doseMatch.minValue,
    per_intake_max_value: doseMatch.maxValue,
    unit: doseMatch.unit,
    frequency_min_per_day: frequency.minPerDay,
    frequency_max_per_day: frequency.maxPerDay,
    flags: [],
  });
}

function getRecommendedDoseForSupplement(supplement) {
  const structuredDose = buildRecommendedDosePayload(
    supplement?.recommended_dose_json
  );

  if (structuredDose) {
    return structuredDose;
  }

  return parseRecommendedDoseFromHowToUseText(supplement?.how_to_use);
}

function getDoseScoringProfileForSupplement(supplement, recommendedDose) {
  const overrideProfile = buildDoseScoringProfilePayload(
    supplement?.dose_scoring_profile_json
  );

  if (overrideProfile) {
    return overrideProfile;
  }

  if (!recommendedDose) {
    return null;
  }

  const effectiveMinValue = roundTo(
    recommendedDose.minValue * DEFAULT_EFFECTIVE_MIN_FRACTION
  );

  return {
    effectiveMinValue,
    targetMinValue: recommendedDose.minValue,
    targetMaxValue: recommendedDose.maxValue,
    unit: recommendedDose.unit,
    source: "recommended_dose_fallback",
    notes: `Derived from recommended dose floor using ${
      DEFAULT_EFFECTIVE_MIN_FRACTION * 100
    }% as the effective minimum.`,
    flags: [...(recommendedDose.flags ?? [])],
  };
}

function extractServingSizeMultiplier(servingSizeText, amountBasis) {
  if (amountBasis === "per_serving") {
    return { multiplier: 1, flags: [] };
  }

  const keywords = SERVING_BASIS_KEYWORDS[amountBasis];
  if (!keywords?.length) {
    return {
      multiplier: null,
      flags: amountBasis ? ["unknown_amount_basis"] : ["missing_amount_basis"],
    };
  }

  const normalizedText = trimString(servingSizeText);
  if (!normalizedText) {
    return {
      multiplier: null,
      flags: ["missing_serving_size_text"],
    };
  }

  for (const keyword of keywords) {
    const match = normalizedText.match(
      new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${keyword}\\b`, "i")
    );
    if (!match) {
      continue;
    }

    const multiplier = parseOptionalNumber(match[1]);
    if (Number.isFinite(multiplier) && multiplier > 0) {
      return {
        multiplier,
        flags: [],
      };
    }
  }

  return {
    multiplier: null,
    flags: ["serving_size_unparseable"],
  };
}

function normalizeServingDose(match, servingSizeText) {
  const normalizedDose = normalizeComparableDose({
    value: match?.dosageValue,
    unit: match?.dosageUnit,
  });

  if (!normalizedDose) {
    return {
      normalizedServingDose: null,
      flags: ["missing_actual_dose"],
      status: "missing_actual_dose",
    };
  }

  const amountBasis = trimString(match?.amountBasis) || "unknown";
  const { multiplier, flags } = extractServingSizeMultiplier(
    servingSizeText,
    amountBasis
  );

  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return {
      normalizedServingDose: null,
      flags,
      status:
        flags[0] === "unknown_amount_basis" ||
        flags[0] === "missing_amount_basis"
          ? "unknown_amount_basis"
          : "serving_size_unparseable",
    };
  }

  return {
    normalizedServingDose: {
      value: roundTo(normalizedDose.value * multiplier),
      unit: normalizedDose.unit,
      amountBasis,
      multiplier,
    },
    flags,
    status: "comparable",
  };
}

function compareDoseToDoseScoringProfile({
  normalizedServingDose,
  doseScoringProfile,
}) {
  if (!doseScoringProfile) {
    return {
      doseFactor: 1,
      status: "missing_dose_scoring_profile",
      doseBand: DOSE_BANDS.UNKNOWN,
      scoreAdjustmentReasonCode: DOSE_BANDS.UNKNOWN,
      flags: ["missing_dose_scoring_profile"],
    };
  }

  if (!normalizedServingDose) {
    return {
      doseFactor: 1,
      status: "missing_actual_dose",
      doseBand: DOSE_BANDS.UNKNOWN,
      scoreAdjustmentReasonCode: DOSE_BANDS.UNKNOWN,
      flags: ["missing_actual_dose"],
    };
  }

  if (normalizedServingDose.unit !== doseScoringProfile.unit) {
    return {
      doseFactor: 1,
      status: "unit_mismatch",
      doseBand: DOSE_BANDS.UNKNOWN,
      scoreAdjustmentReasonCode: DOSE_BANDS.UNKNOWN,
      flags: ["unit_mismatch"],
    };
  }

  const actualValue = normalizedServingDose.value;
  const targetMinValue = doseScoringProfile.targetMinValue;
  const targetMaxValue = doseScoringProfile.targetMaxValue;
  const effectiveMinValue = doseScoringProfile.effectiveMinValue;
  const halfEffectiveMinValue = effectiveMinValue * 0.5;

  if (Number.isFinite(targetMaxValue) && actualValue > targetMaxValue) {
    return {
      doseFactor: 0.95,
      status: "above_target_range",
      doseBand: DOSE_BANDS.ABOVE_TARGET,
      scoreAdjustmentReasonCode: DOSE_BANDS.ABOVE_TARGET,
      flags: ["above_target_range"],
    };
  }

  if (actualValue >= targetMinValue) {
    return {
      doseFactor: 1,
      status: "within_target_range",
      doseBand: DOSE_BANDS.OPTIMAL,
      scoreAdjustmentReasonCode: DOSE_BANDS.OPTIMAL,
      flags: [],
    };
  }

  if (actualValue >= effectiveMinValue) {
    const progress =
      targetMinValue > effectiveMinValue
        ? (actualValue - effectiveMinValue) /
          (targetMinValue - effectiveMinValue)
        : 0;

    return {
      doseFactor: roundTo(interpolate(0.95, 1, progress), 4),
      status: "effective_below_target",
      doseBand: DOSE_BANDS.EFFECTIVE_BELOW_TARGET,
      scoreAdjustmentReasonCode: DOSE_BANDS.EFFECTIVE_BELOW_TARGET,
      flags: ["effective_below_target"],
    };
  }

  if (actualValue >= halfEffectiveMinValue && halfEffectiveMinValue > 0) {
    const progress =
      effectiveMinValue > halfEffectiveMinValue
        ? (actualValue - halfEffectiveMinValue) /
          (effectiveMinValue - halfEffectiveMinValue)
        : 0;

    return {
      doseFactor: roundTo(interpolate(0.75, 0.95, progress), 4),
      status: "below_effective_min",
      doseBand: DOSE_BANDS.UNDERDOSED,
      scoreAdjustmentReasonCode: DOSE_BANDS.UNDERDOSED,
      flags: ["below_effective_min"],
    };
  }

  const progress =
    halfEffectiveMinValue > 0 ? actualValue / halfEffectiveMinValue : 0;

  return {
    doseFactor: roundTo(interpolate(0.4, 0.75, progress), 4),
    status: "severely_underdosed",
    doseBand: DOSE_BANDS.SEVERELY_UNDERDOSED,
    scoreAdjustmentReasonCode: DOSE_BANDS.SEVERELY_UNDERDOSED,
    flags: ["severely_underdosed"],
  };
}

function buildDoseStatusLabel({ doseBand, doseComparisonStatus }) {
  if (doseBand === DOSE_BANDS.OPTIMAL) {
    return "Meets target dose";
  }

  if (doseBand === DOSE_BANDS.EFFECTIVE_BELOW_TARGET) {
    return "Effective, slightly below target";
  }

  if (doseBand === DOSE_BANDS.UNDERDOSED) {
    return "Underdosed";
  }

  if (doseBand === DOSE_BANDS.SEVERELY_UNDERDOSED) {
    return "Severely underdosed";
  }

  if (doseBand === DOSE_BANDS.ABOVE_TARGET) {
    return "Above target range";
  }

  if (doseComparisonStatus === "missing_dose_scoring_profile") {
    return "Dose target unavailable";
  }

  if (doseComparisonStatus === "missing_actual_dose") {
    return "Dose unavailable";
  }

  if (doseComparisonStatus === "serving_size_unparseable") {
    return "Dose unavailable";
  }

  if (doseComparisonStatus === "unknown_amount_basis") {
    return "Dose unavailable";
  }

  if (doseComparisonStatus === "unit_mismatch") {
    return "Dose unavailable";
  }

  return "Dose not scored";
}

function buildDoseComparisonSummary({
  doseBand,
  doseComparisonStatus,
  normalizedServingDose,
  doseScoringProfile,
}) {
  const actualDoseText = formatDoseText(
    normalizedServingDose?.value,
    normalizedServingDose?.unit
  );
  const effectiveMinDoseText = formatDoseText(
    doseScoringProfile?.effectiveMinValue,
    doseScoringProfile?.unit
  );
  const targetMinDoseText = formatDoseText(
    doseScoringProfile?.targetMinValue,
    doseScoringProfile?.unit
  );
  const targetMaxDoseText = formatDoseText(
    doseScoringProfile?.targetMaxValue,
    doseScoringProfile?.unit
  );

  if (doseBand === DOSE_BANDS.EFFECTIVE_BELOW_TARGET) {
    return actualDoseText && targetMinDoseText
      ? `${actualDoseText} per serving. Slightly below ${targetMinDoseText} target; still within effective range.`
      : "Slightly below target; still within effective range.";
  }

  if (doseBand === DOSE_BANDS.UNDERDOSED) {
    return actualDoseText && effectiveMinDoseText
      ? `${actualDoseText} per serving. Below the ${effectiveMinDoseText} effective target.`
      : "Below the effective target.";
  }

  if (doseBand === DOSE_BANDS.SEVERELY_UNDERDOSED) {
    return actualDoseText && effectiveMinDoseText
      ? `${actualDoseText} per serving. Far below the ${effectiveMinDoseText} effective target.`
      : "Far below the effective target.";
  }

  if (doseBand === DOSE_BANDS.ABOVE_TARGET) {
    const targetRangeText =
      targetMinDoseText && targetMaxDoseText
        ? `${targetMinDoseText}-${targetMaxDoseText}`
        : targetMinDoseText;

    return actualDoseText && targetRangeText
      ? `${actualDoseText} per serving. Above the ${targetRangeText} target range.`
      : "Above the target range.";
  }

  if (doseComparisonStatus === "missing_dose_scoring_profile") {
    return null;
  }

  if (doseComparisonStatus === "missing_actual_dose") {
    return null;
  }

  if (doseComparisonStatus === "serving_size_unparseable") {
    return null;
  }

  if (doseComparisonStatus === "unknown_amount_basis") {
    return null;
  }

  if (doseComparisonStatus === "unit_mismatch") {
    return null;
  }

  if (doseBand === DOSE_BANDS.OPTIMAL) {
    return actualDoseText && targetMinDoseText
      ? `${actualDoseText} per serving. Meets the target dose.`
      : "Meets the target dose.";
  }

  return null;
}

function dedupeFlags(values) {
  return Array.from(
    new Set((values ?? []).map((value) => trimString(value)).filter(Boolean))
  );
}

function selectProductScoreDriver(scoredIngredients) {
  const comparableIngredients = (scoredIngredients ?? []).filter((match) =>
    Number.isFinite(match?.evidenceScore)
  );

  if (!comparableIngredients.length) {
    return null;
  }

  const penalizedIngredients = comparableIngredients
    .map((match) => ({
      match,
      scoreDelta: Math.max(
        0,
        (match?.evidenceScore ?? 0) - (match?.adjustedEvidenceScore ?? 0)
      ),
    }))
    .filter((item) => item.scoreDelta > 0.0001)
    .sort(
      (left, right) =>
        right.scoreDelta - left.scoreDelta ||
        (right.match?.evidenceScore ?? 0) - (left.match?.evidenceScore ?? 0)
    );

  if (penalizedIngredients.length) {
    return penalizedIngredients[0].match;
  }

  return (
    comparableIngredients.find(
      (match) => match?.scoreAdjustmentReasonCode === DOSE_BANDS.UNKNOWN
    ) ??
    comparableIngredients.find(
      (match) => match?.scoreAdjustmentReasonCode === DOSE_BANDS.ABOVE_TARGET
    ) ??
    comparableIngredients[0]
  );
}

export function buildProductEvidenceScoreData(scoredIngredients) {
  const baseEvidenceScore = computeBlendEvidenceScore(
    (scoredIngredients ?? []).map((match) => match?.evidenceScore)
  );
  const evidenceScore = computeBlendEvidenceScore(
    (scoredIngredients ?? []).map((match) => match?.adjustedEvidenceScore)
  );
  const scoreDriver = selectProductScoreDriver(scoredIngredients);
  const reasonCode = scoreDriver?.scoreAdjustmentReasonCode ?? null;
  const scoreChanged =
    Number.isFinite(baseEvidenceScore) &&
    Number.isFinite(evidenceScore) &&
    Math.abs(baseEvidenceScore - evidenceScore) > 0.0001;
  const shouldShowSummary =
    reasonCode === DOSE_BANDS.UNKNOWN ||
    reasonCode === DOSE_BANDS.ABOVE_TARGET ||
    scoreChanged;

  let scoreAdjustmentSummary =
    shouldShowSummary && scoreDriver?.scoreAdjustmentSummary
      ? scoreDriver.scoreAdjustmentSummary
      : null;

  if (
    scoreAdjustmentSummary &&
    (scoredIngredients?.length ?? 0) > 1 &&
    trimString(scoreDriver?.ingredientName)
  ) {
    scoreAdjustmentSummary = `${trimString(
      scoreDriver.ingredientName
    )}: ${scoreAdjustmentSummary}`;
  }

  return {
    baseEvidenceScore,
    evidenceScore,
    scoreAdjustmentReasonCode: reasonCode,
    scoreAdjustmentSummary,
  };
}

export function scoreMatchedIngredientsForProduct({
  matchedIngredients,
  supplementsByCatalogId,
  servingSizeText = null,
}) {
  return (matchedIngredients ?? []).map((match) => {
    const supplement = supplementsByCatalogId.get(match?.catalogId);
    const evidenceScore =
      typeof supplement?.evidence_score === "number" &&
      Number.isFinite(supplement.evidence_score)
        ? supplement.evidence_score
        : null;
    const recommendedDose = getRecommendedDoseForSupplement(supplement);
    const doseScoringProfile = getDoseScoringProfileForSupplement(
      supplement,
      recommendedDose
    );
    const {
      normalizedServingDose,
      flags: servingFlags,
      status: servingStatus,
    } = normalizeServingDose(match, servingSizeText);
    const alignedServingDose = alignDoseUnitsForIngredient({
      normalizedServingDose,
      doseScoringProfile,
      match,
      supplement,
    });
    const {
      doseFactor,
      status: comparisonStatus,
      doseBand,
      scoreAdjustmentReasonCode,
      flags: comparisonFlags,
    } = compareDoseToDoseScoringProfile({
      normalizedServingDose: alignedServingDose,
      doseScoringProfile,
    });

    const doseComparisonStatus =
      comparisonStatus === "missing_actual_dose" &&
      servingStatus !== "missing_actual_dose"
        ? servingStatus
        : comparisonStatus;
    const effectiveComparisonFlags =
      comparisonStatus === "missing_actual_dose" &&
      servingStatus !== "missing_actual_dose"
        ? []
        : comparisonFlags;
    const adjustedEvidenceScore = Number.isFinite(evidenceScore)
      ? roundTo(evidenceScore * doseFactor, 4)
      : null;
    const scoreAdjustmentSummary = buildDoseComparisonSummary({
      doseBand,
      doseComparisonStatus,
      normalizedServingDose: alignedServingDose,
      doseScoringProfile,
    });

    return {
      ...match,
      evidenceScore,
      adjustedEvidenceScore,
      recommendedDose,
      doseScoringProfile,
      normalizedServingDose: alignedServingDose,
      doseFactor,
      doseBand,
      doseStatusLabel: buildDoseStatusLabel({
        doseBand,
        doseComparisonStatus,
      }),
      scoreAdjustmentReasonCode,
      scoreAdjustmentSummary,
      doseComparisonStatus,
      doseFlags: dedupeFlags([
        ...(recommendedDose?.flags ?? []),
        ...(doseScoringProfile?.flags ?? []),
        ...servingFlags,
        ...effectiveComparisonFlags,
      ]),
    };
  });
}
