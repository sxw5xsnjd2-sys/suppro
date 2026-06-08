import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import { IS_APPLE_HEALTH_SUPPORTED_PLATFORM } from "@/features/health/platform";
import QuestionnaireScreen from "@src/features/onboarding/QuestionnaireScreen";

function OnboardingPaywallStep(props) {
  const OnboardingPaywallScreen =
    require("@src/features/onboarding/OnboardingPaywallScreen").default;

  return <OnboardingPaywallScreen {...props} />;
}

function OnboardingBookOfferStep(props) {
  const OnboardingBookOfferScreen =
    require("@src/features/onboarding/OnboardingBookOfferScreen").default;

  return <OnboardingBookOfferScreen {...props} />;
}

function OnboardingReferralSourceStep() {
  const OnboardingReferralSourceScreen =
    require("@src/features/onboarding/OnboardingReferralSourceScreen").default;

  return <OnboardingReferralSourceScreen />;
}

function OnboardingRatingStep() {
  const OnboardingRatingScreen =
    require("@src/features/onboarding/OnboardingRatingScreen").default;

  return <OnboardingRatingScreen />;
}

function buildBookOfferHref(originParam) {
  const suffix =
    typeof originParam === "string" && originParam.trim()
      ? `&origin=${encodeURIComponent(originParam.trim())}`
      : "";

  return `/onboarding?mode=first_run&step=book-offer${suffix}`;
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams();
  const [hasShownBookAfterPaymentCancel, setHasShownBookAfterPaymentCancel] =
    useState(false);
  const hasShownBookAfterPaymentCancelRef = useRef(false);
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const stepParam = Array.isArray(params.step) ? params.step[0] : params.step;
  const mode = modeParam === "retake" ? "retake" : "first_run";
  const isStrictFirstRun = mode === "first_run";
  const handleOnboardingPaywallPurchaseCancelled = useCallback((originParam) => {
    if (hasShownBookAfterPaymentCancelRef.current) {
      return false;
    }

    hasShownBookAfterPaymentCancelRef.current = true;
    setHasShownBookAfterPaymentCancel(true);
    router.replace(buildBookOfferHref(originParam));
    return true;
  }, []);
  const locksHardwareBack =
    isStrictFirstRun &&
    (stepParam === "account" ||
      stepParam === "paywall" ||
      stepParam === "referral-source" ||
      stepParam === "book-offer");

  useEffect(() => {
    if (!locksHardwareBack) return undefined;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true
    );

    return () => {
      subscription.remove();
    };
  }, [locksHardwareBack]);

  if (stepParam === "paywall") {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
        />
        <OnboardingPaywallStep
          hasShownBookAfterPaymentCancel={hasShownBookAfterPaymentCancel}
          hasShownBookAfterPaymentCancelRef={
            hasShownBookAfterPaymentCancelRef
          }
          onPurchaseCancelled={handleOnboardingPaywallPurchaseCancelled}
        />
      </>
    );
  }

  if (stepParam === "book-offer") {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
        />
        <OnboardingBookOfferStep />
      </>
    );
  }

  if (stepParam === "referral-source") {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
        />
        <OnboardingReferralSourceStep />
      </>
    );
  }

  if (stepParam === "rating") {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
        />
        <OnboardingRatingStep />
      </>
    );
  }

  if (stepParam === "apple-health") {
    if (!IS_APPLE_HEALTH_SUPPORTED_PLATFORM) {
      return (
        <>
          <Stack.Screen
            options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
          />
          <Redirect href={`/onboarding?mode=${mode}&step=referral-source`} />
        </>
      );
    }

    const OnboardingAppleHealthScreen =
      require("@src/features/onboarding/OnboardingAppleHealthScreen").default;

    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
        />
        <OnboardingAppleHealthScreen />
      </>
    );
  }

  if (stepParam === "account") {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
        />
        <Redirect href="/login?mode=create" />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
      />
      <QuestionnaireScreen standalone />
    </>
  );
}
