import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadIngredientMatchingHelpers() {
  const source = readFileSync(
    new URL("../../features/scanner/ingredientMatching.js", import.meta.url),
    "utf8",
  );
  const transformed = source.replace(/^export function /gm, "function ");

  return new Function(
    `${transformed}
return { classifyIngredientText, extractIngredientCandidatesFromList, matchIngredientsToCatalog };`,
  )();
}

test("exact water is inactive and never matches watermelon extract", () => {
  const {
    classifyIngredientText,
    extractIngredientCandidatesFromList,
    matchIngredientsToCatalog,
  } =
    loadIngredientMatchingHelpers();

  assert.equal(classifyIngredientText("water"), "inactive");

  const result = matchIngredientsToCatalog(
    extractIngredientCandidatesFromList(["water"]),
    [
      {
        catalogId: "watermelon-extract",
        catalogName: "Watermelon Extract",
        verified: true,
        sourceTable: "supplement_ingredients",
      },
    ],
  );

  assert.deepEqual(result.matchedIngredients, []);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.unmatchedIngredients, []);
});

test("watermelon extract is still allowed when explicitly extracted", () => {
  const {
    classifyIngredientText,
    extractIngredientCandidatesFromList,
    matchIngredientsToCatalog,
  } =
    loadIngredientMatchingHelpers();

  assert.equal(classifyIngredientText("watermelon extract"), "active");

  const result = matchIngredientsToCatalog(
    extractIngredientCandidatesFromList(["watermelon extract"]),
    [
      {
        catalogId: "watermelon-extract",
        catalogName: "Watermelon Extract",
        verified: true,
        sourceTable: "supplement_ingredients",
      },
    ],
  );

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].catalogName, "Watermelon Extract");
  assert.equal(result.matches[0].matchType, "exact");
});
