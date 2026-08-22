import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function loadDoseNormalization() {
  const source = readFileSync(
    new URL(
      "../../features/supplements/doseNormalization.js",
      import.meta.url,
    ),
    "utf8",
  );
  return import(
    `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`
  );
}

const {
  getDoseUnavailableStatusLabel,
  normalizeDoseUnit,
  normalizeIngredientDose,
  parseCfuDoseText,
  parseDoseText,
  resolveNormalizedDosePresentation,
} = await loadDoseNormalization();

const exactCfuCases = [
  ["1 billion CFU", 1_000_000_000, "1 billion CFU"],
  ["39.5 billion CFU", 39_500_000_000, "39.5 billion CFU"],
  ["1.5 trillion CFU", 1_500_000_000_000, "1.5 trillion CFU"],
  ["1.25 million CFU", 1_250_000, "1.25 million CFU"],
  ["10 billion CFU", 10_000_000_000, "10 billion CFU"],
  ["10 Billion CFU", 10_000_000_000, "10 billion CFU"],
  ["10bn CFU", 10_000_000_000, "10 billion CFU"],
  ["10 B CFU", 10_000_000_000, "10 billion CFU"],
  ["10,000,000,000 CFU", 10_000_000_000, "10 billion CFU"],
  ["1 × 10^10 CFU", 10_000_000_000, "10 billion CFU"],
  ["1 x 10^10 CFU", 10_000_000_000, "10 billion CFU"],
  ["1e10 CFU", 10_000_000_000, "10 billion CFU"],
  ["500 million CFU", 500_000_000, "500 million CFU"],
  ["500m CFU", 500_000_000, "500 million CFU"],
  ["CFU 10 billion", 10_000_000_000, "10 billion CFU"],
  [
    "10 billion colony forming units",
    10_000_000_000,
    "10 billion CFU",
  ],
  ["10 billion viable organisms", 10_000_000_000, "10 billion CFU"],
  ["10 billion live cultures", 10_000_000_000, "10 billion CFU"],
  [
    "10 billion CFU at time of manufacture",
    10_000_000_000,
    "10 billion CFU",
  ],
  [
    "5 billion CFU guaranteed through expiry",
    5_000_000_000,
    "5 billion CFU",
  ],
];

test("normalizes supported probiotic CFU formats to a numeric canonical dose", () => {
  exactCfuCases.forEach(([source, expectedValue, expectedDisplay]) => {
    const parsed = parseCfuDoseText(source);
    assert.equal(parsed?.value, expectedValue, source);
    assert.equal(parsed?.unit, "CFU", source);
    assert.equal(parsed?.displayText, expectedDisplay, source);
  });
});

test("reconciles structured CFU coefficients with label multipliers and remains idempotent", () => {
  const fixtures = [
    {
      ingredientName: "Streptococcus thermophilus",
      dosageValue: 1,
      dosageOriginalText: "Streptococcus thermophilus — 1 billion CFU",
      expectedValue: 1_000_000_000,
      expectedDisplay: "1 billion CFU",
      expectedCoefficient: 1,
      expectedMultiplier: 1_000_000_000,
    },
    {
      ingredientName: "Lactobacillus acidophilus",
      dosageValue: 39.5,
      dosageOriginalText: "Lactobacillus acidophilus — 39.5 billion CFU",
      expectedValue: 39_500_000_000,
      expectedDisplay: "39.5 billion CFU",
      expectedCoefficient: 39.5,
      expectedMultiplier: 1_000_000_000,
    },
  ];

  fixtures.forEach((fixture) => {
    const normalized = normalizeIngredientDose({
      ...fixture,
      dosageUnit: "CFU",
      amountBasis: "per_serving",
      doseConfidence: "verified",
    });

    assert.equal(normalized.value, fixture.expectedValue);
    assert.equal(normalized.displayText, fixture.expectedDisplay);
    assert.equal(normalized.cfuCoefficient, fixture.expectedCoefficient);
    assert.equal(normalized.cfuMultiplierToken, "billion");
    assert.equal(normalized.cfuMultiplierValue, fixture.expectedMultiplier);
    assert.equal(Number.isSafeInteger(normalized.value), true);
    assert.notEqual(normalized.displayText, `${fixture.dosageValue} CFU`);

    const secondPass = normalizeIngredientDose(normalized);
    assert.equal(secondPass.value, normalized.value);
    assert.equal(secondPass.unit, normalized.unit);
    assert.equal(secondPass.displayText, normalized.displayText);
    assert.equal(secondPass.amountBasis, normalized.amountBasis);
    assert.equal(secondPass.dosageOriginalText, normalized.dosageOriginalText);
  });
});

