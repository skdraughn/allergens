import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "ada-s-on-the-river-alexandria-va-dc-metro";
const officialEvidence = ["official-structured-menus", "official-home-and-menus", "official-menu-loader-script"];
const currentMenuEvidence = [...officialEvidence, "third-party-toast-render-proxy"];
const staleItemIds = new Set(["kids-chicken-sandwich", "kids-grilled-chicken-breast", "kids-grilled-shrimp"]);
const artifactItemIds = new Set(["house-steak-sauce"]);

const aliases = new Map([
  ["10oz-30-day-aged-hanger-steak", "10 oz, 30 Day Aged, Hanger Steak"],
  ["10oz-30-day-filet-mignon", "10 oz, 30 Day Aged, Filet Mignon"],
  ["14oz-75-day-ny-strip", "14 oz, 75 Day Aged, NY Strip"],
  ["6oz-30-day-filet-mignon", "6 oz, 30 Day Aged, Filet Mignon"],
  ["6oz-coal-roasted-s-african-lobster-tail", "6oz Coal Roasted South African Lobster Tail"],
  ["adas-mini-black-brioche-loaf", "Mini Black Brioche Loaf"],
  ["adas-seasonal-cheese-plate", "Artisan Cheese Plate"],
  ["crab-cake-sandwich", "Crab Cake"],
  ["fried-chicken-thigh-sandwich", "Fried Chicken Thigh"],
  ["grilled-kale-and-citrus-salad", "Grilled Kale & Citrus"],
  ["grilled-shrimp-and-avocado-salad", "Grilled Shrimp & Avocado"],
  ["pork-schnitzel-entree", "Pork Schnitzel"],
  ["swordfish-club-sandwich", "Smoked Swordfish \"Club\" Sandwich"],
  ["wood-grilled-fish-sandwich", "Wood-Grilled Fish"],
]);

export function reconcileAdasRiverBaselineItems(baselineChecks, snapshot) {
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (staleItemIds.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: currentMenuEvidence,
        notes: `${baseline.name} is absent from the current restaurant-issued structured menus and the current restaurant-linked pickup catalog.`,
      };
    }
    if (artifactItemIds.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: officialEvidence,
        notes: "House Steak Sauce is a current optional SAUCES modifier with Each/Trio choices, not a standalone fixed menu product.",
      };
    }

    const current = findCurrentItem(baseline, snapshot.items ?? []);
    if (!current) throw new Error(`No current Ada's match for frozen row: ${baseline.name}`);
    const baselineAllergens = sorted(baseline.allergens);
    const currentAllergens = sorted(current.allergens);
    const baselineMayContain = sorted(baseline.mayContain);
    const currentMayContain = sorted(current.mayContain);
    const sameSignals = arraysEqual(baselineAllergens, currentAllergens) && arraysEqual(baselineMayContain, currentMayContain);
    const literalMatch = baseline.name === current.name;
    const normalizedMatch = normalize(baseline.name) === normalize(current.name);
    return {
      ...check,
      disposition: literalMatch ? "exact_match" : normalizedMatch ? "normalized_match" : "variant_match",
      allergenVerdict: sameSignals ? "verified" : "mismatch",
      sourceEvidenceIds: officialEvidence,
      notes: [
        `Current match: ${current.name} (${current.category}).`,
        `Frozen contains: ${list(baselineAllergens)}; current published signals: ${list(currentAllergens)}.`,
        `Frozen may contain: ${list(baselineMayContain)}; current may contain: ${list(currentMayContain)}.`,
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
    const frozen = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const corrected = new Set([...(current?.allergens ?? []), ...(current?.mayContain ?? [])]);
    const omitted = [...corrected].some((allergen) => !frozen.has(allergen));
    const invented = [...frozen].some((allergen) => !corrected.has(allergen));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLowerCase();
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
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const result = reconcileAdasRiverBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
