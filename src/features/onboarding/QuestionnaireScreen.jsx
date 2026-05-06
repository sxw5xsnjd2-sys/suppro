import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { router, useLocalSearchParams } from "expo-router";
import {
  PRESET_METRICS,
  PRESET_METRICS_BY_KEY,
} from "@/features/health/metricDefinitions";
import {
  SUPPLEMENT_SCHEDULE_PRESETS,
  buildScheduleFromPreset,
  getSupplementScheduleLabel,
  normalizeSupplementSchedule,
} from "@/features/supplements/schedule";
import { appTheme, typography } from "@/theme";
import SupproLogo from "@/assets/icons/Supprologo.png";
import {
  clearOnboardingDraft,
  getQuestionnaireAnswers,
  loadOnboardingDraft,
  notifyOnboardingGateChange,
  QUESTIONNAIRE_STORAGE_KEY,
  saveOnboardingDraft,
  SIGNUP_COMPLETED_STORAGE_KEY,
} from "@src/lib/onboarding";
import {
  CheckRow,
  ChipPill,
  GhostButton,
  GlyphHeart,
  GlyphPerson,
  GlyphPills,
  OnboardingCTA,
  OnboardingShell,
  OptionRow,
  QuestionHero,
  onboardingV6,
} from "./v6Primitives";

const STEP_KEYS = [
  "landing",
  "welcome",
  "name",
  "dob",
  "sex",
  "height",
  "weight",
  "goals",
  "success",
  "confidence",
  "insightStacks",
  "metrics",
  "stack",
  "meds",
  "conditions",
  "lifeStage",
  "insightSafety",
  "evidence",
  "priorities",
  "caution",
  "routine",
  "consent",
];

const BUILDING_STEP_KEY = "building";
const ALL_STEP_KEYS = [...STEP_KEYS, BUILDING_STEP_KEY];
const AUTO_ADVANCE_DELAY_MS = 220;
const AUTO_ADVANCE_STEP_KEYS = [
  "sex",
  "confidence",
  "lifeStage",
  "evidence",
  "priorities",
  "caution",
  "routine",
];

const LEGACY_STEP_INDEX_TO_KEY = [
  "welcome",
  "name",
  "dob",
  "sex",
  "height",
  "goals",
  "success",
  "confidence",
  "metrics",
  "stack",
  "meds",
  "evidence",
  "routine",
  "consent",
  "building",
];

const MONTH_OPTIONS = [
  { label: "Jan", value: 0 },
  { label: "Feb", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Apr", value: 3 },
  { label: "May", value: 4 },
  { label: "Jun", value: 5 },
  { label: "Jul", value: 6 },
  { label: "Aug", value: 7 },
  { label: "Sep", value: 8 },
  { label: "Oct", value: 9 },
  { label: "Nov", value: 10 },
  { label: "Dec", value: 11 },
];

const SEX_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const GOAL_OPTIONS = [
  { value: "sleep", label: "Better sleep" },
  { value: "energy", label: "More energy" },
  { value: "focus", label: "Sharper focus" },
  { value: "immune", label: "Immune support" },
  { value: "recovery_strength", label: "Recovery & strength" },
  { value: "longevity", label: "Longevity" },
  { value: "gut_health", label: "Gut health" },
  { value: "stress_mood", label: "Stress / mood" },
];

const CONFIDENCE_OPTIONS = [
  { value: "new", label: "New to this" },
  { value: "beginner", label: "Beginner" },
  { value: "comfortable", label: "Comfortable" },
  { value: "confident", label: "Confident" },
  { value: "expert", label: "Expert" },
];

const METRIC_OPTIONS = PRESET_METRICS.map((metric) => ({
  value: metric.key,
  label: metric.shortLabel || metric.label,
})).filter((option) => PRESET_METRICS_BY_KEY[option.value]);

const LIFE_STAGE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "pregnant", label: "Pregnant" },
  { value: "trying_to_conceive", label: "Trying to conceive" },
  { value: "breastfeeding", label: "Breastfeeding" },
];

const EVIDENCE_OPTIONS = [
  {
    value: "strong_only",
    label: "Strong evidence only",
    description: "Multiple RCTs, meta-analyses.",
    evidenceStrength: "strong_only",
    mixedEvidence: "avoid",
    priorityFactors: ["clinical_evidence", "safety_profile"],
  },
  {
    value: "moderate",
    label: "Moderate evidence",
    description: "A few good studies is enough.",
    evidenceStrength: "mostly_strong",
    mixedEvidence: "low_risk_only",
    priorityFactors: ["clinical_evidence", "safety_profile"],
  },
  {
    value: "emerging",
    label: "Open to emerging",
    description: "Show me what's promising.",
    evidenceStrength: "experimental_open",
    mixedEvidence: "upside_high",
    priorityFactors: ["performance", "popular"],
  },
];

const PRIORITY_OPTIONS = [
  {
    value: "cost_conscious",
    label: "Smart Value",
    description: "Prioritise effective, budget-friendly choices.",
    priorityFactors: ["cost", "clinical_evidence"],
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "A thoughtful balance of quality, safety, and value.",
    priorityFactors: ["clinical_evidence", "safety_profile"],
  },
  {
    value: "premium",
    label: "Premium",
    description: "Prioritise the highest-quality options, regardless of cost.",
    priorityFactors: ["quality", "clinical_evidence"],
  },
];

const CAUTION_OPTIONS = [
  {
    value: "evidence_first",
    label: "Evidence-first",
    description: "Prioritise well-studied supplements.",
    cautionLevel: "ultra_conservative",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Prefer mostly proven, with some flexibility.",
    cautionLevel: "balanced",
  },
  {
    value: "exploratory",
    label: "Exploratory",
    description: "Open to promising options with less research.",
    cautionLevel: "results_optimised",
  },
];

const TIMING_OPTIONS = [
  { value: "breakfast", label: "With breakfast" },
  { value: "dinner", label: "With dinner" },
  { value: "morning_night", label: "Morning + night" },
  { value: "whenever", label: "Whenever I remember" },
];

const LOADER_LINES = [
  "Collecting your answers",
  "Cross-referencing 10,432 supplements",
  "Flagging interactions",
];
const LOADER_LINE_DURATIONS = [900, 900, 1000];

const HELPER_STEP_KEYS = [
  "helperEvidence",
  "helperSymptom",
  "helperRanked",
  "helperSources",
];
const HELPER_CTA_LABELS = [
  "Show me more",
  "Keep going",
  "Almost there",
  "Show me my stack",
];
const ANNUAL_SUPPLEMENT_WASTE_GBP = 589;
const REGION_TO_CURRENCY = {
  AE: "AED",
  AU: "AUD",
  BR: "BRL",
  CA: "CAD",
  CH: "CHF",
  CN: "CNY",
  CZ: "CZK",
  DE: "EUR",
  DK: "DKK",
  ES: "EUR",
  FR: "EUR",
  GB: "GBP",
  HK: "HKD",
  HU: "HUF",
  IE: "EUR",
  IN: "INR",
  IT: "EUR",
  JP: "JPY",
  MX: "MXN",
  NL: "EUR",
  NO: "NOK",
  NZ: "NZD",
  PL: "PLN",
  PT: "EUR",
  RO: "RON",
  SE: "SEK",
  SG: "SGD",
  US: "USD",
  ZA: "ZAR",
};
const GBP_EXCHANGE_RATES = {
  AED: 4.97,
  AUD: 2.07,
  BRL: 7.31,
  CAD: 1.86,
  CHF: 1.12,
  CNY: 9.82,
  CZK: 29.2,
  DKK: 8.72,
  EUR: 1.17,
  GBP: 1,
  HKD: 10.52,
  HUF: 469,
  INR: 113.2,
  JPY: 203.1,
  MXN: 25.9,
  NOK: 13.95,
  NZD: 2.23,
  PLN: 5.02,
  RON: 5.82,
  SEK: 13.07,
  SGD: 1.74,
  USD: 1.354,
  ZAR: 25.3,
};

function normalizeOnboardingMode(mode) {
  return mode === "retake" ? "retake" : "first_run";
}

function getDeviceLocale() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return typeof locale === "string" && locale.trim() ? locale : "en-GB";
  } catch {
    return "en-GB";
  }
}

function getRegionFromLocale(locale) {
  if (!locale || typeof locale !== "string") return null;

  try {
    if (typeof Intl.Locale === "function") {
      const region = new Intl.Locale(locale).region;
      if (region) return region.toUpperCase();
    }
  } catch {
    // Fall through to string parsing.
  }

  const match = locale.match(/-([a-z]{2}|\d{3})(?:-|$)/i);
  return match ? match[1].toUpperCase() : null;
}

function getLocalizedAnnualWasteLabel() {
  const locale = getDeviceLocale();
  const region = getRegionFromLocale(locale);
  const currency = REGION_TO_CURRENCY[region] || "GBP";
  const exchangeRate = GBP_EXCHANGE_RATES[currency] || 1;
  const amount = Math.round(ANNUAL_SUPPLEMENT_WASTE_GBP * exchangeRate);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(ANNUAL_SUPPLEMENT_WASTE_GBP);
  }
}

function defaultBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 30);
  date.setHours(12, 0, 0, 0);
  return date;
}

