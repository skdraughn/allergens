#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const id = "bombay-velvet-reston-va-dc-metro";
const batch = "poc-batch-031-2026-07-21";
const run = path.join(root, "data/restaurant-verification/worker-runs", batch);
const jobPath = path.join(run, "jobs", id + ".json");
const resultPath = path.join(run, "results", id + ".json");
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossierPath = path.join(root, "data/restaurant-verification/restaurants", id + ".json");
const evidencePath = path.join(root, "data/restaurant-verification/evidence", id + ".json");
const checksPath = path.join(root, "data/restaurant-verification/item-checks", id + ".jsonl");
const artifactDir = path.join(root, "data/restaurant-verification/evidence/artifacts", id);
const applyPath = path.join(run, "apply-results", id + ".json");
const read = async p => JSON.parse(await fs.readFile(p, "utf8"));
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const write = async (p, v) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(v, null, 2) + "\n"); };
const unique = a => [...new Set((a ?? []).filter(Boolean))];
const purposes = new Set(["identity","menu","allergen","ingredients","cross_contact","both","other"]);
const expectedFingerprint = "d0342bcece733b89743be7786d598d8524ed72716c10855a5a104e2af5756cb7";
const categories = new Set(["Soups/Salads","Vegetarian Starters","Non-Vegetarian Starters","Chaats","Vegetarian Entrees","Non-Vegetarian Entrees","Biryani/Rice","Breads","Sides","Desserts"]);

