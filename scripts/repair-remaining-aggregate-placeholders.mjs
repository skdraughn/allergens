#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verificationRoot = path.join(root, "data/restaurant-verification");
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const targets = [
  "osm-bakeshop-11399205397",
  "replacement-city-kitchen-alexandria-va",
  "replacement-limani-washington-dc",
];
const aggregatePattern = /\bcatalog\b|(?:current|complete|full|entire).*\bmenu\b|\bmenu\b.*(?:aggregate|boundary)|\badditional current\b.*\bmenu items\b/i;

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value, compact = false) => fs.writeFileSync(file, compact
  ? `${JSON.stringify(value)}\n`
  : `${JSON.stringify(value, null, 2)}\n`);
const readJsonLines = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeJsonLines = (file, values) => fs.writeFileSync(file, `${values.map(JSON.stringify).join("\n")}\n`);
const unique = (values) => [...new Set(values.filter(Boolean))];
const sha256Json = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fingerprintProducts = (products) => sha256Json(products.map((product) => ({
  currentProductKey: product.currentProductKey,
  name: product.name,
  category: product.category,
  presentationIds: product.presentationIds,
  matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys ?? [],
  containsAllergens: product.containsAllergens,
  mayContainAllergens: product.mayContainAllergens,
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier,
})));

function normalizedName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[❖◆]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function canonicalAllergen(value) {
  return value === "tree_nut" ? "tree-nut" : value;
}

function productFromCheck(check, sourceById, usedKeys) {
  const baseline = check.baseline;
  let key = baseline.itemId;
  if (usedKeys.has(key)) key = `${key}--${check.baselineIndex + 1}`;
  usedKeys.add(key);
  const containsAllergens = unique((check.adjudicatedContainsAllergens ?? []).map(canonicalAllergen));
  const mayContainAllergens = unique((check.adjudicatedMayContainAllergens ?? []).map(canonicalAllergen));
  const allergenEvidenceIds = unique(check.allergenSourceEvidenceIds ?? []);
  const directSource = allergenEvidenceIds.map((id) => sourceById.get(id)).find((source) =>
    ["restaurant_issued", "restaurant_linked_vendor"].includes(source?.authorityTier));
  const hasDirect = (containsAllergens.length > 0 || mayContainAllergens.length > 0) && directSource;
  return {
    currentProductKey: key,
    name: baseline.name,
    category: baseline.category ?? "Menu",
    variantGroup: baseline.variantGroup ?? null,
    isConfigurable: baseline.isConfigurable === true,
    presentationIds: [],
    matchedBaselineAuditItemKeys: [check.auditItemKey],
    sourceEvidenceIds: unique(check.sourceEvidenceIds ?? []),
    containsAllergens: hasDirect ? containsAllergens : [],
    mayContainAllergens: hasDirect ? mayContainAllergens : [],
    allergenSourceType: hasDirect
      ? (directSource.authorityTier === "restaurant_linked_vendor"
          ? "restaurant_linked_vendor"
          : check.adjudicatedAllergenSourceType === "restaurant_ingredients"
            ? "restaurant_ingredients"
            : "restaurant_allergen_document")
      : "unavailable",
    allergenAuthorityTier: hasDirect ? directSource.authorityTier : null,
    allergenSourceEvidenceIds: hasDirect ? allergenEvidenceIds : [],
    coordinatorReviewed: true,
    notes: ["Distinct product restored from the affirmative frozen-key reconciliation after removal of an aggregate placeholder."],
  };
}

