import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persist, createJSONStorage } from "zustand/middleware";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string; // ISO string
};

export type ChatStatus = "idle" | "loading" | "error";

type ChatState = {
  messages: ChatMessage[];
  status: ChatStatus;
  error?: string;

  addMessage: (msg: Omit<ChatMessage, "id" | "createdAt">) => void;
  setStatus: (status: ChatStatus, error?: string) => void;
  clearMessages: () => void;
};

const STORAGE_KEY = "suppro.chatStore.v1";

const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      status: "idle",
      error: undefined,

      addMessage: (msg) =>
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: makeId(),
              role: msg.role,
              content: msg.content,
              createdAt: new Date().toISOString(),
            },
          ],
        })),

      setStatus: (status, error) => set({ status, error }),

      clearMessages: () =>
        set({ messages: [], status: "idle", error: undefined }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist messages + status; omit transient error if you prefer
      partialize: (state) => ({
        messages: state.messages,
        status: state.status,
      }),
    }
  )
);
