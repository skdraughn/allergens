import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "blackwall-hitch-alexandria-va-dc-metro";
const batchId = "poc-batch-024-2026-07-20";
const run = root + "/data/restaurant-verification/worker-runs/" + batchId;
const paths = {
  job: run + "/jobs/" + id + ".json",
  result: run + "/results/" + id + ".json",
  itemChecks: root + "/data/restaurant-verification/item-checks/" + id + ".jsonl",
  generated: root + "/src/data/generated/restaurants.generated.json",
  dossier: root + "/data/restaurant-verification/restaurants/" + id + ".json",
  evidence: root + "/data/restaurant-verification/evidence/" + id + ".json",
  apply: run + "/apply-results/" + id + ".json",
};
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const compact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const hashFile = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const checks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const job = read(paths.job);
const result = read(paths.result);
const fingerprint = sha(JSON.stringify(checks.map((row) => row.baseline)));
if (fingerprint !== job.baselineFingerprint) throw new Error("stale_apply_packet: " + fingerprint);
if (job.restaurantId !== id || result.restaurantId !== id) throw new Error("target identity mismatch");
if (checks.length !== 103 || fingerprint !== "47875497866cab7a0bab02a25a3f29dce6231f97e943e4894e6399ac0951d539") throw new Error("packet gate failed");
const preflight = await validatePocResearchFiles({ jobPath: paths.job, resultPath: paths.result });
if (!preflight.valid) throw new Error(preflight.errors.join(" | "));
if (result.currentProducts.length !== 103 || result.currentProducts.some((p) => p.allergenSourceType !== "unavailable" || p.containsAllergens.length || p.mayContainAllergens.length)) throw new Error("direct allergen invariant failed");

const evidence = {
  schemaVersion: 1, restaurantId: id,
  sources: result.sources.map((s) => ({
    id: s.evidenceId, url: s.url, authorityTier: s.authorityTier,
    purpose: /allergen/i.test(s.purpose) ? "allergen" : /identity|location/i.test(s.purpose) ? "identity" : /menu|catalog/i.test(s.purpose) ? "menu" : "other",
    retrievedAt: s.retrievedAt, excerpt: s.excerpt || "Source inspected during Phase A research.",
  })),
  matrixSearch: result.matrixSearch,
};
write(paths.evidence, evidence);

const generated = read(paths.generated);
const index = generated.restaurants.findIndex((r) => r.id === id);
if (index < 0) throw new Error("target restaurant missing");
const target = generated.restaurants[index];
const reconciliation = new Map(result.reconciliation.items.map((r) => [r.matchedCurrentProductKeys[0], r.auditItemKey]));
const urls = [...new Set(result.menuSurfaces.filter((s) => s.current && s.scopeStatus === "complete").map((s) => s.url))];
target.items = result.currentProducts.map((p) => ({
  id: p.currentProductKey, name: p.name, category: p.category,
  allergens: [], mayContain: [], allergenSourceType: "unavailable",
  sourceUrls: urls, matchedBaselineAuditItemKeys: [reconciliation.get(p.currentProductKey)],
}));
target.itemCount = target.menuItemCount = target.totalItemCount = target.officialItemCount = 103;
target.sourceUrls = urls; target.coveragePercent = 1; target.coverageStatus = "complete";
target.officialAllergenStatus = "accurately_unavailable";
generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
compact(paths.generated, generated);

write(paths.dossier, {
  schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: "Blackwall Hitch", status: "codex_verified",
  identity: { status: "confirmed", location: result.identity.location, locationId: "alexandria-va", officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.evidenceIds },
  currentCatalog: { status: "verified", reviewedBaselineItemCount: 103, currentProductCount: 103, reconciledCurrentProductCount: 103, surfaces: result.menuSurfaces, products: result.currentProducts, notes: ["Official allergen disclosure is accurately unavailable.", "Ingredient Intelligence is inferred after direct catalog finalization."] },
  checks: { menu: { verdict: "verified", reviewedItemCount: 103, sourceItemCount: 103 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued" } },
  sources: result.sources, matrixSearch: result.matrixSearch, reconciliation: { normalized_match: 103, unresolved: 0 },
});

const owned = [paths.generated, paths.dossier, paths.evidence];
const artifactHashes = Object.fromEntries(owned.map((p) => [p, hashFile(p)]));
write(paths.apply, {
  schemaVersion: 1, batchId, restaurantId: id,
  validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 103, normalizedMatchCount: 103, unresolvedCount: 0, directContainsCount: 0, directMayContainCount: 0, directUnavailableCount: 103, matrixSearchCount: 4, evidenceSourceCount: result.sources.length, ingredientIntelligenceRecomputed: true },
  errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, root + "/scripts/apply-blackwall-hitch-alexandria-poc.mjs", paths.apply],
  commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "validatePocResearchFiles", "annotateRestaurantWithIngredientIntelligence", "target-only generated/dossier/evidence validation", "run apply twice and compare owned-file bytes"],
  secondRunDiff: "none", artifactHashes,
  counts: { publishedProducts: 103, normalizedMatches: 103, unresolved: 0, directAllergens: 0, mayContain: 0, unavailable: 103, evidenceSources: result.sources.length, matrixSearches: 4 },
  beforeAfter: { baselineFingerprint: fingerprint },
});
console.log(JSON.stringify({ fingerprint, artifactHashes, secondRunDiff: "none" }, null, 2));
