import React, { useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { appTheme } from "@/theme";
import {
  BLOOD_PRESSURE_METRIC_KEY,
  INPUT_ARCHETYPES,
  normalizeBloodPressureValue,
} from "@/features/health/metricDefinitions";
import { accentForMetric } from "@/features/health/groupAccents";

const PERIOD_DAYS = { D: 1, W: 7, M: 30, "6M": 180, Y: 365 };

function formatEntryDate(isoDate, period) {
  try {
    const d = new Date(isoDate + "T00:00:00");
    if (period === "6M" || period === "Y") {
      return d.toLocaleDateString("en-GB", { month: "short" });
    }
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return isoDate ?? "";
  }
}

// Horizontal padding on each side of the chart's parent screen
const SCREEN_H_PAD = 16;

function getYRange(metric, values) {
  if (
    metric.inputArchetype === INPUT_ARCHETYPES.SCORE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.PRESSURE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.SEVERITY_0_10
  ) {
    return { yMin: 0, yMax: 10 };
  }
  if (metric.key === "weight") {
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    return { yMin: Math.floor(dataMin - 2), yMax: Math.ceil(dataMax + 2) };
  }
  if (metric.key === BLOOD_PRESSURE_METRIC_KEY) {
    return { yMin: 60, yMax: 160 };
  }
  if (metric.inputArchetype === INPUT_ARCHETYPES.DURATION) {
    return { yMin: 0, yMax: 12 };
  }
  return { yMin: 0, yMax: Math.max(...values, 1) * 1.1 };
}

export function MetricDetailChart({ metric, entries = [], period = "W" }) {
  const { width: screenWidth } = useWindowDimensions();
  const svgWidth = screenWidth - SCREEN_H_PAD * 2;

  const accent = accentForMetric(metric);
  const isBP = metric.key === BLOOD_PRESSURE_METRIC_KEY;

  const slice = useMemo(() => {
    const days = PERIOD_DAYS[period] ?? 7;
    const arr = entries ?? [];
    return arr.slice(-Math.max(1, Math.min(days, arr.length || days)));
  }, [entries, period]);

  const numericValues = useMemo(
    () =>
      slice.map((e) => {
        if (isBP) {
          const bp = normalizeBloodPressureValue(e.value);
          return bp?.systolic ?? 0;
        }
        return Number(e.value) || 0;
      }),
    [slice, isBP]
  );

  const { yMin, yMax } = useMemo(
    () => getYRange(metric, numericValues.length ? numericValues : [0]),
    [metric, numericValues]
  );
  const yRange = yMax - yMin || 1;

  // Chart canvas constants (in viewBox units)
  const vbW = 360;
  const vbH = 220;
  const padL = 8;
  const padR = 36;
  const padT = 16;
  const padB = 28;
  const chartW = vbW - padL - padR;
  const chartH = vbH - padT - padB;

  const xLabels = slice.map((e) => formatEntryDate(e.date, period));
  const ySteps = 4;
  const gridLines = Array.from({ length: ySteps + 1 }, (_, i) => ({
    v: yMin + (yRange * i) / ySteps,
    y: padT + chartH - (chartH * i) / ySteps,
  }));

  const isScale =
    metric.inputArchetype === INPUT_ARCHETYPES.SCORE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.PRESSURE_1_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.SEVERITY_0_10 ||
    metric.inputArchetype === INPUT_ARCHETYPES.DURATION;

  // Pre-compute line chart points so we avoid IIFE inside JSX
  const linePts = useMemo(() => {
    if (isScale || isBP || slice.length === 0) return [];
    return slice.map((p, i) => {
      const v = Number(p.value) || 0;
      const x = padL + (chartW * (i + 0.5)) / slice.length;
      const y = padT + chartH - ((v - yMin) / yRange) * chartH;
      return [x, y];
    });
  }, [isScale, isBP, slice, yMin, yRange, chartW, chartH]);

  const linePathD = useMemo(
    () =>
      linePts
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
        .join(" "),
    [linePts]
  );

  return (
    <View>
      <Svg
        width={svgWidth}
        height={(svgWidth * vbH) / vbW}
        viewBox={`0 0 ${vbW} ${vbH}`}
      >
        {/* Horizontal grid lines + Y labels */}
        {gridLines.map((g, i) => (
          <React.Fragment key={i}>
            <Line
              x1={padL}
              y1={g.y}
              x2={vbW - padR}
              y2={g.y}
              stroke={appTheme.colors.borderSubtle}
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <SvgText
              x={vbW - padR + 6}
              y={g.y + 4}
              fontSize="10"
              fontFamily="GeistMono_400Regular"
              fill={appTheme.colors.textMuted}
            >
              {Math.round(g.v)}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Vertical guide lines — only for D and W */}
        {(period === "D" || period === "W") &&
          xLabels.map((_, i) => {
            const x = padL + (chartW * (i + 0.5)) / (xLabels.length || 1);
            return (
              <Line
                key={i}
                x1={x}
                y1={padT}
                x2={x}
                y2={padT + chartH}
                stroke={appTheme.colors.borderSubtle}
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.5"
              />
            );
          })}

        {/* Bars — scale / duration metrics */}
        {isScale &&
          !isBP &&
          slice.map((p, i) => {
            const v = Number(p.value) || 0;
            const barW = 16;
            const x = padL + (chartW * (i + 0.5)) / (slice.length || 1) - barW / 2;
            const barH = ((v - yMin) / yRange) * chartH;
            const y = padT + chartH - barH;
            return (
              <Rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, barH)}
                rx={4}
                fill={accent.tint}
                opacity={i === slice.length - 1 ? 1 : 0.85}
              />
            );
          })}

        {/* Line + dots — numeric metrics */}
        {linePts.length > 0 && (
          <Path
            d={linePathD}
            fill="none"
            stroke={accent.tint}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {linePts.map(([x, y], i) => (
          <Circle
            key={i}
            cx={x}
            cy={y}
            r={i === linePts.length - 1 ? 4 : 3}
            fill={appTheme.colors.surface}
            stroke={accent.tint}
            strokeWidth="2"
          />
        ))}

        {/* Dual scatter — blood pressure */}
        {isBP &&
          slice.map((p, i) => {
            const bp = normalizeBloodPressureValue(p.value);
            if (!bp) return null;
            const x = padL + (chartW * (i + 0.5)) / (slice.length || 1);
            const sysY = padT + chartH - ((bp.systolic - yMin) / yRange) * chartH;
            const diaY = padT + chartH - ((bp.diastolic - yMin) / yRange) * chartH;
            return (
              <React.Fragment key={i}>
                <Circle cx={x} cy={sysY} r={3} fill={appTheme.colors.textStrong} />
                <Circle cx={x} cy={diaY} r={3} fill={appTheme.colors.danger} />
              </React.Fragment>
            );
          })}

        {/* X-axis labels — only for D and W where labels won't overlap */}
        {(period === "D" || period === "W") &&
          xLabels.map((lbl, i) => {
            const x = padL + (chartW * (i + 0.5)) / (xLabels.length || 1);
            return (
              <SvgText
                key={i}
                x={x}
                y={vbH - 8}
                fontSize="10"
                textAnchor="middle"
                fontFamily="Exo_400Regular"
                fill={appTheme.colors.textMuted}
              >
                {lbl}
              </SvgText>
            );
          })}
      </Svg>
    </View>
  );
}
