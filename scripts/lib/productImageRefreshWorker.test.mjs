import assert from "node:assert/strict";
import test from "node:test";

const worker = await import(
  "../../supabase/functions/_shared/product-image-refresh-worker.js"
);

function createRepository(queueRows) {
  const state = {
    claims: [],
    completions: [],
    retries: [],
  };
  return {
    state,
    async claim(args) {
      state.claims.push(args);
      return queueRows.slice(0, args.limit);
    },
    async complete(args) {
      state.completions.push(args);
    },
    async retry(args) {
      state.retries.push(args);
    },
  };
}

test("image worker bounds batch, concurrency, and daily budget", async () => {
  const repository = createRepository([
    { id: "queue-a", product_id: "product-a" },
    { id: "queue-b", product_id: "product-b" },
    { id: "queue-c", product_id: "product-c" },
  ]);
  let active = 0;
  let maximumActive = 0;

  const result = await worker.runProductImageRefresh({
    repository,
    limit: 99,
    dailyLimit: 100,
    concurrency: 99,
    workerId: "worker-a",
    async enrichProduct(productId) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { status: "found", productId };
    },
  });

  assert.equal(repository.state.claims[0].limit, 2);
  assert.equal(repository.state.claims[0].dailyLimit, 100);
  assert.equal(maximumActive, 2);
  assert.equal(result.requested, 2);
  assert.equal(result.completed, 2);
  assert.equal(repository.state.completions.length, 2);
});

test("known image failures complete terminally while transient errors retry", async () => {
  const terminalRepository = createRepository([
    { id: "queue-a", product_id: "product-a" },
  ]);
  const terminal = await worker.runProductImageRefresh({
    repository: terminalRepository,
    workerId: "worker-terminal",
    async enrichProduct() {
      return { status: "failed", reason: "No confident image match" };
    },
  });

  assert.equal(terminal.failed, 1);
  assert.equal(terminalRepository.state.completions[0].outcome, "failed");
  assert.equal(terminalRepository.state.retries.length, 0);

  const retryRepository = createRepository([
    { id: "queue-b", product_id: "product-b" },
  ]);
  const retry = await worker.runProductImageRefresh({
    repository: retryRepository,
    workerId: "worker-retry",
    async enrichProduct() {
      const error = new Error("Provider unavailable");
      error.retryAfterSeconds = 900;
      throw error;
    },
  });

  assert.equal(retry.retried, 1);
  assert.equal(retryRepository.state.retries[0].retryAfterSeconds, 900);
  assert.equal(retryRepository.state.completions.length, 0);
});
