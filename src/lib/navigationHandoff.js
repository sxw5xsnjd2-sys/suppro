export const NAVIGATION_HANDOFFS = Object.freeze({
  APPLE_HEALTH_NEXT: Object.freeze({
    reason: "apple_health_next",
    blocking: false,
    target: Object.freeze({
      pathname: "onboarding",
      mode: "first_run",
      step: "referral-source",
    }),
  }),
  REFERRAL_SOURCE_NEXT: Object.freeze({
    reason: "referral_source_next",
    blocking: false,
    target: Object.freeze({
      pathname: "onboarding",
      mode: "first_run",
      step: "paywall",
    }),
  }),
  AUTH_SUCCESS: Object.freeze({
    reason: "auth_success",
    blocking: true,
    target: Object.freeze({
      pathname: "authenticated_app",
    }),
  }),
  ACCOUNT_DELETION: Object.freeze({
    reason: "account_deletion",
    blocking: true,
    target: Object.freeze({
      pathname: "onboarding",
      mode: "first_run",
    }),
  }),
});

const handoffListeners = new Set();
let activeNavigationHandoff = null;

function notifyNavigationHandoffChange() {
  handoffListeners.forEach((listener) => {
    try {
      listener(activeNavigationHandoff);
    } catch (error) {
      console.error("Failed to notify navigation handoff listener", error);
    }
  });
}

function cloneTarget(target) {
  if (!target || typeof target !== "object") {
    return null;
  }

  return { ...target };
}

function normalizeNavigationHandoff(handoff) {
  if (!handoff || typeof handoff !== "object") {
    throw new Error("Navigation handoff must be an object.");
  }

  const reason =
    typeof handoff.reason === "string" ? handoff.reason.trim() : "";

  if (!reason) {
    throw new Error("Navigation handoff reason is required.");
  }

  return {
    reason,
    blocking: handoff.blocking === true,
    target: cloneTarget(handoff.target),
    startedAt: Date.now(),
  };
}

export function startNavigationHandoff(handoff) {
  activeNavigationHandoff = normalizeNavigationHandoff(handoff);
  notifyNavigationHandoffChange();
  return activeNavigationHandoff;
}

export function clearNavigationHandoff(reason) {
  const normalizedReason =
    typeof reason === "string" ? reason.trim() : "";

  if (
    normalizedReason &&
    activeNavigationHandoff?.reason !== normalizedReason
  ) {
    return activeNavigationHandoff;
  }

  if (!activeNavigationHandoff) {
    return null;
  }

  activeNavigationHandoff = null;
  notifyNavigationHandoffChange();
  return null;
}

export function getNavigationHandoff() {
  return activeNavigationHandoff;
}

export function subscribeNavigationHandoff(listener) {
  handoffListeners.add(listener);

  return () => {
    handoffListeners.delete(listener);
  };
}
