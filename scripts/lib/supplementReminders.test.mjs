import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Pin a zone with daylight saving so DST behaviour is deterministic.
process.env.TZ = "Europe/London";

function loadModule(relativePath, dependencies, exportNames) {
  const source = readFileSync(
    new URL(`../../${relativePath}`, import.meta.url),
    "utf8"
  );
  const transformed = source
    .replace(/^import[\s\S]*?from\s+"[^"]+";\n/gm, "")
    .replace(/^export (const|function|async function) /gm, "$1 ");
  const names = Object.keys(dependencies);
  const factory = new Function(
    ...names,
    `${transformed}\nreturn { ${exportNames.join(", ")} };`
  );
  return factory(...names.map((name) => dependencies[name]));
}

const { isSupplementScheduledOnDate } = loadModule(
  "features/supplements/schedule.js",
  {},
  ["isSupplementScheduledOnDate"]
);
const plan = loadModule(
  "features/reminders/reminderPlan.js",
  { isSupplementScheduledOnDate },
  [
    "buildReminderPlan",
    "resolveReminderTimeMinutes",
    "MAX_SCHEDULED_REMINDERS",
    "REMINDER_ID_PREFIX",
    "REMINDER_NOTIFICATION_TYPE",
    "REMINDER_QUEUE_END_SUFFIX",
  ]
);
const scheduler = loadModule(
  "features/reminders/reminderScheduler.js",
  {
    REMINDER_ID_PREFIX: plan.REMINDER_ID_PREFIX,
    REMINDER_NOTIFICATION_TYPE: plan.REMINDER_NOTIFICATION_TYPE,
  },
  [
    "applyReminderPlan",
    "cancelAllSupplementReminders",
    "LEGACY_SUPPLEMENT_REMINDER_CHANNEL_IDS",
    "SUPPLEMENT_REMINDER_CHANNEL_ID",
    "SUPPLEMENT_REMINDER_SOUND",
  ]
);
const { createSupplementReminderController, getReminderPreferenceStorageKey } =
  loadModule(
    "features/reminders/reminderController.js",
    {
      buildReminderPlan: plan.buildReminderPlan,
      applyReminderPlan: scheduler.applyReminderPlan,
      cancelAllSupplementReminders: scheduler.cancelAllSupplementReminders,
      LEGACY_SUPPLEMENT_REMINDER_CHANNEL_IDS:
        scheduler.LEGACY_SUPPLEMENT_REMINDER_CHANNEL_IDS,
      SUPPLEMENT_REMINDER_CHANNEL_ID: scheduler.SUPPLEMENT_REMINDER_CHANNEL_ID,
      SUPPLEMENT_REMINDER_SOUND: scheduler.SUPPLEMENT_REMINDER_SOUND,
    },
    [
      "createSupplementReminderController",
      "getReminderPreferenceStorageKey",
      "REMINDER_PERMISSION_PROMPTED_STORAGE_KEY",
    ]
  );

const { buildReminderPlan } = plan;

function supplement(overrides = {}) {
  return {
    id: "vit-d",
    name: "Vitamin D",
    time: "08:00",
    timeMinutes: 480,
    frequency: "daily",
    frequencyLabel: "Daily",
    scheduleType: "weekly",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startDate: "2026-01-01",
    endDate: null,
    ...overrides,
  };
}

