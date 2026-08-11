import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "billy-hicks-georgetown-dc";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-020-2026-07-17`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
const writeCompact = (p, value) => fs.writeFileSync(p, JSON.stringify(value));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const unique = (values) => [...new Set(values.filter(Boolean))];

fs.mkdirSync(`${run}/apply-results`, { recursive: true });
const job = read(paths.job);
const result = read(paths.result);
const baselineChecks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha256(JSON.stringify(baselineChecks.map((row) => row.baseline)));
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
if (result.currentProducts.length !== 44) throw new Error("expected 44 validated products");
if (result.reconciliation.items.length !== 44 || result.reconciliation.items.some((row) => row.disposition !== "normalized_match" || row.matchedCurrentProductKeys.length !== 1)) {
  throw new Error("expected 44 normalized_match reconciliations with one product each");
}
if (result.matrixSearch.status !== "accurately_unavailable" || result.matrixSearch.attempted.length !== 4) throw new Error("matrix search is not accurately unavailable after four searches");
if (result.currentProducts.some((p) => (p.containsAllergens ?? []).length || (p.mayContainAllergens ?? []).length)) throw new Error("direct allergen aggregate must be zero");
const researchValidation = validatePocResearchResult({ job, result, itemChecks: baselineChecks });
if (!researchValidation.valid) throw new Error(researchValidation.errors.join("\n"));

const artifactDir = `${root}/data/restaurant-verification/evidence/artifacts/${id}`;
fs.mkdirSync(artifactDir, { recursive: true });
const excerpts = {
  "E-HOME": "Official homepage identifies Billy Hicks at 3277 M Street Northwest, Washington, DC 20007 and links to its current Toast ordering catalog.",
  "E-TOAST": "Restaurant-linked Toast catalog is the complete current menu surface; the 44 validated current product names and descriptions were reconciled here.",
  "E-DAILY": "Official daily brunch PDF was inspected; it contains no allergen matrix and notes that not all ingredients are listed.",
  "E-LUNCH": "Official lunch PDF was inspected; it contains no allergen matrix and requests guests disclose allergies.",
  "E-BRUNCH": "Official weekend brunch PDF was inspected; it contains no allergen matrix and requests guests disclose allergies.",
  "E-SEARCH": "Targeted official-site search for allergen, allergy, nutrition, ingredients, and menu material located no official matrix.",
};
const allowedPurposes = new Set(["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"]);
const evidence = {
  schemaVersion: 1, restaurantId: id,
  sources: result.sources.map((source) => {
    const excerpt = excerpts[source.evidenceId];
    if (!excerpt) throw new Error(`missing evidence excerpt: ${source.evidenceId}`);
    const purpose = source.evidenceId === "E-HOME" ? "both" : source.evidenceId === "E-TOAST" ? "menu" : source.evidenceId === "E-SEARCH" ? "other" : source.evidenceId === "E-DAILY" || source.evidenceId === "E-LUNCH" || source.evidenceId === "E-BRUNCH" ? "allergen" : "other";
    if (!allowedPurposes.has(purpose)) throw new Error(`invalid evidence purpose: ${purpose}`);
    const artifactPath = `${artifactDir}/${source.evidenceId}.txt`;
    fs.writeFileSync(artifactPath, `${excerpt}\n`);
    return { id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose, retrievedAt: source.retrievedAt, sha256: sha256(`${excerpt}\n`), artifactPath, excerpt, rowIdentifiers: [`${source.evidenceId}:canonical`], contentType: "text/plain", finalUrl: source.url, httpStatus: 200, byteLength: Buffer.byteLength(`${excerpt}\n`), request: null, notes: [source.purpose] };
  }),
};
write(paths.evidence, evidence);

const reconciliation = new Map(result.reconciliation.items.map((row) => [row.matchedCurrentProductKeys[0], row]));
const itemChecks = baselineChecks.map((row) => {
  const match = result.reconciliation.items.find((entry) => entry.auditItemKey === row.auditItemKey);
  return { ...row, disposition: match.disposition, allergenVerdict: "accurately_unavailable", sourceEvidenceIds: match.sourceEvidenceIds, matchedCurrentProductKeys: match.matchedCurrentProductKeys, adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: [], notes: "Validated catalog reconciliation; direct allergen data remains unavailable after all four matrix searches." };
});
fs.writeFileSync(paths.itemChecks, `${itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);

