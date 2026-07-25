export const MAX_PRODUCT_IMAGE_REFRESH_BATCH = 2;
export const PRODUCT_IMAGE_REFRESH_DAILY_LIMIT = 100;
export const PRODUCT_IMAGE_REFRESH_RETRY_SECONDS = 300;
export const PRODUCT_IMAGE_REFRESH_CONCURRENCY = 2;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), maximum);
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runNext(),
    ),
  );
  return results;
}

export function createSupabaseProductImageRefreshRepository(adminSupabase) {
  return {
    async claim({ limit, workerId, dailyLimit }) {
      const { data, error } = await adminSupabase.rpc(
        "claim_product_image_refresh_queue",
        {
          p_limit: limit,
          p_worker_id: workerId,
          p_daily_limit: dailyLimit,
        },
      );
      if (error) {
        throw new Error(`[claim_product_image_refresh_queue] ${error.message}`);
      }
      return data ?? [];
    },

    async complete({ queueId, workerId, outcome, errorMessage = null }) {
      const { error } = await adminSupabase.rpc(
        "complete_product_image_refresh",
        {
          p_queue_id: queueId,
          p_worker_id: workerId,
          p_outcome: outcome,
          p_error: trimString(errorMessage).slice(0, 500) || null,
        },
      );
      if (error) {
        throw new Error(`[complete_product_image_refresh] ${error.message}`);
      }
    },

    async retry({ queueId, workerId, errorMessage, retryAfterSeconds }) {
      const { error } = await adminSupabase.rpc(
        "retry_product_image_refresh",
        {
          p_queue_id: queueId,
          p_worker_id: workerId,
          p_error: trimString(errorMessage).slice(0, 500),
          p_retry_after_seconds: retryAfterSeconds,
        },
      );
      if (error) {
        throw new Error(`[retry_product_image_refresh] ${error.message}`);
      }
    },
  };
}

export async function runProductImageRefresh({
  repository,
  enrichProduct,
  limit = MAX_PRODUCT_IMAGE_REFRESH_BATCH,
  dailyLimit = PRODUCT_IMAGE_REFRESH_DAILY_LIMIT,
  concurrency = PRODUCT_IMAGE_REFRESH_CONCURRENCY,
  workerId = `product-image-worker:${crypto.randomUUID()}`,
}) {
  const boundedLimit = boundedInteger(
    limit,
    MAX_PRODUCT_IMAGE_REFRESH_BATCH,
    MAX_PRODUCT_IMAGE_REFRESH_BATCH,
  );
  const boundedDailyLimit = boundedInteger(
    dailyLimit,
    PRODUCT_IMAGE_REFRESH_DAILY_LIMIT,
    5000,
  );
  const boundedConcurrency = boundedInteger(
    concurrency,
    PRODUCT_IMAGE_REFRESH_CONCURRENCY,
    PRODUCT_IMAGE_REFRESH_CONCURRENCY,
  );
  const queueRows = await repository.claim({
    limit: boundedLimit,
    workerId,
    dailyLimit: boundedDailyLimit,
  });

  if (!queueRows.length) {
    return { requested: 0, completed: 0, failed: 0, retried: 0, results: [] };
  }

  const results = await mapWithConcurrency(
    queueRows,
    boundedConcurrency,
    async (queueRow) => {
      const queueId = trimString(queueRow?.id);
      const productId = trimString(queueRow?.product_id);

      try {
        if (!queueId || !productId) {
          throw new Error("Claimed image queue row is invalid.");
        }

        const result = await enrichProduct(productId);
        const outcome = trimString(result?.status);
        if (["found", "cached", "failed", "skipped"].includes(outcome)) {
          await repository.complete({
            queueId,
            workerId,
            outcome,
            errorMessage: result?.reason,
          });
          return {
            productId,
            status: ["found", "cached"].includes(outcome)
              ? "completed"
              : "failed",
            outcome,
          };
        }

        throw new Error("Image enrichment returned an unsupported outcome.");
      } catch (error) {
        const retryAfterSeconds = boundedInteger(
          error?.retryAfterSeconds,
          PRODUCT_IMAGE_REFRESH_RETRY_SECONDS,
          86400,
        );
        await repository.retry({
          queueId,
          workerId,
          errorMessage: error instanceof Error ? error.message : String(error),
          retryAfterSeconds,
        });
        return {
          productId,
          status: "retried",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  return {
    requested: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status === "failed").length,
    retried: results.filter((result) => result.status === "retried").length,
    results,
  };
}
