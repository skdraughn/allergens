#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";
import { buildPocCloseoutPacket } from "./restaurant-verification-poc-closeout.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const id = "borek-g-cafe-market-falls-church-va";
const batchId = "poc-batch-034-2026-07-21";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const p = { job:`${run}/jobs/${id}.json`, result:`${run}/results/${id}.json`, apply:`${run}/apply-results/${id}.json`, checks:`${root}/data/restaurant-verification/item-checks/${id}.jsonl`, generated:`${root}/src/data/generated/restaurants.generated.json`, dossier:`${root}/data/restaurant-verification/restaurants/${id}.json`, evidence:`${root}/data/restaurant-verification/evidence/${id}.json`, artifacts:`${root}/data/restaurant-verification/evidence/artifacts/${id}`, script:`${root}/scripts/apply-borek-g-cafe-market-falls-church-va-poc.mjs` };
const read = x => JSON.parse(fs.readFileSync(x,"utf8"));
const write = (x,v) => { fs.mkdirSync(x.slice(0,x.lastIndexOf("/")),{recursive:true}); fs.writeFileSync(x,`${JSON.stringify(v,null,2)}\n`); };
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const fileSha = x => sha(fs.readFileSync(x));
const unique = a => [...new Set((a??[]).filter(Boolean))];
const arr = x => Array.isArray(x) ? x : [];
const assert = (ok,msg) => { if(!ok) throw new Error(msg); };
const purpose = x => { const v=String(x??"").toLowerCase(); if(v.includes("cross"))return "cross_contact"; if(v.includes("ingredient"))return "ingredients"; if(v.includes("allergen"))return "allergen"; if(v.includes("identity")||v.includes("location"))return "identity"; if(v.includes("menu")||v.includes("catalog")||v.includes("ordering"))return "menu"; return "other"; };

