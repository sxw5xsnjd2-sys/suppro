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
const AMOUNT_BASIS_VALUES = new Set([
  "per_serving",
  "per_capsule",
  "per_tablet",
  "per_softgel",
  "per_scoop",
  "per_drop",
  "per_2_capsules",
  "per_3_capsules",
  "unknown",
]);
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

function normalizeDosageUnit(value) {
  const normalized = trimString(value)
    .toLowerCase()
    .replace(/[µμ]/g, "u");

  if (!normalized) {
    return null;
  }

  if (normalized === "ug") return "mcg";
  if (normalized === "iu") return "IU";
  if (normalized === "cfu") return "CFU";
  return normalized;
}

function normalizeAmountBasis(value, hasDose) {
  const normalized = trimString(value);

  if (normalized && normalized !== "unknown" && AMOUNT_BASIS_VALUES.has(normalized)) {
    return normalized;
  }

  return hasDose ? "per_serving" : null;
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
  const amount = parseOptionalNumber(
    getFirstValue(ingredient, ["dosageValue", "dosage_value", "amount", "value"])
  );
  const unit = normalizeDosageUnit(
    getFirstValue(ingredient, ["dosageUnit", "dosage_unit", "unit"])
  );
  const chemicalForm =
    trimString(getFirstValue(ingredient, ["chemicalForm", "chemical_form"])) ||
    null;
  const dosageDisplay =
    trimString(
      getFirstValue(ingredient, [
        "dosageDisplay",
        "dosage_display",
        "dosageOriginalText",
        "dosage_original_text",
      ])
    ) || null;
  const hasDose = Number.isFinite(amount) && Boolean(unit);

  return {
    raw,
    name,
    amount: hasDose ? amount : null,
    unit: hasDose ? unit : null,
    dosageDisplay,
    chemicalForm,
    amountBasis: normalizeAmountBasis(
      getFirstValue(ingredient, ["amountBasis", "amount_basis"]),
      hasDose
    ),
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
  const forms = new Set([normalized]);

  ALIAS_GROUPS.forEach((group) => {
    const normalizedGroup = group.map(cleanPhrase).filter(Boolean);

    if (normalizedGroup.includes(normalized)) {
      addAliases(forms, normalizedGroup);
    }
  });

  addSlashVariantAliases(normalized, forms);
  addDerivedAliasForms(normalized, forms);

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

function isLikelyExcipientText(text) {
  return classifyIngredientText(text) === "inactive";
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
          dosageDisplay: structured?.dosageDisplay,
          chemicalForm: structured?.chemicalForm,
          amountBasis: structured?.amountBasis,
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

export function extractIngredientCandidatesFromList(values) {
  return filterActiveIngredientCandidates(
    dedupeIngredientCandidates(
      (values ?? [])
        .map((value) => {
          if (value && typeof value === "object") {
            const structured = normalizeStructuredIngredientSource(value);

            return toIngredientCandidate(
              structured?.raw || buildStructuredIngredientDisplay(value),
              {
                name: structured?.name,
                amount: structured?.amount,
                unit: structured?.unit,
                dosageDisplay: structured?.dosageDisplay,
                chemicalForm: structured?.chemicalForm,
                amountBasis: structured?.amountBasis,
              }
            );
          }

          return toIngredientCandidate(value);
        })
        .filter(Boolean)
    )
  );
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

    return {
      ...row,
      normalizedName,
      tokens: tokenize(normalizedName),
      aliasForms: getAliasForms(normalizedName),
    };
  });
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

  const candidateAliases = getAliasForms(candidate.normalized);
  const sharedAlias = Array.from(candidateAliases).some((alias) =>
    catalogEntry.aliasForms.has(alias)
  );

  if (sharedAlias) {
    return {
      matchType: "alias",
      score: 90,
    };
  }

  const sharedTokens = candidate.tokens.filter(
    (token) => token.length > 2 && catalogEntry.tokens.includes(token)
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

  return {
    matchType: "partial",
    score: 60 + Math.min(sharedTokens.length * 6, 18),
  };
}

export function matchIngredientsToCatalog(ingredients, catalogRows) {
  const catalogIndex = buildCatalogIndex(catalogRows);
  const bestMatchByCatalogId = new Map();
  const matchedIngredientKeys = new Set();
  const matchedIngredients = [];
  const activeIngredients = filterActiveIngredientCandidates(ingredients);

  activeIngredients.forEach((ingredient) => {
    let bestForIngredient = null;

    catalogIndex.forEach((catalogEntry) => {
      const scored = scoreIngredientMatch(ingredient, catalogEntry);
      if (!scored) return;

      const nextMatch = {
        ingredientRaw: ingredient.raw,
        ingredientNormalized: ingredient.normalized,
        catalogId: catalogEntry.catalogId,
        catalogName: catalogEntry.catalogName,
        verified: catalogEntry.verified,
        sourceTable: catalogEntry.sourceTable,
        matchType: scored.matchType,
        score: scored.score,
        classification: "active",
        dosageValue: Number.isFinite(ingredient.amount)
          ? ingredient.amount
          : null,
        dosageUnit: normalizeDosageUnit(ingredient.unit),
        dosageDisplay: trimString(ingredient.dosageDisplay) || null,
        chemicalForm: trimString(ingredient.chemicalForm) || null,
        amountBasis: normalizeAmountBasis(
          ingredient.amountBasis,
          Number.isFinite(ingredient.amount) && Boolean(ingredient.unit)
        ),
      };

      if (
        !bestForIngredient ||
        nextMatch.score > bestForIngredient.score ||
        (nextMatch.score === bestForIngredient.score &&
          nextMatch.catalogName.localeCompare(bestForIngredient.catalogName) < 0)
      ) {
        bestForIngredient = nextMatch;
      }
    });

    if (!bestForIngredient) {
      return;
    }

    matchedIngredientKeys.add(ingredient.normalized);
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

  const unmatchedIngredients = activeIngredients
    .filter((ingredient) => !matchedIngredientKeys.has(ingredient.normalized))
    .map((ingredient) => ingredient.raw);

  return {
    matchedIngredients,
    matches,
    unmatchedIngredients,
  };
}
