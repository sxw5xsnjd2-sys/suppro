import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CATALOG_TYPES,
  createSupplementProductCatalogId,
  getCatalogEntityId,
} from "@/features/supplements/catalog";
import { hasNonAnonymousUser } from "@src/lib/authState";
import { supabase } from "@src/lib/supabase";

export const SEARCH_HISTORY_VERSION = 1;
export const SEARCH_HISTORY_STORAGE_KEY_PREFIX =
  `suppro.searchHistory.v${SEARCH_HISTORY_VERSION}`;
export const GUEST_SEARCH_HISTORY_STORAGE_KEY =
  `${SEARCH_HISTORY_STORAGE_KEY_PREFIX}:guest`;
export const LEGACY_RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY =
  "recent-supplement-searches";
export const MAX_SEARCH_HISTORY_ITEMS = 50;
export const MAX_HISTORY_SCORE_REFRESH_IDS = 50;
export const ACTIVE_INGREDIENT_EVIDENCE_CALCULATION_VERSION =
  "active-ingredient-evidence.v1";
export const OVERALL_PRODUCT_EVIDENCE_CALCULATION_VERSION =
  "recommended-dose-product-evidence.v1";

const LEGACY_MIGRATION_TIMESTAMP_BASE = Date.UTC(2020, 0, 1);
const VALID_EVIDENCE_TYPES = new Set([
  "active_ingredient_evidence",
  "overall_product_evidence",
]);
let historyMutationQueue = Promise.resolve();

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value) {
  return trimString(value).replace(/\s+/g, " ");
}

export function normalizeHistoryBarcode(value) {
  return trimString(value).replace(/[\s-]+/g, "").toLowerCase();
}

function normalizeTimestamp(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function normalizeProviderDescriptor(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const provider = trimString(value.provider).toLowerCase();
  const stableId = trimString(value.stableId);
  return provider && stableId ? { provider, stableId } : null;
}

function normalizeNavigationDescriptor(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const pathname = trimString(value.pathname);
  if (!pathname) {
    return null;
  }

  const action = ["navigate", "push", "replace"].includes(value.action)
    ? value.action
    : "push";

  return {
    action,
    pathname,
    params:
      value.params && typeof value.params === "object"
        ? { ...value.params }
        : {},
  };
}

export function normalizeEvidenceSnapshot(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const type = trimString(value.type);
  const score = value.score;
  const calculatedAt =
    typeof value.calculatedAt === "string"
      ? Date.parse(value.calculatedAt)
      : normalizeTimestamp(value.calculatedAt, NaN);
  const calculationVersion = trimString(value.calculationVersion);

  if (
    !VALID_EVIDENCE_TYPES.has(type) ||
    !Number.isFinite(score) ||
    !Number.isFinite(calculatedAt) ||
    !calculationVersion
  ) {
    return null;
  }

  return {
    type,
    score: Math.min(Math.max(score, 0), 100),
    calculatedAt,
    calculationVersion,
  };
}

function getHistoryIdentityKey(item) {
  const canonicalProductId = trimString(item?.canonicalProductId);
  if (canonicalProductId) {
    return `product:${canonicalProductId}`;
  }

  const barcode = normalizeHistoryBarcode(item?.barcode);
  if (barcode) {
    return `barcode:${barcode}`;
  }

  const providerDescriptor = normalizeProviderDescriptor(
    item?.providerDescriptor,
  );
  if (providerDescriptor) {
    return `provider:${providerDescriptor.provider}:${providerDescriptor.stableId}`;
  }

  const catalogId = trimString(item?.catalogId);
  return catalogId ? `catalog:${catalogId}` : "";
}

function normalizeHistoryItem(value, fallbackTimestamp = 0) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const name = normalizeText(value.name);
  const entityType = trimString(value.entityType || value.catalogType);
  const catalogId = trimString(value.catalogId);
  const canonicalProductId = trimString(value.canonicalProductId) || null;
  const barcode = normalizeHistoryBarcode(value.barcode) || null;
  const providerDescriptor = normalizeProviderDescriptor(
    value.providerDescriptor,
  );
  const navigationDescriptor = normalizeNavigationDescriptor(
    value.navigationDescriptor,
  );

  if (
    !name ||
    !entityType ||
    (!catalogId && !canonicalProductId && !barcode && !providerDescriptor) ||
    !navigationDescriptor
  ) {
    return null;
  }

  const normalized = {
    historyId: "",
    entityType,
    entityId:
      canonicalProductId ||
      providerDescriptor?.stableId ||
      catalogId ||
      barcode,
    catalogId: catalogId || null,
    canonicalProductId,
    barcode,
    providerDescriptor,
    name,
    brand: normalizeText(value.brand) || null,
    origin: trimString(value.origin) || "unknown",
    timestamp: normalizeTimestamp(value.timestamp, fallbackTimestamp),
    navigationDescriptor,
    verificationState: trimString(value.verificationState) || "unknown",
    completenessState: trimString(value.completenessState) || "unknown",
    evidenceSnapshot: normalizeEvidenceSnapshot(value.evidenceSnapshot),
    scanStatus: trimString(value.scanStatus) || null,
    customSupplementId: trimString(value.customSupplementId) || null,
    source: trimString(value.source) || null,
  };
  normalized.historyId = getHistoryIdentityKey(normalized);
  return normalized.historyId ? normalized : null;
}

