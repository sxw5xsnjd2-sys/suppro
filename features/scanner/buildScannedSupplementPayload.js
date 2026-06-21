import { buildLinkedSupplementPayload } from "@src/data/buildLinkedSupplementPayload";
import { filterActiveMatchedIngredients } from "@/features/scanner/ingredientMatching";
import { getSupplementsByIds } from "@src/data/getSupplement";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildScannedSupplementName(scanState) {
  return (
    trimString(scanState?.product?.productName) ||
    trimString(scanState?.product?.name) ||
    "Scanned supplement"
  );
}

export async function buildScannedSupplementPayload(scanState) {
  const matchedIngredients = filterActiveMatchedIngredients(
    scanState?.matchedIngredients
  );

  const uniqueMatches = [];
  const seenCatalogIds = new Set();

  matchedIngredients.forEach((match) => {
    if (seenCatalogIds.has(match.catalogId)) {
      return;
    }

    seenCatalogIds.add(match.catalogId);
    uniqueMatches.push(match);
  });

  const supplementRows = await getSupplementsByIds(
    uniqueMatches.map((match) => match.catalogId)
  );

  const supplementsByCatalogId = new Map(
    supplementRows.map((supplement) => [supplement.id, supplement])
  );

  const payload = await buildLinkedSupplementPayload({
    id: null,
    name: buildScannedSupplementName(scanState),
    verified: false,
    matchedIngredients,
    servingSizeText: trimString(scanState?.product?.servingSizeText) || null,
    supplementsByCatalogId,
  });

  return {
    ...payload,
    barcode: trimString(scanState?.product?.barcode) || null,
    brand: trimString(scanState?.product?.brand) || null,
    imageUrl: trimString(scanState?.product?.imageUrl) || null,
    scanDataSource: trimString(scanState?.product?.scanDataSource) || null,
    scanDetailsIncomplete: Boolean(
      scanState?.product?.hasIncompleteDetails
    ),
  };
}

export function buildScannedSupplementFailurePayload(scanState) {
  const status = scanState?.status;
  const fallbackMessageByStatus = {
    no_ingredients:
      "We found the product, but there were no usable supplement ingredients to match.",
    not_found:
      "Sorry, we couldn't find that product, please take pictures to add it to the app",
    error: "Something went wrong while processing that barcode.",
  };
  const scanFailureMessage =
    status === "not_found"
      ? fallbackMessageByStatus.not_found
      : trimString(scanState?.error?.message) ||
        fallbackMessageByStatus[status] ||
        fallbackMessageByStatus.error;

  return {
    id: null,
    name: buildScannedSupplementName(scanState),
    verified: false,
    evidence_score: 0,
    evidence: null,
    supplement_benefits: [],
    matchedIngredients: [],
    how_to_use: null,
    what_is_it: null,
    why_use_it: null,
    risks_and_interactions: null,
    scanFailureStatus: status || null,
    scanFailureCategory:
      typeof scanState?.error?.category === "string"
        ? scanState.error.category
        : null,
    scanFailureMessage,
    barcode: trimString(scanState?.product?.barcode) || null,
    brand: trimString(scanState?.product?.brand) || null,
    imageUrl: trimString(scanState?.product?.imageUrl) || null,
    scanDataSource: trimString(scanState?.product?.scanDataSource) || null,
    scanDetailsIncomplete: Boolean(
      scanState?.product?.hasIncompleteDetails
    ),
  };
}
