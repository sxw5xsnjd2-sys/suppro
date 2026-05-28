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
  getDeleteAccountCleanupStorageKeys,
  getSignOutCleanupStorageKeys,
};`
  );

  return factory();
}

function loadAccountCleanupModule(dependencies) {
  const source = readFileSync(
    new URL("../../src/lib/account.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(
      /import AsyncStorage from "@react-native-async-storage\/async-storage";\n/,
      ""
    )
    .replace(
      /import \* as AppleAuthentication from "expo-apple-authentication";\n/,
      ""
    )
    .replace(/import \* as Crypto from "expo-crypto";\n/, "")
    .replace(/import \* as WebBrowser from "expo-web-browser";\n/, "")
    .replace(/import \{ useChatStore \} from "@\/features\/ai\/store";\n/, "")
    .replace(
      /import \{ useHealthStore \} from "@\/features\/health\/store";\n/,
      ""
    )
    .replace(
      /import \{ syncSupplementsStoreAccountScope \} from "@\/features\/supplements\/store";\n/,
      ""
    )
    .replace(
      /import \{ getRevenueCatSdk \} from "@\/features\/subscriptions\/revenueCatSdk";\n/,
      ""
    )
    .replace(
      /import \{ hasNonAnonymousSession, isAnonymousUser \} from "\.\/authState";\n/,
      ""
    )
    .replace(/import \{ supabase \} from "\.\/supabase";\n/, "")
    .replace(
      /import \{\n(?:.|\n)*?SIGNUP_PROMPTED_STORAGE_KEY,\n\} from "\.\/onboarding";\n/,
      ""
    )
    .replace(
      /import \{\n(?:.|\n)*?\} from "\.\/localDataCleanup";\n/,
      ""
    )
    .replace(
      /import \{\n(?:.|\n)*?\} from "\.\/oauthLoginState";\n/,
      ""
    )
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")
    .replace(/export async function /g, "async function ");

  const factory = new Function(
    "AsyncStorage",
    "AppleAuthentication",
    "Crypto",
    "WebBrowser",
    "useChatStore",
    "useHealthStore",
    "syncSupplementsStoreAccountScope",
    "getRevenueCatSdk",
    "hasNonAnonymousSession",
    "isAnonymousUser",
    "supabase",
    "parseHeightCm",
    "parseNumericField",
    "parseWeightKg",
    "QUESTIONNAIRE_STORAGE_KEY",
    "ONBOARDING_DRAFT_STORAGE_KEY",
    "ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY",
    "ONBOARDING_RATING_COMPLETED_STORAGE_KEY",
    "ONBOARDING_REFERRAL_SOURCE_STORAGE_KEY",
    "notifyOnboardingGateChange",
    "SIGNUP_COMPLETED_STORAGE_KEY",
    "SIGNUP_PROMPTED_STORAGE_KEY",
    "getDeleteAccountCleanupStorageKeys",
    "getSignOutCleanupStorageKeys",
    "hasCompletedSupproAccountMarker",
    "shouldAttemptAccidentalOauthUserCleanup",
    "shouldRejectLoginModeOauthUser",
    `${transformed}