function parseLocalISODate(value) {
  if (!value || typeof value !== "string") return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function toISODate(value) {
  const date = value instanceof Date ? value : parseLocalISODate(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function range(min, max) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function normalizePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function createSupplementRow() {
  const schedule = buildScheduleFromPreset("daily");
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    dose: "",
    ...schedule,
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSupplementRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const schedule = normalizeSupplementSchedule(row);
      return {
        id: row.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: String(row.name || ""),
        dose: String(row.dose || ""),
        ...schedule,
      };
    });
}

function createInitialAnswers() {
  return {
    name: "",
    dateOfBirth: "",
    sexAtBirth: "",
    heightUnit: "cm",
    heightCm: "172",
    heightFeet: "5",
    heightInches: "8",
    weightUnit: "kg",
    weightValue: "68",
    goals: [],
    success90Days: "",
    confidence: "",
    trackMetrics: [],
    metricInitialValues: {},
    takingSupplements: "no",
    supplementRows: [],
    currentSupplementsSource: "none",
    medications: [],
    conditions: [],
    conditionsText: "",
    dietary: [],
    lifeStage: "",
    pregnancyStatus: "",
    evidencePreference: "",
    priorityPreference: "",
    cautionPreference: "",
    evidenceStrength: "mostly_strong",
    priorityFactors: ["clinical_evidence", "safety_profile"],
    mixedEvidence: "low_risk_only",
    cautionLevel: "balanced",
    supplementTiming: "",
    adherencePlan: "",
    consentAccepted: false,
    consentPersonalise: true,
    consentBriefings: true,
    consentAnalytics: false,
  };
}

function normalizeEvidencePreference(answers) {
  if (
    EVIDENCE_OPTIONS.some(
      (option) => option.value === answers.evidencePreference
    )
  ) {
    return answers.evidencePreference;
  }

  if (answers.evidenceStrength === "strong_only") return "strong_only";
  if (answers.evidenceStrength === "experimental_open") return "emerging";
  return "";
}

function normalizeCautionPreference(answers) {
  if (
    CAUTION_OPTIONS.some((option) => option.value === answers.cautionPreference)
  ) {
    return answers.cautionPreference;
  }

  if (answers.cautionLevel === "ultra_conservative") return "very_cautious";
  if (answers.cautionLevel === "results_optimised") return "adventurous";
  return "";
}

function mergeStoredAnswers(base, stored) {
  if (!stored || typeof stored !== "object") return base;

  const merged = {
    ...base,
    ...stored,
    goals: normalizeArray(stored.goals),
    trackMetrics: normalizeArray(stored.trackMetrics),
    metricInitialValues:
      stored.metricInitialValues &&
      typeof stored.metricInitialValues === "object"
        ? stored.metricInitialValues
        : {},
    supplementRows: normalizeSupplementRows(stored.supplementRows),
    medications: [],
    conditions: [],
    conditionsText: "",
    dietary: normalizeArray(stored.dietary),
  };

  if (!["cm", "ft_in"].includes(merged.heightUnit)) {
    merged.heightUnit = "cm";
  }
  if (!["kg", "lb"].includes(merged.weightUnit)) {
    merged.weightUnit = "kg";
  }
  if (merged.lifeStage === "none" && !merged.pregnancyStatus) {
    merged.lifeStage = "";
  }
  if (!merged.lifeStage) {
    merged.lifeStage =
      merged.pregnancyStatus === "pregnant" ||
      merged.pregnancyStatus === "trying_to_conceive" ||
      merged.pregnancyStatus === "breastfeeding"
        ? merged.pregnancyStatus
        : merged.pregnancyStatus === "no" ||
          merged.pregnancyStatus === "not_applicable"
        ? "none"
        : "";
  }
  merged.confidence = CONFIDENCE_OPTIONS.some(
    (option) => option.value === merged.confidence
  )
    ? merged.confidence
    : "";
  merged.evidencePreference = normalizeEvidencePreference(merged);
  merged.priorityPreference = PRIORITY_OPTIONS.some(
    (option) => option.value === merged.priorityPreference
  )
    ? merged.priorityPreference
    : "";
  merged.cautionPreference = normalizeCautionPreference(merged);
  merged.supplementTiming = TIMING_OPTIONS.some(
    (option) => option.value === merged.supplementTiming
  )
    ? merged.supplementTiming
    : TIMING_OPTIONS.some((option) => option.value === merged.adherencePlan)
    ? merged.adherencePlan
    : "";
  merged.consentAnalytics = Boolean(stored.consentAnalytics);

  return merged;
}

function answersReducer(state, action) {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        answers: action.answers,
        stepKey: action.stepKey,
      };
    case "setStep":
      return {
        ...state,
        stepKey: action.stepKey,
      };
    case "setField":
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.field]: action.value,
        },
      };
    case "setFields":
      return {
        ...state,
        answers: {
          ...state.answers,
          ...action.values,
        },
      };
    case "toggleArray": {
      const current = normalizeArray(state.answers[action.field]);
      const exists = current.includes(action.value);
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.field]: exists
            ? current.filter((item) => item !== action.value)
            : [...current, action.value],
        },
      };
    }
    default:
      return state;
  }
}

function shouldAskPregnancyQuestion(sexAtBirth) {
  return sexAtBirth === "female" || sexAtBirth === "prefer_not_to_say";
}

function getVisibleStepKeys(answers) {
  return STEP_KEYS.filter((key) => {
    if (key === "meds" || key === "conditions") {
      return false;
    }
    if (key === "lifeStage") {
      return shouldAskPregnancyQuestion(answers.sexAtBirth);
    }
    return true;
  });
}

function coerceVisibleStepKey(stepKey, visibleStepKeys) {
  if (stepKey === BUILDING_STEP_KEY) return stepKey;
  if (visibleStepKeys.includes(stepKey)) return stepKey;

  const sourceIndex = STEP_KEYS.indexOf(stepKey);
  if (sourceIndex < 0) return visibleStepKeys[0];

  return (
    STEP_KEYS.slice(sourceIndex + 1).find((candidate) =>
      visibleStepKeys.includes(candidate)
    ) ??
    STEP_KEYS.slice(0, sourceIndex)
      .reverse()
      .find((candidate) => visibleStepKeys.includes(candidate)) ??
    visibleStepKeys[0]
  );
}

function getProgress(stepKey, visibleStepKeys) {
  const keys = [...visibleStepKeys, BUILDING_STEP_KEY];
  const index = keys.indexOf(stepKey);
  if (index < 0 || keys.length <= 1) return 0;
  return index / (keys.length - 1);
}

function legacyStepKeyFromIndex(index) {
  if (!Number.isInteger(index)) return "welcome";
  return LEGACY_STEP_INDEX_TO_KEY[index] ?? "welcome";
}

function resolveSavedStepKey(savedDraft) {
  if (typeof savedDraft?.currentStepKey === "string") {
    return savedDraft.currentStepKey;
  }
  if (Number.isInteger(savedDraft?.currentPageIndex)) {
    return legacyStepKeyFromIndex(savedDraft.currentPageIndex);
  }
  return "landing";
}

function getRecommendationFields(answers) {
  const evidence =
    EVIDENCE_OPTIONS.find(
      (option) => option.value === answers.evidencePreference
    ) ?? EVIDENCE_OPTIONS[1];
  const priority =
    PRIORITY_OPTIONS.find(
      (option) => option.value === answers.priorityPreference
    ) ?? PRIORITY_OPTIONS[1];
  const caution =
    CAUTION_OPTIONS.find(
      (option) => option.value === answers.cautionPreference
    ) ?? CAUTION_OPTIONS[1];

  return {
    evidenceStrength: evidence.evidenceStrength,
    mixedEvidence: evidence.mixedEvidence,
    priorityFactors: Array.from(
      new Set([...evidence.priorityFactors, ...priority.priorityFactors])
    ),
    cautionLevel: caution.cautionLevel,
  };
}

function buildQuestionnairePayload(answers) {
  const supplementRows = normalizeSupplementRows(answers.supplementRows).filter(
    (row) => row.name.trim()
  );
  const recommendationFields = getRecommendationFields(answers);
  const heightCm = String(answers.heightCm || "172").trim();
  const heightFeet = String(answers.heightFeet || "5").trim();
  const heightInches = String(answers.heightInches || "8").trim();
  const weightValue = String(answers.weightValue || "68").trim();
  const heightSummary =
    answers.heightUnit === "ft_in"
      ? `${heightFeet}'${heightInches}"`
      : `${heightCm} cm`;
  const weightSummary = `${weightValue} ${
    answers.weightUnit === "kg" ? "kg" : "lb"
  }`;

  const supplementsDetails = supplementRows
    .map((row) => {
      return [row.name.trim(), row.dose.trim(), getSupplementScheduleLabel(row)]
        .filter(Boolean)
        .join(" - ");
    })
    .join("\n");

  return {
    ...answers,
    ...recommendationFields,
    dateOfBirth: answers.dateOfBirth || toISODate(defaultBirthDate()),
    heightCm,
    heightFeet,
    heightInches,
    weightValue,
    height: heightSummary,
    weight: weightSummary,
    supplementRows,
    supplementsDetails,
    takingSupplements: supplementRows.length ? "yes" : "no",
    medications: [],
    conditions: [],
    conditionsText: "",
    adherencePlan: answers.supplementTiming,
    pregnancyStatus: shouldAskPregnancyQuestion(answers.sexAtBirth)
      ? answers.lifeStage === "none"
        ? "no"
        : answers.lifeStage
      : "not_applicable",
    metricInitialValues: {},
  };
}

function triggerImpact(style = Haptics.ImpactFeedbackStyle.Light) {
  void Haptics.impactAsync(style).catch(() => {});
}

function triggerSuccess() {
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success
  ).catch(() => {});
}

function UnitToggle({ options, value, onChange }) {
  return (
    <View style={styles.unitToggle}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.unitToggleOption,
              selected && styles.unitToggleOptionSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.unitToggleText,
                selected && styles.unitToggleTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InlineSlider({
  value,
  minimumValue,
  maximumValue,
  step = 1,
  accessibilityLabel,
  onChange,
  onChangeEnd,
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const safeValue = clamp(value, minimumValue, maximumValue);
  const progress =
    trackWidth > 0
      ? (safeValue - minimumValue) / (maximumValue - minimumValue)
      : 0;

  const updateFromLocation = useCallback(
    (locationX) => {
      if (!trackWidth) return safeValue;

      const ratio = clamp(locationX / trackWidth, 0, 1);
      const rawValue = minimumValue + ratio * (maximumValue - minimumValue);
      const steppedValue =
        Math.round((rawValue - minimumValue) / step) * step + minimumValue;
      const nextValue = clamp(steppedValue, minimumValue, maximumValue);
      onChange(nextValue);
      return nextValue;
    },
    [maximumValue, minimumValue, onChange, safeValue, step, trackWidth]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          updateFromLocation(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          updateFromLocation(event.nativeEvent.locationX);
        },
        onPanResponderRelease: (event) => {
          onChangeEnd(updateFromLocation(event.nativeEvent.locationX));
        },
        onPanResponderTerminate: () => {
          onChangeEnd(safeValue);
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [onChangeEnd, safeValue, updateFromLocation]
  );

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: minimumValue,
        max: maximumValue,
        now: safeValue,
      }}
      style={styles.measurementSlider}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      <View style={styles.measurementSliderTrack}>
        <View
          style={[
            styles.measurementSliderFill,
            { width: `${clamp(progress, 0, 1) * 100}%` },
          ]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.measurementSliderThumb,
          { left: `${clamp(progress, 0, 1) * 100}%` },
        ]}
      />
    </View>
  );
}

