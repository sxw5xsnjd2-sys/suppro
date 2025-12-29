import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/theme";

type HeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  centered?: boolean;
};

export const HEADER_HEIGHT = 140;

export function Header({ title, subtitle, rightSlot, centered }: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.row, centered && styles.rowCentered]}>
        <View style={[styles.textBlock, centered && styles.textBlockCentered]}>
          <Text style={[styles.title, centered && styles.textCentered]}>
            {title}
          </Text>

          {subtitle ? (
            <Text style={[styles.subtitle, centered && styles.textCentered]}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HEADER_HEIGHT,
    backgroundColor: colors.background.header,
    paddingHorizontal: spacing.lg,
    justifyContent: "flex-end",
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  textBlock: {
    flexShrink: 1,
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "700",
    color: colors.text.inverse,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 18,
    color: "rgba(255,255,255,0.75)",
  },
  rightSlot: {
    marginLeft: spacing.md,
  },

  rowCentered: {
    justifyContent: "center",
  },
  textBlockCentered: {
    alignItems: "center",
  },
  textCentered: {
    textAlign: "center",
  },
});
