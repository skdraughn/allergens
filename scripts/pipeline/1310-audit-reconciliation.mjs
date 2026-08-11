import { build1310AuditSnapshot, sourceUrls1310 } from "./1310-audit-catalog.mjs";

const rules = new Map(Object.entries({
  "1310-cheeseburger-gfo": ["normalized_match", "verified", "1310 Cheeseburger"],
  "almond-milk": ["exact_match", "mismatch", "Almond Milk"],
  "assorted-julius-meinl-hot-tea": ["exact_match", "accurately_unavailable", "Assorted Julius Meinl Hot Tea"],
  "avocado-toast-and-poached": ["normalized_match", "mismatch", "Avocado Toast & Poached Egg"],
  "avocado-toast-and-poached-egg-vo": ["normalized_match", "verified", "Avocado Toast & Poached Egg"],
  "blt-on-toasted-multigrain": ["normalized_match", "verified", "B.L.T. on Toasted Multigrain"],
  "bacon-and-eggs-gfo": ["normalized_match", "mismatch", "Bacon & Eggs"],
  "baked-apple-french-toast": ["stale_extra", "not_applicable", null],
  "beef-chili-1qt": ["exact_match", "accurately_unavailable", "Beef Chili 1qt"],
  "bottled-water": ["artifact", "not_applicable", null],
  "bowl-of-fresh-fruit": ["stale_extra", "not_applicable", null],
  "breakfast-egg-and-cheese-to-go": ["stale_extra", "not_applicable", null],
  "breakfast-enchiladas": ["stale_extra", "not_applicable", null],
  "brusselssprouts-and-bacon": ["normalized_match", "accurately_unavailable", "Brussels Sprouts & Bacon"],
  "buttermilk-pancakes-v": ["normalized_match", "mismatch", "Buttermilk Pancakes"],
  "challah-french-toast-topped-with-sliced": ["normalized_match", "verified", "Challah French Toast Topped with Sliced Banana"],
  "chia-seed-pudding": ["stale_extra", "not_applicable", null],
  "chicken-and-rice-soup-1qt": ["exact_match", "accurately_unavailable", "Chicken & Rice Soup 1qt"],
  "chicken-enchiladas": ["variant_match", "verified", "Chicken Enchiladas, 23 oz"],
  "chicken-pot-pie": ["variant_match", "verified", "Chicken Pot Pie, 23 oz"],
  "choppedchinesechickensalad-26-g-f": ["normalized_match", "verified", "Chopped Chinese Chicken Salad"],
  "chopped-chinese-chicken-salad-gf": ["artifact", "not_applicable", "Chopped Chinese Chicken Salad"],
  "cobbsalad": ["normalized_match", "verified", "Cobb Salad"],
  "coffee-tea-and-hot-beverages": ["artifact", "not_applicable", null],
  "deconstructed-call-your-mother": ["normalized_match", "mismatch", "Deconstructed Call Your Mother Bagel & Ivy City Smoked Salmon"],
  "egg-enchiladas": ["variant_match", "mismatch", "Egg Enchiladas, 16 oz"],
  "egg-white-omelette": ["exact_match", "verified", "Egg White Omelette"],
  "egg-white-omelette-and-home-fries": ["exact_match", "mismatch", "Egg White Omelette & Home Fries"],
  "eggplant-parmesan": ["variant_match", "verified", "Eggplant Parmesan, 64 oz"],
  "eggs-benedict": ["exact_match", "verified", "Eggs Benedict"],
  "eggs-benedict-and-home-fries": ["exact_match", "mismatch", "Eggs Benedict & Home Fries"],
  "frenchfries": ["normalized_match", "accurately_unavailable", "French Fries"],
  "fresh-seasonal-fruit-vv-gf": ["normalized_match", "accurately_unavailable", "Fresh Seasonal Fruit"],
  "friedchickensandwich": ["normalized_match", "mismatch", "Fried Chicken Sandwich"],
  "fried-chicken-sandwich": ["artifact", "not_applicable", "Fried Chicken Sandwich"],
  "gingercoconutcurry": ["normalized_match", "mismatch", "Ginger Coconut Curry"],
  "greek-salad-and-lentils": ["normalized_match", "verified", "Greek Salad & Lentils"],
  "grilledprimenystripsteak": ["normalized_match", "accurately_unavailable", "Grilled Prime NY Strip Steak"],
  "grilled-salad-additions-gf": ["artifact", "not_applicable", null],
  "grilled-shrimp-tacos-gf": ["normalized_match", "verified", "Grilled Shrimp Tacos"],
  "ham-egg-and-cheese-croissant": ["normalized_match", "verified", "Ham Egg & Cheese Croissant"],
  "hemp-agave": ["artifact", "not_applicable", null],
  "home-fried-potatoes": ["exact_match", "accurately_unavailable", "Home Fried Potatoes"],
  "hotturkeycubano": ["normalized_match", "mismatch", "Hot Turkey Cubano"],
  "hot-turkey-cubano": ["artifact", "not_applicable", "Hot Turkey Cubano"],
  "huevos-rancheros": ["exact_match", "verified", "Huevos Rancheros"],
  "huevos-rancheros-kit": ["stale_extra", "not_applicable", null],
  "jar-of-fresh-fruit": ["stale_extra", "not_applicable", null],
  "jenns-chicken": ["artifact", "not_applicable", "Jenn's Chicken Pot Pie"],
  "jenn-schickenpotpie": ["normalized_match", "accurately_unavailable", "Jenn's Chicken Pot Pie"],
  "layered-omelette": ["stale_extra", "not_applicable", null],
  "mac-and-blue-cheese": ["variant_match", "verified", "Mac & Blue Cheese, 16 oz"],
  "macha-latte": ["normalized_match", "accurately_unavailable", "Matcha Latte"],
  "meatcrafters-turkey-sausage": ["exact_match", "accurately_unavailable", "MeatCrafters Turkey Sausage"],
  "moussaka": ["variant_match", "verified", "Moussaka, 64 oz"],
  "nonnas-rum-cake": ["normalized_match", "mismatch", "Nonna's Rum Cake"],
  "nueske-smoked-bacon-3-pieces": ["normalized_match", "accurately_unavailable", "Nueske Applewood Smoked Bacon (3 pieces)"],
  "organic-tofu-egg-substitute-vegan-i": ["artifact", "not_applicable", null],
  "organic-tofu-egg-substitute-vv-i": ["artifact", "not_applicable", null],
  "overnight-oats": ["stale_extra", "not_applicable", null],
  "parmesanarancini": ["normalized_match", "verified", "Parmesan Arancini"],
  "penne-with-lamb-ragu": ["variant_match", "mismatch", "Penne with Lamb Ragu, 23 oz"],
  "porchetta": ["exact_match", "accurately_unavailable", "Porchetta"],
  "roastedbeetsalad": ["normalized_match", "verified", "Roasted Beet Salad"],
  "roastedbroccolini": ["normalized_match", "accurately_unavailable", "Roasted Broccolini"],
  "sandwiches-and-salads": ["artifact", "not_applicable", null],
  "sauteedspinach": ["normalized_match", "accurately_unavailable", "Sauteed Spinach"],
  "sesamesearedtuna": ["normalized_match", "mismatch", "Sesame Seared Tuna"],
  "shakshuka": ["exact_match", "verified", "Shakshuka"],
  "shakshuka-starter": ["variant_match", "verified", "Shakshuka Starter, 64 oz"],
  "short-ribs-frozen": ["exact_match", "accurately_unavailable", "Short Ribs - Frozen"],
  "side-orders": ["artifact", "not_applicable", null],
  "smoked-beef-brisket-hash-and-fried": ["normalized_match", "mismatch", "Smoked Beef Brisket Hash & Fried Egg"],
  "smoked-kielbasa-sausage": ["exact_match", "accurately_unavailable", "Smoked Kielbasa Sausage"],
  "smoked-salmon-and-bagel-platter": ["stale_extra", "not_applicable", null],
  "smoothies": ["artifact", "not_applicable", null],
  "spinach-and-cheese-strata": ["stale_extra", "not_applicable", null],
  "steak-and-eggs-gfo": ["normalized_match", "verified", "Steak & Eggs"],
  "steel-cut-oatmeal-vv-gf": ["normalized_match", "mismatch", "Steel Cut Oatmeal"],
  "thewedge": ["normalized_match", "mismatch", "The Wedge"],
  "tomato-bisque-and-grilled-cheese": ["normalized_match", "mismatch", "Tomato Bisque & Grilled Cheese"],
  "tuscankale-and-quinoasalad": ["normalized_match", "verified", "Tuscan Kale & Quinoa Salad"],
  "valentines-milk-and-cookies": ["stale_extra", "not_applicable", null],
  "vegan-lasagna": ["variant_match", "mismatch", "Vegan Lasagna, 23 oz"],
  "vegetable-pot-pie": ["variant_match", "verified", "Vegetable Pot Pie, 64 oz"],
  "yogurt": ["variant_match", "verified", "House Made Granola & Greek Yogurt"],
  "zucchini-lasagna": ["variant_match", "verified", "Zucchini Lasagna, 64 oz"],
}));

