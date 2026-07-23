import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadSearchHistoryModule() {
  const source = readFileSync(
    new URL("../../features/search/history.js", import.meta.url),
    "utf8",
  );
  const transformed = source
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")
    .replace(/export async function /g, "async function ");
  const factory = new Function(
    "AsyncStorage",
    "CATALOG_TYPES",
    "createSupplementProductCatalogId",
    "getCatalogEntityId",
    "hasNonAnonymousUser",
    "supabase",
    `${transformed}
return {
  ACTIVE_INGREDIENT_EVIDENCE_CALCULATION_VERSION,
  GUEST_SEARCH_HISTORY_STORAGE_KEY,
  LEGACY_RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY,
  MAX_HISTORY_SCORE_REFRESH_IDS,
  MAX_SEARCH_HISTORY_ITEMS,
  OVERALL_PRODUCT_EVIDENCE_CALCULATION_VERSION,
  SEARCH_HISTORY_STORAGE_KEY_PREFIX,
  SEARCH_HISTORY_VERSION,
  applyCanonicalProductEvidenceToHistory,
  createScanHistoryItem,
  createSearchSelectionHistoryItem,
  dedupeSearchHistoryItems,
  getAccountSearchHistoryStorageKey,
  getBoundedCanonicalProductHistoryIds,
  getUnifiedSearchHistoryItems,
  historyItemToSearchResult,
  loadSearchHistory,
  migrateLegacyRecentSelections,
  normalizeHistoryBarcode,
  reconcileBoundedProductScoreSnapshots,
  reconcileSearchHistoryEvidenceSnapshots,
  recordScanHistory,
  recordCanonicalProductEvidenceHistory,
  recordSearchSelectionHistory,
  refreshCanonicalProductHistoryScores,
  upsertSearchHistoryItem,
};`,
  );
  const storage = createMemoryStorage();

  return factory(
    storage,
    {
      ACTIVE_INGREDIENT: "active_ingredient",
      SUPPLEMENT_PRODUCT: "supplement_product",
      CUSTOM: "custom",
    },
    (id) => (id ? `product:${id}` : ""),
    (id) => String(id ?? "").replace(/^product:/, ""),
    (user) => Boolean(user && user.is_anonymous !== true),
    {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    },
  );
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];

  return {
    calls,
    values,
    async getItem(key) {
      calls.push(["getItem", key]);
      return values.has(key) ? values.get(key) : null;
    },
    async setItem(key, value) {
      calls.push(["setItem", key]);
      values.set(key, value);
    },
    async removeItem(key) {
      calls.push(["removeItem", key]);
      values.delete(key);
    },
  };
}

const history = loadSearchHistoryModule();

function createSearchItem(overrides = {}) {
  return history.createSearchSelectionHistoryItem({
    item: {
      id: "magnesium",
      name: "Magnesium",
      catalogType: "active_ingredient",
      evidenceScore: 80,
      verified: true,
      ...overrides.item,
    },
    navigationDescriptor: {
      action: "push",
      pathname: "/(modals)/modal/supplement-info",
      params: { id: overrides.item?.id ?? "magnesium" },
    },
    timestamp: overrides.timestamp ?? 100,
  });
}

function createScanState(overrides = {}) {
  return {
    status: "success",
    scanSessionId: 7,
    barcode: "0123-4567 89012",
    extractionSource: "go_upc",
    product: {
      barcode: "0123456789012",
      productId: null,
      productName: "Magnesium Complex",
      brand: "Example Brand",
      scanDataSource: "go_upc",
      verificationStatus: "go_upc_unverified",
      hasIncompleteDetails: false,
    },
    ...overrides,
  };
}

test("uses versioned guest and account-scoped storage keys", () => {
  assert.equal(
    history.getAccountSearchHistoryStorageKey(null),
    history.GUEST_SEARCH_HISTORY_STORAGE_KEY,
  );
  assert.equal(
    history.getAccountSearchHistoryStorageKey(" user-a "),
    `${history.SEARCH_HISTORY_STORAGE_KEY_PREFIX}:account:user-a`,
  );
});

