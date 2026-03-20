import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appTheme, typography } from "@/theme";
import { PrimaryCard } from "./PrimaryCard";

export function SelectableCard({
  label,
  description,
  selected = false,
  disabled = false,
  trailing,
  children,
  style,
  contentStyle,
  labelStyle,
  descriptionStyle,
  accessibilityRole,
  ...rest
}) {
  return (
    <PrimaryCard
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        selected,
        disabled,
      }}
      style={[
        styles.card,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
        style,
      ]}
      {...rest}
    >
      <View style={[styles.content, contentStyle]}>
        {children ? (
          children
        ) : (
          <View style={styles.copy}>
            <Text style={[styles.label, selected && styles.labelSelected, labelStyle]}>
              {label}
            </Text>
            {description ? (
              <Text style={[styles.description, descriptionStyle]}>
                {description}
              </Text>
            ) : null}
          </View>
        )}
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </PrimaryCard>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: appTheme.questionnaire.optionMinHeight,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  cardSelected: {
    backgroundColor: appTheme.colors.surfaceAccent,
    borderColor: "rgba(20,20,20,0.16)",
  },
  cardDisabled: {
    opacity: 0.45,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  copy: {
    flex: 1,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textPrimary,
  },
  labelSelected: {
    color: appTheme.colors.textStrong,
  },
  description: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  trailing: {
    marginLeft: 10,
  },
});
