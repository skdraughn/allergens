import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getDefaultIngredientIntelligenceManifest,
  inferMenuItemIngredientIntelligence,
  normalizeSearchText,
} from "./ingredient-intelligence.mjs";

const defaultInputPath = "src/data/generated/restaurants.generated.json";
const defaultOutputPath = "data/ingredient-intelligence/v2/audit/latest-report.json";
const defaultCandidatePath =
  "data/ingredient-intelligence/v2/candidates/codex-review-candidates.json";

const riskyPatterns = [
  /\b(?:calamari|squid|octopus|seafood|raw bar|shellfish|shrimp|crab|lobster|oyster|clam|mussel|scallop)\b/i,
  /\b(?:ahi|tuna|yellowtail|hamachi|salmon|branzino|cod|halibut|bass|trout|tilapia|mahi|swordfish|snapper|flounder)\b/i,
  /\b(?:sandwich|club|blt|po boy|hoagie|sub|panini|melt|burger)\b/i,
  /\b(?:cheesecake|cake|brownie|cookie|pastry|pie|tart|muffin|scone|croissant|danish)\b/i,
  /\b(?:fried|battered|breaded|crispy|tempura)\b/i,
  /\b(?:soy|sesame|tahini|peanut|almond|cashew|walnut|pistachio|pecan|mustard|mayo|aioli|cream|cheese|butter)\b/i,
];

