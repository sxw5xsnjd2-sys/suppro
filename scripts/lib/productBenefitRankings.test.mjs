import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function dataUrlForSource(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

const contractSource = readFileSync(
  new URL(
    "../../features/supplements/productRankingContract.js",
    import.meta.url,
  ),
  "utf8",
);
const scoringSource = readFileSync(
  new URL(
    "../../features/supplements/productBenefitScoring.js",
    import.meta.url,
  ),
  "utf8",
);
const contractUrl = dataUrlForSource(contractSource);
const contract = await import(contractUrl);
const scoring = await import(dataUrlForSource(scoringSource));

async function loadClientModule() {
  const source = readFileSync(
    new URL("../../src/data/getProductBenefitRankings.js", import.meta.url),
    "utf8",
  )
    .replace(
      "@/features/supplements/productRankingContract",
      contractUrl,
    )
    .replace(
      'import { supabase } from "@src/lib/supabase";',
      "const supabase = null;",
    );
  return import(dataUrlForSource(source));
}

const clientModule = await loadClientModule();

function productRow(overrides = {}) {
  return {
    product_id: "11111111-1111-4111-8111-111111111111",
    product_name: "Canonical Product",
    product_brand: "Canonical Brand",
    product_image_url: "https://images.example.com/canonical-product.png",
    normalized_product_name: "canonical product",
    verification_status: "verified",
    verification_precedence: 100,
    benefit_label: "Sleep support",
    benefit_key: "sleep support",
    product_benefit_score: 60.49,
    overall_evidence_score: 82.2,
    overall_evidence_sort_score: 82.2,
    driver_canonical_ingredient_id:
      "22222222-2222-4222-8222-222222222222",
    driver_ingredient_name: "Magnesium",
    calculation_version: contract.PRODUCT_SCORE_CALCULATION_VERSION,
    calculated_at: "2026-07-22T12:00:00.000Z",
    ...overrides,
  };
}

test("ranking route entity defaults to active ingredients for compatibility", () => {
  assert.equal(
    contract.resolveBenefitRankingEntityType(undefined),
    contract.BENEFIT_RANKING_ENTITY_TYPES.ACTIVE_INGREDIENT,
  );
  assert.equal(
    contract.resolveBenefitRankingEntityType("unexpected"),
    contract.BENEFIT_RANKING_ENTITY_TYPES.ACTIVE_INGREDIENT,
  );
  assert.equal(
    contract.resolveBenefitRankingEntityType("product"),
    contract.BENEFIT_RANKING_ENTITY_TYPES.PRODUCT,
  );
});

test("product ranking RPC arguments are bounded and use the full keyset cursor", () => {
  const cursor = contract.buildProductRankingCursor(productRow());
  const args = contract.buildProductRankingRpcArgs({
    benefitLabel: " Sleep support ",
    limit: 1_000,
    cursor,
  });

  assert.equal(args.p_benefit_key, "Sleep support");
  assert.equal(args.p_limit, contract.PRODUCT_RANKING_MAX_PAGE_LIMIT);
  assert.equal(args.p_after_product_benefit_score, 60.49);
  assert.equal(args.p_after_overall_evidence_sort_score, 82.2);
  assert.equal(args.p_after_verification_precedence, 100);
  assert.equal(args.p_after_normalized_product_name, "canonical product");
  assert.equal(
    args.p_after_product_id,
    "11111111-1111-4111-8111-111111111111",
  );

  const incomplete = contract.buildProductRankingRpcArgs({
    benefitLabel: "Sleep support",
    cursor: { productBenefitScore: 60 },
  });
  assert.equal(incomplete.p_after_product_benefit_score, null);
  assert.equal(incomplete.p_after_product_id, null);
});

test("normalization excludes unknown scores and preserves full-precision server order", () => {
  const rows = [
    productRow({ product_benefit_score: 60.49 }),
    productRow({
      product_id: "33333333-3333-4333-8333-333333333333",
      product_name: "Second Product",
      normalized_product_name: "second product",
      product_benefit_score: 60.4,
    }),
    productRow({
      product_id: "44444444-4444-4444-8444-444444444444",
      product_benefit_score: null,
    }),
  ];

  const normalized = contract.normalizeProductRankingPage(rows);
  assert.equal(normalized[0].productBrand, "Canonical Brand");
  assert.equal(
    normalized[0].productImageUrl,
    "https://images.example.com/canonical-product.png",
  );
  const unknownBrand = contract.normalizeProductRankingRow(
    productRow({ product_brand: " " }),
  );
  assert.equal(unknownBrand.productBrand, null);
  assert.deepEqual(
    normalized.map((item) => item.productBenefitScore),
    [60.49, 60.4],
  );
  assert.deepEqual(
    normalized.map((item) =>
      scoring.formatProductBenefitScoreText(item.productBenefitScore),
    ),
    ["60/100", "60/100"],
  );
});

test("page append deduplicates overlap without locally reordering rows", () => {
  const first = contract.normalizeProductRankingPage([
    productRow(),
    productRow({
      product_id: "33333333-3333-4333-8333-333333333333",
      product_name: "Second Product",
    }),
  ]);
  const next = contract.normalizeProductRankingPage([
    productRow({
      product_id: "33333333-3333-4333-8333-333333333333",
      product_name: "Second Product",
    }),
    productRow({
      product_id: "44444444-4444-4444-8444-444444444444",
      product_name: "Third Product",
    }),
  ]);

  assert.deepEqual(
    contract.appendProductRankingPage(first, next).map((item) => item.productName),
    ["Canonical Product", "Second Product", "Third Product"],
  );
});

test("product ranking client invokes one bounded RPC page and exposes the next cursor", async () => {
  const calls = [];
  const rows = [
    productRow(),
    productRow({
      product_id: "33333333-3333-4333-8333-333333333333",
      product_name: "Second Product",
      normalized_product_name: "second product",
      product_benefit_score: 59.999,
    }),
  ];
  const result = await clientModule.getProductBenefitRankingPage({
    benefitLabel: "Sleep support",
    limit: 2,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        return { data: rows, error: null };
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_product_benefit_rankings");
  assert.equal(calls[0].args.p_limit, 2);
  assert.equal(result.status, "ready");
  assert.equal(result.hasMore, true);
  assert.deepEqual(
    result.items.map((item) => item.productBrand),
    ["Canonical Brand", "Canonical Brand"],
  );
  assert.equal(result.nextCursor.productBenefitScore, 59.999);
  assert.deepEqual(
    result.items.map((item) => item.productBenefitScore),
    [60.49, 59.999],
  );
});

test("missing product-ranking RPC is a controlled unavailable state", async () => {
  const result = await clientModule.getProductBenefitRankingPage({
    benefitLabel: "Sleep support",
    client: {
      async rpc() {
        return {
          data: null,
          error: { code: "PGRST202", message: "schema cache" },
        };
      },
    },
  });

  assert.deepEqual(result, {
    status: "unavailable",
    reason: "rpc_unavailable",
    items: [],
    nextCursor: null,
    hasMore: false,
  });
});

test("an available ranking RPC with no cache rows is a distinct ready empty state", async () => {
  const result = await clientModule.getProductBenefitRankingPage({
    benefitLabel: "Sleep support",
    client: {
      async rpc() {
        return { data: [], error: null };
      },
    },
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.items, []);
  assert.equal(result.hasMore, false);
});

test("ranking client distinguishes authentication and network failures", async () => {
  const authentication = await clientModule.getProductBenefitRankingPage({
    benefitLabel: "Sleep support",
    client: {
      async rpc() {
        return {
          data: null,
          error: { status: 401, message: "JWT expired" },
        };
      },
    },
  });
  const network = await clientModule.getProductBenefitRankingPage({
    benefitLabel: "Sleep support",
    client: {
      async rpc() {
        throw new TypeError("Failed to fetch");
      },
    },
  });

  assert.equal(authentication.status, "error");
  assert.equal(authentication.reason, "authentication");
  assert.equal(network.status, "error");
  assert.equal(network.reason, "network");
});

test("rankings screens expose accessible segments and product compatibility routing", () => {
  const rankingsScreen = readFileSync(
    new URL("../../app/(tabs)/rankings.jsx", import.meta.url),
    "utf8",
  );
  const rankingRoute = readFileSync(
    new URL("../../app/benefit-ranking.jsx", import.meta.url),
    "utf8",
  );

  assert.match(rankingsScreen, /accessibilityRole="tablist"/);
  assert.match(rankingsScreen, /accessibilityRole="tab"/);
  assert.match(rankingsScreen, /accessibilityState=\{\{ selected \}\}/);
  assert.match(rankingsScreen, /Active ingredients/);
  assert.match(rankingsScreen, /Products/);
  assert.match(rankingsScreen, /entity: BENEFIT_RANKING_ENTITY_TYPES\.PRODUCT/);
  assert.match(rankingRoute, /resolveBenefitRankingEntityType/);
  assert.match(rankingRoute, /getProductBenefitRankingPage/);
  assert.match(rankingRoute, /createSupplementProductCatalogId/);
  assert.match(rankingRoute, /item\.productBrand/);
  assert.match(rankingRoute, /item\.productImageUrl/);
  assert.match(rankingRoute, /name="cube-outline"/);
  assert.match(rankingRoute, /titleAccessory=\{\s*isProductRanking \? null : \(/);
  assert.doesNotMatch(rankingRoute, /isProductRanking \? "products"/);
  assert.match(rankingRoute, /styles\.productBenefitScore\}>\{scoreText\}/);
  assert.match(
    rankingRoute,
    /styles\.productBenefitLabel[\s\S]*?\{item\.benefitLabel\}/,
  );
  assert.doesNotMatch(rankingRoute, /Driven by \{item\.driverIngredientName\}/);
  assert.doesNotMatch(rankingRoute, /Overall evidence \{overallEvidenceText\}/);
  assert.doesNotMatch(rankingRoute, /formatVerificationStatus/);
  assert.doesNotMatch(rankingRoute, /rank=\{index \+ 1\}/);
  assert.match(
    rankingRoute,
    /label=\{loadingMore \? "Loading\.\.\." : "Load more products"\}/,
  );
  assert.doesNotMatch(
    rankingRoute,
    />\s*\{loadingMore \? "Loading\.\.\." : "Load more products"\}\s*<\/AppButton>/,
  );
  assert.doesNotMatch(rankingRoute, /rankedProducts\.sort/);
});
