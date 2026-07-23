import {
  CATALOG_TYPES,
  createCustomSupplementCatalogId,
  createSupplementProductCatalogId,
} from "@/features/supplements/catalog";
import { mergeCanonicalActiveIngredientResults } from "@/features/search/searchPolicy";
import { hasNonAnonymousUser } from "@src/lib/authState";
import { supabase } from "@src/lib/supabase";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function withAbortSignal(query, signal) {
  return signal && typeof query?.abortSignal === "function"
    ? query.abortSignal(signal)
    : query;
}

function toCustomSearchItem(row, linkedSupplementsById = new Map()) {
  const customSupplementId = trimString(row?.id);
  const linkedSupplement = linkedSupplementsById.get(
    trimString(row?.supplement_id),
  );

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
    evidenceScore: Number.isFinite(linkedSupplement?.evidence_score)
      ? linkedSupplement.evidence_score
      : null,
    verified: linkedSupplement?.status === "approved",
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

function sourceStatus(result) {
  return result?.error ? "error" : "success";
}

export async function searchLocalSupplementCatalog(
  query,
  { signal } = {},
) {
  const trimmedQuery = trimString(query);
  if (!trimmedQuery) {
    return { sections: [], sources: {} };
  }

  const pattern = `%${trimmedQuery}%`;
  const activePromise = withAbortSignal(
    supabase
      .from("supplements")
      .select("id, name, evidence_score, status")
      .in("status", ["approved", "pending"])
      .ilike("name", pattern)
      .order("name")
      .limit(12),
    signal,
  );
  const productsPromise = withAbortSignal(
    supabase
      .from("supplement_products_master")
      .select(
        "product_id, barcode, display_name, serving_size_text, ingredient_count, image_url, verification_status",
      )
      .ilike("display_name", pattern)
      .order("display_name")
      .limit(12),
    signal,
  );
  const aliasesPromise = withAbortSignal(
    supabase
      .from("supplement_aliases")
      .select("supplement_id, alias, alias_normalized")
      .ilike("alias", pattern)
      .limit(12),
    signal,
  );
  const userPromise = getAuthenticatedUser();

  const [activeResult, productsResult, aliasesResult, user] =
    await Promise.all([
      activePromise,
      productsPromise,
      aliasesPromise,
      userPromise,
    ]);
  const customResult = user
    ? await withAbortSignal(
        supabase
          .from("user_custom_supplements")
          .select("id, name, brand, serving_size, notes, supplement_id")
          .ilike("name", pattern)
          .order("name")
          .limit(12),
        signal,
      )
    : { data: [], error: null };

  const linkedSupplementIds = Array.from(
    new Set([
      ...(aliasesResult.data ?? []).map((row) => trimString(row?.supplement_id)),
      ...(customResult.data ?? []).map((row) => trimString(row?.supplement_id)),
    ].filter(Boolean)),
  );
  const linkedResult = linkedSupplementIds.length
    ? await withAbortSignal(
        supabase
          .from("supplements")
          .select("id, name, evidence_score, status")
          .in("id", linkedSupplementIds)
          .in("status", ["approved", "pending"]),
        signal,
      )
    : { data: [], error: null };
  const linkedById = new Map(
    (linkedResult.data ?? []).map((row) => [trimString(row?.id), row]),
  );

  const activeIngredients = mergeCanonicalActiveIngredientResults(
    (activeResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
      evidenceScore: Number.isFinite(row.evidence_score)
        ? row.evidence_score
        : null,
      verified: row.status === "approved",
      source: "supplements",
    })),
    (aliasesResult.data ?? []).map((alias) => {
      const canonical = linkedById.get(trimString(alias?.supplement_id));
      return canonical
        ? {
            id: canonical.id,
            name: canonical.name,
            catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
            evidenceScore: Number.isFinite(canonical.evidence_score)
              ? canonical.evidence_score
              : null,
            verified: canonical.status === "approved",
            source: "supplement_aliases",
            matchedAlias:
              trimString(alias?.alias) || trimString(alias?.alias_normalized),
          }
        : null;
    }).filter(Boolean),
  );
  const products = (productsResult.data ?? []).map((row) => ({
    id: createSupplementProductCatalogId(row.product_id),
    canonicalProductId: trimString(row.product_id),
    name: trimString(row.display_name),
    brand: null,
    barcode: trimString(row.barcode) || null,
    catalogType: CATALOG_TYPES.SUPPLEMENT_PRODUCT,
    evidenceScore: null,
    verificationStatus: trimString(row.verification_status) || "unknown",
    completenessStatus:
      Number(row.ingredient_count) > 0 ? "complete" : "incomplete",
    sources: [
      { provider: "master", stableId: trimString(row.product_id) },
    ],
    source: "master",
  }));
  const customSupplements = (customResult.data ?? []).map((row) =>
    toCustomSearchItem(row, linkedById),
  );

  const sources = {
    local_active: { status: sourceStatus(activeResult), count: activeIngredients.length },
    local_aliases: { status: sourceStatus(aliasesResult), count: aliasesResult.data?.length ?? 0 },
    local_master: { status: sourceStatus(productsResult), count: products.length },
    local_custom: { status: sourceStatus(customResult), count: customSupplements.length },
    local_linked: {
      status: sourceStatus(linkedResult),
      count: linkedResult.data?.length ?? 0,
    },
  };
  [
    ["supplements search", activeResult.error],
    ["supplement aliases search", aliasesResult.error],
    ["supplement products search", productsResult.error],
    ["custom supplements search", customResult.error],
    ["linked supplement search", linkedResult.error],
  ].forEach(([label, error]) => {
    if (error && !signal?.aborted) console.warn(`${label} failed`, error);
  });

  return {
    sections: [
      { key: "active-ingredients", title: "Active ingredients", data: activeIngredients },
      { key: "products", title: "Products", data: products },
      { key: "custom-supplements", title: "Custom supplements", data: customSupplements },
    ].filter((section) => section.data.length > 0),
    sources,
  };
}

export async function searchSupplementCatalog(query, options) {
  const result = await searchLocalSupplementCatalog(query, options);
  return result.sections;
}
