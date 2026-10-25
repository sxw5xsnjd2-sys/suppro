import { isSupplementScheduledOnDate } from "@/features/supplements/schedule";

export const REMINDER_ID_PREFIX = "suppro-supplement-reminder:";
export const REMINDER_NOTIFICATION_TYPE = "supplement-reminder";
// iOS keeps at most 64 pending local notifications per app and silently drops
// the rest, so the queue stays below that on both platforms.
export const MAX_SCHEDULED_REMINDERS = 60;
export const REMINDER_HORIZON_DAYS = 28;
export const REMINDER_TITLE = "SUPPRO";
export const REMINDER_QUEUE_END_SUFFIX =
  "Open SUPPRO to keep your reminders coming.";

const MINUTES_PER_DAY = 24 * 60;
// Anything due sooner than this is treated as already due, never as overdue.
const MIN_REMINDER_LEAD_MS = 60 * 1000;
// Used only to decide whether the queue ends before the schedule does.
const COVERAGE_LOOKAHEAD_DAYS = 31;

export function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseClockTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(
    typeof value === "string" ? value.trim() : "",
  );
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// Only the saved dose time is used. Legacy rows whose time could not be parsed
// were migrated to timeMinutes 0, so midnight needs a matching "00:00" label.
export function resolveReminderTimeMinutes(supplement) {
  const clockMinutes = parseClockTime(supplement?.time);
  const timeMinutes = Number(supplement?.timeMinutes);

  if (
    Number.isInteger(timeMinutes) &&
    timeMinutes > 0 &&
    timeMinutes < MINUTES_PER_DAY
  ) {
    return timeMinutes;
  }

  return clockMinutes;
}

function formatClockKey(timeMinutes) {
  const hours = String(Math.floor(timeMinutes / 60)).padStart(2, "0");
  const minutes = String(timeMinutes % 60).padStart(2, "0");
  return `${hours}${minutes}`;
}

export function getReminderIdentifier(dateKey, timeMinutes) {
  return `${REMINDER_ID_PREFIX}${dateKey}T${formatClockKey(timeMinutes)}`;
}

export function formatReminderBody(names) {
  const safeNames = names.filter(Boolean);

  if (safeNames.length === 0) return "Time to take your supplements.";
  if (safeNames.length === 1) return `Time to take ${safeNames[0]}.`;
  if (safeNames.length === 2) {
    return `Time to take ${safeNames[0]} and ${safeNames[1]}.`;
  }
  if (safeNames.length === 3) {
    return `Time to take ${safeNames[0]}, ${safeNames[1]} and ${safeNames[2]}.`;
  }

  return `Time to take ${safeNames[0]}, ${safeNames[1]} and ${
    safeNames.length - 2
  } more.`;
}

function getSupplementName(supplement) {
  return typeof supplement?.name === "string" ? supplement.name.trim() : "";
}

function isTrackableSupplement(supplement) {
  return (
    Boolean(supplement) &&
    typeof supplement === "object" &&
    supplement.id !== undefined &&
    supplement.id !== null &&
    resolveReminderTimeMinutes(supplement) !== null
  );
}

function getRemindersForDay({ day, supplements, takenTimesByDate, nowMs }) {
  const dateKey = toLocalDateKey(day);
  const takenOnDate = takenTimesByDate?.[dateKey] ?? {};
  const groups = new Map();

  supplements.forEach((supplement) => {
    if (takenOnDate[supplement.id]) return;
    if (!isSupplementScheduledOnDate(supplement, dateKey)) return;

    const timeMinutes = resolveReminderTimeMinutes(supplement);
    const fireAt = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      Math.floor(timeMinutes / 60),
      timeMinutes % 60,
    ).getTime();
    if (fireAt - nowMs < MIN_REMINDER_LEAD_MS) return;

    const group = groups.get(timeMinutes) ?? {
      fireAt,
      supplementIds: [],
      names: [],
    };
    group.supplementIds.push(String(supplement.id));
    group.names.push(getSupplementName(supplement));
    groups.set(timeMinutes, group);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([timeMinutes, group]) => ({
      identifier: getReminderIdentifier(dateKey, timeMinutes),
      dateKey,
      timeMinutes,
      fireAt: group.fireAt,
      supplementIds: group.supplementIds,
      title: REMINDER_TITLE,
      body: formatReminderBody(group.names),
      isQueueEnd: false,
    }));
}

function hasScheduledDoseBetween({ supplements, startDay, days }) {
  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = toLocalDateKey(addLocalDays(startDay, offset));
    if (
      supplements.some((supplement) =>
        isSupplementScheduledOnDate(supplement, dateKey),
      )
    ) {
      return true;
    }
  }

  return false;
}

// Builds the finite queue of one-off local notifications. Supplements sharing a
// dose time on the same date share one notification, so each slot has a stable
// identifier that rescheduling replaces instead of duplicating.
export function buildReminderPlan({
  supplements,
  takenTimesByDate,
  now = new Date(),
  horizonDays = REMINDER_HORIZON_DAYS,
  maxReminders = MAX_SCHEDULED_REMINDERS,
} = {}) {
  const trackable = (Array.isArray(supplements) ? supplements : []).filter(
    isTrackableSupplement,
  );
  const safeTaken =
    takenTimesByDate && typeof takenTimesByDate === "object"
      ? takenTimesByDate
      : {};
  const today = addLocalDays(now, 0);
  const nowMs = now.getTime();
  const candidates = [];

  for (let offset = 0; offset < horizonDays; offset += 1) {
    candidates.push(
      ...getRemindersForDay({
        day: addLocalDays(today, offset),
        supplements: trackable,
        takenTimesByDate: safeTaken,
        nowMs,
      }),
    );
  }

  const reminders = candidates.slice(0, Math.max(0, maxReminders));
  const wasTruncated = candidates.length > reminders.length;
  const continuesAfterHorizon =
    !wasTruncated &&
    hasScheduledDoseBetween({
      supplements: trackable,
      startDay: addLocalDays(today, horizonDays),
      days: COVERAGE_LOOKAHEAD_DAYS,
    });
  const isComplete = !wasTruncated && !continuesAfterHorizon;
  const lastReminder = reminders[reminders.length - 1];

  if (!isComplete && lastReminder) {
    reminders[reminders.length - 1] = {
      ...lastReminder,
      body: `${lastReminder.body} ${REMINDER_QUEUE_END_SUFFIX}`,
      isQueueEnd: true,
    };
  }

  return {
    reminders,
    isComplete,
    coverageEndsAt: lastReminder ? lastReminder.fireAt : null,
  };
}
