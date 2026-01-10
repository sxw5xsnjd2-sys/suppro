import { supabase } from "@src/lib/supabase";

export type SupplementCatalogItem = {
  id: string; // Supabase UUID
  name: string;
};

export async function getSupplementCatalog(): Promise<SupplementCatalogItem[]> {
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
