import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as StoreReview from "expo-store-review";
import {
  OnboardingCTA,
  OnboardingShell,
  QuestionHero,
  onboardingV6,
} from "./v6Primitives";
import {
  hasAttemptedOnboardingRatingReview,
  markOnboardingRatingComplete,
  markOnboardingRatingReviewAttempted,
} from "@src/lib/onboarding";
import { logBuildAwareDiagnostic } from "@src/lib/runtimeConfig";

const REVIEW_REQUEST_TIMEOUT_MS = 1200;
const REVIEW_PROMPT_SETTLE_DELAY_MS = 700;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function canRequestStoreReview() {
  const hasAction =
    typeof StoreReview.hasAction === "function"
      ? StoreReview.hasAction()
      : true;
  const isAvailable =
    typeof StoreReview.isAvailableAsync === "function"
      ? await StoreReview.isAvailableAsync()
      : true;

  return (
    Boolean(hasAction) &&
    Boolean(isAvailable) &&
    typeof StoreReview.requestReview === "function"
  );
}

export default function OnboardingRatingScreen() {
  const isRoutingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const attemptStoreReviewWhileVisible = useCallback(async () => {
    const hasAttemptedReview = await hasAttemptedOnboardingRatingReview();

    if (hasAttemptedReview) {
      return;
    }

    await markOnboardingRatingReviewAttempted();

    try {
      if (!(await canRequestStoreReview())) {
        return;
      }

      await Promise.race([
        Promise.resolve(StoreReview.requestReview()),
        delay(REVIEW_REQUEST_TIMEOUT_MS),
      ]);
      await delay(REVIEW_PROMPT_SETTLE_DELAY_MS);
    } catch (error) {
      logBuildAwareDiagnostic(
        "warn",
        "[onboarding-rating] Store review prompt unavailable",
        {
          developmentDetails: {
            message: error instanceof Error ? error.message : String(error),
          },
          productionDetails: {
            message: "store review unavailable",
          },
        }
      );
    }
  }, []);

  const completeRatingStep = useCallback(
    async () => {
      if (isRoutingRef.current) {
        return;
      }

      isRoutingRef.current = true;
      setIsSubmitting(true);

      try {
        await attemptStoreReviewWhileVisible();
        await markOnboardingRatingComplete();
      } catch (error) {
        logBuildAwareDiagnostic(
          "warn",
          "[onboarding-rating] Failed to complete rating step",
          {
            developmentDetails: {
              message: error instanceof Error ? error.message : String(error),
            },
            productionDetails: {
              message: "rating step completion failed",
            },
          }
        );
        setIsSubmitting(false);
        isRoutingRef.current = false;
      }
    },
    [attemptStoreReviewWhileVisible]
  );

  return (
    <OnboardingShell
      progress={0.96}
      showBack={false}
      contentContainerStyle={styles.content}
      footer={
        <OnboardingCTA
          label="Continue"
          disabled={isSubmitting}
          onPress={() => {
            void completeRatingStep();
          }}
        />
      }
    >
      <View style={styles.heroWrap}>
        <View style={styles.iconWrap}>
          <Ionicons name="star" size={28} color={onboardingV6.primaryDk} />
        </View>
        <QuestionHero
          centered
          title="Enjoying Suppro so far?"
          subtitle="A quick rating helps us keep improving the app."
        />
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
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: onboardingV6.accentA,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    marginBottom: 18,
  },
});
