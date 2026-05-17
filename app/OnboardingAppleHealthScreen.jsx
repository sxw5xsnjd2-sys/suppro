import { Redirect } from "expo-router";
import { IS_APPLE_HEALTH_SUPPORTED_PLATFORM } from "@/features/health/platform";
import OnboardingAppleHealthScreen from "@src/features/onboarding/OnboardingAppleHealthScreen";

export default function OnboardingAppleHealthRoute() {
  if (!IS_APPLE_HEALTH_SUPPORTED_PLATFORM) {
    return <Redirect href="/onboarding?mode=first_run&step=paywall" />;
  }

  return <OnboardingAppleHealthScreen />;
}
