import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export const ledgerSchemaVersion = 1;
export const verificationModel = Object.freeze({
  id: "gpt-5.6-sol",
  reasoningEffort: "medium",
});
export const pocCoordinatorModel = Object.freeze({
  id: "codex-poc-coordinator",
  reasoningEffort: "high",
});
export const checkpointSize = 10;
export const verificationContractVersion = 2;

export const ledgerStatuses = Object.freeze([
  "pending",
  "in_progress",
  "discrepancy_found",
  "repair_in_progress",
  "recheck_required",
  "codex_verified",
  "blocked_unverifiable",
]);

export const terminalStatuses = Object.freeze([
  "codex_verified",
  "blocked_unverifiable",
]);

export const itemDispositions = Object.freeze([
  "pending",
  "exact_match",
  "normalized_match",
  "variant_match",
  "missing_from_source",
  "stale_extra",
  "artifact",
  "location_mismatch",
]);

export const allergenVerdicts = Object.freeze([
  "pending",
  "verified",
  "accurately_unavailable",
  "mismatch",
  "not_applicable",
]);

export const sourceAuthorityTiers = Object.freeze([
  "restaurant_issued",
  "restaurant_linked_vendor",
  "third_party",
  "ingredient_intelligence",
]);

export const blockedAttemptKinds = Object.freeze([
  "official_site",
  "linked_source",
  "ordering_vendor",
  "targeted_search",
  "archive",
  "third_party",
]);

const allowedTransitions = new Map([
  ["pending", new Set(["in_progress"])],
  [
    "in_progress",
    new Set([
      "discrepancy_found",
      "repair_in_progress",
      "recheck_required",
      "codex_verified",
      "blocked_unverifiable",
    ]),
  ],
  [
    "discrepancy_found",
    new Set(["repair_in_progress", "recheck_required", "blocked_unverifiable"]),
  ],
  ["repair_in_progress", new Set(["recheck_required", "codex_verified", "blocked_unverifiable"])],
  [
    "recheck_required",
    new Set([
      "discrepancy_found",
      "repair_in_progress",
      "codex_verified",
      "blocked_unverifiable",
    ]),
  ],
  ["codex_verified", new Set(["recheck_required"])],
  ["blocked_unverifiable", new Set(["recheck_required"])],
]);

const defaultRepositoryPath = "src/data/generated/restaurants.generated.json";
const defaultLedgerRoot = "data/restaurant-verification";

export function verificationPaths(root = defaultLedgerRoot) {
  const resolvedRoot = path.resolve(root);

  return {
    root: resolvedRoot,
    manifest: path.join(resolvedRoot, "manifest.json"),
    ledger: path.join(resolvedRoot, "ledger.jsonl"),
    restaurants: path.join(resolvedRoot, "restaurants"),
    itemChecks: path.join(resolvedRoot, "item-checks"),
    evidence: path.join(resolvedRoot, "evidence"),
    artifacts: path.join(resolvedRoot, "artifacts"),
    summaryMarkdown: path.join(resolvedRoot, "summary.md"),
    summaryCsv: path.join(resolvedRoot, "summary.csv"),
  };
}

export async function initializeVerificationLedger({
  repositoryPath = defaultRepositoryPath,
  root = defaultLedgerRoot,
  now = new Date().toISOString(),
} = {}) {
  const paths = verificationPaths(root);
  const repositoryAbsolutePath = path.resolve(repositoryPath);
  const repositoryBuffer = await readFile(repositoryAbsolutePath);
  const repository = JSON.parse(repositoryBuffer.toString("utf8"));
  const restaurants = [...(repository.restaurants ?? [])].sort(compareRestaurants);

  if (restaurants.length === 0) {
    throw new Error(`No restaurants found in ${repositoryPath}.`);
  }

  const duplicateIds = duplicateValues(restaurants.map((restaurant) => restaurant.id));

  if (duplicateIds.length > 0) {
    throw new Error(`Cannot initialize a ledger with duplicate restaurant ids: ${duplicateIds.join(", ")}`);
  }

  await assertDoesNotExist(paths.manifest, "Verification ledger already exists");
  await mkdir(paths.restaurants, { recursive: true });
  await mkdir(paths.itemChecks, { recursive: true });
  await mkdir(paths.evidence, { recursive: true });
  await mkdir(paths.artifacts, { recursive: true });

  const rows = [];
  let capturedItemCount = 0;

  for (const restaurant of restaurants) {
    assertSafeRestaurantId(restaurant.id);
    const itemChecks = (restaurant.items ?? []).map((item, index) =>
      baselineItemCheck(item, index),
    );
    capturedItemCount += itemChecks.length;
    const itemChecksRelativePath = `item-checks/${restaurant.id}.jsonl`;
    const dossierRelativePath = `restaurants/${restaurant.id}.json`;
    const evidenceRelativePath = `evidence/${restaurant.id}.json`;

    await writeJsonLines(
      path.join(paths.root, itemChecksRelativePath),
      itemChecks,
    );

    rows.push({
      schemaVersion: ledgerSchemaVersion,
      restaurantId: restaurant.id,
      name: restaurant.name,
      rank: restaurant.rank ?? null,
      domain: restaurant.domain ?? null,
      locationId: restaurant.locationId ?? null,
      status: "pending",
      claimedAt: null,
      completedAt: null,
      updatedAt: now,
      attemptCount: 0,
      baseline: {
        itemCount: itemChecks.length,
        itemFingerprint: sha256Json(itemChecks.map((item) => item.baseline)),
        officialItemCount:
          restaurant.allergenDataStatus?.officialItemCount ??
          restaurant.officialItemCount ??
          null,
        officialAllergenStatus: restaurant.officialAllergenStatus ?? null,
        sourceFamily: restaurant.sourceFamily ?? null,
        parserProfile: restaurant.parserProfile ?? null,
        guideUrl: restaurant.guideUrl ?? null,
        sourceUrls: uniqueStrings(restaurant.sourceUrls),
      },
      verdicts: {
        menu: "not_reviewed",
        allergenSource: "not_reviewed",
        extraction: "not_reviewed",
      },
      findingCounts: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      repairStatus: "not_needed",
      paths: {
        dossier: dossierRelativePath,
        evidence: evidenceRelativePath,
        itemChecks: itemChecksRelativePath,
      },
    });
  }

  const manifest = {
    schemaVersion: ledgerSchemaVersion,
    createdAt: now,
    ordering: "alphabetical",
    checkpointSize,
    model: verificationModel,
    baseline: {
      repositoryPath,
      generatedAt: repository.generatedAt ?? null,
      sha256: sha256(repositoryBuffer),
      restaurantCount: restaurants.length,
      itemCount: capturedItemCount,
    },
  };

  await writeJsonAtomic(paths.manifest, manifest);
  await writeJsonLinesAtomic(paths.ledger, rows);
  await generateVerificationSummary({ root, now });

  return { manifest, rows };
}

export async function nextRestaurant({ root = defaultLedgerRoot } = {}) {
  const rows = await readJsonLines(verificationPaths(root).ledger);
  return rows.find((row) => row.status === "pending") ?? null;
}

export async function getRestaurantVerification(restaurantId, { root = defaultLedgerRoot } = {}) {
  const paths = verificationPaths(root);
  const rows = await readJsonLines(paths.ledger);
  const row = requireLedgerRow(rows, restaurantId);
  const dossier = await readJsonIfPresent(path.join(paths.root, row.paths.dossier));
  const evidence = await readJsonIfPresent(path.join(paths.root, row.paths.evidence));

  return { row, dossier, evidence };
}

export function extractToastMenuSnapshot(
  html,
  { restaurantId, sourceUrl, retrievedAt = new Date().toISOString() } = {},
) {
  const $ = cheerio.load(html);
  const cards = [];

  $(".menuSection").each((_sectionIndex, section) => {
    const category = cleanString(
      $(section).children(".headerWrapper").find("h3").first().text() ||
        $(section).find(".headerWrapper h3").first().text(),
    );

    $(section)
      .find('li[data-testid="menu-item-card"]')
      .each((_cardIndex, card) => {
        const link = $(card).find("a[aria-label]").first();
        const name = cleanString(link.attr("aria-label") || $(card).find(".headerText").first().text());
        const description = cleanString(
          $(card).find('[data-testid="item-content-description"]').first().text(),
        );
        const href = cleanString(link.attr("href"));

        if (!category || !name) {
          return;
        }

        cards.push({
          category,
          description,
          name,
          sourceUrl: href ? new URL(href, sourceUrl).toString() : sourceUrl,
        });
      });
  });

  const itemsByName = new Map();
  for (const card of cards) {
    const key = normalizedAuditName(card.name);
    const existing = itemsByName.get(key);
    if (!existing || /^featured items$/i.test(existing.category)) {
      itemsByName.set(key, card);
    }
  }

  const items = [...itemsByName.values()].map((item, index) => ({
    auditItemKey: `${index + 1}:${slugifyAuditName(item.name)}`,
    ...item,
    allergens: [],
    mayContain: [],
    allergenSourceType: "unavailable",
  }));

  return {
    schemaVersion: ledgerSchemaVersion,
    restaurantId: requireNonEmptyString(restaurantId, "Restaurant id"),
    sourceUrl: requireNonEmptyString(sourceUrl, "Source URL"),
    retrievedAt,
    cardCount: cards.length,
    itemCount: items.length,
    items,
  };
}

