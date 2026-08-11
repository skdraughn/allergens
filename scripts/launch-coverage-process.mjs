import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { restaurantSources } from "./restaurant-sources.mjs";
import {
  buildLaunchQualityReport,
  launchQualityRowsToCsv,
} from "./launch-coverage-quality.mjs";
import { classifyRestaurantSource } from "./restaurant-source-classification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultTargetPath = path.join(
  projectRoot,
  "data/discovery/dc-metro-1200-launch-targets.json",
);
const defaultPreviousPath = path.join(
  projectRoot,
  "src/data/generated/restaurants.generated.json",
);
const defaultOutputRoot = path.join(projectRoot, "data/scraped/launch-coverage");

const launchWaves = {
  canary: { label: "canary", limit: 25 },
  first100: { label: "first100", limit: 100 },
  second300: { label: "second300", limit: 300 },
  full: { label: "full", limit: null },
};

const canaryPreferredIds = [
  "subway",
  "mcdonalds",
  "burger-king",
  "dunkin",
  "founding-farmers-dc",
  "founding-farmers-reston-station-dc-metro",
  "founding-farmers-tysons-dc-metro",
  "andpizza-dc",
  "district-taco-dc",
  "restaurant-1789-dc",
  "air-restaurant-washington-dc-dc-metro",
  "2-amys-washington-dc-dc-metro",
];

const canaryStatusQuotas = {
  "existing-official": 5,
  "existing-menu": 5,
  "existing-weak": 5,
  "existing-zero": 5,
  "new-candidate": 5,
};