test("recovers an unclosed probiotic dose wrapper without losing identity or magnitude", () => {
  const originalText = "Lactobacilus casei (1.5 Billion CFU";
  const normalized = normalizeIngredientDose({
    ingredientName: originalText,
    amountBasis: "per_serving",
    doseConfidence: "verified",
  });

  assert.equal(normalized.ingredientName, "Lactobacillus casei");
  assert.equal(normalized.value, 1_500_000_000);
  assert.equal(normalized.unit, "CFU");
  assert.equal(normalized.displayText, "1.5 billion CFU");
  assert.equal(normalized.dosageOriginalText, originalText);
});

test("normalizes CFU bases and preserves a conservative range", () => {
  const perCapsule = parseCfuDoseText("10 billion CFU per capsule");
  assert.equal(perCapsule?.amountBasis, "per_capsule");

  const perTwoCapsules = parseCfuDoseText("20 billion CFU per 2 capsules");
  assert.equal(perTwoCapsules?.value, 20_000_000_000);
  assert.equal(perTwoCapsules?.amountBasis, "per_serving");

  const perServing = parseCfuDoseText("10 billion CFU per serving");
  assert.equal(perServing?.amountBasis, "per_serving");

  const range = parseCfuDoseText("10–20 billion CFU");
  assert.equal(range?.value, 10_000_000_000);
  assert.equal(range?.maxValue, 20_000_000_000);
  assert.equal(range?.displayText, "10–20 billion CFU");
});

test("rejects malformed or ambiguous CFU values instead of guessing", () => {
  [
    "ten billion CFU",
    "1 x 10^ CFU",
    "10,00,000 CFU",
    "10 billion",
    "CFU billion",
    "20–10 billion CFU",
    "10 billion CFU at manufacture, 5 billion CFU at expiry",
  ].forEach((source) => assert.equal(parseCfuDoseText(source), null, source));
});

test("normalizes CFU aliases and hydrates a readable verified dose", () => {
  [
    "CFU",
    "cfu",
    "colony forming unit",
    "colony forming units",
    "viable organism",
    "viable organisms",
    "live culture",
    "live cultures",
  ].forEach((unit) => assert.equal(normalizeDoseUnit(unit), "CFU", unit));

  const normalized = normalizeIngredientDose({
    dosageValue: "10000000000",
    dosageUnit: "colony forming units",
    dosageOriginalText: "Probiotic blend 10 billion colony forming units",
    amountBasis: "per_serving",
    doseConfidence: "verified",
  });

  assert.equal(normalized.value, 10_000_000_000);
  assert.equal(normalized.unit, "CFU");
  assert.equal(normalized.displayText, "10 billion CFU");
  assert.equal(
    normalized.dosageOriginalText,
    "Probiotic blend 10 billion colony forming units",
  );
  assert.equal(normalized.isScoringEligible, true);
});

test("display-only CFU text enters the normalized contract without mass conversion", () => {
  const normalized = normalizeIngredientDose(
    {
      dosageDisplay: "10 billion CFU per capsule",
      doseConfidence: "verified",
    },
    { allowDisplayParsing: true },
  );

  assert.equal(normalized.value, 10_000_000_000);
  assert.equal(normalized.unit, "CFU");
  assert.equal(normalized.amountBasis, "per_capsule");
  assert.equal(normalized.displayText, "10 billion CFU");
  assert.notEqual(normalized.unit, "mg");
});

