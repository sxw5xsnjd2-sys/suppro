import { create } from "zustand";
import { persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasNonAnonymousUser } from "@src/lib/authState";
import {
  getCatalogType,
  isLegacyCustomCatalogId,
} from "@/features/supplements/catalog";
import { cleanupLegacyHeartFlags } from "@/features/supplements/favouritesStorage";
import { normalizeSupplementSchedule } from "@/features/supplements/schedule";
import { getSupplementLinkedIngredients } from "@/features/supplements/trackedScanContext";
/* ----------------------------------------
   Helpers
----------------------------------------- */
const today = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
const timeToMinutes = (time) => {
    if (typeof time !== "string")
        return 0;
    const [h, m] = time.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m))
        return 0;
    return h * 60 + m;
};
const SUPPLEMENT_STORE_KEY_PREFIX = "supplement-store";
const GUEST_SUPPLEMENT_STORE_KEY = `${SUPPLEMENT_STORE_KEY_PREFIX}:guest`;
const SEEDED_CREATINE_SUPPLEMENT_ID = "local-creatine";
let currentSupplementStoreKey = null;
let supplementStoreScopeSync = Promise.resolve();
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sanitizeTakenTimesByDate = (value) => {
    if (!isPlainObject(value))
        return {};
    return Object.fromEntries(Object.entries(value)
        .filter(([, entries]) => isPlainObject(entries))
        .map(([date, entries]) => [
        date,
        Object.fromEntries(Object.entries(entries).filter(([, time]) => typeof time === "string")),
    ]));
};
const sanitizePersistedStoreValue = (parsed) => {
    if (!isPlainObject(parsed) || !isPlainObject(parsed.state))
        return null;
    const state = {};
    if (Array.isArray(parsed.state.supplements)) {
        state.supplements = parsed.state.supplements.filter(isPlainObject);
    }
    if (isPlainObject(parsed.state.takenTimesByDate)) {
        state.takenTimesByDate = sanitizeTakenTimesByDate(parsed.state.takenTimesByDate);
    }
    const value = { state };
    if (typeof parsed.version === "number") {
        value.version = parsed.version;
    }
    return value;
};
const getSupplementStoreKeyForUser = (user) => hasNonAnonymousUser(user)
    ? `${SUPPLEMENT_STORE_KEY_PREFIX}:account:${user.id}`
    : GUEST_SUPPLEMENT_STORE_KEY;
