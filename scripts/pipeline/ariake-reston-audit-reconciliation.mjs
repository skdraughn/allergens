import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ariakeRestonRestaurantId } from "./ariake-reston-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-ariake-reston-menu",
  "official-ariake-ordering-page",
  "ariake-reston-toast",
  "ariake-toast-jina-transport",
]);

const locationMismatchNames = new Set([
  "Albacore Tataki",
  "Salmon Tataki",
  "Shishito Peppers",
  "Alaskan Salmon Roll",
  "Tuna Tempura Roll",
  "15. Tendon",
  "Saba",
  "Salmon Skin Salad",
  "Sashimi Salad",
  "20. Salmon Sashimi Lunch",
]);

const explicitVariantMatches = Object.freeze({
  "12. Tekka or Salmon Don": ["12. Tekka Don *", "13. Salmon Don *"],
  "Tuna or Salmon Tataki Salad": ["Tuna Tataki Salad *", "Salmon Tataki Salad *"],
});

export function enrichAriakeRestonChecks(checks, frozenRestaurant) {
  if ((frozenRestaurant?.items ?? []).length !== 190) {
    throw new Error(`Ariake frozen target expected 190 rows, found ${frozenRestaurant?.items?.length ?? 0}.`);
  }
  return checks.map((check) => {
    const frozen = frozenRestaurant.items[check.baselineIndex];
    if (frozen?.id !== check.baseline.itemId) throw new Error(`Ariake frozen baseline mismatch at ${check.auditItemKey}.`);
    return {
      ...check,
      frozenDescription: frozen.description ?? null,
      frozenInferredAllergenIds: (frozen.inferredAllergenSignals ?? []).map((signal) => signal.id),
    };
  });
}

