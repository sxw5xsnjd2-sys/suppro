import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function extractExportedFunction(source, functionName) {
  const signature = `export function ${functionName}`;
  const start = source.indexOf(signature);

  if (start < 0) {
    throw new Error(`Could not find exported function ${functionName}`);
  }

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let end = -1;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }

  if (end < 0) {
    throw new Error(`Could not parse exported function ${functionName}`);
  }

  return source.slice(start, end);
}

function loadScanBenefitProgress() {
  const source = readFileSync(
    new URL("../../features/supplements/benefits.js", import.meta.url),
    "utf8"
  );
  const functionSource = extractExportedFunction(source, "getScanBenefitProgress")
    .replace("export function", "function");

  return new Function(`${functionSource}\nreturn getScanBenefitProgress;`)();
}

function loadCompareScanBenefits() {
  const source = readFileSync(
    new URL("../../features/supplements/benefits.js", import.meta.url),
    "utf8"
  );
  const getBenefitScoreSource = extractExportedFunction(source, "getBenefitScore")
    .replace("export function", "function");
  const getScanBenefitProgressSource = extractExportedFunction(
    source,
    "getScanBenefitProgress"
  ).replace("export function", "function");
  const getScanBenefitSortScoreSource = extractExportedFunction(
    source,
    "getScanBenefitSortScore"
  ).replace("export function", "function");
  const getScanBenefitDisplayScoreSource = extractExportedFunction(
    source,
    "getScanBenefitDisplayScore"
  ).replace("export function", "function");
  const compareScanBenefitsSource = extractExportedFunction(
    source,
    "compareScanBenefits"
  ).replace("export function", "function");

  return new Function(
    `${getBenefitScoreSource}\n${getScanBenefitProgressSource}\n${getScanBenefitSortScoreSource}\n${getScanBenefitDisplayScoreSource}\n${compareScanBenefitsSource}\nreturn compareScanBenefits;`
  )();
}

function loadProductDetailBenefitHelpers() {
  const source = readFileSync(
    new URL("../../features/supplements/benefits.js", import.meta.url),
    "utf8"
  );
  const functionNames = [
    "selectProductBenefitDriver",
    "getProductDetailBenefitDriver",
    "getProductDetailBenefitContributors",
    "getProductDetailBenefitScore",
    "getProductDetailBenefitAccessibilityLabel",
    "compareProductDetailBenefits",
  ];
  const functionSources = functionNames.map((functionName) =>
    extractExportedFunction(source, functionName).replace(
      "export function",
      "function"
    )
  );
  const canonicalContract = loadProductBenefitContract();
  const factory = new Function(
    "selectCanonicalProductBenefitDriver",
    `${functionSources.join("\n")}
return { getProductDetailBenefitDriver, getProductDetailBenefitContributors, getProductDetailBenefitScore, getProductDetailBenefitAccessibilityLabel, compareProductDetailBenefits };`
  );

  return factory(canonicalContract.selectProductBenefitDriver);
}

function loadProductBenefitContract() {
  const source = readFileSync(
    new URL(
      "../../features/supplements/productBenefitScoring.js",
      import.meta.url,
    ),
    "utf8"
  );
  const contractSource = source
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ");

  return new Function(
    `${contractSource}\nreturn { calculateProductBenefitScore, formatProductBenefitScoreText, formatProductBenefitScoreValue, getProductBenefitScoreProgress, selectProductBenefitDriver };`
  )();
}

const getScanBenefitProgress = loadScanBenefitProgress();
const compareScanBenefits = loadCompareScanBenefits();
const {
  calculateProductBenefitScore,
  formatProductBenefitScoreText,
  formatProductBenefitScoreValue,
  getProductBenefitScoreProgress,
  selectProductBenefitDriver,
} = loadProductBenefitContract();
const {
  compareProductDetailBenefits,
  getProductDetailBenefitAccessibilityLabel,
  getProductDetailBenefitContributors,
  getProductDetailBenefitDriver,
  getProductDetailBenefitScore,
} = loadProductDetailBenefitHelpers();

test("calculates a full-precision canonical product-benefit score", () => {
  const score = calculateProductBenefitScore({
    rawActiveIngredientBenefitScore: 80,
    validatedDoseFactor: 0.75,
    doseComparisonStatus: "below_effective_min",
    doseComparisonValid: true,
  });

  assert.equal(score, 60);
  assert.equal(
    calculateProductBenefitScore({
      rawActiveIngredientBenefitScore: 83.333,
      validatedDoseFactor: 0.7333,
      doseComparisonStatus: "effective_below_target",
      doseComparisonValid: true,
    }),
    83.333 * 0.7333
  );
});

test("clamps canonical product-benefit scores to 0-100", () => {
  assert.equal(
    calculateProductBenefitScore({
      rawActiveIngredientBenefitScore: 120,
      validatedDoseFactor: 2,
      doseComparisonStatus: "within_target_range",
      doseComparisonValid: true,
    }),
    100
  );
  assert.equal(
    calculateProductBenefitScore({
      rawActiveIngredientBenefitScore: -20,
      validatedDoseFactor: 1,
      doseComparisonStatus: "within_target_range",
      doseComparisonValid: true,
    }),
    0
  );
});

