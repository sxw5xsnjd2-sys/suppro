import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Purchases from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { supabase } from "@src/lib/supabase";
import { hasNonAnonymousUser } from "@src/lib/authState";
import { getUserAuthProvider, getUserDisplayName } from "@src/lib/account";
import {
  getRevenueCatApiKeySelection,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_YEARLY_IDENTIFIER,
} from "./revenueCatConfig";

const RevenueCatContext = createContext(null);
const REVENUECAT_DEBUG_LOGS_ENABLED = true;

function getRevenueCatAppUserId(user) {
  return hasNonAnonymousUser(user) ? user.id : null;
}

function getPremiumEntitlement(customerInfo) {
  return customerInfo?.entitlements?.all?.[REVENUECAT_ENTITLEMENT_ID] ?? null;
}

function isPremiumActive(customerInfo) {
  return Boolean(
    customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID]
  );
}

function findYearlyPackage(offering) {
  if (!offering) return null;

  const exactMatch = offering.availablePackages?.find(
    (pkg) =>
      pkg.identifier === REVENUECAT_YEARLY_IDENTIFIER ||
      pkg.product?.identifier === REVENUECAT_YEARLY_IDENTIFIER
  );

  return exactMatch ?? offering.annual ?? null;
}

function getPreferredOffering(offerings) {
  if (!offerings) return null;

  const orderedOfferings = [];

  if (offerings.current) {
    orderedOfferings.push(offerings.current);
  }

  for (const offering of Object.values(offerings.all ?? {})) {
    if (
      !orderedOfferings.some((item) => item.identifier === offering.identifier)
    ) {
      orderedOfferings.push(offering);
    }
  }

  return (
    orderedOfferings.find((offering) => Boolean(findYearlyPackage(offering))) ??
    orderedOfferings[0] ??
    null
  );
}

function isPurchaseCancelled(error) {
  return (
    error?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
    error?.userCancelled === true
  );
}

function toRevenueCatErrorMessage(error, fallbackMessage) {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return fallbackMessage;
}

