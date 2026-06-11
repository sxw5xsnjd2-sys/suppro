import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadIsCustomTrackedSupplement() {
  const source = readFileSync(
    new URL("../../features/supplements/isCustomTrackedSupplement.js", import.meta.url),
    "utf8"
  );

  const transformed = source.replace(/\bexport\s+/g, "");
  const factory = new Function(
    `${transformed}
return { isCustomTrackedSupplement };`
  );

  return factory().isCustomTrackedSupplement;
}

const isCustomTrackedSupplement = loadIsCustomTrackedSupplement();

test("detects tracked supplements saved with custom supplement ids", () => {
  assert.equal(
    isCustomTrackedSupplement({
      id: "tracked-1",
      catalogId: "custom:user-row-id",
      customSupplementId: "user-row-id",
    }),
    true
  );

  assert.equal(
    isCustomTrackedSupplement({
      id: "tracked-2",
      custom_supplement_id: "legacy-user-row-id",
    }),
    true
  );
});

test("detects custom tracker entries from catalog metadata", () => {
  assert.equal(
    isCustomTrackedSupplement({
      id: "tracked-3",
      catalogType: "custom",
    }),
    true
  );

  assert.equal(
    isCustomTrackedSupplement({
      id: "custom:user-row-id",
    }),
    true
  );
});

test("does not flag normal tracked supplements as custom", () => {
  assert.equal(
    isCustomTrackedSupplement({
      id: "tracked-4",
      catalogId: "vitamin-d",
      catalogType: "active_ingredient",
    }),
    false
  );
});
