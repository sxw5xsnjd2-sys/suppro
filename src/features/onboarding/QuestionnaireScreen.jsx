import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { BackdropScreen } from "@/components/common/layout/BackdropScreen";
import {
  AppButton,
  AppHeader,
  PrimaryCard,
  SelectableCard,
} from "@/components/common/ui";
import {
  isBloodPressureMetric,
  isValidBloodPressureValue,
  normalizeBloodPressureValue,
  PRESET_METRICS,
  PRESET_METRICS_BY_KEY,
} from "@/features/health/metricDefinitions";
import { supabase } from "@src/lib/supabase";
import {
  clearOnboardingDraft,
  getQuestionnaireAnswers,
  loadOnboardingDraft,
  notifyOnboardingGateChange,
  QUESTIONNAIRE_STORAGE_KEY,
  saveOnboardingDraft,
  SIGNUP_COMPLETED_STORAGE_KEY,
  SIGNUP_PROMPTED_STORAGE_KEY,
} from "@src/lib/onboarding";
import { appTheme, shadows, spacing, typography } from "@/theme";

const colors = {
  brand: {
    dark: appTheme.colors.textStrong,
  },
  text: {
    muted: appTheme.input.placeholder,
  },
  status: {
    danger: appTheme.colors.danger,
  },
  icon: {
    primary: appTheme.input.icon,
  },
};

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
const MIN_DATE_PICKER_DATE = new Date(1900, 0, 1, 12, 0, 0, 0);
const DATE_WHEEL_ITEM_HEIGHT = 44;
const DATE_WHEEL_VISIBLE_ROWS = 5;
const DATE_WHEEL_HEIGHT = DATE_WHEEL_ITEM_HEIGHT * DATE_WHEEL_VISIBLE_ROWS;
const DATE_WHEEL_SPACER_HEIGHT =
  (DATE_WHEEL_HEIGHT - DATE_WHEEL_ITEM_HEIGHT) / 2;
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

function isValidISODate(value) {
  return Boolean(parseLocalISODate(value));
}

function formatDate(value) {
  if (!isValidISODate(value)) return "Select date";
  const parsed = parseLocalISODate(value);
  const year = parsed.getFullYear();
  const day = parsed.getDate();
  const monthLabel = parsed.toLocaleString("en-US", {
    month: "short",
  });
  return `${monthLabel} ${day}, ${year}`;
}

