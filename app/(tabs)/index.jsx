import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { HomeHeader } from "@/features/supplements/components/HomeHeader";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import {
  ChatFloatingButton,
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
import { getTrackedSupplementEvidenceScores } from "@/features/supplements/getTrackedSupplementEvidenceScores";
import { openTrackedSupplementInfo } from "@/features/supplements/openTrackedSupplementInfo";
import { isSupplementScheduledOnDate } from "@/features/supplements/schedule";
import { getAccessTokenOrCreateSession } from "@src/lib/supabase";
import { SUPABASE_URL } from "@src/lib/runtimeConfig";
import { computeMetricImprovement } from "@/features/health/metricTrends";

const EVIDENCE_POINTS = {
  high: 3,
  moderate: 2,
  low: 1,
  unknown: 0,
};

const AI_SUMMARY_CACHE_KEY = "suppro.stats.aiSummary.v1";
const AI_SUMMARY_WINDOW_DAYS = 30;

function EmptyState() {
  const { requireSubscriptionAccess } = useSubscriptionAccess();

  return (
    <PrimaryCard style={emptyStateStyles.card}>
      <Text style={emptyStateStyles.title}>No supplements due</Text>
      <Text style={emptyStateStyles.description}>
        You don’t have anything scheduled for this date.
      </Text>

      <View style={emptyStateStyles.divider} />

      <View style={emptyStateStyles.actionsRow}>
        <Pressable
          onPress={() => {
            if (!requireSubscriptionAccess("scanner")) {
              return;
            }

            router.push("/scanner");
          }}
          style={({ pressed }) => [
            emptyStateStyles.action,
            pressed && emptyStateStyles.actionPressed,
          ]}
        >
          <Ionicons
            name="barcode-outline"
            size={18}
            color={appTheme.colors.textStrong}
          />
          <Text style={emptyStateStyles.actionLabel}>Scan a supplement</Text>
          <Ionicons
            name="chevron-forward-outline"
            size={13}
            color={appTheme.colors.textMuted}
          />
        </Pressable>

        <View style={emptyStateStyles.verticalDivider} />

        <Pressable
          onPress={() => {
            if (!requireSubscriptionAccess("supplement_search")) {
              return;
            }

            router.push({
              pathname: "/supplement-search",
              params: { mode: "info" },
            });
          }}
          style={({ pressed }) => [
            emptyStateStyles.action,
            pressed && emptyStateStyles.actionPressed,
          ]}
        >
          <Ionicons
            name="search-outline"
            size={18}
            color={appTheme.colors.textStrong}
          />
          <Text style={emptyStateStyles.actionLabel}>Search supplements</Text>
          <Ionicons
            name="chevron-forward-outline"
            size={13}
            color={appTheme.colors.textMuted}
          />
        </Pressable>
      </View>
    </PrimaryCard>
  );
}

const emptyStateStyles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 0,
    marginBottom: 10,
    overflow: "hidden",
  },
  title: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: "#6F6F6F",
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: appTheme.colors.borderSubtle,
    marginTop: spacing.lg,
    marginHorizontal: -spacing.lg,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginHorizontal: -spacing.lg,
  },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: appTheme.colors.borderSubtle,
  },
  actionPressed: {
    opacity: 0.6,
  },
  actionLabel: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
    textAlign: "center",
  },
});

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

