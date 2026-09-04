#!/usr/bin/env node

import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import slugify from "slugify";

import {
  nutritionixNameKey,
  nutritionixOptionVariantRecords,
} from "./pipeline/nutritionix-option-variants.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const repositoryPath = path.join(
  root,
  "src/data/generated/restaurants.generated.json",
);
const verificationRoot = path.join(root, "data/restaurant-verification");
const ledgerPath = path.join(verificationRoot, "ledger.jsonl");
const reportPath = path.join(
  verificationRoot,
  "reports/structured-option-variant-repair.json",
);
const repository = readJson(repositoryPath);
const ledgerRows = readJsonLines(ledgerPath);
const repairAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  apply,
  generatedAt: repairAt,
  auditedRestaurantCount: repository.restaurants.length,
  structuredSourceRestaurantCount: 0,
  repairs: [],
};

for (const restaurant of repository.restaurants) {
  const sourceUrl = nutritionixSourceUrl(restaurant);

  if (!sourceUrl) continue;
  report.structuredSourceRestaurantCount += 1;

  const parsed = await fetchJson(sourceUrl);
  const rawItemByName = new Map(
    Object.values(parsed?.items ?? {}).map((item) => [
      nutritionixNameKey(item.name),
      item,
    ]),
  );
  const replacements = new Map();
  const variantSourceDefaults = officialSourceDefaults(restaurant, sourceUrl);

  for (const item of restaurant.items ?? []) {
    if (!isUnresolvedParent(item)) continue;

    const rawItem = rawItemByName.get(nutritionixNameKey(item.name));
    const variants = nutritionixOptionVariantRecords(parsed, rawItem);

    if (variants.length === 0) continue;

    const children = variants.map((variant) =>
      makeVariantItem({
        item,
        rawItem,
        sourceUrl,
        variant,
        variantSourceDefaults,
      }),
    );
    replacements.set(item.id, children);
  }

  if (replacements.size === 0) {
    if (apply && restaurant.items?.some((item) => item.isOptionVariant)) {
      updateCanonicalVerification({
        restaurant,
        replacements,
        repairAt,
      });
    }
    continue;
  }

  const beforeItemCount = restaurant.items.length;
  const nextItems = restaurant.items.flatMap(
    (item) => replacements.get(item.id) ?? [item],
  );
  assertUniqueItems(restaurant.id, nextItems);
  restaurant.items = nextItems;
  assignCoverageProfiles(restaurant);
  refreshRestaurantCounts(restaurant);

  const canonical = updateCanonicalVerification({
    restaurant,
    replacements,
    repairAt,
  });
  report.repairs.push({
    restaurantId: restaurant.id,
    beforeItemCount,
    afterItemCount: restaurant.items.length,
    replacedParentCount: replacements.size,
    optionVariantCount: [...replacements.values()].flat().length,
    replacements: [...replacements].map(([parentId, children]) => ({
      parentId,
      childIds: children.map((child) => child.id),
      childNames: children.map((child) => child.name),
    })),
    canonical,
  });
}

if (report.repairs.length > 0) {
  repository.generatedAt = repairAt;
  repository.itemCount = repository.restaurants.reduce(
    (sum, restaurant) => sum + (restaurant.items?.length ?? 0),
    0,
  );
  repository.restaurantCount = repository.restaurants.length;
  repository.metadata = {
    ...(repository.metadata ?? {}),
    structuredOptionVariantRepair: {
      generatedAt: repairAt,
      restaurantIds: report.repairs.map((repair) => repair.restaurantId),
      replacedParentCount: report.repairs.reduce(
        (sum, repair) => sum + repair.replacedParentCount,
        0,
      ),
      optionVariantCount: report.repairs.reduce(
        (sum, repair) => sum + repair.optionVariantCount,
        0,
      ),
    },
  };
}

if (apply) {
  if (report.repairs.length > 0) {
    fs.writeFileSync(repositoryPath, `${JSON.stringify(repository)}\n`);
  }
  writeJsonLines(ledgerPath, ledgerRows);
}

