import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  OnboardingCTA,
  OnboardingShell,
  QuestionHero,
  onboardingV6,
} from "./v6Primitives";
import {
  markOnboardingAppleHealthComplete,
  markOnboardingAppleHealthConnectRequested,
  resolvePostAppleHealthOnboardingHref,
} from "@src/lib/onboarding";
import { useAppleHealthConnection } from "@/features/health/useAppleHealthConnection";
import AppleHealthLogoAsset from "@/assets/icons/apple-health-logo.png";
import { typography } from "@/theme";

export default function OnboardingAppleHealthScreen() {
  const params = useLocalSearchParams();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const isRoutingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    isIOS,
    isSyncing,
    isAppleHealthReady,
    hasCheckedAppleHealthAvailability,
    isAppleHealthConnected,
    reconnectAppleHealth,
  } = useAppleHealthConnection({ showAlerts: false });

  const completeAppleHealthStep = useCallback(async () => {
    if (isRoutingRef.current) {
      return;
    }

    isRoutingRef.current = true;
    setIsSubmitting(true);

    try {
      await markOnboardingAppleHealthComplete();
      router.replace(
        resolvePostAppleHealthOnboardingHref({ mode: modeParam })
      );
    } catch (_error) {
      isRoutingRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }, [modeParam]);

  useEffect(() => {
    if (!hasCheckedAppleHealthAvailability) {
      return;
    }

    if (!isIOS || !isAppleHealthReady || isAppleHealthConnected) {
      void completeAppleHealthStep();
    }
  }, [
    completeAppleHealthStep,
    hasCheckedAppleHealthAvailability,
    isAppleHealthConnected,
    isAppleHealthReady,
    isIOS,
  ]);

  const handleConnectAppleHealth = useCallback(async () => {
    if (isSubmitting || isSyncing) {
      return;
    }

    setIsSubmitting(true);

    try {
      await markOnboardingAppleHealthConnectRequested();
      await reconnectAppleHealth();
    } finally {
      await completeAppleHealthStep();
    }
  }, [completeAppleHealthStep, isSubmitting, isSyncing, reconnectAppleHealth]);

  const handleSkip = useCallback(async () => {
    await completeAppleHealthStep();
  }, [completeAppleHealthStep]);

  return (
    <OnboardingShell
      progress={0.98}
      showBack={false}
      contentContainerStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <OnboardingCTA
            label={isSubmitting || isSyncing ? "Connecting..." : "Connect Apple Health"}
            disabled={isSubmitting || isSyncing || !hasCheckedAppleHealthAvailability}
            onPress={() => {
              void handleConnectAppleHealth();
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Not now"
            onPress={() => {
              void handleSkip();
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.heroWrap}>
        <View style={styles.iconWrap}>
          <Image
            source={AppleHealthLogoAsset}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <QuestionHero
          centered
          title="Connect Apple Health"
          subtitle="Suppro can use selected Apple Health data, such as activity and body measurements, to help personalise your supplement insights."
        />
        <Text style={styles.reassuranceText}>
          You choose what to share and can change permissions anytime in the
          Health app.
        </Text>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
  },
  heroWrap: {
    alignItems: "center",
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: onboardingV6.surface,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    marginBottom: 20,
    shadowColor: "#141414",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  logo: {
    width: 62,
    height: 62,
  },
  reassuranceText: {
    marginTop: 16,
    maxWidth: 320,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
    textAlign: "center",
  },
  footer: {
    gap: 14,
  },
  secondaryButton: {
    alignSelf: "center",
    minHeight: 32,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.muted,
  },
});
