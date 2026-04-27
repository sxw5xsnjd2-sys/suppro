export const TRACKER_TYPES = {
  SCALE: "scale",
  NUMBER: "number",
  HOURS: "hours",
  TEXT: "text",
};

export const INPUT_ARCHETYPES = {
  DURATION: "duration",
  SCORE_1_10: "score-1-10",
  PRESSURE_1_10: "pressure-1-10",
  SEVERITY_0_10: "severity-0-10",
  NUMERIC_FREE: "numeric-free",
};

export const CUSTOM_METRIC_KEY = "__custom_metric__";
export const BLOOD_PRESSURE_METRIC_KEY = "blood_pressure_control";
export const MANUAL_ENTRY_SOURCE = "manual";
export const APPLE_HEALTH_ENTRY_SOURCE = "apple_health";

const metric = (input) => ({
  enabled: false,
  appleHealthSupported: false,
  lowerIsBetter: false,
  ...input,
});

const durationMetric = (input) =>
  metric({
    trackerType:
      input.unit === "hours" ? TRACKER_TYPES.HOURS : TRACKER_TYPES.NUMBER,
    inputArchetype: INPUT_ARCHETYPES.DURATION,
    min: 0,
    step: input.unit === "hours" ? 0.25 : 5,
    defaultValue: input.unit === "hours" ? 8 : 30,
    ...input,
  });

const scoreMetric = (input) =>
  metric({
    trackerType: TRACKER_TYPES.SCALE,
    inputArchetype: INPUT_ARCHETYPES.SCORE_1_10,
    min: 1,
    max: 10,
    step: 1,
    defaultValue: 5,
    lowLabel: "Low",
    highLabel: "High",
    ...input,
  });

const pressureMetric = (input) =>
  metric({
    trackerType: TRACKER_TYPES.SCALE,
    inputArchetype: INPUT_ARCHETYPES.PRESSURE_1_10,
    min: 1,
    max: 10,
    step: 1,
    defaultValue: 5,
    lowerIsBetter: true,
    lowLabel: "Low",
    highLabel: "High",
    ...input,
  });

const severityMetric = (input) =>
  metric({
    trackerType: TRACKER_TYPES.SCALE,
    inputArchetype: INPUT_ARCHETYPES.SEVERITY_0_10,
    min: 0,
    max: 10,
    step: 1,
    defaultValue: 0,
    lowerIsBetter: true,
    lowLabel: "None",
    highLabel: "Severe",
    ...input,
  });

const numericMetric = (input) =>
  metric({
    trackerType: TRACKER_TYPES.NUMBER,
    inputArchetype: INPUT_ARCHETYPES.NUMERIC_FREE,
    step: 1,
    defaultValue: 0,
    ...input,
  });

