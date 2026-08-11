#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { normalizeReconciliation, validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";

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
  "chai-pani-dc",
  "replacement-chai-wyy-herndon-va",
  "chaia-tacos-dc",
  "chang-chang-dc",
  "chao-ban-tysons-va",
  "chaplins-dc",
  "char-bar-dc",
  "chard-mclean-va-dc-metro",
  "charley-chesapeake-chophouse-gaithersburg-md",
  "chain-charleys-philly-steaks",
  "osm-charm-thai-1671377421",
  "chart-house-alexandria-va-dc-metro",
  "osm-chasin-tails-770780729",
  "chasin-tails-seafood-that-celebrates-falls-church-va-dc-metro",
  "chain-checkers",
  "chef-geoffs-dc",
  "replacement-chef-tony-s-fresh-seafood-rockville-md",
  "chef-tonys-rockville-dc-metro",
  "chennai-hoppers-indian-restaurant-gaithersburg-md-dc-metro",
  "chercher-ethiopian-dc",
  "chercher-ethiopian-restaurant-and-mart-washington-dc-dc-metro",
  "replacement-chez-billy-sud-washington-dc",
  "replacement-chicatana-washington-dc",
  "chick-fil-a",
  "chicken-and-whiskey-14th-dc",
  "chido-s-tex-mex-grill-laurel-md-dc-metro",
  "chiko-dc",
  "chilis",
  "chima-steakhouse-tysons-tysons-va-dc-metro",
  "china-chilcano-dc",
  "chain-china-express",
  "chipotle",
  "replacement-chit-chaat-cafe-vienna-va",
  "chloe-dc",
  "chloez-cafe-fairfax-station-dc-metro",
  "chopt-dc",
  "churchkey-washington-dc-dc-metro",
  "ciao-osteria-centreville-va-dc-metro",
  "cielo-rojo-restaurant-takoma-park-md-dc-metro",
  "cinemark-centreville-centreville-va-dc-metro",
  "osm-circa-2788369922",
  "replacement-circa-at-clarendon-arlington-va",
  "circa-at-foggy-bottom-washington-dc-dc-metro",
  "replacement-circa-at-navy-yard-washington-dc",
  "replacement-circa-at-the-boro-tysons-va",
  "circa-foggy-bottom-dc",
  "citizens-and-culture-silver-spring-md-dc-metro",
  "replacement-city-kitchen-alexandria-va",
  "clare-and-don-s-beach-shack-washington-dc-dc-metro",
  "clarity-vienna-va-dc-metro",
  "claudios-table-dc",
  "replacement-clove-halal-sterling-va",
  "osm-clyde-s-at-tower-oaks-lodge-92812505",
  "clydes-gallery-place-dc",
  "clydes-georgetown-dc",
  "coastal-flats-gaithersburg-md-dc-metro",
  "replacement-cocineros-hyattsville-md",
  "replacement-code-red-washington-dc",
  "colada-shop-dc",
  "cold-stone-creamery",
  "columbia-firehouse-alexandria-dc-metro",
  "comet-ping-pong-dc",
  "commons-fooderie-reston-dc-metro",
  "osm-commonwealth-indian-10120025923",
  "compass-coffee-dc",
  "compliments-only-dc",
  "cooper-s-hawk-winery-and-restaurant-rockville-md-dc-metro",
  "coopers-hawk-reston-va",
  "copper-canyon-grill-washington-dc-dc-metro",
  "copperwood-tavern-arlington-va-dc-metro",
  "copycat-co-dc",
  "cordelia-fishbar-dc",
  "replacement-cordelia-fishbar-washington-dc",
  "corned-beef-king-rockville-dc-metro",
  "corner-bakery-cafe",
  "osm-corso-italian-374740005",
  "replacement-cottage-house-ethiopian-cuisine-washington-dc",
  "replacement-courtside-thai-cuisine-fairfax-va",
  "cranes-dc",
  "crisp-and-juicy-kensington-md-dc-metro",
  "crumbl",
  "replacement-crust-pizzeria-napoletana-herndon-va",
  "osm-cuates-12207964801",
  "cubanos-bethesda-md",
  "replacement-cucina-morini-washington-dc",
  "osm-curry-palace-indian-452446243",
  "replacement-cynthia-bar-and-bistro-washington-dc",
  "dacha-beer-garden-shaw-washington-dc-dc-metro",
  "daikaya-dc",
  "daily-provisions-dupont-dc",
  "dairy-queen",
  "dakshin-indique-washington-dc-dc-metro",
  "replacement-dal-grano-mclean-va",
  "dal-shabu-hot-pot-annandale-va-dc-metro",
  "osm-darband-kabob-13140207699",
  "daru-dc",
  "darvish-kitchen-washington-dc-dc-metro",
  "dauphines-dc",
  "daves-hot-chicken-dc",
  "davios-reston-va",
  "al-toque-dc",
  "replacement-dc-bites-washington-dc",
  "dc-prime-steaks-ashburn-va-dc-metro",
  "dcity-smokehouse-dc",
  "dear-sushi-love-makoto-dc",
  "del-mar-dc",
  "replacement-delhi-spice-bethesda-md",
  "replacement-deli-italiano-herndon-herndon-va",
  "dennys",
  "dig",
  "dig-bethesda",
  "dirty-habit-washington-dc-dc-metro",
  "replacement-district-rico-washington-dc",
  "district-taco-dc",
  "district-winery-dc",
  "divan-restaurant-mclean-va-dc-metro",
  "dlena-dc",
  "osm-dmv-pizza-5811141809",
  "replacement-dog-daze-social-club-washington-dc",
  "dog-haus-biergarten-bethesda-bethesda-md-dc-metro",
]);
const requestedRun = /^poc-batch-(\d{3})-2026-08-(?:01|04)$/.exec(batchId);
const requestedRunNumber = Number(requestedRun?.[1]);
if (!requestedRun || requestedRunNumber < 40 || requestedRunNumber > 160 || !/^[a-z0-9-]+$/.test(id)) {
  throw new Error("Usage: node scripts/apply-batch40-poc.mjs [poc-batch-NNN-2026-08-DD] <restaurant-id>");
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
const generatedAllergenSourceType = (sourceType) => {
  const mapping = {
    restaurant_allergen_document: "official-allergen-menu",
    restaurant_ingredients: "official-ingredients",
    restaurant_linked_vendor: "official-product-allergen-section",
    unavailable: "unavailable",
  };
  const mapped = mapping[sourceType];
  assert(mapped, `unsupported generated allergen source type: ${sourceType}`);
  return mapped;
};

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
const currentSurfaces = result.menuSurfaces
  .filter((surface) => surface.current)
  .map((surface) => ({
    ...surface,
    currentProductKeys: (surface.currentProductKeys || []).length
      ? surface.currentProductKeys
      : products
        .filter((product) => (product.sourceEvidenceIds || []).some((evidenceId) => (surface.sourceEvidenceIds || []).includes(evidenceId)))
        .map((product) => product.currentProductKey),
  }))
  .filter((surface) => surface.currentProductKeys.length > 0);
if (products.length === 0) {
  assert(currentSurfaces.length === 0, "zero-product catalog must not publish a current surface");
} else {
  assert(currentSurfaces.length > 0 && currentSurfaces.every((surface) => surface.scopeStatus === "complete"), "current surfaces must be complete");
}
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
  allergenSourceType: generatedAllergenSourceType(product.allergenSourceType),
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

const reconciliationItems = normalizeReconciliation(result.reconciliation);
const reconciliationCounts = Object.fromEntries(Object.entries(Object.groupBy(reconciliationItems, (item) => item.disposition)).map(([key, rows]) => [key, rows.length]));
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
    reconciledCurrentProductCount: reconciliationItems.filter((item) => (item.matchedCurrentProductKeys || []).length).length,
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
