import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-amuse-3396064825";
const evidenceIds = [
  "official-marriott-dining",
  "official-marriott-retired-amuse-detail",
  "rosslyn-identity-page",
];
const otherRestaurantItems = new Set([
  "apple crisp bowl",
  "cajun shrimp salad",
  "pumpkin spice chai",
]);

export function reconcileAmuseBaselineItems(checks, snapshot) {
  if (
    snapshot.locationStatus !== "temporarily_closed_for_renovation" ||
    snapshot.items.length !== 0
  ) {
    throw new Error("Amuse closure snapshot is not terminal.");
  }

  const itemChecks = checks.map((check) => {
    const isOtherRestaurantItem = otherRestaurantItems.has(
      String(check.baseline?.name ?? "").toLowerCase(),
    );
    return {
      ...check,
      disposition: isOtherRestaurantItem ? "location_mismatch" : "artifact",
      allergenVerdict: "not_applicable",
      sourceEvidenceIds: evidenceIds,
      notes: isOtherRestaurantItem
        ? "This row belongs to another Rosslyn restaurant named in a district-wide feature page, not Amuse. Marriott currently states that Amuse is temporarily closed for renovation and publishes no operating menu, so this row and its allergen claims cannot remain on Amuse."
        : "This row is directory chrome, an unrelated restaurant identity card, address text, or interview copy rather than an Amuse menu item. Marriott currently states that Amuse is temporarily closed for renovation and publishes no operating menu.",
    };
  });

  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: {
        artifact: itemChecks.filter((row) => row.disposition === "artifact").length,
        location_mismatch: itemChecks.filter(
          (row) => row.disposition === "location_mismatch",
        ).length,
      },
      allergens: { not_applicable: itemChecks.length },
      mismatchKinds: {
        cross_location_source_contamination: itemChecks.length,
      },
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(
    `data/restaurant-verification/item-checks/${restaurantId}.jsonl`,
  );
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAmuseBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
