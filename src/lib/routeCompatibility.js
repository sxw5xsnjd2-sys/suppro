export const VISIBLE_TAB_ROUTES = Object.freeze([
  "index",
  "search",
  "rankings",
  "profile",
]);

export const ME_SEGMENTS = Object.freeze({
  STATS: "stats",
  HEALTH: "health",
});

function stringParam(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

export function resolveMeSegment(value) {
  return stringParam(value).trim().toLowerCase() === ME_SEGMENTS.HEALTH
    ? ME_SEGMENTS.HEALTH
    : ME_SEGMENTS.STATS;
}

export function getMeCompatibilityHref(segment) {
  return `/profile?segment=${resolveMeSegment(segment)}`;
}

export function resolveSupplementSearchRoute({ mode, initialQuery } = {}) {
  const normalizedMode = stringParam(mode).trim();
  const normalizedInitialQuery = stringParam(initialQuery);

  if (normalizedMode === "picker") {
    return {
      kind: "picker",
      mode: "picker",
      initialQuery: normalizedInitialQuery,
    };
  }

  return {
    kind: "handoff",
    action: "replace",
    pathname: "/search",
    params: normalizedInitialQuery
      ? { initialQuery: normalizedInitialQuery }
      : {},
  };
}
