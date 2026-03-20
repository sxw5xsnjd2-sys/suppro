import Constants from "expo-constants";

const manifestExtra = Constants.manifest?.extra ?? {};
const manifest2Extra = Constants.manifest2?.extra?.expoClient?.extra ?? {};
const expoConfigExtra = Constants.expoConfig?.extra ?? {};
const expoGoConfigExtra = Constants.expoGoConfig?.extra ?? {};

function firstNonEmptyString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return "";
}

function describeSource(value, source) {
  return value ? source : "missing";
}

function maskValue(value) {
  if (!value) return "(missing)";
  if (value.length <= 12) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

const processEnvUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
const expoExtraUrl = firstNonEmptyString([
  expoConfigExtra?.supabaseUrl,
  manifestExtra?.supabaseUrl,
  manifest2Extra?.supabaseUrl,
  expoGoConfigExtra?.supabaseUrl,
]);

const processEnvAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const expoExtraAnonKey = firstNonEmptyString([
  expoConfigExtra?.supabaseAnonKey,
  manifestExtra?.supabaseAnonKey,
  manifest2Extra?.supabaseAnonKey,
  expoGoConfigExtra?.supabaseAnonKey,
]);

export const SUPABASE_URL = processEnvUrl || expoExtraUrl;
export const SUPABASE_ANON_KEY = processEnvAnonKey || expoExtraAnonKey;

export function getSupabaseRuntimeDiagnostics() {
  return {
    urlPresent: Boolean(SUPABASE_URL),
    anonKeyPresent: Boolean(SUPABASE_ANON_KEY),
    urlSource: describeSource(SUPABASE_URL, processEnvUrl ? "process.env" : "expo.extra"),
    anonKeySource: describeSource(
      SUPABASE_ANON_KEY,
      processEnvAnonKey ? "process.env" : "expo.extra"
    ),
    urlPreview: maskValue(SUPABASE_URL),
    anonKeyPreview: maskValue(SUPABASE_ANON_KEY),
  };
}

export const MISSING_SUPABASE_CONFIG_MESSAGE =
  "Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY locally and in the EAS build environment, then rebuild the dev client.";

export function logSupabaseRuntimeDiagnostics() {
  const diagnostics = getSupabaseRuntimeDiagnostics();
  console.log("[supabase-config]", diagnostics);
}

export function assertSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    logSupabaseRuntimeDiagnostics();
    throw new Error(MISSING_SUPABASE_CONFIG_MESSAGE);
  }
}
