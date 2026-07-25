import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function dataUrlForSource(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

async function loadProductImagesModule() {
  const source = readFileSync(
    new URL("../../src/lib/productImages.js", import.meta.url),
    "utf8",
  )
    .replace(
      'import { CATALOG_TYPES } from "@/features/supplements/catalog";',
      'const CATALOG_TYPES = { ACTIVE_INGREDIENT: "active_ingredient", SUPPLEMENT_PRODUCT: "supplement_product" };',
    )
    .replace(
      'import { normalizeEdgeFunctionInvokeError } from "@src/lib/edgeFunctionErrors";',
      "const normalizeEdgeFunctionInvokeError = async (error) => error;",
    )
    .replace(
      'import { logBuildAwareDiagnostic } from "@src/lib/runtimeConfig";',
      "const logBuildAwareDiagnostic = () => {};",
    )
    .replace(
      'import { getAccessTokenOrCreateSession, supabase } from "@src/lib/supabase";',
      'const getAccessTokenOrCreateSession = async () => "token"; const supabase = { functions: { invoke: (...args) => globalThis.__productImageTestInvoke(...args) } };',
    );
  return import(dataUrlForSource(source));
}

const productImages = await loadProductImagesModule();

test("missing image candidates are unique and exclude thumbnail-backed rows", () => {
  assert.deepEqual(
    productImages.getMissingProductImageIds([
      { productId: "product-a", productImageUrl: null },
      { productId: "product-a", productImageUrl: "" },
      { productId: "product-b", image_thumbnail_url: "thumb.png" },
      { product_id: "product-c", image_url: "full.png" },
    ]),
    ["product-a"],
  );
});

test("recent failed and skipped products are not re-enqueued", () => {
  const recent = new Date().toISOString();
  assert.deepEqual(
    productImages.getMissingProductImageIds([
      {
        productId: "failed-product",
        productImageStatus: "failed",
        productImageLastCheckedAt: recent,
      },
      {
        productId: "skipped-product",
        productImageStatus: "skipped",
        productImageLastCheckedAt: recent,
      },
      {
        productId: "missing-product",
        productImageStatus: "missing",
      },
    ]),
    ["missing-product"],
  );
});

test("automatic enqueue is session-deduplicated and serialized", async () => {
  productImages.resetProductImageSessionForTests();
  const calls = [];
  let active = 0;
  let maximumActive = 0;
  globalThis.__productImageTestInvoke = async (_name, options) => {
    calls.push(options.body.productIds);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { data: { status: "queued" }, error: null };
  };

  await Promise.all([
    productImages.enqueueMissingProductImages(["product-a", "product-a"]),
    productImages.enqueueMissingProductImages(["product-a", "product-b"]),
  ]);
  const repeated = await productImages.enqueueMissingProductImages([
    "product-a",
    "product-b",
  ]);

  assert.deepEqual(calls, [["product-a"], ["product-b"]]);
  assert.equal(maximumActive, 1);
  assert.equal(repeated.status, "deduplicated");
  assert.equal(
    productImages.getAutomaticProductImageStateForTests("product-a"),
    "queued",
  );
});

test("successful terminal enqueue results are completed without polling", async () => {
  productImages.resetProductImageSessionForTests();
  globalThis.__productImageTestInvoke = async () => ({
    data: {
      status: "queued",
      results: [
        { product_id: "product-cached", enqueue_status: "cached" },
        { product_id: "product-cooldown", enqueue_status: "cooldown" },
      ],
    },
    error: null,
  });

  const result = await productImages.enqueueMissingProductImages([
    "product-cached",
    "product-cooldown",
  ]);

  assert.equal(result.attemptCompleted, true);
  assert.deepEqual(result.pollProductIds, []);
  assert.deepEqual(result.resolvedProductIds, ["product-cached"]);
  assert.deepEqual(result.terminalProductIds, ["product-cooldown"]);
  assert.equal(
    productImages.getAutomaticProductImageStateForTests("product-cached"),
    "resolved",
  );
  assert.equal(
    productImages.getAutomaticProductImageStateForTests("product-cooldown"),
    "cooldown",
  );
});

test("unsuccessful enqueue is tracked as retryable rather than completed", async () => {
  productImages.resetProductImageSessionForTests();
  let calls = 0;
  globalThis.__productImageTestInvoke = async () => {
    calls += 1;
    return {
      data: null,
      error: { status: 503, code: "temporarily_unavailable" },
    };
  };

  const result = await productImages.enqueueMissingProductImages([
    "product-retry",
  ]);
  const suppressedRetry = await productImages.enqueueMissingProductImages([
    "product-retry",
  ]);

  assert.equal(result.attemptCompleted, false);
  assert.equal(
    productImages.getAutomaticProductImageStateForTests("product-retry"),
    "retry_cooldown",
  );
  assert.equal(suppressedRetry.status, "deduplicated");
  assert.equal(calls, 1);
});

test("persisted image reads are deduplicated and sequentially bounded", async () => {
  const batches = [];
  const client = {
    from() {
      return {
        select() {
          return {
            async in(_column, productIds) {
              batches.push(productIds);
              return {
                data: productIds.map((product_id) => ({ product_id })),
                error: null,
              };
            },
          };
        },
      };
    },
  };
  const productIds = Array.from(
    { length: 120 },
    (_, index) => `product-${index}`,
  );

  const result = await productImages.getPersistedProductImages(
    [...productIds, productIds[0]],
    { client },
  );

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [50, 50, 20],
  );
  assert.equal(result.data.length, 120);
  assert.equal(result.error, null);
});
