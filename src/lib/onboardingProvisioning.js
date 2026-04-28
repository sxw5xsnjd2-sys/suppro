import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PRESET_METRICS_BY_KEY,
  normalizeMetric,
} from "@/features/health/metricDefinitions";
import { useHealthStore } from "@/features/health/store";
import { useSupplementsStore } from "@/features/supplements/store";
import { questionnaireWeightKg } from "@src/lib/account";
import { getQuestionnaireAnswers } from "@src/lib/onboarding";
import { hasNonAnonymousUser } from "@src/lib/authState";
import { matchSupplementCatalogName } from "@src/data/matchSupplementCatalog";
import { getSupplementById } from "@src/data/getSupplement";
import { normalizeSupplementSchedule } from "@/features/supplements/schedule";

const PROVISIONING_KEY_PREFIX = "suppro.onboarding.provisioned.v1";
const ONBOARDING_HEALTH_ENTRY_ID_PREFIX = "onboarding:health";
const provisioningByUserId = new Map();

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function todayYYYYMMDD() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTextKey(value) {
  return trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function provisioningKeyForUser(userId) {
  return `${PROVISIONING_KEY_PREFIX}:${userId}`;
}

function onboardingHealthEntryId(metricKey, userId, completedAt) {
  return `${ONBOARDING_HEALTH_ENTRY_ID_PREFIX}:${metricKey}:${userId}:${completedAt}`;
}

function isOnboardingHealthEntry(entry, metricKey) {
  return (
    entry?.type === metricKey &&
    typeof entry?.id === "string" &&
    entry.id.startsWith(
      `${ONBOARDING_HEALTH_ENTRY_ID_PREFIX}:${metricKey}:`
    )
  );
}

function normalizeSupplementRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object")
    .map((row, index) => ({
      id: trimString(row.id) || `row-${index}`,
      name: trimString(row.name),
      dose: trimString(row.dose),
      ...normalizeSupplementSchedule(row),
    }))
    .filter((row) => row.name);
}

function timingForPreference(value) {
  if (value === "dinner") {
    return { time: "18:00", timeMinutes: 18 * 60 };
  }
  if (value === "whenever") {
    return { time: "09:00", timeMinutes: 9 * 60 };
  }
  return { time: "08:00", timeMinutes: 8 * 60 };
}

function hasProvisionedSupplement(existingSupplements, row, match) {
  const rowNameKey = normalizeTextKey(row.name);
  const matchNameKey = normalizeTextKey(match.name);
  return (existingSupplements ?? []).some((supplement) => {
    if (
      supplement?.source === "onboarding" &&
      supplement.onboardingRowId &&
      supplement.onboardingRowId === row.id
    ) {
      return true;
    }

    if (supplement.catalogId !== match.id) {
      return false;
    }

    return [supplement.matchedFromName, supplement.name]
      .map((value) => normalizeTextKey(value))
      .some(
        (value) =>
          value && (value === rowNameKey || value === matchNameKey)
    );
  });
}

async function buildSupplementFromMatch(row, match, answers) {
  const timing = timingForPreference(answers?.supplementTiming);
  const startDate = todayYYYYMMDD();
  const schedule = normalizeSupplementSchedule(row, {
    anchorDate: row.scheduleAnchorDate || startDate,
  });
  const idPart = String(match.id).replace(/[^a-zA-Z0-9:_-]+/g, "-");
  const catalogSupplement = await getSupplementById(match.id, match.name).catch(
    (error) => {
      console.error("Failed to hydrate onboarding supplement match", error);
      return null;
    }
  );
  const evidenceScore = Number.isFinite(catalogSupplement?.evidence_score)
    ? catalogSupplement.evidence_score
    : Number.isFinite(match.evidenceScore)
    ? match.evidenceScore
    : null;
  const linkedIngredients = Array.isArray(catalogSupplement?.matchedIngredients)
    ? catalogSupplement.matchedIngredients
    : null;
  const servingSizeText = trimString(catalogSupplement?.serving_size_text);

  const supplement = {
    id: `onboarding:${row.id}:${idPart}`,
    name: match.name,
    catalogId: match.id,
    catalogType: match.catalogType,
    dose: row.dose || undefined,
    route: "tablet",
    ...schedule,
    startDate,
    endDate: null,
    ...timing,
    source: "onboarding",
    onboardingRowId: row.id,
    matchedFromName: row.name,
    matchScore: match.matchScore,
  };

  if (Number.isFinite(evidenceScore)) {
    supplement.evidenceScore = evidenceScore;
  }

  if (linkedIngredients?.length) {
    supplement.linkedIngredients = linkedIngredients;
  }

  if (servingSizeText) {
    supplement.servingSizeText = servingSizeText;
  }

  return supplement;
}

