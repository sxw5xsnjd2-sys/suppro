import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadSubscriptionAccessModule() {
  const source = readFileSync(
    new URL("../../features/subscriptions/accessPolicy.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/export function /g, "function ")
    .replace(/export const /g, "const ");

  const factory = new Function(
    `${transformed}
return {
  getSubscriptionRouteAccessPolicy,
  resolveRevenueCatAccessState,
  resolveOriginAppPaywallAction,
  resolveOnboardingPaywallViewState,
  resolveRevenueCatIdentityAction,
  resolveBackNavigationAction,
};`
  );

  return factory();
}

function loadRevenueCatSdkModule() {
  const source = readFileSync(
    new URL("../../features/subscriptions/revenueCatSdk.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"@src\/lib\/runtimeConfig";\n/,
      ""
    )
    .replace(/export function /g, "function ")
    .replace(/export const /g, "const ");

  const factory = new Function(
    "IS_DEVELOPMENT_BUILD",
    "logBuildAwareDiagnostic",
    "logDevelopmentDiagnostic",
    `${transformed}
return {
  isExpectedRevenueCatCancellationLog,
  safelyConfigureRevenueCatLogging,
};`
  );

  return factory(false, () => {}, () => {});
}

function loadRevenueCatProviderHelpers({
  entitlementId = "Suppro Premium",
  lapsedOfferingId = "premium_lapsed",
  yearlyIdentifier = "yearly",
  sdk = { Purchases: { PURCHASES_ERROR_CODE: {} } },
} = {}) {
  const source = readFileSync(
    new URL("../../features/subscriptions/RevenueCatProvider.jsx", import.meta.url),
    "utf8"
  );

  const start = source.indexOf("const SUBSCRIPTION_STATUS_CHECK_ERROR_MESSAGE");
  const end = source.indexOf("export function RevenueCatProvider");
  const helperSource = source.slice(start, end);

  const factory = new Function(
    "REVENUECAT_ENTITLEMENT_ID",
    "REVENUECAT_LAPSED_OFFERING_ID",
    "REVENUECAT_YEARLY_IDENTIFIER",
    "getRevenueCatSdk",
    `${helperSource}
return {
  SUBSCRIPTION_STATUS_CHECK_ERROR_MESSAGE,
  getPremiumEntitlement,
  isPremiumActive,
  findYearlyPackage,
  getPreferredOffering,
  getOfferingByIdentifier,
  resolvePaywallOffering,
  isPurchaseCancelled,
  isAlreadySubscribedError,
  resolveRecoveredPurchaseResult,
  resolveRestorePurchasesResult,
  resolveExistingSubscriptionCheckResult,
};`
  );

  return factory(entitlementId, lapsedOfferingId, yearlyIdentifier, () => sdk);
}

test("active entitlement allows premium access", () => {
  const { resolveRevenueCatAccessState } = loadSubscriptionAccessModule();

  const state = resolveRevenueCatAccessState({
    isReady: true,
    isLoading: false,
    premiumActive: true,
  });

  assert.equal(state.status, "active");
  assert.equal(state.hasActiveAccess, true);
  assert.equal(state.needsPaywall, false);
  assert.equal(state.shouldBlockPremiumAction, false);
});

test("missing entitlement blocks premium access", () => {
  const { resolveRevenueCatAccessState } = loadSubscriptionAccessModule();

  const state = resolveRevenueCatAccessState({
    isReady: true,
    isLoading: false,
    premiumActive: false,
  });

  assert.equal(state.status, "inactive");
  assert.equal(state.reason, "missing_or_inactive_entitlement");
  assert.equal(state.hasActiveAccess, false);
  assert.equal(state.needsPaywall, true);
  assert.equal(state.shouldBlockPremiumAction, true);
});

test("expired or non-active entitlement blocks premium access", () => {
  const { resolveRevenueCatAccessState } = loadSubscriptionAccessModule();

  const state = resolveRevenueCatAccessState({
    isReady: true,
    isLoading: false,
    premiumActive: false,
    configurationError: "",
  });

  assert.equal(state.isResolved, true);
  assert.equal(state.hasActiveAccess, false);
  assert.equal(state.shouldBlockPremiumAction, true);
});

test("customerInfo entitlement derivation returns the premium entitlement and active state", () => {
  const { getPremiumEntitlement, isPremiumActive } = loadRevenueCatProviderHelpers();
  const premiumEntitlement = { expiresDate: null, productIdentifier: "yearly" };
  const customerInfo = {
    entitlements: {
      all: {
        "Suppro Premium": premiumEntitlement,
      },
      active: {
        "Suppro Premium": premiumEntitlement,
      },
    },
  };

  assert.equal(getPremiumEntitlement(customerInfo), premiumEntitlement);
  assert.equal(isPremiumActive(customerInfo), true);
});

test("customerInfo without an active premium entitlement fails closed", () => {
  const { getPremiumEntitlement, isPremiumActive } = loadRevenueCatProviderHelpers();
  const expiredEntitlement = {
    expiresDate: "2026-05-01T00:00:00Z",
    productIdentifier: "yearly",
  };
  const customerInfo = {
    entitlements: {
      all: {
        "Suppro Premium": expiredEntitlement,
      },
      active: {},
    },
  };

  assert.equal(getPremiumEntitlement(customerInfo), expiredEntitlement);
  assert.equal(isPremiumActive(customerInfo), false);
});

test("unknown RevenueCat state fails closed for premium actions", () => {
  const { resolveRevenueCatAccessState } = loadSubscriptionAccessModule();

  const state = resolveRevenueCatAccessState({
    isReady: false,
    isLoading: true,
    premiumActive: false,
  });

  assert.equal(state.status, "checking");
  assert.equal(state.isResolved, false);
  assert.equal(state.hasActiveAccess, false);
  assert.equal(state.needsPaywall, true);
  assert.equal(state.shouldBlockPremiumAction, true);
});

test("identity sync keeps RevenueCat access unresolved until customer state is refreshed", () => {
  const { resolveRevenueCatAccessState } = loadSubscriptionAccessModule();

  const state = resolveRevenueCatAccessState({
    isReady: true,
    isLoading: false,
    isIdentitySyncing: true,
    premiumActive: false,
  });

  assert.equal(state.status, "checking");
  assert.equal(state.reason, "syncing_revenuecat_identity");
  assert.equal(state.isResolved, false);
  assert.equal(state.shouldBlockPremiumAction, true);
});

test("account-management routes remain allowed without entitlement", () => {
  const { getSubscriptionRouteAccessPolicy } = loadSubscriptionAccessModule();

  const settingsRoute = getSubscriptionRouteAccessPolicy(["settings"]);
  const accountRoute = getSubscriptionRouteAccessPolicy([
    "(modals)",
    "modal",
    "account",
  ]);
  const profileRoute = getSubscriptionRouteAccessPolicy(["(tabs)", "profile"]);

  assert.equal(settingsRoute.requiresActiveEntitlement, false);
  assert.equal(accountRoute.requiresActiveEntitlement, false);
  assert.equal(profileRoute.requiresActiveEntitlement, false);
  assert.equal(settingsRoute.allowsWithoutEntitlement, true);
  assert.equal(accountRoute.allowsWithoutEntitlement, true);
  assert.equal(profileRoute.allowsWithoutEntitlement, true);
});

test("no-entitlement user may still enter the main app shell", () => {
  const { getSubscriptionRouteAccessPolicy } = loadSubscriptionAccessModule();

  assert.equal(
    getSubscriptionRouteAccessPolicy(["(tabs)", "index"])
      .requiresActiveEntitlement,
    false
  );
  assert.equal(
    getSubscriptionRouteAccessPolicy(["(tabs)", "supplements"])
      .requiresActiveEntitlement,
    false
  );
});

test("premium route and action identifiers are still tracked centrally", () => {
  const { getSubscriptionRouteAccessPolicy } = loadSubscriptionAccessModule();

  assert.equal(
    getSubscriptionRouteAccessPolicy(["scanner"]).requiresActiveEntitlement,
    true
  );
  assert.equal(
    getSubscriptionRouteAccessPolicy(["supplement-search"])
      .requiresActiveEntitlement,
    true
  );
  assert.equal(
    getSubscriptionRouteAccessPolicy(["benefit-ranking"])
      .requiresActiveEntitlement,
    true
  );
  assert.equal(
    getSubscriptionRouteAccessPolicy(["(tabs)", "health"])
      .requiresActiveEntitlement,
    true
  );
  assert.equal(
    getSubscriptionRouteAccessPolicy(["(modals)", "modal", "ai-chat"])
      .requiresActiveEntitlement,
    true
  );
  assert.equal(
    getSubscriptionRouteAccessPolicy([
      "(modals)",
      "modal",
      "supplement-info",
    ]).requiresActiveEntitlement,
    true
  );
});

test("origin=app paywall continues to app for active entitlement", () => {
  const { resolveOriginAppPaywallAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveOriginAppPaywallAction({
      origin: "app",
      hasActiveAccess: true,
      isReady: true,
      isLoading: false,
      hasCurrentOffering: false,
    }),
    "continue_to_app"
  );
});

test("origin=app paywall waits while RevenueCat is still resolving", () => {
  const { resolveOriginAppPaywallAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveOriginAppPaywallAction({
      origin: "app",
      hasActiveAccess: false,
      isReady: false,
      isLoading: true,
      hasCurrentOffering: false,
    }),
    "wait"
  );
});

test("origin=app paywall routes to settings when RevenueCat is unavailable", () => {
  const { resolveOriginAppPaywallAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveOriginAppPaywallAction({
      origin: "app",
      hasActiveAccess: false,
      isReady: false,
      isLoading: false,
      configurationError: "RevenueCat is unavailable in this build.",
      hasCurrentOffering: false,
    }),
    "route_settings"
  );
});

test("origin=app paywall routes to settings when no offering is available", () => {
  const { resolveOriginAppPaywallAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveOriginAppPaywallAction({
      origin: "app",
      hasActiveAccess: false,
      isReady: true,
      isLoading: false,
      configurationError: "",
      hasCurrentOffering: false,
    }),
    "route_settings"
  );
});

test("origin=app paywall presents paywall when offering is available", () => {
  const { resolveOriginAppPaywallAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveOriginAppPaywallAction({
      origin: "app",
      hasActiveAccess: false,
      isReady: true,
      isLoading: false,
      configurationError: "",
      hasCurrentOffering: true,
    }),
    "present_paywall"
  );
});

test("active entitlement skips the onboarding paywall purchase CTA", () => {
  const { resolveOnboardingPaywallViewState } = loadSubscriptionAccessModule();

  const viewState = resolveOnboardingPaywallViewState({
    hasActiveAccess: true,
    isReady: true,
    isLoading: false,
    hasCurrentOffering: true,
    hasPaywallPackages: true,
  });

  assert.equal(viewState.status, "active");
  assert.equal(viewState.shouldAutoContinue, true);
  assert.equal(viewState.showPurchaseButton, false);
  assert.equal(viewState.showActivity, false);
});

test("inactive entitlement shows the onboarding paywall once access is resolved", () => {
  const { resolveOnboardingPaywallViewState } = loadSubscriptionAccessModule();

  const viewState = resolveOnboardingPaywallViewState({
    hasActiveAccess: false,
    isReady: true,
    isLoading: false,
    hasCurrentOffering: true,
    hasPaywallPackages: true,
  });

  assert.equal(viewState.status, "ready_to_purchase");
  assert.equal(viewState.showPurchaseButton, true);
  assert.equal(viewState.showRestoreButton, true);
  assert.equal(viewState.showActivity, false);
});

test("missing paywall offering resolves to a retry state instead of loading forever", () => {
  const { resolveOnboardingPaywallViewState } = loadSubscriptionAccessModule();

  const viewState = resolveOnboardingPaywallViewState({
    hasActiveAccess: false,
    isReady: true,
    isLoading: false,
    hasCurrentOffering: false,
    hasPaywallPackages: false,
  });

  assert.equal(viewState.status, "missing_offering");
  assert.equal(viewState.showActivity, false);
  assert.equal(viewState.showRetryButton, true);
});

test("missing paywall package resolves to a retry state instead of loading forever", () => {
  const { resolveOnboardingPaywallViewState } = loadSubscriptionAccessModule();

  const viewState = resolveOnboardingPaywallViewState({
    hasActiveAccess: false,
    isReady: true,
    isLoading: false,
    hasCurrentOffering: true,
    hasPaywallPackages: false,
  });

  assert.equal(viewState.status, "missing_package");
  assert.equal(viewState.showActivity, false);
  assert.equal(viewState.showRetryButton, true);
});

test("existing active entitlement skips RevenueCat paywall before onboarding presentation", () => {
  const { resolveExistingSubscriptionCheckResult } =
    loadRevenueCatProviderHelpers();

  const result = resolveExistingSubscriptionCheckResult({
    preparedCustomerInfo: {
      entitlements: {
        active: {
          "Suppro Premium": { productIdentifier: "yearly" },
        },
      },
    },
  });

  assert.equal(result.logKey, "existing_subscription_found_skip_paywall");
  assert.equal(result.hasPremiumAccess, true);
  assert.equal(result.shouldPresentPaywall, false);
});

test("restorePurchases returning active entitlement skips RevenueCat paywall", () => {
  const { resolveExistingSubscriptionCheckResult } =
    loadRevenueCatProviderHelpers();

  const result = resolveExistingSubscriptionCheckResult({
    preparedCustomerInfo: { entitlements: { active: {} } },
    restoredCustomerInfo: {
      entitlements: {
        active: {
          "Suppro Premium": { productIdentifier: "yearly" },
        },
      },
    },
  });

  assert.equal(result.logKey, "existing_subscription_found_skip_paywall");
  assert.equal(result.hasPremiumAccess, true);
  assert.equal(result.shouldPresentPaywall, false);
});

test("inactive entitlement presents RevenueCat paywall after restore-aware check", () => {
  const { resolveExistingSubscriptionCheckResult } =
    loadRevenueCatProviderHelpers();

  const result = resolveExistingSubscriptionCheckResult({
    preparedCustomerInfo: { entitlements: { active: {} } },
    restoredCustomerInfo: { entitlements: { active: {} } },
  });

  assert.equal(result.logKey, "no_existing_subscription_present_paywall");
  assert.equal(result.hasPremiumAccess, false);
  assert.equal(result.shouldPresentPaywall, true);
});

test("RevenueCat failure shows non-paywall retry error only", () => {
  const {
    SUBSCRIPTION_STATUS_CHECK_ERROR_MESSAGE,
    resolveExistingSubscriptionCheckResult,
  } = loadRevenueCatProviderHelpers();

  const result = resolveExistingSubscriptionCheckResult({
    error: new Error("RevenueCat failed to initialize."),
  });

  assert.equal(result.logKey, "subscription_check_failed");
  assert.equal(result.hasPremiumAccess, false);
  assert.equal(result.shouldPresentPaywall, false);
  assert.equal(
    result.errorMessage,
    SUBSCRIPTION_STATUS_CHECK_ERROR_MESSAGE,
  );
});

test("no fallback or custom paywall UI remains in onboarding screen", () => {
  const source = readFileSync(
    new URL("../../src/features/onboarding/OnboardingPaywallScreen.jsx", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes("PrimaryCard"), false);
  assert.equal(source.includes("Unable to load premium options"), false);
  assert.equal(source.includes("Restore purchases"), false);
  assert.equal(source.includes("Check access before starting a new subscription"), false);
  assert.equal(
    source.includes("Unable to check subscription status. Please try again."),
    true,
  );
});

test("preferred offering chooses one with a yearly package over a current fallback", () => {
  const { findYearlyPackage, getPreferredOffering } =
    loadRevenueCatProviderHelpers();
  const currentOffering = {
    identifier: "default",
    availablePackages: [{ identifier: "monthly" }],
  };
  const premiumOffering = {
    identifier: "premium",
    availablePackages: [{ identifier: "yearly" }],
  };
  const offerings = {
    current: currentOffering,
    all: {
      default: currentOffering,
      premium: premiumOffering,
    },
  };

  assert.equal(getPreferredOffering(offerings), premiumOffering);
  assert.equal(findYearlyPackage(premiumOffering), premiumOffering.availablePackages[0]);
});

test("yearly package falls back to annual package when no exact yearly identifier exists", () => {
  const { findYearlyPackage, getPreferredOffering } =
    loadRevenueCatProviderHelpers();
  const annualPackage = { identifier: "annual_fallback" };
  const offering = {
    identifier: "fallback",
    availablePackages: [{ identifier: "monthly" }],
    annual: annualPackage,
  };
  const offerings = {
    current: offering,
    all: {
      fallback: offering,
    },
  };

  assert.equal(findYearlyPackage(offering), annualPackage);
  assert.equal(getPreferredOffering(offerings), offering);
});

test("first-run paywall keeps using the default/current offering", () => {
  const { getPreferredOffering, resolvePaywallOffering } =
    loadRevenueCatProviderHelpers();
  const currentOffering = {
    identifier: "default",
    availablePackages: [{ identifier: "yearly" }],
  };
  const lapsedOffering = {
    identifier: "premium_lapsed",
    availablePackages: [{ identifier: "monthly" }],
  };
  const offerings = {
    current: currentOffering,
    all: {
      default: currentOffering,
      premium_lapsed: lapsedOffering,
    },
  };

  const defaultOffering = getPreferredOffering(offerings);

  assert.equal(defaultOffering, currentOffering);
  assert.equal(
    resolvePaywallOffering({
      offerings,
      preferredOfferingIdentifier: "",
      fallbackOffering: defaultOffering,
    }),
    currentOffering
  );
});

test("app-origin paywall uses the premium_lapsed offering when available", () => {
  const { getPreferredOffering, resolvePaywallOffering } =
    loadRevenueCatProviderHelpers();
  const currentOffering = {
    identifier: "default",
    availablePackages: [{ identifier: "yearly" }],
  };
  const lapsedOffering = {
    identifier: "premium_lapsed",
    availablePackages: [{ identifier: "monthly" }],
  };
  const offerings = {
    current: currentOffering,
    all: {
      default: currentOffering,
      premium_lapsed: lapsedOffering,
    },
  };

  assert.equal(
    resolvePaywallOffering({
      offerings,
      preferredOfferingIdentifier: "premium_lapsed",
      fallbackOffering: getPreferredOffering(offerings),
    }),
    lapsedOffering
  );
});

test("app-origin paywall falls back to the default offering when premium_lapsed is unavailable", () => {
  const { getPreferredOffering, resolvePaywallOffering } =
    loadRevenueCatProviderHelpers();
  const currentOffering = {
    identifier: "default",
    availablePackages: [{ identifier: "yearly" }],
  };
  const offerings = {
    current: currentOffering,
    all: {
      default: currentOffering,
    },
  };

  assert.equal(
    resolvePaywallOffering({
      offerings,
      preferredOfferingIdentifier: "premium_lapsed",
      fallbackOffering: getPreferredOffering(offerings),
    }),
    currentOffering
  );
});

test("RevenueCat identity logs in when a real Supabase user appears", () => {
  const { resolveRevenueCatIdentityAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveRevenueCatIdentityAction({
      hasConfigured: true,
      sessionAppUserId: "user-123",
      currentIdentifiedAppUserId: "",
    }),
    "log_in"
  );
});

test("RevenueCat identity refreshes when already matched to the real user", () => {
  const { resolveRevenueCatIdentityAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveRevenueCatIdentityAction({
      hasConfigured: true,
      sessionAppUserId: "user-123",
      currentIdentifiedAppUserId: "user-123",
    }),
    "refresh_identified"
  );
});

test("RevenueCat identity logs out when the real Supabase session disappears", () => {
  const { resolveRevenueCatIdentityAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveRevenueCatIdentityAction({
      hasConfigured: true,
      sessionAppUserId: "",
      currentIdentifiedAppUserId: "user-123",
    }),
    "log_out"
  );
});

test("RevenueCat identity stays anonymous when there is no real session", () => {
  const { resolveRevenueCatIdentityAction } = loadSubscriptionAccessModule();

  assert.equal(
    resolveRevenueCatIdentityAction({
      hasConfigured: true,
      sessionAppUserId: "",
      currentIdentifiedAppUserId: "",
    }),
    "refresh_anonymous"
  );
});

test("restore result marks premium access active when the entitlement is restored", () => {
  const { resolveRestorePurchasesResult } = loadRevenueCatProviderHelpers();
  const customerInfo = {
    entitlements: {
      active: {
        "Suppro Premium": { productIdentifier: "yearly" },
      },
    },
  };

  assert.deepEqual(resolveRestorePurchasesResult(customerInfo), {
    didRestore: true,
    hasPremiumAccess: true,
    message: "Purchases restored and Suppro Premium is active.",
    error: "",
  });
});

test("restore result stays successful but reports no active entitlement when none is restored", () => {
  const { resolveRestorePurchasesResult } = loadRevenueCatProviderHelpers();

  assert.deepEqual(resolveRestorePurchasesResult({ entitlements: { active: {} } }), {
    didRestore: true,
    hasPremiumAccess: false,
    message: "Restore completed, but no active Suppro Premium entitlement was found.",
    error: "",
  });
});

test("already subscribed purchase errors are treated as a restore path", () => {
  const { isAlreadySubscribedError, resolveRecoveredPurchaseResult } =
    loadRevenueCatProviderHelpers();
  const customerInfo = {
    entitlements: {
      active: {
        "Suppro Premium": { productIdentifier: "yearly" },
      },
    },
  };

  assert.equal(
    isAlreadySubscribedError({
      message:
        "You're currently subscribed to this subscription and it renews on May 15, 2026.",
    }),
    true,
  );
  assert.deepEqual(resolveRecoveredPurchaseResult(customerInfo), {
    didRecover: true,
    hasPremiumAccess: true,
    message: "Subscription already active — premium restored.",
    error: "",
  });
});

test("onboarding paywall spinner clears after cancellation and failure states", () => {
  const { resolveOnboardingPaywallViewState } = loadSubscriptionAccessModule();

  const cancelledView = resolveOnboardingPaywallViewState({
    hasActiveAccess: false,
    isReady: true,
    isLoading: false,
    isPresentingPaywall: false,
    isRestoring: false,
    hasCurrentOffering: true,
    hasPaywallPackages: true,
  });
  const failedView = resolveOnboardingPaywallViewState({
    hasActiveAccess: false,
    isReady: true,
    isLoading: false,
    configurationError: "RevenueCat failed to initialize.",
    hasCurrentOffering: true,
    hasPaywallPackages: true,
  });

  assert.equal(cancelledView.showActivity, false);
  assert.equal(cancelledView.showPurchaseButton, true);
  assert.equal(failedView.showActivity, false);
  assert.equal(failedView.showRetryButton, true);
});

test("cancelled purchase detection matches RevenueCat cancellation signals", () => {
  const { isPurchaseCancelled } = loadRevenueCatProviderHelpers({
    sdk: {
      Purchases: {
        PURCHASES_ERROR_CODE: {
          PURCHASE_CANCELLED_ERROR: "cancelled",
        },
      },
    },
  });

  assert.equal(isPurchaseCancelled({ code: "cancelled" }), true);
  assert.equal(isPurchaseCancelled({ userCancelled: true }), true);
  assert.equal(isPurchaseCancelled({ code: "network_error" }), false);
});

test("unsafe back navigation falls back to a safe route", () => {
  const { resolveBackNavigationAction } = loadSubscriptionAccessModule();

  assert.deepEqual(
    resolveBackNavigationAction({
      canGoBack: false,
      fallbackHref: "/settings",
    }),
    { type: "replace", href: "/settings" }
  );
});

test("back navigation is used only when navigator history exists", () => {
  const { resolveBackNavigationAction } = loadSubscriptionAccessModule();

  assert.deepEqual(
    resolveBackNavigationAction({
      canGoBack: true,
      fallbackHref: "/settings",
    }),
    { type: "back" }
  );
});

test("RevenueCat purchase cancellation error logs are suppressed", () => {
  const { isExpectedRevenueCatCancellationLog } = loadRevenueCatSdkModule();

  assert.equal(
    isExpectedRevenueCatCancellationLog({
      logLevel: "ERROR",
      message: "Purchase was cancelled.",
    }),
    true
  );
  assert.equal(
    isExpectedRevenueCatCancellationLog({
      logLevel: "ERROR",
      message: "User canceled purchase flow",
    }),
    true
  );
});

test("real RevenueCat failures are not misclassified as cancellations", () => {
  const { isExpectedRevenueCatCancellationLog } = loadRevenueCatSdkModule();

  assert.equal(
    isExpectedRevenueCatCancellationLog({
      logLevel: "ERROR",
      message: "Network request failed while fetching offerings.",
    }),
    false
  );
  assert.equal(
    isExpectedRevenueCatCancellationLog({
      logLevel: "WARN",
      message: "Purchase was cancelled.",
    }),
    false
  );
});

test("RevenueCat logging setup survives log handler crashes", async () => {
  const { safelyConfigureRevenueCatLogging } = loadRevenueCatSdkModule();
  let requestedLevel = null;
  const Purchases = {
    LOG_LEVEL: {
      DEBUG: "DEBUG",
      WARN: "WARN",
    },
    setLogHandler() {
      throw new TypeError(
        "NativeJSLogger.default.addListener is not a function"
      );
    },
    setLogLevel(level) {
      requestedLevel = level;
    },
  };

  const result = await safelyConfigureRevenueCatLogging(Purchases, {
    debugLogsEnabled: false,
  });

  assert.equal(requestedLevel, "WARN");
  assert.deepEqual(result, {
    installedLogHandler: false,
    configuredLogLevel: true,
  });
});

test("RevenueCat logging setup survives log level crashes", async () => {
  const { safelyConfigureRevenueCatLogging } = loadRevenueCatSdkModule();
  let installed = false;
  const Purchases = {
    LOG_LEVEL: {
      DEBUG: "DEBUG",
      WARN: "WARN",
    },
    setLogHandler() {
      installed = true;
    },
    setLogLevel() {
      throw new TypeError(
        "NativeJSLogger.default.addListener is not a function"
      );
    },
  };

  const result = await safelyConfigureRevenueCatLogging(Purchases, {
    debugLogsEnabled: false,
  });

  assert.equal(installed, true);
  assert.deepEqual(result, {
    installedLogHandler: true,
    configuredLogLevel: false,
  });
});
