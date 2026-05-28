import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { canEnterAuthenticatedApp, hasNonAnonymousSession } from "./authState";

export const QUESTIONNAIRE_STORAGE_KEY = "suppro.onboarding.questionnaire.v1";
export const ONBOARDING_DRAFT_STORAGE_KEY = "suppro.onboarding.draft.v1";
export const SIGNUP_PROMPTED_STORAGE_KEY = "suppro.onboarding.signupPrompted.v1";
export const SIGNUP_COMPLETED_STORAGE_KEY =
  "suppro.onboarding.signupCompleted.v1";
export const ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY =
  "suppro.onboarding.premiumCompleted.v1";
export const ONBOARDING_RATING_COMPLETED_STORAGE_KEY =
  "suppro.onboarding.ratingCompleted.v1";
export const ONBOARDING_APPLE_HEALTH_COMPLETED_STORAGE_KEY =
  "suppro.onboarding.appleHealthCompleted.v1";
export const ONBOARDING_APPLE_HEALTH_CONNECT_REQUESTED_STORAGE_KEY =
  "suppro.onboarding.appleHealthConnectRequested.v1";
export const ONBOARDING_RATING_REVIEW_ATTEMPTED_STORAGE_KEY =
  "suppro.onboarding.ratingReviewAttempted.v1";
export const ONBOARDING_REFERRAL_SOURCE_STORAGE_KEY =
  "suppro.onboarding.referralSource.v1";
const ACCOUNT_SETUP_COMPLETIONS_TABLE = "account_setup_completions";

const onboardingGateListeners = new Set();

export function notifyOnboardingGateChange() {
  onboardingGateListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error("Failed to notify onboarding gate listener", error);
    }
  });
}

export function subscribeOnboardingGateChange(listener) {
  onboardingGateListeners.add(listener);

  return () => {
    onboardingGateListeners.delete(listener);
  };
}

function parseStoredJson(raw) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeOnboardingMode(mode) {
  return mode === "retake" ? "retake" : "first_run";
}

function normalizeOnboardingDraft(draft) {
  if (!draft || typeof draft !== "object") return null;

  const answers =
    draft.answers && typeof draft.answers === "object" ? draft.answers : {};
  const currentStepKey =
    typeof draft.currentStepKey === "string" && draft.currentStepKey.trim()
      ? draft.currentStepKey.trim()
      : null;
  const currentPageIndex = Number.isInteger(draft.currentPageIndex)
    ? Math.max(0, draft.currentPageIndex)
    : 0;

  return {
    currentStepKey,
    currentPageIndex,
    answers,
    mode: normalizeOnboardingMode(draft.mode),
  };
}

export async function getQuestionnaireAnswers() {
  const raw = await AsyncStorage.getItem(QUESTIONNAIRE_STORAGE_KEY);
  return parseStoredJson(raw);
}

export async function hasCompletedQuestionnaire() {
  const data = await getQuestionnaireAnswers();
  return Boolean(data?.completedAt);
}

export async function loadOnboardingDraft() {
  const raw = await AsyncStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
  return normalizeOnboardingDraft(parseStoredJson(raw));
}

export async function saveOnboardingDraft(draft) {
  const normalized = normalizeOnboardingDraft(draft);
  if (!normalized) {
    throw new Error("Onboarding draft must be an object.");
  }

  await AsyncStorage.setItem(
    ONBOARDING_DRAFT_STORAGE_KEY,
    JSON.stringify(normalized)
  );
}

export async function clearOnboardingDraft() {
  await AsyncStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
}

export async function hasCompletedOnboardingPremium() {
  return (
    (await AsyncStorage.getItem(ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY)) ===
    "true"
  );
}

export async function hasCompletedOnboardingRating() {
  return (
    (await AsyncStorage.getItem(ONBOARDING_RATING_COMPLETED_STORAGE_KEY)) ===
    "true"
  );
}

export async function hasCompletedOnboardingAppleHealth() {
  return (
    (await AsyncStorage.getItem(ONBOARDING_APPLE_HEALTH_COMPLETED_STORAGE_KEY)) ===
    "true"
  );
}

