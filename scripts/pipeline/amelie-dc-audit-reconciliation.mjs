import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  restaurantIdAmelieDc,
  sourceUrlsAmelieDc,
} from "./amelie-dc-audit-catalog.mjs";

const evidenceByUrl = new Map([
  [sourceUrlsAmelieDc.lunch, "official-lunch"],
  [sourceUrlsAmelieDc.dinner, "official-dinner"],
  [sourceUrlsAmelieDc.brunch, "official-brunch"],
  [sourceUrlsAmelieDc.happyHour, "official-happy-hour"],
]);

const frozenMappings = new Map([
  [normalize("Amélie Burger (+5)"), mapping("Amélie Burger", "variant_match")],
  [normalize("Cheeseburger"), mapping("Amélie Burger", "variant_match")],
  [normalize("Baked Camembert de Normandie"), mapping("Baked Camembert", "normalized_match")],
  [normalize("Burratta"), mapping("Burrata", "normalized_match")],
  [normalize("CHEESE & CHARCUTERIE"), mapping("Cheese and Charcuterie Plate", "normalized_match")],
  [normalize("French Onion Soup"), mapping("Onion Soup", "normalized_match")],
  [normalize("Local Roasted Chicken"), mapping("Roasted Lemon Chicken", "variant_match")],
  [normalize("Moules-Frites Marinière"), mapping("Moules-Frites", "normalized_match")],
  [normalize("Salade Niçoise (+8)"), mapping("Salade Niçoise", "normalized_match")],
  [normalize("Steak Frites (+10)"), mapping("Steak-Frites", "variant_match")],
  [normalize("Truffle Fries Truffle Oil, parmesan cheese"), mapping("Truffle Fries", "normalized_match")],
  [normalize("Warm Pistachio Crusted Goat Cheese Ball"), mapping("Warm Pistachio Crusted Goat Cheese", "normalized_match")],
]);

const staleRows = new Map([
  [normalize("Crispy Octopus"), "The frozen Crispy Octopus presentation is absent from the current menus; the separately frozen Grilled Octopus row maps to the current Grilled Octopus formulation."],
  [normalize("Maryland Rockfish"), "Maryland Rockfish is absent from the current dinner menu, which now publishes Maryland Seared Monkfish as a different fish formulation."],
]);

export function reconcileAmelieDcBaselineItems(checks, snapshot) {
  const currentByNormalizedName = new Map(
    snapshot.items.map((item) => [normalize(item.name), item]),
  );
  const currentByName = new Map(snapshot.items.map((item) => [item.name, item]));
  const matchedCurrentNames = new Set();
  const itemChecks = checks.map((check) => {
    const staleNote = staleRows.get(normalize(check.baseline.name));
    if (staleNote) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-lunch", "official-dinner", "official-brunch"],
        notes: staleNote,
      };
    }

    const match = findCurrentItem(check.baseline.name, currentByNormalizedName, currentByName);
    if (!match) throw new Error(`Unadjudicated Amélie frozen row: ${check.baseline.name}`);
    matchedCurrentNames.add(match.item.name);
    const same = signature(match.item) === signature(check.baseline);
    const allergenVerdict = same
      ? match.item.allergenSourceType === "unavailable"
        ? "accurately_unavailable"
        : "verified"
      : "mismatch";
    return {
      ...check,
      disposition: match.kind,
      allergenVerdict,
      sourceEvidenceIds: evidenceIds(match.item),
      notes: `Current formulation: ${match.item.name} (${describe(match.item)}). Frozen: ${describe(check.baseline)}.${match.item.name !== check.baseline.name ? ` Current published presentations consolidate under ${match.item.name}.` : ""} Direct menu terms and unambiguous formulation identity support positive signals, but the pages are not complete allergen matrices; missing ingredients are not negative assurances and the server-alert notice is not a may-contain statement.`,
    };
  });
  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentNames.has(item.name));
  return {
    restaurantId: restaurantIdAmelieDc,
    itemChecks,
    omittedCurrentItems: omittedCurrentItems.map((item) => item.name),
    counts: {
      dispositions: countBy(itemChecks, "disposition"),
      allergens: countBy(itemChecks, "allergenVerdict"),
      mismatchKinds: mismatchKinds(itemChecks, currentByNormalizedName, currentByName),
      matchedCurrentFormulations: matchedCurrentNames.size,
      omittedCurrentFormulations: omittedCurrentItems.length,
    },
  };
}

function findCurrentItem(baselineName, currentByNormalizedName, currentByName) {
  const direct = currentByNormalizedName.get(normalize(baselineName));
  if (direct) {
    return {
      item: direct,
      kind: direct.name === baselineName ? "exact_match" : "normalized_match",
    };
  }
  const mapped = frozenMappings.get(normalize(baselineName));
  if (!mapped) return null;
  const item = currentByName.get(mapped.currentName);
  if (!item) throw new Error(`Missing Amélie mapping target: ${mapped.currentName}`);
  return { item, kind: mapped.kind };
}

function mismatchKinds(checks, currentByNormalizedName, currentByName) {
  const result = {};
  for (const check of checks.filter((candidate) => candidate.allergenVerdict === "mismatch")) {
    const match = findCurrentItem(check.baseline.name, currentByNormalizedName, currentByName);
    if (!match) throw new Error(`Cannot classify mismatch for ${check.baseline.name}`);
    const before = new Set([...(check.baseline.allergens ?? []), ...(check.baseline.mayContain ?? [])]);
    const after = new Set([...(match.item.allergens ?? []), ...(match.item.mayContain ?? [])]);
    const omitted = [...after].some((value) => !before.has(value));
    const invented = [...before].some((value) => !after.has(value));
    const kind = omitted && invented ? "mixed" : omitted ? "underreported" : "overreported";
    result[kind] = (result[kind] ?? 0) + 1;
  }
  return result;
}

function evidenceIds(item) {
  return [...new Set((item.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))];
}

function signature(item) {
  return `${[...(item.allergens ?? [])].sort().join(",")}|${[...(item.mayContain ?? [])].sort().join(",")}`;
}

function describe(item) {
  return `contains ${(item.allergens ?? []).length ? item.allergens.join(", ") : "no supported fixed allergen signal"}; may contain ${(item.mayContain ?? []).length ? item.mayContain.join(", ") : "no published item-level cross-contact signal"}`;
}

function mapping(currentName, kind) {
  return { currentName, kind };
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(
    `data/restaurant-verification/item-checks/${restaurantIdAmelieDc}.jsonl`,
  );
  const snapshotPath = path.resolve(
    `data/restaurant-verification/repairs/${restaurantIdAmelieDc}/corrected-menu.json`,
  );
  const [baselineText, snapshotText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
  ]);
  const result = reconcileAmelieDcBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify({ ...result.counts, omittedCurrentItems: result.omittedCurrentItems }, null, 2));
}
