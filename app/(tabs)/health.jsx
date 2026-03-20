import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
  PrimaryCard,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import {
  APPLE_HEALTH_ENTRY_SOURCE,
  APPLE_HEALTH_SUPPORTED_METRIC_KEYS,
  formatMetricValue,
  isAppleHealthSupportedMetric,
  isNumericMetric,
  normalizeMetric,
} from "@/features/health/metricDefinitions";
import {
  APPLE_HEALTH_INITIAL_BACKFILL_DAYS,
  disconnectAppleHealth as disconnectAppleHealthService,
  isAppleHealthAvailable,
  requestAppleHealthPermissions,
  syncAppleHealth,
} from "@/features/health/appleHealth";
import { useHealthStore } from "@/features/health/store";
import { useSupplementsStore } from "@/features/supplements/store";
import { MiniLineChart } from "@/features/health/components/MiniLineChart";
import { HealthEntryModal } from "@/features/health/components/HealthEntryModal";
import { AddMetricModal } from "@/features/health/components/AddMetricModal";
import { HealthMetricSummaryModal } from "@/features/health/components/HealthMetricSummaryModal";
import { HealthMetricCard } from "@/features/health/components/HealthMetricCard";
import {
  getEffectiveEntries,
  getMetricSource,
  isMetricAppleBacked,
  normalizeHealthEntry,
} from "@/features/health/selectors";

const AUTO_REFRESH_STALE_MS = 60 * 60 * 1000;

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

function formatLastSynced(value) {
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

function formatAppleHealthError(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) {
    return "Could not connect to Apple Health right now.";
  }

  if (
    message.toLowerCase().includes("development or production build") ||
    message.toLowerCase().includes("available")
  ) {
    return "Apple Health requires an iOS development or production build of Suppro.";
  }

  return message;
}

