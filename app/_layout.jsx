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
import { syncSupplementsStoreAccountScope } from "@/features/supplements/store";
import { GlobalToast } from "@/components/common/ui/GlobalToast";
import {
  getOnboardingGateState,
  subscribeOnboardingGateChange,
} from "@src/lib/onboarding";
import { provisionOnboardingSelections } from "@src/lib/onboardingProvisioning";
import { supabase } from "@src/lib/supabase";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: "(tabs)",
};

const FALLBACK_GATE_STATE = "needs_questions";

async function resolveAccountScopedStores(sessionUser) {
  let user = sessionUser;

  if (user === undefined) {
    const { data } = await supabase.auth.getSession();
    user = data?.session?.user ?? null;
  }

  await syncSupplementsStoreAccountScope(user);
  return user;
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

function RootNavigator() {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const [gateState, setGateState] = useState(null);
  const [gateResolved, setGateResolved] = useState(false);
  const gateRequestRef = useRef(0);
  const isOnboardingRoute = segments[0] === "onboarding";
  const isLoginRoute = segments[0] === "login";
  const isVerifyEmailRoute = segments[0] === "verify-email";
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
        const scopedUser = await resolveAccountScopedStores(sessionUser);
        const nextState = await getOnboardingGateState();
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
      const authListener = supabase.auth.onAuthStateChange(
        (_event, session) => {
          resolveGate(session?.user ?? null);
        }
      );
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

  const gatedHref = useMemo(() => {
    const gatedRoutes = {
      needs_questions: "/onboarding?mode=first_run",
      needs_paywall: "/onboarding?mode=first_run&step=paywall",
      needs_signup: "/login?mode=create",
      needs_login: "/login?mode=login",
    };

    return gatedRoutes[gateState];
  }, [gateState]);

  const isOnRequiredGateRoute = useMemo(() => {
    if (!gateState) return false;

    if (gateState === "complete") {
      return true;
    }

    if (isLoginRoute || isVerifyEmailRoute) {
      return true;
    }

    if (gateState === "needs_login") {
      return true;
    }

    if (gateState === "needs_questions") {
      return (
        (isOnboardingRoute &&
          !isRetakeOnboarding &&
          (!stepParam || isBuildingOnboardingRoute)) ||
        isOnboardingScannerFlow
      );
    }

    if (gateState === "needs_signup") {
      return isLoginRoute;
    }

    if (gateState === "needs_paywall") {
      return (
        (isOnboardingRoute &&
          !isRetakeOnboarding &&
          (stepParam === "paywall" || isBuildingOnboardingRoute)) ||
        (isLoginRoute && modeParam === "login")
      );
    }

    if (!isOnboardingRoute || isRetakeOnboarding) {
      return isOnboardingScannerFlow;
    }

    return false;
  }, [
    gateState,
    isBuildingOnboardingRoute,
    isLoginRoute,
    isOnboardingRoute,
    isOnboardingScannerFlow,
    isRetakeOnboarding,
    isVerifyEmailRoute,
    modeParam,
    stepParam,
  ]);

  const isRedirectingToAllowedRoute = useMemo(() => {
    if (!gateResolved || !gateState) {
      return true;
    }

    if (gateState === "complete") {
      return (isOnboardingRoute && !isRetakeOnboarding) || isLoginRoute;
    }

    return !isOnRequiredGateRoute;
  }, [
    gateResolved,
    gateState,
    isLoginRoute,
    isOnRequiredGateRoute,
    isOnboardingRoute,
    isRetakeOnboarding,
  ]);

  useEffect(() => {
    if (!gateResolved || !gateState) return;

    if (gateState === "complete") {
      if ((isOnboardingRoute && !isRetakeOnboarding) || isLoginRoute) {
        router.replace("/");
      }
      return;
    }

    if (!isOnRequiredGateRoute && gatedHref) {
      router.replace(gatedHref);
    }
  }, [
    gateState,
    gatedHref,
    gateResolved,
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
        <Stack.Screen name="scanner" options={{ headerShown: false }} />
        <Stack.Screen name="benefit-ranking" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="connections" options={{ headerShown: false }} />
        <Stack.Screen name="favourites" options={{ headerShown: false }} />
        <Stack.Screen name="health" options={{ headerShown: false }} />
      </Stack>
      <GlobalToast />
      {isRedirectingToAllowedRoute ? <LoadingScreen overlay /> : undefined}
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
          {fontsLoaded ? <RootNavigator /> : <LoadingScreen />}
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
