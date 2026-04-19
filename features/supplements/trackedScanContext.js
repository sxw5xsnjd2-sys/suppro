import { isActiveIngredientCatalogId } from "@/features/supplements/catalog";
import { filterActiveMatchedIngredients } from "@/features/scanner/ingredientMatching";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isOfficialCatalogId(value) {
  return isActiveIngredientCatalogId(value);
}

export function getSupplementLinkedIngredients(supplement) {
  const nextMatches = Array.isArray(supplement?.linkedIngredients)
    ? supplement.linkedIngredients
    : supplement?.scanMatchedIngredients;
  return filterActiveMatchedIngredients(nextMatches).filter((match) =>
    isActiveIngredientCatalogId(trimString(match?.catalogId))
  );
}

export function getTrackedScanMatchedIngredients(supplement) {
  if (supplement?.scanSource !== "scanned_product") {
    return [];
  }

  return getSupplementLinkedIngredients(supplement);
}

export function hasTrackedScanContext(supplement) {
  return getTrackedScanMatchedIngredients(supplement).length > 0;
}
