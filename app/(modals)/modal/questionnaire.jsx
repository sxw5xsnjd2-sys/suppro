import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Screen } from "@/components/common/layout/Screen";
import { Header } from "@/components/common/layout/Header";
import {
  isBloodPressureMetric,
  isValidBloodPressureValue,
  normalizeBloodPressureValue,
  PRESET_METRICS,
  PRESET_METRICS_BY_KEY,
} from "@/features/health/metricDefinitions";
import { supabase } from "@src/lib/supabase";
import {
  getQuestionnaireAnswers,
  QUESTIONNAIRE_STORAGE_KEY,
  SIGNUP_COMPLETED_STORAGE_KEY,
  SIGNUP_PROMPTED_STORAGE_KEY,
} from "@src/lib/onboarding";
import { colors, spacing, radius, shadows } from "@/theme";

const SEX_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "intersex", label: "Intersex" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const GOAL_OPTIONS = [
  { value: "energy", label: "Improve daily energy" },
  { value: "sleep", label: "Improve sleep quality" },
  { value: "mood", label: "Support mood and emotional balance" },
  { value: "stress", label: "Reduce stress and feel calmer" },
  { value: "performance", label: "Boost performance and recovery" },
  { value: "weight_management", label: "Support weight management" },
  { value: "cardio", label: "Improve cardiovascular health" },
  { value: "blood_pressure", label: "Support blood pressure" },
  { value: "cholesterol", label: "Support cholesterol" },
  { value: "glucose", label: "Support blood glucose" },
  { value: "fertility", label: "Support fertility" },
  { value: "hormone_balance", label: "Improve hormone balance" },
];

const EVIDENCE_OPTIONS = [
  {
    value: "strong_only",
    label: "Only supplements with strong human clinical trials",
  },
  {
    value: "mostly_strong",
    label: "Mostly strong evidence, but open to emerging research",
  },
  {
    value: "experimental_open",
    label: "I'm open to experimental or trending supplements",
  },
];

const PRIORITY_OPTIONS = [
  { value: "clinical_evidence", label: "Proven clinical evidence" },
  { value: "safety_profile", label: "Safety profile" },
  { value: "natural", label: "Natural / plant-based" },
  { value: "performance", label: "Performance enhancement" },
  { value: "popular", label: "Popular / trending" },
];

const MIXED_EVIDENCE_OPTIONS = [
  { value: "avoid", label: "Avoid them" },
  { value: "low_risk_only", label: "Only if low risk" },
  {
    value: "upside_high",
    label: "Happy to try if potential upside is high",
  },
];

const CAUTION_OPTIONS = [
  {
    value: "ultra_conservative",
    label: "Ultra conservative (minimal risk, proven only)",
  },
  { value: "balanced", label: "Balanced" },
  { value: "results_optimised", label: "Optimised for results" },
];

const ADHERENCE_OPTIONS = [
  { value: "1_2", label: "1-2 supplements per day" },
  { value: "3_4", label: "3-4 supplements per day" },
  { value: "5_plus", label: "5+ supplements per day" },
];

const FORM_OPTIONS = [
  { value: "capsule", label: "Capsule" },
  { value: "powder", label: "Powder" },
  { value: "liquid", label: "Liquid" },
  { value: "any", label: "Any" },
];

const ALLERGY_OPTIONS = [
  { value: "none", label: "None" },
  { value: "vegan", label: "Vegan" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "no_caffeine", label: "No caffeine" },
  { value: "no_gelatin", label: "No gelatin" },
];

const CARDIO_GOAL_KEYS = new Set([
  "cardio",
  "blood_pressure",
  "cholesterol",
  "glucose",
]);
const HORMONE_GOAL_KEYS = new Set(["fertility", "hormone_balance"]);

