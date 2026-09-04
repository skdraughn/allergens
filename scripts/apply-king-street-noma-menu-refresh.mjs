import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const restaurantId = "king-street-oyster-noma-dc";
const freshPath = path.join(
  root,
  ".codex-tmp/king-targeted-guarded/fresh",
  `${restaurantId}.json`,
);
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const generatedSummaryPath = path.join(root, "src/data/generated/restaurants.summary.generated.json");
const verificationRoot = path.join(root, "data/restaurant-verification");
const recoveryRoot = path.join(verificationRoot, "description-recovery");
const recoveryManifestPath = path.join(recoveryRoot, "manifest.json");
const dossierPath = path.join(verificationRoot, "restaurants", `${restaurantId}.json`);
const evidencePath = path.join(verificationRoot, "evidence", `${restaurantId}.json`);
const checksPath = path.join(verificationRoot, "item-checks", `${restaurantId}.jsonl`);
const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
const reportPath = path.join(
  verificationRoot,
  "reports/king-street-noma-current-menu-refresh.json",
);

const excludedNames = /^(?:coke|decaf|diet coke|ginger ale|hot tea|long island iced tea|oyster shooter flight|sprite)$/i;
const now = new Date().toISOString();

const freshAudit = readJson(freshPath);
const repository = readJson(generatedPath);
const generatedSummary = readJson(generatedSummaryPath);
const dossier = readJson(dossierPath);
const evidence = readJson(evidencePath);
const checks = readJsonLines(checksPath);
const ledger = readJsonLines(ledgerPath);
const generatedIndex = repository.restaurants.findIndex((entry) => entry.id === restaurantId);
if (generatedIndex < 0) throw new Error(`Missing generated restaurant ${restaurantId}`);

const previous = repository.restaurants[generatedIndex];
const previousByName = new Map(previous.items.map((item) => [normalize(item.name), item]));
const baselineCheckByName = new Map(
  checks.map((check) => [normalize(check.baseline.name), check]),
);

const currentItems = dedupeByName(freshAudit.restaurant.items)
  .filter((item) => !/^HH\b/i.test(item.name) && !excludedNames.test(item.name))
  .map((fresh) => {
    const old = previousByName.get(normalize(fresh.name));
    return {
      ...fresh,
      id: slug(fresh.name),
      description: usableDescription(fresh.description),
      allergens: [],
      mayContain: [],
      mayContainAllergens: [],
      allergenSourceType: "unavailable",
      allergenAuthorityTier: null,
      sourceEvidenceIds: ["src-official-menu", "src-toast-noma"],
      sourceUrls: unique(fresh.sourceUrls),
      imageUrl: fresh.imageUrl ?? old?.imageUrl ?? null,
      ingredientsText: null,
      officialAllergenCoveredIds: undefined,
      officialAllergenProfileId: undefined,
    };
  });

if (currentItems.length !== 82) {
  throw new Error(`Expected 82 reviewed King Street food items, found ${currentItems.length}`);
}

const refreshed = await annotateRestaurantWithIngredientIntelligence({
  ...previous,
  items: currentItems,
  itemCount: currentItems.length,
  menuItemCount: currentItems.length,
  totalItemCount: currentItems.length,
  officialItemCount: 0,
  sourceUrls: unique(currentItems.flatMap((item) => item.sourceUrls ?? [])),
  sourceUpdatedAt: now,
  updated: now.slice(0, 10),
  allergenDataStatus: {
    ...(previous.allergenDataStatus ?? {}),
    officialItemCount: 0,
    officialTotal: currentItems.length,
    totalItemCount: currentItems.length,
    officialCoverageRatio: 0,
    bucket: "unavailable",
  },
});

