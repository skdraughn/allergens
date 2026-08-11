import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const repositoryPath = "src/data/generated/restaurants.generated.json";
const cacheDir = "/tmp/smoothie-king-official";
const listingUrl = "https://www.smoothieking.com/menu/smoothies/";
const origin = "https://www.smoothieking.com";
const todayIso = new Date().toISOString();

const allergenMap = new Map([
  ["egg", "egg"],
  ["eggs", "egg"],
  ["milk", "milk"],
  ["soy", "soy"],
  ["soybean", "soy"],
  ["soybeans", "soy"],
  ["wheat", "wheat"],
  ["gluten", "gluten"],
  ["peanut", "peanut"],
  ["peanuts", "peanut"],
  ["tree nut", "tree-nut"],
  ["tree nuts", "tree-nut"],
  ["treenut", "tree-nut"],
  ["treenuts", "tree-nut"],
  ["coconut", "tree-nut"],
  ["coconuts", "tree-nut"],
  ["almond", "tree-nut"],
  ["almonds", "tree-nut"],
  ["sesame", "sesame"],
  ["fish", "fish"],
  ["shellfish", "shellfish"],
]);

await mkdir(cacheDir, { recursive: true });

const repository = JSON.parse(await readFile(repositoryPath, "utf8"));
const restaurant = repository.restaurants.find((candidate) => candidate.id === "smoothie-king");

if (!restaurant) {
  throw new Error("Missing smoothie-king restaurant in generated repository.");
}

const listingHtml = await fetchCached(listingUrl, "smoothies.html");
const listingData = parseNextData(listingHtml, listingUrl);
const products = listingData.props?.pageProps?.searchProducts ?? [];
const productSummaries = products
  .filter((product) => product?.slug && product?.uri && product?.title)
  .map((product) => ({
    slug: product.slug,
    title: product.title,
    uri: product.uri,
    url: new URL(product.uri, origin).toString(),
  }));

const officialBySlug = new Map();
const failed = [];

for (const product of productSummaries) {
  try {
    const html = await fetchCached(product.url, `${product.slug}.html`);
    const data = parseNextData(html, product.url);
    const smoothie = data.props?.pageProps?.smoothie;
    const fields = smoothie?.productPageFields ?? {};
    const nutrition = smoothie?.nutritionInfoSmoothieEnhancer ?? {};
    const ingredients =
      fields.ingredientsText ||
      nutrition.ingredients?.nodes?.map((ingredient) => ingredient.title).filter(Boolean).join(", ") ||
      product.ingredientsText ||
      null;
    const allergens = parseAllergens(nutrition.allergens);
    const ingredientEvidence = nutrition.ingredients?.nodes
      ?.map((ingredient) => ({
        ingredient: ingredient.title,
        allergens: parseAllergens(ingredient.nutritionInfoIngredients?.allergens),
      }))
      .filter((entry) => entry.ingredient && entry.allergens.length > 0);

    officialBySlug.set(product.slug, {
      allergens,
      allergenText: nutrition.allergens ?? "",
      ingredientEvidence: ingredientEvidence ?? [],
      ingredients,
      title: smoothie?.title ?? product.title,
      url: product.url,
    });
  } catch (error) {
    failed.push({ slug: product.slug, url: product.url, error: error.message });
  }
}

let matched = 0;
let officialWithAllergens = 0;
const unmatched = [];

for (const item of restaurant.items ?? []) {
  const slug = baseSmoothieKingSlug(item);
  const official = findOfficialProduct(slug);

  if (!official) {
    unmatched.push({ id: item.id, name: item.name, slug });
    continue;
  }

  const allergens = uniqueStrings(official.allergens);
  const evidence = [
    {
      source: "official",
      sourceUrl: official.url,
      text: official.allergenText
        ? `Official Smoothie King allergen disclosure: ${official.allergenText}.`
        : "Official Smoothie King product allergen disclosure lists no allergens.",
    },
  ];

  for (const ingredient of official.ingredientEvidence) {
    evidence.push({
      source: "official",
      sourceUrl: official.url,
      text: `${ingredient.ingredient}: ${ingredient.allergens.join(", ")}`,
    });
  }

  item.allergenSourceType = "official-allergen-menu";
  item.allergenSource = "Official Smoothie King product allergen disclosure.";
  item.allergens = allergens;
  item.mayContain = [];
  item.sourceType = "official-api";
  item.sourceUrls = uniqueStrings([...(item.sourceUrls ?? []), official.url]);
  item.ingredientsText = item.ingredientsText || official.ingredients;
  item.evidence = evidence;

  matched += 1;
  if (allergens.length > 0) {
    officialWithAllergens += 1;
  }
}

