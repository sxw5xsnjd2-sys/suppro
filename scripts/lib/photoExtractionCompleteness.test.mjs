import assert from "node:assert/strict";
import test from "node:test";
import jpeg from "jpeg-js";

import {
  areOcrConfusableIngredientNames,
  assessDoseVerificationRequirement,
  assessVerificationPersistenceGate,
  buildOcrLineIngredientCandidateGroups,
  buildOcrLineIngredientRowGroups,
  estimateTileBasedImageTokens,
  executeConditionalDoseVerification,
  getAcceptedImageDoseCorrectionEvidenceRows,
  getAcceptedImageVerifiedEvidenceRows,
  parseStructuredTableIngredientRow,
  recoverImageVerifiedIngredients,
  recoverStructuredTableIngredients,
  selectPhotoExtractionStrategy,
  summarizeIngredientRowLifecycle,
  verifyDoseAgainstWrappedOcr,
} from "../../supabase/functions/_shared/photo-extraction-completeness.js";
import {
  assessPanelCropTokenSavings,
  buildOpenAiPanelCropDataUrl,
  buildTargetedJpegDataUrl,
  extractAzureVisualRowRegions,
  selectCompleteAzurePanelRegions,
  selectTargetedVisualRegions,
  selectVisualVerificationStrategy,
  shouldFallbackToFullVisualVerification,
} from "../../supabase/functions/_shared/targeted-visual-verification.js";

function ingredient(name, dosageValue, dosageUnit = "mg") {
  return {
    raw_name: name,
    canonical_name: name,
    ingredient_type: "active",
    dosage_value: dosageValue,
    dosage_unit: dosageValue === null ? null : dosageUnit,
    dosage_original_text:
      dosageValue === null ? null : `${name} ${dosageValue}${dosageUnit}`,
    chemical_form: null,
    amount_basis: "per_serving",
    dose_confidence: dosageValue === null ? "missing" : "verified",
  };
}

function candidate({
  id,
  text,
  sourceKind = "table_row",
  geometryIds = [id],
  hasGeometry = true,
  mergedFromWrappedLines = false,
}) {
  return {
    candidateId: id,
    text,
    sourceKind,
    geometryCandidateIds: geometryIds,
    geometryRegions: hasGeometry
      ? [{ pageNumber: 1, left: 0.1, top: 0.1, right: 0.9, bottom: 0.2 }]
      : [],
    hasGeometry,
    mergedFromWrappedLines,
    sourceRefs: [],
  };
}

function assessVerification(overrides = {}) {
  return assessDoseVerificationRequirement({
    ingredients: [ingredient("Compound Alpha", 10)],
    ocrText: "Compound Alpha 10 mg",
    tableRowGroups: [["Compound Alpha\t10 mg"]],
    modelPanelComplete: true,
    modelVerificationRequired: false,
    modelVerificationReason: "none",
    ocrReliable: true,
    ...overrides,
  });
}

test("reliable structured OCR uses a text-first extraction with only a low-detail product image", () => {
  assert.deepEqual(
    selectPhotoExtractionStrategy({
      ocrReliable: true,
      hasStructuredTable: true,
    }),
    {
      name: "reliable_ocr_text_first",
      includeIngredientPanelImage: false,
      ingredientPanelImageDetail: "not_included",
      includeProductImage: true,
      productImageDetail: "low",
      visualFallbackRequired: false,
    },
  );
});

test("poor OCR retains high-detail ingredient visual evidence", () => {
  const strategy = selectPhotoExtractionStrategy({
    ocrReliable: false,
    hasStructuredTable: true,
  });

  assert.equal(strategy.name, "visual_fallback");
  assert.equal(strategy.includeIngredientPanelImage, true);
  assert.equal(strategy.ingredientPanelImageDetail, "high");
  assert.equal(strategy.includeProductImage, true);
  assert.equal(strategy.productImageDetail, "low");
  assert.equal(strategy.visualFallbackRequired, true);
});

test("missing structured OCR tables retain high-detail ingredient visual evidence", () => {
  const strategy = selectPhotoExtractionStrategy({
    ocrReliable: true,
    hasStructuredTable: false,
  });

  assert.equal(strategy.name, "visual_fallback");
  assert.equal(strategy.includeIngredientPanelImage, true);
  assert.equal(strategy.ingredientPanelImageDetail, "high");
  assert.equal(strategy.visualFallbackRequired, true);
});

test("unreliable OCR with one unmatched candidate uses bounded visual regions", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_confidence_insufficient", scope: "global" },
      { reason: "possible_omitted_row", scope: "global" },
      { reason: "ocr_dose_mismatch", scope: "row_scoped" },
    ],
    activeRowCount: 19,
    questionableRowCount: 2,
    unmatchedCandidateCount: 1,
    firstExtractionUsedHighDetailIngredientVision: true,
    firstVisualAuditComplete: true,
    firstVisualUnresolvedRegionCount: 1,
  });

  assert.equal(strategy.mode, "targeted_regions");
  assert.equal(strategy.reason, "bounded_visual_uncertainty");
});

test("genuinely widespread visual uncertainty keeps full-panel verification", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_confidence_insufficient", scope: "global" },
      {
        reason: "widespread_ocr_extraction_disagreement",
        scope: "global",
      },
    ],
    activeRowCount: 19,
    questionableRowCount: 10,
    unmatchedCandidateCount: 2,
    firstExtractionUsedHighDetailIngredientVision: true,
  });

  assert.equal(strategy.mode, "full_image");
});

test("low OCR confidence alone is covered explicitly by the first high-detail visual audit", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_confidence_insufficient", scope: "global" },
    ],
    activeRowCount: 19,
    questionableRowCount: 0,
    unmatchedCandidateCount: 0,
    firstExtractionUsedHighDetailIngredientVision: true,
    firstVisualAuditComplete: true,
    firstVisualUnresolvedRegionCount: 0,
  });

  assert.equal(strategy.mode, "first_pass_high_detail");
  assert.equal(
    strategy.reason,
    "low_recognition_confidence_covered_by_visual_audit",
  );
});

test("unresolved dose mismatches still receive targeted visual verification", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_dose_mismatch", scope: "row_scoped" },
    ],
    activeRowCount: 19,
    questionableRowCount: 1,
    unmatchedCandidateCount: 0,
    firstExtractionUsedHighDetailIngredientVision: true,
  });

  assert.equal(strategy.mode, "targeted_regions");
});

test("an unbounded first visual audit keeps global uncertainty fail-closed", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_confidence_insufficient", scope: "global" },
      { reason: "model_incomplete_panel", scope: "global" },
      { reason: "possible_omitted_row", scope: "global" },
    ],
    activeRowCount: 19,
    questionableRowCount: 2,
    unmatchedCandidateCount: 1,
    firstExtractionUsedHighDetailIngredientVision: true,
    firstVisualAuditComplete: false,
    firstVisualUnresolvedRegionCount: 1,
  });

  assert.equal(strategy.mode, "full_image");
  assert.equal(strategy.reason, "first_visual_audit_unbounded");
});

test("reliable OCR with one located unmatched candidate targets its geometry", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "possible_omitted_row", scope: "global" },
      { reason: "model_incomplete_panel", scope: "global" },
    ],
    activeRowCount: 22,
    questionableRowCount: 0,
    unmatchedCandidateCount: 1,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: true,
    mappedQuestionableRowCount: 0,
    mappedUnmatchedCandidateCount: 1,
  });

  assert.equal(strategy.mode, "targeted_regions");
  assert.equal(strategy.reason, "reliable_geometry_bounded_uncertainty");
  assert.equal(strategy.reliableGeometryTargeting, true);
  assert.equal(strategy.globalConcernTargetable, true);
  assert.equal(
    strategy.globalConcernTargetabilityReason,
    "located_omission_candidates_bound_global_concern",
  );
});

test("reliable OCR with several mapped questionable rows targets only bounded uncertainty", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_dose_mismatch", scope: "row_scoped" },
    ],
    activeRowCount: 22,
    questionableRowCount: 5,
    unmatchedCandidateCount: 0,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: true,
    mappedQuestionableRowCount: 5,
    mappedUnmatchedCandidateCount: 0,
  });

  assert.equal(strategy.mode, "targeted_regions");
  assert.equal(strategy.globalConcernTargetabilityReason, "no_global_concern");
});

test("an unlocated omitted-row candidate keeps reliable OCR on the full image", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "possible_omitted_row", scope: "global" },
    ],
    activeRowCount: 22,
    questionableRowCount: 1,
    unmatchedCandidateCount: 1,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: true,
    mappedQuestionableRowCount: 1,
    mappedUnmatchedCandidateCount: 0,
  });

  assert.equal(strategy.mode, "full_image");
  assert.equal(strategy.reason, "unmatched_candidate_geometry_incomplete");
  assert.equal(strategy.globalConcernTargetable, false);
  assert.equal(
    strategy.globalConcernTargetabilityReason,
    "omission_candidate_not_located",
  );
});

test("missing Azure geometry keeps reliable OCR verification full-image", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_dose_mismatch", scope: "row_scoped" },
    ],
    activeRowCount: 22,
    questionableRowCount: 1,
    unmatchedCandidateCount: 0,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: false,
    mappedQuestionableRowCount: 0,
    mappedUnmatchedCandidateCount: 0,
  });

  assert.equal(strategy.mode, "full_image");
  assert.equal(strategy.reason, "structured_geometry_unavailable");
});

test("widespread reliable-OCR disagreement remains full-image", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      {
        reason: "widespread_ocr_extraction_disagreement",
        scope: "global",
      },
    ],
    activeRowCount: 22,
    questionableRowCount: 11,
    unmatchedCandidateCount: 0,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: true,
    mappedQuestionableRowCount: 11,
    mappedUnmatchedCandidateCount: 0,
  });

  assert.equal(strategy.mode, "full_image");
  assert.equal(strategy.globalConcernTargetabilityReason, "widespread_disagreement");
});

