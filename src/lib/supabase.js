import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getClientId } from "./clientId";
import { hasNonAnonymousSession } from "./authState";
import {
  assertSupabaseConfig,
  logSupabaseRuntimeDiagnostics,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from "./runtimeConfig";
if (__DEV__) {
  logSupabaseRuntimeDiagnostics();
}
assertSupabaseConfig();
const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;
// Default client (no per-user header); keep for legacy usage.
const authConfig = {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
};
export const supabase = createClient(supabaseUrl, supabaseAnonKey, authConfig);
const guestSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
// Per-device client used for user-scoped data.
let scopedClientPromise = null;
export async function getScopedSupabase() {
  if (scopedClientPromise) return scopedClientPromise;
  scopedClientPromise = (async () => {
    const clientId = await getClientId();
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          "x-client-id": clientId,
        },
      },
      ...authConfig,
    });
  })();
  return scopedClientPromise;
}

export async function clearAnonymousSessionIfPresent() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const session = sessionData?.session ?? null;
  if (hasNonAnonymousSession(session) || !session?.access_token) {
    return false;
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) throw signOutError;
  return true;
}

export async function getAccessTokenOrCreateSession() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const existingSession = sessionData?.session ?? null;
  const existingToken = existingSession?.access_token;
  if (existingToken && hasNonAnonymousSession(existingSession)) {
    return existingToken;
  }

  const { data: guestSessionData, error: guestSessionError } =
    await guestSupabase.auth.getSession();
  if (guestSessionError) throw guestSessionError;

  const guestToken = guestSessionData?.session?.access_token;
  if (guestToken) return guestToken;

  const { data: anonData, error: anonError } =
    await guestSupabase.auth.signInAnonymously();
  if (anonError) {
    const lowerMessage = String(anonError.message || "").toLowerCase();
    if (lowerMessage.includes("anonymous sign-ins are disabled")) {
      throw new Error(
        "Sign in is required for AI features. Enable Anonymous auth in Supabase (Authentication > Providers > Anonymous) or add a user login flow."
      );
    }
    throw new Error(
      anonError.message ||
        "No active Supabase session. Enable anonymous auth or sign in."
    );
  }
  const nextToken = anonData?.session?.access_token;
  if (!nextToken) {
    throw new Error("Could not establish a Supabase session.");
  }
  return nextToken;
}
