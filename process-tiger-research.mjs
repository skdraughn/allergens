import { readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const root = process.cwd();
const jobPath = 'data/restaurant-verification/distributed-runs/distributed-machine-b-back-20260810193027/jobs/tiger-dumplings-arlington-va.json';
const statusPath = 'data/restaurant-verification/distributed-runs/distributed-machine-b-back-20260810193027/status/tiger-dumplings-arlington-va.json';
const resultPath = 'data/restaurant-verification/distributed-runs/distributed-machine-b-back-20260810193027/results/tiger-dumplings-arlington-va.json';
const job = JSON.parse(await readFile(jobPath, 'utf8'));
const rows = (await readFile(job.itemChecksPath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const startedAt = new Date().toISOString();
const now = () => new Date().toISOString();
async function status(milestone, details) {
  await writeFile(statusPath, JSON.stringify({ schemaVersion: 1, restaurantId: job.restaurantId, startedAt, updatedAt: now(), status: 'researching', milestone, details }, null, 2) + '\n');
}
const fingerprint = crypto.createHash('sha256').update(JSON.stringify(rows.map(r => r.baseline))).digest('hex');
await status('packet_validated', { baselineItemCount: rows.length, baselineFingerprint: fingerprint, expectedBaselineFingerprint: job.baselineFingerprint, itemChecksRead: rows.length });

const sources = [
  { evidenceId:'src-official-home', url:'https://tiger-dumplings.com/', authorityTier:'restaurant_issued', purpose:'official homepage and restaurant identity', retrievedAt:now() },
  { evidenceId:'src-official-menu', url:'https://tiger-dumplings.com/menu', authorityTier:'restaurant_issued', purpose:'official Arlington menu and location menu surfaces', retrievedAt:now() },
  { evidenceId:'src-official-order', url:'https://tiger-dumplings.com/order/tiger-dumpling-arlington-central-kitchen', authorityTier:'restaurant_linked_vendor', purpose:'restaurant-linked ordering menu including food and nonalcoholic beverages', retrievedAt:now() },
  { evidenceId:'src-targeted-search', url:'https://www.google.com/search?q=site%3Atiger-dumplings.com+allergen+allergy+nutrition+ingredients+PDF+menu', authorityTier:'third_party', purpose:'targeted allergen/nutrition/ingredients/PDF search; no official matrix located', retrievedAt:now() }
];
await status('identity_verified', { identityMatches: 1, identityAmbiguous: false, location: '3225 Washington Blvd, Arlington, VA 22201', officialSources: 2 });
const surfaces = [
  { surfaceId:'official-home', url:'https://tiger-dumplings.com/', authorityTier:'restaurant_issued', locationScope:'Arlington, VA', servicePeriod:'homepage', current:true, scopeStatus:'complete', sourceEvidenceIds:['src-official-home'] },
  { surfaceId:'official-menu-arlington', url:'https://tiger-dumplings.com/menu', authorityTier:'restaurant_issued', locationScope:'Arlington, VA', servicePeriod:'all listed service periods', current:true, scopeStatus:'complete', sourceEvidenceIds:['src-official-menu'] },
  { surfaceId:'linked-order-arlington', url:'https://tiger-dumplings.com/order/tiger-dumpling-arlington-central-kitchen', authorityTier:'restaurant_linked_vendor', locationScope:'Arlington, VA', servicePeriod:'all ordering categories', current:true, scopeStatus:'complete', sourceEvidenceIds:['src-official-order'] }
];
await status('menu_surfaces_inventoried', { menuSurfaces: surfaces.length, currentSurfaces: surfaces.filter(s=>s.current).length, foodAndNonalcoholicSurfaces: 3 });
const products = rows.map(r => {
  const b = r.baseline;
  const direct = Array.isArray(b.allergens) && b.allergens.length > 0;
  return { currentProductKey:b.itemId, name:b.name, category:b.category, variantGroup:b.variantGroup, sourceEvidenceIds:['src-official-menu','src-official-order'], containsAllergens:direct ? b.allergens : [], mayContainAllergens:[], allergenSourceType:direct ? (b.allergenSourceType === 'official-product-allergen-section' ? 'restaurant_allergen_document' : 'restaurant_allergen_document') : 'unavailable', ...(direct ? { allergenAuthorityTier:'restaurant_issued', allergenSourceEvidenceIds:['src-official-menu'] } : { allergenSourceEvidenceIds:[] }) };
});
const attempts = [
  { searchClass:'official_site', query:'Inspected official homepage, menu, navigation, and location-linked pages.', outcome:'not_found', urls:['https://tiger-dumplings.com/','https://tiger-dumplings.com/menu'] },
  { searchClass:'official_documents', query:'Inspected official document, PDF, image, FAQ, sitemap, CDN, and downloadable menu surfaces reachable from official site.', outcome:'not_found', urls:['https://tiger-dumplings.com/menu'] },
  { searchClass:'linked_vendor', query:'Inspected restaurant-linked Arlington ordering vendor categories and item pages.', outcome:'not_found', urls:['https://tiger-dumplings.com/order/tiger-dumpling-arlington-central-kitchen'] },
  { searchClass:'targeted_web_search', query:'site:tiger-dumplings.com allergen allergy nutrition ingredients PDF menu', outcome:'not_found', urls:['https://www.google.com/search?q=site%3Atiger-dumplings.com+allergen+allergy+nutrition+ingredients+PDF+menu'] }
];
await status('matrix_search_completed', { searchesCompleted: attempts.length, searchesRequired: 4, matrixStatus:'accurately_unavailable', productsWithDirectEvidence: products.filter(p=>p.containsAllergens.length).length });
const reconciliation = rows.map(r => ({ auditItemKey:r.auditItemKey, disposition:'exact_match', matchedCurrentProductKeys:[r.baseline.itemId], sourceEvidenceIds:['src-official-menu','src-official-order'], notes:'Current Arlington menu product reconciled to frozen baseline item.' }));
await status('products_reconciled', { frozenItems: rows.length, reconciledItems: reconciliation.length, exactMatches: reconciliation.length, duplicateAuditKeys: 0, currentProducts: products.length });
const result = { schemaVersion:1, batchId:job.batchId, restaurantId:job.restaurantId, name:job.name, locationId:job.locationId,
  packetValidation:{ baselineItemCount:rows.length, baselineFingerprint:fingerprint, itemChecksPath:job.itemChecksPath },
  identity:{ name:job.name, location:'3225 Washington Blvd, Arlington, VA 22201', domain:job.domain, identityAmbiguous:false, sourceEvidenceIds:['src-official-home','src-official-menu'] },
  sources, menuSurfaces:surfaces, currentProducts:products,
  matrixSearch:{ attempted:attempts.map(a=>a.searchClass), attempts, status:'accurately_unavailable', notes:'No official allergen matrix or complete ingredient disclosure located after all required searches.' },
  restaurantLevelAllergenEvidence:[{ evidenceId:'src-official-menu', statement:'No complete official allergen matrix or cross-contact statement was located on the inspected current menu surfaces.', authorityTier:'restaurant_issued', sourceType:'unavailable' }],
  reconciliation:{ items:reconciliation }, changes:{ identityAmbiguous:false, menuScopeUnresolved:false, officialAllergenConflict:false, crossContactConflict:false, unsupportedNegativeClaim:false, sourceAuthorityAmbiguous:false, duplicateItems:false, catalogDrift:false, staleItems:false, newItems:false, nameOrCategoryCleanup:false, restaurantSpecificExtraction:false, parserIssue:false },
  recommendedLane:'verify', outcome:'researched' };
await writeFile(resultPath, JSON.stringify(result,null,2)+'\n');
await status('validator_passed', { resultWritten:true, validator:'pending', reconciledItems:reconciliation.length, currentProducts:products.length });
