import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "alero-dupont-dc";
const evidenceIdByUrl = new Map([
  ["https://alerorestaurant.com/menu-appetizers-dupont/", "official-appetizers"],
  ["https://alerorestaurant.com/menu-soup-and-salads/", "official-soups-salads"],
  ["https://alerorestaurant.com/menu-seafood/", "official-seafood"],
  ["https://alerorestaurant.com/menu-mexican-entrees/", "official-mexican-entrees"],
  ["https://alerorestaurant.com/menu-meat-poultry/", "official-meat-poultry"],
  ["https://alerorestaurant.com/menu-sides/", "official-sides"],
]);

export function reconcileAleroDupontBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const match = snapshot.items.find((item) => normalize(item.name) === normalize(check.baseline.name));
    if (!match) throw new Error(`Unclassified Alero Dupont baseline row: ${check.baseline.name}`);
    const same = signature(match) === signature(check.baseline);
    const officialEvidence = match.sourceUrls.map((url) => evidenceIdByUrl.get(url)).filter(Boolean);
    return {
      ...check,
      disposition: check.baseline.name === match.name ? "exact_match" : "normalized_match",
      allergenVerdict: same
        ? match.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: [...officialEvidence, "toast-menu"],
      notes: `Current formulation: ${match.name} (${match.category}; ${describe(match)}). Frozen: ${describe(check.baseline)}. The frozen variant group “${check.baseline.variantGroup}” was an adjacent product or section label, not a real option relationship.`,
    };
  });
  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      mismatchKinds: mismatchKinds(itemChecks, snapshot.items),
    },
  };
}

function mismatchKinds(checks, currentItems) {
  const counts = {};
  for (const check of checks.filter((candidate) => candidate.allergenVerdict === "mismatch")) {
    const match = currentItems.find((item) => normalize(item.name) === normalize(check.baseline.name));
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(match.allergens ?? []), ...(match.mayContain ?? [])]);
    const omitted = [...after].some((value) => !before.has(value));
    const invented = [...before].some((value) => !after.has(value));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}
function normalize(value) { return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function signature(item) { return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`; }
function describe(item) { return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "none"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "none"}`; }
function countBy(rows, key) { const counts = {}; for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1; return counts; }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const result = reconcileAleroDupontBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
