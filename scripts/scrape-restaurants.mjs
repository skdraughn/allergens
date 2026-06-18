import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";
import slugify from "slugify";

installPdfJsGeometryPolyfills();

import { addCoverageMetadata, applyCoverageGate } from "./coverage-gate.mjs";
import { getBrandAdapter, snapshotVersion } from "./restaurant-adapters.mjs";
import { rankingSource, restaurantSources } from "./restaurant-sources.mjs";

const runtimeImport = new Function("specifier", "return import(specifier)");
let pdfjsLibPromise = null;
let pdfParsePromise = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultOutputPath = path.join(
  projectRoot,
  "src/data/generated/restaurants.generated.json",
);
const defaultRunPath = path.join(projectRoot, "data/scraped/latest-run.json");
const defaultRawDir = path.join(projectRoot, "data/scraped/raw");
const runDate = new Date().toISOString();
const rawDate = runDate.slice(0, 10);

const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/605.1.15 allergy-app-menu-pipeline/1.0";
const browserUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const browserFetchRestaurantIds = new Set([
  "applebees",
  "dairy-queen",
  "golden-corral",
  "ihop",
  "qdoba",
  "red-lobster",
  "shake-shack",
  "starbucks",
  "texas-roadhouse",
  "waffle-house",
  "zaxbys",
]);
const tlsFetchPdfRestaurantIds = new Set(["qdoba", "zaxbys"]);

const sourceTypes = {
  allergen: "allergen",
  api: "api",
  menu: "menu",
};

const allergenSourceTypes = {
  officialAllergenMenu: "official-allergen-menu",
  officialIngredients: "official-ingredients",
  officialProductAllergenSection: "official-product-allergen-section",
  unavailable: "unavailable",
};

function installPdfJsGeometryPolyfills() {
  globalThis.DOMMatrix ??= class DOMMatrix {
    constructor(init = [1, 0, 0, 1, 0, 0]) {
      const values = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
      this.a = values[0] ?? 1;
      this.b = values[1] ?? 0;
      this.c = values[2] ?? 0;
      this.d = values[3] ?? 1;
      this.e = values[4] ?? 0;
      this.f = values[5] ?? 0;
    }
  };
  globalThis.DOMPoint ??= class DOMPoint {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
  };
  globalThis.DOMRect ??= class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  };
  globalThis.ImageData ??= class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  globalThis.Path2D ??= class Path2D {};
}

async function getPdfJsLib() {
  installPdfJsGeometryPolyfills();
  pdfjsLibPromise ??= runtimeImport("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsLibPromise;
}

async function getPdfParse() {
  installPdfJsGeometryPolyfills();
  pdfParsePromise ??= runtimeImport("pdf-parse");
  return pdfParsePromise;
}

const args = parseArgs(process.argv.slice(2));
const timeoutMs = Number(args["timeout-ms"] ?? 20000);
const productPageLimit = Number(args["product-page-limit"] ?? 20);
const outputPath = path.resolve(args.output ?? defaultOutputPath);
const runPath = path.resolve(args.runOutput ?? defaultRunPath);
const rawDir = path.resolve(args.rawDir ?? defaultRawDir);
const writeRaw =
  args["skip-raw"] !== "true" &&
  (isCliEntry() || process.env.RESTAURANT_PIPELINE_WRITE_RAW === "true");
const chainFilter = String(args.chain ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const limit = args.limit ? Number(args.limit) : null;

const selectedSources = restaurantSources
  .filter((source) => chainFilter.length === 0 || chainFilter.includes(source.id))
  .slice(0, limit ?? restaurantSources.length);

const allergenTerms = [
  {
    id: "peanut",
    terms: ["peanut", "peanuts", "arachis"],
  },
  {
    id: "tree-nut",
    terms: [
      "tree nut",
      "tree nuts",
      "almond",
      "almonds",
      "cashew",
      "cashews",
      "walnut",
      "walnuts",
      "pecan",
      "pecans",
      "pistachio",
      "pistachios",
      "hazelnut",
      "hazelnuts",
      "macadamia",
    ],
  },
  {
    id: "milk",
    terms: [
      "milk",
      "dairy",
      "cheese",
      "cream",
      "butter",
      "buttermilk",
      "whey",
      "casein",
      "lactose",
    ],
  },
  {
    id: "egg",
    terms: ["egg", "eggs", "egg white", "egg yolk", "albumen", "mayonnaise"],
  },
  {
    id: "wheat",
    terms: ["wheat", "flour", "bun", "bread", "breading", "tortilla"],
  },
  {
    id: "gluten",
    terms: ["gluten", "barley", "rye", "malt"],
  },
  {
    id: "soy",
    terms: ["soy", "soybean", "soybeans", "soy lecithin", "tofu", "edamame"],
  },
  {
    id: "sesame",
    terms: ["sesame", "tahini"],
  },
  {
    id: "fish",
    terms: ["fish", "cod", "pollock", "tuna", "salmon", "anchovy", "anchovies"],
  },
  {
    id: "shellfish",
    terms: ["shellfish", "shrimp", "crab", "lobster", "crustacean", "clam", "oyster"],
  },
  {
    id: "mustard",
    terms: ["mustard"],
  },
  {
    id: "sulfites",
    terms: ["sulfite", "sulfites", "sulphite", "sulphites"],
  },
];

const providerAllergenCodes = new Map([
  ["dair", "milk"],
  ["dairy", "milk"],
  ["egg", "egg"],
  ["eggs", "egg"],
  ["fish", "fish"],
  ["glut", "gluten"],
  ["gluten", "gluten"],
  ["milk", "milk"],
  ["must", "mustard"],
  ["mustard", "mustard"],
  ["pean", "peanut"],
  ["peanut", "peanut"],
  ["sesame", "sesame"],
  ["sesm", "sesame"],
  ["shellfish", "shellfish"],
  ["soy", "soy"],
  ["soyb", "soy"],
  ["sulp", "sulfites"],
  ["sulphites", "sulfites"],
  ["sulfites", "sulfites"],
  ["tree", "tree-nut"],
  ["tree-nut", "tree-nut"],
  ["treenut", "tree-nut"],
  ["wheat", "wheat"],
]);

const subwayPdfColumns = [
  { id: "egg", x: 231 },
  { id: "fish", x: 257 },
  { id: "milk", x: 283 },
  { id: "peanut", x: 309 },
  { id: "sesame", x: 335 },
  { id: "shellfish", x: 361 },
  { id: "soy", x: 387 },
  { id: "tree-nut", x: 413 },
  { id: "wheat", x: 441 },
  { id: "gluten", x: 441 },
  { id: "sulfites", x: 469 },
];

const matrixSectionNames = new Set([
  "Breads & Wraps",
  "Meat, Poultry, Seafood & Eggs",
  "Cheese",
  "Condiments & Dressings",
  "Vegetables",
  "Cookies & Desserts",
]);

const skipNamePatterns = [
  /^(home|menu|nutrition|allergens?|privacy|terms|careers|locations?|rewards?|order now)$/i,
  /^(bagels? & muffins|bowls?|breakfast|brew at home|burritos?|desserts?|dinner|donuts?|drinks?|entrees?|espresso & coffee|food|frozen drinks|lunch|nachos|party packs|quesadillas?|sauces?|sides?|tacos|teas and more|vegetarian|beverages?)$/i,
  /^(burgers?|fries|hot dogs?|sandwiches|shakes|toppings)$/i,
  /^(accept|cancel|continue|close modal.*|view|learn|download|sign in|log in|skip|skip to .+|return to .+|contact us)$/i,
  /^navigate to .+ category$/i,
  /^(facebook|instagram|tiktok|youtube|x|twitter)$/i,
  /\{\{/,
  /\b(accessibility|about|blog|careers?|cart|contact|crew|customer support|delivery|do business|do not sell|faq|franchis\w*|gift cards?|investors?|jobs?|legal|locations?|manage privacy|music|news & stories|press room|privacy|real estate|rewards?|shop|sign in|site map|support hub|terms|track|transparency act|who we are)\b/i,
  /^(five guys|five guys enterprises, llc)$/i,
  /^(begin ordering|crowd pleasers|find a|find jobs|forgot password|join now|learn more|not right now|online ordering|our food|our menu|our story|show hide|start a group order|start (new|your) order|use email|use mypanera)/i,
  /^(best sellers|combos|extras|explore|explore .+|limited time|new|specials|trending)$/i,
  /^(milk|egg|eggs|soy|wheat|sesame|tree nuts?|peanuts?|fish|shellfish|mustard|sulfites?)$/i,
  /\b(menu|nutrition|nutrition & ?allergen|nutrition calculator|special diet and lifestyle menu)$/i,
  /\b(freshly made|cooked twice|different kind of dog)\b/i,
  /^(and |ingredients?\b|oil,|flour,|acid pyrophosphate)/i,
  /\.(?:jpe?g|png|webp|gif|svg)$/i,
  /(?:^website_app_|_product$|_web-app_|menu category)/i,
];

const itemSourcePriority = {
  "official-api": 6,
  "pdf-matrix": 6,
  "html-allergen-matrix": 6,
  "pdf-ingredients": 5,
  "json-structured": 4,
  "html-card": 3,
  "html-link": 2,
  "product-page": 4,
};

const allergenSourcePriority = {
  [allergenSourceTypes.officialAllergenMenu]: 4,
  [allergenSourceTypes.officialIngredients]: 3,
  [allergenSourceTypes.officialProductAllergenSection]: 2,
  [allergenSourceTypes.unavailable]: 0,
};

if (isCliEntry()) {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

async function main() {
  const { repository, run } = await buildRestaurantRepository({
    args,
    chainFilter,
    limit,
    previousPath: args.previous ?? outputPath,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(runPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(repository, null, 2)}\n`);
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);

  console.log(`Wrote normalized restaurant data to ${outputPath}`);
  console.log(`Wrote run manifest to ${runPath}`);
}

export async function buildRestaurantRepository({
  args: runArgs = {},
  chainFilter: requestedChainFilter = [],
  limit: requestedLimit = null,
  previousRepository = null,
  previousPath = null,
} = {}) {
  const restaurants = [];
  const runSources = [];
  const selected = restaurantSources
    .filter(
      (source) =>
        requestedChainFilter.length === 0 || requestedChainFilter.includes(source.id),
    )
    .slice(0, requestedLimit ?? restaurantSources.length);

  console.log(`Scraping ${selected.length} restaurant source set(s)`);

  for (const source of selected) {
    console.log(`→ ${source.name}`);
    const result = await scrapeRestaurant(source);
    restaurants.push(result.restaurant);
    runSources.push(...result.sources);

    const statusLine = result.sources
      .map((entry) => `${entry.status}:${shortUrl(entry.url)}`)
      .join(", ");
    console.log(
      `  ${result.restaurant.items.length} item(s), ${result.restaurant.sourceStatus.ok} ok / ${result.restaurant.sourceStatus.failed} failed source(s) ${statusLine}`,
    );
  }

  const repository = {
    generatedAt: runDate,
    rankingSource,
    snapshotVersion,
    sourceCount: runSources.length,
    restaurantCount: restaurants.length,
    itemCount: restaurants.reduce((count, restaurant) => count + restaurant.items.length, 0),
    restaurants,
  };

  const previous = previousRepository ?? (previousPath ? await readJsonIfExists(previousPath) : null);
  const gated = applyCoverageGate(repository, previous);

  const run = {
    generatedAt: runDate,
    args: runArgs,
    coverageGate: gated.manifest,
    sourceCount: runSources.length,
    okCount: runSources.filter((source) => source.ok).length,
    failedCount: runSources.filter((source) => !source.ok).length,
    sources: runSources,
  };

  return {
    repository: gated.repository,
    run,
  };
}

async function scrapeRestaurant(source) {
  const records = [];
  const sourceResults = [];
  const seenUrls = new Set();
  const queue = [
    ...source.menuUrls.map((url) => ({ url, kind: sourceTypes.menu, discovered: false })),
    ...source.allergenUrls.map((url) => ({ url, kind: sourceTypes.allergen, discovered: false })),
    ...(source.apiUrls ?? []).map((url) => ({ url, kind: sourceTypes.api, discovered: false })),
  ];

  while (queue.length > 0) {
    const next = queue.shift();

    if (!next || seenUrls.has(next.url)) {
      continue;
    }

    seenUrls.add(next.url);
    const fetched = await fetchSource(next.url, source, next.kind);
    sourceResults.push(fetched.manifest);

    if (!fetched.ok) {
      continue;
    }

    if (fetched.contentKind === "pdf") {
      records.push(...(await extractPdfItems(fetched.text, source, fetched.finalUrl, fetched.buffer)));
      continue;
    }

    if (fetched.contentKind === "json") {
      records.push(...extractOfficialApiItems(fetched.text, source, fetched.finalUrl, next.kind));
      continue;
    }

    if (fetched.contentKind === "xml") {
      records.push(...extractXmlItems(fetched.text, source, fetched.finalUrl, next.kind));
      continue;
    }

    if (fetched.contentKind === "html") {
      const htmlResult = extractHtmlItems(fetched.text, source, fetched.finalUrl, next.kind);
      records.push(...htmlResult.items);

      for (const link of htmlResult.apiLinks) {
        if (!seenUrls.has(link.url) && queue.length < 90) {
          queue.push({ url: link.url, kind: sourceTypes.api, discovered: true });
        }
      }

      if (next.kind === sourceTypes.allergen) {
        for (const link of htmlResult.discoveredDocuments) {
          if (!seenUrls.has(link.url) && queue.length < 90) {
            queue.push({ url: link.url, kind: sourceTypes.allergen, discovered: true });
          }
        }
      }

      const detailCandidates = htmlResult.productLinks
        .filter((candidate) => isSameSite(candidate.url, fetched.finalUrl))
        .slice(0, productPageLimit);

      for (const candidate of detailCandidates) {
        if (seenUrls.has(candidate.url)) {
          continue;
        }

        seenUrls.add(candidate.url);
        const productPage = await fetchSource(candidate.url, source, sourceTypes.menu);
        sourceResults.push(productPage.manifest);

        if (productPage.ok && productPage.contentKind === "html") {
          const details = extractProductPageItem(
            productPage.text,
            source,
            productPage.finalUrl,
            candidate.name,
          );

          if (details) {
            records.push(details);
          }
        }
      }
    }
  }

  const supplemental = await fetchBrandSupplementalRecords(source);
  records.push(...supplemental.records);
  sourceResults.push(...supplemental.sources);

  const productionRecords = officialOnlyRecordsForBrand(source.id, records);
  const adapter = getBrandAdapter(source.id);
  let items = mergeRecords(productionRecords)
    .filter((item) => isProbablyMenuItemName(item.name))
    .slice(0, 2500);
  let officialItemCount = items.filter(
    (item) => item.allergenSourceType !== allergenSourceTypes.unavailable,
  ).length;

  if (officialItemCount > 0) {
    items = items.filter((item) => item.allergenSourceType !== allergenSourceTypes.unavailable);
    officialItemCount = items.length;
  }

  const sourceStatus = {
    ok: sourceResults.filter((entry) => entry.ok).length,
    failed: sourceResults.filter((entry) => !entry.ok).length,
    total: sourceResults.length,
  };

  return {
    restaurant: addCoverageMetadata({
      id: source.id,
      rank: source.rank,
      name: source.name,
      category: source.category,
      domain: source.domain,
      guideUrl: source.allergenUrls[0],
      guideLabel: "Official menu and allergen sources",
      updated: runDate.slice(0, 7),
      sourceStatus,
      allergenDataStatus: {
        officialItemCount,
      },
      sourceUrls: Array.from(new Set(sourceResults.map((entry) => entry.finalUrl ?? entry.url))),
      items,
    }, adapter, runDate),
    sources: sourceResults,
  };
}

function officialOnlyRecordsForBrand(restaurantId, records) {
  if (restaurantId === "dairy-queen") {
    const tableRecords = records.filter((record) => record.sourceKind === "html-allergen-matrix");
    return tableRecords.length > 0 ? tableRecords : records;
  }

  if (restaurantId === "pf-changs") {
    return records.filter((record) => record.sourceKind === "html-allergen-matrix");
  }

  if (restaurantId === "nothing-bundt-cakes") {
    return records.filter((record) => record.sourceKind === "html-ingredients");
  }

  if (["churchs-texas-chicken", "ruths-chris"].includes(restaurantId)) {
    return [];
  }

  if (restaurantId === "panda-express") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "zaxbys") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "dunkin") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "panera") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "arbys") {
    const pdfRecords = records.filter((record) =>
      ["pdf-matrix", "pdf-ingredients"].includes(record.sourceKind),
    );
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "shake-shack") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "little-caesars") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "wingstop") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "sonic") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (
    ["olive-garden", "longhorn-steakhouse", "outback-steakhouse", "dennys", "ihop"].includes(
      restaurantId,
    )
  ) {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "first-watch") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (restaurantId === "waffle-house") {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (["buffalo-wild-wings", "red-lobster", "yard-house"].includes(restaurantId)) {
    const pdfRecords = records.filter((record) => record.sourceKind === "pdf-matrix");
    return pdfRecords.length > 0 ? pdfRecords : records;
  }

  if (
    [
      "applebees",
      "burger-king",
      "cheesecake-factory",
      "chilis",
      "ihop",
      "popeyes",
      "red-robin",
      "starbucks",
      "texas-roadhouse",
      "whataburger",
    ].includes(restaurantId)
  ) {
    const apiRecords = records.filter((record) => record.sourceKind === "official-api");
    return apiRecords.length > 0 ? apiRecords : records;
  }

  return records;
}

async function fetchBrandSupplementalRecords(source) {
  if (source.id === "mcdonalds") {
    return fetchMcdonaldsOfficialNutritionRecords(source);
  }

  if (source.id === "starbucks") {
    return fetchStarbucksOfficialNutritionRecords(source);
  }

  if (source.id === "zaxbys") {
    return fetchZaxbysOfficialFallbackRecords(source);
  }

  if (source.id === "wendys") {
    return fetchWendysOfficialNutritionRecords(source);
  }

  if (source.id === "culvers") {
    return fetchNutritionixOfficialRecords(source, {
      menuUrl:
        "https://nix-vue-inm.s3.amazonaws.com/restaurant/culvers/data/menu-latest.json.gz",
      sourceLabel: "Official Culver's Nutritionix nutrition and allergen guide.",
    });
  }

  if (source.id === "taco-bell") {
    return fetchNutritionixOfficialRecords(source, {
      menuUrl:
        "https://nix-vue-inm.s3.amazonaws.com/restaurant/taco-bell/data/menu-latest.json.gz",
      sourceLabel: "Official Taco Bell Nutritionix nutrition and allergen guide.",
    });
  }

  if (source.id === "applebees") {
    return fetchNutritionixOfficialRecords(source, {
      menuUrl:
        "https://nix-vue-inm.s3.amazonaws.com/restaurant/applebees/data/menu-latest.json.gz",
      sourceLabel: "Official Applebee's Nutritionix nutrition and allergen guide.",
    });
  }

  if (source.id === "ihop") {
    return fetchNutritionixOfficialRecords(source, {
      menuUrl: "https://nix-vue-inm.s3.amazonaws.com/restaurant/ihop/data/menu-latest.json.gz",
      sourceLabel: "Official IHOP Nutritionix nutrition and allergen guide.",
    });
  }

  if (source.id === "pizza-hut") {
    return fetchNutritionixOfficialRecords(source, {
      menuUrl:
        "https://nix-vue-inm.s3.amazonaws.com/restaurant/pizza-hut/data/menu-latest.json.gz",
      sourceLabel: "Official Pizza Hut Nutritionix nutrition and allergen guide.",
    });
  }

  if (source.id === "kfc") {
    return fetchNutritionixOfficialRecords(source, {
      menuUrl: "https://nix-vue-inm.s3.amazonaws.com/restaurant/kfc/data/menu-latest.json.gz",
      sourceLabel: "Official KFC Nutritionix nutrition and allergen guide.",
    });
  }

  if (source.id === "jimmy-johns") {
    return fetchNutritionixOfficialRecords(source, {
      menuUrl:
        "https://nix-vue-inm.s3.amazonaws.com/restaurant/jimmy-johns/data/menu-latest.json.gz",
      sourceLabel: "Official Jimmy John's Nutritionix nutrition and allergen guide.",
    });
  }

  if (source.id === "jersey-mikes") {
    return fetchJerseyMikesOfficialNutritionRecords(source);
  }

  if (source.id === "burger-king") {
    return fetchRbiSanityOfficialRecords(source, {
      endpoint: "https://kjfd81ul.apicdn.sanity.io/v1/graphql/prod_bk_us/default",
      rootField: "allItems",
      sourceLabel: "Official Burger King Sanity menu item allergen data.",
    });
  }

  if (source.id === "popeyes") {
    return fetchRbiSanityOfficialRecords(source, {
      endpoint: "https://czqk28jt.apicdn.sanity.io/v1/graphql/prod_plk_us/gen3",
      rootField: "allItem",
      sourceLabel: "Official Popeyes Sanity menu item allergen data.",
    });
  }

  if (source.id === "whataburger") {
    return fetchWhataburgerOfficialMenuRecords(source);
  }

  if (source.id === "red-robin") {
    return fetchRedRobinOfficialWidgetRecords(source);
  }

  if (source.id === "cheesecake-factory") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/the-cheesecake-factory/menu/special-diets/premium",
      sourceLabel: "Official The Cheesecake Factory Nutritionix online allergen guide.",
    });
  }

  if (source.id === "chilis") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/chilis/menu/special-diets/premium",
      sourceLabel: "Official Chili's Nutritionix online allergen guide.",
    });
  }

  if (source.id === "texas-roadhouse") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/texas-roadhouse/menu/special-diets/premium",
      sourceLabel: "Official Texas Roadhouse Nutritionix online allergen guide.",
    });
  }

  if (source.id === "firehouse-subs") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/firehouse-subs/menu/special-diets/premium",
      sourceLabel: "Official Firehouse Subs Nutritionix online allergen guide.",
    });
  }

  if (source.id === "marcos-pizza") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/marcos-pizza/menu/special-diets/premium",
      sourceLabel: "Official Marco's Pizza Nutritionix online allergen guide.",
    });
  }

  if (source.id === "mcalisters-deli") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/mcalisters-deli/menu/special-diets/premium",
      sourceLabel: "Official McAlister's Deli Nutritionix online allergen guide.",
    });
  }

  if (source.id === "golden-corral") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/golden-corral/nutrition-calculator",
      sourceLabel: "Official Golden Corral Nutritionix online allergen guide.",
    });
  }

  if (source.id === "bojangles") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/bojangles/nutrition-calculator",
      sourceLabel: "Bojangles Nutritionix online allergen guide.",
    });
  }

  if (source.id === "hardees") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/hardees/nutrition-calculator",
      sourceLabel: "Hardee's Nutritionix online allergen guide.",
    });
  }

  if (source.id === "shake-shack") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/shake-shack/nutrition-calculator",
      sourceLabel: "Shake Shack Nutritionix online allergen guide.",
    });
  }

  if (source.id === "crumbl") {
    return fetchNutritionixSpecialDietsRecords(source, {
      baseUrl: "https://www.nutritionix.com/crumbl-cookies/nutrition-calculator",
      sourceLabel: "Crumbl Nutritionix online allergen guide.",
    });
  }

  return { records: [], sources: [] };
}

async function fetchNutritionixSpecialDietsRecords(source, { baseUrl, sourceLabel }) {
  const allergenTags = [
    ["egg", "allergen_contains_eggs"],
    ["fish", "allergen_contains_fish"],
    ["gluten", "allergen_contains_gluten"],
    ["milk", "allergen_contains_milk"],
    ["peanut", "allergen_contains_peanuts"],
    ["sesame", "allergen_contains_sesame"],
    ["shellfish", "allergen_contains_shellfish"],
    ["soy", "allergen_contains_soy"],
    ["tree-nut", "allergen_contains_tree_nuts"],
  ];
  const recordsByName = new Map();
  const sources = [];

  const baselineUrl = nutritionixSpecialDietsUrl(baseUrl, allergenTags[0][1], "0");
  const baseline = await fetchSourceWithRetry(baselineUrl, source, sourceTypes.api);
  sources.push(baseline.manifest);

  if (!baseline.ok || baseline.contentKind !== "html") {
    return { records: [], sources };
  }

  for (const item of extractNutritionixSpecialDietsItems(baseline.text)) {
    recordsByName.set(item.name, {
      ...item,
      allergens: [],
    });
  }

  const baselineNames = new Set(recordsByName.keys());
  let validAllergenFilterCount = 0;

  for (const [allergen, tag] of allergenTags) {
    const containsUrl = nutritionixSpecialDietsUrl(baseUrl, tag, "2");
    const fetched = await fetchSourceWithRetry(containsUrl, source, sourceTypes.api);
    sources.push(fetched.manifest);

    if (!fetched.ok || fetched.contentKind !== "html") {
      continue;
    }

    const filteredItems = extractNutritionixSpecialDietsItems(fetched.text);
    const filteredNames = new Set(filteredItems.map((item) => item.name));

    if (nutritionixFilterMatchesBaseline(filteredNames, baselineNames)) {
      continue;
    }

    validAllergenFilterCount += 1;

    for (const item of filteredItems) {
      const existing = recordsByName.get(item.name) ?? {
        ...item,
        allergens: [],
      };
      existing.category = existing.category ?? item.category;
      existing.allergens.push(allergen);
      recordsByName.set(item.name, existing);
    }
  }

  const records = Array.from(recordsByName.values())
    .filter((item) => isProbablyMenuItemName(item.name))
    .map((item) =>
      createRecord({
        allergenSourceType:
          validAllergenFilterCount > 0
            ? allergenSourceTypes.officialAllergenMenu
            : allergenSourceTypes.unavailable,
        allergens: item.allergens,
        category: item.category ?? source.category,
        description: sourceLabel,
        imageUrl: null,
        mayContain: [],
        name: item.name,
        sourceKind: "official-api",
        sourceUrl: baseUrl,
        variantGroup: item.category ?? null,
      }),
    );

  return { records, sources };
}

function nutritionixFilterMatchesBaseline(filteredNames, baselineNames) {
  if (filteredNames.size !== baselineNames.size) {
    return false;
  }

  for (const name of filteredNames) {
    if (!baselineNames.has(name)) {
      return false;
    }
  }

  return true;
}

async function fetchSourceWithRetry(url, source, kind, attempts = 3) {
  let lastResult = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await fetchSource(url, source, kind);
    lastResult = result;

    if (result.ok || ![429, 500, 502, 503, 504, "error"].includes(result.manifest.status)) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }

  return lastResult;
}

function nutritionixSpecialDietsUrl(baseUrl, allergenTag, allergenFree) {
  const params = new URLSearchParams({
    iFrame: "",
    desktop: "",
    allergenFree,
  });
  params.set("allergenTags[0]", allergenTag);
  return `${baseUrl}?${params.toString()}`;
}

function extractNutritionixSpecialDietsItems(html) {
  const $ = cheerio.load(html);
  const items = [];
  let currentCategory = null;

  $("#inmGrid tbody tr").each((_, row) => {
    const element = $(row);

    if (element.hasClass("subCategory")) {
      currentCategory = cleanText(element.find("h3").first().text());
      return;
    }

    const link = element.find("a.nmItem").first();
    const name = cleanText(link.attr("title") ?? link.text());

    if (!name) {
      return;
    }

    items.push({
      category: currentCategory,
      name,
    });
  });

  return items;
}

async function fetchRedRobinOfficialWidgetRecords(source) {
  const apiBaseUrl = "https://widget.api.eagle.bigzpoon.com";
  const widgetUrl = "https://red-robin.widget.eagle.bigzpoon.com/home";
  const deviceId = "allergy-app-red-robin";
  const startedAt = Date.now();
  const sources = [];
  const records = [];

  const widgetHeaders = {
    "device-id": deviceId,
    origin: "https://red-robin.widget.eagle.bigzpoon.com",
    referer: widgetUrl,
    "x-comp-id": "red-robin",
  };

  try {
    const company = await fetchJsonApiSource(`${apiBaseUrl}/company`, source, sourceTypes.api, {
      extraHeaders: widgetHeaders,
    });
    sources.push(company.manifest);

    const companyId = company.json?.data?._id;
    const locationId = company.json?.data?.locationInfo?._id;

    if (!company.ok || !companyId || !locationId) {
      return { records, sources };
    }

    const headers = {
      ...widgetHeaders,
      "location-id": locationId,
      "x-comp-id": companyId,
    };
    const preferences = await fetchJsonApiSource(`${apiBaseUrl}/preferences`, source, sourceTypes.api, {
      extraHeaders: headers,
    });
    sources.push(preferences.manifest);
    const allergyNameById = new Map(
      (preferences.json?.data?.allergies ?? []).map((allergy) => [allergy._id, allergy.name]),
    );

    const categories = await fetchJsonApiSource(
      `${apiBaseUrl}/menucategories?from=red-robin&locationId=${encodeURIComponent(locationId)}`,
      source,
      sourceTypes.api,
      { extraHeaders: headers },
    );
    sources.push(categories.manifest);

    for (const category of categories.json?.data ?? []) {
      const categoryId = category?._id;
      const categoryName = cleanText(category?.name) ?? source.category;

      if (!categoryId) {
        continue;
      }

      const params = new URLSearchParams({
        categoryId,
        from: "red-robin",
        locationId,
      });
      params.set(
        "userPreferences",
        JSON.stringify({ allergies: [], crossContactStatus: false, lifestyleChoices: [] }),
      );

      const categoryItems = await fetchJsonApiSource(
        `${apiBaseUrl}/menuitems?${params.toString()}`,
        source,
        sourceTypes.api,
        { extraHeaders: headers },
      );
      sources.push(categoryItems.manifest);

      for (const item of categoryItems.json?.data?.menuItems ?? []) {
        const itemId = item?._id;
        const name = cleanText(item?.name);

        if (!itemId || !name || !isProbablyMenuItemName(name)) {
          continue;
        }

        const itemDetail = await fetchJsonApiSource(
          `${apiBaseUrl}/menuitems/${encodeURIComponent(itemId)}`,
          source,
          sourceTypes.api,
          { extraHeaders: headers },
        );
        sources.push(itemDetail.manifest);

        if (!itemDetail.ok || !itemDetail.json?.data) {
          continue;
        }

        records.push(
          createRedRobinWidgetRecord({
            allergyNameById,
            categoryName,
            item: itemDetail.json.data,
            sourceUrl: widgetUrl,
          }),
        );
      }
    }
  } catch (error) {
    sources.push({
      contentKind: "error",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown Red Robin widget error",
      finalUrl: widgetUrl,
      kind: sourceTypes.api,
      ok: false,
      restaurantId: source.id,
      status: "error",
      url: widgetUrl,
    });
  }

  return { records, sources };
}

function createRedRobinWidgetRecord({ allergyNameById, categoryName, item, sourceUrl }) {
  const allergens = [];
  const mayContain = [];

  for (const restriction of item.allergyRestrictions ?? []) {
    const allergenNames = [
      allergyNameById.get(restriction._id),
      allergyNameById.get(restriction.id),
      restriction.name,
    ].filter(Boolean);
    const mapped = normalizeProviderAllergens(allergenNames);

    if (restriction.status === "Totally Restricted") {
      allergens.push(...mapped);
    } else if (restriction.status === "Possibly Good") {
      mayContain.push(...mapped);
    }
  }

  for (const ingredient of item.ingredients ?? []) {
    mayContain.push(
      ...normalizeProviderAllergens(
        (ingredient.ccAllergyRestrictions ?? [])
          .map((id) => allergyNameById.get(id) ?? id)
          .filter(Boolean),
      ),
    );
  }

  const ingredientTexts = uniqueStrings(
    (item.ingredients ?? [])
      .flatMap((ingredient) => [
        ingredient.ingredientText,
        ...(Array.isArray(ingredient.rawMaterials) ? ingredient.rawMaterials : []),
      ])
      .filter(Boolean),
  );

  return createRecord({
    allergenSourceType: allergenSourceTypes.officialAllergenMenu,
    allergens,
    category: categoryName,
    description: "Official Red Robin interactive allergen and nutrition widget.",
    imageUrl: item.imageUrl ?? null,
    ingredientsText: ingredientTexts.join("; "),
    isConfigurable: (item.choices ?? []).length > 0,
    mayContain,
    name: item.name,
    sourceKind: "official-api",
    sourceUrl,
  });
}

function fetchZaxbysOfficialFallbackRecords(source) {
  const sourceUrl = source.allergenUrls[0];
  const sections = [
    {
      category: "Zalads",
      names: [
        "The Grilled House Zalad",
        "The Fried House Zalad",
        "The Garden House Zalad",
        "The Grilled Cobb Zalad",
        "The Fried Cobb Zalad",
        "The Garden Cobb Zalad",
        "The Grilled Asian Zensation Zalad",
        "The Fried Asian Zensation Zalad",
        "The Garden Asian Zensation Zalad",
        "The Grilled Blue Zalad",
        "The Fried Blue Zalad",
        "The Garden Blue Zalad",
      ],
    },
    {
      category: "Sandwiches",
      names: [
        "Kickin' Chicken Sandwich Only",
        "Grilled Chicken Sandwich Only",
        "Nibblerz Only",
        "Signature Sandwich Only with Zax Sauce",
        "Signature Sandwich Only with Spicy Zax Sauce",
        "Add Cheese (1 Slice)",
        "Add Bacon (2 Slices)",
      ],
    },
    {
      category: "Most Popular",
      names: [
        "Chicken Finger Plate (4)",
        "Chicken Finger Plate (5)",
        "Chicken Finger Plate (6)",
        "Buffalo Chicken Finger Plate (4)",
        "Buffalo Chicken Finger Plate (5)",
        "Buffalo Chicken Finger Plate (6)",
        "Boneless Wings & Things",
        "Buffalo Boneless Wings & Things",
        "Traditional Wings & Things",
        "Buffalo Traditional Wings & Things",
        "Boneless Wings Meal (5)",
        "Traditional Wings Meal (5)",
        "Big Zax Snak Meal",
        "Buffalo Big Zax Snak Meal",
      ],
    },
    {
      category: "Boneless Wings",
      names: [
        "Boneless Wings (No Sauce)",
        "Boneless Wings - Wimpy",
        "Boneless Wings - Tongue Torch",
        "Boneless Wings - Nuclear",
        "Boneless Wings - Buffalo Garlic Blaze",
        "Boneless Wings - HHM",
        "Boneless Wings - Sweet & Spicy",
        "Boneless Wings - Teriyaki",
        "Boneless Wings - BBQ",
      ],
    },
    {
      category: "Traditional Wings",
      names: [
        "Traditional Wings (No Sauce)",
        "Traditional Wings - Wimpy",
        "Traditional Wings - Tongue Torch",
        "Traditional Wings - Nuclear",
        "Traditional Wings - Buffalo Garlic Blaze",
        "Traditional Wings - HHM",
        "Traditional Wings - Sweet & Spicy",
        "Traditional Wings - Teriyaki",
        "Traditional Wings - BBQ",
      ],
    },
    {
      category: "Chicken Fingerz",
      names: [
        "Chicken Finger (No Sauce)",
        "Chicken Finger - Wimpy",
        "Chicken Finger - Tongue Torch",
        "Chicken Finger - Nuclear",
        "Chicken Finger - Buffalo Garlic Blaze",
        "Chicken Finger - HHM",
        "Chicken Finger - Sweet & Spicy",
        "Chicken Finger - Teriyaki",
        "Chicken Finger - BBQ",
      ],
    },
    {
      category: "Treats",
      names: [
        "Chocolate Chip Cookie",
        "Fried Cheesecake Bites (No Sauce)",
        "Handcrafted Vanilla Milkshake",
        "Handcrafted Strawberry Milkshake",
        "Handcrafted Chocolate Milkshake",
      ],
    },
    {
      category: "Sauces",
      names: [
        "Honey Mustard",
        "Ranch Sauce",
        "Zax Sauce",
        "Spicy Zax Sauce",
        "Tongue Torch",
        "BBQ",
        "Sweet & Spicy",
      ],
    },
    {
      category: "Dressings",
      names: [
        "Wimpy",
        "Nuclear",
        "Buffalo Garlic Blaze",
        "Hot Honey Mustard",
        "Sweet & Spicy",
        "Teriyaki",
        "Strawberry Sauce",
        "Ranch",
        "Honey Mustard",
        "Zax Sauce",
        "Spicy Zax Sauce",
        "Wimpy",
        "Tongue Torch",
        "Nuclear",
        "Buffalo Garlic Blaze",
        "Hot Honey Mustard",
        "Sweet & Spicy",
        "Teriyaki",
        "BBQ",
        "Blue Cheese",
        "Lite Vinaigrette",
        "Ranch",
        "Citrus Vinaigrette",
      ],
    },
    {
      category: "Sides",
      names: [
        "Chicken Bacon Ranch Loaded Fries",
        "Fried White Cheddar Bites",
        "Crinkle Fries - Regular",
        "Crinkle Fries - Large",
        "Cole Slaw - Side",
        "Texas Toast - Slice",
        "Texas Toast - Basket",
        "Fried Pickles",
        "Asian Slaw - Side",
        "Veggie Eggroll - Eggroll",
      ],
    },
    {
      category: "Boxed Lunch",
      names: [
        "Chicken Fingerz with Zax Sauce",
        "Grilled Cheese Sandwich Only",
        "Kids Crinkle Fries",
        "Goldfish Giant Grahams, Vanilla",
        "Rice Krispie Treat",
      ],
    },
    {
      category: "Drinks",
      names: [
        "Milk 8 oz",
        "Chocolate Milk 8 oz",
        "Apple Juice 6 oz",
        "Sweet Tea Kidz",
        "Sweet Tea Small",
        "Sweet Tea Medium",
        "Sweet Tea Large",
        "Sweet Tea Gallon",
        "Unsweet Tea Kidz",
        "Unsweet Tea Small",
        "Unsweet Tea Medium",
        "Unsweet Tea Large",
        "Unsweet Tea Gallon",
        "Coca-Cola Kidz",
        "Coca-Cola Small",
        "Coca-Cola Medium",
        "Coca-Cola Large",
        "Dr Pepper Kidz",
        "Dr Pepper Small",
        "Dr Pepper Medium",
        "Dr Pepper Large",
        "Sprite Kidz",
        "Sprite Small",
        "Sprite Medium",
        "Sprite Large",
        "Diet Coke Kidz",
        "Diet Coke Small",
        "Diet Coke Medium",
        "Diet Coke Large",
        "Barq's Root Beer Kidz",
        "Barq's Root Beer Small",
        "Barq's Root Beer Medium",
        "Barq's Root Beer Large",
        "Hi-C Flashin' Fruit Punch Kidz",
        "Hi-C Flashin' Fruit Punch Small",
        "Hi-C Flashin' Fruit Punch Medium",
        "Hi-C Flashin' Fruit Punch Large",
        "Hi-C Orange Lavaburst Kidz",
        "Hi-C Orange Lavaburst Small",
        "Hi-C Orange Lavaburst Medium",
        "Hi-C Orange Lavaburst Large",
        "Coca-Cola Zero Sugar Kidz",
        "Coca-Cola Zero Sugar Small",
        "Coca-Cola Zero Sugar Medium",
        "Coca-Cola Zero Sugar Large",
        "Mello Yello Kidz",
        "Mello Yello Small",
        "Mello Yello Medium",
        "Mello Yello Large",
        "Powerade Mountain Berry Blast Kidz",
        "Powerade Mountain Berry Blast Small",
        "Powerade Mountain Berry Blast Medium",
        "Powerade Mountain Berry Blast Large",
        "Fanta Cherry Kidz",
        "Fanta Cherry Small",
        "Fanta Cherry Medium",
        "Fanta Cherry Large",
        "Peach Sweet Tea Small",
        "Peach Sweet Tea Medium",
        "Peach Sweet Tea Large",
        "Peach Unsweetened Tea Small",
        "Peach Unsweetened Tea Medium",
        "Peach Unsweetened Tea Large",
        "Handcrafted Lemonade Kidz",
        "Handcrafted Lemonade Small",
        "Handcrafted Lemonade Medium",
        "Handcrafted Lemonade Large",
        "Handcrafted Strawberry Lemonade Small",
        "Handcrafted Strawberry Lemonade Medium",
        "Handcrafted Strawberry Lemonade Large",
        "Frozen Lemonade Small",
        "Frozen Strawberry Lemonade Small",
      ],
    },
    {
      category: "Catering",
      names: [
        "House - Garden",
        "House - Grilled",
        "House - Fried",
        "House - Half & Half",
        "Cobb - Grilled",
        "Cobb - Fried",
        "Cobb - Half & Half",
        "Asian Zensation Zalad Platter - Garden",
        "Asian Zensation Zalad Platter - Grilled",
        "Asian Zensation Zalad Platter - Fried",
        "Asian Zensation Zalad Platter - Half & Half",
        "Zaxby's Signature Sandwich",
        "2 Nibbler Sandwiches",
        "Grilled Chicken Sandwich",
        "Texas Toast Platter (Half Piece)",
        "Tater Chips Platter (Chips Only)",
        "Cole Slaw - Small",
        "Cole Slaw - Large",
        "1 Nibbler (No Sauce)",
      ],
    },
  ];
  const records = sections.flatMap((section) =>
    section.names.map((name) =>
      createRecord({
        allergenSourceType: allergenSourceTypes.unavailable,
        allergens: [],
        category: section.category,
        description:
          "Official Zaxby's nutrition and allergen guide PDF. Live PDF fetch may be Cloudflare-blocked; this fallback preserves the official guide scope without applying shared-facility warnings as item-level allergens.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl,
        variantGroup: name.replace(/\s+(Kidz|Small|Medium|Large|Gallon)$/i, ""),
      }),
    ),
  );

  return {
    records,
    sources: [
      {
        contentKind: "pdf",
        finalUrl: sourceUrl,
        kind: sourceTypes.allergen,
        ok: true,
        restaurantId: source.id,
        status: "fixture",
        url: sourceUrl,
      },
    ],
  };
}

async function fetchMcdonaldsOfficialNutritionRecords(source) {
  const pageUrl = source.allergenUrls[0];
  const page = await fetchSource(pageUrl, source, sourceTypes.allergen);
  const sources = [page.manifest];

  if (!page.ok || page.contentKind !== "html") {
    return { records: [], sources };
  }

  const $ = cheerio.load(page.text);
  const component = $("[data-product-data]").first();
  const productData = parseJsonLoose(component.attr("data-product-data") ?? "");

  if (!Array.isArray(productData?.categoryList)) {
    return { records: [], sources };
  }

  const country = component.attr("data-country") ?? "us";
  const language = component.attr("data-site-language") ?? "en";
  const endpoint = absolutizeUrl(
    component.attr("data-product-collection-api") ?? "/dnaapp/itemList",
    page.finalUrl,
  );
  const records = [];

  for (const category of productData.categoryList) {
    const productIds = Array.isArray(category.productId) ? category.productId : [];

    if (productIds.length === 0) {
      continue;
    }

    const params = new URLSearchParams({
      country: country.toUpperCase(),
      language,
      showLiveData: component.attr("data-show-live-data") ?? "true",
      nutrient_req: "Y",
      item: productIds.map((id) => `${id}()-`).join(""),
    });
    const fetched = await fetchSource(`${endpoint}?${params.toString()}`, source, sourceTypes.api);
    sources.push(fetched.manifest);

    if (!fetched.ok || fetched.contentKind !== "json") {
      continue;
    }

    const parsed = parseJsonLoose(fetched.text);
    const items = asArray(parsed?.items?.item);

    for (const item of items) {
      const name = cleanText(item?.item_name ?? item?.item_marketing_name ?? item?.short_name);

      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      const allergenText = [
        item.item_allergen,
        item.item_additional_allergen,
        ...asArray(item.components?.component).map((componentItem) => componentItem.product_allergen),
      ]
        .map((value) => (typeof value === "string" ? value : ""))
        .join(" ");
      const ingredientText = [
        item.item_ingredient_statement,
        item.item_additional_text_ingredient_statement,
        ...asArray(item.components?.component).map((componentItem) => componentItem.ingredient_statement),
      ]
        .map((value) => (typeof value === "string" ? value : ""))
        .join(" ");
      const categoryName =
        cleanText(item.default_category?.category?.name) ??
        cleanText(category.title) ??
        source.category;

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: uniqueStrings([
            ...findAllergensInText(allergenText),
            ...findDeclaredAllergensOnly(ingredientText),
          ]),
          category: categoryName,
          description: "Official McDonald's nutrition calculator API.",
          imageUrl: mcdonaldsImageUrl(item),
          ingredientsText: ingredientText,
          mayContain: findMayContainAllergens(`${allergenText} ${ingredientText}`),
          name,
          sourceKind: "official-api",
          sourceUrl: fetched.finalUrl,
          variantGroup: item.genesis_menu_item_no ?? item.menu_item_no ?? null,
        }),
      );
    }
  }

  return { records, sources };
}

function mcdonaldsImageUrl(item) {
  // McDonald's DNA nutrition API currently returns stale S3 asset references
  // for these fields. Publishing them creates broken React Native images, so
  // product pages must supply image URLs before McDonald's rows render photos.
  return null;
}

async function fetchJerseyMikesOfficialNutritionRecords(source) {
  const menuUrl = "https://subs.jerseymikes.com/nutrition/data";
  const menu = await fetchSource(menuUrl, source, sourceTypes.api);
  const sources = [menu.manifest];

  if (!menu.ok || menu.contentKind !== "json") {
    return { records: [], sources };
  }

  const categories = parseJsonLoose(menu.text);
  const productRows = [];

  for (const category of asArray(categories)) {
    for (const product of asArray(category.products)) {
      for (const size of asArray(product.sizes)) {
        productRows.push({ category, product, size });
      }
    }
  }

  const records = [];

  for (let index = 0; index < productRows.length; index += 16) {
    const batch = productRows.slice(index, index + 16);
    const batchResults = await Promise.all(
      batch.map(async ({ category, product, size }) => {
        const url = `https://subs.jerseymikes.com/nutrition/${product.id}/${size.id}`;
        const fetched = await fetchSource(url, source, sourceTypes.api);
        return { category, fetched, product, size };
      }),
    );

    for (const { category, fetched, product, size } of batchResults) {
      sources.push(fetched.manifest);

      if (!fetched.ok || fetched.contentKind !== "json") {
        continue;
      }

      const parsed = parseJsonLoose(fetched.text);
      const allergenResult = jerseyMikesAllergens(parsed?.product_ingredients);
      const ingredientsText = jerseyMikesIngredientsText(parsed?.product_ingredients);
      const sizeName = cleanText(size.name);
      const name = sizeName ? `${product.name} (${sizeName})` : product.name;

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: allergenResult.allergens,
          category: cleanText(category.name) ?? source.category,
          description: "Official Jersey Mike's nutrition and allergen API.",
          imageUrl: jerseyMikesImageUrl(size.image ?? product.default_image),
          ingredientsText,
          isConfigurable: true,
          mayContain: allergenResult.mayContain,
          name,
          sourceKind: "official-api",
          sourceUrl: fetched.finalUrl,
          variantGroup: product.id,
        }),
      );
    }
  }

  return { records, sources };
}

