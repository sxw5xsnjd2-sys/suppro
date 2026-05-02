import { getAccessTokenOrCreateSession } from "@src/lib/supabase";
import { SUPABASE_URL } from "@src/lib/runtimeConfig";

const FUNCTION_NAME = "queue-missing-active-ingredients";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIngredient(item) {
  if (typeof item === "string") {
    return trimString(item);
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  return (
    trimString(item.name) ||
    trimString(item.canonicalName) ||
    trimString(item.canonical_name) ||
    trimString(item.rawName) ||
    trimString(item.raw_name)
  );
}

export async function queueMissingActiveIngredients({ productId, ingredients }) {
  const cleanProductId = trimString(productId);
  const cleanIngredients = Array.from(
    new Set((ingredients ?? []).map(normalizeIngredient).filter(Boolean))
  );

  if (!SUPABASE_URL || !cleanProductId || !cleanIngredients.length) {
    return { queued: 0, normalizedNames: [] };
  }

  const accessToken = await getAccessTokenOrCreateSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      productId: cleanProductId,
      ingredients: cleanIngredients,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Missing ingredient queue request failed.");
  }

  return response.json();
}
