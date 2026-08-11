import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aromaPizzaRestaurantId } from "./aroma-pizza-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-aroma-domain-compromised",
  "aroma-toast-current-browser-view",
  "aroma-toast-jina-transport",
  "aroma-instagram-inaccessible",
  "aroma-allergen-source-search",
]);

const idAliases = Object.freeze({
  "baked-fries-and-cheese": "baked-fries-cheese",
  "baked-fries-bacon-and-cheese": "baked-fries-bacon-cheese",
  "baked-fries-jalapeno-and-cheese": "baked-fries-jalapeno-cheese",
  "chicken-phillyand-cheese-sub": "chicken-philly-cheese-sub",
  "garlic-bread-with-cheese-40-45pcs": "garlic-bread-with-cheese-4045pcs",
  "garlic-knots40-45-pcs": "garlic-knots4045-pcs",
  "turkey-ham-and-cheese-sub": "turkey-ham-cheese-sub",
});

const artifactNames = new Set([
  "Baked Pastas",
  "Cheese Pizzas make your own",
  "Chicken pastas",
  "Chicken Pizza",
  "Pastas make your own (add topping)",
  "Seafood Pasta",
  "Soup & Salad",
  "Wings",
]);

export function enrichAromaPizzaChecks(checks, frozenRestaurant) {
  if ((frozenRestaurant?.items ?? []).length !== 178) {
    throw new Error(`Aroma Pizza frozen target expected 178 rows, found ${frozenRestaurant?.items?.length ?? 0}.`);
  }
  return checks.map((check) => {
    const frozen = frozenRestaurant.items[check.baselineIndex];
    if (frozen?.id !== check.baseline.itemId) {
      throw new Error(`Aroma Pizza frozen baseline mismatch at ${check.auditItemKey}.`);
    }
    return {
      ...check,
      frozenDescription: frozen.description ?? null,
      frozenIngredientsText: frozen.ingredientsText ?? null,
      frozenInferredAllergenIds: (frozen.inferredAllergenSignals ?? []).map((signal) => signal.id),
    };
  });
}

export function reconcileAromaPizzaBaselineItems(checks, snapshot) {
  if (checks.length !== 178) {
    throw new Error(`Aroma Pizza reconciliation expected 178 frozen rows, found ${checks.length}.`);
  }
  if (snapshot.items?.length !== 199) {
    throw new Error(`Aroma Pizza corrected catalog expected 199 products, found ${snapshot.items?.length ?? 0}.`);
  }
  const currentById = new Map(snapshot.items.map((row) => [row.id, row]));
  const matchedCurrentIds = new Set();
  let fixedSignalMismatchCount = 0;
  let provenanceMismatchCount = 0;
  let menuContentMismatchCount = 0;

  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (artifactNames.has(baseline.name)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: [...evidenceIds],
        currentItemIds: [],
        notes: "The frozen HTML parser promoted a current Toast section heading to a standalone menu item. The reviewed catalog retains the section only as category structure.",
      };
    }
    const currentId = idAliases[baseline.itemId] ?? baseline.itemId;
    const current = currentById.get(currentId);
    if (!current) throw new Error(`Unclassified Aroma Pizza frozen row: ${baseline.name}.`);
    matchedCurrentIds.add(current.id);
    const fixedMatch = sameSet(baseline.allergens, current.allergens);
    const contactMatch = sameSet(baseline.mayContain, current.mayContain);
    const provenanceMatch = baseline.allergenSourceType === current.allergenSourceType;
    if (!fixedMatch) fixedSignalMismatchCount += 1;
    if (!provenanceMatch) provenanceMismatchCount += 1;
    const menuMatch = baseline.name === current.name &&
      baseline.category === current.category &&
      normalizedText(check.frozenDescription) === normalizedText(current.description);
    if (!menuMatch) menuContentMismatchCount += 1;
    return {
      ...check,
      disposition: baseline.itemId === current.id ? "exact_match" : "normalized_match",
      allergenVerdict: fixedMatch && contactMatch && provenanceMatch
        ? "accurately_unavailable"
        : "mismatch",
      menuContentVerdict: menuMatch ? "verified" : "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [current.id],
      notes: [
        `Current exact-address Toast match: ${current.name} (${current.category}).`,
        ...(fixedMatch ? [] : [`Frozen fixed signals [${sorted(baseline.allergens).join(", ") || "none"}] are unsupported by current restaurant-issued allergen evidence and are removed.`]),
        ...(provenanceMatch ? [] : [`Frozen provenance ${baseline.allergenSourceType} is unsupported; current reviewed provenance is ${current.allergenSourceType}.`]),
        ...(menuMatch ? [] : ["The frozen name, all-Pizza category, description, or item boundary does not fully match the current product."]),
        "Toast is restaurant-linked vendor menu evidence only. Its wording remains separate Ingredient Intelligence and is not an official allergen, absence, or cross-contact claim.",
      ].join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((row) => !matchedCurrentIds.has(row.id));
  return {
    restaurantId: aromaPizzaRestaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition"),
      allergens: countValues(itemChecks, "allergenVerdict"),
      menuContent: countValues(itemChecks, "menuContentVerdict"),
      matchedBaselineItemCount: itemChecks.filter((row) => row.disposition !== "artifact").length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      artifactItemCount: itemChecks.filter((row) => row.disposition === "artifact").length,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      provenanceMismatchCount,
      menuContentMismatchCount,
    },
  };
}

function normalizedText(value) { return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }
function sameSet(left, right) { return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right)); }
function sorted(values) { return [...(values ?? [])].sort(); }
function countValues(rows, field) {
  return Object.fromEntries([...new Set(rows.map((row) => row[field]))].map(
    (value) => [value, rows.filter((row) => row[field] === value).length],
  ));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const itemCheckPath = path.resolve(`data/restaurant-verification/item-checks/${aromaPizzaRestaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(itemCheckPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${aromaPizzaRestaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const repository = JSON.parse(liveText);
  const frozenRestaurant = repository.restaurants.find((row) => row.id === aromaPizzaRestaurantId);
  const checks = enrichAromaPizzaChecks(checkText.trim().split(/\r?\n/).map(JSON.parse), frozenRestaurant);
  const result = reconcileAromaPizzaBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(itemCheckPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((row) => ({ id: row.id, name: row.name, category: row.category })),
  }, null, 2));
}
