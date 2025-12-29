import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, shadows, typography } from "@/theme";
import { SupplementRoute } from "@/types/Supplement";
import { Icon } from "@/components/icons/Icon";

type SupplementCardProps = {
  name: string;
  subtitle?: string;
  route: SupplementRoute;
  taken?: boolean;
  footer?: string;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function SupplementCard({
  name,
  subtitle,
  taken = false,
  footer,
  route,
  onPress,
  onLongPress,
}: SupplementCardProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.wrapper, pressed && { opacity: 0.96 }]}
    >
      <View style={styles.card}>
        {/* Left icon */}
        <View style={styles.iconContainer}>
          <Icon route={route} size={28} />
        </View>

        {/* Text */}
        <View style={styles.textContainer}>
          <Text style={styles.name}>{name}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {/* Right state */}
        {taken ? (
          <View style={styles.check}>
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={colors.status.success}
            />
          </View>
        ) : null}
      </View>

      {/* ✅ Footer */}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },

  pressed: {
    opacity: 0.85,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.card,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadows.card,
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },

  textContainer: {
    flex: 1,
  },

  name: {
    fontSize: typography.title.fontSize,
    fontWeight: typography.title.fontWeight,
    color: colors.text.primary,
    marginBottom: 2,
  },

  subtitle: {
    fontSize: typography.body.fontSize,
    color: colors.text.secondary,
  },

  check: {
    marginLeft: spacing.sm,
  },

  footer: {
    marginTop: spacing.xs,
    marginLeft: 44 + spacing.md,
    fontSize: typography.caption.fontSize ?? 12,
    color: colors.text.muted,
  },
});
