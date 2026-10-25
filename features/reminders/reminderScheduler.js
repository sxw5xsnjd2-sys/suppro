import {
  REMINDER_ID_PREFIX,
  REMINDER_NOTIFICATION_TYPE,
} from "@/features/reminders/reminderPlan";

// Android channels keep the sound they were created with, so the branded sound
// needs its own channel. Older channels are migrated by the controller.
export const SUPPLEMENT_REMINDER_CHANNEL_ID = "supplement-reminders-v2";
export const LEGACY_SUPPLEMENT_REMINDER_CHANNEL_IDS = ["supplement-reminders"];
// Bundled by the expo-notifications config plugin (iOS app bundle and Android
// res/raw). iOS needs the extension; Android resolves the raw resource by name.
export const SUPPLEMENT_REMINDER_SOUND = "suppro_reminder.wav";

export function isSupplementReminderIdentifier(identifier) {
  return (
    typeof identifier === "string" && identifier.startsWith(REMINDER_ID_PREFIX)
  );
}

// Channel and sound are part of the signature so reminders queued before a
// channel or sound change are re-queued with the current ones.
function getReminderSignature(reminder, accountId, channelId) {
  return [
    reminder.fireAt,
    reminder.title,
    reminder.body,
    accountId ?? "",
    channelId,
    SUPPLEMENT_REMINDER_SOUND,
  ].join("|");
}

async function getScheduledReminderSignatures(notifications) {
  const requests = await notifications.getAllScheduledNotificationsAsync();
  const signatures = new Map();

  (Array.isArray(requests) ? requests : []).forEach((request) => {
    if (!isSupplementReminderIdentifier(request?.identifier)) return;
    const signature = request?.content?.data?.signature;
    signatures.set(
      request.identifier,
      typeof signature === "string" ? signature : null
    );
  });

  return signatures;
}

// Reconciles the OS queue with the plan: unchanged reminders are left alone,
// stale ones are cancelled, and new or changed ones are (re)scheduled under
// their deterministic identifier so a slot can never be queued twice.
export async function applyReminderPlan({
  notifications,
  reminders,
  accountId,
  channelId = SUPPLEMENT_REMINDER_CHANNEL_ID,
}) {
  const existing = await getScheduledReminderSignatures(notifications);
  const desired = new Map(
    reminders.map((reminder) => [
      reminder.identifier,
      {
        reminder,
        signature: getReminderSignature(reminder, accountId, channelId),
      },
    ])
  );

  const toCancel = Array.from(existing.keys()).filter(
    (identifier) =>
      existing.get(identifier) !== desired.get(identifier)?.signature
  );
  const toSchedule = Array.from(desired.values()).filter(
    ({ reminder, signature }) => existing.get(reminder.identifier) !== signature
  );

  for (const identifier of toCancel) {
    await notifications.cancelScheduledNotificationAsync(identifier);
  }

  for (const { reminder, signature } of toSchedule) {
    await notifications.scheduleNotificationAsync({
      identifier: reminder.identifier,
      content: {
        title: reminder.title,
        body: reminder.body,
        sound: SUPPLEMENT_REMINDER_SOUND,
        data: {
          type: REMINDER_NOTIFICATION_TYPE,
          accountId: accountId ?? null,
          dateKey: reminder.dateKey,
          supplementIds: reminder.supplementIds,
          signature,
        },
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.fireAt,
        channelId,
      },
    });
  }

  return { cancelled: toCancel.length, scheduled: toSchedule.length };
}

export async function cancelAllSupplementReminders({
  notifications,
  dismissPresented = false,
}) {
  const existing = await getScheduledReminderSignatures(notifications);

  for (const identifier of existing.keys()) {
    await notifications.cancelScheduledNotificationAsync(identifier);
  }

  if (!dismissPresented) {
    return { cancelled: existing.size, dismissed: 0 };
  }

  const presented = await notifications.getPresentedNotificationsAsync();
  const presentedReminderIds = (Array.isArray(presented) ? presented : [])
    .map((notification) => notification?.request?.identifier)
    .filter(isSupplementReminderIdentifier);

  for (const identifier of presentedReminderIds) {
    await notifications.dismissNotificationAsync(identifier);
  }

  return { cancelled: existing.size, dismissed: presentedReminderIds.length };
}
