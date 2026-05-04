import {
  cacheDsldLabelResult,
  createAdminClient,
  flattenIngredientRows,
  formatServingSize,
  loadDotEnv,
  logDsldLookupFailure,
  marketStatusFromOffMarket,
  parseArgs,
  resolveDsldBestMatch,
  summarizeStatements,
  trimString,
} from "./lib/dsldUtils.mjs";

function buildInputCase(flags) {
  const barcode = trimString(flags.barcode);
  const brand = trimString(flags.brand);
  const productName = trimString(flags.productName ?? flags.product_name);

  if (!barcode) {
    throw new Error("Missing required --barcode.");
  }

  if (!brand && !productName) {
    throw new Error("Provide --brand, --productName, or both for ranked DSLD fallback.");
  }

  return {
    barcode,
    brand,
    productName,
  };
}

function printCachedResult(inputCase, result, cached) {
  const label = result.best?.label;
  const ingredients = flattenIngredientRows(label?.ingredientRows);
  const statements = summarizeStatements(label?.statements);

  console.log("DSLD cache test");
  console.log(`- input barcode: ${inputCase.barcode}`);
  console.log(`- normalized barcode: ${result.normalizedBarcode}`);
  console.log(`- matched dsld id: ${label?.id ?? "not found"}`);
  console.log(`- product name: ${trimString(label?.fullName) || "not found"}`);
  console.log(`- brand/company: ${trimString(label?.brandName) || "not found"}`);
  console.log(`- market status: ${marketStatusFromOffMarket(label?.offMarket)}`);
  console.log(
    `- serving size: ${formatServingSize(label?.servingSizes, label?.servingsPerContainer)}`
  );
  console.log(`- confidence: ${result.best?.match?.confidence ?? "low"}`);
  console.log(`- match reasons: ${(result.best?.match?.reasons ?? []).join(", ") || "none"}`);
  console.log(
    `- cache rows: product=1 ingredients=${cached.ingredients.length} statements=${cached.statements.length} lookup_attempt=1`
  );
  console.log("ingredients:");
  if (ingredients.length === 0) {
    console.log("- none");
  } else {
    ingredients.forEach((ingredient) => {
      const quantity = ingredient.quantity.join(" | ") || "amount not listed";
      console.log(`- ${ingredient.name} | ${quantity}`);
    });
  }
  console.log("statements:");
  if (statements.length === 0) {
    console.log("- none");
  } else {
    statements.slice(0, 10).forEach((statement) => {
      console.log(`- ${statement.type}: ${statement.notes.replace(/\s+/g, " ").trim()}`);
    });
    if (statements.length > 10) {
      console.log(`- ... ${statements.length - 10} more`);
    }
  }
}

async function main() {
  loadDotEnv();
  const flags = parseArgs(process.argv.slice(2));
  const inputCase = buildInputCase(flags);
  const timeoutMs = flags.timeoutMs;
  const searchSize = flags.searchSize;
  const labelCandidateLimit = flags.labelCandidateLimit;
  const supabase = createAdminClient();

  let result = null;
  try {
    result = await resolveDsldBestMatch(inputCase, {
      timeoutMs,
      searchSize,
      labelCandidateLimit,
    });

    if (!result.best?.label?.id) {
      throw new Error("No DSLD match found.");
    }

    const cached = await cacheDsldLabelResult({
      supabase,
      inputCase,
      result,
    });

    printCachedResult(inputCase, result, cached);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await logDsldLookupFailure({
        supabase,
        inputCase,
        result,
        errorMessage: message,
      });
    } catch (lookupError) {
      console.error(
        lookupError instanceof Error ? lookupError.message : String(lookupError)
      );
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("DSLD cache test failed.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
