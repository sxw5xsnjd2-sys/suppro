const LATENCY_EVENT_NAME = "latency_timing";
const TRACE_HEADER = "x-trace-id";
const FLOW_HEADER = "x-latency-flow";
const ACTION_HEADER = "x-latency-action";

const SAFE_METADATA_KEYS = new Set([
  "activeExtractedRowCount",
  "activeRowCandidateMapCount",
  "adjacentRowCount",
  "attempt",
  "azureFallbackCharacters",
  "azureLineCharacters",
  "azureTableCharacters",
  "cacheHit",
  "cacheStatus",
  "candidateGeometryCount",
  "completionTokens",
  "createdProduct",
  "cropCoveragePercent",
  "edgeDurationMs",
  "disposition",
  "estimatedAzureFallbackTokens",
  "estimatedAzureLineTokens",
  "estimatedAzureTableTokens",
  "estimatedCropImageTokens",
  "estimatedExistingContextTokens",
  "estimatedFullVerificationImageTokens",
  "estimatedImageTokensAvoided",
  "estimatedIngredientPanelTokens",
  "estimatedInputTokens",
  "estimatedProductFrontTokens",
  "estimatedSchemaTokens",
  "estimatedSystemPromptTokens",
  "estimatedUserInstructionTokens",
  "estimatedVerificationImageTokens",
  "existingContextCharacters",
  "externalEnrichment",
  "extractionStrategy",
  "extractedRowCount",
  "initialHighDetailVisualAudit",
  "initialVisualAuditComplete",
  "initialVisualUnresolvedRegionCount",
  "found",
  "filteredInactiveRowCount",
  "filteredUncertainRowCount",
  "globalConcernTargetabilityReason",
  "globalConcernTargetable",
  "geometryFailureAmbiguousCount",
  "geometryFailureMissingBoundsCount",
  "geometryFailureNoCandidateCount",
  "geometryFailureUnmatchedMissingBoundsCount",
  "httpStatus",
  "hasDose",
  "hasGeometry",
  "inactiveReviewRowCount",
  "invalidDoseRowCount",
  "ingredientCount",
  "ingredientOpenAiHeight",
  "ingredientOpenAiImageMode",
  "ingredientOpenAiWidth",
  "ingredientOriginalHeight",
  "ingredientOriginalWidth",
  "ingredientType",
  "ingredientPanelDetail",
  "ingredientPanelIncluded",
  "incompletenessStateAfterRecovery",
  "incompletenessStateBeforeRecovery",
  "incompletePanelEscalationReason",
  "incompletePanelGlobalReasonAdded",
  "inputMode",
  "inputTextCharacters",
  "masterDatabaseHit",
  "mappedQuestionableRowCount",
  "mappedUnmatchedCandidateCount",
  "lifecyclePhase",
  "lifecycleReconciled",
  "mappingDeterministicEquivalentCount",
  "mappingDirectCount",
  "mappingRecoveredCount",
  "mappingWrappedRowMergeCount",
  "mode",
  "model",
  "modelExtractedRowCount",
  "modelInputRowCount",
  "modelLifecycleRowCount",
  "modelIncompleteGlobalReasonDisposition",
  "ocrCandidateRowCount",
  "ocrUnmatchedAggregateReconciled",
  "pollCount",
  "panelCropCreated",
  "panelCropCoveragePercent",
  "panelCropFallbackReason",
  "panelCropMarginPercent",
  "productFrontDetail",
  "productFrontIncluded",
  "provider",
  "persistenceActiveRowCount",
  "persistenceActiveReconciled",
  "persistenceInputRowCount",
  "persistenceInputReconciled",
  "persistenceRemovedRowCount",
  "promptTokens",
  "promptTokenEstimateDelta",
  "recognitionConfidence",
  "recoveredRetainedRowCount",
  "rejectedRowCount",
  "relatedRowId",
  "reasonCategory",
  "retainedRowCount",
  "recoveredOcrRowCount",
  "reliableGeometryTargeting",
  "resultStatus",
  "rowCount",
  "rowId",
  "schemaCharacters",
  "secondPassRequired",
  "servingRegionCount",
  "servingRegionLocated",
  "servingRegionRequired",
  "source",
  "sourceType",
  "systemPromptCharacters",
  "structuredGeometryAvailable",
  "targetCropArea",
  "targetCropBottom",
  "targetCropLeft",
  "targetCropRight",
  "targetCropTop",
  "targetedFallbackReason",
  "targetedVisualRegionCount",
  "targetedScopeResolved",
  "timeoutMs",
  "totalTokens",
  "verifierPromotedRowCount",
  "verifierRemovedRowCount",
  "unmatchedOcrCandidateRowCount",
  "unresolvedCandidateCount",
  "userInstructionCharacters",
  "userPromptCharacters",
  "questionableRowIndexes",
  "questionableRowCount",
  "questionableRowGeometryCount",
  "verificationReasonDetails",
  "verificationReason",
  "verificationReusedFullVisualInput",
  "verificationRequired",
  "verificationRowCount",
  "verificationRowIndexes",
  "verificationSelectionExpanded",
  "verificationSelectionExpansionReason",
  "verificationSelectionScope",
  "verificationScope",
  "verificationStrategyReason",
  "verificationTriggerDoseMismatch",
  "verificationTriggerLowRecognitionConfidence",
  "verificationTriggerOmittedRowRisk",
  "verificationTriggerUnmatchedCandidates",
  "visualFallbackRequired",
  "visualInputCount",
  "visualPayloadBytes",
  "mergedDuplicateRowCount",
]);

