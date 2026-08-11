import fs from "node:fs";

const resultPath = "data/restaurant-verification/worker-runs/poc-batch-016-2026-07-16/results/ben-s-next-door-washington-dc-dc-metro.json";
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));

const allowedDirectAllergens = new Map([
  ["fried-popcorn-shrimp", ["shellfish"]],
  ["flash-fried-calamari", ["shellfish"]],
  ["shrimp-deviled-eggs", ["shellfish", "egg"]],
  ["jumbo-lump-crab-deviled-eggs", ["shellfish", "egg"]],
  ["steamed-blue-bay-mussels", ["shellfish"]],
  ["peel-eat-shrimp-half-pound", ["shellfish"]],
  ["peel-eat-shrimp-one-pound", ["shellfish"]],
  ["shrimp-calamari", ["shellfish"]],
  ["cheese-quesadilla", ["milk"]],
  ["shrimp-quesadilla", ["shellfish"]],
  ["dirty-south-shrimp-chicken-jambalaya", ["shellfish"]],
  ["fried-catfish-grits", ["fish"]],
  ["shrimp-grits", ["shellfish"]],
  ["blackened-salmon-grits", ["fish"]],
  ["shrimp-boat-jumbo-fried-shrimp", ["shellfish"]],
  ["fried-catfish-fingers", ["fish"]],
  ["blackened-shrimp-penne-pasta", ["shellfish"]],
  ["blackened-salmon-penne-pasta", ["fish"]],
  ["blackened-salmon", ["fish"]],
  ["vegetarian-parmesan-penne-pasta", ["milk"]],
  ["fried-chicken-parmesan-penne-pasta", ["milk"]],
  ["louisiana-shrimp-po-boy", ["shellfish"]],
  ["double-bacon-cheeseburger", ["milk"]],
  ["catfish-fish-sandwich", ["fish"]],
  ["blackened-salmon-fillet-brunch", ["fish"]],
  ["salmon-cakes-eggs", ["fish", "egg"]],
  ["jumbo-lump-crab-cake-sandwich", ["shellfish"]],
  ["organic-cheese-grits", ["milk"]],
  ["cheesy-garlic-mashed-potatoes", ["milk"]],
  ["two-eggs-any-style", ["egg"]],
  ["warm-brownie-ice-cream-sundae", ["milk"]],
  ["cheesecake", ["milk"]],
  ["vanilla-ice-cream", ["milk"]],
  ["fish-taco", ["fish"]],
  ["shrimp-taco", ["shellfish"]],
]);

for (const product of result.currentProducts) {
  const containsAllergens = allowedDirectAllergens.get(product.currentProductKey) ?? [];
  product.containsAllergens = containsAllergens;
  product.mayContainAllergens = [];
  if (containsAllergens.length === 0) {
    product.allergenSourceType = "unavailable";
    product.allergenAuthorityTier = null;
    product.allergenSourceEvidenceIds = [];
    product.notes = "No exact direct allergen disclosure was preserved; culinary expectations and unnamed ingredients were not promoted.";
  }
}

fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
