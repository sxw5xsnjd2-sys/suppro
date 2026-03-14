import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import {
  AppButton,
  AppModalSurface,
  SectionTitle,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";

export function DeleteMetricModal({
  visible,
  metricLabel,
  onCancel,
  onConfirm,
  variant = "metric",
}) {
  const isMetric = variant === "metric";
  const title = isMetric ? "Delete metric?" : "Delete entry?";
  const body = isMetric
    ? metricLabel
      ? `This will permanently delete “${metricLabel}” and all its data.`
      : "This will permanently delete this metric and all its data."
    : "This will permanently delete this data point. This action can’t be reversed.";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <AppModalSurface cardStyle={styles.card} contentStyle={styles.content}>
        <SectionTitle
          title={title}
          subtitle="This action cannot be undone."
          titleStyle={styles.title}
          subtitleStyle={styles.subtitle}
        />

        <View style={styles.messageCard}>
          <Text style={styles.body}>{body}</Text>
        </View>

        <View style={styles.actions}>
          <AppButton
            label="Cancel"
            variant="overlay"
            onPress={onCancel}
            style={[styles.actionButton, styles.cancelButton]}
            textStyle={styles.cancelText}
          />
          <AppButton
            label="Delete"
            variant="danger"
            onPress={onConfirm}
            style={styles.actionButton}
            textStyle={styles.deleteText}
          />
        </View>
      </AppModalSurface>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: 460,
  },
  card: {
    width: "100%",
    minHeight: 245,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 26,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.7,
    color: appTheme.colors.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  messageCard: {
    marginTop: spacing.md,
    borderRadius: appTheme.card.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: appTheme.colors.surfaceAccent,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  deleteText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
});
