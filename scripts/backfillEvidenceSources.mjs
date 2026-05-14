import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const TABLE_NAME = "supplement_benefits";
const DEFAULT_MODEL =
  process.env.SUPPLEMENT_EVIDENCE_SOURCE_MODEL ||
  process.env.SUPPLEMENT_RESEARCH_MODEL ||
  "gpt-5.4-mini";
const DEFAULT_BATCH_SIZE = 2;
const DEFAULT_DELAY_MS = 1200;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MIN_CONFIDENCE = 0.85;
const DEFAULT_OUTPUT_DIR = path.join(
  PROJECT_ROOT,
  "supabase",
  ".temp",
  "evidence-source-backfill"
);

const SOURCE_TYPE_PRIORITY = [
  "pubmed",
  "pmc",
  "doi",
  "journal",
  "official_guidance",
];
const ALLOWED_SOURCE_TYPES = new Set([
  "pubmed",
  "pmc",
  "doi",
  "journal",
  "official_guidance",
]);
const TRUSTED_SOURCE_HOSTS = [
  "doi.org",
  "dx.doi.org",
  "pubmed.ncbi.nlm.nih.gov",
  "pmc.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "ods.od.nih.gov",
  "frontiersin.org",
  "journals.plos.org",
  "nature.com",
  "tandfonline.com",
  "sciencedirect.com",
  "mdpi.com",
  "springer.com",
  "link.springer.com",
  "wiley.com",
  "onlinelibrary.wiley.com",
  "academic.oup.com",
  "oup.com",
  "cambridge.org",
  "bmj.com",
  "jamanetwork.com",
  "nejm.org",
  "cureus.com",
  "bmc.com",
  "biomedcentral.com",
  "karger.com",
  "liebertpub.com",
  "sagepub.com",
  "hindawi.com",
  "dovepress.com",
  "jstage.jst.go.jp",
  "plos.org",
  "nih.gov",
];
const OFFICIAL_GUIDANCE_HOSTS = [
  "ods.od.nih.gov",
  "nih.gov",
  "ncbi.nlm.nih.gov",
  "books.ncbi.nlm.nih.gov",
];
const EVIDENCE_MATCH_STATUSES = [
  "exact",
  "near_match",
  "mismatched",
  "uncertain",
];
const DISALLOWED_SOURCE_HOSTS = new Set([
  "amazon.com",
  "bing.com",
  "blogspot.com",
  "books.google.com",
  "duckduckgo.com",
  "ebsco.com",
  "facebook.com",
  "google.com",
  "googleusercontent.com",
  "jamanetwork.com.ezproxy",
  "news.google.com",
  "onlinelibrary.wiley.com.ezproxy",
  "pubmed.ncbi.nlm.nih.gov.ezproxy",
  "researchgate.net",
  "sciencedirect.com.ezproxy",
  "scholar.google.com",
  "semanticscholar.org",
  "t.co",
  "twitter.com",
  "wikipedia.org",
  "yahoo.com",
  "youtube.com",
]);
const HMB_EXERCISE_RECOVERY_BAD_SOURCE_URL =
  "https://tandfonline.com/journals/ijss20";
const HMB_EXERCISE_RECOVERY_REPAIR_FILTER = {
  supplement_name: "Beta-hydroxy beta-methylbutyrate (HMB)",
  label: "Exercise recovery",
};

function isDisallowedSourceHost(host) {
  return Array.from(DISALLOWED_SOURCE_HOSTS).some(
    (blockedHost) => host === blockedHost || host.endsWith(`.${blockedHost}`)
  );
}

function isTrustedSourceHost(host) {
  return TRUSTED_SOURCE_HOSTS.some(
    (trustedHost) => host === trustedHost || host.endsWith(`.${trustedHost}`)
  );
}

function isOfficialGuidanceHost(host) {
  return OFFICIAL_GUIDANCE_HOSTS.some(
    (trustedHost) => host === trustedHost || host.endsWith(`.${trustedHost}`)
  );
}

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
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSecretToken(value) {
  return trimString(value)
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function parseOptionalInteger(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalFloat(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function requireEnv(name, fallback = "") {
  const value = trimString(process.env[name] || fallback);
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function createAdminClient() {
  const supabaseUrl = requireEnv(
    "SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL
  );
  const serviceRoleKey = normalizeSecretToken(
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function buildHeaders(apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (process.env.OPENAI_PROJECT_ID) {
    headers["OpenAI-Project"] = process.env.OPENAI_PROJECT_ID;
  }

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

    await sleep(750 * 2 ** attempt);
  }

  throw lastError ?? new Error("OpenAI request failed");
}

function extractResponseText(body) {
  if (typeof body?.output_text === "string") {
    return body.output_text;
  }

  const chunks = [];
  const output = Array.isArray(body?.output) ? body.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("");
}

function extractWebSearchSources(value) {
  const matches = [];
  const seen = new Set();

  function visit(node) {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node.sources)) {
      for (const source of node.sources) {
        const url = trimString(source?.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        matches.push({
          title: normalizeText(source?.title),
          url,
        });
      }
    }

    Object.values(node).forEach(visit);
  }

  visit(value);
  return matches;
}

function normalizeSourceType(value) {
  const normalized = trimString(value).toLowerCase();
  return [
    "pubmed",
    "doi",
    "pmc",
    "journal",
    "official_guidance",
    "other",
    "none",
  ].includes(normalized)
    ? normalized
    : "other";
}

function normalizeEvidenceMatchStatus(value) {
  const normalized = trimString(value).toLowerCase();
  return EVIDENCE_MATCH_STATUSES.includes(normalized)
    ? normalized
    : "uncertain";
}

function normalizePmid(value) {
  const normalized = trimString(value);
  if (!normalized) return null;

  const digits = normalized.replace(/[^0-9]/g, "");
  return /^\d{5,9}$/.test(digits) ? digits : null;
}

function normalizePmcid(value) {
  const normalized = trimString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) return null;
  if (/^PMC\d+$/.test(normalized)) return normalized;
  if (/^\d+$/.test(normalized)) return `PMC${normalized}`;
  return null;
}

function normalizeDoi(value) {
  let normalized = trimString(value);
  if (!normalized) return null;

  normalized = normalized
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[),.;]+$/g, "");

  return /^10\.\S+\/\S+$/i.test(normalized) ? normalized : null;
}

function buildCanonicalPubmedUrl(pmid) {
  return pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null;
}

function buildCanonicalPmcUrl(pmcid) {
  return pmcid ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` : null;
}

function buildCanonicalDoiUrl(doi) {
  return doi ? `https://doi.org/${doi}` : null;
}

function buildLookupSchema() {
  const nullableString = {
    anyOf: [{ type: "string" }, { type: "null" }],
  };

  return {
    name: "supplement_benefit_evidence_source_lookup",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "citation_title",
        "authors",
        "year",
        "pmid",
        "pmcid",
        "doi",
        "journal_url",
        "source_url",
        "source_type",
        "confidence",
        "evidence_match_status",
        "mismatch_reason",
        "reason",
      ],
      properties: {
        citation_title: nullableString,
        authors: nullableString,
        year: nullableString,
        pmid: nullableString,
        pmcid: nullableString,
        doi: nullableString,
        journal_url: nullableString,
        source_url: nullableString,
        source_type: {
          type: "string",
          enum: [
            "pubmed",
            "doi",
            "pmc",
            "journal",
            "official_guidance",
            "other",
            "none",
          ],
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        evidence_match_status: {
          type: "string",
          enum: EVIDENCE_MATCH_STATUSES,
        },
        mismatch_reason: nullableString,
        reason: { type: "string" },
      },
    },
  };
}

