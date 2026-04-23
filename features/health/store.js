import { create } from "zustand";
import { persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  APPLE_HEALTH_ENTRY_SOURCE,
  APPLE_HEALTH_SUPPORTED_METRIC_KEYS,
  DEFAULT_METRICS,
  MANUAL_ENTRY_SOURCE,
  PRESET_METRICS_BY_KEY,
  normalizeMetric,
} from "./metricDefinitions";
import { normalizeHealthEntry } from "./selectors";

const HEALTH_STORE_VERSION = 2;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeConnection(value) {
  return ["disconnected", "connecting", "connected", "error"].includes(value)
    ? value
    : "disconnected";
}

function normalizeSourceSettings(input) {
  const next = {};

  Object.entries(isPlainObject(input) ? input : {}).forEach(([metricKey, source]) => {
    if (
      APPLE_HEALTH_SUPPORTED_METRIC_KEYS.includes(metricKey) &&
      source === APPLE_HEALTH_ENTRY_SOURCE
    ) {
      next[metricKey] = APPLE_HEALTH_ENTRY_SOURCE;
    }
  });

  return next;
}

function normalizeStoredEntry(entry) {
  const normalized = normalizeHealthEntry(entry);
  if (!normalized?.type || typeof normalized.date !== "string") return null;

  return {
    ...normalized,
    id:
      normalized.id ||
      normalized.externalId ||
      `${normalized.type}:${normalized.date}:${Math.random().toString(16).slice(2)}`,
  };
}

function uniqueEntries(entries) {
  const deduped = new Map();
  const sourceEntries = Array.isArray(entries) ? entries : [];

  sourceEntries.forEach((entry) => {
    const normalized = normalizeStoredEntry(entry);
    if (!normalized) return;

    const key = [
      normalized.source,
      normalized.type,
      normalized.date,
      normalized.externalId || normalized.id,
    ].join(":");

    deduped.set(key, normalized);
  });

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.date === b.date) {
      return String(a.id).localeCompare(String(b.id));
    }
    return a.date.localeCompare(b.date);
  });
}

function normalizeMetrics(metrics) {
  const baseMetrics = Array.isArray(metrics) && metrics.length ? metrics : DEFAULT_METRICS;
  const nextByKey = new Map();

  baseMetrics.forEach((metric) => {
    const normalized = normalizeMetric(metric);
    if (!normalized?.key) return;
    nextByKey.set(normalized.key, normalized);
  });

  return Array.from(nextByKey.values());
}

function enablePresetMetrics(metrics, metricKeys) {
  const nextByKey = new Map();

  normalizeMetrics(metrics).forEach((metric) => {
    nextByKey.set(metric.key, { ...metric });
  });

  (metricKeys ?? []).forEach((metricKey) => {
    const presetMetric = normalizeMetric(PRESET_METRICS_BY_KEY[metricKey]);
    if (!presetMetric?.key) return;

    const existing = nextByKey.get(metricKey);
    nextByKey.set(metricKey, {
      ...(existing || presetMetric),
      ...presetMetric,
      enabled: true,
    });
  });

  return Array.from(nextByKey.values());
}

function buildInitialState() {
  return {
    entries: [],
    metrics: DEFAULT_METRICS.map((metric) => ({ ...metric })),
    connection: "disconnected",
    connectionError: "",
    sourceSettings: {},
    lastSyncedAt: null,
  };
}

function migrateHealthState(persistedState) {
  const baseState = buildInitialState();
  const nextState = isPlainObject(persistedState)
    ? persistedState
    : {};

  return {
    ...baseState,
    entries: uniqueEntries(nextState.entries),
    metrics: normalizeMetrics(nextState.metrics),
    connection: normalizeConnection(nextState.connection),
    connectionError:
      typeof nextState.connectionError === "string"
        ? nextState.connectionError
        : "",
    sourceSettings: normalizeSourceSettings(nextState.sourceSettings),
    lastSyncedAt:
      typeof nextState.lastSyncedAt === "string" ? nextState.lastSyncedAt : null,
  };
}

function addManualEntry(entries, entry) {
  const nextEntry = normalizeStoredEntry({
    ...(isPlainObject(entry) ? entry : {}),
    source: MANUAL_ENTRY_SOURCE,
  });
  if (!nextEntry) return uniqueEntries(entries);
  return uniqueEntries([...(entries ?? []), nextEntry]);
}

