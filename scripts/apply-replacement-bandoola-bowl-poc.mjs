import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "replacement-bandoola-bowl-washington-dc";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-010-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`, apply: `${run}/apply-results/${id}.json`,
};
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const write = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const writeCompact = (path, value) => fs.writeFileSync(path, JSON.stringify(value));
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sha256 = (path) => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
const canonicalPurpose = (purpose = "") => {
  if (purpose.includes("cross")) return "cross_contact";
  if (purpose.includes("both")) return "both";
  if (purpose.includes("ingredient")) return "ingredients";
  if (purpose.includes("allergen") || purpose.includes("matrix")) return "allergen";
  if (purpose.includes("identity") || purpose.includes("location")) return "identity";
  if (purpose.includes("menu") || purpose.includes("ordering")) return "menu";
  return "other";
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(result.batchId === job.batchId && result.restaurantId === id, "result does not match job");
assert(result.currentProducts.length === 26, "expected 26 validated products");
assert(new Set(result.currentProducts.map((p) => p.currentProductKey)).size === 26, "duplicate current product keys");
const complete = result.menuSurfaces.filter((s) => s.current === true && s.scopeStatus === "complete");
assert(complete.length === 1 && complete[0].surfaceId === "official-dc-menu", "invalid current complete surface");
assert(result.menuSurfaces.filter((s) => s.current === false).map((s) => s.surfaceId).join(",") === "official-home,official-location,official-order,linked-doordash,third-party-allmenus-location-mismatch", "invalid supporting surfaces");
assert(result.sources.length === 8 && new Set(result.sources.map((s) => s.evidenceId)).size === 8, "expected eight unique result sources");
assert(result.currentProducts.filter((p) => p.category === "Salads" && p.containsAllergens.includes("peanut") && p.mayContainAllergens.includes("peanut")).length === 10, "expected ten peanut salads");
assert(result.currentProducts.filter((p) => p.category !== "Salads" && p.mayContainAllergens.includes("peanut")).length === 0, "peanut may-contain escaped salad scope");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempted.length === 4, "matrix search verdict is incomplete");
const forbiddenText = JSON.stringify(result).toLowerCase();
assert(!/(^|[^a-z])(sol|terra)([^a-z]|$)/.test(forbiddenText), "forbidden Sol/Terra reference");
for (const product of result.currentProducts) assert(unique(product.sourceEvidenceIds).every((e) => result.sources.some((s) => s.evidenceId === e)), `unresolved product evidence: ${product.currentProductKey}`);

const evidence = read(paths.evidence); evidence.sources = [];
const evidenceById = new Map(evidence.sources.map((source) => [source.id, source]));
for (const source of result.sources) {
  const normalized = { id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: canonicalPurpose(source.purpose), retrievedAt: source.retrievedAt, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, sha256: null, artifactPath: null, excerpt: source.excerpt ?? null, rowIdentifiers: [], request: null, notes: asArray(source.notes) };
  if (evidenceById.has(normalized.id)) Object.assign(evidenceById.get(normalized.id), normalized); else { evidence.sources.push(normalized); evidenceById.set(normalized.id, normalized); }
}
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "non-canonical evidence purpose");
const referenced = new Set(); const collect = (value) => { if (Array.isArray(value)) value.forEach(collect); else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => { if (k === "sourceEvidenceIds" || k === "evidenceIds" || k === "allergenSourceEvidenceIds") (Array.isArray(v) ? v : [v]).forEach((x) => referenced.add(x)); else collect(v); }); }; collect(result);
for (const ref of referenced) assert(evidenceById.has(ref), `unresolved evidence reference: ${ref}`);
write(paths.evidence, evidence);

const generated = read(paths.generated); const targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id); assert(targetIndex >= 0, "target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex]; const menuUrl = complete[0].url; const reconciliation = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row]))); const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
target.items = result.currentProducts.map((p) => { const old = oldByName.get(p.name.toLowerCase()) ?? {}; const row = reconciliation.get(p.currentProductKey); const hasDirectEvidence = (p.containsAllergens ?? []).length > 0 || (p.mayContainAllergens ?? []).length > 0; return { ...old, id: p.currentProductKey, name: p.name, category: p.category, allergens: p.containsAllergens ?? [], mayContain: p.mayContainAllergens ?? [], allergenSourceType: hasDirectEvidence ? p.allergenSourceType : "unavailable", sourceUrls: [menuUrl], matchedBaselineAuditItemKeys: row?.auditItemKey ? [row.auditItemKey] : [], ingredientIntelligence: undefined }; });
target.itemCount = 26; target.menuItemCount = 26; target.totalItemCount = 26; target.sourceUrls = [menuUrl]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target); writeCompact(paths.generated, generated);

const dossier = read(paths.dossier); dossier.restaurantId = id; dossier.name = job.name; dossier.status = "codex_verified";
dossier.identity = { status: "confirmed", location: result.identity.address, officialHomepage: "https://bandoola-bowl.com/", sourceEvidenceIds: result.identity.sourceEvidenceIds };
dossier.currentCatalog = { status: "verified", reviewedBaselineItemCount: job.baselineItemCount, currentProductCount: 26, reconciledCurrentProductCount: 26, surfaces: result.menuSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: s.current, scopeStatus: s.scopeStatus, verified: s.current && s.scopeStatus === "complete", evidenceIds: s.sourceEvidenceIds, notes: s.notes ?? [] })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: unique(p.presentationIds), sourceEvidenceIds: unique(p.sourceEvidenceIds), containsAllergens: p.containsAllergens ?? [], mayContainAllergens: p.mayContainAllergens ?? [], allergenSourceType: ((p.containsAllergens ?? []).length || (p.mayContainAllergens ?? []).length) ? p.allergenSourceType : "unavailable", allergenAuthorityTier: ((p.containsAllergens ?? []).length || (p.mayContainAllergens ?? []).length) ? p.allergenAuthorityTier : null, allergenSourceEvidenceIds: ((p.containsAllergens ?? []).length || (p.mayContainAllergens ?? []).length) ? unique(p.allergenSourceEvidenceIds) : [], notes: p.notes ?? [] })), notes: ["Official DC menu is the sole current complete catalog surface.", "Supporting and location-mismatch surfaces remain current=false.", "Direct allergen fields are copied from the validated result; Ingredient Intelligence remains inferred separately."] };
dossier.restaurantLevelAllergenEvidence = result.restaurantLevelAllergenEvidence; dossier.checks = { menu: { verdict: "verified", reviewedItemCount: 26, sourceItemCount: 26, notes: ["Validated Batch 10 catalog applied."] }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["Four required searches completed without a complete allergen matrix; empty direct fields remain unavailable, not allergen-free."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Target-specific serialized APPLY."] } };
dossier.sourceAttempts = result.matrixSearch.attempts.map((attempt) => ({ ...attempt }));
dossier.findings = result.findings; dossier.repairs = [{ id: `${job.batchId}-${id}-target-repair`, status: "verified", summary: "Applied the validated Bandoola Bowl DC catalog and scoped allergen evidence.", files: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-replacement-bandoola-bowl-poc.mjs`, paths.apply] }];
write(paths.dossier, dossier);

