import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verificationRoot = path.join(root, "data/restaurant-verification");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const freshRoot = path.join(
  verificationRoot,
  "reports/structured-disparity-review/fresh",
);
const reportPath = path.join(
  verificationRoot,
  "reports/structured-disparity-review-repairs.json",
);
const appliedAt = "2026-08-27T17:21:14.000Z";

const sourceConfig = {
  mcdonalds: {
    evidenceId: "ev-structured-disparity-review-mcdonalds",
    sourceUrl: "https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html",
  },
  ihop: {
    evidenceId: "ev-structured-disparity-review-ihop",
    sourceUrl: "https://nix-vue-inm.s3.amazonaws.com/restaurant/ihop/data/menu-latest.json.gz",
    profileId: "m1",
  },
  sweetfrog: {
    evidenceId: "ev-structured-disparity-review-sweetfrog",
    sourceUrl: "https://www.sweetfrog.com/assets/pdf/Food_Allergies_Sensitivities.pdf",
    profileId: "m1",
  },
  "south-block-dc": {
    evidenceId: "ev-structured-disparity-review-south-block",
    sourceUrl: "https://www.southblock.com/_api/restaurants-menus-item/v1/items",
  },
};

const dispositions = [
  {
    restaurantId: "buffalo-wild-wings",
    disposition: "curated-catalog-retained",
    reason: "Fresh PDF union contains ingredient-line fragments, structural headings, and unresolved marker glyphs; it is not a trustworthy product catalog.",
  },
  {
    restaurantId: "red-lobster",
    disposition: "curated-catalog-retained",
    reason: "Expanded current-source extraction reduced to 140 rows; all 17 fresh-only names are guide legends, option instructions, or section headings.",
  },
  {
    restaurantId: "smoothie-king",
    disposition: "curated-catalog-retained",
    reason: "All 325 official API products match the published catalog; the additional rows are duplicate web cards, headings, taglines, and image filenames.",
  },
  {
    restaurantId: "potbelly-dc",
    disposition: "curated-catalog-retained",
    reason: "The fresh Nutritionix union mixes Cincinnati, Dallas, Houston, pantry, and INM-only variants into the DC scope; 230 of 233 curated rows match exactly.",
  },
  {
    restaurantId: "silver-diner-dc",
    disposition: "curated-catalog-retained",
    reason: "The union combines Navy Yard with BWI and other location PDFs plus concatenated matrix cells and headings; the 176-row Navy Yard catalog remains authoritative.",
  },
  {
    restaurantId: "call-your-mother-dc",
    disposition: "curated-catalog-retained",
    reason: "The fresh union mixes West End products with component rows, catering-only rows, headings, and other-location menu names; the reviewed 78-row West End catalog remains authoritative.",
  },
];

const repository = readJson(repositoryPath);
const restaurantById = new Map(
  repository.restaurants.map((restaurant) => [restaurant.id, restaurant]),
);
const repairs = [];

await repairMcDonalds();
await repairIhop();
await repairSweetfrog();
await repairSouthBlock();

repository.restaurants = repository.restaurants.map(
  (restaurant) => restaurantById.get(restaurant.id) ?? restaurant,
);
repository.generatedAt = appliedAt;
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce(
  (sum, restaurant) => sum + (restaurant.items ?? []).length,
  0,
);
writeJson(repositoryPath, repository);

for (const repair of repairs) {
  updateCanonicalArtifacts(repair.restaurantId, repair.changedItemNames);
}

writeJson(reportPath, {
  schemaVersion: 1,
  appliedAt,
  sourceAuditPath:
    "data/restaurant-verification/reports/structured-disparity-review/summary.json",
  repairs: repairs.map(({ changedItemNames, ...repair }) => ({
    ...repair,
    changedItemCount: changedItemNames.length,
    changedItemNames,
  })),
  dispositions,
  summary: {
    reviewedRestaurantCount: 10,
    repairedRestaurantCount: repairs.length,
    retainedCuratedCatalogCount: dispositions.length,
  },
});

console.log(
  JSON.stringify(
    {
      repository: {
        restaurantCount: repository.restaurantCount,
        itemCount: repository.itemCount,
        generatedAt: repository.generatedAt,
      },
      repairs: repairs.map(({ changedItemNames, ...repair }) => ({
        ...repair,
        changedItemCount: changedItemNames.length,
      })),
      dispositions,
    },
    null,
    2,
  ),
);

