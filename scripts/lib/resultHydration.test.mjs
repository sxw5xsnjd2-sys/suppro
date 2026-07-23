import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadResultHydrationModule() {
  const source = readFileSync(
    new URL("../../features/scanner/resultHydration.js", import.meta.url),
    "utf8",
  );
  const transformed = source.replace(/export function /gu, "function ");

  return new Function(
    `${transformed}\nreturn {
      applyScanResultIfCurrent,
      buildScanResultHydrationKey,
      clearScanResultHydrationCachesForTests,
      hydrateScanResultOnce,
      persistScanResultHistoryOnce,
    };`,
  )();
}

test("one scan hydration is shared across a mount and rerenders", async () => {
  const helpers = loadResultHydrationModule();
  helpers.clearScanResultHydrationCachesForTests();
  const hydrationKey = helpers.buildScanResultHydrationKey({
    scanRequestId: "scan-request-1",
    productId: "product-1",
    scanSessionId: 1,
  });
  let hydrationCalls = 0;
  const hydrate = async () => {
    hydrationCalls += 1;
    return { productId: "product-1" };
  };

  const [mountedResult, rerenderResult, backgroundUpdateResult] =
    await Promise.all([
      helpers.hydrateScanResultOnce(hydrationKey, hydrate),
      helpers.hydrateScanResultOnce(hydrationKey, hydrate),
      helpers.hydrateScanResultOnce(hydrationKey, hydrate),
    ]);

  assert.equal(hydrationCalls, 1);
  assert.equal(mountedResult, rerenderResult);
  assert.equal(rerenderResult, backgroundUpdateResult);
});

test("history persistence runs once for one displayed scan", async () => {
  const helpers = loadResultHydrationModule();
  helpers.clearScanResultHydrationCachesForTests();
  const hydrationKey = "scan-request-1:product-1";
  let historyCalls = 0;
  const persist = async () => {
    historyCalls += 1;
  };

  await Promise.all([
    helpers.persistScanResultHistoryOnce(hydrationKey, persist),
    helpers.persistScanResultHistoryOnce(hydrationKey, persist),
    helpers.persistScanResultHistoryOnce(hydrationKey, persist),
  ]);

  assert.equal(historyCalls, 1);
});

test("a new scan request creates a new hydration", async () => {
  const helpers = loadResultHydrationModule();
  helpers.clearScanResultHydrationCachesForTests();
  let hydrationCalls = 0;
  const hydrate = async () => {
    hydrationCalls += 1;
    return hydrationCalls;
  };

  const first = await helpers.hydrateScanResultOnce(
    "scan-request-1:product-1",
    hydrate,
  );
  const second = await helpers.hydrateScanResultOnce(
    "scan-request-2:product-1",
    hydrate,
  );

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(hydrationCalls, 2);
});

test("an older hydration result cannot overwrite a newer scan", async () => {
  const helpers = loadResultHydrationModule();
  helpers.clearScanResultHydrationCachesForTests();
  let resolveOlderHydration;
  const olderResult = new Promise((resolve) => {
    resolveOlderHydration = resolve;
  });
  const olderKey = "scan-request-1:product-1";
  const newerKey = "scan-request-2:product-2";
  let currentHydrationKey = olderKey;
  let displayedProductId = null;

  const olderPromise = helpers
    .hydrateScanResultOnce(olderKey, () => olderResult)
    .then((result) => {
      helpers.applyScanResultIfCurrent({
        hydrationKey: olderKey,
        currentHydrationKey,
        result,
        apply(value) {
          displayedProductId = value.productId;
        },
      });
    });

  currentHydrationKey = newerKey;
  const newerResult = await helpers.hydrateScanResultOnce(newerKey, async () =>
    ({ productId: "product-2" }),
  );
  const newerApplied = helpers.applyScanResultIfCurrent({
    hydrationKey: newerKey,
    currentHydrationKey,
    result: newerResult,
    apply(value) {
      displayedProductId = value.productId;
    },
  });

  resolveOlderHydration({ productId: "product-1" });
  await olderPromise;

  assert.equal(newerApplied, true);
  assert.equal(displayedProductId, "product-2");
});