function haveMatchingHistoryIdentity(left, right) {
  const leftCanonicalProductId = trimString(left?.canonicalProductId);
  const rightCanonicalProductId = trimString(right?.canonicalProductId);

  if (leftCanonicalProductId && rightCanonicalProductId) {
    return leftCanonicalProductId === rightCanonicalProductId;
  }

  const leftBarcode = normalizeHistoryBarcode(left?.barcode);
  const rightBarcode = normalizeHistoryBarcode(right?.barcode);
  if (leftBarcode && rightBarcode) {
    return leftBarcode === rightBarcode;
  }

  const leftProvider = normalizeProviderDescriptor(left?.providerDescriptor);
  const rightProvider = normalizeProviderDescriptor(right?.providerDescriptor);
  if (leftProvider && rightProvider) {
    return (
      leftProvider.provider === rightProvider.provider &&
      leftProvider.stableId === rightProvider.stableId
    );
  }

  const leftCatalogId = trimString(left?.catalogId);
  const rightCatalogId = trimString(right?.catalogId);
  return Boolean(leftCatalogId && leftCatalogId === rightCatalogId);
}

function shouldClearEvidenceSnapshot(item) {
  return (
    item?.scanStatus === "no_ingredients" ||
    item?.completenessState === "incomplete_no_ingredients"
  );
}

function mergeHistoryItems(previous, next) {
  const merged = normalizeHistoryItem({
    ...previous,
    ...next,
    canonicalProductId:
      trimString(next?.canonicalProductId) ||
      trimString(previous?.canonicalProductId) ||
      null,
    barcode:
      normalizeHistoryBarcode(next?.barcode) ||
      normalizeHistoryBarcode(previous?.barcode) ||
      null,
    catalogId:
      trimString(next?.catalogId) || trimString(previous?.catalogId) || null,
    providerDescriptor:
      normalizeProviderDescriptor(next?.providerDescriptor) ||
      normalizeProviderDescriptor(previous?.providerDescriptor),
    evidenceSnapshot: shouldClearEvidenceSnapshot(next)
      ? null
      : normalizeEvidenceSnapshot(next?.evidenceSnapshot) ||
        normalizeEvidenceSnapshot(previous?.evidenceSnapshot),
  });

  return merged;
}

export function dedupeSearchHistoryItems(
  items,
  maxItems = MAX_SEARCH_HISTORY_ITEMS,
) {
  const boundedLimit = Math.max(0, Math.floor(maxItems));
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeHistoryItem(item, index))
    .filter(Boolean)
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        right.item.timestamp - left.item.timestamp || left.index - right.index,
    )
    .map(({ item }) => item);
  const deduped = [];

  normalizedItems.forEach((item) => {
    const duplicateIndex = deduped.findIndex((existing) =>
      haveMatchingHistoryIdentity(existing, item),
    );

    if (duplicateIndex < 0) {
      deduped.push(item);
      return;
    }

    deduped[duplicateIndex] = mergeHistoryItems(item, deduped[duplicateIndex]);
  });

  return deduped.slice(0, boundedLimit);
}

