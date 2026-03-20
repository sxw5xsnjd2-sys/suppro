import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppFormField,
  AppHeader,
  AppTextInput,
  PrimaryCard,
  StatusPill,
} from "@/components/common/ui";
import { appTheme, radius, spacing, typography } from "@/theme";
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
    <BackdropScreen
      header={
        <AppHeader
          insetPreset="modal"
          title="Create account"
          titleStyle={styles.headerTitle}
          titleRowStyle={styles.headerTitleRow}
          bottomSlot={
            <View style={styles.headerBottom}>
              <StatusPill label="ONBOARDING" style={styles.headerPill} />
              <Text style={styles.headerSubtitle}>
                Sign up once to secure your profile.
              </Text>
            </View>
          }
          rightSlot={
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
          }
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
            <View style={styles.heroCard}>
              <View style={styles.heroGradientWrap}>
                <LinearGradient
                  colors={appTheme.gradients.accent}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroGradient}
                />
              </View>
              <Text style={styles.eyebrow}>Finish account setup</Text>
              <Text style={styles.title}>One account. Your profile stays with you.</Text>
              <Text style={styles.subtitle}>
                You only need to do this once after onboarding. Your questionnaire
                answers will stay linked to this account.
              </Text>
            </View>

            <View style={styles.form}>
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

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

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
      </KeyboardAvoidingView>
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 24,
    letterSpacing: -0.45,
    fontFamily: typography.fontFamily.headingBlack,
  },
  headerTitleRow: {
    alignItems: "flex-start",
  },
  headerBottom: {
    marginTop: 8,
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
    maxWidth: appTheme.modal.maxWidth,
    alignSelf: "center",
    paddingTop: spacing.sm,
  },
  card: {
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
