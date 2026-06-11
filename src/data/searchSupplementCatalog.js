import {
    CATALOG_TYPES,
    createCustomSupplementCatalogId,
    createSupplementProductCatalogId,
} from "@/features/supplements/catalog";
import { hasNonAnonymousUser } from "@src/lib/authState";
import { supabase } from "@src/lib/supabase";

function trimString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function toCustomSearchItem(row) {
    const customSupplementId = trimString(row?.id);

    return {
        id: createCustomSupplementCatalogId(customSupplementId),
        customSupplementId,
        name: trimString(row?.name),
        brand: trimString(row?.brand),
        servingSize: trimString(row?.serving_size),
        notes: trimString(row?.notes),
        linkedSupplementId: trimString(row?.supplement_id),
        catalogType: CATALOG_TYPES.CUSTOM,
        source: "custom",
    };
}

async function getAuthenticatedUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        console.warn("custom supplement auth check failed", error);
        return null;
    }

    return hasNonAnonymousUser(data?.user) ? data.user : null;
}

export async function createUserCustomSupplement({
    name,
    brand,
    servingSize,
    notes,
}) {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
        throw new Error("Sign in is required to add a custom supplement.");
    }

    const trimmedName = trimString(name);
    if (!trimmedName) {
        throw new Error("Custom supplement name is required.");
    }

    const { data, error } = await supabase
        .from("user_custom_supplements")
        .insert({
            user_id: user.id,
            name: trimmedName,
            brand: trimString(brand) || null,
            serving_size: trimString(servingSize) || null,
            notes: trimString(notes) || null,
        })
        .select("id, name, brand, serving_size, notes, supplement_id")
        .single();

    if (error) {
        throw error;
    }

    return toCustomSearchItem(data);
}

export async function searchSupplementCatalog(query) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return [];
    }
    const activeIngredientsPromise = supabase
        .from("supplements")
        .select("id, name, evidence_score, status")
        .in("status", ["approved", "pending"])
        .ilike("name", `%${trimmedQuery}%`)
        .order("name")
        .limit(12);
    const supplementProductsPromise = supabase
        .from("supplement_products_master")
        .select("product_id, display_name")
        .ilike("display_name", `%${trimmedQuery}%`)
        .order("display_name")
        .limit(12);
    const user = await getAuthenticatedUser();
    const customSupplementsPromise = user
        ? supabase
            .from("user_custom_supplements")
            .select("id, name, brand, serving_size, notes, supplement_id")
            .ilike("name", `%${trimmedQuery}%`)
            .order("name")
            .limit(12)
        : Promise.resolve({ data: [], error: null });
    const [activeIngredients, supplementProducts, customSupplements] = await Promise.all([
        activeIngredientsPromise,
        supplementProductsPromise,
        customSupplementsPromise,
    ]);
    if (activeIngredients.error) {
        console.error("supplements search failed", activeIngredients.error);
    }
    if (supplementProducts.error) {
        console.error("supplement_products_master search failed", supplementProducts.error);
    }
    if (customSupplements.error) {
        console.error("user_custom_supplements search failed", customSupplements.error);
    }

    return [
        {
            key: "active-ingredients",
            title: "Active ingredients",
            data: (activeIngredients.data ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
                evidenceScore: Number.isFinite(row.evidence_score)
                    ? row.evidence_score
                    : null,
                verified: row.status === "approved",
            })),
        },
        {
            key: "supplements",
            title: "Supplements",
            data: (supplementProducts.data ?? []).map((row) => ({
                id: createSupplementProductCatalogId(row.product_id),
                name: row.display_name,
                catalogType: CATALOG_TYPES.SUPPLEMENT_PRODUCT,
            })),
        },
        {
            key: "custom-supplements",
            title: "Custom supplements",
            data: (customSupplements.data ?? []).map(toCustomSearchItem),
        },
    ].filter((section) => section.data.length > 0);
}
