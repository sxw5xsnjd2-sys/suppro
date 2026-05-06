import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadOauthLoginStateModule() {
  const source = readFileSync(
    new URL("../../src/lib/oauthLoginState.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  OAUTH_LOGIN_FRESHNESS_WINDOW_MS,
  hasCompletedSupproAccountMarker,
  isLikelyNewOauthUser,
  shouldAttemptAccidentalOauthUserCleanup,
  shouldRejectLoginModeOauthUser,
};`
  );

  return factory();
}

const {
  OAUTH_LOGIN_FRESHNESS_WINDOW_MS,
  hasCompletedSupproAccountMarker,
  isLikelyNewOauthUser,
  shouldAttemptAccidentalOauthUserCleanup,
  shouldRejectLoginModeOauthUser,
} = loadOauthLoginStateModule();

test("flags a freshly auto-created OAuth user as new", () => {
  const nowMs = Date.parse("2026-05-06T12:02:00.000Z");
  const createdAt = "2026-05-06T12:01:10.000Z";
  const lastSignInAt = "2026-05-06T12:01:12.000Z";

  assert.equal(
    isLikelyNewOauthUser({
      createdAt,
      lastSignInAt,
      nowMs,
      freshnessWindowMs: OAUTH_LOGIN_FRESHNESS_WINDOW_MS,
    }),
    true
  );
});

test("does not flag an older OAuth user as new", () => {
  const nowMs = Date.parse("2026-05-06T12:02:00.000Z");

  assert.equal(
    isLikelyNewOauthUser({
      createdAt: "2026-05-06T11:30:00.000Z",
      lastSignInAt: "2026-05-06T12:01:50.000Z",
      nowMs,
      freshnessWindowMs: OAUTH_LOGIN_FRESHNESS_WINDOW_MS,
    }),
    false
  );
});

test("profiles-only existence does not count as a completed Suppro account", () => {
  assert.equal(
    hasCompletedSupproAccountMarker({
      user_id: "user-1",
      completed_at: null,
    }),
    false
  );
});

test("completed-account marker allows login", () => {
  assert.equal(
    hasCompletedSupproAccountMarker({
      user_id: "user-1",
      completed_at: "2026-05-01T10:00:00.000Z",
    }),
    true
  );
});

test("rejects login-mode OAuth whenever the completed-account marker is missing", () => {
  assert.equal(
    shouldRejectLoginModeOauthUser({
      isCreateMode: false,
      isAnonymousUser: false,
      profileExists: false,
      hasCompletedAccountMarker: false,
    }),
    true
  );

  assert.equal(
    shouldRejectLoginModeOauthUser({
      isCreateMode: false,
      isAnonymousUser: false,
      profileExists: true,
      hasCompletedAccountMarker: false,
    }),
    true
  );

  assert.equal(
    shouldRejectLoginModeOauthUser({
      isCreateMode: false,
      isAnonymousUser: true,
      profileExists: true,
      hasCompletedAccountMarker: true,
    }),
    true
  );

  assert.equal(
    shouldRejectLoginModeOauthUser({
      isCreateMode: false,
      isAnonymousUser: false,
      profileExists: true,
      hasCompletedAccountMarker: true,
    }),
    false
  );

  assert.equal(
    shouldRejectLoginModeOauthUser({
      isCreateMode: true,
      isAnonymousUser: false,
      profileExists: true,
      hasCompletedAccountMarker: false,
    }),
    false
  );
});

test("attempts accidental-user cleanup only for freshly created no-profile OAuth users", () => {
  assert.equal(
    shouldAttemptAccidentalOauthUserCleanup({
      isCreateMode: false,
      profileExists: true,
      hasCompletedAccountMarker: false,
      user: {
        created_at: "2026-05-06T12:01:10.000Z",
        last_sign_in_at: "2026-05-06T12:01:12.000Z",
      },
      nowMs: Date.parse("2026-05-06T12:02:00.000Z"),
    }),
    true
  );

  assert.equal(
    shouldAttemptAccidentalOauthUserCleanup({
      isCreateMode: false,
      profileExists: true,
      hasCompletedAccountMarker: false,
      user: {
        created_at: "2026-05-06T11:20:00.000Z",
        last_sign_in_at: "2026-05-06T12:01:12.000Z",
      },
      nowMs: Date.parse("2026-05-06T12:02:00.000Z"),
    }),
    false
  );

  assert.equal(
    shouldAttemptAccidentalOauthUserCleanup({
      isCreateMode: false,
      profileExists: true,
      hasCompletedAccountMarker: true,
      user: {
        created_at: "2026-05-06T12:01:10.000Z",
        last_sign_in_at: "2026-05-06T12:01:12.000Z",
      },
      nowMs: Date.parse("2026-05-06T12:02:00.000Z"),
    }),
    false
  );

  assert.equal(
    shouldAttemptAccidentalOauthUserCleanup({
      isCreateMode: true,
      profileExists: true,
      hasCompletedAccountMarker: false,
      user: {
        created_at: "2026-05-06T12:01:10.000Z",
        last_sign_in_at: "2026-05-06T12:01:12.000Z",
      },
      nowMs: Date.parse("2026-05-06T12:02:00.000Z"),
    }),
    false
  );
});
