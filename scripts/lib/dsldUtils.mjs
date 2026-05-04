import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DSLD_BASE_URL = "https://api.ods.od.nih.gov/dsld/v9";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_SEARCH_SIZE = 10;
const DEFAULT_LABEL_CANDIDATE_LIMIT = 6;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

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

export function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (typeof inlineValue === "string") {
      flags[key] = inlineValue;
      continue;
    }

    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = nextToken;
    index += 1;
  }

  return flags;
}

export function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeBarcode(value) {
  return trimString(value).replace(/\D/g, "");
}

export function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

export function loadCasesFromCsv(csvPath) {
  const absolutePath = path.isAbsolute(csvPath)
    ? csvPath
    : path.resolve(PROJECT_ROOT, csvPath);
  const rows = readFileSync(absolutePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    throw new Error(`CSV must include a header and at least one row: ${absolutePath}`);
  }

  const headers = splitCsvLine(rows[0]).map((header) =>
    header.toLowerCase().replace(/\s+/g, "_")
  );
  const barcodeIndex = headers.indexOf("barcode");
  const brandIndex = headers.indexOf("brand");
  const productNameIndex = headers.indexOf("product_name");

  if (barcodeIndex < 0 || brandIndex < 0 || productNameIndex < 0) {
    throw new Error(
      `CSV must include barcode, brand, and product_name columns: ${absolutePath}`
    );
  }

  return rows.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const barcode = values[barcodeIndex] ?? "";
    const brand = values[brandIndex] ?? "";
    const productName = values[productNameIndex] ?? "";

    if (!trimString(barcode) || !trimString(brand) || !trimString(productName)) {
      throw new Error(`Invalid CSV row ${index + 2}: ${line}`);
    }

    return { barcode, brand, productName };
  });
}

export function marketStatusFromOffMarket(offMarket) {
  if (offMarket === 0) return "on_market";
  if (offMarket === 1) return "off_market";
  return "unknown";
}

function formatBarcodeWithSpaces(digits) {
  if (!/^\d{12}$/.test(digits)) {
    return digits;
  }

  return `${digits.slice(0, 1)} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits.slice(11)}`;
}

