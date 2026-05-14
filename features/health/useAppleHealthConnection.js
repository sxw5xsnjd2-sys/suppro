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
import { hasRequestedOnboardingAppleHealthConnect } from "@src/lib/onboarding";

export const APPLE_HEALTH_TITLE = "Apple Health";
export const APPLE_HEALTH_SETTINGS_SUBTITLE =
  "Connect Apple Health to help personalise your supplement insights.";
export const APPLE_HEALTH_CONNECTION_DESCRIPTION =
  "Suppro can read selected health and fitness data from the Apple Health app, with your permission.";
export const APPLE_HEALTH_PRE_PERMISSION_TITLE = "Connect Apple Health";
export const APPLE_HEALTH_PRE_PERMISSION_BODY =
  "Suppro uses Apple Health data, such as activity and body measurements where available, to help personalise your insights. You can choose what to share and change permissions anytime in the Health app.";
export const APPLE_HEALTH_UNAVAILABLE_MESSAGE =
  "Apple Health is unavailable on this device or in this build. Use a physical iPhone build of Suppro and make sure Health access is enabled.";
export const APPLE_HEALTH_NO_DATA_MESSAGE =
  "No Apple Health data was imported. Open Settings > Apple Health > Suppro and turn on all permissions, then try again.";

export function getAppleHealthConnectionStatusLabel(isConnected) {
  return isConnected ? "Connected" : "Not connected";
}

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

function hasLinkedAppleHealthState(state) {
  return Object.values(state?.sourceSettings ?? {}).includes(
    APPLE_HEALTH_ENTRY_SOURCE
  );
}

async function syncAppleHealthIntoStore({
  withPermissionPrompt = false,
  suppressErrors = false,
} = {}) {
  const state = useHealthStore.getState();
  const wasLinked = hasLinkedAppleHealthState(state);

  state.setConnection("connecting");

  try {
    if (withPermissionPrompt) {
      await requestAppleHealthPermissions();
    }

    const sinceDate = getAppleHealthSyncStartDate(state.lastSyncedAt);
    const normalizedSinceDate = toLocalISODate(sinceDate);
    const syncResult = await syncAppleHealth({ since: sinceDate });

    if (
      withPermissionPrompt &&
      !wasLinked &&
      (syncResult?.entries?.length ?? 0) === 0
    ) {
      throw new Error(APPLE_HEALTH_NO_DATA_MESSAGE);
    }

    useHealthStore.getState().mergeAppleHealthEntries({
      ...syncResult,
      sinceDate: normalizedSinceDate,
    });

    return {
      synced: true,
      error: "",
    };
  } catch (error) {
    const message = formatAppleHealthError(error);

    if (suppressErrors) {
      useHealthStore.getState().setConnection(
        wasLinked ? "connected" : "disconnected"
      );
    } else {
      useHealthStore.getState().setConnection("error", message);
    }

    return {
      synced: false,
      error: message,
    };
  }
}

export async function syncAppleHealthAfterAuthentication() {
  if (Platform.OS !== "ios") {
    return {
      synced: false,
      skipped: true,
      reason: "not_ios",
    };
  }

  const currentState = useHealthStore.getState();
  const shouldSync =
    (await hasRequestedOnboardingAppleHealthConnect()) ||
    currentState.connection === "connected" ||
    hasLinkedAppleHealthState(currentState);

  if (!shouldSync) {
    return {
      synced: false,
      skipped: true,
      reason: "not_requested",
    };
  }

  const available = await isAppleHealthAvailable();
  if (!available) {
    useHealthStore.getState().setConnection(
      currentState.connection === "connected" || hasLinkedAppleHealthState(currentState)
        ? "connected"
        : "disconnected"
    );
    return {
      synced: false,
      skipped: true,
      reason: "unavailable",
    };
  }

  return syncAppleHealthIntoStore({ suppressErrors: true });
}

export function useAppleHealthConnection({ showAlerts = true } = {}) {
  const connection = useHealthStore((state) => state.connection);
  const connectionError = useHealthStore((state) => state.connectionError);
  const sourceSettings = useHealthStore((state) => state.sourceSettings);
  const lastSyncedAt = useHealthStore((state) => state.lastSyncedAt);
  const setConnection = useHealthStore((state) => state.setConnection);
  const disconnectAppleHealth = useHealthStore(
    (state) => state.disconnectAppleHealth
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
      const result = await syncAppleHealthIntoStore({ withPermissionPrompt });

      if (!result.synced && showAlerts) {
        Alert.alert("Apple Health", result.error);
      }

      setIsSyncing(false);
    },
    [showAlerts]
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

  const disconnectFromAppleHealth = useCallback(() => {
    disconnectAppleHealth();
  }, [disconnectAppleHealth]);

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
    disconnectFromAppleHealth,
  };
}
