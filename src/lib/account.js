import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { supabase } from "./supabase";
import {
  parseHeightCm,
  parseNumericField,
  parseWeightKg,
  QUESTIONNAIRE_STORAGE_KEY,
  ONBOARDING_DRAFT_STORAGE_KEY,
  ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY,
  notifyOnboardingGateChange,
  SIGNUP_COMPLETED_STORAGE_KEY,
  SIGNUP_PROMPTED_STORAGE_KEY,
} from "./onboarding";

export const SUPPLEMENTS_STORAGE_KEY_PREFIX = "supplement-store";
export const HEALTH_STORAGE_KEY = "health-store";
export const CHAT_STORAGE_KEY = "suppro.chatStore.v1";
export const HEART_FLAGS_STORAGE_KEY = "supplement-heart-flags";
export const AI_SUMMARY_CACHE_STORAGE_KEY = "suppro.stats.aiSummary.v1";
export const DELETE_ACCOUNT_FUNCTION_NAME = "delete-account";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value) {
  return trimString(value).toLowerCase();
}

export function isLikelyEmail(value) {
  return /^\S+@\S+\.\S+$/.test(normalizeEmail(value));
}

export function getUserAuthProvider(user) {
  const primaryProvider = trimString(user?.app_metadata?.provider).toLowerCase();
  if (primaryProvider && primaryProvider !== "anonymous") {
    return primaryProvider;
  }

  const providers = Array.isArray(user?.app_metadata?.providers)
    ? user.app_metadata.providers
    : [];
  const normalizedProviders = providers
    .map((provider) => trimString(provider).toLowerCase())
    .filter(Boolean);

  if (normalizedProviders.includes("apple")) return "apple";
  if (normalizedProviders.includes("email")) return "email";

  const identities = Array.isArray(user?.identities) ? user.identities : [];

  for (const identity of identities) {
    const provider = trimString(identity?.provider).toLowerCase();
    if (provider && provider !== "anonymous") {
      return provider;
    }
  }

  return null;
}

export function isEmailPasswordUser(user) {
  return getUserAuthProvider(user) === "email";
}

export function getUserDisplayName({ user, profileName } = {}) {
  const fullName = trimString(user?.user_metadata?.full_name);
  if (fullName) return fullName;

  const composedName = [
    trimString(user?.user_metadata?.given_name),
    trimString(user?.user_metadata?.family_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (composedName) return composedName;

  return trimString(profileName);
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
    if (answers.weightUnit === "lb") {
      return Number((value * 0.45359237).toFixed(1));
    }
  }

  return parseWeightKg(answers.weight);
}

export function buildProfilePayload({
  questionnaireAnswers,
  fallbackName,
  userId,
}) {
  const mergedName =
    trimString(fallbackName) || trimString(questionnaireAnswers?.name);

  return {
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
}

export function formatAppleName(fullName) {
  if (!fullName) return "";

  const formatted = AppleAuthentication.formatFullName(fullName);
  if (typeof formatted === "string" && formatted.trim()) {
    return formatted.trim();
  }

  return [fullName.givenName, fullName.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export async function signInWithAppleIdentity() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error("Apple Sign In did not return an identity token.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });

  if (error) {
    throw new Error(error.message || "Could not complete Apple sign in.");
  }

  const user = data?.user ?? data?.session?.user ?? null;
  if (!user?.id) {
    throw new Error("Apple sign in did not return a user id.");
  }

  return {
    credential,
    data,
    user,
    appleName: formatAppleName(credential.fullName),
  };
}

export async function markAccountCreationComplete() {
  await AsyncStorage.setItem(SIGNUP_COMPLETED_STORAGE_KEY, "true");
  notifyOnboardingGateChange();
}

export async function clearLocalPersistedAppData() {
  const storageKeys = await AsyncStorage.getAllKeys();
  const supplementStorageKeys = storageKeys.filter(
    (key) =>
      key === SUPPLEMENTS_STORAGE_KEY_PREFIX ||
      key.startsWith(`${SUPPLEMENTS_STORAGE_KEY_PREFIX}:`)
  );

  await AsyncStorage.multiRemove([
    QUESTIONNAIRE_STORAGE_KEY,
    ONBOARDING_DRAFT_STORAGE_KEY,
    ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY,
    SIGNUP_PROMPTED_STORAGE_KEY,
    SIGNUP_COMPLETED_STORAGE_KEY,
    ...supplementStorageKeys,
    HEALTH_STORAGE_KEY,
    CHAT_STORAGE_KEY,
    HEART_FLAGS_STORAGE_KEY,
    AI_SUMMARY_CACHE_STORAGE_KEY,
  ]);
}

export async function loadCurrentAccountProfile() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const session = sessionData?.session ?? null;
  const user = session?.user ?? null;

  if (!user?.id) {
    return {
      session: null,
      user: null,
      email: "",
      name: "",
      provider: null,
      canChangePassword: false,
    };
  }

  let profileName = "";

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Failed to load profile name", profileError);
  } else {
    profileName = trimString(profileData?.name);
  }

  const provider = getUserAuthProvider(user);

  return {
    session,
    user,
    email: trimString(user.email),
    name: getUserDisplayName({ user, profileName }),
    provider,
    canChangePassword: provider === "email",
  };
}
