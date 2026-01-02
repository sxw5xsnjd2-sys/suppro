import React from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import { colors, spacing, radius, shadows, typography } from "@/theme";

type Props = {
  visible: boolean;
  metricLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  variant?: "metric" | "entry";
};

export function DeleteMetricModal({
  visible,
  metricLabel,
  onCancel,
  onConfirm,
  variant = "metric",
}: Props) {
  const isMetric = variant === "metric";
  const title = isMetric ? "Delete metric?" : "Delete entry?";
  const body = isMetric
    ? metricLabel
      ? `This will permanently delete “${metricLabel}” and all its data.`
      : "This will permanently delete this metric and all its data."
    : "This will permanently delete this data point. This action can’t be reversed.";

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <Text style={styles.body}>{body}</Text>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable onPress={onConfirm} style={styles.delete}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.card,
  },
  title: {
    ...typography.heading,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.lg,
  },
  cancel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelText: {
    color: colors.text.secondary,
  },
  delete: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  deleteText: {
    color: "#C62828",
    fontWeight: "500",
  },
});