function jerseyMikesAllergens(ingredients) {
  const map = new Map([
    ["allergens__egg", "egg"],
    ["allergens__fish", "fish"],
    ["allergens__milk", "milk"],
    ["allergens__peanut", "peanut"],
    ["allergens__shellfish", "shellfish"],
    ["allergens__soy", "soy"],
    ["allergens__tree_nuts", "tree-nut"],
    ["allergens__wheat", "wheat"],
    ["allergens__sesame", "sesame"],
  ]);
  const allergens = [];

  for (const ingredient of asArray(ingredients)) {
    for (const [field, allergen] of map) {
      if (String(ingredient?.[field] ?? "0") === "1") {
        allergens.push(allergen);
      }
    }
  }

  return { allergens: uniqueStrings(allergens), mayContain: [] };
}

function jerseyMikesIngredientsText(ingredients) {
  const names = uniqueStrings(
    asArray(ingredients)
      .map((ingredient) =>
        cleanText(
          ingredient?.name ??
            ingredient?.ingredient_name ??
            ingredient?.display_name ??
            ingredient?.description,
        ),
      )
      .filter(Boolean),
  );

  return names.length > 0 ? names.join(", ") : null;
}

function jerseyMikesImageUrl(image) {
  return image ? `https://subs.jerseymikes.com/media/static/bedrock/lg/${image}.webp` : null;
}

async function fetchNutritionixOfficialRecords(source, { menuUrl, sourceLabel }) {
  const fetched = await fetchSource(menuUrl, source, sourceTypes.api);
  const sources = [fetched.manifest];

  if (!fetched.ok || fetched.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(fetched.text);
  const items = Object.values(parsed?.items ?? {});
  const categoryById = new Map(
    (parsed?.categories ?? []).map((category) => [category.id, cleanText(category.name)]),
  );

  return {
    records: items
      .filter((item) => item?.isActive !== 0 && item?.name)
      .map((item) => {
        const allergenResult = nutritionixAllergens(item.allergens);
        const ingredientsText = stringifySelectedFields(item, [
          "ingredients",
          "ingredientStatement",
          "ingredientStatements",
        ]);

        return createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: allergenResult.allergens,
          category: categoryById.get(item.categoryId) ?? source.category,
          description: sourceLabel,
          imageUrl: item.imageUrl ?? item.largeImageUrl ?? item.smallImageUrl ?? null,
          ingredientsText,
          isConfigurable: Array.isArray(item.modifiers) && item.modifiers.length > 0,
          mayContain: allergenResult.mayContain,
          name: item.name,
          sourceKind: "official-api",
          sourceUrl: fetched.finalUrl,
          variantGroup: item.templateId ? String(item.templateId) : null,
        });
      })
      .filter((record) => record.name && isProbablyMenuItemName(record.name)),
    sources,
  };
}

function nutritionixAllergens(allergens = {}) {
  const fieldMap = new Map([
    ["gluten", "gluten"],
    ["milk", "milk"],
    ["eggs", "egg"],
    ["fish", "fish"],
    ["shellfish", "shellfish"],
    ["crustaceanShellfish", "shellfish"],
    ["molluscanShellfish", "shellfish"],
    ["treeNuts", "tree-nut"],
    ["peanuts", "peanut"],
    ["wheat", "wheat"],
    ["soy", "soy"],
    ["sesame", "sesame"],
  ]);
  const direct = [];
  const mayContain = [];

  for (const [field, allergen] of fieldMap) {
    const value = allergens?.[field]?.presence;

    if (value === 1) {
      direct.push(allergen);
    } else if (value === 2) {
      mayContain.push(allergen);
    }
  }

  return {
    allergens: uniqueStrings(direct),
    mayContain: uniqueStrings(mayContain),
  };
}

async function fetchRbiSanityOfficialRecords(source, { endpoint, rootField, sourceLabel }) {
  const query = `query {
    ${rootField}(limit: 2500) {
      _id
      name { en }
      internalName
      isDummyItem
      showInStaticMenu
      allergens {
        milk
        eggs
        fish
        peanuts
        shellfish
        treeNuts
        soy
        wheat
        mustard
        sesame
        celery
        lupin
        gluten
        sulphurDioxide
      }
      image { asset { url } }
      images { app { asset { url } } }
      productHierarchy { L1 L2 L3 L4 L5 }
    }
  }`;
  const fetched = await fetchJsonPostSource(endpoint, source, sourceTypes.api, { query });
  const sources = [fetched.manifest];

  if (!fetched.ok || fetched.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(fetched.text);
  const items = asArray(parsed?.data?.[rootField]);

  return {
    records: items
      .map((item) => {
        const name = cleanText(item?.name?.en ?? item?.internalName);
        const allergenResult = rbiSanityAllergens(item?.allergens);
        const hierarchy = item?.productHierarchy ?? {};
        const category =
          cleanText(hierarchy.L2) ??
          cleanText(hierarchy.L1) ??
          cleanText(hierarchy.L3) ??
          source.category;

        if (
          !name ||
          !isProbablyMenuItemName(name) ||
          item?.isDummyItem ||
          /^(offer|combo item|bundle|\$?\d+\s*off)\b/i.test(name) ||
          /^non food$/i.test(cleanText(hierarchy.L1) ?? "") ||
          !allergenResult.hasOfficialFlags
        ) {
          return null;
        }

        return createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: allergenResult.allergens,
          category: titleCase(category),
          description: sourceLabel,
          imageUrl: item?.image?.asset?.url ?? item?.images?.app?.asset?.url ?? null,
          mayContain: allergenResult.mayContain,
          name,
          sourceKind: "official-api",
          sourceUrl: endpoint,
          variantGroup: item._id,
        });
      })
      .filter(Boolean),
    sources,
  };
}

function rbiSanityAllergens(allergens = {}) {
  const fieldMap = new Map([
    ["milk", "milk"],
    ["eggs", "egg"],
    ["fish", "fish"],
    ["peanuts", "peanut"],
    ["shellfish", "shellfish"],
    ["treeNuts", "tree-nut"],
    ["soy", "soy"],
    ["wheat", "wheat"],
    ["mustard", "mustard"],
    ["sesame", "sesame"],
    ["gluten", "gluten"],
    ["sulphurDioxide", "sulfites"],
  ]);
  const direct = [];
  const mayContain = [];
  let hasOfficialFlags = false;

  for (const [field, allergen] of fieldMap) {
    const value = allergens?.[field];

    if (typeof value !== "number") {
      continue;
    }

    hasOfficialFlags = true;

    if (value >= 3) {
      direct.push(allergen);
    } else if (value > 0) {
      mayContain.push(allergen);
    }
  }

  return {
    allergens: uniqueStrings(direct),
    hasOfficialFlags,
    mayContain: uniqueStrings(mayContain),
  };
}

async function fetchWhataburgerOfficialMenuRecords(source) {
  const menuUrl = "https://api.whataburger.com/v2.4/menu";
  const fetched = await fetchSource(menuUrl, source, sourceTypes.api, {
    accept: "application/json",
    "x-api-key": "E08F3550-23FE-4360-BD6C-08314E6C3E2F",
  });
  const sources = [fetched.manifest];

  if (!fetched.ok || fetched.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(fetched.text);
  const ingredientById = new Map(asArray(parsed.ingredients).map((ingredient) => [ingredient.id, ingredient]));
  const modifierGroupById = new Map(
    asArray(parsed.modifierGroups).map((group) => [group.id, group]),
  );
  const records = [];

  for (const category of asArray(parsed.categories)) {
    for (const group of asArray(category.recipes)) {
      for (const recipe of asArray(group.recipes)) {
        const name = cleanText(recipe.name);

        if (!name || !isProbablyMenuItemName(name)) {
          continue;
        }

        const ingredientRefs = [
          ...asArray(recipe.ingredients),
          ...whataburgerDefaultModifierIngredients(recipe, modifierGroupById),
        ];
        const ingredientsText =
          cleanText(recipe.longDescription) ??
          whataburgerIngredientsText(ingredientRefs, ingredientById);
        const allergens = ingredientRefs.flatMap((ref) =>
          asArray(ingredientById.get(ref.ingredientId)?.allergens).map((allergen) => allergen?.slug ?? allergen?.name),
        );

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens: normalizeProviderAllergens(allergens),
            category: cleanText(category.name) ?? source.category,
            description: "Official Whataburger menu API ingredient allergen data.",
            imageUrl: whataburgerImageUrl(recipe.imageUrl),
            ingredientsText,
            isConfigurable: asArray(recipe.recipeModifiers).length > 0,
            mayContain: [],
            name,
            sourceKind: "official-api",
            sourceUrl: fetched.finalUrl,
            variantGroup: recipe.id,
          }),
        );
      }
    }
  }

  return { records, sources };
}

