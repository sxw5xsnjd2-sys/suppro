import Constants from "expo-constants";
import { Platform } from "react-native";

const manifestExtra = Constants.manifest?.extra ?? {};
const manifest2Extra = Constants.manifest2?.extra?.expoClient?.extra ?? {};
const expoConfigExtra = Constants.expoConfig?.extra ?? {};
const expoGoConfigExtra = Constants.expoGoConfig?.extra ?? {};

function firstNonEmptyString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }

  return "";
}

function getRevenueCatExtra() {
  return (
    expoConfigExtra?.revenueCat ??
    manifestExtra?.revenueCat ??
    manifest2Extra?.revenueCat ??
    expoGoConfigExtra?.revenueCat ??
    {}
  );
}

const revenueCatExtra = getRevenueCatExtra();

export const REVENUECAT_ENTITLEMENT_ID =
  firstNonEmptyString([
    process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID,
    revenueCatExtra?.entitlementId,
  ]) || "Suppro Premium";

export const REVENUECAT_YEARLY_IDENTIFIER =
  firstNonEmptyString([
    process.env.EXPO_PUBLIC_REVENUECAT_YEARLY_IDENTIFIER,
    revenueCatExtra?.yearlyIdentifier,
  ]) || "yearly";

export const REVENUECAT_LAPSED_OFFERING_ID =
  firstNonEmptyString([
    process.env.EXPO_PUBLIC_REVENUECAT_LAPSED_OFFERING_ID,
    revenueCatExtra?.lapsedOfferingId,
  ]) || "premium_lapsed";

const appleApiKey = firstNonEmptyString([
  process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY,
  revenueCatExtra?.appleApiKey,
]);

const googleApiKey = firstNonEmptyString([
  process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY,
  revenueCatExtra?.googleApiKey,
]);

const webApiKey = firstNonEmptyString([
  process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY,
  revenueCatExtra?.webApiKey,
]);

function getPlatformApiKey() {
  if (Platform.OS === "ios") return appleApiKey;
  if (Platform.OS === "android") return googleApiKey;
  if (Platform.OS === "web") return webApiKey;
  return "";
}

export function getRevenueCatApiKeySelection() {
  const platformApiKey = getPlatformApiKey();

  if (platformApiKey) {
    return {
      apiKey: platformApiKey,
      mode: "platform_store",
      error: "",
    };
  }

  if (Platform.OS === "web") {
    return {
      apiKey: "",
      mode: "unsupported",
      error:
        "RevenueCat web billing is not configured. Add EXPO_PUBLIC_REVENUECAT_WEB_API_KEY if you want subscription flows on web.",
    };
  }

  const platformLabel = Platform.OS === "ios" ? "iOS" : "Android";
  const platformEnvVar =
    Platform.OS === "ios"
      ? "EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY"
      : "EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY";

  return {
    apiKey: "",
    mode: "missing",
    error: `Missing RevenueCat configuration. Set ${platformEnvVar} for ${platformLabel} builds.`,
  };
}
