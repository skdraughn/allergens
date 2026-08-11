import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "replacement-al-tiramisu-washington-dc";
const artifacts = new Set(["dolci", "insalate-antipasti-e-zuppe", "le-paste", "menu-advisory", "secondi"]);

export function reconcileAlTiramisuBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    if (artifacts.has(check.baseline.itemId)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: [check.baseline.itemId === "dolci" ? "official-dessert-menu" : "official-menu"],
        notes: "This frozen row is a rendered section heading or advisory block, not a purchasable menu product.",
      };
    }
    const current = snapshot.items.find((item) => normalize(item.name) === normalize(check.baseline.name));
    if (!current) throw new Error(`Unclassified Al Tiramisu baseline row: ${check.baseline.name}`);
    const same = signature(current) === signature(check.baseline);
    return {
      ...check,
      disposition: "exact_match",
      allergenVerdict: same
        ? current.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: [current.category === "Dolci" ? "official-dessert-menu" : "official-menu"],
      notes: `Current formulation: ${current.name} (${current.category}; ${describe(current)}). Frozen: ${describe(check.baseline)}.`,
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

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
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

function mismatchKinds(checks, currentItems) {
  const counts = {};
  for (const check of checks.filter((row) => row.allergenVerdict === "mismatch")) {
    const current = currentItems.find((item) => normalize(item.name) === normalize(check.baseline.name));
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
  const result = reconcileAlTiramisuBaselineItems(baselineText.trim().split(/\r?\n/).map(JSON.parse), JSON.parse(snapshotText));
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
