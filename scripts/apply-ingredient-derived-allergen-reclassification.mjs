import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import {
  applyIngredientDerivedAllergenReclassificationPlan,
  buildExplicitOfficialAllergenDisclosurePlan,
  buildIngredientDerivedAllergenReclassificationPlan,
  isReclassifiableAsIngredientIntelligence,
  promoteExplicitOfficialAllergenDisclosure,
  reclassifyCanonicalProduct,
} from "./ingredient-derived-allergen-reclassification.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const shouldCheck = args.has("--check");
const generatedAt = new Date().toISOString();
const paths = {
  generated: path.join(root, "src/data/generated/restaurants.generated.json"),
  ledger: path.join(root, "data/restaurant-verification/ledger.jsonl"),
  report: path.join(
    root,
    "data/restaurant-verification/reports/ingredient-derived-allergen-reclassification.json",
  ),
};

const repository = readJson(paths.generated);
const previousReclassificationMetadata =
  repository.metadata?.ingredientDerivedAllergenReclassification;
const plan = buildIngredientDerivedAllergenReclassificationPlan(repository);
const officialDisclosurePlan = buildExplicitOfficialAllergenDisclosurePlan(repository);
const actionsByRestaurant = groupBy(plan.actions, (action) => action.restaurantId);
const officialActionsByRestaurant = groupBy(
  officialDisclosurePlan.actions,
  (action) => action.restaurantId,
);
const affectedRestaurantIds = new Set([
  ...actionsByRestaurant.keys(),
  ...officialActionsByRestaurant.keys(),
]);
const report = {
  schemaVersion: 1,
  generatedAt,
  applied: shouldApply,
  summary: {
    actionCount: plan.actions.length,
    affectedRestaurantCount: actionsByRestaurant.size,
    priorAllergenClaimCount: plan.actions.reduce(
      (sum, action) => sum + action.allergenCount,
      0,
    ),
    explicitOfficialDisclosureCount: officialDisclosurePlan.actions.length,
    explicitOfficialDisclosureRestaurantCount: officialActionsByRestaurant.size,
  },
  byPriorSourceType: countBy(plan.actions, (action) => action.priorSourceType),
  byIngredientIntelligenceBasis: countBy(plan.actions, (action) => action.basis),
  affectedRestaurants: countBy(plan.actions, (action) => action.restaurantId),
  policy: {
    inclusionByExclusion: "exhaustive-official-allergen-sources-only",
    ingredientSources: "ingredient-intelligence-only",
    ingredientIntelligenceLanes: ["title-description", "title"],
  },
};

if (!shouldApply) {
  console.log(JSON.stringify(report, null, 2));
  if (
    shouldCheck &&
    (plan.actions.length > 0 || officialDisclosurePlan.actions.length > 0)
  ) process.exit(1);
  process.exit(0);
}

if (plan.actions.length === 0 && officialDisclosurePlan.actions.length === 0) {
  console.log("Ingredient-derived allergen source contract is already clean.");
  process.exit(0);
}

