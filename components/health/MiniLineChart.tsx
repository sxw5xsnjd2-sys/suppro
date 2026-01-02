import React from "react";
import { View, LayoutChangeEvent } from "react-native";
import Svg, {
  Path,
  Line,
  Circle,
  Defs,
  ClipPath,
  Rect,
  G,
} from "react-native-svg";

import { colors } from "@/theme";

type Props = {
  data: number[];
  height?: number;
  min?: number;
  max?: number;
};

export function MiniLineChart({
  data,
  height = 120,
  min = 1,
  max = 10,
}: Props) {
  const [width, setWidth] = React.useState(0);

  const padding = 10;
  const top = padding;
  const bottom = height - padding;
  const plotHeight = bottom - top;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== width) setWidth(w);
  };

  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));

  if (width === 0) {
    return <View onLayout={onLayout} style={{ height }} />;
  }

  const x0 = padding;
  const x1 = width - padding;

  const valueToY = (value: number) => {
    const v = clamp(value, min, max);
    const t = (v - min) / (max - min); // 0..1
    const y = bottom - t * plotHeight;
    return clamp(y, top, bottom);
  };

  // 0 points
  if (data.length === 0) return null;

  // ─────────────────────────────────────────────
  // 1 point → single dot
  // ─────────────────────────────────────────────
  if (data.length === 1) {
    const cx = width / 2;
    const cy = valueToY(data[0]);

    return (
      <View onLayout={onLayout} style={{ height }}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <ClipPath id="clip">
              <Rect x="0" y="0" width={width} height={height} />
            </ClipPath>
          </Defs>

          <G clipPath="url(#clip)">
            {/* axes */}
            <Line
              x1={x0}
              y1={top}
              x2={x0}
              y2={bottom}
              stroke={colors.border.subtle}
            />
            <Line
              x1={x0}
              y1={bottom}
              x2={x1}
              y2={bottom}
              stroke={colors.border.subtle}
            />

            <Circle
              cx={cx}
              cy={cy}
              r={3.5}
              fill={colors.brand.primary}
              opacity={0.9}
            />
          </G>
        </Svg>
      </View>
    );
  }

  // ─────────────────────────────────────────────
  // 2+ points → line
  // ─────────────────────────────────────────────
  const points = data.map((value, index) => {
    const t = index / (data.length - 1); // 0..1
    const x = x0 + t * (x1 - x0);
    const y = valueToY(value);
    return { x, y };
  });

  const d = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <ClipPath id="clip">
            <Rect x="0" y="0" width={width} height={height} />
          </ClipPath>
        </Defs>

        <G clipPath="url(#clip)">
          {/* axes */}
          <Line
            x1={x0}
            y1={top}
            x2={x0}
            y2={bottom}
            stroke={colors.border.subtle}
          />
          <Line
            x1={x0}
            y1={bottom}
            x2={x1}
            y2={bottom}
            stroke={colors.border.subtle}
          />

          {/* line */}
          <Path
            d={d}
            stroke={colors.brand.primary}
            strokeWidth={2}
            fill="none"
          />

          {/* points */}
          {points.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2.5}
              fill={colors.brand.primary}
              opacity={0.9}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}
