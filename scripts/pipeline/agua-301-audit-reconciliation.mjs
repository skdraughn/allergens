import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "agua-301-restaurant-washington-dc-dc-metro";
const artifactIds = new Set(["2-dozen-minimum-per-item-required", "enchiladas", "fajitas", "flautas-lightly-fried-rolled-corn-tortilla-stuffed-with", "inquiry-send-inquiry-to-restaurant", "little-bites-to-start-a-meal", "no-changes-or-substitutions-entree-purchase-necessary", "platos-principales", "taco-platter", "tecate-can"]);
const staleIds = new Set(["burrito-ohogar", "side-fries", "single-taco-to-go"]);
const aliases = new Map([
  ["agua-cheese-quesadilla", "Cheese Quesadilla"],
  ["agua-chicken-quesadilla", "Chicken Quesadilla"],
  ["agua-shrimp-quesadilla", "Shrimp Quesadilla"],
  ["agua-steak-quesadilla", "Steak Quesadilla"],
  ["agua-queso-dip-with-ground-beef", "Agua Queso Dip with Mexican spiced ground beef"],
  ["family-fajita-meal", "Fajitas for 2 (pick up or delivery only)"],
  ["queso-fundido-with-chorizo", "Queso Fondido with Chorizo"],
  ["rice", "White Rice"],
  ["taco-family-meal", "Family Taco Meal (pick up or delivery only)"],
]);
const evidenceIdByUrl = new Map([
  ["https://agua301.com/washington-yards-park-agua-301-food-menu", "official-food-menu"],
  ["https://agua301.com/washington-yards-park-agua-301-drink-menu", "official-drink-menu"],
]);

export function reconcileAgua301BaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (artifactIds.has(baseline.itemId)) return { ...check, disposition: "artifact", allergenVerdict: "not_applicable", sourceEvidenceIds: ["official-food-menu", "official-drink-menu"], notes: baseline.itemId === "tecate-can" ? "This is an alcoholic beverage and is excluded from the app's food/non-alcoholic catalog." : "The frozen row is a menu heading, ordering instruction, package rule, or generic section label rather than a current product formulation." };
    const candidates = currentItems(baseline, snapshot.items);
    if (!candidates.length) {
      if (!staleIds.has(baseline.itemId)) throw new Error(`Unclassified Agua 301 row: ${baseline.name}`);
      return { ...check, disposition: "stale_extra", allergenVerdict: "not_applicable", sourceEvidenceIds: ["official-food-menu"], notes: "This older product is absent from every current official Agua 301 food and non-alcoholic beverage surface." };
    }
    const signatures = unique(candidates.map(signature));
    const collapsed = candidates.length > 1 && signatures.length > 1;
    const same = signatures.length === 1 && signatures[0] === signature(baseline);
    const unavailable = candidates.every((item) => item.allergenSourceType === "unavailable");
    return {
      ...check,
      disposition: candidates.length === 1 && candidates[0].name === baseline.name ? "exact_match" : "variant_match",
      allergenVerdict: collapsed ? "mismatch" : same ? unavailable ? "accurately_unavailable" : "verified" : "mismatch",
      sourceEvidenceIds: unique(candidates.flatMap((item) => item.sourceUrls.map((url) => evidenceIdByUrl.get(url)).filter(Boolean))),
      notes: `Current formulation${candidates.length > 1 ? "s" : ""}: ${candidates.map((item) => `${item.name} (${item.category}; ${describe(item)})`).join(" | ")}. Frozen: ${describe(baseline)}.${collapsed ? " The frozen row collapsed current formulations with different fixed signals." : ""}`,
    };
  });
  return { restaurantId, itemChecks, counts: { dispositions: countBy(itemChecks, "disposition"), allergens: countBy(itemChecks, "allergenVerdict"), mismatchKinds: mismatchKinds(itemChecks, snapshot.items) } };
}

function currentItems(baseline, items) {
  const target = normalize(aliases.get(baseline.itemId) ?? baseline.name);
  return items.filter((item) => normalize(item.name) === target);
}
function normalize(value) { return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
function signature(item) { return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`; }
function describe(item) { return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "none"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "none"}`; }
function unique(values) { return [...new Set(values)]; }
function countBy(rows, key) { const counts = {}; for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1; return counts; }
function mismatchKinds(checks, items) {
  const counts = {};
  for (const check of checks.filter((row) => row.allergenVerdict === "mismatch")) {
    const current = currentItems(check.baseline, items);
    if (current.length > 1 && unique(current.map(signature)).length > 1) { counts.collapsed_formulations = (counts.collapsed_formulations ?? 0) + 1; continue; }
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
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8")]);
  const result = reconcileAgua301BaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
