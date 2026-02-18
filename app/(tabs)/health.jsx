import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";
import { useHealthStore } from "@/features/health/store";
import { useSupplementsStore } from "@/features/supplements/store";
import { MiniLineChart } from "@/features/health/components/MiniLineChart";
import { HealthEntryModal } from "@/features/health/components/HealthEntryModal";
import { AddMetricModal } from "@/features/health/components/AddMetricModal";
import { HealthMetricSummaryModal } from "@/features/health/components/HealthMetricSummaryModal";
import { formatMetricValue, isNumericMetric, normalizeMetric } from "@/features/health/metricDefinitions";

export default function HealthScreen() {
  const entries = useHealthStore((s) => s.entries);
  const metrics = useHealthStore((s) => s.metrics);
  const deleteMetric = useHealthStore((s) => s.deleteMetric);
  const deleteEntry = useHealthStore((s) => s.deleteEntry);
  const supplements = useSupplementsStore((s) => s.supplements);

  const normalizedMetrics = useMemo(
    () => (metrics ?? []).map((metric) => normalizeMetric(metric)).filter(Boolean),
    [metrics]
  );
  const enabledMetrics = useMemo(() => normalizedMetrics.filter((m) => m.enabled), [normalizedMetrics]);

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
        .map((s) => ({ name: s.name, startDate: s.startDate ?? s.createdAt ?? "" })),
    [supplements]
  );

  return (
    <Screen header={<Header title="Health" subtitle="Track your trends" centered />}>
      <Pressable onPress={() => setMetricPickerOpen(true)} style={styles.addMetricRow}>
        <Text style={styles.addMetricText}>+ Add metric</Text>
      </Pressable>

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
                hasNote: typeof entry.note === "string" && entry.note.trim().length > 0,
              };
            })
            .filter(Boolean)
            .slice(-50);

          let chartMin = 1;
          let chartMax = 10;
          if (metricConfig && isNumericMetric(metricConfig) && numericSeries.length > 0) {
            const values = numericSeries.map((point) => point.value);
            const dataMin = Math.min(...values);
            const dataMax = Math.max(...values);
            const configuredMin = Number.isFinite(metricConfig.min) ? metricConfig.min : dataMin;
            const configuredMax = Number.isFinite(metricConfig.max) ? metricConfig.max : dataMax;
            chartMin = Math.min(configuredMin, dataMin);
            chartMax = Math.max(configuredMax, dataMax);
            if (chartMax === chartMin) {
              chartMax += 1;
            }
          }

          const latestEntry = metricEntries.length ? metricEntries[metricEntries.length - 1] : null;
          const latestValue = latestEntry ? formatMetricValue(metricConfig, latestEntry.value) : null;
          const hasChart = Boolean(metricConfig && isNumericMetric(metricConfig) && numericSeries.length > 0);
          const hasEntries = metricEntries.length > 0;

          return (
            <View key={key} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.metricTextBlock}>
                  <Text style={styles.label}>{label}</Text>
                  {metricConfig.description ? (
                    <Text style={styles.metricDescription}>
                      {metricConfig.description}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => {
                    setActiveMetric(key);
                    setEntryModalOpen(true);
                  }}
                  style={({ pressed }) => [styles.trackButton, pressed && { opacity: 0.85 }]}
                  hitSlop={6}
                >
                  <Text style={styles.trackButtonText}>Track</Text>
                </Pressable>
              </View>

              <Pressable onPress={() => hasEntries && setSummaryMetric(key)}>
                {hasChart ? (
                  <MiniLineChart data={numericSeries} min={chartMin} max={chartMax} />
                ) : hasEntries ? (
                  <Text style={styles.latestValue}>Latest: {latestValue}</Text>
                ) : (
                  <Text style={styles.empty}>No data yet. Tap Track to add today&apos;s value.</Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>

      <HealthEntryModal
        visible={entryModalOpen}
        metric={activeMetric}
        onClose={() => {
          setEntryModalOpen(false);
          setActiveMetric(null);
        }}
      />

      <AddMetricModal visible={metricPickerOpen} onClose={() => setMetricPickerOpen(false)} />

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  metricTextBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
  },
  metricDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },
  empty: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.text.muted,
  },
  latestValue: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  addMetricRow: {
    marginTop: spacing.md,
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.strong,
    backgroundColor: colors.background.elevated,
  },
  addMetricText: {
    fontSize: 15,
    color: colors.brand.primary,
    fontWeight: "700",
  },
  trackButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.brand.primary,
  },
  trackButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.inverse,
  },
});
