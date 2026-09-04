#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const targetIds = ["longhorn-steakhouse", "red-lobster", "yard-house"];
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const verificationRoot = path.join(root, "data/restaurant-verification");
const freshRoot = path.join(
  verificationRoot,
  "reports/source-parity-audit/fresh",
);
const reportPath = path.join(
  verificationRoot,
  "reports/darden-direct-cross-contact-repair.json",
);
const repository = readJson(generatedPath);
const generatedAt = new Date().toISOString();
const repairs = [];
const touched = new Map();

for (const restaurantId of targetIds) {
  const restaurant = repository.restaurants.find((entry) => entry.id === restaurantId);
  const freshPath = path.join(freshRoot, `${restaurantId}.json`);
  const dossierPath = path.join(verificationRoot, "restaurants", `${restaurantId}.json`);
  const checksPath = path.join(verificationRoot, "item-checks", `${restaurantId}.jsonl`);

  if (!restaurant || !fs.existsSync(freshPath)) {
    throw new Error(`Missing current or source-parity record for ${restaurantId}.`);
  }

  const fresh = readJson(freshPath).restaurant;
  const dossier = readJson(dossierPath);
  const checks = readJsonLines(checksPath);
  const currentById = new Map((restaurant.items ?? []).map((item) => [item.id, item]));
  const canonicalById = new Map(
    (dossier.currentCatalog?.products ?? []).map((product) => [
      product.currentProductKey,
      product,
    ]),
  );
  const freshIds = new Set((fresh.items ?? []).map((item) => item.id));

  for (const sourceItem of fresh.items ?? []) {
    const currentItem = currentById.get(sourceItem.id);
    const canonicalProduct = canonicalById.get(sourceItem.id);
    if (!currentItem || !canonicalProduct) continue;
    if (
      sourceItem.allergenSourceType !== "official-allergen-menu" ||
      currentItem.allergenSourceType !== "official-allergen-menu"
    ) continue;

    const sourceDirect = unique(sourceItem.allergens ?? []).sort();
    const currentDirect = unique(currentItem.allergens ?? []).sort();
    const currentCrossContact = unique([
      ...(currentItem.mayContain ?? []),
      ...(currentItem.mayContainAllergens ?? []),
    ]).sort();
    const lostToCrossContact = sourceDirect.filter(
      (allergen) =>
        !currentDirect.includes(allergen) && currentCrossContact.includes(allergen),
    );
    if (lostToCrossContact.length === 0) continue;

    const restoredDirect = unique([...currentDirect, ...sourceDirect]).sort();
    const restoredCrossContact = unique(sourceItem.mayContain ?? [])
      .filter((allergen) => !restoredDirect.includes(allergen))
      .sort();

    currentItem.allergens = restoredDirect;
    currentItem.mayContain = restoredCrossContact;
    if ("mayContainAllergens" in currentItem) {
      currentItem.mayContainAllergens = restoredCrossContact;
    }
    currentItem.allergenAuthorityTier = "restaurant_issued";
    currentItem.sourceSummary =
      "Reviewed official row-level allergen matrix evidence; preparation markers remain separate cross-contact warnings.";

    canonicalProduct.containsAllergens = restoredDirect;
    canonicalProduct.mayContainAllergens = restoredCrossContact;
    canonicalProduct.allergenSourceType = "official-allergen-menu";
    canonicalProduct.allergenAuthorityTier = "restaurant_issued";
    delete canonicalProduct.ingredientIntelligenceBasis;

    for (const check of checks) {
      if (!(check.matchedCurrentProductKeys ?? []).includes(sourceItem.id)) continue;
      check.allergenVerdict = "verified";
      check.adjudicatedContainsAllergens = restoredDirect;
      check.adjudicatedMayContainAllergens = restoredCrossContact;
      check.adjudicatedAllergenSourceType = "official-allergen-menu";
      check.adjudicatedAllergenAuthorityTier = "restaurant_issued";
      check.notes = appendNote(
        check.notes,
        "Restored direct official-matrix positives that had been incorrectly reduced to cross-contact-only warnings.",
      );
    }

    repairs.push({
      repairKind: "restore-official-direct",
      restaurantId,
      itemId: sourceItem.id,
      itemName: sourceItem.name,
      restoredDirect,
      retainedCrossContact: restoredCrossContact,
    });
  }

  // A stale menu-only row is not official allergen evidence merely because it
  // shares a restaurant with an official matrix. If its name itself identifies
  // shellfish, preserve that as title-based Ingredient Intelligence instead of
  // misrepresenting it as an official cross-contact-only disclosure.
  for (const currentItem of restaurant.items ?? []) {
    if (freshIds.has(currentItem.id)) continue;
    const canonicalProduct = canonicalById.get(currentItem.id);
    if (!canonicalProduct) continue;
    const direct = unique(currentItem.allergens ?? []);
    const crossContact = unique([
      ...(currentItem.mayContain ?? []),
      ...(currentItem.mayContainAllergens ?? []),
    ]);
    if (
      direct.length > 0 ||
      !crossContact.includes("shellfish") ||
      !explicitlyNamesShellfish(currentItem.name)
    ) continue;

    currentItem.allergens = [];
    currentItem.mayContain = crossContact.filter((allergen) => allergen !== "shellfish");
    currentItem.mayContainAllergens = currentItem.mayContain;
    currentItem.allergenSourceType = "ingredient_intelligence";
    currentItem.allergenAuthorityTier = "ingredient_intelligence";
    currentItem.ingredientIntelligenceBasis = "title";
    currentItem.inferredAllergenSignals = [
      { id: "shellfish", c: "high", e: ["menu:shellfish"] },
    ];
    currentItem.ingredientIntelligenceReviewed = true;
    currentItem.inferenceSummary = "The menu item name identifies shellfish.";
    currentItem.inferenceVersion = "ingredient-intelligence-v2";

    canonicalProduct.containsAllergens = [];
    canonicalProduct.mayContainAllergens = currentItem.mayContain;
    canonicalProduct.allergenSourceType = "ingredient_intelligence";
    canonicalProduct.allergenAuthorityTier = "ingredient_intelligence";
    canonicalProduct.allergenSourceEvidenceIds = [];
    canonicalProduct.ingredientIntelligenceBasis = "title";

    for (const check of checks) {
      if (!(check.matchedCurrentProductKeys ?? []).includes(currentItem.id)) continue;
      check.allergenVerdict = "accurately_unavailable";
      check.adjudicatedContainsAllergens = [];
      check.adjudicatedMayContainAllergens = currentItem.mayContain;
      check.adjudicatedAllergenSourceType = "ingredient_intelligence";
      check.adjudicatedAllergenAuthorityTier = "ingredient_intelligence";
      check.allergenSourceEvidenceIds = [];
      delete check.officialAllergenProfileId;
      check.notes = appendNote(
        check.notes,
        "Reclassified stale menu-only shellfish naming as title-based Ingredient Intelligence; it is not a row in the current official matrix.",
      );
    }

    repairs.push({
      repairKind: "reclassify-stale-title-only",
      restaurantId,
      itemId: currentItem.id,
      itemName: currentItem.name,
      inferredAllergens: ["shellfish"],
      retainedCrossContact: currentItem.mayContain,
    });
  }

  const restaurantRepairs = repairs.filter((repair) => repair.restaurantId === restaurantId);
  if (restaurantRepairs.length === 0) continue;

  dossier.currentCatalog.inventoryFingerprint = sha256(
    dossier.currentCatalog.products.map(currentProductFingerprintRecord),
  );
  dossier.currentCatalog.notes = unique([
    ...(dossier.currentCatalog.notes ?? []),
    "Direct official-matrix positives and preparation-related cross-contact warnings are stored independently.",
  ]);
  if (dossier.checks?.allergenSource) {
    dossier.checks.allergenSource.directPositiveCount = dossier.currentCatalog.products.filter(
      (product) => (product.containsAllergens ?? []).length > 0,
    ).length;
    dossier.checks.allergenSource.directMayContainCount = dossier.currentCatalog.products.filter(
      (product) => (product.mayContainAllergens ?? []).length > 0,
    ).length;
  }
  dossier.updatedAt = generatedAt;
  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    directCrossContactRepair: {
      repairedAt: generatedAt,
      restoredItemCount: restaurantRepairs.length,
      source: "fresh-source-parity-audit",
    },
  };
  touched.set(restaurantId, { dossier, dossierPath, checks, checksPath });
}