test("dose status wording distinguishes parsing, verification, comparison, and absence", () => {
  [
    "dose_could_not_be_parsed",
    "missing_dose_value",
    "missing_dose_unit",
    "unsupported_dose_unit",
  ].forEach((reason) => {
    assert.equal(
      getDoseUnavailableStatusLabel(reason),
      "Dose could not be analysed",
      reason,
    );
  });

  assert.equal(
    getDoseUnavailableStatusLabel("dose_not_verified"),
    "Dose not verified",
  );
  [
    "missing_amount_basis",
    "unsupported_amount_basis",
    "serving_size_unparseable",
    "unit_mismatch",
  ].forEach((reason) => {
    assert.equal(
      getDoseUnavailableStatusLabel(reason),
      "Dose comparison unavailable",
      reason,
    );
  });

  assert.equal(
    getDoseUnavailableStatusLabel("missing_dose_information"),
    "Dose unavailable",
  );
  assert.equal(
    getDoseUnavailableStatusLabel("missing_actual_dose"),
    "Dose unavailable",
  );
});

const supportedEmbeddedDoseCases = [
  ["Vitamin C 500 mg", "Vitamin C", 500, "mg", "500 mg"],
  ["Vitamin D3 1000 IU", "Vitamin D3", 1000, "IU", "1000 IU"],
  ["Vitamin B12 500 μg", "Vitamin B12", 500, "mcg", "500 mcg"],
  ["Folate 400 ug", "Folate", 400, "mcg", "400 mcg"],
  ["Fish oil 1 g", "Fish oil", 1, "g", "1 g"],
  ["Liquid extract 5 mL", "Liquid extract", 5, "ml", "5 ml"],
  ["Lactase 3000 FCC", "Lactase", 3000, "FCC", "3000 FCC"],
  ["Protease 5000 HUT", "Protease", 5000, "HUT", "5000 HUT"],
  ["Amylase 1200 DU", "Amylase", 1200, "DU", "1200 DU"],
  ["Lipase 100 FIP", "Lipase", 100, "FIP", "100 FIP"],
  [
    "Alpha-galactosidase 400 ALU",
    "Alpha-galactosidase",
    400,
    "ALU",
    "400 ALU",
  ],
  ["Bromelain 2400 GDU", "Bromelain", 2400, "GDU", "2400 GDU"],
  ["Papain 6000 PU", "Papain", 6000, "PU", "6000 PU"],
];

test("all supported embedded dose units share one display and status contract", () => {
  supportedEmbeddedDoseCases.forEach(
    ([source, ingredientName, value, unit, displayText]) => {
      const normalized = normalizeIngredientDose({
        ingredientName: source,
        amountBasis: "per_serving",
        doseConfidence: "verified",
      });

      assert.equal(normalized.ingredientName, ingredientName, source);
      assert.equal(normalized.value, value, source);
      assert.equal(normalized.unit, unit, source);
      assert.equal(normalized.displayText, displayText, source);
      assert.equal(normalized.presentation.displayText, displayText, source);
      assert.notEqual(
        normalized.presentation.statusLabel,
        "Dose could not be analysed",
        source,
      );
      assert.equal(normalized.isScoringEligible, true, source);
    },
  );
});

test("embedded parsing preserves identifier numbers and punctuation", () => {
  [
    ["Vitamin B12 500 mcg", "Vitamin B12"],
    ["CoQ10 100 mg", "CoQ10"],
    ["Omega-3 1 g", "Omega-3"],
    [
      "Lactobacillus acidophilus LA-14 10 billion CFU per capsule",
      "Lactobacillus acidophilus LA-14",
    ],
    ["Bifidobacterium lactis HN019 1 billion CFU", "Bifidobacterium lactis HN019"],
    [
      "Bacillus coagulans GBI-30, 6086 2 billion CFU",
      "Bacillus coagulans GBI-30, 6086",
    ],
  ].forEach(([source, expectedName]) => {
    const parsed = parseDoseText(source);
    assert.equal(parsed?.ingredientName, expectedName, source);
  });
});

