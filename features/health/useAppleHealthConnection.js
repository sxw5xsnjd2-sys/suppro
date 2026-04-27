import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import {
  APPLE_HEALTH_INITIAL_BACKFILL_DAYS,
  isAppleHealthAvailable,
  requestAppleHealthPermissions,
  syncAppleHealth,
} from "./appleHealth";
import { APPLE_HEALTH_ENTRY_SOURCE } from "./metricDefinitions";
import { useHealthStore } from "./store";

export const APPLE_HEALTH_UNAVAILABLE_MESSAGE =
  "Apple Health is unavailable on this device or in this build. Use a physical iPhone build of Suppro and make sure Health access is enabled.";

function toLocalISODate(dateLike) {
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(count) {
  const next = new Date();
  next.setDate(next.getDate() - count);
  return next;
}

function getAppleHealthSyncStartDate(lastSyncedAt) {
  if (!lastSyncedAt) {
    return daysAgo(APPLE_HEALTH_INITIAL_BACKFILL_DAYS - 1);
  }

  const parsed = new Date(lastSyncedAt);
  if (Number.isNaN(parsed.getTime())) {
    return daysAgo(APPLE_HEALTH_INITIAL_BACKFILL_DAYS - 1);
  }

  parsed.setDate(parsed.getDate() - 1);
  return parsed;
}

export function formatLastSynced(value) {
  if (!value) return "Not synced yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not synced yet";

  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAppleHealthError(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) {
    return "Could not connect to Apple Health right now.";
  }

  if (message.toLowerCase().includes("development or production build")) {
    return "Apple Health is unavailable on this device or in this build.";
  }

  return message;
}

export function useAppleHealthConnection({ showAlerts = true } = {}) {
  const connection = useHealthStore((state) => state.connection);
  const connectionError = useHealthStore((state) => state.connectionError);
  const sourceSettings = useHealthStore((state) => state.sourceSettings);
  const lastSyncedAt = useHealthStore((state) => state.lastSyncedAt);
  const setConnection = useHealthStore((state) => state.setConnection);
  const mergeAppleHealthEntries = useHealthStore(
    (state) => state.mergeAppleHealthEntries
  );

  const isIOS = Platform.OS === "ios";
  const [isAppleHealthReady, setIsAppleHealthReady] = useState(false);
  const [
    hasCheckedAppleHealthAvailability,
    setHasCheckedAppleHealthAvailability,
  ] = useState(!isIOS);
  const [isSyncing, setIsSyncing] = useState(false);

  const hasLinkedAppleHealthSource = useMemo(
    () =>
      Object.values(sourceSettings ?? {}).includes(APPLE_HEALTH_ENTRY_SOURCE),
    [sourceSettings]
  );
  const isAppleHealthConnected =
    connection === "connected" ||
    (connection !== "error" && hasLinkedAppleHealthSource);

  const checkAppleHealthAvailability = useCallback(async () => {
    if (!isIOS) return false;
    return Boolean(await isAppleHealthAvailable());
  }, [isIOS]);

  const syncFromAppleHealth = useCallback(
    async ({ withPermissionPrompt = false } = {}) => {
      setIsSyncing(true);
      setConnection("connecting");

      try {
        if (withPermissionPrompt) {
          await requestAppleHealthPermissions();
        }

        const sinceDate = getAppleHealthSyncStartDate(lastSyncedAt);
        const normalizedSinceDate = toLocalISODate(sinceDate);
        const syncResult = await syncAppleHealth({ since: sinceDate });

        mergeAppleHealthEntries({
          ...syncResult,
          sinceDate: normalizedSinceDate,
        });
      } catch (error) {
        const message = formatAppleHealthError(error);
        setConnection("error", message);

        if (showAlerts) {
          Alert.alert("Apple Health", message);
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [lastSyncedAt, mergeAppleHealthEntries, setConnection, showAlerts]
  );

  const reconnectAppleHealth = useCallback(async () => {
    setHasCheckedAppleHealthAvailability(false);

    const available = await checkAppleHealthAvailability();
    setIsAppleHealthReady(Boolean(available));
    setHasCheckedAppleHealthAvailability(true);

    if (!available) {
      setConnection("error", APPLE_HEALTH_UNAVAILABLE_MESSAGE);

      if (showAlerts) {
        Alert.alert("Apple Health", APPLE_HEALTH_UNAVAILABLE_MESSAGE);
      }
      return;
    }

    await syncFromAppleHealth({ withPermissionPrompt: true });
  }, [checkAppleHealthAvailability, setConnection, showAlerts, syncFromAppleHealth]);

  const refreshAppleHealth = useCallback(async () => {
    await syncFromAppleHealth();
  }, [syncFromAppleHealth]);

  useEffect(() => {
    if (!isIOS) {
      setIsAppleHealthReady(false);
      setHasCheckedAppleHealthAvailability(true);
      return undefined;
    }

    let active = true;
    setHasCheckedAppleHealthAvailability(false);

    checkAppleHealthAvailability()
      .then((available) => {
        if (!active) return;
        setIsAppleHealthReady(Boolean(available));
        setHasCheckedAppleHealthAvailability(true);
      })
      .catch(() => {
        if (!active) return;
        setIsAppleHealthReady(false);
        setHasCheckedAppleHealthAvailability(true);
      });

    return () => {
      active = false;
    };
  }, [checkAppleHealthAvailability, isIOS]);

  return {
    connection,
    connectionError,
    lastSyncedAt,
    isIOS,
    isSyncing,
    isAppleHealthReady,
    hasCheckedAppleHealthAvailability,
    hasLinkedAppleHealthSource,
    isAppleHealthConnected,
    refreshAppleHealth,
    reconnectAppleHealth,
  };
}