const SENSITIVE_KEY_PATTERN =
  /(api.?key|authorization|base64|body|email|image|label|ocr|photo|secret|text|token|user)/i;
const SAFE_SENSITIVE_IDENTIFIER_METADATA_KEYS = new Set([
  "ingredientOpenAiImageMode",
]);
const SAFE_AGGREGATE_METADATA_KEYS = new Set([
  "completionTokens",
  "estimatedAzureFallbackTokens",
  "estimatedAzureLineTokens",
  "estimatedAzureTableTokens",
  "estimatedCropImageTokens",
  "estimatedExistingContextTokens",
  "estimatedFullVerificationImageTokens",
  "estimatedImageTokensAvoided",
  "estimatedCroppedIngredientTokens",
  "estimatedIngredientTokensAvoided",
  "estimatedIngredientPanelTokens",
  "estimatedOriginalIngredientTokens",
  "estimatedInputTokens",
  "estimatedProductFrontTokens",
  "estimatedSchemaTokens",
  "estimatedSystemPromptTokens",
  "estimatedUserInstructionTokens",
  "estimatedVerificationImageTokens",
  "inputTextCharacters",
  "ocrCandidateRowCount",
  "ocrAmbiguousRowCount",
  "ocrLogicalCandidateCount",
  "ocrMatchedModelRowCount",
  "ocrMergedDuplicateRowCount",
  "ocrRecoveredRowCount",
  "ocrSourceRowCount",
  "ocrUnmatchedRowCount",
  "promptTokens",
  "promptTokenEstimateDelta",
  "recoveredOcrRowCount",
  "targetedVisualRegionCount",
  "totalTokens",
  "totalCandidateCount",
  "unmatchedCandidateGeometryCount",
  "unmatchedOcrCandidateRowCount",
  "unresolvedCandidateCount",
  "userPromptCharacters",
]);
const SAFE_INTEGER_ARRAY_METADATA_KEYS = new Set([
  "questionableRowIndexes",
  "verificationRowIndexes",
]);

function sanitizeIntegerArray(value) {
  if (!Array.isArray(value)) return undefined;
  return Array.from(
    new Set(
      value
        .filter(
          (item) =>
            Number.isInteger(item) && item >= 0 && item <= 1_000,
        )
        .slice(0, 100),
    ),
  );
}

function sanitizeVerificationReasonDetails(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 32).reduce((safe, detail) => {
    if (!detail || typeof detail !== "object") return safe;
    const reason = cleanIdentifier(detail.reason, "", 64);
    const scope = detail.scope === "global" ? "global" : "row_scoped";
    const count = safeFiniteNumber(detail.count);
    const triggerCount = safeFiniteNumber(detail.triggerCount);
    if (!reason || typeof count !== "number") return safe;
    safe.push({
      reason,
      scope,
      count: Math.max(0, Math.floor(count)),
      triggerCount:
        typeof triggerCount === "number"
          ? Math.max(0, Math.floor(triggerCount))
          : 0,
    });
    return safe;
  }, []);
}

