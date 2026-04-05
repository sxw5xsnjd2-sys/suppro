import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { router, Stack } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppFormField,
  AppHeader,
  AppTextInput,
  PrimaryCard,
} from "@/components/common/ui";
import { appTheme, spacing, typography } from "@/theme";
import { supabase } from "@src/lib/supabase";
import {
  isLikelyEmail,
  markAccountCreationComplete,
  normalizeEmail,
  signInWithAppleIdentity,
} from "@src/lib/account";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);

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
    () => !saving && isLikelyEmail(email) && password.length >= 6,
    [email, password, saving]
  );

  const handleEmailLogin = async () => {
    if (!canSubmit || saving) return;

    setErrorMessage("");
    setSaving(true);

    try {
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

  const handleAppleLogin = async () => {
    if (saving) return;

    setErrorMessage("");
    setSaving(true);

    try {
      await signInWithAppleIdentity();
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
      <BackdropScreen
        header={
          <AppHeader
            insetPreset="screen"
            title="Log in"
            titleStyle={styles.headerTitle}
            titleRowStyle={styles.headerTitleRow}
          />
        }
        scrollable={false}
      >
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}
        >
          <View style={styles.container}>
            <PrimaryCard style={styles.card}>
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
                      onPress={handleAppleLogin}
                    />
                    <Text style={styles.appleHelperText}>
                      Use the Apple account linked to your Suppro profile.
                    </Text>
                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>or use email</Text>
                      <View style={styles.dividerLine} />
                    </View>
                  </View>
                ) : null}

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
                    placeholder="Your password"
                    secureTextEntry
                    autoCapitalize="none"
                    textContentType="password"
                    autoComplete="password"
                    accessibilityLabel="Password"
                  />
                </AppFormField>
              </View>

              {errorMessage ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : null}

              <AppButton
                label={saving ? "Signing in..." : "Log in"}
                onPress={handleEmailLogin}
                disabled={!canSubmit}
                variant="primary"
                size="md"
                accessibilityLabel="Log in"
                style={[
                  styles.submitButton,
                  !canSubmit && styles.submitButtonDisabled,
                ]}
                textStyle={styles.submitButtonText}
              />
            </PrimaryCard>
          </View>
        </KeyboardAvoidingView>
      </BackdropScreen>
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 30,
    lineHeight: 24,
    letterSpacing: -0.45,
    fontFamily: typography.fontFamily.headingBlack,
    paddingTop: spacing.md,
  },
  headerTitleRow: {
    alignItems: "flex-start",
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: "100%",
    maxWidth: appTheme.modal.maxWidth,
    alignSelf: "center",
    paddingTop: spacing.sm,
  },
  card: {
    paddingHorizontal: appTheme.card.paddingSpacious,
    paddingVertical: appTheme.card.paddingSpacious,
  },
  form: {
    marginTop: spacing.xs,
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
