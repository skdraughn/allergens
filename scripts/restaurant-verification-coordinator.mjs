#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateScoutRisk } from "./restaurant-verification-risk-gates.mjs";
import {
  claimRestaurant,
  completeRestaurantVerification,
  recordRestaurantVerification,
  verificationModel,
} from "./restaurant-verification-ledger.mjs";
import {
  lunaModel, routeWorkerResult, solModel, terraModel,
  validateScoutResult, validateSolReview, validateTerraResult, workerWorkflowSchemaVersion,
} from "./restaurant-verification-workers.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultRoot = "data/restaurant-verification";

export async function prepareCoordinatorHandoff({ root = defaultRoot, runId, restaurantId, now = new Date().toISOString(), write = true } = {}) {
  assertSafe(runId, "runId");
  assertSafe(restaurantId, "restaurantId");
  const verificationRoot = path.resolve(root);
  const runRoot = path.join(verificationRoot, "worker-runs", runId);
  const manifest = await readJson(path.join(runRoot, "manifest.json"));
  if (manifest.schemaVersion !== workerWorkflowSchemaVersion) throw new Error("Coordinator handoff requires a v2 worker run.");
  assertModel(manifest.models?.scout, lunaModel, "manifest Luna");
  assertModel(manifest.models?.verifier, terraModel, "manifest Terra");
  assertModel(manifest.models?.reviewer, solModel, "manifest Sol");
  const entry = manifest.jobs.find((job) => job.restaurantId === restaurantId);
  if (!entry) throw new Error(`Run ${runId} does not contain ${restaurantId}.`);
  if (entry.status !== "awaiting_coordinator") throw new Error(`${restaurantId} is not ready for coordinator handoff (${entry.status}).`);
  const files = {
    job: path.join(runRoot, entry.jobPath), scout_result: path.join(runRoot, entry.scoutResultPath),
    scout_route: path.join(runRoot, entry.scoutRoutePath), terra_packet: path.join(runRoot, entry.verifierPacketPath),
    terra_result: path.join(runRoot, entry.resultPath), terra_route: path.join(runRoot, entry.routePath),
    sol_packet: path.join(runRoot, "review-packets", `${restaurantId}.json`),
    sol_review: path.join(runRoot, entry.reviewPath),
    sol_validation: entry.reviewValidationPath ? path.join(runRoot, entry.reviewValidationPath) : null,
  };
  const [job, scout, scoutRoute, verifierPacket, terra, terraRoute] = await Promise.all(
    ["job", "scout_result", "scout_route", "terra_packet", "terra_result", "terra_route"].map((key) => readJson(files[key])),
  );
  await assertSuccessfulAttempt({ entry, stage: "luna", canonicalResultPath: files.scout_result, verificationRoot });
  await assertSuccessfulAttempt({ entry, stage: "terra", canonicalResultPath: files.terra_result, verificationRoot });
  if (job.runId !== runId || job.restaurant.restaurantId !== restaurantId) throw new Error("Worker job provenance does not match the requested handoff.");
  const baselineItems = await readJsonLines(path.resolve(repositoryRoot, job.inputs.itemChecksPath));
  const scoutValidation = validateScoutResult({ job, result: scout, baselineItems });
  const scoutRisk = evaluateScoutRisk({ job, result: scout, validation: scoutValidation });
  if (!scoutValidation.valid || scoutRisk.retryRequired) throw new Error(`Scout result is invalid: ${scoutValidation.errors.join("; ")}`);
  if (JSON.stringify(scoutRisk) !== JSON.stringify(scoutRoute.risk)) {
    throw new Error("Stored scout risk does not match deterministic recomputation.");
  }
  if (JSON.stringify(scoutRisk) !== JSON.stringify(verifierPacket.deterministicRisk)) {
    throw new Error("Terra packet risk does not match deterministic recomputation.");
  }
  if (scoutRoute.destination !== "terra_low" || scoutRoute.validation?.valid !== true) throw new Error("Stored scout route is not a validated Terra handoff.");
  if (verifierPacket.scout?.resultHash !== sha256(JSON.stringify(scout))) throw new Error("Verifier packet scout hash does not match the scout result.");
  const terraValidation = validateTerraResult({ job, result: terra, baselineItems, verifierPacket });
  const expectedRoute = routeWorkerResult({ result: terra, validation: terraValidation, deterministicRisk: verifierPacket.deterministicRisk });
  if (!terraValidation.valid) throw new Error(`Terra result is invalid: ${terraValidation.errors.join("; ")}`);
  if (terraRoute.destination !== expectedRoute.destination || terraRoute.effectiveOutcome !== expectedRoute.effectiveOutcome) {
    throw new Error("Stored Terra route does not match deterministic rerouting.");
  }
  const solRequired = terraRoute.destination === "sol_medium";
  let solReview = null;
  let solValidation = null;
  if (solRequired) {
    [solReview, solValidation] = await Promise.all([readJson(files.sol_review), readJson(files.sol_validation)]);
    if (!validateSolReview({ job, route: terraRoute, review: solReview }).valid || solValidation.valid !== true) {
      throw new Error("Sol review is not independently validated for coordinator handoff.");
    }
    await assertSuccessfulAttempt({ entry, stage: "sol", canonicalResultPath: files.sol_review, verificationRoot });
  }
  const requiredKinds = ["job", "scout_result", "scout_route", "terra_packet", "terra_result", "terra_route",
    ...(solRequired ? ["sol_packet", "sol_review", "sol_validation"] : [])];
  const artifacts = await Promise.all(requiredKinds.map(async (kind) => ({
    kind, path: path.relative(verificationRoot, files[kind]), sha256: sha256(await readFile(files[kind])),
  })));
  const requiresCoordinatorGold = solRequired || terraValidation.warnings.length > 0 ||
    (terra.additionalMenuSurfaces ?? []).length > 0 || (terra.additionalCurrentProducts ?? []).length > 0;
  const packet = {
    schemaVersion: 1, runId, restaurantId, preparedAt: now,
    provenance: { models: { scout: lunaModel, verifier: terraModel, reviewer: solRequired ? solModel : null }, artifacts, artifactIndexHash: sha256(JSON.stringify(artifacts)) },
    validation: { scout: scoutValidation, terra: terraValidation, sol: solRequired ? solValidation : null },
    routing: { scoutDestination: scoutRoute.destination, terraDestination: terraRoute.destination, effectiveOutcome: terraRoute.effectiveOutcome, solRequired, solRecommendation: solReview?.recommendation ?? null },
    lineageInventory: buildLineageInventory({ scout, terra, solReview }),
    coordinator: {
      requiresCoordinatorGold, terminalDecisionAllowed: false,
      reason: requiresCoordinatorGold
        ? "A Sol-routed or expanded result requires structured coordinator gold/lineage adjudication."
        : "The candidate is structurally clean but still requires an explicit Sol-medium coordinator terminal adjudication.",
    },
    ledgerCandidate: {
      evidence: mergeWorkerEvidence(scout.sources, terra.sources),
      itemChecks: flattenItemGroups(terra),
      currentCatalog: buildCurrentCatalogCandidate({ scout, terra, baselineItemCount: job.restaurant.baselineItemCount }),
      workerHandoff: {
        runId, restaurantId, preparedAt: now, routeDestination: terraRoute.destination, solRequired, artifacts,
        notes: ["Prepared deterministically; terminalDecisionAllowed remains false until coordinator adjudication."],
      },
    },
  };
  if (write) await writeJsonAtomic(path.join(runRoot, "coordinator-packets", `${restaurantId}.json`), packet);
  return packet;
}