test("rejects missing and incomparable dose comparisons despite neutral factors", () => {
  for (const doseComparisonStatus of [
    "missing_actual_dose",
    "missing_dose_scoring_profile",
    "unit_mismatch",
    "unknown_amount_basis",
    "serving_size_unparseable",
  ]) {
    assert.equal(
      calculateProductBenefitScore({
        rawActiveIngredientBenefitScore: 80,
        validatedDoseFactor: 1,
        doseComparisonStatus,
        doseComparisonValid: false,
      }),
      null
    );
  }
});

test("formats rounded score text and derives progress from the score", () => {
  assert.equal(formatProductBenefitScoreText(60.49), "60/100");
  assert.equal(getProductBenefitScoreProgress(60.49), 0.6049);
  assert.equal(formatProductBenefitScoreText(72.49), "72/100");
  assert.equal(formatProductBenefitScoreValue(72.49), "72");
  assert.equal(getProductBenefitScoreProgress(72.49), 0.7249);
  assert.equal(formatProductBenefitScoreText(72.5), "73/100");
  assert.equal(formatProductBenefitScoreValue(72.5), "73");
  assert.equal(getProductBenefitScoreProgress(72.5), 0.725);
  assert.equal(formatProductBenefitScoreText(null), null);
  assert.equal(formatProductBenefitScoreValue(null), null);
  assert.equal(getProductBenefitScoreProgress(null), null);
});

test("product detail derives score, driver, ordering, and accessibility from the canonical driver", () => {
  const higherFullPrecisionScore = {
    label: "Sleep support",
    productBenefitDrivers: [
      {
        canonicalIngredientId: "magnesium",
        ingredientName: "Magnesium",
        hasBenefitStudy: true,
      },
      {
        canonicalIngredientId: "calcium",
        ingredientName: "Calcium",
        benefitEvidenceSourceUrls: ["https://example.test/calcium"],
      },
      {
        canonicalIngredientId: "manganese",
        ingredientName: "Manganese",
        hasBenefitStudy: true,
      },
      {
        canonicalIngredientId: "unsupported",
        ingredientName: "Unsupported ingredient",
        hasBenefitStudy: false,
      },
    ],
    productBenefitDriver: {
      canonicalIngredientId: "magnesium",
      ingredientName: "Magnesium",
      rawActiveIngredientBenefitScore: 100,
      validatedDoseFactor: 0.725,
      doseComparisonStatus: "below_effective_min",
      doseComparisonValid: true,
      hasBenefitStudy: true,
    },
  };
  const lowerRoundedTie = {
    label: "Stress relief",
    productBenefitDriver: {
      canonicalIngredientId: "theanine",
      ingredientName: "L-Theanine",
      rawActiveIngredientBenefitScore: 100,
      validatedDoseFactor: 0.7249,
      doseComparisonStatus: "below_effective_min",
      doseComparisonValid: true,
    },
  };

  assert.equal(getProductDetailBenefitScore(higherFullPrecisionScore), 72.5);
  assert.equal(
    getProductDetailBenefitDriver(higherFullPrecisionScore).ingredientName,
    "Magnesium"
  );
  assert.equal(
    getProductDetailBenefitAccessibilityLabel(higherFullPrecisionScore),
    "Sleep support, 73 out of 100, supported by Magnesium, Calcium, Manganese"
  );
  assert.deepEqual(
    getProductDetailBenefitContributors(higherFullPrecisionScore).map(
      (contributor) => contributor.ingredientName
    ),
    ["Magnesium", "Calcium", "Manganese"]
  );
  assert.ok(
    compareProductDetailBenefits(
      higherFullPrecisionScore,
      lowerRoundedTie
    ) < 0
  );
});

test("product detail fails closed for a neutral missing-dose factor", () => {
  const benefit = {
    label: "Sleep support",
    productBenefitDriver: {
      canonicalIngredientId: "magnesium",
      ingredientName: "Magnesium",
      rawActiveIngredientBenefitScore: 90,
      validatedDoseFactor: 1,
      doseComparisonStatus: "missing_actual_dose",
      doseComparisonValid: false,
    },
  };

  assert.equal(getProductDetailBenefitDriver(benefit), null);
  assert.equal(getProductDetailBenefitScore(benefit), null);
  assert.equal(
    getProductDetailBenefitAccessibilityLabel(benefit),
    "Sleep support, not rated"
  );
});

