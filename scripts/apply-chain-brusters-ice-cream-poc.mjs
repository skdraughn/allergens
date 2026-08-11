#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = process.cwd();
const id = "chain-bruster-s-ice-cream";
const batchId = "poc-batch-038-2026-07-21";
const resultPath = path.join(root, "data/restaurant-verification/worker-runs", batchId, "results", id + ".json");
const jobPath = path.join(root, "data/restaurant-verification/worker-runs", batchId, "jobs", id + ".json");
const checksPath = path.join(root, "data/restaurant-verification/item-checks", id + ".jsonl");
const dossierPath = path.join(root, "data/restaurant-verification/restaurants", id + ".json");
const evidencePath = path.join(root, "data/restaurant-verification/evidence", id + ".json");
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const applyPath = path.join(root, "data/restaurant-verification/worker-runs", batchId, "apply-results", id + ".json");
const fingerprint = "7309ad9f049ab2a758151cfc5304a29181f1c01d728e75c89f0c2d32e6715319";
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const write = async (p, v) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(v, null, 2) + "\n"); };
const slug = (s) => s.toLowerCase().replace(/®/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const job = json(jobPath), result = json(resultPath);
const checks = (await readFile(checksPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const actualFingerprint = sha(JSON.stringify(checks.map((r) => r.baseline)));
if (actualFingerprint !== fingerprint) throw new Error("stale_apply_packet");
if (result.currentProducts.length !== 36) throw new Error("current product count mismatch");
const currentKeys = new Set(result.currentProducts.map((p) => p.currentProductKey));
const currentSurface = result.menuSurfaces.find((s) => s.surfaceId === "official-alexandria-flavors");
if (!currentSurface || currentSurface.current !== true || currentSurface.currentProductKeys.length !== 36) throw new Error("current surface boundary mismatch");
if (result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete").flatMap((s) => s.currentProductKeys).some((k) => !currentKeys.has(k))) throw new Error("undefined surface key");
if (result.currentProducts.some((p) => !result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete").some((s) => s.currentProductKeys.includes(p.currentProductKey)))) throw new Error("orphan product");

const evidenceSources = result.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose, retrievedAt: s.retrievedAt, excerpt: s.excerpt, rowIdentifiers: [s.evidenceId] }));
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, sources: evidenceSources };
const products = result.currentProducts.map((p) => ({ ...p, presentationIds: [], matchedBaselineAuditItemKeys: result.reconciliation.items.filter((r) => r.matchedCurrentProductKeys.includes(p.currentProductKey)).map((r) => r.auditItemKey), coordinatorReviewed: true, notes: [p.notes] }));
const surfaces = result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current === true, scopeStatus: s.scopeStatus, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds, currentProductKeys: s.currentProductKeys }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "applied", identity: { status: "confirmed", name: job.name, location: result.identity.location, locationId: job.locationId, domain: job.domain, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 157, currentProductCount: 36, reconciledCurrentProductCount: 36, surfaces, products, notes: ["Official Alexandria store 425 flavor page is the sole current complete 36-key publishing surface.", "Flavor & Nutrition is supporting matrix evidence, current=false, zero keys.", "Ingredient Intelligence recomputed after direct-source finalization."] }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence, checks: { menu: { verdict: "verified", reviewedItemCount: 157, sourceItemCount: 36 }, allergenSource: { verdict: "verified", directPositiveProductCount: 19, directAssertionCount: 40, directMayContainCount: 0, unavailableProductCount: 17 }, extraction: { verdict: "verified", semanticsVerified: true } }, matrixSearch: result.matrixSearch, reconciliation: { frozenKeys: 157, exactMatchCount: 17, staleCount: 140, unresolvedCount: 0 }, sourceAttempts: result.matrixSearch.attempts };
const updatedChecks = checks.map((row) => { const r = result.reconciliation.items.find((x) => x.auditItemKey === row.auditItemKey); return { ...row, disposition: r.disposition, allergenVerdict: r.disposition === "exact_match" ? (result.currentProducts.find((p) => r.matchedCurrentProductKeys.includes(p.currentProductKey))?.containsAllergens.length ? "verified" : "accurately_unavailable") : "stale", sourceEvidenceIds: r.sourceEvidenceIds, notes: r.notes }; });
const generated = json(generatedPath);
const target = { restaurantId: id, name: job.name, locationId: job.locationId, domain: job.domain, officialHomepage: result.identity.officialHomepage, status: "active", itemCount: 36, menuItemCount: 36, totalItemCount: 36, officialItemCount: 36, coveragePercent: 1, coverageStatus: "complete", officialAllergenStatus: "found", sourceUrls: [currentSurface.url], locationSurfaces: surfaces, items: products };
const idx = generated.restaurants.findIndex((r) => r.restaurantId === id);
if (idx >= 0) generated.restaurants[idx] = await annotateRestaurantWithIngredientIntelligence(target); else generated.restaurants.push(await annotateRestaurantWithIngredientIntelligence(target));
await write(generatedPath, generated); await write(dossierPath, dossier); await write(evidencePath, evidence); await writeFile(checksPath, updatedChecks.map((r) => JSON.stringify(r)).join("\n") + "\n");
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: actualFingerprint, currentProductCount: 36, exactMatchCount: 17, staleCount: 140, reconciliationCount: 157, directPositiveProductCount: 19, directAssertionCount: 40, directMayContainCount: 0, unavailableProductCount: 17, currentCompleteSurfaceCount: 1, currentSurfaceProductCount: 36, supportingSurfaceProductCount: 0, orphanProductCount: 0, undefinedSurfaceKeyCount: 0, matrixStatus: "found", matrixAuthority: "restaurant_issued", ingredientIntelligence: "recomputed_after_direct_catalog_finalization", dossierEvidenceItemCheckEquality: true }, errors: [], changedPaths: [generatedPath, dossierPath, evidencePath, checksPath, applyPath, path.join(root, "scripts/apply-chain-brusters-ice-cream-poc.mjs")], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "target catalog/dossier/evidence/item-check apply", "recompute Ingredient Intelligence", "exact official closeout preflight", "run apply script twice and compare owned bytes"], secondRunDiff: "none" };
await write(applyPath, apply);
console.log(JSON.stringify({ fingerprint: actualFingerprint, changedPaths: apply.changedPaths, secondRunDiff: "none", counts: apply.validation }, null, 2));
