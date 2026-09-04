import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const primaryId = "kyojin-dc";
const duplicateId = "kyojin-sushi-washington-dc-dc-metro";
const dossierPath = path.join(root, `data/restaurant-verification/restaurants/${primaryId}.json`);
const duplicateDossierPath = path.join(root, `data/restaurant-verification/restaurants/${duplicateId}.json`);
const primaryEvidencePath = path.join(root, `data/restaurant-verification/evidence/${primaryId}.json`);
const duplicateItemChecksPath = path.join(root, `data/restaurant-verification/item-checks/${duplicateId}.jsonl`);
const apply = process.argv.includes("--apply");
const officialPdf = "https://media-cdn.getbento.com/accounts/b58c861f9f6bde379f737d89f20ed52f/media/ZKRtUG6hSqCa4M1b17Tl_KYOJIN%20Menu%20.pdf";
const officialMenu = "https://www.kyojindc.com/menu/";
const officialHome = "https://www.kyojindc.com/";
const toastMenu = "https://order.toasttab.com/online/kyojin-sushi-3315-cadys-alley-nw";

const repository = readJson(repositoryPath);
const primary = repository.restaurants.find((restaurant) => restaurant.id === primaryId);
const duplicate = repository.restaurants.find((restaurant) => restaurant.id === duplicateId);
if (!primary) throw new Error("Expected the canonical Kyojin identity.");
const sourceRestaurant = duplicate ?? primary;

const excludedNames = new Set([
  "(scallop, toro, ikura, uni, quail egg)",
  "shared plates",
  "seasonal fish (smoke box only)",
]);
const aliases = new Map([
  ["crazy monkey", "Crazy Monkey Roll"],
  ["scallop sunlight", "Scallop Sunlight Roll"],
  ["soft shell crab", "Soft Shell Crab Roll"],
  ["signature bun", "Kyojin Signature Bun"],
  ["lobster volcano", "Kyojin Lobster Volcano Roll"],
  ["miso soup", "House Miso Soup"],
  ["shrimp sunomono salad", "Sunomono Salad"],
  ["tako sunomono salad", "Sunomono Salad"],
  ["sunomono salad", "Sunomono Salad"],
  ["transcendent bite", "Seared Tuna with Black Truffle"],
  ["watermelon daikon salad", "Watermelon Daikon"],
]);

const candidates = [];
for (const sourceItem of sourceRestaurant.items ?? []) {
  const cleanedName = cleanProductName(sourceItem.name);
  const normalized = normalize(cleanedName);
  if (!cleanedName || excludedNames.has(normalized)) continue;

  if (normalized === "shrimp" && normalize(sourceItem.description) === "octopus") {
    candidates.push(cleanItem(sourceItem, "Shrimp", null));
    candidates.push(cleanItem(sourceItem, "Octopus", null));
    continue;
  }
  if (normalized.startsWith("white fish hamachi or kanpachi")) {
    candidates.push(cleanItem(sourceItem, "White Fish (Hamachi or Kanpachi)", null));
    candidates.push(cleanItem(sourceItem, "Scallop", null));
    continue;
  }

  candidates.push(cleanItem(sourceItem, aliases.get(normalized) ?? displayName(cleanedName)));
}

const groups = new Map();
for (const item of candidates) {
  const key = normalize(item.name);
  const group = groups.get(key) ?? [];
  group.push(item);
  groups.set(key, group);
}

const items = [...groups.values()]
  .map(mergeItems)
  .sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category) || a.name.localeCompare(b.name));

