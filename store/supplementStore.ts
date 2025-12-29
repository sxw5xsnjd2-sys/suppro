import { create } from "zustand";
import { persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SupplementRoute } from "@/types/Supplement";

/* ----------------------------------------
   Types
----------------------------------------- */

export type Supplement = {
  id: string;
  name: string;
  dose?: string;
  time: string; // display "HH:mm"
  timeMinutes: number; // minutes since midnight
  route: SupplementRoute;
  daysOfWeek: number[];
};

type SupplementStore = {
  supplements: Supplement[];

  // ✅ taken state is now date-scoped
  takenTimesByDate: Record<
    string, // YYYY-MM-DD
    Record<string, string> // supplementId → time taken
  >;

  selectedDate: string;

  setSelectedDate: (date: string) => void;

  addSupplement: (s: Supplement) => void;
  updateSupplement: (id: string, updates: Partial<Supplement>) => void;
  toggleTaken: (id: string) => void;
  deleteSupplement: (id: string) => void;
};

/* ----------------------------------------
   Helpers
----------------------------------------- */

const today = () => new Date().toISOString().split("T")[0];

const timeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
};

/* ----------------------------------------
   Store
----------------------------------------- */

export const useSupplementsStore = create<SupplementStore>()(
  persist(
    (set, get) => ({
      supplements: [
        {
          id: "1",
          name: "Omega 3",
          dose: "1 capsule",
          time: "08:00",
          timeMinutes: 8 * 60,
          route: "tablet",
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        },
      ],

      takenTimesByDate: {},
      selectedDate: today(),

      /* ---------- Actions ---------- */

      setSelectedDate: (date) =>
        set(() => ({
          selectedDate: date,
        })),

      addSupplement: (s) =>
        set((state) => ({
          supplements: [...state.supplements, s],
        })),

      updateSupplement: (id, updates) =>
        set((state) => ({
          supplements: state.supplements.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      toggleTaken: (id) =>
        set((state) => {
          const date = state.selectedDate;
          const now = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          const dayMap = state.takenTimesByDate[date] ?? {};
          const updatedDay = { ...dayMap };

          if (updatedDay[id]) {
            delete updatedDay[id];
          } else {
            updatedDay[id] = now;
          }

          return {
            takenTimesByDate: {
              ...state.takenTimesByDate,
              [date]: updatedDay,
            },
          };
        }),

      deleteSupplement: (id) =>
        set((state) => ({
          supplements: state.supplements.filter((s) => s.id !== id),
          takenTimesByDate: Object.fromEntries(
            Object.entries(state.takenTimesByDate).map(([date, map]) => [
              date,
              Object.fromEntries(
                Object.entries(map).filter(([key]) => key !== id)
              ),
            ])
          ),
        })),
    }),
    {
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
        if (!state) return;

        // Backfill timeMinutes for older persisted supplements
        state.supplements = state.supplements.map((s) => {
          const withTime =
            typeof s.timeMinutes === "number"
              ? s
              : { ...s, timeMinutes: timeToMinutes(s.time) };

          // Ensure daysOfWeek exists for older records
          return Array.isArray(withTime.daysOfWeek)
            ? withTime
            : { ...withTime, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
        });
      },
    }
  )
);
