import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadResearchPendingSupplementsModule() {
  const source = readFileSync(
    new URL("../researchPendingSupplements.mjs", import.meta.url),
    "utf8",
  );

  const transformed = source
    .replace(/^import\s.+$/gm, "")
    .replace(
      /fileURLToPath\(import\.meta\.url\)/g,
      '"/tmp/researchPendingSupplements.mjs"',
    )
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
		};`,
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
    () => "/tmp/researchPendingSupplements.mjs",
  );
}

function extractFunctionSource(source, functionName) {
  const asyncSignature = `async function ${functionName}`;
  const signature = source.includes(asyncSignature)
    ? asyncSignature
    : `function ${functionName}`;
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`Could not find ${functionName} in source`);
  }

  const signatureEnd = source.indexOf(")", start);
  const bodyStart = source.indexOf("{", signatureEnd);
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

function loadResearchPendingSupplementsEdgeCreateHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const transformed = extractFunctionSource(
    source,
    "createPendingSupplement",
  ).replace(
    /async function createPendingSupplement\(candidate: Record<string, unknown>, research: Record<string, unknown>\) \{/,
    "async function createPendingSupplement(candidate, research) {",
  );
  const normalized = transformed
    .replace(/adminSupabase!/g, "adminSupabase")
    .replace(
      /supplement: \{ id: string; name: string; note: string \}/g,
      "supplement",
    )
    .replace(/candidate: Record<string, unknown>/g, "candidate")
    .replace(/research: Record<string, unknown>/g, "research");

  const factory = new Function(
    "adminSupabase",
    "TABLES",
    "normalizeText",
    "clampScore",
    "applyResearchRelations",
    "markCandidateApplied",
    "markManualReviewResolved",
    `${normalized}
return {
  createPendingSupplement,
};`,
  );

  return factory;
}

function loadResearchPendingSupplementsApplyNewHelper() {
  const source = readFileSync(
    new URL("../researchPendingSupplements.mjs", import.meta.url),
    "utf8",
  );

  const transformed = extractFunctionSource(source, "applyNewSupplement");

  const factory = new Function(
    "fetchAllRows",
    "normalizeLookupText",
    "buildCatalogEntries",
    "findDuplicateCandidate",
    "applyPendingSupplementRefresh",
    "applyAliasExisting",
    "normalizeText",
    "clampScore",
    "applyResearchRelations",
    "markCandidateApplied",
    "markManualReviewResolved",
    `${transformed}
return {
  applyNewSupplement,
};`,
  );

  return factory;
}

function loadScriptStrictAliasHelper() {
  const source = readFileSync(
    new URL("../researchPendingSupplements.mjs", import.meta.url),
    "utf8",
  );

  const transformed = extractFunctionSource(
    source,
    "resolveStrictApprovedAliasReview",
  );

  const factory = new Function(
    "buildAliasGuardShortlist",
    "requestStrictAliasReview",
    "aliasReviewPayload",
    `${transformed}
return {
  resolveStrictApprovedAliasReview,
};`,
  );

  return factory;
}

function loadEdgeStrictAliasHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const transformed = extractFunctionSource(
    source,
    "resolveStrictApprovedAliasReview",
  )
    .replace(
      /async function resolveStrictApprovedAliasReview\(\s*candidate: Record<string, unknown>,\s*research: Record<string, unknown>,\s*approvedCatalogEntries: ReturnType<typeof buildCatalogEntries>\s*\) \{/,
      "async function resolveStrictApprovedAliasReview(candidate, research, approvedCatalogEntries) {",
    )
    .replace(/candidate: Record<string, unknown>/g, "candidate")
    .replace(/research: Record<string, unknown>/g, "research")
    .replace(
      /approvedCatalogEntries: ReturnType<typeof buildCatalogEntries>/g,
      "approvedCatalogEntries",
    )
    .replace(/\s+as const/g, "");

  const factory = new Function(
    "buildAliasGuardShortlist",
    "requestStrictAliasReview",
    "aliasReviewPayload",
    `${transformed}
