import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { appTheme } from "@/theme";

export function GradientHeader({
  children,
  colors = appTheme.header.gradient,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  insetPreset = "screen",
  topInsetOffset,
  bottomPadding = appTheme.header.bottomPadding,
  style,
}) {
  const insets = useSafeAreaInsets();
  const resolvedTopInsetOffset =
    typeof topInsetOffset === "number"
      ? topInsetOffset
      : insetPreset === "modal"
      ? appTheme.modal.headerTopInsetOffset
      : appTheme.header.topInsetOffset;

  return (
    <LinearGradient
      colors={colors}
      start={start}
      end={end}
      style={[
        styles.root,
        {
          paddingTop: insets.top + resolvedTopInsetOffset,
          paddingBottom: bottomPadding,
        },
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: appTheme.screen.sidePadding,
  },
});
