export const SUPPLEMENTS_STORAGE_KEY_PREFIX = "supplement-store";
export const HEALTH_STORAGE_KEY = "health-store";
export const CHAT_STORAGE_KEY = "suppro.chatStore.v1";
export const HEART_FLAGS_STORAGE_KEY = "supplement-heart-flags";
export const AI_SUMMARY_CACHE_STORAGE_KEY = "suppro.stats.aiSummary.v1";
export const RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY =
  "recent-supplement-searches";
export const SEARCH_HISTORY_STORAGE_KEY_PREFIX = "suppro.searchHistory.v1";
export const GUEST_SEARCH_HISTORY_STORAGE_KEY =
  `${SEARCH_HISTORY_STORAGE_KEY_PREFIX}:guest`;
export const GUEST_SUPPLEMENT_STORE_STORAGE_KEY =
  `${SUPPLEMENTS_STORAGE_KEY_PREFIX}:guest`;

function uniqueKeys(keys) {
  return Array.from(
    new Set(
      (Array.isArray(keys) ? keys : []).filter(
        (key) => typeof key === "string" && key.trim()
      )
    )
  );
}

export function getSupplementStoreStorageKeys(
  storageKeys,
  prefix = SUPPLEMENTS_STORAGE_KEY_PREFIX
) {
  return uniqueKeys(storageKeys).filter(
    (key) => key === prefix || key.startsWith(`${prefix}:`)
  );
}

export function getAccountScopedSupplementStoreStorageKeys(
  storageKeys,
  prefix = SUPPLEMENTS_STORAGE_KEY_PREFIX
) {
  return uniqueKeys(storageKeys).filter((key) =>
    key.startsWith(`${prefix}:account:`)
  );
}

export function getLegacySupplementStoreStorageKeys(
  storageKeys,
  prefix = SUPPLEMENTS_STORAGE_KEY_PREFIX
) {
  return uniqueKeys(storageKeys).filter((key) => key === prefix);
}

function buildCleanupStorageKeys({
  storageKeys,
  onboardingStorageKeys = [],
  supplementStorageKeyPrefix = SUPPLEMENTS_STORAGE_KEY_PREFIX,
  includeLegacySupplementStoreKeys = true,
  accountScopedSupplementStoreKeys = [],
  searchHistoryStorageKeys = [],
  excludeStorageKeys = [],
} = {}) {
  const excludedKeys = new Set(uniqueKeys(excludeStorageKeys));

  return uniqueKeys([
    ...onboardingStorageKeys,
    ...(includeLegacySupplementStoreKeys
      ? getLegacySupplementStoreStorageKeys(
          storageKeys,
          supplementStorageKeyPrefix
        )
      : []),
    ...uniqueKeys(accountScopedSupplementStoreKeys),
    HEALTH_STORAGE_KEY,
    CHAT_STORAGE_KEY,
    HEART_FLAGS_STORAGE_KEY,
    AI_SUMMARY_CACHE_STORAGE_KEY,
    RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
    GUEST_SEARCH_HISTORY_STORAGE_KEY,
    ...uniqueKeys(searchHistoryStorageKeys),
  ]).filter((key) => !excludedKeys.has(key));
}

export function getAccountSearchHistoryStorageKey(accountId) {
  return typeof accountId === "string" && accountId.trim()
    ? `${SEARCH_HISTORY_STORAGE_KEY_PREFIX}:account:${accountId.trim()}`
    : null;
}

export function getSignOutCleanupStorageKeys(options = {}) {
  const accountHistoryStorageKey = getAccountSearchHistoryStorageKey(
    options.accountScopedUserId,
  );
  return buildCleanupStorageKeys({
    ...options,
    searchHistoryStorageKeys: accountHistoryStorageKey
      ? [accountHistoryStorageKey]
      : [],
  });
}

export function getDeleteAccountCleanupStorageKeys({
  storageKeys,
  onboardingStorageKeys = [],
  supplementStorageKeyPrefix = SUPPLEMENTS_STORAGE_KEY_PREFIX,
  accountScopedUserId,
  excludeStorageKeys = [],
} = {}) {
  const accountScopedStorageKey =
    typeof accountScopedUserId === "string" && accountScopedUserId.trim()
      ? `${supplementStorageKeyPrefix}:account:${accountScopedUserId.trim()}`
      : null;
  const accountHistoryStorageKey =
    getAccountSearchHistoryStorageKey(accountScopedUserId);

  return buildCleanupStorageKeys({
    storageKeys,
    onboardingStorageKeys,
    supplementStorageKeyPrefix,
    accountScopedSupplementStoreKeys: accountScopedStorageKey
      ? [accountScopedStorageKey]
      : [],
    searchHistoryStorageKeys: accountHistoryStorageKey
      ? [accountHistoryStorageKey]
      : [],
    excludeStorageKeys,
  });
}
