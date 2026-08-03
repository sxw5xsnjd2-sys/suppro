import {
  buildProductEvidenceScoreData,
  scoreMatchedIngredientsForProduct,
} from "../../../features/supplements/recommendedDoseScoring.js";
import {
  FEDERATED_SEARCH_CACHE_VERSION,
  MAX_EAN_SEARCH_PAGES,
  MAX_EAN_SEARCH_RESULTS,
  fetchBoundedEanPages,
  mergeFederatedCandidates,
  normalizeFederatedCandidate,
  normalizeSearchBarcode,
  sanitizeFederatedDiagnostic,
} from "./federated-product-search-policy.js";

const DSLD_BASE_URL = "https://api.ods.od.nih.gov/dsld/v9";
const EAN_SEARCH_BASE_URL = "https://api.ean-search.org/api";
const GO_UPC_BASE_URL = "https://go-upc.com/api/v1/code";
const FETCH_TIMEOUT_MS = 1_250;

type SupabaseClient = any;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values: unknown[]) {
  return values.map(trimString).find(Boolean) ?? "";
}

function providerError(response: Response) {
  const error = new Error(`Provider request failed with status ${response.status}`) as Error & {
    status?: number;
  };
  error.status = response.status;
  return error;
}

async function fetchJson(url: URL | string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw providerError(response);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function evidenceSnapshot(score: unknown) {
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100
    ? {
        type: "overall_product_evidence",
        score,
        calculatedAt: new Date().toISOString(),
        calculationVersion: "recommended-dose-product-evidence.v1",
      }
    : null;
}

async function calculateCachedProductEvidence(
  ingredientRows: any[],
  supplementsByCatalogId: Map<string, any>,
  servingSizeText: string,
) {
  if (!ingredientRows?.length || !supplementsByCatalogId.size) return null;
  const matches = ingredientRows.map((row: any) => ({
    catalogId: trimString(row?.canonical_supplement_id),
    catalogName: trimString(supplementsByCatalogId.get(trimString(row?.canonical_supplement_id))?.name),
    ingredientName: trimString(row?.canonical_name),
    ingredientRaw: trimString(row?.canonical_name),
    dosageValue: Number.isFinite(Number(row?.dosage_value)) ? Number(row.dosage_value) : null,
    dosageUnit: trimString(row?.dosage_unit) || null,
    dosageOriginalText: trimString(row?.dosage_original_text) || null,
    dosageDisplay: trimString(row?.dosage_original_text) || null,
    chemicalForm: trimString(row?.chemical_form) || null,
    amountBasis: trimString(row?.amount_basis) || null,
    doseConfidence: trimString(row?.dose_confidence) || null,
    doseReviewReason: trimString(row?.dose_review_reason) || null,
  }));
  const scored = scoreMatchedIngredientsForProduct({
    matchedIngredients: matches,
    supplementsByCatalogId,
    servingSizeText,
  });
  const comparable = scored.filter((row: any) => Number.isFinite(row?.evidenceScore));
  if (!comparable.length || comparable.some((row: any) => row?.doseComparisonValid !== true)) return null;
  return evidenceSnapshot(buildProductEvidenceScoreData(scored)?.evidenceScore);
}

async function loadProductEvidenceSnapshots(adminSupabase: SupabaseClient, rows: any[]) {
  const productIds = rows.map((row) => trimString(row?.product_id)).filter(Boolean);
  if (!productIds.length) return new Map<string, any>();
  const { data: ingredientRows, error: ingredientError } = await adminSupabase
    .from("product_active_ingredients")
    .select(
      "product_id, canonical_supplement_id, canonical_name, dosage_value, dosage_unit, dosage_original_text, chemical_form, amount_basis, dose_confidence, dose_review_reason",
    )
    .in("product_id", productIds)
    .eq("ingredient_type", "active");
  if (ingredientError || !ingredientRows?.length) return new Map<string, any>();

  const supplementIds = Array.from(new Set(
    ingredientRows.map((row: any) => trimString(row?.canonical_supplement_id)).filter(Boolean),
  ));
  if (!supplementIds.length) return new Map<string, any>();
  const { data: supplements, error: supplementError } = await adminSupabase
    .from("supplements")
    .select("id, name, evidence_score, recommended_dose_status, recommended_dose_json, dose_scoring_profile_json")
    .in("id", supplementIds);
  if (supplementError || !supplements?.length) return new Map<string, any>();

  const supplementsByCatalogId = new Map<string, any>(
    supplements.map((row: any) => [trimString(row?.id), row]),
  );
  const ingredientsByProduct = new Map<string, any[]>();
  ingredientRows.forEach((row: any) => {
    const productId = trimString(row?.product_id);
    ingredientsByProduct.set(productId, [...(ingredientsByProduct.get(productId) ?? []), row]);
  });
  return new Map(await Promise.all(rows.map(async (row: any) => {
    const productId = trimString(row?.product_id);
    return [productId, await calculateCachedProductEvidence(
      ingredientsByProduct.get(productId) ?? [],
      supplementsByCatalogId,
      trimString(row?.serving_size_text),
    )] as [string, any];
  })));
}

async function masterRowsToCandidates(adminSupabase: SupabaseClient, rows: any[]) {
  const snapshotsByProductId = await loadProductEvidenceSnapshots(adminSupabase, rows ?? []);
  return (rows ?? []).map((row: any) => ({
    provider: "master",
    providerStableId: trimString(row?.product_id),
    canonicalProductId: trimString(row?.product_id),
    name: firstString(row?.display_name, row?.product_id),
    brand: null,
    barcode: normalizeSearchBarcode(row?.barcode) || null,
    imageUrl: trimString(row?.image_url) || null,
    servingSizeText: trimString(row?.serving_size_text) || null,
    verificationStatus: trimString(row?.verification_status) || "verified",
    completenessStatus: Number(row?.ingredient_count) > 0 ? "complete" : "incomplete",
    navigationDescriptor: {
      type: "canonical_product",
      productId: trimString(row?.product_id),
    },
    evidenceSnapshot: snapshotsByProductId.get(trimString(row?.product_id)) ?? null,
  }));
}

export function createFederatedSearchCache(adminSupabase: SupabaseClient, logDiagnostic: Function) {
  return {
    async get(cacheKey: string) {
      const { data, error } = await adminSupabase
        .from("supplement_product_search_cache")
        .select("cache_version, provider, normalized_query, provider_status, response_json, fetched_at, expires_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (error) {
        logDiagnostic("cache_read", error);
        return null;
      }
      if (!data) return null;
      return {
        cacheVersion: data.cache_version,
        provider: data.provider,
        normalizedQuery: data.normalized_query,
        providerStatus: data.provider_status,
        results: Array.isArray(data.response_json) ? data.response_json : [],
        fetchedAt: data.fetched_at,
        expiresAt: data.expires_at,
      };
    },
    async set(cacheKey: string, value: any) {
      const { error } = await adminSupabase.from("supplement_product_search_cache").upsert({
        cache_key: cacheKey,
        cache_version: value.cacheVersion || FEDERATED_SEARCH_CACHE_VERSION,
        provider: value.provider,
        normalized_query: value.normalizedQuery,
        provider_status: value.providerStatus,
        response_json: value.results,
        fetched_at: value.fetchedAt,
        expires_at: value.expiresAt,
      }, { onConflict: "cache_key" });
      if (error) logDiagnostic("cache_write", error);
    },
  };
}

export function createFederatedProductProviders({
  adminSupabase,
  eanSearchToken,
}: {
  adminSupabase: SupabaseClient;
  eanSearchToken: string;
}) {
  return {
    async master(normalizedQuery: string) {
      const { data, error } = await adminSupabase
        .from("supplement_products_master")
        .select(
          "product_id, barcode, display_name, serving_size_text, ingredient_count, image_url, verification_status",
        )
        .ilike("display_name", `%${normalizedQuery}%`)
        .limit(12);
      if (error) throw error;
      return { results: await masterRowsToCandidates(adminSupabase, data ?? []) };
    },

    async dsldCache(normalizedQuery: string) {
      const { data, error } = await adminSupabase
        .from("dsld_products_cache")
        .select("dsld_id, product_name, brand_name, barcode_normalized, serving_size, source_url")
        .ilike("product_name", `%${normalizedQuery}%`)
        .limit(8);
      if (error) throw error;
      return {
        results: (data ?? []).map((row: any) => ({
          provider: "dsld_cache",
          providerStableId: String(row.dsld_id),
          name: firstString(row.product_name, `DSLD ${row.dsld_id}`),
          brand: trimString(row.brand_name) || null,
          barcode: normalizeSearchBarcode(row.barcode_normalized) || null,
          servingSizeText: trimString(row.serving_size) || null,
          verificationStatus: "dsld_verified",
          completenessStatus: "complete",
        })),
      };
    },

    async dsldLive(normalizedQuery: string) {
      const url = new URL(`${DSLD_BASE_URL}/search-filter`);
      url.searchParams.set("q", normalizedQuery);
      url.searchParams.set("status", "2");
      url.searchParams.set("sort_by", "_score");
      url.searchParams.set("size", "8");
      const payload = await fetchJson(url, { headers: { accept: "application/json" } });
      const hits = Array.isArray(payload?.hits) ? payload.hits : Array.isArray(payload) ? payload : [];
      return {
        results: hits.map((hit: any) => {
          const source = hit?._source ?? hit;
          const stableId = firstString(hit?._id, source?.id, source?.labelId);
          return {
            provider: "dsld",
            providerStableId: stableId,
            name: firstString(source?.fullName, source?.productName, source?.product_name, source?.name),
            brand: firstString(source?.brandName, source?.brand_name) || null,
            barcode: normalizeSearchBarcode(firstString(source?.upcSku, source?.barcode)) || null,
            verificationStatus: "dsld_search_result",
            completenessStatus: "incomplete",
          };
        }).filter((row: any) => row.providerStableId && row.name),
      };
    },

    async ean(normalizedQuery: string) {
      if (!eanSearchToken) return { status: "config_blocked", results: [] };
      const rows = await fetchBoundedEanPages({
        maxPages: MAX_EAN_SEARCH_PAGES,
        limit: MAX_EAN_SEARCH_RESULTS,
        fetchPage: async (page: number) => {
          const url = new URL(EAN_SEARCH_BASE_URL);
          url.searchParams.set("op", "product-search");
          url.searchParams.set("format", "json");
          url.searchParams.set("name", normalizedQuery);
          url.searchParams.set("page", String(page));
          url.searchParams.set("token", eanSearchToken);
          const payload = await fetchJson(url, { headers: { accept: "application/json" } });
          return Array.isArray(payload) ? payload : [];
        },
      });
      return {
        results: rows.map((row: any) => ({
          provider: "ean_search",
          providerStableId: firstString(row?.ean, row?.id),
          name: trimString(row?.name),
          brand: trimString(row?.brand) || null,
          barcode: normalizeSearchBarcode(row?.ean) || null,
          imageUrl: firstString(row?.image, row?.imageUrl) || null,
          verificationStatus: "ean_search_unverified",
          completenessStatus: "incomplete",
        })).filter((row: any) => row.providerStableId && row.name),
      };
    },

    async go() {
      return { status: "config_blocked", results: [] };
    },
  };
}

function formatDsldServingSize(label: any) {
  const serving = Array.isArray(label?.servingSizes) ? label.servingSizes[0] : null;
  if (!serving) return "";
  return [serving?.minQuantity, trimString(serving?.unit)].filter((value) => value !== "" && value != null).join(" ");
}

function flattenDsldIngredients(rows: any[], result: any[] = []) {
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const quantities = Array.isArray(row?.quantity) && row.quantity.length ? row.quantity : [null];
    quantities.forEach((quantity: any) => {
      const dosageValue = Number(quantity?.quantity);
      result.push({
        name: firstString(row?.name, row?.ingredientGroup),
        dosageValue: Number.isFinite(dosageValue) ? dosageValue : null,
        dosageUnit: trimString(quantity?.unit) || null,
        dosageDisplay: Number.isFinite(dosageValue) && trimString(quantity?.unit)
          ? `${dosageValue} ${trimString(quantity.unit)}`
          : null,
        ingredientType: trimString(row?.category) || null,
        parentBlend: null,
      });
    });
    flattenDsldIngredients(row?.nestedRows, result);
  });
  return result.filter((row) => row.name);
}

