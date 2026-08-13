#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vr = path.join(root, "data/restaurant-verification");
const id = "the-brass-tap-washington-dc-dc-metro";
const runId = "distributed-machine-b-back-20260810231404";
const reviewRelative = `distributed-runs/${runId}/reviews/${id}-mapping-repair-sol.json`;
const reviewPath = path.join(vr, reviewRelative);
if (!fs.existsSync(reviewPath)) throw new Error(`Missing binding Sol review ${reviewRelative}.`);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value, compact = false) => fs.writeFileSync(file, `${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
const readLines = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const writeLines = (file, values) => fs.writeFileSync(file, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const dossierPath = path.join(vr, "restaurants", `${id}.json`);
const evidencePath = path.join(vr, "evidence", `${id}.json`);
const checksPath = path.join(vr, "item-checks", `${id}.jsonl`);
const ledgerPath = path.join(vr, "ledger.jsonl");
const generatedPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossier = readJson(dossierPath);
const evidence = readJson(evidencePath);
const checks = readLines(checksPath);
const ledger = readLines(ledgerPath);
const generated = readJson(generatedPath);
const row = ledger.find((entry) => entry.restaurantId === id);
const restaurant = generated.restaurants.find((entry) => entry.id === id);
if (!row || !restaurant) throw new Error("Missing canonical Brass Tap records.");
const now = new Date().toISOString();
const sourceIds = new Set(evidence.sources.map((source) => source.id));
const anchor = (preferred) => preferred.find((sourceId) => sourceIds.has(sourceId)) ?? evidence.sources[0].id;

const attempts = [
  ["official_site", "https://www.brasstapbeerbar.com/default.aspx", null, ["s1", "s2"], "Official brand and locator do not establish a Washington, DC restaurant."],
  ["linked_source", "https://www.brasstapbeerbar.com/locations.aspx", null, ["s2"], "No restaurant-issued location-specific menu can be bound to the requested identity."],
  ["ordering_vendor", null, "The Brass Tap Washington DC official ordering", ["s2"], "No restaurant-linked ordering location establishes the requested Washington identity."],
  ["targeted_search", null, "site:brasstapbeerbar.com Washington DC menu allergen", ["s1", "s2", "s4"], "Brand sources exist, but not a separable Washington-location catalog."],
  ["archive", "https://www.brasstapbeerbar.com/locations.aspx", null, ["s2"], "No archived/current exact-location identity is supported by the retained record."],
  ["third_party", null, "The Brass Tap Washington DC restaurant", ["s2"], "Third-party references cannot override the restaurant-issued locator's missing exact location."],
].map(([kind, url, query, ids, scopeImpact], index) => ({
  id: `blocked-${index + 1}-${kind}`,
  attemptedAt: now,
  kind,
  status: "not_found",
  url,
  query,
  request: null,
  outcome: scopeImpact,
  scopeImpact,
  evidenceIds: [...new Set(ids.filter((sourceId) => sourceIds.has(sourceId)).concat(anchor(ids)))],
}));

dossier.status = "blocked_unverifiable";
dossier.updatedAt = now;
dossier.completedAt = now;
dossier.currentCatalog = {
  ...dossier.currentCatalog,
  status: "unverifiable",
  currentProductCount: 0,
  reconciledCurrentProductCount: 0,
  inventoryFingerprint: crypto.createHash("sha256").update("[]").digest("hex"),
  products: [],
  notes: [
    "Binding Sol review found no restaurant-issued evidence for a separable Washington, DC location.",
    "The former aggregate brand-menu placeholder is quarantined and is not a publishable product.",
  ],
};
dossier.sourceAttempts = attempts;
dossier.adjudication = {
  type: "sol_review",
  runId,
  decidedAt: now,
  recommendation: "blocked_unverifiable",
  model: { id: "gpt-5.6-sol", reasoningEffort: "medium" },
  rationale: "The official locator does not establish the requested Washington, DC restaurant; brand-level menu data and its allergen guide cannot safely be assigned to this exact-location record.",
  artifactHashes: [{ path: reviewRelative, sha256: hashFile(reviewPath) }],
};

const blockedChecks = checks.map((check) => ({
  ...check,
  disposition: check.disposition === "artifact" ? "artifact" : "location_mismatch",
  allergenVerdict: check.disposition === "artifact" ? "not_applicable" : "accurately_unavailable",
  sourceEvidenceIds: [anchor(["s2", "s1"])],
  matchedCurrentProductKeys: [],
  adjudicatedContainsAllergens: [],
  adjudicatedMayContainAllergens: [],
  adjudicatedAllergenSourceType: "unavailable",
  adjudicatedAllergenAuthorityTier: null,
  allergenSourceEvidenceIds: [],
  notes: "Exact Washington, DC location could not be verified; brand-level catalog data was not mapped to this record.",
}));

row.status = "blocked_unverifiable";
row.completedAt = now;
row.updatedAt = now;
row.repairStatus = "blocked_unverifiable";
restaurant.items = [];
restaurant.itemCount = restaurant.menuItemCount = restaurant.totalItemCount = 0;
restaurant.coveragePercent = 0;
restaurant.coverageStatus = "unverifiable";
restaurant.allergyAccommodationPolicy = {
  status: "catalog-unavailable",
  scope: "exact-location",
  summary: "No separable Washington, DC restaurant or applicable exact-location catalog could be verified from restaurant-issued sources.",
  advanceNotice: null,
  notes: ["Brand-level menu data is intentionally not assigned to an unverified exact-location record."],
  sourceLabel: "Binding Sol identity review",
  sourceType: "verification-ledger",
  sourceUrl: "https://www.brasstapbeerbar.com/locations.aspx",
  sourceRetrievedAt: now.slice(0, 10),
};
generated.generatedAt = now;
generated.itemCount = generated.restaurants.reduce((sum, entry) => sum + (entry.items?.length ?? 0), 0);

writeJson(dossierPath, dossier);
writeLines(checksPath, blockedChecks);
writeLines(ledgerPath, ledger);
writeJson(generatedPath, generated, true);
console.log(JSON.stringify({ restaurantId: id, status: row.status, products: 0, checks: blockedChecks.length, review: reviewRelative }, null, 2));