export async function ingestCoordinatorDecision({ root = defaultRoot, runId, restaurantId, decisionPath, now = new Date().toISOString() } = {}) {
  const packet = await prepareCoordinatorHandoff({ root, runId, restaurantId, now, write: true });
  const absoluteDecisionPath = path.resolve(decisionPath);
  const decisionBuffer = await readFile(absoluteDecisionPath);
  const decision = JSON.parse(decisionBuffer.toString("utf8"));
  if (decision.schemaVersion !== 1 || decision.runId !== runId || decision.restaurantId !== restaurantId) {
    throw new Error("Coordinator decision provenance does not match the worker handoff.");
  }
  assertModel(decision.model, verificationModel, "coordinator decision");
  if (decision.packetArtifactIndexHash !== packet.provenance.artifactIndexHash) {
    throw new Error("Coordinator decision targets a stale worker artifact index.");
  }
  if (!decision.rationale || !decision.decidedAt) throw new Error("Coordinator decision requires time and rationale.");
  if (!decision.currentCatalog || !decision.checks || !decision.goldLineage) {
    throw new Error("Coordinator decision requires checks, a final current catalog, and gold lineage.");
  }
  validateGoldLineage(decision.goldLineage, decision.currentCatalog);
  validateGoldMappings(decision.goldLineage, packet.lineageInventory);
  const verificationRoot = path.resolve(root);
  const runRoot = path.join(verificationRoot, "worker-runs", runId);
  const goldPath = path.join(runRoot, "coordinator-gold", `${restaurantId}.json`);
  await writeJsonAtomic(goldPath, decision.goldLineage);
  const packetPath = path.join(runRoot, "coordinator-packets", `${restaurantId}.json`);
  const artifactHashes = [
    { path: path.relative(verificationRoot, packetPath), sha256: sha256(await readFile(packetPath)) },
    { path: path.relative(verificationRoot, goldPath), sha256: sha256(await readFile(goldPath)) },
    { path: path.relative(repositoryRoot, absoluteDecisionPath), sha256: sha256(decisionBuffer) },
  ];
  const evidence = mergeByIdStrict(packet.ledgerCandidate.evidence, decision.evidence ?? []);
  const itemChecks = mergeByAuditKey(packet.ledgerCandidate.itemChecks, decision.itemChecks ?? []);
  await claimRestaurant({ restaurantId, root, now });
  const terminalRecommendation = new Set(["codex_verified", "blocked_unverifiable"]).has(decision.recommendation);
  const nonterminalStatus = {
    discrepancy_found: "discrepancy_found",
    repair_required: "repair_in_progress",
    needs_more_research: "recheck_required",
  }[decision.recommendation];
  if (!terminalRecommendation && !nonterminalStatus) throw new Error(`Unsupported coordinator recommendation: ${decision.recommendation}.`);
  const record = {
    checks: decision.checks,
    currentCatalog: decision.currentCatalog,
    adjudication: {
      type: "coordinator",
      runId,
      decidedAt: decision.decidedAt,
      recommendation: decision.recommendation,
      model: decision.model,
      rationale: decision.rationale,
      artifactHashes,
    },
    workerHandoff: packet.ledgerCandidate.workerHandoff,
    evidence,
    itemChecks,
    sourceAttempts: decision.sourceAttempts ?? [],
    findings: decision.findings ?? [],
    repairs: decision.repairs ?? [],
    notes: decision.notes ?? [],
    ...(terminalRecommendation ? {} : { status: nonterminalStatus }),
  };
  await recordRestaurantVerification({ restaurantId, input: record, root, now });
  if (terminalRecommendation) {
    return completeRestaurantVerification({ restaurantId, status: decision.recommendation, root, now });
  }
  return { terminal: false, recommendation: decision.recommendation, restaurantId };
}

