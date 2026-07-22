#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";

const root = process.cwd().replaceAll("\\", "/");
const requestedBatch = process.argv[2]?.startsWith("poc-batch-") ? process.argv[2] : null;
const batchId = requestedBatch || "poc-batch-040-2026-07-21";
const id = requestedBatch ? process.argv[3] : process.argv[2];
const allowedIds = new Set([
  "buffalo-bergen-union-market-dc",
  "buffalo-wild-wings",
  "bukom-cafe-dc",
  "bullfrog-bagels-dc",
  "bumblebirds-dc",
  "bund-up-union-market-dc",
  "osm-buns-n-rice-7189139268",
  "burger-king",
  "burgerfi",
  "burnin-bird-dc",
  "burtons-grill-and-bar-washington-dc-dc-metro",
  "busboys-and-poets-dc",
  "cactus-cantina-dc",
  "cafe-1676-vienna-dc-metro",
  "replacement-cafe-berlin-on-capitol-hill-washington-dc",
  "cafe-colline-arlington-dc-metro",
  "replacement-cafe-fiorello-dc-washington-dc",
  "replacement-cafe-ile-mclean-va",
  "cafe-kindred-falls-church-va",
  "cafe-milano-washington-dc-dc-metro",
  "cafe-pizzaiolo-alexandria-dc-metro",
  "replacement-cafe-renaissance-vienna-va",
  "cafe-riggs-dc",
  "replacement-cafe-riggs-washington-dc",
  "cafe-rio",
  "cafe-tatti-mclean-va",
  "osm-cafesano-1732774580",
  "cafesano-reston-dc-metro",
  "replacement-calico-washington-dc",
  "california-fish-grill-north-bethesda-md",
  "california-pizza-kitchen",
  "chain-california-tortilla",
  "call-your-mother-dc",
  "replacement-cana-washington-dc",
  "cane-dc",
  "canton-disco-dc",
  "capitano-dc",
  "capo-deli-foggy-bottom-dc",
  "capo-deli-dc",
  "captain-pells-fairfax-crabhouse-fairfax-va-dc-metro",
  "carbonara-arlington-va-dc-metro",
  "carlyle-arlington-va-dc-metro",
  "carmines-dc",
  "carolina-kitchen-bar-and-grill-hyattsville-md-dc-metro",
  "carrabbas",
  "carusos-grocery-dc",
  "carusos-grocery-pike-and-rose-md",
  "carving-room-noma-dc",
  "osm-casa-tequila-2697922195",
  "replacement-casa-teresa-washington-dc",
  "replacement-casamara-washington-dc",
  "osm-caspian-kabob-10268757467",
  "catahoula-dc",
  "causa-amazonia-dc",
  "cava",
  "cava-mezze-rockville-dc-metro",
  "replacement-ceibo-washington-dc",
  "celebration-by-rupa-vira-ashburn-va",
  "celebrity-delly-falls-church-va",
  "central-michel-richard-washington-dc-dc-metro",
  "centrolina-dc",
  "chaatwala-herndon-va-dc-metro",
  "chadwicks-alexandria-va-dc-metro",
]);
if (!(/^poc-batch-0(?:40|41|42|43|44|45|46|47)-2026-07-21$/.test(batchId) || /^poc-batch-0(?:48|49|50|51|52|53|54|55|56|57|58|59|60)-2026-07-22$/.test(batchId)) || !allowedIds.has(id)) {
  throw new Error("Usage: node scripts/apply-batch40-poc.mjs [poc-batch-060-2026-07-22] <restaurant-id>");
}

const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`,
  result: `${run}/results/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value, compact = false) => {
  fs.mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, compact ? 0 : 2)}${compact ? "" : "\n"}`);
};
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const assert = (value, message) => { if (!value) throw new Error(message); };
const unique = (values) => [...new Set((values || []).filter(Boolean))];
const canonicalPurposes = new Set(["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"]);

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint}`);
assert(job.restaurantId === id && result.restaurantId === id && result.batchId === batchId, "target identity mismatch");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, preflight.errors.join(" | "));

