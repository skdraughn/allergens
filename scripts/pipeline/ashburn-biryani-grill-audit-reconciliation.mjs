import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAshburnBiryaniGrill = "ashburn-biryani-grill-ashburn-va-dc-metro";

const mappings = new Map([
  [0, ["boneless-chicken-biryani", "exact_match"]],
  [1, ["butter-chicken", "exact_match"]],
  [2, ["chicken-65-biryani", "exact_match"]],
  [3, ["chicken-dum-biryani", "exact_match"]],
  [4, ["chicken-korma", "exact_match"]],
  [5, ["chilli-shrimp", "exact_match"]],
  [6, ["goat-rogan-josh", "exact_match"]],
  [7, ["gongura-mutton", "exact_match"]],
  [8, ["mutton-biryani-goat", "normalized_match"]],
  [9, ["tandoori-chicken", "exact_match"]],
  [10, ["veg-biryani", "normalized_match"]],
]);

const locationEvidenceIds = [
  "official-location-page",
  "linked-cash-app-profile",
  "linked-square-locations-json",
  "linked-square-ashburn-catalog-json",
];

export function reconcileAshburnBiryaniGrillBaselineItems(baselineChecks, snapshot) {
  if (baselineChecks.length !== 11) {
    throw new Error(`Expected 11 frozen Ashburn Biryani Grill checks, got ${baselineChecks.length}.`);
  }
  if (snapshot.restaurantId !== restaurantIdAshburnBiryaniGrill || snapshot.itemCount !== 155) {
    throw new Error("Ashburn Biryani Grill corrected snapshot identity or count changed.");
  }

  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const matchedCurrentIds = new Set();
  const itemChecks = baselineChecks.map((check, index) => {
    const mapping = mappings.get(index);
    if (!mapping) throw new Error(`No Ashburn reconciliation mapping for frozen index ${index}.`);
    const [targetId, disposition] = mapping;
    const current = currentById.get(targetId);
    if (!current) throw new Error(`Missing current Ashburn target ${targetId}.`);
    if (matchedCurrentIds.has(targetId)) throw new Error(`Current Ashburn product ${targetId} was mapped twice.`);
    matchedCurrentIds.add(targetId);

    const baselineAllergens = uniqueSorted(check.baseline?.allergens ?? []);
    const currentAllergens = uniqueSorted(current.allergens ?? []);
    const baselineMayContain = uniqueSorted(check.baseline?.mayContain ?? []);
    const currentMayContain = uniqueSorted(current.mayContain ?? []);
    const allergenMismatch =
      JSON.stringify(baselineAllergens) !== JSON.stringify(currentAllergens) ||
      JSON.stringify(baselineMayContain) !== JSON.stringify(currentMayContain) ||
      check.baseline?.allergenSourceType !== current.allergenSourceType;
    const menuDifferences = [];
    if (check.baseline?.category !== current.category) {
      menuDifferences.push(`category ${JSON.stringify(check.baseline?.category)} → ${JSON.stringify(current.category)}`);
    }
    if (Boolean(check.baseline?.isConfigurable) !== current.isConfigurable) {
      menuDifferences.push(`configurable ${Boolean(check.baseline?.isConfigurable)} → ${current.isConfigurable}`);
    }

    return {
      ...check,
      disposition,
      allergenVerdict: allergenMismatch ? "mismatch" : "verified",
      sourceEvidenceIds: [
        ...locationEvidenceIds,
        ...(current.sourceUrls.includes("https://biryanigrill.com/") ? ["official-brand-menu"] : []),
      ],
      notes: [
        `Current product: ${current.name}.`,
        menuDifferences.length > 0 ? `Menu correction: ${menuDifferences.join("; ")}.` : null,
        `Frozen and current source-supported fixed allergens: ${formatAllergens(currentAllergens)}.`,
        `Frozen and current product-scoped cross-contact: ${formatAllergens(currentMayContain)}.`,
        "The location-linked catalog has empty ingredient and dietary-preference arrays, so its descriptions are not promoted to official allergen evidence.",
      ].filter(Boolean).join(" "),
    };
  });

  const missingCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  if (matchedCurrentIds.size !== 11 || missingCurrentItems.length !== 144) {
    throw new Error(`Ashburn reconciliation boundary changed: ${matchedCurrentIds.size} matched, ${missingCurrentItems.length} restored.`);
  }
  return {
    restaurantId: restaurantIdAshburnBiryaniGrill,
    itemChecks,
    missingCurrentItems,
    counts: {
      dispositions: countBy(itemChecks, (item) => item.disposition),
      allergens: countBy(itemChecks, (item) => item.allergenVerdict),
      current: {
        itemCount: snapshot.itemCount,
        matchedItemCount: matchedCurrentIds.size,
        missingItemCount: missingCurrentItems.length,
        missingItemIds: missingCurrentItems.map((item) => item.id),
      },
      mismatchKinds: {
        allergenOrProvenance: itemChecks.filter((item) => item.allergenVerdict === "mismatch").length,
      },
    },
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function countBy(values, keyForValue) {
  const result = {};
  for (const value of values) {
    const key = keyForValue(value);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function formatAllergens(allergens) {
  return allergens.length > 0 ? allergens.join(", ") : "none";
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantIdAshburnBiryaniGrill}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAshburnBiryaniGrill}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAshburnBiryaniGrillBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((item) => JSON.stringify(item)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
