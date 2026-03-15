import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  BENEFIT_ICON_NUDGE,
  METAL_BADGE_GRADIENTS,
  METAL_BADGE_LOCATIONS,
} from "@/features/supplements/benefits";

export function BenefitIconBadge({
  label,
  color,
  tone,
  Icon,
  size = 20,
  containerSize = 40,
}) {
  const nudge = BENEFIT_ICON_NUDGE[label] ?? 0;
  const iconNode = (
    <Icon
      width={size}
      height={size}
      style={nudge ? { transform: [{ translateX: nudge }] } : undefined}
    />
  );

  if (tone && METAL_BADGE_GRADIENTS[tone]) {
    return (
      <LinearGradient
        colors={METAL_BADGE_GRADIENTS[tone]}
        locations={METAL_BADGE_LOCATIONS[tone]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[
          styles.badge,
          {
            width: containerSize,
            height: containerSize,
            borderRadius: containerSize / 2,
          },
        ]}
      >
        {iconNode}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.badge,
        {
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: color,
        },
      ]}
    >
      {iconNode}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
  },
});