function buildLookupInstructions() {
  return [
    "Identify the exact study or source described by a supplement evidence paragraph.",
    "Use web search to verify the source before returning any URL.",
    "Return evidence_match_status exact when one specific source is clearly identified and there is no material contradiction in population, intervention, outcomes, or study design.",
    "Treat paraphrased summaries, pooled findings from a systematic review or meta-analysis, minor punctuation/capitalisation differences in the title, and minor citation metadata drift such as a journal-name or year typo as exact when the source identity is otherwise clear.",
    "Use near_match, mismatched, or uncertain only when the evidence appears to combine multiple studies, or when there is material uncertainty or contradiction about the actual source identity or its population, intervention, outcomes, or study design.",
    "Populate pmid, pmcid, and doi whenever you can verify them. Use null when unknown.",
    "Populate journal_url with a journal landing page when known and source_url with the best verified source page you found.",
    "For official NIH/NCBI guidance or fact sheets, use source_type official_guidance and return the exact official page URL.",
    "Prefer exact matches in this order: PMID, PMCID, DOI, journal landing page, other trusted source page.",
    "Return only trustworthy URLs. Never return Google, Google Scholar, ResearchGate, Wikipedia, blog posts, supplement marketing pages, or generic search results.",
    "Do not hallucinate titles, authors, year, journal pages, or URLs.",
    "Use only evidence text details plus trustworthy search results.",
    "If confidence is below 0.85, if the title/source identity cannot be pinned to one source, if the source population/intervention/outcomes/study design differ materially from the evidence text, or if the evidence appears to combine multiple studies, do not claim an exact match.",
    "Return JSON only.",
  ].join(" ");
}