function whataburgerDefaultModifierIngredients(recipe, modifierGroupById) {
  const ingredientRefs = [];

  for (const recipeModifier of asArray(recipe.recipeModifiers)) {
    const group = modifierGroupById.get(recipeModifier.modifierGroupId);
    const modifier = asArray(group?.modifiers).find(
      (candidate) =>
        candidate.id === recipeModifier.defaultModifierId || candidate.isDefaultSelected,
    );

    ingredientRefs.push(...asArray(modifier?.ingredients));
  }

  return ingredientRefs;
}

function whataburgerIngredientsText(ingredientRefs, ingredientById) {
  const names = uniqueStrings(
    ingredientRefs
      .map((ref) => ingredientById.get(ref.ingredientId))
      .map((ingredient) =>
        cleanText(ingredient?.name ?? ingredient?.displayName) ??
        titleCase(String(ingredient?.slug ?? "").replace(/-/g, " ")),
      )
      .filter((name) => !/\b(?:calories?|allergen placeholder)\b/i.test(name))
      .filter(Boolean),
  );

  return names.length > 0 ? names.join(", ") : null;
}

function whataburgerImageUrl(imageUrl) {
  const cleaned = cleanText(imageUrl);

  if (!cleaned) {
    return null;
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  return `https://wbimageserver.whataburger.com/${cleaned}`;
}

async function fetchWendysOfficialNutritionRecords(source) {
  const baseUrl = "https://api.app.prd.wendys.digital/web-client-gateway";
  const commonParams =
    "channel=WEB&lang=en&cntry=US&sourceCode=ORDER.WENDYS&version=2.3.1";
  const menuUrl = `${baseUrl}/menu/getSiteMenu?siteNum=0&freeStyleMenu=true&menuChannel=WEB_GUEST&${commonParams}`;
  const menuSource = await fetchSource(menuUrl, source, sourceTypes.api);
  const sources = [menuSource.manifest];

  if (!menuSource.ok || menuSource.contentKind !== "json") {
    return { records: [], sources };
  }

  const parsed = parseJsonLoose(menuSource.text);
  const menu = parsed?.menuLists;

  if (!menu?.menuItems || !menu?.salesItems) {
    return { records: [], sources };
  }

  const salesById = new Map(menu.salesItems.map((item) => [item.salesItemId, item]));
  const categoryByMenuItemId = new Map();

  for (const subMenu of menu.subMenus ?? []) {
    for (const menuItemId of subMenu.menuItems ?? []) {
      categoryByMenuItemId.set(menuItemId, cleanText(subMenu.displayName ?? subMenu.name));
    }
  }

  const records = [];
  const rows = menu.menuItems
    .map((item) => ({ item, salesItem: salesById.get(item.defaultItemId) }))
    .filter(({ item, salesItem }) => item?.displayName && salesItem?.productId);

  for (let index = 0; index < rows.length; index += 12) {
    const batch = rows.slice(index, index + 12);
    const batchResults = await Promise.all(
      batch.map(async ({ item, salesItem }) => {
        const request = {
          siteNum: 0,
          products: [{ id: salesItem.productId, components: [] }],
        };
        const url = `${baseUrl}/NutritionServices/rest/nutritionalData?data=${encodeURIComponent(
          JSON.stringify(request),
        )}&${commonParams}`;
        const fetched = await fetchSource(url, source, sourceTypes.api);
        const nutrition = parseJsonLoose(fetched.text);

        return { fetched, item, nutrition, salesItem };
      }),
    );

    for (const { fetched, item, nutrition, salesItem } of batchResults) {
      sources.push(fetched.manifest);

      if (!fetched.ok || nutrition?.serviceStatus !== "SUCCESS" || !nutrition.data) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: wendysNutritionAllergens(nutrition.data),
          category:
            categoryByMenuItemId.get(item.menuItemId) ??
            cleanText(salesItem.categoryName) ??
            source.category,
          description: "Official Wendy's menu and nutrition API.",
          imageUrl: null,
          ingredientsText: stringifySelectedFields(nutrition.data, [
            "ingredients",
            "ingredientStatement",
            "ingredientStatements",
          ]),
          mayContain: [],
          name: item.displayName,
          sourceKind: "official-api",
          sourceUrl: fetched.finalUrl,
        }),
      );
    }
  }

  return { records, sources };
}

async function fetchStarbucksOfficialNutritionRecords(source) {
  const menuUrl = "https://www.starbucks.com/apiproxy/v1/ordering/menu";
  const browserSnapshot = await fetchStarbucksOfficialBrowserSnapshot(source);
  const sources = [...browserSnapshot.sources];
  const fetchedMenu =
    browserSnapshot.products.length === 0
      ? await fetchStarbucksOfficialSource(menuUrl, source, sourceTypes.api)
      : null;

  if (fetchedMenu) {
    sources.push(fetchedMenu.manifest);
  }

  const fixture = await readJsonIfExists(
    path.join(projectRoot, "data/fixtures/starbucks-official-products.json"),
  );
  const fixtureProducts = extractStarbucksProducts(fixture);
  let products = [];
  let detailByKey = new Map();

  if (browserSnapshot.products.length > 0) {
    products = browserSnapshot.products;
    detailByKey = browserSnapshot.detailByKey;
  } else if (fetchedMenu?.ok) {
    products = extractStarbucksProducts(parseJsonLoose(fetchedMenu.text));
  }

  if (products.length === 0 && fixtureProducts.length > 0) {
    sources.push({
      contentKind: "json",
      finalUrl: "data/fixtures/starbucks-official-products.json",
      kind: sourceTypes.api,
      ok: false,
      restaurantId: source.id,
      status: "fixture-disabled",
      url: "data/fixtures/starbucks-official-products.json",
    });
  }

  const records = [];
  const uniqueProducts = uniqueBy(products, (product) => starbucksProductKey(product));
  const liveProducts = browserSnapshot.products.length > 0 || fetchedMenu?.ok ? uniqueProducts : [];

  for (const product of liveProducts) {
    const detail = detailByKey.get(starbucksProductKey(product));
    const record = starbucksRecordFromProduct(
      detail ? { ...product, ...detail, name: product.name } : product,
      source,
      starbucksNutritionUrl(product),
    );

    if (record) {
      records.push(record);
    }
  }

  if (detailByKey.size > 0) {
    return { records, sources };
  }

  for (const product of liveProducts) {
    const url = starbucksNutritionUrl(product);

    if (!url) {
      continue;
    }

    const fetched = await fetchStarbucksOfficialSource(url, source, sourceTypes.allergen);
    sources.push(fetched.manifest);

    if (!fetched.ok || fetched.contentKind !== "html") {
      continue;
    }

    const parsed = parseStarbucksNutritionPage(fetched.text);
    const record = starbucksRecordFromProduct(
      { ...product, ...parsed, name: product.name },
      source,
      fetched.finalUrl,
    );

    if (record) {
      records.push(record);
    }
  }

  return { records, sources };
}

async function fetchStarbucksOfficialBrowserSnapshot(source) {
  const startedAt = Date.now();
  const menuUrl = "https://www.starbucks.com/menu";
  let browser;

  try {
    const { chromium } = await runtimeImport("playwright-core");
    const executablePath = await getChromiumExecutablePath();
    let menuJson = null;
    let menuResponseMeta = null;
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const page = await browser.newPage({ userAgent: browserUserAgent });

    page.on("response", async (response) => {
      if (response.url() !== "https://www.starbucks.com/apiproxy/v1/ordering/menu") {
        return;
      }

      menuResponseMeta = {
        contentType: response.headers()["content-type"] ?? "",
        finalUrl: response.url(),
        ok: response.ok(),
        status: response.status(),
      };

      if (!response.ok()) {
        return;
      }

      try {
        menuJson = await response.json();
      } catch {
        menuJson = null;
      }
    });

    await page.goto(menuUrl, {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });

    for (let attempt = 0; attempt < 20 && !menuJson; attempt += 1) {
      await page.waitForTimeout(500);
    }

    const products = uniqueBy(
      extractStarbucksProducts(menuJson),
      (product) => starbucksProductKey(product),
    );
    const menuBuffer = Buffer.from(JSON.stringify(menuJson ?? {}, null, 2), "utf8");
    const menuHash = sha256(menuBuffer);
    const menuRawPath = writeRaw
      ? await writeRawSource(source.id, `${menuHash}.json`, menuBuffer)
      : null;
    const menuManifest = {
      browserFetched: true,
      bytes: menuBuffer.length,
      contentKind: "json",
      contentType: menuResponseMeta?.contentType ?? "application/json",
      durationMs: Date.now() - startedAt,
      finalUrl: menuResponseMeta?.finalUrl ?? "https://www.starbucks.com/apiproxy/v1/ordering/menu",
      hash: menuHash,
      kind: sourceTypes.api,
      ok: products.length > 0,
      rawPath: menuRawPath ? path.relative(projectRoot, menuRawPath) : null,
      restaurantId: source.id,
      status: menuResponseMeta?.status ?? (products.length > 0 ? 200 : "browser-error"),
      url: "https://www.starbucks.com/apiproxy/v1/ordering/menu",
    };

    if (products.length === 0) {
      return {
        detailByKey: new Map(),
        products: [],
        sources: [menuManifest],
      };
    }

    const detailRequests = products
      .map((product) => ({
        key: starbucksProductKey(product),
        url: starbucksDetailApiUrl(product),
      }))
      .filter((request) => request.key && request.url);
    const detailStartedAt = Date.now();
    const detailResponses = await page.evaluate(async (requests) => {
      const results = [];
      const delayMs = 350;
      let nextIndex = 0;

      async function worker() {
        while (nextIndex < requests.length) {
          const request = requests[nextIndex];
          nextIndex += 1;

          try {
            if (nextIndex > 1) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }

            const response = await fetch(request.url, {
              headers: {
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
              },
            });
            results.push({
              key: request.key,
              ok: response.ok,
              status: response.status,
              text: await response.text(),
              url: response.url,
            });
          } catch (error) {
            results.push({
              error: error instanceof Error ? error.message : "Unknown Starbucks detail fetch error",
              key: request.key,
              ok: false,
              status: "error",
              text: "",
              url: request.url,
            });
          }
        }
      }

      await worker();
      return results;
    }, detailRequests);
    const detailByKey = new Map();

    for (const response of detailResponses) {
      if (!response.ok) {
        continue;
      }

      const parsed = parseJsonLoose(response.text);
      const productDetail = Array.isArray(parsed?.products) ? parsed.products[0] : null;
      const detail = parseStarbucksProductDetail(productDetail);

      if (detail) {
        detailByKey.set(response.key, detail);
      }
    }

    const detailsBuffer = Buffer.from(
      JSON.stringify(
        detailResponses.map((response) => ({
          key: response.key,
          ok: response.ok,
          status: response.status,
          url: response.url,
        })),
        null,
        2,
      ),
      "utf8",
    );
    const detailsHash = sha256(detailsBuffer);
    const detailsRawPath = writeRaw
      ? await writeRawSource(source.id, `${detailsHash}.json`, detailsBuffer)
      : null;
    const okDetails = detailResponses.filter((response) => response.ok).length;
    const detailsManifest = {
      browserFetched: true,
      bytes: detailResponses.reduce((sum, response) => sum + Buffer.byteLength(response.text ?? ""), 0),
      contentKind: "json",
      contentType: "application/json",
      detailCount: detailResponses.length,
      durationMs: Date.now() - detailStartedAt,
      finalUrl: "https://www.starbucks.com/apiproxy/v1/ordering/{productNumber}/{formCode}",
      hash: detailsHash,
      kind: sourceTypes.allergen,
      ok: okDetails === detailRequests.length,
      okDetailCount: okDetails,
      parsedDetailCount: detailByKey.size,
      rawPath: detailsRawPath ? path.relative(projectRoot, detailsRawPath) : null,
      restaurantId: source.id,
      status: okDetails === detailRequests.length ? 200 : "partial",
      url: "https://www.starbucks.com/apiproxy/v1/ordering/{productNumber}/{formCode}",
    };

    return {
      detailByKey,
      products,
      sources: [menuManifest, detailsManifest],
    };
  } catch (error) {
    return {
      detailByKey: new Map(),
      products: [],
      sources: [
        {
          browserFetched: true,
          contentKind: "error",
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : "Unknown Starbucks browser fetch error",
          finalUrl: menuUrl,
          kind: sourceTypes.api,
          ok: false,
          restaurantId: source.id,
          status: "error",
          url: menuUrl,
        },
      ],
    };
  } finally {
    await browser?.close();
  }
}

function starbucksProductKey(product) {
  const productNumber = product?.productNumber;
  const formCode = cleanText(product?.formCode);

  return productNumber && formCode ? `${productNumber}:${formCode.toLowerCase()}` : null;
}

function starbucksDetailApiUrl(product) {
  const uri = cleanText(product?.uri);

  if (uri) {
    const match = uri.match(/\/product\/([^/]+)\/([^/]+)/i);

    if (match) {
      return `https://www.starbucks.com/apiproxy/v1/ordering/${match[1]}/${match[2]}`;
    }
  }

  const productNumber = product?.productNumber;
  const formCode = cleanText(product?.formCode);

  if (!productNumber || !formCode) {
    return null;
  }

  return `https://www.starbucks.com/apiproxy/v1/ordering/${productNumber}/${formCode.toLowerCase()}`;
}

function parseStarbucksProductDetail(product) {
  if (!product || typeof product !== "object") {
    return null;
  }

  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const allergenTexts = uniqueStrings(
    sizes
      .map((size) => cleanText(size?.allergens?.text))
      .filter(Boolean),
  );
  const ingredientTexts = uniqueStrings(
    sizes.flatMap((size) => flattenStarbucksIngredients(size?.ingredients)).filter(Boolean),
  );

  return {
    allergensText: allergenTexts.join(", "),
    description: cleanText(product.description),
    imageURL: product.imageURL ?? null,
    ingredientsText: ingredientTexts.join(", "),
    productType: product.productType ?? null,
  };
}

function flattenStarbucksIngredients(ingredients) {
  const names = [];

  function walk(nodes) {
    if (!Array.isArray(nodes)) {
      return;
    }

    for (const node of nodes) {
      const name = cleanText(node?.name);

      if (name) {
        names.push(name);
      }

      walk(node?.children);
    }
  }

  walk(ingredients);
  return names;
}

async function fetchStarbucksOfficialSource(url, source, kind) {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      extraHeaders: {
        Accept: kind === sourceTypes.api ? "application/json" : "text/html,application/xhtml+xml",
        "Accept-Language": "en-US",
        Referer: "https://www.starbucks.com/menu",
      },
    });
    const text = await response.text();
    const buffer = Buffer.from(text, "utf8");
    const contentType = response.headers.get("content-type") ?? "";
    const contentKind = detectContentKind(url, contentType, buffer);
    const hash = sha256(buffer);
    const rawPath = writeRaw
      ? await writeRawSource(source.id, `${hash}.${extensionFor(url, contentType)}`, buffer)
      : null;

    return {
      contentKind,
      finalUrl: response.url,
      manifest: {
        bytes: buffer.length,
        contentKind,
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url,
        hash,
        kind,
        ok: response.ok,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: source.id,
        status: response.status,
        url,
      },
      ok: response.ok,
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown Starbucks fetch error",
        finalUrl: url,
        kind,
        ok: false,
        restaurantId: source.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

function extractStarbucksProducts(parsed) {
  const products = [];

  function walk(node, category = null) {
    if (!node || typeof node !== "object") {
      return;
    }

    const nextCategory =
      typeof node.name === "string" && Array.isArray(node.products) ? node.name : category;

    if (Array.isArray(node.products)) {
      for (const product of node.products) {
        products.push({ ...product, category: nextCategory ?? product.category });
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item, nextCategory);
        }
      } else {
        walk(value, nextCategory);
      }
    }
  }

  walk(parsed);
  return products.filter((product) => product?.name && (product.uri || product.sourceUrl));
}

function starbucksNutritionUrl(product) {
  if (product.sourceUrl) {
    return product.sourceUrl;
  }

  const uri = cleanText(product.uri);
  return uri ? `https://www.starbucks.com/menu${uri}/nutrition` : null;
}

function parseStarbucksNutritionPage(html) {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ").trim();

  return {
    allergensText: extractBetween(text, "Allergens", "We cannot guarantee"),
    description:
      cleanText($("meta[name='description']").attr("content")) ??
      cleanText($("meta[property='og:description']").attr("content")),
    ingredientsText: extractBetween(text, "Ingredients", "Allergens"),
    name: cleanText($("h1").first().text()) ?? cleanText($("meta[property='og:title']").attr("content")),
  };
}

function starbucksRecordFromProduct(product, source, sourceUrl) {
  const name = cleanText(product.name);
  const allergensText = cleanText(product.allergensText);
  const ingredientsText = cleanText(product.ingredientsText);

  if (!name || !sourceUrl || !isProbablyMenuItemName(name)) {
    return null;
  }

  const hasUnavailableAllergenText = /see ingredient statement|package for allergens/i.test(
    allergensText ?? "",
  );
  const directAllergens =
    allergensText && !hasUnavailableAllergenText
      ? normalizeProviderAllergens(allergensText.split(/\s*,\s*/))
      : [];
  const ingredientAllergens =
    directAllergens.length === 0 && ingredientsText
      ? findAllergensInDeclaredFoodText(ingredientsText)
      : [];
  const allergens = directAllergens.length > 0 ? directAllergens : ingredientAllergens;
  const allergenSourceType =
    directAllergens.length > 0
      ? allergenSourceTypes.officialProductAllergenSection
      : ingredientAllergens.length > 0
        ? allergenSourceTypes.officialIngredients
        : allergenSourceTypes.unavailable;

  return createRecord({
    allergenSourceType,
    allergens,
    category: product.category ?? source.category,
    description:
      product.description ??
      (directAllergens.length > 0
        ? "Official Starbucks product nutrition allergen section."
        : "Official Starbucks product nutrition ingredient statement."),
    imageUrl: product.imageURL ?? product.imageUrl ?? null,
    ingredientsText,
    mayContain: findMayContainAllergens(`${allergensText ?? ""} ${ingredientsText ?? ""}`),
    name,
    sourceKind: "official-api",
    sourceUrl,
    variantGroup: product.formCode ?? null,
  });
}

function extractBetween(text, start, end) {
  const normalized = String(text);
  const startIndex = normalized.search(new RegExp(`\\b${start}\\b`, "i"));

  if (startIndex < 0) {
    return null;
  }

  const afterStart = normalized.slice(startIndex + start.length);
  const endIndex = afterStart.search(new RegExp(`\\b${end}\\b`, "i"));
  return cleanText(endIndex >= 0 ? afterStart.slice(0, endIndex) : afterStart);
}

function wendysNutritionAllergens(data) {
  return uniqueStrings([
    data.hasEgg ? "egg" : null,
    data.hasFish ? "fish" : null,
    data.hasMilk ? "milk" : null,
    data.hasPeanut ? "peanut" : null,
    data.hasSesame ? "sesame" : null,
    data.hasShellfish ? "shellfish" : null,
    data.hasSoy ? "soy" : null,
    data.hasTreenut ? "tree-nut" : null,
    data.hasWheat ? "wheat" : null,
  ]);
}

async function fetchSource(url, restaurant, kind, extraHeaders = {}) {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, { extraHeaders });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") ?? "";
    const hash = sha256(buffer);
    const ext = extensionFor(url, contentType);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.${ext}`, buffer)
      : null;
    const contentKind = detectContentKind(url, contentType, buffer);
    let text = "";

    if (contentKind === "pdf") {
      text = await readPdfText(buffer);
    } else if (
      contentKind === "html" ||
      contentKind === "json" ||
      contentKind === "xml" ||
      contentKind === "text"
    ) {
      text = buffer.toString("utf8");
    }

    const result = {
      contentKind,
      finalUrl: response.url,
      buffer,
      manifest: {
        bytes: buffer.length,
        contentKind,
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url,
        hash,
        kind,
        ok: response.ok,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response.status,
        url,
      },
      ok: response.ok,
      text,
    };

    if (!result.ok && shouldRetryWithTlsClient(restaurant, url, result.manifest)) {
      return fetchSourceWithTlsClient(url, restaurant, kind, startedAt);
    }

    if (!result.ok && shouldRetryWithBrowser(restaurant, result.manifest)) {
      return fetchSourceWithBrowser(url, restaurant, kind, startedAt);
    }

    return result;
  } catch (error) {
    if (shouldRetryWithTlsClient(restaurant, url)) {
      return fetchSourceWithTlsClient(url, restaurant, kind, startedAt, error);
    }

    if (browserFetchRestaurantIds.has(restaurant.id)) {
      return fetchSourceWithBrowser(url, restaurant, kind, startedAt, error);
    }

    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown fetch error",
        finalUrl: url,
        kind,
        ok: false,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

function shouldRetryWithTlsClient(restaurant, url, manifest = null) {
  return (
    tlsFetchPdfRestaurantIds.has(restaurant.id) &&
    /\.pdf(?:$|\?)/i.test(url) &&
    (!manifest || [403, 429, "error"].includes(manifest.status))
  );
}

function shouldRetryWithBrowser(restaurant, manifest) {
  return browserFetchRestaurantIds.has(restaurant.id) && [403, 429, 502].includes(manifest.status);
}

async function fetchSourceWithTlsClient(url, restaurant, kind, startedAt, originalError = null) {
  let session;

  try {
    const { ClientIdentifier, Session, destroyTLS, initTLS } =
      await runtimeImport("node-tls-client");
    await initTLS();
    session = new Session({
      clientIdentifier: ClientIdentifier.chrome_131,
      followRedirects: true,
      timeout: timeoutMs,
    });
    const response = await session.get(url, {
      byteResponse: true,
      headers: {
        Accept: "application/pdf,text/html,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.zaxbys.com/menu/",
        "Sec-CH-UA": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    const responseBody = response.body ?? "";
    const base64Body = responseBody.startsWith("data:")
      ? responseBody.slice(responseBody.indexOf(",") + 1)
      : responseBody;
    const buffer = Buffer.from(base64Body, "base64");
    const contentType = firstHeaderValue(response.headers, "Content-Type") ?? "";
    const hash = sha256(buffer);
    const ext = extensionFor(url, contentType);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.${ext}`, buffer)
      : null;
    const contentKind = detectContentKind(url, contentType, buffer);
    const text =
      contentKind === "pdf"
        ? await readPdfText(buffer)
        : ["html", "json", "xml", "text"].includes(contentKind)
          ? buffer.toString("utf8")
          : "";

    return {
      contentKind,
      finalUrl: response.url ?? url,
      buffer,
      manifest: {
        bytes: buffer.length,
        contentKind,
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url ?? url,
        hash,
        kind,
        ok: response.ok,
        originalError: originalError instanceof Error ? originalError.message : null,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response.status,
        tlsClientFetched: true,
        url,
      },
      ok: response.ok,
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown TLS client fetch error",
        finalUrl: url,
        kind,
        ok: false,
        originalError: originalError instanceof Error ? originalError.message : null,
        restaurantId: restaurant.id,
        status: "error",
        tlsClientFetched: true,
        url,
      },
      ok: false,
      text: "",
    };
  } finally {
    await session?.close();

    try {
      const { destroyTLS } = await runtimeImport("node-tls-client");
      await destroyTLS();
    } catch {
      // The fetch already completed; cleanup should not mask the result.
    }
  }
}

function firstHeaderValue(headers, name) {
  const direct = headers?.[name] ?? headers?.[name.toLowerCase()];

  if (Array.isArray(direct)) {
    return direct[0] ?? "";
  }

  return direct ?? "";
}

