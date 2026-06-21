import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  OnboardingCTA,
  OnboardingShell,
  QuestionHero,
  onboardingV6,
} from "./v6Primitives";
import AppleHealthLogoAsset from "@/assets/icons/apple-health-logo-1.png";
import {
  markOnboardingAppleHealthComplete,
  markOnboardingAppleHealthConnectRequested,
} from "@src/lib/onboarding";
import {
  clearNavigationHandoff,
  NAVIGATION_HANDOFFS,
  startNavigationHandoff,
} from "@src/lib/navigationHandoff";
import { requestOnboardingAppleHealthPermissions } from "@/features/health/onboardingAppleHealth";
import { typography } from "@/theme";

const NEXT_STEP_HREF = "/onboarding?mode=first_run&step=referral-source";

export default function OnboardingAppleHealthScreen() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function goToNextStep() {
    startNavigationHandoff(NAVIGATION_HANDOFFS.APPLE_HEALTH_NEXT);

    try {
      await markOnboardingAppleHealthComplete();
      router.replace(NEXT_STEP_HREF);
    } catch (error) {
      clearNavigationHandoff(NAVIGATION_HANDOFFS.APPLE_HEALTH_NEXT.reason);
      throw error;
    }
  }

  async function handleConnectAppleHealth() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      try {
        await markOnboardingAppleHealthConnectRequested();
      } catch {
        // The onboarding step can still continue if this local marker fails.
      }

      try {
        await requestOnboardingAppleHealthPermissions();
      } catch {
        // Permission denial, cancellation, or availability issues still advance onboarding.
      }

      await goToNextStep();
    } catch {
      setIsSubmitting(false);
    }
  }

  async function handleSkip() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await goToNextStep();
    } catch {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      progress={0.98}
      showBack={false}
      contentContainerStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <OnboardingCTA
            label={isSubmitting ? "Connecting..." : "Connect Apple Health"}
            disabled={isSubmitting}
            onPress={() => {
              void handleConnectAppleHealth();
            }}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            disabled={isSubmitting}
            onPress={() => {
              void handleSkip();
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              (pressed || isSubmitting) && styles.secondaryButtonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.heroWrap}>
        <View style={styles.logoTile}>
          <Image
            source={AppleHealthLogoAsset}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <QuestionHero
          centered
          title="Connect Apple Health"
          subtitle="Suppro can use selected Apple Health data, such as activity and body measurements, to help personalise your supplement insights."
        />

        <Text style={styles.reassuranceText}>
          You choose what to share and can change permissions anytime in the
          Health app.
        </Text>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
  },
  heroWrap: {
    alignItems: "center",
  },
  logoTile: {
    width: 72,
    height: 72,
    marginBottom: 18,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(20,20,20,0.06)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#141414",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  logoImage: {
    width: 56,
    height: 56,
  },
  reassuranceText: {
    marginTop: 16,
    maxWidth: 320,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
    textAlign: "center",
  },
  footer: {
    gap: 14,
  },
  secondaryButton: {
    alignSelf: "center",
    minHeight: 32,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.muted,
  },
});
