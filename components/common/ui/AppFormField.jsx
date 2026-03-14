import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appTheme, spacing, typography } from "@/theme";

export function AppFormField({
  label,
  children,
  helperText,
  errorText,
  style,
  labelStyle,
  helperTextStyle,
  errorTextStyle,
}) {
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      {children}
      {helperText ? (
        <Text style={[styles.helperText, helperTextStyle]}>{helperText}</Text>
      ) : null}
      {errorText ? (
        <Text style={[styles.errorText, errorTextStyle]}>{errorText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: spacing.md,
  },
  label: {
    marginBottom: spacing.xs,
    fontSize: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
    letterSpacing: -0.1,
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.danger,
  },
});