async function fetchGoUpcBarcode(barcode: string, goUpcApiKey: string) {
  if (!barcode || !goUpcApiKey) return null;
  try {
    return await fetchJson(`${GO_UPC_BASE_URL}/${encodeURIComponent(barcode)}`, {
      headers: { Authorization: `Bearer ${goUpcApiKey}`, accept: "application/json" },
    });
  } catch (error) {
    if (Number((error as any)?.status) === 404) return null;
    throw error;
  }
}

async function invokeExistingPersistence({ supabaseUrl, serviceRoleKey, payload }: any) {
  const response = await fetch(`${supabaseUrl}/functions/v1/persist-go-upc-product`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw providerError(response);
  return await response.json();
}

export async function loadCanonicalProduct(adminSupabase: SupabaseClient, productId: string) {
  const { data, error } = await adminSupabase
    .from("supplement_products_master")
    .select("product_id, barcode, display_name, serving_size_text, ingredient_count, image_url, verification_status")
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await masterRowsToCandidates(adminSupabase, [data]))[0] ?? null;
}

export async function resolveExternalCandidate({
  candidate,
  adminSupabase,
  supabaseUrl,
  serviceRoleKey,
  goUpcApiKey,
}: any) {
  if (candidate.canonicalProductId) {
    return await loadCanonicalProduct(adminSupabase, candidate.canonicalProductId);
  }

  let descriptor: any = { ...candidate };
  let usedGoUpcEnrichment = false;
  let persistencePayload: any = null;
  if (candidate.provider === "dsld" || candidate.provider === "dsld_cache") {
    const label = await fetchJson(`${DSLD_BASE_URL}/label/${encodeURIComponent(candidate.providerStableId)}`, {
      headers: { accept: "application/json" },
    });
    const barcode = normalizeSearchBarcode(firstString(label?.upcSku, candidate.barcode));
    const goPayload = barcode ? await fetchGoUpcBarcode(barcode, goUpcApiKey) : null;
    usedGoUpcEnrichment = Boolean(goPayload?.product);
    const sourceIngredients = flattenDsldIngredients(label?.ingredientRows);
    descriptor = {
      ...candidate,
      name: firstString(label?.fullName, candidate.name),
      brand: firstString(label?.brandName, candidate.brand) || null,
      barcode: barcode || null,
      imageUrl: firstString(goPayload?.product?.imageUrl) || null,
      servingSizeText: formatDsldServingSize(label) || null,
      verificationStatus: "dsld_verified",
      completenessStatus: sourceIngredients.length ? "complete" : "incomplete",
      evidenceSnapshot: null,
    };
    if (barcode && sourceIngredients.length) {
      persistencePayload = {
        barcode,
        barcodeType: barcode.length === 13 ? "ean13" : "upc_a",
        productName: descriptor.name,
        brand: descriptor.brand || "",
        servingSizeText: descriptor.servingSizeText || "",
        ingredientsText: "",
        sourceIngredients,
        imageUrl: descriptor.imageUrl || "",
        source: "dsld",
        exactBarcodeMatch: true,
        dsldConfidence: "high",
      };
    }
  } else if (candidate.provider === "ean_search") {
    const goPayload = candidate.barcode
      ? await fetchGoUpcBarcode(candidate.barcode, goUpcApiKey)
      : null;
    usedGoUpcEnrichment = Boolean(goPayload?.product);
    descriptor = {
      ...candidate,
      name: firstString(goPayload?.product?.name, candidate.name),
      brand: firstString(goPayload?.product?.brand, candidate.brand) || null,
      imageUrl: firstString(goPayload?.product?.imageUrl) || null,
      completenessStatus: goPayload?.product ? "complete" : "incomplete",
      evidenceSnapshot: null,
    };
    if (candidate.barcode) {
      persistencePayload = {
        barcode: candidate.barcode,
        barcodeType: candidate.barcode.length === 13 ? "ean13" : "upc_a",
        productName: descriptor.name,
        brand: descriptor.brand || "",
        ingredientsText: firstString(goPayload?.product?.ingredients?.text),
        imageUrl: descriptor.imageUrl || "",
        source: "ean_search",
      };
    }
  }

  if (!persistencePayload) {
    return normalizeFederatedCandidate(descriptor, candidate.provider);
  }
  const persisted = await invokeExistingPersistence({
    supabaseUrl,
    serviceRoleKey,
    payload: persistencePayload,
  });
  const canonicalProductId = trimString(persisted?.productId);
  if (!canonicalProductId) return normalizeFederatedCandidate(descriptor, candidate.provider);

  const sourceRows = [
    { provider: candidate.provider, stableId: candidate.providerStableId },
    ...(usedGoUpcEnrichment ? [{ provider: "go_upc", stableId: candidate.barcode }] : []),
  ].filter((source) => source.stableId);
  const { error: provenanceError } = await adminSupabase
    .from("supplement_product_source_links")
    .upsert(sourceRows.map((source) => ({
      source: source.provider,
      provider_stable_id: source.stableId,
      normalized_barcode: candidate.barcode || null,
      canonical_product_id: canonicalProductId,
      source_metadata: { verificationStatus: descriptor.verificationStatus },
    })), { onConflict: "source,provider_stable_id" });
  if (provenanceError) throw provenanceError;
  const canonical = await loadCanonicalProduct(adminSupabase, canonicalProductId);
  const resolvedDescriptor = normalizeFederatedCandidate({
    ...descriptor,
    canonicalProductId,
  }, candidate.provider);
  return canonical && resolvedDescriptor
    ? mergeFederatedCandidates(canonical, resolvedDescriptor)
    : canonical ?? resolvedDescriptor;
}

export function createFederatedDiagnosticLogger(functionName: string, secrets: string[]) {
  return (stage: string, error: unknown) => {
    console.error(`[${functionName}] provider operation failed`, {
      stage,
      message: sanitizeFederatedDiagnostic(error, secrets),
    });
  };
}
