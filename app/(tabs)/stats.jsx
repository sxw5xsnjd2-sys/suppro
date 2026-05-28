import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle } from "react-native-svg";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  SectionTitle,
  StatusPill,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { useHealthStore } from "@/features/health/store";
import { getEffectiveEntries } from "@/features/health/selectors";
import { getTrackedSupplementEvidenceScores } from "@/features/supplements/getTrackedSupplementEvidenceScores";
import { isSupplementScheduledOnDate } from "@/features/supplements/schedule";
import { computeMetricImprovement } from "@/features/health/metricTrends";

const PERIOD_FILTERS = [
  { key: "daily", label: "Daily", days: 1 },
  { key: "weekly", label: "Weekly", days: 7 },
  { key: "monthly", label: "Monthly", days: 30 },
];

const ADHERENCE_ARC_SIZE = 140;
const ADHERENCE_ARC_STROKE = 10;
const ADHERENCE_ARC_RADIUS =
  (ADHERENCE_ARC_SIZE - ADHERENCE_ARC_STROKE) / 2;
const ADHERENCE_ARC_CIRCUMFERENCE = 2 * Math.PI * ADHERENCE_ARC_RADIUS;
const ADHERENCE_ROSE = "#A6685B";
const ADHERENCE_CHIP_BG = "rgba(232,204,224,0.32)";
const GLASS_CARD_BORDER = "rgba(255,255,255,0.8)";
const GLASS_CARD_BG = "rgba(255,255,255,0.7)";
const INSET_DIVIDER = "rgba(26,24,32,0.05)";
const EMPTY_MUTED = "#8B8595";
const METRIC_LABEL_MUTED = "#A19BAB";

const tierToneConfig = {
  high: {
    badgeBg: "#E5F1E2",
    accent: "#3D8A53",
  },
  good: {
    badgeBg: "#F8E8D2",
    accent: "#A8742B",
  },
  poor: {
    badgeBg: "#F8DDD2",
    accent: "#A6685B",
  },
  up: {
    badgeBg: "#E5F1E2",
    accent: "#3D8A53",
  },
  down: {
    badgeBg: "#F8DDD2",
    accent: "#A6685B",
  },
};

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

function AdherenceArc({ score, taken, planned }) {
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const strokeDashoffset =
    ADHERENCE_ARC_CIRCUMFERENCE * (1 - progress);
  const doseCaption = `${taken}/${planned || 0} doses taken`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${score}% adherence, ${taken} of ${planned} doses taken`}
      style={styles.adherenceArcWrap}
    >
      <Svg
        width={ADHERENCE_ARC_SIZE}
        height={ADHERENCE_ARC_SIZE}
        viewBox={`0 0 ${ADHERENCE_ARC_SIZE} ${ADHERENCE_ARC_SIZE}`}
      >
        <Circle
          cx={ADHERENCE_ARC_SIZE / 2}
          cy={ADHERENCE_ARC_SIZE / 2}
          r={ADHERENCE_ARC_RADIUS}
          fill="none"
          stroke="rgba(26,24,32,0.06)"
          strokeWidth={ADHERENCE_ARC_STROKE}
        />
        {progress > 0 ? (
          <Circle
            cx={ADHERENCE_ARC_SIZE / 2}
            cy={ADHERENCE_ARC_SIZE / 2}
            r={ADHERENCE_ARC_RADIUS}
            fill="none"
            stroke={ADHERENCE_ROSE}
            strokeWidth={ADHERENCE_ARC_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ADHERENCE_ARC_CIRCUMFERENCE} ${ADHERENCE_ARC_CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${ADHERENCE_ARC_SIZE / 2} ${ADHERENCE_ARC_SIZE / 2})`}
          />
        ) : null}
      </Svg>
      <View pointerEvents="none" style={styles.adherenceArcCenter}>
        <Text style={styles.adherenceArcValue}>{score}%</Text>
        <Text style={styles.adherenceArcCaption}>{doseCaption}</Text>
      </View>
    </View>
  );
}

function AdherenceMiniMetric({
  label,
  value,
  meta,
  metaStyle,
  iconName,
}) {
  return (
    <View style={styles.adherenceMetricRow}>
      <View style={styles.adherenceMetricCopy}>
        <Text style={styles.adherenceMetricLabel}>{label}</Text>
        <Text style={styles.adherenceMetricValue}>{value}</Text>
        {meta ? (
          <Text style={[styles.adherenceMetricMeta, metaStyle]}>{meta}</Text>
        ) : null}
      </View>
      {iconName ? (
        <View style={styles.adherenceGlyphChip}>
          <Ionicons name={iconName} size={15} color={ADHERENCE_ROSE} />
        </View>
      ) : null}
    </View>
  );
}

