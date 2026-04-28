import React from "react";
import { StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader } from "@/components/common/ui";
import { StatsContent } from "./stats";
import { appTheme, typography } from "@/theme";
import SettingsIcon from "@/assets/icons/profile/settings.svg";

export default function ProfileScreen() {
  return (
    <BackdropScreen
      contentStyle={styles.content}
      headerBehavior="collapsible"
      collapsedTitle="ME"
      header={
        <AppHeader
          leftSlot={<Text style={styles.headerTopTitle}>ME</Text>}
          rightSlot={
            <AppButton
              onPress={() => router.push("/settings")}
              variant="overlay"
              size="icon"
              accessibilityLabel="Open settings"
            >
              <SettingsIcon
                width={18}
                height={18}
                color={appTheme.colors.textStrong}
                fill={appTheme.colors.textStrong}
                stroke={appTheme.colors.textStrong}
                strokeWidth={0.55}
              />
            </AppButton>
          }
        />
      }
      bottomInsetOffset={96}
      minBottomPadding={120}
    >
      <StatsContent presentation="inline" />
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 0,
  },
  headerTopTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: typography.fontFamily.heading,
    letterSpacing: -0.7,
  },
  headerBottom: {
    marginTop: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
});
