import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "replacement-alta-strada-fairfax-va-fairfax-va";
const evidenceByUrl = new Map([
  ["https://www.altastradarestaurant.com/mosaic-district-lunch-menu", "official-mosaic-lunch"],
  ["https://www.altastradarestaurant.com/mosaic-district-dinner-menu", "official-mosaic-dinner"],
  ["https://www.altastradarestaurant.com/mosaic-district-brunch-menu", "official-mosaic-brunch"],
  ["https://www.altastradarestaurant.com/mosaic-district-happy-hour-menu", "official-mosaic-happy-hour"],
  ["https://www.altastradarestaurant.com/wellesley-dinner-menu", "official-other-location-wellesley"],
  ["https://www.altastradarestaurant.com/foxwoods-casino-dinner-menu", "official-other-location-foxwoods"],
]);

const structuralArtifacts = new Set([
  normalize("37Grilled Filet Branzino"),
  normalize("61Prime Flat Iron Steak* (8 oz)"),
]);

const normalizedVariants = new Map([
  [normalize("Chicken Parm"), "Chicken Milanese or Parmigiano"],
  [normalize("Our World Famous Garlic Bread"), "Alta Strada World Famous Garlic Bread"],
]);

export function reconcileAltaStradaFairfaxBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const baselineKey = normalize(check.baseline.name);
    if (structuralArtifacts.has(baselineKey)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: baselineEvidenceIds(check.baseline),
        notes: "This frozen row concatenates an adjacent Wellesley price with the following item name. The correctly separated other-location rows remain visible in the restaurant-issued Wellesley source, and neither malformed row is a Fairfax formulation.",
      };
    }

    const match = findCurrentItem(snapshot.items, check.baseline.name);
    if (!match) {
      return {
        ...check,
        disposition: "location_mismatch",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: baselineEvidenceIds(check.baseline),
        notes: "This is a real Wellesley or Foxwoods formulation, but it is not published on Alta Strada's current Mosaic/Fairfax lunch, dinner, brunch, or happy-hour menus. It is excluded from the corrected Fairfax catalog rather than treated as a Fairfax allergen claim.",
      };
    }

    const same = signature(match.item) === signature(check.baseline);
    return {
      ...check,
      disposition: match.kind === "canonical" ? "exact_match" : "variant_match",
      allergenVerdict: same
        ? match.item.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: [...new Set([...evidenceIds(match.item), ...baselineEvidenceIds(check.baseline)])],
      notes: `Current Fairfax formulation: ${match.item.name} (${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.kind === "alias" ? ` The frozen name is a service-menu display variant consolidated into ${match.item.name}.` : match.kind === "normalized" ? ` The frozen other-location wording maps to the current Fairfax ${match.item.name} formulation.` : ""}`,
    };
  });

  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      mismatchKinds: mismatchKinds(itemChecks, snapshot.items),
    },
  };
}

function findCurrentItem(items, baselineName) {
  const key = normalize(baselineName);
  const canonical = items.find((item) => normalize(item.name) === key);
  if (canonical) return { item: canonical, kind: "canonical" };
  const alias = items.find((item) => (item.aliases ?? []).some((name) => normalize(name) === key));
  if (alias) return { item: alias, kind: "alias" };
  const normalizedName = normalizedVariants.get(key);
  const normalizedItem = normalizedName && items.find((item) => item.name === normalizedName);
  return normalizedItem ? { item: normalizedItem, kind: "normalized" } : null;
}

function evidenceIds(item) {
  return [...new Set((item.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))];
}

function baselineEvidenceIds(baseline) {
  return [...new Set((baseline.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))];
}

function mismatchKinds(checks, currentItems) {
  const counts = {};
  for (const check of checks.filter((candidate) => candidate.allergenVerdict === "mismatch")) {
    const match = findCurrentItem(currentItems, check.baseline.name);
    if (!match) throw new Error(`Cannot classify mismatch for ${check.baseline.name}.`);
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(match.item.allergens ?? []), ...(match.item.mayContain ?? [])]);
    const omitted = [...after].some((value) => !before.has(value));
    const invented = [...before].some((value) => !after.has(value));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&amp;/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function signature(item) {
  return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`;
}

function describe(item) {
  return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "none"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "none"}`;
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
  const result = reconcileAltaStradaFairfaxBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
