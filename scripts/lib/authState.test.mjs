import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadAuthStateModule() {
  const source = readFileSync(
    new URL("../../src/lib/authState.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  canEnterAuthenticatedApp,
  getNonAnonymousAccessToken,
  hasNonAnonymousSession,
  hasNonAnonymousUser,
  isAnonymousUser,
};`
  );

  return factory();
}

const {
  canEnterAuthenticatedApp,
  getNonAnonymousAccessToken,
  hasNonAnonymousSession,
  hasNonAnonymousUser,
  isAnonymousUser,
} =
  loadAuthStateModule();

test("anonymous users are excluded from real-account session checks", () => {
  const anonymousUser = {
    id: "anon-user",
    is_anonymous: true,
  };

  assert.equal(isAnonymousUser(anonymousUser), true);
  assert.equal(hasNonAnonymousUser(anonymousUser), false);
  assert.equal(
    hasNonAnonymousSession({
      user: anonymousUser,
    }),
    false
  );
});

test("non-anonymous users satisfy real-account session checks", () => {
  const user = {
    id: "real-user",
    is_anonymous: false,
  };

  assert.equal(isAnonymousUser(user), false);
  assert.equal(hasNonAnonymousUser(user), true);
  assert.equal(
    hasNonAnonymousSession({
      user,
    }),
    true
  );
});

test("authenticated app access requires both a real session and completed account setup", () => {
  const realSession = {
    user: {
      id: "real-user",
      is_anonymous: false,
    },
  };
  const anonymousSession = {
    user: {
      id: "anon-user",
      is_anonymous: true,
    },
  };

  assert.equal(
    canEnterAuthenticatedApp({
      session: null,
      hasCompletedAccountSetup: true,
    }),
    false
  );

  assert.equal(
    canEnterAuthenticatedApp({
      session: anonymousSession,
      hasCompletedAccountSetup: true,
    }),
    false
  );

  assert.equal(
    canEnterAuthenticatedApp({
      session: realSession,
      hasCompletedAccountSetup: false,
    }),
    false
  );

  assert.equal(
    canEnterAuthenticatedApp({
      session: realSession,
      hasCompletedAccountSetup: true,
    }),
    true
  );
});

test("non-anonymous access token is returned only for real signed-in sessions", () => {
  assert.equal(
    getNonAnonymousAccessToken({
      access_token: "real-token",
      user: {
        id: "real-user",
        is_anonymous: false,
      },
    }),
    "real-token"
  );

  assert.equal(
    getNonAnonymousAccessToken({
      access_token: "anon-token",
      user: {
        id: "anon-user",
        is_anonymous: true,
      },
    }),
    null
  );

  assert.equal(
    getNonAnonymousAccessToken({
      access_token: "",
      user: {
        id: "real-user",
        is_anonymous: false,
      },
    }),
    null
  );
});
