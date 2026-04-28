import {
  isNumericMetric,
  normalizeMetric,
} from "./metricDefinitions";

function parseISODate(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(isoDate, amount) {
  const parsed = parseISODate(isoDate);
  parsed.setDate(parsed.getDate() + amount);
  return toISODate(parsed);
}

function daysBetweenInclusive(startDate, endDate) {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 1;
  return Math.floor(diffMs / 86400000) + 1;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function entriesForMetricInWindow(entries, metricKey, startDate, endDate) {
  return (entries ?? [])
    .filter(
      (entry) =>
        entry?.type === metricKey &&
        typeof entry.date === "string" &&
        entry.date >= startDate &&
        entry.date <= endDate
    )
    .sort((a, b) => {
      if (a.date === b.date) {
        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
      }
      return a.date.localeCompare(b.date);
    });
}

function numericValues(entries) {
  return (entries ?? [])
    .map((entry) => Number(entry.value))
    .filter((value) => Number.isFinite(value));
}

function trendThreshold(metric, baselineAverage, values) {
  const configuredRange =
    Number.isFinite(metric.min) && Number.isFinite(metric.max)
      ? Math.abs(metric.max - metric.min)
      : null;
  const dynamicRange = values.length
    ? Math.max(...values) - Math.min(...values)
    : 0;
  const thresholdBase =
    configuredRange && configuredRange > 0
      ? configuredRange * 0.05
      : dynamicRange * 0.2;

  return Math.max(
    thresholdBase || 0,
    Math.abs(baselineAverage) * 0.03,
    0.1
  );
}

function classifyTrend(metric, baselineAverage, recentAverage, values) {
  const delta = recentAverage - baselineAverage;
  const directionDelta = metric.lowerIsBetter ? -delta : delta;
  const threshold = trendThreshold(metric, baselineAverage, values);
  const trend =
    directionDelta > threshold
      ? "improved"
      : directionDelta < -threshold
        ? "declined"
        : "stable";

  return { delta, directionDelta, trend, threshold };
}

export function computeMetricImprovement(
  healthMetrics,
  healthEntries,
  periodStart,
  today,
  options = {}
) {
  const periodEnd = options.periodEnd ?? today;
  const periodDays = daysBetweenInclusive(periodStart, periodEnd);
  const previousPeriodEnd = options.previousPeriodEnd ?? addDays(periodStart, -1);
  const previousPeriodStart =
    options.previousPeriodStart ??
    addDays(previousPeriodEnd, -(periodDays - 1));

  const normalizedMetrics = (healthMetrics ?? [])
    .map((metric) => normalizeMetric(metric))
    .filter(Boolean)
    .filter((metric) => metric.enabled !== false);

  const items = normalizedMetrics
    .map((metric) => {
      const currentEntries = entriesForMetricInWindow(
        healthEntries,
        metric.key,
        periodStart,
        periodEnd
      );

      if (currentEntries.length === 0) return null;

      if (!isNumericMetric(metric)) {
        return {
          key: metric.key,
          label: metric.label,
          kind: "text",
          entryCount: currentEntries.length,
          latestDate: currentEntries[currentEntries.length - 1].date,
        };
      }

      const currentValues = numericValues(currentEntries);
      if (currentValues.length === 0) return null;

      const previousValues = numericValues(
        entriesForMetricInWindow(
          healthEntries,
          metric.key,
          previousPeriodStart,
          previousPeriodEnd
        )
      );

      if (previousValues.length > 0) {
        const baselineAverage = average(previousValues);
        const recentAverage = average(currentValues);
        const trendData = classifyTrend(metric, baselineAverage, recentAverage, [
          ...previousValues,
          ...currentValues,
        ]);

        return {
          key: metric.key,
          label: metric.label,
          kind: "numeric",
          metric,
          sampleSize: currentValues.length + previousValues.length,
          currentSampleSize: currentValues.length,
          previousSampleSize: previousValues.length,
          earlyAverage: baselineAverage,
          recentAverage,
          method: "current_vs_previous",
          ...trendData,
        };
      }

      if (currentValues.length < 2) {
        return {
          key: metric.key,
          label: metric.label,
          kind: "numeric",
          metric,
          sampleSize: currentValues.length,
          currentSampleSize: currentValues.length,
          previousSampleSize: 0,
          earlyAverage: currentValues[0],
          recentAverage: currentValues[0],
          delta: 0,
          directionDelta: 0,
          trend: "insufficient",
          method: "insufficient",
        };
      }

      const baselineValue = currentValues[0];
      const recentValue = currentValues[currentValues.length - 1];
      const trendData = classifyTrend(metric, baselineValue, recentValue, currentValues);

      return {
        key: metric.key,
        label: metric.label,
        kind: "numeric",
        metric,
        sampleSize: currentValues.length,
        currentSampleSize: currentValues.length,
        previousSampleSize: 0,
        earlyAverage: baselineValue,
        recentAverage: recentValue,
        method: "first_vs_latest",
        ...trendData,
      };
    })
    .filter(Boolean);

  const improvedCount = items.filter(
    (item) => item.kind === "numeric" && item.trend === "improved"
  ).length;
  const stableCount = items.filter(
    (item) => item.kind === "numeric" && item.trend === "stable"
  ).length;
  const declinedCount = items.filter(
    (item) => item.kind === "numeric" && item.trend === "declined"
  ).length;
  const insufficientCount = items.filter(
    (item) => item.kind === "numeric" && item.trend === "insufficient"
  ).length;
  const textCount = items.filter((item) => item.kind === "text").length;

  return {
    items,
    improvedCount,
    stableCount,
    declinedCount,
    insufficientCount,
    textCount,
  };
}
