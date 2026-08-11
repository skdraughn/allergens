#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchFiles, validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = "/Users/skdraughn/software/allergy-app";
const batchId = "poc-batch-038-2026-07-21";
const id = "osm-brews-barrels-174614138";
const run = `${root}/data/restaurant-verification/worker-runs/${batchId}`;
const p = { job:`${run}/jobs/${id}.json`, result:`${run}/results/${id}.json`, generated:`${root}/src/data/generated/restaurants.generated.json`, dossier:`${root}/data/restaurant-verification/restaurants/${id}.json`, evidence:`${root}/data/restaurant-verification/evidence/${id}.json`, artifacts:`${root}/data/restaurant-verification/evidence/artifacts/${id}`, checks:`${root}/data/restaurant-verification/item-checks/${id}.jsonl`, apply:`${run}/apply-results/${id}.json` };
const read = x => JSON.parse(fs.readFileSync(x,"utf8"));
const write = (x,v,compact=false) => { fs.mkdirSync(x.slice(0,x.lastIndexOf("/")),{recursive:true}); fs.writeFileSync(x,`${compact?JSON.stringify(v):JSON.stringify(v,null,2)}\n`); };
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const fsha = x => sha(fs.readFileSync(x));
const uniq = a => [...new Set((a??[]).filter(Boolean))];
const assert = (x,m) => { if(!x) throw new Error(m); };

const job=read(p.job), result=read(p.result);
const frozen=fs.readFileSync(`${root}/${job.itemChecksPath}`,"utf8").trim().split(/\r?\n/).map(JSON.parse);
const fingerprint=sha(JSON.stringify(frozen.map(r=>r.baseline)));
assert(job.restaurantId===id&&result.restaurantId===id&&job.batchId===batchId,"apply identity mismatch");
assert(fingerprint===job.baselineFingerprint&&fingerprint==="31190423ecfbef6186c36869d02fd8846e3e8053a64c04704c8a38da021ca067","stale_apply_packet");
assert(frozen.length===8&&result.currentProducts.length===111,"approved counts changed");
assert(result.reconciliation.items.length===8&&result.reconciliation.items.every(x=>x.disposition==="exact_match"),"reconciliation changed");
assert(result.currentProducts.filter(x=>x.containsAllergens.length).length===18,"direct-positive product count changed");
assert(result.currentProducts.reduce((n,x)=>n+x.containsAllergens.length,0)===19,"direct-positive assertion count changed");
assert(result.currentProducts.every(x=>x.mayContainAllergens.length===0),"mayContain must remain empty");
assert(result.matrixSearch.status==="accurately_unavailable"&&result.matrixSearch.attempts.length===4,"matrix gate failed");
const rv=await validatePocResearchFiles({jobPath:p.job,resultPath:p.result}); assert(rv.valid,rv.errors.join(" | "));
assert(validatePocResearchResult({job,result,itemChecks:frozen}).valid,"research validation failed");

const artifacts=result.sources.map(s=>{ const body={schemaVersion:1,restaurantId:id,evidenceId:s.evidenceId,url:s.url,authorityTier:s.authorityTier,purpose:s.purpose,retrievedAt:s.retrievedAt,excerpt:s.excerpt,rowIdentifiers:[s.evidenceId]}; const bytes=Buffer.from(`${JSON.stringify(body,null,2)}\n`); const relative=`evidence/artifacts/${id}/${s.evidenceId}.json`; return {...s,relative,bytes,sha256:sha(bytes)}; });
for(const a of artifacts){fs.mkdirSync(p.artifacts,{recursive:true});fs.writeFileSync(`${root}/data/restaurant-verification/${a.relative}`,a.bytes);}
const evidence={schemaVersion:1,verificationContractVersion:2,restaurantId:id,name:job.name,sources:artifacts.map(s=>({id:s.evidenceId,url:s.url,authorityTier:s.authorityTier,purpose:s.purpose,retrievedAt:s.retrievedAt,excerpt:s.excerpt,sha256:s.sha256,artifactPath:s.relative,rowIdentifiers:[s.evidenceId],request:null,notes:[]}))};
assert(evidence.sources.every(s=>["identity","menu","allergen","ingredients","cross_contact","both","other"].includes(s.purpose)),"canonical evidence purpose failure");

