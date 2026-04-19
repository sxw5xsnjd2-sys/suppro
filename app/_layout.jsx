import { useEffect, useMemo, useState } from "react";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, router, useGlobalSearchParams, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
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
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getOnboardingGateState } from "@src/lib/onboarding";
import { supabase } from "@src/lib/supabase";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootNavigator() {
  const segments = useSegments();
  const params = useGlobalSearchParams();
  const [gateState, setGateState] = useState(null);
  const segmentKey = segments.join("/");
  const isOnboardingRoute = segments[0] === "onboarding";
  const isLoginRoute = segments[0] === "login";
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const isRetakeOnboarding = isOnboardingRoute && modeParam === "retake";

  useEffect(() => {
    let mounted = true;

    const resolveGate = async () => {
      const nextState = await getOnboardingGateState();
      if (mounted) {
        setGateState(nextState);
      }
    };

    resolveGate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      resolveGate();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const resolveGate = async () => {
      const nextState = await getOnboardingGateState();
      if (mounted) {
        setGateState(nextState);
      }
    };

    resolveGate();

    return () => {
      mounted = false;
    };
  }, [segmentKey]);

  const gatedHref = useMemo(() => {
    if (gateState === "needs_questions") {
      return "/onboarding?mode=first_run";
    }

    if (gateState === "needs_signup") {
      return "/onboarding?mode=first_run&step=account";
    }

    if (gateState === "needs_login") {
      return "/login";
    }

    return null;
  }, [gateState]);

  useEffect(() => {
    if (!gateState) return;

    if (gateState === "complete") {
      if ((isOnboardingRoute && !isRetakeOnboarding) || isLoginRoute) {
        router.replace("/");
      }
      return;
    }

    if (
      gateState === "needs_login" &&
      !isLoginRoute &&
      gatedHref
    ) {
      router.replace(gatedHref);
      return;
    }

    if (
      gateState !== "needs_login" &&
      (!isOnboardingRoute || isRetakeOnboarding) &&
      gatedHref
    ) {
      router.replace(gatedHref);
    }
  }, [
    gateState,
    gatedHref,
    isLoginRoute,
    isOnboardingRoute,
    isRetakeOnboarding,
  ]);

  if (!gateState) return null;

  if (
    gateState === "complete" &&
    ((isOnboardingRoute && !isRetakeOnboarding) || isLoginRoute)
  ) {
    return null;
  }

  if (
    gateState === "needs_login" &&
    !isLoginRoute
  ) {
    return null;
  }

  if (
    gateState !== "complete" &&
    gateState !== "needs_login" &&
    (!isOnboardingRoute || isRetakeOnboarding)
  ) {
    return null;
  }

  return (
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
        name="(modals)"
        options={{ presentation: "modal", headerShown: false }}
      />
      <Stack.Screen name="scanner" options={{ headerShown: false }} />
      <Stack.Screen name="benefit-ranking" options={{ headerShown: false }} />
      <Stack.Screen
        name="supplement-rankings"
        options={{ headerShown: false }}
      />
      <Stack.Screen name="account" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="favourites" options={{ headerShown: false }} />
    </Stack>
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

  const fontsLoaded = exoLoaded && exo2Loaded;

  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={DefaultTheme}>
        <RootNavigator />
        <StatusBar style="dark" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
