import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_METRICS, normalizeMetric } from "./metricDefinitions";
export const useHealthStore = create()(persist((set) => ({
    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────
    entries: [],
    metrics: DEFAULT_METRICS.map((metric) => ({ ...metric })),
    // ─────────────────────────────────────────────
    // Entry actions
    // ─────────────────────────────────────────────
    addEntry: (entry) => set((state) => ({
        entries: [...state.entries, entry],
    })),
    deleteEntry: (id) => set((state) => ({
        entries: state.entries.filter((e) => e.id !== id),
    })),
    // ─────────────────────────────────────────────
    // Metric registry actions
    // ─────────────────────────────────────────────
    addMetric: (metric) => set((state) => {
        const normalized = normalizeMetric(metric);
        if (!normalized?.key)
            return state;
        const exists = state.metrics.some((m) => m.key === normalized.key);
        if (exists) {
            return {
                metrics: state.metrics.map((m) => m.key === normalized.key
                    ? { ...m, ...normalized, enabled: true }
                    : m),
            };
        }
        return {
            metrics: [...state.metrics, normalized],
        };
    }),
    enableMetric: (key) => set((state) => ({
        metrics: state.metrics.map((m) => m.key === key ? { ...m, enabled: true } : m),
    })),
    deleteMetric: (key) => set((state) => ({
        metrics: state.metrics.filter((m) => m.key !== key),
        entries: state.entries.filter((e) => e.type !== key),
    })),
}), {
    name: "health-store",
    storage: createJSONStorage(() => AsyncStorage),
}));
