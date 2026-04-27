import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { AppBackdrop } from "@/components/common/ui";
import { appTheme, typography } from "@/theme";
import {
  BLOOD_PRESSURE_METRIC_KEY,
  INPUT_ARCHETYPES,
  MANUAL_ENTRY_SOURCE,
  PRESET_METRICS_BY_KEY,
  formatMetricValue,
  normalizeBloodPressureValue,
  normalizeMetric,
} from "@/features/health/metricDefinitions";
import { useHealthStore } from "@/features/health/store";
import { getEffectiveEntries } from "@/features/health/selectors";
import { accentForMetric } from "@/features/health/groupAccents";
import { InlineScoreSlider } from "@/features/health/components/InlineScoreSlider";
import { MetricDetailChart } from "@/features/health/components/MetricDetailChart";
import { HealthEntryModal } from "@/features/health/components/HealthEntryModal";

const PERIODS = ["D", "W", "M", "6M", "Y"];
const PERIOD_DAYS = { D: 1, W: 7, M: 30, "6M": 180, Y: 365 };

function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatHeaderDate(entries, period) {
  if (!entries.length) return "";
  const slice = entries.slice(-(PERIOD_DAYS[period] ?? 7));
  if (!slice.length) return "";
  const first = slice[0].date;
  const last = slice[slice.length - 1].date;
  if (first === last) return formatDate(first);
  return `${formatShortDate(first)} – ${formatShortDate(last)}`;
}

