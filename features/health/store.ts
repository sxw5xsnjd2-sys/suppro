import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { HealthEntry, MetricRegistryItem } from "@/features/health/types";

type HealthState = {
  entries: HealthEntry[];
  metrics: MetricRegistryItem[];

  addEntry: (entry: HealthEntry) => void;
  deleteEntry: (id: string) => void;

  addMetric: (metric: MetricRegistryItem) => void;
  enableMetric: (key: string) => void;
  deleteMetric: (key: string) => void;
};

export const useHealthStore = create<HealthState>()(
  persist(
    (set) => ({
      // ─────────────────────────────────────────────
      // State
      // ─────────────────────────────────────────────
      entries: [],

      metrics: [
        { key: "sleep", label: "Sleep", enabled: true },
        { key: "mood", label: "Mood", enabled: true },
        { key: "energy", label: "Energy", enabled: true },
        { key: "stress", label: "Stress", enabled: true },
      ],

      // ─────────────────────────────────────────────
      // Entry actions
      // ─────────────────────────────────────────────
      addEntry: (entry) =>
        set((state) => ({
          entries: [...state.entries, entry],
        })),

      deleteEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        })),

      // ─────────────────────────────────────────────
      // Metric registry actions
      // ─────────────────────────────────────────────
      addMetric: (metric) =>
        set((state) => {
          const exists = state.metrics.some((m) => m.key === metric.key);

          if (exists) return state;

          return {
            metrics: [...state.metrics, metric],
          };
        }),

      enableMetric: (key) =>
        set((state) => ({
          metrics: state.metrics.map((m) =>
            m.key === key ? { ...m, enabled: true } : m
          ),
        })),

      deleteMetric: (key) =>
        set((state) => ({
          metrics: state.metrics.filter((m) => m.key !== key),
          entries: state.entries.filter((e) => e.type !== key),
        })),
    }),
    {
      name: "health-store",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
