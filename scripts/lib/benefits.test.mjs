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

const getScanBenefitProgress = loadScanBenefitProgress();
const compareScanBenefits = loadCompareScanBenefits();

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
        benefitScore: 80,
        doseFactor: 0.9,
      },
    },
    {
      label: "Stress relief",
      scanSupportDriver: {
        benefitScore: 70,
        doseFactor: 1,
      },
    },
    {
      label: "Skin health",
      scanSupportDriver: {
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
