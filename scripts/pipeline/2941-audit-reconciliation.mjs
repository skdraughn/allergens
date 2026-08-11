import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "2941-restaurant-falls-church-va-dc-metro";

const currentAliases = new Map([
  ["creekstone-braised-beef-cheeks", "braised-beef-cheeks"],
  ["kaviari-ossetra-caviar", "kaviari-baenki-caviar"],
]);

const evidenceByUrl = new Map([
  ["https://www.2941.com/agrave-la-carte.html", "official-a-la-carte"],
  ["https://www.2941.com/prix-fixe-menu.html", "official-prix-fixe"],
  ["https://www.2941.com/chefs-tasting-menu.html", "official-tasting"],
  ["https://www.2941.com/barmenu.html", "official-cocktails"],
]);

export function reconcile2941BaselineItems(baselineChecks, snapshot) {
  const currentById = new Map((snapshot.items ?? []).map((item) => [item.id, item]));
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    const currentId = currentAliases.get(baseline.itemId) ?? baseline.itemId;
    const current = currentById.get(currentId);
    if (!current) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-home", "official-a-la-carte"],
        notes: "The frozen seasonal item is absent from all current official 2941 menu surfaces.",
      };
    }

    const baselineAllergens = sorted(baseline.allergens);
    const currentAllergens = sorted(current.allergens);
    const baselineMayContain = sorted(baseline.mayContain);
    const currentMayContain = sorted(current.mayContain);
    const sameSignals =
      arraysEqual(baselineAllergens, currentAllergens) &&
      arraysEqual(baselineMayContain, currentMayContain);
    const evidenceIds = current.sourceUrls.map((url) => evidenceByUrl.get(url)).filter(Boolean);

    return {
      ...check,
      disposition: currentAliases.has(baseline.itemId) ? "variant_match" : "exact_match",
      allergenVerdict: sameSignals
        ? current.allergenSourceType === "unavailable"
          ? "accurately_unavailable"
          : "verified"
        : "mismatch",
      sourceEvidenceIds: evidenceIds,
      notes: [
        `Current match: ${current.name}.`,
        `Baseline contains: ${list(baselineAllergens)}; current contains: ${list(currentAllergens)}.`,
        `Baseline may contain: ${list(baselineMayContain)}; current may contain: ${list(currentMayContain)}.`,
      ].join(" "),
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

function sorted(values) {
  return [...(values ?? [])].sort();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function list(values) {
  return values.length > 0 ? values.join(", ") : "none / unavailable";
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
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const result = reconcile2941BaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
