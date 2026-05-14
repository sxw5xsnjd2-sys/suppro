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
  IS_DEVELOPMENT_BUILD,
  logBuildAwareDiagnostic,
  logDevelopmentDiagnostic,
} from "@src/lib/runtimeConfig";
import {
  getRevenueCatApiKeySelection,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_LAPSED_OFFERING_ID,
  REVENUECAT_YEARLY_IDENTIFIER,
} from "./revenueCatConfig";
import {
  resolveRevenueCatAccessState,
  resolveRevenueCatIdentityAction,
} from "./accessPolicy";
import {
  getRevenueCatSdk,
  getRevenueCatUnavailableMessage,
  safelyConfigureRevenueCatLogging,
} from "./revenueCatSdk";

const RevenueCatContext = createContext(null);
const REVENUECAT_DEBUG_LOGS_ENABLED = IS_DEVELOPMENT_BUILD;
const SUBSCRIPTION_STATUS_CHECK_ERROR_MESSAGE =
  "Unable to check subscription status. Please try again.";
const EXISTING_SUBSCRIPTION_RESTORED_MESSAGE =
  "Subscription already active — premium restored.";
const EXISTING_SUBSCRIPTION_RETRY_MESSAGE =
  "We couldn't confirm your subscription yet. Use Restore access to try again.";
const EXISTING_SUBSCRIPTION_MESSAGE_PATTERNS = [
  /\balready subscribed\b/i,
  /\balready purchased\b/i,
  /\balready own(?:s|ed)?\b/i,
  /\bcurrently subscribed\b/i,
  /\bactive subscription\b/i,
  /\bsubscription .* active\b/i,
  /\byou(?:'re| are) currently subscribed\b/i,
];

function getRevenueCatAppUserId(user) {
  return hasNonAnonymousUser(user) ? user.id : null;
}

function getPremiumEntitlement(customerInfo) {
  return customerInfo?.entitlements?.all?.[REVENUECAT_ENTITLEMENT_ID] ?? null;
}

function isPremiumActive(customerInfo) {
  return Boolean(
    customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID],
  );
}