async function requestEvidenceSource({ apiKey, model, row }) {
  const response = await openAiFetchWithRetry(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model,
        instructions: buildLookupInstructions(),
        input: JSON.stringify(
          {
            row_id: row.id,
            supplement_id: row.supplement_id,
            supplement_name: row.supplement_name,
            label: row.label,
            evidence: normalizeText(row.evidence),
            source_url_preference: SOURCE_TYPE_PRIORITY,
          },
          null,
          2
        ),
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        text: {
          format: {
            type: "json_schema",
            name: buildLookupSchema().name,
            strict: true,
            schema: buildLookupSchema().schema,
          },
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  const body = await response.json();
  const text = extractResponseText(body);
  if (!text) {
    throw new Error("OpenAI returned no structured output.");
  }

  return {
    parsed: normalizeLookupResult(JSON.parse(text)),
    sources: extractWebSearchSources(body),
  };
}

function normalizeLookupResult(result) {
  return {
    citation_title: normalizeText(result?.citation_title) || null,
    authors: normalizeText(result?.authors) || null,
    year: trimString(result?.year) || null,
    pmid: normalizePmid(result?.pmid),
    pmcid: normalizePmcid(result?.pmcid),
    doi: normalizeDoi(result?.doi),
    journal_url: trimString(result?.journal_url) || null,
    source_url: trimString(result?.source_url) || null,
    source_type: normalizeSourceType(result?.source_type),
    confidence: clampConfidence(result?.confidence),
    evidence_match_status: normalizeEvidenceMatchStatus(
      result?.evidence_match_status
    ),
    mismatch_reason: normalizeText(result?.mismatch_reason) || null,
    reason: normalizeText(result?.reason) || "",
  };
}

function canonicalizeUrl(rawUrl) {
  const value = trimString(rawUrl);
  if (!value) return null;

  const normalizedDoi = normalizeDoi(value);
  let normalized = normalizedDoi ? buildCanonicalDoiUrl(normalizedDoi) : value;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return null;
  }

  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  const pmid = extractPmidFromParsedUrl(parsed);
  if (pmid) {
    return buildCanonicalPubmedUrl(pmid);
  }

  const pmcid = extractPmcidFromParsedUrl(parsed);
  if (pmcid) {
    return buildCanonicalPmcUrl(pmcid);
  }

  if (parsed.hostname === "dx.doi.org") {
    parsed.hostname = "doi.org";
    parsed.search = "";
  }

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (/^(fbclid|gclid|mc_cid|mc_eid|utm_|ref)$/i.test(key)) {
      parsed.searchParams.delete(key);
    }
  }

  if (parsed.hostname === "doi.org") {
    parsed.search = "";
  }

  if (parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString();
}

function normalizePotentialPubmedTerm(value) {
  const normalized = trimString(value).replace(/^pmid[:\s]*/i, "");
  return /^\d{5,9}$/.test(normalized) ? normalized : null;
}

function extractPmidFromParsedUrl(parsed) {
  const host = parsed.hostname.toLowerCase();
  if (!["pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov"].includes(host)) {
    return null;
  }

  const pathMatch = parsed.pathname.match(/^\/(?:pubmed\/)?(\d+)\/?$/i);
  if (pathMatch) {
    return normalizePmid(pathMatch[1]);
  }

  const queryMatch =
    normalizePotentialPubmedTerm(parsed.searchParams.get("term")) ||
    normalizePotentialPubmedTerm(parsed.searchParams.get("uid")) ||
    normalizePotentialPubmedTerm(parsed.searchParams.get("idsfromresult")) ||
    normalizePotentialPubmedTerm(parsed.searchParams.get("list_uids"));

  return normalizePmid(queryMatch);
}

function extractPmcidFromParsedUrl(parsed) {
  const host = parsed.hostname.toLowerCase();
  if (!["pmc.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov"].includes(host)) {
    return null;
  }

  const pathMatch = parsed.pathname.match(
    /^\/(?:pmc\/)?articles\/(PMC\d+)\/?$/i
  );
  return normalizePmcid(pathMatch?.[1]);
}

function isGenericSearchUrl(url) {
  const normalized = canonicalizeUrl(url);
  if (!normalized) return false;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  const host = parsed.hostname;
  if (isDisallowedSourceHost(host)) {
    return true;
  }

  if (host === "pubmed.ncbi.nlm.nih.gov") {
    return !/^\/\d+\/?$/.test(parsed.pathname);
  }

  return /(^|\/)(search|results)(\/|$)/i.test(parsed.pathname);
}

function isPdfUrl(url) {
  const normalized = canonicalizeUrl(url);
  if (!normalized) return false;

  try {
    return /\.(pdf|epub|xml)$/i.test(new URL(normalized).pathname);
  } catch {
    return false;
  }
}

function looksLikeDoiPath(pathname) {
  return /\/10\.\d{4,9}\/\S+/i.test(pathname);
}

function looksLikeArticleIdSegment(value) {
  const segment = trimString(value);
  if (!segment) return false;

  return (
    /^\d{4,}$/.test(segment) ||
    /^[A-Za-z0-9._-]{6,}$/.test(segment) ||
    /^S\d{8,}[A-Za-z0-9-]*$/i.test(segment)
  );
}

function isArticleSpecificJournalUrl(url) {
  const normalized = canonicalizeUrl(url);
  if (!normalized) return false;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  const segments = pathname.split("/").filter(Boolean);

  if (pathname === "/") {
    return false;
  }

  if (
    /\/(doi(\/(abs|full|pdf|epdf))?|article|articles|science\/article|fullarticle)\//i.test(
      pathname
    )
  ) {
    return true;
  }

  if (looksLikeDoiPath(pathname)) {
    return true;
  }

  if (/\/content\/\d+\/\d+\/[\w.-]+$/i.test(pathname)) {
    return true;
  }

  if (/\/crid\/|\/record\/|\/abstract\/|\/citation\//i.test(pathname)) {
    return true;
  }

  if (
    segments.length >= 3 &&
    looksLikeArticleIdSegment(segments.at(-1)) &&
    !/^(journals?|journal|browse|subjects|collections|issues?|issue|archive|volumes?|current|toc|search)$/i.test(
      segments.at(-1)
    )
  ) {
    return true;
  }

  if (
    /(^|\/)(journals?|journal|browse|subjects|collections|issues?|issue|archive|volumes?|current|toc|search)(\/|$)/i.test(
      pathname
    )
  ) {
    return false;
  }

  return false;
}

function detectSourceType(url, sourceTypeHint = "other") {
  const normalized = canonicalizeUrl(url);
  if (!normalized) return "other";

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return "other";
  }

  const host = parsed.hostname;
  if (host === "pubmed.ncbi.nlm.nih.gov" && /^\/\d+\/?$/.test(parsed.pathname)) {
    return "pubmed";
  }

  if (host === "doi.org" && /^\/10\./.test(parsed.pathname)) {
    return "doi";
  }

  if (
    host === "pmc.ncbi.nlm.nih.gov" &&
    /^\/articles\/PMC\d+\/?$/i.test(parsed.pathname)
  ) {
    return "pmc";
  }

  if (
    sourceTypeHint === "official_guidance" &&
    isOfficialGuidanceHost(host)
  ) {
    return "official_guidance";
  }

  if (isOfficialGuidanceHost(host)) {
    return "official_guidance";
  }

  if (isDisallowedSourceHost(host)) {
    return "other";
  }

  return "journal";
}

function evidenceExplicitlyNamesOfficialSource(evidence) {
  const normalized = normalizeLookupText(evidence);
  return (
    /office of dietary supplements/.test(normalized) ||
    /nih ods/.test(normalized) ||
    /ods fact sheet/.test(normalized) ||
    /ncbi bookshelf/.test(normalized) ||
    /bookshelf/.test(normalized)
  );
}

function buildSearchSourceContext({ lookup, sources }) {
  const canonicalSources = sources
    .map((source) => ({
      ...source,
      canonical_url: canonicalizeUrl(source.url),
    }))
    .filter((source) => source.canonical_url);

  const sourceUrlSet = new Set(canonicalSources.map((source) => source.canonical_url));
  const titleMatches = canonicalSources.filter((source) =>
    titlesLikelyMatch(lookup.citation_title, source.title)
  );

  return {
    canonicalSources,
    sourceUrlSet,
    titleMatches,
  };
}

