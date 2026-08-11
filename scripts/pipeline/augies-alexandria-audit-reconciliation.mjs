import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "augie-s-mussel-house-and-beer-garden-alexandria-va-dc-metro";
const ownerEvidenceId = "alexandria-current-menu";
const toastEvidenceId = "alexandria-current-toast";
const annapolisEvidenceId = "annapolis-comparison-menu";

const artifactKeys = new Set([
  "1:smoked-salmon-and-spinach-2-steak-and-asparagus",
  "2:smoked-salmon-and-spinach-2-steak-and-asparagus-5-crab-cake",
  "20:croutons-red-onion-herb-vinaigrette",
  "25:horseradish-provolone-crispy-onions",
  "44:single-or-double",
  "68:upgrades",
]);

const locationMismatchKeys = new Set([
  "6:augies-burger",
  "31:jumbo-lump-maryland-crab-cake-sandwich",
  "32:maryland-crab-dip",
  "33:maryland-crab-soup",
  "34:mason-fried-chicken",
  "38:potato-skins",
  "43:shrimp-po-boy",
  "62:pancake-shot",
  "64:sober-rockfish-fishbowl",
]);

const normalizedTargets = new Map([
  ["4:12oz-ribeye", ["12oz-ribeye"]],
  ["50:augies-standard", ["augies-standard"]],
  ["54:classic-eggs-benedict", ["classic-eggs-benedict"]],
]);

const variantTargets = new Map([
  ["13:buffalo", ["buffalo-cauliflower", "buffalo-combo", "buffalo-shrimp"]],
  ["22:french-onion-soup", ["julias-french-onion-soup"]],
  ["26:hummus", ["hummus-dip"]],
  ["56:eastern-shore", ["eastern-shore-mussels-or-clams"]],
  ["59:frites-with-trio-of-dipping-sauces", ["frites"]],
  ["60:green-curry", ["green-curry-mussels-or-clams"]],
  ["61:italian", ["italian-mussels-or-clams"]],
  ["66:steak-and-cheese-eggrolls", ["steak-and-cheese-egg-rolls"]],
]);

const exactTargetOverrides = new Map([
  ["8:augies-classic-wings-or-boneless", ["augies-classic-wings-or-boneless"]],
  ["9:augies-cobb-salad-gf", ["augies-cobb-salad"]],
  ["10:augies-huge-baked-potato-gf", ["augies-huge-baked-potato"]],
  ["11:beet-salad-gf", ["beet-salad"]],
  ["12:blackened-salmon-sandwich", ["blackened-salmon-sandwich"]],
  ["14:caesar-salad", ["caesar-salad"]],
  ["17:chicken-pot-pie-empanada", ["chicken-pot-pie-empanada"]],
  ["21:french-onion-grilled-cheese", ["french-onion-grilled-cheese"]],
  ["29:joshs-banging-burger", ["joshs-banging-burger"]],
  ["40:rockfish-gf", ["rockfish"]],
  ["41:salmon-gf", ["salmon"]],
  ["46:spicy-nduja-prawn-linguini", ["spicy-nduja-prawn-linguini"]],
  ["49:augies-fresh-baked-cookie", ["augies-fresh-baked-cookie"]],
  ["52:buffalo-cauliflower", ["buffalo-cauliflower"]],
  ["53:chicken-and-waffles", ["chicken-and-waffles"]],
  ["57:flourless-chocolate-cake-gf", ["flourless-chocolate-cake"]],
  ["65:speculoos-belgian-waffle", ["speculoos-belgian-waffle"]],
  ["67:steak-and-eggs-gf", ["steak-and-eggs"]],
  ["69:wings", ["augies-classic-wings-or-boneless"]],
]);

export function reconcileAugiesAlexandriaBaselineItems(baselineChecks, snapshot) {
  const itemsById = new Map((snapshot.items ?? []).map((item) => [item.id, item]));
  const itemChecks = baselineChecks.map((check) => {
    const key = check.auditItemKey;
    if (artifactKeys.has(key)) {
      return terminal(check, {
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: [ownerEvidenceId, annapolisEvidenceId],
        notes: "The frozen row is a heading, configuration choice, or continuation fragment rather than an independently orderable Alexandria product.",
      });
    }
    if (locationMismatchKeys.has(key)) {
      return terminal(check, {
        disposition: "location_mismatch",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: [annapolisEvidenceId, ownerEvidenceId],
        notes: "The frozen object cites only the Annapolis menu and does not belong in the location-scoped Alexandria record.",
      });
    }

    const disposition = normalizedTargets.has(key)
      ? "normalized_match"
      : variantTargets.has(key)
        ? "variant_match"
        : "exact_match";
    const targetIds = normalizedTargets.get(key) ?? variantTargets.get(key) ??
      exactTargetOverrides.get(key) ?? [check.baseline.itemId];
    const targets = targetIds.map((targetId) => {
      const target = itemsById.get(targetId);
      if (!target) throw new Error(`Missing current Augie's target ${targetId} for ${key}.`);
      return target;
    });
    const sourceEvidenceIds = unique(targets.flatMap((target) => [
      ownerEvidenceId,
      ...(target.sourceUrls.some((url) => /toasttab\.com/i.test(url)) ? [toastEvidenceId] : []),
    ]));
    return terminal(check, {
      disposition,
      allergenVerdict: "mismatch",
      sourceEvidenceIds,
      notes: [
        `Current target${targets.length === 1 ? "" : "s"}: ${targets.map((target) => target.name).join("; ")}.`,
        "The frozen row omitted the restaurant-issued kitchen-wide gluten cross-contact warning; repaired current contains signals and source provenance were reviewed separately.",
      ].join(" "),
    });
  });

  if (itemChecks.length !== 69) {
    throw new Error(`Expected 69 frozen Augie's rows, found ${itemChecks.length}.`);
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

function terminal(check, fields) {
  return { ...check, ...fields };
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
  const result = reconcileAugiesAlexandriaBaselineItems(
    baselineChecks,
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
