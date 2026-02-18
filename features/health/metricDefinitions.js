const TRACKER_TYPES = {
  SCALE: "scale",
  NUMBER: "number",
  HOURS: "hours",
  TEXT: "text",
};

const scaleTracker = (overrides = {}) => ({
  trackerType: TRACKER_TYPES.SCALE,
  min: 1,
  max: 10,
  step: 1,
  lowLabel: "Low",
  highLabel: "High",
  defaultValue: 5,
  ...overrides,
});

const numberTracker = (overrides = {}) => ({
  trackerType: TRACKER_TYPES.NUMBER,
  step: 1,
  defaultValue: 0,
  ...overrides,
});

const hoursTracker = (overrides = {}) => ({
  trackerType: TRACKER_TYPES.HOURS,
  min: 0,
  max: 16,
  step: 0.25,
  unit: "hours",
  defaultValue: 8,
  ...overrides,
});

const textTracker = (overrides = {}) => ({
  trackerType: TRACKER_TYPES.TEXT,
  placeholder: "Write your entry",
  defaultValue: "",
  ...overrides,
});

export const CUSTOM_METRIC_KEY = "__custom_metric__";
export const BLOOD_PRESSURE_METRIC_KEY = "blood_pressure_control";

export const PRESET_METRICS = [
  {
    key: "anti_aging",
    label: "Healthy aging readiness",
    description:
      "Overall sense of aging well today across vitality, resilience, and recovery.",
    ...scaleTracker({ lowLabel: "Poor", highLabel: "Excellent" }),
  },
  {
    key: "anti_inflammatory",
    label: "Inflammation symptoms score",
    description:
      "How intense inflammation-related symptoms feel today, such as soreness, stiffness, or swelling.",
    ...scaleTracker({ lowLabel: "Severe", highLabel: "Calm" }),
  },
  {
    key: "blood_pressure_control",
    label: "Blood pressure",
    description:
      "Enter your latest blood pressure as systolic/diastolic, for example 120/80 mmHg.",
    ...numberTracker({
      unit: "mmHg",
      min: 40,
      max: 260,
      defaultValue: 120,
      placeholder: "Use systolic/diastolic fields",
    }),
  },
  {
    key: "blood_sugar_control",
    label: "Blood glucose",
    description:
      "Your blood glucose value. Try to measure at the same time context (for example fasting) for consistency.",
    ...numberTracker({ unit: "mmol/L", min: 0, max: 35 }),
  },
  {
    key: "bone_health",
    label: "Bone and skeletal comfort",
    description:
      "How comfortable and stable your bones and skeletal system feel during daily activity.",
    ...scaleTracker({
      lowLabel: "Very uncomfortable",
      highLabel: "Very comfortable",
    }),
  },
  {
    key: "cardiovascular_health",
    label: "Steady-state cardio duration",
    description:
      "How many minutes you can run, swim, or cycle at a pace where you can hold a conversation but not sing.",
    ...numberTracker({ unit: "minutes", min: 0, max: 180, defaultValue: 30 }),
  },
  {
    key: "cholesterol_support",
    label: "LDL cholesterol",
    description: "Your LDL cholesterol from a recent blood test.",
    ...numberTracker({ unit: "mg/dL", min: 50, max: 220, defaultValue: 130 }),
  },
  {
    key: "cognitive_support",
    label: "Cognitive clarity",
    description:
      "How clear and sharp your thinking feels for reasoning, planning, and decision-making.",
    ...scaleTracker(),
  },
  {
    key: "concentration_enhancing",
    label: "Focus quality",
    description:
      "How well you can sustain attention on tasks without mental drift or distraction.",
    ...scaleTracker(),
  },
  {
    key: "digestive_health",
    label: "Digestive comfort",
    description:
      "How comfortable your digestion feels today, including bloating, cramps, and regularity.",
    ...scaleTracker(),
  },
  {
    key: "endurance_enhancing",
    label: "Endurance duration",
    description:
      "How long you can sustain continuous aerobic effort at your target training intensity.",
    ...numberTracker({ unit: "minutes", min: 0, max: 240, defaultValue: 20 }),
  },
  {
    key: "energy",
    label: "Daily energy",
    description: "Your overall physical and mental energy throughout the day.",
    ...scaleTracker({ lowLabel: "Drained", highLabel: "Energized" }),
  },
  {
    key: "exercise_recovery",
    label: "Exercise recovery quality",
    description:
      "How recovered your body feels between training sessions, including soreness and readiness.",
    ...scaleTracker({ lowLabel: "Poor", highLabel: "Excellent" }),
  },
  {
    key: "female_fertility",
    label: "Female fertility signs",
    description:
      "Self-rated fertility-related signs such as cycle quality and ovulation indicators.",
    ...scaleTracker({ lowLabel: "Weak signs", highLabel: "Strong signs" }),
  },
  {
    key: "female_hormone_balance",
    label: "Female hormone balance",
    description:
      "How balanced hormone-related symptoms feel, including cycle stability and PMS intensity.",
    ...scaleTracker({ lowLabel: "Unbalanced", highLabel: "Balanced" }),
  },
  {
    key: "female_sexual_arousal",
    label: "Sexual wellbeing (female)",
    description:
      "Self-rated female sexual wellbeing including desire, arousal, and comfort.",
    ...scaleTracker({ lowLabel: "Low", highLabel: "High" }),
  },
  {
    key: "hair_health",
    label: "Hair health",
    description:
      "Perceived hair quality, including strength, breakage, and shedding trends.",
    ...scaleTracker(),
  },
  {
    key: "immune_health",
    label: "Immune resilience",
    description:
      "How resilient you feel against illness, including frequency and intensity of symptoms.",
    ...scaleTracker(),
  },
  {
    key: "injury_recovery",
    label: "Injury recovery progress",
    description:
      "Progress of healing and functional return for a specific injury over time.",
    ...scaleTracker({ lowLabel: "Early stage", highLabel: "Fully recovered" }),
  },
  {
    key: "joint_health",
    label: "Joint comfort and mobility",
    description:
      "How comfortable and mobile your joints feel during daily movement and exercise.",
    ...scaleTracker(),
  },
  {
    key: "lymphatic_swelling_support",
    label: "Swelling and fluid retention",
    description:
      "How noticeable swelling, puffiness, or fluid retention feels today.",
    ...scaleTracker({ lowLabel: "High swelling", highLabel: "No swelling" }),
  },
  {
    key: "male_fertility",
    label: "Male fertility signs",
    description:
      "Self-rated male fertility-related signs and reproductive wellbeing.",
    ...scaleTracker({ lowLabel: "Weak signs", highLabel: "Strong signs" }),
  },
  {
    key: "male_sexual_arousal",
    label: "Sexual wellbeing (male)",
    description:
      "Self-rated male sexual wellbeing including desire, arousal, and confidence.",
    ...scaleTracker({ lowLabel: "Low", highLabel: "High" }),
  },
  {
    key: "memory_enhancing",
    label: "Memory quality",
    description:
      "How reliably you recall recent information, names, and tasks.",
    ...scaleTracker(),
  },
  {
    key: "mood",
    label: "Mood",
    description: "Your overall emotional state today.",
    ...scaleTracker({ lowLabel: "Very low", highLabel: "Great" }),
  },
  {
    key: "skin_health",
    label: "Skin health",
    description:
      "Perceived skin condition, including clarity, dryness, irritation, and texture.",
    ...scaleTracker(),
  },
  {
    key: "sleep",
    label: "Sleep duration",
    description: "Total hours slept in your most recent sleep period.",
    ...hoursTracker({ lowLabel: "Too little", highLabel: "Well rested" }),
  },
  {
    key: "strength_enhancing",
    label: "Estimated 1RM (main lift)",
    description:
      "Track estimated one-rep max for the same primary lift each time, such as squat, bench, or deadlift.",
    ...numberTracker({
      unit: "kg",
      min: 0,
      max: 400,
      step: 0.5,
      defaultValue: 40,
      placeholder: "e.g. estimated 1RM in kg",
    }),
  },
  {
    key: "stress",
    label: "Stress level",
    description:
      "Your perceived stress level, where lower scores indicate high stress and higher scores indicate calm.",
    ...scaleTracker({ lowLabel: "High stress", highLabel: "Calm" }),
  },
  {
    key: "testosterone_enhancing",
    label: "Total testosterone",
    description: "Lab-measured total testosterone level.",
    ...numberTracker({ unit: "ng/dL", min: 100, max: 1200, defaultValue: 500 }),
  },
  {
    key: "urine_health",
    label: "Urinary comfort",
    description:
      "Urinary comfort and symptom severity, including urgency, discomfort, and flow quality.",
    ...scaleTracker(),
  },
  {
    key: "weight",
    label: "Body weight",
    description:
      "Body weight measured under similar conditions each time, such as morning before food.",
    ...numberTracker({
      unit: "kg",
      min: 30,
      max: 250,
      step: 0.1,
      defaultValue: 70,
    }),
  },
];

