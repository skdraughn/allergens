import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdArties = "artie-s-fairfax-va-dc-metro";

const evidenceIds = [
  "official-site",
  "official-lunch-menu",
  "official-dinner-menu",
  "official-gluten-sensitive-lunch-menu",
  "official-gluten-sensitive-dinner-menu",
];

const mappings = new Map([
  [1, ["bacon-cheeseburger", "exact_match"]],
  [2, ["bbq-baby-back-ribs", "exact_match"]],
  [3, ["blackened-chicken-caesar-salad", "exact_match"]],
  [4, ["blue-crab-shrimp-fritters", "exact_match"]],
  [5, ["brunch-burger", "exact_match"]],
  [6, ["buttermilk-fried-chicken-sandwich", "exact_match"]],
  [7, ["cheddar-cheeseburger", "exact_match"]],
  [8, ["chopped-salad", "exact_match"]],
  [10, ["crab-corn-chowder", "exact_match"]],
  [11, ["crab-cake-filet-mignon", "exact_match"]],
  [12, ["crispy-brussels-sprouts-with-bacon-spiced-pecans", "exact_match"]],
  [13, ["crispy-chicken-tenders", "exact_match"]],
  [14, ["crispy-fried-point-judith-calamari", "exact_match"]],
  [16, ["deep-dish-apple-pecan-pie", "exact_match"]],
  [17, ["drunken-rib-eye", "exact_match"]],
  [18, ["wood-grilled-filet-mignon", "normalized_match"]],
  [19, ["firecracker-shrimp", "exact_match"]],
  [20, ["great-american-shoestring-fries", "normalized_match"]],
  [21, ["grilled-broccolini", "exact_match"]],
  [22, ["grilled-chicken-havarti-cheese", "exact_match"]],
  [23, ["grilled-tuna-field-greens", "normalized_match"]],
  [24, ["hickory-bbq-burger", "exact_match"]],
  [25, ["hickory-grilled-chicken-breast", "exact_match"]],
  [26, ["hot-fudge-sundae", "exact_match"]],
  [28, ["hot-spinach-artichoke-dip", "normalized_match"]],
  [29, ["iceberg-wedge", "exact_match"]],
  [30, ["jambalaya-pasta", "exact_match"]],
  [31, ["jumbo-asparagus", "exact_match"]],
  [32, ["jumbo-lump-crab-cake", "normalized_match"]],
  [33, ["cheeseburger", "normalized_match"]],
  [34, ["chicken-fingers", "normalized_match"]],
  [35, ["pasta-red-sauce", "normalized_match"]],
  [37, ["loaded-baked-potato", "exact_match"]],
  [38, ["lobster-bisque", "exact_match"]],
  [39, ["louisiana-pasta", "exact_match"]],
  [40, ["mango-chicken-spiced-pecans", "exact_match"]],
  [41, ["mashed-potatoes", "exact_match"]],
  [43, ["pecan-crusted-trout", "exact_match"]],
  [44, ["penne-primavera", "exact_match"]],
  [46, ["roasted-chicken", "normalized_match"]],
  [47, ["sauteed-jumbo-lump-crab-cakes", "exact_match"]],
  [48, ["sauteed-spinach", "exact_match"]],
  [49, ["short-smoked-salmon-salad", "normalized_match"]],
  [50, ["short-smoked-salmon-filet", "exact_match"]],
  [51, ["sweet-potato-fries", "exact_match"]],
  [52, ["tex-mex-egg-rolls", "normalized_match"]],
  [53, ["traditional-caesar", "exact_match"]],
  [54, ["billy-s-homemade-ice-cream", "variant_match"]],
  [55, ["waldorf-steak-salad", "exact_match"]],
  [56, ["warm-flourless-chocolate-waffle", "exact_match"]],
  [57, ["warm-goat-cheese-spiced-pecan-salad", "exact_match"]],
  [58, ["warm-white-chocolate-bread-pudding", "exact_match"]],
]);

const artifacts = new Map([
  [15, "Description fragment duplicated from Firecracker Shrimp; not a separately named product on either current owner menu."],
  [27, "Description fragment duplicated from Blackened Chicken Caesar Salad; not a separately named product on either current owner menu."],
  [36, "Description fragment duplicated from Buttermilk Fried Chicken Sandwich; not a separately named product on either current owner menu."],
  [45, "Description fragment duplicated from Sauteed Jumbo Lump Crab Cakes; not a separately named product on either current owner menu."],
]);

const staleExtras = new Map([
  [0, "Old ordering-vendor row is absent from all current owner menus; the current bread product is the configurable Community Bread Basket."],
  [9, "Cole slaw appears only as an accompaniment in current descriptions and is not published as a standalone side."],
  [42, "The former standalone Ozzie Rolls row is absent; Ozzie rolls are now one choice inside the Community Bread Basket."],
]);

export function reconcileArtiesBaselineItems(baselineChecks, snapshot) {
  if (baselineChecks.length !== 59) {
    throw new Error(`Expected 59 frozen Artie's checks, got ${baselineChecks.length}.`);
  }
  if (snapshot.restaurantId !== restaurantIdArties || snapshot.itemCount !== 60) {
    throw new Error("Artie's corrected snapshot identity or count changed.");
  }

  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const matchedCurrentIds = new Set();
  const itemChecks = baselineChecks.map((check, index) => {
    if (artifacts.has(index)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: artifacts.get(index),
      };
    }
    if (staleExtras.has(index)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: staleExtras.get(index),
      };
    }

    const mapping = mappings.get(index);
    if (!mapping) throw new Error(`No Artie's reconciliation mapping for frozen index ${index}.`);
    const [targetId, disposition] = mapping;
    const current = currentById.get(targetId);
    if (!current) throw new Error(`Missing current Artie's target ${targetId} for frozen index ${index}.`);
    if (matchedCurrentIds.has(targetId)) throw new Error(`Current Artie's product ${targetId} was mapped twice.`);
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
      sourceEvidenceIds: evidenceIds,
      notes: [
        `Current product: ${current.name}.`,
        menuDifferences.length > 0 ? `Menu correction: ${menuDifferences.join("; ")}.` : null,
        `Frozen fixed allergens: ${formatAllergens(baselineAllergens)}; current source-supported fixed allergens: ${formatAllergens(currentAllergens)}.`,
        `Frozen cross-contact: ${formatAllergens(baselineMayContain)}; current product-scoped gluten-sensitive cross-contact: ${formatAllergens(currentMayContain)}.`,
        `Current source type: ${current.allergenSourceType}.`,
      ].filter(Boolean).join(" "),
    };
  });

  const missingCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  if (matchedCurrentIds.size !== 52 || missingCurrentItems.length !== 8) {
    throw new Error(`Artie's reconciliation boundary changed: ${matchedCurrentIds.size} matched, ${missingCurrentItems.length} restored.`);
  }
  return {
    restaurantId: restaurantIdArties,
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
        artifact: artifacts.size,
        staleExtra: staleExtras.size,
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
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantIdArties}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdArties}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileArtiesBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((item) => JSON.stringify(item)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
