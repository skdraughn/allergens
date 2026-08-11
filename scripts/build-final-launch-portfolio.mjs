import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isProbablyMenuCatalogRecord } from "./pipeline/build-repository.mjs";
import { restaurantSources } from "./restaurant-sources.mjs";
import {
  hasConfiguredOfficialAllergenSource,
  officialAllergenStatuses,
  officialItemCountForRestaurant,
} from "./restaurant-source-classification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultInputRoot = path.join(projectRoot, "data/scraped/launch-coverage");
const defaultOriginalQualityPath = path.join(
  defaultInputRoot,
  "aggregate-after-nutritionix-recovery-01/quality-report.json",
);
const defaultReplacementQualityPath = path.join(
  defaultInputRoot,
  "replacement-wave-01-aggregate-03/quality-report.json",
);
const defaultReplacementTargetsPath = path.join(
  projectRoot,
  "data/discovery/dc-metro-launch-replacement-wave-01.json",
);
const defaultOutputDir = path.join(defaultInputRoot, "final-1200-portfolio-01");
const defaultSupplementalRepositoryPaths = [
  path.join(defaultInputRoot, "rerun-unparsed-shared-fixes-01/repository.json"),
  path.join(projectRoot, "data/scraped/targeted-official-canaries-01-repository.json"),
  path.join(projectRoot, "data/scraped/targeted-official-unparsed-audit-01-repository.json"),
];
const defaultRequiredSupplementalIds = [
  "sonic",
  "crumbl",
  "dig",
  "uncle-julio-s-gaithersburg-gaithersburg-md-dc-metro",
];
const sourceById = new Map(restaurantSources.map((source) => [source.id, source]));