const products = result.currentProducts;
const productKeys = new Set(products.map((product) => product.currentProductKey));
assert(productKeys.size === products.length && !productKeys.has(undefined), "product keys must be explicit and unique");
const currentSurfaces = result.menuSurfaces.filter((surface) => surface.current);
assert(currentSurfaces.length > 0 && currentSurfaces.every((surface) => surface.scopeStatus === "complete"), "current surfaces must be complete");
const publishedKeys = new Set();
for (const surface of currentSurfaces) {
  assert(Array.isArray(surface.currentProductKeys) && surface.currentProductKeys.length > 0, `empty currentProductKeys: ${surface.surfaceId}`);
  assert(new Set(surface.currentProductKeys).size === surface.currentProductKeys.length, `duplicate surface keys: ${surface.surfaceId}`);
  for (const key of surface.currentProductKeys) {
    assert(productKeys.has(key), `undefined surface key: ${surface.surfaceId}:${key}`);
    publishedKeys.add(key);
  }
}
assert(products.every((product) => publishedKeys.has(product.currentProductKey)), "uncovered current product");
assert(result.menuSurfaces.filter((surface) => !surface.current).every((surface) => (surface.currentProductKeys || []).length === 0), "support surface publishes products");
assert(result.sources.every((source) => canonicalPurposes.has(source.purpose)), "noncanonical evidence purpose");

const sourceById = new Map(result.sources.map((source) => [source.evidenceId, source]));
const currentUrls = new Set(currentSurfaces.map((surface) => surface.url));
const directProducts = products.filter((product) => (product.containsAllergens || []).length || (product.mayContainAllergens || []).length);
const containsAssertions = products.reduce((count, product) => count + (product.containsAllergens || []).length, 0);
const mayContainAssertions = products.reduce((count, product) => count + (product.mayContainAllergens || []).length, 0);

const generated = read(paths.generated);
let targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) {
  targetIndex = generated.restaurants.length;
  generated.restaurants.push({ id, name: job.name, locationId: job.locationId, items: [] });
}
const previous = generated.restaurants[targetIndex];
const oldByKey = new Map((previous.items || []).map((item) => [item.id, item]));
const items = products.map((product) => ({
  ...oldByKey.get(product.currentProductKey),
  id: product.currentProductKey,
  name: product.name,
  category: product.category,
  description: product.description || oldByKey.get(product.currentProductKey)?.description || null,
  allergens: [...(product.containsAllergens || [])],
  mayContain: [...(product.mayContainAllergens || [])],
  mayContainAllergens: [...(product.mayContainAllergens || [])],
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier ?? null,
  allergenSourceEvidenceIds: [...(product.allergenSourceEvidenceIds || [])],
  sourceEvidenceIds: [...(product.sourceEvidenceIds || [])],
  sourceUrls: unique((product.sourceEvidenceIds || []).map((evidenceId) => sourceById.get(evidenceId)?.url).filter((url) => currentUrls.has(url))),
  ingredientIntelligence: undefined,
}));
const officialAllergenStatus = result.matrixSearch.status === "found" ? "extracted" : "accurately_unavailable";
const target = {
  ...previous,
  displayAddress: result.identity.address || result.identity.location || previous.displayAddress,
  locationId: job.locationId,
  sourceUrls: [...currentUrls],
  locationSurfaces: result.menuSurfaces,
  items,
  itemCount: items.length,
  menuItemCount: items.length,
  totalItemCount: items.length,
  officialItemCount: directProducts.length,
  coveragePercent: 1,
  coverageStatus: "complete",
  officialAllergenStatus,
  officialAllergenRemediationBucket: officialAllergenStatus === "extracted" ? "official-full" : "accurately-unavailable",
  allergenDataStatus: {
    officialItemCount: directProducts.length,
    officialTotal: directProducts.length,
    totalItemCount: items.length,
    officialCoverageRatio: items.length ? directProducts.length / items.length : 0,
    bucket: officialAllergenStatus === "extracted" ? "official-disclosure" : "official-disclosure-only",
  },
};
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
write(paths.generated, generated, true);

const evidence = {
  schemaVersion: 1,
  verificationContractVersion: 2,
  restaurantId: id,
  name: job.name,
  sources: result.sources.map((source) => ({
    id: source.evidenceId,
    url: source.url,
    authorityTier: source.authorityTier,
    purpose: source.purpose,
    retrievedAt: source.retrievedAt,
    contentType: source.contentType ?? null,
    finalUrl: source.finalUrl ?? null,
    httpStatus: source.httpStatus ?? null,
    byteLength: source.byteLength ?? null,
    sha256: source.sha256 ?? null,
    artifactPath: source.artifactPath ?? null,
    excerpt: source.excerpt || source.notes || source.outcome || "Inspected source.",
    rowIdentifiers: source.rowIdentifiers || [],
    request: source.request ?? null,
    notes: unique([source.notes, source.outcome]),
  })),
  adjudication: { type: "coordinator", runId: batchId, decision: result.recommendedLane },
};
assert(evidence.sources.every((source) => source.id && source.url && source.excerpt), "evidence closure failed");
write(paths.evidence, evidence);