function DensityCapsules({ count, color }) {
  const filledCount = Math.min(Math.max(count, 0), 5);

  return (
    <View style={styles.densityCapsules}>
      {Array.from({ length: 5 }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.densityCapsule,
            index < filledCount
              ? { backgroundColor: color }
              : styles.densityCapsuleInactive,
          ]}
        />
      ))}
    </View>
  );
}

function QualitativeTierRow({
  title,
  detail,
  count,
  tone,
  empty = false,
  detailNumberOfLines,
}) {
  const toneConfig = tierToneConfig[tone];

  return (
    <View style={styles.qualitativeRow}>
      <View
        style={[
          styles.qualitativeBadge,
          { backgroundColor: toneConfig.badgeBg },
        ]}
      >
        <Text
          style={[
            styles.qualitativeBadgeValue,
            { color: toneConfig.accent },
          ]}
        >
          {count}
        </Text>
      </View>

      <View style={styles.qualitativeCopy}>
        <Text style={[styles.qualitativeTitle, { color: toneConfig.accent }]}>
          {title}
        </Text>
        <Text
          numberOfLines={detailNumberOfLines}
          style={[
            styles.qualitativeDetail,
            empty && styles.qualitativeDetailEmpty,
          ]}
        >
          {detail}
        </Text>
      </View>

      <DensityCapsules count={count} color={toneConfig.accent} />
    </View>
  );
}

function InsetDivider() {
  return (
    <View style={styles.insetDividerWrap}>
      <View style={styles.insetDivider} />
    </View>
  );
}

function TrendStatCell({ label, value, arrow, tone }) {
  return (
    <View style={styles.trendStatCell}>
      <Text style={[styles.trendStatArrow, { color: tone }]}>{arrow}</Text>
      <Text style={styles.trendStatValue}>{value}</Text>
      <Text style={styles.trendStatLabel}>{label}</Text>
    </View>
  );
}

