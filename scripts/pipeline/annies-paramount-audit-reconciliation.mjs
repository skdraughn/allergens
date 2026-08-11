import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  restaurantIdAnniesParamount as restaurantId,
  sourceUrlsAnniesParamount,
} from "./annies-paramount-audit-catalog.mjs";

const evidenceIdByUrl = new Map([
  [sourceUrlsAnniesParamount.dinner, "official-annies-dinner-may-2026"],
  [sourceUrlsAnniesParamount.lunch, "official-annies-lunch-may-2026"],
  [sourceUrlsAnniesParamount.brunch, "official-annies-brunch-may-2026"],
  [sourceUrlsAnniesParamount.happyHour, "official-annies-happy-hour-spring-2025"],
]);
const currentFoodEvidenceIds = [...evidenceIdByUrl.values()];

const aliases = new Map(Object.entries({
  "petit sirloin steak and eggs": "Sirloin & Eggs",
  "ribeye steak and eggs": "12oz Ribeye Steak & Eggs",
  "sirloin steak and eggs": "Sirloin & Eggs",
  "pork chops and eggs": "Pork Chop & Eggs",
  "classic cheeseburger": "Cheeseburger",
  "center cut pork chops": "Center Cut Pork Chop",
  "southwest chicken": "Southwest Grilled Chicken",
  "blackened salmon": "Blackened Salmon Sandwich",
  "fried chicken": "Fried Chicken Sandwich",
  "steak and cheese": "Steak & Cheese Sandwich",
  "fried fresh mozzarella": "Fried Buffalo Mozzarella",
  "petit filet and seafood": "Steak & Seafood",
  "sirloin steak and seafood": "Steak & Seafood",
  "steak and eggs": "Sirloin & Eggs",
}));

const artifactNames = new Set([
  "entree salads",
  "hamburgers",
  "house specials",
  "seafood and pasta",
  "brunch for lunch",
  "seafood",
  "annie s paramount steak house",
  "brunch platters",
  "omelets",
]);

const staleNames = new Set([
  "porterhouse steak and eggs",
  "smoked salmon benedict",
  "steakhouse benedict",
  "bacon egg and cheese",
  "salmon and cream cheese",
  "virginia ham steak and eggs",
  "greek salad",
  "classic hamburger",
  "double cheeseburger",
  "smoked salmon omelet",
  "southwestern omelet",
  "spinach feta omelet",
  "steak omelet",
  "tomato mozzarella",
  "rainbow trout",
  "hanger steak",
  "porterhouse steak",
]);

export function enrichAnniesParamountChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const item = (restaurant?.items ?? []).length === 121
      ? restaurant.items[check.baselineIndex]
      : null;
    if (item && item.id !== check.baseline.itemId) {
      throw new Error(
        `Annie's frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline.itemId}.`,
      );
    }
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? item?.description ?? null,
    };
  });
}

export function reconcileAnniesParamountBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedIds = new Set();

  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const baselineKey = normalize(baselineName);

    if (artifactNames.has(baselineKey)) {
      return terminalCheck(check, {
        disposition: "artifact",
        sourceEvidenceIds: currentFoodEvidenceIds,
        notes: "This frozen row is a menu section heading or restaurant title promoted to a product by the prior mixed-layout extraction.",
      });
    }

    if (staleNames.has(baselineKey)) {
      return terminalCheck(check, {
        disposition: "stale_extra",
        sourceEvidenceIds: currentFoodEvidenceIds,
        notes: "This older Squarespace-menu product is absent from Annie's dated May 2026 dinner, lunch, and brunch PDFs and Spring 2025 happy-hour food list.",
      });
    }

    const aliasName = aliases.get(baselineKey);
    const current = currentByName.get(normalize(aliasName ?? baselineName));
    if (!current) {
      return terminalCheck(check, {
        disposition: "missing_from_source",
        sourceEvidenceIds: currentFoodEvidenceIds,
        notes: "No current dated-PDF product reconciled with this frozen name after applying the reviewed Annie's variant map.",
      });
    }

    matchedIds.add(current.id);
    const allergenVerdict = equalSignals(check.baseline?.allergens, current.allergens) &&
      equalSignals(check.baseline?.mayContain, current.mayContain)
      ? "verified"
      : "mismatch";
    const descriptionMatches = normalize(check.frozenDescription) === normalize(current.description);
    const categoryMatches = normalize(check.baseline?.category) === normalize(current.category);
    const menuContentVerdict = descriptionMatches && categoryMatches ? "verified" : "mismatch";
    const sourceEvidenceIds = unique(
      current.sourceUrls.map((url) => evidenceIdByUrl.get(url)).filter(Boolean),
    );
    const notes = [];
    if (aliasName) {
      notes.push(`The frozen presentation is reconciled as the current variant “${current.name}”.`);
    }
    if (menuContentVerdict === "mismatch") {
      notes.push("The frozen category or description differs from the canonical dated-PDF presentation; the prior extraction mixed page columns and meal-period layouts.");
    }
    if (allergenVerdict === "mismatch") {
      notes.push(`The frozen signal [${sorted(check.baseline?.allergens).join(", ") || "none"}] differs from the current positive signal [${sorted(current.allergens).join(", ") || "none"}] supported by the product name and published ingredient text.`);
    }
    if (notes.length === 0) {
      notes.push("The frozen product identity, content, and supported positive allergen signals reconcile with the current dated menu.");
    }
    return {
      ...check,
      disposition: aliasName
        ? "variant_match"
        : baselineName === current.name
          ? "exact_match"
          : "normalized_match",
      allergenVerdict,
      menuContentVerdict,
      sourceEvidenceIds,
      currentItemIds: [current.id],
      notes: notes.join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedIds.has(item.id));
  return {
    restaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition", [
        "exact_match",
        "normalized_match",
        "variant_match",
        "stale_extra",
        "artifact",
        "missing_from_source",
      ]),
      allergens: countValues(itemChecks, "allergenVerdict", ["verified", "mismatch", "not_applicable"]),
      menuContent: countValues(itemChecks, "menuContentVerdict", ["verified", "mismatch", "not_applicable"]),
      matchedCurrentItemCount: matchedIds.size,
      omittedCurrentItemCount: omittedCurrentItems.length,
    },
  };
}

function terminalCheck(check, { disposition, sourceEvidenceIds, notes }) {
  return {
    ...check,
    disposition,
    allergenVerdict: "not_applicable",
    menuContentVerdict: "not_applicable",
    sourceEvidenceIds,
    currentItemIds: [],
    notes,
  };
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function equalSignals(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function unique(values) {
  return [...new Set(values)];
}

function countValues(rowsToCount, field, values) {
  return Object.fromEntries(
    values.map((value) => [value, rowsToCount.filter((row) => row[field] === value).length])
      .filter(([, count]) => count > 0),
  );
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const liveRestaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants)
    .find((row) => row.id === restaurantId);
  const checks = enrichAnniesParamountChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileAnniesParamountBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
