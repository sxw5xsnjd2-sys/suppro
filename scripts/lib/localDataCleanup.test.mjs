import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadLocalDataCleanupModule() {
  const source = readFileSync(
    new URL("../../src/lib/localDataCleanup.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  AI_SUMMARY_CACHE_STORAGE_KEY,
  CHAT_STORAGE_KEY,
  GUEST_SEARCH_HISTORY_STORAGE_KEY,
  GUEST_SUPPLEMENT_STORE_STORAGE_KEY,
  HEART_FLAGS_STORAGE_KEY,
  HEALTH_STORAGE_KEY,
  RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
  SEARCH_HISTORY_STORAGE_KEY_PREFIX,
  getAccountScopedSupplementStoreStorageKeys,
  getAccountSearchHistoryStorageKey,
  getDeleteAccountCleanupStorageKeys,
  getLegacySupplementStoreStorageKeys,
  SUPPLEMENTS_STORAGE_KEY_PREFIX,
  getSignOutCleanupStorageKeys,
  getSupplementStoreStorageKeys,
};`
  );

  return factory();
}

const {
  AI_SUMMARY_CACHE_STORAGE_KEY,
  CHAT_STORAGE_KEY,
  GUEST_SEARCH_HISTORY_STORAGE_KEY,
  GUEST_SUPPLEMENT_STORE_STORAGE_KEY,
  HEART_FLAGS_STORAGE_KEY,
  HEALTH_STORAGE_KEY,
  RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
  SEARCH_HISTORY_STORAGE_KEY_PREFIX,
  getAccountScopedSupplementStoreStorageKeys,
  getAccountSearchHistoryStorageKey,
  getDeleteAccountCleanupStorageKeys,
  getLegacySupplementStoreStorageKeys,
  SUPPLEMENTS_STORAGE_KEY_PREFIX,
  getSignOutCleanupStorageKeys,
  getSupplementStoreStorageKeys,
} = loadLocalDataCleanupModule();

test("collects all supplement store keys for guest and account scopes", () => {
  assert.deepEqual(
    getSupplementStoreStorageKeys([
      "unrelated",
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:guest`,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
    ]),
    [
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:guest`,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
    ]
  );
});

test("collects only account-scoped supplement store keys", () => {
  assert.deepEqual(
    getAccountScopedSupplementStoreStorageKeys([
      "unrelated",
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      GUEST_SUPPLEMENT_STORE_STORAGE_KEY,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-b`,
    ]),
    [
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-b`,
    ]
  );
});

test("collects only legacy supplement store keys", () => {
  assert.deepEqual(
    getLegacySupplementStoreStorageKeys([
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      GUEST_SUPPLEMENT_STORE_STORAGE_KEY,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
    ]),
    [SUPPLEMENTS_STORAGE_KEY_PREFIX]
  );
});

test("normal sign-out removes scoped history but preserves account supplement stores", () => {
  const onboardingKeys = [
    "suppro.onboarding.questionnaire.v1",
    "suppro.onboarding.signupCompleted.v1",
  ];

  const cleanupKeys = getSignOutCleanupStorageKeys({
    storageKeys: [
      "suppro-client-id",
      "recent-something-public",
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:guest`,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
    ],
    onboardingStorageKeys: onboardingKeys,
    accountScopedUserId: "user-a",
  });

  assert.deepEqual(cleanupKeys, [
    ...onboardingKeys,
    SUPPLEMENTS_STORAGE_KEY_PREFIX,
    HEALTH_STORAGE_KEY,
    CHAT_STORAGE_KEY,
    HEART_FLAGS_STORAGE_KEY,
    AI_SUMMARY_CACHE_STORAGE_KEY,
    RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
    GUEST_SEARCH_HISTORY_STORAGE_KEY,
    getAccountSearchHistoryStorageKey("user-a"),
  ]);
});

test("deduplicates keys when fixed and dynamic sets overlap", () => {
  const cleanupKeys = getSignOutCleanupStorageKeys({
    storageKeys: [
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      HEALTH_STORAGE_KEY,
    ],
    onboardingStorageKeys: [HEALTH_STORAGE_KEY],
  });

  assert.deepEqual(cleanupKeys, [
    HEALTH_STORAGE_KEY,
    SUPPLEMENTS_STORAGE_KEY_PREFIX,
    CHAT_STORAGE_KEY,
    HEART_FLAGS_STORAGE_KEY,
    AI_SUMMARY_CACHE_STORAGE_KEY,
    RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
    GUEST_SEARCH_HISTORY_STORAGE_KEY,
  ]);
});

test("can preserve the returning-user login gate marker on sign out", () => {
  const cleanupKeys = getSignOutCleanupStorageKeys({
    storageKeys: [
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
    ],
    onboardingStorageKeys: [
      "suppro.onboarding.questionnaire.v1",
      "suppro.onboarding.signupCompleted.v1",
    ],
    excludeStorageKeys: ["suppro.onboarding.signupCompleted.v1"],
  });

  assert.deepEqual(cleanupKeys, [
    "suppro.onboarding.questionnaire.v1",
    SUPPLEMENTS_STORAGE_KEY_PREFIX,
    HEALTH_STORAGE_KEY,
    CHAT_STORAGE_KEY,
    HEART_FLAGS_STORAGE_KEY,
    AI_SUMMARY_CACHE_STORAGE_KEY,
    RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
    GUEST_SEARCH_HISTORY_STORAGE_KEY,
  ]);
});

test("delete-account cleanup removes the deleted user's account-scoped supplement key", () => {
  const cleanupKeys = getDeleteAccountCleanupStorageKeys({
    storageKeys: [
      SUPPLEMENTS_STORAGE_KEY_PREFIX,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:guest`,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
      `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-b`,
    ],
    onboardingStorageKeys: ["suppro.onboarding.questionnaire.v1"],
    accountScopedUserId: "user-a",
  });

  assert.deepEqual(cleanupKeys, [
    "suppro.onboarding.questionnaire.v1",
    SUPPLEMENTS_STORAGE_KEY_PREFIX,
    `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:account:user-a`,
    HEALTH_STORAGE_KEY,
    CHAT_STORAGE_KEY,
    HEART_FLAGS_STORAGE_KEY,
    AI_SUMMARY_CACHE_STORAGE_KEY,
    RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
    GUEST_SEARCH_HISTORY_STORAGE_KEY,
    `${SEARCH_HISTORY_STORAGE_KEY_PREFIX}:account:user-a`,
  ]);
});
