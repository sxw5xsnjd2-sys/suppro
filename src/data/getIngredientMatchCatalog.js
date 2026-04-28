import { CATALOG_TYPES } from "@/features/supplements/catalog";
import { supabase } from "@src/lib/supabase";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toCatalogRows(rows, { sourceTable, verified, catalogType }) {
  return (rows ?? [])
    .filter((row) => typeof row?.id === "string" && typeof row?.name === "string")
    .map((row) => ({
      catalogId: row.id,
      catalogName: row.name.trim(),
      verified,
      sourceTable,
      catalogType,
    }))
    .filter((row) => row.catalogName.length > 0);
}

function toAliasCatalogRows(rows, approvedSupplementIds) {
  const approvedIds = approvedSupplementIds ?? new Set();

  return (rows ?? [])
    .map((row) => {
      const catalogId = trimString(row?.supplement_id);
      const catalogName = trimString(row?.alias) || trimString(row?.alias_normalized);

      if (!catalogId || !catalogName || !approvedIds.has(catalogId)) {
        return null;
      }

      return {
        catalogId,
        catalogName,
        verified: true,
        sourceTable: "supplement_aliases",
        catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
      };
    })
    .filter(Boolean);
}

function dedupeCatalogRows(rows) {
  const byKey = new Map();

  (rows ?? []).forEach((row) => {
    const catalogId = trimString(row?.catalogId);
    const catalogName = trimString(row?.catalogName);
    if (!catalogId || !catalogName) return;

    const key = `${catalogId}:${catalogName.toLowerCase()}`;
    if (byKey.has(key)) return;
    byKey.set(key, row);
  });

  return Array.from(byKey.values());
}

export async function fetchIngredientMatchCatalog() {
  const [supplementsResult, aliasesResult] = await Promise.all([
    supabase
      .from("supplements")
      .select("id, name")
      .eq("status", "approved")
      .order("name", { ascending: true }),
    supabase
      .from("supplement_aliases")
      .select("supplement_id, alias, alias_normalized"),
  ]);

  const { data, error } = supplementsResult;

  if (error) {
    console.error("ingredient catalog fetch failed", error);
    throw new Error("Could not load supplement catalog matches.");
  }

  const supplementRows = toCatalogRows(data, {
    sourceTable: "supplements",
    verified: true,
    catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
  });
  const approvedSupplementIds = new Set(supplementRows.map((row) => row.catalogId));

  if (aliasesResult.error) {
    console.warn("ingredient alias catalog fetch failed; falling back to supplement names", aliasesResult.error);
    return supplementRows;
  }

  const aliasRows = toAliasCatalogRows(aliasesResult.data, approvedSupplementIds);

  return dedupeCatalogRows([...aliasRows, ...supplementRows]);
}
