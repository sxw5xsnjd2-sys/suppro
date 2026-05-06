export const OAUTH_LOGIN_FRESHNESS_WINDOW_MS = 2 * 60 * 1000;

function toTimestampMs(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isLikelyNewOauthUser({
  createdAt,
  lastSignInAt,
  nowMs = Date.now(),
  freshnessWindowMs = OAUTH_LOGIN_FRESHNESS_WINDOW_MS,
}) {
  const createdAtMs = toTimestampMs(createdAt);
  const lastSignInAtMs = toTimestampMs(lastSignInAt);

  if (!Number.isFinite(createdAtMs) || !Number.isFinite(lastSignInAtMs)) {
    return false;
  }

  if (!Number.isFinite(nowMs) || nowMs < createdAtMs) {
    return false;
  }

  return (
    nowMs - createdAtMs <= freshnessWindowMs &&
    Math.abs(lastSignInAtMs - createdAtMs) <= freshnessWindowMs
  );
}

export function hasCompletedSupproAccountMarker(profile) {
  if (!profile || typeof profile !== "object") {
    return false;
  }

  if (
    typeof profile.completed_at === "string" &&
    profile.completed_at.trim()
  ) {
    return true;
  }

  return false;
}

export function shouldRejectLoginModeOauthUser({
  isCreateMode = false,
  isAnonymousUser = false,
  profileExists = false,
  hasCompletedAccountMarker = false,
}) {
  void profileExists;
  return !isCreateMode && (isAnonymousUser || !hasCompletedAccountMarker);
}

export function shouldAttemptAccidentalOauthUserCleanup({
  isCreateMode = false,
  profileExists = false,
  hasCompletedAccountMarker = false,
  user,
  nowMs = Date.now(),
  freshnessWindowMs = OAUTH_LOGIN_FRESHNESS_WINDOW_MS,
}) {
  void profileExists;
  if (isCreateMode || hasCompletedAccountMarker) {
    return false;
  }

  return isLikelyNewOauthUser({
    createdAt: user?.created_at,
    lastSignInAt: user?.last_sign_in_at,
    nowMs,
    freshnessWindowMs,
  });
}
