import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appTheme, spacing, typography } from "@/theme";
import { GradientHeader } from "@/components/common/ui/GradientHeader";

export function AppHeader({
  leftSlot,
  rightSlot,
  title,
  titleAccessory,
  bottomSlot,
  insetPreset,
  topInsetOffset,
  bottomPadding,
  style,
  titleStyle,
  titleRowStyle,
  bottomSlotStyle,
  titleNumberOfLines,
  titleEllipsizeMode,
}) {
  return (
    <GradientHeader
      style={style}
      insetPreset={insetPreset}
      topInsetOffset={topInsetOffset}
      bottomPadding={bottomPadding}
    >
      {(leftSlot || rightSlot) && (
        <View style={styles.topRow}>
          <View style={styles.slot}>{leftSlot}</View>
          <View style={styles.slotEnd}>{rightSlot}</View>
        </View>
      )}

      {(title || titleAccessory) && (
        <View style={[styles.titleRow, titleRowStyle]}>
          {title ? (
            <Text
              style={[styles.title, titleStyle]}
              numberOfLines={titleNumberOfLines}
              ellipsizeMode={titleEllipsizeMode}
            >
              {title}
            </Text>
          ) : (
            <View />
          )}
          {titleAccessory ? <View>{titleAccessory}</View> : null}
        </View>
      )}

      {bottomSlot ? <View style={[styles.bottomSlot, bottomSlotStyle]}>{bottomSlot}</View> : null}
    </GradientHeader>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  slot: {
    minWidth: appTheme.header.iconButtonSize,
    alignItems: "flex-start",
  },
  slotEnd: {
    minWidth: appTheme.header.iconButtonSize,
    alignItems: "flex-end",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
    fontSize: 24,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.7,
    color: appTheme.colors.textPrimary,
  },
  bottomSlot: {
    marginTop: 8,
  },
});