function HeightScreen({
  unit,
  heightCm,
  heightFeet,
  heightInches,
  onUnitChange,
  onCmChange,
  onFeetChange,
  onInchesChange,
}) {
  const storedCmValue = clamp(Math.round(Number(heightCm) || 172), 120, 230);
  const [draftCmValue, setDraftCmValue] = useState(storedCmValue);
  const feetValue = String(heightFeet ?? "");
  const inchesValue = String(heightInches ?? "");
  const totalInches =
    (Number(heightFeet) || 5) * 12 + (Number(heightInches) || 8);
  const cmValue = unit === "cm" ? draftCmValue : storedCmValue;
  const displayValue = unit === "cm" ? cmValue : totalInches;

  useEffect(() => {
    setDraftCmValue(storedCmValue);
  }, [storedCmValue]);

  return (
    <>
      <QuestionHero title="How tall are you?" />
      <View style={styles.measurementContent}>
        <UnitToggle
          options={[
            { value: "cm", label: "cm" },
            { value: "ft_in", label: "ft / in" },
          ]}
          value={unit}
          onChange={onUnitChange}
        />

        {unit === "cm" ? (
          <>
            <View style={styles.measurementValueRow}>
              <Text style={styles.measurementValue}>{cmValue}</Text>
              <Text style={styles.measurementUnit}>cm</Text>
            </View>
            <InlineSlider
              value={cmValue}
              minimumValue={120}
              maximumValue={230}
              step={1}
              accessibilityLabel="Height in centimeters"
              onChange={(value) => setDraftCmValue(Math.round(value))}
              onChangeEnd={(value) => onCmChange(String(Math.round(value)))}
            />
          </>
        ) : (
          <>
            <View style={styles.measurementValueRow}>
              <Text style={styles.measurementValue}>{displayValue}</Text>
              <Text style={styles.measurementUnit}>in</Text>
            </View>
            <View style={styles.heightInputRow}>
              <View style={styles.heightInputGroup}>
                <Text style={styles.heightInputLabel}>Feet</Text>
                <TextInput
                  value={feetValue}
                  onChangeText={onFeetChange}
                  keyboardType="number-pad"
                  maxLength={1}
                  placeholder="5"
                  placeholderTextColor={onboardingV6.faint}
                  style={styles.heightInput}
                  accessibilityLabel="Height in feet"
                />
              </View>
              <View style={styles.heightInputGroup}>
                <Text style={styles.heightInputLabel}>Inches</Text>
                <TextInput
                  value={inchesValue}
                  onChangeText={onInchesChange}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="8"
                  placeholderTextColor={onboardingV6.faint}
                  style={styles.heightInput}
                  accessibilityLabel="Height in inches"
                />
              </View>
            </View>
          </>
        )}
      </View>
    </>
  );
}

function WeightScreen({ unit, value, onUnitChange, onValueChange }) {
  const fallbackValue = unit === "kg" ? 68 : 150;
  const minValue = unit === "kg" ? 35 : 75;
  const maxValue = unit === "kg" ? 200 : 440;
  const storedValue = clamp(
    Math.round(Number(value) || fallbackValue),
    minValue,
    maxValue
  );
  const [draftValue, setDraftValue] = useState(storedValue);

  useEffect(() => {
    setDraftValue(storedValue);
  }, [storedValue, unit]);

  return (
    <>
      <QuestionHero title="What's your weight?" />
      <View style={styles.measurementContent}>
        <UnitToggle
          options={[
            { value: "kg", label: "kg" },
            { value: "lb", label: "lbs" },
          ]}
          value={unit}
          onChange={onUnitChange}
        />

        <View style={styles.measurementValueRow}>
          <Text style={styles.measurementValue}>{draftValue}</Text>
          <Text style={styles.measurementUnit}>
            {unit === "kg" ? "kg" : "lb"}
          </Text>
        </View>
        <InlineSlider
          value={draftValue}
          minimumValue={minValue}
          maximumValue={maxValue}
          step={1}
          accessibilityLabel={`Weight in ${
            unit === "kg" ? "kilograms" : "pounds"
          }`}
          onChange={(nextValue) => setDraftValue(Math.round(nextValue))}
          onChangeEnd={(nextValue) =>
            onValueChange(unit, String(Math.round(nextValue)))
          }
        />
      </View>
    </>
  );
}

