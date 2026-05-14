import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton } from "@/components/common/ui";
import { useRevenueCat } from "@/features/subscriptions/RevenueCatProvider";
import { resolveOnboardingPaywallViewState } from "@/features/subscriptions/accessPolicy";
import { appTheme, typography } from "@/theme";
import { markOnboardingPremiumComplete } from "@src/lib/onboarding";

const SUBSCRIPTION_STATUS_ERROR_MESSAGE =
  "Unable to check subscription status. Please try again.";

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
    isRefreshing,
    isRestoring,
    isPresentingPaywall,
    isIdentitySyncing,
    configurationError,
    actionError,
    refreshState,
    presentPremiumPaywall,
    currentOffering,
    lapsedOffering,
    premiumActive,
  } = useRevenueCat();
  const isCompletingRef = useRef(false);
  const hasRefreshedAccessRef = useRef(false);
  const [hasAttemptedPaywall, setHasAttemptedPaywall] = useState(false);

  const paywallOffering = returnsToApp ? lapsedOffering : currentOffering;
  const viewState = useMemo(
    () =>
      resolveOnboardingPaywallViewState({
        origin: originParam,
        hasActiveAccess: premiumActive,
        isReady,
        isLoading,
        isRefreshing,
        isRestoring,
        isPresentingPaywall,
        isIdentitySyncing,
        configurationError,
        hasCurrentOffering: Boolean(paywallOffering),
      }),
    [
      configurationError,
      isIdentitySyncing,
      isLoading,
      isPresentingPaywall,
      isReady,
      isRefreshing,
      isRestoring,
      originParam,
      paywallOffering,
      premiumActive,
    ],
  );

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
            : "/login?mode=create",
      );
    } finally {
      isCompletingRef.current = false;
    }
  }, [returnsToApp, returnsToLogin]);

  useEffect(() => {
    if (hasRefreshedAccessRef.current) {
      return;
    }

    hasRefreshedAccessRef.current = true;
    refreshState({
      silent: true,
      invalidateCustomerInfo: true,
    }).catch(() => {
      hasRefreshedAccessRef.current = false;
    });
  }, [refreshState]);

  useEffect(() => {
    if (viewState.shouldAutoContinue) {
      continueToAccount();
    }
  }, [continueToAccount, viewState.shouldAutoContinue]);

  const handleOpenPaywall = useCallback(async () => {
    setHasAttemptedPaywall(true);

    const unlocked = await presentPremiumPaywall({
      ifNeeded: false,
      offering: paywallOffering,
      checkExistingSubscription: true,
      restoreExistingSubscription: true,
    });

    if (unlocked) {
      await continueToAccount();
    }
  }, [continueToAccount, paywallOffering, presentPremiumPaywall]);

  useEffect(() => {
    if (viewState.status !== "ready_to_purchase" || hasAttemptedPaywall) {
      return;
    }

    handleOpenPaywall();
  }, [handleOpenPaywall, hasAttemptedPaywall, viewState.status]);

  const handleRetry = useCallback(() => {
    setHasAttemptedPaywall(false);
    refreshState({
      invalidateCustomerInfo: true,
      silent: false,
      syncPurchases: true,
    }).catch(() => null);
  }, [refreshState]);

  const showError =
    !viewState.showActivity &&
    !viewState.shouldAutoContinue &&
    Boolean(configurationError || actionError);

  return (
    <BackdropScreen scrollable={false}>
      <View style={styles.screen}>
        {showError ? (
          <View style={styles.errorState}>
            <Text style={styles.errorTitle}>
              {SUBSCRIPTION_STATUS_ERROR_MESSAGE}
            </Text>
            <AppButton
              label={isRefreshing ? "Trying again..." : "Try again"}
              variant="primary"
              size="md"
              onPress={handleRetry}
              disabled={viewState.isBusy}
              style={styles.retryButton}
              textStyle={styles.retryButtonText}
            />
          </View>
        ) : (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" />
          </View>
        )}
      </View>
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: appTheme.screen.sidePadding,
  },
  loadingState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  errorState: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 16,
  },
  errorTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textPrimary,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 52,
    minWidth: 160,
    borderRadius: 18,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
});
