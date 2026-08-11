import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdAmparo } from "./amparo-fondita-audit-catalog.mjs";

const staleRows = new Map([
  [normalize("Aguachile de Naranja"), "The old linked PDF's shrimp aguachile is absent from both the current on-page tasting menu and the current 91-presentation linked Toast catalog; Aguachile de Oyster is a different formulation."],
  [normalize("Palmiitos con Chayote"), "The old linked PDF's heart-of-palm course is absent from both the current on-page tasting menu and the current linked Toast catalog."],
  [normalize("Halibut en Mole Coloradito"), "The old linked PDF's halibut course is absent. The current sources instead publish Arrachera en Mole Coloradito and Camarones en Mole Coloradito as different proteins and formulations."],
]);

export function reconcileAmparoBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    const staleNote = staleRows.get(normalize(check.baseline.name));
    if (staleNote) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-tasting-pdf", "official-tasting-image", "toast-browser-review", "toast-current-menu-mirror"],
        notes: `${staleNote} The PDF is retained only as source-history evidence because its current download link contradicts the current on-page menu.`,
      };
    }
    const current = currentByName.get(normalize(check.baseline.name));
    if (!current) throw new Error(`Unadjudicated Amparo frozen row: ${check.baseline.name}`);
    matchedCurrentNames.add(current.name);
    return {
      ...check,
      disposition: "exact_match",
      allergenVerdict: "mismatch",
      sourceEvidenceIds: current.sourceUrls.includes("https://order.toasttab.com/online/amparo-fondita-2002-p-street-northwest")
        ? ["official-tasting-menu", "official-tasting-image", "toast-browser-review", "toast-current-menu-mirror"]
        : ["official-tasting-menu", "official-tasting-image"],
      notes: `Current formulation: ${current.name} (restaurant-issued positive signals: ${current.allergens.join(", ") || "none"}; no published item-level may-contain signal). The frozen allergen set happens to match, but its source type 'official-allergen-menu' is false: both the old and current documents are dish-description menus, not allergen matrices. The repaired row uses 'official-ingredients' only for the positive ingredient/formulation signals visible on the current on-page tasting image.`,
    };
  });
  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentNames.has(item.name));
  return {
    restaurantId: restaurantIdAmparo,
    itemChecks,
    omittedCurrentItems: omittedCurrentItems.map((item) => item.name),
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      matchedCurrentFormulations: matchedCurrentNames.size,
      omittedCurrentFormulations: omittedCurrentItems.length,
      staleFrozenRows: itemChecks.filter((item) => item.disposition === "stale_extra").length,
      sourceSemanticsMismatches: itemChecks.filter((item) => item.allergenVerdict === "mismatch").length,
    },
  };
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(
    `data/restaurant-verification/item-checks/${restaurantIdAmparo}.jsonl`,
  );
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmparo}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAmparoBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify({ ...result.counts, omittedCurrentItems: result.omittedCurrentItems }, null, 2));
}
