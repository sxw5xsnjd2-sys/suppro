export const DOSE_CONTRACT_VERSION = 1;

export const SUPPORTED_DOSE_UNITS = new Set([
  "mcg",
  "mg",
  "g",
  "ml",
  "IU",
  "CFU",
]);

export const SUPPORTED_AMOUNT_BASES = new Set([
  "per_serving",
  "per_capsule",
  "per_tablet",
  "per_softgel",
  "per_scoop",
]);

const SENTINEL_TEXT = new Set([
  "-",
  "--",
  "n/a",
  "na",
  "missing",
  "none",
  "not available",
  "not applicable",
  "not provided",
  "null",
  "undefined",
  "unavailable",
  "unknown",
]);

const UNIT_ALIASES = new Map([
  ["mcg", "mcg"],
  ["ug", "mcg"],
  ["µg", "mcg"],
  ["μg", "mcg"],
  ["microgram", "mcg"],
  ["micrograms", "mcg"],
  ["mg", "mg"],
  ["milligram", "mg"],
  ["milligrams", "mg"],
  ["g", "g"],
  ["gram", "g"],
  ["grams", "g"],
  ["ml", "ml"],
  ["milliliter", "ml"],
  ["milliliters", "ml"],
  ["millilitre", "ml"],
  ["millilitres", "ml"],
  ["iu", "IU"],
  ["international unit", "IU"],
  ["international units", "IU"],
  ["cfu", "CFU"],
]);

const AMOUNT_BASIS_ALIASES = new Map([
  ["per serving", "per_serving"],
  ["serving", "per_serving"],
  ["per capsule", "per_capsule"],
  ["capsule", "per_capsule"],
  ["per tablet", "per_tablet"],
  ["tablet", "per_tablet"],
  ["per softgel", "per_softgel"],
  ["softgel", "per_softgel"],
  ["per scoop", "per_scoop"],
  ["scoop", "per_scoop"],
]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value) {
  const text = trimString(value).replace(/\s+/g, " ");
  if (!text || SENTINEL_TEXT.has(text.toLowerCase())) {
    return null;
  }
  return text;
}

function firstDefined(source, keys) {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (source[key] !== undefined) {
      return source[key];
    }
  }

  return undefined;
}

function normalizeNumberString(value) {
  const text = normalizeText(String(value ?? ""));
  if (!text) {
    return null;
  }

  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(text)) {
    return text.replace(/,/g, "");
  }

  if (/^\d+,\d+$/u.test(text) && !text.includes(".")) {
    return text.replace(",", ".");
  }

  return text;
}

export function normalizeDoseValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const text = normalizeNumberString(value);
  if (!text || !/^\d+(?:\.\d+)?$/u.test(text)) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeDoseUnit(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const alias = UNIT_ALIASES.get(text.toLowerCase());
  return alias ?? text;
}

export function normalizeDoseAmountBasis(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const lowered = text.toLowerCase().replace(/-/g, "_");
  const alias = AMOUNT_BASIS_ALIASES.get(lowered.replace(/_/g, " "));
  return alias ?? lowered.replace(/\s+/g, "_");
}

function normalizeDoseConfidence(value) {
  const text = trimString(value).toLowerCase();
  if (!text) {
    return null;
  }

  if (text === "verified" || text === "unverified" || text === "missing") {
    return text;
  }

  if (SENTINEL_TEXT.has(text)) {
    return "missing";
  }

  return "unverified";
}

function formatDoseNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number.isInteger(value) ? String(value) : String(Number(value));
}

function stripIngredientPrefix(displayText, ingredientName) {
  const display = normalizeText(displayText);
  const name = normalizeText(ingredientName);
  if (!display || !name) {
    return display;
  }

  if (display.toLowerCase().startsWith(`${name.toLowerCase()} `)) {
    return normalizeText(display.slice(name.length));
  }

  return display;
}

function parseExactDisplayDose(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const match = text.match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zµμ]+)$/u);
  if (!match) {
    return null;
  }

  const parsedValue = normalizeDoseValue(match[1]);
  const parsedUnit = normalizeDoseUnit(match[2]);
  if (!Number.isFinite(parsedValue) || !parsedUnit) {
    return null;
  }

  return { value: parsedValue, unit: parsedUnit };
}

function isMissingStructuredField(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !normalizeText(value))
  );
}