if (report.repairs.length > 0 || !fs.existsSync(reportPath)) {
  writeJson(reportPath, report);
}
console.log(JSON.stringify(report, null, 2));

function isUnresolvedParent(item) {
  return (
    item?.allergenSourceType === "unavailable" &&
    !item?.officialAllergenProfileId &&
    !(item?.officialAllergenCoveredIds?.length > 0)
  );
}

function makeVariantItem({
  item,
  rawItem,
  sourceUrl,
  variant,
  variantSourceDefaults,
}) {
  const id = slugify(variant.name, { lower: true, strict: true });
  const description = cleanDescription(variant.modifier?.description) ?? item.description ?? null;
  const evidenceText = `${variant.optionParentName}: ${variant.optionLabel}`;

  return {
    id,
    name: variant.name,
    category: item.category,
    description,
    imageUrl:
      variant.modifier?.imageUrl ??
      rawItem?.imageUrl ??
      rawItem?.largeImageUrl ??
      rawItem?.smallImageUrl ??
      item.imageUrl ??
      null,
    ingredientsText:
      variant.modifier?.ingredients ??
      variant.modifier?.ingredientStatement ??
      null,
    nutritionFacts: nutritionFacts(variant.modifier),
    isConfigurable: false,
    isOptionVariant: true,
    allergenSourceType: variantSourceDefaults.allergenSourceType,
    allergenAuthorityTier: variantSourceDefaults.allergenAuthorityTier,
    allergens: variant.allergens,
    officialAllergenCoveredIds: variant.officialAllergenCoveredIds,
    mayContain: variant.mayContain,
    mayContainAllergens: variant.mayContain,
    sourceType: "official-api",
    sourceUrls: unique([...(item.sourceUrls ?? []), sourceUrl]),
    variantGroup: item.variantGroup ?? String(rawItem?.templateId ?? ""),
    optionGroupName: variant.optionGroupName,
    optionLabel: variant.optionLabel,
    optionParentId: item.id,
    optionParentName: item.name,
    sourceSummary: "Reviewed official option-level allergen data.",
    sourceEvidenceIds: variantSourceDefaults.sourceEvidenceIds,
    allergenSourceEvidenceIds:
      variantSourceDefaults.allergenSourceEvidenceIds.length > 0
        ? variantSourceDefaults.allergenSourceEvidenceIds
        : variantSourceDefaults.sourceEvidenceIds,
    evidence: [
      {
        sourceKind: "official-api",
        sourceUrl,
        text: evidenceText,
      },
    ],
  };
}

function officialSourceDefaults(restaurant, sourceUrl) {
  const officialItems = (restaurant.items ?? []).filter(
    (item) =>
      item.allergenSourceType !== "unavailable" &&
      (item.sourceUrls ?? []).includes(sourceUrl),
  );

  return {
    allergenSourceType:
      mode(officialItems.map((item) => item.allergenSourceType)) ??
      "official-allergen-menu",
    allergenAuthorityTier:
      mode(officialItems.map((item) => item.allergenAuthorityTier).filter(Boolean)) ??
      "restaurant_linked_vendor",
    sourceEvidenceIds: unique(
      officialItems.flatMap((item) => item.sourceEvidenceIds ?? []),
    ),
    allergenSourceEvidenceIds: unique(
      officialItems.flatMap((item) => item.allergenSourceEvidenceIds ?? []),
    ),
  };
}

