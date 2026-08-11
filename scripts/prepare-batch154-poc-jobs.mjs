#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const batchId = "poc-batch-154-2026-08-07";
const runRoot = `data/restaurant-verification/worker-runs/${batchId}`;
const ids = ["osm-green-olive-buffet-7765743294", "green-pig-bistro-arlington-va-dc-metro", "osm-greenfare-12246325393"];

for (const restaurantId of ids) {
  const jobPath = `${runRoot}/jobs/${restaurantId}.json`;
  const source = JSON.parse(await readFile(jobPath, "utf8"));
  if (source.batchId === batchId) continue;
  const restaurant = source.restaurant;
  const job = {
    schemaVersion: 1,
    batchId,
    restaurantId,
    name: restaurant.name,
    locationId: restaurant.locationId,
    domain: restaurant.domain,
    baselineItemCount: restaurant.baselineItemCount,
    baselineFingerprint: restaurant.baselineItemFingerprint,
    ledgerStatus: "in_progress",
    dossierPath: source.inputs.existingDossierPath,
    evidencePath: source.inputs.existingEvidencePath,
    itemChecksPath: source.inputs.itemChecksPath,
    resultPath: `${runRoot}/results/${restaurantId}.json`,
    requiredMatrixSearches: ["official_site", "official_documents", "linked_vendor", "targeted_web_search"],
  };
  await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`);
}
console.log(`Prepared ${ids.length} Batch 154 POC job packets.`);
