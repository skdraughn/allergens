import fs from "node:fs";

const run = "data/restaurant-verification/worker-runs/poc-batch-018-2026-07-17/results";
const wildwoodPath = `${run}/bethesda-bagels-wildwood-dc-metro.json`;
const wildwood = JSON.parse(fs.readFileSync(wildwoodPath, "utf8"));

for (const surface of wildwood.menuSurfaces) {
  if (surface.surfaceId === "official-brand-menu") surface.current = false;
}
for (const product of wildwood.currentProducts) {
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
  product.containsAllergens = [...new Set(contains)];
  product.mayContainAllergens = [];
  product.allergenSourceType = contains.length ? "restaurant_linked_vendor" : "unavailable";
  product.allergenAuthorityTier = contains.length ? "restaurant_linked_vendor" : null;
  product.allergenSourceEvidenceIds = contains.length ? ["linked-toast-indexed"] : [];
}
wildwood.recommendedLane = "luna_fix";
fs.writeFileSync(wildwoodPath, `${JSON.stringify(wildwood, null, 2)}\n`);

const crabPath = `${run}/bethesda-crab-house-md.json`;
const crab = JSON.parse(fs.readFileSync(crabPath, "utf8"));
for (const product of crab.currentProducts) {
  if (["soft-shell-sandwich-seasonal", "soft-shell-platter-seasonal"].includes(product.currentProductKey)) {
    product.containsAllergens = [];
    product.mayContainAllergens = [];
    product.allergenSourceType = "unavailable";
    product.allergenAuthorityTier = null;
    product.allergenSourceEvidenceIds = [];
  }
}
crab.recommendedLane = "luna_fix";
fs.writeFileSync(crabPath, `${JSON.stringify(crab, null, 2)}\n`);
