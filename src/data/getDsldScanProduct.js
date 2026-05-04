import { supabase } from "@src/lib/supabase";
import { ENABLE_DSLD_LOOKUP } from "@src/lib/runtimeConfig";
import { normalizeBarcode as normalizeOpenFoodFactsBarcode } from "./getOpenFoodFactsProduct";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const DSLD_BASE_URL = "https://api.ods.od.nih.gov/dsld/v9";
const ACTIVE_CATEGORIES = new Set([
  "vitamin",
  "mineral",
  "botanical",
  "amino acid",
  "hormone",
  "enzyme",
  "probiotic",
  "bacteria",
  "fatty acid",
  "non-nutrient/non-botanical",
]);
const EXCLUDED_NUTRITION_NAMES = new Set([
  "calories",
  "total carbohydrates",
  "total carbohydrate",
  "total sugars",
  "added sugars",
  "sugars",
  "dietary fiber",
  "protein",
  "total fat",
  "saturated fat",
  "sodium",
  "cholesterol",
  "sugar",
]);
const NUTRITION_FACT_CATEGORIES = new Set(["sugar", "complex carbohydrate", "fiber", "fat"]);
const PROPRIETARY_BLEND_TERMS = [
  "blend",
  "matrix",
  "system",
  "amplifier",
  "complex",
  "formula",
  "transport",
  "igniter",
  "hydration",
];

