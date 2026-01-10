import { supabase } from "@src/lib/supabase";

export type CatalogResult = {
  id: string;
  name: string;
};

export async function searchSupplementCatalog(
  query: string
): Promise<CatalogResult[]> {
  if (!query.trim()) return [];

  const { data, error } = await supabase
    .from("supplements")
    .select("id, name")
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(5);

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}
