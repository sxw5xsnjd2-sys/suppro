import { create } from "zustand";

export const useToastStore = create((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}));
