import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { arepasCapitolRestaurantId } from "./arepas-capitol-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "arepas-capitol-replacement-domain-live",
  "arepas-capitol-doordash-current-menu",
  "arepas-capitol-beyond-current-menu",
  "arepas-capitol-menuweb-pdf",
]);

const currentMatches = Object.freeze({
  "Ham & Cheese Arepa": "jamon-y-queso-ham-and-cheese",
  "La Sifrina Burger": "la-sifrina-burger",
  "Shredded Chicken Arepa": "pollo-mechado-shredded-chicken",
  Tequenos: "4-tequenos",
});

const artifactNames = new Set(["Cachapa", "Cakes", "Empanadas", "Fresh Juices", "Pepito"]);

export function enrichArepasCapitolChecks(checks, frozenRestaurant) {
  if ((frozenRestaurant?.items ?? []).length !== 9) {
    throw new Error(`Arepas Capitol frozen target expected 9 rows, found ${frozenRestaurant?.items?.length ?? 0}.`);
  }
  return checks.map((check) => {
    const frozen = frozenRestaurant.items[check.baselineIndex];
    if (frozen?.id !== check.baseline.itemId) throw new Error(`Arepas Capitol frozen baseline mismatch at ${check.auditItemKey}.`);
    return {
      ...check,
      frozenDescription: frozen.description ?? null,
      frozenInferredAllergenIds: (frozen.inferredAllergenSignals ?? []).map((signal) => signal.id),
    };
  });
}

export function reconcileArepasCapitolBaselineItems(checks, snapshot) {
  if (checks.length !== 9) throw new Error(`Arepas Capitol reconciliation expected 9 frozen rows, found ${checks.length}.`);
  if (snapshot.items?.length !== 85) throw new Error(`Arepas Capitol corrected catalog expected 85 products, found ${snapshot.items?.length ?? 0}.`);
  const currentById = new Map(snapshot.items.map((entry) => [entry.id, entry]));
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
        notes: "The frozen generic-site parser promoted a homepage category or promotional tile to a product. Its truncated 'View' text is not a menu description, and the current catalog publishes the underlying products separately.",
      };
    }
    const currentId = currentMatches[baseline.name];
    const current = currentById.get(currentId);
    if (!current) throw new Error(`Missing expected current Arepas Capitol product for ${baseline.name}.`);
    matchedCurrentIds.add(currentId);
    const fixedMatch = sameSet(baseline.allergens, current.allergens);
    const contactMatch = sameSet(baseline.mayContain, current.mayContain);
    const provenanceMatch = baseline.allergenSourceType === current.allergenSourceType;
    if (!fixedMatch) fixedSignalMismatchCount += 1;
    if (!provenanceMatch) provenanceMismatchCount += 1;
    menuContentMismatchCount += 1;
    return {
      ...check,
      disposition: baseline.name === current.name ? "exact_match" : "normalized_match",
      allergenVerdict: fixedMatch && contactMatch && provenanceMatch ? "accurately_unavailable" : "mismatch",
      menuContentVerdict: "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [currentId],
      notes: [
        `Current match: ${current.name} in ${current.category}.`,
        `The frozen generic category and '${check.frozenDescription ?? "missing"}' tile text do not describe the current product.`,
        ...(fixedMatch ? [] : [`Frozen fixed signals [${sorted(baseline.allergens).join(", ") || "none"}] differ from the current restaurant-official state [unavailable].`]),
        ...(provenanceMatch ? [] : [`Frozen provenance ${baseline.allergenSourceType} was promoted from a homepage label; no current restaurant-issued allergen disclosure supports it.`]),
        "The current exact-address menu is third-party evidence, so its ingredient wording remains Ingredient Intelligence rather than an official fixed or negative allergen claim.",
      ].join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((entry) => !matchedCurrentIds.has(entry.id));
  return {
    restaurantId: arepasCapitolRestaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition"),
      allergens: countValues(itemChecks, "allergenVerdict"),
      menuContent: countValues(itemChecks, "menuContentVerdict"),
      matchedBaselineItemCount: itemChecks.filter((entry) => ["exact_match", "normalized_match"].includes(entry.disposition)).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      artifactItemCount: itemChecks.filter((entry) => entry.disposition === "artifact").length,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      provenanceMismatchCount,
      menuContentMismatchCount,
    },
  };
}

function sameSet(left, right) { return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right)); }
function sorted(values) { return [...(values ?? [])].sort(); }
function countValues(rows, field) {
  return Object.fromEntries([...new Set(rows.map((row) => row[field]))].map(
    (value) => [value, rows.filter((row) => row[field] === value).length],
  ));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${arepasCapitolRestaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${arepasCapitolRestaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const repository = JSON.parse(liveText);
  const frozenRestaurant = repository.restaurants.find((entry) => entry.id === arepasCapitolRestaurantId);
  const checks = enrichArepasCapitolChecks(checkText.trim().split(/\r?\n/).map(JSON.parse), frozenRestaurant);
  const result = reconcileArepasCapitolBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((entry) => entry.name),
  }, null, 2));
}
