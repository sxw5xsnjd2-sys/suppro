import assert from "node:assert/strict";
import test from "node:test";

import {
  areOcrConfusableIngredientNames,
  buildOcrLineIngredientRowGroups,
  getAcceptedImageDoseCorrectionEvidenceRows,
  getAcceptedImageVerifiedEvidenceRows,
  parseStructuredTableIngredientRow,
  recoverImageVerifiedIngredients,
  recoverStructuredTableIngredients,
  verifyDoseAgainstWrappedOcr,
} from "../../supabase/functions/_shared/photo-extraction-completeness.js";

function ingredient(name, dosageValue, dosageUnit = "mg") {
  return {
    raw_name: name,
    canonical_name: name,
    ingredient_type: "active",
    dosage_value: dosageValue,
    dosage_unit: dosageValue === null ? null : dosageUnit,
    dosage_original_text:
      dosageValue === null ? null : `${name} ${dosageValue}${dosageUnit}`,
    chemical_form: null,
    amount_basis: "per_serving",
  };
}

test("structured table rows are parsed without relying on known ingredient names", () => {
  assert.deepEqual(
    parseStructuredTableIngredientRow("Botanical compound\t12.5 mg\t100% NRV"),
    {
      raw_name: "Botanical compound",
      canonical_name: "Botanical compound",
      ingredient_type: "active",
      dosage_value: 12.5,
      dosage_unit: "mg",
      dosage_original_text: "Botanical compound 12.5 mg 100% NRV",
      chemical_form: null,
      amount_basis: "per_serving",
    },
  );
});

test("a structured row with distinct compound and equivalent doses is not guessed", () => {
  assert.equal(
    parseStructuredTableIngredientRow(
      "Compound complex\t500 mg\tproviding active fraction 125 mg",
    ),
    null,
  );
});

test("structured table completeness appends omitted rows from a majority-overlapping table", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    tableRowGroups: [
      [
        "Ingredient\tAmount\tNRV",
        "Compound Alpha\t10 mg\t10%",
        "Compound Beta\t20 mg\t20%",
        "Compound Gamma\t30 mg\t30%",
        "Compound Delta\t40 mg\t40%",
        "Compound Epsilon\t50 mg\t50%",
      ],
    ],
  });

  assert.deepEqual(
    result.map((row) => [row.canonical_name, row.dosage_value, row.dosage_unit]),
    [
      ["Compound Alpha", 10, "mg"],
      ["Compound Beta", 20, "mg"],
      ["Compound Gamma", 30, "mg"],
      ["Compound Delta", 40, "mg"],
      ["Compound Epsilon", 50, "mg"],
    ],
  );
});

test("Azure OCR lines form generic direct and wrapped ingredient row groups", () => {
  assert.deepEqual(
    buildOcrLineIngredientRowGroups([
      "Supplement facts",
      "Compound Alpha 10 mg 10%",
      "Compound Beta",
      "20 mg 20% NRV",
      "Compound Gamma 30",
      "mg 30%",
      "Directions",
    ]),
    [
      [
        "Compound Alpha 10 mg 10%",
        "Compound Beta\t20 mg 20% NRV",
        "Compound Gamma 30 mg 30%",
      ],
    ],
  );
});

test("structured table completeness fills a missing dose on an existing row", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [
      ingredient("Compound Alpha", null),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    tableRowGroups: [
      [
        "Compound Alpha\t10 mg",
        "Compound Beta\t20 mg",
        "Compound Gamma\t30 mg",
      ],
    ],
  });

  assert.equal(result[0].dosage_value, 10);
  assert.equal(result[0].dosage_unit, "mg");
  assert.equal(result[0].dosage_original_text, "Compound Alpha 10 mg");
});

test("column-ordered OCR names and doses cannot validate a recovery group", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [ingredient("Compound Alpha", 10), ingredient("Compound Beta", 20)],
    tableRowGroups: [
      [
        "Compound Alpha\t30 mg",
        "Compound Beta\t10 mg",
        "Compound Gamma\t20 mg",
      ],
    ],
  });

  assert.deepEqual(result, [
    ingredient("Compound Alpha", 10),
    ingredient("Compound Beta", 20),
  ]);
});

test("unrelated nutrition-style tables are not promoted into ingredients", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [ingredient("Compound Alpha", 10)],
    tableRowGroups: [
      [
        "Nutrient\tAmount",
        "Compound Alpha\t10 mg",
        "Macronutrient One\t15 g",
        "Macronutrient Two\t8 g",
        "Macronutrient Three\t22 g",
        "Macronutrient Four\t3 g",
      ],
    ],
  });

  assert.deepEqual(result, [ingredient("Compound Alpha", 10)]);
});

test("conflicting structured rows remain model-led", () => {
  const result = recoverStructuredTableIngredients({
    ingredients: [ingredient("Compound Alpha", 10)],
    tableRowGroups: [
      [
        "Compound Alpha\t10 mg",
        "Compound Beta\t20 mg",
        "Compound Beta\t25 mg",
      ],
    ],
  });

  assert.deepEqual(result, [ingredient("Compound Alpha", 10)]);
});

test("image verification can append a small number of omitted ingredient rows", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Compound Gamma", 30),
    ],
    missingIngredients: [
      {
        ...ingredient("Compound Delta", 40),
        dosage_original_text: "Compound Delta 40 mg",
      },
      {
        ...ingredient("Compound Epsilon", 50),
        dosage_original_text: "Compound Epsilon 50 mg",
      },
    ],
  });

  assert.deepEqual(
    result.map((row) => [row.canonical_name, row.dosage_value, row.dosage_unit]),
    [
      ["Compound Alpha", 10, "mg"],
      ["Compound Beta", 20, "mg"],
      ["Compound Gamma", 30, "mg"],
      ["Compound Delta", 40, "mg"],
      ["Compound Epsilon", 50, "mg"],
    ],
  );
});