export async function buildFinalLaunchPortfolio(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const inputRoot = path.resolve(args.inputRoot ?? defaultInputRoot);
  const originalQualityPath = path.resolve(args.originalQuality ?? defaultOriginalQualityPath);
  const replacementQualityPath = path.resolve(args.replacementQuality ?? defaultReplacementQualityPath);
  const replacementTargetsPath = path.resolve(args.replacementTargets ?? defaultReplacementTargetsPath);
  const outputDir = path.resolve(args.outputDir ?? defaultOutputDir);
  const limit = Number(args.limit ?? 1200);
  const originalPrefixes = listArg(args.originalPrefixes ?? "wave-full-,rerun-");
  const replacementPrefixes = listArg(args.replacementPrefixes ?? "replacement-wave-01-");
  const requiredSupplementalIds = new Set(
    listArg(args.requiredSupplementalIds ?? defaultRequiredSupplementalIds.join(",")),
  );
  const supplementalRepositoryPaths = [
    ...listArg(args.supplementalRepositories ?? "").map((entry) => path.resolve(entry)),
    ...defaultSupplementalRepositoryPaths,
  ].filter((entry, index, entries) => entries.indexOf(entry) === index);
  const previousRepositoryPath = path.resolve(
    args.previous ?? path.join(projectRoot, "src/data/generated/restaurants.generated.json"),
  );

  const [originalQuality, replacementQuality, replacementTargets, previousRepository, supplementalRepositories] =
    await Promise.all([
      readJson(originalQualityPath),
      readJson(replacementQualityPath),
      readJson(replacementTargetsPath),
      readJson(previousRepositoryPath),
      Promise.all(supplementalRepositoryPaths.map((entry) => readJsonIfExists(entry))),
    ]);
  const scrapeDirs = await qualityReportDirectories(inputRoot, [
    ...originalPrefixes,
    ...replacementPrefixes,
  ]);
  const restaurantById = await readLatestRestaurantsById(scrapeDirs);
  const supplementalRestaurantById = latestRestaurantsById(supplementalRepositories.filter(Boolean));
  const previousRestaurantById = new Map(
    (previousRepository.restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]),
  );
  const replacementRankById = new Map(
    (replacementTargets.targets ?? []).map((target) => [target.id, Number(target.rank ?? 999999)]),
  );
  const selected = [];
  const missingRecords = [];
  const skipped = [];
  const selectedIds = new Set();

  for (const id of requiredSupplementalIds) {
    const restaurant = supplementalRestaurantById.get(id);
    const row = {
      id,
      launchStatus: "published",
      name: restaurant?.name ?? id,
      remediationBucket: "none",
    };
    const decision = validateSelectableRestaurant({ restaurant, row });

    if (!decision.ok) {
      skipped.push({ id, name: row.name, reason: `required-supplemental-${decision.reason}` });
      continue;
    }

    selected.push(normalizeSelectedRestaurant({ restaurant, row }));
    selectedIds.add(restaurant.id);
  }

  for (const row of originalQuality.rows ?? []) {
    if (!isSelectableOriginalQualityRow(row)) {
      continue;
    }

    if (selectedIds.has(row.id)) {
      continue;
    }

    const restaurant = restaurantById.get(row.id) ?? previousRestaurantById.get(row.id);
    const decision = validateSelectableRestaurant({ restaurant, row });

    if (!decision.ok) {
      skipped.push({ id: row.id, name: row.name, reason: decision.reason });
      if (decision.reason === "missing-restaurant-record") {
        missingRecords.push(row);
      }
      continue;
    }

    selected.push(normalizeSelectedRestaurant({ restaurant, row }));
    selectedIds.add(restaurant.id);
  }

  const replacementRows = (replacementQuality.rows ?? [])
    .filter((row) => row.launchStatus === "published")
    .sort(
      (a, b) =>
        (replacementRankById.get(a.id) ?? 999999) - (replacementRankById.get(b.id) ?? 999999) ||
        String(a.name).localeCompare(String(b.name)),
    );

  for (const row of replacementRows) {
    if (selected.length >= limit) {
      break;
    }

    if (selectedIds.has(row.id)) {
      continue;
    }

    const restaurant = restaurantById.get(row.id);
    const decision = validateSelectableRestaurant({ restaurant, row });

    if (!decision.ok) {
      skipped.push({ id: row.id, name: row.name, reason: decision.reason });
      if (decision.reason === "missing-restaurant-record") {
        missingRecords.push(row);
      }
      continue;
    }

    selected.push(normalizeSelectedRestaurant({ restaurant, row }));
    selectedIds.add(restaurant.id);
  }

  if (selected.length !== limit) {
    throw new Error(`Expected ${limit} selected restaurants, got ${selected.length}.`);
  }

  const officialStatusCounts = countBy(selected, (restaurant) => restaurant.officialAllergenStatus ?? "unknown");
  if ((officialStatusCounts["source-found-unparsed"] ?? 0) > 0) {
    throw new Error("Final portfolio contains source-found-unparsed restaurants.");
  }

  const blockedCount = selected.filter((restaurant) => restaurant.coverageStatus === "blocked").length;
  if (blockedCount > 0) {
    throw new Error(`Final portfolio contains ${blockedCount} blocked restaurants.`);
  }

  const finalRepository = {
    generatedAt: new Date().toISOString(),
    rankingSource: previousRepository.rankingSource ?? "launch-coverage",
    snapshotVersion: previousRepository.snapshotVersion ?? 1,
    sourceCount: selected.reduce((count, restaurant) => count + (restaurant.sourceStatus?.ok ?? 0), 0),
    restaurantCount: selected.length,
    itemCount: selected.reduce((count, restaurant) => count + (restaurant.items?.length ?? 0), 0),
    inferenceVersion: selected.find((restaurant) => restaurant.inferenceVersion)?.inferenceVersion,
    metadata: {
      ...(previousRepository.metadata ?? {}),
      launchPortfolio: {
        generatedAt: new Date().toISOString(),
        limit,
        originalPublishedSelected: selected.filter((restaurant) => !restaurant.id.startsWith("replacement-")).length,
        replacementPublishedSelected: selected.filter((restaurant) => restaurant.id.startsWith("replacement-")).length,
        officialStatusCounts,
        originalQuality: path.relative(projectRoot, originalQualityPath),
        replacementQuality: path.relative(projectRoot, replacementQualityPath),
      },
      restaurantCount: selected.length,
      itemCount: selected.reduce((count, restaurant) => count + (restaurant.items?.length ?? 0), 0),
    },
    restaurants: selected,
  };

  const finalQualityRows = [
    ...(originalQuality.rows ?? []).filter((row) => selectedIds.has(row.id)),
    ...(replacementQuality.rows ?? []).filter((row) => selectedIds.has(row.id)),
  ];
  const report = {
    generatedAt: finalRepository.generatedAt,
    summary: {
      restaurantCount: finalRepository.restaurantCount,
      itemCount: finalRepository.itemCount,
      officialStatusCounts,
      originalPublishedSelected: finalRepository.metadata.launchPortfolio.originalPublishedSelected,
      replacementPublishedSelected: finalRepository.metadata.launchPortfolio.replacementPublishedSelected,
      missingRecordCount: missingRecords.length,
      skippedCount: skipped.length,
    },
    skipped,
    rows: finalQualityRows,
  };

  await mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, "repository.json"), finalRepository);
  await writeJson(path.join(outputDir, "selection-report.json"), report);
  await writeFile(path.join(outputDir, "selection-report.csv"), `${rowsToCsv(finalQualityRows)}\n`);

  console.log(JSON.stringify({
    outputDir: path.relative(projectRoot, outputDir),
    summary: report.summary,
  }, null, 2));

  return { finalRepository, report };
}

