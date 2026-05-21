function getNormalizedRoutePath(path) {
  const nextPath = String(path ?? "");

  if (!nextPath) {
    return "";
  }

  if (!nextPath.includes("://")) {
    return nextPath
      .split(/[?#]/, 1)[0]
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  }

  const url = new URL(nextPath, "suppro://app.home");
  const nestedUrl = url.searchParams.get("url");

  if (nestedUrl) {
    return getNormalizedRoutePath(decodeURIComponent(nestedUrl));
  }

  return `${url.hostname}${url.pathname}`
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function redirectSystemPath({ path }) {
  try {
    const normalizedRoutePath = getNormalizedRoutePath(path);

    // Android auth sessions emit the callback as a deep-link navigation event too.
    if (
      normalizedRoutePath === "auth/callback" ||
      normalizedRoutePath === "callback"
    ) {
      return "/login";
    }

    return path ?? "/";
  } catch {
    return "/login";
  }
}
