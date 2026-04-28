import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader } from "@/components/common/ui";
import { useRevenueCat } from "@/features/subscriptions/RevenueCatProvider";
import { appTheme, spacing, typography } from "@/theme";
import {
  clearOnboardingPremiumComplete,
  markOnboardingPremiumComplete,
} from "@src/lib/onboarding";
import { supabase } from "@src/lib/supabase";

export default function OnboardingPaywallScreen() {
  const params = useLocalSearchParams();
  const originParam = Array.isArray(params.origin)
    ? params.origin[0]
    : params.origin;
  const returnsToLogin = originParam === "login";
  const {
    isReady,
    isLoading,
    configurationError,
    actionError,
    actionMessage,
    premiumActive,
    isRefreshing,
    isRestoring,
    isPresentingPaywall,
    presentPremiumPaywall,
    restorePurchases,
    currentOffering,
  } = useRevenueCat();

  const [localMessage, setLocalMessage] = useState("");
  const isCompletingRef = useRef(false);

  const isBusy =
    isLoading || isRefreshing || isRestoring || isPresentingPaywall;
  const canUseRevenueCat = isReady && !configurationError;

  const statusMessage = useMemo(() => {
    if (isLoading && !isReady) {
      return "Preparing Premium...";
    }

    if (configurationError) {
      return configurationError;
    }

    if (localMessage) {
      return "Premium is required";
    }

    if (actionError) {
      return "Premium could not be opened";
    }

    if (premiumActive) {
      return "Premium is active. Continuing...";
    }

    if (isPresentingPaywall) {
      return "Opening Premium...";
    }

    return "Premium is required to continue";
  }, [
    actionError,
    configurationError,
    isLoading,
    isPresentingPaywall,
    isReady,
    localMessage,
    premiumActive,
  ]);

  const continueToAccount = useCallback(async () => {
    if (isCompletingRef.current) return;

    isCompletingRef.current = true;
    try {
      await markOnboardingPremiumComplete();
      router.replace(
        returnsToLogin ? "/login?mode=login" : "/login?mode=create"
      );
    } finally {
      isCompletingRef.current = false;
    }
  }, [returnsToLogin]);

  const routeToLogin = useCallback(async () => {
    await clearOnboardingPremiumComplete();
    router.replace("/login?mode=login");
  }, []);

  const openPaywall = useCallback(async () => {
    if (!canUseRevenueCat || isBusy) return false;

    setLocalMessage("");

    const unlocked = await presentPremiumPaywall({ ifNeeded: true });

    if (unlocked) {
      await continueToAccount();
      return true;
    }

    await routeToLogin();
    return false;
  }, [
    canUseRevenueCat,
    isBusy,
    presentPremiumPaywall,
    continueToAccount,
    routeToLogin,
  ]);

  const handleRestorePurchases = useCallback(async () => {
    if (!canUseRevenueCat || isBusy) return;

    setLocalMessage("");
    const restored = await restorePurchases();

    if (restored) {
      await continueToAccount();
      return;
    }

    setLocalMessage(
      "No active Premium purchase was found. Unlock Premium to continue."
    );
  }, [canUseRevenueCat, continueToAccount, isBusy, restorePurchases]);

  const restoreLabel = isRestoring ? "Restoring..." : "Restore purchases";
  const needsFallbackCopy = Boolean(
    configurationError || actionError || actionMessage || localMessage
  );
  const canStartSubscription = canUseRevenueCat && !isBusy && !premiumActive;
  const showStartSubscription = canUseRevenueCat && !premiumActive;
  const canRestore = canUseRevenueCat && !isBusy && needsFallbackCopy;

  const hasOpenedRef = useRef(false);

  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
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
    isReady,
    canUseRevenueCat,
    premiumActive,
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

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 28,
    fontFamily: typography.fontFamily.headingBlack,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: appTheme.screen.sidePadding,
    gap: spacing.md,
  },
  statusText: {
    textAlign: "center",
    fontSize: 16,
    lineHeight: 22,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textPrimary,
  },
  restoreButton: {
    alignSelf: "stretch",
    minHeight: 50,
  },
  noteText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textStrong,
  },
  successText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.successStrong,
  },
  errorText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.danger,
  },
  actionButton: {
    alignSelf: "stretch",
    minHeight: 50,
  },
});
