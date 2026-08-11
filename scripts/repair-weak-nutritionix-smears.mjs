import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const repositoryPath = "src/data/generated/restaurants.generated.json";
const cleanSnapshotPaths = [
  "data/scraped/launch-coverage/full-012-offset-720-limit-60/repository.json",
];
const reportPath = `data/scraped/audits/weak-nutritionix-smear-repair-${timestampForFile(
  new Date(),
)}.json`;
const todayIso = new Date().toISOString();

const repository = JSON.parse(await readFile(repositoryPath, "utf8"));
const cleanSnapshots = await loadCleanSnapshots(cleanSnapshotPaths);
const report = {
  generatedAt: todayIso,
  repositoryPath,
  cleanSnapshotPaths,
  reviewedRestaurants: [],
  exactRecoveries: [],
  downgrades: [],
  reviewedPlausibleNutritionix: [],
  changedRestaurantIds: [],
};
const changedRestaurantIds = new Set();

for (let index = 0; index < repository.restaurants.length; index += 1) {
  const restaurant = repository.restaurants[index];
  const suspectSummary = weakNutritionixSuspectSummary(restaurant);

  if (!suspectSummary.shouldReview) {
    continue;
  }

  let changed = false;
  const cleanRestaurant = cleanSnapshots.get(restaurant.id);
  const cleanByName = new Map(
    (cleanRestaurant?.items ?? []).map((item) => [normalizeName(item.name), item]),
  );
  const nextItems = [];
  const restaurantReport = {
    id: restaurant.id,
    name: restaurant.name,
    totalItemCount: restaurant.items?.length ?? 0,
    officialItemCountBefore: officialItemCount(restaurant),
    repeatedWeakSets: suspectSummary.repeatedWeakSets,
    exactRecovered: 0,
    downgraded: 0,
    reviewedPlausible: 0,
  };

  for (const item of restaurant.items ?? []) {
    if (!isOfficialItem(item) || !hasWeakNutritionixEvidence(item)) {
      nextItems.push(item);
      continue;
    }

    const directAllergens = uniqueStrings(item.allergens ?? []);
    const itemIsLargeRepeatedWeakSet = suspectSummary.largeRepeatedSetKeys.has(
      allergenSetKey(directAllergens),
    );
    const itemLooksImplausible = hasImplausibleWeakAllergenClaims(item);
    const itemHasStrongEvidence = hasStrongOfficialEvidence(item);
    const itemNeedsRepair =
      directAllergens.length >= 5 &&
      itemLooksImplausible &&
      (itemIsLargeRepeatedWeakSet || !itemHasStrongEvidence);

    if (!itemNeedsRepair) {
      if (directAllergens.length >= 5 && itemIsLargeRepeatedWeakSet) {
        restaurantReport.reviewedPlausible += 1;
      }
      nextItems.push(item);
      continue;
    }

    const cleanItem = cleanByName.get(normalizeName(item.name));
    const cleanAllergens = uniqueStrings(cleanItem?.allergens ?? []);
    const canRecoverFromCleanPdf =
      cleanItem &&
      hasStrongOfficialEvidence(cleanItem) &&
      cleanAllergens.length > 0 &&
      cleanAllergens.length < directAllergens.length &&
      !hasImplausibleWeakAllergenClaims(cleanItem);

    if (canRecoverFromCleanPdf) {
      const recovered = {
        ...item,
        allergens: cleanAllergens,
        allergenSourceType: "official-allergen-menu",
        evidence: stripWeakNutritionixEvidence(item.evidence ?? cleanItem.evidence ?? []),
        sourceUrls: stripWeakNutritionixUrls(item.sourceUrls ?? []),
        sourceType: cleanItem.sourceType ?? item.sourceType,
      };
      nextItems.push(recovered);
      changed = true;
      restaurantReport.exactRecovered += 1;
      report.exactRecoveries.push({
        restaurantId: restaurant.id,
        itemId: item.id,
        name: item.name,
        from: directAllergens,
        to: cleanAllergens,
        source: "clean-pdf-backed-snapshot",
      });
      continue;
    }

    const downgraded = downgradeWeakOfficialItem(item);
    nextItems.push(downgraded);
    changed = true;
    restaurantReport.downgraded += 1;
    report.downgrades.push({
      restaurantId: restaurant.id,
      itemId: item.id,
      name: item.name,
      from: directAllergens,
      reason: itemIsLargeRepeatedWeakSet
        ? "weak-nutritionix-repeated-implausible-direct-allergen-set"
        : "weak-nutritionix-implausible-direct-allergen-set",
    });
  }

  if (!changed) {
    if (restaurantReport.reviewedPlausible > 0) {
      report.reviewedPlausibleNutritionix.push(restaurantReport);
    }
    continue;
  }

  let nextRestaurant = {
    ...restaurant,
    items: nextItems,
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      weakNutritionixSmearRepair: {
        generatedAt: todayIso,
        exactRecovered: restaurantReport.exactRecovered,
        downgraded: restaurantReport.downgraded,
        reviewedPlausible: restaurantReport.reviewedPlausible,
        decision:
          "Repeated weak Nutritionix/filter-derived direct allergen sets were repaired or downgraded unless backed by clean row-level official evidence.",
      },
    },
  };
  nextRestaurant = refreshOfficialStatus(nextRestaurant);
  nextRestaurant = await annotateRestaurantWithIngredientIntelligence(nextRestaurant);
  nextRestaurant = refreshOfficialStatus(nextRestaurant);
  repository.restaurants[index] = nextRestaurant;
  changedRestaurantIds.add(nextRestaurant.id);
  restaurantReport.officialItemCountAfter = officialItemCount(nextRestaurant);
  report.reviewedRestaurants.push(restaurantReport);
}

