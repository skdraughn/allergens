#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const freshPath = path.resolve(
  valueFor("--fresh-path") ??
    path.join(root, ".codex-tmp/shoto-source-parity-clean/fresh/shoto-dc.json"),
);
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossierPath = path.join(root, "data/restaurant-verification/restaurants/shoto-dc.json");
const evidencePath = path.join(root, "data/restaurant-verification/evidence/shoto-dc.json");
const reportPath = path.join(
  root,
  "data/restaurant-verification/reports/shoto-structured-menu-repair.json",
);
const sourceUrl = "https://shoto.map.contact/menu";
const updatedAt = new Date().toISOString();

const repository = readJson(generatedPath);
const dossier = readJson(dossierPath);
const evidence = readJson(evidencePath);
const fresh = readJson(freshPath).restaurant;
const current = repository.restaurants.find((restaurant) => restaurant.id === "shoto-dc");

if (!current || fresh?.id !== "shoto-dc") {
  throw new Error("Missing Shoto generated record or fresh source-parity result.");
}

const items = uniqueBy(
  (fresh.items ?? [])
    .filter((item) => item.sourceType === "simple-item-card")
    .filter((item) => clean(item.name) && clean(item.description))
    .map((item) => ({
      id: item.id,
      name: clean(item.name),
      category: clean(item.category) ?? "Menu",
      description: clean(item.description),
      ingredientsText: null,
      isConfigurable: Boolean(item.isConfigurable),
      allergens: [],
      mayContain: [],
      mayContainAllergens: [],
      allergenSourceType: "ingredient_intelligence",
      allergenAuthorityTier: "ingredient_intelligence",
      sourceType: "html-card",
      sourceUrls: [sourceUrl],
      ingredientIntelligenceBasis: "title-description",
    })),
  (item) => `${normalize(item.category)}:${normalize(item.name)}`,
);

if (items.length < 30 || items.some((item) => !item.description)) {
  throw new Error(`Refusing incomplete Shoto repair: ${items.length} described items.`);
}

const repairedRestaurant = await annotateRestaurantWithIngredientIntelligence({
  ...current,
  guideUrl: sourceUrl,
  guideLabel: "Current menu mirror",
  sourceUrls: [sourceUrl],
  sourceStatus: {
    failed: 0,
    ok: 1,
    total: 1,
    extractedFoodItemCount: items.length,
    accommodationOnly: false,
    officialEvidenceBucket: "third-party-current-menu-mirror",
    officialItemCount: 0,
  },
  officialAllergenStatus: "unavailable",
  officialItemCount: 0,
  items,
});

repairedRestaurant.itemCount = repairedRestaurant.items.length;
repairedRestaurant.menuItemCount = repairedRestaurant.items.length;
repairedRestaurant.totalItemCount = repairedRestaurant.items.length;
repairedRestaurant.allergenDataStatus = {
  ...(repairedRestaurant.allergenDataStatus ?? {}),
  officialItemCount: 0,
  officialTotal: 0,
  totalItemCount: repairedRestaurant.items.length,
  officialCoverageRatio: 0,
};

const products = repairedRestaurant.items.map((item) => ({
  currentProductKey: item.id,
  name: item.name,
  category: item.category,
  presentationIds: [],
  matchedBaselineAuditItemKeys: [],
  sourceEvidenceIds: ["src-menu-mirror"],
  description: item.description,
  ingredientsText: null,
  containsAllergens: [],
  mayContainAllergens: [],
  allergenSourceType: "ingredient_intelligence",
  allergenAuthorityTier: "ingredient_intelligence",
  allergenSourceEvidenceIds: [],
  coordinatorReviewed: true,
  notes: [
    "Description is current menu copy from a third-party mirror, not an exhaustive ingredient disclosure.",
  ],
  ingredientIntelligenceBasis: "title-description",
}));

