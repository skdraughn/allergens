import crypto from "node:crypto";
import fs from "node:fs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const apply = process.argv.includes("--apply");
const repositoryPath = "src/data/generated/restaurants.generated.json";
const imperfectoId = "imperfecto-dc";
const laFiammaId = "replacement-la-fiamma-italian-kitchen-alexandria-va";
const dinnerUrl = "https://www.sevenreasonsgroup.com/menus/imperfecto/dinner.pdf";
const brunchUrl = "https://www.sevenreasonsgroup.com/menus/imperfecto/brunch.pdf";
const chefsTableUrl = "https://www.sevenreasonsgroup.com/menus/imperfecto/chefs-table.pdf";
const officialProfileId = "imperfecto-dinner-2026-08";
const coveredAllergenIds = ["egg", "fish", "gluten", "milk", "peanut", "sesame", "shellfish", "soy", "tree-nut", "wheat"];
const repository = readJson(repositoryPath);
const existing = repository.restaurants.find((restaurant) => restaurant.id === imperfectoId);
if (!existing) throw new Error("Missing Imperfecto generated record.");

const dinner = [
  ["Moussaka Cigar", "Starters & Mains", "Phyllo dough, smoked eggplant, ground lamb, pine nuts, goat-manchego cheese cream.", ["gluten", "milk", "tree-nut"]],
  ["Falafel", "Starters & Mains", "Latin tahini, sumac, and cardamom.", ["sesame"]],
  ["Tomato Salad", "Starters & Mains", "Heirloom tomatoes, cucumber, cherries, pumpkin seeds, Mexican herbs, and focaccia.", ["gluten"]],
  ["Aladdin Burrata", "Starters & Mains", "Tamarind hummus, crispy lentil tabbouleh, and apple compote.", ["gluten", "milk", "sesame"]],
  ["Madai Crudo", "Starters & Mains", "Sea bream, tahini salsa macha, avocado, green aguachile, and tostada.", ["fish", "sesame"]],
  ["Celeriac", "Starters & Mains", "Roasted celery root, heart of palm, chimichurri, salsa cruda, and tepache.", []],
  ["Truffle Tagliolini", "Starters & Mains", "Homemade pasta, sweet corn cream, asparagus, pecorino romano, and truffle.", ["gluten", "milk"]],
  ["Tiger Prawns A La Diablo", "Starters & Mains", "Lemon-butter sauce, Imperfecto cholula, and house-made sourdough.", ["gluten", "milk", "shellfish"]],
  ["Dungeness Crab Risotto", "Starters & Mains", "Acquerello rice, pecorino, piquillo aioli, pickled jicama, and scallop.", ["egg", "milk"]],
  ["Steak Tartare Tonnato", "Starters & Mains", "Hand-cut Angus beef, bonito sauce, tamari-marinated quail eggs, pickled vegetables, kale chicharrón, and sourdough.", ["egg", "fish", "gluten", "soy"]],
  ["Sweet Potato & Labneh", "Starters & Mains", "Nixtamalized sweet potato, sumac-seasoned labneh, and crispy quinoa.", ["milk"]],
  ["Lubina", "Starters & Mains", "Aged branzino filet, kale BBQ, broccolini tabbouleh, and radish.", ["fish"]],
  ["Lechon", "Starters & Mains", "Roasted suckling pig, dates mole, stuffed zucchini flower, and olive and radish mojito.", []],
  ["Lamb Terrine", "Starters & Mains", "Robuchon pomme purée, red cabbage confit, lamb jus, and truffle.", ["milk"]],
  ["Tournedos Rossini", "Starters & Mains", "Aged beef tenderloin, foie gras, trumpet duxelles, sweet plantain brioche, jus, and summer truffles.", []],
  ["Imperfecto Baenki Caviar", "Caviar & Add-Ons", "Baenki caviar, available by the half ounce or ounce.", ["fish"]],
  ["Gianduja", "Dessert", "Date cake, chocolate-hazelnut cream, coffee ice cream, and cocoa tuile.", ["gluten", "milk", "tree-nut"]],
  ["Pistachio & Yogurt", "Dessert", "Phyllo mille-feuille, yogurt pistachio ice cream, dulce de leche foam, and raspberry and orange blossom sauce.", ["gluten", "milk", "tree-nut"]],
  ["Imperfecto Eclair", "Dessert", "Mascarpone mocha cream, coffee anglaise, orange jelly, and crushed hazelnut.", ["egg", "gluten", "milk", "tree-nut"]],
  ["Sorbets Tasting", "Dessert", "Kiwi-yuzu, mango-tarragon, raspberry-mint, grilled pineapple-coconut, and Sicilian lemon sorbets.", []],
  ["Vermont Cheese", "Dessert", "Little Hosmer, Alpha Tolman, Vault No. 5, almond turrón, house marmalade, and lavash.", ["gluten", "milk", "tree-nut"]],
].map(([name, category, description, allergens]) => product(name, category, description, dinnerUrl, "IMP-E2", allergens, true));