test("migrates valid selected results once with stable ordering and timestamps", async () => {
  const legacyItems = [
    {
      id: "magnesium",
      name: "Magnesium",
      catalogType: "active_ingredient",
    },
    {
      id: "product:prod-a",
      name: "Product A",
      catalogType: "supplement_product",
    },
    "raw query text",
  ];
  const storage = createMemoryStorage({
    [history.LEGACY_RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY]:
      JSON.stringify(legacyItems),
  });

  const firstLoad = await history.loadSearchHistory({
    storage,
    accountId: "user-a",
  });
  const secondLoad = await history.loadSearchHistory({
    storage,
    accountId: "user-a",
  });
  const targetKey = history.getAccountSearchHistoryStorageKey("user-a");
  const stored = JSON.parse(storage.values.get(targetKey));

  assert.deepEqual(
    firstLoad.map((item) => item.name),
    ["Magnesium", "Product A"],
  );
  assert.equal(firstLoad[0].timestamp, Date.UTC(2020, 0, 1));
  assert.equal(firstLoad[1].timestamp, Date.UTC(2020, 0, 1) - 1);
  assert.deepEqual(secondLoad, firstLoad);
  assert.equal(stored.version, history.SEARCH_HISTORY_VERSION);
  assert.equal(stored.legacyMigrationComplete, true);
  assert.equal(
    storage.values.has(history.LEGACY_RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY),
    false,
  );
  assert.equal(
    storage.calls.filter(
      ([operation, key]) =>
        operation === "setItem" && key === targetKey,
    ).length,
    1,
  );
});

test("does not remove the legacy key when migration persistence fails", async () => {
  const legacyKey = history.LEGACY_RECENT_SUPPLEMENT_SEARCHES_STORAGE_KEY;
  const storage = createMemoryStorage({
    [legacyKey]: JSON.stringify([
      {
        id: "magnesium",
        name: "Magnesium",
        catalogType: "active_ingredient",
      },
    ]),
  });
  storage.setItem = async () => {
    throw new Error("storage full");
  };

  await assert.rejects(
    history.loadSearchHistory({ storage, accountId: null }),
    /storage full/,
  );
  assert.equal(storage.values.has(legacyKey), true);
});

test("duplicate search selections collapse and reopening moves the item first", () => {
  const firstMagnesium = createSearchItem({ timestamp: 100 });
  const vitaminD = createSearchItem({
    item: { id: "vitamin-d", name: "Vitamin D", evidenceScore: 90 },
    timestamp: 200,
  });
  const reopenedMagnesium = createSearchItem({ timestamp: 300 });
  const items = history.upsertSearchHistoryItem(
    history.upsertSearchHistoryItem([firstMagnesium], vitaminD),
    reopenedMagnesium,
  );

  assert.deepEqual(
    items.map((item) => item.catalogId),
    ["magnesium", "vitamin-d"],
  );
  assert.equal(items[0].timestamp, 300);
});

test("search selections and usable scans persist in one scoped history", async () => {
  const storage = createMemoryStorage();
  await history.recordSearchSelectionHistory(
    {
      item: {
        id: "magnesium",
        name: "Magnesium",
        catalogType: "active_ingredient",
        evidenceScore: 80,
        verified: true,
      },
      navigationDescriptor: {
        action: "push",
        pathname: "/(modals)/modal/supplement-info",
        params: { id: "magnesium" },
      },
      timestamp: 100,
    },
    { storage, accountId: "user-a" },
  );
  const items = await history.recordScanHistory(
    {
      scanState: createScanState(),
      expectedScanSessionId: 7,
      overallProductEvidenceScore: 75,
      timestamp: 200,
    },
    { storage, accountId: "user-a" },
  );

  assert.deepEqual(
    items.map((item) => item.origin),
    ["scanner", "search"],
  );
  assert.equal(
    storage.values.has(history.getAccountSearchHistoryStorageKey("user-a")),
    true,
  );
});

test("unified Search history returns multiple searches and scans newest-first with evidence", () => {
  const search = createSearchItem({ timestamp: 100 });
  const scan = history.createScanHistoryItem({
    scanState: createScanState(),
    expectedScanSessionId: 7,
    overallProductEvidenceScore: 74.6,
    timestamp: 200,
  });
  const secondSearch = createSearchItem({
    item: { id: "zinc", name: "Zinc", evidenceScore: 49.6 },
    timestamp: 300,
  });

  const items = history
    .getUnifiedSearchHistoryItems([search, scan, secondSearch])
    .map(history.historyItemToSearchResult);

  assert.deepEqual(items.map((item) => item.name), [
    "Zinc",
    "Magnesium Complex",
    "Magnesium",
  ]);
  assert.deepEqual(items.map((item) => item.evidenceScore), [49.6, 74.6, 80]);
  assert.equal(items[1].historyOrigin, "scanner");
});

