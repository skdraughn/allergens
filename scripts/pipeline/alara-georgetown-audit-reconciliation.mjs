import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "alara-georgetown-dc";
const structuralArtifacts = new Set([
  "humus-tzatziki-muhammara",
  "first-course",
  "second-course",
  "third-course",
  "fourth-course",
  "homemade-ice-cream-kunafa",
  "lentil-soup",
]);
const alcoholArtifacts = new Set(["mimi-en-provence-france", "plomari", "razzouk"]);

const evidenceIdByUrlPart = [
  ["/menu/brunch/", "official-brunch"],
  ["Alara%2520Dinner.pdf", "official-dinner-pdf"],
  ["AlaraLunchMenuV2", "official-lunch-pdf"],
  ["AlaraBrunchMenuV2", "official-brunch-pdf"],
  ["AlaraDessertMenu.pdf", "official-dessert-pdf"],
  ["CATERING%20MENU.pdf", "official-catering-pdf"],
  ["COCKTAIL%20LIST_", "official-cocktail-pdf"],
];

export function reconcileAlaraGeorgetownBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    if (structuralArtifacts.has(check.baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-dinner-pdf"],
        notes: structuralArtifactNote(check.baseline.itemId),
      };
    }
    if (alcoholArtifacts.has(check.baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-cocktail-pdf"],
        notes: "This is an alcohol-only beverage row. The generic parser ingested three isolated alcohol names while omitting the rest of the alcohol list; alcohol-only products are outside this food/nonalcoholic catalog and the row is an ingestion artifact.",
      };
    }

    const match = findCurrentItem(snapshot.items, check.baseline.name);
    if (!match) throw new Error(`Unclassified Alara baseline row: ${check.baseline.name}`);
    const same = signature(match.item) === signature(check.baseline);
    return {
      ...check,
      disposition: match.kind === "canonical" ? "exact_match" : "variant_match",
      allergenVerdict: same
        ? match.item.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: evidenceIdsFor(match.item),
      notes: `Current formulation: ${match.item.name} (${match.item.presentations.map((presentation) => presentation.category).join("; ")}; ${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.kind === "alias" ? ` The frozen name is a published-name or quantity variant of ${match.item.name}.` : ""}`,
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
  return alias ? { item: alias, kind: "alias" } : null;
}

function evidenceIdsFor(item) {
  const ids = [];
  for (const url of item.sourceUrls) {
    const match = evidenceIdByUrlPart.find(([part]) => url.includes(part));
    if (match && !ids.includes(match[1])) ids.push(match[1]);
  }
  if (!ids.length) throw new Error(`No evidence mapping for current Alara item ${item.name}.`);
  return ids;
}

function structuralArtifactNote(itemId) {
  if (itemId === "humus-tzatziki-muhammara") {
    return "This frozen row is the parenthetical component text beneath the Mezze Trio first course, not a separately purchasable product.";
  }
  if (["first-course", "second-course", "third-course", "fourth-course"].includes(itemId)) {
    return "This frozen row is a prix-fixe course heading, not a menu product. The current catalog represents the purchasable, configurable Taste of Alara package once and keeps its choices as presentation context.";
  }
  if (itemId === "homemade-ice-cream-kunafa") {
    return "The generic parser fused two separate fourth-course choices, Homemade Ice Cream and Kunefe, into one nonexistent product. The current standalone Ice Cream and Kunefe formulations are represented separately.";
  }
  return "This is a prix-fixe choice label duplicating the current standalone Red Lentil Soup, not a separate formulation.";
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
  const [baselineText, snapshotText] = await Promise.all([readFile(baselinePath, "utf8"), readFile(snapshotPath, "utf8")]);
  const result = reconcileAlaraGeorgetownBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
