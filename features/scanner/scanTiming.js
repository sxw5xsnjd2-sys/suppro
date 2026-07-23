const scanTimingState = new Map();
const MAX_TRACKED_SCANS = 25;

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function pruneOldScans() {
  if (scanTimingState.size <= MAX_TRACKED_SCANS) {
    return;
  }

  const oldestScanId = scanTimingState.keys().next().value;
  if (oldestScanId) {
    scanTimingState.delete(oldestScanId);
  }
}

export function createScanRequestId(scanSessionId) {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return undefined;
  }

  return `scan-${scanSessionId}-${Date.now().toString(36)}`;
}

export function logScanTiming(scanRequestId, stage, details = {}) {
  if (
    typeof __DEV__ === "undefined" ||
    !__DEV__ ||
    !scanRequestId ||
    !stage
  ) {
    return;
  }

  const timestamp = nowMs();
  const current = scanTimingState.get(scanRequestId) ?? {
    startedAt: timestamp,
    previousAt: timestamp,
  };

  console.log("[scanner-timing]", {
    scanRequestId,
    stage,
    elapsedMs: Math.round((timestamp - current.startedAt) * 10) / 10,
    deltaMs: Math.round((timestamp - current.previousAt) * 10) / 10,
    ...details,
  });

  scanTimingState.set(scanRequestId, {
    startedAt: current.startedAt,
    previousAt: timestamp,
  });
  pruneOldScans();
}