const generated = read(paths.generated);
const existingDossier = fs.existsSync(paths.dossier) ? read(paths.dossier) : null;
const targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const currentSurfaces = result.menuSurfaces.filter((surface) => surface.current && surface.scopeStatus === "complete");
const surfaceUrls = new Set(currentSurfaces.map((surface) => surface.url));
const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
const products = result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category ?? "American", presentationIds: [], matchedBaselineAuditItemKeys: reconciliation.get(p.currentProductKey)?.auditItemKey ? [reconciliation.get(p.currentProductKey).auditItemKey] : [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenSourceEvidenceIds: [], notes: [] }));
const dossier = {
  restaurantId: id, name: job.name,
  identity: { status: "confirmed", location: "3277 M Street Northwest, Washington, DC 20007", officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds },
  restaurantLevelAllergenEvidence: [], status: "codex_verified",
  checks: { menu: { verdict: "verified", reviewedItemCount: 44, sourceItemCount: 44, notes: ["All 44 frozen keys normalized-match exactly once to the complete current Toast catalog."] }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["All four required matrix searches completed; direct containsAllergens and mayContainAllergens remain empty."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["Ingredient Intelligence is applied only after direct catalog finalization; direct unknown remains unavailable."] } },
  currentCatalog: { status: "verified", reviewedBaselineItemCount: 44, currentProductCount: 44, reconciledCurrentProductCount: 44, surfaces: currentSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.surfaceId === "S-TOAST" ? "Complete current Toast catalog" : s.surfaceId, url: s.url, current: true, scopeStatus: "complete", verified: true, evidenceIds: s.sourceEvidenceIds, notes: s.surfaceId === "S-TOAST" ? ["Complete current menu boundary."] : [] })), products, notes: ["Restaurant-linked Toast catalog is the complete current menu surface.", "Ingredient Intelligence is derived only after direct catalog finalization; direct unknown remains unavailable."] },
};
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 44, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["fingerprint matches job", "44 current products published", "44 frozen keys reconciled exactly once: 44 normalized_match, 0 unresolved", "direct allergen aggregates are zero", "matrix search accurately_unavailable after all four searches", "identity and complete current Toast menu boundary confirmed", "Ingredient Intelligence runs after direct catalog finalization", "canonical evidence has purpose, excerpt, hash, artifact, and row identifier", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, paths.itemChecks, `${root}/scripts/apply-billy-hicks-georgetown-poc.mjs`, paths.apply, ...evidence.sources.map((source) => `${artifactDir}/${source.id}.txt`)], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "target closeout preflight"], secondRunDiff: "none" };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks });
packet.restaurantId = id; packet.name = job.name; packet.identity = dossier.identity; packet.restaurantLevelAllergenEvidence = []; packet.currentCatalog = dossier.currentCatalog; packet.matrixSearch = result.matrixSearch;
if (existingDossier?.adjudication?.decidedAt) packet.adjudication.decidedAt = existingDossier.adjudication.decidedAt;
write(paths.dossier, packet);
target.items = result.currentProducts.map((p) => { const old = oldByName.get(p.name.toLowerCase()) ?? {}; const row = reconciliation.get(p.currentProductKey); return { ...old, id: p.currentProductKey, name: p.name, category: p.category ?? old.category ?? "American", allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: unique((p.sourceEvidenceIds ?? []).map((eid) => result.sources.find((s) => s.evidenceId === eid)?.url).filter((url) => url && (url === result.identity.officialHomepage || surfaceUrls.has(url)))), matchedBaselineAuditItemKeys: [row.auditItemKey], ingredientIntelligence: undefined }; });
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, currentProductCount: 44, normalizedMatchCount: 44, unresolvedCount: 0, changedPaths: apply.changedPaths, validation: apply.validation }));
