import { create } from "zustand";
import {
  canonicalizeBarcodeType,
  fetchOpenFoodFactsProduct,
  isRetailBarcodeType,
  isValidBarcode,
  normalizeBarcode,
} from "@src/data/getOpenFoodFactsProduct";
import {
  fetchSupplementProductsMasterScanProduct,
} from "@src/data/getLocalBarcodeScanProduct";
import { buildScanDebugMetadata } from "@src/data/dsldSourceDecision";
import { maybeFetchDsldScanMatch } from "@src/data/getDsldScanProduct";
import { fetchEanSearchProduct } from "@src/data/getEanSearchProduct";
import { fetchGoUpcProduct } from "@src/data/getGoUpcProduct";
import { searchBarcodeWithOpenAi } from "@src/data/searchBarcodeWithOpenAi";
import { fetchIngredientMatchCatalog } from "@src/data/getIngredientMatchCatalog";
import {
  persistDsldProduct,
  persistGoUpcProduct,
} from "@src/data/persistGoUpcProduct";
import { queueMissingActiveIngredients } from "@src/data/queueMissingActiveIngredients";
import { scanSupplementPhotos } from "@src/data/scanSupplementPhotos";
import { enrichProductImageIfNeeded } from "@src/lib/productImages";
import {
  buildPartialProductDetailFailure,
  createScannerFailure,
  normalizeBarcodeScanFailure,
  normalizePhotoRescueFailure,
  SCANNER_FAILURE_CATEGORIES,
} from "@src/lib/scannerFailure";
import {
  logBuildAwareDiagnostic,
  logDevelopmentDiagnostic,
} from "@src/lib/runtimeConfig";
import {
  extractIngredientCandidatesFromList,
  extractBestIngredientCandidates,
  matchIngredientsToCatalog,
} from "./ingredientMatching";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const PROVISIONAL_BARCODE_SOURCE_CONFIG = {
  go_upc: {
    source: "go_upc",
    enrichedSource: "go_upc_plus_openai",
    unverifiedStatus: "go_upc_unverified",
  },
  ean_search: {
    source: "ean_search",
    enrichedSource: "ean_search_plus_openai",
    unverifiedStatus: "ean_search_unverified",
  },
  open_food_facts: {
    source: "open_food_facts",
    enrichedSource: "open_food_facts_plus_openai",
    unverifiedStatus: "open_food_facts_unverified",
  },
};

function getProvisionalBarcodeSource(product) {
  const values = [
    product?.scanDataSource,
    product?.source,
    product?.sourceStatusVerbose,
    product?.verificationStatus,
    product?.verification_status,
  ]
    .map((value) => trimString(value).toLowerCase())
    .filter(Boolean);

  if (
    values.some(
      (value) =>
        value === "ean_search" ||
        value === "ean_search_plus_openai" ||
        value.includes("ean_search_unverified"),
    )
  ) {
    return "ean_search";
  }

  if (
    values.some(
      (value) =>
        value === "go_upc" ||
        value === "go_upc_plus_openai" ||
        value.includes("go_upc_unverified"),
    )
  ) {
    return "go_upc";
  }

  if (
    values.some(
      (value) =>
        value === "open_food_facts" ||
        value === "open_food_facts_plus_openai" ||
        value.includes("open_food_facts_unverified"),
    )
  ) {
    return "open_food_facts";
  }

  return null;
}

function getProvisionalBarcodeSourceConfig(product) {
  return PROVISIONAL_BARCODE_SOURCE_CONFIG[
    getProvisionalBarcodeSource(product)
  ];
}

function isOpenAiEnrichedProvisionalSource(source) {
  return (
    source === "go_upc_plus_openai" ||
    source === "ean_search_plus_openai" ||
    source === "open_food_facts_plus_openai"
  );
}

