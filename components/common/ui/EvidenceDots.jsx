import React from "react";
import { StyleSheet, View } from "react-native";
import { appTheme } from "@/theme";

export function getEvidenceDisplay(score) {
  if (!Number.isFinite(score)) {
    return {
      count: 0,
      color: appTheme.colors.evidenceUnknown,
      badgeLabel: null,
    };
  }

  if (score >= 75) {
    return {
      count: 3,
      color: appTheme.colors.evidenceStrong,
      badgeLabel: "STRONG EVIDENCE",
    };
  }

  if (score >= 50) {
    return {
      count: 2,
      color: appTheme.colors.evidenceModerate,
      badgeLabel: null,
    };
  }

  return {
    count: 1,
    color: appTheme.colors.evidenceLow,
    badgeLabel: null,
  };
}

export function EvidenceDots({ score, muted = false, style }) {
  const evidence = getEvidenceDisplay(score);
  const activeColor = muted ? appTheme.colors.evidenceMuted : evidence.color;

  return (
    <View style={[styles.row, style]}>
      {[0, 1, 2].map((index) => {
        const active = index < evidence.count;
        return (
          <View
            key={index}
            style={[
              styles.dot,
              active
                ? { backgroundColor: activeColor }
                : styles.inactiveDot,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  inactiveDot: {
    backgroundColor: appTheme.colors.borderInactive,
  },
});