function validateSelectableRestaurant({ restaurant, row }) {
  if (!restaurant) {
    return { ok: false, reason: "missing-restaurant-record" };
  }

  const sanitized = sanitizeRestaurantForLaunch(restaurant);

  if ((sanitized.items?.length ?? 0) <= 0) {
    return { ok: false, reason: "missing-menu-items" };
  }

  if (sanitized.officialAllergenStatus === "source-found-unparsed") {
    return { ok: false, reason: "source-found-unparsed" };
  }

  if (row.officialAllergenStatus === "source-found-unparsed") {
    return { ok: false, reason: "row-source-found-unparsed" };
  }

  for (const key of ["brandKey", "sourceFamily", "parserProfile", "officialAllergenStatus"]) {
    if (!sanitized[key] && !row[key]) {
      return { ok: false, reason: `missing-${key}` };
    }
  }

  return { ok: true };
}

function isSelectableOriginalQualityRow(row) {
  if (row.launchStatus === "published") {
    return true;
  }

  return (
    row.launchStatus === "review-needed" &&
    row.coverageStatus === "kept-previous" &&
    row.remediationBucket === "needs-shared-parser-fix" &&
    (row.issueCodes ?? []).length === 1 &&
    row.issueCodes.includes("oversized-menu") &&
    row.officialAllergenStatus !== "source-found-unparsed"
  );
}

function normalizeSelectedRestaurant({ restaurant, row }) {
  const sanitized = sanitizeRestaurantForLaunch(restaurant);
  const normalized = {
    ...sanitized,
    launchQualityStatus: row.launchStatus,
    launchRemediationBucket: row.remediationBucket,
  };

  if (
    row.launchStatus === "published" &&
    row.remediationBucket === "none" &&
    sanitized.coverageStatus === "blocked"
  ) {
    normalized.coverageStatus = "complete";
    normalized.launchCoverageStatusNormalized = true;
  }

  return normalized;
}

function sanitizeRestaurantForLaunch(restaurant) {
  const originalItems = restaurant.items ?? [];
  const items = originalItems.filter(isProbablyMenuCatalogRecord);
  const source = sourceById.get(restaurant.id);
  const officialAllergenStatus =
    restaurant.officialAllergenStatus === officialAllergenStatuses.sourceFoundUnparsed &&
    source &&
    !hasConfiguredOfficialAllergenSource(source)
      ? officialAllergenStatuses.notFound
      : restaurant.officialAllergenStatus;
  const officialItemCount = officialItemCountForRestaurant({
    ...restaurant,
    officialAllergenStatus,
    items,
  });

  return {
    ...restaurant,
    officialAllergenStatus,
    items,
    allergenDataStatus: {
      ...(restaurant.allergenDataStatus ?? {}),
      officialItemCount,
    },
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      discardedItemCount:
        (restaurant.sourceStatus?.discardedItemCount ?? 0) +
        Math.max(0, originalItems.length - items.length),
    },
  };
}

async function qualityReportDirectories(inputRoot, prefixes) {
  const entries = await readdir(inputRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(inputRoot, entry.name))
    .filter((dir) => {
      const basename = path.basename(dir);
      return prefixes.some((prefix) => basename.startsWith(prefix)) && !/aggregate|final/i.test(basename);
    });
  const directoriesWithStats = await Promise.all(
    directories.map(async (dir) => ({ dir, mtimeMs: await qualityMtimeMs(dir) })),
  );

  return directoriesWithStats
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.dir.localeCompare(b.dir))
    .map((entry) => entry.dir);
}

async function readLatestRestaurantsById(directories) {
  const byId = new Map();

  for (const directory of directories) {
    try {
      const repository = await readJson(path.join(directory, "repository.json"));
      for (const restaurant of repository.restaurants ?? []) {
        byId.set(restaurant.id, restaurant);
      }
    } catch {
      // Directories without repository output are ignored.
    }
  }

  return byId;
}

function latestRestaurantsById(repositories) {
  const byId = new Map();

  for (const repository of repositories) {
    for (const restaurant of repository?.restaurants ?? []) {
      byId.set(restaurant.id, restaurant);
    }
  }

  return byId;
}

async function qualityMtimeMs(directory) {
  try {
    return (await stat(path.join(directory, "quality-report.json"))).mtimeMs;
  } catch {
    return 0;
  }
}

function rowsToCsv(rows) {
  const headers = [
    "id",
    "name",
    "launchStatus",
    "itemCount",
    "officialItemCount",
    "officialAllergenStatus",
    "sourceFamily",
    "parserProfile",
    "remediationBucket",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function countBy(rows, keyFn) {
  return rows.reduce((counts, row) => {
    const key = keyFn(row) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function listArg(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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
  await buildFinalLaunchPortfolio();
}
