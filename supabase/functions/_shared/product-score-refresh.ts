import { PRODUCT_SCORE_CALCULATION_VERSION } from "./product-ranking-worker.js";

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUnavailableRpcError(error: Record<string, unknown> | null) {
  const code = trimString(error?.code);
  const message = trimString(error?.message).toLowerCase();
  return (
    code === "42883" ||
    code === "PGRST202" ||
    message.includes("could not find the function")
  );
}

export async function enqueueProductScoreRefresh({
  adminSupabase,
  productId,
  reason,
  calculationVersion = PRODUCT_SCORE_CALCULATION_VERSION,
}: {
  adminSupabase: any;
  productId: string;
  reason: string;
  calculationVersion?: string;
}) {
  const canonicalProductId = trimString(productId);
  if (!canonicalProductId) return false;

  const { error } = await adminSupabase.rpc("enqueue_product_score_refresh", {
    p_product_id: canonicalProductId,
    p_invalidation_reason: trimString(reason) || "canonical_product_changed",
    p_calculation_version: calculationVersion,
  });
  if (!error) return true;
  if (isUnavailableRpcError(error)) {
    console.warn("[product-score-refresh] queue RPC is not deployed yet");
    return false;
  }
  throw new Error(`[enqueue_product_score_refresh] ${error.message}`);
}

export async function enqueueProductScoreRefreshForSupplement({
  adminSupabase,
  supplementId,
  reason,
  calculationVersion = PRODUCT_SCORE_CALCULATION_VERSION,
}: {
  adminSupabase: any;
  supplementId: string;
  reason: string;
  calculationVersion?: string;
}) {
  const canonicalSupplementId = trimString(supplementId);
  if (!canonicalSupplementId) return false;

  const { error } = await adminSupabase.rpc(
    "enqueue_product_score_refresh_for_supplement",
    {
      p_supplement_id: canonicalSupplementId,
      p_invalidation_reason: trimString(reason) ||
        "canonical_supplement_changed",
      p_calculation_version: calculationVersion,
    },
  );
  if (!error) return true;
  if (isUnavailableRpcError(error)) {
    console.warn(
      "[product-score-refresh] linked-product queue RPC is not deployed yet",
    );
    return false;
  }
  throw new Error(
    `[enqueue_product_score_refresh_for_supplement] ${error.message}`,
  );
}
