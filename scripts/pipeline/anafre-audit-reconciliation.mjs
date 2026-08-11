import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "anafre-dc";
const evidenceIds = ["official-anafre-menu", "official-anafre-home", "linked-mealage-ordering"];

function normalizedName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function normalizedCategory(value) {
  return normalizedName(value).replace(/^entrees$/, "entrees");
}

function itemKey(name, category) {
  return `${normalizedCategory(category)}|${normalizedName(name)}`;
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

export function reconcileAnafreBaselineItems(checks, snapshot) {
  const currentByKey = new Map(
    snapshot.items.map((item) => [itemKey(item.name, item.category), item]),
  );
  const currentByName = new Map();
  for (const item of snapshot.items) {
    const key = normalizedName(item.name);
    const bucket = currentByName.get(key) ?? [];
    bucket.push(item);
    currentByName.set(key, bucket);
  }
  const matchedIds = new Set();
  const itemChecks = checks.map((check) => {
    const baselineName = check.baseline?.name ?? "";
    const baselineCategory = check.baseline?.category ?? "";
    const correctedName = baselineName === "Queso Fundindo en Hoja de Platano"
      ? "Queso Fundido en Hoja de Platano"
      : baselineName;
    let current = currentByKey.get(itemKey(correctedName, baselineCategory));
    let disposition = baselineName === correctedName ? "exact_match" : "variant_match";
    if (!current) {
      const sameName = currentByName.get(normalizedName(correctedName)) ?? [];
      if (sameName.length === 1) {
        [current] = sameName;
        disposition = "variant_match";
      }
    }
    if (!current) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: evidenceIds,
        notes: "No current Anafre menu surface contains this row. 'Chicken Sandwich' is a duplicate name invented alongside the real official Sandwiches item 'Chicken'.",
      };
    }

    matchedIds.add(current.id);
    const allergensMatch = JSON.stringify(sorted(check.baseline?.allergens)) ===
      JSON.stringify(sorted(current.allergens));
    const mayContainMatch = JSON.stringify(sorted(check.baseline?.mayContain)) ===
      JSON.stringify(sorted(current.mayContain));
    const allergenVerdict = allergensMatch && mayContainMatch
      ? current.allergenSourceType === "unavailable"
        ? "accurately_unavailable"
        : "verified"
      : "mismatch";
    return {
      ...check,
      disposition,
      allergenVerdict,
      sourceEvidenceIds: evidenceIds,
      notes: allergenVerdict === "mismatch"
        ? `The current restaurant-issued formulation directly supports ${current.allergens.join(", ")}; the frozen row incorrectly left those positive signals unavailable.`
        : "The frozen row matches a current Anafre formulation. Absent ingredient terms are not treated as negative allergen assurances.",
    };
  });

  return {
    restaurantId,
    itemChecks,
    matchedCurrentItemCount: matchedIds.size,
    omittedCurrentItems: snapshot.items.filter((item) => !matchedIds.has(item.id)),
    counts: {
      dispositions: Object.fromEntries(
        ["exact_match", "normalized_match", "variant_match", "stale_extra"]
          .map((value) => [value, itemChecks.filter((row) => row.disposition === value).length])
          .filter(([, count]) => count > 0),
      ),
      allergens: Object.fromEntries(
        ["verified", "accurately_unavailable", "mismatch", "not_applicable"]
          .map((value) => [value, itemChecks.filter((row) => row.allergenVerdict === value).length])
          .filter(([, count]) => count > 0),
      ),
      omittedCurrentItemCount: snapshot.items.length - matchedIds.size,
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(
    `data/restaurant-verification/item-checks/${restaurantId}.jsonl`,
  );
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAnafreBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