const evidenceByUrl = new Map([
  [sourceUrls1310.breakfast, "official-pdf-2265"],
  [sourceUrls1310.brunch, "official-pdf-f295"],
  [sourceUrls1310.lunch, "official-pdf-7101"],
  [sourceUrls1310.dinner, "official-pdf-c557"],
  [sourceUrls1310.barBites, "official-pdf-bar-bites"],
  [sourceUrls1310.lateNight, "official-pdf-late-night"],
  [sourceUrls1310.toast, "linked-toast-current"],
]);

export function reconcile1310Baseline(itemChecks) {
  const snapshot = build1310AuditSnapshot({ retrievedAt: "2026-07-14T17:09:02.308Z" });
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  if (itemChecks.length !== rules.size) {
    throw new Error(`Expected ${rules.size} baseline checks; found ${itemChecks.length}.`);
  }

  return itemChecks.map((check) => {
    const [disposition, allergenVerdict, targetName] = rules.get(check.baseline.itemId) ?? [];
    if (!disposition) throw new Error(`Missing 1310 rule for ${check.baseline.itemId}.`);
    const target = targetName ? byName.get(targetName) : null;
    if (targetName && !target) throw new Error(`Missing current target ${targetName}.`);

    if (allergenVerdict === "verified" && !sameSet(check.baseline.allergens, target.allergens)) {
      throw new Error(`${check.baseline.itemId}: verified allergen sets differ.`);
    }
    if (
      allergenVerdict === "accurately_unavailable" &&
      target?.allergenSourceType !== "unavailable"
    ) {
      throw new Error(`${check.baseline.itemId}: target is not allergen-unavailable.`);
    }
    if (
      allergenVerdict === "mismatch" &&
      target &&
      sameSet(check.baseline.allergens, target.allergens) &&
      check.baseline.allergenSourceType === target.allergenSourceType
    ) {
      throw new Error(`${check.baseline.itemId}: mismatch rule has matching allergen data.`);
    }

    const sourceEvidenceIds = target
      ? unique(target.sourceUrls.map((url) => evidenceByUrl.get(url)).filter(Boolean))
      : staleEvidenceIds(check);
    const baselineSignals = check.baseline.allergens.length > 0
      ? check.baseline.allergens.join(", ")
      : "none";
    const currentSignals = target?.allergens.length > 0
      ? target.allergens.join(", ")
      : target
        ? "none / unavailable"
        : "not applicable";

    return {
      auditItemKey: check.auditItemKey,
      disposition,
      allergenVerdict,
      sourceEvidenceIds,
      notes: target
        ? `Current match: ${target.name}. Baseline signals: ${baselineSignals}; current direct menu signals: ${currentSignals}.`
        : disposition === "artifact"
          ? "The baseline row is a heading, modifier, duplicate, or OCR fragment rather than a standalone current menu item."
          : "The item is absent from the current official PDFs and current public Toast menu and is adjudicated stale.",
    };
  });
}

function staleEvidenceIds(check) {
  const urls = check.baseline.sourceUrls ?? [];
  const ids = urls.map((url) => evidenceByUrl.get(url)).filter(Boolean);
  if (urls.some((url) => /toasttab\.com/i.test(url))) ids.push("linked-toast-current");
  ids.push("official-home");
  return unique(ids);
}

function sameSet(left = [], right = []) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function unique(values) {
  return [...new Set(values)];
}

export const reconciliationRuleCount1310 = rules.size;
