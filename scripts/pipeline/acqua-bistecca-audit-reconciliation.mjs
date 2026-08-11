import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "acqua-bistecca-washington-dc-dc-metro";
const commonEvidenceIds = ["official-dc-location", "third-party-toast-render-proxy"];
const staleItems = new Set(["green-salad"]);
const aliases = new Map([
  ["asparagus", "Grilled Asparagus"],
  ["lumache ai funghi", "Lumache e Funghi"],
  ["polenta and meatballs", "AB Meatballs"],
  ["porcnin butter roasted chicken", "Porcini Butter Roasted Chicken"],
]);

export function reconcileAcquaBisteccaBaselineItems(baselineChecks, snapshot) {
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (staleItems.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: [
          "official-dc-location",
          "official-dinner-pdf",
          "official-brunch-pdf",
          "official-happy-hour-pdf",
          "official-dessert-pdf",
          "third-party-toast-render-proxy",
        ],
        notes: "Green Salad is absent from every current Washington food menu and the current restaurant-linked pickup menu.",
      };
    }

    const current = findCurrentItem(baseline, snapshot.items ?? []);
    if (!current) throw new Error(`No current Acqua Bistecca match for frozen row: ${baseline.name}`);
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
      sourceEvidenceIds: unique([...commonEvidenceIds, evidenceIdForItem(current)]),
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
      mismatchKinds: countMismatchKinds(itemChecks, snapshot.items ?? []),
    },
  };
}

function findCurrentItem(baseline, currentItems) {
  const baselineName = normalize(baseline.name);
  const alias = aliases.get(baselineName);
  if (alias) return currentItems.find((item) => item.name === alias) ?? null;
  return currentItems.find((item) => normalize(item.name) === baselineName) ?? null;
}

function evidenceIdForItem(item) {
  const sourceUrl = item.sourceUrls?.[0] ?? "";
  if (sourceUrl.includes("file_id=38066")) return "official-dinner-pdf";
  if (sourceUrl.includes("file_id=37971")) return "official-brunch-pdf";
  if (sourceUrl.includes("file_id=38065")) return "official-happy-hour-pdf";
  if (sourceUrl.includes("file_id=38064")) return "official-beverage-pdf";
  if (sourceUrl.includes("file_id=37620")) return "official-dessert-pdf";
  throw new Error(`No evidence id configured for current item: ${item.name}`);
}

function countMismatchKinds(itemChecks, currentItems) {
  const counts = {};
  for (const check of itemChecks) {
    if (check.allergenVerdict !== "mismatch") continue;
    const current = findCurrentItem(check.baseline, currentItems);
    const baseline = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const corrected = new Set([...(current?.allergens ?? []), ...(current?.mayContain ?? [])]);
    const omitted = [...corrected].some((allergen) => !baseline.has(allergen));
    const invented = [...baseline].some((allergen) => !corrected.has(allergen));
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

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const result = reconcileAcquaBisteccaBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
