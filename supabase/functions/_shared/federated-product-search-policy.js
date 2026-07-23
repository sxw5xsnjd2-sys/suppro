export const FEDERATED_SEARCH_CACHE_VERSION = "federated-product-search.v1";
export const OVERALL_PRODUCT_EVIDENCE_CALCULATION_VERSION =
  "recommended-dose-product-evidence.v1";
export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MIN_EXTERNAL_SEARCH_QUERY_LENGTH = 3;
export const MAX_SEARCH_QUERY_LENGTH = 120;
export const MAX_EAN_SEARCH_PAGES = 2;
export const MAX_EAN_SEARCH_RESULTS = 12;

const GENERIC_PRODUCT_NAMES = new Set([
  "capsule",
  "capsules",
  "dietary supplement",
  "multivitamin",
  "supplement",
  "supplements",
  "tablet",
  "tablets",
  "vitamin",
  "vitamins",
]);

const VERIFIED_SOURCE_RANK = {
  master: 100,
  dsld_cache: 85,
  dsld: 80,
  go_upc: 25,
  ean_search: 20,
};

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSearchQuery(value) {
  return trimString(value)
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("und");
}

export function normalizeSearchBarcode(value) {
  return trimString(value).normalize("NFKC").replace(/[\s-]+/gu, "");
}

function getBodyByteLength(value) {
  return new TextEncoder().encode(value).length;
}

function validationError(error, code = "invalid_request_payload") {
  return { ok: false, status: 400, body: { error, code } };
}

export function validateFederatedSearchRequest(rawBodyText) {
  if (!trimString(rawBodyText)) {
    return validationError("Request body is required.");
  }
  if (getBodyByteLength(rawBodyText) > 4_000) {
    return validationError("Request payload is too large.", "payload_too_large");
  }

  let body;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return validationError("Request body must be valid JSON.");
  }

  const normalizedQuery = normalizeSearchQuery(body?.query);
  if (normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
    return validationError("Search query must contain at least two characters.", "query_too_short");
  }
  if (normalizedQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    return validationError("Search query is too long.", "query_too_long");
  }

  const requestId = trimString(body?.requestId).slice(0, 100) || crypto.randomUUID();
  return { ok: true, value: { requestId, normalizedQuery } };
}

export function validateResolveProductRequest(rawBodyText) {
  if (!trimString(rawBodyText)) {
    return validationError("Request body is required.");
  }
  if (getBodyByteLength(rawBodyText) > 30_000) {
    return validationError("Request payload is too large.", "payload_too_large");
  }

  let body;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return validationError("Request body must be valid JSON.");
  }

  const candidate = body?.candidate;
  const provider = trimString(candidate?.provider).toLocaleLowerCase("und");
  const providerStableId = trimString(candidate?.providerStableId);
  const canonicalProductId = trimString(candidate?.canonicalProductId);
  const name = trimString(candidate?.name).normalize("NFKC").replace(/\s+/gu, " ");
  const barcode = normalizeSearchBarcode(candidate?.barcode);
  const allowedProviders = new Set(["master", "dsld", "dsld_cache", "ean_search", "go_upc"]);

  if (!allowedProviders.has(provider)) {
    return validationError("Candidate provider is invalid.");
  }
  if (!canonicalProductId && !providerStableId) {
    return validationError("Candidate stable identity is required.");
  }
  if (!canonicalProductId && !name) {
    return validationError("Candidate name is required.");
  }
  if (barcode && !/^\d{6,14}$/u.test(barcode)) {
    return validationError("Candidate barcode is invalid.", "invalid_barcode");
  }

  return {
    ok: true,
    value: {
      requestId: trimString(body?.requestId).slice(0, 100) || crypto.randomUUID(),
      candidate: {
        provider,
        providerStableId,
        canonicalProductId: canonicalProductId || null,
        name,
        brand: trimString(candidate?.brand).normalize("NFKC").replace(/\s+/gu, " "),
        barcode: barcode || null,
        verificationStatus: trimString(candidate?.verificationStatus) || "unverified",
      },
    },
  };
}

