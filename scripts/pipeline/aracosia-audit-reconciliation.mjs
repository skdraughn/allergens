import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalAracosiaNameKey,
  restaurantIdAracosia as restaurantId,
} from "./aracosia-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-aracosia-home",
  "official-aracosia-menu-page",
  "official-aracosia-wix-menus",
  "official-aracosia-wix-sections",
  "official-aracosia-wix-items",
]);

export const staleAracosiaFrozenNames = Object.freeze([
  "Kids Beef Bistro Burger",
  "Kids Beef Tenderloin",
  "Kids Chicken Breast Kabob",
  "Kids Frenched Rack of Lamb [Chopaan]",
  "Kids Lamb Tenderloin",
  "Lamb Chop Duo",
  "Lamb Shoulder Chops",
  "Lamb Shoulder with Okra",
  "Lamb Tenderloin",
  "Kids Leek & Scallion Dumplings [Aushak]",
  "Kids Spicy Beef Dumplings [Mantu]",
  "Goat Aracosia (AKM)",
  "Goat Qorma",
  "Kids Chicken Lawaan",
  "Kids Veal Lawaan",
  "Oxtail Moghuli (AKM)",
  "Quail (AKM)",
  "Saffron Chicken",
  "Kids Qabuli Combination Platter",
  "Kids Salmon",
  "Kids Bistro Signature Lentil Soup",
  "Kichir-e-Quroot",
  "Spicy Lamb Leg Sabzi Lawaan",
]);

const staleNameKeys = new Set(staleAracosiaFrozenNames.map(canonicalAracosiaNameKey));

export function enrichAracosiaChecksFromFrozenRestaurant(checks, restaurant) {
  if ((restaurant?.items ?? []).length !== 139) {
    throw new Error(`Aracosia frozen repository target expected 139 rows, found ${restaurant?.items?.length ?? 0}.`);
  }
  return checks.map((check) => {
    const frozenItem = restaurant.items[check.baselineIndex];
    if (frozenItem?.id !== check.baseline.itemId) {
      throw new Error(
        `Aracosia frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline.itemId}.`,
      );
    }
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? frozenItem.description ?? null,
      frozenInferredAllergenIds: check.frozenInferredAllergenIds ??
        (frozenItem.inferredAllergenSignals ?? []).map((signal) => signal.id),
      frozenInferredIngredients: check.frozenInferredIngredients ??
        (frozenItem.inferredIngredients ?? []),
      frozenSourceSummary: check.frozenSourceSummary ?? frozenItem.sourceSummary ?? null,
    };
  });
}

