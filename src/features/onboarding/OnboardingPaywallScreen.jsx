import React, { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { useRevenueCat } from "@/features/subscriptions/RevenueCatProvider";
import { resolveOriginAppPaywallAction } from "@/features/subscriptions/accessPolicy";
import {
  clearOnboardingPremiumComplete,
  markOnboardingPremiumComplete,
} from "@src/lib/onboarding";

export default function OnboardingPaywallScreen() {
  const params = useLocalSearchParams();
  const originParam = Array.isArray(params.origin)
    ? params.origin[0]
    : params.origin;
  const returnsToApp = originParam === "app";
  const returnsToLogin = originParam === "login";
  const {
    isReady,
    isLoading,
    configurationError,
    presentPremiumPaywall,
    currentOffering,
    premiumActive,
  } = useRevenueCat();
  const isCompletingRef = useRef(false);
  const canUseRevenueCat = isReady && !configurationError;
  const originAppAction = resolveOriginAppPaywallAction({
    origin: originParam,
    hasActiveAccess: premiumActive,
    isReady,
    isLoading,
    configurationError,
    hasCurrentOffering: Boolean(currentOffering),
  });

  const continueToAccount = useCallback(async () => {
    if (isCompletingRef.current) return;

    isCompletingRef.current = true;
    try {
      await markOnboardingPremiumComplete();
      router.replace(
        returnsToApp
          ? "/"
          : returnsToLogin
          ? "/login?mode=login"
          : "/login?mode=create"
      );
    } finally {
      isCompletingRef.current = false;
    }
  }, [returnsToApp, returnsToLogin]);

  const routeToLogin = useCallback(async () => {
    if (returnsToApp) {
      router.replace("/settings");
      return;
    }

    await clearOnboardingPremiumComplete();
    router.replace("/login?mode=login");
  }, [returnsToApp]);

  const hasOpenedRef = useRef(false);

  useEffect(() => {
    if (originAppAction === "continue_to_app") {
      continueToAccount();
      return;
    }

    if (originAppAction === "route_settings") {
      routeToLogin();
      return;
    }

    if (originAppAction === "wait") {
      return;
    }

    if (!isReady || !canUseRevenueCat || hasOpenedRef.current || !currentOffering)
      return;

    hasOpenedRef.current = true;

    const run = async () => {
      try {
        const unlocked = await presentPremiumPaywall({ ifNeeded: false });
        if (unlocked) {
          await continueToAccount();
        } else {
          await routeToLogin();
        }
      } catch {
        await routeToLogin();
      }
    };

    run();
  }, [
    originAppAction,
    isReady,
    canUseRevenueCat,
    currentOffering,
    continueToAccount,
    presentPremiumPaywall,
    routeToLogin,
  ]);

  return (
    <BackdropScreen scrollable={false}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    </BackdropScreen>
  );
}
