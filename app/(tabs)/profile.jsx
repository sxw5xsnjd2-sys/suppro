import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader, PrimaryCard } from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import AccountIcon from "@/assets/icons/profile/account.svg";
import FavouriteIcon from "@/assets/icons/profile/favourite.svg";
import QuestionnaireIcon from "@/assets/icons/profile/questionnaire.svg";
import SettingsIcon from "@/assets/icons/profile/settings.svg";
import RankingsIcon from "@/assets/icons/supplements/medal.svg";

const MENU_ITEMS = [
  {
    key: "account",
    label: "Account",
    route: "/account",
    Icon: AccountIcon,
  },
  {
    key: "settings",
    label: "Settings",
    route: "/settings",
    Icon: SettingsIcon,
  },
  {
    key: "favourites",
    label: "Favourites",
    route: "/favourites",
    Icon: FavouriteIcon,
  },
  {
    key: "supplement-rankings",
    label: "Supplement Rankings",
    route: "/supplement-rankings",
    Icon: RankingsIcon,
  },
  {
    key: "questionnaire",
    label: "Retake Questionnaire",
    route: "/onboarding?mode=retake",
    Icon: QuestionnaireIcon,
  },
];

function ProfileMenuItem({ item, showBorder }) {
  const IconComponent = item.Icon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      onPress={() => router.push(item.route)}
      style={({ pressed }) => [
        styles.menuItem,
        showBorder && styles.menuItemBorder,
        pressed && styles.menuItemPressed,
      ]}
    >
      <View style={styles.menuLeft}>
        <View style={styles.iconShell}>
          <IconComponent
            width={18}
            height={18}
            color={appTheme.colors.textStrong}
            fill={appTheme.colors.textStrong}
            stroke={appTheme.colors.textStrong}
            strokeWidth={0.55}
          />
        </View>

        <Text style={styles.menuLabel}>{item.label}</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={appTheme.colors.textSecondary}
      />
    </Pressable>
  );
}

export default function ProfileScreen() {
  return (
    <BackdropScreen
      header={
        <AppHeader
          leftSlot={
            <AppButton
              onPress={() => router.back()}
              variant="overlay"
              size="icon"
              accessibilityLabel="Go back"
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={appTheme.colors.textStrong}
              />
            </AppButton>
          }
          title="PROFILE"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Personal settings and shortcuts
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <PrimaryCard style={styles.menuCard}>
        {MENU_ITEMS.map((item, index) => (
          <ProfileMenuItem
            key={item.key}
            item={item}
            showBorder={index < MENU_ITEMS.length - 1}
          />
        ))}
      </PrimaryCard>
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  menuCard: {
    paddingVertical: 0,
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 72,
    paddingHorizontal: appTheme.card.paddingSpacious,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  menuItemPressed: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  menuLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconShell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
