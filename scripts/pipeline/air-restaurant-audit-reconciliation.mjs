import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "air-restaurant-washington-dc-dc-metro";
const artifacts = new Set([
  "a-low-country-classic",
  "angus-burger-8oz-served-with-fries",
  "choice-of-jerk-or-fried",
  "honey-mustard",
  "mimosa-carafe",
  "served-w-mashed-potato-and-todays-vegetable",
]);
const stale = new Set(["hand-cut-truffle-fries"]);
const aliases = new Map([["chicken-wings", "Wings"]]);

export function reconcileAirRestaurantBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (artifacts.has(baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-menu"],
        notes: baseline.itemId === "mimosa-carafe"
          ? "This is an alcoholic brunch carafe and is excluded from the app's food/non-alcoholic catalog."
          : "The frozen row is an adjacent item description, sauce, or serving instruction promoted to a product by sequential page extraction.",
      };
    }
    const candidates = currentItems(baseline, snapshot.items);
    if (!candidates.length) {
      if (!stale.has(baseline.itemId)) throw new Error(`Unclassified Air Restaurant row: ${baseline.name}`);
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-menu"],
        notes: "Hand Cut Truffle Fries is absent from the current official page; the current happy-hour product is Hand Cut Fries without the truffle identity.",
      };
    }
    const signatures = unique(candidates.map(signature));
    const same = signatures.length === 1 && signatures[0] === signature(baseline);
    const unavailable = candidates.every((item) => item.allergenSourceType === "unavailable");
    return {
      ...check,
      disposition: aliases.has(baseline.itemId) || candidates.some((item) => item.name !== baseline.name) ? "variant_match" : "exact_match",
      allergenVerdict: same ? unavailable ? "accurately_unavailable" : "verified" : "mismatch",
      sourceEvidenceIds: ["official-menu"],
      notes: `Current formulation${candidates.length > 1 ? "s" : ""}: ${candidates.map((item) => `${item.name} (${item.category}; ${describe(item)})`).join(" | ")}. Frozen: ${describe(baseline)}.`,
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

function unique(values) { return [...new Set(values)]; }

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

function mismatchKinds(checks, items) {
  const counts = {};
  for (const check of checks.filter((row) => row.allergenVerdict === "mismatch")) {
    const current = currentItems(check.baseline, items);
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(current[0].allergens ?? []), ...(current[0].mayContain ?? [])]);
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
  const result = reconcileAirRestaurantBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