return {
  resolveStrictApprovedAliasReview,
};`,
  );

  return factory;
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
    how_does_it_work:
      "It may modulate neurotransmission associated with calm alertness.",
    side_effects: "Usually well tolerated at studied doses.",
    risks_and_interactions:
      "Use caution with sedatives or blood-pressure-lowering therapies.",
    who_might_benefit:
      "Adults seeking calm focus or stress support may benefit most.",
    evidence:
      "For Stress relief, White et al. (2024) in Nutrients reviewed controlled human data showing modest reductions in acute stress markers with generally mild limitations.",
    evidence_score: 61,
    how_to_use:
      "200-400 mg/day is the most common studied range, often split across the day.",
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
        ranking_reason:
          "Human trial evidence supports a mid-tier stress benefit ranking.",
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

function createInsertSupabaseDouble() {
  const inserts = [];

  return {
    inserts,
    client: {
      from(table) {
        return {
          insert(row) {
            inserts.push({ table, row });
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: "supp-1",
                        name: row.name,
                        status: row.status,
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

test("buildBenefitRows persists the preferred evidence_source URL", () => {
  const research = createValidResearch();

  const [row] = buildBenefitRows(
    { id: "supp-1", name: "L-Theanine" },
    research,
    DEFAULT_ALLOWED_DOMAINS,
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
        ranking_reason:
          "Human trial evidence supports a mid-tier stress benefit ranking.",
        source_urls: [],
      },
    ],
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) =>
      issue.includes("Benefit missing persistable evidence_source"),
    ),
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
        ranking_reason:
          "Human trial evidence supports a mid-tier stress benefit ranking.",
        source_urls: ["https://pubmed.ncbi.nlm.nih.gov/99999999/"],
      },
    ],
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) =>
      issue.includes("Benefit source URL is not present in citations"),
    ),
  );
});

test("applyNewSupplement inserts validated AI-created supplements as approved", async () => {
  const supabase = createInsertSupabaseDouble();
  const candidate = {
    normalized_name: "l theanine",
    display_name: "L-Theanine",
  };
  const relationsCalls = [];
  const markCalls = [];
  const resolveCalls = [];
  const { applyNewSupplement } = loadResearchPendingSupplementsApplyNewHelper()(
    async (client, table) => {
      assert.equal(client, supabase.client);
      if (table === "supplements") return [];
      if (table === "supplement_aliases") return [];
      throw new Error(`Unexpected table: ${table}`);
    },
    (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    () => [],
    () => ({ action: "create_new" }),
    async () => {
      throw new Error("applyPendingSupplementRefresh should not be called");
    },
    async () => {
      throw new Error("applyAliasExisting should not be called");
    },
    (value) => (typeof value === "string" ? value.trim() : (value ?? null)),
    (value) => value ?? null,
    async (...args) => {
      relationsCalls.push(args);
      return { linked: 2, benefitCount: 1 };
    },
    async (...args) => {
      markCalls.push(args);
    },
    async (...args) => {
      resolveCalls.push(args);
    },
  );

  const result = await applyNewSupplement({
    supabase: supabase.client,
    candidate,
    research: createValidResearch(),
    allowedDomains: DEFAULT_ALLOWED_DOMAINS,
  });

  assert.equal(supabase.inserts.length, 1);
  assert.equal(supabase.inserts[0].table, "supplements");
  assert.equal(supabase.inserts[0].row.status, "approved");
  assert.equal(result.supplement.status, "approved");
  assert.equal(relationsCalls.length, 1);
  assert.equal(markCalls.length, 1);
  assert.equal(
    markCalls[0][2].note,
    "Created approved supplement from AI research.",
  );
  assert.equal(resolveCalls.length, 1);
});

test("edge createPendingSupplement inserts validated AI-created supplements as approved", async () => {
  const supabase = createInsertSupabaseDouble();
  const relationsCalls = [];
  const markCalls = [];
  const resolveCalls = [];
  const { createPendingSupplement } =
    loadResearchPendingSupplementsEdgeCreateHelper()(
      supabase.client,
      { supplements: "supplements" },
      (value) => (typeof value === "string" ? value.trim() : (value ?? null)),
      (value) => value ?? null,
      async (...args) => {
        relationsCalls.push(args);
        return { linked: 3, benefitCount: 1 };
      },
      async (...args) => {
        markCalls.push(args);
      },
      async (...args) => {
        resolveCalls.push(args);
      },
    );

  const result = await createPendingSupplement(
    { normalized_name: "l theanine", display_name: "L-Theanine" },
    createValidResearch(),
  );

  assert.equal(supabase.inserts.length, 1);
  assert.equal(supabase.inserts[0].table, "supplements");
  assert.equal(supabase.inserts[0].row.status, "approved");
  assert.equal(result.supplement.status, "approved");
  assert.equal(relationsCalls.length, 1);
  assert.equal(markCalls.length, 1);
  assert.equal(
    markCalls[0][1].note,
    "Created approved supplement from automatic scan research.",
  );
  assert.equal(resolveCalls.length, 1);
});

test("script strict alias review links a confident match to an existing approved supplement", async () => {
  const shortlist = [
    { id: "supp-approved", name: "L-Theanine", status: "approved" },
  ];
  const { resolveStrictApprovedAliasReview } = loadScriptStrictAliasHelper()(
    () => shortlist,
    async () => ({
      decision: "alias_existing",
      matched_supplement_id: "supp-approved",
      confidence: 0.93,
      reason:
        "Canonical name and alias set clearly match the approved supplement.",
    }),
    (items) => items,
  );

  const result = await resolveStrictApprovedAliasReview({
    apiKey: "test-key",
    model: "test-model",
    candidate: { normalized_name: "l theanine", display_name: "L-Theanine" },
    research: createValidResearch(),
    approvedCatalogEntries: shortlist,
  });

  assert.equal(result.decision, "alias_existing");
  assert.equal(result.match.id, "supp-approved");
});

test("script strict alias review quarantines ambiguous candidates", async () => {
  const shortlist = [
    { id: "supp-a", name: "Magnesium Glycinate", status: "approved" },
    { id: "supp-b", name: "Magnesium Bisglycinate", status: "approved" },
  ];
  const { resolveStrictApprovedAliasReview } = loadScriptStrictAliasHelper()(
    () => shortlist,
    async () => ({
      decision: "manual_review",
      matched_supplement_id: null,
      confidence: 0.62,
      reason: "Multiple approved supplements remain plausible matches.",
    }),
    (items) => items,
  );

  const result = await resolveStrictApprovedAliasReview({
    apiKey: "test-key",
    model: "test-model",
    candidate: {
      normalized_name: "magnesium complex",
      display_name: "Magnesium Complex",
    },
    research: createValidResearch({
      canonical_name: "Magnesium Complex",
      aliases: [],
    }),
    approvedCatalogEntries: shortlist,
  });

  assert.equal(result.decision, "manual_review");
  assert.match(
    result.reason,
    /Multiple approved supplements remain plausible matches/,
  );
});

test("edge strict alias review links a confident match to an existing approved supplement", async () => {
  const shortlist = [
    { id: "supp-approved", name: "L-Theanine", status: "approved" },
  ];
  const { resolveStrictApprovedAliasReview } = loadEdgeStrictAliasHelper()(
    () => shortlist,
    async () => ({
      decision: "alias_existing",
      matched_supplement_id: "supp-approved",
      confidence: 0.94,
      reason: "Approved alias shortlist contains a clear single match.",
    }),
    (items) => items,
  );

  const result = await resolveStrictApprovedAliasReview(
    { normalized_name: "l theanine", display_name: "L-Theanine" },
    createValidResearch(),
    shortlist,
  );

  assert.equal(result.decision, "alias_existing");
  assert.equal(result.match.id, "supp-approved");
});
