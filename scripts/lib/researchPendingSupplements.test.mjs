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
	        buildExplicitCandidateLookupVariants,
	        buildTaxonomyPolicyMap,
	        buildCodeTaxonomyPolicyMap,
	        coerceTaxonomyCreateCanonicalManualReview,
	        fetchCandidates,
	        findExactApprovedCatalogMatch,
	        hasDoseLikeText,
	        normalizeExactPolicyName,
	        resolveTaxonomyPolicy,
	        shouldBypassStrictAliasGuard,
	        validateResearch,
	        findDuplicateCandidate,
	        decisionAllowsPendingManualReviewEscape,
	        queueSuggestedActionForDecision,
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
    "fetchAllRows",
    "buildCatalogEntries",
    "findExactCatalogSupplementMatch",
    "applyAliasExisting",
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
    "findExactCatalogSupplementMatch",
    "dedupeStrings",
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
    .replace(
      /shortlist: ReturnType<typeof buildAliasGuardShortlist>/g,
      "shortlist",
    )
    .replace(/value: unknown/g, "value")
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

function loadScriptSyncCandidateQueueDecisionHelper() {
  const source = readFileSync(
    new URL("../researchPendingSupplements.mjs", import.meta.url),
    "utf8",
  );
  const transformed = [
    extractFunctionSource(source, "queueSuggestedActionForDecision"),
    extractFunctionSource(source, "queueSuggestedSupplementNameForRecord"),
    extractFunctionSource(source, "queueReviewNotesForRecord"),
    extractFunctionSource(source, "buildCachedResearchPayload"),
    extractFunctionSource(source, "syncCandidateQueueDecision"),
  ].join("\n\n");

  const factory = new Function(
    "trimString",
    "normalizeText",
    `${transformed}
return {
  queueSuggestedActionForDecision,
  syncCandidateQueueDecision,
};`,
  );

  return factory;
}

function loadEdgeSyncCandidateQueueDecisionHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const transformed = [
    extractFunctionSource(source, "queueSuggestedActionForDecision")
      .replace(/decision: unknown/g, "decision"),
    extractFunctionSource(source, "queueSuggestedSupplementNameForRecord")
      .replace(/record: Record<string, unknown>/g, "record"),
    extractFunctionSource(source, "queueReviewNotesForRecord")
      .replace(/record: Record<string, unknown>/g, "record"),
    extractFunctionSource(source, "buildCachedResearchPayload")
      .replace(/record: Record<string, unknown>/g, "record"),
    extractFunctionSource(source, "syncCandidateQueueDecision")
      .replace(/adminSupabase!/g, "adminSupabase")
      .replace(/candidate: Record<string, unknown>/g, "candidate")
      .replace(/record: Record<string, unknown>/g, "record")
      .replace(/const payload: Record<string, unknown> =/g, "const payload ="),
  ].join("\n\n");

  const factory = new Function(
    "adminSupabase",
    "TABLES",
    "trimString",
    "normalizeText",
    `${transformed}
return {
  queueSuggestedActionForDecision,
  syncCandidateQueueDecision,
};`,
  );

  return factory;
}

function loadEdgeFetchCandidatesHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const transformed = [
    extractFunctionSource(source, "trimString")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "normalizeText")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "normalizeLookupText")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "buildExplicitCandidateLookupVariants")
      .replace(/value: unknown/g, "value")
      .replace(/\): string\[\]/g, ")"),
    extractFunctionSource(source, "fetchCandidates")
      .replace(/normalizedNames: string\[\]/g, "normalizedNames")
      .replace(/limit: number/g, "limit")
      .replace(/requestedSuggestedAction = \"\"/g, "requestedSuggestedAction = \"\"")
      .replace(/adminSupabase!/g, "adminSupabase"),
  ].join("\n\n");

  const factory = new Function(
    "adminSupabase",
    "TABLES",
    `${transformed}
return {
  buildExplicitCandidateLookupVariants,
  fetchCandidates,
};`,
  );

  return factory;
}

const {
  DEFAULT_ALLOWED_DOMAINS,
  buildCodeTaxonomyPolicyMap,
  buildTaxonomyPolicyMap,
  buildBenefitRows,
  buildExplicitCandidateLookupVariants: buildScriptExplicitCandidateLookupVariants,
  coerceTaxonomyCreateCanonicalManualReview:
    coerceScriptTaxonomyCreateCanonicalManualReview,
  fetchCandidates: fetchScriptCandidates,
  findExactApprovedCatalogMatch,
  hasDoseLikeText,
  normalizeExactPolicyName,
  resolveTaxonomyPolicy: resolveScriptTaxonomyPolicy,
  shouldBypassStrictAliasGuard: scriptShouldBypassStrictAliasGuard,
  validateResearch,
} =
  loadResearchPendingSupplementsModule();

function loadEdgeFindDuplicateHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const transformed = [
    extractFunctionSource(source, "trimString")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "normalizeText")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "normalizeLookupText")
      .replace(/\): string/g, ")")
      .replace(/value: unknown/g, "value"),
    extractFunctionSource(source, "lookupTokens").replace(/value: unknown/g, "value"),
    extractFunctionSource(source, "vitaminKey").replace(/value: unknown/g, "value"),
    extractFunctionSource(source, "scoreLookupMatch")
      .replace(/inputName: unknown/g, "inputName")
      .replace(/lookupName: unknown/g, "lookupName"),
    source.match(/const SPECIFIC_FORM_TOKENS = new Set\(\[[\s\S]*?\]\);/)[0],
    extractFunctionSource(source, "shouldCreateNewFromSpecificFormMatches")
      .replace(/candidateName: string/g, "candidateName")
      .replace(/strongMatches: Array<Record<string, unknown>>/g, "strongMatches"),
    extractFunctionSource(source, "findDuplicateCandidate")
      .replace(/candidateName: string/g, "candidateName")
      .replace(
        /catalogEntries: ReturnType<typeof buildCatalogEntries>/g,
        "catalogEntries",
      )
      .replace(/\s+as const/g, ""),
  ].join("\n\n");

  const factory = new Function(
    `${transformed}
	return {
	  findDuplicateCandidate,
	};`,
  );

  return factory();
}

function loadEdgePendingManualReviewEscapeHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const transformed = extractFunctionSource(
    source,
    "decisionAllowsPendingManualReviewEscape",
  ).replace(/decision: unknown/g, "decision");

  const factory = new Function(
    `${transformed}
	return {
	  decisionAllowsPendingManualReviewEscape,
	};`,
  );

  return factory();
}

function loadEdgeTaxonomyPolicyHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const transformed = [
    extractFunctionSource(source, "trimString")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "normalizeText")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "normalizeExactPolicyName")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    source.match(/const PROBIOTICS_SUPPLEMENT_ID = ".*?";/)[0],
    source
      .match(/const CODE_TAXONOMY_POLICIES = \[[\s\S]*?\] as const;/)[0]
      .replace(/\s+as const;/, ";"),
    extractFunctionSource(source, "buildTaxonomyPolicyMap")
      .replace(/policyRows: Record<string, unknown>\[\]/g, "policyRows")
      .replace(/new Map<string, Record<string, unknown>>\(\)/g, "new Map()"),
    extractFunctionSource(source, "buildCodeTaxonomyPolicyMap"),
    extractFunctionSource(source, "findApprovedCatalogEntryById")
      .replace(/supplementId: string/g, "supplementId")
      .replace(
        /approvedCatalogEntries: ReturnType<typeof buildCatalogEntries>/g,
        "approvedCatalogEntries",
      ),
    extractFunctionSource(source, "resolveTaxonomyPolicy")
      .replace(/normalizedName: string/g, "normalizedName")
      .replace(
        /approvedCatalogEntries: ReturnType<typeof buildCatalogEntries>/g,
        "approvedCatalogEntries",
      )
      .replace(
        /taxonomyPolicyMap: Map<string, Record<string, unknown>>/g,
        "taxonomyPolicyMap",
      )
      .replace(/\s+as const/g, ""),
  ].join("\n\n");

  const factory = new Function(
    `${transformed}
return {
  buildTaxonomyPolicyMap,
  buildCodeTaxonomyPolicyMap,
  resolveTaxonomyPolicy,
};`,
  );

  return factory();
}

function loadEdgeTaxonomyCreateCanonicalHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const transformed = [
    extractFunctionSource(source, "trimString")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "normalizeText")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "coerceTaxonomyCreateCanonicalManualReview")
      .replace(/result: Record<string, unknown>/g, "result")
      .replace(
        /forcedCreatePolicy:\s*\|[\s\S]*?\|\s*null,\s*\)/,
        "forcedCreatePolicy,\n)",
      )
      .replace(/result\.decision/g, "result?.decision")
      .replace(/result\.manual_review_reason/g, "result?.manual_review_reason")
      .replace(/result\.canonical_name/g, "result?.canonical_name"),
  ].join("\n\n");

  const factory = new Function(
    `${transformed}
return {
  coerceTaxonomyCreateCanonicalManualReview,
};`,
  );

  return factory();
}

function loadEdgeStrictAliasBypassHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/research-pending-supplements/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const transformed = extractFunctionSource(
    source,
    "shouldBypassStrictAliasGuard",
  ).replace(
    /forcedCreatePolicy:\s*\|[\s\S]*?\|\s*null,\s*\)/,
    "forcedCreatePolicy,\n)",
  );

  const factory = new Function(
    `${transformed}
return {
  shouldBypassStrictAliasGuard,
};`,
  );

  return factory();
}

function loadProcessPhotoRescueSuggestedActionHelper() {
  const source = readFileSync(
    new URL(
      "../../supabase/functions/process-photo-rescue-reviews/index.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const transformed = [
    extractFunctionSource(source, "trimString")
      .replace(/value: unknown/g, "value")
      .replace(/\): string/g, ")"),
    extractFunctionSource(source, "resolveSuggestedAction").replace(
      /existingRow: Record<string, unknown> \| null/g,
      "existingRow",
    ),
  ].join("\n\n");

  const factory = new Function(
    `${transformed}
return {
  resolveSuggestedAction,
};`,
  );

  return factory();
}

const {
  findDuplicateCandidate: findScriptDuplicateCandidate,
  decisionAllowsPendingManualReviewEscape:
    scriptDecisionAllowsPendingManualReviewEscape,
  queueSuggestedActionForDecision,
} = loadResearchPendingSupplementsModule();
const { findDuplicateCandidate: findEdgeDuplicateCandidate } =
  loadEdgeFindDuplicateHelper();
const {
  decisionAllowsPendingManualReviewEscape:
    edgeDecisionAllowsPendingManualReviewEscape,
} = loadEdgePendingManualReviewEscapeHelper();
const {
  buildCodeTaxonomyPolicyMap: buildEdgeCodeTaxonomyPolicyMap,
  buildTaxonomyPolicyMap: buildEdgeTaxonomyPolicyMap,
  resolveTaxonomyPolicy: resolveEdgeTaxonomyPolicy,
} = loadEdgeTaxonomyPolicyHelper();
const {
  coerceTaxonomyCreateCanonicalManualReview:
    coerceEdgeTaxonomyCreateCanonicalManualReview,
} = loadEdgeTaxonomyCreateCanonicalHelper();
const {
  shouldBypassStrictAliasGuard: edgeShouldBypassStrictAliasGuard,
} = loadEdgeStrictAliasBypassHelper();

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

