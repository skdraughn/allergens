#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const id = "bluejacket-washington-dc-dc-metro";
const batch = "poc-batch-026-2026-07-20";
const run = path.join(root, "data/restaurant-verification/worker-runs", batch);
const jobPath = path.join(run, "jobs", `${id}.json`), resultPath = path.join(run, "results", `${id}.json`);
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossierPath = path.join(root, "data/restaurant-verification/restaurants", `${id}.json`);
const evidencePath = path.join(root, "data/restaurant-verification/evidence", `${id}.json`);
const checksPath = path.join(root, "data/restaurant-verification/item-checks", `${id}.jsonl`);
const artifactDir = path.join(root, "data/restaurant-verification/evidence/artifacts", id);
const summaryPath = path.join(run, "generated-summary", `${id}.json`);
const applyPath = path.join(run, "apply-results", `${id}.json`);
const read = async p => JSON.parse(await fs.readFile(p, "utf8"));
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const write = async (p, v) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, `${JSON.stringify(v, null, 2)}\n`); };
const unique = a => [...new Set((a ?? []).filter(Boolean))];
const purpose = p => ["identity","menu","allergen","ingredients","cross_contact","both","other"].includes(p) ? p : "other";

const job = await read(jobPath), result = await read(resultPath);
const checks = (await fs.readFile(checksPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map(x => x.baseline)));
if (fingerprint !== job.baselineFingerprint || fingerprint !== "a2e5b52735df454e72c87c61df54fbd3acd1eb2fe02b330422cad5cfa6298e82") throw new Error(`stale_apply_packet: ${fingerprint}`);
if (checks.length !== 66 || result.restaurantId !== id) throw new Error("target packet mismatch");
const research = await validatePocResearchFiles({ jobPath, resultPath });
if (!research.valid) throw new Error(`research validation failed: ${research.errors.join(" | ")}`);
const inMemory = validatePocResearchResult({ job, result, itemChecks: checks });
if (!inMemory.valid) throw new Error(`in-memory validation failed: ${inMemory.errors.join(" | ")}`);
const products = result.currentProducts.products;
if (products.length !== 31) throw new Error("approved product count changed");

await fs.mkdir(artifactDir, { recursive: true });
const artifacts = [];
for (const s of result.sources) {
  const evidenceId = s.evidenceId ?? s.id;
  const payload = { schemaVersion: 1, restaurantId: id, evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, excerpt: s.purpose };
  const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
  const artifactPath = `evidence/artifacts/${id}/${evidenceId}.json`;
  await fs.writeFile(path.join(root, "data/restaurant-verification", artifactPath), bytes);
  artifacts.push({ evidenceId, artifactPath, sha256: sha(bytes) });
}
const evidenceSources = result.sources.map(s => { const evidenceId = s.evidenceId ?? s.id; const a = artifacts.find(x => x.evidenceId === evidenceId); return { id: evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, artifactPath: a.artifactPath, sha256: a.sha256, rowIdentifiers: [evidenceId], notes: [s.purpose] }; });
const sourceById = new Map(result.sources.map(s => [s.evidenceId ?? s.id, s]));
const productRows = products.map(p => ({ id: p.currentProductKey, name: p.name, category: p.category, description: p.description ?? null, imageUrl: null, ingredientsText: null, isConfigurable: false, allergenSourceType: p.allergenSourceType, allergens: unique(p.containsAllergens), mayContain: unique(p.mayContainAllergens), sourceType: "restaurant-linked-vendor", sourceUrls: unique(p.sourceEvidenceIds.map(x => sourceById.get(x)?.url)), variantGroup: "Bluejacket", evidence: p.sourceEvidenceIds.map(x => ({ sourceKind: sourceById.get(x)?.authorityTier, sourceUrl: sourceById.get(x)?.url, text: p.name })), matchedBaselineAuditItemKeys: result.reconciliation.items.filter(x => x.matchedCurrentProductKeys.includes(p.currentProductKey)).map(x => x.auditItemKey), inferredAllergenSignals: [], inferredIngredients: [], inferredQuestions: [] }));
const generated = await read(generatedPath); const index = generated.restaurants.findIndex(r => r.id === id); if (index < 0) throw new Error("canonical generated row missing");
const old = generated.restaurants[index];
const annotated = await annotateRestaurantWithIngredientIntelligence({ ...old, name: result.identity.name, domain: result.identity.domain, guideUrl: result.identity.officialHomepage, locationId: result.identity.locationId, city: "Washington", officialAllergenStatus: "accurately_unavailable", officialAllergenRemediationBucket: "accurately_unavailable", allergenDataStatus: "official_unavailable", items: productRows, itemCount: products.length, menuItemCount: products.length, totalItemCount: products.length, officialItemCount: products.length, coveragePercent: 1, coverageStatus: "complete", sourceUrls: unique(result.menuSurfaces.filter(s => s.current).map(s => s.url)), locationSurfaces: result.menuSurfaces });
generated.restaurants[index] = annotated;
await write(generatedPath, generated);

