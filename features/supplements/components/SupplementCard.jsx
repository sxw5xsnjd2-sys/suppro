import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, shadows, typography } from "@/theme";
import { Icon } from "@/features/supplements/icons/Icon";

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
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
    >
      <View style={[styles.card, taken && styles.cardTaken]}>
        <View
          style={[
            styles.iconContainer,
            iconBackgroundColor && {
              backgroundColor: `${iconBackgroundColor}22`,
            },
          ]}
        >
          <Icon route={route} size={24} />
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.name, taken && styles.nameTaken]}>{name}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {footer ? <Text style={styles.footerInline}>{footer}</Text> : null}
        </View>

        <View style={styles.trailing}>
          {showCheckbox ? (
            <Ionicons
              name={taken ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={taken ? colors.status.success : colors.border.strong}
            />
          ) : null}

          {onInfoPress ? (
            <Pressable
              onPress={onInfoPress}
              hitSlop={8}
              style={({ pressed }) => [styles.infoButton, pressed && styles.infoButtonPressed]}
            >
              <Text style={styles.infoText}>Info</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.94,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  cardTaken: {
    backgroundColor: "#EEF7EE",
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: typography.title.fontSize,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 2,
  },
  nameTaken: {
    color: colors.text.secondary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  footerInline: {
    marginTop: 4,
    fontSize: 12,
    color: colors.text.muted,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginLeft: spacing.sm,
  },
  infoButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  infoButtonPressed: {
    opacity: 0.8,
  },
  infoText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand.primary,
  },
});
