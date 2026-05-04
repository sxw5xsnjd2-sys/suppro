import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cacheDsldLabelResult,
  createAdminClient,
  loadDotEnv,
  logDsldLookupFailure,
  normalizeBarcode as normalizeDsldBarcode,
  parseArgs,
  resolveDsldBestMatch,
} from "./lib/dsldUtils.mjs";
import {
  fetchOpenFoodFactsProduct,
  normalizeBarcode as normalizeOpenFoodFactsBarcode,
} from "../src/data/getOpenFoodFactsProduct.js";
import {
  buildScanDebugMetadata,
  getOpenFoodFactsQuality,
  hasUsefulSupplementFactsData,
} from "../src/data/dsldSourceDecision.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inferBarcodeType(normalizedBarcode) {
  if (/^\d{12}$/.test(normalizedBarcode)) return "upc_a";
  if (/^\d{13}$/.test(normalizedBarcode)) return "ean13";
  if (/^\d{8}$/.test(normalizedBarcode)) return "ean8";
  return "upc_a";
}

function buildBarcodeLookupCandidates(barcode, barcodeType) {
  const normalizedBarcode = normalizeOpenFoodFactsBarcode(barcode, barcodeType);
  const candidates = [normalizedBarcode];

  if (/^\d{12}$/.test(normalizedBarcode)) {
    candidates.push(`0${normalizedBarcode}`);
  } else if (/^0\d{12}$/.test(normalizedBarcode)) {
    candidates.push(normalizedBarcode.slice(1));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function normalizeStatements(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      statement_type: trimString(row?.statement_type),
      statement: trimString(row?.statement),
    }))
    .filter((row) => row.statement);
}

function buildDsldMatchFromCache(productRow, ingredientRows, statementRows) {
  return {
    source: "dsld",
    confidence: "high",
    dsld_id: productRow.dsld_id,
    product_name: trimString(productRow.product_name) || null,
    brand_name: trimString(productRow.brand_name) || null,
    serving_size: trimString(productRow.serving_size) || null,
    market_status: trimString(productRow.market_status) || "unknown",
    active_ingredients_with_disclosed_dose: Array.isArray(ingredientRows)
      ? ingredientRows.filter((row) => trimString(row?.amount_unit).toLowerCase() !== "np")
      : [],
    active_ingredients_without_disclosed_dose: Array.isArray(ingredientRows)
      ? ingredientRows.filter((row) => trimString(row?.amount_unit).toLowerCase() === "np")
      : [],
    proprietary_blend_rows: [],
    label_statements: normalizeStatements(statementRows),
  };
}

async function fetchCachedDsldMatch(supabase, barcode, barcodeType) {
  const barcodeCandidates = buildBarcodeLookupCandidates(barcode, barcodeType);
  const { data: productRows, error: productError } = await supabase
    .from("dsld_products_cache")
    .select("*")
    .in("barcode_normalized", barcodeCandidates);

  if (productError) {
    throw new Error(`[supabase:dsld_products_cache] ${productError.message}`);
  }

  const product = barcodeCandidates
    .map((candidate) =>
      (productRows ?? []).find((row) => trimString(row?.barcode_normalized) === candidate)
    )
    .find(Boolean);

  if (!product?.dsld_id) {
    return null;
  }

  const dsldId = product.dsld_id;
  const [{ data: ingredientRows, error: ingredientError }, { data: statementRows, error: statementError }] =
    await Promise.all([
      supabase
        .from("dsld_product_ingredients")
        .select("*")
        .eq("dsld_id", dsldId)
        .order("row_order", { ascending: true }),
      supabase
        .from("dsld_product_label_statements")
        .select("*")
        .eq("dsld_id", dsldId),
    ]);

  if (ingredientError) {
    throw new Error(`[supabase:dsld_product_ingredients] ${ingredientError.message}`);
  }
  if (statementError) {
    throw new Error(
      `[supabase:dsld_product_label_statements] ${statementError.message}`
    );
  }

  return buildDsldMatchFromCache(product, ingredientRows ?? [], statementRows ?? []);
}

async function maybeFetchDsldMatch({
  supabase,
  barcode,
  barcodeType,
  productName,
}) {
  const result = {
    checked: true,
    cacheHit: false,
    confidence: null,
    dsldMatch: null,
  };

  try {
    const cachedMatch = await fetchCachedDsldMatch(supabase, barcode, barcodeType);
    if (cachedMatch) {
      result.cacheHit = true;
      result.confidence = cachedMatch.confidence;
      result.dsldMatch = cachedMatch;
      return result;
    }

    const ranked = await resolveDsldBestMatch(
      {
        barcode,
        brand: "",
        productName: trimString(productName),
      },
      {}
    );
    result.confidence = ranked.best?.match?.confidence ?? "low";

    if (!ranked.best?.label?.id || ranked.best.match.confidence !== "high") {
      try {
        await logDsldLookupFailure({
          supabase,
          inputCase: {
            barcode,
            brand: "",
            productName: trimString(productName),
          },
          result: ranked,
          errorMessage: "Low confidence DSLD result",
        });
      } catch (error) {
        console.warn("[testBarcodeLookupPath] failed to log low-confidence DSLD lookup", error);
      }
      return result;
    }

    await cacheDsldLabelResult({
      supabase,
      inputCase: {
        barcode,
        brand: "",
        productName: trimString(productName),
      },
      result: ranked,
    });

    result.dsldMatch = {
      source: "dsld",
      confidence: ranked.best.match.confidence,
      dsld_id: ranked.best.label.id,
      product_name: trimString(ranked.best.label.fullName) || null,
      brand_name: trimString(ranked.best.label.brandName) || null,
      serving_size: trimString(ranked.best.label.servingsPerContainer) || null,
      market_status:
        ranked.best.label.offMarket === 0
          ? "on_market"
          : ranked.best.label.offMarket === 1
            ? "off_market"
            : "unknown",
    };
    return result;
  } catch (error) {
    try {
      await logDsldLookupFailure({
        supabase,
        inputCase: {
          barcode,
          brand: "",
          productName: trimString(productName),
        },
        result: null,
        errorMessage: trimString(error?.message) || "DSLD lookup failed",
      });
    } catch (lookupError) {
      console.warn(
        "[testBarcodeLookupPath] failed to log DSLD lookup failure",
        lookupError
      );
    }
    console.warn("[testBarcodeLookupPath] DSLD lookup failed", error);
    return result;
  }
}

