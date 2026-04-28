import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadMatchModule() {
  const source = readFileSync(
    new URL("../../src/data/matchSupplementCatalog.js", import.meta.url),
    "utf8"
  );
  const transformed = source
    .replace(/import\s+\{ searchSupplementCatalog \}[\s\S]*?;\n\n/, "")
    .replace(/export function /g, "function ")
    .replace(/export async function /g, "async function ");
  const factory = new Function(
    "searchSupplementCatalog",
    `${transformed}\nreturn { normalizeCatalogMatchText, scoreSupplementCatalogCandidate, selectSupplementCatalogMatch, matchSupplementCatalogName };`
  );

  return factory(async () => []);
}

const {
  normalizeCatalogMatchText,
  scoreSupplementCatalogCandidate,
  selectSupplementCatalogMatch,
} = loadMatchModule();

test("normalizes catalog match text", () => {
  assert.equal(
    normalizeCatalogMatchText("  Omega-3 & Vitamin D3 "),
    "omega 3 and vitamin d3"
  );
});

test("scores exact matches highest", () => {
  assert.equal(scoreSupplementCatalogCandidate("Vitamin D3", "Vitamin D3"), 1);
});

test("scores normalized token matches above threshold", () => {
  const score = scoreSupplementCatalogCandidate(
    "Mag glycinate",
    "Magnesium Glycinate"
  );

  assert.ok(score >= 0.62);
});

test("scores unrelated names below threshold", () => {
  const score = scoreSupplementCatalogCandidate("Creatine", "Vitamin C");

  assert.ok(score < 0.62);
});

test("selects active ingredient for simple raw ingredient entries", () => {
  const match = selectSupplementCatalogMatch("Creatine", [
    {
      id: "product-creatine",
      name: "Creatine",
      catalogType: "supplement_product",
    },
    {
      id: "creatine",
      name: "Creatine",
      catalogType: "active_ingredient",
    },
  ]);

  assert.equal(match.id, "creatine");
  assert.equal(match.catalogType, "active_ingredient");
});

test("selects supplement product for detailed branded entries", () => {
  const match = selectSupplementCatalogMatch("Myprotein Creatine", [
    {
      id: "creatine",
      name: "Creatine",
      catalogType: "active_ingredient",
    },
    {
      id: "product-myprotein-creatine",
      name: "Myprotein Creatine Monohydrate",
      catalogType: "supplement_product",
    },
  ]);

  assert.equal(match.id, "product-myprotein-creatine");
  assert.equal(match.catalogType, "supplement_product");
});
