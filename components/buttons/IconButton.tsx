import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, spacing } from "@/theme";

type IconButtonProps = {
  icon?: "refresh" | string;
  size?: number;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

export function IconButton({
  icon = "refresh",
  size = 18,
  onPress,
  disabled,
  accessibilityLabel,
  style,
}: IconButtonProps) {
  const glyph = icon === "refresh" ? "⟳" : icon;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.icon, { fontSize: size }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.background.card,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    color: colors.text.primary,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
});
