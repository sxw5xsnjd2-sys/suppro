import "dotenv/config";
import fs from "node:fs/promises";
import { ApifyClient } from "apify-client";

const client = new ApifyClient({
  token: process.env.APIFY_TOKEN,
});

const CHECKPOINT_PATH = "./docs/influencer_scrape_checkpoint.json";

const CONFIG = {
  minFollowers: 1_000,
  maxFollowers: 100_000,
  minMedianReelViews: 1_000,
  maxMedianReelViews: 10_000,

  maxFinalResults: 100,
  maxSearchTermsToRun: 40,
  maxPrefilteredCandidatesBeforeReels: 75,
  maxCandidatesToAnalyse: 50,

  searchLimitPerTerm: 25,
  reelsPerProfile: 12,
  concurrency: 3,

  pricePerThousandViewsGBP: 10,
  videosPerContract: 9,

  outputPath: "./docs/supplement_influencers.csv",
  debugOutputPath: "./docs/supplement_influencers_debug.csv",
  seedInfluencersPath: "./docs/seed_influencers.csv",
};

const SEARCH_TERMS = [
  "personal trainer",
  "online coach",
  "fitness coach",
  "fat loss coach",
  "weight loss coach",
  "bodybuilding coach",
  "natural bodybuilding",
  "muscle gain coach",
  "strength coach",
  "nutrition coach",
  "dietitian",
  "registered dietitian",
  "high protein meals",
  "protein recipes",
  "meal prep fitness",
  "calorie deficit meals",
  "hyrox coach",
  "hyrox athlete",
  "crossfit athlete",
  "running coach",
  "marathon coach",
  "biohacking",
  "longevity health",
  "mens health fitness",
  "womens fitness coach",
  "mma training",
  "bjj athlete",
  "personal trainer UK",
  "online coach UK",
  "fitness coach UK",
  "fat loss coach UK",
  "nutrition coach UK",
  "dietitian UK",
  "hyrox coach UK",
  "bodybuilding coach UK",
  "protein recipes UK",
  "high protein meals UK",
  "London personal trainer",
  "London fitness coach",
  "London online coach",
  "London nutrition coach",
  "London dietitian",
  "London hyrox coach",
  "Manchester personal trainer",
  "Manchester fitness coach",
  "Manchester bodybuilding coach",
  "Birmingham personal trainer",
  "Birmingham fitness coach",
  "Birmingham nutrition coach",
  "personal trainer Ireland",
  "fitness coach Ireland",
  "online coach Ireland",
  "nutrition coach Ireland",
  "dietitian Ireland",
  "Dublin personal trainer",
  "Dublin fitness coach",
  "Dublin nutrition coach",
  "personal trainer USA",
  "online coach USA",
  "fitness coach USA",
  "fat loss coach USA",
  "nutrition coach USA",
  "dietitian USA",
  "bodybuilding coach USA",
  "hyrox coach USA",
  "New York personal trainer",
  "NYC fitness coach",
  "Los Angeles personal trainer",
  "LA fitness coach",
  "California fitness coach",
  "Texas fitness coach",
  "personal trainer Canada",
  "online coach Canada",
  "fitness coach Canada",
  "nutrition coach Canada",
  "dietitian Canada",
  "Toronto personal trainer",
  "Toronto fitness coach",
  "Toronto nutrition coach",
  "Vancouver personal trainer",
  "Vancouver fitness coach",
];

const HIGH_INTENT_SUPPLEMENT_SIGNALS = [
  "supplement",
  "supplements",
  "protein powder",
  "pre workout",
  "pre-workout",
  "creatine",
  "whey",
  "vitamins",
  "multivitamin",
  "sports nutrition",
  "supplement stack",
  "nootropics",
  "magnesium",
  "ashwagandha",
  "omega 3",
  "collagen",
  "greens powder",
  "electrolytes",
];

const FITNESS_AUDIENCE_SIGNALS = [
  "fitness",
  "gym",
  "workout",
  "training",
  "personal trainer",
  "pt",
  "online coach",
  "strength coach",
  "bodybuilding",
  "bodybuilder",
  "muscle gain",
  "hypertrophy",
  "fat loss",
  "weight loss",
  "calorie deficit",
  "lean bulk",
  "cutting",
  "bulking",
  "powerlifting",
  "weightlifting",
  "crossfit",
  "hyrox",
  "running",
  "marathon",
  "triathlon",
  "endurance",
  "mma",
  "bjj",
  "combat sports",
];

const NUTRITION_AUDIENCE_SIGNALS = [
  "nutrition",
  "nutritionist",
  "dietitian",
  "dietician",
  "meal prep",
  "high protein",
  "protein recipe",
  "protein recipes",
  "macros",
  "calories",
  "healthy recipes",
  "health coach",
  "wellness",
  "biohacking",
  "longevity",
  "health optimisation",
  "health optimization",
];

const LOW_VALUE_BRAND_OR_SHOP_SIGNALS = [
  "shop",
  "store",
  "shop online",
  "retailer",
  "wholesale",
  "distributor",
  "delivery",
  "shipping",
  "order via dm",
  "whatsapp",
  "franchise",
  "clearance deals",
  "official",
  "ltd",
  "limited",
  "supplements ltd",
];

