import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductScoreBackfillCheckpoint,
  buildProductScoreBackfillPageQuery,
  parseProductScoreBackfillArgs,
} from "./productScoreBackfillPolicy.mjs";

test("backfill defaults to dry-run and a bounded page", () => {
  const flags = parseProductScoreBackfillArgs([]);
  assert.equal(flags.write, false);
  assert.equal(flags.batchLimit, 25);
  assert.equal(flags.calculationVersion, "recommended-dose-product-ranking.v1");
  assert.deepEqual(
    buildProductScoreBackfillPageQuery({ cursor: null, batchLimit: 25 }),
    { afterProductId: null, limit: 25 },
  );
});

test("write mode is explicit and oversized batches are rejected", () => {
  assert.equal(parseProductScoreBackfillArgs(["--write"]).write, true);
  assert.throws(
    () => parseProductScoreBackfillArgs(["--batch-limit", "26"]),
    /between 1 and 25/u,
  );
});

test("checkpoint retains cursor and version for duplicate-free resume", () => {
  const checkpoint = buildProductScoreBackfillCheckpoint({
    cursor: "product-025",
    calculationVersion: "ranking.v2",
    processed: 25,
    computed: 25,
    written: 0,
    failed: 0,
    complete: false,
  });
  assert.equal(checkpoint.cursor, "product-025");
  assert.equal(checkpoint.calculationVersion, "ranking.v2");
  assert.equal(checkpoint.processed, 25);
  assert.equal(checkpoint.written, 0);
});
