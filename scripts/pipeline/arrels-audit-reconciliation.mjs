import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "arrels-dc";
const evidenceIds = [
  "official-arlo-current-restaurant-page",
  "official-arlo-current-breakfast-pdf",
  "eater-arrels-closure-announcement",
  "wtop-arrels-closed-confirmation",
  "legacy-arrels-menu-review",
];

export function reconcileArrelsBaselineItems(checks, snapshot) {
  if (
    snapshot.locationStatus !== "permanently_closed" ||
    snapshot.replacementStatus !== "transitional_breakfast_service" ||
    snapshot.items.length !== 0
  ) {
    throw new Error("Arrels closure snapshot is not terminal.");
  }

  const itemChecks = checks.map((check) => ({
    ...check,
    disposition: "stale_extra",
    allergenVerdict: "not_applicable",
    sourceEvidenceIds: evidenceIds,
    notes:
      "This frozen row came from an older third-party Restaurant Week dinner PDF. Arrels permanently closed in late March 2026, and Arlo's current first-party page now presents a transitional breakfast operation under a different identity. The row and its promoted official-allergen provenance cannot remain on Arrels.",
  }));

  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: { stale_extra: itemChecks.length },
      allergens: { not_applicable: itemChecks.length },
      mismatchKinds: {
        stale_closed_restaurant_menu: itemChecks.length,
        promoted_third_party_provenance: itemChecks.filter(
          (row) => row.baseline?.allergenSourceType === "official-allergen-menu",
        ).length,
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
  const result = reconcileArrelsBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
