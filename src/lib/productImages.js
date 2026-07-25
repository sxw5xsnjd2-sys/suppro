import { CATALOG_TYPES } from "@/features/supplements/catalog";
import { normalizeEdgeFunctionInvokeError } from "@src/lib/edgeFunctionErrors";
import { logBuildAwareDiagnostic } from "@src/lib/runtimeConfig";
import { getAccessTokenOrCreateSession, supabase } from "@src/lib/supabase";

export const PRODUCT_IMAGE_POLL_DELAYS_MS = [
  2_000,
  5_000,
  10_000,
  20_000,
  30_000,
  60_000,
  60_000,
];
const MAX_PRODUCT_IMAGE_ENQUEUE_BATCH = 25;
const MAX_PRODUCT_IMAGE_READ_BATCH = 50;
const PRODUCT_IMAGE_FAILED_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const PRODUCT_IMAGE_SKIPPED_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const AUTOMATIC_ENQUEUE_ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const completedAutomaticProductStates = new Map();
const inFlightAutomaticProductIds = new Set();
const automaticProductRetryAfter = new Map();
let automaticEnqueueChain = Promise.resolve();

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isSupplementProduct(product) {
  if (product?.catalogType === CATALOG_TYPES.ACTIVE_INGREDIENT) {
    return false;
  }

  return Boolean(
    product?.catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT ||
      product?.catalogType === "supplement_product" ||
      product?.product_id ||
      product?.barcode ||
      product?.brand ||
      product?.brand_name ||
      product?.display_name
  );
}

function getProductImageUrl(product) {
  return (
    trimString(product?.productImageThumbnailUrl) ||
    trimString(product?.image_thumbnail_url) ||
    trimString(product?.imageThumbnailUrl) ||
    trimString(product?.productImageUrl) ||
    trimString(product?.image_url) ||
    trimString(product?.imageUrl)
  );
}

function getProductId(product) {
  return trimString(product?.productId || product?.product_id || product?.id);
}

function getProductImageStatus(product) {
  return trimString(
    product?.productImageStatus || product?.image_status || product?.imageStatus,
  ).toLowerCase();
}

function getProductImageLastCheckedAt(product) {
  return Date.parse(
    trimString(
      product?.productImageLastCheckedAt ||
        product?.image_last_checked_at ||
        product?.imageLastCheckedAt,
    ),
  );
}

function isProductImageCoolingDown(product, now = Date.now()) {
  const status = getProductImageStatus(product);
  const lastCheckedAt = getProductImageLastCheckedAt(product);
  if (!Number.isFinite(lastCheckedAt)) {
    return status === "failed" || status === "skipped";
  }

  const cooldownMs =
    status === "failed"
      ? PRODUCT_IMAGE_FAILED_COOLDOWN_MS
      : status === "skipped"
        ? PRODUCT_IMAGE_SKIPPED_COOLDOWN_MS
        : 0;
  return cooldownMs > 0 && now - lastCheckedAt < cooldownMs;
}

function isAutomaticProductSuppressed(productId, now = Date.now()) {
  return (
    inFlightAutomaticProductIds.has(productId) ||
    completedAutomaticProductStates.has(productId) ||
    (automaticProductRetryAfter.get(productId) ?? 0) > now
  );
}

export function getMissingProductImageIds(products) {
  return [
    ...new Set(
      (Array.isArray(products) ? products : [])
        .filter(
          (product) =>
            !getProductImageUrl(product) &&
            !isProductImageCoolingDown(product),
        )
        .map(getProductId)
        .filter(Boolean),
    ),
  ];
}

async function invokeProductImageFunction(body) {
  const accessToken = await getAccessTokenOrCreateSession();
  return supabase.functions.invoke("enrich-product-image", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });
}

