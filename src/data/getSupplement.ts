// src/data/getSupplement.ts
import type { SupplementWithBenefits } from "@src/types/supplements";
import { supabase } from "@src/lib/supabase";

export async function getSupplementById(
  supplementId: string
): Promise<SupplementWithBenefits | null> {
  const { data, error } = await supabase
    .from("supplements")
    .select(
      `
      id,
      name,
      description,
      what_is_it,
      why_use_it,
      risks_and_interactions,
      evidence,
      evidence_score,
      supplement_benefits (
        id,
        label,
        icon
      )
    `
    )
    .eq("id", supplementId)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data as SupplementWithBenefits;
}
