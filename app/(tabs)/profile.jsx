import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";
import AccountIcon from "@/assets/icons/profile/account.svg";
import FavouriteIcon from "@/assets/icons/profile/favourite.svg";
import QuestionnaireIcon from "@/assets/icons/profile/questionnaire.svg";

const MENU_ITEMS = [
  {
    key: "account",
    label: "Account",
    route: "/modal/account",
    Icon: AccountIcon,
  },
  {
    key: "favourites",
    label: "Favourites",
    route: "/modal/favourites",
    Icon: FavouriteIcon,
  },
  {
    key: "questionnaire",
    label: "Retake Questionnaire",
    route: "/modal/questionnaire",
    Icon: QuestionnaireIcon,
  },
];

export default function ProfileScreen() {
  return (
    <Screen
      header={
        <Header
          title="Profile"
          subtitle="Personal settings and shortcuts"
          leftSlot={
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          }
          centered
        />
      }
      scrollable={false}
    >
      <View style={styles.container}>
        <View style={styles.menuCard}>
          {MENU_ITEMS.map((item, index) => {
            const showBorder = index < MENU_ITEMS.length - 1;
            const IconComponent = item.Icon;
            return (
              <Pressable
                key={item.key}
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
                      color={colors.icon.primary}
                      fill={colors.icon.primary}
                      stroke={colors.icon.primary}
                      strokeWidth={0.55}
                    />
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.icon.muted}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButtonText: {
    fontSize: 15,
    color: colors.text.secondary,
    fontWeight: "500",
  },
  container: {
    marginTop: spacing.lg,
  },
  menuCard: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadows.card,
  },
  menuItem: {
    minHeight: 68,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  menuItemPressed: {
    backgroundColor: colors.background.elevated,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconShell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: "600",
  },
});
