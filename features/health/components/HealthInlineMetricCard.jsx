import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { appTheme, typography } from "@/theme";
import {
  BLOOD_PRESSURE_METRIC_KEY,
  INPUT_ARCHETYPES,
  normalizeBloodPressureValue,
} from "@/features/health/metricDefinitions";
import { accentForMetric } from "@/features/health/groupAccents";
import { MetricGlyph } from "./MetricGlyph";
import { InlineScoreSlider } from "./InlineScoreSlider";

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function CardSparkline({ values, color, kind = "bars", width = 76, height = 38 }) {
  if (!values || !values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  if (kind === "bars") {
    const n = values.length;
    const gap = 2;
    const bw = (width - gap * (n - 1)) / n;
    return (
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {values.map((v, i) => {
          const h = Math.max(2, ((v - min) / range) * (height - 4));
          const x = i * (bw + gap);
          const y = height - h;
          const isLast = i === n - 1;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={bw}
              height={h}
              rx={Math.min(bw / 2, 2)}
              fill={isLast ? color : appTheme.colors.borderInactive}
              opacity={isLast ? 1 : 0.55}
            />
          );
        })}
      </Svg>
    );
  }

  if (kind === "line") {
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * width;
      const y = height - ((v - min) / range) * (height - 6) - 3;
      return [x, y];
    });
    const d = pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const lastPt = pts[pts.length - 1];
    return (
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill={color} />
      </Svg>
    );
  }

  return null;
}

// ─── Chevron ──────────────────────────────────────────────────────────────────