test("embedded splitting accepts dose qualifiers but rejects non-trailing ambiguity", () => {
  const qualified = normalizeIngredientDose({
    ingredientName: "Vitamin C 500 mg (as ascorbic acid)",
    amountBasis: "per_serving",
    doseConfidence: "verified",
  });
  assert.equal(qualified.ingredientName, "Vitamin C");
  assert.equal(qualified.displayText, "500 mg");
  assert.equal(
    qualified.dosageOriginalText,
    "Vitamin C 500 mg (as ascorbic acid)",
  );

  const ambiguous = normalizeIngredientDose({
    ingredientName: "Formula 500 mg complex",
  });
  assert.equal(ambiguous.ingredientName, "Formula 500 mg complex");
  assert.equal(ambiguous.parsedFromIngredientName, false);
  assert.equal(ambiguous.displayText, null);
});

test("ranges, scientific notation, multiplier forms, and dose bases normalize safely", () => {
  const range = parseDoseText("Vitamin D3 1000–2000 IU per daily dose");
  assert.equal(range?.ingredientName, "Vitamin D3");
  assert.equal(range?.value, 1000);
  assert.equal(range?.maxValue, 2000);
  assert.equal(range?.amountBasis, "per_daily_dose");
  assert.equal(range?.displayText, "1000–2000 IU");

  assert.equal(parseDoseText("Vitamin B12 1e3 mcg")?.value, 1000);
  assert.equal(parseDoseText("Vitamin B12 1e-3 g")?.value, 0.001);
  assert.equal(parseDoseText("Magnesium 0,5 mg")?.value, 0.5);
  assert.equal(parseDoseText("Probiotic blend 2 billion CFU")?.value, 2e9);
  assert.equal(
    parseDoseText("Probiotic blend 5 billion CFU per 2 capsules")?.amountBasis,
    "per_serving",
  );
  assert.equal(parseDoseText("Liquid extract 2 ml per drop")?.amountBasis, "per_drop");
});

test("every supported label basis is inferred without changing the dose", () => {
  [
    ["per serving", "per_serving"],
    ["per capsule", "per_capsule"],
    ["per tablet", "per_tablet"],
    ["per softgel", "per_softgel"],
    ["per scoop", "per_scoop"],
    ["per drop", "per_drop"],
    ["per daily dose", "per_daily_dose"],
    ["per 2 capsules", "per_serving"],
    ["per 3 tablets", "per_serving"],
  ].forEach(([labelBasis, expectedBasis]) => {
    const parsed = parseDoseText(`Magnesium 200 mg ${labelBasis}`);
    assert.equal(parsed?.ingredientName, "Magnesium", labelBasis);
    assert.equal(parsed?.value, 200, labelBasis);
    assert.equal(parsed?.amountBasis, expectedBasis, labelBasis);
  });
});

test("a structured dose can never be presented as a parsing failure", () => {
  const verifiedUnknownBasis = normalizeIngredientDose({
    ingredientName: "Magnesium",
    dosageValue: 200,
    dosageUnit: "mg",
    amountBasis: "unknown",
    doseConfidence: "verified",
  });
  assert.equal(verifiedUnknownBasis.displayText, "200 mg");
  assert.equal(
    verifiedUnknownBasis.presentation.statusLabel,
    "Dose comparison unavailable",
  );

  const unverified = normalizeIngredientDose({
    ingredientName: "Magnesium 200 mg",
    amountBasis: "per_serving",
    doseConfidence: "unverified",
  });
  assert.equal(unverified.displayText, "200 mg");
  assert.equal(unverified.presentation.statusLabel, "Dose not verified");
  assert.equal(unverified.isScoringEligible, false);

  [verifiedUnknownBasis, unverified].forEach((normalized) => {
    const presentation = resolveNormalizedDosePresentation(normalized);
    assert.notEqual(presentation.statusLabel, "Dose could not be analysed");
    assert.equal(presentation.contradictionDetected, false);
  });
});

