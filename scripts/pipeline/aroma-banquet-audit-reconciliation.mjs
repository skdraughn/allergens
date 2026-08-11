import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aromaBanquetRestaurantId } from "./aroma-banquet-audit-catalog.mjs";

const evidenceIds = Object.freeze([
  "official-aroma-banquet-online-menu",
  "official-aroma-banquet-dine-in-menu-pdf",
  "official-aroma-banquet-wix-catalog",
  "official-aroma-banquet-allergen-source-search",
]);

const artifactNames = new Set([
  "Get More Form Submissions",
  "Beats & Bites",
  "Perfume Making",
  "BIRYANI",
  "Deserts",
  "FUSION",
  "SEAFOOD",
  "TANDOORI",
  "TANDOORI BREADS",
  "House Dressings",
]);

const staleNames = new Set([
  "Chili Rellieno",
  "Salmon en Cilantro",
  "Seekh Kebab Taquitos",
  "Soft Tacos",
  "Spinach & Potato Taquitos",
]);

const nameMappings = new Map([
  [normalizeName("Chicken"), { currentName: "Chicken 65", disposition: "normalized_match" }],
]);

export function enrichAromaBanquetChecks(checks, frozenRestaurant) {
  if ((frozenRestaurant?.items ?? []).length !== 110) {
    throw new Error(`Aroma Banquet frozen target expected 110 rows, found ${frozenRestaurant?.items?.length ?? 0}.`);
  }
  return checks.map((check) => {
    const frozen = frozenRestaurant.items[check.baselineIndex];
    if (frozen?.id !== check.baseline.itemId) {
      throw new Error(`Aroma Banquet frozen baseline mismatch at ${check.auditItemKey}.`);
    }
    return {
      ...check,
      frozenDescription: frozen.description ?? null,
      frozenIngredientsText: frozen.ingredientsText ?? null,
      frozenInferredAllergenIds: (frozen.inferredAllergenSignals ?? []).map((signal) => signal.id),
    };
  });
}

export function reconcileAromaBanquetBaselineItems(checks, snapshot) {
  if (checks.length !== 110) {
    throw new Error(`Aroma Banquet reconciliation expected 110 frozen rows, found ${checks.length}.`);
  }
  if (snapshot.items?.length !== 99) {
    throw new Error(`Aroma Banquet corrected catalog expected 99 products, found ${snapshot.items?.length ?? 0}.`);
  }

  const currentByName = new Map(snapshot.items.map((row) => [normalizeName(row.name), row]));
  const matchedCurrentIds = new Set();
  let fixedSignalMismatchCount = 0;
  let provenanceMismatchCount = 0;
  let menuContentMismatchCount = 0;

  const itemChecks = checks.map((check) => {
    const baseline = check.baseline;
    if (artifactNames.has(baseline.name)) {
      return {
        ...check,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: [...evidenceIds],
        currentItemIds: [],
        notes: artifactNote(baseline.name),
      };
    }
    if (staleNames.has(baseline.name)) {
      return {
        ...check,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        menuContentVerdict: "not_applicable",
        sourceEvidenceIds: [...evidenceIds],
        currentItemIds: [],
        notes: "This product remains only in unreferenced Wix inventory. It is absent from both the restaurant-linked current dine-in PDF and the visible online-ordering menu and is removed as superseded catalog residue.",
      };
    }

    const mapping = nameMappings.get(normalizeName(baseline.name));
    const currentName = mapping?.currentName ?? baseline.name;
    const current = currentByName.get(normalizeName(currentName));
    if (!current) throw new Error(`Unclassified Aroma Banquet frozen row: ${baseline.name}.`);
    if (matchedCurrentIds.has(current.id)) {
      throw new Error(`Aroma Banquet frozen rows duplicate current product ${current.name}.`);
    }
    matchedCurrentIds.add(current.id);

    const fixedMatch = sameSet(baseline.allergens, current.allergens);
    const contactMatch = sameSet(baseline.mayContain, current.mayContain);
    const provenanceMatch = baseline.allergenSourceType === current.allergenSourceType;
    if (!fixedMatch || !contactMatch) fixedSignalMismatchCount += 1;
    if (!provenanceMatch) provenanceMismatchCount += 1;
    const menuMatch = baseline.name === current.name &&
      baseline.category === current.category &&
      normalizedText(check.frozenDescription) === normalizedText(current.description);
    if (!menuMatch) menuContentMismatchCount += 1;

    const disposition = mapping?.disposition ?? "exact_match";
    return {
      ...check,
      disposition,
      allergenVerdict: fixedMatch && contactMatch && provenanceMatch
        ? current.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
        : "mismatch",
      menuContentVerdict: menuMatch ? "verified" : "mismatch",
      sourceEvidenceIds: [...evidenceIds],
      currentItemIds: [current.id],
      notes: matchNote({ baseline, current, disposition, fixedMatch, contactMatch, provenanceMatch, menuMatch }),
    };
  });

  const omittedCurrentItems = snapshot.items.filter((row) => !matchedCurrentIds.has(row.id));
  return {
    restaurantId: aromaBanquetRestaurantId,
    itemChecks,
    omittedCurrentItems,
    counts: {
      dispositions: countValues(itemChecks, "disposition"),
      allergens: countValues(itemChecks, "allergenVerdict"),
      menuContent: countValues(itemChecks, "menuContentVerdict"),
      matchedBaselineItemCount: itemChecks.filter((row) => ["exact_match", "normalized_match"].includes(row.disposition)).length,
      matchedCurrentItemCount: matchedCurrentIds.size,
      artifactItemCount: itemChecks.filter((row) => row.disposition === "artifact").length,
      staleItemCount: itemChecks.filter((row) => row.disposition === "stale_extra").length,
      omittedCurrentItemCount: omittedCurrentItems.length,
      fixedSignalMismatchCount,
      provenanceMismatchCount,
      menuContentMismatchCount,
    },
  };
}

