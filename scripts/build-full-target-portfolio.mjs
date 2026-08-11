import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { addCoverageMetadata, applyCoverageGate } from "./coverage-gate.mjs";
import { annotateRestaurantWithIngredientIntelligence } from "./ingredient-intelligence.mjs";
import { sourceFamilies, sourceFamilyRegistry } from "./restaurant-source-classification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultTargetsPath = path.join(projectRoot, "data/discovery/dc-metro-1200-launch-targets.json");
const defaultReviewedMenuOnlyApprovalsPath = path.join(
  projectRoot,
  "data/discovery/reviewed-menu-only-approvals.json",
);
const defaultLaunchCoverageRoot = path.join(projectRoot, "data/scraped/launch-coverage");
const defaultCurrentGeneratedPath = path.join(projectRoot, "src/data/generated/restaurants.generated.json");
const defaultOutputDir = path.join(defaultLaunchCoverageRoot, "full-target-portfolio-current");
const canonicalTargetRecordIds = new Map([
  ["chain-sonic", "sonic"],
  ["chain-nando-s", "nandos-dc"],
  ["chain-dq-chill", "dairy-queen"],
  ["chain-call-your-mother", "call-your-mother-dc"],
  ["chain-potbelly", "potbelly-dc"],
  ["chain-bonchon-chicken", "replacement-bonchon-navy-yard-washington-dc"],
  ["chain-hangry-joe-s-hot-chicken-wings", "chain-hangry-joe-s-hot-chicken"],
]);

