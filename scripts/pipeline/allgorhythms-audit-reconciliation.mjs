import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-allgorhythms-12234974276";
const evidenceByUrl = new Map([
  ["https://gorhythms.com/food-menu", "official-food-menu"],
  ["https://tmt.spotapps.co/ordering-menu/?spot_id=321717", "linked-spotapps-ordering"],
]);

const structuralArtifacts = new Set([
  normalize("🔥 Main Plates & Entrees"),
  normalize("$14.00/Veg"),
  normalize("$16.00/Chicken"),
  normalize("Dynamite Dragon Shrimp — crispy shrimp tossed in sweet chili or hot sauce"),
  normalize("INSPIRED COCKTAILS"),
  normalize("Lamb Chops or Grilled Sea Bass Fish"),
  normalize("make some memories"),
  normalize("Personal Pizza or Quesadilla/Taco Twist — fun fusion takes on familiar favorites"),
]);

export function reconcileAllGoRhythmsBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const baselineKey = normalize(check.baseline.name);
    if (structuralArtifacts.has(baselineKey)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-home", "official-food-menu"],
        notes: "This frozen row is a homepage recommendation, section heading, price/variant fragment, alcohol heading, or promotional copy rather than a separately published food formulation. It is excluded from the corrected catalog.",
      };
    }

    const match = findCurrentItem(snapshot.items, check.baseline.name);
    if (!match) throw new Error(`Unclassified AllGoRhythms baseline row: ${check.baseline.name}`);
    const same = signature(match.item) === signature(check.baseline);
    return {
      ...check,
      disposition: match.kind === "canonical" ? "exact_match" : "variant_match",
      allergenVerdict: same
        ? match.item.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: evidenceIds(match.item),
      notes: `Current formulation: ${match.item.name} (${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.kind === "alias" ? ` The frozen name is a restaurant-published shortened or service-menu display variant of ${match.item.name}.` : ""}`,
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

function evidenceIds(item) {
  return [...new Set((item.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))];
}

function findCurrentItem(items, baselineName) {
  const key = normalize(baselineName);
  const canonical = items.find((item) => normalize(item.name) === key);
  if (canonical) return { item: canonical, kind: "canonical" };
  const alias = items.find((item) => (item.aliases ?? []).some((name) => normalize(name) === key));
  return alias ? { item: alias, kind: "alias" } : null;
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
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAllGoRhythmsBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