test("a global serving-size concern requires located serving geometry", () => {
  const base = {
    required: true,
    reasonDetails: [
      { reason: "serving_size_unclear", scope: "global" },
      { reason: "ocr_dose_mismatch", scope: "row_scoped" },
    ],
    activeRowCount: 22,
    questionableRowCount: 1,
    unmatchedCandidateCount: 0,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: true,
    mappedQuestionableRowCount: 1,
    mappedUnmatchedCandidateCount: 0,
  };

  const unlocated = selectVisualVerificationStrategy({
    ...base,
    servingContextLocated: false,
  });
  assert.equal(unlocated.mode, "full_image");
  assert.equal(
    unlocated.globalConcernTargetabilityReason,
    "serving_context_not_located",
  );

  const located = selectVisualVerificationStrategy({
    ...base,
    servingContextLocated: true,
  });
  assert.equal(located.mode, "targeted_regions");
});

test("low-confidence text-first input cannot use the reliable geometry gate", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_confidence_insufficient", scope: "global" },
    ],
    activeRowCount: 22,
    questionableRowCount: 1,
    unmatchedCandidateCount: 0,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: false,
    structuredGeometryAvailable: true,
    mappedQuestionableRowCount: 1,
    mappedUnmatchedCandidateCount: 0,
  });

  assert.equal(strategy.mode, "full_image");
  assert.equal(strategy.reason, "first_pass_had_no_high_detail_panel");
});

test("too many unmatched candidates preserve full-panel omitted-row protection", () => {
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "possible_omitted_row", scope: "global" },
    ],
    activeRowCount: 19,
    questionableRowCount: 0,
    unmatchedCandidateCount: 4,
    firstExtractionUsedHighDetailIngredientVision: true,
  });

  assert.equal(strategy.mode, "full_image");
});

test("an unresolved targeted scope falls back to full visual verification", () => {
  assert.equal(
    shouldFallbackToFullVisualVerification({
      mode: "targeted_crop",
      scopeResolved: false,
    }),
    true,
  );
  assert.equal(
    shouldFallbackToFullVisualVerification({
      mode: "full_image_targeted_rows",
      scopeResolved: false,
    }),
    true,
  );
  assert.equal(
    shouldFallbackToFullVisualVerification({
      mode: "targeted_crop",
      scopeResolved: true,
    }),
    false,
  );
  assert.equal(
    shouldFallbackToFullVisualVerification({
      mode: "full_image",
      scopeResolved: false,
    }),
    false,
  );
});

test("Azure table polygons select unresolved rows with adjacent context", () => {
  const cell = (rowIndex, columnIndex, content, top, bottom, left, right) => ({
    rowIndex,
    columnIndex,
    content,
    boundingRegions: [
      {
        pageNumber: 1,
        polygon: [left, top, right, top, right, bottom, left, bottom],
      },
    ],
  });
  const regions = extractAzureVisualRowRegions({
    analyzeResult: {
      pages: [{ pageNumber: 1, width: 1000, height: 2000 }],
      tables: [
        {
          cells: [
            cell(0, 0, "Compound Alpha", 200, 280, 100, 700),
            cell(0, 1, "10 mg", 200, 280, 700, 900),
            cell(1, 0, "Compound Beta", 280, 360, 100, 700),
            cell(1, 1, "20 mg", 280, 360, 700, 900),
            cell(2, 0, "Compound Gamma", 360, 440, 100, 700),
            cell(2, 1, "30 mg", 360, 440, 700, 900),
          ],
        },
      ],
    },
  });
  const selection = selectTargetedVisualRegions({
    availableRegions: regions,
    targetRows: ["Compound Beta\t20 mg"],
    includeAdjacentRows: true,
  });

  assert.equal(selection.completeCoverage, true);
  assert.equal(selection.matchedTargetCount, 1);
  assert.equal(selection.mappedQuestionableRowCount, 1);
  assert.equal(selection.adjacentContextRowCount, 2);
  assert.deepEqual(
    selection.regions.map(({ rowIndex }) => rowIndex),
    [1, 0, 2],
  );

  const categorizedSelection = selectTargetedVisualRegions({
    availableRegions: regions,
    questionableRowGroups: [["Compound Beta\t20 mg"]],
    unmatchedRows: ["Compound Gamma\t30 mg"],
    includeAdjacentRows: true,
  });
  assert.equal(categorizedSelection.completeCoverage, true);
  assert.equal(categorizedSelection.mappedQuestionableRowCount, 1);
  assert.equal(categorizedSelection.mappedUnmatchedCandidateCount, 1);
});

