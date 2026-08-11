import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { arepaZoneRestaurantId } from "./arepa-zone-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-arepa-zone-allergens-page",
  "official-arepa-zone-allergen-guide",
  "official-arepa-zone-current-products",
  "official-arepa-zone-order-page",
  "arepa-zone-live-locations-api",
  "arepa-zone-mosaico-products-api",
  "arepa-zone-14th-street-products-api",
  "arepa-zone-western-market-products-api",
  "official-arepa-zone-shopify-products-api",
]);

const currentMatches = Object.freeze({
  "American Dream": ["american-dream-cachapa"],
  Canosa: ["canosa-arepa"],
  "Capresa con Jamón": ["capresa-arepa"],
  "Carne Mechada": ["carne-mechada-arepa", "carne-mechada-empanada"],
  Catira: ["catira-arepa"],
  Chicken: ["patacon"],
  Dominó: ["domino-arepa"],
  "Jamón y Queso": ["jamon-y-queso-arepa"],
  "Marquesa de Parchita": ["marquesa-de-parchita"],
  Pabellón: ["pabellon-arepa", "pabellon-empanada"],
  Pelúa: ["pelua-arepa"],
  Pernil: ["pernil-arepa"],
  "Pollo Mechado": ["pollo-mechado-arepa", "pollo-empanada"],
  Presidencial: ["presidencial-cachapa"],
  "Primera Dama": ["primera-dama-cachapa"],
  "Queso Rellado": ["queso-rallado-arepa"],
  "Reina Pepiada": ["reina-pepiada-arepa"],
  "Salsa de Ajo": ["salsa-de-ajo"],
  Sifrina: ["sifrina-arepa"],
  Vegana: ["vegana-arepa"],
  Washingtonian: ["washingtonian-cachapa"],
});

const artifactNames = new Set([
  "Patacón Viudo Tres Leches",
  "Perro Caraqueño Pepito Fondue",
  "Salsa Picante Pepito Mosaico",
]);

export function enrichArepaZoneChecks(checks, frozenRestaurant) {
  if ((frozenRestaurant?.items ?? []).length !== 49) {
    throw new Error(`Arepa Zone frozen repository target expected 49 rows, found ${frozenRestaurant?.items?.length ?? 0}.`);
  }
  return checks.map((check) => {
    const frozen = frozenRestaurant.items[check.baselineIndex];
    if (frozen?.id !== check.baseline.itemId) throw new Error(`Arepa Zone frozen baseline index mismatch at ${check.auditItemKey}.`);
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? frozen.description ?? null,
      frozenInferredAllergenIds: check.frozenInferredAllergenIds ??
        (frozen.inferredAllergenSignals ?? []).map((signal) => signal.id),
    };
  });
}

export function reconcileArepaZoneBaselineItems(checks, snapshot) {
  if (checks.length !== 49) throw new Error(`Arepa Zone reconciliation expected 49 frozen rows, found ${checks.length}.`);
  if (snapshot.items?.length !== 75) throw new Error(`Arepa Zone corrected catalog expected 75 products, found ${snapshot.items?.length ?? 0}.`);
  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const matchedCurrentIds = new Set();
  let fixedSignalMismatchCount = 0;
  let crossContactMismatchCount = 0;
  let provenanceMismatchCount = 0;
  let menuContentMismatchCount = 0;

  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (artifactNames.has(baseline.name)) {
      return resolvedNonCurrent(
        check,
        "artifact",
        "The frozen parser concatenated adjacent PDF matrix rows into one non-product name and destroyed their separate allergen columns.",
      );
    }
    const currentIds = currentMatches[baseline.name];
    if (!currentIds) {
      return resolvedNonCurrent(
        check,
        "stale_extra",
        "This matrix-era row is not a currently published canonical product in the three live DC ordering menus.",
      );
    }
    const currentItems = currentIds.map((id) => {
      const item = currentById.get(id);
      if (!item) throw new Error(`Missing expected current Arepa Zone product ${id}.`);
      matchedCurrentIds.add(id);
      return item;
    });
    const currentFixed = unique(currentItems.flatMap((item) => item.allergens));
    const currentContact = unique(currentItems.flatMap((item) => item.mayContain));
    const fixedMatch = sameSet(baseline.allergens, currentFixed);
    const contactMatch = sameSet(baseline.mayContain, currentContact);
    const currentProvenance = unique(currentItems.map((item) => item.allergenSourceType));
    const provenanceMatch = currentProvenance.length === 1 && baseline.allergenSourceType === currentProvenance[0];
    if (!fixedMatch) fixedSignalMismatchCount += 1;
    if (!contactMatch) crossContactMismatchCount += 1;
    if (!provenanceMatch) provenanceMismatchCount += 1;
    menuContentMismatchCount += 1;
    const disposition = currentIds.length > 1 || baseline.name === "Chicken"
      ? "variant_match"
      : baseline.name === currentItems[0].name ? "exact_match" : "normalized_match";
    const notes = [
      ...(fixedMatch ? [] : [`Frozen fixed signals [${sorted(baseline.allergens).join(", ") || "none"}] differ from the reviewed current product union [${sorted(currentFixed).join(", ") || "none"}].`]),
      ...(contactMatch ? [] : [`Frozen contact signals [${sorted(baseline.mayContain).join(", ") || "none"}] omit the matrix facility warning represented as [${sorted(currentContact).join(", ") || "none"}].`]),
      ...(provenanceMatch ? [] : [`Frozen provenance ${baseline.allergenSourceType} differs from reviewed provenance [${currentProvenance.join(", ")}].`]),
      `The frozen generic category ${baseline.category} loses current categories [${unique(currentItems.map((item) => item.category)).join(", ")}] and location scope.`,
      ...(currentIds.length > 1 ? ["The frozen name collapsed multiple matrix sections that now map to separate current products."] : []),
    ];
    return {
      ...check,
      disposition,
      allergenVerdict: fixedMatch && contactMatch && provenanceMatch ? "verified" : "mismatch",
      menuContentVerdict: "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: currentIds,
      notes: notes.join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  return {
    restaurantId: arepaZoneRestaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition"),
      allergens: countValues(itemChecks, "allergenVerdict"),
      menuContent: countValues(itemChecks, "menuContentVerdict"),
      matchedBaselineItemCount: itemChecks.filter((item) => ["exact_match", "normalized_match", "variant_match"].includes(item.disposition)).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      artifactItemCount: itemChecks.filter((item) => item.disposition === "artifact").length,
      staleItemCount: itemChecks.filter((item) => item.disposition === "stale_extra").length,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      crossContactMismatchCount,
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

function sameSet(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function unique(values) {
  return [...new Set(values)];
}

function countValues(rows, field) {
  return Object.fromEntries([...new Set(rows.map((row) => row[field]))].map(
    (value) => [value, rows.filter((row) => row[field] === value).length],
  ));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${arepaZoneRestaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${arepaZoneRestaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const repository = JSON.parse(liveText);
  const frozenRestaurant = repository.restaurants.find((entry) => entry.id === arepaZoneRestaurantId);
  const checks = enrichArepaZoneChecks(checkText.trim().split(/\r?\n/).map(JSON.parse), frozenRestaurant);
  const result = reconcileArepaZoneBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((item) => JSON.stringify(item)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