export function RevenueCatProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [configurationMode, setConfigurationMode] = useState("missing");
  const [customerInfo, setCustomerInfo] = useState(null);
  const [offerings, setOfferings] = useState(null);
  const [appUserId, setAppUserId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPresentingPaywall, setIsPresentingPaywall] = useState(false);
  const [isOpeningCustomerCenter, setIsOpeningCustomerCenter] = useState(false);

  const hasConfiguredRef = useRef(false);
  const currentIdentifiedAppUserIdRef = useRef(null);
  const isMountedRef = useRef(false);

  const currentOffering = useMemo(
    () => getPreferredOffering(offerings),
    [offerings]
  );
  const yearlyPackage = useMemo(
    () => findYearlyPackage(currentOffering),
    [currentOffering]
  );
  const premiumEntitlement = useMemo(
    () => getPremiumEntitlement(customerInfo),
    [customerInfo]
  );
  const premiumActive = useMemo(
    () => isPremiumActive(customerInfo),
    [customerInfo]
  );

  const syncSubscriberAttributes = async (user) => {
    if (!hasConfiguredRef.current) return null;
    if (!hasNonAnonymousUser(user)) return null;

    const displayName = getUserDisplayName({ user }) || null;
    const authProvider = getUserAuthProvider(user) || "";
    const stableUserId = user.id;

    try {
      await Promise.all([
        Purchases.setEmail(user?.email ?? null),
        Purchases.setDisplayName(displayName),
        Purchases.setAttributes({
          auth_provider: authProvider,
          suppro_user_id: stableUserId,
        }),
      ]);

      return await Purchases.syncAttributesAndOfferingsIfNeeded();
    } catch (error) {
      console.warn("[revenuecat] Failed to sync subscriber attributes", error);
      return null;
    }
  };

  const refreshState = async ({ silent = false } = {}) => {
    if (!hasConfiguredRef.current) return null;

    if (!silent && isMountedRef.current) {
      setIsRefreshing(true);
      setActionError("");
    }

    try {
      if (REVENUECAT_DEBUG_LOGS_ENABLED) {
        console.log("[revenuecat] Getting offerings...");
      }

      const [nextCustomerInfo, nextOfferings, nextAppUserId] =
        await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings().catch((error) => {
            console.log("[revenuecat] Error fetching offerings:", error);
            return null;
          }),
          Purchases.getAppUserID(),
        ]);

      if (REVENUECAT_DEBUG_LOGS_ENABLED && nextOfferings) {
        console.log(
          "[revenuecat] Offerings:",
          JSON.stringify(nextOfferings, null, 2)
        );
      }

      if (isMountedRef.current) {
        setCustomerInfo(nextCustomerInfo);
        if (nextOfferings) {
          setOfferings(nextOfferings);
        }
        setAppUserId(nextAppUserId);
      }

      return {
        customerInfo: nextCustomerInfo,
        offerings: nextOfferings,
        appUserId: nextAppUserId,
      };
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(
          toRevenueCatErrorMessage(
            error,
            "Could not refresh Suppro Premium status."
          )
        );
      }
      return null;
    } finally {
      if (!silent && isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  };

  const syncIdentityForUser = async (user) => {
    if (!hasConfiguredRef.current) return null;

    const nextIdentifiedAppUserId = getRevenueCatAppUserId(user);

    try {
      if (
        nextIdentifiedAppUserId &&
        currentIdentifiedAppUserIdRef.current !== nextIdentifiedAppUserId
      ) {
        const result = await Purchases.logIn(nextIdentifiedAppUserId);
        currentIdentifiedAppUserIdRef.current = nextIdentifiedAppUserId;

        if (isMountedRef.current) {
          setCustomerInfo(result.customerInfo);
        }
      }

      await syncSubscriberAttributes(user);
      await refreshState({ silent: true });
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(
          toRevenueCatErrorMessage(
            error,
            "Could not sync your account with RevenueCat."
          )
        );
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    let customerInfoListener = null;

    const configureRevenueCat = async () => {
      setIsLoading(true);
      setConfigurationError("");
      setActionError("");

      const selection = getRevenueCatApiKeySelection();
      setConfigurationMode(selection.mode);

      if (!selection.apiKey) {
        if (isMountedRef.current) {
          setConfigurationError(selection.error);
          setIsLoading(false);
        }
        return;
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const initialUser = session?.user ?? null;
        const initialAppUserId = getRevenueCatAppUserId(initialUser);
        await Purchases.setLogLevel(
          REVENUECAT_DEBUG_LOGS_ENABLED
            ? Purchases.LOG_LEVEL.DEBUG
            : Purchases.LOG_LEVEL.WARN
        );

        Purchases.configure({
          apiKey: selection.apiKey,
          diagnosticsEnabled: REVENUECAT_DEBUG_LOGS_ENABLED,
          storeKitVersion: Purchases.STOREKIT_VERSION.STOREKIT_2,
          ...(initialAppUserId ? { appUserID: initialAppUserId } : {}),
        });

        if (REVENUECAT_DEBUG_LOGS_ENABLED) {
          console.log("[revenuecat] Configured Purchases", {
            mode: selection.mode,
            hasAppUserID: Boolean(initialAppUserId),
            entitlementId: REVENUECAT_ENTITLEMENT_ID,
            yearlyIdentifier: REVENUECAT_YEARLY_IDENTIFIER,
          });
        }

        hasConfiguredRef.current = true;
        currentIdentifiedAppUserIdRef.current = initialAppUserId ?? null;

        customerInfoListener = (nextCustomerInfo) => {
          if (isMountedRef.current) {
            setCustomerInfo(nextCustomerInfo);
          }
        };

        Purchases.addCustomerInfoUpdateListener(customerInfoListener);

        await syncSubscriberAttributes(initialUser);
        await refreshState({ silent: true });

        if (isMountedRef.current) {
          setIsReady(true);
        }
      } catch (error) {
        if (isMountedRef.current) {
          setConfigurationError(
            toRevenueCatErrorMessage(error, "RevenueCat failed to initialize.")
          );
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    configureRevenueCat();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      syncIdentityForUser(nextUser);
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
      if (customerInfoListener) {
        Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
      }
    };
  }, []);

  const restorePurchases = async () => {
    if (!hasConfiguredRef.current) return false;

    setIsRestoring(true);
    setActionError("");
    setActionMessage("");

    try {
      const nextCustomerInfo = await Purchases.restorePurchases();
      if (isMountedRef.current) {
        setCustomerInfo(nextCustomerInfo);
        setActionMessage(
          isPremiumActive(nextCustomerInfo)
            ? "Purchases restored and Suppro Premium is active."
            : "Restore completed, but no active Suppro Premium entitlement was found."
        );
      }
      return isPremiumActive(nextCustomerInfo);
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(
          toRevenueCatErrorMessage(error, "Could not restore purchases.")
        );
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsRestoring(false);
      }
    }
  };

  const purchaseYearly = async () => {
    if (!hasConfiguredRef.current) return false;
    if (!yearlyPackage) {
      setActionError(
        "No yearly package is available. Confirm your current RevenueCat offering includes the yearly product."
      );
      return false;
    }

    setIsPurchasing(true);
    setActionError("");
    setActionMessage("");

    try {
      const result = await Purchases.purchasePackage(yearlyPackage);
      if (isMountedRef.current) {
        setCustomerInfo(result.customerInfo);
        setActionMessage("Suppro Premium unlocked.");
      }
      return true;
    } catch (error) {
      if (isMountedRef.current) {
        if (isPurchaseCancelled(error)) {
          setActionMessage("Purchase cancelled.");
        } else {
          setActionError(
            toRevenueCatErrorMessage(error, "Could not complete the purchase.")
          );
        }
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsPurchasing(false);
      }
    }
  };

  const presentPremiumPaywall = async ({ ifNeeded = true } = {}) => {
    if (!hasConfiguredRef.current) return false;

    setIsPresentingPaywall(true);
    setActionError("");
    setActionMessage("");

    try {
      const options = currentOffering ? { offering: currentOffering } : {};
      const paywallResult = ifNeeded
        ? await RevenueCatUI.presentPaywallIfNeeded({
            requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
            ...options,
          })
        : await RevenueCatUI.presentPaywall(options);

      if (
        paywallResult === PAYWALL_RESULT.PURCHASED ||
        paywallResult === PAYWALL_RESULT.RESTORED
      ) {
        const nextCustomerInfo = await Purchases.getCustomerInfo();
        if (isMountedRef.current) {
          setCustomerInfo(nextCustomerInfo);
          setActionMessage(
            paywallResult === PAYWALL_RESULT.PURCHASED
              ? "Suppro Premium unlocked."
              : "Purchases restored."
          );
        }
        return true;
      }

      if (paywallResult === PAYWALL_RESULT.NOT_PRESENTED && ifNeeded) {
        const nextCustomerInfo = await Purchases.getCustomerInfo();
        const alreadyPremium = isPremiumActive(nextCustomerInfo);
        if (isMountedRef.current) {
          setCustomerInfo(nextCustomerInfo);
          if (alreadyPremium) {
            setActionMessage("Suppro Premium is already active.");
          }
        }
        return alreadyPremium;
      }

      if (isMountedRef.current) {
        if (paywallResult === PAYWALL_RESULT.CANCELLED) {
          setActionMessage("Paywall dismissed.");
        } else if (paywallResult === PAYWALL_RESULT.ERROR) {
          setActionError("The RevenueCat paywall could not be presented.");
        }
      }

      return false;
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(
          toRevenueCatErrorMessage(error, "Could not present the paywall.")
        );
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsPresentingPaywall(false);
      }
    }
  };

  const ensurePremiumAccess = async () => {
    if (premiumActive) return true;
    return presentPremiumPaywall({ ifNeeded: true });
  };

  const openCustomerCenter = async () => {
    if (!hasConfiguredRef.current) return false;

    setIsOpeningCustomerCenter(true);
    setActionError("");
    setActionMessage("");

    try {
      await RevenueCatUI.presentCustomerCenter({
        callbacks: {
          onRestoreCompleted: ({ customerInfo: nextCustomerInfo }) => {
            if (isMountedRef.current) {
              setCustomerInfo(nextCustomerInfo);
              setActionMessage("Purchases restored from Customer Center.");
            }
          },
          onRestoreFailed: ({ error }) => {
            if (isMountedRef.current) {
              setActionError(
                toRevenueCatErrorMessage(
                  error,
                  "Customer Center restore failed."
                )
              );
            }
          },
        },
      });

      await refreshState({ silent: true });
      return true;
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(
          toRevenueCatErrorMessage(error, "Could not open Customer Center.")
        );
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsOpeningCustomerCenter(false);
      }
    }
  };

  const value = useMemo(
    () => ({
      isReady,
      isLoading,
      configurationMode,
      configurationError,
      actionError,
      actionMessage,
      customerInfo,
      offerings,
      currentOffering,
      yearlyPackage,
      premiumEntitlement,
      premiumActive,
      appUserId,
      entitlementId: REVENUECAT_ENTITLEMENT_ID,
      yearlyIdentifier: REVENUECAT_YEARLY_IDENTIFIER,
      isRefreshing,
      isPurchasing,
      isRestoring,
      isPresentingPaywall,
      isOpeningCustomerCenter,
      refreshState,
      ensurePremiumAccess,
      purchaseYearly,
      presentPremiumPaywall,
      restorePurchases,
      openCustomerCenter,
    }),
    [
      actionError,
      actionMessage,
      appUserId,
      configurationError,
      configurationMode,
      currentOffering,
      customerInfo,
      isLoading,
      isOpeningCustomerCenter,
      isPresentingPaywall,
      isPurchasing,
      isReady,
      isRefreshing,
      isRestoring,
      offerings,
      premiumActive,
      premiumEntitlement,
      yearlyPackage,
    ]
  );

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);

  if (!context) {
    throw new Error("useRevenueCat must be used inside RevenueCatProvider.");
  }

  return context;
}
