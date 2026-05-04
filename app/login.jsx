import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { typography } from "@/theme";
import { supabase } from "@src/lib/supabase";
import {
  clearOnboardingDraft,
  getQuestionnaireAnswers,
  hasCompletedOnboardingPremium,
  hasCompletedQuestionnaire,
} from "@src/lib/onboarding";
import {
  buildProfilePayload,
  isLikelyEmail,
  markAccountCreationComplete,
  normalizeEmail,
  signInWithAppleIdentity,
} from "@src/lib/account";

const HERO_IMAGE = require("@/assets/images/account-hero.png");

const TOKENS = {
  paper: "#FFFFFF",
  ink: "#1F1428",
  primaryDk: "#2E1A52",
  soft: "#E5E1F9",
  blush: "#F6E2E1",
  softer: "#F4EFFA",
  border: "#EAE6F0",
  muted: "#6B5A6E",
  faint: "#A29A9D",
  apple: "#0F0A18",
  danger: "#C95757",
};

const TAB_WIDTH = 282;
const TAB_HEIGHT = 58;
const TAB_PADDING = 5;
const TAB_GAP = 4;
const TAB_BUTTON_WIDTH = (TAB_WIDTH - TAB_PADDING * 2 - TAB_GAP) / 2;
const TAB_BUTTON_HEIGHT = TAB_HEIGHT - TAB_PADDING * 2;
const TAB_PILL_TRAVEL = TAB_BUTTON_WIDTH + TAB_GAP;

function modeFromParam(value) {
  const normalized = Array.isArray(value) ? value[0] : value;

  // 👇 FORCE login as default
  if (!normalized) return "login";

  return normalized === "login" ? "login" : "create";
}

