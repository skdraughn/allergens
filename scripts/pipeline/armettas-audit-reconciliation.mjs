import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { armettasRestaurantId } from "./armettas-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-armettas-current-menu",
  "official-armettas-retired-menu-alias",
  "armettas-current-menu-jina-transport",
]);

const aliases = Object.freeze({
  "3 Pcs Meatballs": "3 Pcs Meatball",
  "Gnocchi Capri": "Gnochi Capri",
  "Shrimp Fra Diavolo": "Shrimp Fradiavolo",
  "Small Fries": "Small Fry",
  "Kids Create Your Own Pasta": "Kids Create Your Own Pasta*",
});

const artifactNames = new Set([
  "3 Meatballs",
  "4 Oz. Cup Specialty Sauce",
  "4 oz. Cup Tomato Sauce",
  "9\" Extra Meat",
  "Alfredo",
  "Alfredo Sauce",
  "All Drums",
  "All Flats",
  "Anchovies",
  "Bacon",
  "Bacon Bits",
  "Bacon Strips",
  "Banana Peppers",
  "Basil",
  "Black Olives",
  "Double Patty",
  "Extra Smooth Tomato Sauce",
  "Feta",
  "Fresh Basil",
  "Fresh Tomatoes",
  "Fried Chicken",
  "Garlic",
  "Green Peppers",
  "Ground Beef",
  "Ham",
  "Jalapeños",
  "Meat Sauce",
  "Meat sauce with Meatballs",
  "Meatballs",
  "Meatballs and Meat Sauce",
  "Mozzarella",
  "Onions",
  "Pepperoni",
  "Pineapple",
  "Ricotta",
  "Salami",
  "Sausage",
  "Sausage and Meat Sauce",
  "Shredded Chicken",
  "Shredded Steak",
  "Shrimp (5)",
  "Spinach",
  "Tomatoes",
  "Tortellini",
  "Tuna",
  "Veggie Medley",
  "X Sauce",
]);

export function enrichArmettasChecks(checks, frozenRestaurant) {
  if ((frozenRestaurant?.items ?? []).length !== 238) {
    throw new Error(`Armetta's frozen target expected 238 rows, found ${frozenRestaurant?.items?.length ?? 0}.`);
  }
  return checks.map((check) => {
    const frozen = frozenRestaurant.items[check.baselineIndex];
    if (frozen?.id !== check.baseline.itemId) {
      throw new Error(`Armetta's frozen baseline mismatch at ${check.auditItemKey}.`);
    }
    return {
      ...check,
      frozenDescription: frozen.description ?? null,
      frozenIngredientsText: frozen.ingredientsText ?? null,
      frozenInferredAllergenIds: (frozen.inferredAllergenSignals ?? []).map((signal) => signal.id),
    };
  });
}

export function reconcileArmettasBaselineItems(checks, snapshot) {
  if (checks.length !== 238) throw new Error(`Armetta's reconciliation expected 238 frozen rows, found ${checks.length}.`);
  if (snapshot.items?.length !== 225) throw new Error(`Armetta's corrected catalog expected 225 products, found ${snapshot.items?.length ?? 0}.`);
  const currentByName = new Map(snapshot.items.map((row) => [row.name, row]));
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
        notes: "The frozen structured parser promoted a modifier, topping, sauce, protein choice, or quantity option to a standalone product. The current owner menu exposes no standalone product with this identity.",
      };
    }
    const currentName = aliases[baseline.name] ?? baseline.name;
    const current = currentByName.get(currentName);
    if (!current) {
      throw new Error(`Unclassified Armetta's frozen row: ${baseline.name}.`);
    }
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
    const disposition = baseline.name === current.name ? "exact_match" : "normalized_match";
    return {
      ...check,
      disposition,
      allergenVerdict: fixedMatch && contactMatch && provenanceMatch
        ? (current.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified")
        : "mismatch",
      menuContentVerdict: menuMatch ? "verified" : "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [current.id],
      notes: [
        `Current owner-menu match: ${current.name} (${current.category}).`,
        ...(fixedMatch ? [] : [`Frozen fixed signals [${sorted(baseline.allergens).join(", ") || "none"}] differ from reviewed current positive signals [${sorted(current.allergens).join(", ") || "none"}].`]),
        ...(provenanceMatch ? [] : [`Frozen provenance ${baseline.allergenSourceType} differs from current reviewed provenance ${current.allergenSourceType}.`]),
        ...(menuMatch ? [] : ["The frozen name, category, description, or item boundary does not fully match the current product."]),
        "The owner menu is partial ingredient evidence; no absent term is treated as a negative or cross-contact assurance.",
      ].join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((row) => !matchedCurrentIds.has(row.id));
  return {
    restaurantId: armettasRestaurantId,
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
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${armettasRestaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${armettasRestaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const repository = JSON.parse(liveText);
  const frozenRestaurant = repository.restaurants.find((row) => row.id === armettasRestaurantId);
  const checks = enrichArmettasChecks(checkText.trim().split(/\r?\n/).map(JSON.parse), frozenRestaurant);
  const result = reconcileArmettasBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((row) => ({ id: row.id, name: row.name, category: row.category })),
  }, null, 2));
}