function buildSearchUrl(endpoint, params) {
  const url = new URL(`${DSLD_BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function dedupeIds(hits) {
  return Array.from(
    new Set(
      hits
        .map((hit) => trimString(hit?._id))
        .filter(Boolean)
    )
  );
}

function hitLooksPlausibleForInput(inputCase, hit) {
  const source = hit?._source;
  const normalizedInputBarcode = normalizeBarcode(inputCase.barcode);
  const normalizedHitBarcode = normalizeBarcode(source?.upcSku);
  const normalizedInputName = normalizeName(inputCase.productName);
  const normalizedHitName = normalizeName(source?.fullName);
  const normalizedInputBrand = toSlug(inputCase.brand);
  const normalizedHitBrand = toSlug(source?.brandName);

  if (normalizedHitBarcode && normalizedHitBarcode === normalizedInputBarcode) {
    return true;
  }

  const brandMatches =
    normalizedInputBrand &&
    normalizedHitBrand &&
    (normalizedInputBrand === normalizedHitBrand ||
      normalizedInputBrand.includes(normalizedHitBrand) ||
      normalizedHitBrand.includes(normalizedInputBrand));

  const nameMatches =
    normalizedInputName &&
    normalizedHitName &&
    (normalizedInputName === normalizedHitName ||
      normalizedInputName.includes(normalizedHitName) ||
      normalizedHitName.includes(normalizedInputName));

  return Boolean(brandMatches && nameMatches);
}

function scoreLabelMatch(inputCase, label) {
  const normalizedInputBarcode = normalizeBarcode(inputCase.barcode);
  const normalizedLabelBarcode = normalizeBarcode(label?.upcSku);
  const normalizedInputName = normalizeName(inputCase.productName);
  const normalizedLabelName = normalizeName(label?.fullName);
  const normalizedInputBrand = toSlug(inputCase.brand);
  const normalizedLabelBrand = toSlug(label?.brandName);

  let score = 0;
  const reasons = [];

  if (normalizedLabelBarcode && normalizedLabelBarcode === normalizedInputBarcode) {
    score += 70;
    reasons.push("exact barcode match");
  } else if (
    normalizedLabelBarcode &&
    normalizedInputBarcode &&
    normalizedLabelBarcode.replace(/^0+/, "") === normalizedInputBarcode.replace(/^0+/, "")
  ) {
    score += 55;
    reasons.push("barcode match ignoring leading zero padding");
  }

  if (normalizedLabelBrand === normalizedInputBrand) {
    score += 15;
    reasons.push("exact brand match");
  } else if (
    normalizedLabelBrand &&
    normalizedInputBrand &&
    (normalizedLabelBrand.includes(normalizedInputBrand) ||
      normalizedInputBrand.includes(normalizedLabelBrand))
  ) {
    score += 10;
    reasons.push("partial brand match");
  }

  if (normalizedLabelName === normalizedInputName) {
    score += 25;
    reasons.push("exact product-name match");
  } else if (
    normalizedLabelName &&
    normalizedInputName &&
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
  if (score >= 110) {
    confidence = "high";
  } else if (score >= 80) {
    confidence = "medium";
  }

  return { score, confidence, reasons };
}

export function formatServingSize(servingSizes, servingsPerContainer) {
  const primary = Array.isArray(servingSizes) ? servingSizes[0] : null;
  if (!primary) {
    return "not available";
  }

  const quantityParts = [];
  if (primary.minQuantity !== undefined && primary.minQuantity !== null) {
    quantityParts.push(String(primary.minQuantity));
  }
  if (primary.maxQuantity !== undefined && primary.maxQuantity !== null) {
    const minText = quantityParts[0];
    if (!minText || String(primary.maxQuantity) !== minText) {
      quantityParts.push(`to ${primary.maxQuantity}`);
    }
  }
  if (trimString(primary.unit)) {
    quantityParts.push(trimString(primary.unit));
  }

  const servingText = quantityParts.join(" ").trim() || "not available";
  const containerText = trimString(servingsPerContainer);
  return containerText
    ? `${servingText} | servings per container: ${containerText}`
    : servingText;
}

const DSLD_ACTIVE_INGREDIENT_CATEGORIES = new Set([
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

const DSLD_EXCLUDED_NUTRITION_NAMES = new Set([
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
]);

const DSLD_NUTRITION_FACT_CATEGORIES = new Set([
  "sugar",
  "complex carbohydrate",
  "fiber",
  "fat",
]);

const DSLD_PROPRIETARY_BLEND_TERMS = [
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

function getDsldIngredientName(row) {
  return (
    trimString(row?.ingredient_name) ||
    trimString(row?.name) ||
    trimString(row?.ingredientGroup) ||
    "Unknown"
  );
}

function getDsldIngredientCategory(row) {
  return trimString(row?.ingredient_category) || trimString(row?.category) || "";
}

function getDsldRowQuantityRow(row) {
  if (
    typeof row?.amount_per_serving === "number" ||
    typeof row?.amount_per_serving === "string" ||
    typeof row?.amount_unit === "string"
  ) {
    return {
      quantity: row?.amount_per_serving,
      unit: row?.amount_unit,
    };
  }

  if (Array.isArray(row?.raw?.quantity) && row.raw.quantity.length > 0) {
    return row.raw.quantity[0];
  }

  if (
    row?.raw_json &&
    typeof row.raw_json === "object" &&
    row.raw_json.quantityRow &&
    typeof row.raw_json.quantityRow === "object"
  ) {
    return row.raw_json.quantityRow;
  }

  return null;
}

function parseDsldAmountValue(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }

  const text = trimString(rawValue);
  if (!text) return null;

  const parsed = Number.parseFloat(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getDsldDoseDetails(row) {
  const quantityRow = getDsldRowQuantityRow(row);
  const amountValue = parseDsldAmountValue(quantityRow?.quantity);
  const amountUnit = trimString(quantityRow?.unit);
  const normalizedUnit = amountUnit.toLowerCase();
  const hasNumericAmount = Number.isFinite(amountValue);
  const isNotDisclosedUnit = normalizedUnit === "np";
  const hasDisclosedDose =
    hasNumericAmount && amountValue > 0 && Boolean(amountUnit) && !isNotDisclosedUnit;

  return {
    amountValue,
    amountUnit,
    hasNumericAmount,
    hasDisclosedDose,
    doseStatus: hasDisclosedDose ? "disclosed" : "not_disclosed",
  };
}

function isLikelyProprietaryBlendRow(row, ingredientName, ingredientCategory) {
  const normalizedName = ingredientName.toLowerCase();
  const hasBlendTerm = DSLD_PROPRIETARY_BLEND_TERMS.some((term) =>
    normalizedName.includes(term)
  );

  if (!hasBlendTerm) {
    return false;
  }

  const { hasDisclosedDose } = getDsldDoseDetails(row);
  if (!hasDisclosedDose) {
    return false;
  }

  // Rows with explicit active-ingredient categories should remain active
  // candidates even when the branded ingredient name is unusual.
  if (DSLD_ACTIVE_INGREDIENT_CATEGORIES.has(ingredientCategory)) {
    return false;
  }

  return true;
}

export function partitionDsldIngredientRows(rows) {
  const active_ingredients_with_disclosed_dose = [];
  const active_ingredients_without_disclosed_dose = [];
  const proprietary_blend_rows = [];
  const nutrition_facts_rows = [];
  const other_or_excluded_rows = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const ingredientName = getDsldIngredientName(row);
    const ingredientCategory = getDsldIngredientCategory(row).toLowerCase();
    const normalizedName = ingredientName.toLowerCase();
    const doseDetails = getDsldDoseDetails(row);
    const rowWithMetadata = {
      ...row,
      dose_status: doseDetails.doseStatus,
      amount_per_serving_numeric: doseDetails.amountValue,
      amount_unit_normalized: doseDetails.amountUnit || null,
    };

    if (
      DSLD_EXCLUDED_NUTRITION_NAMES.has(normalizedName) ||
      DSLD_NUTRITION_FACT_CATEGORIES.has(ingredientCategory)
    ) {
      nutrition_facts_rows.push(rowWithMetadata);
      return;
    }

    if (isLikelyProprietaryBlendRow(row, ingredientName, ingredientCategory)) {
      proprietary_blend_rows.push(rowWithMetadata);
      return;
    }

    if (DSLD_ACTIVE_INGREDIENT_CATEGORIES.has(ingredientCategory)) {
      if (doseDetails.hasDisclosedDose) {
        active_ingredients_with_disclosed_dose.push(rowWithMetadata);
      } else {
        active_ingredients_without_disclosed_dose.push(rowWithMetadata);
      }
      return;
    }

    other_or_excluded_rows.push(rowWithMetadata);
  });

  return {
    active_supplement_ingredients: [
      ...active_ingredients_with_disclosed_dose,
      ...active_ingredients_without_disclosed_dose,
    ],
    active_ingredients_with_disclosed_dose,
    active_ingredients_without_disclosed_dose,
    proprietary_blend_rows,
    nutrition_facts_rows,
    other_or_excluded_rows,
  };
}

function getQuantitySummary(quantityRows) {
  if (!Array.isArray(quantityRows) || quantityRows.length === 0) {
    return [];
  }

  return quantityRows.map((row) => {
    const parts = [];
    if (row?.quantity !== undefined && row?.quantity !== null) {
      parts.push(String(row.quantity));
    }
    if (trimString(row?.unit)) {
      parts.push(trimString(row.unit));
    }
    if (row?.servingSizeQuantity !== undefined && row?.servingSizeQuantity !== null) {
      const servingSizeUnit = trimString(row?.servingSizeUnit);
      parts.push(
        `per ${row.servingSizeQuantity}${servingSizeUnit ? ` ${servingSizeUnit}` : ""}`
      );
    }
    return parts.join(" ").trim();
  });
}

export function flattenIngredientRows(rows, depth = 0) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.flatMap((row) => {
    const entry = {
      depth,
      name: trimString(row?.name) || trimString(row?.ingredientGroup) || "Unknown",
      category: trimString(row?.category) || null,
      quantity: getQuantitySummary(row?.quantity),
      notes: trimString(row?.notes) || null,
      raw: row,
    };
    return [entry, ...flattenIngredientRows(row?.nestedRows, depth + 1)];
  });
}

export function summarizeStatements(statements) {
  if (!Array.isArray(statements)) {
    return [];
  }

  return statements
    .map((statement) => ({
      type: trimString(statement?.type) || "Statement",
      notes: trimString(statement?.notes),
      raw: statement,
    }))
    .filter((statement) => statement.notes);
}

export async function searchDsldCandidates(
  inputCase,
  options = {}
) {
  const timeoutMs = parsePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const searchSize = parsePositiveInteger(options.searchSize, DEFAULT_SEARCH_SIZE);
  const labelCandidateLimit = parsePositiveInteger(
    options.labelCandidateLimit,
    DEFAULT_LABEL_CANDIDATE_LIMIT
  );
  const normalizedBarcode = normalizeBarcode(inputCase.barcode);
  const barcodeQueries = [
    normalizedBarcode,
    `"${normalizedBarcode}"`,
    formatBarcodeWithSpaces(normalizedBarcode),
    `"${formatBarcodeWithSpaces(normalizedBarcode)}"`,
  ].filter(Boolean);

  const rawBarcodeHits = [];
  for (const query of barcodeQueries) {
    const hits = await fetchJson(
      buildSearchUrl("search-filter", {
        q: query,
        status: 2,
        sort_by: "_score",
        size: searchSize,
      }),
      timeoutMs
    );
    rawBarcodeHits.push(...(Array.isArray(hits?.hits) ? hits.hits : []));
  }

  const usableBarcodeHits = rawBarcodeHits.filter((hit) =>
    hitLooksPlausibleForInput(inputCase, hit)
  );

  const fallbackQueries = [
    {
      query: `"${inputCase.productName}"`,
      brand: inputCase.brand,
      reason: "quoted product name with brand filter",
    },
    {
      query: inputCase.productName,
      brand: inputCase.brand,
      reason: "plain product name with brand filter",
    },
    {
      query: `${inputCase.brand} ${inputCase.productName}`,
      brand: "",
      reason: "combined brand plus product search",
    },
  ];

  let fallbackHits = [];
  let fallbackReason = "";

  for (const candidate of fallbackQueries) {
    const payload = await fetchJson(
      buildSearchUrl("search-filter", {
        q: candidate.query,
        brand: candidate.brand,
        status: 2,
        sort_by: "_score",
        size: searchSize,
      }),
      timeoutMs
    );
    const hits = Array.isArray(payload?.hits) ? payload.hits : [];
    if (hits.length > 0) {
      fallbackHits = hits;
      fallbackReason = candidate.reason;
      break;
    }
  }

  return {
    normalizedBarcode,
    rawBarcodeHits,
    usableBarcodeHits,
    fallbackHits,
    fallbackReason,
    candidateIds: dedupeIds([...usableBarcodeHits, ...fallbackHits]).slice(
      0,
      labelCandidateLimit
    ),
    timeoutMs,
    searchSize,
    labelCandidateLimit,
  };
}

export async function fetchDsldLabelDetails(labelId, options = {}) {
  const timeoutMs = parsePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  return fetchJson(`${DSLD_BASE_URL}/label/${labelId}`, timeoutMs);
}

export function rankDsldCandidates(inputCase, labels, metadata = {}) {
  const rankedLabels = (Array.isArray(labels) ? labels : [])
    .map((label) => ({
      label,
      match: scoreLabelMatch(inputCase, label),
    }))
    .sort((left, right) => right.match.score - left.match.score);

  return {
    normalizedBarcode: normalizeBarcode(inputCase.barcode),
    rawBarcodeSearchHits: Array.isArray(metadata.rawBarcodeHits)
      ? metadata.rawBarcodeHits.length
      : 0,
    exactBarcodeSearchHits: Array.isArray(metadata.usableBarcodeHits)
      ? metadata.usableBarcodeHits.length
      : 0,
    fallbackSearchHits: Array.isArray(metadata.fallbackHits)
      ? metadata.fallbackHits.length
      : 0,
    fallbackReason: trimString(metadata.fallbackReason),
    best: rankedLabels[0] ?? null,
    candidates: rankedLabels,
  };
}

export async function resolveDsldBestMatch(inputCase, options = {}) {
  const searchResult = await searchDsldCandidates(inputCase, options);
  const labels = [];
  for (const labelId of searchResult.candidateIds) {
    labels.push(
      await fetchDsldLabelDetails(labelId, { timeoutMs: searchResult.timeoutMs })
    );
  }

  return rankDsldCandidates(inputCase, labels, searchResult);
}

export function buildDsldSourceUrl(dsldId) {
  return `https://dsld.od.nih.gov/label/${dsldId}`;
}

function sanitizeForDatabase(value) {
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForDatabase(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeForDatabase(item)])
    );
  }

  return value;
}

