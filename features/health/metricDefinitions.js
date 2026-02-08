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

export const PRESET_METRICS = [
  {
    key: "anti_aging",
    label: "Healthy aging score",
    ...scaleTracker({ lowLabel: "Poor", highLabel: "Excellent" }),
  },
  {
    key: "anti_inflammatory",
    label: "Inflammation symptoms",
    ...scaleTracker({ lowLabel: "Severe", highLabel: "Calm" }),
  },
  {
    key: "blood_pressure_control",
    label: "Blood pressure",
    ...textTracker({ placeholder: "e.g. 120/80 mmHg" }),
  },
  {
    key: "blood_sugar_control",
    label: "Blood glucose",
    ...numberTracker({ unit: "mmol/L", min: 0, max: 35 }),
  },
  { key: "bone_health", label: "Bone comfort", ...scaleTracker() },
  {
    key: "cardiovascular_health",
    label: "Cardiovascular health",
    ...numberTracker({ unit: "minutes", min: 0, max: 180, defaultValue: 30 }),
  },
  {
    key: "cholesterol_support",
    label: "LDL cholesterol",
    ...numberTracker({ unit: "mg/dL", min: 50, max: 220, defaultValue: 130 }),
  },
  { key: "cognitive_support", label: "Cognitive function", ...scaleTracker() },
  { key: "concentration_enhancing", label: "Focus", ...scaleTracker() },
  { key: "digestive_health", label: "Digestive comfort", ...scaleTracker() },
  {
    key: "endurance_enhancing",
    label: "Endurance",
    ...numberTracker({ unit: "minutes", min: 0, max: 240, defaultValue: 20 }),
  },
  { key: "energy", label: "Energy levels", ...scaleTracker() },
  {
    key: "exercise_recovery",
    label: "Exercise recovery",
    ...scaleTracker({ lowLabel: "Poor", highLabel: "Excellent" }),
  },
  {
    key: "female_fertility",
    label: "Fertility signs score (female)",
    ...scaleTracker(),
  },
  {
    key: "female_hormone_balance",
    label: "Hormone balance (female)",
    ...scaleTracker(),
  },
  {
    key: "female_sexual_arousal",
    label: "Sexual wellbeing (female)",
    ...scaleTracker(),
  },
  { key: "hair_health", label: "Hair", ...scaleTracker() },
  { key: "immune_health", label: "Immune resilience", ...scaleTracker() },
  { key: "injury_recovery", label: "Injury recovery", ...scaleTracker() },
  { key: "joint_health", label: "Joint comfort", ...scaleTracker() },
  {
    key: "lymphatic_swelling_support",
    label: "Swelling relief",
    ...scaleTracker({ lowLabel: "High swelling", highLabel: "No swelling" }),
  },
  { key: "male_fertility", label: "Fertility signs(male)", ...scaleTracker() },
  {
    key: "male_sexual_arousal",
    label: "Sexual wellbeing (male)",
    ...scaleTracker(),
  },
  { key: "memory_enhancing", label: "Memory", ...scaleTracker() },
  {
    key: "mood",
    label: "Mood",
    ...scaleTracker({ lowLabel: "Very low", highLabel: "Great" }),
  },
  { key: "skin_health", label: "Skin", ...scaleTracker() },
  {
    key: "sleep",
    label: "Sleep duration",
    ...hoursTracker({ lowLabel: "Too little", highLabel: "Well rested" }),
  },
  {
    key: "strength_enhancing",
    label: "Strength session result",
    ...textTracker({ placeholder: "e.g. Squat 5x5 @ 80kg" }),
  },
  {
    key: "stress",
    label: "Stress levels",
    ...scaleTracker({ lowLabel: "High stress", highLabel: "Calm" }),
  },
  {
    key: "testosterone_enhancing",
    label: "Testosterone level",
    ...numberTracker({ unit: "ng/dL", min: 100, max: 1200, defaultValue: 500 }),
  },
  { key: "urine_health", label: "Urinary comfort", ...scaleTracker() },
  {
    key: "weight",
    label: "Body weight",
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
  const trackerType =
    metric.trackerType ?? base.trackerType ?? TRACKER_TYPES.SCALE;
  const merged = {
    ...base,
    ...metric,
    trackerType,
    enabled: metric.enabled !== false,
  };

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

export { TRACKER_TYPES };
