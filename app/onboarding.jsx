import { useEffect } from "react";
import { BackHandler } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import QuestionnaireScreen from "@src/features/onboarding/QuestionnaireScreen";
import { SignUpScreen } from "./(modals)/modal/sign-up";

export default function OnboardingScreen() {
  const params = useLocalSearchParams();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const stepParam = Array.isArray(params.step) ? params.step[0] : params.step;
  const mode = modeParam === "retake" ? "retake" : "first_run";
  const isStrictFirstRun = mode === "first_run";

  useEffect(() => {
    if (!isStrictFirstRun || stepParam !== "account") return undefined;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true
    );

    return () => {
      subscription.remove();
    };
  }, [isStrictFirstRun, stepParam]);

  if (stepParam === "account") {
    return (
      <>
        <Stack.Screen
          options={{ headerShown: false, gestureEnabled: !isStrictFirstRun }}
        />
        <SignUpScreen standalone mode={mode} />
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
