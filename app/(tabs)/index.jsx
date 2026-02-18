import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { Screen } from "@/components/common/layout/Screen";
import { HomeHeader } from "@/features/supplements/components/HomeHeader";
import { colors, spacing, radius, shadows } from "@/theme";
import { useSupplementsStore } from "@/features/supplements/store";
import { useHealthStore } from "@/features/health/store";
import { searchSupplementCatalog } from "@src/data/searchSupplementCatalog";
import { getSupplementRatings } from "@src/data/getSupplementRatings";
import { getAccessTokenOrCreateSession } from "@src/lib/supabase";
import {
  isNumericMetric,
  normalizeMetric,
} from "@/features/health/metricDefinitions";
import { getRatingStyle } from "@/utils/ratingStyles";

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
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No supplements due</Text>
      <Text style={styles.emptyText}>
        You don’t have anything scheduled for this date.
      </Text>
    </View>
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

function periodForMinutes(minutes) {
  if (minutes < 12 * 60) return "Morning";
  if (minutes < 17 * 60) return "Afternoon";
  return "Evening";
}

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const supplements = useSupplementsStore((s) => s.supplements);
  const selectedDate = useSupplementsStore((s) => s.selectedDate);
  const takenTimesByDate = useSupplementsStore((s) => s.takenTimesByDate);
  const toggleTaken = useSupplementsStore((s) => s.toggleTaken);
  const healthEntries = useHealthStore((s) => s.entries);
  const healthMetrics = useHealthStore((s) => s.metrics);

  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [ratingByCatalog, setRatingByCatalog] = useState({});
  const [today, setToday] = useState(() => toISODate(new Date()));
  const [aiSummaryText, setAiSummaryText] = useState("");
  const [, setAiSummaryRecommendations] = useState([]);
  const [aiSummaryGeneratedAt, setAiSummaryGeneratedAt] = useState(null);
  const [aiSummarySource, setAiSummarySource] = useState("openai");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState(null);

  const [year, month, day] = selectedDate.split("-").map(Number);
  const selectedDay = new Date(year, (month || 1) - 1, day || 1).getDay();
  const dueSupplements = useMemo(
    () =>
      supplements
        .filter(
          (s) =>
            Array.isArray(s.daysOfWeek) && s.daysOfWeek.includes(selectedDay)
        )
        .sort((a, b) => a.timeMinutes - b.timeMinutes),
    [supplements, selectedDay]
  );

  const visibleSupplements = useMemo(() => {
    if (!searchQuery.trim()) return dueSupplements;
    const q = searchQuery.toLowerCase();
    return dueSupplements.filter((s) => s.name.toLowerCase().includes(q));
  }, [dueSupplements, searchQuery]);

  const takenTimes = useMemo(
    () => takenTimesByDate[selectedDate] ?? {},
    [takenTimesByDate, selectedDate]
  );

  const groupedSchedule = useMemo(() => {
    const groups = { Morning: [], Afternoon: [], Evening: [] };
    visibleSupplements.forEach((s) => {
      groups[periodForMinutes(s.timeMinutes)].push(s);
    });
    return groups;
  }, [visibleSupplements]);

  const ratingColorFor = (catalogId) => {
    if (!catalogId) return colors.brand.primary;
    const score = ratingByCatalog[catalogId];
    if (typeof score !== "number") return colors.brand.primary;
    return getRatingStyle(score).gradient[0];
  };

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
    let active = true;
    if (!searchQuery.trim()) {
      setMatches([]);
      return;
    }
    searchSupplementCatalog(searchQuery).then((results) => {
      if (active) setMatches(results);
    });
    return () => {
      active = false;
    };
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Screen
      header={
        <HomeHeader
          searchSlot={
            <View style={styles.searchUtility}>
              <Ionicons
                name="search"
                size={16}
                color={colors.icon.primary}
                style={styles.searchInlineIcon}
              />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search supplements"
                placeholderTextColor={colors.text.muted}
                style={styles.searchInputUtility}
                clearButtonMode="while-editing"
              />
            </View>
          }
        />
      }
    >
      <View style={styles.content}>
        {isSearching ? (
          <View style={styles.searchResults}>
            {matches.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  setSearchQuery("");
                  setMatches([]);
                  router.push({
                    pathname: "/modal/supplement-info",
                    params: { id: m.id, name: m.name },
                  });
                }}
                style={styles.searchResultItem}
              >
                <Text style={styles.searchResultText}>{m.name}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={() => {
                setSearchQuery("");
                setMatches([]);
                router.push("/(modals)/modal/add-supplement-catalog");
              }}
              style={[styles.searchResultItem, styles.searchResultAdd]}
            >
              <Text style={styles.searchResultText}>+ Add new supplement</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.aiSummaryCard}>
              <View style={styles.aiSummaryHeader}>
                <View style={styles.aiSummaryHeaderRow}>
                  <Text style={styles.aiSummaryTitle}>Suppro AI Summary</Text>
                  <Pressable
                    onPress={() => router.push("/stats")}
                    style={styles.aiSummaryChatButton}
                  >
                    <Text style={styles.aiSummaryChatButtonText}>Stats</Text>
                  </Pressable>
                </View>
                <Text style={styles.aiSummaryMeta}>
                  Last {AI_SUMMARY_WINDOW_DAYS} days
                  {aiSummaryGeneratedLabel
                    ? ` · Updated ${aiSummaryGeneratedLabel}`
                    : ""}
                </Text>
              </View>
              {aiSummaryLoading && !aiSummaryText ? (
                <Text style={styles.aiSummaryBody}>
                  Generating today&apos;s summary…
                </Text>
              ) : (
                <Text style={styles.aiSummaryBody}>
                  {aiSummaryText ||
                    "No summary yet. Open this page again once more data is available."}
                </Text>
              )}
              {aiSummaryError ? (
                <Text style={styles.aiSummaryError}>{aiSummaryError}</Text>
              ) : null}
              {aiSummarySource === "fallback" && !aiSummaryError ? (
                <Text style={styles.aiSummaryMeta}>
                  Using local fallback summary.
                </Text>
              ) : null}
            </View>

            <View style={styles.scheduleCard}>
              <Text style={styles.cardTitle}>Today’s Schedule</Text>
              {visibleSupplements.length === 0 ? (
                <EmptyState />
              ) : (
                Object.entries(groupedSchedule).map(([period, items]) => {
                  if (!items.length) return null;
                  return (
                    <View key={period} style={styles.periodBlock}>
                      <Text style={styles.periodTitle}>{period}</Text>
                      <View style={styles.periodList}>
                        {items.map((s) => {
                          const taken = Boolean(takenTimes[s.id]);
                          const iconColor = ratingColorFor(s.catalogId);
                          return (
                            <Pressable
                              key={s.id}
                              onPress={() => toggleTaken(s.id)}
                              onLongPress={() =>
                                router.push({
                                  pathname: "/modal/supplement",
                                  params: { id: s.id },
                                })
                              }
                              style={[
                                styles.scheduleItem,
                                taken && styles.scheduleItemTaken,
                              ]}
                            >
                              <View
                                style={[
                                  styles.itemIconWrap,
                                  { backgroundColor: `${iconColor}22` },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.itemIcon,
                                    { backgroundColor: iconColor },
                                  ]}
                                />
                              </View>

                              <View style={styles.itemTextWrap}>
                                <Text style={styles.itemTitle}>{s.name}</Text>
                                <Text style={styles.itemSubtitle}>
                                  {s.time}
                                  {s.dose ? ` · ${s.dose}` : ""}
                                </Text>
                              </View>

                              <View style={styles.trailingStatus}>
                                <Ionicons
                                  name={
                                    taken
                                      ? "checkmark-circle"
                                      : "ellipse-outline"
                                  }
                                  size={22}
                                  color={
                                    taken
                                      ? colors.status.success
                                      : colors.border.strong
                                  }
                                />
                                {taken && takenTimes[s.id] ? (
                                  <Text style={styles.takenStamp}>
                                    Taken at {takenTimes[s.id]}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
  },
  searchUtility: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.card,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.card,
  },
  searchInlineIcon: {
    marginRight: spacing.sm,
  },
  searchInputUtility: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
  },
  aiSummaryCard: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    ...shadows.card,
  },
  aiSummaryHeader: {
    marginBottom: spacing.xs,
  },
  aiSummaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  aiSummaryTitle: {
    fontSize: 18,
    color: colors.text.primary,
    fontWeight: "700",
  },
  aiSummaryChatButton: {
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background.elevated,
  },
  aiSummaryChatButtonText: {
    fontSize: 12,
    color: colors.brand.primary,
    fontWeight: "700",
  },
  aiSummaryMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 16,
  },
  aiSummaryBody: {
    marginTop: spacing.xs,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  aiSummaryError: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.status.danger,
    lineHeight: 16,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  scheduleCard: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  periodBlock: {
    marginBottom: spacing.md,
  },
  periodTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  periodList: {
    gap: spacing.sm,
  },
  scheduleItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    gap: spacing.sm,
  },
  scheduleItemTaken: {
    opacity: 0.75,
  },
  itemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  itemIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  itemSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.text.secondary,
  },
  trailingStatus: {
    minWidth: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  takenStamp: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: colors.text.muted,
    textAlign: "center",
  },
  searchResults: {
    marginTop: spacing.sm,
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
    ...shadows.card,
  },
  searchResultItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  searchResultAdd: {
    opacity: 0.8,
  },
  searchResultText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  empty: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.text.secondary,
  },
});
