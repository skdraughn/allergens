import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdAnthonysFallsChurch as restaurantId } from "./anthonys-falls-church-audit-catalog.mjs";

const currentEvidenceIds = ["official-anthonys-menu-live", "third-party-jina-menu-transport"];

const aliases = new Map(Object.entries({
  "balsamic vinaigrette": "BALSAMIC VINAGRETTE",
  "classic margherita pizza large": "CLASSIC MARGARITA PIZZA (Large)",
  "classic margherita pizza medium": "CLASSIC MARGARITA PIZZA (Medium)",
  "classic margherita pizza small": "CLASSIC MARGARITA PIZZA (Small)",
  "combo pizza large": "COMBO PIZZA (Large) (Selections Required)",
  "combo pizza medium": "COMBO PIZZA (Medium) (Selections Required)",
  "combo pizza small": "COMBO PIZZA (Small) (Selections Required)",
  "fettuccine alfredo": "FETUCCINE ALFREDO",
  "new york steak": "NEW YORK STEAK 10oz",
  "side meat sauce": "SIDE MEAT SAUCE 8oz",
  "tilapia almondine": "TILAPIA ALMANDINE",
  "turkey bacon avocado and provolone": "TURKEY, BACON, AVOCADO AND PROVALONE",
  "tzatziki": "TZATZIKI 4oz",
  "zucchini sticks": "ZUCHINNI STICKS",
}));

const artifactNames = new Set([
  "1 meatball",
  "broccoli",
  "double meat",
  "extra tzatziki sauce",
  "grilled pork",
  "gyro",
  "gyro meat",
  "italian sausage",
  "kids",
  "marinara sauce 4oz",
  "marinara sauce side 8oz",
  "meat sauce 8oz",
  "meat sauce side 4oz",
  "meatballs",
  "provolone cheese",
  "sauteed mushroom",
  "small soup",
  "thousand island",
]);

export function enrichAnthonysFallsChurchChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const item = (restaurant?.items ?? []).length === 184
      ? restaurant.items[check.baselineIndex]
      : null;
    if (item && item.id !== check.baseline.itemId) {
      throw new Error(
        `Anthony's frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline.itemId}.`,
      );
    }
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? item?.description ?? null,
    };
  });
}

export function reconcileAnthonysFallsChurchBaselineItems(checks, snapshot) {
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
        notes: key === "kids"
          ? "KIDS is a category heading promoted to a product by the frozen structured extraction."
          : "This frozen row is a nested modifier/topping promoted to a standalone product; it is absent from Anthony's current top-level menu catalog.",
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
        notes: "No current top-level Owner-menu product reconciled with this frozen row after applying the reviewed spelling and presentation aliases.",
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
    if (aliasName) notes.push(`The frozen spelling/presentation reconciles as the current product “${current.name}”.`);
    if (menuContentVerdict === "mismatch") {
      notes.push("The frozen description or category differs from the current top-level Owner menu; the prior extraction shifted multiple rows into modifier-derived categories.");
    }
    if (allergenVerdict === "mismatch") {
      notes.push(`The frozen signal [${sorted(check.baseline?.allergens).join(", ") || "none"}] differs from the current positive signal [${sorted(current.allergens).join(", ") || "none"}] supported by the official product name and ingredient text.`);
    }
    if (notes.length === 0) notes.push("The frozen product, content, and supported positive signals reconcile with the current menu.");
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
  const checks = enrichAnthonysFallsChurchChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileAnthonysFallsChurchBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
