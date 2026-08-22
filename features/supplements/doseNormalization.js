export const DOSE_CONTRACT_VERSION = 3;

export const SUPPORTED_DOSE_UNITS = new Set([
  "mcg",
  "mg",
  "g",
  "ml",
  "IU",
  "CFU",
  "FCC",
  "HUT",
  "DU",
  "FIP",
  "ALU",
  "GDU",
  "PU",
]);

export const SUPPORTED_AMOUNT_BASES = new Set([
  "per_serving",
  "per_capsule",
  "per_tablet",
  "per_softgel",
  "per_scoop",
  "per_drop",
  "per_daily_dose",
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
  ["colony forming unit", "CFU"],
  ["colony forming units", "CFU"],
  ["viable organism", "CFU"],
  ["viable organisms", "CFU"],
  ["live culture", "CFU"],
  ["live cultures", "CFU"],
  ["fcc", "FCC"],
  ["hut", "HUT"],
  ["du", "DU"],
  ["fip", "FIP"],
  ["alu", "ALU"],
  ["gdu", "GDU"],
  ["pu", "PU"],
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
  ["per drop", "per_drop"],
  ["drop", "per_drop"],
  ["per daily dose", "per_daily_dose"],
  ["daily dose", "per_daily_dose"],
]);

const PROBIOTIC_GENUS_CORRECTIONS = new Map([
  ["lactobacilus", "lactobacillus"],
  ["lactobilus", "lactobacillus"],
  ["bifidobactertum", "bifidobacterium"],
  ["bifidobacterlum", "bifidobacterium"],
]);
const PROBIOTIC_GENERA = new Set([
  "bacillus",
  "bifidobacterium",
  "lactobacillus",
  "lactococcus",
  "saccharomyces",
  "streptococcus",
]);
const NON_SPECIES_PROBIOTIC_TOKENS = new Set([
  "blend",
  "complex",
  "culture",
  "cultures",
  "mixture",
  "probiotic",
  "probiotics",
]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeProbioticIngredientName(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^([A-Za-z]+)\b/u);
  if (!match) return text;
  const normalizedGenus = PROBIOTIC_GENUS_CORRECTIONS.get(
    match[1].toLowerCase(),
  );
  if (!normalizedGenus) return text;
  const canonicalGenus = `${normalizedGenus[0].toUpperCase()}${normalizedGenus.slice(1)}`;
  return `${canonicalGenus}${text.slice(match[1].length)}`;
}

export function getProbioticIdentity(value) {
  const corrected = normalizeProbioticIngredientName(value);
  const tokens = trimString(corrected)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
  const genusIndex = tokens.findIndex((token) => PROBIOTIC_GENERA.has(token));
  if (genusIndex < 0) return null;
  const genus = tokens[genusIndex];
  const speciesToken = tokens[genusIndex + 1] ?? null;
  const species =
    speciesToken &&
    /^[a-z][a-z-]+$/u.test(speciesToken) &&
    !NON_SPECIES_PROBIOTIC_TOKENS.has(speciesToken)
      ? speciesToken
      : null;
  const strain = species
    ? tokens.slice(genusIndex + 2).join(" ") || null
    : null;
  return { genus, species, strain };
}

