import { CATALOG_TYPES } from "@/features/supplements/catalog";
import { supabase } from "@src/lib/supabase";

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

export async function fetchIngredientMatchCatalog() {
  const { data, error } = await supabase
    .from("supplements")
    .select("id, name")
    .eq("status", "approved")
    .order("name", { ascending: true });

  if (error) {
    console.error("ingredient catalog fetch failed", error);
    throw new Error("Could not load supplement catalog matches.");
  }

  return toCatalogRows(data, {
    sourceTable: "supplements",
    verified: true,
    catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
  });
}
