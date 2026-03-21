import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppButton, PrimaryCard } from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";

export function HealthMetricCard({
  label,
  description,
  latestValue,
  hasEntries,
  hasChart,
  chart,
  actionLabel = "Track",
  sourceLabel,
  emptyText,
  actionDisabled = false,
  onTrack,
  onOpenSummary,
}) {
  return (
    <PrimaryCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.label}>{label}</Text>
          {description ? (
            <Text style={styles.description}>{description}</Text>
          ) : null}
          {sourceLabel ? (
            <View style={styles.sourcePill}>
              <Text style={styles.sourceText}>{sourceLabel}</Text>
            </View>
          ) : null}
        </View>

        <AppButton
          label={actionLabel}
          variant="primary"
          size="sm"
          onPress={onTrack}
          disabled={actionDisabled}
          style={styles.trackButton}
          textStyle={styles.trackButtonText}
        />
      </View>

      {hasEntries ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenSummary}
          style={({ pressed }) => [styles.body, pressed && styles.bodyPressed]}
        >
          {hasChart ? (
            chart
          ) : (
            <View style={styles.latestBlock}>
              <Text style={styles.latestLabel}>Latest entry</Text>
              <Text style={styles.latestValue}>{latestValue}</Text>
            </View>
          )}
          <Text style={styles.tapHint}>Tap to view history and details</Text>
        </Pressable>
      ) : (
        <View style={styles.body}>
          <Text style={styles.emptyText}>
            {emptyText || "No data yet. Tap Track to add today's value."}
          </Text>
        </View>
      )}
    </PrimaryCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.3,
  },
  description: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  sourcePill: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  sourceText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  trackButton: {
    alignSelf: "flex-start",
    marginTop: 1,
  },
  trackButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  body: {
    marginTop: spacing.md,
  },
  bodyPressed: {
    opacity: 0.86,
  },
  latestBlock: {
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  latestLabel: {
    fontSize: 12,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textTertiary,
    marginBottom: 4,
  },
  latestValue: {
    fontSize: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  tapHint: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textTertiary,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
});
