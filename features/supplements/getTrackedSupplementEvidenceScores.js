import {
  getTrackedScanMatchedIngredients,
  isOfficialCatalogId,
} from "@/features/supplements/trackedScanContext";
import { CATALOG_TYPES, getCatalogType } from "@/features/supplements/catalog";
import {
  buildProductEvidenceScoreData,
  scoreMatchedIngredientsForProduct,
} from "@/features/supplements/recommendedDoseScoring";
import { getSupplementById, getSupplementsByIds } from "@src/data/getSupplement";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function getTrackedSupplementEvidenceScores(supplements) {
  const supplementList = Array.isArray(supplements) ? supplements : [];
  const officialCatalogIds = new Set();
  const supplementProductCatalogIds = new Set();

  supplementList.forEach((supplement) => {
    const catalogType =
      supplement?.catalogType ?? getCatalogType(supplement?.catalogId);

    if (
      catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT &&
      trimString(supplement?.catalogId)
    ) {
      supplementProductCatalogIds.add(supplement.catalogId);
      return;
    }

    if (isOfficialCatalogId(supplement?.catalogId)) {
      officialCatalogIds.add(supplement.catalogId);
    }

    getTrackedScanMatchedIngredients(supplement).forEach((match) => {
      if (isOfficialCatalogId(match?.catalogId)) {
        officialCatalogIds.add(match.catalogId);
      }
    });
  });

  const [supplementRows, supplementProductRows] = await Promise.all([
    getSupplementsByIds(Array.from(officialCatalogIds)),
    Promise.all(
      Array.from(supplementProductCatalogIds).map(async (catalogId) => [
        catalogId,
        await getSupplementById(catalogId),
      ])
    ),
  ]);

  const supplementsByCatalogId = new Map(
    supplementRows.map((supplement) => [supplement.id, supplement])
  );
  const productScoreByCatalogId = new Map(
    supplementProductRows
      .filter(([, product]) => product)
      .map(([catalogId, product]) => [catalogId, product.evidence_score])
  );

  return supplementList.reduce((acc, supplement) => {
    if (!supplement?.id) {
      return acc;
    }

    const catalogType =
      supplement?.catalogType ?? getCatalogType(supplement?.catalogId);

    if (catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT) {
      const score = productScoreByCatalogId.get(supplement.catalogId);
      acc[supplement.id] = Number.isFinite(score) ? score : null;
      return acc;
    }

    const linkedIngredients = getTrackedScanMatchedIngredients(supplement);
    if (linkedIngredients.length > 0) {
      const scoredIngredients = scoreMatchedIngredientsForProduct({
        matchedIngredients: linkedIngredients,
        supplementsByCatalogId,
        servingSizeText: trimString(supplement?.servingSizeText) || null,
      });

      acc[supplement.id] = buildProductEvidenceScoreData(scoredIngredients).evidenceScore;
      return acc;
    }

    const score = supplementsByCatalogId.get(supplement.catalogId)?.evidence_score;
    acc[supplement.id] = Number.isFinite(score) ? score : null;
    return acc;
  }, {});
}