function localDate(dateKey, hours = 0, minutes = 0) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function createFakeNotifications() {
  const fake = {
    scheduled: new Map(),
    presented: new Set(),
    scheduleCalls: 0,
    replacedOnSchedule: 0,
    permissionRequests: 0,
    channelCalls: 0,
    channels: new Map(),
    permission: { status: "granted", canAskAgain: true },
    requestResult: { status: "granted", canAskAgain: true },
    SchedulableTriggerInputTypes: { DATE: "date" },
    AndroidImportance: { NONE: 2, DEFAULT: 5, HIGH: 6 },
    async getAllScheduledNotificationsAsync() {
      return Array.from(fake.scheduled.values()).map((request) =>
        structuredClone(request)
      );
    },
    async scheduleNotificationAsync(request) {
      fake.scheduleCalls += 1;
      if (fake.scheduled.has(request.identifier)) fake.replacedOnSchedule += 1;
      fake.scheduled.set(request.identifier, structuredClone(request));
      return request.identifier;
    },
    async cancelScheduledNotificationAsync(identifier) {
      fake.scheduled.delete(identifier);
    },
    async getPresentedNotificationsAsync() {
      return Array.from(fake.presented).map((identifier) => ({
        request: { identifier },
      }));
    },
    async dismissNotificationAsync(identifier) {
      fake.presented.delete(identifier);
    },
    async getPermissionsAsync() {
      return { ...fake.permission };
    },
    async requestPermissionsAsync() {
      fake.permissionRequests += 1;
      fake.permission = { ...fake.requestResult };
      return { ...fake.permission };
    },
    async getNotificationChannelAsync(channelId) {
      const channel = fake.channels.get(channelId);
      return channel ? { ...channel } : null;
    },
    async setNotificationChannelAsync(channelId, channel) {
      fake.channelCalls += 1;
      fake.channels.set(channelId, { id: channelId, ...channel });
    },
    async deleteNotificationChannelAsync(channelId) {
      fake.channels.delete(channelId);
    },
  };
  return fake;
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

const storeKeyFor = (accountId) => `supplement-store:account:${accountId}`;

function createHarness({
  notifications = createFakeNotifications(),
  storage = createMemoryStorage(),
  stores = {},
  platformOS = "ios",
  now = localDate("2026-10-20", 6, 0),
} = {}) {
  const snapshot = {
    storeKey: "supplement-store:guest",
    hydrated: true,
    supplements: [],
    takenTimesByDate: {},
  };
  const controller = createSupplementReminderController({
    notifications,
    storage,
    platformOS,
    getSupplementSnapshot: () => snapshot,
    getExpectedSupplementStoreKey: storeKeyFor,
    now: () => now,
    logger: { warn() {}, error() {} },
  });

  // Mirrors syncSupplementsStoreAccountScope + rehydrate for an account.
  function loadStore(accountId) {
    const data = stores[accountId] ?? { supplements: [], takenTimesByDate: {} };
    snapshot.storeKey = accountId ? storeKeyFor(accountId) : "supplement-store:guest";
    snapshot.supplements = data.supplements;
    snapshot.takenTimesByDate = data.takenTimesByDate ?? {};
    snapshot.hydrated = true;
  }

  async function signIn(accountId) {
    loadStore(accountId);
    controller.setAccount(accountId);
    await settle(controller);
  }

  return { controller, notifications, storage, snapshot, loadStore, signIn };
}

async function settle(controller) {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await controller.requestSync();
  }
}

// Short test windows end before the schedule does, which adds the queue-end
// suffix to the final reminder; most assertions only care about the dose text.
function doseText(body) {
  return body.replace(` ${plan.REMINDER_QUEUE_END_SUFFIX}`, "");
}

function scheduledBodies(notifications) {
  return Array.from(notifications.scheduled.values()).map((request) =>
    doseText(request.content.body)
  );
}

/* ----------------------------------------
   Planning
----------------------------------------- */

test("groups supplements due at the same time and skips ones already taken", () => {
  const result = buildReminderPlan({
    supplements: [
      supplement(),
      supplement({ id: "mag", name: "Magnesium" }),
      supplement({ id: "zinc", name: "Zinc", time: "20:00", timeMinutes: 1200 }),
    ],
    takenTimesByDate: { "2026-10-20": { mag: "07:55" } },
    now: localDate("2026-10-20", 6, 0),
    horizonDays: 2,
  });

  assert.deepEqual(
    result.reminders.map((reminder) => [
      reminder.identifier,
      doseText(reminder.body),
    ]),
    [
      ["suppro-supplement-reminder:2026-10-20T0800", "Time to take Vitamin D."],
      ["suppro-supplement-reminder:2026-10-20T2000", "Time to take Zinc."],
      [
        "suppro-supplement-reminder:2026-10-21T0800",
        "Time to take Vitamin D and Magnesium.",
      ],
      ["suppro-supplement-reminder:2026-10-21T2000", "Time to take Zinc."],
    ]
  );
  assert.deepEqual(result.reminders[2].supplementIds, ["vit-d", "mag"]);
});

