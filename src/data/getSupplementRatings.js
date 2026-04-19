import { isActiveIngredientCatalogId } from "@/features/supplements/catalog";
import { supabase } from "@src/lib/supabase";
/**
 * Fetch evidence_score for a set of supplement catalog IDs.
 */
export async function getSupplementRatings(ids) {
    const officialIds = Array.from(new Set(ids.filter((id) => isActiveIngredientCatalogId(id))));
    if (officialIds.length === 0)
        return {};
    const { data, error } = await supabase
        .from("supplements")
        .select("id, evidence_score")
        .in("id", officialIds);
    if (error) {
        console.error("Failed to fetch supplement ratings", error);
        return {};
    }
    return (data ?? []).reduce((acc, row) => {
        if (typeof row.id === "string" && typeof row.evidence_score === "number") {
            acc[row.id] = row.evidence_score;
        }
        return acc;
    }, {});
}
