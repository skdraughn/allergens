import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const verificationRoot = path.join(root, "data/restaurant-verification");
const freshRoot = path.join(
  verificationRoot,
  "reports/source-parity-audit/fresh",
);
const reportPath = path.join(
  verificationRoot,
  "reports/corpus-source-parity-repairs.json",
);
const appliedAt = "2026-08-27T16:45:19.070Z";
const auditedBeforeById = {
  "chadwicks-alexandria-va-dc-metro": { itemCount: 110, officialItemCount: 80, describedItemCount: 90, ingredientTextItemCount: 0 },
  "chaatwala-herndon-va-dc-metro": { itemCount: 87, officialItemCount: 35, describedItemCount: 80, ingredientTextItemCount: 0 },
  "chain-bruster-s-ice-cream": { itemCount: 157, officialItemCount: 157, describedItemCount: 0, ingredientTextItemCount: 157 },
  "baskin-robbins": { itemCount: 60, officialItemCount: 60, describedItemCount: 0, ingredientTextItemCount: 0 },
  "centrolina-dc": { itemCount: 35, officialItemCount: 15, describedItemCount: 34, ingredientTextItemCount: 0 },
  "blue-ridge-seafood-restaurant-gainesville-va": { itemCount: 126, officialItemCount: 0, describedItemCount: 76, ingredientTextItemCount: 0 },
  "replacement-nue-elegantly-vietnamese-falls-church-va": { itemCount: 67, officialItemCount: 0, describedItemCount: 27, ingredientTextItemCount: 3 },
  "mezeh-dc": { itemCount: 74, officialItemCount: 0, describedItemCount: 0, ingredientTextItemCount: 0 },
  sbarro: { itemCount: 86, officialItemCount: 0, describedItemCount: 85, ingredientTextItemCount: 86 },
};

const replaceFromCanonical = [
  "chadwicks-alexandria-va-dc-metro",
  "chaatwala-herndon-va-dc-metro",
  "chain-bruster-s-ice-cream",
];
const overlayCanonicalClaims = [
  "baskin-robbins",
  "centrolina-dc",
  "blue-ridge-seafood-restaurant-gainesville-va",
  "replacement-nue-elegantly-vietnamese-falls-church-va",
];
const freshOfficialRepairs = {
  "mezeh-dc": {
    evidenceId: "ev-corpus-parity-mezeh-matrix",
    profileId: "m-source-parity",
    coveredAllergenIds: [
      "egg",
      "milk",
      "sesame",
      "shellfish",
      "soy",
      "tree-nut",
      "wheat",
    ],
    sourceType: "restaurant-issued-allergen-matrix",
    sourceUrl:
      "https://mezehstorage.blob.core.windows.net/menupdf/sping2025_nutrition_info_and_allergen.pdf",
  },
  sbarro: {
    evidenceId: "ev-corpus-parity-sbarro-guide",
    profileId: "m-source-parity",
    coveredAllergenIds: [
      "egg",
      "fish",
      "milk",
      "peanut",
      "sesame",
      "shellfish",
      "soy",
      "tree-nut",
      "wheat",
    ],
    sourceType: "restaurant-issued-ingredient-allergen-guide",
    sourceUrl:
      "https://sbarro.com/wp-content/uploads/2022/10/Sbarro-Nutrition-and-Allergen-Info-10.12.22.pdf",
  },
};

const repository = readJson(generatedPath);
const priorReport = fs.existsSync(reportPath) ? readJson(reportPath) : null;
const priorRepairById = new Map(
  (priorReport?.repairs ?? []).map((repair) => [repair.restaurantId, repair]),
);
const generatedById = new Map(
  repository.restaurants.map((restaurant) => [restaurant.id, restaurant]),
);
const repairs = [];

