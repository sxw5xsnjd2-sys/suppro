const CATEGORY_VALUES = new Set([
  "vitamin_mineral",
  "herbal_botanical",
  "sports_nutrition",
  "protein",
  "electrolyte",
  "probiotic",
  "omega_fatty_acid",
  "other_supplement",
  "not_supplement",
]);

const AMOUNT_BASIS_VALUES = new Set([
  "per_serving",
  "per_capsule",
  "per_tablet",
  "per_softgel",
  "per_scoop",
  "per_drop",
  "per_daily_dose",
  "per_100g",
  "unknown",
]);

const EVIDENCE_SOURCE_VALUES = new Set([
  "ingredient_panel_ocr",
  "ingredient_panel_image",
  "front_label",
  "unknown",
]);

const INGREDIENT_TYPE_VALUES = new Set(["active", "inactive", "uncertain"]);
const DOSE_DECISION_VALUES = new Set([
  "verified",
  "corrected",
  "retracted",
  "unverified",
  "missing",
]);
const DOSE_REVIEW_REASON_VALUES = new Set([
  "ingredient_row_not_found",
  "dose_not_on_same_row",
  "ambiguous_neighboring_dose",
  "conflicting_same_row_dose",
  "verifier_retracted_dose",
  "verifier_inconclusive",
  "verifier_output_invalid",
  "front_label_only",
  "malformed_model_output",
  "ocr_evidence_inconclusive",
  "ocr_geometry_unavailable",
  "ocr_structure_unavailable",
  "missing_dose_value",
  "missing_dose_unit",
  "unsupported_unit",
]);
const ALLOWED_UNITS = new Set([
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
const SENTINEL_VALUES = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "none",
  "not available",
  "not provided",
  "null",
  "undefined",
  "unknown",
  "unavailable",
]);

const PHOTO_RESCUE_REQUIRED_FIELDS = [
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
  "raw_text",
  "ingredients_found",
];

const INGREDIENT_REQUIRED_FIELDS = [
  "raw_name",
  "canonical_name",
  "ingredient_type",
  "dosage_value",
  "dosage_unit",
  "dosage_original_text",
  "chemical_form",
  "amount_basis",
  "evidence_source",
];

const DOSE_CORRECTION_REQUIRED_FIELDS = [
  "index",
  "decision",
  "dosage_value",
  "dosage_unit",
  "dosage_original_text",
  "review_reason",
];

const VERIFICATION_ALIAS_GROUPS = [
  ["vitamin a", "retinol", "beta carotene"],
  ["vitamin b1", "thiamine", "thiamin"],
  ["vitamin b2", "riboflavin"],
  ["vitamin b3", "niacin", "niacinamide", "nicotinamide"],
  ["vitamin b5", "pantothenic acid"],
  ["vitamin b6", "pyridoxine", "pyridoxal phosphate", "p5p"],
  ["vitamin b7", "biotin"],
  ["vitamin b9", "folate", "folic acid", "methylfolate", "5 mthf"],
  [
    "vitamin b12",
    "cobalamin",
    "methylcobalamin",
    "cyanocobalamin",
    "adenosylcobalamin",
    "hydroxocobalamin",
  ],
  ["vitamin c", "ascorbic acid", "sodium ascorbate", "calcium ascorbate"],
  [
    "vitamin d",
    "vitamin d2",
    "vitamin d3",
    "cholecalciferol",
    "ergocalciferol",
  ],
  ["vitamin e", "tocopherol", "alpha tocopherol"],
  ["vitamin k", "vitamin k1", "vitamin k2", "phylloquinone", "menaquinone"],
  ["dha", "docosahexaenoic acid"],
  ["epa", "eicosapentaenoic acid"],
];

const FORM_WORDS = new Set([
  "acetate",
  "as",
  "aspartate",
  "bisglycinate",
  "capsule",
  "chelate",
  "chloride",
  "citrate",
  "extract",
  "gluconate",
  "glycinate",
  "hydrochloride",
  "leaf",
  "malate",
  "monohydrate",
  "oxide",
  "picolinate",
  "powder",
  "root",
  "salt",
  "softgel",
  "tablet",
  "taurate",
  "threonate",
]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value) {
  return trimString(value).replace(/\s+/gu, " ").trim();
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerValue(value) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeUnit(value) {
  const normalized = normalizeWhitespace(value).toLowerCase().replace(
    /[µμ]/gu,
    "u",
  );
  if (!normalized || SENTINEL_VALUES.has(normalized)) return null;
  if (["ug", "mcg", "microgram", "micrograms"].includes(normalized)) {
    return "mcg";
  }
  if (["mg", "milligram", "milligrams"].includes(normalized)) return "mg";
  if (["g", "gram", "grams"].includes(normalized)) return "g";
  if (["ml", "milliliter", "milliliters", "millilitre", "millilitres"].includes(normalized)) {
    return "ml";
  }
  if (["iu", "international unit", "international units"].includes(normalized)) {
    return "IU";
  }
  if (
    normalized === "cfu" ||
    /^colony[\s-]+forming[\s-]+units?$/u.test(normalized) ||
    /^viable[\s-]+organisms?$/u.test(normalized) ||
    /^live[\s-]+cultures?$/u.test(normalized)
  ) {
    return "CFU";
  }
  if (["fcc", "hut", "du", "fip", "alu", "gdu", "pu"].includes(normalized)) {
    return normalized.toUpperCase();
  }
  return normalized;
}

function normalizeName(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’']/gu, "")
    .replace(/[_/|]+/gu, " ")
    .replace(/[()[\]{}.,:;!?+\-]+/gu, " ")
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(?:mcg|mg|g|ml|iu|cfu|ug|fcc|hut|du|fip|alu|gdu|pu|colony[\s-]+forming[\s-]+units?|viable[\s-]+organisms?|live[\s-]+cultures?)\b/giu,
      " ",
    )
    .replace(/\b(?:ingredients?|contains|supplement facts?)\b:?/giu, " ")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .trim();
}

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

