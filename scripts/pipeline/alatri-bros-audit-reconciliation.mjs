import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "alatri-bros-bethesda-md";
const artifacts = new Set([
  "good-were-here-to-serve-you",
  "hungry",
  "crostini-on-our-housemade-foccacia",
  "shrimp-parmesan-over-fresh-made-fettuccine",
]);

export function reconcileAlatriBrosBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    if (artifacts.has(check.baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-menu", "toast-menu"],
        notes: artifactNote(check.baseline.itemId),
      };
    }
    const match = findCurrent(snapshot.items, check.baseline.name);
    if (!match) throw new Error(`Unclassified Alatri Bros. baseline row: ${check.baseline.name}`);
    const same = signature(match.item) === signature(check.baseline);
    const disposition = match.kind === "alias"
      ? "variant_match"
      : check.baseline.name === match.item.name ? "exact_match" : "normalized_match";
    return {
      ...check,
      disposition,
      allergenVerdict: same
        ? match.item.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: match.item.sourceUrls.includes("https://www.alatribros.com/menu")
        ? ["official-menu", "toast-menu"]
        : ["toast-menu", "official-menu"],
      notes: `Current formulation: ${match.item.name} (${match.item.presentations.map((presentation) => presentation.category).join("; ")}; ${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.kind === "alias" ? ` The frozen name is a current published alias of ${match.item.name}.` : ""}`,
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

function artifactNote(itemId) {
  if (itemId === "shrimp-parmesan-over-fresh-made-fettuccine") {
    return "The generic parser promoted the Shrimp Parmesan description into a second nonexistent product. The current Shrimp Parmesan formulation retains that text as its description.";
  }
  if (itemId === "crostini-on-our-housemade-foccacia") {
    return "This frozen row is the official site's Crostini section heading, not a purchasable product.";
  }
  return "This frozen row is promotional order-page copy, not a menu product.";
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
  const result = reconcileAlatriBrosBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