export function reconcileAriakeRestonBaselineItems(checks, snapshot) {
  if (checks.length !== 190) throw new Error(`Ariake reconciliation expected 190 frozen rows, found ${checks.length}.`);
  if (snapshot.items?.length !== 235) throw new Error(`Ariake corrected catalog expected 235 products, found ${snapshot.items?.length ?? 0}.`);
  const currentById = new Map(snapshot.items.map((row) => [row.id, row]));
  const currentByName = groupBy(snapshot.items, (row) => row.name);
  const currentByKey = groupBy(snapshot.items, (row) => matchKey(row.name));
  const matchedCurrentIds = new Set();
  let fixedSignalMismatchCount = 0;
  let provenanceMismatchCount = 0;
  let menuContentMismatchCount = 0;

  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (isArtifact(baseline)) {
      return resolvedNonCurrent(
        check,
        "artifact",
        baseline.name === "FAIRFAX ONLINE ORDERING HOURS:"
          ? "The frozen parser promoted an ordering-page hours heading to a sushi product."
          : "The frozen parser promoted a nested dinner-bento component or sushi-lunch option to a standalone product; the current menu publishes the configurable parent product instead.",
      );
    }
    if (locationMismatchNames.has(baseline.name)) {
      return resolvedNonCurrent(
        check,
        "location_mismatch",
        "This row came only from the Fairfax menu and has no equivalent current Reston product. It does not belong in the Reston-scoped catalog.",
      );
    }

    const currentItems = resolveCurrentItems(baseline, snapshot.items, currentByName, currentByKey);
    if (currentItems.length === 0) {
      return resolvedNonCurrent(
        check,
        "stale_extra",
        "This frozen row has no defensible current Reston owner-menu or linked-Toast match.",
      );
    }
    currentItems.forEach((row) => matchedCurrentIds.add(row.id));
    const currentFixed = unique(currentItems.flatMap((row) => row.allergens));
    const currentContact = unique(currentItems.flatMap((row) => row.mayContain));
    const currentProvenance = unique(currentItems.map((row) => row.allergenSourceType));
    const fixedMatch = sameSet(baseline.allergens, currentFixed);
    const contactMatch = sameSet(baseline.mayContain, currentContact);
    const provenanceMatch = currentProvenance.length === 1 && baseline.allergenSourceType === currentProvenance[0];
    if (!fixedMatch) fixedSignalMismatchCount += 1;
    if (!provenanceMatch) provenanceMismatchCount += 1;
    const menuMatch = currentItems.length === 1 &&
      baseline.name === currentItems[0].name &&
      expectedCategory(baseline) === currentItems[0].category &&
      normalizedText(check.frozenDescription) === normalizedText(currentItems[0].description);
    if (!menuMatch) menuContentMismatchCount += 1;
    const disposition = currentItems.length > 1
      ? "variant_match"
      : baseline.name === currentItems[0].name ? "exact_match" : "normalized_match";
    return {
      ...check,
      disposition,
      allergenVerdict: fixedMatch && contactMatch && provenanceMatch
        ? (currentProvenance[0] === "unavailable" ? "accurately_unavailable" : "verified")
        : "mismatch",
      menuContentVerdict: menuMatch ? "verified" : "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: currentItems.map((row) => row.id),
      notes: [
        `Current Reston match${currentItems.length > 1 ? "es" : ""}: ${currentItems.map((row) => `${row.name} (${row.category})`).join("; ")}.`,
        ...(fixedMatch ? [] : [`Frozen fixed signals [${sorted(baseline.allergens).join(", ") || "none"}] differ from reviewed current positive signals [${sorted(currentFixed).join(", ") || "none"}].`]),
        ...(provenanceMatch ? [] : [`Frozen provenance ${baseline.allergenSourceType} differs from current reviewed provenance [${currentProvenance.join(", ")}].`]),
        ...(menuMatch ? [] : ["The frozen name, category, description, variant scope, or source location does not fully match the current Reston product."]),
        "No absent term is treated as a negative allergen or cross-contact assurance.",
      ].join(" "),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((row) => !matchedCurrentIds.has(row.id));
  return {
    restaurantId: ariakeRestonRestaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition"),
      allergens: countValues(itemChecks, "allergenVerdict"),
      menuContent: countValues(itemChecks, "menuContentVerdict"),
      matchedBaselineItemCount: itemChecks.filter((row) => ["exact_match", "normalized_match", "variant_match"].includes(row.disposition)).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      artifactItemCount: itemChecks.filter((row) => row.disposition === "artifact").length,
      locationMismatchItemCount: itemChecks.filter((row) => row.disposition === "location_mismatch").length,
      staleItemCount: itemChecks.filter((row) => row.disposition === "stale_extra").length,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      provenanceMismatchCount,
      menuContentMismatchCount,
    },
  };
}

function resolveCurrentItems(baseline, allItems, currentByName, currentByKey) {
  const variantNames = explicitVariantMatches[baseline.name];
  if (variantNames) return variantNames.map((name) => requireOne(currentByName.get(name), name));
  const exact = currentByName.get(baseline.name) ?? [];
  if (exact.length > 0) return [bestCategoryMatch(baseline, exact)];
  const aliases = {
    "Fried Ice Cream": "Fried Tempura Ice Cream",
    "14. Unadon": "14. Una Don",
    "Miso Nabayaki Udon": "Miso Nabeyaki Udon",
    "Sushi & Udon": "Sushi & Udon (no miso soup)",
    "Hamachi Maki": "Hamachi Maki Yellowtail",
    "Kampyo Maki": "Kampyo Maki Gourd Strip",
    "Kappa Maki": "Kappa Maki Cucumber",
    "Oshinko Maki": "Oshinko Maki Pickled Radish",
    "Tekka Makki": "Tekka Maki Tuna",
    "Ume Shiso Maki": "Ume Shiso Maki Sour Plum",
  };
  if (aliases[baseline.name]) return [requireOne(currentByName.get(aliases[baseline.name]), aliases[baseline.name])];
  const candidates = currentByKey.get(matchKey(baseline.name)) ?? [];
  return candidates.length > 0 ? [bestCategoryMatch(baseline, candidates)] : [];
}

