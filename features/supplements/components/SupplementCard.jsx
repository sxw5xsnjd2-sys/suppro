import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppButton, PrimaryCard } from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
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
    <PrimaryCard
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, taken && styles.cardTaken]}
      pressedStyle={styles.pressed}
    >
      <View style={styles.row}>
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
          {subtitle ? (
            <Text style={[styles.subtitle, taken && styles.subtitleTaken]}>
              {subtitle}
            </Text>
          ) : null}
          {footer ? <Text style={styles.footerInline}>{footer}</Text> : null}
        </View>

        <View style={styles.trailing}>
          {onInfoPress ? (
            <AppButton
              label="Info"
              variant="accent"
              size="sm"
              onPress={onInfoPress}
              textStyle={styles.infoText}
            />
          ) : null}

          {showCheckbox ? (
            <Ionicons
              name={taken ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={
                taken ? appTheme.colors.success : appTheme.colors.borderInactive
              }
            />
          ) : null}
        </View>
      </View>
    </PrimaryCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cardTaken: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  pressed: {
    opacity: appTheme.card.pressedOpacity,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: appTheme.colors.iconSurface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textPrimary,
    marginBottom: 4,
  },
  nameTaken: {
    color: appTheme.colors.textMuted,
    textDecorationLine: "line-through",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  subtitleTaken: {
    color: appTheme.colors.textMuted,
    textDecorationLine: "line-through",
  },
  footerInline: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textTertiary,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginLeft: spacing.md,
  },
  infoText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
