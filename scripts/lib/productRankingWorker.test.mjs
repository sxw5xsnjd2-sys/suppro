import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function dataUrlForSource(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

async function loadWorkerModule() {
  const doseNormalizationSource = readFileSync(
    new URL(
      "../../features/supplements/doseNormalization.js",
      import.meta.url,
    ),
    "utf8",
  );
  const doseSource = readFileSync(
    new URL(
      "../../features/supplements/recommendedDoseScoring.js",
      import.meta.url,
    ),
    "utf8",
  ).replace(
    "./doseNormalization.js",
    dataUrlForSource(doseNormalizationSource),
  );
  const benefitSource = readFileSync(
    new URL(
      "../../features/supplements/productBenefitScoring.js",
      import.meta.url,
    ),
    "utf8",
  );
  const contractSource = readFileSync(
    new URL(
      "../../features/supplements/productRankingContract.js",
      import.meta.url,
    ),
    "utf8",
  );
  const workerSource = readFileSync(
    new URL(
      "../../supabase/functions/_shared/product-ranking-worker.js",
      import.meta.url,
    ),
    "utf8",
  )
    .replace(
      "../../../features/supplements/recommendedDoseScoring.js",
      dataUrlForSource(doseSource),
    )
    .replace(
      "../../../features/supplements/productBenefitScoring.js",
      dataUrlForSource(benefitSource),
    )
    .replace(
      "../../../features/supplements/productRankingContract.js",
      dataUrlForSource(contractSource),
    );
  return import(dataUrlForSource(workerSource));
}

const worker = await loadWorkerModule();
const workerSource = readFileSync(
  new URL(
    "../../supabase/functions/_shared/product-ranking-worker.js",
    import.meta.url,
  ),
  "utf8",
);

function supplement({
  id,
  name = id,
  evidenceScore = 80,
  benefitScore = 80,
  benefitLabel = "Sleep support",
  profile = {
    effective_min_value: 100,
    target_min_value: 200,
    target_max_value: 400,
    unit: "mg",
  },
}) {
  return {
    id,
    name,
    status: "approved",
    evidence_score: evidenceScore,
    recommended_dose_json: null,
    dose_scoring_profile_json: profile,
    supplement_benefits:
      benefitScore === null ? [] : [{ label: benefitLabel, score: benefitScore }],
  };
}

function ingredient({
  id = "100",
  productId = "product-a",
  supplementId = "ingredient-a",
  name = "Ingredient A",
  dosageValue = 50,
  dosageUnit = "mg",
  amountBasis = "per_serving",
  doseConfidence = null,
  doseReviewReason = null,
} = {}) {
  return {
    id,
    product_id: productId,
    canonical_supplement_id: supplementId,
    raw_name: name,
    canonical_name: name,
    display_name: name,
    dosage_value: dosageValue,
    dosage_unit: dosageUnit,
    dosage_original_text: null,
    chemical_form: null,
    amount_basis: amountBasis,
    dose_confidence: doseConfidence,
    dose_review_reason: doseReviewReason,
  };
}

function master(overrides = {}) {
  return {
    product_id: "product-a",
    display_name: "Product A",
    serving_size_text: "1 capsule",
    verification_status: "verified",
    ...overrides,
  };
}

test("valid dose produces full-precision benefit score while invalid dose is unranked", () => {
  const valid = worker.buildProductScoreCachePayload({
    masterProduct: master(),
    ingredientRows: [ingredient()],
    supplementRows: [supplement({ id: "ingredient-a" })],
    calculatedAt: "2026-07-22T12:00:00.000Z",
  });
  assert.equal(valid.benefitRows[0].productBenefitScore, 60);
  assert.equal(valid.benefitRows[0].validatedDoseFactor, 0.75);
  assert.equal(valid.benefitRows[0].doseComparisonStatus, "below_effective_min");

  const missingDose = worker.buildProductScoreCachePayload({
    masterProduct: master(),
    ingredientRows: [ingredient({ dosageValue: null, dosageUnit: null })],
    supplementRows: [supplement({ id: "ingredient-a" })],
  });
  assert.equal(missingDose.benefitRows.length, 0);
  assert.equal(missingDose.overallEvidenceScore, 80);

  const mismatched = worker.buildProductScoreCachePayload({
    masterProduct: master(),
    ingredientRows: [ingredient({ dosageUnit: "ml" })],
    supplementRows: [supplement({ id: "ingredient-a" })],
  });
  assert.equal(mismatched.benefitRows.length, 0);

  const unverified = worker.buildProductScoreCachePayload({
    masterProduct: master({ verification_status: "photo_verified" }),
    ingredientRows: [
      ingredient({
        dosageValue: 200,
        doseConfidence: "unverified",
        doseReviewReason: "OCR row mismatch",
      }),
    ],
    supplementRows: [supplement({ id: "ingredient-a" })],
  });
  assert.equal(unverified.benefitRows.length, 0);
  assert.equal(unverified.overallEvidenceScore, 80);
});

test("ranking worker scores verified CFU and excludes explicitly unverified CFU", () => {
  const probioticProfile = {
    effective_min_value: 5_000_000_000,
    target_min_value: 10_000_000_000,
    target_max_value: 20_000_000_000,
    unit: "CFU",
  };
  const verified = worker.buildProductScoreCachePayload({
    masterProduct: master({ verification_status: "photo_verified" }),
    ingredientRows: [
      ingredient({
        supplementId: "probiotic-blend",
        name: "Probiotic blend",
        dosageValue: 10_000_000_000,
        dosageUnit: "CFU",
        doseConfidence: "verified",
      }),
    ],
    supplementRows: [
      supplement({ id: "probiotic-blend", profile: probioticProfile }),
    ],
  });
  assert.equal(verified.benefitRows.length, 1);
  assert.equal(verified.benefitRows[0].validatedDoseFactor, 1);

  const unverified = worker.buildProductScoreCachePayload({
    masterProduct: master({ verification_status: "photo_verified" }),
    ingredientRows: [
      ingredient({
        supplementId: "probiotic-blend",
        name: "Probiotic blend",
        dosageValue: 10_000_000_000,
        dosageUnit: "CFU",
        doseConfidence: "unverified",
      }),
    ],
    supplementRows: [
      supplement({ id: "probiotic-blend", profile: probioticProfile }),
    ],
  });
  assert.equal(unverified.benefitRows.length, 0);
});

test("ranking worker scores a verified enzyme activity dose", () => {
  const payload = worker.buildProductScoreCachePayload({
    masterProduct: master({ verification_status: "photo_verified" }),
    ingredientRows: [
      ingredient({
        supplementId: "lactase",
        name: "Lactase 3000 FCC",
        dosageValue: 3000,
        dosageUnit: "FCC",
        doseConfidence: "verified",
      }),
    ],
    supplementRows: [
      supplement({
        id: "lactase",
        profile: {
          effective_min_value: 2000,
          target_min_value: 3000,
          target_max_value: 4000,
          unit: "FCC",
        },
      }),
    ],
  });

  assert.equal(payload.benefitRows.length, 1);
  assert.equal(payload.benefitRows[0].validatedDoseFactor, 1);
  assert.equal(payload.benefitRows[0].doseComparisonStatus, "within_target_range");
});

test("ranking hydration selects dose confidence metadata", () => {
  assert.match(workerSource, /dose_confidence, dose_review_reason/u);
  assert.match(workerSource, /doseConfidence: trimString\(row\?\.dose_confidence\)/u);
  assert.match(workerSource, /doseReviewReason: trimString\(row\?\.dose_review_reason\)/u);
});

test("highest benefit driver wins with deterministic raw, factor, name, and ID ties", () => {
  const payload = worker.buildProductScoreCachePayload({
    masterProduct: master(),
    ingredientRows: [
      ingredient({ id: "2", supplementId: "beta", name: "Beta", dosageValue: 200 }),
      ingredient({ id: "1", supplementId: "alpha", name: "Alpha", dosageValue: 50 }),
    ],
    supplementRows: [
      supplement({ id: "beta", name: "Beta", benefitScore: 60 }),
      supplement({ id: "alpha", name: "Alpha", benefitScore: 80 }),
    ],
  });

  assert.equal(payload.benefitRows.length, 1);
  assert.equal(payload.benefitRows[0].productBenefitScore, 60);
  assert.equal(payload.benefitRows[0].driverCanonicalIngredientId, "alpha");

  const exactTie = worker.buildProductScoreCachePayload({
    masterProduct: master(),
    ingredientRows: [
      ingredient({ id: "2", supplementId: "z-id", name: "Alpha", dosageValue: 200 }),
      ingredient({ id: "1", supplementId: "a-id", name: "Alpha", dosageValue: 200 }),
    ],
    supplementRows: [
      supplement({ id: "z-id", name: "Alpha", benefitScore: 60 }),
      supplement({ id: "a-id", name: "Alpha", benefitScore: 60 }),
    ],
  });
  assert.equal(exactTie.benefitRows[0].driverCanonicalIngredientId, "a-id");
});

test("overall evidence remains separate and verification eligibility is explicit", () => {
  const payload = worker.buildProductScoreCachePayload({
    masterProduct: master({ verification_status: "go_upc_unverified" }),
    ingredientRows: [ingredient()],
    supplementRows: [
      supplement({ id: "ingredient-a", evidenceScore: 92, benefitScore: 80 }),
    ],
  });
  assert.equal(payload.overallEvidenceScore, 69);
  assert.equal(payload.benefitRows[0].productBenefitScore, 60);
  assert.equal(payload.rankingEligible, false);
  assert.equal(worker.isRankingEligibleVerificationStatus("photo_verified"), true);
});

function createMemoryRepository(fixture) {
  const state = {
    fixture,
    cache: new Map(),
    commits: 0,
    retries: [],
    queueRows: [],
    failNextCommit: false,
  };
  return {
    state,
    async claim() {
      return state.queueRows;
    },
    async load() {
      return state.fixture;
    },
    async commit(payload) {
      if (state.failNextCommit) {
        state.failNextCommit = false;
        throw new Error("temporary commit failure");
      }
      state.commits += 1;
      state.cache.set(payload.productId, structuredClone(payload));
    },
    async retry(value) {
      if (value.queueId) state.retries.push(value);
    },
  };
}

test("reruns are idempotent, removed benefits are cleaned up, and versions replace", async () => {
  const repository = createMemoryRepository({
    masterRows: [master()],
    ingredientRows: [ingredient()],
    supplementRows: [supplement({ id: "ingredient-a" })],
  });
  const base = {
    repository,
    productIds: ["product-a"],
    workerId: "test-worker",
    calculatedAt: "2026-07-22T12:00:00.000Z",
    write: true,
  };
  await worker.runProductScoreRefresh(base);
  await worker.runProductScoreRefresh(base);
  assert.equal(repository.state.cache.size, 1);
  assert.equal(repository.state.cache.get("product-a").benefitRows.length, 1);

  repository.state.fixture.supplementRows[0].supplement_benefits = [];
  await worker.runProductScoreRefresh({ ...base, calculationVersion: "ranking.v2" });
  const cached = repository.state.cache.get("product-a");
  assert.equal(cached.benefitRows.length, 0);
  assert.equal(cached.calculationVersion, "ranking.v2");
});

test("claimed queue failures are retried without exposing product data", async () => {
  const repository = createMemoryRepository({
    masterRows: [master()],
    ingredientRows: [ingredient()],
    supplementRows: [supplement({ id: "ingredient-a" })],
  });
  repository.state.queueRows = [{ id: "queue-a", product_id: "product-a" }];
  repository.state.failNextCommit = true;

  const result = await worker.runProductScoreRefresh({
    repository,
    productIds: null,
    workerId: "test-worker",
    write: true,
  });
  assert.equal(result.failed, 1);
  assert.equal(repository.state.retries.length, 1);
  assert.equal(repository.state.retries[0].queueId, "queue-a");
});
