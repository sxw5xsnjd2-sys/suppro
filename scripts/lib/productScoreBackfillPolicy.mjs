export const DEFAULT_PRODUCT_SCORE_CALCULATION_VERSION =
  "recommended-dose-product-ranking.v1";
export const MAX_PRODUCT_SCORE_BACKFILL_BATCH = 25;

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseProductScoreBackfillArgs(argv) {
  const values = Array.isArray(argv) ? argv : [];
  const readValue = (name) => {
    const inline = values.find((value) => value.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = values.indexOf(`--${name}`);
    return index >= 0 ? values[index + 1] : undefined;
  };
  const parsePositiveInteger = (name, fallback, maximum = Infinity) => {
    const raw = readValue(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
      throw new Error(`--${name} must be between 1 and ${maximum}.`);
    }
    return parsed;
  };
  const calculationVersion =
    trimString(readValue("calculation-version")) ||
    DEFAULT_PRODUCT_SCORE_CALCULATION_VERSION;
  if (calculationVersion.length > 120) {
    throw new Error("--calculation-version must not exceed 120 characters.");
  }

  return {
    write: values.includes("--write"),
    cursor: trimString(readValue("cursor")) || null,
    checkpoint: trimString(readValue("checkpoint")) || null,
    batchLimit: parsePositiveInteger(
      "batch-limit",
      MAX_PRODUCT_SCORE_BACKFILL_BATCH,
      MAX_PRODUCT_SCORE_BACKFILL_BATCH,
    ),
    maxBatches: parsePositiveInteger("max-batches", Infinity),
    calculationVersion,
  };
}

export function buildProductScoreBackfillPageQuery({ cursor, batchLimit }) {
  return {
    afterProductId: trimString(cursor) || null,
    limit: Math.min(
      MAX_PRODUCT_SCORE_BACKFILL_BATCH,
      Math.max(1, Math.floor(batchLimit)),
    ),
  };
}

export function buildProductScoreBackfillCheckpoint({
  cursor,
  calculationVersion,
  processed,
  computed,
  written,
  failed,
  complete,
}) {
  return {
    cursor: trimString(cursor) || null,
    calculationVersion: trimString(calculationVersion),
    processed: Number(processed) || 0,
    computed: Number(computed) || 0,
    written: Number(written) || 0,
    failed: Number(failed) || 0,
    complete: complete === true,
    updatedAt: new Date().toISOString(),
  };
}
