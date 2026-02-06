import { supabase } from "@src/lib/supabase";
export async function getSupplementCatalog() {
    const { data, error } = await supabase
        .from("supplements")
        .select("id, name")
        .order("name", { ascending: true });
    if (error) {
        console.error(error);
        return [];
    }
    return data ?? [];
}