test("Azure serving-size line geometry is included only when dose basis needs it", () => {
  const regions = extractAzureVisualRowRegions({
    analyzeResult: {
      pages: [
        {
          pageNumber: 1,
          width: 1000,
          height: 2000,
          lines: [
            {
              content: "Serving size: 2 capsules",
              polygon: [100, 100, 900, 100, 900, 180, 100, 180],
            },
          ],
        },
      ],
      tables: [
        {
          cells: [
            {
              rowIndex: 0,
              columnIndex: 0,
              content: "Compound Alpha 10 mg",
              boundingRegions: [
                {
                  pageNumber: 1,
                  polygon: [100, 300, 900, 300, 900, 380, 100, 380],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const selection = selectTargetedVisualRegions({
    availableRegions: regions,
    questionableRowGroups: [["Compound Alpha 10 mg"]],
    unmatchedRows: [],
    includeAdjacentRows: false,
    includeServingContext: true,
  });

  assert.equal(selection.completeCoverage, true);
  assert.equal(selection.servingContextLocated, true);
  assert.equal(selection.servingContextRegionCount, 1);
  assert.deepEqual(
    selection.regions.map(({ regionType }) => regionType),
    ["table_row", "serving_context"],
  );
});

test("targeted JPEG preparation keeps selected geometry and reduces image tiles", async () => {
  const width = 800;
  const height = 1600;
  const data = Buffer.alloc(width * height * 4, 255);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.floor((index / 4) % width);
    data[index + 1] = 80;
    data[index + 2] = 120;
  }
  const encoded = jpeg.encode({ data, width, height }, 90).data;
  const result = await buildTargetedJpegDataUrl({
    imageDataUrl: `data:image/jpeg;base64,${Buffer.from(encoded).toString("base64")}`,
    regions: [
      {
        pageNumber: 1,
        left: 0.05,
        top: 0.2,
        right: 0.95,
        bottom: 0.3,
      },
    ],
  });

  assert.ok(result);
  assert.equal(result.width <= width, true);
  assert.equal(result.height <= height, true);
  assert.match(result.dataUrl, /^data:image\/jpeg;base64,/u);
  assert.equal(result.normalizedBounds.left >= 0, true);
  assert.equal(result.normalizedBounds.right <= 1, true);
  assert.equal(result.normalizedBounds.top >= 0, true);
  assert.equal(result.normalizedBounds.bottom <= 1, true);
  assert.equal(result.normalizedBounds.area > 0, true);
  assert.equal(result.normalizedBounds.area < 1, true);
  assert.equal(
    estimateTileBasedImageTokens({
      width: result.width,
      height: result.height,
      detail: "high",
      model: "gpt-4o-mini",
    }) <
      estimateTileBasedImageTokens({
        width,
        height,
        detail: "high",
        model: "gpt-4o-mini",
      }),
    true,
  );
});

function buildCompleteAzurePanelFixture({
  width = 800,
  height = 1800,
  tableBounds = { left: 0.15, top: 0.28, right: 0.85, bottom: 0.68 },
  omitCellGeometry = false,
  omitTableGeometry = false,
  tableCount = 1,
} = {}) {
  const polygon = ({ left, top, right, bottom }) => [
    left * width,
    top * height,
    right * width,
    top * height,
    right * width,
    bottom * height,
    left * width,
    bottom * height,
  ];
  const rows = [
    ["Nutrient", "Amount", "% NRV"],
    ["Compound Alpha", "10 mg", "100%"],
    ["Compound Beta", "20 mg", "50%"],
    ["Compound Gamma", "30 mg", "25%"],
  ];
  const rowHeight = (tableBounds.bottom - tableBounds.top) / rows.length;
  const columnWidth = (tableBounds.right - tableBounds.left) / rows[0].length;
  const cells = rows.flatMap((values, rowIndex) =>
    values.map((content, columnIndex) => {
      const cellBounds = {
        left: tableBounds.left + columnIndex * columnWidth,
        top: tableBounds.top + rowIndex * rowHeight,
        right: tableBounds.left + (columnIndex + 1) * columnWidth,
        bottom: tableBounds.top + (rowIndex + 1) * rowHeight,
      };
      return {
        rowIndex,
        columnIndex,
        content,
        boundingRegions:
          omitCellGeometry && rowIndex === rows.length - 1 && columnIndex === 2
            ? []
            : [{ pageNumber: 1, polygon: polygon(cellBounds) }],
      };
    })
  );
  const table = {
    rowCount: rows.length,
    columnCount: rows[0].length,
    cells,
    boundingRegions: omitTableGeometry
      ? []
      : [{ pageNumber: 1, polygon: polygon(tableBounds) }],
  };

  return {
    analyzeResult: {
      pages: [
        {
          pageNumber: 1,
          width,
          height,
          lines: [
            {
              content: "Supplement Facts",
              polygon: polygon({
                left: 0.18,
                top: 0.15,
                right: 0.82,
                bottom: 0.18,
              }),
            },
            {
              content: "Serving size: 2 capsules",
              polygon: polygon({
                left: 0.18,
                top: 0.2,
                right: 0.82,
                bottom: 0.24,
              }),
            },
            {
              content: "Percent reference intake",
              polygon: polygon({
                left: 0.2,
                top: 0.7,
                right: 0.8,
                bottom: 0.73,
              }),
            },
          ],
        },
      ],
      tables: Array.from({ length: tableCount }, () => structuredClone(table)),
    },
  };
}

test("a complete Azure table produces a full-panel crop without downscaling label pixels", async () => {
  const width = 800;
  const height = 1800;
  const fixture = buildCompleteAzurePanelFixture({ width, height });
  const selection = selectCompleteAzurePanelRegions(fixture);

  assert.equal(selection.completeCoverage, true);
  assert.equal(selection.fallbackReason, "none");
  assert.equal(selection.tableRowCount, 4);
  assert.equal(selection.tableColumnCount, 3);
  assert.equal(
    selection.regions.some(({ regionType }) => regionType === "table_bounds"),
    true,
  );
  assert.equal(
    selection.regions.some(({ regionType }) => regionType === "serving_context"),
    true,
  );

  const data = Buffer.alloc(width * height * 4, 245);
  const encoded = jpeg.encode({ data, width, height }, 94).data;
  const crop = await buildOpenAiPanelCropDataUrl({
    imageDataUrl: `data:image/jpeg;base64,${Buffer.from(encoded).toString("base64")}`,
    regions: selection.regions,
  });

  assert.ok(crop.dataUrl);
  assert.equal(crop.fallbackReason, "none");
  assert.equal(crop.sourceWidth, width);
  assert.equal(crop.sourceHeight, height);
  assert.equal(crop.width, 672);
  assert.equal(crop.height, 1_462);
  assert.equal(crop.coveragePercent, 68.23);
  assert.equal(crop.width < width, true);
  assert.equal(crop.height < height, true);
  assert.equal(crop.height > 1_024, true, "the crop must not be resized to 1024px");
  assert.equal(crop.normalizedBounds.top <= 0.15, true, "header remains included");
  assert.equal(crop.normalizedBounds.top <= 0.28, true, "first row remains included");
  assert.equal(crop.normalizedBounds.bottom >= 0.73, true, "last row and footnote remain included");
  assert.equal(crop.normalizedBounds.right >= 0.85, true, "the NRV column remains included");

  const originalTokens = estimateTileBasedImageTokens({
    width,
    height,
    detail: "high",
    model: "gpt-4o-mini",
  });
  const croppedTokens = estimateTileBasedImageTokens({
    width: crop.width,
    height: crop.height,
    detail: "high",
    model: "gpt-4o-mini",
  });
  const tokenSelection = assessPanelCropTokenSavings({
    originalTokens,
    croppedTokens,
  });
  assert.equal(originalTokens, 48_169);
  assert.equal(croppedTokens, 36_835);
  assert.equal(tokenSelection.useCrop, true);
  assert.equal(tokenSelection.tokensAvoided, 11_334);
});

test("incomplete, ambiguous, or missing Azure table geometry fails back to the full image", () => {
  const incomplete = selectCompleteAzurePanelRegions(
    buildCompleteAzurePanelFixture({ omitCellGeometry: true }),
  );
  const missing = selectCompleteAzurePanelRegions(
    buildCompleteAzurePanelFixture({ omitTableGeometry: true }),
  );
  const ambiguous = selectCompleteAzurePanelRegions(
    buildCompleteAzurePanelFixture({ tableCount: 2 }),
  );

  assert.equal(incomplete.completeCoverage, false);
  assert.equal(incomplete.fallbackReason, "incomplete_table_geometry");
  assert.equal(missing.completeCoverage, false);
  assert.equal(missing.fallbackReason, "incomplete_table_geometry");
  assert.equal(ambiguous.completeCoverage, false);
  assert.equal(ambiguous.fallbackReason, "multiple_ambiguous_tables");
});

test("edge-touching panel bounds fail conservatively instead of clipping margins", async () => {
  const width = 600;
  const height = 1200;
  const fixture = buildCompleteAzurePanelFixture({
    width,
    height,
    tableBounds: { left: 0.01, top: 0.28, right: 0.8, bottom: 0.68 },
  });
  const selection = selectCompleteAzurePanelRegions(fixture);
  const data = Buffer.alloc(width * height * 4, 255);
  const encoded = jpeg.encode({ data, width, height }, 90).data;
  const crop = await buildOpenAiPanelCropDataUrl({
    imageDataUrl: `data:image/jpeg;base64,${Buffer.from(encoded).toString("base64")}`,
    regions: selection.regions,
  });

  assert.equal(selection.completeCoverage, true);
  assert.equal(crop.dataUrl, null);
  assert.equal(
    crop.fallbackReason,
    "expanded_panel_bounds_touch_image_edge",
  );
});

test("a crop with no material token reduction is rejected", () => {
  assert.deepEqual(
    assessPanelCropTokenSavings({
      originalTokens: 48_169,
      croppedTokens: 42_502,
    }),
    {
      useCrop: false,
      fallbackReason: "token_savings_not_material",
      tokensAvoided: 0,
    },
  );
});

test("gpt-4o-mini image token estimates match documented low and tiled high detail", () => {
  assert.equal(
    estimateTileBasedImageTokens({
      detail: "low",
      model: "gpt-4o-mini",
    }),
    2_833,
  );
  assert.equal(
    estimateTileBasedImageTokens({
      width: 1_080,
      height: 1_920,
      detail: "high",
      model: "gpt-4o-mini",
    }),
    36_835,
  );
  assert.equal(
    estimateTileBasedImageTokens({
      width: 1_920,
      height: 1_080,
      detail: "high",
      model: "gpt-4o-mini",
    }),
    36_835,
  );
  assert.equal(
    estimateTileBasedImageTokens({
      width: 400,
      height: 600,
      detail: "high",
      model: "gpt-4o-mini",
    }),
    14_167,
    "already-small images must not be upscaled for estimation",
  );
  assert.equal(
    estimateTileBasedImageTokens({
      width: 768,
      height: 1_024,
      detail: "high",
      model: "gpt-4o-mini",
    }),
    25_501,
  );
});

test("high-confidence complete OCR extraction skips a second AI call", async () => {
  const plan = assessVerification();
  let verificationCalls = 0;
  const execution = await executeConditionalDoseVerification({
    plan,
    verify: async () => {
      verificationCalls += 1;
      return { corrections: [] };
    },
  });

  assert.equal(plan.required, false);
  assert.equal(plan.reason, "high_confidence_complete");
  assert.deepEqual(plan.reasons, []);
  assert.deepEqual(plan.reasonDetails, []);
  assert.deepEqual(plan.rowIndexes, []);
  assert.equal(plan.rowCount, 0);
  assert.equal(plan.extractedRowCount, 1);
  assert.equal(plan.ocrCandidateRowCount, 1);
  assert.equal(plan.selectionScope, "none");
  assert.equal(plan.selectionExpanded, false);
  assert.equal(execution.ran, false);
  assert.equal(verificationCalls, 0);
});

test("genuinely incomplete extraction without OCR recovery remains fail-closed", async () => {
  const plan = assessVerification({
    modelPanelComplete: false,
    modelVerificationRequired: true,
    modelVerificationReason: "incomplete_panel",
  });
  let receivedIndexes = [];
  const execution = await executeConditionalDoseVerification({
    plan,
    verify: async (rowIndexes) => {
      receivedIndexes = rowIndexes;
      return { corrections: [] };
    },
  });

  assert.equal(plan.required, true);
  assert.match(plan.reason, /incomplete_panel/u);
  assert.deepEqual(receivedIndexes, [0]);
  assert.equal(execution.ran, true);
  assert.equal(plan.incompletenessStateBeforeRecovery, "unresolved");
  assert.equal(plan.incompletenessStateAfterRecovery, "still_global");
  assert.equal(plan.incompletePanelGlobalReasonAdded, true);
  assert.equal(plan.incompletePanelEscalationReason, "no_rows_recovered");
  assert.equal(
    plan.modelIncompleteGlobalReasonDisposition,
    "retained_global",
  );
});

test("OCR alone cannot resolve model incompleteness by appending a row", () => {
  const modelRows = [
    ingredient("Compound Alpha", 10),
    ingredient("Compound Beta", 20),
  ];
  const ocrRows = [
    "Compound Alpha\t10 mg",
    "Compound Beta\t20 mg",
    "Compound Gamma\t30 mg",
  ];
  const recovered = recoverStructuredTableIngredients({
    ingredients: modelRows,
    tableRowGroups: [ocrRows],
  });
  const plan = assessVerification({
    ingredients: recovered,
    ocrText: ocrRows.join("\n"),
    tableRowGroups: [ocrRows],
    modelPanelComplete: false,
    modelVerificationRequired: true,
    modelVerificationReason: "incomplete_panel",
    recoveredOcrRowCount: recovered.length - modelRows.length,
  });

  assert.equal(recovered.length, 2);
  assert.equal(plan.required, true);
  assert.match(plan.reason, /possible_omitted_row/u);
  assert.equal(plan.recoveredOcrRowCount, 0);
  assert.equal(plan.unmatchedOcrCandidateRowCount, 1);
  assert.equal(
    plan.incompletenessStateAfterRecovery,
    "still_global",
  );
  assert.equal(plan.incompletePanelGlobalReasonAdded, true);
  assert.equal(plan.incompletePanelEscalationReason, "no_rows_recovered");
  assert.equal(
    plan.modelIncompleteGlobalReasonDisposition,
    "retained_global",
  );
});

test("one OCR row left unrecovered keeps full-panel verification fail-closed", () => {
  const modelRows = [
    ingredient("Compound Alpha", 10),
    ingredient("Compound Beta", 20),
  ];
  const ocrRows = [
    "Compound Alpha\t10 mg",
    "Compound Beta\t20 mg",
    "Compound Gamma\t30 mg",
    "Unresolved Complex\t500 mg\tproviding active fraction 125 mg",
  ];
  const recovered = recoverStructuredTableIngredients({
    ingredients: modelRows,
    tableRowGroups: [ocrRows],
  });
  const plan = assessVerification({
    ingredients: recovered,
    ocrText: ocrRows.join("\n"),
    tableRowGroups: [ocrRows],
    modelPanelComplete: false,
    modelVerificationRequired: true,
    modelVerificationReason: "incomplete_panel",
    recoveredOcrRowCount: recovered.length - modelRows.length,
  });

  assert.equal(recovered.length, 2);
  assert.equal(plan.required, true);
  assert.deepEqual(plan.rowIndexes, [0, 1]);
  assert.equal(plan.selectionScope, "global");
  assert.equal(plan.unmatchedOcrCandidateRowCount, 2);
  assert.equal(plan.incompletenessStateAfterRecovery, "still_global");
  assert.equal(
    plan.incompletePanelEscalationReason,
    "no_rows_recovered",
  );
  assert.equal(plan.incompletePanelGlobalReasonAdded, true);
});

test("an unmatched OCR-only row keeps verification global", () => {
  const modelRows = [
    ingredient("Compound Alpha", 10),
    { ...ingredient("Compound Beta", 20), dose_confidence: "ambiguous" },
    ingredient("Compound Gamma", 30),
    ingredient("Compound Delta", 40),
  ];
  const ocrRows = [
    "Compound Alpha\t10 mg",
    "Compound Beta\t20 mg",
    "Compound Gamma\t30 mg",
    "Compound Delta\t40 mg",
    "Compound Epsilon\t50 mg",
  ];
  const recovered = recoverStructuredTableIngredients({
    ingredients: modelRows,
    tableRowGroups: [ocrRows],
  });
  const plan = assessVerification({
    ingredients: recovered,
    ocrText: ocrRows.join("\n"),
    tableRowGroups: [ocrRows],
    modelPanelComplete: false,
    modelVerificationRequired: true,
    modelVerificationReason: "incomplete_panel",
    recoveredOcrRowCount: recovered.length - modelRows.length,
  });

  assert.equal(plan.required, true);
  assert.deepEqual(plan.questionableRowIndexes, [1]);
  assert.deepEqual(plan.rowIndexes, [0, 1, 2, 3]);
  assert.equal(plan.selectionScope, "global");
  assert.equal(plan.selectionExpanded, true);
  assert.equal(
    plan.incompletenessStateAfterRecovery,
    "still_global",
  );
  assert.match(plan.reason, /model_incomplete_panel/u);
});

test("even high-confidence OCR cannot silently append omitted rows", () => {
  const ocrRows = Array.from(
    { length: 24 },
    (_, index) => `Nutrient Row ${index + 1}\t${index + 1} mg`,
  );
  const modelRows = Array.from({ length: 22 }, (_, index) =>
    ingredient(`Nutrient Row ${index + 1}`, index + 1)
  );
  const recovered = recoverStructuredTableIngredients({
    ingredients: modelRows,
    tableRowGroups: [ocrRows],
  });
  const plan = assessVerification({
    ingredients: recovered,
    ocrText: ocrRows.join("\n"),
    tableRowGroups: [ocrRows],
    modelPanelComplete: false,
    modelVerificationRequired: true,
    modelVerificationReason: "possible_omitted_rows",
    recoveredOcrRowCount: recovered.length - modelRows.length,
  });

  assert.equal(recovered.length, 22);
  assert.equal(plan.ocrCandidateRowCount, 24);
  assert.equal(plan.activeExtractedRowCount, 22);
  assert.equal(plan.recoveredOcrRowCount, 0);
  assert.equal(plan.unmatchedOcrCandidateRowCount, 2);
  assert.equal(plan.required, true);
  assert.equal(plan.rowIndexes.length, 22);
  assert.equal(plan.selectionScope, "global");
  assert.equal(
    plan.modelIncompleteGlobalReasonDisposition,
    "retained_global",
  );
});

test("WeightWorld low-confidence OCR variants cannot expand 27 visual rows", () => {
  const trueRows = [
    ["Vitamin C", 84, "mg"],
    ["Magnesium", 56, "mg"],
    ["Potassium", 40.15, "mg"],
    ["Vitamin B3", 16, "mg"],
    ["Iron", 14, "mg"],
    ["Vitamin E", 12, "mg"],
    ["Zinc", 10, "mg"],
    ["Calcium", 8.37, "mg"],
    ["Vitamin B5", 6, "mg"],
    ["Manganese", 2, "mg"],
    ["Vitamin B6", 1.44, "mg"],
    ["Vitamin B2", 1.1, "mg"],
    ["Vitamin B1", 1.1, "mg"],
    ["Copper", 1, "mg"],
    ["Vitamin A", 800, "mcg"],
    ["Sodium", 254, "mcg"],
    ["Vitamin B9", 200, "mcg"],
    ["Iodine", 150, "mcg"],
    ["Selenium", 55, "mcg"],
    ["Vitamin B12", 50, "mcg"],
    ["Vitamin B7", 50, "mcg"],
    ["Chromium", 40, "mcg"],
    ["Boron", 25, "mcg"],
    ["Choline", 150, "mg"],
    ["Molybdenum", 50, "mcg"],
    ["Vitamin D3", 10, "mcg"],
    ["Vitamin K2", 75, "mcg"],
  ].map(([name, value, unit]) => ingredient(name, value, unit));
  const tableRows = [
    ...trueRows.map(
      (row) => `${row.canonical_name}\t${row.dosage_value} ${row.dosage_unit}`,
    ),
    "Sodium las Sodium Chloride)\t2540 g +",
    "Boron fas Boric Acid) Chloride)\t250 g 2",
    "Choline los Choline\t150 g. A",
  ];
  const recovered = recoverStructuredTableIngredients({
    ingredients: trueRows,
    tableRowGroups: [tableRows],
    allowDoseRecovery: false,
  });
  const plan = assessVerification({
    ingredients: recovered,
    ocrText: tableRows.join("\n"),
    tableRowGroups: [tableRows],
    modelExtractedRowCount: 27,
    ocrReliable: false,
  });

  assert.equal(
    selectPhotoExtractionStrategy({
      ocrReliable: false,
      hasStructuredTable: true,
    }).name,
    "visual_fallback",
  );
  assert.equal(recovered.length, 27);
  assert.equal(plan.extractedRowCount, 27);
  assert.equal(plan.recoveredOcrRowCount, 0);
  assert.equal(plan.unmatchedOcrCandidateRowCount, 3);
  assert.equal(plan.required, true);
  assert.equal(
    recovered.some((row) => /\b(?:las|fas|los)\b/u.test(row.raw_name)),
    false,
  );
});

test("an unresolved verifier scope blocks persistence while a resolved scope passes", () => {
  assert.deepEqual(
    assessVerificationPersistenceGate({
      verificationRan: true,
      scopeResolved: false,
    }),
    { allowed: false, reason: "verification_scope_unresolved" },
  );
  assert.deepEqual(
    assessVerificationPersistenceGate({
      verificationRan: true,
      scopeResolved: true,
    }),
    { allowed: true, reason: "verification_scope_resolved" },
  );
  assert.deepEqual(
    assessVerificationPersistenceGate({
      verificationRan: false,
      scopeResolved: false,
    }),
    { allowed: true, reason: "verification_not_required" },
  );
});

test("missing ingredient doses require verification", () => {
  const plan = assessVerification({
    ingredients: [ingredient("Compound Alpha", null)],
    modelVerificationRequired: true,
    modelVerificationReason: "missing_dose",
  });

  assert.equal(plan.required, true);
  assert.match(plan.reason, /missing_dose/u);
  assert.deepEqual(plan.rowIndexes, [0]);
});

test("row-level ambiguity restricts verification to questionable rows", () => {
  const alpha = ingredient("Compound Alpha", 10);
  const beta = {
    ...ingredient("Compound Beta", 20),
    dose_confidence: "ambiguous",
  };
  const plan = assessVerification({
    ingredients: [alpha, beta],
    ocrText: "Compound Alpha 10 mg\nCompound Beta 20 mg",
    tableRowGroups: [
      ["Compound Alpha\t10 mg", "Compound Beta\t20 mg"],
    ],
    modelVerificationRequired: true,
    modelVerificationReason: "ambiguous_dose",
  });

  assert.equal(plan.required, true);
  assert.deepEqual(plan.rowIndexes, [1]);
  assert.equal(plan.rowCount, 1);
});

test("OCR-confusable name disagreement remains on the verification path", () => {
  const plan = assessVerification({
    ocrText: "lngredient Gamma 30 mg",
    tableRowGroups: [["lngredient Gamma\t30 mg"]],
    ingredients: [ingredient("Ingredient Gamma", 30)],
  });

  assert.equal(plan.required, true);
  assert.match(plan.reason, /possible_omitted_row|dose_not_verified/u);
});

test("unclear serving-size interpretation remains on the verification path", () => {
  const plan = assessVerification({
    modelVerificationRequired: true,
    modelVerificationReason: "serving_size_unclear",
  });

  assert.equal(plan.required, true);
  assert.match(plan.reason, /serving_size_unclear/u);
});

test("low-confidence OCR remains on the verification path", () => {
  const plan = assessVerification({ ocrReliable: false });

  assert.equal(plan.required, true);
  assert.match(plan.reason, /ocr_confidence_insufficient/u);
  assert.deepEqual(plan.rowIndexes, [0]);
});

test("multiple quantities in one ingredient row remain on the verification path", () => {
  const plan = assessVerification({
    ocrText: "Compound complex 500 mg providing active fraction 125 mg",
    tableRowGroups: [[
      "Compound complex\t500 mg\tproviding active fraction 125 mg",
    ]],
    ingredients: [ingredient("Compound complex", 500)],
  });

  assert.equal(plan.required, true);
  assert.match(plan.reason, /multiple_quantities/u);
  assert.deepEqual(plan.rowIndexes, [0]);
  assert.deepEqual(plan.reasonDetails, [
    {
      reason: "multiple_quantities",
      scope: "row_scoped",
      count: 1,
      triggerCount: 1,
    },
  ]);
});

test("one OCR dose mismatch sends only the affected row to verification", async () => {
  const plan = assessVerification({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    ocrText: [
      "Compound Alpha 10 mg",
      "Compound Beta 25 mg",
      "Compound Gamma 30 mg",
    ].join("\n"),
    tableRowGroups: [[
      "Compound Alpha\t10 mg",
      "Compound Beta\t25 mg",
      "Compound Gamma\t30 mg",
    ]],
  });

  assert.equal(plan.required, true);
  assert.deepEqual(plan.rowIndexes, [1]);
  assert.equal(plan.rowCount, 1);
  assert.equal(plan.selectionScope, "row_scoped");
  assert.equal(plan.selectionExpanded, false);
  assert.deepEqual(
    plan.reasonDetails.map(({ reason, scope, count }) => ({
      reason,
      scope,
      count,
    })),
    [
      { reason: "ocr_dose_mismatch", scope: "row_scoped", count: 1 },
      {
        reason: "dose_not_verified_against_ocr",
        scope: "row_scoped",
        count: 1,
      },
    ],
  );

  let receivedIndexes = [];
  await executeConditionalDoseVerification({
    plan,
    verify: async (rowIndexes) => {
      receivedIndexes = rowIndexes;
      return { corrections: [] };
    },
  });
  assert.deepEqual(receivedIndexes, [1]);
});

test("several OCR dose mismatches send only their affected rows", async () => {
  const plan = assessVerification({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
      ingredient("Compound Delta", 40),
      ingredient("Compound Epsilon", 50),
    ],
    ocrText: [
      "Compound Alpha 10 mg",
      "Compound Beta 25 mg",
      "Compound Gamma 30 mg",
      "Compound Delta 45 mg",
      "Compound Epsilon 50 mg",
    ].join("\n"),
    tableRowGroups: [[
      "Compound Alpha\t10 mg",
      "Compound Beta\t25 mg",
      "Compound Gamma\t30 mg",
      "Compound Delta\t45 mg",
      "Compound Epsilon\t50 mg",
    ]],
  });

  assert.deepEqual(plan.rowIndexes, [1, 3]);
  assert.equal(plan.rowCount, 2);
  assert.equal(plan.selectionScope, "row_scoped");

  let receivedIndexes = [];
  await executeConditionalDoseVerification({
    plan,
    verify: async (rowIndexes) => {
      receivedIndexes = rowIndexes;
      return { corrections: [] };
    },
  });
  assert.deepEqual(receivedIndexes, [1, 3]);
});

test("two questionable rows in a 22-row panel do not become full-panel verification", () => {
  const ingredients = Array.from({ length: 22 }, (_, index) =>
    ingredient(`Nutrient Row ${index + 1}`, index + 1)
  );
  const ocrRows = ingredients.map((row, index) => {
    if (index === 5) {
      return `${row.canonical_name}\t${row.dosage_value + 1} mg`;
    }
    if (index === 14) {
      return `${row.canonical_name}\t${row.dosage_value + 100} mg\tproviding active fraction ${row.dosage_value} mg`;
    }
    return `${row.canonical_name}\t${row.dosage_value} mg`;
  });
  const plan = assessVerification({
    ingredients,
    ocrText: ocrRows.join("\n"),
    tableRowGroups: [ocrRows],
    modelVerificationRequired: true,
    modelVerificationReason: "multiple_quantities",
  });

  assert.deepEqual(plan.questionableRowIndexes, [5, 14]);
  assert.deepEqual(plan.rowIndexes, [5, 14]);
  assert.equal(plan.rowCount, 2);
  assert.equal(plan.activeExtractedRowCount, 22);
  assert.equal(plan.selectionScope, "row_scoped");
  assert.equal(plan.selectionExpanded, false);
});

test("NRV percentages do not trigger multiple-quantity verification", () => {
  const plan = assessVerification({
    ocrText: "Compound Alpha 10 mg 100% NRV",
    tableRowGroups: [["Compound Alpha\t10 mg\t100% NRV"]],
  });

  assert.equal(plan.required, false);
  assert.equal(plan.reason, "high_confidence_complete");
});

test("duplicate Azure table and line candidates count as one OCR row", () => {
  const plan = assessVerification({
    ocrText: "Compound Alpha 10 mg 100% NRV",
    tableRowGroups: [
      ["Compound Alpha\t10 mg\t100% NRV"],
      ["Compound Alpha 10 mg 100% NRV"],
    ],
  });

  assert.equal(plan.required, false);
  assert.equal(plan.ocrCandidateRowCount, 1);
});

test("unit-equivalent quantities on one row are one dose, not ambiguity", () => {
  const plan = assessVerification({
    ingredients: [ingredient("Compound Alpha", 0.2, "mg")],
    ocrText: "Compound Alpha 0.2 mg 200 µg",
    tableRowGroups: [["Compound Alpha\t0.2 mg\t200 µg"]],
  });

  assert.equal(plan.required, false);
  assert.equal(plan.reason, "high_confidence_complete");
});

test("compound and constituent quantities target only their ingredient row", () => {
  const plan = assessVerification({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound complex", 125),
      ingredient("Compound Gamma", 30),
    ],
    ocrText: [
      "Compound Alpha 10 mg",
      "Compound complex 500 mg providing active fraction 125 mg",
      "Compound Gamma 30 mg",
    ].join("\n"),
    tableRowGroups: [[
      "Compound Alpha\t10 mg",
      "Compound complex\t500 mg\tproviding active fraction 125 mg",
      "Compound Gamma\t30 mg",
    ]],
    modelVerificationRequired: true,
    modelVerificationReason: "multiple_quantities",
  });

  assert.deepEqual(plan.rowIndexes, [1]);
  assert.equal(plan.rowCount, 1);
  assert.equal(plan.selectionScope, "row_scoped");
  assert.equal(plan.selectionExpanded, false);
});

test("unit-equivalent OCR doses compare without verification", () => {
  const twoHundredMicrograms = assessVerification({
    ingredients: [ingredient("Compound Alpha", 200, "mcg")],
    ocrText: "Each tablet\nCompound Alpha 0.2 mg",
    tableRowGroups: [["Compound Alpha\t0.2 mg"]],
  });
  const tenMicrograms = assessVerification({
    ingredients: [ingredient("Compound Alpha", 10, "mcg")],
    ocrText: "per tablet\nCompound Alpha 0.01 mg",
    tableRowGroups: [["Compound Alpha\t0.01 mg"]],
  });

  assert.equal(twoHundredMicrograms.required, false);
  assert.equal(tenMicrograms.required, false);
});

test("wrapped OCR dose rows pass the decision gate", () => {
  const plan = assessVerification({
    ingredients: [ingredient("Compound Alpha", 250)],
    ocrText: "Compound Alpha\n250 mg 100% NRV",
    tableRowGroups: [["Compound Alpha\t250 mg 100% NRV"]],
  });

  assert.equal(plan.required, false);
});

test("genuine omitted-row risk expands verification to the full panel", () => {
  const plan = assessVerification({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    ocrText: [
      "Compound Alpha 10 mg",
      "Compound Beta 20 mg",
      "Compound Gamma 30 mg",
      "Compound Delta 40 mg",
    ].join("\n"),
    tableRowGroups: [[
      "Compound Alpha\t10 mg",
      "Compound Beta\t20 mg",
      "Compound Gamma\t30 mg",
      "Compound Delta\t40 mg",
    ]],
  });

  assert.deepEqual(plan.rowIndexes, [0, 1, 2]);
  assert.deepEqual(plan.questionableRowIndexes, []);
  assert.equal(plan.selectionScope, "global");
  assert.equal(plan.selectionExpanded, true);
  assert.match(plan.selectionExpansionReason, /possible_omitted_row/u);
});

test("genuinely unreliable OCR expands verification to the full panel", () => {
  const plan = assessVerification({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    ocrText: [
      "Compound Alpha 10 mg",
      "Compound Beta 20 mg",
      "Compound Gamma 30 mg",
    ].join("\n"),
    tableRowGroups: [[
      "Compound Alpha\t10 mg",
      "Compound Beta\t20 mg",
      "Compound Gamma\t30 mg",
    ]],
    ocrReliable: false,
  });

  assert.deepEqual(plan.rowIndexes, [0, 1, 2]);
  assert.deepEqual(plan.questionableRowIndexes, []);
  assert.equal(plan.rowCount, 3);
  assert.equal(plan.selectionScope, "global");
  assert.equal(plan.selectionExpanded, true);
});

test("widespread OCR disagreement expands verification to the full panel", () => {
  const ingredients = [
    ingredient("Compound Alpha", 10),
    ingredient("Compound Beta", 20),
    ingredient("Compound Gamma", 30),
    ingredient("Compound Delta", 40),
    ingredient("Compound Epsilon", 50),
    ingredient("Compound Zeta", 60),
  ];
  const plan = assessVerification({
    ingredients,
    ocrText: [
      "Compound Alpha 15 mg",
      "Compound Beta 25 mg",
      "Compound Gamma 35 mg",
      "Compound Delta 40 mg",
      "Compound Epsilon 50 mg",
      "Compound Zeta 60 mg",
    ].join("\n"),
    tableRowGroups: [[
      "Compound Alpha\t15 mg",
      "Compound Beta\t25 mg",
      "Compound Gamma\t35 mg",
      "Compound Delta\t40 mg",
      "Compound Epsilon\t50 mg",
      "Compound Zeta\t60 mg",
    ]],
  });

  assert.deepEqual(plan.rowIndexes, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(plan.questionableRowIndexes, [0, 1, 2]);
  assert.equal(plan.selectionScope, "global");
  assert.equal(plan.selectionExpanded, true);
  assert.match(
    plan.selectionExpansionReason,
    /widespread_ocr_extraction_disagreement/u,
  );
});

test("verification selection is bounded by active extracted rows", () => {
  const plan = assessVerification({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
    ],
    ocrText: "Compound Alpha 10 mg\nCompound Beta 25 mg",
    tableRowGroups: [[
      "Ingredient\tAmount\tNRV",
      "Compound Alpha\t10 mg\t100% NRV",
      "Compound Beta\t25 mg\t100% NRV",
    ]],
  });

  assert.equal(plan.rowCount <= plan.activeExtractedRowCount, true);
  assert.equal(
    plan.rowIndexes.every(
      (index) => index >= 0 && index < plan.extractedRowCount,
    ),
    true,
  );
  assert.equal(plan.ocrCandidateRowCount, 2);
  assert.equal(plan.selectionExpanded, false);
});

test("required verifier failures remain fail-closed", async () => {
  const plan = assessVerification({
    modelVerificationRequired: true,
    modelVerificationReason: "ambiguous_dose",
  });

  await assert.rejects(
    executeConditionalDoseVerification({
      plan,
      verify: async () => {
        throw new Error("verification unavailable");
      },
    }),
    /verification unavailable/u,
  );
});

test("structured table rows are parsed without relying on known ingredient names", () => {
  assert.deepEqual(
    parseStructuredTableIngredientRow("Botanical compound\t12.5 mg\t100% NRV"),
    {
      raw_name: "Botanical compound",
      canonical_name: "Botanical compound",
      ingredient_type: "active",
      dosage_value: 12.5,
      dosage_unit: "mg",
      dosage_original_text: "Botanical compound 12.5 mg 100% NRV",
      chemical_form: null,
      amount_basis: "per_serving",
    },
  );
});

test("a structured row with distinct compound and equivalent doses is not guessed", () => {
  assert.equal(
    parseStructuredTableIngredientRow(
      "Compound complex\t500 mg\tproviding active fraction 125 mg",
    ),
    null,
  );
});

test("structured OCR appends rows only with independent visual authorization", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    tableRowGroups: [
      [
        "Ingredient\tAmount\tNRV",
        "Compound Alpha\t10 mg\t10%",
        "Compound Beta\t20 mg\t20%",
        "Compound Gamma\t30 mg\t30%",
        "Compound Delta\t40 mg\t40%",
        "Compound Epsilon\t50 mg\t50%",
      ],
    ],
    allowNewIngredients: true,
  });

  assert.deepEqual(
    result.map((row) => [row.canonical_name, row.dosage_value, row.dosage_unit]),
    [
      ["Compound Alpha", 10, "mg"],
      ["Compound Beta", 20, "mg"],
      ["Compound Gamma", 30, "mg"],
      ["Compound Delta", 40, "mg"],
      ["Compound Epsilon", 50, "mg"],
    ],
  );
});

test("Azure OCR lines form generic direct and wrapped ingredient row groups", () => {
  assert.deepEqual(
    buildOcrLineIngredientRowGroups([
      "Supplement facts",
      "Compound Alpha 10 mg 10%",
      "Compound Beta",
      "20 mg 20% NRV",
      "Compound Gamma 30",
      "mg 30%",
      "Directions",
    ]),
    [
      [
        "Compound Alpha 10 mg 10%",
        "Compound Beta\t20 mg 20% NRV",
        "Compound Gamma 30 mg 30%",
      ],
    ],
  );
});

test("wrapped OCR candidates retain every contributing geometry identity", () => {
  const groups = buildOcrLineIngredientCandidateGroups([
    {
      candidateId: "line:1:4",
      text: "Compound Alpha",
      geometryCandidateIds: ["line:1:4"],
      geometryRegions: [{ top: 0.2, bottom: 0.24 }],
      hasGeometry: true,
      sourceRefs: [{ sourceKind: "ocr_line", pageNumber: 1, rowIndex: 4 }],
    },
    {
      candidateId: "line:1:5",
      text: "200 mcg",
      geometryCandidateIds: ["line:1:5"],
      geometryRegions: [{ top: 0.24, bottom: 0.28 }],
      hasGeometry: true,
      sourceRefs: [{ sourceKind: "ocr_line", pageNumber: 1, rowIndex: 5 }],
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0][0].mergedFromWrappedLines, true);
  assert.equal(groups[0][0].hasGeometry, true);
  assert.deepEqual(groups[0][0].geometryCandidateIds, [
    "line:1:4",
    "line:1:5",
  ]);
  assert.equal(groups[0][0].geometryRegions.length, 2);
  assert.equal(groups[0][0].sourceRefs.length, 2);
});

test("unit-equivalent deterministic matching retains candidate geometry", () => {
  const row = {
    ...ingredient("Compound Alpha", 0.2, "mg"),
    dose_confidence: "ambiguous",
  };
  const plan = assessVerification({
    ingredients: [row],
    ocrText: "Compound Alpha 200 mcg",
    tableRowGroups: [["Compound Alpha\t200 mcg"]],
    ocrCandidateGroups: [[
      candidate({
        id: "table:0:1",
        text: "Compound Alpha\t200 mcg",
      }),
    ]],
    modelVerificationRequired: true,
    modelVerificationReason: "ambiguous_dose",
    modelExtractedRowCount: 1,
  });

  assert.deepEqual(plan.questionableOcrCandidateIdGroups, [["table:0:1"]]);
  assert.equal(plan.questionableOcrRowWithGeometryCount, 1);
  assert.equal(plan.mappingProvenanceDeterministicEquivalentCount, 1);
});

test("visually authorized recovered rows retain their OCR candidate geometry", () => {
  const initial = [
    ingredient("Compound Alpha", 10),
    ingredient("Compound Beta", 20),
  ];
  const tableRows = [
    "Compound Alpha\t10 mg",
    "Compound Beta\t20 mg",
    "Compound Gamma\t30 mg",
  ];
  const recovered = recoverStructuredTableIngredients({
    ingredients: initial,
    tableRowGroups: [tableRows],
    allowNewIngredients: true,
  });
  const candidates = tableRows.map((text, rowIndex) =>
    candidate({ id: `table:0:${rowIndex}`, text })
  );
  const plan = assessVerification({
    ingredients: recovered,
    ocrText: tableRows.join("\n"),
    tableRowGroups: [tableRows],
    ocrCandidateGroups: [candidates],
    recoveredOcrRowCount: 1,
    modelExtractedRowCount: initial.length,
  });

  assert.equal(plan.activeRowWithOcrCandidateIdCount, 3);
  assert.equal(plan.mappingProvenanceRecoveredCount, 1);
  assert.equal(plan.ocrCandidateWithGeometryCount, 3);
});

test("unmatched OCR candidates retain their source polygon identity", () => {
  const plan = assessVerification({
    ingredients: [ingredient("Compound Alpha", 10)],
    ocrText: "Compound Alpha 10 mg\nCompound Beta 20 mg",
    tableRowGroups: [["Compound Alpha\t10 mg", "Compound Beta\t20 mg"]],
    ocrCandidateGroups: [[
      candidate({ id: "table:0:1", text: "Compound Alpha\t10 mg" }),
      candidate({ id: "table:0:2", text: "Compound Beta\t20 mg" }),
    ]],
  });

  assert.equal(plan.unmatchedOcrCandidateRowCount, 1);
  assert.equal(plan.unmatchedOcrCandidateWithGeometryCount, 1);
  assert.deepEqual(plan.unmatchedOcrCandidateIdGroups, [["table:0:2"]]);
  assert.deepEqual(
    plan.ocrRowLifecycle.find(({ rowId }) => rowId === "table:0:2"),
    {
      rowId: "table:0:2",
      sourceType: "azure_table",
      disposition: "unmatched_ocr",
      hasGeometry: true,
      reasonCategory: "single_quantity",
      relatedRowId: undefined,
    },
  );
});

test("inactive model rows backed by structured OCR cannot silently disappear", () => {
  const ingredients = Array.from({ length: 22 }, (_, index) => ({
    ...ingredient(`Compound ${index}`, index + 1),
    ingredient_type: index >= 19 ? "inactive" : "active",
  }));
  const candidates = ingredients.map((row, index) =>
    candidate({
      id: `table:0:${index}`,
      text: `${row.canonical_name}\t${row.dosage_value} mg`,
    })
  );
  const plan = assessVerification({
    ingredients,
    ocrText: candidates.map(({ text }) => text).join("\n"),
    tableRowGroups: [candidates.map(({ text }) => text)],
    ocrCandidateGroups: [candidates],
    modelExtractedRowCount: 22,
  });

  assert.equal(plan.extractedRowCount, 22);
  assert.equal(plan.activeExtractedRowCount, 19);
  assert.deepEqual(plan.inactiveReviewRowIndexes, [19, 20, 21]);
  assert.deepEqual(plan.questionableRowIndexes, [19, 20, 21]);
  assert.deepEqual(plan.rowIndexes, [19, 20, 21]);
  assert.equal(plan.inactiveReviewRowCount, 3);
  assert.match(plan.reason, /inactive_structured_ocr_candidate/u);
  assert.equal(plan.required, true);
});

test("a 22-to-19 lifecycle ledger requires three explicit dispositions", () => {
  const finalRows = Array.from({ length: 22 }, (_, index) => ({
    rowId: `model:${index}`,
    sourceType: "model_extraction",
    disposition: index < 19 ? "retained" : "filtered_inactive",
  }));
  const ocrRows = Array.from({ length: 24 }, (_, index) => ({
    rowId: `table:0:${index}`,
    sourceType: "azure_table",
    disposition: index < 21 ? "matched_model" : "unmatched_ocr",
  }));
  const summary = summarizeIngredientRowLifecycle({
    modelInputRowCount: 22,
    ocrRows,
    finalRows,
    persistenceInputRowCount: 19,
    persistenceActiveRowCount: 19,
    ocrLogicalCandidateCount: 24,
    unmatchedOcrCandidateRowCount: 3,
  });

  assert.equal(summary.filteredInactiveRowCount, 3);
  assert.equal(summary.persistenceRemovedRowCount, 3);
  assert.equal(summary.retainedRowCount, 19);
  assert.equal(summary.ocrMatchedModelRowCount, 21);
  assert.equal(summary.ocrUnmatchedRowCount, 3);
  assert.equal(summary.ocrUnmatchedAggregateReconciled, true);
  assert.equal(summary.persistenceActiveReconciled, true);
  assert.equal(summary.persistenceInputReconciled, true);
  assert.equal(summary.lifecycleReconciled, true);
});

test("lifecycle reconciliation fails when any aggregate silently loses a row", () => {
  const summary = summarizeIngredientRowLifecycle({
    modelInputRowCount: 2,
    ocrRows: [
      { disposition: "matched_model" },
      { disposition: "unmatched_ocr" },
    ],
    finalRows: [
      { sourceType: "model_extraction", disposition: "retained" },
      { sourceType: "model_extraction", disposition: "filtered_uncertain" },
    ],
    persistenceInputRowCount: 1,
    persistenceActiveRowCount: 1,
    ocrLogicalCandidateCount: 2,
    unmatchedOcrCandidateRowCount: 0,
  });

  assert.equal(summary.ocrUnmatchedAggregateReconciled, false);
  assert.equal(summary.persistenceInputReconciled, false);
  assert.equal(summary.lifecycleReconciled, false);
});

test("niacin-equivalent mg notation remains a verifiable mass dose", () => {
  assert.deepEqual(
    parseStructuredTableIngredientRow("Compound Alpha\t16 mg NE"),
    {
      raw_name: "Compound Alpha",
      canonical_name: "Compound Alpha",
      ingredient_type: "active",
      dosage_value: 16,
      dosage_unit: "mg",
      dosage_original_text: "Compound Alpha 16 mg NE",
      chemical_form: null,
      amount_basis: "per_serving",
    },
  );
  assert.equal(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Compound Alpha",
      rawDosageValue: 16,
      rawDosageUnit: "mg NE",
      dosageOriginalText: "Compound Alpha 16 mg NE",
      ocrText: "Compound Alpha 16 mg NE",
    }).confidence,
    "verified",
  );
});

test("a questionable missing-dose row maps to its stable OCR candidate", () => {
  const plan = assessVerification({
    ingredients: [ingredient("Compound Alpha", null)],
    ocrText: "Compound Alpha 10 mg",
    tableRowGroups: [["Compound Alpha\t10 mg"]],
    ocrCandidateGroups: [[
      candidate({ id: "table:0:1", text: "Compound Alpha\t10 mg" }),
    ]],
  });

  assert.deepEqual(plan.questionableRowIndexes, [0]);
  assert.deepEqual(plan.questionableOcrCandidateIdGroups, [["table:0:1"]]);
  assert.equal(plan.questionableOcrRowWithGeometryCount, 1);
});

test("compound and constituent quantities retain one stable candidate region", () => {
  const plan = assessVerification({
    ingredients: [ingredient("Compound complex", 500)],
    ocrText: "Compound complex 500 mg providing fraction 125 mg",
    tableRowGroups: [[
      "Compound complex\t500 mg\tproviding fraction 125 mg",
    ]],
    ocrCandidateGroups: [[
      candidate({
        id: "table:0:1",
        text: "Compound complex\t500 mg\tproviding fraction 125 mg",
      }),
    ]],
  });

  assert.deepEqual(plan.questionableRowIndexes, [0]);
  assert.deepEqual(plan.questionableOcrCandidateIdGroups, [["table:0:1"]]);
  assert.equal(plan.questionableOcrRowWithGeometryCount, 1);
});

test("distinct compound and constituent rows survive broad-name reconciliation", () => {
  const normalizeOmegaFamily = (value) => {
    const normalized = String(value || "").toLowerCase().trim();
    return ["fish oil", "epa", "dha"].includes(normalized)
      ? "omega 3 fatty acids"
      : normalized;
  };
  const tableRows = [
    "Fish Oil\t1000 mg",
    "EPA\t180 mg",
    "DHA\t120 mg",
  ];
  const recovered = recoverStructuredTableIngredients({
    ingredients: [ingredient("Fish Oil", 1000), ingredient("EPA", 180)],
    tableRowGroups: [tableRows],
    normalizeIngredientName: normalizeOmegaFamily,
    allowNewIngredients: true,
  });
  const candidates = tableRows.map((text, index) =>
    candidate({ id: `table:0:${index}`, text })
  );
  const plan = assessVerification({
    ingredients: recovered,
    ocrText: tableRows.join("\n"),
    tableRowGroups: [tableRows],
    ocrCandidateGroups: [candidates],
    normalizeIngredientName: normalizeOmegaFamily,
    modelExtractedRowCount: 2,
    recoveredOcrRowCount: 1,
  });

  assert.deepEqual(
    recovered.map(({ canonical_name }) => canonical_name),
    ["Fish Oil", "EPA", "DHA"],
  );
  assert.equal(plan.activeRowWithOcrCandidateIdCount, 3);
  assert.equal(plan.ambiguousOcrCandidateAssociationCount, 0);
  assert.equal(plan.mappingProvenanceRecoveredCount, 1);
});

test("stable table identities survive line dedup and locate five concerns plus one omission", () => {
  const questionableIndexes = new Set([0, 5, 18, 19, 20]);
  const ingredients = Array.from({ length: 22 }, (_, index) => ({
    ...ingredient(`Compound ${index}`, index + 1),
    dose_confidence: questionableIndexes.has(index) ? "ambiguous" : "verified",
  }));
  const tableCandidates = ingredients.map((row, index) =>
    candidate({
      id: `table:0:${index}`,
      text: `${row.canonical_name}\t${row.dosage_value} mg`,
    })
  );
  tableCandidates.push(
    candidate({ id: "table:0:22", text: "Omitted compound\t30 mg" }),
  );
  const lineDuplicates = tableCandidates.map((row, index) =>
    candidate({
      id: `line:1:${index}`,
      text: row.text.replace("\t", " "),
      sourceKind: "ocr_line",
    })
  );
  const plan = assessVerification({
    ingredients,
    ocrText: [...tableCandidates, ...lineDuplicates]
      .map(({ text }) => text)
      .join("\n"),
    tableRowGroups: [tableCandidates.map(({ text }) => text)],
    ocrCandidateGroups: [tableCandidates, lineDuplicates],
    modelVerificationRequired: true,
    modelVerificationReason: "ambiguous_dose",
    modelExtractedRowCount: 22,
  });
  const availableRegions = tableCandidates.map((row, index) => ({
    candidateId: row.candidateId,
    regionType: "table_row",
    pageNumber: 1,
    tableIndex: 0,
    rowIndex: index,
    left: 0.1,
    top: 0.1 + index * 0.1,
    right: 0.9,
    bottom: 0.18 + index * 0.1,
  }));
  const selection = selectTargetedVisualRegions({
    availableRegions,
    questionableCandidateIdGroups: plan.questionableOcrCandidateIdGroups,
    unmatchedCandidateIdGroups: plan.unmatchedOcrCandidateIdGroups,
    includeAdjacentRows: true,
  });
  const strategy = selectVisualVerificationStrategy({
    required: plan.required,
    reasonDetails: plan.reasonDetails,
    activeRowCount: plan.activeExtractedRowCount,
    questionableRowCount: plan.questionableRowCount,
    unmatchedCandidateCount: plan.unmatchedOcrCandidateRowCount,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: true,
    mappedQuestionableRowCount: selection.mappedQuestionableRowCount,
    mappedUnmatchedCandidateCount: selection.mappedUnmatchedCandidateCount,
  });

  assert.equal(plan.questionableOcrRowWithGeometryCount, 5);
  assert.deepEqual(plan.questionableRowIndexes, [0, 5, 18, 19, 20]);
  assert.equal(plan.unmatchedOcrCandidateWithGeometryCount, 1);
  assert.equal(selection.mappedQuestionableRowCount, 5);
  assert.equal(selection.mappedUnmatchedCandidateCount, 1);
  assert.equal(strategy.mode, "targeted_regions");
});

test("ambiguous stable candidate association remains full-image", () => {
  const duplicateCandidates = [
    candidate({ id: "table:0:1", text: "Compound Alpha\t10 mg" }),
    candidate({ id: "table:1:1", text: "Compound Alpha\t10 mg" }),
  ];
  const plan = assessVerification({
    ingredients: [ingredient("Compound Alpha", 10)],
    ocrText: "Compound Alpha 10 mg",
    tableRowGroups: [duplicateCandidates.map(({ text }) => text)],
    ocrCandidateGroups: [duplicateCandidates],
  });
  const strategy = selectVisualVerificationStrategy({
    required: plan.required,
    reasonDetails: plan.reasonDetails,
    activeRowCount: plan.activeExtractedRowCount,
    questionableRowCount: plan.questionableRowCount,
    unmatchedCandidateCount: plan.unmatchedOcrCandidateRowCount,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: true,
    mappedQuestionableRowCount: 0,
    mappedUnmatchedCandidateCount: 0,
  });

  assert.equal(plan.ambiguousOcrCandidateAssociationCount, 1);
  assert.match(plan.reason, /ambiguous_ocr_candidate_association/u);
  assert.equal(strategy.mode, "full_image");
});

test("a stable candidate with genuinely missing geometry remains full-image", () => {
  const selection = selectTargetedVisualRegions({
    availableRegions: [],
    questionableCandidateIdGroups: [["table:0:1"]],
    unmatchedCandidateIdGroups: [],
  });
  const strategy = selectVisualVerificationStrategy({
    required: true,
    reasonDetails: [
      { reason: "ocr_dose_mismatch", scope: "row_scoped" },
    ],
    activeRowCount: 22,
    questionableRowCount: 1,
    unmatchedCandidateCount: 0,
    firstExtractionUsedHighDetailIngredientVision: false,
    reliableOcr: true,
    structuredGeometryAvailable: false,
    mappedQuestionableRowCount: selection.mappedQuestionableRowCount,
    mappedUnmatchedCandidateCount: selection.mappedUnmatchedCandidateCount,
  });

  assert.equal(selection.completeCoverage, false);
  assert.equal(selection.mappedQuestionableRowCount, 0);
  assert.equal(strategy.mode, "full_image");
  assert.equal(strategy.reason, "structured_geometry_unavailable");
});

test("structured table completeness fills a missing dose on an existing row", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [
      ingredient("Compound Alpha", null),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    tableRowGroups: [
      [
        "Compound Alpha\t10 mg",
        "Compound Beta\t20 mg",
        "Compound Gamma\t30 mg",
      ],
    ],
  });

  assert.equal(result[0].dosage_value, 10);
  assert.equal(result[0].dosage_unit, "mg");
  assert.equal(result[0].dosage_original_text, "Compound Alpha 10 mg");
});