test("respects selected weekdays, start and end dates", () => {
  const result = buildReminderPlan({
    supplements: [
      // Mondays and Thursdays only.
      supplement({ frequency: "twice_weekly", daysOfWeek: [1, 4] }),
      supplement({
        id: "iron",
        name: "Iron",
        startDate: "2026-10-22",
        endDate: "2026-10-23",
      }),
    ],
    now: localDate("2026-10-19", 6, 0), // Monday
    horizonDays: 7,
  });

  assert.deepEqual(
    result.reminders.map(
      (reminder) => `${reminder.dateKey} ${doseText(reminder.body)}`
    ),
    [
      "2026-10-19 Time to take Vitamin D.",
      "2026-10-22 Time to take Vitamin D and Iron.",
      "2026-10-23 Time to take Iron.",
    ]
  );
});

test("every-other-day schedules follow the saved anchor date", () => {
  const result = buildReminderPlan({
    supplements: [
      supplement({
        frequency: "every_other_day",
        frequencyLabel: "Every other day",
        scheduleType: "interval",
        intervalDays: 2,
        daysOfWeek: [],
        scheduleAnchorDate: "2026-10-19",
      }),
    ],
    now: localDate("2026-10-20", 6, 0),
    horizonDays: 6,
  });

  assert.deepEqual(
    result.reminders.map((reminder) => reminder.dateKey),
    ["2026-10-21", "2026-10-23", "2026-10-25"]
  );
});

test("never schedules a reminder whose time has already passed", () => {
  const supplements = [
    supplement(),
    supplement({ id: "zinc", name: "Zinc", time: "20:00", timeMinutes: 1200 }),
  ];
  const now = localDate("2026-10-20", 12, 0);

  // Undoing "taken" after the dose time must not produce an overdue reminder.
  const afterUndo = buildReminderPlan({
    supplements,
    takenTimesByDate: { "2026-10-20": {} },
    now,
    horizonDays: 1,
  });
  assert.deepEqual(
    afterUndo.reminders.map((reminder) => doseText(reminder.body)),
    ["Time to take Zinc."]
  );

  // Undoing before the dose time restores that day's reminder.
  const takenThenUndone = buildReminderPlan({
    supplements,
    takenTimesByDate: { "2026-10-20": {} },
    now: localDate("2026-10-20", 7, 0),
    horizonDays: 1,
  });
  assert.equal(takenThenUndone.reminders.length, 2);
});

test("uses only the saved time and never invents doses from frequency labels", () => {
  assert.equal(plan.resolveReminderTimeMinutes(supplement()), 480);
  assert.equal(
    plan.resolveReminderTimeMinutes({ time: "00:00", timeMinutes: 0 }),
    0
  );
  // Legacy rows whose time could not be parsed were migrated to timeMinutes 0.
  assert.equal(
    plan.resolveReminderTimeMinutes({ time: "8 in the morning", timeMinutes: 0 }),
    null
  );
  assert.equal(plan.resolveReminderTimeMinutes({}), null);

  const result = buildReminderPlan({
    supplements: [
      supplement({ frequency: "2", frequencyLabel: "2 times / day" }),
      supplement({ id: "no-time", name: "No time", time: "", timeMinutes: 0 }),
    ],
    now: localDate("2026-10-20", 6, 0),
    horizonDays: 3,
  });
  assert.deepEqual(
    result.reminders.map((reminder) => reminder.identifier),
    [
      "suppro-supplement-reminder:2026-10-20T0800",
      "suppro-supplement-reminder:2026-10-21T0800",
      "suppro-supplement-reminder:2026-10-22T0800",
    ]
  );
});

