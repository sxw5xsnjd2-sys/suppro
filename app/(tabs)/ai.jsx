import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
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

const DAY_LABELS = [
  { key: 0, label: "Sun" },
  { key: 1, label: "Mon" },
  { key: 2, label: "Tue" },
  { key: 3, label: "Wed" },
  { key: 4, label: "Thu" },
  { key: 5, label: "Fri" },
  { key: 6, label: "Sat" },
];

const TIME_BUCKETS = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
];

const EVIDENCE_POINTS = {
  high: 3,
  moderate: 2,
  low: 1,
  unknown: 0,
};

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

function dayBucketForMinutes(timeMinutes) {
  if (!Number.isFinite(timeMinutes)) return "morning";
  if (timeMinutes < 12 * 60) return "morning";
  if (timeMinutes < 17 * 60) return "afternoon";
  return "evening";
}

function evidenceTierForScore(score) {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 75) return "high";
  if (score >= 50) return "moderate";
  return "low";
}

function toPercent(taken, planned) {
  if (!planned) return 0;
  return Math.round((taken / planned) * 100);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatShortDate(isoDate) {
  const parsed = parseISODate(isoDate);
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = parsed
    .toLocaleDateString("en-GB", { month: "short" })
    .replace(".", "")
    .slice(0, 3);
  return `${day} ${month}`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMetricValue(metric, value) {
  const base = formatNumber(value);
  if (base === "—") return base;
  if (metric?.unit) return `${base} ${metric.unit}`;
  return base;
}

function ProgressBar({ percent, tint }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          {
            width: `${Math.max(0, Math.min(100, percent))}%`,
            backgroundColor: tint,
          },
        ]}
      />
    </View>
  );
}