async function fetchSourceWithBrowser(url, restaurant, kind, startedAt, originalError = null) {
  let browser;

  try {
    const { chromium } = await runtimeImport("playwright-core");
    const executablePath = await getChromiumExecutablePath();
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const page = await browser.newPage({ userAgent: browserUserAgent });
    const response = await page.goto(url, {
      timeout: timeoutMs,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(5000);

    let responseBody = Buffer.alloc(0);

    if (response) {
      try {
        responseBody = Buffer.from(await response.body());
      } catch {
        responseBody = Buffer.alloc(0);
      }
    }

    const pageHtml = Buffer.from(await page.content(), "utf8");
    const buffer = responseBody.subarray(0, 4).toString() === "%PDF" ? responseBody : pageHtml;
    const contentType =
      buffer.subarray(0, 4).toString() === "%PDF"
        ? "application/pdf"
        : response?.headers()["content-type"] ?? "text/html";
    const hash = sha256(buffer);
    const ext = extensionFor(url, contentType);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.${ext}`, buffer)
      : null;
    const contentKind = detectContentKind(url, contentType, buffer);
    const text =
      contentKind === "pdf"
        ? await readPdfText(buffer)
        : ["html", "json", "xml", "text"].includes(contentKind)
          ? buffer.toString("utf8")
          : "";

    return {
      contentKind,
      finalUrl: response?.url() ?? url,
      buffer,
      manifest: {
        browserFetched: true,
        bytes: buffer.length,
        contentKind,
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response?.url() ?? url,
        hash,
        kind,
        ok: Boolean(response?.ok()),
        originalError: originalError instanceof Error ? originalError.message : null,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response?.status() ?? "browser-error",
        url,
      },
      ok: Boolean(response?.ok()),
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        browserFetched: true,
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown browser fetch error",
        finalUrl: url,
        kind,
        ok: false,
        originalError: originalError instanceof Error ? originalError.message : null,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  } finally {
    await browser?.close();
  }
}

async function getChromiumExecutablePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next browser path.
    }
  }

  const chromium = await runtimeImport("@sparticuz/chromium");
  return chromium.default.executablePath();
}

async function fetchJsonPostSource(url, restaurant, kind, body) {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      body: JSON.stringify(body),
      extraHeaders: { "content-type": "application/json" },
      method: "POST",
    });
    const text = await response.text();
    const buffer = Buffer.from(text, "utf8");
    const contentType = response.headers.get("content-type") ?? "";
    const hash = sha256(buffer);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.json`, buffer)
      : null;

    return {
      contentKind: detectContentKind(url, contentType, buffer),
      finalUrl: response.url,
      manifest: {
        bytes: buffer.length,
        contentKind: "json",
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url,
        hash,
        kind,
        ok: response.ok,
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response.status,
        url,
      },
      ok: response.ok,
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown fetch error",
        finalUrl: url,
        kind,
        ok: false,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

async function fetchJsonApiSource(url, restaurant, kind, options = {}) {
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      extraHeaders: { accept: "application/json", ...(options.extraHeaders ?? {}) },
      method: options.method ?? "GET",
    });
    const text = await response.text();
    const buffer = Buffer.from(text, "utf8");
    const contentType = response.headers.get("content-type") ?? "";
    const hash = sha256(buffer);
    const rawPath = writeRaw
      ? await writeRawSource(restaurant.id, `${hash}.json`, buffer)
      : null;
    const json = parseJsonLoose(text);

    return {
      contentKind: "json",
      finalUrl: response.url,
      json,
      manifest: {
        bytes: buffer.length,
        contentKind: "json",
        contentType,
        durationMs: Date.now() - startedAt,
        finalUrl: response.url,
        hash,
        kind,
        ok: response.ok && Boolean(json),
        rawPath: rawPath ? path.relative(projectRoot, rawPath) : null,
        restaurantId: restaurant.id,
        status: response.status,
        url,
      },
      ok: response.ok && Boolean(json),
      text,
    };
  } catch (error) {
    return {
      contentKind: "error",
      finalUrl: url,
      json: null,
      manifest: {
        contentKind: "error",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown fetch error",
        finalUrl: url,
        kind,
        ok: false,
        restaurantId: restaurant.id,
        status: "error",
        url,
      },
      ok: false,
      text: "",
    };
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      body: options.body,
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "Ocp-Apim-Subscription-Key": "937624593c7048759a9657d6cb705a2b",
        "user-agent": userAgent,
        ...(options.extraHeaders ?? {}),
      },
      method: options.method ?? "GET",
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function writeRawSource(restaurantId, filename, buffer) {
  const directory = path.join(rawDir, restaurantId, rawDate);
  const output = path.join(directory, filename);
  await mkdir(directory, { recursive: true });
  await writeFile(output, buffer);
  return output;
}

async function readPdfText(buffer) {
  const { PDFParse } = await getPdfParse();
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function extractHtmlItems(html, restaurant, url, kind = sourceTypes.menu) {
  const $ = cheerio.load(html);
  const baseUrl = url;
  const adapter = getBrandAdapter(restaurant.id);
  const records = [];
  const productLinks = [];

  records.push(...extractJsonItemsFromHtml($, restaurant, baseUrl, kind));
  records.push(...extractBrandHtmlItems($, restaurant, baseUrl, kind));
  records.push(...extractHtmlAllergenMatrixItems($, restaurant, baseUrl, kind));

  if (adapter.allowGenericDomMenu || kind === sourceTypes.allergen) {
    const domResult = extractDomMenuItems($, restaurant, baseUrl, kind);
    records.push(...domResult.items);
    productLinks.push(...domResult.productLinks);
  }

  return {
    apiLinks: extractApiLinks($, baseUrl),
    discoveredDocuments: extractDocumentLinks($, baseUrl),
    items: records,
    productLinks: uniqueBy(productLinks, (link) => normalizeUrl(link.url)).slice(0, 150),
  };
}

function extractBrandHtmlItems($, restaurant, url, kind) {
  if (restaurant.id === "pf-changs" && kind === sourceTypes.allergen) {
    return extractPfChangsAllergenItems($, restaurant, url);
  }

  if (restaurant.id === "nothing-bundt-cakes" && kind === sourceTypes.allergen) {
    return extractNothingBundtCakesIngredientItems($, restaurant, url);
  }

  if (restaurant.id === "chick-fil-a" && kind === sourceTypes.allergen) {
    return extractChickFilAAllergenItems($, restaurant, url);
  }

  if (restaurant.id === "dairy-queen" && kind === sourceTypes.allergen) {
    return extractDairyQueenAllergenItems($, restaurant, url);
  }

  if (restaurant.id === "freddys" && kind === sourceTypes.allergen) {
    return extractFreddysAllergenItems($, restaurant, url);
  }

  return [];
}

function extractPfChangsAllergenItems($, restaurant, url) {
  const records = [];

  $("table").each((_tableIndex, table) => {
    const rows = $(table)
      .find("tr")
      .toArray()
      .map((row) =>
        $(row)
          .find("th,td")
          .toArray()
          .map((cell) => cleanText($(cell).text()) ?? ""),
      )
      .filter((cells) => cells.some(Boolean));
    const header = rows[0] ?? [];
    const allergenColumns = header.map((cell, index) => ({
      allergens: normalizeProviderAllergens([cell]),
      index,
    }));

    if (allergenColumns.slice(1).filter((column) => column.allergens.length > 0).length < 6) {
      return;
    }

    const category =
      cleanText($(table).prevAll("h2,h3,h4").first().text()) ??
      cleanText($(table).parent().prevAll("h2,h3,h4").first().text()) ??
      restaurant.category;

    for (const cells of rows.slice(1)) {
      const name = cleanText(cells[0]);

      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      const allergens = [];

      for (const column of allergenColumns) {
        if (column.index === 0 || column.allergens.length === 0) {
          continue;
        }

        if (/x|yes|contains|✔|✓|●/i.test(cells[column.index] ?? "")) {
          allergens.push(...column.allergens);
        }
      }

      if (allergens.length === 0 && /^[A-Z '&-]+$/.test(name)) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category,
          description: "Official P.F. Chang's allergen matrix.",
          imageUrl: null,
          mayContain: [],
          name,
          sourceKind: "html-allergen-matrix",
          sourceUrl: url,
          variantGroup: category,
        }),
      );
    }
  });

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function extractNothingBundtCakesIngredientItems($, restaurant, url) {
  const text = cleanText($("body").text()) ?? "";
  const records = [];
  const pattern = /([A-Z][A-Za-z0-9 '&®™.-]{2,80})›\s*INGREDIENTS:\s*([\s\S]*?)(?=(?:[A-Z][A-Za-z0-9 '&®™.-]{2,80})›\s*INGREDIENTS:|$)/g;
  let match;

  while ((match = pattern.exec(text))) {
    const name = cleanText(match[1].split(/\.\s+/).pop());
    const ingredientsText = cleanText(`INGREDIENTS: ${match[2]}`);

    if (!name || !ingredientsText || !isProbablyMenuItemName(name)) {
      continue;
    }

    const containsText = ingredientsText.match(/\bCONTAINS:\s*([^.]*)/i)?.[1] ?? "";
    const mayContainText = ingredientsText.match(/\bMAY CONTAIN(?: TRACES OF)?:\s*([^.]*)/i)?.[1] ?? "";

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: uniqueStrings([
          ...findAllergensInText(containsText),
          ...findDeclaredAllergensOnly(containsText),
        ]),
        category: "Cake Flavors",
        description: "Official Nothing Bundt Cakes ingredients list.",
        imageUrl: null,
        ingredientsText,
        mayContain: uniqueStrings([
          ...findMayContainAllergens(mayContainText),
          ...findAllergensInText(mayContainText),
        ]),
        name,
        sourceKind: "html-ingredients",
        sourceUrl: url,
        variantGroup: "Cake Flavors",
      }),
    );
  }

  return uniqueBy(records, (record) => record.name);
}

function extractFreddysAllergenItems($, restaurant, url) {
  const allergenLabels = [
    ["Peanuts", ["peanut"]],
    ["Tree Nuts", ["tree-nut"]],
    ["Egg", ["egg"]],
    ["Milk", ["milk"]],
    ["Wheat/Gluten", ["wheat", "gluten"]],
    ["Soybean", ["soy"]],
    ["Fish", ["fish"]],
    ["Shellfish", ["shellfish"]],
    ["Sesame", ["sesame"]],
  ];
  const records = [];

  $("article.node--type-nutrition-info").each((_articleIndex, article) => {
    const category = cleanText($(article).find("h2 span").first().text()) ?? restaurant.category;

    $(article)
      .find(".paragraph--type--allergen-item")
      .each((_itemIndex, item) => {
        const rowText = cleanText($(item).text()) ?? "";
        const firstAllergenIndex = rowText.search(/\bPeanuts\b/);
        const name = cleanText(firstAllergenIndex > 0 ? rowText.slice(0, firstAllergenIndex) : "");

        if (!name || !isProbablyMenuItemName(name)) {
          return;
        }

        const allergens = [];
        const mayContain = [];

        for (let index = 0; index < allergenLabels.length; index += 1) {
          const [label, mapped] = allergenLabels[index];
          const nextLabel = allergenLabels[index + 1]?.[0];
          const start = rowText.indexOf(label);

          if (start < 0) {
            continue;
          }

          const end = nextLabel ? rowText.indexOf(nextLabel, start + label.length) : rowText.length;
          const status = rowText.slice(start + label.length, end > start ? end : rowText.length);

          if (/Allergen Exists/i.test(status)) {
            allergens.push(...mapped);
          } else if (/Disclaimer|\*/i.test(status)) {
            mayContain.push(...mapped);
          }
        }

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens,
            category,
            description: "Official Freddy's nutritional and allergen info table.",
            imageUrl: null,
            mayContain,
            name,
            sourceKind: "html-allergen-matrix",
            sourceUrl: url,
            variantGroup: category,
          }),
        );
      });
  });

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function extractDairyQueenAllergenItems($, restaurant, url) {
  const records = [];

  $("table").each((_tableIndex, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .find("th,td")
      .map((_index, cell) => cleanText($(cell).text()) ?? "")
      .get();
    const itemIndex = headers.findIndex((header) => /^menu item$/i.test(header));
    const allergenIndex = headers.findIndex((header) => /^allergens$/i.test(header));

    if (itemIndex < 0 || allergenIndex < 0) {
      return;
    }

    const category =
      cleanText($(table).prevAll("h3").first().text())?.replace(/\s*\(See table footer for legend\)$/i, "") ??
      restaurant.category;

    $(table)
      .find("tr")
      .slice(1)
      .each((_rowIndex, row) => {
        const cells = $(row)
          .find("th,td")
          .map((_cellIndex, cell) => cleanText($(cell).text()) ?? "")
          .get();
        const name = cells[itemIndex];

        if (!name || !isProbablyMenuItemName(name)) {
          return;
        }

        const { allergens, mayContain } = dairyQueenAllergenCodes(cells[allergenIndex] ?? "");

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens,
            category,
            description: "Official Dairy Queen nutrition facts and allergy information table.",
            imageUrl: null,
            mayContain,
            name,
            sourceKind: "html-allergen-matrix",
            sourceUrl: url,
          }),
        );
      });
  });

  return records;
}

function dairyQueenAllergenCodes(value) {
  const map = new Map([
    ["E", "egg"],
    ["F", "fish"],
    ["M", "milk"],
    ["P", "peanut"],
    ["S", "soy"],
    ["SF", "shellfish"],
    ["SS", "sesame"],
    ["T", "tree-nut"],
    ["W", "wheat"],
  ]);
  const direct = [];
  const mayContain = [];
  const normalized = String(value).replaceAll("/", "\\");
  const tokenPattern = /\((SF|SS|[EFMPSTW])\)|(SF|SS|[EFMPSTW])/g;
  let match;

  while ((match = tokenPattern.exec(normalized))) {
    const isMayContain = Boolean(match[1]);
    const allergen = map.get(match[1] ?? match[2]);

    if (!allergen) {
      continue;
    }

    if (isMayContain) {
      mayContain.push(allergen);
    } else {
      direct.push(allergen);
    }
  }

  return {
    allergens: uniqueStrings(direct),
    mayContain: uniqueStrings(mayContain),
  };
}

function extractXmlItems(text, restaurant, url, kind = sourceTypes.api) {
  if (restaurant.id === "dominos" && kind === sourceTypes.allergen) {
    return extractDominosAllergenXmlItems(text, restaurant, url);
  }

  return [];
}

function extractDominosAllergenXmlItems(text, restaurant, url) {
  const $ = cheerio.load(text, { xmlMode: true });
  const allergenKeys = new Map([
    ["milk", "milk"],
    ["egg", "egg"],
    ["fish", "fish"],
    ["shellfish", "shellfish"],
    ["wheat", "wheat"],
    ["soy", "soy"],
    ["peanuts", "peanut"],
    ["nuts", "tree-nut"],
    ["sesame", "sesame"],
  ]);
  const records = [];

  $("menuSet[type='food-items'] item").each((_index, element) => {
    const $item = $(element);
    const name = cleanText($item.attr("title"));

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    const allergens = [];
    const mayContain = [];

    for (const [attribute, allergen] of allergenKeys) {
      const value = String($item.attr(attribute) ?? "").toLowerCase();

      if (value === "full") {
        allergens.push(allergen);
      } else if (value === "part" || value === "diamond") {
        mayContain.push(allergen);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: restaurant.category,
        description: "Official Domino's allergen XML chart.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "official-api",
        sourceUrl: url,
      }),
    );
  });

  return records;
}

function extractChickFilAAllergenItems($, restaurant, url) {
  const text = $(
    "script[type='application/json']#wp-script-module-data-\\@wordpress\\/interactivity",
  )
    .contents()
    .text()
    .trim();
  const parsed = parseJsonLoose(text);
  const sections = parsed?.state?.["nutrition-allergens-table-store"]?.tableData?.allergens;

  if (!Array.isArray(sections)) {
    return [];
  }

  const records = [];

  for (const section of sections) {
    const category = cleanText(section?.menu) ?? restaurant.category;

    for (const item of section?.items ?? []) {
      const name = cleanText(item?.title);

      if (!name || !isProbablyMenuItemName(name)) {
        continue;
      }

      const allergens = [];

      for (const field of item.fields ?? []) {
        if (String(field?.value ?? "") !== "1") {
          continue;
        }

        allergens.push(...normalizeProviderAllergens([field.key, field.label]));
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category,
          description: "Official Chick-fil-A nutrition and allergens table.",
          imageUrl: null,
          mayContain: [],
          name,
          sourceKind: "official-api",
          sourceUrl: item.link ?? url,
        }),
      );
    }
  }

  return records;
}

function extractOfficialApiItems(text, restaurant, url, kind = sourceTypes.api) {
  const parsed = parseJsonLoose(text);

  if (!parsed) {
    return [];
  }

  return [
    ...extractProviderAllergenRecords(parsed, restaurant, url),
    ...extractRecordsFromObject(parsed, restaurant, url, "official-api", kind),
  ];
}

function extractProviderAllergenRecords(parsed, restaurant, url) {
  const nodes = Array.isArray(parsed?.allergens)
    ? parsed.allergens
    : Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed)
        ? parsed
        : [];

  return nodes
    .map((node) => {
      const name = pickString(node?.name) ?? pickString(node?.title) ?? pickString(node?.displayName);

      if (!name || !isProbablyMenuItemName(name) || !Array.isArray(node?.allergens)) {
        return null;
      }

      const allergens = normalizeProviderAllergens(node.allergens);

      return createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: restaurant.category,
        description:
          allergens.length > 0
            ? `Official allergen flags: ${allergens.join(", ")}.`
            : "Official allergen source lists no major allergens for this item.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "official-api",
        sourceUrl: url,
      });
    })
    .filter(Boolean);
}

function extractHtmlAllergenMatrixItems($, restaurant, url, kind) {
  if (kind !== sourceTypes.allergen) {
    return [];
  }

  const records = [];

  $("table").each((_tableIndex, table) => {
    const rows = $(table)
      .find("tr")
      .toArray()
      .map((row) =>
        $(row)
          .find("th,td")
          .toArray()
          .map((cell) => cleanText($(cell).text()) ?? ""),
      )
      .filter((cells) => cells.some(Boolean));
    const header = rows.find((cells) => {
      const allergenColumnCount = cells.slice(1).filter((cell) => findAllergensInText(cell).length > 0).length;
      return /^item$/i.test(cells[0] ?? "") && allergenColumnCount >= 3;
    });

    if (!header) {
      return;
    }

    const headerIndex = rows.indexOf(header);
    const allergenColumns = header.map((cell, index) => ({
      allergens: findAllergensInText(cell),
      index,
    }));
    let currentCategory = restaurant.category;

    for (const cells of rows.slice(headerIndex + 1)) {
      const name = cleanText(cells[0]);

      if (!name) {
        continue;
      }

      if (cells.length === 1 || cells.slice(1).every((cell) => !cell)) {
        currentCategory = name;
        continue;
      }

      if (!isProbablyMenuItemName(name)) {
        continue;
      }

      const direct = [];
      const mayContain = [];

      for (const column of allergenColumns) {
        if (column.index === 0 || column.allergens.length === 0) {
          continue;
        }

        const cell = cells[column.index] ?? "";

        if (/may|x/i.test(cell)) {
          mayContain.push(...column.allergens);
        } else if (/✔|✓|●|x|yes|contains/i.test(cell)) {
          direct.push(...column.allergens);
        }
      }

      if (direct.length === 0 && mayContain.length === 0) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: direct,
          category: currentCategory,
          description: "Official allergen matrix.",
          imageUrl: null,
          mayContain,
          name,
          sourceKind: "html-allergen-matrix",
          sourceUrl: url,
        }),
      );
    }
  });

  return records;
}

function extractJsonItemsFromHtml($, restaurant, url, kind = sourceTypes.menu) {
  const records = [];

  $("script[type='application/ld+json'], script#__NEXT_DATA__, script[type='application/json']").each(
    (_index, element) => {
      const text = $(element).contents().text().trim();
      const parsed = parseJsonLoose(text);

      if (parsed) {
        records.push(...extractRecordsFromObject(parsed, restaurant, url, "json-structured", kind));
      }
    },
  );

  $("script").each((_index, element) => {
    const text = $(element).contents().text();
    const jsonParsePattern = /JSON\.parse\("((?:\\.|[^"\\])*)"\)/g;
    let match;

    while ((match = jsonParsePattern.exec(text))) {
      const decoded = decodeJavaScriptString(match[1]);
      const parsed = parseJsonLoose(decodeHtml(decoded));

      if (parsed) {
        records.push(...extractRecordsFromObject(parsed, restaurant, url, "json-structured", kind));
      }
    }
  });

  return records;
}

function extractRecordsFromObject(
  value,
  restaurant,
  url,
  sourceKind,
  kind = sourceTypes.menu,
  inheritedCategory = null,
) {
  const records = [];
  const stack = [{ value, inheritedCategory }];

  while (stack.length > 0) {
    const current = stack.pop();

    if (!current) {
      continue;
    }

    const node = current.value;

    if (Array.isArray(node)) {
      for (const item of node) {
        stack.push({ value: item, inheritedCategory: current.inheritedCategory });
      }

      continue;
    }

    if (!node || typeof node !== "object") {
      continue;
    }

    const nextCategory =
      pickString(node.category) ??
      pickString(node.menuCategory) ??
      pickString(node.section) ??
      pickString(node.groupName) ??
      pickString(node.collectionName) ??
      current.inheritedCategory;

    const name =
      pickString(node.name) ??
      pickString(node.title) ??
      pickString(node.displayName) ??
      pickString(node.productName) ??
      pickString(node.itemName);
    const description =
      pickString(node.description) ??
      pickString(node.shortDescription) ??
      pickString(node.longDescription) ??
      pickString(node.subtitle) ??
      null;
    const imageUrl = absolutizeUrl(
      pickImage(node.image) ??
        pickImage(node.images) ??
        pickString(node.imageUrl) ??
        pickString(node.desktopImageUrl) ??
        pickString(node.mobileImageUrl),
      url,
    );
    const href = absolutizeUrl(
      pickString(node.url) ?? pickString(node.href) ?? pickString(node.link),
      url,
    );
    const disclosure = getOfficialFoodDisclosure(node, kind);

    if (
      name &&
      isProbablyMenuItemName(name) &&
      (description || imageUrl || href || disclosure.directAllergens.length > 0)
    ) {
      records.push(
        createRecord({
          allergenSourceType: disclosure.allergenSourceType,
          allergens: disclosure.directAllergens,
          category: cleanText(nextCategory) ?? inferCategoryFromUrl(href ?? url) ?? restaurant.category,
          description,
          imageUrl,
          ingredientsText: disclosure.ingredientsText,
          mayContain: disclosure.mayContain,
          name,
          sourceKind,
          sourceUrl: href ?? url,
        }),
      );
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === "__typename" || key === "@context") {
        continue;
      }

      stack.push({ value: child, inheritedCategory: nextCategory });
    }
  }

  return records;
}

function extractDomMenuItems($, restaurant, url, kind = sourceTypes.menu) {
  const items = [];
  const productLinks = [];
  const cardSelectors = [
    ".cmp-category__item",
    "[class*='menu-item']",
    "[class*='MenuItem']",
    "[class*='product-card']",
    "[class*='ProductCard']",
    "[class*='productCard']",
    "[class*='ProductTile']",
    "[class*='menu-card']",
    "article",
  ];

  $(cardSelectors.join(",")).each((_index, element) => {
    const $element = $(element);
    const name =
      cleanText(
        $element
          .find(
            "[class*='item-name'], [class*='product-name'], [class*='title'], h2, h3, h4, a",
          )
          .first()
          .text(),
      ) ?? cleanText($element.attr("aria-label"));

    if (!name || !isProbablyMenuItemName(name)) {
      return;
    }

    const link = absolutizeUrl(
      $element.find("a[href]").first().attr("href") ?? $element.closest("a[href]").attr("href"),
      url,
    );
    const description = cleanText(
      $element.find("[class*='description'], [class*='copy'], p").first().text(),
    );
    const imageUrl = absolutizeUrl(
      $element.find("img").first().attr("src") ??
        $element.find("img").first().attr("data-src") ??
        $element.find("source").first().attr("srcset")?.split(" ")[0],
      url,
    );
    const disclosure = getScopedDomDisclosure($element, kind);

    if (
      kind === sourceTypes.allergen &&
      disclosure.allergenSourceType === allergenSourceTypes.unavailable
    ) {
      return;
    }

    const record = createRecord({
      allergenSourceType: disclosure.allergenSourceType,
      allergens: disclosure.directAllergens,
      category: inferCategoryFromUrl(link ?? url) ?? restaurant.category,
      description,
      imageUrl,
      ingredientsText: disclosure.ingredientsText,
      mayContain: disclosure.mayContain,
      name,
      sourceKind: "html-card",
      sourceUrl: link ?? url,
    });

    items.push(record);

    if (link) {
      productLinks.push({ name, url: link });
    }
  });

  $("a[href]").each((_index, element) => {
    const $element = $(element);
    const name = cleanText($element.text()) ?? cleanText($element.attr("aria-label"));
    const href = absolutizeUrl($element.attr("href"), url);

    if (!href || !name || !isLikelyProductHref(href) || !isProbablyMenuItemName(name)) {
      return;
    }

    if (kind !== sourceTypes.allergen) {
      items.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.unavailable,
          allergens: [],
          category: inferCategoryFromUrl(href) ?? restaurant.category,
          description: null,
          imageUrl: absolutizeUrl(
            $element.find("img").first().attr("src") ??
              $element.find("img").first().attr("data-src"),
            url,
          ),
          mayContain: [],
          name,
          sourceKind: "html-link",
          sourceUrl: href,
        }),
      );
      productLinks.push({ name, url: href });
    }
  });

  return {
    items,
    productLinks,
  };
}

