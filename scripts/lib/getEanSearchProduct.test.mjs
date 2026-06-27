import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadEanSearchProductModule({
  eanSearchToken = "ean-token",
  fetchImpl = async () => {
    throw new Error("fetch should be provided by the test");
  },
  logBuildAwareDiagnostic = () => {},
  isValidBarcode = () => true,
  normalizeBarcode = (value) => value,
} = {}) {
  const source = readFileSync(
    new URL("../../src/data/getEanSearchProduct.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";\n/g, "")
    .replace("export async function fetchEanSearchProduct", "async function fetchEanSearchProduct");

  const factory = new Function(
    "EAN_SEARCH_TOKEN",
    "logBuildAwareDiagnostic",
    "isValidBarcode",
    "normalizeBarcode",
    "fetch",
    `${transformed}
return { fetchEanSearchProduct };`
  );

  return factory(
    eanSearchToken,
    logBuildAwareDiagnostic,
    isValidBarcode,
    normalizeBarcode,
    fetchImpl
  );
}

test("EAN-Search lookup skips fetch when token is missing", async () => {
  const diagnostics = [];
  const { fetchEanSearchProduct } = loadEanSearchProductModule({
    eanSearchToken: "",
    fetchImpl: async () => {
      throw new Error("fetch should not be called without a token");
    },
    logBuildAwareDiagnostic: (level, message, details) => {
      diagnostics.push({ level, message, details });
    },
  });

  const result = await fetchEanSearchProduct("0123456789012", "ean13");

  assert.equal(result, null);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].level, "warn");
  assert.match(diagnostics[0].message, /EAN-Search lookup skipped/);
});

test("EAN-Search lookup maps product metadata and image fields", async () => {
  let requestedUrl = null;
  const { fetchEanSearchProduct } = loadEanSearchProductModule({
    eanSearchToken: "test-token",
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            ean: "0123456789012",
            name: "EAN Vitamin D3 Gummies",
            categoryId: "123",
            categoryName: "Vitamins",
            googleCategoryId: "456",
            issuingCountry: "GB",
            image: "https://cdn.example.com/ean-vitamin-d.png",
          },
        ],
      };
    },
  });

  const result = await fetchEanSearchProduct("0123456789012", "ean13");

  assert.equal(requestedUrl.origin, "https://api.ean-search.org");
  assert.equal(requestedUrl.searchParams.get("op"), "barcode-lookup");
  assert.equal(requestedUrl.searchParams.get("format"), "json");
  assert.equal(requestedUrl.searchParams.get("token"), "test-token");
  assert.equal(requestedUrl.searchParams.get("ean"), "0123456789012");
  assert.equal(result.productName, "EAN Vitamin D3 Gummies");
  assert.equal(result.categoryName, "Vitamins");
  assert.equal(result.issuingCountry, "GB");
  assert.equal(result.imageUrl, "https://cdn.example.com/ean-vitamin-d.png");
  assert.equal(result.imageProvider, "ean_search");
  assert.equal(result.scanDataSource, "ean_search");
  assert.equal(result.verificationStatus, "ean_search_unverified");
});
