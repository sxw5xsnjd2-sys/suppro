import React, { useCallback } from "react";
import { Alert, Image, Linking, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  GhostButton,
  OnboardingCTA,
  OnboardingShell,
  QuestionHero,
  onboardingV6,
} from "./v6Primitives";
import { typography } from "@/theme";

const SUPPRO_BOOK_IMAGE = require("@/assets/images/suppro-book.png");
const SUPPRO_BOOK_URL =
  "https://www.amazon.co.uk/SUPPRO-Supplements-Dr-Govind-Dhillon/dp/B0GYS1F7W5/ref=sr_1_1?crid=2CVZ0K963VTCI&dib=eyJ2IjoiMSJ9.ZvxxQpwbb8K06vWZu1iS7g.swCGkzXYCqC8P25zoUROy6DVVbnwZ_p4EzV_QRm-4uE&dib_tag=se&keywords=suppro&qid=1779905813&sprefix=suppro%2Caps%2C172&sr=8-1";

function getParamValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function buildLockedPaywallHref(originParam) {
  const suffix =
    typeof originParam === "string" && originParam.trim()
      ? `&origin=${encodeURIComponent(originParam.trim())}`
      : "";

  return `/onboarding?mode=first_run&step=paywall&locked=1${suffix}`;
}

async function openBookUrl() {
  try {
    await Linking.openURL(SUPPRO_BOOK_URL);
  } catch (_error) {
    Alert.alert("Link unavailable", "Unable to open that link right now.");
  }
}

export default function OnboardingBookOfferScreen() {
  const params = useLocalSearchParams();
  const originParam = getParamValue(params.origin);

  const handleReturnToPaywall = useCallback(() => {
    router.replace(buildLockedPaywallHref(originParam));
  }, [originParam]);

  return (
    <OnboardingShell
      progress={1}
      showBack={false}
      scrollable={false}
      contentContainerStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <OnboardingCTA label="Buy the book" onPress={openBookUrl} />
          <GhostButton
            label="No thanks, I want the app"
            onPress={handleReturnToPaywall}
          />
        </View>
      }
    >
      <View style={styles.bookStage}>
        <Image
          source={SUPPRO_BOOK_IMAGE}
          resizeMode="contain"
          style={styles.bookImage}
        />
      </View>
      <QuestionHero title="Prefer a physical guide?" centered />
      <Text style={styles.body}>Get the SUPPRO book instead.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: "center",
    paddingHorizontal: onboardingV6.sidePadding,
    paddingBottom: 24,
  },
  bookStage: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 320,
    height: 300,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  bookImage: {
    width: 280,
    height: 280,
    transform: [{ rotate: "-1.5deg" }],
  },
  body: {
    marginTop: 12,
    paddingHorizontal: 18,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
    textAlign: "center",
  },
  footer: {
    gap: 12,
  },
});
