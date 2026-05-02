import { create } from "zustand";

export const useToastStore = create((set) => ({
  message: null,
  target: "global",
  show: (message, target = "global") => set({ message, target }),
  clear: () => set({ message: null, target: "global" }),
}));
