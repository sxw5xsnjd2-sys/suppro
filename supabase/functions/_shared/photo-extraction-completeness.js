const DOSE_UNIT_SOURCE =
  "mcg|µg|μg|ug|micrograms?|mg|milligrams?|g|grams?|ml|millilit(?:er|re)s?|iu|international units?|cfu|colony[\\s-]+forming[\\s-]+units?";
const GENERIC_TABLE_HEADERS = new Set([
  "active ingredient",
  "active ingredients",
  "amount",
  "amount per serving",
  "daily value",
  "ingredient",
  "ingredients",
  "nutrient",
  "nutrients",
  "reference intake",
  "typical value",
  "typical values",
]);
const GENERIC_CONTINUATION_PREFIXES = [
  "as ",
  "equivalent ",
  "from ",
  "of which ",
  "providing ",
  "yielding ",
];

function normalizeWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function createDoseTokenPattern(flags = "giu") {
  return new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(${DOSE_UNIT_SOURCE})\\b`,
    flags,
  );
}

function normalizeUnit(value) {
  const normalized = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[µμ]/gu, "u");

  if (["ug", "mcg", "microgram", "micrograms"].includes(normalized)) {
    return "mcg";
  }
  if (["mg", "milligram", "milligrams"].includes(normalized)) return "mg";
  if (["g", "gram", "grams"].includes(normalized)) return "g";
  if (
    [
      "ml",
      "milliliter",
      "milliliters",
      "millilitre",
      "millilitres",
    ].includes(normalized)
  ) {
    return "ml";
  }
  if (["iu", "international unit", "international units"].includes(normalized)) {
    return "IU";
  }
  if (
    normalized === "cfu" ||
    /^colony[\s-]+forming[\s-]+units?$/u.test(normalized)
  ) {
    return "CFU";
  }

  return null;
}

function parseDoseTokens(value) {
  const text = normalizeWhitespace(value);
  if (!text) return [];

  const matches = [];
  for (const match of text.matchAll(createDoseTokenPattern())) {
    const dosageValue = Number.parseFloat(String(match[1]).replace(",", "."));
    const dosageUnit = normalizeUnit(match[2]);
    if (!Number.isFinite(dosageValue) || dosageValue < 0 || !dosageUnit) {
      continue;
    }

    matches.push({
      dosageValue,
      dosageUnit,
      index: match.index ?? 0,
      text: match[0],
    });
  }

  return matches;
}

function defaultNormalizeIngredientName(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(createDoseTokenPattern(), " ")
    .replace(/\d+(?:[.,]\d+)?\s*%/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function getIngredientIdentity(value, normalizeIngredientName) {
  const normalized = normalizeIngredientName(value);
  return typeof normalized === "string" ? normalized.trim() : "";
}

function isGenericTableHeader(value) {
  const normalized = defaultNormalizeIngredientName(value);
  if (!normalized) return true;
  if (GENERIC_TABLE_HEADERS.has(normalized)) return true;
  return /^(?:amount|daily value|reference intake|serving size|per serving)\b/u.test(
    normalized,
  );
}

function cleanStructuredIngredientName(value) {
  return normalizeWhitespace(value)
    .replace(/^\s*(?:[•·*†‡]+|\d+[.)])\s*/u, "")
    .replace(/[\s:;,|*†‡-]+$/u, "")
    .trim();
}

export function parseStructuredTableIngredientRow(row) {
  const rawRow = typeof row === "string" ? row.trim() : "";
  if (!rawRow) return null;

  const columns = rawRow.split("\t").map(normalizeWhitespace);
  const doseTokens = columns.flatMap((column, columnIndex) =>
    parseDoseTokens(column).map((token) => ({ ...token, columnIndex })),
  );
  const uniqueDoses = new Map();
  doseTokens.forEach((token) => {
    uniqueDoses.set(`${token.dosageValue}|${token.dosageUnit}`, token);
  });

  // Compound/equivalent rows with more than one distinct dose remain model-led.
  if (uniqueDoses.size !== 1) return null;

  const dose = uniqueDoses.values().next().value;
  if (!dose) return null;

  const nameParts = columns
    .slice(0, dose.columnIndex)
    .filter((column) => /\p{L}/u.test(column));
  const sameColumnPrefix = columns[dose.columnIndex].slice(0, dose.index).trim();
  if (
    /\p{L}/u.test(sameColumnPrefix) &&
    !isGenericTableHeader(sameColumnPrefix)
  ) {
    nameParts.push(sameColumnPrefix);
  }

  const ingredientName = cleanStructuredIngredientName(nameParts.join(" "));
  if (
    !ingredientName ||
    !/\p{L}{2}/u.test(ingredientName) ||
    isGenericTableHeader(ingredientName)
  ) {
    return null;
  }

  return {
    raw_name: ingredientName,
    canonical_name: ingredientName,
    ingredient_type: "active",
    dosage_value: dose.dosageValue,
    dosage_unit: dose.dosageUnit,
    dosage_original_text: columns.filter(Boolean).join(" "),
    chemical_form: null,
    amount_basis: "per_serving",
  };
}

function isPotentialIngredientNameLine(value) {
  const text = normalizeWhitespace(value);
  const normalized = defaultNormalizeIngredientName(text);
  return (
    Boolean(normalized) &&
    /\p{L}{2}/u.test(text) &&
    !parseDoseTokens(text).length &&
    !isGenericTableHeader(text) &&
    normalized.split(" ").length <= 12 &&
    text.length <= 140
  );
}

function isUnitOnlyContinuation(value) {
  const text = normalizeWhitespace(value);
  if (!text) return false;
  const withoutUnit = text
    .replace(new RegExp(`^(?:${DOSE_UNIT_SOURCE})\\b`, "iu"), " ")
    .replace(/\d+(?:[.,]\d+)?\s*%/gu, " ")
    .replace(/\b(?:dv|nrv|rda|ri|daily value|reference intake)\b/giu, " ")
    .replace(/[\s|()[\]{}:;,*†‡-]+/gu, "")
    .trim();
  return !withoutUnit;
}

function buildWrappedOcrRow(lines, startIndex) {
  const line = lines[startIndex];
  const directCandidate = parseStructuredTableIngredientRow(line);
  if (directCandidate) {
    return { row: line, endIndex: startIndex };
  }

  const nextLine = lines[startIndex + 1];
  if (!nextLine) return null;

  if (isPotentialIngredientNameLine(line)) {
    const joinedPair = `${line}\t${nextLine}`;
    if (
      parseStructuredTableIngredientRow(joinedPair) &&
      isDoseOnlyContinuation(nextLine, [createDoseTokenPattern("iu")])
    ) {
      return { row: joinedPair, endIndex: startIndex + 1 };
    }

    const followingLine = lines[startIndex + 2];
    if (followingLine) {
      const joinedContinuation = `${line} ${nextLine}\t${followingLine}`;
      if (
        isGenericContinuation(nextLine) &&
        parseStructuredTableIngredientRow(joinedContinuation) &&
        isDoseOnlyContinuation(followingLine, [createDoseTokenPattern("iu")])
      ) {
        return { row: joinedContinuation, endIndex: startIndex + 2 };
      }

      const joinedSplitDose = `${line}\t${nextLine} ${followingLine}`;
      if (
        parseStructuredTableIngredientRow(joinedSplitDose) &&
        isDoseOnlyContinuation(`${nextLine} ${followingLine}`, [
          createDoseTokenPattern("iu"),
        ])
      ) {
        return { row: joinedSplitDose, endIndex: startIndex + 2 };
      }
    }
  }

  if (/\p{L}{2}.*\d+(?:[.,]\d+)?\s*$/u.test(line) && isUnitOnlyContinuation(nextLine)) {
    const joinedUnit = `${line} ${nextLine}`;
    if (parseStructuredTableIngredientRow(joinedUnit)) {
      return { row: joinedUnit, endIndex: startIndex + 1 };
    }
  }

  return null;
}

export function buildOcrLineIngredientRowGroups(lines) {
  const normalizedLines = (Array.isArray(lines) ? lines : [])
    .map(normalizeWhitespace)
    .filter(Boolean);
  const logicalRows = [];

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const logicalRow = buildWrappedOcrRow(normalizedLines, index);
    if (!logicalRow) continue;
    logicalRows.push({
      row: logicalRow.row,
      startIndex: index,
      endIndex: logicalRow.endIndex,
    });
    index = logicalRow.endIndex;
  }

  const groups = [];
  logicalRows.forEach((logicalRow) => {
    const currentGroup = groups.at(-1);
    const previousRow = currentGroup?.at(-1);
    if (!previousRow || logicalRow.startIndex - previousRow.endIndex > 2) {
      groups.push([logicalRow]);
      return;
    }
    currentGroup.push(logicalRow);
  });

  return groups.map((group) => group.map((entry) => entry.row));
}

function getIngredientKeys(ingredient, normalizeIngredientName) {
  return new Set(
    [ingredient?.canonical_name, ingredient?.raw_name, ingredient?.name]
      .map((value) => getIngredientIdentity(value, normalizeIngredientName))
      .filter(Boolean),
  );
}

function findMatchingIngredientIndex(ingredients, candidate, normalizeIngredientName) {
  const candidateKeys = getIngredientKeys(candidate, normalizeIngredientName);
  if (!candidateKeys.size) return -1;

  return ingredients.findIndex((ingredient) => {
    const ingredientKeys = getIngredientKeys(ingredient, normalizeIngredientName);
    return Array.from(candidateKeys).some((key) => ingredientKeys.has(key));
  });
}

function hasUsableDose(ingredient) {
  return (
    typeof ingredient?.dosage_value === "number" &&
    Number.isFinite(ingredient.dosage_value) &&
    Boolean(normalizeWhitespace(ingredient?.dosage_unit))
  );
}

function candidateDoseMatchesIngredient(candidate, ingredient) {
  const ingredientUnit = normalizeUnit(ingredient?.dosage_unit);
  return (
    hasUsableDose(ingredient) &&
    ingredient.dosage_value === candidate.dosage_value &&
    ingredientUnit === candidate.dosage_unit
  );
}

export function recoverStructuredTableIngredients({
  ingredients,
  tableRowGroups,
  normalizeIngredientName = defaultNormalizeIngredientName,
}) {
  const recovered = Array.isArray(ingredients) ? [...ingredients] : [];
  const groups = Array.isArray(tableRowGroups) ? tableRowGroups : [];

  groups.forEach((rows) => {
    const candidates = (Array.isArray(rows) ? rows : [])
      .map(parseStructuredTableIngredientRow)
      .filter(Boolean);
    if (!candidates.length) return;

    const candidatesByIdentity = new Map();
    const conflictedIdentities = new Set();
    candidates.forEach((candidate) => {
      const identity = getIngredientIdentity(
        candidate.canonical_name,
        normalizeIngredientName,
      );
      if (!identity || conflictedIdentities.has(identity)) return;

      const existing = candidatesByIdentity.get(identity);
      if (
        existing &&
        (existing.dosage_value !== candidate.dosage_value ||
          existing.dosage_unit !== candidate.dosage_unit)
      ) {
        candidatesByIdentity.delete(identity);
        conflictedIdentities.add(identity);
        return;
      }
      if (!existing) candidatesByIdentity.set(identity, candidate);
    });

    const safeCandidates = Array.from(candidatesByIdentity.values());
    const matchedCandidateCount = safeCandidates.filter((candidate) => {
      const existingIndex = findMatchingIngredientIndex(
        recovered,
        candidate,
        normalizeIngredientName,
      );
      return (
        existingIndex >= 0 &&
        candidateDoseMatchesIngredient(candidate, recovered[existingIndex])
      );
    }).length;
    const minimumOverlap =
      safeCandidates.length === 1
        ? 1
        : Math.floor(safeCandidates.length / 2) + 1;

    // Only complete tables already demonstrated to be the same ingredient table.
    if (matchedCandidateCount < minimumOverlap) return;

    safeCandidates.forEach((candidate) => {
      const existingIndex = findMatchingIngredientIndex(
        recovered,
        candidate,
        normalizeIngredientName,
      );
      if (existingIndex < 0) {
        recovered.push(candidate);
        return;
      }

      const existing = recovered[existingIndex];
      if (hasUsableDose(existing)) return;
      recovered[existingIndex] = {
        ...existing,
        dosage_value: candidate.dosage_value,
        dosage_unit: candidate.dosage_unit,
        dosage_original_text:
          candidate.dosage_original_text || existing.dosage_original_text || null,
        amount_basis:
          existing.amount_basis && existing.amount_basis !== "unknown"
            ? existing.amount_basis
            : candidate.amount_basis,
      };
    });
  });

  return recovered;
}

function buildExistingIngredientAnchorRow(
  ingredient,
  normalizeIngredientName,
) {
  if (!hasUsableDose(ingredient)) return null;

  const originalText = normalizeWhitespace(ingredient?.dosage_original_text);
  const originalCandidate = parseStructuredTableIngredientRow(originalText);
  if (
    originalCandidate &&
    findMatchingIngredientIndex(
        [ingredient],
        originalCandidate,
        normalizeIngredientName,
      ) === 0 &&
    candidateDoseMatchesIngredient(originalCandidate, ingredient)
  ) {
    return originalText;
  }

  const ingredientName = normalizeWhitespace(
    ingredient?.raw_name || ingredient?.canonical_name || ingredient?.name,
  );
  const dosageUnit = normalizeUnit(ingredient?.dosage_unit);
  if (!ingredientName || !dosageUnit) return null;

  return `${ingredientName}\t${ingredient.dosage_value} ${dosageUnit}`;
}

function buildVerifiedMissingIngredientRow(
  ingredient,
  normalizeIngredientName,
) {
  const originalText = normalizeWhitespace(ingredient?.dosage_original_text);
  const parsed = parseStructuredTableIngredientRow(originalText);
  if (!parsed) return null;

  const declaredValue = ingredient?.dosage_value;
  const declaredUnit = normalizeUnit(ingredient?.dosage_unit);
  if (
    typeof declaredValue !== "number" ||
    !Number.isFinite(declaredValue) ||
    declaredValue !== parsed.dosage_value ||
    !declaredUnit ||
    declaredUnit !== parsed.dosage_unit
  ) {
    return null;
  }

  const declaredIdentities = [
    ingredient?.raw_name,
    ingredient?.canonical_name,
    ingredient?.name,
  ]
    .map((value) => getIngredientIdentity(value, normalizeIngredientName))
    .filter(Boolean);
  if (
    !declaredIdentities.some((identity) =>
      ingredientAppears(
        parsed.raw_name,
        identity,
        normalizeIngredientName,
      ),
    )
  ) {
    return null;
  }

  return originalText;
}

const OCR_CONFUSABLE_CHARACTER_GROUPS = [
  new Set(["i", "l", "1", "|"]),
  new Set(["o", "0"]),
  new Set(["s", "5"]),
  new Set(["b", "8"]),
];

export function areOcrConfusableIngredientNames(
  left,
  right,
  normalizeIngredientName = defaultNormalizeIngredientName,
) {
  const leftIdentity = getIngredientIdentity(left, normalizeIngredientName);
  const rightIdentity = getIngredientIdentity(right, normalizeIngredientName);
  if (
    !leftIdentity ||
    !rightIdentity ||
    leftIdentity === rightIdentity ||
    leftIdentity.length !== rightIdentity.length
  ) {
    return false;
  }

  let differingCharacters = null;
  for (let index = 0; index < leftIdentity.length; index += 1) {
    if (leftIdentity[index] === rightIdentity[index]) continue;
    if (differingCharacters) return false;
    differingCharacters = [leftIdentity[index], rightIdentity[index]];
  }

  return Boolean(
    differingCharacters &&
      OCR_CONFUSABLE_CHARACTER_GROUPS.some((group) =>
        differingCharacters.every((character) => group.has(character)),
      ),
  );
}

function getValidatedMissingIngredientCandidates(
  missingIngredients,
  normalizeIngredientName,
) {
  return (Array.isArray(missingIngredients) ? missingIngredients : [])
    .map((ingredient) => {
      const row = buildVerifiedMissingIngredientRow(
        ingredient,
        normalizeIngredientName,
      );
      return row
        ? { row, candidate: parseStructuredTableIngredientRow(row) }
        : null;
    })
    .filter((entry) => entry?.candidate);
}

function candidateExactlyMatchesIngredient(
  candidate,
  ingredient,
  normalizeIngredientName,
) {
  return (
    findMatchingIngredientIndex(
      [ingredient],
      candidate,
      normalizeIngredientName,
    ) === 0 && candidateDoseMatchesIngredient(candidate, ingredient)
  );
}

function candidateConfusablyMatchesIngredient(
  candidate,
  ingredient,
  normalizeIngredientName,
) {
  if (!candidateDoseMatchesIngredient(candidate, ingredient)) return false;

  const candidateNames = [candidate?.canonical_name, candidate?.raw_name]
    .map(normalizeWhitespace)
    .filter(Boolean);
  const ingredientNames = [
    ingredient?.canonical_name,
    ingredient?.raw_name,
    ingredient?.name,
  ]
    .map(normalizeWhitespace)
    .filter(Boolean);

  return candidateNames.some((candidateName) =>
    ingredientNames.some((ingredientName) =>
      areOcrConfusableIngredientNames(
        candidateName,
        ingredientName,
        normalizeIngredientName,
      ),
    ),
  );
}

export function getAcceptedImageDoseCorrectionEvidenceRows({
  ingredients,
  corrections,
  normalizeIngredientName = defaultNormalizeIngredientName,
}) {
  const existing = Array.isArray(ingredients) ? ingredients : [];
  const seenRows = new Set();

  return (Array.isArray(corrections) ? corrections : [])
    .map((correction) => {
      const index = correction?.index;
      if (
        typeof index !== "number" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= existing.length
      ) {
        return null;
      }

      const ingredient = existing[index];
      const dosageValue = correction?.dosage_value;
      const dosageUnit = normalizeUnit(correction?.dosage_unit);
      const originalText = normalizeWhitespace(
        correction?.dosage_original_text,
      );
      const parsed = parseStructuredTableIngredientRow(originalText);
      if (
        !parsed ||
        typeof dosageValue !== "number" ||
        !Number.isFinite(dosageValue) ||
        dosageValue !== ingredient?.dosage_value ||
        dosageValue !== parsed.dosage_value ||
        !dosageUnit ||
        dosageUnit !== normalizeUnit(ingredient?.dosage_unit) ||
        dosageUnit !== parsed.dosage_unit
      ) {
        return null;
      }

      if (
        !candidateExactlyMatchesIngredient(
          parsed,
          ingredient,
          normalizeIngredientName,
        ) &&
        !candidateConfusablyMatchesIngredient(
          parsed,
          ingredient,
          normalizeIngredientName,
        )
      ) {
        return null;
      }

      const rowKey = originalText.toLowerCase();
      if (seenRows.has(rowKey)) return null;
      seenRows.add(rowKey);
      return originalText;
    })
    .filter(Boolean);
}

export function getAcceptedImageVerifiedEvidenceRows({
  ingredients,
  missingIngredients,
  normalizeIngredientName = defaultNormalizeIngredientName,
}) {
  const recovered = Array.isArray(ingredients) ? ingredients : [];
  return getValidatedMissingIngredientCandidates(
    missingIngredients,
    normalizeIngredientName,
  )
    .filter(({ candidate }) =>
      recovered.some((ingredient) =>
        candidateExactlyMatchesIngredient(
          candidate,
          ingredient,
          normalizeIngredientName,
        ),
      ),
    )
    .map(({ row }) => row);
}

export function recoverImageVerifiedIngredients({
  ingredients,
  missingIngredients,
  normalizeIngredientName = defaultNormalizeIngredientName,
}) {
  const existing = Array.isArray(ingredients) ? ingredients : [];
  const missing = Array.isArray(missingIngredients) ? missingIngredients : [];
  if (!existing.length || !missing.length) return [...existing];

  const anchorRows = existing
    .map((ingredient) =>
      buildExistingIngredientAnchorRow(ingredient, normalizeIngredientName),
    )
    .filter(Boolean);
  const validatedMissingCandidates = getValidatedMissingIngredientCandidates(
    missing,
    normalizeIngredientName,
  );
  const missingRows = validatedMissingCandidates.map(({ row }) => row);
  if (!anchorRows.length || !missingRows.length) return [...existing];

  const recovered = recoverStructuredTableIngredients({
    ingredients: existing,
    tableRowGroups: [[...anchorRows, ...missingRows]],
    normalizeIngredientName,
  });

  const acceptedCandidates = validatedMissingCandidates
    .map(({ candidate }) => candidate)
    .filter((candidate) =>
      recovered.some((ingredient) =>
        candidateExactlyMatchesIngredient(
          candidate,
          ingredient,
          normalizeIngredientName,
        ),
      ),
    );
  if (!acceptedCandidates.length) return recovered;

  return recovered.filter((ingredient) => {
    if (
      acceptedCandidates.some((candidate) =>
        candidateExactlyMatchesIngredient(
          candidate,
          ingredient,
          normalizeIngredientName,
        ),
      )
    ) {
      return true;
    }

    return !acceptedCandidates.some((candidate) =>
      candidateConfusablyMatchesIngredient(
        candidate,
        ingredient,
        normalizeIngredientName,
      ),
    );
  });
}

function buildDoseSearchPatterns(rawValue, rawUnit, originalText) {
  const patterns = [];
  const normalizedUnit = normalizeUnit(rawUnit);
  const dosageValue =
    typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;

  if (originalText) {
    patterns.push(new RegExp(escapeRegExp(normalizeWhitespace(originalText)), "iu"));
  }
  if (dosageValue === null || !normalizedUnit) return patterns;

  const unitVariants = {
    mcg: ["mcg", "µg", "μg", "ug", "microgram", "micrograms"],
    mg: ["mg", "milligram", "milligrams"],
    g: ["g", "gram", "grams"],
    ml: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
    IU: ["iu", "i.u.", "international unit", "international units"],
    CFU: ["cfu", "colony forming unit", "colony forming units"],
  }[normalizedUnit] ?? [normalizedUnit];
  const valueText = escapeRegExp(String(dosageValue)).replace("\\.", "[.,]");
  unitVariants.forEach((unit) => {
    patterns.push(
      new RegExp(`\\b${valueText}\\s*${escapeRegExp(unit)}\\b`, "iu"),
    );
  });

  return patterns;
}

function doseMatchesText(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function ingredientAppears(value, ingredientIdentity, normalizeIngredientName) {
  const lineIdentity = getIngredientIdentity(value, normalizeIngredientName);
  if (!lineIdentity || !ingredientIdentity) return false;
  const paddedLineIdentity = ` ${lineIdentity} `;
  const paddedIngredientIdentity = ` ${ingredientIdentity} `;
  if (
    lineIdentity === ingredientIdentity ||
    paddedLineIdentity.includes(paddedIngredientIdentity) ||
    paddedIngredientIdentity.includes(paddedLineIdentity)
  ) {
    return true;
  }

  const words = ingredientIdentity.split(" ").filter(Boolean);
  const lineWords = new Set(lineIdentity.split(" ").filter(Boolean));
  return words.length > 1 && words.every((word) => lineWords.has(word));
}

function stripDoseAndReferenceText(value) {
  return normalizeWhitespace(value)
    .replace(createDoseTokenPattern(), " ")
    .replace(/\d+(?:[.,]\d+)?\s*%/gu, " ")
    .replace(/\b(?:dv|nrv|rda|ri|daily value|reference intake)\b/giu, " ")
    .replace(/[\s|()[\]{}:;,*†‡-]+/gu, "")
    .trim();
}

function isDoseOnlyContinuation(value, patterns) {
  return doseMatchesText(value, patterns) && !stripDoseAndReferenceText(value);
}

function isGenericContinuation(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized || parseDoseTokens(normalized).length) return false;
  return (
    normalized.startsWith("(") ||
    GENERIC_CONTINUATION_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

export function verifyDoseAgainstWrappedOcr({
  ingredientName,
  rawDosageValue,
  rawDosageUnit,
  dosageOriginalText,
  ocrText,
  normalizeIngredientName = defaultNormalizeIngredientName,
}) {
  if (typeof rawDosageValue !== "number" || !Number.isFinite(rawDosageValue)) {
    return { confidence: "missing", reason: null };
  }

  const normalizedUnit = normalizeUnit(rawDosageUnit);
  if (!normalizedUnit) {
    return { confidence: "unverified", reason: "No dose patterns to verify" };
  }

  const cleanedOcr = typeof ocrText === "string" ? ocrText.trim() : "";
  if (!cleanedOcr) {
    return {
      confidence: "unverified",
      reason: "No OCR text available for verification",
    };
  }

  const ingredientIdentity = getIngredientIdentity(
    ingredientName,
    normalizeIngredientName,
  );
  if (!ingredientIdentity) {
    return {
      confidence: "unverified",
      reason: "Could not normalize ingredient name",
    };
  }

  const patterns = buildDoseSearchPatterns(
    rawDosageValue,
    normalizedUnit,
    dosageOriginalText,
  );
  const lines = cleanedOcr
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (
      ingredientAppears(line, ingredientIdentity, normalizeIngredientName) &&
      doseMatchesText(line, patterns)
    ) {
      return { confidence: "verified", reason: null };
    }
  }

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    if (!ingredientAppears(line, ingredientIdentity, normalizeIngredientName)) {
      continue;
    }

    const nextLine = lines[index + 1];
    if (isDoseOnlyContinuation(nextLine, patterns)) {
      return { confidence: "verified", reason: null };
    }

    const followingLine = lines[index + 2];
    if (
      followingLine &&
      isGenericContinuation(nextLine) &&
      isDoseOnlyContinuation(followingLine, patterns)
    ) {
      return { confidence: "verified", reason: null };
    }
  }

  return {
    confidence: "unverified",
    reason: "Extracted dose could not be verified against OCR text",
  };
}
