import { useEffect, useMemo, useRef, useState } from "react";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, router, useGlobalSearchParams, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  Exo_300Light,
  Exo_400Regular,
  Exo_500Medium,
  Exo_600SemiBold,
  Exo_700Bold,
  useFonts as useExoFonts,
} from "@expo-google-fonts/exo";
import {
  Exo2_300Light,
  Exo2_400Regular,
  Exo2_500Medium,
  Exo2_600SemiBold,
  Exo2_700Bold,
  Exo2_900Black,
  useFonts as useExo2Fonts,
} from "@expo-google-fonts/exo-2";
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
  useFonts as useGeistMonoFonts,
} from "@expo-google-fonts/geist-mono";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  RevenueCatProvider,
  useRevenueCat,
} from "@/features/subscriptions/RevenueCatProvider";
import { syncSupplementsStoreAccountScope } from "@/features/supplements/store";
import { GlobalToast } from "@/components/common/ui/GlobalToast";
import { hasNonAnonymousUser } from "@src/lib/authState";
import {
  getOnboardingGateState,
  subscribeOnboardingGateChange,
} from "@src/lib/onboarding";
import {
  clearNavigationHandoff,
  getNavigationHandoff,
  NAVIGATION_HANDOFFS,
  subscribeNavigationHandoff,
} from "@src/lib/navigationHandoff";
import { IS_APPLE_HEALTH_SUPPORTED_PLATFORM } from "@/features/health/platform";
import { provisionOnboardingSelections } from "@src/lib/onboardingProvisioning";
import { clearAnonymousSessionIfPresent, supabase } from "@src/lib/supabase";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: "(tabs)",
};

const FALLBACK_GATE_STATE = "needs_questions";
const ONBOARDING_PAYWALL_TRANSITION_GATE_STATES = new Set([
  "needs_questions",
  "needs_rating",
  "needs_apple_health",
  "needs_referral_source",
  "needs_paywall",
]);

async function resolveAccountScopedStores(sessionUser) {
  let user = sessionUser;

  if (user === undefined) {
    const { data } = await supabase.auth.getSession();
    user = data?.session?.user ?? null;
  }

  const scopedUser = hasNonAnonymousUser(user) ? user : null;
  await syncSupplementsStoreAccountScope(scopedUser);
  return scopedUser;
}