test("keeps local dose times across a daylight-saving change", () => {
  // UK clocks go back at 02:00 on 25 October 2026.
  const result = buildReminderPlan({
    supplements: [supplement()],
    now: localDate("2026-10-24", 6, 0),
    horizonDays: 3,
  });

  assert.deepEqual(
    result.reminders.map((reminder) => {
      const fireDate = new Date(reminder.fireAt);
      return `${reminder.dateKey} ${fireDate.getHours()}:${fireDate.getMinutes()}`;
    }),
    ["2026-10-24 8:0", "2026-10-25 8:0", "2026-10-26 8:0"]
  );
  // 24 Oct 08:00 BST to 25 Oct 08:00 GMT is 25 real hours.
  assert.equal(
    result.reminders[1].fireAt - result.reminders[0].fireAt,
    25 * 60 * 60 * 1000
  );
});

test("caps the queue below the iOS limit and flags where it ends", () => {
  const supplements = [6, 9, 12, 15, 18, 21].map((hour) =>
    supplement({
      id: `s${hour}`,
      name: `Supplement ${hour}`,
      time: `${String(hour).padStart(2, "0")}:00`,
      timeMinutes: hour * 60,
    })
  );
  const result = buildReminderPlan({
    supplements,
    now: localDate("2026-10-20", 5, 0),
  });

  assert.equal(result.reminders.length, plan.MAX_SCHEDULED_REMINDERS);
  assert.equal(result.isComplete, false);
  const last = result.reminders.at(-1);
  assert.equal(last.isQueueEnd, true);
  assert.ok(last.body.endsWith(plan.REMINDER_QUEUE_END_SUFFIX));
  assert.equal(result.reminders.filter((reminder) => reminder.isQueueEnd).length, 1);
});

test("a schedule that ends inside the window is fully covered", () => {
  const result = buildReminderPlan({
    supplements: [supplement({ endDate: "2026-10-25" })],
    now: localDate("2026-10-20", 6, 0),
  });

  assert.equal(result.reminders.length, 6);
  assert.equal(result.isComplete, true);
  assert.ok(result.reminders.every((reminder) => !reminder.isQueueEnd));
});

test("an open-ended daily schedule is covered for the 28-day window", () => {
  const result = buildReminderPlan({
    supplements: [supplement()],
    now: localDate("2026-10-20", 6, 0),
  });

  assert.equal(result.reminders.length, 28);
  assert.equal(result.isComplete, false);
  assert.equal(result.reminders.at(-1).dateKey, "2026-11-16");
});

/* ----------------------------------------
   Scheduling against the OS queue
----------------------------------------- */

test("re-applying the same plan does not duplicate or reschedule reminders", async () => {
  const notifications = createFakeNotifications();
  const { reminders } = buildReminderPlan({
    supplements: [supplement()],
    now: localDate("2026-10-20", 6, 0),
    horizonDays: 3,
  });

  await scheduler.applyReminderPlan({ notifications, reminders, accountId: "a" });
  const second = await scheduler.applyReminderPlan({
    notifications,
    reminders,
    accountId: "a",
  });

  assert.equal(notifications.scheduled.size, 3);
  assert.equal(notifications.scheduleCalls, 3);
  assert.deepEqual(second, { cancelled: 0, scheduled: 0 });
  const request = notifications.scheduled.get(reminders[0].identifier);
  assert.equal(request.trigger.type, "date");
  assert.equal(request.trigger.channelId, "supplement-reminders-v2");
  assert.equal(request.content.sound, "suppro_reminder.wav");
  assert.equal(request.content.data.type, "supplement-reminder");
});