export function reconcileAracosiaBaselineItems(checks, snapshot) {
  if (checks.length !== 139) {
    throw new Error(`Aracosia reconciliation expected 139 frozen rows, found ${checks.length}.`);
  }
  if (snapshot.items?.length !== 107) {
    throw new Error(`Aracosia reconciliation expected 107 current products, found ${snapshot.items?.length ?? 0}.`);
  }
  const currentByKey = new Map(
    snapshot.items.map((item) => [canonicalAracosiaNameKey(item.name), item]),
  );
  const matchedCurrentIds = new Set();
  const unexpectedMissing = [];
  let fixedSignalMismatchCount = 0;
  let inferenceMismatchCount = 0;
  let provenanceMismatchCount = 0;

  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const key = canonicalAracosiaNameKey(baselineName);
    const current = currentByKey.get(key);
    if (!current) {
      if (!staleNameKeys.has(key)) unexpectedMissing.push(baselineName);
      return {
        ...check,
        disposition: staleNameKeys.has(key) ? "stale_extra" : "missing_from_source",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: [...evidenceIds],
        currentItemIds: [],
        notes: staleNameKeys.has(key)
          ? "This frozen product is no longer published: its Wix item or containing menu is hidden from the four current public menus."
          : "No reviewed current Aracosia product reconciles with this frozen row.",
      };
    }

    matchedCurrentIds.add(current.id);
    const fixedSignalsMatch = sameSet(check.baseline?.allergens, current.allergens);
    const mayContainMatch = sameSet(check.baseline?.mayContain, current.mayContain);
    const inferenceMatch = sameSet(
      check.frozenInferredAllergenIds,
      (current.inferredAllergenSignals ?? []).map((signal) => signal.id),
    );
    const provenanceMatch =
      clean(check.baseline?.allergenSourceType) === clean(current.allergenSourceType);
    if (!fixedSignalsMatch || !mayContainMatch) fixedSignalMismatchCount += 1;
    if (!inferenceMatch) inferenceMismatchCount += 1;
    if (!provenanceMatch) provenanceMismatchCount += 1;
    const menuContentMatch =
      clean(check.baseline?.category) === clean(current.category) &&
      clean(check.frozenDescription) === clean(current.description);
    const notes = [];
    if (!fixedSignalsMatch) {
      notes.push(
        `Frozen fixed signals [${sorted(check.baseline?.allergens).join(", ") || "none"}] differ from reviewed owner-named signals [${sorted(current.allergens).join(", ") || "none"}].`,
      );
    }
    if (!inferenceMatch) {
      notes.push(
        `Frozen inferred signals [${sorted(check.frozenInferredAllergenIds).join(", ") || "none"}] differ from reviewed Ingredient Intelligence [${sorted((current.inferredAllergenSignals ?? []).map((signal) => signal.id)).join(", ") || "none"}].`,
      );
    }
    if (!provenanceMatch) {
      notes.push(
        `Frozen allergen provenance ${check.baseline?.allergenSourceType ?? "unavailable"} differs from reviewed provenance ${current.allergenSourceType}.`,
      );
    }
    if (!menuContentMatch) {
      notes.push("The frozen category or description differs from the current official menu presentation.");
    }
    if (notes.length === 0) {
      notes.push("The frozen presentation and allergen evidence reconcile with the current owner menu.");
    }
    return {
      ...check,
      disposition: clean(baselineName) === clean(current.name) ? "exact_match" : "variant_match",
      allergenVerdict:
        fixedSignalsMatch && mayContainMatch && inferenceMatch && provenanceMatch
          ? "verified"
          : "mismatch",
      menuContentVerdict: menuContentMatch ? "verified" : "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [current.id],
      notes: notes.join(" "),
    };
  });

  if (unexpectedMissing.length > 0) {
    throw new Error(`Unreviewed missing Aracosia rows: ${unexpectedMissing.join(", ")}.`);
  }
  const foundStale = new Set(
    itemChecks.filter((check) => check.disposition === "stale_extra")
      .map((check) => canonicalAracosiaNameKey(check.baseline.name)),
  );
  const missingExpectedStale = [...staleNameKeys].filter((key) => !foundStale.has(key));
  if (missingExpectedStale.length > 0) {
    throw new Error(`Expected stale Aracosia rows did not reconcile: ${missingExpectedStale.join(", ")}.`);
  }

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  return {
    restaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition"),
      allergens: countValues(itemChecks, "allergenVerdict"),
      menuContent: countValues(itemChecks, "menuContentVerdict"),
      matchedBaselineItemCount: itemChecks.filter((entry) =>
        ["exact_match", "variant_match"].includes(entry.disposition)
      ).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      inferenceMismatchCount,
      provenanceMismatchCount,
    },
  };
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function sameSet(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function countValues(rows, field) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row[field]))]
      .map((value) => [value, rows.filter((row) => row[field] === value).length]),
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
  const repository = JSON.parse(liveText);
  const frozenRestaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const checks = enrichAracosiaChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    frozenRestaurant,
  );
  const result = reconcileAracosiaBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(
    checkPath,
    `${result.itemChecks.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  );
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((entry) => entry.name),
  }, null, 2));
}
