import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  ChatFloatingButton,
  PrimaryCard,
} from "@/components/common/ui";
import { useSubscriptionAccess } from "@/features/subscriptions/useSubscriptionAccess";
import { StatsContent } from "./stats";
import { appTheme, typography } from "@/theme";
import SettingsIcon from "@/assets/icons/profile/settings.svg";

export default function ProfileScreen() {
  const { hasActiveAccess, openSubscriptionPaywall } = useSubscriptionAccess();

  return (
    <BackdropScreen
      contentStyle={styles.content}
      floatingSlot={hasActiveAccess ? <ChatFloatingButton /> : null}
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
      {hasActiveAccess ? (
        <StatsContent presentation="inline" />
      ) : (
        <PrimaryCard style={styles.lockedCard}>
          <Text style={styles.lockedTitle}>Premium required</Text>
          <Text style={styles.lockedBody}>
            Restore or restart Premium to unlock your saved stats, tracked
            progress, and personalised profile insights.
          </Text>
          <View style={styles.lockedActions}>
            <AppButton
              label="Open Premium"
              variant="primary"
              onPress={() => openSubscriptionPaywall()}
            />
            <AppButton
              label="Settings"
              variant="ghost"
              onPress={() => router.push("/settings")}
            />
          </View>
        </PrimaryCard>
      )}
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 0,
  },
  lockedCard: {
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 14,
  },
  lockedTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
  lockedBody: {
    color: appTheme.colors.textBody,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
  },
  lockedActions: {
    gap: 10,
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