export function extractSquareOnlineMenuSnapshot(
  html,
  productsResponse,
  {
    restaurantId,
    sourceUrl,
    apiUrl,
    retrievedAt = new Date().toISOString(),
  } = {},
) {
  const bootstrap = parseSquareBootstrapState(html);
  const products = Array.isArray(productsResponse?.data) ? productsResponse.data : [];
  const productsByReference = new Map();

  for (const product of products) {
    for (const reference of [product?.id, product?.site_product_id]) {
      if (reference !== null && reference !== undefined) {
        productsByReference.set(String(reference), product);
      }
    }
  }

  const cells = bootstrap?.siteData?.page?.properties?.contentAreas?.userContent?.content?.cells ?? [];
  const sectionDefinitions = cells
    .map((cell) => cell?.content)
    .filter((content) => String(content?.purpose ?? "").includes("featured-products"))
    .map((content) => ({
      title: cleanString(
        content?.elements
          ?.find((element) => element?.purpose === "title")
          ?.properties?.title?.quill?.ops?.map((operation) => operation?.insert ?? "")
          .join(""),
      ),
      references: uniqueStrings(content?.properties?.products?.map(String)),
    }));
  const menuSections = sectionDefinitions.filter((section) =>
    /^(vegan soups?|meat soups?|broth)$/i.test(section.title ?? ""),
  );
  const nonMenuReferences = new Set(
    sectionDefinitions
      .filter((section) => !menuSections.includes(section))
      .flatMap((section) => section.references),
  );
  const referencedMenuProducts = new Set();
  const sectionByProductId = new Map();
  const categoryVotes = new Map();

  for (const section of menuSections) {
    for (const reference of section.references) {
      const product = productsByReference.get(reference);
      if (!product) continue;

      referencedMenuProducts.add(product.id);
      sectionByProductId.set(product.id, section.title);
      for (const categoryId of product.categoryIds ?? []) {
        const votes = categoryVotes.get(categoryId) ?? new Map();
        votes.set(section.title, (votes.get(section.title) ?? 0) + 1);
        categoryVotes.set(categoryId, votes);
      }
    }
  }

  const sectionByCategoryId = new Map(
    [...categoryVotes].map(([categoryId, votes]) => [
      categoryId,
      [...votes].sort((left, right) => right[1] - left[1])[0][0],
    ]),
  );
  const itemsByProductId = new Map();

  for (const section of menuSections) {
    for (const reference of section.references) {
      const product = productsByReference.get(reference);
      if (product) itemsByProductId.set(product.id, product);
    }
  }

  for (const product of products) {
    const isReferencedOutsideMenu = [product?.id, product?.site_product_id]
      .filter((reference) => reference !== null && reference !== undefined)
      .some((reference) => nonMenuReferences.has(String(reference)));
    const inferredSection = product?.categoryIds
      ?.map((categoryId) => sectionByCategoryId.get(categoryId))
      .find(Boolean);

    if (
      !itemsByProductId.has(product?.id) &&
      inferredSection &&
      !isReferencedOutsideMenu &&
      product?.visibility === "visible" &&
      product?.fulfillable !== false
    ) {
      itemsByProductId.set(product.id, product);
      sectionByProductId.set(product.id, inferredSection);
    }
  }

  const items = [...itemsByProductId.values()].map((product, index) => {
    const description = htmlText(product?.short_description);
    const ingredientText = extractLabeledIngredients(description);
    const allergens = classifyDirectAllergenMentions(ingredientText ?? description, {
      fullDescription: !ingredientText,
    });

    return {
      auditItemKey: `${index + 1}:${slugifyAuditName(product.name)}`,
      productId: String(product.id),
      siteProductId: String(product.site_product_id ?? product.id),
      name: requireNonEmptyString(product.name, "Square product name"),
      category: sectionByProductId.get(product.id) ?? "Menu",
      description,
      ingredientsText: ingredientText,
      availability: product?.inventory?.all_variations_sold_out ? "sold_out" : "available",
      sourceUrl: cleanString(product.absolute_site_link) ?? sourceUrl,
      sourceType: "square-online-api",
      allergens,
      mayContain: [],
      allergenSourceType: ingredientText || allergens.length > 0
        ? "official-ingredients"
        : "unavailable",
    };
  });
  const includedProductIds = new Set(items.map((item) => item.productId));
  const excludedProducts = products
    .filter((product) => !includedProductIds.has(String(product.id)))
    .map((product) => ({
      productId: String(product.id),
      name: cleanString(product.name),
      productType: cleanString(product.product_type),
      reason: "not_in_official_soup_or_broth_menu_sections",
    }));

  return {
    schemaVersion: ledgerSchemaVersion,
    restaurantId: requireNonEmptyString(restaurantId, "Restaurant id"),
    sourceUrl: requireNonEmptyString(sourceUrl, "Source URL"),
    apiUrl: requireNonEmptyString(apiUrl, "API URL"),
    retrievedAt,
    sourceProductCount: products.length,
    itemCount: items.length,
    ingredientDisclosureCount: items.filter((item) => item.allergenSourceType === "official-ingredients").length,
    unavailableAllergenCount: items.filter((item) => item.allergenSourceType === "unavailable").length,
    sections: menuSections.map((section) => section.title),
    excludedProducts,
    items,
  };
}

function parseSquareBootstrapState(html) {
  const markerIndex = String(html).indexOf("window.__BOOTSTRAP_STATE__");
  if (markerIndex < 0) return null;

  const equalsIndex = html.indexOf("=", markerIndex);
  const objectStart = html.indexOf("{", equalsIndex);
  if (equalsIndex < 0 || objectStart < 0) return null;

  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = objectStart; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      return JSON.parse(html.slice(objectStart, index + 1));
    }
  }

  return null;
}

function htmlText(value) {
  if (!cleanString(value)) return null;
  const separatedBlocks = String(value).replace(
    /<(?:br\s*\/?|\/p|\/div|\/li|\/h[1-6])\s*>/gi,
    " ",
  );
  return cleanString(cheerio.load(`<div>${separatedBlocks}</div>`)("div").first().text());
}

function extractLabeledIngredients(description) {
  const marker = /\bingredients\s*:\s*/i.exec(description ?? "");
  return marker ? cleanString(description.slice(marker.index + marker[0].length)) : null;
}

function classifyDirectAllergenMentions(value, { fullDescription = false } = {}) {
  let text = String(value ?? "");

  if (fullDescription) {
    text = text
      .replace(/\b(?:garnish|serve|try serving|enjoy)\b[^.!]*(?:[.!]|$)/gi, " ")
      .replace(/\bwithout\b[^.!]*(?:[.!]|$)/gi, " ")
      .replace(/\bour version of mushroom barley\b[^.]*\binstead of barley\b/gi, " ");
  }

  text = text
    .replace(/\bcoconut milk\b/gi, " ")
    .replace(/\bgluten[- ]free\b/gi, " ")
    .replace(/\bdairy[- ]free\b/gi, " ")
    .replace(/\bbuckwheat\b/gi, " ");

  const patterns = [
    ["shellfish", /\b(?:shrimp|prawn|crab|lobster|clam|oyster|scallop|mussel)s?\b/i],
    ["milk", /\b(?:milk|butter|cream|cheese|yogurt|whey|casein)\b/i],
    ["peanut", /\bpeanuts?\b/i],
    ["tree-nut", /\b(?:almond|pecan|walnut|cashew|pistachio|hazelnut|macadamia)s?\b/i],
    ["egg", /\beggs?\b/i],
    ["fish", /\b(?:anchovy|salmon|tuna|cod|haddock|trout|tilapia)s?\b/i],
    ["wheat", /\b(?:wheat|flour|barley|rye)\b/i],
    ["soy", /\b(?:soybeans?|soy sauce|tofu|miso|tamari)\b/i],
    ["sesame", /\b(?:sesame|tahini)\b/i],
    ["mustard", /\bmustard\b/i],
    ["sulfites", /\bsulphites?\b|\bsulfites?\b/i],
  ];

  return patterns.filter(([, pattern]) => pattern.test(text)).map(([allergen]) => allergen);
}

