import {
  isExpectedProtectedFunctionAccessError,
  normalizeEdgeFunctionError,
} from "@src/lib/edgeFunctionErrors";
import { getNonAnonymousAccessToken } from "@src/lib/authState";
import {
  logBuildAwareDiagnostic,
  SUPABASE_URL,
} from "@src/lib/runtimeConfig";
import { supabase } from "@src/lib/supabase";

const FUNCTION_NAME = "queue-missing-active-ingredients";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIngredient(item) {
  if (typeof item === "string") {
    return trimString(item);
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  return (
    trimString(item.name) ||
    trimString(item.canonicalName) ||
    trimString(item.canonical_name) ||
    trimString(item.rawName) ||
    trimString(item.raw_name)
  );
}

export async function queueMissingActiveIngredients({ productId, ingredients }) {
  const cleanProductId = trimString(productId);
  const cleanIngredients = Array.from(
    new Set((ingredients ?? []).map(normalizeIngredient).filter(Boolean))
  );
  const emptyResult = { queued: 0, normalizedNames: [] };

  if (!SUPABASE_URL || !cleanProductId || !cleanIngredients.length) {
    return emptyResult;
  }

  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) {
      logBuildAwareDiagnostic(
        "warn",
        "[queue-missing-active-ingredients] skipped",
        {
          developmentDetails: { reason: "session_error" },
        }
      );
      return emptyResult;
    }

    const accessToken = getNonAnonymousAccessToken(sessionData?.session ?? null);
    if (!accessToken) {
      return emptyResult;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        productId: cleanProductId,
        ingredients: cleanIngredients,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const normalizedError = normalizeEdgeFunctionError({
        status: response.status,
        responseText: errorText,
        retryAfterHeader: response.headers.get("Retry-After"),
        fallbackMessage: "Missing ingredient queue request failed.",
        unauthorizedMessage: "Please sign in to continue.",
      });

      if (
        normalizedError.isQuotaLimited ||
        normalizedError.status === 404 ||
        isExpectedProtectedFunctionAccessError(normalizedError)
      ) {
        return emptyResult;
      }

      logBuildAwareDiagnostic(
        "warn",
        "[queue-missing-active-ingredients] request failed",
        {
          developmentDetails: {
            status: normalizedError.status,
            code: normalizedError.code,
            retryAfterSeconds: normalizedError.retryAfterSeconds,
          },
          productionDetails: {
            status: normalizedError.status,
            code: normalizedError.code,
          },
        }
      );
      return emptyResult;
    }

    return (await response.json().catch(() => emptyResult)) ?? emptyResult;
  } catch (_error) {
    logBuildAwareDiagnostic(
      "warn",
      "[queue-missing-active-ingredients] request failed",
      {
        developmentDetails: { reason: "unexpected_error" },
      }
    );
    return emptyResult;
  }
}