function artifactNote(name) {
  if (name === "House Dressings") {
    return "House Dressings is a current salad subheading followed by Caribbean mango, cilantro lime, and blood orange shallot choices; it is not a standalone purchasable menu item.";
  }
  if (["Beats & Bites", "Perfume Making"].includes(name)) {
    return "The generic site parser promoted an event page into the frozen food catalog. The current owner menu and ordering surface contain no product with this event title.";
  }
  if (name === "Get More Form Submissions") {
    return "The generic site parser promoted Wix form-plan boilerplate into the frozen food catalog. It is not restaurant menu content.";
  }
  return "The generic HTML parser promoted a current menu section heading to a standalone product. The reviewed catalog retains it only as category structure.";
}

function matchNote({ baseline, current, disposition, fixedMatch, contactMatch, provenanceMatch, menuMatch }) {
  const notes = [
    `Current restaurant-issued match: ${current.name} (${current.category}).`,
  ];
  if (disposition === "normalized_match") {
    notes.push(`The frozen parser truncated ${current.name} to ${baseline.name}; the description identifies the current product.`);
  }
  if (!fixedMatch || !contactMatch) {
    notes.push(`Frozen fixed/contact signals [${sorted(baseline.allergens).join(", ") || "none"}] / [${sorted(baseline.mayContain).join(", ") || "none"}] differ from the reviewed current signals [${sorted(current.allergens).join(", ") || "none"}] / [${sorted(current.mayContain).join(", ") || "none"}].`);
  }
  if (!provenanceMatch) {
    notes.push(`Frozen provenance ${baseline.allergenSourceType} changes to ${current.allergenSourceType}.`);
  }
  if (!menuMatch) {
    notes.push("The frozen generic category, item name, or description does not fully preserve the current restaurant-issued menu presentation.");
  }
  notes.push("No complete allergen matrix or item-level cross-contact statement was found; absence was not treated as allergen-free and mayContain remains empty.");
  return notes.join(" ");
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/gulab jamun\b/g, "gulab jamoon")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sameSet(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function sorted(values) {
  return [...(values ?? [])].sort();
}

function countValues(rows, field) {
  return Object.fromEntries([...new Set(rows.map((row) => row[field]))].map(
    (value) => [value, rows.filter((row) => row[field] === value).length],
  ));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const itemCheckPath = path.resolve(`data/restaurant-verification/item-checks/${aromaBanquetRestaurantId}.jsonl`);
  const [checkText, snapshotText, liveText] = await Promise.all([
    readFile(itemCheckPath, "utf8"),
    readFile(path.resolve(`data/restaurant-verification/repairs/${aromaBanquetRestaurantId}/corrected-menu.json`), "utf8"),
    readFile(path.resolve("src/data/generated/restaurants.generated.json"), "utf8"),
  ]);
  const repository = JSON.parse(liveText);
  const frozenRestaurant = repository.restaurants.find((row) => row.id === aromaBanquetRestaurantId);
  const recordedChecks = checkText.trim().split(/\r?\n/).map(JSON.parse);
  const checks = (frozenRestaurant?.items ?? []).length === 110
    ? enrichAromaBanquetChecks(recordedChecks, frozenRestaurant)
    : recordedChecks;
  if (checks.length !== 110 || checks.some((check) => !Object.hasOwn(check, "frozenDescription"))) {
    throw new Error("Aroma Banquet frozen reconciliation evidence is incomplete.");
  }
  const result = reconcileAromaBanquetBaselineItems(checks, JSON.parse(snapshotText));
  await writeFile(itemCheckPath, `${result.itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({
    ...result.counts,
    omittedCurrentItems: result.omittedCurrentItems.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      allergens: row.allergens,
    })),
  }, null, 2));
}
