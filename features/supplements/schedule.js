export const ALL_DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SUPPLEMENT_SCHEDULE_PRESETS = [
  {
    value: "daily",
    label: "Daily",
    scheduleType: "weekly",
    daysOfWeek: ALL_DAYS_OF_WEEK,
  },
  {
    value: "every_other_day",
    label: "Every other day",
    scheduleType: "interval",
    intervalDays: 2,
  },
  {
    value: "once_weekly",
    label: "Once a week",
    scheduleType: "weekly",
    daysOfWeek: [1],
  },
  {
    value: "twice_weekly",
    label: "2x/week",
    scheduleType: "weekly",
    daysOfWeek: [1, 4],
  },
  {
    value: "three_times_weekly",
    label: "3x/week",
    scheduleType: "weekly",
    daysOfWeek: [1, 3, 5],
  },
  {
    value: "five_times_weekly",
    label: "5x/week",
    scheduleType: "weekly",
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  {
    value: "custom",
    label: "Custom",
    scheduleType: "custom",
    daysOfWeek: ALL_DAYS_OF_WEEK,
  },
];

const LEGACY_FREQUENCY_LABELS = {
  1: "1 time / day",
  2: "2 times / day",
  3: "3 times / day",
  "4_plus": "4+ times / day",
};

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalISODate(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function normalizeAnchorDate(value) {
  return trimString(value) || toLocalISODate(new Date());
}

function daysBetween(startDate, endDate) {
  const start = parseLocalISODate(startDate);
  const end = parseLocalISODate(endDate);
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function normalizeDaysOfWeek(value, fallback = ALL_DAYS_OF_WEEK) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return Array.from(
    new Set(
      source
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);
}

export function getSchedulePreset(value) {
  const normalizedValue = trimString(value);
  return SUPPLEMENT_SCHEDULE_PRESETS.find(
    (preset) => preset.value === normalizedValue
  );
}

export function buildScheduleFromPreset(
  value,
  { anchorDate, customLabel } = {}
) {
  const preset = getSchedulePreset(value) ?? SUPPLEMENT_SCHEDULE_PRESETS[0];
  const label =
    preset.value === "custom"
      ? trimString(customLabel) || preset.label
      : preset.label;

  if (preset.scheduleType === "interval") {
    return {
      frequency: preset.value,
      frequencyLabel: label,
      scheduleType: "interval",
      daysOfWeek: [],
      intervalDays: preset.intervalDays,
      scheduleAnchorDate: normalizeAnchorDate(anchorDate),
    };
  }

  return {
    frequency: preset.value,
    frequencyLabel: label,
    scheduleType: preset.scheduleType,
    daysOfWeek: normalizeDaysOfWeek(preset.daysOfWeek),
    intervalDays: null,
    scheduleAnchorDate: null,
  };
}

export function normalizeSupplementSchedule(value = {}, { anchorDate } = {}) {
  const frequency = trimString(value.frequency);
  const frequencyLabel = trimString(value.frequencyLabel);
  const preset = getSchedulePreset(frequency);

  if (preset) {
    return buildScheduleFromPreset(preset.value, {
      anchorDate: value.scheduleAnchorDate || anchorDate,
      customLabel: frequencyLabel,
    });
  }

  if (value.scheduleType === "interval") {
    const intervalDays = Number(value.intervalDays);
    const safeIntervalDays =
      Number.isFinite(intervalDays) && intervalDays > 0 ? intervalDays : 2;
    return {
      frequency: frequency || "every_other_day",
      frequencyLabel:
        frequencyLabel ||
        (safeIntervalDays === 2
          ? "Every other day"
          : `Every ${safeIntervalDays} days`),
      scheduleType: "interval",
      daysOfWeek: [],
      intervalDays: safeIntervalDays,
      scheduleAnchorDate: normalizeAnchorDate(
        value.scheduleAnchorDate || anchorDate
      ),
    };
  }

  if (value.scheduleType === "custom") {
    return {
      frequency: frequency || "custom",
      frequencyLabel: frequencyLabel || frequency || "Custom",
      scheduleType: "custom",
      daysOfWeek: normalizeDaysOfWeek(value.daysOfWeek),
      intervalDays: null,
      scheduleAnchorDate: null,
    };
  }

  if (Array.isArray(value.daysOfWeek) && value.daysOfWeek.length > 0) {
    const daysOfWeek = normalizeDaysOfWeek(value.daysOfWeek);
    const isDaily = daysOfWeek.length === ALL_DAYS_OF_WEEK.length;
    return {
      frequency: frequency || (isDaily ? "daily" : "weekly"),
      frequencyLabel:
        frequencyLabel ||
        (isDaily
          ? "Daily"
          : daysOfWeek.map((day) => WEEKDAY_LABELS[day]).join(", ")),
      scheduleType: "weekly",
      daysOfWeek,
      intervalDays: null,
      scheduleAnchorDate: null,
    };
  }

  if (LEGACY_FREQUENCY_LABELS[frequency]) {
    return {
      ...buildScheduleFromPreset("daily"),
      frequency,
      frequencyLabel: LEGACY_FREQUENCY_LABELS[frequency],
    };
  }

  if (frequencyLabel || frequency) {
    return {
      ...buildScheduleFromPreset("daily"),
      frequency: frequency || "custom",
      frequencyLabel: frequencyLabel || frequency,
      scheduleType: frequency === "custom" ? "custom" : "weekly",
    };
  }

  return buildScheduleFromPreset("daily", { anchorDate });
}

export function getSupplementScheduleLabel(supplement) {
  return normalizeSupplementSchedule(supplement).frequencyLabel;
}

export function isSupplementScheduledOnDate(supplement, date) {
  if (supplement?.startDate && date < supplement.startDate) return false;
  if (supplement?.endDate && date > supplement.endDate) return false;

  const schedule = normalizeSupplementSchedule(supplement, {
    anchorDate: supplement?.startDate || date,
  });

  if (schedule.scheduleType === "interval") {
    const offset = daysBetween(schedule.scheduleAnchorDate, date);
    return offset >= 0 && offset % schedule.intervalDays === 0;
  }

  const dayOfWeek = parseLocalISODate(date).getDay();
  return schedule.daysOfWeek.includes(dayOfWeek);
}
