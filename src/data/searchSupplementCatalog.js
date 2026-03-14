import { getScopedSupabase, supabase as publicSupabase } from "@src/lib/supabase";
export async function searchSupplementCatalog(query) {
    if (!query.trim())
        return [];
    const [official, user] = await Promise.all([
        publicSupabase
            .from("supplements")
            .select("id, name")
            .ilike("name", `%${query}%`)
            .order("name")
            .limit(12),
        (await getScopedSupabase())
            .from("user_supplements")
            .select("id, name")
            .ilike("name", `%${query}%`)
            .order("name")
            .limit(12),
    ]);
    if (official.error)
        console.error("supplements search failed", official.error);
    if (user.error)
        console.error("user_supplements search failed", user.error);
    const officialResults = official.data?.map((row) => ({ ...row, verified: true })) ?? [];
    const userResults = user.data?.map((row) => ({
        id: `user-${row.id}`,
        name: row.name,
        verified: false,
    })) ?? [];
    return [...officialResults, ...userResults];
}
