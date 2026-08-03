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
  "verifier_retracted_dose",
  "front_label_only",
  "malformed_model_output",
  "ocr_structure_unavailable",
  "missing_dose_value",
  "missing_dose_unit",
  "unsupported_unit",
]);
const ALLOWED_UNITS = new Set(["mcg", "mg", "g", "ml", "IU", "CFU"]);
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
  if (normalized === "ug") return "mcg";
  if (normalized === "iu") return "IU";
  if (normalized === "cfu") return "CFU";
  return normalized;
}

function normalizeName(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’']/gu, "")
    .replace(/[_/|]+/gu, " ")
    .replace(/[()[\]{}.,:;!?+\-]+/gu, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:mcg|mg|g|ml|iu|cfu|ug)\b/giu, " ")
    .replace(/\b(?:ingredients?|contains|supplement facts?)\b:?/giu, " ")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .trim();
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
  addNameVariants(keys, ingredientName);
  addNameVariants(keys, rawName);
  addNameVariants(keys, chemicalForm);

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

  return Array.from(keys)
    .filter(
      (key) =>
        key.length >= 2 &&
        key.split(" ").some((token) => !FORM_WORDS.has(token)),
    )
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

function extractDoseCandidates(value) {
  const text = normalizeWhitespace(value);
  return Array.from(
    text.matchAll(
      /\b(\d+(?:[.,]\d+)?)\s*(mcg|µg|μg|ug|mg|g|ml|iu|cfu)\b/giu,
    ),
  ).map((match) => ({
    text: match[0],
    value: Number(match[1].replace(",", ".")),
    unit: normalizeUnit(match[2]),
  }));
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

export function normalizeAzureIngredientPanelOcr(value) {
  const row = value && typeof value === "object" ? value : {};
  const analyzeResult =
    row?.analyzeResult && typeof row.analyzeResult === "object"
      ? row.analyzeResult
      : row;
  const structuredLines = extractStructuredLines(analyzeResult?.pages);
  const structuredRows = extractStructuredTableRows(analyzeResult?.tables);
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
      return ["cfu"];
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
  return keys.some((key) => phraseAppears(normalizedRow, key));
}

function doseMatchesText(text, patterns) {
  return patterns.some((pattern) => pattern.test(normalizeWhitespace(text)));
}

function findIngredientEntries({ ingredientName, rawName, chemicalForm, ocr }) {
  const keys = buildIngredientVerificationKeys({
    ingredientName,
    rawName,
    chemicalForm,
  });
  if (!keys.length) return { keys, source: null, entries: [] };

  const rows = Array.isArray(ocr?.structuredRows) ? ocr.structuredRows : [];
  const matchingRows = rows.filter((row) =>
    rowMatchesIngredient(row.text, keys)
  );
  if (matchingRows.length) {
    return { keys, source: "ingredient_panel_ocr", entries: matchingRows };
  }

  const lines = Array.isArray(ocr?.structuredLines) ? ocr.structuredLines : [];
  return {
    keys,
    source: lines.length ? "ingredient_panel_ocr" : null,
    entries: lines.filter((line) => rowMatchesIngredient(line.text, keys)),
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
  return /^\s*\d+(?:[.,]\d+)?\s*(?:mcg|µg|μg|ug|mg|g|ml|iu|cfu)\s*$/iu.test(
    text,
  );
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
    return { confidence: "missing", reason: null };
  }
  if (value === null || !unit || !ALLOWED_UNITS.has(unit)) {
    return {
      confidence: "unverified",
      reason: value === null
        ? "missing_dose_value"
        : !unit
        ? "missing_dose_unit"
        : "unsupported_unit",
    };
  }
  if (!ocr) {
    return { confidence: "unverified", reason: "ocr_structure_unavailable" };
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
      confidence: "unverified",
      reason: (ocr?.structuredRows?.length ?? 0) ||
          (ocr?.structuredLines?.length ?? 0)
        ? "ingredient_row_not_found"
        : "ocr_structure_unavailable",
    };
  }

  const sameEntry = result.entries.find((entry) =>
    doseMatchesText(entry.text, patterns)
  );
  if (sameEntry) {
    return {
      confidence: "verified",
      reason: null,
      evidenceSource: "ingredient_panel_ocr",
      evidenceReference: sameEntry.id,
      evidenceText: sameEntry.text,
      evidenceConfidence: finiteNumber(sameEntry.confidence),
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
      doseMatchesText(nextLine.text, patterns)
    ) {
      return {
        confidence: "verified",
        reason: null,
        evidenceSource: "ingredient_panel_ocr",
        evidenceReference: `${entry.id}+${nextLine.id}`,
        evidenceText: `${entry.text} ${nextLine.text}`,
        evidenceConfidence: averageConfidence([entry, nextLine]),
      };
    }
  }

  const rows = Array.isArray(ocr?.structuredRows) ? ocr.structuredRows : [];
  const hasNeighboringDose = result.entries.some((entry) =>
    rows.some(
      (candidate) =>
        candidate.tableIndex === entry.tableIndex &&
        Math.abs(candidate.rowIndex - entry.rowIndex) === 1 &&
        doseMatchesText(candidate.text, patterns),
    )
  ) || result.entries.some((entry) => {
    const index = lines.findIndex((line) => line.id === entry.id);
    return [lines[index - 1], lines[index + 1]].some(
      (candidate) => candidate && doseMatchesText(candidate.text, patterns),
    );
  });

  return {
    confidence: "unverified",
    reason: hasNeighboringDose
      ? "ambiguous_neighboring_dose"
      : "dose_not_on_same_row",
  };
}