export function getProbioticIdentityCompatibility(sourceName, targetName) {
  const source = getProbioticIdentity(sourceName);
  if (!source) {
    return { applies: false, compatible: true, reason: null };
  }
  const target = getProbioticIdentity(targetName);
  if (!target || !source.species || !target.species) {
    return {
      applies: true,
      compatible: false,
      reason: "incomplete_probiotic_identity",
    };
  }
  if (source.genus !== target.genus) {
    return {
      applies: true,
      compatible: false,
      reason: "probiotic_genus_conflict",
    };
  }
  if (source.species !== target.species) {
    return {
      applies: true,
      compatible: false,
      reason: "probiotic_species_conflict",
    };
  }
  return { applies: true, compatible: true, reason: null };
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

const CFU_UNIT_PATTERN =
  "(?:cfu|colony[\\s-]+forming[\\s-]+units?|viable[\\s-]+organisms?|live[\\s-]+cultures?)";
const CFU_NUMBER_PATTERN =
  "(?:\\d+(?:\\.\\d+)?\\s*(?:[×x*]\\s*10\\s*\\^\\s*[+-]?\\d+|e[+-]?\\d+)|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)";
const CFU_MULTIPLIER_PATTERN = "(?:thousand|million|billion|trillion|bn|[bm])";
const CFU_SUFFIX_PATTERN = new RegExp(
  `(${CFU_NUMBER_PATTERN})\\s*(${CFU_MULTIPLIER_PATTERN})?` +
    `(?:\\s*(?:-|–|—|to)\\s*(${CFU_NUMBER_PATTERN})\\s*(${CFU_MULTIPLIER_PATTERN})?)?` +
    `\\s*(${CFU_UNIT_PATTERN})\\b`,
  "giu",
);
const CFU_PREFIX_PATTERN = new RegExp(
  `\\bcfu\\s*(${CFU_NUMBER_PATTERN})\\s*(${CFU_MULTIPLIER_PATTERN})?` +
    `(?:\\s*(?:-|–|—|to)\\s*(${CFU_NUMBER_PATTERN})\\s*(${CFU_MULTIPLIER_PATTERN})?)?`,
  "giu",
);
const CFU_MULTIPLIERS = new Map([
  ["thousand", 1e3],
  ["million", 1e6],
  ["m", 1e6],
  ["billion", 1e9],
  ["bn", 1e9],
  ["b", 1e9],
  ["trillion", 1e12],
]);

function isSafeCfuValue(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function parseCfuNumberToken(value) {
  const compact = trimString(value).replace(/\s+/gu, "");
  if (!compact) {
    return null;
  }

  const scientific = compact.match(
    /^(\d+(?:\.\d+)?)(?:[×x*]10\^([+-]?\d+)|e([+-]?\d+))$/iu,
  );
  if (scientific) {
    const exponent = Number(scientific[2] ?? scientific[3]);
    const coefficient = Number(scientific[1]);
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > 15) {
      return null;
    }
    const parsed = coefficient * 10 ** exponent;
    return isSafeCfuValue(parsed) ? parsed : null;
  }

  let normalized = compact;
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(compact)) {
    normalized = compact.replace(/,/gu, "");
  } else if (!/^\d+(?:\.\d+)?$/u.test(compact)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseCfuAmount(value, multiplier) {
  const parsed = parseCfuNumberToken(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const factor = multiplier
    ? CFU_MULTIPLIERS.get(trimString(multiplier).toLowerCase())
    : 1;
  if (!factor) {
    return null;
  }

  const normalized = parsed * factor;
  return isSafeCfuValue(normalized) ? normalized : null;
}

function formatReadableNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}

function readableCfuScale(values) {
  const scales = [
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
  ];

  return scales.find(([factor]) =>
    values.every((value) => {
      if (!isSafeCfuValue(value) || value < factor) {
        return false;
      }
      const scaled = value / factor;
      const rounded = Math.round(scaled * 1000) / 1000;
      return Math.abs(rounded * factor - value) < 0.5;
    }),
  );
}

export function formatCfuDoseDisplay(value, maxValue = null) {
  if (!isSafeCfuValue(value)) {
    return null;
  }

  const values = Number.isFinite(maxValue) ? [value, maxValue] : [value];
  const scale = readableCfuScale(values);
  if (scale) {
    const [factor, label] = scale;
    const formatted = values.map((item) => formatReadableNumber(item / factor));
    return `${formatted.join("–")} ${label} CFU`;
  }

  const formatted = values.map((item) =>
    formatDoseNumber(item).replace(/\B(?=(\d{3})+(?!\d))/gu, ","),
  );
  return `${formatted.join("–")} CFU`;
}

function inferDoseAmountBasis(text) {
  const normalized = trimString(text).toLowerCase();
  if (/\bper\s+daily\s+dose\b|\bdaily\s+dose\b/u.test(normalized)) {
    return "per_daily_dose";
  }
  const match = normalized.match(
    /\bper\s+(?:(\d+)\s+)?(servings?|capsules?|tablets?|softgels?|scoops?|drops?)\b/u,
  );
  if (!match) {
    return null;
  }

  const count = match[1] ? Number(match[1]) : 1;
  const form = match[2];
  if (!Number.isSafeInteger(count) || count <= 0) {
    return null;
  }
  if (form.startsWith("serving") || count > 1) {
    return "per_serving";
  }
  if (form.startsWith("capsule")) return "per_capsule";
  if (form.startsWith("tablet")) return "per_tablet";
  if (form.startsWith("softgel")) return "per_softgel";
  if (form.startsWith("scoop")) return "per_scoop";
  if (form.startsWith("drop")) return "per_drop";
  return null;
}

function isValidCfuMatchBoundary(text, index) {
  if (index <= 0) {
    return true;
  }
  return !/[\d,]/u.test(text[index - 1]);
}

function collectParsedCfuPattern(text, pattern, { unitFirst = false } = {}) {
  pattern.lastIndex = 0;
  const results = [];
  for (const match of text.matchAll(pattern)) {
    const numericIndex = unitFirst
      ? match.index + match[0].search(/\d/u)
      : match.index;
    if (!isValidCfuMatchBoundary(text, numericIndex)) {
      continue;
    }

    const firstMultiplier = match[2] || (match[3] ? match[4] : null);
    const secondMultiplier = match[4] || match[2] || null;
    const coefficient = parseCfuNumberToken(match[1]);
    const multiplierToken = firstMultiplier
      ? trimString(firstMultiplier).toLowerCase()
      : null;
    const multiplierValue = multiplierToken
      ? CFU_MULTIPLIERS.get(multiplierToken)
      : 1;
    const value = parseCfuAmount(match[1], firstMultiplier);
    const maxValue = match[3]
      ? parseCfuAmount(match[3], secondMultiplier)
      : null;
    if (
      !isSafeCfuValue(value) ||
      (match[3] && (!isSafeCfuValue(maxValue) || maxValue < value))
    ) {
      continue;
    }

    results.push({
      value,
      maxValue,
      unit: "CFU",
      coefficient,
      multiplierToken,
      multiplierValue,
      amountBasis: inferDoseAmountBasis(text),
      originalText: text,
      matchedText: match[0],
      displayText: formatCfuDoseDisplay(value, maxValue),
    });
  }
  return results;
}

export function parseCfuDoseText(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const matches = [
    ...collectParsedCfuPattern(text, CFU_SUFFIX_PATTERN),
    ...collectParsedCfuPattern(text, CFU_PREFIX_PATTERN, { unitFirst: true }),
  ];
  const distinctMatches = new Map();
  matches.forEach((match) => {
    const key = `${match.value}|${match.maxValue ?? ""}|${match.amountBasis ?? ""}`;
    if (!distinctMatches.has(key)) {
      distinctMatches.set(key, match);
    }
  });
  return distinctMatches.size === 1
    ? Array.from(distinctMatches.values())[0]
    : null;
}

const STANDARD_UNIT_PATTERN =
  "(?:mcg|µg|μg|ug|micrograms?|mg|milligrams?|g|grams?|ml|millilit(?:er|re)s?|iu|international[\\s-]+units?|fcc|hut|du|fip|alu|gdu|pu)";
const STANDARD_NUMBER_PATTERN =
  "(?:\\d+(?:\\.\\d+)?\\s*(?:[×x*]\\s*10\\s*\\^\\s*[+-]?\\d+|e[+-]?\\d+)|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:[.,]\\d+)?)";
const STANDARD_MULTIPLIER_PATTERN = "(?:thousand|million|billion|trillion)";
const STANDARD_SUFFIX_PATTERN = new RegExp(
  `(${STANDARD_NUMBER_PATTERN})\\s*(${STANDARD_MULTIPLIER_PATTERN})?` +
    `(?:\\s*(?:-|–|—|to)\\s*(${STANDARD_NUMBER_PATTERN})\\s*(${STANDARD_MULTIPLIER_PATTERN})?)?` +
    `\\s*(${STANDARD_UNIT_PATTERN})\\b`,
  "giu",
);
const DOSE_TRAILING_QUALIFIER_PATTERN =
  /^(?:\s*(?:per\s+(?:\d+\s+)?(?:servings?|capsules?|tablets?|softgels?|scoops?|drops?)|per\s+daily\s+dose|daily\s+dose|at\s+time\s+of\s+manufacture|guaranteed\s+through\s+expir(?:y|ation)))?(?:\s*\((?:as|from|providing|equivalent\s+to|of\s+which|\d+(?:[.,]\d+)?\s*%\s*(?:nrv|dv|ri))[^)]*\))?(?:\s+\d+(?:[.,]\d+)?\s*%\s*(?:nrv|dv|ri))?\s*[*†‡]?$/iu;

function parseStandardAmount(value, multiplier) {
  const compact = trimString(value).replace(/\s+/gu, "");
  const scientific = compact.match(
    /^(\d+(?:\.\d+)?)(?:[×x*]10\^([+-]?\d+)|e([+-]?\d+))$/iu,
  );
  let parsed = null;
  if (scientific) {
    const exponent = Number(scientific[2] ?? scientific[3]);
    const coefficient = Number(scientific[1]);
    if (Number.isInteger(exponent) && Math.abs(exponent) <= 308) {
      parsed = coefficient * 10 ** exponent;
    }
  } else {
    parsed = normalizeDoseValue(compact);
  }
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const factor = multiplier
    ? CFU_MULTIPLIERS.get(trimString(multiplier).toLowerCase())
    : 1;
  if (!factor) {
    return null;
  }
  const normalized = parsed * factor;
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function formatStandardDoseDisplay(value, unit, maxValue = null) {
  const formattedValue = formatDoseNumber(value);
  if (!formattedValue || !unit) {
    return null;
  }
  const formattedMax = Number.isFinite(maxValue)
    ? formatDoseNumber(maxValue)
    : null;
  return `${formattedMax ? `${formattedValue}–${formattedMax}` : formattedValue} ${unit}`;
}

function cleanEmbeddedIngredientName(text, match) {
  const prefix = normalizeText(text.slice(0, match.index))
    ?.replace(/[\s([{<\-–—,;:]+$/gu, "")
    .trim();
  const suffix = text.slice(match.index + match[0].length);
  if (!prefix || !DOSE_TRAILING_QUALIFIER_PATTERN.test(suffix)) {
    return null;
  }
  return normalizeProbioticIngredientName(prefix);
}

function collectStandardDoseMatches(text) {
  STANDARD_SUFFIX_PATTERN.lastIndex = 0;
  const results = [];
  for (const match of text.matchAll(STANDARD_SUFFIX_PATTERN)) {
    if (!isValidCfuMatchBoundary(text, match.index)) {
      continue;
    }
    const firstMultiplier = match[2] || (match[3] ? match[4] : null);
    const secondMultiplier = match[4] || match[2] || null;
    const value = parseStandardAmount(match[1], firstMultiplier);
    const maxValue = match[3]
      ? parseStandardAmount(match[3], secondMultiplier)
      : null;
    const unit = normalizeDoseUnit(match[5]);
    if (
      !Number.isFinite(value) ||
      !unit ||
      (match[3] && (!Number.isFinite(maxValue) || maxValue < value))
    ) {
      continue;
    }
    results.push({
      value,
      maxValue,
      unit,
      amountBasis: inferDoseAmountBasis(text),
      originalText: text,
      matchedText: match[0],
      ingredientName: cleanEmbeddedIngredientName(text, match),
      displayText: formatStandardDoseDisplay(value, unit, maxValue),
    });
  }
  return results;
}

export function parseDoseText(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const cfuMatch = parseCfuDoseText(text);
  const matches = [
    ...(cfuMatch ? [cfuMatch] : []),
    ...collectStandardDoseMatches(text),
  ].map((match) => {
    if (match.ingredientName) {
      return match;
    }
    const matchIndex = text.indexOf(match.matchedText);
    return {
      ...match,
      ingredientName: cleanEmbeddedIngredientName(text, {
        index: matchIndex,
        0: match.matchedText,
      }),
    };
  });
  const distinctMatches = new Map();
  matches.forEach((match) => {
    const key = `${match.value}|${match.maxValue ?? ""}|${match.unit}|${match.amountBasis ?? ""}`;
    if (!distinctMatches.has(key)) {
      distinctMatches.set(key, match);
    }
  });
  return distinctMatches.size === 1
    ? Array.from(distinctMatches.values())[0]
    : null;
}

function formatStructuredDose(value, unit, maxValue = null) {
  if (unit === "CFU") {
    return formatCfuDoseDisplay(value, maxValue);
  }
  return formatStandardDoseDisplay(value, unit, maxValue);
}

function stripIngredientPrefix(displayText, ingredientName) {
  const display = normalizeText(displayText);
  const name = normalizeText(ingredientName);
  if (!display || !name) {
    return display;
  }

  if (display.toLowerCase() === name.toLowerCase()) {
    return null;
  }

  if (display.toLowerCase().startsWith(`${name.toLowerCase()} `)) {
    return normalizeText(display.slice(name.length));
  }

  return display;
}

const DOSE_EVIDENCE_UNIT_PATTERN =
  /\b(?:mcg|ug|micrograms?|mg|milligrams?|g|grams?|ml|millilit(?:er|re)s?|iu|international[\s-]+units?|cfu|colony[\s-]+forming[\s-]+units?|viable[\s-]+organisms?|live[\s-]+cultures?|fcc|hut|du|fip|alu|gdu|pu)\b/iu;
const UNREADABLE_DOSE_EVIDENCE_PATTERN =
  /\b(?:dose|dosage|amount|quantity)\b.{0,32}\b(?:unreadable|illegible|unclear|obscured)\b|\b(?:unreadable|illegible|unclear|obscured)\b.{0,32}\b(?:dose|dosage|amount|quantity)\b/iu;

function hasMeaningfulDoseEvidenceText(value) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }

  return Boolean(
    parseDoseText(text) ||
      DOSE_EVIDENCE_UNIT_PATTERN.test(text) ||
      /^\s*\d+(?:[.,]\d+)?(?:\s*(?:[-–—]|to)\s*\d+(?:[.,]\d+)?)?\s*$/u.test(
        text,
      ) ||
      UNREADABLE_DOSE_EVIDENCE_PATTERN.test(text),
  );
}

function parseExactDisplayDose(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  return parseDoseText(text);
}

function isMissingStructuredField(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !normalizeText(value))
  );
}

const DOSE_COMPARISON_UNAVAILABLE_REASONS = new Set([
  "canonical_identity_mismatch",
  "dose_presentation_mismatch",
  "missing_amount_basis",
  "unsupported_amount_basis",
  "serving_size_unparseable",
  "unknown_amount_basis",
  "unit_mismatch",
]);

function isDevelopmentBuild() {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

export function getDoseUnavailableStatusLabel(reason) {
  switch (reason) {
    case "missing_dose_information":
    case "missing_actual_dose":
      return "Dose unavailable";
    case "dose_not_verified":
      return "Dose not verified";
    default:
      return DOSE_COMPARISON_UNAVAILABLE_REASONS.has(reason)
        ? "Dose comparison unavailable"
        : "Dose could not be analysed";
  }
}

export function resolveNormalizedDosePresentation(
  normalizedDose,
  { statusReason = normalizedDose?.unavailableReason ?? null } = {},
) {
  const isStructurallyUsable = normalizedDose?.isStructurallyUsable === true;
  const hasMeaningfulDoseText = normalizedDose?.hasMeaningfulDoseText === true;
  const displayText = isStructurallyUsable
    ? normalizeText(normalizedDose?.displayText)
    : null;
  let statusLabel = null;

  if (statusReason === "missing_dose_scoring_profile") {
    statusLabel = "Dose target unavailable";
  } else if (statusReason === "dose_not_verified") {
    statusLabel = isStructurallyUsable
      ? "Dose not verified"
      : hasMeaningfulDoseText
        ? "Dose could not be analysed"
        : "Dose unavailable";
  } else if (isStructurallyUsable) {
    statusLabel = statusReason
      ? "Dose comparison unavailable"
      : null;
  } else {
    statusLabel = hasMeaningfulDoseText
      ? "Dose could not be analysed"
      : "Dose unavailable";
  }

  const contradictionDetected = Boolean(
    (displayText && statusLabel === "Dose could not be analysed") ||
      (isStructurallyUsable &&
        [
          "dose_could_not_be_parsed",
          "missing_dose_value",
          "missing_dose_unit",
          "missing_dose_information",
          "missing_actual_dose",
        ].includes(statusReason)) ||
      (!hasMeaningfulDoseText &&
        statusLabel !== "Dose unavailable" &&
        !isStructurallyUsable),
  );

  if (contradictionDetected && isDevelopmentBuild()) {
    console.warn("[dose-contract-invariant]", {
      cleanedIngredientName: normalizedDose?.ingredientName ?? null,
      normalizedValue: normalizedDose?.value ?? null,
      normalizedUnit: normalizedDose?.unit ?? null,
      amountBasis: normalizedDose?.amountBasis ?? null,
      confidence: normalizedDose?.doseConfidence ?? null,
      reviewReason: normalizedDose?.doseReviewReason ?? null,
      contractVersion: normalizedDose?.contractVersion ?? null,
      displayText,
      unavailableReason: statusReason,
      finalStatus: statusLabel,
      scoringEligible: normalizedDose?.isScoringEligible === true,
    });
  }

  return {
    displayText,
    statusLabel,
    statusReason,
    contradictionDetected,
  };
}

export function logDoseContractDiagnostic({
  barcode,
  ingredientName,
  normalizedDose,
  statusLabel,
  scoringValue = null,
  scoringUnit = null,
  scoringStatus = null,
}) {
  if (!isDevelopmentBuild()) {
    return;
  }
  const contradictionDetected = Boolean(
    normalizedDose?.isStructurallyUsable &&
      statusLabel === "Dose could not be analysed",
  );
  if (String(barcode ?? "").trim() !== "0616612990570" && !contradictionDetected) {
    return;
  }
  console.warn("[dose-contract-regression]", {
    cleanedIngredientName:
      normalizedDose?.ingredientName ?? normalizeText(ingredientName),
    originalDoseText: normalizedDose?.dosageOriginalText ?? null,
    parsedCoefficient: normalizedDose?.cfuCoefficient ?? null,
    multiplierToken: normalizedDose?.cfuMultiplierToken ?? null,
    multiplierValue: normalizedDose?.cfuMultiplierValue ?? null,
    normalizedValue: normalizedDose?.value ?? null,
    normalizedUnit: normalizedDose?.unit ?? null,
    amountBasis: normalizedDose?.amountBasis ?? null,
    confidence: normalizedDose?.doseConfidence ?? null,
    reviewReason: normalizedDose?.doseReviewReason ?? null,
    contractVersion: normalizedDose?.contractVersion ?? null,
    displayText: normalizedDose?.displayText ?? null,
    unavailableReason: normalizedDose?.unavailableReason ?? null,
    finalStatus: statusLabel ?? null,
    scoringEligible: normalizedDose?.isScoringEligible === true,
    scoringValue,
    scoringUnit,
    scoringStatus,
  });
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
  const rawIngredientName = firstDefined(source, [
    "ingredientName",
    "canonicalName",
    "canonical_name",
    "name",
  ]);

  const originalIngredientName = normalizeText(rawIngredientName);
  const parsedIngredientNameDose = parseDoseText(originalIngredientName);
  const embeddedNameDose = parsedIngredientNameDose?.ingredientName
    ? parsedIngredientNameDose
    : null;
  const ingredientName = normalizeProbioticIngredientName(
    embeddedNameDose?.ingredientName ?? originalIngredientName,
  );
  const explicitDosageOriginalText = normalizeText(rawOriginalText);
  const dosageOriginalText =
    explicitDosageOriginalText ??
    (embeddedNameDose ? originalIngredientName : null);
  const fallbackDisplayText = stripIngredientPrefix(
    normalizeText(rawDisplayText) ?? explicitDosageOriginalText,
    ingredientName,
  );
  let value = normalizeDoseValue(rawValue);
  let unit = normalizeDoseUnit(rawUnit);
  let parsedFromDisplay = false;
  let parsedRangeMaxValue = null;
  let parsedDisplayText = null;
  let parsedAmountBasis = null;
  let parsedCfuMetadata = null;

  const parsedCfuLabelDose = [
    embeddedNameDose?.unit === "CFU" ? embeddedNameDose : null,
    parseCfuDoseText(dosageOriginalText),
    parseCfuDoseText(fallbackDisplayText),
  ].find(Boolean);
  const reconcilesStructuredCfuCoefficient = Boolean(
    unit === "CFU" &&
      Number.isFinite(value) &&
      parsedCfuLabelDose &&
      parsedCfuLabelDose.multiplierValue > 1 &&
      value === parsedCfuLabelDose.coefficient,
  );
  if (reconcilesStructuredCfuCoefficient) {
    value = parsedCfuLabelDose.value;
    parsedFromDisplay = true;
  }

  if (allowDisplayParsing || embeddedNameDose) {
    const combinedStructuredText = [rawValue, rawUnit]
      .map((item) => normalizeText(String(item ?? "")))
      .filter(Boolean)
      .join(" ");
    const parsedDisplay = [
      embeddedNameDose,
      parseExactDisplayDose(dosageOriginalText),
      parseExactDisplayDose(fallbackDisplayText),
      parseExactDisplayDose(combinedStructuredText),
    ].find(Boolean);
    if (parsedDisplay) {
      if (isMissingStructuredField(rawValue) || !Number.isFinite(value)) {
        value = parsedDisplay.value;
        parsedFromDisplay = true;
      }
      if (isMissingStructuredField(rawUnit) || !unit) {
        unit = parsedDisplay.unit;
        parsedFromDisplay = true;
      }
      if (unit === parsedDisplay.unit && value === parsedDisplay.value) {
        parsedRangeMaxValue = parsedDisplay.maxValue ?? null;
        parsedDisplayText = parsedDisplay.displayText ?? null;
        parsedAmountBasis = parsedDisplay.amountBasis ?? null;
        parsedCfuMetadata =
          parsedDisplay.unit === "CFU" ? parsedDisplay : null;
      }
    }
  }

  if (unit && Number.isFinite(value) && !parsedDisplayText) {
    const doseMetadata = [
      embeddedNameDose,
      parseDoseText(dosageOriginalText),
      parseDoseText(fallbackDisplayText),
    ]
      .find(
        (candidate) =>
          candidate?.unit === unit && candidate.value === value,
      );
    if (doseMetadata) {
      parsedRangeMaxValue = doseMetadata.maxValue ?? null;
      parsedDisplayText = doseMetadata.displayText ?? null;
      parsedAmountBasis = doseMetadata.amountBasis ?? null;
      parsedCfuMetadata = doseMetadata.unit === "CFU" ? doseMetadata : null;
    }
  }

  const hasValue = Number.isFinite(value);
  const hasUnit = Boolean(unit);
  const unitSupported = hasUnit && SUPPORTED_DOSE_UNITS.has(unit);
  const amountBasis =
    normalizeDoseAmountBasis(rawAmountBasis) ?? parsedAmountBasis;
  const amountBasisSupported = SUPPORTED_AMOUNT_BASES.has(amountBasis);
  const doseConfidence = normalizeDoseConfidence(rawConfidence);
  const confidenceStatus = doseConfidence ?? "legacy";
  // Backward compatibility: rows written before confidence metadata existed
  // remain eligible. Explicit unverified or missing confidence always fails closed.
  const confidenceEligible =
    doseConfidence === "verified" || doseConfidence === null;
  const isStructurallyUsable = hasValue && unitSupported;
  const hasMeaningfulDoseText = Boolean(
    embeddedNameDose ||
      hasMeaningfulDoseEvidenceText(fallbackDisplayText) ||
      normalizeText(String(rawValue ?? "")) ||
      normalizeText(String(rawUnit ?? "")),
  );

  let unavailableReason = null;
  if (!hasValue && !hasUnit) {
    unavailableReason =
      hasMeaningfulDoseText
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
    ? parsedDisplayText || formatStructuredDose(value, unit, parsedRangeMaxValue)
    : null;
  const normalizedDose = {
    contractVersion: DOSE_CONTRACT_VERSION,
    ingredientName,
    originalIngredientName,
    value: hasValue ? value : null,
    unit: hasUnit ? unit : null,
    amountBasis,
    dosageOriginalText,
    displayText: structuredDisplay,
    labelText: fallbackDisplayText,
    doseConfidence,
    doseReviewReason: normalizeText(rawReviewReason),
    confidenceStatus,
    isVerified: doseConfidence === "verified",
    isLegacyConfidence: doseConfidence === null,
    isStructurallyUsable,
    hasMeaningfulDoseText,
    isScoringEligible:
      isStructurallyUsable && amountBasisSupported && confidenceEligible,
    unavailableReason,
    parsedFromDisplay,
    parsedFromIngredientName: Boolean(embeddedNameDose),
    rangeMaxValue: parsedRangeMaxValue,
    cfuCoefficient: parsedCfuMetadata?.coefficient ?? null,
    cfuMultiplierToken: parsedCfuMetadata?.multiplierToken ?? null,
    cfuMultiplierValue: parsedCfuMetadata?.multiplierValue ?? null,
  };
  return {
    ...normalizedDose,
    presentation: resolveNormalizedDosePresentation(normalizedDose),
  };
}
