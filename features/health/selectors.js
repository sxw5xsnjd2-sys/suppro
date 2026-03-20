import {
  APPLE_HEALTH_ENTRY_SOURCE,
  MANUAL_ENTRY_SOURCE,
  isAppleHealthSupportedMetric,
} from "./metricDefinitions";

const EMPTY_ENTRIES = [];
const EMPTY_SOURCE_SETTINGS = {};
const ALL_METRICS_CACHE_KEY = "__all__";
const effectiveEntriesCache = new WeakMap();

export function normalizeHealthEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    ...entry,
    source:
      entry.source === APPLE_HEALTH_ENTRY_SOURCE
        ? APPLE_HEALTH_ENTRY_SOURCE
        : MANUAL_ENTRY_SOURCE,
  };
}

export function getMetricSource(state, metricKey) {
  if (!metricKey || !isAppleHealthSupportedMetric(metricKey)) {
    return MANUAL_ENTRY_SOURCE;
  }

  return state?.sourceSettings?.[metricKey] === APPLE_HEALTH_ENTRY_SOURCE
    ? APPLE_HEALTH_ENTRY_SOURCE
    : MANUAL_ENTRY_SOURCE;
}

export function isMetricAppleBacked(state, metricKey) {
  return getMetricSource(state, metricKey) === APPLE_HEALTH_ENTRY_SOURCE;
}

function getCachedEffectiveEntries(entries, sourceSettings, metricKey) {
  let sourceCache = effectiveEntriesCache.get(entries);
  if (!sourceCache) {
    sourceCache = new WeakMap();
    effectiveEntriesCache.set(entries, sourceCache);
  }

  let metricCache = sourceCache.get(sourceSettings);
  if (!metricCache) {
    metricCache = new Map();
    sourceCache.set(sourceSettings, metricCache);
  }

  const cacheKey = metricKey ?? ALL_METRICS_CACHE_KEY;
  if (metricCache.has(cacheKey)) {
    return metricCache.get(cacheKey);
  }

  const normalizedEntries = entries
    .map((entry) => normalizeHealthEntry(entry))
    .filter(Boolean);

  const result = normalizedEntries.filter((entry) => {
    if (metricKey && entry.type !== metricKey) return false;

    const metricSource = getMetricSource({ sourceSettings }, entry.type);

    if (metricSource === APPLE_HEALTH_ENTRY_SOURCE) {
      return entry.source === APPLE_HEALTH_ENTRY_SOURCE;
    }

    return entry.source !== APPLE_HEALTH_ENTRY_SOURCE;
  });

  metricCache.set(cacheKey, result);
  return result;
}

export function getEffectiveEntries(state, metricKey) {
  const entries = Array.isArray(state?.entries) ? state.entries : EMPTY_ENTRIES;
  const sourceSettings =
    state?.sourceSettings && typeof state.sourceSettings === "object"
      ? state.sourceSettings
      : EMPTY_SOURCE_SETTINGS;

  return getCachedEffectiveEntries(entries, sourceSettings, metricKey);
}