export const PRESET_METRICS_BY_KEY = PRESET_METRICS.reduce((acc, metric) => {
  acc[metric.key] = metric;
  return acc;
}, {});

export const DEFAULT_METRIC_KEYS = ["sleep", "mood", "energy", "stress"];

export const DEFAULT_METRICS = DEFAULT_METRIC_KEYS.map(
  (key) => PRESET_METRICS_BY_KEY[key]
)
  .filter(Boolean)
  .map((metric) => ({ ...metric, enabled: true }));

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

export function metricTypeLabel(metric) {
  if (!metric) return "Metric";
  if (metric.unit) return `${metric.label} (${metric.unit})`;
  return metric.label;
}

export function isNumericTrackerType(trackerType) {
  return (
    trackerType === TRACKER_TYPES.SCALE ||
    trackerType === TRACKER_TYPES.NUMBER ||
    trackerType === TRACKER_TYPES.HOURS
  );
}

export function isNumericMetric(metric) {
  return isNumericTrackerType(metric?.trackerType);
}

export function normalizeMetric(metric) {
  if (!metric || typeof metric !== "object") return null;
  const preset = PRESET_METRICS_BY_KEY[metric.key];
  const base = preset ? { ...preset } : {};

  // For preset metrics, keep the latest preset metadata authoritative so label,
  // description, tracker rules, and defaults stay current across app updates.
  const merged = preset
    ? {
        ...metric,
        ...base,
        key: base.key,
        enabled: metric.enabled !== false,
      }
    : {
        ...base,
        ...metric,
        enabled: metric.enabled !== false,
      };

  const trackerType =
    merged.trackerType ?? base.trackerType ?? TRACKER_TYPES.SCALE;
  merged.trackerType = trackerType;

  if (trackerType === TRACKER_TYPES.SCALE) {
    merged.min = Number.isFinite(merged.min) ? merged.min : 1;
    merged.max = Number.isFinite(merged.max) ? merged.max : 10;
    merged.step = Number.isFinite(merged.step) ? merged.step : 1;
    merged.defaultValue = Number.isFinite(merged.defaultValue)
      ? merged.defaultValue
      : 5;
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
    merged.max = Number.isFinite(merged.max) ? merged.max : 16;
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

  if (trackerType === TRACKER_TYPES.NUMBER) {
    baseMetric.placeholder = "Enter a number";
  }
  if (trackerType === TRACKER_TYPES.HOURS) {
    baseMetric.placeholder = "e.g. 7.5";
  }
  if (trackerType === TRACKER_TYPES.TEXT) {
    baseMetric.placeholder = "Describe today";
  }
  if (trackerType === TRACKER_TYPES.SCALE) {
    baseMetric.lowLabel = "Low";
    baseMetric.highLabel = "High";
  }
  return baseMetric;
}

export function normalizeNumericValue(rawValue, metric) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  const normalized = normalizeMetric(metric);
  if (!normalized || !isNumericMetric(normalized)) return null;
  const min = Number.isFinite(normalized.min) ? normalized.min : value;
  const max = Number.isFinite(normalized.max) ? normalized.max : value;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, value));
}

export function defaultEntryValue(metric) {
  const normalized = normalizeMetric(metric);
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

export function formatMetricValue(metric, value) {
  const normalized = normalizeMetric(metric);
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

export function parseNumericText(input) {
  const parsed = Number(String(input || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function isBloodPressureMetric(metricOrKey) {
  const key =
    typeof metricOrKey === "string" ? metricOrKey : metricOrKey?.key || "";
  return key === BLOOD_PRESSURE_METRIC_KEY;
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

export { TRACKER_TYPES };