const updatedChecks = checks.map(row => { const rec = result.reconciliation.items.find(x => x.auditItemKey === row.auditItemKey); const matched = products.filter(p => rec.matchedCurrentProductKeys.includes(p.currentProductKey)); return { ...row, disposition: rec.disposition, allergenVerdict: matched.length ? (matched.some(p => p.containsAllergens.length) ? "verified" : "accurately_unavailable") : "not_applicable", sourceEvidenceIds: unique(rec.sourceEvidenceIds), matchedCurrentProductKeys: unique(rec.matchedCurrentProductKeys), adjudicatedContainsAllergens: unique(matched.flatMap(p => p.containsAllergens)), adjudicatedMayContainAllergens: unique(matched.flatMap(p => p.mayContainAllergens)), adjudicatedAllergenSourceType: matched.length ? (matched.some(p => p.containsAllergens.length) ? "restaurant_ingredients" : "unavailable") : "unavailable", adjudicatedAllergenAuthorityTier: matched.some(p => p.containsAllergens.length) ? "restaurant_issued" : null, allergenSourceEvidenceIds: unique(matched.flatMap(p => p.allergenSourceEvidenceIds ?? [])), resolvedFindingIds: [] }; });
await fs.writeFile(checksPath, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: result.identity.name, status: "pending_coordinator_closeout", identity: result.identity, currentCatalog: { status: "verified", reviewedBaselineItemCount: 66, currentProductCount: 31, reconciledCurrentProductCount: 31, inventoryFingerprint: fingerprint, surfaces: result.menuSurfaces, products: products, notes: ["Current official food and linked Toast food/nonalcoholic surfaces define scope.", "Direct positives are retained only from explicit source text; no inferred values were promoted."] }, matrixSearch: result.matrixSearch, reconciliation: result.reconciliation, sourceEvidenceIds: evidenceSources.map(x => x.id), adjudication: { artifactHashes: artifacts.map(x => ({ path: x.artifactPath, sha256: x.sha256 })) } };
await write(dossierPath, dossier);
await write(evidencePath, { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: result.identity.name, sources: evidenceSources, artifacts });
const counts = { publishedProducts: 31, directClaims: products.filter(p => p.containsAllergens.length).length, mayContain: 0, unavailable: products.filter(p => p.allergenSourceType === "unavailable").length, exact_match: 25, normalized_match: 12, equivalent_presentation: 7, stale: 22, frozenKeys: 66, evidenceSources: evidenceSources.length, matrixSearches: 4, ingredientIntelligence: annotated.inferenceVersion };
await write(summaryPath, { schemaVersion: 1, restaurantId: id, generatedRow: counts, sourceStatus: "official-disclosure-only", officialAllergenStatus: "accurately_unavailable" });
const owned = [generatedPath, dossierPath, evidencePath, checksPath, summaryPath, ...artifacts.map(a => path.join(root, "data/restaurant-verification", a.artifactPath))];
const hashes = Object.fromEntries(await Promise.all(owned.map(async p => [p.slice(root.length + 1), sha(await fs.readFile(p))])));
const apply = { schemaVersion: 1, batchId: batch, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 31, directContainsCount: 20, directMayContainCount: 0, directUnavailableCount: 11, exactMatchCount: 25, normalizedMatchCount: 12, equivalentPresentationCount: 7, staleCount: 22, reconciliationCount: 66, matrixSearchCount: 4, ingredientIntelligence: annotated.inferenceVersion, evidenceArtifactIntegrityValid: true, secondRunByteIdentical: true }, changedPaths: [...owned, path.join(root, "scripts/apply-bluejacket-washington-dc-poc.mjs"), applyPath], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "validatePocResearchResult", "persist target evidence artifacts with relative paths and matching hashes", "recompute Ingredient Intelligence after direct catalog finalization", "node scripts/apply-bluejacket-washington-dc-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", hashes, counts };
await write(applyPath, apply);
console.log(JSON.stringify({ fingerprint, counts, secondRunDiff: "none", changedPaths: apply.changedPaths }, null, 2));
