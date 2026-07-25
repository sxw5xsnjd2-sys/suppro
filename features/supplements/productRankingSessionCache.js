const productRankingCacheByBenefit = new Map();

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getProductRankingCacheKey(benefitLabel) {
  return trimString(benefitLabel).replace(/\s+/g, " ").toLowerCase();
}

export function getCachedProductRanking(benefitLabel) {
  const key = getProductRankingCacheKey(benefitLabel);
  return key ? productRankingCacheByBenefit.get(key) ?? null : null;
}

export function setCachedProductRanking(
  benefitLabel,
  { items, cursor = null, hasMore = false } = {},
) {
  const key = getProductRankingCacheKey(benefitLabel);
  if (!key) return null;

  const entry = {
    items: Array.isArray(items) ? items : [],
    cursor,
    hasMore: Boolean(hasMore),
    updatedAt: Date.now(),
  };
  productRankingCacheByBenefit.set(key, entry);
  return entry;
}

export function updateCachedProductRankingItems(benefitLabel, updateItems) {
  const current = getCachedProductRanking(benefitLabel);
  if (!current) return null;

  const items =
    typeof updateItems === "function"
      ? updateItems(current.items)
      : updateItems;
  if (items === current.items) return current;

  return setCachedProductRanking(benefitLabel, { ...current, items });
}

export function resetProductRankingSessionCacheForTests() {
  productRankingCacheByBenefit.clear();
}
