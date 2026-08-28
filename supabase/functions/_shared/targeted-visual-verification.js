import {
  Gravity,
  ImageMagick,
  initializeImageMagick,
  MagickColors,
  MagickFormat,
  MagickGeometry,
  MagickReadSettings,
} from "@imagemagick/magick-wasm";

const MAX_JPEG_PIXELS = 20_000_000;
// OpenAI's high-detail path normalizes the shortest side to 768px. A square
// 1024px targeted crop preserves that effective row resolution without
// retaining a full multi-megapixel decode in the Edge isolate.
const MAX_TARGET_IMAGE_DIMENSION = 1_024;
const PANEL_CROP_HORIZONTAL_IMAGE_MARGIN = 0.04;
const PANEL_CROP_HORIZONTAL_PANEL_MARGIN = 0.1;
const PANEL_CROP_TOP_IMAGE_MARGIN = 0.05;
const PANEL_CROP_TOP_PANEL_MARGIN = 0.22;
const PANEL_CROP_BOTTOM_IMAGE_MARGIN = 0.04;
const PANEL_CROP_BOTTOM_PANEL_MARGIN = 0.18;
const PANEL_CROP_CONTEXT_IMAGE_DISTANCE = 0.06;
const PANEL_CROP_CONTEXT_PANEL_DISTANCE = 0.25;
const PANEL_CROP_MIN_TOKEN_SAVINGS_FRACTION = 0.2;
let imageMagickInitialization;
const UNRELIABLE_OCR_TARGETABLE_GLOBAL_REASONS = new Set([
  "incomplete_panel",
  "model_incomplete_panel",
  "multiple_quantities",
  "ocr_confidence_insufficient",
  "possible_omitted_row",
  "possible_omitted_rows",
]);
const LOCATED_OMISSION_GLOBAL_REASONS = new Set([
  "incomplete_panel",
  "model_incomplete_panel",
  "multiple_quantities",
  "possible_omitted_row",
  "possible_omitted_rows",
]);
const SERVING_CONTEXT_PATTERN =
  /\b(?:amount\s+per\s+serving|each\s+(?:capsule|gumm(?:y|ies)|scoop|softgel|tablet)|per\s+(?:serving|\d+(?:[.,]\d+)?\s+(?:capsules?|gumm(?:y|ies)|scoops?|softgels?|tablets?))|serving\s+size|servings?\s+per)\b/iu;

function normalizeWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function normalizeRowKey(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function clampFraction(value) {
  return Math.max(0, Math.min(1, value));
}

function parsePolygonPoints(value) {
  if (!Array.isArray(value)) return [];

  if (value.every((item) => Number.isFinite(Number(item)))) {
    const points = [];
    for (let index = 0; index + 1 < value.length; index += 2) {
      points.push({ x: Number(value[index]), y: Number(value[index + 1]) });
    }
    return points;
  }

  return value
    .map((item) => ({
      x: Number(item?.x),
      y: Number(item?.y),
    }))
    .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
}

function getPageDimensions(pages, pageNumber) {
  const page = pages.find(
    (candidate, index) =>
      Number(candidate?.pageNumber ?? index + 1) === pageNumber,
  );
  const width = Number(page?.width);
  const height = Number(page?.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) &&
      height > 0
    ? { width, height }
    : null;
}

function getPolygonBounds({ polygon, pageNumber = 1 }, pages) {
  const dimensions = getPageDimensions(pages, pageNumber);
  const points = parsePolygonPoints(polygon);
  if (!dimensions || points.length < 3) return null;

  const xValues = points.map(({ x }) => x / dimensions.width);
  const yValues = points.map(({ y }) => y / dimensions.height);
  return {
    pageNumber,
    left: clampFraction(Math.min(...xValues)),
    top: clampFraction(Math.min(...yValues)),
    right: clampFraction(Math.max(...xValues)),
    bottom: clampFraction(Math.max(...yValues)),
  };
}

function getCellBounds(cell, pages) {
  const boundingRegions = Array.isArray(cell?.boundingRegions)
    ? cell.boundingRegions
    : [];
  for (const region of boundingRegions) {
    const pageNumber = Number(region?.pageNumber ?? 1);
    const bounds = getPolygonBounds(
      { polygon: region?.polygon, pageNumber },
      pages,
    );
    if (bounds) return bounds;
  }
  return null;
}

function getBoundingRegionBounds(value, pages) {
  const boundingRegions = Array.isArray(value?.boundingRegions)
    ? value.boundingRegions
    : [];
  if (boundingRegions.length !== 1) return null;
  const pageNumber = Number(boundingRegions[0]?.pageNumber ?? 1);
  return getPolygonBounds(
    { polygon: boundingRegions[0]?.polygon, pageNumber },
    pages,
  );
}

function boundsContain(outer, inner, tolerance = 0.01) {
  return outer.pageNumber === inner.pageNumber &&
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance;
}

function horizontalOverlapFraction(left, right) {
  const overlap = Math.max(
    0,
    Math.min(left.right, right.right) - Math.max(left.left, right.left),
  );
  return overlap / Math.max(0.0001, Math.min(
    left.right - left.left,
    right.right - right.left,
  ));
}

/**
 * Selects one complete Azure table and nearby layout context. This deliberately
 * uses the whole table polygon, never a filtered subset of ingredient rows.
 */
export function selectCompleteAzurePanelRegions(value) {
  const row = value ?? {};
  const analyzeResult =
    row?.analyzeResult && typeof row.analyzeResult === "object"
      ? row.analyzeResult
      : row;
  const pages = Array.isArray(analyzeResult?.pages) ? analyzeResult.pages : [];
  const tables = Array.isArray(analyzeResult?.tables)
    ? analyzeResult.tables
    : [];

  if (!pages.length) {
    return {
      completeCoverage: false,
      fallbackReason: "page_geometry_missing",
      regions: [],
    };
  }
  if (!tables.length) {
    return {
      completeCoverage: false,
      fallbackReason: "table_geometry_missing",
      regions: [],
    };
  }
  if (tables.length !== 1) {
    return {
      completeCoverage: false,
      fallbackReason: "multiple_ambiguous_tables",
      regions: [],
    };
  }

  const table = tables[0];
  const tableBounds = getBoundingRegionBounds(table, pages);
  const cells = Array.isArray(table?.cells) ? table.cells : [];
  const declaredRowCount = Number(table?.rowCount);
  const declaredColumnCount = Number(table?.columnCount);
  if (
    !tableBounds || !Number.isInteger(declaredRowCount) ||
    declaredRowCount < 2 || !Number.isInteger(declaredColumnCount) ||
    declaredColumnCount < 2 || !cells.length
  ) {
    return {
      completeCoverage: false,
      fallbackReason: "incomplete_table_geometry",
      regions: [],
    };
  }

  const rowIndexes = new Set();
  const columnIndexes = new Set();
  for (const cell of cells) {
    const rowIndex = Number(cell?.rowIndex);
    const columnIndex = Number(cell?.columnIndex);
    const cellBounds = getCellBounds(cell, pages);
    if (
      !Number.isInteger(rowIndex) || rowIndex < 0 ||
      rowIndex >= declaredRowCount || !Number.isInteger(columnIndex) ||
      columnIndex < 0 || columnIndex >= declaredColumnCount || !cellBounds ||
      !boundsContain(tableBounds, cellBounds)
    ) {
      return {
        completeCoverage: false,
        fallbackReason: "incomplete_table_geometry",
        regions: [],
      };
    }
    rowIndexes.add(rowIndex);
    columnIndexes.add(columnIndex);
  }
  if (
    rowIndexes.size !== declaredRowCount ||
    columnIndexes.size !== declaredColumnCount
  ) {
    return {
      completeCoverage: false,
      fallbackReason: "incomplete_table_geometry",
      regions: [],
    };
  }

  const tableHeight = tableBounds.bottom - tableBounds.top;
  const contextDistance = Math.max(
    PANEL_CROP_CONTEXT_IMAGE_DISTANCE,
    tableHeight * PANEL_CROP_CONTEXT_PANEL_DISTANCE,
  );
  const page = pages.find(
    (candidate, index) =>
      Number(candidate?.pageNumber ?? index + 1) === tableBounds.pageNumber,
  );
  const contextRegions = [];
  for (const [lineIndex, line] of (Array.isArray(page?.lines)
    ? page.lines
    : []).entries()) {
    const text = normalizeWhitespace(line?.content);
    if (!text) continue;
    const lineBounds = getPolygonBounds(
      { polygon: line?.polygon, pageNumber: tableBounds.pageNumber },
      pages,
    );
    if (!lineBounds) {
      if (SERVING_CONTEXT_PATTERN.test(text)) {
        return {
          completeCoverage: false,
          fallbackReason: "serving_context_geometry_incomplete",
          regions: [],
        };
      }
      continue;
    }
    if (boundsContain(tableBounds, lineBounds, 0.02)) continue;
    const verticalDistance = lineBounds.bottom <= tableBounds.top
      ? tableBounds.top - lineBounds.bottom
      : lineBounds.top >= tableBounds.bottom
        ? lineBounds.top - tableBounds.bottom
        : 0;
    const overlapFraction = horizontalOverlapFraction(tableBounds, lineBounds);
    if (
      SERVING_CONTEXT_PATTERN.test(text) && overlapFraction >= 0.3 &&
      verticalDistance > contextDistance + Number.EPSILON
    ) {
      return {
        completeCoverage: false,
        fallbackReason: "serving_context_outside_safe_panel",
        regions: [],
      };
    }
    if (
      verticalDistance <= contextDistance + Number.EPSILON &&
      overlapFraction >= 0.3
    ) {
      contextRegions.push({
        candidateId: `panel-context:${tableBounds.pageNumber}:${lineIndex}`,
        regionType: SERVING_CONTEXT_PATTERN.test(text)
          ? "serving_context"
          : "panel_context",
        isServingContext: SERVING_CONTEXT_PATTERN.test(text),
        tableIndex: 0,
        rowIndex: lineIndex,
        ...lineBounds,
      });
    }
  }

  return {
    completeCoverage: true,
    fallbackReason: "none",
    regions: [
      {
        candidateId: "panel-table:0",
        regionType: "table_bounds",
        isServingContext: false,
        tableIndex: 0,
        rowIndex: -1,
        ...tableBounds,
      },
      ...contextRegions,
    ],
    tableRowCount: declaredRowCount,
    tableColumnCount: declaredColumnCount,
    contextRegionCount: contextRegions.length,
  };
}

export function assessPanelCropTokenSavings({
  originalTokens,
  croppedTokens,
  minimumSavingsFraction = PANEL_CROP_MIN_TOKEN_SAVINGS_FRACTION,
}) {
  if (!Number.isFinite(originalTokens) || !Number.isFinite(croppedTokens)) {
    return {
      useCrop: false,
      fallbackReason: "token_estimate_unavailable",
      tokensAvoided: 0,
    };
  }
  const tokensAvoided = Math.max(0, originalTokens - croppedTokens);
  if (
    tokensAvoided <= 0 ||
    tokensAvoided / Math.max(1, originalTokens) < minimumSavingsFraction
  ) {
    return {
      useCrop: false,
      fallbackReason: "token_savings_not_material",
      tokensAvoided: 0,
    };
  }
  return {
    useCrop: true,
    fallbackReason: "none",
    tokensAvoided,
  };
}

export function extractAzureVisualRowRegions(value) {
  const row = value ?? {};
  const analyzeResult =
    row?.analyzeResult && typeof row.analyzeResult === "object"
      ? row.analyzeResult
      : row;
  const pages = Array.isArray(analyzeResult?.pages) ? analyzeResult.pages : [];
  const tables = Array.isArray(analyzeResult?.tables)
    ? analyzeResult.tables
    : [];
  const regions = [];

  tables.forEach((table, tableIndex) => {
    const cells = Array.isArray(table?.cells) ? table.cells : [];
    const rows = new Map();

    cells.forEach((cell) => {
      const rowIndex = Number(cell?.rowIndex);
      const columnIndex = Number(cell?.columnIndex);
      const content = normalizeWhitespace(cell?.content);
      const bounds = getCellBounds(cell, pages);
      if (
        !Number.isInteger(rowIndex) || !Number.isInteger(columnIndex) ||
        !content
      ) {
        return;
      }

      const existing = rows.get(rowIndex) ?? {
        columns: new Map(),
        bounds: [],
      };
      const existingContent = existing.columns.get(columnIndex);
      existing.columns.set(
        columnIndex,
        existingContent ? `${existingContent} ${content}`.trim() : content,
      );
      if (bounds) existing.bounds.push(bounds);
      rows.set(rowIndex, existing);
    });

    Array.from(rows.entries())
      .sort(([left], [right]) => left - right)
      .forEach(([rowIndex, entry]) => {
        const text = Array.from(entry.columns.entries())
          .sort(([left], [right]) => left - right)
          .map(([, content]) => content)
          .join("\t");
        const pageNumbers = new Set(
          entry.bounds.map(({ pageNumber }) => pageNumber),
        );
        if (!text || entry.bounds.length === 0 || pageNumbers.size !== 1) {
          return;
        }

        regions.push({
          candidateId: `table:${tableIndex}:${rowIndex}`,
          text,
          regionType: "table_row",
          isServingContext: SERVING_CONTEXT_PATTERN.test(text),
          tableIndex,
          rowIndex,
          pageNumber: entry.bounds[0].pageNumber,
          left: Math.min(...entry.bounds.map(({ left }) => left)),
          top: Math.min(...entry.bounds.map(({ top }) => top)),
          right: Math.max(...entry.bounds.map(({ right }) => right)),
          bottom: Math.max(...entry.bounds.map(({ bottom }) => bottom)),
        });
      });
  });

  pages.forEach((page, pageIndex) => {
    const pageNumber = Number(page?.pageNumber ?? pageIndex + 1);
    const lines = Array.isArray(page?.lines) ? page.lines : [];
    lines.forEach((line, lineIndex) => {
      const text = normalizeWhitespace(line?.content);
      if (!text) return;
      const bounds = getPolygonBounds(
        { polygon: line?.polygon, pageNumber },
        pages,
      );
      if (!bounds) return;

      regions.push({
        candidateId: `line:${pageNumber}:${lineIndex}`,
        text,
        regionType: SERVING_CONTEXT_PATTERN.test(text)
          ? "serving_context"
          : "ocr_line",
        isServingContext: SERVING_CONTEXT_PATTERN.test(text),
        tableIndex: -1,
        rowIndex: lineIndex,
        ...bounds,
      });
    });
  });

  return regions;
}

/**
 * @param {{
 *   availableRegions?: Array<Record<string, any>>,
 *   targetRows?: string[],
 *   questionableRowGroups?: string[][],
 *   unmatchedRows?: string[],
 *   questionableCandidateIdGroups?: string[][],
 *   unmatchedCandidateIdGroups?: string[][],
 *   includeAdjacentRows?: boolean,
 *   includeServingContext?: boolean,
 * }} options
 */
export function selectTargetedVisualRegions({
  availableRegions,
  targetRows = [],
  questionableRowGroups,
  unmatchedRows = [],
  questionableCandidateIdGroups,
  unmatchedCandidateIdGroups,
  includeAdjacentRows = true,
  includeServingContext = false,
}) {
  const regions = Array.isArray(availableRegions) ? availableRegions : [];
  const tableRegions = regions.filter(
    (region) => region?.regionType !== "serving_context",
  );
  const legacyTargetRows = Array.isArray(targetRows) ? targetRows : [];
  const requestedQuestionableGroups = Array.isArray(questionableRowGroups)
    ? questionableRowGroups
      .map((group) =>
        Array.from(
          new Set(
            (Array.isArray(group) ? group : [])
              .map(normalizeRowKey)
              .filter(Boolean),
          ),
        )
      )
    : legacyTargetRows.map((row) => [normalizeRowKey(row)].filter(Boolean));
  const requestedQuestionableCandidateIdGroups = Array.isArray(
      questionableCandidateIdGroups,
    )
    ? questionableCandidateIdGroups.map((group) =>
      Array.from(
        new Set(
          (Array.isArray(group) ? group : [])
            .map(normalizeWhitespace)
            .filter(Boolean),
        ),
      )
    )
    : null;
  const requestedUnmatchedCandidateIdGroups = Array.isArray(
      unmatchedCandidateIdGroups,
    )
    ? unmatchedCandidateIdGroups.map((group) =>
      Array.from(
        new Set(
          (Array.isArray(group) ? group : [])
            .map(normalizeWhitespace)
            .filter(Boolean),
        ),
      )
    )
    : null;
  const requestedUnmatchedKeys = (Array.isArray(unmatchedRows)
    ? unmatchedRows
    : [])
    .map(normalizeRowKey)
    .filter(Boolean);
  const findRegion = (key) =>
    tableRegions.find((region) => normalizeRowKey(region?.text) === key);
  const resolveCandidateIdGroup = (candidateIds) => {
    const matchedRegions = candidateIds
      .map((candidateId) =>
        regions.find((region) => region?.candidateId === candidateId)
      )
      .filter(Boolean);
    return {
      complete:
        candidateIds.length > 0 && matchedRegions.length === candidateIds.length,
      regions: matchedRegions,
    };
  };
  const questionableMatches = requestedQuestionableCandidateIdGroups
    ? requestedQuestionableCandidateIdGroups.map(resolveCandidateIdGroup)
    : requestedQuestionableGroups.map((keys) => {
      const region = keys.map(findRegion).find(Boolean);
      return { complete: Boolean(region), regions: region ? [region] : [] };
    });
  const unmatchedMatches = requestedUnmatchedCandidateIdGroups
    ? requestedUnmatchedCandidateIdGroups.map(resolveCandidateIdGroup)
    : requestedUnmatchedKeys.map((key) => {
      const region = findRegion(key);
      return { complete: Boolean(region), regions: region ? [region] : [] };
    });
  const mappedQuestionableRowCount = questionableMatches.filter(
    ({ complete }) => complete,
  ).length;
  const mappedUnmatchedCandidateCount = unmatchedMatches.filter(
    ({ complete }) => complete,
  ).length;
  const servingContextRegions = includeServingContext
    ? regions.filter((region) => region?.isServingContext === true)
    : [];
  const requestedQuestionableRowCount = questionableMatches.length;
  const requestedUnmatchedCandidateCount = unmatchedMatches.length;
  const requestedTargetCount = requestedQuestionableRowCount +
    requestedUnmatchedCandidateCount;
  const matchedTargets = [
    ...questionableMatches.flatMap(({ regions: matchedRegions }) =>
      matchedRegions
    ),
    ...unmatchedMatches.flatMap(({ regions: matchedRegions }) => matchedRegions),
  ];
  const servingContextLocated = !includeServingContext ||
    servingContextRegions.length > 0;
  const completeCoverage =
    (requestedTargetCount > 0 || includeServingContext) &&
    mappedQuestionableRowCount === requestedQuestionableRowCount &&
    mappedUnmatchedCandidateCount === requestedUnmatchedCandidateCount &&
    servingContextLocated;

  if (!completeCoverage) {
    return {
      completeCoverage: false,
      matchedTargetCount: mappedQuestionableRowCount +
        mappedUnmatchedCandidateCount,
      requestedTargetCount,
      mappedQuestionableRowCount,
      requestedQuestionableRowCount,
      mappedUnmatchedCandidateCount,
      requestedUnmatchedCandidateCount,
      adjacentContextRowCount: 0,
      servingContextLocated,
      servingContextRegionCount: servingContextRegions.length,
      regions: [],
    };
  }

  const selected = new Map();
  const addRegion = (region) => {
    selected.set(
      `${region.pageNumber}:${
        region.regionType ?? "table_row"
      }:${region.tableIndex}:${region.rowIndex}`,
      region,
    );
  };
  const directTargetKeys = new Set();
  matchedTargets.forEach((target) => {
    addRegion(target);
    directTargetKeys.add(
      `${target.pageNumber}:${
        target.regionType ?? "table_row"
      }:${target.tableIndex}:${target.rowIndex}`,
    );
    if (!includeAdjacentRows) return;
    tableRegions.forEach((candidate) => {
      if (
        candidate.pageNumber === target.pageNumber &&
        candidate.tableIndex === target.tableIndex &&
        Math.abs(candidate.rowIndex - target.rowIndex) === 1
      ) {
        addRegion(candidate);
      }
    });
  });
  servingContextRegions.forEach(addRegion);
  const selectedRegions = Array.from(selected.values());
  const adjacentContextRowCount = selectedRegions.filter((region) => {
    const key = `${region.pageNumber}:${
      region.regionType ?? "table_row"
    }:${region.tableIndex}:${region.rowIndex}`;
    return (
      region?.regionType !== "serving_context" &&
      !directTargetKeys.has(key)
    );
  }).length;

  return {
    completeCoverage: true,
    matchedTargetCount: mappedQuestionableRowCount +
      mappedUnmatchedCandidateCount,
    requestedTargetCount,
    mappedQuestionableRowCount,
    requestedQuestionableRowCount,
    mappedUnmatchedCandidateCount,
    requestedUnmatchedCandidateCount,
    adjacentContextRowCount,
    servingContextLocated,
    servingContextRegionCount: servingContextRegions.length,
    regions: selectedRegions,
  };
}

function classifyReliableGlobalConcern({
  globalReasons,
  unmatchedCandidateCount,
  allUnmatchedCandidatesLocated,
  servingContextLocated,
}) {
  if (!globalReasons.length) {
    return { targetable: true, reason: "no_global_concern" };
  }
  if (globalReasons.includes("widespread_ocr_extraction_disagreement")) {
    return { targetable: false, reason: "widespread_disagreement" };
  }

  for (const reason of globalReasons) {
    if (LOCATED_OMISSION_GLOBAL_REASONS.has(reason)) {
      if (unmatchedCandidateCount === 0) {
        return {
          targetable: false,
          reason: "omission_candidate_not_identified",
        };
      }
      if (!allUnmatchedCandidatesLocated) {
        return { targetable: false, reason: "omission_candidate_not_located" };
      }
      continue;
    }
    if (reason === "serving_size_unclear") {
      if (!servingContextLocated) {
        return { targetable: false, reason: "serving_context_not_located" };
      }
      continue;
    }
    return { targetable: false, reason: `global_${reason}_not_targetable` };
  }

  return {
    targetable: true,
    reason: globalReasons.includes("serving_size_unclear")
      ? "located_rows_and_serving_context_bound_global_concern"
      : "located_omission_candidates_bound_global_concern",
  };
}

export function selectVisualVerificationStrategy({
  required,
  reasonDetails,
  activeRowCount,
  questionableRowCount,
  unmatchedCandidateCount,
  firstExtractionUsedHighDetailIngredientVision,
  firstVisualAuditComplete = false,
  firstVisualUnresolvedRegionCount = 0,
  reliableOcr = false,
  structuredGeometryAvailable = false,
  mappedQuestionableRowCount = 0,
  mappedUnmatchedCandidateCount = 0,
  servingContextLocated = false,
}) {
  if (!required) {
    return {
      mode: "none",
      reason: "not_required",
      globalConcernTargetable: true,
      globalConcernTargetabilityReason: "no_global_concern",
      reliableGeometryTargeting: false,
    };
  }

  const globalReasons = (Array.isArray(reasonDetails) ? reasonDetails : [])
    .filter((detail) => detail?.scope === "global")
    .map((detail) => normalizeRowKey(detail?.reason));
  const allQuestionableRowsLocated =
    mappedQuestionableRowCount === questionableRowCount;
  const allUnmatchedCandidatesLocated =
    mappedUnmatchedCandidateCount === unmatchedCandidateCount;
  const reliableGlobalConcern = classifyReliableGlobalConcern({
    globalReasons,
    unmatchedCandidateCount,
    allUnmatchedCandidatesLocated,
    servingContextLocated,
  });
  const concernCount = questionableRowCount + unmatchedCandidateCount;
  const widespreadThreshold = Math.max(3, Math.ceil(activeRowCount / 2));

  if (reliableOcr && !firstExtractionUsedHighDetailIngredientVision) {
    const hasBoundedConcern = concernCount > 0 &&
      concernCount < widespreadThreshold;
    if (
      structuredGeometryAvailable &&
      hasBoundedConcern &&
      unmatchedCandidateCount <= 3 &&
      allQuestionableRowsLocated &&
      allUnmatchedCandidatesLocated &&
      reliableGlobalConcern.targetable
    ) {
      return {
        mode: "targeted_regions",
        reason: "reliable_geometry_bounded_uncertainty",
        globalConcernTargetable: true,
        globalConcernTargetabilityReason: reliableGlobalConcern.reason,
        reliableGeometryTargeting: true,
      };
    }

    let reason = "global_or_widespread_uncertainty";
    if (!structuredGeometryAvailable) {
      reason = "structured_geometry_unavailable";
    } else if (!allQuestionableRowsLocated) {
      reason = "questionable_row_geometry_incomplete";
    } else if (!allUnmatchedCandidatesLocated) {
      reason = "unmatched_candidate_geometry_incomplete";
    } else if (!reliableGlobalConcern.targetable) {
      reason = "global_concern_not_geographically_bounded";
    }

    return {
      mode: "full_image",
      reason,
      globalConcernTargetable: reliableGlobalConcern.targetable,
      globalConcernTargetabilityReason: reliableGlobalConcern.reason,
      reliableGeometryTargeting: false,
    };
  }

  if (!firstExtractionUsedHighDetailIngredientVision) {
    return {
      mode: "full_image",
      reason: "first_pass_had_no_high_detail_panel",
      globalConcernTargetable: false,
      globalConcernTargetabilityReason: "reliable_geometry_gate_not_available",
      reliableGeometryTargeting: false,
    };
  }

  const onlyLowRecognitionConfidence = globalReasons.length > 0 &&
    globalReasons.every((reason) => reason === "ocr_confidence_insufficient") &&
    questionableRowCount === 0 &&
    unmatchedCandidateCount === 0 &&
    firstVisualAuditComplete === true &&
    firstVisualUnresolvedRegionCount === 0;
  if (onlyLowRecognitionConfidence) {
    return {
      mode: "first_pass_high_detail",
      reason: "low_recognition_confidence_covered_by_visual_audit",
      globalConcernTargetable: true,
      globalConcernTargetabilityReason: "covered_by_first_visual_audit",
      reliableGeometryTargeting: false,
    };
  }

  const everyGlobalReasonIsTargetable = globalReasons.every((reason) =>
    UNRELIABLE_OCR_TARGETABLE_GLOBAL_REASONS.has(reason)
  );
  const firstVisualAuditBoundedGlobalUncertainty = globalReasons.length === 0 ||
    (firstVisualAuditComplete === true &&
      firstVisualUnresolvedRegionCount <= concernCount);
  const incompletenessHasSpecificCandidate =
    !globalReasons.some((reason) =>
      ["incomplete_panel", "model_incomplete_panel", "possible_omitted_rows"]
        .includes(
          reason,
        )
    ) || unmatchedCandidateCount > 0;

  if (
    concernCount > 0 &&
    concernCount < widespreadThreshold &&
    unmatchedCandidateCount <= 3 &&
    everyGlobalReasonIsTargetable &&
    firstVisualAuditBoundedGlobalUncertainty &&
    incompletenessHasSpecificCandidate
  ) {
    return {
      mode: "targeted_regions",
      reason: "bounded_visual_uncertainty",
      globalConcernTargetable: everyGlobalReasonIsTargetable,
      globalConcernTargetabilityReason: globalReasons.length
        ? "bounded_by_first_visual_audit"
        : "no_global_concern",
      reliableGeometryTargeting: false,
    };
  }

  return {
    mode: "full_image",
    reason:
      globalReasons.length > 0 && !firstVisualAuditBoundedGlobalUncertainty
        ? "first_visual_audit_unbounded"
        : "global_or_widespread_uncertainty",
    globalConcernTargetable: everyGlobalReasonIsTargetable,
    globalConcernTargetabilityReason: everyGlobalReasonIsTargetable
      ? "first_visual_audit_unbounded"
      : "global_reason_not_targetable",
    reliableGeometryTargeting: false,
  };
}

export function shouldFallbackToFullVisualVerification(
  { mode, scopeResolved },
) {
  return (
    ["targeted_crop", "full_image_targeted_rows"].includes(mode) &&
    scopeResolved !== true
  );
}

function decodeBase64(value) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function encodeBase64(value) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...value.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function readJpegDimensions(bytes) {
  if (bytes?.[0] !== 0xff || bytes?.[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      return null;
    }
    if (startOfFrameMarkers.has(marker)) {
      return {
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
      };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

async function readImageMagickWasm() {
  const wasmUrl = new URL(
    "magick.wasm",
    import.meta.resolve("@imagemagick/magick-wasm"),
  );
  if (globalThis.Deno?.readFile) {
    return globalThis.Deno.readFile(wasmUrl);
  }

  const nodeFsSpecifier = ["node", "fs/promises"].join(":");
  const { readFile } = await import(nodeFsSpecifier);
  return new Uint8Array(await readFile(wasmUrl));
}

function ensureImageMagickInitialized() {
  imageMagickInitialization ??= readImageMagickWasm().then((wasmBytes) =>
    initializeImageMagick(wasmBytes)
  );
  return imageMagickInitialization;
}

function mergeRegions(regions) {
  const pageNumbers = new Set(regions.map(({ pageNumber }) => pageNumber));
  if (pageNumbers.size !== 1) return null;
  return {
    pageNumber: regions[0].pageNumber,
    left: Math.min(...regions.map(({ left }) => left)),
    top: Math.min(...regions.map(({ top }) => top)),
    right: Math.max(...regions.map(({ right }) => right)),
    bottom: Math.max(...regions.map(({ bottom }) => bottom)),
  };
}

function expandRegion(region, imageWidth, imageHeight) {
  const initialLeft = Math.floor(
    clampFraction(region.left - 0.025) * imageWidth,
  );
  const initialRight = Math.ceil(
    clampFraction(region.right + 0.025) * imageWidth,
  );
  const initialTop = Math.floor(clampFraction(region.top - 0.02) * imageHeight);
  const initialBottom = Math.ceil(
    clampFraction(region.bottom + 0.02) * imageHeight,
  );
  return {
    left: Math.max(0, initialLeft),
    top: Math.max(0, initialTop),
    right: Math.min(imageWidth, initialRight),
    bottom: Math.min(imageHeight, initialBottom),
  };
}

function expandCompletePanelRegion(region) {
  const panelWidth = region.right - region.left;
  const panelHeight = region.bottom - region.top;
  if (panelWidth <= 0 || panelHeight <= 0) return null;

  const horizontalMargin = Math.max(
    PANEL_CROP_HORIZONTAL_IMAGE_MARGIN,
    panelWidth * PANEL_CROP_HORIZONTAL_PANEL_MARGIN,
  );
  const topMargin = Math.max(
    PANEL_CROP_TOP_IMAGE_MARGIN,
    panelHeight * PANEL_CROP_TOP_PANEL_MARGIN,
  );
  const bottomMargin = Math.max(
    PANEL_CROP_BOTTOM_IMAGE_MARGIN,
    panelHeight * PANEL_CROP_BOTTOM_PANEL_MARGIN,
  );
  const expanded = {
    left: region.left - horizontalMargin,
    top: region.top - topMargin,
    right: region.right + horizontalMargin,
    bottom: region.bottom + bottomMargin,
  };

  // Clipping a safety margin means the photograph does not prove that the
  // complete curved/skewed panel continues no farther. Fail back to the full
  // image instead of silently trimming an edge-touching panel.
  if (
    expanded.left < 0 || expanded.top < 0 || expanded.right > 1 ||
    expanded.bottom > 1
  ) {
    return null;
  }

  return {
    ...expanded,
    marginPercent: Math.round(
      Math.max(
        horizontalMargin / panelWidth,
        topMargin / panelHeight,
        bottomMargin / panelHeight,
      ) * 10_000,
    ) / 100,
  };
}

/**
 * Creates a first-pass OpenAI-only crop without resizing or square padding.
 * Azure and any later verifier continue to receive the original image.
 *
 * @param {{imageDataUrl: string, regions: Array<Record<string, any>>}} options
 */
export async function buildOpenAiPanelCropDataUrl({ imageDataUrl, regions }) {
  try {
    const match = /^data:image\/(?:jpeg|jpg);base64,([a-z0-9+/=\s]+)$/iu.exec(
      typeof imageDataUrl === "string" ? imageDataUrl.trim() : "",
    );
    const selectedRegions = Array.isArray(regions) ? regions : [];
    if (!match) {
      return { dataUrl: null, fallbackReason: "unsupported_image" };
    }
    if (!selectedRegions.length) {
      return { dataUrl: null, fallbackReason: "panel_geometry_missing" };
    }

    const sourceBytes = decodeBase64(match[1].replace(/\s+/gu, ""));
    const encodedDimensions = readJpegDimensions(sourceBytes);
    if (
      !encodedDimensions ||
      encodedDimensions.width * encodedDimensions.height > MAX_JPEG_PIXELS
    ) {
      return { dataUrl: null, fallbackReason: "invalid_image_dimensions" };
    }
    const mergedRegion = mergeRegions(selectedRegions);
    if (!mergedRegion) {
      return { dataUrl: null, fallbackReason: "panel_spans_multiple_pages" };
    }
    const expandedRegion = expandCompletePanelRegion(mergedRegion);
    if (!expandedRegion) {
      return {
        dataUrl: null,
        fallbackReason: "expanded_panel_bounds_touch_image_edge",
      };
    }

    await ensureImageMagickInitialized();
    const readSettings = new MagickReadSettings();
    readSettings.format = MagickFormat.Jpeg;
    /** @type {{left: number, top: number, right: number, bottom: number, area: number} | null} */
    let normalizedBounds = null;
    let sourceWidth = 0;
    let sourceHeight = 0;
    const encoded = ImageMagick.read(sourceBytes, readSettings, (image) => {
      image.autoOrient();
      if (
        !Number.isFinite(image.width) || !Number.isFinite(image.height) ||
        image.width <= 0 || image.height <= 0 ||
        image.width * image.height > MAX_JPEG_PIXELS
      ) {
        return null;
      }
      sourceWidth = image.width;
      sourceHeight = image.height;
      const crop = {
        left: Math.floor(expandedRegion.left * image.width),
        top: Math.floor(expandedRegion.top * image.height),
        right: Math.ceil(expandedRegion.right * image.width),
        bottom: Math.ceil(expandedRegion.bottom * image.height),
      };
      const cropWidth = crop.right - crop.left;
      const cropHeight = crop.bottom - crop.top;
      if (cropWidth <= 0 || cropHeight <= 0) return null;
      normalizedBounds = {
        left: crop.left / image.width,
        top: crop.top / image.height,
        right: crop.right / image.width,
        bottom: crop.bottom / image.height,
        area: (cropWidth * cropHeight) / (image.width * image.height),
      };

      image.crop(
        new MagickGeometry(crop.left, crop.top, cropWidth, cropHeight),
      );
      image.resetPage();
      image.quality = 94;
      return image.write(
        MagickFormat.Jpeg,
        (outputBytes) => new Uint8Array(outputBytes),
      );
    });
    if (!encoded?.length || !normalizedBounds) {
      return { dataUrl: null, fallbackReason: "crop_generation_failed" };
    }

    const outputDimensions = readJpegDimensions(encoded);
    if (!outputDimensions?.width || !outputDimensions?.height) {
      return { dataUrl: null, fallbackReason: "cropped_dimensions_invalid" };
    }
    return {
      dataUrl: `data:image/jpeg;base64,${encodeBase64(encoded)}`,
      fallbackReason: "none",
      width: outputDimensions.width,
      height: outputDimensions.height,
      sourceWidth,
      sourceHeight,
      selectedRegionCount: selectedRegions.length,
      coveragePercent:
        Math.round(normalizedBounds.area * 10_000) / 100,
      marginPercent: expandedRegion.marginPercent,
      normalizedBounds,
    };
  } catch {
    return { dataUrl: null, fallbackReason: "crop_generation_failed" };
  }
}

/**
 * @param {{imageDataUrl: string, regions: Array<Record<string, any>>}} options
 * @returns {Promise<null | {
 *   dataUrl: string,
 *   width: number,
 *   height: number,
 *   segmentCount: number,
 *   selectedRegionCount: number,
 *   normalizedBounds: {
 *     left: number,
 *     top: number,
 *     right: number,
 *     bottom: number,
 *     area: number,
 *   },
 * }>}
 */
export async function buildTargetedJpegDataUrl({ imageDataUrl, regions }) {
  try {
    const match = /^data:image\/(?:jpeg|jpg);base64,([a-z0-9+/=\s]+)$/iu.exec(
      typeof imageDataUrl === "string" ? imageDataUrl.trim() : "",
    );
    const selectedRegions = Array.isArray(regions) ? regions : [];
    if (!match || !selectedRegions.length) return null;

    const sourceBytes = decodeBase64(match[1].replace(/\s+/gu, ""));
    const dimensions = readJpegDimensions(sourceBytes);
    if (
      !dimensions ||
      dimensions.width * dimensions.height > MAX_JPEG_PIXELS
    ) {
      return null;
    }
    const mergedRegion = mergeRegions(selectedRegions);
    if (!mergedRegion) return null;

    await ensureImageMagickInitialized();
    const readSettings = new MagickReadSettings();
    readSettings.format = MagickFormat.Jpeg;
    const decodeScale = Math.min(
      1,
      MAX_TARGET_IMAGE_DIMENSION /
        Math.max(dimensions.width, dimensions.height),
    );
    const decodeWidth = Math.max(1, Math.round(dimensions.width * decodeScale));
    const decodeHeight = Math.max(
      1,
      Math.round(dimensions.height * decodeScale),
    );
    // JPEG decoders can honor this hint during decoding, keeping the temporary
    // pixel buffer safely below the Edge Function memory limit.
    readSettings.setDefine(
      MagickFormat.Jpeg,
      "size",
      `${decodeWidth}x${decodeHeight}`,
    );
    /** @type {{left: number, top: number, right: number, bottom: number, area: number} | null} */
    let normalizedBounds = null;
    const encoded = ImageMagick.read(sourceBytes, readSettings, (image) => {
      image.autoOrient();
      if (
        !Number.isFinite(image.width) ||
        !Number.isFinite(image.height) ||
        image.width * image.height > MAX_JPEG_PIXELS
      ) {
        return null;
      }

      const crop = expandRegion(mergedRegion, image.width, image.height);
      const cropWidth = crop.right - crop.left;
      const cropHeight = crop.bottom - crop.top;
      if (cropWidth <= 0 || cropHeight <= 0) return null;
      normalizedBounds = {
        left: crop.left / image.width,
        top: crop.top / image.height,
        right: crop.right / image.width,
        bottom: crop.bottom / image.height,
        area: (cropWidth * cropHeight) / (image.width * image.height),
      };

      image.crop(
        new MagickGeometry(crop.left, crop.top, cropWidth, cropHeight),
      );
      image.resetPage();
      const outputScale = Math.min(
        1,
        MAX_TARGET_IMAGE_DIMENSION / Math.max(image.width, image.height),
      );
      if (outputScale < 1) {
        image.resize(
          Math.max(1, Math.round(image.width * outputScale)),
          Math.max(1, Math.round(image.height * outputScale)),
        );
      }
      const squareSize = Math.max(image.width, image.height);
      image.extent(squareSize, squareSize, Gravity.Center, MagickColors.White);
      image.quality = 88;
      return image.write(
        MagickFormat.Jpeg,
        (outputBytes) => new Uint8Array(outputBytes),
      );
    });
    if (!encoded?.length) return null;

    const outputDimensions = readJpegDimensions(encoded);
    if (!outputDimensions || !normalizedBounds) return null;
    return {
      dataUrl: `data:image/jpeg;base64,${encodeBase64(encoded)}`,
      width: outputDimensions.width,
      height: outputDimensions.height,
      segmentCount: 1,
      selectedRegionCount: selectedRegions.length,
      normalizedBounds,
    };
  } catch {
    return null;
  }
}
