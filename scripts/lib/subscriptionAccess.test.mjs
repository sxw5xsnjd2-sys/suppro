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
    .replace(/export function /g, "function ")
    .replace(/export const /g, "const ");

  const factory = new Function(
    `${transformed}
return {
  isExpectedRevenueCatCancellationLog,
};`
  );

  return factory();
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
