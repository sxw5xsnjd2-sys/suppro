import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../../src/lib/latencyTelemetry.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  createLatencyTrace,
  emitProductionLatencyEvent,
  getLatencyTraceHeaders,
  instrumentEdgeRequest,
  readLatencyTraceContext,
} = await import(moduleUrl);

test("production timing emitter writes one structured console.log event", () => {
  const messages = [];
  const originalLog = console.log;
  console.log = (message) => messages.push(message);

  try {
    emitProductionLatencyEvent({
      event: "latency_timing",
      traceId: "photo_improvement:production-example",
      flow: "photo_improvement",
      action: "improve_with_photos",
      stage: "authentication",
      durationMs: 12.3,
      success: true,
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(messages.length, 1);
  assert.deepEqual(JSON.parse(messages[0]), {
    event: "latency_timing",
    traceId: "photo_improvement:production-example",
    flow: "photo_improvement",
    action: "improve_with_photos",
    stage: "authentication",
    durationMs: 12.3,
    success: true,
  });
  assert.doesNotMatch(source, /console\.info/u);
});

test("emits successful and failed stage timings with one trace ID", async () => {
  const events = [];
  const trace = createLatencyTrace({
    traceId: "barcode_scan:example-trace",
    flow: "barcode_scan",
    action: "resolve_unknown_barcode",
    emit: (event) => events.push(event),
  });

  await trace.measure("master_database_lookup", async () => ({ id: "product" }), {
    cacheStatus: "hit",
    masterDatabaseHit: true,
  });

  await assert.rejects(
    trace.measure(
      "external_provider",
      async () => {
        const error = new Error("do not emit this upstream response");
        error.name = "AbortError";
        throw error;
      },
      { provider: "go_upc" }
    )
  );

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.traceId),
    ["barcode_scan:example-trace", "barcode_scan:example-trace"]
  );
  assert.equal(events[0].success, true);
  assert.equal(events[0].cacheStatus, "hit");
  assert.equal(events[1].success, false);
  assert.equal(events[1].provider, "go_upc");
  assert.equal(events[1].errorCategory, "timeout");
  assert.equal(events[1].timeout, true);
});

test("telemetry emitter failures never affect the workflow", async () => {
  const expected = { id: "actual-result" };
  const trace = createLatencyTrace({
    emit: () => {
      throw new Error("telemetry unavailable");
    },
  });

  const result = await trace.measure("workflow", async () => expected);
  assert.equal(result, expected);

  const rejectingTrace = createLatencyTrace({
    emit: () => Promise.reject(new Error("async telemetry unavailable")),
  });
  assert.equal(
    await rejectingTrace.measure("workflow", async () => expected),
    expected
  );
});

test("only allowlisted non-sensitive metadata is emitted", () => {
  const events = [];
  const trace = createLatencyTrace({ emit: (event) => events.push(event) });

  trace.record("photo_request", 12, {
    provider: "azure",
    photoBase64: "sensitive-photo",
    ocrText: "sensitive-label",
    authorization: "Bearer secret",
    requestBody: { any: "payload" },
    userPromptCharacters: "sensitive prompt content",
    userId: "user-123",
    token: "secret",
  });

  const serialized = JSON.stringify(events[0]);
  assert.equal(events[0].provider, "azure");
  for (const forbidden of [
    "sensitive-photo",
    "sensitive-label",
    "Bearer secret",
    "user-123",
    '"token"',
    '"requestBody"',
    "sensitive-prompt-content",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("emits safe AI decision and aggregate payload metadata", () => {
  const events = [];
  const trace = createLatencyTrace({ emit: (event) => events.push(event) });

  trace.record("openai_dose_verification_call", 0, {
    activeExtractedRowCount: 22,
    activeRowCandidateMapCount: 21,
    azureFallbackCharacters: 0,
    azureLineCharacters: 812,
    azureTableCharacters: 1450,
    candidateGeometryCount: 22,
    completionTokens: 321,
    cropCoveragePercent: 41.25,
    estimatedAzureFallbackTokens: 0,
    estimatedAzureLineTokens: 203,
    estimatedAzureTableTokens: 363,
    estimatedCropImageTokens: 19837,
    estimatedExistingContextTokens: 12,
    estimatedFullVerificationImageTokens: 36835,
    estimatedImageTokensAvoided: 11334,
    estimatedCroppedIngredientTokens: 36835,
    estimatedIngredientTokensAvoided: 11334,
    estimatedIngredientPanelTokens: 0,
    estimatedOriginalIngredientTokens: 48169,
    estimatedInputTokens: 7311,
    estimatedProductFrontTokens: 2833,
    estimatedSchemaTokens: 1090,
    estimatedSystemPromptTokens: 1720,
    estimatedUserInstructionTokens: 310,
    estimatedVerificationImageTokens: 25501,
    existingContextCharacters: 48,
    extractedRowCount: 24,
    globalConcernTargetabilityReason:
      "located_omission_candidates_bound_global_concern",
    globalConcernTargetable: true,
    geometryFailureAmbiguousCount: 0,
    geometryFailureMissingBoundsCount: 0,
    geometryFailureNoCandidateCount: 0,
    geometryFailureUnmatchedMissingBoundsCount: 0,
    initialHighDetailVisualAudit: true,
    initialVisualAuditComplete: true,
    initialVisualUnresolvedRegionCount: 1,
    extractionStrategy: "reliable_ocr_text_first",
    ingredientPanelDetail: "not_included",
    ingredientPanelIncluded: false,
    ingredientOpenAiHeight: 1336,
    ingredientOpenAiImageMode: "azure_panel_crop",
    ingredientOpenAiWidth: 672,
    ingredientOriginalHeight: 1800,
    ingredientOriginalWidth: 800,
    incompletenessStateBeforeRecovery: "unresolved",
    incompletenessStateAfterRecovery: "resolved_by_ocr_recovery",
    incompletePanelEscalationReason: "not_applicable",
    incompletePanelGlobalReasonAdded: false,
    inputMode: "not_sent",
    inputTextCharacters: 4567,
    model: "gpt-4o-mini",
    modelExtractedRowCount: 22,
    modelIncompleteGlobalReasonDisposition: "cleared_after_ocr_recovery",
    mappedQuestionableRowCount: 5,
    mappedUnmatchedCandidateCount: 1,
    mappingDeterministicEquivalentCount: 2,
    mappingDirectCount: 18,
    mappingRecoveredCount: 1,
    mappingWrappedRowMergeCount: 2,
    ocrCandidateRowCount: 24,
    panelCropCreated: true,
    panelCropCoveragePercent: 62.35,
    panelCropFallbackReason: "none",
    panelCropMarginPercent: 22,
    promptTokens: 1234,
    promptTokenEstimateDelta: 23,
    productFrontDetail: "low",
    productFrontIncluded: true,
    resultStatus: "skipped",
    recoveredOcrRowCount: 2,
    reliableGeometryTargeting: true,
    secondPassRequired: true,
    servingRegionCount: 1,
    servingRegionLocated: true,
    servingRegionRequired: false,
    structuredGeometryAvailable: true,
    targetCropArea: 0.42,
    targetCropBottom: 0.8,
    targetCropLeft: 0.1,
    targetCropRight: 0.9,
    targetCropTop: 0.2,
    adjacentRowCount: 4,
    questionableRowGeometryCount: 5,
    targetedFallbackReason: "none",
    targetedVisualRegionCount: 3,
    targetedScopeResolved: true,
    totalTokens: 1555,
    totalCandidateCount: 23,
    unmatchedCandidateGeometryCount: 1,
    unmatchedOcrCandidateRowCount: 0,
    unresolvedCandidateCount: 1,
    userPromptCharacters: 2500,
    questionableRowCount: 2,
    questionableRowIndexes: [3, 7, 7, -1, "8"],
    verificationReasonDetails: [
      {
        reason: "ocr_dose_mismatch",
        scope: "row_scoped",
        count: 2,
        triggerCount: 2,
        ocrText: "must never be emitted",
      },
    ],
    verificationReason: "high_confidence_complete",
    verificationReusedFullVisualInput: false,
    verificationRequired: false,
    verificationRowCount: 0,
    verificationRowIndexes: [3, 7, 7, -1, "8"],
    verificationSelectionExpanded: false,
    verificationSelectionExpansionReason: "none",
    verificationSelectionScope: "none",
    verificationScope: "targeted_crop",
    verificationStrategyReason: "bounded_visual_uncertainty",
    verificationTriggerDoseMismatch: true,
    verificationTriggerLowRecognitionConfidence: true,
    verificationTriggerOmittedRowRisk: true,
    verificationTriggerUnmatchedCandidates: true,
    visualFallbackRequired: false,
    visualInputCount: 0,
    visualPayloadBytes: 0,
    ocrText: "must never be emitted",
    stableCandidateIds: ["table:0:1"],
    ingredientName: "must never be emitted",
  });

  assert.equal(events[0].activeExtractedRowCount, 22);
  assert.equal(events[0].activeRowCandidateMapCount, 21);
  assert.equal(events[0].extractedRowCount, 24);
  assert.equal(events[0].modelExtractedRowCount, 22);
  assert.equal(events[0].ocrCandidateRowCount, 24);
  assert.equal(events[0].recoveredOcrRowCount, 2);
  assert.equal(events[0].unmatchedOcrCandidateRowCount, 0);
  assert.equal(events[0].unresolvedCandidateCount, 1);
  assert.equal(events[0].estimatedFullVerificationImageTokens, 36835);
  assert.equal(events[0].estimatedCropImageTokens, 19837);
  assert.equal(events[0].estimatedVerificationImageTokens, 25501);
  assert.equal(events[0].estimatedImageTokensAvoided, 11334);
  assert.equal(events[0].estimatedOriginalIngredientTokens, 48169);
  assert.equal(events[0].estimatedCroppedIngredientTokens, 36835);
  assert.equal(events[0].estimatedIngredientTokensAvoided, 11334);
  assert.equal(events[0].ingredientOriginalWidth, 800);
  assert.equal(events[0].ingredientOriginalHeight, 1800);
  assert.equal(events[0].ingredientOpenAiWidth, 672);
  assert.equal(events[0].ingredientOpenAiHeight, 1336);
  assert.equal(events[0].ingredientOpenAiImageMode, "azure_panel_crop");
  assert.equal(events[0].panelCropCreated, true);
  assert.equal(events[0].panelCropCoveragePercent, 62.35);
  assert.equal(events[0].panelCropMarginPercent, 22);
  assert.equal(events[0].panelCropFallbackReason, "none");
  assert.equal(events[0].targetedVisualRegionCount, 3);
  assert.equal(events[0].candidateGeometryCount, 22);
  assert.equal(events[0].totalCandidateCount, 23);
  assert.equal(events[0].questionableRowGeometryCount, 5);
  assert.equal(events[0].unmatchedCandidateGeometryCount, 1);
  assert.equal(events[0].mappingDirectCount, 18);
  assert.equal(events[0].mappingRecoveredCount, 1);
  assert.equal(events[0].mappingWrappedRowMergeCount, 2);
  assert.equal(events[0].mappingDeterministicEquivalentCount, 2);
  assert.equal(events[0].geometryFailureNoCandidateCount, 0);
  assert.equal(events[0].geometryFailureMissingBoundsCount, 0);
  assert.equal(events[0].geometryFailureUnmatchedMissingBoundsCount, 0);
  assert.equal(events[0].geometryFailureAmbiguousCount, 0);
  assert.equal(events[0].cropCoveragePercent, 41.25);
  assert.equal(events[0].targetedFallbackReason, "none");
  assert.equal(events[0].mappedQuestionableRowCount, 5);
  assert.equal(events[0].mappedUnmatchedCandidateCount, 1);
  assert.equal(events[0].adjacentRowCount, 4);
  assert.equal(events[0].reliableGeometryTargeting, true);
  assert.equal(events[0].structuredGeometryAvailable, true);
  assert.equal(events[0].servingRegionCount, 1);
  assert.equal(events[0].servingRegionLocated, true);
  assert.equal(events[0].servingRegionRequired, false);
  assert.equal(events[0].globalConcernTargetable, true);
  assert.equal(
    events[0].globalConcernTargetabilityReason,
    "located_omission_candidates_bound_global_concern",
  );
  assert.equal(events[0].targetCropLeft, 0.1);
  assert.equal(events[0].targetCropTop, 0.2);
  assert.equal(events[0].targetCropRight, 0.9);
  assert.equal(events[0].targetCropBottom, 0.8);
  assert.equal(events[0].targetCropArea, 0.42);
  assert.equal(events[0].targetedScopeResolved, true);
  assert.equal(events[0].initialHighDetailVisualAudit, true);
  assert.equal(events[0].initialVisualAuditComplete, true);
  assert.equal(events[0].initialVisualUnresolvedRegionCount, 1);
  assert.equal(events[0].secondPassRequired, true);
  assert.equal(events[0].incompletenessStateBeforeRecovery, "unresolved");
  assert.equal(
    events[0].incompletenessStateAfterRecovery,
    "resolved_by_ocr_recovery",
  );
  assert.equal(events[0].incompletePanelEscalationReason, "not_applicable");
  assert.equal(events[0].incompletePanelGlobalReasonAdded, false);
  assert.equal(
    events[0].modelIncompleteGlobalReasonDisposition,
    "cleared_after_ocr_recovery",
  );
  assert.equal(events[0].questionableRowCount, 2);
  assert.deepEqual(events[0].questionableRowIndexes, [3, 7]);
  assert.deepEqual(events[0].verificationRowIndexes, [3, 7]);
  assert.deepEqual(events[0].verificationReasonDetails, [
    {
      reason: "ocr_dose_mismatch",
      scope: "row_scoped",
      count: 2,
      triggerCount: 2,
    },
  ]);
  assert.equal(events[0].verificationSelectionExpanded, false);
  assert.equal(events[0].verificationSelectionExpansionReason, "none");
  assert.equal(events[0].verificationSelectionScope, "none");
  assert.equal(events[0].verificationScope, "targeted_crop");
  assert.equal(events[0].verificationReusedFullVisualInput, false);
  assert.equal(events[0].verificationStrategyReason, "bounded_visual_uncertainty");
  assert.equal(events[0].verificationTriggerDoseMismatch, true);
  assert.equal(events[0].verificationTriggerLowRecognitionConfidence, true);
  assert.equal(events[0].verificationTriggerOmittedRowRisk, true);
  assert.equal(events[0].verificationTriggerUnmatchedCandidates, true);
  assert.equal(events[0].extractionStrategy, "reliable_ocr_text_first");
  assert.equal(events[0].ingredientPanelDetail, "not_included");
  assert.equal(events[0].ingredientPanelIncluded, false);
  assert.equal(events[0].productFrontDetail, "low");
  assert.equal(events[0].productFrontIncluded, true);
  assert.equal(events[0].visualFallbackRequired, false);
  assert.equal(events[0].azureTableCharacters, 1450);
  assert.equal(events[0].azureLineCharacters, 812);
  assert.equal(events[0].estimatedIngredientPanelTokens, 0);
  assert.equal(events[0].estimatedProductFrontTokens, 2833);
  assert.equal(events[0].estimatedInputTokens, 7311);
  assert.equal(events[0].userPromptCharacters, 2500);

  assert.deepEqual(
    {
      completionTokens: events[0].completionTokens,
      inputMode: events[0].inputMode,
      inputTextCharacters: events[0].inputTextCharacters,
      model: events[0].model,
      promptTokens: events[0].promptTokens,
      promptTokenEstimateDelta: events[0].promptTokenEstimateDelta,
      resultStatus: events[0].resultStatus,
      totalTokens: events[0].totalTokens,
      verificationReason: events[0].verificationReason,
      verificationRequired: events[0].verificationRequired,
      verificationRowCount: events[0].verificationRowCount,
      visualInputCount: events[0].visualInputCount,
      visualPayloadBytes: events[0].visualPayloadBytes,
    },
    {
      completionTokens: 321,
      inputMode: "not_sent",
      inputTextCharacters: 4567,
      model: "gpt-4o-mini",
      promptTokens: 1234,
      promptTokenEstimateDelta: 23,
      resultStatus: "skipped",
      totalTokens: 1555,
      verificationReason: "high_confidence_complete",
      verificationRequired: false,
      verificationRowCount: 0,
      visualInputCount: 0,
      visualPayloadBytes: 0,
    }
  );
  assert.equal(JSON.stringify(events[0]).includes("must never be emitted"), false);
  assert.equal(JSON.stringify(events[0]).includes("table:0:1"), false);
});

test("emits anonymous row lifecycle IDs and dispositions without row content", () => {
  const events = [];
  const trace = createLatencyTrace({ emit: (event) => events.push(event) });

  trace.record("ingredient_row_lifecycle", 0, {
    disposition: "filtered_inactive",
    hasDose: true,
    hasGeometry: true,
    ingredientType: "inactive",
    lifecyclePhase: "validated_final_set",
    reasonCategory: "model_classification",
    relatedRowId: "model:20",
    rowId: "table:0:20",
    sourceType: "azure_table",
    ingredientName: "must never be emitted",
    ocrText: "must never be emitted",
  });
  trace.record("ingredient_row_lifecycle_summary", 0, {
    filteredInactiveRowCount: 3,
    invalidDoseRowCount: 1,
    lifecycleReconciled: true,
    modelInputRowCount: 22,
    modelLifecycleRowCount: 22,
    ocrLogicalCandidateCount: 24,
    ocrMatchedModelRowCount: 21,
    ocrMergedDuplicateRowCount: 16,
    ocrRecoveredRowCount: 0,
    ocrSourceRowCount: 40,
    ocrUnmatchedAggregateReconciled: true,
    ocrUnmatchedRowCount: 3,
    persistenceActiveRowCount: 19,
    persistenceActiveReconciled: true,
    persistenceInputRowCount: 19,
    persistenceInputReconciled: true,
    persistenceRemovedRowCount: 3,
    recoveredRetainedRowCount: 0,
    rejectedRowCount: 0,
    retainedRowCount: 19,
    unmatchedOcrCandidateRowCount: 3,
    verifierPromotedRowCount: 0,
    verifierRemovedRowCount: 0,
  });

  assert.equal(events[0].rowId, "table:0:20");
  assert.equal(events[0].relatedRowId, "model:20");
  assert.equal(events[0].disposition, "filtered_inactive");
  assert.equal(events[0].sourceType, "azure_table");
  assert.equal(events[1].modelInputRowCount, 22);
  assert.equal(events[1].ocrLogicalCandidateCount, 24);
  assert.equal(events[1].ocrMatchedModelRowCount, 21);
  assert.equal(events[1].persistenceActiveRowCount, 19);
  assert.equal(events[1].persistenceInputReconciled, true);
  assert.equal(events[1].lifecycleReconciled, true);
  assert.equal(JSON.stringify(events).includes("must never be emitted"), false);
});

test("propagates the same safe trace context through headers", () => {
  const headers = new Headers(
    getLatencyTraceHeaders({
      traceId: "external:example-trace",
      flow: "external_product_selection",
      action: "select_external_product",
    })
  );

  assert.deepEqual(readLatencyTraceContext(headers), {
    traceId: "external:example-trace",
    flow: "external_product_selection",
    action: "select_external_product",
  });
});

test("edge request stages and response preserve the incoming trace ID", async () => {
  const events = [];
  const request = {
    headers: new Headers({
      "x-trace-id": "photo_improvement:incoming-example",
      "x-latency-flow": "photo_improvement",
      "x-latency-action": "improve_with_photos",
    }),
  };

  const response = await instrumentEdgeRequest(
    request,
    { flow: "photo_improvement", action: "improve_with_photos" },
    async (trace) => {
      trace.record("authentication", 4.2, {
        provider: "supabase",
        success: true,
      });
      return new Response("{}", { status: 200 });
    },
    { emit: (event) => events.push(event) }
  );

  assert.deepEqual(
    events.map((event) => event.stage),
    ["authentication", "edge_function_total"]
  );
  assert.equal(
    events.every(
      (event) => event.traceId === "photo_improvement:incoming-example"
    ),
    true
  );
  assert.equal(
    response.headers.get("x-trace-id"),
    "photo_improvement:incoming-example"
  );
});

test("edge telemetry failure cannot change a successful response", async () => {
  const response = await instrumentEdgeRequest(
    { headers: new Headers({ "x-trace-id": "photo_improvement:isolated" }) },
    { flow: "photo_improvement", action: "improve_with_photos" },
    async (trace) => {
      trace.record("authentication", 1, { success: true });
      return new Response("workflow-result", { status: 200 });
    },
    {
      emit: () => {
        throw new Error("logging unavailable");
      },
    }
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "workflow-result");
});