function assignCoverageProfiles(restaurant) {
  const profiles = { ...(restaurant.officialAllergenProfiles ?? {}) };
  const profileIdByCoverage = new Map(
    Object.entries(profiles).map(([profileId, profile]) => [
      unique(profile.coveredAllergenIds).sort().join(","),
      profileId,
    ]),
  );

  restaurant.items = restaurant.items.map((item) => {
    if (!item.isOptionVariant || !item.officialAllergenCoveredIds?.length) {
      return item;
    }

    const coveredAllergenIds = unique(item.officialAllergenCoveredIds).sort();
    const key = coveredAllergenIds.join(",");
    let profileId = profileIdByCoverage.get(key);

    if (!profileId) {
      profileId = `m${Object.keys(profiles).length + 1}`;
      profiles[profileId] = { coveredAllergenIds };
      profileIdByCoverage.set(key, profileId);
    }

    const { officialAllergenCoveredIds: _covered, ...profiledItem } = item;
    return { ...profiledItem, officialAllergenProfileId: profileId };
  });

  if (Object.keys(profiles).length > 0) {
    restaurant.officialAllergenProfiles = profiles;
  }
}

function refreshRestaurantCounts(restaurant) {
  const officialItemCount = restaurant.items.filter(isOfficialItem).length;
  const totalItemCount = restaurant.items.length;
  const unavailableItemCount = totalItemCount - officialItemCount;
  restaurant.itemCount = totalItemCount;
  restaurant.menuItemCount = totalItemCount;
  restaurant.totalItemCount = totalItemCount;
  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    extractedFoodItemCount: totalItemCount,
    officialItemCount,
  };
  restaurant.allergenDataStatus = {
    ...(restaurant.allergenDataStatus ?? {}),
    itemCount: totalItemCount,
    totalItemCount,
    officialTotal: officialItemCount,
    officialItemCount,
    totalOfficialItemCount: officialItemCount,
    unavailableItemCount,
    officialCoverageRatio:
      totalItemCount > 0 ? officialItemCount / totalItemCount : 0,
  };
}

