import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLaunchTargetPlan,
  selectLaunchWaveTargets,
} from "./launch-coverage-process.mjs";
import { scrapeRestaurant } from "./pipeline/scrape-restaurant.mjs";
import { restaurantSources } from "./restaurant-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossierDirectory = path.join(root, "data/restaurant-verification/restaurants");
const defaultOutputDirectory = path.join(
  root,
  "data/restaurant-verification/reports/source-parity-audit",
);

const args = parseArgs(process.argv.slice(2));
const outputDirectory = path.resolve(args["output-dir"] ?? defaultOutputDirectory);
const freshDirectory = path.join(outputDirectory, "fresh");
const concurrency = positiveInteger(args.concurrency, 8);
const maxSourceFetches = positiveInteger(args["max-source-fetches"], 24);
const productPageLimit = positiveInteger(args["product-page-limit"], 12);
const targetRestaurantIds = new Set(
  String(args["restaurant-ids"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const runFresh = args.fresh !== "false";
const fetchFresh = args.fetch !== "false";
const resume = args.resume !== "false";
const shardCount = positiveInteger(args["shard-count"], 1);
const shardIndex = nonNegativeInteger(args["shard-index"], 0);
const buildReport = args.report !== "false";

if (shardIndex >= shardCount) {
  throw new Error(`shard-index ${shardIndex} must be lower than shard-count ${shardCount}`);
}

const repository = JSON.parse(await readFile(repositoryPath, "utf8"));
const artifactAudit = buildArtifactParityAudit(repository);
await mkdir(outputDirectory, { recursive: true });
await writeJson(path.join(outputDirectory, "artifact-parity.json"), artifactAudit);

let freshAudit = null;
if (runFresh) {
  await mkdir(freshDirectory, { recursive: true });
  const fullSourceInventory = await buildFreshSourceInventory(repository);
  const sourceInventory = targetRestaurantIds.size
    ? fullSourceInventory.filter((row) => targetRestaurantIds.has(row.restaurantId))
    : fullSourceInventory;
  if (targetRestaurantIds.size && sourceInventory.length !== targetRestaurantIds.size) {
    const foundIds = new Set(sourceInventory.map((row) => row.restaurantId));
    const missingIds = [...targetRestaurantIds].filter((id) => !foundIds.has(id));
    throw new Error(`Unknown restaurant ids: ${missingIds.join(", ")}`);
  }
  await writeJson(path.join(outputDirectory, "source-inventory.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: summarizeInventory(sourceInventory),
    rows: sourceInventory.map(({ source, ...row }) => ({
      ...row,
      configuredUrlCount: configuredUrls(source).length,
      configuredUrls: configuredUrls(source),
    })),
  });

  const shardInventory = sourceInventory.filter((_, index) => index % shardCount === shardIndex);
  if (fetchFresh) {
    await runFreshAudit(shardInventory);
  }
  if (buildReport) {
    freshAudit = await buildFreshParityReport(repository, sourceInventory);
    await writeJson(path.join(outputDirectory, "fresh-source-parity.json"), freshAudit);
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repositoryGeneratedAt: repository.generatedAt,
  repositoryRestaurantCount: repository.restaurants.length,
  artifactParity: artifactAudit.summary,
  freshSourceParity: freshAudit?.summary ?? null,
  outputDirectory: path.relative(root, outputDirectory),
};
await writeJson(path.join(outputDirectory, "summary.json"), report);
console.log(JSON.stringify(report, null, 2));

function buildArtifactParityAudit(currentRepository) {
  const rows = [];

  for (const restaurant of currentRepository.restaurants) {
    const dossierPath = path.join(dossierDirectory, `${restaurant.id}.json`);
    const dossier = JSON.parse(fs.readFileSync(dossierPath, "utf8"));
    const canonicalProducts = dossier.currentCatalog?.products ?? [];
    const generatedItems = restaurant.items ?? [];
    const canonicalByName = uniqueByNormalizedName(canonicalProducts);
    const generatedByName = uniqueByNormalizedName(generatedItems);
    const canonicalOnly = difference(canonicalByName, generatedByName);
    const generatedOnly = difference(generatedByName, canonicalByName);
    const fieldGaps = {
      droppedDescriptions: [],
      droppedIngredientsText: [],
      droppedOfficialClaims: [],
      allergenConflicts: [],
      mayContainConflicts: [],
      profileConflicts: [],
    };

    for (const [nameKey, canonical] of canonicalByName) {
      const generated = generatedByName.get(nameKey);
      if (!generated) continue;

      if (hasText(canonical.description) && !hasText(generated.description)) {
        fieldGaps.droppedDescriptions.push(canonical.name);
      }
      if (hasText(canonical.ingredientsText) && !hasText(generated.ingredientsText)) {
        fieldGaps.droppedIngredientsText.push(canonical.name);
      }

      const canonicalOfficial = isOfficialItem(canonical, "canonical");
      const generatedOfficial = isOfficialItem(generated, "generated");
      if (canonicalOfficial && !generatedOfficial) {
        fieldGaps.droppedOfficialClaims.push(canonical.name);
      }

      if (!sameSet(canonical.containsAllergens, generated.allergens)) {
        fieldGaps.allergenConflicts.push(canonical.name);
      }
      if (!sameSet(canonical.mayContainAllergens, generated.mayContain)) {
        fieldGaps.mayContainConflicts.push(canonical.name);
      }
      if (
        (canonical.officialAllergenProfileId ?? null) !==
        (generated.officialAllergenProfileId ?? null)
      ) {
        fieldGaps.profileConflicts.push(canonical.name);
      }
    }

    const completedSearchClasses = new Set(
      asArray(dossier.sourceAttempts)
        .map((attempt) => attempt.searchClass ?? attempt.class ?? attempt.kind)
        .map(normalizeSearchClass)
        .filter(Boolean),
    );
    const missingSearchClasses = [
      "official_site",
      "official_documents",
      "linked_vendor",
      "targeted_web_search",
    ].filter((searchClass) => !completedSearchClasses.has(searchClass));

    const issueCodes = [];
    if (canonicalOnly.length) issueCodes.push("canonical-products-not-projected");
    if (generatedOnly.length) issueCodes.push("projected-products-not-in-canonical");
    if (fieldGaps.droppedDescriptions.length) issueCodes.push("description-projection-gap");
    if (fieldGaps.droppedIngredientsText.length) issueCodes.push("ingredients-projection-gap");
    if (fieldGaps.droppedOfficialClaims.length) issueCodes.push("official-claim-projection-gap");
    if (fieldGaps.allergenConflicts.length) issueCodes.push("allergen-projection-conflict");
    if (fieldGaps.mayContainConflicts.length) issueCodes.push("may-contain-projection-conflict");
    if (fieldGaps.profileConflicts.length) issueCodes.push("official-profile-projection-conflict");
    if (missingSearchClasses.length) issueCodes.push("incomplete-recorded-source-search");

    rows.push({
      restaurantId: restaurant.id,
      name: restaurant.name,
      sourceFamily: restaurant.sourceFamily ?? null,
      parserProfile: restaurant.parserProfile ?? null,
      dossierStatus: dossier.status ?? null,
      catalogStatus: dossier.currentCatalog?.status ?? null,
      canonicalProductCount: canonicalProducts.length,
      generatedItemCount: generatedItems.length,
      canonicalOnlyCount: canonicalOnly.length,
      canonicalOnlyNames: canonicalOnly.slice(0, 50).map((item) => item.name),
      generatedOnlyCount: generatedOnly.length,
      generatedOnlyNames: generatedOnly.slice(0, 50).map((item) => item.name),
      missingSearchClasses,
      fieldGapCounts: mapArrayLengths(fieldGaps),
      fieldGapExamples: mapArraySlices(fieldGaps, 50),
      issueCodes,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      restaurantCount: rows.length,
      exactCatalogNameParityCount: rows.filter(
        (row) => row.canonicalOnlyCount === 0 && row.generatedOnlyCount === 0,
      ).length,
      noCanonicalProductsCount: rows.filter((row) => row.canonicalProductCount === 0).length,
      canonicalProductsNotProjectedRestaurantCount: rows.filter(
        (row) => row.canonicalOnlyCount > 0,
      ).length,
      projectedProductsNotCanonicalRestaurantCount: rows.filter(
        (row) => row.generatedOnlyCount > 0,
      ).length,
      droppedDescriptionRestaurantCount: countRowsWithGap(rows, "droppedDescriptions"),
      droppedIngredientsRestaurantCount: countRowsWithGap(rows, "droppedIngredientsText"),
      droppedOfficialClaimRestaurantCount: countRowsWithGap(rows, "droppedOfficialClaims"),
      allergenConflictRestaurantCount: countRowsWithGap(rows, "allergenConflicts"),
      mayContainConflictRestaurantCount: countRowsWithGap(rows, "mayContainConflicts"),
      profileConflictRestaurantCount: countRowsWithGap(rows, "profileConflicts"),
      incompleteRecordedSourceSearchCount: rows.filter(
        (row) => row.missingSearchClasses.length > 0,
      ).length,
      issueCodeCounts: countFlat(rows.flatMap((row) => row.issueCodes)),
    },
    rows,
  };
}

async function buildFreshSourceInventory(currentRepository) {
  const configuredById = new Map(restaurantSources.map((source) => [source.id, source]));
  const launchPlan = await buildLaunchTargetPlan();
  const launchTargets = selectLaunchWaveTargets(launchPlan.targets, { wave: "full" });
  const launchById = new Map(launchTargets.map((target) => [target.id, target.source]));

  return currentRepository.restaurants.map((restaurant) => {
    const dossier = JSON.parse(
      fs.readFileSync(path.join(dossierDirectory, `${restaurant.id}.json`), "utf8"),
    );
    const configured = configuredById.get(restaurant.id);
    const launch = launchById.get(restaurant.id);
    const canonical = synthesizedSource(restaurant, dossier);
    const source = configured
      ? withAuditLimits(configured, restaurant.items)
      : canonical
        ? withAuditLimits(canonical, restaurant.items)
        : launch
          ? withAuditLimits(launch, restaurant.items)
          : null;
    const origin = configured
      ? "restaurant-sources"
      : canonical
        ? "canonical-surface"
        : launch
          ? "launch-target"
          : "unavailable";

    return {
      restaurantId: restaurant.id,
      name: restaurant.name,
      sourceFamily: restaurant.sourceFamily ?? null,
      parserProfile: restaurant.parserProfile ?? null,
      sourceOrigin: origin,
      source,
    };
  });
}

function synthesizedSource(restaurant, dossier) {
  const surfaceUrls = (dossier.currentCatalog?.surfaces ?? [])
    .filter((surface) => surface.current === true && surface.verified !== false)
    .map((surface) => surface.url);
  const urls = uniqueStrings([...surfaceUrls, ...(restaurant.sourceUrls ?? [])]).filter(
    isAuditableSourceUrl,
  );
  if (!urls.length) return null;

  const allergenUrls = urls.filter(isLikelyAllergenUrl);
  const menuUrls = urls.filter((url) => !allergenUrls.includes(url));
  if (!menuUrls.length) menuUrls.push(urls[0]);

  return {
    id: restaurant.id,
    rank: restaurant.rank,
    name: restaurant.name,
    category: restaurant.category ?? "Restaurant",
    domain: restaurant.domain,
    type: restaurant.type ?? "local",
    locationId: restaurant.locationId,
    menuUrls,
    allergenUrls,
    allowUnavailableAllergenFallback: true,
    maxSourceFetches,
    productPageLimit,
  };
}

function withAuditLimits(source, currentItems = []) {
  return {
    ...source,
    maxSourceFetches: Math.min(
      positiveInteger(source.maxSourceFetches, maxSourceFetches),
      maxSourceFetches,
    ),
    productPageLimit: Math.min(
      positiveInteger(source.productPageLimit, productPageLimit),
      productPageLimit,
    ),
    productPageNames: currentItems
      .filter((item) => !hasText(item.description))
      .map((item) => item.name)
      .filter(Boolean),
  };
}

async function runFreshAudit(inventory) {
  let cursor = 0;
  let completed = 0;
  const totals = inventory.length;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= totals) return;
      const row = inventory[index];
      const outputPath = path.join(freshDirectory, `${row.restaurantId}.json`);

      if (resume && fs.existsSync(outputPath)) {
        completed += 1;
        progress(completed, totals, row, "cached");
        continue;
      }

      if (!row.source) {
        await writeJson(outputPath, {
          schemaVersion: 1,
          auditedAt: new Date().toISOString(),
          restaurantId: row.restaurantId,
          status: "no-auditable-source-url",
          restaurant: null,
          sources: [],
        });
        completed += 1;
        progress(completed, totals, row, "no-source");
        continue;
      }

      try {
        const result = await scrapeRestaurant(row.source);
        await writeJson(outputPath, {
          schemaVersion: 1,
          auditedAt: new Date().toISOString(),
          restaurantId: row.restaurantId,
          status: "completed",
          restaurant: result.restaurant,
          sources: result.sources,
        });
        completed += 1;
        progress(completed, totals, row, `${result.restaurant.items.length} items`);
      } catch (error) {
        await writeJson(outputPath, {
          schemaVersion: 1,
          auditedAt: new Date().toISOString(),
          restaurantId: row.restaurantId,
          status: "error",
          error: String(error?.stack ?? error),
          restaurant: null,
          sources: [],
        });
        completed += 1;
        progress(completed, totals, row, "error");
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function buildFreshParityReport(currentRepository, inventory) {
  const currentById = new Map(
    currentRepository.restaurants.map((restaurant) => [restaurant.id, restaurant]),
  );
  const rows = [];

  for (const inventoryRow of inventory) {
    const freshPath = path.join(freshDirectory, `${inventoryRow.restaurantId}.json`);
    const audit = await readFreshAudit(freshPath);
    const current = currentById.get(inventoryRow.restaurantId);
    const fresh = audit.restaurant;
    const currentItems = current?.items ?? [];
    const freshItems = fresh?.items ?? [];
    const currentByName = uniqueByNormalizedName(currentItems);
    const freshByName = uniqueByNormalizedName(freshItems);
    const freshOnly = difference(freshByName, currentByName);
    const currentOnly = difference(currentByName, freshByName);
    const exactOverlapCount = [...freshByName.keys()].filter((key) => currentByName.has(key)).length;
    const sourceSuccessCount = (audit.sources ?? []).filter((source) => source.ok).length;
    const sourceFailureCount = (audit.sources ?? []).filter((source) => !source.ok).length;
    const metrics = {
      currentItemCount: currentItems.length,
      freshItemCount: freshItems.length,
      exactOverlapCount,
      exactOverlapOfCurrent: ratio(exactOverlapCount, currentItems.length),
      exactOverlapOfFresh: ratio(exactOverlapCount, freshItems.length),
      freshOnlyCount: freshOnly.length,
      currentOnlyCount: currentOnly.length,
      currentDescriptionCount: countWithText(currentItems, "description"),
      freshDescriptionCount: countWithText(freshItems, "description"),
      currentIngredientsTextCount: countWithText(currentItems, "ingredientsText"),
      freshIngredientsTextCount: countWithText(freshItems, "ingredientsText"),
      currentOfficialItemCount: currentItems.filter((item) => isOfficialItem(item, "generated")).length,
      freshOfficialItemCount: freshItems.filter((item) => isOfficialItem(item, "generated")).length,
      sourceSuccessCount,
      sourceFailureCount,
    };
    const classification = classifyFreshParity({
      audit,
      inventoryRow,
      metrics,
    });

    rows.push({
      restaurantId: inventoryRow.restaurantId,
      name: inventoryRow.name,
      sourceFamily: inventoryRow.sourceFamily,
      parserProfile: inventoryRow.parserProfile,
      sourceOrigin: inventoryRow.sourceOrigin,
      auditStatus: audit.status,
      classification,
      metrics,
      freshOnlyNames: freshOnly.slice(0, 50).map((item) => item.name),
      currentOnlyNames: currentOnly.slice(0, 50).map((item) => item.name),
      successfulSourceUrls: (audit.sources ?? [])
        .filter((source) => source.ok)
        .map((source) => source.finalUrl ?? source.url)
        .slice(0, 30),
      failedSourceUrls: (audit.sources ?? [])
        .filter((source) => !source.ok)
        .map((source) => source.url)
        .slice(0, 30),
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      restaurantCount: rows.length,
      classificationCounts: countFlat(rows.map((row) => row.classification)),
      sourceOriginCounts: countFlat(rows.map((row) => row.sourceOrigin)),
      sourceFamilyCounts: countFlat(rows.map((row) => row.sourceFamily ?? "unknown")),
      completedCount: rows.filter((row) => row.auditStatus === "completed").length,
      successfulSourceCount: rows.filter((row) => row.metrics.sourceSuccessCount > 0).length,
      exactItemParityCount: rows.filter(
        (row) => row.metrics.freshOnlyCount === 0 && row.metrics.currentOnlyCount === 0,
      ).length,
      confirmedStructuredGapCount: rows.filter(
        (row) => row.classification === "confirmed-structured-gap",
      ).length,
      candidateParserGapCount: rows.filter(
        (row) => row.classification === "candidate-parser-gap",
      ).length,
    },
    rows,
  };
}

function classifyFreshParity({ audit, inventoryRow, metrics }) {
  if (audit.status === "no-auditable-source-url") return "unverifiable-no-source";
  if (audit.status === "audit-timeout") return "unverifiable-audit-timeout";
  if (audit.status === "error") return "audit-error";
  if (
    [
      "stale-location-no-current-menu",
      "reviewed-image-menu-no-additional-copy",
      "reviewed-menu-no-additional-description-copy",
      "reviewed-client-rendered-menu-no-retrievable-copy",
      "reviewed-source-unreachable",
    ].includes(audit.restaurant?.sourceStatus?.descriptionRecoveryDisposition)
  ) {
    const disposition = audit.restaurant.sourceStatus.descriptionRecoveryDisposition;
    if (disposition === "stale-location-no-current-menu") return "reconciled-stale-location";
    if (disposition === "reviewed-source-unreachable") return "reconciled-source-unreachable";
    if (disposition === "reviewed-client-rendered-menu-no-retrievable-copy") {
      return "reconciled-client-rendered-menu";
    }
    return "reconciled-no-additional-description-copy";
  }
  if (metrics.sourceSuccessCount === 0) return "unverifiable-source-unreachable";
  if (metrics.freshItemCount === 0) return "fresh-parser-empty";

  const structured = [
    "nutritionix",
    "official-api",
    "pdf-allergen-matrix",
  ].includes(inventoryRow.sourceFamily);
  const sufficientOverlap =
    metrics.exactOverlapCount >= 5 &&
    (metrics.exactOverlapOfCurrent >= 0.25 || metrics.exactOverlapOfFresh >= 0.25);
  const materialCountGain =
    metrics.freshItemCount >= metrics.currentItemCount + Math.max(5, Math.ceil(metrics.currentItemCount * 0.1));
  const materialDescriptionGain =
    metrics.freshDescriptionCount >=
    metrics.currentDescriptionCount + Math.max(5, Math.ceil(metrics.currentItemCount * 0.1));
  const materialIngredientGain =
    metrics.freshIngredientsTextCount >=
    metrics.currentIngredientsTextCount + Math.max(5, Math.ceil(metrics.currentItemCount * 0.05));
  const materialOfficialGain =
    metrics.freshOfficialItemCount >=
    metrics.currentOfficialItemCount + Math.max(5, Math.ceil(metrics.currentItemCount * 0.05));

  if (
    structured &&
    sufficientOverlap &&
    (materialCountGain || materialDescriptionGain || materialIngredientGain || materialOfficialGain)
  ) {
    return "confirmed-structured-gap";
  }
  if (
    sufficientOverlap &&
    (materialCountGain || materialDescriptionGain || materialIngredientGain || materialOfficialGain)
  ) {
    return "candidate-parser-gap";
  }
  if (
    metrics.freshOnlyCount === 0 &&
    metrics.currentOnlyCount === 0 &&
    !materialDescriptionGain &&
    !materialIngredientGain &&
    !materialOfficialGain
  ) {
    return "parity";
  }
  return "source-drift-or-review";
}

async function readFreshAudit(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {
      status: "audit-timeout",
      restaurant: null,
      sources: [],
    };
  }
}

function normalizeSearchClass(value) {
  const normalized = String(value ?? "").toLowerCase().replace(/-/g, "_");
  if (normalized.includes("official_site")) return "official_site";
  if (normalized.includes("official_document") || normalized === "linked_source") {
    return "official_documents";
  }
  if (normalized.includes("linked_vendor") || normalized === "ordering_vendor") {
    return "linked_vendor";
  }
  if (normalized.includes("targeted") || normalized === "targeted_search") {
    return "targeted_web_search";
  }
  return null;
}

function isOfficialItem(item, shape) {
  const sourceType = String(item?.allergenSourceType ?? "unavailable");
  if (sourceType === "unavailable") return false;
  if (shape === "canonical") {
    return Boolean(
      (item.containsAllergens ?? []).length ||
        (item.mayContainAllergens ?? []).length ||
        item.officialAllergenProfileId ||
        item.allergenSourceEvidenceIds?.length,
    );
  }
  return Boolean(
    (item.allergens ?? []).length ||
      (item.mayContain ?? []).length ||
      item.officialAllergenProfileId ||
      item.evidence?.length ||
      item.allergenSourceEvidenceIds?.length,
  );
}

function uniqueByNormalizedName(items) {
  const result = new Map();
  for (const item of items) {
    const key = normalizeName(item?.name);
    if (key && !result.has(key)) result.set(key, item);
  }
  return result;
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function difference(left, right) {
  return [...left.entries()].filter(([key]) => !right.has(key)).map(([, item]) => item);
}

function configuredUrls(source) {
  if (!source) return [];
  return uniqueStrings([
    ...(source.menuUrls ?? []).map(urlValue),
    ...(source.allergenUrls ?? []).map(urlValue),
    ...(source.apiUrls ?? []).map(urlValue),
  ]).filter(Boolean);
}

function urlValue(value) {
  return typeof value === "string" ? value : value?.url;
}

function isAuditableSourceUrl(value) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !/(?:google|bing)\.com$/i.test(url.hostname) &&
      !/\/search(?:\/|$)/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isLikelyAllergenUrl(value) {
  return /allerg|nutrition|ingredient|dietary|sensitivity/i.test(String(value));
}

function sameSet(left = [], right = []) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function countWithText(items, key) {
  return items.filter((item) => hasText(item?.[key])).length;
}

function countRowsWithGap(rows, key) {
  return rows.filter((row) => row.fieldGapCounts[key] > 0).length;
}

function mapArrayLengths(value) {
  return Object.fromEntries(Object.entries(value).map(([key, entries]) => [key, entries.length]));
}

function mapArraySlices(value, limit) {
  return Object.fromEntries(Object.entries(value).map(([key, entries]) => [key, entries.slice(0, limit)]));
}

function countFlat(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeInventory(rows) {
  return {
    restaurantCount: rows.length,
    sourceOriginCounts: countFlat(rows.map((row) => row.sourceOrigin)),
    sourceFamilyCounts: countFlat(rows.map((row) => row.sourceFamily ?? "unknown")),
    noAuditableSourceCount: rows.filter((row) => !row.source).length,
  };
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value).flatMap(asArray);
  return [];
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function progress(completed, total, row, status) {
  console.log(`[${completed}/${total}] ${row.restaurantId}: ${status}`);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [key, ...rest] = arg.slice(2).split("=");
        return [key, rest.join("=") || "true"];
      }),
  );
}