export async function buildCoordinatorDecisionDraft({ root = defaultRoot, runId, restaurantId, now = new Date().toISOString(), write = true } = {}) {
  const packet = await prepareCoordinatorHandoff({ root, runId, restaurantId, now, write: true });
  const runRoot = path.resolve(root, "worker-runs", runId);
  const [manifest, solReview] = await Promise.all([
    readJson(path.join(runRoot, "manifest.json")),
    readJson(path.join(runRoot, "reviews", `${restaurantId}.json`)),
  ]);
  const entry = manifest.jobs.find((job) => job.restaurantId === restaurantId);
  if (!entry) throw new Error(`Run ${runId} does not contain ${restaurantId}.`);
  const terra = await readJson(path.join(runRoot, entry.resultPath));
  const decision = buildCoordinatorDecisionFromArtifacts({ packet, solReview, terra, decidedAt: now });
  const decisionPath = path.join(runRoot, "coordinator-decisions", `${restaurantId}.json`);
  if (write) await writeJsonAtomic(decisionPath, decision);
  return { decision, decisionPath };
}

export function buildCoordinatorDecisionFromArtifacts({ packet, solReview, terra, decidedAt }) {
  const recommendation = new Set(["repair_required", "discrepancy_found", "needs_more_research"])
    .has(solReview.recommendation)
    ? solReview.recommendation
    : "needs_more_research";
  const currentCatalog = buildCoordinatorCatalogDraft(packet.ledgerCandidate.currentCatalog, terra);
  const inventory = packet.lineageInventory;
  const evidence = packet.ledgerCandidate.evidence;
  const goldLineage = {
    finalSources: evidence.map((source) => ({
      sourceId: source.id,
      canonicalAuthorityTier: source.authorityTier,
      stageEvidenceIds: {
        luna: inventory.luna.evidenceIds.includes(source.id) ? [source.id] : [],
        terra: inventory.terra.evidenceIds.includes(source.id) ? [source.id] : [],
        sol: inventory.sol.evidenceIds.includes(source.url) ? [source.url] : [],
      },
    })),
    finalSurfaces: currentCatalog.surfaces.map((surface) => ({
      surfaceId: surface.surfaceId,
      stageIds: {
        luna: inventory.luna.surfaceIds.includes(surface.surfaceId) ? [surface.surfaceId] : [],
        terra: inventory.terra.surfaceIds.includes(surface.surfaceId) ? [surface.surfaceId] : [],
      },
    })),
    finalProducts: currentCatalog.products.map((product) => ({
      productId: product.currentProductKey,
      coordinatorReviewed: true,
      stageKeys: {
        luna: inventory.luna.productKeys.includes(product.currentProductKey) ? [product.currentProductKey] : [],
        terra: inventory.terra.productKeys.includes(product.currentProductKey) ? [product.currentProductKey] : [],
      },
    })),
    findings: [
      ...(solReview.confirmedFindings ?? []).map((finding) => goldFinding("confirmed", finding)),
      ...(solReview.rejectedFindings ?? []).map((finding) => goldFinding("rejected", finding)),
    ],
  };
  validateGoldLineage(goldLineage, currentCatalog);
  validateGoldMappings(goldLineage, inventory);
  const authorityOrder = ["restaurant_issued", "restaurant_linked_vendor", "ingredient_intelligence", "third_party"];
  const highestAuthorityTier = authorityOrder.find((tier) => evidence.some((source) => source.authorityTier === tier)) ?? null;
  const blockedDowngrade = solReview.recommendation === "blocked_unverifiable"
    ? " Sol recommended blocked_unverifiable, but the coordinator draft remains nonterminal until exhaustive blocked-state gates are independently satisfied."
    : "";
  return {
    schemaVersion: 1,
    runId: packet.runId,
    restaurantId: packet.restaurantId,
    packetArtifactIndexHash: packet.provenance.artifactIndexHash,
    model: verificationModel,
    decidedAt,
    recommendation,
    rationale: `${solReview.summary}${blockedDowngrade}`,
    checks: {
      menu: {
        verdict: "not_reviewed",
        reviewedItemCount: packet.ledgerCandidate.itemChecks.length,
        sourceItemCount: currentCatalog.currentProductCount,
        notes: ["Sol-medium adjudication completed; terminal current-scope review remains open."],
      },
      allergenSource: {
        verdict: "not_reviewed",
        highestAuthorityTier,
        notes: ["Authority and allergen semantics require the repairs or research named by the Sol review."],
      },
      extraction: {
        verdict: "not_reviewed",
        parserReviewed: false,
        semanticsVerified: false,
        notes: ["No terminal extraction claim is made by this nonterminal coordinator decision."],
      },
    },
    currentCatalog,
    goldLineage,
    evidence: buildCoordinatorEvidencePatches(evidence),
    sourceAttempts: buildCoordinatorSourceAttempts(terra, decidedAt),
    repairs: [],
    notes: solReview.coordinatorActions ?? [],
  };
}