const CREATOR_SIGNALS = [
  "coach",
  "creator",
  "athlete",
  "personal trainer",
  "online coach",
  "pt",
  "dietitian",
  "nutritionist",
  "i help",
  "helping",
  "fat loss",
  "muscle gain",
  "training plan",
  "1-1 coaching",
  "transformation",
];

const EXCLUDE_KEYWORDS = [
  "supplemental income",
  "teaching supplement",
  "exam supplement",
  "insurance supplement",
  "journal supplement",
  "newspaper supplement",
];

const COUNTRY_SIGNALS = {
  UK: [
    "uk",
    "united kingdom",
    "🇬🇧",
    "britain",
    "british",
    "england",
    "scotland",
    "wales",
    "london",
    "manchester",
    "birmingham",
    "leeds",
    "glasgow",
    "liverpool",
    "bristol",
    "cardiff",
    "edinburgh",
    ".co.uk",
    ".uk",
    "£",
  ],
  US: [
    "usa",
    "united states",
    "🇺🇸",
    "american",
    "nyc",
    "new york",
    "los angeles",
    "la based",
    "california",
    "florida",
    "texas",
    "chicago",
    "miami",
    "dallas",
    "atlanta",
  ],
  Canada: [
    "canada",
    "canadian",
    "🇨🇦",
    ".ca",
    "toronto",
    "vancouver",
    "montreal",
    "calgary",
    "ottawa",
    "ontario",
    "saskatchewan",
    "sask",
    "british columbia",
  ],
  Ireland: [
    "ireland",
    "irish",
    "🇮🇪",
    ".ie",
    "dublin",
    "cork",
    "galway",
    "limerick",
  ],
};

const NON_TARGET_COUNTRY_SIGNALS = {
  India: [
    "india",
    "indian",
    "mumbai",
    "delhi",
    "new delhi",
    "bangalore",
    "bengaluru",
    "hyderabad",
    "chennai",
    "pune",
    "kolkata",
    "ahmedabad",
    ".in",
    "₹",
  ],
  Pakistan: ["pakistan", "pakistani", "karachi", "lahore", "islamabad", ".pk"],
  Bangladesh: ["bangladesh", "bangladeshi", "dhaka", ".bd"],
  UAE: ["uae", "dubai", "abu dhabi", "sharjah", ".ae"],
  SaudiArabia: ["saudi", "saudi arabia", "riyadh", "jeddah", ".sa"],
  Nigeria: ["nigeria", "nigerian", "lagos", "abuja", ".ng"],
  SouthAfrica: ["south africa", "cape town", "johannesburg", ".za"],
  Australia: [
    "australia",
    "australian",
    "sydney",
    "melbourne",
    "brisbane",
    ".au",
  ],
  NewZealand: ["new zealand", "auckland", ".nz"],
  Philippines: ["philippines", "filipino", "manila", ".ph"],
  Indonesia: ["indonesia", "jakarta", "bali", ".id"],
  Malaysia: ["malaysia", "kuala lumpur", ".my"],
  Singapore: ["singapore", ".sg"],
  Qatar: ["qatar", "qatari", "doha", "+974", "🇶🇦", ".qa"],
  Kuwait: ["kuwait", "kuwaiti", "+965", "🇰🇼", ".kw"],
  Lebanon: [
    "lebanon",
    "lebanese",
    "beirut",
    "jdeideh",
    "msharafieh",
    "+961",
    "🇱🇧",
    ".lb",
  ],
  Iran: ["iran", "iranian", "tehran", "persian", "+98", "🇮🇷", ".ir"],
  Tanzania: [
    "tanzania",
    "tanzanian",
    "dar es salaam",
    "zanzibar",
    "swahili",
    "+255",
    "🇹🇿",
    ".tz",
  ],
  Belgium: ["belgium", "belgian", "brussels", "antwerp", "🇧🇪", ".be"],
  France: [
    "france",
    "french",
    "français",
    "francais",
    "paris",
    "lyon",
    "marseille",
    "compléments",
    "complements alimentaires",
    "laboratoire français",
    "🇫🇷",
    "🇨🇵",
    ".fr",
  ],
  Germany: [
    "germany",
    "german",
    "berlin",
    "munich",
    "hamburg",
    "frankfurt",
    "🇩🇪",
    ".de",
  ],
  Spain: ["spain", "spanish", "madrid", "barcelona", "valencia", "🇪🇸", ".es"],
  Italy: ["italy", "italian", "rome", "milan", "naples", "🇮🇹", ".it"],
  Netherlands: ["netherlands", "dutch", "amsterdam", "rotterdam", "🇳🇱", ".nl"],
  Portugal: ["portugal", "portuguese", "lisbon", "porto", "🇵🇹", ".pt"],
  Brazil: [
    "brazil",
    "brazilian",
    "sao paulo",
    "rio de janeiro",
    "🇧🇷",
    ".br",
  ],
};

const PROFILE_SEARCH_ACTOR = "apify/instagram-search-scraper";
const REELS_ACTOR = "apify/instagram-reel-scraper";
const recoverCompletedSearchRuns = [
  {
    term: "sports nutrition",
    runId: "4ueO2SLwNcRmO56Wx",
  },
  {
    term: "sports nutrition UK",
    runId: "5kAmgKoNVaP21WgjS",
  },
  {
    term: "sports nutrition United Kingdom",
    runId: "yUmkWwqdZOHaAhbkI",
  },
];