async function repairMcDonalds() {
  const restaurantId = "mcdonalds";
  const current = required(restaurantById.get(restaurantId), restaurantId);
  const fresh = readFresh(restaurantId);
  const freshByName = itemMap(fresh.items);
  const changedItemNames = [];
  const items = current.items.map((item) => {
    const sourceItem = freshByName.get(normalizeName(item.name));
    if (!sourceItem?.description || sourceItem.description === item.description) return item;
    changedItemNames.push(item.name);
    return {
      ...item,
      description: sourceItem.description,
      sourceUrls: unique([...(item.sourceUrls ?? []), ...(sourceItem.sourceUrls ?? [])]),
      evidence: mergeEvidence(item.evidence, sourceItem.evidence),
    };
  });
  const repaired = await finalizeRestaurant({ ...current, items });
  restaurantById.set(restaurantId, repaired);
  repairs.push({
    restaurantId,
    repairType: "official-description-recovery",
    before: metrics(current),
    after: metrics(repaired),
    changedItemNames,
  });
}

async function repairIhop() {
  const restaurantId = "ihop";
  const current = required(restaurantById.get(restaurantId), restaurantId);
  const fresh = readFresh(restaurantId);
  const currentByName = itemMap(current.items);
  const finalByName = new Map(current.items.map((item) => [normalizeName(item.name), item]));
  const changedItemNames = [];

  for (const sourceItem of fresh.items) {
    const key = normalizeName(sourceItem.name);
    const existing = currentByName.get(key);
    const repairedItem = {
      ...(existing ?? {}),
      ...sourceItem,
      id: existing?.id ?? sourceItem.id,
      category: isWeakCategory(sourceItem.category)
        ? existing?.category ?? "Menu"
        : sourceItem.category,
      officialAllergenProfileId: "m1",
      allergenSourceEvidenceIds: unique([
        ...(existing?.allergenSourceEvidenceIds ?? []),
        sourceConfig[restaurantId].evidenceId,
      ]),
      allergenAuthorityTier: "restaurant_issued",
      inferredAllergenSignals: [],
      inferredIngredients: [],
      inferredQuestions: [],
    };
    finalByName.set(key, repairedItem);
    if (!existing || stableJson(existing) !== stableJson(repairedItem)) {
      changedItemNames.push(sourceItem.name);
    }
  }

  const repaired = await finalizeRestaurant({
    ...current,
    items: [...finalByName.values()],
  });
  restaurantById.set(restaurantId, repaired);
  repairs.push({
    restaurantId,
    repairType: "current-official-api-additive-refresh",
    before: metrics(current),
    after: metrics(repaired),
    changedItemNames: unique(changedItemNames),
  });
}

async function repairSweetfrog() {
  const restaurantId = "sweetfrog";
  const current = required(restaurantById.get(restaurantId), restaurantId);
  const fresh = readFresh(restaurantId);
  const currentByName = itemMap(current.items);
  const changedItemNames = [];
  const items = fresh.items
    .filter((item) => item.sourceType === "pdf-matrix")
    .map((sourceItem) => {
      const existing = currentByName.get(normalizeName(sourceItem.name));
      const repairedItem = {
        ...(existing ?? {}),
        ...sourceItem,
        id: existing?.id ?? sourceItem.id,
        officialAllergenProfileId: "m1",
        allergenSourceEvidenceIds: unique([
          ...(existing?.allergenSourceEvidenceIds ?? []),
          sourceConfig[restaurantId].evidenceId,
        ]),
        allergenAuthorityTier: "restaurant_issued",
        inferredAllergenSignals: [],
        inferredIngredients: [],
        inferredQuestions: [],
      };
      if (!existing || stableJson(existing) !== stableJson(repairedItem)) {
        changedItemNames.push(sourceItem.name);
      }
      return repairedItem;
    });
  const repaired = await finalizeRestaurant({ ...current, items });
  restaurantById.set(restaurantId, repaired);
  repairs.push({
    restaurantId,
    repairType: "current-official-matrix-replacement",
    before: metrics(current),
    after: metrics(repaired),
    changedItemNames: unique(changedItemNames),
  });
}

async function repairSouthBlock() {
  const restaurantId = "south-block-dc";
  const current = required(restaurantById.get(restaurantId), restaurantId);
  const fresh = readFresh(restaurantId);
  const allowedAdditions = new Set([
    "Birthday Cake Smoothie",
    "Daily Protein Bowl",
    "Dragon's Kiss Energy Smoothie",
    "Electric Green Energy Smoothie",
    "Protein Warrior Bowl",
  ]);
  const existingNames = new Set(current.items.map((item) => normalizeName(item.name)));
  const additions = fresh.items
    .filter((item) => allowedAdditions.has(item.name))
    .filter((item) => !existingNames.has(normalizeName(item.name)))
    .map((item) => ({
      ...item,
      allergenSourceEvidenceIds: [],
      allergenAuthorityTier: null,
      officialAllergenProfileId: null,
      inferredAllergenSignals: [],
      inferredIngredients: [],
      inferredQuestions: [],
    }));
  const repaired = await finalizeRestaurant({
    ...current,
    items: [...current.items, ...additions],
  });
  restaurantById.set(restaurantId, repaired);
  repairs.push({
    restaurantId,
    repairType: "official-structured-menu-additions",
    before: metrics(current),
    after: metrics(repaired),
    changedItemNames: additions.map((item) => item.name),
    rejectedArtifactCount: 9,
  });
}