return {
  clearLocalPersistedAppData,
  forceClearDeletedAccountLocalState,
  getSupabaseAuthStorageKeys,
  signOutAndClearLocalState,
};`
  );

  return factory(
    dependencies.AsyncStorage,
    { formatFullName: () => "" },
    {
      randomUUID: () => "nonce",
      digestStringAsync: async () => "digest",
      CryptoDigestAlgorithm: { SHA256: "sha256" },
    },
    { maybeCompleteAuthSession() {} },
    dependencies.useChatStore,
    dependencies.useHealthStore,
    dependencies.syncSupplementsStoreAccountScope,
    dependencies.getRevenueCatSdk,
    dependencies.hasNonAnonymousSession,
    dependencies.isAnonymousUser,
    dependencies.supabase,
    () => null,
    () => null,
    () => null,
    "suppro.onboarding.questionnaire.v1",
    "suppro.onboarding.draft.v1",
    "suppro.onboarding.premiumCompleted.v1",
    "suppro.onboarding.ratingCompleted.v1",
    "suppro.onboarding.referralSource.v1",
    dependencies.notifyOnboardingGateChange,
    "suppro.onboarding.signupCompleted.v1",
    "suppro.onboarding.signupPrompted.v1",
    dependencies.getDeleteAccountCleanupStorageKeys,
    dependencies.getSignOutCleanupStorageKeys,
    () => false,
    () => false,
    () => false
  );
}

function createAsyncStorage(keys) {
  const removedKeySets = [];

  return {
    removedKeySets,
    api: {
      async getAllKeys() {
        return [...keys];
      },
      async multiRemove(removableKeys) {
        removedKeySets.push([...removableKeys]);
      },
    },
  };
}

function createStoreResetTracker() {
  let resetCount = 0;

  return {
    store: {
      getState() {
        return {
          resetStore() {
            resetCount += 1;
          },
        };
      },
    },
    get resetCount() {
      return resetCount;
    },
  };
}

const {
  getDeleteAccountCleanupStorageKeys,
  getSignOutCleanupStorageKeys,
} = loadLocalDataCleanupModule();

function createAccountCleanupHarness({
  storageKeys,
  sessionUserId = "user-a",
  signOutImpl,
  revenueCatLogOutImpl,
} = {}) {
  const asyncStorage = createAsyncStorage(storageKeys);
  const healthTracker = createStoreResetTracker();
  const chatTracker = createStoreResetTracker();
  const supplementScopeCalls = [];
  const signOutCalls = [];
  let notifyCalls = 0;
  let revenueCatLogOutCalls = 0;

  const module = loadAccountCleanupModule({
    AsyncStorage: asyncStorage.api,
    useChatStore: chatTracker.store,
    useHealthStore: healthTracker.store,
    syncSupplementsStoreAccountScope: async (nextUser) => {
      supplementScopeCalls.push(nextUser);
    },
    getRevenueCatSdk: () => ({
      Purchases: {
        async logOut() {
          revenueCatLogOutCalls += 1;
          return revenueCatLogOutImpl ? revenueCatLogOutImpl() : null;
        },
      },
    }),
    hasNonAnonymousSession: (session) =>
      Boolean(session?.user && session.user.is_anonymous !== true),
    isAnonymousUser: (user) => Boolean(user?.is_anonymous === true),
    supabase: {
      auth: {
        async getSession() {
          return {
            data: {
              session: sessionUserId
                ? {
                    user: {
                      id: sessionUserId,
                      is_anonymous: false,
                    },
                  }
                : null,
            },
            error: null,
          };
        },
        async signOut(options) {
          signOutCalls.push(options ?? null);
          if (signOutImpl) {
            return signOutImpl(options);
          }
          return { error: null };
        },
      },
    },
    notifyOnboardingGateChange: () => {
      notifyCalls += 1;
    },
    getDeleteAccountCleanupStorageKeys,
    getSignOutCleanupStorageKeys,
  });

  return {
    asyncStorage,
    chatTracker,
    healthTracker,
    module,
    notifyCalls: () => notifyCalls,
    revenueCatLogOutCalls: () => revenueCatLogOutCalls,
    signOutCalls: () => [...signOutCalls],
    supplementScopeCalls,
  };
}

test("normal sign-out preserves account-scoped supplement data, clears global sensitive keys, and resets live stores", async () => {
  const harness = createAccountCleanupHarness({
    storageKeys: [
      "suppro.onboarding.questionnaire.v1",
      "suppro.onboarding.draft.v1",
      "suppro.onboarding.premiumCompleted.v1",
      "suppro.onboarding.ratingCompleted.v1",
      "suppro.onboarding.referralSource.v1",
      "suppro.onboarding.signupPrompted.v1",
      "suppro.onboarding.signupCompleted.v1",
      "supplement-store",
      "supplement-store:guest",
      "supplement-store:account:user-a",
      "supplement-store:account:user-b",
      "health-store",
      "suppro.chatStore.v1",
      "supplement-heart-flags",
      "suppro.stats.aiSummary.v1",
      "recent-supplement-searches",
    ],
  });

  await harness.module.signOutAndClearLocalState();

  assert.deepEqual(harness.signOutCalls(), [null]);
  assert.deepEqual(harness.asyncStorage.removedKeySets, [
    [
      "suppro.onboarding.questionnaire.v1",
      "suppro.onboarding.draft.v1",
      "suppro.onboarding.premiumCompleted.v1",
      "suppro.onboarding.ratingCompleted.v1",
      "suppro.onboarding.referralSource.v1",
      "suppro.onboarding.signupPrompted.v1",
      "supplement-store",
      "health-store",
      "suppro.chatStore.v1",
      "supplement-heart-flags",
      "suppro.stats.aiSummary.v1",
      "recent-supplement-searches",
    ],
  ]);
  assert.equal(harness.healthTracker.resetCount, 1);
  assert.equal(harness.chatTracker.resetCount, 1);
  assert.deepEqual(harness.supplementScopeCalls, [null]);
  assert.equal(harness.notifyCalls() >= 2, true);
});

test("delete-account sign-out also removes the deleted user's account-scoped supplement data", async () => {
  const harness = createAccountCleanupHarness({
    storageKeys: [
      "suppro.onboarding.questionnaire.v1",
      "suppro.onboarding.ratingCompleted.v1",
      "suppro.onboarding.signupCompleted.v1",
      "supplement-store",
      "supplement-store:guest",
      "supplement-store:account:user-a",
      "supplement-store:account:user-b",
      "health-store",
      "suppro.chatStore.v1",
      "supplement-heart-flags",
      "suppro.stats.aiSummary.v1",
      "recent-supplement-searches",
    ],
  });

  await harness.module.signOutAndClearLocalState({
    preserveLoginGate: false,
    removeAccountScopedLocalData: true,
  });

  assert.deepEqual(harness.signOutCalls(), [null]);
  assert.deepEqual(harness.asyncStorage.removedKeySets, [
    [
      "suppro.onboarding.questionnaire.v1",
      "suppro.onboarding.draft.v1",
      "suppro.onboarding.premiumCompleted.v1",
      "suppro.onboarding.ratingCompleted.v1",
      "suppro.onboarding.referralSource.v1",
      "suppro.onboarding.signupPrompted.v1",
      "suppro.onboarding.signupCompleted.v1",
      "supplement-store",
      "supplement-store:account:user-a",
      "health-store",
      "suppro.chatStore.v1",
      "supplement-heart-flags",
      "suppro.stats.aiSummary.v1",
      "recent-supplement-searches",
    ],
  ]);
  assert.equal(harness.healthTracker.resetCount, 1);
  assert.equal(harness.chatTracker.resetCount, 1);
  assert.deepEqual(harness.supplementScopeCalls, [null]);
});

test("forceClearDeletedAccountLocalState removes auth storage, resets RevenueCat, and clears deleted-user app data when sign-out fails", async () => {
  const harness = createAccountCleanupHarness({
    storageKeys: [
      "sb-test-auth-token",
      "suppro.onboarding.questionnaire.v1",
      "suppro.onboarding.ratingCompleted.v1",
      "suppro.onboarding.signupCompleted.v1",
      "supplement-store",
      "supplement-store:account:user-a",
      "supplement-store:account:user-b",
      "health-store",
      "suppro.chatStore.v1",
    ],
    signOutImpl: async () => ({
      error: { message: "network failure" },
    }),
  });

  await harness.module.forceClearDeletedAccountLocalState({
    accountScopedUserId: "user-a",
  });

  assert.deepEqual(harness.signOutCalls(), [{ scope: "local" }]);
  assert.equal(harness.revenueCatLogOutCalls(), 1);
  assert.deepEqual(harness.asyncStorage.removedKeySets, [
    ["sb-test-auth-token"],
    [
      "suppro.onboarding.questionnaire.v1",
      "suppro.onboarding.draft.v1",
      "suppro.onboarding.premiumCompleted.v1",
      "suppro.onboarding.ratingCompleted.v1",
      "suppro.onboarding.referralSource.v1",
      "suppro.onboarding.signupPrompted.v1",
      "suppro.onboarding.signupCompleted.v1",
      "supplement-store",
      "supplement-store:account:user-a",
      "health-store",
      "suppro.chatStore.v1",
      "supplement-heart-flags",
      "suppro.stats.aiSummary.v1",
      "recent-supplement-searches",
    ],
  ]);
  assert.equal(harness.healthTracker.resetCount, 1);
  assert.equal(harness.chatTracker.resetCount, 1);
  assert.deepEqual(harness.supplementScopeCalls, [null]);
});

test("getSupabaseAuthStorageKeys returns only persisted auth keys", () => {
  const harness = createAccountCleanupHarness({
    storageKeys: [],
  });

  assert.deepEqual(
    harness.module.getSupabaseAuthStorageKeys([
      "sb-test-auth-token",
      "SUPABASE.auth.token",
      "supplement-store:account:user-a",
      "",
      null,
    ]),
    ["sb-test-auth-token", "SUPABASE.auth.token"]
  );
});