function toISODate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDatePickerInitialDate(initialDate) {
  return parseLocalISODate(initialDate) ?? new Date();
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function normalizePositiveNumber(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseLegacyHeightValue(rawHeight) {
  const text = String(rawHeight || "")
    .trim()
    .toLowerCase();
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
  const today = new Date();
  const currentYear = today.getFullYear();
  const [pickerDate, setPickerDate] = useState(() =>
    getDatePickerInitialDate(initialDate)
  );
  const monthListRef = useRef(null);
  const dayListRef = useRef(null);
  const yearListRef = useRef(null);
  const selectedYear = pickerDate.getFullYear();
  const selectedMonth = pickerDate.getMonth();
  const selectedDay = pickerDate.getDate();
  const yearOptions = useMemo(
    () =>
      Array.from(
        { length: currentYear - MIN_DATE_PICKER_DATE.getFullYear() + 1 },
        (_, index) => currentYear - index
      ),
    [currentYear]
  );
  const dayOptions = useMemo(
    () =>
      Array.from(
        { length: daysInMonth(selectedYear, selectedMonth) },
        (_, index) => index + 1
      ),
    [selectedMonth, selectedYear]
  );
  const selectedMonthIndex = MONTH_OPTIONS.findIndex(
    (option) => option.value === selectedMonth
  );
  const selectedDayIndex = dayOptions.findIndex(
    (option) => option === selectedDay
  );
  const selectedYearIndex = yearOptions.findIndex(
    (option) => option === selectedYear
  );

  useEffect(() => {
    if (!visible) return;
    setPickerDate(getDatePickerInitialDate(initialDate));
  }, [initialDate, visible]);

  const scrollWheelToIndex = (ref, index, animated = false) => {
    if (!ref?.current || index < 0) return;
    try {
      ref.current.scrollToOffset({
        offset: index * DATE_WHEEL_ITEM_HEIGHT,
        animated,
      });
    } catch {
      return;
    }
  };

  useEffect(() => {
    if (!visible) return;
    const timeoutId = setTimeout(() => {
      scrollWheelToIndex(monthListRef, selectedMonthIndex);
      scrollWheelToIndex(dayListRef, selectedDayIndex);
      scrollWheelToIndex(yearListRef, selectedYearIndex);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [selectedDayIndex, selectedMonthIndex, selectedYearIndex, visible]);

  const updatePickerDate = ({ year, month, day }) => {
    setPickerDate((previous) => {
      const nextYear = year ?? previous.getFullYear();
      const nextMonth = month ?? previous.getMonth();
      const nextDay = day ?? previous.getDate();
      const clampedDay = Math.min(nextDay, daysInMonth(nextYear, nextMonth));
      return new Date(nextYear, nextMonth, clampedDay, 12, 0, 0, 0);
    });
  };

  const buildScrollHandler = (options, onValueChange) => (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / DATE_WHEEL_ITEM_HEIGHT);
    const value = options[index];
    if (value === undefined) return;
    onValueChange(value, index);
  };

  const renderWheel = ({
    label,
    data,
    selectedValue,
    listRef,
    onValueChange,
    getItemLabel,
  }) => (
    <View style={styles.dateWheelColumn}>
      <Text style={styles.dateWheelLabel}>{label}</Text>
      <View style={styles.dateWheelFrame}>
        <View pointerEvents="none" style={styles.dateWheelSelectionOverlay} />
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={(item) =>
            typeof item === "object" && item !== null
              ? String(item.value ?? item.label)
              : String(item)
          }
          showsVerticalScrollIndicator={false}
          bounces={false}
          snapToInterval={DATE_WHEEL_ITEM_HEIGHT}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            length: DATE_WHEEL_ITEM_HEIGHT,
            offset: DATE_WHEEL_ITEM_HEIGHT * index,
            index,
          })}
          ListHeaderComponent={<View style={styles.dateWheelSpacer} />}
          ListFooterComponent={<View style={styles.dateWheelSpacer} />}
          onMomentumScrollEnd={buildScrollHandler(data, onValueChange)}
          renderItem={({ item, index }) => {
            const selected = item === selectedValue;
            return (
              <Pressable
                onPress={() => {
                  onValueChange(item, index);
                  scrollWheelToIndex(listRef, index, true);
                }}
                style={styles.dateWheelItem}
              >
                <Text
                  style={[
                    styles.dateWheelItemText,
                    selected && styles.dateWheelItemTextSelected,
                  ]}
                >
                  {getItemLabel(item)}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.dateModalBackdrop}>
        <View style={styles.dateModalCard}>
          <View style={styles.dateModalHeaderText}>
            <Text style={styles.dateModalTitle}>{title}</Text>
            <Text style={styles.dateModalMonth}>
              {formatDate(toISODate(pickerDate))}
            </Text>
          </View>

          <View style={styles.dateWheelRow}>
            {renderWheel({
              label: "Day",
              data: dayOptions,
              selectedValue: selectedDay,
              listRef: dayListRef,
              onValueChange: (value) => updatePickerDate({ day: value }),
              getItemLabel: (value) => String(value),
            })}
            {renderWheel({
              label: "Month",
              data: MONTH_OPTIONS,
              selectedValue:
                MONTH_OPTIONS.find(
                  (option) => option.value === selectedMonth
                ) ?? null,
              listRef: monthListRef,
              onValueChange: (option) =>
                updatePickerDate({ month: option.value }),
              getItemLabel: (option) => option.label,
            })}
            {renderWheel({
              label: "Year",
              data: yearOptions,
              selectedValue: selectedYear,
              listRef: yearListRef,
              onValueChange: (value) => updatePickerDate({ year: value }),
              getItemLabel: (value) => String(value),
            })}
          </View>

          <View style={styles.dateModalActionRow}>
            <Pressable onPress={onClose} style={styles.dateModalActionButton}>
              <Text style={styles.dateModalCloseText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSelect(toISODate(pickerDate))}
              style={[
                styles.dateModalActionButton,
                styles.dateModalActionButtonPrimary,
              ]}
            >
              <Text
                style={[
                  styles.dateModalCloseText,
                  styles.dateModalActionButtonPrimaryText,
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>
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
    description:
      "If yes, add each supplement with name, dose, and daily frequency.",
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
      "I understand any information in this app is for educational purposes only and not medical advice. I will consult my doctor before starting or changing any supplements.",
    type: "consent",
    required: true,
  },
];

function toggleInArray(current, value) {
  if (current.includes(value)) return current.filter((item) => item !== value);
  return [...current, value];
}

function OptionRow({ label, description, selected, disabled, onPress }) {
  return (
    <SelectableCard
      onPress={onPress}
      selected={selected}
      disabled={disabled}
      accessibilityRole="checkbox"
      trailing={
        selected ? (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={appTheme.colors.textStrong}
          />
        ) : (
          <Ionicons
            name="ellipse-outline"
            size={20}
            color={appTheme.colors.textTertiary}
          />
        )
      }
      style={styles.optionRow}
      contentStyle={styles.optionContent}
    >
      <View style={styles.optionTextBlock}>
        <Text
          style={[styles.optionLabel, selected && styles.optionLabelSelected]}
        >
          {label}
        </Text>
        {description ? (
          <Text style={styles.optionDescription}>{description}</Text>
        ) : null}
      </View>
    </SelectableCard>
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

function createInitialFormState() {
  return {
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
  };
}

function normalizeOnboardingMode(mode) {
  return mode === "retake" ? "retake" : "first_run";
}

function mergeCompletedAnswersIntoForm(form, saved) {
  if (!saved?.completedAt) return form;

  const legacyHeight = parseLegacyHeightValue(saved.height);
  const savedHeightUnit =
    saved.heightUnit === "ft_in" || saved.heightUnit === "cm"
      ? saved.heightUnit
      : legacyHeight?.heightUnit || "cm";

  return {
    ...form,
    name:
      form.name || (typeof saved.name === "string" ? saved.name.trim() : ""),
    dateOfBirth:
      form.dateOfBirth ||
      (typeof saved.dateOfBirth === "string" ? saved.dateOfBirth : ""),
    sexAtBirth:
      form.sexAtBirth ||
      (typeof saved.sexAtBirth === "string" ? saved.sexAtBirth : ""),
    heightUnit:
      form.heightCm || form.heightFeet || form.heightInches
        ? form.heightUnit
        : savedHeightUnit,
    heightCm:
      form.heightCm ||
      (saved.heightCm !== null && saved.heightCm !== undefined
        ? String(saved.heightCm).trim()
        : legacyHeight?.heightCm || ""),
    heightFeet:
      form.heightFeet ||
      (saved.heightFeet !== null && saved.heightFeet !== undefined
        ? String(saved.heightFeet).trim()
        : legacyHeight?.heightFeet || ""),
    heightInches:
      form.heightInches ||
      (saved.heightInches !== null && saved.heightInches !== undefined
        ? String(saved.heightInches).trim()
        : legacyHeight?.heightInches || ""),
  };
}

export default function QuestionnaireScreen({ standalone = false } = {}) {
  const params = useLocalSearchParams();
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const requestedMode =
    typeof modeParam === "string" ? normalizeOnboardingMode(modeParam) : null;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draftMode, setDraftMode] = useState("first_run");
  const isStrictFirstRun = standalone && draftMode === "first_run";
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [expandedFrequencyRowId, setExpandedFrequencyRowId] = useState(null);
  const scrollRef = useRef(null);
  const questionIdsRef = useRef([]);
  const [form, setForm] = useState(createInitialFormState);

  useEffect(() => {
    let mounted = true;
    const hydrateQuestionnaireState = async () => {
      const [saved, savedDraft] = await Promise.all([
        getQuestionnaireAnswers(),
        loadOnboardingDraft(),
      ]);
      if (!mounted) return;

      const nextMode =
        requestedMode ??
        savedDraft?.mode ??
        (saved?.completedAt ? "retake" : "first_run");
      const baseForm =
        nextMode === "retake"
          ? mergeCompletedAnswersIntoForm(createInitialFormState(), saved)
          : createInitialFormState();

      const nextForm = savedDraft?.answers
        ? {
            ...baseForm,
            ...savedDraft.answers,
          }
        : baseForm;

      setForm(nextForm);
      setCurrentIndex(savedDraft?.currentPageIndex ?? 0);
      setDraftMode(nextMode);
      setDraftHydrated(true);
    };
    hydrateQuestionnaireState();

    return () => {
      mounted = false;
    };
  }, [requestedMode]);

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
    const previousQuestionIds = questionIdsRef.current;
    const currentQuestionId = previousQuestionIds[currentIndex] ?? null;
    const maxIndex = Math.max(0, questions.length - 1);

    if (currentQuestionId) {
      const nextIndex = questions.findIndex(
        (question) => question.id === currentQuestionId
      );

      if (nextIndex >= 0 && nextIndex !== currentIndex) {
        setCurrentIndex(nextIndex);
        questionIdsRef.current = questions.map((question) => question.id);
        return;
      }
    }

    if (currentIndex > maxIndex) {
      setCurrentIndex(maxIndex);
      questionIdsRef.current = questions.map((question) => question.id);
      return;
    }

    questionIdsRef.current = questions.map((question) => question.id);
  }, [currentIndex, questions]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [currentIndex]);

  useEffect(() => {
    if (!isStrictFirstRun) return undefined;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (currentIndex > 0) {
          setCurrentIndex((prev) => Math.max(0, prev - 1));
        }
        return true;
      }
    );

    return () => {
      subscription.remove();
    };
  }, [currentIndex, isStrictFirstRun]);

  useEffect(() => {
    if (!draftHydrated) return;

    void saveOnboardingDraft({
      currentPageIndex: currentIndex,
      answers: form,
      mode: draftMode,
    });
  }, [currentIndex, draftHydrated, draftMode, form]);

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
      const parsed = parseLocalISODate(form[currentQuestion.field]);
      return Boolean(parsed) && parsed <= new Date();
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
      if (Number.isFinite(metric.min) && numericValue < metric.min)
        return false;
      if (Number.isFinite(metric.max) && numericValue > metric.max)
        return false;
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
      return (
        Boolean(form.weightUnit) && weightValue !== null && weightValue > 0
      );
    }

    if (currentQuestion.type === "supplements") {
      if (!form.takingSupplements) return false;
      if (form.takingSupplements === "yes") {
        const rows = Array.isArray(form.supplementRows)
          ? form.supplementRows
          : [];
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
        supplementRows: nextRows.length
          ? nextRows
          : [createEmptySupplementRow()],
      };
    });
    setExpandedFrequencyRowId((current) =>
      current === rowId ? null : current
    );
  };

  const triggerImpactHaptic = (style) => {
    void Haptics.impactAsync(style).catch(() => {});
  };

  const triggerSuccessHaptic = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    );
  };

  const handleNext = async () => {
    if (!currentQuestion || !isCurrentComplete || submitting) return;
    if (!isLastStep) {
      triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Light);
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    try {
      setSubmitting(true);
      triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Medium);
      const completeSupplementRows = (form.supplementRows || []).filter(
        (row) => {
          const name = String(row?.name || "").trim();
          const dose = String(row?.dose || "").trim();
          const frequency = String(row?.frequency || "").trim();
          return Boolean(name && dose && frequency);
        }
      );

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
      await clearOnboardingDraft();

      const { data: sessionData } = await supabase.auth.getSession();
      const activeUser = sessionData?.session?.user ?? null;
      const hasNonAnonymousSession = Boolean(
        activeUser && activeUser.is_anonymous !== true
      );
      const signupCompleted =
        hasNonAnonymousSession ||
        (await AsyncStorage.getItem(SIGNUP_COMPLETED_STORAGE_KEY)) === "true";

      if (hasNonAnonymousSession) {
        await AsyncStorage.setItem(SIGNUP_COMPLETED_STORAGE_KEY, "true");
        await AsyncStorage.setItem(SIGNUP_PROMPTED_STORAGE_KEY, "true");
      }

      notifyOnboardingGateChange();

      if (standalone && draftMode === "retake") {
        triggerSuccessHaptic();
        router.replace("/");
        return;
      }

      if (!signupCompleted) {
        triggerSuccessHaptic();
        if (standalone) {
          router.replace(`/onboarding?mode=${draftMode}&step=paywall`);
          return;
        }

        const promptAlreadyShown = await AsyncStorage.getItem(
          SIGNUP_PROMPTED_STORAGE_KEY
        );
        await AsyncStorage.setItem(SIGNUP_PROMPTED_STORAGE_KEY, "true");
        if (promptAlreadyShown) {
          router.replace("/modal/sign-up?source=onboarding");
          return;
        }
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

      if (standalone) {
        triggerSuccessHaptic();
        router.replace("/");
        return;
      }

      triggerSuccessHaptic();
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
            <OptionRow
              key={option.value}
              label={option.label}
              description={option.description}
              selected={isSelected}
              disabled={disabled}
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
            />
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
                onPress={() =>
                  updateMetricInitialValue(metric.key, String(value))
                }
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
        style={({ pressed }) => [
          styles.selectInput,
          pressed && styles.optionRowPressed,
        ]}
      >
        <Text
          style={[
            styles.selectInputText,
            !form[question.field] && styles.selectInputPlaceholder,
          ]}
        >
          {formatDate(form[question.field])}
        </Text>
        <Ionicons
          name="calendar-outline"
          size={20}
          color={colors.icon.primary}
        />
      </Pressable>
      <DatePickerModal
        visible={datePickerOpen}
        initialDate={form[question.field]}
        title={question.title}
        onSelect={(dateValue) => {
          updateField(question.field, dateValue);
          setDatePickerOpen(false);
        }}
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
              form.heightUnit === "ft_in" &&
                styles.segmentedOptionLabelSelected,
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
              <PrimaryCard key={row.id} style={styles.supplementCard}>
                <View style={styles.supplementCardHeader}>
                  <Text style={styles.supplementCardTitle}>
                    Supplement {index + 1}
                  </Text>
                  {(form.supplementRows || []).length > 1 ? (
                    <Pressable
                      onPress={() => removeSupplementRow(row.id)}
                      hitSlop={8}
                    >
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
                  onChangeText={(value) =>
                    updateSupplementRow(row.id, "name", value)
                  }
                  placeholder="Supplement name"
                  placeholderTextColor={colors.text.muted}
                  style={styles.input}
                />
                <TextInput
                  value={row.dose}
                  onChangeText={(value) =>
                    updateSupplementRow(row.id, "dose", value)
                  }
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
                            updateSupplementRow(
                              row.id,
                              "frequency",
                              option.value
                            );
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
              </PrimaryCard>
            );
          })}
          <Pressable
            onPress={addSupplementRow}
            style={styles.addSupplementButton}
          >
            <Ionicons
              name="add-circle-outline"
              size={18}
              color={colors.brand.dark}
            />
            <Text style={styles.addSupplementButtonText}>
              Add supplement line
            </Text>
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
        <SelectableCard
          onPress={() => updateField("consentAccepted", !form.consentAccepted)}
          selected={form.consentAccepted}
          accessibilityRole="checkbox"
          style={styles.consentBox}
          contentStyle={styles.optionContent}
          trailing={
            <Ionicons
              name={
                form.consentAccepted ? "checkbox-outline" : "square-outline"
              }
              size={22}
              color={
                form.consentAccepted
                  ? appTheme.colors.textStrong
                  : appTheme.colors.textTertiary
              }
            />
          }
        >
          <Text style={styles.consentText}>Agree (required to continue)</Text>
        </SelectableCard>
      );
    }

    return null;
  };

  return (
    <BackdropScreen
      header={
        <AppHeader
          insetPreset="screen"
          title="Questionnaire"
          titleStyle={styles.headerTitle}
          bottomSlot={
            <Text style={styles.headerSubtitle}>
              Personalise the app around your goals, baseline, and routine.
            </Text>
          }
          rightSlot={
            standalone ? null : (
              <AppButton
                onPress={() => router.back()}
                variant="overlay"
                size="icon"
                accessibilityLabel="Close questionnaire"
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={appTheme.colors.textStrong}
                />
              </AppButton>
            )
          }
        />
      }
      scrollable={false}
      contentStyle={styles.screenContent}
      bottomInsetOffset={32}
      minBottomPadding={32}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <PrimaryCard style={styles.progressCard}>
          <View style={styles.progressRow}>
            <View style={styles.progressMeta}>
              <View style={styles.progressEyebrow}>
                <Text style={styles.progressEyebrowText}>Progress</Text>
              </View>
              <Text style={styles.progressLabel}>
                {currentIndex + 1} of {questions.length}
              </Text>
            </View>
            <View style={styles.progressPercentBadge}>
              <Text style={styles.progressPercent}>
                {Math.round(progressValue * 100)}%
              </Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={appTheme.gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.progressFill,
                { width: `${Math.max(8, progressValue * 100)}%` },
              ]}
            />
          </View>
        </PrimaryCard>

        <PrimaryCard style={styles.card}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.cardScrollContent}
          >
            <LinearGradient
              colors={appTheme.gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sectionPill}
            >
              <Text style={styles.sectionLabel}>
                {currentQuestion?.section}
              </Text>
            </LinearGradient>
            <Text style={styles.cardTitle}>{currentQuestion?.title}</Text>
            {currentQuestion?.description ? (
              <Text style={styles.cardBody}>{currentQuestion.description}</Text>
            ) : null}
            <View style={styles.questionBody}>{renderCurrentQuestion()}</View>
          </ScrollView>
        </PrimaryCard>

        <View style={styles.footer}>
          {currentIndex > 0 ? (
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                styles.footerButton,
                styles.backButton,
                pressed && styles.footerButtonPressed,
              ]}
            >
              <Text style={[styles.footerButtonText, styles.backButtonText]}>
                Back
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleNext}
            disabled={!isCurrentComplete || submitting}
            style={({ pressed }) => [
              styles.footerButton,
              styles.nextButton,
              (!isCurrentComplete || submitting) && styles.footerButtonDisabled,
              pressed &&
                isCurrentComplete &&
                !submitting &&
                styles.footerButtonPressed,
            ]}
          >
            <LinearGradient
              colors={appTheme.gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.nextButtonGradient}
            >
              <Text
                style={[
                  styles.footerButtonText,
                  styles.nextButtonText,
                  (!isCurrentComplete || submitting) &&
                    styles.footerButtonTextDisabled,
                ]}
              >
                {isLastStep ? (submitting ? "Saving..." : "Finish") : "Next"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </BackdropScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingBottom: 2,
  },
  container: {
    flex: 1,
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: 28,
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  progressCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: spacing.sm,
  },
  progressMeta: {
    flex: 1,
  },
  progressEyebrow: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceMuted,
    marginBottom: 8,
  },
  progressEyebrowText: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  progressLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textPrimary,
  },
  progressPercentBadge: {
    minWidth: 58,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceAccent,
  },
  progressPercent: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  progressTrack: {
    height: appTheme.questionnaire.progressHeight,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  card: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  cardScrollContent: {
    paddingBottom: spacing.md,
  },
  sectionPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typography.fontFamily.headingSemiBold,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: appTheme.colors.textStrong,
  },
  cardTitle: {
    fontSize: 28,
    lineHeight: 33,
    fontFamily: typography.fontFamily.heading,
    color: appTheme.colors.textPrimary,
    letterSpacing: -0.7,
  },
  cardBody: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  questionBody: {
    marginTop: 18,
    paddingBottom: spacing.md,
  },
  input: {
    minHeight: appTheme.questionnaire.fieldMinHeight,
    borderRadius: appTheme.input.radius,
    backgroundColor: appTheme.input.background,
    color: appTheme.input.text,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamily.body,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  selectInput: {
    minHeight: appTheme.questionnaire.fieldMinHeight,
    borderRadius: appTheme.input.radius,
    backgroundColor: appTheme.input.background,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectInputText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.input.text,
  },
  selectInputPlaceholder: {
    color: appTheme.input.placeholder,
  },
  segmentedRow: {
    flexDirection: "row",
    gap: 10,
  },
  segmentedOption: {
    flex: 1,
    minHeight: appTheme.questionnaire.fieldMinHeight,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentedOptionSelected: {
    backgroundColor: appTheme.colors.surfaceAccent,
    borderColor: "rgba(20,20,20,0.16)",
  },
  segmentedOptionLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textSecondary,
  },
  segmentedOptionLabelSelected: {
    color: appTheme.colors.textStrong,
  },
  rowInputs: {
    flexDirection: "row",
    gap: 10,
  },
  rowInputItem: {
    flex: 1,
  },
  textarea: {
    minHeight: 124,
  },
  optionsGroup: {
    gap: 10,
  },
  optionRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionRowPressed: {
    opacity: 0.82,
  },
  optionTextBlock: {
    flex: 1,
  },
  optionContent: {
    alignItems: "center",
  },
  optionLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textPrimary,
  },
  optionLabelSelected: {
    color: appTheme.colors.textStrong,
  },
  optionDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.fontFamily.body,
    color: appTheme.colors.textSecondary,
  },
  scaleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  scaleChip: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scaleChipSelected: {
    backgroundColor: appTheme.colors.surfaceAccent,
    borderColor: "rgba(20,20,20,0.16)",
  },
  scaleChipText: {
    fontSize: 15,
    lineHeight: 18,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
  },
  scaleChipTextSelected: {
    color: appTheme.colors.textStrong,
  },
  complexGroup: {
    gap: spacing.sm,
  },
  supplementCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 10,
  },
  supplementCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  supplementCardTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textSecondary,
  },
  frequencyDropdown: {
    marginTop: 10,
    borderRadius: appTheme.card.radius,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    backgroundColor: appTheme.colors.surface,
    overflow: "hidden",
    ...shadows.card,
  },
  frequencyOption: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSubtle,
  },
  frequencyOptionSelected: {
    backgroundColor: appTheme.colors.surfaceAccent,
  },
  frequencyOptionLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textSecondary,
  },
  frequencyOptionLabelSelected: {
    color: appTheme.colors.textStrong,
  },
  addSupplementButton: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appTheme.colors.borderPill,
    backgroundColor: appTheme.colors.surfaceOverlay,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  addSupplementButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textStrong,
  },
  dateModalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.modal.scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  dateModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surface,
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
    justifyContent: "center",
  },
  dateModalTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  dateModalMonth: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textPrimary,
  },
  dateWheelRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dateWheelColumn: {
    flex: 1,
  },
  dateWheelLabel: {
    marginBottom: 8,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 15,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dateWheelFrame: {
    height: DATE_WHEEL_HEIGHT,
    borderRadius: appTheme.card.radius,
    backgroundColor: appTheme.colors.surfaceMuted,
    overflow: "hidden",
    position: "relative",
  },
  dateWheelSelectionOverlay: {
    position: "absolute",
    left: 8,
    right: 8,
    top: DATE_WHEEL_SPACER_HEIGHT,
    height: DATE_WHEEL_ITEM_HEIGHT,
    borderRadius: 14,
    backgroundColor: appTheme.colors.surfaceAccent,
    borderWidth: 1,
    borderColor: "rgba(20,20,20,0.12)",
  },
  dateWheelSpacer: {
    height: DATE_WHEEL_SPACER_HEIGHT,
  },
  dateWheelItem: {
    height: DATE_WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  dateWheelItemText: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textTertiary,
  },
  dateWheelItemTextSelected: {
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  nativeDatePicker: {
    alignSelf: "stretch",
    height: 220,
    marginTop: spacing.xs,
  },
  dateModalActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dateModalActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dateModalActionButtonPrimary: {
    backgroundColor: appTheme.colors.textStrong,
  },
  dateModalActionButtonPrimaryText: {
    color: appTheme.colors.surface,
  },
  dateNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dateNavButtonDisabled: {
    opacity: 0.35,
  },
  dateNavArrow: {
    fontSize: 28,
    color: appTheme.colors.textStrong,
    lineHeight: 30,
    width: 28,
    textAlign: "center",
  },
  dateNavArrowDisabled: {
    color: appTheme.colors.textTertiary,
  },
  dateSelectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dateSelectionChip: {
    width: "31%",
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSubtle,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dateSelectionChipSelected: {
    backgroundColor: appTheme.colors.surfaceAccent,
    borderColor: "rgba(20,20,20,0.16)",
  },
  dateSelectionChipDisabled: {
    opacity: 0.35,
  },
  dateSelectionChipText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  dateSelectionChipTextSelected: {
    color: appTheme.colors.textStrong,
  },
  dateSelectionChipTextDisabled: {
    color: appTheme.colors.textTertiary,
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textTertiary,
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
    borderRadius: 16,
  },
  dayCellSelected: {
    backgroundColor: appTheme.colors.surfaceAccent,
  },
  dayCellDisabled: {
    opacity: 0.35,
  },
  dayLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textSecondary,
  },
  dayLabelSelected: {
    color: appTheme.colors.textStrong,
  },
  dayLabelDisabled: {
    color: appTheme.colors.textTertiary,
  },
  dateModalCloseButton: {
    marginTop: spacing.sm,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dateModalCloseText: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamily.bodySemiBold,
    color: appTheme.colors.textSecondary,
  },
  consentBox: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  consentText: {
    flex: 1,
    fontSize: 15,
    fontFamily: typography.fontFamily.bodyMedium,
    color: appTheme.colors.textPrimary,
    lineHeight: 22,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  footerButton: {
    flex: 1,
    minHeight: appTheme.questionnaire.footerButtonHeight,
    borderRadius: appTheme.card.radius,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  footerButtonPressed: {
    opacity: 0.82,
  },
  backButton: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderSubtle,
  },
  nextButton: {
    borderColor: "rgba(20,20,20,0.12)",
  },
  footerButtonDisabled: {
    opacity: 0.46,
  },
  nextButtonGradient: {
    width: "100%",
    minHeight: appTheme.questionnaire.footerButtonHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  footerButtonText: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamily.headingSemiBold,
    color: appTheme.colors.textStrong,
  },
  backButtonText: {
    color: appTheme.colors.textStrong,
  },
  nextButtonText: {
    color: appTheme.colors.textStrong,
  },
  footerButtonTextDisabled: {
    color: appTheme.colors.textTertiary,
  },
});
