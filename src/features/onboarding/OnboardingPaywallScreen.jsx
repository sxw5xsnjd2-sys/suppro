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
const MISSING_OFFERING_ERROR_MESSAGE =
  "No subscription offering is available right now. Please try again.";
const MISSING_PACKAGE_ERROR_MESSAGE =
  "No subscription package is available right now. Please try again.";
const PAYWALL_LOADING_TIMEOUT_MS = 15000;

function getPaywallTimeoutMessage(status) {
  if (status === "presenting_paywall") {
    return "The paywall took too long to open. Please try again.";
  }

  if (status === "restoring") {
    return "Restoring access took too long. Please try again.";
  }

  return "Subscription loading took too long. Please try again.";
}

function getPaywallStateErrorMessage(status) {
  if (status === "missing_offering") {
    return MISSING_OFFERING_ERROR_MESSAGE;
  }

  if (status === "missing_package") {
    return MISSING_PACKAGE_ERROR_MESSAGE;
  }

  return "";
}

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
  const [timedOutStatus, setTimedOutStatus] = useState("");

  const paywallOffering = returnsToApp ? lapsedOffering : currentOffering;
  const hasPaywallPackages = Array.isArray(paywallOffering?.availablePackages)
    ? paywallOffering.availablePackages.length > 0
    : false;
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
        hasPaywallPackages,
      }),
    [
      configurationError,
      hasPaywallPackages,
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
    if (!viewState.showActivity) {
      setTimedOutStatus("");
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setTimedOutStatus(viewState.status);
    }, PAYWALL_LOADING_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [viewState.showActivity, viewState.status]);

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
    setTimedOutStatus("");
    setHasAttemptedPaywall(false);
    refreshState({
      invalidateCustomerInfo: true,
      silent: false,
      syncPurchases: true,
    }).catch(() => null);
  }, [refreshState]);

  const spinnerTimedOut = Boolean(timedOutStatus);
  const statusErrorMessage = getPaywallStateErrorMessage(viewState.status);
  const errorMessage =
    (spinnerTimedOut ? getPaywallTimeoutMessage(timedOutStatus) : "") ||
    actionError ||
    configurationError ||
    statusErrorMessage ||
    SUBSCRIPTION_STATUS_ERROR_MESSAGE;

  const showError =
    spinnerTimedOut ||
    (
      !viewState.showActivity &&
      !viewState.shouldAutoContinue &&
      Boolean(configurationError || actionError || statusErrorMessage)
    );

  return (
    <BackdropScreen scrollable={false}>
      <View style={styles.screen}>
        {showError ? (
          <View style={styles.errorState}>
            <Text style={styles.errorTitle}>{errorMessage}</Text>
            <AppButton
              label={isRefreshing ? "Trying again..." : "Try again"}
              variant="primary"
              size="md"
              onPress={handleRetry}
              disabled={isRefreshing || (!spinnerTimedOut && viewState.isBusy)}
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
