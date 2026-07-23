import React from "react";
import { StyleSheet, View } from "react-native";
import { getEvidenceDisplay } from "./EvidenceDots";

export function EvidenceStatusDot({
  score,
  evidenceType = "Overall evidence",
  style,
}) {
  const evidence = getEvidenceDisplay(score);
  const accessibilityLabel = Number.isFinite(score)
    ? `${evidenceType} ${Math.round(score)} out of 100`
    : `${evidenceType} not rated`;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.dot,
        { backgroundColor: evidence.color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
});