function buildCoordinatorEvidencePatches(evidence) {
  return evidence
    .filter((source) => !source.sha256 && !source.artifactPath && !source.excerpt && !(source.rowIdentifiers ?? []).length)
    .map((source) => ({
      ...source,
      rowIdentifiers: [source.url],
      notes: [
        ...(source.notes ?? []),
        "Coordinator retained the exact source URL as the reproducibility locator for an otherwise unanchored worker source.",
      ],
    }));
}

function buildCoordinatorSourceAttempts(terra, decidedAt) {
  const sources = terra.sources ?? [];
  return (terra.sourceAttempts ?? []).map((attempt, index) => ({
    id: `terra-source-attempt-${String(index + 1).padStart(2, "0")}-${attempt.kind}`,
    kind: attempt.kind,
    url: attempt.url ?? null,
    attemptedAt: sources.find((source) => source.url === attempt.url)?.retrievedAt ?? decidedAt,
    outcome: attempt.status,
    status: attempt.status,
    evidenceIds: sources.filter((source) => attempt.url && source.url === attempt.url).map((source) => source.evidenceId),
    scopeImpact: attempt.notes ?? null,
    notes: [attempt.notes].filter(Boolean),
  }));
}

function buildCoordinatorCatalogDraft(candidate, terra) {
  const catalog = structuredClone(candidate);
  const surfaces = new Map((catalog.surfaces ?? []).map((surface) => [surface.surfaceId, surface]));
  for (const surface of terra.additionalMenuSurfaces ?? []) {
    if (surfaces.has(surface.surfaceId)) continue;
    surfaces.set(surface.surfaceId, {
      surfaceId: surface.surfaceId,
      title: surface.title,
      url: surface.url,
      current: surface.current,
      scopeStatus: surface.scopeStatus,
      verified: false,
      evidenceIds: surface.sourceEvidenceIds ?? [],
      notes: [surface.notes].filter(Boolean),
    });
  }
  const products = new Map((catalog.products ?? []).map((product) => [product.currentProductKey, {
    ...product,
    coordinatorReviewed: true,
  }]));
  for (const product of terra.additionalCurrentProducts ?? []) {
    if (products.has(product.currentProductKey)) continue;
    products.set(product.currentProductKey, {
      currentProductKey: product.currentProductKey,
      name: product.name,
      category: product.category,
      presentationIds: product.presentationIds ?? [],
      matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys ?? [],
      sourceEvidenceIds: product.sourceEvidenceIds ?? [],
      containsAllergens: product.containsAllergens ?? [],
      mayContainAllergens: product.mayContainAllergens ?? [],
      allergenSourceType: product.allergenSourceType ?? "unavailable",
      allergenAuthorityTier: product.allergenAuthorityTier ?? null,
      allergenSourceEvidenceIds: product.allergenSourceEvidenceIds ?? [],
      coordinatorReviewed: true,
      notes: [product.notes].filter(Boolean),
    });
  }
  catalog.status = "not_reviewed";
  catalog.surfaces = [...surfaces.values()];
  catalog.products = [...products.values()];
  catalog.currentProductCount = catalog.products.length;
  catalog.reconciledCurrentProductCount = catalog.products.length;
  catalog.notes = [...(catalog.notes ?? []), "Nonterminal coordinator catalog draft; repairs or additional research remain open."];
  return catalog;
}