const brunch = [
  ["Soufra", "Brunch Dessert", "Baked phyllo dough, pistachio, walnuts, orange blossom syrup, halva, and Greek yogurt ice cream."],
  ["Chocolate Tart", "Brunch Dessert", "Chocolate mousse, halva caramel, and cocoa glaze."],
  ["Pera al Vino", "Brunch Dessert", "Puff pastry, poached pear, and vanilla-thyme ice cream."],
  ["Helados", "Brunch Dessert", "Choice of vanilla-thyme, coffee, or pistachio ice cream."],
  ["Sorbetes", "Brunch Dessert", "Choice of chocolate, Sicilian lemon, raspberry-mint, kiwi-yuzu, or mango-tarragon sorbet."],
  ["Tiramisu French Toast", "Brunch", "Brioche, mascarpone foam, and cacao."],
  ["Burrata", "Brunch", "Potato latke, cherry tomatoes, and aged balsamic."],
  ["Caesar Augustus Salad", "Brunch", "Gem lettuce, hearts of palm, dressing, anchovy vinaigrette, and whitefish roe."],
  ["Crudo Tostada", "Brunch", "Heirloom corn tortilla, bluefin tuna, octopus and kalamata asiento, avocado, and salsa macha."],
  ["Oysters", "Brunch", "Half dozen seasonal oysters, house clamato, onion ash oil, and cucumber."],
  ["Moules et Frites", "Brunch", "Bang Island mussels, white vermouth, frites, and sourdough."],
  ["Steak & Eggs", "Brunch", "Six-ounce Angus picanha, double-fried potatoes, sunny-side eggs, epazote béarnaise, and jus."],
  ["Lobster Omelet", "Brunch", "Organic eggs, Maine lobster, and arepa andina."],
  ["Imperfecto Shakshuka", "Brunch", "Wild mushroom, roasted tomato sauce, feta foam, truffle, and ciabatta."],
  ["Chicken & Waffles", "Brunch", "Corn waffles, feta nata, and double-fried chicken thigh."],
  ["Duck Sausage", "Brunch", "House-made leg sausage, foie gras, pomme purée, papaya BBQ, pickled loroco, and cabbage."],
  ["Middle East Benedict", "Brunch", "Poached eggs, sumac hollandaise, tomato-lamb merguez ragù, house sourdough, gruyère, and fine herbs."],
  ["Wagyu Burger", "Brunch", "Vermont cheddar cheese, Imperfecto animal sauce, grilled onion, potato sesame bun, and fries."],
  ["Pastrami Sandwich", "Brunch", "House-made brisket pastrami, Havarti cheese, Jerusalem bagel, dijonnaise, and pickles."],
].map(([name, category, description]) => product(name, category, description, brunchUrl, "IMP-E3", [], false));

const chefsTable = [
  ["Bread & Butter", "Chef's Table", "One-hundred-percent sourdough bread, cacao butter, and cacao nibs."],
  ["Amuse", "Chef's Table", "Mussel, corn tart, tuna crostini, buñuelo, and mushroom soup."],
  ["Cold Vongole", "Chef's Table", "Chayote squash noodles, clams, and tomato broth."],
  ["Crudo (Chef's Table)", "Chef's Table", "Ama ebi, bottarga ketchup, tostón, and uni."],
  ["Steak Tartare (Chef's Table)", "Chef's Table", "Chorizo ibérico, cured egg yolk, and osetra caviar."],
  ["Mero", "Chef's Table", "Japanese grouper, artichokes, and pil-pil."],
  ["Stroganoff", "Chef's Table", "King crab, lobster, and morel mushroom."],
  ["Arroz con Pollo", "Chef's Table", "Bomba rice, truffled chicken, and dates."],
  ["Wagyu (Chef's Table)", "Chef's Table", "A5 wagyu, sea beans chimichurri, and stuffed shallot."],
  ["Sorbete (Chef's Table)", "Chef's Table", "Lychee and green apple sorbet."],
  ["Pumpkin", "Chef's Table", "Pumpkin crémeux, tangerine granita, and raspberry cake."],
  ["Selva Negra", "Chef's Table", "Truffle dark chocolate mousse, cherry compote, and cocoa crumble."],
  ["Petite Sweets", "Chef's Table", "Salted caramel chocolate tart, blood orange pâte de fruit, and black sesame macaron."],
].map(([name, category, description]) => product(name, category, description, chefsTableUrl, "IMP-E4", [], false));

