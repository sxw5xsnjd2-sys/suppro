import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { supabase } from "@src/lib/supabase";
import { typography } from "@/theme";

const TOKENS = {
  paper: "#FFFFFF",
  ink: "#1F1428",
  primaryDk: "#2E1A52",
  border: "#EAE6F0",
  muted: "#6B5A6E",
  faint: "#A29A9D",
  danger: "#C95757",
  success: "#3C7A4B",
  apple: "#0F0A18",
};

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams();
  const processedRecoveryKeysRef = useRef(new Set());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  const canSubmit =
    recoveryReady &&
    password.length >= 6 &&
    confirmPassword.length >= 6 &&
    !saving;

  const canPressPrimary = success || canSubmit;

  useEffect(() => {
    const firstParam = (value) => (Array.isArray(value) ? value[0] : value);

    const applyRecoverySession = async ({ code, accessToken, refreshToken }) => {
      if (!code && (!accessToken || !refreshToken)) {
        return;
      }

      const recoveryKey = code
        ? `code:${code}`
        : `tokens:${accessToken}:${refreshToken}`;

      if (processedRecoveryKeysRef.current.has(recoveryKey)) {
        return;
      }

      processedRecoveryKeysRef.current.add(recoveryKey);

      setSaving(true);

      try {
        let error = null;

        if (code) {
          const result = await supabase.auth.exchangeCodeForSession(code);
          error = result.error;
        } else {
          const result = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          error = result.error;
        }

        if (error) {
          throw error;
        }

        setRecoveryReady(true);
        setMessage("");
      } catch {
        setRecoveryReady(false);
        setSuccess(false);
        setMessage(
          "This reset link is invalid or has expired. Please request a new one."
        );
      } finally {
        setSaving(false);
      }
    };

    const applyRecoverySessionFromUrl = async (url) => {
      if (!url) return;

      const paramsText = url.includes("#")
        ? url.split("#")[1]
        : url.split("?")[1];

      if (!paramsText) return;

      const urlParams = new URLSearchParams(paramsText);

      await applyRecoverySession({
        code: urlParams.get("code"),
        accessToken: urlParams.get("access_token"),
        refreshToken: urlParams.get("refresh_token"),
      });
    };

    applyRecoverySession({
      code: firstParam(params.code),
      accessToken: firstParam(params.access_token),
      refreshToken: firstParam(params.refresh_token),
    });

    Linking.getInitialURL().then(applyRecoverySessionFromUrl);

    const subscription = Linking.addEventListener("url", ({ url }) => {
      applyRecoverySessionFromUrl(url);
    });

    return () => subscription.remove();
  }, [params.code, params.access_token, params.refresh_token]);

  const handleResetPassword = async () => {
    if (!recoveryReady) {
      setSuccess(false);
      setMessage("Open the password reset link from your email again, then try again.");
      return;
    }

    if (!canSubmit) return;

    if (password !== confirmPassword) {
      setSuccess(false);
      setMessage("Passwords do not match.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw new Error(error.message || "Could not update password.");
      }

      setSuccess(true);
      setMessage("Password updated. You can now log in.");
    } catch (error) {
      setSuccess(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update password. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBackToLogin = async () => {
    setSaving(true);

    try {
      await supabase.auth.signOut();
    } finally {
      setSaving(false);
      router.replace({ pathname: "/login", params: { mode: "login" } });
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            Enter a new password for your Suppro account.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>New password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={TOKENS.faint}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              autoComplete="password-new"
              style={styles.input}
            />
          </View>

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
              style={styles.input}
            />
          </View>

          {message ? (
            <Text style={success ? styles.successText : styles.errorText}>
              {message}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={success ? "Back to login" : "Update password"}
            disabled={!canPressPrimary}
            onPress={success ? handleBackToLogin : handleResetPassword}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed,
              !canPressPrimary && styles.disabled,
            ]}
          >
            <Text style={styles.buttonText}>
              {success ? "Back to login" : saving ? "Updating..." : "Update password"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TOKENS.paper,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    gap: 14,
  },
  title: {
    color: TOKENS.ink,
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center",
    fontFamily: typography.fontFamily.heading,
  },
  subtitle: {
    color: TOKENS.muted,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 14,
    fontFamily: typography.fontFamily.body,
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
  button: {
    marginTop: 8,
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TOKENS.apple,
  },
  buttonText: {
    color: TOKENS.paper,
    fontSize: 16,
    lineHeight: 19,
    fontFamily: typography.fontFamily.bodyBold,
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: TOKENS.primaryDk,
    fontSize: 14,
    fontFamily: typography.fontFamily.bodySemiBold,
  },
  errorText: {
    color: TOKENS.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: typography.fontFamily.body,
  },
  successText: {
    color: TOKENS.success,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontFamily: typography.fontFamily.body,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.45,
  },
});
