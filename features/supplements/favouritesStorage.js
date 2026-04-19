import { isLegacyCustomCatalogId } from "@/features/supplements/catalog";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const HEART_STORE_KEY = "supplement-heart-flags";

const parseHeartRecord = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (err) {
    console.error("Failed to parse heart storage", err);
    return {};
  }
};

export async function getHeartFlags() {
  try {
    const raw = await AsyncStorage.getItem(HEART_STORE_KEY);
    return parseHeartRecord(raw);
  } catch (err) {
    console.error("Failed to load heart state", err);
    return {};
  }
}

export async function isSupplementHearted(supplementId) {
  if (!supplementId) return false;
  const flags = await getHeartFlags();
  return Boolean(flags[supplementId]);
}

export async function setSupplementHearted(supplementId, hearted) {
  if (!supplementId) return;
  const flags = await getHeartFlags();
  if (hearted) {
    flags[supplementId] = true;
  } else {
    delete flags[supplementId];
  }
  try {
    await AsyncStorage.setItem(HEART_STORE_KEY, JSON.stringify(flags));
  } catch (err) {
    console.error("Failed to persist heart", err);
  }
}

export async function getHeartedSupplementIds() {
  const flags = await getHeartFlags();
  return Object.keys(flags).filter((id) => Boolean(flags[id]));
}

export async function cleanupLegacyHeartFlags() {
  const flags = await getHeartFlags();
  const nextFlags = Object.fromEntries(
    Object.entries(flags).filter(
      ([id, hearted]) => Boolean(hearted) && !isLegacyCustomCatalogId(id)
    )
  );

  if (JSON.stringify(nextFlags) === JSON.stringify(flags)) {
    return;
  }

  try {
    await AsyncStorage.setItem(HEART_STORE_KEY, JSON.stringify(nextFlags));
  } catch (err) {
    console.error("Failed to clean up legacy heart flags", err);
  }
}