export async function buildFullTargetPortfolio(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const targetsPath = path.resolve(args.targets ?? defaultTargetsPath);
  const reviewedMenuOnlyApprovalsPath = path.resolve(
    args.reviewedMenuOnlyApprovals ?? defaultReviewedMenuOnlyApprovalsPath,
  );
  const launchCoverageRoot = path.resolve(args.inputRoot ?? defaultLaunchCoverageRoot);
  const currentGeneratedPath = path.resolve(args.current ?? defaultCurrentGeneratedPath);
  const outputDir = path.resolve(args.outputDir ?? defaultOutputDir);
  const writeGenerated = args.writeGenerated === "true";
  const includeBlocked = args.includeBlocked === "true";

  const [targetsFile, currentRepository, reviewedMenuOnlyApprovalsFile] = await Promise.all([
    readJson(targetsPath),
    readJson(currentGeneratedPath),
    readJsonIfExists(reviewedMenuOnlyApprovalsPath),
  ]);
  const targets = targetsFile.targets ?? [];
  const reviewedMenuOnlyApprovals = reviewedMenuOnlyApprovalsById(reviewedMenuOnlyApprovalsFile);
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const targetByRecordId = new Map(
    targets.map((target) => [recordIdForTarget(target), target]),
  );
  const records = new Map();
  const provenance = new Map();

  for (const restaurant of currentRepository.restaurants ?? []) {
    if (!isUsableAppRestaurant(restaurant)) {
      continue;
    }

    records.set(restaurant.id, restaurant);
    provenance.set(restaurant.id, {
      source: path.relative(projectRoot, currentGeneratedPath),
      sourceType: "current-generated",
    });
  }

  const repositoryPaths = await findRepositoryPaths(launchCoverageRoot);

  for (const repositoryPath of repositoryPaths) {
    const repository = await readJsonIfExists(repositoryPath);

    for (const restaurant of repository?.restaurants ?? []) {
      const candidateUsable = isUsableAppRestaurant(restaurant);
      const current = records.get(restaurant.id);

      if (!candidateUsable && current) {
        continue;
      }

      if (!candidateUsable && !targetById.has(restaurant.id)) {
        continue;
      }

      records.set(restaurant.id, restaurant);
      provenance.set(restaurant.id, {
        source: path.relative(projectRoot, repositoryPath),
        sourceType: candidateUsable ? "usable-scrape-record" : "empty-target-record",
      });
    }
  }

  const targetRecordsFound = [];
  const targetRecordsMissing = [];
  const targetRecordsEmpty = [];

  for (const target of targets) {
    const recordId = recordIdForTarget(target);
    const restaurant = records.get(recordId);

    if (!restaurant) {
      targetRecordsMissing.push(target);
      continue;
    }

    if (!isUsableAppRestaurant(restaurant)) {
      targetRecordsEmpty.push(target);
      continue;
    }

    targetRecordsFound.push(target);
  }

  const generatedAt = new Date().toISOString();
  const selectedIds = new Set([
    ...(currentRepository.restaurants ?? []).map((restaurant) => restaurant.id),
    ...targetRecordsFound.map((target) => recordIdForTarget(target)),
  ]);
  const selected = Array.from(selectedIds)
    .map((id) => records.get(id))
    .filter((restaurant) => restaurant && isUsableAppRestaurant(restaurant))
    .map((restaurant) =>
      applyReviewedMenuOnlyApproval(restaurant, reviewedMenuOnlyApprovals, generatedAt),
    )
    .sort((left, right) => rankForRestaurant(left, targetById) - rankForRestaurant(right, targetById));
  const gated = applyCoverageGate({
    generatedAt,
    rankingSource: "full-target-portfolio",
    snapshotVersion: currentRepository.snapshotVersion ?? 1,
    restaurants: selected,
  }).repository;
  const annotated = await Promise.all(
    gated.restaurants.map((restaurant) => annotateRestaurantWithIngredientIntelligence(restaurant)),
  );
  const appReadyRestaurants = includeBlocked
    ? annotated
    : annotated.filter((restaurant) => restaurant.coverageStatus !== "blocked");
  const blockedExcluded = includeBlocked
    ? []
    : annotated.filter((restaurant) => restaurant.coverageStatus === "blocked");
  const finalRepository = {
    ...gated,
    generatedAt,
    rankingSource: "full-target-portfolio",
    sourceCount: appReadyRestaurants.reduce((count, restaurant) => count + (restaurant.sourceStatus?.ok ?? 0), 0),
    restaurantCount: appReadyRestaurants.length,
    itemCount: appReadyRestaurants.reduce((count, restaurant) => count + (restaurant.items?.length ?? 0), 0),
    inferenceVersion: appReadyRestaurants.find((restaurant) => restaurant.inferenceVersion)?.inferenceVersion,
    metadata: {
      ...(currentRepository.metadata ?? {}),
      fullTargetPortfolio: {
        generatedAt,
        targets: targets.length,
        selectedRestaurants: annotated.length,
        currentGeneratedInput: currentRepository.restaurants?.length ?? 0,
        targetRecordsFound: targetRecordsFound.length,
        targetRecordsMissing: targetRecordsMissing.length,
        targetRecordsEmpty: targetRecordsEmpty.length,
        blockedExcluded: blockedExcluded.length,
        reviewedMenuOnlyApprovals: reviewedMenuOnlyApprovals.size,
        includeBlocked,
      },
    },
    restaurants: appReadyRestaurants,
  };
  const selectedIdSet = new Set(appReadyRestaurants.map((restaurant) => restaurant.id));
  const currentNonTargets = (currentRepository.restaurants ?? [])
    .filter((restaurant) => !targetById.has(restaurant.id) && !targetByRecordId.has(restaurant.id))
    .map((restaurant) => restaurant.id);
  const report = {
    generatedAt,
    summary: {
      currentGeneratedInput: currentRepository.restaurants?.length ?? 0,
      targetCount: targets.length,
      targetRecordsFound: targetRecordsFound.length,
      targetRecordsMissing: targetRecordsMissing.length,
      targetRecordsEmpty: targetRecordsEmpty.length,
      currentNonTargets: currentNonTargets.length,
      selectedRestaurantCount: finalRepository.restaurantCount,
      selectedItemCount: finalRepository.itemCount,
      blockedExcludedCount: blockedExcluded.length,
      includeBlocked,
      keptPreviousSelectedCount: appReadyRestaurants.filter((restaurant) => restaurant.coverageStatus === "kept-previous").length,
    },
    missingTargets: targetRecordsMissing.map((target) => ({
      ...summarizeTarget(target),
      recordId: recordIdForTarget(target),
    })),
    emptyTargets: targetRecordsEmpty.map((target) => ({
      ...summarizeTarget(target),
      recordId: recordIdForTarget(target),
      provenance: provenance.get(recordIdForTarget(target)),
    })),
    blockedExcluded: blockedExcluded.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      target: targetByRecordId.get(restaurant.id) ?? targetById.get(restaurant.id) ?? null,
      itemCount: restaurant.items?.length ?? 0,
      officialItemCount: restaurant.allergenDataStatus?.officialItemCount ?? 0,
      officialAllergenStatus: restaurant.officialAllergenStatus ?? null,
      sourceFamily: restaurant.sourceFamily ?? null,
      parserProfile: restaurant.parserProfile ?? null,
      provenance: provenance.get(restaurant.id),
    })),
    currentNonTargets,
    selectedProvenance: appReadyRestaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      targetPriority: (targetByRecordId.get(restaurant.id) ?? targetById.get(restaurant.id))?.priority ?? null,
      itemCount: restaurant.items?.length ?? 0,
      officialItemCount: restaurant.allergenDataStatus?.officialItemCount ?? 0,
      officialAllergenStatus: restaurant.officialAllergenStatus ?? null,
      coverageStatus: restaurant.coverageStatus ?? null,
      provenance: provenance.get(restaurant.id),
      selected: selectedIdSet.has(restaurant.id),
    })),
  };

  await mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, "repository.json"), finalRepository);
  await writeJson(path.join(outputDir, "selection-report.json"), report);

  if (writeGenerated) {
    await writeJson(path.join(projectRoot, "src/data/generated/restaurants.generated.json"), finalRepository);
    await writeJson(path.join(projectRoot, "data/restaurants.generated.json"), finalRepository);
  }

  console.log(JSON.stringify({
    outputDir: path.relative(projectRoot, outputDir),
    writeGenerated,
    summary: report.summary,
  }, null, 2));

  return { finalRepository, report };
}

