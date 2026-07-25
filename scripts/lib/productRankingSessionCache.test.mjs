import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function dataUrlForSource(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

const source = readFileSync(
  new URL(
    "../../features/supplements/productRankingSessionCache.js",
    import.meta.url,
  ),
  "utf8",
);
const cache = await import(dataUrlForSource(source));

test("returning to a benefit restores the same persisted-image rows", () => {
  cache.resetProductRankingSessionCacheForTests();
  const items = [
    {
      productId: "product-a",
      productImageThumbnailUrl: "https://images.example.com/thumb.png",
      productImageUrl: "https://images.example.com/full.png",
    },
  ];
  cache.setCachedProductRanking(" Sleep   support ", {
    items,
    cursor: { productId: "product-a" },
    hasMore: true,
  });

  const restored = cache.getCachedProductRanking("sleep support");
  assert.equal(restored.items, items);
  assert.equal(restored.items[0].productImageUrl, items[0].productImageUrl);
  assert.equal(restored.hasMore, true);
});

test("row reconciliation updates a cached benefit without evicting other benefits", () => {
  cache.resetProductRankingSessionCacheForTests();
  const sleepItems = [{ productId: "sleep-product", productImageUrl: null }];
  const energyItems = [
    { productId: "energy-product", productImageUrl: "energy.png" },
  ];
  cache.setCachedProductRanking("Sleep support", { items: sleepItems });
  cache.setCachedProductRanking("Energy enhancing", { items: energyItems });

  const updatedSleepItems = [
    { ...sleepItems[0], productImageUrl: "sleep.png" },
  ];
  cache.updateCachedProductRankingItems("Sleep support", updatedSleepItems);

  assert.equal(
    cache.getCachedProductRanking("Sleep support").items,
    updatedSleepItems,
  );
  assert.equal(
    cache.getCachedProductRanking("Energy enhancing").items,
    energyItems,
  );
});
