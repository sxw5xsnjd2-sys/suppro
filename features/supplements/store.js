import { create } from "zustand";
import { persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { reconcileSupplementCatalogIds } from "@src/data/reconcileSupplementCatalogIds";
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
    const [h, m] = time.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m))
        return 0;
    return h * 60 + m;
};
/* ----------------------------------------
   Store
----------------------------------------- */
export const useSupplementsStore = create()(persist((set, get) => ({
    supplements: [
        {
            id: "local-creatine",
            catalogId: "948a9744-85f8-4987-9f09-40db85e4e188",
            name: "Creatine",
            dose: "5 g",
            time: "08:00",
            timeMinutes: 8 * 60,
            route: "powder",
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            startDate: today(),
            endDate: null,
        },
    ],
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
    name: "supplement-store",
    storage: {
        getItem: async (key) => {
            const raw = await AsyncStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        },
        setItem: async (key, value) => {
            await AsyncStorage.setItem(key, JSON.stringify(value));
        },
        removeItem: async (key) => {
            await AsyncStorage.removeItem(key);
        },
    },
    /* ---------- Rehydration & Migration ---------- */
    onRehydrateStorage: () => (state) => {
        if (!state?.supplements)
            return;
        let didMigrate = false;
        const migrated = state.supplements.map((s) => {
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
            return updated;
        });
        const nextSupplements = didMigrate ? migrated : state.supplements;
        if (didMigrate) {
            useSupplementsStore.setState({ supplements: nextSupplements });
        }
        reconcileSupplementCatalogIds(nextSupplements)
            .then((reconciled) => {
            if (reconciled) {
                useSupplementsStore.setState({ supplements: reconciled });
            }
        })
            .catch((error) => {
            console.error("Failed to reconcile supplement catalog IDs", error);
        });
    },
}));