export default function HealthScreen() {
  const rawEntries = useHealthStore((state) => state.entries);
  const effectiveEntries = useHealthStore((state) => getEffectiveEntries(state));
  const metrics = useHealthStore((state) => state.metrics);
  const connection = useHealthStore((state) => state.connection);
  const connectionError = useHealthStore((state) => state.connectionError);
  const sourceSettings = useHealthStore((state) => state.sourceSettings);
  const lastSyncedAt = useHealthStore((state) => state.lastSyncedAt);
  const deleteMetric = useHealthStore((state) => state.deleteMetric);
  const deleteEntry = useHealthStore((state) => state.deleteEntry);
  const setConnection = useHealthStore((state) => state.setConnection);
  const mergeAppleHealthEntries = useHealthStore(
    (state) => state.mergeAppleHealthEntries
  );
  const disconnectAppleHealthStore = useHealthStore(
    (state) => state.disconnectAppleHealth
  );
  const supplements = useSupplementsStore((state) => state.supplements);
  const isFocused = useIsFocused();

  const isIOS = Platform.OS === "ios";
  const [isAppleHealthReady, setIsAppleHealthReady] = useState(false);
  const [hasCheckedAppleHealthAvailability, setHasCheckedAppleHealthAvailability] =
    useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const normalizedMetrics = useMemo(
    () =>
      (metrics ?? []).map((metric) => normalizeMetric(metric)).filter(Boolean),
    [metrics]
  );
  const enabledMetrics = useMemo(
    () => normalizedMetrics.filter((metric) => metric.enabled),
    [normalizedMetrics]
  );

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState(null);
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);
  const [summaryMetric, setSummaryMetric] = useState(null);

  const summaryMetricConfig = useMemo(
    () => enabledMetrics.find((metric) => metric.key === summaryMetric) ?? null,
    [enabledMetrics, summaryMetric]
  );

  const supplementMarkers = useMemo(
    () =>
      supplements
        .filter((supplement) => supplement.startDate || supplement.createdAt)
        .map((supplement) => ({
          name: supplement.name,
          startDate: supplement.startDate ?? supplement.createdAt ?? "",
        })),
    [supplements]
  );

  const summaryEntries = useMemo(
    () =>
      (rawEntries ?? [])
        .filter((entry) => entry.type === summaryMetric)
        .map((entry) => normalizeHealthEntry(entry))
        .filter(Boolean),
    [rawEntries, summaryMetric]
  );

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
        Alert.alert("Apple Health", message);
      } finally {
        setIsSyncing(false);
      }
    },
    [lastSyncedAt, mergeAppleHealthEntries, setConnection]
  );

  const handleConnectAppleHealth = useCallback(() => {
    syncFromAppleHealth({ withPermissionPrompt: true });
  }, [syncFromAppleHealth]);

  const handleRefreshAppleHealth = useCallback(() => {
    syncFromAppleHealth();
  }, [syncFromAppleHealth]);

  const handleDisconnectAppleHealth = useCallback(async () => {
    setIsSyncing(true);

    try {
      await disconnectAppleHealthService();
      disconnectAppleHealthStore();
    } catch (error) {
      Alert.alert("Apple Health", formatAppleHealthError(error));
    } finally {
      setIsSyncing(false);
    }
  }, [disconnectAppleHealthStore]);

  useEffect(() => {
    if (!isIOS) return undefined;

    let active = true;

    isAppleHealthAvailable()
      .then((available) => {
        if (!active) return;
        setIsAppleHealthReady(Boolean(available));
      })
      .finally(() => {
        if (!active) return;
        setHasCheckedAppleHealthAvailability(true);
      });

    return () => {
      active = false;
    };
  }, [isIOS]);

  useEffect(() => {
    if (!isIOS || !isFocused || isSyncing) return;
    if (connection !== "connected" || !lastSyncedAt) return;

    const parsed = new Date(lastSyncedAt);
    if (Number.isNaN(parsed.getTime())) return;
    if (Date.now() - parsed.getTime() <= AUTO_REFRESH_STALE_MS) return;

    syncFromAppleHealth();
  }, [connection, isFocused, isIOS, isSyncing, lastSyncedAt, syncFromAppleHealth]);

  const appleHealthMetricCount = APPLE_HEALTH_SUPPORTED_METRIC_KEYS.length;
  const hasLinkedAppleHealthSource = Object.values(sourceSettings ?? {}).includes(
    APPLE_HEALTH_ENTRY_SOURCE
  );
  const isSummaryMetricAppleBacked =
    summaryMetric != null &&
    isMetricAppleBacked({ sourceSettings }, summaryMetric);

  return (
    <BackdropScreen
      header={
        <AppHeader
          title="HEALTH"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>Track your trends</Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      contentStyle={styles.content}
    >
      {isIOS ? (
        <PrimaryCard style={styles.appleHealthCard}>
          <View style={styles.appleHealthHeader}>
            <View style={styles.appleHealthCopy}>
              <Text style={styles.appleHealthTitle}>Apple Health</Text>
              <Text style={styles.appleHealthBody}>
                Import sleep, weight, blood pressure, and blood glucose from
                Apple Health. Data stays on this device in v1.
              </Text>
            </View>
            <View style={styles.appleHealthStatusPill}>
              <Text style={styles.appleHealthStatusText}>
                {connection === "connected"
                  ? "Connected"
                  : connection === "connecting"
                  ? "Syncing"
                  : connection === "error"
                  ? "Needs attention"
                  : "Disconnected"}
              </Text>
            </View>
          </View>

          {!hasCheckedAppleHealthAvailability ? (
            <Text style={styles.appleHealthMeta}>Checking availability...</Text>
          ) : !isAppleHealthReady ? (
            <>
              <Text style={styles.appleHealthMeta}>
                Apple Health is unavailable in this build. Use an iOS development
                or production build instead of Expo Go.
              </Text>
              <AppButton
                label="Unavailable"
                variant="overlay"
                size="md"
                style={styles.appleHealthPrimaryButton}
                textStyle={styles.appleHealthPrimaryButtonText}
                disabled
              />
            </>
          ) : connection === "connected" || hasLinkedAppleHealthSource ? (
            <>
              <Text style={styles.appleHealthMeta}>
                {connection === "error" && connectionError
                  ? `${connectionError} Last successful sync ${formatLastSynced(lastSyncedAt)}.`
                  : `${appleHealthMetricCount} supported metrics. Last sync ${formatLastSynced(
                      lastSyncedAt
                    )}.`}
              </Text>
              <View style={styles.appleHealthActionRow}>
                <AppButton
                  label={isSyncing ? "Refreshing..." : "Refresh"}
                  variant="accent"
                  size="md"
                  onPress={handleRefreshAppleHealth}
                  disabled={isSyncing}
                  textStyle={styles.appleHealthPrimaryButtonText}
                />
                <AppButton
                  label="Disconnect"
                  variant="overlay"
                  size="md"
                  onPress={handleDisconnectAppleHealth}
                  disabled={isSyncing}
                  textStyle={styles.appleHealthSecondaryButtonText}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.appleHealthMeta}>
                {connection === "error" && connectionError
                  ? `${connectionError} Enable access in the Health app or iPhone Settings, then try again.`
                  : `Connect Apple Health to auto-fill ${appleHealthMetricCount} supported metrics on iPhone.`}
              </Text>
              <AppButton
                label={
                  isSyncing
                    ? "Connecting..."
                    : connection === "error"
                    ? "Try again"
                    : "Connect Apple Health"
                }
                variant="accent"
                size="md"
                onPress={handleConnectAppleHealth}
                disabled={isSyncing}
                style={styles.appleHealthPrimaryButton}
                textStyle={styles.appleHealthPrimaryButtonText}
              />
            </>
          )}
        </PrimaryCard>
      ) : null}

      <AppButton
        label="+ Add metric"
        variant="accent"
        size="md"
        onPress={() => setMetricPickerOpen(true)}
        textStyle={styles.addMetricText}
        style={styles.addMetricButton}
      />

      {enabledMetrics.length === 0 ? (
        <EmptyStateCard
          title="No health metrics added"
          description="Add a metric to log symptoms, measurements, or wellbeing trends alongside your supplement routine."
          actionLabel="Add metric"
          onActionPress={() => setMetricPickerOpen(true)}
          style={styles.emptyState}
        />
      ) : (
        <View style={styles.container}>
          {enabledMetrics.map((metricConfig) => {
            const { key, label } = metricConfig;
            const metricEntries = effectiveEntries
              .filter((entry) => entry.type === key)
              .sort((a, b) => a.date.localeCompare(b.date));

            const metricSource = getMetricSource({ sourceSettings }, key);
            const metricIsAppleBacked =
              metricSource === APPLE_HEALTH_ENTRY_SOURCE &&
              isAppleHealthSupportedMetric(key);

            const numericSeries = metricEntries
              .map((entry) => {
                const numericValue = Number(entry.value);
                if (!Number.isFinite(numericValue)) return null;
                return {
                  value: numericValue,
                  hasNote:
                    typeof entry.note === "string" &&
                    entry.note.trim().length > 0,
                };
              })
              .filter(Boolean)
              .slice(-50);

            let chartMin = 1;
            let chartMax = 10;

            if (
              metricConfig &&
              isNumericMetric(metricConfig) &&
              numericSeries.length > 0
            ) {
              const values = numericSeries.map((point) => point.value);
              const dataMin = Math.min(...values);
              const dataMax = Math.max(...values);
              const configuredMin = Number.isFinite(metricConfig.min)
                ? metricConfig.min
                : dataMin;
              const configuredMax = Number.isFinite(metricConfig.max)
                ? metricConfig.max
                : dataMax;
              chartMin = Math.min(configuredMin, dataMin);
              chartMax = Math.max(configuredMax, dataMax);
              if (chartMax === chartMin) {
                chartMax += 1;
              }
            }

            const latestEntry = metricEntries.length
              ? metricEntries[metricEntries.length - 1]
              : null;
            const latestValue = latestEntry
              ? formatMetricValue(metricConfig, latestEntry.value)
              : null;
            const hasChart = Boolean(
              metricConfig &&
                isNumericMetric(metricConfig) &&
                numericSeries.length > 0
            );
            const hasEntries = metricEntries.length > 0;

            return (
              <HealthMetricCard
                key={key}
                label={label}
                description={metricConfig.description}
                latestValue={latestValue}
                hasEntries={hasEntries}
                hasChart={hasChart}
                actionLabel={
                  metricIsAppleBacked
                    ? isSyncing
                      ? "Syncing..."
                      : "Refresh"
                    : "Track"
                }
                sourceLabel={
                  metricIsAppleBacked
                    ? "Apple Health"
                    : isIOS && isAppleHealthSupportedMetric(key)
                    ? "Manual"
                    : null
                }
                emptyText={
                  metricIsAppleBacked
                    ? "No Apple Health data yet. Refresh after Apple Health has recent samples."
                    : undefined
                }
                actionDisabled={metricIsAppleBacked && isSyncing}
                chart={
                  hasChart ? (
                    <MiniLineChart
                      data={numericSeries}
                      min={chartMin}
                      max={chartMax}
                    />
                  ) : null
                }
                onTrack={() => {
                  if (metricIsAppleBacked) {
                    handleRefreshAppleHealth();
                    return;
                  }

                  setActiveMetric(key);
                  setEntryModalOpen(true);
                }}
                onOpenSummary={() => hasEntries && setSummaryMetric(key)}
              />
            );
          })}
        </View>
      )}

      <HealthEntryModal
        visible={entryModalOpen}
        metric={activeMetric}
        onClose={() => {
          setEntryModalOpen(false);
          setActiveMetric(null);
        }}
      />

      <AddMetricModal
        visible={metricPickerOpen}
        onClose={() => setMetricPickerOpen(false)}
      />

      <HealthMetricSummaryModal
        visible={!!summaryMetric}
        label={summaryMetricConfig?.label}
        metric={summaryMetricConfig}
        metricKey={summaryMetric}
        entries={summaryEntries}
        onClose={() => setSummaryMetric(null)}
        onDeleteMetric={() => {
          if (!summaryMetric) return;
          deleteMetric(summaryMetric);
          setSummaryMetric(null);
        }}
        onDeleteEntry={(id) => deleteEntry(id)}
        onRefresh={handleRefreshAppleHealth}
        isRefreshing={isSyncing}
        isReadOnlyAppleMetric={Boolean(isSummaryMetricAppleBacked)}
        supplementMarkers={supplementMarkers}
      />
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  appleHealthCard: {
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  appleHealthHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  appleHealthCopy: {
    flex: 1,
    minWidth: 0,
  },
  appleHealthTitle: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.3,
  },
  appleHealthBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  appleHealthStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  appleHealthStatusText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  appleHealthMeta: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  appleHealthActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  appleHealthPrimaryButton: {
    alignSelf: "flex-start",
  },
  appleHealthPrimaryButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  appleHealthSecondaryButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  container: {
    marginBottom: spacing.xs,
  },
  addMetricText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  addMetricButton: {
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  emptyState: {
    marginTop: spacing.xs,
  },
});