function hasMultipleStudySignal(...values) {
  const text = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  return (
    /(combine|combines|combined|combining|draws on|based on).{0,40}multiple stud/i.test(
      text
    ) ||
    /(more than one|several).{0,20}stud/i.test(text)
  );
}

function hasMaterialMismatchSignal(...values) {
  const text = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ")
    .replace(
      /\b((with\s+)?no|without|does not(?:\s+\w+){0,4}|do not(?:\s+\w+){0,4}|did not(?:\s+\w+){0,4})\s+(meaningful\s+|material\s+)?mismatch\b/gi,
      ""
    );

  return (
    /\b(population|participants|patients|intervention|outcome|trial design|species|dose|dosage)\s+(differs?|mismatch(?:ed)?|does not match|inconsistent)\b/i.test(
      text
    ) ||
    /\b(different|mismatch(?:ed)?|does not match|inconsistent)\s+(population|participants|patients|intervention|outcome|trial design|species|dose|dosage)\b/i.test(
      text
    ) ||
    /\b(material mismatch|population mismatch|intervention mismatch|outcome mismatch|trial design mismatch)\b/i.test(
      text
    ) ||
    /\b(different population|different intervention|different outcome|different trial design|different species|different dose|different dosage)\b/i.test(
      text
    ) ||
    /(not the same study|different study|factual discrepanc|factually mismatched)/i.test(
      text
    )
  );
}

function hasOverrideBlockingSignal(...values) {
  const text = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  return (
    /(material uncertainty|not uniquely verifiable|could not verify|cannot verify|unable to verify|unclear which study)/i.test(
      text
    ) ||
    /(combine|combines|combined).{0,20}(trial details|study details|details)/i.test(
      text
    )
  );
}

function hasMinorMetadataDifferenceSignal(...values) {
  const text = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  return /(paraphrase|paraphrased|summary|summarized|compresses|compressed|rephrase|rephrased|journal name|year difference|metadata|citation drift|minor mismatch|minor metadata|pooled findings|meta-analysis|systematic review)/i.test(
    text
  );
}

function canOverrideNonExactMatch({ lookup, searchContext }) {
  if (
    lookup.evidence_match_status === "exact" ||
    lookup.evidence_match_status === "mismatched"
  ) {
    return false;
  }

  const hasExactIdentifier = Boolean(lookup.pmid || lookup.pmcid || lookup.doi);
  const hasExactTitleMatch = searchContext.titleMatches.length > 0;
  const hasMaterialMismatch = hasMaterialMismatchSignal(
    lookup.reason,
    lookup.mismatch_reason
  );
  const hasMultipleStudyMismatch = hasMultipleStudySignal(
    lookup.reason,
    lookup.mismatch_reason
  );
  const hasOverrideBlockingReason = hasOverrideBlockingSignal(
    lookup.reason,
    lookup.mismatch_reason
  );

  return (
    (hasExactIdentifier || hasExactTitleMatch) &&
    !hasMaterialMismatch &&
    !hasMultipleStudyMismatch &&
    !hasOverrideBlockingReason
  );
}

function buildCandidateList(lookup) {
  const seen = new Set();
  const candidates = [];
  const nonPdfFallbacks = [];
  const pdfFallbacks = [];

  function pushCandidate(candidate, intoFallback = false) {
    const finalUrl = canonicalizeUrl(candidate.raw_url);
    const candidateWithFinalUrl = {
      ...candidate,
      final_url: finalUrl,
    };

    const key = candidateWithFinalUrl.final_url || candidateWithFinalUrl.raw_url;
    if (seen.has(key)) return;
    seen.add(key);

    if (intoFallback) {
      if (isPdfUrl(candidateWithFinalUrl.final_url || candidateWithFinalUrl.raw_url)) {
        pdfFallbacks.push(candidateWithFinalUrl);
        return;
      }

      nonPdfFallbacks.push(candidateWithFinalUrl);
      return;
    }

    candidates.push(candidateWithFinalUrl);
  }

  if (lookup.pmid) {
    pushCandidate({
      raw_url: buildCanonicalPubmedUrl(lookup.pmid),
      source_type_hint: "pubmed",
      validation_method: "pubmed_id",
    });
  }

  if (lookup.pmcid) {
    pushCandidate({
      raw_url: buildCanonicalPmcUrl(lookup.pmcid),
      source_type_hint: "pmc",
      validation_method: "pmc_id",
    });
  }

  if (lookup.doi) {
    pushCandidate({
      raw_url: buildCanonicalDoiUrl(lookup.doi),
      source_type_hint: "doi",
      validation_method: "doi_identifier",
    });
  }

  if (lookup.journal_url) {
    pushCandidate(
      {
        raw_url: lookup.journal_url,
        source_type_hint:
          lookup.source_type === "official_guidance"
            ? "official_guidance"
            : "journal",
        validation_method: null,
      },
      true
    );
  }

  if (lookup.source_url) {
    pushCandidate(
      {
        raw_url: lookup.source_url,
        source_type_hint: lookup.source_type,
        validation_method: null,
      },
      true
    );
  }

  return [...candidates, ...nonPdfFallbacks, ...pdfFallbacks];
}