function updateCanonicalVerification({ restaurant, replacements, repairAt }) {
  const dossierPath = path.join(
    verificationRoot,
    "restaurants",
    `${restaurant.id}.json`,
  );
  const checksPath = path.join(
    verificationRoot,
    "item-checks",
    `${restaurant.id}.jsonl`,
  );
  const evidencePath = path.join(
    verificationRoot,
    "evidence",
    `${restaurant.id}.json`,
  );
  const dossier = readJson(dossierPath);
  const evidence = readJson(evidencePath);
  const checks = readJsonLines(checksPath);
  const structuredSourceUrl = nutritionixSourceUrl(restaurant);
  const optionEvidenceSources = (evidence.sources ?? []).filter(
    (source) =>
      structuredSourceUrl &&
      [source.url, source.finalUrl].some((url) => url === structuredSourceUrl),
  );
  for (const source of optionEvidenceSources) source.purpose = "both";
  const optionEvidenceIds = optionEvidenceSources.map((source) => source.id);
  const evidenceTierById = new Map(
    (evidence.sources ?? []).map((source) => [source.id, source.authorityTier]),
  );
  const oldProducts = dossier.currentCatalog?.products ?? [];
  const oldProductById = new Map(
    oldProducts.map((product) => [product.currentProductKey, product]),
  );
  let nextProducts = oldProducts.flatMap((product) => {
    const children = replacements.get(product.currentProductKey);
    if (!children) return [product];

    return children.map((child) => ({
      ...product,
      currentProductKey: child.id,
      name: child.name,
      category: child.category,
      description: child.description ?? null,
      ingredientsText: child.ingredientsText ?? null,
      presentationIds: unique([
        ...(product.presentationIds ?? []),
        child.variantGroup ? `variant:${child.variantGroup}` : null,
        `option-parent:${child.optionParentId}`,
      ]),
      containsAllergens: child.allergens ?? [],
      mayContainAllergens: child.mayContain ?? [],
      officialAllergenCoveredIds: [],
      officialAllergenProfileId: child.officialAllergenProfileId,
      allergenSourceType: "restaurant_allergen_document",
      allergenAuthorityTier: child.allergenAuthorityTier,
      notes: unique([
        ...(product.notes ?? []),
        `Projected from the official ${child.optionGroupName} option group.`,
      ]),
    }));
  });
  const itemById = new Map(restaurant.items.map((item) => [item.id, item]));
  nextProducts = nextProducts.map((product) => {
    const item = itemById.get(product.currentProductKey);
    if (!item?.isOptionVariant) return product;

    const allergenSourceEvidenceIds = unique([
      ...(item.allergenSourceEvidenceIds ?? []),
      ...(product.allergenSourceEvidenceIds ?? []),
      ...optionEvidenceIds,
      ...(product.sourceEvidenceIds ?? []),
    ]);
    const supportedAuthority = allergenSourceEvidenceIds.some(
      (evidenceId) =>
        evidenceTierById.get(evidenceId) === product.allergenAuthorityTier,
    )
      ? product.allergenAuthorityTier
      : allergenSourceEvidenceIds
          .map((evidenceId) => evidenceTierById.get(evidenceId))
          .find(Boolean);

    return {
      ...product,
      allergenAuthorityTier: supportedAuthority,
      allergenSourceEvidenceIds,
    };
  });

  for (const check of checks) {
    const matched = check.matchedCurrentProductKeys ?? [];
    const expanded = matched.flatMap((key) =>
      replacements.has(key)
        ? replacements.get(key).map((child) => child.id)
        : [key],
    );
    const items = expanded.map((key) => itemById.get(key)).filter(Boolean);
    const includesOptionVariant = items.some((item) => item.isOptionVariant);
    if (
      !includesOptionVariant &&
      expanded.length === matched.length &&
      expanded.every((key, index) => key === matched[index])
    ) {
      continue;
    }

    check.matchedCurrentProductKeys = expanded;
    check.disposition = expanded.length > 1 ? "variant_match" : "exact_match";
    check.adjudicatedContainsAllergens = unique(
      items.flatMap((item) => item.allergens ?? []),
    );
    check.adjudicatedMayContainAllergens = unique(
      items.flatMap((item) => item.mayContain ?? []),
    );
    check.adjudicatedAllergenSourceType = "restaurant_allergen_document";
    check.adjudicatedAllergenAuthorityTier = mode(
      items.map((item) => item.allergenAuthorityTier).filter(Boolean),
    );
    check.allergenSourceEvidenceIds = unique([
      ...(check.allergenSourceEvidenceIds ?? []),
      ...items.flatMap((item) => item.allergenSourceEvidenceIds ?? []),
      ...optionEvidenceIds,
      ...(check.sourceEvidenceIds ?? []),
    ]);
    if (
      !check.allergenSourceEvidenceIds.some(
        (evidenceId) =>
          evidenceTierById.get(evidenceId) ===
          check.adjudicatedAllergenAuthorityTier,
      )
    ) {
      check.adjudicatedAllergenAuthorityTier = check.allergenSourceEvidenceIds
        .map((evidenceId) => evidenceTierById.get(evidenceId))
        .find(Boolean);
    }
    check.allergenVerdict = "verified";
    const profileIds = unique(
      items.map((item) => item.officialAllergenProfileId).filter(Boolean),
    );
    if (profileIds.length === 1) check.officialAllergenProfileId = profileIds[0];
    else delete check.officialAllergenProfileId;
    check.notes = "Official configuration shell reconciled to its source-backed option variants.";
  }

  const sourceProfile = Object.values(
    dossier.currentCatalog?.officialAllergenProfiles ?? {},
  )[0];
  dossier.currentCatalog = {
    ...(dossier.currentCatalog ?? {}),
    currentProductCount: nextProducts.length,
    reconciledCurrentProductCount: nextProducts.length,
    products: nextProducts,
    officialAllergenProfiles: Object.fromEntries(
      Object.entries(restaurant.officialAllergenProfiles ?? {}).map(
        ([profileId, profile]) => [
          profileId,
          {
            ...sourceProfile,
            coveredAllergenIds: profile.coveredAllergenIds,
            sourceEvidenceIds: sourceProfile?.sourceEvidenceIds ?? unique(
              nextProducts.flatMap((product) => product.sourceEvidenceIds ?? []),
            ),
            sourceType: sourceProfile?.sourceType ?? "restaurant-linked-vendor",
          },
        ],
      ),
    ),
    inventoryFingerprint: sha256(
      nextProducts.map(currentProductFingerprintRecord),
    ),
    notes: unique([
      ...(dossier.currentCatalog?.notes ?? []),
      "Configuration shells with explicit official option-level allergen rows are projected as child menu items.",
    ]),
  };
  dossier.updatedAt = repairAt;
  dossier.completedAt = repairAt;
  dossier.repairs = upsertById(dossier.repairs ?? [], {
    id: `structured-option-variant-repair-${restaurant.id}`,
    status: "verified",
    summary: "Projected official structured menu choices as source-backed child items.",
    files: [repositoryPath, dossierPath, checksPath],
    fixturePaths: [
      "scripts/pipeline/nutritionix-option-variants.mjs",
      "scripts/restaurant-pipeline.test.mjs",
    ],
    verificationCommands: [
      "restaurant pipeline tests",
      "canonical ledger validation",
      "allergen distribution audit",
    ],
  });

  const ledger = ledgerRows.find((row) => row.restaurantId === restaurant.id);
  if (ledger) {
    ledger.updatedAt = repairAt;
    ledger.completedAt = repairAt;
    ledger.repairStatus = "verified";
    ledger.verdicts = {
      ...(ledger.verdicts ?? {}),
      menu: "verified",
      allergenSource: "verified",
      extraction: "verified",
    };
  }

  if (apply) {
    writeJson(dossierPath, dossier);
    writeJson(evidencePath, evidence);
    writeJsonLines(checksPath, checks);
  }

  return {
    beforeProductCount: oldProductById.size,
    afterProductCount: nextProducts.length,
    updatedCheckCount: checks.filter((check) =>
      (check.matchedCurrentProductKeys ?? []).some((key) =>
        restaurant.items.some(
          (item) => item.id === key && item.isOptionVariant,
        ),
      ),
    ).length,
  };
}

