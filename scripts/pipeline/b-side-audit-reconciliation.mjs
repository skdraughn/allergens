import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bSideRestaurantId } from "./b-side-audit-catalog.mjs";

const mismatchIds = new Set([
  "ahi-tuna-poke",
  "b-side-smashburger",
  "bbqd-carrots",
  "brussels-sprouts",
  "caesar-salad",
  "charred-asparagus",
  "chili-spiced-nuts",
  "crispy-chesapeake-oysters",
  "heirloom-tomato-salad",
  "pickled-deviled-eggs",
  "rambos-spice-bag",
  "sicilian-anchovies",
  "smoked-pimento-cheese",
  "smoked-wings",
  "sour-cream-and-onion-chicharrones",
]);

export function reconcileBSide(baselineChecks, snapshot) {
  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const itemChecks = baselineChecks.map((check) => {
    const target = currentById.get(check.baseline.itemId);
    if (!target) throw new Error(`Missing current B Side item ${check.baseline.itemId}.`);
    return {
      ...check,
      disposition: "exact_match",
      allergenVerdict: mismatchIds.has(check.baseline.itemId)
        ? "mismatch"
        : "accurately_unavailable",
      sourceEvidenceIds: target.sourceUrls.map(sourceEvidenceId),
      notes: `Current target: ${target.name} (${target.category}); ${target.allergenSourceType}; direct allergens: ${target.allergens.join(", ") || "none"}.`,
    };
  });
  if (
    itemChecks.length !== 25 ||
    new Set(itemChecks.map((row) => row.auditItemKey)).size !== 25 ||
    itemChecks.some((row) => row.disposition === "pending" || row.allergenVerdict === "pending")
  ) throw new Error("Incomplete B Side frozen reconciliation.");
  return {
    restaurantId: bSideRestaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
    },
  };
}

function sourceEvidenceId(sourceUrl) {
  const ids = new Map([
    ["https://dfef6bc4-dc09-4504-9828-e216a68da2c8.filesusr.com/ugd/6ace1f_cd888eef59024d1aa7dc49da0d5df425.pdf", "official-dinner-menu-current"],
    ["https://www.bsidecuts.com/_files/ugd/5d717b_e5db96761a614d97a634404bb38a7f4d.pdf", "official-brunch-menu-current"],
    ["https://www.bsidecuts.com/_files/ugd/5d717b_daff303633f44d759b504a068297ff4f.pdf", "official-kids-menu-current"],
    ["https://www.bsidecuts.com/_files/ugd/5d717b_276bb7bc0e444aa89002445444fcf069.pdf", "official-happy-hour-current"],
    ["https://order.online/store/red-apron-b-side-mosaic-fairfax-210444", "linked-order-menu-current"],
  ]);
  const id = ids.get(sourceUrl);
  if (!id) throw new Error(`Missing B Side evidence ID for ${sourceUrl}.`);
  return id;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = JSON.parse(await readFile(
    `data/restaurant-verification/repairs/${bSideRestaurantId}/corrected-menu.json`,
    "utf8",
  ));
  const baselinePath = `data/restaurant-verification/item-checks/${bSideRestaurantId}.jsonl`;
  const checks = (await readFile(baselinePath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  const result = reconcileBSide(checks, snapshot);
  await writeFile(baselinePath, `${result.itemChecks.map(JSON.stringify).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
