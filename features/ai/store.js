import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persist } from "zustand/middleware";
const STORAGE_KEY = "suppro.chatStore.v1";
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sanitizeChatStoreValue = (parsed) => {
    if (!isPlainObject(parsed) || !isPlainObject(parsed.state))
        return null;
    const state = {
        messages: Array.isArray(parsed.state.messages)
            ? parsed.state.messages.filter(isPlainObject)
            : [],
        status: typeof parsed.state.status === "string" ? parsed.state.status : "idle",
    };
    const value = { state };
    if (typeof parsed.version === "number") {
        value.version = parsed.version;
    }
    return value;
};
const safeChatStorage = {
    getItem: async (key) => {
        try {
            const raw = await AsyncStorage.getItem(key);
            if (!raw)
                return null;
            return sanitizeChatStoreValue(JSON.parse(raw));
        }
        catch (error) {
            console.error("Failed to load chat store", error);
            return null;
        }
    },
    setItem: async (key, value) => {
        await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: async (key) => {
        await AsyncStorage.removeItem(key);
    },
};
export const useChatStore = create()(persist((set) => ({
    messages: [],
    status: "idle",
    error: undefined,
    addMessage: (msg) => set((state) => ({
        messages: [
            ...(Array.isArray(state.messages) ? state.messages : []),
            {
                id: makeId(),
                role: msg.role,
                content: msg.content,
                createdAt: new Date().toISOString(),
            },
        ],
    })),
    setStatus: (status, error) => set({ status, error }),
    clearMessages: () => set({ messages: [], status: "idle", error: undefined }),
}), {
    name: STORAGE_KEY,
    storage: safeChatStorage,
    // Persist messages + status; omit transient error if you prefer
    partialize: (state) => ({
        messages: state.messages,
        status: state.status,
    }),
}));
