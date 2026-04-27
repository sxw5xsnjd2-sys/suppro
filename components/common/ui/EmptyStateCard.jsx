import React from "react";
import { StyleSheet, Text } from "react-native";
import { PrimaryCard } from "@/components/common/ui/PrimaryCard";
import { AppButton } from "@/components/common/ui/AppButton";
import { appTheme, spacing, typography } from "@/theme";

export function EmptyStateCard({
  title,
  description,
  actionLabel,
  onActionPress,
  style,
  titleStyle,
  descriptionStyle,
}) {
  return (
    <PrimaryCard style={[styles.card, style]}>
      <Text style={[styles.title, titleStyle]}>{title}</Text>
      <Text style={[styles.description, descriptionStyle]}>{description}</Text>
      {actionLabel && onActionPress ? (
        <AppButton
          label={actionLabel}
          variant="accent"
          onPress={onActionPress}
          style={styles.action}
        />
      ) : null}
    </PrimaryCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: "#6F6F6F",
    textAlign: "center",
  },
  action: {
    marginTop: spacing.md,
  },
});
