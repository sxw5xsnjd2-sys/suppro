import { normalizeEdgeFunctionInvokeError } from "@src/lib/edgeFunctionErrors";
import { logBuildAwareDiagnostic } from "@src/lib/runtimeConfig";
import { getAccessTokenOrCreateSession, supabase } from "@src/lib/supabase";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
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
          barcode,
          barcodeType: normalizedBarcodeType || null,
          productName,
          brand: trimString(product.brand) || null,
          ingredientsText: trimString(product.ingredientsText) || null,
          imageUrl: trimString(product.imageUrl) || null,
          imageSourceUrl:
            trimString(product.imageSourceUrl) ||
            trimString(product.imageUrl) ||
            null,
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