for (const restaurantId of replaceFromCanonical) {
  const generated = required(generatedById.get(restaurantId), restaurantId);
  const dossier = readDossier(restaurantId);
  const before = metrics(generated);
  const evidence = readEvidence(restaurantId);
  const sourceById = new Map((evidence.sources ?? []).map((source) => [source.id, source]));
  const oldById = new Map((generated.items ?? []).map((item) => [item.id, item]));
  const oldByName = uniqueItemMap(generated.items ?? []);
  const items = (dossier.currentCatalog?.products ?? []).map((product) =>
    generatedItemFromCanonicalProduct(product, {
      old: oldById.get(product.currentProductKey) ?? oldByName.get(normalize(product.name)),
      sourceById,
    }),
  );
  const repaired = await finalizeRestaurant({
    ...generated,
    items,
    officialAllergenProfiles: compactProfiles(
      dossier.currentCatalog?.officialAllergenProfiles,
    ),
  });
  generatedById.set(restaurantId, repaired);
  repairs.push({
    restaurantId,
    repairType: "canonical-catalog-replacement",
    before: auditedBeforeById[restaurantId] ?? priorRepairById.get(restaurantId)?.before ?? before,
    after: metrics(repaired),
  });
}

for (const restaurantId of overlayCanonicalClaims) {
  const generated = required(generatedById.get(restaurantId), restaurantId);
  const dossier = readDossier(restaurantId);
  const before = metrics(generated);
  const canonicalByName = uniqueItemMap(dossier.currentCatalog?.products ?? []);
  const evidence = readEvidence(restaurantId);
  const sourceById = new Map((evidence.sources ?? []).map((source) => [source.id, source]));
  let updatedItemCount = 0;
  const items = (generated.items ?? []).map((item) => {
    const product = canonicalByName.get(normalize(item.name));
    if (!product || !hasCanonicalOfficialClaim(product)) return item;
    updatedItemCount += 1;
    return applyCanonicalClaim(item, product, sourceById);
  });
  const repaired = await finalizeRestaurant({
    ...generated,
    items,
    officialAllergenProfiles: mergeProfiles(
      generated.officialAllergenProfiles,
      compactProfiles(dossier.currentCatalog?.officialAllergenProfiles),
    ),
  });
  generatedById.set(restaurantId, repaired);
  repairs.push({
    restaurantId,
    repairType: "canonical-official-claim-overlay",
    updatedItemCount,
    before: auditedBeforeById[restaurantId] ?? priorRepairById.get(restaurantId)?.before ?? before,
    after: metrics(repaired),
  });
}

for (const [restaurantId, config] of Object.entries(freshOfficialRepairs)) {
  const generated = required(generatedById.get(restaurantId), restaurantId);
  const freshAudit = readJson(path.join(freshRoot, `${restaurantId}.json`));
  const freshByName = uniqueItemMap(freshAudit.restaurant?.items ?? []);
  const before = metrics(generated);
  let updatedItemCount = 0;
  const items = (generated.items ?? []).map((item) => {
    const fresh = freshByName.get(normalize(item.name));
    if (!fresh || fresh.allergenSourceType === "unavailable") return item;
    updatedItemCount += 1;
    return {
      ...item,
      description: fresh.description ?? item.description ?? null,
      ingredientsText: fresh.ingredientsText ?? item.ingredientsText ?? null,
      allergens: unique(fresh.allergens),
      mayContain: unique(fresh.mayContain),
      allergenSourceType: fresh.allergenSourceType,
      allergenAuthorityTier: "restaurant_issued",
      allergenSourceEvidenceIds: [config.evidenceId],
      officialAllergenProfileId: config.profileId,
      sourceType: fresh.sourceType ?? item.sourceType,
      sourceUrls: unique([...(item.sourceUrls ?? []), config.sourceUrl]),
      evidence: mergeEvidence(item.evidence, {
        sourceKind: config.sourceType,
        sourceUrl: config.sourceUrl,
        text: `${fresh.name}: restaurant-issued allergen row`,
      }),
      inferredAllergenSignals: [],
      inferredIngredients: [],
      inferredQuestions: [],
    };
  });
  const profile = {
    [config.profileId]: {
      coveredAllergenIds: [...config.coveredAllergenIds],
    },
  };
  const repaired = await finalizeRestaurant({
    ...generated,
    items,
    officialAllergenProfiles: mergeProfiles(generated.officialAllergenProfiles, profile),
  });
  generatedById.set(restaurantId, repaired);
  updateCanonicalFreshOfficialRepair({
    config,
    freshAudit,
    restaurant: repaired,
    restaurantId,
  });
  repairs.push({
    restaurantId,
    repairType: "fresh-restaurant-issued-official-overlay",
    updatedItemCount,
    before: auditedBeforeById[restaurantId] ?? priorRepairById.get(restaurantId)?.before ?? before,
    after: metrics(repaired),
  });
}