function validateLookupResult({ row, lookup, sources, minConfidence }) {
  const reject = ({
    skipReason,
    validationMethod,
    candidateUrlBeforeValidation = lookup?.source_url || lookup?.journal_url || "",
    finalUrlAfterCanonicalisation = canonicalizeUrl(candidateUrlBeforeValidation),
    normalizedType = lookup?.source_type || "none",
  }) => ({
    ok: false,
    skip_reason: skipReason,
    normalized_url: null,
    normalized_type: normalizedType,
    validation_method: validationMethod,
    candidate_url_before_validation: candidateUrlBeforeValidation || null,
    final_url_after_canonicalisation: finalUrlAfterCanonicalisation,
  });

  if (!trimString(row.evidence)) {
    return reject({
      skipReason: "blank_evidence",
      validationMethod: "rejected_mismatch",
    });
  }

  if (lookup.source_type === "none") {
    return reject({
      skipReason: "model_reported_no_exact_source",
      validationMethod: "rejected_mismatch",
    });
  }

  if (lookup.confidence < minConfidence) {
    return reject({
      skipReason: "confidence_below_threshold",
      validationMethod: "rejected_low_confidence",
    });
  }

  const searchContext = buildSearchSourceContext({ lookup, sources });
  const overrideAccepted = canOverrideNonExactMatch({ lookup, searchContext });
  const exactMatchAccepted =
    lookup.evidence_match_status === "exact" || overrideAccepted;

  if (!exactMatchAccepted) {
    return reject({
      skipReason: hasMaterialMismatchSignal(lookup.reason, lookup.mismatch_reason)
        ? "material_evidence_mismatch"
        : "non_exact_evidence_match",
      validationMethod: "rejected_mismatch",
    });
  }

  if (hasMultipleStudySignal(lookup.reason, lookup.mismatch_reason)) {
    return reject({
      skipReason: "evidence_combines_multiple_studies",
      validationMethod: "rejected_mismatch",
    });
  }

  if (hasMaterialMismatchSignal(lookup.reason, lookup.mismatch_reason)) {
    return reject({
      skipReason: "material_evidence_mismatch",
      validationMethod: "rejected_mismatch",
    });
  }

  if (!lookup.citation_title && !lookup.pmid && !lookup.pmcid && !lookup.doi) {
    return reject({
      skipReason: "missing_citation_title",
      validationMethod: "rejected_mismatch",
    });
  }

  const candidates = buildCandidateList(lookup);
  let sawGenericSearchUrl = false;
  let sawUnsupportedSearchMatch = false;
  let sawUntrustedUrl = false;

  for (const candidate of candidates) {
    const finalUrl = candidate.final_url;
    const candidateUrlBeforeValidation = candidate.raw_url;

    if (!finalUrl) {
      sawUntrustedUrl = true;
      continue;
    }

    if (isGenericSearchUrl(finalUrl)) {
      sawGenericSearchUrl = true;
      continue;
    }

    let parsed;
    try {
      parsed = new URL(finalUrl);
    } catch {
      sawUntrustedUrl = true;
      continue;
    }

    const detectedType = detectSourceType(finalUrl, candidate.source_type_hint);
    const trustedHost = isTrustedSourceHost(parsed.hostname);
    const officialHost = isOfficialGuidanceHost(parsed.hostname);
    const sourceTypeAllowed = ALLOWED_SOURCE_TYPES.has(detectedType);
    const articleSpecificJournalUrl =
      detectedType !== "journal" || isArticleSpecificJournalUrl(finalUrl);
    const titleSupported = searchContext.titleMatches.length > 0;
    const urlSupported = searchContext.sourceUrlSet.has(finalUrl);
    const hasSearchSupport = titleSupported || urlSupported;
    const acceptedWithMinorDifference =
      overrideAccepted ||
      (lookup.evidence_match_status === "exact" &&
        hasMinorMetadataDifferenceSignal(lookup.reason, lookup.mismatch_reason));

    if (!sourceTypeAllowed) {
      sawUntrustedUrl = true;
      continue;
    }

    if (!articleSpecificJournalUrl) {
      sawUntrustedUrl = true;
      continue;
    }

    if (candidate.validation_method === "pubmed_id") {
      return {
        ok: true,
        skip_reason: "",
        normalized_url: finalUrl,
        normalized_type: detectedType,
        validation_method: acceptedWithMinorDifference
          ? "accepted_minor_metadata_or_paraphrase_difference"
          : candidate.validation_method,
        candidate_url_before_validation: candidateUrlBeforeValidation,
        final_url_after_canonicalisation: finalUrl,
      };
    }

    if (candidate.validation_method === "pmc_id") {
      return {
        ok: true,
        skip_reason: "",
        normalized_url: finalUrl,
        normalized_type: detectedType,
        validation_method: acceptedWithMinorDifference
          ? "accepted_minor_metadata_or_paraphrase_difference"
          : candidate.validation_method,
        candidate_url_before_validation: candidateUrlBeforeValidation,
        final_url_after_canonicalisation: finalUrl,
      };
    }

    if (candidate.validation_method === "doi_identifier") {
      return {
        ok: true,
        skip_reason: "",
        normalized_url: finalUrl,
        normalized_type: detectedType,
        validation_method: acceptedWithMinorDifference
          ? "accepted_minor_metadata_or_paraphrase_difference"
          : candidate.validation_method,
        candidate_url_before_validation: candidateUrlBeforeValidation,
        final_url_after_canonicalisation: finalUrl,
      };
    }

    if (detectedType === "official_guidance") {
      if (
        officialHost &&
        evidenceExplicitlyNamesOfficialSource(row.evidence)
      ) {
        return {
          ok: true,
          skip_reason: "",
          normalized_url: finalUrl,
          normalized_type: detectedType,
          validation_method: acceptedWithMinorDifference
            ? "accepted_minor_metadata_or_paraphrase_difference"
            : "official_guidance",
          candidate_url_before_validation: candidateUrlBeforeValidation,
          final_url_after_canonicalisation: finalUrl,
        };
      }

      sawUntrustedUrl = true;
      continue;
    }

    if (isPdfUrl(finalUrl) && !trustedHost) {
      sawUntrustedUrl = true;
      continue;
    }

    if (hasSearchSupport) {
      return {
        ok: true,
        skip_reason: "",
        normalized_url: finalUrl,
        normalized_type: detectedType,
        validation_method: acceptedWithMinorDifference
          ? "accepted_minor_metadata_or_paraphrase_difference"
          : "search_result_match",
        candidate_url_before_validation: candidateUrlBeforeValidation,
        final_url_after_canonicalisation: finalUrl,
      };
    }

    if (trustedHost) {
      return {
        ok: true,
        skip_reason: "",
        normalized_url: finalUrl,
        normalized_type: detectedType,
        validation_method: acceptedWithMinorDifference
          ? "accepted_minor_metadata_or_paraphrase_difference"
          : "trusted_host",
        candidate_url_before_validation: candidateUrlBeforeValidation,
        final_url_after_canonicalisation: finalUrl,
      };
    }

    sawUnsupportedSearchMatch = true;
  }

  if (sawGenericSearchUrl) {
    return reject({
      skipReason: "generic_search_url_without_identifier",
      validationMethod: "rejected_generic_search_url",
    });
  }

  if (sawUnsupportedSearchMatch) {
    return reject({
      skipReason: "url_not_supported_by_search_results",
      validationMethod: "rejected_untrusted_url",
    });
  }

  if (sawUntrustedUrl || candidates.length > 0) {
    return reject({
      skipReason: "invalid_or_untrusted_url",
      validationMethod: "rejected_untrusted_url",
    });
  }

  return reject({
    skipReason: "missing_source_url",
    validationMethod: "rejected_untrusted_url",
  });
}

