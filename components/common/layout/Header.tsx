import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, gradients } from "@/theme";

type HeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  centered?: boolean;
};

export const HEADER_HEIGHT = 80;

export function Header({ title, subtitle, rightSlot, centered }: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      style={[
        styles.container,
        {
          paddingTop: insets.top + spacing.md,
          height: HEADER_HEIGHT + insets.top,
        },
      ]}
      colors={gradients.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    height: HEADER_HEIGHT,
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
