import { supabase } from "@src/lib/supabase";
import { isValidBarcode, normalizeBarcode } from "./getOpenFoodFactsProduct";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildBarcodeLookupCandidates(barcode) {
  const normalizedBarcode = normalizeBarcode(barcode);
  const candidates = [normalizedBarcode];

  if (/^\d{12}$/.test(normalizedBarcode)) {
    candidates.push(`0${normalizedBarcode}`);
  } else if (/^0\d{12}$/.test(normalizedBarcode)) {
    candidates.push(normalizedBarcode.slice(1));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function dedupeStrings(values) {
  return Array.from(new Set((values ?? []).map((value) => trimString(value)).filter(Boolean)));
}

function extractMasterIngredientNames(activeIngredientsJson) {
  if (!Array.isArray(activeIngredientsJson)) {
    return [];
  }

  return dedupeStrings(
    activeIngredientsJson.map((item) =>
      typeof item === "object" && item
        ? item.name
        : ""
    )
  );
}

export async function fetchLocalBarcodeScanProduct(barcode) {
  const normalizedBarcode = normalizeBarcode(barcode);
  if (!isValidBarcode(normalizedBarcode)) {
    return null;
  }

  const barcodeCandidates = buildBarcodeLookupCandidates(normalizedBarcode);
  const { data: productRows, error: productError } = await supabase
    .from("off_products")
    .select("id, barcode, name, ingredients")
    .in("barcode", barcodeCandidates);

  if (productError) {
    throw productError;
  }

  const product = barcodeCandidates
    .map((candidate) =>
      (productRows ?? []).find((row) => trimString(row?.barcode) === candidate)
    )
    .find(Boolean);

  if (!product?.id) {
    return null;
  }

  const { data: masterRows, error: masterError } = await supabase
    .from("supplement_products_master")
    .select("product_id, display_name, active_ingredients_json, serving_size_text")
    .eq("product_id", product.id)
    .limit(1);

  if (masterError) {
    throw masterError;
  }

  const master = Array.isArray(masterRows) ? masterRows[0] : null;
  const masterIngredientNames = extractMasterIngredientNames(
    master?.active_ingredients_json
  );
  const hasMaster = Boolean(master?.product_id);
  const productName =
    trimString(master?.display_name) ||
    trimString(product?.name) ||
    "Scanned supplement";
  const ingredientsText =
    masterIngredientNames.length > 0
      ? masterIngredientNames.join(", ")
      : trimString(product?.ingredients);
  const sourceStatusVerbose = hasMaster
    ? masterIngredientNames.length > 0
      ? "supplement_products_master"
      : "supplement_products_master_name_off_products_ingredients"
    : "off_products";

  return {
    barcode: trimString(product?.barcode) || normalizedBarcode,
    productId: trimString(product?.id) || null,
    productName,
    ingredientsText,
    sourceIngredients: masterIngredientNames,
    sourceStatus: 1,
    sourceStatusVerbose,
    scanDataSource: hasMaster
      ? "supplement_products_master"
      : "off_products",
    servingSizeText: trimString(master?.serving_size_text) || null,
  };
}
