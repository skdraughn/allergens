import { build1799PrimeAuditSnapshot } from "./1799-prime-audit-catalog.mjs";

const currentTargets = new Map(Object.entries({
  "1799-burger": "1799 Burger",
  "1799-steak-roll": "1799 Steak Roll",
  "blackened-whiskey-shrimp": "Blackened Whiskey Shrimp",
  "brussels-sprouts-salad-gf": "Brussels Sprouts Salad (GF)",
  "cheesecake-creme-brulee": "Cheesecake Crème Brulee",
  "chefs-prime-rib": "Chef's Prime Rib 16 oz",
  "chicken-scarpariello-gf": "Chicken Scarpariello (GF)",
  "citrus-salad-gf": "Citrus Salad (GF)",
  "cobb-salad": "Cobb Salad",
  "crab-and-oyster-rockefeller": "Crab & Oyster Rockefeller",
  "crab-avocado-tower": "Crab Avocado Tower",
  "crab-cake": "Crab Cake",
  "crab-cake-sandwich": "Crab Cake Sandwich",
  "crab-cakes": "Crab Cakes",
  "featured-dessert": "Featured Dessert",
  "featured-entree-mp": "Featured Entree",
  "fish-and-chips": "Fish & Chips",
  "fried-green-tomato": "Fried Green Tomato",
  "grilled-chicken-sandwich": "Grilled Chicken Sandwich",
  "jasmine-green": "Jasmine Green Tea",
  "kale-caesar-salad": "Kale Caesar Salad",
  "lena-marie": "Lena Marie",
  "pan-roasted-branzino-gf": "Pan Roasted Branzino (GF)",
  "prime-french-dip-sandwich": "Prime French Dip Sandwich",
  "prime-house-salad": "Prime House Salad",
  "seared-scallops": "Seared Scallops",
  "shrimp-ceviche-gf": "Shrimp Ceviche (GF)",
  "shrimp-tacos": "Shrimp Tacos",
  "soup-du-jour": "Soup Du Jour",
  "steak-frites-gf": "Steak Frites (GF)",
  "steak-salad": "Steak Salad",
  "sweet-tea": "Sweet Tea",
  "szechuan-salmon-gf-l29-d37": "Szechuan Salmon (GF)",
  "truffle-fries-gf": "Truffle Fries (GF)",
  "unsweet-black-tea": "Unsweet Black Tea",
  "wedge-salad": "Wedge Salad",
  "wings": "Wings",
}));

const staleItems = new Set([
  "broiled-cod",
  "chocolate-peanut-butter-pie",
  "clams-and-mussles",
  "duroc-pork-chop-gf",
  "molten-lava-cake",
  "smoked-agave",
]);

const artifacts = new Set([
  "promotions-and-events",
  "dress-code",
  "added-to-force-private-dining-to-the-right-of-the-logo",
  "permitted-in-the-bar-area-and-patio",
  "crab-cake-23-chilled-lump-crab-15-seared-scallops",
  "grilled-flat-iron-steak-19-grilled-salmon-12-grilled-shrimp",
  "grilled-chicken",
  "haricots-verts-gf-braised-collard-greens",
  "macaroni-and-cheese-burgundy-mushrooms-gf-garlic-mashed-potatoes-gf",
  "sauteed-brussels-sprouts-gf-grilled-asparagus-gf",
  "sweet-mashed-potatoes-gf-potatoes-au-gratin-gf-frites-gf",
]);

export function reconcile1799PrimeBaseline(
  itemChecks,
  { snapshot = build1799PrimeAuditSnapshot({ retrievedAt: "2026-07-14T17:33:33.824Z" }) } = {},
) {
  const byName = new Map(snapshot.items.map((item) => [item.name, item]));

  if (itemChecks.length !== 53) {
    throw new Error(`Expected 53 frozen 1799 Prime rows; found ${itemChecks.length}.`);
  }

  return itemChecks.map((check) => {
    const id = check.baseline.itemId;
    if (artifacts.has(id)) {
      return {
        auditItemKey: check.auditItemKey,
        disposition: "artifact",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: artifactEvidence(id),
        notes: artifactNote(id),
      };
    }
    if (staleItems.has(id)) {
      return {
        auditItemKey: check.auditItemKey,
        disposition: "stale_extra",
        allergenVerdict: "not_applicable",
        sourceEvidenceIds: ["official-home", "official-dinner-july-2026"],
        notes: "This item appears in the prior menu but is absent from the restaurant's current July 2026 dinner menu.",
      };
    }

    const targetName = currentTargets.get(id);
    const target = byName.get(targetName);
    if (!target) throw new Error(`Missing current target for ${id}: ${targetName ?? "no rule"}.`);
    const allergenVerdict = sameSet(check.baseline.allergens, target.allergens) &&
      sameSet(check.baseline.mayContain, target.mayContain) &&
      check.baseline.allergenSourceType === target.allergenSourceType
      ? target.allergenSourceType === "unavailable" ? "accurately_unavailable" : "verified"
      : "mismatch";
    const disposition = normalizedName(check.baseline.name) === normalizedName(target.name)
      ? "normalized_match"
      : "variant_match";

    return {
      auditItemKey: check.auditItemKey,
      disposition,
      allergenVerdict,
      sourceEvidenceIds: target.category === "Beverages · Cocktails"
        ? ["official-cocktail-june-2026"]
        : ["official-dinner-july-2026"],
      notes: `Current match: ${target.name}. Baseline contains: ${signals(check.baseline.allergens)}; baseline may contain: ${signals(check.baseline.mayContain)}; current contains: ${signals(target.allergens)}; current may contain: ${signals(target.mayContain)}.`,
    };
  });
}

function artifactEvidence(id) {
  return [
    "official-home",
    ...(id === "promotions-and-events" || id === "dress-code" || id.startsWith("added-") || id.startsWith("permitted-"))
      ? []
      : ["official-dinner-july-2026"],
  ];
}

function artifactNote(id) {
  if (["promotions-and-events", "dress-code", "added-to-force-private-dining-to-the-right-of-the-logo", "permitted-in-the-bar-area-and-patio"].includes(id)) {
    return "Website navigation, accessibility/layout text, or dress-code content was incorrectly emitted as a menu item.";
  }
  if (id === "grilled-chicken" || id.includes("grilled-flat-iron") || id.includes("crab-cake-23")) {
    return "A protein-addition modifier line was incorrectly emitted as a standalone menu item.";
  }
  return "Multiple distinct side dishes were collapsed into one composite row instead of being represented as individual current menu items.";
}

function normalizedName(value) {
  return String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[’']/g, "").replace(/\*+/g, "").replace(/\(gf\)/gi, "")
    .replace(/\b(?:l\d+\s*\/\s*d\d+|mp|\d+\s*oz)\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function signals(values = []) {
  return values.length ? values.join(", ") : "none / unavailable";
}

function sameSet(left = [], right = []) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export const reconciliationRuleCount1799Prime = currentTargets.size + staleItems.size + artifacts.size;
