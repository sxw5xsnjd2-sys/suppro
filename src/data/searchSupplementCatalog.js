import { CATALOG_TYPES, createSupplementProductCatalogId } from "@/features/supplements/catalog";
import { supabase } from "@src/lib/supabase";
export async function searchSupplementCatalog(query) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return [];
    }
    const [activeIngredients, supplementProducts] = await Promise.all([
        supabase
            .from("supplements")
            .select("id, name")
            .eq("status", "approved")
            .ilike("name", `%${trimmedQuery}%`)
            .order("name")
            .limit(12),
        supabase
            .from("supplement_products_master")
            .select("product_id, display_name")
            .ilike("display_name", `%${trimmedQuery}%`)
            .order("display_name")
            .limit(12),
    ]);
    if (activeIngredients.error) {
        console.error("supplements search failed", activeIngredients.error);
    }
    if (supplementProducts.error) {
        console.error("supplement_products_master search failed", supplementProducts.error);
    }

    const productResults = (supplementProducts.data ?? []).map((row) => ({
        id: createSupplementProductCatalogId(row.product_id),
        name: row.display_name,
        catalogType: CATALOG_TYPES.SUPPLEMENT_PRODUCT,
    }));

    if (productResults.length > 0) {
        return [
            {
                key: "supplements",
                title: "Supplements",
                data: productResults,
            },
        ];
    }

    return [
        {
            key: "active-ingredients",
            title: "Active ingredients",
            data: (activeIngredients.data ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
            })),
        },
    ].filter((section) => section.data.length > 0);
}
