import {
  CATALOG_TYPES,
  createSupplementProductCatalogId,
} from "@/features/supplements/catalog";
import {
  fetchBoundedProductScoreSnapshots,
  isNewerProductScoreSnapshot,
  normalizeEvidenceSnapshot,
  normalizeProductScoreSnapshotRow,
} from "@/features/search/history";
import {
  MIN_EDGE_QUERY_LENGTH,
  composeMobileSearchResult,
  normalizeMobileSearchQuery,
  summarizeSearchAvailability,
} from "@/features/search/searchPolicy";
import { getNonAnonymousAccessToken } from "@src/lib/authState";
import { normalizeEdgeFunctionInvokeError } from "@src/lib/edgeFunctionErrors";
import { supabase } from "@src/lib/supabase";
import { searchLocalSupplementCatalog } from "./searchSupplementCatalog";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createAbortError() {
  const error = new Error("Search cancelled");
  error.name = "AbortError";
  return error;
}

function getPrimaryProviderDescriptor(candidate) {
  const provider = trimString(candidate?.provider);
  const stableId = trimString(candidate?.providerStableId);
  if (provider && stableId) return { provider, stableId };

  const source = (candidate?.sources ?? []).find(
    (item) => trimString(item?.provider) && trimString(item?.stableId),
  );
  return source
    ? { provider: trimString(source.provider), stableId: trimString(source.stableId) }
    : null;
}

function normalizeEdgeProduct(candidate) {
  const canonicalProductId = trimString(candidate?.canonicalProductId);
  const providerDescriptor = getPrimaryProviderDescriptor(candidate);
  const name = trimString(candidate?.name);
  if (!name || (!canonicalProductId && !providerDescriptor)) return null;
  const evidenceSnapshot = normalizeEvidenceSnapshot({
    ...candidate?.evidenceSnapshot,
    type: "overall_product_evidence",
  });
  const evidenceScore = evidenceSnapshot?.score;

  return {
    id: canonicalProductId
      ? createSupplementProductCatalogId(canonicalProductId)
      : `external:${providerDescriptor.provider}:${providerDescriptor.stableId}`,
    canonicalProductId: canonicalProductId || null,
    providerDescriptor,
    name,
    brand: trimString(candidate?.brand) || null,
    barcode: trimString(candidate?.barcode) || null,
    catalogType: CATALOG_TYPES.SUPPLEMENT_PRODUCT,
    evidenceScore: Number.isFinite(evidenceScore) ? evidenceScore : null,
    evidenceSnapshot,
    verificationStatus: trimString(candidate?.verificationStatus) || "unknown",
    completenessStatus: trimString(candidate?.completenessStatus) || "incomplete",
    sources: Array.isArray(candidate?.sources) ? candidate.sources : [],
    source: canonicalProductId ? "master" : providerDescriptor.provider,
  };
}

export function reconcileCanonicalSearchResultScores(
  sections,
  authoritativeSnapshots,
) {
  const snapshotsByProductId = new Map(
    (Array.isArray(authoritativeSnapshots) ? authoritativeSnapshots : [])
      .map(normalizeProductScoreSnapshotRow)
      .filter(Boolean)
      .map((snapshot) => [snapshot.productId, snapshot.evidenceSnapshot]),
  );

  return (Array.isArray(sections) ? sections : []).map((section) => ({
    ...section,
    data: (Array.isArray(section?.data) ? section.data : []).map((item) => {
      const productId = trimString(item?.canonicalProductId);
      const incoming = snapshotsByProductId.get(productId);
      if (
        item?.catalogType !== CATALOG_TYPES.SUPPLEMENT_PRODUCT ||
        !productId ||
        !incoming ||
        !isNewerProductScoreSnapshot(item?.evidenceSnapshot, incoming)
      ) {
        return item;
      }
      return {
        ...item,
        evidenceScore: incoming.score,
        evidenceSnapshot: incoming,
      };
    }),
  }));
}

export async function hydrateCanonicalSearchResultScores(
  sections,
  {
    client = supabase,
    fetchSnapshots = fetchBoundedProductScoreSnapshots,
  } = {},
) {
  const productIds = Array.from(
    new Set(
      (Array.isArray(sections) ? sections : [])
        .flatMap((section) => section?.data ?? [])
        .filter(
          (item) =>
            item?.catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT &&
            trimString(item?.canonicalProductId) &&
            !Number.isFinite(item?.evidenceScore) &&
            !normalizeEvidenceSnapshot(item?.evidenceSnapshot),
        )
        .map((item) => trimString(item.canonicalProductId)),
    ),
  );
  if (!productIds.length) return sections;

  try {
    const snapshots = await fetchSnapshots(productIds, { client });
    return reconcileCanonicalSearchResultScores(sections, snapshots);
  } catch {
    return sections;
  }
}

