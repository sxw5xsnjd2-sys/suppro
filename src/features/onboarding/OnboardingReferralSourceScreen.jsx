import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  OnboardingShell,
  OptionRow,
  QuestionHero,
  onboardingV6,
} from "./v6Primitives";
import { markOnboardingReferralSourceComplete } from "@src/lib/onboarding";
import {
  clearNavigationHandoff,
  NAVIGATION_HANDOFFS,
  startNavigationHandoff,
} from "@src/lib/navigationHandoff";
import { logBuildAwareDiagnostic } from "@src/lib/runtimeConfig";

const REFERRAL_SOURCE_OPTIONS = [
  "App Store",
  "TikTok",
  "Instagram",
  "YouTube",
  "Google",
  "Friend or family",
  "Doctor / healthcare professional",
  "Gym / personal trainer",
  "Supplement shop",
  "Reddit / online forum",
  "Blog or article",
  "TV",
  "Other",
];

export default function OnboardingReferralSourceScreen() {
  const [selectedSource, setSelectedSource] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function completeReferralSourceStep(nextSource) {
    if (!nextSource || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSelectedSource(nextSource);
    startNavigationHandoff(NAVIGATION_HANDOFFS.REFERRAL_SOURCE_NEXT);

    try {
      await markOnboardingReferralSourceComplete(nextSource);
      router.replace("/onboarding?mode=first_run&step=paywall");
    } catch (error) {
      clearNavigationHandoff(
        NAVIGATION_HANDOFFS.REFERRAL_SOURCE_NEXT.reason,
      );
      logBuildAwareDiagnostic(
        "warn",
        "[onboarding-referral-source] Failed to complete referral source step",
        {
          developmentDetails: {
            message: error instanceof Error ? error.message : String(error),
          },
          productionDetails: {
            message: "referral source step completion failed",
          },
        },
      );
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      progress={0.99}
      showBack={false}
      contentContainerStyle={styles.content}
    >
      <QuestionHero
        title="How did you hear about us?"
        subtitle="This helps us understand where people are discovering Suppro."
      />
      <View style={styles.options}>
        {REFERRAL_SOURCE_OPTIONS.map((option) => (
          <OptionRow
            key={option}
            label={option}
            selected={selectedSource === option}
            onPress={() => {
              void completeReferralSourceStep(option);
            }}
          />
        ))}
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 18,
  },
  options: {
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 26,
    gap: 10,
  },
});
