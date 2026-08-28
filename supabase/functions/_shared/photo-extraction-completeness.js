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

export function selectPhotoExtractionStrategy({
  ocrReliable = false,
  hasStructuredTable = false,
} = {}) {
  const canUseOcrFirstPass = ocrReliable && hasStructuredTable;

  if (canUseOcrFirstPass) {
    return {
      name: "reliable_ocr_text_first",
      includeIngredientPanelImage: false,
      ingredientPanelImageDetail: "not_included",
      includeProductImage: true,
      productImageDetail: "low",
      visualFallbackRequired: false,
    };
  }

  return {
    name: "visual_fallback",
    includeIngredientPanelImage: true,
    ingredientPanelImageDetail: "high",
    includeProductImage: true,
    productImageDetail: "low",
    visualFallbackRequired: true,
  };
}

export function estimateTileBasedImageTokens({
  width,
  height,
  detail,
  model,
} = {}) {
  const normalizedModel = typeof model === "string"
    ? model.trim().toLowerCase()
    : "";
  let rates = null;
  if (normalizedModel.startsWith("gpt-4o-mini")) {
    rates = { base: 2_833, tile: 5_667 };
  } else if (
    !normalizedModel.startsWith("gpt-4.1-mini") &&
    !normalizedModel.startsWith("gpt-4.1-nano") &&
    (
      normalizedModel.startsWith("gpt-4o") ||
      normalizedModel.startsWith("gpt-4.1") ||
      normalizedModel.startsWith("gpt-4.5")
    )
  ) {
    rates = { base: 85, tile: 170 };
  }

  if (!rates) return undefined;
  if (detail === "low") return rates.base;
  if (
    detail !== "high" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  const fitScale = Math.min(1, 2_048 / Math.max(width, height));
  const fitWidth = width * fitScale;
  const fitHeight = height * fitScale;
  const shortestSideScale = Math.min(
    1,
    768 / Math.min(fitWidth, fitHeight),
  );
  const resizedWidth = Math.max(
    1,
    Math.floor(fitWidth * shortestSideScale),
  );
  const resizedHeight = Math.max(
    1,
    Math.floor(fitHeight * shortestSideScale),
  );
  const tileCount =
    Math.ceil(resizedWidth / 512) * Math.ceil(resizedHeight / 512);
  return rates.base + rates.tile * tileCount;
}

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
  if (
    [
      "mg ne",
      "milligram ne",
      "milligrams ne",
      "mg niacin equivalent",
      "mg niacin equivalents",
    ].includes(normalized)
  ) {
    return "mg";
  }
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

function normalizeComparableDose(dosageValue, dosageUnit) {
  const value = Number(dosageValue);
  const unit = normalizeUnit(dosageUnit);
  if (!Number.isFinite(value) || value < 0 || !unit) return null;

  const massFactorMicrograms = {
    g: 1_000_000,
    mg: 1_000,
    mcg: 1,
  }[unit];
  if (massFactorMicrograms) {
    return {
      family: "mass",
      value: value * massFactorMicrograms,
    };
  }

  return { family: unit, value };
}

function comparableDoseKey(dosageValue, dosageUnit) {
  const comparable = normalizeComparableDose(dosageValue, dosageUnit);
  if (!comparable) return "";
  const rounded = Math.round(comparable.value * 1e9) / 1e9;
  return `${comparable.family}|${rounded}`;
}

function dosesAreEquivalent(
  leftValue,
  leftUnit,
  rightValue,
  rightUnit,
) {
  const left = normalizeComparableDose(leftValue, leftUnit);
  const right = normalizeComparableDose(rightValue, rightUnit);
  if (!left || !right || left.family !== right.family) return false;

  const tolerance = Math.max(
    1e-9,
    Math.max(Math.abs(left.value), Math.abs(right.value)) * 1e-9,
  );
  return Math.abs(left.value - right.value) <= tolerance;
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

function analyzeStructuredTableIngredientRow(row) {
  const rawRow = typeof row === "string" ? row.trim() : "";
  if (!rawRow) return null;

  const columns = rawRow.split("\t").map(normalizeWhitespace);
  const doseTokens = columns.flatMap((column, columnIndex) =>
    parseDoseTokens(column).map((token) => ({ ...token, columnIndex })),
  );
  const uniqueDoses = new Map();
  doseTokens.forEach((token) => {
    uniqueDoses.set(
      comparableDoseKey(token.dosageValue, token.dosageUnit),
      token,
    );
  });

  const dose = doseTokens[0];
  if (!dose || !uniqueDoses.size) return null;

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
    ingredientName,
    rawText: columns.filter(Boolean).join(" "),
    uniqueDoses: Array.from(uniqueDoses.values()),
  };
}

export function parseStructuredTableIngredientRow(row) {
  const analysis = analyzeStructuredTableIngredientRow(row);
  if (!analysis || analysis.uniqueDoses.length !== 1) return null;

  const dose = analysis.uniqueDoses[0];
  return {
    raw_name: analysis.ingredientName,
    canonical_name: analysis.ingredientName,
    ingredient_type: "active",
    dosage_value: dose.dosageValue,
    dosage_unit: dose.dosageUnit,
    dosage_original_text: analysis.rawText,
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

export function buildOcrLineIngredientCandidateGroups(lines) {
  const normalizedLines = (Array.isArray(lines) ? lines : [])
    .map((line, index) => {
      const source = line && typeof line === "object" ? line : {};
      const text = normalizeWhitespace(
        typeof line === "string" ? line : source.text ?? source.content,
      );
      if (!text) return null;
      const candidateId = normalizeWhitespace(source.candidateId) ||
        `legacy-line:${index}`;
      const geometryCandidateIds = Array.from(
        new Set(
          (Array.isArray(source.geometryCandidateIds)
            ? source.geometryCandidateIds
            : [candidateId])
            .map(normalizeWhitespace)
            .filter(Boolean),
        ),
      );
      return {
        text,
        candidateId,
        geometryCandidateIds,
        geometryRegions: Array.isArray(source.geometryRegions)
          ? source.geometryRegions
          : [],
        hasGeometry: source.hasGeometry === true,
        sourceRefs: Array.isArray(source.sourceRefs) ? source.sourceRefs : [],
      };
    })
    .filter(Boolean);
  const normalizedLineText = normalizedLines.map(({ text }) => text);
  const logicalRows = [];

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const logicalRow = buildWrappedOcrRow(normalizedLineText, index);
    if (!logicalRow) continue;
    const sources = normalizedLines.slice(index, logicalRow.endIndex + 1);
    const geometryCandidateIds = Array.from(
      new Set(sources.flatMap((source) => source.geometryCandidateIds)),
    );
    const geometryRegions = sources.flatMap((source) => source.geometryRegions);
    const sourceRefs = sources.flatMap((source) => source.sourceRefs);
    const mergedFromWrappedLines = logicalRow.endIndex > index;
    logicalRows.push({
      candidateId: mergedFromWrappedLines
        ? `wrapped:${sources[0].candidateId}:${sources.at(-1).candidateId}`
        : sources[0].candidateId,
      text: logicalRow.row,
      sourceKind: "ocr_line",
      geometryCandidateIds,
      geometryRegions,
      hasGeometry:
        geometryCandidateIds.length > 0 &&
        sources.every((source) => source.hasGeometry === true),
      mergedFromWrappedLines,
      sourceRefs,
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

  return groups;
}

export function buildOcrLineIngredientRowGroups(lines) {
  return buildOcrLineIngredientCandidateGroups(lines).map((group) =>
    group.map((entry) => entry.text)
  );
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

function findMatchingIngredientIndexes(
  ingredients,
  candidate,
  normalizeIngredientName,
) {
  const candidateKeys = getIngredientKeys(candidate, normalizeIngredientName);
  if (!candidateKeys.size) return [];

  return ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(({ ingredient }) => {
      const ingredientKeys = getIngredientKeys(
        ingredient,
        normalizeIngredientName,
      );
      return Array.from(candidateKeys).some((key) => ingredientKeys.has(key));
    })
    .map(({ index }) => index);
}

function hasUsableDose(ingredient) {
  return (
    typeof ingredient?.dosage_value === "number" &&
    Number.isFinite(ingredient.dosage_value) &&
    Boolean(normalizeWhitespace(ingredient?.dosage_unit))
  );
}

function candidateDoseMatchesIngredient(candidate, ingredient) {
  return (
    hasUsableDose(ingredient) &&
    dosesAreEquivalent(
      ingredient.dosage_value,
      ingredient.dosage_unit,
      candidate.dosage_value,
      candidate.dosage_unit,
    )
  );
}

export function recoverStructuredTableIngredients({
  ingredients,
  tableRowGroups,
  normalizeIngredientName = defaultNormalizeIngredientName,
  allowNewIngredients = false,
  allowDoseRecovery = true,
}) {
  const recovered = Array.isArray(ingredients) ? [...ingredients] : [];
  const groups = Array.isArray(tableRowGroups) ? tableRowGroups : [];

  groups.forEach((rows) => {
    const candidates = (Array.isArray(rows) ? rows : [])
      .map(parseStructuredTableIngredientRow)
      .filter(Boolean);
    if (!candidates.length) return;

    const strictIdentitiesByBroadIdentity = new Map();
    candidates.forEach((candidate) => {
      const broadIdentity = getIngredientIdentity(
        candidate.canonical_name,
        normalizeIngredientName,
      );
      const strictIdentity = getIngredientIdentity(
        candidate.canonical_name,
        defaultNormalizeIngredientName,
      );
      if (!broadIdentity || !strictIdentity) return;
      const strictIdentities = strictIdentitiesByBroadIdentity.get(
        broadIdentity,
      ) ?? new Set();
      strictIdentities.add(strictIdentity);
      strictIdentitiesByBroadIdentity.set(broadIdentity, strictIdentities);
    });
    const candidateDescriptors = candidates.map((candidate) => {
      const broadIdentity = getIngredientIdentity(
        candidate.canonical_name,
        normalizeIngredientName,
      );
      const strictIdentity = getIngredientIdentity(
        candidate.canonical_name,
        defaultNormalizeIngredientName,
      );
      const requiresStrictIdentity =
        (strictIdentitiesByBroadIdentity.get(broadIdentity)?.size ?? 0) > 1;
      return {
        candidate,
        identity: broadIdentity && strictIdentity
          ? requiresStrictIdentity
            ? `strict:${strictIdentity}`
            : `broad:${broadIdentity}`
          : "",
        matchingNormalizer: requiresStrictIdentity
          ? defaultNormalizeIngredientName
          : normalizeIngredientName,
      };
    });

    const candidatesByIdentity = new Map();
    const conflictedIdentities = new Set();
    candidateDescriptors.forEach((descriptor) => {
      const { candidate, identity } = descriptor;
      if (!identity || conflictedIdentities.has(identity)) return;

      const existing = candidatesByIdentity.get(identity);
      if (
        existing &&
        !dosesAreEquivalent(
          existing.candidate.dosage_value,
          existing.candidate.dosage_unit,
          candidate.dosage_value,
          candidate.dosage_unit,
        )
      ) {
        candidatesByIdentity.delete(identity);
        conflictedIdentities.add(identity);
        return;
      }
      if (!existing) candidatesByIdentity.set(identity, descriptor);
    });

    const safeCandidates = Array.from(candidatesByIdentity.values());
    const matchedCandidateCount = safeCandidates.filter((descriptor) => {
      const { candidate, matchingNormalizer } = descriptor;
      const existingIndex = findMatchingIngredientIndex(
        recovered,
        candidate,
        matchingNormalizer,
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

    safeCandidates.forEach((descriptor) => {
      const { candidate, matchingNormalizer } = descriptor;
      const existingIndex = findMatchingIngredientIndex(
        recovered,
        candidate,
        matchingNormalizer,
      );
      if (existingIndex < 0) {
        if (allowNewIngredients) recovered.push(candidate);
        return;
      }

      const existing = recovered[existingIndex];
      if (!allowDoseRecovery || hasUsableDose(existing)) return;
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

function normalizeVerificationReason(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 48);
}

export function assessDoseVerificationRequirement({
  ingredients,
  ocrText,
  tableRowGroups,
  ocrCandidateGroups,
  modelPanelComplete,
  modelVerificationRequired,
  modelVerificationReason,
  recoveredOcrRowCount = 0,
  modelExtractedRowCount,
  ocrReliable,
  normalizeIngredientName = defaultNormalizeIngredientName,
}) {
  const rows = Array.isArray(ingredients) ? ingredients : [];
  const activeIndexes = rows
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(({ ingredient }) => ingredient?.ingredient_type !== "inactive")
    .map(({ index }) => index);
  const allIngredientIndexSet = new Set(rows.map((_, index) => index));
  const inactiveReviewIndexes = new Set();
  const normalizedModelExtractedRowCount = Number.isInteger(modelExtractedRowCount)
    ? Math.max(0, modelExtractedRowCount)
    : rows.length;
  const modelQuestionableIndexes = activeIndexes.filter((index) => {
    const confidence = rows[index]?.dose_confidence;
    return confidence && confidence !== "verified";
  });
  const reasonsByName = new Map();

  const addReason = (reason, indexes, scope = "row_scoped") => {
    const normalizedReason = normalizeVerificationReason(reason);
    if (!normalizedReason) return;

    const validIndexes = scope === "global"
      ? activeIndexes
      : Array.from(new Set(Array.isArray(indexes) ? indexes : []))
        .filter((index) => allIngredientIndexSet.has(index));
    if (scope !== "global" && !validIndexes.length) return;

    const existing = reasonsByName.get(normalizedReason);
    const nextScope = existing?.scope === "global" || scope === "global"
      ? "global"
      : "row_scoped";
    const rowIndexes = new Set(existing?.rowIndexes ?? []);
    if (nextScope === "global") {
      rowIndexes.clear();
      activeIndexes.forEach((index) => rowIndexes.add(index));
    } else {
      validIndexes.forEach((index) => rowIndexes.add(index));
    }
    reasonsByName.set(normalizedReason, {
      reason: normalizedReason,
      scope: nextScope,
      rowIndexes,
      triggerCount: (existing?.triggerCount ?? 0) + 1,
    });
  };

  const addGlobalReason = (reason) => addReason(reason, activeIndexes, "global");

  if (!rows.length) {
    return {
      required: false,
      reason: "no_active_ingredients",
      reasons: [],
      reasonDetails: [],
      questionableRowIndexes: [],
      questionableRowCount: 0,
      rowIndexes: [],
      rowCount: 0,
      extractedRowCount: rows.length,
      activeExtractedRowCount: 0,
      ocrCandidateRowCount: 0,
      recoveredOcrRowCount: 0,
      unmatchedOcrCandidateRowCount: 0,
      unmatchedOcrCandidateRows: [],
      unmatchedOcrCandidateIdGroups: [],
      questionableOcrRows: [],
      questionableOcrRowGroups: [],
      questionableOcrCandidateIdGroups: [],
      questionableOcrMappedRowCount: 0,
      totalOcrCandidateCount: 0,
      ocrCandidateWithGeometryCount: 0,
      activeRowWithOcrCandidateIdCount: 0,
      inactiveReviewRowIndexes: [],
      inactiveReviewRowCount: 0,
      ocrRowLifecycle: [],
      unmatchedOcrCandidateWithGeometryCount: 0,
      questionableOcrRowWithGeometryCount: 0,
      ambiguousOcrCandidateAssociationCount: 0,
      mappingProvenanceDirectCount: 0,
      mappingProvenanceRecoveredCount: 0,
      mappingProvenanceWrappedRowMergeCount: 0,
      mappingProvenanceDeterministicEquivalentCount: 0,
      incompletenessStateBeforeRecovery:
        modelPanelComplete === true ? "not_applicable" : "unresolved",
      incompletenessStateAfterRecovery:
        modelPanelComplete === true ? "not_applicable" : "still_global",
      incompletePanelGlobalReasonAdded: modelPanelComplete !== true,
      incompletePanelEscalationReason:
        modelPanelComplete === true ? "not_applicable" : "no_active_ingredients",
      modelIncompleteGlobalReasonDisposition:
        modelPanelComplete === true ? "not_present" : "retained_global",
      selectionScope: "none",
      selectionExpanded: false,
      selectionExpansionReason: "none",
    };
  }

  const cleanedOcr = typeof ocrText === "string" ? ocrText.trim() : "";
  if (!cleanedOcr) {
    addGlobalReason("ocr_unavailable");
  } else if (ocrReliable !== true) {
    addGlobalReason("ocr_confidence_insufficient");
  }

  const suppliedCandidateGroups = Array.isArray(ocrCandidateGroups)
    ? ocrCandidateGroups
    : [];
  const hasStableCandidates = suppliedCandidateGroups.some((group) =>
    Array.isArray(group) && group.length > 0
  );
  const candidateRecords = (hasStableCandidates
    ? suppliedCandidateGroups
    : (Array.isArray(tableRowGroups) ? tableRowGroups : []).map(
      (group, groupIndex) =>
        (Array.isArray(group) ? group : []).map((text, rowIndex) => ({
          candidateId: `legacy:${groupIndex}:${rowIndex}`,
          text,
          sourceKind: "legacy",
          geometryCandidateIds: [],
          hasGeometry: false,
          mergedFromWrappedLines: false,
        })),
    ))
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .map((candidate, index) => {
      const row = candidate && typeof candidate === "object" ? candidate : {};
      const text = normalizeWhitespace(
        typeof candidate === "string" ? candidate : row.text,
      );
      const candidateId = normalizeWhitespace(row.candidateId) ||
        `legacy-candidate:${index}`;
      return {
        candidateId,
        text,
        sourceKind: normalizeWhitespace(row.sourceKind) || "legacy",
        geometryCandidateIds: Array.from(
          new Set(
            (Array.isArray(row.geometryCandidateIds)
              ? row.geometryCandidateIds
              : [])
              .map(normalizeWhitespace)
              .filter(Boolean),
          ),
        ),
        geometryRegions: Array.isArray(row.geometryRegions)
          ? row.geometryRegions
          : [],
        hasGeometry: row.hasGeometry === true,
        mergedFromWrappedLines: row.mergedFromWrappedLines === true,
        sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs : [],
      };
    })
    .filter(({ text }) => Boolean(text));
  const uniqueCandidateRecords = Array.from(
    new Map(
      candidateRecords.map((candidate) => [candidate.candidateId, candidate]),
    ).values(),
  );
  const rawStructuredAnalyses = uniqueCandidateRecords
    .map((candidate) => ({
      ...candidate,
      row: candidate.text,
      analysis: analyzeStructuredTableIngredientRow(candidate.text),
    }))
    .filter(({ analysis }) => Boolean(analysis));
  const strictCandidateIdentitiesByBroadIdentity = new Map();
  rawStructuredAnalyses.forEach((entry) => {
    const broadIdentity = getIngredientIdentity(
      entry.analysis.ingredientName,
      normalizeIngredientName,
    );
    const strictIdentity = getIngredientIdentity(
      entry.analysis.ingredientName,
      defaultNormalizeIngredientName,
    );
    if (!broadIdentity || !strictIdentity) return;
    const strictIdentities = strictCandidateIdentitiesByBroadIdentity.get(
      broadIdentity,
    ) ?? new Set();
    strictIdentities.add(strictIdentity);
    strictCandidateIdentitiesByBroadIdentity.set(
      broadIdentity,
      strictIdentities,
    );
  });
  const getCandidateMatchingNormalizer = (candidate) => {
    const broadIdentity = getIngredientIdentity(
      candidate.analysis.ingredientName,
      normalizeIngredientName,
    );
    return (strictCandidateIdentitiesByBroadIdentity.get(broadIdentity)?.size ?? 0) >
        1
      ? defaultNormalizeIngredientName
      : normalizeIngredientName;
  };
  const ocrRowLifecycleById = new Map(
    rawStructuredAnalyses.map((candidate) => [
      candidate.candidateId,
      {
        rowId: candidate.candidateId,
        sourceType: candidate.sourceKind === "table_row"
          ? "azure_table"
          : candidate.sourceKind === "ocr_line"
            ? "azure_line"
            : "legacy_ocr",
        disposition: "candidate_retained",
        hasGeometry: candidate.hasGeometry === true,
        reasonCategory: candidate.analysis.uniqueDoses.length > 1
          ? "multiple_quantities"
          : "single_quantity",
      },
    ]),
  );
  const updateOcrRowLifecycle = (
    candidate,
    disposition,
    ingredientIndex,
  ) => {
    const existing = ocrRowLifecycleById.get(candidate?.candidateId);
    if (!existing) return;
    ocrRowLifecycleById.set(candidate.candidateId, {
      ...existing,
      disposition,
      relatedRowId: Number.isInteger(ingredientIndex)
        ? ingredientIndex < normalizedModelExtractedRowCount
          ? `model:${ingredientIndex}`
          : `recovered:${ingredientIndex - normalizedModelExtractedRowCount}`
        : undefined,
    });
  };
  const semanticCandidateGroups = new Map();
  rawStructuredAnalyses.forEach((entry) => {
    const broadIdentity = getIngredientIdentity(
      entry.analysis.ingredientName,
      normalizeIngredientName,
    );
    const strictIdentity = getIngredientIdentity(
      entry.analysis.ingredientName,
      defaultNormalizeIngredientName,
    );
    const identity =
      (strictCandidateIdentitiesByBroadIdentity.get(broadIdentity)?.size ?? 0) > 1
        ? strictIdentity
        : broadIdentity;
    const doses = entry.analysis.uniqueDoses
      .map((dose) => comparableDoseKey(dose.dosageValue, dose.dosageUnit))
      .sort()
      .join(",");
    const semanticKey = `${identity}|${doses}`;
    const existing = semanticCandidateGroups.get(semanticKey) ?? [];
    existing.push(entry);
    semanticCandidateGroups.set(semanticKey, existing);
  });
  const structuredAnalyses = [];
  let ambiguousOcrCandidateAssociationCount = 0;
  semanticCandidateGroups.forEach((entries) => {
    const tableEntries = entries.filter(
      (entry) => entry.sourceKind === "table_row",
    );
    let selected = null;
    if (tableEntries.length === 1) {
      selected = tableEntries[0].hasGeometry
        ? tableEntries[0]
        : entries.find((entry) => entry.hasGeometry) ?? tableEntries[0];
    } else if (tableEntries.length > 1) {
      ambiguousOcrCandidateAssociationCount += 1;
      entries.forEach((entry) =>
        updateOcrRowLifecycle(entry, "ambiguous_candidate")
      );
      return;
    } else if (entries.every((entry) => entry.sourceKind === "legacy")) {
      selected = entries.at(-1);
    } else if (entries.length === 1) {
      selected = entries[0];
    } else {
      ambiguousOcrCandidateAssociationCount += 1;
      entries.forEach((entry) =>
        updateOcrRowLifecycle(entry, "ambiguous_candidate")
      );
      return;
    }
    entries
      .filter((entry) => entry.candidateId !== selected.candidateId)
      .forEach((entry) =>
        updateOcrRowLifecycle(entry, "merged_duplicate")
      );
    structuredAnalyses.push(selected);
  });
  const totalOcrCandidateCount = semanticCandidateGroups.size;
  const ocrCandidateWithGeometryCount = Array.from(
    semanticCandidateGroups.values(),
  ).filter((entries) => entries.some((entry) => entry.hasGeometry)).length;
  const multipleQuantityIndexes = new Set();
  const ocrDoseMismatchIndexes = new Set();
  const doseNotVerifiedIndexes = new Set();
  const ocrCandidatesByIngredientIndex = new Map();
  const unmatchedOcrCandidateRows = [];
  const unmatchedOcrCandidateIdGroups = [];
  const unmatchedOcrCandidates = [];
  let unmatchedOcrCandidateRowCount = 0;

  const associateOcrCandidateWithIngredient = (ingredientIndex, candidate) => {
    const existingCandidates =
      ocrCandidatesByIngredientIndex.get(ingredientIndex) ?? [];
    if (
      !existingCandidates.some(
        (existing) => existing.candidateId === candidate.candidateId,
      )
    ) {
      existingCandidates.push(candidate);
    }
    ocrCandidatesByIngredientIndex.set(ingredientIndex, existingCandidates);
    updateOcrRowLifecycle(
      candidate,
      ingredientIndex >= normalizedModelExtractedRowCount
        ? "recovered"
        : "matched_model",
      ingredientIndex,
    );
    if (rows[ingredientIndex]?.ingredient_type === "inactive") {
      inactiveReviewIndexes.add(ingredientIndex);
      addReason("inactive_structured_ocr_candidate", [ingredientIndex]);
    }
  };

  if (ambiguousOcrCandidateAssociationCount > 0) {
    addGlobalReason("ambiguous_ocr_candidate_association");
  }

  if (!structuredAnalyses.length) {
    addGlobalReason("structured_ocr_unavailable");
  } else {
    structuredAnalyses.forEach((structuredCandidate) => {
      const { row, analysis } = structuredCandidate;
      const candidateMatchingNormalizer = getCandidateMatchingNormalizer(
        structuredCandidate,
      );
      const matchingIngredientIndexes = findMatchingIngredientIndexes(
        rows,
        {
          raw_name: analysis.ingredientName,
          canonical_name: analysis.ingredientName,
        },
        candidateMatchingNormalizer,
      );
      if (matchingIngredientIndexes.length > 1) {
        ambiguousOcrCandidateAssociationCount += 1;
        updateOcrRowLifecycle(
          structuredCandidate,
          "ambiguous_candidate",
        );
        addGlobalReason("ambiguous_ocr_candidate_association");
        return;
      }
      if (analysis.uniqueDoses.length > 1) {
        const ingredientIndex = matchingIngredientIndexes[0] ?? -1;
        if (ingredientIndex < 0) {
          unmatchedOcrCandidateRowCount += 1;
          unmatchedOcrCandidateRows.push(row);
          unmatchedOcrCandidateIdGroups.push(
            structuredCandidate.geometryCandidateIds,
          );
          unmatchedOcrCandidates.push(structuredCandidate);
          updateOcrRowLifecycle(structuredCandidate, "unmatched_ocr");
          addGlobalReason("multiple_quantities");
        } else {
          associateOcrCandidateWithIngredient(
            ingredientIndex,
            structuredCandidate,
          );
          multipleQuantityIndexes.add(ingredientIndex);
          addReason("multiple_quantities", [ingredientIndex]);
        }
        return;
      }

      const candidate = parseStructuredTableIngredientRow(row);
      if (!candidate) return;
      const ingredientIndex = matchingIngredientIndexes[0] ?? -1;
      if (ingredientIndex < 0) {
        unmatchedOcrCandidateRowCount += 1;
        unmatchedOcrCandidateRows.push(row);
        unmatchedOcrCandidateIdGroups.push(
          structuredCandidate.geometryCandidateIds,
        );
        unmatchedOcrCandidates.push(structuredCandidate);
        updateOcrRowLifecycle(structuredCandidate, "unmatched_ocr");
        addGlobalReason("possible_omitted_row");
        return;
      }
      associateOcrCandidateWithIngredient(ingredientIndex, structuredCandidate);
      if (!candidateDoseMatchesIngredient(candidate, rows[ingredientIndex])) {
        ocrDoseMismatchIndexes.add(ingredientIndex);
        addReason("ocr_dose_mismatch", [ingredientIndex]);
      }
    });
  }

  activeIndexes.forEach((index) => {
    const ingredient = rows[index];
    if (ingredient?.ingredient_type === "uncertain") {
      addReason("uncertain_ingredient", [index]);
    }
    if (!hasUsableDose(ingredient)) {
      addReason("missing_dose", [index]);
      return;
    }
    if (
      ingredient?.dose_confidence &&
      ingredient.dose_confidence !== "verified"
    ) {
      addReason(`model_${ingredient.dose_confidence}_dose`, [index]);
    }

    const doseVerification = verifyDoseAgainstWrappedOcr({
      ingredientName:
        ingredient?.canonical_name || ingredient?.raw_name || ingredient?.name,
      rawDosageValue: ingredient?.dosage_value,
      rawDosageUnit: ingredient?.dosage_unit,
      dosageOriginalText: ingredient?.dosage_original_text,
      ocrText: cleanedOcr,
      normalizeIngredientName,
    });
    if (doseVerification.confidence !== "verified") {
      doseNotVerifiedIndexes.add(index);
      addReason("dose_not_verified_against_ocr", [index]);
    }
  });

  const normalizedRecoveredOcrRowCount = Number.isFinite(recoveredOcrRowCount)
    ? Math.max(0, Math.floor(recoveredOcrRowCount))
    : 0;
  const modelReportedIncompletePanel = modelPanelComplete !== true;
  const modelIncompleteResolvedByOcrRecovery =
    modelReportedIncompletePanel &&
    ocrReliable === true &&
    structuredAnalyses.length > 0 &&
    normalizedRecoveredOcrRowCount > 0 &&
    unmatchedOcrCandidateRowCount === 0 &&
    activeIndexes.length >= structuredAnalyses.length;
  let incompletePanelEscalationReason = "not_applicable";

  if (modelReportedIncompletePanel && !modelIncompleteResolvedByOcrRecovery) {
    if (ocrReliable !== true) {
      incompletePanelEscalationReason = "ocr_not_reliable";
    } else if (!structuredAnalyses.length) {
      incompletePanelEscalationReason = "structured_ocr_unavailable";
    } else if (!normalizedRecoveredOcrRowCount) {
      incompletePanelEscalationReason = "no_rows_recovered";
    } else if (unmatchedOcrCandidateRowCount > 0) {
      incompletePanelEscalationReason = "unmatched_ocr_candidates";
    } else {
      incompletePanelEscalationReason = "ocr_candidate_coverage_incomplete";
    }
  }

  if (modelReportedIncompletePanel && !modelIncompleteResolvedByOcrRecovery) {
    addGlobalReason("model_incomplete_panel");
  }
  if (modelVerificationRequired !== false) {
    const normalizedModelReason = normalizeVerificationReason(
      modelVerificationReason,
    );
    const reason =
      normalizedModelReason && normalizedModelReason !== "none"
        ? normalizedModelReason
        : "model_requested_verification";
    const modelReasonWasResolvedByOcrRecovery =
      modelIncompleteResolvedByOcrRecovery &&
      [
        "incomplete_panel",
        "possible_omitted_row",
        "possible_omitted_rows",
      ].includes(reason);
    let targetIndexes = [];

    if (["ambiguous_dose", "missing_dose"].includes(reason)) {
      targetIndexes = modelQuestionableIndexes;
    } else if (reason === "multiple_quantities") {
      targetIndexes = Array.from(multipleQuantityIndexes);
      if (!targetIndexes.length) targetIndexes = modelQuestionableIndexes;
    } else if (reason === "ocr_conflict") {
      targetIndexes = Array.from(
        new Set([
          ...ocrDoseMismatchIndexes,
          ...doseNotVerifiedIndexes,
          ...modelQuestionableIndexes,
        ]),
      );
    }

    if (!modelReasonWasResolvedByOcrRecovery) {
      if (targetIndexes.length) {
        addReason(reason, targetIndexes);
      } else {
        addGlobalReason(reason);
      }
    }
  }

  const disagreementIndexes = new Set([
    ...ocrDoseMismatchIndexes,
    ...doseNotVerifiedIndexes,
  ]);
  const widespreadDisagreementThreshold = Math.max(
    3,
    Math.ceil(activeIndexes.length / 2),
  );
  if (disagreementIndexes.size >= widespreadDisagreementThreshold) {
    addGlobalReason("widespread_ocr_extraction_disagreement");
  }

  const reasonDetails = Array.from(reasonsByName.values()).map((detail) => ({
    reason: detail.reason,
    scope: detail.scope,
    count: detail.rowIndexes.size,
    triggerCount: detail.triggerCount,
  }));
  const globalReasons = reasonDetails
    .filter((detail) => detail.scope === "global")
    .map((detail) => detail.reason);
  const rowScopedIndexes = new Set();
  reasonsByName.forEach((detail) => {
    if (detail.scope !== "row_scoped") return;
    detail.rowIndexes.forEach((index) => rowScopedIndexes.add(index));
  });
  const selectionExpanded =
    globalReasons.length > 0 &&
    rowScopedIndexes.size < activeIndexes.length + inactiveReviewIndexes.size;
  const questionableRowIndexes = Array.from(rowScopedIndexes).sort(
    (left, right) => left - right,
  );
  const questionableOcrRows = Array.from(
    new Set(
      questionableRowIndexes.flatMap(
        (index) =>
          (ocrCandidatesByIngredientIndex.get(index) ?? []).map(
            (candidate) => candidate.row,
          ),
      ),
    ),
  );
  const questionableOcrRowGroups = questionableRowIndexes.map(
    (index) =>
      (ocrCandidatesByIngredientIndex.get(index) ?? []).map(
        (candidate) => candidate.row,
      ),
  );
  const questionableOcrCandidateIdGroups = questionableRowIndexes.map(
    (index) =>
      Array.from(
        new Set(
          (ocrCandidatesByIngredientIndex.get(index) ?? []).flatMap(
            (candidate) => candidate.geometryCandidateIds,
          ),
        ),
      ),
  );
  const questionableOcrMappedRowCount = questionableRowIndexes.filter(
    (index) => (ocrCandidatesByIngredientIndex.get(index) ?? []).length > 0,
  ).length;
  const activeRowWithOcrCandidateIdCount = activeIndexes.filter(
    (index) => (ocrCandidatesByIngredientIndex.get(index) ?? []).length > 0,
  ).length;
  const questionableOcrRowWithGeometryCount = questionableRowIndexes.filter(
    (index) =>
      (ocrCandidatesByIngredientIndex.get(index) ?? []).some(
        (candidate) => candidate.hasGeometry,
      ),
  ).length;
  const unmatchedOcrCandidateWithGeometryCount = unmatchedOcrCandidates.filter(
    (candidate) => candidate.hasGeometry,
  ).length;
  const mappedCandidates = Array.from(ocrCandidatesByIngredientIndex.entries())
    .flatMap(([ingredientIndex, candidates]) =>
      candidates.map((candidate) => ({ ingredientIndex, candidate }))
    );
  const mappingProvenanceDirectCount = mappedCandidates.filter(
    ({ candidate }) =>
      candidate.sourceKind === "table_row" &&
      candidate.mergedFromWrappedLines !== true,
  ).length;
  const mappingProvenanceRecoveredCount = mappedCandidates.filter(
    ({ ingredientIndex }) => ingredientIndex >= normalizedModelExtractedRowCount,
  ).length;
  const mappingProvenanceWrappedRowMergeCount = mappedCandidates.filter(
    ({ candidate }) => candidate.mergedFromWrappedLines === true,
  ).length;
  const mappingProvenanceDeterministicEquivalentCount = mappedCandidates.filter(
    ({ ingredientIndex, candidate }) => {
      if (candidate.analysis.uniqueDoses.length !== 1) return false;
      const dose = candidate.analysis.uniqueDoses[0];
      const ingredient = rows[ingredientIndex];
      return (
        candidateDoseMatchesIngredient(
          {
            dosage_value: dose.dosageValue,
            dosage_unit: dose.dosageUnit,
          },
          ingredient,
        ) &&
        (Number(ingredient?.dosage_value) !== Number(dose.dosageValue) ||
          normalizeUnit(ingredient?.dosage_unit) !==
            normalizeUnit(dose.dosageUnit))
      );
    },
  ).length;
  const selectedIndexes = globalReasons.length
    ? Array.from(new Set([...activeIndexes, ...inactiveReviewIndexes])).sort(
      (left, right) => left - right,
    )
    : questionableRowIndexes;
  const reasons = reasonDetails.map((detail) => detail.reason);

  return {
    required: reasons.length > 0,
    reason: reasons.length ? reasons.join("+") : "high_confidence_complete",
    reasons,
    reasonDetails,
    questionableRowIndexes,
    questionableRowCount: questionableRowIndexes.length,
    rowIndexes: selectedIndexes,
    rowCount: selectedIndexes.length,
    extractedRowCount: rows.length,
    activeExtractedRowCount: activeIndexes.length,
    ocrCandidateRowCount: totalOcrCandidateCount,
    totalOcrCandidateCount,
    ocrCandidateWithGeometryCount,
    activeRowWithOcrCandidateIdCount,
    inactiveReviewRowIndexes: Array.from(inactiveReviewIndexes).sort(
      (left, right) => left - right,
    ),
    inactiveReviewRowCount: inactiveReviewIndexes.size,
    ocrRowLifecycle: Array.from(ocrRowLifecycleById.values()),
    recoveredOcrRowCount: normalizedRecoveredOcrRowCount,
    unmatchedOcrCandidateRowCount,
    unmatchedOcrCandidateRows,
    unmatchedOcrCandidateIdGroups,
    unmatchedOcrCandidateWithGeometryCount,
    questionableOcrRows,
    questionableOcrRowGroups,
    questionableOcrCandidateIdGroups,
    questionableOcrMappedRowCount,
    questionableOcrRowWithGeometryCount,
    ambiguousOcrCandidateAssociationCount,
    mappingProvenanceDirectCount,
    mappingProvenanceRecoveredCount,
    mappingProvenanceWrappedRowMergeCount,
    mappingProvenanceDeterministicEquivalentCount,
    incompletenessStateBeforeRecovery:
      modelReportedIncompletePanel ? "unresolved" : "not_applicable",
    incompletenessStateAfterRecovery: modelReportedIncompletePanel
      ? modelIncompleteResolvedByOcrRecovery
        ? "resolved_by_ocr_recovery"
        : "still_global"
      : "not_applicable",
    incompletePanelGlobalReasonAdded:
      modelReportedIncompletePanel && !modelIncompleteResolvedByOcrRecovery,
    incompletePanelEscalationReason,
    modelIncompleteGlobalReasonDisposition: modelReportedIncompletePanel
      ? modelIncompleteResolvedByOcrRecovery
        ? "cleared_after_ocr_recovery"
        : "retained_global"
      : "not_present",
    selectionScope: globalReasons.length
      ? "global"
      : selectedIndexes.length
        ? "row_scoped"
        : "none",
    selectionExpanded,
    selectionExpansionReason: globalReasons.length
      ? globalReasons.join("+")
      : "none",
  };
}

export async function executeConditionalDoseVerification({ plan, verify }) {
  if (!plan?.required) {
    return { ran: false, result: null };
  }

  return {
    ran: true,
    result: await verify(plan.rowIndexes),
  };
}

export function assessVerificationPersistenceGate({
  verificationRan,
  scopeResolved,
}) {
  if (verificationRan !== true) {
    return { allowed: true, reason: "verification_not_required" };
  }
  if (scopeResolved === true) {
    return { allowed: true, reason: "verification_scope_resolved" };
  }
  return { allowed: false, reason: "verification_scope_unresolved" };
}

export function summarizeIngredientRowLifecycle({
  modelInputRowCount,
  ocrRows,
  finalRows,
  persistenceInputRowCount,
  persistenceActiveRowCount,
  ocrLogicalCandidateCount,
  unmatchedOcrCandidateRowCount,
}) {
  const safeOcrRows = Array.isArray(ocrRows) ? ocrRows : [];
  const safeFinalRows = Array.isArray(finalRows) ? finalRows : [];
  const countFinalDisposition = (value) =>
    safeFinalRows.filter((row) => row?.disposition === value).length;
  const countOcrDisposition = (value) =>
    safeOcrRows.filter((row) => row?.disposition === value).length;
  const normalizedModelInputRowCount = Number.isInteger(modelInputRowCount)
    ? Math.max(0, modelInputRowCount)
    : 0;
  const normalizedPersistenceInputRowCount = Number.isInteger(
      persistenceInputRowCount,
    )
    ? Math.max(0, persistenceInputRowCount)
    : 0;
  const normalizedPersistenceActiveRowCount = Number.isInteger(
      persistenceActiveRowCount,
    )
    ? Math.max(0, persistenceActiveRowCount)
    : 0;
  const normalizedUnmatchedOcrCandidateRowCount = Number.isInteger(
      unmatchedOcrCandidateRowCount,
    )
    ? Math.max(0, unmatchedOcrCandidateRowCount)
    : 0;
  const modelLifecycleRowCount = safeFinalRows.filter(
    (row) => row?.sourceType === "model_extraction",
  ).length;
  const retainedRowCount = countFinalDisposition("retained");
  const recoveredRetainedRowCount = countFinalDisposition("recovered");
  const filteredInactiveRowCount = countFinalDisposition("filtered_inactive");
  const filteredUncertainRowCount = countFinalDisposition("filtered_uncertain");
  const mergedDuplicateRowCount = countFinalDisposition("merged_duplicate");
  const rejectedRowCount = safeFinalRows.filter((row) =>
    String(row?.disposition || "").startsWith("rejected_")
  ).length;
  const verifierPromotedRowCount = safeFinalRows.filter(
    (row) => row?.reasonCategory === "verifier_reclassified_active",
  ).length;
  const invalidDoseRowCount = safeFinalRows.filter((row) =>
    ["ocr_unit_noise", "unsupported_unit"].includes(
      String(row?.reasonCategory || ""),
    )
  ).length;
  const ocrMatchedModelRowCount = countOcrDisposition("matched_model");
  const ocrRecoveredRowCount = countOcrDisposition("recovered");
  const ocrMergedDuplicateRowCount = countOcrDisposition("merged_duplicate");
  const ocrAmbiguousRowCount = countOcrDisposition("ambiguous_candidate");
  const ocrUnmatchedRowCount = countOcrDisposition("unmatched_ocr");
  const ocrLifecycleReconciled =
    ocrMatchedModelRowCount + ocrRecoveredRowCount +
      ocrMergedDuplicateRowCount + ocrAmbiguousRowCount +
      ocrUnmatchedRowCount === safeOcrRows.length;
  const modelLedgerReconciled =
    modelLifecycleRowCount === normalizedModelInputRowCount;
  const persistenceActiveLedgerReconciled =
    retainedRowCount + recoveredRetainedRowCount ===
      normalizedPersistenceActiveRowCount;
  const persistenceInputLedgerReconciled =
    retainedRowCount + recoveredRetainedRowCount +
      filteredUncertainRowCount === normalizedPersistenceInputRowCount;
  const ocrUnmatchedAggregateReconciled =
    ocrUnmatchedRowCount === normalizedUnmatchedOcrCandidateRowCount;

  return {
    filteredInactiveRowCount,
    filteredUncertainRowCount,
    invalidDoseRowCount,
    lifecycleReconciled:
      modelLedgerReconciled && persistenceActiveLedgerReconciled &&
      persistenceInputLedgerReconciled && ocrLifecycleReconciled &&
      ocrUnmatchedAggregateReconciled,
    mergedDuplicateRowCount,
    modelInputRowCount: normalizedModelInputRowCount,
    modelLifecycleRowCount,
    ocrAmbiguousRowCount,
    ocrLogicalCandidateCount: Number.isInteger(ocrLogicalCandidateCount)
      ? Math.max(0, ocrLogicalCandidateCount)
      : 0,
    ocrMatchedModelRowCount,
    ocrMergedDuplicateRowCount,
    ocrRecoveredRowCount,
    ocrSourceRowCount: safeOcrRows.length,
    ocrUnmatchedRowCount,
    ocrUnmatchedAggregateReconciled,
    persistenceActiveRowCount: normalizedPersistenceActiveRowCount,
    persistenceActiveReconciled: persistenceActiveLedgerReconciled,
    persistenceInputRowCount: normalizedPersistenceInputRowCount,
    persistenceInputReconciled: persistenceInputLedgerReconciled,
    persistenceRemovedRowCount:
      mergedDuplicateRowCount + filteredInactiveRowCount +
      filteredUncertainRowCount + rejectedRowCount,
    recoveredRetainedRowCount,
    rejectedRowCount,
    retainedRowCount,
    unmatchedOcrCandidateRowCount: normalizedUnmatchedOcrCandidateRowCount,
    verifierPromotedRowCount,
    verifierRemovedRowCount: 0,
  };
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
  if (
    typeof declaredValue !== "number" ||
    !Number.isFinite(declaredValue) ||
    !dosesAreEquivalent(
      declaredValue,
      ingredient?.dosage_unit,
      parsed.dosage_value,
      parsed.dosage_unit,
    )
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
        ? { ingredient, row, candidate: parseStructuredTableIngredientRow(row) }
        : null;
    })
    .filter((entry) => entry?.candidate);
}

function isVerifierMissingIngredientAlreadyRepresented(
  entry,
  existingIngredients,
  normalizeIngredientName,
) {
  const declaredKeys = getIngredientKeys(
    entry?.ingredient,
    normalizeIngredientName,
  );
  if (
    existingIngredients.some((ingredient) => {
      const existingKeys = getIngredientKeys(
        ingredient,
        normalizeIngredientName,
      );
      return Array.from(declaredKeys).some((key) => existingKeys.has(key));
    })
  ) {
    return true;
  }

  const candidateName = normalizeWhitespace(entry?.candidate?.raw_name);
  const malformedFormMarker = candidateName.match(
    /^(.*?)\s+\b(?:las|fas|los)\b\s+/iu,
  );
  if (!malformedFormMarker?.[1]) return false;

  const coreIdentity = getIngredientIdentity(
    malformedFormMarker[1],
    normalizeIngredientName,
  );
  if (!coreIdentity) return false;
  return existingIngredients.some((ingredient) =>
    getIngredientKeys(ingredient, normalizeIngredientName).has(coreIdentity)
  );
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
  ).filter(
    (entry) =>
      !isVerifierMissingIngredientAlreadyRepresented(
        entry,
        existing,
        normalizeIngredientName,
      ),
  );
  const missingRows = validatedMissingCandidates.map(({ row }) => row);
  if (!anchorRows.length || !missingRows.length) return [...existing];

  const recovered = recoverStructuredTableIngredients({
    ingredients: existing,
    tableRowGroups: [[...anchorRows, ...missingRows]],
    normalizeIngredientName,
    allowNewIngredients: true,
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

  const reconciled = [...recovered];
  acceptedCandidates.forEach((candidate) => {
    const exactIndex = reconciled.findIndex((ingredient) =>
      candidateExactlyMatchesIngredient(
        candidate,
        ingredient,
        normalizeIngredientName,
      )
    );
    if (exactIndex < 0) return;

    const confusableIndexes = reconciled
      .map((ingredient, index) => ({ ingredient, index }))
      .filter(({ ingredient, index }) =>
        index !== exactIndex &&
        candidateConfusablyMatchesIngredient(
          candidate,
          ingredient,
          normalizeIngredientName,
        )
      )
      .map(({ index }) => index);
    if (confusableIndexes.length !== 1) return;

    const replacementIndex = confusableIndexes[0];
    reconciled[replacementIndex] = reconciled[exactIndex];
    reconciled.splice(exactIndex, 1);
  });
  return reconciled;
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

  const unitVariantsByUnit = {
    mcg: ["mcg", "µg", "μg", "ug", "microgram", "micrograms"],
    mg: ["mg", "milligram", "milligrams"],
    g: ["g", "gram", "grams"],
    ml: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
    IU: ["iu", "i.u.", "international unit", "international units"],
    CFU: ["cfu", "colony forming unit", "colony forming units"],
  };
  const comparable = normalizeComparableDose(dosageValue, normalizedUnit);
  const representations = comparable?.family === "mass"
    ? [
        { value: comparable.value, unit: "mcg" },
        { value: comparable.value / 1_000, unit: "mg" },
        { value: comparable.value / 1_000_000, unit: "g" },
      ]
    : [{ value: dosageValue, unit: normalizedUnit }];

  representations.forEach(({ value, unit: representationUnit }) => {
    const roundedValue = Math.round(value * 1e9) / 1e9;
    const valueText = escapeRegExp(String(roundedValue)).replace(
      "\\.",
      "[.,]",
    );
    const unitVariants = unitVariantsByUnit[representationUnit] ?? [
      representationUnit,
    ];
    unitVariants.forEach((unit) => {
      patterns.push(
        new RegExp(`\\b${valueText}\\s*${escapeRegExp(unit)}\\b`, "iu"),
      );
    });
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