export function StatsContent({ presentation = "screen" }) {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
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
      const plannedSupplements = (supplements ?? []).filter((supplement) =>
        isSupplementScheduledOnDate(supplement, date)
      );
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
  const missedTrendIsPositive = missedTrendText.startsWith("↓");
  const stacksAdherenceCard = width < 360;

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
        today,
        {
          previousPeriodStart: previousPeriodDates[0],
          previousPeriodEnd: previousPeriodDates[previousPeriodDates.length - 1],
        }
      ),
    [healthMetrics, healthEntries, periodDates, previousPeriodDates, today]
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

  const isInline = presentation === "inline";
  const content = (
    <>
      <View style={styles.sectionBlock}>
        <PeriodSelector period={period} onChange={setPeriod} />
      </View>

      <View style={styles.sectionDivider} />

      <View style={styles.sectionBlock}>
        <SectionTitle
          title="Adherence Overview"
          subtitle="How consistently you followed your routine in this period."
          style={styles.sectionHeader}
        />

        <View
          style={[
            styles.adherenceHeroCard,
            stacksAdherenceCard && styles.adherenceHeroCardStacked,
          ]}
        >
          <View pointerEvents="none" style={styles.adherenceCardHighlight} />

          <View
            style={[
              styles.adherenceArcColumn,
              stacksAdherenceCard && styles.adherenceArcColumnStacked,
            ]}
          >
            <Text style={styles.adherenceMetricLabel}>Adherence score</Text>
            <AdherenceArc
              score={adherenceScore}
              taken={currentSummary.taken}
              planned={currentSummary.planned}
            />
          </View>

          <View style={styles.adherenceMetricStack}>
            <AdherenceMiniMetric
              label="Missed doses"
              value={String(currentSummary.missed)}
              meta={missedTrendText}
              metaStyle={
                missedTrendIsPositive && styles.adherenceMetricMetaPositive
              }
            />
            <AdherenceMiniMetric
              label="Current streak"
              value={`${streakStats.currentStreak} days`}
              iconName="flame"
            />
            <AdherenceMiniMetric
              label="Longest streak"
              value={`${streakStats.longestStreak} days`}
              iconName="sparkles"
            />
          </View>
        </View>
      </View>

      <View style={styles.sectionDivider} />

      <View style={styles.sectionBlock}>
        <SectionTitle
          title="Supplement Evidence"
          subtitle="How much of your active stack is backed by stronger evidence."
          style={styles.sectionHeader}
        />

        <View style={styles.glassCard}>
          <QualitativeTierRow
            title="High Evidence"
            detail={
              evidenceGroups.high.length
                ? evidenceGroups.high.map((item) => item.name).join(", ")
                : "None right now"
            }
            count={evidenceGroups.high.length}
            tone="high"
            empty={evidenceGroups.high.length === 0}
            detailNumberOfLines={evidenceGroups.high.length ? 2 : undefined}
          />
          <InsetDivider />
          <QualitativeTierRow
            title="Good Evidence"
            detail={
              evidenceGroups.good.length
                ? evidenceGroups.good.map((item) => item.name).join(", ")
                : "None right now"
            }
            count={evidenceGroups.good.length}
            tone="good"
            empty={evidenceGroups.good.length === 0}
            detailNumberOfLines={evidenceGroups.good.length ? 2 : undefined}
          />
          <InsetDivider />
          <QualitativeTierRow
            title="Poor or Unrated"
            detail={
              evidenceGroups.poor.length
                ? evidenceGroups.poor.map((item) => item.name).join(", ")
                : "None right now"
            }
            count={evidenceGroups.poor.length}
            tone="poor"
            empty={evidenceGroups.poor.length === 0}
            detailNumberOfLines={evidenceGroups.poor.length ? 2 : undefined}
          />
        </View>
      </View>

      <View style={styles.sectionDivider} />

      <View style={styles.sectionBlock}>
        <SectionTitle
          title="Health Metrics"
          subtitle="Trend direction across tracked metrics in this period."
          style={styles.sectionHeader}
        />

        <View style={styles.glassCard}>
          <View style={styles.metricCountsGrid}>
            <TrendStatCell
            label="Improved"
              value={String(metricImprovement.improvedCount)}
              arrow="↗"
              tone={tierToneConfig.up.accent}
            />
            <TrendStatCell
            label="Stable"
            value={String(metricImprovement.stableCount)}
              arrow="→"
              tone={METRIC_LABEL_MUTED}
            />
            <TrendStatCell
            label="Declined"
            value={String(metricImprovement.declinedCount)}
              arrow="↘"
              tone={tierToneConfig.down.accent}
            />
          </View>

          <InsetDivider />
          <QualitativeTierRow
            title="Improving"
            detail={
              topImprovingMetrics.length
                ? topImprovingMetrics.map((item) => item.summary).join(" • ")
                : "No clear improving metrics yet in this period."
            }
            count={metricImprovement.improvedCount}
            tone="up"
            empty={topImprovingMetrics.length === 0}
            detailNumberOfLines={topImprovingMetrics.length ? 3 : undefined}
          />
          <InsetDivider />
          <QualitativeTierRow
            title="Needs attention"
            detail={
              topDecliningMetrics.length
                ? topDecliningMetrics.map((item) => item.summary).join(" • ")
                : "No clear declining metrics in this period."
            }
            count={metricImprovement.declinedCount}
            tone="down"
            empty={topDecliningMetrics.length === 0}
            detailNumberOfLines={topDecliningMetrics.length ? 3 : undefined}
          />
        </View>

        {metricImprovement.textCount > 0 ? (
          <Text style={styles.helperText}>
            {metricImprovement.textCount} text-based metric(s) were also
            tracked.
          </Text>
        ) : null}
        {metricImprovement.insufficientCount > 0 ? (
          <Text style={styles.helperText}>
            {metricImprovement.insufficientCount} metric(s) need another entry
            before a trend can be classified.
          </Text>
        ) : null}
      </View>
    </>
  );

  if (isInline) {
    return content;
  }

  return (
    <BackdropScreen
      headerBehavior="collapsible"
      collapsedTitle="STATS"
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
      {content}
    </BackdropScreen>
  );
}