export default function StatsScreen() {
  const supplements = useSupplementsStore((s) => s.supplements);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const healthEntries = useHealthStore((s) => s.entries);
  const healthMetrics = useHealthStore((s) => s.metrics);

  const [period, setPeriod] = useState("weekly");
  const [ratingByCatalog, setRatingByCatalog] = useState({});

  const today = useMemo(() => toISODate(new Date()), []);

  useEffect(() => {
    let active = true;
    const catalogIds = Array.from(
      new Set(
        (supplements ?? [])
          .map((supplement) => supplement.catalogId)
          .filter(Boolean)
      )
    );
    if (catalogIds.length === 0) {
      setRatingByCatalog({});
      return undefined;
    }
    getSupplementRatings(catalogIds).then((map) => {
      if (active) setRatingByCatalog(map);
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
      const byDayOfWeek = DAY_LABELS.reduce((acc, item) => {
        acc[item.key] = { ...item, planned: 0, taken: 0 };
        return acc;
      }, {});
      const byTimeOfDay = TIME_BUCKETS.reduce((acc, item) => {
        acc[item.key] = { ...item, planned: 0, taken: 0 };
        return acc;
      }, {});

      const summary = {
        planned: 0,
        taken: 0,
        missed: 0,
        missedBySupplement: {},
        byDayOfWeek,
        byTimeOfDay,
        evidence: {
          high: 0,
          moderate: 0,
          low: 0,
          unknown: 0,
          points: 0,
          knownCount: 0,
        },
      };

      dates.forEach((date) => {
        const day = dayStatsByDate[date];
        if (!day) return;

        summary.planned += day.plannedCount;
        summary.taken += day.takenCount;
        summary.missed += day.missedCount;

        day.plannedSupplements.forEach((supplement) => {
          const wasTaken = Boolean(day.takenLookup[supplement.id]);

          const dayStat = summary.byDayOfWeek[day.dayOfWeek];
          dayStat.planned += 1;
          if (wasTaken) dayStat.taken += 1;

          const bucket = dayBucketForMinutes(supplement.timeMinutes);
          const bucketStat = summary.byTimeOfDay[bucket];
          bucketStat.planned += 1;
          if (wasTaken) bucketStat.taken += 1;

          if (!wasTaken) {
            summary.missedBySupplement[supplement.id] =
              (summary.missedBySupplement[supplement.id] ?? 0) + 1;
            return;
          }

          const tier = evidenceTierForScore(
            ratingByCatalog[supplement.catalogId]
          );
          summary.evidence[tier] += 1;
          if (tier !== "unknown") {
            summary.evidence.points += EVIDENCE_POINTS[tier];
            summary.evidence.knownCount += 1;
          }
        });
      });

      return summary;
    },
    [dayStatsByDate, ratingByCatalog]
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
  const previousAdherenceScore = toPercent(
    previousSummary.taken,
    previousSummary.planned
  );
  const adherenceDelta = adherenceScore - previousAdherenceScore;
  const consistencyTrend =
    adherenceDelta >= 5
      ? "Improving"
      : adherenceDelta <= -5
      ? "Declining"
      : "Stable";

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

  const missedSupplements = useMemo(() => {
    return Object.entries(currentSummary.missedBySupplement)
      .map(([id, count]) => ({
        id,
        count,
        name:
          supplements.find((supplement) => supplement.id === id)?.name ??
          "Unknown supplement",
      }))
      .sort((a, b) => b.count - a.count);
  }, [currentSummary, supplements]);

  const mostMissedSupplement = missedSupplements[0] ?? null;

  const evidenceKnownTotal =
    currentSummary.evidence.high +
    currentSummary.evidence.moderate +
    currentSummary.evidence.low;
  const evidenceScore = currentSummary.evidence.knownCount
    ? Math.round(
        (currentSummary.evidence.points /
          (currentSummary.evidence.knownCount * 3)) *
          100
      )
    : 0;
  const evidenceDistribution = {
    high: evidenceKnownTotal
      ? Math.round((currentSummary.evidence.high / evidenceKnownTotal) * 100)
      : 0,
    moderate: evidenceKnownTotal
      ? Math.round(
          (currentSummary.evidence.moderate / evidenceKnownTotal) * 100
        )
      : 0,
    low: evidenceKnownTotal
      ? Math.round((currentSummary.evidence.low / evidenceKnownTotal) * 100)
      : 0,
    unknown: currentSummary.evidence.unknown,
  };

  const metricImprovement = useMemo(() => {
    const periodStart = periodDates[0];
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

        const directionDelta = LOWER_IS_BETTER_KEYS.has(metric.key)
          ? -delta
          : delta;
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
  }, [healthMetrics, healthEntries, periodDates, today]);

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
          <Text style={styles.cardTitle}>Adherence Overview</Text>

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
          <Text style={styles.cardTitle}>Evidence-Weighted Intake</Text>

          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>Evidence score</Text>
              <Text style={styles.kpiValue}>{evidenceScore}%</Text>
              <Text style={styles.kpiMeta}>
                Weighted by Gold/Silver/Bronze quality
              </Text>
            </View>

            <View style={styles.kpiItem}>
              <Text style={styles.kpiLabel}>Distribution</Text>
              <Text style={styles.kpiMeta}>
                High {evidenceDistribution.high}%
              </Text>
              <Text style={styles.kpiMeta}>
                Moderate {evidenceDistribution.moderate}%
              </Text>
              <Text style={styles.kpiMeta}>
                Low {evidenceDistribution.low}%
              </Text>
            </View>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>High evidence</Text>
            <ProgressBar
              percent={evidenceDistribution.high}
              tint={colors.status.success}
            />
            <Text style={styles.metricValue}>{evidenceDistribution.high}%</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Moderate evidence</Text>
            <ProgressBar
              percent={evidenceDistribution.moderate}
              tint={colors.status.warning}
            />
            <Text style={styles.metricValue}>
              {evidenceDistribution.moderate}%
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Low evidence</Text>
            <ProgressBar
              percent={evidenceDistribution.low}
              tint={colors.status.danger}
            />
            <Text style={styles.metricValue}>{evidenceDistribution.low}%</Text>
          </View>
          {evidenceDistribution.unknown > 0 ? (
            <Text style={styles.helperText}>
              {evidenceDistribution.unknown} taken dose(s) had no evidence score
              available.
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Habit &amp; Consistency Insights</Text>

          <View style={styles.insightRow}>
            <Text style={styles.insightLabel}>Most frequently missed</Text>
            <Text style={styles.insightValue}>
              {mostMissedSupplement
                ? `${mostMissedSupplement.name} (${mostMissedSupplement.count})`
                : "No missed doses in this period"}
            </Text>
          </View>
          <View style={styles.insightRow}>
            <Text style={styles.insightLabel}>Consistency trend</Text>
            <Text style={styles.insightValue}>
              {consistencyTrend} ({adherenceDelta >= 0 ? "+" : ""}
              {adherenceDelta}% vs previous period)
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Adherence by day of week</Text>
          {DAY_LABELS.map((day) => {
            const stat = currentSummary.byDayOfWeek[day.key];
            const percent = toPercent(stat.taken, stat.planned);
            return (
              <View key={day.key} style={styles.metricRow}>
                <Text style={styles.metricLabel}>{day.label}</Text>
                <ProgressBar percent={percent} tint={colors.brand.primary} />
                <Text style={styles.metricValue}>{percent}%</Text>
              </View>
            );
          })}

          <Text style={styles.sectionLabel}>Adherence by time of day</Text>
          {TIME_BUCKETS.map((bucket) => {
            const stat = currentSummary.byTimeOfDay[bucket.key];
            const percent = toPercent(stat.taken, stat.planned);
            return (
              <View key={bucket.key} style={styles.metricRow}>
                <Text style={styles.metricLabel}>{bucket.label}</Text>
                <ProgressBar percent={percent} tint={colors.brand.dark} />
                <Text style={styles.metricValue}>{percent}%</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Health Metrics</Text>

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

          {metricImprovement.items.length === 0 ? (
            <Text style={styles.helperText}>
              No metric entries available in this period yet.
            </Text>
          ) : (
            metricImprovement.items.map((item) => {
              if (item.kind === "text") {
                return (
                  <View key={item.key} style={styles.metricSummaryRow}>
                    <View style={styles.metricSummaryMain}>
                      <Text style={styles.metricSummaryTitle}>
                        {item.label}
                      </Text>
                      <Text style={styles.metricSummaryMeta}>
                        {item.entryCount} text entries logged · latest{" "}
                        {formatShortDate(item.latestDate)}
                      </Text>
                    </View>
                    <View style={[styles.trendPill, styles.trendPillNeutral]}>
                      <Text style={styles.trendPillTextNeutral}>
                        Qualitative
                      </Text>
                    </View>
                  </View>
                );
              }

              const trendStyle =
                item.trend === "improved"
                  ? styles.trendPillPositive
                  : item.trend === "declined"
                  ? styles.trendPillNegative
                  : styles.trendPillNeutral;
              const trendTextStyle =
                item.trend === "improved"
                  ? styles.trendPillTextPositive
                  : item.trend === "declined"
                  ? styles.trendPillTextNegative
                  : styles.trendPillTextNeutral;
              const trendLabel =
                item.trend === "improved"
                  ? "Improved"
                  : item.trend === "declined"
                  ? "Declined"
                  : "Stable";
              const deltaPrefix = item.delta > 0 ? "+" : "";

              return (
                <View key={item.key} style={styles.metricSummaryRow}>
                  <View style={styles.metricSummaryMain}>
                    <Text style={styles.metricSummaryTitle}>{item.label}</Text>
                    <Text style={styles.metricSummaryMeta}>
                      Early {formatMetricValue(item.metric, item.earlyAverage)}{" "}
                      → Recent{" "}
                      {formatMetricValue(item.metric, item.recentAverage)}
                    </Text>
                    <Text style={styles.metricSummaryMeta}>
                      Change {deltaPrefix}
                      {formatNumber(item.delta)}
                      {item.metric?.unit ? ` ${item.metric.unit}` : ""} ·{" "}
                      {item.sampleSize} entries
                    </Text>
                  </View>
                  <View style={[styles.trendPill, trendStyle]}>
                    <Text style={trendTextStyle}>{trendLabel}</Text>
                  </View>
                </View>
              );
            })
          )}
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
    paddingBottom: 20,
  },
  cardSubtitle: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: spacing.md,
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
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  metricLabel: {
    width: 120,
    fontSize: 13,
    color: colors.text.secondary,
  },
  metricValue: {
    width: 44,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.border.subtle,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  insightRow: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    marginBottom: spacing.xs,
  },
  insightLabel: {
    fontSize: 12,
    color: colors.text.muted,
  },
  insightValue: {
    marginTop: 2,
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: "600",
  },
  sectionLabel: {
    marginTop: spacing.md,
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  metricSummaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingVertical: spacing.sm,
  },
  metricSummaryMain: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  metricSummaryTitle: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: "600",
  },
  metricSummaryMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  trendPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
  },
  trendPillPositive: {
    borderColor: colors.status.success,
    backgroundColor: "rgba(102, 177, 94, 0.12)",
  },
  trendPillNegative: {
    borderColor: colors.status.danger,
    backgroundColor: "rgba(201, 87, 87, 0.12)",
  },
  trendPillNeutral: {
    borderColor: colors.border.strong,
    backgroundColor: colors.background.elevated,
  },
  trendPillTextPositive: {
    fontSize: 12,
    color: colors.status.success,
    fontWeight: "700",
  },
  trendPillTextNegative: {
    fontSize: 12,
    color: colors.status.danger,
    fontWeight: "700",
  },
  trendPillTextNeutral: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: "700",
  },
});
