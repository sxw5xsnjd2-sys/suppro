import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, shadows, typography } from "@/theme";
import { SupplementRoute } from "@/features/supplements/types";
import { Icon } from "@/features/supplements/icons/Icon";

type SupplementCardProps = {
  name: string;
  subtitle?: string;
  route: SupplementRoute;
  taken?: boolean;
  footer?: string;
  showCheckbox?: boolean;
  iconBackgroundColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onInfoPress?: () => void;
};

export function SupplementCard({
  name,
  subtitle,
  taken = false,
  footer,
  route,
  showCheckbox = true,
  iconBackgroundColor,
  onPress,
  onLongPress,
  onInfoPress,
}: SupplementCardProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
    >
      <View style={[styles.card, taken && styles.cardTaken]}>
        {/* Left icon */}
        <View
          style={[
            styles.iconContainer,
            iconBackgroundColor && {
              backgroundColor: `${iconBackgroundColor}22`,
            },
          ]}
        >
          <Icon route={route} size={28} />
        </View>

        {/* Text */}
        <View style={styles.textContainer}>
          <Text style={[styles.name, taken && styles.nameTaken]}>{name}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.trailing}>
          {/* Status indicator */}
          {showCheckbox && (
            <View style={styles.status}>
              {taken ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={colors.status.success}
                />
              ) : (
                <View style={styles.emptyCircle} />
              )}
            </View>
          )}

          {onInfoPress ? (
            <Pressable
              onPress={onInfoPress}
              hitSlop={8}
              style={({ pressed }) => [
                styles.infoButton,
                pressed && styles.infoButtonPressed,
              ]}
            >
              <Text style={styles.infoText}>More info</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Footer */}
      {footer ? <Text style={styles.footerOverlay}>{footer}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },

  pressed: {
    opacity: 0.96,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.card,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadows.card,
  },

  cardTaken: {
    backgroundColor: "rgba(22,163,74,0.06)", // subtle green wash
  },

  status: {
    marginRight: spacing.sm,
  },

  emptyCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border.subtle,
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background.card,
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

  nameTaken: {
    color: colors.text.secondary,
  },

  subtitle: {
    fontSize: typography.body.fontSize,
    color: colors.text.secondary,
  },

  footer: {
    marginTop: spacing.xs,
    marginLeft: 22 + spacing.md + 44 + spacing.md, // status + icon offset
    fontSize: typography.caption.fontSize ?? 12,
    color: colors.text.muted,
  },

  footerOverlay: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.sm,
    fontSize: typography.caption.fontSize ?? 12,
    color: colors.text.muted,
    textAlign: "right",
  },

  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },

  infoButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.background.app,
  },
  infoButtonPressed: {
    opacity: 0.8,
  },
  infoText: {
    fontSize: typography.caption.fontSize ?? 12,
    fontWeight: "600",
    color: colors.brand.primary,
  },
});