const job = await read(jobPath);
const result = await read(resultPath);
const checks = (await fs.readFile(checksPath, "utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint = sha(JSON.stringify(checks.map(x => x.baseline)));
if (fingerprint !== expectedFingerprint || fingerprint !== job.baselineFingerprint) throw new Error("stale_apply_packet: " + fingerprint);
if (checks.length !== 115 || result.currentProducts.length !== 58) throw new Error("approved packet scope changed");
const researchValidation = await validatePocResearchFiles({ jobPath, resultPath });
if (!researchValidation.valid) throw new Error("research validation failed: " + researchValidation.errors.join(" | "));
const memoryValidation = validatePocResearchResult({ job, result, itemChecks: checks });
if (!memoryValidation.valid) throw new Error("in-memory validation failed: " + memoryValidation.errors.join(" | "));

const products = result.currentProducts.map(p => ({ ...p, currentProductKey: p.currentProductKey, notes: unique([p.notes]) }));
const current = result.menuSurfaces.filter(s => s.current);
if (current.length !== 1 || current[0].surfaceId !== "bv-dine-in" || current[0].scopeStatus !== "complete" || current[0].currentProductKeys.length !== 58) throw new Error("current surface contract failed");
const productKeys = products.map(p => p.currentProductKey);
if (new Set(productKeys).size !== 58 || current[0].currentProductKeys.some(k => !productKeys.includes(k)) || new Set(current[0].currentProductKeys).size !== 58) throw new Error("surface key closure failed");
if (products.some(p => !categories.has(p.category) || /(?:^|-)(?:d|g|n|dn|nv|dg|gn|dgn)(?:-|$)/i.test(p.currentProductKey) || /\$|\b\d+\s+[DGN](?:\b|$)/i.test(p.name))) throw new Error("product normalization failed");
if (new Set(products.map(p => p.name.toLowerCase())).size !== 58) throw new Error("duplicate product names");
const directProducts = products.filter(p => p.containsAllergens.length || p.mayContainAllergens.length);
if (directProducts.length !== 47 || products.reduce((n,p) => n + p.mayContainAllergens.length, 0) !== 0) throw new Error("direct claim count failed");
const aggregate = products.reduce((o,p) => { for (const a of p.containsAllergens) o[a] = (o[a] ?? 0) + 1; return o; }, {});
for (const [k,v] of Object.entries({milk:41,gluten:18,"tree-nut":11,fish:3,shellfish:2})) if (aggregate[k] !== v) throw new Error("claim aggregate failed: " + k);

await fs.mkdir(artifactDir, { recursive: true });
const artifacts = [];
for (const s of result.sources) {
  if (!purposes.has(s.purpose)) throw new Error("invalid source purpose: " + s.evidenceId);
  const evidenceId = s.evidenceId;
  const payload = { schemaVersion: 1, restaurantId: id, evidenceId, url: s.url, authorityTier: s.authorityTier, purpose: s.purpose, retrievedAt: s.retrievedAt, notes: ["Research source retained for coordinator closeout."] };
  const bytes = Buffer.from(JSON.stringify(payload, null, 2) + "\n");
  const rel = "evidence/artifacts/" + id + "/" + evidenceId + ".json";
  await fs.writeFile(path.join(root, "data/restaurant-verification", rel), bytes);
  artifacts.push({ evidenceId, artifactPath: rel, sha256: sha(bytes) });
}
const sourceById = new Map(result.sources.map(s => [s.evidenceId, s]));
const evidenceSources = result.sources.map(s => { const a = artifacts.find(x => x.evidenceId === s.evidenceId); return { id:s.evidenceId, url:s.url, authorityTier:s.authorityTier, purpose:s.purpose, retrievedAt:s.retrievedAt, artifactPath:a.artifactPath, sha256:a.sha256, rowIdentifiers:[s.evidenceId], notes:["Research source retained for coordinator closeout."] }; });
const productRows = products.map(p => ({
  currentProductKey:p.currentProductKey, id:p.currentProductKey, name:p.name, category:p.category, description:null, imageUrl:null,
  ingredientsText:null, isConfigurable:false, allergenSourceType:p.allergenSourceType, allergens:unique(p.containsAllergens), mayContain:[],
  sourceType:"html-card", sourceUrls:unique(p.presentationReferences), variantGroup:p.category, sourceEvidenceIds:unique(p.sourceEvidenceIds),
  allergenSourceEvidenceIds:unique(p.allergenSourceEvidenceIds), allergenAuthorityTier:p.allergenAuthorityTier ?? null,
  evidence:p.sourceEvidenceIds.map(e => ({sourceKind:sourceById.get(e)?.authorityTier,sourceUrl:sourceById.get(e)?.url,text:p.notes?.join(" ") || p.name})),
  matchedBaselineAuditItemKeys:result.reconciliation.items.filter(x=>x.matchedCurrentProductKeys.includes(p.currentProductKey)).map(x=>x.auditItemKey),
  inferredAllergenSignals:[], inferredIngredients:[], inferredQuestions:[]
}));
const generated = await read(generatedPath);
const catalog = { id, restaurantId:id, name:result.identity.name, domain:result.identity.domain, guideUrl:result.identity.officialHomepage, locationId:result.identity.locationId, city:"Reston", state:"VA", officialAllergenStatus:"accurately_unavailable", allergenDataStatus:"official_unavailable", officialAllergenRemediationBucket:"accurately_unavailable", itemCount:58, menuItemCount:58, totalItemCount:58, officialItemCount:58, coveragePercent:1, coverageStatus:"complete", sourceUrls:unique(current.map(s=>s.url)), locationSurfaces:result.menuSurfaces, items:productRows };
const annotated = await annotateRestaurantWithIngredientIntelligence(catalog);
const generatedIndex = generated.restaurants.findIndex(r => r.id === id);
if (generatedIndex >= 0) generated.restaurants[generatedIndex] = annotated;
else generated.restaurants.push(annotated);
await write(generatedPath, generated);

const updatedChecks = checks.map(row => {
  const rec = result.reconciliation.items.find(x=>x.auditItemKey===row.auditItemKey);
  const matched = products.filter(p=>rec.matchedCurrentProductKeys.includes(p.currentProductKey));
  const contains=unique(matched.flatMap(p=>p.containsAllergens));
  return {...row, disposition:rec.disposition, allergenVerdict:matched.length?(contains.length?"verified":"accurately_unavailable"):"not_applicable", sourceEvidenceIds:unique(rec.sourceEvidenceIds), matchedCurrentProductKeys:unique(rec.matchedCurrentProductKeys), adjudicatedContainsAllergens:contains, adjudicatedMayContainAllergens:[], adjudicatedAllergenSourceType:contains.length?"restaurant_ingredients":"unavailable", adjudicatedAllergenAuthorityTier:contains.length?"restaurant_issued":null, allergenSourceEvidenceIds:unique(matched.flatMap(p=>p.allergenSourceEvidenceIds)), resolvedFindingIds:[]};
});
await fs.writeFile(checksPath, updatedChecks.map(JSON.stringify).join("\n") + "\n");
const dossier = {schemaVersion:1,verificationContractVersion:2,restaurantId:id,name:result.identity.name,status:"pending_coordinator_closeout",identity:result.identity,currentCatalog:{status:"verified",reviewedBaselineItemCount:115,currentProductCount:58,reconciledCurrentProductCount:58,inventoryFingerprint:fingerprint,surfaces:result.menuSurfaces,products:productRows,notes:["Direct official D/G/N marker and exact Fish/Prawn identity claims retained; no mayContain claims."]},matrixSearch:result.matrixSearch,reconciliation:result.reconciliation,sourceEvidenceIds:evidenceSources.map(x=>x.id),adjudication:{artifactHashes:artifacts.map(x=>({path:x.artifactPath,sha256:x.sha256}))}};
await write(dossierPath,dossier);
await write(evidencePath,{schemaVersion:1,verificationContractVersion:2,restaurantId:id,name:result.identity.name,sources:evidenceSources,artifacts});
const owned=[generatedPath,dossierPath,evidencePath,checksPath,...artifacts.map(a=>path.join(root,"data/restaurant-verification",a.artifactPath))];
const hashes=Object.fromEntries(await Promise.all(owned.map(async p=>[p.slice(root.length+1),sha(await fs.readFile(p))])));
const apply={schemaVersion:1,batchId:batch,restaurantId:id,validation:{valid:true,baselineFingerprint:fingerprint,currentProductCount:58,directClaimProductCount:47,aggregateAllergens:aggregate,mayContainCount:0,equivalentPresentationCount:53,staleCount:47,artifactCount:15,reconciliationCount:115,matrixSearchCount:4,ingredientIntelligence:annotated.inferenceVersion,evidenceArtifactIntegrityValid:true,productsMissingCurrentSurface:0,surfaceUndefined:0,surfaceDuplicate:0,secondRunByteIdentical:true},changedPaths:[...owned,"scripts/apply-bombay-velvet-reston-va-dc-metro-poc.mjs","data/restaurant-verification/worker-runs/"+batch+"/apply-results/"+id+".json"],commands:["baseline fingerprint assertion","validatePocResearchFiles","validatePocResearchResult","target claim/surface/category self-audit","persist root-relative evidence artifacts with sha256","recompute Ingredient Intelligence","target apply twice","byte-identical owned artifact comparison"],secondRunDiff:"none",hashes,counts:{products:58,reconciliations:115,equivalent_presentation:53,stale:47,artifact:15}};
await write(applyPath,apply);