export function normalizeExtractedDosePair(value, unit) {
  const finiteValue = finiteNumber(value);
  const normalizedValue = finiteValue !== null && finiteValue >= 0
    ? finiteValue
    : null;
  const normalizedUnit = normalizeUnit(unit);
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
    if (!ocr && declaredSource === "ingredient_panel_image") {
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
          "ocr_structure_unavailable",
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
  if (value.verified_ingredients.length !== ingredientCount) {
    return validationFailure(
      "incomplete_model_output",
      "incomplete_verifier_indexes",
    );
  }

  const indexes = new Set();
  for (const correction of value.verified_ingredients) {
    if (!hasRequiredFields(correction, DOSE_CORRECTION_REQUIRED_FIELDS)) {
      return validationFailure(
        "incomplete_model_output",
        "partial_verifier_object",
      );
    }
    if (!hasOnlyFields(correction, DOSE_CORRECTION_REQUIRED_FIELDS)) {
      return validationFailure(
        "malformed_model_output",
        "unexpected_verifier_field",
      );
    }
    const rawCorrectionUnit = normalizeWhitespace(
      correction?.dosage_unit,
    ).toLowerCase();
    if (
      integerValue(correction.index) === null ||
      correction.index < 0 ||
      correction.index >= ingredientCount ||
      indexes.has(correction.index) ||
      !DOSE_DECISION_VALUES.has(correction.decision) ||
      !(
        correction.dosage_value === null ||
        (finiteNumber(correction.dosage_value) !== null &&
          correction.dosage_value >= 0)
      ) ||
      !isStringOrNull(correction.dosage_unit) ||
      !isStringOrNull(correction.dosage_original_text) ||
      !isStringOrNull(correction.review_reason) ||
      (correction.review_reason !== null &&
        !DOSE_REVIEW_REASON_VALUES.has(correction.review_reason)) ||
      (correction.dosage_unit !== null &&
        SENTINEL_VALUES.has(rawCorrectionUnit))
    ) {
      return validationFailure(
        "malformed_model_output",
        "invalid_verifier_object",
      );
    }
    indexes.add(correction.index);
  }

  return { ok: true, value };
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
  return parsed;
}

function normalizeReviewReason(value, fallback) {
  return DOSE_REVIEW_REASON_VALUES.has(value) ? value : fallback;
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

  return (Array.isArray(ingredients) ? ingredients : []).map(
    (ingredient, index) => {
      const correction = correctionsByIndex.get(index);
      const firstPassValue =
        Number.isFinite(ingredient?.first_pass_dosage_value)
          ? ingredient.first_pass_dosage_value
          : finiteNumber(ingredient?.dosage_value);
      const firstPassUnit = ingredient?.first_pass_dosage_unit ||
        normalizeUnit(ingredient?.dosage_unit);
      const firstPassText =
        normalizeWhitespace(ingredient?.first_pass_dosage_original_text) ||
        normalizeWhitespace(ingredient?.dosage_original_text) ||
        null;
      const decision = DOSE_DECISION_VALUES.has(correction?.decision)
        ? correction.decision
        : "unverified";
      const correctedPair = normalizeExtractedDosePair(
        correction?.dosage_value,
        correction?.dosage_unit,
      );
      let nextIngredient;
      let verifierEvidence = null;

      if (
        (decision === "verified" || decision === "corrected") &&
        correctedPair.isUsable
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

        const trustedImageDecision = !ocr &&
          ingredient?.evidence_source === "ingredient_panel_image";
        if (
          trustedImageDecision || verifierEvidence?.confidence === "verified"
        ) {
          nextIngredient = {
            ...ingredient,
            dosage_value: correctedPair.value,
            dosage_unit: correctedPair.unit,
            dosage_original_text:
              normalizeWhitespace(correction?.dosage_original_text) ||
              firstPassText,
            dose_confidence: "verified",
            dose_review_reason: null,
            verifier_decision: decision,
            evidence_reference: verifierEvidence?.evidenceReference ||
              ingredient?.evidence_reference || null,
          };
        }
      }

      if (!nextIngredient) {
        const hadFirstPassDose = Number.isFinite(firstPassValue) ||
          Boolean(firstPassUnit);
        const fallbackReason = decision === "missing" && !hadFirstPassDose
          ? null
          : "verifier_retracted_dose";
        nextIngredient = {
          ...ingredient,
          dosage_value: null,
          dosage_unit: null,
          dosage_original_text: firstPassText,
          dose_confidence: hadFirstPassDose ? "unverified" : "missing",
          dose_review_reason: normalizeReviewReason(
            verifierEvidence?.reason || correction?.review_reason,
            fallbackReason,
          ),
          verifier_decision: decision === "verified" || decision === "corrected"
            ? "retracted"
            : decision,
        };
      }

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
            reference: ingredient?.evidence_reference || null,
            confidence: finiteNumber(ingredient?.evidence_confidence),
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
