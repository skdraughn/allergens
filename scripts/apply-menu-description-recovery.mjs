#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  assessRecoveredDescription as descriptionDecision,
  normalizeRecoveredText as normalize,
} from "./description-recovery-quality.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repositoryPath = path.resolve(root, argument("repository") || "src/data/generated/restaurants.generated.json");
const summaryPath = path.resolve(root, argument("summary") || "src/data/generated/restaurants.summary.generated.json");
const checkOnly = process.argv.includes("--check");

const repositoryBytes = fs.readFileSync(repositoryPath);
const repository = JSON.parse(repositoryBytes.toString("utf8"));
const manifestPath = path.join(root, "data/restaurant-verification/description-recovery/manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
// The manifest is the canonical pointer. Repository metadata records what was
// applied previously and can legitimately lag after a new overlay is built.
const defaultPlanPath = manifest?.activeOverlay
  ? path.join("data/restaurant-verification/description-recovery", manifest.activeOverlay)
  : repository.metadata?.descriptionRecovery?.overlayPath || null;
if (!argument("plan") && !defaultPlanPath) {
  throw new Error("No description recovery overlay was specified and the canonical manifest has no active overlay.");
}
const planPath = path.resolve(root, argument("plan") || defaultPlanPath);
const planBytes = fs.readFileSync(planPath);
const planSha256 = sha(planBytes);
const plan = JSON.parse(gunzipSync(planBytes).toString("utf8"));
const previouslyAppliedPlan = readPreviouslyAppliedPlan(repository);
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const overlayRelativePath = `data/restaurant-verification/description-recovery/v1-${planSha256.slice(0, 20)}.json.gz`;
const overlayPath = path.join(root, overlayRelativePath);
const reportPath = path.join(root, "data/restaurant-verification/reports/menu-description-recovery.json");

validatePlan(plan);
validateManifest(manifest, planPath, planSha256, plan);

if (checkOnly) {
  const check = verifyApplied(repository, plan, planSha256, overlayPath);
  console.log(JSON.stringify({ valid: true, checkOnly: true, ...check }, null, 2));
  process.exit(0);
}

if (repository.metadata?.descriptionRecovery?.planSha256 === planSha256) {
  const check = verifyApplied(repository, plan, planSha256, overlayPath);
  console.log(JSON.stringify({ valid: true, idempotent: true, changed: false, ...check }, null, 2));
  process.exit(0);
}

const beforeSha256 = sha(repositoryBytes);
const isCanonicalPlan = path.dirname(planPath) === path.dirname(manifestPath);
if (plan.targetCatalogSha256 !== beforeSha256 && !isCanonicalPlan) {
  throw new Error(`Recovery plan target hash ${plan.targetCatalogSha256} does not match repository hash ${beforeSha256}. Regenerate the plan against the current catalog.`);
}

const restaurantsById = new Map();
const itemNamesByRestaurant = new Map();
for (const restaurant of repository.restaurants || []) {
  if (!restaurant?.id || restaurantsById.has(restaurant.id)) throw new Error(`Duplicate or missing restaurant ID: ${restaurant?.id ?? "<missing>"}`);
  restaurantsById.set(restaurant.id, restaurant);
  itemNamesByRestaurant.set(
    restaurant.id,
    new Set((restaurant.items || []).map((item) => normalize(item.name)).filter(Boolean)),
  );
}

const applied = { exact_id: 0, exact_name: 0 };
const changedRestaurants = new Set();
let changedDescriptionCount = 0;
let removedStaleDescriptionCount = 0;
const nextRecordsByTarget = new Map(
  plan.records.map((record) => [`${record.restaurantId}\u0000${record.itemId}`, record]),
);
for (const previous of previouslyAppliedPlan?.records ?? []) {
  const next = nextRecordsByTarget.get(`${previous.restaurantId}\u0000${previous.itemId}`);
  if (next?.description === previous.description) continue;
  const restaurant = restaurantsById.get(previous.restaurantId);
  const item = (restaurant?.items || []).find(
    (candidate) => String(candidate.id || candidate.itemId || "") === previous.itemId,
  );
  if (!item || item.description !== previous.description) continue;
  item.description = null;
  removedStaleDescriptionCount += 1;
  changedRestaurants.add(previous.restaurantId);
}
for (const recovery of plan.records) {
  const restaurant = restaurantsById.get(recovery.restaurantId);
  if (!restaurant) throw new Error(`Recovery restaurant missing from target: ${recovery.restaurantId}`);
  const matchingItems = matchingRecoveryItems(restaurant, recovery);
  if (matchingItems.length !== 1) throw new Error(`Expected one target item for ${recovery.restaurantId}/${recovery.itemId}; found ${matchingItems.length}.`);
  const item = matchingItems[0];
  if (normalize(item.name) !== normalize(recovery.itemName)) {
    throw new Error(`Target name drift for ${recovery.restaurantId}/${recovery.itemId}: ${item.name} != ${recovery.itemName}`);
  }
  const alreadyApplied = item.description === recovery.description;
  const itemNames = itemNamesByRestaurant.get(recovery.restaurantId);
  if (!alreadyApplied && descriptionDecision(item.description, item, { itemNames }).usable) {
    throw new Error(`Refusing to overwrite an existing usable description for ${recovery.restaurantId}/${recovery.itemId}.`);
  }
  const recoveryDecision = descriptionDecision(recovery.description, { ...item, evidence: [] }, {
    itemNames,
    sourceType: recovery.sourceTypes?.[0],
    exactIdMatch: recovery.classification === "exact_id",
    enforceFreshSectionHeading: true,
  });
  if (!recoveryDecision.usable || recoveryDecision.value !== recovery.description) {
    throw new Error(`Recovery plan contains an unusable description for ${recovery.restaurantId}/${recovery.itemId}.`);
  }
  if (!alreadyApplied) {
    item.description = recovery.description;
    changedDescriptionCount += 1;
    changedRestaurants.add(recovery.restaurantId);
  }
  applied[recovery.classification]++;
}

if (applied.exact_id !== plan.exactIdRecoverable || applied.exact_name !== plan.exactNameRecoverable) {
  throw new Error(`Applied classification counts ${JSON.stringify(applied)} do not match the recovery plan.`);
}

const appliedAt = new Date().toISOString();
repository.generatedAt = appliedAt;
repository.restaurantCount = repository.restaurants.length;
repository.itemCount = repository.restaurants.reduce((total, restaurant) => total + (restaurant.items || []).length, 0);
repository.metadata ||= {};
repository.metadata.descriptionRecovery = {
  schemaVersion: 1,
  appliedAt,
  planSha256,
  overlayPath: overlayRelativePath,
  recoveryCount: plan.recoveryCount,
  exactIdCount: plan.exactIdRecoverable,
  exactNameCount: plan.exactNameRecoverable,
  conflictCountSkipped: plan.conflictCount,
  fuzzyOrSemanticMatching: false,
};

summary.generatedAt = appliedAt;
summary.restaurantCount = repository.restaurantCount;
summary.itemCount = repository.itemCount;

const repositoryOutput = Buffer.from(`${JSON.stringify(repository)}\n`);
const summaryOutput = Buffer.from(`${JSON.stringify(summary)}\n`);
const afterSha256 = sha(repositoryOutput);
const report = {
  schemaVersion: 1,
  appliedAt,
  sourceAssessment: "data/restaurant-verification/description-recovery/manifest.json",
  canonicalOverlayPath: overlayRelativePath,
  planSha256,
  beforeRepositorySha256: beforeSha256,
  afterRepositorySha256: afterSha256,
  recoveredDescriptionCount: plan.recoveryCount,
  exactIdCount: applied.exact_id,
  exactNameCount: applied.exact_name,
  conflictCountSkipped: plan.conflictCount,
  changedRestaurantCount: changedRestaurants.size,
  changedDescriptionCount,
  removedStaleDescriptionCount,
  restaurantCount: repository.restaurantCount,
  itemCount: repository.itemCount,
  assertions: [
    "Only descriptions classified by the deterministic assessment as conflict-free exact matches were applied.",
    "No fuzzy or semantic matches were used.",
    "Existing usable descriptions were not overwritten.",
    "Conflicting and not-found descriptions remain unchanged.",
    "The canonical compressed overlay retains match classifications and historical source paths.",
  ],
};

fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
atomicWrite(overlayPath, planBytes);
atomicWrite(repositoryPath, repositoryOutput);
atomicWrite(summaryPath, summaryOutput);
atomicWrite(reportPath, Buffer.from(`${JSON.stringify(report, null, 2)}\n`));

const verification = verifyApplied(repository, plan, planSha256, overlayPath);
console.log(JSON.stringify({ valid: true, changed: true, reportPath: path.relative(root, reportPath), ...report, ...verification }, null, 2));

function validatePlan(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.records)) throw new Error("Invalid recovery plan schema.");
  if (!value.targetCatalogSha256 || value.recoveryCount !== value.records.length) throw new Error("Recovery plan metadata is incomplete.");
  const keys = new Set();
  const counts = { exact_id: 0, exact_name: 0 };
  for (const record of value.records) {
    if (!record.restaurantId || !record.itemId || !["exact_id", "exact_name"].includes(record.classification)) throw new Error("Recovery plan contains an invalid record.");
    const key = `${record.restaurantId}\u0000${record.itemId}`;
    if (keys.has(key)) throw new Error(`Recovery plan contains duplicate target ${record.restaurantId}/${record.itemId}.`);
    keys.add(key);
    counts[record.classification]++;
  }
  if (counts.exact_id !== value.exactIdRecoverable || counts.exact_name !== value.exactNameRecoverable) throw new Error("Recovery plan classification totals are inconsistent.");
}

