import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function createQueryResult(data) {
  return {
    select() {
      return this;
    },
    in() {
      return this;
    },
    order() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
}

function loadCatalogModule() {
  const source = readFileSync(
    new URL("../../src/data/getIngredientMatchCatalog.js", import.meta.url),
    "utf8",
  );
  const transformed = source
    .replace(/import\s+[\s\S]*?;\n/gu, "")
    .replace(/export async function /gu, "async function ");
  const tableCalls = [];
  const supabase = {
    from(table) {
      tableCalls.push(table);
      if (table === "supplements") {
        return createQueryResult([
          { id: "magnesium", name: "Magnesium", status: "approved" },
        ]);
      }
      if (table === "supplement_aliases") {
        return createQueryResult([
          {
            supplement_id: "magnesium",
            alias: "Magnesium Citrate",
            alias_normalized: "magnesium citrate",
          },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const factory = new Function(
    "CATALOG_TYPES",
    "supabase",
    `${transformed}\nreturn { fetchIngredientMatchCatalog };`,
  );

  return {
    ...factory({ ACTIVE_INGREDIENT: "active_ingredient" }, supabase),
    tableCalls,
  };
}

test("ingredient catalog download is reused for subsequent scans", async () => {
  const { fetchIngredientMatchCatalog, tableCalls } = loadCatalogModule();

  const firstRows = await fetchIngredientMatchCatalog();
  const secondRows = await fetchIngredientMatchCatalog();

  assert.equal(firstRows, secondRows);
  assert.deepEqual(tableCalls, ["supplements", "supplement_aliases"]);
  assert.deepEqual(
    firstRows.map((row) => [row.catalogName, row.canonicalName]),
    [
      ["Magnesium Citrate", "Magnesium"],
      ["Magnesium", "Magnesium"],
    ],
  );
});