const COUNTRY_SEARCH_TERM_MAP = {
  UK: [
    "personal trainer UK",
    "online fitness coach UK",
    "fat loss coach UK",
    "nutrition coach UK",
    "registered dietitian UK",
    "high protein meals UK",
    "protein recipes UK",
    "HYROX coach UK",
    "bodybuilding coach UK",
  ],
  Canada: [
    "personal trainer Canada",
    "fitness coach Canada",
    "nutrition coach Canada",
    "dietitian Canada",
    "Toronto fitness coach",
    "Vancouver fitness coach",
  ],
  Ireland: [
    "personal trainer Ireland",
    "fitness coach Ireland",
    "dietitian Ireland",
    "nutrition coach Ireland",
    "Dublin fitness coach",
  ],
  US: [
    "fitness coach USA",
    "nutrition coach USA",
    "personal trainer USA",
    "bodybuilding coach USA",
    "NYC fitness coach",
    "LA fitness coach",
  ],
};

const AUDIENCE_SEGMENT_SEARCH_TERM_MAP = {
  "Fitness / gym": ["personal trainer", "fitness coach", "online fitness coach"],
  "Bodybuilding / strength": [
    "bodybuilding coach",
    "natural bodybuilding",
    "muscle gain coach",
    "strength coach",
  ],
  "Nutrition / recipes": [
    "nutrition coach",
    "registered dietitian",
    "high protein meals",
    "protein recipes",
  ],
  "Endurance / HYROX / CrossFit": [
    "HYROX coach",
    "hyrox athlete",
    "crossfit athlete",
    "running coach",
  ],
  "Wellness / biohacking": ["biohacking", "longevity health"],
  "Combat sports": ["mma training", "bjj athlete"],
  "Supplement reviews": ["supplement reviews", "creatine", "protein recipes"],
  "General fitness / health": ["fitness coach", "mens health fitness"],
};

function normaliseUsername(value) {
  if (!value) return null;

  return String(value)
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const rows = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return rows;

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });

    rows.push(row);
  }

  return rows;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value).toLowerCase().replace(/,/g, "").trim();

  const match = cleaned.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!match) {
    const parsed = Number(cleaned.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const base = Number(match[1]);
  const suffix = match[2];

  if (!Number.isFinite(base)) return null;

  if (suffix === "k") return Math.round(base * 1_000);
  if (suffix === "m") return Math.round(base * 1_000_000);
  if (suffix === "b") return Math.round(base * 1_000_000_000);

  return Math.round(base);
}

function getFirstNumberFromKeys(obj, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], obj);
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

function getUsername(item) {
  return normaliseUsername(
    item.username ||
      item.ownerUsername ||
      item.owner?.username ||
      item.user?.username ||
      item.profileUrl ||
      item.url ||
      item.inputUrl,
  );
}

function getFollowerCount(item) {
  return getFirstNumberFromKeys(item, [
    "followersCount",
    "followers",
    "followers_count",
    "followerCount",
    "profile.followersCount",
    "profile.followers",
    "statistics.followers",
    "stats.followers",
    "user.followers",
  ]);
}

function getReelViewCount(item) {
  return getFirstNumberFromKeys(item, [
    "videoViewCount",
    "videoPlayCount",
    "viewsCount",
    "viewCount",
    "playCount",
    "playsCount",
    "video_view_count",
    "video_play_count",
    "views",
    "plays",
  ]);
}

