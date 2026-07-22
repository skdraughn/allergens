#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultRoot = "data/restaurant-verification";
const terminalStatuses = new Set(["codex_verified", "blocked_unverifiable"]);

export async function generateLegacyMigrationInventory({
  root = defaultRoot,
  now = new Date().toISOString(),
  write = true,
} = {}) {
  const verificationRoot = path.resolve(root);
  const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
  const [ledgerBuffer, planBuffer] = await Promise.all([
    readFile(ledgerPath),
    readFile(path.join(repositoryRoot, "docs/restaurant-verification-plan.md")),
  ]);
  const rows = parseJsonLines(ledgerBuffer.toString("utf8"));
  const legacyRows = rows.filter((row) => terminalStatuses.has(row.status) && (row.verificationContractVersion ?? 1) < 2);
  const records = [];
  for (const row of legacyRows) records.push(await inspectLegacyRecord({ verificationRoot, row }));

  const inventory = {
    schemaVersion: 1,
    generatedAt: now,
    policy: {
      targetContractVersion: 2,
      mutatesCanonicalLedger: false,
      automaticTerminalUpgradeAllowed: false,
      requiredAction: "v2_full_re_adjudication",
      reason: "Legacy terminal evidence may be reused only after a new hashed Luna/Terra/Sol coordinator chain independently validates it.",
    },
    inputs: {
      ledgerPath: path.relative(repositoryRoot, ledgerPath),
      ledgerSha256: sha256(ledgerBuffer),
      planPath: "docs/restaurant-verification-plan.md",
      planSha256: sha256(planBuffer),
    },
    summary: summarize(records, rows.length),
    records,
  };
  inventory.inventoryFingerprint = sha256(JSON.stringify({
    inputs: inventory.inputs,
    records: records.map((record) => ({
      restaurantId: record.restaurantId,
      originalTerminalStatus: record.originalTerminalStatus,
      artifactHashes: record.artifactHashes,
      gapCodes: record.gapCodes,
    })),
  }));

  if (write) {
    const outputRoot = path.join(verificationRoot, "legacy-migration");
    await writeAtomic(path.join(outputRoot, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
    await writeAtomic(path.join(outputRoot, "inventory.md"), renderMarkdown(inventory));
  }
  return inventory;
}

async function inspectLegacyRecord({ verificationRoot, row }) {
  const filePaths = {
    dossier: path.join(verificationRoot, row.paths.dossier),
    evidence: path.join(verificationRoot, row.paths.evidence),
    itemChecks: path.join(verificationRoot, row.paths.itemChecks),
  };
  const [dossierBuffer, evidenceBuffer, itemChecksBuffer] = await Promise.all([
    readFile(filePaths.dossier),
    readFile(filePaths.evidence),
    readFile(filePaths.itemChecks),
  ]);
  const dossier = JSON.parse(dossierBuffer.toString("utf8"));
  const evidence = JSON.parse(evidenceBuffer.toString("utf8"));
  const itemChecks = parseJsonLines(itemChecksBuffer.toString("utf8"));
  const evidenceIds = new Set((evidence.sources ?? []).map((source) => source.id));
  const unresolvedItemEvidenceIds = [...new Set(itemChecks.flatMap((item) => [
    ...(item.sourceEvidenceIds ?? []),
    ...(item.allergenSourceEvidenceIds ?? []),
  ]).filter((id) => !evidenceIds.has(id)))].sort();
  const sourceIntegrity = await Promise.all((evidence.sources ?? []).map((source) => inspectSource({ verificationRoot, source })));
  const gapCodes = ["contract_v1", "missing_v2_hashed_worker_handoff", "missing_v2_sol_coordinator_adjudication"];
  if (!dossier.currentCatalog) gapCodes.push("missing_complete_current_catalog");
  if (!dossier.adjudication) gapCodes.push("missing_structured_coordinator_adjudication");
  if (!dossier.workerHandoff) gapCodes.push("missing_structured_worker_handoff");
  if (itemChecks.some((item) => item.disposition === "pending" || item.allergenVerdict === "pending")) gapCodes.push("pending_frozen_item_checks");
  if (itemChecks.some((item) => !Array.isArray(item.adjudicatedContainsAllergens) || !Array.isArray(item.adjudicatedMayContainAllergens))) {
    gapCodes.push("missing_structured_item_allergen_arrays");
  }
  if (itemChecks.some((item) => !Object.hasOwn(item, "adjudicatedAllergenSourceType") || !Object.hasOwn(item, "adjudicatedAllergenAuthorityTier"))) {
    gapCodes.push("missing_structured_item_allergen_provenance");
  }
  if (sourceIntegrity.some((source) => source.artifactStatus === "missing")) gapCodes.push("retained_evidence_artifact_missing");
  if (sourceIntegrity.some((source) => source.artifactStatus === "hash_mismatch")) gapCodes.push("retained_evidence_artifact_hash_mismatch");
  if ((evidence.sources ?? []).length === 0) gapCodes.push("no_legacy_evidence_sources");
  if (unresolvedItemEvidenceIds.length > 0) gapCodes.push("unresolved_legacy_item_evidence_references");

  return {
    restaurantId: row.restaurantId,
    name: row.name,
    ledgerOrder: row.ledgerOrder ?? null,
    originalTerminalStatus: row.status,
    originalCompletedAt: row.completedAt ?? null,
    originalContractVersion: row.verificationContractVersion ?? 1,
    baseline: {
      itemCount: row.baseline.itemCount,
      itemFingerprint: row.baseline.itemFingerprint,
    },
    artifactHashes: {
      dossier: sha256(dossierBuffer),
      evidence: sha256(evidenceBuffer),
      itemChecks: sha256(itemChecksBuffer),
    },
    retainedEvidence: {
      sourceCount: sourceIntegrity.length,
      reproducibleSourceCount: sourceIntegrity.filter((source) => source.reproducible).length,
      artifactVerifiedCount: sourceIntegrity.filter((source) => source.artifactStatus === "verified").length,
      artifactMissingCount: sourceIntegrity.filter((source) => source.artifactStatus === "missing").length,
      artifactHashMismatchCount: sourceIntegrity.filter((source) => source.artifactStatus === "hash_mismatch").length,
      sources: sourceIntegrity,
    },
    frozenChecks: {
      count: itemChecks.length,
      pendingCount: itemChecks.filter((item) => item.disposition === "pending" || item.allergenVerdict === "pending").length,
      structuredAllergenArrayCount: itemChecks.filter((item) =>
        Array.isArray(item.adjudicatedContainsAllergens) && Array.isArray(item.adjudicatedMayContainAllergens)).length,
      structuredAllergenProvenanceCount: itemChecks.filter((item) =>
        Object.hasOwn(item, "adjudicatedAllergenSourceType") && Object.hasOwn(item, "adjudicatedAllergenAuthorityTier")).length,
      unresolvedEvidenceReferenceIds: unresolvedItemEvidenceIds,
    },
    gapCodes: [...new Set(gapCodes)].sort(),
    requiredAction: "v2_full_re_adjudication",
    eligibleForAutomaticTerminalUpgrade: false,
  };
}

async function inspectSource({ verificationRoot, source }) {
  const anchorPresent = Boolean(
    source.sha256 || source.excerpt || source.artifactPath || (source.rowIdentifiers ?? []).length > 0,
  );
  if (!source.artifactPath) {
    return { sourceId: source.id, authorityTier: source.authorityTier, reproducible: anchorPresent, artifactStatus: "not_retained" };
  }
  const artifactPath = path.join(verificationRoot, source.artifactPath);
  try {
    const contents = await readFile(artifactPath);
    const actualHash = sha256(contents);
    return {
      sourceId: source.id,
      authorityTier: source.authorityTier,
      reproducible: anchorPresent,
      artifactStatus: source.sha256 && source.sha256 !== actualHash ? "hash_mismatch" : "verified",
      artifactPath: source.artifactPath,
      expectedSha256: source.sha256 ?? null,
      actualSha256: actualHash,
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      sourceId: source.id,
      authorityTier: source.authorityTier,
      reproducible: anchorPresent,
      artifactStatus: "missing",
      artifactPath: source.artifactPath,
      expectedSha256: source.sha256 ?? null,
      actualSha256: null,
    };
  }
}

function summarize(records, restaurantCount) {
  const gapCounts = {};
  for (const record of records) for (const gap of record.gapCodes) gapCounts[gap] = (gapCounts[gap] ?? 0) + 1;
  return {
    baselineRestaurantCount: restaurantCount,
    legacyTerminalCount: records.length,
    automaticTerminalUpgradeCount: 0,
    requiresFullReadjudicationCount: records.length,
    retainedEvidenceSourceCount: records.reduce((total, record) => total + record.retainedEvidence.sourceCount, 0),
    verifiedRetainedArtifactCount: records.reduce((total, record) => total + record.retainedEvidence.artifactVerifiedCount, 0),
    missingRetainedArtifactCount: records.reduce((total, record) => total + record.retainedEvidence.artifactMissingCount, 0),
    mismatchedRetainedArtifactCount: records.reduce((total, record) => total + record.retainedEvidence.artifactHashMismatchCount, 0),
    gapCounts,
  };
}

function renderMarkdown(inventory) {
  return [
    "# Legacy Restaurant Verification Migration Inventory",
    "",
    `Generated: ${inventory.generatedAt}`,
    "",
    `Legacy terminal records: ${inventory.summary.legacyTerminalCount}`,
    "",
    "Automatic terminal upgrades: 0",
    "",
    "Every record requires a complete contract-v2 worker chain and explicit Sol-medium coordinator re-adjudication. Existing evidence is retained only as candidate evidence.",
    "",
    "| Restaurant | Prior status | Items | Evidence | Verified artifacts | Gaps |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    ...inventory.records.map((record) =>
      `| ${record.name} (\`${record.restaurantId}\`) | ${record.originalTerminalStatus} | ${record.frozenChecks.count} | ${record.retainedEvidence.sourceCount} | ${record.retainedEvidence.artifactVerifiedCount} | ${record.gapCodes.join(", ")} |`),
    "",
  ].join("\n");
}

function parseJsonLines(contents) {
  return contents.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, filePath);
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((token) => {
    const [key, ...rest] = token.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }));
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const options = parseArgs(process.argv.slice(2));
  generateLegacyMigrationInventory({ root: options.root ?? defaultRoot })
    .then((inventory) => console.log(JSON.stringify({
      legacyTerminalCount: inventory.summary.legacyTerminalCount,
      automaticTerminalUpgradeCount: inventory.summary.automaticTerminalUpgradeCount,
      inventoryFingerprint: inventory.inventoryFingerprint,
      output: "legacy-migration/inventory.json",
    }, null, 2)))
    .catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
