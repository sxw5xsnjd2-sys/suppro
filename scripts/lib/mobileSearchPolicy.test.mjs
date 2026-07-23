import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../features/search/searchPolicy.js", import.meta.url),
  "utf8",
);
const policy = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const searchContentSource = readFileSync(
  new URL(
    "../../features/search/components/SupplementSearchContent.jsx",
    import.meta.url,
  ),
  "utf8",
);

function product(overrides = {}) {
  return {
    id: "external:ean_search:1",
    name: "Magnesium Complex",
    brand: "Acme",
    catalogType: "supplement_product",
    evidenceScore: null,
    sources: [{ provider: "ean_search", stableId: "1" }],
    ...overrides,
  };
}

function loadSearchScoreFacade() {
  const facade = readFileSync(
    new URL("../../src/data/searchSupplementProducts.js", import.meta.url),
    "utf8",
  )
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");
  const normalizeEvidenceSnapshot = (value) => {
    const calculatedAt =
      typeof value?.calculatedAt === "string"
        ? Date.parse(value.calculatedAt)
        : value?.calculatedAt;
    return value &&
      Number.isFinite(value.score) &&
      Number.isFinite(calculatedAt) &&
      value.calculationVersion
      ? {
          type: value.type,
          score: value.score,
          calculatedAt,
          calculationVersion: value.calculationVersion,
        }
      : null;
  };
  const normalizeProductScoreSnapshotRow = (row) => {
    const evidenceSnapshot = normalizeEvidenceSnapshot({
      type: "overall_product_evidence",
      score: row?.score,
      calculatedAt: row?.calculated_at,
      calculationVersion: row?.calculation_version,
    });
    return row?.product_id && evidenceSnapshot
      ? { productId: row.product_id, evidenceSnapshot }
      : null;
  };
  const isNewerProductScoreSnapshot = (current, incoming) =>
    !current || incoming.calculatedAt > current.calculatedAt;
  const factory = new Function(
    "CATALOG_TYPES",
    "createSupplementProductCatalogId",
    "normalizeEvidenceSnapshot",
    "normalizeProductScoreSnapshotRow",
    "isNewerProductScoreSnapshot",
    "fetchBoundedProductScoreSnapshots",
    "supabase",
    `${facade}\nreturn { hydrateCanonicalSearchResultScores, normalizeEdgeProduct, reconcileCanonicalSearchResultScores };`,
  );

  return factory(
    {
      ACTIVE_INGREDIENT: "active_ingredient",
      SUPPLEMENT_PRODUCT: "supplement_product",
      CUSTOM: "custom",
    },
    (id) => `product:${id}`,
    normalizeEvidenceSnapshot,
    normalizeProductScoreSnapshotRow,
    isNewerProductScoreSnapshot,
    async () => [],
    {},
  );
}

const searchScores = loadSearchScoreFacade();

test("mobile product dedupe creates exactly one Products section", () => {
  const products = policy.dedupeMobileProductResults([
    product({ barcode: "123-456" }),
    product({
      id: "product:canonical",
      canonicalProductId: "canonical",
      barcode: "123456",
      name: "Canonical Magnesium",
      sources: [{ provider: "master", stableId: "canonical" }],
    }),
  ]);
  const sections = policy.buildMobileSearchSections({
    products,
    activeIngredients: [{ id: "magnesium", name: "Magnesium" }],
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].canonicalProductId, "canonical");
  assert.equal(sections.filter((section) => section.key === "products").length, 1);
});

test("aliases collapse onto and retain the canonical active ingredient identity", () => {
  const [result] = policy.mergeCanonicalActiveIngredientResults(
    [],
    [
      {
        id: "canonical-b12",
        name: "Vitamin B12",
        matchedAlias: "Cobalamin",
      },
    ],
  );
  assert.equal(result.id, "canonical-b12");
  assert.equal(result.name, "Vitamin B12");
  assert.equal(result.matchedAlias, "Cobalamin");
});

test("starting a newer request cancels and invalidates the older generation", () => {
  const guard = policy.createLatestSearchRequestGuard();
  const first = guard.begin();
  const second = guard.begin();

  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  assert.notEqual(first.requestId, second.requestId);
});

test("one provider failure remains partial and Go blocking is availability metadata", () => {
  const availability = policy.summarizeSearchAvailability({
    master: { status: "success" },
    dsld: { status: "timeout" },
    ean_search: { status: "cached" },
    go_upc: { status: "config_blocked" },
  });

  assert.equal(availability.hasPartialFailure, true);
  assert.deepEqual(availability.failedSources, [
    { source: "dsld", status: "timeout" },
  ]);
  assert.deepEqual(availability.blockedSources, ["go_upc"]);
});