function normalizeTitle(value) {
  return normalizeLookupText(value)
    .replace(/\b(a|an|and|for|in|of|on|the|to|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titlesLikelyMatch(left, right) {
  const normalizedLeft = normalizeTitle(left);
  const normalizedRight = normalizeTitle(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (
    normalizedLeft.length >= 24 &&
    (normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft))
  ) {
    return true;
  }

  const leftTokens = new Set(normalizedLeft.split(" ").filter(Boolean));
  const rightTokens = new Set(normalizedRight.split(" ").filter(Boolean));
  if (leftTokens.size < 4 || rightTokens.size < 4) return false;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.75;
}

function formatConfidence(value) {
  return clampConfidence(value).toFixed(2);
}

function logMatch({
  row,
  lookup,
  normalizedUrl,
  normalizedType,
  validationMethod,
  dryRun,
}) {
  console.log(
    [
      dryRun ? "[dry-run]" : "[write-ready]",
      `${row.supplement_name || "(missing supplement_name)"} / ${
        row.label || "(missing label)"
      }`,
      `citation_title=${lookup.citation_title || "n/a"}`,
      `evidence_source=${normalizedUrl || "n/a"}`,
      `source_type=${normalizedType || "n/a"}`,
      `confidence=${formatConfidence(lookup.confidence)}`,
      `evidence_match_status=${lookup.evidence_match_status || "n/a"}`,
      `validation_method=${validationMethod || "n/a"}`,
      `reason=${lookup.reason || "n/a"}`,
    ].join(" | ")
  );
}

function logSkip({
  row,
  lookup,
  skipReason,
  validationMethod,
  candidateUrlBeforeValidation,
  finalUrlAfterCanonicalisation,
}) {
  console.log(
    [
      "[skip]",
      `${row.supplement_name || "(missing supplement_name)"} / ${
        row.label || "(missing label)"
      }`,
      `citation_title=${lookup.citation_title || "n/a"}`,
      `evidence_source=${finalUrlAfterCanonicalisation || "n/a"}`,
      `source_type=${lookup.source_type || "n/a"}`,
      `confidence=${formatConfidence(lookup.confidence)}`,
      `evidence_match_status=${lookup.evidence_match_status || "n/a"}`,
      `validation_method=${validationMethod || "n/a"}`,
      `candidate_url_before_validation=${candidateUrlBeforeValidation || "n/a"}`,
      `final_url_after_canonicalisation=${finalUrlAfterCanonicalisation || "n/a"}`,
      `mismatch_reason=${lookup.mismatch_reason || "n/a"}`,
      `reason=${lookup.reason || "n/a"}`,
      `skip_reason=${skipReason}`,
    ].join(" | ")
  );
}

function csvEscape(value) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

async function writeSkippedCsv({ rows, outputDir }) {
  await mkdir(outputDir, { recursive: true });

  const filename = `skipped-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  const outputPath = path.join(outputDir, filename);
  const headers = [
    "id",
    "supplement_id",
    "supplement_name",
    "label",
    "evidence",
    "citation_title",
    "authors",
    "year",
    "source_url",
    "source_type",
    "confidence",
    "evidence_match_status",
    "mismatch_reason",
    "validation_method",
    "candidate_url_before_validation",
    "final_url_after_canonicalisation",
    "reason",
    "skip_reason",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.supplement_id,
        row.supplement_name,
        row.label,
        row.evidence,
        row.citation_title,
        row.authors,
        row.year,
        row.source_url,
        row.source_type,
        row.confidence,
        row.evidence_match_status,
        row.mismatch_reason,
        row.validation_method,
        row.candidate_url_before_validation,
        row.final_url_after_canonicalisation,
        row.reason,
        row.skip_reason,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  return outputPath;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

async function resolveRetryCsvPath({ outputDir, skipCsvPath }) {
  if (skipCsvPath) {
    return path.resolve(skipCsvPath);
  }

  const entries = await readdir(outputDir, { withFileTypes: true });
  const latestEntry = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith("skipped-") &&
        entry.name.endsWith(".csv")
    )
    .sort((left, right) => right.name.localeCompare(left.name))[0];

  if (!latestEntry) {
    throw new Error(
      `No skipped CSV found in ${outputDir}. Pass --skip-csv to target a specific export.`
    );
  }

  return path.join(outputDir, latestEntry.name);
}

async function loadRetryRowIds({ outputDir, skipCsvPath, skipReason }) {
  const retryCsvPath = await resolveRetryCsvPath({
    outputDir,
    skipCsvPath,
  });
  const content = await readFile(retryCsvPath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);

  if (lines.length === 0) {
    return {
      retryCsvPath,
      rowIds: new Set(),
    };
  }

  const headers = parseCsvLine(lines[0]);
  const idIndex = headers.indexOf("id");
  const skipReasonIndex = headers.indexOf("skip_reason");

  if (idIndex < 0 || skipReasonIndex < 0) {
    throw new Error(
      `Retry CSV ${retryCsvPath} is missing required id/skip_reason columns.`
    );
  }

  const rowIds = new Set();
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    if (values[skipReasonIndex] !== skipReason) continue;

    const rowId = trimString(values[idIndex]);
    if (rowId) {
      rowIds.add(rowId);
    }
  }

  return {
    retryCsvPath,
    rowIds,
  };
}

async function fetchBenefitRows({ supabase, limit, pageSize }) {
  const rows = [];
  let offset = 0;

  while (true) {
    const remaining = limit ? Math.max(limit - rows.length, 0) : pageSize;
    if (limit && remaining === 0) break;

    const rangeSize = Math.min(pageSize, limit ? Math.max(remaining, 1) : pageSize);
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("id, supplement_id, supplement_name, label, evidence, evidence_source")
      .is("evidence_source", null)
      .not("evidence", "is", null)
      .order("supplement_name", { ascending: true })
      .order("label", { ascending: true })
      .range(offset, offset + rangeSize - 1);

    if (error) {
      throw new Error(`[supabase:${TABLE_NAME}] ${error.message}`);
    }

    const batch = Array.isArray(data)
      ? data.filter((row) => Boolean(trimString(row.evidence)))
      : [];

    rows.push(...batch);
    offset += Array.isArray(data) ? data.length : 0;

    if (!Array.isArray(data) || data.length < rangeSize) {
      break;
    }
  }

  return limit ? rows.slice(0, limit) : rows;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSkippedRow({ row, lookup, skipReason, validation = {} }) {
  return {
    id: row.id,
    supplement_id: row.supplement_id,
    supplement_name: row.supplement_name,
    label: row.label,
    evidence: normalizeText(row.evidence),
    citation_title: lookup?.citation_title || "",
    authors: lookup?.authors || "",
    year: lookup?.year || "",
    source_url: lookup?.source_url || "",
    source_type: lookup?.source_type || "",
    confidence: formatConfidence(lookup?.confidence),
    evidence_match_status: lookup?.evidence_match_status || "",
    mismatch_reason: lookup?.mismatch_reason || "",
    validation_method: validation.validation_method || "",
    candidate_url_before_validation:
      validation.candidate_url_before_validation || lookup?.source_url || "",
    final_url_after_canonicalisation:
      validation.final_url_after_canonicalisation ||
      canonicalizeUrl(validation.candidate_url_before_validation || lookup?.source_url) ||
      "",
    reason: lookup?.reason || "",
    skip_reason: skipReason,
  };
}

function buildMissingColumnError() {
  return new Error(
    "Missing column public.supplement_benefits.evidence_source. Apply supabase/migrations/202605130001_add_evidence_source_to_supplement_benefits.sql before running this script."
  );
}

async function assertEvidenceSourceColumnExists(supabase) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .select("evidence_source")
    .limit(1);

  if (!error) {
    return;
  }

  if (/evidence_source/i.test(error.message) && /does not exist/i.test(error.message)) {
    throw buildMissingColumnError();
  }

  throw new Error(`[supabase:${TABLE_NAME}] ${error.message}`);
}

async function repairKnownBadEvidenceSources(supabase) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      evidence_source: null,
    })
    .eq("supplement_name", HMB_EXERCISE_RECOVERY_REPAIR_FILTER.supplement_name)
    .eq("label", HMB_EXERCISE_RECOVERY_REPAIR_FILTER.label)
    .eq("evidence_source", HMB_EXERCISE_RECOVERY_BAD_SOURCE_URL)
    .select("id");

  if (error) {
    throw new Error(`[supabase:${TABLE_NAME}] ${error.message}`);
  }

  if (Array.isArray(data) && data.length > 0) {
    console.log(
      [
        "[repair]",
        `${HMB_EXERCISE_RECOVERY_REPAIR_FILTER.supplement_name} / ${HMB_EXERCISE_RECOVERY_REPAIR_FILTER.label}`,
        `reset_evidence_source=${HMB_EXERCISE_RECOVERY_BAD_SOURCE_URL}`,
        `rows=${data.length}`,
      ].join(" | ")
    );
  }

  return Array.isArray(data) ? data.length : 0;
}

async function applyEvidenceSources({ supabase, rows }) {
  let updated = 0;
  const skippedWrites = [];

  for (const row of rows) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update({
        evidence_source: row.evidence_source,
      })
      .eq("id", row.id)
      .is("evidence_source", null)
      .select("id");

    if (error) {
      throw new Error(`[supabase:${TABLE_NAME}] ${error.message}`);
    }

    if (Array.isArray(data) && data.length > 0) {
      updated += data.length;
      continue;
    }

    skippedWrites.push({
      ...row,
      skip_reason: "write_guard_blocked_or_row_missing",
      validation_method: row.validation_method || "",
      candidate_url_before_validation:
        row.candidate_url_before_validation || row.source_url || "",
      final_url_after_canonicalisation: row.source_url || "",
    });
  }

  return { updated, skippedWrites };
}

async function processBatch({
  batch,
  apiKey,
  model,
  minConfidence,
  dryRun,
}) {
  const matches = [];
  const skipped = [];

  const results = await Promise.allSettled(
    batch.map(async (row) => {
      const response = await requestEvidenceSource({
        apiKey,
        model,
        row,
      });

      const validation = validateLookupResult({
        row,
        lookup: response.parsed,
        sources: response.sources,
        minConfidence,
      });

      if (!validation.ok) {
        logSkip({
          row,
          lookup: response.parsed,
          skipReason: validation.skip_reason,
          validationMethod: validation.validation_method,
          candidateUrlBeforeValidation:
            validation.candidate_url_before_validation,
          finalUrlAfterCanonicalisation:
            validation.final_url_after_canonicalisation,
        });

        skipped.push(
          buildSkippedRow({
            row,
            lookup: response.parsed,
            skipReason: validation.skip_reason,
            validation,
          })
        );

        return;
      }

      logMatch({
        row,
        lookup: response.parsed,
        normalizedUrl: validation.normalized_url,
        normalizedType: validation.normalized_type,
        validationMethod: validation.validation_method,
        dryRun,
      });

      matches.push({
        id: row.id,
        supplement_id: row.supplement_id,
        supplement_name: row.supplement_name,
        label: row.label,
        evidence: normalizeText(row.evidence),
        evidence_source: validation.normalized_url,
        citation_title: response.parsed.citation_title,
        authors: response.parsed.authors,
        year: response.parsed.year,
        source_url: validation.normalized_url,
        source_type: validation.normalized_type,
        confidence: response.parsed.confidence,
        evidence_match_status: response.parsed.evidence_match_status,
        mismatch_reason: response.parsed.mismatch_reason,
        validation_method: validation.validation_method,
        candidate_url_before_validation:
          validation.candidate_url_before_validation,
        final_url_after_canonicalisation:
          validation.final_url_after_canonicalisation,
        reason: response.parsed.reason,
      });
    })
  );

  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;

    const row = batch[index];
    const errorText =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    const lookup = {
      citation_title: "",
      authors: "",
      year: "",
      source_url: "",
      source_type: "none",
      confidence: 0,
      evidence_match_status: "uncertain",
      mismatch_reason: "",
      reason: errorText,
    };

    logSkip({
      row,
      lookup,
      skipReason: "openai_lookup_failed",
      validationMethod: "rejected_mismatch",
      candidateUrlBeforeValidation: "",
      finalUrlAfterCanonicalisation: "",
    });

    skipped.push(
      buildSkippedRow({
        row,
        lookup,
        skipReason: `openai_lookup_failed:${errorText.slice(0, 200)}`,
        validation: {
          validation_method: "rejected_mismatch",
        },
      })
    );
  });

  return { matches, skipped };
}

async function main() {
  loadDotEnv();

  const flags = parseArgs(process.argv.slice(2));
  const dryRun = !Boolean(flags.write);
  const limit = parseOptionalInteger(flags.limit);
  const batchSize = parseOptionalInteger(flags["batch-size"], DEFAULT_BATCH_SIZE);
  const delayMs = parseOptionalInteger(flags["delay-ms"], DEFAULT_DELAY_MS);
  const pageSize = parseOptionalInteger(flags["page-size"], DEFAULT_PAGE_SIZE);
  const minConfidence = parseOptionalFloat(
    flags["min-confidence"],
    DEFAULT_MIN_CONFIDENCE
  );
  const outputDir = trimString(flags["output-dir"]) || DEFAULT_OUTPUT_DIR;
  const skipReasonFilter = trimString(flags["skip-reason"]);
  const skipCsvPath = trimString(flags["skip-csv"]);

  const supabase = createAdminClient();
  const openAiApiKey = requireEnv("OPENAI_API_KEY");
  const model = trimString(flags.model) || DEFAULT_MODEL;

  await assertEvidenceSourceColumnExists(supabase);
  const repairedRows = await repairKnownBadEvidenceSources(supabase);

  const fetchedRows = await fetchBenefitRows({
    supabase,
    limit: skipReasonFilter ? null : limit,
    pageSize,
  });
  let retryCsvPath = null;
  let rows = fetchedRows;

  if (skipReasonFilter) {
    const retryFilter = await loadRetryRowIds({
      outputDir,
      skipCsvPath,
      skipReason: skipReasonFilter,
    });
    retryCsvPath = retryFilter.retryCsvPath;
    rows = fetchedRows.filter((row) => retryFilter.rowIds.has(String(row.id)));
    if (limit) {
      rows = rows.slice(0, limit);
    }
  }

  if (rows.length === 0) {
    console.log(
      JSON.stringify(
        {
          dryRun,
          totalRows: 0,
          matched: 0,
          updated: 0,
          skipped: 0,
          repairedRows,
          skipReasonFilter: skipReasonFilter || null,
          retryCsvPath,
          skippedCsvPath: null,
        },
        null,
        2
      )
    );
    return;
  }

  const matches = [];
  const skipped = [];

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const batchResult = await processBatch({
      batch,
      apiKey: openAiApiKey,
      model,
      minConfidence,
      dryRun,
    });

    matches.push(...batchResult.matches);
    skipped.push(...batchResult.skipped);

    if (index + batchSize < rows.length) {
      await sleep(delayMs);
    }
  }

  let updated = 0;
  if (!dryRun && matches.length > 0) {
    const writeResult = await applyEvidenceSources({
      supabase,
      rows: matches,
    });
    updated = writeResult.updated;
    skipped.push(...writeResult.skippedWrites);
  }

  const skippedCsvPath = await writeSkippedCsv({
    rows: skipped,
    outputDir,
  });

  console.log(
    JSON.stringify(
      {
        dryRun,
        model,
        totalRows: rows.length,
        matched: matches.length,
        updated,
        skipped: skipped.length,
        repairedRows,
        minConfidence,
        batchSize,
        delayMs,
        skipReasonFilter: skipReasonFilter || null,
        retryCsvPath,
        skippedCsvPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack || error.message : String(error)
  );
  process.exitCode = 1;
});