function bestCategoryMatch(baseline, candidates) {
  const expected = expectedCategory(baseline);
  return candidates.find((row) => row.category === expected) ?? candidates[0];
}

function expectedCategory(baseline) {
  const category = baseline.category;
  if (category === "APPETIZER - HOT") return "Hot Appetizer";
  if (category === "APPETIZER - COLD") return "Cold Appetizer";
  if (category === "SOUP AND SALAD") return "Soup & Salad";
  if (category === "ENTREE - FROM OUR GRILL") return "Grill";
  if (category === "ENTREE - FROM OUR FRYER") {
    return /katsu|curry/i.test(baseline.name) ? "Katsu" : "Tempura";
  }
  if (category === "NOODLES" || category === "NABE") return "Noodles & Nabe";
  if (category === "BOWL") return "Bowl";
  if (category === "From our Sushi Bar") return /sashimi/i.test(baseline.name) ? "Sashimi Combo" : "Sushi Combo";
  if (category === "Lunch Special") return "Lunch Special";
  if (category === "Donburi") return "Lunch Donburi";
  if (category === "Sushi Lunch") return "Sushi Lunch";
  if (category === "Special Dishes") return "Lunch Special Dishes";
  if (/^Appetizers - \$/.test(category)) return "Happy Hour Appetizers";
  if (/^Nigiri Sushi or Sashimi/.test(category)) return "Nigiri Sushi or Sashimi";
  if (/^Maki Sushi/.test(category)) return "Maki Sushi";
  if (/^Rolls with Rice Outside/.test(category)) return "Rolls w/ Rice Outside";
  if (category === "Chef's Special Rolls") return "Chef's Special Rolls";
  if (category === "DESSERTS") return "Ice Cream";
  return category;
}

function isArtifact(baseline) {
  return baseline.name === "FAIRFAX ONLINE ORDERING HOURS:" ||
    baseline.name === "a) with 6 pcs California Roll OR" ||
    baseline.category === "DINNER BENTO BOX (BOXED MEAL)";
}

function resolvedNonCurrent(check, disposition, notes) {
  return {
    ...check,
    disposition,
    allergenVerdict: "not_applicable",
    menuContentVerdict: "not_applicable",
    sourceEvidenceIds: [...evidenceIds],
    currentItemIds: [],
    notes,
  };
}

function matchKey(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/^\d+[a-z]?\.\s*/, "")
    .replace(/\s*\*\s*$/g, "")
    .replace(/\s*\((?:happy hour|app|d|seasonal)\)\s*$/gi, "")
    .replace(/\bmakki\b/g, "maki")
    .replace(/\bnabayaki\b/g, "nabeyaki")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
function normalizedText(value) { return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase(); }
function requireOne(rows, name) {
  if (!rows?.length) throw new Error(`Missing expected current Ariake product ${name}.`);
  return rows[0];
}
function groupBy(rows, keyFor) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const values = result.get(key) ?? [];
    values.push(row);
    result.set(key, values);
  }
  return result;
}
function sameSet(left, right) { return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right)); }
function sorted(values) { return [...(values ?? [])].sort(); }
function unique(values) { return [...new Set(values)]; }
function countValues(rows, field) {
  return Object.fromEntries([...new Set(rows.map((row) => row[field]))].map(
    (value) => [value, rows.filter((row) => row[field] === value).length],
  ));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const checkPath = path.resolve(`data/restaurant-verification/item-checks/${ariakeRestonRestaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(checkPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${ariakeRestonRestaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const repository = JSON.parse(liveText);
  const frozenRestaurant = repository.restaurants.find((row) => row.id === ariakeRestonRestaurantId);
  const checks = enrichAriakeRestonChecks(checkText.trim().split(/\r?\n/).map(JSON.parse), frozenRestaurant);
  const result = reconcileAriakeRestonBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(checkPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((row) => `${row.category}: ${row.name}`),
  }, null, 2));
}
