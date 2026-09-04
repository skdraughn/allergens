import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const apply = process.argv.includes("--apply");
const repositoryPath = path.join(root, "src/data/generated/restaurants.generated.json");
const dossierDirectory = path.join(root, "data/restaurant-verification/restaurants");
const emptyCatalogFingerprint = crypto.createHash("sha256").update("[]").digest("hex");

const auditedShells = new Map([
  ["cranes-dc", ["cranes-closed-marker"]],
  ["jont-dc", ["tasting-menu", "beverage-menu-nonalcoholic"]],
  ["kappo-dc", ["wagyū-kōsu"]],
  ["minibar-dc", ["minibar-tasting-menu"]],
  ["mita-dc", [
    "la-herencia-food-courses",
    "la-herencia-nonalcoholic-courses",
    "camino-corto-menu",
    "restaurant-week-menu",
  ]],
  ["omakase-at-barracks-row-dc", ["omakase-tasting-menu"]],
  ["sushi-nakazawa-dc", ["dc-omakase"]],
  ["the-inn-at-little-washington-va", [
    "here-and-now-tasting-menu",
    "enduring-classics-tasting-menu",
    "good-earth-menu",
    "dessert-menu-selection",
    "patty-os-bakery-products",
    "patty-os-coffee-tea",
  ]],
]);

const repository = readJson(repositoryPath);
const restaurantById = new Map(
  (repository.restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]),
);
const findings = [];
const unauditedShells = (repository.restaurants ?? [])
  .filter(isGenericAccommodationShell)
  .filter((restaurant) => !auditedShells.has(restaurant.id));

if (unauditedShells.length > 0) {
  throw new Error(
    `Found unaudited accommodation menu shells: ${unauditedShells
      .map((restaurant) => restaurant.id)
      .join(", ")}.`,
  );
}

for (const [restaurantId, expectedKeys] of auditedShells) {
  const dossierPath = path.join(dossierDirectory, `${restaurantId}.json`);
  const dossier = readJson(dossierPath);
  const restaurant = restaurantById.get(restaurantId);
  if (!restaurant) throw new Error(`Missing generated restaurant: ${restaurantId}`);
  if (!restaurant.allergyAccommodationPolicy) {
    throw new Error(`${restaurantId} has no accommodation policy to display after cleanup.`);
  }

  const canonicalProducts = dossier.currentCatalog?.products ?? [];
  const generatedItems = restaurant.items ?? [];
  const canonicalKeys = canonicalProducts.map((product) => product.currentProductKey);
  const generatedKeys = generatedItems.map((item) => item.currentProductKey ?? item.id);
  const alreadyClean = canonicalKeys.length === 0 && generatedKeys.length === 0;

  if (!alreadyClean) {
    assertExpectedKeys(restaurantId, "canonical products", canonicalKeys, expectedKeys);
    assertExpectedKeys(restaurantId, "generated items", generatedKeys, expectedKeys);
    assertAccommodationShell(restaurantId, restaurant, generatedItems);
  }

  findings.push({
    restaurantId,
    removedItemCount: alreadyClean ? 0 : expectedKeys.length,
    removedItemNames: generatedItems.map((item) => item.name),
    status: alreadyClean ? "clean" : "shell-items-found",
  });

  if (!apply) continue;

  dossier.currentCatalog.products = [];
  dossier.currentCatalog.currentProductCount = 0;
  dossier.currentCatalog.reconciledCurrentProductCount = 0;
  dossier.currentCatalog.inventoryFingerprint = emptyCatalogFingerprint;
  dossier.currentCatalog.notes = unique([
    ...(dossier.currentCatalog.notes ?? []),
    "Experience-level menu names, section labels, and closure markers are not orderable products and were removed after a corpus-wide accommodation-shell audit.",
    "The verified restaurant-level allergy accommodation policy remains the authoritative published content for this record.",
  ]);
  if (dossier.checks?.menu) {
    dossier.checks.menu.sourceItemCount = 0;
    dossier.checks.menu.notes = unique([
      ...(dossier.checks.menu.notes ?? []),
      "No itemized current products are published; prior aggregate menu shells were reclassified as non-product evidence.",
    ]);
  }
  dossier.updatedAt = "2026-08-31T00:00:00.000Z";
  writeJson(dossierPath, dossier, true);

  restaurant.items = [];
  restaurant.itemCount = 0;
  restaurant.menuItemCount = 0;
  restaurant.totalItemCount = 0;
  restaurant.officialItemCount = 0;
  restaurant.officialAllergenStatus = "not-applicable";
  restaurant.officialAllergenRemediationBucket = "accommodation-policy-only";
  restaurant.allergenDataStatus = {
    ...(restaurant.allergenDataStatus ?? {}),
    officialItemCount: 0,
    officialTotal: 0,
    totalItemCount: 0,
    officialCoverageRatio: 0,
    bucket: "unavailable",
  };
  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    accommodationOnly: true,
    extractedFoodItemCount: 0,
    officialEvidenceBucket: "accommodation-policy-only",
    officialItemCount: 0,
    officialAllergenRemediationBucket: "accommodation-policy-only",
  };
}

if (apply) {
  repository.itemCount = (repository.restaurants ?? []).reduce(
    (total, restaurant) => total + (restaurant.items?.length ?? 0),
    0,
  );
  writeJson(repositoryPath, repository, false);
}

const unresolved = findings.filter((finding) => finding.status !== "clean");
console.log(JSON.stringify({
  apply,
  auditedRestaurantCount: findings.length,
  findings,
  remainingShellRestaurantCount: apply ? 0 : unresolved.length,
}, null, 2));

if (!apply && unresolved.length > 0) process.exitCode = 1;

function assertAccommodationShell(restaurantId, restaurant, items) {
  if (restaurant.parserProfile !== "accommodation-policy-shell") {
    throw new Error(`${restaurantId} is no longer an accommodation-policy-shell record.`);
  }
  if (restaurant.sourceStatus?.accommodationOnly !== true) {
    throw new Error(`${restaurantId} is no longer explicitly marked accommodation-only.`);
  }
  if (items.some((item) =>
    (item.allergens?.length ?? 0) > 0 ||
    (item.mayContain?.length ?? 0) > 0 ||
    (item.mayContainAllergens?.length ?? 0) > 0 ||
    (item.officialAllergenCoveredIds?.length ?? 0) > 0
  )) {
    throw new Error(`${restaurantId} now contains item-level allergen evidence; refusing cleanup.`);
  }
}

function isGenericAccommodationShell(restaurant) {
  const items = restaurant.items ?? [];
  return (
    restaurant.parserProfile === "accommodation-policy-shell" &&
    restaurant.sourceStatus?.accommodationOnly === true &&
    Boolean(restaurant.allergyAccommodationPolicy) &&
    items.length > 0 &&
    items.length <= 8 &&
    items.every(isNonItemMenuShell)
  );
}

function isNonItemMenuShell(item) {
  if (item.category === "excluded_closed_restaurant") return true;
  const name = String(item.name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return (
    /\b(?:menu|courses?|offerings?|selection|selections)\b/.test(name) ||
    /\b(?:pastries and breads|coffees and teas)\b/.test(name)
  );
}

function assertExpectedKeys(restaurantId, label, actual, expected) {
  const normalizedActual = [...actual].sort();
  const normalizedExpected = [...expected].sort();
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new Error(
      `${restaurantId} ${label} changed; expected ${normalizedExpected.join(", ") || "none"}, got ${normalizedActual.join(", ") || "none"}.`,
    );
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value, pretty) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
