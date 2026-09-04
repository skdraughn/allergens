#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.join(root, ".codex-tmp");
const repository = readJson(path.join(root, "src/data/generated/restaurants.generated.json"));
const manifest = readJson(path.join(root, "data/restaurant-verification/description-recovery/manifest.json"));
const overlay = JSON.parse(gunzipSync(fs.readFileSync(path.join(
  root,
  "data/restaurant-verification/description-recovery",
  manifest.activeOverlay,
))).toString("utf8"));
const reportPath = path.join(
  root,
  "data/restaurant-verification/reports/description-recovery-round-audit.json",
);

const roundDirectories = fs.readdirSync(tempRoot)
  .filter((name) => /^description-round25-\d{2}$/.test(name))
  .sort();
const allAuditDirectories = fs.readdirSync(tempRoot)
  .filter((name) => /^description-/.test(name))
  .filter((name) => fs.existsSync(path.join(tempRoot, name, "fresh")))
  .sort();

const rounds = [];
const latestFreshByRestaurant = new Map();
for (const directory of allAuditDirectories) {
  const freshDirectory = path.join(tempRoot, directory, "fresh");
  for (const file of fs.readdirSync(freshDirectory).filter((name) => name.endsWith(".json"))) {
    const fresh = readJson(path.join(freshDirectory, file));
    const existing = latestFreshByRestaurant.get(fresh.restaurantId);
    if (!existing || String(fresh.auditedAt ?? "") > String(existing.fresh.auditedAt ?? "")) {
      latestFreshByRestaurant.set(fresh.restaurantId, { directory, fresh });
    }
  }
}
for (const directory of roundDirectories) {
  const summaryFile = path.join(tempRoot, directory, "fresh-source-parity.json");
  if (!fs.existsSync(summaryFile)) continue;
  const value = readJson(summaryFile);
  rounds.push({
    round: directory.match(/(\d{2})$/)?.[1],
    restaurantCount: value.summary?.restaurantCount ?? value.rows?.length ?? 0,
    completedCount: value.summary?.completedCount ?? 0,
    classifications: value.summary?.classificationCounts ?? {},
    zeroItemCount: (value.rows ?? []).filter((row) => row.metrics?.freshItemCount === 0).length,
    sourceFailureRestaurantCount: (value.rows ?? []).filter((row) => row.metrics?.sourceFailureCount > 0).length,
  });
}

const repositoryById = new Map((repository.restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]));
const effectiveSourceFailures = [];
for (const [restaurantId, { directory, fresh }] of latestFreshByRestaurant) {
  const items = fresh.restaurant?.items ?? [];
  const status = fresh.restaurant?.sourceStatus ?? {};
  if (items.length > 0 && (status.ok ?? 0) > 0) continue;
  if ([
    "stale-location-no-current-menu",
    "reviewed-image-menu-no-additional-copy",
    "reviewed-menu-no-additional-description-copy",
    "reviewed-client-rendered-menu-no-retrievable-copy",
    "reviewed-source-unreachable",
  ].includes(status.descriptionRecoveryDisposition)) continue;
  const successfulReaderPageCount = (fresh.sources ?? []).filter(
    (source) => source.readerProxyFetched === true && source.ok === true,
  ).length;
  const currentItems = repositoryById.get(restaurantId)?.items ?? [];
  effectiveSourceFailures.push({
    restaurantId,
    latestAuditDirectory: directory,
    auditStatus: fresh.status,
    classification:
      successfulReaderPageCount > 0
        ? "reachable-no-description-copy"
        : (status.ok ?? 0) > 0
          ? "reachable-parser-empty"
          : "source-unreachable",
    successfulReaderPageCount,
    successfulSourceCount: status.ok ?? 0,
    failedSourceCount: status.failed ?? 0,
    currentItemCount: currentItems.length,
    currentDescriptionCount: currentItems.filter((item) => item.description).length,
  });
}
effectiveSourceFailures.sort((left, right) => left.restaurantId.localeCompare(right.restaurantId));

const overlayFailures = [];
let verifiedOverlayRecords = 0;
for (const record of overlay.records ?? []) {
  const restaurant = repositoryById.get(record.restaurantId);
  const item = (restaurant?.items ?? []).find(
    (candidate) => String(candidate.id ?? candidate.itemId ?? "") === record.itemId,
  );
  if (!item) {
    overlayFailures.push({ restaurantId: record.restaurantId, itemId: record.itemId, reason: "missing-target" });
    continue;
  }
  if (item.description !== record.description) {
    overlayFailures.push({ restaurantId: record.restaurantId, itemId: record.itemId, reason: "applied-value-mismatch" });
    continue;
  }
  const auditableSources = [
    ...(record.sources ?? []),
    ...(item.sourceUrls ?? []),
    ...(restaurant.sourceUrls ?? []),
    restaurant.guideUrl,
  ];
  if (!auditableSources.some((source) => /^https?:\/\//i.test(source))) {
    overlayFailures.push({ restaurantId: record.restaurantId, itemId: record.itemId, reason: "missing-http-provenance" });
    continue;
  }
  if (/(?:\.\.\.|…)$/.test(record.description.trim())) {
    overlayFailures.push({ restaurantId: record.restaurantId, itemId: record.itemId, reason: "truncated-capture" });
    continue;
  }
  verifiedOverlayRecords += 1;
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: {
    originalRoundCount: rounds.length,
    auditDirectoryCount: allAuditDirectories.length,
    uniqueRestaurantCount: latestFreshByRestaurant.size,
  },
  rounds,
  canonicalCatalog: {
    restaurantCount: repository.restaurants?.length ?? 0,
    itemCount: (repository.restaurants ?? []).reduce((sum, restaurant) => sum + (restaurant.items?.length ?? 0), 0),
    descriptionCount: (repository.restaurants ?? []).reduce(
      (sum, restaurant) => sum + (restaurant.items ?? []).filter((item) => item.description).length,
      0,
    ),
  },
  recoveryOverlay: {
    activeOverlay: manifest.activeOverlay,
    recordCount: overlay.records?.length ?? 0,
    verifiedRecordCount: verifiedOverlayRecords,
    failureCount: overlayFailures.length,
    failures: overlayFailures,
  },
  effectiveSourceFailures: {
    count: effectiveSourceFailures.length,
    rows: effectiveSourceFailures,
  },
  assertions: {
    allOverlayTargetsAppliedWithHttpProvenance: overlayFailures.length === 0,
    noTruncatedCaptureDescriptionsInOverlay: !overlayFailures.some((failure) => failure.reason === "truncated-capture"),
    noOutstandingEmptyOrUnreachableFreshAudits: effectiveSourceFailures.length === 0,
  },
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  reportPath: path.relative(root, reportPath),
  ...report.scope,
  catalogDescriptionCount: report.canonicalCatalog.descriptionCount,
  recoveryOverlay: report.recoveryOverlay,
  effectiveSourceFailureCount: report.effectiveSourceFailures.count,
  assertions: report.assertions,
}, null, 2));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