export async function claimRestaurant({
  restaurantId,
  root = defaultLedgerRoot,
  now = new Date().toISOString(),
} = {}) {
  const paths = verificationPaths(root);
  const rows = await readJsonLines(paths.ledger);
  const row = restaurantId
    ? requireLedgerRow(rows, restaurantId)
    : rows.find((candidate) => candidate.status === "pending");

  if (!row) {
    return null;
  }

  transitionStatus(row, "in_progress");
  row.claimedAt = row.claimedAt ?? now;
  row.updatedAt = now;
  row.attemptCount += 1;
  row.verificationContractVersion = verificationContractVersion;

  const dossierPath = path.join(paths.root, row.paths.dossier);
  const evidencePath = path.join(paths.root, row.paths.evidence);
  const existingDossier = await readJsonIfPresent(dossierPath);
  const existingEvidence = await readJsonIfPresent(evidencePath);

  if (!existingDossier) {
    await writeJsonAtomic(dossierPath, createDossier(row, now));
  }

  if (!existingEvidence) {
    await writeJsonAtomic(evidencePath, {
      schemaVersion: ledgerSchemaVersion,
      restaurantId: row.restaurantId,
      sources: [],
    });
  }

  await writeJsonLinesAtomic(paths.ledger, rows);
  await generateVerificationSummary({ root, now });
  return getRestaurantVerification(row.restaurantId, { root });
}

export async function recordRestaurantVerification({
  restaurantId,
  input,
  root = defaultLedgerRoot,
  now = new Date().toISOString(),
} = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("record requires a JSON object input packet.");
  }

  const paths = verificationPaths(root);
  const rows = await readJsonLines(paths.ledger);
  const row = requireLedgerRow(rows, restaurantId);

  if (row.status === "pending") {
    throw new Error(`${restaurantId} must be claimed before evidence can be recorded.`);
  }
  if (terminalStatuses.includes(row.status) && input.status !== "recheck_required") {
    throw new Error(`${restaurantId} is terminal and must transition to recheck_required before mutation.`);
  }
  if (terminalStatuses.includes(row.status) && input.status === "recheck_required") {
    row.verificationContractVersion = verificationContractVersion;
  }

  const dossierPath = path.join(paths.root, row.paths.dossier);
  const evidencePath = path.join(paths.root, row.paths.evidence);
  const itemChecksPath = path.join(paths.root, row.paths.itemChecks);
  const dossier = (await readJsonIfPresent(dossierPath)) ?? createDossier(row, now);
  const evidence = (await readJsonIfPresent(evidencePath)) ?? {
    schemaVersion: ledgerSchemaVersion,
    restaurantId,
    sources: [],
  };

  if (input.checks) {
    dossier.checks = deepMergeChecks(dossier.checks, input.checks);
  }

  if (input.currentCatalog) {
    dossier.currentCatalog = normalizeCurrentCatalog(input.currentCatalog);
  }

  if (input.adjudication) {
    dossier.adjudication = normalizeAdjudication(input.adjudication);
  }

  if (input.workerHandoff) {
    dossier.workerHandoff = normalizeWorkerHandoff(input.workerHandoff, restaurantId);
  }

  if (input.sourceAttempts) {
    dossier.sourceAttempts = mergeById(
      dossier.sourceAttempts,
      input.sourceAttempts.map(normalizeSourceAttempt),
    );
  }

  if (input.findings) {
    const normalizedFindings = input.findings.map(normalizeFinding);
    dossier.findings = input.replaceFindings === true
      ? normalizedFindings
      : mergeById(dossier.findings, normalizedFindings);
  }

  if (input.repairs) {
    const normalizedRepairs = input.repairs.map(normalizeRepair);
    dossier.repairs = input.replaceRepairs === true
      ? normalizedRepairs
      : mergeById(dossier.repairs, normalizedRepairs);
  }

  if (input.notes) {
    dossier.notes = uniqueStrings([...(dossier.notes ?? []), ...input.notes]);
  }

  if (input.evidence) {
    const normalizedEvidence = input.evidence.map(normalizeEvidenceSource);
    evidence.sources = input.replaceEvidence === true
      ? normalizedEvidence
      : mergeById(evidence.sources, normalizedEvidence);
  }

  if (input.itemChecks) {
    const itemChecks = await readJsonLines(itemChecksPath);
    applyItemCheckUpdates(itemChecks, input.itemChecks);
    await writeJsonLinesAtomic(itemChecksPath, itemChecks);
  }

  if (input.status && input.status !== row.status) {
    transitionStatus(row, input.status);
  }

  dossier.status = row.status;
  dossier.verificationContractVersion = row.verificationContractVersion ?? dossier.verificationContractVersion ?? 1;
  dossier.updatedAt = now;
  row.updatedAt = now;
  syncLedgerSummary(row, dossier);

  await writeJsonAtomic(dossierPath, dossier);
  await writeJsonAtomic(evidencePath, evidence);
  await writeJsonLinesAtomic(paths.ledger, rows);
  await generateVerificationSummary({ root, now });

  return { row, dossier, evidence };
}

