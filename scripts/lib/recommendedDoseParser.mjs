import assert from "node:assert/strict";

export const RECOMMENDED_DOSE_REVIEW_TYPE = "recommended_dose_needs_review";

const COMPARABLE_UNITS = new Set(["mcg", "mg", "ml", "IU", "CFU"]);
const FORM_ONLY_PATTERNS = [
  /\bcapsule(?:s)?\b/i,
  /\btablet(?:s)?\b/i,
  /\bsoftgel(?:s)?\b/i,
  /\bscoop(?:s)?\b/i,
  /\bdrop(?:s)?\b/i,
];
const DOSE_HINT_PATTERNS = [
  /\b\d+(?:[.,]\d+)?\s*(?:mcg|mg|g|ml|iu|cfu)\b/i,
  /\b(?:take|use|dosage|suggested use|direction(?:s)?)\b/i,
  /\b(?:once|twice|daily|times daily|per day)\b/i,
];
const MULTIPLIER_BY_WORD = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
};

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumberString(str) {
  return str.replace(/,/g, "");
}

function parseOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = normalizeNumberString(String(value ?? "").trim()).replace(
    ",",
    "."
  );
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value, decimals = 6) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeDoseUnit(value) {
  const normalized = trimString(value).replace(/[µμ]/g, "μ");
  if (!normalized) return null;

  const lowered = normalized.toLowerCase();
  if (lowered === "ug" || lowered === "mcg" || normalized === "μg")
    return "mcg";
  if (lowered === "mg") return "mg";
  if (lowered === "g") return "g";
  if (lowered === "ml") return "ml";
  if (lowered === "iu") return "IU";
  if (lowered === "cfu") return "CFU";
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

  if (!COMPARABLE_UNITS.has(normalizedUnit)) {
    return null;
  }

  return {
    value: roundTo(parsedValue),
    unit: normalizedUnit,
  };
}