function findSuggestedUse(label) {
  const statements = summarizeStatements(label?.statements);
  const suggestedUse = statements.find((statement) =>
    statement.type.toLowerCase().includes("suggested/recommended/usage/directions")
  );
  return suggestedUse?.notes ?? null;
}

function formatLookupSearchPath(result) {
  return [
    `barcode raw hits=${result.rawBarcodeSearchHits ?? 0}`,
    `barcode usable hits=${result.exactBarcodeSearchHits ?? 0}`,
    `fallback hits=${result.fallbackSearchHits ?? 0}`,
    `fallback=${trimString(result.fallbackReason) || "not needed"}`,
  ].join("; ");
}

function buildProductCacheRow(label) {
  const contactName =
    Array.isArray(label?.contacts) && label.contacts.length > 0
      ? trimString(label.contacts[0]?.contactDetails?.name)
      : "";

  return sanitizeForDatabase({
    dsld_id: label.id,
    product_name: trimString(label?.fullName) || null,
    brand_name: trimString(label?.brandName) || contactName || null,
    barcode_raw: trimString(label?.upcSku) || null,
    barcode_normalized: normalizeBarcode(label?.upcSku) || null,
    market_status: marketStatusFromOffMarket(label?.offMarket),
    serving_size: formatServingSize(label?.servingSizes, label?.servingsPerContainer),
    supplement_form:
      trimString(label?.physicalState?.langualCodeDescription) || null,
    suggested_use: findSuggestedUse(label),
    source_url: buildDsldSourceUrl(label.id),
    raw_json: sanitizeForDatabase(label),
    fetched_at: new Date().toISOString(),
  });
}