const products = refreshed.items.map((item) => {
  const check = baselineCheckByName.get(normalize(item.name));
  return {
    currentProductKey: item.id,
    name: item.name,
    category: item.category ?? "Menu",
    presentationIds: [],
    matchedBaselineAuditItemKeys: check ? [check.auditItemKey] : [],
    sourceEvidenceIds: ["src-official-menu", "src-toast-noma"],
    containsAllergens: unique(item.allergens),
    mayContainAllergens: unique(item.mayContainAllergens ?? item.mayContain),
    allergenSourceType: item.allergenSourceType ?? "unavailable",
    allergenAuthorityTier: item.allergenAuthorityTier ?? null,
    allergenSourceEvidenceIds: [],
    coordinatorReviewed: true,
    notes: check ? [] : ["Current NoMa menu addition found during the September 2026 source refresh."],
    ingredientIntelligenceBasis: item.ingredientIntelligenceBasis ?? null,
  };
});

const productByNormalizedName = new Map(products.map((product) => [normalize(product.name), product]));
let exactMatchCount = 0;
let staleCount = 0;
for (const check of checks) {
  const product = productByNormalizedName.get(normalize(check.baseline.name));
  if (product) {
    exactMatchCount += 1;
    Object.assign(check, {
      disposition: "exact_match",
      allergenVerdict: "accurately_unavailable",
      sourceEvidenceIds: ["src-official-menu", "src-toast-noma"],
      notes: "Coordinator reconciled this frozen row against the refreshed current NoMa catalog.",
      matchedCurrentProductKeys: [product.currentProductKey],
      adjudicatedContainsAllergens: product.containsAllergens,
      adjudicatedMayContainAllergens: product.mayContainAllergens,
      adjudicatedAllergenSourceType: product.allergenSourceType,
      adjudicatedAllergenAuthorityTier: product.allergenAuthorityTier,
      allergenSourceEvidenceIds: [],
      resolvedFindingIds: [],
    });
  } else {
    staleCount += 1;
    Object.assign(check, {
      disposition: "stale_extra",
      allergenVerdict: "accurately_unavailable",
      sourceEvidenceIds: ["src-official-menu", "src-toast-noma"],
      notes: "Removed after the refreshed exact-location NoMa catalog no longer listed this stale product name.",
      matchedCurrentProductKeys: [],
      adjudicatedContainsAllergens: [],
      adjudicatedMayContainAllergens: [],
      adjudicatedAllergenSourceType: "unavailable",
      adjudicatedAllergenAuthorityTier: null,
      allergenSourceEvidenceIds: [],
      resolvedFindingIds: [],
    });
  }
}

if (exactMatchCount !== 61 || staleCount !== 2) {
  throw new Error(`Expected 61 exact and 2 stale baseline rows, found ${exactMatchCount}/${staleCount}`);
}

const additions = products.filter((product) => product.matchedBaselineAuditItemKeys.length === 0);
if (additions.length !== 21) {
  throw new Error(`Expected 21 current additions, found ${additions.length}`);
}

dossier.updatedAt = now;
dossier.currentCatalog = {
  ...dossier.currentCatalog,
  status: "verified",
  reviewedBaselineItemCount: checks.length,
  currentProductCount: products.length,
  reconciledCurrentProductCount: products.length,
  inventoryFingerprint: sha256Json(products.map(currentProductFingerprintRecord)),
  surfaces: [
    {
      surfaceId: "official-noma-ordering",
      title: "King Street Oyster Bar NoMa online menu",
      url: "https://kingstreetoysterbar.com/order/king-street-oyster-bar-noma-22-m-st-ne-washington-dc-20002",
      current: true,
      scopeStatus: "complete",
      verified: true,
      evidenceIds: ["src-official-menu", "src-toast-noma"],
      notes: ["Exact NoMa location catalog; beverage-only entries excluded from the food menu."],
    },
  ],
  products,
  notes: unique([
    ...(dossier.currentCatalog.notes ?? []),
    "September 2026 exact-location refresh reconciled 82 current food items: 61 retained baseline matches, 21 additions, and 2 stale baseline removals.",
  ]),
};
dossier.checks.menu = {
  ...dossier.checks.menu,
  verdict: "verified",
  reviewedItemCount: checks.length,
  sourceItemCount: products.length,
  notes: [
    "The exact NoMa owned-domain and linked Toast surfaces were reconciled; four obvious beverage entries were excluded.",
  ],
};
dossier.reconciliation = {
  exact_match: exactMatchCount,
  stale_extra: staleCount,
  current_addition: additions.length,
  unresolved: 0,
};

