import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "a-litteri-dc";
const evidenceIds = [
  "official-home",
  "linked-foodbooking-restaurant",
  "linked-foodbooking-menu",
  "official-catering-platters",
  "official-catering-trays",
];

const artifacts = new Set(["cheese-limit-2", "condiments", "meats-limit-2"]);
const stale = new Set(["7-personal-pizza", "potato-chips", "super-lorenzo-platter", "traditional-platter"]);
const aliases = new Map([
  ["assortimente platter", ["Catering · Meat & Cheese Platters", "Assortimento"]],
  ["cheese trays any size", ["Catering · Trays & Platters", "Cheese Platter"]],
  ["cookie trays any size", ["Catering · Trays & Platters", "Cookie Platter"]],
  ["italian sausage", ["Hot Sandwiches", "SAUSAGE AND PEPPERS"]],
  ["lorenzo platter", ["Catering · Meat & Cheese Platters", "Lorenzo"]],
  ["paisano platter", ["Catering · Meat & Cheese Platters", "Paisano"]],
  ["petit platter", ["Catering · Meat & Cheese Platters", "Piccolo"]],
  ["vegetable trays", ["Catering · Trays & Platters", "Vegetable Platter"]],
]);

export function reconcileALitteriBaselineItems(baselineChecks, snapshot) {
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (artifacts.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: "This is a FoodBooking modifier-group label, not a standalone menu product. Optional modifiers must not be promoted into the restaurant catalog or merged into every configurable item.",
      };
    }
    if (stale.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: "This frozen product is absent from both the current restaurant-linked ordering menu and the official catering menus.",
      };
    }

    const current = findCurrentItem(baseline, snapshot.items ?? []);
    if (!current) throw new Error(`No current match configured for frozen A. Litteri row: ${baseline.name}`);
    const baselineAllergens = sorted(baseline.allergens);
    const currentAllergens = sorted(current.allergens);
    const baselineMayContain = sorted(baseline.mayContain);
    const currentMayContain = sorted(current.mayContain);
    const sameSignals = arraysEqual(baselineAllergens, currentAllergens) && arraysEqual(baselineMayContain, currentMayContain);
    const exact = normalize(baseline.name) === normalize(current.name);
    return {
      ...check,
      disposition: exact ? "exact_match" : "variant_match",
      allergenVerdict: sameSignals ? "verified" : "mismatch",
      sourceEvidenceIds: evidenceIds,
      notes: [
        `Current match: ${current.name} (${current.category}).`,
        `Baseline contains: ${list(baselineAllergens)}; current published signals: ${list(currentAllergens)}.`,
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

function findCurrentItem(baseline, currentItems) {
  const baselineName = normalize(baseline.name);
  const alias = aliases.get(baselineName);
  if (alias) return currentItems.find((item) => item.category === alias[0] && item.name === alias[1]);
  const candidates = currentItems.filter((item) => normalize(item.name) === baselineName);
  if (candidates.length === 1) return candidates[0];
  if (baselineName === "chicken salad" || baselineName === "tuna salad") {
    return candidates.find((item) => item.category === "Cold Sandwiches");
  }
  if (baselineName === "meatball") return candidates.find((item) => item.category === "Hot Sandwiches");
  return null;
}

function normalize(value) {
  return String(value ?? "").replace(/&/g, " and ").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
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
  const result = reconcileALitteriBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
