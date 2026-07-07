const CHAT_REFUSAL_MESSAGE =
  "I can only help with your supplements and Suppro supplement data. Ask about your stack, schedule, adherence, symptom-focused supplement options, evidence, or health metric trends.";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value) {
  return trimString(value).toLowerCase();
}

function humanizePhrase(value) {
  const trimmed = trimString(value);
  if (!trimmed) return "";
  return trimmed
    .split(/\s+/)
    .map((token) =>
      token ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() : ""
    )
    .join(" ");
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value) {
  if (!isFiniteNumber(value)) return "";
  if (Math.abs(value) >= 100 || Number.isInteger(value)) {
    return String(Math.round(value * 10) / 10).replace(/\.0$/, "");
  }
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatMetricValue(value, metric) {
  if (isFiniteNumber(value)) {
    const unit = trimString(metric?.unit);
    const formatted = formatNumber(value);
    return unit ? `${formatted} ${unit}` : formatted;
  }

  if (
    value &&
    typeof value === "object" &&
    isFiniteNumber(value.systolic) &&
    isFiniteNumber(value.diastolic)
  ) {
    return `${Math.round(value.systolic)}/${Math.round(value.diastolic)} mmHg`;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "recorded";
}

function formatMetricLabel(metricKey, metric) {
  const label = trimString(metric?.label);
  if (label) return label;

  return String(metricKey || "tracked metric")
    .replace(/_/g, " ")
    .trim();
}

function buildMetricMap(stats) {
  const metrics = Array.isArray(stats?.healthMetrics) ? stats.healthMetrics : [];
  const map = {};
  metrics.forEach((metric) => {
    const key = trimString(metric?.key);
    if (!key) return;
    map[key] = metric;
  });
  return map;
}

function getHealthEntries(stats) {
  return (Array.isArray(stats?.healthEntries) ? stats.healthEntries : [])
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => trimString(entry.type) && trimString(entry.date))
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function groupEntriesByType(entries) {
  const grouped = {};
  entries.forEach((entry) => {
    const type = trimString(entry.type);
    if (!type) return;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(entry);
  });
  return grouped;
}

function latestEntryDate(entries) {
  const latest = entries[entries.length - 1];
  return latest?.date ?? "";
}

function sortMetricKeysByRecency(grouped) {
  return Object.keys(grouped).sort((a, b) =>
    latestEntryDate(grouped[b]).localeCompare(latestEntryDate(grouped[a]))
  );
}

function matchesCue(metricKey, metric, cues) {
  const haystack = `${normalizeText(metricKey)} ${normalizeText(metric?.label)}`;
  return cues.some((cue) => haystack.includes(cue));
}

function findRelevantMetricKeys(question, grouped, metricMap) {
  const q = normalizeText(question);
  const allKeys = sortMetricKeysByRecency(grouped);
  if (!q) return allKeys.slice(0, 3);

  const cueSets = [
    {
      when: ["sleep"],
      cues: ["sleep", "recovery"],
    },
    {
      when: ["apple health", "health tracking", "health data", "tracked data", "my health data"],
      cues: [],
      preferAppleHealth: true,
    },
    {
      when: ["steps", "step count", "activity", "active", "fitness", "exercise", "workout"],
      cues: [
        "step",
        "activity",
        "cardio",
        "endurance",
        "workout",
        "recovery",
        "physical resilience",
        "exercise",
      ],
    },
    {
      when: ["weight"],
      cues: ["weight", "body weight"],
    },
    {
      when: ["heart rate", "resting heart", "hrv", "recovery"],
      cues: ["heart", "hrv", "recovery", "blood pressure"],
    },
    {
      when: ["blood pressure"],
      cues: ["blood pressure"],
    },
    {
      when: ["glucose", "blood sugar"],
      cues: ["glucose", "blood sugar"],
    },
    {
      when: ["protein"],
      cues: ["protein"],
    },
    {
      when: ["hydration", "water"],
      cues: ["hydration", "water"],
    },
    {
      when: ["calories"],
      cues: ["calorie"],
    },
  ];

  for (const cueSet of cueSets) {
    if (!cueSet.when.some((cue) => q.includes(cue))) continue;

    if (cueSet.preferAppleHealth) {
      const appleKeys = allKeys.filter((key) =>
        grouped[key].some((entry) => entry?.source === "apple_health")
      );
      if (appleKeys.length) return appleKeys.slice(0, 3);
      return allKeys.slice(0, 3);
    }

    const matchingKeys = allKeys.filter((key) =>
      matchesCue(key, metricMap[key], cueSet.cues)
    );
    return matchingKeys.slice(0, 3);
  }

  return allKeys.slice(0, 3);
}

function describeMetric(metricKey, entries, metricMap) {
  const metric = metricMap[metricKey];
  const label = formatMetricLabel(metricKey, metric);
  const latest = entries[entries.length - 1];
  if (!latest) return null;

  const latestValue = formatMetricValue(latest.value, metric);
  let summary = `${label}: latest ${latestValue} on ${latest.date}`;

  const previous = entries
    .slice(0, -1)
    .reverse()
    .find((entry) => entry && entry.value != null);
  if (previous && isFiniteNumber(latest.value) && isFiniteNumber(previous.value)) {
    const delta = latest.value - previous.value;
    const threshold = metric?.unit === "hours" ? 0.25 : 0.5;
    if (Math.abs(delta) >= threshold) {
      const direction = delta > 0 ? "up" : "down";
      summary += `, ${direction} from ${formatMetricValue(previous.value, metric)} on ${previous.date}`;
    } else {
      summary += `, broadly steady versus ${previous.date}`;
    }
  }

  return summary;
}

function listVisibleMetricLabels(metricKeys, metricMap) {
  return metricKeys
    .map((key) => formatMetricLabel(key, metricMap[key]))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function buildMissingHealthDataReply(question, stats) {
  const q = normalizeText(question);
  const hasConfiguredMetrics = Array.isArray(stats?.healthMetrics) && stats.healthMetrics.length > 0;
  const configuredLabels = hasConfiguredMetrics
    ? stats.healthMetrics
        .map((metric) => formatMetricLabel(metric?.key, metric))
        .filter(Boolean)
        .slice(0, 4)
        .join(", ")
    : "";

  if (q.includes("sleep")) {
    return "I can review your sleep data once it is available. Right now I can't see any recent sleep entries in the data I received, so useful things to check next are sleep duration, consistency, sleep quality, and how recovery feels the next day.";
  }

  if (
    q.includes("steps") ||
    q.includes("step count") ||
    q.includes("activity") ||
    q.includes("workout")
  ) {
    return "I can review your activity data once it is available. Right now I can't see any recent steps or activity entries in the data I received, so useful things to check next are daily step count, workout volume, recovery, and how those trends line up with sleep and energy.";
  }

  if (q.includes("apple health")) {
    return "I can review your Apple Health data once it is available in Suppro. Right now I can't see any recent Apple Health metrics in the data I received, but useful things to look at would be sleep consistency, resting metrics, activity, weight trend, and recovery.";
  }

  const configuredText = configuredLabels
    ? ` Enabled tracked metrics include ${configuredLabels}.`
    : "";
  return `I can review your health-tracking data once it is available. Right now I can't see any recent tracked metrics in the data I received, but useful things to look at would be sleep consistency, resting heart rate, activity, weight trend, and recovery.${configuredText}`;
}

function buildNoRelevantMetricReply(question, grouped, metricMap) {
  const q = normalizeText(question);
  const visibleKeys = sortMetricKeysByRecency(grouped);
  const visibleLabels = listVisibleMetricLabels(visibleKeys, metricMap);

  if (q.includes("sleep")) {
    return `I can review your sleep data, but I can't see any recent sleep entries in the data I received. I can currently see ${visibleLabels || "other tracked metrics"}, so syncing sleep or logging it in Suppro would make the review more specific.`;
  }

  if (
    q.includes("steps") ||
    q.includes("step count") ||
    q.includes("activity") ||
    q.includes("workout")
  ) {
    return `I can review your activity data, but I can't see any recent steps or activity entries in the data I received. I can currently see ${visibleLabels || "other tracked metrics"}, so adding activity data would make the review more specific.`;
  }

  return `I can review your health-tracking data, but I can't see the specific metric you asked about in the data I received. I can currently see ${visibleLabels || "other tracked metrics"}, and I can help interpret those or review the missing metric once it is synced.`;
}

export function isStackOptimizationQuestion(question) {
  const q = normalizeText(question);
  if (!q) return false;
  const cues = [
    "remove",
    "drop",
    "cut",
    "stop",
    "discontinue",
    "simplify",
    "least useful",
    "which supplement should i remove",
    "what should i remove",
    "remove from my stack",
    "take out",
  ];
  return cues.some((cue) => q.includes(cue));
}

export function isSymptomRecommendationQuestion(question) {
  const q = normalizeText(question);
  if (!q) return false;
  const cues = [
    "what should i take",
    "which supplement",
    "best supplement",
    "for sleep",
    "for stress",
    "for mood",
    "for energy",
    "for ",
  ];
  return cues.some((cue) => q.includes(cue));
}

export function isHealthTrackingQuestion(question) {
  const q = normalizeText(question);
  if (!q) return false;
  const cues = [
    "health tracking",
    "health tracked",
    "health data",
    "tracked data",
    "apple health",
    "sleep",
    "weight",
    "steps",
    "step count",
    "activity",
    "recovery",
    "heart rate",
    "resting heart",
    "hrv",
    "calories",
    "protein",
    "hydration",
    "blood pressure",
    "blood sugar",
    "glucose",
    "fitness",
    "wellbeing",
    "habit",
  ];
  return cues.some((cue) => q.includes(cue));
}

function getStackSupplementNames(stats) {
  return (Array.isArray(stats?.supplements) ? stats.supplements : [])
    .map((item) => trimString(item?.name))
    .filter(Boolean);
}

function getEvidenceSupplementNames(stats) {
  const bySupplement = stats?.evidenceCatalog?.bySupplement;
  if (!bySupplement || typeof bySupplement !== "object") return [];
  return Object.values(bySupplement)
    .map((item) => trimString(item?.name))
    .filter(Boolean);
}

function extractCandidateSupplementPhrases(question) {
  const raw = trimString(question);
  if (!raw) return [];

  const matches = [];
  const patterns = [
    /\bmy\s+([a-z0-9][a-z0-9 +\-]{1,40}?)(?:\s+been|\s+looking|\s+doing|\s+intake|\s+schedule|\s+consistency|\s+adherence|\s+usage|\?|$)/i,
    /\babout\s+([a-z0-9][a-z0-9 +\-]{1,40}?)(?:\?|$)/i,
    /\bfor\s+([a-z0-9][a-z0-9 +\-]{1,40}?)(?:\?|$)/i,
  ];

  patterns.forEach((pattern) => {
    const match = raw.match(pattern);
    const phrase = trimString(match?.[1] ?? "");
    if (phrase) matches.push(phrase);
  });

  return Array.from(new Set(matches));
}

function findMentionedSupplement(question, stats) {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion) return null;

  const stackNames = getStackSupplementNames(stats);
  const evidenceNames = getEvidenceSupplementNames(stats);
  const allNames = Array.from(new Set([...stackNames, ...evidenceNames]))
    .map((name) => ({
      raw: name,
      normalized: normalizeText(name),
    }))
    .filter((item) => item.normalized)
    .sort((a, b) => b.normalized.length - a.normalized.length);

  const exactMatch = allNames.find((item) =>
    normalizedQuestion.includes(item.normalized)
  );
  if (exactMatch) {
    return {
      name: exactMatch.raw,
      inStack: stackNames.some(
        (stackName) => normalizeText(stackName) === exactMatch.normalized
      ),
    };
  }

  const candidatePhrase = extractCandidateSupplementPhrases(question)[0];
  if (!candidatePhrase) return null;

  return {
    name: humanizePhrase(candidatePhrase),
    inStack: stackNames.some(
      (stackName) => normalizeText(stackName) === normalizeText(candidatePhrase)
    ),
  };
}

export function isSupplementContextQuestion(question, stats) {
  const q = normalizeText(question);
  if (!q) return false;

  const supplementCues = [
    "supplement",
    "stack",
    "adherence",
    "consistent",
    "consistency",
    "logged",
    "log",
    "miss",
    "missed",
    "take",
    "taking",
    "tracker",
    "tracked",
    "schedule",
    "today",
  ];

  if (supplementCues.some((cue) => q.includes(cue))) return true;
  return Boolean(findMentionedSupplement(question, stats));
}

export function fallbackSupplementContextReply(question, stats) {
  const mentionedSupplement = findMentionedSupplement(question, stats);
  const stackNames = getStackSupplementNames(stats);
  const stackPreview = stackNames.slice(0, 4).join(", ");

  if (mentionedSupplement && !mentionedSupplement.inStack) {
    const stackText = stackPreview
      ? ` I can currently see ${stackPreview} in your tracked supplements.`
      : " I do not currently see any tracked supplements in the data I received.";
    return `I can't see ${mentionedSupplement.name} in your tracked supplements right now, so I can't comment on its personal consistency or adherence yet.${stackText} If you add or track ${mentionedSupplement.name} in Suppro, I can review how consistent it has been.`;
  }

  if (mentionedSupplement && mentionedSupplement.inStack) {
    return `I can only comment on ${mentionedSupplement.name}'s personal consistency if that supplement appears clearly in the tracked stack and adherence data I received. If the current data looks incomplete, try syncing or reloading your supplement history and I can review it from there.`;
  }

  if (stackPreview) {
    return `I can answer from your tracked supplement data when the supplement is present in your stack and adherence history. I can currently see ${stackPreview} in your tracked supplements, so if you meant one of those I can review it directly.`;
  }

  return "I can answer from your tracked supplement data when the supplement is present in your stack and adherence history, but I do not currently see any tracked supplements in the data I received.";
}

function getEvidenceBySupplement(stats) {
  const output = {};
  const bySupplement = stats?.evidenceCatalog?.bySupplement;
  if (bySupplement && typeof bySupplement === "object") {
    for (const [id, raw] of Object.entries(bySupplement)) {
      const evidenceScore = isFiniteNumber(raw?.evidenceScore)
        ? raw.evidenceScore
        : null;
      const benefits = Array.isArray(raw?.benefits)
        ? raw.benefits
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
        : [];
      output[id] = {
        id,
        name: typeof raw?.name === "string" ? raw.name : id,
        evidenceScore,
        benefits,
      };
    }
  }
  return output;
}

export function fallbackStackOptimizationReply(stats) {
  const stack = Array.isArray(stats?.supplements) ? stats.supplements : [];
  if (!stack.length) {
    return "I do not see any supplements in your current stack data, so I cannot suggest one to remove yet.";
  }

  const evidenceBySupplement = getEvidenceBySupplement(stats);
  const stackWithEvidence = stack
    .map((item) => {
      const catalogId = typeof item?.catalogId === "string" ? item.catalogId : null;
      const name =
        typeof item?.name === "string" ? item.name : "Unknown supplement";
      const evidence = catalogId ? evidenceBySupplement[catalogId] : null;
      const evidenceScore = evidence?.evidenceScore ?? null;
      return {
        name,
        catalogId,
        evidenceScore,
      };
    })
    .filter((item) => item.name);

  if (!stackWithEvidence.length) {
    return null;
  }

  const known = stackWithEvidence.filter((item) => isFiniteNumber(item.evidenceScore));
  const unknown = stackWithEvidence.filter((item) => !isFiniteNumber(item.evidenceScore));

  if (!known.length) {
    const names = unknown
      .slice(0, 3)
      .map((item) => item.name)
      .join(", ");
    return `Based on Suppro evidence data, none of your current stack items have a matched evidence score yet, so I cannot reliably rank one to remove. Start by reviewing lower-priority items like ${names}.`;
  }

  const sorted = known
    .slice()
    .sort((a, b) => a.evidenceScore - b.evidenceScore);
  const primary = sorted[0];
  const alternates = sorted.slice(1, 3);

  const alternateText = alternates.length
    ? ` Next lowest-evidence options are ${alternates
        .map((item) => `${item.name} (${item.evidenceScore}/100)`)
        .join(" and ")}.`
    : "";
  const unknownText = unknown.length
    ? " Some stack items are unrated in Suppro evidence data, so review those separately."
    : "";

  return `Based on Suppro evidence collected for your current stack, the first supplement to review for removal is ${primary.name} (${primary.evidenceScore}/100), since it has the lowest evidence score among rated items.${alternateText}${unknownText}`;
}

export function fallbackSymptomRecommendationReply(question, stats) {
  const byBenefit = stats?.evidenceCatalog?.byBenefit;
  const benefitRoutes = stats?.evidenceCatalog?.benefitRoutes;
  if (!byBenefit || typeof byBenefit !== "object") return null;
  const q = normalizeText(question);
  if (!q) return null;

  const benefitEntries = Object.entries(byBenefit)
    .map(([label, rawItems]) => {
      const items = Array.isArray(rawItems)
        ? rawItems
            .map((item) => ({
              name: typeof item?.name === "string" ? item.name : null,
            }))
            .filter((item) => item.name)
        : [];
      return { label, items };
    })
    .filter((entry) => entry.items.length > 0);

  if (!benefitEntries.length) return null;

  const scored = benefitEntries.map((entry) => {
    const labelText = normalizeText(entry.label);
    const labelTokens = labelText
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 4);
    const tokenHits = labelTokens.reduce(
      (count, token) => count + (q.includes(token) ? 1 : 0),
      0
    );
    const directHit = q.includes(labelText) ? 2 : 0;
    return {
      ...entry,
      score: tokenHits + directHit,
    };
  });
  const sortedByMatch = scored.slice().sort((a, b) => b.score - a.score);
  const best = sortedByMatch[0];

  if (!best || best.score <= 0) return null;

  const topItems = best.items.slice(0, 3);
  if (!topItems.length) {
    return `I do not see ranked supplements with supporting evidence backing in Suppro for ${best.label} yet.`;
  }

  const rankedText = topItems.map((item) => item.name).join(", ");
  const route =
    benefitRoutes &&
    typeof benefitRoutes === "object" &&
    typeof benefitRoutes[best.label] === "string"
      ? benefitRoutes[best.label]
      : `/benefit-ranking?label=${encodeURIComponent(best.label)}`;

  return `The most evidence-backed supplements for ${best.label} are ${rankedText}. For more information, find our ${best.label} ranking table here: ${route}`;
}

export function fallbackHealthTrackingReply(question, stats) {
  const entries = getHealthEntries(stats);
  if (!entries.length) {
    return buildMissingHealthDataReply(question, stats);
  }

  const grouped = groupEntriesByType(entries);
  const metricMap = buildMetricMap(stats);
  const relevantKeys = findRelevantMetricKeys(question, grouped, metricMap);

  if (!relevantKeys.length) {
    return buildNoRelevantMetricReply(question, grouped, metricMap);
  }

  const summaries = relevantKeys
    .map((key) => describeMetric(key, grouped[key] ?? [], metricMap))
    .filter(Boolean)
    .slice(0, 3);

  if (!summaries.length) {
    return buildNoRelevantMetricReply(question, grouped, metricMap);
  }

  const hasAppleHealthData = entries.some((entry) => entry?.source === "apple_health");
  const intro = normalizeText(question).includes("apple health") && hasAppleHealthData
    ? "From the Apple Health data currently in Suppro, "
    : "From your recent tracked data, ";

  return `${intro}${summaries.join("; ")}. If you want, I can also help you interpret how those trends relate to your supplement routine, recovery, or consistency.`;
}

function isRefusalLikeReply(reply) {
  const normalized = normalizeText(reply);
  if (!normalized) return true;

  return (
    normalized.includes("i can only help") ||
    normalized.includes("supplements and suppro supplement data") ||
    normalized.includes("supplements and suppro data")
  );
}

export function resolveAiChatResult({ question, stats, parsedDecision, parsedReply }) {
  const replyText = trimString(parsedReply);
  let decision = parsedDecision === "answer" ? "answer" : "refuse";
  let reply = replyText;

  if (!reply || isRefusalLikeReply(reply)) {
    decision = "refuse";
  }

  if (decision === "refuse" && isStackOptimizationQuestion(question)) {
    const fallback = fallbackStackOptimizationReply(stats);
    if (fallback) {
      return { decision: "answer", reply: fallback };
    }
  }

  if (decision === "refuse" && isSymptomRecommendationQuestion(question)) {
    const fallback = fallbackSymptomRecommendationReply(question, stats);
    if (fallback) {
      return { decision: "answer", reply: fallback };
    }
  }

  if (decision === "refuse" && isHealthTrackingQuestion(question)) {
    return {
      decision: "answer",
      reply: fallbackHealthTrackingReply(question, stats),
    };
  }

  if (decision === "refuse" && isSupplementContextQuestion(question, stats)) {
    return {
      decision: "answer",
      reply: fallbackSupplementContextReply(question, stats),
    };
  }

  if (decision === "refuse") {
    return {
      decision: "refuse",
      reply: CHAT_REFUSAL_MESSAGE,
    };
  }

  return {
    decision: "answer",
    reply,
  };
}