const merged = new Map();
for (const item of [...dinner, ...brunch, ...chefsTable]) {
  const key = item.id;
  if (!merged.has(key)) merged.set(key, item);
  else {
    const prior = merged.get(key);
    prior.sourceUrls = unique([...prior.sourceUrls, ...item.sourceUrls]);
    prior.sourceEvidenceIds = unique([...prior.sourceEvidenceIds, ...item.sourceEvidenceIds]);
    prior.evidence = uniqueObjects([...prior.evidence, ...item.evidence]);
  }
}
const items = [...merged.values()];
const nextImperfecto = await annotateRestaurantWithIngredientIntelligence({
  ...existing,
  parserProfile: "imperfecto-position-aware-current-pdfs",
  sourceFamily: "generic-website",
  sourceProfile: "imperfecto:position-aware-current-pdfs",
  sourceUrls: [dinnerUrl, brunchUrl, chefsTableUrl],
  guideLabel: "Official menus",
  guideUrl: "https://www.sevenreasonsgroup.com/imperfecto",
  officialAllergenProfiles: { [officialProfileId]: { coveredAllergenIds } },
  items,
  itemCount: items.length,
  menuItemCount: items.length,
  totalItemCount: items.length,
  officialItemCount: dinner.length,
  officialAllergenStatus: "partial",
  officialAllergenRemediationBucket: "partial-official-allergen-menu",
  allergenDataStatus: {
    ...(existing.allergenDataStatus ?? {}),
    officialItemCount: dinner.length,
    officialTotal: dinner.length,
    totalItemCount: items.length,
    officialCoverageRatio: dinner.length / items.length,
    bucket: "official-partial",
  },
  sourceStatus: {
    ...(existing.sourceStatus ?? {}),
    accommodationOnly: false,
    extractedFoodItemCount: items.length,
    officialItemCount: dinner.length,
    pdfDescriptionBoundaryAudit: { passed: true, reviewedAt: "2026-08-31", currentProductCount: items.length },
  },
});

if (nextImperfecto.items.length !== 53) throw new Error(`Expected 53 Imperfecto products, got ${nextImperfecto.items.length}.`);
if (nextImperfecto.items.some((item) => /CRUDO TOSTADA|DESSERT WINE|\s[•·]{2,}\s/.test(item.description ?? ""))) throw new Error("Imperfecto still contains PDF boundary bleed.");

if (apply) {
  repository.restaurants = repository.restaurants.map((restaurant) => restaurant.id === imperfectoId ? nextImperfecto : repairLaFiammaGenerated(restaurant));
  repository.itemCount = repository.restaurants.reduce((sum, restaurant) => sum + (restaurant.items?.length ?? 0), 0);
  repository.restaurantCount = repository.restaurants.length;
  writeJson(repositoryPath, repository);
  applyCanonicalImperfecto(nextImperfecto);
  applyCanonicalLaFiamma();
}

console.log(JSON.stringify({ apply, imperfecto: { itemCount: nextImperfecto.items.length, officialItemCount: dinner.length, descriptionCount: nextImperfecto.items.filter((item) => item.description).length }, laFiammaRemovedArtifact: "chicken-or-sausage-dollar24-shrimp" }, null, 2));

function product(name, category, description, sourceUrl, evidenceId, allergens, official) {
  const id = slug(name);
  return {
    id,
    name,
    category,
    description,
    imageUrl: null,
    ingredientsText: null,
    isConfigurable: false,
    allergens: [...allergens].sort(),
    mayContain: [],
    mayContainAllergens: [],
    allergenSourceType: official ? "official-allergen-menu" : "ingredient_intelligence",
    allergenAuthorityTier: official ? "restaurant_issued" : "ingredient_intelligence",
    ...(official ? { officialAllergenProfileId: officialProfileId } : {}),
    sourceType: "pdf-menu",
    sourceUrls: [sourceUrl],
    sourceEvidenceIds: [evidenceId],
    allergenSourceEvidenceIds: official ? [evidenceId] : [],
    evidence: [{ sourceKind: official ? "official-allergen-menu" : "pdf-menu", sourceUrl, text: official ? `${description} Allergens: ${allergens.join(", ") || "none listed"}.` : description }],
    variantGroup: category,
  };
}

