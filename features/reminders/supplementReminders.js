import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { createSupplementReminderController } from "@/features/reminders/reminderController";
import {
  REMINDER_NOTIFICATION_TYPE,
  toLocalDateKey,
} from "@/features/reminders/reminderPlan";
import { useSupplementsStore } from "@/features/supplements/store";
import { SUPPLEMENTS_STORAGE_KEY_PREFIX } from "@src/lib/localDataCleanup";

export const IS_SUPPLEMENT_REMINDERS_SUPPORTED =
  Platform.OS === "ios" || Platform.OS === "android";

function getExpectedSupplementStoreKey(accountId) {
  return `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:${accountId}`;
}

function getSupplementSnapshot() {
  const { supplements, takenTimesByDate } = useSupplementsStore.getState();

  return {
    storeKey: useSupplementsStore.persist.getOptions().name,
    hydrated: useSupplementsStore.persist.hasHydrated(),
    supplements,
    takenTimesByDate,
  };
}

const controller = createSupplementReminderController({
  notifications: Notifications,
  storage: AsyncStorage,
  platformOS: Platform.OS,
  getSupplementSnapshot,
  getExpectedSupplementStoreKey,
  isAppActive: () => AppState.currentState === "active",
});

const UNSUPPORTED_STATE = controller.getState();

function isReminderNotification(notification) {
  return (
    notification?.request?.content?.data?.type === REMINDER_NOTIFICATION_TYPE
  );
}

// A reminder can fire in the moment between "taken" being tapped and the
// queue being updated, so foreground reminders are re-checked before display.
function shouldPresentReminder(notification) {
  const data = notification?.request?.content?.data ?? {};
  const { accountId } = controller.getState();
  if (!accountId || data.accountId !== accountId) return false;

  const snapshot = getSupplementSnapshot();
  if (
    !snapshot.hydrated ||
    snapshot.storeKey !== getExpectedSupplementStoreKey(accountId)
  ) {
    return true;
  }

  const takenOnDate = snapshot.takenTimesByDate?.[data.dateKey] ?? {};
  const supplementIds = Array.isArray(data.supplementIds)
    ? data.supplementIds
    : [];
  return !supplementIds.every((id) => takenOnDate[id]);
}

if (IS_SUPPLEMENT_REMINDERS_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const shouldShow = isReminderNotification(notification)
        ? shouldPresentReminder(notification)
        : true;

      return {
        shouldShowBanner: shouldShow,
        shouldShowList: shouldShow,
        shouldPlaySound: shouldShow,
        shouldSetBadge: false,
      };
    },
  });
}

/* ----------------------------------------
   Notification taps
----------------------------------------- */
let hasPendingTrackerOpen = false;
let lastHandledResponseKey = null;
const trackerOpenListeners = new Set();

function notifyTrackerOpenListeners() {
  trackerOpenListeners.forEach((listener) => {
    try {
      listener(hasPendingTrackerOpen);
    } catch (error) {
      console.error("Failed to notify reminder tap listener", error);
    }
  });
}

function handleNotificationResponse(response) {
  const notification = response?.notification;
  if (!isReminderNotification(notification)) return;
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return;
  }

  // Cold starts can report the same tap via both the listener and
  // getLastNotificationResponseAsync.
  const responseKey = `${notification.request.identifier}:${notification.date}`;
  if (responseKey === lastHandledResponseKey) return;
  lastHandledResponseKey = responseKey;

  hasPendingTrackerOpen = true;
  notifyTrackerOpenListeners();
  Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
}

export function hasPendingSupplementTrackerOpen() {
  return hasPendingTrackerOpen;
}

export function consumeSupplementTrackerOpen() {
  if (!hasPendingTrackerOpen) return false;
  hasPendingTrackerOpen = false;
  notifyTrackerOpenListeners();
  return true;
}

export function subscribeSupplementTrackerOpen(listener) {
  trackerOpenListeners.add(listener);
  return () => {
    trackerOpenListeners.delete(listener);
  };
}

export function getTodayDateKey() {
  return toLocalDateKey(new Date());
}

/* ----------------------------------------
   Lifecycle
----------------------------------------- */
let initialized = false;

export function initializeSupplementReminders() {
  if (!IS_SUPPLEMENT_REMINDERS_SUPPORTED || initialized) return;
  initialized = true;

  controller.refreshPermission();

  // Foregrounding re-reads the permission (it may have changed in system
  // settings) and replans, which also rolls the queue forward and re-anchors
  // reminders to local time after a time-zone or daylight-saving change.
  AppState.addEventListener("change", (nextAppState) => {
    if (nextAppState === "active") {
      controller.refreshPermission();
    }
  });

  useSupplementsStore.subscribe((nextState, previousState) => {
    if (
      nextState.supplements !== previousState.supplements ||
      nextState.takenTimesByDate !== previousState.takenTimesByDate
    ) {
      controller.requestSync();
    }
  });
  useSupplementsStore.persist.onFinishHydration(() => {
    controller.requestSync();
  });

  Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse
  );
  Notifications.getLastNotificationResponseAsync()
    .then(handleNotificationResponse)
    .catch(() => undefined);
}

export function setSupplementReminderAccount(accountId) {
  if (!IS_SUPPLEMENT_REMINDERS_SUPPORTED) return;
  controller.setAccount(accountId);
}

export function setSupplementRemindersEnabled(enabled) {
  if (!IS_SUPPLEMENT_REMINDERS_SUPPORTED) return Promise.resolve(null);
  return controller.setEnabled(enabled);
}

export function requestSupplementReminderPermission() {
  if (!IS_SUPPLEMENT_REMINDERS_SUPPORTED) return Promise.resolve(null);
  return controller.requestPermission();
}

export function refreshSupplementReminderPermission() {
  if (!IS_SUPPLEMENT_REMINDERS_SUPPORTED) return Promise.resolve(null);
  return controller.refreshPermission();
}

export function maybePromptForSupplementReminderPermission() {
  if (!IS_SUPPLEMENT_REMINDERS_SUPPORTED) return Promise.resolve(false);
  return controller.maybePromptForPermission();
}

function getUnsupportedState() {
  return UNSUPPORTED_STATE;
}

function subscribeNoop() {
  return () => {};
}

export function useSupplementReminderState() {
  return useSyncExternalStore(
    IS_SUPPLEMENT_REMINDERS_SUPPORTED ? controller.subscribe : subscribeNoop,
    IS_SUPPLEMENT_REMINDERS_SUPPORTED ? controller.getState : getUnsupportedState
  );
}
