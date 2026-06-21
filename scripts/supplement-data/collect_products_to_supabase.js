require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const cheerio = require("cheerio");

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const PRODUCT_URLS = [
  "https://www.myprotein.com/p/sports-nutrition/essential-omega-3/10529329/",
];

function extractJsonLdProducts($) {
  const products = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).text().trim();
      if (!raw) return;

      const json = JSON.parse(raw);
      const items = Array.isArray(json) ? json : [json];

      for (const item of items) {
        if (item["@type"] === "Product") products.push(item);

        if (Array.isArray(item["@graph"])) {
          for (const graphItem of item["@graph"]) {
            if (graphItem["@type"] === "Product") products.push(graphItem);
          }
        }
      }
    } catch {
      // Ignore bad JSON-LD
    }
  });

  return products;
}

function pickBarcode(productSchema, pageText) {
  return (
    productSchema.gtin13 ||
    productSchema.gtin14 ||
    productSchema.gtin12 ||
    productSchema.gtin8 ||
    productSchema.gtin ||
    pageText.match(/\b(?:EAN|GTIN|Barcode|UPC)\s*[:#]?\s*(\d{8,14})\b/i)?.[1] ||
    null
  );
}

async function scrapeProduct(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Suppro data research script",
      Accept: "text/html",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const pageText = $("body").text().replace(/\s+/g, " ").trim();

  const jsonLdProducts = extractJsonLdProducts($);
  const productSchema = jsonLdProducts[0] || {};

  const productName =
    productSchema.name ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "Unknown product";

  const brand =
    typeof productSchema.brand === "string"
      ? productSchema.brand
      : productSchema.brand?.name || null;

  const barcode = pickBarcode(productSchema, pageText);

  return {
    source_url: url,
    retailer: new URL(url).hostname.replace("www.", ""),
    brand,
    product_name: productName,
    barcode,
    ingredients_text: pageText.slice(0, 12000),
    raw_product_json: {
      page_title: $("title").text().trim(),
      product_schema: productSchema,
      scraped_at: new Date().toISOString(),
    },
    scrape_status: barcode ? "scraped_with_barcode" : "scraped_missing_barcode",
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  for (const url of PRODUCT_URLS) {
    console.log(`Scraping: ${url}`);

    const row = await scrapeProduct(url);

    const { error } = await supabase
      .from("retail_supplement_product_staging")
      .upsert(row, { onConflict: "source_url" });

    if (error) throw error;

    console.log(`Saved: ${row.product_name}`);
    console.log(`Barcode: ${row.barcode || "missing"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