function LoadingScreen({ overlay = false }) {
  return (
    <View
      style={[styles.loadingScreen, overlay && styles.loadingOverlay]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading Suppro"
    >
      <Text style={styles.loadingBrand}>SUPPRO</Text>
      <ActivityIndicator color="#141414" />
    </View>
  );
}

function routeMatchesNavigationHandoffTarget({
  handoff,
  isLoginRoute,
  isOnboardingRoute,
  isRetakeOnboarding,
  modeParam,
  segments,
  stepParam,
}) {
  const target = handoff?.target;

  if (!target || typeof target !== "object") {
    return false;
  }

  if (target.pathname === "authenticated_app") {
    return !isLoginRoute && !(isOnboardingRoute && !isRetakeOnboarding);
  }

  if (segments[0] !== target.pathname) {
    return false;
  }

  if (
    typeof target.mode === "string" &&
    (modeParam === "retake" ? "retake" : "first_run") !== target.mode
  ) {
    return false;
  }

  if (typeof target.step === "string") {
    return stepParam === target.step;
  }

  return true;
}

function RootNavigator() {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  useRevenueCat();
  const [gateState, setGateState] = useState(null);
  const [gateResolved, setGateResolved] = useState(false);
  const [activeNavigationHandoff, setActiveNavigationHandoff] = useState(() =>
    getNavigationHandoff(),
  );
  const gateRequestRef = useRef(0);
  const lastRedirectHrefRef = useRef(null);
  const isOnboardingRoute = segments[0] === "onboarding";
  const isLoginRoute = segments[0] === "login";
  const isVerifyEmailRoute = segments[0] === "verify-email";
  const isResetPasswordRoute = segments[0] === "reset-password";
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const stepParam = Array.isArray(params.step) ? params.step[0] : params.step;
  const sourceParam = Array.isArray(params.source)
    ? params.source[0]
    : params.source;
  const originParam = Array.isArray(params.origin)
    ? params.origin[0]
    : params.origin;
  const isRetakeOnboarding = isOnboardingRoute && modeParam === "retake";
  const isBuildingOnboardingRoute =
    isOnboardingRoute && stepParam === "building";
  const isOnboardingPaywallRoute =
    isOnboardingRoute && !isRetakeOnboarding && stepParam === "paywall";
  const isAppSubscriptionGateRoute =
    isOnboardingRoute &&
    !isRetakeOnboarding &&
    stepParam === "paywall" &&
    originParam === "app";
  const isOnboardingScannerFlow =
    (segments[0] === "scanner" &&
      (sourceParam === "onboarding" || originParam === "onboarding")) ||
    ((segments[0] === "(modals)" || segments[0] === "modal") &&
      originParam === "onboarding");
  useEffect(() => {
    let mounted = true;
    let subscription = null;
    let unsubscribeGateChange = null;

    const resolveGate = async (sessionUser) => {
      const requestId = gateRequestRef.current + 1;
      gateRequestRef.current = requestId;

      try {
        clearAnonymousSessionIfPresent().catch((error) => {
          console.error("Failed to clear anonymous app session", error);
        });

        const scopedUser = await resolveAccountScopedStores(sessionUser);
        const nextState = await getOnboardingGateState({
          requiresAppleHealthStep: IS_APPLE_HEALTH_SUPPORTED_PLATFORM,
        });
        if (mounted && requestId === gateRequestRef.current) {
          setGateState(nextState);
        }
        if (nextState === "complete") {
          provisionOnboardingSelections(scopedUser).catch((error) => {
            console.error("Failed to provision onboarding selections", error);
          });
        }
      } catch (error) {
        console.error("Failed to resolve onboarding gate", error);
        if (mounted && requestId === gateRequestRef.current) {
          setGateState((current) => current ?? FALLBACK_GATE_STATE);
        }
      } finally {
        if (mounted && requestId === gateRequestRef.current) {
          setGateResolved(true);
        }
      }
    };

    resolveGate();
    unsubscribeGateChange = subscribeOnboardingGateChange(() => {
      resolveGate();
    });

    try {
      const authListener = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          resolveGate(null);
          return;
        }

        resolveGate(session?.user ?? null);
      });
      subscription = authListener?.data?.subscription ?? null;
    } catch (error) {
      console.error("Failed to subscribe to auth state changes", error);
    }

    return () => {
      mounted = false;
      unsubscribeGateChange?.();
      subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(
    () =>
      subscribeNavigationHandoff((nextNavigationHandoff) => {
        setActiveNavigationHandoff(nextNavigationHandoff);
      }),
    [],
  );

  const effectiveGateState = useMemo(() => {
    if (
      !IS_APPLE_HEALTH_SUPPORTED_PLATFORM &&
      gateState === "needs_apple_health"
    ) {
      return "needs_paywall";
    }

    return gateState;
  }, [gateState]);

  const gatedHref = useMemo(() => {
    const gatedRoutes = {
      needs_questions: "/onboarding?mode=first_run",
      needs_rating: "/onboarding?mode=first_run&step=rating",
      needs_apple_health: "/onboarding?mode=first_run&step=apple-health",
      needs_referral_source: "/onboarding?mode=first_run&step=referral-source",
      needs_paywall: "/onboarding?mode=first_run&step=paywall",
      needs_signup: "/login?mode=create",
      needs_login: "/login?mode=login",
    };

    return gatedRoutes[effectiveGateState];
  }, [effectiveGateState]);

  const matchesNavigationHandoffTarget = useMemo(
    () =>
      routeMatchesNavigationHandoffTarget({
        handoff: activeNavigationHandoff,
        isLoginRoute,
        isOnboardingRoute,
        isRetakeOnboarding,
        modeParam,
        segments,
        stepParam,
      }),
    [
      activeNavigationHandoff,
      isLoginRoute,
      isOnboardingRoute,
      isRetakeOnboarding,
      modeParam,
      segments,
      stepParam,
    ],
  );

  const shouldAllowDirectOnboardingHandoffRoute =
    activeNavigationHandoff?.blocking === false &&
    matchesNavigationHandoffTarget;

  const isOnRequiredGateRoute = useMemo(() => {
    if (!effectiveGateState) return false;

    if (effectiveGateState === "complete") {
      return true;
    }

    if (isLoginRoute || isVerifyEmailRoute || isResetPasswordRoute) {
      return true;
    }

    if (
      isOnboardingPaywallRoute &&
      ONBOARDING_PAYWALL_TRANSITION_GATE_STATES.has(effectiveGateState)
    ) {
      return true;
    }

    if (shouldAllowDirectOnboardingHandoffRoute) {
      return true;
    }

    if (effectiveGateState === "needs_login") {
      return isLoginRoute;
    }

    if (effectiveGateState === "needs_questions") {
      return (
        (isOnboardingRoute &&
          !isRetakeOnboarding &&
          (!stepParam || isBuildingOnboardingRoute)) ||
        isOnboardingScannerFlow
      );
    }

    if (effectiveGateState === "needs_signup") {
      return isLoginRoute;
    }

    if (effectiveGateState === "needs_rating") {
      return (
        (isOnboardingRoute &&
          !isRetakeOnboarding &&
          (stepParam === "rating" || isBuildingOnboardingRoute)) ||
        isOnboardingScannerFlow
      );
    }

    if (effectiveGateState === "needs_apple_health") {
      return (
        (isOnboardingRoute &&
          !isRetakeOnboarding &&
          (stepParam === "apple-health" || isBuildingOnboardingRoute)) ||
        isOnboardingScannerFlow
      );
    }

    if (effectiveGateState === "needs_referral_source") {
      return (
        isOnboardingRoute &&
        !isRetakeOnboarding &&
        stepParam === "referral-source"
      );
    }

    if (effectiveGateState === "needs_paywall") {
      return (
        isOnboardingRoute &&
        !isRetakeOnboarding &&
        (stepParam === "paywall" || stepParam === "book-offer")
      );
    }

    if (!isOnboardingRoute || isRetakeOnboarding) {
      return isOnboardingScannerFlow;
    }

    return false;
  }, [
    effectiveGateState,
    isBuildingOnboardingRoute,
    isLoginRoute,
    isOnboardingPaywallRoute,
    isOnboardingRoute,
    isOnboardingScannerFlow,
    isResetPasswordRoute,
    isRetakeOnboarding,
    isVerifyEmailRoute,
    stepParam,
    shouldAllowDirectOnboardingHandoffRoute,
  ]);

  const shouldShowGateOverlay = activeNavigationHandoff?.blocking === true;

  useEffect(() => {
    if (!gateResolved || !activeNavigationHandoff) {
      return;
    }

    if (activeNavigationHandoff.blocking) {
      if (
        activeNavigationHandoff.reason === NAVIGATION_HANDOFFS.AUTH_SUCCESS.reason &&
        effectiveGateState === "complete" &&
        matchesNavigationHandoffTarget
      ) {
        clearNavigationHandoff(activeNavigationHandoff.reason);
        return;
      }

      if (
        activeNavigationHandoff.reason ===
          NAVIGATION_HANDOFFS.ACCOUNT_DELETION.reason &&
        effectiveGateState === "needs_questions" &&
        matchesNavigationHandoffTarget
      ) {
        clearNavigationHandoff(activeNavigationHandoff.reason);
      }

      return;
    }

    if (!matchesNavigationHandoffTarget) {
      return;
    }

    if (
      activeNavigationHandoff.reason ===
        NAVIGATION_HANDOFFS.APPLE_HEALTH_NEXT.reason &&
      effectiveGateState === "needs_referral_source"
    ) {
      clearNavigationHandoff(activeNavigationHandoff.reason);
      return;
    }

    if (
      activeNavigationHandoff.reason ===
        NAVIGATION_HANDOFFS.REFERRAL_SOURCE_NEXT.reason &&
      effectiveGateState === "needs_paywall"
    ) {
      clearNavigationHandoff(activeNavigationHandoff.reason);
    }
  }, [
    activeNavigationHandoff,
    effectiveGateState,
    gateResolved,
    matchesNavigationHandoffTarget,
  ]);

  useEffect(() => {
    if (!gateResolved || !effectiveGateState) return;

    let nextRedirectHref = null;

    if (effectiveGateState === "complete") {
      if ((isOnboardingRoute && !isRetakeOnboarding) || isLoginRoute) {
        if (isAppSubscriptionGateRoute) {
          lastRedirectHrefRef.current = null;
          return;
        }
        nextRedirectHref = "/";
      }
    } else if (!isOnRequiredGateRoute && gatedHref) {
      nextRedirectHref = gatedHref;
    }

    if (!nextRedirectHref) {
      lastRedirectHrefRef.current = null;
      return;
    }

    if (lastRedirectHrefRef.current === nextRedirectHref) {
      return;
    }

    lastRedirectHrefRef.current = nextRedirectHref;
    router.replace(nextRedirectHref);
  }, [
    effectiveGateState,
    gatedHref,
    gateResolved,
    isAppSubscriptionGateRoute,
    isLoginRoute,
    isOnRequiredGateRoute,
    isOnboardingRoute,
    isRetakeOnboarding,
  ]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="login"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="verify-email"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="(modals)"
          options={{ presentation: "modal", headerShown: false }}
        />
        <Stack.Screen name="ai-chat" options={{ headerShown: false }} />
        <Stack.Screen name="scanner" options={{ headerShown: false }} />
        <Stack.Screen name="benefit-ranking" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="connections" options={{ headerShown: false }} />
        <Stack.Screen name="favourites" options={{ headerShown: false }} />
        <Stack.Screen name="health" options={{ headerShown: false }} />
      </Stack>
      <GlobalToast />
      {shouldShowGateOverlay ? <LoadingScreen overlay /> : undefined}
    </>
  );
}

export default function RootLayout() {
  const [exoLoaded] = useExoFonts({
    Exo_300Light,
    Exo_400Regular,
    Exo_500Medium,
    Exo_600SemiBold,
    Exo_700Bold,
  });
  const [exo2Loaded] = useExo2Fonts({
    Exo2_300Light,
    Exo2_400Regular,
    Exo2_500Medium,
    Exo2_600SemiBold,
    Exo2_700Bold,
    Exo2_900Black,
  });
  const [geistMonoLoaded] = useGeistMonoFonts({
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  const fontsLoaded = exoLoaded && exo2Loaded && geistMonoLoaded;

  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync();
  }, [fontsLoaded]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={DefaultTheme}>
          <RevenueCatProvider>
            {fontsLoaded ? <RootNavigator /> : <LoadingScreen />}
          </RevenueCatProvider>
          <StatusBar style="dark" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: "#F7F5EF",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  loadingBrand: {
    color: "#141414",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
