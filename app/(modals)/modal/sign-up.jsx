import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppFormField,
  AppHeader,
  AppTextInput,
  PrimaryCard,
} from "@/components/common/ui";
import { appTheme, radius, spacing, typography } from "@/theme";
import { supabase } from "@src/lib/supabase";
import {
  clearOnboardingDraft,
  getQuestionnaireAnswers,
} from "@src/lib/onboarding";
import {
  buildProfilePayload,
  isLikelyEmail,
  markAccountCreationComplete,
  normalizeEmail,
  signInWithAppleIdentity,
} from "@src/lib/account";

export function SignUpScreen({ standalone = false, mode = "first_run" } = {}) {
  const canDismiss = !standalone || mode === "retake";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadQuestionnaire = async () => {
      const data = await getQuestionnaireAnswers();
      if (!mounted || !data) return;
      setQuestionnaireAnswers(data);
      if (typeof data.name === "string" && data.name.trim()) {
        setName(data.name.trim());
      }
    };
    loadQuestionnaire();
    return () => {
      mounted = false;
    };
  }, []);

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

  const canSubmit = useMemo(
    () =>
      !saving &&
      isLikelyEmail(email) &&
      password.length >= 6 &&
      password === confirmPassword,
    [confirmPassword, email, password, saving]
  );

  const handleSignUp = async () => {
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

      let profileWriteError = null;
      const profilePayload = buildProfilePayload({
        questionnaireAnswers,
        fallbackName: name,
        userId,
      });

      if (data?.session) {
        const { error: upsertError } = await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "id" });
        profileWriteError = upsertError;
      }

      await markAccountCreationComplete();
      await clearOnboardingDraft();

      const emailConfirmationNeeded = !data?.session;
      const successMessage = emailConfirmationNeeded
        ? "Account created. Check your email to confirm your account, then sign in."
        : profileWriteError
        ? "Account created. We could not sync your profile fields right now, but you can continue using the app."
        : "Account created and profile saved.";

      if (standalone) {
        router.replace(data?.session ? "/" : "/login");
        return;
      }

      Alert.alert("Sign up complete", successMessage, [
        { text: "Continue", onPress: () => router.back() },
      ]);
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

  const handleAppleSignUp = async () => {
    if (saving) return;
    setErrorMessage("");
    setSaving(true);

    try {
      const { appleName, credential, data, user } =
        await signInWithAppleIdentity();
      const userId = user.id;
      const fallbackName = appleName || name;
      let profileWriteError = null;

      if (data?.user && appleName) {
        const { error: userUpdateError } = await supabase.auth.updateUser({
          data: {
            full_name: appleName,
            given_name: credential.fullName?.givenName ?? null,
            family_name: credential.fullName?.familyName ?? null,
          },
        });

        if (userUpdateError) {
          profileWriteError = userUpdateError;
        }
      }

      const profilePayload = buildProfilePayload({
        questionnaireAnswers,
        fallbackName,
        userId,
      });

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (upsertError && !profileWriteError) {
        profileWriteError = upsertError;
      }

      await markAccountCreationComplete();
      await clearOnboardingDraft();

      const successMessage = profileWriteError
        ? "Account created. We could not sync your profile fields right now, but you can continue using the app."
        : "Account created and profile saved.";

      if (standalone) {
        router.replace("/");
        return;
      }

      Alert.alert("Sign up complete", successMessage, [
        { text: "Continue", onPress: () => router.back() },
      ]);
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
    <BackdropScreen
      header={
        <AppHeader
          insetPreset="modal"
          topInsetOffset={0}
          bottomPadding={8}
          title="Create account"
          titleStyle={styles.headerTitle}
          titleRowStyle={styles.headerTitleRow}
          rightSlot={
            canDismiss ? (
              <AppButton
                onPress={() => router.back()}
                variant="overlay"
                size="icon"
                accessibilityLabel="Close create account"
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={appTheme.colors.textStrong}
                />
              </AppButton>
            ) : null
          }
        />
      }
      bottomInsetOffset={24}
      minBottomPadding={24}
      scrollable={false}
    >
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardContainer}>
            <PrimaryCard style={styles.card}>
              <View style={styles.heroCard}>
                <View style={styles.heroGradientWrap}>
                  <LinearGradient
                    colors={appTheme.gradients.accent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroGradient}
                  />
                </View>
                <Text style={styles.title}>Finish account setup</Text>
                <Text style={styles.subtitle}>
                  To get your free supplement plan
                </Text>
              </View>

              <View style={styles.form}>
                {appleAvailable ? (
                  <View style={styles.appleSection}>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={
                        AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                      }
                      buttonStyle={
                        AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={16}
                      style={styles.appleButton}
                      onPress={handleAppleSignUp}
                    />
                    <Text style={styles.appleHelperText}>
                      Use your Apple ID to create your account instantly.
                    </Text>
                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>or use email</Text>
                      <View style={styles.dividerLine} />
                    </View>
                  </View>
                ) : null}

                <AppFormField label="Name (optional)" style={styles.field}>
                  <AppTextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    autoCapitalize="words"
                    accessibilityLabel="Name"
                  />
                </AppFormField>

                <AppFormField label="Email" style={styles.field}>
                  <AppTextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    autoComplete="email"
                    accessibilityLabel="Email"
                  />
                </AppFormField>

                <AppFormField label="Password" style={styles.field}>
                  <AppTextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 6 characters"
                    secureTextEntry
                    autoCapitalize="none"
                    textContentType="newPassword"
                    autoComplete="password-new"
                    accessibilityLabel="Password"
                  />
                </AppFormField>

                <AppFormField label="Confirm password" style={styles.field}>
                  <AppTextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Repeat password"
                    secureTextEntry
                    autoCapitalize="none"
                    textContentType="password"
                    autoComplete="password-new"
                    accessibilityLabel="Confirm password"
                  />
                </AppFormField>
              </View>

              {errorMessage ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : null}

              <AppButton
                label={saving ? "Creating account..." : "Create account"}
                onPress={handleSignUp}
                disabled={!canSubmit}
                variant="primary"
                size="md"
                accessibilityLabel="Create account"
                style={[
                  styles.submitButton,
                  !canSubmit && styles.submitButtonDisabled,
                ]}
                textStyle={styles.submitButtonText}
              />
            </PrimaryCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BackdropScreen>
  );
}