function formatDate(isoDate) {
  try {
    return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function formatShortDate(isoDate) {
  try {
    return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return isoDate;
  }
}

function computeAvgStat(metric, slice) {
  if (!slice.length) return { label: "No data", value: "—", range: "" };
  const isBP = metric.key === BLOOD_PRESSURE_METRIC_KEY;

  if (isBP) {
    const sysAvg =
      slice.reduce((a, e) => {
        const bp = normalizeBloodPressureValue(e.value);
        return a + (bp?.systolic ?? 0);
      }, 0) / slice.length;
    const diaAvg =
      slice.reduce((a, e) => {
        const bp = normalizeBloodPressureValue(e.value);
        return a + (bp?.diastolic ?? 0);
      }, 0) / slice.length;
    return {
      label: "AVERAGE",
      value: `${Math.round(sysAvg)}/${Math.round(diaAvg)} mmHg`,
    };
  }

  const nums = slice
    .map((e) => Number(e.value))
    .filter((v) => Number.isFinite(v));
  if (!nums.length) return { label: "No data", value: "—" };
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;

  if (metric.inputArchetype === INPUT_ARCHETYPES.DURATION) {
    const hrs = Math.floor(avg);
    const mins = Math.round((avg - hrs) * 60);
    const unit = metric.unit === "hours" ? (mins ? `hr ${mins} min` : "hr") : "min";
    return { label: "AVG TIME ASLEEP", value: `${metric.unit === "hours" ? hrs : Math.round(avg)} ${unit}` };
  }

  if (
    metric.inputArchetype === INPUT_ARCHETYPES.SCORE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.PRESSURE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.SEVERITY_0_10
  ) {
    return {
      label: "AVERAGE",
      value: `${avg.toFixed(1)} /${metric.max ?? 10}`,
    };
  }

  return {
    label: "AVERAGE",
    value: `${avg.toFixed(1)}${metric.unit ? ` ${metric.unit}` : ""}`,
  };
}

function isScoreMetric(metric) {
  return (
    metric.inputArchetype === INPUT_ARCHETYPES.SCORE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.PRESSURE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.SEVERITY_0_10
  );
}

function formatEntryValue(metric, entry) {
  if (!entry) return "—";
  if (metric.key === BLOOD_PRESSURE_METRIC_KEY) {
    const bp = normalizeBloodPressureValue(entry.value);
    return bp ? `${bp.systolic}/${bp.diastolic} mmHg` : "—";
  }
  if (metric.inputArchetype === INPUT_ARCHETYPES.DURATION) {
    const v = Number(entry.value);
    if (!Number.isFinite(v)) return "—";
    if (metric.unit === "hours") {
      const hrs = Math.floor(v);
      const mins = Math.round((v - hrs) * 60);
      return mins ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    return `${Math.round(v)}m`;
  }
  return formatMetricValue(metric, entry.value);
}

// ─── Back arrow icon ──────────────────────────────────────────────────────────

function ArrowLeftIcon({ size = 18, color: c = appTheme.colors.textStrong }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M10 3L5 8l5 5"
        stroke={c}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PlusIcon({ size = 16, color: c = appTheme.colors.textStrong }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 3v10M3 8h10"
        stroke={c}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MetricDetailScreen() {
  const { metric: metricKey } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState("W");
  const [addOpen, setAddOpen] = useState(false);

  const rawMetric = PRESET_METRICS_BY_KEY[metricKey];
  const metric = useMemo(() => (rawMetric ? normalizeMetric(rawMetric) : null), [rawMetric]);

  const effectiveEntries = useHealthStore((state) => getEffectiveEntries(state));
  const addEntry = useHealthStore((state) => state.addEntry);

  const metricEntries = useMemo(
    () =>
      (effectiveEntries ?? [])
        .filter((e) => e.type === metricKey)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [effectiveEntries, metricKey]
  );

  const today = useMemo(() => todayYYYYMMDD(), []);
  const todayEntry = useMemo(
    () => metricEntries.filter((e) => e.date === today).slice(-1)[0] ?? null,
    [metricEntries, today]
  );

  const sliceEntries = useMemo(() => {
    const days = PERIOD_DAYS[period] ?? 7;
    return metricEntries.slice(-days);
  }, [metricEntries, period]);

  const stat = useMemo(() => computeAvgStat(metric ?? {}, sliceEntries), [metric, sliceEntries]);
  const dateRange = useMemo(() => formatHeaderDate(sliceEntries, period), [sliceEntries, period]);

  const accent = useMemo(() => accentForMetric(metric ?? {}), [metric]);

  const [scoreValue, setScoreValue] = useState(
    () => Number(todayEntry?.value) || metric?.defaultValue || 5
  );

  const commitScore = (v) => {
    setScoreValue(v);
    addEntry({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: metricKey,
      value: v,
      date: today,
      source: MANUAL_ENTRY_SOURCE,
    });
  };

  if (!metric) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.errorText}>Metric not found</Text>
      </View>
    );
  }

  const recentEntries = metricEntries.slice(-5).reverse();

  return (
    <View style={styles.screen}>
      <AppBackdrop />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <ArrowLeftIcon />
          </Pressable>
          <Text style={styles.screenTitle} numberOfLines={1}>
            {metric.shortLabel || metric.label}
          </Text>
          <Pressable
            onPress={() => setAddOpen(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <PlusIcon />
          </Pressable>
        </View>

        <View style={styles.content}>
          {/* Period switcher */}
          <View style={styles.periodBar}>
            {PERIODS.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              >
                <Text
                  style={[
                    styles.periodLabel,
                    period === p && styles.periodLabelActive,
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Stat header */}
          <View style={styles.statHeader}>
            <View style={styles.statEyebrow}>
              <View style={[styles.statDot, { backgroundColor: accent.tint }]} />
              <Text style={styles.statEyebrowText}>{stat.label}</Text>
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            {dateRange ? <Text style={styles.statRange}>{dateRange}</Text> : null}
          </View>

          {/* Chart */}
          <View style={styles.chartWrap}>
            <MetricDetailChart metric={metric} entries={sliceEntries} period={period} />
          </View>

          {/* Inline log card (score metrics only) */}
          {isScoreMetric(metric) && (
            <View style={styles.logCard}>
              <Text style={styles.logTitle}>Log today</Text>
              <InlineScoreSlider
                metric={metric}
                value={scoreValue}
                onChange={commitScore}
                color={accent.tint}
                compact={false}
              />
            </View>
          )}

          {/* About section */}
          <Text style={styles.sectionTitle}>About {metric.shortLabel || metric.label}</Text>
          <View style={styles.aboutCard}>
            <Text style={styles.aboutText}>
              {metric.description
                ? `${metric.description} Your tracked entries appear in the chart above and contribute to the supplement-effect comparisons in your routine.`
                : "Your tracked entries appear in the chart above and contribute to the supplement-effect comparisons in your routine."}
            </Text>
          </View>

          {/* Recent entries */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent entries</Text>
          </View>
          {recentEntries.length === 0 ? (
            <View style={styles.emptyEntries}>
              <Text style={styles.emptyEntriesText}>No entries yet</Text>
            </View>
          ) : (
            <View style={styles.entriesCard}>
              {recentEntries.map((entry, i) => (
                <View
                  key={entry.id ?? i}
                  style={[
                    styles.entryRow,
                    i < recentEntries.length - 1 && styles.entryRowBorder,
                  ]}
                >
                  <Text style={styles.entryDate}>{formatShortDate(entry.date)}</Text>
                  <Text style={styles.entryValue}>
                    {formatEntryValue(metric, entry)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <HealthEntryModal
        visible={addOpen}
        metric={typeof metricKey === "string" ? metricKey : null}
        onClose={() => setAddOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appTheme.screen.background,
  },
  scroll: {
    paddingHorizontal: appTheme.screen.sidePadding,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: appTheme.colors.surfaceOverlayStrong,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: appTheme.colors.textStrong,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  screenTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 16,
    color: appTheme.colors.textPrimary,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  content: {
    gap: 0,
  },
  periodBar: {
    flexDirection: "row",
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 12,
    padding: 3,
    marginBottom: 18,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: "center",
  },
  periodBtnActive: {
    backgroundColor: appTheme.colors.surface,
    shadowColor: appTheme.colors.textStrong,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  periodLabel: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 13,
    color: appTheme.colors.textSecondary,
  },
  periodLabelActive: {
    color: appTheme.colors.textPrimary,
  },
  statHeader: {
    marginBottom: 8,
  },
  statEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statEyebrowText: {
    fontFamily: typography.fontFamily.monoMedium,
    fontSize: 11,
    color: appTheme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: typography.fontFamily.headingBlack,
    fontSize: 30,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  statRange: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: appTheme.colors.textTertiary,
    marginTop: 2,
  },
  chartWrap: {
    marginTop: 4,
    marginBottom: 18,
  },
  logCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  logTitle: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 14,
    color: appTheme.colors.textPrimary,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.headingBlack,
    fontSize: 22,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.4,
    marginTop: 8,
    marginBottom: 10,
    paddingLeft: 4,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aboutCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  aboutText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: appTheme.colors.textPrimary,
    lineHeight: 21,
  },
  entriesCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    overflow: "hidden",
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  entryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  entryDate: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: appTheme.colors.textSecondary,
  },
  entryValue: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 14,
    color: appTheme.colors.textPrimary,
  },
  emptyEntries: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
  },
  emptyEntriesText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: appTheme.colors.textMuted,
  },
  errorText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 16,
    color: appTheme.colors.textMuted,
    textAlign: "center",
    marginTop: 40,
  },
});
