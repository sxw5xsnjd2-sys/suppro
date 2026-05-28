import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import RevenueCatUI from "react-native-purchases-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
const PAYWALL_UNAVAILABLE_ERROR_MESSAGE =
  "The RevenueCat paywall could not be presented.";
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

function hasActivePremiumEntitlement(customerInfo, entitlementId) {
  if (typeof entitlementId !== "string" || !entitlementId.trim()) {
    return false;
  }

  return Boolean(customerInfo?.entitlements?.active?.[entitlementId]);
}

function buildBookOfferHref(originParam) {
  const suffix =
    typeof originParam === "string" && originParam.trim()
      ? `&origin=${encodeURIComponent(originParam.trim())}`
      : "";

  return `/onboarding?mode=first_run&step=book-offer${suffix}`;
}

export default function OnboardingPaywallScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const originParam = Array.isArray(params.origin)
    ? params.origin[0]
    : params.origin;
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const lockedParam = Array.isArray(params.locked)
    ? params.locked[0]
    : params.locked;
  const returnsToApp = originParam === "app";
  const returnsToLogin = originParam === "login";
  const usesEmbeddedPaywall = modeParam !== "retake" && !returnsToApp;
  const showCloseButton = usesEmbeddedPaywall && lockedParam !== "1";
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
    uiAvailable,
    entitlementId,
  } = useRevenueCat();
  const isCompletingRef = useRef(false);
  const hasRefreshedAccessRef = useRef(false);
  const [hasAttemptedPaywall, setHasAttemptedPaywall] = useState(false);
  const [timedOutStatus, setTimedOutStatus] = useState("");
  const [embeddedPaywallError, setEmbeddedPaywallError] = useState("");

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
    if (usesEmbeddedPaywall) {
      return;
    }

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
  }, [
    continueToAccount,
    paywallOffering,
    presentPremiumPaywall,
    usesEmbeddedPaywall,
  ]);

  useEffect(() => {
    if (usesEmbeddedPaywall) {
      return;
    }

    if (viewState.status !== "ready_to_purchase" || hasAttemptedPaywall) {
      return;
    }

    handleOpenPaywall();
  }, [
    handleOpenPaywall,
    hasAttemptedPaywall,
    usesEmbeddedPaywall,
    viewState.status,
  ]);

  const handleEmbeddedEntitlementUpdate = useCallback(
    async (customerInfo) => {
      setEmbeddedPaywallError("");

      const nextState = await refreshState({
        silent: true,
        invalidateCustomerInfo: true,
        syncPurchases: true,
      });
      const nextCustomerInfo = nextState?.customerInfo ?? customerInfo;

      if (hasActivePremiumEntitlement(nextCustomerInfo, entitlementId)) {
        await continueToAccount();
      }
    },
    [continueToAccount, entitlementId, refreshState],
  );

  const handleEmbeddedPaywallError = useCallback(({ error } = {}) => {
    setEmbeddedPaywallError(
      error?.message || "The paywall could not complete that action.",
    );
  }, []);

  const handleCloseEmbeddedPaywall = useCallback(() => {
    router.replace(buildBookOfferHref(originParam));
  }, [originParam]);

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
    embeddedPaywallError ||
    (usesEmbeddedPaywall && !uiAvailable ? PAYWALL_UNAVAILABLE_ERROR_MESSAGE : "") ||
    actionError ||
    configurationError ||
    statusErrorMessage ||
    SUBSCRIPTION_STATUS_ERROR_MESSAGE;

  const showError =
    spinnerTimedOut ||
    (
      !viewState.showActivity &&
      !viewState.shouldAutoContinue &&
      Boolean(
        configurationError ||
          actionError ||
          statusErrorMessage ||
          embeddedPaywallError ||
          (usesEmbeddedPaywall && !uiAvailable)
      )
    );

  if (
    usesEmbeddedPaywall &&
    !showError &&
    viewState.status === "ready_to_purchase"
  ) {
    return (
      <View style={styles.embeddedPaywallScreen}>
        <RevenueCatUI.Paywall
          options={{
            offering: paywallOffering,
            displayCloseButton: false,
          }}
          onPurchaseCompleted={({ customerInfo }) => {
            handleEmbeddedEntitlementUpdate(customerInfo).catch((error) => {
              setEmbeddedPaywallError(
                error?.message || "Could not confirm premium access.",
              );
            });
          }}
          onRestoreCompleted={({ customerInfo }) => {
            handleEmbeddedEntitlementUpdate(customerInfo).catch((error) => {
              setEmbeddedPaywallError(
                error?.message || "Could not confirm premium access.",
              );
            });
          }}
          onPurchaseError={handleEmbeddedPaywallError}
          onRestoreError={handleEmbeddedPaywallError}
        />
        {showCloseButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close paywall"
            hitSlop={12}
            onPress={handleCloseEmbeddedPaywall}
            style={({ pressed }) => [
              styles.closeButton,
              { top: Math.max(insets.top + 12, 58) },
              pressed && styles.closeButtonPressed,
            ]}
          >
            <Ionicons
              name="close"
              size={22}
              color={appTheme.colors.textStrong}
            />
          </Pressable>
        ) : null}
      </View>
    );
  }

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
  embeddedPaywallScreen: {
    flex: 1,
    backgroundColor: appTheme.colors.surface,
  },
  closeButton: {
    position: "absolute",
    top: 58,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#17151B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  closeButtonPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.96 }],
  },
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
