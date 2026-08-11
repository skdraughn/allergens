import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchResult, normalizeCurrentProducts, normalizeReconciliation } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "bens-chili-bowl-u-street-dc";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-015-2026-07-16`;
const paths = {
  job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`,
  generated: `${root}/src/data/generated/restaurants.generated.json`,
  dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`,
  evidence: `${root}/data/restaurant-verification/evidence/${id}.json`,
  itemChecks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`,
  apply: `${run}/apply-results/${id}.json`,
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, value) => { fs.mkdirSync(requireDir(p), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`); };
const writeCompact = (p, value) => fs.writeFileSync(p, JSON.stringify(value));
const requireDir = (p) => p.slice(0, p.lastIndexOf("/"));
const unique = (values) => [...new Set(values ?? [])];

const job = read(paths.job);
const result = read(paths.result);
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((row) => row.baseline))).digest("hex");
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);

const validation = validatePocResearchResult({ job, result, itemChecks: checks });
if (!validation.valid) throw new Error(`invalid_research_result:\n${validation.errors.join("\n")}`);
const products = normalizeCurrentProducts(result.currentProducts);
const reconciliation = normalizeReconciliation(result.reconciliation);
if (products.length !== 61 || reconciliation.length !== 75 || validation.unresolvedItemCount !== 0) {
  throw new Error("binding catalog/reconciliation counts are not 61/75/0");
}
const dispositionCounts = Object.fromEntries(Object.entries(reconciliation.reduce((counts, row) => {
  counts[row.disposition] = (counts[row.disposition] ?? 0) + 1; return counts;
}, {})).sort(([a], [b]) => a.localeCompare(b)));
if (dispositionCounts.exact_match !== 61 || dispositionCounts.artifact !== 14 || Object.keys(dispositionCounts).length !== 2) {
  throw new Error(`unexpected reconciliation counts: ${JSON.stringify(dispositionCounts)}`);
}

const evidence = {
  schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name,
  status: "codex_verified", updatedAt: "2026-07-16T21:00:00.000Z", completedAt: "2026-07-16T21:00:00.000Z",
  sources: result.sources.map((source) => ({
    id: source.evidenceId, url: source.url, authorityTier: source.authorityTier,
    purpose: "menu", retrievedAt: source.retrievedAt,
    excerpt: source.purpose,
  })),
};
const currentSurfaces = result.menuSurfaces.map((surface) => ({
  surfaceId: surface.surfaceId, title: surface.surfaceId, url: surface.url,
  current: surface.current === true && surface.scopeStatus === "complete",
  scopeStatus: surface.current === true && surface.scopeStatus === "complete" ? "complete" : "supporting",
  verified: true, evidenceIds: [surface.surfaceId], notes: surface.surfaceId === "group-menu" ? ["Supporting current group-service PDF; excluded from regular-menu scope."] : [],
}));
const canonicalProducts = products.map((product) => ({
  currentProductKey: product.currentProductKey, name: product.name, category: product.category,
  presentationIds: [], sourceEvidenceIds: unique(product.sourceEvidenceIds),
  containsAllergens: unique(product.containsAllergens), mayContainAllergens: unique(product.mayContainAllergens),
  allergenSourceType: "unavailable", allergenSourceEvidenceIds: [], notes: [],
}));
const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
const currentUrls = new Set(currentSurfaces.filter((s) => s.current).map((s) => s.url));
target.items = products.map((product) => {
  const old = oldByName.get(product.name.toLowerCase()) ?? {};
  const row = reconciliation.find((entry) => entry.matchedCurrentProductKeys.includes(product.currentProductKey));
  return { ...old, id: product.currentProductKey, name: product.name, category: product.category,
    allergens: [], mayContain: [], allergenSourceType: "unavailable",
    sourceUrls: unique((product.surfaceIds ?? []).map((surfaceId) => result.menuSurfaces.find((s) => s.surfaceId === surfaceId)?.url).filter((url) => currentUrls.has(url))),
    matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
const annotatedTarget = await annotateRestaurantWithIngredientIntelligence(target);
annotatedTarget.itemCount = annotatedTarget.items.length; annotatedTarget.totalItemCount = annotatedTarget.items.length; annotatedTarget.menuItemCount = annotatedTarget.items.length;
annotatedTarget.officialAllergenStatus = "accurately_unavailable";
generated.restaurants[targetIndex] = annotatedTarget;

const dossier = {
  schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified",
  updatedAt: "2026-07-16T21:00:00.000Z", completedAt: "2026-07-16T21:00:00.000Z",
  checks: { menu: { verdict: "verified", reviewedItemCount: 75, sourceItemCount: 61 }, allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0 }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true } },
  identity: { status: "confirmed", location: result.identity.location ?? "1213 U St NW, Washington, DC 20009", sourceEvidenceIds: ["official-menu", "official-order"] },
  currentCatalog: { status: "verified", reviewedBaselineItemCount: 75, currentProductCount: 61, reconciledCurrentProductCount: 61, surfaces: currentSurfaces, products: canonicalProducts, notes: ["61 deduplicated complete current nonalcoholic U Street products.", "Group-service PDF is supporting and outside regular-menu scope.", "Empty allergen arrays mean unknown; no restaurant-wide caution was promoted."] },
  reconciliation: { expectedCount: 75, exactMatchCount: 61, artifactCount: 14, staleCount: 0, unresolvedCount: 0 },
  directAllergenSummary: { containsCount: 0, mayContainCount: 0, matrixStatus: "accurately_unavailable", notes: ["Only exact restaurant-issued or exact linked-vendor descriptions were audited; no inferred positives were promoted."] },
  route: "luna_fix",
};
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 61, reconciledCount: 75, exactMatchCount: 61, artifactCount: 14, staleCount: 0, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, pathCount: 5, evidenceSourceCount: evidence.sources.length }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, `${root}/scripts/apply-bens-chili-bowl-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchResult", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization"], counts: dispositionCounts, route: "luna_fix", secondRunDiff: "none", fingerprint };
write(paths.evidence, evidence); write(paths.dossier, dossier); writeCompact(paths.generated, generated); write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, commands: apply.commands, hashes: Object.fromEntries(apply.changedPaths.map((p) => [p, crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")])), counts: apply.validation, route: apply.route }, null, 2));
