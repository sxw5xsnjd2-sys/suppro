import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useChatStore } from "@/features/ai/store";
import { useHealthStore } from "@/features/health/store";
import { syncSupplementsStoreAccountScope } from "@/features/supplements/store";
import { getRevenueCatSdk } from "@/features/subscriptions/revenueCatSdk";
import { hasNonAnonymousSession, isAnonymousUser } from "./authState";
import { supabase } from "./supabase";
import {
  parseHeightCm,
  parseNumericField,
  parseWeightKg,
  QUESTIONNAIRE_STORAGE_KEY,
  ONBOARDING_DRAFT_STORAGE_KEY,
  ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY,
  ONBOARDING_RATING_COMPLETED_STORAGE_KEY,
  notifyOnboardingGateChange,
  SIGNUP_COMPLETED_STORAGE_KEY,
  SIGNUP_PROMPTED_STORAGE_KEY,
} from "./onboarding";
import {
  getDeleteAccountCleanupStorageKeys,
  getSignOutCleanupStorageKeys,
} from "./localDataCleanup";
import {
  hasCompletedSupproAccountMarker,
  shouldAttemptAccidentalOauthUserCleanup,
  shouldRejectLoginModeOauthUser,
} from "./oauthLoginState";

WebBrowser.maybeCompleteAuthSession();
export const DELETE_ACCOUNT_FUNCTION_NAME = "delete-account";
export const LOOKUP_APPLE_ACCOUNT_FUNCTION_NAME = "lookup-apple-account";
export const ACCOUNT_SETUP_COMPLETIONS_TABLE = "account_setup_completions";
const SUPABASE_AUTH_STORAGE_KEY_PATTERNS = [
  /^sb-.*-auth-token$/i,
  /^supabase\.auth\.token$/i,
];

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value) {
  return trimString(value).toLowerCase();
}

export function isLikelyEmail(value) {
  return /^\S+@\S+\.\S+$/.test(normalizeEmail(value));
}

export function getSupabaseAuthStorageKeys(storageKeys) {
  return Array.from(
    new Set(
      (Array.isArray(storageKeys) ? storageKeys : []).filter((key) =>
        typeof key === "string"
          ? SUPABASE_AUTH_STORAGE_KEY_PATTERNS.some((pattern) =>
              pattern.test(key.trim())
            )
          : false
      )
    )
  );
}

