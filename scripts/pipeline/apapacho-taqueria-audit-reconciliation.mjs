import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdApapachoTaqueria as restaurantId } from "./apapacho-taqueria-audit-catalog.mjs";

const evidenceIds = [
  "official-apapacho-menu-page",
  "official-apapacho-winter-specials-pdf",
  "official-apapacho-order-page",
  "official-apapacho-square-products",
];

const aliases = new Map([
  ["milanesa hh", "Chicken Milanesa"],
  ["taco beef stew and cactus", "Beef Stew with Nopalitos"],
  ["topochico", "Topo Chico"],
]);

const staleNames = new Map([
  ["26 oz oaxacan hot chocolate", "The expired preorder hot-chocolate SKU is absent from the current PDF and live Hot Drinks category."],
  ["8 course tasting dinner las quince letras x apapacho", "This sold-out February 20 one-night tasting event is not a current menu item."],
  ["boing", "This historical Square product has no live order-page category and the current PDF does not name the brand."],
  ["champurrado 1qt", "The expired preorder SKU is no longer fulfillable and is absent from the current menu."],
  ["chocolate tamal", "The old preorder item is sold out and absent from the current menu."],
  ["cubetazo guac and chips", "This is an alcohol bucket promotion, not a standalone current food item."],
  ["cubetazo tecate modelo", "This is an alcohol bucket promotion, not a standalone current food item."],
  ["mosto transfusion", "This cocktail presentation is excluded from the allergy-focused food and non-alcoholic catalog."],
  ["oaxacan chocolate", "The Square product is unfulfillable and absent from the current Hot Drinks menu."],
  ["taco trio", "This uncategorized sold-out Square SKU is absent from the current PDF and live order categories."],
  ["tamal", "The product text identifies an expired January 31-February 2 preorder window."],
  ["tamaliza pack of 5 tamales", "The old preorder pack is unfulfillable and absent from the current menu."],
  ["to go modelo", "This alcoholic beverage is excluded from the food and non-alcoholic catalog."],
  ["to go pacifico", "This alcoholic beverage is excluded from the food and non-alcoholic catalog."],
  ["to go tecate", "This alcoholic beverage is excluded from the food and non-alcoholic catalog."],
  ["tostada reyna", "The Square product is unfulfillable, uncategorized, and absent from the current PDF."],
]);

export function enrichApapachoChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const item = (restaurant?.items ?? []).length === 51
      ? restaurant.items[check.baselineIndex]
      : null;
    if (item && item.id !== check.baseline.itemId) {
      throw new Error(
        `Apapacho frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline.itemId}.`,
      );
    }
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? item?.description ?? null,
    };
  });
}

export function reconcileApapachoBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedCurrentIds = new Set();
  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const key = normalize(baselineName);
    const staleReason = staleNames.get(key);
    if (staleReason) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        currentItemIds: [],
        notes: staleReason,
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
        sourceEvidenceIds: evidenceIds,
        currentItemIds: [],
        notes: "No reviewed current Apapacho product reconciles with this frozen row.",
      };
    }

    matchedCurrentIds.add(current.id);
    const allergenVerdict = equalSignals(check.baseline?.allergens, current.allergens) &&
      equalSignals(check.baseline?.mayContain, current.mayContain)
      ? "verified"
      : "mismatch";
    const descriptionMatches = normalize(check.frozenDescription) === normalize(current.description);
    const categoryMatches = normalize(check.baseline?.category) === normalize(current.category);
    const menuContentVerdict = descriptionMatches && categoryMatches ? "verified" : "mismatch";
    const notes = [];
    if (aliasName) notes.push(`The frozen presentation reconciles with current “${current.name}”.`);
    if (menuContentVerdict === "mismatch") {
      notes.push("The frozen generic Restaurant category or old description differs from the current menu presentation.");
    }
    if (allergenVerdict === "mismatch") {
      notes.push(
        `Frozen signals [${sorted(check.baseline?.allergens).join(", ") || "none"}] differ from supported current signals [${sorted(current.allergens).join(", ") || "none"}].`,
      );
    }
    if (notes.length === 0) {
      notes.push("The frozen product, menu content, and supported positive signals reconcile with current owner-issued evidence.");
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
      sourceEvidenceIds: evidenceIds,
      currentItemIds: [current.id],
      notes: notes.join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
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
        "missing_from_source",
      ]),
      allergens: countValues(itemChecks, "allergenVerdict", ["verified", "mismatch", "not_applicable"]),
      menuContent: countValues(itemChecks, "menuContentVerdict", ["verified", "mismatch", "not_applicable"]),
      matchedBaselineItemCount: itemChecks.filter((row) =>
        ["exact_match", "normalized_match", "variant_match"].includes(row.disposition)
      ).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
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
    .replace(/[’']/g, "")
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
  const checks = enrichApapachoChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileApapachoBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
