import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadSourceModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
}

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

test("visible tabs preserve the centered scanner contract and feature order", async () => {
  const routeCompatibility = await loadSourceModule(
    "../../src/lib/routeCompatibility.js",
  );
  const layout = readFileSync(
    new URL("../../app/(tabs)/_layout.jsx", import.meta.url),
    "utf8",
  );

  assert.deepEqual(routeCompatibility.VISIBLE_TAB_ROUTES, [
    "index",
    "search",
    "rankings",
    "profile",
  ]);
  assert.match(layout, /name="index"[\s\S]*?title: "Home"/u);
  assert.match(layout, /name="search"[\s\S]*?title: "Search"/u);
  assert.match(layout, /name="rankings"[\s\S]*?title: "Rankings"/u);
  assert.match(layout, /name="profile"[\s\S]*?title: "Me"/u);
  assert.match(layout, /accessibilityLabel="Scan product"/u);
  assert.match(layout, /type: "tabPress"/u);
  assert.match(layout, /type: "tabLongPress"/u);
  assert.match(layout, /height: appTheme\.tabBar\.baseHeight \+ insets\.bottom/u);
});

test("legacy Supplements and standalone Search routes hand off by replacement", async () => {
  const routeCompatibility = await loadSourceModule(
    "../../src/lib/routeCompatibility.js",
  );
  const legacySupplementsRoute = readFileSync(
    new URL("../../app/(tabs)/supplements.jsx", import.meta.url),
    "utf8",
  );
  const standaloneSearchRoute = readFileSync(
    new URL("../../app/supplement-search.jsx", import.meta.url),
    "utf8",
  );

  assert.match(legacySupplementsRoute, /<Redirect href="\/rankings" \/>/u);
  assert.match(standaloneSearchRoute, /resolution\.kind === "handoff"/u);
  assert.deepEqual(
    routeCompatibility.resolveSupplementSearchRoute({
      mode: "info",
      initialQuery: " Vitamin D ",
    }),
    {
      kind: "handoff",
      action: "replace",
      pathname: "/search",
      params: { initialQuery: " Vitamin D " },
    },
  );
  assert.deepEqual(
    routeCompatibility.resolveSupplementSearchRoute({
      mode: "picker",
      initialQuery: "Magnesium",
    }),
    {
      kind: "picker",
      mode: "picker",
      initialQuery: "Magnesium",
    },
  );
});

test("native intents keep compatibility deep links available to route files", async () => {
  const nativeIntent = await loadSourceModule("../../app/+native-intent.js");
  const supplementsLink = "suppro://supplements";
  const searchLink =
    "suppro://supplement-search?initialQuery=Vitamin%20D";
  const statsLink = "suppro://stats";
  const healthLink = "suppro://health";
  const metricLink = "suppro://health/sleep";

  assert.equal(
    nativeIntent.redirectSystemPath({ path: supplementsLink }),
    supplementsLink,
  );
  assert.equal(
    nativeIntent.redirectSystemPath({ path: searchLink }),
    searchLink,
  );
  assert.equal(nativeIntent.redirectSystemPath({ path: statsLink }), statsLink);
  assert.equal(nativeIntent.redirectSystemPath({ path: healthLink }), healthLink);
  assert.equal(nativeIntent.redirectSystemPath({ path: metricLink }), metricLink);
});

test("Rankings content remains and hidden Health and Stats routes hand off to Me", () => {
  const rankings = readFileSync(
    new URL("../../app/(tabs)/rankings.jsx", import.meta.url),
    "utf8",
  );
  const health = readFileSync(
    new URL("../../app/(tabs)/health.jsx", import.meta.url),
    "utf8",
  );
  const stats = readFileSync(
    new URL("../../app/(tabs)/stats.jsx", import.meta.url),
    "utf8",
  );
  const benefitRanking = readFileSync(
    new URL("../../app/benefit-ranking.jsx", import.meta.url),
    "utf8",
  );

  assert.match(rankings, /export default function RankingsScreen/u);
  assert.match(rankings, /SUPPLEMENT RANKINGS/u);
  assert.match(health, /HealthCompatibilityRoute/u);
  assert.match(health, /getMeCompatibilityHref\("health"\)/u);
  assert.match(stats, /StatsCompatibilityRoute/u);
  assert.match(stats, /getMeCompatibilityHref\("stats"\)/u);
  assert.match(benefitRanking, /fallbackHref: "\/rankings"/u);
});

test("Home removes the catalogue field but retains the empty-state Search action", () => {
  const home = readFileSync(
    new URL("../../app/(tabs)/index.jsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(home, /Search supplement catalog/u);
  assert.match(home, />Search supplements<\/Text>/u);
  assert.match(home, /router\.navigate\("\/search"\)/u);
});
