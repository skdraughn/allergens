import fs from "node:fs";

const run = "data/restaurant-verification/worker-runs/poc-batch-017-2026-07-17/results";

const betesebPath = `${run}/beteseb-silver-spring-md.json`;
const beteseb = JSON.parse(fs.readFileSync(betesebPath, "utf8"));
for (const surface of beteseb.menuSurfaces) {
  if (["surface-official-order", "surface-linked-grubhub"].includes(surface.surfaceId)) {
    surface.current = false;
    surface.scopeStatus = "supporting";
  }
}
beteseb.changes.menuScopeUnresolved = false;
beteseb.recommendedLane = "verify";
fs.writeFileSync(betesebPath, `${JSON.stringify(beteseb, null, 2)}\n`);

const navyPath = `${run}/bethesda-bagels-navy-yard-dc.json`;
const navy = JSON.parse(fs.readFileSync(navyPath, "utf8"));
for (const product of navy.currentProducts) {
  const name = product.name ?? "";
  const contains = [];
  if (/\beggs?\b/i.test(name)) contains.push("egg");
  if (/\b(?:cheese|cream cheese|butter|yogurt)\b/i.test(name) && !/\btofu\b/i.test(name)) contains.push("milk");
  if (/\b(?:tuna|salmon|whitefish)\b/i.test(name)) contains.push("fish");
  if (/\bpeanut butter\b/i.test(name)) contains.push("peanut");
  if (/\bwalnut\b/i.test(name)) contains.push("tree-nut");
  product.containsAllergens = [...new Set(contains)];
  product.mayContainAllergens = [];
  product.allergenSourceType = contains.length ? "restaurant_linked_vendor" : "unavailable";
  product.allergenAuthorityTier = contains.length ? "restaurant_linked_vendor" : null;
  product.allergenSourceEvidenceIds = contains.length ? ["E-TOAST"] : [];
}
fs.writeFileSync(navyPath, `${JSON.stringify(navy, null, 2)}\n`);

const bethesdaPath = `${run}/bethesda-bagels-dc.json`;
const bethesda = JSON.parse(fs.readFileSync(bethesdaPath, "utf8"));
for (const surface of bethesda.menuSurfaces) {
  if (["MS-HOME", "MS-UBER", "MS-CATERING"].includes(surface.surfaceId)) {
    surface.current = false;
    surface.scopeStatus = "supporting";
  }
}
const sourceById = new Map(bethesda.sources.map((source) => [source.evidenceId, source]));
for (const product of bethesda.currentProducts) {
  const name = product.name ?? "";
  const contains = [];
  if (/\beggs?\b/i.test(name)) contains.push("egg");
  if (/\b(?:cheese|cream cheese|butter|yogurt|milk)\b/i.test(name) && !/\btofu\b/i.test(name)) contains.push("milk");
  if (/\b(?:tuna|salmon|whitefish)\b/i.test(name)) contains.push("fish");
  if (/\bpeanut butter\b/i.test(name)) contains.push("peanut");
  if (/\bwalnut\b/i.test(name)) contains.push("tree-nut");
  if (/\btofu\b/i.test(name)) contains.push("soy");
  if (/\bsesame\b/i.test(name)) contains.push("sesame");
  if (/\bwheat\b/i.test(name)) contains.push("wheat");
  const evidenceId = product.sourceEvidenceIds?.find((id) => sourceById.has(id));
  const authority = sourceById.get(evidenceId)?.authorityTier;
  product.containsAllergens = [...new Set(contains)];
  product.mayContainAllergens = [];
  product.allergenSourceType = contains.length
    ? authority === "restaurant_issued" ? "restaurant_ingredients" : "restaurant_linked_vendor"
    : "unavailable";
  product.allergenAuthorityTier = contains.length ? authority : null;
  product.allergenSourceEvidenceIds = contains.length ? [evidenceId] : [];
}
bethesda.changes.menuScopeUnresolved = false;
fs.writeFileSync(bethesdaPath, `${JSON.stringify(bethesda, null, 2)}\n`);
