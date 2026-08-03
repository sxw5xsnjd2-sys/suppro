const hydrationPromises = new Map();
const historyPromises = new Map();
const MAX_CACHED_SCAN_RESULTS = 25;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pruneOldest(cache) {
  if (cache.size <= MAX_CACHED_SCAN_RESULTS) {
    return;
  }

  const oldestKey = cache.keys().next().value;
  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

export function buildScanResultHydrationKey({
  scanRequestId,
  productId,
  scanSessionId,
  resultRevision,
}) {
  const requestKey =
    trimString(scanRequestId) ||
    (Number.isFinite(scanSessionId) ? `session-${scanSessionId}` : "");
  if (!requestKey) {
    return "";
  }

  const normalizedRevision = Number.isFinite(resultRevision)
    ? Math.max(0, Math.trunc(resultRevision))
    : 0;
  const revisionKey =
    normalizedRevision > 0 ? `:revision-${normalizedRevision}` : "";

  return `${requestKey}:${trimString(productId) || "no-product"}${revisionKey}`;
}

export function hydrateScanResultOnce(hydrationKey, hydrate) {
  if (!hydrationKey) {
    return Promise.resolve().then(hydrate);
  }

  const existing = hydrationPromises.get(hydrationKey);
  if (existing) {
    return existing;
  }

  const hydrationPromise = Promise.resolve().then(hydrate);
  hydrationPromises.set(hydrationKey, hydrationPromise);
  pruneOldest(hydrationPromises);
  return hydrationPromise;
}

export function invalidateScanResultHydration(hydrationKey) {
  if (!hydrationKey) {
    return false;
  }

  return hydrationPromises.delete(hydrationKey);
}

export function persistScanResultHistoryOnce(hydrationKey, persist) {
  if (!hydrationKey) {
    return Promise.resolve().then(persist);
  }

  const existing = historyPromises.get(hydrationKey);
  if (existing) {
    return existing;
  }

  const historyPromise = Promise.resolve().then(persist);
  historyPromises.set(hydrationKey, historyPromise);
  pruneOldest(historyPromises);
  return historyPromise;
}

export function applyScanResultIfCurrent({
  hydrationKey,
  currentHydrationKey,
  result,
  apply,
}) {
  if (!hydrationKey || hydrationKey !== currentHydrationKey) {
    return false;
  }

  apply(result);
  return true;
}

export function clearScanResultHydrationCachesForTests() {
  hydrationPromises.clear();
  historyPromises.clear();
}