for (const restaurantId of affectedRestaurantIds) {
  for (const filePath of [
    path.join(root, "data/restaurant-verification/restaurants", `${restaurantId}.json`),
    path.join(root, "data/restaurant-verification/item-checks", `${restaurantId}.jsonl`),
  ]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing canonical reclassification input: ${filePath}`);
    }
  }
}

applyIngredientDerivedAllergenReclassificationPlan(repository, plan);
for (const action of officialDisclosurePlan.actions) {
  const restaurant = repository.restaurants.find(
    (candidate) => candidate.id === action.restaurantId,
  );
  const item = restaurant?.items?.[action.itemIndex];
  if (!item || item.id !== action.itemId) {
    throw new Error(
      `Missing ${action.restaurantId}/${action.itemId} during official-disclosure promotion.`,
    );
  }
  promoteExplicitOfficialAllergenDisclosure(item, action);
}
const restaurantById = new Map(
  repository.restaurants.map((restaurant) => [restaurant.id, restaurant]),
);
let canonicalProductCount = 0;
let canonicalCheckCount = 0;
let legacyDossierCount = 0;
let canonicalOfficialDisclosureCount = 0;

for (const restaurantId of affectedRestaurantIds) {
  const dossierPath = path.join(
    root,
    "data/restaurant-verification/restaurants",
    `${restaurantId}.json`,
  );
  const checksPath = path.join(
    root,
    "data/restaurant-verification/item-checks",
    `${restaurantId}.jsonl`,
  );
  const evidencePath = path.join(
    root,
    "data/restaurant-verification/evidence",
    `${restaurantId}.json`,
  );
  const dossier = readJson(dossierPath);
  const checks = readJsonLines(checksPath);
  const evidence = readJson(evidencePath);
  const evidenceById = new Map(
    (evidence.sources ?? []).map((source) => [source.id, source]),
  );
  const products = dossier.currentCatalog?.products;

  if (!Array.isArray(products)) {
    legacyDossierCount += 1;
    const reclassifiedRestaurant = await annotateRestaurantWithIngredientIntelligence(
      restaurantById.get(restaurantId),
      { promoteOfficialDisclosures: false },
    );
    updateRestaurantOfficialCoverage(reclassifiedRestaurant);
    restaurantById.set(restaurantId, reclassifiedRestaurant);
    continue;
  }

  const reclassifiedKeys = new Set();
  const basisByProductKey = new Map(
    (actionsByRestaurant.get(restaurantId) ?? [])
      .map((action) => [action.itemId, action.basis]),
  );
  const officialDisclosureByProductKey = new Map(
    (officialActionsByRestaurant.get(restaurantId) ?? [])
      .map((action) => [action.itemId, action]),
  );

  for (const product of products) {
    if (!isReclassifiableAsIngredientIntelligence(product)) continue;
    reclassifiedKeys.add(product.currentProductKey);
    reclassifyCanonicalProduct(product);
    product.ingredientIntelligenceBasis =
      basisByProductKey.get(product.currentProductKey) ??
      product.ingredientIntelligenceBasis;
    canonicalProductCount += 1;
  }

  for (const product of products) {
    const disclosure = officialDisclosureByProductKey.get(product.currentProductKey);
    if (!disclosure) continue;
    reclassifiedKeys.add(product.currentProductKey);
    promoteCanonicalOfficialAllergenDisclosure(
      product,
      disclosure,
      evidenceById,
    );
    canonicalOfficialDisclosureCount += 1;
  }

  for (const check of checks) {
    if (!(check.matchedCurrentProductKeys ?? []).some((key) => reclassifiedKeys.has(key))) {
      continue;
    }

    const matchedProducts = (check.matchedCurrentProductKeys ?? [])
      .map((key) => products.find((product) => product.currentProductKey === key))
      .filter(Boolean);
    const publishedProducts = matchedProducts.filter(isCanonicalPublishedAllergenProduct);

    check.adjudicatedContainsAllergens = unique(
      publishedProducts.flatMap((product) => product.containsAllergens ?? []),
    ).sort();
    check.adjudicatedMayContainAllergens = unique(
      publishedProducts.flatMap((product) => product.mayContainAllergens ?? []),
    ).sort();

    if (publishedProducts.length === 0) {
      check.adjudicatedAllergenSourceType = "ingredient_intelligence";
      check.adjudicatedAllergenAuthorityTier = "ingredient_intelligence";
      check.allergenSourceEvidenceIds = [];
      check.allergenVerdict = "accurately_unavailable";
    } else {
      const strongest = publishedProducts.sort(compareCanonicalSourceStrength)[0];
      check.adjudicatedAllergenSourceType = strongest.allergenSourceType;
      check.adjudicatedAllergenAuthorityTier = strongest.allergenAuthorityTier ?? null;
      check.allergenSourceEvidenceIds = unique(
        publishedProducts.flatMap((product) => product.allergenSourceEvidenceIds ?? []),
      );
    }

    canonicalCheckCount += 1;
  }

  if (dossier.checks?.allergenSource) {
    dossier.checks.allergenSource.directPositiveCount = products.filter(
      (product) =>
        isCanonicalPublishedAllergenProduct(product) &&
        ((product.containsAllergens ?? []).length > 0 ||
          (product.mayContainAllergens ?? []).length > 0),
    ).length;
  }
  dossier.currentCatalog.notes = unique([
    ...(dossier.currentCatalog.notes ?? []),
    "Ingredient-derived allergen signals are classified as Ingredient Intelligence; only exhaustive official allergen sources provide negative coverage.",
  ]);
  dossier.currentCatalog.inventoryFingerprint = sha256Json(
    products.map(currentProductFingerprintRecord),
  );
  dossier.updatedAt = generatedAt;
  writePrettyJson(dossierPath, dossier);
  writeJsonLines(checksPath, checks);

  const reclassifiedRestaurant = await annotateRestaurantWithIngredientIntelligence(
    restaurantById.get(restaurantId),
    { promoteOfficialDisclosures: false },
  );
  updateRestaurantOfficialCoverage(reclassifiedRestaurant);
  restaurantById.set(restaurantId, reclassifiedRestaurant);
}

repository.restaurants = repository.restaurants.map(
  (restaurant) => restaurantById.get(restaurant.id) ?? restaurant,
);
repository.generatedAt = generatedAt;
repository.metadata = {
  ...(repository.metadata ?? {}),
  ingredientDerivedAllergenReclassification: {
    appliedAt: generatedAt,
    actionCount:
      previousReclassificationMetadata?.actionCount ?? plan.actions.length,
    affectedRestaurantCount:
      previousReclassificationMetadata?.affectedRestaurantCount ??
      actionsByRestaurant.size,
    canonicalProductCount:
      previousReclassificationMetadata?.canonicalProductCount ?? canonicalProductCount,
    canonicalCheckCount:
      previousReclassificationMetadata?.canonicalCheckCount ?? canonicalCheckCount,
    explicitOfficialDisclosureCount: officialDisclosurePlan.actions.length,
    canonicalOfficialDisclosureCount,
    contractVersion: 1,
  },
};
delete repository.metadata.brandSiblingAllergenConsistency;

const ledgerRows = readJsonLines(paths.ledger).map((row) =>
  affectedRestaurantIds.has(row.restaurantId)
    ? { ...row, updatedAt: generatedAt }
    : row,
);

report.summary.canonicalProductCount = canonicalProductCount;
report.summary.canonicalCheckCount = canonicalCheckCount;
report.summary.canonicalOfficialDisclosureCount = canonicalOfficialDisclosureCount;
report.summary.legacyDossierCount = legacyDossierCount;
writeJson(paths.generated, repository);
writeJsonLines(paths.ledger, ledgerRows);
writePrettyJson(paths.report, report);
console.log(JSON.stringify(report.summary, null, 2));

function isCanonicalPublishedAllergenProduct(product) {
  return [
    "restaurant_allergen_document",
    "linked_vendor_allergen",
    "third_party_allergen",
  ].includes(product.allergenSourceType);
}

function promoteCanonicalOfficialAllergenDisclosure(
  product,
  disclosure,
  evidenceById,
) {
  const sourceAuthorities = (product.sourceEvidenceIds ?? [])
    .map((id) => evidenceById.get(id)?.authorityTier)
    .filter(Boolean);
  const authorityTier = sourceAuthorities.includes("restaurant_issued")
    ? "restaurant_issued"
    : sourceAuthorities.includes("restaurant_linked_vendor")
      ? "restaurant_linked_vendor"
      : disclosure.authorityTier;
  product.containsAllergens = [...disclosure.allergens];
  product.mayContainAllergens = [...disclosure.mayContain];
  product.allergenSourceType =
    authorityTier === "restaurant_linked_vendor"
      ? "linked_vendor_allergen"
      : "restaurant_allergen_document";
  product.allergenAuthorityTier = authorityTier;
  product.allergenSourceEvidenceIds = unique(product.sourceEvidenceIds ?? []);
  delete product.ingredientIntelligenceBasis;
  return product;
}

function compareCanonicalSourceStrength(left, right) {
  const rank = {
    restaurant_allergen_document: 0,
    linked_vendor_allergen: 1,
    third_party_allergen: 2,
  };
  return (rank[left.allergenSourceType] ?? 99) - (rank[right.allergenSourceType] ?? 99);
}

function updateRestaurantOfficialCoverage(restaurant) {
  const publishedTypes = new Set([
    "official-allergen-menu",
    "official-product-allergen-section",
    "restaurant-linked-product-allergen-section",
    "restaurant_allergen_document",
    "restaurant_issued_positive",
    "restaurant_linked_vendor",
  ]);
  const officialItemCount = (restaurant.items ?? []).filter((item) =>
    publishedTypes.has(item.allergenSourceType),
  ).length;
  const totalItemCount = (restaurant.items ?? []).length;

  restaurant.officialItemCount = officialItemCount;
  restaurant.allergenDataStatus = {
    ...(restaurant.allergenDataStatus ?? {}),
    officialItemCount,
    officialTotal: totalItemCount,
    totalItemCount,
    officialCoverageRatio: totalItemCount > 0 ? officialItemCount / totalItemCount : 0,
    bucket:
      officialItemCount === totalItemCount && totalItemCount > 0
        ? "official-disclosure"
        : officialItemCount > 0
          ? "official-partial"
          : "unavailable",
  };
  restaurant.officialAllergenStatus = officialItemCount > 0 ? "extracted" : "not-found";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function writePrettyJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
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

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function countBy(values, keyForValue) {
  return Object.fromEntries(
    [...groupBy(values, keyForValue)]
      .map(([key, entries]) => [key, entries.length])
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

function groupBy(values, keyForValue) {
  const groups = new Map();

  for (const value of values) {
    const key = keyForValue(value);
    const entries = groups.get(key) ?? [];
    entries.push(value);
    groups.set(key, entries);
  }

  return groups;
}