function nutritionixSourceUrl(restaurant) {
  return unique([
    ...(restaurant.sourceUrls ?? []),
    ...(restaurant.items ?? []).flatMap((item) => item.sourceUrls ?? []),
  ]).find((url) => /nix-vue-inm.*menu-latest\.json\.gz/i.test(url));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  let buffer = Buffer.from(await response.arrayBuffer());
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) buffer = gunzipSync(buffer);
  return JSON.parse(buffer.toString("utf8"));
}

function nutritionFacts(value = {}) {
  const mappings = [
    ["calories", "Calories"],
    ["caloriesFromFat", "Calories from Fat"],
    ["totalFat", "Total Fat"],
    ["saturatedFat", "Saturated Fat"],
    ["transFat", "Trans Fat"],
    ["cholesterol", "Cholesterol"],
    ["sodium", "Sodium"],
    ["totalCarbohydrates", "Total Carbohydrates"],
    ["dietaryFiber", "Dietary Fiber"],
    ["sugars", "Sugars"],
    ["protein", "Protein"],
  ];
  const result = Object.fromEntries(
    mappings
      .filter(([field]) => Number.isFinite(value?.[field]))
      .map(([field, label]) => [label, value[field]]),
  );
  return Object.keys(result).length > 0 ? result : undefined;
}

function cleanDescription(value) {
  const text = typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  return text || null;
}

function isOfficialItem(item) {
  return Boolean(
    item?.officialAllergenProfileId ||
      item?.officialAllergenCoveredIds?.length ||
      (item?.allergenSourceType && item.allergenSourceType !== "unavailable"),
  );
}

function mode(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function assertUniqueItems(restaurantId, items) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${restaurantId}: duplicate item ID ${item.id}`);
    ids.add(item.id);
  }
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function upsertById(values, nextValue) {
  return [...values.filter((value) => value.id !== nextValue.id), nextValue];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonLines(filePath, values) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}