export function canonicalizeSearchProductSelection(item) {
  const canonicalProductId = trimString(item?.canonicalProductId);
  if (!canonicalProductId) return item;

  return {
    ...item,
    id: createSupplementProductCatalogId(canonicalProductId),
    canonicalProductId,
    catalogType: CATALOG_TYPES.SUPPLEMENT_PRODUCT,
    source: "master",
  };
}

async function getAuthenticatedAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return getNonAnonymousAccessToken(data?.session);
}

async function invokeFederatedSearch(normalizedQuery, requestId, signal) {
  if (normalizedQuery.length < MIN_EDGE_QUERY_LENGTH) {
    return {
      results: [],
      sources: {
        edge: { status: "skipped_min_length" },
        dsld: { status: "skipped_min_length" },
        ean_search: { status: "skipped_min_length" },
        go_upc: { status: "skipped_min_length" },
      },
    };
  }

  const accessToken = await getAuthenticatedAccessToken();
  if (!accessToken) {
    return {
      results: [],
      sources: {
        edge: { status: "unavailable" },
        dsld: { status: "unavailable" },
        ean_search: { status: "unavailable" },
        go_upc: { status: "config_blocked" },
      },
    };
  }

  const { data, error } = await supabase.functions.invoke(
    "search-supplement-products",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { query: normalizedQuery, requestId },
      signal,
    },
  );
  if (error) {
    const normalizedError = await normalizeEdgeFunctionInvokeError(error, {
      fallbackMessage: "External product search is unavailable.",
      unauthorizedMessage: "Sign in is required to search products.",
      serviceUnavailableMessage: "External product search is unavailable.",
    });
    return {
      results: [],
      sources: {
        edge: {
          status:
            normalizedError.status === 429 ? "rate_limit" : "unavailable",
        },
        dsld: { status: "unavailable" },
        ean_search: { status: "unavailable" },
        go_upc: { status: "config_blocked" },
      },
      error: {
        kind: normalizedError.status == null ? "offline" : "unavailable",
        message: normalizedError.message,
      },
    };
  }

  return {
    results: (data?.results ?? []).map(normalizeEdgeProduct).filter(Boolean),
    sources: data?.sources ?? {},
  };
}

export async function searchSupplementProducts(
  query,
  { signal, requestId = `mobile-search-${Date.now()}` } = {},
) {
  const normalizedQuery = normalizeMobileSearchQuery(query);
  if (!normalizedQuery) {
    return {
      requestId,
      normalizedQuery,
      sections: [],
      sources: {},
      availability: summarizeSearchAvailability({}),
      state: "empty",
    };
  }

  const [local, edge] = await Promise.all([
    searchLocalSupplementCatalog(normalizedQuery, { signal }),
    invokeFederatedSearch(normalizedQuery, requestId, signal),
  ]);
  if (signal?.aborted) throw createAbortError();

  const composed = composeMobileSearchResult({
    localSections: local.sections,
    edgeProducts: edge.results,
    localSources: local.sources,
    edgeSources: edge.sources,
    edgeError: edge.error,
  });
  const sections = await hydrateCanonicalSearchResultScores(
    composed.sections,
  );
  if (signal?.aborted) throw createAbortError();

  return {
    requestId,
    normalizedQuery,
    ...composed,
    sections,
  };
}

export async function resolveSearchProductSelection(item, { signal } = {}) {
  if (item?.canonicalProductId) {
    return {
      status: "resolved",
      product: canonicalizeSearchProductSelection(item),
    };
  }
  const provider = trimString(item?.providerDescriptor?.provider);
  const providerStableId = trimString(item?.providerDescriptor?.stableId);
  if (!provider || !providerStableId || !trimString(item?.name)) {
    return { status: "incomplete", product: { ...item, evidenceScore: null } };
  }

  try {
    const accessToken = await getAuthenticatedAccessToken();
    if (!accessToken) throw new Error("No authenticated session");
    const { data, error } = await supabase.functions.invoke(
      "resolve-supplement-product",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          requestId: `mobile-resolution-${Date.now()}`,
          candidate: {
            provider,
            providerStableId,
            canonicalProductId: null,
            name: trimString(item.name),
            brand: trimString(item.brand) || null,
            barcode: trimString(item.barcode) || null,
            verificationStatus:
              trimString(item.verificationStatus) || "unknown",
          },
        },
        signal,
      },
    );
    if (error) throw error;
    const normalized = normalizeEdgeProduct(data?.product);
    if (!normalized) {
      return { status: "incomplete", product: { ...item, evidenceScore: null } };
    }
    return {
      status: normalized.canonicalProductId ? "resolved" : "incomplete",
      product: canonicalizeSearchProductSelection(normalized),
    };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return {
      status: "incomplete",
      product: {
        ...item,
        evidenceScore: null,
        completenessStatus: "incomplete",
      },
    };
  }
}