export default function SignUpModal() {
  return <SignUpScreen />;
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: -0.45,
    fontFamily: typography.fontFamily.headingBlack,
  },
  headerTitleRow: {
    alignItems: "flex-start",
  },
  headerPill: {
    alignSelf: "flex-start",
  },
  headerSubtitle: {
    marginTop: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  cardContainer: {
    flex: 1,
    width: "100%",
    maxWidth: appTheme.modal.maxWidth,
    alignSelf: "center",
  },
  card: {
    flexGrow: 1,
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  heroCard: {
    overflow: "hidden",
    borderRadius: radius.md,
    backgroundColor: appTheme.colors.surfaceAccent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  heroGradientWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  heroGradient: {
    flex: 1,
    opacity: 0.68,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textStrong,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  title: {
    marginTop: spacing.xs,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textHeading,
    letterSpacing: -0.45,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textBody,
  },
  form: {
    marginTop: spacing.lg,
  },
  appleSection: {
    marginBottom: spacing.sm,
  },
  appleButton: {
    width: "100%",
    height: 54,
  },
  appleHelperText: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: appTheme.colors.borderSubtle,
  },
  dividerText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  field: {
    marginBottom: spacing.md,
  },
  errorText: {
    marginTop: spacing.sm,
    color: appTheme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
  },
  submitButton: {
    width: "100%",
    marginTop: spacing.md,
    minHeight: 54,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
  },
});
