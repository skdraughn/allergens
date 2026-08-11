import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdApPizzaShopBethesda as restaurantId } from "./ap-pizza-shop-bethesda-audit-catalog.mjs";

const currentEvidenceIds = [
  "restaurant-linked-toast-live-lunch",
  "restaurant-linked-toast-live-dinner",
  "third-party-jina-toast-transport",
];

const aliases = new Map([
  ["sicilian marinara", "Jersey Marinara"],
]);

const artifactNames = new Set([
  "deck oven slices",
  "lunch pies",
]);

const staleNames = new Set([
  "18 supremo",
  "andy boy",
  "eggplant parm arancini",
  "focaccia breadsticks",
  "il supremo",
  "leafy green salad",
  "supremo slice",
]);

export function enrichApPizzaShopBethesdaChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const item = (restaurant?.items ?? []).length === 47
      ? restaurant.items[check.baselineIndex]
      : null;
    if (item && item.id !== check.baseline.itemId) {
      throw new Error(
        `AP Pizza Shop frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline.itemId}.`,
      );
    }
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? item?.description ?? null,
    };
  });
}

export function reconcileApPizzaShopBethesdaBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedIds = new Set();
  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const key = normalize(baselineName);

    if (artifactNames.has(key)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: currentEvidenceIds,
        currentItemIds: [],
        notes: "This frozen row is a Toast category heading promoted to a standalone product; it is not a menu item.",
      };
    }
    if (staleNames.has(key)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: currentEvidenceIds,
        currentItemIds: [],
        notes: "This previously published product is absent from both current meal-period Toast surfaces and has been removed from the current catalog.",
      };
    }

    const aliasName = aliases.get(key);
    const current = currentByName.get(normalize(aliasName ?? baselineName));
    if (!current) {
      return {
        ...check,
        disposition: "missing_from_source",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: currentEvidenceIds,
        currentItemIds: [],
        notes: "No current top-level AP Pizza Shop product reconciled with this frozen row after reviewed renames were applied.",
      };
    }

    matchedIds.add(current.id);
    const allergenVerdict = equalSignals(check.baseline?.allergens, current.allergens) &&
      equalSignals(check.baseline?.mayContain, current.mayContain)
      ? "verified"
      : "mismatch";
    const descriptionMatches = normalize(check.frozenDescription) === normalize(current.description);
    const categoryMatches = normalize(check.baseline?.category) === normalize(current.category);
    const menuContentVerdict = descriptionMatches && categoryMatches ? "verified" : "mismatch";
    const notes = [];
    if (aliasName) notes.push(`The renamed frozen product reconciles as the current “${current.name}”.`);
    if (menuContentVerdict === "mismatch") {
      notes.push("The frozen description or flattened Pizza category differs from the current meal-period Toast product presentation.");
    }
    if (allergenVerdict === "mismatch") {
      notes.push(`The frozen positive signals [${sorted(check.baseline?.allergens).join(", ") || "none"}] differ from the current supported signals [${sorted(current.allergens).join(", ") || "none"}].`);
    }
    if (notes.length === 0) notes.push("The frozen product, content, and supported positive signals reconcile with the current restaurant-linked Toast menu.");
    return {
      ...check,
      disposition: aliasName
        ? "variant_match"
        : baselineName === current.name
          ? "exact_match"
          : "normalized_match",
      allergenVerdict,
      menuContentVerdict,
      sourceEvidenceIds: currentEvidenceIds,
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

function countValues(rows, field, values) {
  return Object.fromEntries(
    values.map((value) => [value, rows.filter((row) => row[field] === value).length])
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
  const checks = enrichApPizzaShopBethesdaChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileApPizzaShopBethesdaBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
