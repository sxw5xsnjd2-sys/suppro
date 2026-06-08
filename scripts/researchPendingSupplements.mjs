import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_MODEL = process.env.SUPPLEMENT_RESEARCH_MODEL || "gpt-5.4-mini";
const DEFAULT_OUTPUT_DIR = path.join(
  PROJECT_ROOT,
  "supabase",
  "pending_supplement_research",
);
const MANUAL_REVIEW_TABLE = "supplement_research_manual_reviews";

const OFFICIAL_SOURCE_DOMAINS = [
  "clinicaltrials.gov",
  "fda.gov",
  "ema.europa.eu",
  "efsa.europa.eu",
  "nccih.nih.gov",
  "ncbi.nlm.nih.gov",
  "nhs.uk",
  "nih.gov",
  "ods.od.nih.gov",
  "who.int",
];

const JOURNAL_SOURCE_DOMAINS = [
  "academic.oup.com",
  "bmc.com",
  "bmj.com",
  "cambridge.org",
  "cochranelibrary.com",
  "doi.org",
  "dx.doi.org",
  "frontiersin.org",
  "jamanetwork.com",
  "journals.plos.org",
  "karger.com",
  "link.springer.com",
  "mdpi.com",
  "nature.com",
  "nejm.org",
  "onlinelibrary.wiley.com",
  "pmc.ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "sagepub.com",
  "sciencedirect.com",
  "springer.com",
  "tandfonline.com",
  "thelancet.com",
  "wiley.com",
];

const DEFAULT_ALLOWED_DOMAINS = [
  ...new Set([...OFFICIAL_SOURCE_DOMAINS, ...JOURNAL_SOURCE_DOMAINS]),
];

const BENEFIT_LABELS = [
  "Anti-aging",
  "Anti-inflammatory",
  "Blood pressure control",
  "Blood sugar control",
  "Bone health",
  "Cardiovascular health",
  "Cholesterol support",
  "Cognitive support",
  "Concentration enhancing",
  "Digestive health",
  "Endurance enhancing",
  "Energy enhancing",
  "Exercise recovery",
  "Female fertility",
  "Female hormone balance",
  "Female sexual arousal",
  "Hair health",
  "Immune health",
  "Injury recovery",
  "Joint health",
  "Lymphatic/swelling support",
  "Male fertility",
  "Male sexual performance",
  "Memory enhancing",
  "Mood support",
  "Skin health",
  "Sleep support",
  "Stress relief",
  "Strength enhancing",
  "Testosterone boosting",
  "Urine system health",
  "Weight management",
];

const STATUS_VISIBLE = ["approved", "pending"];
const PRODUCT_LIKE_PATTERNS = [
  /\bby\s+[a-z0-9]/i,
  /\b(blend|formula|matrix|stack)\b/i,
  /\b\d+\s*(mg|mcg|ug|g|ml|iu)\b/i,
  /[®™]/,
];

