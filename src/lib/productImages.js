import { CATALOG_TYPES } from "@/features/supplements/catalog";
import { getAccessTokenOrCreateSession, supabase } from "@src/lib/supabase";

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

export async function enrichProductImageIfNeeded(product) {
  try {
    if (!product || typeof product !== "object") return null;
    if (trimString(product.image_url) || trimString(product.imageUrl)) {
      return null;
    }
    if (!isSupplementProduct(product)) return null;

    const productId = trimString(product?.product_id || product?.id);
    if (!productId) return null;

    await getAccessTokenOrCreateSession();

    const { data, error } = await supabase.functions.invoke(
      "enrich-product-image",
      {
        body: { productId },
      }
    );

    if (error) {
      console.warn("[product-images] enrichment failed", error);
      return null;
    }

    return data ?? null;
  } catch (error) {
    console.warn("[product-images] enrichment failed", error);
    return null;
  }
}