test("selects the highest valid product-benefit ingredient driver", () => {
  const winner = selectProductBenefitDriver([
    {
      canonicalIngredientId: "invalid-high",
      ingredientName: "Invalid high",
      rawActiveIngredientBenefitScore: 99,
      validatedDoseFactor: null,
      doseComparisonStatus: "missing_actual_dose",
      doseComparisonValid: false,
    },
    {
      canonicalIngredientId: "valid-lower",
      ingredientName: "Valid lower",
      rawActiveIngredientBenefitScore: 80,
      validatedDoseFactor: 0.75,
      doseComparisonStatus: "below_effective_min",
      doseComparisonValid: true,
    },
    {
      canonicalIngredientId: "valid-winner",
      ingredientName: "Valid winner",
      rawActiveIngredientBenefitScore: 70,
      validatedDoseFactor: 0.9,
      doseComparisonStatus: "effective_below_target",
      doseComparisonValid: true,
    },
  ]);

  assert.deepEqual(winner, {
    canonicalIngredientId: "valid-winner",
    ingredientName: "Valid winner",
    rawActiveIngredientBenefitScore: 70,
    validatedDoseFactor: 0.9,
    doseComparisonStatus: "effective_below_target",
    doseComparisonValid: true,
    productBenefitScore: 63,
  });
});

test("resolves exact driver ties deterministically", () => {
  const base = {
    rawActiveIngredientBenefitScore: 80,
    validatedDoseFactor: 0.75,
    doseComparisonStatus: "below_effective_min",
    doseComparisonValid: true,
  };
  const winner = selectProductBenefitDriver([
    {
      ...base,
      canonicalIngredientId: "z-id",
      ingredientName: "  Beta   Ingredient ",
    },
    {
      ...base,
      canonicalIngredientId: "b-id",
      ingredientName: "Alpha Ingredient",
    },
    {
      ...base,
      canonicalIngredientId: "a-id",
      ingredientName: "alpha ingredient",
    },
  ]);

  assert.equal(winner.canonicalIngredientId, "a-id");
});

test("resolves product-score ties by raw score then validated factor", () => {
  const common = {
    doseComparisonStatus: "within_target_range",
    doseComparisonValid: true,
  };
  const rawScoreWinner = selectProductBenefitDriver([
    {
      ...common,
      canonicalIngredientId: "lower-raw",
      ingredientName: "Lower raw",
      rawActiveIngredientBenefitScore: 60,
      validatedDoseFactor: 1,
    },
    {
      ...common,
      canonicalIngredientId: "higher-raw",
      ingredientName: "Higher raw",
      rawActiveIngredientBenefitScore: 80,
      validatedDoseFactor: 0.75,
    },
  ]);
  const factorWinner = selectProductBenefitDriver([
    {
      ...common,
      canonicalIngredientId: "lower-factor",
      ingredientName: "Lower factor",
      rawActiveIngredientBenefitScore: 100,
      validatedDoseFactor: 1,
    },
    {
      ...common,
      canonicalIngredientId: "higher-factor",
      ingredientName: "Higher factor",
      rawActiveIngredientBenefitScore: 100,
      validatedDoseFactor: 1.2,
    },
  ]);

  assert.equal(rawScoreWinner.canonicalIngredientId, "higher-raw");
  assert.equal(factorWinner.canonicalIngredientId, "higher-factor");
});

test("fills the full pill for a first-ranked ingredient at target dose", () => {
  assert.equal(getScanBenefitProgress({ rank: 1, total: 8 }, 1), 1);
});

test("partially fills the pill for a lower-ranked ingredient at target dose", () => {
  assert.equal(getScanBenefitProgress({ rank: 3, total: 8 }, 1), 0.75);
});

test("reduces the fill for an underdosed top-ranked ingredient", () => {
  assert.equal(getScanBenefitProgress({ rank: 1, total: 8 }, 0.75), 0.75);
});

test("orders scanned benefits by effective scored support from high to low", () => {
  const benefits = [
    {
      label: "Sleep support",
      scanSupportDriver: {
        productBenefitScore: 72,
        benefitScore: 80,
        doseFactor: 0.9,
      },
    },
    {
      label: "Stress relief",
      scanSupportDriver: {
        productBenefitScore: 70,
        benefitScore: 70,
        doseFactor: 1,
      },
    },
    {
      label: "Skin health",
      scanSupportDriver: {
        productBenefitScore: 48,
        benefitScore: 60,
        doseFactor: 0.8,
      },
    },
  ];

  benefits.sort(compareScanBenefits);

  assert.deepEqual(
    benefits.map((benefit) => benefit.label),
    ["Sleep support", "Stress relief", "Skin health"]
  );
});

test("orders scanned benefits by visible bar fill when ranking data is available", () => {
  const lowerWeightedButFullBar = {
    label: "Stress relief",
    scanSupportDriver: {
      benefitScore: 70,
      doseFactor: 1,
    },
  };
  const higherWeightedButWeakBar = {
    label: "Sleep support",
    scanSupportDriver: {
      benefitScore: 80,
      doseFactor: 1,
    },
  };

  const comparison = compareScanBenefits(
    lowerWeightedButFullBar,
    higherWeightedButWeakBar,
    { rank: 1, total: 3 },
    { rank: 8, total: 10 }
  );

  assert.ok(comparison < 0);
});