function loadDotEnv() {
  let text = "";
  try {
    text = readFileSync(path.join(PROJECT_ROOT, ".env"), "utf8");
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "OPENAI_API_KEY" || !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (typeof inlineValue === "string") {
      flags[key] = inlineValue;
      continue;
    }
    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = nextToken;
    index += 1;
  }
  return flags;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeDoseUnit(value) {
  const normalized = trimString(value).replace(/[µμ]/g, "μ");
  if (!normalized) return null;
  const lowered = normalized.toLowerCase().replace(/\s+/g, "");
  if (lowered === "g/day" || lowered === "gperday") return "g";
  if (lowered === "mg/day" || lowered === "mgperday") return "mg";
  if (lowered === "mcg/day" || lowered === "ug/day" || lowered === "μg/day") {
    return "mcg";
  }
  if (lowered === "ml/day" || lowered === "mlperday") return "ml";
  if (lowered === "cfu/day" || lowered === "cfuperday") return "CFU";
  if (lowered === "iu/day" || lowered === "iuperday") return "IU";
  if (lowered === "ug" || lowered === "mcg" || normalized === "μg")
    return "mcg";
  if (lowered === "iu") return "IU";
  if (lowered === "cfu") return "CFU";
  if (lowered === "mg") return "mg";
  if (lowered === "g") return "g";
  if (lowered === "ml") return "ml";
  return normalized;
}

function normalizeJsonDoseUnits(research) {
  if (!research || typeof research !== "object") return research;

  const next = { ...research };
  if (
    next.recommended_dose_json &&
    typeof next.recommended_dose_json === "object"
  ) {
    next.recommended_dose_json = {
      ...next.recommended_dose_json,
      unit: normalizeDoseUnit(next.recommended_dose_json.unit),
    };
  }

  if (
    next.dose_scoring_profile_json &&
    typeof next.dose_scoring_profile_json === "object"
  ) {
    next.dose_scoring_profile_json = {
      ...next.dose_scoring_profile_json,
      unit: normalizeDoseUnit(next.dose_scoring_profile_json.unit),
    };
  }

  return next;
}

function stripGeneratedSourceLinks(value) {
  return normalizeText(value)
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/\(\s*https?:\/\/[^)]+\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeResearchProse(research) {
  if (!research || typeof research !== "object") return research;
  const textFields = [
    "what_is_it",
    "why_use_it",
    "how_does_it_work",
    "side_effects",
    "risks_and_interactions",
    "who_might_benefit",
    "evidence",
    "how_to_use",
  ];
  const next = { ...research };
  for (const field of textFields) {
    if (typeof next[field] === "string")
      next[field] = stripGeneratedSourceLinks(next[field]);
  }
  if (Array.isArray(next.benefits)) {
    next.benefits = next.benefits.map((benefit) => {
      if (!benefit || typeof benefit !== "object") return benefit;
      const evidenceText =
        typeof benefit.evidence === "string"
          ? stripGeneratedSourceLinks(benefit.evidence)
          : benefit.evidence;
      return {
        ...benefit,
        evidence: normalizeBenefitEvidenceStyle(
          evidenceText,
          benefit,
          next.citations,
        ),
        ranking_reason:
          typeof benefit.ranking_reason === "string"
            ? stripGeneratedSourceLinks(benefit.ranking_reason)
            : benefit.ranking_reason,
      };
    });
  }
  return next;
}

function normalizeBenefitEvidenceStyle(evidence, benefit, citations) {
  const evidenceText = stripGeneratedSourceLinks(evidence);
  if (
    !evidenceText ||
    (evidenceText.includes(":") && evidenceText.includes('"'))
  ) {
    return evidenceText;
  }

  const sourceUrls = Array.isArray(benefit?.source_urls)
    ? benefit.source_urls
    : [];
  const citation = (Array.isArray(citations) ? citations : []).find((item) =>
    sourceUrls.includes(item?.url),
  );
  if (!citation) return evidenceText;

  const authors = trimString(citation.authors) || "Source authors";
  const year = citation.year ?? "n.d.";
  const source =
    trimString(citation.journal) || trimString(citation.domain) || "Source";
  const title = trimString(citation.title);
  if (!title) return evidenceText;

  return `${authors} (${year}), ${source}: "${title}." ${evidenceText}`;
}

function hasDoseLikeText(value) {
  return /\b\d+(?:[.,]\d+)?(?:\s*(?:-|to)\s*\d+(?:[.,]\d+)?)?\s*(?:mg|g|mcg|ug|μg|iu|cfu|million|billion)\b/i.test(
    normalizeText(value),
  );
}

function researchHasAvailableDose(result) {
  const dose = result?.recommended_dose_json;
  if (!dose || typeof dose !== "object") return false;
  if (!["parsed", "ambiguous"].includes(result?.recommended_dose_status))
    return false;

  if (hasDoseLikeText(dose.source_text)) return true;
  return [
    dose.per_intake_min_value,
    dose.per_intake_max_value,
    dose.frequency_min_per_day,
    dose.frequency_max_per_day,
  ].some((value) => Number.isFinite(Number(value)));
}

function mentionsProductExampleDose(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;

  return [
    /\b(sample|source|provided|example)\s+product\b/,
    /\bproduct\s+example\b/,
    /\bproduct\s+label\b/,
    /\blabel(?:ed)?\s+amount\b/,
    /\blisted\s+in\s+the\s+(?:source|provided|sample)\s+product\b/,
  ].some((pattern) => pattern.test(text));
}

function mentionsMetaSourcePhrasing(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;

  return [
    /\b(?:the|this)\s+(?:review|study|paper|trial|fact sheet|source|meta-analysis)\s+(?:notes|says|states|shows|reported|reports|found|finds|suggests)\b/,
    /\baccording to (?:the|this)\s+(?:review|study|paper|trial|fact sheet|source|meta-analysis)\b/,
    /\bthe returned evidence\b/,
    /\bthe retrieved sources?\b/,
  ].some((pattern) => pattern.test(text));
}

function normalizeText(value) {
  return trimString(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(extract|powder|capsules?|tablets?|supplements?|root|leaf|seed|oil)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function lookupTokens(value) {
  return normalizeLookupText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function vitaminKey(value) {
  const normalized = normalizeLookupText(value);
  const match = normalized.match(/\bvitamin\s+([a-z][0-9]*)\b/);
  return match ? `vitamin ${match[1]}` : "";
}

function scoreLookupMatch(inputName, lookupName) {
  const input = normalizeLookupText(inputName);
  const lookup = normalizeLookupText(lookupName);
  if (!input || !lookup) return 0;
  if (input === lookup) return 100;
  const inputVitamin = vitaminKey(input);
  const lookupVitamin = vitaminKey(lookup);
  if (inputVitamin && lookupVitamin && inputVitamin !== lookupVitamin) return 0;
  if (lookup.includes(input) || input.includes(lookup)) return 90;

  const inputTokens = lookupTokens(input);
  const lookupTokenSet = new Set(lookupTokens(lookup));
  if (!inputTokens.length || !lookupTokenSet.size) return 0;

  const overlap = inputTokens.filter((token) =>
    lookupTokenSet.has(token),
  ).length;
  const coverage = overlap / inputTokens.length;
  const reverseCoverage = overlap / lookupTokenSet.size;
  return Math.round(coverage * 70 + reverseCoverage * 20);
}

function canonicalCandidateName(candidate) {
  return (
    trimString(candidate?.suggested_supplement_name) ||
    trimString(candidate?.display_name) ||
    trimString(candidate?.normalized_name)
  );
}

function looksLikeBrandedProduct(value) {
  const text = trimString(value);
  if (!text) return false;
  return PRODUCT_LIKE_PATTERNS.some((pattern) => pattern.test(text));
}

function buildCatalogEntries(supplements, aliases) {
  const byId = new Map();
  for (const row of supplements ?? []) {
    if (!row?.id || !trimString(row?.name)) continue;
    byId.set(row.id, {
      id: row.id,
      name: trimString(row.name),
      status: trimString(row.status),
      aliases: [],
      lookupKeys: [trimString(row.name)],
    });
  }

  for (const alias of aliases ?? []) {
    const entry = byId.get(alias?.supplement_id);
    if (!entry) continue;
    const aliasText =
      trimString(alias?.alias) || trimString(alias?.alias_normalized);
    if (!aliasText) continue;
    entry.aliases.push(aliasText);
    entry.lookupKeys.push(aliasText);
  }

  return Array.from(byId.values());
}

function findDuplicateCandidate(candidateName, catalogEntries) {
  const scored = [];
  for (const entry of catalogEntries) {
    let bestScore = 0;
    let matchedKey = "";
    for (const key of entry.lookupKeys) {
      const score = scoreLookupMatch(candidateName, key);
      if (score > bestScore) {
        bestScore = score;
        matchedKey = key;
      }
    }
    if (bestScore >= 55) {
      scored.push({ ...entry, score: bestScore, matchedKey });
    }
  }

  scored.sort(
    (left, right) =>
      right.score - left.score || left.name.localeCompare(right.name),
  );
  const best = scored[0] ?? null;
  if (!best) {
    return { action: "create_new", shortlist: [] };
  }
  if (best.score >= 90) {
    return {
      action: "alias_existing",
      match: best,
      shortlist: scored.slice(0, 5),
    };
  }
  return { action: "needs_alias_review", shortlist: scored.slice(0, 8) };
}

function buildAliasGuardShortlist({
  candidate,
  research,
  catalogEntries,
  limit = 8,
}) {
  const candidateNames = dedupeStrings([
    canonicalCandidateName(candidate),
    candidate?.display_name,
    candidate?.normalized_name,
    research?.canonical_name,
    ...(Array.isArray(research?.aliases) ? research.aliases : []),
  ]);
  const scored = [];

  for (const entry of catalogEntries) {
    let bestScore = 0;
    let matchedKey = "";
    let matchedInput = "";
    for (const inputName of candidateNames) {
      for (const key of entry.lookupKeys) {
        const score = scoreLookupMatch(inputName, key);
        if (score > bestScore) {
          bestScore = score;
          matchedKey = key;
          matchedInput = inputName;
        }
      }
    }
    if (bestScore >= 45) {
      scored.push({ ...entry, score: bestScore, matchedKey, matchedInput });
    }
  }

  return scored
    .sort(
      (left, right) =>
        right.score - left.score || left.name.localeCompare(right.name),
    )
    .slice(0, limit);
}

function filterApprovedCatalogEntries(catalogEntries) {
  return (catalogEntries ?? []).filter(
    (entry) => trimString(entry?.status) === "approved",
  );
}

function aliasReviewPayload(shortlist) {
  return shortlist.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    matched_key: item.matchedKey,
    matched_input: item.matchedInput,
    local_score: item.score,
    aliases: item.aliases.slice(0, 12),
  }));
}

function aliasReviewAllowsCreateNew(review) {
  if (review?.decision === "create_new") return true;
  if (review?.decision !== "manual_review") return false;
  const reason = trimString(review.reason).toLowerCase();
  return [
    "none is a plausible",
    "none are plausible",
    "no plausible",
    "no match",
    "not a plausible",
    "unrelated",
    "do not represent it",
  ].some((term) => reason.includes(term));
}

function buildStrictAliasReviewPrompt(candidate, research) {
  return [
    `research canonical name: ${normalizeText(research?.canonical_name) || canonicalCandidateName(candidate)}`,
    `original candidate: ${canonicalCandidateName(candidate)}`,
    `display name: ${trimString(candidate?.display_name) || "none"}`,
    `known aliases: ${dedupeStrings(research?.aliases ?? []).join(", ") || "none"}`,
  ].join("\n");
}

function buildHeaders(apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENAI_PROJECT_ID)
    headers["OpenAI-Project"] = process.env.OPENAI_PROJECT_ID;
  if (process.env.OPENAI_ORGANIZATION_ID) {
    headers["OpenAI-Organization"] = process.env.OPENAI_ORGANIZATION_ID;
  }
  return headers;
}

async function openAiFetchWithRetry(url, options, attempts = 4) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (
        response.ok ||
        ![408, 409, 429, 500, 502, 503, 504].includes(response.status)
      ) {
        return response;
      }
      lastError = new Error(`OpenAI retryable status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
  }
  throw lastError ?? new Error("OpenAI request failed");
}

function extractResponseText(body) {
  if (typeof body?.output_text === "string") return body.output_text;
  const chunks = [];
  for (const item of body?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (
        content?.type === "output_text" &&
        typeof content?.text === "string"
      ) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("");
}

async function requestStructuredResponse({
  apiKey,
  model,
  instructions,
  input,
  schema,
  tools = [],
}) {
  const response = await openAiFetchWithRetry(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        instructions,
        input,
        tools,
        tool_choice: tools.length ? "auto" : "none",
        include: tools.length ? ["web_search_call.action.sources"] : undefined,
        text: {
          format: {
            type: "json_schema",
            name: schema.name,
            strict: true,
            schema: schema.schema,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  const text = extractResponseText(body);
  if (!text) {
    throw new Error("OpenAI returned no structured output text");
  }
  return JSON.parse(text);
}

function aliasReviewSchema() {
  return {
    name: "supplement_alias_review",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["decision", "matched_supplement_id", "confidence", "reason"],
      properties: {
        decision: {
          type: "string",
          enum: ["alias_existing", "create_new", "manual_review"],
        },
        matched_supplement_id: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
    },
  };
}

function recommendedDoseSchema() {
  const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
  return {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        required: [
          "unit",
          "flags",
          "confidence",
          "source_text",
          "parser_method",
          "per_intake_max_value",
          "per_intake_min_value",
          "frequency_max_per_day",
          "frequency_min_per_day",
        ],
        properties: {
          unit: nullableString,
          flags: { type: "array", items: { type: "string" } },
          confidence: nullableNumber,
          source_text: nullableString,
          parser_method: nullableString,
          per_intake_max_value: nullableNumber,
          per_intake_min_value: nullableNumber,
          frequency_max_per_day: nullableNumber,
          frequency_min_per_day: nullableNumber,
        },
      },
      { type: "null" },
    ],
  };
}

function researchSchema() {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
  const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
  const citation = {
    type: "object",
    additionalProperties: false,
    required: [
      "url",
      "title",
      "authors",
      "journal",
      "domain",
      "year",
      "evidence_type",
      "finding",
      "limitation",
    ],
    properties: {
      url: { type: "string" },
      title: { type: "string" },
      authors: { type: "string" },
      journal: nullableString,
      domain: { type: "string" },
      year: { anyOf: [{ type: "integer" }, { type: "null" }] },
      evidence_type: { type: "string" },
      finding: { type: "string" },
      limitation: { type: "string" },
    },
  };

  return {
    name: "pending_supplement_research",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "decision",
        "manual_review_reason",
        "canonical_name",
        "aliases",
        "what_is_it",
        "why_use_it",
        "how_does_it_work",
        "side_effects",
        "risks_and_interactions",
        "who_might_benefit",
        "evidence",
        "evidence_score",
        "how_to_use",
        "recommended_dose_status",
        "recommended_dose_json",
        "dose_scoring_profile_json",
        "benefits",
        "citations",
      ],
      properties: {
        decision: {
          type: "string",
          enum: ["create_new", "manual_review", "create_precise"],
        },
        manual_review_reason: nullableString,
        canonical_name: { type: "string" },
        aliases: { type: "array", items: { type: "string" } },
        what_is_it: { type: "string" },
        why_use_it: { type: "string" },
        how_does_it_work: nullableString,
        side_effects: nullableString,
        risks_and_interactions: nullableString,
        who_might_benefit: nullableString,
        evidence: { type: "string" },
        evidence_score: { type: "integer", minimum: 0, maximum: 100 },
        how_to_use: { type: "string" },
        recommended_dose_status: {
          type: "string",
          enum: ["parsed", "ambiguous", "unscorable", "missing"],
        },
        recommended_dose_json: recommendedDoseSchema(),
        dose_scoring_profile_json: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: [
                "unit",
                "source",
                "notes",
                "target_max_value",
                "target_min_value",
                "effective_min_value",
              ],
              properties: {
                unit: nullableString,
                source: nullableString,
                notes: nullableString,
                target_max_value: nullableNumber,
                target_min_value: nullableNumber,
                effective_min_value: nullableNumber,
              },
            },
            { type: "null" },
          ],
        },
        benefits: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "label",
              "evidence_rating",
              "score",
              "evidence",
              "ranking_reason",
              "source_urls",
            ],
            properties: {
              label: { type: "string", enum: BENEFIT_LABELS },
              evidence_rating: {
                type: "string",
                enum: ["gold", "silver", "bronze"],
              },
              score: { type: "integer", minimum: 0, maximum: 100 },
              evidence: { type: "string" },
              ranking_reason: { type: "string" },
              source_urls: {
                type: "array",
                minItems: 1,
                items: { type: "string" },
              },
            },
          },
        },
        citations: { type: "array", items: citation },
      },
    },
  };
}

async function requestAliasReview({ apiKey, model, candidateName, shortlist }) {
  return requestStructuredResponse({
    apiKey,
    model,
    schema: aliasReviewSchema(),
    instructions: [
      "Classify whether a supplement candidate is an alias of an existing supplement or a genuinely new canonical supplement.",
      "Prefer alias_existing when the candidate is a shorter, spelling, plant-part, dosage-form, or common-name variant of an existing row.",
      "Return manual_review when the distinction is medically meaningful or uncertain.",
      "Do not create duplicate supplements. For example, beetroot should be treated as an alias of beetroot juice/dietary nitrates when that is the best existing match.",
    ].join(" "),
    input: JSON.stringify(
      { candidate_name: candidateName, existing_supplements: shortlist },
      null,
      2,
    ),
  });
}

async function requestStrictAliasReview({
  apiKey,
  model,
  candidate,
  research,
  shortlist,
}) {
  return requestStructuredResponse({
    apiKey,
    model,
    schema: aliasReviewSchema(),
    instructions: [
      "You are the final duplicate-prevention gate before creating a brand-new approved canonical supplement.",
      "Existing rows are approved canonical supplements and their aliases only.",
      "Choose alias_existing only when the candidate and researched canonical name clearly refer to the same underlying active ingredient as one shortlist item.",
      "Choose create_new only when the candidate is clearly distinct from every shortlist item.",
      "Choose manual_review whenever confidence is limited, multiple shortlist items remain plausible, or the distinction is medically meaningful.",
      "Be conservative. Avoid creating duplicate canonical supplements.",
    ].join(" "),
    input: JSON.stringify(
      {
        candidate_summary: buildStrictAliasReviewPrompt(candidate, research),
        existing_approved_supplements: shortlist,
      },
      null,
      2,
    ),
  });
}

async function resolveStrictApprovedAliasReview({
  apiKey,
  model,
  candidate,
  research,
  approvedCatalogEntries,
}) {
  const shortlist = buildAliasGuardShortlist({
    candidate,
    research,
    catalogEntries: approvedCatalogEntries,
  });
  if (!shortlist.length) {
    return {
      decision: "create_new",
      reason:
        "No plausible approved supplement matches found in strict alias review.",
      shortlist,
    };
  }

  const review = await requestStrictAliasReview({
    apiKey,
    model,
    candidate,
    research,
    shortlist: aliasReviewPayload(shortlist),
  });
  const confidence = Number(review?.confidence);

  if (review?.decision === "alias_existing") {
    if (!Number.isFinite(confidence) || confidence < 0.85) {
      return {
        decision: "manual_review",
        reason: `Strict alias confidence too low: ${String(review?.reason ?? "")}`,
        shortlist,
        review,
      };
    }
    const match = shortlist.find(
      (item) => item.id === review?.matched_supplement_id,
    );
    if (!match) {
      return {
        decision: "manual_review",
        reason: "Strict alias review returned an unknown supplement id.",
        shortlist,
        review,
      };
    }
    return {
      decision: "alias_existing",
      reason: String(review?.reason ?? ""),
      match,
      shortlist,
      review,
    };
  }

  if (review?.decision === "create_new") {
    if (!Number.isFinite(confidence) || confidence < 0.85) {
      return {
        decision: "manual_review",
        reason: `Strict create-new confidence too low: ${String(review?.reason ?? "")}`,
        shortlist,
        review,
      };
    }
    return {
      decision: "create_new",
      reason: String(review?.reason ?? ""),
      shortlist,
      review,
    };
  }

  return {
    decision: "manual_review",
    reason:
      String(review?.reason ?? "") || "Strict alias review remained ambiguous.",
    shortlist,
    review,
  };
}

async function requestResearch({
  apiKey,
  model,
  candidate,
  benefitRankings,
  allowedDomains,
}) {
  return requestStructuredResponse({
    apiKey,
    model,
    schema: researchSchema(),
    tools: [
      {
        type: "web_search",
        filters: {
          allowed_domains: allowedDomains,
        },
      },
    ],
    instructions: [
      "Research a supplement active ingredient and return database-ready JSON for a pending active-ingredient catalog row.",
      "This database table is for canonical active ingredients only, not branded supplements, blends, formulas, product lines, dosage forms, or finished products.",
      "If the candidate is ambiguous but can be safely normalized to a single precise canonical active ingredient, return decision create_precise and set canonical_name to that precise ingredient. Return manual_review only when no safe canonical ingredient can be determined.",
      "Use only the allowed web search sources. Do not invent studies, journals, authors, citations, outcomes, rankings, or doses.",
      "Every evidence claim must be supported by a returned citation URL.",
      "For each benefit, source_urls must contain one or more URLs copied verbatim from citations and ordered best-first because the best valid URL will be stored in supplement_benefits.evidence_source.",
      "Prefer PubMed, PMC, DOI, official guidance (NIH, ODS, NCCIH, EFSA, EMA, FDA, NHS, WHO), then direct journal landing pages. Never use search result pages, retailer links, blog posts, or generic homepages.",
      "If you cannot provide a reliable source URL for a claimed benefit, omit that benefit instead of guessing or fabricating a citation.",
      "If the candidate is a clear standalone active ingredient but reliable human evidence is weak, indirect, or insufficient for benefit claims, still return decision create_new with a low evidence_score. Use benefits: [] when no benefit claim is supportable.",
      "Return manual_review only for identity ambiguity, product-like candidates, duplicate/alias uncertainty, or cases where the candidate is not a canonical active ingredient.",
      "Benefit labels must use one of the provided enum labels. Do not create new labels.",
      "For each benefit only, set evidence_rating from the robustness of evidence for that supplement and that exact benefit. It is not the numeric benefit score and it is not the supplement-level evidence_score.",
      "Use gold only when that exact supplement-benefit pairing is supported by meta-analyses or multiple well-designed randomized controlled trials. Use silver when some supporting human trials exist but data is limited, mixed, or early-stage. Use bronze when support is weak, theoretical, indirect, based on small studies, animal models, extrapolation, or evidence against effectiveness.",
      "The numeric benefit score is separate from evidence_rating. Use score only for ranking this supplement against other supplements for the same benefit in the app. Do not derive evidence_rating from score, and do not derive score from evidence_rating.",
      "Set evidence_score as the overall robustness of human evidence across accepted benefits, not popularity or marketing strength. Use 80-100 only for strong meta-analyses or multiple robust RCTs in the relevant population/use; 55-79 for encouraging but limited or mixed evidence; 20-54 for weak, small, indirect, or early-stage human evidence; 0-19 for little or no relevant human evidence. A moderately-low evidence supplement like Alpha-GPC should be around 48.",
      "If a recommended, typical, or studied research dose is available, how_to_use must include that dose or dose range in plain text. Do not put dosing only in recommended_dose_json. Do not use sample product labels, provided product examples, serving sizes from example products, or other product-specific label amounts as the main dose guidance. For parsed doses, start how_to_use with the typical or studied dose, for example: '1.6-6.4 g/day is commonly studied, usually split into smaller doses.' For ambiguous doses, include the studied example doses and explain why no single canonical dose is available.",
      "Write user-facing descriptive fields in direct researcher voice, not source-narration voice. For what_is_it, why_use_it, how_does_it_work, side_effects, risks_and_interactions, who_might_benefit, and how_to_use, do not say things like 'the review notes', 'the fact sheet states', 'the study showed', 'the paper found', or similar meta-source phrasing. Reserve explicit source attribution for the evidence fields only.",
      "The main evidence field must be a concise combined narrative similar to: 'For Cognitive support, Sagaro et al. (2023) in Journal of Alzheimer's Disease reviewed...'. Include authors, year, journal, study type, findings, and limitations. Do not paste URLs or markdown links into the evidence field.",
      "Each benefit evidence field must be a single paragraph in this exact three-part layout for UI parsing: 'Author et al. (Year), Journal: \"Study title.\" Summary of study design and findings. Limitation or applicability caveat.'",
      "In each benefit evidence field, everything before the colon must contain only author/year/journal details. Put the study title only inside the quotation marks. Put the summarized findings and limitation only after the quoted title. Do not add headings, bullets, markdown, URLs, or extra lead-in text.",
      "Keep all copy similar in length, robustness, and tone to verified supplement rows. Avoid overconfident claims and avoid long URL lists in prose.",
    ].join(" "),
    input: JSON.stringify(
      {
        candidate,
        allowed_benefit_labels: BENEFIT_LABELS,
        benefit_ranking_examples: benefitRankings,
      },
      null,
      2,
    ),
  });
}

function sourceDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeEvidenceSourceUrl(value) {
  const raw = trimString(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    if (!url.searchParams.toString()) url.search = "";
    const normalized = url.toString();
    return normalized.endsWith("/") && url.pathname === "/"
      ? normalized.slice(0, -1)
      : normalized;
  } catch {
    return "";
  }
}

function isAllowedUrl(url, allowedDomains) {
  const host = sourceDomain(normalizeEvidenceSourceUrl(url) || url);
  return allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase().replace(/^www\./, "");
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

function buildCitationUrlSet(citations, allowedDomains) {
  const normalized = new Set();
  const items = Array.isArray(citations) ? citations : [];

  for (const citation of items) {
    const url = normalizeEvidenceSourceUrl(citation?.url);
    if (!url || !isAllowedUrl(url, allowedDomains)) continue;
    normalized.add(url);
  }

  return normalized;
}

function getBenefitSourceUrls(benefit) {
  const rawUrls = Array.isArray(benefit?.source_urls)
    ? benefit.source_urls
    : [];
  return Array.from(
    new Set(
      rawUrls.map((url) => normalizeEvidenceSourceUrl(url)).filter(Boolean),
    ),
  );
}

function evidenceSourcePriority(url) {
  const host = sourceDomain(url);
  if (host === "pubmed.ncbi.nlm.nih.gov") return 0;
  if (host === "pmc.ncbi.nlm.nih.gov") return 1;
  if (host === "doi.org" || host === "dx.doi.org") return 2;
  if (
    OFFICIAL_SOURCE_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  ) {
    return 3;
  }
  return 4;
}

function selectPrimaryBenefitEvidenceSource(
  benefit,
  citations,
  allowedDomains,
) {
  const citationUrls = buildCitationUrlSet(citations, allowedDomains);
  const candidates = getBenefitSourceUrls(benefit).filter((url) =>
    citationUrls.has(url),
  );

  return (
    candidates
      .map((url, index) => ({ url, index }))
      .sort(
        (left, right) =>
          evidenceSourcePriority(left.url) -
            evidenceSourcePriority(right.url) || left.index - right.index,
      )[0]?.url || null
  );
}

function parseBenefitEvidenceLayout(value) {
  const text = trimString(value).replace(/[“”]/g, '"');
  if (!text) return null;

  const match = text.match(/^(.*?):\s*"([^"]+)"\.?\s+(.+)$/s);
  if (!match) return null;

  const [, studyMeta, studyTitle, studyFindings] = match;
  const normalizedMeta = studyMeta.trim();
  const normalizedTitle = studyTitle.trim();
  const normalizedFindings = studyFindings.trim();

  if (!normalizedMeta || !normalizedTitle || !normalizedFindings) return null;
  if (!/\(\d{4}\)/.test(normalizedMeta)) return null;
  if (!/,/.test(normalizedMeta)) return null;

  return {
    studyMeta: normalizedMeta,
    studyTitle: normalizedTitle,
    studyFindings: normalizedFindings,
  };
}

function validateResearch(result, allowedDomains) {
  const issues = [];
  if (
    result?.decision !== "create_new" &&
    result?.decision !== "create_precise"
  ) {
    return {
      ok: false,
      issues: [trimString(result?.manual_review_reason) || "manual_review"],
    };
  }

  const citations = Array.isArray(result?.citations) ? result.citations : [];
  if (!citations.length) issues.push("No citations returned.");

  const citationUrls = new Set();
  for (const citation of citations) {
    const url = normalizeEvidenceSourceUrl(citation?.url);
    if (!url || !isAllowedUrl(url, allowedDomains)) {
      issues.push(
        `Citation URL is not allowlisted: ${trimString(citation?.url) || "(blank)"}`,
      );
    } else {
      citationUrls.add(url);
    }
  }

  if (/https?:\/\//i.test(trimString(result?.evidence))) {
    issues.push("Main evidence field must not contain raw URLs.");
  }

  if (
    researchHasAvailableDose(result) &&
    !hasDoseLikeText(result?.how_to_use)
  ) {
    issues.push(
      "How to use must include the recommended, typical, studied, or example dose when dose information is available.",
    );
  }
  if (mentionsProductExampleDose(result?.how_to_use)) {
    issues.push(
      "How to use must not mention sample products, provided product examples, product labels, or label-only amounts.",
    );
  }
  if (mentionsMetaSourcePhrasing(result?.risks_and_interactions)) {
    issues.push(
      "Risks and interactions must be written as direct guidance, not source-attribution prose like 'the review notes' or 'the fact sheet states'.",
    );
  }

  const benefits = Array.isArray(result?.benefits) ? result.benefits : [];
  for (const benefit of benefits) {
    if (!BENEFIT_LABELS.includes(benefit?.label)) {
      issues.push(`Unknown benefit label: ${benefit?.label}`);
    }
    if (!["gold", "silver", "bronze"].includes(benefit?.evidence_rating)) {
      issues.push(`Invalid evidence rating for benefit: ${benefit?.label}`);
    }
    const evidenceText = trimString(benefit?.evidence);
    if (!parseBenefitEvidenceLayout(evidenceText)) {
      issues.push(
        `Benefit evidence must match 'Author (Year), Journal: "Study title." Findings and limitation.' format: ${benefit?.label}`,
      );
    }
    if (/https?:\/\//i.test(evidenceText)) {
      issues.push(
        `Benefit evidence must not contain raw URLs: ${benefit?.label}`,
      );
    }
    const sourceUrls = Array.isArray(benefit?.source_urls)
      ? benefit.source_urls
      : [];
    const normalizedSourceUrls = getBenefitSourceUrls(benefit);
    if (!sourceUrls.length) {
      issues.push(`Benefit has no source URLs: ${benefit?.label}`);
    }
    if (!normalizedSourceUrls.length) {
      issues.push(`Benefit has no valid source URLs: ${benefit?.label}`);
    }
    for (const url of sourceUrls) {
      const normalizedUrl = normalizeEvidenceSourceUrl(url);
      if (!normalizedUrl) {
        issues.push(
          `Benefit source URL is invalid: ${trimString(url) || "(blank)"} (${benefit?.label})`,
        );
        continue;
      }
      if (!citationUrls.has(normalizedUrl)) {
        issues.push(
          `Benefit source URL is not present in citations: ${normalizedUrl} (${benefit?.label})`,
        );
        continue;
      }
      if (!isAllowedUrl(normalizedUrl, allowedDomains)) {
        issues.push(
          `Benefit source URL is not allowlisted: ${normalizedUrl} (${benefit?.label})`,
        );
      }
    }
    if (
      !selectPrimaryBenefitEvidenceSource(benefit, citations, allowedDomains)
    ) {
      issues.push(
        `Benefit missing persistable evidence_source: ${benefit?.label}`,
      );
    }
  }

  const evidenceScore = clampScore(result?.evidence_score);
  if (evidenceScore === null) issues.push("Invalid evidence_score.");
  return { ok: issues.length === 0, issues };
}

function shouldCreateLowEvidenceSupplement(result) {
  if (result?.decision !== "manual_review") return false;
  if (!trimString(result?.canonical_name)) return false;
  const reason = trimString(result?.manual_review_reason).toLowerCase();
  if (!reason) return false;
  const identityBlockers = [
    "branded",
    "product name",
    "multi-ingredient",
    "formula",
    "blend",
    "cannot be reduced",
    "uncertain identity",
    "ambiguous identity",
    "duplicate",
  ];
  if (identityBlockers.some((term) => reason.includes(term))) return false;
  return [
    "insufficient evidence",
    "evidence is insufficient",
    "human evidence",
    "no clear human",
    "no robust human",
    "benefit claims",
    "not enough",
    "weak",
    "sparse",
  ].some((term) => reason.includes(term));
}

function hasCitationValidationIssue(issues) {
  return (issues ?? []).some((issue) =>
    /citation|source url|source urls|evidence_source|persistable/i.test(issue),
  );
}

function coerceLowEvidenceSupplement(result) {
  if (!shouldCreateLowEvidenceSupplement(result)) return result;
  const benefits = Array.isArray(result.benefits) ? result.benefits : [];
  return {
    ...result,
    decision: "create_new",
    manual_review_reason: null,
    benefits,
    evidence_score: benefits.length
      ? Math.min(clampScore(result.evidence_score) ?? 24, 35)
      : Math.min(clampScore(result.evidence_score) ?? 12, 19),
  };
}

function normalizeEvidenceRating(value) {
  const normalized = trimString(value).toLowerCase();
  if (["gold", "silver", "bronze"].includes(normalized)) return normalized;
  return null;
}

function dedupeStrings(items) {
  return Array.from(
    new Set((items ?? []).map((item) => normalizeText(item)).filter(Boolean)),
  );
}

async function fetchAllRows(supabase, table, select = "*") {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchCandidates(supabase, flags) {
  if (flags.name) {
    const name = trimString(flags.name);
    const normalizedName = normalizeLookupText(name);
    const existingCandidates = await fetchAllRows(
      supabase,
      "supplement_catalog_review_candidates",
      "*",
    );
    const matches = existingCandidates.filter((candidate) => {
      const names = [
        candidate.normalized_name,
        candidate.display_name,
        candidate.suggested_supplement_name,
      ];
      return names.some((item) => normalizeLookupText(item) === normalizedName);
    });
    if (matches.length) return matches;

    return [
      {
        normalized_name: normalizedName,
        display_name: name,
        suggested_supplement_name: name,
        occurrence_count: 0,
        sample_active_ingredients_json: [],
        sample_products_json: [],
      },
    ];
  }

  let query = supabase
    .from("supplement_catalog_review_candidates")
    .select("*")
    .eq("review_status", "pending")
    .order("occurrence_count", { ascending: false })
    .order("last_seen_at", { ascending: false });

  const requestedSuggestedAction = trimString(
    flags["suggested-action"],
  ).toLowerCase();
  if (requestedSuggestedAction) {
    const actionMap = {
      create_new: "create_canonical",
      create_canonical: "create_canonical",
      manual_review: "manual_review",
      ignore: "ignore",
    };
    const mappedAction = actionMap[requestedSuggestedAction];
    if (!mappedAction) {
      throw new Error(
        "Invalid --suggested-action. Use create_canonical, create_new, manual_review, or ignore.",
      );
    }
    query = query.eq("suggested_action", mappedAction);
  }

  const { data, error } = await query;
  if (error)
    throw new Error(`[supplement_catalog_review_candidates] ${error.message}`);
  return data ?? [];
}

async function fetchPendingManualReviewNames(supabase) {
  const { data, error } = await supabase
    .from(MANUAL_REVIEW_TABLE)
    .select("normalized_name")
    .eq("review_status", "pending");

  if (error) {
    return new Set();
  }

  return new Set(
    (data ?? []).map((row) => trimString(row.normalized_name)).filter(Boolean),
  );
}

function buildBenefitRankingExamples(supplementRows) {
  const grouped = {};
  for (const row of supplementRows ?? []) {
    for (const benefit of row?.supplement_benefits ?? []) {
      if (!benefit?.label || !Number.isFinite(benefit?.score)) continue;
      if (!grouped[benefit.label]) grouped[benefit.label] = [];
      grouped[benefit.label].push({
        supplement_name: row.name,
        supplement_evidence_score: row.evidence_score ?? null,
        benefit_score: benefit.score,
        icon: benefit.icon ?? null,
      });
    }
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([label, rows]) => {
      const sorted = rows
        .slice()
        .sort((left, right) => right.benefit_score - left.benefit_score);
      const middleIndex = Math.floor(sorted.length / 2);
      return [
        label,
        {
          top: sorted.slice(0, 5),
          middle: sorted.slice(Math.max(0, middleIndex - 2), middleIndex + 3),
          bottom: sorted.slice(-5),
        },
      ];
    }),
  );
}

async function loadContext(supabase) {
  const [supplements, aliases, rankingRows] = await Promise.all([
    fetchAllRows(supabase, "supplements", "id, name, status"),
    fetchAllRows(
      supabase,
      "supplement_aliases",
      "supplement_id, alias, alias_normalized",
    ),
    fetchAllRows(
      supabase,
      "supplements",
      "id, name, status, evidence_score, supplement_benefits(label, score, icon)",
    ),
  ]);
  return {
    supplements,
    aliases,
    catalogEntries: buildCatalogEntries(supplements, aliases),
    approvedCatalogEntries: filterApprovedCatalogEntries(
      buildCatalogEntries(supplements, aliases),
    ),
    benefitRankings: buildBenefitRankingExamples(
      rankingRows.filter((row) => row.status === "approved"),
    ),
  };
}

async function upsertAlias(supabase, supplementId, alias) {
  const normalized = normalizeLookupText(alias);
  if (!supplementId || !trimString(alias) || !normalized) return;

  const { data: existing, error: existingError } = await supabase
    .from("supplement_aliases")
    .select("id, supplement_id")
    .eq("alias_normalized", normalized)
    .limit(1);

  if (existingError)
    throw new Error(`[supplement_aliases] ${existingError.message}`);

  if (existing?.length) {
    return;
  }

  const { error } = await supabase.from("supplement_aliases").insert({
    supplement_id: supplementId,
    alias: normalizeText(alias),
    alias_normalized: normalized,
    alias_type: "ai_researched",
  });

  if (error) throw new Error(`[supplement_aliases] ${error.message}`);
}

async function relinkIngredients(supabase, supplementId, names) {
  const displayNames = dedupeStrings(names);
  if (!displayNames.length) return 0;

  const linkedIds = new Set();
  for (const name of displayNames) {
    for (const column of ["canonical_name", "display_name"]) {
      const { data, error } = await supabase
        .from("product_active_ingredients")
        .update({
          canonical_supplement_id: supplementId,
          resolution_status: "linked",
          resolution_confidence: 0.95,
        })
        .ilike(column, name)
        .select("id");
      if (error)
        throw new Error(`[product_active_ingredients] ${error.message}`);
      for (const row of data ?? []) {
        linkedIds.add(row.id);
      }
    }
  }
  return linkedIds.size;
}

async function markCandidateApplied(supabase, candidate, supplement) {
  const normalizedName = String(candidate?.normalized_name ?? "").trim();
  if (!normalizedName) return;

  const now = new Date().toISOString();

  const { error: candidateError } = await supabase
    .from("supplement_catalog_review_candidates")
    .update({
      review_status: "applied",
      approved_supplement_id: supplement.id,
      approved_supplement_name: supplement.name,
      review_notes: supplement.note ?? null,
      updated_at: now,
    })
    .eq("normalized_name", normalizedName);

  if (candidateError)
    throw new Error(
      `[supplement_catalog_review_candidates] ${candidateError.message}`,
    );

  const { error: reviewError } = await supabase
    .from("supplement_review_queue")
    .update({
      status: "resolved",
      reviewed_at: now,
      supplement_id: supplement.id,
    })
    .eq("review_type", "alias_unresolved")
    .eq("status", "pending")
    .contains("payload", {
      unresolved_names: [{ normalized_name: normalizedName }],
    });

  if (reviewError)
    throw new Error(`[supplement_review_queue] ${reviewError.message}`);

  const { error: occurrenceError } = await supabase
    .from("supplement_missing_catalog_occurrences")
    .delete()
    .eq("normalized_name", normalizedName);

  if (occurrenceError)
    throw new Error(
      `[supplement_missing_catalog_occurrences] ${occurrenceError.message}`,
    );

  const { error: missingCandidateError } = await supabase
    .from("supplement_missing_catalog_candidates")
    .delete()
    .eq("normalized_name", normalizedName);

  if (missingCandidateError)
    throw new Error(
      `[supplement_missing_catalog_candidates] ${missingCandidateError.message}`,
    );
}

function queueSuggestedActionForDecision(decision) {
  if (decision === "create_new") return "create_canonical";
  if (decision === "manual_review") return "manual_review";
  if (decision === "failed") return "manual_review";
  if (decision === "alias_existing") return "manual_review";
  return null;
}

function queueSuggestedSupplementNameForRecord(record) {
  if (record?.decision === "alias_existing") {
    return normalizeText(record?.match?.name) || null;
  }
  return (
    normalizeText(record?.research?.canonical_name) ||
    normalizeText(record?.candidate?.suggested_supplement_name) ||
    normalizeText(record?.candidate_name) ||
    null
  );
}

function queueReviewNotesForRecord(record) {
  const decision = trimString(record?.decision) || "pending";
  const matchedName = normalizeText(record?.match?.name);
  if (matchedName) {
    return `Latest research decision: ${decision} (${matchedName})`;
  }
  return `Latest research decision: ${decision}`;
}

function buildCachedResearchPayload(record) {
  if (record?.research !== undefined) return record.research ?? null;
  if (record?.decision === "alias_existing") return null;
  if (record?.decision === "manual_review" && !record?.candidate?.research_json)
    return null;
  return undefined;
}

async function syncCandidateQueueDecision(supabase, record) {
  const candidate = record?.candidate;
  const normalizedName = trimString(candidate?.normalized_name);
  if (!normalizedName) return;

  const suggestedAction = queueSuggestedActionForDecision(record?.decision);
  if (!suggestedAction) return;

  const payload = {
    suggested_action: suggestedAction,
    suggested_supplement_name: queueSuggestedSupplementNameForRecord(record),
    suggestion_reason: trimString(record?.reason) || "",
    review_notes: queueReviewNotesForRecord(record),
    updated_at: new Date().toISOString(),
  };

  const cachedResearch = buildCachedResearchPayload(record);
  if (cachedResearch !== undefined) {
    payload.research_json = cachedResearch;
  }

  const { error } = await supabase
    .from("supplement_catalog_review_candidates")
    .update(payload)
    .eq("normalized_name", normalizedName);

  if (error)
    throw new Error(`[supplement_catalog_review_candidates] ${error.message}`);
}

async function markManualReviewResolved(supabase, candidate, supplement) {
  const normalizedName = trimString(candidate?.normalized_name);
  if (!normalizedName) return;
  const { error } = await supabase
    .from(MANUAL_REVIEW_TABLE)
    .update({
      review_status: "resolved",
      linked_supplement_id: supplement.id,
      linked_supplement_name: supplement.name,
      updated_at: new Date().toISOString(),
    })
    .eq("normalized_name", normalizedName);
  if (error) throw new Error(`[${MANUAL_REVIEW_TABLE}] ${error.message}`);
}

function manualReviewDecision(record) {
  if (record?.decision === "failed") return "failed";
  if (
    String(record?.reason ?? "")
      .toLowerCase()
      .includes("branded product")
  ) {
    return "skipped_product_like";
  }
  return "manual_review";
}

function buildManualReviewRow(record) {
  const candidate = record?.candidate ?? {};
  const now = new Date().toISOString();
  const normalizedName =
    trimString(candidate.normalized_name) ||
    normalizeLookupText(record?.candidate_name) ||
    normalizeLookupText(record?.research?.canonical_name);

  if (!normalizedName) {
    throw new Error("Cannot record manual review without a normalized name.");
  }

  return {
    normalized_name: normalizedName,
    display_name:
      trimString(candidate.display_name) ||
      trimString(record?.candidate_name) ||
      normalizedName,
    suggested_supplement_name:
      trimString(candidate.suggested_supplement_name) ||
      trimString(record?.research?.canonical_name) ||
      null,
    occurrence_count: Number.isFinite(Number(candidate.occurrence_count))
      ? Number(candidate.occurrence_count)
      : 0,
    review_status: "pending",
    decision: manualReviewDecision(record),
    reason: trimString(record?.reason) || "Manual review required.",
    validation_issues_json: Array.isArray(record?.validation_issues)
      ? record.validation_issues
      : [],
    candidate_json: candidate,
    research_json: record?.research ?? null,
    citations_json: Array.isArray(record?.research?.citations)
      ? record.research.citations
      : [],
    sample_active_ingredients_json: Array.isArray(
      candidate.sample_active_ingredients_json,
    )
      ? candidate.sample_active_ingredients_json
      : [],
    sample_products_json: Array.isArray(candidate.sample_products_json)
      ? candidate.sample_products_json
      : [],
    source_latest_created_at:
      trimString(candidate.source_latest_created_at) || null,
    updated_at: now,
    first_seen_at: trimString(candidate.first_seen_at) || now,
    last_seen_at: now,
  };
}

async function upsertManualReviewRecord(supabase, record) {
  const row = buildManualReviewRow(record);
  const { error } = await supabase
    .from(MANUAL_REVIEW_TABLE)
    .upsert(row, { onConflict: "normalized_name" });

  if (error) {
    throw new Error(
      `[${MANUAL_REVIEW_TABLE}] ${error.message}. Run supabase/supplement_research_manual_reviews.sql once before using --apply.`,
    );
  }

  record.manual_review_recorded = true;
  return row;
}

async function recordManualReviewIfNeeded({ supabase, apply, record }) {
  if (!apply) return;
  await upsertManualReviewRecord(supabase, record);
}

async function applyAliasExisting({ supabase, candidate, match, aliases }) {
  const aliasNames = dedupeStrings([
    canonicalCandidateName(candidate),
    candidate.display_name,
    candidate.normalized_name,
    ...(aliases ?? []),
  ]);
  for (const alias of aliasNames) {
    await upsertAlias(supabase, match.id, alias);
  }
  const linked = await relinkIngredients(supabase, match.id, aliasNames);
  await markCandidateApplied(supabase, candidate, {
    id: match.id,
    name: match.name,
    note: `Linked as alias of existing supplement: ${match.name}`,
  });
  await markManualReviewResolved(supabase, candidate, match);
  return { linked };
}

function buildBenefitRows(supplement, research, allowedDomains) {
  const rows = [];
  const seenByLabel = new Map();

  for (const benefit of research.benefits ?? []) {
    const label = normalizeText(benefit?.label);
    const labelKey = normalizeLookupText(label);
    if (!label || !labelKey) continue;

    const row = {
      supplement_id: supplement.id,
      supplement_name: supplement.name,
      label,
      icon: normalizeEvidenceRating(benefit.evidence_rating),
      score: clampScore(benefit.score),
      evidence: normalizeText(benefit.evidence),
      evidence_source: selectPrimaryBenefitEvidenceSource(
        benefit,
        research.citations,
        allowedDomains,
      ),
      ranking_reason: normalizeText(benefit.ranking_reason),
    };

    const existingIndex = seenByLabel.get(labelKey);
    if (existingIndex === undefined) {
      seenByLabel.set(labelKey, rows.length);
      rows.push(row);
      continue;
    }

    if (row.score > rows[existingIndex].score) {
      rows[existingIndex] = row;
    }
  }

  return rows;
}

async function applyResearchRelations({
  supabase,
  candidate,
  supplement,
  research,
  allowedDomains,
}) {
  const aliasNames = dedupeStrings([
    supplement.name,
    canonicalCandidateName(candidate),
    candidate.display_name,
    candidate.normalized_name,
    ...(research.aliases ?? []),
  ]);
  for (const alias of aliasNames) {
    await upsertAlias(supabase, supplement.id, alias);
  }

  const benefitRows = buildBenefitRows(supplement, research, allowedDomains);
  await supabase
    .from("supplement_benefits")
    .delete()
    .eq("supplement_id", supplement.id);
  if (benefitRows.length) {
    const { error: benefitError } = await supabase
      .from("supplement_benefits")
      .insert(benefitRows);
    if (benefitError)
      throw new Error(`[supplement_benefits] ${benefitError.message}`);
  }

  const linked = await relinkIngredients(supabase, supplement.id, aliasNames);
  return { linked, benefitCount: benefitRows.length };
}

async function applyNewSupplement({
  supabase,
  candidate,
  research,
  allowedDomains,
}) {
  const canonicalName = normalizeText(research.canonical_name);
  const [freshSupplements, freshAliases] = await Promise.all([
    fetchAllRows(supabase, "supplements", "id, name, status"),
    fetchAllRows(
      supabase,
      "supplement_aliases",
      "supplement_id, alias, alias_normalized",
    ),
  ]);
  const exactExistingSupplement = freshSupplements.find(
    (row) =>
      normalizeLookupText(row?.name) === normalizeLookupText(canonicalName),
  );

  if (exactExistingSupplement) {
    if (exactExistingSupplement.status === "pending") {
      return applyPendingSupplementRefresh({
        supabase,
        candidate,
        match: exactExistingSupplement,
        research,
        allowedDomains,
      });
    }

    return applyAliasExisting({
      supabase,
      candidate,
      match: exactExistingSupplement,
      aliases: research.aliases ?? [],
    });
  }

  const duplicate = findDuplicateCandidate(
    canonicalName,
    buildCatalogEntries(freshSupplements, freshAliases),
  );
  if (duplicate.action !== "create_new") {
    throw new Error(
      `Refusing to insert possible duplicate supplement: ${canonicalName} -> ${
        duplicate.match?.name ??
        duplicate.shortlist?.[0]?.name ??
        "existing row"
      }`,
    );
  }

  const { data: supplement, error } = await supabase
    .from("supplements")
    .insert({
      name: canonicalName,
      what_is_it: normalizeText(research.what_is_it) || null,
      why_use_it: normalizeText(research.why_use_it) || null,
      how_does_it_work: normalizeText(research.how_does_it_work) || null,
      side_effects: normalizeText(research.side_effects) || null,
      risks_and_interactions:
        normalizeText(research.risks_and_interactions) || null,
      who_might_benefit: normalizeText(research.who_might_benefit) || null,
      evidence: normalizeText(research.evidence) || null,
      evidence_score: clampScore(research.evidence_score),
      status: "approved",
      how_to_use: normalizeText(research.how_to_use) || null,
      recommended_dose_status: research.recommended_dose_status,
      recommended_dose_json: research.recommended_dose_json,
      dose_scoring_profile_json: research.dose_scoring_profile_json,
    })
    .select("id, name, status")
    .single();

  if (error) throw new Error(`[supplements] ${error.message}`);

  const relations = await applyResearchRelations({
    supabase,
    candidate,
    supplement,
    research,
    allowedDomains,
  });
  await markCandidateApplied(supabase, candidate, {
    id: supplement.id,
    name: supplement.name,
    note: "Created approved supplement from AI research.",
  });
  await markManualReviewResolved(supabase, candidate, supplement);
  return { supplement, ...relations };
}

async function applyPendingSupplementRefresh({
  supabase,
  candidate,
  match,
  research,
  allowedDomains,
}) {
  if (match.status !== "pending") {
    throw new Error(
      `Refusing to refresh non-pending supplement: ${match.name}`,
    );
  }

  const canonicalName = normalizeText(research.canonical_name) || match.name;
  const { data: supplement, error } = await supabase
    .from("supplements")
    .update({
      name: canonicalName,
      what_is_it: normalizeText(research.what_is_it) || null,
      why_use_it: normalizeText(research.why_use_it) || null,
      how_does_it_work: normalizeText(research.how_does_it_work) || null,
      side_effects: normalizeText(research.side_effects) || null,
      risks_and_interactions:
        normalizeText(research.risks_and_interactions) || null,
      who_might_benefit: normalizeText(research.who_might_benefit) || null,
      evidence: normalizeText(research.evidence) || null,
      evidence_score: clampScore(research.evidence_score),
      status: "pending",
      how_to_use: normalizeText(research.how_to_use) || null,
      recommended_dose_status: research.recommended_dose_status,
      recommended_dose_json: research.recommended_dose_json,
      dose_scoring_profile_json: research.dose_scoring_profile_json,
    })
    .eq("id", match.id)
    .eq("status", "pending")
    .select("id, name, status")
    .single();

  if (error) throw new Error(`[supplements] ${error.message}`);

  const relations = await applyResearchRelations({
    supabase,
    candidate,
    supplement,
    research,
    allowedDomains,
  });
  await markCandidateApplied(supabase, candidate, {
    id: supplement.id,
    name: supplement.name,
    note: "Refreshed pending supplement from AI research.",
  });
  await markManualReviewResolved(supabase, candidate, supplement);
  return { supplement, refreshed: true, ...relations };
}

function normalizeCachedResearch(candidate) {
  const cached = candidate?.research_json;
  if (!cached || typeof cached !== "object" || Array.isArray(cached))
    return null;
  return coerceLowEvidenceSupplement(
    sanitizeResearchProse(normalizeJsonDoseUnits({ ...cached })),
  );
}

async function writeReports(outputDir, records) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "pending_supplement_research.json"),
    JSON.stringify(records, null, 2),
    "utf8",
  );

  const markdown = [
    "# Pending Supplement Research Report",
    "",
    ...records.flatMap((record) => [
      `## ${record.candidate_name}`,
      "",
      `- Decision: ${record.decision}`,
      `- Applied: ${record.applied ? "yes" : "no"}`,
      `- Manual review recorded: ${record.manual_review_recorded ? "yes" : "no"}`,
      `- Reason: ${record.reason || "n/a"}`,
      `- Match: ${record.match?.name || "n/a"}`,
      `- New supplement: ${record.research?.canonical_name || "n/a"}`,
      `- Benefits: ${(record.research?.benefits ?? []).map((benefit) => `${benefit.label} ${benefit.score} ${benefit.evidence_rating ?? "unrated"}`).join(", ") || "n/a"}`,
      "",
      ...(record.validation_issues?.length
        ? [
            "Validation issues:",
            ...record.validation_issues.map((issue) => `- ${issue}`),
            "",
          ]
        : []),
      ...(record.research?.citations?.length
        ? [
            "Sources:",
            ...record.research.citations.map(
              (source) =>
                `- ${source.title} (${source.year ?? "n.d."}) - ${source.url}`,
            ),
            "",
          ]
        : []),
    ]),
  ].join("\n");

  await writeFile(
    path.join(outputDir, "pending_supplement_research_report.md"),
    markdown,
    "utf8",
  );
}

