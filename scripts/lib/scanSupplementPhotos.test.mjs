import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadEdgeFunctionErrorsModule() {
  const source = readFileSync(
    new URL("../../src/lib/edgeFunctionErrors.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    `${transformed}
return {
  normalizeEdgeFunctionError,
};`
  );

  return factory();
}

function createFailure({
  category,
  code = null,
  message = "",
  status = null,
  retryAfterSeconds = null,
  isQuotaLimited = false,
}) {
  const error = new Error(message || code || category || "scanner failure");
  error.category = category;
  error.code = code;
  error.status = status;
  error.retryAfterSeconds = retryAfterSeconds;
  error.isQuotaLimited = isQuotaLimited;
  return error;
}

function loadScanSupplementPhotosModule(overrides = {}) {
  const source = readFileSync(
    new URL("../../src/data/scanSupplementPhotos.js", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(
      /import\s+\{\s*getAccessTokenOrCreateSession\s*\}\s+from\s+"@src\/lib\/supabase";\n/,
      ""
    )
    .replace(
      /import\s+\{\s*normalizeEdgeFunctionError\s*\}\s+from\s+"@src\/lib\/edgeFunctionErrors";\n/,
      ""
    )
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"@src\/lib\/scannerFailure";\n/,
      ""
    )
    .replace(
      /import\s+\{[\s\S]*?\}\s+from\s+"@src\/lib\/runtimeConfig";\n/,
      ""
    )
    .replace(
      /import\s+\{\s*getLatencyTraceHeaders\s*\}\s+from\s+"@src\/lib\/latencyTelemetry";\n/,
      ""
    )
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");

  const factory = new Function(
    "getAccessTokenOrCreateSession",
    "normalizeEdgeFunctionError",
    "createScannerFailure",
    "SCANNER_FAILURE_CATEGORIES",
    "logBuildAwareDiagnostic",
    "SUPABASE_URL",
    "getLatencyTraceHeaders",
    "fetch",
    `${transformed}
return {
  normalizePhotoRescueResponseShape,
  normalizePhotoRescueIngredient,
  scanSupplementPhotos,
};`
  );

  return factory(
    overrides.getAccessTokenOrCreateSession ?? (async () => ""),
    overrides.normalizeEdgeFunctionError ??
      loadEdgeFunctionErrorsModule().normalizeEdgeFunctionError,
    overrides.createScannerFailure ?? createFailure,
    overrides.SCANNER_FAILURE_CATEGORIES ?? {
      networkError: "network_error",
      authSessionRequired: "auth_session_required",
      backendValidationFailure: "backend_validation_failure",
    },
    overrides.logBuildAwareDiagnostic ?? (() => {}),
    overrides.SUPABASE_URL ?? "https://example.supabase.co",
    overrides.getLatencyTraceHeaders ?? (() => ({})),
    overrides.fetch ??
      (async () => ({
        ok: true,
        json: async () => ({}),
      }))
  );
}

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`Could not find ${functionName} in source`);
  }

  const bodyStart = source.indexOf("{", start);
  if (bodyStart === -1) {
    throw new Error(`Could not find ${functionName} body start`);
  }

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not find ${functionName} body end`);
}

function loadScanSupplementPhotosEdgeHelpers() {
  const source = readFileSync(
    new URL("../../supabase/functions/scan-supplement-photos/index.ts", import.meta.url),
    "utf8"
  );

  const transformed = [
    extractFunctionSource(source, "trimString").replace(
      /function trimString\(value: unknown\): string \{/,
      "function trimString(value) {"
    ),
    extractFunctionSource(source, "normalizeWhitespace").replace(
      /function normalizeWhitespace\(value: unknown\): string \{/,
      "function normalizeWhitespace(value) {"
    ),
    extractFunctionSource(source, "normalizeTextKey").replace(
      /function normalizeTextKey\(value: unknown\): string \{/,
      "function normalizeTextKey(value) {"
    ),
    extractFunctionSource(source, "appendUniqueEvidenceRows").replace(
      /function appendUniqueEvidenceRows\(value: unknown, rows: string\[\]\): string \{/,
      "function appendUniqueEvidenceRows(value, rows) {"
    ).replace(/new Set<string>\(\)/, "new Set()"),
    extractFunctionSource(source, "parseIntegerLike").replace(
      /function parseIntegerLike\(value: unknown\): number \| null \{/,
      "function parseIntegerLike(value) {"
    ),
    extractFunctionSource(source, "extractBase64PayloadFromDataUrl").replace(
      /function extractBase64PayloadFromDataUrl\(value: unknown\): string \{/,
      "function extractBase64PayloadFromDataUrl(value) {"
    ),
    extractFunctionSource(source, "parseOptionalNumber").replace(
      /function parseOptionalNumber\(value: unknown\): number \| null \{/,
      "function parseOptionalNumber(value) {"
    ),
    extractFunctionSource(source, "roundTo").replace(
      /function roundTo\(value: number, places: number\)/,
      "function roundTo(value, places)"
    ),
    extractFunctionSource(source, "normalizeUnit").replace(
      /function normalizeUnit\(value: unknown\)/,
      "function normalizeUnit(value)"
    ),
    source
      .slice(
        source.indexOf("function normalizeDosage"),
        source.indexOf("function stringifyDosage")
      )
      .replace(
      /function normalizeDosage\(\{\s*dosageValue,\s*dosageUnit,\s*dosageOriginalText,\s*\}: \{\s*dosageValue: unknown;\s*dosageUnit: unknown;\s*dosageOriginalText: unknown;\s*\}\)/,
      "function normalizeDosage({ dosageValue, dosageUnit, dosageOriginalText })"
    ),
    extractFunctionSource(source, "sanitizeImageDataUrl").replace(
      /function sanitizeImageDataUrl\(value: unknown\): string \{/,
      "function sanitizeImageDataUrl(value) {"
    ),
    extractFunctionSource(source, "extractAzureTableRowGroups")
      .replace(
        /function extractAzureTableRowGroups\(tables: unknown\): string\[\]\[\] \{/,
        "function extractAzureTableRowGroups(tables) {"
      )
      .replace(
        /const rowGroups: string\[\]\[\] = \[\];/,
        "const rowGroups = [];"
      )
      .replace(
        /const cells = Array\.isArray\(\(table as Record<string, unknown>\)\?\.cells\)\s*\? \(\(\(table as Record<string, unknown>\)\.cells as unknown\[\]\) \?\? \[\]\)\s*\: \[\];/,
        "const cells = Array.isArray(table?.cells) ? (table.cells ?? []) : [];"
      )
      .replace(
        /const rowMap = new Map<number, Map<number, string>>\(\);/,
        "const rowMap = new Map();"
      )
      .replace(
        /new Map<number, string>\(\)/g,
        "new Map()"
      )
      .replace(
        /const cell = candidate as Record<string, unknown>;/,
        "const cell = candidate;"
      ),
    extractFunctionSource(source, "extractAzureTableRows").replace(
      /function extractAzureTableRows\(tables: unknown\): string\[\] \{/,
      "function extractAzureTableRows(tables) {"
    ),
    extractFunctionSource(source, "normalizeAzureIngredientPanelOcr")
      .replace(
        /function normalizeAzureIngredientPanelOcr\(\s*value: unknown,?\s*\)\s*:\s*AzureIngredientPanelOcr \| null \{/,
        "function normalizeAzureIngredientPanelOcr(value) {"
      )
      .replace(
        /const row = \(value \?\? \{\}\) as Record<string, unknown>;/,
        "const row = value ?? {};"
      )
      .replace(
        /row\?\.analyzeResult && typeof row\.analyzeResult === "object"\s*\? \(row\.analyzeResult as Record<string, unknown>\)\s*:\s*row;/,
        'row?.analyzeResult && typeof row.analyzeResult === "object" ? row.analyzeResult : row;'
      )
      .replace(
        /const pages = Array\.isArray\(analyzeResult\?\.pages\)\s*\? \(analyzeResult\.pages as unknown\[\]\)\s*:\s*\[\];/,
        "const pages = Array.isArray(analyzeResult?.pages) ? analyzeResult.pages : [];"
      )
      .replace(
        /\(page as Record<string, unknown>\)\?\.lines/g,
        "page?.lines"
      )
      .replace(
        /\(\(\(page as Record<string, unknown>\)\.lines as unknown\[\]\) \?\? \[\]\)/g,
        "(page.lines ?? [])"
      )
      .replace(
        /\(line as Record<string, unknown>\)\?\.content/g,
        "line?.content"
      )
      .replace(
        /\(page as Record<string, unknown>\)\?\.words/g,
        "page?.words"
      )
      .replace(
        /\(\(\(page as Record<string, unknown>\)\.words as unknown\[\]\) \?\? \[\]\)/g,
        "(page.words ?? [])"
      )
      .replace(
        /\(word as Record<string, unknown>\)\?\.confidence/g,
        "word?.confidence"
      ),
    extractFunctionSource(source, "mergeDoseCorrections")
      .replace(
        /function mergeDoseCorrections\(\s*ingredients: NormalizedIngredient\[\],\s*corrections: unknown\[\],\s*reclassifiableIndexes: number\[\] = \[\],?\s*\) \{/,
        "function mergeDoseCorrections(ingredients, corrections, reclassifiableIndexes = []) {"
      )
      .replace(
        /const correctionsByIndex = new Map<[\s\S]*?>\(\);/,
        "const correctionsByIndex = new Map();"
      )
      .replace(
        /const row = candidate as Record<string, unknown>;/,
        "const row = candidate;"
      )
      .replace(
        /\(trimString\(row\?\.ingredient_type\) as\s*\| "active"\s*\| "inactive"\s*\| "uncertain"\)/,
        "trimString(row?.ingredient_type)"
      )
      .replace(/ as never/g, ""),
  ].join("\n\n");

  const factory = new Function(
    `const AMOUNT_BASIS_VALUES = ["per_serving", "per_capsule", "per_tablet", "per_softgel", "per_scoop", "per_100g", "unknown"];
const ALLOWED_UNITS = new Set(["mcg", "mg", "g", "ml", "IU", "CFU"]);
const AZURE_OCR_LOW_CONFIDENCE_WORD_THRESHOLD = 0.85;
${transformed}
return {
  appendUniqueEvidenceRows,
  extractBase64PayloadFromDataUrl,
  normalizeAzureIngredientPanelOcr,
  normalizeDosage,
  mergeDoseCorrections,
};`
  );

  return factory();
}

async function importLocalJsModule(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  let sourceText = readFileSync(sourceUrl, "utf8");
  if (relativePath.endsWith("recommendedDoseScoring.js")) {
    const doseNormalizationSource = readFileSync(
      new URL(
        "../../features/supplements/doseNormalization.js",
        import.meta.url,
      ),
      "utf8",
    );
    sourceText = sourceText.replace(
      "./doseNormalization.js",
      `data:text/javascript;base64,${Buffer.from(
        doseNormalizationSource,
        "utf8",
      ).toString("base64")}`,
    );
  }
  const dataUrl = `data:text/javascript;base64,${Buffer.from(
    sourceText,
    "utf8"
  ).toString("base64")}`;
  return import(dataUrl);
}

const { normalizePhotoRescueIngredient } = loadScanSupplementPhotosModule();
const {
  appendUniqueEvidenceRows,
  extractBase64PayloadFromDataUrl,
  normalizeAzureIngredientPanelOcr,
  normalizeDosage,
  mergeDoseCorrections,
} = loadScanSupplementPhotosEdgeHelpers();
const { scoreMatchedIngredientsForProduct } = await importLocalJsModule(
  "../../features/supplements/recommendedDoseScoring.js"
);

function createSupplement({
  id,
  name = id,
  evidenceScore,
  minValue,
  maxValue = null,
  unit = "g",
}) {
  return [
    id,
    {
      name,
      evidence_score: evidenceScore,
      recommended_dose_status: "parsed",
      recommended_dose_json: {
        source_text: `Take ${minValue}${maxValue ? `-${maxValue}` : ""} ${unit} daily`,
        confidence: 0.95,
        parser_method: "rule",
        per_intake_min_value: minValue,
        per_intake_max_value: maxValue,
        unit,
        frequency_min_per_day: 1,
        frequency_max_per_day: 1,
        flags: [],
      },
      dose_scoring_profile_json: null,
      how_to_use: null,
    },
  ];
}

test("photo-rescue ingredient names with trailing doses are normalized into structured dose fields", () => {
  const ingredient = normalizePhotoRescueIngredient({
    name: "Creatine 3 g",
    dose_confidence: "verified",
  });

  assert.deepEqual(ingredient, {
    name: "Creatine",
    raw_name: "Creatine",
    dosageValue: 3,
    dosageUnit: "g",
    dosageDisplay: "3 g",
    chemicalForm: null,
    amountBasis: null,
    doseConfidence: "verified",
    doseReviewReason: null,
  });
});

test("photo-rescue display-only doses are normalized into structured dose fields", () => {
  const ingredient = normalizePhotoRescueIngredient({
    raw_name: "Magnesium Glycinate",
    dosage_display: "200 mg",
    amount_basis: "per_capsule",
    dose_confidence: "verified",
  });

  assert.deepEqual(ingredient, {
    name: "Magnesium Glycinate",
    raw_name: "Magnesium Glycinate",
    dosageValue: 200,
    dosageUnit: "mg",
    dosageDisplay: "200 mg",
    chemicalForm: null,
    amountBasis: "per_capsule",
    doseConfidence: "verified",
    doseReviewReason: null,
  });
});

test("mergeDoseCorrections applies valid corrected doses without changing other indexes", () => {
  const ingredients = [
    {
      raw_name: "Riboflavin (Vitamin B2)",
      canonical_name: "Riboflavin",
      ingredient_type: "active",
      dosage_value: 15,
      dosage_unit: "mg",
      dosage_original_text: "Riboflavin (Vitamin B2) 15mg",
      chemical_form: null,
      amount_basis: "per_serving",
    },
    {
      raw_name: "Biotin",
      canonical_name: "Biotin",
      ingredient_type: "active",
      dosage_value: 50,
      dosage_unit: "mcg",
      dosage_original_text: "Biotin 50µg",
      chemical_form: null,
      amount_basis: "per_serving",
    },
  ];

  const result = mergeDoseCorrections(ingredients, [
    {
      index: 0,
      dosage_value: 1.5,
      dosage_unit: "mg",
      dosage_original_text: "Riboflavin (Vitamin B2) 1.5mg",
    },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].raw_name, ingredients[0].raw_name);
  assert.equal(result[0].canonical_name, ingredients[0].canonical_name);
  assert.equal(result[0].dosage_value, 1.5);
  assert.equal(result[0].dosage_unit, "mg");
  assert.equal(
    result[0].dosage_original_text,
    "Riboflavin (Vitamin B2) 1.5mg"
  );
  assert.equal(result[1].raw_name, ingredients[1].raw_name);
  assert.equal(result[1].canonical_name, ingredients[1].canonical_name);
  assert.equal(result[1].dosage_value, 50);
  assert.equal(result[1].dosage_unit, "mcg");
  assert.equal(result[1].dosage_original_text, "Biotin 50µg");
});

test("mergeDoseCorrections does not replace an existing finite dose with null", () => {
  const ingredients = [
    {
      raw_name: "N-Acetyl-Cysteine",
      canonical_name: "N-Acetyl-Cysteine",
      ingredient_type: "active",
      dosage_value: 50,
      dosage_unit: "mg",
      dosage_original_text: "N-Acetyl-Cysteine 50mg",
      chemical_form: null,
      amount_basis: "per_serving",
    },
  ];

  const result = mergeDoseCorrections(ingredients, [
    {
      index: 0,
      dosage_value: null,
      dosage_unit: null,
      dosage_original_text: "N-Acetyl-Cysteine row unreadable",
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].raw_name, ingredients[0].raw_name);
  assert.equal(result[0].canonical_name, ingredients[0].canonical_name);
  assert.equal(result[0].dosage_value, 50);
  assert.equal(result[0].dosage_unit, "mg");
  assert.equal(result[0].dosage_original_text, "N-Acetyl-Cysteine 50mg");
});

test("mergeDoseCorrections can verify per-capsule serving interpretation", () => {
  const result = mergeDoseCorrections(
    [
      {
        raw_name: "Compound Alpha",
        canonical_name: "Compound Alpha",
        ingredient_type: "active",
        dosage_value: 10,
        dosage_unit: "mg",
        dosage_original_text: "Each capsule: Compound Alpha 10 mg",
        chemical_form: null,
        amount_basis: "unknown",
      },
    ],
    [
      {
        index: 0,
        dosage_value: 10,
        dosage_unit: "mg",
        dosage_original_text: "Each capsule: Compound Alpha 10 mg",
        amount_basis: "per_capsule",
      },
    ]
  );

  assert.equal(result[0].amount_basis, "per_capsule");
});

test("verification can promote only explicitly reviewable inactive rows", () => {
  const rows = [
    {
      raw_name: "Compound Alpha",
      canonical_name: "Compound Alpha",
      ingredient_type: "inactive",
      dosage_value: 10,
      dosage_unit: "mg",
      dosage_original_text: "Compound Alpha 10 mg",
      chemical_form: null,
      amount_basis: "per_serving",
    },
    {
      raw_name: "Compound Beta",
      canonical_name: "Compound Beta",
      ingredient_type: "active",
      dosage_value: 20,
      dosage_unit: "mg",
      dosage_original_text: "Compound Beta 20 mg",
      chemical_form: null,
      amount_basis: "per_serving",
    },
  ];
  const corrections = [
    {
      index: 0,
      ingredient_type: "active",
      dosage_value: 10,
      dosage_unit: "mg",
      dosage_original_text: "Compound Alpha 10 mg",
      amount_basis: "per_serving",
    },
    {
      index: 1,
      ingredient_type: "inactive",
      dosage_value: 20,
      dosage_unit: "mg",
      dosage_original_text: "Compound Beta 20 mg",
      amount_basis: "per_serving",
    },
  ];

  const result = mergeDoseCorrections(rows, corrections, [0]);

  assert.equal(result.length, 2);
  assert.equal(result[0].ingredient_type, "active");
  assert.equal(result[1].ingredient_type, "active");
});

test("resolved visual verification can correct nutrient identity, unit, and missing dose", () => {
  const rows = [
    {
      raw_name: "Potassium Iodide",
      canonical_name: "Potassium Iodide",
      ingredient_type: "active",
      dosage_value: 150,
      dosage_unit: "mcg",
      dosage_original_text: "Potassium Iodide 150ug",
      amount_basis: "per_serving",
    },
    {
      raw_name: "Selenomethionine",
      canonical_name: "Selenium",
      ingredient_type: "active",
      dosage_value: 55,
      dosage_unit: "mg",
      dosage_original_text: "Selenomethionine 55mg",
      amount_basis: "per_serving",
    },
    {
      raw_name: "Molybdenum form",
      canonical_name: "Molybdenum",
      ingredient_type: "active",
      dosage_value: null,
      dosage_unit: null,
      dosage_original_text: "Molybdenum row unreadable",
      amount_basis: "per_serving",
    },
  ];
  const corrections = [
    {
      index: 0,
      raw_name: "Iodine (as Potassium Iodide)",
      canonical_name: "Iodine",
      ingredient_type: "active",
      dosage_value: 150,
      dosage_unit: "mcg",
      dosage_original_text: "Iodine (as Potassium Iodide) 150 mcg",
      amount_basis: "per_serving",
    },
    {
      index: 1,
      raw_name: "Selenium (as Selenomethionine)",
      canonical_name: "Selenium",
      ingredient_type: "active",
      dosage_value: 55,
      dosage_unit: "mcg",
      dosage_original_text: "Selenium (as Selenomethionine) 55 mcg",
      amount_basis: "per_serving",
    },
    {
      index: 2,
      raw_name: "Molybdenum form",
      canonical_name: "Molybdenum",
      ingredient_type: "active",
      dosage_value: 50,
      dosage_unit: "mcg",
      dosage_original_text: "Molybdenum form 50 mcg",
      amount_basis: "per_serving",
    },
  ];

  const result = mergeDoseCorrections(rows, corrections);

  assert.equal(result.length, 3);
  assert.equal(result[0].canonical_name, "Iodine");
  assert.equal(result[1].dosage_value, 55);
  assert.equal(result[1].dosage_unit, "mcg");
  assert.equal(result[2].dosage_value, 50);
  assert.equal(result[2].dosage_unit, "mcg");
});

test("resolved WeightWorld verification retains exactly 27 corrected model rows", () => {
  const rows = Array.from({ length: 27 }, (_, index) => ({
    raw_name: `Nutrient ${index}`,
    canonical_name: `Nutrient ${index}`,
    ingredient_type: "active",
    dosage_value: index + 1,
    dosage_unit: "mg",
    dosage_original_text: `Nutrient ${index} ${index + 1} mg`,
    amount_basis: "per_serving",
  }));
  Object.assign(rows[15], {
    raw_name: "Sodium (as Sodium Chloride)",
    canonical_name: "Sodium",
    dosage_value: 2540,
    dosage_unit: "mg",
  });
  Object.assign(rows[17], {
    raw_name: "Potassium Iodide",
    canonical_name: "Potassium Iodide",
    dosage_value: 150,
    dosage_unit: "mcg",
  });
  Object.assign(rows[18], {
    raw_name: "Selenomethionine",
    canonical_name: "Selenium",
    dosage_value: 55,
    dosage_unit: "mg",
  });
  Object.assign(rows[19], { dosage_value: 2, dosage_unit: "mcg" });
  Object.assign(rows[20], { dosage_value: 150, dosage_unit: "mcg" });
  Object.assign(rows[21], { dosage_value: 200, dosage_unit: "mcg" });
  Object.assign(rows[22], { dosage_value: 250, dosage_unit: "mcg" });
  for (const index of [24, 25, 26]) {
    Object.assign(rows[index], { dosage_value: null, dosage_unit: null });
  }
  const correctedRows = new Map([
    [15, ["Sodium", 254, "mcg"]],
    [17, ["Iodine", 150, "mcg"]],
    [18, ["Selenium", 55, "mcg"]],
    [19, ["Vitamin B12", 50, "mcg"]],
    [20, ["Vitamin B7", 50, "mcg"]],
    [21, ["Chromium", 40, "mcg"]],
    [22, ["Boron", 25, "mcg"]],
    [24, ["Molybdenum", 50, "mcg"]],
    [25, ["Vitamin D3", 10, "mcg"]],
    [26, ["Vitamin K2", 75, "mcg"]],
  ]);
  const corrections = Array.from(correctedRows, ([index, values]) => {
    const [canonicalName, dosageValue, dosageUnit] = values;
    return {
      index,
      raw_name: canonicalName,
      canonical_name: canonicalName,
      ingredient_type: "active",
      dosage_value: dosageValue,
      dosage_unit: dosageUnit,
      dosage_original_text: `${canonicalName} ${dosageValue} ${dosageUnit}`,
      amount_basis: "per_serving",
    };
  });

  const result = mergeDoseCorrections(rows, corrections);

  assert.equal(result.length, 27);
  for (const [index, [canonicalName, dosageValue, dosageUnit]] of correctedRows) {
    assert.equal(result[index].canonical_name, canonicalName);
    assert.equal(result[index].dosage_value, dosageValue);
    assert.equal(result[index].dosage_unit, dosageUnit);
  }
  assert.equal(
    result.some((row) => Number(row.dosage_value) >= 100_000),
    false
  );
});

test("canonical dose normalization preserves micrograms and uses exact mass conversion", () => {
  assert.deepEqual(
    normalizeDosage({
      dosageValue: 55,
      dosageUnit: "µg",
      dosageOriginalText: "Selenium 55 µg",
    }),
    {
      value: 55,
      unit: "mcg",
      originalText: "Selenium 55 µg",
      invalidReason: null,
    }
  );
  assert.deepEqual(
    normalizeDosage({
      dosageValue: 0.055,
      dosageUnit: "mg",
      dosageOriginalText: "Selenium 0.055 mg",
    }),
    {
      value: 55,
      unit: "mcg",
      originalText: "Selenium 0.055 mg",
      invalidReason: null,
    }
  );
  assert.deepEqual(
    normalizeDosage({
      dosageValue: 0.000055,
      dosageUnit: "g",
      dosageOriginalText: "Selenium 0.000055 g",
    }),
    {
      value: 0.055,
      unit: "mg",
      originalText: "Selenium 0.000055 g",
      invalidReason: null,
    }
  );
});

test("malformed OCR gram rows and million-scale doses are quarantined", () => {
  for (const input of [
    {
      dosageValue: 2540,
      dosageUnit: "g",
      dosageOriginalText: "Sodium las Sodium Chloride) 2540g +",
    },
    {
      dosageValue: 250,
      dosageUnit: "g",
      dosageOriginalText: "Boron fas Boric Acid) Chloride) 250g 2",
    },
    {
      dosageValue: 150,
      dosageUnit: "g",
      dosageOriginalText: "Choline los Choline 150g. A",
    },
  ]) {
    const result = normalizeDosage(input);
    assert.equal(result.value, null);
    assert.equal(result.unit, null);
    assert.equal(result.invalidReason, "implausible_ocr_mass_magnitude");
  }

  assert.equal(
    normalizeDosage({
      dosageValue: 1_000_000,
      dosageUnit: "mg",
      dosageOriginalText: "Malformed row 1000000 mg",
    }).invalidReason,
    "implausible_mass_magnitude"
  );
});

test("extractBase64PayloadFromDataUrl returns the raw base64 payload", () => {
  const result = extractBase64PayloadFromDataUrl(
    "data:image/jpeg;base64,QUJDREVGRw=="
  );

  assert.equal(result, "QUJDREVGRw==");
});

test("normalizeAzureIngredientPanelOcr flattens table rows and OCR lines into combined text", () => {
  const result = normalizeAzureIngredientPanelOcr({
    status: "succeeded",
    analyzeResult: {
      content: "Supplement Facts Vitamin C 80 mg Zinc 10 mg",
      pages: [
        {
          lines: [
            { content: "Supplement Facts" },
            { content: "Vitamin C 80 mg" },
            { content: "Zinc 10 mg" },
          ],
          words: [
            { content: "Vitamin", confidence: 0.99 },
            { content: "C", confidence: 0.98 },
            { content: "Zinc", confidence: 0.97 },
          ],
        },
      ],
      tables: [
        {
          cells: [
            { rowIndex: 0, columnIndex: 0, content: "Ingredient" },
            { rowIndex: 0, columnIndex: 1, content: "Amount" },
            { rowIndex: 1, columnIndex: 0, content: "Vitamin C" },
            { rowIndex: 1, columnIndex: 1, content: "80 mg" },
            { rowIndex: 2, columnIndex: 0, content: "Zinc" },
            { rowIndex: 2, columnIndex: 1, content: "10 mg" },
          ],
        },
      ],
    },
  });

  assert.deepEqual(result?.tableRows, [
    "Ingredient\tAmount",
    "Vitamin C\t80 mg",
    "Zinc\t10 mg",
  ]);
  assert.deepEqual(result?.tableRowGroups, [
    ["Ingredient\tAmount", "Vitamin C\t80 mg", "Zinc\t10 mg"],
  ]);
  assert.deepEqual(result?.lines, [
    "Supplement Facts",
    "Vitamin C 80 mg",
    "Zinc 10 mg",
  ]);
  assert.match(result?.combinedText ?? "", /Table rows \(TSV\):/);
  assert.match(result?.combinedText ?? "", /Vitamin C\t80 mg/);
  assert.match(result?.combinedText ?? "", /OCR lines:/);
  assert.match(result?.combinedText ?? "", /Full OCR text:/);
  assert.match(result?.promptText ?? "", /Table rows \(TSV\):/);
  assert.match(result?.promptText ?? "", /Additional OCR lines:/);
  assert.doesNotMatch(result?.promptText ?? "", /Full OCR text:/);
  assert.equal(
    (result?.promptText.match(/Vitamin C\s+80 mg/gu) ?? []).length,
    1
  );
  assert.equal(result?.wordCount, 3);
  assert.equal(result?.lowConfidenceWordCount, 0);
  assert.equal(result?.averageWordConfidence, 0.98);
  assert.equal(
    result?.promptTableCharacters,
    [
      "Table rows (TSV):",
      "Ingredient\tAmount",
      "Vitamin C\t80 mg",
      "Zinc\t10 mg",
    ].join("\n").length,
  );
  assert.equal(
    result?.promptLineCharacters,
    ["Additional OCR lines:", "Supplement Facts"].join("\n").length,
  );
  assert.equal(result?.promptFallbackCharacters, 0);
});

test("accepted image rows extend incomplete OCR evidence without duplicating exact rows", () => {
  assert.equal(
    appendUniqueEvidenceRows(
      "Ingredient Alpha 10 mg\nlngredient Gamma 30 mg",
      ["Ingredient Gamma 30 mg", "Ingredient Alpha 10 mg"],
    ),
    "Ingredient Alpha 10 mg\nlngredient Gamma 30 mg\nIngredient Gamma 30 mg",
  );
});

test("photo-rescue normalized doses are not treated as missing_actual_dose downstream", () => {
  const ingredient = normalizePhotoRescueIngredient({
    name: "Creatine Monohydrate 3 g",
    dose_confidence: "verified",
  });

  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "creatine",
      name: "Creatine",
      evidenceScore: 87,
      minValue: 3,
      maxValue: 5,
      unit: "g",
    }),
  ]);

  const [scored] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "creatine",
        catalogName: "Creatine",
        ingredientName: ingredient.name,
        ingredientRaw: ingredient.raw_name,
        dosageValue: ingredient.dosageValue,
        dosageUnit: ingredient.dosageUnit,
        dosageDisplay: ingredient.dosageDisplay,
        amountBasis: "per_serving",
        doseConfidence: ingredient.doseConfidence,
      },
    ],
    supplementsByCatalogId,
  });

  assert.equal(scored.doseComparisonStatus, "within_target_range");
  assert.equal(scored.doseStatusLabel, "Meets target dose");
  assert.notEqual(scored.doseComparisonStatus, "missing_actual_dose");
});

test("photo-rescue display-only doses are not treated as missing_actual_dose downstream", () => {
  const ingredient = normalizePhotoRescueIngredient({
    raw_name: "Magnesium Glycinate",
    dosage_display: "200 mg",
    amount_basis: "per_capsule",
    dose_confidence: "verified",
  });

  const supplementsByCatalogId = new Map([
    createSupplement({
      id: "magnesium",
      name: "Magnesium",
      evidenceScore: 90,
      minValue: 300,
      maxValue: 600,
      unit: "mg",
    }),
  ]);

  const [scored] = scoreMatchedIngredientsForProduct({
    matchedIngredients: [
      {
        catalogId: "magnesium",
        catalogName: "Magnesium",
        ingredientName: ingredient.name,
        ingredientRaw: ingredient.raw_name,
        dosageValue: ingredient.dosageValue,
        dosageUnit: ingredient.dosageUnit,
        dosageDisplay: ingredient.dosageDisplay,
        amountBasis: ingredient.amountBasis,
        doseConfidence: ingredient.doseConfidence,
      },
    ],
    supplementsByCatalogId,
    servingSizeText: "Serving size: 2 capsules",
  });

  assert.equal(scored.normalizedServingDose?.value, 400);
  assert.equal(scored.normalizedServingDose?.unit, "mg");
  assert.equal(scored.doseComparisonStatus, "within_target_range");
  assert.equal(scored.doseStatusLabel, "Meets target dose");
  assert.notEqual(scored.doseComparisonStatus, "missing_actual_dose");
});

test("scanSupplementPhotos normalizes nested response envelopes and snake_case fields", async () => {
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        data: {
          product_id: " prod_123 ",
          display_name: " Magnesium Glycinate ",
          product_name: " Magnesium Glycinate ",
          ingredients_found: [
            "Magnesium 200 mg",
            {
              raw_name: "Vitamin D3 25 mcg",
              dosage_original_text: "25 mcg",
              amount_basis: "per_capsule",
            },
          ],
          serving_size_text: " 2 capsules ",
          source: " photo_rescue_canonical ",
          confidence: "0.91",
          classification_confidence: "0.72",
          created_product: 1,
          wrote_canonical_data: "yes",
          is_supplement: true,
          category: " vitamin_mineral ",
          error: " Parsed successfully ",
          unresolved_ingredient_count: "3",
          raw_text: " OCR text ",
        },
      }),
    }),
  });

  const result = await scanSupplementPhotos({ barcode: "0123456789012" });

  assert.deepEqual(result, {
    productId: "prod_123",
    displayName: "Magnesium Glycinate",
    productName: "Magnesium Glycinate",
    ingredients: [
      {
        name: "Magnesium",
        raw_name: "Magnesium",
        dosageValue: 200,
        dosageUnit: "mg",
        dosageDisplay: "200 mg",
        chemicalForm: null,
        amountBasis: null,
        doseConfidence: null,
        doseReviewReason: null,
      },
      {
        name: "Vitamin D3",
        raw_name: "Vitamin D3",
        dosageValue: 25,
        dosageUnit: "mcg",
        dosageDisplay: "25 mcg",
        chemicalForm: null,
        amountBasis: "per_capsule",
        doseConfidence: null,
        doseReviewReason: null,
      },
    ],
    servingSizeText: "2 capsules",
    source: "photo_rescue_canonical",
    confidence: 0.91,
    classificationConfidence: 0.72,
    createdProduct: true,
    wroteCanonicalData: true,
    isSupplement: true,
    category: "vitamin_mineral",
    message: "Parsed successfully",
    unresolvedIngredientCount: 3,
    rawText: "OCR text",
    committedRevision: null,
    acceptedAttemptId: "",
  });
});

