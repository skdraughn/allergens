import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "andys-pizza-dc";
const exactMenuEvidenceIds = [
  "official-andys-adams-morgan-menu",
  "official-andys-adams-location",
];
const locationScopeEvidenceIds = [
  "official-andys-adams-morgan-menu",
  "official-andys-all-menus",
  "official-andys-adams-location",
];

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

function countValues(rows, field, values) {
  return Object.fromEntries(
    values.map((value) => [value, rows.filter((row) => row[field] === value).length])
      .filter(([, count]) => count > 0),
  );
}

export function reconcileAndysPizzaAdamsMorganBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const otherLocationByName = new Map(
    Object.entries(snapshot.otherLocationItemLocations ?? {})
      .map(([name, locations]) => [normalize(name), { name, locations }]),
  );
  const matchedIds = new Set();

  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const key = normalize(baselineName);

    if (key === normalize("Whole Pie Toppings:")) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: exactMenuEvidenceIds,
        currentItemIds: [],
        notes: "The current Adams Morgan structured menu renders Whole Pie Toppings as a price-less list of configurable topping modifiers, not a standalone purchasable product.",
      };
    }

    const current = currentByName.get(key);
    if (!current) {
      const otherLocation = otherLocationByName.get(key);
      if (otherLocation) {
        return {
          ...check,
          disposition: "location_mismatch",
          allergenVerdict: "not_applicable",
          sourceEvidenceIds: locationScopeEvidenceIds,
          currentItemIds: [],
          otherLocationNames: otherLocation.locations,
          notes: `This product appears on Andy's Pizza menu(s) for ${otherLocation.locations.join(", ")}, but it is absent from the current exact-location Adams Morgan menu. Other-location ingredients or dietary labels cannot be attributed to 2465 18th St NW.`,
        };
      }
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: locationScopeEvidenceIds,
        currentItemIds: [],
        notes: "No current exact-location or other-location structured Andy's Pizza menu contains this row.",
      };
    }

    matchedIds.add(current.id);
    const categoryMatches = clean(check.baseline?.category) === current.category;
    const allergensMatch = equalSignals(check.baseline?.allergens, current.allergens);
    const mayContainMatches = equalSignals(check.baseline?.mayContain, current.mayContain);
    const allergenVerdict = allergensMatch && mayContainMatches ? "verified" : "mismatch";
    return {
      ...check,
      disposition: categoryMatches ? "exact_match" : "variant_match",
      allergenVerdict,
      sourceEvidenceIds: exactMenuEvidenceIds,
      currentItemIds: [current.id],
      notes: allergenVerdict === "mismatch"
        ? `The frozen signal [${sorted(check.baseline?.allergens).join(", ") || "none"}] omitted or misstated the current restaurant-issued positive signal [${sorted(current.allergens).join(", ") || "none"}]. Andy's universal 72-hour sourdough crust description applies to current pizza rows; missing terms are not negative assurances and no cross-contact claim is published.`
        : "The frozen menu identity, category, and positive allergen signal match the current exact-location Adams Morgan menu.",
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
      matchedCurrentItemCount: matchedIds.size,
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
  const result = reconcileAndysPizzaAdamsMorganBaselineItems(
    baselineText.trim().split(/\r?\n/).map(JSON.parse),
    JSON.parse(snapshotText),
  );
  await writeFile(
    baselinePath,
    `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
  console.log(JSON.stringify(result.counts, null, 2));
}
