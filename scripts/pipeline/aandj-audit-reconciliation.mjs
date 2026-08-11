import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-aandj-9382941658";
const evidenceIds = ["official-home", "official-menu", "third-party-toast-render-proxy"];
const artifactIds = new Set([
  "buns-dumplings-and-breads",
  "noodles",
  "rice",
  "washington-postbest-dim-sum-dumplings-in-washington",
]);

export function reconcileAandJBaselineItems(baselineChecks, snapshot) {
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (artifactIds.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: baseline.itemId.startsWith("washington-post")
          ? "This is a press-quote/navigation card from the restaurant website, not a menu product."
          : "This is a Toast category heading flattened into the frozen item list, not a standalone menu product.",
      };
    }

    const current = findCurrentItem(baseline, snapshot.items ?? []);
    if (!current) throw new Error(`No current A&J match for frozen row: ${baseline.name}`);
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
      mismatchKinds: countMismatchKinds(itemChecks, snapshot.items ?? []),
    },
  };
}

function findCurrentItem(baseline, currentItems) {
  if (baseline.sourceType === "html-card") {
    if (/\b(?:bubble tea|creamed ice tea)\b/i.test(baseline.name)) {
      return currentItems.find((item) => item.name === "珍珠飲料 Bubble Tea");
    }
    const code = baseline.name.match(/^(\d{4})\./)?.[1];
    if (!code) return null;
    if (code === "5105") return currentItems.find((item) => /Suan Bao Niu Jin/i.test(item.name));
    const candidates = currentItems.filter((item) =>
      item.sourceItemId === `official-${code}` || String(item.sourceItemId).startsWith(`${code}-`),
    );
    if (candidates.length === 1) return candidates[0];
    if (code === "2207") return candidates.find((item) => item.category === "SIDES");
    if (code === "6205") return candidates.find((item) => item.name === "可樂 Diet Coke");
    return candidates[0] ?? null;
  }

  const baselineName = normalize(baseline.name);
  return currentItems.find((item) => normalize(item.name) === baselineName) ?? null;
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
  return String(value ?? "")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/(?:\*{1,2}|\^\^)+\s*$/g, "")
    .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().toLowerCase();
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
  const result = reconcileAandJBaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