test("scanSupplementPhotos normalizes canonical revision metadata", async () => {
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        committed_revision: "7",
        accepted_attempt_id: "photo-v1-generic-attempt",
      }),
    }),
  });

  const result = await scanSupplementPhotos({ barcode: "0123456789012" });

  assert.equal(result.committedRevision, 7);
  assert.equal(result.acceptedAttemptId, "photo-v1-generic-attempt");
});

test("scanSupplementPhotos forwards barcodeType to the edge function payload", async () => {
  let capturedBody = null;
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({}),
      };
    },
  });

  await scanSupplementPhotos({
    barcode: "X00131RGZ5",
    barcodeType: "code128",
    scanSessionId: "9",
  });

  assert.equal(capturedBody?.barcode, "X00131RGZ5");
  assert.equal(capturedBody?.barcodeType, "code128");
  assert.equal(capturedBody?.scanSessionId, "9");
});

test("scanSupplementPhotos emits request timings and propagates one trace ID", async () => {
  const events = [];
  let capturedHeaders;
  const telemetry = {
    traceId: "photo_improvement:example-trace",
    flow: "photo_improvement",
    action: "improve_with_photos",
    start: (stage, metadata = {}) => (details = {}) => {
      events.push({ stage, ...metadata, ...details });
    },
    measure: async (stage, operation, metadata = {}) => {
      const result = await operation();
      events.push({ stage, ...metadata, success: true });
      return result;
    },
  };
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    getLatencyTraceHeaders: (trace) => ({
      "x-trace-id": trace.traceId,
    }),
    fetch: async (_url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "123.4" },
        json: async () => ({ ingredients: [] }),
      };
    },
  });

  await scanSupplementPhotos(
    { barcode: "0123456789012" },
    { telemetry },
  );

  assert.equal(
    capturedHeaders["x-trace-id"],
    "photo_improvement:example-trace",
  );
  assert.deepEqual(
    events.map((event) => event.stage),
    [
      "client_authentication",
      "request_upload_round_trip",
      "client_response_parse_and_normalize",
    ],
  );
  assert.equal(events.every((event) => event.success), true);
});