const lowValueRiskyMissPatterns = [
  /\b(?:french fries|fries|fried potatoes|home[- ]fried potatoes|crispy(?: [a-z]+){0,3} potatoes|crispy hash potatoes|crispy fingerling potatoes|smashed potatoes|greek potatoes|lemon confit potatoes|potato wedges?|seasoned potato wedges?|thick-cut potato wedges?)\b/i,
  /\b(?:hash browns?|crispy hash browns?|tater tots?|crispy tater tots?|chips\\b|british chips|golden fried|crispy tortilla strips?|fried tortilla strips|crispy potato|crispy baby potato|togarashi flakes|taro root balls?)\b/i,
  /\b(?:fried plantains?|plantains?|platanos fritos|yuca frita|fried yuca|fried yucca|fried cassava|yucca|yuca con chicharron)\b/i,
  /\b(?:chicharrones?|pork belly|carnitas|crispy bacon|side of bacon|bacon three|oxtail stew|oxtail dinner|duck ?breast|duck fried|duck\s*\(fried\)|confit canard|crispy duck leg|crispy duck|crispy half chicken|half chicken|crispy savory leg|brown stew chicken|whole chicken is first fried|chicken under a brick|chicken tabaka|crispy cornish hen|cornish hen|lamb chops|crispy lamb|crispy pork ribs|pork ribs|pork riblets|sticky pork riblets|wok-fried, sweet sauce|pork rinds|double fried ribs|fried pork shoulder|fried pork|fried marinated pork|fried beef jerky|fried beef|fried marinated beef|fried quail|fried frog(?:s?'?) legs?|gator tail|fried or grilled pork chop|fried grilled chicken breast|fried or grilled chicken breast|fried chicken breast|fried shawarma|fried or roasted|roasted until crispy|crispy pig ears|tete de cochon|tibs|chapli kabobs?|chaplee|yemeni kabab|kabab fried in oil|sun-dried beef|sun dried beef|deef fried until crispy|special turkey|fried or grilled to perfection)\b/i,
  /\b(?:chips and salsa|chips & salsa|salsa flight.*chips|tortilla chips|corn tortilla chips)\b/i,
  /\b(?:crispy brussels?|crispy brussels? sprouts?|brussels sprouts|crispy broccolini|crispy garlic broccolini)\b/i,
  /\b(?:seafood primer book|ocean to table.*book)\b/i,
  /\b(?:fried rice|crispy rice|pineapple fried rice|vegetable fried rice|veggie fried rice|chicken fried rice|beef fried rice)\b/i,
  /\b(?:crispy tacos?|birria tacos?|tacos el paso|corn tortilla|homemade crispy tacos?|single crispy taco|taco .*crispy jalapeño|crispy jalapeño)\b/i,
  /\b(?:burger bowl|burger bowl grilled chicken|burger bowl tenders|burger bowl vegefi)\b/i,
  /\b(?:gluten free sandwich|gluten-free sandwich|dedicated fryer|prepared in a dedicated fryer|gluten-free menu|gluten free menu)\b/i,
  /\b(?:vegan cheese|veggie[- ]?chick'?n|plant base protein|plant[- ]based protein|artichokes .*v\.e\.g\.|gf[/]vegan|[*]gf[/]vegan|gf\s*[/]|gf)\b/i,
  /\b(?:melt(?:s|ed)? (?:in|into|quickly back into|back into)|melt-in-your-mouth|melt in your mouth|burger blend|butcher'?s blend|deluxe burger blend|makes a mean burger|in burgers|ground bison|ground beef sold online)\b/i,
  /\b(?:crispy garlic|fried shallots?|crispy shallots?|crispy ginger strings?|crispy grains?|crispy quinoa|crispy red quinoa|crispy wild rice|crispy chickpeas?|crispy yuba|crispy mung bean|crispy skin|crispy lettuce|crispy romaine|crispy kale|crispy dates wrapped in bacon|crispy basmati|crispy basmati rice|crispy sweet potato|crispy sweet potato tots)\b/i,
  /\b(?:fried tomatoes?|fried peppers?|fried jalapeños?|fried shishito|fried lotus roots?|fried cabbage|fried collards? greens?|fried spinach|fried basil|fried capers|fried curry leaf|fried green bananas?|fried banana|fried bananas|fried green beans?|fried crispy green beans?|fried bean curd|fried seda beans?|frijoles refritos?|re fried beans|refried beans|fried red seda beans?|fried shishido peppers?|fried fingerling potatoes|fried mixed vegetables|fried mix vegetables|fried masa|fried avocado taco|fried avocado|fried cauliflower|crispy cauliflower|crispy okra|crispy fresh vegetables|crispy spinach|crispy sprouts?|crispy mushroom|crispy mushrooms?|crispy shiitake|crispy black mushroom|crispy wood-ear mushroom|fried maitake)\b/i,
  /\b(?:dosa|uthappam|paniyaram|kuzhi paniyaram|paper roast|rice[- ]lentil crepe|fermented rice[- ]lentil|rice\s*&\s*lentil|rice and lentil|vadai|vada|sabudana vada|papad|papadum|crispy lentil wafers?)\b/i,
  /\b(?:thin steak fried|fried wide rice noodles?|stir[- ]?\s*fried with curry powder|crispy lemongrass|crispy panisse|deep fried green jackfruit|fried in oil|fried with onion|crispy pork rolls?|crispy pork|crispy grilled chicken|crispy\/grilled chicken|crispy and juicy salad|crispy & juicy salad|fried masa topped|huaraches)\b/i,
  /\b(?:stir[- ]fried|pan[- ]fried|sautéed|sauteed)\b(?!.*\b(?:soy|tamari|shoyu|ponzu|fish sauce|oyster sauce|peanut|sesame|tahini|mayo|aioli|cream|cheese|butter|battered|breaded|tempura|wonton|dumpling|wrapper)\b)/i,
  /\b(?:falafel|crispy ground chickpeas|fried tortilla strips|fritos de tortilla|crispy yellow peas|fried garlic|corn nuts)\b/i,
  /\b(?:crispy saffron basmati rice|crispy basmati rice|crispy rice|rice crispy|fried arabian-seasoned rice|crispy tater\s*&\s*tapioca|fried corn kernels|crispy corn|crispy wing|crispy marinated pork|roasted crispy pork|crispy pork chops?|crispy pork ribs?|crispy pork tenderloin|crispy pork skin|pork chicharron|crispy baby back ribs|crispy prosciutto|crispy bacon|bacon\s*-\s*crispy|turkey bacon\s*-\s*crispy|fried on an open fire|fried in 100% avocado oil|fried marinated beef|shredded fried|crispy fried duck|crispy deep fried duck|fried black pepper quail|fried seaweed|crispy yuca|crispy-skinned chicken|crispy fingerlings|crispy leeks|crispy spiral-cut potato|crispy radish|crispy dill pickles?)\b/i,
  /\b(?:stuffed mirchi|fried to perfection)\b(?!.*\b(?:flour|batter|breaded|cheese|cream|paneer|wheat|gluten)\b)/i,
  /\b(?:crispy smoked wings|fried turkey wings|pork strip)\b(?!.*\b(?:flour|floured|batter|battered|breaded|coated|dredged|wheat|gluten)\b)/i,
];

const alwaysLowValueRiskyMissPatterns = [
  /\b(?:vegan cheese|vegan mayo|vegan aioli|veggie[- ]?chick'?n|plant base protein|plant[- ]based protein|mock crab|hearts of palm crab)\b/i,
];

const beverageCategoryPatterns = [
  /\b(?:beverages?|drinks?|cocktails?|mocktails?|zero proof|spirit free|coffee|tea|espresso|juice|smoothies?|spritz|soda|wine|beer|bar)\b/i,
];

const beverageItemPatterns = [
  /\b(?:mocktail|spritz|punch|lemonade|latte|espresso|coffee|tea|matcha|soda|club soda|tonic|juice|smoothie|agua fresca|water)\b/i,
];

const foodOverrideForBeveragePattern =
  /\b(?:cake|cookie|brownie|pastry|sandwich|burger|pizza|pasta|noodle|salad|soup|chicken|beef|pork|lamb|fish|shrimp|crab|lobster|oyster|clam|mussel|scallop|tuna|salmon|cheese|cream sauce|butter sauce)\b/i;

const lowValueOverridePatterns = [
  /\b(?:soy|tamari|shoyu|ponzu|nuoc cham|fish sauce|ranch|dijonnaise|mayo|aioli|cheese|cream|butter|labneh|crema|dulce de leche|floured|battered|breaded|wonton|dumpling|wrapper|gluten-free option available|gluten free option available)\b/i,
];

export async function auditIngredientIntelligence(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const inputPath = path.resolve(args.input ?? defaultInputPath);
  const outputPath = path.resolve(args.output ?? defaultOutputPath);
  const candidatePath = path.resolve(args.candidates ?? defaultCandidatePath);
  const writeCandidates = args.writeCandidates !== "false";
  const repository = JSON.parse(await readFile(inputPath, "utf8"));
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const report = buildIngredientIntelligenceAudit(repository, manifest, auditOptionsFromArgs(args));
  const candidates = buildCandidateScaffold(report, manifest);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  if (writeCandidates) {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      {
        input: path.relative(process.cwd(), inputPath),
        output: path.relative(process.cwd(), outputPath),
        candidates: writeCandidates ? path.relative(process.cwd(), candidatePath) : null,
        scope: report.scope,
        summary: report.summary,
      },
      null,
      2,
    ),
  );

  return { candidates, report };
}

export function buildIngredientIntelligenceAudit(repository, manifest, options = {}) {
  const allRestaurants = repository.restaurants ?? [];
  const restaurants = selectRestaurantsForAudit(allRestaurants, options);
  const signalCounts = new Map();
  const riskyUninferredByName = new Map();
  const riskyUninferredByCategory = new Map();
  const broadLowConfidenceItems = [];
  const sourceFamilyCounts = new Map();
  let totalItems = 0;
  let officialUnavailableItems = 0;
  let inferredItems = 0;
  let riskyUninferredItems = 0;

  for (const restaurant of restaurants) {
    for (const item of restaurant.items ?? []) {
      totalItems += 1;

      if (!officialAllergenDataUnavailable(item)) {
        continue;
      }

      officialUnavailableItems += 1;
      const inference = inferMenuItemIngredientIntelligence(item, { manifest });
      const itemText = `${item.name ?? ""} ${item.description ?? ""} ${item.ingredientsText ?? ""}`;
      const riskyPattern = riskyPatterns.find((pattern) => pattern.test(itemText));
      const lowValueAuditMiss = isLowValueRiskyMiss(itemText, item);

      if (inference) {
        inferredItems += 1;

        for (const signal of inference.inferredAllergenSignals ?? []) {
          signalCounts.set(signal.id, (signalCounts.get(signal.id) ?? 0) + 1);
        }

        if (
          (inference.inferredAllergenSignals ?? []).some(
            (signal) =>
              signal.c === "low" || (signal.e ?? []).some((evidence) => evidence.startsWith("shape:")),
          )
        ) {
          broadLowConfidenceItems.push(compactAuditItem(restaurant, item, inference));
        }
        continue;
      }

      if (riskyPattern && !lowValueAuditMiss) {
        riskyUninferredItems += 1;
        incrementExampleMap(riskyUninferredByName, normalizeName(item.name), restaurant, item);
        incrementExampleMap(
          riskyUninferredByCategory,
          normalizeName(item.category || "Uncategorized"),
          restaurant,
          item,
        );
        sourceFamilyCounts.set(
          restaurant.sourceFamily ?? "unknown",
          (sourceFamilyCounts.get(restaurant.sourceFamily ?? "unknown") ?? 0) + 1,
        );
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    manifestVersion: manifest.version,
    sourceRepositoryVersion: repository.generatedAt ?? null,
    scope: {
      requestedRestaurantIds: options.restaurantIds ?? [],
      offset: options.offset ?? 0,
      limit: options.limit ?? null,
      selectedRestaurantCount: restaurants.length,
      repositoryRestaurantCount: allRestaurants.length,
    },
    summary: {
      totalItems,
      officialUnavailableItems,
      inferredItems,
      inferredCoverage:
        officialUnavailableItems === 0 ? 0 : Number((inferredItems / officialUnavailableItems).toFixed(4)),
      riskyUninferredItems,
    },
    signalCounts: mapToSortedObjects(signalCounts, "allergenId"),
    riskyUninferredByName: topExamples(riskyUninferredByName, 100),
    riskyUninferredByCategory: topExamples(riskyUninferredByCategory, 50),
    riskyUninferredBySourceFamily: mapToSortedObjects(sourceFamilyCounts, "sourceFamily"),
    broadLowConfidenceExamples: broadLowConfidenceItems.slice(0, options.maxBroadExamples ?? 250),
  };
}

function auditOptionsFromArgs(args) {
  return {
    limit: parseOptionalPositiveInteger(args.limit),
    maxBroadExamples: parseOptionalPositiveInteger(args.maxBroadExamples ?? args.maxBroad),
    offset: parseOptionalPositiveInteger(args.offset) ?? 0,
    restaurantIds: parseRestaurantIds(args.restaurants ?? args.restaurant),
  };
}

function parseRestaurantIds(value) {
  return String(value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, received ${value}`);
  }

  return parsed;
}

function selectRestaurantsForAudit(restaurants, options) {
  const restaurantIds = new Set(options.restaurantIds ?? []);
  const filtered = restaurantIds.size > 0
    ? restaurants.filter((restaurant) => restaurantIds.has(restaurant.id))
    : restaurants;
  const offset = options.offset ?? 0;
  const limit = options.limit;

  if (limit === undefined || limit === null) {
    return filtered.slice(offset);
  }

  return filtered.slice(offset, offset + limit);
}

function isLowValueRiskyMiss(value, item = {}) {
  return (
    alwaysLowValueRiskyMissPatterns.some((pattern) => pattern.test(value)) ||
    isLikelyGlutenFreeAuditRow(item) ||
    ((lowValueRiskyMissPatterns.some((pattern) => pattern.test(value)) ||
      isLikelyBeverageAuditRow(value, item)) &&
      !lowValueOverridePatterns.some((pattern) => pattern.test(value)))
  );
}

function isLikelyGlutenFreeAuditRow(item) {
  const category = item.category ?? "";
  const text = `${item.name ?? ""} ${item.description ?? ""}`;

  if (!/\b(?:gluten-free|gluten free|gf)\b/i.test(`${category} ${text}`)) {
    return false;
  }

  return !lowValueOverridePatterns.some((pattern) => pattern.test(text));
}

function isLikelyBeverageAuditRow(value, item) {
  const category = item.category ?? "";

  if (
    !beverageCategoryPatterns.some((pattern) => pattern.test(category)) &&
    !beverageItemPatterns.some((pattern) => pattern.test(value))
  ) {
    return false;
  }

  return !foodOverrideForBeveragePattern.test(value);
}

function buildCandidateScaffold(report, manifest) {
  const knownAliases = new Set(
    (manifest.ingredientAliases ?? []).flatMap((ingredient) =>
      [ingredient.id, ingredient.label, ...(ingredient.aliases ?? [])].map(normalizeSearchText),
    ),
  );
  const candidates = [];

  for (const entry of report.riskyUninferredByName ?? []) {
    const normalized = normalizeSearchText(entry.name);

    if (!normalized || knownAliases.has(normalized)) {
      continue;
    }

    candidates.push({
      name: entry.name,
      count: entry.count,
      reviewStatus: "candidate-only",
      suggestedRuleType: "needs-codex-review",
      examples: entry.examples,
    });
  }

  return {
    generatedAt: report.generatedAt,
    manifestVersion: report.manifestVersion,
    reviewStatus: "candidate-only",
    instructions:
      "Codex should review these risky uninferred names against source evidence before promoting any rule into the approved runtime manifest.",
    candidates: candidates.slice(0, 100),
  };
}

function officialAllergenDataUnavailable(item) {
  const allergens = item.allergens ?? [];
  const mayContain = item.mayContain ?? [];

  return (
    item.allergenSourceType === "unavailable" ||
    (!item.allergenSourceType && allergens.length === 0 && mayContain.length === 0)
  );
}

function normalizeName(value) {
  return normalizeSearchText(value || "unknown") || "unknown";
}

function incrementExampleMap(map, key, restaurant, item) {
  const current = map.get(key) ?? {
    count: 0,
    examples: [],
    name: item.name ?? key,
  };

  current.count += 1;

  if (current.examples.length < 5) {
    current.examples.push({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      description: item.description,
    });
  }

  map.set(key, current);
}

function compactAuditItem(restaurant, item, inference) {
  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    sourceFamily: restaurant.sourceFamily,
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    inferredIngredients: inference.inferredIngredients,
    inferredAllergenSignals: inference.inferredAllergenSignals,
  };
}

function mapToSortedObjects(map, keyName) {
  return Array.from(map.entries())
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((left, right) => right.count - left.count || String(left[keyName]).localeCompare(String(right[keyName])));
}

function topExamples(map, limit) {
  return Array.from(map.values())
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--")) {
      continue;
    }

    const [rawKey, ...rest] = value.replace(/^--/, "").split("=");
    if (rest.length > 0) {
      parsed[rawKey] = rest.join("=") || "true";
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[rawKey] = next;
      index += 1;
    } else {
      parsed[rawKey] = "true";
    }
  }

  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await auditIngredientIntelligence();
}
