import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  EvidenceDots,
  PrimaryCard,
  SectionTitle,
  StatusPill,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { useHealthStore } from "@/features/health/store";
import { getEffectiveEntries } from "@/features/health/selectors";
import { getTrackedSupplementEvidenceScores } from "@/features/supplements/getTrackedSupplementEvidenceScores";
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

function computeMetricImprovement(
  healthMetrics,
  healthEntries,
  periodStart,
  today
) {
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
}

function PeriodSelector({ period, onChange }) {
  return (
    <View style={styles.filterRow}>
      {PERIOD_FILTERS.map((filter) => {
        const active = period === filter.key;

        return (
          <Pressable
            key={filter.key}
            accessibilityRole="button"
            accessibilityState={active ? { selected: true } : {}}
            accessibilityLabel={`Show ${filter.label.toLowerCase()} stats`}
            onPress={() => onChange(filter.key)}
            style={({ pressed }) => [
              styles.filterChip,
              active && styles.filterChipActive,
              pressed && styles.filterChipPressed,
            ]}
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
  );
}

function StatPanel({ label, value, meta, style, valueStyle }) {
  return (
    <View style={[styles.statPanel, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueStyle]}>{value}</Text>
      {meta ? <Text style={styles.statMeta}>{meta}</Text> : null}
    </View>
  );
}

function EvidenceGroupPanel({ title, count, items, tone }) {
  return (
    <View style={[styles.evidencePanel, evidencePanelToneStyles[tone]]}>
      <View style={styles.evidencePanelHeader}>
        <Text style={[styles.evidencePanelTitle, evidenceTitleToneStyles[tone]]}>
          {title}
        </Text>
        <StatusPill
          label={`${count} ${count === 1 ? "ITEM" : "ITEMS"}`}
          tone="neutral"
          style={styles.evidencePanelPill}
          textStyle={styles.evidencePanelPillText}
        />
      </View>

      {items.length ? (
        items.map((item) => (
          <View key={item.id} style={styles.evidenceItemRow}>
            <View style={styles.evidenceItemCopy}>
              <Text style={styles.evidenceItemName}>{item.name}</Text>
              <Text style={styles.evidenceItemMeta}>
                {Number.isFinite(item.score)
                  ? `${Math.round(item.score)}/100`
                  : "Unrated"}
              </Text>
            </View>
            <EvidenceDots score={item.score} style={styles.evidenceDots} />
          </View>
        ))
      ) : (
        <Text style={styles.evidenceEmpty}>None right now</Text>
      )}
    </View>
  );
}

function MetricInsightPanel({ title, items, emptyText, tone }) {
  return (
    <View style={[styles.metricInsightPanel, metricInsightToneStyles[tone]]}>
      <Text style={[styles.metricInsightTitle, metricInsightTextToneStyles[tone]]}>
        {title}
      </Text>

      {items.length ? (
        items.map((item) => (
          <View key={item.key} style={styles.metricInsightItem}>
            <Text style={styles.metricInsightStrong}>{item.label}</Text>
            <Text style={styles.metricInsightText}>{item.summary}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.metricInsightText}>{emptyText}</Text>
      )}
    </View>
  );
}

export default function StatsScreen() {
  const isFocused = useIsFocused();
  const supplements = useSupplementsStore((s) => s.supplements);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const healthEntries = useHealthStore((s) => getEffectiveEntries(s));
  const healthMetrics = useHealthStore((s) => s.metrics);

  const [period, setPeriod] = useState("weekly");
  const [today, setToday] = useState(() => toISODate(new Date()));
  const [ratingBySupplementId, setRatingBySupplementId] = useState({});

  useEffect(() => {
    if (!isFocused) return;
    setToday(toISODate(new Date()));
  }, [isFocused]);

  useEffect(() => {
    let active = true;
    if (!supplements?.length) {
      setRatingBySupplementId({});
      return undefined;
    }
    getTrackedSupplementEvidenceScores(supplements)
      .then((map) => {
        if (!active) return;
        setRatingBySupplementId(map);
      })
      .catch(() => {
        if (!active) return;
        setRatingBySupplementId({});
      });
    return () => {
      active = false;
    };
  }, [supplements]);

  const currentPeriod = PERIOD_FILTERS.find((item) => item.key === period);
  const periodDays = currentPeriod?.days ?? 7;

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
      if (typeof entry?.date === "string" && entry.date) {
        dateCandidates.push(entry.date);
      }
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
      const score = Number.isFinite(ratingBySupplementId[supplement.id])
        ? ratingBySupplementId[supplement.id]
        : null;
      const bucket = evidenceBucketForScore(score);
      groups[bucket].push({
        id: supplement.id,
        name: supplement.name,
        score,
      });
    });
    return groups;
  }, [activeSupplements, ratingBySupplementId]);

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
    <BackdropScreen
      header={
        <AppHeader
          leftSlot={
            <AppButton
              label="Back"
              onPress={() => router.back()}
              variant="ghost"
              size="sm"
              textStyle={styles.headerBackText}
              accessibilityLabel="Go back"
            />
          }
          title="STATS"
          titleStyle={styles.headerTitle}
          titleAccessory={
            <StatusPill
              label={(currentPeriod?.label ?? "Weekly").toUpperCase()}
              tone="neutral"
              style={styles.headerPeriodPill}
            />
          }
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Supplement performance insights
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      scrollContentStyle={styles.scrollContent}
      contentStyle={styles.content}
      bottomInsetOffset={100}
      minBottomPadding={120}
    >
      <PrimaryCard style={styles.filterCard}>
        <SectionTitle
          title="Time Window"
          subtitle="Choose the period for these insights."
          action={
            <StatusPill
              label={`${periodDays} ${periodDays === 1 ? "DAY" : "DAYS"}`}
              tone="neutral"
            />
          }
          style={styles.sectionHeader}
        />
        <PeriodSelector period={period} onChange={setPeriod} />
      </PrimaryCard>

      <PrimaryCard style={styles.heroCard}>
        <View pointerEvents="none" style={styles.heroGradientWrap}>
          <LinearGradient
            colors={[...appTheme.tabBar.fabGradient, "#FFFFFF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          />
        </View>

        <SectionTitle
          title="Adherence Overview"
          subtitle="How consistently you followed your routine in this period."
          action={<StatusPill label={`${adherenceScore}%`} tone="highlight" />}
          style={styles.sectionHeader}
        />

        <View style={styles.heroTopRow}>
          <StatPanel
            label="Adherence score"
            value={`${adherenceScore}%`}
            meta={`${currentSummary.taken}/${currentSummary.planned || 0} doses taken`}
            style={[styles.statPanelLarge, styles.heroPrimaryPanel]}
            valueStyle={styles.statValueLarge}
          />
          <StatPanel
            label="Missed doses"
            value={String(currentSummary.missed)}
            meta={missedTrendText}
            style={[styles.statPanelLarge, styles.heroSecondaryPanel]}
          />
        </View>

        <View style={styles.heroBottomRow}>
          <StatPanel
            label="Current streak"
            value={`${streakStats.currentStreak} days`}
            style={styles.heroTertiaryPanel}
          />
          <StatPanel
            label="Longest streak"
            value={`${streakStats.longestStreak} days`}
            style={styles.heroTertiaryPanel}
          />
        </View>
      </PrimaryCard>

      <PrimaryCard style={styles.sectionCard}>
        <SectionTitle
          title="Supplement Evidence"
          subtitle="How much of your active stack is backed by stronger evidence."
          action={
            <StatusPill
              label={`${activeSupplements.length} ACTIVE`}
              tone="neutral"
            />
          }
          style={styles.sectionHeader}
        />

        <View style={styles.sectionStack}>
          <EvidenceGroupPanel
            title="High Evidence"
            count={evidenceGroups.high.length}
            items={evidenceGroups.high}
            tone="high"
          />
          <EvidenceGroupPanel
            title="Good Evidence"
            count={evidenceGroups.good.length}
            items={evidenceGroups.good}
            tone="good"
          />
          <EvidenceGroupPanel
            title="Poor or Unrated"
            count={evidenceGroups.poor.length}
            items={evidenceGroups.poor}
            tone="poor"
          />
        </View>
      </PrimaryCard>

      <PrimaryCard style={styles.sectionCard}>
        <SectionTitle
          title="Health Metrics"
          subtitle="Trend direction across tracked metrics in this period."
          action={
            <StatusPill
              label={`${metricImprovement.items.length} TRACKED`}
              tone="neutral"
            />
          }
          style={styles.sectionHeader}
        />

        <View style={styles.metricCountsRow}>
          <StatPanel
            label="Improved"
            value={String(metricImprovement.improvedCount)}
            style={styles.metricCountPanel}
          />
          <StatPanel
            label="Stable"
            value={String(metricImprovement.stableCount)}
            style={styles.metricCountPanel}
          />
          <StatPanel
            label="Declined"
            value={String(metricImprovement.declinedCount)}
            style={styles.metricCountPanel}
          />
        </View>

        {metricImprovement.textCount > 0 ? (
          <Text style={styles.helperText}>
            {metricImprovement.textCount} text-based metric(s) were also
            tracked.
          </Text>
        ) : null}

        <View style={styles.sectionStack}>
          <MetricInsightPanel
            title="Improving"
            items={topImprovingMetrics}
            emptyText="No clear improving metrics yet in this period."
            tone="positive"
          />
          <MetricInsightPanel
            title="Needs attention"
            items={topDecliningMetrics}
            emptyText="No clear declining metrics in this period."
            tone="negative"
          />
        </View>
      </PrimaryCard>
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  content: {
    gap: spacing.md,
  },
  headerBackText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  headerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 22,
    letterSpacing: -0.43,
    fontFamily: typography.fontFamily.headingBlack,
    fontWeight: "900",
  },
  headerPeriodPill: {
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  sectionHeader: {
    marginBottom: spacing.md,
  },
  filterCard: {
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  filterChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: appTheme.colors.textStrong,
    borderColor: appTheme.colors.textStrong,
  },
  filterChipPressed: {
    opacity: 0.76,
  },
  filterText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  heroCard: {
    overflow: "hidden",
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  heroGradientWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  heroGradient: {
    flex: 1,
    opacity: 0.84,
  },
  heroTopRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  heroBottomRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sectionCard: {
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  sectionStack: {
    gap: spacing.sm,
  },
  statPanel: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  statPanelLarge: {
    minHeight: 148,
    justifyContent: "space-between",
  },
  heroPrimaryPanel: {
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  heroSecondaryPanel: {
    backgroundColor: "rgba(248,241,231,0.9)",
  },
  heroTertiaryPanel: {
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textTertiary,
    letterSpacing: -0.2,
  },
  statValue: {
    marginTop: 6,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.5,
  },
  statValueLarge: {
    fontSize: 34,
    lineHeight: 36,
    fontFamily: typography.fontFamily.headingBlack,
  },
  statMeta: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  evidencePanel: {
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  evidencePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  evidencePanelTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    letterSpacing: -0.3,
  },
  evidencePanelPill: {
    backgroundColor: "rgba(255,255,255,0.58)",
  },
  evidencePanelPillText: {
    color: appTheme.colors.textStrong,
  },
  evidenceItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  evidenceItemCopy: {
    flex: 1,
    minWidth: 0,
  },
  evidenceItemName: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textHeading,
  },
  evidenceItemMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  evidenceDots: {
    marginLeft: spacing.sm,
  },
  evidenceEmpty: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  metricCountsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metricCountPanel: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  helperText: {
    marginBottom: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  metricInsightPanel: {
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  metricInsightTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.2,
  },
  metricInsightItem: {
    marginTop: spacing.sm,
  },
  metricInsightStrong: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
  },
  metricInsightText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
});

const evidencePanelToneStyles = StyleSheet.create({
  high: {
    backgroundColor: "rgba(39,174,96,0.10)",
    borderColor: "rgba(39,174,96,0.18)",
  },
  good: {
    backgroundColor: "rgba(245,166,35,0.10)",
    borderColor: "rgba(245,166,35,0.18)",
  },
  poor: {
    backgroundColor: "rgba(201,87,87,0.10)",
    borderColor: "rgba(201,87,87,0.18)",
  },
});

const evidenceTitleToneStyles = StyleSheet.create({
  high: {
    color: appTheme.colors.evidenceStrong,
  },
  good: {
    color: appTheme.colors.evidenceModerate,
  },
  poor: {
    color: appTheme.colors.danger,
  },
});

const metricInsightToneStyles = StyleSheet.create({
  positive: {
    backgroundColor: "rgba(39,174,96,0.10)",
    borderColor: "rgba(39,174,96,0.18)",
  },
  negative: {
    backgroundColor: "rgba(201,87,87,0.10)",
    borderColor: "rgba(201,87,87,0.18)",
  },
});

const metricInsightTextToneStyles = StyleSheet.create({
  positive: {
    color: appTheme.colors.evidenceStrong,
  },
  negative: {
    color: appTheme.colors.danger,
  },
});
