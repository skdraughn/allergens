import { readFile, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import * as cheerio from "cheerio";

import { officialEvidenceClassification } from "./menu-item-quality.mjs";

const execFile = promisify(execFileCallback);

const repositoryPath = "src/data/generated/restaurants.generated.json";
const staticRestaurantPath = "src/data/restaurants.ts";
const modAllergenPath = "/tmp/allergy-official-sources/mod-allergen-browserlike.html";
const modAllergenUrl = "https://modpizza.com/allergen/";
const polloPdfUrl =
  "https://cdn.prod.website-files.com/5e34767f6a3a0e8257cafc5c/69f35ae88e7b611f9ebe5ae6_Campero%20Nutritionals%20and%20Allergens%204-26.pdf";

const allergenLabels = new Map([
  ["MILK", "milk"],
  ["EGGS", "egg"],
  ["WHEAT / GLUTEN", "wheat"],
  ["WHEAT/ GLUTEN", "wheat"],
  ["WHEAT GLUTEN", "wheat"],
  ["CRUSTACEAN SHELLFISH", "shellfish"],
  ["FISH", "fish"],
  ["SOYBEAN", "soy"],
  ["PEANUTS", "peanut"],
  ["TREE NUTS", "tree-nut"],
  ["SESAME", "sesame"],
]);

const polloOfficialRules = [
  { match: /^traditional chicken/, allergens: ["wheat", "soy"], mayContain: ["gluten"] },
  { match: /^campero nuggets$/, allergens: ["egg", "milk", "wheat", "soy"], mayContain: ["gluten"] },
  { match: /^campero chicken empanada$/, allergens: ["egg", "milk", "wheat", "soy"], mayContain: ["gluten"] },
  { match: /^breakfast sandwich/, allergens: ["egg", "milk", "wheat", "soy"], mayContain: ["gluten"] },
  {
    match: /^campero spicy sandwich|^campero sandwich|^buffalo chicken sandwich|^queso bacon chicken sandwich/,
    allergens: ["egg", "milk", "wheat", "soy"],
    mayContain: ["gluten"],
  },
  { match: /^campero chicken bowl/, allergens: ["egg", "milk", "wheat", "soy"], mayContain: ["gluten"] },
  { match: /^corn tortillas|^campero beans|^white rice|^pepsi|^jamaica|^lemonade|^mango|^sugar|^splenda|^balsamic vinaigrette|^salsa roja|^salsa verde|^mild guacamole salsa|^maple syrup|^cholula hot sauce/, allergens: [], mayContain: [] },
  { match: /^dinner roll|^flour tortillas/, allergens: ["wheat"], mayContain: ["gluten"] },
  { match: /^french fries|^sweet plantains|^yuca fries|^hashbrown/, allergens: ["egg", "milk", "wheat", "soy"], mayContain: ["gluten"] },
  { match: /^campero coleslaw/, allergens: ["egg", "milk"], mayContain: [] },
  { match: /^black beans|^sour cream/, allergens: ["milk"], mayContain: [] },
  { match: /^campero rice/, allergens: ["soy"], mayContain: [] },
  { match: /^mini waffles and sausage/, allergens: ["egg", "milk", "wheat"], mayContain: ["gluten"] },
  { match: /^bacon breakfast empanada/, allergens: ["egg", "milk", "wheat", "soy"], mayContain: ["gluten"] },
  { match: /^campero nuggets & mini waffles/, allergens: ["egg", "milk", "wheat", "soy"], mayContain: ["gluten"] },
  { match: /^sausage, egg, cheese sandwich|^bacon, egg, cheese sandwich/, allergens: ["egg", "milk", "wheat", "sesame", "soy"], mayContain: ["gluten"] },
  { match: /^horchata/, allergens: ["peanut", "milk", "soy"], mayContain: [] },
  { match: /^churro/, allergens: ["egg", "milk", "wheat", "soy"], mayContain: ["gluten"] },
  { match: /^traditional baked flan/, allergens: ["egg", "milk"], mayContain: [] },
  { match: /^buffalo sauce/, allergens: ["milk", "soy"], mayContain: [] },
  { match: /^ranch sauce/, allergens: ["egg", "milk"], mayContain: [] },
  { match: /^barbecue sauce/, allergens: [], mayContain: ["gluten"] },
  { match: /^campero signature sauce/, allergens: ["egg"], mayContain: [] },
  { match: /^hot green sauce/, allergens: ["wheat"], mayContain: ["gluten"] },
];

const officialSourceRepairs = {
  "famous-daves": {
    status: "not-found",
    bucket: "no-official-item-allergen-source",
    note:
      "Nutritionix provides nutrition rows here, but its allergen filters return the full menu for every allergen and item labels do not expose allergens.",
  },
  honeygrow: {
    status: "not-found",
    bucket: "official-policy-only",
    note:
      "Official Honeygrow pages provide menu descriptions and allergy/cross-contact policy, but no verified item-level allergen table was exposed in this pass.",
  },
  "smoothie-king": {
    status: "not-found",
    bucket: "needs-product-page-allergen-parser",
    note:
      "Smoothie King publishes product-page ingredients/allergen cues, but the current generated menu is Nutritionix-based and the Nutritionix item labels do not expose allergens.",
  },
};

const todayIso = new Date().toISOString();

const repository = JSON.parse(await readFile(repositoryPath, "utf8"));
const restaurants = repository.restaurants ?? [];
const byId = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));