test("records success and usable no-ingredients scans with correct evidence", () => {
  const success = history.createScanHistoryItem({
    scanState: createScanState(),
    expectedScanSessionId: 7,
    overallProductEvidenceScore: 76.25,
    timestamp: 400,
  });
  const noIngredients = history.createScanHistoryItem({
    scanState: createScanState({ status: "no_ingredients" }),
    expectedScanSessionId: 7,
    overallProductEvidenceScore: 0,
    timestamp: 500,
  });

  assert.deepEqual(success.evidenceSnapshot, {
    type: "overall_product_evidence",
    score: 76.25,
    calculatedAt: 400,
    calculationVersion:
      history.OVERALL_PRODUCT_EVIDENCE_CALCULATION_VERSION,
  });
  assert.equal(success.completenessState, "complete");
  assert.deepEqual(success.providerDescriptor, {
    provider: "go_upc",
    stableId: "0123456789012",
  });
  assert.equal(noIngredients.evidenceSnapshot, null);
  assert.equal(
    noIngredients.completenessState,
    "incomplete_no_ingredients",
  );
  assert.equal(
    history.upsertSearchHistoryItem([success], noIngredients)[0]
      .evidenceSnapshot,
    null,
  );
});

test("excludes not-found, error, stale, and unusable scan results", () => {
  for (const status of ["not_found", "error", "processing"] ) {
    assert.equal(
      history.createScanHistoryItem({
        scanState: createScanState({ status }),
        expectedScanSessionId: 7,
      }),
      null,
    );
  }

  assert.equal(
    history.createScanHistoryItem({
      scanState: createScanState(),
      expectedScanSessionId: 6,
    }),
    null,
  );
  assert.equal(
    history.createScanHistoryItem({
      scanState: createScanState({
        product: { productName: "", barcode: "" },
        barcode: "",
      }),
      expectedScanSessionId: 7,
    }),
    null,
  );
});

test("canonicalization upgrades an unresolved scan instead of duplicating it", () => {
  const unresolved = history.createScanHistoryItem({
    scanState: createScanState(),
    expectedScanSessionId: 7,
    overallProductEvidenceScore: 65,
    timestamp: 100,
  });
  const canonical = history.createScanHistoryItem({
    scanState: createScanState({
      scanSessionId: 8,
      product: {
        ...createScanState().product,
        productId: "canonical-product",
        verificationStatus: "verified",
      },
    }),
    expectedScanSessionId: 8,
    overallProductEvidenceScore: 82,
    timestamp: 200,
  });
  const items = history.upsertSearchHistoryItem([unresolved], canonical);

  assert.equal(items.length, 1);
  assert.equal(items[0].canonicalProductId, "canonical-product");
  assert.equal(items[0].catalogId, "product:canonical-product");
  assert.equal(items[0].evidenceSnapshot.score, 82);
});

test("unresolved search selection is stored by provider and upgraded by barcode", () => {
  const unresolved = history.createSearchSelectionHistoryItem({
    item: {
      id: "external:ean_search:0123456789012",
      name: "External product",
      catalogType: "supplement_product",
      barcode: "0123456789012",
      providerDescriptor: {
        provider: "ean_search",
        stableId: "0123456789012",
      },
      evidenceScore: null,
      completenessStatus: "incomplete",
    },
    navigationDescriptor: {
      action: "push",
      pathname: "/(modals)/modal/supplement-info",
      params: { source: "search-resolution", resolutionSessionId: "session" },
    },
    timestamp: 100,
  });
  const canonical = history.createSearchSelectionHistoryItem({
    item: {
      id: "product:canonical-product",
      canonicalProductId: "canonical-product",
      name: "Canonical product",
      catalogType: "supplement_product",
      barcode: "0123456789012",
      evidenceScore: 72,
      completenessStatus: "complete",
    },
    navigationDescriptor: {
      action: "push",
      pathname: "/(modals)/modal/supplement-info",
      params: { id: "product:canonical-product" },
    },
    timestamp: 200,
  });
  const [upgraded] = history.upsertSearchHistoryItem([unresolved], canonical);

  assert.equal(upgraded.canonicalProductId, "canonical-product");
  assert.equal(upgraded.catalogId, "product:canonical-product");
  assert.equal(upgraded.evidenceSnapshot.score, 72);
});