test("scanSupplementPhotos normalizes backend validation failures with safe messages", async () => {
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => ({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          error:
            "We couldn't read any usable active supplement ingredients from those photos.",
        }),
      headers: { get: () => null },
    }),
  });

  await assert.rejects(
    () => scanSupplementPhotos({ barcode: "0123456789012" }),
    (error) => {
      assert.equal(error.category, "backend_validation_failure");
      assert.equal(error.status, 422);
      assert.equal(
        error.message,
        "We couldn't read any usable active supplement ingredients from those photos."
      );
      return true;
    }
  );
});

test("scanSupplementPhotos normalizes network transport failures", async () => {
  const events = [];
  const telemetry = {
    start: (stage) => (details = {}) => events.push({ stage, ...details }),
    measure: async (_stage, operation) => operation(),
  };
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  });

  await assert.rejects(
    () =>
      scanSupplementPhotos(
        { barcode: "0123456789012" },
        { telemetry },
      ),
    (error) => {
      assert.equal(error.category, "network_error");
      assert.equal(error.code, "network_error");
      return true;
    }
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].stage, "request_upload_round_trip");
  assert.equal(events[0].success, false);
});

test("photo Edge Function instruments every production server latency stage", () => {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/scan-supplement-photos/index.ts",
      import.meta.url
    ),
    "utf8"
  );
  const completenessSource = readFileSync(
    new URL(
      "../../supabase/functions/_shared/photo-extraction-completeness.js",
      import.meta.url
    ),
    "utf8"
  );
  const stages = [
    "edge_function_total",
    "authentication",
    "revenuecat_entitlement_check",
    "request_validation",
    "quota_check",
    "azure_ocr_submission",
    "azure_ocr_poll",
    "azure_ocr_total",
    "openai_extraction_call",
    "openai_dose_verification_call",
    "dose_verification_decision",
    "ingredient_row_lifecycle",
    "ingredient_row_lifecycle_summary",
    "canonical_persistence_database_work",
    "review_provenance_artifact_creation",
    "score_refresh_follow_up",
    "review_follow_up_scheduling",
    "review_follow_up_request",
  ];

  for (const stage of stages) {
    if (stage === "edge_function_total") {
      assert.match(source, /instrumentEdgeRequest/u);
    } else {
      assert.equal(
        source.includes(`"${stage}"`),
        true,
        `missing server timing stage: ${stage}`
      );
    }
  }

  assert.match(source, /queueReviewCandidateRefresh\([\s\S]*?telemetry/u);
  assert.match(source, /EdgeRuntime\.waitUntil\(promise\)/u);
  assert.match(source, /verificationRequired:\s*secondPassRequired/u);
  assert.match(source, /verificationReason:\s*verificationPlan\.reason/u);
  assert.match(
    source,
    /verificationReasonDetails:\s*verificationPlan\.reasonDetails/u
  );
  assert.match(
    source,
    /verificationRowCount:\s*verificationExecutionPlan\.rowCount/u
  );
  assert.match(
    source,
    /questionableRowIndexes:\s*verificationPlan\.questionableRowIndexes/u
  );
  assert.match(
    source,
    /verificationRowIndexes:\s*verificationExecutionPlan\.rowIndexes/u
  );
  assert.match(source, /verificationSelectionExpanded:/u);
  assert.match(
    source,
    /ocrCandidateRowCount:\s*verificationPlan\.ocrCandidateRowCount/u
  );
  assert.match(
    source,
    /recoveredOcrRowCount:\s*verificationPlan\.recoveredOcrRowCount/u
  );
  assert.match(
    source,
    /unmatchedOcrCandidateRowCount:\s*[\s\S]*?verificationPlan\.unmatchedOcrCandidateRowCount/u
  );
  assert.match(
    source,
    /incompletenessStateBeforeRecovery:\s*[\s\S]*?verificationPlan\.incompletenessStateBeforeRecovery/u
  );
  assert.match(
    source,
    /incompletenessStateAfterRecovery:\s*[\s\S]*?verificationPlan\.incompletenessStateAfterRecovery/u
  );
  assert.match(
    source,
    /incompletePanelEscalationReason:\s*[\s\S]*?verificationPlan\.incompletePanelEscalationReason/u
  );
  assert.match(
    source,
    /modelIncompleteGlobalReasonDisposition:\s*[\s\S]*?verificationPlan\.modelIncompleteGlobalReasonDisposition/u
  );
  assert.match(source, /selectVisualVerificationStrategy\(\{/u);
  assert.match(source, /visual_audit_complete/u);
  assert.match(source, /visual_unresolved_region_count/u);
  assert.match(source, /selectTargetedVisualRegions\(\{/u);
  assert.match(source, /extractAzureOcrCandidateGroups\(/u);
  assert.match(source, /const candidateId = `table:\$\{tableIndex\}:\$\{rowIndex\}`/u);
  assert.match(source, /const candidateId = `line:\$\{pageNumber\}:\$\{lineIndex\}`/u);
  assert.match(source, /ocrCandidateGroups:\s*ingredientsOcr\?\.ocrCandidateGroups/u);
  assert.match(source, /questionableRowGroups:\s*verificationPlan\.questionableOcrRowGroups/u);
  assert.match(source, /questionableCandidateIdGroups:/u);
  assert.match(source, /unmatchedRows:\s*verificationPlan\.unmatchedOcrCandidateRows/u);
  assert.match(source, /unmatchedCandidateIdGroups:/u);
  assert.match(source, /reliableOcr:\s*reliableDedicatedOcr/u);
  assert.match(source, /mappedQuestionableRowCount:/u);
  assert.match(source, /mappedUnmatchedCandidateCount:/u);
  assert.match(source, /reliableGeometryTargeting:/u);
  assert.match(source, /targetCropArea:/u);
  assert.match(source, /candidateGeometryCount:/u);
  assert.match(source, /geometryFailureMissingBoundsCount/u);
  assert.match(source, /mappingWrappedRowMergeCount:/u);
  assert.match(source, /targetedFallbackReason/u);
  assert.match(source, /inactiveReviewRowIndexes/u);
  assert.match(completenessSource, /inactive_structured_ocr_candidate/u);
  assert.match(source, /ingredient_type:\s*verifiedIngredientType/u);
  assert.match(source, /verifier_reclassified_active/u);
  assert.match(source, /emitIngredientRowLifecycleTelemetry\(\{/u);
  assert.match(completenessSource, /lifecycleReconciled:/u);
  assert.match(source, /photo_rescue_extract_v6/u);
  assert.match(source, /verification_persistence_gate/u);
  assert.match(source, /PhotoVerificationUnresolvedError/u);
  assert.match(source, /allowNewIngredients:\s*false/u);
  assert.match(source, /allowDoseRecovery:\s*reliableDedicatedOcr/u);
  assert.match(
    source,
    /visuallyVerifiedRecoveredRowIndexes:\s*aiResult\.rowLifecycle\.visuallyVerifiedRecoveredRowIndexes/u
  );
  assert.ok(
    source.indexOf("if (!verificationPersistenceGate.allowed)") <
      source.indexOf(
        "initialResult.extraction.ingredients_found = mergeDoseCorrections"
      ),
    "unresolved verification must stop before merge-back"
  );
  assert.match(
    source,
    /verificationRowIndexes\s*=\s*verificationPlan\.questionableRowIndexes/u
  );
  assert.match(source, /buildTargetedJpegDataUrl\(\{/u);
  assert.match(
    source,
    /Number\(targetedImageTokens\)\s*<\s*Number\(estimatedFullVerificationImageTokens\)/u
  );
  assert.match(source, /shouldFallbackToFullVisualVerification\(\{/u);
  assert.match(source, /visualVerificationMode:\s*"full_image_fallback"/u);
  assert.match(source, /resultStatus:\s*"skipped"/u);
});

test("photo dose verification is behind one reversible server kill switch", () => {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/scan-supplement-photos/index.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    source,
    /const PHOTO_DOSE_VERIFICATION_ENABLED = false;/u
  );
  assert.match(
    source,
    /PHOTO_DOSE_VERIFICATION_ENABLED && verificationPlan\.required/u
  );
  assert.match(
    source,
    /if \(!PHOTO_DOSE_VERIFICATION_ENABLED\) \{[\s\S]*?verificationVisualMode = "verification_disabled";[\s\S]*?verificationRowIndexes = \[\];[\s\S]*?verificationStrategyReason = "temporarily_disabled";/u
  );
  assert.ok(
    source.indexOf("if (!PHOTO_DOSE_VERIFICATION_ENABLED)") <
      source.indexOf('"targeted_verification_image_preparation"'),
    "the kill switch must bypass targeted image preparation"
  );
  assert.match(source, /resultStatus: !PHOTO_DOSE_VERIFICATION_ENABLED/u);
});

test("the guarded first-pass crop is OpenAI-only and preserves the original Azure image", () => {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/scan-supplement-photos/index.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    source,
    /tryFetchAzureIngredientPanelOcr\(\s*ingredientsImage,\s*telemetry/u
  );
  assert.match(
    source,
    /buildOpenAiPanelCropDataUrl\(\{\s*imageDataUrl: ingredientsImage,/u
  );
  assert.match(source, /url: openAiIngredientImage,/u);
  assert.match(
    source,
    /return \{ image: ingredientsImage, metadata \};/u,
    "every rejected crop must retain the original image"
  );
  assert.match(source, /const PHOTO_DOSE_VERIFICATION_ENABLED = false;/u);
});

test("canonical persistence receives the validated row set without a hidden dose filter", () => {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/scan-supplement-photos/index.ts",
      import.meta.url
    ),
    "utf8"
  );
  const builder = source.slice(
    source.indexOf("function buildResolvedActiveIngredientRows"),
    source.indexOf("function buildMasterActiveIngredients")
  );

  assert.match(
    builder,
    /if \(ingredient\.ingredient_type === "inactive"\)[\s\S]*?disposition: "filtered_inactive"[\s\S]*?continue;/u
  );
  assert.match(
    builder,
    /disposition: "rejected_unverified_recovery"[\s\S]*?reasonCategory: "missing_independent_visual_evidence"/u
  );
  assert.match(
    builder,
    /if \(dosage\.invalidReason\)[\s\S]*?malformedDosages\.push/u
  );
  assert.doesNotMatch(
    builder,
    /if \(dosage\.invalidReason\) \{[\s\S]{0,300}?continue;/u
  );
  assert.match(
    source,
    /replaceCanonicalRows\(\{[\s\S]*?rowsToInsert:\s*resolvedIngredients\.rows,[\s\S]*?masterRows:\s*resolvedIngredients\.activeRows/u
  );
});

test("photo extraction applies adaptive visual evidence while preserving product naming", () => {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/scan-supplement-photos/index.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    source,
    /selectPhotoExtractionStrategy\(\{/u
  );
  assert.match(source, /if \(includesIngredientsImage\)/u);
  assert.match(
    source,
    /ingredient panel is supplied as high-confidence dedicated OCR/u
  );
  assert.match(source, /detail: extractionStrategy\.ingredientPanelImageDetail/u);
  assert.match(source, /detail: extractionStrategy\.productImageDetail/u);
  assert.match(source, /derive naming fields from the front label/u);
  assert.match(source, /existing product name only as a fallback naming hint/u);
  assert.match(source, /Do not repeat the supplied OCR/u);
  assert.match(
    source,
    /initialResult\.productText\.ingredient_panel_text\s*=\s*ingredientsOcr\.combinedText/u
  );
  assert.match(source, /ingredient_panel_complete/u);
  assert.match(source, /dose_verification_required/u);
  assert.match(source, /dose_confidence/u);
});
