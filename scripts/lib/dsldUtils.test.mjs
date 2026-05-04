import assert from "node:assert/strict";
import test from "node:test";

import {
  flattenIngredientRows,
  partitionDsldIngredientRows,
} from "./dsldUtils.mjs";

test("partitionDsldIngredientRows keeps only melatonin active for Natrol sample", () => {
  const natrolRows = flattenIngredientRows([
    {
      name: "Calories",
      category: "other",
      quantity: [{ quantity: 10, unit: "Calorie(s)", servingSizeQuantity: 1, servingSizeUnit: "Gummy(ies)" }],
      nestedRows: [],
    },
    {
      name: "Total Carbohydrates",
      category: "sugar",
      quantity: [{ quantity: 2, unit: "Gram(s)", servingSizeQuantity: 1, servingSizeUnit: "Gummy(ies)" }],
      nestedRows: [
        {
          name: "Total Sugars",
          category: "sugar",
          quantity: [{ quantity: 1, unit: "Gram(s)", servingSizeQuantity: 1, servingSizeUnit: "Gummy(ies)" }],
          nestedRows: [
            {
              name: "Added Sugars",
              category: "sugar",
              quantity: [{ quantity: 1, unit: "Gram(s)", servingSizeQuantity: 1, servingSizeUnit: "Gummy(ies)" }],
              nestedRows: [],
            },
          ],
        },
      ],
    },
    {
      name: "Melatonin",
      category: "hormone",
      quantity: [{ quantity: 5, unit: "mg", servingSizeQuantity: 1, servingSizeUnit: "Gummy(ies)" }],
      nestedRows: [],
    },
  ]);

  const partitioned = partitionDsldIngredientRows(natrolRows);

  assert.deepEqual(
    partitioned.active_supplement_ingredients.map((row) => row.name),
    ["Melatonin"]
  );
  assert.deepEqual(
    partitioned.active_ingredients_with_disclosed_dose.map((row) => row.name),
    ["Melatonin"]
  );
  assert.equal(partitioned.active_ingredients_without_disclosed_dose.length, 0);
  assert.equal(partitioned.proprietary_blend_rows.length, 0);
  assert.deepEqual(
    partitioned.nutrition_facts_rows.map((row) => row.name),
    ["Calories", "Total Carbohydrates", "Total Sugars", "Added Sugars"]
  );
  assert.equal(partitioned.other_or_excluded_rows.length, 0);
});

test("partitionDsldIngredientRows separates proprietary blends and NP child ingredients", () => {
  const musclePharmRows = flattenIngredientRows([
    {
      name: "Calories",
      category: "other",
      quantity: [{ quantity: 10, unit: "Calorie(s)", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [],
    },
    {
      name: "Total Carbohydrates",
      category: "sugar",
      quantity: [{ quantity: 2, unit: "Gram(s)", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [
        {
          name: "Sugar",
          category: "sugar",
          quantity: [{ quantity: 2, unit: "Gram(s)", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
          nestedRows: [],
        },
      ],
    },
    {
      name: "Sodium",
      category: "mineral",
      quantity: [{ quantity: 50, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [],
    },
    {
      name: "Vitamin C",
      category: "vitamin",
      quantity: [{ quantity: 500, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [],
    },
    {
      name: "Vitamin B6",
      category: "vitamin",
      quantity: [{ quantity: 15, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [],
    },
    {
      name: "Vitamin B12",
      category: "vitamin",
      quantity: [{ quantity: 90, unit: "mcg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [],
    },
    {
      name: "Calcium",
      category: "mineral",
      quantity: [{ quantity: 213, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [],
    },
    {
      name: "ATP Amplifier",
      category: "blend",
      quantity: [{ quantity: 3500, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [
        {
          name: "CarnoSyn",
          category: "amino acid",
          quantity: [{ quantity: 2000, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
          nestedRows: [],
        },
        {
          name: "L-Tyrosine",
          category: "amino acid",
          quantity: [{ quantity: 0, unit: "NP", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
          nestedRows: [],
        },
        {
          name: "Red Beet extract",
          category: "botanical",
          quantity: [{ quantity: 0, unit: "NP", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
          nestedRows: [],
        },
      ],
    },
    {
      name: "Cellular Transport & Insulin Activator",
      category: "blend",
      quantity: [{ quantity: 2952, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [],
    },
    {
      name: "Athlete Performance Blend",
      category: "blend",
      quantity: [{ quantity: 2000, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [
        {
          name: "CreNitrate",
          category: "non-nutrient/non-botanical",
          quantity: [{ quantity: 0, unit: "NP", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
          nestedRows: [],
        },
      ],
    },
    {
      name: "Energy & Neuro Igniter",
      category: "blend",
      quantity: [{ quantity: 1750, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [
        {
          name: "Choline Bitartrate",
          category: "vitamin",
          quantity: [{ quantity: 0, unit: "NP", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
          nestedRows: [],
        },
        {
          name: "Huperzine A",
          category: "non-nutrient/non-botanical",
          quantity: [{ quantity: 0, unit: "NP", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
          nestedRows: [],
        },
      ],
    },
    {
      name: "Hydration System",
      category: "blend",
      quantity: [{ quantity: 1200, unit: "mg", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
      nestedRows: [
        {
          name: "Taurine",
          category: "non-nutrient/non-botanical",
          quantity: [{ quantity: 0, unit: "NP", servingSizeQuantity: 14.5, servingSizeUnit: "Gram(s)" }],
          nestedRows: [],
        },
      ],
    },
  ]);

  const partitioned = partitionDsldIngredientRows(musclePharmRows);

  assert.deepEqual(
    partitioned.nutrition_facts_rows.map((row) => row.name),
    ["Calories", "Total Carbohydrates", "Sugar", "Sodium"]
  );

  assert.deepEqual(
    partitioned.proprietary_blend_rows.map((row) => row.name),
    [
      "ATP Amplifier",
      "Cellular Transport & Insulin Activator",
      "Athlete Performance Blend",
      "Energy & Neuro Igniter",
      "Hydration System",
    ]
  );

  assert.deepEqual(
    partitioned.active_ingredients_without_disclosed_dose.map((row) => row.name),
    [
      "L-Tyrosine",
      "Red Beet extract",
      "CreNitrate",
      "Choline Bitartrate",
      "Huperzine A",
      "Taurine",
    ]
  );
  assert.ok(
    partitioned.active_ingredients_without_disclosed_dose.every(
      (row) => row.dose_status === "not_disclosed"
    )
  );
  assert.ok(
    partitioned.active_ingredients_without_disclosed_dose.every(
      (row) => row.amount_per_serving_numeric === 0
    )
  );

  assert.deepEqual(
    partitioned.active_ingredients_with_disclosed_dose.map((row) => row.name),
    ["Vitamin C", "Vitamin B6", "Vitamin B12", "Calcium", "CarnoSyn"]
  );
  assert.ok(
    partitioned.active_ingredients_with_disclosed_dose.every(
      (row) => row.dose_status === "disclosed"
    )
  );
  assert.ok(
    partitioned.active_ingredients_with_disclosed_dose.every(
      (row) => row.amount_per_serving_numeric > 0
    )
  );
});