repository.generatedAt = todayIso;
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce(
  (sum, restaurant) => sum + (restaurant.items?.length ?? 0),
  0,
);
repository.metadata = {
  ...(repository.metadata ?? {}),
  generatedAt: todayIso,
  restaurantCount: repository.restaurantCount,
  itemCount: repository.itemCount,
  weakNutritionixSmearRepair: {
    generatedAt: todayIso,
    changedRestaurantCount: changedRestaurantIds.size,
    exactRecoveries: report.exactRecoveries.length,
    downgradedItems: report.downgrades.length,
  },
};
report.changedRestaurantIds = [...changedRestaurantIds].sort();
report.changedRestaurantCount = report.changedRestaurantIds.length;

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(repositoryPath, `${JSON.stringify(repository, null, 2)}\n`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      reportPath,
      changedRestaurantCount: report.changedRestaurantCount,
      exactRecoveries: report.exactRecoveries.length,
      downgradedItems: report.downgrades.length,
      changedRestaurantIds: report.changedRestaurantIds,
    },
    null,
    2,
  ),
);

async function loadCleanSnapshots(paths) {
  const restaurants = new Map();

  for (const snapshotPath of paths) {
    try {
      const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
      for (const restaurant of snapshot.restaurants ?? []) {
        if (!restaurants.has(restaurant.id)) {
          restaurants.set(restaurant.id, restaurant);
        }
      }
    } catch {}
  }

  return restaurants;
}

function weakNutritionixSuspectSummary(restaurant) {
  const repeated = new Map();
  let weakLargeCount = 0;
  let implausibleWeakLargeCount = 0;

  for (const item of restaurant.items ?? []) {
    if (!isOfficialItem(item) || !hasWeakNutritionixEvidence(item)) {
      continue;
    }

    const allergens = uniqueStrings(item.allergens ?? []).sort();
    if (allergens.length < 5) {
      continue;
    }

    weakLargeCount += 1;
    if (hasImplausibleWeakAllergenClaims(item) && !hasStrongOfficialEvidence(item)) {
      implausibleWeakLargeCount += 1;
    }
    const key = allergenSetKey(allergens);
    const existing = repeated.get(key) ?? {
      set: allergens,
      count: 0,
      implausibleCount: 0,
    };
    existing.count += 1;
    if (hasImplausibleWeakAllergenClaims(item)) {
      existing.implausibleCount += 1;
    }
    repeated.set(key, existing);
  }

  const repeatedWeakSets = [...repeated.values()]
    .filter((entry) => entry.count >= 5)
    .sort((left, right) => right.count - left.count);
  const largeRepeatedSetKeys = new Set(
    repeatedWeakSets
      .filter((entry) => entry.implausibleCount > 0)
      .map((entry) => allergenSetKey(entry.set)),
  );

  return {
    largeRepeatedSetKeys,
    repeatedWeakSets,
    shouldReview:
      (weakLargeCount >= 5 && repeatedWeakSets.length > 0) || implausibleWeakLargeCount > 0,
  };
}

