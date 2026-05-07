import { useCallback, useMemo } from "react";
import { router, useGlobalSearchParams, usePathname, useSegments } from "expo-router";
import { useRevenueCat } from "./RevenueCatProvider";
import {
  getSubscriptionRouteAccessPolicy,
  resolveRevenueCatAccessState,
} from "./accessPolicy";

export const SUBSCRIPTION_PAYWALL_HREF =
  "/onboarding?mode=first_run&step=paywall&origin=app";

export function useSubscriptionAccess() {
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const revenueCat = useRevenueCat();
  const stepParam = Array.isArray(params.step) ? params.step[0] : params.step;
  const originParam = Array.isArray(params.origin)
    ? params.origin[0]
    : params.origin;
  const isSubscriptionPaywallRoute =
    pathname === "/onboarding" && stepParam === "paywall" && originParam === "app";

  const routeAccessPolicy = useMemo(
    () => getSubscriptionRouteAccessPolicy(segments),
    [segments]
  );

  const accessState = useMemo(
    () =>
      resolveRevenueCatAccessState({
        isReady: revenueCat.isReady,
        isLoading: revenueCat.isLoading,
        isIdentitySyncing: revenueCat.isIdentitySyncing,
        configurationError: revenueCat.configurationError,
        premiumActive: revenueCat.premiumActive,
      }),
    [
      revenueCat.configurationError,
      revenueCat.isIdentitySyncing,
      revenueCat.isLoading,
      revenueCat.isReady,
      revenueCat.premiumActive,
    ]
  );

  const openSubscriptionPaywall = useCallback(({ replace = false } = {}) => {
    if (isSubscriptionPaywallRoute) {
      return false;
    }

    if (replace) {
      router.replace(SUBSCRIPTION_PAYWALL_HREF);
      return true;
    }

    router.push(SUBSCRIPTION_PAYWALL_HREF);
    return true;
  }, [isSubscriptionPaywallRoute]);

  const requireSubscriptionAccess = useCallback(
    (_actionName, { replace = false } = {}) => {
      if (accessState.hasActiveAccess) {
        return true;
      }

      if (!accessState.isResolved) {
        return false;
      }

      openSubscriptionPaywall({ replace });
      return false;
    },
    [
      accessState.hasActiveAccess,
      accessState.isResolved,
      openSubscriptionPaywall,
    ]
  );

  return {
    ...revenueCat,
    ...accessState,
    routeAccessPolicy,
    openSubscriptionPaywall,
    requireSubscriptionAccess,
    guardPremiumAction: requireSubscriptionAccess,
  };
}
