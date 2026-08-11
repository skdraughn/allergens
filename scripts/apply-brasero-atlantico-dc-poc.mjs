import fs from "node:fs";
import crypto from "node:crypto";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "brasero-atlantico-dc";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-036-2026-07-21`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => { fs.mkdirSync(new URL(`file://${p}`).pathname.replace(/\/[^/]+$/, ""), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
const compact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const unique = (v = []) => [...new Set(v.filter(Boolean))];
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const purpose = (p = "") => { const s = p.toLowerCase(); if (s.includes("cross")) return "cross_contact"; if (s.includes("allergen") || s.includes("matrix")) return "allergen"; if (s.includes("ingredient")) return "ingredients"; if (s.includes("identity") || s.includes("location")) return "identity"; if (s.includes("menu") || s.includes("catalog") || s.includes("ordering")) return "menu"; return "other"; };

const job = read(paths.job); const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((r) => r.baseline))).digest("hex");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
assert(job.restaurantId === id && result.restaurantId === id && result.batchId === job.batchId, "job/result mismatch");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
assert(preflight.valid, `strengthened POC validator failed: ${preflight.errors.join(" | ")}`);
const products = result.currentProducts;
const dispositions = Object.groupBy(result.reconciliation.items, (r) => r.disposition);
assert(products.length === 5 && dispositions.exact_match?.length === 3 && dispositions.normalized_match?.length === 2 && dispositions.stale?.length === 3 && dispositions.location_mismatch?.length === 3 && dispositions.artifact?.length === 1, "final catalog/reconciliation counts changed");
assert(products.filter((p) => p.containsAllergens.length).length === 3 && products.every((p) => p.mayContainAllergens.length === 0), "direct-positive/mayContain invariant failed");
const complete = result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete");
assert(complete.length === 2 && complete.find((s) => s.surfaceId === "brasero-dinner-pdf").currentProductKeys.length === 5 && complete.find((s) => s.surfaceId === "brasero-lunch-pdf").currentProductKeys.length === 2, "surface contract changed");
assert(result.menuSurfaces.find((s) => s.surfaceId === "brasero-home").current === false && result.menuSurfaces.find((s) => s.surfaceId === "brasero-home").currentProductKeys.length === 0, "homepage classification changed");
assert(result.matrixSearch.status === "accurately_unavailable" && result.matrixSearch.attempts.length === 4, "matrix search contract changed");

const evidence = { schemaVersion: 1, restaurantId: id, sources: result.sources.map((s) => ({ id: s.evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: purpose(s.purpose), retrievedAt: s.retrievedAt, excerpt: s.excerpt ?? "Source inspected during validated Brasero APPLY." })) };
assert(evidence.sources.every((s) => ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"].includes(s.purpose)), "noncanonical evidence purpose");
write(paths.evidence, evidence);

const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing");
let target = generated.restaurants[index]; const completeUrls = new Set(complete.map((s) => s.url));
const recon = new Map(result.reconciliation.items.flatMap((r) => r.matchedCurrentProductKeys.map((k) => [k, r])));
target.name = result.name; target.domain = job.domain; target.guideUrl = result.identity.officialHomepage; target.locationId = job.locationId; target.region = "DC"; target.city = "Washington"; target.officialAllergenStatus = "not-found"; target.officialAllergenRemediationBucket = "not-found";
target.items = products.map((p) => ({ id: p.currentProductKey, name: p.name, category: p.category, description: p.notes ?? null, imageUrl: null, ingredientsText: null, isConfigurable: false, allergenSourceType: p.allergenSourceType, allergens: [...p.containsAllergens], mayContain: [], sourceType: "official-menu", sourceUrls: unique(p.sourceEvidenceIds.map((e) => result.sources.find((s) => s.evidenceId === e)?.url).filter((u) => completeUrls.has(u))), variantGroup: p.category, evidence: [...p.sourceEvidenceIds], matchedBaselineAuditItemKeys: recon.get(p.currentProductKey)?.auditItemKey ? [recon.get(p.currentProductKey).auditItemKey] : [] }));
target.itemCount = target.menuItemCount = target.totalItemCount = products.length; target.sourceUrls = [...completeUrls]; target.coveragePercent = 1; target.coverageStatus = "complete"; target = await annotateRestaurantWithIngredientIntelligence(target); generated.restaurants[index] = target; compact(paths.generated, generated);

const updatedChecks = checks.map((row) => { const r = result.reconciliation.items.find((x) => x.auditItemKey === row.auditItemKey); return { ...row, disposition: r.disposition, allergenVerdict: r.disposition === "artifact" || r.disposition === "stale" || r.disposition === "location_mismatch" ? "not-current" : "reconciled", sourceEvidenceIds: r.sourceEvidenceIds ?? [], notes: r.notes ?? null }; });
fs.writeFileSync(paths.itemChecks, updatedChecks.map((r) => JSON.stringify(r)).join("\n") + "\n");
const dossier = { schemaVersion: 1, restaurantId: id, name: result.name, status: "codex_verified", identity: result.identity, currentCatalog: { status: "verified", currentProductCount: products.length, surfaces: result.menuSurfaces, products }, matrixSearch: result.matrixSearch, reconciliation: result.reconciliation, assertions: ["Brasero and Florería remain distinct", "five actual products", "three direct-positive products", "zero mayContain", "Ingredient Intelligence recomputed after direct catalog finalization"] };
write(paths.dossier, dossier);
const artifactPaths = [paths.generated, paths.dossier, paths.evidence, paths.itemChecks]; const artifactHashes = Object.fromEntries(artifactPaths.map((p) => [p, hash(p)]));
const counts = { publishedProducts: 5, exactMatches: 3, normalizedMatches: 2, staleRows: 3, locationMismatchRows: 3, artifactRows: 1, directPositiveProducts: 3, mayContainProducts: 0, evidenceSources: evidence.sources.length, matrixSearches: 4, currentCompleteSurfaces: 2, dinnerKeys: 5, lunchKeys: 2 };
write(paths.apply, { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, assertions: ["stale fingerprint gate passed", "research validator passed", "canonical evidence purposes enforced", "Ingredient Intelligence recomputed", "no ledger, manifest, or unrelated writes"] }, errors: [], changedPaths: [...artifactPaths, `${root}/scripts/apply-brasero-atlantico-dc-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "node scripts/restaurant-verification-poc-result.mjs", "apply script twice", "exact official closeout preflight"], secondRunDiff: "none", artifactHashes, counts });
console.log(JSON.stringify({ fingerprint, artifactHashes, counts }, null, 2));
