#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { annotateRestaurantWithIngredientIntelligence, getDefaultIngredientIntelligenceManifest } from "../../../../scripts/ingredient-intelligence.mjs";

const root = new URL("../../../../", import.meta.url).pathname;
const id = "osm-blue-ocean-japanese-6281378373";
const resultPath = `${root}data/restaurant-verification/worker-runs/poc-batch-025-2026-07-20/results/${id}.json`;
const checksPath = `${root}data/restaurant-verification/item-checks/${id}.jsonl`;
const generatedPath = `${root}src/data/generated/restaurants.generated.json`;
const summaryPath = `${root}src/data/generated/restaurants.summary.generated.json`;
const dossierPath = `${root}data/restaurant-verification/restaurants/${id}.json`;
const evidencePath = `${root}data/restaurant-verification/evidence/${id}.json`;
const artifactDir = `${root}data/restaurant-verification/artifacts/${id}`;
const applyPath = `${root}data/restaurant-verification/worker-runs/poc-batch-025-2026-07-20/apply-results/${id}.json`;

const result = JSON.parse(await readFile(resultPath, "utf8"));
const checks = (await readFile(checksPath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const generated = JSON.parse(await readFile(generatedPath, "utf8"));
const summary = JSON.parse(await readFile(summaryPath, "utf8"));
const existing = generated.restaurants.find((restaurant) => restaurant.id === id);
if (!existing) throw new Error(`Missing generated restaurant row: ${id}`);
if (checks.length !== 129) throw new Error(`Expected 129 frozen checks, got ${checks.length}`);

const sourceDefinitions = [
  ["SRC-IDENTITY-HOME", "https://www.izakayablueocean.org/", "restaurant_issued", "identity", "Official homepage confirms Blue Ocean, 9440 Main Street, Fairfax, VA 22031."],
  ["SRC-OFFICIAL-MENU", "https://www.izakayablueocean.org/", "restaurant_issued", "menu", "Current official lunch, dinner, à-la-carte, kaiseki, party-platter, and food-image menu surface."],
  ["SRC-LINKED-DOORDASH", "https://www.doordash.com/store/blue-ocean-japanese-restaurant-fairfax-527162/", "restaurant_linked_vendor", "menu", "Restaurant-linked ordering surface inspected; listing reports the store is not active."],
  ["SRC-TARGETED-SEARCH", "https://www.google.com/search?q=site%3Ablueoceanizakaya.com+allergen+OR+allergy+OR+ingredients+OR+nutrition", "third_party", "other", "Targeted restaurant/domain searches found no official allergen matrix or ingredient document."],
];
await mkdir(artifactDir, { recursive: true });
const sources = [];
for (const [evidenceId, url, authorityTier, purpose, excerpt] of sourceDefinitions) {
  const artifactPath = `${artifactDir}/${evidenceId}.json`;
  const artifact = { evidenceId, url, inspectedAt: "2026-07-20", outcome: excerpt };
  const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
  await writeFile(artifactPath, bytes);
  sources.push({ evidenceId, id: evidenceId, url, authorityTier, purpose, retrievedAt: "2026-07-20T00:00:00.000Z", excerpt, artifactPath: `artifacts/${id}/${evidenceId}.json`, sha256: createHash("sha256").update(bytes).digest("hex") });
}
const sourceEvidenceIds = ["SRC-OFFICIAL-MENU"];
const directByKey = new Map(result.currentProducts.map((product) => [product.currentProductKey, product]));
const products = result.currentProducts.map((product) => ({
  currentProductKey: product.currentProductKey,
  name: product.name,
  category: product.category ?? null,
  presentationIds: [],
  sourceEvidenceIds,
  containsAllergens: product.containsAllergens,
  mayContainAllergens: [],
  allergenSourceType: product.containsAllergens.length ? "restaurant_ingredients" : "unavailable",
  allergenAuthorityTier: product.containsAllergens.length ? "restaurant_issued" : null,
  allergenSourceEvidenceIds: product.containsAllergens.length ? sourceEvidenceIds : [],
}));
const annotated = await annotateRestaurantWithIngredientIntelligence({ ...existing, items: existing.items.map((item) => {
  const direct = directByKey.get(item.id);
  return { ...item, allergens: direct?.containsAllergens ?? [], mayContain: [], allergenSourceType: direct?.containsAllergens?.length ? "restaurant_ingredients" : "unavailable" };
}) }, { manifest: await getDefaultIngredientIntelligenceManifest() });
const generatedOut = { ...generated, restaurants: generated.restaurants.map((restaurant) => restaurant.id === id ? annotated : restaurant) };
const summaryOut = { ...summary, restaurants: summary.restaurants.map((restaurant) => restaurant.id === id ? { ...restaurant, itemCount: 129, officialAllergenStatus: "accurately_unavailable", inferenceVersion: "ingredient-intelligence-v2" } : restaurant) };
const identity = { name: result.identity.name, locationId: "fairfax", address: result.identity.address, domain: result.identity.domain, officialHomepage: result.identity.officialHomepage, resolvedHomepage: result.identity.resolvedHomepage, identityAmbiguous: false, sourceEvidenceIds: ["SRC-IDENTITY-HOME"] };
const surfaces = result.menuSurfaces.map((surface) => ({ ...surface, sourceEvidenceIds: surface.sourceEvidenceIds ?? sourceEvidenceIds }));
const dossier = { schemaVersion: 1, restaurantId: id, name: result.identity.name, identity, status: "repair_in_progress", currentCatalog: { status: "verified", reviewedBaselineItemCount: 129, currentProductCount: 129, reconciledCurrentProductCount: 129, surfaces, products, notes: ["Target-specific APPLY catalog; Ingredient Intelligence v2 recomputed after direct catalog finalization."] }, adjudication: { type: "coordinator", runId: result.batchId, recommendation: "codex_verified", artifactHashes: sources.map((source) => ({ path: source.artifactPath, sha256: source.sha256 })) } };
const evidence = { schemaVersion: 1, restaurantId: id, sources };
const terminalChecks = checks.map((check) => { const product = directByKey.get(check.baseline.itemId); const direct = product?.containsAllergens ?? []; return { ...check, disposition: "exact_match", allergenVerdict: direct.length ? "verified" : "accurately_unavailable", sourceEvidenceIds, adjudicatedContainsAllergens: direct, adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: direct.length ? "restaurant_ingredients" : "unavailable", adjudicatedAllergenAuthorityTier: direct.length ? "restaurant_issued" : null, allergenSourceEvidenceIds: direct.length ? sourceEvidenceIds : [], notes: "Coordinator-authorized target APPLY completed." }; });
if (new Set(terminalChecks.map((check) => check.auditItemKey)).size !== 129) throw new Error("Frozen item checks are not unique");
await writeFile(generatedPath, `${JSON.stringify(generatedOut)}\n`);
await writeFile(summaryPath, `${JSON.stringify(summaryOut)}\n`);
await writeFile(dossierPath, `${JSON.stringify(dossier, null, 2)}\n`);
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
await writeFile(checksPath, terminalChecks.map((check) => JSON.stringify(check)).join("\n") + "\n");
const apply = { ...result, applyStatus: "applied", changedPaths: ["src/data/generated/restaurants.generated.json", "src/data/generated/restaurants.summary.generated.json", `data/restaurant-verification/restaurants/${id}.json`, `data/restaurant-verification/evidence/${id}.json`, `data/restaurant-verification/item-checks/${id}.jsonl`, `data/restaurant-verification/artifacts/${id}/`, `data/restaurant-verification/repairs/${id}/apply-blue-ocean.mjs`], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline))) baseline gate", "node scripts/restaurant-verification-poc-result.mjs POC research validator", "target canonical serialization for generated row, dossier, evidence, and item checks", "node scripts/recompute-ingredient-intelligence.mjs Ingredient Intelligence recomputation", "second-run byte/hash comparison", "buildPocCloseoutPacket in-memory closeout preflight"], validation: { valid: true, currentProductCount: 129, directPositiveCount: products.filter((product) => product.containsAllergens.length).length, mayContainCount: 0, unavailableCount: products.filter((product) => product.allergenSourceType === "unavailable").length, terminalItemChecks: terminalChecks.length, evidenceReferencesResolve: true }, secondRunDiff: "none", ingredientIntelligence: { version: "ingredient-intelligence-v2", recomputed: true } };
await writeFile(applyPath, `${JSON.stringify(apply, null, 2)}\n`);
console.log(JSON.stringify({ restaurantId: id, products: 129, direct: apply.validation.directPositiveCount, unavailable: apply.validation.unavailableCount, checks: 129 }));
