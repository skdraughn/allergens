import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ayseRestaurantId } from "./ayse-audit-catalog.mjs";

const artifacts = new Set([
  "18:caesar-salad-hummus-bowl",
  "22:cheese-pizza-pepperoni-pizza",
  "79:salad-add-ons-chicken-dollar7-gulf-shrimp-dollar11-faroe-islands-salmon-dollar16-white-anchovies",
]);
const staleExtras = new Set([
  "28:crabcake-fritters", "41:ice-cream-sundae", "58:linguini-pomodoro",
  "59:macaroni-and-cheese", "66:muhammara", "68:new-york-strip-steak", "104:warm-pita",
]);
const normalized = new Map([
  ["93:soup-of-the-day", "cream-of-tomato-soup"],
  ["98:strawberry-rhubarb-sundae", "strawberry-sundae"],
]);
const targets = new Map([
  ["53:lfc", "l-f-c"],
  ["72:pei-mussels", "p-e-i-mussels"], ["94:spaghetti-and-meatballs", "spaghetti-meatballs"],
]);

export function reconcileAyse(baselineChecks, snapshot) {
  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const itemChecks = baselineChecks.map((check) => {
    if (artifacts.has(check.auditItemKey) || staleExtras.has(check.auditItemKey)) {
      const artifact = artifacts.has(check.auditItemKey);
      return {
        ...check, disposition: artifact ? "artifact" : "stale_extra", allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["current-owner-service-menus", "current-linked-toast-catalog"],
        notes: artifact
          ? "This frozen row combines modifier choices or headings and is not an orderable current product."
          : "This row is a duplicate frozen presentation or a dated special absent from the current owner-linked catalog.",
      };
    }
    const targetId = normalized.get(check.auditItemKey) ?? targets.get(check.auditItemKey) ?? check.baseline.itemId;
    const target = currentById.get(targetId);
    if (!target) throw new Error(`Missing current AYŞE target ${targetId} for ${check.auditItemKey}.`);
    const baselineAllergens = [...(check.baseline.allergens ?? [])].sort();
    const currentAllergens = [...target.allergens].sort();
    const sameAllergens = JSON.stringify(baselineAllergens) === JSON.stringify(currentAllergens);
    const sameAuthority = check.baseline.allergenSourceType === target.allergenSourceType;
    return {
      ...check,
      disposition: normalized.has(check.auditItemKey) ? "normalized_match" : "exact_match",
      allergenVerdict: sameAllergens && sameAuthority
        ? target.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: ["current-owner-service-menus", "current-linked-toast-catalog"],
      notes: `Current target: ${target.name} (${target.category}); ${target.allergenSourceType}; direct allergens: ${target.allergens.join(", ") || "none"}. Missing terms are not negative evidence.`,
    };
  });
  const counts = { dispositions: countBy(itemChecks, "disposition"), allergens: countBy(itemChecks, "allergenVerdict") };
  if (
    itemChecks.length !== 106 || new Set(itemChecks.map((row) => row.auditItemKey)).size !== 106 ||
    counts.dispositions.exact_match !== 94 || counts.dispositions.normalized_match !== 2 ||
    counts.dispositions.artifact !== 3 || counts.dispositions.stale_extra !== 7 ||
    itemChecks.some((row) => row.disposition === "pending" || row.allergenVerdict === "pending")
  ) throw new Error(`Incomplete AYŞE reconciliation: ${JSON.stringify(counts)}`);
  return { restaurantId: ayseRestaurantId, itemChecks, counts };
}

function countBy(rows, key) { const counts = {}; for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1; return counts; }
async function readJsonLines(filePath) { return (await readFile(filePath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse); }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = `data/restaurant-verification/item-checks/${ayseRestaurantId}.jsonl`;
  const snapshot = JSON.parse(await readFile(`data/restaurant-verification/repairs/${ayseRestaurantId}/corrected-menu.json`, "utf8"));
  const result = reconcileAyse(await readJsonLines(baselinePath), snapshot);
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({ restaurantId: ayseRestaurantId, ...result.counts }, null, 2));
}