test("external unknown evidence stays null", () => {
  const [result] = policy.dedupeMobileProductResults([product()]);
  assert.equal(result.evidenceScore, null);
});

test("canonical Search results use evidence embedded in the federated response", () => {
  const result = searchScores.normalizeEdgeProduct({
    provider: "master",
    providerStableId: "canonical-product",
    canonicalProductId: "canonical-product",
    name: "Canonical product",
    evidenceSnapshot: {
      type: "overall_product_evidence",
      score: 83.625,
      calculatedAt: "2026-07-22T15:00:00.000Z",
      calculationVersion: "recommended-dose-product-evidence.v1",
    },
  });

  assert.equal(result.evidenceScore, 83.625);
  assert.equal(result.evidenceSnapshot.score, 83.625);
});

test("canonical Search score hydration makes one bounded bulk request and preserves null", async () => {
  let calls = 0;
  let requestedIds = [];
  const sections = [
    {
      key: "products",
      data: [
        product({
          id: "product:one",
          canonicalProductId: "one",
          evidenceScore: null,
        }),
        product({
          id: "product:two",
          canonicalProductId: "two",
          evidenceScore: null,
        }),
        product({
          id: "product:already-rated",
          canonicalProductId: "already-rated",
          evidenceScore: 91,
          evidenceSnapshot: {
            type: "overall_product_evidence",
            score: 91,
            calculatedAt: Date.parse("2026-07-22T16:00:00.000Z"),
            calculationVersion: "recommended-dose-product-evidence.v1",
          },
        }),
      ],
    },
  ];
  const hydrated = await searchScores.hydrateCanonicalSearchResultScores(
    sections,
    {
      client: {},
      async fetchSnapshots(productIds) {
        calls += 1;
        requestedIds = productIds;
        return [
          {
            product_id: "one",
            score: 76.875,
            calculated_at: "2026-07-22T15:00:00.000Z",
            calculation_version: "recommended-dose-product-ranking.v1",
          },
          {
            product_id: "two",
            score: null,
            calculated_at: "2026-07-22T15:00:00.000Z",
            calculation_version: "recommended-dose-product-ranking.v1",
          },
        ];
      },
    },
  );

  assert.equal(calls, 1);
  assert.deepEqual(requestedIds, ["one", "two"]);
  assert.equal(hydrated[0].data[0].evidenceScore, 76.875);
  assert.equal(hydrated[0].data[1].evidenceScore, null);
  assert.equal(hydrated[0].data[2].evidenceScore, 91);
});