function AccountActionButton({
  icon,
  label,
  variant = "light",
  onPress,
  disabled = false,
}) {
  const isDark = variant === "dark";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        isDark ? styles.actionButtonDark : styles.actionButtonLight,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.actionButtonText,
          isDark ? styles.actionButtonTextDark : styles.actionButtonTextLight,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function LoginScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mode, setMode] = useState(() => modeFromParam(params.mode));
  const [questionnaireComplete, setQuestionnaireComplete] = useState(null);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState(null);
  const [emailFormVisible, setEmailFormVisible] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);
  const tabAnimation = useRef(new Animated.Value(0)).current;

  const isCreateMode = mode === "create";
  const heroHeight = Math.min(360, Math.max(292, height * 0.42));

  useEffect(() => {
    let mounted = true;

    const checkAppleAvailability = async () => {
      if (Platform.OS !== "ios") return;

      const available = await AppleAuthentication.isAvailableAsync();
      if (mounted) {
        setAppleAvailable(available);
      }
    };

    checkAppleAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setMode(modeFromParam(params.mode));
    setErrorMessage("");
    setEmailFormVisible(false);
  }, [params.mode]);

  useEffect(() => {
    let mounted = true;

    const resolveQuestionnaireState = async () => {
      const [completed, answers] = await Promise.all([
        hasCompletedQuestionnaire(),
        getQuestionnaireAnswers(),
      ]);
      if (mounted) {
        setQuestionnaireComplete(completed);
        setQuestionnaireAnswers(answers);
        if (typeof answers?.name === "string" && answers.name.trim()) {
          setName(answers.name.trim());
        }
      }
    };

    resolveQuestionnaireState();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(tabAnimation, {
      toValue: isCreateMode ? 0 : TAB_PILL_TRAVEL,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isCreateMode, tabAnimation]);

  const canSubmit = useMemo(
    () =>
      !saving &&
      isLikelyEmail(email) &&
      password.length >= 6 &&
      (!isCreateMode || password === confirmPassword),
    [confirmPassword, email, isCreateMode, password, saving]
  );

  const copy = isCreateMode
    ? {
        title: "Create your account",
        subtitle:
          "Save your stack, get personalised recommendations, and track how you feel over time.",
        appleLabel: "Continue with Apple",
        emailLabel: "Sign up with email",
      }
    : {
        title: "Welcome back",
        subtitle:
          "Pick up right where you left off - your stack and history are waiting.",
        appleLabel: "Sign in with Apple",
        emailLabel: "Sign in with email",
      };

  const redirectToOnboarding = () => {
    router.replace("/onboarding?mode=first_run");
  };

  const ensureCanCreateAccount = async () => {
    const [questionnaireDone, premiumDone] = await Promise.all([
      hasCompletedQuestionnaire(),
      hasCompletedOnboardingPremium(),
    ]);

    setQuestionnaireComplete(questionnaireDone);

    if (!questionnaireDone) {
      setQuestionnaireComplete(false);
      redirectToOnboarding();
      return false;
    }

    if (!premiumDone) {
      setQuestionnaireComplete(true);
      router.replace(
        "/onboarding?mode=first_run&step=paywall&origin=create"
      );
      return false;
    }

    if (questionnaireComplete !== true) {
      setQuestionnaireComplete(true);
    }

    return true;
  };

  const ensureCanLogIn = async () => {
    return true;
  };

  const selectMode = async (nextMode) => {
    if (nextMode === "create" && !(await ensureCanCreateAccount())) {
      return;
    }

    setMode(nextMode);
    setErrorMessage("");
    setEmailFormVisible(false);
  };

  const handleEmailButton = async () => {
    setErrorMessage("");

    if (isCreateMode) {
      if (!(await ensureCanCreateAccount())) {
        return;
      }
    }

    setEmailFormVisible(true);
  };

  const handleEmailLogin = async () => {
    if (!canSubmit || saving) return;

    setErrorMessage("");
    setSaving(true);

    try {
      if (!(await ensureCanLogIn())) {
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });

      if (error) {
        throw new Error(error.message || "Could not sign in.");
      }

      await markAccountCreationComplete();
      router.replace("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not sign in. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEmailSignUp = async () => {
    if (!canSubmit || saving) return;

    setErrorMessage("");
    setSaving(true);

    try {
      const payloadEmail = normalizeEmail(email);
      const { data, error } = await supabase.auth.signUp({
        email: payloadEmail,
        password,
      });

      if (error) {
        throw new Error(error.message || "Could not create account.");
      }

      const userId = data?.user?.id;
      if (!userId) {
        throw new Error("Sign-up did not return a user id.");
      }

      const profilePayload = buildProfilePayload({
        questionnaireAnswers,
        fallbackName: name,
        userId,
      });

      if (data?.session) {
        await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "id" });
        await markAccountCreationComplete();
        await clearOnboardingDraft();
        router.replace("/");
        return;
      }

      router.replace({
        pathname: "/verify-email",
        params: { email: payloadEmail },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not complete sign up. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAppleAuth = async () => {
    if (saving) return;

    setErrorMessage("");
    setSaving(true);

    try {
      if (isCreateMode && !(await ensureCanCreateAccount())) {
        return;
      }

      if (!isCreateMode && !(await ensureCanLogIn())) {
        return;
      }

      const { appleName, credential, data, user } =
        await signInWithAppleIdentity({
          requireExistingAccount: !isCreateMode,
        });

      if (isCreateMode) {
        const userId = user.id;
        const fallbackName = appleName || name;

        if (data?.user && appleName) {
          await supabase.auth.updateUser({
            data: {
              full_name: appleName,
              given_name: credential.fullName?.givenName ?? null,
              family_name: credential.fullName?.familyName ?? null,
            },
          });
        }

        const profilePayload = buildProfilePayload({
          questionnaireAnswers,
          fallbackName,
          userId,
        });

        await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "id" });

        await clearOnboardingDraft();
      }

      await markAccountCreationComplete();
      router.replace("/");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not complete Apple sign in. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 10, 24) },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, { height: heroHeight }]}>
            <Image
              source={HERO_IMAGE}
              style={styles.heroImage}
              contentFit="cover"
              contentPosition={{ top: "25%", left: "50%" }}
              accessibilityLabel="Person scanning a supplement bottle in a pastel pantry"
            />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0)", TOKENS.paper]}
              style={styles.heroFade}
            />
          </View>

          <View style={styles.body}>
            <View style={styles.segmentedControl}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.activeTabPill,
                  { transform: [{ translateX: tabAnimation }] },
                ]}
              >
                <LinearGradient
                  colors={[TOKENS.soft, TOKENS.blush]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activeTabGradient}
                />
              </Animated.View>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: isCreateMode }}
                onPress={() => selectMode("create")}
                style={styles.tabButton}
              >
                <Text
                  style={[
                    styles.tabText,
                    isCreateMode
                      ? styles.tabTextActive
                      : styles.tabTextInactive,
                  ]}
                >
                  Create{"\n"}account
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: !isCreateMode }}
                onPress={() => selectMode("login")}
                style={styles.tabButton}
              >
                <Text
                  style={[
                    styles.tabText,
                    !isCreateMode
                      ? styles.tabTextActive
                      : styles.tabTextInactive,
                  ]}
                >
                  Log{"\n"}in
                </Text>
              </Pressable>
            </View>

            <View style={styles.titleBlock}>
              <Text style={styles.title}>{copy.title}</Text>
              <Text style={styles.subtitle}>{copy.subtitle}</Text>
            </View>

            <View style={styles.authArea}>
              {!emailFormVisible ? (
                <View style={styles.buttonStack}>
                  {appleAvailable ? (
                    <AccountActionButton
                      label={copy.appleLabel}
                      variant="dark"
                      disabled={saving}
                      onPress={handleAppleAuth}
                      icon={
                        <Ionicons
                          name="logo-apple"
                          size={22}
                          color={TOKENS.paper}
                        />
                      }
                    />
                  ) : null}
                  <AccountActionButton
                    label={copy.emailLabel}
                    disabled={saving}
                    onPress={handleEmailButton}
                    icon={
                      <Ionicons
                        name="mail-outline"
                        size={22}
                        color={TOKENS.ink}
                      />
                    }
                  />
                </View>
              ) : (
                <View style={styles.form}>
                  {isCreateMode ? (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Name (optional)</Text>
                      <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="Your name"
                        placeholderTextColor={TOKENS.faint}
                        autoCapitalize="words"
                        textContentType="name"
                        autoComplete="name"
                        accessibilityLabel="Name"
                        style={styles.input}
                      />
                    </View>
                  ) : null}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Email</Text>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={TOKENS.faint}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="emailAddress"
                      autoComplete="email"
                      accessibilityLabel="Email"
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Password</Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder={
                        isCreateMode ? "At least 6 characters" : "Your password"
                      }
                      placeholderTextColor={TOKENS.faint}
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType={
                        isCreateMode ? "newPassword" : "password"
                      }
                      autoComplete={
                        isCreateMode ? "password-new" : "password"
                      }
                      accessibilityLabel="Password"
                      style={styles.input}
                    />
                  </View>
                  {isCreateMode ? (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Confirm password</Text>
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="Repeat password"
                        placeholderTextColor={TOKENS.faint}
                        secureTextEntry
                        autoCapitalize="none"
                        textContentType="password"
                        autoComplete="password-new"
                        accessibilityLabel="Confirm password"
                        style={styles.input}
                      />
                    </View>
                  ) : null}
                  {errorMessage ? (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  ) : null}
                  <AccountActionButton
                    label={
                      saving
                        ? isCreateMode
                          ? "Creating account..."
                          : "Signing in..."
                        : isCreateMode
                          ? "Create account"
                          : "Log in"
                    }
                    variant="dark"
                    disabled={!canSubmit}
                    onPress={isCreateMode ? handleEmailSignUp : handleEmailLogin}
                    icon={
                      <Ionicons
                        name="mail-outline"
                        size={22}
                        color={TOKENS.paper}
                      />
                    }
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      appleAvailable ? "Use Apple instead" : "Back to options"
                    }
                    onPress={() => {
                      setErrorMessage("");
                      setEmailFormVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.secondaryTextButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.secondaryTextButtonLabel}>
                      {appleAvailable ? "Use Apple instead" : "Back to options"}
                    </Text>
                  </Pressable>
                </View>
              )}

              {!emailFormVisible && errorMessage ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : null}
            </View>

            <View style={styles.footer}>
              {isCreateMode ? (
                <Text style={styles.termsText}>
                  By continuing you agree to our{" "}
                  <Text style={styles.termsLink}>Terms</Text> &{" "}
                  <Text style={styles.termsLink}>Privacy</Text>.
                </Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Switch to create account"
                  onPress={() => selectMode("create")}
                  style={({ pressed }) => [
                    styles.footerLinkButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.footerPrompt}>
                    {"Don't have an account? "}
                    <Text style={styles.footerPromptLink}>Sign up</Text>
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TOKENS.paper,
  },
  scroll: {
    flex: 1,
    backgroundColor: TOKENS.paper,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: TOKENS.paper,
  },
  hero: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: TOKENS.softer,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 44,
  },
  body: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: TOKENS.paper,
  },
  segmentedControl: {
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    marginTop: 22,
    padding: TAB_PADDING,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: TOKENS.softer,
    flexDirection: "row",
    gap: TAB_GAP,
  },
  activeTabPill: {
    position: "absolute",
    top: TAB_PADDING,
    left: TAB_PADDING,
    width: TAB_BUTTON_WIDTH,
    height: TAB_BUTTON_HEIGHT,
    borderRadius: 999,
    shadowColor: "#5C3FA8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
    overflow: "hidden",
  },
  activeTabGradient: {
    flex: 1,
    borderRadius: 999,
  },
  tabButton: {
    width: TAB_BUTTON_WIDTH,
    height: TAB_BUTTON_HEIGHT,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tabText: {
    fontSize: 15.5,
    lineHeight: 17,
    textAlign: "center",
    fontFamily: typography.fontFamily.bodyBold,
  },
  tabTextActive: {
    color: TOKENS.ink,
  },
  tabTextInactive: {
    color: TOKENS.muted,
  },
  titleBlock: {
    width: "100%",
    maxWidth: 342,
    alignItems: "center",
    marginTop: 36,
  },
  title: {
    color: TOKENS.ink,
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center",
    letterSpacing: -0.4,
    fontFamily: typography.fontFamily.heading,
  },
  subtitle: {
    marginTop: 12,
    color: TOKENS.muted,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: "center",
    fontFamily: typography.fontFamily.body,
  },
  authArea: {
    width: "100%",
    maxWidth: 342,
    marginTop: 34,
  },
  buttonStack: {
    gap: 10,
  },
  actionButton: {
    width: "100%",
    minHeight: 54,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  actionButtonDark: {
    backgroundColor: TOKENS.apple,
    shadowColor: TOKENS.apple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  actionButtonLight: {
    backgroundColor: TOKENS.paper,
    borderWidth: 1,
    borderColor: TOKENS.border,
  },
  actionButtonText: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 19,
    textAlign: "center",
    fontFamily: typography.fontFamily.bodyBold,
  },
  actionButtonTextDark: {
    color: TOKENS.paper,
  },
  actionButtonTextLight: {
    color: TOKENS.ink,
  },
  form: {
    gap: 12,
  },
  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    color: TOKENS.ink,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: typography.fontFamily.bodySemiBold,
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: TOKENS.paper,
    paddingHorizontal: 16,
    color: TOKENS.ink,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
  },
  errorText: {
    color: TOKENS.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: typography.fontFamily.bodyMedium,
  },
  secondaryTextButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryTextButtonLabel: {
    color: TOKENS.primaryDk,
    fontSize: 14,
    lineHeight: 18,
    textDecorationLine: "underline",
    fontFamily: typography.fontFamily.bodyBold,
  },
  footer: {
    width: "100%",
    maxWidth: 342,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  termsText: {
    color: TOKENS.faint,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: "center",
    fontFamily: typography.fontFamily.body,
  },
  termsLink: {
    color: TOKENS.muted,
    textDecorationLine: "underline",
  },
  footerLinkButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  footerPrompt: {
    color: TOKENS.ink,
    fontSize: 14.5,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: typography.fontFamily.bodyBold,
  },
  footerPromptLink: {
    color: TOKENS.primaryDk,
    textDecorationLine: "underline",
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.5,
  },
});