function mergeAppleHealthEntries(state, payload) {
  const syncedMetricKeys = Array.isArray(payload?.syncedMetricKeys)
    ? payload.syncedMetricKeys.filter(Boolean)
    : [];

  const dateThreshold =
    typeof payload?.sinceDate === "string" ? payload.sinceDate : null;
  const nextAppleEntries = (Array.isArray(payload?.entries) ? payload.entries : []).map((entry) => ({
    ...(isPlainObject(entry) ? entry : {}),
    source: APPLE_HEALTH_ENTRY_SOURCE,
    syncedAt: payload?.syncedAt || entry?.syncedAt || null,
  }));

  const syncedMetricKeySet = new Set(syncedMetricKeys);

  const preservedEntries = (Array.isArray(state.entries) ? state.entries : []).filter((entry) => {
    const normalized = normalizeStoredEntry(entry);
    if (!normalized) return false;

    const isSyncedMetric = syncedMetricKeySet.has(normalized.type);
    const isAppleEntry = normalized.source === APPLE_HEALTH_ENTRY_SOURCE;
    const isWithinWindow = !dateThreshold || normalized.date >= dateThreshold;

    return !(isSyncedMetric && isAppleEntry && isWithinWindow);
  });

  const nextSourceSettings = isPlainObject(state.sourceSettings)
    ? { ...state.sourceSettings }
    : {};

  syncedMetricKeys.forEach((metricKey) => {
    nextSourceSettings[metricKey] = APPLE_HEALTH_ENTRY_SOURCE;
  });

  return {
    entries: uniqueEntries([...preservedEntries, ...nextAppleEntries]),
    metrics: enablePresetMetrics(state.metrics, syncedMetricKeys),
    sourceSettings: normalizeSourceSettings(nextSourceSettings),
    connection: "connected",
    connectionError: "",
    lastSyncedAt:
      typeof payload?.syncedAt === "string" ? payload.syncedAt : state.lastSyncedAt,
  };
}

function sanitizeHealthStoreValue(parsed) {
  if (!isPlainObject(parsed) || !isPlainObject(parsed.state)) return null;

  const state = {
    entries: Array.isArray(parsed.state.entries) ? parsed.state.entries : [],
    metrics: Array.isArray(parsed.state.metrics) ? parsed.state.metrics : DEFAULT_METRICS,
    connection: normalizeConnection(parsed.state.connection),
    connectionError:
      typeof parsed.state.connectionError === "string"
        ? parsed.state.connectionError
        : "",
    sourceSettings: isPlainObject(parsed.state.sourceSettings)
      ? parsed.state.sourceSettings
      : {},
    lastSyncedAt:
      typeof parsed.state.lastSyncedAt === "string"
        ? parsed.state.lastSyncedAt
        : null,
  };

  const value = { state };
  if (typeof parsed.version === "number") {
    value.version = parsed.version;
  }
  return value;
}

const safeHealthStorage = {
  getItem: async (key) => {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      return sanitizeHealthStoreValue(JSON.parse(raw));
    } catch (error) {
      console.error("Failed to load health store", error);
      return null;
    }
  },
  setItem: async (key, value) => {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  removeItem: async (key) => {
    await AsyncStorage.removeItem(key);
  },
};

export const useHealthStore = create()(
  persist(
    (set) => ({
      ...buildInitialState(),

      addEntry: (entry) =>
        set((state) => ({
          entries: addManualEntry(state.entries, entry),
        })),

      deleteEntry: (id) =>
        set((state) => ({
          entries: (state.entries ?? []).filter((entry) => entry.id !== id),
        })),

      addMetric: (metric) =>
        set((state) => {
          const normalized = normalizeMetric(metric);
          if (!normalized?.key) return state;

          const exists = (state.metrics ?? []).some(
            (item) => item.key === normalized.key
          );

          if (exists) {
            return {
              metrics: (state.metrics ?? []).map((item) =>
                item.key === normalized.key
                  ? { ...item, ...normalized, enabled: true }
                  : item
              ),
            };
          }

          return {
            metrics: [...(state.metrics ?? []), normalized],
          };
        }),

      enableMetric: (key) =>
        set((state) => ({
          metrics: (state.metrics ?? []).map((metric) =>
            metric.key === key ? { ...metric, enabled: true } : metric
          ),
        })),

      deleteMetric: (key) =>
        set((state) => {
          const nextSourceSettings = isPlainObject(state.sourceSettings)
            ? { ...state.sourceSettings }
            : {};
          delete nextSourceSettings[key];

          return {
            metrics: (state.metrics ?? []).filter((metric) => metric.key !== key),
            entries: (state.entries ?? []).filter((entry) => entry.type !== key),
            sourceSettings: nextSourceSettings,
          };
        }),

      setConnection: (connection, connectionError = "") =>
        set(() => ({
          connection: normalizeConnection(connection),
          connectionError:
            typeof connectionError === "string" ? connectionError : "",
        })),

      mergeAppleHealthEntries: (payload) =>
        set((state) => mergeAppleHealthEntries(state, payload)),

      disconnectAppleHealth: () =>
        set((state) => ({
          connection: "disconnected",
          connectionError: "",
          sourceSettings: {},
          metrics: normalizeMetrics(state.metrics),
        })),
    }),
    {
      name: "health-store",
      version: HEALTH_STORE_VERSION,
      storage: safeHealthStorage,
      migrate: async (persistedState) => migrateHealthState(persistedState),
    }
  )
);
