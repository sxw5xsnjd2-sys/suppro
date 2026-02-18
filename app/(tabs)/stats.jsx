import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { useHealthStore } from "@/features/health/store";
import { getSupplementRatings } from "@src/data/getSupplementRatings";
import {
  isNumericMetric,
  normalizeMetric,
} from "@/features/health/metricDefinitions";

const PERIOD_FILTERS = [
  { key: "daily", label: "Daily", days: 1 },
  { key: "weekly", label: "Weekly", days: 7 },
  { key: "monthly", label: "Monthly", days: 30 },
];

const LOWER_IS_BETTER_KEYS = new Set([
  "blood_sugar_control",
  "cholesterol_support",
  "weight",
]);

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function addDays(isoDate, amount) {
  const parsed = parseISODate(isoDate);
  parsed.setDate(parsed.getDate() + amount);
  return toISODate(parsed);
}

function listDatesBetween(startDate, endDate) {
  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function toPercent(taken, planned) {
  if (!planned) return 0;
  return Math.round((taken / planned) * 100);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function evidenceBucketForScore(score) {
  if (!Number.isFinite(score)) return "poor";
  if (score >= 75) return "high";
  if (score >= 50) return "good";
  return "poor";
}

function computeMetricImprovement(healthMetrics, healthEntries, periodStart, today) {
  const normalizedMetrics = (healthMetrics ?? [])
    .map((metric) => normalizeMetric(metric))
    .filter(Boolean)
    .filter((metric) => metric.enabled !== false);

  const items = normalizedMetrics
    .map((metric) => {
      const entries = (healthEntries ?? [])
        .filter(
          (entry) =>
            entry.type === metric.key &&
            typeof entry.date === "string" &&
            entry.date >= periodStart &&
            entry.date <= today
        )
        .sort((a, b) => a.date.localeCompare(b.date));

      if (entries.length === 0) return null;

      if (!isNumericMetric(metric)) {
        return {
          key: metric.key,
          label: metric.label,
          kind: "text",
          entryCount: entries.length,
          latestDate: entries[entries.length - 1].date,
        };
      }

      const values = entries
        .map((entry) => Number(entry.value))
        .filter((value) => Number.isFinite(value));
      if (values.length === 0) return null;
      if (values.length === 1) {
        return {
          key: metric.key,
          label: metric.label,
          kind: "numeric",
          metric,
          sampleSize: 1,
          earlyAverage: values[0],
          recentAverage: values[0],
          delta: 0,
          trend: "stable",
          directionDelta: 0,
        };
      }

      const splitIndex = Math.max(1, Math.floor(values.length / 2));
      const earlyValues = values.slice(0, splitIndex);
      const recentValues = values.slice(splitIndex);
      const earlyAverage = average(earlyValues);
      const recentAverage = average(recentValues);
      const delta = recentAverage - earlyAverage;

      const configuredRange =
        Number.isFinite(metric.min) && Number.isFinite(metric.max)
          ? Math.abs(metric.max - metric.min)
          : null;
      const dynamicRange = Math.max(...values) - Math.min(...values);
      const thresholdBase =
        configuredRange && configuredRange > 0
          ? configuredRange * 0.05
          : dynamicRange * 0.2;
      const threshold = Math.max(
        thresholdBase || 0,
        Math.abs(earlyAverage) * 0.03,
        0.1
      );

      const directionDelta = LOWER_IS_BETTER_KEYS.has(metric.key) ? -delta : delta;
      const trend =
        directionDelta > threshold
          ? "improved"
          : directionDelta < -threshold
          ? "declined"
          : "stable";

      return {
        key: metric.key,
        label: metric.label,
        kind: "numeric",
        metric,
        sampleSize: values.length,
        earlyAverage,
        recentAverage,
        delta,
        trend,
        directionDelta,
      };
    })
    .filter(Boolean);

  const improvedCount = items.filter(
    (item) => item.kind === "numeric" && item.trend === "improved"
  ).length;
  const stableCount = items.filter(
    (item) => item.kind === "numeric" && item.trend === "stable"
  ).length;
  const declinedCount = items.filter(
    (item) => item.kind === "numeric" && item.trend === "declined"
  ).length;
  const textCount = items.filter((item) => item.kind === "text").length;

  return {
    items,
    improvedCount,
    stableCount,
    declinedCount,
    textCount,
  };
}

export default function StatsScreen() {
  const isFocused = useIsFocused();
  const supplements = useSupplementsStore((s) => s.supplements);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const healthEntries = useHealthStore((s) => s.entries);
  const healthMetrics = useHealthStore((s) => s.metrics);

  const [period, setPeriod] = useState("weekly");
  const [today, setToday] = useState(() => toISODate(new Date()));
  const [ratingByCatalog, setRatingByCatalog] = useState({});

  useEffect(() => {
    if (!isFocused) return;
    setToday(toISODate(new Date()));
  }, [isFocused]);

  useEffect(() => {
    let active = true;
    const catalogIds = Array.from(
      new Set(
        (supplements ?? [])
          .map((supplement) => supplement.catalogId)
          .filter(Boolean)
      )
    );
    if (!catalogIds.length) {
      setRatingByCatalog({});
      return undefined;
    }
    getSupplementRatings(catalogIds)
      .then((map) => {
        if (!active) return;
        setRatingByCatalog(map);
      })
      .catch(() => {
        if (!active) return;
        setRatingByCatalog({});
      });
    return () => {
      active = false;
    };
  }, [supplements]);

  const periodDays =
    PERIOD_FILTERS.find((item) => item.key === period)?.days ?? 7;

  const analysisStart = useMemo(() => {
    const dateCandidates = [today];
    (supplements ?? []).forEach((supplement) => {
      if (typeof supplement?.startDate === "string" && supplement.startDate) {
        dateCandidates.push(supplement.startDate);
      }
    });
    Object.keys(takenTimesByDate ?? {}).forEach((date) =>
      dateCandidates.push(date)
    );
    (healthEntries ?? []).forEach((entry) => {
      if (typeof entry?.date === "string" && entry.date)
        dateCandidates.push(entry.date);
    });
    return dateCandidates.sort()[0] ?? today;
  }, [supplements, takenTimesByDate, healthEntries, today]);

  const allDates = useMemo(
    () => listDatesBetween(analysisStart, today),
    [analysisStart, today]
  );

  const dayStatsByDate = useMemo(() => {
    const map = {};
    allDates.forEach((date) => {
      const dayOfWeek = parseISODate(date).getDay();
      const dayTakenMap = takenTimesByDate?.[date] ?? {};
      const plannedSupplements = (supplements ?? []).filter((supplement) => {
        if (supplement?.startDate && date < supplement.startDate) return false;
        if (supplement?.endDate && date > supplement.endDate) return false;
        if (
          Array.isArray(supplement?.daysOfWeek) &&
          supplement.daysOfWeek.length > 0
        ) {
          return supplement.daysOfWeek.includes(dayOfWeek);
        }
        return true;
      });
      const takenCount = plannedSupplements.reduce(
        (count, supplement) => (dayTakenMap[supplement.id] ? count + 1 : count),
        0
      );
      map[date] = {
        date,
        dayOfWeek,
        plannedSupplements,
        plannedCount: plannedSupplements.length,
        takenCount,
        missedCount: Math.max(plannedSupplements.length - takenCount, 0),
        takenLookup: dayTakenMap,
      };
    });
    return map;
  }, [allDates, supplements, takenTimesByDate]);

  const periodDates = useMemo(() => {
    const start = addDays(today, -(periodDays - 1));
    return listDatesBetween(start, today);
  }, [today, periodDays]);

  const previousPeriodDates = useMemo(() => {
    const end = addDays(today, -periodDays);
    const start = addDays(end, -(periodDays - 1));
    return listDatesBetween(start, end);
  }, [today, periodDays]);

  const summarizeDates = useCallback(
    (dates) => {
      const summary = {
        planned: 0,
        taken: 0,
        missed: 0,
      };

      dates.forEach((date) => {
        const day = dayStatsByDate[date];
        if (!day) return;

        summary.planned += day.plannedCount;
        summary.taken += day.takenCount;
        summary.missed += day.missedCount;
      });

      return summary;
    },
    [dayStatsByDate]
  );

  const currentSummary = useMemo(
    () => summarizeDates(periodDates),
    [periodDates, summarizeDates]
  );
  const previousSummary = useMemo(
    () => summarizeDates(previousPeriodDates),
    [previousPeriodDates, summarizeDates]
  );

  const adherenceScore = toPercent(
    currentSummary.taken,
    currentSummary.planned
  );

  const missedDelta = currentSummary.missed - previousSummary.missed;
  const missedTrendText =
    missedDelta === 0
      ? "No change vs previous period"
      : missedDelta < 0
      ? `${Math.abs(missedDelta)} fewer than previous period`
      : `${missedDelta} more than previous period`;

  const streakStats = useMemo(() => {
    let longestStreak = 0;
    let runningStreak = 0;
    for (const date of allDates) {
      const day = dayStatsByDate[date];
      if (!day || day.plannedCount === 0) continue;
      if (day.takenCount >= day.plannedCount) {
        runningStreak += 1;
        longestStreak = Math.max(longestStreak, runningStreak);
      } else {
        runningStreak = 0;
      }
    }

    let currentStreak = 0;
    for (let index = allDates.length - 1; index >= 0; index -= 1) {
      const day = dayStatsByDate[allDates[index]];
      if (!day || day.plannedCount === 0) continue;
      if (day.takenCount >= day.plannedCount) currentStreak += 1;
      else break;
    }

    return { currentStreak, longestStreak };
  }, [allDates, dayStatsByDate]);

  const metricImprovement = useMemo(
    () =>
      computeMetricImprovement(
        healthMetrics,
        healthEntries,
        periodDates[0] ?? today,
        today
      ),
    [healthMetrics, healthEntries, periodDates, today]
  );

  const activeSupplements = useMemo(
    () =>
      (supplements ?? [])
        .filter((supplement) => {
          if (supplement?.startDate && today < supplement.startDate) return false;
          if (supplement?.endDate && today > supplement.endDate) return false;
          return true;
        })
        .sort((a, b) =>
          String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
        ),
    [supplements, today]
  );

  const evidenceGroups = useMemo(() => {
    const groups = { high: [], good: [], poor: [] };
    activeSupplements.forEach((supplement) => {
      const score = Number.isFinite(ratingByCatalog[supplement.catalogId])
        ? ratingByCatalog[supplement.catalogId]
        : null;
      const bucket = evidenceBucketForScore(score);
      groups[bucket].push({
        id: supplement.id,
        name: supplement.name,
        score,
      });
    });
    return groups;
  }, [activeSupplements, ratingByCatalog]);

  const topImprovingMetrics = useMemo(
    () =>
      metricImprovement.items
        .filter((item) => item.kind === "numeric" && item.trend === "improved")
        .sort((a, b) => b.directionDelta - a.directionDelta)
        .slice(0, 2)
        .map((item) => ({
          key: item.key,
          label: item.label,
          summary: `${item.delta > 0 ? "+" : ""}${formatNumber(item.delta)}${
            item.metric?.unit ? ` ${item.metric.unit}` : ""
          } over ${item.sampleSize} entries`,
        })),
    [metricImprovement]
  );

  const topDecliningMetrics = useMemo(
    () =>
      metricImprovement.items
        .filter((item) => item.kind === "numeric" && item.trend === "declined")
        .sort((a, b) => a.directionDelta - b.directionDelta)
        .slice(0, 2)
        .map((item) => ({
          key: item.key,
          label: item.label,
          summary: `${item.delta > 0 ? "+" : ""}${formatNumber(item.delta)}${
            item.metric?.unit ? ` ${item.metric.unit}` : ""
          } over ${item.sampleSize} entries`,
        })),
    [metricImprovement]
  );

  return (
    <Screen
      header={
        <Header
          title="Stats"
          subtitle="Supplement performance insights"
          centered
        />
      }
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filterRow}>
          {PERIOD_FILTERS.map((filter) => {
            const active = period === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setPeriod(filter.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  style={[styles.filterText, active && styles.filterTextActive]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.cardTitleStandalone]}>
            Adherence Overview
          </Text>

          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>Adherence score</Text>
              <Text style={styles.kpiValue}>{adherenceScore}%</Text>
              <Text style={styles.kpiMeta}>
                {currentSummary.taken}/{currentSummary.planned || 0} doses
              </Text>
            </View>

            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>Missed doses</Text>
              <Text style={styles.kpiValue}>{currentSummary.missed}</Text>
              <Text style={styles.kpiMeta}>{missedTrendText}</Text>
            </View>
          </View>

          <View style={styles.streakRow}>
            <View style={styles.streakCard}>
              <Text style={styles.streakLabel}>Current streak</Text>
              <Text style={styles.streakValue}>
                {streakStats.currentStreak} days
              </Text>
            </View>
            <View style={styles.streakCard}>
              <Text style={styles.streakLabel}>Longest streak</Text>
              <Text style={styles.streakValue}>
                {streakStats.longestStreak} days
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.cardTitleStandalone]}>
            Supplement Evidence
          </Text>

          <View style={styles.evidenceGrid}>
            <View style={[styles.evidenceBlock, styles.evidenceBlockHigh]}>
              <Text style={[styles.evidenceTitle, styles.evidenceTitleHigh]}>
                High Evidence (75+)
              </Text>
              <Text style={styles.evidenceCount}>
                {evidenceGroups.high.length} supplement
                {evidenceGroups.high.length === 1 ? "" : "s"}
              </Text>
              {evidenceGroups.high.length ? (
                evidenceGroups.high.map((item) => (
                  <Text key={item.id} style={styles.evidenceItem}>
                    {item.name} ({Math.round(item.score ?? 0)}/100)
                  </Text>
                ))
              ) : (
                <Text style={styles.evidenceEmpty}>None right now</Text>
              )}
            </View>

            <View style={[styles.evidenceBlock, styles.evidenceBlockGood]}>
              <Text style={[styles.evidenceTitle, styles.evidenceTitleGood]}>
                Good Evidence (50-74)
              </Text>
              <Text style={styles.evidenceCount}>
                {evidenceGroups.good.length} supplement
                {evidenceGroups.good.length === 1 ? "" : "s"}
              </Text>
              {evidenceGroups.good.length ? (
                evidenceGroups.good.map((item) => (
                  <Text key={item.id} style={styles.evidenceItem}>
                    {item.name} ({Math.round(item.score ?? 0)}/100)
                  </Text>
                ))
              ) : (
                <Text style={styles.evidenceEmpty}>None right now</Text>
              )}
            </View>

            <View style={[styles.evidenceBlock, styles.evidenceBlockPoor]}>
              <Text style={[styles.evidenceTitle, styles.evidenceTitlePoor]}>
                Poor Evidence (&lt;50)
              </Text>
              <Text style={styles.evidenceCount}>
                {evidenceGroups.poor.length} supplement
                {evidenceGroups.poor.length === 1 ? "" : "s"}
              </Text>
              {evidenceGroups.poor.length ? (
                evidenceGroups.poor.map((item) => (
                  <Text key={item.id} style={styles.evidenceItem}>
                    {item.name}
                    {Number.isFinite(item.score)
                      ? ` (${Math.round(item.score)}/100)`
                      : " (unrated)"}
                  </Text>
                ))
              ) : (
                <Text style={styles.evidenceEmpty}>None right now</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.cardTitleStandalone]}>
            Health Metrics
          </Text>

          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>Improved</Text>
              <Text style={styles.kpiValue}>
                {metricImprovement.improvedCount}
              </Text>
            </View>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>Stable</Text>
              <Text style={styles.kpiValue}>
                {metricImprovement.stableCount}
              </Text>
            </View>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>Declined</Text>
              <Text style={styles.kpiValue}>
                {metricImprovement.declinedCount}
              </Text>
            </View>
          </View>

          {metricImprovement.textCount > 0 ? (
            <Text style={styles.helperText}>
              {metricImprovement.textCount} text-based metric(s) were also
              tracked.
            </Text>
          ) : null}

          <View
            style={[
              styles.metricsSummaryBlock,
              styles.metricsSummaryBlockPositive,
            ]}
          >
            <Text
              style={[
                styles.metricsSummaryLabel,
                styles.metricsSummaryLabelPositive,
              ]}
            >
              Improving
            </Text>
            {topImprovingMetrics.length ? (
              topImprovingMetrics.map((item) => (
                <View key={item.key} style={styles.metricsItem}>
                  <Text style={styles.metricsSummaryTextStrong}>{item.label}</Text>
                  <Text style={styles.metricsSummaryText}>{item.summary}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.metricsSummaryText}>
                No clear improving metrics yet in this period.
              </Text>
            )}
          </View>
          <View
            style={[
              styles.metricsSummaryBlock,
              styles.metricsSummaryBlockNegative,
            ]}
          >
            <Text
              style={[
                styles.metricsSummaryLabel,
                styles.metricsSummaryLabelNegative,
              ]}
            >
              Needs attention
            </Text>
            {topDecliningMetrics.length ? (
              topDecliningMetrics.map((item) => (
                <View key={item.key} style={styles.metricsItem}>
                  <Text style={styles.metricsSummaryTextStrong}>{item.label}</Text>
                  <Text style={styles.metricsSummaryText}>{item.summary}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.metricsSummaryText}>
                No clear declining metrics in this period.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  filterChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.card,
    alignItems: "center",
  },
  filterChipActive: {
    backgroundColor: colors.border.strong,
    borderColor: colors.brand.primary,
  },
  filterText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  filterTextActive: {
    color: colors.text.primary,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.text.primary,
    paddingBottom: 0,
  },
  cardTitleStandalone: {
    marginBottom: spacing.md,
  },
  evidenceGrid: {
    gap: spacing.sm,
  },
  evidenceBlock: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.background.elevated,
  },
  evidenceBlockHigh: {
    borderColor: "rgba(102, 177, 94, 0.35)",
    backgroundColor: "rgba(102, 177, 94, 0.10)",
  },
  evidenceBlockGood: {
    borderColor: "rgba(230, 170, 65, 0.35)",
    backgroundColor: "rgba(230, 170, 65, 0.10)",
  },
  evidenceBlockPoor: {
    borderColor: "rgba(201, 87, 87, 0.35)",
    backgroundColor: "rgba(201, 87, 87, 0.10)",
  },
  evidenceTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  evidenceTitleHigh: {
    color: colors.status.success,
  },
  evidenceTitleGood: {
    color: colors.status.warning,
  },
  evidenceTitlePoor: {
    color: colors.status.danger,
  },
  evidenceCount: {
    marginTop: 4,
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  evidenceItem: {
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.primary,
    fontWeight: "600",
  },
  evidenceEmpty: {
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },
  kpiRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  kpiItem: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    padding: spacing.sm,
  },
  kpiLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  kpiValue: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
  },
  kpiMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 16,
  },
  streakRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  streakCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.sm,
    backgroundColor: colors.background.card,
  },
  streakLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  streakValue: {
    marginTop: 4,
    fontSize: 18,
    color: colors.text.primary,
    fontWeight: "700",
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  metricsSummaryBlock: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
  },
  metricsSummaryBlockPositive: {
    borderColor: "rgba(102, 177, 94, 0.35)",
    backgroundColor: "rgba(102, 177, 94, 0.10)",
  },
  metricsSummaryBlockNegative: {
    borderColor: "rgba(201, 87, 87, 0.35)",
    backgroundColor: "rgba(201, 87, 87, 0.10)",
  },
  metricsSummaryLabel: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: "700",
  },
  metricsSummaryLabelPositive: {
    color: colors.status.success,
  },
  metricsSummaryLabelNegative: {
    color: colors.status.danger,
  },
  metricsItem: {
    marginTop: spacing.xs,
  },
  metricsSummaryTextStrong: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: "700",
  },
  metricsSummaryText: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 17,
  },
});
