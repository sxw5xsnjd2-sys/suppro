import React from "react";
import { View, LayoutChangeEvent } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
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

  if (data.length === 0) {
    return null;
  }

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const padding = 8;
  const clampY = (y: number, margin = 0) =>
    Math.min(height - padding - margin, Math.max(padding + margin, y));

  // ⛔️ wait for layout before drawing anything
  if (width === 0) {
    return <View onLayout={onLayout} style={{ height }} />;
  }

  // ✅ Single data point → single dot
  if (data.length === 1) {
    const cx = width / 2;
    const clamped = Math.min(Math.max(data[0], min), max);
    const chartHeight = height - padding * 2;
    const rawY =
      padding + chartHeight - ((clamped - min) / (max - min)) * chartHeight;
    const cy = clampY(rawY, 3); // keep dot fully inside

    return (
      <View onLayout={onLayout}>
        <Svg width={width} height={height}>
          {/* Axes */}
          <Path
            d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`}
            stroke={colors.border.subtle}
            strokeWidth={1}
          />
          <Path
            d={`M ${padding} ${padding} L ${padding} ${height - padding}`}
            stroke={colors.border.subtle}
            strokeWidth={1}
          />

          <Circle
            cx={cx}
            cy={cy}
            r={3}
            fill={colors.brand.primary}
            opacity={0.85}
          />
        </Svg>
      </View>
    );
  }

  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((value, index) => {
    const clamped = Math.min(Math.max(value, min), max);
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const rawY =
      padding + chartHeight - ((clamped - min) / (max - min)) * chartHeight;
    const y = clampY(rawY, 1); // keep stroke inside chart box
    return { x, y };
  });

  const d = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        {/* Axes */}
        <Path
          d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`}
          stroke={colors.border.subtle}
          strokeWidth={1}
        />
        <Path
          d={`M ${padding} ${padding} L ${padding} ${height - padding}`}
          stroke={colors.border.subtle}
          strokeWidth={1}
        />

        <Path d={d} stroke={colors.brand.primary} strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}