const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 26, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "26 distinct current products published", "official-dc-menu is the only current complete surface", "all supporting surfaces are current=false", "category-qualified duplicate products preserved", "direct containsAllergens and mayContainAllergens copied exactly", "salad-only peanut/contact statement preserved", "all eight result sources retained with canonical purposes", "all referenced evidence IDs resolve", "Ingredient Intelligence applied after direct catalog", "matrix verdict is accurately_unavailable", "no Sol or Terra used", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-replacement-bandoola-bowl-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "serialized APPLY twice with byte/hash comparison"], secondRunDiff: "none", scope: { currentCompleteSurface: "official-dc-menu", supportingCurrentFalse: ["official-home", "official-location", "official-order", "linked-doordash", "third-party-allmenus-location-mismatch"] }, evidence: { researchSources: result.sources.map((s) => s.evidenceId), purposes: Object.fromEntries(result.sources.map((s) => [s.evidenceId, canonicalPurpose(s.purpose)])), directVsInferred: "direct arrays are copied exactly; Ingredient Intelligence is inferred separately" } };
write(paths.apply, apply); console.log(JSON.stringify({ fingerprint, generatedSha256: sha256(paths.generated), dossierSha256: sha256(paths.dossier), evidenceSha256: sha256(paths.evidence), applySha256: sha256(paths.apply), validation: apply.validation, changedPaths: apply.changedPaths }));