test("marking taken cancels only that date's reminder and updates shared slots", async () => {
  const notifications = createFakeNotifications();
  const supplements = [supplement(), supplement({ id: "mag", name: "Magnesium" })];
  const now = localDate("2026-10-20", 6, 0);

  const before = buildReminderPlan({ supplements, now, horizonDays: 2 });
  await scheduler.applyReminderPlan({
    notifications,
    reminders: before.reminders,
    accountId: "a",
  });

  const partlyTaken = buildReminderPlan({
    supplements,
    takenTimesByDate: { "2026-10-20": { "vit-d": "06:30" } },
    now,
    horizonDays: 2,
  });
  await scheduler.applyReminderPlan({
    notifications,
    reminders: partlyTaken.reminders,
    accountId: "a",
  });
  assert.deepEqual(scheduledBodies(notifications), [
    "Time to take Vitamin D and Magnesium.",
    "Time to take Magnesium.",
  ]);

  const allTaken = buildReminderPlan({
    supplements,
    takenTimesByDate: { "2026-10-20": { "vit-d": "06:30", mag: "06:31" } },
    now,
    horizonDays: 2,
  });
  await scheduler.applyReminderPlan({
    notifications,
    reminders: allTaken.reminders,
    accountId: "a",
  });
  assert.deepEqual(Array.from(notifications.scheduled.keys()), [
    "suppro-supplement-reminder:2026-10-21T0800",
  ]);
  assert.equal(notifications.replacedOnSchedule, 0);
});

test("cancelling reminders leaves unrelated notifications alone", async () => {
  const notifications = createFakeNotifications();
  notifications.scheduled.set("other", { identifier: "other", content: {} });
  notifications.presented.add("other");
  notifications.presented.add("suppro-supplement-reminder:2026-10-20T0800");
  const { reminders } = buildReminderPlan({
    supplements: [supplement()],
    now: localDate("2026-10-20", 6, 0),
    horizonDays: 2,
  });
  await scheduler.applyReminderPlan({ notifications, reminders, accountId: "a" });

  await scheduler.cancelAllSupplementReminders({
    notifications,
    dismissPresented: true,
  });

  assert.deepEqual(Array.from(notifications.scheduled.keys()), ["other"]);
  assert.deepEqual(Array.from(notifications.presented), ["other"]);
});

/* ----------------------------------------
   Controller: preferences, accounts, permission
----------------------------------------- */

