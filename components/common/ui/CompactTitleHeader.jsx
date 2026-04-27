import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appTheme, typography } from "@/theme";
import { GradientHeader } from "./GradientHeader";

export const COMPACT_TITLE_HEADER_TRIGGER_OFFSET = 44;

export function CompactTitleHeader({ title, style, titleStyle }) {
  return (
    <GradientHeader
      colors={[
        appTheme.screen.background,
        appTheme.screen.background,
      ]}
      topInsetOffset={0}
      bottomPadding={10}
      style={[styles.root, style]}
    >
      <View style={styles.row}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.title, titleStyle]}
        >
          {title}
        </Text>
      </View>
    </GradientHeader>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: appTheme.screen.background,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
    overflow: "hidden",
  },
  row: {
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    lineHeight: 21,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.2,
    textAlign: "center",
  },
});
