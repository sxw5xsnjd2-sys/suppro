import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Screen } from "@/components/layout/Screen";
import { Header } from "@/components/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";

import { useHealthStore } from "@/store/healthStore";
import { MiniLineChart } from "@/components/health/MiniLineChart";
import { HealthEntryModal } from "@/components/health/HealthEntryModal";
import { AddMetricModal } from "@/components/health/AddMetricModal";

export default function HealthScreen() {
  const entries = useHealthStore((s) => s.entries);

  const metrics = useHealthStore((s) => s.metrics);
  const enabledMetrics = useMemo(
    () => metrics.filter((m) => m.enabled),
    [metrics]
  );

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);

  const openMetric = (metric: string) => {
    setActiveMetric(metric);
    setEntryModalOpen(true);
  };

  const closeMetric = () => {
    setEntryModalOpen(false);
    setActiveMetric(null);
  };

  const buildSeries = (type: string) =>
    entries
      .filter((e) => e.type === type)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-50)
      .map((e) => e.value);

  return (
    <Screen
      header={
        <Header title="Health" subtitle="Longitudinal tracking" centered />
      }
    >
      <Pressable
        onPress={() => setMetricPickerOpen(true)}
        style={styles.addMetricRow}
      >
        <Text style={styles.addMetricText}>+ Add metric</Text>
      </Pressable>

      <View style={styles.container}>
        {/* Metrics */}
        {enabledMetrics.map(({ key, label }) => {
          const series = entries
            .filter((e) => e.type === key)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-50)
            .map((e) => e.value);

          return (
            <Pressable
              key={key}
              onPress={() => openMetric(key)}
              style={styles.card}
            >
              <Text style={styles.label}>{label}</Text>

              {series.length ? (
                <MiniLineChart data={series} />
              ) : (
                <Text style={styles.empty}>
                  No data yet. Tap to add today’s value.
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <HealthEntryModal
        visible={entryModalOpen}
        metric={activeMetric}
        onClose={closeMetric}
      />

      <AddMetricModal
        visible={metricPickerOpen}
        onClose={() => setMetricPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs, // same as Supplements
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    padding: spacing.md, // same internal density
    marginBottom: spacing.xs, // same vertical rhythm
    ...shadows.card,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  empty: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.text.muted,
  },

  chartWrap: {
    position: "relative",
    marginTop: spacing.xs,
  },

  yAxis: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },

  yAxisLabel: {
    fontSize: 11,
    color: colors.text.muted,
  },

  addMetric: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
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
});
