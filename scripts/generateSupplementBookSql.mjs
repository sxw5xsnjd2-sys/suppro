import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const DEFAULT_INPUT =
  "/Users/rhaminanou/Library/Mobile Documents/com~apple~TextEdit/Documents/Supplements.rtf";
const DEFAULT_OUTPUT = path.join(
  PROJECT_ROOT,
  "supabase",
  "supplement_book_updates.sql"
);
const DEFAULT_MODEL = process.env.SUPPLEMENT_BOOK_MODEL || "gpt-5.4-mini";
const DOTENV_OVERRIDE_KEYS = new Set(["OPENAI_API_KEY"]);

const SUPPLEMENT_COLUMNS = [
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
];

const SUPPLEMENT_NAME_OVERRIDES = {
  "Apigenin (Chamomile Extract)": "Apigenin / Chamomile Extract",
  "Bacopa Monnieri": "Bacopa monnieri",
  "BCAAs (Branched-Chain Amino Acids)": "Branched-Chain Amino Acids (BCAAs)",
  "Black Currant Seed Oil": "Black Currant Seed Oil (Ribes nigrum)",
  "Black Seed Oil": "Black Seed Oil (Nigella sativa)",
  "Boswellia (Boswellia serrata)": "Boswellia serrata",
  "Butcher's Broom (Ruscus aculeatus)": "Butcher’s Broom (Ruscus aculeatus)",
  "Chlorogenic Acid / Green Coffee Bean Extract":
    "Chlorogenic Acid / Green Coffee Bean",
  "Coconut Oil": "Coconut oil",
  "Coenzyme Q10 (Ubiquinol)": "Coenzyme Q10 (CoQ10) / Ubiquinol",
  "Collagen Peptides (Hydrolysed Collagen)":
    "Collagen Peptides (Hydrolyzed Collagen)",
  "Conjugated Linoleic Acid (CLA)": "Conjugated linoleic acid (CLA)",
  "Curcumin (Turmeric Extract)": "Curcumin / Turmeric extract",
  "DIM (Diindolylmethane)": "Diindolylmethane (DIM)",
  "Evening Primrose Oil": "Evening primrose oil",
  "Folate (Vitamin B9)": "Folate (vitamin B9)",
  "Garcinia Cambogia": "Garcinia extract (hydroxycitric acid)",
  "Garlic Extract (Aged Garlic Extract)": "Garlic extract (aged garlic extract)",
  "Ginkgo Biloba": "Ginkgo biloba",
  "Glucosamine sulphate": "Glucosamine",
  "Gotu Kola": "Gotu kola (Centella asiatica)",
  "Green Tea Extract": "Green tea extract / EGCG",
  "Gymnema Sylvestre Extract": "Gymnema sylvestre extract",
  "Hibiscus Extract": "Hibiscus extract",
  "HMB (Beta-Hydroxy Beta-Methylbutyrate)":
    "Beta-hydroxy beta-methylbutyrate (HMB)",
  "Horse Chestnut Seed Extract": "Horse chestnut seed extract",
  "Hyaluronic Acid (Oral)": "Oral hyaluronic acid",
  "Inositol (Myo-Inositol, D-Chiro-Inositol)":
    "Inositol (Myo-Inositol / D-Chiro-Inositol)",
  "Lion's Mane": "Lion’s mane mushroom",
  "Maca Root": "Maca root",
  "Magnesium (Glycinate & L-Threonate)": "Magnesium",
  "Melatonin (Prescription Medication in UK)": "Melatonin",
  "Methylene Blue": "Methylene blue",
  "Milk Thistle": "Milk thistle",
  "MSM (Methylsulfonylmethane)": "Methylsulfonylmethane (MSM)",
  "Neem Oil / Neem Leaf Extract": "Neem Oil (Azadirachta indica)",
  "Nettle Root": "Nettle root",
  "Nicotinamide Riboside / Niacinamide / Niacin (B3)":
    "Niacinamide / Nicotinamide / Niacin (Vitamin B3)",
  "NMN (Nicotinamide Mononucleotide)": "Nicotinamide mononucleotide (NMN)",
  "Omega-3": "Omega-3 fatty acids",
  "Panax Ginseng": "Panax ginseng",
  "Phosphatidylcholine (Choline)": "Phosphatidylcholine (choline)",
  "Plant Protein": "Plant protein",
  "Polypodium Leucotomos Extract (PLE)": "Polypodium leucotomos extract (PLE)",
  "Psyllium Husk": "Psyllium husk",
  "Pumpkin Seed Oil": "Pumpkin seed oil",
  "Rhodiola Rosea": "Rhodiola rosea",
  "Saffron Extract": "Saffron",
  "SAMe (S-Adenosylmethionine)": "SAMe (S-adenosylmethionine)",
  "Saw Palmetto": "Saw palmetto",
  "Sea Moss": "Sea Moss (Chondrus crispus)",
  "Soy Isoflavones (Genistein and Daidzein)":
    "Soy isoflavones (Genistein and Daidzein)",
  Spirulina: "Spirulina (Arthrospira platensis)",
  "St. John's Wort (Hypericum perforatum)":
    "St. John’s wort (Hypericum perforatum)",
  "Tribulus Terrestris": "Tribulus terrestris",
  "Vitamin C (Ascorbic Acid)": "Vitamin C (Ascorbic acid)",
  "Vitamin D / D3/ Cholecalciferol": "Vitamin D / D3 / Cholecalciferol",
  "Vitamin E / Tocotrienols": "Vitamin E (Tocopherols and Tocotrienols)",
  "Vitex Agnus-Castus (Chasteberry)": "Vitex agnus-castus (Chasteberry)",
};

function loadDotEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env");

  let text = "";
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (DOTENV_OVERRIDE_KEYS.has(key) || !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

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
  return Number.isFinite(parsed) ? parsed : null;
}

async function readBookText(inputPath) {
  if (inputPath.toLowerCase().endsWith(".rtf")) {
    const { stdout } = await execFileAsync("textutil", [
      "-convert",
      "txt",
      "-stdout",
      inputPath,
    ]);
    return stdout;
  }

  return readFile(inputPath, "utf8");
}

function normalizeSourceText(text) {
  return String(text ?? "")
    .replace(/\r/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function splitSupplementEntries(text) {
  const normalized = normalizeSourceText(text);
  const titlePattern = /^([^\n]+)\nOverall score:\s*\d+\s*\/\s*100\b/gim;
  const matches = Array.from(normalized.matchAll(titlePattern)).map((match) => ({
    title: trimString(match[1]),
    index: match.index,
  }));

  return matches
    .map((match, index) => {
      const next = matches[index + 1];
      const entryText = normalized.slice(match.index, next?.index).trim();
      return {
        title: match.title.replace(/^\d+\s+/, ""),
        text: entryText,
      };
    })
    .filter((entry) => entry.title && entry.text);
}

function buildExtractionSchema() {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
  const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

  return {
    name: "supplement_book_entry",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        ...SUPPLEMENT_COLUMNS,
      ],
      properties: {
        name: { type: "string" },
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
                flags: {
                  type: "array",
                  items: { type: "string" },
                },
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
        dose_scoring_profile_json: { type: "null" },
      },
    },
  };
}

function buildSystemPrompt() {
  return [
    "You extract curated supplement book entries into database-ready JSON.",
    "Return only data for public.supplements. Do not create, update, delete, or describe public.supplement_benefits rows.",
    "Use the exact pasted supplement title as name, including parenthetical abbreviations.",
    "Map Overall score to evidence_score.",
    "Map WHAT IS IT, WHY USE IT, HOW DOES IT WORK, SIDE EFFECTS & CONSIDERATIONS, WHO MIGHT BENEFIT, HOW TO USE IT, and EVIDENCE SUMMARY to the matching fields.",
    "For SIDE EFFECTS & CONSIDERATIONS, separate general side effects from risks and interactions when the text allows it.",
    "Set evidence to one concise combined narrative covering all evidence sections, including authors, year, journal, findings, rank, and limitations where available.",
    "Set what_is_it to one concise plain-English description based on WHAT IS IT and the entry context.",
    "Use ASCII hyphens instead of en dashes or em dashes. Remove page numbers, emojis, bullets used only as rating symbols, and decorative symbols.",
    "Use plain readable text, not markdown and not JSON strings embedded inside text fields.",
    "Set recommended_dose_status to parsed when the dose range or main dose is clear; otherwise ambiguous, unscorable, or missing.",
    "For recommended_dose_json, use a per-intake biochemical dose when possible. Use null for unknown frequency fields. Keep dose_scoring_profile_json null.",
  ].join(" ");
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

    await new Promise((resolve) =>
      setTimeout(resolve, 750 * 2 ** attempt)
    );
  }

  throw lastError ?? new Error("OpenAI request failed");
}

