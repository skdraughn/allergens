import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "auntie-annes";
const reconciliationPath =
  "data/restaurant-verification/repairs/auntie-annes/source-reconciliation.json";

export async function reconcileAuntieAnnesBaselineItems(baselineChecks, snapshot) {
  const reconciliation = JSON.parse(await readFile(reconciliationPath, "utf8"));
  const mappingByKey = new Map(
    reconciliation.itemChecks.map((mapping) => [mapping.auditItemKey, mapping]),
  );
  const currentById = new Map((snapshot.items ?? []).map((item) => [item.id, item]));
  const itemChecks = baselineChecks.map((check) => {
    const mapping = mappingByKey.get(check.auditItemKey);
    if (!mapping) throw new Error(`Missing Auntie Anne's mapping for ${check.auditItemKey}.`);
    const targets = mapping.targets.map((targetId) => {
      const target = currentById.get(targetId);
      if (!target) throw new Error(`Missing Auntie Anne's current target ${targetId}.`);
      return target;
    });
    return {
      ...check,
      disposition: mapping.disposition,
      allergenVerdict: mapping.allergenVerdict,
      sourceEvidenceIds: ["official-us-nutrition-guide-2025", "legacy-2016-allergen-chart"],
      notes: mapping.allergenVerdict === "not_applicable"
        ? "The frozen row is a stale product, processing component, or serving/configuration artifact that is absent from the current March 2025 U.S. product guide."
        : `Current target${targets.length === 1 ? "" : "s"}: ${targets.map((target) => target.name).join("; ")}. The frozen record predates the current guide and omits its all-food-and-beverage global may-contain semantics.`,
    };
  });

  if (itemChecks.length !== 37 || mappingByKey.size !== 37) {
    throw new Error(
      `Expected 37 frozen Auntie Anne's rows and mappings; found ${itemChecks.length} rows and ${mappingByKey.size} mappings.`,
    );
  }
  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
    },
  };
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map((line) =>
    JSON.parse(line)
  );
  const result = await reconcileAuntieAnnesBaselineItems(
    baselineChecks,
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