export function upsertSearchHistoryItem(
  items,
  nextItem,
  maxItems = MAX_SEARCH_HISTORY_ITEMS,
) {
  const normalizedNext = normalizeHistoryItem(nextItem, Date.now());
  if (!normalizedNext) {
    return dedupeSearchHistoryItems(items, maxItems);
  }

  let mergedNext = normalizedNext;
  const remainingItems = [];

  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalizedItem = normalizeHistoryItem(item);
    if (!normalizedItem) {
      return;
    }

    if (haveMatchingHistoryIdentity(normalizedItem, mergedNext)) {
      mergedNext = mergeHistoryItems(normalizedItem, mergedNext);
      return;
    }

    remainingItems.push(normalizedItem);
  });

  return dedupeSearchHistoryItems(
    [mergedNext, ...remainingItems],
    maxItems,
  );
}

function buildSearchNavigationDescriptor(item, value) {
  const supplied = normalizeNavigationDescriptor(value);
  if (supplied) {
    return supplied;
  }

  if (item?.catalogType === CATALOG_TYPES.CUSTOM) {
    return {
      action: "navigate",
      pathname: "/(modals)/modal/supplement",
      params: {
        newCatalogId: item.id,
        newCatalogName: item.name,
        newCatalogType: item.catalogType,
        newCustomSupplementId: item.customSupplementId ?? "",
      },
    };
  }

  return {
    action: "push",
    pathname: "/(modals)/modal/supplement-info",
    params: { id: item?.id, name: item?.name },
  };
}

export function createSearchSelectionHistoryItem({
  item,
  navigationDescriptor,
  timestamp = Date.now(),
}) {
  const rawCatalogId = trimString(item?.id);
  const catalogId = rawCatalogId.startsWith("external:") ? "" : rawCatalogId;
  const name = normalizeText(item?.name);
  const entityType = trimString(item?.catalogType);
  const canonicalProductId =
    entityType === CATALOG_TYPES.SUPPLEMENT_PRODUCT
      ? trimString(item?.canonicalProductId) ||
        (catalogId.startsWith("product:")
          ? getCatalogEntityId(catalogId)
          : null)
      : null;
  const providerDescriptor =
    normalizeProviderDescriptor(item?.providerDescriptor) ||
    normalizeProviderDescriptor({
      provider: item?.provider,
      stableId: item?.providerStableId,
    });
  const barcode = normalizeHistoryBarcode(item?.barcode) || null;
  if (
    !name ||
    !entityType ||
    (!catalogId && !canonicalProductId && !providerDescriptor && !barcode)
  ) {
    return null;
  }
  const suppliedEvidenceSnapshot = normalizeEvidenceSnapshot(
    item?.evidenceSnapshot,
  );
  const evidenceSnapshot =
    suppliedEvidenceSnapshot &&
    ((entityType === CATALOG_TYPES.ACTIVE_INGREDIENT &&
      suppliedEvidenceSnapshot.type === "active_ingredient_evidence") ||
      (entityType === CATALOG_TYPES.SUPPLEMENT_PRODUCT &&
        suppliedEvidenceSnapshot.type === "overall_product_evidence"))
      ? suppliedEvidenceSnapshot
      : entityType === CATALOG_TYPES.ACTIVE_INGREDIENT &&
          Number.isFinite(item?.evidenceScore)
      ? {
          type: "active_ingredient_evidence",
          score: item.evidenceScore,
          calculatedAt: timestamp,
          calculationVersion:
            ACTIVE_INGREDIENT_EVIDENCE_CALCULATION_VERSION,
        }
        : entityType === CATALOG_TYPES.SUPPLEMENT_PRODUCT &&
            Number.isFinite(item?.evidenceScore)
          ? {
              type: "overall_product_evidence",
              score: item.evidenceScore,
              calculatedAt: timestamp,
              calculationVersion:
                OVERALL_PRODUCT_EVIDENCE_CALCULATION_VERSION,
            }
          : null;

  return normalizeHistoryItem({
    entityType,
    catalogId: catalogId || null,
    canonicalProductId,
    barcode,
    providerDescriptor,
    name,
    brand: item?.brand,
    origin: "search",
    timestamp,
    navigationDescriptor: buildSearchNavigationDescriptor(
      item,
      navigationDescriptor,
    ),
    verificationState:
      item?.verified === true
        ? "verified"
        : trimString(item?.verificationStatus) ||
          (entityType === CATALOG_TYPES.CUSTOM
            ? "user_provided"
            : entityType === CATALOG_TYPES.ACTIVE_INGREDIENT
              ? "unverified"
              : "unknown"),
    completenessState:
      entityType === CATALOG_TYPES.SUPPLEMENT_PRODUCT
        ? trimString(item?.completenessStatus) || "unknown"
        : "complete",
    evidenceSnapshot,
    customSupplementId: item?.customSupplementId,
    source: item?.source || "catalog_search",
  });
}

