import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { appTheme, typography } from "@/theme";

export function StatusPill({
  label,
  tone = "highlight",
  style,
  textStyle,
}) {
  if (tone === "highlight") {
    return (
      <LinearGradient
        colors={appTheme.gradients.evidenceBadge}
        locations={[0.30985, 0.47574, 0.63187, 0.7392, 0.81727]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.base, styles.highlightBase, style]}
      >
        <Text style={[styles.label, textToneStyles[tone], textStyle]}>{label}</Text>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.base, toneStyles[tone], style]}>
      <Text style={[styles.label, textToneStyles[tone], textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    justifyContent: "center",
  },
  highlightBase: {
    paddingVertical: 0,
  },
  label: {
    fontSize: 12,
    fontFamily: typography.fontFamily.heading,
    lineHeight: 22,
    letterSpacing: -0.43,
  },
});

const toneStyles = StyleSheet.create({
  neutral: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  success: {
    backgroundColor: appTheme.colors.success,
  },
  evidenceGood: {
    backgroundColor: appTheme.colors.evidenceStrong,
  },
  evidenceAverage: {
    backgroundColor: appTheme.colors.evidenceModerate,
  },
  evidencePoor: {
    backgroundColor: appTheme.colors.evidenceLow,
  },
});

const textToneStyles = StyleSheet.create({
  highlight: {
    color: appTheme.colors.evidenceBadgeText,
  },
  neutral: {
    color: appTheme.colors.textStrong,
  },
  success: {
    color: "#FFFFFF",
  },
  evidenceGood: {
    color: "#FFFFFF",
  },
  evidenceAverage: {
    color: appTheme.colors.evidenceBadgeText,
  },
  evidencePoor: {
    color: "#FFFFFF",
  },
});
