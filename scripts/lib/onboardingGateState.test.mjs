import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function createAsyncStorage(initialEntries = {}) {
  const data = new Map(Object.entries(initialEntries));

  return {
    async getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}

function loadOnboardingModule({
  asyncStorage,
  session,
  accountSetupCompletion = null,
}) {
  const source = readFileSync(
    new URL("../../src/lib/onboarding.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(
      /import AsyncStorage from "@react-native-async-storage\/async-storage";\n/,
      ""
    )
    .replace(/import \{ supabase \} from "\.\/supabase";\n/, "")
    .replace(
      /import \{ canEnterAuthenticatedApp, hasNonAnonymousSession \} from "\.\/authState";\n/,
      ""
    )
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")
    .replace(/export async function /g, "async function ");

  const factory = new Function(
    "AsyncStorage",
    "supabase",
    "canEnterAuthenticatedApp",
    "hasNonAnonymousSession",
    `${transformed}
return {
  ONBOARDING_RATING_COMPLETED_STORAGE_KEY,
  SIGNUP_COMPLETED_STORAGE_KEY,
  getOnboardingGateState,
  resolveLoggedOutOnboardingGateState,
  shouldRouteThroughOnboardingRatingStep,
};`
  );

  return factory(
    asyncStorage,
    {
      auth: {
        async getSession() {
          return { data: { session } };
        },
      },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: accountSetupCompletion, error: null };
                  },
                };
              },
            };
          },
        };
      },
    },
    ({ session: candidateSession, hasCompletedAccountSetup }) =>
      Boolean(
        candidateSession?.user &&
          candidateSession.user.is_anonymous !== true &&
          hasCompletedAccountSetup === true
      ),
    (candidate) => Boolean(candidate?.user && candidate.user.is_anonymous !== true)
  );
}

test("returning signed-out users resolve to login even without questionnaire data", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.signupCompleted.v1": "true",
  });

  const { getOnboardingGateState, resolveLoggedOutOnboardingGateState } =
    loadOnboardingModule({
      asyncStorage,
      session: null,
    });

  assert.equal(
    resolveLoggedOutOnboardingGateState({
      hasCompletedQuestionnaire: false,
      signupCompleted: true,
      hasCompletedOnboardingRating: false,
      hasCompletedOnboardingPremium: false,
    }),
    "needs_login"
  );

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_login");
  });
});

test("first-run with no session and no questionnaire answers stays on questions", async () => {
  const asyncStorage = createAsyncStorage();

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_questions");
  });
});

test("questionnaire-complete first-run without premium stays on paywall", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.ratingCompleted.v1": "true",
  });

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_paywall");
  });
});

test("questionnaire-complete first-run routes to rating before paywall", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
  });

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_rating");
  });
});

test("rating completion routes first-run onboarding to paywall", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.ratingCompleted.v1": "true",
  });

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_paywall");
  });
});

test("paywall-complete first-run without account stays on create-account", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.ratingCompleted.v1": "true",
    "suppro.onboarding.premiumCompleted.v1": "true",
  });

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_signup");
  });
});

test("anonymous Supabase sessions resolve as signed-out guests, not complete accounts", async () => {
  const asyncStorage = createAsyncStorage();

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: {
      user: {
        id: "anon-user",
        is_anonymous: true,
      },
    },
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_questions");
  });
});

test("real non-anonymous sessions without account completion cannot enter authenticated tabs", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.ratingCompleted.v1": "true",
    "suppro.onboarding.premiumCompleted.v1": "true",
  });

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: {
      user: {
        id: "real-user",
        is_anonymous: false,
      },
    },
    accountSetupCompletion: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_signup");
  });
});

test("returning users do not see the onboarding rating step", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.signupCompleted.v1": "true",
  });

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_login");
  });
});

test("rejected OAuth login-mode sessions remain outside authenticated tabs", async () => {
  const asyncStorage = createAsyncStorage();

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: {
      user: {
        id: "oauth-user",
        is_anonymous: false,
      },
    },
    accountSetupCompletion: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_questions");
  });
});

test("retake questionnaire does not trigger the rating step", () => {
  const { shouldRouteThroughOnboardingRatingStep } = loadOnboardingModule({
    asyncStorage: createAsyncStorage(),
    session: null,
  });

  assert.equal(
    shouldRouteThroughOnboardingRatingStep({
      mode: "retake",
      origin: null,
      signupCompleted: false,
      hasCompletedOnboardingRating: false,
    }),
    false
  );
});

test("app-origin paywall does not go through the rating step", () => {
  const { shouldRouteThroughOnboardingRatingStep } = loadOnboardingModule({
    asyncStorage: createAsyncStorage(),
    session: null,
  });

  assert.equal(
    shouldRouteThroughOnboardingRatingStep({
      mode: "first_run",
      origin: "app",
      signupCompleted: false,
      hasCompletedOnboardingRating: false,
    }),
    false
  );
});

test("real non-anonymous sessions with account completion can enter authenticated tabs", async () => {
  const asyncStorage = createAsyncStorage();

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: {
      user: {
        id: "real-user",
        is_anonymous: false,
      },
    },
    accountSetupCompletion: {
      user_id: "real-user",
      completed_at: "2026-05-06T10:00:00.000Z",
    },
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "complete");
  });
});
