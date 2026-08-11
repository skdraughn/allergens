import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdApplebees as restaurantId } from "./applebees-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-applebees-menu",
  "applebees-linked-nutritionix-menu",
  "applebees-linked-nutritionix-landing",
  "applebees-nutrition-readable-proxy",
  "applebees-interactive-nutrition-readable-proxy",
]);

const staleRows = new Map([
  ["bacon cheddar crispy chicken sandwich with grilled chicken", "This older sandwich is absent from the July 13 current consumer menu and current official menu surface."],
  ["bacon cheddar crispy chicken sandwich with hand breaded chicken", "This older sandwich is absent from the July 13 current consumer menu and current official menu surface."],
  ["boneless wings initial order", "This all-you-can-eat initial-order presentation is absent from the current consumer menu; current Boneless Wings is a different base presentation."],
  ["boneless wings refill order", "This all-you-can-eat refill presentation is absent from the current consumer menu; current Boneless Wings is a different base presentation."],
  ["double crunch shrimp initial order", "This all-you-can-eat initial-order duplicate is absent from the current consumer menu; the standard Double Crunch Shrimp remains current."],
  ["double crunch shrimp refill order", "This all-you-can-eat refill duplicate is absent from the current consumer menu; the standard Double Crunch Shrimp remains current."],
  ["impossible cheeseburger", "This product is absent from the July 13 current consumer menu."],
  ["neighborhood nachos with beef", "This older nachos presentation is absent from the July 13 current consumer menu."],
  ["neighborhood nachos with chicken", "This older nachos presentation is absent from the July 13 current consumer menu."],
  ["riblets initial order", "This all-you-can-eat initial-order presentation is absent from the current consumer menu; standard Riblets Plate and Platter products remain current."],
  ["riblets refill order", "This all-you-can-eat refill presentation is absent from the current consumer menu; standard Riblets Plate and Platter products remain current."],
  ["whole lotta bacon burger", "This limited-time burger is absent from the July 13 current consumer menu."],
]);

export function enrichApplebeesChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const frozenItem = (restaurant?.items ?? []).length === 118
      ? restaurant.items[check.baselineIndex]
      : null;
    if (frozenItem && frozenItem.id !== check.baseline.itemId) {
      throw new Error(
        `Applebee's frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline.itemId}.`,
      );
    }
    return {
      ...check,
      frozenDescription: check.frozenDescription ?? frozenItem?.description ?? null,
    };
  });
}

export function reconcileApplebeesBaselineItems(checks, snapshot) {
  if (checks.length !== 118) {
    throw new Error(`Applebee's reconciliation expected 118 frozen rows, found ${checks.length}.`);
  }
  if (snapshot.items?.length !== 130) {
    throw new Error(`Applebee's reconciliation expected 130 current rows, found ${snapshot.items?.length ?? 0}.`);
  }
  const currentByName = new Map(snapshot.items.map((entry) => [normalize(entry.name), entry]));
  const matchedCurrentIds = new Set();
  let fixedSignalMismatchCount = 0;
  let globalCrossContactMismatchCount = 0;

  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const key = normalize(baselineName);
    const staleReason = staleRows.get(key);
    if (staleReason) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: [...evidenceIds],
        currentItemIds: [],
        notes: staleReason,
      };
    }
    const current = currentByName.get(key);
    if (!current) {
      return {
        ...check,
        disposition: "missing_from_source",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: [...evidenceIds],
        currentItemIds: [],
        notes: "No reviewed current Applebee's product reconciles with this frozen row.",
      };
    }

    matchedCurrentIds.add(current.id);
    const fixedSignalsMatch = equalSignals(check.baseline?.allergens, current.allergens);
    const crossContactMatches = equalSignals(check.baseline?.mayContain, current.mayContain);
    if (!fixedSignalsMatch) fixedSignalMismatchCount += 1;
    if (!crossContactMatches) globalCrossContactMismatchCount += 1;
    const allergenVerdict = fixedSignalsMatch && crossContactMatches ? "verified" : "mismatch";
    const menuContentVerdict =
      normalize(check.baseline?.category) === normalize(current.category) &&
      normalize(check.frozenDescription) === normalize(current.description)
        ? "verified"
        : "mismatch";
    const notes = [];
    if (!fixedSignalsMatch) {
      notes.push(
        `Frozen fixed signals [${sorted(check.baseline?.allergens).join(", ") || "none"}] differ from the current item row [${sorted(current.allergens).join(", ") || "none"}].`,
      );
    }
    if (!crossContactMatches) {
      notes.push("The frozen row omitted Applebee's current global shared-prep/common-fryer allergen and gluten warning.");
    }
    if (menuContentVerdict === "mismatch") {
      notes.push("The frozen category or description differs from the current consumer-menu presentation.");
    }
    if (notes.length === 0) {
      notes.push("The frozen product and current item-level allergen row reconcile with current evidence.");
    }
    return {
      ...check,
      disposition: baselineName === current.name ? "exact_match" : "normalized_match",
      allergenVerdict,
      menuContentVerdict,
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [current.id],
      notes: notes.join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((entry) => !matchedCurrentIds.has(entry.id));
  return {
    restaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition", [
        "exact_match",
        "normalized_match",
        "stale_extra",
        "missing_from_source",
      ]),
      allergens: countValues(itemChecks, "allergenVerdict", ["verified", "mismatch", "not_applicable"]),
      menuContent: countValues(itemChecks, "menuContentVerdict", ["verified", "mismatch", "not_applicable"]),
      matchedBaselineItemCount: itemChecks.filter((entry) =>
        ["exact_match", "normalized_match"].includes(entry.disposition)
      ).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      globalCrossContactMismatchCount,
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
    values.map((value) => [value, rows.filter((entry) => entry[field] === value).length])
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
  const live = JSON.parse(liveText);
  const liveRestaurant = (Array.isArray(live) ? live : live.restaurants)
    .find((entry) => entry.id === restaurantId);
  const checks = enrichApplebeesChecksFromFrozenRestaurant(
    checkText.trim().split(/\r?\n/).map(JSON.parse),
    liveRestaurant,
  );
  const result = reconcileApplebeesBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((entry) => entry.name),
  }, null, 2));
}
