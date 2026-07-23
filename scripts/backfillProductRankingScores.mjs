import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import {
  buildProductScoreBackfillCheckpoint,
  buildProductScoreBackfillPageQuery,
  parseProductScoreBackfillArgs,
} from "./lib/productScoreBackfillPolicy.mjs";

const flags = parseProductScoreBackfillArgs(process.argv.slice(2));
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey =
  process.env.INTERNAL_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the bounded backfill.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function readCheckpoint(path) {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function saveCheckpoint(path, value) {
  if (!path) return;
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchPage(cursor) {
  const page = buildProductScoreBackfillPageQuery({
    cursor,
    batchLimit: flags.batchLimit,
  });
  let query = supabase
    .from("supplement_products_master")
    .select("product_id")
    .order("product_id", { ascending: true })
    .limit(page.limit);
  if (page.afterProductId) query = query.gt("product_id", page.afterProductId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to page canonical products: ${error.message}`);
  return data ?? [];
}

const checkpoint = await readCheckpoint(flags.checkpoint);
if (
  checkpoint?.calculationVersion &&
  checkpoint.calculationVersion !== flags.calculationVersion
) {
  throw new Error(
    "Checkpoint calculation version differs from --calculation-version.",
  );
}

let cursor = flags.cursor || checkpoint?.cursor || null;
let processed = Number(checkpoint?.processed) || 0;
let computed = Number(checkpoint?.computed) || 0;
let written = Number(checkpoint?.written) || 0;
let failed = Number(checkpoint?.failed) || 0;
let batchCount = 0;
let complete = false;

console.log(
  `[product-score-backfill] mode=${flags.write ? "WRITE" : "DRY_RUN"} batchLimit=${flags.batchLimit} calculationVersion=${flags.calculationVersion}`,
);

while (batchCount < flags.maxBatches) {
  const rows = await fetchPage(cursor);
  if (!rows.length) {
    complete = true;
    break;
  }

  const productIds = rows.map((row) => row.product_id).filter(Boolean);
  const { data, error } = await supabase.functions.invoke(
    "refresh-product-scores",
    {
      body: {
        productIds,
        limit: flags.batchLimit,
        calculationVersion: flags.calculationVersion,
        write: flags.write,
      },
    },
  );
  if (error) {
    throw new Error(`Bounded score worker invocation failed: ${error.message}`);
  }

  batchCount += 1;
  processed += productIds.length;
  computed += Number(data?.computed) || 0;
  written += Number(data?.written) || 0;
  failed += Number(data?.failed) || 0;
  cursor = productIds.at(-1) || cursor;
  await saveCheckpoint(
    flags.checkpoint,
    buildProductScoreBackfillCheckpoint({
      cursor,
      calculationVersion: flags.calculationVersion,
      processed,
      computed,
      written,
      failed,
      complete: false,
    }),
  );
  console.log(
    `[product-score-backfill] batches=${batchCount} processed=${processed} computed=${computed} written=${written} failed=${failed}`,
  );

  if (rows.length < flags.batchLimit) {
    complete = true;
    break;
  }
}

await saveCheckpoint(
  flags.checkpoint,
  buildProductScoreBackfillCheckpoint({
    cursor,
    calculationVersion: flags.calculationVersion,
    processed,
    computed,
    written,
    failed,
    complete,
  }),
);
console.log(
  `[product-score-backfill] complete=${complete} processed=${processed} computed=${computed} written=${written} failed=${failed}`,
);
