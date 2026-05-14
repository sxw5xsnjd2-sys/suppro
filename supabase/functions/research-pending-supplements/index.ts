import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TABLES = {
  activeIngredients: "product_active_ingredients",
  aliases: "supplement_aliases",
  benefits: "supplement_benefits",
  candidates: "supplement_catalog_review_candidates",
  manualReviews: "supplement_research_manual_reviews",
  supplements: "supplements",
};

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
  "dx.doi.org",
  "doi.org",
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

const ALLOWED_DOMAINS = [...new Set([...OFFICIAL_SOURCE_DOMAINS, ...JOURNAL_SOURCE_DOMAINS])];

const PRODUCT_LIKE_PATTERNS = [
  /\bby\s+[a-z0-9]/i,
  /\b(blend|formula|matrix|stack)\b/i,
  /\b\d+\s*(mg|mcg|ug|g|ml|iu)\b/i,
  /[®™]/,
];

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = normalizeSecretToken(
  Deno.env.get("INTERNAL_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);
const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
const openAiModel = Deno.env.get("SUPPLEMENT_RESEARCH_MODEL") || "gpt-5.4-mini";

const adminSupabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function openAiFetchWithRetry(url: string, options: RequestInit, maxAttempts = 3) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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

function extractResponseText(body: Record<string, unknown>) {
  if (typeof body.output_text === "string") return body.output_text;

  const chunks: string[] = [];
  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;
      const typedContent = contentItem as Record<string, unknown>;
      if (typedContent.type === "output_text" && typeof typedContent.text === "string") {
        chunks.push(typedContent.text);
      }
    }
  }

  return chunks.join("");
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSecretToken(value: unknown) {
  return trimString(value)
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function parseJwtPayload(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isServiceRoleRequest(req: Request) {
  const token = trimString(req.headers.get("Authorization")?.replace(/^Bearer\s+/i, ""));
  const payload = parseJwtPayload(token);
  return payload?.role === "service_role";
}

function normalizeText(value: unknown): string {
  return trimString(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupText(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(extract|powder|capsules?|tablets?|supplements?|root|leaf|seed|oil)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDoseUnit(value: unknown): string | null {
  const normalized = trimString(value).replace(/[µμ]/g, "μ");
  if (!normalized) return null;
  const lowered = normalized.toLowerCase().replace(/\s+/g, "");
  if (lowered === "g/day" || lowered === "gperday") return "g";
  if (lowered === "mg/day" || lowered === "mgperday") return "mg";
  if (["mcg/day", "ug/day", "μg/day"].includes(lowered)) return "mcg";
  if (lowered === "ml/day" || lowered === "mlperday") return "ml";
  if (lowered === "cfu/day" || lowered === "cfuperday") return "CFU";
  if (lowered === "iu/day" || lowered === "iuperday") return "IU";
  if (["ug", "mcg"].includes(lowered) || normalized === "μg") return "mcg";
  if (lowered === "iu") return "IU";
  if (lowered === "cfu") return "CFU";
  if (["mg", "g", "ml"].includes(lowered)) return lowered;
  return normalized;
}

function normalizeJsonDoseUnits(research: Record<string, unknown>) {
  const next = { ...research };
  const recommendedDose = next.recommended_dose_json as
    | Record<string, unknown>
    | null
    | undefined;
  if (recommendedDose && typeof recommendedDose === "object") {
    next.recommended_dose_json = {
      ...recommendedDose,
      unit: normalizeDoseUnit(recommendedDose.unit),
    };
  }

  const profile = next.dose_scoring_profile_json as
    | Record<string, unknown>
    | null
    | undefined;
  if (profile && typeof profile === "object") {
    next.dose_scoring_profile_json = {
      ...profile,
      unit: normalizeDoseUnit(profile.unit),
    };
  }

  return next;
}

function normalizeResearchOutput(research: Record<string, unknown>) {
  return sanitizeResearchProse(normalizeJsonDoseUnits(research));
}

function stripGeneratedSourceLinks(value: unknown) {
  return normalizeText(value)
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/\(\s*https?:\/\/[^)]+\)/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeResearchProse(research: Record<string, unknown>) {
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
    if (typeof next[field] === "string") next[field] = stripGeneratedSourceLinks(next[field]);
  }
  if (Array.isArray(next.benefits)) {
    next.benefits = next.benefits.map((benefit) => {
      if (!benefit || typeof benefit !== "object") return benefit;
      const typedBenefit = benefit as Record<string, unknown>;
      const evidenceText =
        typeof typedBenefit.evidence === "string"
          ? stripGeneratedSourceLinks(typedBenefit.evidence)
          : typedBenefit.evidence;
      return {
        ...typedBenefit,
        evidence:
          normalizeBenefitEvidenceStyle(evidenceText, typedBenefit, next.citations),
        ranking_reason:
          typeof typedBenefit.ranking_reason === "string"
            ? stripGeneratedSourceLinks(typedBenefit.ranking_reason)
            : typedBenefit.ranking_reason,
      };
    });
  }
  return next;
}

function normalizeBenefitEvidenceStyle(
  evidence: unknown,
  benefit: Record<string, unknown>,
  citations: unknown
) {
  const evidenceText = stripGeneratedSourceLinks(evidence);
  if (!evidenceText || (evidenceText.includes(":") && evidenceText.includes('"'))) {
    return evidenceText;
  }

  const sourceUrls = Array.isArray(benefit.source_urls) ? benefit.source_urls : [];
  const citation = (Array.isArray(citations) ? citations : []).find((item) => {
    if (!item || typeof item !== "object") return false;
    return sourceUrls.includes((item as Record<string, unknown>).url);
  }) as Record<string, unknown> | undefined;
  if (!citation) return evidenceText;

  const authors = trimString(citation.authors) || "Source authors";
  const year = citation.year ?? "n.d.";
  const source = trimString(citation.journal) || trimString(citation.domain) || "Source";
  const title = trimString(citation.title);
  if (!title) return evidenceText;

  return `${authors} (${year}), ${source}: "${title}." ${evidenceText}`;
}

function hasDoseLikeText(value: unknown): boolean {
  return /\b\d+(?:[.,]\d+)?(?:\s*(?:-|to)\s*\d+(?:[.,]\d+)?)?\s*(?:mg|g|mcg|ug|μg|iu|cfu|million|billion)\b/i.test(
    normalizeText(value)
  );
}

function researchHasAvailableDose(result: Record<string, unknown>): boolean {
  const dose = result.recommended_dose_json as Record<string, unknown> | null;
  if (!dose || typeof dose !== "object") return false;
  if (!["parsed", "ambiguous"].includes(String(result.recommended_dose_status))) {
    return false;
  }
  if (hasDoseLikeText(dose.source_text)) return true;
  return [
    dose.per_intake_min_value,
    dose.per_intake_max_value,
    dose.frequency_min_per_day,
    dose.frequency_max_per_day,
  ].some((value) => Number.isFinite(Number(value)));
}

function mentionsProductExampleDose(value: unknown): boolean {
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

function mentionsMetaSourcePhrasing(value: unknown): boolean {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;

  return [
    /\b(?:the|this)\s+(?:review|study|paper|trial|fact sheet|source|meta-analysis)\s+(?:notes|says|states|shows|reported|reports|found|finds|suggests)\b/,
    /\baccording to (?:the|this)\s+(?:review|study|paper|trial|fact sheet|source|meta-analysis)\b/,
    /\bthe returned evidence\b/,
    /\bthe retrieved sources?\b/,
  ].some((pattern) => pattern.test(text));
}

function clampScore(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function canonicalCandidateName(candidate: Record<string, unknown>) {
  return (
    trimString(candidate.suggested_supplement_name) ||
    trimString(candidate.display_name) ||
    trimString(candidate.normalized_name)
  );
}

function looksLikeProduct(value: string) {
  return PRODUCT_LIKE_PATTERNS.some((pattern) => pattern.test(value));
}

function lookupTokens(value: unknown) {
  return normalizeLookupText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function vitaminKey(value: unknown) {
  const normalized = normalizeLookupText(value);
  const match = normalized.match(/\bvitamin\s+([a-z][0-9]*)\b/);
  return match ? `vitamin ${match[1]}` : "";
}

function scoreLookupMatch(inputName: unknown, lookupName: unknown) {
  const input = normalizeLookupText(inputName);
  const lookup = normalizeLookupText(lookupName);
  if (!input || !lookup) return 0;
  if (input === lookup) return 100;
  const inputVitamin = vitaminKey(input);
  const lookupVitamin = vitaminKey(lookup);
  if (inputVitamin && lookupVitamin && inputVitamin !== lookupVitamin) return 0;
  if (lookup.includes(input) || input.includes(lookup)) {
    const shorter = input.length <= lookup.length ? input : lookup;
    const longer = shorter === input ? lookup : input;
    if (shorter.length / longer.length >= 0.5) return 90;
  }

  const inputTokens = lookupTokens(input);
  const lookupTokenSet = new Set(lookupTokens(lookup));
  if (!inputTokens.length || !lookupTokenSet.size) return 0;

  const overlap = inputTokens.filter((token) => lookupTokenSet.has(token)).length;
  return Math.round((overlap / inputTokens.length) * 70 + (overlap / lookupTokenSet.size) * 20);
}

function buildCatalogEntries(
  supplements: Record<string, unknown>[],
  aliases: Record<string, unknown>[]
) {
  const byId = new Map<
    string,
    {
      id: string;
      name: string;
      status: string;
      aliases: string[];
      lookupKeys: string[];
    }
  >();
  for (const row of supplements) {
    const id = trimString(row.id);
    const name = trimString(row.name);
    if (!id || !name) continue;
    byId.set(id, {
      id,
      name,
      status: trimString(row.status),
      aliases: [],
      lookupKeys: [name],
    });
  }

  for (const alias of aliases) {
    const supplementId = trimString(alias.supplement_id);
    const entry = byId.get(supplementId);
    if (!entry) continue;
    const aliasText = trimString(alias.alias) || trimString(alias.alias_normalized);
    if (!aliasText) continue;
    entry.aliases.push(aliasText);
    entry.lookupKeys.push(aliasText);
  }

  return Array.from(byId.values());
}

function findDuplicateCandidate(candidateName: string, catalogEntries: ReturnType<typeof buildCatalogEntries>) {
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
    if (bestScore >= 55) scored.push({ ...entry, score: bestScore, matchedKey });
  }

  scored.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const best = scored[0] ?? null;
  if (!best) return { action: "create_new" as const, shortlist: [] };
  if (best.score >= 90) {
    return { action: "alias_existing" as const, match: best, shortlist: scored.slice(0, 5) };
  }
  return { action: "manual_review" as const, shortlist: scored.slice(0, 8) };
}

function dedupeStrings(items: unknown[]) {
  return Array.from(
    new Set(items.map((item) => normalizeText(item)).filter(Boolean))
  );
}

function buildAliasGuardShortlist({
  candidate,
  research,
  catalogEntries,
  limit = 8,
}: {
  candidate: Record<string, unknown>;
  research: Record<string, unknown>;
  catalogEntries: ReturnType<typeof buildCatalogEntries>;
  limit?: number;
}) {
  const aliases = Array.isArray(research.aliases) ? research.aliases : [];
  const candidateNames = dedupeStrings([
    canonicalCandidateName(candidate),
    candidate.display_name,
    candidate.normalized_name,
    research.canonical_name,
    ...aliases,
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
    if (bestScore >= 45) scored.push({ ...entry, score: bestScore, matchedKey, matchedInput });
  }

  return scored
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function aliasReviewPayload(shortlist: ReturnType<typeof buildAliasGuardShortlist>) {
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

function aliasReviewAllowsCreateNew(review: Record<string, unknown>) {
  if (review.decision === "create_new") return true;
  if (review.decision !== "manual_review") return false;
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

function buildAliasReviewSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["decision", "matched_supplement_id", "confidence", "reason"],
    properties: {
      decision: { type: "string", enum: ["alias_existing", "create_new", "manual_review"] },
      matched_supplement_id: { anyOf: [{ type: "string" }, { type: "null" }] },
      confidence: { type: "number" },
      reason: { type: "string" },
    },
  };
}

function sourceDomain(url: unknown) {
  try {
    return new URL(trimString(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeEvidenceSourceUrl(value: unknown) {
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
    return normalized.endsWith("/") && url.pathname === "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return "";
  }
}

function isAllowedUrl(url: unknown) {
  const host = sourceDomain(normalizeEvidenceSourceUrl(url) || url);
  return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function buildCitationUrlSet(citations: unknown) {
  const normalized = new Set<string>();
  const items = Array.isArray(citations) ? citations : [];

  for (const citation of items) {
    if (!citation || typeof citation !== "object") continue;
    const url = normalizeEvidenceSourceUrl((citation as Record<string, unknown>).url);
    if (!url || !isAllowedUrl(url)) continue;
    normalized.add(url);
  }

  return normalized;
}

function getBenefitSourceUrls(benefit: Record<string, unknown>) {
  const rawUrls = Array.isArray(benefit.source_urls) ? benefit.source_urls : [];
  return Array.from(
    new Set(rawUrls.map((url) => normalizeEvidenceSourceUrl(url)).filter(Boolean))
  );
}

function evidenceSourcePriority(url: string) {
  const host = sourceDomain(url);
  if (host === "pubmed.ncbi.nlm.nih.gov") return 0;
  if (host === "pmc.ncbi.nlm.nih.gov") return 1;
  if (host === "doi.org" || host === "dx.doi.org") return 2;
  if (OFFICIAL_SOURCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return 3;
  }
  return 4;
}

function selectPrimaryBenefitEvidenceSource(
  benefit: Record<string, unknown>,
  citations: unknown
) {
  const citationUrls = buildCitationUrlSet(citations);
  const candidates = getBenefitSourceUrls(benefit).filter((url) => citationUrls.has(url));

  return (
    candidates
      .map((url, index) => ({ url, index }))
      .sort(
        (left, right) =>
          evidenceSourcePriority(left.url) - evidenceSourcePriority(right.url) ||
          left.index - right.index
      )[0]?.url || null
  );
}

function parseBenefitEvidenceLayout(value: unknown) {
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

function normalizeEvidenceRating(value: unknown) {
  const normalized = trimString(value).toLowerCase();
  if (["gold", "silver", "bronze"].includes(normalized)) return normalized;
  return null;
}

function validateResearch(result: Record<string, unknown>) {
  const issues = [];
  if (result.decision !== "create_new") {
    return {
      ok: false,
      issues: [trimString(result.manual_review_reason) || "manual_review"],
    };
  }

  const citations = Array.isArray(result.citations)
    ? (result.citations as Record<string, unknown>[])
    : [];
  if (!citations.length) issues.push("No citations returned.");

  const citationUrls = new Set<string>();
  for (const citation of citations) {
    const url = normalizeEvidenceSourceUrl(citation.url);
    if (!url || !isAllowedUrl(url)) {
      issues.push(`Citation URL is not allowlisted: ${trimString(citation.url) || "(blank)"}`);
    } else {
      citationUrls.add(url);
    }
  }

  if (/https?:\/\//i.test(trimString(result.evidence))) {
    issues.push("Main evidence field must not contain raw URLs.");
  }

  if (researchHasAvailableDose(result) && !hasDoseLikeText(result.how_to_use)) {
    issues.push("How to use must include dose information when available.");
  }
  if (mentionsProductExampleDose(result.how_to_use)) {
    issues.push(
      "How to use must not mention sample products, provided product examples, product labels, or label-only amounts."
    );
  }
  if (mentionsMetaSourcePhrasing(result.risks_and_interactions)) {
    issues.push(
      "Risks and interactions must be written as direct guidance, not source-attribution prose like 'the review notes' or 'the fact sheet states'."
    );
  }

  const benefits = Array.isArray(result.benefits)
    ? (result.benefits as Record<string, unknown>[])
    : [];

  for (const benefit of benefits) {
    const label = trimString(benefit.label);
    if (!BENEFIT_LABELS.includes(label)) issues.push(`Unknown benefit label: ${label}`);
    if (!normalizeEvidenceRating(benefit.evidence_rating)) {
      issues.push(`Invalid evidence rating for benefit: ${label}`);
    }
    const evidence = trimString(benefit.evidence);
    if (!parseBenefitEvidenceLayout(evidence)) {
      issues.push(
        `Benefit evidence must match 'Author (Year), Journal: "Study title." Findings and limitation.' format: ${label}`
      );
    }
    if (/https?:\/\//i.test(evidence)) {
      issues.push(`Benefit evidence must not contain raw URLs: ${label}`);
    }
    const rawUrls = Array.isArray(benefit.source_urls) ? benefit.source_urls : [];
    const normalizedUrls = getBenefitSourceUrls(benefit);
    if (!rawUrls.length) issues.push(`Benefit has no source URLs: ${label}`);
    if (!normalizedUrls.length) issues.push(`Benefit has no valid source URLs: ${label}`);
    for (const url of rawUrls) {
      const normalizedUrl = normalizeEvidenceSourceUrl(url);
      if (!normalizedUrl) {
        issues.push(`Benefit source URL is invalid: ${trimString(url) || "(blank)"} (${label})`);
        continue;
      }
      if (!citationUrls.has(normalizedUrl)) {
        issues.push(`Benefit source URL is not present in citations: ${normalizedUrl} (${label})`);
        continue;
      }
      if (!isAllowedUrl(normalizedUrl)) {
        issues.push(`Benefit source URL is not allowlisted: ${normalizedUrl} (${label})`);
      }
    }
    if (!selectPrimaryBenefitEvidenceSource(benefit, citations)) {
      issues.push(`Benefit missing persistable evidence_source: ${label}`);
    }
  }

  if (clampScore(result.evidence_score) === null) {
    issues.push("Invalid evidence_score.");
  }

  return { ok: issues.length === 0, issues };
}

function shouldCreateLowEvidenceSupplement(result: Record<string, unknown>) {
  if (result.decision !== "manual_review") return false;
  if (!trimString(result.canonical_name)) return false;
  const reason = trimString(result.manual_review_reason).toLowerCase();
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

function hasCitationValidationIssue(issues: string[]) {
  return issues.some((issue) =>
    /citation|source url|source urls|evidence_source|persistable/i.test(issue)
  );
}

function coerceLowEvidenceSupplement(result: Record<string, unknown>) {
  if (!shouldCreateLowEvidenceSupplement(result)) return result;
  const benefits = Array.isArray(result.benefits)
    ? (result.benefits as Record<string, unknown>[])
    : [];
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

function buildResearchSchema() {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
  const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
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
        decision: { type: "string", enum: ["create_new", "manual_review"] },
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
        recommended_dose_json: {
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
        },
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
              evidence_rating: { type: "string", enum: ["gold", "silver", "bronze"] },
              score: { type: "integer", minimum: 0, maximum: 100 },
              evidence: { type: "string" },
              ranking_reason: { type: "string" },
              source_urls: { type: "array", minItems: 1, items: { type: "string" } },
            },
          },
        },
        citations: {
          type: "array",
          items: {
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
          },
        },
      },
    },
  };
}

async function fetchAllRows(table: string, select: string) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await adminSupabase!
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadContext() {
  const [supplements, aliases, rankingRows] = await Promise.all([
    fetchAllRows(TABLES.supplements, "id, name, status"),
    fetchAllRows(TABLES.aliases, "supplement_id, alias, alias_normalized"),
    fetchAllRows(
      TABLES.supplements,
      "id, name, status, evidence_score, supplement_benefits(label, score, icon)"
    ),
  ]);

  return {
    catalogEntries: buildCatalogEntries(supplements, aliases),
    benefitRankings: buildBenefitRankingExamples(
      rankingRows.filter((row) => row.status === "approved")
    ),
  };
}

function buildBenefitRankingExamples(supplementRows: Record<string, unknown>[]) {
  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const row of supplementRows) {
    const benefits = Array.isArray(row.supplement_benefits)
      ? (row.supplement_benefits as Record<string, unknown>[])
      : [];
    for (const benefit of benefits) {
      const label = trimString(benefit.label);
      if (!label || !Number.isFinite(Number(benefit.score))) continue;
      grouped[label] ||= [];
      grouped[label].push({
        supplement_name: row.name,
        supplement_evidence_score: row.evidence_score ?? null,
        benefit_score: benefit.score,
        evidence_rating: benefit.icon ?? null,
      });
    }
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([label, rows]) => {
      const sorted = rows
        .slice()
        .sort((left, right) => Number(right.benefit_score) - Number(left.benefit_score));
      const middleIndex = Math.floor(sorted.length / 2);
      return [
        label,
        {
          top: sorted.slice(0, 5),
          middle: sorted.slice(Math.max(0, middleIndex - 2), middleIndex + 3),
          bottom: sorted.slice(-5),
        },
      ];
    })
  );
}

async function fetchCandidates(normalizedNames: string[], limit: number, requestedSuggestedAction = "") {
  let query = adminSupabase!
    .from(TABLES.candidates)
    .select("*")
    .eq("review_status", "pending")
    .order("occurrence_count", { ascending: false })
    .order("last_seen_at", { ascending: false });
  if (requestedSuggestedAction) {
    query = query.eq("suggested_action", requestedSuggestedAction);
  }
  if (normalizedNames.length) query = query.in("normalized_name", normalizedNames);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`[supabase:${TABLES.candidates}] ${error.message}`);
  return data ?? [];
}

async function fetchManualReviewNames() {
  const { data, error } = await adminSupabase!
    .from(TABLES.manualReviews)
    .select("normalized_name")
    .eq("review_status", "pending");
  if (error) return new Set<string>();
  return new Set((data ?? []).map((row) => trimString(row.normalized_name)).filter(Boolean));
}

async function requestResearch(candidate: Record<string, unknown>, benefitRankings: unknown) {
  const response = await openAiFetchWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel,
      instructions: [
        "Research a supplement active ingredient and return database-ready JSON for a pending active-ingredient catalog row.",
        "This database table is for canonical active ingredients only, not branded supplements, blends, formulas, product lines, dosage forms, or finished products.",
        "If the candidate is a branded product, multi-ingredient formula, supplement product name, broad category, or cannot be reduced to one clear active ingredient, return decision manual_review.",
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
          allowed_source_domains: ALLOWED_DOMAINS,
          benefit_ranking_examples: benefitRankings,
        },
        null,
        2
      ),
      tools: [{ type: "web_search", filters: { allowed_domains: ALLOWED_DOMAINS } }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      text: {
        format: {
          type: "json_schema",
          name: buildResearchSchema().name,
          strict: true,
          schema: buildResearchSchema().schema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  const body = await response.json();
  const text = extractResponseText(body);
  if (!text) throw new Error("OpenAI returned no structured output.");
  return normalizeResearchOutput(JSON.parse(text));
}

async function requestAliasReview(candidateName: string, shortlist: Record<string, unknown>[]) {
  const response = await openAiFetchWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel,
      instructions: [
        "Classify whether a supplement active-ingredient candidate is an alias of an existing supplement or a genuinely new canonical supplement.",
        "Prefer alias_existing when the candidate is a spelling, plant-part, species, dosage-form, salt/form, vitamin form, mineral form, or common-name variant of an existing row.",
        "Return create_new when none of the existing supplements are the same active ingredient.",
        "Return manual_review only when the distinction is medically meaningful or genuinely uncertain.",
      ].join(" "),
      input: JSON.stringify(
        { candidate_name: candidateName, existing_supplements: shortlist },
        null,
        2
      ),
      tools: [],
      tool_choice: "none",
      text: {
        format: {
          type: "json_schema",
          name: "supplement_alias_review",
          strict: true,
          schema: buildAliasReviewSchema(),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  const body = await response.json();
  const text = extractResponseText(body);
  if (!text) throw new Error("OpenAI returned no alias review output.");
  return JSON.parse(text) as Record<string, unknown>;
}

async function upsertAlias(supplementId: string, alias: unknown) {
  const aliasText = normalizeText(alias);
  const normalized = normalizeLookupText(aliasText);
  if (!supplementId || !aliasText || !normalized) return;

  const { data: existing, error: existingError } = await adminSupabase!
    .from(TABLES.aliases)
    .select("id")
    .eq("supplement_id", supplementId)
    .eq("alias_normalized", normalized)
    .limit(1);
  if (existingError) throw new Error(`[supabase:${TABLES.aliases}] ${existingError.message}`);
  if (existing?.length) return;

  const { error } = await adminSupabase!.from(TABLES.aliases).insert({
    supplement_id: supplementId,
    alias: aliasText,
    alias_normalized: normalized,
    alias_type: "ai_researched",
  });
  if (error) throw new Error(`[supabase:${TABLES.aliases}] ${error.message}`);
}

async function relinkIngredients(supplementId: string, names: unknown[]) {
  const displayNames = Array.from(new Set(names.map(normalizeText).filter(Boolean)));
  const linkedIds = new Set<string>();
  for (const name of displayNames) {
    for (const column of ["canonical_name", "display_name"]) {
      const { data, error } = await adminSupabase!
        .from(TABLES.activeIngredients)
        .update({
          canonical_supplement_id: supplementId,
          resolution_status: "linked",
          resolution_confidence: 0.95,
        })
        .ilike(column, name)
        .select("id");
      if (error) throw new Error(`[supabase:${TABLES.activeIngredients}] ${error.message}`);
      for (const row of data ?? []) linkedIds.add(trimString(row.id));
    }
  }
  return linkedIds.size;
}

async function markCandidateApplied(candidate: Record<string, unknown>, supplement: { id: string; name: string; note: string }) {
  const normalizedName = trimString(candidate.normalized_name);
  if (!normalizedName) return;
  const { error } = await adminSupabase!
    .from(TABLES.candidates)
    .update({
      review_status: "applied",
      approved_supplement_id: supplement.id,
      approved_supplement_name: supplement.name,
      review_notes: supplement.note,
      updated_at: new Date().toISOString(),
    })
    .eq("normalized_name", normalizedName);
  if (error) throw new Error(`[supabase:${TABLES.candidates}] ${error.message}`);
}

function queueSuggestedActionForDecision(decision: unknown) {
  if (decision === "create_new") return "create_canonical";
  if (decision === "manual_review") return "manual_review";
  if (decision === "failed") return "manual_review";
  if (decision === "alias_existing") return "manual_review";
  return null;
}

function queueSuggestedSupplementNameForRecord(record: Record<string, unknown>) {
  if (record?.decision === "alias_existing") {
    return normalizeText(record?.match_name) || null;
  }
  return (
    normalizeText(record?.research_canonical_name) ||
    normalizeText(record?.candidate_suggested_supplement_name) ||
    normalizeText(record?.candidate_name) ||
    null
  );
}

function queueReviewNotesForRecord(record: Record<string, unknown>) {
  const decision = trimString(record?.decision) || "pending";
  const matchedName = normalizeText(record?.match_name);
  if (matchedName) return `Latest research decision: ${decision} (${matchedName})`;
  return `Latest research decision: ${decision}`;
}

function buildCachedResearchPayload(record: Record<string, unknown>) {
  if (record?.research !== undefined) return record.research ?? null;
  if (record?.decision === "alias_existing") return null;
  if (record?.decision === "manual_review" && !record?.candidate_research_json) return null;
  return undefined;
}

async function syncCandidateQueueDecision(candidate: Record<string, unknown>, record: Record<string, unknown>) {
  const normalizedName = trimString(candidate.normalized_name);
  if (!normalizedName) return;

  const suggestedAction = queueSuggestedActionForDecision(record?.decision);
  if (!suggestedAction) return;

  const payload: Record<string, unknown> = {
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

  const { error } = await adminSupabase!
    .from(TABLES.candidates)
    .update(payload)
    .eq("normalized_name", normalizedName);
  if (error) throw new Error(`[supabase:${TABLES.candidates}] ${error.message}`);
}

async function markManualReviewResolved(candidate: Record<string, unknown>, supplement: { id: string; name: string }) {
  const normalizedName = trimString(candidate.normalized_name);
  if (!normalizedName) return;
  const { error } = await adminSupabase!
    .from(TABLES.manualReviews)
    .update({
      review_status: "resolved",
      linked_supplement_id: supplement.id,
      linked_supplement_name: supplement.name,
      updated_at: new Date().toISOString(),
    })
    .eq("normalized_name", normalizedName);
  if (error) throw new Error(`[supabase:${TABLES.manualReviews}] ${error.message}`);
}

async function applyAliasExisting(candidate: Record<string, unknown>, match: { id: string; name: string }, extraAliases: unknown[] = []) {
  const names = [
    canonicalCandidateName(candidate),
    candidate.display_name,
    candidate.normalized_name,
    ...extraAliases,
  ];
  for (const name of names) await upsertAlias(match.id, name);
  const linked = await relinkIngredients(match.id, names);
  await markCandidateApplied(candidate, {
    id: match.id,
    name: match.name,
    note: `Linked as alias of existing supplement: ${match.name}`,
  });
  await markManualReviewResolved(candidate, match);
  return { linked };
}

function buildBenefitRows(supplement: { id: string; name: string }, research: Record<string, unknown>) {
  const benefits = Array.isArray(research.benefits)
    ? (research.benefits as Record<string, unknown>[])
    : [];
  return benefits.map((benefit) => ({
    supplement_id: supplement.id,
    supplement_name: supplement.name,
    label: trimString(benefit.label),
    icon: normalizeEvidenceRating(benefit.evidence_rating),
    score: clampScore(benefit.score),
    evidence: normalizeText(benefit.evidence),
    evidence_source: selectPrimaryBenefitEvidenceSource(benefit, research.citations),
    ranking_reason: normalizeText(benefit.ranking_reason),
  }));
}

async function applyResearchRelations(candidate: Record<string, unknown>, supplement: { id: string; name: string }, research: Record<string, unknown>) {
  const aliases = Array.isArray(research.aliases) ? research.aliases : [];
  const names = [
    supplement.name,
    canonicalCandidateName(candidate),
    candidate.display_name,
    candidate.normalized_name,
    ...aliases,
  ];
  for (const name of names) await upsertAlias(supplement.id, name);

  const benefitRows = buildBenefitRows(supplement, research);
  await adminSupabase!.from(TABLES.benefits).delete().eq("supplement_id", supplement.id);
  if (benefitRows.length) {
    const { error } = await adminSupabase!.from(TABLES.benefits).insert(benefitRows);
    if (error) throw new Error(`[supabase:${TABLES.benefits}] ${error.message}`);
  }

  const linked = await relinkIngredients(supplement.id, names);
  return { linked, benefitCount: benefitRows.length };
}

async function createPendingSupplement(candidate: Record<string, unknown>, research: Record<string, unknown>) {
  const canonicalName = normalizeText(research.canonical_name);
  const { data: supplement, error } = await adminSupabase!
    .from(TABLES.supplements)
    .insert({
      name: canonicalName,
      what_is_it: normalizeText(research.what_is_it) || null,
      why_use_it: normalizeText(research.why_use_it) || null,
      how_does_it_work: normalizeText(research.how_does_it_work) || null,
      side_effects: normalizeText(research.side_effects) || null,
      risks_and_interactions: normalizeText(research.risks_and_interactions) || null,
      who_might_benefit: normalizeText(research.who_might_benefit) || null,
      evidence: normalizeText(research.evidence) || null,
      evidence_score: clampScore(research.evidence_score),
      status: "pending",
      how_to_use: normalizeText(research.how_to_use) || null,
      recommended_dose_status: research.recommended_dose_status,
      recommended_dose_json: research.recommended_dose_json,
      dose_scoring_profile_json: research.dose_scoring_profile_json,
    })
    .select("id, name, status")
    .single();
  if (error) throw new Error(`[supabase:${TABLES.supplements}] ${error.message}`);

  const relations = await applyResearchRelations(candidate, supplement, research);
  await markCandidateApplied(candidate, {
    id: supplement.id,
    name: supplement.name,
    note: "Created pending supplement from automatic scan research.",
  });
  await markManualReviewResolved(candidate, supplement);
  return { supplement, ...relations };
}

function normalizeCachedResearch(candidate: Record<string, unknown>) {
  const cached = candidate?.research_json;
  if (!cached || typeof cached !== "object" || Array.isArray(cached)) return null;
  return coerceLowEvidenceSupplement(
    sanitizeResearchProse(normalizeJsonDoseUnits({ ...cached as Record<string, unknown> }))
  );
}

async function upsertManualReview(candidate: Record<string, unknown>, reason: string, research: Record<string, unknown> | null, issues: string[]) {
  const now = new Date().toISOString();
  const normalizedName = trimString(candidate.normalized_name) || normalizeLookupText(canonicalCandidateName(candidate));
  if (!normalizedName) return;
  const { error } = await adminSupabase!.from(TABLES.manualReviews).upsert(
    {
      normalized_name: normalizedName,
      display_name: trimString(candidate.display_name) || canonicalCandidateName(candidate) || normalizedName,
      suggested_supplement_name:
        trimString(candidate.suggested_supplement_name) ||
        trimString(research?.canonical_name) ||
        null,
      occurrence_count: Number.isFinite(Number(candidate.occurrence_count))
        ? Number(candidate.occurrence_count)
        : 0,
      review_status: "pending",
      decision: looksLikeProduct(canonicalCandidateName(candidate))
        ? "skipped_product_like"
        : "manual_review",
      reason: reason || "Manual review required.",
      validation_issues_json: issues,
      candidate_json: candidate,
      research_json: research,
      citations_json: Array.isArray(research?.citations) ? research?.citations : [],
      sample_active_ingredients_json: Array.isArray(candidate.sample_active_ingredients_json)
        ? candidate.sample_active_ingredients_json
        : [],
      sample_products_json: Array.isArray(candidate.sample_products_json)
        ? candidate.sample_products_json
        : [],
      source_latest_created_at: trimString(candidate.source_latest_created_at) || null,
      updated_at: now,
      first_seen_at: trimString(candidate.first_seen_at) || now,
      last_seen_at: now,
    },
    { onConflict: "normalized_name" }
  );
  if (error) throw new Error(`[supabase:${TABLES.manualReviews}] ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    if (!adminSupabase || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Missing Supabase service configuration." }, 500);
    }
    if (!openAiApiKey) {
      return jsonResponse({ error: "Missing OPENAI_API_KEY secret." }, 500);
    }

    if (!isServiceRoleRequest(req)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const normalizedNames = Array.isArray(body?.normalizedNames)
      ? Array.from(new Set(body.normalizedNames.map(normalizeLookupText).filter(Boolean)))
      : [];
    const requestedSuggestedActionRaw = trimString(body?.suggestedAction).toLowerCase();
    const requestedSuggestedAction = (
      {
        create_new: "create_canonical",
        create_canonical: "create_canonical",
        manual_review: "manual_review",
        ignore: "ignore",
      } as Record<string, string>
    )[requestedSuggestedActionRaw] || "";
    if (requestedSuggestedActionRaw && !requestedSuggestedAction) {
      return jsonResponse(
        {
          error:
            "Invalid suggestedAction. Use create_canonical, create_new, manual_review, or ignore.",
        },
        400
      );
    }
    const refreshResearch = Boolean(body?.refreshResearch);
    const limit = Math.max(1, Math.min(5, Number.parseInt(String(body?.limit ?? "1"), 10) || 1));
    const candidates = await fetchCandidates(
      normalizedNames,
      limit,
      requestedSuggestedAction
    );
    const manualReviewNames = await fetchManualReviewNames();
    const context = await loadContext();
    const records = [];

    for (const candidate of candidates) {
      const candidateName = canonicalCandidateName(candidate);
      const lookupName =
        trimString(candidate.display_name) ||
        trimString(candidate.normalized_name) ||
        candidateName;
      const normalizedName = trimString(candidate.normalized_name) || normalizeLookupText(candidateName);
      const record: Record<string, unknown> = {
        candidate_name: candidateName,
        decision: "pending",
        applied: false,
        candidate_research_json: candidate.research_json ?? null,
      };
      records.push(record);

      try {
        if (manualReviewNames.has(normalizedName)) {
          record.decision = "skipped_manual_review";
          continue;
        }
        if (looksLikeProduct(candidateName)) {
          await upsertManualReview(candidate, "Candidate looks like a product, formula, or dosage form.", null, []);
          record.decision = "manual_review";
          record.reason = "Candidate looks like a product, formula, or dosage form.";
          await syncCandidateQueueDecision(candidate, record);
          continue;
        }

        const duplicate = findDuplicateCandidate(lookupName, context.catalogEntries);
        if (duplicate.action === "alias_existing" && duplicate.match) {
          const result = await applyAliasExisting(candidate, duplicate.match);
          record.decision = "alias_existing";
          record.reason = `Local alias match: ${duplicate.match.name}`;
          record.match_name = duplicate.match.name;
          record.applied = true;
          record.result = result;
          await syncCandidateQueueDecision(candidate, record);
          continue;
        }
        if (duplicate.action === "manual_review") {
          const aliasReview = await requestAliasReview(
            candidateName,
            aliasReviewPayload(duplicate.shortlist)
          );
          if (aliasReview.decision === "alias_existing") {
            if (Number(aliasReview.confidence) < 0.75) {
              await upsertManualReview(candidate, `Alias review confidence too low: ${aliasReview.reason}`, null, []);
              record.decision = "manual_review";
              record.reason = `Alias review confidence too low: ${aliasReview.reason}`;
              await syncCandidateQueueDecision(candidate, record);
              continue;
            }
            const match = duplicate.shortlist.find(
              (item) => item.id === aliasReview.matched_supplement_id
            );
            if (!match) {
              await upsertManualReview(candidate, "Alias review returned an unknown supplement id.", null, []);
              record.decision = "manual_review";
              record.reason = "Alias review returned an unknown supplement id.";
              await syncCandidateQueueDecision(candidate, record);
              continue;
            }
            const result = await applyAliasExisting(candidate, match);
            record.decision = "alias_existing";
            record.reason = String(aliasReview.reason ?? "");
            record.match_name = match.name;
            record.applied = true;
            record.result = result;
            await syncCandidateQueueDecision(candidate, record);
            continue;
          }
          if (
            aliasReview.decision === "manual_review" &&
            !aliasReviewAllowsCreateNew(aliasReview) &&
            Number(aliasReview.confidence) >= 0.85
          ) {
            await upsertManualReview(candidate, String(aliasReview.reason), null, []);
            record.decision = "manual_review";
            record.reason = String(aliasReview.reason ?? "");
            await syncCandidateQueueDecision(candidate, record);
            continue;
          }
        }

        const cachedResearch = refreshResearch ? null : normalizeCachedResearch(candidate);
        const research =
          cachedResearch ??
          coerceLowEvidenceSupplement(await requestResearch(candidate, context.benefitRankings));
        record.research_canonical_name = normalizeText(research.canonical_name) || null;
        record.candidate_suggested_supplement_name =
          normalizeText(candidate.suggested_supplement_name) || null;
        record.research = research;
        const validation = validateResearch(research);
        if (!validation.ok) {
          if (hasCitationValidationIssue(validation.issues)) {
            console.warn("[research-pending-supplements] missing or invalid citation URL", {
              candidate: candidateName,
              issues: validation.issues,
            });
          }
          await upsertManualReview(candidate, validation.issues.join("; "), research, validation.issues);
          record.decision = "manual_review";
          record.reason = validation.issues.join("; ");
          record.validation_issues = validation.issues;
          await syncCandidateQueueDecision(candidate, record);
          continue;
        }

        const aliasGuardShortlist = buildAliasGuardShortlist({
          candidate,
          research,
          catalogEntries: context.catalogEntries,
        });
        if (aliasGuardShortlist.length) {
          const aliases = Array.isArray(research.aliases) ? research.aliases : [];
          const aliasReview = await requestAliasReview(
            [
              normalizeText(research.canonical_name) || candidateName,
              `original candidate: ${candidateName}`,
              `known aliases: ${dedupeStrings(aliases).join(", ") || "none"}`,
            ].join("\n"),
            aliasReviewPayload(aliasGuardShortlist)
          );
          if (aliasReview.decision === "alias_existing") {
            if (Number(aliasReview.confidence) < 0.75) {
              await upsertManualReview(candidate, `Alias guard confidence too low: ${aliasReview.reason}`, research, []);
              record.decision = "manual_review";
              record.reason = `Alias guard confidence too low: ${aliasReview.reason}`;
              await syncCandidateQueueDecision(candidate, record);
              continue;
            }
            const match = aliasGuardShortlist.find(
              (item) => item.id === aliasReview.matched_supplement_id
            );
            if (!match) {
              await upsertManualReview(candidate, "Alias guard returned an unknown supplement id.", research, []);
              record.decision = "manual_review";
              record.reason = "Alias guard returned an unknown supplement id.";
              await syncCandidateQueueDecision(candidate, record);
              continue;
            }
            const result = await applyAliasExisting(candidate, match, [
              research.canonical_name,
              ...aliases,
            ]);
            record.decision = "alias_existing";
            record.reason = `Alias guard: ${String(aliasReview.reason ?? "")}`;
            record.match_name = match.name;
            record.applied = true;
            record.result = result;
            await syncCandidateQueueDecision(candidate, record);
            continue;
          }
          if (
            aliasReview.decision === "manual_review" &&
            !aliasReviewAllowsCreateNew(aliasReview) &&
            Number(aliasReview.confidence) >= 0.85
          ) {
            await upsertManualReview(candidate, `Alias guard needs review: ${aliasReview.reason}`, research, []);
            record.decision = "manual_review";
            record.reason = `Alias guard needs review: ${String(aliasReview.reason ?? "")}`;
            await syncCandidateQueueDecision(candidate, record);
            continue;
          }
        }

        const result = await createPendingSupplement(candidate, research);
        record.decision = "create_new";
        record.reason = "Source-backed research passed validation.";
        record.applied = true;
        record.result = result;
        await syncCandidateQueueDecision(candidate, record);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await upsertManualReview(candidate, reason, null, [reason]).catch((reviewError) => {
          console.error("Failed to record manual review", reviewError);
        });
        record.decision = "failed";
        record.reason = reason;
        await syncCandidateQueueDecision(candidate, record).catch((syncError) => {
          console.error("Failed to sync candidate queue decision", syncError);
        });
      }
    }

    return jsonResponse({
      processed: records.length,
      applied: records.filter((record) => record.applied).length,
      records,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Unexpected research-pending-supplements failure",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