export const PRESET_METRICS = [
  durationMetric({
    key: "sleep",
    label: "Sleep duration",
    shortLabel: "Sleep",
    description: "Total hours slept in your most recent sleep period.",
    group: "Recovery",
    unit: "hours",
    max: 12,
    defaultValue: 8,
    appleHealthSupported: true,
    lowLabel: "Too little",
    highLabel: "Well rested",
  }),
  durationMetric({
    key: "cardiovascular_health",
    label: "Steady-state cardio duration",
    shortLabel: "Cardio",
    description: "Minutes of steady aerobic work at a sustainable pace.",
    group: "Training",
    unit: "minutes",
    max: 120,
    defaultValue: 30,
  }),
  durationMetric({
    key: "endurance_enhancing",
    label: "Endurance training duration",
    shortLabel: "Endurance",
    description: "Minutes of continuous endurance effort.",
    group: "Training",
    unit: "minutes",
    max: 240,
    defaultValue: 45,
  }),

  scoreMetric({
    key: "energy",
    label: "Energy levels",
    shortLabel: "Energy",
    description: "Overall physical and mental energy today.",
    group: "Daily wellbeing",
    lowLabel: "Drained",
    highLabel: "Energized",
  }),
  scoreMetric({
    key: "mood",
    label: "Mood",
    description: "Your overall emotional state today.",
    group: "Daily wellbeing",
    lowLabel: "Very low",
    highLabel: "Great",
  }),
  scoreMetric({
    key: "concentration_enhancing",
    label: "Focus",
    description: "How well you sustained attention without drift.",
    group: "Cognition",
  }),
  scoreMetric({
    key: "motivation",
    label: "Motivation",
    description: "Drive to start and continue useful work.",
    group: "Daily wellbeing",
  }),
  scoreMetric({
    key: "cognitive_support",
    label: "Mental clarity",
    description: "How clear and sharp your thinking felt.",
    group: "Cognition",
  }),
  scoreMetric({
    key: "productivity",
    label: "Productivity",
    description: "How much meaningful work you completed.",
    group: "Daily wellbeing",
  }),
  scoreMetric({
    key: "physical_resilience",
    label: "Physical resilience",
    description: "How robust your body felt under normal stress.",
    group: "Recovery",
  }),
  scoreMetric({
    key: "sleep_quality",
    label: "Sleep quality",
    description: "How restorative your sleep felt.",
    group: "Recovery",
    lowLabel: "Poor",
    highLabel: "Excellent",
  }),
  scoreMetric({
    key: "exercise_recovery",
    label: "Recovery quality",
    description: "How recovered you felt between training sessions.",
    group: "Recovery",
    lowLabel: "Poor",
    highLabel: "Excellent",
  }),
  scoreMetric({
    key: "workout_intensity",
    label: "Workout intensity",
    description: "How hard today's training session felt.",
    group: "Training",
  }),
  scoreMetric({
    key: "sociability",
    label: "Sociability",
    description: "Ease and desire for social interaction.",
    group: "Daily wellbeing",
  }),
  scoreMetric({
    key: "sex_drive",
    label: "Sex drive",
    description: "Self-rated libido today.",
    group: "Hormones",
  }),

  pressureMetric({
    key: "stress",
    label: "Stress level",
    shortLabel: "Stress",
    description: "Perceived stress load today.",
    group: "Load",
    lowLabel: "Calm",
    highLabel: "High stress",
  }),
  pressureMetric({
    key: "anxiety",
    label: "Anxiety level",
    description: "Perceived anxiety load today.",
    group: "Load",
    lowLabel: "Calm",
    highLabel: "High anxiety",
  }),
  pressureMetric({
    key: "cravings_intensity",
    label: "Cravings intensity",
    description: "How strong cravings felt today.",
    group: "Load",
    lowLabel: "Low",
    highLabel: "Intense",
  }),

  severityMetric({
    key: "anti_inflammatory",
    label: "Inflammation",
    description: "Soreness, stiffness, or swelling severity.",
    group: "Symptoms",
  }),
  severityMetric({
    key: "joint_health",
    label: "Joint pain",
    description: "Joint pain severity during daily movement.",
    group: "Symptoms",
  }),
  severityMetric({
    key: "headache_severity",
    label: "Headache severity",
    shortLabel: "Headache",
    description: "Headache intensity today.",
    group: "Symptoms",
    highLabel: "Debilitating",
  }),
  severityMetric({
    key: "skin_health",
    label: "Skin clarity",
    description: "Skin breakout or irritation severity.",
    group: "Symptoms",
    inversionHint: "0 = clear · 10 = severe breakout",
  }),
  severityMetric({
    key: "digestive_health",
    label: "Digestive comfort",
    description: "Digestive issue severity today.",
    group: "Symptoms",
    inversionHint: "0 = no issues · 10 = severe issues",
  }),
  severityMetric({
    key: "allergies_severity",
    label: "Allergies severity",
    description: "Allergy symptom severity today.",
    group: "Symptoms",
  }),
  severityMetric({
    key: "bloating",
    label: "Bloating",
    description: "Bloating severity today.",
    group: "Symptoms",
  }),
  severityMetric({
    key: "brain_fog",
    label: "Brain fog",
    description: "Mental fog severity today.",
    group: "Symptoms",
  }),

  numericMetric({
    key: "weight",
    label: "Body weight",
    description: "Body weight measured under similar conditions.",
    group: "Measurements",
    unit: "kg",
    min: 30,
    max: 250,
    step: 0.1,
    defaultValue: 70,
    appleHealthSupported: true,
  }),
  numericMetric({
    key: BLOOD_PRESSURE_METRIC_KEY,
    label: "Blood pressure",
    description: "Latest blood pressure as systolic/diastolic.",
    group: "Measurements",
    unit: "mmHg",
    min: 40,
    max: 260,
    defaultValue: 120,
    appleHealthSupported: true,
    placeholder: "120/80",
  }),
  numericMetric({
    key: "blood_sugar_control",
    label: "Blood glucose",
    description: "Latest blood glucose value.",
    group: "Measurements",
    unit: "mg/dL",
    min: 40,
    max: 400,
    defaultValue: 95,
    appleHealthSupported: true,
  }),
  numericMetric({
    key: "cholesterol_support",
    label: "LDL cholesterol",
    description: "LDL cholesterol from a recent blood test.",
    group: "Measurements",
    unit: "mg/dL",
    min: 40,
    max: 300,
    defaultValue: 130,
    lowerIsBetter: true,
  }),
  numericMetric({
    key: "strength_enhancing",
    label: "Estimated 1RM",
    description: "Estimated one-rep max for your main lift.",
    group: "Measurements",
    unit: "kg",
    min: 0,
    max: 400,
    step: 0.5,
    defaultValue: 40,
  }),
  numericMetric({
    key: "testosterone_enhancing",
    label: "Total testosterone",
    description: "Lab-measured total testosterone level.",
    group: "Measurements",
    unit: "ng/dL",
    min: 100,
    max: 1200,
    defaultValue: 500,
  }),
];

