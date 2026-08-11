import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantIdAmoos } from "./amoos-restaurant-audit-catalog.mjs";

const mislinkedSourceUrl = "https://order.online/store/chopped-nyc-ann-arbor-27977264/";

export function reconcileAmoosBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    if ((check.baseline.sourceUrls ?? []).some((url) => url.startsWith(mislinkedSourceUrl))) {
      return {
        ...check,
        disposition: "location_mismatch",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["mislinked-chopped-nyc-ann-arbor", "official-home", "orderspoon-current-menu"],
        notes: `The frozen row belongs to the Chopped NYC Ann Arbor ordering URL, not Amoo's Restaurant at 6271 Old Dominion Dr in McLean. It is absent from Amoo's complete 71-row current restaurant-matched catalog and must not contribute menu or allergen data to Amoo's.`,
      };
    }

    const current = currentByName.get(normalize(check.baseline.name));
    if (!current) throw new Error(`Unadjudicated Amoo's frozen row: ${check.baseline.name}`);
    matchedCurrentNames.add(current.name);
    const same = signature(current) === signature(check.baseline);
    return {
      ...check,
      disposition: "exact_match",
      allergenVerdict: same && current.allergenSourceType === "unavailable"
        ? "accurately_unavailable"
        : same
          ? "verified"
          : "mismatch",
      sourceEvidenceIds: ["official-home", "orderspoon-current-menu"],
      notes: `Current formulation: ${current.name} (${describe(current)}). The current restaurant-issued homepage and exact-address delivery catalog corroborate the item. The homepage is not a complete allergen matrix, so absent ingredient terms are not negative assurances.`,
    };
  });
  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentNames.has(item.name));
  return {
    restaurantId: restaurantIdAmoos,
    itemChecks,
    omittedCurrentItems: omittedCurrentItems.map((item) => item.name),
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      matchedCurrentFormulations: matchedCurrentNames.size,
      omittedCurrentFormulations: omittedCurrentItems.length,
      foreignFrozenRows: itemChecks.filter((item) => item.disposition === "location_mismatch").length,
    },
  };
}

function signature(item) {
  return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`;
}

function describe(item) {
  return `officially contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "no supported fixed allergen signal"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "no published item-level cross-contact signal"}`;
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
    `data/restaurant-verification/item-checks/${restaurantIdAmoos}.jsonl`,
  );
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmoos}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAmoosBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify({ ...result.counts, omittedCurrentItems: result.omittedCurrentItems }, null, 2));
}