function goldFinding(kind, text) {
  return {
    findingId: `sol-${kind}-${sha256(text).slice(0, 16)}`,
    material: kind === "confirmed",
    firstDiscoveredStage: "sol",
    stageFindingIds: { luna: [], terra: [], sol: [text] },
    expectedGateIds: [],
    resolution: kind === "confirmed"
      ? "Accepted by the Sol-medium coordinator review."
      : "Rejected by the Sol-medium coordinator review.",
  };
}

const goldAuthorityTiers = new Set([
  "restaurant_issued",
  "restaurant_linked_vendor",
  "third_party",
  "ingredient_intelligence",
]);
const discoveryStages = new Set(["luna", "terra", "sol", "coordinator"]);

export function validateGoldLineage(gold, currentCatalog) {
  if (!gold || typeof gold !== "object" || Array.isArray(gold)) {
    throw new Error("Coordinator gold lineage must be an object.");
  }
  for (const field of ["finalSources", "finalSurfaces", "finalProducts", "findings"]) {
    if (!Array.isArray(gold[field])) throw new Error(`Coordinator gold lineage requires ${field}.`);
  }
  assertUniqueObjects(gold.finalSources, "sourceId", "coordinator gold source");
  assertUniqueObjects(gold.finalSurfaces, "surfaceId", "coordinator gold surface");
  assertUniqueObjects(gold.finalProducts, "productId", "coordinator gold product");
  assertUniqueObjects(gold.findings, "findingId", "coordinator gold finding");

  for (const source of gold.finalSources) {
    if (!goldAuthorityTiers.has(source.canonicalAuthorityTier)) {
      throw new Error(`Coordinator gold source ${source.sourceId} has an invalid canonical authority tier.`);
    }
    assertStageMappings(source.stageEvidenceIds, ["luna", "terra", "sol"], `source ${source.sourceId} evidence`);
  }
  for (const surface of gold.finalSurfaces) {
    assertStageMappings(surface.stageIds, ["luna", "terra"], `surface ${surface.surfaceId}`);
  }
  for (const product of gold.finalProducts) {
    if (product.coordinatorReviewed !== true) {
      throw new Error("Every coordinator gold product must be explicitly reviewed.");
    }
    assertStageMappings(product.stageKeys, ["luna", "terra"], `product ${product.productId}`);
  }
  for (const finding of gold.findings) {
    if (typeof finding.material !== "boolean") {
      throw new Error(`Coordinator gold finding ${finding.findingId} requires a material boolean.`);
    }
    if (!discoveryStages.has(finding.firstDiscoveredStage)) {
      throw new Error(`Coordinator gold finding ${finding.findingId} has an invalid discovery stage.`);
    }
    assertStageMappings(finding.stageFindingIds, ["luna", "terra", "sol"], `finding ${finding.findingId}`);
    if (finding.firstDiscoveredStage !== "coordinator" && finding.stageFindingIds[finding.firstDiscoveredStage].length === 0) {
      throw new Error(`Coordinator gold finding ${finding.findingId} must map to its first discovery stage.`);
    }
    assertUniqueStringArray(finding.expectedGateIds, `finding ${finding.findingId} expectedGateIds`);
    if (typeof finding.resolution !== "string" || finding.resolution.trim() === "") {
      throw new Error(`Coordinator gold finding ${finding.findingId} requires a resolution.`);
    }
  }

  if (!Array.isArray(currentCatalog?.surfaces) || !Array.isArray(currentCatalog?.products)) {
    throw new Error("Final current catalog requires surfaces and products.");
  }
  const catalogSurfaceIds = exactIdSet(currentCatalog.surfaces, "surfaceId", "current catalog surface");
  const goldSurfaceIds = new Set(gold.finalSurfaces.map((surface) => surface.surfaceId));
  assertSameIds(goldSurfaceIds, catalogSurfaceIds, "Coordinator gold surfaces", "final current catalog surfaces");

  const catalogProductIds = exactIdSet(currentCatalog.products, "currentProductKey", "current catalog product");
  const goldProductIds = new Set(gold.finalProducts.map((product) => product.productId));
  assertSameIds(goldProductIds, catalogProductIds, "Coordinator gold products", "final current catalog products");
  if (gold.finalProducts.length !== currentCatalog.products?.length) {
    throw new Error("Coordinator gold products do not match the final current catalog count.");
  }
}

