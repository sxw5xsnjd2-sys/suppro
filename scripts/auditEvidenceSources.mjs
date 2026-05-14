import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = path.join(
  PROJECT_ROOT,
  "supabase",
  ".temp",
  "evidence-source-audit"
);

const ALLOWED_SOURCE_DOMAINS = [
  "academic.oup.com",
  "bmc.com",
  "bmj.com",
  "cambridge.org",
  "clinicaltrials.gov",
  "cochranelibrary.com",
  "doi.org",
  "dx.doi.org",
  "ema.europa.eu",
  "efsa.europa.eu",
  "fda.gov",
  "frontiersin.org",
  "jamanetwork.com",
  "journals.plos.org",
  "karger.com",
  "link.springer.com",
  "mdpi.com",
  "nature.com",
  "nccih.nih.gov",
  "ncbi.nlm.nih.gov",
  "nejm.org",
  "nhs.uk",
  "nih.gov",
  "ods.od.nih.gov",
  "onlinelibrary.wiley.com",
  "pmc.ncbi.nlm.nih.gov",
  "pubmed.ncbi.nlm.nih.gov",
  "sagepub.com",
  "sciencedirect.com",
  "springer.com",
  "tandfonline.com",
  "thelancet.com",
  "who.int",
  "wiley.com",
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
    if (!process.env[key]) {
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

function sourceDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isAllowedUrl(url) {
  const host = sourceDomain(normalizeEvidenceSourceUrl(url) || url);
  return ALLOWED_SOURCE_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

function createAdminClient() {
  const url = trimString(process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL);
  const key = trimString(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.INTERNAL_SERVICE_ROLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  )
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();

  if (!url || !key) {
    throw new Error("Missing Supabase URL or service key in environment.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchAllRows(supabase, table, select, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`[supabase:${table}] ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) {
      break;
    }
  }
  return rows;
}

function summarizeManualReviewIssue(review) {
  const issues = Array.isArray(review?.validation_issues_json)
    ? review.validation_issues_json.map((issue) => trimString(issue)).filter(Boolean)
    : [];
  const reason = trimString(review?.reason);
  const combined = [reason, ...issues].filter(Boolean).join(" | ");
  return /citation|source url|source urls|evidence_source|persistable/i.test(combined);
}

function classifyBenefitRows(rows) {
  const missing = [];
  const invalid = [];

  for (const row of rows) {
    const evidence = trimString(row?.evidence);
    if (!evidence) continue;

    const source = trimString(row?.evidence_source);
    if (!source) {
      missing.push({
        id: row.id,
        supplement_id: row.supplement_id,
        supplement_name: trimString(row.supplement_name),
        label: trimString(row.label),
        evidence,
        evidence_source: null,
      });
      continue;
    }

    const normalized = normalizeEvidenceSourceUrl(source);
    if (!normalized) {
      invalid.push({
        id: row.id,
        supplement_id: row.supplement_id,
        supplement_name: trimString(row.supplement_name),
        label: trimString(row.label),
        evidence_source: source,
        issue: "invalid_url",
      });
      continue;
    }

    if (!isAllowedUrl(normalized)) {
      invalid.push({
        id: row.id,
        supplement_id: row.supplement_id,
        supplement_name: trimString(row.supplement_name),
        label: trimString(row.label),
        evidence_source: normalized,
        issue: "non_allowlisted_domain",
      });
    }
  }

  return { missing, invalid };
}

async function writeReports(outputDir, report) {
  await mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `evidence-source-audit-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `evidence-source-audit-${timestamp}.md`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const markdown = [
    "# Evidence Source Audit",
    "",
    `- Generated at: ${report.generated_at}`,
    `- Benefit rows with evidence: ${report.summary.total_benefit_rows_with_evidence}`,
    `- Missing evidence_source: ${report.summary.missing_evidence_source}`,
    `- Invalid/non-allowlisted evidence_source: ${report.summary.invalid_evidence_source}`,
    `- Pending manual reviews with citation issues: ${report.summary.pending_manual_reviews_with_citation_issues}`,
    "",
    "## Missing evidence_source",
    "",
    ...(report.missing_evidence_source.length
      ? report.missing_evidence_source.map(
          (row) => `- ${row.supplement_name} / ${row.label} (${row.id})`
        )
      : ["- none"]),
    "",
    "## Invalid or non-allowlisted evidence_source",
    "",
    ...(report.invalid_evidence_source.length
      ? report.invalid_evidence_source.map(
          (row) =>
            `- ${row.supplement_name} / ${row.label} (${row.id}) - ${row.issue}: ${row.evidence_source}`
        )
      : ["- none"]),
    "",
    "## Pending citation-related manual reviews",
    "",
    ...(report.pending_manual_reviews.length
      ? report.pending_manual_reviews.map(
          (row) =>
            `- ${row.display_name || row.normalized_name} - ${row.reason || "citation issue"}`
        )
      : ["- none"]),
    "",
  ].join("\n");

  await writeFile(markdownPath, markdown, "utf8");
  return { jsonPath, markdownPath };
}

async function main() {
  loadDotEnv();
  const flags = parseArgs(process.argv.slice(2));
  const writeReportsEnabled = Boolean(flags["write-report"] || flags.output);
  const outputDir = writeReportsEnabled
    ? path.resolve(String(flags.output || DEFAULT_OUTPUT_DIR))
    : null;

  const supabase = createAdminClient();
  const [benefitRows, manualReviews] = await Promise.all([
    fetchAllRows(
      supabase,
      "supplement_benefits",
      "id, supplement_id, supplement_name, label, evidence, evidence_source"
    ),
    fetchAllRows(
      supabase,
      "supplement_research_manual_reviews",
      "normalized_name, display_name, review_status, reason, validation_issues_json, updated_at"
    ),
  ]);

  const classifiedBenefits = classifyBenefitRows(benefitRows);
  const pendingManualReviews = manualReviews
    .filter((row) => trimString(row?.review_status) === "pending")
    .filter((row) => summarizeManualReviewIssue(row))
    .map((row) => ({
      normalized_name: trimString(row.normalized_name),
      display_name: trimString(row.display_name),
      reason: trimString(row.reason),
      validation_issues_json: Array.isArray(row.validation_issues_json)
        ? row.validation_issues_json
        : [],
      updated_at: trimString(row.updated_at) || null,
    }));

  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      total_benefit_rows_with_evidence: benefitRows.filter((row) => trimString(row?.evidence)).length,
      missing_evidence_source: classifiedBenefits.missing.length,
      invalid_evidence_source: classifiedBenefits.invalid.length,
      pending_manual_reviews_with_citation_issues: pendingManualReviews.length,
    },
    missing_evidence_source: classifiedBenefits.missing,
    invalid_evidence_source: classifiedBenefits.invalid,
    pending_manual_reviews: pendingManualReviews,
  };

  let reportPaths = null;
  if (writeReportsEnabled && outputDir) {
    reportPaths = await writeReports(outputDir, report);
  }

  console.log(
    JSON.stringify(
      {
        ...report.summary,
        ...(reportPaths ? reportPaths : {}),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
