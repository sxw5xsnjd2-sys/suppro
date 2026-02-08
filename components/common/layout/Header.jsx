import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, gradients } from "@/theme";
export const HEADER_HEIGHT = 80;
export function Header({ title, subtitle, rightSlot, centered }) {
    const insets = useSafeAreaInsets();
    return (<LinearGradient style={[
            styles.container,
            {
                paddingTop: insets.top + spacing.sm,
                height: HEADER_HEIGHT + insets.top + spacing.sm,
            },
        ]} colors={gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={[styles.row, centered && styles.rowCentered]}>
        <View style={[styles.textBlock, centered && styles.textBlockCentered]}>
          <Text style={[styles.title, centered && styles.textCentered]}>
            {title}
          </Text>

          {subtitle ? (<Text style={[styles.subtitle, centered && styles.textCentered]}>
              {subtitle}
            </Text>) : null}
        </View>

        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </LinearGradient>);
}
const styles = StyleSheet.create({
    container: {
        height: HEADER_HEIGHT + spacing.md,
        paddingHorizontal: spacing.lg,
        justifyContent: "flex-end",
        paddingBottom: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.subtle,
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
        fontSize: 32,
        lineHeight: 36,
        fontWeight: "700",
        color: colors.text.primary,
    },
    subtitle: {
        marginTop: spacing.xs,
        fontSize: 16,
        lineHeight: 20,
        color: colors.text.secondary,
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