export function getUserAuthProvider(user) {
  const primaryProvider = trimString(
    user?.app_metadata?.provider
  ).toLowerCase();
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

export function questionnaireWeightKg(answers) {
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

export async function signInWithGoogleIdentity() {
  const redirectTo = "suppro://auth/callback";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw new Error(error.message || "Could not start Google sign in.");
  }

  if (!data?.url) {
    throw new Error("Google sign in did not return an auth URL.");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== "success" || !result.url) {
    throw new Error("Google sign in was cancelled.");
  }

  const callbackUrl = new URL(result.url);
  const code = callbackUrl.searchParams.get("code");

  if (!code) {
    throw new Error("Google sign in did not return an auth code.");
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (sessionError) {
    throw new Error(
      sessionError.message || "Could not complete Google sign in."
    );
  }

  const user = sessionData?.user ?? sessionData?.session?.user ?? null;

  if (!user?.id) {
    throw new Error("Google sign in did not return a user id.");
  }

  return {
    data: sessionData,
    user,
  };
}

function noExistingOauthAccountMessage(provider) {
  const providerLabel = provider === "apple" ? "Apple ID" : "Google account";
  return `No existing Suppro account was found for this ${providerLabel}. Create an account instead.`;
}

async function getSupproAccountState(userId) {
  const [
    { data: profileData, error: profileError },
    { data: completionData, error: completionError },
  ] = await Promise.all([
      supabase.from("profiles").select("id").eq("id", userId).maybeSingle(),
      supabase
        .from(ACCOUNT_SETUP_COMPLETIONS_TABLE)
        .select("user_id, completed_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (profileError || completionError) {
    throw new Error("Could not verify your Suppro account. Please try again.");
  }

  return {
    profileExists: Boolean(profileData?.id),
    hasCompletedAccountMarker: hasCompletedSupproAccountMarker(completionData),
  };
}

export async function markServerAccountCreationComplete(userId) {
  if (!trimString(userId)) {
    throw new Error("Could not finish setting up your account.");
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error("Could not finish setting up your account.");
  }

  if (!hasNonAnonymousSession(sessionData?.session ?? null)) {
    throw new Error("Could not finish setting up your account.");
  }

  const { error } = await supabase
    .from(ACCOUNT_SETUP_COMPLETIONS_TABLE)
    .upsert(
      {
        user_id: userId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw new Error("Could not finish setting up your account.");
  }
}

async function cleanupRejectedOauthLoginAttempt(accessToken) {
  if (accessToken) {
    try {
      const { error } = await supabase.functions.invoke(
        DELETE_ACCOUNT_FUNCTION_NAME,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (error) {
        console.error("Failed to delete rejected OAuth login account", error);
      }
    } catch (error) {
      console.error("Failed to invoke rejected OAuth login cleanup", error);
    }
  }

  try {
    await signOutAndClearLocalState();
  } catch (error) {
    console.error("Failed to clear rejected OAuth login session", error);
    await clearLocalPersistedAppData({ preserveSignupCompleted: true });
  }
}

export async function assertOauthLoginAllowed({
  isCreateMode = false,
  provider,
  authData,
  user,
}) {
  if (isCreateMode) {
    return;
  }

  if (!user?.id) {
    throw new Error("OAuth sign in did not return a user id.");
  }

  let profileState = {
    profileExists: false,
    hasCompletedAccountMarker: false,
  };

  try {
    profileState = await getSupproAccountState(user.id);
  } catch (error) {
    try {
      await signOutAndClearLocalState();
    } catch (signOutError) {
      console.error(
        "Failed to clear OAuth session after verification error",
        signOutError
      );
      await clearLocalPersistedAppData({ preserveSignupCompleted: true });
    }

    throw error;
  }

  const shouldReject = shouldRejectLoginModeOauthUser({
    isCreateMode,
    isAnonymousUser: isAnonymousUser(user),
    profileExists: profileState.profileExists,
    hasCompletedAccountMarker: profileState.hasCompletedAccountMarker,
  });

  if (!shouldReject) {
    return;
  }

  const shouldAttemptCleanup = shouldAttemptAccidentalOauthUserCleanup({
    isCreateMode,
    profileExists: profileState.profileExists,
    hasCompletedAccountMarker: profileState.hasCompletedAccountMarker,
    user,
  });

  if (shouldAttemptCleanup) {
    await cleanupRejectedOauthLoginAttempt(authData?.session?.access_token);
  } else {
    try {
      await signOutAndClearLocalState();
    } catch (error) {
      console.error("Failed to clear rejected OAuth login session", error);
      await clearLocalPersistedAppData({ preserveSignupCompleted: true });
    }
  }

  throw new Error(noExistingOauthAccountMessage(provider));
}

export async function markAccountCreationComplete() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !hasNonAnonymousSession(sessionData?.session ?? null)) {
    throw new Error("Could not verify your account session.");
  }

  await AsyncStorage.setItem(SIGNUP_COMPLETED_STORAGE_KEY, "true");
  notifyOnboardingGateChange();
}

async function resetSignedOutStoreState() {
  const results = await Promise.allSettled([
    Promise.resolve().then(() => {
      useHealthStore.getState().resetStore?.();
    }),
    Promise.resolve().then(() => {
      useChatStore.getState().resetStore?.();
    }),
    syncSupplementsStoreAccountScope(null),
  ]);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Failed to reset signed-out local store state", result.reason);
    }
  });
}

async function clearPersistedSupabaseAuthStorage() {
  const storageKeys = await AsyncStorage.getAllKeys();
  const authStorageKeys = getSupabaseAuthStorageKeys(storageKeys);

  if (authStorageKeys.length > 0) {
    await AsyncStorage.multiRemove(authStorageKeys);
  }
}

async function resetRevenueCatIdentityLocally() {
  const revenueCatSdk = getRevenueCatSdk();
  if (
    !revenueCatSdk?.Purchases ||
    typeof revenueCatSdk.Purchases.logOut !== "function"
  ) {
    return;
  }

  try {
    await revenueCatSdk.Purchases.logOut();
  } catch {
    console.warn(
      "Failed to reset local RevenueCat identity after account deletion."
    );
  }
}

export async function clearLocalPersistedAppData(options = {}) {
  const {
    preserveSignupCompleted = false,
    removeAccountScopedLocalData = false,
    accountScopedUserId = null,
  } = options;
  const storageKeys = await AsyncStorage.getAllKeys();
  const onboardingStorageKeys = [
    QUESTIONNAIRE_STORAGE_KEY,
    ONBOARDING_DRAFT_STORAGE_KEY,
    ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY,
    ONBOARDING_RATING_COMPLETED_STORAGE_KEY,
    SIGNUP_PROMPTED_STORAGE_KEY,
    SIGNUP_COMPLETED_STORAGE_KEY,
  ];
  const cleanupOptions = {
    storageKeys,
    onboardingStorageKeys,
    excludeStorageKeys: preserveSignupCompleted
      ? [SIGNUP_COMPLETED_STORAGE_KEY]
      : [],
  };
  const removableKeys = removeAccountScopedLocalData
    ? getDeleteAccountCleanupStorageKeys({
        ...cleanupOptions,
        accountScopedUserId,
      })
    : getSignOutCleanupStorageKeys(cleanupOptions);

  try {
    if (removableKeys.length > 0) {
      await AsyncStorage.multiRemove(removableKeys);
    }
  } finally {
    await resetSignedOutStoreState();
    notifyOnboardingGateChange();
  }
}

export async function signOutAndClearLocalState(options = {}) {
  const {
    preserveLoginGate = true,
    removeAccountScopedLocalData = false,
  } = options;
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message || "Could not sign out.");
  }

  const accountScopedUserId = sessionData?.session?.user?.id ?? null;
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || "Could not sign out.");
  }

  notifyOnboardingGateChange();

  await clearLocalPersistedAppData({
    preserveSignupCompleted: preserveLoginGate,
    removeAccountScopedLocalData,
    accountScopedUserId,
  });
}

export async function forceClearDeletedAccountLocalState(options = {}) {
  const { accountScopedUserId = null } = options;
  let cleanupError = null;

  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      throw error;
    }
  } catch {
    // Fall through to direct auth-storage removal below.
  }

  try {
    await clearPersistedSupabaseAuthStorage();
  } catch {
    cleanupError = new Error(
      "Could not finish clearing your deleted account from this device."
    );
  }

  await resetRevenueCatIdentityLocally();

  await clearLocalPersistedAppData({
    preserveSignupCompleted: false,
    removeAccountScopedLocalData: true,
    accountScopedUserId,
  });

  if (cleanupError) {
    throw cleanupError;
  }
}

export async function loadCurrentAccountProfile() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const session = sessionData?.session ?? null;
  const user = session?.user ?? null;

  if (!user?.id || !hasNonAnonymousSession(session)) {
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
