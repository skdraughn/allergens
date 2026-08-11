import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { awakeningRestaurantId } from "./awakening-audit-catalog.mjs";

const artifactKeys = new Set([
  "28:we-are-hiring",
  "36:a-place-where-flavors-come-together-in-the-best-style",
  "37:book-your-next-party-with-us",
  "38:rich-bread-pudding-with-bourbon-glaze-whole-9in-pan",
  "48:start-your-next-adventure-with-us",
]);

export function reconcileAwakeningBaselineItems(baselineChecks, snapshot) {
  const currentByName = new Map();
  for (const item of snapshot.items ?? []) {
    const key = normalize(item.name);
    currentByName.set(key, [...(currentByName.get(key) ?? []), item]);
  }

  const itemChecks = baselineChecks.map((check) => {
    if (artifactKeys.has(check.auditItemKey)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-home-current", "official-food-menu-current"],
        notes: check.auditItemKey.startsWith("38:")
          ? "This frozen row is the description nested under Bourbon Bread Pudding, not a standalone menu product."
          : "This frozen row is homepage promotional, party, or employment content, not a menu product.",
      };
    }

    const candidates = currentByName.get(normalize(check.baseline.name)) ?? [];
    if (candidates.length === 0) {
      throw new Error(`Missing current Awakening target for ${check.auditItemKey}.`);
    }
    const isMixedChicken = check.auditItemKey === "15:chicken-and-waffles";
    const target = candidates.find((candidate) =>
      String(candidate.variantGroup ?? "").startsWith(String(check.baseline.variantGroup ?? ""))
    ) ?? candidates[0];
    const allergenVerdict = isMixedChicken ||
        !sameSet(check.baseline.allergens, target.allergens) ||
        check.baseline.allergenSourceType !== target.allergenSourceType
      ? "mismatch"
      : "verified";
    return {
      ...check,
      disposition: isMixedChicken ? "variant_match" : "exact_match",
      allergenVerdict,
      sourceEvidenceIds: ["official-food-menu-current"],
      notes: isMixedChicken
        ? "The frozen row combines the Brunch category with the Lunch & Dinner variant group. The current source publishes two distinct Chicken & Waffles presentations with different descriptions and direct positive evidence."
        : `Current target: ${target.name} (${target.variantGroup}). The restaurant-issued narrative menu supports only explicit positive ingredients and unavoidable named identities; formulation assumptions remain separate Ingredient Intelligence.`,
    };
  });

  if (itemChecks.length !== 48 || artifactKeys.size !== 5) {
    throw new Error(`Expected 48 frozen Awakening rows; found ${itemChecks.length}.`);
  }
  return {
    restaurantId: awakeningRestaurantId,
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

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sameSet(left = [], right = []) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(
    `data/restaurant-verification/item-checks/${awakeningRestaurantId}.jsonl`,
  );
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${awakeningRestaurantId}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const result = reconcileAwakeningBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
