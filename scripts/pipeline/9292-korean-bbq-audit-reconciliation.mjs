import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "replacement-9292-korean-bbq-annandale-va";
const evidenceIds = [
  "third-party-menu-photo-primary",
  "third-party-menu-photo-lunch",
  "third-party-menu-photo-gopchang",
  "third-party-placejoys-menu",
  "third-party-restaurantji",
];

const aliases = new Map([
  ["bibimbop", "bibimbap"],
  ["galbi", "la galbi"],
  ["galbi cold noodle soup", "9292 galbi cold noodle soup"],
  ["galbi spicy cold noodle", "9292 galbi spicy cold noodle"],
  ["hot pot kimchi jigae", "hot pot kimchi jjigae"],
  ["hot spicy cold noodle", "extra spicy cold noodle"],
  ["small cold noodle soup", "small cold buckwheat noodles"],
  ["small hot spicy cold noodle", "small spicy cold buckwheat noodles"],
  ["seasoned beef prime short rib", "seasoned beef prime rib"],
  ["seasoned pork short rib", "seasoned pork short ribs"],
]);

export function reconcile9292BaselineItems(baselineChecks, snapshot) {
  const currentByName = Map.groupBy(snapshot.items ?? [], (item) => normalize(item.name));
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (isParserArtifact(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: "The frozen row is a duplicated section fragment, package component, or listing-navigation artifact rather than a standalone photographed menu item.",
      };
    }

    const normalizedName = normalize(baseline.name);
    const currentName = aliases.get(normalizedName) ?? normalizedName;
    const current = currentByName.get(currentName)?.[0];
    if (!current) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: "The frozen item is absent from the current photographed Annandale menu boards.",
      };
    }

    const baselineClaimedOfficial = baseline.allergenSourceType !== "unavailable";
    return {
      ...check,
      disposition: aliases.has(normalizedName) ? "variant_match" : "exact_match",
      allergenVerdict: baselineClaimedOfficial ? "mismatch" : "accurately_unavailable",
      sourceEvidenceIds: evidenceIds,
      notes: baselineClaimedOfficial
        ? `Current match: ${current.name}. The frozen row promoted third-party menu text to ${baseline.allergenSourceType}; no restaurant-issued allergen disclosure was found, so official allergen data is unavailable.`
        : `Current match: ${current.name}. No restaurant-issued allergen disclosure was found; the empty official allergen arrays are accurately unavailable rather than a negative safety claim.`,
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

function isParserArtifact(itemId) {
  return /^beef-.+-us$/.test(itemId) ||
    /^unlimited-9292-a-/.test(itemId) ||
    ["chicken", "seafood", "own-this-place"].includes(itemId);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
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
  const result = reconcile9292BaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
