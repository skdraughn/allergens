#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const fixturePath = path.join(
  root,
  "data/fixtures/starbucks-official-nutrition-snapshot.json",
);
const dossierPath = path.join(
  root,
  "data/restaurant-verification/restaurants/starbucks.json",
);
const checksPath = path.join(
  root,
  "data/restaurant-verification/item-checks/starbucks.jsonl",
);

const [repository, fixture, dossier, checksText] = await Promise.all([
  readJson(generatedPath),
  readJson(fixturePath),
  readJson(dossierPath),
  fs.readFile(checksPath, "utf8"),
]);

const fixtureByName = new Map(
  (fixture.items ?? []).map((item) => [normalize(item.name), item]),
);
const restaurant = repository.restaurants?.find((entry) => entry.id === "starbucks");
const products = dossier.currentCatalog?.products;
const checks = checksText.split(/\r?\n/).filter(Boolean).map(JSON.parse);

if (!restaurant || !Array.isArray(products)) {
  throw new Error("Missing generated or canonical Starbucks catalog.");
}

const generatedByName = new Map(
  (restaurant.items ?? []).map((item) => [normalize(item.name), item]),
);
const productByKey = new Map(products.map((product) => [product.currentProductKey, product]));
let explicitOfficialCount = 0;
let ingredientIntelligenceCount = 0;

for (const product of products) {
  const reference = fixtureByName.get(normalize(product.name));
  if (!reference) throw new Error(`Starbucks fixture mismatch: ${product.name}`);

  product.description = reference.description ?? product.description ?? null;
  product.ingredientsText = reference.ingredientsText ?? product.ingredientsText ?? null;
  product.sourceEvidenceIds = unique([
    ...(product.sourceEvidenceIds ?? []),
    "official-menu",
    "official-nutrition",
  ]);

  const generated = generatedByName.get(normalize(product.name));
  if (generated) {
    generated.description = product.description;
    generated.ingredientsText = product.ingredientsText;
    generated.sourceUrls = unique([
      ...(reference.sourceUrls ?? []),
      ...(generated.sourceUrls ?? []),
    ]);
  }

  if (reference.allergenSourceType === "official-product-allergen-section") {
    explicitOfficialCount += 1;
    applyAuthority(product, {
      allergens: reference.allergens,
      mayContain: reference.mayContain,
      sourceType: "official-product-allergen-section",
      authorityTier: "restaurant_issued",
      evidenceIds: ["official-nutrition"],
      canonical: true,
    });
    if (generated) {
      applyAuthority(generated, {
        allergens: reference.allergens,
        mayContain: reference.mayContain,
        sourceType: "official-product-allergen-section",
        authorityTier: "restaurant_issued",
        evidenceIds: ["official-nutrition"],
      });
    }
  } else {
    ingredientIntelligenceCount += 1;
    applyAuthority(product, {
      allergens: [],
      mayContain: [],
      sourceType: "ingredient_intelligence",
      authorityTier: "ingredient_intelligence",
      evidenceIds: [],
      canonical: true,
    });
    product.ingredientIntelligenceBasis = "title-description";
    if (generated) {
      applyAuthority(generated, {
        allergens: [],
        mayContain: [],
        sourceType: "ingredient_intelligence",
        authorityTier: "ingredient_intelligence",
        evidenceIds: [],
      });
      generated.ingredientIntelligenceBasis = "title-description";
    }
  }
}

for (const check of checks) {
  const matched = (check.matchedCurrentProductKeys ?? [])
    .map((key) => productByKey.get(key))
    .filter(Boolean);
  if (matched.length === 0) continue;
  check.adjudicatedContainsAllergens = unique(
    matched.flatMap((product) => product.containsAllergens ?? []),
  ).sort();
  check.adjudicatedMayContainAllergens = unique(
    matched.flatMap((product) => product.mayContainAllergens ?? []),
  ).sort();
  const explicit = matched.find(
    (product) => product.allergenSourceType === "official-product-allergen-section",
  );
  check.adjudicatedAllergenSourceType = explicit
    ? "official-product-allergen-section"
    : "ingredient_intelligence";
  check.adjudicatedAllergenAuthorityTier = explicit
    ? "restaurant_issued"
    : "ingredient_intelligence";
  check.allergenSourceEvidenceIds = explicit ? ["official-nutrition"] : [];
  check.allergenVerdict = explicit ? "verified" : "accurately_unavailable";
}

dossier.checks ||= {};
dossier.checks.allergenSource ||= {};
dossier.checks.allergenSource.directPositiveCount = explicitOfficialCount;
dossier.currentCatalog.notes = unique([
  ...(dossier.currentCatalog.notes ?? []),
  "Starbucks authority repair preserves explicit item-level Allergens sections as official; ingredient-statement-only products remain Ingredient Intelligence and do not receive negative official coverage.",
]);
dossier.currentCatalog.inventoryFingerprint = createHash("sha256")
  .update(JSON.stringify(products.map(currentProductFingerprintRecord)))
  .digest("hex");
dossier.updatedAt = new Date().toISOString();

await Promise.all([
  writeJson(generatedPath, repository),
  writeJson(dossierPath, dossier, true),
  fs.writeFile(checksPath, `${checks.map((row) => JSON.stringify(row)).join("\n")}\n`),
]);

console.log(JSON.stringify({
  restaurantId: "starbucks",
  totalItemCount: products.length,
  explicitOfficialCount,
  ingredientIntelligenceCount,
}, null, 2));

function applyAuthority(item, options) {
  if (options.canonical) {
    item.containsAllergens = unique(options.allergens);
    item.mayContainAllergens = unique(options.mayContain);
  } else {
    item.allergens = unique(options.allergens);
    item.mayContain = unique(options.mayContain);
    item.mayContainAllergens = unique(options.mayContain);
  }
  item.allergenSourceType = options.sourceType;
  item.allergenAuthorityTier = options.authorityTier;
  item.allergenSourceEvidenceIds = unique(options.evidenceIds);
  delete item.officialAllergenCoveredIds;
  delete item.officialAllergenProfileId;
  for (const key of [
    "extractedIngredientMentions",
    "inferredIngredients",
    "inferredAllergenSignals",
    "ingredientIntelligenceReviewed",
    "inferenceQuestions",
    "inferenceSuppressions",
    "inferenceSummary",
    "inferenceVersion",
  ]) delete item[key];
  if (options.sourceType !== "ingredient_intelligence") {
    delete item.ingredientIntelligenceBasis;
  }
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function currentProductFingerprintRecord(product) {
  return {
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category,
    presentationIds: product.presentationIds,
    matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys,
    containsAllergens: product.containsAllergens,
    mayContainAllergens: product.mayContainAllergens,
    allergenSourceType: product.allergenSourceType,
    allergenAuthorityTier: product.allergenAuthorityTier,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value, pretty = false) {
  const text = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${text}\n`);
  await fs.rename(temporaryPath, filePath);
}
