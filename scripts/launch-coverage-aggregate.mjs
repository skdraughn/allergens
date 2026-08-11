import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  launchQualityRowsToCsv,
  launchQualityStatuses,
  summarizeLaunchQualityRows,
} from "./launch-coverage-quality.mjs";
import { buildLaunchTargetPlan } from "./launch-coverage-process.mjs";
import { officialAllergenStatuses } from "./restaurant-source-classification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultInputRoot = path.join(projectRoot, "data/scraped/launch-coverage");
const defaultOutputDir = path.join(defaultInputRoot, "full-aggregate");

export async function runLaunchCoverageAggregate(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const inputRoot = path.resolve(args.inputRoot ?? defaultInputRoot);
  const outputDir = path.resolve(args.outputDir ?? defaultOutputDir);
  const prefixes = String(args.prefixes ?? "full-")
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);
  const explicitDirs = String(args.dirs ?? "")
    .split(",")
    .map((dir) => dir.trim())
    .filter(Boolean);
  const chunkDirs = explicitDirs.length > 0
    ? explicitDirs.map((dir) => path.resolve(dir))
    : await qualityReportDirectories(inputRoot, prefixes);
  const plan = await buildLaunchTargetPlan({
    targetsPath: args.targets ? path.resolve(args.targets) : undefined,
  });
  const scrapedRows = await readQualityRows(chunkDirs);
  const aggregate = aggregateLaunchCoverageRows({ plan, scrapedRows });

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "quality-report.json"),
    `${JSON.stringify(aggregate, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "quality-report.csv"),
    `${launchQualityRowsToCsv(aggregate.rows)}\n`,
  );

  console.log(JSON.stringify({
    outputDir: path.relative(projectRoot, outputDir),
    chunkDirs: chunkDirs.map((dir) => path.relative(projectRoot, dir)),
    summary: aggregate.summary,
  }, null, 2));

  return aggregate;
}

export function aggregateLaunchCoverageRows({ plan, scrapedRows }) {
  const targetById = new Map((plan?.targets ?? []).map((target) => [target.id, target]));
  const rowById = new Map(scrapedRows.map((row) => [row.id, row]));
  const rowBySourceKey = new Map(
    scrapedRows
      .filter((row) => row.launchSourceKey)
      .map((row) => [row.launchSourceKey, row]),
  );
  const rows = [];

  for (const target of plan?.targets ?? []) {
    const scraped = rowById.get(target.id);

    if (scraped) {
      rows.push(scraped);
      continue;
    }

    if (target.duplicateOf) {
      const sourceRow = rowBySourceKey.get(target.duplicateOf);
      rows.push(duplicateCoverageRow(target, sourceRow));
      continue;
    }

    if (!target.scrapeReady) {
      rows.push(noSourceCoverageRow(target));
      continue;
    }

    rows.push(notRunCoverageRow(target));
  }

  const directRows = rows.filter((row) => row.launchStatus !== "deduped-to-source");
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      ...summarizeLaunchQualityRows(directRows),
      totalTargets: rows.length,
      directStatusTotal: directRows.length,
      dedupedTargetCount: rows.filter((row) => row.launchStatus === "deduped-to-source").length,
      notRunCount: rows.filter((row) => row.launchStatus === "not-run").length,
      noSourceCount: rows.filter((row) => row.launchStatus === launchQualityStatuses.noSource).length,
    },
    rows,
  };
}

async function qualityReportDirectories(inputRoot, prefixes) {
  const entries = await readdir(inputRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(inputRoot, entry.name))
    .filter((dir) => {
      const basename = path.basename(dir);
      return prefixes.some((prefix) => basename.startsWith(prefix)) && !/aggregate/i.test(basename);
    });

  const directoriesWithStats = await Promise.all(
    directories.map(async (dir) => ({
      dir,
      mtimeMs: await directoryMtimeMs(dir),
    })),
  );

  return directoriesWithStats
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.dir.localeCompare(b.dir))
    .map((entry) => entry.dir);
}

async function directoryMtimeMs(dir) {
  try {
    return (await stat(path.join(dir, "quality-report.json"))).mtimeMs;
  } catch {
    return 0;
  }
}

async function readQualityRows(directories) {
  const rows = [];

  for (const directory of directories) {
    try {
      const report = JSON.parse(await readFile(path.join(directory, "quality-report.json"), "utf8"));
      rows.push(...(report.rows ?? []));
    } catch {
      // Missing or partial chunks are represented later as not-run targets.
    }
  }

  return rows;
}

function duplicateCoverageRow(target, sourceRow) {
  return {
    id: target.id,
    name: target.name,
    targetStatus: target.sourceStatus ?? "",
    origin: target.origin ?? "",
    type: target.type ?? "",
    brandKey: target.brandKey ?? "",
    duplicateOf: target.duplicateOf,
    launchSourceKey: target.launchSourceKey,
    sourceFamily: target.sourceFamily ?? "",
    parserProfile: target.parserProfile ?? "",
    sourceProfile: target.sourceProfile ?? "",
    coverageStatus: sourceRow?.coverageStatus ?? "",
    launchStatus: "deduped-to-source",
    remediationBucket: sourceRow?.remediationBucket ?? "deduped-to-source",
    issueCodes: sourceRow ? [`deduped-to:${sourceRow.id}`] : ["deduped-source-not-run"],
    itemCount: sourceRow?.itemCount ?? 0,
    previousItemCount: target.currentItems ?? 0,
    officialItemCount: sourceRow?.officialItemCount ?? 0,
    officialAllergenStatus: sourceRow?.officialAllergenStatus ?? target.officialStatus ?? "unknown",
    sourceOkCount: sourceRow?.sourceOkCount ?? 0,
    sourceFailedCount: sourceRow?.sourceFailedCount ?? 0,
    suspiciousRowCount: sourceRow?.suspiciousRowCount ?? 0,
    suspiciousRowExamples: [],
    itemRowsMissingEvidenceCount: sourceRow?.itemRowsMissingEvidenceCount ?? 0,
    officialRowsMissingEvidenceCount: sourceRow?.officialRowsMissingEvidenceCount ?? 0,
    failedUrls: sourceRow?.failedUrls ?? [],
    sourceUrls: sourceRow?.sourceUrls ?? [],
  };
}

function noSourceCoverageRow(target) {
  return syntheticTargetRow(target, {
    issueCodes: ["no-scrapeable-source-url"],
    launchStatus: launchQualityStatuses.noSource,
    remediationBucket: "source-discovery-needed",
    officialAllergenStatus: officialAllergenStatuses.notFound,
  });
}

function notRunCoverageRow(target) {
  return syntheticTargetRow(target, {
    issueCodes: ["scrape-ready-not-run"],
    launchStatus: "not-run",
    remediationBucket: "run-missing-chunk",
  });
}

function syntheticTargetRow(target, overrides) {
  return {
    id: target.id,
    name: target.name,
    targetStatus: target.sourceStatus ?? "",
    origin: target.origin ?? "",
    type: target.type ?? "",
    brandKey: target.brandKey ?? "",
    duplicateOf: target.duplicateOf ?? null,
    launchSourceKey: target.launchSourceKey ?? "",
    sourceFamily: target.sourceFamily ?? "",
    parserProfile: target.parserProfile ?? "",
    sourceProfile: target.sourceProfile ?? "",
    coverageStatus: "",
    itemCount: 0,
    previousItemCount: target.currentItems ?? 0,
    officialItemCount: 0,
    officialAllergenStatus: target.officialStatus ?? "unknown",
    sourceOkCount: 0,
    sourceFailedCount: 0,
    suspiciousRowCount: 0,
    suspiciousRowExamples: [],
    itemRowsMissingEvidenceCount: 0,
    officialRowsMissingEvidenceCount: 0,
    failedUrls: [],
    sourceUrls: [],
    ...overrides,
  };
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
  await runLaunchCoverageAggregate();
}
