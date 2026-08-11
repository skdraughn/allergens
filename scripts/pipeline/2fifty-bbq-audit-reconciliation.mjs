import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "two-fifty-bbq-dc";

const currentAliases = new Map([
  ["chicken-leg-quarter", "chicken-leg-quarters"],
  ["poblano-sausage", "poblano-sausage-link"],
  ["spicy-cheddar-sausage", "spicy-cheddar-sausage-link"],
  ["turkey", "turkey-breast"],
]);

export function reconcile2FiftyBaselineItems(baselineChecks, snapshot) {
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
        sourceEvidenceIds: ["official-home", "linked-dc-toast-menu-browser", "third-party-toast-render-proxy"],
        notes: "The frozen item is absent from the current Washington DC Toast menu linked by 2Fifty's official site.",
      };
    }

    const baselineAllergens = sorted(baseline.allergens);
    const currentAllergens = sorted(current.allergens);
    const baselineMayContain = sorted(baseline.mayContain);
    const currentMayContain = sorted(current.mayContain);
    const sameSignals =
      arraysEqual(baselineAllergens, currentAllergens) &&
      arraysEqual(baselineMayContain, currentMayContain);
    const sourceEvidenceIds = [
      "official-home",
      "linked-dc-toast-menu-browser",
      "third-party-toast-render-proxy",
      ...(current.sourceUrls.includes("https://www.2fiftybbq.com/allergies")
        ? ["official-allergy-guide"]
        : []),
    ];

    return {
      ...check,
      disposition: currentAliases.has(baseline.itemId) ? "variant_match" : "exact_match",
      allergenVerdict: sameSignals
        ? current.allergenSourceType === "unavailable"
          ? "accurately_unavailable"
          : "verified"
        : "mismatch",
      sourceEvidenceIds,
      notes: [
        `Current match: ${current.name}.`,
        `Baseline contains: ${list(baselineAllergens)}; current contains: ${list(currentAllergens)}.`,
        `Baseline may contain: ${list(baselineMayContain)}; current may contain: ${list(currentMayContain)}.`,
        current.allergenSourceType === "unavailable"
          ? "The current sources do not provide a complete item-level allergen disclosure."
          : "The current signal is limited to the restaurant allergy guide or explicit current menu text.",
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
  return values.length > 0 ? values.join(", ") : "none";
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
  const result = reconcile2FiftyBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