async function runLookup({ barcode }) {
  loadDotEnv();
  process.env.EXPO_PUBLIC_ENABLE_DSLD_LOOKUP = "true";

  const normalizedBarcode = normalizeDsldBarcode(barcode);
  const barcodeType = inferBarcodeType(normalizedBarcode);
  const supabase = createAdminClient();

  let openFoodFactsFound = false;
  let openFoodFactsQuality = "missing";
  let openFoodFactsProduct = null;

  try {
    openFoodFactsProduct = await fetchOpenFoodFactsProduct(normalizedBarcode, barcodeType);
    openFoodFactsFound = true;
    openFoodFactsQuality = getOpenFoodFactsQuality(openFoodFactsProduct);
  } catch (error) {
    if (error?.code === "product_not_found") {
      openFoodFactsFound = false;
      openFoodFactsQuality = "missing";
    } else {
      openFoodFactsFound = false;
      openFoodFactsQuality = "missing";
      console.warn("[testBarcodeLookupPath] OpenFoodFacts lookup failed", error);
    }
  }

  let dsldChecked = false;
  let dsldCacheHit = false;
  let dsldConfidence = null;
  let dsldMatch = null;

  if (normalizedBarcode && openFoodFactsQuality !== "good") {
    const dsldResult = await maybeFetchDsldMatch({
      supabase,
      barcode: normalizedBarcode,
      barcodeType,
      productName: trimString(openFoodFactsProduct?.productName),
    });
    dsldChecked = dsldResult.checked;
    dsldCacheHit = dsldResult.cacheHit;
    dsldConfidence = dsldResult.confidence;
    dsldMatch = dsldResult.dsldMatch;
  }

  const sourceDecision = buildScanDebugMetadata({
    offFound: openFoodFactsFound,
    offQuality: openFoodFactsQuality,
    dsldChecked,
    dsldCacheHit,
    dsldConfidence,
    finalSourceUsed: openFoodFactsFound
      ? dsldMatch
        ? "open_food_facts_with_dsld"
        : "open_food_facts"
      : dsldMatch
        ? "photo_fallback_with_dsld"
        : "photo_fallback_pending",
  });

  console.log("Barcode lookup path test");
  console.log(`- input barcode: ${barcode}`);
  console.log(`- normalized barcode: ${normalizedBarcode}`);
  const offProductNamePresent = Boolean(trimString(openFoodFactsProduct?.productName));
  const offIngredientsText = trimString(openFoodFactsProduct?.ingredientsText);
  const offIngredientsPresent = Boolean(offIngredientsText);
  const offDoseSignalPresent = hasUsefulSupplementFactsData(openFoodFactsProduct);

  console.log(`- OpenFoodFacts found: ${openFoodFactsFound ? "yes" : "no"}`);
  console.log(`- OpenFoodFacts label completeness: ${openFoodFactsQuality}`);
  console.log(`- OFF product name present: ${offProductNamePresent ? "yes" : "no"}`);
  console.log(`- OFF product name: ${trimString(openFoodFactsProduct?.productName) || "n/a"}`);
  console.log(`- OFF ingredients text present: ${offIngredientsPresent ? "yes" : "no"}`);
  console.log(`- OFF ingredients text length: ${offIngredientsText.length}`);
  console.log(`- OFF supplement dose signal present: ${offDoseSignalPresent ? "yes" : "no"}`);
  console.log(`- OFF ingredients text sample: ${offIngredientsText.slice(0, 500) || "n/a"}`);
  console.log(`- OFF sourceIngredients type: ${Array.isArray(openFoodFactsProduct?.sourceIngredients) ? "array" : typeof openFoodFactsProduct?.sourceIngredients}`);
  console.log(`- OFF sourceIngredients sample: ${JSON.stringify((openFoodFactsProduct?.sourceIngredients || []).slice?.(0, 5) || openFoodFactsProduct?.sourceIngredients)?.slice(0, 1000) || "n/a"}`);
  console.log(`- DSLD checked: ${dsldChecked ? "yes" : "no"}`);
  console.log(`- DSLD cache hit: ${dsldCacheHit ? "yes" : "no"}`);
  console.log(`- DSLD confidence: ${dsldConfidence || "n/a"}`);
  console.log(`- matched DSLD ID: ${dsldMatch?.dsld_id ?? "none"}`);
  console.log(`- final_source_used: ${sourceDecision.final_source_used}`);
  console.log(`- dsldMatch attached: ${dsldMatch ? "yes" : "no"}`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const barcode = trimString(flags.barcode);

  if (!barcode) {
    throw new Error("Missing required --barcode argument.");
  }

  await runLookup({ barcode });
}

main().catch((error) => {
  console.error("Barcode lookup path test failed.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
