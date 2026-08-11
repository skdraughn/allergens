import fs from "node:fs";

const resultPath = "data/restaurant-verification/worker-runs/poc-batch-016-2026-07-16/results/osm-berries-bowls-1323149413.json";
const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));

const allowedDirectAllergens = new Map([
  ["double-berry", ["peanut"]],
  ["heavenly", ["peanut"]],
  ["tropical", ["tree-nut"]],
  ["rainforest", ["peanut"]],
  ["nutty-professor", ["peanut", "tree-nut"]],
  ["almondcado", ["tree-nut"]],
  ["rise-and-shine", ["egg"]],
  ["caprese", ["milk"]],
  ["emmy", ["peanut"]],
  ["pbandj", ["peanut"]],
  ["greek-yogurt-parfait", ["milk"]],
  ["crazy-monkey", ["peanut"]],
]);

for (const product of result.currentProducts) {
  const containsAllergens = allowedDirectAllergens.get(product.currentProductKey) ?? [];
  product.containsAllergens = containsAllergens;
  product.mayContainAllergens = [];
  if (containsAllergens.length === 0) {
    product.allergenEvidenceStatus = "unavailable";
    product.allergenSourceType = "unavailable";
    product.allergenSourceEvidenceIds = [];
    product.allergenAuthorityTier = null;
    product.authorityVerdict = "unverifiable";
    product.notes = "No exact direct allergen disclosure was found; coconut milk, branded ingredients, and bread names were not promoted to allergen claims.";
  }
}

fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