const report = {
  schemaVersion: 1,
  applied: apply,
  generatedAt,
  repairedItemCount: repairs.length,
  repairedRestaurantCount: touched.size,
  byRestaurant: Object.fromEntries(
    targetIds.map((restaurantId) => [
      restaurantId,
      repairs.filter((repair) => repair.restaurantId === restaurantId).length,
    ]),
  ),
  repairs,
};

if (apply && repairs.length > 0) {
  repository.generatedAt = generatedAt;
  repository.metadata = {
    ...(repository.metadata ?? {}),
    dardenDirectCrossContactRepair: {
      repairedAt: generatedAt,
      repairedItemCount: repairs.length,
      repairedRestaurantCount: touched.size,
    },
  };
  writeJson(generatedPath, repository, false);
  for (const { dossier, dossierPath, checks, checksPath } of touched.values()) {
    writeJson(dossierPath, dossier, true);
    writeJsonLines(checksPath, checks);
  }
  writeJson(reportPath, report, true);
}

console.log(JSON.stringify(report, null, 2));

function currentProductFingerprintRecord(product) {
  return {
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category ?? null,
    presentationIds: product.presentationIds ?? [],
    matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys ?? [],
    containsAllergens: product.containsAllergens ?? [],
    mayContainAllergens: product.mayContainAllergens ?? [],
    allergenSourceType: product.allergenSourceType ?? null,
    allergenAuthorityTier: product.allergenAuthorityTier ?? null,
  };
}

function appendNote(current, note) {
  const text = String(current ?? "").trim();
  return text.includes(note) ? text : `${text}${text ? " " : ""}${note}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function explicitlyNamesShellfish(name) {
  const normalized = String(name ?? "").toLowerCase();
  if (/\b(?:without|no)\s+(?:shellfish|shrimp|prawn|lobster|crab)\b/.test(normalized)) {
    return false;
  }
  return /\b(?:shellfish|shrimp|prawn|lobster|crab|crayfish|crawfish|langoustine|scampi)\b/.test(
    normalized,
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function writeJson(filePath, value, pretty) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function writeJsonLines(filePath, values) {
  fs.writeFileSync(filePath, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}
