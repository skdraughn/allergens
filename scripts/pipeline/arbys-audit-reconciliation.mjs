import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { arbysRestaurantId, canonicalArbysNameKey } from "./arbys-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-arbys-menu",
  "official-arbys-nutrition-page",
  "official-arbys-nutrition-allergen-aug-2026",
  "official-arbys-ingredients-aug-2026",
  "official-arbys-gluten-free-apr-2025",
  "official-arbys-alliance-apr-2025",
  "official-arbys-menu-meals",
  "official-arbys-menu-limited-time",
  "official-arbys-menu-slow-roasted-beef",
  "official-arbys-menu-crispy-juicy-chicken",
  "official-arbys-menu-crafted-sandwiches",
  "official-arbys-menu-sides-snacks",
  "official-arbys-menu-desserts",
  "official-arbys-menu-beverages",
  "official-arbys-menu-kids-menu",
  "official-arbys-menu-value-menu",
]);

const nonProductNames = new Set([
  "Arby’s Sauce®",
  "Barbeque Dipping Sauce",
  "BBQ Dipping Sauce",
  "Bronco Berry Sauce®",
  "Buffalo Dipping Sauce",
  "Honey Mustard Dipping Sauce",
  "Horsey Sauce®",
  "Ketchup",
  "Marinara Sauce",
]);

export function reconcileArbysBaselineItems(checks, snapshot) {
  if (checks.length !== 66) throw new Error(`Arby's reconciliation expected 66 frozen rows, found ${checks.length}.`);
  if (snapshot.items?.length !== 78) throw new Error(`Arby's corrected catalog expected 78 products, found ${snapshot.items?.length ?? 0}.`);
  const currentByKey = new Map(snapshot.items.map((item) => [canonicalArbysNameKey(item.name), item]));
  const matchedCurrentIds = new Set();
  let fixedSignalMismatchCount = 0;
  let crossContactMismatchCount = 0;
  let provenanceMismatchCount = 0;
  let menuContentMismatchCount = 0;

  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    const artifact = baseline.category === "Ingredient" || baseline.category === "Toppings" || nonProductNames.has(baseline.name);
    if (artifact) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: [...evidenceIds],
        currentItemIds: [],
        notes: baseline.category === "Ingredient"
          ? "The frozen row is an ingredient-component glossary entry, not a consumer menu product. Alliance Kitchen evidence is specific to one Atlanta shared-kitchen location and cannot define the national Arby's catalog."
          : "The frozen row is a topping, sauce, or add-on component rather than a canonical consumer menu product.",
      };
    }

    const current = currentByKey.get(canonicalArbysNameKey(baseline.name));
    if (!current) throw new Error(`Unreviewed non-component Arby's frozen row: ${baseline.name}.`);
    matchedCurrentIds.add(current.id);
    const fixedMatch = sameSet(baseline.allergens, current.allergens);
    const crossContactMatch = sameSet(baseline.mayContain, current.mayContain);
    const provenanceMatch = baseline.allergenSourceType === current.allergenSourceType;
    const categoryMatch = (current.sourceCategories ?? [current.category]).some(
      (category) => normalizedCategory(category) === normalizedCategory(baseline.category),
    );
    if (!fixedMatch) fixedSignalMismatchCount += 1;
    if (!crossContactMatch) crossContactMismatchCount += 1;
    if (!provenanceMatch) provenanceMismatchCount += 1;
    if (!categoryMatch) menuContentMismatchCount += 1;
    const notes = [];
    if (!fixedMatch) notes.push(`Frozen fixed signals [${sorted(baseline.allergens).join(", ") || "none"}] differ from the current official row [${sorted(current.allergens).join(", ") || "none"}].`);
    if (!crossContactMatch) notes.push(`Frozen contact signals [${sorted(baseline.mayContain).join(", ") || "none"}] differ from the current official common-fryer/facility markers [${sorted(current.mayContain).join(", ") || "none"}].`);
    if (!provenanceMatch) notes.push(`Frozen provenance ${baseline.allergenSourceType} differs from ${current.allergenSourceType}.`);
    if (!categoryMatch) notes.push(`Frozen category ${baseline.category} does not reconcile with current presentations ${current.sourceCategories.join(", ")}.`);
    if (notes.length === 0) notes.push("The frozen product and fixed/contact allergen signals reconcile with current owner-issued evidence.");
    return {
      ...check,
      disposition: baseline.name === current.name ? "exact_match" : "normalized_match",
      allergenVerdict: fixedMatch && crossContactMatch && provenanceMatch ? "verified" : "mismatch",
      menuContentVerdict: categoryMatch ? "verified" : "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [current.id],
      notes: notes.join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  return {
    restaurantId: arbysRestaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition"),
      allergens: countValues(itemChecks, "allergenVerdict"),
      menuContent: countValues(itemChecks, "menuContentVerdict"),
      matchedBaselineItemCount: itemChecks.filter((item) => ["exact_match", "normalized_match"].includes(item.disposition)).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      artifactItemCount: itemChecks.filter((item) => item.disposition === "artifact").length,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      crossContactMismatchCount,
      provenanceMismatchCount,
      menuContentMismatchCount,
    },
  };
}

function normalizedCategory(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "").replace(/^arbys/, "");
}

function sameSet(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function countValues(rows, field) {
  return Object.fromEntries([...new Set(rows.map((row) => row[field]))].map(
    (value) => [value, rows.filter((row) => row[field] === value).length],
  ));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${arbysRestaurantId}.jsonl`);
  const [checkText, snapshotText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${arbysRestaurantId}/corrected-menu.json`), "utf8"),
  ]);
  const result = reconcileArbysBaselineItems(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(checkPath, `${result.itemChecks.map((item) => JSON.stringify(item)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