repository.restaurants = repository.restaurants.map(
  (restaurant) => generatedById.get(restaurant.id) ?? restaurant,
);
repository.generatedAt = appliedAt;
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce(
  (count, restaurant) => count + (restaurant.items ?? []).length,
  0,
);
writeJson(generatedPath, repository);
writeJson(reportPath, {
  schemaVersion: 1,
  appliedAt,
  sourceAuditPath:
    "data/restaurant-verification/reports/source-parity-audit/summary.json",
  repairs,
  summary: {
    restaurantCount: repairs.length,
    catalogReplacementCount: repairs.filter(
      (repair) => repair.repairType === "canonical-catalog-replacement",
    ).length,
    canonicalClaimOverlayCount: repairs.filter(
      (repair) => repair.repairType === "canonical-official-claim-overlay",
    ).length,
    freshOfficialOverlayCount: repairs.filter(
      (repair) => repair.repairType === "fresh-restaurant-issued-official-overlay",
    ).length,
  },
});
console.log(JSON.stringify({ repository: metrics(repository), repairs }, null, 2));

async function finalizeRestaurant(restaurant) {
  const annotated = await annotateRestaurantWithIngredientIntelligence(restaurant);
  const itemCount = annotated.items?.length ?? 0;
  const officialItemCount = (annotated.items ?? []).filter(isGeneratedOfficial).length;
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

function generatedItemFromCanonicalProduct(product, { old = {}, sourceById }) {
  return {
    ...old,
    id: product.currentProductKey,
    name: product.name,
    category: product.category ?? old.category ?? "Menu",
    description: product.description ?? old.description ?? null,
    ingredientsText: product.ingredientsText ?? old.ingredientsText ?? null,
    allergens: unique(product.containsAllergens),
    mayContain: unique(product.mayContainAllergens),
    allergenSourceType: product.allergenSourceType ?? "unavailable",
    allergenAuthorityTier: product.allergenAuthorityTier ?? null,
    allergenSourceEvidenceIds: unique(product.allergenSourceEvidenceIds),
    officialAllergenProfileId: product.officialAllergenProfileId ?? null,
    sourceType: sourceTypeForCanonicalProduct(product),
    sourceUrls: sourceUrlsForEvidenceIds(product.sourceEvidenceIds, sourceById),
    evidence: unique(product.sourceEvidenceIds).map((evidenceId) => ({
      sourceKind: sourceById.get(evidenceId)?.authorityTier ?? "restaurant_issued",
      sourceUrl: sourceById.get(evidenceId)?.url ?? null,
      text: product.name,
    })),
    matchedBaselineAuditItemKeys: unique(product.matchedBaselineAuditItemKeys),
    inferredAllergenSignals: [],
    inferredIngredients: [],
    inferredQuestions: [],
  };
}

function applyCanonicalClaim(item, product, sourceById) {
  const sourceUrls = sourceUrlsForEvidenceIds(
    unique([...(product.sourceEvidenceIds ?? []), ...(product.allergenSourceEvidenceIds ?? [])]),
    sourceById,
  );
  return {
    ...item,
    allergens: unique(product.containsAllergens),
    mayContain: unique(product.mayContainAllergens),
    allergenSourceType: product.allergenSourceType,
    allergenAuthorityTier: product.allergenAuthorityTier ?? "restaurant_issued",
    allergenSourceEvidenceIds: unique(product.allergenSourceEvidenceIds),
    officialAllergenProfileId: product.officialAllergenProfileId ?? null,
    sourceUrls: unique([...(item.sourceUrls ?? []), ...sourceUrls]),
    inferredAllergenSignals: [],
    inferredIngredients: [],
    inferredQuestions: [],
  };
}

function updateCanonicalFreshOfficialRepair({ config, freshAudit, restaurant, restaurantId }) {
  const dossierPath = path.join(verificationRoot, "restaurants", `${restaurantId}.json`);
  const evidencePath = path.join(verificationRoot, "evidence", `${restaurantId}.json`);
  const checksPath = path.join(verificationRoot, "item-checks", `${restaurantId}.jsonl`);
  const dossier = readJson(dossierPath);
  const evidence = readJson(evidencePath);
  const freshSource = (freshAudit.sources ?? []).find(
    (source) => source.ok && (source.finalUrl ?? source.url) === config.sourceUrl,
  );
  const generatedByName = uniqueItemMap(restaurant.items ?? []);

  dossier.currentCatalog.officialAllergenProfiles = {
    ...(dossier.currentCatalog.officialAllergenProfiles ?? {}),
    [config.profileId]: {
      coveredAllergenIds: [...config.coveredAllergenIds],
      sourceEvidenceIds: [config.evidenceId],
      sourceType: config.sourceType,
    },
  };
  dossier.currentCatalog.products = (dossier.currentCatalog.products ?? []).map((product) => {
    const generated = generatedByName.get(normalize(product.name));
    if (!generated || generated.officialAllergenProfileId !== config.profileId) return product;
    return {
      ...product,
      description: generated.description ?? product.description ?? null,
      ingredientsText: generated.ingredientsText ?? product.ingredientsText ?? null,
      containsAllergens: unique(generated.allergens),
      mayContainAllergens: unique(generated.mayContain),
      allergenSourceType: generated.allergenSourceType,
      allergenAuthorityTier: "restaurant_issued",
      allergenSourceEvidenceIds: [config.evidenceId],
      officialAllergenProfileId: config.profileId,
      sourceEvidenceIds: unique([...(product.sourceEvidenceIds ?? []), config.evidenceId]),
      notes: unique([
        ...(product.notes ?? []),
        "Source-parity audit restored the restaurant-issued allergen row.",
      ]),
    };
  });
  dossier.currentCatalog.inventoryFingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        dossier.currentCatalog.products.map((product) => ({
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
  const directCount = dossier.currentCatalog.products.filter(
    (product) => product.officialAllergenProfileId === config.profileId,
  ).length;
  dossier.checks.allergenSource = {
    ...(dossier.checks.allergenSource ?? {}),
    verdict: "verified",
    directPositiveCount: dossier.currentCatalog.products.filter(
      (product) => (product.containsAllergens ?? []).length > 0,
    ).length,
    directAssertionCount: directCount,
    unavailableCount: dossier.currentCatalog.products.length - directCount,
    highestAuthorityTier: "restaurant_issued",
    notes: unique([
      ...(dossier.checks.allergenSource?.notes ?? []),
      `Corpus source-parity audit restored ${directCount} exact-name restaurant-issued rows.`,
    ]),
  };
  dossier.updatedAt = appliedAt;
  writeJson(dossierPath, dossier);

  evidence.sources = [
    ...(evidence.sources ?? []).filter((source) => source.id !== config.evidenceId),
    {
      id: config.evidenceId,
      url: config.sourceUrl,
      authorityTier: "restaurant_issued",
      purpose: "allergen",
      retrievedAt: freshAudit.auditedAt ?? appliedAt,
      contentType: freshSource?.contentType ?? "application/pdf",
      finalUrl: freshSource?.finalUrl ?? config.sourceUrl,
      httpStatus: freshSource?.status ?? 200,
      byteLength: freshSource?.bytes ?? null,
      sha256: freshSource?.hash ?? null,
      artifactPath: null,
      excerpt: "Restaurant-hosted product-level allergen document parsed during the corpus source-parity audit.",
      rowIdentifiers: [],
      request: null,
      notes: ["Exact normalized item-name overlay only; unmatched catalog items remain unavailable."],
    },
  ];
  writeJson(evidencePath, evidence);

  const checks = readJsonLines(checksPath);
  const productByKey = new Map(
    dossier.currentCatalog.products.map((product) => [product.currentProductKey, product]),
  );
  const updatedChecks = checks.map((check) => {
    const products = (check.matchedCurrentProductKeys ?? [])
      .map((key) => productByKey.get(key))
      .filter((product) => product?.officialAllergenProfileId === config.profileId);
    if (!products.length) return check;
    return {
      ...check,
      allergenVerdict: "verified",
      adjudicatedContainsAllergens: unique(products.flatMap((product) => product.containsAllergens)),
      adjudicatedMayContainAllergens: unique(
        products.flatMap((product) => product.mayContainAllergens),
      ),
      adjudicatedAllergenSourceType: products[0].allergenSourceType,
      adjudicatedAllergenAuthorityTier: "restaurant_issued",
      allergenSourceEvidenceIds: [config.evidenceId],
      officialAllergenProfileId: config.profileId,
      sourceEvidenceIds: unique([...(check.sourceEvidenceIds ?? []), config.evidenceId]),
    };
  });
  writeJsonLines(checksPath, updatedChecks);

  const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
  const ledger = readJsonLines(ledgerPath).map((row) =>
    row.restaurantId === restaurantId
      ? {
          ...row,
          updatedAt: appliedAt,
          verdicts: {
            ...(row.verdicts ?? {}),
            allergenSource: "verified",
          },
        }
      : row,
  );
  writeJsonLines(ledgerPath, ledger);
}

function sourceTypeForCanonicalProduct(product) {
  if (product.allergenSourceType === "restaurant_ingredients") return "official-menu";
  if (product.allergenSourceType === "restaurant_allergen_document") return "official-allergen-menu";
  return "verified-catalog";
}

function hasCanonicalOfficialClaim(product) {
  return (
    product.allergenSourceType !== "unavailable" &&
    Boolean(
      (product.containsAllergens ?? []).length ||
        (product.mayContainAllergens ?? []).length ||
        product.officialAllergenProfileId ||
        product.allergenSourceEvidenceIds?.length,
    )
  );
}

function isGeneratedOfficial(item) {
  return item.allergenSourceType !== "unavailable";
}

function compactProfiles(profiles) {
  return Object.fromEntries(
    Object.entries(profiles ?? {}).map(([profileId, profile]) => [
      profileId,
      { coveredAllergenIds: unique(profile.coveredAllergenIds) },
    ]),
  );
}

function mergeProfiles(left, right) {
  const merged = { ...(left ?? {}), ...(right ?? {}) };
  return Object.keys(merged).length ? merged : undefined;
}

function sourceUrlsForEvidenceIds(evidenceIds, sourceById) {
  return unique(evidenceIds).map((id) => sourceById.get(id)?.url).filter(Boolean);
}

function mergeEvidence(entries, entry) {
  const values = Array.isArray(entries) ? entries : [];
  if (values.some((value) => value?.sourceUrl === entry.sourceUrl && value?.text === entry.text)) {
    return values;
  }
  return [...values, entry];
}

function uniqueItemMap(items) {
  const map = new Map();
  for (const item of items) {
    const key = normalize(item.name);
    if (key && !map.has(key)) map.set(key, item);
  }
  return map;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function metrics(value) {
  if (Array.isArray(value?.restaurants)) {
    return {
      restaurantCount: value.restaurants.length,
      itemCount: value.restaurants.reduce(
        (count, restaurant) => count + (restaurant.items ?? []).length,
        0,
      ),
    };
  }
  const items = value?.items ?? [];
  return {
    itemCount: items.length,
    officialItemCount: items.filter(isGeneratedOfficial).length,
    describedItemCount: items.filter((item) => item.description).length,
    ingredientTextItemCount: items.filter((item) => item.ingredientsText).length,
  };
}

function required(value, label) {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function readDossier(restaurantId) {
  return readJson(path.join(verificationRoot, "restaurants", `${restaurantId}.json`));
}

function readEvidence(restaurantId) {
  return readJson(path.join(verificationRoot, "evidence", `${restaurantId}.json`));
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