test("column-ordered OCR names and doses cannot validate a recovery group", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [ingredient("Compound Alpha", 10), ingredient("Compound Beta", 20)],
    tableRowGroups: [
      [
        "Compound Alpha\t30 mg",
        "Compound Beta\t10 mg",
        "Compound Gamma\t20 mg",
      ],
    ],
  });

  assert.deepEqual(result, [
    ingredient("Compound Alpha", 10),
    ingredient("Compound Beta", 20),
  ]);
});

test("unrelated nutrition-style tables are not promoted into ingredients", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [ingredient("Compound Alpha", 10)],
    tableRowGroups: [
      [
        "Nutrient\tAmount",
        "Compound Alpha\t10 mg",
        "Macronutrient One\t15 g",
        "Macronutrient Two\t8 g",
        "Macronutrient Three\t22 g",
        "Macronutrient Four\t3 g",
      ],
    ],
  });

  assert.deepEqual(result, [ingredient("Compound Alpha", 10)]);
});

test("conflicting structured rows remain model-led", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [ingredient("Compound Alpha", 10)],
    tableRowGroups: [
      [
        "Compound Alpha\t10 mg",
        "Compound Beta\t20 mg",
        "Compound Beta\t25 mg",
      ],
    ],
  });

  assert.deepEqual(result, [ingredient("Compound Alpha", 10)]);
});

