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
  ONBOARDING_APPLE_HEALTH_COMPLETED_STORAGE_KEY,
  ONBOARDING_RATING_COMPLETED_STORAGE_KEY,
  ONBOARDING_REFERRAL_SOURCE_STORAGE_KEY,
  SIGNUP_COMPLETED_STORAGE_KEY,
  getOnboardingGateState,
  resolvePostAppleHealthOnboardingHref,
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
      hasCompletedOnboardingAppleHealth: false,
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

test("questionnaire-complete first-run without Apple Health step stays on Apple Health onboarding", async () => {
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
    assert.equal(gateState, "needs_apple_health");
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

test("rating completion routes first-run onboarding to Apple Health before paywall", async () => {
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
    assert.equal(gateState, "needs_apple_health");
  });
});

test("rating completion on Android skips Apple Health and goes to referral source", async () => {
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
    const gateState = await getOnboardingGateState({
      requiresAppleHealthStep: false,
    });
    assert.equal(gateState, "needs_referral_source");
  });
});

test("skipping Apple Health still reaches referral source", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.ratingCompleted.v1": "true",
    "suppro.onboarding.appleHealthCompleted.v1": "true",
  });

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_referral_source");
  });
});

test("accepting or denying Apple Health still reaches referral source", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.ratingCompleted.v1": "true",
    "suppro.onboarding.appleHealthCompleted.v1": "true",
  });

  const { getOnboardingGateState } = loadOnboardingModule({
    asyncStorage,
    session: null,
  });

  await assert.doesNotReject(async () => {
    const gateState = await getOnboardingGateState();
    assert.equal(gateState, "needs_referral_source");
  });
});

