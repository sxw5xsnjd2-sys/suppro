import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const policySource = readFileSync(
  new URL(
    "../../supabase/functions/_shared/federated-product-search-policy.js",
    import.meta.url
  ),
  "utf8"
)
const policy = await import(
  `data:text/javascript;base64,${Buffer.from(policySource).toString("base64")}`
)

function candidate(provider, stableId, overrides = {}) {
  return {
    provider,
    providerStableId: stableId,
    name: `${provider} product`,
    verificationStatus: "unverified",
    ...overrides,
  }
}

function allProviders(overrides = {}) {
  return {
    master: async () => ({ results: [] }),
    dsldCache: async () => ({ results: [] }),
    dsldLive: async () => ({ results: [] }),
    ean: async () => ({ results: [] }),
    go: async () => ({ status: "config_blocked", results: [] }),
    ...overrides,
  }
}

test("query normalization preserves punctuation while normalizing Unicode, case, and spaces", () => {
  assert.equal(policy.normalizeSearchQuery("  VITAMIN\u00a0D3 + K2  "), "vitamin d3 + k2")
  assert.equal(policy.normalizeSearchQuery("CoQ-10"), "coq-10")
})

test("request validation enforces two normalized characters and echoes caller request id", () => {
  assert.equal(
    policy.validateFederatedSearchRequest(JSON.stringify({ query: " x " })).body.code,
    "query_too_short"
  )
  assert.deepEqual(
    policy.validateFederatedSearchRequest(
      JSON.stringify({ query: "  Zinc  ", requestId: "request-7" })
    ).value,
    { normalizedQuery: "zinc", requestId: "request-7" }
  )
  assert.equal(policy.validateFederatedSearchRequest("not-json").status, 400)
})

test("two-character search runs local providers and marks every external source skipped", async () => {
  let externalCalls = 0
  const response = await policy.runFederatedProductSearch({
    normalizedQuery: "d3",
    requestId: "short",
    providers: allProviders({
      master: async () => ({ results: [candidate("master", "m1")] }),
      dsldLive: async () => {
        externalCalls += 1
        return { results: [] }
      },
      ean: async () => {
        externalCalls += 1
        return { results: [] }
      },
      go: async () => {
        externalCalls += 1
        return { results: [] }
      },
    }),
  })

  assert.equal(externalCalls, 0)
  assert.equal(response.results.length, 1)
  assert.equal(response.sources.dsld.status, "skipped_min_length")
  assert.equal(response.sources.ean_search.status, "skipped_min_length")
  assert.equal(response.sources.go_upc.status, "skipped_min_length")
})

test("providers start in parallel and partial success survives timeout and rate limit", async () => {
  const entered = []
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const record = (name, result) => async () => {
    entered.push(name)
    await gate
    return result
  }
  const timeout = async () => {
    entered.push("dsld")
    await new Promise(() => {})
  }
  const rateLimited = async () => {
    entered.push("ean")
    const error = new Error("rate")
    error.status = 429
    throw error
  }

  const responsePromise = policy.runFederatedProductSearch({
    normalizedQuery: "magnesium",
    requestId: "parallel",
    providers: allProviders({
      master: record("master", { results: [candidate("master", "m1")] }),
      dsldCache: record("cache", { results: [] }),
      dsldLive: timeout,
      ean: rateLimited,
      go: record("go", { status: "config_blocked", results: [] }),
    }),
    timeouts: { master: 100, dsld_cache: 100, dsld: 15, ean_search: 100, go_upc: 100 },
  })
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(new Set(entered), new Set(["master", "cache", "dsld", "ean", "go"]))
  release()
  const response = await responsePromise

  assert.equal(response.results[0].canonicalProductId, "m1")
  assert.equal(response.sources.dsld.status, "timeout")
  assert.equal(response.sources.ean_search.status, "rate_limit")
  assert.equal(response.sources.go_upc.status, "config_blocked")
})

test("external cache supports miss, hit, and expiry with versioned keys", async () => {
  const rows = new Map()
  const cache = {
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => rows.set(key, value),
  }
  let calls = 0
  let now = Date.parse("2026-01-01T00:00:00.000Z")
  const execute = async () => {
    calls += 1
    return { results: [candidate("ean_search", "123", { barcode: "12345678" })] }
  }
  const args = {
    provider: "ean_search",
    normalizedQuery: "zinc",
    cache,
    execute,
    timeoutMs: 100,
    limit: 5,
    ttlMs: 1_000,
    now: () => now,
  }

  assert.equal((await policy.runCachedProvider(args)).status, "success")
  assert.equal(calls, 1)
  assert.equal((await policy.runCachedProvider(args)).status, "cached")
  assert.equal(calls, 1)
  now += 1_001
  assert.equal((await policy.runCachedProvider(args)).status, "success")
  assert.equal(calls, 2)
  assert.match([...rows.keys()][0], /^federated-product-search\.v1:/)
})

test("EAN pagination never exceeds the page and result bounds", async () => {
  const pages = []
  const results = await policy.fetchBoundedEanPages({
    maxPages: 99,
    limit: 12,
    fetchPage: async (page) => {
      pages.push(page)
      return Array.from({ length: 10 }, (_, index) => ({ page, index }))
    },
  })
  assert.deepEqual(pages, [0, 1])
  assert.equal(results.length, 12)
})

