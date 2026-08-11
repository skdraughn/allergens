import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { matchKey1983 } from "./1983-chinese-cuisine-audit-catalog.mjs";

const restaurantId = "osm-1983-chinese-cuisine-10746777097";

export function reconcile1983BaselineItems(baselineChecks, snapshot) {
  const currentByKey = new Map(
    (snapshot.items ?? []).map((item) => [matchKey1983(item.name), item]),
  );
  const reconciled = (baselineChecks ?? []).map((check) => {
    const baseline = check.baseline;
    if (baseline.itemId === "noodles-and-fried-rice" && baseline.name === "Noodles & Fried Rice") {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["linked-toast-current"],
        notes: "A Toast section heading was incorrectly emitted as a menu item.",
      };
    }

    const current = currentByKey.get(matchKey1983(baseline.name));
    if (!current) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-home", "linked-toast-current"],
        notes: "The frozen row could not be matched to either current restaurant-controlled menu surface.",
      };
    }

    const disposition = baseline.name === current.name ? "exact_match" : "normalized_match";
    const baselineAllergens = sorted(baseline.allergens);
    const currentAllergens = sorted(current.allergens);
    const baselineMayContain = sorted(baseline.mayContain);
    const currentMayContain = sorted(current.mayContain);
    const sameSignals =
      arraysEqual(baselineAllergens, currentAllergens) &&
      arraysEqual(baselineMayContain, currentMayContain);
    const allergenVerdict = sameSignals
      ? current.allergenSourceType === "unavailable"
        ? "accurately_unavailable"
        : "verified"
      : "mismatch";
    const evidenceIds = current.sourceUrls.some((url) => url === "https://1983chinesecuisine.com/")
      ? ["official-home", "linked-toast-current"]
      : ["linked-toast-current"];

    return {
      ...check,
      disposition,
      allergenVerdict,
      sourceEvidenceIds: evidenceIds,
      notes: [
        `Current match: ${current.name}.`,
        `Baseline category: ${baseline.category ?? "none"}; current category: ${current.category}.`,
        `Baseline contains: ${list(baselineAllergens)}; current contains: ${list(currentAllergens)}.`,
        `Baseline may contain: ${list(baselineMayContain)}; current may contain: ${list(currentMayContain)}.`,
      ].join(" "),
    };
  });

  return {
    restaurantId,
    itemChecks: reconciled,
    counts: {
      dispositions: countBy(reconciled, "disposition"),
      allergens: countBy(reconciled, "allergenVerdict"),
    },
  };
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function list(values) {
  return values.length > 0 ? values.join(", ") : "none / unavailable";
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  }
  return counts;
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
  const baselineChecks = baselineText.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const result = reconcile1983BaselineItems(baselineChecks, JSON.parse(snapshotText));
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
