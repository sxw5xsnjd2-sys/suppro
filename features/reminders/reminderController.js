import { buildReminderPlan } from "@/features/reminders/reminderPlan";
import {
  applyReminderPlan,
  cancelAllSupplementReminders,
  LEGACY_SUPPLEMENT_REMINDER_CHANNEL_IDS,
  SUPPLEMENT_REMINDER_CHANNEL_ID,
  SUPPLEMENT_REMINDER_SOUND,
} from "@/features/reminders/reminderScheduler";

export const REMINDER_PREFERENCE_STORAGE_KEY_PREFIX =
  "suppro.supplementReminders.enabled.v1";
// Device-wide: the OS permission belongs to the device, not to an account.
export const REMINDER_PERMISSION_PROMPTED_STORAGE_KEY =
  "suppro.supplementReminders.permissionPrompted.v1";

export function getReminderPreferenceStorageKey(accountId) {
  return `${REMINDER_PREFERENCE_STORAGE_KEY_PREFIX}:account:${accountId}`;
}

function normalizeAccountId(accountId) {
  return typeof accountId === "string" && accountId.trim()
    ? accountId.trim()
    : null;
}

function normalizePermission(response) {
  const status =
    response?.status === "granted" || response?.status === "denied"
      ? response.status
      : "undetermined";

  return {
    status,
    canAskAgain: response?.canAskAgain !== false,
  };
}