test("dedupe follows barcode, canonical id, provider id, then conservative brand and name", () => {
  const deduped = policy.dedupeFederatedCandidates([
    candidate("ean_search", "ean-a", { name: "Magnesium 200", brand: "Acme", barcode: "123-456" }),
    candidate("dsld", "dsld-a", { name: "Different", brand: "Other", barcode: "123456" }),
    candidate("ean_search", "ean-b", { name: "Zinc", brand: "Acme", canonicalProductId: "p-1" }),
    candidate("master", "p-1", {
      name: "Canonical Zinc",
      canonicalProductId: "p-1",
      navigationDescriptor: { type: "canonical_product", productId: "p-1" },
    }),
    candidate("dsld", "same-provider-id", { name: "Iron A", brand: "Maker" }),
    candidate("dsld", "same-provider-id", { name: "Iron B", brand: "Maker" }),
    candidate("ean_search", "ean-c", { name: "Omega 3", brand: "Exact" }),
    candidate("dsld", "dsld-c", { name: "omega 3", brand: "exact" }),
  ])
  assert.equal(deduped.length, 4)
  assert.equal(deduped.find((row) => row.canonicalProductId === "p-1").provider, "master")
  assert.equal(deduped.find((row) => row.canonicalProductId === "p-1").name, "Canonical Zinc")
  assert.equal(deduped[0].sources.length, 2)
})

test("generic names do not merge without stronger identity", () => {
  const rows = policy.dedupeFederatedCandidates([
    candidate("ean_search", "1", { name: "Supplement", brand: "Acme" }),
    candidate("dsld", "2", { name: "supplement", brand: "acme" }),
  ])
  assert.equal(rows.length, 2)
})

test("master identity and evidence win while provenance sources are retained", () => {
  const external = candidate("dsld", "42", {
    name: "Long external product name",
    brand: "Brand",
    barcode: "0123456789012",
  })
  const master = candidate("master", "product-id", {
    canonicalProductId: "product-id",
    name: "Master name",
    barcode: "0123456789012",
    navigationDescriptor: { type: "canonical_product", productId: "product-id" },
    evidenceSnapshot: {
      score: 72.5,
      calculatedAt: "2026-01-01T00:00:00.000Z",
      calculationVersion: "recommended-dose-product-evidence.v1",
    },
  })
  const [merged] = policy.dedupeFederatedCandidates([external, master])
  assert.equal(merged.provider, "master")
  assert.equal(merged.canonicalProductId, "product-id")
  assert.equal(merged.evidenceSnapshot.score, 72.5)
  assert.deepEqual(
    new Set(merged.sources.map((source) => source.provider)),
    new Set(["dsld", "master"])
  )
})

test("unresolved candidates have unknown evidence instead of zero", () => {
  const row = policy.normalizeFederatedCandidate(candidate("ean_search", "1"))
  assert.equal(row.evidenceSnapshot, null)
})

test("master evidence hydration preserves dose confidence metadata", () => {
  const providerSource = readFileSync(
    new URL(
      "../../supabase/functions/_shared/federated-product-providers.ts",
      import.meta.url
    ),
    "utf8"
  )

  assert.match(
    providerSource,
    /amount_basis, dose_confidence, dose_review_reason/
  )
  assert.match(
    providerSource,
    /doseConfidence: trimString\(row\?\.dose_confidence\) \|\| null/
  )
  assert.match(
    providerSource,
    /doseReviewReason: trimString\(row\?\.dose_review_reason\) \|\| null/
  )
})

test("typeahead adapter uses DSLD search-filter without a label fetch and Go keyword remains blocked", () => {
  const providerSource = readFileSync(
    new URL(
      "../../supabase/functions/_shared/federated-product-providers.ts",
      import.meta.url
    ),
    "utf8"
  )
  const dsldSearchBody = providerSource.slice(
    providerSource.indexOf("async dsldLive"),
    providerSource.indexOf("async ean")
  )
  const goSearchBody = providerSource.slice(
    providerSource.indexOf("async go()"),
    providerSource.indexOf("function formatDsldServingSize")
  )
  assert.match(dsldSearchBody, /search-filter/)
  assert.doesNotMatch(dsldSearchBody, /\/label\//)
  assert.match(goSearchBody, /config_blocked/)
})

test("diagnostics redact configured secrets, auth values, and token query values", () => {
  const secret = "provider-secret-123"
  const output = policy.sanitizeFederatedDiagnostic(
    `GET https://example.test?q=x&token=${secret} Authorization: Bearer ${secret}`,
    [secret]
  )
  assert.doesNotMatch(output, /provider-secret-123/)
  assert.match(output, /\[REDACTED\]/)
})

test("resolution validation rejects invalid identities and barcodes", () => {
  const missingIdentity = policy.validateResolveProductRequest(
    JSON.stringify({ candidate: { provider: "ean_search", name: "Zinc" } })
  )
  assert.equal(missingIdentity.status, 400)
  const invalidBarcode = policy.validateResolveProductRequest(
    JSON.stringify({
      candidate: {
        provider: "ean_search",
        providerStableId: "x",
        name: "Zinc",
        barcode: "not-a-barcode",
      },
    })
  )
  assert.equal(invalidBarcode.body.code, "invalid_barcode")
})

test("proposed cache and provenance tables are server-only and use the UUID product key", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/202607220001_add_federated_product_search_tables.sql",
      import.meta.url
    ),
    "utf8"
  )
  assert.match(migration, /cache_version text not null/)
  assert.match(migration, /fetched_at timestamptz not null/)
  assert.match(migration, /expires_at timestamptz not null/)
  assert.match(
    migration,
    /canonical_product_id uuid references public\.off_products\(id\)/
  )
  assert.match(
    migration,
    /alter table public\.supplement_product_search_cache enable row level security/
  )
  assert.match(
    migration,
    /revoke all on table public\.supplement_product_source_links from anon, authenticated/
  )
  assert.doesNotMatch(migration, /create policy/i)
})
