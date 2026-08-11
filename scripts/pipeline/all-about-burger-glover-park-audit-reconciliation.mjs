import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "all-about-burger-glover-park-dc";
const evidenceIds = ["official-current-menu-locations", "local-closure-report", "current-tenant-official-site"];

export function reconcileAllAboutBurgerGloverParkBaselineItems(checks, snapshot) {
  if (snapshot.locationStatus !== "closed_and_replaced" || snapshot.items.length !== 0) {
    throw new Error("All About Burger Glover Park closure snapshot is not terminal.");
  }
  const itemChecks = checks.map((check) => ({
    ...check,
    disposition: "stale_extra",
    allergenVerdict: "not_applicable",
    sourceEvidenceIds: evidenceIds,
    notes: "This is a row from the historical All About Burger Glover Park Toast catalog. The location closed, the chain's current official site no longer lists Glover Park, and Joia Burger now operates at the exact 2414 Wisconsin Avenue address; therefore no historical menu or allergen claim is current for this restaurant entry.",
  }));
  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: { stale_extra: itemChecks.length },
      allergens: { not_applicable: itemChecks.length },
      mismatchKinds: {},
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAllAboutBurgerGloverParkBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