function findYearlyPackage(offering) {
  if (!offering) return null;

  const exactMatch = offering.availablePackages?.find(
    (pkg) =>
      pkg.identifier === REVENUECAT_YEARLY_IDENTIFIER ||
      pkg.product?.identifier === REVENUECAT_YEARLY_IDENTIFIER,
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

function getOfferingByIdentifier(offerings, identifier) {
  if (!offerings || typeof identifier !== "string") {
    return null;
  }

  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) {
    return null;
  }

  return offerings.all?.[normalizedIdentifier] ?? null;
}

function resolvePaywallOffering({
  offerings,
  preferredOfferingIdentifier = "",
  fallbackOffering = null,
}) {
  return (
    getOfferingByIdentifier(offerings, preferredOfferingIdentifier) ??
    fallbackOffering ??
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

function normalizeRevenueCatSignal(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getRevenueCatErrorSignals(error) {
  return [
    error?.code,
    error?.readableErrorCode,
    error?.userInfo?.code,
    error?.userInfo?.readable_error_code,
    error?.userInfo?.rc_code_name,
    error?.userInfo?.underlyingErrorMessage,
  ]
    .map(normalizeRevenueCatSignal)
    .filter(Boolean);
}

function isAlreadySubscribedError(error) {
  const sdk = getRevenueCatSdk();
  const alreadyPurchasedCode =
    sdk.Purchases?.PURCHASES_ERROR_CODE?.PRODUCT_ALREADY_PURCHASED_ERROR ?? null;
  const normalizedMessage = normalizeRevenueCatSignal(error?.message);

  if (alreadyPurchasedCode && error?.code === alreadyPurchasedCode) {
    return true;
  }

  const hasKnownSignal = getRevenueCatErrorSignals(error).some((signal) =>
    [
      "product_already_purchased_error",
      "product_already_purchased",
      "already_purchased",
      "already_subscribed",
      "already_owned",
      "active_subscription",
    ].some((candidate) => signal.includes(candidate))
  );

  if (hasKnownSignal) {
    return true;
  }

  return EXISTING_SUBSCRIPTION_MESSAGE_PATTERNS.some((pattern) =>
    pattern.test(normalizedMessage)
  );
}

function toRevenueCatErrorMessage(error, fallbackMessage) {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return fallbackMessage;
}

function resolveRecoveredPurchaseResult(customerInfo) {
  const hasPremiumAccess = isPremiumActive(customerInfo);

  return {
    didRecover: hasPremiumAccess,
    hasPremiumAccess,
    message: hasPremiumAccess ? EXISTING_SUBSCRIPTION_RESTORED_MESSAGE : "",
    error: hasPremiumAccess ? "" : EXISTING_SUBSCRIPTION_RETRY_MESSAGE,
  };
}

function resolveRestorePurchasesResult(customerInfo) {
  const hasPremiumAccess = isPremiumActive(customerInfo);
  const message = hasPremiumAccess
    ? "Purchases restored and Suppro Premium is active."
    : "Restore completed, but no active Suppro Premium entitlement was found.";

  return {
    didRestore: true,
    hasPremiumAccess,
    message,
    error: "",
  };
}

function resolveExistingSubscriptionCheckResult({
  preparedCustomerInfo = null,
  restoredCustomerInfo = null,
  error = null,
} = {}) {
  if (error) {
    return {
      logKey: "subscription_check_failed",
      hasPremiumAccess: false,
      shouldPresentPaywall: false,
      errorMessage: SUBSCRIPTION_STATUS_CHECK_ERROR_MESSAGE,
    };
  }

  if (
    isPremiumActive(restoredCustomerInfo) ||
    isPremiumActive(preparedCustomerInfo)
  ) {
    return {
      logKey: "existing_subscription_found_skip_paywall",
      hasPremiumAccess: true,
      shouldPresentPaywall: false,
      errorMessage: "",
    };
  }

  return {
    logKey: "no_existing_subscription_present_paywall",
    hasPremiumAccess: false,
    shouldPresentPaywall: true,
    errorMessage: "",
  };
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
    [offerings],
  );
  const lapsedOffering = useMemo(
    () =>
      resolvePaywallOffering({
        offerings,
        preferredOfferingIdentifier: REVENUECAT_LAPSED_OFFERING_ID,
        fallbackOffering: currentOffering,
      }),
    [currentOffering, offerings],
  );
  const yearlyPackage = useMemo(
    () => findYearlyPackage(currentOffering),
    [currentOffering],
  );
  const premiumEntitlement = useMemo(
    () => getPremiumEntitlement(customerInfo),
    [customerInfo],
  );
  const premiumActive = useMemo(
    () => isPremiumActive(customerInfo),
    [customerInfo],
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
    [configurationError, isIdentitySyncing, isLoading, isReady, premiumActive],
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
      logBuildAwareDiagnostic(
        "warn",
        "[revenuecat] Failed to sync subscriber attributes",
        {
          developmentDetails: {
            message:
              typeof error?.message === "string"
                ? error.message
                : "Unknown error",
          },
        },
      );
      return null;
    }
  };

  const refreshState = async ({
    silent = false,
    invalidateCustomerInfo = false,
    syncPurchases = false,
  } = {}) => {
    if (!hasConfiguredRef.current) return null;
    if (!revenueCatSdk.Purchases) return null;

    if (!silent && isMountedRef.current) {
      setIsRefreshing(true);
      setActionError("");
    }

    try {
      if (
        invalidateCustomerInfo &&
        typeof revenueCatSdk.Purchases.invalidateCustomerInfoCache === "function"
      ) {
        await Promise.resolve(
          revenueCatSdk.Purchases.invalidateCustomerInfoCache(),
        ).catch(() => null);
      }

      if (syncPurchases) {
        try {
          if (
            typeof revenueCatSdk.Purchases.syncPurchasesForResult === "function"
          ) {
            await revenueCatSdk.Purchases.syncPurchasesForResult();
          } else if (typeof revenueCatSdk.Purchases.syncPurchases === "function") {
            await Promise.resolve(revenueCatSdk.Purchases.syncPurchases());
          }
        } catch (error) {
          logBuildAwareDiagnostic(
            "warn",
            "[revenuecat] Failed to sync purchases",
            {
              developmentDetails: {
                message:
                  typeof error?.message === "string"
                    ? error.message
                    : "Unknown error",
              },
            },
          );
        }
      }

      logDevelopmentDiagnostic("log", "[revenuecat] Getting offerings...");

      const [nextCustomerInfo, nextOfferings, nextAppUserId] =
        await Promise.all([
          revenueCatSdk.Purchases.getCustomerInfo(),
          revenueCatSdk.Purchases.getOfferings().catch((error) => {
            logBuildAwareDiagnostic(
              "warn",
              "[revenuecat] Failed to fetch offerings",
              {
                developmentDetails: {
                  message:
                    typeof error?.message === "string"
                      ? error.message
                      : "Unknown error",
                },
              },
            );
            return null;
          }),
          revenueCatSdk.Purchases.getAppUserID(),
        ]);

      if (nextOfferings) {
        logDevelopmentDiagnostic("log", "[revenuecat] Offerings loaded", {
          currentOfferingId: nextOfferings.current?.identifier ?? null,
          offeringIds: Object.keys(nextOfferings.all ?? {}),
        });
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
            "Could not refresh Suppro Premium status.",
          ),
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
            nextIdentifiedAppUserId,
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
        return await refreshState({
          silent: true,
          invalidateCustomerInfo: true,
        });
      } catch (error) {
        if (isMountedRef.current) {
          setActionError(
            toRevenueCatErrorMessage(
              error,
              "Could not sync your account with RevenueCat.",
            ),
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

  const prepareSubscriptionAccess = async ({ syncPurchases = false } = {}) => {
    await syncIdentityForCurrentSession();
    return refreshState({
      silent: true,
      invalidateCustomerInfo: true,
      syncPurchases,
    });
  };

  const recoverExistingSubscription = async () => {
    const refreshedState = await prepareSubscriptionAccess({
      syncPurchases: true,
    });
    const recoveryResult = resolveRecoveredPurchaseResult(
      refreshedState?.customerInfo ?? null,
    );

    if (isMountedRef.current) {
      if (recoveryResult.hasPremiumAccess) {
        setActionError("");
        setActionMessage(recoveryResult.message);
      } else {
        setActionError(recoveryResult.error);
      }
    }

    return recoveryResult;
  };

  const checkExistingSubscriptionBeforePaywall = async ({
    shouldRestore = false,
  } = {}) => {
    logBuildAwareDiagnostic(
      "log",
      "checking_existing_subscription_before_paywall",
      {
        developmentDetails: {
          shouldRestore,
        },
      },
    );

    try {
      const preparedState = await prepareSubscriptionAccess({
        syncPurchases: true,
      });
      const preparedCustomerInfo = preparedState?.customerInfo ?? null;
      let decision = resolveExistingSubscriptionCheckResult({
        preparedCustomerInfo,
      });

      if (decision.hasPremiumAccess) {
        logBuildAwareDiagnostic("log", decision.logKey, {
          developmentDetails: {
            source: "prepared_customer_info",
          },
        });
        if (isMountedRef.current) {
          setActionError("");
          setActionMessage(EXISTING_SUBSCRIPTION_RESTORED_MESSAGE);
        }
        return decision;
      }

      if (shouldRestore && typeof revenueCatSdk.Purchases?.restorePurchases === "function") {
        const restoredCustomerInfo =
          await revenueCatSdk.Purchases.restorePurchases();

        if (isMountedRef.current) {
          setCustomerInfo(restoredCustomerInfo);
        }

        const refreshedState = await refreshState({
          silent: true,
          invalidateCustomerInfo: true,
          syncPurchases: true,
        });

        decision = resolveExistingSubscriptionCheckResult({
          preparedCustomerInfo,
          restoredCustomerInfo:
            refreshedState?.customerInfo ?? restoredCustomerInfo,
        });

        if (decision.hasPremiumAccess) {
          logBuildAwareDiagnostic("log", decision.logKey, {
            developmentDetails: {
              source: "restore_purchases",
            },
          });
          if (isMountedRef.current) {
            setActionError("");
            setActionMessage(EXISTING_SUBSCRIPTION_RESTORED_MESSAGE);
          }
          return decision;
        }
      }

      logBuildAwareDiagnostic("log", decision.logKey, {
        developmentDetails: {
          shouldRestore,
        },
      });
      return decision;
    } catch (error) {
      const decision = resolveExistingSubscriptionCheckResult({ error });

      logBuildAwareDiagnostic("warn", decision.logKey, {
        developmentDetails: {
          shouldRestore,
          message:
            typeof error?.message === "string" ? error.message : "Unknown error",
        },
      });

      if (isMountedRef.current) {
        setActionError(decision.errorMessage);
        setActionMessage("");
      }

      return decision;
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

      if (!revenueCatSdk.purchasesAvailable) {
        if (isMountedRef.current) {
          setConfigurationError(
            getRevenueCatUnavailableMessage(revenueCatSdk.error),
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
        await safelyConfigureRevenueCatLogging(revenueCatSdk.Purchases, {
          debugLogsEnabled: REVENUECAT_DEBUG_LOGS_ENABLED,
        });

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
          customerInfoListener,
        );

        await syncSubscriberAttributes(initialUser);
        await refreshState({
          silent: true,
          invalidateCustomerInfo: true,
        });

        if (isMountedRef.current) {
          setIsReady(true);
        }
      } catch (error) {
        if (isMountedRef.current) {
          setConfigurationError(
            toRevenueCatErrorMessage(error, "RevenueCat failed to initialize."),
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
          customerInfoListener,
        );
      }
    };
  }, [revenueCatSdk]);

  const restorePurchases = async () => {
    const unavailableMessage = getRevenueCatUnavailableMessage(
      revenueCatSdk.error,
    );

    if (!hasConfiguredRef.current || !revenueCatSdk.Purchases) {
      if (isMountedRef.current) {
        setActionError(unavailableMessage);
      }
      return {
        didRestore: false,
        hasPremiumAccess: false,
        message: "",
        error: unavailableMessage,
      };
    }

    setIsRestoring(true);
    setActionError("");
    setActionMessage("");

    try {
      const preparedState = await prepareSubscriptionAccess({
        syncPurchases: true,
      });

      if (isPremiumActive(preparedState?.customerInfo)) {
        const recoveryResult = resolveRecoveredPurchaseResult(
          preparedState?.customerInfo,
        );

        if (isMountedRef.current) {
          setActionMessage(recoveryResult.message);
        }

        return {
          didRestore: true,
          hasPremiumAccess: true,
          message: recoveryResult.message,
          error: "",
        };
      }

      const nextCustomerInfo = await revenueCatSdk.Purchases.restorePurchases();
      const restoreResult = resolveRestorePurchasesResult(nextCustomerInfo);

      if (isMountedRef.current) {
        setCustomerInfo(nextCustomerInfo);
        setActionMessage(restoreResult.message);
      }
      await prepareSubscriptionAccess({ syncPurchases: true });
      return restoreResult;
    } catch (error) {
      const message = toRevenueCatErrorMessage(
        error,
        "Could not restore purchases.",
      );
      if (isMountedRef.current) {
        setActionError(message);
      }
      return {
        didRestore: false,
        hasPremiumAccess: false,
        message: "",
        error: message,
      };
    } finally {
      if (isMountedRef.current) {
        setIsRestoring(false);
      }
    }
  };

  const openManageSubscription = async () => {
    const unavailableMessage = getRevenueCatUnavailableMessage(
      revenueCatSdk.error,
    );

    if (
      !hasConfiguredRef.current ||
      !revenueCatSdk.Purchases?.showManageSubscriptions
    ) {
      if (isMountedRef.current) {
        setActionError(unavailableMessage);
      }
      return {
        opened: false,
        error: unavailableMessage,
      };
    }

    setActionError("");
    setActionMessage("");

    try {
      await revenueCatSdk.Purchases.showManageSubscriptions();
      return {
        opened: true,
        error: "",
      };
    } catch (error) {
      const message = toRevenueCatErrorMessage(
        error,
        "Could not open subscription management.",
      );
      if (isMountedRef.current) {
        setActionError(message);
      }
      return {
        opened: false,
        error: message,
      };
    }
  };

  const purchaseYearly = async () => {
    if (!hasConfiguredRef.current) return false;
    if (!revenueCatSdk.Purchases) return false;

    const preparedState = await prepareSubscriptionAccess();
    if (isPremiumActive(preparedState?.customerInfo)) {
      if (isMountedRef.current) {
        setActionError("");
        setActionMessage(EXISTING_SUBSCRIPTION_RESTORED_MESSAGE);
      }
      return true;
    }

    if (!yearlyPackage) {
      setActionError(
        "No yearly package is available. Confirm your current RevenueCat offering includes the yearly product.",
      );
      return false;
    }

    setIsPurchasing(true);
    setActionError("");
    setActionMessage("");

    try {
      const result =
        await revenueCatSdk.Purchases.purchasePackage(yearlyPackage);
      if (isMountedRef.current) {
        setCustomerInfo(result.customerInfo);
        setActionMessage("Suppro Premium unlocked.");
      }
      await refreshState({
        silent: true,
        invalidateCustomerInfo: true,
      });
      return true;
    } catch (error) {
      if (!isPurchaseCancelled(error)) {
        const recoveryResult = await recoverExistingSubscription();
        if (recoveryResult.hasPremiumAccess) {
          return true;
        }
      }

      if (isMountedRef.current) {
        if (isPurchaseCancelled(error)) {
          setActionMessage("Purchase cancelled.");
        } else if (isAlreadySubscribedError(error)) {
          setActionError(EXISTING_SUBSCRIPTION_RETRY_MESSAGE);
        } else {
          setActionError(
            toRevenueCatErrorMessage(error, "Could not complete the purchase."),
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

  const presentPremiumPaywall = async ({
    ifNeeded = true,
    offering = currentOffering,
    checkExistingSubscription = false,
    restoreExistingSubscription = false,
  } = {}) => {
    if (!hasConfiguredRef.current) return false;

    setIsPresentingPaywall(true);
    setActionError("");
    setActionMessage("");

    try {
      if (checkExistingSubscription) {
        const decision = await checkExistingSubscriptionBeforePaywall({
          shouldRestore: restoreExistingSubscription,
        });

        if (decision.hasPremiumAccess) {
          return true;
        }

        if (!decision.shouldPresentPaywall) {
          return false;
        }
      } else {
        const preparedState = await prepareSubscriptionAccess();
        if (isPremiumActive(preparedState?.customerInfo)) {
          if (isMountedRef.current) {
            setActionError("");
            setActionMessage(EXISTING_SUBSCRIPTION_RESTORED_MESSAGE);
          }
          return true;
        }
      }

      if (!revenueCatSdk.uiAvailable || !revenueCatSdk.RevenueCatUI) {
        if (isMountedRef.current) {
          setActionError("The RevenueCat paywall could not be presented.");
        }
        return false;
      }

      const options = offering ? { offering } : {};
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
        const nextCustomerState = await refreshState({
          silent: true,
          invalidateCustomerInfo: true,
          syncPurchases: paywallResult === revenueCatSdk.PAYWALL_RESULT.RESTORED,
        });
        const nextCustomerInfo = nextCustomerState?.customerInfo ?? null;
        if (isMountedRef.current) {
          setCustomerInfo(nextCustomerInfo);
          setActionMessage(
            paywallResult === revenueCatSdk.PAYWALL_RESULT.PURCHASED
              ? "Suppro Premium unlocked."
              : "Purchases restored.",
          );
        }
        return isPremiumActive(nextCustomerInfo);
      }

      if (
        paywallResult === revenueCatSdk.PAYWALL_RESULT.NOT_PRESENTED &&
        ifNeeded
      ) {
        const nextCustomerState = await refreshState({
          silent: true,
          invalidateCustomerInfo: true,
          syncPurchases: true,
        });
        const nextCustomerInfo = nextCustomerState?.customerInfo ?? null;
        const alreadyPremium = isPremiumActive(nextCustomerInfo);
        if (isMountedRef.current) {
          setCustomerInfo(nextCustomerInfo);
          if (alreadyPremium) {
            setActionMessage(EXISTING_SUBSCRIPTION_RESTORED_MESSAGE);
          }
        }
        return alreadyPremium;
      }

      if (paywallResult === revenueCatSdk.PAYWALL_RESULT.ERROR) {
        const recoveryResult = await recoverExistingSubscription();
        if (recoveryResult.hasPremiumAccess) {
          return true;
        }
      }

      if (isMountedRef.current) {
        if (paywallResult === revenueCatSdk.PAYWALL_RESULT.CANCELLED) {
          setActionMessage("Purchase cancelled.");
        } else if (paywallResult === revenueCatSdk.PAYWALL_RESULT.ERROR) {
          setActionError("The RevenueCat paywall could not be presented.");
        }
      }

      return false;
    } catch (error) {
      if (!isPurchaseCancelled(error)) {
        const recoveryResult = await recoverExistingSubscription();
        if (recoveryResult.hasPremiumAccess) {
          return true;
        }
      }

      if (isMountedRef.current) {
        setActionError(
          toRevenueCatErrorMessage(error, "Could not present the paywall."),
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
                  "Customer Center restore failed.",
                ),
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
          toRevenueCatErrorMessage(error, "Could not open Customer Center."),
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
      lapsedOffering,
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
      openManageSubscription,
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
      lapsedOffering,
      isIdentitySyncing,
      isLoading,
      isOpeningCustomerCenter,
      isPresentingPaywall,
      isPurchasing,
      isReady,
      isRefreshing,
      isRestoring,
      offerings,
      openManageSubscription,
      premiumActive,
      premiumEntitlement,
      accessState,
      syncIdentityForCurrentSession,
      revenueCatSdk.available,
      revenueCatSdk.uiAvailable,
      yearlyPackage,
    ],
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