test("image verification can append a small number of omitted ingredient rows", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    missingIngredients: [
      {
        ...ingredient("Compound Delta", 40),
        dosage_original_text: "Compound Delta 40 mg",
      },
      {
        ...ingredient("Compound Epsilon", 50),
        dosage_original_text: "Compound Epsilon 50 mg",
      },
    ],
  });

  assert.deepEqual(
    result.map((row) => [row.canonical_name, row.dosage_value, row.dosage_unit]),
    [
      ["Compound Alpha", 10, "mg"],
      ["Compound Beta", 20, "mg"],
      ["Compound Gamma", 30, "mg"],
      ["Compound Delta", 40, "mg"],
      ["Compound Epsilon", 50, "mg"],
    ],
  );
});

test("visual missing-row recovery rejects malformed variants of existing physical rows", () => {
  const existing = [
    ingredient("Sodium", 254, "mcg"),
    ingredient("Boron", 25, "mcg"),
    ingredient("Choline", 150, "mg"),
  ];
  const result = recoverImageVerifiedIngredients({
    ingredients: existing,
    missingIngredients: [
      {
        ...ingredient("Sodium las Sodium Chloride)", 2540, "g"),
        dosage_original_text: "Sodium las Sodium Chloride) 2540 g +",
      },
      {
        ...ingredient("Boron fas Boric Acid) Chloride)", 250, "g"),
        dosage_original_text: "Boron fas Boric Acid) Chloride) 250 g 2",
      },
      {
        ...ingredient("Choline los Choline", 150, "g"),
        dosage_original_text: "Choline los Choline 150 g. A",
      },
    ],
  });

  assert.deepEqual(result, existing);
});