function getIngredientDisplayName(ingredient) {
  if (typeof ingredient === "string") {
    return trimString(ingredient);
  }

  if (!ingredient || typeof ingredient !== "object") {
    return "";
  }

  const name =
    trimString(ingredient.name) ||
    trimString(ingredient.canonicalName) ||
    trimString(ingredient.canonical_name) ||
    trimString(ingredient.rawName) ||
    trimString(ingredient.raw_name);
  const dosageDisplay =
    trimString(ingredient.dosageDisplay) ||
    trimString(ingredient.dosage_display) ||
    trimString(ingredient.dosageOriginalText) ||
    trimString(ingredient.dosage_original_text);
  const dosageValue =
    typeof ingredient.dosageValue === "number" &&
    Number.isFinite(ingredient.dosageValue)
      ? ingredient.dosageValue
      : typeof ingredient.dosage_value === "number" &&
          Number.isFinite(ingredient.dosage_value)
        ? ingredient.dosage_value
        : null;
  const dosageUnit =
    trimString(ingredient.dosageUnit) || trimString(ingredient.dosage_unit);

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

function buildPhotoRescueProduct({
  barcode,
  currentProduct,
  productId,
  displayName,
  productName,
  ingredients,
  servingSizeText,
  wroteCanonicalData,
}) {
  const nextProductName =
    trimString(displayName) ||
    trimString(productName) ||
    trimString(currentProduct?.productName) ||
    trimString(currentProduct?.name) ||
    "Scanned supplement";
  const nextSourceIngredients = Array.isArray(ingredients)
    ? ingredients.filter((item) => getIngredientDisplayName(item))
    : [];
  const ingredientDisplayNames = nextSourceIngredients
    .map((item) => getIngredientDisplayName(item))
    .filter(Boolean);

  return {
    ...(currentProduct && typeof currentProduct === "object"
      ? currentProduct
      : {}),
    barcode: trimString(barcode) || trimString(currentProduct?.barcode),
    productId:
      trimString(productId) || trimString(currentProduct?.productId) || null,
    productName: nextProductName,
    name: nextProductName,
    ingredientsText:
      ingredientDisplayNames.join(", ") ||
      trimString(currentProduct?.ingredientsText),
    sourceIngredients: nextSourceIngredients,
    sourceStatus:
      typeof currentProduct?.sourceStatus === "number"
        ? currentProduct.sourceStatus
        : 1,
    sourceStatusVerbose: wroteCanonicalData
      ? "photo_rescue_canonical"
      : trimString(currentProduct?.sourceStatusVerbose) || "photo_rescue",
    scanDataSource: wroteCanonicalData
      ? "supplement_products_master"
      : trimString(currentProduct?.scanDataSource) || "photo_rescue",
    verificationStatus: wroteCanonicalData
      ? "photo_verified"
      : trimString(currentProduct?.verificationStatus) || null,
    hasIncompleteDetails: wroteCanonicalData
      ? false
      : Boolean(currentProduct?.hasIncompleteDetails),
    servingSizeText:
      trimString(servingSizeText) ||
      trimString(currentProduct?.servingSizeText),
  };
}

function createInitialState() {
  return {
    status: "idle",
    error: null,
    permissionState: null,
    scanSessionId: 0,
    barcode: "",
    barcodeType: null,
    product: null,
    ingredients: [],
    matchedIngredients: [],
    matches: [],
    unmatchedIngredients: [],
    photoRescueStatus: "idle",
    photoRescueError: null,
    extractionSource: null,
    extractionConfidence: null,
  };
}

function shouldUseStructuredLocalIngredients(product) {
  return (
    (trimString(product?.scanDataSource) === "supplement_products_master" ||
      trimString(product?.scanDataSource) === "dsld") &&
    Array.isArray(product?.sourceIngredients) &&
    product.sourceIngredients.length > 0
  );
}

function mapDsldIngredientRow(row, ingredientType) {
  const name = trimString(row?.ingredient_name) || trimString(row?.name);
  if (!name) {
    return null;
  }

  const dosageValueRaw = row?.amount_per_serving;
  const dosageValue =
    typeof dosageValueRaw === "number" && Number.isFinite(dosageValueRaw)
      ? dosageValueRaw
      : Number.parseFloat(String(dosageValueRaw ?? "").trim());
  const dosageUnit = trimString(row?.amount_unit) || null;
  const hasValidDosageValue = Number.isFinite(dosageValue);
  const dosageDisplay =
    hasValidDosageValue && dosageUnit ? `${dosageValue}${dosageUnit}` : null;

  return {
    ...row,
    name,
    amount: hasValidDosageValue ? dosageValue : null,
    unit: dosageUnit,
    dosageValue: hasValidDosageValue ? dosageValue : null,
    dosageUnit,
    dosageDisplay,
    ingredientType,
    ingredient_type: ingredientType,
    parentBlend:
      trimString(row?.parentBlend) ||
      trimString(row?.parent_blend) ||
      trimString(row?.blend_name) ||
      null,
    parent_blend:
      trimString(row?.parent_blend) ||
      trimString(row?.parentBlend) ||
      trimString(row?.blend_name) ||
      null,
  };
}

function buildDsldSecondaryProduct({
  barcode,
  product,
  dsldMatch,
  sourceDecision,
}) {
  const dsldSourceIngredients = [
    ...(Array.isArray(dsldMatch?.active_ingredients_with_disclosed_dose)
      ? dsldMatch.active_ingredients_with_disclosed_dose.map((row) =>
          mapDsldIngredientRow(row, "active_with_disclosed_dose"),
        )
      : []),
    ...(Array.isArray(dsldMatch?.active_ingredients_without_disclosed_dose)
      ? dsldMatch.active_ingredients_without_disclosed_dose.map((row) =>
          mapDsldIngredientRow(row, "active_without_disclosed_dose"),
        )
      : []),
    ...(Array.isArray(dsldMatch?.proprietary_blend_rows)
      ? dsldMatch.proprietary_blend_rows.map((row) =>
          mapDsldIngredientRow(row, "proprietary_blend"),
        )
      : []),
  ].filter(Boolean);
  const dsldIngredientsText = dsldSourceIngredients
    .map((row) => trimString(row.name))
    .filter(Boolean)
    .join(", ");
  const productSourceIngredients = Array.isArray(product?.sourceIngredients)
    ? product.sourceIngredients
    : [];

  return {
    ...(product && typeof product === "object" ? product : {}),
    barcode: trimString(barcode) || trimString(product?.barcode),
    brand:
      trimString(product?.brand) || trimString(dsldMatch?.brand_name) || null,
    productName:
      trimString(product?.productName) ||
      trimString(dsldMatch?.product_name) ||
      null,
    ingredientsText:
      trimString(product?.ingredientsText) || dsldIngredientsText,
    sourceIngredients:
      productSourceIngredients.length > 0
        ? productSourceIngredients
        : dsldSourceIngredients,
    sourceStatus:
      typeof product?.sourceStatus === "number" ? product.sourceStatus : null,
    sourceStatusVerbose: trimString(product?.sourceStatusVerbose) || null,
    scanDataSource: trimString(product?.scanDataSource) || "dsld",
    servingSizeText:
      trimString(product?.servingSizeText) ||
      trimString(dsldMatch?.serving_size) ||
      null,
    imageUrl: trimString(product?.imageUrl) || null,
    imageSourceUrl: trimString(product?.imageSourceUrl) || null,
    dsldMatch,
    sourceDecision,
  };
}

function getProductImageUrl(product) {
  return (
    trimString(product?.imageUrl) ||
    trimString(product?.image_url) ||
    trimString(product?.image) ||
    null
  );
}

function enrichDsldProductWithGoUpcCosmetics(product, goUpcProduct) {
  const goUpcImageUrl = getProductImageUrl(goUpcProduct);
  const productImageUrl = getProductImageUrl(product);
  const goUpcProductName =
    trimString(goUpcProduct?.productName) || trimString(goUpcProduct?.name);

  return {
    ...product,
    imageUrl: productImageUrl || goUpcImageUrl,
    imageSourceUrl:
      trimString(product?.imageSourceUrl) ||
      trimString(product?.image_source_url) ||
      trimString(goUpcProduct?.imageSourceUrl) ||
      trimString(goUpcProduct?.image_source_url) ||
      goUpcImageUrl ||
      null,
    imageProvider:
      trimString(product?.imageProvider) ||
      trimString(product?.image_provider) ||
      (goUpcImageUrl ? "go_upc" : null),
    imageDataSource:
      trimString(product?.imageDataSource) ||
      trimString(product?.image_data_source) ||
      (goUpcImageUrl ? "go_upc" : null),
    displayName:
      trimString(product?.displayName) ||
      trimString(product?.display_name) ||
      goUpcProductName ||
      null,
  };
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

function buildIngredientsTextFromActiveIngredients(product) {
  return getActiveIngredientsJson(product)
    .map((ingredient) => getIngredientDisplayName(ingredient))
    .filter(Boolean)
    .join(", ");
}

function isIncompleteBarcodeProduct(product) {
  if (!product || typeof product !== "object") {
    return true;
  }

  if (getIngredientCount(product) === 0) {
    return true;
  }

  return getActiveIngredientsJson(product).length === 0;
}

function isIncompleteProvisionalBarcodeProduct(product) {
  if (!isIncompleteBarcodeProduct(product)) {
    return false;
  }

  return Boolean(getProvisionalBarcodeSource(product));
}

function getProductDisplayName(product) {
  return (
    trimString(product?.displayName) ||
    trimString(product?.display_name) ||
    trimString(product?.productName) ||
    trimString(product?.name)
  );
}

function chooseBetterDisplayName(goUpcProduct, openAiProduct) {
  const goUpcName = getProductDisplayName(goUpcProduct);
  const openAiName = getProductDisplayName(openAiProduct);

  if (!openAiName) {
    return goUpcName;
  }

  if (!goUpcName) {
    return openAiName;
  }

  const normalizedGoUpcName = goUpcName.toLowerCase();
  const normalizedOpenAiName = openAiName.toLowerCase();
  if (normalizedGoUpcName === normalizedOpenAiName) {
    return goUpcName;
  }

  if (
    normalizedOpenAiName.includes(normalizedGoUpcName) ||
    openAiName.length > goUpcName.length + 8
  ) {
    return openAiName;
  }

  return goUpcName;
}

function hasOpenAiBarcodeImprovement(goUpcProduct, openAiProduct) {
  if (!openAiProduct || typeof openAiProduct !== "object") {
    return false;
  }

  const openAiHasIngredients =
    getActiveIngredientsJson(openAiProduct).length > 0 ||
    (Array.isArray(openAiProduct.sourceIngredients) &&
      openAiProduct.sourceIngredients.length > 0);
  const openAiServingSize = trimString(openAiProduct.servingSizeText);
  const betterDisplayName =
    chooseBetterDisplayName(goUpcProduct, openAiProduct) !==
    getProductDisplayName(goUpcProduct);

  return Boolean(
    openAiHasIngredients || openAiServingSize || betterDisplayName,
  );
}

function mergeGoUpcWithOpenAiProduct(goUpcProduct, openAiProduct) {
  if (!hasOpenAiBarcodeImprovement(goUpcProduct, openAiProduct)) {
    return goUpcProduct;
  }

  const provisionalSourceConfig =
    getProvisionalBarcodeSourceConfig(goUpcProduct) ??
    PROVISIONAL_BARCODE_SOURCE_CONFIG.go_upc;
  const displayName = chooseBetterDisplayName(goUpcProduct, openAiProduct);
  const openAiActiveIngredients = getActiveIngredientsJson(openAiProduct);
  const goUpcActiveIngredients = getActiveIngredientsJson(goUpcProduct);
  const activeIngredients =
    openAiActiveIngredients.length > 0
      ? openAiActiveIngredients
      : goUpcActiveIngredients;
  const openAiSourceIngredients = Array.isArray(
    openAiProduct?.sourceIngredients,
  )
    ? openAiProduct.sourceIngredients
    : [];
  const goUpcSourceIngredients = Array.isArray(goUpcProduct?.sourceIngredients)
    ? goUpcProduct.sourceIngredients
    : [];
  const sourceIngredients =
    openAiSourceIngredients.length > 0
      ? openAiSourceIngredients
      : goUpcSourceIngredients;
  const ingredientCount =
    activeIngredients.length > 0
      ? activeIngredients.length
      : (getIngredientCount(openAiProduct) ?? getIngredientCount(goUpcProduct));

  return {
    ...goUpcProduct,
    active_ingredients_json: activeIngredients,
    activeIngredientsJson: activeIngredients,
    ingredient_count: ingredientCount,
    ingredientCount,
    serving_size_text:
      trimString(openAiProduct?.servingSizeText) ||
      trimString(openAiProduct?.serving_size_text) ||
      trimString(goUpcProduct?.servingSizeText) ||
      trimString(goUpcProduct?.serving_size_text) ||
      null,
    ingredientsText:
      trimString(openAiProduct?.ingredientsText) ||
      trimString(goUpcProduct?.ingredientsText),
    sourceIngredients,
    servingSizeText:
      trimString(openAiProduct?.servingSizeText) ||
      trimString(goUpcProduct?.servingSizeText) ||
      null,
    productName: displayName || null,
    name: displayName || null,
    displayName,
    display_name: displayName,
    sourceStatusVerbose: provisionalSourceConfig.enrichedSource,
    scanDataSource: provisionalSourceConfig.enrichedSource,
    source: provisionalSourceConfig.enrichedSource,
    barcode:
      trimString(goUpcProduct?.barcode) || trimString(openAiProduct?.barcode),
    product_id:
      trimString(goUpcProduct?.product_id) ||
      trimString(goUpcProduct?.productId) ||
      trimString(openAiProduct?.product_id) ||
      trimString(openAiProduct?.productId) ||
      null,
    productId:
      trimString(goUpcProduct?.productId) ||
      trimString(goUpcProduct?.product_id) ||
      trimString(openAiProduct?.productId) ||
      trimString(openAiProduct?.product_id) ||
      null,
    image_url:
      trimString(goUpcProduct?.image_url) ||
      trimString(goUpcProduct?.imageUrl) ||
      trimString(openAiProduct?.image_url) ||
      trimString(openAiProduct?.imageUrl) ||
      null,
    imageUrl:
      trimString(goUpcProduct?.imageUrl) ||
      trimString(goUpcProduct?.image_url) ||
      trimString(openAiProduct?.imageUrl) ||
      null,
    image_source_url:
      trimString(goUpcProduct?.image_source_url) ||
      trimString(goUpcProduct?.imageSourceUrl) ||
      trimString(openAiProduct?.image_source_url) ||
      trimString(openAiProduct?.imageSourceUrl) ||
      null,
    imageSourceUrl:
      trimString(goUpcProduct?.imageSourceUrl) ||
      trimString(goUpcProduct?.image_source_url) ||
      trimString(openAiProduct?.imageSourceUrl) ||
      trimString(openAiProduct?.image_source_url) ||
      null,
    imageProvider:
      trimString(goUpcProduct?.imageProvider) ||
      trimString(openAiProduct?.imageProvider) ||
      null,
    verificationStatus:
      trimString(goUpcProduct?.verificationStatus) ||
      trimString(openAiProduct?.verificationStatus) ||
      provisionalSourceConfig.unverifiedStatus,
    verification_status:
      trimString(goUpcProduct?.verification_status) ||
      trimString(openAiProduct?.verification_status) ||
      provisionalSourceConfig.unverifiedStatus,
    sourceUrls: Array.isArray(openAiProduct?.sourceUrls)
      ? openAiProduct.sourceUrls
      : goUpcProduct?.sourceUrls,
    hasIncompleteDetails: true,
  };
}

async function persistCanonicalDsldProduct(product, barcodeType) {
  const persisted = await persistDsldProduct(product, barcodeType);
  if (!persisted || typeof persisted !== "object") {
    return product;
  }

  return {
    ...product,
    productId:
      trimString(persisted.productId) || trimString(product?.productId) || null,
    verificationStatus:
      trimString(persisted.verificationStatus) ||
      trimString(product?.verificationStatus) ||
      "dsld_verified",
    hasIncompleteDetails: false,
  };
}

function logScannerSource(source, product) {
  logDevelopmentDiagnostic("log", "[scanner-source]", {
    source,
    scanDataSource: trimString(product?.scanDataSource) || null,
    barcode: trimString(product?.barcode) || null,
    productName:
      trimString(product?.productName) || trimString(product?.name) || null,
  });
}

async function persistProvisionalGoUpcProduct(product, barcodeType) {
  const persisted = await persistGoUpcProduct(product, barcodeType);
  if (!persisted || typeof persisted !== "object") {
    return product;
  }

  return {
    ...product,
    productId:
      trimString(persisted.productId) || trimString(product?.productId) || null,
    product_id:
      trimString(persisted.productId) ||
      trimString(persisted.product_id) ||
      trimString(product?.product_id) ||
      trimString(product?.productId) ||
      null,
    displayName:
      trimString(persisted.displayName) ||
      trimString(product?.displayName) ||
      trimString(product?.display_name) ||
      null,
    display_name:
      trimString(persisted.displayName) ||
      trimString(persisted.display_name) ||
      trimString(product?.display_name) ||
      trimString(product?.displayName) ||
      null,
    imageUrl:
      trimString(persisted.imageUrl) || trimString(product?.imageUrl) || null,
    image_url:
      trimString(persisted.imageUrl) ||
      trimString(persisted.image_url) ||
      trimString(product?.image_url) ||
      trimString(product?.imageUrl) ||
      null,
    imageSourceUrl:
      trimString(persisted.imageSourceUrl) ||
      trimString(product?.imageSourceUrl) ||
      null,
    image_source_url:
      trimString(persisted.imageSourceUrl) ||
      trimString(persisted.image_source_url) ||
      trimString(product?.image_source_url) ||
      trimString(product?.imageSourceUrl) ||
      null,
    imageProvider:
      trimString(persisted.imageProvider) ||
      trimString(product?.imageProvider) ||
      null,
    nameSource:
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      trimString(product?.nameSource) ||
      trimString(product?.name_source) ||
      null,
    name_source:
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      trimString(product?.name_source) ||
      trimString(product?.nameSource) ||
      null,
    namingSource:
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      trimString(product?.namingSource) ||
      trimString(product?.naming_source) ||
      null,
    naming_source:
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      trimString(product?.naming_source) ||
      trimString(product?.namingSource) ||
      null,
    sourceStatusVerbose:
      trimString(product?.sourceStatusVerbose) ||
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      null,
    scanDataSource:
      trimString(product?.scanDataSource) ||
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      null,
    source:
      trimString(product?.source) ||
      trimString(persisted.nameSource) ||
      trimString(persisted.name_source) ||
      null,
    serving_size_text:
      trimString(persisted.servingSizeText) ||
      trimString(persisted.serving_size_text) ||
      trimString(product?.serving_size_text) ||
      trimString(product?.servingSizeText) ||
      null,
    ingredientsText:
      trimString(persisted.ingredientsText) ||
      trimString(persisted.ingredients_text) ||
      trimString(product?.ingredientsText) ||
      buildIngredientsTextFromActiveIngredients(persisted) ||
      buildIngredientsTextFromActiveIngredients(product),
    servingSizeText:
      trimString(persisted.servingSizeText) ||
      trimString(persisted.serving_size_text) ||
      trimString(product?.servingSizeText) ||
      trimString(product?.serving_size_text) ||
      null,
    active_ingredients_json:
      getActiveIngredientsJson(persisted).length > 0
        ? getActiveIngredientsJson(persisted)
        : getActiveIngredientsJson(product),
    activeIngredientsJson:
      getActiveIngredientsJson(persisted).length > 0
        ? getActiveIngredientsJson(persisted)
        : getActiveIngredientsJson(product),
    ingredient_count:
      getIngredientCount(persisted) ?? getIngredientCount(product),
    ingredientCount:
      getIngredientCount(persisted) ?? getIngredientCount(product),
    verificationStatus:
      trimString(persisted.verificationStatus) ||
      trimString(product?.verificationStatus) ||
      getProvisionalBarcodeSourceConfig(product)?.unverifiedStatus ||
      "go_upc_unverified",
    verification_status:
      trimString(persisted.verificationStatus) ||
      trimString(persisted.verification_status) ||
      trimString(product?.verification_status) ||
      trimString(product?.verificationStatus) ||
      getProvisionalBarcodeSourceConfig(product)?.unverifiedStatus ||
      "go_upc_unverified",
  };
}

async function maybeApplyImageFallback(product) {
  if (!product || typeof product !== "object" || getProductImageUrl(product)) {
    return product;
  }

  const productId =
    trimString(product?.product_id) || trimString(product?.productId);
  if (!productId) {
    return product;
  }

  try {
    const imageResult = await enrichProductImageIfNeeded({
      ...product,
      product_id: productId,
    });

    if (
      !imageResult?.imageUrl ||
      (imageResult.status !== "found" && imageResult.status !== "cached")
    ) {
      return product;
    }

    return {
      ...product,
      imageUrl: imageResult.imageUrl,
      image_url: imageResult.imageUrl,
      imageSourceUrl:
        trimString(imageResult.sourceUrl) ||
        trimString(product?.imageSourceUrl) ||
        trimString(product?.image_source_url) ||
        imageResult.imageUrl,
      image_source_url:
        trimString(imageResult.sourceUrl) ||
        trimString(product?.image_source_url) ||
        trimString(product?.imageSourceUrl) ||
        imageResult.imageUrl,
      imageProvider:
        trimString(product?.imageProvider) || "enrich_product_image",
    };
  } catch (imageFallbackError) {
    logBuildAwareDiagnostic(
      "warn",
      "[scanner] image fallback failed after Open Food Facts match",
      {
        developmentDetails: {
          message:
            typeof imageFallbackError?.message === "string"
              ? imageFallbackError.message
              : "Unknown error",
        },
      },
    );
    return product;
  }
}

async function maybeEnrichIncompleteProvisionalBarcodeProduct(
  product,
  barcode,
  barcodeType,
) {
  if (!isIncompleteProvisionalBarcodeProduct(product)) {
    return product;
  }

  const provisionalSourceConfig =
    getProvisionalBarcodeSourceConfig(product) ??
    PROVISIONAL_BARCODE_SOURCE_CONFIG.go_upc;

  try {
    const openAiProduct = await searchBarcodeWithOpenAi(barcode, {
      barcodeType,
      fallbackSource: `${provisionalSourceConfig.source}_incomplete`,
      productName:
        trimString(product?.productName) ||
        trimString(product?.displayName) ||
        trimString(product?.name) ||
        null,
      brand: trimString(product?.brand) || null,
    });
    const mergedProduct = mergeGoUpcWithOpenAiProduct(product, openAiProduct);

    if (mergedProduct === product) {
      return product;
    }

    return await persistProvisionalGoUpcProduct(mergedProduct, barcodeType);
  } catch (openAiBarcodeError) {
    logBuildAwareDiagnostic(
      "warn",
      "[scanner] OpenAI barcode enrichment failed after incomplete provisional barcode match",
      {
        developmentDetails: {
          message:
            typeof openAiBarcodeError?.message === "string"
              ? openAiBarcodeError.message
              : "Unknown error",
        },
      },
    );
    return product;
  }
}

export const useScannerStore = create((set, get) => ({
  ...createInitialState(),

  setPermissionState: (permission) =>
    set(() => ({
      permissionState: permission
        ? {
            granted: Boolean(permission.granted),
            canAskAgain: Boolean(permission.canAskAgain),
            status: permission.status ?? "unknown",
          }
        : null,
    })),

  resetScan: () =>
    set((state) => ({
      ...createInitialState(),
      permissionState: state.permissionState,
      scanSessionId: state.scanSessionId,
    })),

  resetPhotoRescueState: () =>
    set(() => ({
      photoRescueStatus: "idle",
      photoRescueError: null,
    })),

  processBarcode: async (barcode, barcodeType) => {
    const nextBarcode = normalizeBarcode(barcode, barcodeType);
    const nextBarcodeType = canonicalizeBarcodeType(barcodeType) || null;
    const nextScanSessionId = get().scanSessionId + 1;

    if (!isValidBarcode(nextBarcode, nextBarcodeType)) {
      const invalid = normalizeScannerError({ code: "invalid_barcode" });

      set(() => ({
        status: invalid.status,
        error: invalid.error,
        scanSessionId: nextScanSessionId,
        barcode: nextBarcode,
        barcodeType: nextBarcodeType,
        product: null,
        ingredients: [],
        matchedIngredients: [],
        matches: [],
        unmatchedIngredients: [],
        photoRescueStatus: "idle",
        photoRescueError: null,
        extractionSource: null,
        extractionConfidence: null,
      }));

      return null;
    }

    set(() => ({
      status: "processing",
      error: null,
      scanSessionId: nextScanSessionId,
      barcode: nextBarcode,
      barcodeType: nextBarcodeType,
      product: null,
      ingredients: [],
      matchedIngredients: [],
      matches: [],
      unmatchedIngredients: [],
      photoRescueStatus: "idle",
      photoRescueError: null,
      extractionSource: null,
      extractionConfidence: null,
    }));

    try {
      let product = null;
      let extractionSource = null;
      const retailBarcode = isRetailBarcodeType(nextBarcodeType);
      let offFound = false;
      let offQuality = "missing";
      let dsldChecked = false;
      let dsldCacheHit = false;
      let dsldConfidence = null;

      try {
        product = await fetchSupplementProductsMasterScanProduct(
          nextBarcode,
          nextBarcodeType,
        );
        extractionSource = trimString(product?.scanDataSource) || null;
        if (product) {
          logScannerSource("local", product);
          product = await maybeEnrichIncompleteProvisionalBarcodeProduct(
            product,
            nextBarcode,
            nextBarcodeType,
          );
          extractionSource = trimString(product?.scanDataSource) || null;
          if (
            isOpenAiEnrichedProvisionalSource(
              trimString(product?.scanDataSource),
            )
          ) {
            logScannerSource(trimString(product?.scanDataSource), product);
          }
        }
      } catch (localLookupError) {
        logBuildAwareDiagnostic(
          "warn",
          "[scanner] supplement master lookup failed; falling back to DSLD",
          {
            developmentDetails: {
              message:
                typeof localLookupError?.message === "string"
                  ? localLookupError.message
                  : "Unknown error",
            },
          },
        );
      }

      if (!product && retailBarcode) {
        const dsldResult = await maybeFetchDsldScanMatch({
          barcode: nextBarcode,
          barcodeType: nextBarcodeType,
          productName: "",
        });
        dsldChecked = dsldResult.checked;
        dsldCacheHit = dsldResult.cacheHit;
        dsldConfidence = dsldResult.confidence;

        if (dsldResult.dsldMatch) {
          const sourceDecision = buildScanDebugMetadata({
            offFound,
            offQuality,
            dsldChecked,
            dsldCacheHit,
            dsldConfidence,
            finalSourceUsed: "photo_fallback_with_dsld",
          });
          product = buildDsldSecondaryProduct({
            barcode: nextBarcode,
            product: null,
            dsldMatch: dsldResult.dsldMatch,
            sourceDecision,
          });
          if (!getProductImageUrl(product)) {
            try {
              const goUpcCosmetics = await fetchGoUpcProduct(
                nextBarcode,
                nextBarcodeType,
              );
              if (goUpcCosmetics) {
                product = enrichDsldProductWithGoUpcCosmetics(
                  product,
                  goUpcCosmetics,
                );
              }
            } catch (goUpcError) {
              logBuildAwareDiagnostic(
                "warn",
                "[scanner] Go-UPC cosmetic enrichment failed after DSLD match",
                {
                  developmentDetails: {
                    message:
                      typeof goUpcError?.message === "string"
                        ? goUpcError.message
                        : "Unknown error",
                  },
                },
              );
            }
          }
          product = await persistCanonicalDsldProduct(product, nextBarcodeType);
          extractionSource = "dsld";
          logScannerSource("dsld", product);
        } else {
          try {
            product = await fetchGoUpcProduct(nextBarcode, nextBarcodeType);
            if (product) {
              product = await persistProvisionalGoUpcProduct(
                product,
                nextBarcodeType,
              );
              product = {
                ...product,
                hasIncompleteDetails: true,
              };
              product = await maybeEnrichIncompleteProvisionalBarcodeProduct(
                product,
                nextBarcode,
                nextBarcodeType,
              );
              extractionSource =
                trimString(product?.scanDataSource) || "go_upc";
              logScannerSource(extractionSource, product);
            }
          } catch (goUpcError) {
            logBuildAwareDiagnostic(
              "warn",
              "[scanner] Go-UPC lookup failed after DSLD miss",
              {
                developmentDetails: {
                  message:
                    typeof goUpcError?.message === "string"
                      ? goUpcError.message
                      : "Unknown error",
                },
              },
            );
          }

          if (!product) {
            try {
              product = await fetchEanSearchProduct(
                nextBarcode,
                nextBarcodeType,
              );
              if (product) {
                product = await persistProvisionalGoUpcProduct(
                  product,
                  nextBarcodeType,
                );
                product = {
                  ...product,
                  hasIncompleteDetails: true,
                };
                product = await maybeEnrichIncompleteProvisionalBarcodeProduct(
                  product,
                  nextBarcode,
                  nextBarcodeType,
                );
                extractionSource =
                  trimString(product?.scanDataSource) || "ean_search";
                logScannerSource(extractionSource, product);
              }
            } catch (eanSearchError) {
              logBuildAwareDiagnostic(
                "warn",
                "[scanner] EAN-Search lookup failed after Go-UPC miss",
                {
                  developmentDetails: {
                    message:
                      typeof eanSearchError?.message === "string"
                        ? eanSearchError.message
                        : "Unknown error",
                  },
                },
              );
            }
          }
        }
      }

      if (!product && retailBarcode) {
        try {
          product = await searchBarcodeWithOpenAi(nextBarcode, nextBarcodeType);
          extractionSource = trimString(product?.scanDataSource) || null;
          if (product) {
            logScannerSource("openai_web_search", product);
          }
        } catch (openAiBarcodeError) {
          logBuildAwareDiagnostic(
            "warn",
            "[scanner] OpenAI barcode fallback failed after EAN-Search miss",
            {
              developmentDetails: {
                message:
                  typeof openAiBarcodeError?.message === "string"
                    ? openAiBarcodeError.message
                    : "Unknown error",
              },
            },
          );
        }
      }

      if (!product && retailBarcode) {
        try {
          product = await fetchOpenFoodFactsProduct(
            nextBarcode,
            nextBarcodeType,
          );
          offFound = Boolean(product);
          offQuality = product
            ? trimString(product?.ingredientsText)
              ? "ingredient_text"
              : "metadata_only"
            : "missing";
          if (product) {
            product = await persistProvisionalGoUpcProduct(
              product,
              nextBarcodeType,
            );
            product = {
              ...product,
              hasIncompleteDetails: true,
            };
            product = await maybeApplyImageFallback(product);
            extractionSource =
              trimString(product?.scanDataSource) || "open_food_facts";
            logScannerSource("open_food_facts", product);
          }
        } catch (openFoodFactsError) {
          offFound = false;
          offQuality = "missing";
          logBuildAwareDiagnostic(
            "warn",
            "[scanner] Open Food Facts lookup failed after OpenAI miss",
            {
              developmentDetails: {
                status:
                  typeof openFoodFactsError?.status === "number"
                    ? openFoodFactsError.status
                    : null,
                code: trimString(openFoodFactsError?.code) || null,
                message:
                  typeof openFoodFactsError?.message === "string"
                    ? openFoodFactsError.message
                    : "Unknown error",
              },
            },
          );
        }
      }

      if (!product) {
        throw { code: "product_not_found" };
      }

      const ingredients = shouldUseStructuredLocalIngredients(product)
        ? extractIngredientCandidatesFromList(product.sourceIngredients)
        : extractBestIngredientCandidates(product);

      const sourceDecision = buildScanDebugMetadata({
        offFound,
        offQuality:
          trimString(product?.scanDataSource) === "open_food_facts"
            ? offQuality
            : "local_cache",
        dsldChecked,
        dsldCacheHit,
        dsldConfidence,
        finalSourceUsed:
          trimString(product?.scanDataSource) ===
            "supplement_products_master" ||
          trimString(product?.scanDataSource) === "off_products"
            ? trimString(product.scanDataSource)
            : trimString(product?.scanDataSource) === "go_upc"
              ? "go_upc"
              : trimString(product?.scanDataSource) === "go_upc_plus_openai"
                ? "go_upc_plus_openai"
                : trimString(product?.scanDataSource) === "ean_search"
                  ? "ean_search"
                  : trimString(product?.scanDataSource) ===
                      "ean_search_plus_openai"
                    ? "ean_search_plus_openai"
                    : trimString(product?.scanDataSource) === "dsld"
                      ? "dsld"
                      : trimString(product?.scanDataSource) ===
                          "openai_web_search"
                        ? "openai_web_search"
                        : trimString(product?.dsldMatch?.source)
                          ? "open_food_facts_with_dsld"
                          : trimString(product?.scanDataSource) ===
                              "open_food_facts"
                            ? "open_food_facts"
                            : trimString(product?.scanDataSource) ===
                                "open_food_facts_plus_openai"
                              ? "open_food_facts"
                            : "photo_fallback_pending",
      });
      if (product && typeof product === "object") {
        product = {
          ...product,
          sourceDecision,
        };
      }
      logDevelopmentDiagnostic(
        "log",
        "[scanner-source-decision]",
        sourceDecision,
      );

      if (!product.ingredientsText || ingredients.length === 0) {
        set(() => ({
          status: "no_ingredients",
          error: buildPartialProductDetailFailure(),
          scanSessionId: nextScanSessionId,
          barcode: nextBarcode,
          barcodeType: nextBarcodeType,
          product,
          ingredients: [],
          matchedIngredients: [],
          matches: [],
          unmatchedIngredients: [],
          photoRescueStatus: "idle",
          photoRescueError: null,
          extractionSource,
          extractionConfidence: null,
        }));

        return get();
      }

      const catalogRows = await fetchIngredientMatchCatalog();
      const { matchedIngredients, matches, unmatchedIngredients } =
        matchIngredientsToCatalog(ingredients, catalogRows);

      set(() => ({
        status: "success",
        error: null,
        scanSessionId: nextScanSessionId,
        barcode: nextBarcode,
        barcodeType: nextBarcodeType,
        product,
        ingredients,
        matchedIngredients,
        matches,
        unmatchedIngredients,
        photoRescueStatus: "idle",
        photoRescueError: null,
        extractionSource,
        extractionConfidence: null,
      }));

      if (
        trimString(product?.scanDataSource) === "supplement_products_master" &&
        trimString(product?.productId) &&
        unmatchedIngredients.length
      ) {
        queueMissingActiveIngredients({
          productId: product.productId,
          ingredients: unmatchedIngredients,
        }).catch(() => {
          logBuildAwareDiagnostic(
            "warn",
            "[scanner] failed to queue missing active ingredients",
            {
              developmentDetails: { reason: "unexpected_queue_error" },
            },
          );
        });
      }

      return get();
    } catch (error) {
      const normalized = normalizeBarcodeScanFailure(error);

      set(() => ({
        status: normalized.status,
        error: normalized.error,
        scanSessionId: nextScanSessionId,
        barcode: nextBarcode,
        barcodeType: nextBarcodeType,
        product: null,
        ingredients: [],
        matchedIngredients: [],
        matches: [],
        unmatchedIngredients: [],
        photoRescueStatus: "idle",
        photoRescueError: null,
        extractionSource: null,
        extractionConfidence: null,
      }));

      return null;
    }
  },

  enhanceScanWithPhotos: async ({
    scanSessionId,
    ingredientsPhoto,
    productPhoto,
  }) => {
    const currentState = get();
    const requestedScanSessionId = Number.parseInt(
      String(scanSessionId ?? ""),
      10,
    );

    if (
      !Number.isFinite(requestedScanSessionId) ||
      requestedScanSessionId !== currentState.scanSessionId
    ) {
      const error = new Error(
        "That scan is no longer active. Please rescan the barcode and try again.",
      );
      error.category = SCANNER_FAILURE_CATEGORIES.expiredScanSession;
      error.code = "expired_scan_session";

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: normalizePhotoRescueFailure(error),
      }));

      throw error;
    }

    const ingredientsImage = trimString(ingredientsPhoto);
    const productImage = trimString(productPhoto);

    if (!ingredientsImage || !productImage) {
      const error = new Error("Both photos are required to improve this scan.");
      error.category = SCANNER_FAILURE_CATEGORIES.backendValidationFailure;
      error.code = "missing_photo_payload";

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: normalizePhotoRescueFailure(error),
      }));

      throw error;
    }

    set(() => ({
      photoRescueStatus: "processing",
      photoRescueError: null,
    }));

    try {
      logDevelopmentDiagnostic("info", "[scanner-photo-rescue] submitting", {
        hasExistingProductId: Boolean(
          trimString(currentState.product?.productId),
        ),
      });

      const extraction = await scanSupplementPhotos({
        scanSessionId: String(requestedScanSessionId),
        barcode: currentState.barcode,
        barcodeType: currentState.barcodeType,
        productId: trimString(currentState.product?.productId) || undefined,
        currentProduct: currentState.product,
        ingredientsImage,
        productImage,
      });

      const ingredients = extractIngredientCandidatesFromList(
        extraction.ingredients,
      );

      if (extraction.isSupplement === false) {
        throw createScannerFailure({
          category: SCANNER_FAILURE_CATEGORIES.aiExtractionFailure,
          code: "ai_extraction_failed",
          message:
            extraction.message ||
            "We couldn't confirm from those photos that this product is a supplement.",
        });
      }

      if (extraction.wroteCanonicalData && !trimString(extraction.productId)) {
        throw createScannerFailure({
          category: SCANNER_FAILURE_CATEGORIES.backendValidationFailure,
          code: "missing_canonical_product",
          message:
            "Photo rescue finished without returning a canonical supplement product.",
        });
      }

      let matchedIngredients = [];
      let matches = [];
      let unmatchedIngredients = ingredients;

      if (ingredients.length) {
        try {
          const catalogRows = await fetchIngredientMatchCatalog();
          const nextMatches = matchIngredientsToCatalog(
            ingredients,
            catalogRows,
          );
          matchedIngredients = nextMatches.matchedIngredients;
          matches = nextMatches.matches;
          unmatchedIngredients = nextMatches.unmatchedIngredients;
        } catch (matchError) {
          logBuildAwareDiagnostic(
            "warn",
            "[scanner-photo-rescue] ingredient catalog matching failed",
            {
              developmentDetails: {
                message:
                  typeof matchError?.message === "string"
                    ? matchError.message
                    : "Unknown error",
              },
            },
          );

          if (!extraction.wroteCanonicalData) {
            throw matchError;
          }
        }
      }

      if (!extraction.wroteCanonicalData && !ingredients.length) {
        throw createScannerFailure({
          category: SCANNER_FAILURE_CATEGORIES.aiExtractionFailure,
          code: "ai_extraction_failed",
          message:
            "We couldn't read any usable supplement ingredients from those photos.",
        });
      }

      set(() => ({
        status: "success",
        error: null,
        product: buildPhotoRescueProduct({
          barcode: currentState.barcode,
          currentProduct: currentState.product,
          productId: extraction.productId,
          displayName: extraction.displayName,
          productName: extraction.productName,
          ingredients: extraction.ingredients,
          servingSizeText: extraction.servingSizeText,
          wroteCanonicalData: extraction.wroteCanonicalData,
        }),
        ingredients,
        matchedIngredients,
        matches,
        unmatchedIngredients,
        photoRescueStatus: "success",
        photoRescueError: null,
        extractionSource: extraction.source || "photo_rescue",
        extractionConfidence: Number.isFinite(
          extraction.classificationConfidence,
        )
          ? extraction.classificationConfidence
          : Number.isFinite(extraction.confidence)
            ? extraction.confidence
            : null,
      }));

      logDevelopmentDiagnostic("info", "[scanner-photo-rescue] completed", {
        createdProduct: extraction.createdProduct,
        wroteCanonicalData: extraction.wroteCanonicalData,
        unmatchedIngredientCount: unmatchedIngredients.length,
      });

      return get();
    } catch (error) {
      const normalized = normalizePhotoRescueFailure(error);

      set(() => ({
        photoRescueStatus: "error",
        photoRescueError: normalized,
      }));

      throw normalized;
    }
  },
}));