export function createSupplementReminderController({
  notifications,
  storage,
  platformOS,
  getSupplementSnapshot,
  getExpectedSupplementStoreKey,
  isAppActive = () => true,
  now = () => new Date(),
  logger = console,
}) {
  // accountId is undefined until the root layout has resolved who is signed in.
  let state = {
    accountId: undefined,
    enabled: true,
    hasExplicitPreference: false,
    preferenceLoaded: false,
    permission: { status: "undetermined", canAskAgain: true },
    permissionLoaded: false,
    coverage: null,
  };
  let preferencePromise = Promise.resolve();
  let operationQueue = Promise.resolve();
  let pendingSync = null;
  let channelReady = null;
  let promptInFlight = null;
  const listeners = new Set();

  function setState(patch) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        logger.error("Failed to notify reminder listener", error);
      }
    });
  }

  function enqueue(task) {
    const run = operationQueue.then(task);
    operationQueue = run.catch((error) => {
      logger.warn("Supplement reminder update failed", error);
    });
    return operationQueue;
  }

  // A channel's sound is fixed once created, so the branded sound lives on a new
  // channel and older reminder channels are deleted. If the user had switched
  // the old channel off in system settings, the new one starts off as well.
  async function createReminderChannel() {
    const legacyChannels = [];
    for (const channelId of LEGACY_SUPPLEMENT_REMINDER_CHANNEL_IDS) {
      const channel = await notifications.getNotificationChannelAsync(channelId);
      if (channel) legacyChannels.push(channel);
    }
    const wasSilencedByUser = legacyChannels.some(
      (channel) => channel.importance === notifications.AndroidImportance.NONE
    );

    await notifications.setNotificationChannelAsync(
      SUPPLEMENT_REMINDER_CHANNEL_ID,
      {
        name: "Supplement reminders",
        description: "Reminders when your tracked supplements are due.",
        importance: wasSilencedByUser
          ? notifications.AndroidImportance.NONE
          : notifications.AndroidImportance.HIGH,
        sound: SUPPLEMENT_REMINDER_SOUND,
      }
    );

    for (const channel of legacyChannels) {
      await notifications.deleteNotificationChannelAsync(channel.id);
    }
  }

  function ensureChannel() {
    if (platformOS !== "android") return Promise.resolve();

    if (!channelReady) {
      channelReady = createReminderChannel().catch((error) => {
        channelReady = null;
        throw error;
      });
    }

    return channelReady;
  }

  async function runSync() {
    const { accountId, enabled, preferenceLoaded, permission, permissionLoaded } =
      state;

    if (accountId === undefined) return;

    if (accountId === null) {
      await cancelAllSupplementReminders({ notifications });
      setState({ coverage: null });
      return;
    }

    if (!preferenceLoaded || !permissionLoaded) return;

    if (!enabled || permission.status !== "granted") {
      await cancelAllSupplementReminders({ notifications });
      setState({ coverage: null });
      return;
    }

    // Never plan from another account's (or a half-loaded) supplement store;
    // the store subscription requests another sync once hydration finishes.
    const snapshot = getSupplementSnapshot();
    if (
      !snapshot?.hydrated ||
      snapshot.storeKey !== getExpectedSupplementStoreKey(accountId)
    ) {
      return;
    }

    const plan = buildReminderPlan({
      supplements: snapshot.supplements,
      takenTimesByDate: snapshot.takenTimesByDate,
      now: now(),
    });

    await ensureChannel();
    await applyReminderPlan({
      notifications,
      reminders: plan.reminders,
      accountId,
    });
    if (state.accountId !== accountId) return;
    setState({
      coverage: {
        count: plan.reminders.length,
        isComplete: plan.isComplete,
        endsAt: plan.coverageEndsAt,
      },
    });
  }

  function requestSync() {
    if (pendingSync) return pendingSync;

    pendingSync = enqueue(async () => {
      // Cleared before running so changes made mid-sync queue one more pass.
      pendingSync = null;
      await runSync();
    });
    return pendingSync;
  }

  async function loadPreference(accountId) {
    let enabled = true;
    let hasExplicitPreference = false;

    try {
      const stored = await storage.getItem(
        getReminderPreferenceStorageKey(accountId)
      );
      hasExplicitPreference = stored === "true" || stored === "false";
      enabled = stored !== "false";
    } catch (error) {
      logger.warn("Failed to load supplement reminder preference", error);
    }

    if (state.accountId !== accountId) return;

    setState({ enabled, hasExplicitPreference, preferenceLoaded: true });
  }

  function setAccount(nextAccountId) {
    const accountId = normalizeAccountId(nextAccountId);
    if (state.accountId === accountId) return operationQueue;

    const previousAccountId = state.accountId;
    setState({
      accountId,
      enabled: true,
      hasExplicitPreference: false,
      preferenceLoaded: false,
      coverage: null,
    });

    if (previousAccountId || accountId === null) {
      // Clear the previous account's queue (and anything it left on screen)
      // before the next account's reminders are planned.
      enqueue(() =>
        cancelAllSupplementReminders({ notifications, dismissPresented: true })
      );
    }

    if (accountId) {
      preferencePromise = loadPreference(accountId);
      preferencePromise.then(requestSync);
    } else {
      preferencePromise = Promise.resolve();
    }

    return operationQueue;
  }

  async function refreshPermission() {
    try {
      const response = await notifications.getPermissionsAsync();
      setState({
        permission: normalizePermission(response),
        permissionLoaded: true,
      });
    } catch (error) {
      logger.warn("Failed to read notification permission", error);
    }

    await requestSync();
    return state.permission;
  }

  async function requestPermission() {
    try {
      // Android 13+ only shows the permission dialog once a channel exists.
      await ensureChannel();
      await storage.setItem(REMINDER_PERMISSION_PROMPTED_STORAGE_KEY, "true");
      const response = await notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      });
      setState({
        permission: normalizePermission(response),
        permissionLoaded: true,
      });
    } catch (error) {
      logger.warn("Failed to request notification permission", error);
    }

    await requestSync();
    return state.permission;
  }

  async function setEnabled(enabled) {
    const accountId = state.accountId;
    if (!accountId) return state;

    await preferencePromise;
    if (state.accountId !== accountId) return state;

    setState({
      enabled: Boolean(enabled),
      hasExplicitPreference: true,
      preferenceLoaded: true,
    });

    try {
      await storage.setItem(
        getReminderPreferenceStorageKey(accountId),
        enabled ? "true" : "false"
      );
    } catch (error) {
      logger.warn("Failed to save supplement reminder preference", error);
    }

    if (enabled && state.permission.status === "undetermined") {
      await requestPermission();
      return state;
    }

    await requestSync();
    return state;
  }

  // The one automatic prompt: shown once per device, only for a signed-in
  // account that has not switched reminders off, and only while the OS still
  // considers the permission undecided. Denied/dismissed is never re-prompted.
  async function runInitialPermissionPrompt() {
    const accountId = state.accountId;
    if (!accountId) return false;

    await preferencePromise;
    if (state.accountId !== accountId || !state.enabled) return false;

    let alreadyPrompted = false;
    try {
      alreadyPrompted =
        (await storage.getItem(REMINDER_PERMISSION_PROMPTED_STORAGE_KEY)) ===
        "true";
    } catch (error) {
      logger.warn("Failed to read reminder prompt flag", error);
      return false;
    }

    const permission = await refreshPermission();
    if (
      alreadyPrompted ||
      permission.status !== "undetermined" ||
      !permission.canAskAgain ||
      state.accountId !== accountId ||
      !isAppActive()
    ) {
      return false;
    }

    await requestPermission();
    return true;
  }

  function maybePromptForPermission() {
    if (!promptInFlight) {
      promptInFlight = runInitialPermissionPrompt()
        .catch((error) => {
          logger.warn("Failed to prompt for notification permission", error);
          return false;
        })
        .finally(() => {
          promptInFlight = null;
        });
    }

    return promptInFlight;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getState: () => state,
    subscribe,
    setAccount,
    setEnabled,
    refreshPermission,
    requestPermission,
    maybePromptForPermission,
    requestSync,
  };
}
