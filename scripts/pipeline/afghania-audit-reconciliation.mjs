import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "replacement-afghania-washington-dc";
const staleItemIds = new Set([
  "afghania-kabob",
  "chopaan",
  "do-piaza",
  "mix-grill",
  "qaburgha",
  "spicy-chaplee",
]);
const evidenceIdByUrl = new Map([
  ["https://www.afghaniadc.com/menu-1", "official-dinner-menu"],
  [
    "https://www.afghaniadc.com/menu-1?location=2811+M+Street+Northwest&menu=marinated-raw-meats",
    "official-raw-meats-menu",
  ],
]);

export function reconcileAfghaniaBaselineItems(baselineChecks, snapshot, sisterSnapshot) {
  const sisterNames = new Set((sisterSnapshot.items ?? []).map((item) => normalize(item.name)));
  const itemChecks = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    const candidates = findCurrentItems(baseline, snapshot.items ?? []);

    if (candidates.length === 0) {
      if (sisterNames.has(normalize(baseline.name))) {
        return {
          ...check,
          disposition: "location_mismatch",
          allergenVerdict: "not_applicable",
          sourceEvidenceIds: ["official-dinner-menu"],
          notes: "This frozen row belongs to sister restaurant Afghan Bistro, not Afghania. It is absent from Afghania's current official menu and matches Afghan Bistro's verified current catalog.",
        };
      }
      if (!staleItemIds.has(baseline.itemId)) {
        throw new Error(`Unclassified frozen Afghania row without a current match: ${baseline.name}`);
      }
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-dinner-menu", "official-raw-meats-menu"],
        notes: "This appears to be an older Afghania product, but it is absent from every current official Afghania menu section and is not a current Afghan Bistro row.",
      };
    }

    const signalSignatures = unique(candidates.map(signalSignature));
    const baselineSignature = signalSignature(baseline);
    const collapsedDistinctPresentations = candidates.length > 1 && signalSignatures.length > 1;
    const sameSignals = signalSignatures.length === 1 && signalSignatures[0] === baselineSignature;
    const allUnavailable = candidates.every((item) => item.allergenSourceType === "unavailable");
    const literalMatch = candidates.some((item) => item.name === baseline.name);
    const evidenceIds = unique(candidates.flatMap((item) =>
      item.sourceUrls.map((url) => evidenceIdByUrl.get(url)).filter(Boolean)
    ));
    return {
      ...check,
      disposition: candidates.length > 1
        ? "variant_match"
        : literalMatch
          ? "exact_match"
          : "normalized_match",
      allergenVerdict: collapsedDistinctPresentations
        ? "mismatch"
        : sameSignals
          ? allUnavailable ? "accurately_unavailable" : "verified"
          : "mismatch",
      sourceEvidenceIds: evidenceIds,
      notes: [
        `Current presentation${candidates.length === 1 ? "" : "s"}: ${candidates.map((item) => `${item.name} (${item.category}; ${describeSignals(item)})`).join(" | ")}.`,
        `Frozen signals: ${describeSignals(baseline)}.`,
        collapsedDistinctPresentations
          ? "The frozen name-only row collapsed current section-level products with different formulations, so one allergen result cannot accurately represent every presentation."
          : null,
      ].filter(Boolean).join(" "),
    };
  });

  return {
    restaurantId,
    itemChecks,
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      mismatchKinds: countMismatchKinds(itemChecks, snapshot.items ?? []),
    },
  };
}

function findCurrentItems(baseline, currentItems) {
  const baselineName = normalize(baseline.name);
  return currentItems.filter((item) => normalize(item.name) === baselineName);
}

function countMismatchKinds(itemChecks, currentItems) {
  const counts = {};
  for (const check of itemChecks) {
    if (check.allergenVerdict !== "mismatch") continue;
    const candidates = findCurrentItems(check.baseline, currentItems);
    const signatures = unique(candidates.map(signalSignature));
    if (candidates.length > 1 && signatures.length > 1) {
      counts.collapsed_presentations = (counts.collapsed_presentations ?? 0) + 1;
      continue;
    }
    const baselineCombined = new Set([
      ...(check.baseline.allergens ?? []),
      ...(check.baseline.mayContain ?? []),
    ]);
    const currentCombined = new Set([
      ...(candidates[0]?.allergens ?? []),
      ...(candidates[0]?.mayContain ?? []),
    ]);
    const omitted = [...currentCombined].some((allergen) => !baselineCombined.has(allergen));
    const invented = [...baselineCombined].some((allergen) => !currentCombined.has(allergen));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/&/g, " and ").replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function signalSignature(item) {
  return `${sorted(item.allergens).join(",")}|${sorted(item.mayContain).join(",")}`;
}

function describeSignals(item) {
  const contains = sorted(item.allergens);
  const mayContain = sorted(item.mayContain);
  return `contains ${contains.length > 0 ? contains.join(", ") : "none"}; may contain ${mayContain.length > 0 ? mayContain.join(", ") : "none"}`;
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

function unique(values) {
  return [...new Set(values)];
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const sisterSnapshotPath = path.resolve("data/restaurant-verification/repairs/afghan-bistro-springfield-va-dc-metro/corrected-menu.json");
  const [baselineText, snapshotText, sisterSnapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
    readFile(sisterSnapshotPath, "utf8"),
  ]);
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const result = reconcileAfghaniaBaselineItems(
    baselineChecks,
    JSON.parse(snapshotText),
    JSON.parse(sisterSnapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