function textFromProfileAndReels(profile, reels = []) {
  const profileText = [
    profile.username,
    profile.fullName,
    profile.full_name,
    profile.bio,
    profile.biography,
    profile.businessCategoryName,
    profile.categoryName,
    profile.externalUrl,
  ];

  const reelText = reels.flatMap((reel) => [
    reel.caption,
    reel.text,
    reel.title,
    Array.isArray(reel.hashtags) ? reel.hashtags.join(" ") : reel.hashtags,
  ]);

  return [...profileText, ...reelText].filter(Boolean).join(" ").toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function signalMatchesText(text, signal) {
  const normalisedSignal = String(signal).toLowerCase().trim();

  if (!normalisedSignal) return false;

  if (/[\u{1F1E6}-\u{1F1FF}£€₹₦]/u.test(normalisedSignal)) {
    return text.includes(normalisedSignal);
  }

  if (normalisedSignal.startsWith(".")) {
    return text.includes(normalisedSignal);
  }

  if (normalisedSignal.length <= 2) {
    const escaped = escapeRegExp(normalisedSignal);
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return regex.test(text);
  }

  const escaped = escapeRegExp(normalisedSignal);
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return regex.test(text);
}

function scoreCountrySignals(text, signalMap) {
  const scores = [];

  for (const [country, signals] of Object.entries(signalMap)) {
    const score = signals.reduce((total, signal) => {
      return signalMatchesText(text, signal) ? total + 1 : total;
    }, 0);

    if (score > 0) {
      scores.push({ country, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  return scores;
}

function audienceFitScore(profile, reels = []) {
  const text = textFromProfileAndReels(profile, reels);

  if (EXCLUDE_KEYWORDS.some((term) => text.includes(term))) {
    return -10;
  }

  let score = 0;

  for (const term of HIGH_INTENT_SUPPLEMENT_SIGNALS) {
    if (signalMatchesText(text, term)) score += 3;
  }

  for (const term of FITNESS_AUDIENCE_SIGNALS) {
    if (signalMatchesText(text, term)) score += 2;
  }

  for (const term of NUTRITION_AUDIENCE_SIGNALS) {
    if (signalMatchesText(text, term)) score += 2;
  }

  for (const term of LOW_VALUE_BRAND_OR_SHOP_SIGNALS) {
    if (signalMatchesText(text, term)) score -= 2;
  }

  if (CREATOR_SIGNALS.some((term) => signalMatchesText(text, term))) {
    score += 2;
  }

  return score;
}

function inferAudienceSegment(profile, reels = []) {
  const text = textFromProfileAndReels(profile, reels);

  const segments = [
    {
      name: "Supplement reviews",
      signals: HIGH_INTENT_SUPPLEMENT_SIGNALS,
    },
    {
      name: "Fitness / gym",
      signals: [
        "fitness",
        "gym",
        "workout",
        "personal trainer",
        "pt",
        "online coach",
      ],
    },
    {
      name: "Bodybuilding / strength",
      signals: [
        "bodybuilding",
        "bodybuilder",
        "muscle gain",
        "hypertrophy",
        "powerlifting",
        "weightlifting",
        "strength coach",
      ],
    },
    {
      name: "Nutrition / recipes",
      signals: [
        "nutrition",
        "dietitian",
        "nutritionist",
        "meal prep",
        "high protein",
        "protein recipe",
        "macros",
      ],
    },
    {
      name: "Endurance / HYROX / CrossFit",
      signals: [
        "hyrox",
        "crossfit",
        "running",
        "marathon",
        "triathlon",
        "endurance",
      ],
    },
    {
      name: "Wellness / biohacking",
      signals: [
        "wellness",
        "biohacking",
        "longevity",
        "health optimisation",
        "health optimization",
      ],
    },
    {
      name: "Combat sports",
      signals: ["mma", "bjj", "boxing", "combat sports"],
    },
  ];

  let best = { name: "General fitness / health", score: 0 };

  for (const segment of segments) {
    const score = segment.signals.reduce((total, signal) => {
      return signalMatchesText(text, signal) ? total + 1 : total;
    }, 0);

    if (score > best.score) {
      best = { name: segment.name, score };
    }
  }

  return best.name;
}

function inferLeadType(profile, reels = []) {
  const text = textFromProfileAndReels(profile, reels);

  const reviewSignals = [
    "review",
    "reviews",
    "media",
    "news",
    "supplement review",
    "supplement reviews",
  ];
  const coachSignals = [
    "coach",
    "personal trainer",
    "pt",
    "dietitian",
    "nutritionist",
    "online coach",
  ];
  const creatorSignals = [
    "creator",
    "athlete",
    "content creator",
    "fitness creator",
    "gym creator",
  ];

  if (
    LOW_VALUE_BRAND_OR_SHOP_SIGNALS.some((signal) =>
      signalMatchesText(text, signal),
    )
  ) {
    return "Retailer/brand";
  }

  if (coachSignals.some((signal) => signalMatchesText(text, signal))) {
    return "Coach";
  }

  if (creatorSignals.some((signal) => signalMatchesText(text, signal))) {
    return "Creator";
  }

  if (reviewSignals.some((signal) => signalMatchesText(text, signal))) {
    return "Review/media page";
  }

  return "Unclear";
}

function leadTypePriority(leadType) {
  const priorities = {
    Coach: 0,
    Creator: 1,
    "Review/media page": 2,
    "Retailer/brand": 3,
    Unclear: 4,
  };

  return priorities[leadType] ?? 5;
}

function hasStrongNonTargetSignal(text) {
  const strongSignals = [
    "+974",
    "+965",
    "+961",
    "+98",
    "+255",
    ".fr",
    ".qa",
    ".kw",
    ".lb",
    ".ir",
    ".tz",
    "🇶🇦",
    "🇰🇼",
    "🇱🇧",
    "🇮🇷",
    "🇹🇿",
    "🇫🇷",
    "🇨🇵",
  ];

  return strongSignals.some((signal) => signalMatchesText(text, signal));
}

function inferCountry(profile, reels = []) {
  const text = textFromProfileAndReels(profile, reels);
  const targetScores = scoreCountrySignals(text, COUNTRY_SIGNALS);
  const nonTargetScores = scoreCountrySignals(text, NON_TARGET_COUNTRY_SIGNALS);
  const bestTarget = targetScores[0];
  const bestNonTarget = nonTargetScores[0];

  if (!bestTarget) {
    return {
      country: "Unknown",
      countryConfidence: 0,
      excludedCountry: bestNonTarget?.country || "",
      excludedCountryConfidence: bestNonTarget?.score || 0,
      marketEligible: false,
    };
  }

  if (bestNonTarget && hasStrongNonTargetSignal(text)) {
    return {
      country: bestTarget.country,
      countryConfidence: bestTarget.score,
      excludedCountry: bestNonTarget.country,
      excludedCountryConfidence: bestNonTarget.score,
      marketEligible: false,
    };
  }

  if (bestNonTarget && bestNonTarget.score >= bestTarget.score) {
    return {
      country: bestTarget.country,
      countryConfidence: bestTarget.score,
      excludedCountry: bestNonTarget.country,
      excludedCountryConfidence: bestNonTarget.score,
      marketEligible: false,
    };
  }

  return {
    country: bestTarget.country,
    countryConfidence: bestTarget.score,
    excludedCountry: bestNonTarget?.country || "",
    excludedCountryConfidence: bestNonTarget?.score || 0,
    marketEligible: true,
  };
}

function median(numbers) {
  const clean = numbers
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (clean.length === 0) return null;

  const middle = Math.floor(clean.length / 2);

  if (clean.length % 2 === 1) {
    return clean[middle];
  }

  return Math.round((clean[middle - 1] + clean[middle]) / 2);
}

function estimateContractPriceGBP(medianViews) {
  const raw =
    (medianViews / 1000) *
    CONFIG.pricePerThousandViewsGBP *
    CONFIG.videosPerContract;

  return Math.round(raw / 10) * 10;
}

function createEmptyCheckpoint() {
  return {
    completedSearchTerms: [],
    searchItemsByTerm: {},
    lastUpdatedAt: new Date().toISOString(),
  };
}

async function loadCheckpoint() {
  try {
    const raw = await fs.readFile(CHECKPOINT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      completedSearchTerms: Array.isArray(parsed?.completedSearchTerms)
        ? parsed.completedSearchTerms
        : [],
      searchItemsByTerm:
        parsed?.searchItemsByTerm &&
        typeof parsed.searchItemsByTerm === "object" &&
        !Array.isArray(parsed.searchItemsByTerm)
          ? parsed.searchItemsByTerm
          : {},
      lastUpdatedAt:
        typeof parsed?.lastUpdatedAt === "string"
          ? parsed.lastUpdatedAt
          : new Date().toISOString(),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return createEmptyCheckpoint();
    }
    throw error;
  }
}

async function saveCheckpoint(checkpoint) {
  checkpoint.lastUpdatedAt = new Date().toISOString();
  await fs.mkdir(new URL("../docs/", import.meta.url), { recursive: true });
  await fs.writeFile(
    CHECKPOINT_PATH,
    JSON.stringify(checkpoint, null, 2),
    "utf8",
  );
}

async function loadSeedInfluencers() {
  try {
    const raw = await fs.readFile(CONFIG.seedInfluencersPath, "utf8");
    const rows = parseCsv(raw);
    const seeds = [];
    const seen = new Set();

    for (const row of rows) {
      const username = normaliseUsername(row.username);
      if (!username || seen.has(username)) continue;

      seen.add(username);
      seeds.push({
        username,
        seedCountry: row.country || "",
        seedAudienceSegment: row.audienceSegment || "",
        seedNotes: row.notes || "",
        isSeed: true,
        source: "seed",
        discoveredBy: ["seed"],
      });
    }

    return seeds;
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.log(`No seed file found at ${CONFIG.seedInfluencersPath}`);
      return [];
    }

    throw error;
  }
}

async function hydrateSeedInfluencer(seed) {
  try {
    const items = await callActor(PROFILE_SEARCH_ACTOR, {
      search: seed.username,
      searchType: "user",
      searchLimit: 10,
    });

    const exactMatch =
      items.find((item) => getUsername(item) === seed.username) || null;

    if (!exactMatch) {
      return seed;
    }

    const followersCount = getFollowerCount(exactMatch);
    const profileScore = audienceFitScore(exactMatch);

    return {
      ...exactMatch,
      ...seed,
      username: seed.username,
      source: "seed",
      isSeed: true,
      followersCount,
      profileScore,
      discoveredBy: ["seed"],
    };
  } catch (error) {
    console.error(`Failed to hydrate seed @${seed.username}:`, error.message);
    return seed;
  }
}

async function callActor(actorId, input) {
  console.log(`Running ${actorId}...`);

  const run = await client.actor(actorId).call(input);

  if (!run?.defaultDatasetId) {
    throw new Error(`No dataset returned by ${actorId}`);
  }

  return await listAllDatasetItems(run.defaultDatasetId);
}

async function listAllDatasetItems(datasetId) {
  const all = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const { items } = await client.dataset(datasetId).listItems({
      clean: true,
      limit,
      offset,
    });

    all.push(...items);

    if (items.length < limit) break;

    offset += items.length;
  }

  return all;
}

function passesBasicPrefilter(profile) {
  const followers = profile.followersCount;

  if (!followers) return false;

  return (
    followers >= CONFIG.minFollowers &&
    followers <= CONFIG.maxFollowers &&
    profile.profileScore >= 3
  );
}

async function recoverPreviousSearchRuns(checkpoint) {
  for (const recovery of recoverCompletedSearchRuns) {
    if (checkpoint.completedSearchTerms.includes(recovery.term)) {
      continue;
    }

    try {
      const run = await client.run(recovery.runId).get();
      if (!run?.defaultDatasetId) {
        throw new Error(`No dataset found for run ${recovery.runId}`);
      }

      const items = await listAllDatasetItems(run.defaultDatasetId);
      checkpoint.searchItemsByTerm[recovery.term] = items;
      checkpoint.completedSearchTerms.push(recovery.term);
      await saveCheckpoint(checkpoint);
      console.log(
        `Recovered ${items.length} items for previous run: ${recovery.term}`,
      );
    } catch (error) {
      console.error(
        `Failed to recover previous run for ${recovery.term}:`,
        error.message,
      );
    }
  }
}

function dedupeSearchTerms(terms) {
  const seen = new Set();
  const deduped = [];

  for (const term of terms) {
    const normalised = String(term).trim().toLowerCase();
    if (!normalised || seen.has(normalised)) continue;
    seen.add(normalised);
    deduped.push(String(term).trim());
  }

  return deduped;
}

function generateSearchTermsFromSeeds(seedAnalysedRows) {
  const generated = [];

  for (const row of seedAnalysedRows) {
    const country = row.country !== "Unknown" ? row.country : row.seedCountry;
    const seedSegment = row.seedAudienceSegment || row.audienceSegment;
    const text = [
      row.audienceSegment,
      row.seedAudienceSegment,
      row.bio,
      row.discoveredBy,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (country && COUNTRY_SEARCH_TERM_MAP[country]) {
      generated.push(...COUNTRY_SEARCH_TERM_MAP[country]);
    }

    if (seedSegment && AUDIENCE_SEGMENT_SEARCH_TERM_MAP[seedSegment]) {
      generated.push(...AUDIENCE_SEGMENT_SEARCH_TERM_MAP[seedSegment]);
      if (country && COUNTRY_SEARCH_TERM_MAP[country]) {
        for (const term of AUDIENCE_SEGMENT_SEARCH_TERM_MAP[seedSegment]) {
          if (country === "UK") generated.push(`${term} UK`);
          if (country === "Canada") generated.push(`${term} Canada`);
          if (country === "Ireland") generated.push(`${term} Ireland`);
          if (country === "US") generated.push(`${term} USA`);
        }
      }
    }

    if (signalMatchesText(text, "high protein")) {
      generated.push(country === "UK" ? "high protein meals UK" : "high protein meals");
    }
    if (signalMatchesText(text, "protein recipe")) {
      generated.push(country === "UK" ? "protein recipes UK" : "protein recipes");
    }
    if (signalMatchesText(text, "dietitian")) {
      if (country === "UK") generated.push("registered dietitian UK");
      if (country === "Canada") generated.push("dietitian Canada");
      if (country === "Ireland") generated.push("dietitian Ireland");
      if (country === "US") generated.push("dietitian USA");
    }
    if (signalMatchesText(text, "hyrox")) {
      if (country === "UK") generated.push("HYROX coach UK");
      if (country === "US") generated.push("hyrox coach USA");
      generated.push("hyrox coach");
    }
  }

  return dedupeSearchTerms(generated).filter((term) => {
    const normalised = term.toLowerCase();
    return !seedAnalysedRows.some((row) => row.username === normalised);
  });
}

function mergeAnalysedRows(rows) {
  const byUsername = new Map();

  for (const row of rows) {
    if (!row?.username) continue;

    const key = row.username.toLowerCase();
    const existing = byUsername.get(key);

    if (!existing) {
      byUsername.set(key, row);
      continue;
    }

    const merged = {
      ...existing,
      ...row,
      isSeed: existing.isSeed || row.isSeed || false,
      source:
        existing.source === "seed" || row.source === "seed"
          ? "seed"
          : row.source || existing.source || "search",
      seedCountry: existing.seedCountry || row.seedCountry || "",
      seedAudienceSegment:
        existing.seedAudienceSegment || row.seedAudienceSegment || "",
      seedNotes: existing.seedNotes || row.seedNotes || "",
      discoveredBy: [existing.discoveredBy, row.discoveredBy]
        .flatMap((value) =>
          Array.isArray(value)
            ? value
            : typeof value === "string" && value
              ? value.split(";").map((item) => item.trim())
              : [],
        )
        .filter(Boolean),
    };

    byUsername.set(key, merged);
  }

  return [...byUsername.values()].map((row) => ({
    ...row,
    discoveredBy: Array.from(new Set(row.discoveredBy || [])),
  }));
}

async function discoverProfiles(checkpoint, effectiveSearchTerms) {
  const candidatesByUsername = new Map();
  const searchTermsToRun = effectiveSearchTerms.slice(0, CONFIG.maxSearchTermsToRun);

  for (const term of searchTermsToRun) {
    let items;

    if (checkpoint.completedSearchTerms.includes(term)) {
      console.log(`Skipping already completed search term: ${term}`);
      items = Array.isArray(checkpoint.searchItemsByTerm[term])
        ? checkpoint.searchItemsByTerm[term]
        : [];
    } else {
      items = await callActor(PROFILE_SEARCH_ACTOR, {
        search: term,
        searchType: "user",
        searchLimit: CONFIG.searchLimitPerTerm,
      });
      checkpoint.searchItemsByTerm[term] = items;
      checkpoint.completedSearchTerms.push(term);
      await saveCheckpoint(checkpoint);
      console.log(`Saved checkpoint after search term: ${term}`);
    }

    console.log(`Search "${term}" returned ${items.length} items`);

    for (const item of items) {
      const username = getUsername(item);
      if (!username) continue;

      const followersCount = getFollowerCount(item);
      const profileScore = audienceFitScore(item);

      const existing = candidatesByUsername.get(username);

      const candidate = {
        ...existing,
        ...item,
        username,
        isSeed: existing?.isSeed || false,
        source: existing?.source || "search",
        seedCountry: existing?.seedCountry || "",
        seedAudienceSegment: existing?.seedAudienceSegment || "",
        seedNotes: existing?.seedNotes || "",
        followersCount: followersCount ?? existing?.followersCount ?? null,
        profileScore: Math.max(profileScore, existing?.profileScore ?? 0),
        discoveredBy: [...new Set([...(existing?.discoveredBy ?? []), term])],
      };

      candidatesByUsername.set(username, candidate);
    }

    const prefilteredCount = [...candidatesByUsername.values()].filter(
      passesBasicPrefilter,
    ).length;

    if (prefilteredCount >= CONFIG.maxPrefilteredCandidatesBeforeReels) {
      console.log(
        `Reached ${prefilteredCount} prefiltered profiles after "${term}", stopping discovery early.`,
      );
      break;
    }
  }

  return [...candidatesByUsername.values()];
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];

      try {
        results[currentIndex] = await mapper(item, currentIndex);
      } catch (error) {
        console.error(`Failed item ${currentIndex + 1}:`, error.message);
        results[currentIndex] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );

  await Promise.all(workers);

  return results.filter(Boolean);
}

async function analyseCandidate(candidate, index, total) {
  console.log(`[${index + 1}/${total}] Analysing @${candidate.username}...`);

  const reels = await callActor(REELS_ACTOR, {
    username: [candidate.username],
    resultsLimit: CONFIG.reelsPerProfile,
  });

  const reelViews = reels
    .map(getReelViewCount)
    .filter((views) => Number.isFinite(views) && views > 0);

  const medianReelViews = median(reelViews);
  const finalSupplementScore = audienceFitScore(candidate, reels);
  const audienceSegment = inferAudienceSegment(candidate, reels);
  const leadType = inferLeadType(candidate, reels);
  const {
    country,
    countryConfidence,
    excludedCountry,
    excludedCountryConfidence,
    marketEligible,
  } = inferCountry(candidate, reels);

  return {
    username: candidate.username,
    profileUrl: `https://www.instagram.com/${candidate.username}/`,
    fullName: candidate.fullName || candidate.full_name || "",
    audienceSegment,
    isSeed: candidate.isSeed === true,
    source: candidate.source || "search",
    seedCountry: candidate.seedCountry || "",
    seedAudienceSegment: candidate.seedAudienceSegment || "",
    seedNotes: candidate.seedNotes || "",
    leadType,
    country,
    countryConfidence,
    excludedCountry,
    excludedCountryConfidence,
    marketEligible,
    bio: candidate.bio || candidate.biography || "",
    followersCount: candidate.followersCount,
    reelsMeasured: reelViews.length,
    medianReelViews,
    estimatedContractPriceGBP: estimateContractPriceGBP(medianReelViews),
    supplementScore: finalSupplementScore,
    discoveredBy: Array.isArray(candidate.discoveredBy)
      ? candidate.discoveredBy.join("; ")
      : candidate.discoveredBy || "",
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";

  const str = String(value);

  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function getRejectionReason(row) {
  const reasons = [];

  if (
    !Number.isFinite(row.followersCount) ||
    row.followersCount < CONFIG.minFollowers ||
    row.followersCount > CONFIG.maxFollowers
  ) {
    reasons.push(`followersCount outside range (${row.followersCount ?? "unknown"})`);
  }

  if (row.supplementScore < 5) {
    reasons.push(`supplementScore < 5 (${row.supplementScore})`);
  }

  if (row.marketEligible !== true) {
    if (row.country === "Unknown") {
      reasons.push("unknown target country");
    } else if (row.excludedCountry) {
      reasons.push(`non-target country: ${row.excludedCountry}`);
    } else {
      reasons.push("not market eligible");
    }
  }

  if (row.countryConfidence < 1) {
    reasons.push(`countryConfidence < 1 (${row.countryConfidence})`);
  }

  if (
    row.medianReelViews < CONFIG.minMedianReelViews ||
    row.medianReelViews > CONFIG.maxMedianReelViews
  ) {
    reasons.push(`medianReelViews outside range (${row.medianReelViews})`);
  }

  return reasons.join("; ") || "included";
}

async function writeCsv(rows, path) {
  const headers = [
    "username",
    "profileUrl",
    "fullName",
    "audienceSegment",
    "isSeed",
    "source",
    "seedCountry",
    "seedAudienceSegment",
    "seedNotes",
    "leadType",
    "country",
    "countryConfidence",
    "excludedCountry",
    "excludedCountryConfidence",
    "marketEligible",
    "followersCount",
    "medianReelViews",
    "reelsMeasured",
    "estimatedContractPriceGBP",
    "supplementScore",
    ...(rows.some((row) => Object.hasOwn(row, "rejectionReason"))
      ? ["rejectionReason"]
      : []),
    "discoveredBy",
    "bio",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ];

  await fs.writeFile(path, lines.join("\n"), "utf8");
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "Unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  if (!process.env.APIFY_TOKEN) {
    throw new Error("Missing APIFY_TOKEN in .env");
  }

  const checkpoint = await loadCheckpoint();
  console.log(
    `Loaded checkpoint with ${checkpoint.completedSearchTerms.length} completed search terms`,
  );

  await recoverPreviousSearchRuns(checkpoint);

  const seedInfluencers = await loadSeedInfluencers();
  console.log(`Loaded ${seedInfluencers.length} seed influencers`);

  const hydratedSeedInfluencers = await mapLimit(
    seedInfluencers,
    CONFIG.concurrency,
    (seed) => hydrateSeedInfluencer(seed),
  );

  const seedAnalysedRows = await mapLimit(
    hydratedSeedInfluencers,
    CONFIG.concurrency,
    (candidate, index) =>
      analyseCandidate(candidate, index, hydratedSeedInfluencers.length),
  );
  console.log(`Analysed seed influencers: ${seedAnalysedRows.length}`);

  const seedGeneratedSearchTerms = generateSearchTermsFromSeeds(seedAnalysedRows);
  console.log(
    `Generated ${seedGeneratedSearchTerms.length} search terms from seeds`,
  );

  const effectiveSearchTerms = dedupeSearchTerms([
    ...seedGeneratedSearchTerms,
    ...SEARCH_TERMS,
  ]);
  console.log(`Using ${SEARCH_TERMS.length} curated search terms`);
  console.log(`Using ${effectiveSearchTerms.length} total effective search terms`);
  console.log(
    `Running up to ${CONFIG.maxSearchTermsToRun} search terms this run`,
  );

  const discovered = await discoverProfiles(checkpoint, effectiveSearchTerms);

  console.log(`Discovered ${discovered.length} unique profiles`);

  const prefiltered = discovered.filter(passesBasicPrefilter);
  const seedUsernames = new Set(seedAnalysedRows.map((row) => row.username));
  const prefilteredWithoutSeedDuplicates = prefiltered.filter(
    (candidate) => !seedUsernames.has(candidate.username),
  );

  console.log(
    `${prefiltered.length} profiles passed follower + initial audience-fit filters`,
  );

  const candidatesToAnalyse = prefilteredWithoutSeedDuplicates.slice(
    0,
    CONFIG.maxCandidatesToAnalyse,
  );

  const analysedDiscovered = await mapLimit(
    candidatesToAnalyse,
    CONFIG.concurrency,
    (candidate, index) =>
      analyseCandidate(candidate, index, candidatesToAnalyse.length),
  );

  const analysed = mergeAnalysedRows([...seedAnalysedRows, ...analysedDiscovered]);

  const analysedWithReasons = analysed.map((row) => ({
    ...row,
    rejectionReason: getRejectionReason(row),
  }));

  const rejectedUnknownCountry = analysed.filter(
    (row) => row && row.country === "Unknown",
  ).length;
  const rejectedNonTargetCountry = analysed.filter(
    (row) => row && row.marketEligible !== true && row.country !== "Unknown",
  ).length;

  const finalRows = analysed
    .filter((row) => {
      return (
        Number.isFinite(row.followersCount) &&
        row.followersCount >= CONFIG.minFollowers &&
        row.followersCount <= CONFIG.maxFollowers &&
        row.supplementScore >= 5 &&
        row.marketEligible === true &&
        row.country !== "Unknown" &&
        row.countryConfidence >= 1 &&
        row.medianReelViews >= CONFIG.minMedianReelViews &&
        row.medianReelViews <= CONFIG.maxMedianReelViews
      );
    })
    .sort((a, b) => {
      const priorityDiff = leadTypePriority(a.leadType) - leadTypePriority(b.leadType);
      if (priorityDiff !== 0) return priorityDiff;

      if (b.supplementScore !== a.supplementScore) {
        return b.supplementScore - a.supplementScore;
      }

      return b.medianReelViews - a.medianReelViews;
    })
    .slice(0, CONFIG.maxFinalResults);

  console.log(
    `${finalRows.length} profiles passed the final country + views filter`,
  );
  console.log(`Rejected for unknown country: ${rejectedUnknownCountry}`);
  console.log(`Rejected for non-target country: ${rejectedNonTargetCountry}`);

  await writeCsv(analysedWithReasons, CONFIG.debugOutputPath);
  await writeCsv(finalRows, CONFIG.outputPath);

  console.log(
    "Analysed by segment:",
    countBy(analysedWithReasons, "audienceSegment"),
  );
  console.log("Included by segment:", countBy(finalRows, "audienceSegment"));

  console.log(`Debug CSV path: ${CONFIG.debugOutputPath}`);
  console.log(
    `Analysed rows written to debug CSV: ${analysedWithReasons.length}`,
  );
  console.log(`Done. Found ${finalRows.length} matching profiles.`);
  console.log(`Output CSV path: ${CONFIG.outputPath}`);

  console.table(
    finalRows.slice(0, 20).map((row) => ({
      username: row.username,
      followers: row.followersCount,
      medianViews: row.medianReelViews,
      priceGBP: row.estimatedContractPriceGBP,
      score: row.supplementScore,
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