function buildIngredientRows(label) {
  const flattened = [];

  function walk(rows, depth = 0, state = { value: 0 }) {
    if (!Array.isArray(rows)) return;

    rows.forEach((row) => {
      state.value += 1;
      const quantities = Array.isArray(row?.quantity) && row.quantity.length > 0
        ? row.quantity
        : [null];

      quantities.forEach((quantityRow, quantityIndex) => {
        const dvGroup = Array.isArray(quantityRow?.dailyValueTargetGroup)
          ? quantityRow.dailyValueTargetGroup[0]
          : null;
        const servingSize =
          quantityRow?.servingSizeQuantity !== undefined &&
          quantityRow?.servingSizeQuantity !== null
            ? `${quantityRow.servingSizeQuantity}${
                trimString(quantityRow?.servingSizeUnit)
                  ? ` ${trimString(quantityRow.servingSizeUnit)}`
                  : ""
              }`
            : null;

        flattened.push(
          sanitizeForDatabase({
            dsld_id: label.id,
            ingredient_name:
              trimString(row?.name) || trimString(row?.ingredientGroup) || "Unknown",
            ingredient_category: trimString(row?.category) || null,
            amount_per_serving:
              quantityRow?.quantity !== undefined && quantityRow?.quantity !== null
                ? quantityRow.quantity
                : null,
            amount_unit: trimString(quantityRow?.unit) || null,
            percent_daily_value:
              dvGroup?.percent !== undefined && dvGroup?.percent !== null
                ? dvGroup.percent
                : null,
            daily_value_target_group: trimString(dvGroup?.name) || null,
            serving_size: servingSize,
            row_order: state.value * 100 + quantityIndex,
            raw_json: {
              ingredientRow: sanitizeForDatabase(row),
              quantityRow: sanitizeForDatabase(quantityRow),
              depth,
            },
          })
        );
      });

      walk(row?.nestedRows, depth + 1, state);
    });
  }

  walk(label?.ingredientRows);
  return flattened;
}

