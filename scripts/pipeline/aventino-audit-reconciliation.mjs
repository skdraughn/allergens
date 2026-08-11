import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  aventinoDuplicateRestaurantId,
  aventinoRestaurantId,
} from "./aventino-audit-catalog.mjs";

const keeperStale = new Set([
  "1:asparagi",
  "3:carciofo",
  "23:rhubarb-coffee-cake",
]);
const keeperArtifacts = new Set([
  "38:bordiga-bianco",
  "39:carpano-antica",
  "40:cocchi-americano",
  "41:cocchi-dopo-teatro",
  "42:cocchi-torino",
  "43:montanaro-extra-dry",
  "44:punt",
]);
const keeperMismatches = new Set([
  "7:acciughe-e-burro",
  "12:ricotta",
  "13:suppli-al-telefono",
  "25:angel-food-cake",
  "27:chocolate-nemesis",
  "28:chocolate-nemesis-cake",
  "29:cookie-plate",
  "30:gelato-e-sorbetto",
  "31:gelato-selection",
  "32:mascarpone-cheesecake",
  "33:chocolate-chip-cookies",
  "36:sourdough-bread",
  "48:pappardelle",
  "49:rigatoni",
  "51:aventino-burger",
  "52:milanese",
  "53:panino",
]);
const keeperAccuratelyUnavailable = new Set([
  "4:funghi",
  "5:misticanza",
  "14:italian-olives",
  "15:pizza-bianca",
  "16:prosciutto-di-parma",
  "17:rosemary-taralli",
  "24:affogato",
  "55:pollo",
]);
const keeperTargetOverrides = new Map([
  ["37:suppli", "suppli-al-telefono"],
  ["49:rigatoni", "rigatoni"],
  ["53:panino", "prosciutto-panino"],
  ["54:pesce", "pesce-online-ordering"],
]);

export function reconcileAventinoKeeper(baselineChecks, snapshot) {
  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const itemChecks = baselineChecks.map((check) => {
    if (keeperStale.has(check.auditItemKey) || keeperArtifacts.has(check.auditItemKey)) {
      const artifact = keeperArtifacts.has(check.auditItemKey);
      return {
        ...check,
        disposition: artifact ? "artifact" : "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-menus-current", "linked-toast-current"],
        notes: artifact
          ? "This frozen row is alcohol-only Italian Vermouth section bleed, not part of the audited food catalog."
          : "This seasonal frozen product is absent from both current restaurant-issued menus and the current linked ordering menu.",
      };
    }
    const targetId = keeperTargetOverrides.get(check.auditItemKey) ?? check.baseline.itemId;
    const target = currentById.get(targetId);
    if (!target) throw new Error(`Missing current Aventino target ${targetId} for ${check.auditItemKey}.`);
    return {
      ...check,
      disposition: check.auditItemKey === "37:suppli" ? "normalized_match" : "exact_match",
      allergenVerdict: keeperMismatches.has(check.auditItemKey)
        ? "mismatch"
        : keeperAccuratelyUnavailable.has(check.auditItemKey)
          ? "accurately_unavailable"
          : "verified",
      sourceEvidenceIds: ["official-menus-current", "linked-toast-current"],
      notes: `Current target: ${target.name} (${target.category}); ${target.allergenSourceType}; direct allergens: ${target.allergens.join(", ") || "none"}. Service-specific and linked formulations remain separate when descriptions differ.`,
    };
  });
  return checkedResult(aventinoRestaurantId, itemChecks, 55);
}

export function reconcileAventinoDuplicate(baselineChecks, snapshot) {
  const currentById = new Map(snapshot.items.map((item) => [item.id, item]));
  const artifacts = new Set([
    "3:aventino-pasta-club",
    "18:the-washington-posts-best-new-restaurants",
  ]);
  const mismatches = new Set([
    "2:aventino-burger",
    "5:chocolate-chip-cookies",
    "7:milanese",
    "14:ricotta",
    "16:sourdough-bread",
  ]);
  const accuratelyUnavailable = new Set([
    "8:misticanza",
    "11:pizza-bianca",
  ]);
  const overrides = new Map([
    ["2:aventino-burger", "aventino-burger"],
    ["4:bucatini", "bucatini"],
    ["5:chocolate-chip-cookies", "chocolate-chip-cookies"],
    ["6:lumache", "lumache"],
    ["7:milanese", "milanese"],
    ["8:misticanza", "misticanza"],
    ["9:pesce", "pesce-online-ordering"],
    ["10:piselli", "piselli"],
    ["11:pizza-bianca", "pizza-bianca"],
    ["12:pizza-rossa", "pizza-rossa"],
    ["13:prosciutto-panino", "prosciutto-panino"],
    ["14:ricotta", "ricotta"],
    ["15:rigatoni-carbonara", "rigatoni-carbonara"],
    ["16:sourdough-bread", "sourdough-bread"],
    ["17:suppli", "suppli-al-telefono"],
    ["19:tonnarelli", "tonnarelli"],
  ]);
  const itemChecks = baselineChecks.map((check) => {
    if (artifacts.has(check.auditItemKey) || check.auditItemKey === "1:asparagi") {
      const artifact = artifacts.has(check.auditItemKey);
      return {
        ...check,
        disposition: artifact ? "artifact" : "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-menus-current", "official-faq-current", "linked-toast-current"],
        notes: artifact
          ? "This duplicate-record row is a navigation, membership-product, or press link rather than a menu dish."
          : "Asparagi is absent from the current restaurant-issued and live linked menus.",
      };
    }
    const targetId = overrides.get(check.auditItemKey);
    const target = currentById.get(targetId);
    if (!target) throw new Error(`Missing duplicate Aventino target for ${check.auditItemKey}.`);
    return {
      ...check,
      disposition: check.auditItemKey === "17:suppli" ? "normalized_match" : "exact_match",
      allergenVerdict: mismatches.has(check.auditItemKey)
        ? "mismatch"
        : accuratelyUnavailable.has(check.auditItemKey)
          ? "accurately_unavailable"
          : "verified",
      sourceEvidenceIds: ["official-menus-current", "linked-toast-current"],
      notes: `Duplicate record maps to canonical aventino-bethesda item ${target.id}: ${target.name}.`,
    };
  });
  return checkedResult(aventinoDuplicateRestaurantId, itemChecks, 19);
}

function checkedResult(restaurantId, itemChecks, expectedCount) {
  if (
    itemChecks.length !== expectedCount ||
    new Set(itemChecks.map((row) => row.auditItemKey)).size !== expectedCount ||
    itemChecks.some((row) => row.disposition === "pending" || row.allergenVerdict === "pending")
  ) {
    throw new Error(`Incomplete ${restaurantId} reconciliation.`);
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

async function readJsonLines(filePath) {
  return (await readFile(filePath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const snapshot = JSON.parse(await readFile(
    `data/restaurant-verification/repairs/${aventinoRestaurantId}/corrected-menu.json`,
    "utf8",
  ));
  for (const [restaurantId, reconcile] of [
    [aventinoRestaurantId, reconcileAventinoKeeper],
    [aventinoDuplicateRestaurantId, reconcileAventinoDuplicate],
  ]) {
    const baselinePath = `data/restaurant-verification/item-checks/${restaurantId}.jsonl`;
    const result = reconcile(await readJsonLines(baselinePath), snapshot);
    await writeFile(
      baselinePath,
      `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
    );
    console.log(JSON.stringify({ restaurantId, ...result.counts }, null, 2));
  }
}
