import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdAmbassador } from "./ambassador-restaurant-audit-catalog.mjs";

const realFrozenRows = new Set([
  "beets",
  "cabbage",
  "chicken",
  "espresso",
  "ethiopian stew",
  "lettuce",
  "spinach",
]);

const artifactNotes = new Map([
  ["start with shareable choices", "Group-dining planning copy, not a purchasable menu item."],
  ["use ordering as a fallback", "Ordering guidance, not a purchasable menu item."],
  ["call us now", "Call-to-action button text, not a menu item."],
  ["current listed hours", "Operating-hours copy, not a menu item."],
  ["restaurant", "Generic page/entity label, not a menu item."],
  ["check current availability", "Availability guidance, not a menu item."],
  ["plan around service options", "Service-planning copy, not a menu item."],
  ["start with menu highlights", "Marketing copy that names other dishes, not a menu item."],
  ["4 8 star", "Review-rating text, not a menu item."],
  ["find us on 9th street nw", "Location and directions copy, not a menu item."],
  ["options", "Service-option label, not a menu item."],
  ["plan dishes that travel well", "Takeout-planning copy, not a menu item."],
]);

export function reconcileAmbassadorBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    const key = normalize(check.baseline.name);
    if (realFrozenRows.has(key)) {
      const current = currentByName.get(key);
      if (!current) throw new Error(`Missing current Ambassador row: ${check.baseline.name}`);
      matchedCurrentNames.add(current.name);
      const inferred = current.inferredAllergenSignals?.map((signal) => signal.id) ?? [];
      return {
        ...check,
        disposition: "exact_match",
        allergenVerdict: "accurately_unavailable",
        sourceEvidenceIds: current.name === "Chicken"
          ? [
              "official-menu",
              "uber-eats-menu-browser-review",
              "restaurantji-menu-image-desktop",
              "restaurantji-menu-image-mobile",
              "allmenus-menu",
            ]
          : ["official-menu"],
        notes: inferred.length > 0
          ? `${current.name} remains current. No restaurant-issued allergen disclosure was located; reviewed non-official menu wording supports Ingredient Intelligence signals for ${inferred.join(", ")}, which are not promoted to official contains claims.`
          : `${current.name} remains on the current first-party guest-favorites page. No item-level ingredient or allergen disclosure was located, so official allergen data remains accurately unavailable.`,
      };
    }

    const artifactNote = artifactNotes.get(key);
    if (!artifactNote) throw new Error(`Unadjudicated Ambassador frozen row: ${check.baseline.name}`);
    return {
      ...check,
      disposition: "artifact",
      allergenVerdict: "not_applicable",
      sourceEvidenceIds: ["official-home", "official-menu"],
      notes: `${artifactNote} The current first-party menu and identity-matched menu sources do not publish it as a formulation.`,
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentNames.has(item.name));
  return {
    restaurantId: restaurantIdAmbassador,
    itemChecks,
    omittedCurrentItems: omittedCurrentItems.map((item) => item.name),
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      matchedCurrentFormulations: matchedCurrentNames.size,
      omittedCurrentFormulations: omittedCurrentItems.length,
    },
  };
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(
    `data/restaurant-verification/item-checks/${restaurantIdAmbassador}.jsonl`,
  );
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmbassador}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAmbassadorBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