function getScanProductName(product) {
  return (
    normalizeText(product?.productName) ||
    normalizeText(product?.displayName) ||
    normalizeText(product?.name)
  );
}

function getScanProviderStableId(product, barcode) {
  return (
    trimString(product?.providerProductId) ||
    trimString(product?.externalId) ||
    trimString(product?.sourceId) ||
    barcode
  );
}

export function createScanHistoryItem({
  scanState,
  expectedScanSessionId,
  overallProductEvidenceScore = null,
  timestamp = Date.now(),
  navigationDescriptor,
}) {
  const scanSessionId = scanState?.scanSessionId;
  if (
    !Number.isFinite(expectedScanSessionId) ||
    expectedScanSessionId <= 0 ||
    scanSessionId !== expectedScanSessionId ||
    !["success", "no_ingredients"].includes(scanState?.status)
  ) {
    return null;
  }

  const product = scanState?.product;
  const name = getScanProductName(product);
  const canonicalProductId = trimString(product?.productId) || null;
  const catalogId = canonicalProductId
    ? createSupplementProductCatalogId(canonicalProductId)
    : null;
  const barcode =
    normalizeHistoryBarcode(product?.barcode) ||
    normalizeHistoryBarcode(scanState?.barcode) ||
    null;
  const provider = (
    trimString(product?.scanDataSource) ||
    trimString(product?.source) ||
    trimString(scanState?.extractionSource) ||
    "barcode_scan"
  ).toLowerCase();
  const providerStableId = getScanProviderStableId(product, barcode);
  const providerDescriptor =
    !canonicalProductId && provider && providerStableId
      ? { provider, stableId: providerStableId }
      : null;

  if (!name || (!canonicalProductId && !barcode && !providerDescriptor)) {
    return null;
  }

  const noIngredients = scanState.status === "no_ingredients";
  const evidenceSnapshot =
    !noIngredients && Number.isFinite(overallProductEvidenceScore)
      ? {
          type: "overall_product_evidence",
          score: overallProductEvidenceScore,
          calculatedAt: timestamp,
          calculationVersion:
            OVERALL_PRODUCT_EVIDENCE_CALCULATION_VERSION,
        }
      : null;

  return normalizeHistoryItem({
    entityType: CATALOG_TYPES.SUPPLEMENT_PRODUCT,
    catalogId,
    canonicalProductId,
    barcode,
    providerDescriptor,
    name,
    brand: product?.brand,
    origin: "scanner",
    timestamp,
    navigationDescriptor:
      navigationDescriptor ??
      ({
        action: "push",
        pathname: "/modal/supplement-info",
        params: {
          source: "scanned",
          scanSessionId: String(scanSessionId),
          name,
        },
      }),
    verificationState:
      trimString(product?.verificationStatus) || "unknown",
    completenessState: noIngredients
      ? "incomplete_no_ingredients"
      : product?.hasIncompleteDetails
        ? "incomplete"
        : "complete",
    evidenceSnapshot,
    scanStatus: scanState.status,
    source: provider,
  });
}