restaurant.officialAllergenStatus = matched > 0 ? "extracted" : "not-found";
restaurant.officialAllergenRemediationBucket = matched > 0 ? "none" : "needs-product-page-allergen-parser";
restaurant.allergenDataStatus = {
  ...(restaurant.allergenDataStatus ?? {}),
  officialItemCount: matched,
  officialTotal: matched,
  totalItemCount: restaurant.items?.length ?? 0,
  officialCoverageRatio: restaurant.items?.length ? matched / restaurant.items.length : 0,
  bucket: matched > 0 ? "official-full" : "source-found-unparsed",
};
restaurant.sourceFamily = "official-api";
restaurant.parserProfile = "smoothie-king-official-product-pages";
restaurant.sourceProfile = "smoothie-king:official-next-product-allergens";
restaurant.sourceUrls = uniqueStrings([
  ...(restaurant.sourceUrls ?? []),
  listingUrl,
  "https://www.smoothieking.com/nutrition/",
]);
restaurant.sourceStatus = {
  ...(restaurant.sourceStatus ?? {}),
  officialAllergenDistributionReview: {
    classification: matched > 0 ? "official-product-page-allergens-extracted" : "manual-review-needed",
    decision:
      "Official Smoothie King product pages expose nutritionInfoSmoothieEnhancer.allergens and ingredient allergen fields in Next.js data.",
    reviewedAt: todayIso,
  },
  smoothieKingOfficialRepair: {
    generatedAt: todayIso,
    officialProducts: officialBySlug.size,
    failedProductPages: failed.length,
    matchedItems: matched,
    officialWithAllergens,
    unmatchedItems: unmatched.length,
  },
};

repository.generatedAt = todayIso;
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce((sum, current) => sum + (current.items?.length ?? 0), 0);
repository.metadata = {
  ...(repository.metadata ?? {}),
  restaurantCount: repository.restaurantCount,
  itemCount: repository.itemCount,
  generatedAt: todayIso,
  smoothieKingOfficialRepair: {
    generatedAt: todayIso,
    officialProducts: officialBySlug.size,
    failedProductPages: failed.length,
    matchedItems: matched,
    officialWithAllergens,
    unmatchedItems: unmatched.length,
    failed: failed.slice(0, 20),
    unmatched: unmatched.slice(0, 30),
  },
};

await writeFile(repositoryPath, `${JSON.stringify(repository, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      restaurant: "smoothie-king",
      officialProducts: officialBySlug.size,
      failedProductPages: failed.length,
      matchedItems: matched,
      officialWithAllergens,
      unmatchedItems: unmatched.length,
      sampleUnmatched: unmatched.slice(0, 10),
    },
    null,
    2,
  ),
);

function baseSmoothieKingSlug(item) {
  return String(item.id ?? slugify(item.name))
    .replace(/-(20|32|44)-ounce$/i, "")
    .replace(/-kids-size$/i, "")
    .replace(/-small$/i, "")
    .replace(/-medium$/i, "")
    .replace(/-large$/i, "");
}

function findOfficialProduct(slug) {
  if (officialBySlug.has(slug)) {
    return officialBySlug.get(slug);
  }

  const aliases = [
    slug.replace(/^kids-/, ""),
    slug === "kids-lil-angel" ? "lil-angel" : null,
    slug === "kids-cw-jr" ? "cw-jr" : null,
    slug === "kids-strawberry-bluegurt-blitz" ? "strawberry-bluegurt-blitz" : null,
  ].filter(Boolean);

  for (const alias of aliases) {
    if (officialBySlug.has(alias)) {
      return officialBySlug.get(alias);
    }
  }

  return null;
}

async function fetchCached(url, filename) {
  const filePath = path.join(cacheDir, filename);
  if (existsSync(filePath)) {
    return readFile(filePath, "utf8");
  }

  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${response.statusText} for ${url}`);
  }

  const text = await response.text();
  await writeFile(filePath, text);
  return text;
}

function parseNextData(html, url) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(`Missing __NEXT_DATA__ for ${url}`);
  }
  return JSON.parse(match[1]);
}

function parseAllergens(value) {
  if (value == null || String(value).trim() === "") {
    return [];
  }

  return uniqueStrings(
    String(value)
      .split(/[,;/]| and /i)
      .map((part) => part.trim().toLowerCase())
      .map((part) => part.replace(/\([^)]*\)/g, "").trim() || part.match(/\(([^)]*)\)/)?.[1]?.trim() || part)
      .map((part) => allergenMap.get(part) ?? allergenMap.get(part.replace(/\s+/g, "")) ?? null)
      .filter(Boolean),
  );
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™']/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}
