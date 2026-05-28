import { Redirect } from "expo-router";
import { IS_APPLE_HEALTH_SUPPORTED_PLATFORM } from "@/features/health/platform";

export default function OnboardingAppleHealthRoute() {
  if (!IS_APPLE_HEALTH_SUPPORTED_PLATFORM) {
    return <Redirect href="/onboarding?mode=first_run&step=referral-source" />;
  }

  const OnboardingAppleHealthScreen =
    require("@src/features/onboarding/OnboardingAppleHealthScreen").default;

  return <OnboardingAppleHealthScreen />;
}
