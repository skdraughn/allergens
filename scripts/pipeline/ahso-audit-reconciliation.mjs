import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const restaurantIdAhso = "replacement-ahso-restaurant-brambleton-va";

export function reconcileAhsoBaselineItems(checks, snapshot) {
  const currentByName = new Map();
  for (const item of snapshot.items) {
    const key = normalize(item.name);
    currentByName.set(key, [...(currentByName.get(key) ?? []), item]);
  }
  const itemChecks = checks.map((check) => {
    const current = currentByName.get(normalize(check.baseline.name)) ?? [];
    const currentNote = current.length
      ? ` A same-name Ahso Restaurant formulation currently exists (${current.map((item) => item.category).join("; ")}), but that does not make the sister-location row or source valid.`
      : " No exact same-name formulation appears on the current Ahso Restaurant surfaces.";
    return {
      ...check,
      disposition: "location_mismatch",
      allergenVerdict: "not_applicable",
      sourceEvidenceIds: ["sister-toast-baseline-source", "official-home", "official-dinner-menu", "official-toast-order"],
      notes: `The frozen row was extracted only from Ahso Cellars at suite #105. The audited Ahso Restaurant is a distinct business at suite #108, and Ahso Cellars explicitly describes itself as the restaurant's sister.${currentNote}`,
    };
  });
  return {
    restaurantId: restaurantIdAhso,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      currentExactNameOverlaps: itemChecks.filter((check) => currentByName.has(normalize(check.baseline.name))).length,
    },
  };
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantIdAhso}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantIdAhso}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const result = reconcileAhsoBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
