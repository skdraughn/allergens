import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyRestaurantSource,
  officialAllergenStatuses,
  officialStatusForSource,
  remediationBucketForStatus,
} from "./restaurant-source-classification.mjs";
import { restaurantSources } from "./restaurant-sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultGeneratedPaths = [
  path.join(projectRoot, "src/data/generated/restaurants.generated.json"),
  path.join(projectRoot, "data/restaurants.generated.json"),
];

export async function runApplyLaunchCoverageOverlays(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const repositoryPaths = listArg(args.repositories ?? args.repository);
  const qualityReportPaths = listArg(args["quality-reports"] ?? args["quality-report"]);
  const outputPaths = listArg(args.outputs ?? args.output);
  const includedIds = setArg(args.ids);
  const skippedIds = setArg(args["skip-ids"]);
  const generatedPaths = outputPaths.length ? outputPaths.map((entry) => path.resolve(entry)) : defaultGeneratedPaths;
  const onlyPublished = args["only-published"] !== "false";
  const qualityById = await readQualityRowsById(qualityReportPaths);
  const overlayRestaurants = await readOverlayRestaurants(repositoryPaths, {
    includedIds,
    onlyPublished,
    qualityById,
    skippedIds,
  });

  if (!repositoryPaths.length) {
    throw new Error("Pass --repositories=<repository.json[,repository.json]>.");
  }

  for (const generatedPath of generatedPaths) {
    const repository = await readJson(generatedPath);
    const originalCount = repository.restaurants?.length ?? 0;
    const overlayById = new Map(overlayRestaurants.map((restaurant) => [restaurant.id, restaurant]));
    const restaurants = (repository.restaurants ?? []).map((restaurant) =>
      overlayById.get(restaurant.id) ?? restaurant,
    );
    const seenIds = new Set(restaurants.map((restaurant) => restaurant.id));
    for (const restaurant of overlayRestaurants) {
      if (!seenIds.has(restaurant.id)) {
        restaurants.push(restaurant);
      }
    }

    const backfilledRestaurants = backfillSourceMetadata(restaurants);
    const nextRepository = {
      ...repository,
      generatedAt: new Date().toISOString(),
      restaurantCount: backfilledRestaurants.length,
      itemCount: sumItemCount(backfilledRestaurants),
      restaurants: backfilledRestaurants,
      metadata: {
        ...(repository.metadata ?? {}),
        restaurantCount: backfilledRestaurants.length,
        itemCount: sumItemCount(backfilledRestaurants),
        lastLaunchCoverageOverlayAt: new Date().toISOString(),
        lastLaunchCoverageOverlayCount: overlayRestaurants.length,
      },
    };

    await writeJson(generatedPath, nextRepository);
    console.log(JSON.stringify({
      output: path.relative(projectRoot, generatedPath),
      originalCount,
      restaurantCount: backfilledRestaurants.length,
      overlayCount: overlayRestaurants.length,
      itemCount: nextRepository.itemCount,
    }));
  }
}

async function readOverlayRestaurants(
  repositoryPaths,
  { includedIds, onlyPublished, qualityById, skippedIds },
) {
  const restaurants = [];

  for (const repositoryPath of repositoryPaths.map((entry) => path.resolve(entry))) {
    const repository = await readJson(repositoryPath);
    for (const restaurant of repository.restaurants ?? []) {
      if (includedIds.size > 0 && !includedIds.has(restaurant.id)) {
        continue;
      }
      if (skippedIds.has(restaurant.id)) {
        continue;
      }
      const qualityRow = qualityById.get(restaurant.id);
      if (onlyPublished && qualityRow && qualityRow.launchStatus !== "published") {
        continue;
      }
      restaurants.push(restaurant);
    }
  }

  return restaurants;
}

async function readQualityRowsById(qualityReportPaths) {
  const rowsById = new Map();

  for (const qualityReportPath of qualityReportPaths.map((entry) => path.resolve(entry))) {
    const report = await readJson(qualityReportPath);
    for (const row of report.rows ?? []) {
      rowsById.set(row.id, row);
    }
  }

  return rowsById;
}

function backfillSourceMetadata(restaurants) {
  const sourceById = new Map(restaurantSources.map((source) => [source.id, source]));

  return restaurants.map((restaurant) => {
    const source = sourceById.get(restaurant.id);
    if (!source) {
      return restaurant;
    }

    const classification = classifyRestaurantSource(source);
    const computedOfficialAllergenStatus = officialStatusForSource({ source, restaurant });
    const officialAllergenStatus = authoritativeOfficialAllergenStatus({
      computedOfficialAllergenStatus,
      existingOfficialAllergenStatus: restaurant.officialAllergenStatus,
    });

    return {
      ...restaurant,
      brandKey: classification.brandKey,
      sourceFamily: classification.sourceFamily,
      parserProfile: classification.parserProfile,
      sourceProfile: classification.sourceProfile,
      officialAllergenStatus,
      officialAllergenRemediationBucket: remediationBucketForStatus(officialAllergenStatus, {
        restaurant,
        source,
      }),
    };
  });
}

function authoritativeOfficialAllergenStatus({
  computedOfficialAllergenStatus,
  existingOfficialAllergenStatus,
}) {
  if (
    existingOfficialAllergenStatus &&
    existingOfficialAllergenStatus !== officialAllergenStatuses.sourceFoundUnparsed
  ) {
    return existingOfficialAllergenStatus;
  }

  return computedOfficialAllergenStatus;
}

function sumItemCount(restaurants) {
  return restaurants.reduce((total, restaurant) => total + (restaurant.items?.length ?? 0), 0);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`);
}

function listArg(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function setArg(value) {
  return new Set(listArg(value));
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
  await runApplyLaunchCoverageOverlays();
}
