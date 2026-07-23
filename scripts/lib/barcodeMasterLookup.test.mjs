import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadMasterLookup(masterRows) {
  const source = readFileSync(
    new URL("../../src/data/getLocalBarcodeScanProduct.js", import.meta.url),
    "utf8",
  );
  const transformed = source
    .replace(/import\s+[\s\S]*?;\n/gu, "")
    .replace(/export async function /gu, "async function ");
  const calls = [];
  let barcodeCandidates = [];
  const supabase = {
    from(table) {
      calls.push(table);
      if (table !== "supplement_products_master") {
        throw new Error(`Unexpected lookup after master hit: ${table}`);
      }

      return {
        select() {
          return {
            async in(column, values) {
              assert.equal(column, "barcode");
              barcodeCandidates = values;
              return { data: masterRows, error: null };
            },
          };
        },
      };
    },
  };
  const factory = new Function(
    "supabase",
    "logScanTiming",
    "isValidBarcode",
    "normalizeBarcode",
    `${transformed}\nreturn { fetchSupplementProductsMasterScanProduct };`,
  );
  const module = factory(
    supabase,
    () => {},
    (barcode) => /^\d{12,13}$/u.test(barcode),
    (barcode) => String(barcode).trim().replace(/[\s-]/gu, ""),
  );

  return {
    ...module,
    calls,
    getBarcodeCandidates: () => barcodeCandidates,
  };
}

test("UPC-A resolves a master row stored as its leading-zero EAN-13 variant", async () => {
  const lookup = loadMasterLookup([
    {
      product_id: "product-ean13",
      barcode: "0851387008437",
      display_name: "Leading-zero EAN product",
      active_ingredients_json: [{ name: "Magnesium" }],
      verification_status: "verified",
    },
  ]);

  const product = await lookup.fetchSupplementProductsMasterScanProduct(
    "851387008437",
    "upc_a",
  );

  assert.deepEqual(lookup.getBarcodeCandidates(), [
    "851387008437",
    "0851387008437",
  ]);
  assert.deepEqual(lookup.calls, ["supplement_products_master"]);
  assert.equal(product.productId, "product-ean13");
});

test("EAN-13 with a leading zero resolves a master row stored as UPC-A", async () => {
  const lookup = loadMasterLookup([
    {
      product_id: "product-upca",
      barcode: "851387008437",
      display_name: "UPC product",
      active_ingredients_json: [{ name: "Vitamin C" }],
      verification_status: "verified",
    },
  ]);

  const product = await lookup.fetchSupplementProductsMasterScanProduct(
    "0851387008437",
    "ean13",
  );

  assert.deepEqual(lookup.getBarcodeCandidates(), [
    "0851387008437",
    "851387008437",
  ]);
  assert.deepEqual(lookup.calls, ["supplement_products_master"]);
  assert.equal(product.productId, "product-upca");
});