export function validateGoldMappings(gold, inventory) {
  if (!inventory || typeof inventory !== "object") throw new Error("Coordinator handoff requires a lineage inventory.");
  const stageSets = Object.fromEntries(["luna", "terra", "sol"].map((stage) => [stage, {
    evidenceIds: new Set(inventory[stage]?.evidenceIds ?? []),
    surfaceIds: new Set(inventory[stage]?.surfaceIds ?? []),
    productKeys: new Set(inventory[stage]?.productKeys ?? []),
    findingIds: new Set(inventory[stage]?.findingIds ?? []),
  }]));
  for (const source of gold.finalSources) {
    for (const stage of ["luna", "terra", "sol"]) {
      assertMappedIdsExist(source.stageEvidenceIds[stage], stageSets[stage].evidenceIds, `source ${source.sourceId} ${stage} evidence`);
    }
  }
  for (const surface of gold.finalSurfaces) {
    for (const stage of ["luna", "terra"]) {
      assertMappedIdsExist(surface.stageIds[stage], stageSets[stage].surfaceIds, `surface ${surface.surfaceId} ${stage}`);
    }
  }
  for (const product of gold.finalProducts) {
    for (const stage of ["luna", "terra"]) {
      assertMappedIdsExist(product.stageKeys[stage], stageSets[stage].productKeys, `product ${product.productId} ${stage}`);
    }
  }
  for (const finding of gold.findings) {
    for (const stage of ["luna", "terra", "sol"]) {
      assertMappedIdsExist(finding.stageFindingIds[stage], stageSets[stage].findingIds, `finding ${finding.findingId} ${stage}`);
    }
  }
}

function buildLineageInventory({ scout, terra, solReview }) {
  return {
    luna: {
      evidenceIds: unique((scout.sources ?? []).map((source) => source.evidenceId)),
      surfaceIds: unique((scout.menuSurfaces ?? []).map((surface) => surface.surfaceId)),
      productKeys: unique((scout.currentProducts ?? []).map((product) => product.currentProductKey)),
      findingIds: unique((scout.findings ?? []).map((finding) => finding.findingId)),
    },
    terra: {
      evidenceIds: unique((terra.sources ?? []).map((source) => source.evidenceId)),
      surfaceIds: unique([
        ...(terra.surfaceChecks ?? []).map((surface) => surface.surfaceId),
        ...(terra.additionalMenuSurfaces ?? []).map((surface) => surface.surfaceId),
      ]),
      productKeys: unique([
        ...(terra.currentProductCheckGroups ?? []).flatMap((group) => group.currentProductKeys ?? []),
        ...(terra.additionalCurrentProducts ?? []).map((product) => product.currentProductKey),
      ]),
      findingIds: unique((terra.findings ?? []).map((finding) => finding.findingId)),
    },
    sol: {
      evidenceIds: unique((solReview?.additionalEvidence ?? []).map((source) => source.url)),
      surfaceIds: [],
      productKeys: [],
      findingIds: unique([...(solReview?.confirmedFindings ?? []), ...(solReview?.rejectedFindings ?? [])]),
    },
  };
}

function assertStageMappings(value, stages, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Coordinator gold ${label} requires stage mappings.`);
  }
  for (const stage of stages) assertUniqueStringArray(value[stage], `${label}.${stage}`);
}

function assertUniqueStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`Coordinator gold ${label} must be an array of non-empty strings.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`Coordinator gold ${label} contains duplicate IDs.`);
}

function assertUniqueObjects(values, key, label) {
  exactIdSet(values, key, label);
}

function exactIdSet(values, key, label) {
  const ids = values.map((value) => value?.[key]);
  if (ids.some((id) => typeof id !== "string" || id.trim() === "")) {
    throw new Error(`Every ${label} requires a non-empty ${key}.`);
  }
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} ${key}.`);
  return new Set(ids);
}

function assertSameIds(actual, expected, actualLabel, expectedLabel) {
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${actualLabel} do not exactly match ${expectedLabel}; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}.`);
  }
}

function assertMappedIdsExist(ids, available, label) {
  const missing = ids.filter((id) => !available.has(id));
  if (missing.length > 0) throw new Error(`Coordinator gold ${label} references unknown stage IDs: ${missing.join(", ")}.`);
}

