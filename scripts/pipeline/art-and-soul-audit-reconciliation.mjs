import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "art-and-soul-dc";
const evidenceIds = [
  "official-art-and-soul-all-day",
  "official-art-and-soul-brunch",
  "official-art-and-soul-breakfast",
  "official-art-and-soul-menu-index",
  "official-art-and-soul-allergen-search",
];
const artifactNames = new Set(["hot items", "baked items", "cold items"]);
const explicitMappings = new Map([
  ["adult", { ids: ["breakfast-buffet"], disposition: "normalized_match" }],
  ["classic caesar salad", { ids: ["caesar-salad"], disposition: "normalized_match" }],
  ["chopped wedge salad", { ids: ["wedge-salad"], disposition: "normalized_match" }],
  ["wedge salad", { ids: ["wedge-salad"], disposition: "variant_match" }],
  ["angus burger", {
    ids: ["angus-burger-all-day", "angus-burger-brunch"],
    disposition: "variant_match",
  }],
  ["fried chicken sandwich", {
    ids: ["fried-chicken-sandwich-all-day", "fried-chicken-sandwich-brunch"],
    disposition: "variant_match",
  }],
]);

export function reconcileArtAndSoulBaselineItems(checks, snapshot) {
  if (snapshot.restaurantId !== restaurantId || snapshot.itemCount !== 54) {
    throw new Error("Art and Soul snapshot does not satisfy the 54-product contract.");
  }

  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const currentByName = new Map();
  for (const item of snapshot.items) {
    const key = normalizeName(item.name);
    const group = currentByName.get(key) ?? [];
    group.push(item);
    currentByName.set(key, group);
  }
  const matchedCurrentIds = new Set();
  const itemChecks = checks.map((check) => {
    const baselineName = normalizeName(check.baseline?.name);
    if (artifactNames.has(baselineName)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes:
          "This frozen row is a subsection heading inside the configurable Breakfast Buffet, not a standalone product. Its components are preserved in the corrected Breakfast Buffet description.",
      };
    }

    const explicit = explicitMappings.get(baselineName);
    const currentItems = explicit
      ? explicit.ids.map((id) => currentById.get(id)).filter(Boolean)
      : currentByName.get(baselineName) ?? [];
    if (currentItems.length === 0) {
      throw new Error(`No current Art and Soul match for frozen row ${check.auditItemKey}.`);
    }
    for (const current of currentItems) matchedCurrentIds.add(current.id);

    const currentAllergens = uniqueSorted(currentItems.flatMap((item) => item.allergens ?? []));
    const currentSourceTypes = uniqueSorted(
      currentItems.map((item) => item.allergenSourceType),
    );
    const baselineAllergens = uniqueSorted(check.baseline?.allergens ?? []);
    const allergenMismatch =
      JSON.stringify(currentAllergens) !== JSON.stringify(baselineAllergens) ||
      currentSourceTypes.length !== 1 ||
      currentSourceTypes[0] !== check.baseline?.allergenSourceType;
    const disposition = explicit?.disposition ?? "exact_match";
    const mappingSummary = currentItems.map((item) => `${item.name} [${item.variantGroup}]`).join("; ");

    return {
      ...check,
      disposition,
      allergenVerdict: allergenMismatch ? "mismatch" : "verified",
      sourceEvidenceIds: evidenceIds,
      notes:
        disposition === "variant_match"
          ? `The frozen row collapsed or duplicated service-specific presentations. It maps to ${mappingSummary}. Current fixed allergens are ${formatAllergens(currentAllergens)}; the frozen fixed allergens were ${formatAllergens(baselineAllergens)}.`
          : disposition === "normalized_match"
            ? `The frozen label or presentation was normalized to ${mappingSummary}. Current fixed allergens are ${formatAllergens(currentAllergens)}; the frozen fixed allergens were ${formatAllergens(baselineAllergens)}.`
            : `Exact current product match: ${mappingSummary}. Current fixed allergens are ${formatAllergens(currentAllergens)}; the frozen fixed allergens were ${formatAllergens(baselineAllergens)}.`,
    };
  });

  const missingCurrentItems = snapshot.items.filter(
    (item) => !matchedCurrentIds.has(item.id),
  );
  const counts = {
    dispositions: countBy(itemChecks, (row) => row.disposition),
    allergens: countBy(itemChecks, (row) => row.allergenVerdict),
    current: {
      itemCount: snapshot.itemCount,
      matchedItemCount: matchedCurrentIds.size,
      missingItemCount: missingCurrentItems.length,
      missingItemIds: missingCurrentItems.map((item) => item.id),
    },
    mismatchKinds: {
      allergen_or_provenance_mismatch: itemChecks.filter(
        (row) => row.allergenVerdict === "mismatch",
      ).length,
      buffet_heading_artifact: itemChecks.filter(
        (row) => row.disposition === "artifact",
      ).length,
      service_variant_collapse: itemChecks.filter(
        (row) => row.disposition === "variant_match",
      ).length,
    },
  };

  return { restaurantId, itemChecks, missingCurrentItems, counts };
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
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
  return allergens.length > 0 ? allergens.join(", ") : "none published";
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
  const result = reconcileArtAndSoulBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