const METRIC_OPTIONS = [...PRESET_METRICS]
  .map((metric) => ({
    value: metric.key,
    label: metric.label,
    description: metric.description,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const SUPPLEMENT_FREQUENCY_OPTIONS = [
  { value: "1", label: "1 time per day" },
  { value: "2", label: "2 times per day" },
  { value: "3", label: "3 times per day" },
  { value: "4_plus", label: "4+ times per day" },
];

function isValidISODate(value) {
  if (!value || typeof value !== "string") return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function formatDate(value) {
  if (!isValidISODate(value)) return "Select date";
  const [year, month, day] = value.split("-").map(Number);
  const monthLabel = new Date(year, month - 1, day).toLocaleString("en-US", {
    month: "short",
  });
  return `${monthLabel} ${day}, ${year}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function normalizePositiveNumber(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseLegacyHeightValue(rawHeight) {
  const text = String(rawHeight || "").trim().toLowerCase();
  if (!text) return null;

  const feetInchesMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:ft|')\s*(\d+(?:\.\d+)?)?\s*(?:in|\"|$)?/
  );
  if (feetInchesMatch) {
    const feet = String(feetInchesMatch[1] ?? "").trim();
    const inches = String(feetInchesMatch[2] ?? "").trim();
    return {
      heightUnit: "ft_in",
      heightCm: "",
      heightFeet: feet,
      heightInches: inches,
    };
  }

  const numeric = normalizePositiveNumber(text);
  if (numeric === null) return null;
  return {
    heightUnit: "cm",
    heightCm: String(numeric),
    heightFeet: "",
    heightInches: "",
  };
}

function DatePickerModal({
  visible,
  initialDate,
  onSelect,
  onClose,
  title = "Select date",
}) {
  const parsed = isValidISODate(initialDate)
    ? new Date(`${initialDate}T00:00:00`)
    : new Date();
  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth());

  useEffect(() => {
    if (!visible) return;
    const nextParsed = isValidISODate(initialDate)
      ? new Date(`${initialDate}T00:00:00`)
      : new Date();
    setYear(nextParsed.getFullYear());
    setMonth(nextParsed.getMonth());
  }, [initialDate, visible]);

  const handleMonthChange = (delta) => {
    setMonth((prev) => {
      const next = prev + delta;
      if (next < 0) {
        setYear((currentYear) => currentYear - 1);
        return 11;
      }
      if (next > 11) {
        setYear((currentYear) => currentYear + 1);
        return 0;
      }
      return next;
    });
  };

  const dayCells = (() => {
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = daysInMonth(year, month);
    const blanks = Array.from({ length: firstDay }, () => null);
    const days = Array.from({ length: totalDays }, (_, index) => index + 1);
    return [...blanks, ...days];
  })();

  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.dateModalBackdrop}>
        <View style={styles.dateModalCard}>
          <View style={styles.dateModalHeader}>
            <Pressable onPress={() => handleMonthChange(-1)} hitSlop={8}>
              <Text style={styles.dateNavArrow}>{"<"}</Text>
            </Pressable>
            <View style={styles.dateModalHeaderText}>
              <Text style={styles.dateModalTitle}>{title}</Text>
              <Text style={styles.dateModalMonth}>{monthLabel}</Text>
            </View>
            <Pressable onPress={() => handleMonthChange(1)} hitSlop={8}>
              <Text style={styles.dateNavArrow}>{">"}</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
              <Text key={`${label}-${index}`} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {dayCells.map((day, index) => {
              const isoDate = day
                ? `${year}-${String(month + 1).padStart(2, "0")}-${String(
                    day
                  ).padStart(2, "0")}`
                : "";
              const isSelected = isoDate && isoDate === initialDate;
              const isFuture =
                isoDate && new Date(`${isoDate}T00:00:00`) > new Date();

              return (
                <Pressable
                  key={`${day ?? "blank"}-${index}`}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    (!day || isFuture) && styles.dayCellDisabled,
                  ]}
                  disabled={!day || isFuture}
                  onPress={() => {
                    if (!isoDate) return;
                    onSelect(isoDate);
                    onClose();
                  }}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      isSelected && styles.dayLabelSelected,
                      (!day || isFuture) && styles.dayLabelDisabled,
                    ]}
                  >
                    {day ?? ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onClose} style={styles.dateModalCloseButton}>
            <Text style={styles.dateModalCloseText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function metricBaselineDescription(metric) {
  if (!metric) return "";
  const context = metric.description ? `${metric.description} ` : "";
  if (metric.trackerType === "scale") {
    const min = Number.isFinite(metric.min) ? metric.min : 1;
    const max = Number.isFinite(metric.max) ? metric.max : 10;
    return `${context}Set your starting score (${min}-${max}).`;
  }
  if (metric.trackerType === "hours") {
    return `${context}Set your starting value in hours.`;
  }
  if (metric.trackerType === "number") {
    return metric.unit
      ? `${context}Set your starting value in ${metric.unit}.`
      : `${context}Set your starting value.`;
  }
  return `${context}Describe your starting baseline.`;
}

function buildMetricBaselineQuestions(selectedMetricKeys) {
  if (!Array.isArray(selectedMetricKeys) || selectedMetricKeys.length === 0) {
    return [];
  }

  return selectedMetricKeys
    .map((metricKey) => PRESET_METRICS_BY_KEY[metricKey])
    .filter(Boolean)
    .map((metric) => ({
      id: `metric_baseline_${metric.key}`,
      section: "3. Health Metrics Baseline",
      title: `What is your current ${metric.label}?`,
      description: metricBaselineDescription(metric),
      type: "metric_initial",
      metricKey: metric.key,
      required: true,
    }));
}

const BASE_QUESTIONS = [
  {
    id: "name",
    section: "1. Identity & Baseline",
    title: "What should we call you?",
    type: "text",
    field: "name",
    placeholder: "Your preferred name",
    required: true,
  },
  {
    id: "date_of_birth",
    section: "1. Identity & Baseline",
    title: "What is your date of birth?",
    type: "date",
    field: "dateOfBirth",
    required: true,
  },
  {
    id: "sex_at_birth",
    section: "1. Identity & Baseline",
    title: "What is your sex assigned at birth?",
    type: "single",
    field: "sexAtBirth",
    options: SEX_OPTIONS,
    required: true,
  },
  {
    id: "height",
    section: "1. Identity & Baseline",
    title: "What is your height?",
    description: "Select cm or ft/in and enter your value.",
    type: "height_input",
    required: true,
  },
  {
    id: "weight",
    section: "1. Identity & Baseline",
    title: "What is your current weight?",
    description: "Select kg or lbs and enter your value.",
    type: "weight_input",
    required: true,
  },
  {
    id: "goals",
    section: "2. Goals & Intent",
    title: "What are your top 1-3 goals right now?",
    type: "multi",
    field: "goals",
    options: GOAL_OPTIONS,
    required: true,
    maxSelect: 3,
  },
  {
    id: "success_90",
    section: "2. Goals & Intent",
    title: "What would success look like for you in 90 days?",
    type: "textarea",
    field: "success90Days",
    placeholder: "Describe your ideal 90-day outcome",
    required: true,
  },
  {
    id: "confidence",
    section: "2. Goals & Intent",
    title:
      "How confident are you that your current supplement routine is optimal?",
    description: "(1-10 scale)",
    type: "scale",
    field: "confidence",
    required: true,
  },
  {
    id: "track_metrics",
    section: "3. Health Metrics Baseline",
    title: "Which health metrics do you want to track in Suppro?",
    type: "multi",
    field: "trackMetrics",
    options: METRIC_OPTIONS,
    required: true,
  },
  {
    id: "current_inputs",
    section: "4. Current Inputs & Safety",
    title: "Are you currently taking any supplements?",
    description: "If yes, add each supplement with name, dose, and daily frequency.",
    type: "supplements",
    required: true,
  },
  {
    id: "medications_conditions",
    section: "4. Current Inputs & Safety",
    title:
      "Do you take any medications or have diagnosed conditions we should consider?",
    type: "conditions",
    required: true,
  },
  {
    id: "allergies",
    section: "4. Current Inputs & Safety",
    title:
      "Do you have any allergies, intolerances, or ingredient preferences?",
    type: "allergies",
    required: true,
  },
  {
    id: "pregnancy",
    section: "4. Current Inputs & Safety",
    title: "Are you pregnant, breastfeeding, or trying to conceive?",
    type: "single",
    field: "pregnancyStatus",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "not_applicable", label: "Not applicable" },
    ],
    required: true,
  },
  {
    id: "evidence_strength",
    section: "5. Evidence & Risk Preference",
    title: "How strong should the evidence be behind your supplement plan?",
    type: "single",
    field: "evidenceStrength",
    options: EVIDENCE_OPTIONS,
    required: true,
  },
  {
    id: "priority_factors",
    section: "5. Evidence & Risk Preference",
    title: "What matters most when choosing supplements?",
    description: "(Multi-select, choose up to 3)",
    type: "multi",
    field: "priorityFactors",
    options: PRIORITY_OPTIONS,
    required: true,
    maxSelect: 3,
  },
  {
    id: "mixed_evidence",
    section: "5. Evidence & Risk Preference",
    title: "How do you feel about supplements with mixed evidence?",
    type: "single",
    field: "mixedEvidence",
    options: MIXED_EVIDENCE_OPTIONS,
    required: true,
  },
  {
    id: "caution_level",
    section: "5. Evidence & Risk Preference",
    title: "How cautious do you want your plan to be?",
    type: "single",
    field: "cautionLevel",
    options: CAUTION_OPTIONS,
    required: true,
  },
  {
    id: "adherence",
    section: "6. Practical Adherence",
    title: "What kind of plan can you realistically stick to?",
    type: "single",
    field: "adherencePlan",
    options: ADHERENCE_OPTIONS,
    required: true,
  },
  {
    id: "preferred_form",
    section: "6. Practical Adherence",
    title: "Preferred form",
    description: "Capsule / powder / liquid",
    type: "single",
    field: "preferredForm",
    options: FORM_OPTIONS,
    required: true,
  },
  {
    id: "cardio_follow_up",
    section: "7. Conditional Follow-Ups",
    title:
      "If selected, do you know your latest cardio / blood pressure / cholesterol / glucose values?",
    type: "cardio_follow_up",
    required: true,
    isConditional: true,
    showWhen: (state) => state.goals.some((goal) => CARDIO_GOAL_KEYS.has(goal)),
  },
  {
    id: "sex_specific_follow_up",
    section: "7. Conditional Follow-Ups",
    title: "Optional fertility / hormone follow-up",
    type: "sex_follow_up",
    required: false,
    isConditional: true,
    showWhen: (state) =>
      state.goals.some((goal) => HORMONE_GOAL_KEYS.has(goal)),
  },
  {
    id: "consent",
    section: "8. Required Consent",
    title:
      "I understand this supplement plan is educational and not medical advice. I will consult my doctor before starting any new supplements.",
    type: "consent",
    required: true,
  },
];

function toggleInArray(current, value) {
  if (current.includes(value)) return current.filter((item) => item !== value);
  return [...current, value];
}

function OptionRow({ label, description, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        selected && styles.optionRowSelected,
        pressed && styles.optionRowPressed,
      ]}
    >
      <View style={styles.optionTextBlock}>
        <Text
          style={[styles.optionLabel, selected && styles.optionLabelSelected]}
        >
          {label}
        </Text>
        {description ? <Text style={styles.optionDescription}>{description}</Text> : null}
      </View>
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.brand.dark} />
      ) : (
        <Ionicons
          name="ellipse-outline"
          size={20}
          color={colors.border.strong}
        />
      )}
    </Pressable>
  );
}

function createEmptySupplementRow() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    dose: "",
    frequency: "",
  };
}

export default function QuestionnaireScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [expandedFrequencyRowId, setExpandedFrequencyRowId] = useState(null);
  const scrollRef = useRef(null);
  const [form, setForm] = useState({
    name: "",
    dateOfBirth: "",
    sexAtBirth: "",
    heightUnit: "cm",
    heightCm: "",
    heightFeet: "",
    heightInches: "",
    weightUnit: "kg",
    weightValue: "",
    goals: [],
    success90Days: "",
    confidence: null,
    trackMetrics: [],
    metricInitialValues: {},
    takingSupplements: "",
    supplementRows: [createEmptySupplementRow()],
    conditionsNone: false,
    conditionsText: "",
    allergies: [],
    allergiesNotes: "",
    pregnancyStatus: "",
    evidenceStrength: "",
    priorityFactors: [],
    mixedEvidence: "",
    cautionLevel: "",
    adherencePlan: "",
    preferredForm: "",
    cardioLatestKnown: "",
    cardioLatestValues: "",
    femaleCyclePattern: "",
    femaleCycleNotes: "",
    maleHormoneChecked: "",
    maleHormoneNotes: "",
    hormoneGeneralNotes: "",
    consentAccepted: false,
  });

  useEffect(() => {
    let mounted = true;
    const hydrateBaselineFields = async () => {
      const saved = await getQuestionnaireAnswers();
      if (!mounted || !saved?.completedAt) return;

      const legacyHeight = parseLegacyHeightValue(saved.height);
      const savedHeightUnit =
        saved.heightUnit === "ft_in" || saved.heightUnit === "cm"
          ? saved.heightUnit
          : legacyHeight?.heightUnit || "cm";

      setForm((prev) => ({
        ...prev,
        name:
          prev.name ||
          (typeof saved.name === "string" ? saved.name.trim() : ""),
        dateOfBirth:
          prev.dateOfBirth ||
          (typeof saved.dateOfBirth === "string" ? saved.dateOfBirth : ""),
        sexAtBirth:
          prev.sexAtBirth ||
          (typeof saved.sexAtBirth === "string" ? saved.sexAtBirth : ""),
        heightUnit:
          prev.heightCm || prev.heightFeet || prev.heightInches
            ? prev.heightUnit
            : savedHeightUnit,
        heightCm:
          prev.heightCm ||
          (saved.heightCm !== null && saved.heightCm !== undefined
            ? String(saved.heightCm).trim()
            : legacyHeight?.heightCm || ""),
        heightFeet:
          prev.heightFeet ||
          (saved.heightFeet !== null && saved.heightFeet !== undefined
            ? String(saved.heightFeet).trim()
            : legacyHeight?.heightFeet || ""),
        heightInches:
          prev.heightInches ||
          (saved.heightInches !== null && saved.heightInches !== undefined
            ? String(saved.heightInches).trim()
            : legacyHeight?.heightInches || ""),
      }));
    };
    hydrateBaselineFields();

    return () => {
      mounted = false;
    };
  }, []);

  const questions = useMemo(() => {
    const visibleBaseQuestions = BASE_QUESTIONS.filter(
      (question) => !question.showWhen || question.showWhen(form)
    );

    const trackMetricsIndex = visibleBaseQuestions.findIndex(
      (question) => question.id === "track_metrics"
    );

    if (trackMetricsIndex < 0) {
      return visibleBaseQuestions;
    }

    const metricBaselineQuestions = buildMetricBaselineQuestions(
      form.trackMetrics
    );

    return [
      ...visibleBaseQuestions.slice(0, trackMetricsIndex + 1),
      ...metricBaselineQuestions,
      ...visibleBaseQuestions.slice(trackMetricsIndex + 1),
    ];
  }, [form]);

  useEffect(() => {
    if (currentIndex > questions.length - 1) {
      setCurrentIndex(Math.max(0, questions.length - 1));
    }
  }, [currentIndex, questions.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [currentIndex]);

  const currentQuestion = questions[currentIndex];
  const isLastStep = currentIndex === questions.length - 1;
  const progressValue = (currentIndex + 1) / Math.max(questions.length, 1);

  const isCurrentComplete = useMemo(() => {
    if (!currentQuestion) return false;
    if (!currentQuestion.required) return true;

    if (
      currentQuestion.type === "text" ||
      currentQuestion.type === "textarea"
    ) {
      return Boolean(String(form[currentQuestion.field] || "").trim());
    }

    if (currentQuestion.type === "date") {
      if (!isValidISODate(form[currentQuestion.field])) return false;
      return new Date(`${form[currentQuestion.field]}T00:00:00`) <= new Date();
    }

    if (currentQuestion.type === "number") {
      const value = Number(form[currentQuestion.field]);
      return Number.isFinite(value) && value > 0;
    }

    if (currentQuestion.type === "single") {
      return Boolean(form[currentQuestion.field]);
    }

    if (currentQuestion.type === "multi") {
      const selected = form[currentQuestion.field] || [];
      if (!Array.isArray(selected) || selected.length === 0) return false;
      if (
        Number.isFinite(currentQuestion.maxSelect) &&
        selected.length > currentQuestion.maxSelect
      ) {
        return false;
      }
      return true;
    }

    if (currentQuestion.type === "scale") {
      const value = Number(form[currentQuestion.field]);
      return Number.isFinite(value) && value >= 1 && value <= 10;
    }

    if (currentQuestion.type === "metric_initial") {
      const metric = PRESET_METRICS_BY_KEY[currentQuestion.metricKey];
      const rawValue = form.metricInitialValues?.[currentQuestion.metricKey];
      if (!metric) return false;

      if (isBloodPressureMetric(metric)) {
        return isValidBloodPressureValue(rawValue);
      }

      if (metric.trackerType === "text") {
        return Boolean(String(rawValue || "").trim());
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) return false;
      if (Number.isFinite(metric.min) && numericValue < metric.min) return false;
      if (Number.isFinite(metric.max) && numericValue > metric.max) return false;
      return true;
    }

    if (currentQuestion.type === "height_input") {
      if (form.heightUnit === "cm") {
        const cmValue = normalizePositiveNumber(form.heightCm);
        return cmValue !== null && cmValue > 0;
      }
      const feetValue = normalizePositiveNumber(form.heightFeet);
      const inchesValue = normalizePositiveNumber(form.heightInches);
      if (feetValue === null && inchesValue === null) return false;
      return (feetValue || 0) + (inchesValue || 0) > 0;
    }

    if (currentQuestion.type === "weight_input") {
      const weightValue = normalizePositiveNumber(form.weightValue);
      return Boolean(form.weightUnit) && weightValue !== null && weightValue > 0;
    }

    if (currentQuestion.type === "supplements") {
      if (!form.takingSupplements) return false;
      if (form.takingSupplements === "yes") {
        const rows = Array.isArray(form.supplementRows) ? form.supplementRows : [];
        const hasCompleteRow = rows.some((row) => {
          const name = String(row?.name || "").trim();
          const dose = String(row?.dose || "").trim();
          const frequency = String(row?.frequency || "").trim();
          return Boolean(name && dose && frequency);
        });
        const allRowsValid = rows.every((row) => {
          const name = String(row?.name || "").trim();
          const dose = String(row?.dose || "").trim();
          const frequency = String(row?.frequency || "").trim();
          const hasAnyField = Boolean(name || dose || frequency);
          if (!hasAnyField) return true;
          return Boolean(name && dose && frequency);
        });
        return hasCompleteRow && allRowsValid;
      }
      return true;
    }

    if (currentQuestion.type === "conditions") {
      if (form.conditionsNone) return true;
      return Boolean(form.conditionsText.trim());
    }

    if (currentQuestion.type === "allergies") {
      return form.allergies.length > 0 || Boolean(form.allergiesNotes.trim());
    }

    if (currentQuestion.type === "cardio_follow_up") {
      if (!form.cardioLatestKnown) return false;
      if (form.cardioLatestKnown === "yes") {
        return Boolean(form.cardioLatestValues.trim());
      }
      return true;
    }

    if (currentQuestion.type === "consent") {
      return form.consentAccepted;
    }

    return true;
  }, [currentQuestion, form]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateMetricInitialValue = (metricKey, value) => {
    setForm((prev) => ({
      ...prev,
      metricInitialValues: {
        ...prev.metricInitialValues,
        [metricKey]: value,
      },
    }));
  };

  const updateSupplementRow = (rowId, field, value) => {
    setForm((prev) => ({
      ...prev,
      supplementRows: prev.supplementRows.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      ),
    }));
  };

  const addSupplementRow = () => {
    setForm((prev) => ({
      ...prev,
      supplementRows: [...prev.supplementRows, createEmptySupplementRow()],
    }));
  };

  const removeSupplementRow = (rowId) => {
    setForm((prev) => {
      const nextRows = prev.supplementRows.filter((row) => row.id !== rowId);
      return {
        ...prev,
        supplementRows: nextRows.length ? nextRows : [createEmptySupplementRow()],
      };
    });
    setExpandedFrequencyRowId((current) => (current === rowId ? null : current));
  };

  const handleNext = async () => {
    if (!currentQuestion || !isCurrentComplete || submitting) return;
    if (!isLastStep) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    try {
      setSubmitting(true);
      const completeSupplementRows = (form.supplementRows || []).filter((row) => {
        const name = String(row?.name || "").trim();
        const dose = String(row?.dose || "").trim();
        const frequency = String(row?.frequency || "").trim();
        return Boolean(name && dose && frequency);
      });

      const heightSummary =
        form.heightUnit === "ft_in"
          ? `${String(form.heightFeet || "").trim()}'${String(
              form.heightInches || ""
            ).trim()}"`
          : `${String(form.heightCm || "").trim()} cm`;
      const weightSummary = `${String(form.weightValue || "").trim()} ${
        form.weightUnit === "kg" ? "kg" : "lb"
      }`;

      const questionnairePayload = {
        ...form,
        supplementRows: completeSupplementRows,
        supplementsDetails: completeSupplementRows
          .map((row) => {
            const frequencyLabel =
              SUPPLEMENT_FREQUENCY_OPTIONS.find(
                (option) => option.value === row.frequency
              )?.label || row.frequency;
            return `${row.name} - ${row.dose} - ${frequencyLabel}`;
          })
          .join("\n"),
        height: heightSummary,
        weight: weightSummary,
      };

      await AsyncStorage.setItem(
        QUESTIONNAIRE_STORAGE_KEY,
        JSON.stringify({
          ...questionnairePayload,
          completedAt: new Date().toISOString(),
        })
      );

      const promptAlreadyShown = await AsyncStorage.getItem(
        SIGNUP_PROMPTED_STORAGE_KEY
      );
      const { data: sessionData } = await supabase.auth.getSession();
      const activeUser = sessionData?.session?.user ?? null;
      const hasNonAnonymousSession = Boolean(
        activeUser && activeUser.is_anonymous !== true
      );

      if (hasNonAnonymousSession) {
        await AsyncStorage.setItem(SIGNUP_COMPLETED_STORAGE_KEY, "true");
        await AsyncStorage.setItem(SIGNUP_PROMPTED_STORAGE_KEY, "true");
      }

      if (!promptAlreadyShown && !hasNonAnonymousSession) {
        await AsyncStorage.setItem(SIGNUP_PROMPTED_STORAGE_KEY, "true");
        Alert.alert(
          "Questionnaire completed",
          "Create your account to save your onboarding profile securely.",
          [
            {
              text: "Not now",
              style: "cancel",
              onPress: () => router.back(),
            },
            {
              text: "Sign up",
              onPress: () => router.replace("/modal/sign-up?source=onboarding"),
            },
          ]
        );
        return;
      }

      Alert.alert("Questionnaire completed", "Your answers were saved.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(
        "Could not save questionnaire",
        "Please try again. Your answers are still on screen."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (currentIndex === 0) return;
    setCurrentIndex((prev) => prev - 1);
  };

  const renderScale = (field) => (
    <View style={styles.scaleGrid}>
      {Array.from({ length: 10 }, (_, idx) => idx + 1).map((value) => {
        const selected = form[field] === value;
        return (
          <Pressable
            key={value}
            onPress={() => updateField(field, value)}
            style={[styles.scaleChip, selected && styles.scaleChipSelected]}
          >
            <Text
              style={[
                styles.scaleChipText,
                selected && styles.scaleChipTextSelected,
              ]}
            >
              {value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderSingle = (question) => (
    <View style={styles.optionsGroup}>
      {question.options.map((option) => (
        <OptionRow
          key={option.value}
          label={option.label}
          description={option.description}
          selected={form[question.field] === option.value}
          onPress={() => updateField(question.field, option.value)}
        />
      ))}
    </View>
  );

  const renderMulti = (question) => {
    const selected = form[question.field] || [];
    const atLimit =
      Number.isFinite(question.maxSelect) &&
      selected.length >= question.maxSelect;

    return (
      <View style={styles.optionsGroup}>
        {question.options.map((option) => {
          const isSelected = selected.includes(option.value);
          const disabled = atLimit && !isSelected;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (disabled) return;
                const next = toggleInArray(selected, option.value);
                if (question.field === "trackMetrics") {
                  setForm((prev) => {
                    const nextMetricValues = Object.fromEntries(
                      Object.entries(prev.metricInitialValues || {}).filter(
                        ([metricKey]) => next.includes(metricKey)
                      )
                    );

                    return {
                      ...prev,
                      trackMetrics: next,
                      metricInitialValues: nextMetricValues,
                    };
                  });
                  return;
                }

                updateField(question.field, next);
              }}
              style={({ pressed }) => [
                styles.optionRow,
                isSelected && styles.optionRowSelected,
                disabled && styles.optionRowDisabled,
                pressed && !disabled && styles.optionRowPressed,
              ]}
            >
              <View style={styles.optionTextBlock}>
                <Text
                  style={[
                    styles.optionLabel,
                    isSelected && styles.optionLabelSelected,
                    disabled && styles.optionLabelDisabled,
                  ]}
                >
                  {option.label}
                </Text>
                {option.description ? (
                  <Text style={styles.optionDescription}>{option.description}</Text>
                ) : null}
              </View>
              {isSelected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.brand.dark}
                />
              ) : (
                <Ionicons
                  name="ellipse-outline"
                  size={20}
                  color={colors.border.strong}
                />
              )}
            </Pressable>
          );
        })}
        {Number.isFinite(question.maxSelect) ? (
          <Text style={styles.helperText}>
            {selected.length}/{question.maxSelect} selected
          </Text>
        ) : null}
      </View>
    );
  };

  const renderMetricInitial = (question) => {
    const metric = PRESET_METRICS_BY_KEY[question.metricKey];
    if (!metric) return null;

    const currentValue = form.metricInitialValues?.[question.metricKey];

    if (isBloodPressureMetric(metric)) {
      const parsed = normalizeBloodPressureValue(currentValue);
      const currentSystolic =
        currentValue && typeof currentValue === "object"
          ? String(currentValue.systolic ?? "")
          : String(parsed?.systolic ?? "");
      const currentDiastolic =
        currentValue && typeof currentValue === "object"
          ? String(currentValue.diastolic ?? "")
          : String(parsed?.diastolic ?? "");
      return (
        <View style={styles.rowInputs}>
          <TextInput
            value={currentSystolic}
            onChangeText={(value) =>
              updateMetricInitialValue(metric.key, {
                systolic: value,
                diastolic: currentDiastolic,
              })
            }
            placeholder="Systolic"
            placeholderTextColor={colors.text.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.rowInputItem]}
          />
          <TextInput
            value={currentDiastolic}
            onChangeText={(value) =>
              updateMetricInitialValue(metric.key, {
                systolic: currentSystolic,
                diastolic: value,
              })
            }
            placeholder="Diastolic"
            placeholderTextColor={colors.text.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.rowInputItem]}
          />
        </View>
      );
    }

    if (metric.trackerType === "scale") {
      const min = Number.isFinite(metric.min) ? metric.min : 1;
      const max = Number.isFinite(metric.max) ? metric.max : 10;
      const values = [];
      for (let value = min; value <= max; value += 1) {
        values.push(value);
      }

      return (
        <View style={styles.scaleGrid}>
          {values.map((value) => {
            const selected = Number(currentValue) === value;
            return (
              <Pressable
                key={value}
                onPress={() => updateMetricInitialValue(metric.key, String(value))}
                style={[styles.scaleChip, selected && styles.scaleChipSelected]}
              >
                <Text
                  style={[
                    styles.scaleChipText,
                    selected && styles.scaleChipTextSelected,
                  ]}
                >
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    const isTextMetric = metric.trackerType === "text";
    return (
      <TextInput
        value={String(currentValue ?? "")}
        onChangeText={(value) => updateMetricInitialValue(metric.key, value)}
        placeholder={
          metric.placeholder ||
          (isTextMetric
            ? "Describe your current baseline"
            : metric.unit
            ? `Enter value in ${metric.unit}`
            : "Enter your current value")
        }
        placeholderTextColor={colors.text.muted}
        multiline={isTextMetric}
        textAlignVertical={isTextMetric ? "top" : "auto"}
        keyboardType={isTextMetric ? "default" : "decimal-pad"}
        style={[styles.input, isTextMetric && styles.textarea]}
      />
    );
  };

  const renderDateInput = (question) => (
    <>
      <Pressable
        onPress={() => setDatePickerOpen(true)}
        style={({ pressed }) => [styles.selectInput, pressed && styles.optionRowPressed]}
      >
        <Text
          style={[
            styles.selectInputText,
            !form[question.field] && styles.selectInputPlaceholder,
          ]}
        >
          {formatDate(form[question.field])}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={colors.icon.primary} />
      </Pressable>
      <DatePickerModal
        visible={datePickerOpen}
        initialDate={form[question.field]}
        title={question.title}
        onSelect={(dateValue) => updateField(question.field, dateValue)}
        onClose={() => setDatePickerOpen(false)}
      />
    </>
  );

  const renderHeightInput = () => (
    <View style={styles.complexGroup}>
      <View style={styles.segmentedRow}>
        <Pressable
          onPress={() => updateField("heightUnit", "cm")}
          style={[
            styles.segmentedOption,
            form.heightUnit === "cm" && styles.segmentedOptionSelected,
          ]}
        >
          <Text
            style={[
              styles.segmentedOptionLabel,
              form.heightUnit === "cm" && styles.segmentedOptionLabelSelected,
            ]}
          >
            cm
          </Text>
        </Pressable>
        <Pressable
          onPress={() => updateField("heightUnit", "ft_in")}
          style={[
            styles.segmentedOption,
            form.heightUnit === "ft_in" && styles.segmentedOptionSelected,
          ]}
        >
          <Text
            style={[
              styles.segmentedOptionLabel,
              form.heightUnit === "ft_in" && styles.segmentedOptionLabelSelected,
            ]}
          >
            ft / in
          </Text>
        </Pressable>
      </View>

      {form.heightUnit === "cm" ? (
        <TextInput
          value={form.heightCm}
          onChangeText={(value) => updateField("heightCm", value)}
          placeholder="Height in cm"
          placeholderTextColor={colors.text.muted}
          keyboardType="decimal-pad"
          style={styles.input}
        />
      ) : (
        <View style={styles.rowInputs}>
          <TextInput
            value={form.heightFeet}
            onChangeText={(value) => updateField("heightFeet", value)}
            placeholder="Feet"
            placeholderTextColor={colors.text.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.rowInputItem]}
          />
          <TextInput
            value={form.heightInches}
            onChangeText={(value) => updateField("heightInches", value)}
            placeholder="Inches"
            placeholderTextColor={colors.text.muted}
            keyboardType="decimal-pad"
            style={[styles.input, styles.rowInputItem]}
          />
        </View>
      )}
    </View>
  );

  const renderWeightInput = () => (
    <View style={styles.complexGroup}>
      <View style={styles.segmentedRow}>
        <Pressable
          onPress={() => updateField("weightUnit", "kg")}
          style={[
            styles.segmentedOption,
            form.weightUnit === "kg" && styles.segmentedOptionSelected,
          ]}
        >
          <Text
            style={[
              styles.segmentedOptionLabel,
              form.weightUnit === "kg" && styles.segmentedOptionLabelSelected,
            ]}
          >
            kg
          </Text>
        </Pressable>
        <Pressable
          onPress={() => updateField("weightUnit", "lb")}
          style={[
            styles.segmentedOption,
            form.weightUnit === "lb" && styles.segmentedOptionSelected,
          ]}
        >
          <Text
            style={[
              styles.segmentedOptionLabel,
              form.weightUnit === "lb" && styles.segmentedOptionLabelSelected,
            ]}
          >
            lbs
          </Text>
        </Pressable>
      </View>
      <TextInput
        value={form.weightValue}
        onChangeText={(value) => updateField("weightValue", value)}
        placeholder={`Weight in ${form.weightUnit === "kg" ? "kg" : "lbs"}`}
        placeholderTextColor={colors.text.muted}
        keyboardType="decimal-pad"
        style={styles.input}
      />
    </View>
  );

  const renderSupplementRows = () => (
    <View style={styles.complexGroup}>
      <View style={styles.optionsGroup}>
        <OptionRow
          label="Yes"
          selected={form.takingSupplements === "yes"}
          onPress={() => updateField("takingSupplements", "yes")}
        />
        <OptionRow
          label="No"
          selected={form.takingSupplements === "no"}
          onPress={() =>
            setForm((prev) => ({
              ...prev,
              takingSupplements: "no",
              supplementRows: [createEmptySupplementRow()],
            }))
          }
        />
      </View>

      {form.takingSupplements === "yes" ? (
        <View style={styles.complexGroup}>
          {(form.supplementRows || []).map((row, index) => {
            const selectedFrequency = SUPPLEMENT_FREQUENCY_OPTIONS.find(
              (option) => option.value === row.frequency
            );
            const isExpanded = expandedFrequencyRowId === row.id;
            return (
              <View key={row.id} style={styles.supplementCard}>
                <View style={styles.supplementCardHeader}>
                  <Text style={styles.supplementCardTitle}>
                    Supplement {index + 1}
                  </Text>
                  {(form.supplementRows || []).length > 1 ? (
                    <Pressable onPress={() => removeSupplementRow(row.id)} hitSlop={8}>
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.status.danger}
                      />
                    </Pressable>
                  ) : null}
                </View>

                <TextInput
                  value={row.name}
                  onChangeText={(value) => updateSupplementRow(row.id, "name", value)}
                  placeholder="Supplement name"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />
                <TextInput
                  value={row.dose}
                  onChangeText={(value) => updateSupplementRow(row.id, "dose", value)}
                  placeholder="Dose (e.g. 200mg)"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />

                <View>
                  <Pressable
                    onPress={() =>
                      setExpandedFrequencyRowId((current) =>
                        current === row.id ? null : row.id
                      )
                    }
                    style={styles.selectInput}
                  >
                    <Text
                      style={[
                        styles.selectInputText,
                        !selectedFrequency && styles.selectInputPlaceholder,
                      ]}
                    >
                      {selectedFrequency?.label || "Select frequency"}
                    </Text>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.icon.primary}
                    />
                  </Pressable>
                  {isExpanded ? (
                    <View style={styles.frequencyDropdown}>
                      {SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => (
                        <Pressable
                          key={option.value}
                          onPress={() => {
                            updateSupplementRow(row.id, "frequency", option.value);
                            setExpandedFrequencyRowId(null);
                          }}
                          style={({ pressed }) => [
                            styles.frequencyOption,
                            option.value === row.frequency &&
                              styles.frequencyOptionSelected,
                            pressed && styles.optionRowPressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.frequencyOptionLabel,
                              option.value === row.frequency &&
                                styles.frequencyOptionLabelSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
          <Pressable onPress={addSupplementRow} style={styles.addSupplementButton}>
            <Ionicons name="add-circle-outline" size={18} color={colors.brand.dark} />
            <Text style={styles.addSupplementButtonText}>Add supplement line</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderCurrentQuestion = () => {
    if (!currentQuestion) return null;

    if (currentQuestion.type === "date") {
      return renderDateInput(currentQuestion);
    }

    if (currentQuestion.type === "text" || currentQuestion.type === "number") {
      return (
        <TextInput
          value={String(form[currentQuestion.field] || "")}
          onChangeText={(value) => updateField(currentQuestion.field, value)}
          placeholder={currentQuestion.placeholder}
          placeholderTextColor={colors.text.muted}
          keyboardType={
            currentQuestion.type === "number" ? "decimal-pad" : "default"
          }
          style={styles.input}
        />
      );
    }

    if (currentQuestion.type === "textarea") {
      return (
        <TextInput
          value={String(form[currentQuestion.field] || "")}
          onChangeText={(value) => updateField(currentQuestion.field, value)}
          placeholder={currentQuestion.placeholder}
          placeholderTextColor={colors.text.muted}
          multiline
          textAlignVertical="top"
          style={[styles.input, styles.textarea]}
        />
      );
    }

    if (currentQuestion.type === "single") {
      return renderSingle(currentQuestion);
    }

    if (currentQuestion.type === "multi") {
      return renderMulti(currentQuestion);
    }

    if (currentQuestion.type === "scale") {
      return renderScale(currentQuestion.field);
    }

    if (currentQuestion.type === "metric_initial") {
      return renderMetricInitial(currentQuestion);
    }

    if (currentQuestion.type === "height_input") {
      return renderHeightInput();
    }

    if (currentQuestion.type === "weight_input") {
      return renderWeightInput();
    }

    if (currentQuestion.type === "supplements") {
      return renderSupplementRows();
    }

    if (currentQuestion.type === "conditions") {
      return (
        <View style={styles.complexGroup}>
          <View style={styles.optionsGroup}>
            <OptionRow
              label="None"
              selected={form.conditionsNone}
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  conditionsNone: !prev.conditionsNone,
                  conditionsText: "",
                }))
              }
            />
          </View>
          {!form.conditionsNone ? (
            <TextInput
              value={form.conditionsText}
              onChangeText={(value) => updateField("conditionsText", value)}
              placeholder="List medications and diagnosed conditions"
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea]}
            />
          ) : null}
        </View>
      );
    }

    if (currentQuestion.type === "allergies") {
      return (
        <View style={styles.complexGroup}>
          <View style={styles.optionsGroup}>
            {ALLERGY_OPTIONS.map((option) => {
              const selected = form.allergies.includes(option.value);
              return (
                <OptionRow
                  key={option.value}
                  label={option.label}
                  selected={selected}
                  onPress={() => {
                    setForm((prev) => {
                      const current = prev.allergies;
                      let next = current;
                      if (option.value === "none") {
                        next = current.includes("none") ? [] : ["none"];
                      } else {
                        next = toggleInArray(
                          current.filter((x) => x !== "none"),
                          option.value
                        );
                      }
                      return { ...prev, allergies: next };
                    });
                  }}
                />
              );
            })}
          </View>
          <TextInput
            value={form.allergiesNotes}
            onChangeText={(value) => updateField("allergiesNotes", value)}
            placeholder="Optional: add specific allergies or ingredient notes"
            placeholderTextColor={colors.text.muted}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textarea]}
          />
        </View>
      );
    }

    if (currentQuestion.type === "cardio_follow_up") {
      return (
        <View style={styles.complexGroup}>
          <View style={styles.optionsGroup}>
            <OptionRow
              label="Yes"
              selected={form.cardioLatestKnown === "yes"}
              onPress={() => updateField("cardioLatestKnown", "yes")}
            />
            <OptionRow
              label="No"
              selected={form.cardioLatestKnown === "no"}
              onPress={() => updateField("cardioLatestKnown", "no")}
            />
          </View>
          {form.cardioLatestKnown === "yes" ? (
            <TextInput
              value={form.cardioLatestValues}
              onChangeText={(value) => updateField("cardioLatestValues", value)}
              placeholder="e.g. BP 122/78, LDL 108 mg/dL, glucose 5.4 mmol/L"
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea]}
            />
          ) : null}
        </View>
      );
    }

    if (currentQuestion.type === "sex_follow_up") {
      if (form.sexAtBirth === "female") {
        return (
          <View style={styles.complexGroup}>
            <Text style={styles.helperText}>
              Female-specific optional follow-up
            </Text>
            <View style={styles.optionsGroup}>
              <OptionRow
                label="Cycle usually regular"
                selected={form.femaleCyclePattern === "regular"}
                onPress={() => updateField("femaleCyclePattern", "regular")}
              />
              <OptionRow
                label="Cycle often irregular"
                selected={form.femaleCyclePattern === "irregular"}
                onPress={() => updateField("femaleCyclePattern", "irregular")}
              />
              <OptionRow
                label="Not sure / prefer not to say"
                selected={form.femaleCyclePattern === "not_sure"}
                onPress={() => updateField("femaleCyclePattern", "not_sure")}
              />
            </View>
            <TextInput
              value={form.femaleCycleNotes}
              onChangeText={(value) => updateField("femaleCycleNotes", value)}
              placeholder="Optional notes (cycle, fertility timeline, hormone symptoms)"
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea]}
            />
          </View>
        );
      }

      if (form.sexAtBirth === "male") {
        return (
          <View style={styles.complexGroup}>
            <Text style={styles.helperText}>
              Male-specific optional follow-up
            </Text>
            <View style={styles.optionsGroup}>
              <OptionRow
                label="Recent hormone/fertility labs available"
                selected={form.maleHormoneChecked === "yes"}
                onPress={() => updateField("maleHormoneChecked", "yes")}
              />
              <OptionRow
                label="No recent hormone/fertility labs"
                selected={form.maleHormoneChecked === "no"}
                onPress={() => updateField("maleHormoneChecked", "no")}
              />
              <OptionRow
                label="Not sure"
                selected={form.maleHormoneChecked === "not_sure"}
                onPress={() => updateField("maleHormoneChecked", "not_sure")}
              />
            </View>
            <TextInput
              value={form.maleHormoneNotes}
              onChangeText={(value) => updateField("maleHormoneNotes", value)}
              placeholder="Optional notes (testosterone, fertility, symptoms)"
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea]}
            />
          </View>
        );
      }

      return (
        <View style={styles.complexGroup}>
          <Text style={styles.helperText}>
            Optional hormone/fertility follow-up
          </Text>
          <TextInput
            value={form.hormoneGeneralNotes}
            onChangeText={(value) => updateField("hormoneGeneralNotes", value)}
            placeholder="Any hormone or fertility context you want us to consider"
            placeholderTextColor={colors.text.muted}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.textarea]}
          />
        </View>
      );
    }

    if (currentQuestion.type === "consent") {
      return (
        <Pressable
          onPress={() => updateField("consentAccepted", !form.consentAccepted)}
          style={[
            styles.consentBox,
            form.consentAccepted && styles.consentBoxSelected,
          ]}
        >
          <Ionicons
            name={form.consentAccepted ? "checkbox-outline" : "square-outline"}
            size={22}
            color={form.consentAccepted ? colors.brand.dark : colors.icon.muted}
          />
          <Text style={styles.consentText}>Agree (required to continue)</Text>
        </Pressable>
      );
    }

    return null;
  };

  return (
    <Screen
      header={
        <Header
          title="Questionnaire"
          subtitle="Help us make the best supplement plan for you "
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
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              Question {currentIndex + 1} of {questions.length}
            </Text>
            <Text style={styles.progressPercent}>
              {Math.round(progressValue * 100)}%
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(8, progressValue * 100)}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.card}>
          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>{currentQuestion?.section}</Text>
            <Text style={styles.cardTitle}>{currentQuestion?.title}</Text>
            {currentQuestion?.description ? (
              <Text style={styles.cardBody}>{currentQuestion.description}</Text>
            ) : null}
            <View style={styles.questionBody}>{renderCurrentQuestion()}</View>
          </ScrollView>
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={handleBack}
            disabled={currentIndex === 0}
            style={[
              styles.footerButton,
              styles.backButton,
              currentIndex === 0 && styles.footerButtonDisabled,
            ]}
          >
            <Text
              style={[
                styles.footerButtonText,
                styles.backButtonText,
                currentIndex === 0 && styles.footerButtonTextDisabled,
              ]}
            >
              Back
            </Text>
          </Pressable>
          <Pressable
            onPress={handleNext}
            disabled={!isCurrentComplete || submitting}
            style={[
              styles.footerButton,
              styles.nextButton,
              (!isCurrentComplete || submitting) && styles.footerButtonDisabled,
            ]}
          >
            <Text
              style={[
                styles.footerButtonText,
                (!isCurrentComplete || submitting) &&
                  styles.footerButtonTextDisabled,
              ]}
            >
              {isLastStep ? (submitting ? "Saving..." : "Finish") : "Next"}
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
    gap: spacing.sm,
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
  progressCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.card,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand.dark,
  },
  progressTrack: {
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.background.shell,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 8,
    backgroundColor: colors.brand.primary,
  },
  card: {
    flex: 1,
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadows.card,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    color: colors.text.muted,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text.primary,
    lineHeight: 30,
  },
  cardBody: {
    marginTop: spacing.xs,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  questionBody: {
    marginTop: spacing.md,
    paddingBottom: spacing.md,
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
  selectInput: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectInputText: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: "600",
  },
  selectInputPlaceholder: {
    color: colors.text.muted,
    fontWeight: "500",
  },
  segmentedRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  segmentedOption: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentedOptionSelected: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.soft,
  },
  segmentedOptionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  segmentedOptionLabelSelected: {
    color: colors.brand.dark,
  },
  rowInputs: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  rowInputItem: {
    flex: 1,
  },
  textarea: {
    minHeight: 110,
  },
  optionsGroup: {
    gap: spacing.xs,
  },
  optionRow: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionRowSelected: {
    backgroundColor: colors.brand.soft,
    borderColor: colors.brand.primary,
  },
  optionRowPressed: {
    opacity: 0.86,
  },
  optionRowDisabled: {
    opacity: 0.45,
  },
  optionTextBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  optionLabel: {
    fontSize: 15,
    color: colors.text.primary,
  },
  optionLabelSelected: {
    color: colors.brand.dark,
    fontWeight: "600",
  },
  optionLabelDisabled: {
    color: colors.text.muted,
  },
  optionDescription: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  scaleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  scaleChip: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  scaleChipSelected: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  scaleChipText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  scaleChipTextSelected: {
    color: colors.text.inverse,
  },
  complexGroup: {
    gap: spacing.sm,
  },
  supplementCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  supplementCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  supplementCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  frequencyDropdown: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.card,
    overflow: "hidden",
  },
  frequencyOption: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  frequencyOptionSelected: {
    backgroundColor: colors.brand.soft,
  },
  frequencyOptionLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  frequencyOptionLabelSelected: {
    color: colors.brand.dark,
  },
  addSupplementButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    backgroundColor: colors.background.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  addSupplementButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.brand.dark,
  },
  dateModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 23, 41, 0.32)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  dateModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: colors.background.card,
    padding: spacing.md,
    ...shadows.card,
  },
  dateModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  dateModalHeaderText: {
    flex: 1,
    alignItems: "center",
  },
  dateModalTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  dateModalMonth: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
  },
  dateNavArrow: {
    fontSize: 28,
    color: colors.icon.primary,
    lineHeight: 30,
    width: 28,
    textAlign: "center",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: colors.text.muted,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  dayCellSelected: {
    backgroundColor: colors.brand.primary,
  },
  dayCellDisabled: {
    opacity: 0.35,
  },
  dayLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  dayLabelSelected: {
    color: colors.text.inverse,
  },
  dayLabelDisabled: {
    color: colors.text.muted,
  },
  dateModalCloseButton: {
    marginTop: spacing.sm,
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.background.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  dateModalCloseText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.secondary,
  },
  consentBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  consentBoxSelected: {
    backgroundColor: colors.brand.soft,
    borderColor: colors.brand.primary,
  },
  consentText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
    lineHeight: 22,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  footerButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.lg,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  backButton: {
    backgroundColor: colors.background.card,
    borderColor: colors.border.strong,
  },
  nextButton: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  footerButtonDisabled: {
    opacity: 0.5,
  },
  footerButtonText: {
    color: colors.text.inverse,
    fontSize: 16,
    fontWeight: "700",
  },
  backButtonText: {
    color: colors.text.secondary,
  },
  footerButtonTextDisabled: {
    color: colors.text.muted,
  },
});