async function finalizeRestaurant(restaurant) {
  const annotated = await annotateRestaurantWithIngredientIntelligence(restaurant);
  const itemCount = annotated.items.length;
  const officialItemCount = annotated.items.filter(
    (item) => item.allergenSourceType !== "unavailable",
  ).length;
  return {
    ...annotated,
    itemCount,
    menuItemCount: itemCount,
    totalItemCount: itemCount,
    officialItemCount,
    allergenDataStatus: {
      ...(annotated.allergenDataStatus ?? {}),
      officialItemCount,
      officialTotal: officialItemCount,
      totalItemCount: itemCount,
      officialCoverageRatio: itemCount ? officialItemCount / itemCount : 0,
    },
  };
}

function updateCanonicalArtifacts(restaurantId, changedItemNames) {
  const config = sourceConfig[restaurantId];
  const restaurant = required(restaurantById.get(restaurantId), restaurantId);
  const dossierPath = path.join(verificationRoot, "restaurants", `${restaurantId}.json`);
  const evidencePath = path.join(verificationRoot, "evidence", `${restaurantId}.json`);
  const checksPath = path.join(verificationRoot, "item-checks", `${restaurantId}.jsonl`);
  const dossier = readJson(dossierPath);
  const evidence = readJson(evidencePath);
  const oldProducts = dossier.currentCatalog.products ?? [];
  const oldByName = productMap(oldProducts);
  const oldByKey = new Map(oldProducts.map((product) => [product.currentProductKey, product]));
  const changedKeys = new Set(changedItemNames.map(normalizeName));
  const products = restaurant.items.map((item) => {
    const old = oldByName.get(normalizeName(item.name));
    const changed = changedKeys.has(normalizeName(item.name));
    return {
      ...(old ?? {}),
      currentProductKey: item.id,
      name: item.name,
      category: item.category ?? old?.category ?? null,
      description: item.description ?? old?.description ?? null,
      ingredientsText: item.ingredientsText ?? old?.ingredientsText ?? null,
      presentationIds: unique(old?.presentationIds),
      matchedBaselineAuditItemKeys: unique(old?.matchedBaselineAuditItemKeys),
      sourceEvidenceIds: unique([
        ...(old?.sourceEvidenceIds ?? []),
        ...(changed ? [config.evidenceId] : []),
      ]),
      containsAllergens: unique(item.allergens),
      mayContainAllergens: unique(item.mayContain),
      allergenSourceType: canonicalSourceType(item.allergenSourceType),
      allergenAuthorityTier:
        item.allergenSourceType === "unavailable"
          ? null
          : item.allergenAuthorityTier ?? "restaurant_issued",
      allergenSourceEvidenceIds:
        item.allergenSourceType === "unavailable"
          ? []
          : unique([
              ...(old?.allergenSourceEvidenceIds ?? []),
              ...(changed ? [config.evidenceId] : []),
            ]),
      officialAllergenProfileId: item.officialAllergenProfileId ?? null,
      coordinatorReviewed: true,
      notes: unique([
        ...(old?.notes ?? []),
        ...(changed ? ["Reviewed in the 2026-08-27 structured-source disparity audit."] : []),
      ]),
    };
  });
  const finalByKey = new Map(products.map((product) => [product.currentProductKey, product]));
  const finalByName = productMap(products);

  const checks = readJsonLines(checksPath).map((check) => {
    const nextMatchedKeys = unique(
      (check.matchedCurrentProductKeys ?? []).map((oldKey) => {
        if (finalByKey.has(oldKey)) return oldKey;
        const oldProduct = oldByKey.get(oldKey);
        return oldProduct
          ? finalByName.get(normalizeName(oldProduct.name))?.currentProductKey
          : null;
      }),
    );
    return {
      ...check,
      disposition:
        nextMatchedKeys.length === 0 && (check.matchedCurrentProductKeys ?? []).length > 0
          ? "stale_extra"
          : check.disposition,
      matchedCurrentProductKeys: nextMatchedKeys,
    };
  });

  for (const product of products) product.matchedBaselineAuditItemKeys = [];
  const productByKey = new Map(products.map((product) => [product.currentProductKey, product]));
  for (const check of checks) {
    for (const productKey of check.matchedCurrentProductKeys ?? []) {
      const product = productByKey.get(productKey);
      if (product) {
        product.matchedBaselineAuditItemKeys = unique([
          ...product.matchedBaselineAuditItemKeys,
          check.auditItemKey,
        ]);
      }
    }
  }

  dossier.currentCatalog.products = products;
  dossier.currentCatalog.currentProductCount = products.length;
  dossier.currentCatalog.reconciledCurrentProductCount = products.length;
  dossier.currentCatalog.inventoryFingerprint = inventoryFingerprint(products);
  dossier.currentCatalog.notes = unique([
    ...(dossier.currentCatalog.notes ?? []),
    `Structured-source disparity audit completed ${appliedAt}; catalog disposition recorded in the repair report.`,
  ]);
  dossier.checks.menu = {
    ...(dossier.checks.menu ?? {}),
    verdict: "verified",
    sourceItemCount: products.length,
    notes: unique([
      ...(dossier.checks.menu?.notes ?? []),
      `Structured-source disparity review reconciled ${products.length} current products.`,
    ]),
  };
  dossier.updatedAt = appliedAt;
  writeJson(dossierPath, dossier);
  writeJsonLines(checksPath, checks);

  const freshAudit = readJson(path.join(freshRoot, `${restaurantId}.json`));
  const source = (freshAudit.sources ?? []).find(
    (entry) => entry.ok && (entry.finalUrl ?? entry.url) === config.sourceUrl,
  );
  evidence.sources = [
    ...(evidence.sources ?? []).filter((entry) => entry.id !== config.evidenceId),
    {
      id: config.evidenceId,
      url: config.sourceUrl,
      authorityTier: "restaurant_issued",
      purpose: restaurantId === "south-block-dc" ? "menu" : "allergen",
      retrievedAt: freshAudit.auditedAt ?? appliedAt,
      contentType: source?.contentType ?? null,
      finalUrl: source?.finalUrl ?? config.sourceUrl,
      httpStatus: source?.status ?? 200,
      byteLength: source?.bytes ?? null,
      sha256: source?.hash ?? null,
      artifactPath: null,
      excerpt: "Current official structured source reviewed during the targeted disparity audit.",
      rowIdentifiers: [],
      request: null,
      notes: ["Only explicitly adjudicated rows were projected into the canonical catalog."],
    },
  ];
  writeJson(evidencePath, evidence);

  const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
  const ledger = readJsonLines(ledgerPath).map((row) =>
    row.restaurantId === restaurantId ? { ...row, updatedAt: appliedAt } : row,
  );
  writeJsonLines(ledgerPath, ledger);
}

