import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-afghan-kabob-3359956639";
const evidenceIds = ["official-home", "restaurant-linked-repas-menu", "restaurant-linked-repas-identity"];
const artifactItemIds = new Set([
  "fried-eggplant-served-with-yogurt-and-afghan-tandoori-bread",
  "fried-pastry-stuffed-with-ground-beef-and-herbs",
  "our-office",
  "tossed-garden-vegetables-topped-with-dressing",
]);
const aliases = new Map([
  ["aushak-app", "AUSHAK (6 PIECES)"],
  ["bouranee-baunjaun-app", "BORANI BANJAN"],
  ["maust-o-khiar", "MAAST-O KHIAR"],
]);

export function reconcileAfghanKabobBaselineItems(baselineChecks, snapshot) {
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (artifactItemIds.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: "The frozen row is a catering block or shifted menu-description fragment extracted as a standalone product; it is not a current linked catalog item.",
      };
    }

    const current = findCurrentItem(baseline, snapshot.items ?? []);
    if (!current) throw new Error(`No current Afghan Kabob match for frozen row: ${baseline.name}`);
    const baselineAllergens = sorted(baseline.allergens);
    const currentAllergens = sorted(current.allergens);
    const baselineMayContain = sorted(baseline.mayContain);
    const currentMayContain = sorted(current.mayContain);
    const sameSignals = arraysEqual(baselineAllergens, currentAllergens) &&
      arraysEqual(baselineMayContain, currentMayContain);
    const literalMatch = baseline.name === current.name;
    const normalizedMatch = normalize(baseline.name) === normalize(current.name);
    const unavailable = current.allergenSourceType === "unavailable";
    return {
      ...check,
      disposition: literalMatch ? "exact_match" : normalizedMatch ? "normalized_match" : "variant_match",
      allergenVerdict: sameSignals ? unavailable ? "accurately_unavailable" : "verified" : "mismatch",
      sourceEvidenceIds: evidenceIds,
      notes: [
        `Current match: ${current.name} (${current.category}).`,
        `Frozen contains: ${list(baselineAllergens)}; current linked contains: ${list(currentAllergens)}.`,
        `Frozen may contain: ${list(baselineMayContain)}; current linked may contain: ${list(currentMayContain)}.`,
      ].join(" "),
    };
  });

  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      mismatchKinds: countMismatchKinds(itemChecks, snapshot.items ?? []),
    },
  };
}

function findCurrentItem(baseline, currentItems) {
  const alias = aliases.get(baseline.itemId);
  if (alias) return currentItems.find((item) => item.name === alias) ?? null;
  const baselineName = normalize(baseline.name);
  return currentItems.find((item) => normalize(item.name) === baselineName) ?? null;
}

function countMismatchKinds(itemChecks, currentItems) {
  const counts = {};
  for (const check of itemChecks) {
    if (check.allergenVerdict !== "mismatch") continue;
    const current = findCurrentItem(check.baseline, currentItems);
    const baselineCombined = new Set([
      ...(check.baseline.allergens ?? []),
      ...(check.baseline.mayContain ?? []),
    ]);
    const currentCombined = new Set([
      ...(current?.allergens ?? []),
      ...(current?.mayContain ?? []),
    ]);
    const omitted = [...currentCombined].some((allergen) => !baselineCombined.has(allergen));
    const invented = [...baselineCombined].some((allergen) => !currentCombined.has(allergen));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
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
  const result = reconcileAfghanKabobBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