test("Search reloads unified History when it regains focus after product detail", () => {
  assert.match(searchContentSource, /useFocusEffect\(/u);
  assert.match(
    searchContentSource,
    /useFocusEffect\([\s\S]*loadSearchHistory\(\)[\s\S]*setRecentSearches/u,
  );
});

test("unverified product status is not presented as verified", () => {
  assert.equal(
    policy.getProductVerificationLabel(
      product({ verificationStatus: "go_upc_unverified" }),
    ),
    "Unverified",
  );
  assert.equal(
    policy.getProductVerificationLabel(
      product({ verificationStatus: "dsld_verified" }),
    ),
    "Verified",
  );
});

test("Edge outage preserves local master, active ingredient, and custom results", () => {
  const result = policy.composeMobileSearchResult({
    localSections: [
      { key: "products", data: [product({ id: "product:local" })] },
      {
        key: "active-ingredients",
        data: [{ id: "zinc", name: "Zinc" }],
      },
      {
        key: "custom-supplements",
        data: [{ id: "custom:1", name: "My zinc" }],
      },
    ],
    localSources: {
      local_master: { status: "success" },
      local_active: { status: "success" },
      local_custom: { status: "success" },
    },
    edgeSources: {
      edge: { status: "unavailable" },
      dsld: { status: "unavailable" },
      ean_search: { status: "unavailable" },
      go_upc: { status: "config_blocked" },
    },
    edgeError: { kind: "offline" },
  });

  assert.equal(result.state, "offline_partial");
  assert.deepEqual(
    result.sections.map((section) => section.key),
    ["products", "active-ingredients", "custom-supplements"],
  );
});

test("client search code contains no public or raw provider credential access", () => {
  const facade = readFileSync(
    new URL("../../src/data/searchSupplementProducts.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(facade, /EXPO_PUBLIC_(?:EAN_SEARCH_TOKEN|GO_UPC_API_KEY)/);
  assert.doesNotMatch(facade, /EAN_SEARCH_TOKEN|GO_UPC_API_KEY/);
  assert.match(facade, /body: \{ query: normalizedQuery, requestId \},\s+signal,/u);
});

test("incomplete detail handoff uses a transient session and null evidence", () => {
  const store = readFileSync(
    new URL("../../features/search/resolutionStore.js", import.meta.url),
    "utf8",
  );
  const detail = readFileSync(
    new URL(
      "../../app/(modals)/modal/supplement-info.jsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(store, /evidence_score: null/);
  assert.match(store, /searchResolutionIncomplete: true/);
  assert.match(detail, /source === "search-resolution"/);
  assert.match(detail, /searchResolutionPayload/);
});

test("canonical Search selections always hand off with the catalogue product identity", () => {
  const facade = readFileSync(
    new URL("../../src/data/searchSupplementProducts.js", import.meta.url),
    "utf8",
  )
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");
  const canonicalize = new Function(
    "CATALOG_TYPES",
    "createSupplementProductCatalogId",
    `${facade}\nreturn canonicalizeSearchProductSelection;`,
  )(
    { SUPPLEMENT_PRODUCT: "supplement_product" },
    (id) => `product:${id}`,
  );

  const result = canonicalize({
    id: "provider-shaped-id",
    canonicalProductId: "canonical-id",
    name: "Canonical product",
    evidenceScore: null,
  });
  assert.equal(result.id, "product:canonical-id");
  assert.equal(result.catalogType, "supplement_product");
  assert.equal(result.source, "master");
  assert.match(
    facade,
    /status: normalized\.canonicalProductId \? "resolved" : "incomplete"/u,
  );

  const searchContent = readFileSync(
    new URL(
      "../../features/search/components/SupplementSearchContent.jsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(searchContent, /item = canonicalizeSearchProductSelection\(item\)/u);
  assert.match(searchContent, /params: \{ id: item\.id, name: item\.name \}/u);
});

test("Search history evidence dots retain green amber red and grey thresholds", () => {
  const evidenceSource = readFileSync(
    new URL("../../components/common/ui/EvidenceDots.jsx", import.meta.url),
    "utf8",
  )
    .split("export function EvidenceDots")[0]
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace(/export function /g, "function ");
  const getEvidenceDisplay = new Function(
    "appTheme",
    `${evidenceSource}\nreturn getEvidenceDisplay;`,
  )({
    colors: {
      evidenceUnknown: "grey",
      evidenceStrong: "green",
      evidenceModerate: "amber",
      evidenceLow: "red",
    },
  });

  assert.equal(getEvidenceDisplay(75).color, "green");
  assert.equal(getEvidenceDisplay(74.99).color, "amber");
  assert.equal(getEvidenceDisplay(49.99).color, "red");
  assert.equal(getEvidenceDisplay(null).color, "grey");

  const searchContent = readFileSync(
    new URL(
      "../../features/search/components/SupplementSearchContent.jsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(searchContent, /<EvidenceStatusDot score=\{item\.evidenceScore\}/u);
  assert.match(searchContent, /Math\.round\(item\.evidenceScore\)/u);
});

test("Search tab has a heading, full-height list, and omits provider verification metadata", () => {
  const searchContent = readFileSync(
    new URL(
      "../../features/search/components/SupplementSearchContent.jsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(searchContent, /accessibilityRole="header"[\s\S]*Search/u);
  assert.match(
    searchContent,
    /screenTitle: \{[\s\S]*fontSize: 24,[\s\S]*fontFamily: typography\.fontFamily\.heading,[\s\S]*letterSpacing: -0\.7,/u,
  );
  assert.match(searchContent, /style=\{styles\.resultsList\}/u);
  assert.match(searchContent, /resultsList: \{ flex: 1 \}/u);
  assert.match(
    searchContent,
    /bottomInsetOffset=\{standalone \? 24 : -insets\.bottom\}/u,
  );
  assert.doesNotMatch(searchContent, /getProvenanceLabel/u);
  assert.doesNotMatch(searchContent, /getProductVerificationLabel/u);
});

test("search tab route is part of the semantic visible tab configuration", () => {
  const layout = readFileSync(
    new URL("../../app/(tabs)/_layout.jsx", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../../app/(tabs)/search.jsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /presentation="tab"/);
  assert.match(layout, /VISIBLE_TAB_ROUTES/u);
  assert.match(layout, /name="search"[\s\S]*?title: "Search"/u);
});