export function normalizeProbioticIngredientName(value) {
  const text = normalizeWhitespace(value);
  if (!text) return "";
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
  const tokens = normalizeProbioticIngredientName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
  const genusIndex = tokens.findIndex((token) => PROBIOTIC_GENERA.has(token));
  if (genusIndex < 0) return null;
  const genus = tokens[genusIndex];
  const speciesToken = tokens[genusIndex + 1] ?? null;
  const species = speciesToken &&
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

export function isProbioticCanonicalMatchAllowed(sourceName, targetName) {
  const compatibility = getProbioticIdentityCompatibility(
    sourceName,
    targetName,
  );
  return !compatibility.applies || compatibility.compatible;
}

function isSingleEditApart(left, right) {
  if (left === right) return true;
  if (!left || !right || Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function probioticIdentityMatchesOcrRow(rowText, key) {
  const expected = getProbioticIdentity(key);
  const observed = getProbioticIdentity(rowText);
  if (!expected?.species || !observed?.species) return false;
  return expected.genus === observed.genus &&
    (expected.species === observed.species ||
      (expected.species.length >= 5 &&
        observed.species.length >= 5 &&
        isSingleEditApart(expected.species, observed.species)));
}

function addNameVariants(keys, value) {
  const raw = normalizeWhitespace(value);
  if (!raw) return;

  const candidates = [raw];
  const withoutParentheses = raw.replace(/\([^)]*\)/gu, " ");
  if (withoutParentheses !== raw) candidates.push(withoutParentheses);
  for (const match of raw.matchAll(/\(([^)]*)\)/gu)) {
    candidates.push(match[1]);
  }

  candidates.forEach((candidate) => {
    const normalized = normalizeName(candidate);
    if (!normalized) return;
    keys.add(normalized);

    const withoutForms = normalized
      .split(" ")
      .filter((token) => !FORM_WORDS.has(token))
      .join(" ")
      .trim();
    if (withoutForms) keys.add(withoutForms);
  });
}

export function buildIngredientVerificationKeys({
  ingredientName,
  rawName,
  chemicalForm,
}) {
  const keys = new Set();
  const identityKeys = new Set();
  addNameVariants(keys, ingredientName);
  addNameVariants(keys, rawName);
  addNameVariants(keys, chemicalForm);
  addNameVariants(identityKeys, ingredientName);
  addNameVariants(identityKeys, rawName);

  const initialKeys = Array.from(keys);
  VERIFICATION_ALIAS_GROUPS.forEach((aliases) => {
    if (
      initialKeys.some((key) =>
        aliases.some((alias) =>
          new RegExp(`(?:^|\\s)${escapeRegExp(alias)}(?:$|\\s)`, "u").test(key)
        )
      )
    ) {
      aliases.forEach((alias) => keys.add(alias));
    }
  });

  const filteredKeys = Array.from(keys)
    .filter(
      (key) =>
        key.length >= 2 &&
        key.split(" ").some((token) => !FORM_WORDS.has(token)),
    )
    .sort((left, right) => right.length - left.length);
  if (filteredKeys.length) return filteredKeys;

  return Array.from(identityKeys)
    .filter((key) => key.length >= 4)
    .sort((left, right) => right.length - left.length);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function phraseAppears(text, phrase) {
  if (!text || !phrase) return false;
  return new RegExp(`(?:^|\\s)${escapeRegExp(phrase)}(?:$|\\s)`, "u").test(
    text,
  );
}

function differsByAtMostOneCharacter(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    let differences = 0;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences += 1;
      if (differences > 1) return false;
    }
    return true;
  }
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shorterIndex = 0;
  let longerIndex = 0;
  let skipped = false;
  while (shorterIndex < shorter.length && longerIndex < longer.length) {
    if (shorter[shorterIndex] === longer[longerIndex]) {
      shorterIndex += 1;
      longerIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longerIndex += 1;
  }
  return true;
}

function conservativeOcrPhraseAppears(text, phrase) {
  const textTokens = normalizeWhitespace(text).split(" ").filter(Boolean);
  const phraseTokens = normalizeWhitespace(phrase).split(" ").filter(Boolean);
  if (!phraseTokens.length || textTokens.length < phraseTokens.length) {
    return false;
  }
  for (
    let start = 0;
    start <= textTokens.length - phraseTokens.length;
    start += 1
  ) {
    let fuzzyMatches = 0;
    let matches = true;
    for (let offset = 0; offset < phraseTokens.length; offset += 1) {
      const textToken = textTokens[start + offset];
      const phraseToken = phraseTokens[offset];
      if (textToken === phraseToken) continue;
      if (
        fuzzyMatches > 0 ||
        textToken.length < 5 ||
        phraseToken.length < 5 ||
        !/^[a-z]+$/u.test(textToken) ||
        !/^[a-z]+$/u.test(phraseToken) ||
        !differsByAtMostOneCharacter(textToken, phraseToken)
      ) {
        matches = false;
        break;
      }
      fuzzyMatches += 1;
    }
    if (matches && fuzzyMatches === 1) return true;
  }
  return false;
}

function parsePolygonBounds(value) {
  const points = Array.isArray(value) ? value : [];
  const coordinates = [];

  if (points.every((point) => typeof point === "number")) {
    for (let index = 0; index + 1 < points.length; index += 2) {
      coordinates.push({ x: points[index], y: points[index + 1] });
    }
  } else {
    points.forEach((point) => {
      const x = finiteNumber(point?.x);
      const y = finiteNumber(point?.y);
      if (x !== null && y !== null) coordinates.push({ x, y });
    });
  }

  if (!coordinates.length) return null;
  const xs = coordinates.map((point) => point.x);
  const ys = coordinates.map((point) => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function readBounds(candidate) {
  const regions = Array.isArray(candidate?.boundingRegions)
    ? candidate.boundingRegions
    : [];
  const region = regions[0] ?? null;
  return {
    pageNumber: integerValue(region?.pageNumber),
    bounds: parsePolygonBounds(region?.polygon ?? candidate?.polygon),
  };
}

function averageConfidence(items) {
  const values = items
    .map((item) => finiteNumber(item?.confidence))
    .filter((value) => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
const STANDARD_UNIT_PATTERN =
  "(?:mcg|[µμ]g|ug|micrograms?|mg|milligrams?|g|grams?|ml|millilit(?:er|re)s?|iu|international[\\s-]+units?|fcc|hut|du|fip|alu|gdu|pu)";
const STANDARD_NUMBER_PATTERN =
  "(?:\\d+(?:\\.\\d+)?\\s*(?:[×x*]\\s*10\\s*\\^\\s*[+-]?\\d+|e[+-]?\\d+)|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:[.,]\\d+)?)";
const STANDARD_MULTIPLIER_PATTERN = "(?:thousand|million|billion|trillion)";
const STANDARD_SUFFIX_PATTERN = new RegExp(
  `(${STANDARD_NUMBER_PATTERN})\\s*(${STANDARD_MULTIPLIER_PATTERN})?` +
    `(?:\\s*(?:-|–|—|to)\\s*(${STANDARD_NUMBER_PATTERN})\\s*(${STANDARD_MULTIPLIER_PATTERN})?)?` +
    `\\s*(${STANDARD_UNIT_PATTERN})\\b`,
  "giu",
);

function isSafeCfuValue(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function parseCfuNumberToken(value) {
  const compact = normalizeWhitespace(value).replace(/\s+/gu, "");
  const scientific = compact.match(
    /^(\d+(?:\.\d+)?)(?:[×x*]10\^([+-]?\d+)|e([+-]?\d+))$/iu,
  );
  if (scientific) {
    const exponent = Number(scientific[2] ?? scientific[3]);
    const coefficient = Number(scientific[1]);
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > 15) {
      return null;
    }
    const result = coefficient * 10 ** exponent;
    return isSafeCfuValue(result) ? result : null;
  }

  let normalized = compact;
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(compact)) {
    normalized = compact.replace(/,/gu, "");
  } else if (!/^\d+(?:\.\d+)?$/u.test(compact)) {
    return null;
  }
  const result = Number(normalized);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function parseCfuCandidateAmount(value, multiplier) {
  const parsed = parseCfuNumberToken(value);
  const factor = multiplier
    ? CFU_MULTIPLIERS.get(normalizeWhitespace(multiplier).toLowerCase())
    : 1;
  if (!Number.isFinite(parsed) || !factor) return null;
  const result = parsed * factor;
  return isSafeCfuValue(result) ? result : null;
}

function collectCfuCandidates(text, pattern, { unitFirst = false } = {}) {
  pattern.lastIndex = 0;
  const candidates = [];
  for (const match of text.matchAll(pattern)) {
    const numericIndex = unitFirst
      ? match.index + match[0].search(/\d/u)
      : match.index;
    if (numericIndex > 0 && /[\d,]/u.test(text[numericIndex - 1])) {
      continue;
    }
    const firstMultiplier = match[2] || (match[3] ? match[4] : null);
    const secondMultiplier = match[4] || match[2] || null;
    const coefficient = parseCfuNumberToken(match[1]);
    const multiplierToken = firstMultiplier
      ? normalizeWhitespace(firstMultiplier).toLowerCase()
      : null;
    const multiplierValue = multiplierToken
      ? CFU_MULTIPLIERS.get(multiplierToken)
      : 1;
    const parsedValue = parseCfuCandidateAmount(match[1], firstMultiplier);
    const maxValue = match[3]
      ? parseCfuCandidateAmount(match[3], secondMultiplier)
      : null;
    if (
      !isSafeCfuValue(parsedValue) ||
      (match[3] && (!isSafeCfuValue(maxValue) || maxValue < parsedValue))
    ) {
      continue;
    }
    candidates.push({
      text: match[0],
      value: parsedValue,
      maxValue,
      unit: "CFU",
      coefficient,
      multiplierToken,
      multiplierValue,
    });
  }
  return candidates;
}

function normalizeDoseCandidateOcrText(value) {
  return normalizeWhitespace(value)
    .replace(/\bbilion\b/giu, "billion")
    .replace(/\bi\s*\.\s*u\s*\.?/giu, "IU")
    .replace(/\bcfu\d{1,2}(?=\s|$|[()[\]{}*†‡#.,;:])/giu, "CFU");
}

export function parseCfuDoseText(value) {
  const text = normalizeDoseCandidateOcrText(value);
  if (!text) return null;
  const candidates = [
    ...collectCfuCandidates(text, CFU_SUFFIX_PATTERN),
    ...collectCfuCandidates(text, CFU_PREFIX_PATTERN, { unitFirst: true }),
  ];
  const distinctCandidates = new Map();
  candidates.forEach((candidate) => {
    const key = `${candidate.value}|${candidate.maxValue ?? ""}`;
    if (!distinctCandidates.has(key)) {
      distinctCandidates.set(key, candidate);
    }
  });
  return distinctCandidates.size === 1
    ? Array.from(distinctCandidates.values())[0]
    : null;
}

function collectStandardCandidates(text) {
  STANDARD_SUFFIX_PATTERN.lastIndex = 0;
  const candidates = [];
  for (const match of text.matchAll(STANDARD_SUFFIX_PATTERN)) {
    if (match.index > 0 && /[\d,]/u.test(text[match.index - 1])) continue;
    const firstMultiplier = match[2] || (match[3] ? match[4] : null);
    const secondMultiplier = match[4] || match[2] || null;
    const value = parseStandardCandidateAmount(match[1], firstMultiplier);
    const maxValue = match[3]
      ? parseStandardCandidateAmount(match[3], secondMultiplier)
      : null;
    const unit = normalizeUnit(match[5]);
    if (
      !Number.isFinite(value) ||
      !ALLOWED_UNITS.has(unit) ||
      (match[3] && (!Number.isFinite(maxValue) || maxValue < value))
    ) {
      continue;
    }
    candidates.push({ text: match[0], value, maxValue, unit });
  }
  return candidates;
}

function parseStandardCandidateAmount(value, multiplier) {
  const compact = normalizeWhitespace(value).replace(/\s+/gu, "");
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
  } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(compact)) {
    parsed = Number(compact.replace(/,/gu, ""));
  } else if (/^\d+(?:[.,]\d+)?$/u.test(compact)) {
    parsed = Number(compact.replace(",", "."));
  }
  const factor = multiplier
    ? CFU_MULTIPLIERS.get(normalizeWhitespace(multiplier).toLowerCase())
    : 1;
  if (!Number.isFinite(parsed) || !factor) return null;
  const result = parsed * factor;
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function extractDoseCandidates(value) {
  const text = normalizeDoseCandidateOcrText(value);
  const conventional = collectStandardCandidates(text);
  const cfuCandidates = [
    ...collectCfuCandidates(text, CFU_SUFFIX_PATTERN),
    ...collectCfuCandidates(text, CFU_PREFIX_PATTERN, { unitFirst: true }),
  ];
  return [...conventional, ...cfuCandidates].map(
    ({
      maxValue: _max,
      coefficient: _coefficient,
      multiplierToken: _multiplierToken,
      multiplierValue: _multiplierValue,
      ...item
    }) => item,
  );
}

function extractStructuredTableRows(tables) {
  if (!Array.isArray(tables)) return [];
  const rows = [];

  tables.forEach((table, tableIndex) => {
    const cells = Array.isArray(table?.cells) ? table.cells : [];
    const rowsByIndex = new Map();

    cells.forEach((candidate) => {
      const rowIndex = integerValue(candidate?.rowIndex);
      const columnIndex = integerValue(candidate?.columnIndex);
      const text = normalizeWhitespace(candidate?.content);
      if (rowIndex === null || columnIndex === null || !text) return;
      const coordinates = readBounds(candidate);
      const cell = {
        rowIndex,
        columnIndex,
        rowSpan: integerValue(candidate?.rowSpan) ?? 1,
        columnSpan: integerValue(candidate?.columnSpan) ?? 1,
        text,
        confidence: finiteNumber(candidate?.confidence),
        pageNumber: coordinates.pageNumber,
        bounds: coordinates.bounds,
        doseCandidates: extractDoseCandidates(text),
      };
      const rowCells = rowsByIndex.get(rowIndex) ?? [];
      rowCells.push(cell);
      rowsByIndex.set(rowIndex, rowCells);
    });

    Array.from(rowsByIndex.keys())
      .sort((left, right) => left - right)
      .forEach((rowIndex) => {
        const rowCells = rowsByIndex
          .get(rowIndex)
          .sort((left, right) => left.columnIndex - right.columnIndex);
        const text = rowCells.map((cell) => cell.text).join("\t");
        const bounds = rowCells.map((cell) => cell.bounds).filter(Boolean);
        rows.push({
          id: `table-${tableIndex}-row-${rowIndex}`,
          tableIndex,
          rowIndex,
          text,
          cells: rowCells,
          confidence: averageConfidence(rowCells),
          pageNumber: rowCells.find((cell) =>
            cell.pageNumber !== null
          )?.pageNumber ?? null,
          bounds: bounds.length
            ? {
              left: Math.min(...bounds.map((item) => item.left)),
              top: Math.min(...bounds.map((item) => item.top)),
              right: Math.max(...bounds.map((item) => item.right)),
              bottom: Math.max(...bounds.map((item) => item.bottom)),
            }
            : null,
          doseCandidates: extractDoseCandidates(text),
        });
      });
  });

  return rows;
}

function extractStructuredLines(pages) {
  if (!Array.isArray(pages)) return [];
  const lines = [];

  pages.forEach((page, pageIndex) => {
    const pageNumber = integerValue(page?.pageNumber) ?? pageIndex + 1;
    const pageLines = Array.isArray(page?.lines) ? page.lines : [];
    pageLines.forEach((candidate, lineIndex) => {
      const text = normalizeWhitespace(candidate?.content);
      if (!text) return;
      const coordinates = readBounds(candidate);
      lines.push({
        id: `page-${pageNumber}-line-${lineIndex}`,
        pageNumber: coordinates.pageNumber ?? pageNumber,
        lineIndex,
        text,
        confidence: finiteNumber(candidate?.confidence),
        bounds: coordinates.bounds,
        doseCandidates: extractDoseCandidates(text),
      });
    });
  });

  return lines;
}

function boundsCenterY(bounds) {
  return bounds ? (bounds.top + bounds.bottom) / 2 : null;
}

function combineBounds(items) {
  const bounds = items.map((item) => item?.bounds).filter(Boolean);
  if (!bounds.length) return null;
  return {
    left: Math.min(...bounds.map((item) => item.left)),
    top: Math.min(...bounds.map((item) => item.top)),
    right: Math.max(...bounds.map((item) => item.right)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  };
}

function verticalOverlapScore(left, right) {
  if (!left || !right) return 0;
  const overlap = Math.max(
    0,
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
  );
  const shortestHeight = Math.min(boundsHeight(left), boundsHeight(right));
  return shortestHeight > 0 ? overlap / shortestHeight : 0;
}

function horizontalOverlapScore(left, right) {
  if (!left || !right) return 0;
  const shortestWidth = Math.min(
    Math.max(0, left.right - left.left),
    Math.max(0, right.right - right.left),
  );
  return shortestWidth > 0 ? horizontalOverlap(left, right) / shortestWidth : 0;
}

function centerDistanceScore(left, right, rowHeight) {
  const leftCenter = boundsCenterY(left);
  const rightCenter = boundsCenterY(right);
  if (leftCenter === null || rightCenter === null || rowHeight <= 0) return 0;
  return Math.max(0, 1 - Math.abs(leftCenter - rightCenter) / rowHeight);
}

function verticalGap(left, right) {
  if (!left || !right) return Infinity;
  if (left.bottom < right.top) return right.top - left.bottom;
  if (right.bottom < left.top) return left.top - right.bottom;
  return 0;
}

function horizontalGap(left, right) {
  if (!left || !right) return Infinity;
  if (left.right < right.left) return right.left - left.right;
  if (right.right < left.left) return left.left - right.right;
  return 0;
}

function isFootnoteOnlyText(value) {
  return /^[\s()[\]{}*†‡#.,;:\-–—]+$/u.test(normalizeWhitespace(value));
}

function removeDoseCandidateText(text, candidate) {
  const index = text.indexOf(candidate?.text ?? "");
  if (index < 0 || !candidate?.text) return text;
  return `${text.slice(0, index)} ${text.slice(index + candidate.text.length)}`;
}

function isDoseDecorationOnlyText(value) {
  return !normalizeWhitespace(value)
    .replace(/\b(?:re|rae|dfe|ne|nrv|ri)\b/giu, " ")
    .replace(/\b(?:alpha|a|α)[\s-]*te\b/giu, " ")
    .replace(/\d+(?:[.,]\d+)?\s*%/gu, " ")
    .replace(/[\s()[\]{}*†‡#.,;:\-–—/%]+/gu, "")
    .trim();
}

function selectDoseFragmentCandidate(value) {
  const text = normalizeDoseCandidateOcrText(value);
  if (!text) return null;
  const candidates = extractDoseCandidates(text);
  if (candidates.length === 1) {
    return isDoseDecorationOnlyText(
        removeDoseCandidateText(text, candidates[0]),
      )
      ? candidates[0]
      : null;
  }
  if (candidates.length !== 2) return null;

  const [primary, alternate] = candidates;
  const primaryIndex = text.indexOf(primary.text);
  const alternateIndex = text.indexOf(alternate.text, primaryIndex + primary.text.length);
  const openingParenthesis = text.lastIndexOf("(", alternateIndex);
  const closingParenthesis = text.indexOf(")", alternateIndex + alternate.text.length);
  const units = new Set([primary.unit, alternate.unit]);
  const isSupportedEquivalentPair =
    units.has("IU") && (units.has("mcg") || units.has("mg"));
  const alternateIsParenthetical =
    primaryIndex >= 0 &&
    alternateIndex > primaryIndex + primary.text.length &&
    openingParenthesis >= primaryIndex + primary.text.length &&
    closingParenthesis >= alternateIndex + alternate.text.length;
  if (!isSupportedEquivalentPair || !alternateIsParenthetical) return null;

  const withoutPrimary = removeDoseCandidateText(text, primary);
  const withoutCandidates = removeDoseCandidateText(withoutPrimary, alternate);
  return isDoseDecorationOnlyText(withoutCandidates) ? primary : null;
}

function selectDoseFollowingIngredientIdentity(value, identityNames) {
  const text = normalizeDoseCandidateOcrText(value);
  const names = (Array.isArray(identityNames) ? identityNames : [])
    .map(normalizeWhitespace)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  const candidates = extractDoseCandidates(text)
    .map((candidate) => ({
      candidate,
      index: text.indexOf(candidate.text),
    }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index);
  if (!candidates.length) return null;

  for (const name of names) {
    const identityMatch = new RegExp(
      `(?:^|\\s)${escapeRegExp(name)}(?=$|\\s|[(:])`,
      "iu",
    ).exec(text);
    if (!identityMatch) continue;
    const identityStart = identityMatch.index +
      (identityMatch[0].length - name.length);
    const identityEnd = identityStart + name.length;
    const following = candidates.filter(({ index }) => index >= identityEnd);
    if (!following.length) continue;
    const first = following[0];
    const betweenIdentityAndDose = text.slice(identityEnd, first.index);
    if (!isDoseDecorationOnlyText(betweenIdentityAndDose)) continue;
    if (following.length > 1) {
      const afterFirstDose = first.index + first.candidate.text.length;
      const betweenDoses = text.slice(afterFirstDose, following[1].index);
      if (isDoseDecorationOnlyText(betweenDoses)) continue;
    }
    return first.candidate;
  }
  return null;
}

function isReferenceIntakeOnlyText(value) {
  const text = normalizeWhitespace(value)
    .replace(/[()[\]{}*†‡#.:]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return /^(?:(?:%\s*)?(?:nrv|ri)|\d+(?:[.,]\d+)?\s*%(?:\s*(?:nrv|ri))?)$/iu.test(
    text,
  );
}

function isDoseFragmentOnlyText(value) {
  const text = normalizeDoseCandidateOcrText(value);
  if (!text) return false;
  if (selectDoseFragmentCandidate(text)) return true;

  const unwrapped = text
    .replace(/[()[\]{}*†‡#]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return /^(?:(?:\d+(?:[.,]\d+)?)(?:\s*(?:thousand|million|billion|trillion|bn|[bm]))?|(?:thousand|million|billion|trillion|bn|[bm])?(?:\s*(?:cfu|colony[\s-]+forming[\s-]+units?|viable[\s-]+organisms?|live[\s-]+cultures?))|(?:\d+(?:[.,]\d+)?\s*)?(?:thousand|million|billion|trillion|bn|[bm])\s*(?:cfu|colony[\s-]+forming[\s-]+units?|viable[\s-]+organisms?|live[\s-]+cultures?))$/iu.test(
    unwrapped,
  );
}

function median(values) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function sortFragmentsForReading(items) {
  return [...items].sort((left, right) => {
    const overlap = verticalOverlapScore(left.bounds, right.bounds);
    if (overlap >= 0.45) {
      return left.bounds.left - right.bounds.left;
    }
    return left.bounds.top - right.bounds.top ||
      left.bounds.left - right.bounds.left;
  });
}

function joinFragmentText(items) {
  return sortFragmentsForReading(items)
    .map((item) => item.text)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildRepresentativeBounds(items, fallbackHeight) {
  const bounds = items.map((item) => item?.bounds).filter(Boolean);
  if (!bounds.length) return null;
  const combined = combineBounds(items);
  const weighted = bounds.reduce(
    (result, item) => {
      const weight = Math.max(boundsHeight(item), 0.01);
      return {
        weightedCenter:
          result.weightedCenter + boundsCenterY(item) * weight,
        totalWeight: result.totalWeight + weight,
      };
    },
    { weightedCenter: 0, totalWeight: 0 },
  );
  const center = weighted.weightedCenter / weighted.totalWeight;
  const representativeHeight = Math.max(
    0.01,
    Math.min(
      fallbackHeight || Infinity,
      median(bounds.map((item) => boundsHeight(item))) || fallbackHeight || 1,
    ),
  );
  return {
    left: combined.left,
    top: center - representativeHeight / 2,
    right: combined.right,
    bottom: center + representativeHeight / 2,
  };
}

function canMergeDoseFragments(left, right, rowHeight) {
  if (
    !left?.bounds || !right?.bounds ||
    left.pageNumber !== right.pageNumber
  ) {
    return false;
  }
  const overlapY = verticalOverlapScore(left.bounds, right.bounds);
  const overlapX = horizontalOverlapScore(left.bounds, right.bounds);
  const gapX = horizontalGap(left.bounds, right.bounds);
  const gapY = verticalGap(left.bounds, right.bounds);
  return (overlapY >= 0.45 && gapX <= rowHeight * 2.5) ||
    (overlapX >= 0.45 && gapY <= rowHeight * 0.55);
}

function parseCombinedDoseFragments(fragments) {
  const text = joinFragmentText(fragments);
  return selectDoseFragmentCandidate(text);
}

function buildDoseBlocks(lines, rowHeight) {
  const fragments = lines.filter(
    (line) => line.bounds && isDoseFragmentOnlyText(line.text),
  ).sort((left, right) => {
    if (left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }
    if (verticalOverlapScore(left.bounds, right.bounds) >= 0.45) {
      return left.bounds.left - right.bounds.left;
    }
    return left.bounds.top - right.bounds.top ||
      left.bounds.left - right.bounds.left;
  });
  const complete = [];
  const incomplete = [];
  fragments.forEach((fragment) => {
    const candidate = selectDoseFragmentCandidate(fragment.text);
    if (candidate) {
      complete.push({
        id: `dose-${fragment.id}`,
        pageNumber: fragment.pageNumber,
        fragments: [fragment],
        text: fragment.text,
        bounds: fragment.bounds,
        matchBounds: fragment.bounds,
        doseCandidate: candidate,
        confidence: finiteNumber(fragment.confidence),
      });
    } else {
      incomplete.push(fragment);
    }
  });

  const combinations = [];
  for (let first = 0; first < incomplete.length; first += 1) {
    for (let second = first + 1; second < incomplete.length; second += 1) {
      if (!canMergeDoseFragments(incomplete[first], incomplete[second], rowHeight)) {
        continue;
      }
      const pair = [incomplete[first], incomplete[second]];
      const pairCandidate = parseCombinedDoseFragments(pair);
      if (pairCandidate) {
        combinations.push({ fragments: pair, candidate: pairCandidate });
        continue;
      }
      for (let third = second + 1; third < incomplete.length; third += 1) {
        if (
          !pair.some((fragment) =>
            canMergeDoseFragments(fragment, incomplete[third], rowHeight)
          )
        ) {
          continue;
        }
        const triple = [...pair, incomplete[third]];
        const tripleCandidate = parseCombinedDoseFragments(triple);
        if (tripleCandidate) {
          combinations.push({ fragments: triple, candidate: tripleCandidate });
        }
      }
    }
  }

  combinations.sort((left, right) =>
    right.fragments.length - left.fragments.length ||
    boundsHeight(combineBounds(left.fragments)) -
      boundsHeight(combineBounds(right.fragments))
  );
  const usedFragmentIds = new Set();
  const merged = [];
  combinations.forEach(({ fragments: groupedFragments, candidate }) => {
    if (groupedFragments.some((fragment) => usedFragmentIds.has(fragment.id))) {
      return;
    }
    groupedFragments.forEach((fragment) => usedFragmentIds.add(fragment.id));
    merged.push({
      id: `dose-${groupedFragments.map((fragment) => fragment.id).join("+")}`,
      pageNumber: groupedFragments[0].pageNumber,
      fragments: groupedFragments,
      text: joinFragmentText(groupedFragments),
      bounds: combineBounds(groupedFragments),
      matchBounds: buildRepresentativeBounds(groupedFragments, rowHeight),
      doseCandidate: candidate,
      confidence: averageConfidence(groupedFragments),
    });
  });

  return [...complete, ...merged];
}

function canMergeIngredientFragments(left, right, rowHeight) {
  if (
    !left?.bounds || !right?.bounds ||
    left.pageNumber !== right.pageNumber ||
    getProbioticIdentity(right.text)
  ) {
    return false;
  }
  if (
    horizontalOverlapScore(left.bounds, right.bounds) < 0.45 ||
    verticalGap(left.bounds, right.bounds) > rowHeight * 0.45
  ) {
    return false;
  }
  const combinedIdentity = getProbioticIdentity(`${left.text} ${right.text}`);
  return Boolean(combinedIdentity?.species);
}

function buildIngredientBlocks(lines, rowHeight) {
  const fragments = lines
    .filter((line) =>
      line.bounds &&
      !isDoseFragmentOnlyText(line.text) &&
      !isFootnoteOnlyText(line.text) &&
      !isReferenceIntakeOnlyText(line.text) &&
      extractDoseCandidates(line.text).length === 0
    )
    .sort((left, right) =>
      left.pageNumber - right.pageNumber ||
      left.bounds.top - right.bounds.top ||
      left.bounds.left - right.bounds.left
    );
  const blocks = [];
  for (let index = 0; index < fragments.length; index += 1) {
    const first = fragments[index];
    const second = fragments[index + 1];
    const groupedFragments = canMergeIngredientFragments(
        first,
        second,
        rowHeight,
      )
      ? [first, second]
      : [first];
    if (groupedFragments.length === 2) index += 1;
    blocks.push({
      id: `ingredient-${groupedFragments.map((item) => item.id).join("+")}`,
      pageNumber: first.pageNumber,
      fragments: groupedFragments,
      text: joinFragmentText(groupedFragments),
      bounds: combineBounds(groupedFragments),
      matchBounds: buildRepresentativeBounds(groupedFragments, rowHeight),
      confidence: averageConfidence(groupedFragments),
    });
  }
  return blocks;
}

function buildGeometryAssociation(ingredient, dose, rowHeight) {
  const ingredientBounds = ingredient?.matchBounds || ingredient?.bounds;
  const doseBounds = dose?.matchBounds || dose?.bounds;
  if (
    !ingredientBounds || !doseBounds ||
    ingredient.pageNumber !== dose.pageNumber ||
    ingredientBounds.left >= doseBounds.left ||
    ingredientBounds.right > doseBounds.right
  ) {
    return null;
  }
  const overlap = verticalOverlapScore(ingredientBounds, doseBounds);
  const distance = Math.abs(
    boundsCenterY(ingredientBounds) - boundsCenterY(doseBounds),
  );
  const normalizedDistance = distance / rowHeight;
  const distanceScore = centerDistanceScore(
    ingredientBounds,
    doseBounds,
    rowHeight,
  );
  if (overlap < 0.35 && normalizedDistance > 0.75) return null;
  const ingredientHeight = boundsHeight(ingredientBounds);
  const doseHeight = boundsHeight(doseBounds);
  const heightConsistencyPenalty = Math.abs(ingredientHeight - doseHeight) /
    Math.max(ingredientHeight, doseHeight, 0.01);
  const cost = normalizedDistance * 0.68 +
    (1 - overlap) * 0.27 +
    heightConsistencyPenalty * 0.05;
  if (cost > 0.78) return null;
  return {
    ingredient,
    dose,
    verticalOverlapScore: Number(overlap.toFixed(4)),
    centreDistance: Number(distance.toFixed(4)),
    normalizedCentreDistance: Number(normalizedDistance.toFixed(4)),
    centreDistanceScore: Number(distanceScore.toFixed(4)),
    heightConsistencyScore: Number(
      (1 - heightConsistencyPenalty).toFixed(4),
    ),
    horizontalOrdering: true,
    cost: Number(cost.toFixed(6)),
  };
}

const GLOBAL_ASSIGNMENT_AMBIGUITY_MARGIN = 0.12;
const GLOBAL_ASSIGNMENT_SOLUTION_LIMIT = 8;

function geometryCenter(item) {
  return boundsCenterY(item?.matchBounds || item?.bounds) ?? Infinity;
}

function assignmentSignature(pairs) {
  return pairs
    .map((pair) => `${pair.ingredient.id}|${pair.dose.id}`)
    .sort()
    .join(";");
}

function addAssignmentSolution(bucket, solution) {
  const signature = assignmentSignature(solution.pairs);
  const existingIndex = bucket.findIndex(
    (candidate) => candidate.signature === signature,
  );
  const normalized = { ...solution, signature };
  if (existingIndex >= 0) {
    if (bucket[existingIndex].cost <= normalized.cost) return;
    bucket.splice(existingIndex, 1);
  }
  bucket.push(normalized);
  bucket.sort((left, right) =>
    right.pairs.length - left.pairs.length || left.cost - right.cost
  );
  if (bucket.length > GLOBAL_ASSIGNMENT_SOLUTION_LIMIT) {
    bucket.length = GLOBAL_ASSIGNMENT_SOLUTION_LIMIT;
  }
}

function solveGlobalMonotonicAssignment(
  ingredientBlocks,
  doseBlocks,
  associations,
) {
  const ingredients = [...ingredientBlocks].sort((left, right) =>
    left.pageNumber - right.pageNumber || geometryCenter(left) - geometryCenter(right)
  );
  const doses = [...doseBlocks].sort((left, right) =>
    left.pageNumber - right.pageNumber || geometryCenter(left) - geometryCenter(right)
  );
  const ingredientIndex = new Map(
    ingredients.map((ingredient, index) => [ingredient.id, index]),
  );
  const doseIndex = new Map(doses.map((dose, index) => [dose.id, index]));
  const associationByPosition = new Map(
    associations.map((association) => [
      `${ingredientIndex.get(association.ingredient.id)}|${
        doseIndex.get(association.dose.id)
      }`,
      association,
    ]),
  );
  const solutions = Array.from(
    { length: ingredients.length + 1 },
    () => Array.from({ length: doses.length + 1 }, () => []),
  );
  solutions[0][0].push({ pairs: [], cost: 0, signature: "" });

  for (let ingredientPosition = 0;
    ingredientPosition <= ingredients.length;
    ingredientPosition += 1) {
    for (let dosePosition = 0;
      dosePosition <= doses.length;
      dosePosition += 1) {
      const currentSolutions = solutions[ingredientPosition][dosePosition];
      currentSolutions.forEach((solution) => {
        if (ingredientPosition < ingredients.length) {
          addAssignmentSolution(
            solutions[ingredientPosition + 1][dosePosition],
            solution,
          );
        }
        if (dosePosition < doses.length) {
          addAssignmentSolution(
            solutions[ingredientPosition][dosePosition + 1],
            solution,
          );
        }
        const association = associationByPosition.get(
          `${ingredientPosition}|${dosePosition}`,
        );
        if (
          association &&
          ingredientPosition < ingredients.length &&
          dosePosition < doses.length
        ) {
          addAssignmentSolution(
            solutions[ingredientPosition + 1][dosePosition + 1],
            {
              pairs: [...solution.pairs, association],
              cost: solution.cost + association.cost,
            },
          );
        }
      });
    }
  }

  const finalSolutions = solutions[ingredients.length][doses.length];
  const best = finalSolutions[0] ?? { pairs: [], cost: 0 };
  const nearTiedAlternatives = finalSolutions.slice(1).filter(
    (solution) =>
      solution.pairs.length === best.pairs.length &&
      solution.cost - best.cost < GLOBAL_ASSIGNMENT_AMBIGUITY_MARGIN,
  );
  const ambiguousPairKeys = new Set();
  const bestPairByIngredient = new Map(
    best.pairs.map((pair) => [pair.ingredient.id, pair]),
  );
  nearTiedAlternatives.forEach((alternative) => {
    const alternativePairByIngredient = new Map(
      alternative.pairs.map((pair) => [pair.ingredient.id, pair]),
    );
    const ingredientIds = new Set([
      ...bestPairByIngredient.keys(),
      ...alternativePairByIngredient.keys(),
    ]);
    ingredientIds.forEach((ingredientId) => {
      const bestPair = bestPairByIngredient.get(ingredientId) ?? null;
      const alternativePair =
        alternativePairByIngredient.get(ingredientId) ?? null;
      if (bestPair?.dose.id === alternativePair?.dose.id) return;
      const bestCandidate = bestPair?.dose?.doseCandidate;
      const alternativeCandidate = alternativePair?.dose?.doseCandidate;
      const hasEquivalentDose =
        bestCandidate &&
        alternativeCandidate &&
        bestCandidate.value === alternativeCandidate.value &&
        normalizeUnit(bestCandidate.unit) ===
          normalizeUnit(alternativeCandidate.unit);
      if (hasEquivalentDose) return;
      if (bestPair) {
        ambiguousPairKeys.add(
          `${bestPair.ingredient.id}|${bestPair.dose.id}`,
        );
      }
      if (alternativePair) {
        ambiguousPairKeys.add(
          `${alternativePair.ingredient.id}|${alternativePair.dose.id}`,
        );
      }
    });
  });
  const selectedPairs = best.pairs.filter(
    (pair) =>
      !ambiguousPairKeys.has(`${pair.ingredient.id}|${pair.dose.id}`),
  );
  return {
    best,
    secondBest: finalSolutions.find(
      (solution, index) =>
        index > 0 && solution.pairs.length === best.pairs.length,
    ) ?? null,
    nearTiedAlternatives,
    ambiguousPairKeys,
    selectedByIngredient: new Map(
      selectedPairs.map((pair) => [pair.ingredient.id, pair]),
    ),
  };
}

function buildExplicitVisualRows(structuredRows) {
  return structuredRows.map((row) => {
    const candidates = extractDoseCandidates(row.text);
    const cellCandidates = row.cells
      .map((cell) => selectDoseFragmentCandidate(cell.text))
      .filter(Boolean);
    const selectedCandidate = cellCandidates.length === 1
      ? cellCandidates[0]
      : candidates.length === 1
      ? candidates[0]
      : null;
    return {
      ...row,
      visualRowId: row.id,
      reconstructionSource: "azure_table_row",
      ingredientCandidate: row.cells
        .filter((cell) => !isDoseFragmentOnlyText(cell.text))
        .map((cell) => cell.text)
        .join(" ") || null,
      doseCandidate: selectedCandidate,
      association: {
        selected: Boolean(selectedCandidate),
        matchingStrategy: "azure_table_row",
        verticalOverlapScore: 1,
        centreDistanceScore: 1,
        rejectedAlternatives: [],
        ambiguityReason: !selectedCandidate && candidates.length > 1
          ? "multiple_doses_in_table_row"
          : !selectedCandidate && candidates.length === 0
          ? "dose_missing"
          : null,
      },
    };
  });
}

export function reconstructOcrVisualRows(structuredLines, structuredRows = []) {
  const lines = Array.isArray(structuredLines)
    ? structuredLines.filter((line) => line?.bounds)
    : [];
  const explicitRows = buildExplicitVisualRows(
    Array.isArray(structuredRows) ? structuredRows : [],
  );
  if (!lines.length) return explicitRows;

  const rowHeight = median(lines.map((line) => boundsHeight(line.bounds))) || 1;
  const doseBlocks = buildDoseBlocks(lines, rowHeight);
  const ingredientBlocks = buildIngredientBlocks(lines, rowHeight);
  const associations = ingredientBlocks.flatMap((ingredient) =>
    doseBlocks.flatMap((dose) => {
      const association = buildGeometryAssociation(
        ingredient,
        dose,
        rowHeight,
      );
      return association ? [association] : [];
    })
  );
  const associationsByIngredient = new Map();
  const associationsByDose = new Map();
  associations.forEach((association) => {
    const ingredientAssociations =
      associationsByIngredient.get(association.ingredient.id) ?? [];
    ingredientAssociations.push(association);
    associationsByIngredient.set(
      association.ingredient.id,
      ingredientAssociations,
    );
    const doseAssociations = associationsByDose.get(association.dose.id) ?? [];
    doseAssociations.push(association);
    associationsByDose.set(association.dose.id, doseAssociations);
  });
  const globalAssignment = solveGlobalMonotonicAssignment(
    ingredientBlocks,
    doseBlocks,
    associations,
  );

  const geometryRows = ingredientBlocks.map((ingredient, index) => {
    const alternatives = (associationsByIngredient.get(ingredient.id) ?? [])
      .sort((left, right) => left.cost - right.cost);
    const isolatedSelectionWouldPass = alternatives.length === 1 &&
      (associationsByDose.get(alternatives[0].dose.id) ?? []).length === 1;
    const selected = globalAssignment.selectedByIngredient.get(ingredient.id) ??
      null;
    const candidateRanking = alternatives.map((alternative, rank) => {
      const pairKey = `${alternative.ingredient.id}|${alternative.dose.id}`;
      return {
        rank: rank + 1,
        doseBlockId: alternative.dose.id,
        doseCategory: alternative.dose.doseCandidate?.unit || "dose_fragment",
        doseGeometry: {
          top: alternative.dose.matchBounds?.top ?? null,
          bottom: alternative.dose.matchBounds?.bottom ?? null,
          centre: geometryCenter(alternative.dose),
          height: boundsHeight(
            alternative.dose.matchBounds || alternative.dose.bounds,
          ),
        },
        verticalOverlapScore: alternative.verticalOverlapScore,
        normalizedCentreDistance: alternative.normalizedCentreDistance,
        centreDistanceScore: alternative.centreDistanceScore,
        heightConsistencyScore: alternative.heightConsistencyScore,
        horizontalOrdering: alternative.horizontalOrdering,
        cost: alternative.cost,
        selected: alternative === selected,
        rejectionReason: alternative === selected
          ? null
          : globalAssignment.ambiguousPairKeys.has(pairKey)
          ? "global_assignment_near_tie"
          : selected
          ? "lower_cost_monotonic_pair_selected"
          : "not_selected_by_global_assignment",
      };
    });
    const rejectedAlternatives = alternatives
      .filter((alternative) => alternative !== selected)
      .map((alternative) =>
        candidateRanking.find((candidate) =>
          candidate.doseBlockId === alternative.dose.id
        )
      );
    const hasNearTiedAlternative = alternatives.some((alternative) =>
      globalAssignment.ambiguousPairKeys.has(
        `${alternative.ingredient.id}|${alternative.dose.id}`,
      )
    );
    const ambiguityReason = selected
      ? null
      : hasNearTiedAlternative
      ? "global_assignment_near_tie"
      : alternatives.length > 0
      ? "global_monotonic_assignment_unmatched"
      : "dose_not_on_same_visual_row";
    const fragments = selected
      ? [...ingredient.fragments, ...selected.dose.fragments]
      : ingredient.fragments;
    const text = selected
      ? `${ingredient.text}\t${selected.dose.text}`
      : ingredient.text;
    return {
      id: `visual-page-${ingredient.pageNumber}-row-${index}`,
      visualRowId: `visual-page-${ingredient.pageNumber}-row-${index}`,
      reconstructionSource: "geometry",
      pageNumber: ingredient.pageNumber,
      text,
      cells: fragments.map((fragment, fragmentIndex) => ({
        columnIndex: fragmentIndex,
        category: selected?.dose.fragments.some(
            (doseFragment) => doseFragment.id === fragment.id,
          )
          ? "dose"
          : "ingredient",
        text: fragment.text,
        confidence: finiteNumber(fragment.confidence),
        pageNumber: fragment.pageNumber,
        bounds: fragment.bounds,
        doseCandidates: extractDoseCandidates(fragment.text),
      })),
      confidence: averageConfidence(fragments),
      bounds: combineBounds(fragments),
      doseCandidates: selected ? [selected.dose.doseCandidate] : [],
      ingredientCandidate: ingredient.text,
      doseCandidate: selected?.dose.doseCandidate ?? null,
      association: {
        selected: Boolean(selected),
        matchingStrategy: "global_monotonic",
        isolatedSelectionWouldPass,
        ingredientGeometry: {
          reconstructedRowIndex: index,
          top: ingredient.matchBounds?.top ?? null,
          bottom: ingredient.matchBounds?.bottom ?? null,
          centre: geometryCenter(ingredient),
          height: boundsHeight(ingredient.matchBounds || ingredient.bounds),
        },
        verticalOverlapScore: selected?.verticalOverlapScore ?? null,
        normalizedCentreDistance:
          selected?.normalizedCentreDistance ?? null,
        centreDistanceScore: selected?.centreDistanceScore ?? null,
        selectedDoseBlockId: selected?.dose.id ?? null,
        candidateRanking,
        rejectedAlternatives,
        ambiguityReason,
        globalBestMatchCount: globalAssignment.best.pairs.length,
        globalBestCost: Number(globalAssignment.best.cost.toFixed(6)),
        globalSecondBestCost:
          globalAssignment.secondBest?.cost === undefined
            ? null
            : Number(globalAssignment.secondBest.cost.toFixed(6)),
        globalAmbiguityMargin: GLOBAL_ASSIGNMENT_AMBIGUITY_MARGIN,
      },
    };
  });

  return [...explicitRows, ...geometryRows];
}

export function normalizeAzureIngredientPanelOcr(value) {
  const row = value && typeof value === "object" ? value : {};
  const analyzeResult =
    row?.analyzeResult && typeof row.analyzeResult === "object"
      ? row.analyzeResult
      : row;
  const structuredLines = extractStructuredLines(analyzeResult?.pages);
  const structuredRows = extractStructuredTableRows(analyzeResult?.tables);
  const visualRows = reconstructOcrVisualRows(structuredLines, structuredRows);
  const lines = structuredLines.map((line) => line.text);
  const tableRows = structuredRows.map((tableRow) => tableRow.text);
  const fullText = trimString(analyzeResult?.content);
  const combinedText = [
    tableRows.length ? ["Table rows (TSV):", ...tableRows].join("\n") : "",
    lines.length ? ["OCR lines:", ...lines].join("\n") : "",
    fullText ? `Full OCR text:\n${fullText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!combinedText) return null;
  return {
    fullText,
    lines,
    tableRows,
    structuredLines,
    structuredRows,
    visualRows,
    combinedText,
  };
}

function getUnitVariants(value) {
  switch (normalizeUnit(value)) {
    case "mcg":
      return ["mcg", "µg", "μg", "ug", "microgram", "micrograms"];
    case "mg":
      return ["mg", "milligram", "milligrams"];
    case "g":
      return ["g", "gram", "grams"];
    case "ml":
      return ["ml"];
    case "IU":
      return ["iu", "i.u.", "international units?"];
    case "CFU":
      return [
        "cfu",
        "colony forming units?",
        "viable organisms?",
        "live cultures?",
      ];
    case "FCC":
      return ["fcc"];
    case "HUT":
      return ["hut"];
    case "DU":
      return ["du"];
    case "FIP":
      return ["fip"];
    case "ALU":
      return ["alu"];
    case "GDU":
      return ["gdu"];
    case "PU":
      return ["pu"];
    default:
      return [];
  }
}

function buildDosePatterns(value, unit, originalText) {
  const patterns = [];
  const original = normalizeWhitespace(originalText);
  if (original) patterns.push(new RegExp(escapeRegExp(original), "iu"));
  if (!Number.isFinite(value)) return patterns;
  const rawValue = String(value).replace(".", "[.,]");
  getUnitVariants(unit).forEach((variant) => {
    patterns.push(
      new RegExp(`(?:^|\\s)${rawValue}\\s*(?:${variant})(?:$|\\s)`, "iu"),
    );
  });
  return patterns;
}

function rowMatchesIngredient(rowText, keys) {
  const normalizedRow = normalizeName(rowText);
  return keys.some(
    (key) =>
      phraseAppears(normalizedRow, key) ||
      conservativeOcrPhraseAppears(normalizedRow, key) ||
      probioticIdentityMatchesOcrRow(rowText, key),
  );
}

function doseMatchesText(text, patterns, expectedValue, expectedUnit) {
  const normalizedText = normalizeWhitespace(text);
  if (patterns.some((pattern) => pattern.test(normalizedText))) {
    return true;
  }
  const normalizedExpectedUnit = normalizeUnit(expectedUnit);
  return extractDoseCandidates(normalizedText).some(
    (candidate) =>
      candidate.value === expectedValue &&
      candidate.unit === normalizedExpectedUnit,
  );
}

function findIngredientEntries({ ingredientName, rawName, chemicalForm, ocr }) {
  const keys = buildIngredientVerificationKeys({
    ingredientName,
    rawName,
    chemicalForm,
  });
  if (!keys.length) return { keys, source: null, entries: [] };

  const visualRows = Array.isArray(ocr?.visualRows) ? ocr.visualRows : [];
  const matchingVisualRows = visualRows.filter((row) =>
    rowMatchesIngredient(row.text, keys)
  );
  const rows = Array.isArray(ocr?.structuredRows) ? ocr.structuredRows : [];
  const matchingRows = rows.filter((row) =>
    rowMatchesIngredient(row.text, keys)
  );
  const lines = Array.isArray(ocr?.structuredLines) ? ocr.structuredLines : [];
  const matchingLines = lines.filter((line) =>
    rowMatchesIngredient(line.text, keys)
  );
  const entries = [...matchingVisualRows, ...matchingRows, ...matchingLines]
    .filter((entry, index, all) =>
      all.findIndex((candidate) => candidate.id === entry.id) === index
    );
  return {
    keys,
    source: entries.length ? "ingredient_panel_ocr" : null,
    entries,
  };
}

function findDeterministicIngredientDose({
  ingredientName,
  rawName,
  chemicalForm,
  ocr,
}) {
  if (!ocr) return null;
  const result = findIngredientEntries({
    ingredientName,
    rawName,
    chemicalForm,
    ocr,
  });
  const selectedEntries = result.entries.flatMap((entry) => {
    let candidate = null;
    if (
      entry?.association?.selected === true &&
      ["azure_table_row", "geometry"].includes(entry?.reconstructionSource)
    ) {
      candidate = entry?.doseCandidate;
    } else if (String(entry?.id).includes("-line-")) {
      const lineCandidates = extractDoseCandidates(entry?.text);
      const firstCandidate = lineCandidates[0];
      const candidateStart = firstCandidate?.text
        ? normalizeDoseCandidateOcrText(entry.text).indexOf(firstCandidate.text)
        : -1;
      candidate = candidateStart >= 0
        ? selectDoseFragmentCandidate(
            normalizeDoseCandidateOcrText(entry.text).slice(candidateStart),
          )
        : null;
      candidate = candidate || selectDoseFollowingIngredientIdentity(
        entry.text,
        [ingredientName, rawName],
      );
    }
    return finiteNumber(candidate?.value) !== null &&
        ALLOWED_UNITS.has(normalizeUnit(candidate?.unit)) &&
        (!Number.isFinite(candidate?.maxValue) ||
          candidate.maxValue === candidate.value)
      ? [{ entry, candidate }]
      : [];
  });
  if (!selectedEntries.length) return null;

  const entriesByDose = new Map();
  selectedEntries.forEach(({ entry, candidate }) => {
    const key = `${candidate.value}|${normalizeUnit(candidate.unit)}`;
    const matches = entriesByDose.get(key) ?? [];
    matches.push({ entry, candidate });
    entriesByDose.set(key, matches);
  });
  if (entriesByDose.size !== 1) return null;

  const entries = Array.from(entriesByDose.values())[0].sort((left, right) => {
    const leftIsTable = left.entry.reconstructionSource === "azure_table_row";
    const rightIsTable = right.entry.reconstructionSource === "azure_table_row";
    if (leftIsTable !== rightIsTable) return leftIsTable ? -1 : 1;
    return (finiteNumber(right.entry.confidence) ?? 0) -
      (finiteNumber(left.entry.confidence) ?? 0);
  });
  const { entry, candidate } = entries[0];
  const pair = normalizeExtractedDosePair(
    candidate.value,
    candidate.unit,
    candidate.text,
  );
  if (!pair.isUsable) return null;

  return {
    outcome: "confirmed",
    confidence: "verified",
    reason: null,
    pair,
    evidenceSource: "ingredient_panel_ocr",
    evidenceReference: entry.id,
    evidenceText: entry.text,
    evidenceConfidence: finiteNumber(entry.confidence),
    visualRowId: entry.visualRowId || entry.id,
    association: entry.association,
  };
}

function boundsHeight(bounds) {
  return bounds ? Math.max(0, bounds.bottom - bounds.top) : 0;
}

function horizontalOverlap(left, right) {
  if (!left || !right) return 0;
  return Math.max(
    0,
    Math.min(left.right, right.right) - Math.max(left.left, right.left),
  );
}

function isDoseOnlyLine(text) {
  const normalized = normalizeWhitespace(text);
  if (selectDoseFragmentCandidate(normalized)) return true;
  return extractDoseCandidates(normalized).some((candidate) => {
    if (!normalized.startsWith(candidate.text)) {
      return false;
    }
    const suffix = normalized.slice(candidate.text.length).trim();
    return !suffix ||
      /^(?:per\s+(?:\d+\s+)?(?:servings?|capsules?|tablets?|softgels?|scoops?|drops?)|per\s+daily\s+dose|daily\s+dose|at\s+time\s+of\s+manufacture|guaranteed\s+through\s+expir(?:y|ation))\s*[*†‡]?$/iu.test(
        suffix,
      );
  });
}

function isClearlyAssociatedContinuation(line, nextLine) {
  if (
    !line?.bounds || !nextLine?.bounds ||
    line.pageNumber !== nextLine.pageNumber
  ) {
    return false;
  }
  if (!isDoseOnlyLine(nextLine.text)) return false;
  const gap = nextLine.bounds.top - line.bounds.bottom;
  const allowedGap =
    Math.max(boundsHeight(line.bounds), boundsHeight(nextLine.bounds)) * 1.5;
  return gap >= -0.01 && gap <= allowedGap &&
    horizontalOverlap(line.bounds, nextLine.bounds) > 0;
}

export function findIngredientOcrEvidence({
  ingredientName,
  rawName,
  chemicalForm,
  ocr,
}) {
  if (!ocr) {
    return { matched: false, reason: "ocr_structure_unavailable" };
  }
  const result = findIngredientEntries({
    ingredientName,
    rawName,
    chemicalForm,
    ocr,
  });
  if (!result.entries.length) {
    return {
      matched: false,
      reason: (ocr?.structuredRows?.length ?? 0) ||
          (ocr?.structuredLines?.length ?? 0)
        ? "ingredient_row_not_found"
        : "ocr_structure_unavailable",
    };
  }
  const entry = result.entries[0];
  return {
    matched: true,
    source: "ingredient_panel_ocr",
    reference: entry.id,
    text: entry.text,
    confidence: finiteNumber(entry.confidence),
  };
}

export function verifyDoseAgainstOcr({
  ingredientName,
  rawName,
  chemicalForm,
  rawDosageValue,
  rawDosageUnit,
  dosageOriginalText,
  ocr,
}) {
  const value = finiteNumber(rawDosageValue);
  const unit = normalizeUnit(rawDosageUnit);
  if (value === null && !unit) {
    return { outcome: "missing", confidence: "missing", reason: null };
  }
  if (value === null || !unit || !ALLOWED_UNITS.has(unit)) {
    return {
      outcome: "malformed",
      confidence: "unverified",
      reason: value === null
        ? "missing_dose_value"
        : !unit
        ? "missing_dose_unit"
        : "unsupported_unit",
    };
  }
  if (!ocr) {
    return {
      outcome: "inconclusive",
      confidence: "unverified",
      reason: "ocr_structure_unavailable",
    };
  }

  const patterns = buildDosePatterns(value, unit, dosageOriginalText);
  const result = findIngredientEntries({
    ingredientName,
    rawName,
    chemicalForm,
    ocr,
  });
  if (!result.entries.length) {
    return {
      outcome: "inconclusive",
      confidence: "unverified",
      reason: (ocr?.structuredRows?.length ?? 0) ||
          (ocr?.structuredLines?.length ?? 0)
        ? "ingredient_row_not_found"
        : "ocr_structure_unavailable",
    };
  }

  const sameEntry = result.entries.find((entry) =>
    doseMatchesText(entry.text, patterns, value, unit)
  );
  if (sameEntry) {
    const selectedDoseMatches =
      sameEntry?.association?.selected === true &&
      sameEntry?.doseCandidate?.value === value &&
      sameEntry?.doseCandidate?.unit === unit;
    const hasConflictingDose =
      !selectedDoseMatches &&
      extractDoseCandidates(sameEntry.text).some(
        (candidate) => candidate.value !== value || candidate.unit !== unit,
      );
    if (hasConflictingDose) {
      return {
        outcome: "contradicted",
        confidence: "unverified",
        reason: "conflicting_same_row_dose",
        evidenceReference: sameEntry.id,
        evidenceText: sameEntry.text,
        visualRowId: sameEntry.visualRowId || sameEntry.id,
        association: sameEntry.association || null,
      };
    }
    return {
      outcome: "confirmed",
      confidence: "verified",
      reason: null,
      evidenceSource: "ingredient_panel_ocr",
      evidenceReference: sameEntry.id,
      evidenceText: sameEntry.text,
      evidenceConfidence: finiteNumber(sameEntry.confidence),
      visualRowId: sameEntry.visualRowId || sameEntry.id,
      association: sameEntry.association || null,
    };
  }

  const conflictingSameEntry = result.entries.find((entry) =>
    extractDoseCandidates(entry.text).length > 0
  );
  if (conflictingSameEntry) {
    return {
      outcome: "contradicted",
      confidence: "unverified",
      reason: "conflicting_same_row_dose",
      evidenceReference: conflictingSameEntry.id,
      evidenceText: conflictingSameEntry.text,
      visualRowId:
        conflictingSameEntry.visualRowId || conflictingSameEntry.id,
      association: conflictingSameEntry.association || null,
    };
  }

  const ambiguousVisualEntry = result.entries.find((entry) =>
    entry?.reconstructionSource === "geometry" &&
    entry?.association?.selected === false &&
    entry?.association?.rejectedAlternatives?.some((alternative) =>
      alternative?.doseCategory === unit
    )
  );
  if (ambiguousVisualEntry) {
    return {
      outcome: "inconclusive",
      confidence: "unverified",
      reason: "ambiguous_neighboring_dose",
      visualRowId:
        ambiguousVisualEntry.visualRowId || ambiguousVisualEntry.id,
      association: ambiguousVisualEntry.association,
    };
  }

  const lines = Array.isArray(ocr?.structuredLines) ? ocr.structuredLines : [];
  for (const entry of result.entries) {
    if (!String(entry.id).includes("-line-")) continue;
    const index = lines.findIndex((line) => line.id === entry.id);
    const nextLine = index >= 0 ? lines[index + 1] : null;
    if (
      nextLine &&
      isClearlyAssociatedContinuation(entry, nextLine) &&
      doseMatchesText(nextLine.text, patterns, value, unit)
    ) {
      return {
        outcome: "confirmed",
        confidence: "verified",
        reason: null,
        evidenceSource: "ingredient_panel_ocr",
        evidenceReference: `${entry.id}+${nextLine.id}`,
        evidenceText: `${entry.text} ${nextLine.text}`,
        evidenceConfidence: averageConfidence([entry, nextLine]),
        visualRowId: `${entry.id}+${nextLine.id}`,
        association: {
          selected: true,
          reconstructionSource: "wrapped_continuation",
        },
      };
    }
  }

  const rows = Array.isArray(ocr?.structuredRows) ? ocr.structuredRows : [];
  const hasNeighboringDose = result.entries.some((entry) =>
    rows.some(
      (candidate) =>
        candidate.tableIndex === entry.tableIndex &&
        Math.abs(candidate.rowIndex - entry.rowIndex) === 1 &&
        doseMatchesText(candidate.text, patterns, value, unit),
    )
  ) || result.entries.some((entry) => {
    const index = lines.findIndex((line) => line.id === entry.id);
    return [lines[index - 1], lines[index + 1]].some(
      (candidate) =>
        candidate && doseMatchesText(candidate.text, patterns, value, unit),
    );
  });

  return {
    outcome: hasNeighboringDose ? "contradicted" : "inconclusive",
    confidence: "unverified",
    reason: hasNeighboringDose
      ? "ambiguous_neighboring_dose"
      : "dose_not_on_same_row",
  };
}

export function normalizeExtractedDosePair(value, unit, dosageOriginalText = null) {
  const finiteValue = finiteNumber(value);
  let normalizedValue = finiteValue !== null && finiteValue >= 0
    ? finiteValue
    : null;
  const normalizedUnit = normalizeUnit(unit);
  const parsedCfuDose = normalizedUnit === "CFU"
    ? parseCfuDoseText(dosageOriginalText)
    : null;
  if (
    normalizedValue !== null &&
    parsedCfuDose?.multiplierValue > 1 &&
    normalizedValue === parsedCfuDose.coefficient
  ) {
    normalizedValue = parsedCfuDose.value;
  }
  if (normalizedValue === null && !normalizedUnit) {
    return { value: null, unit: null, isUsable: false, reviewReason: null };
  }
  if (normalizedValue === null) {
    return {
      value: null,
      unit: null,
      isUsable: false,
      reviewReason: "missing_dose_value",
    };
  }
  if (!normalizedUnit) {
    return {
      value: null,
      unit: null,
      isUsable: false,
      reviewReason: "missing_dose_unit",
    };
  }
  if (!ALLOWED_UNITS.has(normalizedUnit)) {
    return {
      value: null,
      unit: null,
      isUsable: false,
      reviewReason: "unsupported_unit",
    };
  }
  return {
    value: normalizedValue,
    unit: normalizedUnit,
    isUsable: true,
    reviewReason: null,
  };
}

export function applyIngredientEvidencePolicy(ingredients, ocr) {
  return (Array.isArray(ingredients) ? ingredients : []).map((ingredient) => {
    const firstPass = {
      first_pass_dosage_value:
        finiteNumber(ingredient?.first_pass_dosage_value) ??
          finiteNumber(ingredient?.dosage_value),
      first_pass_dosage_unit:
        normalizeUnit(ingredient?.first_pass_dosage_unit) ||
        normalizeUnit(ingredient?.dosage_unit),
      first_pass_dosage_original_text:
        normalizeWhitespace(ingredient?.first_pass_dosage_original_text) ||
        normalizeWhitespace(ingredient?.dosage_original_text) || null,
    };
    if (ingredient?.ingredient_type === "inactive") {
      return { ...ingredient, ...firstPass };
    }

    const evidence = findIngredientOcrEvidence({
      ingredientName: ingredient?.canonical_name,
      rawName: ingredient?.raw_name,
      chemicalForm: ingredient?.chemical_form,
      ocr,
    });
    if (evidence.matched) {
      return {
        ...ingredient,
        ...firstPass,
        evidence_source: "ingredient_panel_ocr",
        evidence_reference: evidence.reference,
        evidence_confidence: evidence.confidence,
        dose_confidence: Number.isFinite(ingredient?.dosage_value)
          ? "unverified"
          : "missing",
        dose_review_reason: ingredient?.dose_review_reason || null,
      };
    }

    const declaredSource =
      EVIDENCE_SOURCE_VALUES.has(ingredient?.evidence_source)
        ? ingredient.evidence_source
        : "unknown";
    const hasDeclaredFormalPanelEvidence =
      ingredient?.ingredient_type === "active" &&
      ["ingredient_panel_ocr", "ingredient_panel_image"].includes(
        declaredSource,
      );
    if (hasDeclaredFormalPanelEvidence) {
      return {
        ...ingredient,
        ...firstPass,
        evidence_source: declaredSource,
        evidence_reference: null,
        evidence_confidence: null,
        dose_confidence: Number.isFinite(ingredient?.dosage_value)
          ? "unverified"
          : "missing",
        dose_review_reason: ingredient?.dose_review_reason ||
          evidence.reason || "ocr_structure_unavailable",
      };
    }

    const reviewReason = declaredSource === "front_label"
      ? "front_label_only"
      : evidence.reason || "ingredient_row_not_found";
    return {
      ...ingredient,
      ...firstPass,
      ingredient_type: "uncertain",
      dosage_value: null,
      dosage_unit: null,
      evidence_source: declaredSource,
      evidence_reference: null,
      evidence_confidence: null,
      dose_confidence: "unverified",
      dose_review_reason: reviewReason,
    };
  });
}

function isStringOrNull(value) {
  return value === null || typeof value === "string";
}

function hasRequiredFields(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return fields.every((field) => Object.hasOwn(value, field));
}

function hasOnlyFields(value, fields) {
  const allowed = new Set(fields);
  return Object.keys(value).every((field) => allowed.has(field));
}

function validationFailure(code, issue) {
  return { ok: false, code, issue };
}

export function validatePhotoRescueModelOutput(value) {
  if (!hasRequiredFields(value, PHOTO_RESCUE_REQUIRED_FIELDS)) {
    return validationFailure(
      "incomplete_model_output",
      "missing_required_field",
    );
  }
  if (!hasOnlyFields(value, PHOTO_RESCUE_REQUIRED_FIELDS)) {
    return validationFailure("malformed_model_output", "unexpected_field");
  }
  if (
    typeof value.is_supplement !== "boolean" ||
    typeof value.should_extract !== "boolean" ||
    finiteNumber(value.classification_confidence) === null ||
    finiteNumber(value.naming_confidence) === null ||
    !CATEGORY_VALUES.has(value.category)
  ) {
    return validationFailure(
      "malformed_model_output",
      "invalid_classification",
    );
  }

  const requiredStrings = [
    "classification_reason",
    "front_label_name",
    "ingredient_panel_text",
    "display_name",
    "raw_text",
  ];
  if (requiredStrings.some((field) => typeof value[field] !== "string")) {
    return validationFailure(
      "malformed_model_output",
      "invalid_required_string",
    );
  }
  const nullableStrings = [
    "product_name",
    "full_product_name",
    "brand_name",
    "product_type",
    "form_factor",
    "flavor",
    "naming_notes",
    "serving_size_text",
    "extraction_notes",
  ];
  if (nullableStrings.some((field) => !isStringOrNull(value[field]))) {
    return validationFailure(
      "malformed_model_output",
      "invalid_nullable_string",
    );
  }
  if (!Array.isArray(value.ingredients_found)) {
    return validationFailure("malformed_model_output", "ingredients_not_array");
  }

  for (const ingredient of value.ingredients_found) {
    if (!hasRequiredFields(ingredient, INGREDIENT_REQUIRED_FIELDS)) {
      return validationFailure(
        "incomplete_model_output",
        "partial_ingredient_object",
      );
    }
    if (!hasOnlyFields(ingredient, INGREDIENT_REQUIRED_FIELDS)) {
      return validationFailure(
        "malformed_model_output",
        "unexpected_ingredient_field",
      );
    }
    if (
      typeof ingredient.raw_name !== "string" ||
      typeof ingredient.canonical_name !== "string" ||
      (!normalizeWhitespace(ingredient.raw_name) &&
        !normalizeWhitespace(ingredient.canonical_name)) ||
      !INGREDIENT_TYPE_VALUES.has(ingredient.ingredient_type) ||
      !EVIDENCE_SOURCE_VALUES.has(ingredient.evidence_source)
    ) {
      return validationFailure(
        "malformed_model_output",
        "invalid_ingredient_identity",
      );
    }
    if (
      !(
        ingredient.dosage_value === null ||
        (finiteNumber(ingredient.dosage_value) !== null &&
          ingredient.dosage_value >= 0)
      ) ||
      !isStringOrNull(ingredient.dosage_unit) ||
      !isStringOrNull(ingredient.dosage_original_text) ||
      !isStringOrNull(ingredient.chemical_form) ||
      !isStringOrNull(ingredient.amount_basis)
    ) {
      return validationFailure(
        "malformed_model_output",
        "invalid_ingredient_dose_type",
      );
    }
    const rawUnit = normalizeWhitespace(ingredient.dosage_unit).toLowerCase();
    if (ingredient.dosage_unit !== null && SENTINEL_VALUES.has(rawUnit)) {
      return validationFailure(
        "malformed_model_output",
        "unsupported_dose_sentinel",
      );
    }
    if (
      ingredient.amount_basis !== null &&
      !AMOUNT_BASIS_VALUES.has(ingredient.amount_basis)
    ) {
      return validationFailure(
        "malformed_model_output",
        "unsupported_amount_basis",
      );
    }
  }

  return { ok: true, value };
}

export function validateDoseVerificationModelOutput(value, ingredientCount) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.hasOwn(value, "verified_ingredients")
  ) {
    return validationFailure(
      "incomplete_model_output",
      "missing_verified_ingredients",
    );
  }
  if (
    !hasOnlyFields(value, ["verified_ingredients"]) ||
    !Array.isArray(value.verified_ingredients)
  ) {
    return validationFailure(
      "malformed_model_output",
      "invalid_verified_ingredients",
    );
  }
  const correctionsByIndex = new Map();
  const invalidIndexes = new Set();
  for (const correction of value.verified_ingredients) {
    const index = integerValue(correction?.index);
    if (index === null || index < 0 || index >= ingredientCount) continue;
    const rawCorrectionUnit = normalizeWhitespace(
      correction?.dosage_unit,
    ).toLowerCase();
    const hasValidFields =
      hasRequiredFields(correction, DOSE_CORRECTION_REQUIRED_FIELDS) &&
      hasOnlyFields(correction, DOSE_CORRECTION_REQUIRED_FIELDS) &&
      DOSE_DECISION_VALUES.has(correction.decision) &&
      (
        correction.dosage_value === null ||
        (finiteNumber(correction.dosage_value) !== null &&
          correction.dosage_value >= 0)
      ) &&
      isStringOrNull(correction.dosage_unit) &&
      isStringOrNull(correction.dosage_original_text) &&
      isStringOrNull(correction.review_reason) &&
      (
        correction.review_reason === null ||
        DOSE_REVIEW_REASON_VALUES.has(correction.review_reason)
      ) &&
      !(
        correction.dosage_unit !== null &&
        SENTINEL_VALUES.has(rawCorrectionUnit)
      );
    if (
      !hasValidFields ||
      invalidIndexes.has(index) ||
      correctionsByIndex.has(index)
    ) {
      correctionsByIndex.delete(index);
      invalidIndexes.add(index);
      continue;
    }
    correctionsByIndex.set(index, correction);
  }

  const verifiedIngredients = Array.from(
    { length: ingredientCount },
    (_, index) =>
      invalidIndexes.has(index) || !correctionsByIndex.has(index)
        ? {
            index,
            dosage_value: null,
            dosage_unit: null,
            dosage_original_text: null,
            decision: "unverified",
            review_reason: "verifier_output_invalid",
          }
        : correctionsByIndex.get(index),
  );

  return {
    ok: true,
    value: { verified_ingredients: verifiedIngredients },
  };
}

function createModelOutputError(code, label, issue) {
  const error = new Error(
    `${label} failed structured output validation (${issue}).`,
  );
  error.code = code;
  return error;
}

function extractCompletionContent(rawContent) {
  if (typeof rawContent === "string") return rawContent.trim();
  if (!Array.isArray(rawContent)) return "";
  return rawContent
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

export function parseOpenAiStructuredCompletion(
  { completion, validate, label },
) {
  const choice = completion?.choices?.[0];
  const finishReason = trimString(choice?.finish_reason).toLowerCase();
  const refusal = normalizeWhitespace(choice?.message?.refusal);
  if (refusal || finishReason === "content_filter") {
    throw createModelOutputError("model_refusal", label, "refusal");
  }
  if (finishReason === "length") {
    throw createModelOutputError("truncated_model_output", label, "truncated");
  }

  const content = extractCompletionContent(choice?.message?.content);
  if (!content) {
    throw createModelOutputError(
      "incomplete_model_output",
      label,
      "empty_content",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw createModelOutputError(
      "malformed_model_output",
      label,
      "invalid_json",
    );
  }

  const validation = validate(parsed);
  if (!validation?.ok) {
    throw createModelOutputError(
      validation?.code || "malformed_model_output",
      label,
      validation?.issue || "unknown_schema_error",
    );
  }
  return validation.value ?? parsed;
}

function normalizeReviewReason(value, fallback) {
  return DOSE_REVIEW_REASON_VALUES.has(value) ? value : fallback;
}

const DOSE_LIKE_TEXT_PATTERN =
  /\b(?:mcg|ug|micrograms?|mg|milligrams?|g|grams?|ml|millilit(?:er|re)s?|iu|international[\s-]+units?|cfu|colony[\s-]+forming[\s-]+units?|viable[\s-]+organisms?|live[\s-]+cultures?|fcc|hut|du|fip|alu|gdu|pu)\b/iu;
const UNREADABLE_DOSE_TEXT_PATTERN =
  /\b(?:dose|dosage|amount|quantity)\b.{0,32}\b(?:unreadable|illegible|unclear|obscured)\b|\b(?:unreadable|illegible|unclear|obscured)\b.{0,32}\b(?:dose|dosage|amount|quantity)\b/iu;

function stripIngredientIdentityPrefix(text, ingredient) {
  const normalizedText = normalizeWhitespace(text);
  if (!normalizedText) return "";

  const names = [ingredient?.canonical_name, ingredient?.raw_name]
    .map(normalizeWhitespace)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const name of names) {
    if (normalizedText.toLowerCase() === name.toLowerCase()) {
      return "";
    }
    if (normalizedText.toLowerCase().startsWith(`${name.toLowerCase()} `)) {
      return normalizeWhitespace(normalizedText.slice(name.length));
    }
  }
  return normalizedText;
}

function hasDoseLikeOriginalText(text, ingredient) {
  const remainder = stripIngredientIdentityPrefix(text, ingredient);
  if (!remainder) return false;
  return Boolean(
    extractDoseCandidates(remainder).length ||
      DOSE_LIKE_TEXT_PATTERN.test(remainder) ||
      /^\s*\d+(?:[.,]\d+)?(?:\s*(?:[-–—]|to)\s*\d+(?:[.,]\d+)?)?\s*$/u.test(
        remainder,
      ) ||
      UNREADABLE_DOSE_TEXT_PATTERN.test(remainder),
  );
}

function isProbioticBlendName(value) {
  return /\b(?:blend|mixture|complex|consortium)\b/iu.test(
    normalizeWhitespace(value),
  );
}

function getFirstPassDose(ingredient) {
  const value = Number.isFinite(ingredient?.first_pass_dosage_value)
    ? ingredient.first_pass_dosage_value
    : finiteNumber(ingredient?.dosage_value);
  const unit = ingredient?.first_pass_dosage_unit ||
    normalizeUnit(ingredient?.dosage_unit);
  const originalText =
    normalizeWhitespace(ingredient?.first_pass_dosage_original_text) ||
    normalizeWhitespace(ingredient?.dosage_original_text) ||
    null;
  return {
    value,
    unit,
    originalText,
    pair: normalizeExtractedDosePair(value, unit, originalText),
  };
}

function findAmbiguousSharedCfuIndexes(ingredients, correctionsByIndex) {
  const ownersByEvidence = new Map();
  (Array.isArray(ingredients) ? ingredients : []).forEach(
    (ingredient, index) => {
      const correction = correctionsByIndex.get(index);
      const correctedPair = normalizeExtractedDosePair(
        correction?.dosage_value,
        correction?.dosage_unit,
        correction?.dosage_original_text ?? ingredient?.dosage_original_text,
      );
      const firstPass = getFirstPassDose(ingredient);
      const usesCorrection =
        ["verified", "corrected"].includes(correction?.decision) &&
        correctedPair.isUsable;
      const dosePair = usesCorrection ? correctedPair : firstPass.pair;
      if (dosePair.unit !== "CFU" || !dosePair.isUsable) return;
      const evidenceReference = normalizeWhitespace(
        ingredient?.evidence_reference,
      ).toLowerCase();
      const evidenceText = normalizeWhitespace(
        usesCorrection
          ? correction?.dosage_original_text
          : firstPass.originalText,
      ).toLowerCase();
      if (
        !usesCorrection &&
        !evidenceReference &&
        !isProbioticBlendName(evidenceText)
      ) {
        return;
      }
      const evidenceKey = evidenceReference || evidenceText;
      if (!evidenceKey) return;
      const key = `${dosePair.value}|${evidenceKey}`;
      const owners = ownersByEvidence.get(key) ?? [];
      owners.push(index);
      ownersByEvidence.set(key, owners);
    },
  );

  const rejected = new Set();
  ownersByEvidence.forEach((indexes) => {
    if (indexes.length < 2) return;
    const blendIndex = indexes.find((index) =>
      [ingredients[index]?.canonical_name, ingredients[index]?.raw_name].some(
        isProbioticBlendName,
      )
    );
    indexes.forEach((index) => {
      if (index !== blendIndex) rejected.add(index);
    });
  });
  return rejected;
}

function getInconclusiveDoseReviewReason({
  correction,
  firstPassEvidence,
  verifierEvidence,
  ocr,
}) {
  if (
    !correction ||
    correction.review_reason === "verifier_output_invalid" ||
    correction.review_reason === "malformed_model_output"
  ) {
    return "verifier_output_invalid";
  }
  const evidenceReason = firstPassEvidence?.reason || verifierEvidence?.reason;
  if (!ocr || evidenceReason === "ocr_structure_unavailable") {
    return "ocr_geometry_unavailable";
  }
  if (
    evidenceReason === "ingredient_row_not_found" ||
    evidenceReason === "ambiguous_neighboring_dose"
  ) {
    return evidenceReason;
  }
  if (evidenceReason === "dose_not_on_same_row") {
    return "ocr_evidence_inconclusive";
  }
  if (["verified", "corrected"].includes(correction.decision)) {
    return "verifier_inconclusive";
  }
  return normalizeReviewReason(
    correction.review_reason,
    "ocr_evidence_inconclusive",
  );
}

export function mergeDoseCorrections(
  ingredients,
  corrections,
  { ocr = null, onDiagnostic = null } = {},
) {
  const correctionsByIndex = new Map();
  (Array.isArray(corrections) ? corrections : []).forEach((correction) => {
    if (Number.isInteger(correction?.index)) {
      correctionsByIndex.set(correction.index, correction);
    }
  });
  const rejectedSharedCfuIndexes = findAmbiguousSharedCfuIndexes(
    ingredients,
    correctionsByIndex,
  );

  return (Array.isArray(ingredients) ? ingredients : []).map(
    (ingredient, index) => {
      const correction = correctionsByIndex.get(index);
      const firstPass = getFirstPassDose(ingredient);
      const firstPassValue = firstPass.value;
      const firstPassUnit = firstPass.unit;
      const firstPassText = firstPass.originalText;
      const decision = DOSE_DECISION_VALUES.has(correction?.decision)
        ? correction.decision
        : "unverified";
      const correctedPair = normalizeExtractedDosePair(
        correction?.dosage_value,
        correction?.dosage_unit,
        correction?.dosage_original_text ?? firstPassText,
      );
      const firstPassPair = firstPass.pair;
      let mergeOutcome = "missing";
      let finalPair = firstPassPair;
      let finalText = firstPassText;
      let finalReviewReason = null;
      let finalEvidence = null;
      let verifierEvidence = null;
      const deterministicOcrDose = findDeterministicIngredientDose({
        ingredientName: ingredient?.canonical_name,
        rawName: ingredient?.raw_name,
        chemicalForm: ingredient?.chemical_form,
        ocr,
      });
      const firstPassEvidence = ocr && firstPassPair.isUsable
        ? verifyDoseAgainstOcr({
            ingredientName: ingredient?.canonical_name,
            rawName: ingredient?.raw_name,
            chemicalForm: ingredient?.chemical_form,
            rawDosageValue: firstPassPair.value,
            rawDosageUnit: firstPassPair.unit,
            dosageOriginalText: firstPassText,
            ocr,
          })
        : null;
      const rejectsSharedCfuEvidence = rejectedSharedCfuIndexes.has(index);
      const isFrontLabelOnly =
        ingredient?.dose_review_reason === "front_label_only" ||
        (ingredient?.ingredient_type === "uncertain" &&
          ingredient?.evidence_source === "front_label");
      const verifierOutputInvalid =
        !correction || correction?.review_reason === "verifier_output_invalid";

      if (
        (decision === "verified" || decision === "corrected") &&
        correctedPair.isUsable &&
        !isFrontLabelOnly &&
        !rejectsSharedCfuEvidence
      ) {
        if (ocr) {
          verifierEvidence = verifyDoseAgainstOcr({
            ingredientName: ingredient?.canonical_name,
            rawName: ingredient?.raw_name,
            chemicalForm: ingredient?.chemical_form,
            rawDosageValue: correctedPair.value,
            rawDosageUnit: correctedPair.unit,
            dosageOriginalText: correction?.dosage_original_text,
            ocr,
          });
        }

        if (verifierEvidence?.outcome === "confirmed") {
          mergeOutcome = decision === "corrected" ? "corrected" : "confirmed";
          finalPair = correctedPair;
          finalText = normalizeWhitespace(correction?.dosage_original_text) ||
            firstPassText;
          finalEvidence = verifierEvidence;
        }
      }

      if (
        mergeOutcome === "missing" &&
        !verifierOutputInvalid &&
        decision !== "retracted" &&
        !isFrontLabelOnly &&
        !rejectsSharedCfuEvidence &&
        firstPassEvidence?.outcome === "confirmed"
      ) {
        mergeOutcome = "confirmed";
        finalEvidence = firstPassEvidence;
      }

      const deterministicConflict =
        firstPassEvidence?.reason === "conflicting_same_row_dose" ||
        verifierEvidence?.reason === "conflicting_same_row_dose";
      const verifierAllowsDeterministicCorrection =
        decision !== "retracted" ||
        correction?.review_reason === "conflicting_same_row_dose";
      if (
        mergeOutcome === "missing" &&
        deterministicOcrDose &&
        deterministicConflict &&
        verifierAllowsDeterministicCorrection &&
        !isFrontLabelOnly &&
        !rejectsSharedCfuEvidence
      ) {
        mergeOutcome = "corrected";
        finalPair = deterministicOcrDose.pair;
        finalText = normalizeWhitespace(deterministicOcrDose.evidenceText) ||
          normalizeWhitespace(deterministicOcrDose.pair?.originalText) ||
          firstPassText;
        finalEvidence = deterministicOcrDose;
      }

      const twoPassDoseAgreement =
        decision === "verified" &&
        correction?.review_reason === null &&
        correctedPair.isUsable &&
        firstPassPair.isUsable &&
        correctedPair.value === firstPassPair.value &&
        correctedPair.unit === firstPassPair.unit &&
        firstPassEvidence?.outcome === "inconclusive" &&
        firstPassEvidence?.reason === "dose_not_on_same_row" &&
        verifierEvidence?.outcome === "inconclusive" &&
        verifierEvidence?.reason === "dose_not_on_same_row" &&
        ["ingredient_panel_ocr", "ingredient_panel_image"].includes(
          ingredient?.evidence_source,
        ) &&
        Boolean(normalizeWhitespace(ingredient?.evidence_reference)) &&
        hasDoseLikeOriginalText(
          correction?.dosage_original_text,
          ingredient,
        );
      if (mergeOutcome === "missing" && twoPassDoseAgreement) {
        mergeOutcome = "confirmed";
        finalPair = correctedPair;
        finalText = normalizeWhitespace(correction.dosage_original_text) ||
          firstPassText;
        finalEvidence = {
          evidenceSource: "ingredient_panel_image",
          evidenceReference: ingredient.evidence_reference,
          evidenceText: finalText,
          evidenceConfidence: finiteNumber(ingredient?.evidence_confidence),
          visualRowId: ingredient.evidence_reference,
          association: {
            selected: true,
            matchingStrategy: "two_pass_image_agreement",
          },
        };
      }

      if (mergeOutcome === "missing") {
        const contradictionReason = isFrontLabelOnly
          ? "front_label_only"
          : rejectsSharedCfuEvidence
          ? "ambiguous_neighboring_dose"
          : decision === "retracted"
          ? normalizeReviewReason(
              correction?.review_reason,
              "verifier_retracted_dose",
            )
          : firstPassEvidence?.outcome === "contradicted"
          ? firstPassEvidence.reason
          : verifierEvidence?.outcome === "contradicted"
          ? verifierEvidence.reason
          : null;
        if (contradictionReason) {
          mergeOutcome = "contradicted";
          finalReviewReason = contradictionReason;
        } else if (!firstPassPair.isUsable) {
          const hadFirstPassDose = Number.isFinite(firstPassValue) ||
            Boolean(firstPassUnit);
          mergeOutcome = hadFirstPassDose ? "malformed" : "missing";
          finalReviewReason = hadFirstPassDose
            ? firstPassPair.reviewReason || "malformed_model_output"
            : null;
        } else {
          mergeOutcome = "inconclusive";
          finalReviewReason = getInconclusiveDoseReviewReason({
            correction,
            firstPassEvidence,
            verifierEvidence,
            ocr,
          });
        }
      }

      const isVerified =
        mergeOutcome === "confirmed" || mergeOutcome === "corrected";
      const retainsStructuredDose = isVerified || mergeOutcome === "inconclusive";
      const retainsMalformedText =
        mergeOutcome === "malformed" &&
        hasDoseLikeOriginalText(firstPassText, ingredient);
      const nextIngredient = {
        ...ingredient,
        dosage_value: retainsStructuredDose ? finalPair.value : null,
        dosage_unit: retainsStructuredDose ? finalPair.unit : null,
        dosage_original_text: retainsStructuredDose
          ? finalText
          : retainsMalformedText
          ? firstPassText
          : null,
        dose_confidence: isVerified
          ? "verified"
          : mergeOutcome === "missing"
          ? "missing"
          : "unverified",
        dose_review_reason: isVerified ? null : finalReviewReason,
        verifier_decision: isVerified
          ? mergeOutcome === "corrected"
            ? "corrected"
            : "verified"
          : mergeOutcome === "missing"
            ? "missing"
            : mergeOutcome === "inconclusive"
              ? "unverified"
              : "retracted",
        evidence_reference: finalEvidence?.evidenceReference ||
          ingredient?.evidence_reference || null,
      };

      if (typeof onDiagnostic === "function") {
        onDiagnostic({
          ingredientIndex: index,
          ingredientKey: buildIngredientVerificationKeys({
            ingredientName: ingredient?.canonical_name,
            rawName: ingredient?.raw_name,
            chemicalForm: ingredient?.chemical_form,
          })[0] || "unknown",
          firstPass: {
            hasDose: Number.isFinite(firstPassValue) && Boolean(firstPassUnit),
            value: firstPassValue,
            unit: firstPassUnit,
          },
          evidence: {
            source: ingredient?.evidence_source || "unknown",
            reference:
              verifierEvidence?.evidenceReference ||
              firstPassEvidence?.evidenceReference ||
              ingredient?.evidence_reference ||
              null,
            confidence: finiteNumber(ingredient?.evidence_confidence),
            visualRowId:
              verifierEvidence?.visualRowId ||
              firstPassEvidence?.visualRowId ||
              null,
            association:
              verifierEvidence?.association ||
              firstPassEvidence?.association ||
              null,
          },
          verifier: {
            decision: nextIngredient.verifier_decision,
            reason: nextIngredient.dose_review_reason,
          },
          finalDose: {
            value: finiteNumber(nextIngredient.dosage_value),
            unit: normalizeUnit(nextIngredient.dosage_unit),
            confidence: nextIngredient.dose_confidence,
            reviewReason: nextIngredient.dose_review_reason,
          },
        });
      }

      return nextIngredient;
    },
  );
}
