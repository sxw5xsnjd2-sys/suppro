import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
} from "@/components/common/ui";
import AccountIcon from "@/assets/icons/profile/account.svg";
import ConnectionsIcon from "@/assets/icons/profile/connections.svg";
import FavouriteIcon from "@/assets/icons/profile/favourite.svg";
import QuestionnaireIcon from "@/assets/icons/profile/questionnaire.svg";
import { appTheme, spacing, typography } from "@/theme";

function SupplementsIcon({ width, height, color }) {
  return (
    <Ionicons name="nutrition-outline" size={Math.min(width, height)} color={color} />
  );
}

const SETTINGS_ITEMS = [
  {
    key: "my-supplements",
    label: "My Supplements",
    route: "/my-supplements",
    Icon: SupplementsIcon,
  },
  {
    key: "account",
    label: "Account",
    route: "/account",
    Icon: AccountIcon,
  },
  {
    key: "connections",
    label: "Connections",
    route: "/connections",
    Icon: ConnectionsIcon,
  },
  {
    key: "favourites",
    label: "Favourites",
    route: "/favourites",
    Icon: FavouriteIcon,
  },
  {
    key: "questionnaire",
    label: "Retake Questionnaire",
    route: "/onboarding?mode=retake",
    Icon: QuestionnaireIcon,
  },
];

function SettingsItemRow({ item, showBorder = false }) {
  const IconComponent = item.Icon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      onPress={() => router.push(item.route)}
      style={({ pressed }) => [
        styles.itemRow,
        showBorder && styles.itemRowBorder,
        pressed && styles.itemRowPressed,
      ]}
    >
      <View style={styles.itemRowCopy}>
        <View style={styles.itemIconShell}>
          <IconComponent
            width={18}
            height={18}
            color={appTheme.colors.textStrong}
            fill={appTheme.colors.textStrong}
            stroke={appTheme.colors.textStrong}
            strokeWidth={0.55}
          />
        </View>
        <Text style={styles.itemLabel}>{item.label}</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={appTheme.colors.textSecondary}
      />
    </Pressable>
  );
}

export default function SettingsScreen() {
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
          title="SETTINGS"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Supplements, account, connections, and more
            </Text>
          }
          bottomSlotStyle={styles.headerBottom}
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <View style={styles.shortcutsList}>
        {SETTINGS_ITEMS.map((item, index) => (
          <SettingsItemRow
            key={item.key}
            item={item}
            showBorder={index < SETTINGS_ITEMS.length - 1}
          />
        ))}
      </View>
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
  shortcutsList: {},
  itemRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  itemRowPressed: {
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  itemRowCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  itemIconShell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
});
