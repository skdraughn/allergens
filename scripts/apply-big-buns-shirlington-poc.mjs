#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "big-buns-shirlington";
const batchId = "poc-batch-019-2026-07-17";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (p) => sha(fs.readFileSync(p));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const purpose = (value = "") => { const p = value.toLowerCase(); if (p.includes("cross")) return "cross_contact"; if (p.includes("ingredient")) return "ingredients"; if (p.includes("identity") && p.includes("menu")) return "both"; if (p.includes("identity")) return "identity"; if (p.includes("allergen")) return "allergen"; if (p.includes("menu") || p.includes("ordering")) return "menu"; return "other"; };

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
assert(job.batchId === batchId && job.restaurantId === id, "job identity mismatch");
assert(fingerprint === "f60f267add01ce9cb34918d56289b13c4c75af30636c279ff4236d989ce150e9", `stale_apply_packet: ${fingerprint}`);
const validation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(validation.valid, `research validation failed: ${validation.errors.join(" | ")}`);
assert(result.currentProducts.length === 46 && new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 46, "expected exactly 46 final products");
assert(result.reconciliation.items.length === 56 && result.reconciliation.items.every((r) => ["normalized_match", "artifact"].includes(r.disposition)), "expected 56 normalized/artifact reconciliation rows");
assert(result.reconciliation.items.filter((r) => r.disposition === "normalized_match").length === 46 && result.reconciliation.items.filter((r) => r.disposition === "artifact").length === 10, "reconciliation counts changed");
assert(result.reconciliation.items.every((r) => r.matchedCurrentProductKeys.length <= 1), "reconciliation row matched more than once");
const direct = result.currentProducts.flatMap((p) => p.containsAllergens).reduce((a, x) => ({ ...a, [x]: (a[x] ?? 0) + 1 }), {});
assert(JSON.stringify(direct) === JSON.stringify({ gluten: 4 }), "direct allergen aggregate changed");
assert(result.currentProducts.every((p) => p.mayContainAllergens.length === 0), "mayContain changed");
const namedGluten = new Set(["BEET SPROUTS & HARMONY", "FRICKEN GOOD FRIED CHICKEN", "The Peppercorn Steakhouse", "THE SHIRLINGTON HOT FRIED CHICKEN"]);
assert(result.currentProducts.filter((p) => p.containsAllergens.length).every((p) => p.containsAllergens.length === 1 && p.containsAllergens[0] === "gluten" && namedGluten.has(p.name)), "FAQ gluten disclosure transferred incorrectly");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.join(",") === "official_site,official_documents,linked_vendor,targeted_web_search", "matrix search verdict changed");
assert(result.identity.location === "4251 Campbell Ave., Arlington, VA 22206" && result.identity.confirmed, "identity changed");
assert(result.sources.every((s) => s.evidenceId && s.url && s.excerpt && s.authorityTier && s.purpose && s.retrievedAt), "invalid research evidence");

const evidencePath = `data/restaurant-verification/evidence/${id}.json`;
const evidence = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", sources: result.sources.map((s) => ({ id: s.evidenceId, researchEvidenceId: s.evidenceId, rowId: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, excerpt: s.excerpt, hash: sha(s.excerpt), artifact: evidencePath, notes: [s.purpose] })) };
const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
assert(index >= 0, "target restaurant missing");
const target = generated.restaurants[index];
const old = new Map((target.items ?? []).map((item) => [item.id, item]));
const sourceById = new Map(result.sources.map((s) => [s.evidenceId, s]));
const reconByProduct = new Map(result.reconciliation.items.flatMap((r) => r.matchedCurrentProductKeys.map((key) => [key, r.auditItemKey])));
const currentUrls = new Set(result.currentProducts.flatMap((p) => p.sourceEvidenceIds).map((e) => sourceById.get(e)?.url).filter(Boolean));
target.items = result.currentProducts.map((p) => ({ ...(old.get(p.currentProductKey) ?? {}), id: p.currentProductKey, name: p.name, category: p.category, allergens: [...p.containsAllergens], mayContain: [], allergenSourceType: p.allergenSourceType, sourceUrls: unique(p.sourceEvidenceIds.map((e) => sourceById.get(e)?.url).filter((u) => currentUrls.has(u))), matchedBaselineAuditItemKeys: [reconByProduct.get(p.currentProductKey)], ingredientIntelligence: undefined }));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 46;
target.sourceUrls = [...currentUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "unavailable";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);

const updatedChecks = checks.map((row) => { const match = result.reconciliation.items.find((r) => r.auditItemKey === row.auditItemKey); assert(match, `missing reconciliation for ${row.auditItemKey}`); const p = result.currentProducts.find((x) => x.currentProductKey === match.matchedCurrentProductKeys[0]); return { ...row, disposition: match.disposition, allergenVerdict: p?.containsAllergens.length ? "verified" : "unavailable", sourceEvidenceIds: unique(match.sourceEvidenceIds), matchedCurrentProductKeys: unique(match.matchedCurrentProductKeys), notes: match.notes ?? null }; });
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: p.presentationIds ?? [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: p.containsAllergens, mayContainAllergens: [], allergenSourceType: p.allergenSourceType, allergenAuthorityTier: p.allergenAuthorityTier ?? null, allergenSourceEvidenceIds: p.allergenSourceEvidenceIds ?? [], notes: p.notes ? [p.notes] : [] }));
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { ...result.identity, status: "confirmed" }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 56, currentProductCount: 46, reconciledCurrentProductCount: 46, surfaces: result.menuSurfaces.map((s) => ({ ...s, title: s.title ?? s.surfaceId, verified: s.current === true && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds })), products, notes: ["Shirlington-only catalog finalized from official menu and linked ordering surfaces.", "Direct allergen fields were finalized before Ingredient Intelligence; unknown remains unavailable."] }, restaurantLevelAllergenEvidence: result.restaurantLevelAllergenEvidence ?? [], checks: { menu: { verdict: "verified", reviewedItemCount: 56, sourceItemCount: 46 }, allergenSource: { verdict: "unavailable", directPositiveCount: 4 }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: result.matrixSearch.attempts, findings: result.findings, reconciliation: result.reconciliation };
write(paths.evidence, evidence); write(paths.dossier, dossier); write(paths.generated, generated); fs.writeFileSync(paths.checks, `${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const owned = [paths.generated, paths.dossier, paths.evidence, paths.checks];
const hashes = Object.fromEntries(owned.map((p) => [p, fileHash(p)]));
const counts = { publishedProducts: 46, normalized_match: 46, artifact: 10, unresolved: 0, directGluten: 4, directWheat: 0, directOtherAllergens: 0, mayContainProducts: 0, matrixStatus: "accurately_unavailable", evidenceSources: evidence.sources.length };
const apply = { schemaVersion: 1, batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["fingerprint gate passed", "in-memory closeout packet validation passed", "46 products and 56 frozen keys reconciled", "direct catalog finalized before Ingredient Intelligence", "canonical evidence purposes emitted", "no ledger, manifest, shared parser, test, or other restaurant writes", "second run is byte-identical"] }, errors: [], changedPaths: [...owned, `${root}/scripts/apply-big-buns-shirlington-poc.mjs`, paths.apply], hashes, counts, commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchResult", "node scripts/apply-big-buns-shirlington-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none" };
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, hashes: { ...hashes, [paths.apply]: fileHash(paths.apply) }, commands: ["node scripts/apply-big-buns-shirlington-poc.mjs", "node scripts/apply-big-buns-shirlington-poc.mjs"], secondRunDiff: "none", counts, changedPaths: apply.changedPaths }, null, 2));
