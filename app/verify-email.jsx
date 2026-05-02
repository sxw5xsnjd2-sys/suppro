import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  GhostButton,
  OnboardingCTA,
  OnboardingShell,
  QuestionHero,
  onboardingV6,
} from "@src/features/onboarding/v6Primitives";

export default function VerifyEmailScreen() {
  return (
    <>
      <StatusBar style="dark" />
      <OnboardingShell
        progress={1}
        onBack={() => router.replace("/login?mode=login")}
        footer={
          <>
            <OnboardingCTA
              label="Back to sign in"
              onPress={() => router.replace("/login?mode=login")}
            />
            <GhostButton
              label="Use a different email"
              onPress={() => router.replace("/login?mode=create")}
              style={styles.footerGhost}
            />
          </>
        }
        scrollable={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name="mail-open-outline"
            size={34}
            color={onboardingV6.primaryDk}
          />
        </View>

        <QuestionHero
          centered
          title="Thank you for signing up"
          subtitle="Please verify your email address to finish setting up your account."
        />

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons
              name="mail-unread-outline"
              size={18}
              color={onboardingV6.primaryDk}
            />
            <Text style={styles.infoText}>
              If you did not receive a verification email, check your junk
              folder.
            </Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={onboardingV6.primaryDk}
            />
            <Text style={styles.infoText}>
              Need help? Email us at{" "}
              <Text style={styles.infoTextStrong}>hello@suppro.co.uk</Text>
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh sign in page"
          onPress={() => router.replace("/login?mode=login")}
          style={({ pressed }) => [
            styles.inlineLink,
            pressed && styles.inlineLinkPressed,
          ]}
        >
          <Text style={styles.inlineLinkText}>
            After verifying, come back here and sign in.
          </Text>
        </Pressable>
      </OnboardingShell>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: onboardingV6.sidePadding,
    paddingBottom: 24,
    justifyContent: "center",
    gap: 22,
  },
  iconWrap: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: onboardingV6.softer,
    borderWidth: 1,
    borderColor: onboardingV6.border,
  },
  infoCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
    backgroundColor: onboardingV6.surface,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  infoDivider: {
    height: 1,
    backgroundColor: onboardingV6.border,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Exo_400Regular",
    color: onboardingV6.muted,
  },
  infoTextStrong: {
    fontFamily: "Exo_600SemiBold",
    color: onboardingV6.ink,
  },
  inlineLink: {
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlineLinkPressed: {
    opacity: 0.72,
  },
  inlineLinkText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Exo_500Medium",
    color: onboardingV6.primaryDk,
    textAlign: "center",
  },
  footerGhost: {
    marginTop: 12,
  },
});