test("image completeness rejects a missing row whose declared dose conflicts with its visible row", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [ingredient("Compound Alpha", 10)],
    missingIngredients: [
      {
        ...ingredient("Compound Beta", 20),
        dosage_original_text: "Compound Beta 25 mg",
      },
    ],
  });

  assert.deepEqual(result, [ingredient("Compound Alpha", 10)]);
});

test("image completeness does not accept more missing rows than existing anchors", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [ingredient("Compound Alpha", 10), ingredient("Compound Beta", 20)],
    missingIngredients: [
      ingredient("Compound Gamma", 30),
      ingredient("Compound Delta", 40),
      ingredient("Compound Epsilon", 50),
    ],
  });

  assert.deepEqual(result, [
    ingredient("Compound Alpha", 10),
    ingredient("Compound Beta", 20),
  ]);
});

test("image verification replaces a same-dose OCR-confusable name instead of duplicating it", () => {
  const missingIngredients = [
    {
      ...ingredient("Ingredient Gamma", 30),
      dosage_original_text: "Ingredient Gamma 30 mg",
    },
  ];
  const result = recoverImageVerifiedIngredients({
    ingredients: [
      ingredient("Ingredient Alpha", 10),
      ingredient("Ingredient Beta", 20),
      ingredient("lngredient Gamma", 30),
    ],
    missingIngredients,
  });

  assert.deepEqual(
    result.map((row) => [row.canonical_name, row.dosage_value]),
    [
      ["Ingredient Alpha", 10],
      ["Ingredient Beta", 20],
      ["Ingredient Gamma", 30],
    ],
  );
  assert.deepEqual(
    getAcceptedImageVerifiedEvidenceRows({
      ingredients: result,
      missingIngredients,
    }),
    ["Ingredient Gamma 30 mg"],
  );
});