function ChevronRight({ size = 12, color: c = appTheme.colors.textTertiary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M6 3l5 5-5 5"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isScaleArchetype(metric) {
  return (
    metric.inputArchetype === INPUT_ARCHETYPES.SCORE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.PRESSURE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.SEVERITY_0_10
  );
}

function getDurationParts(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return { hours: "—", unit: "hr" };
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return { hours: String(hours), unit: minutes ? `hr ${minutes}min` : "hr" };
}

function getSeriesValues(entries, metric) {
  return (entries ?? [])
    .slice(-7)
    .map((e) => {
      if (metric.key === BLOOD_PRESSURE_METRIC_KEY) {
        const bp = normalizeBloodPressureValue(e.value);
        return bp?.systolic ?? null;
      }
      return Number(e.value);
    })
    .filter((v) => Number.isFinite(v));
}

function formatTimestamp(entry) {
  if (!entry) return "";
  const today = new Date().toISOString().slice(0, 10);
  if (entry.date === today) return "Today";
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (entry.date === yesterday) return "Yesterday";
  try {
    const d = new Date(entry.date + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return entry.date;
  }
}

// ─── FullMetricCard ───────────────────────────────────────────────────────────

export function FullMetricCard({ metric, todayEntry, entries = [], onPress }) {
  const accent = accentForMetric(metric);
  const displayEntry = todayEntry ?? entries[entries.length - 1] ?? null;
  const raw = displayEntry?.value ?? metric.defaultValue;
  const series = useMemo(() => getSeriesValues(entries, metric), [entries, metric]);
  const timeLabel = formatTimestamp(displayEntry);

  let primaryValue, primaryUnit, sublabel, sparkKind;

  if (metric.inputArchetype === INPUT_ARCHETYPES.DURATION) {
    const parts = getDurationParts(raw);
    primaryValue = parts.hours;
    primaryUnit = parts.unit;
    sublabel = metric.key === "sleep" ? "Time Asleep" : "Latest";
    sparkKind = "bars";
  } else if (metric.key === BLOOD_PRESSURE_METRIC_KEY) {
    const bp = normalizeBloodPressureValue(raw) ?? { systolic: "—", diastolic: "—" };
    primaryValue = `${bp.systolic}/${bp.diastolic}`;
    primaryUnit = "mmHg";
    sublabel = "Latest reading";
    sparkKind = "bars";
  } else {
    const numVal = Number(raw);
    primaryValue = Number.isFinite(numVal) ? String(numVal % 1 === 0 ? numVal : numVal.toFixed(1)) : "—";
    primaryUnit = metric.unit ?? "";
    sublabel = "Latest";
    sparkKind = "line";
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${metric.shortLabel || metric.label}, ${primaryValue}${
        primaryUnit ? ` ${primaryUnit}` : ""
      }. Open details`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <MetricGlyph metricKey={metric.key} size={15} color={accent.tint} />
          <Text style={[styles.cardLabel, { color: accent.tint }]} numberOfLines={1}>
            {metric.shortLabel || metric.label}
          </Text>
        </View>
        <View style={styles.cardHeaderRight}>
          {timeLabel ? (
            <Text style={styles.cardTime}>{timeLabel}</Text>
          ) : null}
          <ChevronRight size={12} />
        </View>
      </View>

      {/* Body row */}
      <View style={styles.cardBody}>
        <View style={styles.cardBodyLeft}>
          <Text style={styles.sublabel}>{sublabel}</Text>
          <View style={styles.valueRow}>
            <Text style={styles.bigNumber}>{primaryValue}</Text>
            <Text style={styles.unitText}>{primaryUnit}</Text>
          </View>
        </View>
        <CardSparkline
          values={series}
          color={accent.tint}
          kind={sparkKind}
          width={76}
          height={38}
        />
      </View>
    </Pressable>
  );
}

// ─── HalfMetricCard ───────────────────────────────────────────────────────────

export function HalfMetricCard({ metric, entries = [], value, onValueChange, onPress }) {
  const accent = accentForMetric(metric);
  const displayValue = value ?? metric.defaultValue ?? metric.min ?? 0;
  const series = useMemo(() => getSeriesValues(entries, metric), [entries, metric]);

  return (
    <View style={styles.halfCard}>
      {/* Tappable header area */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${metric.shortLabel || metric.label}, ${displayValue} out of ${
          metric.max ?? 10
        }. Open details`}
        onPress={onPress}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <View style={styles.halfHeader}>
          <View style={styles.cardHeaderLeft}>
            <MetricGlyph metricKey={metric.key} size={13} color={accent.tint} />
            <Text style={[styles.halfLabel, { color: accent.tint }]} numberOfLines={1}>
              {metric.shortLabel || metric.label}
            </Text>
          </View>
          <ChevronRight size={11} />
        </View>

        <View style={styles.halfBody}>
          <View style={styles.halfValueRow}>
            <Text style={styles.halfBigNumber}>{displayValue}</Text>
            <Text style={styles.halfUnit}>/{metric.max ?? 10}</Text>
          </View>
          <CardSparkline
            values={series}
            color={accent.tint}
            kind="bars"
            width={56}
            height={24}
          />
        </View>
      </Pressable>

      {/* Inline slider */}
      <InlineScoreSlider
        metric={metric}
        value={displayValue}
        onChange={onValueChange}
        color={accent.tint}
        compact
      />
    </View>
  );
}

// ─── Add Metric placeholder ───────────────────────────────────────────────────

export function AddMetricPlaceholder({ onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add health metric"
      onPress={onPress}
      style={({ pressed }) => [styles.addPlaceholder, pressed && { opacity: 0.75 }]}
    >
      <Text style={styles.addPlus}>+</Text>
      <Text style={styles.addLabel}>Add Metric</Text>
    </Pressable>
  );
}

// ─── Legacy exports (kept for backward compatibility) ─────────────────────────

export { isScaleArchetype };

const styles = StyleSheet.create({
  card: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    padding: 14,
    paddingHorizontal: 16,
    shadowColor: appTheme.colors.textStrong,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    gap: 8,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardLabel: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 14,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  cardTime: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: appTheme.colors.textTertiary,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  cardBodyLeft: {
    flex: 1,
    minWidth: 0,
  },
  sublabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: appTheme.colors.textSecondary,
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  bigNumber: {
    fontFamily: typography.fontFamily.headingBlack,
    fontSize: 32,
    color: appTheme.colors.textPrimary,
    letterSpacing: -1,
    lineHeight: 36,
  },
  unitText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: appTheme.colors.textTertiary,
  },

  // Half card
  halfCard: {
    flex: 1,
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    padding: 12,
    paddingBottom: 10,
    shadowColor: appTheme.colors.textStrong,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    gap: 8,
    minHeight: 116,
  },
  halfHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  halfLabel: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 12.5,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  halfBody: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  halfValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  halfBigNumber: {
    fontFamily: typography.fontFamily.headingBlack,
    fontSize: 26,
    color: appTheme.colors.textPrimary,
    lineHeight: 30,
    letterSpacing: -0.8,
  },
  halfUnit: {
    fontFamily: typography.fontFamily.body,
    fontSize: 11,
    color: appTheme.colors.textTertiary,
  },

  // Add placeholder
  addPlaceholder: {
    flex: 1,
    minHeight: 116,
    borderRadius: 18,
    backgroundColor: appTheme.metrics.duration.muted,
    borderWidth: 1.5,
    borderColor: "rgba(92,63,168,0.24)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPlus: {
    fontFamily: typography.fontFamily.headingBlack,
    fontSize: 20,
    color: appTheme.metrics.duration.accent,
    lineHeight: 24,
  },
  addLabel: {
    fontFamily: typography.fontFamily.heading,
    fontSize: 13,
    color: appTheme.metrics.duration.accent,
  },
});
