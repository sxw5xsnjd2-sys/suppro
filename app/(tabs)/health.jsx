import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import {
  APPLE_HEALTH_ENTRY_SOURCE,
  formatMetricValue,
  getMetricChartRange,
  isAppleHealthSupportedMetric,
  isNumericMetric,
  normalizeMetric,
} from "@/features/health/metricDefinitions";
import { useHealthStore } from "@/features/health/store";
import { useSupplementsStore } from "@/features/supplements/store";
import { MiniLineChart } from "@/features/health/components/MiniLineChart";
import { HealthEntryModal } from "@/features/health/components/HealthEntryModal";
import { AddMetricModal } from "@/features/health/components/AddMetricModal";
import { HealthMetricSummaryModal } from "@/features/health/components/HealthMetricSummaryModal";
import { HealthMetricCard } from "@/features/health/components/HealthMetricCard";
import { useAppleHealthConnection } from "@/features/health/useAppleHealthConnection";
import {
  getEffectiveEntries,
  getMetricSource,
  isMetricAppleBacked,
  normalizeHealthEntry,
} from "@/features/health/selectors";

const AUTO_REFRESH_STALE_MS = 60 * 60 * 1000;

export default function HealthScreen() {
  const rawEntries = useHealthStore((state) => state.entries);
  const effectiveEntries = useHealthStore((state) =>
    getEffectiveEntries(state)
  );
  const metrics = useHealthStore((state) => state.metrics);
  const deleteMetric = useHealthStore((state) => state.deleteMetric);
  const deleteEntry = useHealthStore((state) => state.deleteEntry);
  const sourceSettings = useHealthStore((state) => state.sourceSettings);
  const supplements = useSupplementsStore((state) => state.supplements);
  const isFocused = useIsFocused();
  const {
    isIOS,
    isSyncing,
    lastSyncedAt,
    isAppleHealthConnected,
    refreshAppleHealth,
  } = useAppleHealthConnection();

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

  useEffect(() => {
    if (!isIOS || !isFocused || isSyncing) return;
    if (!isAppleHealthConnected || !lastSyncedAt) return;

    const parsed = new Date(lastSyncedAt);
    if (Number.isNaN(parsed.getTime())) return;
    if (Date.now() - parsed.getTime() <= AUTO_REFRESH_STALE_MS) return;

    refreshAppleHealth();
  }, [
    isAppleHealthConnected,
    isFocused,
    isIOS,
    isSyncing,
    lastSyncedAt,
    refreshAppleHealth,
  ]);

  const isSummaryMetricAppleBacked =
    summaryMetric != null &&
    isMetricAppleBacked({ sourceSettings }, summaryMetric);

  return (
    <BackdropScreen
      header={
        <AppHeader
          title="HEALTH"
          titleStyle={styles.headerTitle}
          titleAccessory={
            <View
              style={[
                styles.appleHealthHeaderPill,
                isAppleHealthConnected
                  ? styles.appleHealthHeaderPillConnected
                  : styles.appleHealthHeaderPillDisconnected,
              ]}
            >
              <Text style={styles.appleHealthHeaderPillText}>
                Apple Health:{" "}
                {isAppleHealthConnected ? "connected" : "disconnected"}
              </Text>
            </View>
          }
          bottomSlot={
            <Text style={styles.headerSubtitle}>Track your trends</Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      contentStyle={styles.content}
    >
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
              const range = getMetricChartRange(
                metricConfig,
                numericSeries.map((point) => point.value)
              );
              chartMin = range.min;
              chartMax = range.max;
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
                    refreshAppleHealth();
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
        onRefresh={refreshAppleHealth}
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
  appleHealthHeaderPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  appleHealthHeaderPillConnected: {
    backgroundColor: appTheme.colors.success,
  },
  appleHealthHeaderPillDisconnected: {
    backgroundColor: appTheme.colors.danger,
  },
  appleHealthHeaderPillText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: "#FFFFFF",
    letterSpacing: 0.2,
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
