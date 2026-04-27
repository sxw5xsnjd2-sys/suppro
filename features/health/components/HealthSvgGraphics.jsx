import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { appTheme, typography } from "@/theme";
import { normalizeNumericValue } from "@/features/health/metricDefinitions";

const ARC_START = -210;
const ARC_END = 30;
const ARC_SWEEP = ARC_END - ARC_START;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointOnCircle(center, radius, angleDegrees) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(radians),
    y: center + radius * Math.sin(radians),
  };
}

function arcPath(center, radius, startAngle, endAngle) {
  const start = pointOnCircle(center, radius, startAngle);
  const end = pointOnCircle(center, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function formatDurationValue(rawValue, unit) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return "-";
  if (unit !== "hours") return `${Math.round(value)}m`;
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function clampMetricValue(metric, value) {
  const normalized = normalizeNumericValue(value, metric);
  return Number.isFinite(normalized) ? normalized : metric.defaultValue ?? 0;
}

function roundToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function valueFromPoint(metric, x, y, size) {
  const min = Number.isFinite(metric.min) ? metric.min : 0;
  const max = Number.isFinite(metric.max) ? metric.max : 12;
  const step = Number.isFinite(metric.step) ? metric.step : 0.25;
  const center = size / 2;
  let angle = (Math.atan2(y - center, x - center) * 180) / Math.PI;

  if (angle > ARC_END) {
    angle -= 360;
  }

  const pct = clamp((clamp(angle, ARC_START, ARC_END) - ARC_START) / ARC_SWEEP, 0, 1);
  return clampMetricValue(metric, roundToStep(min + pct * (max - min), step));
}

export function HealthSleepArcSvg({
  metric,
  value,
  size = 156,
  showTicks = true,
}) {
  const min = Number.isFinite(metric.min) ? metric.min : 0;
  const max = Number.isFinite(metric.max) ? metric.max : 12;
  const pct = clamp((Number(value) - min) / (max - min || 1), 0, 1);
  const center = size / 2;
  const radius = size * 0.38;
  const activeEnd = ARC_START + pct * ARC_SWEEP;
  const knob = pointOnCircle(center, radius, activeEnd);
  const trackPath = arcPath(center, radius, ARC_START, ARC_END);
  const activePath = arcPath(center, radius, ARC_START, activeEnd);

  return (
    <View style={[styles.arcFrame, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path
          d={trackPath}
          fill="none"
          stroke={appTheme.metrics.duration.muted}
          strokeWidth={14}
          strokeLinecap="round"
        />
        <Path
          d={activePath}
          fill="none"
          stroke={appTheme.metrics.duration.hue}
          strokeWidth={14}
          strokeLinecap="round"
        />
        {showTicks
          ? [0, 2, 4, 6, 8, 10, 12].map((tick) => {
              const angle = ARC_START + (tick / 12) * ARC_SWEEP;
              const outer = pointOnCircle(center, radius - 13, angle);
              const inner = pointOnCircle(center, radius - 20, angle);
              return (
                <Line
                  key={tick}
                  x1={outer.x}
                  y1={outer.y}
                  x2={inner.x}
                  y2={inner.y}
                  stroke="rgba(20,20,20,0.18)"
                  strokeWidth={1}
                  strokeLinecap="round"
                />
              );
            })
          : null}
        <Circle
          cx={knob.x}
          cy={knob.y}
          r={9}
          fill={appTheme.colors.surface}
          stroke={appTheme.metrics.duration.accent}
          strokeWidth={2}
        />
        <Circle
          cx={knob.x}
          cy={knob.y}
          r={3}
          fill={appTheme.metrics.duration.accent}
        />
      </Svg>
      <View pointerEvents="none" style={styles.arcValueWrap}>
        <Text style={styles.arcValue}>{formatDurationValue(value, metric.unit)}</Text>
        <Text style={styles.arcCaption}>
          {metric.unit === "hours" ? "last night" : "today"}
        </Text>
      </View>
    </View>
  );
}

export function HealthSparklineSvg({
  data,
  min,
  max,
  height = 38,
  accent = appTheme.metrics.duration.accent,
}) {
  const [width, setWidth] = useState(0);

  const points = useMemo(() => {
    const values = Array.isArray(data)
      ? data.filter((value) => Number.isFinite(value)).slice(-7)
      : [];
    if (!values.length || width <= 0) return [];

    const chartMin = Number.isFinite(min) ? min : Math.min(...values);
    const chartMax = Number.isFinite(max) ? max : Math.max(...values);
    const range = chartMax === chartMin ? 1 : chartMax - chartMin;
    const padX = 10;
    const padY = 6;
    const plotWidth = Math.max(1, width - padX * 2);
    const plotHeight = Math.max(1, height - padY * 2);

    return values.map((value, index) => {
      const t = values.length === 1 ? 0.5 : index / (values.length - 1);
      const yPct = clamp((value - chartMin) / range, 0, 1);
      return {
        x: padX + t * plotWidth,
        y: padY + (1 - yPct) * plotHeight,
      };
    });
  }, [data, height, max, min, width]);

  const path = points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    )
    .join(" ");

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height }}
    >
      {width > 0 ? (
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {points.length > 1 ? (
            <Path
              d={path}
              fill="none"
              stroke={accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {points.map((point, index) => (
            <Circle
              key={`${point.x}-${index}`}
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? 3 : 2}
              fill={index === points.length - 1 ? appTheme.colors.textPrimary : accent}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

export function DurationArcInput({ metric, value, setValue, commit }) {
  const size = 164;
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const updateFromEvent = useCallback(
    (event) => {
      const { locationX, locationY } = event.nativeEvent;
      if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) return;
      const nextValue = valueFromPoint(metric, locationX, locationY, size);
      valueRef.current = nextValue;
      setValue(nextValue);
    },
    [metric, setValue]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: updateFromEvent,
        onPanResponderMove: updateFromEvent,
      }),
    [updateFromEvent]
  );

  return (
    <View style={styles.inputRow}>
      <View {...panResponder.panHandlers} style={styles.dragTarget}>
        <HealthSleepArcSvg metric={metric} value={value} size={size} />
      </View>
      <View style={styles.inputCopy}>
        <Text style={styles.inputInstruction}>Drag the arc to set value</Text>
        <View style={styles.dragMeter}>
          <View
            style={[
              styles.dragMeterFill,
              {
                width: `${Math.round(
                  ((Number(value) - (metric.min ?? 0)) /
                    ((metric.max ?? 12) - (metric.min ?? 0) || 1)) *
                    100
                )}%`,
              },
            ]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => commit(valueRef.current)}
          style={styles.doneButton}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  arcFrame: {
    alignItems: "center",
    justifyContent: "center",
  },
  arcValueWrap: {
    alignItems: "center",
    bottom: 34,
    left: 0,
    position: "absolute",
    right: 0,
  },
  arcValue: {
    color: appTheme.colors.textPrimary,
    fontFamily: typography.fontFamily.headingBlack,
    fontSize: 31,
    letterSpacing: -1.2,
  },
  arcCaption: {
    color: appTheme.colors.textMuted,
    fontFamily: typography.fontFamily.monoMedium,
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  inputRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  dragTarget: {
    height: 164,
    width: 164,
  },
  inputCopy: {
    flex: 1,
    minWidth: 0,
  },
  inputInstruction: {
    color: appTheme.colors.textBody,
    fontFamily: typography.fontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  dragMeter: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: 999,
    height: 10,
    overflow: "hidden",
  },
  dragMeterFill: {
    backgroundColor: appTheme.metrics.duration.accent,
    borderRadius: 999,
    height: "100%",
  },
  doneButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: appTheme.colors.textPrimary,
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneText: {
    color: "#FFFFFF",
    fontFamily: typography.fontFamily.heading,
    fontSize: 12,
  },
});
