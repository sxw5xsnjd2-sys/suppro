import AsyncStorage from "@react-native-async-storage/async-storage";
const STORAGE_KEY = "suppro-client-id";
const generateId = () => [
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 8),
].join("-");
export async function getClientId() {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    if (existing)
        return existing;
    const next = generateId();
    await AsyncStorage.setItem(STORAGE_KEY, next);
    return next;
}