function applyCanonicalImperfecto(restaurant) {
  const dossierPath = `data/restaurant-verification/restaurants/${imperfectoId}.json`;
  const itemChecksPath = `data/restaurant-verification/item-checks/${imperfectoId}.jsonl`;
  const dossier = readJson(dossierPath);
  const itemChecks = readJsonLines(itemChecksPath);
  const productById = new Map(restaurant.items.map((item) => [item.id, item]));
  const aliases = new Map([["crudo", "madai-crudo"], ["wagyu", "wagyu-chef-s-table"], ["sorbete", "sorbete-chef-s-table"]]);
  const matchedByProduct = new Map();

  for (const check of itemChecks) {
    const baselineId = check.baseline?.itemId;
    const key = aliases.get(baselineId) ?? baselineId;
    const current = productById.get(key) ?? restaurant.items.find((item) => normalize(item.name) === normalize(check.baseline?.name));
    if (!current) {
      check.disposition = "stale_extra";
      check.allergenVerdict = "accurately_unavailable";
      check.matchedCurrentProductKeys = [];
      check.adjudicatedContainsAllergens = [];
      check.adjudicatedMayContainAllergens = [];
      check.adjudicatedAllergenSourceType = "unavailable";
      check.adjudicatedAllergenAuthorityTier = null;
      check.allergenSourceEvidenceIds = [];
      continue;
    }
    check.disposition = baselineId === current.id ? "exact_match" : "normalized_match";
    check.sourceEvidenceIds = current.sourceEvidenceIds;
    check.matchedCurrentProductKeys = [current.id];
    check.adjudicatedContainsAllergens = current.allergens ?? [];
    check.adjudicatedMayContainAllergens = [];
    check.adjudicatedAllergenSourceType = current.allergenSourceType;
    check.adjudicatedAllergenAuthorityTier = current.allergenAuthorityTier;
    check.allergenSourceEvidenceIds = current.allergenSourceEvidenceIds ?? [];
    check.allergenVerdict = current.officialAllergenProfileId ? "verified" : "accurately_unavailable";
    const matches = matchedByProduct.get(current.id) ?? [];
    matches.push(check.auditItemKey);
    matchedByProduct.set(current.id, matches);
  }

  const canonicalProducts = restaurant.items.map((item) => ({
    currentProductKey: item.id,
    name: item.name,
    category: item.category,
    presentationIds: item.sourceUrls.map((url) => `${item.id}:${url === dinnerUrl ? "dinner" : url === brunchUrl ? "brunch" : "chefs-table"}`),
    matchedBaselineAuditItemKeys: matchedByProduct.get(item.id) ?? [],
    sourceEvidenceIds: item.sourceEvidenceIds ?? [],
    containsAllergens: item.allergens ?? [],
    mayContainAllergens: [],
    allergenSourceType: item.allergenSourceType,
    allergenAuthorityTier: item.allergenAuthorityTier,
    allergenSourceEvidenceIds: item.allergenSourceEvidenceIds ?? [],
    coordinatorReviewed: true,
    notes: [item.officialAllergenProfileId ? "Direct allergens come from the restaurant-issued dinner PDF's explicit Allergens line." : "Menu description is analyzed separately by Ingredient Intelligence; it is not a direct allergen matrix."],
  }));
  dossier.currentCatalog = {
    ...(dossier.currentCatalog ?? {}),
    status: "verified",
    currentProductCount: canonicalProducts.length,
    reconciledCurrentProductCount: canonicalProducts.length,
    surfaces: [
      { surfaceId: "imp-dinner", title: "Current dinner PDF", url: dinnerUrl, current: true, scopeStatus: "complete", verified: true, evidenceIds: ["IMP-E2"], notes: ["Position-aware transcription; explicit item-level Allergens lines retained."] },
      { surfaceId: "imp-brunch", title: "Current brunch PDF", url: brunchUrl, current: true, scopeStatus: "complete", verified: true, evidenceIds: ["IMP-E3"], notes: ["Food and nonalcoholic menu rows only; spirits and wine lists excluded."] },
      { surfaceId: "imp-chefs-table", title: "Current Chef's Table PDF", url: chefsTableUrl, current: true, scopeStatus: "complete", verified: true, evidenceIds: ["IMP-E4"], notes: ["Duplicate print columns and wine pairings collapsed."] },
    ],
    products: canonicalProducts,
    officialAllergenProfiles: { [officialProfileId]: { coveredAllergenIds } },
    inventoryFingerprint: fingerprint(canonicalProducts.map(currentProductFingerprintRecord)),
    notes: ["Rebuilt all three current official PDFs using layout boundaries; adjacent products, wine pairings, service text, and duplicated print columns are excluded.", "Dinner's explicit Allergens lines are official item-level evidence. Brunch and Chef's Table descriptions remain Ingredient Intelligence inputs."],
  };
  dossier.checks = {
    ...(dossier.checks ?? {}),
    menu: { verdict: "verified", reviewedItemCount: itemChecks.length, sourceItemCount: canonicalProducts.length, notes: ["All 53 current products were coordinator-reviewed against the three official PDFs."] },
    allergenSource: { verdict: "verified", directPositiveCount: dinner.filter((item) => item.allergens.length > 0).length, directAssertionCount: dinner.reduce((sum, item) => sum + item.allergens.length, 0), highestAuthorityTier: "restaurant_issued", notes: ["The current dinner PDF publishes explicit Allergens lines for every dinner product; other menu surfaces do not."] },
    extraction: { verdict: "verified", parserReviewed: true, semanticsVerified: true, notes: ["Column and adjacent-row boundary bleed removed; generic parser regression guard added."] },
  };
  dossier.updatedAt = "2026-08-31T00:00:00.000Z";
  writeJson(dossierPath, dossier);
  writeJsonLines(itemChecksPath, itemChecks);
}

