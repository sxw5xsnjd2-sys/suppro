import { normalizeEdgeFunctionInvokeError } from "@src/lib/edgeFunctionErrors";
import { logBuildAwareDiagnostic } from "@src/lib/runtimeConfig";
import { getAccessTokenOrCreateSession, supabase } from "@src/lib/supabase";
import { getLatencyTraceHeaders } from "@src/lib/latencyTelemetry";
import { normalizeIngredientDose } from "@/features/supplements/doseNormalization";
import {
  isRetailBarcodeType,
  isValidBarcode,
  normalizeBarcode,
} from "./getOpenFoodFactsProduct";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAmountValue(value) {
  const text = trimString(value).replace(",", ".");
  if (!text) {
    return null;
  }

  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[0]);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeOpenAiIngredient(ingredient) {
  if (!ingredient || typeof ingredient !== "object") {
    return null;
  }

  const name = trimString(ingredient.name);
  const amountText = trimString(ingredient.amount);
  const unit = trimString(ingredient.unit) || null;
  const rawText = trimString(ingredient.raw_text);
  const dosageValue = parseAmountValue(amountText);
  const rawDosageDisplay =
    amountText && unit
      ? `${amountText} ${unit}`
      : amountText || rawText || null;

  if (!name && !rawText) {
    return null;
  }

  const normalizedDose = normalizeIngredientDose(
    {
      ingredientName: name || rawText,
      dosageValue: Number.isFinite(dosageValue) ? dosageValue : null,
      dosageUnit: unit,
      dosageOriginalText: rawText || rawDosageDisplay,
      dosageDisplay: rawDosageDisplay,
      amountBasis:
        trimString(ingredient.per) === "serving" ? "per_serving" : null,
    },
    { allowDisplayParsing: true },
  );

  return {
    name: normalizedDose.ingredientName || name || rawText,
    amount: normalizedDose.value,
    unit: normalizedDose.unit,
    dosageValue: normalizedDose.value,
    dosageUnit: normalizedDose.unit,
    dosageOriginalText: normalizedDose.dosageOriginalText,
    dosageDisplay: normalizedDose.displayText,
    amountBasis: normalizedDose.amountBasis,
    doseConfidence: normalizedDose.doseConfidence,
    doseReviewReason: normalizedDose.doseReviewReason,
    normalizedDose,
    rawText: rawText || null,
    raw_text: rawText || null,
    source: "openai_web_search",
  };
}

function buildIngredientsText(data, sourceIngredients) {
  const explicitText = trimString(data?.ingredients_text);
  if (explicitText) {
    return explicitText;
  }

  return sourceIngredients
    .map((ingredient) => {
      if (ingredient.normalizedDose?.displayText) {
        return `${ingredient.name} ${ingredient.normalizedDose.displayText}`;
      }
      return trimString(ingredient.name);
    })
    .filter(Boolean)
    .join(", ");
}

function getActiveIngredientsJson(data, sourceIngredients) {
  if (Array.isArray(data?.active_ingredients_json)) {
    return data.active_ingredients_json.filter(Boolean);
  }

  return sourceIngredients;
}

function mapOpenAiBarcodeResult(data, fallbackBarcode) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const productName = trimString(data.product_name) || trimString(data.brand);
  const brand = trimString(data.brand);
  const sourceIngredients = Array.isArray(data.ingredients)
    ? data.ingredients.map(normalizeOpenAiIngredient).filter(Boolean)
    : [];
  const activeIngredientsJson = getActiveIngredientsJson(
    data,
    sourceIngredients
  );

  if (!productName && !brand) {
    return null;
  }

  return {
    barcode: trimString(data.barcode) || fallbackBarcode,
    productName,
    name: productName,
    brand,
    servingSizeText: trimString(data.serving_size) || null,
    ingredientsText: buildIngredientsText(data, sourceIngredients),
    sourceIngredients,
    active_ingredients_json: activeIngredientsJson,
    activeIngredientsJson,
    ingredient_count: activeIngredientsJson.length,
    ingredientCount: activeIngredientsJson.length,
    sourceStatus: 1,
    sourceStatusVerbose: "openai_web_search",
    scanDataSource: "openai_web_search",
    source: "openai_web_search",
    sourceUrls: Array.isArray(data.source_urls) ? data.source_urls : [],
    confidence: trimString(data.confidence) || "low",
    verificationStatus:
      trimString(data.verification_status) || "openai_unverified",
    verification_status:
      trimString(data.verification_status) || "openai_unverified",
    hasIncompleteDetails: true,
    persisted: data.persisted === true,
  };
}

export async function searchBarcodeWithOpenAi(barcode, options = {}) {
  const resolvedOptions =
    options && typeof options === "object" ? options : { barcodeType: options };
  const barcodeType = resolvedOptions.barcodeType;
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);

  if (
    !isRetailBarcodeType(barcodeType) ||
    !isValidBarcode(normalizedBarcode, barcodeType)
  ) {
    return null;
  }

  const telemetry = resolvedOptions.telemetry;
  const finishRequest = telemetry?.start?.("openai_web_search_request", {
    provider: "openai",
  });
  try {
    const accessToken = await (telemetry?.measure
      ? telemetry.measure(
          "openai_fallback_authentication",
          () => getAccessTokenOrCreateSession(),
          { provider: "supabase" }
        )
      : getAccessTokenOrCreateSession());
    const { data, error } = await supabase.functions.invoke(
      "search-barcode-with-openai",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...getLatencyTraceHeaders(telemetry),
        },
        body: {
          barcode: normalizedBarcode,
          productName: trimString(resolvedOptions.productName) || null,
          brand: trimString(resolvedOptions.brand) || null,
        },
      }
    );

    if (error) {
      const normalizedError = await normalizeEdgeFunctionInvokeError(error, {
        fallbackMessage: "OpenAI barcode fallback failed.",
      });
      logBuildAwareDiagnostic(
        "warn",
        "[scanner] OpenAI barcode fallback failed",
        {
          developmentDetails: {
            status: normalizedError.status,
            code: normalizedError.code,
            message: normalizedError.message,
          },
        }
      );
      finishRequest?.({ success: false, error: normalizedError });
      return null;
    }

    finishRequest?.({ success: true, found: Boolean(data) });
    return mapOpenAiBarcodeResult(data, normalizedBarcode);
  } catch (error) {
    finishRequest?.({ success: false, error });
    logBuildAwareDiagnostic(
      "warn",
      "[scanner] OpenAI barcode fallback failed",
      {
        developmentDetails: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      }
    );
    return null;
  }
}
