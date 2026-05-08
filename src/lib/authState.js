export function isAnonymousUser(user) {
  return Boolean(user && user.is_anonymous === true);
}

export function hasNonAnonymousUser(user) {
  return Boolean(user && !isAnonymousUser(user));
}

export function hasNonAnonymousSession(session) {
  return hasNonAnonymousUser(session?.user ?? session);
}

export function getNonAnonymousAccessToken(session) {
  if (!hasNonAnonymousSession(session)) {
    return null;
  }

  const token = session?.access_token;
  return typeof token === "string" && token.trim() ? token : null;
}

export function canEnterAuthenticatedApp({
  session,
  hasCompletedAccountSetup = false,
}) {
  return hasNonAnonymousSession(session) && hasCompletedAccountSetup === true;
}
