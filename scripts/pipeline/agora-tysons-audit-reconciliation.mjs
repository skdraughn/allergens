import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "agora-tysons-va";
const artifactItemIds = new Set([
  "cold-mezzes",
  "goat-cheese-mozzarella-diced-tomatoes",
  "hot-mezzes",
  "mixed-berries-granola-honey",
  "sistavukorgfornf-chicken-thighs-yogurt-sauce",
  "strained-yogurt-garlic-confit-zaatar",
  "tahini-mixed-greens-tomatoes",
]);
const evidenceIdByUrl = new Map([
  ["https://www.agorarestaurants.net/wp-content/uploads/2026/06/MASTER-DINNER-MENU-TYSONS-JUNE-17.pdf", "official-dinner-menu"],
  ["https://www.agorarestaurants.net/wp-content/uploads/2026/07/MASTER-TYSONS-LUNCH-MENU-JULY-8.pdf", "official-lunch-menu"],
  ["https://www.agorarestaurants.net/wp-content/uploads/2025/11/MASTER-TYSONS-Bottomless-Brunch-1121.pdf", "official-brunch-menu"],
]);

export function reconcileAgoraTysonsBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (artifactItemIds.has(baseline.itemId)) {
      return { ...check, disposition: "artifact", allergenVerdict: "not_applicable", sourceEvidenceIds: ["official-menu-hub", "official-brunch-menu"], notes: "The frozen row is a heading or adjacent description/dietary-label fragment promoted to a product by column-interleaved PDF extraction." };
    }
    const candidates = findCurrentItems(baseline, snapshot.items);
    if (!candidates.length) throw new Error(`No current Agora Tysons match for ${baseline.name}`);
    const signatures = unique(candidates.map(signature));
    const collapsed = candidates.length > 1 && signatures.length > 1;
    const same = signatures.length === 1 && signatures[0] === signature(baseline);
    const unavailable = candidates.every((item) => item.allergenSourceType === "unavailable");
    return {
      ...check,
      disposition: baseline.name === candidates[0].name && candidates.length === 1 ? "exact_match" : "variant_match",
      allergenVerdict: collapsed ? "mismatch" : same ? unavailable ? "accurately_unavailable" : "verified" : "mismatch",
      sourceEvidenceIds: unique(candidates.flatMap((item) => item.sourceUrls.map((url) => evidenceIdByUrl.get(url)).filter(Boolean))),
      notes: `Current presentation${candidates.length > 1 ? "s" : ""}: ${candidates.map((item) => `${item.name} (${item.category}; ${describe(item)})`).join(" | ")}. Frozen: ${describe(baseline)}.${collapsed ? " The frozen row collapsed meal-period formulations with different signals." : ""}`,
    };
  });
  return { restaurantId, itemChecks, counts: { dispositions: countBy(itemChecks, "disposition"), allergens: countBy(itemChecks, "allergenVerdict"), mismatchKinds: mismatchKinds(itemChecks, snapshot.items) } };
}

function findCurrentItems(baseline, items) {
  if (baseline.itemId === "sistavuk") return items.filter((item) => item.category === "Brunch — Eggs & Proteins" && item.name === "SIS TAVUK");
  if (baseline.itemId === "sis-tavuk") return items.filter((item) => item.category === "Dinner — Meat & Chicken" && normalize(item.name) === "sis tavuk");
  const name = normalize(baseline.name);
  return items.filter((item) => normalize(item.name) === name);
}

function normalize(value) { return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, " and ").replace(/\+/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase(); }
function signature(item) { return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`; }
function describe(item) { return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "none"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "none"}`; }
function unique(values) { return [...new Set(values)]; }
function countBy(rows, key) { const counts = {}; for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1; return counts; }
function mismatchKinds(checks, items) {
  const counts = {};
  for (const check of checks.filter((row) => row.allergenVerdict === "mismatch")) {
    const current = findCurrentItems(check.baseline, items);
    if (current.length > 1 && unique(current.map(signature)).length > 1) { counts.collapsed_presentations = (counts.collapsed_presentations ?? 0) + 1; continue; }
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
  const result = reconcileAgoraTysonsBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