function normalizeEvidenceSnapshot(value) {
  if (!value || typeof value !== "object") return null;
  const score = Number(value.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  const calculatedAt = trimString(value.calculatedAt);
  const calculationVersion = trimString(value.calculationVersion);
  if (!calculatedAt || !calculationVersion) return null;
  return {
    type: "overall_product_evidence",
    score,
    calculatedAt,
    calculationVersion,
  };
}

export function normalizeFederatedCandidate(value, fallbackProvider = "") {
  const provider = trimString(value?.provider || fallbackProvider).toLocaleLowerCase("und");
  const providerStableId = trimString(value?.providerStableId || value?.stableId || value?.id);
  const canonicalProductId = trimString(
    value?.canonicalProductId || value?.productId ||
      (provider === "master" ? providerStableId : ""),
  );
  const name = trimString(value?.name || value?.productName).normalize("NFKC").replace(/\s+/gu, " ");
  if (!provider || !providerStableId || !name) return null;

  const source = {
    provider,
    stableId: providerStableId,
    verificationStatus: trimString(value?.verificationStatus) || "unverified",
  };
  return {
    canonicalProductId: canonicalProductId || null,
    provider,
    providerStableId,
    name,
    brand: trimString(value?.brand).normalize("NFKC").replace(/\s+/gu, " ") || null,
    barcode: normalizeSearchBarcode(value?.barcode) || null,
    imageUrl: trimString(value?.imageUrl) || null,
    servingSizeText: trimString(value?.servingSizeText) || null,
    verificationStatus: source.verificationStatus,
    completenessStatus: trimString(value?.completenessStatus) || "incomplete",
    navigationDescriptor: value?.navigationDescriptor && typeof value.navigationDescriptor === "object"
      ? value.navigationDescriptor
      : canonicalProductId
      ? { type: "canonical_product", productId: canonicalProductId }
      : null,
    evidenceSnapshot: normalizeEvidenceSnapshot(value?.evidenceSnapshot),
    sources: [source],
  };
}

function sourceRank(candidate) {
  return VERIFIED_SOURCE_RANK[candidate?.provider] ?? 0;
}

function isRicherField(value, currentValue) {
  return trimString(value).length > trimString(currentValue).length;
}

function mergeSources(left, right) {
  const sources = [];
  const keys = new Set();
  [...(left ?? []), ...(right ?? [])].forEach((source) => {
    const provider = trimString(source?.provider);
    const stableId = trimString(source?.stableId);
    const key = `${provider}\u0000${stableId}`;
    if (!provider || !stableId || keys.has(key)) return;
    keys.add(key);
    sources.push({
      provider,
      stableId,
      verificationStatus: trimString(source?.verificationStatus) || "unverified",
    });
  });
  return sources;
}

export function mergeFederatedCandidates(left, right) {
  const master = left.provider === "master" ? left : right.provider === "master" ? right : null;
  const preferred = master || (sourceRank(right) > sourceRank(left) ? right : left);
  const secondary = preferred === left ? right : left;
  const merged = { ...preferred };

  ["name", "brand", "imageUrl", "servingSizeText"].forEach((field) => {
    if (!trimString(merged[field]) ||
      (sourceRank(secondary) >= sourceRank(preferred) && isRicherField(secondary[field], merged[field]))) {
      merged[field] = secondary[field] || merged[field] || null;
    }
  });
  merged.canonicalProductId = master?.canonicalProductId || preferred.canonicalProductId || secondary.canonicalProductId || null;
  merged.barcode = preferred.barcode || secondary.barcode || null;
  merged.navigationDescriptor = master?.navigationDescriptor || preferred.navigationDescriptor || secondary.navigationDescriptor || null;
  merged.evidenceSnapshot = master?.evidenceSnapshot || preferred.evidenceSnapshot || secondary.evidenceSnapshot || null;
  merged.completenessStatus = [preferred, secondary].some((item) => item.completenessStatus === "complete")
    ? "complete"
    : "incomplete";
  merged.sources = mergeSources(left.sources, right.sources);
  return merged;
}

function conservativeNameKey(candidate) {
  const brand = normalizeSearchQuery(candidate?.brand);
  const name = normalizeSearchQuery(candidate?.name);
  if (!brand || !name || GENERIC_PRODUCT_NAMES.has(name)) return "";
  return `${brand}\u0000${name}`;
}

export function dedupeFederatedCandidates(values) {
  const results = [];
  const barcodeIndex = new Map();
  const productIndex = new Map();
  const providerIndex = new Map();
  const nameIndex = new Map();

  const reindex = (candidate, index) => {
    if (candidate.barcode) barcodeIndex.set(candidate.barcode, index);
    if (candidate.canonicalProductId) productIndex.set(candidate.canonicalProductId, index);
    providerIndex.set(`${candidate.provider}\u0000${candidate.providerStableId}`, index);
    const nameKey = conservativeNameKey(candidate);
    if (nameKey) nameIndex.set(nameKey, index);
    candidate.sources.forEach((source) => providerIndex.set(`${source.provider}\u0000${source.stableId}`, index));
  };

  for (const raw of values ?? []) {
    const candidate = normalizeFederatedCandidate(raw, raw?.provider);
    if (!candidate) continue;
    const providerKey = `${candidate.provider}\u0000${candidate.providerStableId}`;
    const nameKey = conservativeNameKey(candidate);
    const index =
      (candidate.barcode ? barcodeIndex.get(candidate.barcode) : undefined) ??
      (candidate.canonicalProductId ? productIndex.get(candidate.canonicalProductId) : undefined) ??
      providerIndex.get(providerKey) ??
      (nameKey ? nameIndex.get(nameKey) : undefined);

    if (index === undefined) {
      results.push(candidate);
      reindex(candidate, results.length - 1);
    } else {
      results[index] = mergeFederatedCandidates(results[index], candidate);
      reindex(results[index], index);
    }
  }
  return results;
}

export function classifyProviderError(error) {
  if (error?.name === "AbortError" || error?.code === "provider_timeout") return "timeout";
  const status = Number(error?.status);
  if (status === 429 || error?.code === "rate_limit") return "rate_limit";
  if (status === 401 || status === 403 || status === 402 || status >= 500) return "unavailable";
  return "error";
}

export async function runBoundedProvider({ provider, execute, timeoutMs, limit, now = Date.now }) {
  const startedAt = now();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("Provider timed out");
      error.code = "provider_timeout";
      reject(error);
    }, timeoutMs);
  });

  try {
    const value = await Promise.race([Promise.resolve().then(execute), timeoutPromise]);
    const status = trimString(value?.status) || "success";
    const results = (Array.isArray(value) ? value : value?.results ?? [])
      .slice(0, limit)
      .map((item) => normalizeFederatedCandidate(item, provider))
      .filter(Boolean);
    return { provider, status, results, durationMs: Math.max(0, now() - startedAt) };
  } catch (error) {
    return {
      provider,
      status: classifyProviderError(error),
      results: [],
      durationMs: Math.max(0, now() - startedAt),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildSearchCacheKey(provider, normalizedQuery, version = FEDERATED_SEARCH_CACHE_VERSION) {
  return `${version}:${normalizeSearchQuery(provider)}:${normalizeSearchQuery(normalizedQuery)}`;
}

export async function runCachedProvider({
  provider,
  normalizedQuery,
  cache,
  execute,
  timeoutMs,
  limit,
  ttlMs,
  now = Date.now,
}) {
  const cacheKey = buildSearchCacheKey(provider, normalizedQuery);
  const cached = cache ? await cache.get(cacheKey) : null;
  const expiresAtMs = Date.parse(cached?.expiresAt ?? "");
  if (cached && Number.isFinite(expiresAtMs) && expiresAtMs > now()) {
    return {
      provider,
      status: "cached",
      results: (cached.results ?? []).slice(0, limit).map((item) =>
        normalizeFederatedCandidate(item, provider)
      ).filter(Boolean),
      durationMs: 0,
    };
  }

  const response = await runBoundedProvider({ provider, execute, timeoutMs, limit, now });
  if (cache && ["success", "rate_limit", "unavailable"].includes(response.status)) {
    const fetchedAt = new Date(now()).toISOString();
    await cache.set(cacheKey, {
      cacheVersion: FEDERATED_SEARCH_CACHE_VERSION,
      provider,
      normalizedQuery,
      providerStatus: response.status,
      results: response.results,
      fetchedAt,
      expiresAt: new Date(now() + ttlMs).toISOString(),
    });
  }
  return response;
}

export async function fetchBoundedEanPages({ fetchPage, maxPages = MAX_EAN_SEARCH_PAGES, limit = MAX_EAN_SEARCH_RESULTS }) {
  const results = [];
  for (let page = 0; page < Math.max(0, Math.min(maxPages, MAX_EAN_SEARCH_PAGES)); page += 1) {
    const rows = await fetchPage(page);
    if (!Array.isArray(rows) || rows.length === 0) break;
    results.push(...rows.slice(0, limit - results.length));
    if (results.length >= limit) break;
  }
  return results;
}

function skippedSource(provider, status) {
  return { provider, status, results: [], durationMs: 0 };
}

export async function runFederatedProductSearch({
  normalizedQuery,
  requestId,
  providers,
  cache = null,
  now = Date.now,
  timeouts = {},
  limits = {},
}) {
  const externalAllowed = normalizedQuery.length >= MIN_EXTERNAL_SEARCH_QUERY_LENGTH;
  const run = (provider, execute, external = false) => {
    if (external && !externalAllowed) return Promise.resolve(skippedSource(provider, "skipped_min_length"));
    const options = {
      provider,
      execute,
      timeoutMs: timeouts[provider] ?? 1_500,
      limit: limits[provider] ?? 8,
      now,
    };
    return external
      ? runCachedProvider({ ...options, normalizedQuery, cache, ttlMs: 15 * 60 * 1000 })
      : runBoundedProvider(options);
  };

  const sourceResults = await Promise.all([
    run("master", () => providers.master(normalizedQuery)),
    run("dsld_cache", () => providers.dsldCache(normalizedQuery)),
    run("dsld", () => providers.dsldLive(normalizedQuery), true),
    run("ean_search", () => providers.ean(normalizedQuery), true),
    run("go_upc", () => providers.go(normalizedQuery), true),
  ]);
  const results = dedupeFederatedCandidates(sourceResults.flatMap((source) => source.results));
  return {
    requestId,
    normalizedQuery,
    results,
    sources: Object.fromEntries(sourceResults.map(({ provider, results: rows, ...source }) => [
      provider,
      { ...source, count: rows.length },
    ])),
  };
}

export function sanitizeFederatedDiagnostic(value, secrets = []) {
  let message = value instanceof Error ? value.message : String(value ?? "");
  const secretValues = secrets.map(trimString).filter(Boolean);
  secretValues.forEach((secret) => {
    message = message.split(secret).join("[REDACTED]");
  });
  message = message
    .replace(/([?&](?:token|key|api_key)=)[^&\s]+/giu, "$1[REDACTED]")
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,}]+/giu, "$1[REDACTED]");
  return message.slice(0, 500);
}