test("image verification preserves row position when correcting an OCR-confusable name", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [
      ingredient("Ingredient Alpha", 10),
      ingredient("lngredient Gamma", 30),
      ingredient("Ingredient Beta", 20),
    ],
    missingIngredients: [
      {
        ...ingredient("Ingredient Gamma", 30),
        dosage_original_text: "Ingredient Gamma 30 mg",
      },
    ],
  });

  assert.deepEqual(
    result.map(({ canonical_name }) => canonical_name),
    ["Ingredient Alpha", "Ingredient Gamma", "Ingredient Beta"],
  );
});

test("OCR-confusable matching is limited to one visual substitution", () => {
  assert.equal(
    areOcrConfusableIngredientNames("Ingredient Gamma", "lngredient Gamma"),
    true,
  );
  assert.equal(
    areOcrConfusableIngredientNames("Index Compound", "Andex Compound"),
    false,
  );
  assert.equal(
    areOcrConfusableIngredientNames("Silica", "Slllca"),
    false,
  );
});

test("same-dose image corrections can verify an OCR-confusable ingredient row", () => {
  const evidenceRows = getAcceptedImageDoseCorrectionEvidenceRows({
    ingredients: [ingredient("lngredient Gamma", 30)],
    corrections: [
      {
        index: 0,
        dosage_value: 30,
        dosage_unit: "mg",
        dosage_original_text: "Ingredient Gamma 30 mg",
      },
    ],
  });

  assert.deepEqual(
    evidenceRows,
    ["Ingredient Gamma 30 mg"],
  );
  assert.deepEqual(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Ingredient Gamma",
      rawDosageValue: 30,
      rawDosageUnit: "mg",
      dosageOriginalText: "Ingredient Gamma 30 mg",
      ocrText: ["lngredient Gamma 30 mg", ...evidenceRows].join("\n"),
    }),
    { confidence: "verified", reason: null },
  );
});