async function assertSuccessfulAttempt({ entry, stage, canonicalResultPath, verificationRoot }) {
  const attempts = entry[`${stage}Attempts`] ?? [];
  const canonicalHash = sha256(await readFile(canonicalResultPath));
  const attempt = [...attempts].reverse().find((candidate) => candidate.result?.sha256 === canonicalHash);
  if (!attempt) {
    if (attempts.length > 0) throw new Error(`${stage} canonical result does not match any attempt receipt.`);
    throw new Error(`Coordinator handoff requires a recorded ${stage} attempt.`);
  }
  const exactModel = await hasExactModelProvenance({ attempt, verificationRoot });
  if (attempt.exitCode !== 0 || !exactModel || attempt.validation?.valid !== true) {
    throw new Error(`Coordinator handoff requires a successful, exact-model, validated ${stage} attempt.`);
  }
  if (!attempt.result?.written || !attempt.result.sha256) {
    throw new Error(`Coordinator handoff requires an immutable ${stage} result receipt.`);
  }
  if (canonicalHash !== attempt.result.sha256) throw new Error(`${stage} canonical result does not match its attempt receipt.`);
  if (sha256(attempt.prompt?.text ?? "") !== attempt.prompt?.sha256) throw new Error(`${stage} prompt receipt hash is invalid.`);
  for (const input of attempt.inputs ?? []) {
    if (!input?.path || typeof input.exists !== "boolean") throw new Error(`${stage} attempt receipt has an invalid input record.`);
    const absolute = resolveAttemptArtifact(input.path, verificationRoot);
    if (!input.exists) {
      try {
        await readFile(absolute);
        if (isExpectedCoordinatorOutputPath(input.path)) continue;
        throw new Error(`${stage} attempt input appeared after being recorded absent: ${input.path}.`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      continue;
    }
    if (!input.sha256 || sha256(await readFile(absolute)) !== input.sha256) {
      if (isMutableDerivedRouteInput(input.path)) continue;
      throw new Error(`${stage} attempt input hash does not match: ${input.path}.`);
    }
  }
  for (const artifact of [attempt.schema, attempt.result, attempt.log]) {
    if (!artifact?.path || !artifact.sha256) throw new Error(`${stage} attempt receipt is missing an artifact hash.`);
    const absolute = resolveAttemptArtifact(artifact.path, verificationRoot);
    if (sha256(await readFile(absolute)) !== artifact.sha256) throw new Error(`${stage} attempt artifact hash does not match: ${artifact.path}.`);
  }
}

async function hasExactModelProvenance({ attempt, verificationRoot }) {
  if (attempt.model?.exact === true) return true;
  if (attempt.model?.exact !== null || !attempt.log?.path || !attempt.log?.sha256) return false;
  const log = await readFile(resolveAttemptArtifact(attempt.log.path, verificationRoot));
  if (sha256(log) !== attempt.log.sha256) return false;
  const text = log.toString();
  const runtimeId = /^model:\s*(\S+)/m.exec(text)?.[1] ?? null;
  const runtimeReasoningEffort = /^reasoning effort:\s*(\S+)/m.exec(text)?.[1] ?? null;
  return runtimeId === attempt.model.id && runtimeReasoningEffort === attempt.model.reasoningEffort;
}

function isMutableDerivedRouteInput(relativePath) {
  return /(?:^|\/)worker-runs\/[^/]+\/(?:scout-routes|routes)\/[^/]+\.json$/.test(relativePath);
}

function isExpectedCoordinatorOutputPath(relativePath) {
  return /(?:^|\/)data\/restaurant-verification\/(?:restaurants|evidence)\/[^/]+\.json$/.test(relativePath);
}

function resolveAttemptArtifact(relativePath, verificationRoot) {
  const absolute = path.resolve(repositoryRoot, relativePath);
  const insideRepository = absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${path.sep}`);
  const insideVerificationRoot = absolute === verificationRoot || absolute.startsWith(`${verificationRoot}${path.sep}`);
  if (!insideRepository && !insideVerificationRoot) {
    throw new Error(`Attempt artifact escapes the repository and verification root: ${relativePath}.`);
  }
  return absolute;
}

function mergeByIdStrict(base, updates) {
  const merged = new Map(base.map((entry) => [entry.id, entry]));
  for (const update of updates) {
    const current = merged.get(update.id);
    if (current && (current.url !== update.url || current.authorityTier !== update.authorityTier)) {
      throw new Error(`Coordinator evidence ${update.id} changes worker source identity or authority.`);
    }
    merged.set(update.id, { ...current, ...update });
  }
  return [...merged.values()];
}

function mergeByAuditKey(base, updates) {
  const merged = new Map(base.map((entry) => [entry.auditItemKey, entry]));
  for (const update of updates) {
    if (!merged.has(update.auditItemKey)) throw new Error(`Coordinator decision references unknown audit item ${update.auditItemKey}.`);
    merged.set(update.auditItemKey, { ...merged.get(update.auditItemKey), ...update });
  }
  return [...merged.values()];
}

function buildCurrentCatalogCandidate({ scout, terra, baselineItemCount }) {
  const surfaceChecks = new Map((terra.surfaceChecks ?? []).map((check) => [check.surfaceId, check]));
  const productChecks = new Map();
  for (const group of terra.currentProductCheckGroups ?? []) for (const key of group.currentProductKeys ?? []) productChecks.set(key, group);
  const surfaces = (scout.menuSurfaces ?? []).map((surface) => {
    const check = surfaceChecks.get(surface.surfaceId);
    return {
      surfaceId: surface.surfaceId, title: surface.title, url: surface.url, current: surface.current, scopeStatus: surface.scopeStatus,
      verified: check?.verdict === "verified", evidenceIds: unique([...(surface.sourceEvidenceIds ?? []), ...(check?.sourceEvidenceIds ?? [])]),
      notes: [surface.notes, check?.notes].filter(Boolean),
    };
  });
  const products = (scout.currentProducts ?? []).map((product) => {
    const check = productChecks.get(product.currentProductKey);
    return {
      currentProductKey: product.currentProductKey, name: product.name, category: product.category,
      presentationIds: product.presentationIds, matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys,
      sourceEvidenceIds: unique([...(product.sourceEvidenceIds ?? []), ...(check?.sourceEvidenceIds ?? [])]),
      containsAllergens: check?.containsAllergens ?? product.containsAllergens,
      mayContainAllergens: check?.mayContainAllergens ?? product.mayContainAllergens,
      allergenSourceType: check?.allergenSourceType ?? product.allergenSourceType,
      allergenAuthorityTier: check?.allergenAuthorityTier ?? product.allergenAuthorityTier,
      allergenSourceEvidenceIds: check?.allergenSourceEvidenceIds ?? product.allergenSourceEvidenceIds,
      coordinatorReviewed: check?.verdict === "verified", notes: [product.notes, check?.notes].filter(Boolean),
    };
  });
  return {
    status: "not_reviewed", reviewedBaselineItemCount: baselineItemCount, currentProductCount: products.length,
    reconciledCurrentProductCount: products.filter((product) => product.coordinatorReviewed).length,
    surfaces, products, notes: ["Candidate catalog only; coordinator must change status after reviewing complete current scope."],
  };
}

function flattenItemGroups(result) {
  const findingIdsByItem = new Map();
  for (const finding of result.findings ?? []) for (const key of finding.affectedAuditItemKeys ?? []) {
    findingIdsByItem.set(key, [...(findingIdsByItem.get(key) ?? []), finding.findingId]);
  }
  return (result.itemCheckGroups ?? []).flatMap((group) => (group.auditItemKeys ?? []).map((auditItemKey) => ({
    auditItemKey, disposition: group.disposition, allergenVerdict: group.allergenVerdict,
    sourceEvidenceIds: group.sourceEvidenceIds, matchedCurrentProductKeys: group.matchedCurrentProductKeys,
    adjudicatedContainsAllergens: group.adjudicatedContainsAllergens,
    adjudicatedMayContainAllergens: group.adjudicatedMayContainAllergens,
    adjudicatedAllergenSourceType: group.adjudicatedAllergenSourceType,
    adjudicatedAllergenAuthorityTier: group.adjudicatedAllergenAuthorityTier,
    allergenSourceEvidenceIds: group.allergenSourceEvidenceIds, resolvedFindingIds: findingIdsByItem.get(auditItemKey) ?? [],
  })));
}

function mergeWorkerEvidence(...groups) {
  const merged = new Map();
  for (const source of groups.flat()) {
    const current = merged.get(source.evidenceId);
    if (current && (current.url !== source.url || current.authorityTier !== source.authorityTier)) {
      throw new Error(`Evidence ID ${source.evidenceId} changes identity or authority between stages.`);
    }
    merged.set(source.evidenceId, {
      id: source.evidenceId, url: source.url, authorityTier: source.authorityTier, purpose: source.purpose,
      retrievedAt: source.retrievedAt, sha256: /^[a-f0-9]{64}$/.test(source.contentHash ?? "") ? source.contentHash : null,
      excerpt: source.excerpt, rowIdentifiers: source.stableRowId ? [source.stableRowId] : [], notes: [source.title].filter(Boolean),
    });
  }
  return [...merged.values()];
}

function assertModel(actual, expected, label) {
  if (actual?.id !== expected.id || actual?.reasoningEffort !== expected.reasoningEffort) throw new Error(`${label} model provenance is invalid.`);
}
function assertSafe(value, label) { if (!/^[a-zA-Z0-9._-]+$/.test(String(value ?? ""))) throw new Error(`A safe ${label} is required.`); }
function unique(values) { return [...new Set(values)]; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function readJson(filePath) { return JSON.parse(await readFile(filePath, "utf8")); }
async function readJsonLines(filePath) { return (await readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, filePath);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [command = "prepare", ...tokens] = process.argv.slice(2);
  const options = Object.fromEntries(tokens.map((token) => { const [key, ...value] = token.replace(/^--/, "").split("="); return [key, value.join("=")]; }));
  const action = command === "prepare"
    ? prepareCoordinatorHandoff({ root: options.root ?? defaultRoot, runId: options.run, restaurantId: options.id })
    : command === "draft"
      ? buildCoordinatorDecisionDraft({ root: options.root ?? defaultRoot, runId: options.run, restaurantId: options.id })
    : command === "ingest"
      ? ingestCoordinatorDecision({ root: options.root ?? defaultRoot, runId: options.run, restaurantId: options.id, decisionPath: options.decision })
      : Promise.reject(new Error(`Unknown coordinator command: ${command}`));
  action
    .then((result) => console.log(JSON.stringify(command === "prepare"
      ? { runId: result.runId, restaurantId: result.restaurantId, coordinator: result.coordinator }
      : command === "draft"
        ? { restaurantId: options.id, recommendation: result.decision.recommendation, decisionPath: result.decisionPath }
        : { restaurantId: options.id, status: result.row?.status ?? result.recommendation }, null, 2)))
    .catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