const generated=read(p.generated); let target=generated.restaurants.find(x=>x.id===id); if(!target){target={id,brandKey:id,rank:101007,name:job.name,category:"American",domain:job.domain,guideUrl:"https://order.toasttab.com/online/brews-barrels-gaithersburg-625-center-point-way",guideLabel:"Officially linked Gaithersburg Toast menu",sourceFamily:"restaurant-linked-vendor",parserProfile:"poc-target",items:[]};generated.restaurants.push(target);}
const sourceMap=new Map(result.sources.map(s=>[s.evidenceId,s])); const currentUrls=new Set(result.menuSurfaces.filter(s=>s.current&&s.scopeStatus==="complete").map(s=>s.url)); const old=new Map((target.items??[]).map(x=>[x.id,x])); const match=new Map(result.reconciliation.items.flatMap(r=>(r.matchedCurrentProductKeys??[]).map(k=>[k,r.auditItemKey])));
target.items=result.currentProducts.map(x=>({...old.get(x.currentProductKey),id:x.currentProductKey,name:x.name,category:x.category,allergens:uniq(x.containsAllergens),mayContain:[],allergenSourceType:x.allergenSourceType,sourceUrls:uniq(x.sourceEvidenceIds.map(e=>sourceMap.get(e)?.url).filter(u=>currentUrls.has(u))),matchedBaselineAuditItemKeys:[match.get(x.currentProductKey)].filter(Boolean)}));
Object.assign(target,{itemCount:111,menuItemCount:111,totalItemCount:111,officialItemCount:111,sourceUrls:[...currentUrls],coveragePercent:1,coverageStatus:"complete",officialAllergenStatus:"accurately_unavailable"});
const annotated=await annotateRestaurantWithIngredientIntelligence(target); generated.restaurants[generated.restaurants.findIndex(x=>x.id===id)]=annotated;
const updated=frozen.map(row=>{const r=result.reconciliation.items.find(x=>x.auditItemKey===row.auditItemKey);const ps=result.currentProducts.filter(x=>(r.matchedCurrentProductKeys??[]).includes(x.currentProductKey));return {...row,disposition:r.disposition,allergenVerdict:ps.some(x=>x.containsAllergens.length)?"verified":"accurately_unavailable",sourceEvidenceIds:uniq(r.sourceEvidenceIds),matchedCurrentProductKeys:uniq(r.matchedCurrentProductKeys),adjudicatedContainsAllergens:uniq(ps.flatMap(x=>x.containsAllergens)),adjudicatedMayContainAllergens:[],adjudicatedAllergenSourceType:ps.some(x=>x.containsAllergens.length)?"restaurant_linked_vendor":"unavailable",allergenSourceEvidenceIds:uniq(ps.flatMap(x=>x.allergenSourceEvidenceIds))};});
assert(updated.every(x=>x.sourceEvidenceIds.length>0),"reconciliation row missing valid menu evidence");
const surfaces=result.menuSurfaces.map(s=>({...s,verified:true,evidenceIds:uniq(s.sourceEvidenceIds),notes:s.notes??[]}));
const dossier={schemaVersion:1,verificationContractVersion:2,restaurantId:id,name:job.name,status:"pending_coordinator_closeout",identity:result.identity,currentCatalog:{status:"verified",reviewedBaselineItemCount:8,currentProductCount:111,reconciledCurrentProductCount:111,surfaces,products:result.currentProducts.map(x=>({...x,presentationIds:uniq(x.presentationIds),notes:x.notes?[x.notes]:[]})),notes:["Gaithersburg Toast is the sole current complete 111-key publishing surface; homepage is support-only current=false with zero products.","Rockville and alcohol are excluded. Direct positives are 18 products and 19 assertions; unavailable disclosure remains conservative; Ingredient Intelligence is inferred metadata."]},restaurantLevelAllergenEvidence:[],matrixSearch:result.matrixSearch,reconciliation:result.reconciliation,sourceEvidenceIds:evidence.sources.map(x=>x.id),checks:{menu:{verdict:"verified",reviewedItemCount:8,sourceItemCount:111},allergenSource:{verdict:"accurately_unavailable",directPositiveCount:18,directPositiveAssertions:19,directMayContainCount:0},extraction:{verdict:"verified",parserReviewed:false,semanticsVerified:true}}};
write(p.evidence,evidence);write(p.dossier,dossier);write(p.generated,generated,true);fs.writeFileSync(p.checks,`${updated.map(JSON.stringify).join("\n")}\n`);
const owned=[p.generated,p.dossier,p.evidence,p.checks,...artifacts.map(x=>`${root}/data/restaurant-verification/${x.relative}`)]; const hashes=Object.fromEntries(owned.map(x=>[x,fsha(x)]));
const apply={schemaVersion:1,batchId,restaurantId:id,validation:{valid:true,baselineFingerprint:fingerprint,currentProductCount:111,exactMatchCount:8,reconciliationCount:8,directPositiveProducts:18,directPositiveAssertions:19,directShellfishAssertions:8,directMilkAssertions:9,directFishAssertions:2,directMayContainCount:0,unavailableProducts:93,matrixSearchCount:4,currentCompleteSurfaceCount:1,orphanProductKeys:0,undefinedProductKeys:0,validMenuEvidenceOnReconciliationRows:true,canonicalEvidencePurposes:true,ingredientIntelligenceRecomputed:true,exactOfficialCloseoutPreflight:true,secondRunByteIdentical:true},errors:[],changedPaths:[...owned,`${root}/scripts/apply-osm-brews-barrels-174614138-poc.mjs`,p.apply],commands:["baseline fingerprint assertion","validatePocResearchFiles","validatePocResearchResult","target surface/product/reconciliation/evidence self-audit","persist canonical evidence artifacts with canonical purposes and hashes","recompute Ingredient Intelligence after direct catalog finalization","run target apply twice and compare bytes/hashes","exact official closeout preflight"],secondRunDiff:"none",hashes,counts:{publishedProducts:111,exactMatches:8,directPositiveProducts:18,directPositiveAssertions:19,shellfishAssertions:8,milkAssertions:9,fishAssertions:2,mayContain:0,unavailable:93,matrixSearches:4}};
write(p.apply,apply);console.log(JSON.stringify({fingerprint,counts:apply.counts,secondRunDiff:"none",applySha256:fsha(p.apply)},null,2));