export function migrateLegacyRecentSelections(
  legacyItems,
  timestampBase = LEGACY_MIGRATION_TIMESTAMP_BASE,
) {
  if (!Array.isArray(legacyItems)) {
    return [];
  }

  const migratedItems = legacyItems.flatMap((item, index) => {
    const migrated = createSearchSelectionHistoryItem({
      item,
      timestamp: timestampBase - index,
    });
    return migrated ? [migrated] : [];
  });

  return dedupeSearchHistoryItems(migratedItems);
}

function normalizeAuthoritativeEvidenceSnapshot(value, item) {
  if (value?.evidenceSnapshot === null) {
    return null;
  }

  const directSnapshot = normalizeEvidenceSnapshot(value?.evidenceSnapshot);
  if (directSnapshot) {
    return directSnapshot;
  }

  if (!Number.isFinite(value?.score)) {
    return undefined;
  }

  return normalizeEvidenceSnapshot({
    type:
      item?.entityType === CATALOG_TYPES.ACTIVE_INGREDIENT
        ? "active_ingredient_evidence"
        : "overall_product_evidence",
    score: value.score,
    calculatedAt: value.calculatedAt,
    calculationVersion: value.calculationVersion,
  });
}

export function reconcileSearchHistoryEvidenceSnapshots(
  items,
  authoritativeSnapshots,
  maxItems = MAX_SEARCH_HISTORY_ITEMS,
) {
  const snapshots = Array.isArray(authoritativeSnapshots)
    ? authoritativeSnapshots
    : [];

  const reconciled = dedupeSearchHistoryItems(items, maxItems).map((item) => {
    const authoritative = snapshots.find((snapshot) =>
      haveMatchingHistoryIdentity(item, snapshot),
    );
    if (!authoritative) {
      return item;
    }

    const evidenceSnapshot = normalizeAuthoritativeEvidenceSnapshot(
      authoritative,
      item,
    );
    if (evidenceSnapshot === undefined) {
      return item;
    }

    return normalizeHistoryItem({ ...item, evidenceSnapshot });
  });

  return reconciled.slice(0, Math.max(0, Math.floor(maxItems)));
}

export function getBoundedCanonicalProductHistoryIds(
  items,
  maximum = MAX_HISTORY_SCORE_REFRESH_IDS,
) {
  const limit = Math.min(
    MAX_HISTORY_SCORE_REFRESH_IDS,
    Math.max(0, Math.floor(maximum)),
  );
  return Array.from(
    new Set(
      dedupeSearchHistoryItems(items)
        .filter(
          (item) =>
            item.entityType === CATALOG_TYPES.SUPPLEMENT_PRODUCT &&
            trimString(item.canonicalProductId),
        )
        .map((item) => trimString(item.canonicalProductId)),
    ),
  ).slice(0, limit);
}

export function normalizeProductScoreSnapshotRow(row) {
  const productId = trimString(row?.product_id || row?.productId);
  const evidenceSnapshot = normalizeEvidenceSnapshot({
    type: "overall_product_evidence",
    score: row?.score,
    calculatedAt: row?.calculated_at ?? row?.calculatedAt,
    calculationVersion:
      row?.calculation_version || row?.calculationVersion,
  });
  return productId && evidenceSnapshot
    ? { productId, evidenceSnapshot }
    : null;
}

export function isNewerProductScoreSnapshot(current, incoming) {
  if (!current || current.type !== "overall_product_evidence") return true;
  if (incoming.calculatedAt > current.calculatedAt) return true;
  if (incoming.calculatedAt < current.calculatedAt) return false;
  return incoming.calculationVersion !== current.calculationVersion;
}

