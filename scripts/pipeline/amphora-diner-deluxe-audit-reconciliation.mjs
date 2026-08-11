import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdAmphora } from "./amphora-diner-deluxe-audit-catalog.mjs";

export const restaurantIdAmphoraHerndon = "amphoras-diner-deluxe-herndon-va-dc-metro";

const artifactRows = new Map(Object.entries({
  "ADDITIONAL TOPPINGS": "A PDF modifier heading was emitted as a food item. The live ordering catalog represents toppings inside item option groups, not as this formulation.",
  "Amphora Classics": "A Grand Plates section heading was emitted as a food item and inherited unrelated raw-advisory allergens.",
  "Amphora’s Diner Deluxe": "A restaurant identity/promotional HTML card was emitted as a menu item.",
  "Bagel with Cream Cheese": "A breakfast substitution line was emitted as a standalone item; the current menu and configurator keep it as an option.",
  "Beef Tenderloin Medallions Sautéed with Mushrooms": "The first line of Steak Dianne's description was emitted as a separate item while Steak Dianne also remained in the baseline.",
  "Cheese Vegetables Meats etc": "A Create Your Own Omelet column label was emitted as a food item and inherited unrelated advisory allergens.",
  "Coleslaw & Pickle": "A shared sandwich accompaniment rule was emitted as a standalone item.",
  "Cream Sauce": "A description fragment was emitted as a standalone item instead of remaining attached to its source formulation.",
  "Eggs & Omelets": "A breakfast section heading and shared service note were emitted as a food item.",
  "Fresh Catch": "A seafood section heading and shared side-choice note were emitted as a food item.",
  "GROUND LAMB KEBABS": "A photographic caption for the already-listed Grilled Lamb Kebabs formulation was emitted as a second food item.",
  "Heavenly Hollandaise": "A breakfast section heading and shared English-muffin service note were emitted as a food item.",
  "Honey Drizzle": "The tail of Baklava Pancakes' description was emitted as a separate food item.",
  "Sandwiches & Favorites": "A breakfast section heading and shared side note were emitted as a food item and inherited unrelated advisory allergens.",
  "SPECIALTY PASTA": "A pasta section heading was emitted as a food item.",
  "Substitute Cholesterol Free Egg Beaters or Egg Whites": "A substitution instruction was emitted as a food item and inherited unrelated toast/advisory allergens.",
}).map(([name, reason]) => [normalize(name), reason]));

const variantAliases = new Map(Object.entries({
  "Amphora’s Pick": "Amphora’s Pick 2",
  "Amphora’s Beef Chili": "Amphora’s Beef Chili (Cup)",
  "Assorted Hot Tea": "Assorted Hot Teas",
  "Flaky Biscuits with Sausage Gravy*": "Country Style Biscuits with Sausage Gravy",
  "Lavazza Coffee (Regular & Decaf)": "Lavazza Coffee",
  "Mediterranean Vegetable Hash and Eggs": "Vegetable Hash and Eggs",
  "New York Sirloin Steak": "Broiled New York Sirloin Steak 10 oz",
  "Pan Seared Salmon Filet": "Pan Seared Salmon Filet with an Artichoke Cream Sauce",
  "Roast Turkey Dinner": "Roast Turkey",
  "Truffle Cake Balls Nut Collectio": "Truffle Cake Balls ~ Nut Collection",
}).map(([baselineName, currentName]) => [normalize(baselineName), currentName]));

export function reconcileAmphoraBaselineItems(
  checks,
  snapshot,
  { restaurantId = restaurantIdAmphora } = {},
) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    const artifactReason = artifactRows.get(normalize(check.baseline.name));
    if (artifactReason) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: check.baseline.sourceType === "html-card"
          ? ["official-current-page"]
          : ["official-current-menu-pdf", "fast-order-current-menu"],
        notes: artifactReason,
      };
    }

    const alias = variantAliases.get(normalize(check.baseline.name));
    const current = currentByName.get(normalize(alias ?? check.baseline.name));
    if (!current) throw new Error(`Unadjudicated Amphora frozen row: ${check.baseline.name}`);
    matchedCurrentNames.add(current.name);
    const baselineAllergens = ordered(check.baseline.allergens);
    const currentAllergens = ordered(current.allergens);
    const baselineMayContain = ordered(check.baseline.mayContain);
    const currentMayContain = ordered(current.mayContain);
    const allergenMatch = check.baseline.allergenSourceType === current.allergenSourceType &&
      arraysEqual(baselineAllergens, currentAllergens) &&
      arraysEqual(baselineMayContain, currentMayContain);
    const disposition = alias
      ? "variant_match"
      : check.baseline.name === current.name
        ? "exact_match"
        : "normalized_match";
    const sourceEvidenceIds = ["official-current-page"];
    if (current.sourceUrls.some((url) => /DINER-DX-MENU-2025\.pdf/i.test(url))) {
      sourceEvidenceIds.push("official-current-menu-pdf");
    }
    if (current.sourceUrls.some((url) => /fastordernow\.com/i.test(url))) {
      sourceEvidenceIds.push("fast-order-current-menu");
    }
    return {
      ...check,
      disposition,
      allergenVerdict: allergenMatch
        ? current.allergenSourceType === "unavailable"
          ? "accurately_unavailable"
          : "verified"
        : "mismatch",
      sourceEvidenceIds,
      notes: [
        `Current formulation: ${current.name} in ${current.category}.`,
        `The frozen row recorded ${check.baseline.allergenSourceType} with contains [${baselineAllergens.join(", ") || "none"}] and may-contain [${baselineMayContain.join(", ") || "none"}].`,
        `The reviewed current record uses ${current.allergenSourceType} with directly supported contains [${currentAllergens.join(", ") || "none"}] and may-contain [${currentMayContain.join(", ") || "none"}].`,
        current.allergenSourceType === "official-ingredients"
          ? "These are positive terms from the restaurant-issued menu, not a complete allergen matrix or a negative safety claim."
          : "No item-level official allergen or cross-contact claim was found; menu clues remain separately labeled Ingredient Intelligence.",
      ].join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentNames.has(item.name));
  return {
    restaurantId,
    itemChecks,
    omittedCurrentItems: omittedCurrentItems.map((item) => item.name),
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      matchedBaselineRows: itemChecks.filter((item) => item.disposition !== "artifact").length,
      matchedCurrentFormulations: matchedCurrentNames.size,
      omittedCurrentFormulations: omittedCurrentItems.length,
      artifactRows: itemChecks.filter((item) => item.disposition === "artifact").length,
      sourceOrAllergenMismatches: itemChecks.filter((item) => item.allergenVerdict === "mismatch").length,
    },
  };
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function ordered(values) {
  return [...new Set(values ?? [])].sort();
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const requestedId = process.argv
    .find((argument) => argument.startsWith("--id="))
    ?.slice("--id=".length) ?? restaurantIdAmphora;
  if (![restaurantIdAmphora, restaurantIdAmphoraHerndon].includes(requestedId)) {
    throw new Error(`Unsupported Amphora restaurant id: ${requestedId}`);
  }
  const baselinePath = path.resolve(
    `data/restaurant-verification/item-checks/${requestedId}.jsonl`,
  );
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmphora}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAmphoraBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
    { restaurantId: requestedId },
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify({ ...result.counts, omittedCurrentItems: result.omittedCurrentItems }, null, 2));
}
