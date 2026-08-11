import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAsiaNine = "osm-asia-nine-1236156059";

const artifactNames = new Set([
  "Custom style",
  "Customize font",
  "Manage your customer reviews",
  "Respond to reviews",
  "Sell more with social proof",
  "Unlimited reviews",
]);

export function reconcileAsiaNineBaselineItems(baselineChecks, snapshot) {
  if (baselineChecks.length !== 132) {
    throw new Error(`Expected 132 frozen Asia Nine checks, got ${baselineChecks.length}.`);
  }
  if (snapshot.restaurantId !== restaurantIdAsiaNine || snapshot.itemCount !== 161) {
    throw new Error("Asia Nine corrected snapshot identity or count changed.");
  }

  const currentByNormalizedName = new Map(snapshot.items.map((item) => [normalizeName(item.name), item]));
  const matchedCurrentIds = new Set();
  const itemChecks = baselineChecks.map((check) => {
    const baselineName = check.baseline?.name;
    const current = currentByNormalizedName.get(normalizeName(baselineName));
    if (!current) {
      if (!artifactNames.has(baselineName)) {
        throw new Error(`Unreviewed frozen Asia Nine row is absent from the current catalog: ${baselineName}.`);
      }
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-home", "official-thai-menu", "official-sushi-menu"],
        notes: `${baselineName} is review-widget promotional/configuration text extracted from the Wix page, not a restaurant menu product or allergen row.`,
      };
    }

    matchedCurrentIds.add(current.id);
    const disposition = baselineName === current.name ? "exact_match" : "normalized_match";
    const sameAllergens = sameSet(check.baseline?.allergens ?? [], current.allergens ?? []);
    const sameMayContain = sameSet(check.baseline?.mayContain ?? [], current.mayContain ?? []);
    const sameSourceSemantics = check.baseline?.allergenSourceType === current.allergenSourceType;
    const allergenVerdict = sameAllergens && sameMayContain && sameSourceSemantics
      ? current.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
      : "mismatch";
    const evidenceId = current.sourceMenuName === "Sushi" ? "official-sushi-menu" : "official-thai-menu";
    const notes = allergenVerdict === "mismatch"
      ? `The frozen claim was ${formatClaim(check.baseline)}. The current owner-issued menu supports ${formatClaim(current)}. Common wrapper, noodle, batter, mayonnaise, surimi, and miso formulation risks remain separately labeled Ingredient Intelligence rather than official fixed ingredients.`
      : current.allergenSourceType === "unavailable"
        ? "The current owner-issued menu confirms this product but publishes no supported fixed allergen or cross-contact disclosure; unavailable is accurate and is not an allergen-free claim."
        : "The current owner-issued product name or description directly supports the frozen positive allergen claim; the menu is not a complete matrix or negative assurance.";
    return {
      ...check,
      disposition,
      allergenVerdict,
      sourceEvidenceIds: [evidenceId],
      notes,
    };
  });

  const missingCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  if (missingCurrentItems.length !== 35) {
    throw new Error(`Expected 35 omitted current Asia Nine products, got ${missingCurrentItems.length}.`);
  }
  return {
    restaurantId: restaurantIdAsiaNine,
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
        frozenWidgetArtifact: itemChecks.filter((item) => item.disposition === "artifact").length,
        frozenAllergenOrSourceSemanticMismatch: itemChecks.filter((item) => item.allergenVerdict === "mismatch").length,
      },
    },
  };
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\*+/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bpcs?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sameSet(left, right) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function formatClaim(item) {
  const allergens = item.allergens?.length ? item.allergens.join(", ") : "no fixed allergens";
  const mayContain = item.mayContain?.length ? `; may contain ${item.mayContain.join(", ")}` : "";
  return `${item.allergenSourceType}: ${allergens}${mayContain}`;
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
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantIdAsiaNine}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAsiaNine}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAsiaNineBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((item) => JSON.stringify(item)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