export function reconcileBoundedProductScoreSnapshots(
  items,
  authoritativeSnapshots,
  maximum = MAX_HISTORY_SCORE_REFRESH_IDS,
) {
  const allowedProductIds = new Set(
    getBoundedCanonicalProductHistoryIds(items, maximum),
  );
  const snapshotsByProductId = new Map();

  for (const row of Array.isArray(authoritativeSnapshots)
    ? authoritativeSnapshots.slice(0, MAX_HISTORY_SCORE_REFRESH_IDS)
    : []) {
    const normalized = normalizeProductScoreSnapshotRow(row);
    if (!normalized || !allowedProductIds.has(normalized.productId)) continue;
    snapshotsByProductId.set(
      normalized.productId,
      normalized.evidenceSnapshot,
    );
  }

  return dedupeSearchHistoryItems(items).map((item) => {
    const productId = trimString(item.canonicalProductId);
    if (
      item.entityType !== CATALOG_TYPES.SUPPLEMENT_PRODUCT ||
      !productId
    ) {
      return item;
    }
    const incoming = snapshotsByProductId.get(productId);
    if (
      !incoming ||
      !isNewerProductScoreSnapshot(item.evidenceSnapshot, incoming)
    ) {
      return item;
    }
    return normalizeHistoryItem({ ...item, evidenceSnapshot: incoming });
  });
}

export async function fetchBoundedProductScoreSnapshots(
  productIds,
  {
    client = supabase,
    maximum = MAX_HISTORY_SCORE_REFRESH_IDS,
  } = {},
) {
  const limit = Math.min(
    MAX_HISTORY_SCORE_REFRESH_IDS,
    Math.max(0, Math.floor(maximum)),
  );
  const boundedProductIds = Array.from(
    new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map(trimString)
        .filter(Boolean),
    ),
  ).slice(0, limit);
  if (!boundedProductIds.length || typeof client?.rpc !== "function") {
    return [];
  }

  const { data, error } = await client.rpc("get_product_score_snapshots", {
    p_product_ids: boundedProductIds,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export function getAccountSearchHistoryStorageKey(accountId) {
  const normalizedAccountId = trimString(accountId);
  return normalizedAccountId
    ? `${SEARCH_HISTORY_STORAGE_KEY_PREFIX}:account:${normalizedAccountId}`
    : GUEST_SEARCH_HISTORY_STORAGE_KEY;
}

async function resolveCurrentHistoryAccountId() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }

    const user = data?.session?.user ?? null;
    return hasNonAnonymousUser(user) ? trimString(user?.id) || null : null;
  } catch (error) {
    console.warn("Failed to resolve search history account scope", error);
    return null;
  }
}

async function resolveStorageKey(accountId) {
  const resolvedAccountId =
    accountId === undefined
      ? await resolveCurrentHistoryAccountId()
      : trimString(accountId) || null;
  return getAccountSearchHistoryStorageKey(resolvedAccountId);
}

function parseStoredHistory(raw) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== SEARCH_HISTORY_VERSION ||
      !Array.isArray(parsed.items)
    ) {
      return null;
    }

    return {
      version: SEARCH_HISTORY_VERSION,
      legacyMigrationComplete: parsed.legacyMigrationComplete === true,
      items: dedupeSearchHistoryItems(parsed.items),
    };
  } catch {
    return null;
  }
}

function buildStoredHistory(items) {
  return {
    version: SEARCH_HISTORY_VERSION,
    legacyMigrationComplete: true,
    items: dedupeSearchHistoryItems(items),
  };
}

export async function loadSearchHistory({
  storage = AsyncStorage,
  accountId,
  refreshScores = storage === AsyncStorage,
  telemetry,
} = {}) {
  const storageKey = await resolveStorageKey(accountId);
  const existing = parseStoredHistory(await storage.getItem(storageKey));

  if (existing?.legacyMigrationComplete) {
    return refreshScores
      ? refreshCanonicalProductHistoryScores(existing.items, {
          storage,
          accountId,
          telemetry,
        })
      : existing.items;
  }

  let legacyItems = [];
  const legacyRaw = await storage.getItem(
    LEGACY_RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
  );
  if (legacyRaw) {
    try {
      legacyItems = migrateLegacyRecentSelections(JSON.parse(legacyRaw));
    } catch {
      legacyItems = [];
    }
  }

  const migratedItems = dedupeSearchHistoryItems([
    ...(existing?.items ?? []),
    ...legacyItems,
  ]);
  await storage.setItem(
    storageKey,
    JSON.stringify(buildStoredHistory(migratedItems)),
  );

  if (legacyRaw) {
    try {
      await storage.removeItem(LEGACY_RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY);
    } catch (error) {
      console.warn("Failed to remove migrated legacy search history", error);
    }
  }

  return refreshScores
    ? refreshCanonicalProductHistoryScores(migratedItems, {
        storage,
        accountId,
        telemetry,
      })
    : migratedItems;
}

