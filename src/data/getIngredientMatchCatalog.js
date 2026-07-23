import { CATALOG_TYPES } from "@/features/supplements/catalog";
import { supabase } from "@src/lib/supabase";

const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedCatalogRows = null;
let cachedCatalogAt = 0;
let pendingCatalogRequest = null;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toCatalogRows(rows, { sourceTable, catalogType }) {
  return (rows ?? [])
    .filter((row) => typeof row?.id === "string" && typeof row?.name === "string")
    .map((row) => ({
      catalogId: row.id,
      catalogName: row.name.trim(),
      verified: row.status === "approved",
      sourceTable,
      catalogType,
    }))
    .filter((row) => row.catalogName.length > 0);
}

function toAliasCatalogRows(rows, supplementStatusById) {
  const statusById = supplementStatusById ?? new Map();

  return (rows ?? [])
    .map((row) => {
      const catalogId = trimString(row?.supplement_id);
      const catalogName =
        trimString(row?.alias) || trimString(row?.alias_normalized);
      const status = statusById.get(catalogId);

      if (!catalogId || !catalogName || !status) {
        return null;
      }

      return {
        catalogId,
        catalogName,
        verified: status === "approved",
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

async function loadIngredientMatchCatalog() {
  const [supplementsResult, aliasesResult] = await Promise.all([
    supabase
      .from("supplements")
      .select("id, name, status")
      .in("status", ["approved", "pending"])
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
    catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
  });
  const supplementStatusById = new Map(
    (data ?? []).map((row) => [row.id, row.status])
  );

  if (aliasesResult.error) {
    console.warn(
      "ingredient alias catalog fetch failed; falling back to supplement names",
      aliasesResult.error,
    );
    return supplementRows;
  }

  const aliasRows = toAliasCatalogRows(aliasesResult.data, supplementStatusById);

  return dedupeCatalogRows([...aliasRows, ...supplementRows]);
}

export async function fetchIngredientMatchCatalog(
  { forceRefresh = false } = {},
) {
  const cacheIsFresh =
    Array.isArray(cachedCatalogRows) &&
    Date.now() - cachedCatalogAt < CATALOG_CACHE_TTL_MS;
  if (!forceRefresh && cacheIsFresh) {
    return cachedCatalogRows;
  }

  if (!forceRefresh && pendingCatalogRequest) {
    return pendingCatalogRequest;
  }

  pendingCatalogRequest = loadIngredientMatchCatalog()
    .then((rows) => {
      cachedCatalogRows = rows;
      cachedCatalogAt = Date.now();
      return rows;
    })
    .finally(() => {
      pendingCatalogRequest = null;
    });

  return pendingCatalogRequest;
}