const generated = readJson(generatedPath);
const repaired = [];
for (const id of targets) {
  const dossierPath = path.join(verificationRoot, "restaurants", `${id}.json`);
  const evidencePath = path.join(verificationRoot, "evidence", `${id}.json`);
  const checksPath = path.join(verificationRoot, "item-checks", `${id}.jsonl`);
  const dossier = readJson(dossierPath);
  const evidence = readJson(evidencePath);
  const checks = readJsonLines(checksPath);
  const checksByKey = new Map(checks.map((check) => [check.auditItemKey, check]));
  const sourceById = new Map((evidence.sources ?? []).map((source) => [source.id ?? source.evidenceId, source]));
  const products = dossier.currentCatalog?.products ?? [];
  const aggregateProducts = products.filter((product) => aggregatePattern.test(product.name ?? ""));
  if (!aggregateProducts.length) continue;
  const aggregateKeys = new Set(aggregateProducts.map((product) => product.currentProductKey));
  const retained = products.filter((product) => !aggregateKeys.has(product.currentProductKey));
  const usedKeys = new Set(retained.map((product) => product.currentProductKey));
  const retainedByName = new Map(retained.map((product) => [normalizedName(product.name), product]));
  const replacementByAuditKey = new Map();
  const additions = [];

  for (const aggregate of aggregateProducts) {
    for (const auditKey of aggregate.matchedBaselineAuditItemKeys ?? []) {
      const check = checksByKey.get(auditKey);
      if (!check) throw new Error(`${id} is missing item check ${auditKey}.`);
      const existing = retainedByName.get(normalizedName(check.baseline?.name));
      if (existing) {
        existing.matchedBaselineAuditItemKeys = unique([
          ...(existing.matchedBaselineAuditItemKeys ?? []),
          auditKey,
        ]);
        replacementByAuditKey.set(auditKey, existing.currentProductKey);
        continue;
      }
      const product = productFromCheck(check, sourceById, usedKeys);
      additions.push(product);
      retainedByName.set(normalizedName(product.name), product);
      replacementByAuditKey.set(auditKey, product.currentProductKey);
    }
  }
  const repairedProducts = [...retained, ...additions];
  if (!repairedProducts.length) throw new Error(`${id} repair would leave an empty catalog.`);

  const updatedChecks = checks.map((check) => {
    const mappedKeys = check.matchedCurrentProductKeys ?? [];
    const referencedAggregate = mappedKeys.some((key) => aggregateKeys.has(key));
    if (!referencedAggregate) return check;
    const replacementKey = replacementByAuditKey.get(check.auditItemKey);
    if (!replacementKey) throw new Error(`${id} cannot replace aggregate mapping for ${check.auditItemKey}.`);
    return {
      ...check,
      matchedCurrentProductKeys: [replacementKey],
      notes: "Distinct product mapping restored after removal of an aggregate catalog placeholder.",
    };
  });
  const generatedIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
  if (generatedIndex < 0) throw new Error(`${id} is missing from the generated repository.`);
  const previous = generated.restaurants[generatedIndex];
  const previousItems = new Map((previous.items ?? []).map((item) => [item.id, item]));
  const generatedItems = repairedProducts.map((product) => ({
    ...(previousItems.get(product.currentProductKey) ?? {}),
    id: product.currentProductKey,
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category,
    description: previousItems.get(product.currentProductKey)?.description ?? null,
    ingredientsText: previousItems.get(product.currentProductKey)?.ingredientsText ?? null,
    isConfigurable: product.isConfigurable === true,
    allergens: [...(product.containsAllergens ?? [])],
    mayContain: [...(product.mayContainAllergens ?? [])],
    mayContainAllergens: [...(product.mayContainAllergens ?? [])],
    allergenSourceType: product.allergenSourceType,
    allergenAuthorityTier: product.allergenAuthorityTier ?? null,
    allergenSourceEvidenceIds: [...(product.allergenSourceEvidenceIds ?? [])],
    sourceEvidenceIds: [...(product.sourceEvidenceIds ?? [])],
    sourceUrls: unique([
      ...(checksByKey.get(product.matchedBaselineAuditItemKeys?.[0])?.baseline?.sourceUrls ?? []),
      ...(product.sourceEvidenceIds ?? []).map((sourceId) => sourceById.get(sourceId)?.url),
    ]),
    matchedBaselineAuditItemKeys: [...(product.matchedBaselineAuditItemKeys ?? [])],
  }));
  generated.restaurants[generatedIndex] = await annotateRestaurantWithIngredientIntelligence({
    ...previous,
    items: generatedItems,
    itemCount: generatedItems.length,
    menuItemCount: generatedItems.length,
    totalItemCount: generatedItems.length,
    allergenDataStatus: {
      ...(previous.allergenDataStatus ?? {}),
      totalItemCount: generatedItems.length,
    },
  });

  dossier.currentCatalog = {
    ...dossier.currentCatalog,
    currentProductCount: repairedProducts.length,
    reconciledCurrentProductCount: repairedProducts.filter((product) =>
      (product.matchedBaselineAuditItemKeys ?? []).length > 0).length,
    inventoryFingerprint: fingerprintProducts(repairedProducts),
    products: repairedProducts,
    notes: unique([
      ...(dossier.currentCatalog?.notes ?? []),
      "Aggregate catalog labels were removed; affirmative frozen-key mappings now publish as distinct products.",
    ]),
  };
  dossier.checks.menu = {
    ...(dossier.checks?.menu ?? {}),
    sourceItemCount: repairedProducts.length,
  };
  dossier.adjudication = {
    ...(dossier.adjudication ?? {}),
    mappingRepair: {
      repairedAt: new Date().toISOString(),
      reason: "legacy_aggregate_placeholder_removal",
      removedAggregateCount: aggregateProducts.length,
      restoredProductCount: additions.length,
      validatorGate: "aggregate_catalog_placeholders_rejected",
    },
  };
  writeJson(dossierPath, dossier);
  writeJsonLines(checksPath, updatedChecks);
  repaired.push({
    id,
    beforeProducts: products.length,
    removedAggregateProducts: aggregateProducts.length,
    restoredProducts: additions.length,
    afterProducts: repairedProducts.length,
  });
}

// Keep already-repaired targets canonical when this idempotent repair is rerun.
for (const id of targets) {
  const dossierPath = path.join(verificationRoot, "restaurants", `${id}.json`);
  const dossier = readJson(dossierPath);
  const products = dossier.currentCatalog?.products ?? [];
  dossier.currentCatalog = {
    ...dossier.currentCatalog,
    currentProductCount: products.length,
    reconciledCurrentProductCount: products.length,
    inventoryFingerprint: fingerprintProducts(products),
  };
  writeJson(dossierPath, dossier);
}

generated.generatedAt = new Date().toISOString();
generated.itemCount = generated.restaurants.reduce((count, restaurant) => count + (restaurant.items?.length ?? 0), 0);
writeJson(generatedPath, generated, true);
console.log(JSON.stringify({ repaired }, null, 2));
