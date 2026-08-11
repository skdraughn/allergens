import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "albi-dc";
const artifacts = new Map([
  ["khubz", "KHUBZ + is the shared potato-pita section heading. The four current products beneath it are represented individually; the heading is not a purchasable product."],
  ["mahalabiya-dollarand", "The generic PDF parser emitted a second malformed MAHALABIYA row from price and glyph fragments. The single current Mahalabiya formulation is represented once."],
]);
const stale = new Set(["grilled-bone-in-strip", "cucumber-and-green-strawberry"]);

export function reconcileAlbiBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    if (artifacts.has(check.baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: [check.baseline.itemId === "khubz" ? "official-dinner-pdf" : "official-sweets-pdf"],
        notes: artifacts.get(check.baseline.itemId),
      };
    }
    if (stale.has(check.baseline.itemId)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-dinner-pdf"],
        notes: `${check.baseline.name} appears in the prior frozen menu but is absent from every page of Albi's current official dinner PDF.`,
      };
    }

    const match = findCurrent(snapshot.items, check.baseline.name);
    if (!match) throw new Error(`Unclassified Albi baseline row: ${check.baseline.name}`);
    const same = signature(match.item) === signature(check.baseline);
    const menuEvidence = match.item.category.startsWith("Dinner") ? "official-dinner-pdf" : "official-sweets-pdf";
    return {
      ...check,
      disposition: match.kind === "alias"
        ? "variant_match"
        : check.baseline.name === match.item.name ? "exact_match" : "normalized_match",
      allergenVerdict: same ? "verified" : "mismatch",
      sourceEvidenceIds: [menuEvidence, "official-faq"],
      notes: `Current formulation: ${match.item.name} (${match.item.category}; ${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.kind === "alias" ? ` The frozen display name combines the product name with the current shared “on hummus” presentation text.` : ""}`,
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

function findCurrent(items, name) {
  const key = normalize(name);
  const canonical = items.find((item) => normalize(item.name) === key);
  if (canonical) return { item: canonical, kind: "canonical" };
  const alias = items.find((item) => (item.aliases ?? []).some((candidate) => normalize(candidate) === key));
  return alias ? { item: alias, kind: "alias" } : null;
}

function mismatchKinds(checks, currentItems) {
  const counts = {};
  for (const check of checks.filter((candidate) => candidate.allergenVerdict === "mismatch")) {
    const match = findCurrent(currentItems, check.baseline.name);
    if (!match) throw new Error(`Cannot classify mismatch for ${check.baseline.name}.`);
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(match.item.allergens ?? []), ...(match.item.mayContain ?? [])]);
    const omitted = [...after].some((value) => !before.has(value));
    const invented = [...before].some((value) => !after.has(value));
    const kind = omitted && invented
      ? "mixed"
      : omitted
        ? "underreported"
        : invented
          ? "overreported"
          : "cross_contact_scope_added";
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
  const result = reconcileAlbiBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
