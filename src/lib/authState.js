export function hasNonAnonymousUser(user) {
  return Boolean(user && user.is_anonymous !== true);
}

export function hasNonAnonymousSession(session) {
  return hasNonAnonymousUser(session?.user ?? session);
}
