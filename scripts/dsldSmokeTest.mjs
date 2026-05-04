import {
  DEFAULT_LABEL_CANDIDATE_LIMIT,
  DEFAULT_SEARCH_SIZE,
  DEFAULT_TIMEOUT_MS,
  PROJECT_ROOT,
  flattenIngredientRows,
  formatServingSize,
  loadCasesFromCsv,
  marketStatusFromOffMarket,
  normalizeBarcode,
  parseArgs,
  parsePositiveInteger,
  resolveDsldBestMatch,
  summarizeStatements,
  trimString,
} from "./lib/dsldUtils.mjs";

const DEFAULT_CASES = [
  {
    barcode: "0 47469 07585 9",
    brand: "Natrol",
    productName: "Melatonin 5 mg Strawberry",
  },
  {
    barcode: "7 45287 03015 8",
    brand: "Douglas Laboratories",
    productName: "Amino-Iron",
  },
  {
    barcode: "0 74312 70640 0",
    brand: "Vitamin World",
    productName: "B-2 100 mg",
  },
  {
    barcode: "6 96859 25817 6",
    brand: "MusclePharm",
    productName: "Assault Blue Arctic Raspberry",
  },
];

function printCaseResult(inputCase, result) {
  console.log("=".repeat(80));
  console.log(`input barcode: ${inputCase.barcode}`);
  console.log(`normalized barcode: ${result.normalizedBarcode}`);

  if (!result.best) {
    console.log("matched DSLD ID: not found");
    console.log("product name: not found");
    console.log("brand/company: not found");
    console.log("market status: unknown");
    console.log("serving size: not available");
    console.log("ingredient rows: none");
    console.log("amount per serving: none");
    console.log("units: none");
    console.log("label statements/warnings: none");
    console.log("confidence: low");
    console.log("recommendation: DSLD lookup did not return a usable label.");
    return;
  }

  const label = result.best.label;
  const match = result.best.match;
  const ingredients = flattenIngredientRows(label?.ingredientRows);
  const statements = summarizeStatements(label?.statements);

  console.log(`matched DSLD ID: ${label.id}`);
  console.log(`product name: ${trimString(label.fullName) || "not available"}`);
  console.log(`brand/company: ${trimString(label.brandName) || "not available"}`);
  console.log(`market status: ${marketStatusFromOffMarket(label.offMarket)}`);
  console.log(`serving size: ${formatServingSize(label.servingSizes, label.servingsPerContainer)}`);
  console.log(
    `search path: barcode raw hits=${result.rawBarcodeSearchHits}; barcode usable hits=${result.exactBarcodeSearchHits}; fallback hits=${result.fallbackSearchHits}; fallback=${result.fallbackReason || "not needed"}`
  );
  console.log(`confidence: ${match.confidence} (${match.score})`);
  console.log(`match reasons: ${match.reasons.join(", ") || "none"}`);
  console.log("ingredient rows:");
  if (ingredients.length === 0) {
    console.log("- none");
  } else {
    ingredients.forEach((ingredient) => {
      const indent = "  ".repeat(ingredient.depth);
      const quantity = ingredient.quantity.join(" | ") || "amount not listed";
      const category = ingredient.category ? ` | ${ingredient.category}` : "";
      console.log(`- ${indent}${ingredient.name}${category} | ${quantity}`);
    });
  }

  const primaryQuantities = ingredients
    .filter((ingredient) => ingredient.quantity.length > 0)
    .flatMap((ingredient) =>
      ingredient.quantity.map((quantity) => `${ingredient.name}: ${quantity}`)
    );
  console.log("amount per serving:");
  if (primaryQuantities.length === 0) {
    console.log("- none");
  } else {
    primaryQuantities.forEach((line) => console.log(`- ${line}`));
  }

  const units = Array.from(
    new Set(
      ingredients
        .flatMap((ingredient) => ingredient.quantity)
        .map((quantity) => quantity.match(/\b(mg|mcg|g|IU|Calorie\(s\)|Gram\(s\))\b/i)?.[0])
        .filter(Boolean)
    )
  );
  console.log(`units: ${units.join(", ") || "none"}`);
  console.log("label statements/warnings:");
  if (statements.length === 0) {
    console.log("- none");
  } else {
    statements.forEach((statement) => {
      console.log(`- ${statement.type}: ${statement.notes.replace(/\s+/g, " ").trim()}`);
    });
  }

  const recommendation =
    match.confidence === "high"
      ? "DSLD returned a strong label match with structured data that is usable for a future cache layer."
      : match.confidence === "medium"
        ? "DSLD returned a plausible label match, but this case should be reviewed before relying on automated caching."
        : "DSLD returned weak evidence for this product; do not rely on automated caching for this case.";
  console.log(`recommendation: ${recommendation}`);
}

function printSummary(results) {
  const matched = results.filter((result) => result.best);
  const exactBarcodeConfirmed = matched.filter(
    (result) =>
      normalizeBarcode(result.best?.label?.upcSku) === result.normalizedBarcode
  ).length;
  const highConfidence = matched.filter(
    (result) => result.best?.match?.confidence === "high"
  ).length;
  const ingredientComplete = matched.filter(
    (result) => flattenIngredientRows(result.best?.label?.ingredientRows).length > 0
  ).length;

  console.log("=".repeat(80));
  console.log("summary:");
  console.log(`- total test cases: ${results.length}`);
  console.log(`- labels resolved: ${matched.length}`);
  console.log(`- exact barcode confirmed in label details: ${exactBarcodeConfirmed}`);
  console.log(`- high-confidence matches: ${highConfidence}`);
  console.log(`- labels with ingredient rows: ${ingredientComplete}`);

  const shouldRecommendCacheLayer =
    results.length > 0 &&
    exactBarcodeConfirmed / results.length >= 0.75 &&
    ingredientComplete / results.length >= 0.75;

  console.log(
    `recommendation: ${
      shouldRecommendCacheLayer
        ? "API response quality looks good enough for a future US-focused cache layer, but barcode search should still be treated as a fallback-plus-ranking workflow."
        : "API response quality is not yet strong enough for a future cache layer without more validation or a stronger lookup strategy."
    }`
  );
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const cases = flags.csv ? loadCasesFromCsv(flags.csv) : DEFAULT_CASES;
  const timeoutMs = parsePositiveInteger(flags.timeoutMs, DEFAULT_TIMEOUT_MS);
  const searchSize = parsePositiveInteger(flags.searchSize, DEFAULT_SEARCH_SIZE);
  const labelCandidateLimit = parsePositiveInteger(
    flags.labelCandidateLimit,
    DEFAULT_LABEL_CANDIDATE_LIMIT
  );

  console.log("DSLD smoke test");
  console.log(`- project root: ${PROJECT_ROOT}`);
  console.log(`- cases: ${cases.length}`);
  console.log(`- timeoutMs: ${timeoutMs}`);
  console.log(`- searchSize: ${searchSize}`);
  console.log(`- labelCandidateLimit: ${labelCandidateLimit}`);

  const results = [];
  for (const inputCase of cases) {
    const result = await resolveDsldBestMatch(inputCase, {
      timeoutMs,
      searchSize,
      labelCandidateLimit,
    });
    results.push(result);
    printCaseResult(inputCase, result);
  }

  printSummary(results);
}

main().catch((error) => {
  console.error("DSLD smoke test failed.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
