import { createClient } from "@supabase/supabase-js";
import { getClientId } from "./clientId";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Default client (no per-user header); keep for legacy usage.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Per-device client used for user-scoped data.
let scopedClientPromise = null;
export async function getScopedSupabase() {
    if (scopedClientPromise)
        return scopedClientPromise;
    scopedClientPromise = (async () => {
        const clientId = await getClientId();
        return createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    "x-client-id": clientId,
                },
            },
        });
    })();
    return scopedClientPromise;
}