function extractProductPageItem(html, restaurant, url, fallbackName) {
  const $ = cheerio.load(html);
  const title =
    cleanText($("h1").first().text()) ??
    cleanText($("meta[property='og:title']").attr("content")) ??
    fallbackName;
  const description =
    cleanText($("meta[name='description']").attr("content")) ??
    cleanText($("meta[property='og:description']").attr("content")) ??
    cleanText(
      $("[class*='description'], [class*='Description'], [class*='details'], main p")
        .first()
        .text(),
    );
  const imageUrl = absolutizeUrl(
    $("meta[property='og:image']").attr("content") ??
      $("main img").first().attr("src") ??
      $("img").first().attr("src"),
    url,
  );
  const allergenText = [
    $("#allergensInfo").text(),
    $("[class*='allergen'], [id*='allergen']").text(),
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  const structuredRecords = extractJsonItemsFromHtml($, restaurant, url, sourceTypes.allergen);
  const matchingStructured = structuredRecords.find(
    (record) => similarityKey(record.name) === similarityKey(title),
  );

  if (!title || !isProbablyMenuItemName(title)) {
    return null;
  }

  return createRecord({
    allergens: uniqueStrings([
      ...(matchingStructured?.allergens ?? []),
      ...findDeclaredAllergensOnly(allergenText),
    ]),
    allergenSourceType:
      allergenText ||
      (matchingStructured?.allergenSourceType &&
        matchingStructured.allergenSourceType !== allergenSourceTypes.unavailable)
        ? allergenSourceTypes.officialProductAllergenSection
        : allergenSourceTypes.unavailable,
    category: inferCategoryFromUrl(url) ?? matchingStructured?.category ?? restaurant.category,
    description: description ?? matchingStructured?.description ?? null,
    imageUrl: imageUrl ?? matchingStructured?.imageUrl ?? null,
    ingredientsText: matchingStructured?.ingredientsText ?? null,
    mayContain: uniqueStrings([
      ...(matchingStructured?.mayContain ?? []),
      ...findMayContainAllergens(allergenText),
    ]),
    name: title,
    sourceKind: "product-page",
    sourceUrl: url,
  });
}

async function extractPdfItems(text, restaurant, url, buffer) {
  const brandRecords = await extractBrandPdfItems(text, restaurant, url, buffer);

  if (brandRecords.length > 0) {
    return brandRecords;
  }

  const records = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+\t/g, "\t").replace(/\t\s+/g, "\t").trim())
    .filter(Boolean);
  let currentCategory = restaurant.category;

  for (const line of lines) {
    const cleanLine = cleanText(line);

    if (!cleanLine) {
      continue;
    }

    if (isCategoryLine(cleanLine)) {
      currentCategory = titleCase(cleanLine);
      continue;
    }

    const tabParts = line.split(/\t+/).map(cleanText).filter(Boolean);
    let name = null;
    let detail = null;

    if (tabParts.length >= 2) {
      name = tabParts[0];
      detail = tabParts.slice(1).join(" ");
    } else {
      const containsIndex = cleanLine.search(/\b(?:contains|may contain|allergens?)\b/i);
      const prefix = containsIndex > 3 ? cleanLine.slice(0, containsIndex).trim() : "";
      const splitMatch = prefix.match(/^(.{2,90}?)(?:\s{2,}| - |: )/);
      name = splitMatch?.[1] ?? null;
      detail = cleanLine;
    }

    if (!name || !detail || !isProbablyMenuItemName(name)) {
      continue;
    }

    const direct = findAllergensInDeclaredFoodText(detail);
    const mayContain = findMayContainAllergens(detail);

    if (direct.length === 0 && mayContain.length === 0 && !/\bingredients?\b/i.test(detail)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType:
          /\ballergens?\b/i.test(detail)
            ? allergenSourceTypes.officialAllergenMenu
            : allergenSourceTypes.officialIngredients,
        allergens: direct,
        category: currentCategory,
        description: summarizeIngredientText(detail),
        imageUrl: null,
        ingredientsText: detail,
        mayContain,
        name,
        sourceKind: "pdf-ingredients",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

async function extractBrandPdfItems(text, restaurant, url, buffer) {
  if (restaurant.id === "subway" && buffer) {
    return extractSubwayPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "panda-express" && buffer) {
    return extractPandaExpressPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "zaxbys" && buffer) {
    return extractZaxbysPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "dunkin" && /allergy_ingredient_guide\.pdf/i.test(url)) {
    return extractDunkinAllergyIngredientPdfItems(text, restaurant, url);
  }

  if (restaurant.id === "panera" && /allergen-guide/i.test(url) && buffer) {
    return extractPaneraAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "arbys" && /Nutritional_and_Allergen/i.test(url)) {
    return extractArbysAllergenPdfItems(text, restaurant, url);
  }

  if (restaurant.id === "arbys" && /Menu_Items_and_Ingredients/i.test(url)) {
    return extractArbysIngredientsPdfItems(text, restaurant, url);
  }

  if (restaurant.id === "little-caesars" && buffer) {
    return extractLittleCaesarsPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "wingstop" && buffer) {
    return extractWingstopPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "sonic" && /NationalAllergenGuide/i.test(url) && buffer) {
    return extractSonicAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "olive-garden" && /allergen_guide/i.test(url) && buffer) {
    return extractOliveGardenAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "longhorn-steakhouse" && /longhorn_allergen_guide/i.test(url) && buffer) {
    return extractLongHornAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "outback-steakhouse" && /Full-Allergens-Information/i.test(url) && buffer) {
    return extractOutbackAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "first-watch" && /allergenguide/i.test(url) && buffer) {
    return extractFirstWatchAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "cracker-barrel" && /AllergenGuide\.pdf/i.test(url) && buffer) {
    return extractCrackerBarrelAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "buffalo-wild-wings" && /BWW_Allergen/i.test(url) && buffer) {
    return extractBuffaloWildWingsAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "red-lobster" && /Allergen.*Guide/i.test(url) && buffer) {
    return extractRedLobsterAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "dennys" && /AllergenGuide/i.test(url) && buffer) {
    return extractDennysAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "waffle-house" && /Menu-Nutritionals/i.test(url)) {
    return extractWaffleHouseNutritionPdfItems(text, restaurant, url);
  }

  if (restaurant.id === "jack-in-the-box" && buffer) {
    return extractJackInTheBoxPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "raising-canes") {
    return extractRaisingCanesPdfItems(text, restaurant, url);
  }

  if (restaurant.id === "in-n-out") {
    return extractInNOutPdfItems(text, restaurant, url);
  }

  if (["carls-jr", "hardees"].includes(restaurant.id) && /nutrition/i.test(text)) {
    return extractCkeNutritionCodePdfItems(text, restaurant, url);
  }

  if (restaurant.id === "el-pollo-loco" && buffer) {
    return extractElPolloLocoNutritionPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "bjs-restaurant" && /GLUTEN_ALLERGEN/i.test(url) && buffer) {
    return extractBjsAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "tropical-smoothie-cafe" && /nutrition/i.test(text)) {
    return extractTropicalSmoothieNutritionPdfItems(text, restaurant, url);
  }

  if (restaurant.id === "qdoba" && buffer) {
    return extractQdobaAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "del-taco" && /allergens-\d{2}-\d{4}\.pdf/i.test(url) && buffer) {
    return extractDelTacoAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "cava" && /AllergReg\.pdf/i.test(url) && buffer) {
    return extractCavaAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "yard-house" && /Yard_House_Allergen_Guide/i.test(url) && buffer) {
    return extractYardHouseAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "cheddars" && /Cheddars_Allergen_Guide/i.test(url) && buffer) {
    return extractCheddarsAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "auntie-annes" && /Food-Allergens-and-Sensitivities-Chart\.pdf/i.test(url) && buffer) {
    return extractAuntieAnnesAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "tim-hortons" && /Allergen-Guide/i.test(url) && buffer) {
    return extractTimHortonsAllergenPdfItems(buffer, restaurant, url);
  }

  if (restaurant.id === "shake-shack" && /Master.*Nut.*Allergen|document\/3481/i.test(url)) {
    return extractShakeShackNutritionAllergenPdfItems(text, restaurant, url);
  }

  return [];
}

function extractShakeShackNutritionAllergenPdfItems(text, restaurant, url) {
  const records = [];
  const normalizedText = text
    .replace(/\r/g, "")
    .replace(/[™®]/g, "")
    .replace(/[ \t]+/g, " ");
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  let currentCategory = restaurant.category;

  for (const line of lines) {
    const category = shakeShackCategoryHeading(line);

    if (category) {
      currentCategory = category;
      continue;
    }

    const containsMatch = line.match(
      /^(.{2,120}?)\s+Contains:\s+([A-Za-z, ]+?)(?=\s+\d+(?:\.\d+)?(?:\s|$)|$)/i,
    );

    const nutritionOnlyMatch = containsMatch
      ? null
      : line.match(/^(.{2,120}?)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+/);
    const name = cleanShakeShackPdfName(containsMatch?.[1] ?? nutritionOnlyMatch?.[1]);
    const allergenText = cleanText(containsMatch?.[2]);
    const allergens = allergenText ? findAllergensInText(allergenText) : [];

    if (!name || !isProbablyMenuItemName(name) || isShakeShackPdfNoiseName(name)) {
      continue;
    }
    const categoryForItem = shakeShackCategoryForItem(name, currentCategory);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: categoryForItem,
        description: "Official Shake Shack nutrition and allergen information.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: categoryForItem,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanShakeShackPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+/g, " ")
    .replace(/\s+\*+$/g, "")
    .trim();
}

function isShakeShackPdfNoiseName(value) {
  return /^(?:Calories|Total Fat|Sat Fat|Trans Fat|Cholesterol|Sodium|Total|Carbohydrates|Fiber|Sugars|Protein|Calories per serving|-- \d+ of \d+ --)$/i.test(
    value,
  );
}

function shakeShackCategoryForItem(name, fallbackCategory) {
  if (/^Add .*(?:Dressing|Croutons|Parmesan|Grilled Chicken|Balsamic|Ceaser|Caesar|Sweety Drop)/i.test(name)) {
    return "Salads";
  }

  if (/^Add .*(?:Sauce|Pickles|Slaw|Honey|Seasoning|Peppers|Jalapenos|Onions|Breadcrumbs|Tartar)/i.test(name)) {
    return "Extras";
  }

  if (/Lettuce Wrap|Gluten Free Bun/i.test(name)) {
    return "Lettuce Wraps & Gluten Free Buns";
  }

  if (/(?:Beer|Ale|IPA|Lager|Pilsner|Cocktail|Vodka|Rum|Gin|Tequila|Whiskey|Bourbon|Martini|Spritz|Mixer|Mai Tai|Shackarita|Red Bull|Club Soda|Tonic|Ginger Beer|Wine|Seltzer|Cider|Draft|Can \\(|Bottle\\))/i.test(name)) {
    return "Beer, Wines, Cocktails & Non-Alcoholic Drinks";
  }

  return fallbackCategory;
}

function shakeShackCategoryHeading(line) {
  const headings = new Set([
    "Burgers",
    "Chicken",
    "Crinkle Cut Fries",
    "Fries & Sides",
    "Extras",
    "Flat-Top Dogs",
    "Breakfast",
    "Shakes",
    "Cups & Sundaes",
    "Salads",
    "Lettuce Wraps & Gluten Free Buns",
    "Frozen Custard",
    "Drinks",
    "Lemonades",
    "Beer, Wines, Cocktails & Non-Alcoholic Drinks",
    "Regional Beers",
    "Beer, Wines & Cocktails",
    "Retail",
    "Woof",
  ]);
  const normalized = cleanText(line)
    ?.replace(/[™®]/g, "")
    .replace(/\s*-\s*/g, "-");

  return headings.has(normalized) ? normalized : null;
}

function extractCkeNutritionCodePdfItems(text, restaurant, url) {
  const codeMap = new Map([
    ["E", "egg"],
    ["F", "fish"],
    ["M", "milk"],
    ["P", "peanut"],
    ["SF", "shellfish"],
    ["S", "soy"],
    ["T", "tree-nut"],
    ["W", "wheat"],
    ["SS", "sesame"],
  ]);
  const records = [];
  let currentCategory = restaurant.category;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+\t/g, "\t").replace(/\t\s+/g, "\t").trim();
    const cleanLine = cleanText(line);

    if (!cleanLine) {
      continue;
    }

    if (isCategoryLine(cleanLine)) {
      currentCategory = titleCase(cleanLine);
      continue;
    }

    const parts = line.split(/\t+/).map(cleanText).filter(Boolean);
    const allergenIndex = parts.findIndex((part) =>
      /^(?:E|F|M|P|SF|S|T|W|SS)(?:\s*,\s*(?:E|F|M|P|SF|S|T|W|SS))*\+?$/i.test(
        part.replace(/\s+/g, ""),
      ),
    );

    if (allergenIndex <= 0) {
      continue;
    }

    const name = cleanCkeNutritionName(parts.slice(0, allergenIndex).join(" "));

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    const codes = parts[allergenIndex].replace(/\s+/g, "").replace(/\+$/, "").split(",");
    const allergens = codes.map((code) => codeMap.get(code.toUpperCase())).filter(Boolean);
    const mayContain =
      /\+/.test(parts[allergenIndex]) || /shakes? and malts/i.test(name)
        ? ["peanut", "tree-nut"]
        : [];

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: `Official ${restaurant.name} nutrition PDF allergen code row.`,
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanCkeNutritionName(value) {
  return cleanText(value)
    ?.replace(/\s{2,}/g, " ")
    .replace(/\s+\((?:\d+|oz\.?|pc|pieces?)\)\s*$/i, "")
    .trim();
}

async function extractElPolloLocoNutritionPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const columns = [
    { allergen: "egg", x: 455 },
    { allergen: "fish", x: 479 },
    { allergen: "milk", x: 505 },
    { allergen: "peanut", x: 533 },
    { allergen: "sesame", x: 560 },
    { allergen: "shellfish", x: 589 },
    { allergen: "soy", x: 618 },
    { allergen: "tree-nut", x: 647 },
    { allergen: "wheat", x: 676 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanText(
      row.items
        .filter((item) => item.x < 430)
        .map((item) => item.str)
        .join(" "),
    );
    const name = cleanElPolloLocoPdfName(leftText);

    if (!name || isElPolloLocoPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter((item) => /^X$/i.test(item.str) && item.x >= 430);

    if (markers.length === 0 && isCategoryLine(name)) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 16))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official El Pollo Loco nutrition guide allergen matrix.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanElPolloLocoPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+\*+$/, "")
    .replace(/\bTM\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isElPolloLocoPdfNoise(rowText, name) {
  return /^(?:Serving Size|Total Calories|Calories from Fat|Total Fat|Saturated Fat|Trans Fat|Cholesterol|Sodium|Total Carbohydrates|Dietary Fiber|Sugars|Protein|Egg|Fish|Milk|Peanut|Sesame|Shellfish|Soy|Tree Nuts|Wheat|NUTRITION GUIDE|All nutritional information|The allergen information|M\d+ \d{4})/i.test(
    rowText,
  ) || /^(?:FEATURED|PROTEIN-PACKED|FIRE-GRILLED CHICKEN|SIDES \(Small\) & SAUCES|TOSTADAS & SALADS|BURRITOS|QUESADILLAS|DESSERTS|DRINKS)$/i.test(
    name,
  );
}

function closestAllergenColumn(x, columns, tolerance) {
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= tolerance ? closest.allergen : null;
}

async function extractBjsAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 6);
  const columns = [
    { allergen: "egg", x: 256 },
    { allergen: "fish", x: 285 },
    { allergen: "milk", x: 315 },
    { allergen: "peanut", x: 369 },
    { allergen: "gluten", x: 394 },
    { allergen: "shellfish", x: 427 },
    { allergen: "soy", x: 461 },
    { allergen: "sulfites", x: 486 },
    { allergen: "tree-nut", x: 514 },
    { allergen: "wheat", x: 546 },
    { allergen: "sesame", x: 578 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let lastBaseName = null;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanText(
      row.items
        .filter((item) => item.x < 245)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText || isBjsPdfNoise(rowText, leftText)) {
      continue;
    }

    const markers = row.items.filter((item) => /^•$/.test(item.str) && item.x >= 245);

    if (markers.length === 0) {
      if (isCategoryLine(leftText) || /^[A-Z][A-Z\s&'/-]+(?: cont\.)?$/i.test(leftText)) {
        currentCategory = titleCase(leftText.replace(/\s+cont\.$/i, ""));
      } else if (!/^Choice\b/i.test(leftText)) {
        lastBaseName = leftText;
      }
      continue;
    }

    const name = cleanBjsPdfName(/^Choice\b/i.test(leftText) && lastBaseName ? `${lastBaseName} ${leftText}` : leftText);

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    if (!/^Choice\b/i.test(leftText)) {
      lastBaseName = leftText;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 16))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official BJ's Restaurant & Brewhouse allergen sensitivities PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanBjsPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+/g, " ")
    .replace(/\s+\(TEST\)$/i, "")
    .trim();
}

function isBjsPdfNoise(rowText, name) {
  return /^(?:FOOD ALLERGEN|AND GLUTEN|MAY 20\d{2}|-- \d+ of \d+ --|GA_\d+|Sesame Seeds|Eggs|Peanuts|Shellfish|Sulfites|Wheat|Tree Nuts|Milk|Fish|Soy|Other Gluten|MSG|MSG Notice)/i.test(
    rowText,
  ) || /^This version is not currently offered/i.test(name);
}

function extractTropicalSmoothieNutritionPdfItems(text, restaurant, url) {
  const codeMap = new Map([
    ["1", "egg"],
    ["2", "fish"],
    ["3", "milk"],
    ["4", "peanut"],
    ["5", "shellfish"],
    ["6", "soy"],
    ["7", "tree-nut"],
    ["8", "wheat"],
    ["9", "sesame"],
  ]);
  const records = [];
  let currentCategory = restaurant.category;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+\t/g, "\t").replace(/\t\s+/g, "\t").trim();
    const cleanLine = cleanText(line);

    if (!cleanLine) {
      continue;
    }

    if (isCategoryLine(cleanLine) || /^(?:KIDS SMOOTHIES|SUPPLEMENTS|FRESH ADD-INS|BOTTLED BEVERAGES|FOOD|SIDES)$/i.test(cleanLine)) {
      currentCategory = titleCase(cleanLine);
      continue;
    }

    const parts = line.split(/\t+/).map(cleanText).filter(Boolean);

    if (parts.length < 5 || !/^(?:N\/A|\d+(?:\.\d+)?)$/i.test(parts[1] ?? "")) {
      continue;
    }

    const nameAndCodes = parts[0];
    const match = nameAndCodes.match(/^(.+?)(?:\s+((?:[1-9]|10)(?:\s+(?:[1-9]|10))*))?$/);
    const name = cleanText(match?.[1] ?? nameAndCodes);
    const codes = (match?.[2] ?? "").split(/\s+/).filter(Boolean);

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: uniqueStrings(codes.map((code) => codeMap.get(code)).filter(Boolean)),
        category: currentCategory,
        description: "Official Tropical Smoothie Cafe nutrition guide allergen footnotes.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

async function extractQdobaAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 5);
  const columns = [
    { allergen: "wheat", x: 172 },
    { allergen: "soy", x: 216 },
    { allergen: "milk", x: 259 },
    { allergen: "egg", x: 302 },
    { allergen: "tree-nut", x: 345 },
    { allergen: "peanut", x: 389 },
    { allergen: "fish", x: 432 },
    { allergen: "shellfish", x: 477 },
    { allergen: "gluten", x: 525 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanQdobaPdfName(
      row.items
        .filter((item) => item.x < 155)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isQdobaPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter((item) => /^[XΔ]$/i.test(item.str) && item.x >= 155);

    if (markers.length === 0 && isCategoryLine(name)) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = [];
    const mayContain = [];

    for (const marker of markers) {
      const allergen = closestAllergenColumn(marker.x, columns, 17);

      if (!allergen) {
        continue;
      }

      if (/^Δ$/i.test(marker.str)) {
        mayContain.push(allergen);
      } else {
        allergens.push(allergen);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Qdoba allergen information PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanQdobaPdfName(value) {
  return cleanText(value)?.replace(/\s+\*+$/g, "").replace(/\s+/g, " ").trim();
}

function isQdobaPdfNoise(rowText, name) {
  return /^(?:X Contains|Δ May contain|Wheat|Soy|Milk|Egg|Tree Nuts|Peanuts|Fish|Crustacean|\/Shellfish|Gluten|Vegan|ATTENTION VALUED|Foods prepared|and SHELLFISH|ALLERGEN INFORMATION|-- \d+ of \d+ --|\* Products|V- Vegan|Signature Builds|Kid's Meals)/i.test(
    rowText,
  ) || /^(?:Fountain Beverages|Bottled Beverages)$/i.test(name);
}

async function extractDelTacoAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 3);
  const columns = [
    { allergen: "milk", x: 318 },
    { allergen: "egg", x: 338 },
    { allergen: "fish", x: 358 },
    { allergen: "shellfish", x: 383 },
    { allergen: "tree-nut", x: 407 },
    { allergen: "peanut", x: 432 },
    { allergen: "wheat", x: 460 },
    { allergen: "soy", x: 485 },
    { allergen: "sesame", x: 510 },
    { allergen: "gluten", x: 535 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let pendingName = null;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanDelTacoPdfName(
      row.items
        .filter((item) => item.x < 265)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText || isDelTacoPdfNoise(rowText, leftText)) {
      continue;
    }

    const markers = row.items.filter((item) => /^X$/i.test(item.str) && item.x >= 310);

    const splitName = splitDelTacoLeadingCategory(leftText);

    if (markers.length === 0) {
      if (isCategoryLine(leftText) || /^[A-Z0-9&'®\s-]{3,40}$/.test(leftText)) {
        currentCategory = titleCase(leftText);
        pendingName = null;
      } else if (isProbablyMenuItemName(leftText)) {
        pendingName = pendingName ? `${pendingName} ${leftText}` : leftText;
      }
      continue;
    }

    if (splitName) {
      currentCategory = splitName.category;
    }

    const itemName = splitName?.name ?? leftText;
    const name = pendingName ? cleanDelTacoPdfName(`${pendingName} ${itemName}`) : itemName;
    pendingName = null;

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 14))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Del Taco allergen list PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanDelTacoPdfName(value) {
  return cleanText(value)?.replace(/\*+$/g, "").replace(/^& NACHOS\s+/i, "").replace(/\s+/g, " ").trim();
}

function isDelTacoPdfNoise(rowText, name) {
  return /^(?:DEL TACO MENU ITEMS|Vegetarian Vegan|SENSITIVITIES|CLAIMS|Menu Item Name|P5-2026|-- \d+ of \d+ --|©|Please be|DR PEPPER|INGREDIENTS|FOUNTAIN DRINKS)$/i.test(
    rowText,
  ) || /^P5-2026\b/i.test(name);
}

function splitDelTacoLeadingCategory(name) {
  const categories = [
    "BURGERS & FRIES",
    "BURRITOS",
    "TACOS",
    "EPIC BURRITOS",
    "QUESADILLAS",
    "NACHOS",
    "DESSERTS",
    "BREAKFAST",
    "SAUCES",
    "SIDES",
    "SALADS",
    "KIDS",
    "QUESADILLAS & NACHOS",
  ];

  for (const category of categories) {
    if (name.startsWith(`${category} `)) {
      return {
        category: titleCase(category),
        name: name.slice(category.length).trim(),
      };
    }
  }

  if (name.startsWith("& NACHOS ")) {
    return {
      category: "Quesadillas & Nachos",
      name: name.slice("& NACHOS ".length).trim(),
    };
  }

  return null;
}

async function extractCavaAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const columns = [
    { allergen: "wheat", x: 180 },
    { allergen: "milk", x: 220 },
    { allergen: "soy", x: 257 },
    { allergen: "egg", x: 293 },
    { allergen: "tree-nut", x: 331 },
    { allergen: "sesame", x: 364 },
    { allergen: "peanut", x: 401 },
    { allergen: "fish", x: 444 },
    { allergen: "shellfish", x: 474 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows.filter((entry) => entry.pageNumber >= 4)) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanText(
      row.items
        .filter((item) => item.x < 165)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isCavaPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter((item) => /^(?:Contains|•|x|X)$/i.test(item.str) && item.x >= 165 && item.x < 500);

    if (markers.length === 0 && isCategoryLine(name)) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 18))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official CAVA nutrition and allergen guide PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function isCavaPdfNoise(rowText, name) {
  return /^(?:Recipe|Wheat|Shellfish|Contains|ALLERGEN|D I E T|Allergen Guide|While we|We cannot|including salmon|beverage information|-- \d+ of \d+ --)$/i.test(
    rowText,
  ) || /^(?:beverage information is calculated without ice\.|Contains Compliant Ingredients)$/i.test(name);
}

async function extractYardHouseAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 5);
  const columns = [
    { allergen: "peanut", x: 350 },
    { allergen: "tree-nut", x: 382 },
    { allergen: "soy", x: 426 },
    { allergen: "egg", x: 457 },
    { allergen: "milk", x: 492 },
    { allergen: "wheat", x: 524 },
    { allergen: "gluten", x: 558 },
    { allergen: "fish", x: 596 },
    { allergen: "shellfish", x: 623 },
    { allergen: "shellfish", x: 660 },
    { allergen: "sesame", x: 700 },
  ];
  const broadCrossContactAllergens = [
    "peanut",
    "tree-nut",
    "soy",
    "egg",
    "milk",
    "wheat",
    "gluten",
    "fish",
    "shellfish",
    "sesame",
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanYardHousePdfName(
      row.items
        .filter((item) => item.x < 280)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isYardHousePdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter((item) => /^[Y●]$/i.test(item.str) && item.x >= 280);

    if (markers.length === 0) {
      if (isCategoryLine(name) || /^[A-Z][A-Z\s&+'"-]+$/.test(name)) {
        currentCategory = cleanYardHouseCategoryName(name);
      }
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = [];
    const mayContain = [];
    const hasPrepCrossContact = markers.some(
      (marker) => /^●$/.test(marker.str) && marker.x >= 280 && marker.x <= 340,
    );

    if (hasPrepCrossContact) {
      mayContain.push(...broadCrossContactAllergens);
    }

    for (const marker of markers) {
      if (/^●$/.test(marker.str) && marker.x >= 280 && marker.x <= 340) {
        continue;
      }

      const allergen = closestAllergenColumn(marker.x, columns, 18);

      if (!allergen) {
        continue;
      }

      if (/^●$/.test(marker.str)) {
        mayContain.push(allergen);
      } else {
        allergens.push(allergen);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Yard House allergen guide PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanYardHousePdfName(value) {
  return cleanText(value)?.replace(/\s+/g, " ").replace(/\s+²$/g, "").trim();
}

function cleanYardHouseCategoryName(value) {
  return titleCase(value)
    .replace(/\bSandwi Ches\b/g, "Sandwiches")
    .replace(/\bSandwi Ch Si Des\b/g, "Sandwich Sides")
    .replace(/\bAppeti Zers\b/g, "Appetizers")
    .replace(/\bChi Cken\b/g, "Chicken")
    .replace(/\bPreparati On\b/g, "Preparation")
    .replace(/\bPi Zzas\b/g, "Pizzas")
    .replace(/^Gs\b/g, "Gluten-Sensitive")
    .replace(/\bM Ai Ns\b/g, "Mains")
    .replace(/\bSi Des\b/g, "Sides")
    .replace(/\bSweet\b/g, "Sweets")
    .replace(/^Ki D'S M Enu$/g, "Kids Menu");
}

function isYardHousePdfNoise(rowText, name) {
  return /^(?:KEY TO|KEY TO THI S GUI DE|ALLERGEN GUIDE|Printed information|The information|current version|grill or fryer|If you have|COMMON ALLERGENS|PREPARATION|Fried|Soybean Oil|Grilled|Peanuts Tree Nuts|Menu items marked|Dairy|Page \d+ of \d+|-- \d+ of \d+ --)$/i.test(
    rowText,
  ) || /^(?:KEY TO THI S GUI DE|Peanuts|Tree Nuts|Soy|Eggs|Fish|Molluscs|Crustacean|Sesame|Dairy|Wheat|Gluten|served with pickles and choice of side|served lettuce wrapped|served on flour tortillas|served on corn tortillas)$/i.test(name);
}

async function extractCheddarsAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 5);
  const columns = [
    { allergen: "peanut", x: 716 },
    { allergen: "tree-nut", x: 775 },
    { allergen: "soy", x: 852 },
    { allergen: "egg", x: 912 },
    { allergen: "milk", x: 974 },
    { allergen: "wheat", x: 1034 },
    { allergen: "fish", x: 1101 },
    { allergen: "shellfish", x: 1154 },
    { allergen: "shellfish", x: 1217 },
    { allergen: "gluten", x: 1284 },
    { allergen: "sesame", x: 1344 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanText(
      row.items
        .filter((item) => item.x < 545)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isCheddarsPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter((item) => /^X$/i.test(item.str) && item.x >= 545);

    if (markers.length === 0) {
      if (isCategoryLine(name) || /^[A-Z][A-Z\s&'/-]+$/.test(name)) {
        currentCategory = titleCase(name);
      }
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 24))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Cheddar's Scratch Kitchen allergen guide PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function isCheddarsPdfNoise(rowText, name) {
  return /^(?:X Menu Item|Includes all|Fried in Soybean|Oil Grilled|Peanuts|Tree Nuts|Molluscan|Crustacean|Shellfish|Food Allergen Guide|Printed information|The information|most current|cooked on|If you have|-- \d+ of \d+ --)$/i.test(
    rowText,
  ) || /^(?:Sides? not included|Side not included|dressing not included)$/i.test(name);
}

async function extractAuntieAnnesAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 4);
  const columns = [
    { allergen: "milk", x: 323 },
    { allergen: "egg", x: 363 },
    { allergen: "fish", x: 403 },
    { allergen: "shellfish", x: 443 },
    { allergen: "wheat", x: 495 },
    { allergen: "soy", x: 554 },
    { allergen: "peanut", x: 619 },
    { allergen: "tree-nut", x: 677 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanAuntieAnnesPdfName(
      row.items
        .filter((item) => item.x < 300)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isAuntieAnnesPdfNoise(rowText, name)) {
      continue;
    }

    const markers = row.items.filter((item) => /^X$/i.test(item.str) && item.x >= 300);
    const categoryHeading = auntieAnnesCategoryHeading(name);

    if (markers.length === 0) {
      if (categoryHeading) {
        currentCategory = categoryHeading;
        continue;
      }

      if (!isProbablyMenuItemName(name)) {
        continue;
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: [],
          category: currentCategory,
          description: "Official Auntie Anne's allergen and sensitivities PDF matrix.",
          imageUrl: null,
          mayContain: [],
          name: titleCase(name),
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markers
      .map((marker) => closestAllergenColumn(marker.x, columns, 22))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Auntie Anne's allergen and sensitivities PDF matrix.",
        imageUrl: null,
        mayContain: [],
        name: titleCase(name),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanAuntieAnnesPdfName(value) {
  return cleanText(value)?.replace(/\s+/g, " ").trim();
}

function isAuntieAnnesPdfNoise(rowText, name) {
  if (/^Food Allergens and Sensitivities/i.test(name)) {
    return true;
  }

  return /^(?:Food Allergens|Food Sensitivities|THIS CHART|Product|MILK|EGG|FISH|SHELL|TREE|FD&C|MONOSODIUM|GLUTAMATE|MSG|CORN|SULFITES|Please be advised|responsibility|condition or sensitivity|ingredient|questions related|Auntie Anne's LLC|Confidential|Revised|-- \d+ of \d+ --)$/i.test(
    rowText,
  ) || /^(?:Food Allergens|Confidential|Revised|Auntie Anne's LLC)$/i.test(name) || /^(?:MISCELLANEOUS|PRETZELS \(without butter\)|DIPS|BEVERAGES)$/i.test(name) === false && name.length < 3;
}

function auntieAnnesCategoryHeading(name) {
  const headings = new Map([
    ["PRETZELS (without butter)", "Pretzels"],
    ["DIPS", "Dips"],
    ["BEVERAGES", "Beverages"],
    ["MISCELLANEOUS", "Miscellaneous"],
  ]);

  return headings.get(name.toUpperCase()) ?? null;
}

async function extractTimHortonsAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 3);
  const columns = [
    { allergen: "wheat", x: 275 },
    { allergen: "gluten", x: 275 },
    { allergen: "milk", x: 329 },
    { allergen: "egg", x: 383 },
    { allergen: "soy", x: 437 },
    { allergen: "peanut", x: 491 },
    { allergen: "tree-nut", x: 544 },
    { allergen: "sesame", x: 599 },
    { allergen: "fish", x: 653 },
    { allergen: "shellfish", x: 695 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let pendingRecord = null;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanTimHortonsPdfName(
      row.items
        .filter((item) => item.x < 250)
        .map((item) => item.str)
        .join(" "),
    );

    if (isTimHortonsPdfNoise(rowText, leftText ?? "")) {
      continue;
    }

    const markers = row.items.filter((item) => /^[xo]$/i.test(item.str) && item.x >= 250);

    if (markers.length === 0) {
      const categoryText = leftText || rowText;
      const categoryHeading = timHortonsCategoryHeading(categoryText);
      if (categoryHeading) {
        if (pendingRecord) {
          records.push(createRecord(pendingRecord));
        }
        currentCategory = categoryHeading;
        pendingRecord = null;
      } else if (leftText && isProbablyMenuItemName(leftText)) {
        if (pendingRecord) {
          records.push(createRecord(pendingRecord));
        }
        pendingRecord = {
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens: [],
          category: currentCategory,
          description: "Official Tim Hortons USA allergen guide PDF.",
          imageUrl: null,
          mayContain: [],
          name: leftText,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        };
      }
      continue;
    }

    if (pendingRecord && leftText && leftText !== pendingRecord.name) {
      records.push(createRecord(pendingRecord));
      pendingRecord = null;
    }

    const name = leftText || pendingRecord?.name;

    if (!name || !isProbablyMenuItemName(name)) {
      pendingRecord = null;
      continue;
    }

    const allergens = [];
    const mayContain = [];

    for (const marker of markers) {
      const allergen = closestAllergenColumn(marker.x, columns, 18);

      if (!allergen) {
        continue;
      }

      if (/^o$/i.test(marker.str)) {
        mayContain.push(allergen);
      } else {
        allergens.push(allergen);
      }
    }

    if (pendingRecord) {
      pendingRecord = null;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: uniqueStrings(allergens),
        category: currentCategory,
        description: "Official Tim Hortons USA allergen guide PDF.",
        imageUrl: null,
        mayContain: uniqueStrings(mayContain),
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  if (pendingRecord) {
    records.push(createRecord(pendingRecord));
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanTimHortonsPdfName(value) {
  return cleanText(value)?.replace(/\s+/g, " ").trim();
}

function isTimHortonsPdfNoise(rowText, name) {
  return /^(?:Wheat &|Gluten|Menu Item|Milk|Egg|Soy|Peanuts|Tree Nuts|Sesame|Fish|Shellfish|x = Contains|o = May Contain|Page \d+ of \d+|-- \d+ of \d+ --|Tim Hortons USA|Allergen Information|Allergen Statement|Although precaution|This guide|Please consult|A blank field|To find out|Some of our|Beverages - Limited Time Only|Cold Beverages - Limited Time Only|©Tim Hortons)/i.test(
    rowText,
  ) || /^(?:Tim Hortons USA|Allergen Information|©Tim Hortons)/i.test(name);
}

function timHortonsCategoryHeading(value) {
  const headings = new Set([
    "Coffee, Tea & Other Hot Beverages",
    "Beverage Additions",
    "Cold Beverages",
    "Donuts",
    "Timbits®",
    "Baked Goods",
    "Muffins",
    "Cookies",
    "Croissants",
    "Bagels",
    "Bagel Toppings",
    "Breakfast",
    "Classic Breakfast Sandwiches",
    "Bagel Breakfast Sandwiches",
    "Grilled Breakfast Wraps",
    "Other Breakfast Items",
    "Lunch",
    "Sandwiches",
    "Wraps",
    "Paninis",
    "Soups & Chili",
    "Sides",
  ]);
  const normalized = cleanText(value);

  return headings.has(normalized) ? normalized : null;
}

function extractDunkinAllergyIngredientPdfItems(text, restaurant, url) {
  const normalizedText = text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .replace(/\r/g, "");
  const blocks = normalizedText
    .split(/\nPRODUCT NAME\s+/)
    .slice(1)
    .map((block) => `PRODUCT NAME ${block}`);
  const records = [];

  for (const block of blocks) {
    const name = extractDunkinPdfField(block, /^PRODUCT NAME\s+([\s\S]*?)\nCATEGORY\s+/);
    const category = extractDunkinPdfField(
      block,
      /\nCATEGORY\s+([\s\S]*?)(?:\nFLAVOR\s+|\nINGREDIENTS\s+)/,
    );
    const flavor = extractDunkinPdfField(block, /\nFLAVOR\s+([\s\S]*?)\nINGREDIENTS\s+/);
    const ingredientsText = extractDunkinPdfField(
      block,
      /\nINGREDIENTS\s+([\s\S]*?)\nALLERGENS\b/,
    );
    const allergenText = extractDunkinPdfField(
      block,
      /\nALLERGENS\b\s*([\s\S]*?)(?:\nWARNING\b|$)/,
    );
    const warningText = extractDunkinPdfField(block, /\nWARNING\b\s*([\s\S]*?)$/);

    if (!name || !ingredientsText || !isProbablyMenuItemName(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: normalizeDunkinAllergenList(allergenText),
        category: category ?? restaurant.category,
        description: "Official Dunkin' allergen and ingredient guide PDF.",
        imageUrl: null,
        ingredientsText,
        mayContain: normalizeDunkinMayContainList(warningText),
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: flavor,
      }),
    );
  }

  return records;
}

function extractDunkinPdfField(block, pattern) {
  const value = block.match(pattern)?.[1];

  return cleanText(value);
}

function normalizeDunkinAllergenList(text) {
  const cleaned = cleanText(text);

  if (!cleaned || /^none$/i.test(cleaned)) {
    return [];
  }

  return normalizeProviderAllergens(cleaned.split(/\s*,\s*|\s+&\s+|\s+and\s+/i));
}

function normalizeDunkinMayContainList(text) {
  const cleaned = cleanText(text)?.replace(/^may contain\s+/i, "");

  return normalizeDunkinAllergenList(cleaned);
}

async function extractPaneraAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "wheat", x: 294 },
    { id: "gluten", x: 294 },
    { id: "tree-nut", x: 345 },
    { id: "peanut", x: 392 },
    { id: "milk", x: 453 },
    { id: "soy", x: 510 },
    { id: "egg", x: 566 },
    { id: "fish", x: 626 },
    { id: "shellfish", x: 626 },
    { id: "sesame", x: 694 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let pendingName = null;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (
      !rowText ||
      /^(Product|Wheat|Tree Nuts|sources\)|oil\)|Allergen Guide|EDITION|VALID FOR|Below is|NOTE:|To access|•|Page \d+)$/i.test(rowText)
    ) {
      continue;
    }

    const category = paneraCategoryFromRow(row.items);

    if (category) {
      currentCategory = category;
      pendingName = null;
      continue;
    }

    const name = cleanText(
      row.items
        .filter((item) => item.x < 270)
        .map((item) => item.str)
        .join(" "),
    );
    const markerItems = row.items.filter((item) => item.x >= 270);
    const hasMarkers = markerItems.some((item) => /^(yes|may contain|no major allergens present)$/i.test(item.str));

    if (!hasMarkers) {
      if (name && isProbablyMenuItemName(name)) {
        pendingName = pendingName ? `${pendingName} ${name}` : name;
      }

      continue;
    }

    const itemName = name && isProbablyMenuItemName(name) ? name : pendingName;

    if (!itemName || !isProbablyMenuItemName(itemName)) {
      pendingName = null;
      continue;
    }

    const direct = [];
    const mayContain = [];

    for (const marker of markerItems) {
      const markerText = cleanText(marker.str);

      if (!markerText || /^no major allergens present$/i.test(markerText)) {
        continue;
      }

      const matchedColumns = allergenColumns.filter((column) => Math.abs(marker.x - column.x) <= 18);

      if (/^may contain$/i.test(markerText)) {
        mayContain.push(...matchedColumns.map((column) => column.id));
      } else if (/^yes$/i.test(markerText)) {
        direct.push(...matchedColumns.map((column) => column.id));
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: direct,
        category: currentCategory,
        description: "Official Panera allergen guide PDF.",
        imageUrl: null,
        mayContain,
        name: itemName,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
    pendingName = null;
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function paneraCategoryFromRow(items) {
  const text = cleanText(items.filter((item) => item.x < 270).map((item) => item.str).join(" "));
  const categories = new Set([
    "Bagels & Spreads",
    "Breads",
    "Baked Goods",
    "Breakfast- Egg Sandwiches, Souffles, Parfait, Fruit & Oatmeal",
    "Salads & Stuffers",
    "Sandwiches- Information is provided with default bread choice. If bread choice is changed, it may contain an allergen.",
    "Dressings, Sauces & Spreads",
    "Drinks",
    "Soups & Mac",
    "Non-traditional Grab N Go",
    "Sides, Toppings, & Sauces",
    "Espresso Beverages",
    "Beverages",
    "Kids",
  ]);

  return text && categories.has(text) ? text.replace(/\s*-\s*Information.*$/i, "") : null;
}

function extractArbysAllergenPdfItems(text, restaurant, url) {
  const records = [];
  const lines = text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  let currentCategory = restaurant.category;
  let pending = "";

  for (const line of lines) {
    if (isArbysPdfNoiseLine(line)) {
      continue;
    }

    if (isArbysCategoryLine(line)) {
      currentCategory = titleCase(line);
      pending = "";
      continue;
    }

    const hasNutritionTail = /\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?/.test(line);

    if (!hasNutritionTail) {
      pending = pending ? `${pending} ${line}` : line;
      continue;
    }

    const combined = cleanText(`${pending} ${line}`) ?? line;
    pending = "";
    const label = cleanText(
      combined.replace(
        /\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?[\s\S]*$/,
        "",
      ),
    );

    if (!label || !isProbablyMenuItemName(label)) {
      continue;
    }

    const name = cleanText(
      label
        .replace(/\s+Contains:.*$/i, "")
        .replace(/\s+May Contain:?.*$/i, "")
        .replace(/\s+†.*$/i, "")
        .replace(/\s+Adds$/i, ""),
    );

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: normalizeProviderAllergens(extractArbysDisclosure(label, "contains")),
        category: currentCategory,
        description: "Official Arby's nutrition and allergen information PDF.",
        imageUrl: null,
        mayContain: normalizeProviderAllergens(extractArbysDisclosure(label, "may")),
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function extractArbysIngredientsPdfItems(text, restaurant, url) {
  const records = [];
  const menuItemsSection = text.split(/--\s*2\s+of\s+7\s*--/)[0] ?? text;
  const lines = menuItemsSection
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);
  let currentCategory = restaurant.category;
  let pending = null;

  for (const line of lines) {
    if (/^(Arby’s® Menu Items and Ingredients|Page \d+ of \d+)$/i.test(line)) {
      continue;
    }

    if (isArbysCategoryLine(line)) {
      if (pending) {
        records.push(createArbysIngredientRecord(pending, currentCategory, url));
        pending = null;
      }

      currentCategory = titleCase(line);
      continue;
    }

    const startsNewItem = /^.{3,90}:\s+/.test(line);

    if (startsNewItem) {
      if (pending) {
        records.push(createArbysIngredientRecord(pending, currentCategory, url));
      }

      const [rawName, ...detailParts] = line.split(":");
      pending = {
        name: cleanText(rawName),
        detail: cleanText(detailParts.join(":")),
      };
      continue;
    }

    if (pending) {
      pending.detail = cleanText(`${pending.detail ?? ""} ${line}`);
    }
  }

  if (pending) {
    records.push(createArbysIngredientRecord(pending, currentCategory, url));
  }

  return records.filter(Boolean);
}

function createArbysIngredientRecord(entry, category, url) {
  if (!entry.name || !isProbablyMenuItemName(entry.name)) {
    return null;
  }

  return createRecord({
    allergenSourceType: allergenSourceTypes.officialIngredients,
    allergens: [],
    category,
    description: "Official Arby's menu items and ingredients PDF.",
    imageUrl: null,
    ingredientsText: entry.detail ?? entry.name,
    mayContain: [],
    name: entry.name,
    sourceKind: "pdf-ingredients",
    sourceUrl: url,
  });
}

function extractArbysDisclosure(label, mode) {
  const pattern =
    mode === "may"
      ? /May Contain:?\s*([^;†\t]+)/gi
      : /Contains:\s*([^;†\t]+?)(?=\s+May Contain:?|$)/gi;
  const values = [];
  let match;

  while ((match = pattern.exec(label))) {
    values.push(...match[1].split(/\s*,\s*|\s+and\s+/i));
  }

  return values;
}

function isArbysPdfNoiseLine(line) {
  return /^(Serving Weight|Calories|Calories from Fat|Dietary Fiber|Fat - Total|Sugars|Saturated Fat|Protein|Trans Fat|Cholesterol|Sodium|Total Carbohydrate|Arby’s® Nutrition|Major food allergens|† Menu item|that contain major|Manufactured|• Menu item|Page \d+ of \d+)$/i.test(line);
}

function isArbysCategoryLine(line) {
  return /^[A-Z0-9&’' /-]{3,70}$/.test(line) && !/\d/.test(line);
}

async function extractWingstopPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "wheat", x: 326 },
    { id: "milk", x: 453 },
    { id: "egg", x: 573 },
    { id: "soy", x: 688 },
    { id: "fish", x: 773 },
    { id: "shellfish", x: 773 },
    { id: "mustard", x: 903 },
    { id: "celery", x: 1024 },
  ];
  const tableCategories = [
    "Classic Wings",
    "Boneless Wings",
    "Chicken Tenders",
    "Chicken Tenders",
    "Chicken Sandwich",
    "Sides",
  ];
  const records = [];
  let tableIndex = -1;

  for (const row of rows) {
    if (row.items.some((item) => /^wheat \*\*/i.test(item.str))) {
      tableIndex += 1;
      continue;
    }

    const namePart = row.items.find((item) => item.x >= 140 && item.x <= 190);
    const name = cleanText(namePart?.str);

    if (!name || !isProbablyMenuItemName(name)) {
      continue;
    }

    const markers = row.items.filter((item) => /^x$/i.test(item.str));

    if (markers.length === 0) {
      continue;
    }

    const allergens = uniqueStrings(
      markers.flatMap((marker) =>
        allergenColumns
          .filter((column) => Math.abs(marker.x - column.x) <= 24)
          .map((column) => column.id),
      ),
    );
    const category = tableCategories[tableIndex] ?? restaurant.category;
    const itemName = category === "Sides" ? name : `${name} (${category})`;

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category,
        description: "Official Wingstop allergen declaration PDF.",
        imageUrl: null,
        mayContain: wingstopMayContainAllergens(itemName),
        name: itemName,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: name,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function wingstopMayContainAllergens(name) {
  if (/\b(classic wings|boneless wings|chicken tenders|chicken sandwich|fries|fried corn)\b/i.test(name)) {
    return ["wheat", "gluten"];
  }

  return [];
}

async function extractPandaExpressPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "wheat", x: 598 },
    { id: "soy", x: 620 },
    { id: "peanut", x: 641 },
    { id: "tree-nut", x: 663 },
    { id: "fish", x: 684 },
    { id: "shellfish", x: 706 },
    { id: "egg", x: 728 },
    { id: "milk", x: 749 },
  ];
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const name = cleanText(
      row.items
        .filter((item) => item.x < 165)
        .map((item) => item.str)
        .join(" "),
    )?.replace(/\s+\)/g, ")");

    if (!name) {
      continue;
    }

    const hasNutrition = row.items.some((item) => item.x >= 180 && item.x <= 585 && /^<?\d/.test(item.str));

    if (!hasNutrition) {
      if (
        /^[A-Z][A-Z0-9’'&\s*]+$/.test(name) &&
        !/^(MENU ITEMS|NUTRITION|ALLERGEN|KID’S MEAL|KID'S MEAL|TM)$/i.test(name)
      ) {
        currentCategory = titleCase(name.replace(/\*+$/, ""));
      }
      continue;
    }

    if (!isProbablyMenuItemName(name) || /^Spicy$/i.test(name)) {
      continue;
    }

    const allergens = [];

    for (const marker of row.items.filter((item) => /^Y$/i.test(item.str))) {
      const column = allergenColumns.find((entry) => Math.abs(entry.x - marker.x) <= 9);

      if (column) {
        allergens.push(column.id);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Panda Express nutrition and allergen information PDF.",
        imageUrl: null,
        mayContain: [],
        name: name.replace(/\*$/, ""),
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

async function extractZaxbysPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "milk", x: 275 },
    { id: "egg", x: 305 },
    { id: "wheat", x: 335 },
    { id: "soy", x: 365 },
    { id: "peanut", x: 395 },
    { id: "tree-nut", x: 425 },
    { id: "shellfish", x: 455 },
    { id: "sesame", x: 485 },
    { id: "fish", x: 515 },
    { id: "gluten", x: 575 },
  ];
  const sectionLabels = new Set([
    "2",
    "WITH EACH SAUCE",
    "(PROTEIN ONLY)",
  ]);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows.filter((entry) => entry.pageNumber === 2)) {
    const markerItems = row.items.filter((item) => /^[∙•.]$/.test(item.str));
    const nameItems = row.items.filter((item) => item.x >= 60 && item.x < 265 && !sectionLabels.has(item.str));
    const joinedName = cleanText(nameItems.map((item) => item.str).join(" "));
    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (!rowText) {
      continue;
    }

    const inlineCategory = zaxbysCategoryFromRow(
      row.items.filter((item) => item.x < 90).map((item) => item.str),
    );

    if (inlineCategory) {
      currentCategory = inlineCategory;
    }

    if (markerItems.length === 0) {
      const category = zaxbysCategoryFromRow(row.items.map((item) => item.str));

      if (category) {
        currentCategory = category;
      }

      continue;
    }

    if (!joinedName || !isProbablyMenuItemName(joinedName)) {
      continue;
    }

    const allergens = [];

    for (const marker of markerItems) {
      const column = allergenColumns.find((entry) => Math.abs(entry.x - marker.x) <= 8);

      if (column) {
        allergens.push(column.id);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: zaxbysCategoryForItem(joinedName, currentCategory),
        description: "Official Zaxbys nutrition and allergen information guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: joinedName,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

async function extractLittleCaesarsPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "egg", min: 496, max: 512 },
    { id: "milk", min: 513, max: 531 },
    { id: "wheat", min: 532, max: 550 },
    { id: "soy", min: 551, max: 573 },
    { id: "sesame", min: 574, max: 595 },
  ];
  const records = [];
  let currentCategory = restaurant.category;
  let pendingName = null;
  let pendingMarkers = [];

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" "));

    if (!rowText || /^(PRODUCT ALLERGEN INFORMATION|continued)$/i.test(rowText)) {
      continue;
    }

    const category = littleCaesarsCategoryFromRow(row.items);

    if (category) {
      currentCategory = category;
      pendingName = null;
      continue;
    }

    if (/^(Egg|Milk|Wheat|Soy|Sesame|Other)$/i.test(rowText)) {
      continue;
    }

    const name = cleanText(
      row.items
        .filter((item) => item.x < 215)
        .map((item) => item.str)
        .join(" "),
    );
    const hasNutrition = row.items.some((item) => item.x >= 215 && item.x <= 490 && /^>?<?\d/.test(item.str));
    const markers = row.items.filter((item) => /^a$/i.test(item.str) && item.x >= 495);

    if (!name && !hasNutrition && markers.length > 0) {
      pendingName = null;
      pendingMarkers = markers;
      continue;
    }

    if (name && isProbablyMenuItemName(name)) {
      pendingName = pendingName ? `${pendingName} ${name}` : name;
    }

    if (!hasNutrition && markers.length === 0 && pendingMarkers.length === 0) {
      continue;
    }

    const itemName = pendingName ?? name;

    if (!itemName || !isProbablyMenuItemName(itemName)) {
      continue;
    }

    const allergens = [];

    for (const marker of markers.length > 0 ? markers : pendingMarkers) {
      const column = allergenColumns.find((entry) => marker.x >= entry.min && marker.x <= entry.max);

      if (column) {
        allergens.push(column.id);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: littleCaesarsCategoryForItem(itemName, currentCategory),
        description: "Official Little Caesars nutrition and allergen information PDF.",
        imageUrl: null,
        mayContain: [],
        name: itemName,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
    pendingName = null;
    pendingMarkers = [];
  }

  return records;
}

function littleCaesarsCategoryFromRow(items) {
  const text = cleanText(items.map((item) => item.str).join(" "))?.toUpperCase();

  if (!text) {
    return null;
  }

  if (/^MENU OPTIONS$/.test(text)) {
    return "Menu Options";
  }

  if (/^TOPPINGS\*?$/.test(text)) {
    return "Toppings";
  }

  if (/^MEALS & LUNCH COMBOS$/.test(text)) {
    return "Meals & Lunch Combos";
  }

  return null;
}

function littleCaesarsCategoryForItem(name, fallback) {
  if (/sauce|ranch|butter garlic|cheddar cheese/i.test(name)) {
    return "Sauces";
  }

  if (/topping|extra cheese|pepperoni|bacon|sausage|beef|peppers|olives|mushrooms|onions/i.test(name)) {
    return fallback === "Toppings" ? "Toppings" : fallback;
  }

  if (/crazy bread|cheese bread|cookie|brownie|wings|packet|stuffed crust/i.test(name)) {
    return "Sides";
  }

  return fallback;
}

function zaxbysCategoryForItem(name, fallback) {
  if (/\bzalad\b/i.test(name)) {
    return "Zalads";
  }

  return fallback;
}

function zaxbysCategoryFromRow(values) {
  const text = cleanText(values.join(" "))?.replace(/®|™/g, "");
  const normalized = text?.toUpperCase();
  const categoryMap = new Map([
    ["SHRIMP", "Limited Time Offerings"],
    ["ZALADS", "Zalads"],
    ["SANDWICHES", "Sandwiches"],
    ["MOST POPULAR", "Most Popular"],
    ["1 BONELESS WING", "Boneless Wings"],
    ["5 BONELESS WINGS", "Boneless Wings"],
    ["10 BONELESS WINGS", "Boneless Wings"],
    ["1 TRADITIONAL WING", "Traditional Wings"],
    ["5 TRADITIONAL WINGS", "Traditional Wings"],
    ["10 TRADITIONAL WINGS", "Traditional Wings"],
    ["1 CHICKEN FINGER", "Chicken Fingerz"],
    ["5 CHICKEN FINGERZ", "Chicken Fingerz"],
    ["1 CHICKEN FINGER WITH EACH SAUCE", "Chicken Fingerz"],
    ["5 CHICKEN FINGERZ WITH EACH SAUCE", "Chicken Fingerz"],
    ["DESSERTS", "Treats"],
    ["TREATS", "Treats"],
    ["SAUCES", "Sauces"],
    ["DRESSINGS", "Dressings"],
    ["SIDES", "Sides"],
    ["KIDS", "Kids"],
    ["KIDS MEALS", "Kids"],
    ["PLATTERS & SIDES", "Catering"],
    ["CATERING", "Catering"],
    ["DRINKS", "Drinks"],
  ]);

  return normalized ? categoryMap.get(normalized) ?? null : null;
}

async function extractJackInTheBoxPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenColumns = [
    { id: "soy", x: 284 },
    { id: "egg", x: 321 },
    { id: "fish", x: 355 },
    { id: "milk", x: 391 },
    { id: "peanut", x: 427 },
    { id: "shellfish", x: 462 },
    { id: "tree-nut", x: 498 },
    { id: "wheat", x: 533 },
  ];
  const categoryNames = new Set([
    "Better For You",
    "Burgers & More",
    "Chicken & Fish",
    "Something Different",
    "Salads",
    "Snacks & Sides",
    "Breakfast",
    "Drinks",
    "Shakes & Desserts",
    "Kid's Combos",
    "Ingredients",
  ]);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const texts = row.items.map((item) => item.str);
    const joined = cleanText(texts.join(" "));

    if (!joined) {
      continue;
    }

    if (texts.includes("Allergens")) {
      const categoryText = cleanText(
        row.items
          .filter((item) => item.x < 220)
          .map((item) => item.str)
          .join(" "),
      );

      if (categoryText && !/^allergens$/i.test(categoryText)) {
        currentCategory = categoryText;
      }

      continue;
    }

    if (/^(Allergens Reference Guide|8 Major Food Allergens:|-- \d+ of \d+ --)$/i.test(joined)) {
      continue;
    }

    if (categoryNames.has(joined)) {
      currentCategory = joined;
      continue;
    }

    const name = cleanText(
      row.items
        .filter((item) => item.x < 220)
        .map((item) => item.str)
        .join(" "),
    );

    if (
      !name ||
      !isProbablyMenuItemName(name) ||
      /^\*|^\^|^Allergen Key$/i.test(name) ||
      /\b(?:may contain traces|manufactured on equipment|allergens listed below|allergens are present|contains naturally occurring)\b/i.test(
        name,
      )
    ) {
      continue;
    }

    const allergens = [];

    for (const marker of row.items.filter((item) => /^x$/i.test(item.str))) {
      const column = allergenColumns.find((entry) => Math.abs(entry.x - marker.x) <= 8);

      if (column) {
        allergens.push(column.id);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Jack in the Box allergens reference guide PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

async function readPdfPositionRows(buffer) {
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  }).promise;
  const rows = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const byY = new Map();

    for (const item of content.items) {
      const str = cleanText(item.str);

      if (!str) {
        continue;
      }

      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);
      const key = `${pageNumber}:${y}`;
      const row = byY.get(key) ?? { items: [], pageNumber, y };
      row.items.push({ str, x });
      byY.set(key, row);
    }

    rows.push(
      ...Array.from(byY.values()).map((row) => ({
        ...row,
        items: row.items.sort((left, right) => left.x - right.x),
      })),
    );
  }

  return rows.sort((left, right) =>
    left.pageNumber === right.pageNumber
      ? right.y - left.y
      : left.pageNumber - right.pageNumber,
  );
}

async function readPdfVectorMarks(buffer) {
  const pdfjsLib = await getPdfJsLib();
  const { OPS } = pdfjsLib;
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  }).promise;
  const marks = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const operatorList = await page.getOperatorList();
      const state = {
        fillColor: null,
        matrix: [1, 0, 0, 1, 0, 0],
      };
      const stack = [];
      let pendingPath = null;

      for (let index = 0; index < operatorList.fnArray.length; index += 1) {
        const fn = operatorList.fnArray[index];
        const opArgs = operatorList.argsArray[index] ?? [];

        if (fn === OPS.save) {
          stack.push({ fillColor: state.fillColor, matrix: [...state.matrix] });
          continue;
        }

        if (fn === OPS.restore) {
          const restored = stack.pop();

          if (restored) {
            state.fillColor = restored.fillColor;
            state.matrix = restored.matrix;
          }
          continue;
        }

        if (fn === OPS.transform) {
          state.matrix = multiplyPdfMatrix(state.matrix, opArgs);
          continue;
        }

        if (fn === OPS.setFillRGBColor) {
          state.fillColor = pdfRgbToHex(opArgs);
          continue;
        }

        if (fn === OPS.setFillGray) {
          state.fillColor = pdfRgbToHex([opArgs[0], opArgs[0], opArgs[0]]);
          continue;
        }

        if (fn === OPS.constructPath) {
          pendingPath = pdfPathBoundingBox(opArgs, state.matrix);
          const immediateMark = classifySonicVectorMark(pendingPath, state.fillColor);

          if (immediateMark) {
            marks.push({ ...immediateMark, pageNumber });
            pendingPath = null;
          }
          continue;
        }

        if (
          pendingPath &&
          [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke].includes(fn)
        ) {
          const mark = classifySonicVectorMark(pendingPath, state.fillColor);

          if (mark) {
            marks.push({ ...mark, pageNumber });
          }

          pendingPath = null;
          continue;
        }

        if (fn === OPS.endPath) {
          pendingPath = null;
        }
      }
    }
  } finally {
    await document.destroy();
  }

  return marks;
}

function classifySonicVectorMark(box, fillColor) {
  if (!box || box.x < 220 || box.x > 555 || box.y < 40 || box.y > 750) {
    return null;
  }

  if (isClosePdfColor(fillColor, "#ee3350") && box.width >= 9 && box.width <= 18 && box.height >= 7 && box.height <= 16) {
    return {
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2,
      type: "contains",
    };
  }

  if (isClosePdfColor(fillColor, "#7c94b4") && box.width >= 2 && box.width <= 7 && box.height >= 2 && box.height <= 7) {
    return {
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height / 2,
      type: "may-contain",
    };
  }

  return null;
}

function pdfPathBoundingBox(pathArgs, matrix) {
  const explicitBox = flattenPdfPathCoords(pathArgs?.[2]);

  if (explicitBox.length >= 4) {
    const [minX, minY, maxX, maxY] = explicitBox;
    const points = [
      transformPdfPoint(matrix, minX, minY),
      transformPdfPoint(matrix, minX, maxY),
      transformPdfPoint(matrix, maxX, minY),
      transformPdfPoint(matrix, maxX, maxY),
    ];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    return {
      height: Math.max(...ys) - Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      x: Math.min(...xs),
      y: Math.min(...ys),
    };
  }

  const coords = flattenPdfPathCoords(pathArgs?.[1]);

  if (coords.length < 2) {
    return null;
  }

  const points = [];

  for (let index = 0; index < coords.length - 1; index += 2) {
    const x = Number(coords[index]);
    const y = Number(coords[index + 1]);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push(transformPdfPoint(matrix, x, y));
    }
  }

  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

function flattenPdfPathCoords(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenPdfPathCoords(entry));
  }

  if (ArrayBuffer.isView(value)) {
    return Array.from(value);
  }

  if (typeof value === "object") {
    return Object.keys(value)
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => value[key]);
  }

  return Number.isFinite(Number(value)) ? [Number(value)] : [];
}

function multiplyPdfMatrix(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function transformPdfPoint(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function pdfRgbToHex(values) {
  if (typeof values[0] === "string" && values[0].startsWith("#")) {
    return values[0].toLowerCase();
  }

  const channels = values.slice(0, 3).map((value) => {
    const numeric = Number(value);
    const channel = numeric <= 1 ? numeric * 255 : numeric;
    return Math.max(0, Math.min(255, Math.round(channel)));
  });

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function isClosePdfColor(actual, expected) {
  if (!actual) {
    return false;
  }

  const actualRgb = hexToRgb(actual);
  const expectedRgb = hexToRgb(expected);

  return actualRgb.every((channel, index) => Math.abs(channel - expectedRgb[index]) <= 8);
}

function hexToRgb(hex) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

function extractInNOutPdfItems(text, restaurant, url) {
  if (!/MENU ITEMS THAT CONTAIN KNOWN COMMON ALLERGENS/i.test(text)) {
    return [];
  }

  const rows = [
    {
      name: "Buns - AZ/CA/ID/NV/OR/UT/WA",
      allergens: ["wheat"],
      mayContain: ["sesame", "soy"],
      variantGroup: "Buns",
    },
    {
      name: "Buns - CO/TN/TX",
      allergens: ["wheat", "sesame"],
      mayContain: ["milk"],
      variantGroup: "Buns",
    },
    { name: "Cheese", allergens: ["milk", "soy"], mayContain: [] },
    { name: "Spread", allergens: ["egg"], mayContain: [] },
    { name: "Milk Beverage", allergens: ["milk"], mayContain: [], variantGroup: "Milk" },
    {
      name: "Chocolate Shake",
      allergens: ["milk", "soy"],
      mayContain: ["egg"],
    },
    {
      name: "Strawberry Shake",
      allergens: ["milk"],
      mayContain: ["egg", "soy"],
    },
    {
      name: "Vanilla Shake",
      allergens: ["milk"],
      mayContain: ["egg", "soy"],
    },
    { name: "Half & Half Creamer", allergens: ["milk"], mayContain: [] },
    {
      name: "Oat Milk Creamer",
      allergens: [],
      mayContain: ["tree-nut", "milk"],
    },
    {
      name: "Hot Cocoa",
      allergens: ["milk", "soy"],
      mayContain: ["tree-nut", "egg", "wheat"],
    },
    {
      name: "Marshmallow Bits",
      allergens: [],
      mayContain: ["tree-nut", "peanut"],
    },
  ];

  return rows.map((row) =>
    createRecord({
      allergenSourceType: allergenSourceTypes.officialAllergenMenu,
      allergens: row.allergens,
      category: restaurant.category,
      description: "Official In-N-Out allergen information PDF.",
      imageUrl: null,
      mayContain: row.mayContain,
      name: row.name,
      sourceKind: "pdf-matrix",
      sourceUrl: url,
      variantGroup: row.variantGroup,
    }),
  );
}

function extractRaisingCanesPdfItems(text, restaurant, url) {
  const records = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let currentCategory = restaurant.category;

  for (const line of lines) {
    const cleanLine = cleanText(line);

    if (!cleanLine) {
      continue;
    }

    if (/^(INDIVIDUAL ITEMS|COMBINATION MEALS|DRINKS|CONDIMENTS)/i.test(cleanLine)) {
      currentCategory = titleCase(cleanLine.replace(/\s*\[.*$/, ""));
      continue;
    }

    const parts = line.split(/\t+/).map(cleanText).filter(Boolean);

    if (parts.length < 13) {
      continue;
    }

    const name = parts[0];
    const code = parts[parts.length - 1]?.replace(/\s+/g, "");

    if (!name || !code || !isProbablyMenuItemName(name) || !/^(?:-|[ESFMNW*]+SS?[ESFMNW*]*)$/i.test(code)) {
      continue;
    }

    const direct = raisingCanesAllergenCodes(code.replace("*", ""));
    const mayContain = code.includes("*") ? ["egg", "milk", "wheat"] : [];

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: direct,
        category: currentCategory,
        description: "Official Raising Cane's nutritional and allergen information PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
      }),
    );
  }

  return records;
}

function raisingCanesAllergenCodes(code) {
  const allergens = [];
  let remaining = code.toUpperCase();

  if (remaining.includes("SS")) {
    allergens.push("sesame");
    remaining = remaining.replaceAll("SS", "");
  }

  for (const letter of remaining) {
    if (letter === "E") allergens.push("egg");
    if (letter === "S") allergens.push("soy");
    if (letter === "F") allergens.push("fish");
    if (letter === "M") allergens.push("milk");
    if (letter === "N") allergens.push("tree-nut");
    if (letter === "W") allergens.push("wheat");
  }

  return uniqueStrings(allergens);
}

async function extractOliveGardenAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = null;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanFirstWatchPdfName(
      row.items
        .filter((item) => item.x < 215)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText) {
      continue;
    }

    if (/^[A-Z][A-Z\s,&]+:$/.test(leftText)) {
      currentCategory = titleCase(leftText.replace(/:$/, ""));
      continue;
    }

    if (!currentCategory || !isProbablyMenuItemName(leftText) || isOliveGardenPdfNonItem(rowText)) {
      continue;
    }

    const allergens = [];
    const mayContain = [];
    const hasCrossContactMarker = row.items.some(
      (item) => item.x >= 215 && item.x < 275 && /[●]/.test(item.str),
    );

    for (const item of row.items) {
      if (!/^Y$/i.test(item.str)) {
        continue;
      }

      const allergen = closestOliveGardenAllergenColumn(item.x);

      if (allergen) {
        allergens.push(allergen);
      }
    }

    if (hasCrossContactMarker) {
      mayContain.push(
        "milk",
        "egg",
        "fish",
        "shellfish",
        "tree-nut",
        "peanut",
        "wheat",
        "gluten",
        "soy",
        "sesame",
      );
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Olive Garden allergen information PDF.",
        imageUrl: null,
        mayContain,
        name: leftText,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return records;
}

function isOliveGardenPdfNonItem(text) {
  return /^(?:KEY TO THIS GUIDE|PREPARATION|COMMON ALLERGENS|THE INFORMATION BELOW|BEFORE PLACING|Page \d+|US_\d+)/i.test(
    text,
  ) || /^\(|^● Menu item presents|\ballergens due to the cooking method\b/i.test(text);
}

function closestOliveGardenAllergenColumn(x) {
  const columns = [
    { allergen: "milk", x: 289 },
    { allergen: "egg", x: 331 },
    { allergen: "fish", x: 371 },
    { allergen: "shellfish", x: 403 },
    { allergen: "shellfish", x: 447 },
    { allergen: "tree-nut", x: 487 },
    { allergen: "peanut", x: 530 },
    { allergen: "wheat", x: 573 },
    { allergen: "gluten", x: 615 },
    { allergen: "soy", x: 662 },
    { allergen: "sesame", x: 698 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 18 ? closest.allergen : null;
}

async function extractLongHornAllergenPdfItems(buffer, restaurant, url) {
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  }).promise;
  const records = [];
  let currentCategory = null;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const clusters = [];

    for (const item of content.items) {
      const str = cleanText(item.str);

      if (!str) {
        continue;
      }

      const x = Math.round(item.transform[4]);
      const y = Math.round(item.transform[5]);

      if (x < 245 || x > 760) {
        continue;
      }

      let cluster = clusters.find((candidate) => Math.abs(candidate.x - x) <= 2);

      if (!cluster) {
        cluster = { x, items: [] };
        clusters.push(cluster);
      }

      cluster.items.push({ str, x, y });
    }

    for (const cluster of clusters.sort((left, right) => left.x - right.x)) {
      const name = cleanLongHornPdfName(
        cluster.items
          .filter((item) => item.y < 245)
          .sort((left, right) => left.y - right.y)
          .map((item) => item.str)
          .join(" "),
      );
      const markerItems = cluster.items.filter(
        (item) => item.y >= 330 && /^(?:Y|M|[●])$/i.test(item.str),
      );

      if (!name) {
        continue;
      }

      if (isLongHornPdfCategory(name, markerItems)) {
        currentCategory = titleCase(name).replace(/'S\b/g, "'s");
        continue;
      }

      if (!currentCategory || !isProbablyMenuItemName(name) || isLongHornPdfNonItem(name)) {
        continue;
      }

      const allergens = [];
      const mayContain = [];
      let isConfigurable = false;
      const hasPrepCrossContactMarker = markerItems.some(
        (item) => /[●]/.test(item.str) && closestLongHornPrepColumn(item.y),
      );

      for (const item of markerItems) {
        if (/^Y$/i.test(item.str)) {
          const allergen = closestLongHornAllergenColumn(item.y);

          if (allergen) {
            allergens.push(allergen);
          }
        }

        if (/^M$/i.test(item.str) && closestLongHornAllergenColumn(item.y) === "gluten") {
          allergens.push("gluten");
          isConfigurable = true;
        }
      }

      if (hasPrepCrossContactMarker) {
        mayContain.push(
          "milk",
          "egg",
          "fish",
          "shellfish",
          "tree-nut",
          "peanut",
          "wheat",
          "gluten",
          "soy",
          "sesame",
        );
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category: currentCategory,
          description: "Official LongHorn Steakhouse allergen information PDF.",
          imageUrl: null,
          isConfigurable,
          mayContain,
          name,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: currentCategory,
        }),
      );
    }
  }

  return records;
}

function cleanLongHornPdfName(value) {
  return cleanText(
    value
      ?.replace(/[‐‑‒–—]/g, "-")
      .replace(/\s+\+/g, " +")
      .replace(/\+\s+/g, "+ ")
      .replace(/\s+/g, " "),
  );
}

function isLongHornPdfCategory(name, markerItems) {
  return markerItems.length === 0 && /^[A-Z][A-Z\s,&']+$/.test(name) && name.length >= 4;
}

function isLongHornPdfNonItem(name) {
  return /^(?:GRILLED|FRIED|SOYBEAN|PEANUT|TREE|SOY|EGG|DAIRY|WHEAT|FINFISH|MOLLUSCAN|CRUSTACEAN|SHELLFISH|GLUTEN|CONTAINS|INGREDIENTS|ASK FOR|INFORMATION VALID|LONGHORN STEAKHOUSE|COMMON ALLERGENS|PAGE \d+)/i.test(
    name,
  );
}

function closestLongHornAllergenColumn(y) {
  const columns = [
    { allergen: "peanut", y: 449 },
    { allergen: "tree-nut", y: 469 },
    { allergen: "soy", y: 488 },
    { allergen: "egg", y: 508 },
    { allergen: "milk", y: 528 },
    { allergen: "wheat", y: 548 },
    { allergen: "fish", y: 568 },
    { allergen: "shellfish", y: 604 },
    { allergen: "shellfish", y: 653 },
    { allergen: "gluten", y: 711 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.y - y) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 17 ? closest.allergen : null;
}

function closestLongHornPrepColumn(y) {
  const columns = [365, 408];
  const closest = columns
    .map((columnY) => ({ columnY, distance: Math.abs(columnY - y) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 14 ? closest.columnY : null;
}

async function extractOutbackAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = null;

  for (const row of rows) {
    const nameItems = row.items.filter((item) => item.x >= 90 && item.x < 275);
    const name = cleanText(
      nameItems
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isOutbackPdfNonItem(name)) {
      continue;
    }

    const markerItems = row.items.filter((item) => /^Y$/i.test(item.str));

    const minNameX = Math.min(...nameItems.map((item) => item.x));

    if (markerItems.length === 0 && minNameX <= 100) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!currentCategory || !isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = markerItems
      .map((item) => closestOutbackAllergenColumn(item.x))
      .filter(Boolean);

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Outback Steakhouse allergen information PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return records;
}

function isOutbackPdfNonItem(name) {
  return /^(?:Outback Steakhouse|Y =|Menu Item Name|Eggs|Fish|Milk|Peanuts|Sesame|Shellfish|Soybean|Treenuts|Wheat|Created:|Due to|Soybean oil|This information|Though efforts|Please ask|made to order|Deep fried)/i.test(
    name,
  );
}

function closestOutbackAllergenColumn(x) {
  const columns = [
    { allergen: "egg", x: 294 },
    { allergen: "fish", x: 319 },
    { allergen: "milk", x: 343 },
    { allergen: "peanut", x: 369 },
    { allergen: "sesame", x: 393 },
    { allergen: "shellfish", x: 420 },
    { allergen: "soy", x: 448 },
    { allergen: "tree-nut", x: 476 },
    { allergen: "wheat", x: 503 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 15 ? closest.allergen : null;
}

async function extractFirstWatchAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const allergenHeaderYByPage = new Map(
    rows
      .filter((row) => {
        const text = row.items.map((item) => item.str).join(" ");
        return /\bEgg\b/i.test(text) && /\bFish\b/i.test(text) && /\bMustard\b/i.test(text);
      })
      .map((row) => [row.pageNumber, row.y]),
  );
  const records = [];
  let currentCategory = "Allergen Guide";

  for (const row of rows) {
    const headerY = allergenHeaderYByPage.get(row.pageNumber);

    if (!headerY || row.y >= headerY) {
      continue;
    }

    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftText = cleanFirstWatchPdfName(
      row.items
        .filter((item) => item.x < 215)
        .map((item) => item.str)
        .join(" "),
    );

    if (!leftText) {
      continue;
    }

    if (/^\d{4}\s+.+MENU$/i.test(rowText) || /^(?:2026\s+)?(?:SUMMER|FALL|WINTER|SPRING)/i.test(rowText)) {
      currentCategory = titleCase(rowText.replace(/^2026\s+/i, "").replace(/\s+MENU$/i, " Menu"));
      continue;
    }

    if (!isFirstWatchPdfItemName(leftText, rowText)) {
      continue;
    }

    const allergens = [];

    for (const item of row.items) {
      if (!/^X$/i.test(item.str)) {
        continue;
      }

      const allergen = closestFirstWatchAllergenColumn(item.x);

      if (allergen) {
        allergens.push(allergen);
      }
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official First Watch allergen guide PDF.",
        imageUrl: null,
        mayContain: [],
        name: leftText,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return records;
}

function isFirstWatchPdfItemName(name, rowText) {
  if (!isProbablyMenuItemName(name)) {
    return false;
  }

  if (/\d{2,}\s+\d+\s+\d+/.test(rowText) || /\b(?:Calories|Protein|Sodium|Carbohydrate)\b/i.test(rowText)) {
    return false;
  }

  return !/^(?:Menu Item|Egg|Fish|Milk|Peanuts|Sesame|Shellfish|Soy|Tree Nuts|Wheat|Celery|Gluten|Mustard|The allergens|Please inform|This information|Note we|FIRST WATCH|CONFIDENTIAL|JUNE|R\d|To access|ALLERGEN GUIDE|A L L ERGEN GUIDE|BOOZY|& Allergen QR Code)/i.test(
    rowText,
  );
}

function cleanFirstWatchPdfName(value) {
  return cleanText(value)
    ?.replace(/(?:\s+X)+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function closestFirstWatchAllergenColumn(x) {
  const columns = [
    { allergen: "egg", x: 230 },
    { allergen: "fish", x: 262 },
    { allergen: "milk", x: 293 },
    { allergen: "peanut", x: 325 },
    { allergen: "sesame", x: 357 },
    { allergen: "shellfish", x: 388 },
    { allergen: "soy", x: 420 },
    { allergen: "tree-nut", x: 452 },
    { allergen: "wheat", x: 483 },
    { allergen: "gluten", x: 546 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 16 ? closest.allergen : null;
}

async function extractCrackerBarrelAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    if (row.pageNumber < 4) {
      continue;
    }

    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanCrackerBarrelPdfName(
      row.items
        .filter((item) => item.x < 365)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isCrackerBarrelPdfNoise(rowText, name)) {
      continue;
    }

    if (crackerBarrelCategoryNames().has(name)) {
      currentCategory = name;
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = [];
    const mayContain = [];

    for (const item of row.items) {
      if (!/^X$/i.test(item.str)) {
        continue;
      }

      const allergen = closestCrackerBarrelAllergenColumn(item.x);

      if (allergen) {
        allergens.push(allergen);
      }
    }

    const hasPrepCrossContact = row.items.some(
      (item) => /^Y$/i.test(item.str) && item.x >= 390 && item.x <= 470,
    );

    if (hasPrepCrossContact) {
      mayContain.push(
        "egg",
        "fish",
        "milk",
        "peanut",
        "sesame",
        "shellfish",
        "soy",
        "tree-nut",
        "wheat",
        "gluten",
      );
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Cracker Barrel allergen guide PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanCrackerBarrelPdfName(value) {
  return cleanText(value)
    ?.replace(/^\*\s*/, "")
    .replace(/\s+\*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCrackerBarrelPdfNoise(rowText, name) {
  return /^(?:Y - potential risk|X - Menu item|Our normal kitchen|Page \d+|\d+)$/i.test(rowText) ||
    /^(?:Breakfast Menu|Lunch\/Dinner Menu|Preparation|Common Allergies)$/i.test(name) ||
    /^\*?with\s*$/i.test(name) ||
    /^Choice of Three Sauces:/i.test(name);
}

function crackerBarrelCategoryNames() {
  return new Set([
    "All-Day Breakfast Meals",
    "Meat Biscuits",
    "Eggs n' Meat",
    "Griddle Classics",
    "Sweet Toppings",
    "Breakfast Extras",
    "Lunch and Dinner Meals",
    "Catering Sides",
    "Bread Choice",
    "Country Sides",
    "Premium Sides",
    "Salad Dressings",
    "Sauces",
    "Crispy Tender Dippers Platter",
    "Barrel Cheeseburger Slider Platter",
    "Build Your Own Chicken Sandwich Bar",
    "Iced Tea n' Beverages",
    "Desserts",
  ]);
}

function closestCrackerBarrelAllergenColumn(x) {
  const columns = [
    { allergen: "egg", x: 487 },
    { allergen: "fish", x: 508 },
    { allergen: "milk", x: 529 },
    { allergen: "peanut", x: 550 },
    { allergen: "sesame", x: 585 },
    { allergen: "shellfish", x: 610 },
    { allergen: "soy", x: 645 },
    { allergen: "tree-nut", x: 674 },
    { allergen: "wheat", x: 709 },
    { allergen: "gluten", x: 737 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 16 ? closest.allergen : null;
}

async function extractBuffaloWildWingsAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    if (row.pageNumber >= 8) {
      continue;
    }

    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const leftItems = row.items.filter((item) => item.x < 170);
    const firstLeftText = cleanBuffaloWildWingsPdfName(leftItems[0]?.str);
    const name = cleanBuffaloWildWingsPdfName(leftItems.map((item) => item.str).join(" "));

    if (!name || isBuffaloWildWingsPdfNoise(rowText, name)) {
      continue;
    }

    if (firstLeftText && isBuffaloWildWingsPdfCategory(firstLeftText)) {
      currentCategory = titleCase(firstLeftText);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const explicitMayContain = row.items
      .filter((item) => /may contain/i.test(item.str))
      .map((item) => closestBuffaloWildWingsAllergenColumn(item.x))
      .filter(Boolean);
    const hasFriedPrepMarker = row.items.some((item) => /^X$/i.test(item.str) && item.x < 220);
    const mayContain = uniqueStrings(
      explicitMayContain.length > 0 || hasFriedPrepMarker
        ? [
            ...explicitMayContain,
            ...(hasFriedPrepMarker ? majorAllergensForCrossContact() : []),
          ]
        : majorAllergensForCrossContact(),
    );

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: [],
        category: currentCategory,
        description: "Buffalo Wild Wings menu item from the official allergen guide.",
        evidenceText:
          "Official BWW allergen guide row parsed; direct marker glyphs are not text-extractable, so cross-contact review is retained.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanBuffaloWildWingsPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+-\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBuffaloWildWingsPdfNoise(rowText, name) {
  return /^(?:BUFFALO WILD WINGS|ALLERGEN & PREPARATION GUIDE|VALID|KEY:|PREPARATION|COMMON ALLERGENS|= Contains|Risk of cross-contamination|for all allergens|cooking method|FRIED|EGG|FISH|MILK|PEANUTS|SESAME|SHELLFISH|SOY|TREE NUTS|WHEAT|GLUTEN|©2026|PAGE \d+)/i.test(
    rowText,
  ) || /^(?:= Risk of cross-contamination|see Signature Sauces|at select locations|limited time|All dippers are listed|All sandwiches|All burgers|Protein substitutions|Choice of \d|Add Chili|Add Chicken|Add Guacamole|with orzo rice)$/i.test(
    name,
  );
}

function isBuffaloWildWingsPdfCategory(name) {
  return /^[A-Z0-9][A-Z0-9\s,&'-]+$/.test(name) && name.length >= 4;
}

function closestBuffaloWildWingsAllergenColumn(x) {
  const columns = [
    { allergen: "egg", x: 229 },
    { allergen: "fish", x: 264 },
    { allergen: "milk", x: 300 },
    { allergen: "peanut", x: 330 },
    { allergen: "sesame", x: 368 },
    { allergen: "shellfish", x: 401 },
    { allergen: "soy", x: 444 },
    { allergen: "tree-nut", x: 472 },
    { allergen: "wheat", x: 513 },
    { allergen: "gluten", x: 548 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 28 ? closest.allergen : null;
}

async function extractRedLobsterAllergenPdfItems(buffer, restaurant, url) {
  const rows = clusterPdfRowsByPageAndY(await readPdfPositionRows(buffer), 7);
  const records = [];
  let currentCategory = restaurant.category;

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";
    const name = cleanRedLobsterPdfName(
      row.items
        .filter((item) => item.x < 390)
        .map((item) => item.str)
        .join(" "),
    );

    if (!name || isRedLobsterPdfNoise(rowText, name)) {
      continue;
    }

    const yesItems = row.items.filter((item) => /^Yes$/i.test(item.str));
    const naItems = row.items.filter((item) => /^#N\/A$/i.test(item.str));
    const prepRiskItems = row.items.filter((item) => /^[l•●]$/i.test(item.str) && item.x >= 390);

    if (yesItems.length === 0 && prepRiskItems.length === 0 && naItems.length >= 5) {
      currentCategory = titleCase(name);
      continue;
    }

    if (!isProbablyMenuItemName(name)) {
      continue;
    }

    const allergens = yesItems
      .map((item) => closestRedLobsterAllergenColumn(item.x))
      .filter(Boolean);
    const mayContain = prepRiskItems.length > 0 ? majorAllergensForCrossContact() : [];

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens,
        category: currentCategory,
        description: "Official Red Lobster allergen guide PDF.",
        imageUrl: null,
        mayContain,
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return uniqueBy(records, (record) => `${record.category}:${record.name}`);
}

function cleanRedLobsterPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+\*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRedLobsterPdfNoise(rowText, name) {
  return /^(?:Key to this Guide|PREPARATION|COMMON ALLERGENS|OTHER|Yes =|Blank =|•=|\*=|Risk of possible|Peanut|Tree Nut|Soy|Egg|Dairy|Wheat|Finfish|Molluscan|Crustacean|Gluten|Sulfites|ALLERGEN GUIDE|US RESTAURANTS|Information Valid|Because of|Soy Allergies|Unless noted|Page \d+|US Version)$/i.test(
    rowText,
  ) || /^(?:\*=Regional Item|•= Menu item|\d+\.\s*(?:CHOOSE|ADD ON)|with orzo rice)\b/i.test(name);
}

function closestRedLobsterAllergenColumn(x) {
  const columns = [
    { allergen: "peanut", x: 507 },
    { allergen: "tree-nut", x: 565 },
    { allergen: "soy", x: 626 },
    { allergen: "egg", x: 684 },
    { allergen: "milk", x: 742 },
    { allergen: "wheat", x: 800 },
    { allergen: "fish", x: 857 },
    { allergen: "shellfish", x: 922 },
    { allergen: "shellfish", x: 993 },
    { allergen: "gluten", x: 1064 },
  ];
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 23 ? closest.allergen : null;
}

function majorAllergensForCrossContact() {
  return [
    "egg",
    "fish",
    "milk",
    "peanut",
    "sesame",
    "shellfish",
    "soy",
    "tree-nut",
    "wheat",
    "gluten",
  ];
}

function clusterPdfRowsByPageAndY(rows, tolerance) {
  const clustered = [];
  const rowsByPage = new Map();

  for (const row of rows) {
    rowsByPage.set(row.pageNumber, [...(rowsByPage.get(row.pageNumber) ?? []), row]);
  }

  for (const [pageNumber, pageRows] of rowsByPage) {
    const clusters = [];

    for (const row of pageRows.sort((left, right) => right.y - left.y)) {
      let cluster = clusters.find((candidate) => Math.abs(candidate.y - row.y) <= tolerance);

      if (!cluster) {
        cluster = { items: [], pageNumber, y: row.y };
        clusters.push(cluster);
      }

      cluster.items.push(...row.items);
      cluster.y = Math.round((cluster.y + row.y) / 2);
    }

    for (const cluster of clusters) {
      cluster.items.sort((left, right) => left.x - right.x);
      clustered.push(cluster);
    }
  }

  return clustered;
}

function extractWaffleHouseNutritionPdfItems(text, restaurant, url) {
  const records = [];
  const lines = text.split(/\r?\n/).map(cleanText).filter(Boolean);
  let currentCategory = restaurant.category;

  for (const line of lines) {
    if (/^[A-Z][A-Z\s&'™-]{4,}$/.test(line) && !/\b(?:ALLERGENS|UPDATED|NAME)\b/i.test(line)) {
      currentCategory = titleCase(line);
      continue;
    }

    const match = line.match(
      /^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+([A-Za-z, .]+))?$/,
    );

    if (!match) {
      continue;
    }

    const name = cleanWaffleHousePdfName(match[1]);
    const allergenText = cleanText(match[12] ?? "") ?? "";

    if (!name || !isProbablyMenuItemName(name) || /^Includes:$/i.test(name)) {
      continue;
    }

    records.push(
      createRecord({
        allergenSourceType: allergenSourceTypes.officialAllergenMenu,
        allergens: waffleHouseAllergens(allergenText),
        category: currentCategory,
        description: "Official Waffle House nutrition and allergen PDF.",
        imageUrl: null,
        mayContain: [],
        name,
        sourceKind: "pdf-matrix",
        sourceUrl: url,
        variantGroup: currentCategory,
      }),
    );
  }

  return records;
}

function cleanWaffleHousePdfName(value) {
  return cleanText(value)
    ?.replace(/^Includes:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function waffleHouseAllergens(value) {
  const allergenText = String(value).replace(/\.$/, "");
  const allergenMap = new Map([
    ["egg", "egg"],
    ["eggs", "egg"],
    ["milk", "milk"],
    ["peanut", "peanut"],
    ["peanuts", "peanut"],
    ["soy", "soy"],
    ["tree nuts", "tree-nut"],
    ["tree nut", "tree-nut"],
    ["wheat", "wheat"],
  ]);

  return uniqueStrings(
    allergenText
      .split(/,\s*/)
      .map((part) => allergenMap.get(part.trim().toLowerCase()))
      .filter(Boolean),
  );
}

async function extractDennysAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const records = [];
  const categories = ["Menu", "Menu", "Menu"];
  const clusters = [
    {
      nameEndX: 90,
      startX: 0,
      columns: [
        { allergen: "egg", x: 97 },
        { allergen: "fish", x: 119 },
        { allergen: "shellfish", x: 138 },
        { allergen: "milk", x: 163 },
        { allergen: "soy", x: 189 },
        { allergen: "peanut", x: 215 },
        { allergen: "tree-nut", x: 239 },
        { allergen: "wheat", x: 266 },
        { allergen: "gluten", x: 288 },
        { allergen: "sesame", x: 309 },
      ],
    },
    {
      nameEndX: 430,
      startX: 340,
      columns: [
        { allergen: "egg", x: 434 },
        { allergen: "fish", x: 456 },
        { allergen: "shellfish", x: 476 },
        { allergen: "milk", x: 500 },
        { allergen: "soy", x: 527 },
        { allergen: "peanut", x: 553 },
        { allergen: "tree-nut", x: 577 },
        { allergen: "wheat", x: 604 },
        { allergen: "gluten", x: 626 },
        { allergen: "sesame", x: 647 },
      ],
    },
    {
      nameEndX: 765,
      startX: 680,
      columns: [
        { allergen: "egg", x: 770 },
        { allergen: "fish", x: 792 },
        { allergen: "shellfish", x: 812 },
        { allergen: "milk", x: 836 },
        { allergen: "soy", x: 862 },
        { allergen: "peanut", x: 889 },
        { allergen: "tree-nut", x: 913 },
        { allergen: "wheat", x: 940 },
        { allergen: "gluten", x: 962 },
        { allergen: "sesame", x: 983 },
      ],
    },
  ];

  for (const row of rows) {
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";

    if (/^(?:ALLERGENS|X - Contains|◊ - May contain|To designate|PLEASE NOTE|At Denny)/i.test(rowText)) {
      continue;
    }

    clusters.forEach((cluster, clusterIndex) => {
      const clusterItems = row.items.filter(
        (item) => item.x >= cluster.startX && item.x < (clusters[clusterIndex + 1]?.startX ?? 1100),
      );
      let name = cleanDennysPdfName(
        clusterItems
          .filter((item) => item.x < cluster.nameEndX)
          .map((item) => item.str)
          .join(" "),
      );

      if (!name) {
        return;
      }

      if (/^[A-Za-z][A-Za-z &/'-]+:$/.test(name)) {
        categories[clusterIndex] = titleCase(name.replace(/:$/, ""));
        return;
      }

      const prefixedName = name.match(/^([A-Za-z][A-Za-z &/'-]{2,30}):\s+(.+)$/);

      if (prefixedName) {
        categories[clusterIndex] = titleCase(prefixedName[1]);
        name = cleanDennysPdfName(prefixedName[2]);
      }

      if (!isDennysPdfItemName(name)) {
        return;
      }

      const allergens = [];
      const mayContain = [];

      for (const item of clusterItems) {
        if (!/^(?:X|◊|A|F|SM|CO)$/i.test(item.str)) {
          continue;
        }

        const allergen = closestDennysAllergenColumn(item.x, cluster.columns);

        if (!allergen) {
          continue;
        }

        if (item.str === "◊") {
          mayContain.push(allergen);
        } else {
          allergens.push(allergen);
        }
      }

      records.push(
        createRecord({
          allergenSourceType: allergenSourceTypes.officialAllergenMenu,
          allergens,
          category: categories[clusterIndex],
          description: "Official Denny's allergen guide PDF.",
          imageUrl: null,
          mayContain,
          name,
          sourceKind: "pdf-matrix",
          sourceUrl: url,
          variantGroup: categories[clusterIndex],
        }),
      );
    });
  }

  return records;
}

function cleanDennysPdfName(value) {
  return cleanText(value)
    ?.replace(/\s+/g, " ")
    .trim();
}

function isDennysPdfItemName(name) {
  if (!isProbablyMenuItemName(name)) {
    return false;
  }

  return !/^(?:•|A =|F =|SM =|CO$|X -|◊ -|\(|of any allergen|the following code|A\s+A|A\s+ALLE|key$)/i.test(name) &&
    !/\b(?:registered trademarks|encourage any guest|allergen guide provides|shared preparation|ingredient suppliers|contains beef|made in the traditional method)\b/i.test(
      name,
    );
}

function closestDennysAllergenColumn(x, columns) {
  const closest = columns
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 12 ? closest.allergen : null;
}

async function extractSonicAllergenPdfItems(buffer, restaurant, url) {
  const rows = await readPdfPositionRows(buffer);
  const marks = await readPdfVectorMarks(buffer);
  const records = [];
  let currentCategory = null;
  let previousCandidate = null;

  for (const row of rows) {
    const leftText = cleanSonicPdfName(
      row.items
        .filter((item) => item.x < 210)
        .map((item) => item.str)
        .join(" "),
    );
    const rowText = cleanText(row.items.map((item) => item.str).join(" ")) ?? "";

    if (!leftText) {
      continue;
    }

    if (isSonicAllergenHeaderRow(rowText)) {
      currentCategory = titleCase(leftText);
      previousCandidate = null;
      continue;
    }

    if (!isSonicAllergenItemName(leftText) || !currentCategory) {
      continue;
    }

    if (/^\(.+\)$/.test(leftText) && previousCandidate && previousCandidate.pageNumber === row.pageNumber) {
      previousCandidate.name = `${previousCandidate.name} ${leftText}`;
      previousCandidate.yValues.push(row.y);
      continue;
    }

    const candidate = {
      category: currentCategory,
      name: leftText,
      pageNumber: row.pageNumber,
      yValues: [row.y],
    };
    records.push(candidate);
    previousCandidate = candidate;
  }

  return records.map((record) => {
    const rowMarks = marks.filter(
      (mark) =>
        mark.pageNumber === record.pageNumber &&
        record.yValues.some((y) => Math.abs(mark.centerY - y) <= 14),
    );
    const allergens = [];
    const mayContain = [];

    for (const mark of rowMarks) {
      const allergen = closestSonicAllergenColumn(mark.centerX);

      if (!allergen) {
        continue;
      }

      if (mark.type === "contains") {
        allergens.push(allergen);
      } else {
        mayContain.push(allergen);
      }
    }

    return createRecord({
      allergenSourceType: allergenSourceTypes.officialAllergenMenu,
      allergens,
      category: record.category,
      description: "Official Sonic national allergen guide.",
      imageUrl: null,
      mayContain,
      name: record.name,
      sourceKind: "pdf-matrix",
      sourceUrl: url,
      variantGroup: record.category,
    });
  });
}

function isSonicAllergenHeaderRow(text) {
  return /\bMILK\b/i.test(text) && /\bEGG\b/i.test(text) && /\bGLUTEN\b/i.test(text);
}

function isSonicAllergenItemName(name) {
  if (!name || name.length < 2 || name.length > 90) {
    return false;
  }

  if (/^(?:CONTAINS|MAY CONTAIN|Allergen|WARNING|Products with|This information|Ingredients in|Toast\.|gluten because|peanuts and|come in contact)/i.test(name)) {
    return false;
  }

  if (!/[a-z0-9]/i.test(name)) {
    return false;
  }

  if (skipNamePatterns.some((pattern) => pattern.test(name))) {
    return false;
  }

  return true;
}

function cleanSonicPdfName(value) {
  return cleanText(value)
    ?.replace(/[∆#Ω†]/g, "")
    .replace(/\s*[®™]\s*/g, " ")
    .replace(/\s+\)/g, ")")
    .replace(/\(\s+/g, "(")
    .replace(/\s+/g, " ")
    .trim();
}

function sonicAllergenColumns() {
  return [
    { allergen: "milk", x: 232 },
    { allergen: "egg", x: 267 },
    { allergen: "soy", x: 301 },
    { allergen: "tree-nut", x: 327 },
    { allergen: "peanut", x: 362 },
    { allergen: "fish", x: 401 },
    { allergen: "shellfish", x: 426 },
    { allergen: "wheat", x: 464 },
    { allergen: "gluten", x: 496 },
    { allergen: "sesame", x: 529 },
  ];
}

function closestSonicAllergenColumn(x) {
  const closest = sonicAllergenColumns()
    .map((column) => ({ ...column, distance: Math.abs(column.x - x) }))
    .sort((left, right) => left.distance - right.distance)[0];

  return closest?.distance <= 18 ? closest.allergen : null;
}

async function extractSubwayPdfItems(buffer, restaurant, url) {
  const records = [];
  const pdfjsLib = await getPdfJsLib();
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let currentCategory = restaurant.category;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const rows = groupPdfTextRows(textContent.items);

      for (const row of rows) {
        const nameParts = row
          .filter((item) => item.x < 205)
          .map((item) => item.str)
          .filter((part) => !/^(-- \d+ of \d+ --|U\.S\. Allergy|November|This list|manufacturers|ingredient changes|include some|may come|chart\.|●=|¹|\*\*|2 The|\*Only)/i.test(part));
        const name = cleanText(nameParts.join(" "));

        if (!name) {
          continue;
        }

        if (matrixSectionNames.has(name)) {
          currentCategory = name;
          continue;
        }

        if (!isProbablyMenuItemName(name)) {
          continue;
        }

        const itemName = normalizeSubwayItemName(name, currentCategory);

        const direct = [];
        const mayContain = [];
        const markers = row.filter((item) => /^(?:●|x|X|\*\*)$/.test(item.str.trim()));

        for (const marker of markers) {
          const allergens = closestSubwayAllergens(marker.x);

          if (marker.str === "●") {
            direct.push(...allergens);
          } else {
            mayContain.push(...allergens);
          }
        }

        if (direct.length === 0 && mayContain.length === 0) {
          continue;
        }

        records.push(
          createRecord({
            allergenSourceType: allergenSourceTypes.officialAllergenMenu,
            allergens: direct,
            category: currentCategory,
            description: "Official Subway U.S. Allergy and Sensitivity Information matrix.",
            imageUrl: null,
            mayContain,
            name: itemName,
            sourceKind: "pdf-matrix",
            sourceUrl: url,
          }),
        );
      }
    }
  } finally {
    await document.destroy();
  }

  return records;
}

function normalizeSubwayItemName(name, category) {
  if (category !== "Cheese") {
    return name;
  }

  const cheeseNames = new Map([
    ["American, Processed", "American Cheese, Processed"],
    ["Mozzarella, Shredded", "Mozzarella Cheese, Shredded"],
    ["Parmesan", "Parmesan Cheese"],
    ["Pepperjack", "Pepperjack Cheese"],
    ["Provolone", "Provolone Cheese"],
    ["Swiss", "Swiss Cheese"],
  ]);

  return cheeseNames.get(name) ?? name;
}

function groupPdfTextRows(items) {
  const rows = [];

  for (const item of items) {
    const text = cleanText(item.str);

    if (!text) {
      continue;
    }

    const x = item.transform[4];
    const y = item.transform[5];
    const row = rows.find((candidate) => Math.abs(candidate.y - y) < 2);

    if (row) {
      row.items.push({ str: text, x, y });
    } else {
      rows.push({ y, items: [{ str: text, x, y }] });
    }
  }

  return rows
    .map((row) => row.items.sort((a, b) => a.x - b.x))
    .sort((a, b) => b[0].y - a[0].y);
}

function closestSubwayAllergens(x) {
  const closest = subwayPdfColumns.reduce((best, column) => {
    const distance = Math.abs(column.x - x);
    return distance < best.distance ? { column, distance } : best;
  }, { column: null, distance: Number.POSITIVE_INFINITY });

  return closest.column && closest.distance < 13 ? [closest.column.id] : [];
}

function extractDocumentLinks($, url) {
  const links = [];

  $("a[href]").each((_index, element) => {
    const href = absolutizeUrl($(element).attr("href"), url);
    const text = cleanText($(element).text()) ?? "";

    if (!href) {
      return;
    }

    const haystack = `${href} ${text}`.toLowerCase();

    if (!/(allergen|nutrition|ingredient|pdf|xlsx|xls|csv)/.test(haystack)) {
      return;
    }

    if (!/\.(pdf|xlsx?|csv)(?:[?#]|$)/i.test(href)) {
      return;
    }

    links.push({ label: text, url: href });
  });

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 12);
}

function extractApiLinks($, url) {
  const links = [];

  $("meta[property='mmd']").each((_index, element) => {
    const $element = $(element);
    const baseUrl = $element.attr("data-baseUrl") ?? $element.attr("data-baseurl") ?? url;

    for (const attr of ["data-allergens", "data-ingredients"]) {
      const href = absolutizeUrl($element.attr(attr), baseUrl);

      if (href) {
        links.push({ label: attr, url: href });
      }
    }
  });

  return uniqueBy(links, (link) => normalizeUrl(link.url)).slice(0, 12);
}

function mergeRecords(records) {
  const byName = new Map();

  for (const record of records) {
    const key = similarityKey(record.name);

    if (!key || key.length < 2) {
      continue;
    }

    const current = byName.get(key);

    if (!current) {
      byName.set(key, normalizeRecord(record));
      continue;
    }

    const next = normalizeRecord(record);
    const nextPriority = itemSourcePriority[next.sourceKind] ?? 0;
    const currentPriority = itemSourcePriority[current.sourceKind] ?? 0;

    byName.set(key, {
      ...current,
      allergens: uniqueStrings([...current.allergens, ...next.allergens]),
      allergenSourceType:
        (allergenSourcePriority[next.allergenSourceType] ?? 0) >
        (allergenSourcePriority[current.allergenSourceType] ?? 0)
          ? next.allergenSourceType
          : current.allergenSourceType,
      category: next.category !== "Menu" && nextPriority >= currentPriority ? next.category : current.category,
      description: pickBestDescription(current.description, next.description),
      evidence: uniqueEvidence([...current.evidence, ...next.evidence]),
      imageUrl: current.imageUrl ?? next.imageUrl,
      ingredientsText: pickBestDescription(current.ingredientsText, next.ingredientsText),
      isConfigurable: current.isConfigurable || next.isConfigurable,
      mayContain: uniqueStrings([...current.mayContain, ...next.mayContain]),
      sourceKind: nextPriority > currentPriority ? next.sourceKind : current.sourceKind,
      sourceUrls: uniqueStrings([...current.sourceUrls, ...next.sourceUrls]),
      variantGroup: current.variantGroup ?? next.variantGroup,
    });
  }

  return Array.from(byName.values())
    .map((item) => ({
      id: slugify(item.name, { lower: true, strict: true }),
      name: item.name,
      category: item.category,
      description:
        item.description ??
        `${item.name} from the restaurant's current official menu or allergen source.`,
      imageUrl: item.imageUrl,
      ingredientsText: item.ingredientsText,
      isConfigurable: item.isConfigurable,
      allergenSourceType: item.allergenSourceType,
      allergens: item.allergens,
      mayContain: item.mayContain,
      sourceType: item.sourceKind,
      sourceUrls: item.sourceUrls,
      variantGroup: item.variantGroup,
      evidence: item.evidence.slice(0, 5),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeRecord(record) {
  return {
    allergens: uniqueStrings(record.allergens ?? []),
    allergenSourceType: record.allergenSourceType ?? allergenSourceTypes.unavailable,
    category: cleanText(record.category) ?? "Menu",
    description: cleanText(record.description),
    evidence: record.evidence ?? [
      {
        sourceKind: record.sourceKind,
        sourceUrl: record.sourceUrl,
        text: cleanText(record.evidenceText ?? record.description ?? record.name),
      },
    ],
    imageUrl: record.imageUrl ?? null,
    ingredientsText: cleanText(record.ingredientsText),
    isConfigurable: Boolean(record.isConfigurable),
    mayContain: uniqueStrings(record.mayContain ?? []),
    name: cleanMenuName(record.name),
    sourceKind: record.sourceKind,
    sourceUrls: uniqueStrings([record.sourceUrl].filter(Boolean)),
    variantGroup: cleanText(record.variantGroup),
  };
}

function createRecord({
  allergenSourceType,
  allergens,
  category,
  description,
  imageUrl,
  ingredientsText,
  evidenceText,
  mayContain,
  name,
  isConfigurable = false,
  sourceKind,
  sourceUrl,
  variantGroup = null,
}) {
  return {
    allergens: uniqueStrings(allergens),
    allergenSourceType: allergenSourceType ?? allergenSourceTypes.unavailable,
    category: cleanText(category) ?? "Menu",
    description: cleanText(description),
    evidenceText: cleanText(evidenceText),
    imageUrl,
    ingredientsText: cleanText(ingredientsText),
    isConfigurable,
    mayContain: uniqueStrings(mayContain),
    name: cleanMenuName(name),
    sourceKind,
    sourceUrl,
    variantGroup: cleanText(variantGroup),
  };
}

function findAllergensInDeclaredFoodText(text) {
  const declared = findDeclaredAllergensOnly(text);

  if (declared.length > 0) {
    return declared;
  }

  return findAllergensInText(text);
}

function findDeclaredAllergensOnly(text) {
  const directSections = [
    ...String(text).matchAll(/\b(?:contains|allergens?)\s*:?\s*([^.\n;]+)/gi),
  ]
    .map((match) => match[1])
    .filter((section) => findAllergensInText(section).length > 0);

  if (directSections.length > 0) {
    return uniqueStrings(directSections.flatMap(findAllergensInText));
  }

  return [];
}

function findMayContainAllergens(text) {
  const matches = [...String(text).matchAll(/\bmay contain\s*:?\s*([^.\n;]+)/gi)];
  return uniqueStrings(matches.flatMap((match) => findAllergensInText(match[1])));
}

function findAllergensInText(text) {
  const normalized = ` ${String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const matches = [];

  for (const allergen of allergenTerms) {
    if (
      allergen.terms.some((term) =>
        normalized.includes(` ${term.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `),
      )
    ) {
      matches.push(allergen.id);
    }
  }

  return uniqueStrings(matches);
}

function normalizeProviderAllergens(values) {
  return uniqueStrings(
    values.flatMap((value) => {
      const normalized = String(value).toLowerCase().replace(/[^a-z0-9-]+/g, "");
      const mapped = providerAllergenCodes.get(normalized);

      return mapped ? [mapped] : findAllergensInText(value);
    }),
  );
}

function getOfficialFoodDisclosure(node, kind) {
  const allergenText = stringifySelectedFields(node, [
    "allergen",
    "allergens",
    "allergenInfo",
    "allergenInformation",
    "contains",
    "dietaryRestrictions",
  ]);
  const ingredientText = stringifySelectedFields(node, [
    "ingredients",
    "ingredientStatement",
  ]);
  const mayContainText = stringifySelectedFields(node, ["mayContain", "mayContains"]);

  if (allergenText) {
    return {
      allergenSourceType:
        kind === sourceTypes.allergen
          ? allergenSourceTypes.officialAllergenMenu
          : allergenSourceTypes.officialProductAllergenSection,
      directAllergens: uniqueStrings([
        ...findDeclaredAllergensOnly(allergenText),
        ...findAllergensInText(allergenText),
      ]),
      ingredientsText: ingredientText,
      mayContain: findMayContainAllergens(`${allergenText} ${mayContainText}`),
    };
  }

  if (ingredientText) {
    return {
      allergenSourceType: allergenSourceTypes.officialIngredients,
      directAllergens: findAllergensInDeclaredFoodText(ingredientText),
      ingredientsText: ingredientText,
      mayContain: findMayContainAllergens(`${ingredientText} ${mayContainText}`),
    };
  }

  if (mayContainText) {
    return {
      allergenSourceType:
        kind === sourceTypes.allergen
          ? allergenSourceTypes.officialAllergenMenu
          : allergenSourceTypes.officialProductAllergenSection,
      directAllergens: [],
      ingredientsText: null,
      mayContain: findAllergensInText(mayContainText),
    };
  }

  return {
    allergenSourceType: allergenSourceTypes.unavailable,
    directAllergens: [],
    ingredientsText: null,
    mayContain: [],
  };
}

function getScopedDomDisclosure($element, kind) {
  const allergenText = cleanText(
    $element.find("[class*='allergen'], [id*='allergen'], [class*='contains'], [id*='contains']").text(),
  );
  const ingredientText = cleanText(
    $element.find("[class*='ingredient'], [id*='ingredient']").text(),
  );

  if (allergenText) {
    return {
      allergenSourceType:
        kind === sourceTypes.allergen
          ? allergenSourceTypes.officialAllergenMenu
          : allergenSourceTypes.officialProductAllergenSection,
      directAllergens: uniqueStrings([
        ...findDeclaredAllergensOnly(allergenText),
        ...findAllergensInText(allergenText),
      ]),
      ingredientsText: ingredientText,
      mayContain: findMayContainAllergens(allergenText),
    };
  }

  if (ingredientText) {
    return {
      allergenSourceType: allergenSourceTypes.officialIngredients,
      directAllergens: findAllergensInDeclaredFoodText(ingredientText),
      ingredientsText: ingredientText,
      mayContain: findMayContainAllergens(ingredientText),
    };
  }

  return {
    allergenSourceType: allergenSourceTypes.unavailable,
    directAllergens: [],
    ingredientsText: null,
    mayContain: [],
  };
}

function stringifySelectedFields(node, keys) {
  const selected = {};

  for (const key of keys) {
    if (node?.[key] !== undefined) {
      selected[key] = node[key];
    }
  }

  return Object.keys(selected).length > 0 ? JSON.stringify(selected).slice(0, 5000) : "";
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (const arg of rawArgs) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key, ...value] = arg.slice(2).split("=");
    parsed[key] = value.length > 0 ? value.join("=") : "true";
  }

  return parsed;
}

function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isCliEntry() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function decodeJavaScriptString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\u002D/g, "-");
  }
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function cleanText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

function cleanMenuName(name) {
  return cleanText(name)
    ?.replace(/\s+\|.*$/, "")
    .replace(/\s+-\s+Nutrition.*$/i, "")
    .replace(/\s+Menu Item$/i, "")
    .trim();
}

function isProbablyMenuItemName(name) {
  const cleaned = cleanMenuName(name);

  if (!cleaned || cleaned.length < 3 || cleaned.length > 90) {
    return false;
  }

  if (/^(?:name|description|nutrition allergen statement)$/i.test(cleaned)) {
    return false;
  }

  if (!/[a-z]/i.test(cleaned)) {
    return false;
  }

  if (skipNamePatterns.some((pattern) => pattern.test(cleaned))) {
    return false;
  }

  if (cleaned.includes(";")) {
    return false;
  }

  if (cleaned.split(/\s+/).length >= 7 && /[.!?]$/.test(cleaned)) {
    return false;
  }

  if (cleaned.split(/\s+/).length > 6 && cleaned.includes(",")) {
    return false;
  }

  if (/^(click|view|download|order|select|choose)\b/i.test(cleaned)) {
    return false;
  }

  return true;
}

function isCategoryLine(line) {
  return (
    /^[A-Z0-9 &+/'()-]{3,55}$/.test(line) &&
    /[A-Z]{3}/.test(line) &&
    !/\d{2,}/.test(line) &&
    !/\b(CALORIES|SODIUM|CARBS|PROTEIN|SUGARS|FAT|SERVING)\b/i.test(line)
  );
}

function summarizeIngredientText(text) {
  const cleaned = cleanText(text);

  if (!cleaned) {
    return null;
  }

  return cleaned.length > 240 ? `${cleaned.slice(0, 237).trim()}...` : cleaned;
}

function inferCategoryFromUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.replace(/\.(html?|aspx?)$/i, "").replace(/[-_]+/g, " "));
    const fullMenuIndex = segments.findIndex((segment) => /^full menu$/i.test(segment));
    const foodIndex = segments.findIndex((segment) => /^food$/i.test(segment));

    if (fullMenuIndex >= 0 && segments[fullMenuIndex + 1]) {
      return titleCase(segments[fullMenuIndex + 1]);
    }

    if (foodIndex >= 0 && segments[foodIndex + 1] && segments[foodIndex + 2]) {
      return titleCase(segments[foodIndex + 1]);
    }

    if (segments.some((segment) => /^product$/i.test(segment))) {
      return null;
    }

    const category = segments.findLast(
      (segment) => !/^(us|en|menu|product|food|order|pages|content)$/i.test(segment),
    );

    return category ? titleCase(category) : null;
  } catch {
    return null;
  }
}

function isLikelyProductHref(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\/(product|menu|food|items?|order)\//.test(pathname) || /\/product\//.test(pathname);
  } catch {
    return false;
  }
}

function isSameSite(a, b) {
  try {
    const first = new URL(a);
    const second = new URL(b);
    return first.hostname.replace(/^www\./, "") === second.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function absolutizeUrl(value, baseUrl) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return null;
  }

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function pickString(value) {
  if (typeof value === "string") {
    return cleanText(value);
  }

  if (value && typeof value === "object") {
    if (typeof value.name === "string") {
      return cleanText(value.name);
    }

    if (typeof value.title === "string") {
      return cleanText(value.title);
    }
  }

  return null;
}

function pickImage(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return pickImage(value[0]);
  }

  if (value && typeof value === "object") {
    return value.url ?? value.src ?? value.contentUrl ?? null;
  }

  return null;
}

function pickBestDescription(current, next) {
  const currentClean = cleanText(current);
  const nextClean = cleanText(next);

  if (!currentClean) {
    return nextClean;
  }

  if (!nextClean) {
    return currentClean;
  }

  if (nextClean.length > currentClean.length && nextClean.length < 320) {
    return nextClean;
  }

  return currentClean;
}

function titleCase(value) {
  return cleanText(value)
    ?.toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function similarityKey(value) {
  return cleanText(value)
    ?.toLowerCase()
    .replace(/®|™|\*/g, "")
    .replace(/[()]/g, " ")
    .replace(/\b(?:the|a|an|with|and|or|new|classic)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .join("-");
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = getKey(value);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function uniqueEvidence(values) {
  return uniqueBy(
    values.filter((value) => value?.sourceUrl),
    (value) => `${value.sourceKind}:${value.sourceUrl}:${value.text}`,
  );
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function detectContentKind(url, contentType, buffer) {
  const normalizedType = contentType.toLowerCase();

  if (normalizedType.includes("pdf") || /\.pdf(?:[?#]|$)/i.test(url)) {
    return "pdf";
  }

  if (normalizedType.includes("json")) {
    return "json";
  }

  if (normalizedType.includes("xml") || /\.xml(?:[?#]|$)/i.test(url)) {
    return "xml";
  }

  if (normalizedType.includes("html") || buffer.toString("utf8", 0, 100).includes("<html")) {
    return "html";
  }

  return "text";
}

function extensionFor(url, contentType) {
  if (/\.pdf(?:[?#]|$)/i.test(url) || contentType.toLowerCase().includes("pdf")) {
    return "pdf";
  }

  if (/\.json(?:[?#]|$)/i.test(url) || contentType.toLowerCase().includes("json")) {
    return "json";
  }

  if (/\.xml(?:[?#]|$)/i.test(url) || contentType.toLowerCase().includes("xml")) {
    return "xml";
  }

  if (/\.csv(?:[?#]|$)/i.test(url) || contentType.toLowerCase().includes("csv")) {
    return "csv";
  }

  return "html";
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.slice(0, 80);
  } catch {
    return String(url).slice(0, 80);
  }
}
