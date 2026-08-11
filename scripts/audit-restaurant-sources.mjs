import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import {
  buildSourceAuditRows,
  officialAllergenStatuses,
  sourceFamilies,
} from "./restaurant-source-classification.mjs";
import { documentSchemaProfileMigrationReport } from "./pipeline/legacy-scrape-engine.mjs";
import { restaurantSources } from "./restaurant-sources.mjs";

const require = createRequire(import.meta.url);
const generatedRestaurants = require("../src/data/generated/restaurants.generated.json");

export function buildRestaurantSourceAuditRows(options = {}) {
  return buildSourceAuditRows({
    restaurantSources: options.restaurantSources ?? restaurantSources,
    repository: options.repository ?? generatedRestaurants,
    sourceResultsById: options.sourceResultsById ?? new Map(),
  });
}

export function summarizeRestaurantSourceAudit(rows) {
  const statusCounts = countBy(rows, (row) => row.officialAllergenStatus);
  const familyCounts = countBy(rows, (row) => row.sourceFamily);
  const profileCounts = countBy(rows, (row) => row.parserProfile);
  const officialExtractedByProfile = countBy(
    rows.filter((row) => row.officialAllergenStatus === officialAllergenStatuses.extracted),
    (row) => row.parserProfile,
  );
  const configuredUrlWarningCounts = countBy(
    rows.flatMap((row) =>
      String(row.configuredUrlWarnings ?? "")
        .split(" | ")
        .filter(Boolean)
        .map((warning) => ({ warning: warning.split(":")[0] })),
    ),
    (row) => row.warning,
  );

  return {
    total: rows.length,
    sourceFamilies: familyCounts,
    parserProfiles: profileCounts,
    officialAllergenStatuses: statusCounts,
    officialExtractedByProfile,
    configuredUrlWarningCounts,
    extractedOfficial: statusCounts[officialAllergenStatuses.extracted] ?? 0,
    manualReview: familyCounts[sourceFamilies.manualReview] ?? 0,
    documentSchemaProfileMigration: documentSchemaProfileMigrationReport,
  };
}

export function auditRowsToCsv(rows) {
  const headers = [
    "id",
    "name",
    "brandKey",
    "sourceFamily",
    "parserProfile",
    "officialAllergenStatus",
    "remediationBucket",
    "domain",
    "type",
    "menuItemCount",
    "officialItemCount",
    "configuredMenuUrlCount",
    "configuredAllergenUrlCount",
    "configuredApiUrlCount",
    "configuredUrlRoles",
    "configuredUrlWarnings",
    "nonFoodDocumentSuspected",
    "extractedFoodItemCount",
    "discardedItemCount",
    "failedUrlCount",
    "failedUrls",
    "discoveredDocumentCount",
    "discoveredDocuments",
    "sourceUrls",
  ];

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const sourceResultsById = args["run-input"]
    ? await readSourceResultsByRestaurantId(args["run-input"])
    : new Map();
  const rows = buildRestaurantSourceAuditRows({ sourceResultsById });
  const summary = summarizeRestaurantSourceAudit(rows);

  if (args["json-output"]) {
    await writeFile(args["json-output"], `${JSON.stringify({ summary, rows }, null, 2)}\n`);
  }

  if (args["csv-output"]) {
    await writeFile(args["csv-output"], `${auditRowsToCsv(rows)}\n`);
  }

  console.log(JSON.stringify(summary, null, 2));
}

async function readSourceResultsByRestaurantId(runPath) {
  const run = JSON.parse(await readFile(runPath, "utf8"));
  const byId = new Map();

  for (const source of run.sources ?? []) {
    const restaurantId = source.restaurantId;

    if (!restaurantId) {
      continue;
    }

    const entries = byId.get(restaurantId) ?? [];
    entries.push(source);
    byId.set(restaurantId, entries);
  }

  return byId;
}

function countBy(rows, keyFn) {
  return rows.reduce((counts, row) => {
    const key = keyFn(row) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((arg) => {
      const [rawKey, ...rest] = arg.replace(/^--/, "").split("=");
      return [rawKey, rest.join("=") || true];
    }),
  );
}
