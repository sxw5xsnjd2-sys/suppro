const PREMIUM_TAB_NAMES = new Set(["health", "ai", "stats"]);
const PREMIUM_TOP_LEVEL_ROUTES = new Set([
  "scanner",
  "benefit-ranking",
  "favourites",
  "my-supplements",
  "health",
  "supplement-search",
]);
const PREMIUM_MODAL_ROUTES = new Set([
  "ai-chat",
  "favourites",
  "my-supplements",
  "supplement",
  "supplement-info",
]);
const ACCOUNT_MANAGEMENT_TOP_LEVEL_ROUTES = new Set([
  "account",
  "connections",
  "login",
  "onboarding",
  "settings",
  "verify-email",
]);
const ACCOUNT_MANAGEMENT_MODAL_ROUTES = new Set([
  "account",
  "connections",
  "settings",
]);

function normalizeSegment(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map(normalizeSegment).filter(Boolean);
}

function buildAccessPolicy({
  kind,
  routeKey,
  requiresActiveEntitlement,
  allowsWithoutEntitlement,
}) {
  return {
    kind,
    routeKey,
    requiresActiveEntitlement,
    allowsWithoutEntitlement,
  };
}

export function getSubscriptionRouteAccessPolicy(segments) {
  const normalizedSegments = normalizeSegments(segments);
  const [firstSegment, secondSegment, thirdSegment] = normalizedSegments;

  if (!firstSegment) {
    return buildAccessPolicy({
      kind: "neutral",
      routeKey: "root",
      requiresActiveEntitlement: false,
      allowsWithoutEntitlement: true,
    });
  }

  if (ACCOUNT_MANAGEMENT_TOP_LEVEL_ROUTES.has(firstSegment)) {
    return buildAccessPolicy({
      kind: "account_management",
      routeKey: firstSegment,
      requiresActiveEntitlement: false,
      allowsWithoutEntitlement: true,
    });
  }

  if (firstSegment === "(tabs)") {
    const tabName = secondSegment || "index";

    if (PREMIUM_TAB_NAMES.has(tabName)) {
      return buildAccessPolicy({
        kind: "premium",
        routeKey: `tab:${tabName}`,
        requiresActiveEntitlement: true,
        allowsWithoutEntitlement: false,
      });
    }

    return buildAccessPolicy({
      kind: "account_management",
      routeKey: `tab:${tabName}`,
      requiresActiveEntitlement: false,
      allowsWithoutEntitlement: true,
    });
  }

  if (firstSegment === "(modals)" || firstSegment === "modal") {
    const modalName =
      firstSegment === "(modals)"
        ? thirdSegment || secondSegment
        : secondSegment || thirdSegment;

    if (ACCOUNT_MANAGEMENT_MODAL_ROUTES.has(modalName)) {
      return buildAccessPolicy({
        kind: "account_management",
        routeKey: `modal:${modalName}`,
        requiresActiveEntitlement: false,
        allowsWithoutEntitlement: true,
      });
    }

    if (PREMIUM_MODAL_ROUTES.has(modalName)) {
      return buildAccessPolicy({
        kind: "premium",
        routeKey: `modal:${modalName}`,
        requiresActiveEntitlement: true,
        allowsWithoutEntitlement: false,
      });
    }
  }

  if (PREMIUM_TOP_LEVEL_ROUTES.has(firstSegment)) {
    return buildAccessPolicy({
      kind: "premium",
      routeKey: firstSegment,
      requiresActiveEntitlement: true,
      allowsWithoutEntitlement: false,
    });
  }

  return buildAccessPolicy({
    kind: "neutral",
    routeKey: normalizedSegments.join("/"),
    requiresActiveEntitlement: false,
    allowsWithoutEntitlement: true,
  });
}

export function resolveRevenueCatAccessState({
  isReady = false,
  isLoading = false,
  isIdentitySyncing = false,
  configurationError = "",
  premiumActive = false,
}) {
  const hasConfigurationError =
    typeof configurationError === "string" && configurationError.trim().length > 0;
  const hasActiveAccess = premiumActive === true;
  const isResolved =
    hasActiveAccess ||
    hasConfigurationError ||
    (isReady && !isLoading && !isIdentitySyncing);

  let status = "checking";
  let reason = "pending_revenuecat_state";

  if (hasActiveAccess) {
    status = "active";
    reason = "active_entitlement";
  } else if (hasConfigurationError) {
    status = "inactive";
    reason = "configuration_error";
  } else if (isIdentitySyncing) {
    status = "checking";
    reason = "syncing_revenuecat_identity";
  } else if (isReady && !isLoading) {
    status = "inactive";
    reason = "missing_or_inactive_entitlement";
  }

  return {
    status,
    reason,
    hasActiveAccess,
    isResolved,
    shouldBlockPremiumAction: !hasActiveAccess,
    needsPaywall: !hasActiveAccess,
  };
}

function normalizeIdentityValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveRevenueCatIdentityAction({
  hasConfigured = false,
  sessionAppUserId = "",
  currentIdentifiedAppUserId = "",
}) {
  if (!hasConfigured) {
    return "skip";
  }

  const normalizedSessionAppUserId = normalizeIdentityValue(sessionAppUserId);
  const normalizedCurrentAppUserId = normalizeIdentityValue(
    currentIdentifiedAppUserId
  );

  if (normalizedSessionAppUserId) {
    return normalizedCurrentAppUserId === normalizedSessionAppUserId
      ? "refresh_identified"
      : "log_in";
  }

  return normalizedCurrentAppUserId ? "log_out" : "refresh_anonymous";
}

export function resolveOriginAppPaywallAction({
  origin = "",
  hasActiveAccess = false,
  isReady = false,
  isLoading = false,
  configurationError = "",
  hasCurrentOffering = false,
}) {
  if (origin !== "app") {
    return "default";
  }

  if (hasActiveAccess) {
    return "continue_to_app";
  }

  const hasConfigurationError =
    typeof configurationError === "string" && configurationError.trim().length > 0;

  if (hasConfigurationError) {
    return "route_settings";
  }

  if (!isReady || isLoading) {
    return "wait";
  }

  if (!hasCurrentOffering) {
    return "route_settings";
  }

  return "present_paywall";
}

export function resolveBackNavigationAction({
  canGoBack = false,
  fallbackHref = "/",
}) {
  return canGoBack ? { type: "back" } : { type: "replace", href: fallbackHref };
}
