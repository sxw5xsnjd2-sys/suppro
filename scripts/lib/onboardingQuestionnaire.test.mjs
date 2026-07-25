import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const questionnaireSource = readFileSync(
  new URL(
    "../../src/features/onboarding/QuestionnaireScreen.jsx",
    import.meta.url,
  ),
  "utf8",
);

const provisioningSource = readFileSync(
  new URL("../../src/lib/onboardingProvisioning.js", import.meta.url),
  "utf8",
);

function readStepKeys() {
  const stepKeysBlock = questionnaireSource.match(
    /const STEP_KEYS = \[([\s\S]*?)\];/u,
  );
  assert.ok(stepKeysBlock, "STEP_KEYS should remain defined");
  return Array.from(stepKeysBlock[1].matchAll(/"([^"]+)"/gu), (match) =>
    match[1],
  );
}

function visibleSteps(stepKeys, sexAtBirth) {
  return stepKeys.filter((stepKey) => {
    if (stepKey === "meds" || stepKey === "conditions") return false;
    if (stepKey === "lifeStage") {
      return sexAtBirth === "female" || sexAtBirth === "prefer_not_to_say";
    }
    return true;
  });
}

function nextStepAfter(stepKey, stepKeys) {
  return stepKeys[stepKeys.indexOf(stepKey) + 1];
}

test("current-supplement onboarding step is retired from the active flow", () => {
  const stepKeys = readStepKeys();

  assert.equal(stepKeys.includes("stack"), false);
  assert.equal(
    nextStepAfter("metrics", visibleSteps(stepKeys, "female")),
    "lifeStage",
  );
  assert.equal(
    nextStepAfter("metrics", visibleSteps(stepKeys, "male")),
    "insightSafety",
  );
  assert.equal(questionnaireSource.includes("What are you taking now?"), false);
  assert.equal(questionnaireSource.includes("SupplementManualSheet"), false);
});

test("saved stack drafts redirect to the next applicable active step", () => {
  assert.match(
    questionnaireSource,
    /const RETIRED_STEP_REDIRECTS = \{\s*stack: "lifeStage",\s*\};/u,
  );
  assert.match(
    questionnaireSource,
    /const activeStepKey = RETIRED_STEP_REDIRECTS\[stepKey\] \?\? stepKey;/u,
  );
  assert.match(
    questionnaireSource,
    /const sourceIndex = STEP_KEYS\.indexOf\(activeStepKey\);/u,
  );
});

test("legacy supplement answers pass through and remain provisionable", () => {
  assert.doesNotMatch(
    questionnaireSource,
    /supplementRows|takingSupplements|currentSupplementsSource|supplementsDetails/u,
  );
  assert.match(questionnaireSource, /\.\.\.storedAnswers,/u);
  assert.match(questionnaireSource, /\.\.\.currentAnswers,/u);
  assert.match(
    provisioningSource,
    /const rows = normalizeSupplementRows\(answers\.supplementRows\);/u,
  );
});