await ensureModAllergenHtml();

const modMap = await parseModAllergenMap();
const modStats = applyModAllergenMap(byId.get("mod-pizza"), modMap);
const polloStats = applyPolloCamperoMatrix(byId.get("pollo-campero"));
const statusStats = applyOfficialSourceStatusRepairs(byId);
const shellStats = await promoteAccommodationShells(repository);

repository.generatedAt = todayIso;
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce(
  (sum, restaurant) => sum + (restaurant.items?.length ?? 0),
  0,
);
repository.metadata = {
  ...(repository.metadata ?? {}),
  restaurantCount: repository.restaurantCount,
  itemCount: repository.itemCount,
  generatedAt: todayIso,
  parseableOfficialAndAccommodationRepair: {
    generatedAt: todayIso,
    modPizza: modStats,
    polloCampero: polloStats,
    sourceStatusRepairs: statusStats,
    accommodationShells: shellStats,
  },
};

await writeFile(repositoryPath, `${JSON.stringify(repository, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      repositoryPath,
      restaurantCount: repository.restaurantCount,
      itemCount: repository.itemCount,
      modPizza: modStats,
      polloCampero: polloStats,
      sourceStatusRepairs: statusStats,
      accommodationShells: shellStats,
    },
    null,
    2,
  ),
);

async function ensureModAllergenHtml() {
  try {
    const existing = await readFile(modAllergenPath, "utf8");
    if (existing.includes("Allergen Information") && existing.includes("menu-item__allergen")) {
      return;
    }
  } catch {}

  await execFile("curl", [
    "-L",
    "--compressed",
    "-A",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "-H",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H",
    "Accept-Language: en-US,en;q=0.9",
    modAllergenUrl,
    "-o",
    modAllergenPath,
  ]);
}

async function parseModAllergenMap() {
  const html = await readFile(modAllergenPath, "utf8");
  const $ = cheerio.load(html);
  const map = new Map();

  $(".row.menu-item").each((_, row) => {
    const itemName = normalizeName($(row).find(".menu-item__name strong").first().text());
    if (!itemName) return;

    const allergens = new Set();
    const mayContain = new Set();
    const ingredientsText = cleanText($(row).find(".ingredients").first().text()) || null;

    $(row)
      .find(".warnings .allergen-cell")
      .each((__, cell) => {
        const label = normalizeAllergenLabel($(cell).find(".allergen-label").first().text());
        const allergen = allergenLabels.get(label);
        if (!allergen) return;

        const contains = $(cell).find(".contains");
        if (!contains.length) return;

        if (contains.hasClass("contains--never")) {
          mayContain.add(allergen);
          if (allergen === "wheat") mayContain.add("gluten");
          return;
        }

        allergens.add(allergen);
        if (allergen === "wheat") allergens.add("gluten");
      });

    map.set(itemName, {
      allergens: [...allergens],
      ingredientsText,
      mayContain: [...mayContain],
    });
  });

  return map;
}

function applyModAllergenMap(restaurant, modMap) {
  if (!restaurant) return { matched: 0, mapSize: modMap.size };

  let matched = 0;
  for (const item of restaurant.items ?? []) {
    const candidates = modNameCandidates(item.name);
    const official = candidates.map((candidate) => modMap.get(candidate)).find(Boolean);
    if (!official) continue;

    matched += 1;
    item.allergens = uniqueStrings(official.allergens);
    item.mayContain = uniqueStrings(official.mayContain);
    item.ingredientsText = item.ingredientsText ?? official.ingredientsText;
    item.allergenSourceType = "official-allergen-menu";
    item.sourceType = "official-site";
    item.sourceUrls = uniqueStrings([...(item.sourceUrls ?? []), modAllergenUrl]);
    item.evidence = [
      ...(item.evidence ?? []),
      {
        sourceKind: "official-allergen-table",
        sourceUrl: modAllergenUrl,
        text: official.ingredientsText,
      },
    ];
  }

  setOfficialExtractedStatus(restaurant, matched, {
    sourceFamily: "generic-website",
    parserProfile: "mod-pizza-official-ingredient-allergen-table",
    sourceProfile: "mod-pizza:official-ingredient-allergen-table",
    sourceUrl: modAllergenUrl,
  });

  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    officialAllergenDistributionReview: {
      classification: "supported-direct-ingredient-allergens",
      decision: "parsed-official-mod-ingredient-allergen-table",
      reviewedAt: todayIso,
    },
  };

  return { matched, mapSize: modMap.size };
}

function applyPolloCamperoMatrix(restaurant) {
  if (!restaurant) return { matched: 0, rules: polloOfficialRules.length };

  let matched = 0;
  for (const item of restaurant.items ?? []) {
    const name = normalizeName(item.name);
    const rule = polloOfficialRules.find(({ match }) => match.test(name));
    if (!rule) continue;

    matched += 1;
    item.allergens = uniqueStrings(rule.allergens);
    item.mayContain = uniqueStrings(rule.mayContain);
    item.allergenSourceType = "official-allergen-menu";
    item.sourceType = "official-site";
    item.sourceUrls = uniqueStrings([...(item.sourceUrls ?? []), polloPdfUrl]);
    item.evidence = [
      ...(item.evidence ?? []),
      {
        sourceKind: "official-pdf-allergen-matrix",
        sourceUrl: polloPdfUrl,
        text: "Pollo Campero Nutritionals and Allergens, modified April 2026.",
      },
    ];
  }

  setOfficialExtractedStatus(restaurant, matched, {
    sourceFamily: "pdf-allergen-matrix",
    parserProfile: "pollo-campero-official-allergen-matrix",
    sourceProfile: "pollo-campero:official-pdf-allergen-matrix",
    sourceUrl: polloPdfUrl,
  });

  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    officialAllergenDistributionReview: {
      classification: "supported-direct-and-sensitivity-matrix",
      decision: "parsed-official-pollo-campero-pdf-matrix",
      reviewedAt: todayIso,
    },
  };

  return { matched, rules: polloOfficialRules.length };
}

function applyOfficialSourceStatusRepairs(byId) {
  const repaired = [];
  for (const [id, repair] of Object.entries(officialSourceRepairs)) {
    const restaurant = byId.get(id);
    if (!restaurant) continue;

    if (repair.status !== "extracted") {
      for (const item of restaurant.items ?? []) {
        if (!/official/i.test(item.allergenSourceType ?? "")) {
          continue;
        }

        item.allergenSourceType = "unavailable";
        item.allergenSource = "Official item-level allergen evidence unavailable for this item.";
        item.allergens = [];
        item.mayContain = [];
        item.evidence = (item.evidence ?? []).filter(
          (entry) =>
            !/nutritionix|online nutrition (?:and allergen )?guide|official-api/i.test(
              `${entry?.sourceKind ?? ""} ${entry?.sourceUrl ?? ""} ${entry?.text ?? ""}`,
            ),
        );
        item.sourceUrls = (item.sourceUrls ?? []).filter((url) => !/nutritionix\.com/i.test(String(url ?? "")));
      }
    }

    restaurant.officialAllergenStatus = repair.status;
    restaurant.officialAllergenRemediationBucket = repair.bucket;
    restaurant.allergenDataStatus = {
      ...(restaurant.allergenDataStatus ?? {}),
      officialItemCount: officialItemCount(restaurant),
    };
    restaurant.sourceStatus = {
      ...(restaurant.sourceStatus ?? {}),
      officialAllergenDistributionReview: {
        classification: repair.bucket,
        decision: repair.note,
        reviewedAt: todayIso,
      },
    };
    repaired.push(id);
  }
  return { repaired };
}

async function promoteAccommodationShells(repository) {
  const source = await readFile(staticRestaurantPath, "utf8");
  const policies = extractAccommodationPolicies(source);
  const shells = extractPolicyRestaurantCalls(source).map((shell) => {
    const policy = policies[shell.id];
    return {
      allergyAccommodationPolicy: policy,
      allergenDataStatus: {
        officialItemCount: 0,
        officialEvidence: officialEvidenceClassification({ items: [] }),
      },
      brandKey: shell.id.replace(/-dc$/, "").replace(/-va$/, ""),
      category: shell.category,
      city: shell.city ?? "Washington",
      coveragePercent: 0,
      coverageStatus: "complete",
      domain: shell.domain,
      guideLabel: "Official accommodation source",
      guideUrl: shell.guideUrl,
      id: shell.id,
      items: [],
      logoMonogram: monogramForName(shell.name),
      name: shell.name,
      officialAllergenRemediationBucket: "accommodation-policy-only",
      officialAllergenStatus: "not-applicable",
      parserProfile: "accommodation-policy-shell",
      rank: shell.rank,
      region: shell.region ?? "DC",
      sourceFamily: "manual-review",
      sourceProfile: "accommodation-policy",
      sourceStatus: {
        failed: 0,
        ok: 1,
        total: 1,
        extractedFoodItemCount: 0,
        accommodationOnly: true,
        officialEvidenceBucket: officialEvidenceClassification({ items: [] }).bucket,
      },
      sourceUrls: uniqueStrings([shell.guideUrl, policy?.sourceUrl].filter(Boolean)),
      type: "local",
      updated: "2026-07",
    };
  });

  const existing = new Map(repository.restaurants.map((restaurant, index) => [restaurant.id, index]));
  let added = 0;
  let updated = 0;

  for (const shell of shells) {
    if (existing.has(shell.id)) {
      const index = existing.get(shell.id);
      const existingRestaurant = repository.restaurants[index];
      repository.restaurants[index] = withOfficialEvidenceMetadata({
        ...existingRestaurant,
        ...shell,
        items: existingRestaurant.items?.length ? existingRestaurant.items : shell.items,
      });
      updated += 1;
      continue;
    }
    repository.restaurants.push(withOfficialEvidenceMetadata(shell));
    added += 1;
  }

  repository.restaurants.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name));
  return { added, updated, totalShells: shells.length };
}

function setOfficialExtractedStatus(restaurant, matched, { parserProfile, sourceFamily, sourceProfile, sourceUrl }) {
  restaurant.officialAllergenStatus = matched > 0 ? "extracted" : "not-found";
  restaurant.officialAllergenRemediationBucket = matched > 0 ? "none" : "no-official-item-allergen-source";
  restaurant.allergenDataStatus = {
    ...(restaurant.allergenDataStatus ?? {}),
    officialItemCount: officialItemCount(restaurant),
    officialEvidence: officialEvidenceClassification(restaurant),
  };
  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    officialEvidenceBucket: officialEvidenceClassification(restaurant).bucket,
  };
  restaurant.parserProfile = parserProfile;
  restaurant.sourceFamily = sourceFamily;
  restaurant.sourceProfile = sourceProfile;
  restaurant.sourceUrls = uniqueStrings([...(restaurant.sourceUrls ?? []), sourceUrl]);
}

function withOfficialEvidenceMetadata(restaurant) {
  const officialEvidence = officialEvidenceClassification(restaurant);
  return {
    ...restaurant,
    allergenDataStatus: {
      ...(restaurant.allergenDataStatus ?? {}),
      officialItemCount: officialItemCount(restaurant),
      officialEvidence,
    },
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      officialEvidenceBucket: officialEvidence.bucket,
    },
  };
}

function officialItemCount(restaurant) {
  return (restaurant.items ?? []).filter((item) => /official/i.test(item.allergenSourceType ?? "")).length;
}

function monogramForName(name) {
  const words = String(name)
    .replace(/&/g, " and ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .filter((word) => !/^(and|at|the|of)$/i.test(word));
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function extractAccommodationPolicies(source) {
  const start = source.indexOf("const allergyAccommodationPolicies = ");
  const end = source.indexOf("} satisfies Record<string, AllergyAccommodationPolicy>;", start);
  if (start < 0 || end < 0) throw new Error("Could not find allergyAccommodationPolicies object.");
  const objectSource = source.slice(start + "const allergyAccommodationPolicies = ".length, end + 1);
  return Function(`return (${objectSource});`)();
}

function extractPolicyRestaurantCalls(source) {
  const calls = [];
  const starterStart = source.indexOf("const starterRestaurants");
  const starterEnd = source.indexOf("];", starterStart);
  const block = source.slice(starterStart, starterEnd);
  const regex = /policyRestaurant\(\{([\s\S]*?)\}\),/g;
  let match;
  while ((match = regex.exec(block))) {
    calls.push(Function(`return ({${match[1]}});`)());
  }
  return calls;
}

function modNameCandidates(name) {
  const base = normalizeName(name)
    .replace(/,\s*(mini|mod|mega dough)$/i, "")
    .replace(/^build your own,\s*/i, "")
    .replace(/^\d+\s*pc\s+/i, "")
    .replace(/\s*pizza$/i, "")
    .replace(/\s*-\s*/g, " ");

  return uniqueStrings([
    base,
    base.replace(/^egg\s+/, "egg - "),
    base.replace(/^mega cookie\s+/, "mega cookie - "),
    base.replace(/^no name cake.*/, "no name cake"),
  ]);
}

function normalizeName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAllergenLabel(value) {
  return cleanText(value)
    .toUpperCase()
    .replace(/&NBSP;?/gi, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}
