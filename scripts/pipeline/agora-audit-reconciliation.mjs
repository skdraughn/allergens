import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "agora-dc";
const artifactItemIds = new Set([
  "chicken-thighs-yogurt-sauce",
  "cold-mezzes",
  "for-the-table",
  "g-f",
  "goat-cheese-mozzarella-diced-tomatoes",
  "hot-mezzes",
  "mixed-berries-granola-honey",
  "pideler",
  "strained-yogurt-garlic-confit-zaatar",
  "tahini-mixed-greens-tomatoes",
]);
const staleItemIds = new Set([
  "cilbir",
  "kasik-salad",
  "kavurmali-fried-eggs",
  "manchego-omelette",
  "smoked-salmon",
]);
const evidenceIdByUrl = new Map([
  ["https://www.agorarestaurants.net/wp-content/uploads/2026/06/MASTER-DC-DINNER-MENU-JUNE-21.pdf", "official-dinner-menu"],
  ["https://www.agorarestaurants.net/wp-content/uploads/2026/07/MASTER-DC-LUNCH-MENU-JULY-8.pdf", "official-lunch-menu"],
  ["https://www.agorarestaurants.net/wp-content/uploads/2025/11/MASTER-DC-Bottomless-Brunch-1121-Print.pdf", "official-brunch-menu"],
]);

export function reconcileAgoraBaselineItems(baselineChecks, snapshot) {
  const itemChecks = baselineChecks.map((check) => {
    const baseline = check.baseline;
    if (artifactItemIds.has(baseline.itemId)) {
      return { ...check, disposition: "artifact", allergenVerdict: "not_applicable", sourceEvidenceIds: ["official-menu-hub", "official-brunch-menu"], notes: "The frozen row is a section heading, dietary-label fragment, add-on description, or adjacent item description promoted to a product by column-interleaved PDF extraction." };
    }
    const candidates = findCurrentItems(baseline, snapshot.items);
    if (candidates.length === 0) {
      if (!staleItemIds.has(baseline.itemId)) throw new Error(`Unclassified Agora row: ${baseline.name}`);
      return { ...check, disposition: "stale_extra", allergenVerdict: "not_applicable", sourceEvidenceIds: ["official-dinner-menu", "official-lunch-menu", "official-brunch-menu"], notes: "This older Agora product is absent from all current official DC food menus." };
    }
    const signatures = unique(candidates.map(signature));
    const collapsed = candidates.length > 1 && signatures.length > 1;
    const same = signatures.length === 1 && signatures[0] === signature(baseline);
    const allUnavailable = candidates.every((item) => item.allergenSourceType === "unavailable");
    return {
      ...check,
      disposition: candidates.length > 1 || baseline.name !== candidates[0].name ? "variant_match" : "exact_match",
      allergenVerdict: collapsed ? "mismatch" : same ? allUnavailable ? "accurately_unavailable" : "verified" : "mismatch",
      sourceEvidenceIds: unique(candidates.flatMap((item) => item.sourceUrls.map((url) => evidenceIdByUrl.get(url)).filter(Boolean))),
      notes: `Current presentation${candidates.length > 1 ? "s" : ""}: ${candidates.map((item) => `${item.name} (${item.category}; ${describe(item)})`).join(" | ")}. Frozen: ${describe(baseline)}.${collapsed ? " The frozen row collapsed meal-period formulations with different fixed signals." : ""}`,
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

function findCurrentItems(baseline, items) {
  const name = normalize(baseline.name);
  return items.filter((item) => normalize(item.name) === name);
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, " and ")
    .replace(/\+/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function signature(item) {
  return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`;
}

function describe(item) {
  return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "none"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "none"}`;
}

function mismatchKinds(checks, items) {
  const counts = {};
  for (const check of checks.filter((row) => row.allergenVerdict === "mismatch")) {
    const current = findCurrentItems(check.baseline, items);
    if (current.length > 1 && unique(current.map(signature)).length > 1) {
      counts.collapsed_presentations = (counts.collapsed_presentations ?? 0) + 1;
      continue;
    }
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(current[0].allergens ?? []), ...(current[0].mayContain ?? [])]);
    const omitted = [...after].some((value) => !before.has(value));
    const invented = [...before].some((value) => !after.has(value));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

function unique(values) { return [...new Set(values)]; }

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`, "utf8"),
  ]);
  const result = reconcileAgoraBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}