function DatePickerCards({ value, onChangePart }) {
  const [activePart, setActivePart] = useState("day");
  const scrollRef = useRef(null);
  const date = parseLocalISODate(value) ?? defaultBirthDate();
  const monthIndex = date.getMonth();
  const month = MONTH_OPTIONS[monthIndex]?.label ?? "Jun";
  const day = date.getDate();
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();
  const activeOptions = useMemo(() => {
    if (activePart === "month") {
      return MONTH_OPTIONS;
    }

    if (activePart === "year") {
      return range(currentYear - 90, currentYear - 13)
        .reverse()
        .map((itemYear) => ({
          value: itemYear,
          label: String(itemYear),
        }));
    }

    return range(1, daysInMonth(year, monthIndex)).map((itemDay) => ({
      value: itemDay,
      label: String(itemDay),
    }));
  }, [activePart, currentYear, monthIndex, year]);
  const activeValue =
    activePart === "month" ? monthIndex : activePart === "year" ? year : day;

  useEffect(() => {
    const activeIndex = Math.max(
      0,
      activeOptions.findIndex((option) => option.value === activeValue)
    );
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: activeIndex * 48,
        animated: true,
      });
    }, 40);

    return () => clearTimeout(id);
  }, [activeOptions, activeValue]);

  const handleWheelScrollEnd = (event) => {
    const nextIndex = clamp(
      Math.round(event.nativeEvent.contentOffset.y / 48),
      0,
      activeOptions.length - 1
    );
    const nextOption = activeOptions[nextIndex];
    if (nextOption && nextOption.value !== activeValue) {
      onChangePart(activePart, nextOption.value);
    }
  };

  const handleWheelDragEnd = (event) => {
    const velocityY = Math.abs(event.nativeEvent.velocity?.y ?? 0);
    if (velocityY < 0.15) {
      handleWheelScrollEnd(event);
    }
  };

  return (
    <View style={styles.dateBlock}>
      <View style={styles.dateCards}>
        {[
          { key: "day", label: "Day", value: day, flex: 0.85 },
          { key: "month", label: "Month", value: month, flex: 1.1 },
          { key: "year", label: "Year", value: year, flex: 1.1 },
        ].map((card) => (
          <Pressable
            key={card.key}
            accessibilityRole="button"
            accessibilityState={{ selected: activePart === card.key }}
            accessibilityLabel={`Select ${card.label}`}
            onPress={() => setActivePart(card.key)}
            style={({ pressed }) => [
              styles.dateCard,
              activePart === card.key && styles.dateCardActive,
              { flex: card.flex },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.dateCardLabel}>{card.label}</Text>
            <Text style={styles.dateCardValue}>{card.value}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.dateWheelFrame}>
        <View pointerEvents="none" style={styles.dateWheelHighlight} />
        <ScrollView
          ref={scrollRef}
          style={styles.dateWheel}
          contentContainerStyle={styles.dateWheelContent}
          showsVerticalScrollIndicator={false}
          snapToInterval={48}
          snapToAlignment="start"
          decelerationRate="normal"
          nestedScrollEnabled
          onMomentumScrollEnd={handleWheelScrollEnd}
          onScrollEndDrag={handleWheelDragEnd}
        >
          {activeOptions.map((option) => {
            const selected = option.value === activeValue;
            return (
              <Pressable
                key={`${activePart}-${option.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChangePart(activePart, option.value)}
                style={({ pressed }) => [
                  styles.dateWheelOption,
                  selected && styles.dateWheelOptionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.dateWheelText,
                    selected && styles.dateWheelTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function SupplementManualSheet({ visible, rows, onAdd, onRemove, onClose }) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [schedulePreset, setSchedulePreset] = useState("daily");
  const [customFrequency, setCustomFrequency] = useState("");

  useEffect(() => {
    if (!visible) return;
    setName("");
    setDose("");
    setSchedulePreset("daily");
    setCustomFrequency("");
  }, [visible]);

  const canAdd = Boolean(name.trim());
  const addRow = () => {
    if (!canAdd) return false;
    const customPreset =
      schedulePreset === "custom"
        ? SUPPLEMENT_SCHEDULE_PRESETS.find(
            (preset) =>
              preset.value !== "custom" &&
              preset.label.toLowerCase() ===
                customFrequency.trim().toLowerCase()
          )
        : null;
    const schedule = buildScheduleFromPreset(
      customPreset?.value ?? schedulePreset,
      {
        anchorDate: toISODate(new Date()),
        customLabel: customFrequency,
      }
    );
    onAdd({
      ...createSupplementRow(),
      name: name.trim(),
      dose: dose.trim(),
      ...schedule,
    });
    setName("");
    setDose("");
    setSchedulePreset("daily");
    setCustomFrequency("");
    return true;
  };

  const handleDone = () => {
    if (canAdd) {
      addRow();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetBackdrop}
      >
        <Pressable style={styles.sheetFill} onPress={onClose} />
        <View style={styles.manualSheetCard}>
          <View style={styles.manualSheetHeader}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>Add supplement</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close manual supplement entry"
                onPress={onClose}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={onboardingV6.ink} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.manualSheetScroll}
            contentContainerStyle={styles.manualSheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.inputStack}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Supplement name"
                placeholderTextColor={onboardingV6.faint}
                style={styles.textInput}
              />
              <TextInput
                value={dose}
                onChangeText={setDose}
                placeholder="Dosage, e.g. 5g"
                placeholderTextColor={onboardingV6.faint}
                style={styles.textInput}
              />
            </View>

            <View style={styles.frequencySection}>
              <Text style={styles.frequencyLabel}>How often?</Text>
              <View style={styles.frequencyWrap}>
                {SUPPLEMENT_SCHEDULE_PRESETS.map((option) => (
                  <ChipPill
                    key={option.value}
                    label={option.label}
                    selected={schedulePreset === option.value}
                    onPress={() => setSchedulePreset(option.value)}
                  />
                ))}
              </View>
              {schedulePreset === "custom" ? (
                <TextInput
                  value={customFrequency}
                  onChangeText={setCustomFrequency}
                  placeholder="e.g. Mondays and Thursdays"
                  placeholderTextColor={onboardingV6.faint}
                  style={styles.textInput}
                />
              ) : null}
            </View>

            {rows.length ? (
              <View style={styles.addedList}>
                {rows.map((row) => (
                  <View key={row.id} style={styles.addedRow}>
                    <View style={styles.addedCopy}>
                      <Text style={styles.addedName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={styles.addedMeta} numberOfLines={1}>
                        {[row.dose, getSupplementScheduleLabel(row)]
                          .filter(Boolean)
                          .join(" - ")}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${row.name}`}
                      onPress={() => onRemove(row.id)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color={onboardingV6.muted}
                      />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.sheetActions}>
            <GhostButton
              label="Add another"
              onPress={addRow}
              style={styles.sheetAction}
            />
            <OnboardingCTA
              label="Done"
              onPress={handleDone}
              style={styles.sheetAction}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LoaderScreen({ onComplete }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const calledRef = useRef(false);

  useEffect(() => {
    const totalDuration = LOADER_LINE_DURATIONS.reduce(
      (sum, duration) => sum + duration,
      0
    );
    const start = Date.now();
    let frameId = 0;

    const tick = () => {
      const nextElapsed = Math.min(Date.now() - start, totalDuration);
      setElapsedMs(nextElapsed);

      if (nextElapsed >= totalDuration) {
        if (!calledRef.current) {
          calledRef.current = true;
          onComplete();
        }
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [onComplete]);

  return (
    <View style={styles.loaderContent}>
      <View style={styles.loaderTitleBlock}>
        <Text style={styles.loaderTitle}>
          {"Hang tight, we're\npersonalising your stack."}
        </Text>
      </View>
      <View style={styles.loaderSpacer} />
      <View style={styles.loaderList}>
        {LOADER_LINES.map((line, index) => {
          const lineStart = LOADER_LINE_DURATIONS.slice(0, index).reduce(
            (sum, duration) => sum + duration,
            0
          );
          const rawProgress = clamp(
            (elapsedMs - lineStart) / LOADER_LINE_DURATIONS[index],
            0,
            1
          );
          const pct = easeInOutCubic(rawProgress);
          const done = rawProgress >= 1;
          const active = rawProgress > 0 && rawProgress < 1;
          return (
            <View key={line}>
              <View style={styles.loaderRow}>
                <Text
                  style={[
                    styles.loaderLineText,
                    (done || active) && styles.loaderLineTextActive,
                  ]}
                >
                  {line}
                </Text>
                <View
                  style={[
                    styles.loaderBadge,
                    (done || active) && styles.loaderBadgeActive,
                  ]}
                >
                  {done || active ? (
                    <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                  ) : null}
                </View>
              </View>
              <View style={styles.loaderTrack}>
                <View style={[styles.loaderFill, { width: `${pct * 100}%` }]} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Helper screen sub-components ────────────────────────────────────────────

function HelperPager({ index, total }) {
  return (
    <View style={styles.helperPager}>
      <View style={styles.helperDots}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[styles.helperDot, i === index && styles.helperDotActive]}
          />
        ))}
      </View>
    </View>
  );
}

function HelperPreviewCard({ children }) {
  return <View style={styles.helperCard}>{children}</View>;
}

const EVIDENCE_ARC_R = 92;
const EVIDENCE_CX = 120;
const EVIDENCE_CY = 122;
const EVIDENCE_ARC_LEN = Math.PI * EVIDENCE_ARC_R;

function EvidenceDial({ rating = 90 }) {
  const angle = Math.PI + (rating / 100) * Math.PI;
  const tipX = EVIDENCE_CX + EVIDENCE_ARC_R * Math.cos(angle);
  const tipY = EVIDENCE_CY + EVIDENCE_ARC_R * Math.sin(angle);
  const filled = EVIDENCE_ARC_LEN * (rating / 100);

  return (
    <View style={styles.dialWrapper}>
      <Svg
        width={240}
        height={140}
        viewBox="0 0 240 140"
        style={styles.dialSvg}
      >
        <Defs>
          <SvgLinearGradient id="evGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#F4E1B5" />
            <Stop offset="35%" stopColor="#F4D77E" />
            <Stop offset="70%" stopColor="#7BCB6B" />
            <Stop offset="100%" stopColor="#3FA94E" />
          </SvgLinearGradient>
        </Defs>
        <Path
          d="M 28 122 A 92 92 0 0 1 212 122"
          stroke="#ECE7E2"
          strokeWidth={22}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 28 122 A 92 92 0 0 1 212 122"
          stroke="url(#evGrad)"
          strokeWidth={22}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[filled, EVIDENCE_ARC_LEN]}
        />
        <Circle cx={tipX} cy={tipY} r={9} fill="#3FA94E" />
        <Circle
          cx={tipX}
          cy={tipY}
          r={9}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.5}
        />
      </Svg>
      <View style={styles.dialLabel}>
        <Text style={styles.dialCaption}>Evidence Rating</Text>
        <View style={styles.dialScoreRow}>
          <Text style={styles.dialScore}>{rating}</Text>
          <Text style={styles.dialDenom}>/100</Text>
        </View>
      </View>
    </View>
  );
}

function HelperH1Content() {
  return (
    <>
      <View style={styles.helperCardTitleRow}>
        <Text style={styles.helperCardTitle}>Creatine Monohydrate</Text>
        <Svg width={16} height={16} viewBox="0 0 16 16">
          <Circle cx={8} cy={8} r={8} fill="#2F8FE6" />
          <Path
            d="M 4.5 8 L 7 10.5 L 11.5 5.5"
            stroke="#FFFFFF"
            strokeWidth={1.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <EvidenceDial rating={90} />
      <View style={styles.helperStatusPill}>
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Circle cx={7} cy={7} r={6} fill="#3FA94E" />
          <Path
            d="M 4 7 L 6 9 L 10 5"
            stroke="#FFFFFF"
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.helperStatusText}>
          Strong evidence – keep taking
        </Text>
      </View>
    </>
  );
}

const SYMPTOM_ROWS = [
  { label: "Anti-aging" },
  { label: "Anti-inflammatory" },
  { label: "Blood pressure control", active: true },
  { label: "Blood sugar control" },
  { label: "Bone health" },
  { label: "Cardiovascular health" },
];

function HelperSymptomRow({ label, active }) {
  return (
    <View
      style={[styles.helperSymptomRow, active && styles.helperSymptomRowActive]}
    >
      <Text
        style={[
          styles.helperSymptomText,
          active && styles.helperSymptomTextActive,
        ]}
      >
        {label}
      </Text>
      <Svg
        width={active ? 14 : 10}
        height={active ? 14 : 10}
        viewBox="0 0 10 10"
      >
        <Path
          d="M 2 1 L 7 5 L 2 9"
          stroke={active ? onboardingV6.ink : onboardingV6.faint}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

function HelperH2Content() {
  return (
    <View style={styles.helperSymptomList}>
      {SYMPTOM_ROWS.map((row) => (
        <HelperSymptomRow
          key={row.label}
          label={row.label}
          active={row.active}
        />
      ))}
    </View>
  );
}

const RANK_ROWS_DATA = [
  { rank: 1, name: "Spirulina (Arthrospira platensis)", score: 88 },
  { rank: 2, name: "Psyllium husk", score: 83 },
  { rank: 3, name: "Cinnamon Extract", score: 78 },
];

function HelperRankRow({ rank, name, score }) {
  return (
    <View style={styles.helperRankRow}>
      <View style={styles.helperRankTop}>
        <View style={styles.helperRankBadge}>
          <Text style={styles.helperRankNum}>#{rank}</Text>
        </View>
        <View style={styles.helperRankCopy}>
          <Text style={styles.helperRankName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.helperRankSub}>Rank {rank} of 26</Text>
        </View>
      </View>
      <View style={styles.helperRankDivider} />
      <Text style={styles.helperRankEvidence}>
        {"Evidence rating: "}
        <Text style={styles.helperRankScore}>{score}/100</Text>
      </Text>
    </View>
  );
}

function HelperH3Content() {
  return (
    <>
      <View style={styles.helperH3Header}>
        <View style={styles.helperH3HeaderLeft}>
          <Text style={styles.helperH3Title}>Cholesterol support</Text>
          <Text style={styles.helperH3Sub}>
            All supplements ranked for this benefit
          </Text>
        </View>
        <View style={styles.helperSuppsPill}>
          <Text style={styles.helperSuppsPillText}>26 supps</Text>
        </View>
      </View>
      <View style={styles.helperRankList}>
        {RANK_ROWS_DATA.map((row) => (
          <HelperRankRow key={row.rank} {...row} />
        ))}
      </View>
    </>
  );
}

function HelperSourceRow({ children }) {
  return (
    <View style={styles.helperSourceRow}>
      <Svg
        width={16}
        height={18}
        viewBox="0 0 16 18"
        fill="none"
        style={styles.helperSourceIcon}
      >
        <Path
          d="M 2 2 H 10 L 14 6 V 16 H 2 Z"
          stroke={onboardingV6.muted}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        <Path
          d="M 10 2 V 6 H 14"
          stroke={onboardingV6.muted}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        <Path
          d="M 5 9 H 11 M 5 12 H 11 M 5 15 H 9"
          stroke={onboardingV6.muted}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={styles.helperSourceText}>{children}</Text>
    </View>
  );
}

function HelperH4Content() {
  return (
    <>
      <View style={styles.helperH4Header}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M 12 20 C 4 14 2 10 2 6.5 C 2 4 4 2 6.5 2 C 8.5 2 11 3.5 12 6 C 13 3.5 15.5 2 17.5 2 C 20 2 22 4 22 6.5 C 22 10 20 14 12 20 Z"
            stroke={onboardingV6.ink}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <Path
            d="M 9 11 L 11.5 13 L 15 9"
            stroke={onboardingV6.ink}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <View style={styles.helperH4TitleBlock}>
          <Text style={styles.helperH4Title} numberOfLines={1}>
            Cardiovascular health
          </Text>
          <Text style={styles.helperH4Sub} numberOfLines={1}>
            #1 in cardiovascular health
          </Text>
        </View>
        <View style={styles.helperEvidenceBar} />
      </View>
      <View style={styles.helperSourceList}>
        <HelperSourceRow>
          {"Khan et al. (2021), eClinicalMedicine"}
        </HelperSourceRow>
        <HelperSourceRow>
          {
            '"Effect of omega-3 fatty acids on cardiovascular outcomes: a meta-analysis of RCTs."'
          }
        </HelperSourceRow>
        <HelperSourceRow>
          {
            "38 trials · 149,051 participants. Omega-3 supplementation significantly reduced cardiovascular mortality and heart attacks."
          }
        </HelperSourceRow>
      </View>
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function QuestionnaireScreen({ standalone = false } = {}) {
  const params = useLocalSearchParams();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const stepParam = Array.isArray(params.step) ? params.step[0] : params.step;
  const requestedMode =
    typeof modeParam === "string" ? normalizeOnboardingMode(modeParam) : null;
  const [draftMode, setDraftMode] = useState("first_run");
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const autoAdvanceTimeoutRef = useRef(null);
  const nameInputRef = useRef(null);
  const successInputRef = useRef(null);
  const signupCompletedRef = useRef(false);
  const [{ stepKey, answers }, dispatch] = useReducer(answersReducer, {
    stepKey: "welcome",
    answers: createInitialAnswers(),
  });

  const visibleStepKeys = useMemo(() => getVisibleStepKeys(answers), [answers]);
  const progress = useMemo(
    () => getProgress(stepKey, visibleStepKeys),
    [stepKey, visibleStepKeys]
  );
  const localizedAnnualWasteLabel = useMemo(
    () => getLocalizedAnnualWasteLabel(),
    []
  );
  const isStrictFirstRun = standalone && draftMode === "first_run";

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      const [savedAnswers, savedDraft] = await Promise.all([
        getQuestionnaireAnswers(),
        loadOnboardingDraft(),
      ]);
      if (!mounted) return;

      const nextMode =
        requestedMode ??
        savedDraft?.mode ??
        (savedAnswers?.completedAt ? "retake" : "first_run");
      const baseAnswers =
        nextMode === "retake"
          ? mergeStoredAnswers(createInitialAnswers(), savedAnswers)
          : createInitialAnswers();
      const nextAnswers = savedDraft?.answers
        ? mergeStoredAnswers(baseAnswers, savedDraft.answers)
        : baseAnswers;
      const nextVisibleSteps = getVisibleStepKeys(nextAnswers);
      const savedStepKey = __DEV__
        ? "landing"
        : resolveSavedStepKey(savedDraft);
      const nextStepKey =
        stepParam === "building" && savedAnswers?.completedAt
          ? BUILDING_STEP_KEY
          : coerceVisibleStepKey(savedStepKey, nextVisibleSteps);

      dispatch({
        type: "hydrate",
        answers: nextAnswers,
        stepKey: nextStepKey,
      });
      setDraftMode(nextMode);
      setHydrated(true);
    };

    hydrate();
    return () => {
      mounted = false;
    };
  }, [requestedMode, stepParam]);

  useEffect(() => {
    if (!hydrated || stepKey === BUILDING_STEP_KEY) return;
    if (HELPER_STEP_KEYS.includes(stepKey)) return;
    void saveOnboardingDraft({
      currentStepKey: stepKey,
      currentPageIndex: Math.max(0, ALL_STEP_KEYS.indexOf(stepKey)),
      answers,
      mode: draftMode,
    }).catch((error) => {
      console.error("Failed to save onboarding draft", error);
    });
  }, [answers, draftMode, hydrated, stepKey]);

  useEffect(() => {
    if (!hydrated || stepKey === BUILDING_STEP_KEY) return;
    if (HELPER_STEP_KEYS.includes(stepKey)) return;
    const coerced = coerceVisibleStepKey(stepKey, visibleStepKeys);
    if (coerced !== stepKey) {
      dispatch({ type: "setStep", stepKey: coerced });
    }
  }, [hydrated, stepKey, visibleStepKeys]);

  useEffect(() => {
    if (stepKey === "name") {
      const id = setTimeout(() => nameInputRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
    if (stepKey === "success") {
      const id = setTimeout(() => successInputRef.current?.focus(), 120);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [stepKey]);

  const setField = useCallback((field, value) => {
    dispatch({ type: "setField", field, value });
  }, []);

  const setFields = useCallback((values) => {
    dispatch({ type: "setFields", values });
  }, []);

  const clearAutoAdvanceTimeout = useCallback(() => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
  }, []);

  const goBack = useCallback(() => {
    if (stepKey === BUILDING_STEP_KEY) return true;
    if (HELPER_STEP_KEYS.includes(stepKey)) return true;

    clearAutoAdvanceTimeout();

    const currentIndex = visibleStepKeys.indexOf(stepKey);
    if (currentIndex > 0) {
      triggerImpact();
      dispatch({ type: "setStep", stepKey: visibleStepKeys[currentIndex - 1] });
      return true;
    }

    if (!isStrictFirstRun) {
      router.back();
    }
    return true;
  }, [clearAutoAdvanceTimeout, isStrictFirstRun, stepKey, visibleStepKeys]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () =>
      goBack()
    );
    return () => subscription.remove();
  }, [goBack]);

  const canContinue = useMemo(() => {
    if (stepKey === "name") {
      return Boolean(answers.name.trim());
    }
    if (stepKey === "lifeStage") {
      return Boolean(answers.lifeStage);
    }
    return true;
  }, [answers.lifeStage, answers.name, stepKey]);

  const continueLabel = useMemo(() => {
    if (stepKey === "landing") return "Begin";
    if (stepKey === "welcome") return "Let's go";
    if (stepKey === "stack") return "I'm all set";
    if (stepKey === "insightStacks") return "See how we'll help";
    if (stepKey === "insightSafety") return "Got it";
    if (stepKey === "consent") return "Agree & continue";
    return "Next";
  }, [stepKey]);

  const moveToNextStep = useCallback(
    (sourceStepKey = stepKey, nextAnswers = answers) => {
      const nextVisibleStepKeys = getVisibleStepKeys(nextAnswers);
      const currentIndex = nextVisibleStepKeys.indexOf(sourceStepKey);
      const nextStepKey =
        currentIndex >= 0
          ? nextVisibleStepKeys[currentIndex + 1]
          : nextVisibleStepKeys[0];
      if (nextStepKey) {
        dispatch({ type: "setStep", stepKey: nextStepKey });
      }
    },
    [answers, stepKey]
  );

  const autoAdvanceSingleSelectStep = useCallback(
    (sourceStepKey, nextAnswers) => {
      triggerImpact();
      clearAutoAdvanceTimeout();
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        autoAdvanceTimeoutRef.current = null;
        moveToNextStep(sourceStepKey, nextAnswers);
      }, AUTO_ADVANCE_DELAY_MS);
    },
    [clearAutoAdvanceTimeout, moveToNextStep]
  );

  useEffect(() => clearAutoAdvanceTimeout, [clearAutoAdvanceTimeout]);

  const completeQuestionnaire = useCallback(async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
      const completedAnswers = buildQuestionnairePayload({
        ...answers,
        consentAccepted: true,
      });

      await AsyncStorage.setItem(
        QUESTIONNAIRE_STORAGE_KEY,
        JSON.stringify({
          ...completedAnswers,
          completedAt: new Date().toISOString(),
        })
      );
      await clearOnboardingDraft();

      router.setParams({ mode: draftMode, step: "building" });
      notifyOnboardingGateChange();
      dispatch({ type: "setStep", stepKey: BUILDING_STEP_KEY });
    } catch (error) {
      console.error("Could not save onboarding", error);
      Alert.alert(
        "Could not save onboarding",
        "Please try again. Your answers are still on screen."
      );
    } finally {
      setSubmitting(false);
    }
  }, [answers, draftMode, submitting]);

  const routeAfterHelpers = useCallback(() => {
    const signupCompleted = signupCompletedRef.current;
    if (!signupCompleted) {
      router.replace(`/onboarding?mode=${draftMode}&step=paywall`);
      return;
    }
    if (standalone) {
      router.replace("/");
      return;
    }
    Alert.alert("Onboarding saved", "Your answers were saved.", [
      { text: "Done", onPress: () => router.back() },
    ]);
  }, [draftMode, standalone]);

  const routeAfterBuilding = useCallback(async () => {
    try {
      const signupCompleted =
        (await AsyncStorage.getItem(SIGNUP_COMPLETED_STORAGE_KEY)) === "true";

      notifyOnboardingGateChange();
      triggerSuccess();

      if (standalone && draftMode === "retake") {
        router.replace("/");
        return;
      }

      // For retake (non-standalone) go straight through without helpers.
      if (draftMode === "retake") {
        if (!signupCompleted) {
          router.replace(`/onboarding?mode=${draftMode}&step=paywall`);
          return;
        }
        router.replace("/");
        return;
      }

      // First-run: show helpers before routing to home / paywall.
      signupCompletedRef.current = signupCompleted;
      dispatch({ type: "setStep", stepKey: HELPER_STEP_KEYS[0] });
    } catch (error) {
      console.error("Failed to finish onboarding route", error);
      router.replace("/");
    }
  }, [draftMode, standalone]);

  const handleContinue = useCallback(() => {
    if (!canContinue || submitting) return;

    if (stepKey === "dob" && !answers.dateOfBirth) {
      setField("dateOfBirth", toISODate(defaultBirthDate()));
    }

    if (stepKey === "sex" && answers.sexAtBirth === "male") {
      setFields({ lifeStage: "none", pregnancyStatus: "not_applicable" });
    }

    if (stepKey === "height") {
      setFields({
        heightCm: answers.heightCm || "172",
        heightFeet: answers.heightFeet || "5",
        heightInches: answers.heightInches || "8",
      });
    }

    if (stepKey === "weight") {
      setField("weightValue", answers.weightValue || "68");
    }

    if (stepKey === "consent") {
      setField("consentAccepted", true);
      void completeQuestionnaire();
      return;
    }

    triggerImpact();
    moveToNextStep();
  }, [
    answers.dateOfBirth,
    answers.heightCm,
    answers.heightFeet,
    answers.heightInches,
    answers.sexAtBirth,
    answers.weightValue,
    canContinue,
    completeQuestionnaire,
    moveToNextStep,
    setField,
    setFields,
    stepKey,
    submitting,
  ]);

  const updateDatePart = useCallback(
    (part, value) => {
      const current =
        parseLocalISODate(answers.dateOfBirth) ?? defaultBirthDate();
      const year = part === "year" ? value : current.getFullYear();
      const month = part === "month" ? value : current.getMonth();
      const maxDay = daysInMonth(year, month);
      const day = part === "day" ? value : clamp(current.getDate(), 1, maxDay);
      setField(
        "dateOfBirth",
        toISODate(new Date(year, month, day, 12, 0, 0, 0))
      );
      triggerImpact();
    },
    [answers.dateOfBirth, setField]
  );

  const toggleGoal = (value) => {
    if (answers.goals.includes(value)) {
      dispatch({ type: "toggleArray", field: "goals", value });
      triggerImpact();
      return;
    }
    if (answers.goals.length >= 3) return;
    dispatch({ type: "toggleArray", field: "goals", value });
    triggerImpact();
  };

  const convertHeightUnit = (unit) => {
    if (unit === answers.heightUnit) return;

    if (unit === "ft_in") {
      const cm = normalizePositiveNumber(answers.heightCm);
      if (!cm) {
        setField("heightUnit", "ft_in");
        return;
      }
      const totalInches = Math.round(cm / 2.54);
      setFields({
        heightUnit: "ft_in",
        heightFeet: String(Math.floor(totalInches / 12)),
        heightInches: String(totalInches % 12),
      });
      return;
    }

    const feet = normalizePositiveNumber(answers.heightFeet) || 0;
    const inches = normalizePositiveNumber(answers.heightInches) || 0;
    const totalInches = feet * 12 + inches;
    setFields({
      heightUnit: "cm",
      heightCm: totalInches ? String(Math.round(totalInches * 2.54)) : "172",
    });
  };

  const setHeightCmValue = (value) => {
    const cm = clamp(Math.round(Number(value) || 172), 120, 230);
    setFields({ heightUnit: "cm", heightCm: String(cm) });
  };

  const setHeightFeetValue = (value) => {
    const digits = String(value).replace(/\D/g, "");
    if (!digits) {
      setFields({ heightUnit: "ft_in", heightFeet: "" });
      return;
    }

    setFields({
      heightUnit: "ft_in",
      heightFeet: String(clamp(Number(digits), 3, 8)),
    });
  };

  const setHeightInchesValue = (value) => {
    const digits = String(value).replace(/\D/g, "");
    if (!digits) {
      setFields({ heightUnit: "ft_in", heightInches: "" });
      return;
    }

    setFields({
      heightUnit: "ft_in",
      heightInches: String(clamp(Number(digits), 0, 11)),
    });
  };

  const convertWeightUnit = (unit) => {
    if (unit === answers.weightUnit) return;

    const value = normalizePositiveNumber(answers.weightValue);
    if (!value) {
      setField("weightUnit", unit);
      return;
    }

    setFields({
      weightUnit: unit,
      weightValue:
        unit === "lb"
          ? String(Math.round(value * 2.20462262))
          : String(Math.round(value * 0.45359237)),
    });
  };

  const setWeightValue = (unit, value) => {
    const rangeBounds =
      unit === "kg" ? { min: 35, max: 200 } : { min: 75, max: 440 };
    const normalized = clamp(
      Math.round(Number(value) || (unit === "kg" ? 68 : 150)),
      rangeBounds.min,
      rangeBounds.max
    );
    setFields({ weightUnit: unit, weightValue: String(normalized) });
  };

  const renderStepContent = () => {
    if (stepKey === "landing") {
      return (
        <View style={styles.landingContent}>
          <View style={styles.landingMain}>
            <View style={styles.landingLogoTile}>
              <Image
                source={SupproLogo}
                resizeMode="contain"
                style={styles.landingLogo}
              />
            </View>
            <Text style={styles.landingTitle}>Welcome to Suppro</Text>
            <Text style={styles.landingSubtitle}>
              {
                "You should have all the information you need to create the best supplement stack for you. Let's make that happen."
              }
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log in"
            onPress={() => router.push("/login?mode=login")}
            style={({ pressed }) => [
              styles.loginPrompt,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.loginPromptText}>
              Already have an account?{" "}
              <Text style={styles.loginPromptStrong}>Log In</Text>
            </Text>
          </Pressable>
        </View>
      );
    }

    if (stepKey === "welcome") {
      return (
        <View style={styles.welcomeContent}>
          <QuestionHero
            centered
            title="A few quick questions"
            subtitle="We are going to ask you a few questions so that we can personalise your app."
          >
            <GlyphPerson />
          </QuestionHero>
        </View>
      );
    }

    if (stepKey === "name") {
      return (
        <>
          <QuestionHero title="What should we call you?" />
          <View style={styles.contentBlock}>
            <TextInput
              ref={nameInputRef}
              value={answers.name}
              onChangeText={(value) => setField("name", value)}
              onSubmitEditing={handleContinue}
              autoFocus
              returnKeyType="done"
              placeholder="Your name"
              placeholderTextColor={onboardingV6.faint}
              style={styles.textInput}
            />
          </View>
        </>
      );
    }

    if (stepKey === "dob") {
      return (
        <>
          <QuestionHero title="When were you born?" />
          <DatePickerCards
            value={answers.dateOfBirth}
            onChangePart={updateDatePart}
          />
        </>
      );
    }

    if (stepKey === "sex") {
      return (
        <>
          <QuestionHero title="What is your sex at birth?" />
          <View style={styles.optionStack}>
            {SEX_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                selected={answers.sexAtBirth === option.value}
                onPress={() => {
                  const nextAnswers = {
                    ...answers,
                    sexAtBirth: option.value,
                    ...(option.value === "male"
                      ? {
                          lifeStage: "none",
                          pregnancyStatus: "not_applicable",
                        }
                      : {
                          lifeStage: "",
                          pregnancyStatus: "",
                        }),
                  };
                  setFields(nextAnswers);
                  autoAdvanceSingleSelectStep("sex", nextAnswers);
                }}
              />
            ))}
          </View>
        </>
      );
    }

    if (stepKey === "height") {
      return (
        <HeightScreen
          unit={answers.heightUnit}
          heightCm={answers.heightCm}
          heightFeet={answers.heightFeet}
          heightInches={answers.heightInches}
          onUnitChange={convertHeightUnit}
          onCmChange={setHeightCmValue}
          onFeetChange={setHeightFeetValue}
          onInchesChange={setHeightInchesValue}
        />
      );
    }

    if (stepKey === "weight") {
      return (
        <WeightScreen
          unit={answers.weightUnit}
          value={answers.weightValue}
          onUnitChange={convertWeightUnit}
          onValueChange={setWeightValue}
        />
      );
    }

    if (stepKey === "goals") {
      return (
        <>
          <QuestionHero
            title="What brings you here?"
            subtitle="Pick up to three."
          />
          <View style={styles.optionStack}>
            {GOAL_OPTIONS.map((option) => {
              const selected = answers.goals.includes(option.value);
              const disabled = answers.goals.length >= 3 && !selected;
              return (
                <CheckRow
                  key={option.value}
                  label={option.label}
                  selected={selected}
                  onPress={() => toggleGoal(option.value)}
                  style={disabled ? styles.disabledRow : null}
                />
              );
            })}
          </View>
        </>
      );
    }

    if (stepKey === "success") {
      return (
        <>
          <QuestionHero title={"What does 'better' look like in 90 days?"} />
          <View style={styles.contentBlock}>
            <TextInput
              ref={successInputRef}
              value={answers.success90Days}
              onChangeText={(value) => setField("success90Days", value)}
              autoFocus
              multiline
              textAlignVertical="top"
              placeholder="e.g. Sleep through the night, wake up clear-headed, and not crash at 3pm."
              placeholderTextColor={onboardingV6.faint}
              style={[styles.textInput, styles.textareaInput]}
            />
          </View>
        </>
      );
    }

    if (stepKey === "confidence") {
      return (
        <>
          <QuestionHero title="How confident are you with supplements?" />
          <View style={styles.optionStack}>
            {CONFIDENCE_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                selected={answers.confidence === option.value}
                onPress={() => {
                  const nextAnswers = {
                    ...answers,
                    confidence: option.value,
                  };
                  setField("confidence", option.value);
                  autoAdvanceSingleSelectStep("confidence", nextAnswers);
                }}
              />
            ))}
          </View>
        </>
      );
    }

    if (stepKey === "insightStacks") {
      return (
        <View style={styles.insightContent}>
          <QuestionHero
            centered
            title="Stacks add up."
            subtitle={`The average person wastes ${localizedAnnualWasteLabel} a year on supplements that don't work. We'll make sure you aren't one of them.`}
          >
            <GlyphPills />
          </QuestionHero>
        </View>
      );
    }

    if (stepKey === "metrics") {
      return (
        <>
          <QuestionHero title="What should we help you track?" />
          <View style={styles.optionStack}>
            {METRIC_OPTIONS.map((option) => {
              const selected = answers.trackMetrics.includes(option.value);
              return (
                <CheckRow
                  key={option.value}
                  label={option.label}
                  selected={selected}
                  onPress={() => {
                    dispatch({
                      type: "toggleArray",
                      field: "trackMetrics",
                      value: option.value,
                    });
                    triggerImpact();
                  }}
                />
              );
            })}
          </View>
        </>
      );
    }

    if (stepKey === "stack") {
      const rows = normalizeSupplementRows(answers.supplementRows).filter(
        (row) => row.name.trim()
      );
      return (
        <>
          <QuestionHero
            title="What are you taking now?"
            subtitle="Add supplements now, or skip if none."
          />
          <View style={styles.contentBlock}>
            <GhostButton
              label="Add supplement"
              onPress={() => setManualSheetOpen(true)}
            />
            <View style={styles.stackList}>
              {rows.length ? (
                rows.map((row) => (
                  <View key={row.id} style={styles.stackRow}>
                    <View style={styles.stackRowCopy}>
                      <Text style={styles.stackRowText} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={styles.stackRowMeta} numberOfLines={1}>
                        {[row.dose, getSupplementScheduleLabel(row)]
                          .filter(Boolean)
                          .join(" - ")}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyDashed}>
                  <Text style={styles.emptyDashedText}>
                    {"Nothing added yet - that's fine."}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </>
      );
    }

    if (stepKey === "lifeStage") {
      return (
        <>
          <QuestionHero
            title="Are you pregnant or trying?"
            subtitle="Some supplements aren't safe during pregnancy or breastfeeding."
          />
          <View style={styles.optionStack}>
            {LIFE_STAGE_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                selected={answers.lifeStage === option.value}
                onPress={() => {
                  const nextAnswers = {
                    ...answers,
                    lifeStage: option.value,
                    pregnancyStatus:
                      option.value === "none" ? "no" : option.value,
                  };
                  setFields(nextAnswers);
                  autoAdvanceSingleSelectStep("lifeStage", nextAnswers);
                }}
              />
            ))}
          </View>
        </>
      );
    }

    if (stepKey === "insightSafety") {
      return (
        <View style={styles.insightContent}>
          <QuestionHero
            centered
            title="Safety first."
            subtitle="Nearly 1 in 2 people taking supplements with prescription medications may face potential interactions. Every supplement page includes guidance on risks and interactions."
          >
            <GlyphHeart />
          </QuestionHero>
        </View>
      );
    }

    if (stepKey === "evidence") {
      return (
        <>
          <QuestionHero title="How evidence-backed should your supplements be?" />
          <View style={styles.optionStack}>
            {EVIDENCE_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                description={option.description}
                selected={answers.evidencePreference === option.value}
                onPress={() => {
                  const nextAnswers = {
                    ...answers,
                    evidencePreference: option.value,
                    evidenceStrength: option.evidenceStrength,
                    mixedEvidence: option.mixedEvidence,
                    priorityFactors: getRecommendationFields({
                      ...answers,
                      evidencePreference: option.value,
                    }).priorityFactors,
                  };
                  setFields({
                    evidencePreference: option.value,
                    evidenceStrength: option.evidenceStrength,
                    mixedEvidence: option.mixedEvidence,
                    priorityFactors: nextAnswers.priorityFactors,
                  });
                  autoAdvanceSingleSelectStep("evidence", nextAnswers);
                }}
              />
            ))}
          </View>
        </>
      );
    }

    if (stepKey === "priorities") {
      return (
        <>
          <QuestionHero title="How do you prefer to choose supplements?" />
          <View style={styles.optionStack}>
            {PRIORITY_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                description={option.description}
                selected={answers.priorityPreference === option.value}
                onPress={() => {
                  const nextAnswers = {
                    ...answers,
                    priorityPreference: option.value,
                    priorityFactors: getRecommendationFields({
                      ...answers,
                      priorityPreference: option.value,
                    }).priorityFactors,
                  };
                  setFields({
                    priorityPreference: option.value,
                    priorityFactors: nextAnswers.priorityFactors,
                  });
                  autoAdvanceSingleSelectStep("priorities", nextAnswers);
                }}
              />
            ))}
          </View>
        </>
      );
    }

    if (stepKey === "caution") {
      return (
        <>
          <QuestionHero
            title="What’s your comfort level with emerging supplements?"
            subtitle="Some supplements are backed by stronger research, while others show promise with earlier evidence."
          />
          <View style={styles.optionStack}>
            {CAUTION_OPTIONS.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                description={option.description}
                selected={answers.cautionPreference === option.value}
                onPress={() => {
                  const nextAnswers = {
                    ...answers,
                    cautionPreference: option.value,
                    cautionLevel: option.cautionLevel,
                  };
                  setFields({
                    cautionPreference: option.value,
                    cautionLevel: option.cautionLevel,
                  });
                  autoAdvanceSingleSelectStep("caution", nextAnswers);
                }}
              />
            ))}
          </View>
        </>
      );
    }

    if (stepKey === "routine") {
      return (
        <>
          <QuestionHero title="How do you prefer to take your supplements?" />
          <View style={styles.contentBlock}>
            <View style={styles.inlineOptionStack}>
              {TIMING_OPTIONS.map((option) => (
                <OptionRow
                  key={option.value}
                  label={option.label}
                  selected={answers.supplementTiming === option.value}
                  onPress={() => {
                    const nextAnswers = {
                      ...answers,
                      supplementTiming: option.value,
                      adherencePlan: option.value,
                    };
                    setFields({
                      supplementTiming: option.value,
                      adherencePlan: option.value,
                    });
                    autoAdvanceSingleSelectStep("routine", nextAnswers);
                  }}
                />
              ))}
            </View>
          </View>
        </>
      );
    }

    if (stepKey === "consent") {
      return (
        <View style={styles.consentContent}>
          <QuestionHero centered title="One last thing." />
          <Text style={styles.consentNoticeText}>
            {
              "Suppro is for educational purposes only. Recommendations are general guidance - always check with a medical professional before making changes."
            }
          </Text>
        </View>
      );
    }

    return null;
  };

  if (!hydrated) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={onboardingV6.primaryDk} />
      </View>
    );
  }

  if (stepKey === BUILDING_STEP_KEY) {
    return (
      <>
        <StatusBar style="dark" />
        <OnboardingShell
          progress={1}
          showTopBar
          showBack={false}
          scrollable={false}
        >
          <LoaderScreen onComplete={routeAfterBuilding} />
        </OnboardingShell>
      </>
    );
  }

  if (HELPER_STEP_KEYS.includes(stepKey)) {
    const helperIdx = HELPER_STEP_KEYS.indexOf(stepKey);
    const isLastHelper = helperIdx === HELPER_STEP_KEYS.length - 1;

    const handleHelperCta = () => {
      triggerImpact();
      if (isLastHelper) {
        routeAfterHelpers();
      } else {
        dispatch({
          type: "setStep",
          stepKey: HELPER_STEP_KEYS[helperIdx + 1],
        });
      }
    };

    const helperContentMap = {
      helperEvidence: (
        <>
          <QuestionHero
            title="How effective are the supplements you're taking?"
            subtitle="Every supplement in your stack gets a 0–100 evidence score, drawn from clinical literature and meta-analyses."
          />
          <View style={styles.helperCardWrap}>
            <HelperPreviewCard>
              <HelperH1Content />
            </HelperPreviewCard>
          </View>
        </>
      ),
      helperSymptom: (
        <>
          <QuestionHero
            title="Find the most evidence-backed supplements for your symptoms."
            subtitle="Browse multiple benefit categories – every one ranked by what the science actually supports."
          />
          <View style={styles.helperCardWrap}>
            <HelperPreviewCard>
              <HelperH2Content />
            </HelperPreviewCard>
          </View>
        </>
      ),
      helperRanked: (
        <>
          <QuestionHero
            title="See exactly which supplements lead each benefit."
            subtitle="For every benefit you care about, we rank every supplement by quality of evidence – so the best option is always at #1."
          />
          <View style={styles.helperCardWrap}>
            <HelperPreviewCard>
              <HelperH3Content />
            </HelperPreviewCard>
          </View>
        </>
      ),
      helperSources: (
        <>
          <QuestionHero
            title="Find the evidence behind every supplement."
            subtitle="Tap any benefit to see the studies, sample sizes, and findings we used to rank it. No mystery, no marketing."
          />
          <View style={styles.helperCardWrap}>
            <HelperPreviewCard>
              <HelperH4Content />
            </HelperPreviewCard>
          </View>
        </>
      ),
    };

    return (
      <>
        <StatusBar style="dark" />
        <OnboardingShell
          progress={1}
          showTopBar={false}
          showBack={false}
          scrollable
          footer={
            <OnboardingCTA
              label={HELPER_CTA_LABELS[helperIdx]}
              onPress={handleHelperCta}
            />
          }
        >
          <HelperPager index={helperIdx} total={HELPER_STEP_KEYS.length} />
          {helperContentMap[stepKey]}
        </OnboardingShell>
      </>
    );
  }

  const showTopBar = !["landing", "welcome"].includes(stepKey);
  const showBack = !["insightStacks", "insightSafety"].includes(stepKey);
  const isCenteredStatic = [
    "landing",
    "welcome",
    "insightStacks",
    "insightSafety",
    "consent",
  ].includes(stepKey);
  const shouldAutoAdvance = AUTO_ADVANCE_STEP_KEYS.includes(stepKey);
  const footer =
    stepKey === "success" ? (
      <View style={styles.splitFooter}>
        <GhostButton
          label="Skip"
          onPress={() => {
            setField("success90Days", "");
            moveToNextStep();
          }}
          style={styles.skipButton}
        />
        <OnboardingCTA
          label={continueLabel}
          onPress={handleContinue}
          disabled={!canContinue || submitting}
          style={styles.splitFooterCta}
        />
      </View>
    ) : shouldAutoAdvance ? null : (
      <OnboardingCTA
        label={submitting ? "Saving..." : continueLabel}
        onPress={handleContinue}
        disabled={!canContinue || submitting}
      />
    );

  return (
    <>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <OnboardingShell
          progress={progress}
          showTopBar={showTopBar}
          showBack={showBack}
          onBack={goBack}
          footer={footer}
          scrollable={!isCenteredStatic}
          contentContainerStyle={
            isCenteredStatic ? styles.staticShellContent : null
          }
        >
          {renderStepContent()}
        </OnboardingShell>
      </KeyboardAvoidingView>
      <SupplementManualSheet
        visible={manualSheetOpen}
        rows={normalizeSupplementRows(answers.supplementRows).filter((row) =>
          row.name.trim()
        )}
        onAdd={(row) => {
          setFields({
            takingSupplements: "yes",
            currentSupplementsSource: "manual",
            supplementRows: [
              ...normalizeSupplementRows(answers.supplementRows).filter(
                (item) => item.name.trim()
              ),
              row,
            ],
          });
        }}
        onRemove={(rowId) => {
          const nextRows = normalizeSupplementRows(
            answers.supplementRows
          ).filter((row) => row.id !== rowId);
          setFields({
            supplementRows: nextRows,
            takingSupplements: nextRows.length ? "yes" : "no",
          });
        }}
        onClose={() => setManualSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: onboardingV6.paper,
  },
  staticShellContent: {
    flex: 1,
  },
  welcomeContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingBottom: 44,
  },
  landingContent: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: onboardingV6.sidePadding,
    paddingBottom: 8,
  },
  landingMain: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 28,
  },
  landingLogoTile: {
    width: 112,
    height: 112,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: onboardingV6.softer,
    shadowColor: onboardingV6.primaryDk,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  landingLogo: {
    width: 70,
    height: 70,
    tintColor: "#000000",
  },
  landingTitle: {
    marginTop: 34,
    textAlign: "center",
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.4,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  landingSubtitle: {
    marginTop: 24,
    maxWidth: 342,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 28,
    fontFamily: typography.fontFamily.bodyMedium,
    color: onboardingV6.ink,
  },
  loginPrompt: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  loginPromptText: {
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    fontFamily: typography.fontFamily.bodyMedium,
    color: onboardingV6.ink,
  },
  loginPromptStrong: {
    fontFamily: typography.fontFamily.bodyBold,
  },
  insightContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingBottom: 44,
  },
  consentContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: onboardingV6.sidePadding,
    paddingBottom: 44,
  },
  contentBlock: {
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 20,
  },
  consentNoticeText: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 25,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.ink,
    textAlign: "center",
  },
  optionStack: {
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 20,
    gap: 10,
  },
  inlineOptionStack: {
    marginTop: 10,
    gap: 8,
  },
  chipWrap: {
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  textInput: {
    minHeight: 60,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    backgroundColor: onboardingV6.surface,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.ink,
  },
  textareaInput: {
    minHeight: 140,
    paddingTop: 14,
  },
  dateBlock: {
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 24,
  },
  dateCards: {
    flexDirection: "row",
    gap: 10,
  },
  dateCard: {
    height: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    backgroundColor: onboardingV6.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  dateCardActive: {
    borderColor: onboardingV6.primaryDk,
    backgroundColor: onboardingV6.softer,
  },
  dateCardLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: typography.fontFamily.monoMedium,
    color: onboardingV6.faint,
  },
  dateCardValue: {
    marginTop: 6,
    fontSize: 26,
    lineHeight: 32,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  dateWheelFrame: {
    marginTop: 40,
    height: 168,
    overflow: "hidden",
  },
  dateWheel: {
    flex: 1,
  },
  dateWheelContent: {
    paddingVertical: 60,
  },
  dateWheelHighlight: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 60,
    height: 48,
    borderRadius: 12,
    backgroundColor: onboardingV6.softer,
    zIndex: 0,
  },
  dateWheelOption: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  dateWheelOptionSelected: {
    borderRadius: 12,
  },
  dateWheelText: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
    opacity: 0.72,
  },
  dateWheelTextSelected: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: typography.fontFamily.bodyBold,
    color: onboardingV6.ink,
    opacity: 1,
  },
  measurementContent: {
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 20,
  },
  unitToggle: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: onboardingV6.softer,
  },
  unitToggleOption: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  unitToggleOptionSelected: {
    backgroundColor: onboardingV6.surface,
    shadowColor: onboardingV6.primaryDk,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  unitToggleText: {
    fontSize: 13.5,
    lineHeight: 17,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.muted,
  },
  unitToggleTextSelected: {
    color: onboardingV6.ink,
  },
  measurementValueRow: {
    marginTop: 40,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 6,
  },
  measurementValue: {
    fontSize: 78,
    lineHeight: 82,
    letterSpacing: -0.2,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  measurementUnit: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: typography.fontFamily.bodyMedium,
    color: onboardingV6.muted,
  },
  measurementSlider: {
    marginTop: 28,
    width: "100%",
    height: 48,
    justifyContent: "center",
  },
  measurementSliderTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: onboardingV6.border,
    overflow: "hidden",
  },
  measurementSliderFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: onboardingV6.primaryDk,
  },
  measurementSliderThumb: {
    position: "absolute",
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: onboardingV6.primaryDk,
    borderWidth: 3,
    borderColor: onboardingV6.surface,
    shadowColor: onboardingV6.primaryDk,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
    transform: [{ translateX: -14 }],
  },
  heightInputRow: {
    marginTop: 28,
    flexDirection: "row",
    gap: 12,
  },
  heightInputGroup: {
    flex: 1,
    gap: 8,
  },
  heightInputLabel: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: typography.fontFamily.monoMedium,
    color: onboardingV6.faint,
  },
  heightInput: {
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    backgroundColor: onboardingV6.surface,
    paddingHorizontal: 16,
    textAlign: "center",
    fontSize: 24,
    lineHeight: 30,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  ruler: {
    marginTop: 24,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    backgroundColor: onboardingV6.surface,
    overflow: "hidden",
  },
  rulerTick: {
    position: "absolute",
    top: 12,
    width: 1.5,
    height: 14,
    backgroundColor: onboardingV6.border,
    transform: [{ translateX: -0.75 }],
  },
  rulerTickTall: {
    height: 22,
  },
  rulerTickActive: {
    backgroundColor: onboardingV6.primaryDk,
  },
  rulerIndicator: {
    position: "absolute",
    top: 8,
    left: "50%",
    width: 3,
    height: 30,
    borderRadius: 2,
    backgroundColor: onboardingV6.primaryDk,
    transform: [{ translateX: -1.5 }],
  },
  disabledRow: {
    opacity: 0.36,
  },
  stackList: {
    marginTop: 24,
    gap: 10,
  },
  stackRow: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: onboardingV6.surface,
  },
  stackRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  stackRowText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.ink,
  },
  stackRowMeta: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
  },
  emptyDashed: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: onboardingV6.border,
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyDashedText: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
  },
  microCopy: {
    marginTop: 10,
    paddingHorizontal: 4,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.faint,
  },
  splitFooter: {
    flexDirection: "row",
    gap: 10,
  },
  skipButton: {
    flexBasis: 96,
  },
  splitFooterCta: {
    flex: 1,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(31,20,40,0.22)",
  },
  sheetFill: {
    flex: 1,
  },
  sheetCard: {
    maxHeight: "72%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: onboardingV6.paper,
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 10,
    paddingBottom: 24,
  },
  manualSheetCard: {
    maxHeight: "86%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: onboardingV6.paper,
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 10,
    paddingBottom: 24,
  },
  manualSheetHeader: {
    flexShrink: 0,
  },
  manualSheetScroll: {
    flexShrink: 1,
  },
  manualSheetScrollContent: {
    gap: 14,
    paddingBottom: 16,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 46,
    height: 4,
    borderRadius: 2,
    backgroundColor: onboardingV6.border,
  },
  sheetTitleRow: {
    marginTop: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  sheetScroll: {
    maxHeight: 420,
  },
  sheetOption: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetOptionSelected: {
    backgroundColor: onboardingV6.softer,
  },
  sheetOptionText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.ink,
  },
  sheetOptionTextSelected: {
    color: onboardingV6.primaryDk,
  },
  inputStack: {
    gap: 10,
  },
  frequencySection: {
    gap: 10,
  },
  frequencyLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.muted,
  },
  frequencyWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  addedList: {
    gap: 8,
  },
  addedRow: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: onboardingV6.softer,
  },
  addedCopy: {
    flex: 1,
    minWidth: 0,
  },
  addedName: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.ink,
  },
  addedMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
  },
  sheetActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  sheetAction: {
    flex: 1,
  },
  loaderContent: {
    flex: 1,
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 24,
    paddingBottom: 32,
  },
  loaderTitleBlock: {
    paddingTop: 60,
    alignItems: "center",
  },
  loaderTitle: {
    textAlign: "center",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  loaderSpacer: {
    flex: 1,
  },
  loaderList: {
    paddingBottom: 40,
    gap: 22,
  },
  loaderRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  loaderLineText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: onboardingV6.faint,
  },
  loaderLineTextActive: {
    color: onboardingV6.primaryDk,
  },
  loaderBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: onboardingV6.softer,
  },
  loaderBadgeActive: {
    backgroundColor: onboardingV6.primaryDk,
  },
  loaderTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: onboardingV6.softer,
  },
  loaderFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: onboardingV6.primaryDk,
  },
  pressed: {
    opacity: appTheme.card.pressedOpacity,
  },

  // ─── Helper screens ─────────────────────────────────────────────────────────
  helperPager: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  helperDots: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  helperDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(46,26,82,0.18)",
  },
  helperDotActive: {
    width: 18,
    backgroundColor: onboardingV6.primaryDk,
  },
  helperCardWrap: {
    paddingHorizontal: onboardingV6.sidePadding,
    paddingTop: 18,
    paddingBottom: 8,
  },
  helperCard: {
    backgroundColor: onboardingV6.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    padding: 16,
    shadowColor: "#2E1A52",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
    elevation: 8,
  },
  // H1 – Evidence dial
  helperCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  helperCardTitle: {
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
    flex: 1,
  },
  dialWrapper: {
    height: 196,
    position: "relative",
  },
  dialSvg: {
    alignSelf: "center",
  },
  dialLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 64,
    alignItems: "center",
  },
  dialCaption: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#3FA94E",
    letterSpacing: 0.3,
  },
  dialScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 2,
  },
  dialScore: {
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1,
    fontFamily: typography.fontFamily.heading,
    color: "#3FA94E",
  },
  dialDenom: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: typography.fontFamily.heading,
    color: "#3FA94E",
    opacity: 0.85,
  },
  helperStatusPill: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#F4F8F0",
    borderWidth: 1,
    borderColor: "#DBE9CE",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  helperStatusText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: "#2F6B4C",
  },
  // H2 – Symptom list
  helperSymptomList: {
    paddingVertical: 6,
  },
  helperSymptomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  helperSymptomRowActive: {
    backgroundColor: onboardingV6.surface,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 4,
    shadowColor: "#2E1A52",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 6,
  },
  helperSymptomText: {
    fontSize: 14.5,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodyMedium,
    color: onboardingV6.muted,
  },
  helperSymptomTextActive: {
    fontSize: 19,
    lineHeight: 24,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
    letterSpacing: -0.3,
  },
  // H3 – Ranked stack
  helperH3Header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  helperH3HeaderLeft: {
    flex: 1,
    marginRight: 10,
  },
  helperH3Title: {
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.3,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  helperH3Sub: {
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
    marginTop: 2,
  },
  helperSuppsPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: onboardingV6.surface,
    borderWidth: 1,
    borderColor: onboardingV6.border,
  },
  helperSuppsPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: typography.fontFamily.bodyBold,
    color: onboardingV6.ink,
  },
  helperRankList: {
    gap: 8,
  },
  helperRankRow: {
    backgroundColor: onboardingV6.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: onboardingV6.border,
    shadowColor: "#2E1A52",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 3,
  },
  helperRankTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  helperRankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2BE2C",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#C9931A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  helperRankNum: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  helperRankCopy: {
    flex: 1,
    minWidth: 0,
  },
  helperRankName: {
    fontSize: 14.5,
    lineHeight: 18,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  helperRankSub: {
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
    marginTop: 1,
  },
  helperRankDivider: {
    height: 1,
    backgroundColor: onboardingV6.border,
    marginVertical: 9,
  },
  helperRankEvidence: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
  },
  helperRankScore: {
    fontFamily: typography.fontFamily.bodyBold,
    color: onboardingV6.ink,
  },
  // H4 – Evidence sources
  helperH4Header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  helperH4TitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  helperH4Title: {
    fontSize: 14,
    lineHeight: 17,
    fontFamily: typography.fontFamily.heading,
    color: onboardingV6.ink,
  },
  helperH4Sub: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: typography.fontFamily.body,
    color: onboardingV6.muted,
    marginTop: 1,
  },
  helperEvidenceBar: {
    width: 28,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F2BE2C",
    flexShrink: 0,
  },
  helperSourceList: {
    gap: 8,
  },
  helperSourceRow: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#F4EFEA",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "flex-start",
  },
  helperSourceIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  helperSourceText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: typography.fontFamily.bodyMedium,
    color: onboardingV6.ink,
  },
});