function buildOpenAiHeaders(apiKey) {
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

function extractCompletionContent(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item?.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

async function extractSupplement({ apiKey, entry, model }) {
  const response = await openAiFetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: buildOpenAiHeaders(apiKey),
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: buildExtractionSchema(),
        },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(),
          },
          {
            role: "user",
            content: entry.text,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `[${entry.title}] OpenAI ${response.status}: ${await response.text()}`
    );
  }

  const body = await response.json();
  const rawContent = extractCompletionContent(
    body?.choices?.[0]?.message?.content
  );
  if (!rawContent) {
    throw new Error(`[${entry.title}] OpenAI returned empty content`);
  }

  return JSON.parse(rawContent);
}

function normalizeSqlText(value) {
  return trimString(value)
    .replace(/\u0000/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[★◆⬡⚠]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sqlString(value) {
  if (value === null || typeof value === "undefined") {
    return "null";
  }

  return `'${normalizeSqlText(String(value)).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(value) ? String(value) : "null";
}

function renderRecommendedDoseJson(value) {
  if (!value || typeof value !== "object") {
    return "null";
  }

  return [
    "jsonb_build_object(",
    `    'unit', ${sqlString(value.unit)},`,
    `    'flags', jsonb_build_array(${(value.flags ?? [])
      .map((item) => sqlString(item))
      .join(", ")}),`,
    `    'confidence', ${sqlNumber(value.confidence)},`,
    `    'source_text', ${sqlString(value.source_text)},`,
    `    'parser_method', ${sqlString(value.parser_method || "curated_override")},`,
    `    'per_intake_max_value', ${sqlNumber(value.per_intake_max_value)},`,
    `    'per_intake_min_value', ${sqlNumber(value.per_intake_min_value)},`,
    `    'frequency_max_per_day', ${sqlNumber(value.frequency_max_per_day)},`,
    `    'frequency_min_per_day', ${sqlNumber(value.frequency_min_per_day)}`,
    "  )",
  ].join("\n");
}

function renderAssignment(column, value) {
  if (column === "evidence_score") {
    return `  ${column} = ${sqlNumber(value)}`;
  }

  if (column === "recommended_dose_json") {
    return `  ${column} = ${renderRecommendedDoseJson(value)}`;
  }

  if (column === "dose_scoring_profile_json") {
    return `  ${column} = null`;
  }

  return `  ${column} = ${sqlString(value)}`;
}

function renderUpdateSql(supplement) {
  const assignments = SUPPLEMENT_COLUMNS.map((column) =>
    renderAssignment(column, supplement[column])
  );
  const targetName = SUPPLEMENT_NAME_OVERRIDES[supplement.name] ?? supplement.name;

  return [
    "update public.supplements",
    "set",
    assignments.join(",\n"),
    `where name = ${sqlString(targetName)}`,
    "  and status = 'approved';",
  ].join("\n");
}

function renderSqlFile(supplements) {
  return [
    "begin;",
    "",
    supplements.map((supplement) => renderUpdateSql(supplement)).join("\n\n"),
    "",
    "commit;",
    "",
  ].join("\n");
}

async function main() {
  loadDotEnv();

  const flags = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(String(flags.input || DEFAULT_INPUT));
  const outputPath = path.resolve(String(flags.output || DEFAULT_OUTPUT));
  const model = String(flags.model || DEFAULT_MODEL);
  const limit = parseOptionalInteger(flags.limit);
  const dryRun = Boolean(flags["dry-run"]);

  const bookText = await readBookText(inputPath);
  const entries = splitSupplementEntries(bookText);
  const selectedEntries = limit ? entries.slice(0, limit) : entries;

  if (dryRun) {
    console.log(`Detected ${entries.length} supplement entries.`);
    selectedEntries.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.title}`);
    });
    return;
  }

  const apiKey = trimString(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment or suppro/.env");
  }

  const supplements = [];
  for (let index = 0; index < selectedEntries.length; index += 1) {
    const entry = selectedEntries[index];
    console.log(
      `[${index + 1}/${selectedEntries.length}] Extracting ${entry.title}`
    );
    supplements.push(await extractSupplement({ apiKey, entry, model }));
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderSqlFile(supplements), "utf8");
  console.log(`Wrote ${supplements.length} updates to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
