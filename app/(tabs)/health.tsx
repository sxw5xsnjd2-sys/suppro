import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Screen } from "@/components/layout/Screen";
import { Header } from "@/components/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";

import { useHealthStore } from "@/store/healthStore";
import { useSupplementsStore } from "@/store/supplementStore";
import { MiniLineChart } from "@/components/health/MiniLineChart";
import { HealthEntryModal } from "@/components/health/HealthEntryModal";
import { AddMetricModal } from "@/components/health/AddMetricModal";
import { HealthMetricSummaryModal } from "@/components/health/HealthMetricSummaryModal";

export default function HealthScreen() {
  const entries = useHealthStore((s) => s.entries);
  const metrics = useHealthStore((s) => s.metrics);
  const deleteMetric = useHealthStore((s) => s.deleteMetric);
  const deleteEntry = useHealthStore((s) => s.deleteEntry);
  const supplements = useSupplementsStore((s) => s.supplements);

  const enabledMetrics = useMemo(
    () => metrics.filter((m) => m.enabled),
    [metrics]
  );

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<string | null>(null);

  const [metricPickerOpen, setMetricPickerOpen] = useState(false);

  // Summary modal stub (no UI yet)
  const [summaryMetric, setSummaryMetric] = useState<string | null>(null);

  const openTrack = (metric: string) => {
    setActiveMetric(metric);
    setEntryModalOpen(true);
  };

  const closeTrack = () => {
    setEntryModalOpen(false);
    setActiveMetric(null);
  };

  const openSummary = (metric: string) => {
    setSummaryMetric(metric);
  };

  const closeSummary = () => {
    setSummaryMetric(null);
  };

  const supplementMarkers = useMemo(
    () =>
      supplements.map((s) => ({
        name: s.name,
        startDate: s.createdAt,
      })),
    [supplements]
  );

  return (
    <Screen
      header={
        <Header
          title="Health"
          subtitle="Track your symptoms over time"
          centered
        />
      }
    >
      {/* Add metric */}
      <Pressable
        onPress={() => setMetricPickerOpen(true)}
        style={styles.addMetricRow}
      >
        <Text style={styles.addMetricText}>+ Add metric</Text>
      </Pressable>

      <View style={styles.container}>
        {enabledMetrics.map(({ key, label }) => {
          const series = entries
            .filter((e) => e.type === key)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-50)
            .map((e) => e.value);

          return (
            <View key={key} style={styles.card}>
              {/* Header */}
              <View style={styles.cardHeader}>
                <Text style={styles.label}>{label}</Text>

                <Pressable
                  onPress={() => openTrack(key)}
                  style={({ pressed }) => [
                    styles.trackButton,
                    pressed && { opacity: 0.85 },
                  ]}
                  hitSlop={6}
                >
                  <Text style={styles.trackButtonText}>Track</Text>
                </Pressable>
              </View>

              {/* Card body → summary */}
              <Pressable onPress={() => openSummary(key)}>
                {series.length ? (
                  <MiniLineChart data={series} />
                ) : (
                  <Text style={styles.empty}>
                    No data yet. Tap Track to add today’s value.
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Track modal */}
      <HealthEntryModal
        visible={entryModalOpen}
        metric={activeMetric}
        onClose={closeTrack}
      />

      {/* Add metric modal */}
      <AddMetricModal
        visible={metricPickerOpen}
        onClose={() => setMetricPickerOpen(false)}
      />

      {/* Summary modal will go here later */}
      <HealthMetricSummaryModal
        visible={!!summaryMetric}
        label={enabledMetrics.find((m) => m.key === summaryMetric)?.label}
        metricKey={summaryMetric}
        entries={entries.filter((e) => e.type === summaryMetric)}
        onClose={closeSummary}
        onDeleteMetric={() => {
          if (!summaryMetric) return;
          deleteMetric(summaryMetric);
          closeSummary();
        }}
        onDeleteEntry={(id) => deleteEntry(id)}
        supplementMarkers={supplementMarkers}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },

  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    ...shadows.card,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },

  trackText: {
    fontSize: 13,
    color: colors.text.secondary,
  },

  empty: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.text.muted,
  },

  addMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },

  addMetricText: {
    fontSize: 15,
    color: colors.text.secondary,
  },

  trackButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.brand.primary,
  },

  trackButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text.inverse,
  },
});
