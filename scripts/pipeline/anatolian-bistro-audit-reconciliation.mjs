import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "osm-anatolian-bistro-6230019077";
const menuEvidenceIds = [
  "official-anatolian-lunch",
  "official-anatolian-dinner",
  "official-anatolian-order",
];
const identityEvidenceIds = ["official-anatolian-home", "official-anatolian-menu-index"];

const explicitArtifacts = new Set([
  "Door Dash",
  "MARKER’S MARK 12 OLD FASHIONED",
  "Northern Virginia Magazine",
  "NoVA Magazine Review",
  "Soup & Salads",
  "Tripadvisor",
  "Yelp",
].map(normalize));

const historicalDuplicates = new Set([
  "ANATOLIAN VEGETABLE PLATE",
  "BEEF FILET MIGNON SHISH",
  "Chicken shisH",
  "Falafel",
  "Kabak tatlisi",
  "Kazandibi",
  "LAMB CHOPS",
  "LAMB SHISH KEBAB",
  "SALMON",
  "Sultan chicken",
  "Tektas spicy chicken",
  "White rice",
].map(normalize));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function equalSignals(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function groupBy(items, keyFor) {
  const result = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const bucket = result.get(key) ?? [];
    bucket.push(item);
    result.set(key, bucket);
  }
  return result;
}

function dispositionCounts(rows) {
  return Object.fromEntries(
    [
      "exact_match",
      "normalized_match",
      "variant_match",
      "missing_from_source",
      "stale_extra",
      "artifact",
      "location_mismatch",
    ].map((value) => [value, rows.filter((row) => row.disposition === value).length])
      .filter(([, count]) => count > 0),
  );
}

function allergenCounts(rows) {
  return Object.fromEntries(
    ["verified", "accurately_unavailable", "mismatch", "not_applicable"]
      .map((value) => [value, rows.filter((row) => row.allergenVerdict === value).length])
      .filter(([, count]) => count > 0),
  );
}

export function reconcileAnatolianBistroBaselineItems(checks, snapshot) {
  const currentByName = groupBy(snapshot.items, (item) => normalize(item.name));
  const currentByDescription = groupBy(
    snapshot.items.filter((item) => item.description),
    (item) => normalize(item.description),
  );
  const matchedCurrentIds = new Set();

  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const normalizedBaselineName = normalize(baselineName);
    const exactCurrent = currentByName.get(normalizedBaselineName) ?? [];
    const descriptionParents = currentByDescription.get(normalizedBaselineName) ?? [];

    if (explicitArtifacts.has(normalizedBaselineName) || descriptionParents.length > 0) {
      const isDescriptionFragment = descriptionParents.length > 0;
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: [...menuEvidenceIds, ...identityEvidenceIds],
        currentItemIds: [],
        artifactOfCurrentItemIds: descriptionParents.map((item) => item.id),
        notes: isDescriptionFragment
          ? `This frozen row is the description of ${descriptionParents.map((item) => `${item.category}/${item.name}`).join(" and ")}, not a separately published product.`
          : baselineName === "MARKER’S MARK 12 OLD FASHIONED"
            ? "This is an alcohol-only cocktail row that was misclassified as a dessert and does not belong in the retained food and nonalcoholic catalog."
            : "This is site navigation, source-link, review, or promotional page content rather than a published menu product.",
      };
    }

    if (historicalDuplicates.has(normalizedBaselineName)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: menuEvidenceIds,
        currentItemIds: [],
        notes: "This unlabelled historical row duplicates the current item-specific GF presentation already represented by a separate frozen row; the current restaurant-issued menu publishes only the GF-labelled name.",
      };
    }

    if (exactCurrent.length === 0) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: menuEvidenceIds,
        currentItemIds: [],
        notes: "No current Anatolian Bistro lunch, dinner, or pickup-order surface publishes this historical food row.",
      };
    }

    for (const item of exactCurrent) matchedCurrentIds.add(item.id);
    const signalVariants = new Map(
      exactCurrent.map((item) => [JSON.stringify(sorted(item.allergens)), item.allergens]),
    );
    if (signalVariants.size !== 1) {
      throw new Error(
        `Current Anatolian Bistro meal-period variants disagree on allergens for ${baselineName}.`,
      );
    }
    const currentAllergens = [...signalVariants.values()][0];
    const currentMayContain = exactCurrent[0].mayContain;
    const allergensMatch = equalSignals(check.baseline?.allergens, currentAllergens);
    const mayContainMatch = equalSignals(check.baseline?.mayContain, currentMayContain);
    const currentUnavailable = exactCurrent.every(
      (item) => item.allergenSourceType === "unavailable",
    );
    const allergenVerdict = allergensMatch && mayContainMatch
      ? currentUnavailable ? "accurately_unavailable" : "verified"
      : "mismatch";
    const categoryList = [...new Set(exactCurrent.map((item) => item.category))];

    return {
      ...check,
      disposition: "variant_match",
      allergenVerdict,
      sourceEvidenceIds: menuEvidenceIds,
      currentItemIds: exactCurrent.map((item) => item.id),
      notes: allergenVerdict === "mismatch"
        ? `The frozen signal [${sorted(check.baseline?.allergens).join(", ") || "none"}] does not match the current restaurant-issued positive signal [${sorted(currentAllergens).join(", ") || "none"}] for ${categoryList.join(" and ")}. Missing menu terms are not negative assurances, item-specific GF labels are not cross-contact claims, and optional add-ons are not fixed ingredients.`
        : exactCurrent.length > 1
          ? `The frozen generic-category row represents ${exactCurrent.length} current meal-period products (${categoryList.join(" and ")}); their fixed allergen semantics agree.`
          : `The formulation is current, but the frozen generic or malformed category is replaced by ${categoryList[0]}. Its fixed allergen semantics match the current restaurant-issued evidence.`,
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedCurrentIds.has(item.id));
  return {
    restaurantId,
    itemChecks,
    matchedCurrentItemCount: matchedCurrentIds.size,
    omittedCurrentItems,
    counts: {
      dispositions: dispositionCounts(itemChecks),
      allergens: allergenCounts(itemChecks),
      matchedCurrentItemCount: matchedCurrentIds.size,
      omittedCurrentItemCount: omittedCurrentItems.length,
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
  const result = reconcileAnatolianBistroBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
    })),
  }, null, 2));
}