test("image completeness rejects a missing row whose declared dose conflicts with its visible row", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [ingredient("Compound Alpha", 10)],
    missingIngredients: [
      {
        ...ingredient("Compound Beta", 20),
        dosage_original_text: "Compound Beta 25 mg",
      },
    ],
  });

  assert.deepEqual(result, [ingredient("Compound Alpha", 10)]);
});

test("image completeness does not accept more missing rows than existing anchors", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [ingredient("Compound Alpha", 10), ingredient("Compound Beta", 20)],
    missingIngredients: [
      ingredient("Compound Gamma", 30),
      ingredient("Compound Delta", 40),
      ingredient("Compound Epsilon", 50),
    ],
  });

  assert.deepEqual(result, [
    ingredient("Compound Alpha", 10),
    ingredient("Compound Beta", 20),
  ]);
});

test("image verification replaces a same-dose OCR-confusable name instead of duplicating it", () => {
  const missingIngredients = [
    {
      ...ingredient("Ingredient Gamma", 30),
      dosage_original_text: "Ingredient Gamma 30 mg",
    },
  ];
  const result = recoverImageVerifiedIngredients({
    ingredients: [
      ingredient("Ingredient Alpha", 10),
      ingredient("Ingredient Beta", 20),
      ingredient("lngredient Gamma", 30),
    ],
    missingIngredients,
  });

  assert.deepEqual(
    result.map((row) => [row.canonical_name, row.dosage_value]),
    [
      ["Ingredient Alpha", 10],
      ["Ingredient Beta", 20],
      ["Ingredient Gamma", 30],
    ],
  );
  assert.deepEqual(
    getAcceptedImageVerifiedEvidenceRows({
      ingredients: result,
      missingIngredients,
    }),
    ["Ingredient Gamma 30 mg"],
  );
});

test("OCR-confusable matching is limited to one visual substitution", () => {
  assert.equal(
    areOcrConfusableIngredientNames("Ingredient Gamma", "lngredient Gamma"),
    true,
  );
  assert.equal(
    areOcrConfusableIngredientNames("Index Compound", "Andex Compound"),
    false,
  );
  assert.equal(
    areOcrConfusableIngredientNames("Silica", "Slllca"),
    false,
  );
});

test("same-dose image corrections can verify an OCR-confusable ingredient row", () => {
  const evidenceRows = getAcceptedImageDoseCorrectionEvidenceRows({
    ingredients: [ingredient("lngredient Gamma", 30)],
    corrections: [
      {
        index: 0,
        dosage_value: 30,
        dosage_unit: "mg",
        dosage_original_text: "Ingredient Gamma 30 mg",
      },
    ],
  });

  assert.deepEqual(
    evidenceRows,
    ["Ingredient Gamma 30 mg"],
  );
  assert.deepEqual(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Ingredient Gamma",
      rawDosageValue: 30,
      rawDosageUnit: "mg",
      dosageOriginalText: "Ingredient Gamma 30 mg",
      ocrText: ["lngredient Gamma 30 mg", ...evidenceRows].join("\n"),
    }),
    { confidence: "verified", reason: null },
  );
});

test("image correction evidence rejects a changed dose or unrelated name", () => {
  const ingredients = [ingredient("lngredient Gamma", 30)];

  assert.deepEqual(
    getAcceptedImageDoseCorrectionEvidenceRows({
      ingredients,
      corrections: [
        {
          index: 0,
          dosage_value: 35,
          dosage_unit: "mg",
          dosage_original_text: "Ingredient Gamma 35 mg",
        },
        {
          index: 0,
          dosage_value: 30,
          dosage_unit: "mg",
          dosage_original_text: "Different Compound 30 mg",
        },
      ],
    }),
    [],
  );
});

test("same-dose names with a non-confusable letter change remain distinct", () => {
  const result = recoverImageVerifiedIngredients({
    ingredients: [
      ingredient("Compound Alpha", 10),
      ingredient("Compound Beta", 20),
      ingredient("Index Compound", 30),
    ],
    missingIngredients: [ingredient("Andex Compound", 30)],
  });

  assert.deepEqual(
    result.map((row) => row.canonical_name),
    [
      "Compound Alpha",
      "Compound Beta",
      "Index Compound",
      "Andex Compound",
    ],
  );
});

test("dose verification accepts a dose-only wrapped continuation", () => {
  assert.deepEqual(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Compound Alpha",
      rawDosageValue: 250,
      rawDosageUnit: "mg",
      dosageOriginalText: "Compound Alpha 250 mg",
      ocrText: "Compound Alpha\n250 mg 100% NRV",
    }),
    { confidence: "verified", reason: null },
  );
});

test("dose verification accepts a generic form continuation before a wrapped dose", () => {
  assert.deepEqual(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Compound Alpha",
      rawDosageValue: 250,
      rawDosageUnit: "mg",
      dosageOriginalText: "Compound Alpha 250 mg",
      ocrText: "Compound Alpha\n(as dried extract)\n250 mg",
    }),
    { confidence: "verified", reason: null },
  );
});

test("dose verification does not borrow a dose from a neighbouring ingredient row", () => {
  assert.deepEqual(
    verifyDoseAgainstWrappedOcr({
      ingredientName: "Compound Alpha",
      rawDosageValue: 250,
      rawDosageUnit: "mg",
      dosageOriginalText: "Compound Alpha 250 mg",
      ocrText: "Compound Alpha\nDifferent Compound 250 mg",
    }),
    {
      confidence: "unverified",
      reason: "Extracted dose could not be verified against OCR text",
    },
  );
});
