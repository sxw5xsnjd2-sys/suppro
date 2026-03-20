import { getScopedSupabase, supabase as publicSupabase } from "@src/lib/supabase";
function trimString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function hasUserSupplementDetails(row) {
    return Boolean(trimString(row?.what_is_it) ||
        trimString(row?.why_use_it) ||
        trimString(row?.risks_and_interactions) ||
        trimString(row?.evidence_summary));
}
async function getVerifiedSupplementByName(name) {
    const trimmedName = trimString(name);
    if (!trimmedName)
        return null;
    const { data, error } = await publicSupabase
        .from("supplements")
        .select(`
      id,
      name,
      description,
      what_is_it,
      how_to_use,
      why_use_it,
      risks_and_interactions,
      evidence,
      evidence_score,
      supplement_benefits (
        *
      )
    `)
        .eq("status", "approved")
        .eq("name", trimmedName)
        .maybeSingle();
    if (error) {
        console.error(error);
        return null;
    }
    return data ? { ...data, verified: true } : null;
}
export async function getSupplementById(supplementId, fallbackName) {
    const isUserSupplement = supplementId.startsWith("user-");
    const cleanId = isUserSupplement
        ? supplementId.replace(/^user-/, "")
        : supplementId;
    if (isUserSupplement) {
        const supabase = await getScopedSupabase();
        const { data, error } = await supabase
            .from("user_supplements")
            .select(`
        id,
        name,
        what_is_it,
        how_to_use,
        why_use_it,
        risks_and_interactions,
        evidence_summary
      `)
            .eq("id", cleanId)
            .maybeSingle();
        if (error) {
            console.error(error);
            return null;
        }
        const verifiedMatch = !hasUserSupplementDetails(data)
            ? await getVerifiedSupplementByName(fallbackName ?? data?.name)
            : null;
        if (verifiedMatch)
            return verifiedMatch;
        if (!data)
            return null;
        return {
            ...data,
            description: null,
            evidence: data.evidence_summary ?? null,
            evidence_score: null,
            supplement_benefits: [],
            verified: false,
        };
    }
    const { data, error } = await publicSupabase
        .from("supplements")
        .select(`
      id,
      name,
      description,
      what_is_it,
      how_to_use,
      why_use_it,
      risks_and_interactions,
      evidence,
      evidence_score,
      supplement_benefits (
        *
      )
    `)
        .eq("id", cleanId)
        .maybeSingle();
    if (error) {
        console.error(error);
        return null;
    }
    return data ? { ...data, verified: true } : null;
}