test("image correction evidence rejects a changed dose or unrelated name", () => {
  const ingredients = [ingredient("lngredient Gamma", 30)];

  assert.deepEqual(
    getAcceptedImageDoseCorrectionEvidenceRows({
      ingredients,
      corrections: [
        {
          index: 0,
          dosage_value: 35,
          dosage_unit: "mg",
          dosage_original_text: "Ingredient Gamma 35 mg",
        },
        {
          index: 0,
          dosage_value: 30,
          dosage_unit: "mg",
          dosage_original_text: "Different Compound 30 mg",
        },
      ],
    }),
    [],
  );
});

test("same-dose names with a non-confusable letter change remain distinct", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Index Compound", 30),
    ],
    missingIngredients: [ingredient("Andex Compound", 30)],
  });

  assert.deepEqual(
    result.map((row) => row.canonical_name),
    [
      "Compound Alpha",
      "Compound Beta",
      "Index Compound",
      "Andex Compound",
    ],
  );
});

test("dose verification accepts a dose-only wrapped continuation", () => {
  assert.deepEqual(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Compound Alpha",
      rawDosageValue: 250,
      rawDosageUnit: "mg",
      dosageOriginalText: "Compound Alpha 250 mg",
      ocrText: "Compound Alpha\n250 mg 100% NRV",
    }),
    { confidence: "verified", reason: null },
  );
});

test("dose verification accepts a generic form continuation before a wrapped dose", () => {
  assert.deepEqual(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Compound Alpha",
      rawDosageValue: 250,
      rawDosageUnit: "mg",
      dosageOriginalText: "Compound Alpha 250 mg",
      ocrText: "Compound Alpha\n(as dried extract)\n250 mg",
    }),
    { confidence: "verified", reason: null },
  );
});

test("dose verification does not borrow a dose from a neighbouring ingredient row", () => {
  assert.deepEqual(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Compound Alpha",
      rawDosageValue: 250,
      rawDosageUnit: "mg",
      dosageOriginalText: "Compound Alpha 250 mg",
      ocrText: "Compound Alpha\nDifferent Compound 250 mg",
    }),
    {
      confidence: "unverified",
      reason: "Extracted dose could not be verified against OCR text",
    },
  );
});
