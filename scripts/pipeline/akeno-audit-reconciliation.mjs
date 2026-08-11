import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-akeno-sushi-thai-11475736769";
const artifacts = new Set(["extra-mushroom", "rice-outside", "ponzu", "sweet-and-sour"]);
const stale = new Set(["salmon-onigiri", "ramune-strawberry", "sweet-chili"]);
const aliases = new Map([
  ["smoked-salmon-foie-gras", "Smoked Salmon Foe Gras"],
  ["shrimp-and-vegetable-tempura", "Shrimp & Veggetable Tempura"],
  ["sashimi-tasting", "Sashimi Testing"],
  ["shiitake-roll", "Shitake Roll"],
  ["liquid-death-sparkling", "Liquid Death Sparking"],
  ["steamed-bean-sprouts", "Steamed Bean Sprout"],
  ["steamed-carrots", "Steamed Carrot"],
  ["salmon-teriyaki-bento", "SalmonTeriyaki Bento"],
]);

export function reconcileAkenoBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (artifacts.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["current-annandale-menu"],
        notes: ["ponzu", "sweet-and-sour"].includes(baseline.itemId)
          ? "The frozen row duplicates the current canonical sauce under a second name and the wrong Hosomaki category."
          : "The frozen row is a modifier or section fragment promoted to a standalone product and is absent from the current menu manifest.",
      };
    }
    const candidates = currentItems(baseline, snapshot.items);
    if (!candidates.length) {
      if (!stale.has(baseline.itemId)) throw new Error(`Unclassified Akeno row: ${baseline.name}`);
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["current-annandale-menu"],
        notes: "This older product is absent from every category in the current Annandale menu manifest.",
      };
    }
    const current = candidates[0];
    const same = signature(current) === signature(baseline);
    return {
      ...check,
      disposition: aliases.has(baseline.itemId) ? "variant_match" : "exact_match",
      allergenVerdict: same ? current.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified" : "mismatch",
      sourceEvidenceIds: ["current-annandale-menu"],
      notes: `Current formulation: ${current.name} (${current.category}; ${describe(current)}). Frozen: ${describe(baseline)}.`,
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

function currentItems(baseline, items) {
  const target = normalize(aliases.get(baseline.itemId) ?? baseline.name);
  return items.filter((item) => normalize(item.name) === target);
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
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

function mismatchKinds(checks, items) {
  const counts = {};
  for (const check of checks.filter((row) => row.allergenVerdict === "mismatch")) {
    const current = currentItems(check.baseline, items)[0];
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(current.allergens ?? []), ...(current.mayContain ?? [])]);
    const omitted = [...after].some((value) => !before.has(value));
    const invented = [...before].some((value) => !after.has(value));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const result = reconcileAkenoBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
