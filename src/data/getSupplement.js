import {
  extractIngredientCandidatesFromList,
  matchIngredientsToCatalog,
} from "@/features/scanner/ingredientMatching";
import {
  CATALOG_TYPES,
  createSupplementProductCatalogId,
  getCatalogEntityId,
  getCatalogType,
} from "@/features/supplements/catalog";
import { supabase } from "@src/lib/supabase";
import {
  buildLinkedSupplementPayload,
  buildSupplementReferenceItems,
} from "./buildLinkedSupplementPayload";
import { fetchIngredientMatchCatalog } from "./getIngredientMatchCatalog";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeByKey(items, getKey) {
  const seen = new Set();

  return (items ?? []).filter((item) => {
    const key = getKey(item);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function formatDosageValue(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number.isInteger(value) ? String(value) : String(Number(value));
}

function formatDosageUnit(value) {
  const normalizedUnit = trimString(value).toLowerCase();
  if (!normalizedUnit) {
    return "";
  }

  if (normalizedUnit === "mcg" || normalizedUnit === "ug" || normalizedUnit === "µg") {
    return "μg";
  }

  return normalizedUnit;
}

function buildStructuredDosageDisplay(row) {
  const dosageValue = parseFloat(row?.dosage_value);
  const dosageUnit = formatDosageUnit(row?.dosage_unit);

  if (!Number.isFinite(dosageValue) || !dosageUnit) {
    return null;
  }

  const chemicalForm = trimString(row?.chemical_form);
  const chemicalFormLabel = chemicalForm ? `${chemicalForm} ` : "";

  return `${chemicalFormLabel}${formatDosageValue(dosageValue)}${dosageUnit}`;
}

function buildDosageDisplay(row) {
  const structuredDisplay = buildStructuredDosageDisplay(row);
  if (structuredDisplay) {
    return structuredDisplay;
  }

  const originalText = trimString(row?.dosage_original_text);
  if (originalText) {
    const canonicalName = trimString(row?.canonical_name);
    if (canonicalName) {
      const normalizedOriginal = originalText.toLowerCase();
      const normalizedCanonical = canonicalName.toLowerCase();

      if (normalizedOriginal.startsWith(`${normalizedCanonical} `)) {
        return originalText.slice(canonicalName.length).trim();
      }
    }

    return originalText;
  }

  return null;
}

function buildProductIngredientKey(match) {
  return [
    trimString(match?.catalogId),
    trimString(match?.ingredientRaw).toLowerCase(),
    match?.dosageValue ?? "",
    trimString(match?.dosageUnit),
    trimString(match?.dosageDisplay),
    trimString(match?.chemicalForm),
    trimString(match?.amountBasis),
  ].join("|");
}

function normalizeIngredientComparisonName(value) {
  return trimString(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function buildProductIngredientDisplayDedupKey(match) {
  const catalogId = trimString(match?.catalogId);
  const ingredientName =
    normalizeIngredientComparisonName(
      match?.ingredientRaw || match?.ingredientName || match?.catalogName
    ) || "";
  const normalizedDose = normalizeDoseForComparison(
    match?.dosageValue,
    match?.dosageUnit
  );
  const normalizedUnit = trimString(match?.dosageUnit).toLowerCase();
  const chemicalForm = normalizeIngredientComparisonName(match?.chemicalForm);

  return [
    catalogId,
    ingredientName,
    Number.isFinite(normalizedDose) ? normalizedDose : "",
    normalizedUnit,
    chemicalForm,
  ].join("|");
}

function normalizeDoseForComparison(value, unit) {
  const doseValue = Number(value);
  const normalizedUnit = trimString(unit).toLowerCase();

  if (!Number.isFinite(doseValue)) {
    return null;
  }

  if (["g", "gram", "grams"].includes(normalizedUnit)) {
    return doseValue * 1000;
  }

  if (["mg", "milligram", "milligrams"].includes(normalizedUnit)) {
    return doseValue;
  }

  if (["mcg", "ug", "µg", "μg"].includes(normalizedUnit)) {
    return doseValue / 1000;
  }

  return doseValue;
}

function getActiveEquivalentPreferenceScore(match) {
  const ingredientName = normalizeIngredientComparisonName(match?.ingredientRaw);
  const catalogName = normalizeIngredientComparisonName(match?.catalogName);

  let score = 0;

  if (catalogName && ingredientName === catalogName) {
    score += 100;
  }

  if (Number.isFinite(Number(match?.dosageValue))) {
    score += 10;
  }

  return score;
}

function shouldReplaceDuplicateIngredient(existing, next) {
  const existingScore = getActiveEquivalentPreferenceScore(existing);
  const nextScore = getActiveEquivalentPreferenceScore(next);

  if (nextScore !== existingScore) {
    return nextScore > existingScore;
  }

  const existingDose = normalizeDoseForComparison(
    existing?.dosageValue,
    existing?.dosageUnit
  );
  const nextDose = normalizeDoseForComparison(next?.dosageValue, next?.dosageUnit);

  if (
    Number.isFinite(existingDose) &&
    Number.isFinite(nextDose) &&
    nextDose !== existingDose
  ) {
    return nextDose < existingDose;
  }

  return false;
}

function dedupeProductIngredientsForDisplay(matches) {
  const bestByKey = new Map();

  (matches ?? []).forEach((match) => {
    const key = buildProductIngredientDisplayDedupKey(match);

    if (!key) {
      return;
    }

    const existing = bestByKey.get(key);
    if (!existing || shouldReplaceDuplicateIngredient(existing, match)) {
      bestByKey.set(key, match);
    }
  });

  return Array.from(bestByKey.values());
}

function buildProductIngredientMatch(row, supplementNameById) {
  const supplementId = trimString(row?.canonical_supplement_id);
  const canonicalName = trimString(row?.canonical_name);
  const linkedSupplementName = trimString(supplementNameById.get(supplementId));
  const ingredientName = canonicalName || linkedSupplementName || "Active ingredient";

  return {
    catalogId: supplementId || null,
    catalogName: linkedSupplementName || "",
    ingredientName,
    ingredientRaw: canonicalName || ingredientName,
    classification: "active",
    matchType: supplementId ? "linked" : "product_active_ingredient",
    score: 100,
    verified: Boolean(supplementId),
    sourceTable: "product_active_ingredients",
    dosageValue: Number.isFinite(parseFloat(row?.dosage_value)) ? parseFloat(row?.dosage_value) : null,
    dosageUnit: trimString(row?.dosage_unit) || null,
    dosageDisplay: buildDosageDisplay(row),
    chemicalForm: trimString(row?.chemical_form) || null,
    amountBasis: trimString(row?.amount_basis) || null,
  };
}

function attachSupplementReferenceItems(row) {
  return {
    ...row,
    referenceItems: buildSupplementReferenceItems(row?.supplement_benefits),
  };
}

const SUPPLEMENT_SELECT = `
  id,
  name,
  status,
  what_is_it,
  how_does_it_work,
  how_to_use,
  why_use_it,
  side_effects,
  risks_and_interactions,
  who_might_benefit,
  evidence,
  evidence_score,
  recommended_dose_status,
  recommended_dose_json,
  dose_scoring_profile_json,
  supplement_benefits (
    *
  )
`;

const PRODUCT_ACTIVE_INGREDIENTS_SELECT = `
  canonical_supplement_id,
  canonical_name,
  ingredient_type,
  dosage_value,
  dosage_unit,
  dosage_original_text,
  chemical_form,
  amount_basis
`;

async function getOffProductBarcode(productId) {
  const cleanProductId = trimString(productId);
  if (!cleanProductId) {
    return null;
  }

  const { data, error } = await supabase
    .from("off_products")
    .select("barcode")
    .eq("id", cleanProductId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to load off product barcode", error);
    return null;
  }

  return trimString(data?.barcode) || null;
}

export async function getSupplementsByIds(ids) {
  const cleanIds = Array.from(
    new Set((ids ?? []).map((id) => trimString(id)).filter(Boolean))
  );

  if (cleanIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("supplements")
    .select(SUPPLEMENT_SELECT)
    .in("status", ["approved", "pending"])
    .in("id", cleanIds);

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []).map((row) => ({
    ...attachSupplementReferenceItems(row),
    verified: row?.status === "approved",
    catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
  }));
}

async function loadSupplementProductIngredientSets(catalogId) {
  const productId = getCatalogEntityId(catalogId);
  if (!productId) {
    return {
      activeIngredients: [],
      linkedIngredients: [],
      supplementRows: [],
    };
  }

  const { data, error } = await supabase
    .from("product_active_ingredients")
    .select(PRODUCT_ACTIVE_INGREDIENTS_SELECT)
    .eq("product_id", productId)
    .eq("ingredient_type", "active")
    .order("canonical_name", { ascending: true })
    .order("dosage_value", { ascending: true, nullsFirst: false })
    .order("dosage_original_text", { ascending: true });

  if (error) {
    console.error("Failed to load product active ingredients", error);
    return {
      activeIngredients: [],
      linkedIngredients: [],
      supplementRows: [],
    };
  }

  const supplementRows = await getSupplementsByIds(
    (data ?? []).map((row) => row?.canonical_supplement_id)
  );
  const supplementNameById = new Map(
    supplementRows.map((row) => [row.id, row.name])
  );

  const activeIngredients = dedupeProductIngredientsForDisplay(
    dedupeByKey(
      (data ?? [])
        .map((row) => buildProductIngredientMatch(row, supplementNameById))
        .filter((match) => trimString(match.ingredientName)),
      buildProductIngredientKey
    )
  );

  const linkedIngredients = dedupeByKey(
    activeIngredients.filter((match) => trimString(match.catalogId)),
    (match) => trimString(match.catalogId)
  );

  return {
    activeIngredients,
    linkedIngredients,
    supplementRows,
  };
}

async function loadMasterJsonIngredientSets(activeIngredientsJson) {
  if (
    !Array.isArray(activeIngredientsJson) ||
    activeIngredientsJson.length === 0
  ) {
    return {
      activeIngredients: [],
      linkedIngredients: [],
      supplementRows: [],
    };
  }

  const candidates = extractIngredientCandidatesFromList(activeIngredientsJson);
  if (candidates.length === 0) {
    return {
      activeIngredients: [],
      linkedIngredients: [],
      supplementRows: [],
    };
  }

  const catalogRows = await fetchIngredientMatchCatalog();
  const { matchedIngredients } = matchIngredientsToCatalog(
    candidates,
    catalogRows
  );
  const activeIngredients =
    dedupeProductIngredientsForDisplay(matchedIngredients);
  const linkedIngredients = dedupeByKey(
    activeIngredients.filter((match) => trimString(match.catalogId)),
    (match) => trimString(match.catalogId)
  );
  const supplementRows = await getSupplementsByIds(
    linkedIngredients.map((match) => match.catalogId)
  );

  return {
    activeIngredients,
    linkedIngredients,
    supplementRows,
  };
}

export async function getSupplementProductActiveIngredients(catalogId) {
  const { activeIngredients } = await loadSupplementProductIngredientSets(
    catalogId
  );
  return activeIngredients;
}

export async function getSupplementProductLinkedIngredients(catalogId) {
  const { linkedIngredients } = await loadSupplementProductIngredientSets(
    catalogId
  );
  return linkedIngredients;
}

async function getActiveIngredientById(catalogId) {
  const cleanId = getCatalogEntityId(catalogId);
  if (!cleanId) {
    return null;
  }

  const { data, error } = await supabase
    .from("supplements")
    .select(SUPPLEMENT_SELECT)
    .eq("id", cleanId)
    .in("status", ["approved", "pending"])
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    ...attachSupplementReferenceItems(data),
    verified: data?.status === "approved",
    catalogType: CATALOG_TYPES.ACTIVE_INGREDIENT,
  };
}

async function getSupplementProductById(catalogId, fallbackName) {
  const productId = getCatalogEntityId(catalogId);
  if (!productId) {
    return null;
  }

  const { data, error } = await supabase
    .from("supplement_products_master")
    .select(
      "product_id, barcode, display_name, active_ingredients_json, serving_size_text, image_url, image_thumbnail_url, image_source_url, image_provider, image_query, image_confidence, image_status, image_error, image_manual_override, image_last_checked_at, verification_status"
    )
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load supplement product", error);
    return null;
  }

  if (!data) {
    return null;
  }

  let { activeIngredients, linkedIngredients, supplementRows } =
    await loadSupplementProductIngredientSets(catalogId);
  if (
    activeIngredients.length === 0 &&
    linkedIngredients.length === 0 &&
    Array.isArray(data?.active_ingredients_json) &&
    data.active_ingredients_json.length > 0
  ) {
    ({ activeIngredients, linkedIngredients, supplementRows } =
      await loadMasterJsonIngredientSets(data.active_ingredients_json));
  }

  const supplementsByCatalogId = new Map(
    supplementRows.map((row) => [row.id, row])
  );
  const displayName =
    trimString(data?.display_name) || trimString(fallbackName) || "Supplement";
  const barcode =
    trimString(data?.barcode) || (await getOffProductBarcode(data.product_id));
  const verificationStatus =
    trimString(data?.verification_status) || "verified";

  return {
    ...buildLinkedSupplementPayload({
      id: createSupplementProductCatalogId(data.product_id),
      name: displayName,
      verified: false,
      catalogType: CATALOG_TYPES.SUPPLEMENT_PRODUCT,
      matchedIngredients: linkedIngredients,
      displayIngredients: activeIngredients,
      servingSizeText: trimString(data?.serving_size_text) || null,
      supplementsByCatalogId,
    }),
    productId: String(data.product_id),
    product_id: String(data.product_id),
    display_name: displayName,
    active_ingredients_json: Array.isArray(data?.active_ingredients_json)
      ? data.active_ingredients_json
      : null,
    barcode,
    image_url: trimString(data?.image_url) || null,
    image_thumbnail_url: trimString(data?.image_thumbnail_url) || null,
    image_source_url: trimString(data?.image_source_url) || null,
    image_provider: trimString(data?.image_provider) || null,
    image_query: trimString(data?.image_query) || null,
    image_confidence: Number.isFinite(Number(data?.image_confidence))
      ? Number(data.image_confidence)
      : null,
    image_status: trimString(data?.image_status) || "missing",
    image_error: trimString(data?.image_error) || null,
    image_manual_override: Boolean(data?.image_manual_override),
    image_last_checked_at: trimString(data?.image_last_checked_at) || null,
    verification_status: verificationStatus,
    verificationStatus,
    scanDetailsIncomplete: verificationStatus === "go_upc_unverified",
    ingredient_count: activeIngredients.length,
  };
}

export async function getSupplementById(supplementId, fallbackName) {
  const catalogType = getCatalogType(supplementId);
  if (
    catalogType === CATALOG_TYPES.CUSTOM ||
    catalogType === CATALOG_TYPES.LEGACY_CUSTOM
  ) {
    return null;
  }

  if (catalogType === CATALOG_TYPES.SUPPLEMENT_PRODUCT) {
    return getSupplementProductById(supplementId, fallbackName);
  }

  return getActiveIngredientById(supplementId);
}
