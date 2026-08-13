#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  annotateRestaurantWithIngredientIntelligence,
  loadIngredientIntelligenceManifest,
} from "./ingredient-intelligence.mjs";

const apply = process.argv.includes("--apply");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const verificationRoot = path.join(root, "data/restaurant-verification");
const reportPath = path.join(
  verificationRoot,
  "reports/official-text-allergen-promotion-repair.json",
);
const repository = readJson(repositoryPath);
const manifest = await loadIngredientIntelligenceManifest();
const supportedAllergenIds = unique(
  Object.values(manifest.allergenMappings ?? {}).flatMap((mappings) =>
    mappings.map((mapping) => mapping.id),
  ),
).sort();
const report = {
  apply,
  generatedAt: new Date().toISOString(),
  changedRestaurantCount: 0,
  changedItemCount: 0,
  promotedDirectCount: 0,
  promotedMayContainCount: 0,
  completedProfileRestaurantIds: [],
  restaurants: [],
};

for (let restaurantIndex = 0; restaurantIndex < repository.restaurants.length; restaurantIndex += 1) {
  const restaurant = repository.restaurants[restaurantIndex];

  if (!restaurant.officialAllergenProfiles) continue;

  const beforeById = new Map((restaurant.items ?? []).map((item) => [item.id, item]));
  let annotatedRestaurant = await annotateRestaurantWithIngredientIntelligence(restaurant, {
    manifest,
  });
  const completedProfile = hasComprehensiveOfficialIngredientApi(restaurant);

  if (completedProfile) {
    annotatedRestaurant.officialAllergenProfiles = Object.fromEntries(
      Object.entries(annotatedRestaurant.officialAllergenProfiles ?? {}).map(([profileId, profile]) => [
        profileId,
        {
          ...profile,
          coveredAllergenIds: unique([
            ...(profile.coveredAllergenIds ?? []),
            ...supportedAllergenIds,
          ]).sort(),
        },
      ]),
    );
    annotatedRestaurant = await annotateRestaurantWithIngredientIntelligence(annotatedRestaurant, {
      manifest,
    });
  }

  const promotions = [];

  for (const item of annotatedRestaurant.items ?? []) {
    const before = beforeById.get(item.id);
    if (!before) continue;
    const direct = (item.allergens ?? []).filter((id) => !(before.allergens ?? []).includes(id));
    const mayContain = (item.mayContain ?? []).filter(
      (id) => !(before.mayContain ?? []).includes(id),
    );

    if (direct.length > 0 || mayContain.length > 0) {
      promotions.push({ direct, itemId: item.id, itemName: item.name, mayContain });
    }
  }

  if (promotions.length === 0 && !completedProfile) continue;

  const dossierPath = path.join(verificationRoot, "restaurants", `${restaurant.id}.json`);
  const checksPath = path.join(verificationRoot, "item-checks", `${restaurant.id}.jsonl`);

  if (![dossierPath, checksPath].every(fs.existsSync)) {
    throw new Error(`Missing canonical verification files for ${restaurant.id}`);
  }

  const dossier = readJson(dossierPath);
  const checks = readJsonLines(checksPath);
  const generatedById = new Map(
    (annotatedRestaurant.items ?? []).map((item) => [item.id, item]),
  );
  const dossierByKey = new Map(
    (dossier.currentCatalog?.products ?? []).map((product) => [
      product.currentProductKey,
      product,
    ]),
  );

  for (const promotion of promotions) {
    const generatedItem = generatedById.get(promotion.itemId);
    const dossierProduct = dossierByKey.get(promotion.itemId);

    if (!generatedItem || !dossierProduct) {
      throw new Error(`Missing canonical product ${restaurant.id}:${promotion.itemId}`);
    }

    dossierProduct.containsAllergens = [...(generatedItem.allergens ?? [])];
    dossierProduct.mayContainAllergens = [...(generatedItem.mayContain ?? [])];

    for (const check of checks) {
      if (!(check.matchedCurrentProductKeys ?? []).includes(promotion.itemId)) continue;
      check.allergenVerdict = "verified";
      check.adjudicatedContainsAllergens = [...(generatedItem.allergens ?? [])];
      check.adjudicatedMayContainAllergens = [...(generatedItem.mayContain ?? [])];
      check.notes = appendNote(
        check.notes,
        "Promoted explicit restaurant-issued item text from Ingredient Intelligence to canonical official allergen evidence.",
      );
    }
  }

  if (completedProfile) {
    const runtimeProfiles = annotatedRestaurant.officialAllergenProfiles ?? {};
    dossier.currentCatalog.officialAllergenProfiles = Object.fromEntries(
      Object.entries(dossier.currentCatalog.officialAllergenProfiles ?? {}).map(
        ([profileId, profile]) => [
          profileId,
          {
            ...profile,
            coveredAllergenIds: [...(runtimeProfiles[profileId]?.coveredAllergenIds ?? [])],
          },
        ],
      ),
    );
    report.completedProfileRestaurantIds.push(restaurant.id);
  }

  dossier.currentCatalog.inventoryFingerprint = createHash("sha256")
    .update(JSON.stringify(dossier.currentCatalog.products.map(currentProductFingerprintRecord)))
    .digest("hex");
  repository.restaurants[restaurantIndex] = annotatedRestaurant;
  report.changedRestaurantCount += 1;
  report.changedItemCount += promotions.length;
  report.promotedDirectCount += promotions.reduce((sum, row) => sum + row.direct.length, 0);
  report.promotedMayContainCount += promotions.reduce(
    (sum, row) => sum + row.mayContain.length,
    0,
  );
  report.restaurants.push({
    completedProfile,
    name: restaurant.name,
    promotions,
    restaurantId: restaurant.id,
  });

  if (apply) {
    writeJson(dossierPath, dossier, true);
    writeJsonLines(checksPath, checks);
  }
}

report.restaurants.sort((left, right) => left.restaurantId.localeCompare(right.restaurantId));
report.completedProfileRestaurantIds.sort();

if (apply) {
  repository.generatedAt = report.generatedAt;
  repository.metadata = {
    ...(repository.metadata ?? {}),
    officialTextAllergenPromotionRepair: {
      generatedAt: report.generatedAt,
      changedRestaurantCount: report.changedRestaurantCount,
      changedItemCount: report.changedItemCount,
      promotedDirectCount: report.promotedDirectCount,
      promotedMayContainCount: report.promotedMayContainCount,
      completedProfileRestaurantIds: report.completedProfileRestaurantIds,
    },
  };
  writeJson(repositoryPath, repository, false);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  writeJson(reportPath, report, true);
}

console.log(JSON.stringify(report, null, 2));

function hasComprehensiveOfficialIngredientApi(restaurant) {
  const items = (restaurant.items ?? []).filter((item) => item.officialAllergenProfileId);
  return (
    items.length > 0 &&
    items.every(
      (item) =>
        item.sourceType === "official-api" &&
        String(item.ingredientsText ?? "").length > 0 &&
        String(item.ingredientsText ?? "").length <= 20_000,
    )
  );
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

function appendNote(current, note) {
  if (!current) return note;
  if (String(current).includes(note)) return current;
  return `${current} ${note}`;
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

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
