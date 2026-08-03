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
  const doseNormalizationSource = readFileSync(
    new URL(
      "../../features/supplements/doseNormalization.js",
      import.meta.url,
    ),
    "utf8",
  ).replace(/\bexport\s+/gu, "");
  const doseNormalization = new Function(
    `${doseNormalizationSource}\nreturn { normalizeIngredientDose };`,
  )();
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
      /import\s+\{\s*normalizeIngredientDose\s*\}\s+from\s+"@\/features\/supplements\/doseNormalization";\n/,
      "",
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
    "fetch",
    "normalizeIngredientDose",
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
    overrides.fetch ??
      (async () => ({
        ok: true,
        json: async () => ({}),
      })),
    overrides.normalizeIngredientDose ??
      doseNormalization.normalizeIngredientDose,
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
    extractFunctionSource(source, "sanitizeImageDataUrl").replace(
      /function sanitizeImageDataUrl\(value: unknown\): string \{/,
      "function sanitizeImageDataUrl(value) {"
    ),
    extractFunctionSource(source, "extractBase64PayloadFromDataUrl").replace(
      /function extractBase64PayloadFromDataUrl\(value: unknown\): string \{/,
      "function extractBase64PayloadFromDataUrl(value) {"
    ),
  ].join("\n\n");

  const factory = new Function(
    `${transformed}
return {
  extractBase64PayloadFromDataUrl,
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
const { extractBase64PayloadFromDataUrl } = loadScanSupplementPhotosEdgeHelpers();
const {
  applyIngredientEvidencePolicy,
  mergeDoseCorrections,
  normalizeAzureIngredientPanelOcr,
  normalizeExtractedDosePair,
  parseOpenAiStructuredCompletion,
  validateDoseVerificationModelOutput,
  validatePhotoRescueModelOutput,
  verifyDoseAgainstOcr,
} = await importLocalJsModule(
  "../../supabase/functions/_shared/photo-extraction-reliability.js"
);
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

  assert.equal(ingredient.name, "Creatine");
  assert.equal(ingredient.raw_name, "Creatine");
  assert.equal(ingredient.dosageValue, 3);
  assert.equal(ingredient.dosageUnit, "g");
  assert.equal(ingredient.dosageDisplay, "3 g");
  assert.equal(ingredient.amountBasis, null);
  assert.equal(ingredient.doseConfidence, "verified");
  assert.equal(ingredient.normalizedDose.isStructurallyUsable, true);
});

test("photo-rescue display-only doses are normalized into structured dose fields", () => {
  const ingredient = normalizePhotoRescueIngredient({
    raw_name: "Magnesium Glycinate",
    dosage_display: "200 mg",
    amount_basis: "per_capsule",
    dose_confidence: "verified",
  });

  assert.equal(ingredient.name, "Magnesium Glycinate");
  assert.equal(ingredient.raw_name, "Magnesium Glycinate");
  assert.equal(ingredient.dosageValue, 200);
  assert.equal(ingredient.dosageUnit, "mg");
  assert.equal(ingredient.dosageDisplay, "200 mg");
  assert.equal(ingredient.amountBasis, "per_capsule");
  assert.equal(ingredient.doseConfidence, "verified");
  assert.equal(ingredient.normalizedDose.parsedFromDisplay, true);
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
      evidence_source: "ingredient_panel_image",
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
      evidence_source: "ingredient_panel_image",
    },
  ];

  const result = mergeDoseCorrections(ingredients, [
    {
      index: 0,
      decision: "corrected",
      dosage_value: 1.5,
      dosage_unit: "mg",
      dosage_original_text: "Riboflavin (Vitamin B2) 1.5mg",
      review_reason: null,
    },
    {
      index: 1,
      decision: "verified",
      dosage_value: 50,
      dosage_unit: "mcg",
      dosage_original_text: "Biotin 50µg",
      review_reason: null,
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

test("mergeDoseCorrections retracts an uncertain first-pass dose", () => {
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
      evidence_source: "ingredient_panel_image",
    },
  ];

  const result = mergeDoseCorrections(ingredients, [
    {
      index: 0,
      decision: "retracted",
      dosage_value: null,
      dosage_unit: null,
      dosage_original_text: "N-Acetyl-Cysteine row unreadable",
      review_reason: "verifier_retracted_dose",
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].raw_name, ingredients[0].raw_name);
  assert.equal(result[0].canonical_name, ingredients[0].canonical_name);
  assert.equal(result[0].dosage_value, null);
  assert.equal(result[0].dosage_unit, null);
  assert.equal(result[0].dosage_original_text, "N-Acetyl-Cysteine 50mg");
  assert.equal(result[0].dose_confidence, "unverified");
  assert.equal(result[0].dose_review_reason, "verifier_retracted_dose");
});

test("extractBase64PayloadFromDataUrl returns the raw base64 payload", () => {
  const result = extractBase64PayloadFromDataUrl(
    "data:image/jpeg;base64,QUJDREVGRw=="
  );

  assert.equal(result, "QUJDREVGRw==");
});

test("normalizeAzureIngredientPanelOcr preserves rows, cells, and OCR lines", () => {
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
  assert.deepEqual(result?.lines, [
    "Supplement Facts",
    "Vitamin C 80 mg",
    "Zinc 10 mg",
  ]);
  assert.equal(result?.structuredRows[1].id, "table-0-row-1");
  assert.deepEqual(
    result?.structuredRows[1].cells.map((cell) => [cell.columnIndex, cell.text]),
    [
      [0, "Vitamin C"],
      [1, "80 mg"],
    ]
  );
  assert.deepEqual(result?.structuredRows[1].doseCandidates, [
    { text: "80 mg", value: 80, unit: "mg" },
  ]);
  assert.equal(result?.structuredLines[2].id, "page-1-line-2");
  assert.match(result?.combinedText ?? "", /Table rows \(TSV\):/);
  assert.match(result?.combinedText ?? "", /Vitamin C\t80 mg/);
  assert.match(result?.combinedText ?? "", /OCR lines:/);
  assert.match(result?.combinedText ?? "", /Full OCR text:/);
});

function createTableOcr(rows) {
  return normalizeAzureIngredientPanelOcr({
    analyzeResult: {
      tables: [
        {
          cells: rows.flatMap((row, rowIndex) => [
            { rowIndex, columnIndex: 0, content: row[0], confidence: 0.98 },
            { rowIndex, columnIndex: 1, content: row[1], confidence: 0.97 },
          ]),
        },
      ],
    },
  });
}

test("same-row OCR evidence verifies only the matching ingredient dose", () => {
  const ocr = createTableOcr([
    ["Magnesium citrate", "200 mg"],
    ["Zinc picolinate", "10 mg"],
  ]);

  const verified = verifyDoseAgainstOcr({
    ingredientName: "Magnesium",
    chemicalForm: "Magnesium citrate",
    rawDosageValue: 200,
    rawDosageUnit: "mg",
    dosageOriginalText: "Magnesium citrate 200 mg",
    ocr,
  });
  const borrowedNeighbor = verifyDoseAgainstOcr({
    ingredientName: "Magnesium",
    chemicalForm: "Magnesium citrate",
    rawDosageValue: 10,
    rawDosageUnit: "mg",
    dosageOriginalText: null,
    ocr,
  });

  assert.equal(verified.confidence, "verified");
  assert.equal(verified.evidenceReference, "table-0-row-0");
  assert.equal(borrowedNeighbor.confidence, "unverified");
  assert.equal(borrowedNeighbor.reason, "ambiguous_neighboring_dose");
});

test("a geometry-linked wrapped dose remains associated with its ingredient", () => {
  const ocr = normalizeAzureIngredientPanelOcr({
    analyzeResult: {
      pages: [
        {
          pageNumber: 1,
          lines: [
            {
              content: "Magnesium glycinate",
              polygon: [0, 0, 4, 0, 4, 1, 0, 1],
              confidence: 0.97,
            },
            {
              content: "200 mg",
              polygon: [1, 1.1, 3, 1.1, 3, 2, 1, 2],
              confidence: 0.96,
            },
          ],
        },
      ],
    },
  });

  const result = verifyDoseAgainstOcr({
    ingredientName: "Magnesium",
    chemicalForm: "glycinate",
    rawDosageValue: 200,
    rawDosageUnit: "mg",
    dosageOriginalText: null,
    ocr,
  });

  assert.equal(result.confidence, "verified");
  assert.equal(
    result.evidenceReference,
    "page-1-line-0+page-1-line-1"
  );
});

test("chemical-form and canonical alias variants match the correct OCR row", () => {
  const ocr = createTableOcr([
    ["Methylcobalamin (Vitamin B12)", "50 mcg"],
    ["Folic acid", "400 mcg"],
  ]);

  const result = verifyDoseAgainstOcr({
    ingredientName: "Vitamin B12",
    rawName: "Methylcobalamin",
    chemicalForm: "Methylcobalamin",
    rawDosageValue: 50,
    rawDosageUnit: "mcg",
    dosageOriginalText: null,
    ocr,
  });

  assert.equal(result.confidence, "verified");
  assert.equal(result.evidenceReference, "table-0-row-0");
});

test("front-label-only claims are flagged while formal panel rows remain active", () => {
  const ocr = createTableOcr([["Zinc citrate", "10 mg"]]);
  const [frontOnly, alsoOnPanel] = applyIngredientEvidencePolicy(
    [
      {
        raw_name: "Super Greens",
        canonical_name: "Super Greens",
        ingredient_type: "active",
        dosage_value: 500,
        dosage_unit: "mg",
        dosage_original_text: "Super Greens 500 mg",
        chemical_form: null,
        amount_basis: "per_serving",
        evidence_source: "front_label",
      },
      {
        raw_name: "Zinc citrate",
        canonical_name: "Zinc",
        ingredient_type: "active",
        dosage_value: 10,
        dosage_unit: "mg",
        dosage_original_text: "Zinc citrate 10 mg",
        chemical_form: "citrate",
        amount_basis: "per_serving",
        evidence_source: "front_label",
      },
    ],
    ocr
  );

  assert.equal(frontOnly.ingredient_type, "uncertain");
  assert.equal(frontOnly.dosage_value, null);
  assert.equal(frontOnly.dose_review_reason, "front_label_only");
  assert.equal(alsoOnPanel.ingredient_type, "active");
  assert.equal(alsoOnPanel.evidence_source, "ingredient_panel_ocr");
  assert.equal(alsoOnPanel.evidence_reference, "table-0-row-0");
});

test("valid multi-ingredient panel extraction remains verified", () => {
  const ocr = createTableOcr([
    ["Vitamin C", "80 mg"],
    ["Zinc", "10 mg"],
  ]);
  const ingredients = applyIngredientEvidencePolicy(
    [
      {
        raw_name: "Vitamin C",
        canonical_name: "Vitamin C",
        ingredient_type: "active",
        dosage_value: 80,
        dosage_unit: "mg",
        dosage_original_text: "Vitamin C 80 mg",
        chemical_form: null,
        amount_basis: "per_serving",
        evidence_source: "ingredient_panel_ocr",
      },
      {
        raw_name: "Zinc",
        canonical_name: "Zinc",
        ingredient_type: "active",
        dosage_value: 10,
        dosage_unit: "mg",
        dosage_original_text: "Zinc 10 mg",
        chemical_form: null,
        amount_basis: "per_serving",
        evidence_source: "ingredient_panel_ocr",
      },
    ],
    ocr
  );
  const merged = mergeDoseCorrections(
    ingredients,
    ingredients.map((ingredient, index) => ({
      index,
      decision: "verified",
      dosage_value: ingredient.dosage_value,
      dosage_unit: ingredient.dosage_unit,
      dosage_original_text: ingredient.dosage_original_text,
      review_reason: null,
    })),
    { ocr }
  );

  assert.deepEqual(
    merged.map((ingredient) => [
      ingredient.canonical_name,
      ingredient.dosage_value,
      ingredient.dosage_unit,
      ingredient.dose_confidence,
    ]),
    [
      ["Vitamin C", 80, "mg", "verified"],
      ["Zinc", 10, "mg", "verified"],
    ]
  );
});

test("plain OCR lines verify same-line doses but flattened text alone fails closed", () => {
  const lineOcr = normalizeAzureIngredientPanelOcr({
    analyzeResult: {
      pages: [{ lines: [{ content: "Vitamin C 80 mg" }] }],
    },
  });
  const flattenedOnly = normalizeAzureIngredientPanelOcr({
    analyzeResult: { content: "Vitamin C 80 mg" },
  });
  const input = {
    ingredientName: "Vitamin C",
    rawDosageValue: 80,
    rawDosageUnit: "mg",
    dosageOriginalText: null,
  };

  assert.equal(
    verifyDoseAgainstOcr({ ...input, ocr: lineOcr }).confidence,
    "verified"
  );
  assert.deepEqual(verifyDoseAgainstOcr({ ...input, ocr: flattenedOnly }), {
    confidence: "unverified",
    reason: "ocr_structure_unavailable",
  });
});

function createValidModelOutput() {
  return {
    is_supplement: true,
    classification_confidence: 95,
    category: "vitamin_mineral",
    should_extract: true,
    classification_reason: "Synthetic supplement facts panel",
    front_label_name: "Example Minerals",
    ingredient_panel_text: "Magnesium 200 mg",
    display_name: "Example Minerals",
    product_name: "Minerals",
    full_product_name: "Example Minerals",
    brand_name: "Example",
    product_type: "Mineral supplement",
    form_factor: "capsule",
    flavor: null,
    naming_confidence: 90,
    naming_notes: null,
    serving_size_text: "1 capsule",
    extraction_notes: null,
    raw_text: "Example Minerals Magnesium 200 mg",
    ingredients_found: [
      {
        raw_name: "Magnesium citrate",
        canonical_name: "Magnesium",
        ingredient_type: "active",
        dosage_value: 200,
        dosage_unit: "mg",
        dosage_original_text: "Magnesium citrate 200 mg",
        chemical_form: "citrate",
        amount_basis: "per_serving",
        evidence_source: "ingredient_panel_ocr",
      },
    ],
  };
}

function completionWith(value, overrides = {}) {
  return {
    choices: [
      {
        finish_reason: "stop",
        message: { content: JSON.stringify(value) },
        ...overrides,
      },
    ],
  };
}

test("runtime validation rejects malformed parseable and incomplete model output", () => {
  const malformed = createValidModelOutput();
  malformed.ingredients_found[0].dosage_value = "200";
  assert.throws(
    () =>
      parseOpenAiStructuredCompletion({
        completion: completionWith(malformed),
        validate: validatePhotoRescueModelOutput,
        label: "photo extraction",
      }),
    (error) => error.code === "malformed_model_output"
  );

  const incomplete = createValidModelOutput();
  delete incomplete.ingredients_found[0].evidence_source;
  assert.throws(
    () =>
      parseOpenAiStructuredCompletion({
        completion: completionWith(incomplete),
        validate: validatePhotoRescueModelOutput,
        label: "photo extraction",
      }),
    (error) => error.code === "incomplete_model_output"
  );

  const sentinel = createValidModelOutput();
  sentinel.ingredients_found[0].dosage_unit = "unknown";
  const sentinelValidation = validatePhotoRescueModelOutput(sentinel);
  assert.equal(sentinelValidation.ok, false);
  assert.equal(sentinelValidation.code, "malformed_model_output");
  assert.equal(sentinelValidation.issue, "unsupported_dose_sentinel");
});

test("runtime validation handles model refusal and truncation explicitly", () => {
  assert.throws(
    () =>
      parseOpenAiStructuredCompletion({
        completion: {
          choices: [
            {
              finish_reason: "stop",
              message: { refusal: "Cannot process this image", content: "" },
            },
          ],
        },
        validate: validatePhotoRescueModelOutput,
        label: "photo extraction",
      }),
    (error) => error.code === "model_refusal"
  );
  assert.throws(
    () =>
      parseOpenAiStructuredCompletion({
        completion: completionWith(createValidModelOutput(), {
          finish_reason: "length",
        }),
        validate: validatePhotoRescueModelOutput,
        label: "photo extraction",
      }),
    (error) => error.code === "truncated_model_output"
  );
});

test("partial dose pairs normalize as unusable", () => {
  assert.deepEqual(normalizeExtractedDosePair(200, null), {
    value: null,
    unit: null,
    isUsable: false,
    reviewReason: "missing_dose_unit",
  });
  assert.deepEqual(normalizeExtractedDosePair(null, "mg"), {
    value: null,
    unit: null,
    isUsable: false,
    reviewReason: "missing_dose_value",
  });
});

test("dose verifier schema requires one complete decision per ingredient", () => {
  const result = validateDoseVerificationModelOutput(
    {
      verified_ingredients: [
        {
          index: 0,
          decision: "verified",
          dosage_value: 200,
          dosage_unit: "mg",
          dosage_original_text: "Magnesium 200 mg",
          review_reason: null,
        },
      ],
    },
    2
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "incomplete_model_output");
});

test("edge extraction always sends the ingredient-panel image and uses attempt-scoped safe diagnostics", () => {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/scan-supplement-photos/index.ts",
      import.meta.url
    ),
    "utf8"
  );
  const extractionBody = source.slice(
    source.indexOf("async function fetchOpenAiExtraction"),
    source.indexOf("async function fetchOffProductById")
  );

  assert.match(extractionBody, /url: ingredientsImage/);
  assert.doesNotMatch(extractionBody, /if \(!ingredientsOcr\)/);
  assert.match(source, /photoAttemptId, "ingredient_decision"/);
  assert.match(source, /\[photo-extraction-reliability\]/);
  assert.doesNotMatch(source, /raw model response/i);
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
          persistence_outcome: " applied ",
          committed_revision: "2",
          accepted_attempt_id: "attempt-7",
          stored_revision: "2",
          follow_up_warnings: [" score_refresh_enqueue_failed ", ""],
        },
      }),
    }),
  });

  const result = await scanSupplementPhotos({ barcode: "0123456789012" });
  const ingredientsWithoutContract = result.ingredients.map(
    ({ normalizedDose: _normalizedDose, ...ingredient }) => ingredient,
  );

  assert.deepEqual({ ...result, ingredients: ingredientsWithoutContract }, {
    productId: "prod_123",
    displayName: "Magnesium Glycinate",
    productName: "Magnesium Glycinate",
    ingredients: [
      {
        name: "Magnesium",
        raw_name: "Magnesium",
        dosageValue: 200,
        dosageUnit: "mg",
        dosageOriginalText: null,
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
        dosageOriginalText: "25 mcg",
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
    persistenceOutcome: "applied",
    committedRevision: 2,
    acceptedAttemptId: "attempt-7",
    storedRevision: 2,
    followUpWarnings: ["score_refresh_enqueue_failed"],
  });
  assert.equal(result.ingredients[0].normalizedDose.displayText, "200 mg");
  assert.equal(
    result.ingredients[0].normalizedDose.unavailableReason,
    "missing_amount_basis",
  );
  assert.equal(result.ingredients[1].normalizedDose.isScoringEligible, true);
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
    photoAttemptId: "attempt-4",
    expectedRevision: 2,
    proposedRevision: 3,
  });

  assert.equal(capturedBody?.barcode, "X00131RGZ5");
  assert.equal(capturedBody?.barcodeType, "code128");
  assert.equal(capturedBody?.scanSessionId, "9");
  assert.equal(capturedBody?.photoAttemptId, "attempt-4");
  assert.equal(capturedBody?.expectedRevision, 2);
  assert.equal(capturedBody?.proposedRevision, 3);
});

test("scanSupplementPhotos exposes a structured stale persistence outcome", async () => {
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        productId: "product-1",
        persistenceOutcome: "rejected_stale",
        committedRevision: 4,
        acceptedAttemptId: "attempt-8",
        storedRevision: 4,
        wroteCanonicalData: false,
        ingredients: [{ name: "Committed magnesium", dosageValue: 300, dosageUnit: "mg" }],
      }),
    }),
  });

  const result = await scanSupplementPhotos({ barcode: "0123456789012" });

  assert.equal(result.persistenceOutcome, "rejected_stale");
  assert.equal(result.committedRevision, 4);
  assert.equal(result.acceptedAttemptId, "attempt-8");
  assert.equal(result.storedRevision, 4);
  assert.equal(result.wroteCanonicalData, false);
});

test("edge canonical persistence uses the versioned RPC and gates non-fatal follow-up work", () => {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/scan-supplement-photos/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /\.rpc\(\s*"commit_photo_improvement"/u);
  assert.match(source, /expectedRevision/u);
  assert.match(source, /proposedRevision/u);
  assert.match(source, /transactionOutcome === "applied"/u);
  assert.match(source, /followUpWarnings/u);
  assert.doesNotMatch(source, /restoreCanonicalSnapshot/u);
  assert.doesNotMatch(source, /fetchProductActiveIngredientSnapshot/u);
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
  const { scanSupplementPhotos } = loadScanSupplementPhotosModule({
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  });

  await assert.rejects(
    () => scanSupplementPhotos({ barcode: "0123456789012" }),
    (error) => {
      assert.equal(error.category, "network_error");
      assert.equal(error.code, "network_error");
      return true;
    }
  );
});
