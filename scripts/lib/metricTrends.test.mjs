import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadMetricTrendModule() {
  const source = readFileSync(
    new URL("../../features/health/metricTrends.js", import.meta.url),
    "utf8"
  );
  const transformed = source
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+"\.\/metricDefinitions";\n\n/, "")
    .replace(
      "export function computeMetricImprovement",
      "function computeMetricImprovement"
    );
  const factory = new Function(
    "isNumericMetric",
    "normalizeMetric",
    `${transformed}\nreturn { computeMetricImprovement };`
  );

  return factory(
    (metric) => metric.numeric !== false,
    (metric) =>
      metric
        ? {
            enabled: metric.enabled !== false,
            lowerIsBetter: false,
            ...metric,
          }
        : null
  );
}

const { computeMetricImprovement } = loadMetricTrendModule();

function entry(type, date, value) {
  return { id: `${type}:${date}:${value}`, type, date, value };
}

test("compares current period against previous period", () => {
  const result = computeMetricImprovement(
    [{ key: "energy", label: "Energy", min: 1, max: 10 }],
    [
      entry("energy", "2026-04-14", 4),
      entry("energy", "2026-04-21", 8),
    ],
    "2026-04-20",
    "2026-04-26",
    {
      previousPeriodStart: "2026-04-13",
      previousPeriodEnd: "2026-04-19",
    }
  );

  assert.equal(result.improvedCount, 1);
  assert.equal(result.items[0].method, "current_vs_previous");
  assert.equal(result.items[0].delta, 4);
});

test("classifies declines", () => {
  const result = computeMetricImprovement(
    [{ key: "energy", label: "Energy", min: 1, max: 10 }],
    [
      entry("energy", "2026-04-14", 8),
      entry("energy", "2026-04-21", 4),
    ],
    "2026-04-20",
    "2026-04-26",
    {
      previousPeriodStart: "2026-04-13",
      previousPeriodEnd: "2026-04-19",
    }
  );

  assert.equal(result.declinedCount, 1);
});

test("honors lower-is-better metrics", () => {
  const result = computeMetricImprovement(
    [{ key: "stress", label: "Stress", lowerIsBetter: true, min: 1, max: 10 }],
    [
      entry("stress", "2026-04-14", 8),
      entry("stress", "2026-04-21", 4),
    ],
    "2026-04-20",
    "2026-04-26",
    {
      previousPeriodStart: "2026-04-13",
      previousPeriodEnd: "2026-04-19",
    }
  );

  assert.equal(result.improvedCount, 1);
  assert.equal(result.items[0].directionDelta, 4);
});

test("keeps small changes stable", () => {
  const result = computeMetricImprovement(
    [{ key: "energy", label: "Energy", min: 1, max: 10 }],
    [
      entry("energy", "2026-04-14", 5),
      entry("energy", "2026-04-21", 5.2),
    ],
    "2026-04-20",
    "2026-04-26",
    {
      previousPeriodStart: "2026-04-13",
      previousPeriodEnd: "2026-04-19",
    }
  );

  assert.equal(result.stableCount, 1);
});

test("treats a single current sample without previous data as insufficient", () => {
  const result = computeMetricImprovement(
    [{ key: "energy", label: "Energy", min: 1, max: 10 }],
    [entry("energy", "2026-04-21", 5)],
    "2026-04-20",
    "2026-04-26",
    {
      previousPeriodStart: "2026-04-13",
      previousPeriodEnd: "2026-04-19",
    }
  );

  assert.equal(result.insufficientCount, 1);
  assert.equal(result.stableCount, 0);
});

test("falls back to first-vs-latest when previous period has no data", () => {
  const result = computeMetricImprovement(
    [{ key: "energy", label: "Energy", min: 1, max: 10 }],
    [
      entry("energy", "2026-04-21", 4),
      entry("energy", "2026-04-25", 8),
    ],
    "2026-04-20",
    "2026-04-26",
    {
      previousPeriodStart: "2026-04-13",
      previousPeriodEnd: "2026-04-19",
    }
  );

  assert.equal(result.improvedCount, 1);
  assert.equal(result.items[0].method, "first_vs_latest");
});