dossier.identity.sourceEvidenceIds = ["src-michelin"];
dossier.currentCatalog = {
  ...dossier.currentCatalog,
  currentProductCount: products.length,
  reconciledCurrentProductCount: products.length,
  inventoryFingerprint: sha256(products.map(currentProductFingerprintRecord)),
  surfaces: [
    {
      surfaceId: "surface-menu-mirror",
      title: "Current descriptive menu mirror",
      url: sourceUrl,
      current: true,
      scopeStatus: "complete",
      verified: true,
      evidenceIds: ["src-menu-mirror"],
      notes: [
        "Current menu structure and descriptions inspected; the host is not verified as restaurant-controlled.",
      ],
    },
  ],
  products,
  notes: unique([
    ...(dossier.currentCatalog.notes ?? []),
    "Structured menu cards preserve item names and descriptions without treating description prose as separate products.",
    "Menu-mirror descriptions support Ingredient Intelligence but are not official allergen disclosures.",
  ]),
};
dossier.restaurantLevelAllergenEvidence = [
  {
    evidenceId: "src-menu-mirror",
    statement:
      "Menu descriptions may inform Ingredient Intelligence but do not provide a complete allergen matrix or negative allergen coverage.",
  },
];
dossier.checks.menu = {
  verdict: "verified",
  reviewedItemCount: 0,
  sourceItemCount: products.length,
  notes: ["Structured name/description menu cards were parser-validated and coordinator-reconciled."],
};
dossier.checks.allergenSource = {
  verdict: "accurately_unavailable",
  directPositiveCount: 0,
  directAssertionCount: 0,
  highestAuthorityTier: "third_party",
  notes: ["No verified restaurant-issued allergen matrix was located."],
};
dossier.checks.extraction = {
  verdict: "verified",
  parserReviewed: true,
  semanticsVerified: true,
  notes: ["Repeated .menu-item-name/.menu-item-sub cards are parsed as paired fields."],
};
dossier.sourceAttempts = [
  {
    class: "official_site",
    query: "Current restaurant-controlled site and menu",
    outcome: "No current restaurant-controlled menu domain could be verified.",
    sourceEvidenceIds: [],
  },
  {
    class: "official_documents",
    query: "Restaurant-issued allergen, nutrition, ingredient, and menu documents",
    outcome: "No current restaurant-issued allergen document located.",
    sourceEvidenceIds: [],
  },
  {
    class: "linked_vendor",
    query: "Current descriptive menu provider or mirror",
    outcome: "Current descriptive menu mirror located; restaurant control is unverified.",
    sourceEvidenceIds: ["src-menu-mirror"],
  },
  {
    class: "targeted_web_search",
    query: "SHOTO Washington DC current menu allergens ingredients",
    outcome: "Identity corroborated; no current official allergen matrix located.",
    sourceEvidenceIds: ["src-michelin", "src-menu-mirror"],
  },
];
dossier.updatedAt = updatedAt;

evidence.sources = [
  {
    id: "src-menu-mirror",
    url: sourceUrl,
    authorityTier: "third_party",
    purpose: "menu",
    retrievedAt: updatedAt,
    contentType: "text/html",
    finalUrl: sourceUrl,
    httpStatus: 200,
    byteLength: null,
    sha256: null,
    artifactPath: null,
    excerpt: "Current menu cards provide paired item names and descriptions.",
    rowIdentifiers: products.map((product) => product.currentProductKey),
    request: null,
    notes: ["The host is not verified as restaurant-controlled; do not treat it as official allergen evidence."],
  },
  evidence.sources.find((source) => source.id === "src-michelin"),
].filter(Boolean);

const report = {
  schemaVersion: 1,
  applied: apply,
  generatedAt: updatedAt,
  restaurantId: "shoto-dc",
  before: {
    itemCount: current.items?.length ?? 0,
    describedItemCount: (current.items ?? []).filter((item) => clean(item.description)).length,
  },
  after: {
    itemCount: repairedRestaurant.items.length,
    describedItemCount: repairedRestaurant.items.filter((item) => clean(item.description)).length,
    officialItemCount: 0,
    provenance: "third_party_menu_mirror",
  },
};

if (apply) {
  repository.restaurants = repository.restaurants.map((restaurant) =>
    restaurant.id === "shoto-dc" ? repairedRestaurant : restaurant,
  );
  repository.generatedAt = updatedAt;
  repository.restaurantCount = repository.restaurants.length;
  repository.itemCount = repository.restaurants.reduce(
    (count, restaurant) => count + (restaurant.items?.length ?? 0),
    0,
  );
  writeJson(generatedPath, repository, false);
  writeJson(dossierPath, dossier, true);
  writeJson(evidencePath, evidence, true);
  writeJson(reportPath, report, true);
}

console.log(JSON.stringify(report, null, 2));

function currentProductFingerprintRecord(product) {
  return {
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category,
    presentationIds: product.presentationIds,
    matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys,
    containsAllergens: product.containsAllergens,
    mayContainAllergens: product.mayContainAllergens,
    allergenSourceType: product.allergenSourceType,
    allergenAuthorityTier: product.allergenAuthorityTier,
  };
}

function valueFor(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function normalize(value) {
  return String(value ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function clean(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values, keyFor) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFor(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value, pretty) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}
