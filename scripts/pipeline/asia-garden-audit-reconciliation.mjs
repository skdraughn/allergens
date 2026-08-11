import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractAsiaGardenMenuPayload } from "./asia-garden-audit-catalog.mjs";

export const restaurantIdAsiaGarden = "osm-asia-garden-11366360044";

const evidenceIds = [
  "official-home",
  "official-lunch-ordering-menu",
  "official-all-day-ordering-menu",
];

const expectedUnderlyingCounts = [2, 4, 3, 1, 4, 4, 0, 0, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 1, 3];

export function reconcileAsiaGardenBaselineItems(baselineChecks, snapshot, menuPayload) {
  if (baselineChecks.length !== 22) {
    throw new Error(`Expected 22 frozen Asia Garden checks, got ${baselineChecks.length}.`);
  }
  if (snapshot.restaurantId !== restaurantIdAsiaGarden || snapshot.itemCount !== 242) {
    throw new Error("Asia Garden corrected snapshot identity or count changed.");
  }
  const currentBySourceId = new Map(snapshot.items.map((item) => [String(item.sourceMenuItemId), item]));
  const sourceRows = menuPayload.rawMenus.menuCategories.flatMap((menu) =>
    menu.menuGroups.flatMap((group) =>
      group.menuItems.map((item) => ({ menu, group, item }))
    )
  );

  const itemChecks = baselineChecks.map((check, index) => {
    const baselineName = normalizeDescription(check.baseline?.name);
    const underlying = sourceRows.filter(({ item }) =>
      normalizeDescription(item.menuItemDesc) === baselineName ||
      normalizeDescription(menuPayload.aiDescriptions?.[item.menuItemId]) === baselineName
    );
    if (underlying.length !== expectedUnderlyingCounts[index]) {
      throw new Error(`Asia Garden fragment mapping changed for frozen index ${index}: expected ${expectedUnderlyingCounts[index]}, got ${underlying.length}.`);
    }
    const products = underlying.map(({ item }) => currentBySourceId.get(String(item.menuItemId)));
    if (products.some((item) => !item)) {
      throw new Error(`Asia Garden fragment ${check.baseline?.name} points to an absent current product.`);
    }
    const badge = check.baseline?.name === "POPULAR" || check.baseline?.name === "OFTEN LIKED";
    return {
      ...check,
      disposition: "artifact",
      allergenVerdict: "not_applicable",
      sourceEvidenceIds: evidenceIds,
      notes: badge
        ? `${check.baseline.name} is an ordering-interface recommendation badge, not a menu product or allergen row.`
        : `This frozen row is raw or cached vendor-AI description text promoted into the product-name field. It describes ${products.length} real current presentation${products.length === 1 ? "" : "s"}: ${products.map((item) => `${item.name} [${item.category}]`).join("; ")}. The fragment is removed as a standalone product; any frozen fixed-allergen claim on the fragment is not applicable.`,
    };
  });

  return {
    restaurantId: restaurantIdAsiaGarden,
    itemChecks,
    missingCurrentItems: snapshot.items,
    counts: {
      dispositions: countBy(itemChecks, (item) => item.disposition),
      allergens: countBy(itemChecks, (item) => item.allergenVerdict),
      current: {
        itemCount: snapshot.itemCount,
        matchedItemCount: 0,
        missingItemCount: snapshot.itemCount,
        missingItemIds: snapshot.items.map((item) => item.id),
      },
      mismatchKinds: {
        artifact: itemChecks.length,
        frozenSpuriousOfficialIngredientArtifact: itemChecks.filter(
          (item) => item.baseline?.allergenSourceType === "official-ingredients",
        ).length,
      },
    },
  };
}

function normalizeDescription(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[.\s]+$/g, "").replace(/\s+/g, " ").trim();
}

function countBy(values, keyForValue) {
  const result = {};
  for (const value of values) {
    const key = keyForValue(value);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantIdAsiaGarden}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAsiaGarden}/corrected-menu.json`);
  const sourcePath = path.resolve(`data/restaurant-verification/artifacts/${restaurantIdAsiaGarden}/official-all-day-menu.html`);
  const [baselineText, snapshotText, sourceHtml] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
    readFile(sourcePath, "utf8"),
  ]);
  const result = reconcileAsiaGardenBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
    extractAsiaGardenMenuPayload(sourceHtml),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((item) => JSON.stringify(item)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
