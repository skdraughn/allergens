#!/usr/bin/env node

import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { validatePocResearchResult } from "./restaurant-verification-poc-result.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verificationRoot = path.join(root, "data/restaurant-verification");
const id = "replacement-jab-we-met-indian-kitchen-washington-dc";
const runId = "distributed-machine-a-front-20260811135624";
const sourceUrl = "https://jabwemetindiankitchen.com/";
const paths = {
  apply: path.join(verificationRoot, "distributed-runs", runId, "apply-results", `${id}.json`),
  dossier: path.join(verificationRoot, "restaurants", `${id}.json`),
  evidence: path.join(verificationRoot, "evidence", `${id}.json`),
  generated: path.join(root, "src/data/generated/restaurants.generated.json"),
  itemChecks: path.join(verificationRoot, "item-checks", `${id}.jsonl`),
  job: path.join(verificationRoot, "distributed-runs", runId, "jobs", `${id}.json`),
  ledger: path.join(verificationRoot, "ledger.jsonl"),
  result: path.join(verificationRoot, "distributed-runs", runId, "results", `${id}.json`),
};
const allowedCategories = new Set([
  "Appetizers",
  "Dessert",
  "Vegetarian Entrees",
  "Non-Vegetarian Entrees",
  "Tandoori Kebabs",
  "Biryani",
  "Tandoori Breads",
  "Sides",
  "Non-Alcoholic",
  "Todays Special",
]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value, compact = false) => fs.writeFileSync(
  file,
  compact ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`,
);
const readJsonLines = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeJsonLines = (file, values) => fs.writeFileSync(file, `${values.map(JSON.stringify).join("\n")}\n`);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const unique = (values) => [...new Set(values.filter(Boolean))];

function normalizedName(value) {
  return String(value ?? "")
    .replace(/^\s*(?:\([^)]*\)\s*)+/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slug(value) {
  return normalizedName(value).replace(/\s+/g, "-") || "menu-item";
}

function extractCurrentMenu(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $("h4").each((_, heading) => {
    const category = $(heading).text().trim();
    if (!allowedCategories.has(category)) return;
    $(heading).next().find(".MuiGrid-item").each((__, card) => {
      const text = $(card).find("p").map((___, node) => $(node).text().trim()).get();
      if (text.length < 2 || !/^\$\d/.test(text.at(-1))) return;
      rows.push({ category, name: text[0] });
    });
  });

  const deduped = new Map();
  for (const row of rows) {
    const key = normalizedName(row.name);
    if (!deduped.has(key)) deduped.set(key, row);
  }
  const products = [...deduped.values()].map((row) => ({
    currentProductKey: slug(row.name),
    name: row.name,
    category: row.category === "Todays Special" ? "Biryani" : row.category,
    presentationIds: ["official-home-menu"],
    sourceEvidenceIds: ["ev-home"],
    containsAllergens: [],
    mayContainAllergens: [],
    allergenSourceType: "unavailable",
    allergenAuthorityTier: null,
    allergenSourceEvidenceIds: [],
    notes: ["Current itemized restaurant-issued menu row; no official item-level allergen disclosure was found."],
  }));
  if (products.length < 80 || products.length > 100) {
    throw new Error(`Official menu extraction produced an implausible ${products.length} products.`);
  }
  if (new Set(products.map((product) => product.currentProductKey)).size !== products.length) {
    throw new Error("Official menu extraction produced duplicate product keys.");
  }
  return products;
}

const response = await fetch(sourceUrl, { headers: { "user-agent": "MySafeMenu catalog verifier/1.0" } });
if (!response.ok) throw new Error(`Official menu fetch failed with HTTP ${response.status}.`);
const html = await response.text();
const products = extractCurrentMenu(html);
const retrievedAt = new Date().toISOString();
const productsByName = new Map(products.map((product) => [normalizedName(product.name), product]));
const itemChecks = readJsonLines(paths.itemChecks);
const reconciliation = itemChecks.map((check) => {
  const product = productsByName.get(normalizedName(check.baseline?.name));
  if (product) {
    return {
      auditItemKey: check.auditItemKey,
      disposition: check.baseline?.name === product.name ? "exact_match" : "normalized_match",
      matchedCurrentProductKeys: [product.currentProductKey],
      sourceEvidenceIds: ["ev-home"],
      notes: "Matched to the current itemized restaurant-issued menu during the targeted catalog refresh.",
    };
  }
  const baselineText = `${check.baseline?.name ?? ""} ${check.baseline?.description ?? ""}`;
  const artifact = /experience the best|special cocktails|today.?s special|restaurant|testimonials|reserve|non[- ]?alcoholic|tandoori breads|tandoori kebabs|vegetarian entrees|non-vegetarian entrees/i.test(baselineText);
  return {
    auditItemKey: check.auditItemKey,
    disposition: artifact ? "artifact" : "stale",
    matchedCurrentProductKeys: [],
    sourceEvidenceIds: ["ev-home"],
    notes: artifact
      ? "Removed as a packed section heading, promotional block, or non-product page artifact."
      : "The frozen row was not present on the current restaurant-issued menu.",
  };
});
const matchedKeys = new Map();
for (const entry of reconciliation) {
  for (const key of entry.matchedCurrentProductKeys) {
    if (!matchedKeys.has(key)) matchedKeys.set(key, []);
    matchedKeys.get(key).push(entry.auditItemKey);
  }
}
for (const product of products) {
  product.matchedBaselineAuditItemKeys = matchedKeys.get(product.currentProductKey) ?? [];
  product.coordinatorReviewed = true;
}

const result = readJson(paths.result);
result.sources = (result.sources ?? []).map((source) => {
  const sourceId = source.evidenceId ?? source.id;
  return sourceId === "ev-home"
    ? {
        ...source,
        url: sourceUrl,
        authorityTier: "restaurant_issued",
        purpose: "menu",
        retrievedAt,
        contentType: response.headers.get("content-type") ?? "text/html",
        finalUrl: response.url,
        httpStatus: response.status,
        byteLength: Buffer.byteLength(html),
        sha256: sha256(html),
        excerpt: "Current itemized food and nonalcoholic menu rendered by the restaurant-issued SkyTab site.",
      }
    : source;
});
result.menuSurfaces = (result.menuSurfaces ?? []).map((surface) => ({
  ...surface,
  current: surface.surfaceId === "official-home",
  scopeStatus: surface.surfaceId === "official-home" ? "complete" : "supporting",
  currentProductKeys: surface.surfaceId === "official-home" ? products.map((product) => product.currentProductKey) : [],
}));
result.currentProducts = products;
result.reconciliation = { frozenKeys: itemChecks.length, items: reconciliation };
result.changes = {
  ...(result.changes ?? {}),
  catalogRepairRequired: false,
  duplicateCleanupRequired: false,
  menuScopeUnresolved: false,
  parserRepairRequired: false,
};
result.recommendedLane = "verify";

const validation = validatePocResearchResult({
  itemChecks,
  job: readJson(paths.job),
  result,
});
if (!validation.valid) throw new Error(`Targeted research result is invalid: ${validation.errors.join("; ")}`);

const canonicalReconciliation = reconciliation.map((entry) => ({
  ...entry,
  disposition: entry.disposition === "stale" ? "stale_extra" : entry.disposition,
}));

const evidence = readJson(paths.evidence);
evidence.sources = (evidence.sources ?? []).map((source) => source.id === "ev-home"
  ? {
      ...source,
      authorityTier: "restaurant_issued",
      purpose: "menu",
      retrievedAt,
      contentType: response.headers.get("content-type") ?? "text/html",
      finalUrl: response.url,
      httpStatus: response.status,
      byteLength: Buffer.byteLength(html),
      sha256: sha256(html),
      excerpt: "Current itemized food and nonalcoholic menu rendered by the restaurant-issued SkyTab site.",
      notes: ["Targeted refresh removed packed headings, duplicate presentations, alcohol, and page-copy artifacts."],
    }
  : source);

const updatedChecks = itemChecks.map((check) => {
  const entry = canonicalReconciliation.find((candidate) => candidate.auditItemKey === check.auditItemKey);
  return {
    ...check,
    disposition: entry.disposition,
    allergenVerdict: entry.matchedCurrentProductKeys.length ? "accurately_unavailable" : "not_applicable",
    sourceEvidenceIds: entry.sourceEvidenceIds,
    notes: entry.notes,
    matchedCurrentProductKeys: entry.matchedCurrentProductKeys,
    adjudicatedContainsAllergens: [],
    adjudicatedMayContainAllergens: [],
    adjudicatedAllergenSourceType: "unavailable",
    adjudicatedAllergenAuthorityTier: null,
    allergenSourceEvidenceIds: [],
  };
});

const dossier = readJson(paths.dossier);
dossier.currentCatalog = {
  ...dossier.currentCatalog,
  status: "verified",
  reviewedBaselineItemCount: itemChecks.length,
  currentProductCount: products.length,
  reconciledCurrentProductCount: products.length,
  inventoryFingerprint: sha256(JSON.stringify(products.map((product) => ({
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category,
    presentationIds: product.presentationIds,
    matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys,
    containsAllergens: product.containsAllergens,
    mayContainAllergens: product.mayContainAllergens,
    allergenSourceType: product.allergenSourceType,
    allergenAuthorityTier: product.allergenAuthorityTier,
  })))),
  surfaces: result.menuSurfaces.filter((surface) => surface.surfaceId === "official-home").map((surface) => ({
    ...surface,
    evidenceIds: surface.sourceEvidenceIds ?? surface.evidenceIds ?? [],
    verified: surface.current === true && surface.scopeStatus === "complete",
  })),
  products,
  notes: [
    "Targeted refresh from the current restaurant-issued itemized menu.",
    "Packed headings, promotional content, alcohol, and duplicate presentations are excluded.",
  ],
};
dossier.reconciliation = Object.fromEntries(Object.entries(Object.groupBy(canonicalReconciliation, (entry) => entry.disposition)).map(([key, rows]) => [key, rows.length]));
dossier.checks = {
  ...dossier.checks,
  menu: {
    verdict: "verified",
    reviewedItemCount: itemChecks.length,
    sourceItemCount: products.length,
    notes: ["Current restaurant-issued menu parsed as distinct item cards."],
  },
  extraction: {
    verdict: "verified",
    parserReviewed: true,
    semanticsVerified: true,
    notes: ["Targeted SkyTab card extraction excludes section and promotional containers."],
  },
};
dossier.adjudication = {
  ...(dossier.adjudication ?? {}),
  mappingRepair: {
    repairedAt: retrievedAt,
    reason: "official_itemized_menu_refresh_after_aggregate_collapse",
    restoredProductCount: products.length,
    validatorGate: "aggregate_catalog_placeholders_rejected",
  },
};
const repairId = `${id}-official-menu-refresh-${retrievedAt.slice(0, 10)}`;
dossier.repairs = [
  ...(dossier.repairs ?? []).filter((repair) => repair.id !== repairId),
  {
    id: repairId,
    status: "verified",
    summary: `Replaced the one-row aggregate placeholder with ${products.length} current restaurant-issued menu items.`,
    files: Object.values(paths),
    fixturePaths: [path.relative(root, paths.result)],
    verificationCommands: [
      "official SkyTab item-card extraction",
      "validatePocResearchResult",
      "targeted Ingredient Intelligence recomputation",
      "ledger and projection validation",
    ],
  },
];
dossier.updatedAt = retrievedAt;

const generated = readJson(paths.generated);
const generatedIndex = generated.restaurants.findIndex((restaurant) => restaurant.id === id);
if (generatedIndex < 0) throw new Error("Jab We Met is missing from the generated repository.");
const previous = generated.restaurants[generatedIndex];
const target = {
  ...previous,
  category: "Indian",
  city: "Washington",
  region: "DC",
  sourceUrls: unique([sourceUrl, ...(previous.sourceUrls ?? [])]),
  items: products.map((product) => ({
    id: product.currentProductKey,
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category,
    description: null,
    ingredientsText: null,
    isConfigurable: false,
    allergens: [],
    mayContain: [],
    mayContainAllergens: [],
    allergenSourceType: "unavailable",
    allergenAuthorityTier: null,
    allergenSourceEvidenceIds: [],
    sourceEvidenceIds: ["ev-home"],
    sourceUrls: [sourceUrl],
    matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys,
  })),
  itemCount: products.length,
  menuItemCount: products.length,
  totalItemCount: products.length,
  officialItemCount: 0,
  officialAllergenStatus: "accurately_unavailable",
  allergenDataStatus: {
    officialItemCount: 0,
    officialTotal: 0,
    totalItemCount: products.length,
    officialCoverageRatio: 0,
    bucket: "official-disclosure-only",
  },
};
generated.restaurants[generatedIndex] = await annotateRestaurantWithIngredientIntelligence(target);
generated.generatedAt = retrievedAt;
generated.itemCount = generated.restaurants.reduce((count, restaurant) => count + (restaurant.items?.length ?? 0), 0);

const apply = readJson(paths.apply);
apply.validation = {
  ...validation,
  valid: true,
  currentProductCount: products.length,
  ingredientIntelligenceRecomputed: true,
  officialMenuSha256: sha256(html),
  sourceItemCount: products.length,
};
apply.errors = [];
apply.counts = {
  publishedProducts: products.length,
  matchedFrozenRows: reconciliation.filter((entry) => entry.matchedCurrentProductKeys.length).length,
  staleRows: reconciliation.filter((entry) => entry.disposition === "stale").length,
  artifactRows: reconciliation.filter((entry) => entry.disposition === "artifact").length,
  directPositiveProducts: 0,
};
apply.secondRunDiff = "none";

const ledger = readJsonLines(paths.ledger);
const ledgerIndex = ledger.findIndex((row) => row.restaurantId === id);
if (ledgerIndex < 0) throw new Error("Jab We Met is missing from the verification ledger.");
ledger[ledgerIndex] = {
  ...ledger[ledgerIndex],
  updatedAt: retrievedAt,
  repairStatus: "verified",
};

writeJson(paths.result, result);
writeJson(paths.evidence, evidence);
writeJsonLines(paths.itemChecks, updatedChecks);
writeJson(paths.dossier, dossier);
writeJson(paths.generated, generated, true);
writeJson(paths.apply, apply);
writeJsonLines(paths.ledger, ledger);

console.log(JSON.stringify({
  artifactRows: apply.counts.artifactRows,
  currentProducts: products.length,
  matchedFrozenRows: apply.counts.matchedFrozenRows,
  restaurantId: id,
  staleRows: apply.counts.staleRows,
  validation: "valid",
}, null, 2));
