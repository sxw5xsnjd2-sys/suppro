import {
  DOSE_CONTRACT_VERSION,
  normalizeIngredientDose,
} from "@/features/supplements/doseNormalization";

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DOSAGE_UNIT_PATTERN = "mg|mcg|µg|μg|ug|pg|g|kg|ml|l|iu|%";
const STOPWORDS = new Set(["and", "or", "with", "from", "the", "a", "an"]);
const NON_INGREDIENT_PATTERNS = [
  /\bnutritional information\b/i,
  /\btypical values?\b/i,
  /\bserving\b/i,
  /\b% ?nr\b/i,
  /\b% ?nrv\b/i,
  /\bnrv\b/i,
  /\ballergens?\b/i,
  /\bsuggested use\b/i,
  /\bimportant information\b/i,
  /\bdirections?\b/i,
  /\bwarning(?:s)?\b/i,
  /\bconsume\b/i,
  /\bonce daily\b/i,
  /\bdo not exceed\b/i,
  /\bproduced in a facility\b/i,
  /\bfood supplement\b/i,
  /\bsubstitute for a varied diet\b/i,
  /\bhealthy lifestyle\b/i,
];
const EXCIPIENT_PATTERNS = [
  /\bbulking agent\b/i,
  /\bstearate\b/i,
  /\bstearic acid\b/i,
  /\bsilicon dioxide\b/i,
  /\bsilica\b/i,
  /\btitanium dioxide\b/i,
  /\bmicrocrystalline cellulose\b/i,
  /\bcellulose\b/i,
  /\bhydroxypropyl methylcellulose\b/i,
  /\bcroscarmellose\b/i,
  /\bmaltodextrin\b/i,
  /\bgelatin\b/i,
  /\bshellac\b/i,
  /\btalc\b/i,
  /\bcoating\b/i,
  /\bglazing agent\b/i,
  /\bglazing agents\b/i,
  /\banti[- ]caking\b/i,
  /\bflavour(?:ing)?\b/i,
  /\bflavor(?:ing)?\b/i,
  /\bsweetener\b/i,
  /\bglycerin(?:e)?\b/i,
  /\bcarnauba wax\b/i,
  /\bsucralose\b/i,
  /\bsorbitol\b/i,
  /\bxylitol\b/i,
  /\bacacia gum\b/i,
  /\bgum arabic\b/i,
  /\bcapsule shell\b/i,
];

// Exact-match blocklist for ordinary food ingredients, allergens, and common food
// components that OpenFoodFacts (and similar sources) can return in an ingredients
// field.  These must NOT be treated as active supplement ingredients — they would
// otherwise partially match supplement catalog entries (e.g. "milk" → "milk thistle").
// Entries are pre-normalized via normalizePlainText so the runtime comparison is cheap.
const FOOD_INGREDIENT_BLOCKLIST = new Set([
  "milk",
  "whole milk",
  "skimmed milk",
  "milk powder",
  "skimmed milk powder",
  "whole milk powder",
  "cocoa",
  "cocoa mass",
  "cocoa butter",
  "cocoa powder",
  "sugar",
  "water",
  "purified water",
  "glucose syrup",
  "cream",
  "butter",
  "emulsifier",
  "soya lecithin",
  "soy lecithin",
  "whey powder",
]);

const ALIAS_GROUPS = [
  ["vitamin c", "ascorbic acid"],
  ["vitamin b1", "thiamine", "thiamin"],
  ["vitamin b2", "riboflavin"],
  ["vitamin b3", "niacinamide", "nicotinamide"],
  ["vitamin b5", "pantothenic acid", "pantothenate"],
  [
    "vitamin b6",
    "pyridoxine",
    "p5p",
    "plp",
    "pyridoxal phosphate",
    "pyridoxal-5-phosphate",
    "pyridoxal 5 phosphate",
  ],
  ["vitamin b7", "biotin"],
  ["vitamin b9", "folic acid", "folate"],
  ["vitamin b12", "cyanocobalamin", "methylcobalamin", "cobalamin"],
  ["vitamin d", "vitamin d3", "cholecalciferol"],
  ["vitamin d", "vitamin d2", "ergocalciferol"],
  ["vitamin k", "vitamin k1", "vitamin k2", "phylloquinone", "menaquinone"],
  ["vitamin e", "alpha tocopherol", "tocopherol"],
  ["vitamin a", "retinol", "beta carotene"],
  ["b complex", "b-complex", "b complex vitamins", "b-complex vitamins"],
  [
    "collagen",
    "collagen peptides",
    "hydrolyzed collagen",
    "hydrolysed collagen",
    "marine collagen",
  ],
  [
    "omega 3 fatty acids",
    "omega-3 fatty acids",
    "omega 3",
    "omega-3",
    "dha",
    "epa",
    "docosahexaenoic acid",
    "eicosapentaenoic acid",
  ],
];
const ALIAS_FORMS_CACHE = new Map();
const CATALOG_LOOKUP_CACHE = new WeakMap();
const MAX_ALIAS_FORM_CACHE_SIZE = 2000;

