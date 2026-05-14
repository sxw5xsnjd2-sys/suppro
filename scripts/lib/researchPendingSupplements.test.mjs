import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadResearchPendingSupplementsModule() {
  const source = readFileSync(
    new URL("../researchPendingSupplements.mjs", import.meta.url),
    "utf8"
  );

  const transformed = source
    .replace(/^import\s.+$/gm, "")
    .replace(/fileURLToPath\(import\.meta\.url\)/g, '"/tmp/researchPendingSupplements.mjs"')
    .replace(/\nmain\(\)\.catch\(\(error\) => \{[\s\S]*?\}\);\s*$/m, "\n");

  const factory = new Function(
    "createClient",
    "readFileSync",
    "mkdir",
    "writeFile",
    "path",
    "fileURLToPath",
    `${transformed}
return {
  DEFAULT_ALLOWED_DOMAINS,
  buildBenefitRows,
  validateResearch,
};`
  );

  return factory(
    () => {
      throw new Error("createClient should not be called in this test");
    },
    () => "",
    async () => {},
    async () => {},
    {
      dirname: () => "/tmp",
      resolve: (...parts) => parts.join("/"),
      join: (...parts) => parts.join("/"),
    },
    () => "/tmp/researchPendingSupplements.mjs"
  );
}

const { DEFAULT_ALLOWED_DOMAINS, buildBenefitRows, validateResearch } =
  loadResearchPendingSupplementsModule();

function createValidResearch(overrides = {}) {
  return {
    decision: "create_new",
    manual_review_reason: null,
    canonical_name: "L-Theanine",
    aliases: ["Theanine"],
    what_is_it: "L-theanine is an amino acid found in tea leaves.",
    why_use_it: "It is commonly used for stress support and calm focus.",
    how_does_it_work: "It may modulate neurotransmission associated with calm alertness.",
    side_effects: "Usually well tolerated at studied doses.",
    risks_and_interactions: "Use caution with sedatives or blood-pressure-lowering therapies.",
    who_might_benefit: "Adults seeking calm focus or stress support may benefit most.",
    evidence:
      "For Stress relief, White et al. (2024) in Nutrients reviewed controlled human data showing modest reductions in acute stress markers with generally mild limitations.",
    evidence_score: 61,
    how_to_use: "200-400 mg/day is the most common studied range, often split across the day.",
    recommended_dose_status: "parsed",
    recommended_dose_json: {
      unit: "mg",
      flags: [],
      confidence: 0.96,
      source_text: "200-400 mg/day",
      parser_method: "rule",
      per_intake_max_value: 400,
      per_intake_min_value: 200,
      frequency_max_per_day: 1,
      frequency_min_per_day: 1,
    },
    dose_scoring_profile_json: {
      unit: "mg",
      source: "human_trials",
      notes: "Typical daily range.",
      target_max_value: 400,
      target_min_value: 200,
      effective_min_value: 200,
    },
    benefits: [
      {
        label: "Stress relief",
        evidence_rating: "silver",
        score: 78,
        evidence:
          'White et al. (2024), Nutrients: "L-theanine and acute stress response." Randomized human data showed modest stress-marker reductions and calmer subjective ratings. Sample sizes remained moderate and not all outcomes were consistent.',
        ranking_reason: "Human trial evidence supports a mid-tier stress benefit ranking.",
        source_urls: [
          "https://doi.org/10.3390/nu16010001",
          "https://pubmed.ncbi.nlm.nih.gov/12345678/",
        ],
      },
    ],
    citations: [
      {
        url: "https://doi.org/10.3390/nu16010001",
        title: "L-theanine and acute stress response",
        authors: "White et al.",
        journal: "Nutrients",
        domain: "doi.org",
        year: 2024,
        evidence_type: "randomized_controlled_trial",
        finding: "Modest stress reductions.",
        limitation: "Moderate sample size.",
      },
      {
        url: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
        title: "L-theanine and acute stress response",
        authors: "White et al.",
        journal: "Nutrients",
        domain: "pubmed.ncbi.nlm.nih.gov",
        year: 2024,
        evidence_type: "pubmed_record",
        finding: "Indexed source record.",
        limitation: "Abstract-level metadata only.",
      },
    ],
    ...overrides,
  };
}

test("buildBenefitRows persists the preferred evidence_source URL", () => {
  const research = createValidResearch();

  const [row] = buildBenefitRows(
    { id: "supp-1", name: "L-Theanine" },
    research,
    DEFAULT_ALLOWED_DOMAINS
  );

  assert.equal(row.evidence_source, "https://pubmed.ncbi.nlm.nih.gov/12345678");
});

test("validateResearch rejects benefit claims without a persistable source URL", () => {
  const research = createValidResearch({
    benefits: [
      {
        label: "Stress relief",
        evidence_rating: "silver",
        score: 78,
        evidence:
          'White et al. (2024), Nutrients: "L-theanine and acute stress response." Randomized human data showed modest stress-marker reductions and calmer subjective ratings. Sample sizes remained moderate and not all outcomes were consistent.',
        ranking_reason: "Human trial evidence supports a mid-tier stress benefit ranking.",
        source_urls: [],
      },
    ],
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) =>
      issue.includes("Benefit missing persistable evidence_source")
    )
  );
});

test("validateResearch rejects benefit URLs that are not returned citations", () => {
  const research = createValidResearch({
    benefits: [
      {
        label: "Stress relief",
        evidence_rating: "silver",
        score: 78,
        evidence:
          'White et al. (2024), Nutrients: "L-theanine and acute stress response." Randomized human data showed modest stress-marker reductions and calmer subjective ratings. Sample sizes remained moderate and not all outcomes were consistent.',
        ranking_reason: "Human trial evidence supports a mid-tier stress benefit ranking.",
        source_urls: ["https://pubmed.ncbi.nlm.nih.gov/99999999/"],
      },
    ],
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) =>
      issue.includes("Benefit source URL is not present in citations")
    )
  );
});