export const PRESET_METRICS_BY_KEY = PRESET_METRICS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

export const DEFAULT_METRIC_KEYS = [
  "sleep",
  "mood",
  "energy",
  "stress",
  "headache_severity",
];

export const DEFAULT_METRICS = DEFAULT_METRIC_KEYS.map(
  (key) => PRESET_METRICS_BY_KEY[key]
)
  .filter(Boolean)
  .map((item) => ({ ...item, enabled: true }));

export const APPLE_HEALTH_SUPPORTED_METRIC_KEYS = PRESET_METRICS.filter(
  (item) => item.appleHealthSupported
).map((item) => item.key);

export const CUSTOM_TRACKER_OPTIONS = [
  { key: TRACKER_TYPES.SCALE, label: "Scale (1-10)" },
  { key: TRACKER_TYPES.NUMBER, label: "Number" },
  { key: TRACKER_TYPES.HOURS, label: "Hours" },
  { key: TRACKER_TYPES.TEXT, label: "Text" },
];

export function toMetricKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function metricTypeLabel(item) {
  if (!item) return "Metric";
  if (item.unit) return `${item.label} (${item.unit})`;
  return item.label;
}

export function isNumericTrackerType(trackerType) {
  return (
    trackerType === TRACKER_TYPES.SCALE ||
    trackerType === TRACKER_TYPES.NUMBER ||
    trackerType === TRACKER_TYPES.HOURS
  );
}

export function isNumericMetric(item) {
  return isNumericTrackerType(item?.trackerType);
}

export function isPresetMetricKey(key) {
  return Boolean(PRESET_METRICS_BY_KEY[key]);
}

export function normalizeMetric(item) {
  if (!item || typeof item !== "object") return null;
  const preset = PRESET_METRICS_BY_KEY[item.key];
  const base = preset ? { ...preset } : {};
  const merged = preset
    ? {
        ...item,
        ...base,
        key: base.key,
        enabled: item.enabled !== false,
      }
    : {
        ...base,
        ...item,
        enabled: item.enabled !== false,
      };

  const trackerType = merged.trackerType ?? TRACKER_TYPES.SCALE;
  merged.trackerType = trackerType;
  merged.inputArchetype =
    merged.inputArchetype ??
    (trackerType === TRACKER_TYPES.HOURS
      ? INPUT_ARCHETYPES.DURATION
      : trackerType === TRACKER_TYPES.NUMBER
      ? INPUT_ARCHETYPES.NUMERIC_FREE
      : INPUT_ARCHETYPES.SCORE_1_10);

  if (trackerType === TRACKER_TYPES.SCALE) {
    merged.min = Number.isFinite(merged.min) ? merged.min : 1;
    merged.max = Number.isFinite(merged.max) ? merged.max : 10;
    merged.step = Number.isFinite(merged.step) ? merged.step : 1;
    merged.defaultValue = Number.isFinite(merged.defaultValue)
      ? merged.defaultValue
      : merged.min;
    merged.lowLabel = merged.lowLabel || "Low";
    merged.highLabel = merged.highLabel || "High";
  }

  if (trackerType === TRACKER_TYPES.NUMBER) {
    merged.step = Number.isFinite(merged.step) ? merged.step : 1;
    merged.defaultValue = Number.isFinite(merged.defaultValue)
      ? merged.defaultValue
      : Number.isFinite(merged.min)
      ? merged.min
      : 0;
  }

  if (trackerType === TRACKER_TYPES.HOURS) {
    merged.min = Number.isFinite(merged.min) ? merged.min : 0;
    merged.max = Number.isFinite(merged.max) ? merged.max : 12;
    merged.step = Number.isFinite(merged.step) ? merged.step : 0.25;
    merged.unit = merged.unit || "hours";
    merged.defaultValue = Number.isFinite(merged.defaultValue)
      ? merged.defaultValue
      : 8;
    merged.lowLabel = merged.lowLabel || "Too little";
    merged.highLabel = merged.highLabel || "Well rested";
  }

  if (trackerType === TRACKER_TYPES.TEXT) {
    merged.placeholder = merged.placeholder || "Write your entry";
    merged.defaultValue =
      typeof merged.defaultValue === "string" ? merged.defaultValue : "";
  }

  return merged;
}