function normalizePlainText(value) {
  return trimString(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFirstValue(source, keys) {
  if (!source || typeof source !== "object") {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (
      value !== null &&
      value !== undefined &&
      (typeof value !== "string" || trimString(value) !== "")
    ) {
      return value;
    }
  }

  return null;
}

function normalizeStructuredIngredientSource(ingredient) {
  if (!ingredient || typeof ingredient !== "object") {
    return null;
  }

  const name =
    trimString(
      getFirstValue(ingredient, [
        "name",
        "canonicalName",
        "canonical_name",
        "ingredientName",
        "raw_name",
        "rawName",
      ])
    ) || "";
  const raw =
    trimString(
      getFirstValue(ingredient, [
        "raw",
        "rawName",
        "raw_name",
        "name",
        "canonicalName",
        "canonical_name",
      ])
    ) || name;
  const normalizedDose = normalizeIngredientDose(ingredient, {
    allowDisplayParsing: true,
  });
  const chemicalForm =
    trimString(getFirstValue(ingredient, ["chemicalForm", "chemical_form"])) ||
    null;

  return {
    raw,
    name,
    amount: normalizedDose.value,
    unit: normalizedDose.unit,
    dosageOriginalText: normalizedDose.dosageOriginalText,
    dosageDisplay: normalizedDose.displayText,
    chemicalForm,
    amountBasis: normalizedDose.amountBasis,
    doseConfidence: normalizedDose.doseConfidence,
    doseReviewReason: normalizedDose.doseReviewReason,
    normalizedDose,
  };
}

function buildStructuredIngredientDisplay(ingredient) {
  const structured = normalizeStructuredIngredientSource(ingredient);

  if (!structured?.name) {
    return "";
  }

  if (structured.dosageDisplay) {
    return `${structured.name} ${structured.dosageDisplay}`;
  }

  if (Number.isFinite(structured.amount) && structured.unit) {
    return `${structured.name} ${structured.amount}${structured.unit}`;
  }

  return structured.name;
}

function cleanPhrase(value) {
  return normalizePlainText(value)
    .replace(/\(\s*\d+(?:[.,]\d+)?\s*%?\s*\)/g, " ")
    .replace(/\bingredients?\s*:?/g, " ")
    .replace(/\bcontains\b\s*:?/g, " ")
    .replace(/\bmay contain\b\s*:?/g, " ")
    .replace(/\bnr\b/gi, " ")
    .replace(/\borganic\b/g, " ")
    .replace(/\bnon[- ]gmo\b/g, " ")
    .replace(
      new RegExp(`\\b\\d+([.,]\\d+)?\\s*(${DOSAGE_UNIT_PATTERN})\\b`, "gi"),
      " "
    )
    .replace(/\b\d+([.,]\d+)?\b/g, " ")
    .replace(/[/%]/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSplitReadyText(value) {
  return trimString(value)
    .replace(/[()[\]{}]/g, ", ")
    .replace(/[;|•·]/g, ",")
    .replace(/\bcontains\b\s*:?/gi, ", ")
    .replace(/\bmay contain\b\s*:?/gi, ", ")
    .replace(/\s+and\s+/gi, ", ")
    .replace(/\r?\n/g, ",");
}

function tokenize(normalized) {
  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !STOPWORDS.has(token));
}

function addAliases(forms, aliases) {
  aliases
    .map((alias) => cleanPhrase(alias))
    .filter(Boolean)
    .forEach((alias) => forms.add(alias));
}

function addSlashVariantAliases(normalized, forms) {
  if (!normalized.includes("/")) {
    return;
  }

  const parts = normalized
    .split("/")
    .map((part) => cleanPhrase(part))
    .filter(Boolean);

  if (parts.length < 2) {
    return;
  }

  addAliases(forms, parts);

  if (parts.length === 2) {
    const [left, right] = parts;
    const rightTokens = tokenize(right);

    if (rightTokens.length > 1) {
      addAliases(forms, [`${left} ${rightTokens.slice(1).join(" ")}`]);
    }
  }
}

function addDerivedAliasForms(normalized, forms) {
  if (
    /\bvitamin d\b|\bvitamin d2\b|\bvitamin d3\b|\bd2\b|\bd3\b|\bcholecalciferol\b|\bergocalciferol\b/i.test(
      normalized
    )
  ) {
    addAliases(forms, [
      "vitamin d",
      "vitamin d2",
      "vitamin d3",
      "cholecalciferol",
      "ergocalciferol",
    ]);
  }

  if (
    /\bvitamin k\b|\bvitamin k1\b|\bvitamin k2\b|\bk1\b|\bk2\b|\bphylloquinone\b|\bmenaquinone\b/i.test(
      normalized
    )
  ) {
    addAliases(forms, [
      "vitamin k",
      "vitamin k1",
      "vitamin k2",
      "phylloquinone",
      "menaquinone",
    ]);
  }

  if (/\bfolic acid\b|\bfolate\b|\bvitamin b9\b/i.test(normalized)) {
    addAliases(forms, ["folic acid", "folate", "vitamin b9"]);
  }

  if (/\bb-?complex\b|\bb-?complex vitamins\b/i.test(normalized)) {
    addAliases(forms, [
      "b complex",
      "b-complex",
      "b complex vitamins",
      "b-complex vitamins",
    ]);
  }

  if (
    /\bcollagen\b|\bcollagen peptides\b|\bhydroly[sz]ed collagen\b|\bmarine collagen\b/i.test(
      normalized
    )
  ) {
    addAliases(forms, [
      "collagen",
      "collagen peptides",
      "hydrolyzed collagen",
      "hydrolysed collagen",
      "marine collagen",
    ]);
  }
}

function getAliasForms(normalized) {
  const cached = ALIAS_FORMS_CACHE.get(normalized);
  if (cached) {
    return cached;
  }

  const forms = new Set([normalized]);

  ALIAS_GROUPS.forEach((group) => {
    const normalizedGroup = group.map(cleanPhrase).filter(Boolean);

    if (normalizedGroup.includes(normalized)) {
      addAliases(forms, normalizedGroup);
    }
  });

  addSlashVariantAliases(normalized, forms);
  addDerivedAliasForms(normalized, forms);

  if (ALIAS_FORMS_CACHE.size >= MAX_ALIAS_FORM_CACHE_SIZE) {
    ALIAS_FORMS_CACHE.clear();
  }
  ALIAS_FORMS_CACHE.set(normalized, forms);

  return forms;
}

function hasWholePhraseMatch(longerValue, shorterValue) {
  if (!longerValue || !shorterValue || shorterValue.length < 4) {
    return false;
  }

  const matcher = new RegExp(
    `(?:^|\\s)${escapeRegExp(shorterValue)}(?:$|\\s)`,
    "i"
  );

  return matcher.test(longerValue);
}

export function normalizeIngredientText(text) {
  return cleanPhrase(text);
}

export function classifyIngredientText(text) {
  const value = trimString(text);
  if (!value) {
    return "ignore";
  }

  if (NON_INGREDIENT_PATTERNS.some((pattern) => pattern.test(value))) {
    return "ignore";
  }

  if (EXCIPIENT_PATTERNS.some((pattern) => pattern.test(value))) {
    return "inactive";
  }

  // Exact-match guard: ordinary food/allergen ingredients (e.g. "milk", "cocoa butter")
  // must be classified inactive so they are never presented as supplement candidates.
  if (FOOD_INGREDIENT_BLOCKLIST.has(normalizePlainText(value))) {
    return "inactive";
  }

  return "active";
}

function resolveIngredientClassification(values) {
  let sawActive = false;

  for (const value of values ?? []) {
    const classification = classifyIngredientText(value);

    if (classification === "inactive") {
      return "inactive";
    }

    if (classification === "active") {
      sawActive = true;
    }
  }

  return sawActive ? "active" : "ignore";
}

function isLikelyNonIngredientText(text) {
  return classifyIngredientText(text) === "ignore";
}

export function getIngredientCandidateClassification(candidate) {
  if (candidate?.classification) {
    return candidate.classification;
  }

  return resolveIngredientClassification([candidate?.raw, candidate?.normalized]);
}

export function filterActiveIngredientCandidates(candidates) {
  return (candidates ?? []).filter(
    (candidate) => getIngredientCandidateClassification(candidate) === "active"
  );
}

export function getMatchedIngredientClassification(match) {
  if (match?.classification) {
    return match.classification;
  }

  const primaryValues = [
    match?.ingredientRaw,
    match?.ingredientNormalized,
    match?.ingredientName,
  ].filter(Boolean);
  const fallbackValues = primaryValues.length > 0 ? [] : [match?.catalogName];

  return resolveIngredientClassification([...primaryValues, ...fallbackValues]);
}

export function filterActiveMatchedIngredients(matches) {
  return (matches ?? [])
    .filter((match) => trimString(match?.catalogId))
    .filter(
      (match) => getMatchedIngredientClassification(match) === "active"
    )
    .map((match) => ({
      ...match,
      classification: "active",
    }));
}

function stripSupplementLabelPreamble(text) {
  const value = trimString(text);
  if (!value) {
    return "";
  }

  return value
    .replace(/^.*?\bserving\b[:)]?\s*/i, "")
    .replace(/\(\s*100%\s*\)/gi, " ")
    .replace(/\b% ?nrv?\b/gi, " ")
    .replace(/\bnr\b/gi, " ")
    .replace(/\bnrv\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSupplementTrailingSections(text) {
  const value = trimString(text);
  if (!value) {
    return "";
  }

  const markers = [
    "allergens",
    "suggested use",
    "important information",
    "directions",
    "warning",
    "warnings",
    "advisory information",
    "storage",
  ];

  let cutoff = value.length;

  markers.forEach((marker) => {
    const pattern = new RegExp(`\\b${escapeRegExp(marker)}\\b`, "i");
    const match = pattern.exec(value);
    if (match && match.index < cutoff) {
      cutoff = match.index;
    }
  });

  return value.slice(0, cutoff).trim();
}

function insertSupplementDoseBreaks(text) {
  const value = trimString(text);
  if (!value) {
    return "";
  }

  const doseBoundary = new RegExp(
    `(\\d+(?:[.,]\\d+)?\\s*(?:${DOSAGE_UNIT_PATTERN}))(?:\\s+\\d+(?:[.,]\\d+)?%?)?(?=\\s+[A-Z])`,
    "gi"
  );

  return value.replace(doseBoundary, "$1, ");
}

function prepareSupplementIngredientText(text) {
  return insertSupplementDoseBreaks(
    stripSupplementTrailingSections(stripSupplementLabelPreamble(text))
  );
}

function toIngredientCandidate(raw, extra = {}) {
  const collapsed = trimString(raw).replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return null;
  }

  const rawClassification = classifyIngredientText(collapsed);
  if (rawClassification === "ignore") {
    return null;
  }

  const normalized = normalizeIngredientText(extra.name ?? collapsed);
  if (!normalized) {
    return null;
  }

  const classification = resolveIngredientClassification([collapsed, normalized]);

  if (classification === "ignore") {
    return null;
  }

  return {
    raw: collapsed,
    normalized,
    tokens: tokenize(normalized),
    classification,
    ...extra,
  };
}

function dedupeIngredientCandidates(rawCandidates) {
  const deduped = new Map();

  (rawCandidates ?? []).forEach((candidate) => {
    if (!candidate?.normalized) {
      return;
    }

    const existing = deduped.get(candidate.normalized);
    const candidateHasDose =
      Number.isFinite(candidate.amount) && Boolean(candidate.unit);
    const existingHasDose =
      Number.isFinite(existing?.amount) && Boolean(existing?.unit);

    if (
      !existing ||
      (candidateHasDose && !existingHasDose) ||
      ((candidate?.raw?.length ?? 0) < (existing?.raw?.length ?? Infinity) &&
        candidateHasDose === existingHasDose)
    ) {
      deduped.set(candidate.normalized, candidate);
    }
  });

  return Array.from(deduped.values());
}

function extractDelimitedIngredientCandidates(text) {
  const rawSegments = toSplitReadyText(prepareSupplementIngredientText(text))
    .split(",")
    .map((segment) => trimString(segment))
    .filter(Boolean);

  return dedupeIngredientCandidates(
    rawSegments
      .map((rawSegment) => toIngredientCandidate(rawSegment))
      .filter(Boolean)
  );
}

function extractIngredientCandidatesFromSourceIngredients(sourceIngredients) {
  const candidates = (sourceIngredients ?? []).flatMap((ingredient) => {
    if (ingredient && typeof ingredient === "object") {
      const structured = normalizeStructuredIngredientSource(ingredient);
      const candidate = toIngredientCandidate(
        structured?.raw || buildStructuredIngredientDisplay(ingredient),
        {
          name: structured?.name,
          amount: structured?.amount,
          unit: structured?.unit,
          dosageOriginalText: structured?.dosageOriginalText,
          dosageDisplay: structured?.dosageDisplay,
          chemicalForm: structured?.chemicalForm,
          amountBasis: structured?.amountBasis,
          doseConfidence: structured?.doseConfidence,
          doseReviewReason: structured?.doseReviewReason,
          normalizedDose: structured?.normalizedDose,
        }
      );

      return candidate ? [candidate] : [];
    }

    const prepared = prepareSupplementIngredientText(ingredient);
    if (!prepared) {
      return [];
    }

    const structured = extractStructuredIngredientCandidates(prepared);
    if (structured.length >= 2) {
      return structured;
    }

    const delimited = extractDelimitedIngredientCandidates(prepared);
    if (delimited.length >= 2) {
      return delimited;
    }

    const fallback = toIngredientCandidate(prepared);
    return fallback ? [fallback] : [];
  });

  return dedupeIngredientCandidates(candidates);
}

function extractStructuredIngredientCandidates(text) {
  const body = prepareSupplementIngredientText(text);
  if (!body) {
    return [];
  }

  const regex =
    /([A-Za-z][A-Za-z0-9\s\-+()/,&]*?)\s*(\d+(?:[.,]\d+)?)\s*(mg|µg|μg|ug|mcg|pg|g|iu)\b(?:\s*(?:[A-Z]{1,4}|% ?NRV|NRV))?/gi;
  const structured = [];
  let match;

  while ((match = regex.exec(body)) !== null) {
    const raw = trimString(match[0]);
    const name = trimString(match[1]).replace(/[-,;:]+$/g, "").trim();
    const amount = Number.parseFloat(match[2].replace(",", "."));
    const unit = trimString(match[3]).toLowerCase();
    const candidate = toIngredientCandidate(raw, {
      name,
      amount: Number.isFinite(amount) ? amount : null,
      unit,
    });

    if (candidate) {
      structured.push(candidate);
    }
  }

  return dedupeIngredientCandidates(structured);
}

export function extractIngredientCandidates(text) {
  return filterActiveIngredientCandidates(extractDelimitedIngredientCandidates(text));
}

export function extractIngredientCandidatesFromList(values, options = {}) {
  let dosageParsingDurationMs = 0;
  let nameNormalizationDurationMs = 0;
  const candidates = [];

  (values ?? []).forEach((value) => {
    let candidate = null;
    if (value && typeof value === "object") {
      let stageStartedAt = nowMs();
      const structured = normalizeStructuredIngredientSource(value);
      dosageParsingDurationMs += nowMs() - stageStartedAt;

      stageStartedAt = nowMs();
      candidate = toIngredientCandidate(
        structured?.raw || buildStructuredIngredientDisplay(value),
        {
          name: structured?.name,
          amount: structured?.amount,
          unit: structured?.unit,
          dosageOriginalText: structured?.dosageOriginalText,
          dosageDisplay: structured?.dosageDisplay,
          chemicalForm: structured?.chemicalForm,
          amountBasis: structured?.amountBasis,
          doseConfidence: structured?.doseConfidence,
          doseReviewReason: structured?.doseReviewReason,
          normalizedDose: structured?.normalizedDose,
        },
      );
      nameNormalizationDurationMs += nowMs() - stageStartedAt;
    } else {
      const stageStartedAt = nowMs();
      candidate = toIngredientCandidate(value);
      nameNormalizationDurationMs += nowMs() - stageStartedAt;
    }

    if (candidate) {
      candidates.push(candidate);
    }
  });

  options?.logTiming?.(
    options?.scanRequestId,
    "ingredient_dosage_parsing_completed",
    {
      durationMs: Math.round(dosageParsingDurationMs * 10) / 10,
      ingredientCount: values?.length ?? 0,
    },
  );
  options?.logTiming?.(
    options?.scanRequestId,
    "ingredient_name_normalization_completed",
    {
      durationMs: Math.round(nameNormalizationDurationMs * 10) / 10,
      candidateCount: candidates.length,
    },
  );

  const deduplicationStartedAt = nowMs();
  const activeCandidates = filterActiveIngredientCandidates(
    dedupeIngredientCandidates(candidates),
  );
  logMatchingTiming(
    options,
    "ingredient_extraction_deduplication_completed",
    deduplicationStartedAt,
    { activeCandidateCount: activeCandidates.length },
  );

  return activeCandidates;
}

function scoreCandidateSet(candidates) {
  return (candidates ?? []).reduce((score, candidate) => {
    let nextScore = score + 10;

    if (candidate?.amount != null) {
      nextScore += 2;
    }

    if ((candidate?.tokens?.length ?? 0) >= 2) {
      nextScore += 1;
    }

    if ((candidate?.raw?.length ?? 0) > 80) {
      nextScore -= 8;
    }

    if (isLikelyNonIngredientText(candidate?.raw)) {
      nextScore -= 25;
    }

    return nextScore;
  }, 0);
}

export function extractBestIngredientCandidates(product) {
  const sourceCandidates = filterActiveIngredientCandidates(
    extractIngredientCandidatesFromSourceIngredients(product?.sourceIngredients)
  );
  const structuredCandidates = filterActiveIngredientCandidates(
    extractStructuredIngredientCandidates(product?.ingredientsText)
  );
  const delimitedCandidates = filterActiveIngredientCandidates(
    extractDelimitedIngredientCandidates(product?.ingredientsText)
  );

  const candidateSets = [
    sourceCandidates,
    structuredCandidates,
    delimitedCandidates,
  ].filter((candidates) => candidates.length > 0);

  if (!candidateSets.length) {
    return [];
  }

  return candidateSets.sort((left, right) => {
    const scoreDifference = scoreCandidateSet(right) - scoreCandidateSet(left);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return right.length - left.length;
  })[0];
}

export function buildCatalogIndex(rows) {
  return (rows ?? []).map((row) => {
    const normalizedName = cleanPhrase(row.catalogName);
    const tokens = tokenize(normalizedName);

    return {
      ...row,
      normalizedName,
      tokens,
      tokenSet: new Set(tokens),
      aliasForms: getAliasForms(normalizedName),
    };
  });
}

function appendLookupEntry(lookup, key, entry) {
  if (!key) {
    return;
  }

  const entries = lookup.get(key);
  if (entries) {
    entries.push(entry);
  } else {
    lookup.set(key, [entry]);
  }
}

function buildCatalogLookup(rows) {
  const entries = buildCatalogIndex(rows);
  const exactByName = new Map();
  const byAlias = new Map();

  entries.forEach((entry) => {
    appendLookupEntry(exactByName, entry.normalizedName, entry);
    entry.aliasForms.forEach((alias) => {
      appendLookupEntry(byAlias, alias, entry);
    });
  });

  return { entries, exactByName, byAlias };
}

function getCatalogLookup(rows) {
  if (Array.isArray(rows)) {
    const cached = CATALOG_LOOKUP_CACHE.get(rows);
    if (cached) {
      return { lookup: cached, cacheHit: true };
    }

    const lookup = buildCatalogLookup(rows);
    CATALOG_LOOKUP_CACHE.set(rows, lookup);
    return { lookup, cacheHit: false };
  }

  return { lookup: buildCatalogLookup(rows), cacheHit: false };
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function logMatchingTiming(options, stage, startedAt, details = {}) {
  options?.logTiming?.(options?.scanRequestId, stage, {
    durationMs: Math.round((nowMs() - startedAt) * 10) / 10,
    ...details,
  });
}

function compareCatalogEntries(left, right) {
  const nameComparison = left.catalogName.localeCompare(right.catalogName);
  if (nameComparison !== 0) {
    return nameComparison;
  }

  return trimString(left.catalogId).localeCompare(trimString(right.catalogId));
}

function chooseBestCatalogEntry(entries) {
  let best = null;

  (entries ?? []).forEach((entry) => {
    if (!best || compareCatalogEntries(entry, best) < 0) {
      best = entry;
    }
  });

  return best;
}

function hasDose(match) {
  return Number.isFinite(match?.dosageValue) && Boolean(match?.dosageUnit);
}

export function scoreIngredientMatch(candidate, catalogEntry) {
  if (!candidate?.normalized || !catalogEntry?.normalizedName) {
    return null;
  }

  if (getIngredientCandidateClassification(candidate) !== "active") {
    return null;
  }

  if (candidate.normalized === catalogEntry.normalizedName) {
    return {
      matchType: "exact",
      score: 100,
    };
  }

  const candidateAliases =
    candidate.aliasForms ?? getAliasForms(candidate.normalized);
  const sharedAlias = Array.from(candidateAliases).some((alias) =>
    catalogEntry.aliasForms.has(alias)
  );

  if (sharedAlias) {
    return {
      matchType: "alias",
      score: 90,
    };
  }

  return scorePartialIngredientMatch(candidate, catalogEntry);
}

function scorePartialIngredientMatch(candidate, catalogEntry) {
  const catalogTokenSet =
    catalogEntry.tokenSet ?? new Set(catalogEntry.tokens ?? []);
  const sharedTokens = candidate.tokens.filter(
    (token) => token.length > 2 && catalogTokenSet.has(token)
  );

  if (sharedTokens.length === 0) {
    return null;
  }

  const shorterValue =
    candidate.normalized.length <= catalogEntry.normalizedName.length
      ? candidate.normalized
      : catalogEntry.normalizedName;
  const longerValue =
    shorterValue === candidate.normalized
      ? catalogEntry.normalizedName
      : candidate.normalized;

  if (!hasWholePhraseMatch(longerValue, shorterValue)) {
    return null;
  }

  // Single-token partial matches are too ambiguous: a one-word food ingredient like
  // "milk" would otherwise match multi-word supplement names like "milk thistle", and
  // "green" would match "green tea extract".  Require at least two tokens on the
  // shorter side before accepting a partial match.
  if (tokenize(shorterValue).length <= 1) {
    return null;
  }

  return {
    matchType: "partial",
    score: 60 + Math.min(sharedTokens.length * 6, 18),
  };
}

function buildMatchedIngredient(ingredient, catalogEntry, scored) {
  const normalizedDose =
    ingredient?.normalizedDose?.contractVersion === DOSE_CONTRACT_VERSION
      ? ingredient.normalizedDose
      : normalizeIngredientDose({
          dosageValue: ingredient?.amount,
          dosageUnit: ingredient?.unit,
          dosageOriginalText: ingredient?.dosageOriginalText,
          dosageDisplay: ingredient?.dosageDisplay,
          amountBasis: ingredient?.amountBasis,
          doseConfidence: ingredient?.doseConfidence,
          doseReviewReason: ingredient?.doseReviewReason,
        });

  return {
    ingredientRaw: ingredient.raw,
    ingredientNormalized: ingredient.normalized,
    catalogId: catalogEntry.catalogId,
    catalogName: catalogEntry.catalogName,
    verified: catalogEntry.verified,
    sourceTable: catalogEntry.sourceTable,
    matchType: scored.matchType,
    score: scored.score,
    classification: "active",
    dosageValue: normalizedDose.value,
    dosageUnit: normalizedDose.unit,
    dosageOriginalText: normalizedDose.dosageOriginalText,
    dosageDisplay: normalizedDose.displayText,
    chemicalForm: trimString(ingredient.chemicalForm) || null,
    amountBasis: normalizedDose.amountBasis,
    doseConfidence: normalizedDose.doseConfidence,
    doseReviewReason: normalizedDose.doseReviewReason,
    normalizedDose,
  };
}

export function matchIngredientsToCatalog(
  ingredients,
  catalogRows,
  options = {},
) {
  const matchingStartedAt = nowMs();
  options?.logTiming?.(options?.scanRequestId, "ingredient_matching_started", {
    ingredientCount: ingredients?.length ?? 0,
    catalogRowCount: catalogRows?.length ?? 0,
  });

  let stageStartedAt = nowMs();
  const activeIngredients = filterActiveIngredientCandidates(ingredients).map(
    (ingredient) => ({
      ...ingredient,
      aliasForms: getAliasForms(ingredient.normalized),
    }),
  );
  logMatchingTiming(
    options,
    "ingredient_matching_normalization_completed",
    stageStartedAt,
    { activeIngredientCount: activeIngredients.length },
  );

  stageStartedAt = nowMs();
  const { lookup: catalogLookup, cacheHit } = getCatalogLookup(catalogRows);
  logMatchingTiming(
    options,
    "ingredient_matching_catalog_index_completed",
    stageStartedAt,
    {
      cacheHit,
      indexedNameCount: catalogLookup.exactByName.size,
      indexedAliasCount: catalogLookup.byAlias.size,
    },
  );

  const resolutions = activeIngredients.map((ingredient) => ({
    ingredient,
    catalogEntry: null,
    scored: null,
  }));

  stageStartedAt = nowMs();
  resolutions.forEach((resolution) => {
    const exactEntries = catalogLookup.exactByName.get(
      resolution.ingredient.normalized,
    );
    const catalogEntry = chooseBestCatalogEntry(exactEntries);
    if (catalogEntry) {
      resolution.catalogEntry = catalogEntry;
      resolution.scored = { matchType: "exact", score: 100 };
    }
  });
  logMatchingTiming(
    options,
    "ingredient_matching_exact_completed",
    stageStartedAt,
    {
      matchedCount: resolutions.filter((resolution) => resolution.scored)
        .length,
    },
  );

  stageStartedAt = nowMs();
  resolutions.forEach((resolution) => {
    if (resolution.scored) {
      return;
    }

    const aliasEntries = [];
    const seenEntries = new Set();
    resolution.ingredient.aliasForms.forEach((alias) => {
      (catalogLookup.byAlias.get(alias) ?? []).forEach((entry) => {
        if (!seenEntries.has(entry)) {
          seenEntries.add(entry);
          aliasEntries.push(entry);
        }
      });
    });
    const catalogEntry = chooseBestCatalogEntry(aliasEntries);
    if (catalogEntry) {
      resolution.catalogEntry = catalogEntry;
      resolution.scored = { matchType: "alias", score: 90 };
    }
  });
  logMatchingTiming(
    options,
    "ingredient_matching_alias_completed",
    stageStartedAt,
    {
      matchedCount: resolutions.filter(
        (resolution) => resolution.scored?.matchType === "alias",
      ).length,
    },
  );

  stageStartedAt = nowMs();
  resolutions.forEach((resolution) => {
    if (resolution.scored) {
      return;
    }

    catalogLookup.entries.forEach((catalogEntry) => {
      const scored = scorePartialIngredientMatch(
        resolution.ingredient,
        catalogEntry,
      );
      if (!scored) {
        return;
      }

      if (
        !resolution.scored ||
        scored.score > resolution.scored.score ||
        (scored.score === resolution.scored.score &&
          compareCatalogEntries(catalogEntry, resolution.catalogEntry) < 0)
      ) {
        resolution.catalogEntry = catalogEntry;
        resolution.scored = scored;
      }
    });
  });
  logMatchingTiming(
    options,
    "ingredient_matching_fuzzy_completed",
    stageStartedAt,
    {
      fuzzyCandidateCount: resolutions.filter(
        (resolution) => resolution.scored?.matchType === "partial",
      ).length,
      unmatchedCandidateCount: resolutions.filter(
        (resolution) => !resolution.scored,
      ).length,
    },
  );

  stageStartedAt = nowMs();
  const bestMatchByCatalogId = new Map();
  const matchedIngredients = [];
  resolutions.forEach(({ ingredient, catalogEntry, scored }) => {
    if (!catalogEntry || !scored) {
      return;
    }

    const bestForIngredient = buildMatchedIngredient(
      ingredient,
      catalogEntry,
      scored,
    );
    matchedIngredients.push(bestForIngredient);

    const existing = bestMatchByCatalogId.get(bestForIngredient.catalogId);
    if (
      !existing ||
      bestForIngredient.score > existing.score ||
      (bestForIngredient.score === existing.score &&
        hasDose(bestForIngredient) &&
        !hasDose(existing)) ||
      (bestForIngredient.score === existing.score &&
        hasDose(bestForIngredient) === hasDose(existing) &&
        bestForIngredient.catalogName.localeCompare(existing.catalogName) < 0)
    ) {
      bestMatchByCatalogId.set(bestForIngredient.catalogId, bestForIngredient);
    }
  });

  const matches = Array.from(bestMatchByCatalogId.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.catalogName.localeCompare(right.catalogName);
  });

  const unmatchedIngredients = resolutions
    .filter((resolution) => !resolution.scored)
    .map((resolution) => resolution.ingredient.raw);
  logMatchingTiming(
    options,
    "ingredient_matching_deduplication_sort_completed",
    stageStartedAt,
    {
      matchedIngredientCount: matchedIngredients.length,
      deduplicatedMatchCount: matches.length,
      unmatchedIngredientCount: unmatchedIngredients.length,
    },
  );
  logMatchingTiming(options, "ingredient_matching_completed", matchingStartedAt, {
    cacheHit,
  });

  return {
    matchedIngredients,
    matches,
    unmatchedIngredients,
  };
}
