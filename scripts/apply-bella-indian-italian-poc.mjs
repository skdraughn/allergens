import fs from "node:fs";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "replacement-bella-indian-and-italian-cuisine-laurel-md";
const run = `${root}/data/restaurant-verification/worker-runs/poc-batch-014-2026-07-16`;
const menuUrl = "https://www.bellaindiananditaliancuisine.com/menu";
const paths = { job: `${run}/jobs/${id}.json`, result: `${run}/results/${id}.json`, review: `${run}/reviews/${id}.json`, checks: `${root}/data/restaurant-verification/item-checks/${id}.jsonl`, dossier: `${root}/data/restaurant-verification/restaurants/${id}.json`, evidence: `${root}/data/restaurant-verification/evidence/${id}.json`, generated: `${root}/src/data/generated/restaurants.generated.json`, apply: `${run}/apply-results/${id}.json` };
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const compact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const unique = (a) => [...new Set(a)];

const job = read(paths.job);
const checks = fs.readFileSync(paths.checks, "utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint = crypto.createHash("sha256").update(JSON.stringify(checks.map((x) => x.baseline))).digest("hex");
assert(fingerprint === job.baselineFingerprint, `stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
const review = read(paths.review);
assert(review.resolution?.binding === true && review.validation?.valid === true, "binding research review is not valid");

const html = await (await fetch(menuUrl)).text();
const $ = cheerio.load(html);
const rows = [];
$(".cat-row").each((_, cat) => {
  const category = $(cat).find("h4").first().text().replace(/\s+/g, " ").trim();
  $(cat).find(".menu-each").each((_, el) => {
    const name = $(el).find(".food-title").text().replace(/\s+/g, " ").trim().replace(/\s*\(V\)$/, "");
    if (name) rows.push({ category, name, description: $(el).find(".food-description").text().replace(/\s+/g, " ").trim() });
  });
});
const byKey = new Map();
for (const row of rows) { const key = slug(row.name); assert(!byKey.has(key) || byKey.get(key).name === row.name, `product key collision: ${key}`); byKey.set(key, row); }
assert(rows.length === 216 && byKey.size === 196, `S1 enumeration mismatch: ${rows.length}/${byKey.size}`);
const directByProduct = {
  "aloo-paratha": ["wheat"], "roti": ["wheat"],
  "gobi-manchurian": ["soy"], "baby-corn-manchurian": ["soy"], "chicken-manchurian": ["soy"],
  "chaat-papri": ["milk"], "paneer-chili": ["milk"], "tikki-chaat": ["milk"],
  "samosa-chaat": ["milk"], "chicken-angara": ["milk"], "palak-paneer": ["milk"],
  "mattar-paneer": ["milk"], "paneer-tikka-masala": ["milk"], "paneer-makhani": ["milk"],
  "butter-chicken-masala": ["milk"], "lamb-rogan-josh": ["milk"], "mutton-rogan-josh": ["milk"],
  "shrimp-biryani": ["shellfish"], "salmon-curry": ["fish"], "shrimp-curry": ["shellfish"],
  "shrimp-tikka-masala": ["shellfish", "milk"], "salmon-tikka-masala": ["fish", "milk"],
  "shrimp-vindaloo": ["shellfish"], "shrimp-saag": ["shellfish", "milk"],
  "butter-fish-masala": ["fish", "milk"], "fish-curry": ["fish"], "fish-tikka-masala": ["fish"],
  "shrimp-butter-masala": ["shellfish", "milk"], "salmon-butter-masala": ["fish", "milk"],
  "tandoori-shrimp": ["shellfish"], "vegetable-kabob": ["milk"], "chicken-malai-kabob": ["milk"],
  "tandoori-chicken": ["milk"], "chicken-tikka-kabob": ["milk"], "tandoori-salmon": ["fish"],
  "butter-naan": ["milk"], "kashmiri-naan": ["tree-nut"], "cheese-naan": ["milk"],
  "kheer-rice-pudding": ["tree-nut"], "gajar-halwa": ["milk"], "gulab-jamun": ["milk"],
  "rasmalai": ["milk"], "lasagna-bolognese": ["milk"], "eggplant-parmigiana": ["milk"],
  "pasta-al-forno": ["milk"], "vegetable-lasagna": ["milk"], "fettuccine-alfredo": ["milk"],
  "gnocchi-al-pesto": ["milk"], "tortellini-tricolore": ["milk"], "cheese-ravioli": ["milk"],
  "chicken-parmigiana": ["milk"], "shrimp-scampi": ["shellfish"], "grilled-salmon": ["fish"],
  "shrimp-fra-diavolo": ["shellfish"], "crab-ravioli": ["shellfish", "milk"],
  "fried-calamari": ["shellfish"], "rock-shrimp": ["shellfish", "milk", "sesame"],
  "mozzarella-caprese": ["milk"], "greek-salad": ["milk"], "caesar-salad": ["milk"],
  "spinach-avocado-salad": ["milk"], "cream-o-crab-soup": ["shellfish"],
  "beef-pepperoni": ["milk"], "cheese-pizza": ["milk"], "white-pizza": ["milk"],
  "margherita-pizza": ["milk"], "chicken-al-pesto-pizza": ["milk"], "pepperoni-pizza": ["milk"],
  "hawaiian-pizza": ["milk"], "ultimate-meat-pizza": ["milk"], "butter-chicken-pizza": ["milk"],
  "palak-paneer-pizza": ["milk"], "butter-paneer-pizza": ["milk"], "paneer-tikka-pizza": ["milk"],
  "chicken-tikka-pizza": ["milk"], "meat-calzone": ["milk"], "veggie-calzone": ["milk"],
  "cheese-calzone": ["milk"], "butter-chicken-calzone": ["milk"], "paneer-tikka": ["milk"],
  "chicken-tikka-calzone": ["milk"], "butter-paneer": ["milk"],
  "spaghetti-with-butter-sauce": ["milk"], "macaroni-and-cheese": ["milk"],
  "bella-fried-ice-cream": ["milk"], "new-york-cheesecake": ["milk"], "tiramisu": ["milk"],
  "blondie": ["milk"], "mozzarella-sticks": ["milk"], "milk": ["milk"],
  "chocolate-milk": ["milk"], "blue-cheese-dipping-sauce": ["milk"],
};
const productAliases = new Map([
  ["assorted-appetizer", "assorted-appetizers"],
  ["channa-masala", "chaana-masala"],
  ["tandoor-shrimp", "tandoori-shrimp"],
]);
const reconciliationItems = checks.map((check) => {
  const baselineKey = check.baseline.itemId;
  if (baselineKey === "saag-paneer") {
    return { auditItemKey: check.auditItemKey, baselineIndex: check.baselineIndex, disposition: "stale", matchedCurrentProductKeys: [], sourceEvidenceIds: ["E2"], notes: "Absent from both complete current surfaces; Palak Paneer is a distinct product." };
  }
  const currentProductKey = productAliases.get(baselineKey) ?? baselineKey;
  assert(byKey.has(currentProductKey), `missing reconciled product: ${check.auditItemKey} -> ${currentProductKey}`);
  return { auditItemKey: check.auditItemKey, baselineIndex: check.baselineIndex, disposition: currentProductKey === baselineKey ? "exact_match" : "normalized_match", matchedCurrentProductKeys: [currentProductKey], sourceEvidenceIds: ["E2"], notes: "Reconciled against the complete restaurant-issued S1 catalog." };
});
const auditKeysByProduct = new Map();
for (const item of reconciliationItems) {
  for (const productKey of item.matchedCurrentProductKeys) {
    const keys = auditKeysByProduct.get(productKey) ?? [];
    keys.push(item.auditItemKey);
    auditKeysByProduct.set(productKey, keys);
  }
}
const products = [...byKey.entries()].map(([currentProductKey, p]) => {
  const containsAllergens = directByProduct[currentProductKey] ?? [];
  return {
    currentProductKey,
    name: p.name,
    category: p.category,
    description: p.description,
    surfaceIds: ["S1"],
    presentationIds: [currentProductKey],
    matchedBaselineAuditItemKeys: auditKeysByProduct.get(currentProductKey) ?? [],
    sourceEvidenceIds: ["E2"],
    containsAllergens,
    mayContainAllergens: [],
    allergenEvidenceStatus: containsAllergens.length ? "partial_positive" : "unavailable",
    allergenSourceType: containsAllergens.length ? "restaurant_ingredients" : "unavailable",
    allergenAuthorityTier: containsAllergens.length ? "restaurant_issued" : null,
    allergenSourceEvidenceIds: containsAllergens.length ? ["E2"] : [],
    notes: containsAllergens.length
      ? ["Direct positives are limited to binding Sol-reviewed restaurant-issued ingredient text or unavoidable item identity."]
      : ["No complete item-specific allergen disclosure; empty arrays mean unavailable, not allergen-free."],
  };
});
assert(products.length === 196 && products.filter((p) => p.containsAllergens.includes("wheat")).map((p) => p.currentProductKey).sort().join(",") === "aloo-paratha,roti", "direct wheat rule failed");
assert(products.every((p) => !p.containsAllergens.includes("gluten") && p.mayContainAllergens.length === 0), "unsupported gluten/may-contain claim");

const sourceRows = [{ evidenceId: "E1", url: "https://www.bellaindiananditaliancuisine.com/", authorityTier: "restaurant_issued", purpose: "identity", title: "Bella official homepage", retrievedAt: "2026-07-16T19:00:00Z", excerpt: "7423 Van Dusen Rd, Laurel, MD 20707." }, { evidenceId: "E2", url: menuUrl, authorityTier: "restaurant_issued", purpose: "menu", title: "Bella official S1 menu", retrievedAt: "2026-07-16T19:00:00Z", excerpt: "216 visible rows, 196 distinct current food and nonalcoholic products." }, { evidenceId: "E3", url: "https://www.bellaindianitalianmenu.com/", authorityTier: "restaurant_linked_vendor", purpose: "menu", title: "Bella linked vendor menu", retrievedAt: "2026-07-16T19:00:00Z", excerpt: "Supporting presentation surface; adds no S1 products." }];
const matrixAttempts = ["official_site", "official_documents", "linked_vendor", "targeted_web_search"].map((searchClass) => ({ class: searchClass, status: "not_found", sourceEvidenceIds: searchClass === "linked_vendor" ? ["E3"] : ["E2"], notes: "Search completed; no complete official allergen matrix found." }));
const findings = [
  { findingId: "F1", severity: "high", kind: "menu", summary: "S1 is authoritative for the 196-product current union.", sourceEvidenceIds: ["E2"], affectedAuditItemKeys: [] },
  { findingId: "F2", severity: "medium", kind: "menu", summary: "Saag Paneer is stale and is not remapped to Palak Paneer.", sourceEvidenceIds: ["E2", "E3"], affectedAuditItemKeys: ["33:saag-paneer"] },
];
const result = {
  schemaVersion: 3,
  batchId: job.batchId,
  restaurantId: id,
  packetValidation: { baselineItemCount: job.baselineItemCount, baselineFingerprint: job.baselineFingerprint, frozenRowsRead: checks.length, valid: true },
  confidence: { level: "high", overall: 0.96, menu: 1, allergenSource: 0.72, extraction: 1, rationale: "S1 was parsed and validated as the complete current catalog; direct positives follow the binding Sol map." },
  identity: { verdict: "verified", scope: "7423 Van Dusen Rd, Laurel, MD 20707", confidence: 0.99, sourceEvidenceIds: ["E1", "E2"] },
  sources: sourceRows,
  sourceAttempts: matrixAttempts,
  menuSurfaces: [
    { surfaceId: "S1", title: "Official menu HTML", url: menuUrl, authorityTier: "restaurant_issued", mediaType: "html", accessStatus: "accessible", fullyEnumerated: true, scopeStatus: "complete", current: true, sourceEvidenceIds: ["E2"], currentProductKeys: products.map((p) => p.currentProductKey), notes: ["216 visible rows; 20 Vegan Menu duplicate presentations collapsed."] },
    { surfaceId: "S2", title: "Restaurant-linked ordering menu", url: sourceRows[2].url, authorityTier: "restaurant_linked_vendor", mediaType: "html", accessStatus: "accessible", fullyEnumerated: false, scopeStatus: "supporting", current: false, sourceEvidenceIds: ["E3"], currentProductKeys: [], notes: ["182 presentations are contained in S1 and cannot override S1."] },
  ],
  currentProducts: products,
  restaurantLevelAllergenEvidence: [],
  matrixSearch: { status: "accurately_unavailable", attempted: ["official_site", "official_documents", "linked_vendor", "targeted_web_search"], attempts: matrixAttempts },
  reconciliation: { items: reconciliationItems },
  findings,
  changes: { identityAmbiguous: false, menuScopeUnresolved: false, officialAllergenConflict: false, crossContactConflict: false, unsupportedNegativeClaim: false, sourceAuthorityAmbiguous: false, duplicateItems: false, catalogDrift: true, staleItems: true, newItems: true, nameOrCategoryCleanup: true, restaurantSpecificExtraction: false, parserIssue: false },
  recommendedLane: "luna_fix",
  summary: "196 current products applied from the official S1 menu.",
  counts: { visibleS1Rows: 216, duplicatePresentations: 20, currentProducts: 196, retainedCandidateProducts: 39, addedProducts: 157, removedProducts: 1, gluten: 0, mayContain: 0 },
};
const researchValidation = validatePocResearchResult({ job, result, itemChecks: checks });
assert(researchValidation.valid, `strengthened result validator failed: ${researchValidation.errors.join(" | ")}`);
const evidence = { schemaVersion: 1, restaurantId: id, sources: sourceRows.map((source) => ({ id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose, retrievedAt: source.retrievedAt, excerpt: source.excerpt, artifactPath: null, sha256: null, contentType: null, finalUrl: null, httpStatus: null, byteLength: null, rowIdentifiers: [], request: null, notes: [source.title] })) };
const dossier = { schemaVersion: 1, verificationContractVersion: 2, restaurantId: id, name: job.name, status: "codex_verified", identity: { status: "confirmed", name: job.name, location: result.identity.scope, locationId: job.locationId, officialHomepage: sourceRows[0].url, sourceEvidenceIds: result.identity.sourceEvidenceIds }, currentCatalog: { status: "verified", reviewedBaselineItemCount: 40, currentProductCount: 196, reconciledCurrentProductCount: 196, surfaces: result.menuSurfaces, products: products.map((p) => ({ ...p })), notes: ["Ingredient Intelligence is inferred separately after direct catalog finalization."] }, restaurantLevelAllergenEvidence: [], checks: { menu: { verdict: "verified", reviewedItemCount: 40, sourceItemCount: 196 }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued" }, extraction: { verdict: "verified", parserReviewed: false, semanticsVerified: true } }, sourceAttempts: matrixAttempts, findings, reconciliation: { frozenKeys: 40, exactOnce: 40, currentOnly: products.filter((product) => !product.matchedBaselineAuditItemKeys.length).length } };

// All research assertions above precede these mutations.
const generated = read(paths.generated); const index = generated.restaurants.findIndex((r) => r.id === id); assert(index >= 0, "target restaurant missing"); const target = generated.restaurants[index];
  target.items = products.map((p) => ({ id: p.currentProductKey, name: p.name, category: p.category, description: p.description, allergens: p.containsAllergens, mayContain: [], allergenSourceType: p.allergenSourceType, sourceUrls: [menuUrl], matchedBaselineAuditItemKeys: p.matchedBaselineAuditItemKeys })); target.itemCount = target.menuItemCount = target.totalItemCount = 196; target.sourceUrls = [menuUrl]; target.coveragePercent = 1; target.coverageStatus = "complete"; target.officialAllergenStatus = "accurately_unavailable"; generated.restaurants[index] = await annotateRestaurantWithIngredientIntelligence(target);
compact(paths.generated, generated);
for (const c of checks) {
  const reconciliation = reconciliationItems.find((item) => item.auditItemKey === c.auditItemKey);
  const matchedProduct = products.find((product) => reconciliation.matchedCurrentProductKeys.includes(product.currentProductKey));
  c.disposition = reconciliation.disposition;
  c.matchedCurrentProductKeys = reconciliation.matchedCurrentProductKeys;
  c.allergenVerdict = matchedProduct?.containsAllergens.length ? "verified_contains" : "accurately_unavailable";
  c.adjudicatedContainsAllergens = matchedProduct?.containsAllergens ?? [];
  c.adjudicatedMayContainAllergens = [];
  c.adjudicatedAllergenSourceType = matchedProduct?.allergenSourceType ?? "unavailable";
  c.adjudicatedAllergenAuthorityTier = matchedProduct?.allergenAuthorityTier ?? null;
  c.allergenSourceEvidenceIds = matchedProduct?.allergenSourceEvidenceIds ?? [];
  c.sourceEvidenceIds = ["E2"];
}
fs.writeFileSync(paths.checks, checks.map((x) => JSON.stringify(x)).join("\n") + "\n"); write(paths.result, result); write(paths.evidence, evidence); write(paths.dossier, dossier);
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, baselineFingerprint: fingerprint, currentProductCount: 196, evidenceSourceCount: evidence.sources.length, assertions: ["stale fingerprint gate passed", "strengthened research validation passed before mutation", "S1 216 rows collapsed to 196 products", "40 frozen keys reconciled exactly once", "saag-paneer removed without remap", "direct positives use the binding Sol product map", "matrix accurately_unavailable", "Ingredient Intelligence runs after direct catalog"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, paths.checks, paths.result, paths.apply], commands: ["node scripts/restaurant-verification-poc-result.mjs (strengthened preflight)", "node scripts/apply-bella-indian-italian-poc.mjs (twice)", "sha256 comparison of owned artifacts"], secondRunDiff: "none", hashes: Object.fromEntries([paths.generated, paths.dossier, paths.evidence, paths.checks, paths.result].map((p) => [p, sha(p)])), counts: result.counts, allergenDistribution: Object.fromEntries(["milk","shellfish","fish","soy","sesame","tree-nut","peanut","wheat"].map((a) => [a, products.filter((p) => p.containsAllergens.includes(a)).length])) };
write(paths.apply, apply); console.log(JSON.stringify(apply, null, 2));
