import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "all-set-restaurant-and-bar-silver-spring-md-dc-metro";
const onlineEvidenceId = "official-online-menu";

const structuralArtifacts = new Set([
  "blue cheese ranch",
  "make it a platter with french fries",
]);

const pdfEvidenceByUrl = new Map([
  ["https://static-content.owner.com/document/0988decf-ed6e-4065-b2ae-969da8048275.pdf", "official-menu-pdf-01"],
  ["https://static-content.owner.com/document/170f0c4f-295a-4b4e-8fa9-7cc18bd38525.pdf", "official-menu-pdf-02"],
  ["https://static-content.owner.com/document/20a3b2db-a163-4ce3-ab30-f3ad7782e789.pdf", "official-menu-pdf-03"],
  ["https://static-content.owner.com/document/30a37385-79fa-43f7-831b-9bce1de3a14f.pdf", "official-menu-pdf-04"],
  ["https://static-content.owner.com/document/3defc0ba-5890-4b1e-b698-5c84021efb7e.pdf", "official-menu-pdf-05"],
  ["https://static-content.owner.com/document/460e05b2-6fc4-4dbe-9240-7e3dcf5c2303.pdf", "official-menu-pdf-06"],
  ["https://static-content.owner.com/document/887b6542-a191-4fc2-b5ea-6b0e83699509.pdf", "official-menu-pdf-07"],
  ["https://static-content.owner.com/document/b45d48bc-e4f4-43a0-9014-fec818bd27a9.pdf", "official-menu-pdf-08"],
]);

export function reconcileAllSetBaselineItems(checks, snapshot) {
  const itemChecks = checks.map((check) => {
    const baselineKey = normalize(check.baseline.name);
    if (/^extra\b/.test(baselineKey) || structuralArtifacts.has(baselineKey)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: [onlineEvidenceId],
        notes: "This frozen row is an ordering modifier, nested choice, or truncated platter-upcharge fragment, not a separately presented menu product. It is excluded from the corrected product catalog.",
      };
    }

    const match = findCurrentItem(snapshot.items, check.baseline.name);
    if (!match) throw new Error(`Unclassified All Set baseline row: ${check.baseline.name}`);
    const same = signature(match.item) === signature(check.baseline);
    return {
      ...check,
      disposition: match.kind === "canonical" ? "exact_match" : "variant_match",
      allergenVerdict: same
        ? match.item.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      sourceEvidenceIds: evidenceIds(match.item),
      notes: `Current formulation: ${match.item.name} (${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.kind === "alias" ? ` The frozen name is a restaurant-published size, dietary-label, spelling, or service-period variant of ${match.item.name}.` : ""}`,
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

function evidenceIds(item) {
  const ids = new Set();
  if ((item.sourceUrls ?? []).includes("https://allsetrestaurant.com/menu")) ids.add(onlineEvidenceId);
  for (const url of item.sourceUrls ?? []) {
    const id = pdfEvidenceByUrl.get(url);
    if (id) ids.add(id);
  }
  return [...ids];
}

function findCurrentItem(items, baselineName) {
  const key = normalize(baselineName);
  const canonical = items.find((item) => normalize(item.name) === key);
  if (canonical) return { item: canonical, kind: "canonical" };
  const alias = items.find((item) => (item.aliases ?? []).some((name) => normalize(name) === key));
  return alias ? { item: alias, kind: "alias" } : null;
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
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAllSetBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(baselinePath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
}