test("scanning the same product again collapses it and moves it first", () => {
  const firstScan = history.createScanHistoryItem({
    scanState: createScanState(),
    expectedScanSessionId: 7,
    overallProductEvidenceScore: 65,
    timestamp: 100,
  });
  const otherItem = createSearchItem({ timestamp: 200 });
  const repeatedScan = history.createScanHistoryItem({
    scanState: createScanState({ scanSessionId: 8 }),
    expectedScanSessionId: 8,
    overallProductEvidenceScore: 70,
    timestamp: 300,
  });
  const items = history.upsertSearchHistoryItem(
    [otherItem, firstScan],
    repeatedScan,
  );

  assert.equal(items.length, 2);
  assert.equal(items[0].barcode, "0123456789012");
  assert.equal(items[0].timestamp, 300);
  assert.equal(items[0].evidenceSnapshot.score, 70);
});

test("reconciles authoritative snapshots without exceeding the bound", () => {
  const items = [
    createSearchItem({ timestamp: 300 }),
    createSearchItem({
      item: { id: "vitamin-d", name: "Vitamin D", evidenceScore: 70 },
      timestamp: 200,
    }),
    createSearchItem({
      item: { id: "zinc", name: "Zinc", evidenceScore: 60 },
      timestamp: 100,
    }),
  ];
  const reconciled = history.reconcileSearchHistoryEvidenceSnapshots(
    items,
    [
      {
        catalogId: "magnesium",
        score: 91,
        calculatedAt: 1000,
        calculationVersion: "authoritative.v2",
      },
    ],
    2,
  );

  assert.equal(reconciled.length, 2);
  assert.deepEqual(reconciled[0].evidenceSnapshot, {
    type: "active_ingredient_evidence",
    score: 91,
    calculatedAt: 1000,
    calculationVersion: "authoritative.v2",
  });
  assert.equal(reconciled[1].catalogId, "vitamin-d");
});

test("bounded product snapshot reconciliation refreshes canonical products only when newer", () => {
  const canonical = history.createSearchSelectionHistoryItem({
    item: {
      id: "product:11111111-1111-1111-1111-111111111111",
      canonicalProductId: "11111111-1111-1111-1111-111111111111",
      name: "Canonical product",
      catalogType: "supplement_product",
      evidenceScore: 70,
    },
    navigationDescriptor: {
      pathname: "/(modals)/modal/supplement-info",
      params: { id: "product:11111111-1111-1111-1111-111111111111" },
    },
    timestamp: 100,
  });
  const unresolved = history.createSearchSelectionHistoryItem({
    item: {
      id: "external:go_upc:abc",
      name: "Unresolved product",
      catalogType: "supplement_product",
      providerDescriptor: { provider: "go_upc", stableId: "abc" },
    },
    navigationDescriptor: {
      pathname: "/(modals)/modal/supplement-info",
      params: { resolutionSessionId: "session-a" },
    },
    timestamp: 90,
  });
  const newer = history.reconcileBoundedProductScoreSnapshots(
    [canonical, unresolved],
    [{
      product_id: canonical.canonicalProductId,
      score: 88.75,
      calculated_at: "2026-07-22T12:00:00.000Z",
      calculation_version: "recommended-dose-product-ranking.v1",
    }],
  );

  assert.equal(newer[0].evidenceSnapshot.score, 88.75);
  assert.equal(newer[0].evidenceSnapshot.calculatedAt, Date.parse("2026-07-22T12:00:00.000Z"));
  assert.equal(newer[1].canonicalProductId, null);
  assert.equal(newer[1].evidenceSnapshot, null);

  const older = history.reconcileBoundedProductScoreSnapshots(newer, [{
    product_id: canonical.canonicalProductId,
    score: 12,
    calculated_at: "2025-01-01T00:00:00.000Z",
    calculation_version: "old.v1",
  }]);
  assert.equal(older[0].evidenceSnapshot.score, 88.75);
});

