import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "akira-ramen-and-izakaya-rockville-md-dc-metro";

export function reconcileAkiraRamenBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const candidates = snapshot.items.filter((item) => normalize(item.name) === normalize(check.baseline.name));
    if (!candidates.length) throw new Error(`Unclassified Akira baseline row: ${check.baseline.name}`);
    const current = candidates[0];
    const same = signature(current) === signature(check.baseline);
    return {
      ...check,
      disposition: "exact_match",
      allergenVerdict: same
        ? current.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: ["mealkeyway-menu"],
      notes: `Current formulation: ${current.name} (${current.category}; ${describe(current)}). Frozen: ${describe(check.baseline)}.`,
    };
  });
  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
    },
  };
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function signature(item) {
  return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`;
}

function describe(item) {
  return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "none"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "none"}`;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const result = reconcileAkiraRamenBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