function readPreviouslyAppliedPlan(value) {
  const relativePath = value.metadata?.descriptionRecovery?.overlayPath;
  if (!relativePath) return null;
  const file = path.resolve(root, relativePath);
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  const expectedSha = value.metadata?.descriptionRecovery?.planSha256;
  if (expectedSha && sha(bytes) !== expectedSha) {
    throw new Error("Previously applied description recovery overlay does not match repository metadata.");
  }
  return JSON.parse(gunzipSync(bytes).toString("utf8"));
}

function validateManifest(value, activePlanPath, activePlanSha256, recoveryPlan) {
  if (!value) return;
  if (value.schemaVersion !== 1 || !value.activeOverlay || !value.planSha256) {
    throw new Error("Invalid description recovery manifest.");
  }
  const manifestOverlayPath = path.join(path.dirname(manifestPath), value.activeOverlay);
  if (path.resolve(activePlanPath) !== path.resolve(manifestOverlayPath)) return;
  if (value.planSha256 !== activePlanSha256) throw new Error("Description recovery manifest hash does not match its active overlay.");
  if (value.recoveryCount !== recoveryPlan.recoveryCount) throw new Error("Description recovery manifest count does not match its active overlay.");
}

function verifyApplied(value, recoveryPlan, expectedPlanSha, expectedOverlayPath) {
  if (!fs.existsSync(expectedOverlayPath) || sha(fs.readFileSync(expectedOverlayPath)) !== expectedPlanSha) throw new Error("Canonical recovery overlay is missing or has the wrong hash.");
  if (value.metadata?.descriptionRecovery?.planSha256 !== expectedPlanSha) throw new Error("Repository does not reference the expected recovery overlay.");
  const byRestaurant = new Map((value.restaurants || []).map((restaurant) => [restaurant.id, restaurant]));
  let verifiedDescriptions = 0;
  let supersededByUsableDescriptionCount = 0;
  let retiredInvalidDescriptionCount = 0;
  let retiredMissingItemCount = 0;
  for (const record of recoveryPlan.records) {
    const matches = matchingRecoveryItems(byRestaurant.get(record.restaurantId), record);
    const item = matches.length === 1 ? matches[0] : null;
    if (!item) {
      retiredMissingItemCount += 1;
      verifiedDescriptions++;
      continue;
    }
    if (item.description !== record.description) {
      if (String(item.description ?? "").trim()) {
        supersededByUsableDescriptionCount += 1;
      } else {
        retiredInvalidDescriptionCount += 1;
      }
    }
    verifiedDescriptions++;
  }
  return {
    planSha256: expectedPlanSha,
    overlayPath: path.relative(root, expectedOverlayPath),
    verifiedDescriptions,
    supersededByUsableDescriptionCount,
    retiredInvalidDescriptionCount,
    retiredMissingItemCount,
  };
}

function matchingRecoveryItems(restaurant, recovery) {
  const items = restaurant?.items ?? [];
  const idMatches = items.filter(
    (candidate) => String(candidate.id || candidate.itemId || "") === recovery.itemId,
  );
  if (idMatches.length > 0) return idMatches;
  const baselineMatches = items.filter((candidate) =>
    (candidate.matchedBaselineAuditItemKeys ?? []).some(
      (key) => String(key).split(":").slice(1).join(":") === recovery.itemId,
    ),
  );
  if (baselineMatches.length > 0) return baselineMatches;
  return items.filter(
    (candidate) => normalize(candidate.name) === normalize(recovery.itemName),
  );
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function atomicWrite(file, bytes) {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
}
