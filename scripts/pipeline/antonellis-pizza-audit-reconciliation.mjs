import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdAntonellisPizza as restaurantId } from "./antonellis-pizza-audit-catalog.mjs";

const currentEvidenceIds = [
  "official-antonellis-menu",
  "official-antonellis-june-2025-pdf",
];

const aliases = new Map([
  ["the cold", "THE COLD CUT SUB"],
]);

const artifactNames = new Set([
  "all calzones and strombolis are 12 99 served with a side of marinara sauce extra sauce",
  "10 sub",
  "make it a deluxe",
  "coupons",
  "our large pizza is 2 larger than the industry standard",
  "1 topping large 16 pizza",
  "16 pizza",
  "all wings are breaded and deep fried served with bleu cheese or ranch",
  "beer battered and thick cut add a side of spicy chipotle dipping sauce",
  "calzones strombolis",
  "covered in garlic and melted mozzarella",
  "crispy chicken tenders covered in hot",
  "fettuccini tossed in our home made",
  "gourmet specialty pizzas",
  "greek salad topped with fresh gyro",
  "greek salad topped with grilled",
  "greek salad topped with grilled chicken served with pita bread",
  "grilled chicken steak",
  "gyro meat fresh mozzarella",
  "honey mustard balsamic vinaigrette",
  "kid s stop",
  "of spicy chipotle dipping sauce",
  "offer valid mondays only",
  "online",
  "our dough and pizza sauce are made from scratch daily",
  "pastas",
  "penne pasta tossed in our home made tomato cream sauce",
  "since",
  "small gourmet pizza",
  "spaghetti tossed in our home made",
  "spaghetti tossed in our home made marinara sauce",
  "sprinkled with powdered sugar served",
  "sprinkled with powdered sugar served with a side of strawberry dipping sauce",
  "subs",
  "wraps",
  "your choice of breaded or grilled",
  "wrap",
]);

export function enrichAntonellisPizzaChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const item = (restaurant?.items ?? []).length === 100
      ? restaurant.items[check.baselineIndex]
      : null;
    if (item && item.id !== check.baseline.itemId) {
      throw new Error(
        `Antonelli's frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline.itemId}.`,
      );
    }
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? item?.description ?? null,
    };
  });
}

export function reconcileAntonellisPizzaBaselineItems(checks, snapshot) {
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
        notes: artifactNote(key),
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
        notes: "No current top-level Antonelli's product reconciled with this frozen row after reviewed name aliases were applied.",
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
    if (aliasName) notes.push(`The truncated frozen label reconciles as the current product “${current.name}”.`);
    if (menuContentVerdict === "mismatch") {
      notes.push("The frozen description or generic category differs from Antonelli's current top-level HTML/PDF menu presentation.");
    }
    if (allergenVerdict === "mismatch") {
      notes.push(`The frozen positive signals [${sorted(check.baseline?.allergens).join(", ") || "none"}] differ from the current supported signals [${sorted(current.allergens).join(", ") || "none"}].`);
    }
    if (notes.length === 0) notes.push("The frozen product, content, and supported positive signals reconcile with the current restaurant-issued menus.");
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

function artifactNote(key) {
  if (["coupons", "1 topping large 16 pizza", "16 pizza", "offer valid mondays only", "online", "since", "small gourmet pizza"].includes(key)) {
    return "This frozen row is coupon, navigation, or promotional copy promoted to a product; it is not a current top-level menu item.";
  }
  if (["calzones strombolis", "gourmet specialty pizzas", "kid s stop", "pastas", "subs", "wraps", "wrap", "10 sub"].includes(key)) {
    return "This frozen row is a section heading, format label, or price header promoted to a product; it is not a current top-level menu item.";
  }
  return "This frozen row is a description, global note, topping list, dressing list, or optional modifier promoted to a standalone product; it is not a current top-level menu item.";
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
  const checks = enrichAntonellisPizzaChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileAntonellisPizzaBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