const mergePersistedSupplementState = (persistedState, currentState) => {
    const safePersistedState = isPlainObject(persistedState) ? persistedState : {};
    return {
        ...currentState,
        supplements: Array.isArray(safePersistedState.supplements)
            ? safePersistedState.supplements
            : [],
        takenTimesByDate: sanitizeTakenTimesByDate(safePersistedState.takenTimesByDate),
        selectedDate: today(),
    };
};
/* ----------------------------------------
   Store
----------------------------------------- */
export const useSupplementsStore = create()(persist((set) => ({
    supplements: [],
    takenTimesByDate: {},
    selectedDate: today(),
    /* ---------- Actions ---------- */
    setSelectedDate: (date) => set(() => ({
        selectedDate: date,
    })),
    addSupplement: (s) => set((state) => ({
        supplements: [
            ...state.supplements,
            {
                ...s,
                ...normalizeSupplementSchedule(s, {
                    anchorDate: s.scheduleAnchorDate ?? s.startDate ?? today(),
                }),
                catalogType: s.catalogType ?? getCatalogType(s.catalogId),
                startDate: s.startDate ?? today(),
                endDate: s.endDate ?? null,
            },
        ],
    })),
    updateSupplement: (id, updates) => set((state) => ({
        supplements: state.supplements.map((s) => s.id === id ? { ...s, ...updates } : s),
    })),
    toggleTaken: (id) => set((state) => {
        const date = state.selectedDate;
        const now = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
        const dayMap = state.takenTimesByDate[date] ?? {};
        const updatedDay = { ...dayMap };
        if (updatedDay[id]) {
            delete updatedDay[id];
        }
        else {
            updatedDay[id] = now;
        }
        return {
            takenTimesByDate: {
                ...state.takenTimesByDate,
                [date]: updatedDay,
            },
        };
    }),
    deleteSupplement: (id) => set((state) => ({
        supplements: state.supplements.filter((s) => s.id !== id),
        takenTimesByDate: Object.fromEntries(Object.entries(state.takenTimesByDate).map(([date, map]) => [
            date,
            Object.fromEntries(Object.entries(map).filter(([key]) => key !== id)),
        ])),
    })),
}), {
    name: GUEST_SUPPLEMENT_STORE_KEY,
    storage: {
        getItem: async (key) => {
            try {
                const raw = await AsyncStorage.getItem(key);
                if (!raw)
                    return null;
                return sanitizePersistedStoreValue(JSON.parse(raw));
            }
            catch (error) {
                console.error("Failed to load supplement store", error);
                return null;
            }
        },
        setItem: async (key, value) => {
            await AsyncStorage.setItem(key, JSON.stringify(value));
        },
        removeItem: async (key) => {
            await AsyncStorage.removeItem(key);
        },
    },
    partialize: (state) => ({
        supplements: state.supplements,
        takenTimesByDate: state.takenTimesByDate,
    }),
    merge: mergePersistedSupplementState,
    skipHydration: true,
    /* ---------- Rehydration & Migration ---------- */
    onRehydrateStorage: () => (state) => {
        if (!Array.isArray(state?.supplements))
            return;
        let didMigrate = false;
        const migrated = state.supplements
            .map((s) => {
            if (!isPlainObject(s)) {
                didMigrate = true;
                return null;
            }
            if (s.id === SEEDED_CREATINE_SUPPLEMENT_ID) {
                didMigrate = true;
                return null;
            }
            if (isLegacyCustomCatalogId(s?.catalogId)) {
                didMigrate = true;
                return null;
            }
            let updated = s;
            if (typeof updated.timeMinutes !== "number") {
                updated = { ...updated, timeMinutes: timeToMinutes(updated.time) };
                didMigrate = true;
            }
            if (!Array.isArray(updated.daysOfWeek)) {
                updated = { ...updated, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
                didMigrate = true;
            }
            const startDate = updated.startDate ?? updated.createdAt;
            if (!startDate) {
                updated = { ...updated, startDate: today() };
                didMigrate = true;
            }
            else if (!updated.startDate) {
                updated = { ...updated, startDate };
                didMigrate = true;
            }
            if (updated.endDate === undefined) {
                updated = { ...updated, endDate: null };
                didMigrate = true;
            }
            const normalizedSchedule = normalizeSupplementSchedule(updated, {
                anchorDate: updated.scheduleAnchorDate ?? updated.startDate ?? today(),
            });
            if (JSON.stringify({
                frequency: updated.frequency,
                frequencyLabel: updated.frequencyLabel,
                scheduleType: updated.scheduleType,
                daysOfWeek: updated.daysOfWeek,
                intervalDays: updated.intervalDays,
                scheduleAnchorDate: updated.scheduleAnchorDate,
            }) !==
                JSON.stringify(normalizedSchedule)) {
                updated = { ...updated, ...normalizedSchedule };
                didMigrate = true;
            }
            const derivedCatalogType = getCatalogType(updated.catalogId);
            if (derivedCatalogType && updated.catalogType !== derivedCatalogType) {
                updated = { ...updated, catalogType: derivedCatalogType };
                didMigrate = true;
            }
            const linkedIngredients = getSupplementLinkedIngredients(updated);
            if (linkedIngredients.length > 0 &&
                JSON.stringify(updated.linkedIngredients ?? []) !==
                    JSON.stringify(linkedIngredients)) {
                updated = { ...updated, linkedIngredients };
                didMigrate = true;
            }
            return updated;
        })
            .filter(Boolean);
        const validSupplementIds = new Set(migrated.map((supplement) => supplement.id));
        const safeTakenTimesByDate = sanitizeTakenTimesByDate(state.takenTimesByDate);
        const nextTakenTimesByDate = Object.fromEntries(Object.entries(safeTakenTimesByDate).map(([date, entries]) => [
            date,
            Object.fromEntries(Object.entries(entries).filter(([id]) => validSupplementIds.has(id))),
        ]));
        const takenTimesChanged = JSON.stringify(nextTakenTimesByDate) !==
            JSON.stringify(safeTakenTimesByDate);
        if (didMigrate || takenTimesChanged) {
            useSupplementsStore.setState({
                supplements: migrated,
                takenTimesByDate: nextTakenTimesByDate,
            });
        }
        cleanupLegacyHeartFlags().catch((error) => {
            console.error("Failed to clean up legacy heart flags", error);
        });
    },
}));
export async function syncSupplementsStoreAccountScope(user) {
    const nextStoreKey = getSupplementStoreKeyForUser(user);
    supplementStoreScopeSync = supplementStoreScopeSync.catch(() => undefined).then(async () => {
        if (currentSupplementStoreKey === nextStoreKey &&
            useSupplementsStore.persist.hasHydrated()) {
            return;
        }
        useSupplementsStore.persist.setOptions({ name: nextStoreKey });
        currentSupplementStoreKey = nextStoreKey;
        await useSupplementsStore.persist.rehydrate();
    });
    return supplementStoreScopeSync;
}