export default function StatsScreen() {
  return <StatsContent />;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  content: {
    gap: spacing.md,
  },
  sectionBlock: {
    paddingVertical: spacing.xs,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: appTheme.colors.borderSubtle,
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
  adherenceHeroCard: {
    position: "relative",
    flexDirection: "row",
    gap: spacing.md,
    padding: appTheme.card.padding,
    borderRadius: appTheme.card.radius,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    backgroundColor: "rgba(255,255,255,0.7)",
    shadowColor: "#1A1820",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    ...Platform.select({
      android: {
        backgroundColor: appTheme.colors.surface,
        borderColor: appTheme.colors.borderSubtle,
        overflow: "hidden",
        elevation: 0,
        shadowOpacity: 0,
      },
    }),
  },
  adherenceHeroCardStacked: {
    flexDirection: "column",
  },
  adherenceCardHighlight: {
    position: "absolute",
    top: 1,
    left: appTheme.card.radius,
    right: appTheme.card.radius,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.86)",
  },
  adherenceArcColumn: {
    flex: 1.1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  adherenceArcColumnStacked: {
    alignSelf: "center",
  },
  adherenceArcWrap: {
    width: ADHERENCE_ARC_SIZE,
    height: ADHERENCE_ARC_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  adherenceArcCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  adherenceArcValue: {
    fontSize: 40,
    lineHeight: 40,
    fontFamily: typography.display.fontFamily,
    fontWeight: typography.display.fontWeight,
    color: appTheme.colors.textHeading,
    letterSpacing: -1.2,
  },
  adherenceArcCaption: {
    marginTop: 7,
    textAlign: "center",
    fontSize: 9,
    lineHeight: 12,
    fontFamily: typography.fontFamily.monoMedium,
    color: appTheme.colors.textMuted,
    letterSpacing: 1.26,
    textTransform: "uppercase",
  },
  adherenceMetricStack: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: spacing.md,
  },
  adherenceMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  adherenceMetricCopy: {
    flex: 1,
    minWidth: 0,
  },
  adherenceMetricLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: typography.fontFamily.monoMedium,
    color: appTheme.colors.textMuted,
    letterSpacing: 1.26,
    textTransform: "uppercase",
  },
  adherenceMetricValue: {
    marginTop: 5,
    fontSize: typography.title.fontSize,
    lineHeight: 24,
    fontFamily: typography.title.fontFamily,
    fontWeight: typography.title.fontWeight,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.4,
  },
  adherenceMetricMeta: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textMuted,
  },
  adherenceMetricMetaPositive: {
    color: appTheme.colors.success,
  },
  adherenceGlyphChip: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ADHERENCE_CHIP_BG,
  },
  glassCard: {
    borderRadius: appTheme.card.radius,
    borderWidth: 1,
    borderColor: GLASS_CARD_BORDER,
    backgroundColor: GLASS_CARD_BG,
    shadowColor: "#1A1820",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    overflow: "hidden",
    ...Platform.select({
      android: {
        backgroundColor: appTheme.colors.surface,
        borderColor: appTheme.colors.borderSubtle,
        elevation: 0,
        shadowOpacity: 0,
      },
    }),
  },
  insetDividerWrap: {
    paddingHorizontal: 16,
  },
  insetDivider: {
    height: 1,
    backgroundColor: INSET_DIVIDER,
  },
  qualitativeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  qualitativeBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  qualitativeBadgeValue: {
    fontSize: 17,
    lineHeight: 18,
    fontFamily: typography.display.fontFamily,
    fontWeight: typography.display.fontWeight,
  },
  qualitativeCopy: {
    flex: 1,
    minWidth: 0,
  },
  qualitativeTitle: {
    fontSize: 14.5,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    letterSpacing: -0.08,
  },
  qualitativeDetail: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: EMPTY_MUTED,
  },
  qualitativeDetailEmpty: {
    color: EMPTY_MUTED,
  },
  densityCapsules: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: spacing.xs,
  },
  densityCapsule: {
    width: 4,
    height: 14,
    borderRadius: 999,
  },
  densityCapsuleInactive: {
    backgroundColor: "rgba(26,24,32,0.06)",
  },
  metricCountsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: 16,
  },
  trendStatCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 108,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  trendStatArrow: {
    fontSize: 16,
    lineHeight: 18,
    opacity: 0.7,
    marginBottom: 6,
  },
  trendStatValue: {
    fontSize: 28,
    lineHeight: 28,
    fontFamily: typography.display.fontFamily,
    fontWeight: typography.display.fontWeight,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.84,
  },
  trendStatLabel: {
    marginTop: 8,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: typography.fontFamily.monoMedium,
    color: METRIC_LABEL_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1.26,
  },
  helperText: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
});