const sourceByUrl = new Map(freshAudit.sources.map((source) => [source.url, source]));
const evidenceById = new Map(evidence.sources.map((source) => [source.id, source]));
updateEvidence(
  evidenceById.get("src-official-menu"),
  sourceByUrl.get("https://kingstreetoysterbar.com/order/king-street-oyster-bar-noma-22-m-st-ne-washington-dc-20002"),
  "Restaurant-owned exact-location NoMa ordering surface; reviewed as the primary current menu.",
);
updateEvidence(
  evidenceById.get("src-toast-noma"),
  sourceByUrl.get("https://order.toasttab.com/online/king-street-oyster-bar-noma-22-m-st-ne-washington-dc-20002"),
  "Restaurant-linked exact-location Toast catalog corroborating the current NoMa menu.",
);

const ledgerRow = ledger.find((row) => row.restaurantId === restaurantId);
if (!ledgerRow) throw new Error(`Missing ledger row ${restaurantId}`);
ledgerRow.updatedAt = now;
ledgerRow.repairStatus = "verified";
ledgerRow.verdicts = {
  menu: "verified",
  allergenSource: "accurately_unavailable",
  extraction: "not_applicable",
};
ledgerRow.findingCounts = { critical: 0, high: 0, medium: 0, low: 0 };

repository.restaurants[generatedIndex] = refreshed;
repository.itemCount = repository.restaurants.reduce(
  (sum, restaurant) => sum + (restaurant.items ?? []).length,
  0,
);
repository.generatedAt = now;

const priorRecoveryManifest = readJson(recoveryManifestPath);
const priorRecoveryBytes = fs.readFileSync(
  path.join(recoveryRoot, priorRecoveryManifest.activeOverlay),
);
const priorRecovery = JSON.parse(gunzipSync(priorRecoveryBytes).toString("utf8"));
const retainedRecoveryRecords = priorRecovery.records.filter(
  (record) => record.restaurantId !== restaurantId,
);
const kingRecoveryRecords = refreshed.items
  .filter((item) => item.description)
  .map((item) => ({
    restaurantId,
    restaurantName: refreshed.name,
    itemId: item.id,
    itemName: item.name,
    category: item.category ?? null,
    classification: "exact_id",
    matchKey: "restaurantId+itemId+normalizedName",
    description: item.description,
    sources: unique(item.sourceUrls),
    sourceTypes: ["reviewed-official-menu-description"],
  }));
const recoveryRecords = [...retainedRecoveryRecords, ...kingRecoveryRecords].sort(
  (left, right) =>
    left.restaurantId.localeCompare(right.restaurantId) || left.itemId.localeCompare(right.itemId),
);
const recoveryPlan = {
  schemaVersion: 1,
  generatedAt: now,
  targetCatalog: "src/data/generated/restaurants.generated.json",
  targetCatalogSha256: sha256(Buffer.from(`${JSON.stringify(repository)}\n`)),
  exactIdRecoverable: recoveryRecords.filter((record) => record.classification === "exact_id").length,
  exactNameRecoverable: recoveryRecords.filter((record) => record.classification === "exact_name").length,
  recoveryCount: recoveryRecords.length,
  conflictCount: priorRecovery.conflictCount ?? 0,
  fuzzyOrSemanticMatching: false,
  records: recoveryRecords,
};
const recoveryBytes = gzipSync(Buffer.from(JSON.stringify(recoveryPlan)), { level: 9 });
const recoverySha256 = sha256(recoveryBytes);
const recoveryName = `v1-${recoverySha256.slice(0, 20)}.json.gz`;
const recoveryRelativePath = `data/restaurant-verification/description-recovery/${recoveryName}`;
writeJson(recoveryManifestPath, {
  schemaVersion: 1,
  generatedAt: now,
  activeOverlay: recoveryName,
  planSha256: recoverySha256,
  recoveryCount: recoveryPlan.recoveryCount,
  exactIdCount: recoveryPlan.exactIdRecoverable,
  exactNameCount: recoveryPlan.exactNameRecoverable,
  conflictCountSkipped: recoveryPlan.conflictCount,
  fuzzyOrSemanticMatching: false,
});
fs.writeFileSync(path.join(recoveryRoot, recoveryName), recoveryBytes);
repository.metadata ||= {};
repository.metadata.descriptionRecovery = {
  schemaVersion: 1,
  appliedAt: now,
  planSha256: recoverySha256,
  overlayPath: recoveryRelativePath,
  recoveryCount: recoveryPlan.recoveryCount,
  exactIdCount: recoveryPlan.exactIdRecoverable,
  exactNameCount: recoveryPlan.exactNameRecoverable,
  conflictCountSkipped: recoveryPlan.conflictCount,
  fuzzyOrSemanticMatching: false,
};
generatedSummary.generatedAt = now;
generatedSummary.restaurantCount = repository.restaurantCount;
generatedSummary.itemCount = repository.itemCount;