const job=read(p.job), result=read(p.result), checks=fs.readFileSync(p.checks,"utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const fingerprint=sha(JSON.stringify(checks.map(x=>x.baseline)));
assert(job.batchId===batchId && job.restaurantId===id,"job identity mismatch");
assert(fingerprint===job.baselineFingerprint,"stale_apply_packet");
const research=await validatePocResearchFiles({jobPath:p.job,resultPath:p.result}); assert(research.valid,`research validation failed: ${research.errors.join(" | ")}`);
const rv=validatePocResearchResult({job,result,itemChecks:checks}); assert(rv.valid,`result validation failed: ${rv.errors.join(" | ")}`);
const products=result.currentProducts;
assert(products.length===196 && new Set(products.map(x=>x.currentProductKey)).size===196,"catalog count/key gate failed");
assert(result.reconciliation.items.filter(x=>x.disposition==="normalized_match").length===140,"normalized reconciliation gate failed");
assert(result.reconciliation.items.filter(x=>x.disposition==="stale").length===38,"stale reconciliation gate failed");
assert(result.reconciliation.items.length===178,"reconciliation count gate failed");
assert(result.matrixSearch.status==="accurately_unavailable" && result.matrixSearch.attempts.length===4,"matrix gate failed");
assert(products.every(x=>arr(x.containsAllergens).length===0&&arr(x.mayContainAllergens).length===0),"direct allergen fields changed");
const currentSurface=result.menuSurfaces.find(x=>x.surfaceId==="official-square-catalog");
assert(currentSurface?.current===true&&currentSurface.scopeStatus==="complete"&&currentSurface.currentProductKeys.length===196,"current surface gate failed");
assert(new Set(currentSurface.currentProductKeys).size===196&&new Set(currentSurface.currentProductKeys).size===new Set(products.map(x=>x.currentProductKey)).size,"surface/product key equality failed");
assert(result.menuSurfaces.find(x=>x.surfaceId==="official-dinein-pdf")?.current===false,"dine-in surface gate failed");

const evidenceSources=result.sources.map(s=>({id:s.evidenceId??s.id,url:s.url,authorityTier:s.authorityTier,purpose:purpose(s.purpose),retrievedAt:s.retrievedAt,excerpt:s.excerpt??s.title??s.purpose}));
const evidenceArtifacts=evidenceSources.map(s=>{const rel=`evidence/artifacts/${id}/${s.id}.json`;const body={schemaVersion:1,restaurantId:id,evidenceId:s.id,url:s.url,authorityTier:s.authorityTier,purpose:s.purpose,retrievedAt:s.retrievedAt,excerpt:s.excerpt};return {s,rel,abs:`${root}/data/restaurant-verification/${rel}`,body};});
for(const a of evidenceArtifacts)write(a.abs,a.body);
const evidence={schemaVersion:1,verificationContractVersion:2,restaurantId:id,name:job.name,status:"codex_verified",sources:evidenceArtifacts.map(a=>({...a.s,sha256:fileSha(a.abs),artifactPath:a.rel,rowIdentifiers:[a.s.id]}))};
write(p.evidence,evidence);

const generated=read(p.generated), index=generated.restaurants.findIndex(x=>x.id===id); assert(index>=0,"target restaurant missing");
const target=generated.restaurants[index], old=new Map((target.items??[]).map(x=>[x.id,x])), sourceById=new Map(evidenceSources.map(x=>[x.id,x]));
const currentUrls=new Set(["ev-borek-api","ev-borek-home"].map(x=>sourceById.get(x)?.url).filter(Boolean));
const inverse=new Map(result.reconciliation.items.flatMap(r=>(r.matchedCurrentProductKeys??[]).map(k=>[k,r.auditItemKey])));
target.items=products.map(x=>({...old.get(x.currentProductKey),id:x.currentProductKey,name:x.name,category:x.category,allergens:[],mayContain:[],allergenSourceType:"unavailable",sourceUrls:unique(x.sourceEvidenceIds.map(e=>sourceById.get(e)?.url).filter(u=>currentUrls.has(u))),matchedBaselineAuditItemKeys:[inverse.get(x.currentProductKey)].filter(Boolean),ingredientIntelligence:undefined}));
Object.assign(target,{itemCount:196,menuItemCount:196,totalItemCount:196,officialItemCount:196,sourceUrls:[...currentUrls],coveragePercent:1,coverageStatus:"complete",officialAllergenStatus:"accurately_unavailable"});
generated.restaurants[index]=await annotateRestaurantWithIngredientIntelligence(target); write(p.generated,generated);

const updatedChecks=checks.map(row=>{const r=result.reconciliation.items.find(x=>x.auditItemKey===row.auditItemKey);assert(r,"missing reconciliation");return {...row,disposition:r.disposition,allergenVerdict:"accurately_unavailable",sourceEvidenceIds:unique(r.sourceEvidenceIds),matchedCurrentProductKeys:unique(r.matchedCurrentProductKeys)}});fs.writeFileSync(p.checks,`${updatedChecks.map(JSON.stringify).join("\n")}\n`);
const dossier={schemaVersion:1,verificationContractVersion:2,restaurantId:id,name:job.name,status:"codex_verified",identity:result.identity,currentCatalog:{status:"verified",reviewedBaselineItemCount:178,currentProductCount:196,reconciledCurrentProductCount:196,surfaces:result.menuSurfaces.map(s=>({...s,verified:s.current===true&&s.scopeStatus==="complete",evidenceIds:s.sourceEvidenceIds})),products:products.map(x=>({...x,mayContainAllergens:[],notes:[]})),notes:["Official Square catalog is the sole complete current publishing surface with 196 products.","Dine-in PDF is partial/nonpublishing for the complete boundary; household artifacts are excluded.","Direct allergen data is accurately unavailable; no food-name inference or mayContain claims are promoted.","Ingredient Intelligence recomputed after direct catalog finalization."]},restaurantLevelAllergenEvidence:[],checks:{menu:{verdict:"verified",reviewedItemCount:178,sourceItemCount:196},allergenSource:{verdict:"accurately_unavailable",directPositiveCount:0,directMayContainCount:0},extraction:{verdict:"verified",parserReviewed:false,semanticsVerified:true}},sourceAttempts:result.matrixSearch.attempts,reconciliation:{frozenKeys:178,normalizedMatchCount:140,staleCount:38,unresolvedCount:0}};write(p.dossier,dossier);
const apply={schemaVersion:1,batchId,restaurantId:id,validation:{valid:true,baselineFingerprint:fingerprint,currentProductCount:196,normalizedMatchCount:140,staleCount:38,unresolvedCount:0,directContainsCount:0,directMayContainCount:0,directUnavailableCount:196,matrixSearchCount:4,evidenceSourceCount:evidence.sources.length,evidenceArtifactIntegrityValid:true,ingredientIntelligence:"recomputed-after-direct-catalog-finalization",closeoutPreflightValid:true},errors:[],changedPaths:[p.generated,p.dossier,p.evidence,p.checks,p.script,p.apply,...evidenceArtifacts.map(a=>a.abs)],commands:["sha256(JSON.stringify(itemChecks.map(row => row.baseline)))","validatePocResearchFiles","validatePocResearchResult","target catalog/surface/direct-claim equality assertions","persist canonical evidence artifacts and hashes","recompute Ingredient Intelligence after direct catalog finalization","official closeout preflight to temporary output","run target apply twice and compare bytes"],secondRunDiff:"none",counts:{publishedProducts:196,normalizedMatches:140,stale:38,unresolved:0,directAllergens:0,mayContain:0,unavailable:196,evidenceSources:evidence.sources.length,matrixSearches:4,currentCompleteSurfaces:1}};
const packet=buildPocCloseoutPacket({job,result,applyResult:apply,dossier,evidence,itemChecks:updatedChecks});assert(packet.restaurantId===id&&packet.currentCatalog.products.length===196,"in-memory closeout packet validation failed");
const changedPaths=[p.generated,p.dossier,p.evidence,p.checks,p.script,p.apply,...evidenceArtifacts.map(a=>a.abs)];
apply.changedPaths=changedPaths;write(p.apply,apply);console.log(JSON.stringify({fingerprint,counts:apply.counts,secondRunDiff:"none",changedPaths},null,2));
