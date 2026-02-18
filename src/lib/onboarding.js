import AsyncStorage from "@react-native-async-storage/async-storage";

export const QUESTIONNAIRE_STORAGE_KEY = "suppro.onboarding.questionnaire.v1";
export const SIGNUP_PROMPTED_STORAGE_KEY = "suppro.onboarding.signupPrompted.v1";
export const SIGNUP_COMPLETED_STORAGE_KEY =
  "suppro.onboarding.signupCompleted.v1";

export async function getQuestionnaireAnswers() {
  const raw = await AsyncStorage.getItem(QUESTIONNAIRE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function hasCompletedQuestionnaire() {
  const data = await getQuestionnaireAnswers();
  return Boolean(data?.completedAt);
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

