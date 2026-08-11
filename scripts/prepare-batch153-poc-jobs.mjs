#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const batchId = "poc-batch-153-2026-08-07";
const runRoot = `data/restaurant-verification/worker-runs/${batchId}`;
const ids = ["greek-deli-dc", "osm-greek-unique-12234989460", "green-almond-pantry-dc"];

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

console.log(`Prepared ${ids.length} Batch 153 POC job packets.`);