function reviewedMenuOnlyApprovalsById(file) {
  const defaultReviewedAt = file?.reviewedAt ?? "2026-07-05";
  const defaultMinimumItemCount = file?.minimumItemCount ?? 10;

  return new Map(
    (file?.approvals ?? [])
      .filter((approval) => approval?.id)
      .map((approval) => [
        approval.id,
        {
          ...approval,
          minimumItemCount: approval.minimumItemCount ?? defaultMinimumItemCount,
          reviewedAt: approval.reviewedAt ?? defaultReviewedAt,
        },
      ]),
  );
}

function applyReviewedMenuOnlyApproval(restaurant, approvalsById, generatedAt) {
  const approval = approvalsById.get(restaurant.id);

  if (!approval) {
    return restaurant;
  }

  const approvedRestaurant = {
    ...restaurant,
    allowUnavailableAllergenFallback: true,
    reviewedMenuOnlyFallback: true,
    reviewedMenuOnlyMinItemCount: approval.minimumItemCount ?? 10,
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      reviewedMenuOnlyFallback: {
        approvedAt: approval.reviewedAt ?? "2026-07-05",
        note: approval.note,
      },
    },
  };

  const adapter =
    sourceFamilyRegistry[approvedRestaurant.sourceFamily] ??
    sourceFamilyRegistry[sourceFamilies.manualReview];

  return addCoverageMetadata(
    approvedRestaurant,
    {
      ...adapter,
      id: approvedRestaurant.id,
    },
    generatedAt,
  );
}

function isUsableAppRestaurant(restaurant) {
  return (
    (restaurant?.items?.length ?? 0) > 0 ||
    Boolean(restaurant?.accommodationSummary) ||
    Boolean(restaurant?.allergyAccommodationSummary) ||
    Boolean(restaurant?.restaurantAccommodations) ||
    Boolean(restaurant?.accommodations)
  );
}

function rankForRestaurant(restaurant, targetById) {
  const target = targetById.get(restaurant.id);
  const targetRank = Number(target?.priority);

  if (Number.isFinite(targetRank)) {
    return -targetRank;
  }

  return Number(restaurant.rank ?? 999999);
}

function summarizeTarget(target) {
  return {
    id: target.id,
    name: target.name,
    priority: target.priority ?? null,
    source: target.source ?? null,
  };
}

function recordIdForTarget(target) {
  return canonicalTargetRecordIds.get(target.id) ?? target.id;
}

async function findRepositoryPaths(root) {
  const paths = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.name === "repository.json") {
        paths.push(entryPath);
      }
    }
  }

  await walk(root);

  const withStats = await Promise.all(
    paths.map(async (repositoryPath) => ({
      repositoryPath,
      mtimeMs: (await stat(repositoryPath)).mtimeMs,
    })),
  );

  return withStats
    .sort((left, right) => left.mtimeMs - right.mtimeMs || left.repositoryPath.localeCompare(right.repositoryPath))
    .map((entry) => entry.repositoryPath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function writeJson(filePath, value) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, `${JSON.stringify(sanitizeJsonValue(value), null, 2)}\n`);
  await fsRename(tmpPath, filePath);
}

async function fsRename(from, to) {
  const { rename } = await import("node:fs/promises");
  await rename(from, to);
}

function sanitizeJsonValue(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      sanitizeJsonValue(key, seen),
      sanitizeJsonValue(entry, seen),
    ]),
  );
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [rawKey, ...rest] = arg.replace(/^--/, "").split("=");
        return [rawKey, rest.join("=") || "true"];
      }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildFullTargetPortfolio();
}
