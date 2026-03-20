import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { HomeHeader } from "@/features/supplements/components/HomeHeader";
import {
  EmptyStateCard,
  EvidenceDots,
  PrimaryCard,
  SectionTitle,
  StatusPill,
  getEvidenceDisplay,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { useHealthStore } from "@/features/health/store";
import { getEffectiveEntries } from "@/features/health/selectors";
import { getSupplementRatings } from "@src/data/getSupplementRatings";
import { getAccessTokenOrCreateSession } from "@src/lib/supabase";
import { SUPABASE_URL } from "@src/lib/runtimeConfig";
import {
  isNumericMetric,
  normalizeMetric,
} from "@/features/health/metricDefinitions";
import { Icon } from "@/features/supplements/icons/Icon";

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
const AI_SUMMARY_CACHE_KEY = "suppro.stats.aiSummary.v1";
const AI_SUMMARY_WINDOW_DAYS = 30;

function EmptyState() {
  return (
    <EmptyStateCard
      title="No supplements due"
      description="You don’t have anything scheduled for this date."
    />
  );
}

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

function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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
        };
      }

      const values = entries
        .map((entry) => Number(entry.value))
        .filter((value) => Number.isFinite(value));
      if (values.length < 2) {
        return {
          key: metric.key,
          label: metric.label,
          kind: "numeric",
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

function sanitizeRecommendations(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeAiSummaryPayload(payload) {
  const summary =
    typeof payload?.summary === "string" ? payload.summary.trim() : "";
  if (!summary) {
    throw new Error("AI summary response did not include summary text.");
  }

  return {
    summary,
    recommendations: sanitizeRecommendations(payload?.recommendations),
  };
}

function parseAiSummaryCache(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (
      typeof parsed.generatedForDate !== "string" ||
      typeof parsed.summary !== "string"
    ) {
      return null;
    }
    return {
      generatedForDate: parsed.generatedForDate,
      generatedAt:
        typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      source: parsed.source === "fallback" ? "fallback" : "openai",
      summary: parsed.summary.trim(),
      recommendations: sanitizeRecommendations(parsed.recommendations),
    };
  } catch {
    return null;
  }
}

function buildFallbackAiSummary(input) {
  const adherenceTone =
    input.adherence.score >= 85
      ? "Adherence is strong and supporting consistency."
      : input.adherence.score >= 70
      ? "Adherence is moderate with room for a steadier routine."
      : "Adherence is currently low and likely limiting outcomes.";
  const evidenceTone =
    input.evidence.score >= 70
      ? "Most taken doses are backed by moderate-to-high evidence."
      : "A meaningful share of taken doses appears lower-evidence.";
  const metricsTone =
    input.metrics.declinedCount > input.metrics.improvedCount
      ? "Recent metric trends show more declines than improvements."
      : input.metrics.improvedCount > input.metrics.declinedCount
      ? "Recent metric trends show more improvements than declines."
      : "Recent metric trends are mostly stable.";

  const recommendations = [];
  if (input.adherence.score < 80) {
    recommendations.push(
      "Simplify your routine and tighten dose timing to improve adherence consistency."
    );
  }
  if (input.evidence.score < 65) {
    recommendations.push(
      "Prioritize a higher share of supplements with stronger evidence backing."
    );
  }
  if (input.metrics.topDecliningLabels.some((label) => /sleep/i.test(label))) {
    recommendations.push(
      "Focus on sleep-supportive choices and habits before adding complexity."
    );
  }
  if (input.metrics.declinedCount > input.metrics.improvedCount) {
    recommendations.push(
      "Recenter on core foundations like sleep, stress, and recovery while tracking changes weekly."
    );
  }
  if (!recommendations.length) {
    recommendations.push(
      "Maintain your current routine and keep prioritizing high-evidence options aligned to your main health goals."
    );
  }

  return {
    summary: `${adherenceTone} ${evidenceTone} ${metricsTone}`,
    recommendations: recommendations.slice(0, 4),
  };
}

function isScheduledOnDate(supplement, date) {
  if (supplement?.startDate && date < supplement.startDate) return false;
  if (supplement?.endDate && date > supplement.endDate) return false;
  const dayOfWeek = parseISODate(date).getDay();
  if (
    Array.isArray(supplement?.daysOfWeek) &&
    supplement.daysOfWeek.length > 0
  ) {
    return supplement.daysOfWeek.includes(dayOfWeek);
  }
  return true;
}

function formatSelectedDateHeading(date) {
  return parseISODate(date)
    .toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    .toUpperCase();
}

function AISummaryCard({
  summary,
  loading,
  expanded,
  onToggleExpanded,
  generatedLabel,
  error,
  source,
}) {
  return (
    <PrimaryCard style={styles.aiSummaryCard}>
      <View style={styles.aiSummaryHeader}>
        <Text style={styles.aiSummaryTitle}>AI summary</Text>
        <Text style={styles.aiSummaryMeta}>
          {generatedLabel
            ? `Updated ${generatedLabel}`
            : `Last ${AI_SUMMARY_WINDOW_DAYS} days`}
        </Text>
      </View>

      <Text
        style={styles.aiSummaryBody}
        numberOfLines={expanded ? undefined : 1}
      >
        {loading && !summary
          ? "Generating today's summary..."
          : summary ||
            "No summary yet. Open this page again once more data is available."}
      </Text>

      {(!loading || summary) && (
        <Pressable onPress={onToggleExpanded} style={styles.aiSummaryReadMore}>
          <Text style={styles.aiSummaryReadMoreText}>
            {expanded ? "Show less" : "...Read more"}
          </Text>
        </Pressable>
      )}

      {expanded && error ? (
        <Text style={styles.aiSummaryError}>{error}</Text>
      ) : null}
      {expanded && source === "fallback" && !error ? (
        <Text style={styles.aiSummaryFallback}>
          Using local fallback summary.
        </Text>
      ) : null}
    </PrimaryCard>
  );
}

function SupplementRow({
  supplement,
  taken,
  takenAt,
  score,
  onPress,
  onLongPress,
  onEditPress,
}) {
  const evidence = getEvidenceDisplay(score);

  return (
    <PrimaryCard
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.supplementCard, taken && styles.supplementCardTaken]}
      pressedStyle={!taken ? styles.supplementCardPressed : null}
    >
      <View style={styles.supplementCardTopRow}>
        {evidence.badgeLabel ? (
          <StatusPill label={evidence.badgeLabel} style={styles.evidenceBadge} />
        ) : (
          <View />
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${supplement.name}`}
          hitSlop={6}
          onPress={(event) => {
            event.stopPropagation?.();
            onEditPress?.();
          }}
          onPressIn={(event) => event.stopPropagation?.()}
          style={({ pressed }) => [
            styles.editPill,
            pressed && styles.editPillPressed,
          ]}
        >
          <Text style={styles.editPillText}>Edit</Text>
        </Pressable>
      </View>

      <View style={[styles.supplementRow, taken && styles.supplementRowTaken]}>
        <View style={[styles.iconCircle, taken && styles.iconCircleTaken]}>
          <Icon route={supplement.route || "tablet"} size={22} />
        </View>

        <View style={styles.supplementCopy}>
          <View style={styles.supplementNameRow}>
            <Text
              style={[
                styles.supplementName,
                taken && styles.supplementNameTaken,
              ]}
              numberOfLines={1}
            >
              {supplement.name}
            </Text>
            <EvidenceDots score={score} muted={taken} />
          </View>

          <Text
            style={[styles.supplementMeta, taken && styles.supplementMetaTaken]}
            numberOfLines={1}
          >
            {taken && takenAt ? `Taken ${takenAt}` : supplement.time}
          </Text>
        </View>

        <View style={styles.supplementActions}>
          {supplement.dose ? (
            <Text style={[styles.doseText, taken && styles.doseTextTaken]}>
              {supplement.dose.trim()}
            </Text>
          ) : null}
          <View style={[styles.checkCircle, taken && styles.checkCircleTaken]}>
            {taken ? (
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
            ) : null}
          </View>
        </View>
      </View>
    </PrimaryCard>
  );
}

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const supplements = useSupplementsStore((s) => s.supplements);
  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const toggleTaken = useSupplementsStore((s) => s.toggleTaken);
  const healthEntries = useHealthStore((s) => getEffectiveEntries(s));
  const healthMetrics = useHealthStore((s) => s.metrics);

  const [ratingByCatalog, setRatingByCatalog] = useState({});
  const [today, setToday] = useState(() => toISODate(new Date()));
  const [aiSummaryText, setAiSummaryText] = useState("");
  const [, setAiSummaryRecommendations] = useState([]);
  const [aiSummaryGeneratedAt, setAiSummaryGeneratedAt] = useState(null);
  const [aiSummarySource, setAiSummarySource] = useState("openai");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState(null);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);

  const dueSupplements = useMemo(
    () =>
      supplements
        .filter((supplement) => isScheduledOnDate(supplement, selectedDate))
        .sort((a, b) => a.timeMinutes - b.timeMinutes),
    [supplements, selectedDate]
  );

  const takenTimes = useMemo(
    () => takenTimesByDate[selectedDate] ?? {},
    [takenTimesByDate, selectedDate]
  );

  useEffect(() => {
    if (!isFocused) return;
    setToday(toISODate(new Date()));
  }, [isFocused]);

  useEffect(() => {
    let active = true;
    const catalogIds = Array.from(
      new Set((supplements ?? []).map((s) => s.catalogId).filter(Boolean))
    );
    if (catalogIds.length === 0) {
      setRatingByCatalog({});
      return;
    }
    getSupplementRatings(catalogIds).then((map) => {
      if (active) setRatingByCatalog(map);
    });
    return () => {
      active = false;
    };
  }, [supplements]);

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
      const takenCountForDate = plannedSupplements.reduce(
        (count, supplement) => (dayTakenMap[supplement.id] ? count + 1 : count),
        0
      );
      map[date] = {
        date,
        dayOfWeek,
        plannedSupplements,
        plannedCount: plannedSupplements.length,
        takenCount: takenCountForDate,
        missedCount: Math.max(plannedSupplements.length - takenCountForDate, 0),
        takenLookup: dayTakenMap,
      };
    });
    return map;
  }, [allDates, supplements, takenTimesByDate]);

  const summarizeDates = useCallback(
    (dates) => {
      const byDayOfWeek = [
        { key: 0, label: "Sun" },
        { key: 1, label: "Mon" },
        { key: 2, label: "Tue" },
        { key: 3, label: "Wed" },
        { key: 4, label: "Thu" },
        { key: 5, label: "Fri" },
        { key: 6, label: "Sat" },
      ].reduce((acc, item) => {
        acc[item.key] = { ...item, planned: 0, taken: 0 };
        return acc;
      }, {});
      const byTimeOfDay = [
        { key: "morning", label: "Morning" },
        { key: "afternoon", label: "Afternoon" },
        { key: "evening", label: "Evening" },
      ].reduce((acc, item) => {
        acc[item.key] = { ...item, planned: 0, taken: 0 };
        return acc;
      }, {});

      const summary = {
        planned: 0,
        taken: 0,
        missed: 0,
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

          if (!wasTaken) return;

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

  const aiPeriodDates = useMemo(() => {
    const start = addDays(today, -(AI_SUMMARY_WINDOW_DAYS - 1));
    return listDatesBetween(start, today);
  }, [today]);

  const aiPreviousPeriodDates = useMemo(() => {
    const end = addDays(today, -AI_SUMMARY_WINDOW_DAYS);
    const start = addDays(end, -(AI_SUMMARY_WINDOW_DAYS - 1));
    return listDatesBetween(start, end);
  }, [today]);

  const aiCurrentSummary = useMemo(
    () => summarizeDates(aiPeriodDates),
    [aiPeriodDates, summarizeDates]
  );

  const aiPreviousSummary = useMemo(
    () => summarizeDates(aiPreviousPeriodDates),
    [aiPreviousPeriodDates, summarizeDates]
  );

  const aiAdherenceScore = toPercent(
    aiCurrentSummary.taken,
    aiCurrentSummary.planned
  );
  const aiPreviousAdherenceScore = toPercent(
    aiPreviousSummary.taken,
    aiPreviousSummary.planned
  );
  const aiAdherenceDelta = aiAdherenceScore - aiPreviousAdherenceScore;
  const aiConsistencyTrend =
    aiAdherenceDelta >= 5
      ? "Improving"
      : aiAdherenceDelta <= -5
      ? "Declining"
      : "Stable";

  const aiEvidenceKnownTotal =
    aiCurrentSummary.evidence.high +
    aiCurrentSummary.evidence.moderate +
    aiCurrentSummary.evidence.low;
  const aiEvidenceScore = aiCurrentSummary.evidence.knownCount
    ? Math.round(
        (aiCurrentSummary.evidence.points /
          (aiCurrentSummary.evidence.knownCount * 3)) *
          100
      )
    : 0;
  const aiEvidenceDistribution = useMemo(
    () => ({
      high: aiEvidenceKnownTotal
        ? Math.round(
            (aiCurrentSummary.evidence.high / aiEvidenceKnownTotal) * 100
          )
        : 0,
      moderate: aiEvidenceKnownTotal
        ? Math.round(
            (aiCurrentSummary.evidence.moderate / aiEvidenceKnownTotal) * 100
          )
        : 0,
      low: aiEvidenceKnownTotal
        ? Math.round(
            (aiCurrentSummary.evidence.low / aiEvidenceKnownTotal) * 100
          )
        : 0,
      unknown: aiCurrentSummary.evidence.unknown,
    }),
    [aiCurrentSummary, aiEvidenceKnownTotal]
  );

  const aiMetricImprovement = useMemo(
    () =>
      computeMetricImprovement(
        healthMetrics,
        healthEntries,
        aiPeriodDates[0] ?? today,
        today
      ),
    [healthMetrics, healthEntries, aiPeriodDates, today]
  );

  const aiWeakestDay = useMemo(() => {
    const byDay = [
      { key: 0, label: "Sun" },
      { key: 1, label: "Mon" },
      { key: 2, label: "Tue" },
      { key: 3, label: "Wed" },
      { key: 4, label: "Thu" },
      { key: 5, label: "Fri" },
      { key: 6, label: "Sat" },
    ]
      .map((day) => {
        const stat = aiCurrentSummary.byDayOfWeek[day.key];
        return {
          label: day.label,
          adherence: toPercent(stat.taken, stat.planned),
          planned: stat.planned,
        };
      })
      .filter((item) => item.planned > 0);
    if (!byDay.length) return null;
    return byDay.sort((a, b) => a.adherence - b.adherence)[0];
  }, [aiCurrentSummary]);

  const aiWeakestTimeOfDay = useMemo(() => {
    const byTime = [
      { key: "morning", label: "Morning" },
      { key: "afternoon", label: "Afternoon" },
      { key: "evening", label: "Evening" },
    ]
      .map((bucket) => {
        const stat = aiCurrentSummary.byTimeOfDay[bucket.key];
        return {
          label: bucket.label,
          adherence: toPercent(stat.taken, stat.planned),
          planned: stat.planned,
        };
      })
      .filter((item) => item.planned > 0);
    if (!byTime.length) return null;
    return byTime.sort((a, b) => a.adherence - b.adherence)[0];
  }, [aiCurrentSummary]);

  const aiTrendHighlights = useMemo(() => {
    const numericItems = aiMetricImprovement.items.filter(
      (item) => item.kind === "numeric"
    );
    return {
      topDeclining: numericItems
        .filter((item) => item.trend === "declined")
        .sort((a, b) => a.directionDelta - b.directionDelta)
        .slice(0, 3)
        .map((item) => ({
          label: item.label,
          delta: Number(formatNumber(item.delta)),
          trend: item.trend,
        })),
      topImproving: numericItems
        .filter((item) => item.trend === "improved")
        .sort((a, b) => b.directionDelta - a.directionDelta)
        .slice(0, 3)
        .map((item) => ({
          label: item.label,
          delta: Number(formatNumber(item.delta)),
          trend: item.trend,
        })),
    };
  }, [aiMetricImprovement]);

  const aiSummaryInput = useMemo(
    () => ({
      analysisWindowDays: AI_SUMMARY_WINDOW_DAYS,
      adherence: {
        score: aiAdherenceScore,
        deltaVsPreviousWindow: aiAdherenceDelta,
        trend: aiConsistencyTrend,
        taken: aiCurrentSummary.taken,
        planned: aiCurrentSummary.planned,
        missed: aiCurrentSummary.missed,
      },
      evidence: {
        score: aiEvidenceScore,
        highPercent: aiEvidenceDistribution.high,
        moderatePercent: aiEvidenceDistribution.moderate,
        lowPercent: aiEvidenceDistribution.low,
        unknownTakenDoses: aiEvidenceDistribution.unknown,
      },
      metrics: {
        improvedCount: aiMetricImprovement.improvedCount,
        stableCount: aiMetricImprovement.stableCount,
        declinedCount: aiMetricImprovement.declinedCount,
        textCount: aiMetricImprovement.textCount,
        topDeclining: aiTrendHighlights.topDeclining,
        topImproving: aiTrendHighlights.topImproving,
      },
      consistency: {
        weakestDay: aiWeakestDay,
        weakestTimeOfDay: aiWeakestTimeOfDay,
      },
    }),
    [
      aiAdherenceScore,
      aiAdherenceDelta,
      aiConsistencyTrend,
      aiCurrentSummary,
      aiEvidenceScore,
      aiEvidenceDistribution,
      aiMetricImprovement,
      aiTrendHighlights,
      aiWeakestDay,
      aiWeakestTimeOfDay,
    ]
  );

  const aiFallbackSummary = useMemo(
    () =>
      buildFallbackAiSummary({
        adherence: aiSummaryInput.adherence,
        evidence: aiSummaryInput.evidence,
        metrics: {
          ...aiSummaryInput.metrics,
          topDecliningLabels: aiSummaryInput.metrics.topDeclining.map(
            (item) => item.label
          ),
        },
      }),
    [aiSummaryInput]
  );

  const aiSummaryGeneratedLabel = useMemo(() => {
    if (!aiSummaryGeneratedAt) return null;
    const parsed = new Date(aiSummaryGeneratedAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [aiSummaryGeneratedAt]);

  useEffect(() => {
    if (!isFocused) return undefined;
    let cancelled = false;

    const hydrateOrGenerate = async () => {
      setAiSummaryError(null);

      const cachedRaw = await AsyncStorage.getItem(AI_SUMMARY_CACHE_KEY);
      const cached = cachedRaw ? parseAiSummaryCache(cachedRaw) : null;
      if (
        cached &&
        cached.generatedForDate === today &&
        typeof cached.summary === "string" &&
        cached.summary.trim()
      ) {
        if (!cancelled) {
          setAiSummaryText(cached.summary);
          setAiSummaryRecommendations(cached.recommendations);
          setAiSummaryGeneratedAt(cached.generatedAt);
          setAiSummarySource(cached.source);
          setAiSummaryLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setAiSummaryText("");
        setAiSummaryRecommendations([]);
        setAiSummaryGeneratedAt(null);
        setAiSummarySource("openai");
        setAiSummaryLoading(true);
      }

      try {
        if (!SUPABASE_URL) {
          throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
        }

        const accessToken = await getAccessTokenOrCreateSession();

        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/ai-supplement`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              generatedForDate: today,
              stats: aiSummaryInput,
            }),
          }
        );
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Please sign in to generate a live AI summary.");
          }
          const errorText = await response.text();
          throw new Error(errorText || "Failed to generate live AI summary.");
        }

        const data = await response.json();
        const normalized = normalizeAiSummaryPayload(data);
        const record = {
          generatedForDate: today,
          generatedAt: new Date().toISOString(),
          source: "openai",
          summary: normalized.summary,
          recommendations:
            normalized.recommendations.length > 0
              ? normalized.recommendations
              : aiFallbackSummary.recommendations,
        };
        if (!cancelled) {
          setAiSummaryText(record.summary);
          setAiSummaryRecommendations(record.recommendations);
          setAiSummaryGeneratedAt(record.generatedAt);
          setAiSummarySource(record.source);
          setAiSummaryLoading(false);
        }
        await AsyncStorage.setItem(
          AI_SUMMARY_CACHE_KEY,
          JSON.stringify(record)
        );
      } catch (error) {
        console.error("Failed to generate AI home summary", error);
        const fallbackRecord = {
          generatedForDate: today,
          generatedAt: new Date().toISOString(),
          source: "fallback",
          summary: aiFallbackSummary.summary,
          recommendations: aiFallbackSummary.recommendations,
        };
        if (!cancelled) {
          setAiSummaryText(fallbackRecord.summary);
          setAiSummaryRecommendations(fallbackRecord.recommendations);
          setAiSummaryGeneratedAt(fallbackRecord.generatedAt);
          setAiSummarySource(fallbackRecord.source);
          setAiSummaryError(
            error instanceof Error && error.message
              ? `${error.message} Showing local summary.`
              : "Live AI summary unavailable. Showing local summary."
          );
          setAiSummaryLoading(false);
        }
        await AsyncStorage.setItem(
          AI_SUMMARY_CACHE_KEY,
          JSON.stringify(fallbackRecord)
        );
      }
    };

    hydrateOrGenerate();
    return () => {
      cancelled = true;
    };
  }, [isFocused, today, aiSummaryInput, aiFallbackSummary]);

  useEffect(() => {
    setAiSummaryExpanded(false);
  }, [aiSummaryText, selectedDate]);

  const selectedDateHeading = useMemo(
    () => formatSelectedDateHeading(selectedDate),
    [selectedDate]
  );

  return (
    <BackdropScreen header={<HomeHeader />} contentStyle={styles.content}>
      <SectionTitle
        title={selectedDateHeading}
        style={styles.dateHeadingSection}
        titleStyle={styles.dateHeading}
      />

      <Pressable
        onPress={() =>
          router.push({
            pathname: "/supplement-search",
            params: { mode: "info" },
          })
        }
        style={styles.searchField}
      >
        <Ionicons
          name="search"
          size={20}
          color="#928780"
          style={styles.searchFieldIcon}
        />
        <Text style={styles.searchFieldPlaceholder}>Search supplements</Text>
      </Pressable>

      <AISummaryCard
        summary={aiSummaryText}
        loading={aiSummaryLoading}
        expanded={aiSummaryExpanded}
        onToggleExpanded={() => setAiSummaryExpanded((prev) => !prev)}
        generatedLabel={aiSummaryGeneratedLabel}
        error={aiSummaryError}
        source={aiSummarySource}
      />

      {dueSupplements.length === 0 ? (
        <EmptyState />
      ) : (
        <View style={styles.scheduleList}>
          {dueSupplements.map((supplement) => {
            const taken = Boolean(takenTimes[supplement.id]);
            const score = ratingByCatalog[supplement.catalogId];

            return (
              <SupplementRow
                key={supplement.id}
                supplement={supplement}
                taken={taken}
                takenAt={takenTimes[supplement.id]}
                score={score}
                onPress={() => toggleTaken(supplement.id)}
                onLongPress={() =>
                  supplement.catalogId
                    ? router.push({
                        pathname: "/modal/supplement-info",
                        params: {
                          id: supplement.catalogId,
                          name: supplement.name,
                        },
                      })
                    : undefined
                }
                onEditPress={() =>
                  router.push({
                    pathname: "/modal/supplement",
                    params: { id: supplement.id },
                  })
                }
              />
            );
          })}
        </View>
      )}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  dateHeadingSection: {
    marginBottom: 12,
  },
  dateHeading: {
    textTransform: "uppercase",
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    height: appTheme.input.height,
    borderRadius: appTheme.input.radius,
    backgroundColor: appTheme.input.background,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  searchFieldIcon: {
    marginRight: 8,
  },
  searchFieldPlaceholder: {
    flex: 1,
    fontSize: 16,
    fontFamily: typography.fontFamily.body,
    color: appTheme.input.placeholder,
  },
  aiSummaryCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: 16,
    borderColor: "black",
    borderWidth: 2,
  },
  aiSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: spacing.sm,
  },
  aiSummaryTitle: {
    fontSize: 13,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  aiSummaryMeta: {
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textTertiary,
    flexShrink: 1,
  },
  aiSummaryBody: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  aiSummaryReadMore: {
    alignSelf: "flex-start",
    marginTop: 6,
  },
  aiSummaryReadMoreText: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  aiSummaryError: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.danger,
  },
  aiSummaryFallback: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textTertiary,
  },
  scheduleList: {
    marginBottom: 8,
  },
  supplementCard: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  supplementCardPressed: {
    opacity: 0.95,
  },
  supplementCardTaken: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  supplementCardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: spacing.sm,
  },
  evidenceBadge: {
    alignSelf: "flex-start",
  },
  supplementRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  supplementRowTaken: {
    opacity: 0.88,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: appTheme.colors.iconSurface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  iconCircleTaken: {
    backgroundColor: appTheme.colors.iconSurfaceMuted,
  },
  supplementCopy: {
    flex: 1,
    minWidth: 0,
  },
  supplementNameRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    marginBottom: 4,
  },
  supplementName: {
    fontSize: 17,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textPrimary,
    flexShrink: 1,
    marginRight: 10,
  },
  supplementNameTaken: {
    color: appTheme.colors.textMuted,
    textDecorationLine: "line-through",
  },
  supplementMeta: {
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  supplementMetaTaken: {
    color: appTheme.colors.textMuted,
    textDecorationLine: "line-through",
  },
  supplementActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: spacing.md,
  },
  doseText: {
    fontSize: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#6D7782",
    marginRight: 14,
  },
  doseTextTaken: {
    color: "#A0A0A0",
  },
  editPill: {
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.textStrong,
  },
  editPillPressed: {
    opacity: 0.8,
  },
  editPillText: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.surface,
    letterSpacing: -0.1,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: appTheme.colors.borderInactive,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surface,
  },
  checkCircleTaken: {
    borderColor: appTheme.colors.success,
    backgroundColor: appTheme.colors.success,
  },
});
