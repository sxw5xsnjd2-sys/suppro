import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import { AppButton, AppHeader } from "@/components/common/ui";
import { useRevenueCat } from "@/features/subscriptions/RevenueCatProvider";
import { appTheme, spacing, typography } from "@/theme";
import { markOnboardingPremiumComplete } from "@src/lib/onboarding";

export default function OnboardingPaywallScreen() {
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
  } = useRevenueCat();

  const [localMessage, setLocalMessage] = useState("");
  const isCompletingRef = useRef(false);

  const isBusy = isLoading || isRefreshing || isRestoring || isPresentingPaywall;
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
      router.replace("/onboarding?mode=first_run&step=account");
    } finally {
      isCompletingRef.current = false;
    }
  }, []);

  const openPaywall = useCallback(async () => {
    if (!canUseRevenueCat || isBusy) return;

    setLocalMessage("");
    const unlocked = await presentPremiumPaywall({ ifNeeded: true });

    if (unlocked) {
      await continueToAccount();
      return;
    }

    setLocalMessage(
      "Premium is required before account setup. Unlock Premium or restore an active subscription to continue."
    );
  }, [canUseRevenueCat, continueToAccount, isBusy, presentPremiumPaywall]);

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

  useEffect(() => {
    if (!premiumActive) return;

    continueToAccount();
  }, [continueToAccount, premiumActive]);

  const restoreLabel = isRestoring ? "Restoring..." : "Restore purchases";
  const needsFallbackCopy = Boolean(
    configurationError || actionError || actionMessage || localMessage
  );
  const canStartSubscription = canUseRevenueCat && !isBusy && !premiumActive;
  const showStartSubscription = canUseRevenueCat && !premiumActive;
  const canRestore = canUseRevenueCat && !isBusy && needsFallbackCopy;

  return (
    <BackdropScreen
      header={
        <AppHeader
          insetPreset="screen"
          title="SUPPRO PREMIUM"
          titleStyle={styles.headerTitle}
        />
      }
      scrollable={false}
    >
      <View style={styles.centerContent}>
        {!needsFallbackCopy && isBusy ? (
          <ActivityIndicator color={appTheme.colors.textStrong} />
        ) : null}

        <Text style={styles.statusText}>{statusMessage}</Text>

        {actionMessage && !localMessage ? (
          <Text style={styles.successText}>{actionMessage}</Text>
        ) : null}

        {localMessage ? <Text style={styles.noteText}>{localMessage}</Text> : null}

        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

        {showStartSubscription ? (
          <AppButton
            label="start your subscription"
            onPress={openPaywall}
            disabled={!canStartSubscription}
            variant="primary"
            style={styles.actionButton}
          />
        ) : null}

        {canRestore ? (
          <AppButton
            label={restoreLabel}
            onPress={handleRestorePurchases}
            disabled={!canRestore}
            variant="overlay"
            style={styles.restoreButton}
          />
        ) : null}
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