export async function hasRequestedOnboardingAppleHealthConnect() {
  return (
    (await AsyncStorage.getItem(
      ONBOARDING_APPLE_HEALTH_CONNECT_REQUESTED_STORAGE_KEY
    )) === "true"
  );
}

export async function hasCompletedOnboardingReferralSource() {
  const data = parseStoredJson(
    await AsyncStorage.getItem(ONBOARDING_REFERRAL_SOURCE_STORAGE_KEY)
  );

  return Boolean(
    typeof data?.source === "string" &&
      data.source.trim() &&
      typeof data?.completedAt === "string" &&
      data.completedAt.trim()
  );
}

export async function markOnboardingRatingComplete() {
  await AsyncStorage.setItem(ONBOARDING_RATING_COMPLETED_STORAGE_KEY, "true");
  notifyOnboardingGateChange();
}

export async function clearOnboardingRatingComplete() {
  await AsyncStorage.removeItem(ONBOARDING_RATING_COMPLETED_STORAGE_KEY);
  notifyOnboardingGateChange();
}

export async function markOnboardingAppleHealthComplete() {
  await AsyncStorage.setItem(
    ONBOARDING_APPLE_HEALTH_COMPLETED_STORAGE_KEY,
    "true"
  );
  notifyOnboardingGateChange();
}

export async function clearOnboardingAppleHealthComplete() {
  await AsyncStorage.removeItem(ONBOARDING_APPLE_HEALTH_COMPLETED_STORAGE_KEY);
  notifyOnboardingGateChange();
}

export async function markOnboardingAppleHealthConnectRequested() {
  await AsyncStorage.setItem(
    ONBOARDING_APPLE_HEALTH_CONNECT_REQUESTED_STORAGE_KEY,
    "true"
  );
}

export async function hasAttemptedOnboardingRatingReview() {
  return (
    (await AsyncStorage.getItem(
      ONBOARDING_RATING_REVIEW_ATTEMPTED_STORAGE_KEY
    )) === "true"
  );
}

export async function markOnboardingRatingReviewAttempted() {
  await AsyncStorage.setItem(
    ONBOARDING_RATING_REVIEW_ATTEMPTED_STORAGE_KEY,
    "true"
  );
}

export async function markOnboardingReferralSourceComplete(source) {
  const normalizedSource = typeof source === "string" ? source.trim() : "";

  if (!normalizedSource) {
    throw new Error("Onboarding referral source is required.");
  }

  await AsyncStorage.setItem(
    ONBOARDING_REFERRAL_SOURCE_STORAGE_KEY,
    JSON.stringify({
      source: normalizedSource,
      completedAt: new Date().toISOString(),
    })
  );
  notifyOnboardingGateChange();
}

export async function clearOnboardingReferralSourceComplete() {
  await AsyncStorage.removeItem(ONBOARDING_REFERRAL_SOURCE_STORAGE_KEY);
  notifyOnboardingGateChange();
}

export async function markOnboardingPremiumComplete() {
  await AsyncStorage.setItem(ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY, "true");
  notifyOnboardingGateChange();
}

export async function clearOnboardingPremiumComplete() {
  await AsyncStorage.removeItem(ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY);
  notifyOnboardingGateChange();
}

export function resolveLoggedOutOnboardingGateState({
  hasCompletedQuestionnaire,
  signupCompleted,
  hasCompletedOnboardingRating,
  hasCompletedOnboardingAppleHealth,
  hasCompletedOnboardingReferralSource,
  hasCompletedOnboardingPremium,
  requiresAppleHealthStep = true,
}) {
  if (signupCompleted) {
    return "needs_login";
  }

  if (!hasCompletedQuestionnaire) {
    return "needs_questions";
  }

  if (!hasCompletedOnboardingRating) {
    return "needs_rating";
  }

  if (requiresAppleHealthStep && !hasCompletedOnboardingAppleHealth) {
    return "needs_apple_health";
  }

  if (!hasCompletedOnboardingReferralSource) {
    return "needs_referral_source";
  }

  if (!hasCompletedOnboardingPremium) {
    return "needs_paywall";
  }

  return "needs_signup";
}