function monotonicNow() {
  if (typeof performance !== "undefined" && performance?.now) {
    return performance.now();
  }
  return Date.now();
}

function cleanIdentifier(value, fallback, maximumLength = 96) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._:-]/g, "-");
  return cleaned ? cleaned.slice(0, maximumLength) : fallback;
}

function safeFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return {};

  return Object.entries(metadata).reduce((safe, [key, value]) => {
    if (SAFE_INTEGER_ARRAY_METADATA_KEYS.has(key)) {
      const sanitized = sanitizeIntegerArray(value);
      if (sanitized) safe[key] = sanitized;
      return safe;
    }
    if (key === "verificationReasonDetails") {
      const sanitized = sanitizeVerificationReasonDetails(value);
      if (sanitized) safe[key] = sanitized;
      return safe;
    }
    if (SAFE_AGGREGATE_METADATA_KEYS.has(key)) {
      const number = safeFiniteNumber(value);
      if (typeof number === "number") safe[key] = number;
      return safe;
    }
    if (
      !SAFE_METADATA_KEYS.has(key) ||
      (SENSITIVE_KEY_PATTERN.test(key) &&
        !SAFE_SENSITIVE_IDENTIFIER_METADATA_KEYS.has(key)) ||
      value == null
    ) {
      return safe;
    }

    if (typeof value === "boolean") {
      safe[key] = value;
      return safe;
    }

    if (typeof value === "number") {
      const number = safeFiniteNumber(value);
      if (typeof number === "number") safe[key] = number;
      return safe;
    }

    if (typeof value === "string") {
      safe[key] = cleanIdentifier(value, "unknown", 64);
    }
    return safe;
  }, {});
}

export function emitProductionLatencyEvent(event, log = console.log) {
  log(JSON.stringify(event));
}

function defaultEmit(event) {
  emitProductionLatencyEvent(event);
}

function emitWithoutBlocking(emit, event) {
  try {
    const result = emit(event);
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    // Telemetry must never affect the measured operation.
  }
}

function classifyError(error, suppliedCategory) {
  if (suppliedCategory) {
    return cleanIdentifier(suppliedCategory, "unknown_error", 64);
  }

  const errorName = cleanIdentifier(error?.name, "", 64).toLowerCase();
  const errorCode = cleanIdentifier(error?.code, "", 64).toLowerCase();
  const status = safeFiniteNumber(error?.status ?? error?.statusCode);

  if (
    errorName.includes("timeout") ||
    errorName === "aborterror" ||
    errorCode.includes("timeout")
  ) {
    return "timeout";
  }
  if (status === 401 || status === 403) return "authorization";
  if (status === 408 || status === 504) return "timeout";
  if (typeof status === "number" && status >= 500) return "upstream_server";
  if (typeof status === "number" && status >= 400) return "request_rejected";
  if (errorCode.includes("rate") || errorCode.includes("quota")) {
    return "rate_limit";
  }
  if (errorCode.includes("network") || errorCode.includes("fetch")) {
    return "network_error";
  }
  if (errorCode.includes("validation") || errorCode.includes("invalid")) {
    return "validation_error";
  }
  if (errorCode.includes("not_found")) return "not_found";
  if (errorName === "typeerror") return "network_error";
  if (errorName === "syntaxerror") return "invalid_response";
  if (errorName === "error") return "operation_error";
  return "unknown_error";
}