async function persistSearchHistory(items, { storage, accountId }) {
  const storageKey = await resolveStorageKey(accountId);
  const nextItems = dedupeSearchHistoryItems(items);
  await storage.setItem(
    storageKey,
    JSON.stringify(buildStoredHistory(nextItems)),
  );
  return nextItems;
}

export async function refreshCanonicalProductHistoryScores(
  items,
  {
    storage = AsyncStorage,
    accountId,
    client = supabase,
    maximum = MAX_HISTORY_SCORE_REFRESH_IDS,
    telemetry,
  } = {},
) {
  const productIds = getBoundedCanonicalProductHistoryIds(items, maximum);
  if (!productIds.length || typeof client?.rpc !== "function") return items;

  const finishScoreRefresh = telemetry?.start?.(
    "search_history_score_refresh",
    { provider: "supabase" },
  );
  try {
    const data = await fetchBoundedProductScoreSnapshots(productIds, {
      client,
      maximum,
    });

    const reconciled = reconcileBoundedProductScoreSnapshots(
      items,
      data,
      maximum,
    );
    if (JSON.stringify(reconciled) === JSON.stringify(items)) {
      finishScoreRefresh?.({ rowCount: data?.length ?? 0, success: true });
      return items;
    }
    const persisted = await persistSearchHistory(reconciled, {
      storage,
      accountId,
    });
    finishScoreRefresh?.({ rowCount: data?.length ?? 0, success: true });
    return persisted;
  } catch (error) {
    finishScoreRefresh?.({ success: false, error });
    console.warn("Failed to refresh Search history score snapshots", error);
    return items;
  }
}

export function applyCanonicalProductEvidenceToHistory(
  items,
  {
    canonicalProductId,
    barcode = null,
    providerDescriptor = null,
    evidenceSnapshot,
  } = {},
) {
  const productId = trimString(canonicalProductId);
  const incomingSnapshot = normalizeEvidenceSnapshot(evidenceSnapshot);
  if (
    !productId ||
    incomingSnapshot?.type !== "overall_product_evidence"
  ) {
    return dedupeSearchHistoryItems(items);
  }

  const target = {
    canonicalProductId: productId,
    barcode: normalizeHistoryBarcode(barcode) || null,
    providerDescriptor: normalizeProviderDescriptor(providerDescriptor),
    catalogId: createSupplementProductCatalogId(productId),
  };
  let matched = false;
  const updated = dedupeSearchHistoryItems(items).map((item) => {
    if (!haveMatchingHistoryIdentity(item, target)) return item;
    matched = true;
    const nextEvidenceSnapshot = isNewerProductScoreSnapshot(
      item.evidenceSnapshot,
      incomingSnapshot,
    )
      ? incomingSnapshot
      : item.evidenceSnapshot;
    return normalizeHistoryItem({
      ...item,
      canonicalProductId: productId,
      catalogId: createSupplementProductCatalogId(productId),
      barcode: target.barcode || item.barcode,
      providerDescriptor: target.providerDescriptor || item.providerDescriptor,
      timestamp: item.timestamp,
      evidenceSnapshot: nextEvidenceSnapshot,
      navigationDescriptor: {
        action: "push",
        pathname: "/(modals)/modal/supplement-info",
        params: {
          id: createSupplementProductCatalogId(productId),
          name: item.name,
        },
      },
      completenessState:
        item.completenessState === "incomplete_no_ingredients"
          ? item.completenessState
          : "complete",
    });
  });

  return matched ? dedupeSearchHistoryItems(updated) : updated;
}

