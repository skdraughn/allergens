import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "amazonia-dc";
const evidenceByUrl = new Map([
  ["https://www.causadc.com/menus/amazonia-dinner", "official-dinner"],
  ["https://www.causadc.com/menus/amazonia-dessert", "official-dessert"],
  ["https://www.causadc.com/menus/amazonia-drinks", "official-drinks"],
  ["https://www.causadc.com/menus/amazonia-sour-hour", "official-sour-hour"],
]);

export function reconcileAmazoniaBaselineItems(checks, snapshot) {
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    const item = snapshot.items.find((candidate) => normalize(candidate.name) === normalize(check.baseline.name));
    if (!item) throw new Error(`Unadjudicated Amazonia frozen row: ${check.baseline.name}`);
    matchedCurrentNames.add(item.name);
    const same = signature(item) === signature(check.baseline);
    return {
      ...check,
      disposition: "exact_match",
      allergenVerdict: same
        ? item.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: evidenceIds(item),
      notes: `Current formulation: ${item.name} (${describe(item)}). Frozen: ${describe(check.baseline)}.${item.presentations.some((presentation) => presentation.dietary) ? " Amazonia's c/d/e/g/s letters are absence or accommodation codes, not positive contains fields; only fixed ingredient wording is used for positive signals." : ""}${["Carrot", "Chicken Thigh", "Mushroom", "Pork Belly", "Salmon Belly"].includes(item.name) ? " The current Anticuchería section explicitly applies its soy-sauce marinade description to this skewer." : ""}`,
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentNames.has(item.name));
  return {
    restaurantId,
    itemChecks,
    omittedCurrentItems: omittedCurrentItems.map((item) => item.name),
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      mismatchKinds: mismatchKinds(itemChecks, snapshot.items),
      matchedCurrentFormulations: matchedCurrentNames.size,
      omittedCurrentFormulations: omittedCurrentItems.length,
    },
  };
}

function evidenceIds(item) {
  return [...new Set((item.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))];
}

function mismatchKinds(checks, currentItems) {
  const counts = {};
  for (const check of checks.filter((candidate) => candidate.allergenVerdict === "mismatch")) {
    const item = currentItems.find((candidate) => normalize(candidate.name) === normalize(check.baseline.name));
    if (!item) throw new Error(`Cannot classify mismatch for ${check.baseline.name}.`);
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(item.allergens ?? []), ...(item.mayContain ?? [])]);
    const omitted = [...after].some((value) => !before.has(value));
    const invented = [...before].some((value) => !after.has(value));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function signature(item) {
  return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`;
}

function describe(item) {
  return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "no supported fixed allergen signal"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "no published item-level cross-contact signal"}`;
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
  const result = reconcileAmazoniaBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
