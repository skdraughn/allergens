import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const restaurantId = "annabelle-dc";
const currentEvidenceIds = ["official-annabelle-dinner-dessert", "official-annabelle-bar-bites"];

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripLabels(value) {
  return clean(String(value ?? "").replace(/\s*(?:\([ndgsv]\))+\s*$/gi, ""));
}

function normalize(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
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

function countValues(rows, field, values) {
  return Object.fromEntries(values.map((value) => [value, rows.filter((row) => row[field] === value).length]).filter(([, count]) => count));
}

export function enrichAnnabelleChecksFromFrozenRestaurant(checks, restaurant) {
  return checks.map((check) => {
    const baseline = { ...check.baseline };
    const embeddedDescription = baseline.description;
    delete baseline.description;
    delete baseline.ingredientsText;
    const item = (restaurant?.items ?? []).length === 26 ? restaurant.items[check.baselineIndex] : null;
    if (item && item.id !== baseline.itemId) {
      throw new Error(`Annabelle frozen baseline index ${check.baselineIndex} no longer matches ${baseline.itemId}.`);
    }
    return {
      ...check,
      baseline,
      frozenDescription: check.frozenDescription ?? embeddedDescription ?? item?.description ?? null,
    };
  });
}

export function reconcileAnnabelleBaselineItems(checks, snapshot) {
  const currentByName = new Map(snapshot.items.map((item) => [normalize(item.name), item]));
  const matchedIds = new Set();
  const staleNames = new Set([
    "branzino",
    "grilled venison",
    "madai crudo",
    "toasted freekeh salad",
  ]);

  const itemChecks = checks.map((check) => {
    const baselineName = clean(check.baseline?.name);
    const strippedName = stripLabels(baselineName);
    const key = normalize(strippedName);
    if (key === "tentsuyu sauce") {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: ["official-annabelle-bar-bites"],
        currentItemIds: [],
        notes: "Tentsuyu Sauce is the description of Seasonal Vegetable Tempura. The frozen parser promoted it to a product and then attached the following MF Sliders description and allergens.",
      };
    }
    if (staleNames.has(key)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: currentEvidenceIds,
        currentItemIds: [],
        notes: "This frozen seasonal product is absent from Annabelle's current July 11, 2026 dinner/dessert menu and current Bar Bites page.",
      };
    }

    const current = currentByName.get(key);
    if (!current) {
      return {
        ...check,
        disposition: "missing_from_source",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: currentEvidenceIds,
        currentItemIds: [],
        notes: "No current exact-name product was found after removing only Annabelle's published allergen suffixes.",
      };
    }

    matchedIds.add(current.id);
    const descriptionMatches = normalize(check.frozenDescription) === normalize(current.description);
    const categoryMatches = normalize(check.baseline?.category) === normalize(current.category);
    const allergenVerdict = equalSignals(check.baseline?.allergens, current.allergens) && equalSignals(check.baseline?.mayContain, current.mayContain)
      ? "verified"
      : "mismatch";
    const menuContentVerdict = descriptionMatches && categoryMatches ? "verified" : "mismatch";
    const evidenceId = current.sourceUrls?.includes("https://annabelledc.com/easter-brunch-menu")
      ? "official-annabelle-bar-bites"
      : "official-annabelle-dinner-dessert";
    const notes = [];
    if (menuContentVerdict === "mismatch") notes.push("The matched frozen row has a truncated continuation description or category mismatch compared with the current restaurant-issued layout.");
    if (allergenVerdict === "mismatch") {
      notes.push(`The frozen signal [${sorted(check.baseline?.allergens).join(", ") || "none"}] differs from the current positive signal [${sorted(current.allergens).join(", ") || "none"}] supported by the item legend and text.`);
    }
    if (!notes.length) notes.push("The frozen product identity, description, and positive allergen signal reconcile with the current source.");
    return {
      ...check,
      disposition: baselineName === current.name ? "exact_match" : "normalized_match",
      allergenVerdict,
      menuContentVerdict,
      sourceEvidenceIds: [evidenceId],
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
      dispositions: countValues(itemChecks, "disposition", ["exact_match", "normalized_match", "stale_extra", "artifact", "missing_from_source"]),
      allergens: countValues(itemChecks, "allergenVerdict", ["verified", "mismatch", "not_applicable"]),
      menuContent: countValues(itemChecks, "menuContentVerdict", ["verified", "mismatch", "not_applicable"]),
      matchedCurrentItemCount: matchedIds.size,
      omittedCurrentItemCount: omittedCurrentItems.length,
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${restaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${restaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const liveData = JSON.parse(liveText);
  const liveRestaurant = (Array.isArray(liveData) ? liveData : liveData.restaurants).find((row) => row.id === restaurantId);
  const checks = enrichAnnabelleChecksFromFrozenRestaurant(checkText.trim().split(/\r?\n/).map(JSON.parse), liveRestaurant);
  const result = reconcileAnnabelleBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((item) => item.name),
  }, null, 2));
}
