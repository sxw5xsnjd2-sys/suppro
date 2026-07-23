import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

async function loadRouteCompatibility() {
  const moduleSource = source("../../src/lib/routeCompatibility.js");
  return import(
    `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`
  );
}

test("Me segment contract defaults safely and builds compatibility handoffs", async () => {
  const {
    ME_SEGMENTS,
    getMeCompatibilityHref,
    resolveMeSegment,
  } = await loadRouteCompatibility();

  assert.deepEqual(ME_SEGMENTS, {
    STATS: "stats",
    HEALTH: "health",
  });
  assert.equal(resolveMeSegment(), "stats");
  assert.equal(resolveMeSegment("unknown"), "stats");
  assert.equal(resolveMeSegment(["health", "stats"]), "health");
  assert.equal(resolveMeSegment(" HEALTH "), "health");
  assert.equal(getMeCompatibilityHref("stats"), "/profile?segment=stats");
  assert.equal(getMeCompatibilityHref("health"), "/profile?segment=health");
});

test("Me owns exactly one shared screen shell and accessible segment control", () => {
  const profile = source("../../app/(tabs)/profile.jsx");

  assert.equal((profile.match(/<BackdropScreen/gu) ?? []).length, 1);
  assert.equal((profile.match(/<AppHeader/gu) ?? []).length, 1);
  assert.equal((profile.match(/<ChatFloatingButton/gu) ?? []).length, 1);
  assert.equal((profile.match(/router\.push\("\/settings"\)/gu) ?? []).length, 1);
  assert.match(profile, /accessibilityRole="tablist"/u);
  assert.match(profile, /accessibilityRole="tab"/u);
  assert.match(profile, /accessibilityState=\{\{ selected \}\}/u);
  assert.match(profile, /router\.setParams\(\{ segment: nextSegment \}\)/u);
  assert.match(profile, /scrollViewRef\.current\?\.scrollTo/u);
  assert.match(profile, /activeSegment === ME_SEGMENTS\.HEALTH/u);
  assert.match(profile, /<HealthContent/u);
  assert.match(profile, /<StatsContent/u);
});

test("Stats and Health feature content do not duplicate routed screen concerns", () => {
  const stats = source("../../features/stats/components/StatsContent.jsx");
  const health = source("../../features/health/components/HealthContent.jsx");

  for (const content of [stats, health]) {
    assert.doesNotMatch(content, /BackdropScreen/u);
    assert.doesNotMatch(content, /AppHeader/u);
    assert.doesNotMatch(content, /ChatFloatingButton/u);
    assert.doesNotMatch(content, /useSubscriptionAccess/u);
    assert.doesNotMatch(content, /useSafeAreaInsets/u);
  }

  assert.match(stats, /export function StatsContent/u);
  assert.match(health, /export function HealthContent/u);
  assert.match(health, /requireSubscriptionAccess/u);
  assert.match(health, /AddMetricModal/u);
  assert.match(health, /router\.push\(`\/health\/\$\{m\.key\}`\)/u);
});

test("Health keeps Apple-only modules behind a platform guard and Android manual state", () => {
  const health = source("../../features/health/components/HealthContent.jsx");
  const platform = source("../../features/health/platform.js");
  const appleHealth = source("../../features/health/appleHealth.js");

  assert.match(platform, /Platform\.OS === "ios"/u);
  assert.match(
    health,
    /IS_APPLE_HEALTH_SUPPORTED_PLATFORM \? \([\s\S]*IOSHealthConnectionCtaSlot/u,
  );
  assert.match(health, /require\([\s\S]*IOSHealthConnectionCta/u);
  assert.match(health, /Manual tracking/u);
  assert.match(appleHealth, /if \(Platform\.OS !== "ios"\) return null/u);
});

test("metric detail preserves its route and has a safe direct-link fallback to Health in Me", () => {
  const metricDetail = source("../../app/health/[metric].jsx");

  assert.match(metricDetail, /export default function MetricDetailScreen/u);
  assert.match(metricDetail, /fallbackHref: "\/profile\?segment=health"/u);
  assert.match(metricDetail, /accessibilityLabel="Go back to Health"/u);
  assert.match(metricDetail, /accessibilityRole="tablist"/u);
});
