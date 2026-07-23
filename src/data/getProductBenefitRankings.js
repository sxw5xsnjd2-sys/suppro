import {
  buildProductRankingCursor,
  buildProductRankingRpcArgs,
  normalizeProductRankingPage,
  PRODUCT_RANKING_PAGE_LIMIT,
} from "@/features/supplements/productRankingContract";
import { supabase } from "@src/lib/supabase";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isUnavailableProductRankingError(error) {
  const code = trimString(error?.code);
  const message = trimString(error?.message).toLowerCase();
  return (
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST204" ||
    message.includes("could not find the function") ||
    message.includes("schema cache")
  );
}

function classifyProductRankingError(error) {
  if (isUnavailableProductRankingError(error)) return "rpc_unavailable";

  const code = trimString(error?.code).toLowerCase();
  const message = trimString(error?.message).toLowerCase();
  const status = Number(error?.status);
  if (
    status === 401 ||
    status === 403 ||
    ["401", "403", "pgrst301", "jwt_expired"].includes(code) ||
    message.includes("jwt") ||
    message.includes("unauthorized") ||
    message.includes("permission denied")
  ) {
    return "authentication";
  }
  if (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("offline")
  ) {
    return "network";
  }
  return "unknown";
}

function buildProductRankingFailure(error) {
  const reason = classifyProductRankingError(error);
  return {
    status: reason === "rpc_unavailable" ? "unavailable" : "error",
    reason,
    items: [],
    nextCursor: null,
    hasMore: false,
  };
}

export async function getProductBenefitRankingPage({
  benefitLabel,
  cursor = null,
  limit = PRODUCT_RANKING_PAGE_LIMIT,
  client = supabase,
} = {}) {
  const args = buildProductRankingRpcArgs({
    benefitLabel,
    cursor,
    limit,
  });
  if (!args.p_benefit_key) {
    return {
      status: "invalid",
      reason: "invalid_request",
      items: [],
      nextCursor: null,
      hasMore: false,
    };
  }

  let response;
  try {
    response = await client.rpc("get_product_benefit_rankings", args);
  } catch (error) {
    return buildProductRankingFailure(error);
  }

  const { data, error } = response;
  if (error) {
    return buildProductRankingFailure(error);
  }

  const items = normalizeProductRankingPage(data);
  const nextCursor = items.length
    ? buildProductRankingCursor(items[items.length - 1])
    : null;

  return {
    status: "ready",
    items,
    nextCursor,
    hasMore:
      Array.isArray(data) && data.length === args.p_limit && Boolean(nextCursor),
  };
}
