import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@src/lib/supabase";
import { hasNonAnonymousUser } from "@src/lib/authState";
import { getUserAuthProvider, getUserDisplayName } from "@src/lib/account";
import {
  getRevenueCatApiKeySelection,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_YEARLY_IDENTIFIER,
} from "./revenueCatConfig";
import {
  resolveRevenueCatAccessState,
  resolveRevenueCatIdentityAction,
} from "./accessPolicy";
import {
  getRevenueCatSdk,
  installRevenueCatLogHandler,
  getRevenueCatUnavailableMessage,
} from "./revenueCatSdk";

const RevenueCatContext = createContext(null);
const REVENUECAT_DEBUG_LOGS_ENABLED = false;

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
  const sdk = getRevenueCatSdk();
  const cancelledCode =
    sdk.Purchases?.PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR ?? null;

  return (
    (cancelledCode && error?.code === cancelledCode) ||
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
  const revenueCatSdk = useMemo(() => getRevenueCatSdk(), []);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [configurationMode, setConfigurationMode] = useState("missing");
  const [customerInfo, setCustomerInfo] = useState(null);
  const [offerings, setOfferings] = useState(null);
  const [appUserId, setAppUserId] = useState("");
  const [isIdentitySyncing, setIsIdentitySyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPresentingPaywall, setIsPresentingPaywall] = useState(false);
  const [isOpeningCustomerCenter, setIsOpeningCustomerCenter] = useState(false);

  const hasConfiguredRef = useRef(false);
  const currentIdentifiedAppUserIdRef = useRef(null);
  const identitySyncPromiseRef = useRef(null);
  const identitySyncTargetRef = useRef("");
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
  const accessState = useMemo(
    () =>
      resolveRevenueCatAccessState({
        isReady,
        isLoading,
        isIdentitySyncing,
        configurationError,
        premiumActive,
      }),
    [configurationError, isIdentitySyncing, isLoading, isReady, premiumActive]
  );

  const syncSubscriberAttributes = async (user) => {
    if (!hasConfiguredRef.current) return null;
    if (!hasNonAnonymousUser(user)) return null;
    if (!revenueCatSdk.Purchases) return null;

    const displayName = getUserDisplayName({ user }) || null;
    const authProvider = getUserAuthProvider(user) || "";
    const stableUserId = user.id;

    try {
      await Promise.all([
        revenueCatSdk.Purchases.setEmail(user?.email ?? null),
        revenueCatSdk.Purchases.setDisplayName(displayName),
        revenueCatSdk.Purchases.setAttributes({
          auth_provider: authProvider,
          suppro_user_id: stableUserId,
        }),
      ]);

      return await revenueCatSdk.Purchases.syncAttributesAndOfferingsIfNeeded();
    } catch (error) {
      console.warn("[revenuecat] Failed to sync subscriber attributes", error);
      return null;
    }
  };

  const refreshState = async ({ silent = false } = {}) => {
    if (!hasConfiguredRef.current) return null;
    if (!revenueCatSdk.Purchases) return null;

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
          revenueCatSdk.Purchases.getCustomerInfo(),
          revenueCatSdk.Purchases.getOfferings().catch((error) => {
            if (REVENUECAT_DEBUG_LOGS_ENABLED) {
              console.log("[revenuecat] Error fetching offerings:", error);
            }
            return null;
          }),
          revenueCatSdk.Purchases.getAppUserID(),
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
    if (!revenueCatSdk.Purchases) return null;

    const nextIdentifiedAppUserId = getRevenueCatAppUserId(user);
    const identityTarget = nextIdentifiedAppUserId ?? "";
    const identityAction = resolveRevenueCatIdentityAction({
      hasConfigured: hasConfiguredRef.current,
      sessionAppUserId: identityTarget,
      currentIdentifiedAppUserId: currentIdentifiedAppUserIdRef.current ?? "",
    });

    if (identityAction === "skip") {
      return null;
    }

    if (
      identitySyncPromiseRef.current &&
      identitySyncTargetRef.current === identityTarget
    ) {
      return identitySyncPromiseRef.current;
    }

    const syncPromise = (async () => {
      if (isMountedRef.current) {
        setIsIdentitySyncing(true);
        setActionError("");
      }

      try {
        if (identityAction === "log_in" && nextIdentifiedAppUserId) {
          const result = await revenueCatSdk.Purchases.logIn(
            nextIdentifiedAppUserId
          );
          currentIdentifiedAppUserIdRef.current = nextIdentifiedAppUserId;

          if (isMountedRef.current) {
            setCustomerInfo(result.customerInfo);
          }
        } else if (identityAction === "log_out") {
          const nextCustomerInfo = await revenueCatSdk.Purchases.logOut();
          currentIdentifiedAppUserIdRef.current = null;

          if (isMountedRef.current) {
            setCustomerInfo(nextCustomerInfo);
          }
        }

        await syncSubscriberAttributes(user);
        return await refreshState({ silent: true });
      } catch (error) {
        if (isMountedRef.current) {
          setActionError(
            toRevenueCatErrorMessage(
              error,
              "Could not sync your account with RevenueCat."
            )
          );
        }
        return null;
      } finally {
        if (identitySyncPromiseRef.current === syncPromise) {
          identitySyncPromiseRef.current = null;
          identitySyncTargetRef.current = "";
        }
        if (isMountedRef.current) {
          setIsIdentitySyncing(false);
        }
      }
    })();

    identitySyncPromiseRef.current = syncPromise;
    identitySyncTargetRef.current = identityTarget;

    return syncPromise;
  };

  const syncIdentityForCurrentSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return syncIdentityForUser(session?.user ?? null);
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

      if (!revenueCatSdk.purchasesAvailable) {
        if (isMountedRef.current) {
          setConfigurationError(
            getRevenueCatUnavailableMessage(revenueCatSdk.error)
          );
          setIsLoading(false);
        }
        return;
      }

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
        installRevenueCatLogHandler(revenueCatSdk.Purchases);
        await revenueCatSdk.Purchases.setLogLevel(
          REVENUECAT_DEBUG_LOGS_ENABLED
            ? revenueCatSdk.Purchases.LOG_LEVEL.DEBUG
            : revenueCatSdk.Purchases.LOG_LEVEL.WARN
        );

        const configuration = {
          apiKey: selection.apiKey,
          diagnosticsEnabled: REVENUECAT_DEBUG_LOGS_ENABLED,
          ...(initialAppUserId ? { appUserID: initialAppUserId } : {}),
        };
        const storeKitVersion =
          revenueCatSdk.Purchases.STOREKIT_VERSION?.STOREKIT_2;

        if (storeKitVersion) {
          configuration.storeKitVersion = storeKitVersion;
        }

        revenueCatSdk.Purchases.configure(configuration);

        hasConfiguredRef.current = true;
        currentIdentifiedAppUserIdRef.current = initialAppUserId ?? null;

        customerInfoListener = (nextCustomerInfo) => {
          if (isMountedRef.current) {
            setCustomerInfo(nextCustomerInfo);
          }
        };

        revenueCatSdk.Purchases.addCustomerInfoUpdateListener(
          customerInfoListener
        );

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
        revenueCatSdk.Purchases.removeCustomerInfoUpdateListener(
          customerInfoListener
        );
      }
    };
  }, [revenueCatSdk]);

  const restorePurchases = async () => {
    if (!hasConfiguredRef.current) return false;
    if (!revenueCatSdk.Purchases) return false;

    setIsRestoring(true);
    setActionError("");
    setActionMessage("");

    try {
      const nextCustomerInfo = await revenueCatSdk.Purchases.restorePurchases();
      if (isMountedRef.current) {
        setCustomerInfo(nextCustomerInfo);
        setActionMessage(
          isPremiumActive(nextCustomerInfo)
            ? "Purchases restored and Suppro Premium is active."
            : "Restore completed, but no active Suppro Premium entitlement was found."
        );
      }
      await refreshState({ silent: true });
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
    if (!revenueCatSdk.Purchases) return false;
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
      const result = await revenueCatSdk.Purchases.purchasePackage(
        yearlyPackage
      );
      if (isMountedRef.current) {
        setCustomerInfo(result.customerInfo);
        setActionMessage("Suppro Premium unlocked.");
      }
      await refreshState({ silent: true });
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
    if (!revenueCatSdk.uiAvailable || !revenueCatSdk.RevenueCatUI) {
      if (isMountedRef.current) {
        setActionError("The RevenueCat paywall could not be presented.");
      }
      return false;
    }

    setIsPresentingPaywall(true);
    setActionError("");
    setActionMessage("");

    try {
      const options = currentOffering ? { offering: currentOffering } : {};
      const paywallResult = ifNeeded
        ? await revenueCatSdk.RevenueCatUI.presentPaywallIfNeeded({
            requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
            ...options,
          })
        : await revenueCatSdk.RevenueCatUI.presentPaywall(options);

      if (
        paywallResult === revenueCatSdk.PAYWALL_RESULT.PURCHASED ||
        paywallResult === revenueCatSdk.PAYWALL_RESULT.RESTORED
      ) {
        const nextCustomerInfo = await revenueCatSdk.Purchases.getCustomerInfo();
        if (isMountedRef.current) {
          setCustomerInfo(nextCustomerInfo);
          setActionMessage(
            paywallResult === revenueCatSdk.PAYWALL_RESULT.PURCHASED
              ? "Suppro Premium unlocked."
              : "Purchases restored."
          );
        }
        await refreshState({ silent: true });
        return true;
      }

      if (
        paywallResult === revenueCatSdk.PAYWALL_RESULT.NOT_PRESENTED &&
        ifNeeded
      ) {
        const nextCustomerInfo = await revenueCatSdk.Purchases.getCustomerInfo();
        const alreadyPremium = isPremiumActive(nextCustomerInfo);
        if (isMountedRef.current) {
          setCustomerInfo(nextCustomerInfo);
          if (alreadyPremium) {
            setActionMessage("Suppro Premium is already active.");
          }
        }
        await refreshState({ silent: true });
        return alreadyPremium;
      }

      if (isMountedRef.current) {
        if (paywallResult === revenueCatSdk.PAYWALL_RESULT.CANCELLED) {
          setActionMessage("Paywall dismissed.");
        } else if (paywallResult === revenueCatSdk.PAYWALL_RESULT.ERROR) {
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
    if (accessState.hasActiveAccess) return true;
    if (!isReady || isLoading || isIdentitySyncing || configurationError) {
      return false;
    }
    return presentPremiumPaywall({ ifNeeded: true });
  };

  const openCustomerCenter = async () => {
    if (!hasConfiguredRef.current) return false;
    if (!revenueCatSdk.uiAvailable || !revenueCatSdk.RevenueCatUI) {
      if (isMountedRef.current) {
        setActionError("Could not open Customer Center.");
      }
      return false;
    }

    setIsOpeningCustomerCenter(true);
    setActionError("");
    setActionMessage("");

    try {
      await revenueCatSdk.RevenueCatUI.presentCustomerCenter({
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
      accessState,
      hasActiveAccess: accessState.hasActiveAccess,
      isIdentitySyncing,
      sdkAvailable: revenueCatSdk.available,
      uiAvailable: revenueCatSdk.uiAvailable,
      appUserId,
      entitlementId: REVENUECAT_ENTITLEMENT_ID,
      yearlyIdentifier: REVENUECAT_YEARLY_IDENTIFIER,
      isRefreshing,
      isPurchasing,
      isRestoring,
      isPresentingPaywall,
      isOpeningCustomerCenter,
      refreshState,
      syncIdentityForCurrentSession,
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
      isIdentitySyncing,
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
      accessState,
      syncIdentityForCurrentSession,
      revenueCatSdk.available,
      revenueCatSdk.uiAvailable,
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