function createForcedCreateCanonicalPolicy(canonicalName) {
  return {
    action: "create_canonical",
    canonicalName,
    reason: `Taxonomy policy approved canonical research generation for ${canonicalName}.`,
    source: "db",
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

function createCandidateQuerySupabase(rows) {
  const operations = [];
  const query = {
    select(selection) {
      operations.push({ fn: "select", selection });
      return query;
    },
    eq(column, value) {
      operations.push({ fn: "eq", column, value });
      return query;
    },
    in(column, values) {
      operations.push({ fn: "in", column, values });
      return query;
    },
    range(from, to) {
      operations.push({ fn: "range", from, to });
      return query;
    },
    order(column, options) {
      operations.push({ fn: "order", column, options });
      return query;
    },
    limit(value) {
      operations.push({ fn: "limit", value });
      return query;
    },
    then(resolve) {
      let filtered = [...rows];
      for (const operation of operations) {
        if (operation.fn === "eq") {
          filtered = filtered.filter((row) => row?.[operation.column] === operation.value);
        }
        if (operation.fn === "in") {
          filtered = filtered.filter((row) =>
            operation.values.includes(row?.[operation.column]),
          );
        }
        if (operation.fn === "limit") {
          filtered = filtered.slice(0, operation.value);
        }
        if (operation.fn === "range") {
          filtered = filtered.slice(operation.from, operation.to + 1);
        }
      }
      return Promise.resolve(resolve({ data: filtered, error: null }));
    },
  };

  return {
    operations,
    client: {
      from(table) {
        assert.equal(table, "supplement_catalog_review_candidates");
        return query;
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

test("validateResearch does not treat null dose fields as available", () => {
  const research = createValidResearch({
    recommended_dose_status: "ambiguous",
    recommended_dose_json: {
      unit: "mg",
      flags: ["benefit-specific-dose-uncertain"],
      confidence: 0.31,
      source_text: "No standard standalone dose is established.",
      parser_method: "manual",
      per_intake_min_value: null,
      per_intake_max_value: null,
      frequency_min_per_day: null,
      frequency_max_per_day: null,
    },
    how_to_use:
      "No standard standalone dose is established, and the human evidence does not define one clearly.",
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, true);
  assert.equal(
    result.issues.some((issue) => issue.includes("How to use must include")),
    false,
  );
});

test("validateResearch allows Valine-style ambiguous dose with no standalone dose", () => {
  const research = createValidResearch({
    decision: "create_precise",
    canonical_name: "Valine",
    aliases: ["L-valine", "valine"],
    evidence_score: 18,
    how_to_use:
      "No standard standalone valine dose is established for a benefit claim. In research, valine is usually studied as part of BCAA mixtures rather than as an isolated supplement ingredient.",
    recommended_dose_status: "ambiguous",
    recommended_dose_json: {
      unit: "g",
      flags: [
        "BCAA-mixture-not-isolated",
        "no-canonical-standalone-dose",
        "benefit-specific-dose-uncertain",
      ],
      confidence: 0.34,
      source_text:
        "BCAA regimens in exercise-recovery literature commonly use 2:1:1 leucine:isoleucine:valine mixtures, but this is not an isolated valine dose.",
      parser_method: "manual",
      per_intake_min_value: null,
      per_intake_max_value: null,
      frequency_min_per_day: null,
      frequency_max_per_day: null,
    },
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, true);
  assert.equal(
    result.issues.some((issue) => issue.includes("How to use must include")),
    false,
  );
});

test("validateResearch syncs valid benefit source URLs into citations", () => {
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
    ],
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, true);
  assert.ok(
    Array.isArray(research.citations) &&
      research.citations.some(
        (citation) =>
          citation?.url === "https://pubmed.ncbi.nlm.nih.gov/99999999",
      ),
  );
  assert.equal(
    result.issues.some((issue) =>
      issue.includes("Benefit source URL is not present in citations"),
    ),
    false,
  );
});

test("validateResearch still rejects invalid benefit URLs", () => {
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
        source_urls: ["not-a-valid-url"],
      },
    ],
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) =>
      issue.includes("Benefit source URL is invalid"),
    ),
  );
});

test("hasDoseLikeText recognizes comma-formatted FCC doses", () => {
  assert.equal(hasDoseLikeText("4,500 FCC chewable tablet"), true);
});

test("hasDoseLikeText recognizes plain FCC doses", () => {
  assert.equal(hasDoseLikeText("4500 FCC chewable tablet"), true);
});

test("hasDoseLikeText still recognizes mg, IU, and CFU doses", () => {
  assert.equal(hasDoseLikeText("200 mg daily"), true);
  assert.equal(hasDoseLikeText("4500 IU daily"), true);
  assert.equal(hasDoseLikeText("10 billion CFU daily"), true);
});

test("hasDoseLikeText recognizes lipase activity units", () => {
  assert.equal(hasDoseLikeText("40,000-50,000 lipase units per meal"), true);
});

test("hasDoseLikeText recognizes enzyme activity units", () => {
  assert.equal(hasDoseLikeText("40,000 enzyme units per meal"), true);
});

test("validateResearch accepts Lactase-style FCC dose text in how_to_use", () => {
  const research = createValidResearch({
    canonical_name: "Lactase",
    how_to_use:
      "4,500 FCC chewable tablet is typically taken with dairy-containing meals.",
    recommended_dose_status: "parsed",
    recommended_dose_json: {
      unit: "FCC",
      flags: [],
      confidence: 0.94,
      source_text: "4,500 FCC chewable tablet",
      parser_method: "manual",
      per_intake_max_value: 4500,
      per_intake_min_value: 4500,
      frequency_max_per_day: null,
      frequency_min_per_day: null,
    },
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, true);
  assert.equal(
    result.issues.some((issue) =>
      issue.includes("How to use must include the recommended, typical, studied, or example dose"),
    ),
    false,
  );
});

test("validateResearch keeps Olive Extract as manual_review when research returns ambiguity", () => {
  const research = createValidResearch({
    decision: "manual_review",
    canonical_name: "Olive Extract",
    manual_review_reason:
      '"Olive Extract" is ambiguous without plant-part and preparation specificity, so it should stay in manual review.',
  });

  const result = validateResearch(research, DEFAULT_ALLOWED_DOMAINS);

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [research.manual_review_reason]);
});

[
  ["script", coerceScriptTaxonomyCreateCanonicalManualReview],
  ["edge", coerceEdgeTaxonomyCreateCanonicalManualReview],
].forEach(([label, coerceResearch]) => {
  test(`${label} taxonomy create_canonical coerces Bioflavonoids umbrella manual_review into create_new`, () => {
    const coerced = coerceResearch(
      createValidResearch({
        decision: "manual_review",
        canonical_name: "Mixed Citrus Flavonoids",
        manual_review_reason:
          "Bioflavonoids is an umbrella class term covering multiple distinct compounds rather than one discrete ingredient.",
      }),
      createForcedCreateCanonicalPolicy("Bioflavonoids"),
    );
    const validation = validateResearch(coerced, DEFAULT_ALLOWED_DOMAINS);

    assert.equal(coerced.decision, "create_new");
    assert.equal(coerced.canonical_name, "Bioflavonoids");
    assert.equal(coerced.manual_review_reason, null);
    assert.equal(validation.ok, true);
    assert.equal(validation.ok ? "research_ready" : "validation_blocked", "research_ready");
  });

  test(`${label} taxonomy create_canonical coerces Digestive Enzymes class ambiguity into create_new`, () => {
    const coerced = coerceResearch(
      createValidResearch({
        decision: "manual_review",
        canonical_name: "Enzyme Blend",
        manual_review_reason:
          "Digestive enzymes is a broad ingredient class grouping multiple distinct enzymes rather than one discrete ingredient.",
      }),
      createForcedCreateCanonicalPolicy("Digestive Enzymes"),
    );
    const validation = validateResearch(coerced, DEFAULT_ALLOWED_DOMAINS);

    assert.equal(coerced.decision, "create_new");
    assert.equal(coerced.canonical_name, "Digestive Enzymes");
    assert.equal(coerced.manual_review_reason, null);
    assert.equal(validation.ok, true);
    assert.equal(validation.ok ? "research_ready" : "validation_blocked", "research_ready");
  });

  test(`${label} taxonomy create_canonical coerces Protease product-context ambiguity into create_new`, () => {
    const coerced = coerceResearch(
      createValidResearch({
        decision: "manual_review",
        canonical_name: "Protease Enzyme",
        manual_review_reason:
          "Protease is too broad and product-context dependent, so catalog scope is ambiguous rather than a clear standalone consumer supplement.",
      }),
      createForcedCreateCanonicalPolicy("Protease"),
    );
    const validation = validateResearch(coerced, DEFAULT_ALLOWED_DOMAINS);

    assert.equal(coerced.decision, "create_new");
    assert.equal(coerced.canonical_name, "Protease");
    assert.equal(coerced.manual_review_reason, null);
    assert.equal(validation.ok, true);
  });

  test(`${label} taxonomy helper does not coerce Olive Extract manual_review policy rows`, () => {
    const research = createValidResearch({
      decision: "manual_review",
      canonical_name: "Olive Extract",
      manual_review_reason:
        '"Olive Extract" is ambiguous without plant-part and preparation specificity, so it should stay in manual review.',
    });
    const coerced = coerceResearch(research, {
      action: "manual_review",
      reason: "Keep Olive Extract in manual review.",
      source: "db",
    });

    assert.equal(coerced, research);
    const validation = validateResearch(coerced, DEFAULT_ALLOWED_DOMAINS);
    assert.equal(validation.ok, false);
  });

  test(`${label} taxonomy helper does not coerce non-policy manual_review research`, () => {
    const research = createValidResearch({
      decision: "manual_review",
      canonical_name: "Bioflavonoids",
      manual_review_reason:
        "Bioflavonoids is an umbrella class term covering multiple distinct compounds rather than one discrete ingredient.",
    });
    const coerced = coerceResearch(research, null);

    assert.equal(coerced, research);
    const validation = validateResearch(coerced, DEFAULT_ALLOWED_DOMAINS);
    assert.equal(validation.ok, false);
    assert.deepEqual(validation.issues, [research.manual_review_reason]);
  });

  test(`${label} taxonomy helper does not blindly coerce safety manual_review reasons`, () => {
    const research = createValidResearch({
      decision: "manual_review",
      canonical_name: "Bioflavonoids",
      manual_review_reason:
        "Safety profile is too uncertain and adverse interaction risk remains unresolved for this candidate.",
    });
    const coerced = coerceResearch(
      research,
      createForcedCreateCanonicalPolicy("Bioflavonoids"),
    );

    assert.equal(coerced, research);
    const validation = validateResearch(coerced, DEFAULT_ALLOWED_DOMAINS);
    assert.equal(validation.ok, false);
    assert.deepEqual(validation.issues, [research.manual_review_reason]);
  });
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
    () => null,
    (items) => Array.from(new Set((items ?? []).filter(Boolean))),
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
      { supplements: "supplements", aliases: "supplement_aliases" },
      async (table) => {
        if (table === "supplements") return [];
        if (table === "supplement_aliases") return [];
        throw new Error(`Unexpected table: ${table}`);
      },
      () => [],
      () => null,
      async () => {
        throw new Error("applyAliasExisting should not be called");
      },
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

test("edge explicit normalizedNames lookup matches stored watermelon extract row", async () => {
  const supabase = createCandidateQuerySupabase([
    {
      normalized_name: "watermelon extract",
      review_status: "pending",
      suggested_action: "manual_review",
    },
  ]);
  const { buildExplicitCandidateLookupVariants, fetchCandidates } =
    loadEdgeFetchCandidatesHelper()(supabase.client, {
      candidates: "supplement_catalog_review_candidates",
    });

  const result = await fetchCandidates(
    buildExplicitCandidateLookupVariants("watermelon extract"),
    1,
    "",
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].normalized_name, "watermelon extract");
});

test("edge explicit normalizedNames lookup matches hyphenated watermelon-extract request", async () => {
  const supabase = createCandidateQuerySupabase([
    {
      normalized_name: "watermelon extract",
      review_status: "pending",
      suggested_action: "manual_review",
    },
  ]);
  const { buildExplicitCandidateLookupVariants, fetchCandidates } =
    loadEdgeFetchCandidatesHelper()(supabase.client, {
      candidates: "supplement_catalog_review_candidates",
    });

  const variants = buildExplicitCandidateLookupVariants("watermelon-extract");
  const result = await fetchCandidates(variants, 1, "");

  const inOperation = supabase.operations.find((operation) => operation.fn === "in");
  assert.ok(inOperation.values.includes("watermelon extract"));
  assert.equal(result.length, 1);
  assert.equal(result[0].normalized_name, "watermelon extract");
});

test("edge explicit normalizedNames lookup still respects pending review_status", async () => {
  const supabase = createCandidateQuerySupabase([
    {
      normalized_name: "watermelon extract",
      review_status: "applied",
      suggested_action: "manual_review",
    },
  ]);
  const { buildExplicitCandidateLookupVariants, fetchCandidates } =
    loadEdgeFetchCandidatesHelper()(supabase.client, {
      candidates: "supplement_catalog_review_candidates",
    });

  const result = await fetchCandidates(
    buildExplicitCandidateLookupVariants("watermelon extract"),
    1,
    "",
  );

  assert.equal(result.length, 0);
});

test("edge explicit normalizedNames variants dedupe correctly", () => {
  const { buildExplicitCandidateLookupVariants } = loadEdgeFetchCandidatesHelper()(
    { from() { throw new Error("from should not be called"); } },
    { candidates: "supplement_catalog_review_candidates" },
  );

  const variants = Array.from(
    new Set(
      ["watermelon extract", "watermelon-extract"]
        .flatMap(buildExplicitCandidateLookupVariants)
        .filter(Boolean),
    ),
  );

  assert.equal(variants.length, new Set(variants).size);
  assert.ok(variants.includes("watermelon extract"));
});

test("edge bulk fetch behavior remains unchanged without explicit normalizedNames", async () => {
  const supabase = createCandidateQuerySupabase([
    {
      normalized_name: "watermelon extract",
      review_status: "pending",
      suggested_action: "manual_review",
    },
    {
      normalized_name: "choline",
      review_status: "pending",
      suggested_action: "create_canonical",
    },
  ]);
  const { fetchCandidates } = loadEdgeFetchCandidatesHelper()(supabase.client, {
    candidates: "supplement_catalog_review_candidates",
  });

  const result = await fetchCandidates([], 5, "manual_review");

  assert.equal(result.length, 1);
  assert.equal(result[0].normalized_name, "watermelon extract");
  assert.equal(
    supabase.operations.some(
      (operation) =>
        operation.fn === "eq" &&
        operation.column === "suggested_action" &&
        operation.value === "manual_review",
    ),
    true,
  );
});

test("script explicit name lookup matches hyphenated watermelon-extract candidate row", async () => {
  const supabase = createCandidateQuerySupabase([
    {
      normalized_name: "watermelon extract",
      display_name: "Watermelon Extract",
      suggested_supplement_name: "Watermelon Extract",
      review_status: "pending",
      suggested_action: "manual_review",
    },
  ]);

  const result = await fetchScriptCandidates(supabase.client, {
    name: "watermelon-extract",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].normalized_name, "watermelon extract");
  assert.ok(
    buildScriptExplicitCandidateLookupVariants("watermelon-extract").includes(
      "watermelon extract",
    ),
  );
});

test("applyNewSupplement links exact existing Choline canonical instead of creating", async () => {
  const supabase = createInsertSupabaseDouble();
  const aliasCalls = [];
  const { applyNewSupplement } = loadResearchPendingSupplementsApplyNewHelper()(
    async (client, table) => {
      assert.equal(client, supabase.client);
      if (table === "supplements") {
        return [{ id: "supp-choline", name: "Choline", status: "approved" }];
      }
      if (table === "supplement_aliases") {
        return [
          {
            supplement_id: "supp-choline",
            alias: "Choline",
            alias_normalized: "choline",
          },
        ];
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    () => [],
    ({ research }) => ({
      id: "supp-choline",
      name: research.canonical_name,
      status: "approved",
    }),
    (items) => Array.from(new Set((items ?? []).filter(Boolean))),
    () => ({ action: "create_new" }),
    async () => {
      throw new Error("applyPendingSupplementRefresh should not be called");
    },
    async (args) => {
      aliasCalls.push(args);
      return { outcome: "alias_existing", match: args.match, linked: 1, aliasWarnings: [] };
    },
    (value) => (typeof value === "string" ? value.trim() : (value ?? null)),
    (value) => value ?? null,
    async () => {
      throw new Error("applyResearchRelations should not be called");
    },
    async () => {
      throw new Error("markCandidateApplied should not be called");
    },
    async () => {
      throw new Error("markManualReviewResolved should not be called");
    },
  );

  const result = await applyNewSupplement({
    supabase: supabase.client,
    candidate: { normalized_name: "choline", display_name: "Choline" },
    research: createValidResearch({ canonical_name: "Choline", aliases: [] }),
    allowedDomains: DEFAULT_ALLOWED_DOMAINS,
  });

  assert.equal(supabase.inserts.length, 0);
  assert.equal(aliasCalls.length, 1);
  assert.equal(result.outcome, "alias_existing");
  assert.equal(result.match.name, "Choline");
});

test("edge createPendingSupplement links exact existing Choline canonical instead of creating", async () => {
  const supabase = createInsertSupabaseDouble();
  const aliasCalls = [];
  const { createPendingSupplement } =
    loadResearchPendingSupplementsEdgeCreateHelper()(
      supabase.client,
      { supplements: "supplements", aliases: "supplement_aliases" },
      async (table) => {
        if (table === "supplements") {
          return [{ id: "supp-choline", name: "Choline", status: "approved" }];
        }
        if (table === "supplement_aliases") {
          return [
            {
              supplement_id: "supp-choline",
              alias: "Choline",
              alias_normalized: "choline",
            },
          ];
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      () => [],
      () => ({ id: "supp-choline", name: "Choline", status: "approved" }),
      async (...args) => {
        aliasCalls.push(args);
        return {
          outcome: "alias_existing",
          match: { id: "supp-choline", name: "Choline" },
          linked: 1,
          aliasWarnings: [],
        };
      },
      (value) => (typeof value === "string" ? value.trim() : (value ?? null)),
      (value) => value ?? null,
      async () => {
        throw new Error("applyResearchRelations should not be called");
      },
      async () => {
        throw new Error("markCandidateApplied should not be called");
      },
      async () => {
        throw new Error("markManualReviewResolved should not be called");
      },
    );

  const result = await createPendingSupplement(
    { normalized_name: "choline", display_name: "Choline" },
    createValidResearch({ canonical_name: "Choline", aliases: [] }),
  );

  assert.equal(supabase.inserts.length, 0);
  assert.equal(aliasCalls.length, 1);
  assert.equal(result.outcome, "alias_existing");
  assert.equal(result.match.name, "Choline");
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

[
  [
    "script",
    async (buildAliasGuardShortlist, requestStrictAliasReview, aliasReviewPayload) =>
      loadScriptStrictAliasHelper()(
        buildAliasGuardShortlist,
        requestStrictAliasReview,
        aliasReviewPayload,
      ),
    async ({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate,
      research,
    }) =>
      resolveStrictApprovedAliasReview({
        apiKey: "test-key",
        model: "test-model",
        candidate,
        research,
        approvedCatalogEntries: shortlist,
      }),
  ],
  [
    "edge",
    async (buildAliasGuardShortlist, requestStrictAliasReview, aliasReviewPayload) =>
      loadEdgeStrictAliasHelper()(
        buildAliasGuardShortlist,
        requestStrictAliasReview,
        aliasReviewPayload,
      ),
    async ({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate,
      research,
    }) =>
      resolveStrictApprovedAliasReview(candidate, research, shortlist),
  ],
].forEach(([label, loadHelper, runHelper]) => {
  test(`${label} strict alias review releases choline from child-form collisions`, async () => {
    const shortlist = [
      {
        id: "supp-pc",
        name: "Phosphatidylcholine (choline)",
        status: "approved",
        matchedKey: "Phosphatidylcholine (choline)",
      },
      {
        id: "supp-cdp",
        name: "Citicoline (CDP-Choline)",
        status: "approved",
        matchedKey: "Citicoline (CDP-Choline)",
      },
    ];
    let reviewCalls = 0;
    const { resolveStrictApprovedAliasReview } = await loadHelper(
      () => shortlist,
      async () => {
        reviewCalls += 1;
        throw new Error("strict alias review should not be called");
      },
      (items) => items,
    );

    const result = await runHelper({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate: { normalized_name: "choline", display_name: "Choline" },
      research: createValidResearch({
        canonical_name: "Choline",
        aliases: [],
      }),
    });

    assert.equal(result.decision, "create_new");
    assert.equal(reviewCalls, 0);
  });

  test(`${label} strict alias review preserves exact broad canonical magnesium`, async () => {
    const shortlist = [
      {
        id: "supp-magnesium",
        name: "Magnesium",
        status: "approved",
        matchedKey: "Magnesium",
      },
    ];
    const { resolveStrictApprovedAliasReview } = await loadHelper(
      () => shortlist,
      async () => ({
        decision: "alias_existing",
        matched_supplement_id: "supp-magnesium",
        confidence: 0.95,
        reason: "Exact approved canonical exists.",
      }),
      (items) => items,
    );

    const result = await runHelper({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate: { normalized_name: "magnesium", display_name: "Magnesium" },
      research: createValidResearch({
        canonical_name: "Magnesium",
        aliases: [],
      }),
    });

    assert.equal(result.decision, "alias_existing");
    assert.equal(result.match.id, "supp-magnesium");
  });

  test(`${label} strict alias review preserves exact broad canonical zinc`, async () => {
    const shortlist = [
      {
        id: "supp-zinc",
        name: "Zinc",
        status: "approved",
        matchedKey: "Zinc",
      },
    ];
    const { resolveStrictApprovedAliasReview } = await loadHelper(
      () => shortlist,
      async () => ({
        decision: "alias_existing",
        matched_supplement_id: "supp-zinc",
        confidence: 0.95,
        reason: "Exact approved canonical exists.",
      }),
      (items) => items,
    );

    const result = await runHelper({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate: { normalized_name: "zinc", display_name: "Zinc" },
      research: createValidResearch({
        canonical_name: "Zinc",
        aliases: [],
      }),
    });

    assert.equal(result.decision, "alias_existing");
    assert.equal(result.match.id, "supp-zinc");
  });

  test(`${label} strict alias review keeps ambiguous peer canonicals in manual_review`, async () => {
    const shortlist = [
      {
        id: "supp-a",
        name: "L-Methylfolate",
        status: "approved",
        matchedKey: "L-Methylfolate",
      },
      {
        id: "supp-b",
        name: "Calcium Methylfolate",
        status: "approved",
        matchedKey: "Calcium Methylfolate",
      },
    ];
    const { resolveStrictApprovedAliasReview } = await loadHelper(
      () => shortlist,
      async () => ({
        decision: "manual_review",
        matched_supplement_id: null,
        confidence: 0.62,
        reason: "Multiple approved supplements remain plausible matches.",
      }),
      (items) => items,
    );

    const result = await runHelper({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate: {
        normalized_name: "methylfolate",
        display_name: "Methylfolate",
      },
      research: createValidResearch({
        canonical_name: "Methylfolate",
        aliases: [],
      }),
    });

    assert.equal(result.decision, "manual_review");
    assert.match(
      result.reason,
      /Multiple approved supplements remain plausible matches/,
    );
  });
});

[
  [
    "script",
    scriptShouldBypassStrictAliasGuard,
    async (buildAliasGuardShortlist, requestStrictAliasReview, aliasReviewPayload) =>
      loadScriptStrictAliasHelper()(
        buildAliasGuardShortlist,
        requestStrictAliasReview,
        aliasReviewPayload,
      ),
    async ({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate,
      research,
    }) =>
      resolveStrictApprovedAliasReview({
        apiKey: "test-key",
        model: "test-model",
        candidate,
        research,
        approvedCatalogEntries: shortlist,
      }),
  ],
  [
    "edge",
    edgeShouldBypassStrictAliasGuard,
    async (buildAliasGuardShortlist, requestStrictAliasReview, aliasReviewPayload) =>
      loadEdgeStrictAliasHelper()(
        buildAliasGuardShortlist,
        requestStrictAliasReview,
        aliasReviewPayload,
      ),
    async ({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate,
      research,
    }) =>
      resolveStrictApprovedAliasReview(candidate, research, shortlist),
  ],
].forEach(([label, shouldBypassStrictAliasGuard, loadHelper, runHelper]) => {
  test(`${label} Digestive Enzymes taxonomy create_canonical bypasses strict alias manual_review`, async () => {
    const shortlist = [
      {
        id: "supp-lactase",
        name: "Lactase",
        status: "approved",
        matchedKey: "Lactase",
      },
    ];
    const { resolveStrictApprovedAliasReview } = await loadHelper(
      () => shortlist,
      async () => ({
        decision: "manual_review",
        matched_supplement_id: null,
        confidence: 0.73,
        reason: "Lactase remains a plausible alias target for digestive enzymes.",
      }),
      (items) => items,
    );
    const candidate = {
      normalized_name: "digestive enzymes",
      display_name: "Digestive Enzymes",
    };
    const research = createValidResearch({
      canonical_name: "Digestive Enzymes",
      aliases: [],
    });
    const strictAliasDecision = await runHelper({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate,
      research,
    });

    assert.equal(strictAliasDecision.decision, "manual_review");
    assert.equal(
      shouldBypassStrictAliasGuard(
        createForcedCreateCanonicalPolicy("Digestive Enzymes"),
      ),
      true,
    );
    const finalDecision = shouldBypassStrictAliasGuard(
      createForcedCreateCanonicalPolicy("Digestive Enzymes"),
    )
      ? "create_new"
      : strictAliasDecision.decision === "manual_review"
        ? "identity_conflict"
        : "create_new";
    assert.equal(finalDecision, "create_new");
  });

  test(`${label} non-policy digestive-enzyme-like ambiguity still triggers strict alias manual_review`, async () => {
    const shortlist = [
      {
        id: "supp-lactase",
        name: "Lactase",
        status: "approved",
        matchedKey: "Lactase",
      },
    ];
    const { resolveStrictApprovedAliasReview } = await loadHelper(
      () => shortlist,
      async () => ({
        decision: "manual_review",
        matched_supplement_id: null,
        confidence: 0.73,
        reason: "Lactase remains a plausible alias target for digestive enzymes.",
      }),
      (items) => items,
    );
    const strictAliasDecision = await runHelper({
      resolveStrictApprovedAliasReview,
      shortlist,
      candidate: {
        normalized_name: "digestive enzymes complex",
        display_name: "Digestive Enzymes Complex",
      },
      research: createValidResearch({
        canonical_name: "Digestive Enzymes Complex",
        aliases: [],
      }),
    });

    assert.equal(shouldBypassStrictAliasGuard(null), false);
    assert.equal(strictAliasDecision.decision, "manual_review");
    const finalDecision = shouldBypassStrictAliasGuard(null)
      ? "create_new"
      : strictAliasDecision.decision === "manual_review"
        ? "identity_conflict"
        : "create_new";
    assert.equal(finalDecision, "identity_conflict");
  });
});

function catalogEntry(name) {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    status: "approved",
    aliases: [],
    lookupKeys: [name],
  };
}

[
  [
    "script",
    buildCodeTaxonomyPolicyMap,
    buildTaxonomyPolicyMap,
    resolveScriptTaxonomyPolicy,
  ],
  [
    "edge",
    buildEdgeCodeTaxonomyPolicyMap,
    buildEdgeTaxonomyPolicyMap,
    resolveEdgeTaxonomyPolicy,
  ],
].forEach(([label, buildCodeMap, buildDbMap, resolvePolicy]) => {
  test(`${label} taxonomy policy resolves bioflavonoids as create_canonical`, () => {
    const result = resolvePolicy(
      "bioflavonoids",
      [],
      buildCodeMap(),
    );

    assert.equal(result.action, "create_canonical");
    assert.equal(result.canonicalName, "Bioflavonoids");
  });

  test(`${label} taxonomy policy resolves live cultures to approved Probiotics`, () => {
    const result = resolvePolicy(
      "live cultures",
      [
        {
          id: "cda42a67-b951-48f7-8941-1221fd9e6117",
          name: "Probiotics",
          status: "approved",
          aliases: [],
          lookupKeys: ["Probiotics"],
        },
      ],
      buildCodeMap(),
    );

    assert.equal(result.action, "alias_existing");
    assert.equal(result.match.name, "Probiotics");
  });

  test(`${label} taxonomy policy fails closed when alias target is missing`, () => {
    const result = resolvePolicy(
      "live cultures",
      [],
      buildDbMap([
        {
          normalized_name: "live cultures",
          action: "alias_existing",
          target_supplement_id: "deadbeef-dead-beef-dead-beefdeadbeef",
          target_supplement_name: "Probiotics",
          reason: "Alias target should be approved.",
          active: true,
        },
      ]),
    );

    assert.equal(result.action, "manual_review");
    assert.match(result.reason, /alias target is missing or not approved/i);
  });
});

test("script exact approved match preserves raw normalized names for botanicals", () => {
  const result = findExactApprovedCatalogMatch(
    {
      normalized_name: normalizeExactPolicyName("Olive Extract"),
      display_name: "Olive Extract",
    },
    [catalogEntry("Olive Leaf Extract")],
  );

  assert.equal(result, null);
});

[
  ["script", findScriptDuplicateCandidate],
  ["edge", findEdgeDuplicateCandidate],
].forEach(([label, findDuplicate]) => {
  test(`${label} duplicate finder treats choline as create_new against specific forms`, () => {
    const result = findDuplicate("Choline", [
      catalogEntry("Choline Bitartrate"),
      catalogEntry("Choline Citrate"),
    ]);

    assert.equal(result.action, "create_new");
  });

  test(`${label} duplicate finder treats magnesium as create_new against specific forms`, () => {
    const result = findDuplicate("Magnesium", [
      catalogEntry("Magnesium Glycinate"),
      catalogEntry("Magnesium Citrate"),
    ]);

    assert.equal(result.action, "create_new");
  });

  test(`${label} duplicate finder treats zinc as create_new against specific forms`, () => {
    const result = findDuplicate("Zinc", [
      catalogEntry("Zinc Picolinate"),
      catalogEntry("Zinc Bisglycinate"),
    ]);

    assert.equal(result.action, "create_new");
  });

  test(`${label} duplicate finder links citicoline when canonical exists`, () => {
    const result = findDuplicate("Citicoline", [
      catalogEntry("Citicoline"),
      catalogEntry("Choline Bitartrate"),
    ]);

    assert.equal(result.action, "alias_existing");
    assert.equal(result.match.name, "Citicoline");
  });

  test(`${label} duplicate finder links phosphatidylcholine when canonical exists`, () => {
    const result = findDuplicate("Phosphatidylcholine", [
      catalogEntry("Phosphatidylcholine"),
      catalogEntry("Choline"),
    ]);

    assert.equal(result.action, "alias_existing");
    assert.equal(result.match.name, "Phosphatidylcholine");
  });

  test(`${label} duplicate finder sends conflicting strong matches to manual_review`, () => {
    const result = findDuplicate("Methylfolate", [
      catalogEntry("L-Methylfolate"),
      catalogEntry("Calcium Methylfolate"),
    ]);

    assert.equal(result.action, "manual_review");
  });

  test(`${label} duplicate finder keeps lone weak alias matches as create_new`, () => {
    const result = findDuplicate("Collagen Support Peptides", [
      catalogEntry("Collagen Peptides"),
    ]);

    assert.equal(result.action, "create_new");
  });
});

test("script queue mapping writes alias_existing as ignore", () => {
  assert.equal(queueSuggestedActionForDecision("alias_existing"), "ignore");
});

test("script queue mapping writes ignore as ignore", () => {
  assert.equal(queueSuggestedActionForDecision("ignore"), "ignore");
});

test("script queue sync writes suggested_action ignore for alias_existing", async () => {
  const updates = [];
  const { syncCandidateQueueDecision } = loadScriptSyncCandidateQueueDecisionHelper()(
    (value) => String(value ?? "").trim(),
    (value) => (typeof value === "string" ? value.trim() : (value ?? null)),
  );
  const supabase = {
    from(table) {
      assert.equal(table, "supplement_catalog_review_candidates");
      return {
        update(payload) {
          updates.push(payload);
          return {
            eq(column, value) {
              assert.equal(column, "normalized_name");
              assert.equal(value, "choline");
              return { error: null };
            },
          };
        },
      };
    },
  };

  await syncCandidateQueueDecision(supabase, {
    candidate: { normalized_name: "choline" },
    decision: "alias_existing",
    reason: "Exact existing supplement match: Choline",
    match: { name: "Choline" },
    research: null,
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].suggested_action, "ignore");
});

test("edge queue sync writes suggested_action ignore for alias_existing", async () => {
  const updates = [];
  const adminSupabase = {
    from(table) {
      assert.equal(table, "supplement_catalog_review_candidates");
      return {
        update(payload) {
          updates.push(payload);
          return {
            eq(column, value) {
              assert.equal(column, "normalized_name");
              assert.equal(value, "choline");
              return { error: null };
            },
          };
        },
      };
    },
  };
  const { syncCandidateQueueDecision } = loadEdgeSyncCandidateQueueDecisionHelper()(
    adminSupabase,
    { candidates: "supplement_catalog_review_candidates" },
    (value) => String(value ?? "").trim(),
    (value) => (typeof value === "string" ? value.trim() : (value ?? null)),
  );

  await syncCandidateQueueDecision(
    { normalized_name: "choline" },
    {
      decision: "alias_existing",
      reason: "Exact existing supplement match: Choline",
      match_name: "Choline",
      research: null,
    },
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].suggested_action, "ignore");
});

test("process photo rescue preserves existing ignore suggestions", () => {
  const { resolveSuggestedAction } = loadProcessPhotoRescueSuggestedActionHelper();

  assert.equal(
    resolveSuggestedAction({ suggested_action: "ignore" }),
    "ignore",
  );
  assert.equal(resolveSuggestedAction(null), "manual_review");
});

[
  [
    "script",
    scriptDecisionAllowsPendingManualReviewEscape,
    findScriptDuplicateCandidate,
  ],
  [
    "edge",
    edgeDecisionAllowsPendingManualReviewEscape,
    findEdgeDuplicateCandidate,
  ],
].forEach(([label, decisionAllowsEscape, findDuplicate]) => {
  test(`${label} pending review plus fresh create_new proceeds`, () => {
    assert.equal(decisionAllowsEscape("create_new"), true);
  });

  test(`${label} pending review plus fresh alias_existing proceeds`, () => {
    assert.equal(decisionAllowsEscape("alias_existing"), true);
  });

  test(`${label} pending review plus fresh manual_review stays blocked`, () => {
    assert.equal(decisionAllowsEscape("manual_review"), false);
  });

  test(`${label} choline with pending review can proceed to create_new`, () => {
    const result = findDuplicate(
      "Choline",
      [
        catalogEntry("Choline Bitartrate"),
        catalogEntry("Choline Citrate"),
      ],
    );

    assert.equal(result.action, "create_new");
    assert.equal(decisionAllowsEscape(result.action), true);
  });
});