export function enqueueMissingProductImages(productIds) {
  const candidates = [
    ...new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map(trimString)
        .filter(Boolean),
    ),
  ]
    .filter((productId) => !isAutomaticProductSuppressed(productId))
    .slice(0, MAX_PRODUCT_IMAGE_ENQUEUE_BATCH);

  if (!candidates.length) {
    return Promise.resolve({ status: "deduplicated", productIds: [] });
  }
  candidates.forEach((productId) => inFlightAutomaticProductIds.add(productId));

  const request = automaticEnqueueChain.then(async () => {
    try {
      const { data, error } = await invokeProductImageFunction({
        productIds: candidates,
      });
      if (error) {
        const normalizedError = await normalizeEdgeFunctionInvokeError(error, {
          fallbackMessage: "Product image enqueue failed.",
        });
        logBuildAwareDiagnostic("warn", "[product-images] enqueue failed", {
          developmentDetails: {
            status: normalizedError.status,
            code: normalizedError.code,
            isQuotaLimited: normalizedError.isQuotaLimited,
            retryAfterSeconds: normalizedError.retryAfterSeconds,
          },
          productionDetails: {
            status: normalizedError.status,
            code: normalizedError.code,
            isQuotaLimited: normalizedError.isQuotaLimited,
          },
        });
        const retryAfterMs = Math.max(
          Number(normalizedError.retryAfterSeconds || 0) * 1000,
          AUTOMATIC_ENQUEUE_ERROR_COOLDOWN_MS,
        );
        candidates.forEach((productId) => {
          automaticProductRetryAfter.set(productId, Date.now() + retryAfterMs);
        });
        return {
          status: "error",
          productIds: candidates,
          pollProductIds: [],
          attemptCompleted: false,
          error: normalizedError,
        };
      }
      const response = data ?? { status: "queued", productIds: candidates };
      const resultsByProductId = new Map(
        (Array.isArray(response.results) ? response.results : []).map((row) => [
          trimString(row?.product_id || row?.productId),
          trimString(row?.enqueue_status || row?.status).toLowerCase(),
        ]),
      );
      const pollProductIds = [];
      const resolvedProductIds = [];
      const terminalProductIds = [];
      const fallbackStatus = trimString(response.status).toLowerCase();

      candidates.forEach((productId) => {
        const status = resultsByProductId.get(productId) || fallbackStatus;
        if (status === "queued" || status === "deduplicated") {
          completedAutomaticProductStates.set(productId, status);
          pollProductIds.push(productId);
          return;
        }
        if (status === "cached" || status === "found" || status === "completed") {
          completedAutomaticProductStates.set(productId, "resolved");
          resolvedProductIds.push(productId);
          return;
        }
        if (
          status === "cooldown" ||
          status === "failed" ||
          status === "skipped" ||
          status === "missing_product"
        ) {
          completedAutomaticProductStates.set(productId, status);
          terminalProductIds.push(productId);
          return;
        }

        automaticProductRetryAfter.set(
          productId,
          Date.now() + AUTOMATIC_ENQUEUE_ERROR_COOLDOWN_MS,
        );
      });

      return {
        ...response,
        productIds: candidates,
        pollProductIds,
        resolvedProductIds,
        terminalProductIds,
        attemptCompleted:
          pollProductIds.length +
            resolvedProductIds.length +
            terminalProductIds.length ===
          candidates.length,
      };
    } catch (error) {
      logBuildAwareDiagnostic("warn", "[product-images] enqueue failed", {
        developmentDetails: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
      candidates.forEach((productId) => {
        automaticProductRetryAfter.set(
          productId,
          Date.now() + AUTOMATIC_ENQUEUE_ERROR_COOLDOWN_MS,
        );
      });
      return {
        status: "error",
        productIds: candidates,
        pollProductIds: [],
        attemptCompleted: false,
        error,
      };
    } finally {
      candidates.forEach((productId) =>
        inFlightAutomaticProductIds.delete(productId),
      );
    }
  });

  automaticEnqueueChain = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

export async function enrichProductImageIfNeeded(product) {
  try {
    if (!product || typeof product !== "object") return null;
    if (trimString(product.image_url) || trimString(product.imageUrl)) {
      return null;
    }
    if (!isSupplementProduct(product)) return null;

    const productId = trimString(product?.product_id || product?.id);
    if (!productId) return null;

    const { data, error } = await invokeProductImageFunction({ productId });

    if (error) {
      const normalizedError = await normalizeEdgeFunctionInvokeError(error, {
        fallbackMessage: "Image enrichment failed.",
      });
      logBuildAwareDiagnostic("warn", "[product-images] enrichment failed", {
        developmentDetails: {
          status: normalizedError.status,
          code: normalizedError.code,
          isQuotaLimited: normalizedError.isQuotaLimited,
          retryAfterSeconds: normalizedError.retryAfterSeconds,
        },
        productionDetails: {
          status: normalizedError.status,
          code: normalizedError.code,
          isQuotaLimited: normalizedError.isQuotaLimited,
        },
      });
      return null;
    }

    return data ?? null;
  } catch (error) {
    logBuildAwareDiagnostic("warn", "[product-images] enrichment failed", {
      developmentDetails: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return null;
  }
}

export function resetProductImageSessionForTests() {
  completedAutomaticProductStates.clear();
  inFlightAutomaticProductIds.clear();
  automaticProductRetryAfter.clear();
  automaticEnqueueChain = Promise.resolve();
}

export function getAutomaticProductImageStateForTests(productId) {
  const normalizedProductId = trimString(productId);
  if (inFlightAutomaticProductIds.has(normalizedProductId)) return "in_flight";
  if (completedAutomaticProductStates.has(normalizedProductId)) {
    return completedAutomaticProductStates.get(normalizedProductId);
  }
  if ((automaticProductRetryAfter.get(normalizedProductId) ?? 0) > Date.now()) {
    return "retry_cooldown";
  }
  return null;
}

export function recordPersistedProductImageStates(imageRows) {
  const pollProductIds = [];

  for (const row of Array.isArray(imageRows) ? imageRows : []) {
    const productId = getProductId(row);
    if (!productId) continue;
    if (getProductImageUrl(row)) {
      completedAutomaticProductStates.set(productId, "resolved");
      continue;
    }
    if (isProductImageCoolingDown(row)) {
      completedAutomaticProductStates.set(productId, getProductImageStatus(row));
      continue;
    }
    if (["queued", "deduplicated"].includes(
      completedAutomaticProductStates.get(productId),
    )) {
      pollProductIds.push(productId);
    }
  }

  return pollProductIds;
}

export async function getPersistedProductImages(
  productIds,
  { client = supabase } = {},
) {
  const normalizedProductIds = [
    ...new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map(trimString)
        .filter(Boolean),
    ),
  ];

  if (!normalizedProductIds.length) {
    return { data: [], error: null };
  }

  const data = [];
  for (
    let index = 0;
    index < normalizedProductIds.length;
    index += MAX_PRODUCT_IMAGE_READ_BATCH
  ) {
    const productIdBatch = normalizedProductIds.slice(
      index,
      index + MAX_PRODUCT_IMAGE_READ_BATCH,
    );
    const response = await client
      .from("supplement_products_master")
      .select(
        "product_id, image_url, image_thumbnail_url, image_status, image_last_checked_at",
      )
      .in("product_id", productIdBatch);
    if (response.error) {
      return { data, error: response.error };
    }
    data.push(...(response.data ?? []));
  }

  return { data, error: null };
}
