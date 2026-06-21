import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadNavigationHandoffModule() {
  const source = readFileSync(
    new URL("../../src/lib/navigationHandoff.js", import.meta.url),
    "utf8",
  );

  const transformed = source
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  NAVIGATION_HANDOFFS,
  clearNavigationHandoff,
  getNavigationHandoff,
  startNavigationHandoff,
  subscribeNavigationHandoff,
};`,
  );

  return factory();
}

test("startNavigationHandoff publishes the normalized active handoff", () => {
  const navigationHandoff = loadNavigationHandoffModule();
  const notifications = [];

  const unsubscribe = navigationHandoff.subscribeNavigationHandoff(
    (nextHandoff) => {
      notifications.push(nextHandoff);
    },
  );

  const activeHandoff = navigationHandoff.startNavigationHandoff(
    navigationHandoff.NAVIGATION_HANDOFFS.APPLE_HEALTH_NEXT,
  );

  unsubscribe();

  assert.equal(activeHandoff.reason, "apple_health_next");
  assert.equal(activeHandoff.blocking, false);
  assert.deepEqual(activeHandoff.target, {
    pathname: "onboarding",
    mode: "first_run",
    step: "referral-source",
  });
  assert.equal(typeof activeHandoff.startedAt, "number");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].reason, "apple_health_next");
  assert.notEqual(
    notifications[0],
    navigationHandoff.NAVIGATION_HANDOFFS.APPLE_HEALTH_NEXT,
  );
  assert.deepEqual(
    navigationHandoff.getNavigationHandoff(),
    activeHandoff,
  );
});

test("clearNavigationHandoff only clears the matching reason when provided", () => {
  const navigationHandoff = loadNavigationHandoffModule();

  navigationHandoff.startNavigationHandoff(
    navigationHandoff.NAVIGATION_HANDOFFS.REFERRAL_SOURCE_NEXT,
  );
  navigationHandoff.clearNavigationHandoff("auth_success");

  assert.equal(
    navigationHandoff.getNavigationHandoff().reason,
    "referral_source_next",
  );

  navigationHandoff.clearNavigationHandoff("referral_source_next");
  assert.equal(navigationHandoff.getNavigationHandoff(), null);
});

test("clearNavigationHandoff without a reason clears the current handoff and notifies subscribers", () => {
  const navigationHandoff = loadNavigationHandoffModule();
  const notifications = [];

  navigationHandoff.subscribeNavigationHandoff((nextHandoff) => {
    notifications.push(nextHandoff);
  });

  navigationHandoff.startNavigationHandoff(
    navigationHandoff.NAVIGATION_HANDOFFS.AUTH_SUCCESS,
  );
  navigationHandoff.clearNavigationHandoff();

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].reason, "auth_success");
  assert.equal(notifications[1], null);
  assert.equal(navigationHandoff.getNavigationHandoff(), null);
});