export function makeCustomMetric(name, trackerType) {
  const trimmed = String(name || "").trim();
  const key = toMetricKey(trimmed);
  const baseMetric = normalizeMetric({
    key,
    label: trimmed,
    trackerType,
    enabled: true,
  });
  if (!baseMetric) return null;

  if (trackerType === TRACKER_TYPES.NUMBER) baseMetric.placeholder = "Enter a number";
  if (trackerType === TRACKER_TYPES.HOURS) baseMetric.placeholder = "e.g. 7.5";
  if (trackerType === TRACKER_TYPES.TEXT) baseMetric.placeholder = "Describe today";
  return baseMetric;
}

export function normalizeNumericValue(rawValue, item) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  const normalized = normalizeMetric(item);
  if (!normalized || !isNumericMetric(normalized)) return null;
  const min = Number.isFinite(normalized.min) ? normalized.min : value;
  const max = Number.isFinite(normalized.max) ? normalized.max : value;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, value));
}

export function defaultEntryValue(item) {
  const normalized = normalizeMetric(item);
  if (!normalized) return 0;
  if (normalized.trackerType === TRACKER_TYPES.TEXT) return "";
  if (Number.isFinite(normalized.defaultValue)) return normalized.defaultValue;
  if (Number.isFinite(normalized.min)) return normalized.min;
  return 0;
}

function trimTrailingZeros(value) {
  if (!Number.isFinite(value)) return "";
  return String(value).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
}

export function formatMetricValue(item, value) {
  const normalized = normalizeMetric(item);
  if (!normalized) return "—";

  if (normalized.key === BLOOD_PRESSURE_METRIC_KEY) {
    return formatBloodPressureValue(value);
  }

  if (normalized.trackerType === TRACKER_TYPES.TEXT) {
    const textValue =
      typeof value === "string"
        ? value.trim()
        : value == null
        ? ""
        : String(value).trim();
    return textValue || "—";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";

  if (normalized.trackerType === TRACKER_TYPES.SCALE) {
    const max = Number.isFinite(normalized.max) ? normalized.max : 10;
    return `${trimTrailingZeros(numericValue)}/${trimTrailingZeros(max)}`;
  }

  const suffix = normalized.unit ? ` ${normalized.unit}` : "";
  return `${trimTrailingZeros(numericValue)}${suffix}`;
}

export function getMetricChartRange(item, numericValues) {
  const normalized = normalizeMetric(item);
  const values = Array.isArray(numericValues)
    ? numericValues.filter((value) => Number.isFinite(value))
    : [];

  if (!values.length) return { min: 0, max: 1 };

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  if (normalized?.key === "weight") {
    const anchor = values[values.length - 1];
    const centeredMin = Math.floor(anchor - 10);
    const centeredMax = Math.ceil(anchor + 10);
    const min = Math.min(centeredMin, Math.floor(dataMin));
    const max = Math.max(centeredMax, Math.ceil(dataMax));
    return { min, max: max === min ? max + 1 : max };
  }

  const configuredMin = Number.isFinite(normalized?.min)
    ? normalized.min
    : dataMin;
  const configuredMax = Number.isFinite(normalized?.max)
    ? normalized.max
    : dataMax;
  const min = Math.min(configuredMin, dataMin);
  const max = Math.max(configuredMax, dataMax);
  return { min, max: max === min ? max + 1 : max };
}

export function parseNumericText(input) {
  const parsed = Number(String(input || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function isBloodPressureMetric(metricOrKey) {
  const key =
    typeof metricOrKey === "string" ? metricOrKey : metricOrKey?.key || "";
  return key === BLOOD_PRESSURE_METRIC_KEY;
}

export function isAppleHealthSupportedMetric(metricOrKey) {
  const key =
    typeof metricOrKey === "string" ? metricOrKey : metricOrKey?.key || "";
  return APPLE_HEALTH_SUPPORTED_METRIC_KEYS.includes(key);
}

export function normalizeBloodPressureValue(input) {
  if (input && typeof input === "object") {
    const systolic = parseNumericText(input.systolic);
    const diastolic = parseNumericText(input.diastolic);
    if (systolic == null || diastolic == null) return null;
    return {
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic),
    };
  }

  if (typeof input === "string") {
    const cleaned = input.trim();
    if (!cleaned) return null;
    const match = cleaned.match(/(\d+(?:\.\d+)?)\s*[/\\]\s*(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const systolic = parseNumericText(match[1]);
    const diastolic = parseNumericText(match[2]);
    if (systolic == null || diastolic == null) return null;
    return {
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic),
    };
  }

  return null;
}

export function isValidBloodPressureValue(value) {
  const normalized = normalizeBloodPressureValue(value);
  if (!normalized) return false;
  return (
    normalized.systolic >= 40 &&
    normalized.systolic <= 260 &&
    normalized.diastolic >= 30 &&
    normalized.diastolic <= 160
  );
}

export function formatBloodPressureValue(value) {
  const normalized = normalizeBloodPressureValue(value);
  if (!normalized) return "—";
  return `${normalized.systolic}/${normalized.diastolic} mmHg`;
}
