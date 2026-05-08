import {
  IS_DEVELOPMENT_BUILD,
  logDevelopmentDiagnostic,
} from "@src/lib/runtimeConfig";

function resolveModuleExport(moduleValue) {
  return moduleValue?.default ?? moduleValue ?? null;
}

let cachedSdk = null;
const REVENUECAT_CANCELLATION_LOG_PATTERNS = [
  /\bpurchase was cancell?ed\b/i,
  /\bpurchase cancell?ed\b/i,
  /\buser cancell?ed\b/i,
  /\bcancelled purchase\b/i,
];

function buildUnavailableSdk(error) {
  return {
    available: false,
    purchasesAvailable: false,
    uiAvailable: false,
    Purchases: null,
    RevenueCatUI: null,
    PAYWALL_RESULT: {},
    error:
      error instanceof Error
        ? error
        : new Error("RevenueCat is unavailable in this build."),
  };
}

export function getRevenueCatSdk() {
  if (cachedSdk) {
    return cachedSdk;
  }

  try {
    const purchasesModule = require("react-native-purchases");
    const uiModule = require("react-native-purchases-ui");
    const Purchases = resolveModuleExport(purchasesModule);
    const RevenueCatUI = resolveModuleExport(uiModule);
    const PAYWALL_RESULT =
      uiModule?.PAYWALL_RESULT ?? RevenueCatUI?.PAYWALL_RESULT ?? {};

    const purchasesAvailable = Boolean(
      Purchases &&
        typeof Purchases.configure === "function" &&
        typeof Purchases.getCustomerInfo === "function"
    );
    const uiAvailable = Boolean(
      RevenueCatUI &&
        typeof RevenueCatUI.presentPaywallIfNeeded === "function" &&
        typeof RevenueCatUI.presentPaywall === "function"
    );

    if (!purchasesAvailable) {
      cachedSdk = buildUnavailableSdk(
        new Error("RevenueCat purchases support is unavailable in this build.")
      );
      return cachedSdk;
    }

    cachedSdk = {
      available: purchasesAvailable,
      purchasesAvailable,
      uiAvailable,
      Purchases,
      RevenueCatUI,
      PAYWALL_RESULT,
      error: null,
    };
    return cachedSdk;
  } catch (error) {
    cachedSdk = buildUnavailableSdk(error);
    return cachedSdk;
  }
}

export function getRevenueCatUnavailableMessage(error) {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return "RevenueCat is unavailable in this build.";
}

export function isExpectedRevenueCatCancellationLog({
  logLevel = "",
  message = "",
} = {}) {
  if (typeof message !== "string") {
    return false;
  }

  const normalizedMessage = message.trim();
  if (!normalizedMessage) {
    return false;
  }

  const normalizedLevel =
    typeof logLevel === "string" ? logLevel.trim().toUpperCase() : "";

  if (normalizedLevel && normalizedLevel !== "ERROR") {
    return false;
  }

  return REVENUECAT_CANCELLATION_LOG_PATTERNS.some((pattern) =>
    pattern.test(normalizedMessage)
  );
}

function forwardRevenueCatLog(logLevel, message) {
  const normalizedLevel =
    typeof logLevel === "string" ? logLevel.trim().toUpperCase() : "";

  if (
    !IS_DEVELOPMENT_BUILD &&
    (normalizedLevel === "DEBUG" || normalizedLevel === "INFO")
  ) {
    return;
  }

  const formattedMessage = `[RevenueCat] ${message}`;

  switch (normalizedLevel) {
    case "DEBUG":
      logDevelopmentDiagnostic("debug", formattedMessage);
      break;
    case "INFO":
      logDevelopmentDiagnostic("info", formattedMessage);
      break;
    case "WARN":
      console.warn(formattedMessage);
      break;
    case "ERROR":
      console.error(formattedMessage);
      break;
    default:
      console.log(formattedMessage);
      break;
  }
}

export function installRevenueCatLogHandler(Purchases) {
  if (!Purchases || typeof Purchases.setLogHandler !== "function") {
    return false;
  }

  Purchases.setLogHandler((logLevel, message) => {
    if (isExpectedRevenueCatCancellationLog({ logLevel, message })) {
      return;
    }

    forwardRevenueCatLog(logLevel, message);
  });

  return true;
}