function buildStatementRows(label) {
  return summarizeStatements(label?.statements).map((statement) =>
    sanitizeForDatabase({
      dsld_id: label.id,
      statement_type: statement.type,
      statement: statement.notes,
      raw_json: statement.raw,
    })
  );
}

function buildLookupAttemptRow(inputCase, result, success, errorMessage = "") {
  return sanitizeForDatabase({
    input_barcode: trimString(inputCase.barcode) || null,
    normalized_barcode: normalizeBarcode(inputCase.barcode) || null,
    input_brand: trimString(inputCase.brand) || null,
    input_product_name: trimString(inputCase.productName) || null,
    matched_dsld_id: success ? result?.best?.label?.id ?? null : null,
    confidence: success ? result?.best?.match?.confidence ?? "low" : "low",
    match_reasons: success ? result?.best?.match?.reasons ?? [] : [],
    search_path: result ? formatLookupSearchPath(result) : null,
    success: Boolean(success),
    error_message: trimString(errorMessage) || null,
  });
}

export function loadDotEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  let text = "";

  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function requireEnv(name, fallback = "") {
  const value = trimString(process.env[name] || fallback);
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

export function createAdminClient() {
  const supabaseUrl = requireEnv(
    "SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL
  );
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function cacheDsldLabelResult({
  supabase,
  inputCase,
  result,
  label = result?.best?.label,
}) {
  if (!supabase) {
    throw new Error("Missing Supabase client.");
  }

  if (!inputCase || !result || !label?.id) {
    throw new Error("Missing DSLD match data to cache.");
  }

  const productRow = buildProductCacheRow(label);
  const ingredientRows = buildIngredientRows(label);
  const statementRows = buildStatementRows(label);
  const lookupAttemptRow = buildLookupAttemptRow(inputCase, result, true);

  const { error: productError } = await supabase
    .from("dsld_products_cache")
    .upsert(productRow, { onConflict: "dsld_id" });
  if (productError) {
    throw new Error(`[supabase:dsld_products_cache] ${productError.message}`);
  }

  const { error: ingredientDeleteError } = await supabase
    .from("dsld_product_ingredients")
    .delete()
    .eq("dsld_id", label.id);
  if (ingredientDeleteError) {
    throw new Error(
      `[supabase:dsld_product_ingredients:delete] ${ingredientDeleteError.message}`
    );
  }

  if (ingredientRows.length > 0) {
    const { error: ingredientInsertError } = await supabase
      .from("dsld_product_ingredients")
      .insert(ingredientRows);
    if (ingredientInsertError) {
      throw new Error(
        `[supabase:dsld_product_ingredients:insert] ${ingredientInsertError.message}`
      );
    }
  }

  const { error: statementDeleteError } = await supabase
    .from("dsld_product_label_statements")
    .delete()
    .eq("dsld_id", label.id);
  if (statementDeleteError) {
    throw new Error(
      `[supabase:dsld_product_label_statements:delete] ${statementDeleteError.message}`
    );
  }

  if (statementRows.length > 0) {
    const { error: statementInsertError } = await supabase
      .from("dsld_product_label_statements")
      .insert(statementRows);
    if (statementInsertError) {
      throw new Error(
        `[supabase:dsld_product_label_statements:insert] ${statementInsertError.message}`
      );
    }
  }

  const { error: lookupError } = await supabase
    .from("dsld_lookup_attempts")
    .insert(lookupAttemptRow);
  if (lookupError) {
    throw new Error(`[supabase:dsld_lookup_attempts] ${lookupError.message}`);
  }

  return {
    product: productRow,
    ingredients: ingredientRows,
    statements: statementRows,
    lookupAttempt: lookupAttemptRow,
  };
}

export async function logDsldLookupFailure({
  supabase,
  inputCase,
  result = null,
  errorMessage,
}) {
  if (!supabase) {
    throw new Error("Missing Supabase client.");
  }

  const row = buildLookupAttemptRow(inputCase, result, false, errorMessage);
  const { error } = await supabase.from("dsld_lookup_attempts").insert(row);
  if (error) {
    throw new Error(`[supabase:dsld_lookup_attempts] ${error.message}`);
  }
}

export {
  DEFAULT_LABEL_CANDIDATE_LIMIT,
  DEFAULT_SEARCH_SIZE,
  DEFAULT_TIMEOUT_MS,
  PROJECT_ROOT,
  trimString,
};