export function getDoseUnavailableStatusLabel(reason) {
  switch (reason) {
    case "dose_could_not_be_parsed":
    case "missing_dose_value":
      return "Dose could not be parsed";
    case "missing_dose_unit":
      return "Dose unit unavailable";
    case "unsupported_dose_unit":
      return "Dose unit unsupported";
    case "dose_not_verified":
      return "Dose not verified";
    case "missing_amount_basis":
      return "Dose basis unavailable";
    case "unsupported_amount_basis":
      return "Dose basis unsupported";
    case "serving_size_unparseable":
      return "Serving size unclear";
    case "unit_mismatch":
      return "Dose unit incompatible";
    case "missing_dose_information":
    case "missing_actual_dose":
    default:
      return "Dose unavailable";
  }
}

export function normalizeIngredientDose(
  source,
  { allowDisplayParsing = false } = {},
) {
  const rawValue = firstDefined(source, [
    "dosageValue",
    "dosage_value",
    "amount",
    "value",
  ]);
  const rawUnit = firstDefined(source, [
    "dosageUnit",
    "dosage_unit",
    "unit",
  ]);
  const rawOriginalText = firstDefined(source, [
    "dosageOriginalText",
    "dosage_original_text",
  ]);
  const rawDisplayText = firstDefined(source, [
    "dosageDisplay",
    "dosage_display",
  ]);
  const rawAmountBasis = firstDefined(source, ["amountBasis", "amount_basis"]);
  const rawConfidence = firstDefined(source, [
    "doseConfidence",
    "dose_confidence",
  ]);
  const rawReviewReason = firstDefined(source, [
    "doseReviewReason",
    "dose_review_reason",
  ]);
  const ingredientName = firstDefined(source, [
    "ingredientName",
    "canonicalName",
    "canonical_name",
    "name",
  ]);

  const dosageOriginalText = normalizeText(rawOriginalText);
  const fallbackDisplayText = stripIngredientPrefix(
    normalizeText(rawDisplayText) ?? dosageOriginalText,
    ingredientName,
  );
  let value = normalizeDoseValue(rawValue);
  let unit = normalizeDoseUnit(rawUnit);
  let parsedFromDisplay = false;

  if (
    allowDisplayParsing &&
    isMissingStructuredField(rawValue) &&
    isMissingStructuredField(rawUnit)
  ) {
    const parsedDisplay = parseExactDisplayDose(fallbackDisplayText);
    if (parsedDisplay) {
      value = parsedDisplay.value;
      unit = parsedDisplay.unit;
      parsedFromDisplay = true;
    }
  }

  const hasValue = Number.isFinite(value);
  const hasUnit = Boolean(unit);
  const unitSupported = hasUnit && SUPPORTED_DOSE_UNITS.has(unit);
  const amountBasis = normalizeDoseAmountBasis(rawAmountBasis);
  const amountBasisSupported = SUPPORTED_AMOUNT_BASES.has(amountBasis);
  const doseConfidence = normalizeDoseConfidence(rawConfidence);
  const confidenceStatus = doseConfidence ?? "legacy";
  // Backward compatibility: rows written before confidence metadata existed
  // remain eligible. Explicit unverified or missing confidence always fails closed.
  const confidenceEligible =
    doseConfidence === "verified" || doseConfidence === null;
  const isStructurallyUsable = hasValue && unitSupported;

  let unavailableReason = null;
  if (!hasValue && !hasUnit) {
    unavailableReason =
      fallbackDisplayText || normalizeText(rawValue) || normalizeText(rawUnit)
      ? "dose_could_not_be_parsed"
      : "missing_dose_information";
  } else if (!hasValue) {
    unavailableReason = normalizeText(rawValue)
      ? "dose_could_not_be_parsed"
      : "missing_dose_value";
  } else if (!hasUnit) {
    unavailableReason = "missing_dose_unit";
  } else if (!unitSupported) {
    unavailableReason = "unsupported_dose_unit";
  } else if (!confidenceEligible) {
    unavailableReason = "dose_not_verified";
  } else if (!amountBasis) {
    unavailableReason = "missing_amount_basis";
  } else if (!amountBasisSupported) {
    unavailableReason = "unsupported_amount_basis";
  }

  const structuredDisplay = isStructurallyUsable
    ? `${formatDoseNumber(value)} ${unit}`
    : null;
  const displayText = structuredDisplay ?? fallbackDisplayText;

  return {
    contractVersion: DOSE_CONTRACT_VERSION,
    value: hasValue ? value : null,
    unit: hasUnit ? unit : null,
    amountBasis,
    dosageOriginalText,
    displayText,
    doseConfidence,
    doseReviewReason: normalizeText(rawReviewReason),
    confidenceStatus,
    isVerified: doseConfidence === "verified",
    isLegacyConfidence: doseConfidence === null,
    isStructurallyUsable,
    isScoringEligible:
      isStructurallyUsable && amountBasisSupported && confidenceEligible,
    unavailableReason,
    parsedFromDisplay,
  };
}