test("history refresh RPC requests at most 50 canonical IDs and persists newer snapshots", async () => {
  const items = Array.from({ length: 55 }, (_, index) =>
    history.createSearchSelectionHistoryItem({
      item: {
        id: `product:${String(index).padStart(8, "0")}-0000-0000-0000-000000000000`,
        canonicalProductId: `${String(index).padStart(8, "0")}-0000-0000-0000-000000000000`,
        name: `Product ${index}`,
        catalogType: "supplement_product",
      },
      navigationDescriptor: {
        pathname: "/(modals)/modal/supplement-info",
        params: {},
      },
      timestamp: 1000 - index,
    }),
  );
  const storage = createMemoryStorage();
  let requestedIds = [];
  const client = {
    async rpc(name, args) {
      assert.equal(name, "get_product_score_snapshots");
      requestedIds = args.p_product_ids;
      return {
        data: [{
          product_id: requestedIds[0],
          score: 91,
          calculated_at: "2026-07-22T13:00:00.000Z",
          calculation_version: "recommended-dose-product-ranking.v1",
        }],
        error: null,
      };
    },
  };

  const refreshed = await history.refreshCanonicalProductHistoryScores(items, {
    storage,
    accountId: "user-a",
    client,
  });
  assert.equal(requestedIds.length, history.MAX_HISTORY_SCORE_REFRESH_IDS);
  assert.equal(refreshed[0].evidenceSnapshot.score, 91);
  assert.equal(
    storage.values.has(history.getAccountSearchHistoryStorageKey("user-a")),
    true,
  );
});

test("canonical detail evidence updates the same stored History item without reordering", async () => {
  const storage = createMemoryStorage();
  await history.recordSearchSelectionHistory(
    {
      item: {
        id: "product:canonical-product",
        canonicalProductId: "canonical-product",
        name: "Canonical product",
        catalogType: "supplement_product",
        evidenceScore: null,
      },
      navigationDescriptor: {
        pathname: "/(modals)/modal/supplement-info",
        params: { id: "product:canonical-product" },
      },
      timestamp: 123,
    },
    { storage, accountId: "user-a" },
  );

  const updated = await history.recordCanonicalProductEvidenceHistory(
    {
      canonicalProductId: "canonical-product",
      score: 81.375,
      calculatedAt: 500,
      calculationVersion: "recommended-dose-product-evidence.v1",
    },
    { storage, accountId: "user-a" },
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].timestamp, 123);
  assert.equal(updated[0].canonicalProductId, "canonical-product");
  assert.equal(updated[0].evidenceSnapshot.score, 81.375);
  assert.equal(
    updated[0].evidenceSnapshot.type,
    "overall_product_evidence",
  );
});

test("provider and barcode identity upgrades to canonical with evidence propagation", () => {
  const unresolved = history.createSearchSelectionHistoryItem({
    item: {
      id: "external:ean_search:0123456789012",
      name: "External product",
      catalogType: "supplement_product",
      barcode: "0123456789012",
      providerDescriptor: {
        provider: "ean_search",
        stableId: "0123456789012",
      },
    },
    navigationDescriptor: {
      pathname: "/(modals)/modal/supplement-info",
      params: { resolutionSessionId: "transient" },
    },
    timestamp: 321,
  });

  const updated = history.applyCanonicalProductEvidenceToHistory(
    [unresolved],
    {
      canonicalProductId: "canonical-product",
      barcode: "0123456789012",
      providerDescriptor: {
        provider: "ean_search",
        stableId: "0123456789012",
      },
      evidenceSnapshot: {
        type: "overall_product_evidence",
        score: 77.75,
        calculatedAt: 900,
        calculationVersion: "recommended-dose-product-evidence.v1",
      },
    },
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].timestamp, 321);
  assert.equal(updated[0].catalogId, "product:canonical-product");
  assert.equal(updated[0].evidenceSnapshot.score, 77.75);
});

test("genuinely unavailable canonical evidence remains null", () => {
  const unresolved = history.createSearchSelectionHistoryItem({
    item: {
      id: "product:canonical-product",
      canonicalProductId: "canonical-product",
      name: "Canonical product",
      catalogType: "supplement_product",
    },
    navigationDescriptor: {
      pathname: "/(modals)/modal/supplement-info",
      params: { id: "product:canonical-product" },
    },
    timestamp: 100,
  });
  const [unchanged] = history.applyCanonicalProductEvidenceToHistory(
    [unresolved],
    {
      canonicalProductId: "canonical-product",
      evidenceSnapshot: {
        type: "overall_product_evidence",
        score: null,
        calculatedAt: 200,
        calculationVersion: "recommended-dose-product-evidence.v1",
      },
    },
  );

  assert.equal(unchanged.evidenceSnapshot, null);
});