function repairLaFiammaGenerated(restaurant) {
  if (restaurant.id !== laFiammaId) return restaurant;
  const items = (restaurant.items ?? []).filter((item) => item.id !== "chicken-or-sausage-dollar24-shrimp");
  return { ...restaurant, items, itemCount: items.length, menuItemCount: items.length, totalItemCount: items.length, sourceStatus: { ...(restaurant.sourceStatus ?? {}), extractedFoodItemCount: items.length, pdfDescriptionBoundaryAudit: { passed: true, removedModifierArtifacts: 1, reviewedAt: "2026-08-31" } } };
}

function applyCanonicalLaFiamma() {
  const dossierPath = `data/restaurant-verification/restaurants/${laFiammaId}.json`;
  const itemChecksPath = `data/restaurant-verification/item-checks/${laFiammaId}.jsonl`;
  const dossier = readJson(dossierPath);
  const checks = readJsonLines(itemChecksPath);
  const key = "chicken-or-sausage-dollar24-shrimp";
  dossier.currentCatalog.products = dossier.currentCatalog.products.filter((product) => product.currentProductKey !== key);
  dossier.currentCatalog.currentProductCount = dossier.currentCatalog.products.length;
  dossier.currentCatalog.reconciledCurrentProductCount = dossier.currentCatalog.products.length;
  dossier.currentCatalog.inventoryFingerprint = fingerprint(dossier.currentCatalog.products.map(currentProductFingerprintRecord));
  dossier.currentCatalog.notes = unique([...(dossier.currentCatalog.notes ?? []), "Removed the Carbonara protein-price modifier line that the generic PDF parser had promoted into a product and joined to the following pasta descriptions."]);
  for (const check of checks) {
    if (!(check.matchedCurrentProductKeys ?? []).includes(key) && check.baseline?.itemId !== key) continue;
    check.disposition = "artifact";
    check.allergenVerdict = "not_applicable";
    check.matchedCurrentProductKeys = [];
    check.adjudicatedContainsAllergens = [];
    check.adjudicatedMayContainAllergens = [];
    check.adjudicatedAllergenSourceType = null;
    check.adjudicatedAllergenAuthorityTier = null;
    check.allergenSourceEvidenceIds = [];
    check.notes = "Carbonara protein-price modifier line; not a standalone menu product.";
  }
  dossier.updatedAt = "2026-08-31T00:00:00.000Z";
  writeJson(dossierPath, dossier);
  writeJsonLines(itemChecksPath, checks);
}

function normalize(value) { return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function slug(value) { return normalize(value).replace(/\s+/g, "-"); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function uniqueObjects(values) { const seen = new Set(); return values.filter((value) => { const key = JSON.stringify(value); if (seen.has(key)) return false; seen.add(key); return true; }); }
function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function currentProductFingerprintRecord(product) { return { currentProductKey: product.currentProductKey, name: product.name, category: product.category ?? null, presentationIds: product.presentationIds ?? [], matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys ?? [], containsAllergens: product.containsAllergens ?? [], mayContainAllergens: product.mayContainAllergens ?? [], allergenSourceType: product.allergenSourceType ?? null, allergenAuthorityTier: product.allergenAuthorityTier ?? null }; }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function readJsonLines(filePath) { return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
function writeJsonLines(filePath, values) { fs.writeFileSync(filePath, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`); }