const repaired = await annotateRestaurantWithIngredientIntelligence({
  ...primary,
  name: "Kyojin",
  category: sourceRestaurant.category ?? primary.category,
  city: sourceRestaurant.city ?? primary.city,
  region: sourceRestaurant.region ?? primary.region,
  domain: "kyojindc.com",
  guideLabel: "Official menu",
  guideUrl: officialMenu,
  sourceFamily: "generic-website",
  parserProfile: "kyojin-current-pdf-toast",
  sourceProfile: "kyojin:current-pdf-toast",
  sourceUrls: [officialHome, officialMenu, officialPdf, toastMenu],
  items,
  itemCount: items.length,
  menuItemCount: items.length,
  totalItemCount: items.length,
  officialItemCount: 0,
  officialAllergenStatus: "not-found",
  officialAllergenRemediationBucket: "no-official-item-allergen-source",
  allergenDataStatus: {
    ...(primary.allergenDataStatus ?? {}),
    officialItemCount: 0,
    officialTotal: 0,
    totalItemCount: items.length,
    officialCoverageRatio: 0,
    bucket: "unavailable",
  },
  sourceStatus: {
    ...(sourceRestaurant.sourceStatus ?? {}),
    accommodationOnly: false,
    extractedFoodItemCount: items.length,
    officialItemCount: 0,
    identityConsolidation: { mergedRestaurantIds: [duplicateId], reviewedAt: "2026-08-31" },
  },
});

const descriptionCount = repaired.items.filter((item) => item.description).length;
if (items.length < 65) throw new Error(`Kyojin repair unexpectedly produced only ${items.length} products.`);
if (descriptionCount / items.length < 0.8) throw new Error(`Kyojin description coverage unexpectedly low: ${descriptionCount}/${items.length}.`);
if (repaired.items.some((item) => item.allergenSourceType === "restaurant_linked_vendor")) {
  throw new Error("Kyojin menu descriptions were incorrectly retained as direct allergen evidence.");
}

const result = {
  apply,
  restaurantId: primaryId,
  removedDuplicateRestaurantId: duplicateId,
  itemCount: items.length,
  descriptionCount,
  descriptionCoverage: Number((descriptionCount / items.length).toFixed(4)),
  normalizedNameCount: new Set(items.map((item) => normalize(item.name))).size,
};