export async function recordCanonicalProductEvidenceHistory(
  {
    canonicalProductId,
    barcode = null,
    providerDescriptor = null,
    score,
    calculatedAt = Date.now(),
    calculationVersion = OVERALL_PRODUCT_EVIDENCE_CALCULATION_VERSION,
  } = {},
  { storage = AsyncStorage, accountId } = {},
) {
  const evidenceSnapshot = normalizeEvidenceSnapshot({
    type: "overall_product_evidence",
    score,
    calculatedAt,
    calculationVersion,
  });
  if (!trimString(canonicalProductId) || !evidenceSnapshot) {
    return loadSearchHistory({
      storage,
      accountId,
      refreshScores: false,
    });
  }

  return enqueueHistoryMutation(async () => {
    const items = await loadSearchHistory({
      storage,
      accountId,
      refreshScores: false,
    });
    const updated = applyCanonicalProductEvidenceToHistory(items, {
      canonicalProductId,
      barcode,
      providerDescriptor,
      evidenceSnapshot,
    });
    return persistSearchHistory(updated, { storage, accountId });
  });
}

function enqueueHistoryMutation(operation) {
  const result = historyMutationQueue.then(operation, operation);
  historyMutationQueue = result.catch(() => {});
  return result;
}

async function recordHistoryItem(
  item,
  { storage = AsyncStorage, accountId, telemetry } = {},
) {
  if (!item) {
    return loadSearchHistory({ storage, accountId });
  }

  return enqueueHistoryMutation(async () => {
    const finishPersistence = telemetry?.start?.(
      "search_history_persistence",
    );
    try {
      const items = await loadSearchHistory({ storage, accountId, telemetry });
      const persisted = await persistSearchHistory(
        upsertSearchHistoryItem(items, item),
        {
          storage,
          accountId,
        },
      );
      finishPersistence?.({ rowCount: persisted.length, success: true });
      return persisted;
    } catch (error) {
      finishPersistence?.({ success: false, error });
      throw error;
    }
  });
}

export async function recordSearchSelectionHistory(
  value,
  options = {},
) {
  return recordHistoryItem(createSearchSelectionHistoryItem(value), options);
}

export async function recordScanHistory(value, options = {}) {
  return recordHistoryItem(createScanHistoryItem(value), options);
}

export function getSearchSelectionHistoryItems(items) {
  return dedupeSearchHistoryItems(items).filter(
    (item) =>
      item.origin === "search" &&
      (item.catalogId || item.canonicalProductId || item.providerDescriptor),
  );
}

export function getUnifiedSearchHistoryItems(items) {
  return dedupeSearchHistoryItems(items).filter(
    (item) =>
      ["search", "scanner"].includes(item.origin) &&
      (item.catalogId ||
        item.canonicalProductId ||
        item.providerDescriptor ||
        item.barcode),
  );
}

export function historyItemToSearchResult(item) {
  const normalized = normalizeHistoryItem(item);
  if (!normalized || !["search", "scanner"].includes(normalized.origin)) {
    return null;
  }
  const fallbackId = normalized.providerDescriptor
    ? `external:${normalized.providerDescriptor.provider}:${normalized.providerDescriptor.stableId}`
    : normalized.barcode
      ? `external:barcode:${normalized.barcode}`
      : "";
  const id = normalized.canonicalProductId
    ? createSupplementProductCatalogId(normalized.canonicalProductId)
    : normalized.catalogId || fallbackId;
  if (!id) return null;

  return {
    id,
    name: normalized.name,
    catalogType: normalized.entityType,
    customSupplementId: normalized.customSupplementId,
    brand: normalized.brand,
    source: normalized.source,
    canonicalProductId: normalized.canonicalProductId,
    barcode: normalized.barcode,
    providerDescriptor: normalized.providerDescriptor,
    verificationStatus: normalized.verificationState,
    completenessStatus: normalized.completenessState,
    navigationDescriptor: normalized.navigationDescriptor,
    verified: normalized.verificationState === "verified",
    evidenceScore:
      normalized.evidenceSnapshot?.type === "active_ingredient_evidence" ||
      normalized.evidenceSnapshot?.type === "overall_product_evidence"
        ? normalized.evidenceSnapshot.score
        : null,
    historyOrigin: normalized.origin,
    fromHistory: true,
  };
}
