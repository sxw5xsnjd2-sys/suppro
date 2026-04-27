import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { appTheme, shadows, typography } from "@/theme";

export function AppButton({
  label,
  children,
  variant = "ghost",
  size = "md",
  style,
  textStyle,
  contentStyle,
  accessibilityLabel,
  ...props
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      {...props}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        pressed && styles.pressed,
        style,
      ]}
    >
      {variant === "accent" ? (
        <LinearGradient
          pointerEvents="none"
          colors={appTheme.tabBar.fabGradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.accentFill}
        />
      ) : null}
      <View style={[styles.content, contentStyle]}>
        {children || <Text style={[styles.text, textVariantStyles[variant], textStyle]}>{label}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 999,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.72,
  },
  content: {
    position: "relative",
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  accentFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  text: {
    fontSize: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
});

const variantStyles = StyleSheet.create({
  ghost: {
    backgroundColor: "transparent",
  },
  overlay: {
    backgroundColor: appTheme.colors.surfaceOverlay,
  },
  accent: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(20,20,20,0.08)",
    ...shadows.card,
  },
  primary: {
    backgroundColor: appTheme.colors.textStrong,
  },
  danger: {
    backgroundColor: appTheme.colors.danger,
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    minHeight: 32,
    minWidth: 32,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  md: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  icon: {
    width: appTheme.header.iconButtonSize,
    height: appTheme.header.iconButtonSize,
    minHeight: appTheme.header.iconButtonSize,
    minWidth: appTheme.header.iconButtonSize,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: appTheme.header.iconButtonSize / 2,
  },
});

const textVariantStyles = StyleSheet.create({
  ghost: {
    color: appTheme.colors.textStrong,
  },
  overlay: {
    color: appTheme.colors.textStrong,
  },
  accent: {
    color: appTheme.colors.textStrong,
  },
  primary: {
    color: "#FFFFFF",
  },
  danger: {
    color: "#FFFFFF",
  },
});