if (apply) {
  repository.restaurants = repository.restaurants
    .filter((restaurant) => restaurant.id !== duplicateId)
    .map((restaurant) => (restaurant.id === primaryId ? repaired : restaurant));
  repository.restaurantCount = repository.restaurants.length;
  repository.itemCount = repository.restaurants.reduce((sum, restaurant) => sum + (restaurant.items?.length ?? 0), 0);
  writeJson(repositoryPath, repository);

  const dossier = readJson(dossierPath);
  dossier.name = "Kyojin";
  dossier.identity = {
    ...(dossier.identity ?? {}),
    name: "Kyojin",
    location: sourceRestaurant.location ?? dossier.identity?.location ?? "3315 Cady's Alley NW, Washington, DC 20007",
    domain: "kyojindc.com",
    officialHomepage: officialHome,
    notes: "The duplicate KYOJIN Sushi DC Metro identity was consolidated into this exact-location record using matching domain and address.",
  };
  dossier.currentCatalog = {
    ...(dossier.currentCatalog ?? {}),
    status: "verified",
    currentProductCount: items.length,
    reconciledCurrentProductCount: items.length,
    inventoryFingerprint: null,
    surfaces: [
      { surfaceId: "official-current-pdf", title: "Official current menu PDF", url: officialPdf, current: true, scopeStatus: "complete", verified: true, evidenceIds: ["E3"], notes: ["Food and nonalcoholic products only; alcohol and headings excluded."] },
    ],
    products: repaired.items.map((item) => ({
      currentProductKey: item.id,
      name: item.name,
      category: item.category,
      description: item.description ?? null,
      presentationIds: unique(item.evidence?.map((entry, index) => `${item.id}:${entry.sourceKind ?? "source"}:${index + 1}`) ?? []),
      matchedBaselineAuditItemKeys: [],
      sourceEvidenceIds: ["E3"],
      containsAllergens: [],
      mayContainAllergens: [],
      allergenSourceType: "ingredient_intelligence",
      allergenAuthorityTier: "ingredient_intelligence",
      allergenSourceEvidenceIds: [],
      coordinatorReviewed: true,
      notes: ["Restaurant-issued menu wording is used by Ingredient Intelligence and is not represented as a direct allergen matrix."],
    })),
    notes: [
      "Consolidated the duplicate Kyojin identities using exact domain and address agreement.",
      "Current official PDF inventory is reconciled with the restaurant-linked Toast surface; duplicate presentations and extraction artifacts are excluded.",
      "The public menu is not an exhaustive item-by-allergen matrix, so descriptions feed Ingredient Intelligence rather than direct official allergen fields.",
    ],
  };
  dossier.currentCatalog.inventoryFingerprint = fingerprint(
    dossier.currentCatalog.products.map(currentProductFingerprintRecord),
  );
  dossier.checks = {
    ...(dossier.checks ?? {}),
    menu: { verdict: "verified", reviewedItemCount: items.length, sourceItemCount: items.length, notes: ["Current official PDF and linked Toast catalog reconciled after duplicate identity consolidation."] },
    allergenSource: { verdict: "accurately_unavailable", directPositiveCount: 0, directAssertionCount: 0, highestAuthorityTier: null, notes: ["No exhaustive official item allergen matrix was found; menu descriptions remain Ingredient Intelligence inputs."] },
    extraction: { verdict: "verified", parserReviewed: true, semanticsVerified: true, notes: ["Prices, GF legend markers, headings, adjacency bleed, and duplicate PDF/Toast presentations were normalized."] },
  };
  dossier.updatedAt = "2026-08-31T00:00:00.000Z";
  writeJson(dossierPath, dossier);

  const primaryEvidence = readJson(primaryEvidencePath);
  const pdfEvidence = primaryEvidence.sources?.find((source) => source.id === "E3");
  if (pdfEvidence) {
    pdfEvidence.url = officialPdf;
    pdfEvidence.finalUrl = officialPdf;
    pdfEvidence.notes = unique([...(pdfEvidence.notes ?? []), "Current June 2026 restaurant-issued menu PDF; corrected the prior stale URL variant."]);
  }
  writeJson(primaryEvidencePath, primaryEvidence);

  const duplicateDossier = readJson(duplicateDossierPath);
  duplicateDossier.status = "codex_verified";
  duplicateDossier.identity = {
    ...(duplicateDossier.identity ?? {}),
    verdict: "duplicate_exact_location",
    identityAmbiguous: false,
    notes: `Superseded by ${primaryId}; exact domain and address matched. This record is excluded from the consumer projection.`,
  };
  duplicateDossier.currentCatalog = {
    ...(duplicateDossier.currentCatalog ?? {}),
    status: "verified",
    products: [],
    currentProductCount: 0,
    reconciledCurrentProductCount: 0,
    reviewedBaselineItemCount: duplicateDossier.currentCatalog?.reviewedBaselineItemCount ?? 91,
    inventoryFingerprint: fingerprint([]),
    surfaces: [
      { surfaceId: "official-menu-pdf", title: "Superseded duplicate identity evidence", url: officialPdf, current: true, scopeStatus: "complete", verified: true, evidenceIds: ["ev-official-pdf"], notes: [`The menu is published canonically under ${primaryId}; this surface closes the frozen duplicate baseline.`] },
    ],
    notes: [`Canonical products moved to ${primaryId}; this duplicate identity is not published.`],
  };
  duplicateDossier.updatedAt = "2026-08-31T00:00:00.000Z";
  writeJson(duplicateDossierPath, duplicateDossier);

  const duplicateItemChecks = fs
    .readFileSync(duplicateItemChecksPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((item) => ({
      ...item,
      disposition: "artifact",
      allergenVerdict: "not_applicable",
      sourceEvidenceIds: ["ev-official-pdf"],
      matchedCurrentProductKeys: [],
      adjudicatedContainsAllergens: [],
      adjudicatedMayContainAllergens: [],
      adjudicatedAllergenSourceType: null,
      adjudicatedAllergenAuthorityTier: null,
      allergenSourceEvidenceIds: [],
      notes: `Superseded duplicate identity; canonical product is published only under ${primaryId}.`,
    }));
  fs.writeFileSync(duplicateItemChecksPath, `${duplicateItemChecks.map((item) => JSON.stringify(item)).join("\n")}\n`);
}

console.log(JSON.stringify(result, null, 2));

function cleanItem(item, forcedName = null, forcedDescription = undefined) {
  const name = forcedName ?? displayName(cleanProductName(item.name));
  let description = forcedDescription === undefined ? cleanDescription(item.description, name) : forcedDescription;
  if (normalize(name) === "tempura with rice") description = "Choice of chicken or shrimp tempura, served with rice.";
  if (normalize(name) === "house miso soup") description = "Regular or spicy miso soup.";
  if (normalize(name) === "seared tuna with black truffle") description = "Seared tuna over watermelon daikon with garlic ponzu, truffle wasabi, yuzu oil, and black truffle.";
  return {
    ...item,
    id: slug(name),
    name,
    category: inferCategory(name),
    description: description || null,
    imageUrl: undefined,
    allergens: [],
    mayContain: [],
    mayContainAllergens: [],
    officialAllergenCoveredIds: [],
    allergenSourceType: "ingredient_intelligence",
    allergenAuthorityTier: "ingredient_intelligence",
    allergenSource: "Official item-level allergen matrix unavailable; menu text is analyzed separately by Ingredient Intelligence.",
    sourceUrls: unique([...(item.sourceUrls ?? []), officialPdf]),
    evidence: (item.evidence ?? []).map((entry) => ({ ...entry, sourceUrl: entry.sourceUrl ?? officialPdf })),
    sourceEvidenceIds: [],
    variantGroup: name,
  };
}

function mergeItems(group) {
  const preferred = [...group].sort((a, b) => scoreItem(b) - scoreItem(a))[0];
  const descriptions = group.map((item) => item.description).filter(Boolean).sort((a, b) => b.length - a.length);
  return {
    ...preferred,
    id: slug(preferred.name),
    description: descriptions[0] ?? null,
    sourceUrls: unique(group.flatMap((item) => item.sourceUrls ?? [])),
    evidence: uniqueObjects(group.flatMap((item) => item.evidence ?? [])),
  };
}

function cleanProductName(value) {
  return String(value ?? "")
    .replace(/\s+\d+(?:\.\d{1,2})?\s*(?:GF|\*{1,2})?\s*$/i, "")
    .replace(/\s+GF\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDescription(value, name) {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();
  text = text.replace(/\s+SUSHI AND SASHIMI ENTR[ÉE]+(?:\s+SUSHI(?: A LA CARTE)?)?\s*$/i, "");
  text = text.replace(/\s+THE EVE OF HONOR\b.*$/i, "");
  if (normalize(name) === "avocado salad") text = "Creamy tataki dressing or pink ginger dressing.";
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : null;
}

function inferCategory(name) {
  const value = normalize(name);
  if (/salad|watermelon daikon/.test(value)) return "Salads";
  if (/soup|edamame|gyoza|bun|ceviche|tartare|tower|shooters|pasta|surf and turf|monster|tataki style|carpaccio style|usuzukuri style|fish and jalapeno|smoke box/.test(value)) return "Shared Plates";
  if (/roll|japanese sandwich/.test(value)) return "Signature Rolls";
  if (/bowl|dinner|tempura with rice/.test(value)) return "Sushi Entrées";
  return "Sushi & Sashimi";
}

function categoryOrder(category) {
  return ["Salads", "Shared Plates", "Sushi Entrées", "Sushi & Sashimi", "Signature Rolls"].indexOf(category);
}

function scoreItem(item) {
  return (item.description?.length ?? 0) + (item.sourceUrls?.includes(officialPdf) ? 20 : 0) - (/\d/.test(item.name) ? 2 : 0);
}

function displayName(value) {
  if (!/^[A-Z0-9 '&()\-/]+$/.test(value)) return value;
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bA5\b/gi, "A5").replace(/\bBbq\b/g, "BBQ").replace(/\bKyojin\b/g, "Kyojin");
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueObjects(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function currentProductFingerprintRecord(product) {
  return {
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category ?? null,
    presentationIds: product.presentationIds ?? [],
    matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys ?? [],
    containsAllergens: product.containsAllergens ?? [],
    mayContainAllergens: product.mayContainAllergens ?? [],
    allergenSourceType: product.allergenSourceType ?? null,
    allergenAuthorityTier: product.allergenAuthorityTier ?? null,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
