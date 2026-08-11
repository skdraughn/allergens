import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aztecaRestaurantId } from "./azteca-college-park-audit-catalog.mjs";

export function reconcileAztecaCollegePark(baselineChecks, snapshot) {
  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const targetOverrides = new Map([
    ["2:grilled-quesadilla", "grilled-chicken-quesadilla"],
  ]);
  const itemChecks = baselineChecks.map((check) => {
    const targetId = targetOverrides.get(check.auditItemKey) ?? check.baseline.itemId;
    const target = currentById.get(targetId);
    if (!target) throw new Error(`Missing current Azteca target ${targetId}.`);
    return {
      ...check,
      disposition: check.auditItemKey === "2:grilled-quesadilla"
        ? "variant_match"
        : "exact_match",
      allergenVerdict: "mismatch",
      sourceEvidenceIds: ["official-home-current", "official-order-menu-current"],
      notes: check.auditItemKey === "2:grilled-quesadilla"
        ? "Current target: Grilled Chicken Quesadilla; milk is directly supported by the shared cheese and sour-cream description, while frozen wheat/gluten claims are unsupported. The frozen evidence URL also points to a different domain."
        : `Current target: ${target.name}; direct allergens remain ${target.allergens.join(", ")}. The frozen evidence URL points to a different domain and is replaced by the captured College Park source.`,
    };
  });
  if (
    itemChecks.length !== 3 ||
    new Set(itemChecks.map((row) => row.auditItemKey)).size !== 3 ||
    itemChecks.some((row) => row.disposition === "pending" || row.allergenVerdict === "pending")
  ) throw new Error("Incomplete Azteca College Park reconciliation.");
  return {
    restaurantId: aztecaRestaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
    },
  };
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = JSON.parse(await readFile(
    `data/restaurant-verification/repairs/${aztecaRestaurantId}/corrected-menu.json`,
    "utf8",
  ));
  const baselinePath = `data/restaurant-verification/item-checks/${aztecaRestaurantId}.jsonl`;
  const checks = (await readFile(baselinePath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  const result = reconcileAztecaCollegePark(checks, snapshot);
  await writeFile(baselinePath, `${result.itemChecks.map(JSON.stringify).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
