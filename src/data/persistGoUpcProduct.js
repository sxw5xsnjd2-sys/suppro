import { normalizeEdgeFunctionInvokeError } from "@src/lib/edgeFunctionErrors";
import { logBuildAwareDiagnostic } from "@src/lib/runtimeConfig";
import { getAccessTokenOrCreateSession, supabase } from "@src/lib/supabase";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getActiveIngredientsJson(product) {
  const ingredients =
    product?.active_ingredients_json ?? product?.activeIngredientsJson;

  return Array.isArray(ingredients) ? ingredients.filter(Boolean) : [];
}

function getIngredientCount(product) {
  const count = product?.ingredient_count ?? product?.ingredientCount;
  if (typeof count === "number" && Number.isFinite(count)) {
    return count;
  }

  const parsed = Number.parseInt(String(count ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const SUPPORTED_PROVISIONAL_SOURCES = new Set([
  "go_upc",
  "go_upc_plus_openai",
  "ean_search",
  "ean_search_plus_openai",
  "open_food_facts",
  "open_food_facts_plus_openai",
]);

function getProvisionalPersistenceSource(product) {
  const source =
    trimString(product?.scanDataSource) ||
    trimString(product?.source) ||
    trimString(product?.sourceStatusVerbose);

  return SUPPORTED_PROVISIONAL_SOURCES.has(source) ? source : "go_upc";
}

export async function persistGoUpcProduct(product, barcodeType) {
  if (!product || typeof product !== "object") {
    return null;
  }

  const barcode = trimString(product.barcode);
  const normalizedBarcodeType = trimString(
    barcodeType ?? product.barcodeType
  ).toLowerCase();
  const productName =
    trimString(product.productName) || trimString(product.name) || "";
  const activeIngredients = getActiveIngredientsJson(product);
  const sourceIngredients = Array.isArray(product.sourceIngredients)
    ? product.sourceIngredients
    : activeIngredients;

  if (!barcode || !productName) {
    return null;
  }

  try {
    const accessToken = await getAccessTokenOrCreateSession();
    const { data, error } = await supabase.functions.invoke(
      "persist-go-upc-product",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          source: getProvisionalPersistenceSource(product),
          barcode,
          barcodeType: normalizedBarcodeType || null,
          productName,
          brand: trimString(product.brand) || null,
          ingredientsText: trimString(product.ingredientsText) || null,
          servingSizeText:
            trimString(product.servingSizeText) ||
            trimString(product.serving_size_text) ||
            null,
          sourceIngredients,
          activeIngredientsJson: activeIngredients,
          active_ingredients_json: activeIngredients,
          ingredientCount: getIngredientCount(product),
          ingredient_count: getIngredientCount(product),
          imageUrl: trimString(product.imageUrl) || null,
          imageSourceUrl:
            trimString(product.imageSourceUrl) ||
            trimString(product.imageUrl) ||
            null,
          imageProvider: trimString(product.imageProvider) || null,
        },
      }
    );

    if (error) {
      const normalizedError = await normalizeEdgeFunctionInvokeError(error, {
        fallbackMessage: "Go-UPC persistence failed.",
      });
      logBuildAwareDiagnostic("warn", "[scanner] Go-UPC persistence failed", {
        developmentDetails: {
          status: normalizedError.status,
          code: normalizedError.code,
          message: normalizedError.message,
        },
      });
      return null;
    }

    return data ?? null;
  } catch (error) {
    logBuildAwareDiagnostic("warn", "[scanner] Go-UPC persistence failed", {
      developmentDetails: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return null;
  }
}

function buildDsldSourceIngredients(product) {
  if (!Array.isArray(product?.sourceIngredients)) {
    return [];
  }

  return product.sourceIngredients
    .map((ingredient) => {
      if (!ingredient || typeof ingredient !== "object") {
        return null;
      }

      const name = trimString(ingredient.name);
      if (!name) {
        return null;
      }

      return {
        name,
        dosageValue:
          typeof ingredient.dosageValue === "number" &&
          Number.isFinite(ingredient.dosageValue)
            ? ingredient.dosageValue
            : null,
        dosageUnit: trimString(ingredient.dosageUnit) || null,
        dosageDisplay: trimString(ingredient.dosageDisplay) || null,
        ingredientType: trimString(ingredient.ingredientType) || null,
        parentBlend: trimString(ingredient.parentBlend) || null,
      };
    })
    .filter(Boolean);
}

export async function persistDsldProduct(product, barcodeType) {
  if (!product || typeof product !== "object") {
    return null;
  }

  const barcode = trimString(product.barcode);
  const normalizedBarcodeType = trimString(
    barcodeType ?? product.barcodeType
  ).toLowerCase();
  const productName =
    trimString(product.productName) || trimString(product.name) || "";

  if (!barcode || !productName) {
    return null;
  }

  try {
    const accessToken = await getAccessTokenOrCreateSession();
    const { data, error } = await supabase.functions.invoke(
      "persist-go-upc-product",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          source: "dsld",
          barcode,
          barcodeType: normalizedBarcodeType || null,
          productName,
          brand: trimString(product.brand) || null,
          servingSizeText: trimString(product.servingSizeText) || null,
          sourceIngredients: buildDsldSourceIngredients(product),
          dsldId: product.dsldMatch?.dsld_id ?? null,
          dsldConfidence: trimString(product.dsldMatch?.confidence) || null,
          exactBarcodeMatch:
            trimString(product.dsldMatch?.confidence).toLowerCase() === "high",
          imageUrl: trimString(product.imageUrl) || null,
          imageSourceUrl:
            trimString(product.imageSourceUrl) ||
            trimString(product.imageUrl) ||
            null,
          imageProvider: trimString(product.imageProvider) || null,
        },
      }
    );

    if (error) {
      const normalizedError = await normalizeEdgeFunctionInvokeError(error, {
        fallbackMessage: "DSLD persistence failed.",
      });
      logBuildAwareDiagnostic("warn", "[scanner] DSLD persistence failed", {
        developmentDetails: {
          status: normalizedError.status,
          code: normalizedError.code,
          message: normalizedError.message,
        },
      });
      return null;
    }

    return data ?? null;
  } catch (error) {
    logBuildAwareDiagnostic("warn", "[scanner] DSLD persistence failed", {
      developmentDetails: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return null;
  }
}