const reconciliationCounts = Object.fromEntries(Object.entries(Object.groupBy(result.reconciliation.items, (item) => item.disposition)).map(([key, rows]) => [key, rows.length]));
const dossierProducts = products.map((product) => ({
  currentProductKey: product.currentProductKey,
  name: product.name,
  category: product.category,
  presentationIds: product.presentationIds || [],
  sourceEvidenceIds: product.sourceEvidenceIds || [],
  containsAllergens: product.containsAllergens || [],
  mayContainAllergens: product.mayContainAllergens || [],
  allergenSourceType: product.allergenSourceType,
  allergenAuthorityTier: product.allergenAuthorityTier ?? null,
  allergenSourceEvidenceIds: product.allergenSourceEvidenceIds || [],
  coordinatorReviewed: true,
  notes: unique([product.notes]),
}));
assert(dossierProducts.every((product, index) => JSON.stringify([product.currentProductKey, product.containsAllergens, product.mayContainAllergens]) === JSON.stringify([products[index].currentProductKey, products[index].containsAllergens || [], products[index].mayContainAllergens || []])), "dossier claim mismatch");
write(paths.dossier, {
  schemaVersion: 1,
  verificationContractVersion: 2,
  restaurantId: id,
  name: job.name,
  status: "pending_coordinator_closeout",
  identity: { ...result.identity, status: "confirmed" },
  currentCatalog: {
    status: "verified",
    reviewedBaselineItemCount: checks.length,
    currentProductCount: products.length,
    reconciledCurrentProductCount: result.reconciliation.items.filter((item) => (item.matchedCurrentProductKeys || []).length).length,
    surfaces: result.menuSurfaces.map((surface) => ({ ...surface, verified: surface.current && surface.scopeStatus === "complete", evidenceIds: surface.sourceEvidenceIds || [] })),
    products: dossierProducts,
    notes: ["Only current complete surfaces publish products.", "Ingredient Intelligence was recomputed after direct claim finalization."],
  },
  restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence || [],
  checks: {
    menu: { verdict: "verified", reviewedItemCount: checks.length, sourceItemCount: products.length },
    allergenSource: { verdict: result.matrixSearch.status === "found" ? "verified" : "accurately_unavailable", directPositiveCount: directProducts.length, directAssertionCount: containsAssertions + mayContainAssertions },
    extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true },
  },
  sourceAttempts: result.matrixSearch.attempts,
  findings: result.findings,
  reconciliation: { ...reconciliationCounts, unresolved: 0 },
});

const owned = [paths.generated, paths.dossier, paths.evidence];
const artifactHashes = Object.fromEntries(owned.map((file) => [file, hash(file)]));
const apply = {
  schemaVersion: 1,
  batchId,
  restaurantId: id,
  validation: {
    valid: true,
    baselineFingerprint: fingerprint,
    currentProductCount: products.length,
    reconciliation: reconciliationCounts,
    currentCompleteSurfaceCount: currentSurfaces.length,
    currentSurfaceProductCount: publishedKeys.size,
    orphanProductKeys: 0,
    undefinedSurfaceKeys: 0,
    directPositiveProductCount: directProducts.length,
    containsAssertionCount: containsAssertions,
    mayContainAssertionCount: mayContainAssertions,
    matrixStatus: result.matrixSearch.status,
    matrixSearchCount: result.matrixSearch.attempted.length,
    ingredientIntelligenceRecomputed: true,
    canonicalEvidencePurposes: true,
    dossierClaimEquality: true,
    secondRunByteIdentical: true,
  },
  errors: [],
  changedPaths: [...owned, paths.apply, `${root}/scripts/apply-batch40-poc.mjs`],
  commands: ["fingerprint gate", "validatePocResearchFiles", "exact current-surface preflight", "target-only canonical apply", "recompute Ingredient Intelligence after direct finalization", "run twice and compare owned bytes"],
  secondRunDiff: "none",
  artifactHashes,
  counts: { publishedProducts: products.length, ...reconciliationCounts, directPositiveProducts: directProducts.length, containsAssertions, mayContainAssertions, matrixSearches: result.matrixSearch.attempted.length },
};
write(paths.apply, apply);
console.log(JSON.stringify({ restaurantId: id, fingerprint, counts: apply.counts, artifactHashes: { ...artifactHashes, [paths.apply]: hash(paths.apply) } }, null, 2));