export async function captureEvidenceSource({
  restaurantId,
  sourceId,
  url,
  authorityTier,
  purpose,
  root = defaultLedgerRoot,
  now = new Date().toISOString(),
} = {}) {
  const paths = verificationPaths(root);
  const rows = await readJsonLines(paths.ledger);
  const row = requireLedgerRow(rows, restaurantId);

  if (row.status === "pending") {
    throw new Error(`${restaurantId} must be claimed before evidence can be captured.`);
  }
  if (terminalStatuses.includes(row.status)) {
    throw new Error(`${restaurantId} is terminal and must transition to recheck_required before evidence capture.`);
  }

  const safeSourceId = requireNonEmptyString(sourceId, "Source id");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(safeSourceId)) {
    throw new Error(`Unsafe source id for artifact paths: ${safeSourceId}.`);
  }

  const sourceUrl = requireNonEmptyString(url, "Source URL");
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/json,application/pdf;q=0.9,*/*;q=0.8",
      "user-agent": "SafePlate restaurant verification ledger/1.0",
    },
    redirect: "follow",
  });
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw new Error(`Evidence fetch failed (${response.status}) for ${sourceUrl}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  const extension = evidenceArtifactExtension(contentType, response.url);
  const relativeArtifactPath = `artifacts/${restaurantId}/${safeSourceId}.${extension}`;
  const artifactPath = path.join(paths.root, relativeArtifactPath);
  await writeFileAtomic(artifactPath, buffer);

  const evidencePath = path.join(paths.root, row.paths.evidence);
  const evidence = (await readJsonIfPresent(evidencePath)) ?? {
    schemaVersion: ledgerSchemaVersion,
    restaurantId,
    sources: [],
  };
  const source = normalizeEvidenceSource({
    id: safeSourceId,
    url: sourceUrl,
    finalUrl: response.url,
    authorityTier,
    purpose,
    retrievedAt: now,
    contentType,
    httpStatus: response.status,
    byteLength: buffer.length,
    sha256: sha256(buffer),
    artifactPath: relativeArtifactPath,
    request: { method: "GET" },
  });
  evidence.sources = mergeById(evidence.sources, [source]);
  await writeJsonAtomic(evidencePath, evidence);

  return source;
}

export async function completeRestaurantVerification({
  restaurantId,
  status,
  root = defaultLedgerRoot,
  now = new Date().toISOString(),
} = {}) {
  if (!terminalStatuses.includes(status)) {
    throw new Error(`Completion status must be one of: ${terminalStatuses.join(", ")}.`);
  }

  const paths = verificationPaths(root);
  const rows = await readJsonLines(paths.ledger);
  const row = requireLedgerRow(rows, restaurantId);
  const dossierPath = path.join(paths.root, row.paths.dossier);
  const evidencePath = path.join(paths.root, row.paths.evidence);
  const itemChecksPath = path.join(paths.root, row.paths.itemChecks);
  const dossier = await readJsonRequired(dossierPath);
  const evidence = await readJsonRequired(evidencePath);
  const itemChecks = await readJsonLines(itemChecksPath);

  if ((row.verificationContractVersion ?? 1) >= verificationContractVersion) {
    await validateV2ArtifactIntegrity({ root: paths.root, dossier, evidence });
  }
  validateTerminalState({ row, dossier, evidence, itemChecks, status });
  transitionStatus(row, status);
  row.completedAt = now;
  row.updatedAt = now;
  dossier.status = status;
  dossier.completedAt = now;
  dossier.updatedAt = now;
  syncLedgerSummary(row, dossier);

  await writeJsonAtomic(dossierPath, dossier);
  await writeJsonLinesAtomic(paths.ledger, rows);
  await generateVerificationSummary({ root, now });

  return { row, dossier, evidence };
}

export async function validateVerificationLedger({ root = defaultLedgerRoot } = {}) {
  const paths = verificationPaths(root);
  const manifest = await readJsonRequired(paths.manifest);
  const rows = await readJsonLines(paths.ledger);
  const errors = [];

  if (manifest.schemaVersion !== ledgerSchemaVersion) {
    errors.push(`Unsupported manifest schema version ${manifest.schemaVersion}.`);
  }

  if (rows.length !== manifest.baseline.restaurantCount) {
    errors.push(
      `Ledger has ${rows.length} restaurants; baseline requires ${manifest.baseline.restaurantCount}.`,
    );
  }

  const duplicates = duplicateValues(rows.map((row) => row.restaurantId));
  if (duplicates.length > 0) {
    errors.push(`Duplicate restaurant ids: ${duplicates.join(", ")}.`);
  }

  const sortedIds = [...rows].sort(compareLedgerRows).map((row) => row.restaurantId);
  if (JSON.stringify(sortedIds) !== JSON.stringify(rows.map((row) => row.restaurantId))) {
    errors.push("Ledger rows are not in stable alphabetical order.");
  }

  let itemCount = 0;
  for (const row of rows) {
    if (!ledgerStatuses.includes(row.status)) {
      errors.push(`${row.restaurantId}: invalid status ${row.status}.`);
      continue;
    }

    const itemChecks = await readJsonLines(path.join(paths.root, row.paths.itemChecks));
    itemCount += itemChecks.length;

    if (itemChecks.length !== row.baseline.itemCount) {
      errors.push(
        `${row.restaurantId}: ${itemChecks.length} item checks; expected ${row.baseline.itemCount}.`,
      );
    }

    const fingerprint = sha256Json(itemChecks.map((item) => item.baseline));
    if (fingerprint !== row.baseline.itemFingerprint) {
      errors.push(`${row.restaurantId}: baseline item fingerprint changed.`);
    }

    for (const itemCheck of itemChecks) {
      if (!itemDispositions.includes(itemCheck.disposition)) {
        errors.push(
          `${row.restaurantId}/${itemCheck.auditItemKey}: invalid disposition ${itemCheck.disposition}.`,
        );
      }

      if (!allergenVerdicts.includes(itemCheck.allergenVerdict)) {
        errors.push(
          `${row.restaurantId}/${itemCheck.auditItemKey}: invalid allergen verdict ${itemCheck.allergenVerdict}.`,
        );
      }
    }

    if (terminalStatuses.includes(row.status)) {
      try {
        const dossier = await readJsonRequired(path.join(paths.root, row.paths.dossier));
        const evidence = await readJsonRequired(path.join(paths.root, row.paths.evidence));
        if ((row.verificationContractVersion ?? 1) >= verificationContractVersion) {
          await validateV2ArtifactIntegrity({ root: paths.root, dossier, evidence });
        }
        validateTerminalState({
          row,
          dossier,
          evidence,
          itemChecks,
          status: row.status,
        });
      } catch (error) {
        errors.push(`${row.restaurantId}: ${error.message}`);
      }
    }
  }

  if (itemCount !== manifest.baseline.itemCount) {
    errors.push(`Ledger has ${itemCount} item checks; baseline requires ${manifest.baseline.itemCount}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    restaurantCount: rows.length,
    itemCount,
  };
}

export async function generateVerificationSummary({
  root = defaultLedgerRoot,
  now = new Date().toISOString(),
} = {}) {
  const paths = verificationPaths(root);
  const manifest = await readJsonRequired(paths.manifest);
  const rows = await readJsonLines(paths.ledger);
  const statusCounts = Object.fromEntries(ledgerStatuses.map((status) => [status, 0]));

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  }

  const completed = terminalStatuses.reduce((sum, status) => sum + statusCounts[status], 0);
  const next = rows.find((row) => row.status === "pending") ?? null;
  const markdown = [
    "# Restaurant Verification Ledger",
    "",
    `Generated: ${now}`,
    "",
    `Baseline: ${manifest.baseline.restaurantCount} restaurants, ${manifest.baseline.itemCount} items`,
    "",
    `Baseline SHA-256: \`${manifest.baseline.sha256}\``,
    "",
    `Model: \`${manifest.model.id}\` (${manifest.model.reasoningEffort})`,
    "",
    `Progress: ${completed}/${rows.length} (${percentage(completed, rows.length)}%)`,
    "",
    next ? `Next restaurant: **${next.name}** (\`${next.restaurantId}\`)` : "Next restaurant: none",
    "",
    "## Status",
    "",
    "| Status | Count |",
    "| --- | ---: |",
    ...ledgerStatuses.map((status) => `| ${status} | ${statusCounts[status]} |`),
    "",
  ].join("\n");
  const csvHeaders = [
    "restaurantId",
    "name",
    "status",
    "itemCount",
    "menuVerdict",
    "allergenSourceVerdict",
    "extractionVerdict",
    "criticalFindings",
    "highFindings",
    "repairStatus",
    "updatedAt",
  ];
  const csv = [
    csvHeaders.join(","),
    ...rows.map((row) =>
      [
        row.restaurantId,
        row.name,
        row.status,
        row.baseline.itemCount,
        row.verdicts.menu,
        row.verdicts.allergenSource,
        row.verdicts.extraction,
        row.findingCounts.critical,
        row.findingCounts.high,
        row.repairStatus,
        row.updatedAt,
      ]
        .map(csvCell)
        .join(","),
    ),
    "",
  ].join("\n");

  await writeFileAtomic(paths.summaryMarkdown, markdown);
  await writeFileAtomic(paths.summaryCsv, csv);

  return { completed, next, statusCounts, total: rows.length };
}

function baselineItemCheck(item, index) {
  const itemId = cleanString(item?.id) ?? `item-${index + 1}`;

  return {
    schemaVersion: ledgerSchemaVersion,
    auditItemKey: `${index + 1}:${itemId}`,
    baselineIndex: index,
    baseline: {
      itemId,
      name: cleanString(item?.name) ?? "",
      category: cleanString(item?.category) ?? "Menu",
      variantGroup: cleanString(item?.variantGroup),
      isConfigurable: Boolean(item?.isConfigurable),
      allergens: uniqueStrings(item?.allergens),
      mayContain: uniqueStrings(item?.mayContain),
      allergenSourceType: cleanString(item?.allergenSourceType),
      sourceType: cleanString(item?.sourceType),
      sourceUrls: uniqueStrings(item?.sourceUrls),
    },
    disposition: "pending",
    allergenVerdict: "pending",
    sourceEvidenceIds: [],
    notes: null,
  };
}

function createDossier(row, now) {
  return {
    schemaVersion: ledgerSchemaVersion,
    verificationContractVersion: row.verificationContractVersion ?? verificationContractVersion,
    restaurantId: row.restaurantId,
    name: row.name,
    status: row.status,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    model: verificationModel,
    checks: defaultChecks(),
    currentCatalog: {
      status: "not_reviewed",
      reviewedBaselineItemCount: 0,
      currentProductCount: 0,
      reconciledCurrentProductCount: 0,
      inventoryFingerprint: sha256Json([]),
      surfaces: [],
      products: [],
      notes: [],
    },
    adjudication: null,
    workerHandoff: null,
    sourceAttempts: [],
    findings: [],
    repairs: [],
    notes: [],
  };
}

function validateTerminalState({ row, dossier, evidence, itemChecks, status }) {
  if (dossier.restaurantId !== row.restaurantId || evidence.restaurantId !== row.restaurantId) {
    throw new Error("Dossier or evidence restaurant id does not match the ledger row.");
  }

  if (itemChecks.length !== row.baseline.itemCount) {
    throw new Error(`Expected ${row.baseline.itemCount} item checks; found ${itemChecks.length}.`);
  }

  if (status === "blocked_unverifiable") {
    const attemptKinds = new Set(dossier.sourceAttempts.map((attempt) => attempt.kind));
    const missingAttemptKinds = blockedAttemptKinds.filter((kind) => !attemptKinds.has(kind));

    if (missingAttemptKinds.length > 0) {
      throw new Error(
        `Blocked status is missing exhaustive source attempts: ${missingAttemptKinds.join(", ")}.`,
      );
    }

    if (!dossier.sourceAttempts.every((attempt) => attempt.attemptedAt && attempt.outcome)) {
      throw new Error("Every blocked source attempt requires attemptedAt and outcome.");
    }

    if ((row.verificationContractVersion ?? 1) >= verificationContractVersion) {
      validateV2TerminalState({ row, dossier, evidence, itemChecks, status });
    }

    return;
  }

  const pendingItems = itemChecks.filter(
    (item) => item.disposition === "pending" || item.allergenVerdict === "pending",
  );
  if (pendingItems.length > 0) {
    throw new Error(`${pendingItems.length} item checks are still pending.`);
  }

  if (dossier.checks.menu.verdict !== "verified") {
    throw new Error("Menu check must be verified.");
  }

  if (!new Set(["verified", "accurately_unavailable"]).has(dossier.checks.allergenSource.verdict)) {
    throw new Error("Allergen source check must be verified or accurately_unavailable.");
  }

  if (!new Set(["verified", "not_applicable"]).has(dossier.checks.extraction.verdict)) {
    throw new Error("Extraction check must be verified or not_applicable.");
  }

  if (dossier.checks.extraction.verdict === "verified") {
    if (!dossier.checks.extraction.parserReviewed || !dossier.checks.extraction.semanticsVerified) {
      throw new Error("Verified extraction requires parser and source-semantics review.");
    }
  }

  if ((evidence.sources ?? []).length === 0) {
    throw new Error("Verified status requires at least one evidence source.");
  }

  for (const source of evidence.sources) {
    validateEvidenceSource(source);
  }

  const unresolvedSevereFindings = dossier.findings.filter(
    (finding) => ["critical", "high"].includes(finding.severity) && !finding.resolved,
  );
  if (unresolvedSevereFindings.length > 0) {
    throw new Error(`${unresolvedSevereFindings.length} critical/high findings remain unresolved.`);
  }

  const incompleteRepairs = dossier.repairs.filter((repair) => repair.status !== "verified");
  if (incompleteRepairs.length > 0) {
    throw new Error(`${incompleteRepairs.length} repairs have not been verified.`);
  }

  if ((row.verificationContractVersion ?? 1) >= verificationContractVersion) {
    validateV2TerminalState({ row, dossier, evidence, itemChecks, status });
  }
}

function validateV2TerminalState({ row, dossier, evidence, itemChecks, status }) {
  if (dossier.verificationContractVersion !== verificationContractVersion) {
    throw new Error(`Dossier must use verification contract v${verificationContractVersion}.`);
  }
  const evidenceById = new Map((evidence.sources ?? []).map((source) => [source.id, source]));
  if (evidenceById.size !== (evidence.sources ?? []).length) {
    throw new Error("Evidence source IDs must be unique.");
  }
  for (const source of evidence.sources ?? []) {
    if (source.sha256 && !/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error(`Evidence source ${source.id} has an invalid SHA-256.`);
  }
  validateAdjudicationForStatus(dossier.adjudication, status);
  validateWorkerHandoff(dossier.workerHandoff, row.restaurantId);

  if (status === "blocked_unverifiable") {
    if (dossier.currentCatalog?.status !== "unverifiable") {
      throw new Error("Blocked status requires an explicitly unverifiable current catalog.");
    }
    validateBlockedAttemptsV2(dossier.sourceAttempts, evidenceById);
    for (const item of itemChecks) {
      const excludedArtifact = item.disposition === "artifact" && item.allergenVerdict === "not_applicable";
      if (!excludedArtifact && item.allergenVerdict !== "accurately_unavailable") {
        throw new Error(`${item.auditItemKey}: blocked status requires accurately_unavailable allergen reconciliation.`);
      }
      if (["exact_match", "normalized_match", "variant_match"].includes(item.disposition)) {
        throw new Error(`${item.auditItemKey}: blocked status cannot claim a verified current product match.`);
      }
      assertEvidenceReferences(item.sourceEvidenceIds ?? [], evidenceById, `${item.auditItemKey} blocked item`);
    }
    for (const finding of dossier.findings ?? []) {
      assertEvidenceReferences(finding.evidenceIds ?? [], evidenceById, `finding ${finding.id}`);
      if (!finding.resolved || !finding.resolution) throw new Error(`Finding ${finding.id} remains unresolved.`);
    }
    for (const repair of dossier.repairs ?? []) {
      if (repair.status !== "verified" || !repair.files.length || !repair.fixturePaths.length || !repair.verificationCommands.length) {
        throw new Error(`Repair ${repair.id} lacks verified files, fixtures, or commands.`);
      }
    }
    return;
  }

  validateCurrentCatalog({ catalog: dossier.currentCatalog, row, itemChecks, evidenceById });
  const findingById = new Map((dossier.findings ?? []).map((finding) => [finding.id, finding]));
  for (const item of itemChecks) {
    if (!(item.sourceEvidenceIds ?? []).length) {
      throw new Error(`${item.auditItemKey}: item reconciliation needs menu evidence.`);
    }
    assertEvidenceReferences(item.sourceEvidenceIds, evidenceById, `${item.auditItemKey} menu`);
    assertEvidenceReferences(item.allergenSourceEvidenceIds ?? [], evidenceById, `${item.auditItemKey} allergen`);
    if (["verified", "mismatch"].includes(item.allergenVerdict)) {
      if (!item.adjudicatedAllergenSourceType) {
        throw new Error(`${item.auditItemKey}: verified allergen semantics require a source type.`);
      }
      if (!sourceAuthorityTiers.includes(item.adjudicatedAllergenAuthorityTier)) {
        throw new Error(`${item.auditItemKey}: verified allergen semantics require a valid authority tier.`);
      }
      if (!(item.allergenSourceEvidenceIds ?? []).length) {
        throw new Error(`${item.auditItemKey}: verified allergen semantics require allergen evidence.`);
      }
      const allergenSources = item.allergenSourceEvidenceIds.map((id) => evidenceById.get(id));
      if (!allergenSources.some((source) => source.authorityTier === item.adjudicatedAllergenAuthorityTier)) {
        throw new Error(`${item.auditItemKey}: allergen evidence does not support the adjudicated authority tier.`);
      }
      if (!allergenSources.some((source) => ["allergen", "ingredients", "cross_contact", "both"].includes(source.purpose))) {
        throw new Error(`${item.auditItemKey}: allergen evidence purpose cannot support allergen semantics.`);
      }
    }
    if (item.allergenVerdict === "mismatch") {
      if (!(item.resolvedFindingIds ?? []).length) {
        throw new Error(`${item.auditItemKey}: a repaired mismatch needs resolved finding linkage.`);
      }
      for (const findingId of item.resolvedFindingIds) {
        const finding = findingById.get(findingId);
        if (!finding?.resolved || !finding.resolution) {
          throw new Error(`${item.auditItemKey}: linked finding ${findingId} is not resolved.`);
        }
      }
    }
  }
  for (const finding of dossier.findings ?? []) {
    assertEvidenceReferences(finding.evidenceIds ?? [], evidenceById, `finding ${finding.id}`);
    if (!finding.resolved || !finding.resolution) {
      throw new Error(`Finding ${finding.id} remains unresolved.`);
    }
  }
  for (const repair of dossier.repairs ?? []) {
    if (repair.status !== "verified" || !repair.files.length || !repair.fixturePaths.length || !repair.verificationCommands.length) {
      throw new Error(`Repair ${repair.id} lacks verified files, fixtures, or commands.`);
    }
  }
}

async function validateV2ArtifactIntegrity({ root, dossier, evidence }) {
  const allowedRoot = path.resolve(root, "..");
  const verifyArtifact = async ({ artifactPath, sha256: expectedHash, label }) => {
    const absolute = path.resolve(root, artifactPath);
    if (absolute !== allowedRoot && !absolute.startsWith(`${allowedRoot}${path.sep}`)) {
      throw new Error(`${label} escapes the allowed verification data root.`);
    }
    let buffer;
    try {
      buffer = await readFile(absolute);
    } catch (error) {
      if (error.code === "ENOENT") throw new Error(`${label} artifact is missing: ${artifactPath}.`);
      throw error;
    }
    if (sha256(buffer) !== expectedHash) throw new Error(`${label} artifact hash does not match.`);
  };
  for (const source of evidence.sources ?? []) {
    if (source.artifactPath && source.sha256) {
      await verifyArtifact({ artifactPath: source.artifactPath, sha256: source.sha256, label: `Evidence ${source.id}` });
    }
  }
  for (const artifact of dossier.workerHandoff?.artifacts ?? []) {
    await verifyArtifact({ artifactPath: artifact.path, sha256: artifact.sha256, label: `Worker ${artifact.kind}` });
  }
}

function validateCurrentCatalog({ catalog, row, itemChecks, evidenceById }) {
  if (catalog?.status !== "verified") throw new Error("Current catalog must be verified.");
  if (catalog.reviewedBaselineItemCount !== row.baseline.itemCount) {
    throw new Error("Current catalog reviewed-baseline count does not match the frozen baseline.");
  }
  if (catalog.currentProductCount !== catalog.products.length) {
    throw new Error("Current catalog product count does not match its product records.");
  }
  if (catalog.reconciledCurrentProductCount !== catalog.products.length) {
    throw new Error("Every current product must be coordinator-reviewed and reconciled.");
  }
  if ((catalog.products.length > 0 || itemChecks.length > 0) && !(catalog.surfaces ?? []).length) {
    throw new Error("A nonempty current catalog or baseline requires at least one complete menu surface.");
  }
  if ((catalog.surfaces ?? []).some((surface) => !surface.verified || surface.current !== true || surface.scopeStatus !== "complete")) {
    throw new Error("Every in-scope current menu surface must be complete and verified.");
  }
  const productKeys = catalog.products.map((product) => product.currentProductKey);
  if (new Set(productKeys).size !== productKeys.length) throw new Error("Current product keys must be unique.");
  const productByKey = new Map(catalog.products.map((product) => [product.currentProductKey, product]));
  if (catalog.products.some((product) => !product.coordinatorReviewed)) {
    throw new Error("Every current product needs explicit coordinator review.");
  }
  const expectedFingerprint = sha256Json(catalog.products.map(currentProductFingerprintRecord));
  if (catalog.inventoryFingerprint !== expectedFingerprint) throw new Error("Current catalog inventory fingerprint is stale.");
  const auditKeys = new Set(itemChecks.map((item) => item.auditItemKey));
  for (const surface of catalog.surfaces) {
    assertEvidenceReferences(surface.evidenceIds, evidenceById, `surface ${surface.surfaceId}`);
  }
  for (const product of catalog.products) {
    assertEvidenceReferences(product.sourceEvidenceIds, evidenceById, `current product ${product.currentProductKey}`);
    assertEvidenceReferences(product.allergenSourceEvidenceIds, evidenceById, `current product ${product.currentProductKey} allergen`);
    for (const auditItemKey of product.matchedBaselineAuditItemKeys) {
      if (!auditKeys.has(auditItemKey)) throw new Error(`Current product ${product.currentProductKey} references an unknown baseline item.`);
    }
    if (product.allergenAuthorityTier && product.allergenSourceEvidenceIds.length > 0 &&
        !product.allergenSourceEvidenceIds.some((id) => evidenceById.get(id)?.authorityTier === product.allergenAuthorityTier)) {
      throw new Error(`Current product ${product.currentProductKey} promotes unsupported allergen authority.`);
    }
  }
  const itemByAuditKey = new Map(itemChecks.map((item) => [item.auditItemKey, item]));
  const matchedDispositions = new Set(["exact_match", "normalized_match", "variant_match"]);
  const unmatchedDispositions = new Set(["missing_from_source", "stale_extra", "artifact"]);
  for (const item of itemChecks) {
    const matchedKeys = item.matchedCurrentProductKeys ?? [];
    if (matchedDispositions.has(item.disposition) && matchedKeys.length === 0) {
      throw new Error(`${item.auditItemKey}: ${item.disposition} requires a current product match.`);
    }
    if (unmatchedDispositions.has(item.disposition) && matchedKeys.length > 0) {
      throw new Error(`${item.auditItemKey}: ${item.disposition} cannot reference a current product.`);
    }
    for (const productKey of matchedKeys) {
      const product = productByKey.get(productKey);
      if (!product) throw new Error(`${item.auditItemKey}: references unknown current product ${productKey}.`);
      if (!product.matchedBaselineAuditItemKeys.includes(item.auditItemKey)) {
        throw new Error(`${item.auditItemKey}: current product ${productKey} is missing the inverse baseline link.`);
      }
    }
  }
  for (const product of catalog.products) {
    for (const auditItemKey of product.matchedBaselineAuditItemKeys) {
      if (!(itemByAuditKey.get(auditItemKey)?.matchedCurrentProductKeys ?? []).includes(product.currentProductKey)) {
        throw new Error(`Current product ${product.currentProductKey} is missing the inverse item link for ${auditItemKey}.`);
      }
    }
  }
}

function validateBlockedAttemptsV2(attempts, evidenceById) {
  const byKind = new Map((attempts ?? []).map((attempt) => [attempt.kind, attempt]));
  for (const kind of blockedAttemptKinds) {
    const attempt = byKind.get(kind);
    if (!attempt) throw new Error(`Blocked status is missing source attempt: ${kind}.`);
    if (!new Set(["not_found", "blocked", "error", "contradictory"]).has(attempt.status)) {
      throw new Error(`Blocked source attempt ${attempt.id} needs a structured failure status.`);
    }
    if (!attempt.url && !attempt.query && !attempt.request) {
      throw new Error(`Blocked source attempt ${attempt.id} needs a URL, query, or request anchor.`);
    }
    if (!attempt.scopeImpact) throw new Error(`Blocked source attempt ${attempt.id} needs scope impact.`);
    assertEvidenceReferences(attempt.evidenceIds ?? [], evidenceById, `source attempt ${attempt.id}`);
  }
}

export function validateAdjudicationForStatus(adjudication, status) {
  if (!adjudication) throw new Error("Terminal status requires an explicit coordinator adjudication.");
  const solAdjudication = adjudication.model?.id === verificationModel.id &&
    adjudication.model?.reasoningEffort === verificationModel.reasoningEffort;
  const pocCoordinatorAdjudication = adjudication.type === "coordinator" &&
    String(adjudication.runId ?? "").startsWith("poc-") &&
    adjudication.model?.id === pocCoordinatorModel.id &&
    adjudication.model?.reasoningEffort === pocCoordinatorModel.reasoningEffort;
  if (!solAdjudication && !pocCoordinatorAdjudication) {
    throw new Error("Terminal adjudication must use Sol-medium or the POC coordinator contract.");
  }
  if (adjudication.recommendation !== status) {
    throw new Error(`Adjudication recommendation ${adjudication.recommendation} does not match ${status}.`);
  }
  if (!adjudication.rationale || !adjudication.decidedAt) throw new Error("Terminal adjudication needs time and rationale.");
}

export function validateWorkerHandoff(handoff, restaurantId) {
  if (!handoff || handoff.restaurantId !== restaurantId) throw new Error("Terminal status requires a matching worker handoff.");
  if (!(handoff.artifacts ?? []).length) throw new Error("Worker handoff needs hashed artifacts.");
  for (const artifact of handoff.artifacts) {
    if (!artifact.path || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "")) throw new Error("Worker handoff artifact hashes are invalid.");
  }
  const pocHandoff = String(handoff.runId).startsWith("poc-") ||
    handoff.artifacts.some((artifact) => artifact.kind.startsWith("poc_"));
  const requiredKinds = new Set(pocHandoff
    ? ["poc_job", "poc_research"]
    : ["job", "scout_result", "scout_route", "terra_result", "terra_route"]);
  for (const kind of requiredKinds) {
    if (!handoff.artifacts.some((artifact) => artifact.kind === kind)) throw new Error(`Worker handoff is missing ${kind}.`);
  }
  if (handoff.solRequired) {
    for (const kind of ["sol_review", "sol_validation"]) {
      if (!handoff.artifacts.some((artifact) => artifact.kind === kind)) throw new Error(`Worker handoff is missing ${kind}.`);
    }
  }
}

function assertEvidenceReferences(ids, evidenceById, label) {
  for (const id of ids ?? []) {
    if (!evidenceById.has(id)) throw new Error(`${label} references unknown evidence ${id}.`);
  }
}

function syncLedgerSummary(row, dossier) {
  row.verdicts = {
    menu: dossier.checks.menu.verdict,
    allergenSource: dossier.checks.allergenSource.verdict,
    extraction: dossier.checks.extraction.verdict,
  };
  row.findingCounts = {
    critical: dossier.findings.filter((finding) => finding.severity === "critical").length,
    high: dossier.findings.filter((finding) => finding.severity === "high").length,
    medium: dossier.findings.filter((finding) => finding.severity === "medium").length,
    low: dossier.findings.filter((finding) => finding.severity === "low").length,
  };
  row.repairStatus = dossier.repairs.length === 0
    ? "not_needed"
    : dossier.repairs.every((repair) => repair.status === "verified")
      ? "verified"
      : "pending";
}

function transitionStatus(row, nextStatus) {
  if (!ledgerStatuses.includes(nextStatus)) {
    throw new Error(`Unknown ledger status: ${nextStatus}.`);
  }

  if (row.status === nextStatus) {
    return;
  }

  if (!allowedTransitions.get(row.status)?.has(nextStatus)) {
    throw new Error(`Illegal status transition for ${row.restaurantId}: ${row.status} -> ${nextStatus}.`);
  }

  row.status = nextStatus;
}

function deepMergeChecks(current, updates) {
  const result = {
    ...defaultChecks(),
    ...structuredClone(current ?? {}),
  };

  for (const checkName of ["menu", "allergenSource", "extraction"]) {
    if (!updates[checkName]) {
      continue;
    }

    result[checkName] = { ...result[checkName], ...updates[checkName] };
    if (updates[checkName].notes) {
      result[checkName].notes = uniqueStrings([
        ...(current?.[checkName]?.notes ?? []),
        ...updates[checkName].notes,
      ]);
    }
  }

  return result;
}

function defaultChecks() {
  return {
    menu: {
      verdict: "not_reviewed",
      reviewedItemCount: 0,
      sourceItemCount: null,
      notes: [],
    },
    allergenSource: {
      verdict: "not_reviewed",
      highestAuthorityTier: null,
      notes: [],
    },
    extraction: {
      verdict: "not_reviewed",
      parserReviewed: false,
      semanticsVerified: false,
      notes: [],
    },
  };
}

function applyItemCheckUpdates(itemChecks, updates) {
  const byKey = new Map(itemChecks.map((item) => [item.auditItemKey, item]));

  for (const update of updates) {
    const target = byKey.get(update.auditItemKey);
    if (!target) {
      throw new Error(`Unknown auditItemKey: ${update.auditItemKey}.`);
    }

    if (update.disposition && !itemDispositions.includes(update.disposition)) {
      throw new Error(`Invalid item disposition: ${update.disposition}.`);
    }

    if (update.allergenVerdict && !allergenVerdicts.includes(update.allergenVerdict)) {
      throw new Error(`Invalid allergen verdict: ${update.allergenVerdict}.`);
    }

    Object.assign(target, {
      disposition: update.disposition ?? target.disposition,
      allergenVerdict: update.allergenVerdict ?? target.allergenVerdict,
      sourceEvidenceIds: update.sourceEvidenceIds
        ? uniqueStrings(update.sourceEvidenceIds)
        : target.sourceEvidenceIds,
      matchedCurrentProductKeys: update.matchedCurrentProductKeys
        ? uniqueStrings(update.matchedCurrentProductKeys)
        : target.matchedCurrentProductKeys ?? [],
      adjudicatedContainsAllergens: update.adjudicatedContainsAllergens
        ? uniqueStrings(update.adjudicatedContainsAllergens)
        : target.adjudicatedContainsAllergens ?? [],
      adjudicatedMayContainAllergens: update.adjudicatedMayContainAllergens
        ? uniqueStrings(update.adjudicatedMayContainAllergens)
        : target.adjudicatedMayContainAllergens ?? [],
      adjudicatedAllergenSourceType: update.adjudicatedAllergenSourceType === undefined
        ? target.adjudicatedAllergenSourceType ?? null
        : cleanString(update.adjudicatedAllergenSourceType),
      adjudicatedAllergenAuthorityTier: update.adjudicatedAllergenAuthorityTier === undefined
        ? target.adjudicatedAllergenAuthorityTier ?? null
        : cleanString(update.adjudicatedAllergenAuthorityTier),
      allergenSourceEvidenceIds: update.allergenSourceEvidenceIds
        ? uniqueStrings(update.allergenSourceEvidenceIds)
        : target.allergenSourceEvidenceIds ?? [],
      resolvedFindingIds: update.resolvedFindingIds
        ? uniqueStrings(update.resolvedFindingIds)
        : target.resolvedFindingIds ?? [],
      notes: update.notes === undefined ? target.notes : cleanString(update.notes),
    });
  }
}

function normalizeCurrentCatalog(catalog) {
  const products = (catalog.products ?? []).map((product) => ({
    currentProductKey: requireNonEmptyString(product.currentProductKey, "Current product key"),
    name: requireNonEmptyString(product.name, "Current product name"),
    category: cleanString(product.category),
    presentationIds: uniqueStrings(product.presentationIds),
    matchedBaselineAuditItemKeys: uniqueStrings(product.matchedBaselineAuditItemKeys),
    sourceEvidenceIds: uniqueStrings(product.sourceEvidenceIds),
    containsAllergens: uniqueStrings(product.containsAllergens),
    mayContainAllergens: uniqueStrings(product.mayContainAllergens),
    allergenSourceType: cleanString(product.allergenSourceType),
    allergenAuthorityTier: cleanString(product.allergenAuthorityTier),
    allergenSourceEvidenceIds: uniqueStrings(product.allergenSourceEvidenceIds),
    coordinatorReviewed: Boolean(product.coordinatorReviewed),
    notes: uniqueStrings(product.notes),
  }));
  return {
    status: requireEnum(catalog.status, ["not_reviewed", "verified", "unverifiable"], "current catalog status"),
    reviewedBaselineItemCount: requireNonNegativeInteger(catalog.reviewedBaselineItemCount, "reviewed baseline item count"),
    currentProductCount: requireNonNegativeInteger(catalog.currentProductCount, "current product count"),
    reconciledCurrentProductCount: requireNonNegativeInteger(catalog.reconciledCurrentProductCount, "reconciled current product count"),
    inventoryFingerprint: sha256Json(products.map(currentProductFingerprintRecord)),
    surfaces: (catalog.surfaces ?? []).map((surface) => ({
      surfaceId: requireNonEmptyString(surface.surfaceId, "Menu surface id"),
      title: cleanString(surface.title),
      url: requireNonEmptyString(surface.url, "Menu surface URL"),
      current: Boolean(surface.current),
      scopeStatus: requireEnum(surface.scopeStatus, ["complete", "partial", "unresolved", "excluded", "superseded"], "menu surface scope"),
      verified: Boolean(surface.verified),
      evidenceIds: uniqueStrings(surface.evidenceIds),
      notes: uniqueStrings(surface.notes),
    })),
    products,
    notes: uniqueStrings(catalog.notes),
  };
}

function currentProductFingerprintRecord(product) {
  return {
    currentProductKey: product.currentProductKey,
    name: product.name,
    category: product.category,
    presentationIds: product.presentationIds,
    matchedBaselineAuditItemKeys: product.matchedBaselineAuditItemKeys,
    containsAllergens: product.containsAllergens,
    mayContainAllergens: product.mayContainAllergens,
    allergenSourceType: product.allergenSourceType,
    allergenAuthorityTier: product.allergenAuthorityTier,
  };
}

function normalizeAdjudication(adjudication) {
  return {
    type: requireEnum(adjudication.type, ["sol_review", "coordinator"], "adjudication type"),
    runId: requireNonEmptyString(adjudication.runId, "Adjudication run id"),
    decidedAt: requireNonEmptyString(adjudication.decidedAt, "Adjudication time"),
    recommendation: requireEnum(adjudication.recommendation, [...terminalStatuses, "discrepancy_found", "repair_required", "needs_more_research"], "adjudication recommendation"),
    model: {
      id: requireNonEmptyString(adjudication.model?.id, "Adjudication model id"),
      reasoningEffort: requireNonEmptyString(adjudication.model?.reasoningEffort, "Adjudication reasoning effort"),
    },
    rationale: requireNonEmptyString(adjudication.rationale, "Adjudication rationale"),
    artifactHashes: (adjudication.artifactHashes ?? []).map(normalizeArtifactHash),
  };
}

function normalizeWorkerHandoff(handoff, restaurantId) {
  return {
    runId: requireNonEmptyString(handoff.runId, "Worker handoff run id"),
    restaurantId: requireNonEmptyString(handoff.restaurantId, "Worker handoff restaurant id"),
    preparedAt: requireNonEmptyString(handoff.preparedAt, "Worker handoff time"),
    routeDestination: requireEnum(handoff.routeDestination, ["coordinator", "sol_medium"], "worker route destination"),
    solRequired: Boolean(handoff.solRequired),
    artifacts: (handoff.artifacts ?? []).map((artifact) => ({
      kind: requireEnum(artifact.kind, ["job", "scout_result", "scout_route", "terra_packet", "terra_result", "terra_route", "sol_packet", "sol_review", "sol_validation", "poc_job", "poc_research", "poc_apply"], "worker artifact kind"),
      ...normalizeArtifactHash(artifact),
    })),
    notes: uniqueStrings(handoff.notes),
    ...(handoff.restaurantId === restaurantId ? {} : { invalidRestaurantId: true }),
  };
}

function normalizeArtifactHash(artifact) {
  const sha = requireNonEmptyString(artifact.sha256, "Artifact SHA-256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error("Artifact SHA-256 must contain 64 hexadecimal characters.");
  return { path: requireNonEmptyString(artifact.path, "Artifact path"), sha256: sha };
}

function normalizeEvidenceSource(source) {
  const normalized = {
    id: requireNonEmptyString(source.id, "Evidence source id"),
    url: requireNonEmptyString(source.url, "Evidence source URL"),
    authorityTier: requireEnum(
      source.authorityTier,
      sourceAuthorityTiers,
      "evidence authority tier",
    ),
    purpose: requireEnum(source.purpose, ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"], "evidence purpose"),
    retrievedAt: requireNonEmptyString(source.retrievedAt, "Evidence retrieval time"),
    contentType: cleanString(source.contentType),
    finalUrl: cleanString(source.finalUrl),
    httpStatus: Number.isInteger(source.httpStatus) ? source.httpStatus : null,
    byteLength: Number.isInteger(source.byteLength) ? source.byteLength : null,
    sha256: cleanString(source.sha256),
    artifactPath: cleanString(source.artifactPath),
    excerpt: cleanString(source.excerpt),
    rowIdentifiers: uniqueStrings(source.rowIdentifiers),
    request: source.request ?? null,
    notes: uniqueStrings(source.notes),
  };

  validateEvidenceSource(normalized);
  return normalized;
}

function validateEvidenceSource(source) {
  requireNonEmptyString(source.id, "Evidence source id");
  requireNonEmptyString(source.url, "Evidence source URL");
  requireEnum(source.authorityTier, sourceAuthorityTiers, "evidence authority tier");
  requireEnum(source.purpose, ["identity", "menu", "allergen", "ingredients", "cross_contact", "both", "other"], "evidence purpose");
  requireNonEmptyString(source.retrievedAt, "Evidence retrieval time");

  if (!source.sha256 && !source.artifactPath && !source.excerpt && !source.rowIdentifiers?.length) {
    throw new Error(`Evidence source ${source.id} needs a hash, artifact, excerpt, or row identifier.`);
  }
}

function normalizeSourceAttempt(attempt) {
  return {
    id: requireNonEmptyString(attempt.id, "Source attempt id"),
    kind: requireEnum(attempt.kind, blockedAttemptKinds, "source attempt kind"),
    url: cleanString(attempt.url),
    attemptedAt: requireNonEmptyString(attempt.attemptedAt, "Source attempt time"),
    outcome: requireNonEmptyString(attempt.outcome, "Source attempt outcome"),
    status: cleanString(attempt.status),
    query: cleanString(attempt.query),
    request: attempt.request ?? null,
    evidenceIds: uniqueStrings(attempt.evidenceIds),
    scopeImpact: cleanString(attempt.scopeImpact),
    notes: uniqueStrings(attempt.notes),
  };
}

function normalizeFinding(finding) {
  return {
    id: requireNonEmptyString(finding.id, "Finding id"),
    severity: requireEnum(
      finding.severity,
      ["critical", "high", "medium", "low"],
      "finding severity",
    ),
    kind: requireNonEmptyString(finding.kind, "Finding kind"),
    summary: requireNonEmptyString(finding.summary, "Finding summary"),
    evidenceIds: uniqueStrings(finding.evidenceIds),
    resolved: Boolean(finding.resolved),
    resolution: cleanString(finding.resolution),
  };
}

function normalizeRepair(repair) {
  return {
    id: requireNonEmptyString(repair.id, "Repair id"),
    status: requireEnum(
      repair.status,
      ["planned", "implemented", "verified"],
      "repair status",
    ),
    summary: requireNonEmptyString(repair.summary, "Repair summary"),
    files: uniqueStrings(repair.files),
    fixturePaths: uniqueStrings(repair.fixturePaths),
    verificationCommands: uniqueStrings(repair.verificationCommands),
  };
}

function mergeById(existing = [], updates = []) {
  const merged = new Map(existing.map((entry) => [entry.id, entry]));
  for (const update of updates) {
    merged.set(update.id, update);
  }
  return [...merged.values()];
}

function compareRestaurants(left, right) {
  return (
    String(left.name ?? "").localeCompare(String(right.name ?? ""), "en", {
      sensitivity: "base",
    }) || String(left.id).localeCompare(String(right.id))
  );
}

function normalizedAuditName(value) {
  return cleanString(value)
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugifyAuditName(value) {
  return normalizedAuditName(value)?.replace(/\s+/g, "-") ?? "item";
}

function compareLedgerRows(left, right) {
  return compareRestaurants(
    { id: left.restaurantId, name: left.name },
    { id: right.restaurantId, name: right.name },
  );
}

function requireLedgerRow(rows, restaurantId) {
  const row = rows.find((candidate) => candidate.restaurantId === restaurantId);
  if (!row) {
    throw new Error(`Restaurant not found in ledger: ${restaurantId}.`);
  }
  return row;
}

function assertSafeRestaurantId(restaurantId) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(String(restaurantId ?? ""))) {
    throw new Error(`Unsafe restaurant id for ledger paths: ${restaurantId}.`);
  }
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function cleanString(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map(cleanString).filter(Boolean))];
}

function requireNonEmptyString(value, label) {
  const cleaned = cleanString(value);
  if (!cleaned) throw new Error(`${label} is required.`);
  return cleaned;
}

function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256(JSON.stringify(value));
}

function evidenceArtifactExtension(contentType, url) {
  const byType = new Map([
    ["text/html", "html"],
    ["application/xhtml+xml", "html"],
    ["application/json", "json"],
    ["application/pdf", "pdf"],
    ["text/csv", "csv"],
    ["text/plain", "txt"],
  ]);
  const known = byType.get(contentType);
  if (known) return known;

  const extension = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
}

function percentage(value, total) {
  return total === 0 ? "0.00" : ((value / total) * 100).toFixed(2);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function assertDoesNotExist(filePath, message) {
  try {
    await readFile(filePath);
    throw new Error(`${message}: ${filePath}.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readJsonRequired(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJsonRequired(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonLines(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

async function writeJsonAtomic(filePath, value) {
  await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonLines(filePath, values) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

async function writeJsonLinesAtomic(filePath, values) {
  await writeFileAtomic(
    filePath,
    `${values.map((value) => JSON.stringify(value)).join("\n")}\n`,
  );
}

async function writeFileAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, contents);
  await rename(temporaryPath, filePath);
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};

  for (const argument of rest) {
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${argument}.`);
    }
    const [key, ...valueParts] = argument.slice(2).split("=");
    options[key] = valueParts.length > 0 ? valueParts.join("=") : true;
  }

  return { command, options };
}

async function runCli() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const root = options.root ?? defaultLedgerRoot;

  if (command === "init") {
    const result = await initializeVerificationLedger({
      repositoryPath: options.repository ?? defaultRepositoryPath,
      root,
    });
    console.log(JSON.stringify(result.manifest, null, 2));
    return;
  }

  if (command === "next") {
    console.log(JSON.stringify(await nextRestaurant({ root }), null, 2));
    return;
  }

  if (command === "show") {
    console.log(
      JSON.stringify(
        await getRestaurantVerification(requireNonEmptyString(options.id, "--id"), { root }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "claim") {
    console.log(
      JSON.stringify(
        await claimRestaurant({ restaurantId: cleanString(options.id), root }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "record") {
    const inputPath = requireNonEmptyString(options.input, "--input");
    console.log(
      JSON.stringify(
        await recordRestaurantVerification({
          restaurantId: requireNonEmptyString(options.id, "--id"),
          input: await readJsonRequired(path.resolve(inputPath)),
          root,
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "capture") {
    console.log(
      JSON.stringify(
        await captureEvidenceSource({
          restaurantId: requireNonEmptyString(options.id, "--id"),
          sourceId: requireNonEmptyString(options["source-id"], "--source-id"),
          url: requireNonEmptyString(options.url, "--url"),
          authorityTier: requireNonEmptyString(options.authority, "--authority"),
          purpose: requireNonEmptyString(options.purpose, "--purpose"),
          root,
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "toast-snapshot") {
    const inputPath = path.resolve(requireNonEmptyString(options.input, "--input"));
    const outputPath = path.resolve(requireNonEmptyString(options.output, "--output"));
    const snapshot = extractToastMenuSnapshot(await readFile(inputPath, "utf8"), {
      restaurantId: requireNonEmptyString(options.id, "--id"),
      sourceUrl: requireNonEmptyString(options.url, "--url"),
    });
    await writeJsonAtomic(outputPath, snapshot);
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  if (command === "square-snapshot") {
    const htmlPath = path.resolve(requireNonEmptyString(options.html, "--html"));
    const productsPath = path.resolve(requireNonEmptyString(options.products, "--products"));
    const outputPath = path.resolve(requireNonEmptyString(options.output, "--output"));
    const snapshot = extractSquareOnlineMenuSnapshot(
      await readFile(htmlPath, "utf8"),
      await readJsonRequired(productsPath),
      {
        restaurantId: requireNonEmptyString(options.id, "--id"),
        sourceUrl: requireNonEmptyString(options.url, "--url"),
        apiUrl: requireNonEmptyString(options["api-url"], "--api-url"),
      },
    );
    await writeJsonAtomic(outputPath, snapshot);
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  if (command === "complete") {
    console.log(
      JSON.stringify(
        await completeRestaurantVerification({
          restaurantId: requireNonEmptyString(options.id, "--id"),
          status: requireNonEmptyString(options.status, "--status"),
          root,
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "validate") {
    const result = await validateVerificationLedger({ root });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "summary") {
    console.log(JSON.stringify(await generateVerificationSummary({ root }), null, 2));
    return;
  }

  console.log(`Restaurant verification ledger

Commands:
  init [--repository=path] [--root=path]
  next [--root=path]
  show --id=restaurant-id [--root=path]
  claim [--id=restaurant-id] [--root=path]
  capture --id=restaurant-id --source-id=id --url=url --authority=tier --purpose=menu|allergen|both
  record --id=restaurant-id --input=packet.json [--root=path]
  square-snapshot --id=restaurant-id --html=path --products=path --url=url --api-url=url --output=path
  complete --id=restaurant-id --status=codex_verified|blocked_unverifiable [--root=path]
  validate [--root=path]
  summary [--root=path]`);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  runCli().catch(async (error) => {
    if (error?.temporaryPath) {
      await rm(error.temporaryPath, { force: true });
    }
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
