import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import { colors, spacing, radius, shadows } from "@/theme";
import { supabase } from "@src/lib/supabase";
import {
  SIGNUP_COMPLETED_STORAGE_KEY,
  getQuestionnaireAnswers,
  parseHeightCm,
  parseNumericField,
  parseWeightKg,
} from "@src/lib/onboarding";

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isLikelyEmail(value) {
  return /^\S+@\S+\.\S+$/.test(normalizeEmail(value));
}

function toIntegerOrNull(value) {
  const parsed = parseNumericField(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function ageFromDateOfBirth(dateOfBirth) {
  if (!dateOfBirth || typeof dateOfBirth !== "string") return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  if (!year || !month || !day) return null;
  const birthDate = new Date(year, month - 1, day);
  if (Number.isNaN(birthDate.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  const dayDiff = now.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function questionnaireHeightCm(answers) {
  if (!answers || typeof answers !== "object") return null;
  if (answers.heightUnit === "cm") {
    const cm = parseNumericField(answers.heightCm);
    return Number.isFinite(cm) && cm > 0 ? cm : null;
  }
  if (answers.heightUnit === "ft_in") {
    const feet = parseNumericField(answers.heightFeet) || 0;
    const inches = parseNumericField(answers.heightInches) || 0;
    const totalInches = feet * 12 + inches;
    if (!Number.isFinite(totalInches) || totalInches <= 0) return null;
    return Number((totalInches * 2.54).toFixed(1));
  }
  return parseHeightCm(answers.height);
}

function questionnaireWeightKg(answers) {
  if (!answers || typeof answers !== "object") return null;
  const value = parseNumericField(answers.weightValue);
  if (Number.isFinite(value) && value > 0) {
    if (answers.weightUnit === "kg") return Number(value.toFixed(1));
    if (answers.weightUnit === "lb") return Number((value * 0.45359237).toFixed(1));
  }
  return parseWeightKg(answers.weight);
}

export default function SignUpModal() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState(null);

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
      const mergedName = name.trim() || String(questionnaireAnswers?.name || "").trim();
      const profilePayload = {
        id: userId,
        name: mergedName || null,
        age:
          ageFromDateOfBirth(questionnaireAnswers?.dateOfBirth) ??
          toIntegerOrNull(questionnaireAnswers?.age),
        sex: questionnaireAnswers?.sexAtBirth
          ? String(questionnaireAnswers.sexAtBirth)
          : null,
        height_cm: questionnaireHeightCm(questionnaireAnswers),
        weight_kg: questionnaireWeightKg(questionnaireAnswers),
      };

      if (data?.session) {
        const { error: upsertError } = await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "id" });
        profileWriteError = upsertError;
      }

      await AsyncStorage.setItem(SIGNUP_COMPLETED_STORAGE_KEY, "true");

      const emailConfirmationNeeded = !data?.session;
      const successMessage = emailConfirmationNeeded
        ? "Account created. Check your email to confirm your account, then sign in."
        : profileWriteError
        ? "Account created. We could not sync your profile fields right now, but you can continue using the app."
        : "Account created and profile saved.";

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

  return (
    <Screen
      header={
        <Header
          title="Create Account"
          subtitle="Sign up once to secure your profile"
          rightSlot={
            <Pressable onPress={() => router.back()} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.icon.primary} />
            </Pressable>
          }
        />
      }
      scrollable={false}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Finish account setup</Text>
          <Text style={styles.subtitle}>
            You only need to do this once after onboarding.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Name (optional)</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.label}>Confirm password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat password"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            onPress={handleSignUp}
            disabled={!canSubmit}
            style={[
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
            ]}
          >
            <Text style={styles.submitButtonText}>
              {saving ? "Creating account..." : "Create account"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: spacing.sm,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  card: {
    marginTop: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700",
    color: colors.text.primary,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  form: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  label: {
    marginTop: spacing.xs,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    color: colors.text.primary,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.status.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  submitButton: {
    marginTop: spacing.md,
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand.primary,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.text.inverse,
    fontSize: 16,
    fontWeight: "700",
  },
});
