import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "anju-dc";

const evidenceByUrl = new Map([
  ["https://www.anjurestaurant.com/dine-in", "official-anju-dinner"],
  ["https://www.anjurestaurant.com/brunch", "official-anju-brunch"],
  ["https://www.anjurestaurant.com/happy-hour", "official-anju-happy-hour"],
  ["https://order.toasttab.com/online/anju", "linked-anju-toast-order"],
]);

const currentCatalogEvidenceIds = [
  "official-anju-dinner",
  "official-anju-brunch",
  "official-anju-happy-hour",
];

const artifactEvidenceIds = Object.freeze({
  "optional sub impossible meat": ["official-anju-brunch"],
  "1530 day kimchi": ["official-anju-dinner"],
  "5 rice porridge scallion crispy shallots": ["official-anju-brunch"],
  "5gelato black sesame or lemon or honey buttersorbet seasonal": ["official-anju-dinner"],
  "6collard green kimchi": ["official-anju-dinner"],
  "6yeolmu kimchi": ["official-anju-dinner"],
});

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
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

function evidenceIdsForCurrent(item) {
  return [...new Set((item.sourceUrls ?? []).map((url) => evidenceByUrl.get(url)).filter(Boolean))];
}

function countValues(rows, field, values) {
  return Object.fromEntries(
    values.map((value) => [value, rows.filter((row) => row[field] === value).length])
      .filter(([, count]) => count > 0),
  );
}

export function enrichAnjuChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const baseline = { ...check.baseline };
    const embeddedDescription = baseline.description;
    const embeddedIngredientsText = baseline.ingredientsText;
    delete baseline.description;
    delete baseline.ingredientsText;
    const item = (restaurant?.items ?? []).length === 45
      ? restaurant.items?.[check.baselineIndex]
      : null;
    if (item && item.id !== baseline.itemId) {
      throw new Error(`Anju frozen baseline index ${check.baselineIndex} no longer matches ${check.baseline?.itemId}.`);
    }
    return {
      ...check,
      baseline,
      frozenDescription: check.frozenDescription ?? embeddedDescription ?? item?.description ?? null,
      frozenIngredientsText: check.frozenIngredientsText ?? embeddedIngredientsText ?? item?.ingredientsText ?? null,
    };
  });
}

export function reconcileAnjuBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedIds = new Set();

  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const key = normalize(baselineName);
    const artifactEvidence = artifactEvidenceIds[key];
    if (artifactEvidence) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: artifactEvidence,
        currentItemIds: [],
        notes: key === "optional sub impossible meat"
          ? "This is an inline Brunch Smash Burger substitution instruction, not a standalone menu product. The frozen parser also attached Shrimp Juk as its description and promoted the shrimp allergen to the modifier."
          : "This malformed row concatenates a neighboring price with a product name or description. It is not a current restaurant-issued standalone product.",
      };
    }

    const current = currentByName.get(key);
    if (!current) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: currentCatalogEvidenceIds,
        currentItemIds: [],
        notes: "This frozen product is absent from all three current restaurant-issued food-menu surfaces (dinner, brunch, and happy hour). It is removed as stale rather than carrying forward historical ingredients or allergens.",
      };
    }

    matchedIds.add(current.id);
    const exactName = baselineName === current.name;
    const baselineDescription = normalize(check.frozenDescription);
    const currentDescription = normalize(current.description);
    const descriptionMatches = baselineDescription === currentDescription;
    const categoryMatches = normalize(check.baseline?.category) === normalize(current.category);
    const allergensMatch = equalSignals(check.baseline?.allergens, current.allergens);
    const mayContainMatches = equalSignals(check.baseline?.mayContain, current.mayContain);
    const allergenVerdict = allergensMatch && mayContainMatches ? "verified" : "mismatch";
    const menuContentVerdict = descriptionMatches && categoryMatches ? "verified" : "mismatch";
    const frozenSignals = sorted(check.baseline?.allergens).join(", ") || "none";
    const currentSignals = sorted(current.allergens).join(", ") || "none";
    const notes = [];
    if (menuContentVerdict === "mismatch") {
      notes.push("The current product name was reconciled, but the frozen category or description was truncated, shifted from a neighboring row, or no longer matches the current restaurant-issued text.");
    }
    if (allergenVerdict === "mismatch") {
      notes.push(`The frozen positive signal [${frozenSignals}] differs from the current directly supported signal [${currentSignals}]. Missing menu terms are not negative assurances; ingredient-intelligence inference remains separate from official source data.`);
    }
    if (notes.length === 0) {
      notes.push("The frozen product identity, current restaurant-issued description, and directly supported positive allergen signal reconcile with the current source.");
    }

    return {
      ...check,
      disposition: exactName ? "exact_match" : "normalized_match",
      allergenVerdict,
      menuContentVerdict,
      sourceEvidenceIds: evidenceIdsForCurrent(current),
      currentItemIds: [current.id],
      notes: notes.join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((item) => !matchedIds.has(item.id));
  return {
    restaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition", [
        "exact_match",
        "normalized_match",
        "variant_match",
        "missing_from_source",
        "stale_extra",
        "artifact",
        "location_mismatch",
      ]),
      allergens: countValues(itemChecks, "allergenVerdict", [
        "verified",
        "accurately_unavailable",
        "mismatch",
        "not_applicable",
      ]),
      menuContent: countValues(itemChecks, "menuContentVerdict", [
        "verified",
        "mismatch",
        "not_applicable",
      ]),
      matchedCurrentItemCount: matchedIds.size,
      omittedCurrentItemCount: omittedCurrentItems.length,
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const baselinePath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const snapshotPath = path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`);
  const [baselineText, snapshotText, liveText] = await Promise.all([
    readFile(baselinePath, "utf8"),
    readFile(snapshotPath, "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const liveRestaurants = Array.isArray(liveData) ? liveData : liveData.restaurants;
  const frozenRestaurant = liveRestaurants.find((row) => row.id === restaurantId);
  const enrichedChecks = enrichAnjuChecksFromFrozenRestaurant(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    frozenRestaurant,
  );
  const result = reconcileAnjuBaselineItems(
    enrichedChecks,
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