function buildSupabaseClient() {
  const url = trimString(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const key =
    trimString(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    trimString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !key) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or Supabase key in .env");
  }
  return createClient(url, key);
}

async function main() {
  loadDotEnv();
  const flags = parseArgs(process.argv.slice(2));
  const apply = Boolean(flags.apply) && !Boolean(flags["dry-run"]);
  const refreshPending = Boolean(flags["refresh-pending"]);
  const refreshResearch = Boolean(flags["refresh-research"]);
  const model = trimString(flags.model) || DEFAULT_MODEL;
  const writeReportsEnabled = Boolean(flags["write-report"] || flags.output);
  const outputDir = writeReportsEnabled
    ? path.resolve(String(flags.output || DEFAULT_OUTPUT_DIR))
    : null;
  const allowedDomains = [
    ...DEFAULT_ALLOWED_DOMAINS,
    ...String(flags["allowed-domain"] || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ];
  const apiKey = trimString(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in .env or environment");

  const supabase = buildSupabaseClient();
  const candidates = await fetchCandidates(supabase, flags);
  const pendingManualReviewNames =
    flags.name || flags["include-recorded-manual"]
      ? new Set()
      : await fetchPendingManualReviewNames(supabase);
  const filteredCandidates = candidates.filter((candidate) => {
    const normalizedName =
      trimString(candidate.normalized_name) ||
      normalizeLookupText(canonicalCandidateName(candidate));
    return !pendingManualReviewNames.has(normalizedName);
  });
  const limit = parseOptionalInteger(flags.limit);
  const limitedCandidates = limit
    ? filteredCandidates.slice(0, limit)
    : filteredCandidates;
  const context = await loadContext(supabase);
  const records = [];

  console.log(
    JSON.stringify(
      {
        apply,
        refreshPending,
        refreshResearch,
        model,
        candidate_count: limitedCandidates.length,
        skipped_recorded_manual_reviews:
          candidates.length - filteredCandidates.length,
        write_reports: writeReportsEnabled,
        ...(writeReportsEnabled ? { outputDir } : {}),
        allowedDomains,
      },
      null,
      2,
    ),
  );

  for (const [index, candidate] of limitedCandidates.entries()) {
    const candidateName = canonicalCandidateName(candidate);
    const record = {
      candidate_name: candidateName,
      candidate,
      decision: "pending",
      applied: false,
      reason: "",
      match: null,
      research: null,
      validation_issues: [],
      manual_review_recorded: false,
    };
    records.push(record);

    try {
      console.log(
        `[${index + 1}/${limitedCandidates.length}] ${candidateName}`,
      );
      if (looksLikeBrandedProduct(candidateName)) {
        record.decision = "manual_review";
        record.reason =
          "Candidate looks like a branded product, formula, blend, dosage form, or finished supplement rather than a canonical active ingredient.";
        await recordManualReviewIfNeeded({ supabase, apply, record });
        await syncCandidateQueueDecision(supabase, record);
        continue;
      }

      const duplicate = findDuplicateCandidate(
        candidateName,
        context.catalogEntries,
      );
      if (duplicate.action === "alias_existing") {
        if (refreshPending && duplicate.match.status === "pending") {
          record.match = duplicate.match;
          record.reason = `Refreshing existing pending supplement: ${duplicate.match.name}`;
        } else {
          record.decision = "alias_existing";
          record.match = duplicate.match;
          record.reason = `Local alias match: ${duplicate.match.name}`;
          if (apply) {
            await applyAliasExisting({
              supabase,
              candidate,
              match: duplicate.match,
              aliases: [candidateName],
            });
            record.applied = true;
          }
          await syncCandidateQueueDecision(supabase, record);
          continue;
        }
      }

      if (duplicate.action === "needs_alias_review") {
        const aliasReview = await requestAliasReview({
          apiKey,
          model,
          candidateName,
          shortlist: aliasReviewPayload(duplicate.shortlist),
        });
        if (
          aliasReview.decision === "manual_review" &&
          !aliasReviewAllowsCreateNew(aliasReview)
        ) {
          record.decision = "manual_review";
          record.reason = aliasReview.reason;
          await recordManualReviewIfNeeded({ supabase, apply, record });
          await syncCandidateQueueDecision(supabase, record);
          continue;
        }
        if (aliasReview.decision === "alias_existing") {
          if (Number(aliasReview.confidence) < 0.75) {
            record.decision = "manual_review";
            record.reason = `Alias review confidence too low: ${aliasReview.reason}`;
            await recordManualReviewIfNeeded({ supabase, apply, record });
            await syncCandidateQueueDecision(supabase, record);
            continue;
          }
          const match = duplicate.shortlist.find(
            (item) => item.id === aliasReview.matched_supplement_id,
          );
          if (!match) {
            record.decision = "manual_review";
            record.reason = "Alias review returned an unknown supplement id.";
            await recordManualReviewIfNeeded({ supabase, apply, record });
            await syncCandidateQueueDecision(supabase, record);
            continue;
          }
          record.decision = "alias_existing";
          record.match = match;
          record.reason = aliasReview.reason;
          if (apply) {
            await applyAliasExisting({
              supabase,
              candidate,
              match,
              aliases: [candidateName],
            });
            record.applied = true;
          }
          await syncCandidateQueueDecision(supabase, record);
          continue;
        }
      }

      const cachedResearch = refreshResearch
        ? null
        : normalizeCachedResearch(candidate);
      let research =
        cachedResearch ??
        coerceLowEvidenceSupplement(
          sanitizeResearchProse(
            normalizeJsonDoseUnits(
              await requestResearch({
                apiKey,
                model,
                candidate,
                benefitRankings: context.benefitRankings,
                allowedDomains,
              }),
            ),
          ),
        );
      record.research = research;
      let validation = validateResearch(research, allowedDomains);

      if (
        !validation.ok &&
        validation.issues.length === 1 &&
        validation.issues[0] ===
          "How to use must include dose information when available."
      ) {
        research = coerceLowEvidenceSupplement(
          sanitizeResearchProse(
            normalizeJsonDoseUnits(
              await requestResearch({
                apiKey,
                model,
                candidate,
                benefitRankings: context.benefitRankings,
                allowedDomains,
              }),
            ),
          ),
        );

        record.research = research;
        validation = validateResearch(research, allowedDomains);
      }
      record.validation_issues = validation.issues;
      if (!validation.ok) {
        if (hasCitationValidationIssue(validation.issues)) {
          console.warn(
            `[${candidateName}] citation/source validation failed`,
            validation.issues,
          );
        }
        record.decision = "manual_review";
        record.reason = validation.issues.join("; ");
        await recordManualReviewIfNeeded({ supabase, apply, record });
        await syncCandidateQueueDecision(supabase, record);
        continue;
      }

      const strictAliasDecision = await resolveStrictApprovedAliasReview({
        apiKey,
        model,
        candidate,
        research,
        approvedCatalogEntries: context.approvedCatalogEntries,
      });
      if (strictAliasDecision.decision === "alias_existing") {
        record.decision = "alias_existing";
        record.match = strictAliasDecision.match;
        record.reason = `Strict alias guard: ${strictAliasDecision.reason}`;
        if (apply) {
          await applyAliasExisting({
            supabase,
            candidate,
            match: strictAliasDecision.match,
            aliases: dedupeStrings([
              candidateName,
              research.canonical_name,
              ...(research.aliases ?? []),
            ]),
          });
          record.applied = true;
        }
        await syncCandidateQueueDecision(supabase, record);
        continue;
      }
      if (strictAliasDecision.decision === "manual_review") {
        record.decision = "manual_review";
        record.reason = `Strict alias guard needs review: ${strictAliasDecision.reason}`;
        await recordManualReviewIfNeeded({ supabase, apply, record });
        await syncCandidateQueueDecision(supabase, record);
        continue;
      }

      record.decision = "create_new";
      record.reason = "Source-backed research passed validation.";
      if (apply) {
        const applied =
          refreshPending && record.match?.status === "pending"
            ? await applyPendingSupplementRefresh({
                supabase,
                candidate,
                match: record.match,
                research,
                allowedDomains,
              })
            : await applyNewSupplement({
                supabase,
                candidate,
                research,
                allowedDomains,
              });
        record.applied = true;
        record.applied_result = applied;
      }
      await syncCandidateQueueDecision(supabase, record);
    } catch (error) {
      record.decision = "failed";
      record.reason = error instanceof Error ? error.message : String(error);
      console.error(`[${candidateName}] ${record.reason}`);
      if (apply) {
        try {
          await upsertManualReviewRecord(supabase, record);
        } catch (reviewError) {
          record.manual_review_record_error =
            reviewError instanceof Error
              ? reviewError.message
              : String(reviewError);
          console.error(
            `[${candidateName}] ${record.manual_review_record_error}`,
          );
        }
      }
      try {
        await syncCandidateQueueDecision(supabase, record);
      } catch (syncError) {
        record.queue_sync_error =
          syncError instanceof Error ? syncError.message : String(syncError);
        console.error(`[${candidateName}] ${record.queue_sync_error}`);
      }
    }
  }

  if (writeReportsEnabled && outputDir) {
    await writeReports(outputDir, records);
  }
  console.log(
    JSON.stringify(
      {
        apply,
        refreshPending,
        refreshResearch,
        total: records.length,
        applied: records.filter((record) => record.applied).length,
        manual_review_recorded: records.filter(
          (record) => record.manual_review_recorded,
        ).length,
        create_new: records.filter((record) => record.decision === "create_new")
          .length,
        alias_existing: records.filter(
          (record) => record.decision === "alias_existing",
        ).length,
        manual_review: records.filter(
          (record) => record.decision === "manual_review",
        ).length,
        failed: records.filter((record) => record.decision === "failed").length,
        skipped_recorded_manual_reviews:
          candidates.length - filteredCandidates.length,
        write_reports: writeReportsEnabled,
        ...(writeReportsEnabled && outputDir ? { report: outputDir } : {}),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