function splitHowToUseFragments(text) {
  return trimString(text)
    .split(/\r?\n|[;•]+|(?<=\.)\s+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function scoreFragment(fragment) {
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
  if (FORM_ONLY_PATTERNS.some((pattern) => pattern.test(value))) {
    score += 5;
  }

  return score;
}

function selectDoseFragment(text) {
  const fragments = splitHowToUseFragments(text);
  if (!fragments.length) {
    return null;
  }

  const best = fragments
    .map((fragment) => ({
      fragment,
      score: scoreFragment(fragment),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (!best || best.score <= 0) {
    return null;
  }

  return best.fragment;
}

function parseDoseAmount(valueText, multiplierWord) {
  const parsedValue = parseOptionalNumber(valueText);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  const multiplier =
    MULTIPLIER_BY_WORD[trimString(multiplierWord).toLowerCase()] ?? 1;
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

function parseComparableDoseMatches(fragment) {
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
      minValue: parseDoseAmount(match[1], match[2]),
      maxValue: parseDoseAmount(match[3], match[4]),
      unit: match[5],
    });

    if (!normalized) {
      continue;
    }

    occupiedRanges.push([match.index, match.index + match[0].length]);
    matches.push({
      ...normalized,
      sourceText: trimString(match[0]),
    });
  }

  while ((match = singlePattern.exec(value)) !== null) {
    const insideRange = occupiedRanges.some(
      ([start, end]) => match.index >= start && match.index < end
    );
    if (insideRange) {
      continue;
    }

    const normalized = normalizeDoseMatch({
      minValue: parseDoseAmount(match[1], match[2]),
      maxValue: null,
      unit: match[3],
    });

    if (!normalized) {
      continue;
    }

    matches.push({
      ...normalized,
      sourceText: trimString(match[0]),
    });
  }

  const deduped = new Map();
  for (const item of matches) {
    const key = `${item.minValue}|${item.maxValue ?? ""}|${item.unit}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}

function parseFrequency(fragment) {
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

function createDoseResult({
  status,
  sourceText = null,
  confidence = null,
  parserMethod = "rule",
  minValue = null,
  maxValue = null,
  unit = null,
  frequencyMinPerDay = null,
  frequencyMaxPerDay = null,
  flags = [],
}) {
  return {
    status,
    recommended_dose_json: {
      source_text: sourceText,
      confidence,
      parser_method: parserMethod,
      per_intake_min_value: minValue,
      per_intake_max_value: maxValue,
      unit,
      frequency_min_per_day: frequencyMinPerDay,
      frequency_max_per_day: frequencyMaxPerDay,
      flags: Array.from(new Set(flags.filter(Boolean))),
    },
  };
}

export function normalizeRecommendedDoseResult(value, parserMethod = "llm") {
  const status = ["parsed", "ambiguous", "unscorable", "missing"].includes(
    trimString(value?.status)
  )
    ? trimString(value.status)
    : "ambiguous";
  const rawMin = parseOptionalNumber(value?.per_intake_min_value);
  const rawMax = parseOptionalNumber(value?.per_intake_max_value);
  const rawUnit = normalizeDoseUnit(value?.unit);
  const normalizedMin = Number.isFinite(rawMin)
    ? normalizeComparableDose({
        value: rawMin,
        unit: rawUnit,
      })
    : null;
  const normalizedMax = Number.isFinite(rawMax)
    ? normalizeComparableDose({
        value: rawMax,
        unit: rawUnit,
      })
    : null;

  return createDoseResult({
    status,
    sourceText: trimString(value?.source_text) || null,
    confidence: parseOptionalNumber(value?.confidence),
    parserMethod,
    minValue: normalizedMin?.value ?? null,
    maxValue:
      normalizedMax?.unit === normalizedMin?.unit ? normalizedMax.value : null,
    unit: normalizedMin?.unit ?? null,
    frequencyMinPerDay: parseOptionalNumber(value?.frequency_min_per_day),
    frequencyMaxPerDay: parseOptionalNumber(value?.frequency_max_per_day),
    flags: Array.isArray(value?.flags)
      ? value.flags.map((item) => trimString(item)).filter(Boolean)
      : [],
  });
}

export function parseRecommendedDoseFromHowToUse(howToUse) {
  const sourceText = trimString(howToUse);
  if (!sourceText) {
    return createDoseResult({
      status: "missing",
      parserMethod: "rule",
      flags: ["missing_how_to_use"],
    });
  }

  const fragment = selectDoseFragment(sourceText);
  if (!fragment) {
    return createDoseResult({
      status: "missing",
      sourceText: null,
      confidence: 0.2,
      parserMethod: "rule",
      flags: ["no_dose_like_fragment_found"],
    });
  }

  const doseMatches = parseComparableDoseMatches(fragment);
  const frequency = parseFrequency(fragment);

  if (doseMatches.length === 0) {
    const hasFormOnlyGuidance = FORM_ONLY_PATTERNS.some((pattern) =>
      pattern.test(fragment)
    );

    return createDoseResult({
      status: hasFormOnlyGuidance ? "unscorable" : "missing",
      sourceText: fragment,
      confidence: hasFormOnlyGuidance ? 0.85 : 0.35,
      parserMethod: "rule",
      frequencyMinPerDay: frequency.minPerDay,
      frequencyMaxPerDay: frequency.maxPerDay,
      flags: [
        hasFormOnlyGuidance
          ? "form_count_only_guidance"
          : "no_comparable_dose_found",
      ],
    });
  }

  if (doseMatches.length > 1) {
    return createDoseResult({
      status: "ambiguous",
      sourceText: fragment,
      confidence: 0.45,
      parserMethod: "rule",
      frequencyMinPerDay: frequency.minPerDay,
      frequencyMaxPerDay: frequency.maxPerDay,
      flags: ["multiple_distinct_doses_found"],
    });
  }

  const [doseMatch] = doseMatches;
  return createDoseResult({
    status: "parsed",
    sourceText: fragment,
    confidence: 0.95,
    parserMethod: "rule",
    minValue: doseMatch.minValue,
    maxValue: doseMatch.maxValue,
    unit: doseMatch.unit,
    frequencyMinPerDay: frequency.minPerDay,
    frequencyMaxPerDay: frequency.maxPerDay,
    flags: [],
  });
}

export function buildRecommendedDoseReviewPayload({ supplement, result }) {
  return {
    entity_type: "supplement",
    supplement_id: trimString(supplement?.id) || null,
    supplement_name: trimString(supplement?.name) || null,
    how_to_use: trimString(supplement?.how_to_use) || null,
    recommended_dose_status: trimString(result?.status) || "missing",
    recommended_dose_json: result?.recommended_dose_json ?? null,
  };
}

export function assertParsedDoseResult(result, expected) {
  assert.equal(result.status, expected.status);
  assert.deepEqual(
    {
      min: result.recommended_dose_json.per_intake_min_value,
      max: result.recommended_dose_json.per_intake_max_value,
      unit: result.recommended_dose_json.unit,
      frequencyMin: result.recommended_dose_json.frequency_min_per_day,
      frequencyMax: result.recommended_dose_json.frequency_max_per_day,
    },
    expected.values
  );
}
