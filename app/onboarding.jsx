import { useEffect } from "react";
import { BackHandler } from "react-native";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { IS_APPLE_HEALTH_SUPPORTED_PLATFORM } from "@/features/health/platform";
import QuestionnaireScreen from "@src/features/onboarding/QuestionnaireScreen";

function OnboardingPaywallStep() {
  const OnboardingPaywallScreen =
    require("@src/features/onboarding/OnboardingPaywallScreen").default;

  return <OnboardingPaywallScreen />;
}

function OnboardingRatingStep() {
  const OnboardingRatingScreen =
    require("@src/features/onboarding/OnboardingRatingScreen").default;

  return <OnboardingRatingScreen />;
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const stepParam = Array.isArray(params.step) ? params.step[0] : params.step;
  const mode = modeParam === "retake" ? "retake" : "first_run";
  const isStrictFirstRun = mode === "first_run";
  const locksHardwareBack =
    isStrictFirstRun && (stepParam === "account" || stepParam === "paywall");

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
        <OnboardingPaywallStep />
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
          <Redirect href={`/onboarding?mode=${mode}&step=paywall`} />
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