export async function runLaunchCoverageProcess(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const wave = launchWaves[args.wave ?? "canary"] ?? launchWaves.canary;
  const targetsPath = path.resolve(args.targets ?? defaultTargetPath);
  const outputRoot = path.resolve(args.outputDir ?? defaultOutputRoot);
  const runId = args.runId ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${wave.label}`;
  const outputDir = path.join(outputRoot, runId);
  const previousPath = path.resolve(args.previous ?? defaultPreviousPath);
  if (args["write-raw"] !== "false") {
    process.env.RESTAURANT_PIPELINE_WRITE_RAW ??= "true";
  }
  const previousRepository = await readJsonIfExists(previousPath);
  const targetPlan = await buildLaunchTargetPlan({ targetsPath });
  const selectedTargets = args.ids
    ? selectLaunchTargetsById(targetPlan.targets, String(args.ids).split(","))
    : selectLaunchWaveTargets(targetPlan.targets, {
        limit: args.limit ? Number(args.limit) : wave.limit,
        offset: args.offset ? Number(args.offset) : 0,
        wave: wave.label,
      });
  const sourceSets = selectedTargets.flatMap((target) =>
    target.source ? [withLaunchRunLimits(target.source, args)] : [],
  );

  await mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, "target-plan.json"), {
    generatedAt: new Date().toISOString(),
    input: path.relative(projectRoot, targetsPath),
    selectedWave: wave.label,
    summary: summarizeLaunchTargets(targetPlan.targets),
    selection: {
      ids: args.ids ?? null,
      limit: args.limit ? Number(args.limit) : wave.limit,
      offset: args.offset ? Number(args.offset) : 0,
    },
    selectedSummary: summarizeLaunchTargets(selectedTargets),
    selectedTargets: selectedTargets.map(stripSourceForPlanOutput),
  });

  if (args["plan-only"] === "true") {
    console.log(`Wrote launch target plan to ${path.relative(projectRoot, outputDir)}`);
    return {
      outputDir,
      selectedTargets,
      targetPlan,
    };
  }

  const { buildRestaurantRepository } = await import("./pipeline/build-repository.mjs");
  const { repository, run } = await buildRestaurantRepository({
    args: {
      ...args,
      launchCoverageWave: wave.label,
      targetInput: path.relative(projectRoot, targetsPath),
    },
    previousRepository,
    sourceSets,
  });
  const qualityReport = buildLaunchQualityReport({
    previousRepository,
    repository,
    run,
    sourceSets,
    targets: selectedTargets,
  });

  await writeJson(path.join(outputDir, "repository.json"), repository);
  await writeJson(path.join(outputDir, "run.json"), run);
  await writeJson(path.join(outputDir, "quality-report.json"), qualityReport);
  await writeFile(
    path.join(outputDir, "quality-report.csv"),
    `${launchQualityRowsToCsv(qualityReport.rows)}\n`,
  );

  console.log(JSON.stringify({
    outputDir: path.relative(projectRoot, outputDir),
    wave: wave.label,
    selected: selectedTargets.length,
    sourceSets: sourceSets.length,
    quality: qualityReport.summary,
  }, null, 2));

  return {
    outputDir,
    qualityReport,
    repository,
    run,
    selectedTargets,
    targetPlan,
  };
}

export async function buildLaunchTargetPlan({ targetsPath = defaultTargetPath } = {}) {
  const launchTargets = JSON.parse(await readFile(targetsPath, "utf8"));
  const existingSourceById = new Map(restaurantSources.map((source) => [source.id, source]));
  const seenSourceKeys = new Set();
  const targets = [];

  for (const target of launchTargets.targets ?? []) {
    const source = sourceForLaunchTarget(target, existingSourceById);
    const classification = source ? classifyRestaurantSource(source) : null;
    const sourceKey = sourceDeduplicationKey({ classification, source, target });
    const duplicateOf = seenSourceKeys.has(sourceKey) ? sourceKey : null;

    if (!duplicateOf) {
      seenSourceKeys.add(sourceKey);
    }

    targets.push({
      ...target,
      batch: batchForTarget(target),
      brandKey: classification?.brandKey ?? normalizeKey(target.key ?? target.name),
      duplicateOf,
      launchSourceKey: sourceKey,
      parserProfile: classification?.parserProfile ?? "",
      source,
      sourceFamily: classification?.sourceFamily ?? "",
      sourceProfile: classification?.sourceProfile ?? "",
      scrapeReady: isScrapeReadySource(source),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: launchTargets.summary,
    targets,
  };
}

export function selectLaunchWaveTargets(targets, { wave = "canary", limit = null, offset = 0 } = {}) {
  const deduped = targets.filter((target) => !target.duplicateOf && target.scrapeReady);

  if (wave === "canary") {
    return selectCanaryTargets(deduped, limit ?? launchWaves.canary.limit).slice(offset);
  }

  return deduped
    .slice()
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.rank ?? 0) - (b.rank ?? 0))
    .slice(offset, limit ? offset + limit : deduped.length);
}

export function selectLaunchTargetsById(targets, ids) {
  const requestedIds = ids.map((id) => id.trim()).filter(Boolean);
  const targetById = new Map(targets.map((target) => [target.id, target]));

  return requestedIds
    .map((id) => targetById.get(id))
    .filter((target) => target?.scrapeReady);
}

export function sourceForLaunchTarget(target, existingSourceById = new Map()) {
  const existing = existingSourceById.get(target.id);

  if (existing) {
    return {
      ...existing,
      allowUnavailableAllergenFallback:
        target.allowUnavailableAllergenFallback ?? existing.allowUnavailableAllergenFallback,
      accommodationOnly: target.accommodationOnly ?? existing.accommodationOnly,
      allergyAccommodationPolicy:
        target.allergyAccommodationPolicy ?? existing.allergyAccommodationPolicy,
      excludedMenuCategoryPatterns: [
        ...(existing.excludedMenuCategoryPatterns ?? []),
        ...compileTargetRegexes(target.excludedMenuCategoryPatterns),
      ],
      excludedMenuNamePatterns: [
        ...(existing.excludedMenuNamePatterns ?? []),
        ...compileTargetRegexes(target.excludedMenuNamePatterns),
      ],
      expectedSmallMenu: target.expectedSmallMenu ?? existing.expectedSmallMenu,
      launchTargetStatus: target.sourceStatus,
      menuUrls: mergeUrlEntries(existing.menuUrls, launchTargetMenuUrls(target)),
      representedLocations: target.representedLocations,
    };
  }

  if (!isHttpUrl(target.sourceUrl)) {
    return null;
  }

  const menuUrls = launchTargetMenuUrls(target);
  const host = hostFromUrl(target.sourceUrl || menuUrls[0]);

  return {
    id: target.id,
    rank: 100000 + Number(target.rank ?? 0),
    name: target.name,
    category: target.cuisine || "Restaurant",
    domain: host,
    type: target.type === "chain-menu" ? "chain" : "local",
    allowUnavailableAllergenFallback: true,
    accommodationOnly: target.accommodationOnly === true,
    allergyAccommodationPolicy: target.allergyAccommodationPolicy,
    locationId: target.type === "chain-menu" ? "dc-metro" : normalizeKey(target.area || "dc-metro"),
    city: target.area && !/^multiple/i.test(target.area) ? target.area : undefined,
    country: "US",
    region: target.bucket === "DC" ? "DC" : undefined,
    menuUrls,
    allergenUrls: [],
    expectedSmallMenu: target.expectedSmallMenu === true,
    excludedMenuCategoryPatterns: compileTargetRegexes(target.excludedMenuCategoryPatterns),
    excludedMenuNamePatterns: compileTargetRegexes(target.excludedMenuNamePatterns),
    launchTargetStatus: target.sourceStatus,
    maxSourceFetches: Number.isFinite(Number(target.maxSourceFetches))
      ? Number(target.maxSourceFetches)
      : undefined,
    productPageLimit: Number.isFinite(Number(target.productPageLimit))
      ? Number(target.productPageLimit)
      : undefined,
    representedLocations: target.representedLocations,
    useBrowserFetch: target.useBrowserFetch === true,
  };
}

function isScrapeReadySource(source) {
  return Boolean(
    source?.menuUrls?.length ||
      source?.allergenUrls?.length ||
      source?.apiUrls?.length ||
      source?.nutritionix,
  );
}

function launchTargetMenuUrls(target) {
  const entries = [
    ...(Array.isArray(target.sourceUrls) ? target.sourceUrls : []),
    ...(Array.isArray(target.menuUrls) ? target.menuUrls : []),
    target.sourceUrl,
  ]
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }

      if (entry && typeof entry === "object" && isHttpUrl(entry.url)) {
        return entry;
      }

      return "";
    })
    .filter((entry) => isHttpUrl(typeof entry === "string" ? entry : entry.url));

  const byUrl = new Map();

  for (const entry of entries) {
    const url = typeof entry === "string" ? entry : entry.url;

    if (!byUrl.has(url)) {
      byUrl.set(url, entry);
    }
  }

  return Array.from(byUrl.values());
}

export function summarizeLaunchTargets(targets) {
  return {
    total: targets.length,
    scrapeReady: targets.filter((target) => target.scrapeReady).length,
    duplicateCount: targets.filter((target) => target.duplicateOf).length,
    byBatch: countBy(targets, (target) => target.batch),
    byStatus: countBy(targets, (target) => target.sourceStatus),
    bySourceFamily: countBy(targets, (target) => target.sourceFamily || "unknown"),
  };
}

function selectCanaryTargets(targets, limit) {
  const byId = new Map(targets.map((target) => [target.id, target]));
  const selected = [];
  const selectedIds = new Set();

  for (const id of canaryPreferredIds) {
    const target = byId.get(id);

    if (target && selected.length < limit) {
      selected.push(target);
      selectedIds.add(target.id);
    }
  }

  for (const [status, quota] of Object.entries(canaryStatusQuotas)) {
    const currentCount = selected.filter((target) => target.sourceStatus === status).length;
    let remaining = Math.max(0, quota - currentCount);

    for (const target of targets) {
      if (remaining <= 0 || selected.length >= limit) {
        break;
      }

      if (
        target.sourceStatus === status &&
        !selectedIds.has(target.id) &&
        selected.length < limit
      ) {
        selected.push(target);
        selectedIds.add(target.id);
        remaining -= 1;
      }
    }
  }

  for (const target of targets) {
    if (selected.length >= limit) {
      break;
    }

    if (!selectedIds.has(target.id)) {
      selected.push(target);
      selectedIds.add(target.id);
    }
  }

  return selected;
}

function batchForTarget(target) {
  if (target.sourceStatus === "existing-official") {
    return "existing-official-source";
  }

  if (target.sourceStatus === "existing-menu") {
    return "existing-menu-only";
  }

  if (target.sourceStatus === "existing-weak" || target.sourceStatus === "existing-zero") {
    return "existing-weak-or-zero";
  }

  if (target.sourceStatus === "new-candidate") {
    return target.type === "chain-menu" ? "new-chain-representative" : "new-local-candidate";
  }

  return "manual-review";
}

function sourceDeduplicationKey({ classification, source, target }) {
  if (target.type === "chain-menu") {
    return `chain:${classification?.brandKey ?? normalizeKey(target.key ?? target.name)}`;
  }

  return `location:${source?.id ?? target.id}`;
}

function stripSourceForPlanOutput(target) {
  const { source, ...rest } = target;

  return {
    ...rest,
    sourceUrls: [
      ...(source?.menuUrls ?? []),
      ...(source?.allergenUrls ?? []),
      ...(source?.apiUrls ?? []),
    ].map((entry) => typeof entry === "string" ? entry : entry?.url).filter(Boolean),
  };
}

function withLaunchRunLimits(source, args) {
  return {
    ...source,
    maxSourceFetches: Number(args["max-source-fetches"] ?? source.maxSourceFetches ?? 48),
    productPageLimit: Number(args["product-page-limit"] ?? source.productPageLimit ?? 8),
  };
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
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

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compileTargetRegexes(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (entry instanceof RegExp) {
        return entry;
      }

      if (typeof entry === "string") {
        try {
          return new RegExp(entry, "i");
        } catch {
          return null;
        }
      }

      if (entry && typeof entry.source === "string") {
        try {
          return new RegExp(entry.source, entry.flags ?? "i");
        } catch {
          return null;
        }
      }

      return null;
    })
    .filter(Boolean);
}

function mergeUrlEntries(...groups) {
  const byUrl = new Map();

  for (const group of groups) {
    for (const entry of group ?? []) {
      const url = typeof entry === "string" ? entry : entry?.url;

      if (isHttpUrl(url) && !byUrl.has(url)) {
        byUrl.set(url, entry);
      }
    }
  }

  return Array.from(byUrl.values());
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
  await runLaunchCoverageProcess();
}
