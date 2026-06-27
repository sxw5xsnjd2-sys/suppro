import { supabase } from "@src/lib/supabase";
import { isValidBarcode, normalizeBarcode } from "./getOpenFoodFactsProduct";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeVerificationStatus(value) {
  const status = trimString(value);
  return status || "verified";
}

function buildBarcodeLookupCandidates(barcode, barcodeType) {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);
  const candidates = [normalizedBarcode];

  if (/^\d{12}$/.test(normalizedBarcode)) {
    candidates.push(`0${normalizedBarcode}`);
  } else if (/^0\d{12}$/.test(normalizedBarcode)) {
    candidates.push(normalizedBarcode.slice(1));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function getIngredientDisplayName(ingredient) {
  if (typeof ingredient === "string") {
    return trimString(ingredient);
  }

  if (!ingredient || typeof ingredient !== "object") {
    return "";
  }

  const name = trimString(ingredient.name);
  const dosageDisplay = trimString(ingredient.dosageDisplay);
  const dosageValue =
    typeof ingredient.dosageValue === "number" && Number.isFinite(ingredient.dosageValue)
      ? ingredient.dosageValue
      : null;
  const dosageUnit = trimString(ingredient.dosageUnit);

  if (!name) {
    return "";
  }

  if (dosageDisplay) {
    return `${name} ${dosageDisplay}`;
  }

  if (Number.isFinite(dosageValue) && dosageUnit) {
    return `${name} ${dosageValue}${dosageUnit}`;
  }

  return name;
}

function extractMasterIngredients(activeIngredientsJson) {
  if (!Array.isArray(activeIngredientsJson)) {
    return [];
  }

  const seen = new Set();
  const ingredients = [];

  activeIngredientsJson.forEach((item) => {
    const ingredient =
      item && typeof item === "object"
        ? (() => {
            const dosageValueRaw = item.dosageValue ?? item.dosage_value;
            return {
              name: trimString(item.name),
              dosageValue:
                typeof dosageValueRaw === "number" && Number.isFinite(dosageValueRaw)
                  ? dosageValueRaw
                  : null,
              dosageUnit: trimString(item.dosageUnit ?? item.dosage_unit) || null,
              dosageDisplay:
                trimString(
                  item.dosageDisplay ?? item.dosage_display ?? item.dosage_original_text
                ) || null,
              chemicalForm: trimString(item.chemicalForm ?? item.chemical_form) || null,
              amountBasis: trimString(item.amountBasis ?? item.amount_basis) || null,
            };
          })()
        : trimString(item);
    const key = getIngredientDisplayName(ingredient).toLowerCase();

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    ingredients.push(ingredient);
  });

  return ingredients;
}

async function fetchOffProductByProductId(productId) {
  if (!trimString(productId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("off_products")
    .select("id, barcode, name, ingredients")
    .eq("id", trimString(productId))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function fetchSupplementProductsMasterScanProduct(barcode, barcodeType) {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);
  if (!isValidBarcode(normalizedBarcode, barcodeType)) {
    return null;
  }

  const barcodeCandidates = buildBarcodeLookupCandidates(
    normalizedBarcode,
    barcodeType
  );
  const { data: masterBarcodeRows, error: masterBarcodeError } = await supabase
    .from("supplement_products_master")
    .select(
      "product_id, barcode, display_name, active_ingredients_json, serving_size_text, image_url, image_source_url, image_provider, verification_status"
    )
    .in("barcode", barcodeCandidates);

  if (masterBarcodeError) {
    throw masterBarcodeError;
  }

  const masterByBarcode = barcodeCandidates
    .map((candidate) =>
      (masterBarcodeRows ?? []).find((row) => trimString(row?.barcode) === candidate)
    )
    .find(Boolean);

  if (masterByBarcode?.product_id) {
    const offProduct = await fetchOffProductByProductId(masterByBarcode.product_id);
    const masterIngredients = extractMasterIngredients(
      masterByBarcode.active_ingredients_json
    );
    const verificationStatus = normalizeVerificationStatus(
      masterByBarcode.verification_status
    );

    return {
      barcode: trimString(masterByBarcode.barcode) || normalizedBarcode,
      productId: trimString(masterByBarcode.product_id) || null,
      productName:
        trimString(masterByBarcode.display_name) ||
        trimString(offProduct?.name) ||
        "Scanned supplement",
      ingredientsText:
        masterIngredients.length > 0
          ? masterIngredients.map((item) => getIngredientDisplayName(item)).join(", ")
          : trimString(offProduct?.ingredients),
      sourceIngredients: masterIngredients,
      sourceStatus: 1,
      sourceStatusVerbose:
        verificationStatus === "go_upc_unverified"
          ? "supplement_products_master_go_upc_unverified"
          : "supplement_products_master",
      scanDataSource: "supplement_products_master",
      servingSizeText: trimString(masterByBarcode.serving_size_text) || null,
      imageUrl: trimString(masterByBarcode.image_url) || null,
      imageSourceUrl: trimString(masterByBarcode.image_source_url) || null,
      imageProvider: trimString(masterByBarcode.image_provider) || null,
      verificationStatus,
      hasIncompleteDetails: verificationStatus === "go_upc_unverified",
    };
  }

  return null;
}

export async function fetchOffProductsBarcodeScanProduct(barcode, barcodeType) {
  const normalizedBarcode = normalizeBarcode(barcode, barcodeType);
  if (!isValidBarcode(normalizedBarcode, barcodeType)) {
    return null;
  }

  const barcodeCandidates = buildBarcodeLookupCandidates(
    normalizedBarcode,
    barcodeType
  );

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
    .select(
      "product_id, barcode, display_name, active_ingredients_json, serving_size_text, image_url, image_source_url, image_provider, verification_status"
    )
    .eq("product_id", product.id)
    .limit(1);

  if (masterError) {
    throw masterError;
  }

  const master = Array.isArray(masterRows) ? masterRows[0] : null;
  const masterIngredients = extractMasterIngredients(
    master?.active_ingredients_json
  );
  const hasMaster = Boolean(master?.product_id);
  const verificationStatus = normalizeVerificationStatus(master?.verification_status);
  const productName =
    trimString(master?.display_name) ||
    trimString(product?.name) ||
    "Scanned supplement";
  const ingredientsText =
    masterIngredients.length > 0
      ? masterIngredients.map((item) => getIngredientDisplayName(item)).join(", ")
      : trimString(product?.ingredients);
  const sourceStatusVerbose = hasMaster
    ? verificationStatus === "go_upc_unverified"
      ? "supplement_products_master_go_upc_unverified"
      : masterIngredients.length > 0
        ? "supplement_products_master"
        : "supplement_products_master_name_off_products_ingredients"
    : "off_products";

  return {
    barcode:
      trimString(master?.barcode) ||
      trimString(product?.barcode) ||
      normalizedBarcode,
    productId: trimString(product?.id) || null,
    productName,
    ingredientsText,
    sourceIngredients: masterIngredients,
    sourceStatus: 1,
    sourceStatusVerbose,
    scanDataSource: hasMaster
      ? "supplement_products_master"
      : "off_products",
    servingSizeText: trimString(master?.serving_size_text) || null,
    imageUrl: trimString(master?.image_url) || null,
    imageSourceUrl: trimString(master?.image_source_url) || null,
    imageProvider: trimString(master?.image_provider) || null,
    verificationStatus: hasMaster ? verificationStatus : null,
    hasIncompleteDetails:
      hasMaster && verificationStatus === "go_upc_unverified",
  };
}

export async function fetchLocalBarcodeScanProduct(barcode, barcodeType) {
  return (
    (await fetchSupplementProductsMasterScanProduct(barcode, barcodeType)) ||
    (await fetchOffProductsBarcodeScanProduct(barcode, barcodeType))
  );
}