export function createLatencyTraceId(flow = "operation") {
  const prefix = cleanIdentifier(flow, "operation", 32).toLowerCase();
  try {
    if (typeof crypto !== "undefined" && crypto?.randomUUID) {
      return `${prefix}:${crypto.randomUUID()}`;
    }
  } catch {
    // Fall back to a non-identifying random request ID.
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function createLatencyStartMarker() {
  return Date.now();
}

export function normalizeLatencyTraceId(value, flow = "operation") {
  return cleanIdentifier(value, "", 96) || createLatencyTraceId(flow);
}

export function getLatencyTraceHeaders(trace) {
  const traceId = normalizeLatencyTraceId(trace?.traceId, trace?.flow);
  return {
    [TRACE_HEADER]: traceId,
    [FLOW_HEADER]: cleanIdentifier(trace?.flow, "operation", 64),
    [ACTION_HEADER]: cleanIdentifier(trace?.action, "operation", 64),
  };
}

export function readLatencyTraceContext(headers, defaults = {}) {
  const getHeader = (name) => {
    try {
      return headers?.get?.(name) ?? headers?.[name] ?? headers?.[name.toLowerCase()];
    } catch {
      return undefined;
    }
  };

  const flow = cleanIdentifier(getHeader(FLOW_HEADER), defaults.flow || "operation", 64);
  const action = cleanIdentifier(
    getHeader(ACTION_HEADER),
    defaults.action || "operation",
    64
  );
  return {
    traceId: normalizeLatencyTraceId(getHeader(TRACE_HEADER), flow),
    flow,
    action,
  };
}

export function createLatencyTrace({
  traceId,
  flow = "operation",
  action = "operation",
  emit = defaultEmit,
} = {}) {
  const safeFlow = cleanIdentifier(flow, "operation", 64);
  const safeAction = cleanIdentifier(action, "operation", 64);
  const safeTraceId = normalizeLatencyTraceId(traceId, safeFlow);

  function record(stage, durationMs, details = {}) {
    const success = details.success !== false;
    const errorCategory = success
      ? undefined
      : classifyError(
          details.error ?? { status: details.httpStatus },
          details.errorCategory,
        );
    const event = {
      event: LATENCY_EVENT_NAME,
      traceId: safeTraceId,
      flow: safeFlow,
      action: safeAction,
      stage: cleanIdentifier(stage, "unknown_stage", 96),
      durationMs: Math.max(0, Math.round((safeFiniteNumber(durationMs) || 0) * 10) / 10),
      success,
      ...sanitizeMetadata(details),
    };

    if (!success) {
      event.errorCategory = errorCategory;
      event.timeout = errorCategory === "timeout";
    }

    emitWithoutBlocking(emit, event);
    return event;
  }

  function start(stage, metadata = {}) {
    const startedAt = monotonicNow();
    let finished = false;
    return (details = {}) => {
      if (finished) return undefined;
      finished = true;
      return record(stage, monotonicNow() - startedAt, {
        ...metadata,
        ...details,
      });
    };
  }

  function finishSince(stage, startedAt, details = {}) {
    const numericStartedAt = safeFiniteNumber(startedAt);
    const durationMs =
      typeof numericStartedAt === "number"
        ? Math.max(0, Date.now() - numericStartedAt)
        : 0;
    return record(stage, durationMs, details);
  }

  async function measure(stage, operation, metadata = {}) {
    const finish = start(stage, metadata);
    try {
      const result = await operation();
      finish({ success: true });
      return result;
    } catch (error) {
      finish({ success: false, error });
      throw error;
    }
  }

  return {
    action: safeAction,
    finishSince,
    flow: safeFlow,
    measure,
    record,
    start,
    traceId: safeTraceId,
  };
}

export async function instrumentEdgeRequest(
  request,
  defaults,
  handler,
  { emit } = {}
) {
  const trace = createLatencyTrace({
    ...readLatencyTraceContext(request?.headers, defaults),
    emit,
  });
  const finish = trace.start("edge_function_total");

  try {
    const response = await handler(trace);
    const event = finish({
      success: typeof response?.status !== "number" || response.status < 400,
      httpStatus: response?.status,
      errorCategory:
        typeof response?.status === "number" && response.status >= 400
          ? "edge_response_error"
          : undefined,
    });

    if (typeof Response === "undefined" || !(response instanceof Response)) {
      return response;
    }

    try {
      const headers = new Headers(response.headers);
      headers.set(TRACE_HEADER, trace.traceId);
      headers.set("x-edge-duration-ms", String(event?.durationMs ?? 0));
      headers.append(
        "server-timing",
        `edge;dur=${String(event?.durationMs ?? 0)}`
      );
      return new Response(response.body, {
        headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch {
      return response;
    }
  } catch (error) {
    finish({ success: false, error });
    throw error;
  }
}