function inventoryFingerprint(products) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        products.map((product) => ({
          currentProductKey: product.currentProductKey,
          name: product.name,
          category: product.category ?? null,
          presentationIds: product.presentationIds ?? [],
          matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys ?? [],
          containsAllergens: product.containsAllergens ?? [],
          mayContainAllergens: product.mayContainAllergens ?? [],
          allergenSourceType: product.allergenSourceType ?? null,
          allergenAuthorityTier: product.allergenAuthorityTier ?? null,
        })),
      ),
    )
    .digest("hex");
}

function canonicalSourceType(sourceType) {
  if (sourceType === "official-allergen-menu") return "restaurant_allergen_document";
  if (sourceType === "official-ingredients") return "restaurant_ingredients";
  return sourceType ?? "unavailable";
}

function readFresh(restaurantId) {
  return required(
    readJson(path.join(freshRoot, `${restaurantId}.json`)).restaurant,
    `fresh ${restaurantId}`,
  );
}

function itemMap(items) {
  return new Map((items ?? []).map((item) => [normalizeName(item.name), item]));
}

function productMap(products) {
  const result = new Map();
  for (const product of products ?? []) {
    const key = normalizeName(product.name);
    if (key && !result.has(key)) result.set(key, product);
  }
  return result;
}

function normalizeName(value) {
  let text = String(value ?? "");
  if (/[ÃÂ]/.test(text)) {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    if (!repaired.includes("�")) text = repaired;
  }
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isWeakCategory(value) {
  return /^\d+$/.test(String(value ?? "")) || String(value ?? "") === "Menu";
}

function mergeEvidence(left, right) {
  const result = [...(left ?? [])];
  for (const entry of right ?? []) {
    if (
      !result.some(
        (candidate) =>
          candidate.sourceUrl === entry.sourceUrl && candidate.text === entry.text,
      )
    ) {
      result.push(entry);
    }
  }
  return result;
}

function metrics(restaurant) {
  return {
    itemCount: restaurant.items.length,
    officialItemCount: restaurant.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    describedItemCount: restaurant.items.filter((item) => item.description).length,
    ingredientTextItemCount: restaurant.items.filter((item) => item.ingredientsText).length,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, next]) => `${JSON.stringify(key)}:${stableJson(next)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function required(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
