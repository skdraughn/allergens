import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { arenasRestaurantId, canonicalArenasNameKey } from "./arenas-georgetown-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-arenas-georgetown-location",
  "official-arenas-menu-page",
  "official-arenas-georgetown-july-2026-menu",
  "official-arenas-kids-menu",
  "arenas-toast-readable-proxy",
]);

const artifactNames = new Set(["Chicken Sandwiches", "Classic Sandwiches", "Veggie Options & Burgers"]);
const staleNames = new Set(["Large Hot Tots", "Mac and Cheese Bites", "Small Hot Tots"]);

export function enrichArenasChecks(checks, frozenRestaurant) {
  if ((frozenRestaurant?.items ?? []).length !== 90) {
    throw new Error(`Arena's frozen repository target expected 90 rows, found ${frozenRestaurant?.items?.length ?? 0}.`);
  }
  return checks.map((check) => {
    const frozen = frozenRestaurant.items[check.baselineIndex];
    if (frozen?.id !== check.baseline.itemId) throw new Error(`Arena's frozen baseline index mismatch at ${check.auditItemKey}.`);
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? frozen.description ?? null,
      frozenInferredAllergenIds: check.frozenInferredAllergenIds ??
        (frozen.inferredAllergenSignals ?? []).map((signal) => signal.id),
    };
  });
}

export function reconcileArenasBaselineItems(checks, snapshot) {
  if (checks.length !== 90) throw new Error(`Arena's reconciliation expected 90 frozen rows, found ${checks.length}.`);
  if (snapshot.items?.length !== 101) throw new Error(`Arena's corrected catalog expected 101 products, found ${snapshot.items?.length ?? 0}.`);
  const currentByKey = new Map(snapshot.items.map((item) => [canonicalArenasNameKey(item.name), item]));
  const matchedCurrentIds = new Set();
  let fixedSignalMismatchCount = 0;
  let provenanceMismatchCount = 0;
  let menuContentMismatchCount = 0;

  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (artifactNames.has(baseline.name)) {
      return resolvedNonCurrent(check, "artifact", "The frozen row is a Toast section heading promoted to a menu product.");
    }
    if (staleNames.has(baseline.name)) {
      return resolvedNonCurrent(check, "stale_extra", "This frozen product is absent from the current July 2026 owner menu and current restaurant-linked Toast catalog.");
    }
    const current = currentByKey.get(canonicalArenasNameKey(baseline.name));
    if (!current) throw new Error(`Unreviewed Arena's frozen row: ${baseline.name}.`);
    matchedCurrentIds.add(current.id);
    const fixedMatch = sameSet(baseline.allergens, current.allergens);
    const provenanceMatch = baseline.allergenSourceType === current.allergenSourceType;
    const descriptionMatch = clean(check.frozenDescription) === clean(current.description);
    const categoryMatch = baseline.category === current.category;
    if (!fixedMatch) fixedSignalMismatchCount += 1;
    if (!provenanceMatch) provenanceMismatchCount += 1;
    if (!descriptionMatch || !categoryMatch) menuContentMismatchCount += 1;
    const notes = [];
    if (!fixedMatch) notes.push(`Frozen fixed signals [${sorted(baseline.allergens).join(", ") || "none"}] differ from reviewed owner-named signals [${sorted(current.allergens).join(", ") || "none"}].`);
    if (!provenanceMatch) notes.push(`Frozen provenance ${baseline.allergenSourceType} differs from reviewed provenance ${current.allergenSourceType}.`);
    if (!categoryMatch) notes.push(`The frozen generic category ${baseline.category} loses the current source category ${current.category}.`);
    if (!descriptionMatch) notes.push("The frozen description differs from the current menu text.");
    if (notes.length === 0) notes.push("The frozen product, menu text, and positive allergen evidence reconcile with current sources.");
    return {
      ...check,
      disposition: baseline.name === current.name ? "exact_match" : "normalized_match",
      allergenVerdict: fixedMatch && provenanceMatch ? "verified" : "mismatch",
      menuContentVerdict: descriptionMatch && categoryMatch ? "verified" : "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [current.id],
      notes: notes.join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  return {
    restaurantId: arenasRestaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition"),
      allergens: countValues(itemChecks, "allergenVerdict"),
      menuContent: countValues(itemChecks, "menuContentVerdict"),
      matchedBaselineItemCount: itemChecks.filter((item) => ["exact_match", "normalized_match"].includes(item.disposition)).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      artifactItemCount: itemChecks.filter((item) => item.disposition === "artifact").length,
      staleItemCount: itemChecks.filter((item) => item.disposition === "stale_extra").length,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      provenanceMismatchCount,
      menuContentMismatchCount,
    },
  };
}

function resolvedNonCurrent(check, disposition, notes) {
  return {
    ...check,
    disposition,
    allergenVerdict: "not_applicable",
    menuContentVerdict: "not_applicable",
    sourceEvidenceIds: [...evidenceIds],
    currentItemIds: [],
    notes,
  };
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${arenasRestaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${arenasRestaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const repository = JSON.parse(liveText);
  const frozenRestaurant = repository.restaurants.find((entry) => entry.id === arenasRestaurantId);
  const checks = enrichArenasChecks(checkText.trim().split(/\r?\n/).map(JSON.parse), frozenRestaurant);
  const result = reconcileArenasBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((item) => JSON.stringify(item)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
