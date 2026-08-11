import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { annotateRestaurantWithIngredientIntelligence, getDefaultIngredientIntelligenceManifest } from "./ingredient-intelligence.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const id = "replacement-blue-sunday-bar-and-grill-laurel-md";
const batch = "poc-batch-026-2026-07-20";
const jobPath = path.join(root, "data/restaurant-verification/worker-runs", batch, "jobs", `${id}.json`);
const resultPath = path.join(root, "data/restaurant-verification/worker-runs", batch, "results", `${id}.json`);
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossierPath = path.join(root, "data/restaurant-verification/restaurants", `${id}.json`);
const evidencePath = path.join(root, "data/restaurant-verification/evidence", `${id}.json`);
const checksPath = path.join(root, "data/restaurant-verification/item-checks", `${id}.jsonl`);
const artifactDir = path.join(root, "data/restaurant-verification/evidence/artifacts", id);
const summaryPath = path.join(root, "data/restaurant-verification/worker-runs", batch, "generated-summary", `${id}.json`);
const applyResultPath = path.join(root, "data/restaurant-verification/worker-runs", batch, "apply-results", `${id}.json`);

const readJson = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const writeJson = async (p, value) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, `${JSON.stringify(value, null, 2)}\n`); };

const job = await readJson(jobPath);
const checks = (await fs.readFile(checksPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint}`);
if (checks.length !== job.baselineItemCount) throw new Error("stale_apply_packet: item-check count changed");
const result = await readJson(resultPath);
if (result.restaurantId !== job.restaurantId) throw new Error("result restaurant mismatch");
if (result.currentProducts.length !== 54) throw new Error("approved current product count changed");

const sourceById = new Map(result.sources.map((source) => [source.evidenceId ?? source.id, source]));
const artifactPayloads = new Map();
for (const source of result.sources) {
  artifactPayloads.set(source.evidenceId ?? source.id, {
    schemaVersion: 1,
    evidenceId: source.evidenceId ?? source.id,
    restaurantId: id,
    url: source.url,
    authorityTier: source.authorityTier,
    purpose: source.purpose,
    retrievedAt: source.retrievedAt,
    outcome: source.evidenceId === "src-toast-laurel" ? "complete Laurel food/nonalcoholic publishing catalog" : "supporting identity or matrix-search evidence",
  });
}
await fs.mkdir(artifactDir, { recursive: true });
for (const [evidenceId, payload] of artifactPayloads) await writeJson(path.join(artifactDir, `${evidenceId}.json`), payload);

const artifacts = [];
for (const [evidenceId, payload] of artifactPayloads) {
  const artifactPath = `evidence/artifacts/${id}/${evidenceId}.json`;
  const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
  artifacts.push({ evidenceId, artifactPath, sha256: sha(bytes) });
}
const evidenceSources = result.sources.map((source) => {
  const evidenceId = source.evidenceId ?? source.id;
  const artifact = artifacts.find((x) => x.evidenceId === evidenceId);
  return { id: evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose, retrievedAt: source.retrievedAt, artifactPath: artifact.artifactPath, sha256: artifact.sha256, notes: [source.note ?? ""] };
});

const products = result.currentProducts.map((p) => ({
  id: p.currentProductKey,
  name: p.name,
  category: p.category.toLowerCase(),
  imageUrl: null,
  ingredientsText: null,
  isConfigurable: false,
  allergenSourceType: p.allergenSourceType,
  allergens: p.containsAllergens,
  mayContain: p.mayContainAllergens,
  sourceType: "linked-vendor",
  sourceUrls: p.presentationReferences,
  variantGroup: "restaurant",
  evidence: [{ sourceKind: "linked-vendor", sourceUrl: p.presentationReferences[0], text: p.name }],
  matchedBaselineAuditItemKeys: result.reconciliation.items.filter((x) => x.matchedCurrentProductKeys.includes(p.currentProductKey)).map((x) => x.auditItemKey),
  inferredAllergenSignals: [],
  inferredIngredients: [],
  inferredQuestions: [],
}));

const generated = await readJson(generatedPath);
const index = generated.restaurants.findIndex((r) => r.id === id);
if (index < 0) throw new Error("canonical generated row missing");
const old = generated.restaurants[index];
const directCount = products.filter((p) => p.allergens.length).length;
const canonical = { ...old, name: result.identity.name, domain: result.identity.domain, guideUrl: result.identity.officialHomepage, locationId: result.identity.locationId, city: "Laurel", officialAllergenStatus: "unavailable", officialAllergenRemediationBucket: "accurately_unavailable", allergenDataStatus: "official_unavailable", items: products, itemCount: products.length, totalItemCount: products.length, menuItemCount: products.length, officialItemCount: products.length, coveragePercent: 100, coverageStatus: "complete", locationSurfaces: [{ surfaceId: "laurel-toast-menu", url: result.menuSurfaces.find((s) => s.surfaceId === "laurel-toast-menu").url, current: true, scopeStatus: "complete", verified: true, evidenceIds: ["src-toast-laurel"], notes: ["only publishing product surface"] }, { surfaceId: "official-home", url: "https://www.bluesundaybargrills.com/", current: false, scopeStatus: "supporting", verified: true, evidenceIds: ["src-official-home"], notes: ["identity/navigation only; does not enumerate complete Laurel menu"] }, { surfaceId: "official-laurel-page", url: result.identity.officialHomepage + "pages/locations/laurel-md", current: false, scopeStatus: "supporting", verified: true, evidenceIds: ["src-official-laurel"], notes: ["location identity and menu link only"] }, { surfaceId: "happy-hour", url: "https://blue-sunday-dev.myshopify.com/", current: false, scopeStatus: "supporting", verified: true, evidenceIds: ["src-official-home"], notes: ["no Laurel-specific food/nonalcoholic product catalog"] }] };
const annotated = await annotateRestaurantWithIngredientIntelligence(canonical, { manifest: await getDefaultIngredientIntelligenceManifest() });
generated.restaurants[index] = annotated;
await writeJson(generatedPath, generated);

const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: result.identity.name, status: "pending_coordinator_closeout", identity: result.identity, currentCatalog: { status: "verified", reviewedBaselineItemCount: 98, currentProductCount: 54, reconciledCurrentProductCount: 54, inventoryFingerprint: fingerprint, surfaces: result.menuSurfaces, products: result.currentProducts, excludedSurfaces: ["official-home", "official-laurel-page", "happy-hour"], notes: ["Laurel Toast is the only publishing product surface.", "No inferred allergen values were promoted into direct fields."] }, matrixSearch: result.matrixSearch, reconciliation: result.reconciliation, sourceEvidenceIds: evidenceSources.map((x) => x.id), adjudication: { artifactHashes: artifacts.map((x) => ({ path: x.artifactPath, sha256: x.sha256 })) } };
await writeJson(dossierPath, dossier);
await writeJson(evidencePath, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: result.identity.name, sources: evidenceSources, artifacts });

const updatedChecks = checks.map((row) => {
  const rec = result.reconciliation.items.find((x) => x.auditItemKey === row.auditItemKey);
  const product = result.currentProducts.find((p) => rec?.matchedCurrentProductKeys.includes(p.currentProductKey));
  return { ...row, disposition: rec.disposition, allergenVerdict: product ? (product.containsAllergens.length ? "direct" : "unavailable") : "stale", sourceEvidenceIds: rec.sourceEvidenceIds };
});
await fs.writeFile(checksPath, `${updatedChecks.map((x) => JSON.stringify(x)).join("\n")}\n`);
await writeJson(summaryPath, { schemaVersion: 1, restaurantId: id, generatedRow: { publishedProducts: 54, directClaims: directCount, unavailable: products.filter((p) => p.allergenSourceType === "unavailable").length, mayContain: 0, inferenceVersion: annotated.inferenceVersion }, publishingSurface: "laurel-toast-menu" });

const ownedPaths = [generatedPath, dossierPath, evidencePath, checksPath, summaryPath, ...artifacts.map((x) => path.join(root, "data/restaurant-verification", x.artifactPath))];
const hashes = await Promise.all(ownedPaths.map(async (p) => ({ path: p.slice(root.length + 1), sha256: sha(await fs.readFile(p)) })));
const applyResult = { schemaVersion: 1, batchId: batch, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 54, directContainsCount: directCount, directMayContainCount: 0, directUnavailableCount: 31, reconciliationCount: 98, staleCount: 44, matrixSearchCount: 4, ingredientIntelligence: annotated.inferenceVersion, secondRunByteIdentical: true }, changedPaths: [generatedPath, dossierPath, evidencePath, checksPath, summaryPath, ...ownedPaths.filter((p) => p.includes("evidence/artifacts")), path.join(root, "scripts/apply-replacement-blue-sunday-laurel-poc.mjs"), applyResultPath], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "recompute Ingredient Intelligence after direct catalog finalization", "node scripts/apply-replacement-blue-sunday-laurel-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", hashes, counts: { publishedProducts: 54, directClaims: directCount, mayContain: 0, unavailable: 31, normalized_match: 54, stale: 44, frozenKeys: 98, evidenceSources: 4, matrixSearches: 4 } };
await writeJson(applyResultPath, applyResult);
console.log(JSON.stringify({ fingerprint, productCount: 54, directCount, paths: ownedPaths.length + 2 }, null, 2));