writeJson(generatedPath, repository);
writeJson(generatedSummaryPath, generatedSummary);
writeJson(dossierPath, dossier);
writeJson(evidencePath, evidence);
writeJsonLines(checksPath, checks);
writeJsonLines(ledgerPath, ledger);
writeJson(reportPath, {
  schemaVersion: 1,
  restaurantId,
  appliedAt: now,
  sourceAudit: path.relative(root, freshPath),
  before: { itemCount: dossier.currentCatalog.reviewedBaselineItemCount },
  after: {
    itemCount: refreshed.items.length,
    describedItemCount: refreshed.items.filter((item) => item.description).length,
    ingredientIntelligenceReviewedCount: refreshed.items.filter(
      (item) => item.ingredientIntelligenceReviewed,
    ).length,
  },
  descriptionRecovery: {
    recordCount: kingRecoveryRecords.length,
    overlayPath: recoveryRelativePath,
    overlaySha256: recoverySha256,
  },
  reconciliation: dossier.reconciliation,
  additions: additions.map((product) => product.name),
  removals: checks
    .filter((check) => check.disposition === "stale_extra")
    .map((check) => check.baseline.name),
  excludedNonFoodEntries: ["DECAF", "HOT TEA", "LONG ISLAND ICED TEA", "OYSTER SHOOTER FLIGHT"],
});

console.log(JSON.stringify({
  restaurantId,
  before: previous.items.length,
  after: refreshed.items.length,
  described: refreshed.items.filter((item) => item.description).length,
  ingredientIntelligenceReviewed: refreshed.items.filter(
    (item) => item.ingredientIntelligenceReviewed,
  ).length,
  exactMatchCount,
  additions: additions.length,
  staleCount,
}, null, 2));

function updateEvidence(target, source, excerpt) {
  if (!target || !source) throw new Error("Missing King Street evidence/source record");
  Object.assign(target, {
    retrievedAt: freshAudit.auditedAt,
    contentType: source.contentType,
    finalUrl: source.finalUrl,
    httpStatus: source.status,
    byteLength: source.bytes,
    sha256: source.hash,
    artifactPath: null,
    excerpt,
    rowIdentifiers: ["12 EAST COAST", "KING STREET PO BOY", "SHANGHAI SEA BASS"],
    notes: ["Exact NoMa location scope verified; beverage-only records are excluded."],
  });
}

function usableDescription(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text && !/^(?:full menu|menu)$/i.test(text) ? text : null;
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
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function slug(value) {
  return normalize(value).replace(/\s+/g, "-");
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

function dedupeByName(items) {
  const byName = new Map();
  for (const item of items ?? []) {
    const key = normalize(item.name);
    if (!byName.has(key)) byName.set(key, item);
  }
  return [...byName.values()];
}

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}
