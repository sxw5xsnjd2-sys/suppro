import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EmptyStateCard,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { useHealthStore } from "@/features/health/store";
import { useSupplementsStore } from "@/features/supplements/store";
import { MiniLineChart } from "@/features/health/components/MiniLineChart";
import { HealthEntryModal } from "@/features/health/components/HealthEntryModal";
import { AddMetricModal } from "@/features/health/components/AddMetricModal";
import { HealthMetricSummaryModal } from "@/features/health/components/HealthMetricSummaryModal";
import { HealthMetricCard } from "@/features/health/components/HealthMetricCard";
import {
  formatMetricValue,
  isNumericMetric,
  normalizeMetric,
} from "@/features/health/metricDefinitions";

export default function HealthScreen() {
  const entries = useHealthStore((s) => s.entries);
  const metrics = useHealthStore((s) => s.metrics);
  const deleteMetric = useHealthStore((s) => s.deleteMetric);
  const deleteEntry = useHealthStore((s) => s.deleteEntry);
  const supplements = useSupplementsStore((s) => s.supplements);

  const normalizedMetrics = useMemo(
    () =>
      (metrics ?? []).map((metric) => normalizeMetric(metric)).filter(Boolean),
    [metrics]
  );
  const enabledMetrics = useMemo(
    () => normalizedMetrics.filter((m) => m.enabled),
    [normalizedMetrics]
  );

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState(null);
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);
  const [summaryMetric, setSummaryMetric] = useState(null);

  const summaryMetricConfig = useMemo(
    () => enabledMetrics.find((m) => m.key === summaryMetric) ?? null,
    [enabledMetrics, summaryMetric]
  );

  const supplementMarkers = useMemo(
    () =>
      supplements
        .filter((s) => s.startDate || s.createdAt)
        .map((s) => ({
          name: s.name,
          startDate: s.startDate ?? s.createdAt ?? "",
        })),
    [supplements]
  );

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
            const metricEntries = entries
              .filter((entry) => entry.type === key)
              .sort((a, b) => a.date.localeCompare(b.date));

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
        entries={entries.filter((e) => e.type === summaryMetric)}
        onClose={() => setSummaryMetric(null)}
        onDeleteMetric={() => {
          if (!summaryMetric) return;
          deleteMetric(summaryMetric);
          setSummaryMetric(null);
        }}
        onDeleteEntry={(id) => deleteEntry(id)}
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
  headerCount: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md,
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
