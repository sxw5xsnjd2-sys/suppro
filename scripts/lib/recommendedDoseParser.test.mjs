import test from "node:test";
import {
  assertParsedDoseResult,
  normalizeRecommendedDoseResult,
  parseRecommendedDoseFromHowToUse,
} from "./recommendedDoseParser.mjs";

test("parses simple comparable dose", () => {
  const result = parseRecommendedDoseFromHowToUse("Take 300 mg once daily");
  assertParsedDoseResult(result, {
    status: "parsed",
    values: {
      min: 300,
      max: null,
      unit: "mg",
      frequencyMin: 1,
      frequencyMax: 1,
    },
  });
});

test("parses dose range", () => {
  const result = parseRecommendedDoseFromHowToUse("Take 300-600 mg daily");
  assertParsedDoseResult(result, {
    status: "parsed",
    values: {
      min: 300,
      max: 600,
      unit: "mg",
      frequencyMin: 1,
      frequencyMax: 1,
    },
  });
});

test("parses numeric frequency", () => {
  const result = parseRecommendedDoseFromHowToUse("Take 200 mg 2 times daily");
  assertParsedDoseResult(result, {
    status: "parsed",
    values: {
      min: 200,
      max: null,
      unit: "mg",
      frequencyMin: 2,
      frequencyMax: 2,
    },
  });
});

test("normalizes grams to milligrams", () => {
  const result = parseRecommendedDoseFromHowToUse("Take 0.5 g daily");
  assertParsedDoseResult(result, {
    status: "parsed",
    values: {
      min: 500,
      max: null,
      unit: "mg",
      frequencyMin: 1,
      frequencyMax: 1,
    },
  });
});

test("capsule-only guidance is unscorable", () => {
  const result = parseRecommendedDoseFromHowToUse("Take 2 capsules daily");
  assertParsedDoseResult(result, {
    status: "unscorable",
    values: {
      min: null,
      max: null,
      unit: null,
      frequencyMin: 1,
      frequencyMax: 1,
    },
  });
});

test("conflicting comparable doses are ambiguous", () => {
  const result = parseRecommendedDoseFromHowToUse(
    "Take 300 mg in the morning and 600 mg in the evening."
  );
  assertParsedDoseResult(result, {
    status: "ambiguous",
    values: {
      min: null,
      max: null,
      unit: null,
      frequencyMin: null,
      frequencyMax: null,
    },
  });
});

test("normalizes llm-style missing results without throwing", () => {
  const result = normalizeRecommendedDoseResult({
    status: "missing",
    source_text:
      "Typical dose is 1-2 tablespoons diluted in water once or twice daily.",
    confidence: 0.62,
    per_intake_min_value: null,
    per_intake_max_value: null,
    unit: null,
    frequency_min_per_day: 1,
    frequency_max_per_day: 1,
    flags: ["no_comparable_dose_found"],
  });

  assertParsedDoseResult(result, {
    status: "missing",
    values: {
      min: null,
      max: null,
      unit: null,
      frequencyMin: 1,
      frequencyMax: 1,
    },
  });
});