export function shouldRouteThroughOnboardingRatingStep({
  mode,
  origin,
  signupCompleted,
  hasCompletedOnboardingRating,
}) {
  if (mode !== "first_run") {
    return false;
  }

  if (signupCompleted || hasCompletedOnboardingRating) {
    return false;
  }

  return !(
    typeof origin === "string" &&
    origin.trim()
  );
}

export function resolvePostAppleHealthOnboardingHref({ mode = "first_run" } = {}) {
  return `/onboarding?mode=${normalizeOnboardingMode(mode)}&step=referral-source`;
}

async function hasCompletedAccountSetup(userId) {
  if (typeof userId !== "string" || !userId.trim()) {
    return false;
  }

  const { data, error } = await supabase
    .from(ACCOUNT_SETUP_COMPLETIONS_TABLE)
    .select("user_id, completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(
    typeof data?.completed_at === "string" && data.completed_at.trim()
  );
}

export async function getOnboardingGateState({
  requiresAppleHealthStep = true,
} = {}) {
  const { data } = await supabase.auth.getSession();
  const session = data?.session ?? null;
  const loggedIn = hasNonAnonymousSession(session);

  if (loggedIn) {
    const hasCompletedAccountMarker = await hasCompletedAccountSetup(
      session?.user?.id
    );

    if (
      canEnterAuthenticatedApp({
        session,
        hasCompletedAccountSetup: hasCompletedAccountMarker,
      })
    ) {
      await AsyncStorage.setItem(SIGNUP_COMPLETED_STORAGE_KEY, "true");
      return "complete";
    }
  }

  const signupCompleted = await AsyncStorage.getItem(
    SIGNUP_COMPLETED_STORAGE_KEY
  );
  const answers = await getQuestionnaireAnswers();

  const resolvedState = resolveLoggedOutOnboardingGateState({
    hasCompletedQuestionnaire: Boolean(answers?.completedAt),
    signupCompleted: signupCompleted === "true",
    hasCompletedOnboardingRating: await hasCompletedOnboardingRating(),
    hasCompletedOnboardingAppleHealth: await hasCompletedOnboardingAppleHealth(),
    hasCompletedOnboardingReferralSource:
      await hasCompletedOnboardingReferralSource(),
    hasCompletedOnboardingPremium: await hasCompletedOnboardingPremium(),
    requiresAppleHealthStep,
  });

  return resolvedState;
}

export async function hasCompletedOnboarding(options = {}) {
  return (await getOnboardingGateState(options)) === "complete";
}

export function parseNumericField(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;

  const match = trimmed.match(/[-+]?\d*\.?\d+/);
  if (!match) return null;
  const fromMatch = Number(match[0]);
  return Number.isFinite(fromMatch) ? fromMatch : null;
}

export function parseHeightCm(rawHeight) {
  const text = String(rawHeight || "").trim().toLowerCase();
  if (!text) return null;

  const feetInchesMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:ft|')\s*(\d+(?:\.\d+)?)?\s*(?:in|\"|$)?/
  );
  if (feetInchesMatch) {
    const feet = Number(feetInchesMatch[1]);
    const inches = Number(feetInchesMatch[2] ?? 0);
    if (Number.isFinite(feet) && Number.isFinite(inches)) {
      return Number((feet * 30.48 + inches * 2.54).toFixed(1));
    }
  }

  const inchesOnlyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches)\b/);
  if (inchesOnlyMatch) {
    const inches = Number(inchesOnlyMatch[1]);
    if (Number.isFinite(inches)) {
      return Number((inches * 2.54).toFixed(1));
    }
  }

  const numeric = parseNumericField(text);
  if (!Number.isFinite(numeric)) return null;

  if (text.includes("ft")) {
    return Number((numeric * 30.48).toFixed(1));
  }
  if (text.includes("in")) {
    return Number((numeric * 2.54).toFixed(1));
  }

  // Treat plain numeric input as centimeters.
  return Number(numeric.toFixed(1));
}

export function parseWeightKg(rawWeight) {
  const text = String(rawWeight || "").trim().toLowerCase();
  if (!text) return null;

  const numeric = parseNumericField(text);
  if (!Number.isFinite(numeric)) return null;

  if (/\b(lb|lbs|pound|pounds)\b/.test(text)) {
    return Number((numeric * 0.45359237).toFixed(1));
  }

  return Number(numeric.toFixed(1));
}