test("reminders default to on and wait for the account's store to load", async () => {
  const harness = createHarness({
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();

  // Store still holds the guest scope: nothing may be planned from it.
  harness.snapshot.supplements = [supplement({ id: "guest", name: "Guest pill" })];
  harness.controller.setAccount("a");
  await settle(harness.controller);
  assert.equal(harness.notifications.scheduled.size, 0);
  assert.equal(harness.controller.getState().enabled, true);

  harness.loadStore("a");
  await settle(harness.controller);
  assert.equal(harness.notifications.scheduled.size, 28);
  assert.ok(
    scheduledBodies(harness.notifications).every((body) =>
      body.startsWith("Time to take Vitamin D.")
    )
  );
});

test("switching reminders off cancels pending reminders and persists the choice", async () => {
  const harness = createHarness({
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");
  assert.ok(harness.notifications.scheduled.size > 0);

  await harness.controller.setEnabled(false);
  await settle(harness.controller);

  assert.equal(harness.notifications.scheduled.size, 0);
  assert.equal(
    harness.storage.values.get(getReminderPreferenceStorageKey("a")),
    "false"
  );

  // A fresh launch keeps the explicit OFF choice.
  const relaunch = createHarness({
    notifications: harness.notifications,
    storage: harness.storage,
    stores: { a: { supplements: [supplement()] } },
  });
  await relaunch.controller.refreshPermission();
  await relaunch.signIn("a");
  assert.equal(relaunch.controller.getState().enabled, false);
  assert.equal(relaunch.notifications.scheduled.size, 0);
});

test("account changes cancel the previous account's reminders and apply the new account's preference", async () => {
  const stores = {
    a: { supplements: [supplement()] },
    b: { supplements: [supplement({ id: "fish", name: "Fish oil" })] },
    c: { supplements: [supplement({ id: "zinc", name: "Zinc" })] },
  };
  const storage = createMemoryStorage({
    [getReminderPreferenceStorageKey("c")]: "false",
  });
  const harness = createHarness({ stores, storage });
  await harness.controller.refreshPermission();

  await harness.signIn("a");
  harness.notifications.presented.add(
    "suppro-supplement-reminder:2026-10-20T0800"
  );

  await harness.signIn("b");
  const bodies = scheduledBodies(harness.notifications);
  assert.equal(bodies.length, 28);
  assert.ok(bodies.every((body) => body.includes("Fish oil")));
  assert.ok(
    Array.from(harness.notifications.scheduled.values()).every(
      (request) => request.content.data.accountId === "b"
    )
  );
  assert.equal(harness.notifications.presented.size, 0);

  // Account C switched reminders off on this device earlier.
  await harness.signIn("c");
  assert.equal(harness.controller.getState().enabled, false);
  assert.equal(harness.notifications.scheduled.size, 0);
});

test("signing out cancels all reminders", async () => {
  const harness = createHarness({
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");
  assert.ok(harness.notifications.scheduled.size > 0);

  harness.loadStore(null);
  harness.controller.setAccount(null);
  await settle(harness.controller);

  assert.equal(harness.notifications.scheduled.size, 0);
});

test("concurrent sync requests never queue the same reminder twice", async () => {
  const harness = createHarness({
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");
  const callsAfterInitialSync = harness.notifications.scheduleCalls;

  harness.snapshot.takenTimesByDate = { "2026-10-20": { "vit-d": "06:10" } };
  await Promise.all(
    Array.from({ length: 5 }, () => harness.controller.requestSync())
  );
  await settle(harness.controller);

  assert.equal(harness.notifications.scheduled.size, 27);
  assert.equal(harness.notifications.scheduleCalls, callsAfterInitialSync);
  assert.equal(harness.notifications.replacedOnSchedule, 0);
});

test("prompts for permission once, then schedules after it is granted", async () => {
  const notifications = createFakeNotifications();
  notifications.permission = { status: "undetermined", canAskAgain: true };
  const harness = createHarness({
    notifications,
    platformOS: "android",
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");
  assert.equal(notifications.scheduled.size, 0);

  assert.equal(await harness.controller.maybePromptForPermission(), true);
  await settle(harness.controller);
  assert.equal(notifications.permissionRequests, 1);
  // Android 13+ needs a channel before the permission dialog can appear.
  assert.ok(notifications.channelCalls >= 1);
  assert.equal(notifications.scheduled.size, 28);

  assert.equal(await harness.controller.maybePromptForPermission(), false);
  assert.equal(notifications.permissionRequests, 1);
});

test("a denied or dismissed prompt is not shown again", async () => {
  const notifications = createFakeNotifications();
  notifications.permission = { status: "undetermined", canAskAgain: true };
  // Android reports a dismissed dialog as still askable.
  notifications.requestResult = { status: "undetermined", canAskAgain: true };
  const harness = createHarness({
    notifications,
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");

  await harness.controller.maybePromptForPermission();
  await harness.controller.maybePromptForPermission();
  await harness.signIn("b");
  await harness.controller.maybePromptForPermission();

  assert.equal(notifications.permissionRequests, 1);
  assert.equal(notifications.scheduled.size, 0);
});

test("no prompt when reminders are off or permission is already settled", async () => {
  const offNotifications = createFakeNotifications();
  offNotifications.permission = { status: "undetermined", canAskAgain: true };
  const off = createHarness({
    notifications: offNotifications,
    storage: createMemoryStorage({
      [getReminderPreferenceStorageKey("a")]: "false",
    }),
  });
  await off.signIn("a");
  assert.equal(await off.controller.maybePromptForPermission(), false);
  assert.equal(offNotifications.permissionRequests, 0);

  // Android 12 and below grant notifications at install time.
  const legacyAndroid = createFakeNotifications();
  legacyAndroid.permission = { status: "granted", canAskAgain: true };
  const granted = createHarness({
    notifications: legacyAndroid,
    platformOS: "android",
    stores: { a: { supplements: [supplement()] } },
  });
  await granted.signIn("a");
  assert.equal(await granted.controller.maybePromptForPermission(), false);
  await settle(granted.controller);
  assert.equal(legacyAndroid.permissionRequests, 0);
  assert.equal(legacyAndroid.scheduled.size, 28);

  const blocked = createFakeNotifications();
  blocked.permission = { status: "denied", canAskAgain: false };
  const denied = createHarness({ notifications: blocked });
  await denied.signIn("a");
  assert.equal(await denied.controller.maybePromptForPermission(), false);
  assert.equal(blocked.permissionRequests, 0);
});

test("revoking permission in system settings cancels the queue", async () => {
  const harness = createHarness({
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");
  assert.ok(harness.notifications.scheduled.size > 0);

  harness.notifications.permission = { status: "denied", canAskAgain: false };
  await harness.controller.refreshPermission();
  await settle(harness.controller);

  assert.equal(harness.notifications.scheduled.size, 0);
  assert.equal(harness.controller.getState().enabled, true);
});

/* ----------------------------------------
   Branded sound and Android channel migration
----------------------------------------- */

test("every scheduled reminder uses the bundled branded sound", async () => {
  const harness = createHarness({
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");

  const requests = Array.from(harness.notifications.scheduled.values());
  assert.equal(requests.length, 28);
  assert.ok(
    requests.every(
      (request) =>
        request.content.sound === "suppro_reminder.wav" &&
        request.trigger.channelId === "supplement-reminders-v2"
    )
  );
  // iOS has no channels.
  assert.equal(harness.notifications.channelCalls, 0);
});

test("Android creates the reminder channel with the branded sound", async () => {
  const harness = createHarness({
    platformOS: "android",
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");

  const channel = harness.notifications.channels.get("supplement-reminders-v2");
  assert.equal(channel.sound, "suppro_reminder.wav");
  assert.equal(channel.importance, 6);
  assert.equal(harness.notifications.channelCalls, 1);
});

test("Android replaces the old default-sound channel and re-queues its reminders", async () => {
  const notifications = createFakeNotifications();
  notifications.channels.set("supplement-reminders", {
    id: "supplement-reminders",
    importance: 6,
    sound: "default",
  });
  const now = localDate("2026-10-20", 6, 0);
  // Reminders queued by the previous build: default sound, old channel and
  // the old signature format.
  const { reminders } = buildReminderPlan({
    supplements: [supplement()],
    now,
  });
  reminders.forEach((reminder) => {
    notifications.scheduled.set(reminder.identifier, {
      identifier: reminder.identifier,
      content: {
        body: reminder.body,
        sound: "default",
        data: {
          signature: [reminder.fireAt, reminder.title, reminder.body, "a"].join("|"),
        },
      },
      trigger: { type: "date", channelId: "supplement-reminders" },
    });
  });

  const harness = createHarness({
    notifications,
    platformOS: "android",
    now,
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");

  assert.deepEqual(Array.from(notifications.channels.keys()), [
    "supplement-reminders-v2",
  ]);
  const requests = Array.from(notifications.scheduled.values());
  assert.equal(requests.length, 28);
  assert.ok(
    requests.every(
      (request) =>
        request.content.sound === "suppro_reminder.wav" &&
        request.trigger.channelId === "supplement-reminders-v2"
    )
  );
  assert.equal(notifications.replacedOnSchedule, 0);
});

test("Android keeps reminders silenced if the user switched the old channel off", async () => {
  const notifications = createFakeNotifications();
  notifications.channels.set("supplement-reminders", {
    id: "supplement-reminders",
    importance: 2,
  });
  const harness = createHarness({
    notifications,
    platformOS: "android",
    stores: { a: { supplements: [supplement()] } },
  });
  await harness.controller.refreshPermission();
  await harness.signIn("a");

  assert.equal(notifications.channels.has("supplement-reminders"), false);
  assert.equal(
    notifications.channels.get("supplement-reminders-v2").importance,
    2
  );
});