function toSlug(value) {
  return trimString(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeName(value) {
  return toSlug(value)
    .replace(/\bflavor\b/g, "")
    .replace(/\bformula\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function marketStatusFromOffMarket(offMarket) {
  if (offMarket === 0) return "on_market";
  if (offMarket === 1) return "off_market";
  return "unknown";
}

function buildSearchUrl(endpoint, params) {
  const url = new URL(`${DSLD_BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function getRowName(row) {
  return trimString(row?.ingredient_name) || trimString(row?.name) || "Unknown";
}

function getRowCategory(row) {
  return trimString(row?.ingredient_category) || trimString(row?.category) || "";
}

function parseAmountValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = trimString(value);
  if (!text) return null;
  const parsed = Number.parseFloat(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getDoseDetails(row) {
  const amountValue = parseAmountValue(row?.amount_per_serving);
  const amountUnit = trimString(row?.amount_unit);
  const normalizedUnit = amountUnit.toLowerCase();
  const hasDisclosedDose =
    Number.isFinite(amountValue) && amountValue > 0 && Boolean(amountUnit) && normalizedUnit !== "np";

  return {
    amountValue,
    amountUnit,
    doseStatus: hasDisclosedDose ? "disclosed" : "not_disclosed",
    hasDisclosedDose,
  };
}

function isLikelyBlendRow(row) {
  const name = getRowName(row).toLowerCase();
  const category = getRowCategory(row).toLowerCase();
  const hasBlendTerm = PROPRIETARY_BLEND_TERMS.some((term) => name.includes(term));
  const { hasDisclosedDose } = getDoseDetails(row);

  return hasBlendTerm && hasDisclosedDose && !ACTIVE_CATEGORIES.has(category);
}

function partitionDsldIngredientRows(rows) {
  const active_ingredients_with_disclosed_dose = [];
  const active_ingredients_without_disclosed_dose = [];
  const proprietary_blend_rows = [];
  const nutrition_facts_rows = [];
  const other_or_excluded_rows = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const name = getRowName(row).toLowerCase();
    const category = getRowCategory(row).toLowerCase();
    const doseDetails = getDoseDetails(row);
    const decoratedRow = {
      ...row,
      dose_status: doseDetails.doseStatus,
    };

    if (EXCLUDED_NUTRITION_NAMES.has(name) || NUTRITION_FACT_CATEGORIES.has(category)) {
      nutrition_facts_rows.push(decoratedRow);
      return;
    }

    if (isLikelyBlendRow(row)) {
      proprietary_blend_rows.push(decoratedRow);
      return;
    }

    if (ACTIVE_CATEGORIES.has(category)) {
      if (doseDetails.hasDisclosedDose) {
        active_ingredients_with_disclosed_dose.push(decoratedRow);
      } else {
        active_ingredients_without_disclosed_dose.push(decoratedRow);
      }
      return;
    }

    other_or_excluded_rows.push(decoratedRow);
  });

  return {
    active_ingredients_with_disclosed_dose,
    active_ingredients_without_disclosed_dose,
    proprietary_blend_rows,
    nutrition_facts_rows,
    other_or_excluded_rows,
  };
}

function formatServingSize(label) {
  const primary = Array.isArray(label?.servingSizes) ? label.servingSizes[0] : null;
  if (!primary) return "not available";
  const parts = [];
  if (primary.minQuantity !== undefined && primary.minQuantity !== null) {
    parts.push(String(primary.minQuantity));
  }
  if (primary.maxQuantity !== undefined && primary.maxQuantity !== null) {
    const minText = parts[0];
    if (!minText || String(primary.maxQuantity) !== minText) {
      parts.push(`to ${primary.maxQuantity}`);
    }
  }
  if (trimString(primary.unit)) {
    parts.push(trimString(primary.unit));
  }
  const servingText = parts.join(" ").trim() || "not available";
  const servingsPerContainer = trimString(label?.servingsPerContainer);
  return servingsPerContainer
    ? `${servingText} | servings per container: ${servingsPerContainer}`
    : servingText;
}

function normalizeStatements(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      statement_type: trimString(row?.statement_type) || trimString(row?.type) || "Statement",
      statement: trimString(row?.statement) || trimString(row?.notes),
    }))
    .filter((row) => row.statement);
}

function buildDsldMatchFromCache(productRow, ingredientRows, statementRows) {
  const partitioned = partitionDsldIngredientRows(ingredientRows);
  return {
    source: "dsld",
    confidence: "high",
    dsld_id: productRow.dsld_id,
    product_name: trimString(productRow.product_name) || null,
    brand_name: trimString(productRow.brand_name) || null,
    serving_size: trimString(productRow.serving_size) || null,
    market_status: trimString(productRow.market_status) || "unknown",
    active_ingredients_with_disclosed_dose:
      partitioned.active_ingredients_with_disclosed_dose,
    active_ingredients_without_disclosed_dose:
      partitioned.active_ingredients_without_disclosed_dose,
    proprietary_blend_rows: partitioned.proprietary_blend_rows,
    label_statements: normalizeStatements(statementRows),
    source_url: trimString(productRow.source_url) || null,
  };
}

async function fetchCachedDsldMatch(barcode, barcodeType) {
  const barcodeCandidates = buildBarcodeLookupCandidates(barcode, barcodeType);
  const { data: productRows, error: productError } = await supabase
    .from("dsld_products_cache")
    .select("*")
    .in("barcode_normalized", barcodeCandidates);

  if (productError) {
    throw productError;
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

  if (ingredientError) throw ingredientError;
  if (statementError) throw statementError;

  return buildDsldMatchFromCache(product, ingredientRows ?? [], statementRows ?? []);
}

function scoreLabelMatch(input, label) {
  const normalizedInputBarcode = normalizeOpenFoodFactsBarcode(input.barcode, input.barcodeType);
  const normalizedLabelBarcode = trimString(label?.upcSku).replace(/\D/g, "");
  const normalizedInputName = normalizeName(input.productName);
  const normalizedLabelName = normalizeName(label?.fullName);

  let score = 0;
  const reasons = [];

  if (normalizedLabelBarcode && normalizedLabelBarcode === normalizedInputBarcode) {
    score += 70;
    reasons.push("exact barcode match");
  }

  if (normalizedInputName && normalizedLabelName === normalizedInputName) {
    score += 25;
    reasons.push("exact product-name match");
  } else if (
    normalizedInputName &&
    normalizedLabelName &&
    (normalizedLabelName.includes(normalizedInputName) ||
      normalizedInputName.includes(normalizedLabelName))
  ) {
    score += 15;
    reasons.push("partial product-name match");
  }

  if (Array.isArray(label?.ingredientRows) && label.ingredientRows.length > 0) {
    score += 5;
    reasons.push("label has ingredient rows");
  }

  if (Array.isArray(label?.servingSizes) && label.servingSizes.length > 0) {
    score += 5;
    reasons.push("label has serving sizes");
  }

  if (label?.offMarket === 0) {
    score += 3;
    reasons.push("product is on market");
  }

  let confidence = "low";
  if (score >= 110) confidence = "high";
  else if (score >= 80) confidence = "medium";

  return { score, confidence, reasons };
}

async function searchDsldCandidates(input) {
  const normalizedBarcode = normalizeOpenFoodFactsBarcode(input.barcode, input.barcodeType);
  const queries = [normalizedBarcode, `"${normalizedBarcode}"`].filter(Boolean);
  const hits = [];

  for (const query of queries) {
    const payload = await fetchJson(
      buildSearchUrl("search-filter", {
        q: query,
        status: 2,
        sort_by: "_score",
        size: 10,
      })
    );
    hits.push(...(Array.isArray(payload?.hits) ? payload.hits : []));
  }

  if (trimString(input.productName)) {
    const payload = await fetchJson(
      buildSearchUrl("search-filter", {
        q: `"${input.productName}"`,
        status: 2,
        sort_by: "_score",
        size: 10,
      })
    );
    hits.push(...(Array.isArray(payload?.hits) ? payload.hits : []));
  }

  return Array.from(new Set(hits.map((hit) => trimString(hit?._id)).filter(Boolean)));
}

async function fetchDsldLabel(labelId) {
  return fetchJson(`${DSLD_BASE_URL}/label/${labelId}`);
}

function flattenLabelIngredientRows(rows, flattened = [], state = { value: 0 }) {
  if (!Array.isArray(rows)) return flattened;
  rows.forEach((row) => {
    state.value += 1;
    const quantities = Array.isArray(row?.quantity) && row.quantity.length > 0 ? row.quantity : [null];
    quantities.forEach((quantityRow, quantityIndex) => {
      flattened.push({
        ingredient_name: trimString(row?.name) || trimString(row?.ingredientGroup) || "Unknown",
        ingredient_category: trimString(row?.category) || null,
        amount_per_serving:
          quantityRow?.quantity !== undefined && quantityRow?.quantity !== null
            ? quantityRow.quantity
            : null,
        amount_unit: trimString(quantityRow?.unit) || null,
        percent_daily_value:
          Array.isArray(quantityRow?.dailyValueTargetGroup) &&
          quantityRow.dailyValueTargetGroup[0]?.percent !== undefined
            ? quantityRow.dailyValueTargetGroup[0].percent
            : null,
        daily_value_target_group:
          Array.isArray(quantityRow?.dailyValueTargetGroup)
            ? trimString(quantityRow.dailyValueTargetGroup[0]?.name) || null
            : null,
        serving_size:
          quantityRow?.servingSizeQuantity !== undefined &&
          quantityRow?.servingSizeQuantity !== null
            ? `${quantityRow.servingSizeQuantity}${
                trimString(quantityRow?.servingSizeUnit)
                  ? ` ${trimString(quantityRow.servingSizeUnit)}`
                  : ""
              }`
            : null,
        row_order: state.value * 100 + quantityIndex,
      });
    });
    flattenLabelIngredientRows(row?.nestedRows, flattened, state);
  });
  return flattened;
}

function buildDsldMatchFromLabel(label, confidence) {
  const ingredientRows = flattenLabelIngredientRows(label?.ingredientRows);
  const partitioned = partitionDsldIngredientRows(ingredientRows);

  return {
    source: "dsld",
    confidence,
    dsld_id: label.id,
    product_name: trimString(label?.fullName) || null,
    brand_name: trimString(label?.brandName) || null,
    serving_size: formatServingSize(label),
    market_status: marketStatusFromOffMarket(label?.offMarket),
    active_ingredients_with_disclosed_dose:
      partitioned.active_ingredients_with_disclosed_dose,
    active_ingredients_without_disclosed_dose:
      partitioned.active_ingredients_without_disclosed_dose,
    proprietary_blend_rows: partitioned.proprietary_blend_rows,
    label_statements: normalizeStatements(label?.statements),
    source_url: `https://dsld.od.nih.gov/label/${label.id}`,
    raw_label: label,
  };
}

async function insertLookupAttempt(payload) {
  try {
    await supabase.from("dsld_lookup_attempts").insert(payload);
  } catch (error) {
    console.warn("[dsld] failed to record lookup attempt", error);
  }
}

async function cacheDsldLabelMatch(label, match, barcode, barcodeType, productName) {
  const barcodeNormalized = normalizeOpenFoodFactsBarcode(barcode, barcodeType);
  const ingredientRows = flattenLabelIngredientRows(label?.ingredientRows).map((row) => ({
    dsld_id: label.id,
    ...row,
    raw_json: row,
  }));
  const statementRows = normalizeStatements(label?.statements).map((row) => ({
    dsld_id: label.id,
    statement_type: row.statement_type,
    statement: row.statement,
    raw_json: row,
  }));

  try {
    await supabase.from("dsld_products_cache").upsert(
      {
        dsld_id: label.id,
        product_name: trimString(label?.fullName) || trimString(productName) || null,
        brand_name: trimString(label?.brandName) || null,
        barcode_raw: trimString(label?.upcSku) || null,
        barcode_normalized: barcodeNormalized || null,
        market_status: marketStatusFromOffMarket(label?.offMarket),
        serving_size: formatServingSize(label),
        supplement_form: trimString(label?.physicalState?.langualCodeDescription) || null,
        suggested_use:
          normalizeStatements(label?.statements).find((row) =>
            row.statement_type.toLowerCase().includes("suggested/recommended/usage/directions")
          )?.statement ?? null,
        source_url: `https://dsld.od.nih.gov/label/${label.id}`,
        raw_json: label,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "dsld_id" }
    );

    await supabase.from("dsld_product_ingredients").delete().eq("dsld_id", label.id);
    if (ingredientRows.length > 0) {
      await supabase.from("dsld_product_ingredients").insert(ingredientRows);
    }

    await supabase.from("dsld_product_label_statements").delete().eq("dsld_id", label.id);
    if (statementRows.length > 0) {
      await supabase.from("dsld_product_label_statements").insert(statementRows);
    }
  } catch (error) {
    console.warn("[dsld] failed to cache label", error);
  }

  await insertLookupAttempt({
    input_barcode: trimString(barcode) || null,
    normalized_barcode: barcodeNormalized || null,
    input_brand: null,
    input_product_name: trimString(productName) || null,
    matched_dsld_id: label.id,
    confidence: match.confidence,
    match_reasons: match.reasons,
    search_path: "live_api",
    success: true,
    error_message: null,
  });
}

export async function maybeFetchDsldScanMatch({
  barcode,
  barcodeType,
  productName,
}) {
  const normalizedBarcode = normalizeOpenFoodFactsBarcode(barcode, barcodeType);
  const result = {
    checked: false,
    cacheHit: false,
    confidence: null,
    dsldMatch: null,
  };

  if (!ENABLE_DSLD_LOOKUP || !trimString(normalizedBarcode)) {
    return result;
  }

  result.checked = true;

  try {
    const cachedMatch = await fetchCachedDsldMatch(barcode, barcodeType);
    if (cachedMatch) {
      result.cacheHit = true;
      result.confidence = cachedMatch.confidence;
      result.dsldMatch = cachedMatch;
      return result;
    }

    const candidateIds = await searchDsldCandidates({ barcode, barcodeType, productName });
    const labels = [];
    for (const labelId of candidateIds.slice(0, 6)) {
      labels.push(await fetchDsldLabel(labelId));
    }

    const ranked = labels
      .map((label) => ({
        label,
        match: scoreLabelMatch({ barcode, barcodeType, productName }, label),
      }))
      .sort((left, right) => right.match.score - left.match.score);

    const best = ranked[0] ?? null;
    result.confidence = best?.match?.confidence ?? "low";

    if (!best || best.match.confidence !== "high") {
      await insertLookupAttempt({
        input_barcode: trimString(barcode) || null,
        normalized_barcode: normalizedBarcode || null,
        input_brand: null,
        input_product_name: trimString(productName) || null,
        matched_dsld_id: best?.label?.id ?? null,
        confidence: best?.match?.confidence ?? "low",
        match_reasons: best?.match?.reasons ?? [],
        search_path: "live_api",
        success: false,
        error_message: "Low confidence DSLD result",
      });
      return result;
    }

    const dsldMatch = buildDsldMatchFromLabel(best.label, best.match.confidence);
    result.dsldMatch = dsldMatch;
    await cacheDsldLabelMatch(best.label, best.match, barcode, barcodeType, productName);
    return result;
  } catch (error) {
    await insertLookupAttempt({
      input_barcode: trimString(barcode) || null,
      normalized_barcode: normalizedBarcode || null,
      input_brand: null,
      input_product_name: trimString(productName) || null,
      matched_dsld_id: null,
      confidence: "low",
      match_reasons: [],
      search_path: "live_api",
      success: false,
      error_message: trimString(error?.message) || "DSLD lookup failed",
    });
    console.warn("[dsld] lookup failed", error);
    return result;
  }
}
