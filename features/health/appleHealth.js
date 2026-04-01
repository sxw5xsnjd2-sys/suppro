import { NativeModules, Platform } from "react-native";
import {
  APPLE_HEALTH_ENTRY_SOURCE,
  APPLE_HEALTH_SUPPORTED_METRIC_KEYS,
} from "./metricDefinitions";

export const APPLE_HEALTH_INITIAL_BACKFILL_DAYS = 180;

function toLocalISODate(dateLike) {
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toISOStringValue(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function addDays(dateLike, amount) {
  const parsed = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  parsed.setDate(parsed.getDate() + amount);
  return parsed;
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function poundsToKg(value) {
  return value * 0.45359237;
}

function getAppleHealthKit() {
  if (Platform.OS !== "ios") return null;

  try {
    const module = require("react-native-health");
    const directNativeModule =
      NativeModules.AppleHealthKit ??
      NativeModules.RCTAppleHealthKit ??
      NativeModules.RNAppleHealthKit ??
      null;

    if (typeof (module?.default ?? module)?.isAvailable === "function") {
      return module?.default ?? module;
    }

    if (directNativeModule) {
      const constants = module?.Constants ?? module?.default?.Constants;
      if (constants && !directNativeModule.Constants) {
        Object.defineProperty(directNativeModule, "Constants", {
          value: constants,
          configurable: true,
          enumerable: false,
          writable: true,
        });
      }

      return directNativeModule;
    }

    return module?.default ?? module;
  } catch {
    return null;
  }
}

function makeUnavailableError() {
  return new Error(
    "Apple Health is only available in an iOS development or production build."
  );
}

function createPermissions(appleHealthKit) {
  const { Permissions } = appleHealthKit.Constants;
  return {
    permissions: {
      read: [
        Permissions.SleepAnalysis,
        Permissions.Weight,
        Permissions.BloodPressureSystolic,
        Permissions.BloodPressureDiastolic,
        Permissions.BloodGlucose,
      ],
      write: [],
    },
  };
}

function callAppleHealthMethod(methodName, options = {}) {
  const appleHealthKit = getAppleHealthKit();
  if (!appleHealthKit || typeof appleHealthKit[methodName] !== "function") {
    return Promise.reject(makeUnavailableError());
  }

  return new Promise((resolve, reject) => {
    appleHealthKit[methodName](options, (error, results) => {
      if (error) {
        reject(
          error instanceof Error ? error : new Error(String(error || methodName))
        );
        return;
      }

      resolve(results);
    });
  });
}

function makeAppleEntry(metricKey, date, value, externalId, syncedAt) {
  return {
    id: `apple_health:${metricKey}:${date}:${externalId}`,
    externalId,
    type: metricKey,
    value,
    date,
    source: APPLE_HEALTH_ENTRY_SOURCE,
    syncedAt,
  };
}

function isSleepStageValue(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return false;
  return normalized !== "INBED" && normalized !== "AWAKE";
}

function normalizeSleepEntries(samples, syncedAt) {
  const entriesByDate = new Map();

  (samples ?? []).forEach((sample) => {
    if (!isSleepStageValue(sample?.value)) return;

    const start = new Date(sample?.startDate);
    const end = new Date(sample?.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    if (end <= start) return;

    const date = toLocalISODate(end);
    if (!date) return;

    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const previous = entriesByDate.get(date) ?? 0;
    entriesByDate.set(date, previous + durationHours);
  });

  return Array.from(entriesByDate.entries()).map(([date, value]) =>
    makeAppleEntry(
      "sleep",
      date,
      roundTo(value, 2),
      `sleep:${date}`,
      syncedAt
    )
  );
}

function latestSampleByDate(samples, metricKey, transformValue, syncedAt) {
  const latestByDate = new Map();

  (samples ?? []).forEach((sample) => {
    const sampleDate = sample?.endDate || sample?.startDate;
    const date = toLocalISODate(sampleDate);
    if (!date) return;

    const timestamp = new Date(sampleDate).getTime();
    if (!Number.isFinite(timestamp)) return;

    const transformedValue = transformValue(sample);
    if (transformedValue == null) return;

    const previous = latestByDate.get(date);
    if (!previous || timestamp >= previous.timestamp) {
      latestByDate.set(date, {
        timestamp,
        sample,
        value: transformedValue,
      });
    }
  });

  return Array.from(latestByDate.entries()).map(([date, payload]) => {
    const rawExternalId =
      payload.sample?.id ||
      payload.sample?.uuid ||
      payload.sample?.startDate ||
      payload.sample?.endDate ||
      `${date}:${JSON.stringify(payload.value)}`;

    return makeAppleEntry(
      metricKey,
      date,
      payload.value,
      `${metricKey}:${rawExternalId}`,
      syncedAt
    );
  });
}

function normalizeWeightEntries(samples, syncedAt) {
  return latestSampleByDate(
    samples,
    "weight",
    (sample) => {
      const numericValue = Number(sample?.value);
      if (!Number.isFinite(numericValue)) return null;
      return roundTo(poundsToKg(numericValue), 1);
    },
    syncedAt
  );
}

function normalizeBloodPressureEntries(samples, syncedAt) {
  return latestSampleByDate(
    samples,
    "blood_pressure_control",
    (sample) => {
      const systolic = Number(sample?.bloodPressureSystolicValue);
      const diastolic = Number(sample?.bloodPressureDiastolicValue);
      if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
        return null;
      }

      return {
        systolic: Math.round(systolic),
        diastolic: Math.round(diastolic),
      };
    },
    syncedAt
  );
}

function normalizeBloodGlucoseEntries(samples, syncedAt) {
  return latestSampleByDate(
    samples,
    "blood_sugar_control",
    (sample) => {
      const numericValue = Number(sample?.value);
      if (!Number.isFinite(numericValue)) return null;
      return roundTo(numericValue, 1);
    },
    syncedAt
  );
}

function getDefaultSinceDate() {
  return addDays(new Date(), -(APPLE_HEALTH_INITIAL_BACKFILL_DAYS - 1));
}

function normalizeSyncRange(since) {
  const startDate = toISOStringValue(since || getDefaultSinceDate());
  if (!startDate) {
    return {
      startDate: getDefaultSinceDate().toISOString(),
      endDate: new Date().toISOString(),
    };
  }

  return {
    startDate,
    endDate: new Date().toISOString(),
  };
}

export async function isAppleHealthAvailable() {
  const appleHealthKit = getAppleHealthKit();
  if (!appleHealthKit || typeof appleHealthKit.isAvailable !== "function") {
    return false;
  }

  return new Promise((resolve) => {
    appleHealthKit.isAvailable((_error, available) => {
      resolve(Boolean(available));
    });
  });
}

export async function requestAppleHealthPermissions() {
  const appleHealthKit = getAppleHealthKit();
  if (!appleHealthKit) {
    throw makeUnavailableError();
  }

  const available = await isAppleHealthAvailable();
  if (!available) {
    throw makeUnavailableError();
  }

  return new Promise((resolve, reject) => {
    appleHealthKit.initHealthKit(
      createPermissions(appleHealthKit),
      (error, result) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        resolve(result);
      }
    );
  });
}

export async function syncAppleHealth({ since } = {}) {
  const available = await isAppleHealthAvailable();
  if (!available) {
    throw makeUnavailableError();
  }

  const syncedAt = new Date().toISOString();
  const options = normalizeSyncRange(since);
  const syncedMetricKeys = [];
  const warnings = [];
  const entries = [];

  try {
    const sleepSamples = await callAppleHealthMethod("getSleepSamples", options);
    syncedMetricKeys.push("sleep");
    entries.push(...normalizeSleepEntries(sleepSamples, syncedAt));
  } catch (error) {
    warnings.push(error);
  }

  try {
    const weightSamples = await callAppleHealthMethod("getWeightSamples", {
      ...options,
      unit: "pound",
    });
    syncedMetricKeys.push("weight");
    entries.push(...normalizeWeightEntries(weightSamples, syncedAt));
  } catch (error) {
    warnings.push(error);
  }

  try {
    const bloodPressureSamples = await callAppleHealthMethod(
      "getBloodPressureSamples",
      {
        ...options,
        unit: "mmhg",
      }
    );
    syncedMetricKeys.push("blood_pressure_control");
    entries.push(...normalizeBloodPressureEntries(bloodPressureSamples, syncedAt));
  } catch (error) {
    warnings.push(error);
  }

  try {
    const bloodGlucoseSamples = await callAppleHealthMethod(
      "getBloodGlucoseSamples",
      {
        ...options,
        unit: "mmolPerL",
      }
    );
    syncedMetricKeys.push("blood_sugar_control");
    entries.push(...normalizeBloodGlucoseEntries(bloodGlucoseSamples, syncedAt));
  } catch (error) {
    warnings.push(error);
  }

  if (syncedMetricKeys.length === 0) {
    const firstError = warnings[0];
    throw firstError instanceof Error
      ? firstError
      : new Error("Could not read Apple Health data.");
  }

  return {
    entries,
    syncedMetricKeys,
    warnings,
    syncedAt,
    supportedMetricKeys: APPLE_HEALTH_SUPPORTED_METRIC_KEYS,
  };
}

export async function disconnectAppleHealth() {
  return Promise.resolve();
}