function formatNumber(value) {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDueTime(supplement) {
  const directTime =
    typeof supplement?.time === "string" ? supplement.time.trim() : "";
  if (directTime) {
    return directTime;
  }

  const timeMinutes = Number(supplement?.timeMinutes);
  if (!Number.isFinite(timeMinutes)) {
    return "";
  }

  const hours = Math.max(0, Math.floor(timeMinutes / 60));
  const minutes = Math.max(0, timeMinutes % 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
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

function getAiSummaryFailureMessage(status, responseText) {
  if (status === 401) {
    return "Please sign in to generate a live AI summary.";
  }

  try {
    const parsed = JSON.parse(responseText);
    if (typeof parsed?.error === "string" && parsed.error.trim()) {
      if (parsed.error === "AI service unavailable") {
        return "Live AI summary is currently unavailable.";
      }
      return parsed.error.trim();
    }
  } catch {
    // Fall back to a generic message when the response is not JSON.
  }

  return "Failed to generate live AI summary.";
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
        <Text style={styles.aiSummaryTitle}>Your AI summary</Text>
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
  const dueTime = formatDueTime(supplement);
  const metaLabel =
    taken && takenAt ? `Taken ${takenAt}` : dueTime ? `Due ${dueTime}` : "";

  return (
    <PrimaryCard
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.supplementCard, taken && styles.supplementCardTaken]}
      pressedStyle={!taken ? styles.supplementCardPressed : null}
    >
      <View style={styles.supplementCardTopRow}>
        {evidence.badgeLabel ? (
          <StatusPill
            label={evidence.badgeLabel}
            tone={evidence.badgeTone}
            style={styles.evidenceBadge}
          />
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
          <Ionicons name="create-outline" size={20} color="#6B6B6B" />
        </Pressable>
      </View>

      <View style={[styles.supplementRow, taken && styles.supplementRowTaken]}>
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
            {metaLabel}
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
  const { hasActiveAccess, requireSubscriptionAccess } = useSubscriptionAccess();
  const isFocused = useIsFocused();
  const supplements = useSupplementsStore((s) => s.supplements);
  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const toggleTaken = useSupplementsStore((s) => s.toggleTaken);
  const healthEntries = useHealthStore((s) => getEffectiveEntries(s));
  const healthMetrics = useHealthStore((s) => s.metrics);

  const [ratingBySupplementId, setRatingBySupplementId] = useState({});
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
        .filter((supplement) =>
          isSupplementScheduledOnDate(supplement, selectedDate)
        )
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
    if (!hasActiveAccess || !supplements?.length) {
      setRatingBySupplementId({});
      return () => {
        active = false;
      };
    }
    getTrackedSupplementEvidenceScores(supplements)
      .then((map) => {
        if (active) setRatingBySupplementId(map);
      })
      .catch(() => {
        if (active) setRatingBySupplementId({});
      });
    return () => {
      active = false;
    };
  }, [hasActiveAccess, supplements]);

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
      const dayTakenMap = takenTimesByDate?.[date] ?? {};
      const dayOfWeek = parseISODate(date).getDay();
      const plannedSupplements = (supplements ?? []).filter((supplement) =>
        isSupplementScheduledOnDate(supplement, date)
      );
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
            ratingBySupplementId[supplement.id]
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
    [dayStatsByDate, ratingBySupplementId]
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
        today,
        {
          previousPeriodStart: aiPreviousPeriodDates[0],
          previousPeriodEnd:
            aiPreviousPeriodDates[aiPreviousPeriodDates.length - 1],
        }
      ),
    [healthMetrics, healthEntries, aiPeriodDates, aiPreviousPeriodDates, today]
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
    if (!hasActiveAccess) {
      setAiSummaryText("");
      setAiSummaryRecommendations([]);
      setAiSummaryGeneratedAt(null);
      setAiSummarySource("openai");
      setAiSummaryLoading(false);
      setAiSummaryError(null);
      return undefined;
    }

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
          const errorText = await response.text();
          throw new Error(
            getAiSummaryFailureMessage(response.status, errorText)
          );
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
  }, [aiFallbackSummary, aiSummaryInput, hasActiveAccess, isFocused, today]);

  useEffect(() => {
    setAiSummaryExpanded(false);
  }, [aiSummaryText, selectedDate]);

  const selectedDateHeading = useMemo(
    () => formatSelectedDateHeading(selectedDate),
    [selectedDate]
  );

  return (
    <BackdropScreen
      header={<HomeHeader />}
      contentStyle={styles.content}
      floatingSlot={<ChatFloatingButton />}
    >
      <SectionTitle
        title={selectedDateHeading}
        style={styles.dateHeadingSection}
        titleStyle={styles.dateHeading}
      />

      <Pressable
        onPress={() => {
          if (!requireSubscriptionAccess("supplement_search")) {
            return;
          }

          router.push({
            pathname: "/supplement-search",
            params: { mode: "info" },
          });
        }}
        style={styles.searchField}
      >
        <Ionicons
          name="search"
          size={18}
          color="#8B8595"
          style={styles.searchFieldIcon}
        />
        <Text style={styles.searchFieldPlaceholder}>
          Search supplement catalog ...
        </Text>
      </Pressable>

      {hasActiveAccess ? (
        <AISummaryCard
          summary={aiSummaryText}
          loading={aiSummaryLoading}
          expanded={aiSummaryExpanded}
          onToggleExpanded={() => setAiSummaryExpanded((prev) => !prev)}
          generatedLabel={aiSummaryGeneratedLabel}
          error={aiSummaryError}
          source={aiSummarySource}
        />
      ) : null}

      {dueSupplements.length === 0 ? (
        <EmptyState />
      ) : (
        <View style={styles.scheduleList}>
          {dueSupplements.map((supplement) => {
            const taken = Boolean(takenTimes[supplement.id]);
            const score = ratingBySupplementId[supplement.id];

            return (
              <SupplementRow
                key={supplement.id}
                supplement={supplement}
                taken={taken}
                takenAt={takenTimes[supplement.id]}
                score={score}
                onPress={() => {
                  if (!requireSubscriptionAccess("supplement_tracking")) {
                    return;
                  }

                  toggleTaken(supplement.id);
                }}
                onLongPress={() =>
                  openTrackedSupplementInfo(
                    supplement,
                    requireSubscriptionAccess
                  )
                }
                onEditPress={() => {
                  if (!requireSubscriptionAccess("supplement_tracking")) {
                    return;
                  }

                  router.push({
                    pathname: "/modal/supplement",
                    params: { id: supplement.id },
                  });
                }}
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
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
    shadowColor: "#1A1820",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    marginBottom: 18,
  },
  searchFieldIcon: {
    marginRight: 0,
  },
  searchFieldPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: "#8B8595",
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
    alignItems: "center",
    justifyContent: "center",
  },
  editPillPressed: {
    opacity: 0.8,
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