async function hasProvisionedCompletedAt(userId, completedAt) {
  if (!completedAt) return false;
  const raw = await AsyncStorage.getItem(provisioningKeyForUser(userId));
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.completedAt === completedAt;
  } catch {
    return false;
  }
}

async function markProvisioned(userId, answers, result) {
  await AsyncStorage.setItem(
    provisioningKeyForUser(userId),
    JSON.stringify({
      completedAt: answers.completedAt,
      provisionedAt: new Date().toISOString(),
      matchedSupplementCount: result.matchedSupplementCount,
      unmatchedSupplementCount: result.unmatchedSupplementCount,
      enabledMetricCount: result.enabledMetricCount,
    })
  );
}

function seedWeightEntryFromOnboarding(user, answers) {
  const weightKg = questionnaireWeightKg(answers);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !answers?.completedAt) {
    return;
  }

  const completedDate = String(answers.completedAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) {
    return;
  }

  const { entries, addEntry, deleteEntry } = useHealthStore.getState();
  const weightEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry?.type === "weight")
    : [];
  const nonOnboardingWeightEntries = weightEntries.filter(
    (entry) => !isOnboardingHealthEntry(entry, "weight")
  );

  if (nonOnboardingWeightEntries.length > 0) {
    return;
  }

  const nextEntryId = onboardingHealthEntryId("weight", user.id, answers.completedAt);
  const existingSeedEntry = weightEntries.find((entry) => entry?.id === nextEntryId);
  if (
    existingSeedEntry &&
    Number(existingSeedEntry.value) === weightKg &&
    existingSeedEntry.date === completedDate
  ) {
    return;
  }

  weightEntries
    .filter((entry) => isOnboardingHealthEntry(entry, "weight"))
    .forEach((entry) => {
      deleteEntry(entry.id);
    });

  addEntry({
    id: nextEntryId,
    type: "weight",
    value: weightKg,
    date: completedDate,
    note: "From onboarding",
  });
}

async function provisionOnboardingSelectionsForUser(user) {
  if (!hasNonAnonymousUser(user)) {
    return {
      enabledMetricCount: 0,
      matchedSupplementCount: 0,
      unmatchedSupplementCount: 0,
    };
  }

  const answers = await getQuestionnaireAnswers();
  if (!answers?.completedAt) {
    return {
      enabledMetricCount: 0,
      matchedSupplementCount: 0,
      unmatchedSupplementCount: 0,
    };
  }

  seedWeightEntryFromOnboarding(user, answers);

  if (await hasProvisionedCompletedAt(user.id, answers.completedAt)) {
    return {
      enabledMetricCount: 0,
      matchedSupplementCount: 0,
      unmatchedSupplementCount: 0,
    };
  }

  const addMetric = useHealthStore.getState().addMetric;
  const selectedMetricKeys = Array.isArray(answers.trackMetrics)
    ? answers.trackMetrics
    : [];
  const enabledMetricKeys = Array.from(new Set(selectedMetricKeys)).filter(
    (metricKey) => PRESET_METRICS_BY_KEY[metricKey]
  );

  enabledMetricKeys.forEach((metricKey) => {
    addMetric({
      ...normalizeMetric(PRESET_METRICS_BY_KEY[metricKey]),
      enabled: true,
    });
  });

  const addSupplement = useSupplementsStore.getState().addSupplement;
  const rows = normalizeSupplementRows(answers.supplementRows);
  let matchedSupplementCount = 0;
  let unmatchedSupplementCount = 0;

  for (const row of rows) {
    const match = await matchSupplementCatalogName(row.name);
    if (!match) {
      unmatchedSupplementCount += 1;
      continue;
    }

    const existingSupplements = useSupplementsStore.getState().supplements;
    if (!hasProvisionedSupplement(existingSupplements, row, match)) {
      addSupplement(await buildSupplementFromMatch(row, match, answers));
      matchedSupplementCount += 1;
    }
  }

  const result = {
    enabledMetricCount: enabledMetricKeys.length,
    matchedSupplementCount,
    unmatchedSupplementCount,
  };
  await markProvisioned(user.id, answers, result);
  return result;
}

export async function provisionOnboardingSelections(user) {
  if (!hasNonAnonymousUser(user)) {
    return undefined;
  }

  const existing = provisioningByUserId.get(user.id);
  if (existing) {
    return existing;
  }

  const provisioning = provisionOnboardingSelectionsForUser(user).finally(() => {
    provisioningByUserId.delete(user.id);
  });
  provisioningByUserId.set(user.id, provisioning);
  return provisioning;
}