test("referral source completion routes first-run onboarding to paywall", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.ratingCompleted.v1": "true",
    "suppro.onboarding.appleHealthCompleted.v1": "true",
    "suppro.onboarding.referralSource.v1": JSON.stringify({
      source: "App Store",
      completedAt: "2026-05-06T10:05:00.000Z",
    }),
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

test("Apple Health step routes to referral source next", () => {
  const { resolvePostAppleHealthOnboardingHref } = loadOnboardingModule({
    asyncStorage: createAsyncStorage(),
    session: null,
  });

  assert.equal(
    resolvePostAppleHealthOnboardingHref({ mode: "first_run" }),
    "/onboarding?mode=first_run&step=referral-source"
  );
});

test("Apple Health skipped does not mark signup complete or premium complete in screen code", () => {
  const source = readFileSync(
    new URL("../../src/features/onboarding/OnboardingAppleHealthScreen.jsx", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("SIGNUP_COMPLETED_STORAGE_KEY"), false);
  assert.equal(source.includes("markOnboardingPremiumComplete"), false);
  assert.equal(source.includes("/login?mode=create"), false);
  assert.equal(source.includes("/login?mode=login"), false);
});

test("Apple Health screen stays lightweight and routes directly to referral source", () => {
  const source = readFileSync(
    new URL("../../src/features/onboarding/OnboardingAppleHealthScreen.jsx", import.meta.url),
    "utf8"
  );

  assert.equal(
    source.includes('"/onboarding?mode=first_run&step=referral-source"'),
    true
  );
  assert.equal(source.includes("useAppleHealthConnection"), false);
  assert.equal(source.includes("useLocalSearchParams"), false);
  assert.equal(source.includes("react-native-health"), false);
  assert.equal(source.includes("apple-health-logo.png"), false);
});

test("book offer does not complete premium onboarding", () => {
  const source = readFileSync(
    new URL("../../src/features/onboarding/OnboardingBookOfferScreen.jsx", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("markOnboardingPremiumComplete"), false);
  assert.equal(source.includes("ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY"), false);
});

test("referral source screen does not complete premium onboarding", () => {
  const source = readFileSync(
    new URL("../../src/features/onboarding/OnboardingReferralSourceScreen.jsx", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("markOnboardingPremiumComplete"), false);
  assert.equal(source.includes("ONBOARDING_PREMIUM_COMPLETED_STORAGE_KEY"), false);
});

test("needs paywall gate only allows paywall and book offer onboarding steps", () => {
  const source = readFileSync(
    new URL("../../app/_layout.jsx", import.meta.url),
    "utf8"
  );

  assert.equal(
    source.includes(
      '(stepParam === "paywall" || stepParam === "book-offer")'
    ),
    true
  );
  assert.equal(
    source.includes(
      'effectiveGateState === "needs_paywall") {\n      return (\n        (isOnboardingRoute'
    ),
    false
  );
});

test("Android screen modules gate Apple Health at the actual render and call sites", () => {
  const onboardingSource = readFileSync(
    new URL("../../app/onboarding.jsx", import.meta.url),
    "utf8"
  );
  const healthTabSource = readFileSync(
    new URL("../../app/(tabs)/health.jsx", import.meta.url),
    "utf8"
  );
  const settingsSource = readFileSync(
    new URL("../../app/(modals)/modal/settings.jsx", import.meta.url),
    "utf8"
  );
  const connectionsSource = readFileSync(
    new URL("../../app/(modals)/modal/connections.jsx", import.meta.url),
    "utf8"
  );
  const loginSource = readFileSync(
    new URL("../../app/login.jsx", import.meta.url),
    "utf8"
  );

  assert.equal(
    onboardingSource.includes('if (stepParam === "apple-health") {'),
    true
  );
  assert.equal(
    onboardingSource.includes("if (!IS_APPLE_HEALTH_SUPPORTED_PLATFORM) {"),
    true
  );
  assert.equal(
    onboardingSource.includes(
      'const OnboardingAppleHealthScreen =\n      require("@src/features/onboarding/OnboardingAppleHealthScreen").default;'
    ),
    true
  );

  assert.equal(healthTabSource.includes("useAppleHealthConnection"), false);
  assert.equal(healthTabSource.includes("AppleHealthPill"), false);
  assert.equal(
    healthTabSource.includes('import { IOSHealthConnectionCta }'),
    false
  );

  assert.equal(settingsSource.includes("useAppleHealthConnection"), false);
  assert.equal(
    settingsSource.includes('import { IOSSettingsAppleHealthCard }'),
    false
  );
  assert.equal(settingsSource.includes("Manage Apple Health"), false);
  assert.equal(settingsSource.includes("Connect Apple Health"), false);

  assert.equal(connectionsSource.includes("useAppleHealthConnection"), false);
  assert.equal(connectionsSource.includes("Manage Apple Health"), false);
  assert.equal(connectionsSource.includes("Connect Apple Health"), false);

  assert.equal(
    loginSource.includes(
      'import { syncAppleHealthAfterAuthentication } from "@/features/health/useAppleHealthConnection";'
    ),
    false
  );
  assert.equal(
    loginSource.includes('if (IS_APPLE_HEALTH_SUPPORTED_PLATFORM) {'),
    true
  );
  assert.equal(
    loginSource.includes(
      'const { syncAppleHealthAfterAuthentication } = require('
    ),
    true
  );
});

test("onboarding paywall route stays visible while gate state catches up", () => {
  const source = readFileSync(
    new URL("../../app/_layout.jsx", import.meta.url),
    "utf8"
  );

  assert.equal(
    source.includes("const ONBOARDING_PAYWALL_TRANSITION_GATE_STATES = new Set(["),
    true
  );
  assert.equal(source.includes("isOnboardingPaywallRoute &&"), true);
  assert.equal(
    source.includes(
      "ONBOARDING_PAYWALL_TRANSITION_GATE_STATES.has(effectiveGateState)"
    ),
    true
  );
  assert.equal(
    source.includes(
      "const shouldShowGateOverlay =\n    isRedirectingToAllowedRoute && !isOnboardingPaywallRoute;"
    ),
    true
  );
});

test("paywall-complete first-run without account stays on create-account", async () => {
  const asyncStorage = createAsyncStorage({
    "suppro.onboarding.questionnaire.v1": JSON.stringify({
      completedAt: "2026-05-06T10:00:00.000Z",
    }),
    "suppro.onboarding.ratingCompleted.v1": "true",
    "suppro.onboarding.appleHealthCompleted.v1": "true",
    "suppro.onboarding.referralSource.v1": JSON.stringify({
      source: "App Store",
      completedAt: "2026-05-06T10:05:00.000Z",
    }),
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
    "suppro.onboarding.appleHealthCompleted.v1": "true",
    "suppro.onboarding.referralSource.v1": JSON.stringify({
      source: "App Store",
      completedAt: "2026-05-06T10:05:00.000Z",
    }),
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
