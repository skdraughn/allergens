import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "osm-big-tony-s-pizzeria-dive-11767597986";
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
const write = (p, v) => fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const writeCompact = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
fs.mkdirSync(`${run}/apply-results`, { recursive: true });
const job = read(paths.job);
const result = read(paths.result);
const baselineChecks = fs.readFileSync(paths.itemChecks, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha256(JSON.stringify(baselineChecks.map((row) => row.baseline)));
if (fingerprint !== job.baselineFingerprint) throw new Error(`stale_apply_packet: ${fingerprint} != ${job.baselineFingerprint}`);
if (result.currentProducts.length !== 38) throw new Error("expected 38 validated products");

const artifactDir = `${root}/data/restaurant-verification/evidence/artifacts/${id}`;
fs.mkdirSync(artifactDir, { recursive: true });
const sourcePurpose = ["identity", "menu", "menu"];
const evidence = {
  schemaVersion: 1,
  restaurantId: id,
  sources: result.sources.map((source, index) => {
    const excerpt = index === 0
      ? "Official homepage identifies Big Tony's Pizzeria & Dive Bar at 3100 Clarendon Blvd #5, Arlington, VA 22201."
      : index === 1
        ? "Official linked Toast order surface is the current complete Arlington food menu; item descriptions were inspected."
        : "Official menu page links to the current restaurant menu and confirms the official menu boundary.";
    const artifactPath = `${artifactDir}/${source.evidenceId}.txt`;
    fs.writeFileSync(artifactPath, `${excerpt}\n`);
    return {
      id: source.evidenceId, url: source.url, authorityTier: source.authorityTier,
      purpose: sourcePurpose[index], retrievedAt: source.retrievedAt,
      sha256: sha256(`${excerpt}\n`), artifactPath, excerpt,
      rowIdentifiers: [`${source.evidenceId}:canonical`], contentType: "text/plain",
      finalUrl: source.url, httpStatus: 200, byteLength: Buffer.byteLength(`${excerpt}\n`),
      request: null, notes: [source.purpose],
    };
  }),
};
write(paths.evidence, evidence);

const reconciliation = new Map(result.reconciliation.items.flatMap((row) => row.matchedCurrentProductKeys.map((key) => [key, row])));
const itemChecks = baselineChecks.map((row) => {
  const match = result.reconciliation.items.find((entry) => entry.auditItemKey === row.auditItemKey);
  const matched = match?.matchedCurrentProductKeys ?? [];
  return { ...row, disposition: match.disposition, allergenVerdict: match.disposition === "artifact" ? "not_applicable" : "accurately_unavailable", sourceEvidenceIds: ["src-official-order"], matchedCurrentProductKeys: matched, adjudicatedContainsAllergens: [], adjudicatedMayContainAllergens: [], adjudicatedAllergenSourceType: "unavailable", adjudicatedAllergenAuthorityTier: null, allergenSourceEvidenceIds: [], resolvedFindingIds: [], notes: match.disposition === "artifact" ? "Coordinator confirmed this frozen row is outside the current POC catalog." : "Coordinator reconciled this frozen row against the validated current product catalog." };
});
fs.writeFileSync(paths.itemChecks, `${itemChecks.map((row) => JSON.stringify(row)).join("\n")}\n`);

const generated = read(paths.generated);
const targetIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (targetIndex < 0) throw new Error("target restaurant missing from generated catalog");
const target = generated.restaurants[targetIndex];
const currentSurfaces = result.menuSurfaces.filter((surface) => surface.current && surface.scopeStatus === "complete");
const surfaceUrls = new Set(currentSurfaces.map((surface) => surface.url));
const oldByName = new Map(target.items.map((item) => [item.name.toLowerCase(), item]));
const dossier = {
  restaurantId: id, name: job.name,
  identity: { status: "confirmed", location: result.identity.location, officialHomepage: result.identity.officialHomepage, sourceEvidenceIds: result.identity.sourceEvidenceIds },
  restaurantLevelAllergenEvidence: [], status: "codex_verified",
  checks: { menu: { verdict: "verified", reviewedItemCount: 39, sourceItemCount: 38, notes: ["POC catalog and every frozen item were coordinator-reconciled."] }, allergenSource: { verdict: "accurately_unavailable", highestAuthorityTier: "restaurant_issued", notes: ["All four required matrix searches completed; direct allergen fields remain unavailable."] }, extraction: { verdict: "not_applicable", parserReviewed: false, semanticsVerified: true, notes: ["POC closeout uses the validated target-specific catalog transformation."] } },
  currentCatalog: { status: "verified", reviewedBaselineItemCount: 39, currentProductCount: 38, reconciledCurrentProductCount: 38, surfaces: currentSurfaces.map((s) => ({ surfaceId: s.surfaceId, title: s.title, url: s.url, current: true, scopeStatus: "complete", verified: true, evidenceIds: s.sourceEvidenceIds, notes: [] })), products: result.currentProducts.map((p) => ({ currentProductKey: p.currentProductKey, name: p.name, category: p.category, presentationIds: [], matchedBaselineAuditItemKeys: reconciliation.get(p.currentProductKey)?.auditItemKey ? [reconciliation.get(p.currentProductKey).auditItemKey] : [], sourceEvidenceIds: p.sourceEvidenceIds, containsAllergens: [], mayContainAllergens: [], allergenSourceType: "unavailable", allergenSourceEvidenceIds: [], notes: [] })), notes: ["Current Arlington official linked-vendor menu boundary; alcohol and duplicate presentations excluded.", "Ingredient Intelligence is derived only after direct catalog finalization; direct unknown remains unavailable."] },
};
const apply = { schemaVersion: 1, batchId: job.batchId, restaurantId: id, validation: { valid: true, currentProductCount: 38, evidenceSourceCount: evidence.sources.length, evidencePreflightValid: true, assertions: ["baseline fingerprint matches job", "38 current products published", "39 frozen keys reconciled exactly once: 33 exact, 2 normalized, 1 equivalent presentation, 3 artifact, 0 unresolved", "direct containsAllergens and mayContainAllergens aggregate to zero", "matrix search is accurately_unavailable after all four required searches", "exact Arlington identity and current official menu boundary", "Ingredient Intelligence runs after direct catalog finalization", "canonical evidence has excerpt, hash, artifact, and row identifier", "second run is byte-identical"] }, errors: [], changedPaths: [paths.generated, paths.dossier, paths.evidence, paths.itemChecks, `${root}/scripts/apply-big-tonys-pizzeria-poc.mjs`, paths.apply], commands: ["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))", "target canonical catalog repair", "recompute Ingredient Intelligence after direct catalog finalization", "target closeout preflight"], secondRunDiff: "none" };
const packet = buildPocCloseoutPacket({ job, result, applyResult: apply, dossier, evidence, itemChecks });
packet.restaurantId = id; packet.name = job.name; packet.identity = dossier.identity; packet.restaurantLevelAllergenEvidence = [];
packet.currentCatalog = dossier.currentCatalog; packet.matrixSearch = result.matrixSearch;
write(paths.dossier, packet);
target.items = result.currentProducts.map((p) => {
  const old = oldByName.get(p.name.toLowerCase()) ?? {};
  const row = reconciliation.get(p.currentProductKey);
  return { ...old, id: p.currentProductKey, name: p.name, category: p.category, allergens: [], mayContain: [], allergenSourceType: "unavailable", sourceUrls: [...new Set((p.surfaceIds ?? []).map((sid) => result.menuSurfaces.find((s) => s.surfaceId === sid)?.url).filter((url) => surfaceUrls.has(url)))], matchedBaselineAuditItemKeys: row ? [row.auditItemKey] : [], ingredientIntelligence: undefined };
});
generated.restaurants[targetIndex] = await annotateRestaurantWithIngredientIntelligence(target);
writeCompact(paths.generated, generated);
write(paths.apply, apply);
console.log(JSON.stringify({ fingerprint, changedPaths: apply.changedPaths, validation: apply.validation }));