function downgradeWeakOfficialItem(item) {
  const {
    inferredIngredients: _inferredIngredients,
    inferredAllergenSignals: _inferredAllergenSignals,
    inferenceSummary: _inferenceSummary,
    inferenceVersion: _inferenceVersion,
    inferenceQuestions: _inferenceQuestions,
    officialSource: _officialSource,
    ...rest
  } = item;

  return {
    ...rest,
    allergenSourceType: "unavailable",
    allergenSource: "Official allergen evidence unavailable for this item.",
    allergens: [],
    evidence: stripWeakNutritionixEvidence(rest.evidence ?? []),
    mayContain: [],
    sourceUrls: stripWeakNutritionixUrls(rest.sourceUrls ?? []),
  };
}

function refreshOfficialStatus(restaurant) {
  const official = officialItemCount(restaurant);
  return {
    ...restaurant,
    officialAllergenStatus: official > 0 ? "extracted" : "not-found",
    officialAllergenRemediationBucket:
      official > 0 ? "partial-after-weak-nutritionix-repair" : "weak-nutritionix-allergen-smear-removed",
    allergenDataStatus: {
      ...(restaurant.allergenDataStatus ?? {}),
      officialItemCount: official,
    },
  };
}

function hasImplausibleWeakAllergenClaims(item) {
  const allergens = new Set(item.allergens ?? []);
  const text = normalizeName(
    [
      item.name,
      item.category,
      item.description,
      item.ingredientsText,
      ...(item.extractedIngredientMentions ?? []),
    ].join(" "),
  );

  if (allergens.size >= 8 && (allergens.has("fish") || allergens.has("shellfish"))) {
    return true;
  }

  if ((allergens.has("fish") || allergens.has("shellfish")) && !hasSeafoodCue(text)) {
    return true;
  }

  if ((allergens.has("peanut") || allergens.has("tree-nut")) && !hasNutCue(text)) {
    return true;
  }

  return false;
}

function hasSeafoodCue(text) {
  return /\b(?:fish|shrimp|crab|lobster|seafood|salmon|tuna|cod|haddock|tilapia|mahi|mahi mahi|trout|anchov|clam|oyster|scallop|mussel|crawfish|crayfish|prawn|calamari|squid)\b/i.test(
    text,
  );
}

function hasNutCue(text) {
  return /\b(?:peanut|nut|nuts|almond|cashew|pecan|walnut|pistachio|hazelnut|macadamia|praline|pb|peanut butter|nutella)\b/i.test(
    text,
  );
}

function isOfficialItem(item) {
  return /official/i.test(item?.allergenSourceType ?? "");
}

function hasWeakNutritionixEvidence(item) {
  const text = evidenceText(item);
  return /nutritionix|allergenTags|allergenFree|online nutrition (?:and allergen )?guide/i.test(text);
}

function hasStrongOfficialEvidence(item) {
  return /pdf-matrix|allergen matrix|allergen guide row parsed|row parsed|marker glyph|glyphs|direct marker|x marker|contains marker|table cell|spreadsheet|official .* row/i.test(
    evidenceText(item),
  ) || item?.allergenSourceType === "official-product-allergen-section";
}

function stripWeakNutritionixEvidence(evidence) {
  return (evidence ?? []).filter(
    (entry) =>
      !/nutritionix|allergenTags|allergenFree|online nutrition (?:and allergen )?guide/i.test(
        `${entry?.sourceKind ?? ""} ${entry?.sourceUrl ?? ""} ${entry?.text ?? ""}`,
      ),
  );
}

function stripWeakNutritionixUrls(urls) {
  return (urls ?? []).filter((url) => !/nutritionix\.com/i.test(url));
}

function evidenceText(item) {
  return [
    item?.description,
    item?.sourceKind,
    item?.sourceUrl,
    ...(item?.sourceUrls ?? []),
    ...(item?.evidence ?? []).flatMap((entry) => [entry?.sourceKind, entry?.sourceUrl, entry?.text]),
  ]
    .filter(Boolean)
    .join(" ");
}

function officialItemCount(restaurant) {
  return (restaurant.items ?? []).filter((item) => isOfficialItem(item)).length;
}

function allergenSetKey(allergens) {
  return uniqueStrings(allergens).sort().join("|");
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™']/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