test("malformed dose text is analysed while absent dose information is unavailable", () => {
  const malformed = normalizeIngredientDose({
    ingredientName: "Magnesium",
    dosageOriginalText: "about two hundred milligrams",
  });
  assert.equal(malformed.displayText, null);
  assert.equal(malformed.presentation.statusLabel, "Dose could not be analysed");

  const absent = normalizeIngredientDose({ ingredientName: "Magnesium" });
  assert.equal(absent.displayText, null);
  assert.equal(absent.presentation.statusLabel, "Dose unavailable");

  [
    { dosageOriginalText: "" },
    { dosageOriginalText: "-" },
    { dosageDisplay: "not available" },
    { dosageValue: "missing", dosageUnit: "unknown" },
    {
      dosageOriginalText: "Lactobacillus acidophilus LA-14",
      doseConfidence: "unverified",
    },
  ].forEach((doseFields) => {
    const normalized = normalizeIngredientDose({
      ingredientName: "Lactobacillus acidophilus LA-14",
      ...doseFields,
    });
    assert.equal(normalized.hasMeaningfulDoseText, false);
    assert.equal(normalized.presentation.statusLabel, "Dose unavailable");
  });
});

test("review metadata and retracted neighbouring evidence cannot create a parse-failure status", () => {
  const normalized = normalizeIngredientDose({
    ingredientName: "Bifidobacterium lactis HN019",
    dosageValue: null,
    dosageUnit: null,
    dosageOriginalText: null,
    dosageDisplay: null,
    doseConfidence: "unverified",
    doseReviewReason: "ambiguous_neighboring_dose",
  });

  assert.equal(normalized.hasMeaningfulDoseText, false);
  assert.equal(normalized.unavailableReason, "missing_dose_information");
  assert.equal(normalized.presentation.statusLabel, "Dose unavailable");
});

test("normalization is idempotent across persisted and hydrated shapes", () => {
  const first = normalizeIngredientDose({
    ingredientName: "Vitamin B12 1e3 mcg",
    amountBasis: "per_daily_dose",
    doseConfidence: "verified",
  });
  const hydrated = normalizeIngredientDose({
    ingredientName: first.ingredientName,
    dosage_value: first.value,
    dosage_unit: first.unit,
    dosage_original_text: first.dosageOriginalText,
    amount_basis: first.amountBasis,
    dose_confidence: first.doseConfidence,
  });

  assert.deepEqual(
    {
      ingredientName: hydrated.ingredientName,
      value: hydrated.value,
      unit: hydrated.unit,
      amountBasis: hydrated.amountBasis,
      displayText: hydrated.displayText,
      statusLabel: hydrated.presentation.statusLabel,
      eligible: hydrated.isScoringEligible,
    },
    {
      ingredientName: first.ingredientName,
      value: first.value,
      unit: first.unit,
      amountBasis: first.amountBasis,
      displayText: first.displayText,
      statusLabel: first.presentation.statusLabel,
      eligible: first.isScoringEligible,
    },
  );
});

test("exact display-only legacy text can be promoted by an ingestion boundary", () => {
  const normalized = normalizeIngredientDose(
    {
      ingredientName: "Magnesium",
      dosageDisplay: "200 mg per capsule",
      doseConfidence: null,
    },
    { allowDisplayParsing: true },
  );

  assert.equal(normalized.value, 200);
  assert.equal(normalized.unit, "mg");
  assert.equal(normalized.amountBasis, "per_capsule");
  assert.equal(normalized.displayText, "200 mg");
  assert.equal(normalized.isLegacyConfidence, true);
  assert.equal(normalized.isScoringEligible, true);
  assert.notEqual(
    normalized.presentation.statusLabel,
    "Dose could not be analysed",
  );
});
