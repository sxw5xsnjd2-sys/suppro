import { router } from "expo-router";
import { CATALOG_TYPES, getCatalogType } from "@/features/supplements/catalog";
import { hasTrackedScanContext } from "@/features/supplements/trackedScanContext";

export function openTrackedSupplementInfo(
  supplement,
  requireSubscriptionAccess = null
) {
  if (!supplement) {
    return;
  }

  if (
    typeof requireSubscriptionAccess === "function" &&
    !requireSubscriptionAccess("supplement_info")
  ) {
    return;
  }

  const catalogType =
    supplement.catalogType ?? getCatalogType(supplement.catalogId);

  if (
    catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT &&
    supplement.catalogId
  ) {
    router.push({
      pathname: "/modal/supplement-info",
      params: {
        id: supplement.catalogId,
        name: supplement.name,
      },
    });
    return;
  }

  if (hasTrackedScanContext(supplement)) {
    router.push({
      pathname: "/modal/supplement-info",
      params: {
        source: "tracked-scanned",
        trackedSupplementId: supplement.id,
        name: supplement.name,
      },
    });
    return;
  }

  if (!supplement.catalogId) {
    return;
  }

  router.push({
    pathname: "/modal/supplement-info",
    params: {
      id: supplement.catalogId,
      name: supplement.name,
    },
  });
}
