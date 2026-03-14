import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appTheme, spacing, typography } from "@/theme";

export function SectionTitle({
  title,
  subtitle,
  action,
  style,
  titleStyle,
  subtitleStyle,
}) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.copy}>
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  action: {
    marginLeft: spacing.sm,
  },
});
