export const SEARCH_DEBOUNCE_MS = 350;
export const MIN_EDGE_QUERY_LENGTH = 2;
export const SEARCH_SOURCE_FAILURE_STATUSES = new Set([
  "timeout",
  "rate_limit",
  "unavailable",
  "error",
]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeMobileSearchQuery(value) {
  return trimString(value)
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("und");
}

export function normalizeMobileSearchBarcode(value) {
  return trimString(value).normalize("NFKC").replace(/[\s-]+/gu, "");
}

function normalizedNameKey(item) {
  const brand = normalizeMobileSearchQuery(item?.brand);
  const name = normalizeMobileSearchQuery(item?.name);
  return brand && name ? `${brand}\u0000${name}` : "";
}

function mergeSources(left, right) {
  const sources = [];
  const keys = new Set();
  [...(left ?? []), ...(right ?? [])].forEach((source) => {
    const provider = trimString(source?.provider);
    const stableId = trimString(source?.stableId);
    const key = `${provider}\u0000${stableId}`;
    if (!provider || !stableId || keys.has(key)) return;
    keys.add(key);
    sources.push({ provider, stableId });
  });
  return sources;
}

export function mergeMobileProductResults(left, right) {
  const master = left?.canonicalProductId
    ? left
    : right?.canonicalProductId
      ? right
      : null;
  const preferred = master ?? left;
  const secondary = preferred === left ? right : left;
  return {
    ...secondary,
    ...preferred,
    name: trimString(preferred?.name) || trimString(secondary?.name),
    brand: trimString(preferred?.brand) || trimString(secondary?.brand) || null,
    barcode:
      normalizeMobileSearchBarcode(preferred?.barcode) ||
      normalizeMobileSearchBarcode(secondary?.barcode) ||
      null,
    canonicalProductId:
      trimString(preferred?.canonicalProductId) ||
      trimString(secondary?.canonicalProductId) ||
      null,
    evidenceScore: Number.isFinite(preferred?.evidenceScore)
      ? preferred.evidenceScore
      : Number.isFinite(secondary?.evidenceScore)
        ? secondary.evidenceScore
        : null,
    evidenceSnapshot:
      preferred?.evidenceSnapshot ?? secondary?.evidenceSnapshot ?? null,
    sources: mergeSources(left?.sources, right?.sources),
  };
}

export function dedupeMobileProductResults(items) {
  const results = [];
  const barcodeIndex = new Map();
  const canonicalIndex = new Map();
  const providerIndex = new Map();
  const nameIndex = new Map();

  const reindex = (item, index) => {
    const barcode = normalizeMobileSearchBarcode(item?.barcode);
    const canonicalId = trimString(item?.canonicalProductId);
    if (barcode) barcodeIndex.set(barcode, index);
    if (canonicalId) canonicalIndex.set(canonicalId, index);
    (item?.sources ?? []).forEach((source) => {
      const provider = trimString(source?.provider);
      const stableId = trimString(source?.stableId);
      if (provider && stableId) {
        providerIndex.set(`${provider}\u0000${stableId}`, index);
      }
    });
    const nameKey = normalizedNameKey(item);
    if (nameKey) nameIndex.set(nameKey, index);
  };

  (items ?? []).forEach((item) => {
    if (!trimString(item?.name)) return;
    const barcode = normalizeMobileSearchBarcode(item?.barcode);
    const canonicalId = trimString(item?.canonicalProductId);
    const providerMatch = (item?.sources ?? [])
      .map((source) =>
        providerIndex.get(
          `${trimString(source?.provider)}\u0000${trimString(source?.stableId)}`,
        ),
      )
      .find((index) => index !== undefined);
    const nameKey = normalizedNameKey(item);
    const index =
      (barcode ? barcodeIndex.get(barcode) : undefined) ??
      (canonicalId ? canonicalIndex.get(canonicalId) : undefined) ??
      providerMatch ??
      (nameKey ? nameIndex.get(nameKey) : undefined);

    if (index === undefined) {
      results.push(item);
      reindex(item, results.length - 1);
      return;
    }

    results[index] = mergeMobileProductResults(results[index], item);
    reindex(results[index], index);
  });

  return results;
}

export function buildMobileSearchSections({
  products = [],
  activeIngredients = [],
  customSupplements = [],
}) {
  return [
    { key: "products", title: "Products", data: products },
    {
      key: "active-ingredients",
      title: "Active ingredients",
      data: activeIngredients,
    },
    {
      key: "custom-supplements",
      title: "Custom supplements",
      data: customSupplements,
    },
  ].filter((section) => section.data.length > 0);
}

export function mergeCanonicalActiveIngredientResults(
  directItems,
  aliasItems,
) {
  const byId = new Map();
  [...(aliasItems ?? []), ...(directItems ?? [])].forEach((item) => {
    const id = trimString(item?.id);
    const name = trimString(item?.name);
    if (!id || !name) return;
    const existing = byId.get(id);
    if (!existing || (existing.matchedAlias && !item.matchedAlias)) {
      byId.set(id, item);
    }
  });
  return Array.from(byId.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function summarizeSearchAvailability(sources) {
  const entries = Object.entries(sources ?? {});
  const failedSources = entries
    .filter(([, value]) => SEARCH_SOURCE_FAILURE_STATUSES.has(value?.status))
    .map(([source, value]) => ({ source, status: value.status }));
  const blockedSources = entries
    .filter(([, value]) => value?.status === "config_blocked")
    .map(([source]) => source);
  const successfulSources = entries.filter(([, value]) =>
    ["success", "cached"].includes(value?.status),
  );

  return {
    failedSources,
    blockedSources,
    hasPartialFailure:
      failedSources.length > 0 && successfulSources.length > 0,
    hasFullFailure:
      failedSources.length > 0 && successfulSources.length === 0,
  };
}

function getSectionData(sections, key) {
  return sections?.find((section) => section.key === key)?.data ?? [];
}

export function composeMobileSearchResult({
  localSections = [],
  edgeProducts = [],
  localSources = {},
  edgeSources = {},
  edgeError = null,
}) {
  const products = dedupeMobileProductResults([
    ...edgeProducts,
    ...getSectionData(localSections, "products"),
  ]);
  const sections = buildMobileSearchSections({
    products,
    activeIngredients: getSectionData(localSections, "active-ingredients"),
    customSupplements: getSectionData(localSections, "custom-supplements"),
  });
  const sources = { ...localSources, ...edgeSources };
  const availability = summarizeSearchAvailability(sources);
  const itemCount = sections.reduce(
    (total, section) => total + section.data.length,
    0,
  );
  const state = edgeError?.kind === "offline"
    ? itemCount > 0
      ? "offline_partial"
      : "offline"
    : availability.hasFullFailure && itemCount === 0
      ? "error"
      : availability.hasPartialFailure
        ? "partial"
        : itemCount > 0
          ? "success"
          : "empty";

  return { sections, sources, availability, state, error: edgeError };
}

export function createLatestSearchRequestGuard() {
  let generation = 0;
  let currentController = null;

  return {
    begin() {
      generation += 1;
      currentController?.abort();
      currentController = new AbortController();
      const requestGeneration = generation;
      return {
        generation: requestGeneration,
        requestId: `mobile-search-${Date.now()}-${requestGeneration}`,
        signal: currentController.signal,
        isCurrent: () =>
          generation === requestGeneration &&
          currentController?.signal.aborted !== true,
      };
    },
    cancel() {
      generation += 1;
      currentController?.abort();
      currentController = null;
    },
  };
}

export function isProductSearchItem(item) {
  return item?.catalogType === "supplement_product";
}

export function getProductVerificationLabel(item) {
  if (!isProductSearchItem(item)) return "";
  if (item?.completenessStatus === "incomplete") return "Incomplete details";

  const status = trimString(item?.verificationStatus).toLowerCase();
  const verifiedStatus =
    status === "verified" ||
    (status.endsWith("_verified") && !status.includes("unverified"));
  return item?.verified === true || verifiedStatus ? "Verified" : "Unverified";
}
