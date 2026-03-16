import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { appTheme, shadows } from "@/theme";

export function PrimaryCard({
  children,
  style,
  onPress,
  onLongPress,
  pressedStyle,
  variant = "default",
  accessibilityRole,
  ...rest
}) {
  const cardStyles = [styles.card, variantStyles[variant], style];

  if (onPress || onLongPress) {
    return (
      <Pressable
        accessibilityRole={accessibilityRole || "button"}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        {...rest}
        style={({ pressed }) => [
          ...cardStyles,
          pressed && styles.pressed,
          pressed && pressedStyle,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View {...rest} style={cardStyles}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.card.radius,
    paddingHorizontal: appTheme.card.padding,
    paddingVertical: appTheme.card.padding,
    ...shadows.card,
  },
  pressed: {
    opacity: appTheme.card.pressedOpacity,
  },
});

const variantStyles = StyleSheet.create({
  default: {},
  muted: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  accent: {
    backgroundColor: appTheme.colors.surfaceAccent,
  },
});
