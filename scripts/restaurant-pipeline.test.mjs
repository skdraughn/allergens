import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import {
  addCoverageMetadata,
  applyCoverageGate,
  combinePreviousKnownGoodRepositories,
  validateRestaurantRepository,
} from "./coverage-gate.mjs";
import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
  inferMenuItemIngredientIntelligence,
} from "./ingredient-intelligence.mjs";
import { buildIngredientIntelligenceAudit } from "./audit-ingredient-intelligence.mjs";
import { brandAdapters } from "./restaurant-adapters.mjs";
import {
  genericAdapters,
  modularAdapterOverrides,
} from "./restaurant-adapters/index.mjs";
import {
  buildRestaurantSourceAuditRows,
  summarizeRestaurantSourceAudit,
} from "./audit-restaurant-sources.mjs";
import {
  buildLaunchTargetPlan,
  selectLaunchWaveTargets,
  sourceForLaunchTarget,
} from "./launch-coverage-process.mjs";
import {
  evaluateRestaurantLaunchQuality,
  launchQualityStatuses,
  suspiciousMenuRows,
} from "./launch-coverage-quality.mjs";
import {
  classifyMenuItemRow,
  officialEvidenceClassification,
  sanitizeMenuItemDisplayFields,
  textBleedReasons,
} from "./menu-item-quality.mjs";
import { aggregateLaunchCoverageRows } from "./launch-coverage-aggregate.mjs";
import {
  classifyDocumentLink,
  classifyRestaurantSource,
  configuredUrlRoles,
  configuredUrlAuditForSource,
  hasConfiguredOfficialAllergenSource,
  hasConfiguredOfficialSource,
  inferConfiguredUrlRole,
  normalizeConfiguredSourceUrls,
  officialAllergenDistributionSummary,
  officialAllergenSmearSummary,
  officialAllergenStatuses,
  officialStatusForSource,
  sourceFamilies,
} from "./restaurant-source-classification.mjs";
import {
  buildRestaurantSearchIndexRows,
  compatibilitySummaryForRestaurant,
  searchTokensForRestaurant,
} from "./restaurant-search-index.mjs";
import {
  evaluateRestaurantRefresh,
  nextRetryAt,
  refreshMetadataForRestaurant,
  refreshTiers,
} from "./restaurant-refresh-policy.mjs";
import { restaurantSources } from "./restaurant-sources.mjs";
import {
  filterMenuCatalogRecords,
  isProbablyMenuCatalogRecord,
} from "./pipeline/normalize-records.mjs";
import {
  buildFlipsnackAuthorizationUrl,
  buildFlipsnackDataJsonUrlFromAuthorization,
  decodeFlipsnackHash,
  extractFlipsnackGuideText,
  extractFlipsnackHashFromHtml,
} from "./pipeline/flipsnack-official-guide.mjs";
import { extractEveryBiteWidgetRows } from "./pipeline/everybite-widget.mjs";
import { extractShopifyAllergenGuideRows } from "./pipeline/shopify-allergen-guide.mjs";
import {
  directGoogleDriveDownloadUrl,
  extractBbqChickenAllergenPdfItems,
  extractBbqChickenPageRows,
  extractInsomniaCookiesNutritionGuidePdfItems,
  extractHtmlItems,
  extractFriedCrossContactAllergenTableItems,
  extractIMenuProScriptItems,
  extractJsonMenuFragmentItems,
  extractOsiTop9AllergenPdfItems,
  extractNandosNutritionAllergenPdfItems,
  extractRasaAllergyChartPdfItems,
  mergeRecords,
  normalizeRecord,
  extractOfficialApiItems,
  extractProductPageItem,
  extractSpreadsheetItems,
  isGenericMatrixAllergenCellEvidence,
  isAllowedSourceMenuName,
  extractTropicalSmoothieNutritionPdfItems,
  createRecord,
  chipotleOfficialAllergenCoverage,
  chickFilAAllergenFacts,
  dairyQueenAllergenCoverage,
  dominosAllergenAttributeCoverage,
  littleCaesarsAllergenCoverage,
  nutritionixAvailableAllergenCoverage,
  nutritionixItemAllergenCoverage,
  authoritativeOfficialApiUrls,
  isCurrentUnavailableOfficialApiItem,
  retainUncoveredOfficialApiMenuRecords,
  rbiSanityAllergens,
  subwayPdfAllergenCoverage,
  wendysNutritionAllergenCoverage,
  wendysImageUrl,
} from "./pipeline/legacy-scrape-engine.mjs";
import * as XLSX from "xlsx";

const require = createRequire(import.meta.url);
const generatedRestaurants = require("../src/data/generated/restaurants.generated.json");

test("Flipsnack official guide helper decodes embedded guide hashes and extracts page text", () => {
  const encodedHash = "RUFDQTlDNTU2OUIrNzFjYXhoeDRvdA==";
  const decoded = decodeFlipsnackHash(encodedHash);

  assert.deepEqual(decoded, {
    accountId: "EACA9C5569B",
    collectionHash: "71caxhx4ot",
    decoded: "EACA9C5569B+71caxhx4ot",
    encodedHash,
  });
  assert.equal(
    extractFlipsnackHashFromHtml(
      '<iframe src="https://player.flipsnack.com?hash=RUFDQTlDNTU2OUIrNzFjYXhoeDRvdA=="></iframe>',
    ),
    encodedHash,
  );
  assert.equal(
    buildFlipsnackAuthorizationUrl(encodedHash),
    "https://content-private.flipsnack.com/authorization?hash=RUFDQTlDNTU2OUIrNzFjYXhoeDRvdA%3D%3D&domain=player.flipsnack.com",
  );
  assert.equal(
    buildFlipsnackDataJsonUrlFromAuthorization(encodedHash, {
      signature: {
        "71caxhx4ot": "Signature=test&Policy=test&Key-Pair-Id=test",
      },
    }),
    "https://d3u72tnj701eui.cloudfront.net/EACA9C5569B/collections/71caxhx4ot/data.json?Signature=test&Policy=test&Key-Pair-Id=test",
  );
  assert.deepEqual(
    extractFlipsnackGuideText({
      pages: {
        order: ["p1", "p2"],
        data: {
          p1: { extractedText: " Lost Dog Cafe   Allergen Guide " },
          p2: { extractedText: "" },
        },
      },
    }),
    [{ page: 1, id: "p1", text: "Lost Dog Cafe Allergen Guide" }],
  );
});

test("Shopify allergen guide parser extracts item-level official matrix rows", () => {
  const rows = extractShopifyAllergenGuideRows(
    `
    <section class="allergen-cat">
      <h2 class="allergen-cat__title">Gourmet Toasts</h2>
      <article class="allergen-item">
        <h3 class="allergen-item__name h5">Spicy Crab<span>VG</span></h3>
        <p class="allergen-item__desc">Lump crab, melted swiss and fontina cheese on rustico toast</p>
        <p class="allergen-contains">
          Contains: Dairy,Eggs,Gluten,Soy
        </p>
      </article>
      <article class="allergen-item">
        <h3 class="allergen-item__name h5">Green Machine</h3>
        <p class="allergen-item__desc">Banana, mango, pineapple, spinach, kale</p>
        <p class="allergen-contains">No listed allergens</p>
      </article>
    </section>
    `,
    {
      sourceUrl: "https://toastique.com/pages/toastique-allergen-dietary-guide",
    },
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Spicy Crab");
  assert.equal(rows[0].category, "Gourmet Toasts");
  assert.equal(rows[0].containsText, "Dairy,Eggs,Gluten,Soy");
  assert.deepEqual(rows[0].allergens, [
    "egg",
    "gluten",
    "milk",
    "shellfish",
    "soy",
    "wheat",
  ]);
  assert.deepEqual(rows[1].allergens, []);
});

test("EveryBite widget parser maps official item allergens and ingredients", () => {
  const rows = extractEveryBiteWidgetRows(
    {
      rows: [
        {
          id: "dish-1",
          name: "crispy oyster",
          category: { name: "TACOS" },
          allergens: [
            { id: "5", name: "Crustacean/shellfish", type: "Contains" },
            { id: "8", name: "Wheat", type: "Contains" },
            { id: "6", name: "Soybeans", type: "Contains" },
          ],
          ingredients: [
            { name: "Prepped Oysters", isIncluded: true },
            {
              name: "Tempura Batter Kits - DUPLICATE IMPORT (2023-11-13 23:32:53)",
              isIncluded: true,
            },
            { name: "Removed Salsa", isIncluded: false },
          ],
        },
      ],
    },
    {
      sourceUrl: "https://bartaco.com/nutrition/",
      widgetUrl: "https://app.everybite.com/widget/4facc5a0",
    },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "crispy oyster");
  assert.equal(rows[0].category, "TACOS");
  assert.deepEqual(rows[0].allergens, ["gluten", "shellfish", "soy", "wheat"]);
  assert.deepEqual(rows[0].ingredients, [
    "Prepped Oysters",
    "Tempura Batter Kits",
  ]);
});

test("defines one BrandAdapter for every configured restaurant", () => {
  assert.equal(brandAdapters.length, restaurantSources.length);
  assert.deepEqual(
    brandAdapters.map((adapter) => adapter.id).sort(),
    restaurantSources.map((source) => source.id).sort(),
  );
});

test("bespoke and generic adapter declarations live in adapter modules", () => {
  assert.deepEqual(
    modularAdapterOverrides.map((adapter) => adapter.id).sort(),
    ["burger-king", "founding-farmers-dc", "mcdonalds"],
  );
  assert.deepEqual(genericAdapters.map((adapter) => adapter.id).sort(), [
    "generic-html",
    "generic-pdf-matrix",
  ]);
  assert.equal(
    brandAdapters.find((adapter) => adapter.id === "founding-farmers-dc")
      ?.regionalScope,
    "local-menu-with-intelligence-fallback",
  );
  assert.equal(
    brandAdapters.find((adapter) => adapter.id === "founding-farmers-dc")
      ?.parserProfile,
    "founding-farmers-pdf-menu",
  );
});

test("all restaurant sources have portfolio classification metadata", () => {
  const missing = brandAdapters.filter(
    (adapter) =>
      !adapter.brandKey || !adapter.sourceFamily || !adapter.parserProfile,
  );
  const unknownFamilies = brandAdapters.filter(
    (adapter) => adapter.sourceFamily === "unknown",
  );

  assert.deepEqual(
    missing.map((adapter) => adapter.id),
    [],
  );
  assert.deepEqual(
    unknownFamilies.map((adapter) => adapter.id),
    [],
  );
});

test("source audit covers the whole portfolio with official extraction statuses", () => {
  const rows = buildRestaurantSourceAuditRows();
  const summary = summarizeRestaurantSourceAudit(rows);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const configuredOfficialSources = restaurantSources.filter((source) =>
    hasConfiguredOfficialAllergenSource(source),
  );
  const officialMissingRows = configuredOfficialSources.filter((source) => {
    const status = rowsById.get(source.id)?.officialAllergenStatus;
    return !status;
  });

  assert.equal(rows.length, restaurantSources.length);
  assert.equal(summary.total, restaurantSources.length);
  assert.equal(summary.manualReview, 0);
  assert.deepEqual(
    rows.filter((row) => !row.remediationBucket).map((row) => row.id),
    [],
  );
  assert.deepEqual(
    officialMissingRows.map((source) => source.id),
    [],
  );
  assert.deepEqual(
    rows
      .filter(
        (row) =>
          row.officialAllergenStatus ===
          officialAllergenStatuses.sourceFoundUnparsed,
      )
      .filter((row) => !row.remediationBucket)
      .map((row) => row.id),
    [],
  );
  assert.ok(
    summary.documentSchemaProfileMigration.migratedProfileIds.length > 0,
  );
  assert.ok(summary.officialExtractedByProfile);
});

test("source audit emits configured URL role warnings and food extraction counts", () => {
  const source = {
    id: "configured-happy-hour-test",
    name: "Configured Happy Hour Test",
    domain: "example.com",
    type: "local",
    menuUrls: [
      "https://example.com/menu",
      "https://example.com/happy-hour.pdf",
      "https://example.com/cocktails.pdf",
    ],
    allergenUrls: ["https://example.com/nutrition.pdf"],
  };
  const rows = buildRestaurantSourceAuditRows({
    restaurantSources: [source],
    repository: {
      restaurants: [
        {
          id: source.id,
          items: [{ allergenSourceType: "unavailable", name: "Burger" }],
          sourceStatus: { discardedItemCount: 2 },
        },
      ],
    },
  });
  const row = rows[0];

  assert.match(
    row.configuredUrlRoles,
    /menu:special-food-menu:https:\/\/example\.com\/happy-hour\.pdf/,
  );
  assert.match(
    row.configuredUrlRoles,
    /menu:drinks-menu:https:\/\/example\.com\/cocktails\.pdf/,
  );
  assert.match(row.configuredUrlWarnings, /configured-url-special-food-menu/);
  assert.match(row.configuredUrlWarnings, /configured-url-drinks-menu/);
  assert.equal(row.nonFoodDocumentSuspected, true);
  assert.equal(row.extractedFoodItemCount, 1);
  assert.equal(row.discardedItemCount, 2);
});

test("launch coverage target plan can synthesize scrape-ready new candidate sources", () => {
  const source = sourceForLaunchTarget(
    {
      id: "chain-example-cafe",
      name: "Example Cafe",
      type: "chain-menu",
      area: "Multiple DC-area locations",
      bucket: "Chain / Multi-location",
      cuisine: "Cafe",
      sourceStatus: "new-candidate",
      sourceUrl: "https://example.com/menu",
      representedLocations: 12,
      rank: 1000,
    },
    new Map(),
  );

  assert.equal(source.id, "chain-example-cafe");
  assert.equal(source.type, "chain");
  assert.equal(source.allowUnavailableAllergenFallback, true);
  assert.deepEqual(source.menuUrls, ["https://example.com/menu"]);
});

test("launch coverage canary selection keeps mixed target statuses", async () => {
  const plan = await buildLaunchTargetPlan();
  const selected = selectLaunchWaveTargets(plan.targets, {
    wave: "canary",
    limit: 25,
  });
  const selectedStatuses = new Set(
    selected.map((target) => target.sourceStatus),
  );

  assert.equal(selected.length, 25);
  assert.ok(selected.every((target) => target.scrapeReady));
  assert.ok(selectedStatuses.has("existing-official"));
  assert.ok(selectedStatuses.has("existing-menu"));
  assert.ok(selectedStatuses.has("existing-weak"));
  assert.ok(selectedStatuses.has("existing-zero"));
  assert.ok(selectedStatuses.has("new-candidate"));
});

test("launch coverage full wave supports resumable offset chunks", async () => {
  const plan = await buildLaunchTargetPlan();
  const first = selectLaunchWaveTargets(plan.targets, {
    wave: "full",
    limit: 10,
    offset: 0,
  });
  const second = selectLaunchWaveTargets(plan.targets, {
    wave: "full",
    limit: 10,
    offset: 10,
  });

  assert.equal(first.length, 10);
  assert.equal(second.length, 10);
  assert.deepEqual(
    first
      .map((target) => target.id)
      .filter((id) => second.some((target) => target.id === id)),
    [],
  );
});

test("launch coverage aggregate accounts for scraped, duplicate, no-source, and not-run targets", () => {
  const plan = {
    targets: [
      {
        id: "scraped",
        name: "Scraped",
        sourceStatus: "existing-menu",
        scrapeReady: true,
        launchSourceKey: "location:scraped",
      },
      {
        id: "duplicate",
        name: "Duplicate",
        sourceStatus: "new-candidate",
        scrapeReady: true,
        duplicateOf: "location:scraped",
        launchSourceKey: "location:duplicate",
      },
      {
        id: "no-source",
        name: "No Source",
        sourceStatus: "new-candidate",
        scrapeReady: false,
        launchSourceKey: "location:no-source",
      },
      {
        id: "not-run",
        name: "Not Run",
        sourceStatus: "existing-menu",
        scrapeReady: true,
        launchSourceKey: "location:not-run",
      },
    ],
  };
  const aggregate = aggregateLaunchCoverageRows({
    plan,
    scrapedRows: [
      {
        id: "scraped",
        name: "Scraped",
        launchSourceKey: "location:scraped",
        launchStatus: launchQualityStatuses.published,
        remediationBucket: "none",
        issueCodes: [],
        itemCount: 12,
      },
    ],
  });
  const rowById = new Map(aggregate.rows.map((row) => [row.id, row]));

  assert.equal(aggregate.summary.totalTargets, 4);
  assert.equal(
    rowById.get("scraped").launchStatus,
    launchQualityStatuses.published,
  );
  assert.equal(rowById.get("duplicate").launchStatus, "deduped-to-source");
  assert.equal(
    rowById.get("no-source").launchStatus,
    launchQualityStatuses.noSource,
  );
  assert.equal(rowById.get("not-run").launchStatus, "not-run");
});

test("launch quality flags artifacts without rejecting normal beverage rows", () => {
  assert.deepEqual(
    suspiciousMenuRows([
      { id: "water", name: "Bottled Water", category: "Beverages" },
      { id: "coffee", name: "Extra Large Iced Coffee", category: "Drinks" },
      {
        id: "cosmo",
        name: "Classic Cosmo",
        category: "Happy Hour-Swizzle & Swirl",
      },
      {
        id: "flatbread",
        name: "Margherita Flatbread",
        category: "Regional Happy Hour",
      },
      { id: "beignets", name: "Crab Beignets", category: "Happy Hour-Sizzle" },
      {
        id: "sub-combo",
        name: "Sub Combo for just $13.99",
        category: "Specials",
        description:
          "Get any 8” Signature Sub or Wrap, an order of Crispy Fries and a 20oz soda.",
        evidence: [{ sourceUrl: "https://example.com/menu" }],
      },
      {
        id: "rum-raisin",
        name: "Rum Raisin",
        category: "Ice Cream",
        evidence: [
          {
            sourceKind: "embedded-flavor-nutrition",
            sourceUrl: "https://example.com/flavor-nutrition",
            text: "Rum Raisin Ice Cream. CONTAINS: MILK.",
          },
        ],
        allergenSourceType: "official-allergen-menu",
      },
    ]),
    [],
  );

  assert.deepEqual(
    suspiciousMenuRows([
      {
        id: "cocktails",
        name: "Cocktails",
        category: "Happy Hour-Swizzle & Swirl",
      },
      { id: "join", name: "Join Our Team", category: "Menu" },
      { id: "modifier", name: "Add Bacon", category: "Sandwiches" },
      { id: "paid-modifier", name: "$ Add Caramel", category: "NA Beverages" },
      { id: "sub", name: "$ Sub Asparagus", category: "Sandwiches" },
      { id: "spaced", name: "A p e r o l s p r i t z", category: "Brunch" },
      { id: "private-room", name: "Private Dining Room", category: "Seafood" },
      { id: "copy", name: "Copyright", category: "Menu" },
    ]).map((row) => row.id),
    [
      "cocktails",
      "join",
      "modifier",
      "paid-modifier",
      "sub",
      "spaced",
      "private-room",
      "copy",
    ],
  );
});

test("shared menu row classifier rejects official allergen matrix legend headers", () => {
  assert.equal(
    classifyMenuItemRow({
      name: "KEY TO THIS GUIDE PREPARATION",
      ingredientsText: "COMMON ALLERGENS",
      allergenSourceType: "official-allergen-menu",
      sourceType: "pdf-matrix",
      evidence: [
        {
          sourceKind: "pdf-matrix",
          sourceUrl: "https://example.com/nutrition-guide.pdf",
          text: "Official allergen matrix note: COMMON ALLERGENS",
        },
      ],
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "PREPARATION",
      ingredientsText: "COMMON ALLERGENS",
      allergenSourceType: "official-allergen-menu",
      sourceType: "pdf-matrix",
    }).kind,
    "source-note",
  );
});

test("shared menu row classifier rejects allergen guide headers and preparation option rows", () => {
  assert.equal(
    classifyMenuItemRow({
      name: "COMMON ALLERGENS GUIDE: CITY RIDGE",
      sourceType: "pdf-menu-matrix",
      evidence: [
        { text: "Official Taco Bamba menu item from allergen matrix." },
      ],
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Moby Dick House of Kabob - Common Allergens",
      sourceType: "pdf-menu-matrix",
      evidence: [
        { text: "Official Moby Dick menu item from allergen matrix." },
      ],
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Egg Preparation Choice (Required)",
      description: "Required",
      sourceType: "html-card",
    }).kind,
    "option-group",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Please allow for 30-minute preparation",
      description:
        "Three-Hour Slow-Cooked Lamb Shoulder served with Ottoman Rice.",
      sourceType: "pdf-menu",
    }).kind,
    "source-note",
  );
});

test("launch quality quarantines empty outputs and reviews parser artifacts", () => {
  const empty = evaluateRestaurantLaunchQuality({
    restaurant: { id: "empty", name: "Empty", items: [] },
  });
  const artifact = evaluateRestaurantLaunchQuality({
    restaurant: {
      id: "artifact",
      name: "Artifact",
      coverageStatus: "complete",
      items: [
        {
          id: "join",
          name: "Join Our Team",
          category: "Menu",
          sourceUrl: "https://example.com",
        },
        {
          id: "burger",
          name: "Classic Burger",
          category: "Burgers",
          sourceUrl: "https://example.com",
        },
      ],
    },
  });

  assert.equal(empty.launchStatus, launchQualityStatuses.quarantined);
  assert.equal(artifact.launchStatus, launchQualityStatuses.reviewNeeded);
});

test("publish quality removes source boilerplate from descriptions without dropping menu rows", () => {
  const item = {
    id: "burger",
    name: "Classic Burger",
    category: "Burgers",
    description: "Official McDonald's nutrition calculator API.",
  };
  const sanitized = sanitizeMenuItemDisplayFields(item);
  const brandPrefixedOfficialMatrix = sanitizeMenuItemDisplayFields({
    id: "bang-bang-shrimp",
    name: "Bang Bang Shrimp",
    category: "Starters",
    description: "Bonefish Grill official Top 9 allergen matrix.",
  });
  const officialFlagsDescription = sanitizeMenuItemDisplayFields({
    id: "flour-tortilla",
    name: "Flour Tortilla",
    category: "Tortillas",
    description: "Official allergen flags: gluten, sulfites.",
  });
  const pdfDescription = sanitizeMenuItemDisplayFields({
    id: "salmon",
    name: "Atlantic Salmon",
    category: "Seafood",
    description: "PDF.",
  });
  const noMarkedAllergenTableRow = sanitizeMenuItemDisplayFields({
    id: "berries-and-grapes",
    name: "Berries & Grapes",
    category: "Fruit",
    description: "row; no major allergen marked in the table.",
  });
  const sourceSummaryLeak = sanitizeMenuItemDisplayFields({
    id: "angel-eggs",
    name: "Angel Eggs",
    category: "Small Plates",
    sourceSummary:
      "Angel Eggs from the restaurant's current official menu or allergen source.",
  });
  const plainMatrixSourceSummaryLeak = sanitizeMenuItemDisplayFields({
    id: "sashimi",
    name: "Sashimi",
    category: "Menu",
    sourceSummary: "Official allergen matrix.",
  });
  const orderNowTail = sanitizeMenuItemDisplayFields({
    id: "berry-blanco",
    name: "BERRY BLANCO",
    category: "Smoothies",
    description:
      "Smoothies | VG | K | CAL. | $7.49 blueberries + coconut + honey granola Order Now",
  });
  const cateringOperationalTail = sanitizeMenuItemDisplayFields({
    id: "caesar-salad-tray",
    name: "Caesar Salad Tray",
    category: "Catering",
    description:
      "Serves 6-8. MUST BE ORDERED A DAY IN ADVANCE. Caesar dressing, parmesan, breadcrumbs For orders of 4 or more trays of the same item, please contact info@example.com.",
  });
  const leadingSizeDescription = sanitizeMenuItemDisplayFields({
    id: "carvel-ice-cream",
    name: "Carvel Ice Cream",
    category: "Desserts",
    description: "8 oz cup of Carvel soft-serve ice cream.",
  });
  const orderAnytimeNameTail = sanitizeMenuItemDisplayFields({
    id: "thursday-lobster",
    name: "THURSDAY LOBSTER: 1 1/2 lb Maine Lobster - Order Anytime for THURSDAY pickup",
    category: "Specials",
    description:
      "Steamed Maine lobster, drawn butter, daily vegetables, seasoned roasted baby potatoes.",
  });
  const pickBetweenBoundaryRow = sanitizeMenuItemDisplayFields({
    id: "pick-between",
    name: "Pick between:",
    category: "Sandwiches",
    description:
      "Panino Grosso: prosciutto di parma, mozzarella, mortadella, salami, pecorino, tomato, and red onions",
  });
  const pollutedDescriptionWithCleanEvidence = sanitizeMenuItemDisplayFields({
    id: "vegan-crab-fritters",
    name: "Vegan Crab Fritters",
    category: "Appetizers",
    description:
      "hearts of palm, marinated artichokes & spices. Charley’s Crab Cakes crab cakes are served with french fries, coleslaw, Our crab cakes are 100% prized Maryland crab meat.",
    evidence: [
      {
        sourceKind: "squarespace-menu-block",
        sourceUrl: "https://example.com/menu",
        text: "hearts of palm, marinated artichokes & spices.",
      },
    ],
  });
  const dietaryLegendIngredients = sanitizeMenuItemDisplayFields({
    id: "salmon",
    name: "Ivy City Smoked Salmon",
    category: "Entrees",
    ingredientsText:
      "Lunch v-vegetarian, vg-vegan, n-contains nuts, g-contains gluten d-contains dairy, sh-contains shellfish, hc-health conscious",
  });
  const dietaryLegendContactBlob = sanitizeMenuItemDisplayFields({
    id: "grilled-asparagus",
    name: "GRILLED ASPARAGUS",
    category: "Sides",
    ingredientsText:
      "GF Gluten-Friendly Recipe contains no gluten but may have trace amounts of gluten due to cross contamination from other foods V Vegetarian DF Dairy-Free N Contains Nuts S Spicy HANDHELDS 152 WATERFRONT ST NATIONAL HARBOR MD 20745",
  });
  const sectionPlaceholder = sanitizeMenuItemDisplayFields({
    id: "garlic-nan",
    name: "Garlic Nan",
    category: "Ramen",
    description:
      "I’m a description for a section of your menu. Click me and then “Edit Menu” to open the Restaurant Menu editor and change my text",
    evidence: [
      {
        source: "website-menu",
        text: "I’m a description for a section of your menu. Click me and then “Edit Menu” to open the Restaurant Menu editor and change my text",
      },
    ],
  });
  const legalIngredients = sanitizeMenuItemDisplayFields({
    id: "vanilla-gelato",
    name: "Vanilla Gelato",
    category: "Desserts",
    ingredientsText:
      "Seasonal Sorbet © 2026 Sage Restaurant Concepts. All rights reserved.",
  });
  const usefulIngredientEvidence = sanitizeMenuItemDisplayFields({
    id: "cheeseburger",
    name: "Cheeseburger",
    category: "Burgers",
    ingredientsText:
      "Ingredients: Enriched Flour (wheat Flour), Beef, Cheese. Contains: Wheat, Milk.",
    evidence: [
      {
        source: "official-product-page",
        text: "Ingredients: Enriched Flour (wheat Flour), Beef, Cheese. Contains: Wheat, Milk. - Official McDonald's nutrition calculator API.",
      },
    ],
  });
  const quality = evaluateRestaurantLaunchQuality({
    restaurant: {
      id: "boilerplate-test",
      name: "Boilerplate Test",
      coverageStatus: "complete",
      items: [item],
    },
  });

  assert.equal(sanitized.description, undefined);
  assert.equal(sanitized.sourceSummary, undefined);
  assert.equal(brandPrefixedOfficialMatrix.description, undefined);
  assert.equal(brandPrefixedOfficialMatrix.sourceSummary, undefined);
  assert.equal(officialFlagsDescription.description, undefined);
  assert.equal(
    officialFlagsDescription.sourceSummary,
    "Official allergen flags: gluten, sulfites.",
  );
  assert.equal(pdfDescription.description, undefined);
  assert.equal(pdfDescription.sourceSummary, undefined);
  assert.equal(noMarkedAllergenTableRow.description, undefined);
  assert.equal(noMarkedAllergenTableRow.sourceSummary, undefined);
  assert.equal(sourceSummaryLeak.sourceSummary, undefined);
  assert.equal(plainMatrixSourceSummaryLeak.sourceSummary, undefined);
  assert.equal(
    orderNowTail.description,
    "blueberries + coconut + honey granola",
  );
  assert.equal(
    cateringOperationalTail.description,
    "Serves 6-8. Caesar dressing, parmesan, breadcrumbs",
  );
  assert.equal(
    leadingSizeDescription.description,
    "8 oz cup of Carvel soft-serve ice cream.",
  );
  assert.equal(
    orderAnytimeNameTail.name,
    "THURSDAY LOBSTER: 1 1/2 lb Maine Lobster",
  );
  assert.equal(pickBetweenBoundaryRow.name, "Panino Grosso");
  assert.equal(
    pickBetweenBoundaryRow.description,
    "prosciutto di parma, mozzarella, mortadella, salami, pecorino, tomato, and red onions",
  );
  assert.equal(
    pollutedDescriptionWithCleanEvidence.description,
    "hearts of palm, marinated artichokes & spices.",
  );
  assert.equal(dietaryLegendIngredients.ingredientsText, undefined);
  assert.equal(dietaryLegendIngredients.sourceSummary, undefined);
  assert.equal(dietaryLegendContactBlob.ingredientsText, undefined);
  assert.equal(sectionPlaceholder.description, undefined);
  assert.equal(sectionPlaceholder.evidence, undefined);
  assert.equal(legalIngredients.ingredientsText, undefined);
  assert.equal(
    usefulIngredientEvidence.ingredientsText,
    "Ingredients: Enriched Flour (wheat Flour), Beef, Cheese. Contains: Wheat, Milk.",
  );
  assert.equal(
    usefulIngredientEvidence.evidence[0].text,
    "Ingredients: Enriched Flour (wheat Flour), Beef, Cheese. Contains: Wheat, Milk.",
  );
  assert.equal(classifyMenuItemRow(pickBetweenBoundaryRow).kind, "menu-item");
  assert.equal(classifyMenuItemRow(sanitized).kind, "menu-item");
  assert.equal(
    quality.issueCodes.includes("source-boilerplate-descriptions"),
    true,
  );
  assert.equal(quality.boilerplateDescriptionCount, 1);
});

test("publish quality rejects a whole nutrition catalog copied into one ingredient field", () => {
  const repeatedNutritionRows = Array.from(
    { length: 4 },
    (_, index) =>
      `Item ${index + 1} 200g Serving Size 500 Calories 20 grams of fat 5 grams of saturated fat 40 grams of carbohydrates 10 grams of protein 800 milligrams of sodium`,
  ).join(" ");
  const sanitized = sanitizeMenuItemDisplayFields({
    id: "sausage",
    name: "Sausage",
    ingredientsText: repeatedNutritionRows.repeat(5),
  });

  assert.equal(sanitized.ingredientsText, undefined);
});

test("legacy API records keep real menu copy and reject source-label descriptions", () => {
  assert.equal(
    createRecord({
      category: "Burgers",
      description: "Official Wendy's menu and nutrition API.",
      name: "Jr. Bacon Cheeseburger",
      sourceKind: "official-api",
      sourceUrl: "https://api.app.prd.wendys.digital/menu",
    }).description,
    null,
  );
  assert.equal(
    createRecord({
      category: "Burgers",
      description:
        "Fresh, never-frozen beef, Applewood smoked bacon, American cheese, crisp lettuce, tomato, and mayo.",
      name: "Jr. Bacon Cheeseburger",
      sourceKind: "official-api",
      sourceUrl: "https://api.app.prd.wendys.digital/menu",
    }).description,
    "Fresh, never-frozen beef, Applewood smoked bacon, American cheese, crisp lettuce, tomato, and mayo.",
  );
  assert.equal(
    wendysImageUrl("2260"),
    "https://app.wendys.com/unified/assets/menu/pg-cropped/2260_small_US_en.png",
  );
});

test("Wendy's API coverage retains explicit false allergen dimensions", () => {
  assert.deepEqual(
    wendysNutritionAllergenCoverage({
      hasEgg: false,
      hasFish: false,
      hasMilk: true,
      hasPeanut: false,
      hasSesame: false,
      hasShellfish: false,
      hasSoy: true,
      hasTreenut: false,
      hasWheat: true,
    }),
    [
      "egg",
      "fish",
      "milk",
      "peanut",
      "sesame",
      "shellfish",
      "soy",
      "tree-nut",
      "wheat",
    ],
  );
});

test("Nutritionix availability metadata retains supported negative allergen dimensions", () => {
  const availableAllergenFields = {
    eggs: 1,
    fish: 1,
    milk: 1,
    peanuts: 1,
    sesame: 1,
    shellfish: 1,
    soy: 1,
    treeNuts: 1,
    wheat: 1,
    gluten: 1,
    mustard: 0,
  };

  assert.deepEqual(
    nutritionixAvailableAllergenCoverage(availableAllergenFields),
    ["egg", "fish", "gluten", "milk", "peanut", "sesame", "shellfish", "soy", "tree-nut", "wheat"],
  );
});

test("Nutritionix item coverage excludes fields whose row value is unknown", () => {
  const available = {
    eggs: 1,
    milk: 1,
    shellfish: 1,
    wheat: 1,
  };
  const allergens = {
    eggs: { presence: -1 },
    milk: { presence: 0 },
    shellfish: { presence: 2 },
    wheat: { presence: 1 },
  };

  assert.deepEqual(
    nutritionixItemAllergenCoverage(available, allergens),
    ["milk", "shellfish", "wheat"],
  );
});

test("official API menus retain current rows whose allergen value is unknown", () => {
  const sourceUrl = "https://example.com/current-menu.json";
  const official = {
    name: "Known Item",
    sourceKind: "official-api",
    sourceUrl,
    allergenSourceType: "official-allergen-menu",
  };
  const unavailable = {
    name: "Current Item With Unknown Allergens",
    sourceKind: "official-api",
    sourceUrl,
    allergenSourceType: "unavailable",
  };
  const staleOtherApi = {
    name: "Different Feed Item",
    sourceKind: "official-api",
    sourceUrl: "https://example.com/other-menu.json",
    allergenSourceType: "unavailable",
  };

  assert.deepEqual(
    retainUncoveredOfficialApiMenuRecords(
      [official],
      [official, unavailable, staleOtherApi],
    ),
    [official, unavailable],
  );
});

test("current uncovered official API items survive mixed-coverage projection", () => {
  const sourceUrl = "https://example.com/current-menu.json";
  const officialItem = {
    sourceType: "official-api",
    sourceUrls: [sourceUrl],
    allergenSourceType: "official-allergen-menu",
  };
  const currentUnavailableItem = {
    sourceType: "official-api",
    sourceUrls: [sourceUrl],
    allergenSourceType: "unavailable",
  };
  const staleUnavailableItem = {
    sourceType: "official-api",
    sourceUrls: ["https://example.com/stale-menu.json"],
    allergenSourceType: "unavailable",
  };
  const officialApiUrls = authoritativeOfficialApiUrls([officialItem]);

  assert.equal(
    isCurrentUnavailableOfficialApiItem(
      currentUnavailableItem,
      officialApiUrls,
    ),
    true,
  );
  assert.equal(
    isCurrentUnavailableOfficialApiItem(staleUnavailableItem, officialApiUrls),
    false,
  );
});

test("official matrix adapters declare negative coverage from headers, not positive marks", () => {
  assert.deepEqual(littleCaesarsAllergenCoverage(), ["egg", "milk", "soy", "wheat"]);
  assert.deepEqual(dairyQueenAllergenCoverage(), [
    "egg",
    "fish",
    "milk",
    "peanut",
    "sesame",
    "shellfish",
    "soy",
    "tree-nut",
    "wheat",
  ]);
});

test("Chick-fil-A rows retain explicit negative columns without inventing gluten or shellfish coverage", () => {
  const fields = [
    { key: "milk", "sr-text": "Contains Milk", value: "1" },
    { key: "wheat", "sr-text": "Contains Wheat", value: "1" },
    { key: "tree_nuts", "sr-text": "Does not contain Tree Nuts", value: "" },
    { key: "fish", "sr-text": "Does not contain Fish", value: "" },
  ];

  assert.deepEqual(chickFilAAllergenFacts(fields), {
    allergens: ["milk", "wheat"],
    coveredAllergenIds: ["fish", "milk", "tree-nut", "wheat"],
  });
});

test("official structured parsers retain declared allergen dimensions with negative values", () => {
  assert.deepEqual(
    rbiSanityAllergens({
      eggs: 0,
      fish: 0,
      milk: 3,
      peanuts: 0,
      shellfish: 0,
      treeNuts: 0,
    }).coveredAllergenIds,
    ["egg", "fish", "milk", "peanut", "shellfish", "tree-nut"],
  );
  assert.ok(chipotleOfficialAllergenCoverage().includes("shellfish"));
  assert.ok(chipotleOfficialAllergenCoverage().includes("tree-nut"));
  assert.ok(dominosAllergenAttributeCoverage().includes("shellfish"));
  assert.ok(dominosAllergenAttributeCoverage().includes("tree-nut"));
  assert.ok(subwayPdfAllergenCoverage().includes("shellfish"));
  assert.ok(subwayPdfAllergenCoverage().includes("tree-nut"));
});

test("publish quality strips inline allergen headings and official notice tails from dish descriptions", () => {
  const sagaStyleHeading = sanitizeMenuItemDisplayFields({
    id: "crispy-rice-terrine-with-mussels",
    name: "CRISPY RICE TERRINE WITH MUSSELS",
    category: "Tapas",
    description:
      "ALLERGENS: SHELLFISH, CITRUS, ALLIUMS Pan seared rice cake, pickled mussels, black garlic dressing, lemon gel, lime zest",
  });
  const sagaStyleSecondHeading = sanitizeMenuItemDisplayFields({
    id: "fideua",
    name: "FIDEUÁ",
    category: "Paella",
    description:
      "ALLERGENS: NUTS, ALLIUMS, CITRUS Calamari sofrito, shrimps, pine nuts vinaigrette ALLERGENS: DAIRY Idaho potato roll, salsa brava",
  });
  const quincyStyleNoticeTail = sanitizeMenuItemDisplayFields({
    id: "mozzarella-sticks",
    name: "Mozzarella Sticks",
    category: "American",
    description:
      "Mozzarella sticks served with marinara on the sideMilk/Egg Allergens Cross-contact possible with wheat",
  });
  const containsNoticeTail = sanitizeMenuItemDisplayFields({
    id: "cajun-fries",
    name: "Cajun Fries",
    category: "American",
    description:
      "Crispy fries tossed in Cajun seasoning. ⚠️ Contains egg. Cross-contact with wheat is possible.",
  });
  const sauceContainsTail = sanitizeMenuItemDisplayFields({
    id: "tenders-and-fries",
    name: "Tenders & Fries",
    category: "American",
    description:
      "Three buttermilk marinated chicken tenders & crispy fries Wheat/Milk Allergens Honey Mustard contains egg",
  });

  assert.equal(
    sagaStyleHeading.description,
    "Pan seared rice cake, pickled mussels, black garlic dressing, lemon gel, lime zest",
  );
  assert.equal(
    sagaStyleHeading.sourceSummary,
    "ALLERGENS: SHELLFISH, CITRUS, ALLIUMS",
  );
  assert.equal(
    sagaStyleSecondHeading.description,
    "Calamari sofrito, shrimps, pine nuts vinaigrette",
  );
  assert.equal(
    quincyStyleNoticeTail.description,
    "Mozzarella sticks served with marinara on the side",
  );
  assert.equal(
    quincyStyleNoticeTail.sourceSummary,
    "Milk/Egg Allergens Cross-contact possible with wheat",
  );
  assert.equal(
    containsNoticeTail.description,
    "Crispy fries tossed in Cajun seasoning.",
  );
  assert.equal(
    containsNoticeTail.sourceSummary,
    "⚠️ Contains egg. Cross-contact with wheat is possible.",
  );
  assert.equal(
    sauceContainsTail.description,
    "Three buttermilk marinated chicken tenders & crispy fries",
  );
  assert.equal(
    sauceContainsTail.sourceSummary,
    "Wheat/Milk Allergens Honey Mustard contains egg",
  );
});

test("publish quality removes carousel text and classifies option and nutrition artifacts", () => {
  const carouselText =
    "There are currently 5 menu items in the viewport, and the slider navigation buttons are previous and next buttons.";
  const carouselRow = sanitizeMenuItemDisplayFields({
    id: "featured-card",
    name: "Chef Special",
    category: "Featured",
    description: carouselText,
  });

  assert.equal(carouselRow.description, undefined);
  assert.equal(carouselRow.sourceSummary, carouselText);
  assert.equal(
    classifyMenuItemRow({
      name: "PICK A BAGEL",
      category: "Bagels",
      description: "PLAIN · SESAME · EVERYTHING · ZA’ATAR",
    }).kind,
    "option-group",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "NUTRITION INFORMA NUTRITION INFORMATION TION",
      category: "Sides",
      description: "PG Extras",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Nutrition (PDF)",
      category: "Nutrition Info",
      description: "",
    }).kind,
    "source-note",
  );
});

test("parser quality keeps useful served-with context while flagging hard row artifacts", () => {
  const servedWith = {
    id: "mashed-potatoes",
    name: "Loaded Mashed Potatoes",
    category: "Sides",
    description: "Served with bacon, cheddar cheese, and sour cream.",
  };
  const comboPackage = {
    id: "half-duck-package",
    name: "Half Duck Package",
    category: "Family Meals",
    description:
      "Half Peking Duck, Garlic Cucumber Salad, Tofu Skin Salad w. Sesame Oil, Taiwanese Popcorn Chicken, Mongolian Beef w. Onion Scallion, 2 White Rice",
  };
  const priceOnlyDescription = {
    id: "burger",
    name: "Classic Burger",
    category: "Burgers",
    description: "$14.00",
  };
  const optionGroup = {
    id: "pick-cheese",
    name: "Pick a Cheese",
    category: "Options",
  };
  const groupedHeader = {
    id: "sauces",
    name: "SAUCES +4",
    category: "Seafood",
    description:
      "beurre blanc • whiskey sauce • chimichurri lobster tail MP • crab cake 27 • seared scallops grilled shrimp 15 • oscar",
  };
  const allergenMatrixBleedName = {
    id: "habit-table-bleed",
    name: "Milk X Contains Egg - X Contains Wheat - - - X Contains Sesame Double Charburger",
    category: "Charburgers",
    description:
      "Contains Wheat - - - X Contains Sesame Double Char with Cheese 750 43 15 1 130 2600 47 3 8 41 X Contains Milk X Contains Egg",
  };
  const nutritionColumnHeader = {
    id: "fiber-in-grams",
    name: "Fiber in Grams",
    category: "Nutrition",
    description:
      "Contains Milk X Contains Milk Egg Contains Egg X Contains Egg Soy Contains Soy X Contains Soy Wheat Contains Wheat",
  };
  const leadingAllergenMatrixCellName = {
    id: "habit-leading-table-cell",
    name: "Almond - X Contains Sesame Santa Barbara Cobb",
    category: "Salads",
    description:
      "Contains Milk X Contains Egg X Contains Soy - - - - X Contains Sesame Sides French Fries 440 27",
  };
  const exclusiveOfferCard = {
    id: "exclusive-offers",
    name: "Get exclusive offers & more!",
    category: "Burger",
    description:
      "Add Cheese (70 Cal), Bacon (100 Cal), Avocado (90 Cal), Mushrooms (102 Cal) or Garlic Mushrooms (157 Cal).",
  };
  const realOfficialItemWithTableBleedDescription =
    sanitizeMenuItemDisplayFields({
      id: "vanilla-shake",
      name: "Vanilla Shake",
      category: "Shakes",
      description:
        "Contains Milk - - - - - - - Chocolate Shake 670 20 13 0 75 230 108 2 90 12 X Contains Milk - - - - - - - Strawberry Shake 580 20",
      allergens: ["milk"],
      allergenSourceType: "official",
    });
  const wineSauceDish = {
    id: "beef-wellington",
    name: "Beef Wellington",
    category: "Dinner",
    description:
      "potato purée, glazed root vegetables, red wine demi-glace served medium rare",
  };
  const swedishFishCocktail = {
    id: "drunken-rockfish",
    name: "Drunken Rockfish",
    category: "Cocktails",
    description:
      "Parrot Bay Rum, blue curacao, pineapple, pomegranate, Swedish Fish",
  };
  const wixWidgetRow = {
    id: "bring-traffic-to-your-site",
    name: "Bring traffic to your site",
    category: "Menu 1",
    description:
      "Share from your Newsroom smart links which will bring visitors back to your website or display your custom Call-to-Action when they click the article you shared.",
  };
  const bareTakeoutRow = {
    id: "takeout",
    name: "Takeout",
    category: "Menu",
  };
  const reviewedOfficialDescription = {
    id: "pie",
    name: "Chicken Curry Pot Pie",
    category: "Savory Pies",
    description: "Reviewed Pie Gourmet official shop product API.",
  };
  const realItemWithAllHoursPollution = {
    id: "burger-set",
    name: "Charchu Burger Set",
    category: "Japanese Market / Cafe",
    description: "All hours",
  };
  const orderingStatusRow = {
    id: "closed-opens-friday-at-1130am",
    name: "Closed • Opens Friday at 11:30AM",
    category: "Spanish",
    description:
      "All hours View menu Order online Terms of Service |Privacy Statement |Cookie Settings Veggie Paella. Bomba Rice, Mixed Vegetables, Saffron.",
  };
  const toastShellCard = {
    id: "restaurant-shell",
    name: "Mandalay Restaurant & Cafe",
    category: "Burmese",
    description:
      "Bonifant Street Silver Spring, MD 20910 Orders through Toast are commission free and go directly to this restaurant Call Hours Directions Gift Cards Delivery Pickup Pickup from 930 Bonifant Street, Silver Spring, MD ASAP Only•Pickup.",
  };
  const directOrderingShell = {
    id: "order-shell",
    name: "Copper Canyon Grill",
    category: "American",
    description:
      "Order online from Arundel Mills, including Appetizers, Featured Soup, Burgers & Sandwiches. Get the best prices and service by ordering direct!",
  };
  const manageOrderShell = {
    id: "manage-your-order",
    name: "Manage your order",
    category: "Lookup",
    description:
      "Check the status of your order online. You will need your order number as well as the email or phone number you used to complete the order.",
  };
  const giftCardShell = {
    id: "egift-cards",
    name: "eGift Cards",
    category: "Seafood",
    description:
      "Give the gift of BBQ, perfect for the BBQ lover on your list.",
  };
  const websiteAnchorBarCard = {
    id: "bar",
    name: "BAR",
    category: "Brunch Menu",
    sourceType: "html-card",
    evidence: [
      {
        sourceKind: "html-card",
        sourceUrl: "https://lafiammaitalian.com/#bar",
        text: "BAR",
      },
    ],
  };
  const websiteAnchorGiftCard = {
    id: "gift-ideas",
    name: "GIFT IDEAS",
    category: "Brunch Menu",
    sourceType: "html-card",
    evidence: [
      {
        sourceKind: "html-card",
        sourceUrl: "https://lafiammaitalian.com/#gift",
        text: "GIFT IDEAS",
      },
    ],
  };
  const pdfBulletProteinAddon = {
    id: "1-mild-italian-sausage",
    name: "· 1 Mild Italian Sausage:",
    category: "Italian",
    description: "· 2 Mild Italian Sausages:",
    sourceType: "pdf-menu",
  };
  const pdfBulletSideAddon = {
    id: "a-side-of-spaghetti",
    name: "· A side of Spaghetti with tomato or marinara sauce",
    category: "Italian",
    sourceType: "pdf-menu",
  };
  const realPdfBulletSide = {
    id: "side-house-salad",
    name: "· Side house salad ·",
    category: "Italian",
    description:
      "Combination of arugula, kale and romaine greens, pickled red onions and grape tomatoes. Topped with croutons.",
    sourceType: "pdf-menu",
  };
  const claimMenuDisclaimer = {
    id: "bread-pudding",
    name: "Bread Pudding",
    category: "Desserts",
    description:
      "Assorted Pies And Cakes claim this menu disclaimer: pricing and availability subject to change. Terms of Service | Privacy Policy",
  };
  const toppingsModifierRow = {
    id: "toppings-arugula-dollar250",
    name: "Toppings: Arugula +$2.50",
    category: "Ny Style Pizza",
    description:
      "Caramelized Onion +$2.50 Roasted Peppers +$2.50 Mushrooms +$2.50",
  };
  const eventScheduleRow = {
    id: "upcoming-big-games",
    name: "UPCOMING BIG GAMES",
    category: "American",
    description: "TUE, 6/23 POR vs UZB ENG vs GHA WED, 6/24 SUI vs CAN",
  };
  const faqRow = {
    id: "how-do-i-join-you",
    name: "How do I join you?",
    category: "Seasonal American",
    description:
      "You just walk in. Think of us the same way you do your favorite no reservation restaurants.",
  };
  const standaloneTimeWindow = {
    id: "4-00pm-7-00pm",
    name: "4:00PM - 7:00PM",
    category: "Happy Hour",
  };
  const explicitAddOnRow = {
    id: "add-seasoned-ground-beef",
    name: "add: seasoned ground beef +",
    category: "Entrees",
  };
  const spacedOutPromoRow = {
    id: "happy-hour-spaced",
    name: "H a p p y H o u r E v e r y D a y",
    category: "Happy Hour",
  };
  const allergenLegendRow = {
    id: "allergen-key",
    name: "Allergen Key:",
    category: "Barbecue",
    description:
      "(D) Contains Dairy (N) Contains Nuts (GF) Gluten-Free (V) Vegetarian",
  };
  const allergenGuidePdfRow = {
    id: "allergen-guide-pdf",
    name: "Allergen Guide PDF",
    category: "Allergen Guide",
  };
  const containsMeatDisclosureRow = {
    id: "contains-meat",
    name: "Contains meat",
    category: "Salad",
    description:
      "Contains wheat, soybeans, fish, sesame, tree nuts 930 Calories 35G Protein 88G Carbs",
  };
  const officialMatrixCategoryArtifact = {
    id: "red-lobster-feasts",
    name: "FEASTS",
    category: "Seafood Boils",
    sourceSummary: "Official Red Lobster allergen guide",
    allergens: [],
    mayContain: [],
  };
  const officialMatrixLegendFragment = {
    id: "red-lobster-blank",
    name: "Blank = Specific allergen is not in the",
    category: "Kids Menu",
    sourceSummary: "Official Red Lobster allergen guide",
    allergens: [],
    mayContain: [],
  };
  const officialMatrixRealOriginal = {
    id: "auntie-annes-original",
    name: "Original",
    category: "Snack",
    sourceSummary:
      "Official Auntie Anne's allergen and sensitivities PDF matrix.",
    allergens: ["wheat", "soy"],
    mayContain: [],
  };
  const officialIngredientFragment = {
    id: "bww-natural-flavor",
    name: "NATURAL FLAVOR,",
    category: "Sports Bar",
    sourceSummary:
      "Official Buffalo Wild Wings allergen matrix note: WATER, CITRIC ACID, SODIUM",
    allergens: ["wheat", "soy"],
    mayContain: [],
  };
  const trailingCommaItem = sanitizeMenuItemDisplayFields({
    id: "avocado-ranch",
    name: "Avocado Ranch,",
    category: "Sauces",
  });
  const gratuityPolicyRow = {
    id: "a-20percent-gratuity-is-applied",
    name: "A 20% Gratuity Is Applied To All Checks",
    category: "Chinese",
    description:
      "— Gluten-Free | Available Gluten-Free | Vegan | d — Dairy | n — Contains Nuts",
  };
  const disclosureFragmentRow = {
    id: "the-nectarine-content-is-approximately",
    name: "The nectarine content is approximately",
    category: "Brunch",
    description: "contains only wheat, barley malt, hops and nectarines",
  };
  const servedWithFragmentName = {
    id: "served-with-our-signature-plum-saucephilippes-classicsgrand-walnut-sesame-prawns",
    name: "served with our signature plum saucePhilippe’s ClassicsGrand Walnut Sesame Prawns",
    category: "Dessert",
    description: "contains shellfish",
  };
  const dietaryLegendBleedRow = {
    id: "pudding-v-d",
    name: "PUDDING V D",
    category: "Barbecue",
    description:
      "LOST GENERATION FOOD TRUCK MENU V N D G GLUTEN FREE CONTAINS DAIRY VEGETARIAN CONTAINS NUTS sauces platters Choice of sauce, challah rolls, house pickles",
  };
  const allergenPrefixArtifactRow = {
    id: "contains-dairy-blueberry-pancakes",
    name: "Contains dairy Blueberry Pancakes",
    category: "Cafe",
    description:
      "Contains gluten, D= Contains dairy, E= Contains egg, S= Contains soy Lemon Ricotta Pancakes 560 cals Lemon ricotta pancakes with whipped ricotta.",
  };
  const websiteAdminWidgetRow = {
    id: "set-email-notifications",
    name: "Set Email Notifications",
    category: "Restaurant",
    description:
      "Get an overview of your important stats right to your inbox. Set the frequency - daily, weekly or monthly, then sit back and enjoy.",
  };
  const exactAdminRow = {
    id: "admin",
    name: "admin",
    category: "Menu",
  };
  const orderingLocationShellRow = {
    id: "welcome-to-pizzeria-paradiso",
    name: "Welcome to Pizzeria Paradiso!",
    category: "Pizza",
    description:
      "DeliveryPickup Find your closest locationEnter an address in the searchbar above, or click here to browse all locations alphabetically.",
  };
  const storeLocatorWidgetRow = {
    id: "import-from-excel",
    name: "Import from Excel",
    category: "Menu",
    description: "Easily import all your address locations from excel.",
  };
  const bareAdminProfileRow = {
    id: "admin-matt",
    name: "Admin Matt",
    category: "Matt",
  };
  const restaurantAdminCategoryRow = {
    id: "don-luis-restaurant",
    name: "DON LUIS RESTAURANT",
    category: "Admin",
  };
  const locationFinderNoSpaceRow = {
    id: "welcome-to-redstone-american-grill",
    name: "Welcome to Redstone American Grill !",
    category: "Seafood",
    description:
      "Find your closest locationWe couldn't locate you!Please enter an address or enable location access in your browser to find a nearby pickup location.",
  };
  const retailPosterRow = {
    id: "know-your-coffee-illustrated-poster",
    name: '"Know Your Coffee" Illustrated Poster',
    category: "retail & epicerie",
    description:
      "a beautiful handpainted poster showcasing classic espresso drinks (11x14 cardstock | ships in a flat mailer | frame not included)",
  };
  const newsletterSignupRow = {
    id: "stay-in-the-know",
    name: "Stay in the know!",
    category: "Tatte Bakery Cafe",
    description: "Sign Up for our Newsletter",
  };
  const restaurantLocationShell = {
    id: "immigrant-food-at-ballston",
    name: "Immigrant Food at Ballston",
    category: "Restaurant",
    description: "Reservations Order Pickup/Delivery Buy a Gift Card",
  };
  const compactAddressLocationShell = {
    id: "ikea-college-park",
    name: "IKEA College Park",
    category: "College Park",
    description:
      "IKEA College Park10100 Baltimore AvenueCollege Park, MD 20740",
  };
  const currencyBoundaryRow = {
    id: "cad",
    name: "CAD",
    category: "pakistani",
    description:
      "Butter Naan is a soft, freshly baked naan bread cooked to perfection in a traditional tandoor. Kindly note, this item contains dairy.",
  };
  const categoryCurrencyBoundaryRow = {
    id: "category-naan-bread-cad",
    name: "Category Naan Bread CAD",
    category: "pakistani",
    description: "contains dairy",
  };
  const sectionHeaderAllergenNote = {
    id: "burgers-and-sandwiches",
    name: "Burgers & Sandwiches",
    category: "Burtons Grill Mansfield",
    description: "* All bread contains cooked egg",
  };
  const groupedHandRollsBleed = {
    id: "hand-rolls",
    name: "Hand Rolls",
    category: "Vegan",
    description:
      "contains nuts gluten free KIMCHI BAOS $8 chick'n fried mushrooms, gochujang LETTUCE WRAPS $12 gochujang brussels sprouts, tofu",
  };
  const compactSushiBoxBleed = {
    id: "sushithe-sushi-boxenjoy-our-sushi-box-that-includes",
    name: "SUSHITHE SUSHI BOXenjoy our sushi box that includes",
    category: "Vegan",
    description: "contains soy)$7",
  };
  const actualDishWithWelcomeKeyword = {
    id: "welcome-to-the-duck-side",
    name: "Welcome To The Duck Side !!!",
    category: "Thai",
    description:
      "Half Duck | Ginger | Bell Pepper | Cauliflower | Celery Onion | Scallion | Wood Ear Mushroom | Shiitake Mushroom | Garlic | Soy Bean Sauce | Served With Jasmine Rice",
  };
  const actualDishWithLocationHoursBleed = sanitizeMenuItemDisplayFields({
    id: "kids-cheeseburger",
    name: "Kids Cheeseburger",
    category: "Italian-American",
    description: "Rustico Alexandria Locations and Ordering Hours",
  });
  const visitPlanningRow = {
    id: "confirm-timing",
    name: "Confirm timing",
    category: "Popular Dishes",
    description:
      "Current hours signal: Monday: 12 pm–2 am; Tuesday: 12 pm–2 am; see the location page for the full weekly schedule.",
  };
  const groupPlanningRow = {
    id: "call-for-larger-groups",
    name: "Call for larger groups",
    category: "Group Dining",
    description:
      "For larger parties, peak times, or tight schedules, calling is safer than guessing from public listings.",
  };
  const sectionHeaderWithDefaultSides = {
    id: "burgers-and-sandwiches",
    name: "BURGERS & SANDWICHES",
    category: "Sides",
    description:
      "served with your choice of french fries, fruit, mixed greens salad, or small caesar salad. top your burger with caramelized onions or sautéed mushrooms, additional 0.59 each. gluten-free bread available, additional 1.99.",
  };
  const noSpaceFoodborneLegend = {
    id: "foodborneillness",
    name: "FOODBORNEILLNESS",
    category: "Indian",
    description:
      "(d) contains dairy (e) contains egg (g) contains gluten (n) contains nuts (sh) contains shellfish wild mushroom biryani",
  };
  const noSpaceFlexitarianHeader = {
    id: "flexitarianoptions",
    name: "FLEXITARIANOPTIONS",
    category: "Sandwiches",
    description:
      "Lower in Fat & Cholesterol Vegetarian Plant-Based (Vegan) GF Gluten-Free It’s Back! Red, White & Blue French Toast",
  };
  const kidsMenuPackedHeader = {
    id: "kids-menufor-children",
    name: "Kids MenuFor Children",
    category: "Vegan",
    description:
      "contains nuts CHEESEBURGER $12 planta burger patty, cheese MAC & CHEESE $13 UDON NOODLES $15 coconut cream",
  };
  const saladToppingsHeader = {
    id: "salad-toppings",
    name: "SALAD TOPPINGS",
    category: "Sandwiches",
    description: "Chicken Grilled calamari Falafel Salmon Shrimp",
  };
  const singleLetterDescription = {
    id: "fish-and-chips",
    name: "Fish & Chips",
    category: "Pub Classics",
    description: "h",
  };
  const whiskeyGlazeSauce = {
    id: "whiskey-glaze",
    name: "Whiskey-Glaze",
    category: "Sauce For 16 Pc Wings",
  };
  const whiskeyGlazeFood = {
    id: "mozzarella-sticks-4-with-whiskey-glaze",
    name: "Mozzarella Sticks (4) with Whiskey-Glaze",
    category: "Appetizers",
  };
  const hardSeltzer = {
    id: "happy-dad-fruit-punch-hard-seltzer",
    name: "Happy Dad Fruit Punch Hard Seltzer",
    category: "Seltzers & Cider",
  };
  const sarkuHeroShell = {
    name: "HAPPENS HERE",
    category: "japanese",
    description:
      "Explore Menu Our Menu Enjoy our World Famous Teriyaki meals today Teriyaki Entrées Bento Box Sushi Rolls Side Orders",
  };
  const sarkuSelfDescription = {
    name: "Sarku Japan",
    category: "japanese",
    description:
      "Enjoy authentic Japanese fast food at Sarku Japan. Visit our restaurants in the US or order online for fresh teriyaki, sushi, and more.",
  };
  const sarkuOfficialInfoShell = {
    name: "Allergen & Allergy Menu Info",
    category: "Allergens",
    description:
      "Find allergen information and allergy menu details at Sarku Japan. Learn about ingredients to make safe choices for your meal.",
  };
  const pdfOcrHeadingBleed = {
    name: "HAND \u0080 SPUNMILKSHAKES",
    category: "Diner",
    description:
      "So big we serve it with the tin on the side! Deluxe Shakes All-natural ice cream. Chocolate Chip Raven Blueberries, dark chocolate chips. Orange Creme Orioles.",
  };
  const ingredientFragmentBleed = {
    name: "natural, dye-free cherries",
    category: "Sandwiches",
    description:
      "Campfire Shake Graham crackers, marshmallow, salted caramel, chocolate pearls. Nutella-Banana Nutella, banana, salted caramel. Chunky Monkey Banana.",
  };
  const officialDanglingMatrixRow = {
    name: "11 oz Sirloin &",
    category: "Steak 'N Mate Combos",
    allergens: ["egg", "milk", "soy"],
    sourceKind: "pdf-matrix",
    sourceSummary: "Official Outback Steakhouse allergen information PDF.",
  };
  const frenchSectionHeader = {
    name: "Les Salades Et Sandwich",
    category: "French",
    allergens: ["tree-nut", "milk", "egg", "wheat", "fish"],
    allergenSourceType: "official-ingredients",
  };
  const globalAllergenNoticeOnDrink = {
    name: "Sorrel, Limeade",
    category: "Caribbean",
    description:
      "*Allergen Notice: Menu items may contain or come into contact with wheat, milk, eggs, peanuts, tree nuts, fish, shellfish and soy",
  };
  const chaserOptionRow = {
    name: "with chaser or neat",
    category: "Caribbean",
  };
  const dineInOnlyPromoRow = {
    name: "Poquito Dinero",
    category: "Mexican",
    description: "Dine in only",
  };
  const fromTheBarSectionRow = {
    name: "From The Mozzarella Bar",
    category: "Italian",
    allergens: ["milk"],
    allergenSourceType: "official-ingredients",
  };
  const officialProductBoundaryFragment = {
    name: "For orders of",
    category: "Italian",
    description: "Contains gluten",
    allergenSourceType: "official-product-allergen-section",
  };
  const officialProductIncludesFragment = {
    name: "Includes",
    category: "Italian",
    description: "Contains beef, pork, pancetta, and gluten",
    allergenSourceType: "official-product-allergen-section",
  };
  const recoveredGenericMatrixRow = {
    name: "Bourbon Glaze",
    category: "Eggs",
    allergenSourceType: "official-allergen-menu",
    sourceSummary: "Official Bonefish Grill allergen matrix.",
    evidence: [
      {
        sourceKind: "pdf-matrix",
        text: "Official Bonefish Grill allergen matrix.",
      },
      {
        source: "reviewed-portfolio-row-recovery",
        text: "Recovered from the reviewed launch repository after shared classifier tightening confirmed this row is a menu item.",
      },
    ],
  };
  const kidsDottedSectionFragment = {
    name: "(FOR KIDS UNDER 12)",
    category: "Pizza",
    description:
      "Italian Fries ............................................................................... Pickle ........................................................................................... .75 Chips",
  };
  const adjacentBracketPriceBleed = {
    name: "Bayou Chedda' Roast",
    category: "Southern / Bakery",
    description:
      'Allen Brothers medium rare roast beef, Tillamook sharp cheddar, lemon-dressed arugula and tangy horseradish sauce. Served on a toasted sesame roll. Fillet O\' "Blue Cat" Fish Sandwich [MKT Price] Breaded blue catfish fillet, tartar sauce.',
  };
  const plainChoiceOfOptionRow = {
    name: "CHOICE OF",
    category: "Mexican",
    description:
      "Adobo-Grilled Chicken Guajillo Shrimp, Pineapple Pasilla-Coffee Marinated Ribeye Smoked Carrots, Cauliflower, Kale, Pistachio Pipián",
  };
  const busboysEventCard = {
    name: "ASL Open Mic Night hosted by Marcus J Smith",
    category: "American",
    description: "Jul 10, 2026 9:00 pm Poetry Reading/Open Mic | Columbia",
  };
  const bartacoGivingPromo = {
    name: "#givingtaco",
    category: "Menu",
  };
  const officialAllergenInstructionRow = {
    name: "Please always inform us of any dietary restrictions or allergies when placing your order",
    category: "Healthy",
    evidence: [
      {
        sourceKind: "pdf-menu-matrix",
        text: "Official Flower Child Bethesda menu item from allergen matrix.",
      },
    ],
  };
  const officialNutritionAllergenHeading = {
    name: "NUTRITIONAL & ALLERGEN INFORMATION",
    category: "Healthy",
    evidence: [
      {
        sourceKind: "pdf-menu-matrix",
        text: "Official Flower Child Bethesda menu item from allergen matrix.",
      },
    ],
  };
  const officialMenuSectionHeading = {
    name: "SALADS (served with dressing)",
    category: "Healthy",
    evidence: [
      {
        sourceKind: "pdf-menu-matrix",
        text: "Official Flower Child Bethesda menu item from allergen matrix.",
      },
    ],
  };
  const dottedPriceNameRow = {
    name: "AVOCADO TOAST v............................................................$11",
    category: "Pizza",
    description:
      "two slices of toasted rustic bread, avocado, queso fresco, microgreens, breakfast radish, red pepper flakes.",
  };
  const adjacentPricedDescriptionBleed = {
    name: "CAESAR SALAD",
    category: "Pizza",
    description:
      "romaine, garlic croutons, parmesan, classic anchovy dressing. SHAVED FENNEL SALAD $8 / $13 v GF orange, toasted walnuts, baby arugula, goat cheese, lemon dressing.",
  };
  const ocrDividerPriceName = {
    name: "HUMMUS I 11",
    category: "Middle Eastern",
    description: "Chickpeas, tahini, lemon, and olive oil.",
  };
  const dottedMenuListBleed = {
    name: "Wood Oven Pizza",
    category: "Pizza",
    description:
      '[choice of 9" or 12" pizzas] MARGHERITA v ............................................................ tomato sauce, imported buffalo mozzarella, basil. NEAPOLITAN v .............................................................. tomato sauce, mozzarella.',
  };
  const dottedUsefulDescription = {
    name: "Flaky Biscuits with Sausage Gravy",
    category: "Breakfast",
    description:
      "With Two Eggs ......................................................................",
  };
  const dottedAllDescription = {
    name: "Silky Tofu Hot Pot",
    category: "Korean",
    description: "........................................",
  };
  const premiumOptionsRow = {
    name: "Premium Options for 2.95 each",
    category: "Breakfast",
    description:
      "Country Fried Steak and Eggs ..................................... 16.95",
  };
  const alcoholDottedBleedRow = {
    name: "RICH + POWERFUL",
    category: "Snacks",
    description:
      "It’s My Jam................................................................................16 grappa, apricot preserve, basil, lemon",
  };
  const adjacentInitialismBleed = {
    name: "Grilled Chicken",
    category: "Pizza",
    description:
      "HCBLT ................................................................... (Ham, cheese, bacon, lettuce, tomato, mayo)",
  };
  const substituteWithRow = {
    name: "Substitute with Shrimp",
    category: "Salads",
  };
  const substituteOptionDescriptionRow = {
    name: "GLUTEN FREE SOY",
    category: "Japanese / Sushi",
    description:
      "substitute to gluten free soy sauce pack for your sushi & sashimi order",
  };
  const choiceOfColonRow = {
    name: "Choice of: Ground beef",
    category: "Indian / Mexican",
    description:
      "Choose: Ground beef | Pulled pork | Chicken tinga. In a folded flour tortilla with rice & charro beans.",
  };
  const choiceOfSoftCrispyRow = {
    name: "Your Choice of (soft or crispy)",
    category: "Vietnamese",
    description:
      "Mì [Yellow Egg Noodles] Hủ Tiếu [Rice Noodles] Ga Chicken & mixed vegetables stir-fried in brown sauce",
  };
  const reservationPolicyRow = {
    name: "RESERVATION CANCELLATION / NO SHOW POLICY",
    category: "Japanese / Sushi",
    description:
      "Cancellations within 24 hours of your table reservation time will incur a $35 fee per person.",
  };
  const packagePriceRow = {
    name: "Level 1 Pizza Buffet",
    category: "Banquet Menu - Pizza Buffet",
    description: "Per person",
  };
  const barePackagePriceRow = {
    name: "$55 per Person",
    category: "Lebanese",
    description:
      "For the whole family 34$ Kanafeh, Halawet El Jebn, Warbat, Baklawa, Ice Cream Book Your Table",
  };
  const weeklySpecialsHeader = {
    name: "Weekly Specials",
    category: "American",
    description: "TURKEY CLUB SANDWICH …18",
  };
  const choiceOfSoftDrinkRow = {
    name: "Choice of soft drink",
    category: "Restaurant",
    description: "* Sandwich only",
  };
  const dropInsEventRow = {
    name: "Drop-ins",
    category: "Restaurant",
    description:
      "Sub in for a single league game. Try a new sport or join friends without the season-long commitment. Find a drop-in",
  };
  const reversedSentenceNameRow = {
    name: "a spicy black bean vegetable patty served with lettuce & tomato",
    category: "Sandwiches",
    description: "Zesty Bean Gardenburger",
  };
  const beerBottleRow = {
    name: "3F SVHL XVI.II KRIEKENLAMBIK: KELLERIS - 19/20 - B.29 (750ML)",
    category: "Brunch",
    description: "(Belgium / 7.3% / 750 ml / Single) Oude Kriek bottle.",
  };
  const beerBottleWithTemperatureRow = {
    name: "CERVEJA (750 ML)",
    category: "Brunch",
    description:
      "(BELGIUM / 5.2% / 48° / 750ML / Single) Brewed with brazilian hops & pepper.",
  };
  const beerBottle375Row = {
    name: "SIDE PROJECT BLEU (375ML)",
    category: "Brunch",
    description:
      "(Limit 1 per person) (Missouri / 6% / 375 ml / Single) Missouri Wild Ale aged in French Oak.",
  };
  const danglingChoiceDescription = {
    name: "Empanadas",
    category: "Bocaditos",
    description: "Fried corn masa turnovers filled with your choice of:",
  };
  const duplicatedMultiwordName = {
    name: "Avocado Toast Avocado Toast",
    category: "Diner",
  };
  const duplicatedPunctuationName = {
    name: "MAKARONI|20 MAKARONI|20",
    category: "Persian",
  };
  const partiallyCleanedDuplicatedPunctuationName = {
    name: "MAKARONI|20 MAKARONI",
    category: "Persian",
  };
  const singleAllergenDescription = {
    name: "Seaweed Salad",
    category: "Miso Soup",
    description: "sesame",
  };
  const legalTailDishDescription = {
    name: "Prime Rib Dip",
    category: "Lunch",
    description:
      "hoagie roll, gruyere, muenster, griddled onion, au jus (Initiative 82), we've added a 5% surcharge on all dine-in checks. This is not a gratuity.",
  };
  const rawWarningOnlyDescription = {
    name: "Garlic Mashed Potatoes",
    category: "Sides",
    description:
      "* Consuming raw or undercooked meats, poultry, seafood, shellfish, or eggs may increase your risk of food-borne illness.",
  };
  const sushiWithRawWarningTail = {
    name: "Spicy Tuna Roll",
    category: "Sushi",
    description:
      "tuna, spicy mayo, cucumber. Contains raw or uncooked fish or shellfish, if you have allergy please inform our staff before ordering",
  };
  const gratuityTailDescription = {
    name: "Avocado Toast",
    category: "Brunch",
    description:
      "Multigrain toast, smashed avocado, pickled red onion, everything seasoning, chili oil. ++20% gratuity may be added to parties of 7 or more.",
  };
  const servedWithBoundaryFragment = {
    name: "Served with your choice of hand-cut French fries or mixed green salad",
    category: "Seafood",
    description:
      "$34.99 per person* Does not include restaurant surcharge, tax, gratuity or beverages",
  };
  const withBoundaryFragment = {
    name: "with baby carrots and potatoes",
    category: "Greek",
    description: "*These items may be served undercooked.",
  };
  const consumerAdvisoryRow = {
    name: "CONSUMER ADVISORY",
    category: "Steakhouse",
  };
  const fullServiceChargeTail = {
    name: "Mango Sticky Rice",
    category: "Dessert",
    description:
      "coconut ice-cream, chocolate shell, jackfruit, cashew, cookie crumble 100% of this service charge is used to pay our front of the house team.",
  };
  const sectionHeaderWithShortDish = {
    name: "From the grill",
    category: "Indian",
    description: "PANEER TIKKA",
  };
  const bottleServicePolicyRow = {
    name: "FRIDAYS",
    category: "Restaurant",
    description:
      "BOTTLE SERVICE RESERVATIONS RESERVATION POLICY All prices included tax gratuity.",
  };
  const spacedDotLeaderDescription = {
    name: "Halloumi Cheese",
    category: "Salads",
    description:
      "Pan-Seared Halloumi Cheese with Fresh Figs, Honey, Pistachios, Mint, and Fig Balsamic Dressing . . . . . . . . . . . . . . . GF",
  };
  const surchargeTailDescription = {
    name: "Teriyaki Salmon",
    category: "Seafood",
    description:
      "Shiitake sticky rice, soy butter sauce. To offset increasing labor costs associated with the restaurant we have added a 3% surcharge to all checks.",
  };
  const withFragmentWithDescription = {
    name: "With Honey Goat Cheese",
    category: "Items",
    description: "wildflower honey and creamy chevre goat cheese",
  };
  const earthyBeerHeading = {
    name: "EARTHY",
    category: "American",
    description:
      "Gueuze Lambic / BEL / 4.8% / Mixed Fermentation Saison / BEL / 5.3%",
  };
  const sectionHeaderExperience = {
    name: "EXPERIENCE TO SHARE",
    category: "Desserts",
  };
  const sectionHeaderMainDishes = {
    name: "Main Dishes",
    category: "Lebanese",
  };
  const sectionHeaderFromSeaWithItems = {
    name: "From the Sea",
    category: "Seafood / Coastal",
    description:
      "Fire & Tide Catch of the Day Market Price crispy whole fish · sorghum chili fish sauce · sweet pickles · kohlrabi & fennel slaw Prawn Pirlou heirloom bean ragout",
  };
  const spacedDotLeaderShortDietLegend = {
    name: "MIXED CHEESE PIDE",
    category: "Mediterranean",
    description:
      "N F . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .",
  };
  const spacedDotLeaderName = {
    name: "BONEIN CHICKEN. . . . . . . . . . . . . . qtr 7 / half 13 / whole",
    category: "Barbecue",
    description: ".4.26",
  };
  const prixFixeSurchargeBleed = {
    name: "Nectar",
    category: "American",
    description:
      "(How sweet it is. Any entree below can be enjoyed to the Prix-Fixe with a $10 surcharge) Grilled Whole Fish",
  };
  const spacedDotModifierFragment = {
    name: "2 o z SALMON",
    category: "Desserts",
    description:
      "o z S A L M O N . . . . . . . . . . . . . . . . JALAPE Ñ O S . . . . . . . . . FRESH SPINACH . . . . . . . . . . AVOCADO . . . . . . . . . . . . . . . . . . . . PINEAPPLE . . . . .",
  };
  const dottedBeverageDescription = {
    name: "Fountain Soda/Homemade Ice Tea .",
    category: "Bakery",
    description: "Bottled Soda . . . . . . . . . . . . . . . . . . . . .",
  };
  const dottedSizeDescription = {
    name: "Seasonal Soup Regular. . .",
    category: "Sides",
    description: "Large . . . . . . (Check for availability)",
  };
  const sandwichesServedWithHeader = {
    name: "All Sandwiches Served with Pickle Chips",
    category: "Sandwiches",
    description:
      "Cubano . . . . . . . . . . . . . . . . . . . . . . . . . . $12 Ham, Homemade Porchetta, Swiss Cheese, Pickles",
  };
  const cafeRiggsPromo = {
    name: "Celebrate America's 250th at Café Riggs",
    category: "American",
    description:
      "In celebration of the semiquincentennial, Café Riggs is participating in EAT250: America at the Table with a limited-time lunch and dinner special.",
  };
  const privateUseSectionHeader = {
    name: "FROM THE GRILL",
    category: "Bakery",
    description:
      " French Dip Our famous top round topped with sautéed onions and melted Provolone served on an onion roll with a side of homemade au jus.",
  };
  const dogonGroupedSectionHeader = {
    name: "Large Share",
    category: "Small Share",
    description:
      "Wagyu NY Strip Pepper Bordelaise, Creole Butter, Roti Island Squash Black Garlic, Reciato, Allium Crumble Curry Branzino Coconut Mussel Curry, Callaloo, Rice & Peas Chicken and Rice Berbere-Roasted, Jollof Rice, Herbs Brown Stew Snapper Jerk-Marinated, Caramelized Onion, Rice & Peas Braised Wagyu Oxtails Cho Cho, Thumbelina Carrot, Rice & Peas",
  };
  const dogonRealServedWithContext = {
    name: "BBQ Greens",
    category: "With Bread",
    description:
      "Candied Cipollini, Roasted Garlic, Beef Bacon with Corn Bread",
  };
  const northItaliaOcrSplitName = {
    name: "BR AISE D SH ORTRIB",
    category: "Salads",
    description:
      "grana padano crema, horseradish gremolata, herb breadcrumb, arugula 1930 cal",
    sourceUrls: [
      "https://www.northitalia.com/wp-content/uploads/2025/08/NOR_Lunch_SPRING-2026-NMRO_3020-Reston.pdf",
    ],
  };
  const northItaliaShortArtifactName = {
    name: "BR OOKIE",
    category: "Italian",
    description:
      "anilla, pistachio & chocolate gelato, dark chocolate, banana, strawberry, pecan 1300 cal",
    sourceUrls: [
      "https://www.northitalia.com/wp-content/uploads/2025/08/NOR_Dessert_SPRING-2026-NMRO_3020-Reston.pdf",
    ],
  };
  const northItaliaRealItemWithPollutedDescription = {
    name: "Cacio e Pepe Pizza",
    category: "Italian",
    description:
      "CHEF'S BOARD Kids' Menu - - - - - - - - - - - SPAGHETTI with butter SPAGHETTI with red sauce",
    sourceUrls: [
      "https://www.northitalia.com/wp-content/uploads/2026/04/North-Italia-Nutritional-Guide-04-2026-1.pdf",
    ],
  };
  const northItaliaWineArtifact = {
    name: "CH AR DONN AY",
    category: "Salads",
    description: "bollini barricato 40, trentino",
    sourceUrls: [
      "https://www.northitalia.com/wp-content/uploads/2025/08/NOR_Lunch_SPRING-2026-NMRO_3020-Reston.pdf",
    ],
  };
  const northItaliaRepeatedOfficialArtifact = {
    name: "CACIOEPEPEARANCINICACIOEPEPEARANCINI",
    category: "Italian",
    description:
      "crispy risotto, pecorino romano, crushed pepper blend, pesto aioli",
    sourceUrls: [
      "https://www.northitalia.com/wp-content/uploads/2026/04/North-Italia-Nutritional-Guide-04-2026-1.pdf",
    ],
  };
  const northItaliaRealArancini = {
    name: "Cacio e Pepe Arancini",
    category: "Small Plates",
    description:
      "crispy risotto, pecorino romano, crushed pepper blend, pesto aioli",
    sourceUrls: [
      "https://www.northitalia.com/wp-content/uploads/2025/08/NOR_Dinner_SPRING-2026-NMRO_3020-Reston.pdf",
    ],
  };
  const northItaliaSectionArtifact = {
    name: "Fresh Pasta & Entrées",
    category: "Salads",
    description:
      "substitute gluten-free pasta (removes 30-210 cal) or vegetable noodles (removes 180-450 cal) +$3.50 Spicy Rigatoni Vodka 25.5 italian sausage, crispy pancetta",
    sourceUrls: [
      "https://www.northitalia.com/wp-content/uploads/2025/08/NOR_Lunch_SPRING-2026-NMRO_3020-Reston.pdf",
    ],
  };
  const northItaliaRealItemWithListBleed = {
    name: "Black Mediterranean Mussels",
    category: "Italian",
    description:
      "FARMERS MARKET BOARD CHEF'S BOARD GRILLED ARTICHOKE Daily Soups - - - - - - - - - - - BUTTERNUT SQUASH",
    sourceUrls: [
      "https://www.northitalia.com/wp-content/uploads/2025/08/NOR_Dinner_SPRING-2026-NMRO_3020-Reston.pdf",
    ],
  };
  const nandoCategoryArtifact = {
    name: "Category",
    category: "Chicken",
    allergenSourceType: "official-allergen-menu",
    ingredientsText: "Allergens",
  };
  const playaGranolaDisclosure = {
    name: "Our granola may",
    category: "Smoothie Bowl",
    allergenSourceType: "official-allergen-menu",
    sourceSummary: "Contains tree nuts",
  };
  const sovereignBeerFragment = {
    name: "The nectarine content is approximately",
    category: "Brunch",
    allergenSourceType: "official-product-allergen-section",
    sourceSummary: "contains only wheat, barley malt, hops and nectarines",
  };
  const teaismDietaryMatrixRow = sanitizeMenuItemDisplayFields({
    name: "Vegan Fried Tofu Bento Box",
    category: "Bentos",
    allergenSourceType: "official-ingredients",
    ingredientsText:
      "Y Y Y Y Y NOTE Y N Y gluten - cross contamination - same fryer as panko chicken",
    sourceSummary:
      "Y Y Y Y Y NOTE Y N Y gluten - cross contamination - same fryer as panko chicken",
  });
  const merchandiseCategoryRow = {
    name: "ALL MERCHANDISE",
    category: "Lost Dog Shop",
  };
  const marketingSignupRow = {
    name: "JOIN THE PACK",
    category: "Marketing Signup",
  };
  const cutleryUtilityRow = {
    name: "Please add cutleryPlease specify how many sets by increasing the order number",
    category: "Menu",
  };
  const tapWaterUtilityRow = {
    name: "Tap Water",
    category: "Menu",
  };
  const allergyGuideUtilityRow = {
    name: "ALLERGY GUIDE",
    category: "Menu",
  };
  const redPepperPacketRow = {
    name: "Red Pepper Packet",
    category: "Menu",
  };
  const sideSaucesRow = {
    name: "Side Sauces",
    category: "Menu",
  };
  const deliveryMarketingRow = {
    name: "DoorDash",
    category: "Seafood",
    description: "Fastest delivery in the Rockville area. Order on DoorDash →",
  };
  const gameCardRow = {
    name: "Flying Fish",
    category: "Seafood",
    description: "Quick and annoying. Keep ’em moving.",
  };
  const seafoodHeaderRow = {
    name: "SEAFOOD",
    category: "Menu",
    description:
      "Relationships over 30 years with TOP Seafood Suppliers [MARKET AVAILABILITY]",
  };
  const cookingInstructionRow = {
    name: "How to Use Your Pizza Stone",
    category: "Bake Your Pizza",
    description:
      "The first step in most of the pizza recipes instruct you to place a pizza stone on the top rack of a cool oven.",
  };
  const mapPluginRow = {
    name: "Configure map",
    category: "japanese;dessert",
    description: "Easily configure how your map looks",
  };
  const visitorAnalyticsRow = {
    name: "Find Out Where Visitors Go",
    category: "American",
    description:
      "Visitor Analytics' click path graphs show you how visitors navigate your site, so you can better optimize your content",
  };
  const mailingListSubmitRow = {
    name: "Thanks for submitting!",
    category: "Vegetable Experience",
  };
  const pressTeaserRow = {
    name: "Taco Bamba Chef Victor Albisu Will Open a Boutique Steakhouse in Northern Virginia",
    category: "South American Steakhouse",
  };
  const pearlDiveBoundaryBleed = {
    name: "Dive Burger",
    category: "Seafood / Cajun",
    description:
      "Double Patty, Bacon, Pepper Jack, Green Chilies, LTO, Cayenne Aioli Grilled Chicken Sandwich Mixed Greens, Roasted Tomato, Avocado & Sprouts on Toasted Ciabatta",
  };

  assert.deepEqual(textBleedReasons(servedWith), []);
  assert.deepEqual(textBleedReasons(comboPackage), []);
  assert.equal(classifyMenuItemRow(servedWith).kind, "menu-item");
  assert.equal(classifyMenuItemRow(comboPackage).kind, "menu-item");
  assert.equal(classifyMenuItemRow(priceOnlyDescription).kind, "menu-item");
  assert.equal(
    classifyMenuItemRow(priceOnlyDescription).reasons.includes(
      "price-only-description",
    ),
    true,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(priceOnlyDescription).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(pearlDiveBoundaryBleed).description,
    "Double Patty, Bacon, Pepper Jack, Green Chilies, LTO, Cayenne Aioli",
  );
  assert.equal(classifyMenuItemRow(optionGroup).kind, "option-group");
  assert.equal(classifyMenuItemRow(groupedHeader).kind, "option-group");
  assert.equal(
    classifyMenuItemRow(allergenMatrixBleedName).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(nutritionColumnHeader).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(leadingAllergenMatrixCellName).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(exclusiveOfferCard).kind, "promo");
  assert.equal(
    realOfficialItemWithTableBleedDescription.description,
    undefined,
  );
  assert.deepEqual(realOfficialItemWithTableBleedDescription.allergens, [
    "milk",
  ]);
  assert.match(
    realOfficialItemWithTableBleedDescription.sourceSummary,
    /Chocolate Shake 670/,
  );
  assert.equal(classifyMenuItemRow(swedishFishCocktail).kind, "source-note");
  assert.equal(classifyMenuItemRow(wixWidgetRow).kind, "promo");
  assert.equal(classifyMenuItemRow(bareTakeoutRow).kind, "navigation/legal");
  assert.equal(
    sanitizeMenuItemDisplayFields(reviewedOfficialDescription).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(reviewedOfficialDescription).sourceSummary,
    "Reviewed Pie Gourmet official shop product API.",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(realItemWithAllHoursPollution).description,
    undefined,
  );
  assert.equal(
    classifyMenuItemRow(realItemWithAllHoursPollution).kind,
    "menu-item",
  );
  assert.equal(classifyMenuItemRow(orderingStatusRow).kind, "navigation/legal");
  assert.equal(classifyMenuItemRow(toastShellCard).kind, "navigation/legal");
  assert.equal(
    classifyMenuItemRow(directOrderingShell).kind,
    "navigation/legal",
  );
  assert.equal(classifyMenuItemRow(manageOrderShell).kind, "navigation/legal");
  assert.equal(classifyMenuItemRow(giftCardShell).kind, "promo");
  assert.equal(
    classifyMenuItemRow(websiteAnchorBarCard).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow(websiteAnchorGiftCard).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Collect Email Leads",
      category: "Party Menus",
      description:
        "Build your mailing list and grow your community by collecting emails from the top bar. Each user that enters their email gets automatically added to your Contact List.",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Birthday Celebration",
      category: "Brunch",
      description:
        "The ultimate birthday celebration with private dining rooms and custom menus.",
    }).kind,
    "promo",
  );
  assert.equal(classifyMenuItemRow(pdfBulletProteinAddon).kind, "modifier");
  assert.equal(classifyMenuItemRow(pdfBulletSideAddon).kind, "modifier");
  assert.equal(classifyMenuItemRow(realPdfBulletSide).kind, "menu-item");
  assert.equal(classifyMenuItemRow(wineSauceDish).kind, "menu-item");
  assert.equal(classifyMenuItemRow(toppingsModifierRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(eventScheduleRow).kind, "promo");
  assert.equal(classifyMenuItemRow(faqRow).kind, "navigation/legal");
  assert.equal(
    classifyMenuItemRow(standaloneTimeWindow).kind,
    "navigation/legal",
  );
  assert.equal(classifyMenuItemRow(explicitAddOnRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(spacedOutPromoRow).kind, "promo");
  assert.equal(classifyMenuItemRow(allergenLegendRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(allergenGuidePdfRow).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(containsMeatDisclosureRow).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(officialMatrixCategoryArtifact).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(officialMatrixLegendFragment).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(officialMatrixRealOriginal).kind,
    "menu-item",
  );
  assert.equal(
    classifyMenuItemRow(officialIngredientFragment).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(nandoCategoryArtifact).kind, "source-note");
  assert.equal(classifyMenuItemRow(playaGranolaDisclosure).kind, "source-note");
  assert.equal(classifyMenuItemRow(sovereignBeerFragment).kind, "source-note");
  assert.equal(classifyMenuItemRow(merchandiseCategoryRow).kind, "promo");
  assert.equal(classifyMenuItemRow(marketingSignupRow).kind, "promo");
  assert.equal(classifyMenuItemRow(cutleryUtilityRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(tapWaterUtilityRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(allergyGuideUtilityRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(redPepperPacketRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(sideSaucesRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(deliveryMarketingRow).kind, "promo");
  assert.equal(classifyMenuItemRow(gameCardRow).kind, "promo");
  assert.equal(classifyMenuItemRow(seafoodHeaderRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(cookingInstructionRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(mapPluginRow).kind, "promo");
  assert.equal(classifyMenuItemRow(visitorAnalyticsRow).kind, "promo");
  assert.equal(
    classifyMenuItemRow(mailingListSubmitRow).kind,
    "navigation/legal",
  );
  assert.equal(classifyMenuItemRow(pressTeaserRow).kind, "promo");
  assert.equal(trailingCommaItem.name, "Avocado Ranch");
  assert.equal(classifyMenuItemRow(gratuityPolicyRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(disclosureFragmentRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(servedWithFragmentName).kind, "source-note");
  assert.equal(
    classifyMenuItemRow({ name: "Fried & served with marinara" }).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(dietaryLegendBleedRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(pdfOcrHeadingBleed).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(ingredientFragmentBleed).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(officialDanglingMatrixRow).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(frenchSectionHeader).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(globalAllergenNoticeOnDrink).kind,
    "source-note",
  );
  assert.equal(teaismDietaryMatrixRow.ingredientsText, undefined);
  assert.equal(
    teaismDietaryMatrixRow.sourceSummary,
    "Official dietary matrix note: gluten - cross contamination - same fryer as panko chicken",
  );
  assert.equal(classifyMenuItemRow(chaserOptionRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(dineInOnlyPromoRow).kind, "promo");
  assert.equal(classifyMenuItemRow(fromTheBarSectionRow).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(officialProductBoundaryFragment).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(officialProductIncludesFragment).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(recoveredGenericMatrixRow).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(kidsDottedSectionFragment).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(adjacentBracketPriceBleed).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(plainChoiceOfOptionRow).kind,
    "option-group",
  );
  assert.equal(classifyMenuItemRow(busboysEventCard).kind, "promo");
  assert.equal(classifyMenuItemRow(bartacoGivingPromo).kind, "promo");
  assert.equal(
    classifyMenuItemRow(officialAllergenInstructionRow).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(officialNutritionAllergenHeading).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(officialMenuSectionHeading).kind,
    "source-note",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(dottedPriceNameRow).name,
    "AVOCADO TOAST",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(ocrDividerPriceName).name,
    "HUMMUS",
  );
  assert.equal(
    classifyMenuItemRow(sanitizeMenuItemDisplayFields(dottedPriceNameRow)).kind,
    "menu-item",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(adjacentPricedDescriptionBleed).description,
    "romaine, garlic croutons, parmesan, classic anchovy dressing.",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(dottedUsefulDescription).description,
    "With Two Eggs",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(dottedAllDescription).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(adjacentInitialismBleed).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(legalTailDishDescription).description,
    "hoagie roll, gruyere, muenster, griddled onion, au jus",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(rawWarningOnlyDescription).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(sushiWithRawWarningTail).description,
    "tuna, spicy mayo, cucumber.",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(gratuityTailDescription).description,
    "Multigrain toast, smashed avocado, pickled red onion, everything seasoning, chili oil.",
  );
  assert.equal(
    classifyMenuItemRow(servedWithBoundaryFragment).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(sanitizeMenuItemDisplayFields(withBoundaryFragment))
      .kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(consumerAdvisoryRow).kind, "source-note");
  assert.equal(
    sanitizeMenuItemDisplayFields(fullServiceChargeTail).description,
    "coconut ice-cream, chocolate shell, jackfruit, cashew, cookie crumble",
  );
  assert.equal(
    classifyMenuItemRow(sectionHeaderWithShortDish).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(bottleServicePolicyRow).kind, "promo");
  assert.equal(
    sanitizeMenuItemDisplayFields(spacedDotLeaderDescription).description,
    "Pan-Seared Halloumi Cheese with Fresh Figs, Honey, Pistachios, Mint, and Fig Balsamic Dressing",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Pumpkin Soup",
      description:
        "Rich, Smooth Flavor Pumpkin Soup with Crispy Ginger Strings ………….….4.95 Seaweed Salad わかめサラ ………………………………….…………………………………",
    }).description,
    "Rich, Smooth Flavor Pumpkin Soup with Crispy Ginger Strings",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(surchargeTailDescription).description,
    "Shiitake sticky rice, soy butter sauce.",
  );
  assert.equal(
    classifyMenuItemRow(withFragmentWithDescription).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(earthyBeerHeading).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(sectionHeaderExperience).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(sectionHeaderMainDishes).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(sectionHeaderFromSeaWithItems).kind,
    "source-note",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(spacedDotLeaderShortDietLegend).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(spacedDotLeaderName).name,
    "BONEIN CHICKEN",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(spacedDotLeaderName).description,
    undefined,
  );
  assert.deepEqual(
    {
      name: sanitizeMenuItemDisplayFields({
        name: "Picatta di Vitello…32Veal Scaloppini sautéed with Capers in a Lemon-Wine Sauce",
        description: "Cotoletta alla Parmigiana",
      }).name,
      description: sanitizeMenuItemDisplayFields({
        name: "Picatta di Vitello…32Veal Scaloppini sautéed with Capers in a Lemon-Wine Sauce",
        description: "Cotoletta alla Parmigiana",
      }).description,
    },
    {
      name: "Picatta di Vitello",
      description: "Veal Scaloppini sautéed with Capers in a Lemon-Wine Sauce",
    },
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({ name: "Petto di Pollo Picatta…" }).name,
    "Petto di Pollo Picatta",
  );
  assert.equal(classifyMenuItemRow(prixFixeSurchargeBleed).kind, "source-note");
  assert.equal(classifyMenuItemRow(spacedDotModifierFragment).kind, "modifier");
  assert.equal(
    sanitizeMenuItemDisplayFields(dottedBeverageDescription).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(dottedSizeDescription).description,
    undefined,
  );
  assert.equal(
    classifyMenuItemRow(sandwichesServedWithHeader).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(cafeRiggsPromo).kind, "promo");
  assert.equal(
    classifyMenuItemRow(privateUseSectionHeader).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(dogonGroupedSectionHeader).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(dogonRealServedWithContext).kind,
    "menu-item",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Showing all 13 results",
      category: "Italian",
      description: "$ 19 Flash fried, Zesty marinara sauce",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "SHAREABLES",
      category: "Breakfast",
      description: "ELEVATED CRISPY FAVORITES FOR YOU AND YOUR CREW",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "煎炸焗 Deep Fried / Baked",
      category: "Menu",
    }).kind,
    "option-group",
  );
  assert.equal(
    classifyMenuItemRow(northItaliaOcrSplitName).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(northItaliaShortArtifactName).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(northItaliaWineArtifact).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(northItaliaRepeatedOfficialArtifact).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(northItaliaRealArancini).kind, "menu-item");
  assert.equal(
    classifyMenuItemRow(northItaliaSectionArtifact).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(
      sanitizeMenuItemDisplayFields(northItaliaRealItemWithPollutedDescription),
    ).kind,
    "menu-item",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(northItaliaRealItemWithPollutedDescription)
      .description,
    undefined,
  );
  assert.equal(
    classifyMenuItemRow(
      sanitizeMenuItemDisplayFields(northItaliaRealItemWithListBleed),
    ).kind,
    "menu-item",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(northItaliaRealItemWithListBleed).description,
    undefined,
  );
  assert.equal(classifyMenuItemRow(dottedMenuListBleed).kind, "source-note");
  assert.equal(classifyMenuItemRow(alcoholDottedBleedRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(premiumOptionsRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(substituteWithRow).kind, "option-group");
  assert.equal(
    classifyMenuItemRow(substituteOptionDescriptionRow).kind,
    "modifier",
  );
  assert.equal(classifyMenuItemRow(choiceOfColonRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(choiceOfSoftCrispyRow).kind, "option-group");
  assert.equal(
    classifyMenuItemRow(reservationPolicyRow).kind,
    "navigation/legal",
  );
  assert.equal(classifyMenuItemRow(packagePriceRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(barePackagePriceRow).kind, "source-note");
  assert.equal(classifyMenuItemRow(weeklySpecialsHeader).kind, "source-note");
  assert.equal(classifyMenuItemRow(choiceOfSoftDrinkRow).kind, "option-group");
  assert.equal(classifyMenuItemRow(dropInsEventRow).kind, "promo");
  assert.equal(
    sanitizeMenuItemDisplayFields(reversedSentenceNameRow).name,
    "Zesty Bean Gardenburger",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(reversedSentenceNameRow).description,
    "a spicy black bean vegetable patty served with lettuce & tomato",
  );
  assert.equal(classifyMenuItemRow(beerBottleRow).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(beerBottleWithTemperatureRow).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(beerBottle375Row).kind, "source-note");
  assert.equal(
    sanitizeMenuItemDisplayFields(danglingChoiceDescription).description,
    "Fried corn masa turnovers filled",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(duplicatedMultiwordName).name,
    "Avocado Toast",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(duplicatedPunctuationName).name,
    "MAKARONI",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(partiallyCleanedDuplicatedPunctuationName)
      .name,
    "MAKARONI",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(singleAllergenDescription).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Buttery Croissant",
      ingredientsText: "Reviewed official row-level allergen evidence.",
    }).ingredientsText,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Basket of Tater Tots with Special Sauce",
      ingredientsText:
        "Dogwood Tavern official menu ingredient review: direct bread, roll, tortilla, pasta, dairy, egg, fish, shellfish, pecan, sesame, and sauce terms from official Popmenu rows were mapped to app allergens.",
    }).ingredientsText,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Chocolate Peanut Butter",
      ingredientsText:
        "Whole milk, cane sugar, peanut butter. Contains: milk, peanuts.",
    }).ingredientsText,
    "Whole milk, cane sugar, peanut butter. Contains: milk, peanuts.",
  );
  assert.deepEqual(
    sanitizeMenuItemDisplayFields({
      name: "Caesar Salad",
      description:
        "I’m a dish description. Click “Edit Menu” to open the Restaurant Menu editor and change my text",
      evidence: [
        {
          sourceKind: "wix-restaurant-menus-api",
          text: "I’m a dish description. Click “Edit Menu” to open the Restaurant Menu editor and change my text.",
        },
      ],
    }),
    { name: "Caesar Salad" },
  );
  assert.deepEqual(
    sanitizeMenuItemDisplayFields({
      name: "Buttery Croissant",
      evidence: [
        {
          source: "good-company-official-menu-review",
          text: "Reviewed Good Company official menu text: Buttery Croissant - Reviewed official row-level allergen evidence.",
        },
      ],
    }).evidence,
    [
      {
        source: "good-company-official-menu-review",
        text: "Reviewed Good Company official menu text: Buttery Croissant",
      },
    ],
  );
  assert.equal(
    classifyMenuItemRow(
      sanitizeMenuItemDisplayFields({
        name: "Caesar Salad",
        description:
          "I’m a dish description. Click “Edit Menu” to open the Restaurant Menu editor and change my text",
      }),
    ).kind,
    "menu-item",
  );
  assert.equal(
    classifyMenuItemRow(allergenPrefixArtifactRow).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(websiteAdminWidgetRow).kind, "promo");
  assert.equal(
    classifyMenuItemRow({
      name: "Google indexing",
      description: "Your testimonials will appear in Google search results.",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Number of Sliders",
      description:
        "The number of different sliders you can add to one website.",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Flexible Dates",
      description: "S M T W T F S Number of Nights Remove Nights",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "GENERALMANAGERTIMMANLEY",
      description:
        "P R I V A T E D I N I N G R O O M S A V A I L A B L E Call 202.393.0313 to reserve for your occasion.",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "PICKYOURPROTEIN",
      description: "Choice of grilled chicken breast or salmon.",
    }).kind,
    "option-group",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Egg Sandwich",
      description:
        "Y N Y Y Y modify N modify modify gluten - sub rice for ciabatta roll / soy - no slaw / sesame - no slaw",
    }).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Butterscotch Bread",
      description: "Pudding vanilla sauce S L I C E | W H O L E",
    }).description,
    "Pudding vanilla sauce",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Blueberry Muffin",
      description:
        "crunchy cinnamon sugar streusel H O T T E A H O T T E A O U R H O U S E - R O A S T E D C O F F E E",
    }).description,
    "crunchy cinnamon sugar streusel",
  );
  assert.equal(classifyMenuItemRow(exactAdminRow).kind, "navigation/legal");
  assert.equal(
    classifyMenuItemRow(orderingLocationShellRow).kind,
    "navigation/legal",
  );
  assert.equal(classifyMenuItemRow(storeLocatorWidgetRow).kind, "promo");
  assert.equal(
    classifyMenuItemRow(bareAdminProfileRow).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow(restaurantAdminCategoryRow).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow(locationFinderNoSpaceRow).kind,
    "navigation/legal",
  );
  assert.equal(classifyMenuItemRow(retailPosterRow).kind, "promo");
  assert.equal(classifyMenuItemRow(newsletterSignupRow).kind, "promo");
  assert.equal(
    classifyMenuItemRow(restaurantLocationShell).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow(compactAddressLocationShell).kind,
    "navigation/legal",
  );
  assert.equal(classifyMenuItemRow(currencyBoundaryRow).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(categoryCurrencyBoundaryRow).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow(sectionHeaderAllergenNote).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(groupedHandRollsBleed).kind, "source-note");
  assert.equal(classifyMenuItemRow(compactSushiBoxBleed).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(actualDishWithWelcomeKeyword).kind,
    "menu-item",
  );
  assert.equal(actualDishWithLocationHoursBleed.description, undefined);
  assert.equal(
    classifyMenuItemRow(actualDishWithLocationHoursBleed).kind,
    "menu-item",
  );
  assert.equal(classifyMenuItemRow(visitPlanningRow).kind, "navigation/legal");
  assert.equal(classifyMenuItemRow(groupPlanningRow).kind, "navigation/legal");
  assert.equal(
    classifyMenuItemRow(sectionHeaderWithDefaultSides).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(noSpaceFoodborneLegend).kind, "source-note");
  assert.equal(
    classifyMenuItemRow(noSpaceFlexitarianHeader).kind,
    "source-note",
  );
  assert.equal(classifyMenuItemRow(kidsMenuPackedHeader).kind, "source-note");
  assert.equal(
    classifyMenuItemRow({ name: "Column1", category: "CLASSIC CONCESSIONS" })
      .kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({ name: "Sugar in Grams", category: "Burger" }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "KFC products are fried in oil which may",
      category: "Chicken",
      description:
        "Contains the following: Canola Oil and Hydrogenated Soybean Oil with TBHQ and Citric Acid Added To Protect Flavor",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Thursday:",
      category: "Late Night Menu (After 9pm)",
      description:
        "Mexicali Bowl $16.95 Crispy fried tortilla bowl with lettuce, seasoned ground beef, fresh avocado, black beans, sweet corn and house-made pico de gallo.",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "TOTAL CHICKEN CRISPY",
      category: "Salads",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Taco Chicken Crispy single",
      category: "Salads",
    }).kind,
    "modifier",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Duck (Fried)",
      category: "Dessert",
    }).kind,
    "modifier",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Bowls & Salads",
      category: "Menu Category",
      description:
        "Choice of Boneless Chicken Breast, Boneless Thighs, Pulled Chicken or Grilled Halloumi.",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      name: "Agree & Join LinkedIn",
      category: "Cafe",
      description:
        "By clicking Continue, you agree to LinkedIn’s User Agreement, Privacy Policy, and Cookie Policy.",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "User Agreement",
      description:
        "By continuing, you agree to LinkedIn’s User Agreement, Privacy Policy, and Cookie Policy.",
    }).description,
    undefined,
  );
  assert.equal(classifyMenuItemRow(saladToppingsHeader).kind, "option-group");
  assert.equal(
    sanitizeMenuItemDisplayFields(singleLetterDescription).description,
    undefined,
  );
  assert.equal(
    sanitizeMenuItemDisplayFields(claimMenuDisclaimer).description,
    undefined,
  );
  assert.equal(classifyMenuItemRow(whiskeyGlazeSauce).kind, "menu-item");
  assert.equal(classifyMenuItemRow(whiskeyGlazeFood).kind, "menu-item");
  assert.equal(classifyMenuItemRow(hardSeltzer).kind, "source-note");
  assert.equal(
    classifyMenuItemRow({ name: "Rose Ddeok-Bokki", category: "K-Food" }).kind,
    "menu-item",
  );
  assert.equal(
    classifyMenuItemRow({ name: "admin-dev", category: "Menu" }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({ name: "Contacts", category: "Menu" }).kind,
    "navigation/legal",
  );
  assert.equal(classifyMenuItemRow(sarkuHeroShell).kind, "promo");
  assert.equal(classifyMenuItemRow(sarkuSelfDescription).kind, "promo");
  assert.equal(classifyMenuItemRow(sarkuOfficialInfoShell).kind, "source-note");
  assert.equal(
    classifyMenuItemRow({ name: "Teriyaki Entrées", category: "Teriyaki" })
      .kind,
    "source-note",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Big Queso Energy Burger",
      category: "Cals",
    }).category,
    "Burgers & Sandwiches",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Mozzarella Sticks (4) with Whiskey-Glaze",
      category: "Cals",
    }).category,
    "Appetizers",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      name: "Mozzarella Sticks (4) with Whiskey-Glaze",
      category: "Sauces & Dressings",
    }).category,
    "Appetizers",
  );
});

test("parser quality rejects package, template, delivery marketing, and cocktail artifacts", () => {
  assert.equal(
    classifyMenuItemRow({
      category: "Party Menus",
      description:
        "Choose from a selection of beautiful timeline templates to display on your site.",
      name: "Stunning templates",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Tier 1 Package",
      description: "Choose from:",
      name: "First Course",
    }).kind,
    "option-group",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Order The Best Of Mexico",
      description:
        "Some nights are better spent at home, and we're here for that. Order online and choose from signature enchiladas, mole verde, a fried chicken sandwich, or the queso and jalapeño burger.",
      name: "Delivered fresh across Washington",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Seafood",
      description:
        "Choose from Ketel One or Tanqueray 10, vermouth, Fish Shop olive brine",
      name: "THIS IS THE RIVER",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Seafood",
      description: "Beer battered cod with tartar sauce.",
      name: "Fish and Chips",
    }).kind,
    "menu-item",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Seafood",
      description:
        "Be the first to receive updates about our private events, secret menus, and special promotions. Sign up for our email newsletters.",
      name: "Join Our VIP List",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Mexican",
      description:
        "Allow your customer to leave you custom instructions at checkout.",
      name: "Collect Custom Order Instructions",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Brunch",
      description:
        "IRELAND’S FOUR PROVINCES RESTAURANT & PUB, est.1997 FOLLOW Private Events & Catering Available Visit Our Website:",
      name: "We Proudly Serve American Ground Beef",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Menus",
      description:
        "Join us this New Year’s Eve and enjoy a custom four-course menu for $75/person with a DJ and champagne toast at midnight.",
      name: "NEW YEAR'S EVE",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Allergies",
      description:
        "Our food may contain or come into contact with common allergens.",
      name: "Food Allergies:",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Restaurant",
      description:
        ":00 AM - 6:00 PM July 4th 12/24/2026 11:00 AM - 5:00 PM Christmas Eve",
      name: "Special Store Hours",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Sushi / Ramen",
      description: "Home About Menu Events Contact FAQ",
      name: "Ouick Links",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Restaurant",
      description:
        "Street/Garage Parking Nearby. Nearest Metro Station: Rosslyn",
      name: "Parking & Metro",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Brunch",
      description: "two fried eggs, rosemary and parmesan breakfast potatoes",
      name: "$17.99 • 970 Cal",
    }).kind,
    "price-line",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Italian",
      description: ".5% | 12 oz.",
      name: "NON-ALCOHOLIC",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "PIEMONTE - OTHER",
      description: "| Nebbiolo | Langhe 2020",
      name: 'Aldo Conterno "Il Favot"',
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "SWEET",
      description: "Tawny Port",
      name: "C.N. Kopke",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "ITALY | NORTH",
      description: "| Arneis | Roero Arneis Riserva - Piemonte 2022",
      name: 'Angelo Negro "Perdaudin"',
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Italian",
      description:
        "Carpaccio di manzo Thin slices of raw beef served with shaved Parmigiano. Prosciutto e mozzarella di bufala Imported water buffalo mozzarella.",
      name: "Antipasti",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Antipasti",
      description:
        "Mussels sauteed in white wine, parsley, and garlic or Napolitan tomato sauce.",
      name: "Cozze",
    }).kind,
    "menu-item",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Greek",
      description:
        "You are 1 click away from having the best Testimonials App on your site.",
      name: "Beautiful, Easy Integration",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Dessert",
      description:
        "Categories: Dessert, Mini Pastries, Pastries, Cookies and Sweets, Regular Pastries, Sweets Tag: Breakfast $2.00",
      name: "SKU:",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Reviews",
      description:
        "Linzer cookies, hammentashen, brats, doughnuts, coffee, brotchen, and more. All good. On my all time top10 of best food places in USA.",
      name: "Yelp! Review",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Faq 1",
      description:
        "MON-THURS: 5:30-9:00 PM FRI-SAT: 5:00-9:00 PM SUNDAY: CLOSED",
      name: "COUNTER SERVICE: FIRST COME / FIRST SERVED",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Uyghur",
      description:
        "The Uyghurs are a Turkic-speaking, predominantly Muslim group of people from the East Turkistan region of Central Asia.",
      name: "Our Culture",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Cajun / Creole",
      description:
        "Where to find New York-style pizza, Texas barbecue, hot chicken",
      name: "14 Food Halls Around D.C",
    }).kind,
    "promo",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Italian",
      description:
        "Everything you need to know before your visit - from hours and reservations to pasta, wine, and private events",
      name: "CLOSED",
    }).kind,
    "navigation/legal",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Restaurant",
      description:
        "Chicken Marinated & grilled Falafel Crispy & plant-based Gyro Savory lamb & beef",
      name: "1Choose a protein:",
    }).kind,
    "option-group",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Restaurant",
      description:
        "choice of protein, tomato, onions, lettuce, and tzatziki or choice of sauce",
      name: "ALL BURGERS SERVED ON A MARTIN'S POTATO BUN",
    }).kind,
    "source-note",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Menu",
      description: "served with seasonal vegetables",
      name: "Branzino",
      sourceType: "html-image-menu",
    }).kind,
    "menu-item",
  );
  assert.equal(
    classifyMenuItemRow({
      category: "Menu",
      name: "67557e3c4b02cfb35f1b6913 Salmon",
      sourceType: "html-image-menu",
    }).kind,
    "source-note",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      category: "Peruvian",
      description:
        "‘Three milk’ sponge cake, meringue, Amarena cherry Pisco y Nazca Bethesda Location and Ordering Hours (305) 468-3700 2 BETHESDA METRO CENTER",
      name: "TRES LECHES",
    }).description,
    "‘Three milk’ sponge cake, meringue, Amarena cherry",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      category: "Lunch & Dinner",
      description:
        "seven cheese macaroni, green beans swap your waffle for a donut safety is paramount. Not all ingredients are listed. Because of our scratch kitchen, we strongly recommend individuals with severe allergies susceptible to cross-contact do not dine in the restaurant.",
      name: "Fried Chicken & Waffle",
    }).description,
    "seven cheese macaroni, green beans swap your waffle for a donut",
  );
  assert.equal(
    sanitizeMenuItemDisplayFields({
      category: "Chicken",
      description:
        "BEVERAGE MENU @YARDBIRDRESTAURANTS | RUNCHICKENRUN.COM preparation.",
      name: "Chicken & Waffles",
    }).description,
    undefined,
  );
});

test("coverage gate applies reviewed display repairs before inference rebuilds", () => {
  const generatedAt = "2026-07-04T00:00:00.000Z";
  const repository = {
    generatedAt,
    restaurants: [
      {
        id: "anafre-dc",
        name: "Anafre",
        coverageStatus: "complete",
        coveragePercent: 100,
        items: [
          {
            id: "chicken",
            name: "Chicken",
            category: "Sandwiches",
            description:
              "grilled chicken, pepper jack cheese, caramelized onions, lettuce, tomato, avocado",
          },
        ],
      },
    ],
  };

  const gated = applyCoverageGate(repository).repository.restaurants[0];
  assert.equal(gated.items[0].id, "chicken-sandwich");
  assert.equal(gated.items[0].name, "Chicken Sandwich");
  assert.equal(gated.items[0].category, "Sandwiches");
  assert.equal(gated.items[0].evidence.at(-1).source, "manual-quality-review");
});

test("official evidence audit separates full, partial, disclosure-only, global-note, and parser-error rows", () => {
  const full = officialEvidenceClassification({
    items: Array.from({ length: 30 }, (_, index) => ({
      id: `full-${index}`,
      name: `Menu Item ${index}`,
      description: "Grilled entree with seasonal vegetables.",
      allergenSourceType: "official-allergen-menu",
      sourceType: "pdf-matrix",
      officialSource: true,
    })),
  });
  const partial = officialEvidenceClassification({
    items: [
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `partial-${index}`,
        name: `Menu Item ${index}`,
        description: "Grilled item with seasonal vegetables.",
        allergenSourceType: "official-allergen-menu",
        sourceType: "html-allergen-matrix",
        officialSource: true,
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `unavailable-${index}`,
        name: `Unavailable Item ${index}`,
        allergenSourceType: "unavailable",
      })),
    ],
  });
  const disclosureOnly = officialEvidenceClassification({
    items: [
      {
        id: "nuts-disclosure",
        name: "Contains Nuts Disclosure",
        description: "This dessert contains walnuts.",
        allergenSourceType: "official-product-allergen-section",
        officialSource: true,
      },
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `item-${index}`,
        name: `Menu Item ${index}`,
        allergenSourceType: "unavailable",
      })),
    ],
  });
  const globalNote = officialEvidenceClassification({
    items: [
      {
        id: "cross-contact",
        name: "Kitchen Notice",
        description:
          "Food prepared here may contain traces due to cross-contact.",
        allergenSourceType: "official-ingredients",
        officialSource: true,
      },
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `item-${index}`,
        name: `Menu Item ${index}`,
        allergenSourceType: "unavailable",
      })),
    ],
  });
  const itemLevelMayContain = officialEvidenceClassification({
    items: [
      {
        id: "sausage-roll",
        name: "Sausage Roll",
        description:
          "Puff pastry wrapped around pork sausage. May contain sesame seeds.",
        allergenSourceType: "official-ingredients",
        officialSource: true,
        allergens: ["wheat", "gluten"],
        mayContain: ["sesame"],
      },
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `item-${index}`,
        name: `Menu Item ${index}`,
        allergenSourceType: "unavailable",
      })),
    ],
  });
  const parserError = officialEvidenceClassification({
    items: [
      {
        id: "privacy",
        name: "Privacy Policy",
        description: "Official allergen matrix row parsed from table cells.",
        allergenSourceType: "official-allergen-menu",
        sourceType: "pdf-matrix",
        officialSource: true,
      },
    ],
  });
  const longOfficialName = officialEvidenceClassification({
    items: Array.from({ length: 30 }, (_, index) => ({
      id: `long-${index}`,
      name:
        index === 0
          ? "12 oz. New York Strip (Whiskey-Glaze) with Mashed Potatoes and Garlic-Butter Broccoli"
          : `Menu Item ${index}`,
      allergenSourceType: "official-allergen-menu",
      sourceType: "pdf-matrix",
      officialSource: true,
    })),
  });

  assert.equal(full.bucket, "official-full");
  assert.equal(partial.bucket, "official-partial");
  assert.equal(disclosureOnly.bucket, "official-disclosure-only");
  assert.equal(globalNote.bucket, "official-global-note-only");
  assert.equal(itemLevelMayContain.bucket, "official-disclosure-only");
  assert.equal(itemLevelMayContain.globalCrossContactNote, 0);
  assert.equal(parserError.bucket, "likely-official-parser-error");
  assert.equal(longOfficialName.bucket, "official-full");
});

test("launch quality publishes accommodation-only shells without menu items", () => {
  const shell = evaluateRestaurantLaunchQuality({
    restaurant: {
      id: "accommodation-shell",
      name: "Accommodation Shell",
      items: [],
    },
    target: {
      accommodationOnly: true,
      allergyAccommodationPolicy: {
        summary:
          "Guests should contact the restaurant before booking to discuss allergies.",
        source: "official-site",
      },
    },
  });

  assert.equal(shell.launchStatus, launchQualityStatuses.published);
  assert.equal(shell.remediationBucket, "accommodation-policy-only");
  assert.equal(shell.issueCodes.includes("no-menu-items"), false);
});

test("official source status stays unparsed for token partial extraction", () => {
  const source = {
    id: "partial-official-test",
    name: "Partial Official Test",
    allergenUrls: ["https://example.com/allergen-guide"],
    menuUrls: ["https://example.com/menu"],
  };
  const restaurant = {
    id: source.id,
    items: Array.from({ length: 30 }, (_, index) => ({
      name: `Item ${index + 1}`,
      allergenSourceType:
        index === 0 ? "official-product-allergen-section" : "unavailable",
    })),
  };

  assert.equal(
    officialStatusForSource({
      source,
      restaurant,
      sourceResults: [
        {
          ok: true,
          url: "https://example.com/allergen-guide",
          role: "official-allergen",
        },
      ],
    }),
    officialAllergenStatuses.sourceFoundUnparsed,
  );
});

test("official nutrition-only sources do not count as unparsed allergen sources", () => {
  const source = {
    id: "nutrition-only-official-test",
    name: "Nutrition Only Official Test",
    menuUrls: ["https://example.com/menu"],
  };
  const restaurant = {
    id: source.id,
    items: Array.from({ length: 30 }, (_, index) => ({
      name: `Item ${index + 1}`,
      allergenSourceType: "unavailable",
      nutritionFacts: index === 0 ? { Calories: "100" } : undefined,
    })),
  };

  assert.equal(
    officialStatusForSource({
      source,
      restaurant,
      sourceResults: [
        {
          ok: true,
          url: "https://example.com/nutrition",
          role: "official-nutrition",
        },
      ],
    }),
    officialAllergenStatuses.notFound,
  );
});

test("Nutritionix filter probes do not count as found allergen sources when extraction fails", () => {
  const source = {
    id: "nutritionix-probe-test",
    name: "Nutritionix Probe Test",
    menuUrls: ["https://example.com/menu"],
    nutritionix: {
      url: "https://www.nutritionix.com/example/menu/premium",
      sourceLabel: "Nutritionix online nutrition guide.",
    },
  };
  const restaurant = {
    id: source.id,
    items: Array.from({ length: 30 }, (_, index) => ({
      name: `Item ${index + 1}`,
      allergenSourceType: "unavailable",
    })),
  };

  assert.equal(
    officialStatusForSource({
      source,
      restaurant,
      sourceResults: [
        {
          ok: true,
          role: "",
          url: "https://www.nutritionix.com/example/menu/premium?allergenFree=2&allergenTags%5B0%5D=allergen_contains_milk",
        },
      ],
    }),
    officialAllergenStatuses.notFound,
  );
});

test("weak direct allergen smear is not treated as sufficient extracted data", () => {
  const restaurant = {
    id: "nutritionix-smear-test",
    items: Array.from({ length: 60 }, (_, index) => ({
      name: `Smoothie ${index + 1}`,
      allergenSourceType: "official-allergen-menu",
      allergens: [
        "egg",
        "fish",
        "gluten",
        "milk",
        "peanut",
        "sesame",
        "shellfish",
        "soy",
        "tree-nut",
      ],
      sourceUrl: "https://www.nutritionix.com/example/menu/premium",
    })),
  };
  const source = {
    id: restaurant.id,
    name: "Nutritionix Smear Test",
    apiUrls: ["https://www.nutritionix.com/example/menu/premium"],
  };
  const quality = evaluateRestaurantLaunchQuality({ restaurant });

  assert.equal(officialAllergenSmearSummary(restaurant).suspected, true);
  assert.equal(
    officialAllergenDistributionSummary(restaurant).likelyDirectSmear,
    true,
  );
  assert.notEqual(
    officialStatusForSource({ source, restaurant, sourceResults: [] }),
    officialAllergenStatuses.extracted,
  );
  assert.ok(quality.issueCodes.includes("official-direct-allergen-smear"));
});

test("official broad cross-contact evidence is not treated as direct allergen smear", () => {
  const restaurant = {
    id: "bww-cross-contact-test",
    items: Array.from({ length: 60 }, (_, index) => ({
      name: `Wing ${index + 1}`,
      allergenSourceType: "official-allergen-menu",
      allergens: [],
      mayContain: [
        "egg",
        "fish",
        "gluten",
        "milk",
        "peanut",
        "sesame",
        "shellfish",
        "soy",
        "tree-nut",
        "wheat",
      ],
      evidence: [
        {
          sourceKind: "pdf-matrix",
          sourceUrl: "https://example.com/bww-allergen-guide.pdf",
          text: "Official BWW allergen guide row parsed; direct marker glyphs are not text-extractable, so cross-contact review is retained.",
        },
      ],
    })),
  };
  const distribution = officialAllergenDistributionSummary(restaurant);
  const quality = evaluateRestaurantLaunchQuality({ restaurant });

  assert.equal(distribution.likelyDirectSmear, false);
  assert.equal(distribution.supportedBroadCrossContact, true);
  assert.equal(officialAllergenSmearSummary(restaurant).suspected, false);
  assert.equal(
    officialStatusForSource({
      source: {
        id: restaurant.id,
        allergenUrls: ["https://example.com/bww-allergen-guide.pdf"],
      },
      restaurant,
      sourceResults: [],
    }),
    officialAllergenStatuses.extracted,
  );
  assert.equal(
    quality.issueCodes.includes("official-direct-allergen-smear"),
    false,
  );
  assert.equal(
    quality.issueCodes.includes("official-cross-contact-needs-evidence"),
    false,
  );

  const globalNoticeRestaurant = {
    id: "global-contact-notice-test",
    items: Array.from({ length: 25 }, (_, index) => ({
      name: `Menu Item ${index + 1}`,
      allergenSourceType: "official-global-cross-contact-note",
      allergens: [],
      mayContain: [
        "egg",
        "fish",
        "milk",
        "peanut",
        "shellfish",
        "soy",
        "tree-nut",
        "wheat",
      ],
      evidence: [
        {
          sourceKind: "official-website-note",
          text: "Menu items may contain or come into contact with wheat, milk, eggs, peanuts, tree nuts, fish, shellfish and soy.",
        },
      ],
    })),
  };

  assert.equal(
    officialAllergenDistributionSummary(globalNoticeRestaurant)
      .supportedBroadCrossContact,
    true,
  );
});

test("high direct allergens with row-level evidence are audited but not automatically rejected", () => {
  const restaurant = {
    id: "row-evidence-direct-test",
    items: Array.from({ length: 60 }, (_, index) => ({
      name: `Matrix Item ${index + 1}`,
      allergenSourceType: "official-allergen-menu",
      allergens: ["egg", "gluten", "milk", "soy", "wheat"],
      mayContain: [],
      evidence: [
        {
          sourceKind: "pdf-matrix",
          sourceUrl: "https://example.com/allergen-matrix.pdf",
          text: "Official allergen matrix row parsed from table cells.",
        },
      ],
    })),
  };
  const distribution = officialAllergenDistributionSummary(restaurant);

  assert.equal(distribution.likelyDirectSmear, false);
  assert.equal(officialAllergenSmearSummary(restaurant).suspected, false);
  assert.equal(
    officialStatusForSource({
      source: {
        id: restaurant.id,
        allergenUrls: ["https://example.com/allergen-matrix.pdf"],
      },
      restaurant,
      sourceResults: [],
    }),
    officialAllergenStatuses.extracted,
  );
});

test("P.F. Chang's strict official direct matrix is supported by row-level source cells", () => {
  const restaurant = {
    id: "pf-changs",
    items: Array.from({ length: 60 }, (_, index) => ({
      name: `P.F. Chang's Matrix Item ${index + 1}`,
      allergenSourceType: "official-allergen-menu",
      allergens: [
        "egg",
        "milk",
        "sesame",
        "shellfish",
        "soy",
        "sulfites",
        "wheat",
      ],
      mayContain: [],
      evidence: [
        {
          sourceKind: "html-allergen-matrix",
          sourceUrl: "https://www.pfchangs.com/nutrition/allergens-to-go",
          text: "Official P.F. Chang's allergen matrix row: Matrix Item: Wheat X; Soy X; Milk X; Egg X; Shellfish X; Sulfites X; Sesame X.",
        },
      ],
    })),
  };
  const distribution = officialAllergenDistributionSummary(restaurant);

  assert.equal(distribution.likelyDirectSmear, false);
  assert.equal(distribution.supportedStrictDirectMatrix, true);
  assert.equal(officialAllergenSmearSummary(restaurant).suspected, false);
});

test("launch quality reports low official coverage and parser artifacts separately", () => {
  const restaurant = {
    id: "low-coverage-artifact-test",
    items: [
      ...Array.from({ length: 2 }, (_, index) => ({
        name: `Official Item ${index + 1}`,
        allergenSourceType: "official-allergen-menu",
        allergens: ["milk"],
        mayContain: [],
        evidence: [{ text: "Official allergen matrix row parsed." }],
      })),
      ...Array.from({ length: 28 }, (_, index) => ({
        name: index === 0 ? "Privacy Policy" : `Menu Item ${index + 1}`,
        allergenSourceType: "unavailable",
        allergens: [],
        mayContain: [],
        evidence: [{ text: "Menu source row." }],
      })),
    ],
    officialAllergenStatus: officialAllergenStatuses.extracted,
  };
  const quality = evaluateRestaurantLaunchQuality({ restaurant });

  assert.equal(quality.officialItemCount, 2);
  assert.ok(quality.issueCodes.includes("low-official-coverage"));
  assert.ok(quality.suspiciousRowCount > 0);
});

test("official spreadsheet allergen matrices produce official item records", () => {
  const rows = [
    ["NUTRITION FACTS", "Calories", "ALLERGENS", null, null],
    [null, null, "Egg", "Milk", "Wheat"],
    ["APPETIZERS", null, null, null, null],
    ["Pretzel Sticks", 720, null, "x", "x"],
    ["Plain Popcorn", 350, null, null, null],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "CONCESSION");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  const records = extractSpreadsheetItems(
    buffer,
    { category: "Cinema", id: "spreadsheet-test" },
    "https://example.com/allergens.xlsx",
    "allergen",
  );

  const pretzel = records.find((record) => record.name === "Pretzel Sticks");

  assert.ok(pretzel);
  assert.equal(pretzel.category, "APPETIZERS");
  assert.equal(pretzel.allergenSourceType, "official-allergen-menu");
  assert.deepEqual(pretzel.allergens.sort(), ["milk", "wheat"]);
  assert.equal(pretzel.nutritionFacts.Calories, 720);
  assert.equal(pretzel.sourceKind, "official-spreadsheet-matrix");
});

test("official spreadsheet allergen matrices ignore nutrition numbers in stale allergen columns", () => {
  const rows = [
    [
      "NUTRITION FACTS",
      "Serving Size",
      "Calories",
      "ALLERGENS",
      null,
      null,
      null,
    ],
    [null, null, null, "Egg", "Milk", "Wheat", "Soy"],
    ["APPETIZERS", null, null, null, null, null, null],
    ["Pretzel Sticks", 1, 720, null, "x", "x", null],
    ["CLASSIC CONCESSIONS", null, null, null, null, null, null],
    [
      "Column1",
      "Column2",
      "Column3",
      "Column4",
      "Column5",
      "Column6",
      "Column7",
    ],
    ["Brewed Coffee", "12oz", 0, 0, 0, 2, 0],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "RESTAURANTS");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  const records = extractSpreadsheetItems(
    buffer,
    { category: "Cinema", id: "spreadsheet-stale-header-test" },
    "https://example.com/allergens.xlsx",
    "allergen",
  );

  const pretzel = records.find((record) => record.name === "Pretzel Sticks");
  const coffee = records.find((record) => record.name === "Brewed Coffee");

  assert.ok(pretzel);
  assert.deepEqual(pretzel.allergens.sort(), ["milk", "wheat"]);
  assert.ok(coffee);
  assert.equal(coffee.allergenSourceType, "unavailable");
  assert.deepEqual(coffee.allergens, []);
  assert.equal(
    records.some((record) => record.name === "Column1"),
    false,
  );
});

test("P.F. Chang's official allergen tables keep section categories and row evidence", async () => {
  const html = `
    <table><tr><th></th><th>Wheat</th><th>Soy</th><th>Milk</th><th>Egg</th><th>Fish</th><th>Shellfish</th><th>Sulfites</th><th>Sesame</th></tr></table>
    <table>
      <tr><th></th><th>Wheat</th><th>Soy</th><th>Milk</th><th>Egg</th><th>Fish</th><th>Shellfish</th><th>Sulfites</th><th>Sesame</th></tr>
      <tr><td>Dynamite Popcorn Chicken</td><td>X</td><td>X</td><td>X</td><td>X</td><td></td><td>X</td><td>X</td><td>X</td></tr>
    </table>
  `;
  const records = await extractHtmlItems(
    html,
    { id: "pf-changs", brandKey: "pfchangs", category: "Asian" },
    "https://www.pfchangs.com/nutrition/allergens-to-go",
    "allergen",
  );
  const item = records.items.find(
    (record) => record.name === "Dynamite Popcorn Chicken",
  );

  assert.ok(item);
  assert.equal(item.category, "Appetizers");
  assert.deepEqual(item.allergens.sort(), [
    "egg",
    "milk",
    "sesame",
    "shellfish",
    "soy",
    "sulfites",
    "wheat",
  ]);
  assert.match(
    item.evidenceText,
    /Dynamite Popcorn Chicken: Wheat X; Soy X; Milk X/,
  );
});

test("record merge prefers specific menu sections over generic cuisine categories", () => {
  const [item] = mergeRecords([
    {
      name: "Dynamite Popcorn Chicken",
      category: "Asian",
      sourceKind: "pdf-matrix",
      sourceUrl: "https://example.com/allergens.pdf",
      allergenSourceType: "official-allergen-menu",
      allergens: ["wheat"],
      description: "Official matrix.",
    },
    {
      name: "Dynamite Popcorn Chicken",
      category: "Appetizers",
      sourceKind: "html-allergen-matrix",
      sourceUrl: "https://example.com/allergens.html",
      allergenSourceType: "official-allergen-menu",
      allergens: ["soy"],
      evidenceText: "Official row: Dynamite Popcorn Chicken: Wheat X; Soy X.",
    },
  ]);

  assert.equal(item.category, "Appetizers");
  assert.deepEqual(item.allergens.sort(), ["soy", "wheat"]);
  assert.ok(
    item.evidence.some((entry) =>
      /Dynamite Popcorn Chicken/.test(entry.text ?? ""),
    ),
  );
});

test("record merge does not union official allergens across different real sections", () => {
  const [item] = mergeRecords([
    {
      name: "Mongolian Beef",
      category: "Beef",
      sourceKind: "html-allergen-matrix",
      sourceUrl: "https://example.com/allergens.html",
      allergenSourceType: "official-allergen-menu",
      allergens: ["wheat", "soy", "egg"],
      evidenceText: "Official row: Mongolian Beef: Wheat X; Soy X; Egg X.",
    },
    {
      name: "Mongolian Beef",
      category: "Weekday Lunch",
      sourceKind: "html-allergen-matrix",
      sourceUrl: "https://example.com/allergens.html",
      allergenSourceType: "official-allergen-menu",
      allergens: ["wheat", "soy", "milk", "shellfish"],
      evidenceText:
        "Official lunch row: Mongolian Beef: Wheat X; Soy X; Milk X; Shellfish X.",
    },
  ]);

  assert.equal(item.category, "Beef");
  assert.deepEqual(item.allergens.sort(), ["egg", "soy", "wheat"]);
});

test("record merge keeps row-level official matrix allergens over weak Nutritionix supplements", () => {
  const [item] = mergeRecords([
    {
      name: "12 oz. New York Strip (Whiskey-Glaze)",
      category: "Hot Off The Grill",
      sourceKind: "pdf-matrix",
      sourceUrl: "https://example.com/tgi-fridays-allergen.pdf",
      allergenSourceType: "official-allergen-menu",
      allergens: ["milk", "soy", "wheat"],
      evidenceText:
        "Official TGI Fridays allergen matrix row: 12 oz. New York Strip (Whiskey-Glaze): Milk √; Soy √; Wheat √.",
    },
    {
      name: "12 oz. New York Strip (Whiskey-Glaze)",
      category: "From The Grill",
      sourceKind: "official-api",
      sourceUrl: "https://www.nutritionix.com/tgi-fridays/menu/premium",
      allergenSourceType: "official-allergen-menu",
      allergens: [
        "egg",
        "fish",
        "gluten",
        "milk",
        "peanut",
        "shellfish",
        "soy",
        "tree-nut",
        "wheat",
      ],
      description: "TGI Fridays Nutritionix online nutrition guide.",
      nutritionFacts: { calories: 1120 },
    },
  ]);

  assert.equal(item.sourceType, "pdf-matrix");
  assert.deepEqual(item.allergens.sort(), ["milk", "soy", "wheat"]);
  assert.equal(item.nutritionFacts.calories, 1120);
  assert.ok(item.sourceUrls.some((url) => /nutritionix\.com/.test(url)));
});

test("P.F. Chang's official PDF fallback rows use reviewed source-profile sections", () => {
  const items = mergeRecords([
    {
      name: "Korean Sesame Chicken",
      category: "Asian",
      sourceKind: "pdf-matrix",
      sourceUrl:
        "https://www.pfchangs.com/docs/default-source/pdf/pfc-national-menu-allergens-june-2026.pdf",
      allergenSourceType: "official-allergen-menu",
      allergens: ["wheat", "soy", "milk", "egg", "shellfish", "sesame"],
      evidenceText: "Official P.F. Chang's menu item from allergen matrix.",
    },
    {
      name: "Chicken",
      category: "Choose Your Protein",
      sourceKind: "html-allergen-matrix",
      sourceUrl: "https://www.pfchangs.com/nutrition/allergens-to-go",
      allergenSourceType: "official-allergen-menu",
      allergens: ["soy"],
      evidenceText:
        "Official P.F. Chang's allergen matrix row: Chicken: Soy X.",
    },
  ]);
  const item = items.find(
    (candidate) => candidate.name === "Korean Sesame Chicken",
  );

  assert.ok(item);
  assert.equal(item.category, "Chicken");
  assert.deepEqual(item.allergens.sort(), [
    "egg",
    "milk",
    "sesame",
    "shellfish",
    "soy",
    "wheat",
  ]);
});

test("source menu name gate keeps food items with drink-like substrings", () => {
  const source = { id: "bbq-chicken", category: "Korean" };

  assert.equal(isAllowedSourceMenuName(source, "Golden Original"), true);
  assert.equal(isAllowedSourceMenuName(source, "Spicy Original Wing"), true);
  assert.equal(
    isAllowedSourceMenuName(source, "Golden Original Sandwich"),
    true,
  );
  assert.equal(isAllowedSourceMenuName(source, "Rose Pasta"), true);
  assert.equal(isAllowedSourceMenuName(source, "Rose Ddeok-Bokki"), true);
  assert.equal(isAllowedSourceMenuName(source, "Lemon Tonic"), false);
});

test("bb.q Chicken PDF parser groups allergen text by item row bands", () => {
  const records = extractBbqChickenPageRows(
    [
      {
        category: "Chicken",
        items: [
          { x: 244, str: "Wheat, Soybean" },
          { x: 547, str: "Milk, Mackerel, Peanut, Crab, Eggs" },
        ],
        pageNumber: 1,
        y: 553,
      },
      {
        category: "Chicken",
        items: [{ x: 49, str: "Honey Garlic" }],
        pageNumber: 1,
        y: 544,
      },
      {
        category: "Chicken",
        items: [{ x: 547, str: "Shrimp, Squid, Abalone and Mussels)" }],
        pageNumber: 1,
        y: 539,
      },
      {
        category: "Chicken",
        items: [
          { x: 244, str: "Wheat, Soybean, Milk" },
          { x: 547, str: "Gluten" },
        ],
        pageNumber: 1,
        y: 514,
      },
      {
        category: "Chicken",
        items: [{ x: 49, str: "Spicy Original Wing" }],
        pageNumber: 1,
        y: 505,
      },
    ],
    { id: "bbq-chicken", name: "bb.q Chicken", category: "Chicken" },
    "https://bbqchicken.com/wp-content/uploads/2024/08/bbq-Allergy-List.pdf",
    "Chicken",
  );
  const honeyGarlic = records.find((record) => record.name === "Honey Garlic");

  assert.ok(honeyGarlic);
  assert.deepEqual(honeyGarlic.allergens.sort(), ["soy", "wheat"]);
  assert.deepEqual(honeyGarlic.mayContain.sort(), [
    "egg",
    "fish",
    "milk",
    "peanut",
    "shellfish",
  ]);
  assert.match(
    honeyGarlic.evidenceText,
    /Honey Garlic allergens: Wheat, Soybean/,
  );
  assert.match(honeyGarlic.evidenceText, /Shrimp, Squid, Abalone and Mussels/);
});

test("bb.q Chicken official PDF parser preserves official rows with drink-like substrings", async () => {
  const pdfPath = "/tmp/allergy-audit/bbq-Allergy-List.pdf";

  if (!existsSync(pdfPath)) {
    return;
  }

  const records = await extractBbqChickenAllergenPdfItems(
    readFileSync(pdfPath),
    { id: "bbq-chicken", name: "bb.q Chicken", category: "Korean" },
    "https://bbqchicken.com/wp-content/uploads/2024/08/bbq-Allergy-List.pdf",
  );
  const byName = new Map(records.map((record) => [record.name, record]));

  assert.equal(records.length, 44);
  assert.ok(byName.has("Golden Original"));
  assert.ok(byName.has("Spicy Original Wing"));
  assert.ok(byName.has("Rose Pasta"));
  assert.ok(byName.has("Rose Ddeok-Bokki"));
  assert.deepEqual(byName.get("Rose Pasta").allergens.sort(), [
    "egg",
    "milk",
    "shellfish",
    "soy",
    "wheat",
  ]);
});

test("OSI Top 9 official allergen PDFs map Y markers to item allergens and sections", async () => {
  const pdfPath =
    "/tmp/allergy-audit/bonefish/BonefishGrillAllergensApril2026.pdf";

  if (!existsSync(pdfPath)) {
    return;
  }

  const records = await extractOsiTop9AllergenPdfItems(
    readFileSync(pdfPath),
    { id: "bonefish-grill", name: "Bonefish Grill", category: "Seafood" },
    "https://edge.sitecorecloud.io/osirestaurantpartners-piq24hos/media/Project/BBI/bonefishgrill/Nutrition/PDFs/BonefishGrillAllergensApril2026.pdf",
  );
  const byName = new Map(records.map((record) => [record.name, record]));
  const starterBangBangShrimp = records.find(
    (record) =>
      record.name === "Bang Bang Shrimp" &&
      record.category === "Starters & Sharing",
  );

  assert.ok(records.length >= 200);
  assert.equal(
    records.filter((record) => record.category === "Eggs").length,
    0,
  );
  assert.ok(starterBangBangShrimp);
  assert.deepEqual(starterBangBangShrimp.allergens.sort(), [
    "egg",
    "milk",
    "shellfish",
    "soy",
    "wheat",
  ]);
  assert.deepEqual(byName.get("Jasmine Rice").allergens, []);
  assert.deepEqual(byName.get("Bourbon Glazed Salmon").allergens.sort(), [
    "egg",
    "fish",
    "soy",
    "wheat",
  ]);
});

test("Nando's official allergen PDF separates direct and may-contain disclosures", async () => {
  const pdfPath = "/tmp/allergy-audit/nandos/Nandos_Allergen_Guide_May2024.pdf";

  if (!existsSync(pdfPath)) {
    return;
  }

  const records = await extractNandosNutritionAllergenPdfItems(
    readFileSync(pdfPath),
    { id: "nandos-dc", name: "Nando's PERi-PERi", category: "Chicken" },
    "https://assets.ctfassets.net/xlzobf9ybr6d/6AiTZW0VlazH6ENSg417dI/8951f950fda730458bd7fa5fda978a52/Nandos_Allergen_Guide_May2024.pdf",
  );
  const byName = new Map(records.map((record) => [record.name, record]));

  assert.ok(records.length >= 100);
  assert.deepEqual(byName.get("Boneless Breast").allergens, []);
  assert.deepEqual(byName.get("Boneless Breast").mayContain.sort(), [
    "egg",
    "mustard",
    "soy",
    "wheat",
  ]);
  assert.deepEqual(byName.get("Portuguese Roll").allergens.sort(), ["wheat"]);
  assert.deepEqual(byName.get("Portuguese Roll").mayContain.sort(), [
    "egg",
    "milk",
    "sesame",
    "soy",
    "sulfites",
  ]);
  assert.deepEqual(byName.get("Chicken Sandwich").allergens.sort(), [
    "egg",
    "gluten",
    "mustard",
    "soy",
    "wheat",
  ]);
  assert.deepEqual(byName.get("Chicken Sandwich").mayContain.sort(), [
    "milk",
    "sesame",
    "sulfites",
    "tree-nut",
  ]);
});

test("RASA official allergy chart ignores unsupported columns and maps nuts cautiously", async () => {
  const pdfPath = "/tmp/allergy-audit/rasa/Allergy-Chart.pdf";

  if (!existsSync(pdfPath)) {
    return;
  }

  const records = await extractRasaAllergyChartPdfItems(
    readFileSync(pdfPath),
    { id: "rasa-dc", name: "RASA", category: "Indian" },
    "https://storage.googleapis.com/open-merchant-app-assets/media/2c8f883e-c840-470b-a6f9-bff5a585b530/2dc03fee-b2f6-404d-a7c5-2f42a1ac5760/Allergy%20Chart.pdf",
  );
  const byName = new Map(records.map((record) => [record.name, record]));

  assert.equal(records.length, 46);
  assert.deepEqual(byName.get("Masala Quinoa").allergens, []);
  assert.deepEqual(byName.get("Tandoori Paneer").allergens.sort(), [
    "milk",
    "soy",
  ]);
  assert.deepEqual(byName.get("Peanut Sesame Sauce").allergens.sort(), [
    "peanut",
    "sesame",
    "tree-nut",
  ]);
  assert.deepEqual(byName.get("Garlic Naan").allergens.sort(), [
    "egg",
    "milk",
    "wheat",
  ]);
  assert.equal(
    records.some((record) => record.category === "Indian"),
    false,
  );
  assert.equal(
    records.some((record) => record.allergens.includes("shellfish")),
    false,
  );
});

test("Insomnia Cookies official nutrition guide parses product pages instead of ingredient fragments", async () => {
  const pdfPath =
    "/tmp/allergy-audit/insomnia/Insomnia-Master-Nutrition-Facts-Guide.pdf";

  if (!existsSync(pdfPath)) {
    return;
  }

  const records = await extractInsomniaCookiesNutritionGuidePdfItems(
    readFileSync(pdfPath),
    {
      id: "insomnia-cookies-dc",
      name: "Insomnia Cookies",
      category: "Dessert",
    },
    "https://cdn1.insomniacookies.com/uploads/Insomnia%20Cookies%20Master%20Nutrition%20Facts%20Guide%20(1).pdf",
  );
  const byName = new Map(records.map((record) => [record.name, record]));

  assert.ok(records.length >= 25);
  assert.deepEqual(byName.get("Chocolate Chunk").allergens.sort(), [
    "egg",
    "milk",
    "soy",
    "wheat",
  ]);
  assert.deepEqual(byName.get("White Chocolate Macadamia").allergens.sort(), [
    "egg",
    "milk",
    "soy",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual(
    byName.get("Vegan Gluten-Free Chocolate Chip").allergens.sort(),
    ["soy"],
  );
  assert.ok(
    byName
      .get("Vegan Gluten-Free Chocolate Chip")
      .mayContain.includes("gluten"),
  );
  assert.deepEqual(
    byName.get("Peanut Butter Insomnia Tracks").allergens.sort(),
    ["egg", "gluten", "milk", "peanut", "soy", "wheat"],
  );
  assert.equal(
    records.some((record) =>
      /DEXTROSE|VANILLA EXTRACT|DIGLYCERIDES/i.test(record.name),
    ),
    false,
  );
});

test("Canva allergen table footnotes produce official fried cross-contact caution records only", () => {
  const records = extractFriedCrossContactAllergenTableItems(
    [
      [
        ["CRISPY CATCHES"],
        ["", "GLUTEN", "EGG", "DAIRY", "SOY", "SHELLFISH"],
        ["CRISPY SHRIMP", "", "", "", "", ""],
      ],
      [
        ["ENTREES"],
        ["", "GLUTEN", "EGG", "DAIRY", "SOY", "SHELLFISH"],
        ["GRILLED SALMON", "", "", "", "", ""],
      ],
      [
        ["PAIRING PLATES"],
        ["", "GLUTEN", "EGG", "DAIRY", "SOY", "SHELLFISH"],
        ["HUSH PUPPIES", "", "", "", "", ""],
        ["GRILLED BROCCOLINI", "", "", "", "", ""],
      ],
    ],
    { category: "Seafood", id: "chasin-test", name: "Chasin Test" },
    "https://example.com/allergen.pdf",
    "Anything fried will be contaminated with gluten and shellfish.",
  );

  assert.deepEqual(
    records.map((record) => record.name),
    ["CRISPY SHRIMP", "HUSH PUPPIES"],
  );
  assert.deepEqual(
    records.map((record) => record.allergens),
    [[], []],
  );
  assert.deepEqual(
    records.map((record) => record.mayContain),
    [
      ["gluten", "shellfish"],
      ["gluten", "shellfish"],
    ],
  );
  assert.ok(
    records.every(
      (record) => record.allergenSourceType === "official-allergen-menu",
    ),
  );
});

test("MenuSifu JSON menus produce shared menu records", () => {
  const payload = {
    menuCategories: [
      {
        name: { en: "Appetizer" },
        saleItems: [
          {
            description:
              "Japanese Pancake w/Shrimp, crab sticks, egg, cabbage and bonito flakes.",
            hiddenItem: false,
            name: { en: "Okonomiyaki" },
            pics: ["https://pixel.menusifu.com/example/okonomiyaki.jpg"],
          },
          {
            description: "Should not publish.",
            hiddenItem: true,
            name: { en: "Hidden Test Item" },
          },
        ],
      },
    ],
  };

  const records = extractJsonMenuFragmentItems(
    JSON.stringify(payload),
    { category: "Japanese", id: "akira-test", name: "Akira Test" },
    "https://order.mealkeyway.com/merchant/example/menu?productLine=ONLINE_ORDER",
    "api",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Okonomiyaki");
  assert.equal(records[0].category, "Appetizer");
  assert.equal(records[0].sourceKind, "menusifu-api");
  assert.match(records[0].description, /Japanese Pancake/);
});

test("SpotApps Nuxt ordering menus produce shared menu records", () => {
  const payload = `
    <script>window.__NUXT__=(function(a,b,c,d,e,f,g,h,i,j,k,l,m){
      j[0]={name:"Dinner",menu_type:"food",food_menu_sections:[
        {name:"Entrees",description:b,food_menu_items:[
          {name:"Seafood Boil",description:"Shrimp, crab, shellfish, corn, and potatoes",in_stock:a,cents:3200},
          {name:"Sold Out Special",description:"Should not publish",in_stock:c,cents:1200}
        ]}
      ]};
      return {data:[{menus:j}]};
    }(true,null,false,0,1,2,3,4,5,[],6,7,8));</script>
  `;

  const records = extractJsonMenuFragmentItems(
    payload,
    { category: "Seafood", id: "spotapps-test", name: "SpotApps Test" },
    "https://tmt.spotapps.co/ordering-menu/?spot_id=399201",
    "menu",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Seafood Boil");
  assert.equal(records[0].category, "Entrees");
  assert.equal(records[0].sourceKind, "spotapps-nuxt-menu");
  assert.match(records[0].description, /Shrimp, crab/);
});

test("Heartland initial_data menus produce shared menu records", () => {
  const payload = {
    payload: {
      setup: {
        setup: {
          setupGroups: {
            10: { defaultName: "MENU", groupId: 10 },
            11: { defaultName: "CATERING", groupId: 11 },
          },
          setupGroupSections: {
            10: [100, 101],
            11: [102],
          },
          setupSections: {
            100: { defaultName: "PASTA", sectionId: 100 },
            101: { defaultName: "BEER", sectionId: 101 },
            102: { defaultName: "CATERING", sectionId: 102 },
          },
          setupSectionItems: {
            100: [1000],
            101: [1001],
            102: [1002],
          },
          setupMenuItems: {
            1000: {
              basePrice: 22.99,
              categoryName: "Food",
              defaultItemDescription:
                "Baked layers of ground veal, ricotta, mozzarella, and pasta topped with tomato sauce.",
              defaultName: "Lasagna",
              imageUrl: "https://example.com/lasagna.jpeg",
              itemId: 1000,
            },
            1001: {
              categoryName: "Beer",
              defaultName: "Draft Lager",
              isAlcohol: true,
              itemId: 1001,
            },
            1002: {
              categoryName: "Food",
              defaultName: "Catering Tray",
              itemId: 1002,
            },
          },
        },
      },
    },
  };

  const records = extractJsonMenuFragmentItems(
    JSON.stringify(payload),
    { category: "Italian", id: "gregorios-test", name: "Gregorio's Test" },
    "https://online.hrpos.heartland.us/initial_data?domain=gregoriosreston.mobilebytes.com",
    "api",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Lasagna");
  assert.equal(records[0].category, "PASTA");
  assert.equal(records[0].sourceKind, "heartland-initial-data");
  assert.match(records[0].description, /ricotta, mozzarella/);
});

test("Darden platform location pages discover and parse hosted menu APIs", () => {
  const restaurant = {
    category: "Burgers",
    id: "the-capital-burger-washington-dc-dc-metro",
    name: "The Capital Burger",
  };
  const html = `
    <html>
      <body>
        <a href="/locations/dc/washington/washington-dc/3400">Washington, DC</a>
      </body>
    </html>
  `;
  const htmlResult = extractHtmlItems(
    html,
    restaurant,
    "https://www.thecapitalburger.com/locations/dc/washington/washington-dc/3400",
    "menu",
  );
  const dardenLink = htmlResult.apiLinks.find(
    (link) => link.label === "Darden platform menu API",
  );

  assert.deepEqual(htmlResult.items, []);
  assert.ok(dardenLink);
  assert.equal(
    dardenLink.url,
    "https://www.thecapitalburger.com/api/menu?restaurantNum=3400",
  );
  assert.equal(
    dardenLink.fetchOptions.extraHeaders["X-Concept-Code"],
    "CAPITALBURGER",
  );

  const records = extractJsonMenuFragmentItems(
    JSON.stringify({
      categories: [
        {
          displayName: "Food",
          subCategories: [
            {
              displayName: "Signature Burgers",
              products: [
                {
                  displayName: "Classic Cheeseburger",
                  longDescription: "Aged Vermont Cheddar, Housemade Pickles",
                },
              ],
            },
            {
              displayName: "Beer by the Bottle",
              products: [
                {
                  displayName: "Lager",
                  longDescription: "Bottle",
                },
              ],
            },
          ],
        },
      ],
    }),
    restaurant,
    dardenLink.url,
    "api",
  );

  assert.deepEqual(
    records.map((record) => record.name),
    ["Classic Cheeseburger"],
  );
  assert.equal(records[0].category, "Signature Burgers");
  assert.equal(records[0].sourceKind, "darden-platform-api");
  assert.match(records[0].description, /Vermont Cheddar/);

  const eddieVsResult = extractHtmlItems(
    `<html><body><a href="/locations/va/mclean/mclean/8516">McLean</a></body></html>`,
    { category: "Seafood", id: "eddie-vs", name: "Eddie V's" },
    "https://www.eddiev.com/locations/va/mclean/mclean/8516",
    "menu",
  );
  const eddieVsLink = eddieVsResult.apiLinks.find(
    (link) => link.label === "Darden platform menu API",
  );

  assert.ok(eddieVsLink);
  assert.equal(
    eddieVsLink.url,
    "https://www.eddiev.com/api/menu?restaurantNum=8516",
  );
  assert.equal(
    eddieVsLink.fetchOptions.extraHeaders["X-Concept-Code"],
    "EDDIEVS",
  );
});

test("Wix rich text menu sections produce shared menu records", () => {
  const html = `
    <html>
      <head><meta name="generator" content="Wix.com Website Builder"/></head>
      <body>
        <div class="wixui-rich-text"><h2>BEEF</h2></div>
        <div class="wixui-rich-text">
          <p>Beef Brisket</p>
          <p>Top Blade Steak</p>
          <p>Iron Age Soy Beef Steak</p>
        </div>
        <div class="wixui-rich-text"><h2>SEAFOOD</h2></div>
        <div class="wixui-rich-text">
          <p>Spicy Squid</p>
          <p>Shrimp</p>
        </div>
      </body>
    </html>
  `;

  const result = extractHtmlItems(
    html,
    {
      category: "Korean",
      id: "iron-age-centreville-va-dc-metro",
      name: "Iron Age",
    },
    "https://example.com/menu",
    "menu",
  );

  assert.deepEqual(
    result.items.map((record) => `${record.category}:${record.name}`),
    [
      "BEEF:Beef Brisket",
      "BEEF:Top Blade Steak",
      "BEEF:Iron Age Soy Beef Steak",
      "SEAFOOD:Spicy Squid",
      "SEAFOOD:Shrimp",
    ],
  );
  assert.equal(result.items[0].sourceKind, "html-wix-rich-text-menu");
});

test("official menu descriptions with explicit contains text become official allergen evidence", () => {
  const record = normalizeRecord({
    allergenSourceType: "unavailable",
    category: "Pasta",
    description: "Tortellini, basil pesto and parmesan; contains peanuts.",
    name: "Tortellini al Pesto",
    sourceKind: "html-menu",
    sourceUrl: "https://ilporto.example.com/lunch",
  });

  assert.equal(record.allergenSourceType, "official-ingredients");
  assert.deepEqual(record.allergens, ["peanut"]);
  assert.match(record.evidence[0].text, /contains peanuts/i);

  const alertRecord = normalizeRecord({
    allergenSourceType: "unavailable",
    category: "Fresh Fish",
    description:
      "Grilled ahi tuna. *Allergy Alert: Finfish, Gluten, Sesame, Soy*",
    name: "Ahi Tuna Filet",
    sourceKind: "html-menu",
    sourceUrl: "https://www.joes.net/washington-dc/menus",
  });

  assert.equal(alertRecord.allergenSourceType, "official-ingredients");
  assert.deepEqual(alertRecord.allergens.sort(), [
    "fish",
    "gluten",
    "sesame",
    "soy",
  ]);
  assert.match(alertRecord.evidence[0].text, /Allergy Alert/i);

  const facilityRecord = normalizeRecord({
    allergenSourceType: "unavailable",
    category: "Indian Sweets",
    description:
      "Ingredients: Cashewnuts. Allergen Advice: Contains cashewnut & milk ingredients. Packed in a facility that also handles wheat, soy, barley, peanut, tree nuts and milk.",
    name: "Kaju Kathali",
    sourceKind: "html-menu",
    sourceUrl: "https://official.example.com/menu",
  });

  assert.equal(facilityRecord.allergenSourceType, "official-ingredients");
  assert.deepEqual(facilityRecord.allergens.sort(), ["milk", "tree-nut"]);
  assert.deepEqual(facilityRecord.mayContain.sort(), [
    "gluten",
    "milk",
    "peanut",
    "soy",
    "tree-nut",
    "wheat",
  ]);

  const legendRecord = normalizeRecord({
    allergenSourceType: "unavailable",
    category: "Dinner",
    description:
      "Dinner v-vegetarian, vg-vegan, n-contains nuts, g-contains gluten d-contains dairy, sh-contains shellfish",
    name: "Dietary Key",
    sourceKind: "html-menu",
    sourceUrl: "https://official.example.com/menu",
  });

  assert.equal(legendRecord.allergenSourceType, "unavailable");
  assert.deepEqual(legendRecord.allergens, []);
  assert.deepEqual(legendRecord.mayContain, []);

  const nonDairyRecord = normalizeRecord({
    allergenSourceType: "unavailable",
    category: "Entrees",
    description: "Served with qabulirice. Contains non-dairy garlic yogurt.",
    name: "Afghania Combination",
    sourceKind: "html-menu",
    sourceUrl: "https://official.example.com/menu",
  });

  assert.equal(nonDairyRecord.allergenSourceType, "unavailable");
  assert.deepEqual(nonDairyRecord.allergens, []);
  assert.deepEqual(nonDairyRecord.mayContain, []);

  const glutenFreeOfficialRecord = normalizeRecord({
    allergenSourceType: "unavailable",
    category: "Prepared Foods",
    description:
      "Gluten Free. Contains dairy. Ingredients: pork, beef, veal, eggs, parmesan, gluten free bread crumbs.",
    name: "Italian Meatballs - Gluten Free",
    sourceKind: "html-menu",
    sourceUrl: "https://official.example.com/menu",
  });

  assert.equal(
    glutenFreeOfficialRecord.allergenSourceType,
    "official-ingredients",
  );
  assert.deepEqual(glutenFreeOfficialRecord.allergens.sort(), ["egg", "milk"]);
  assert.deepEqual(glutenFreeOfficialRecord.mayContain, []);
});

test("menu item detail pages with ingredient words are not discovered as official source links", () => {
  const result = extractHtmlItems(
    `
      <html>
        <body>
          <a href="/menu?item=esquites-IpB5">
            Esquites made with corn, mayonnaise, lime juice, cotija cheese, chili powder, and other delicious ingredients.
          </a>
        </body>
      </html>
    `,
    {
      category: "Mexican",
      id: "el-paso-mexican-restaurant-springfield-va-dc-metro",
      name: "El Paso Mexican Restaurant",
    },
    "https://elpasomexican.example.com/menu",
    "menu",
  );

  assert.deepEqual(result.officialPageLinks, []);
});

test("Wix restaurant menu API produces shared menu records", () => {
  const payload = {
    items: [
      {
        description:
          "Marinated short rib grilled over flame with rice and banchan",
        image: { url: "https://static.wixstatic.com/media/galbi.jpg" },
        name: "Galbi BBQ Plate",
        visible: true,
      },
      {
        description: "Spicy tofu stew with egg and scallion",
        name: "Soondubu Jjigae",
        visible: true,
      },
    ],
  };

  const records = extractJsonMenuFragmentItems(
    JSON.stringify(payload),
    { category: "Korean", id: "wix-restaurant-test", name: "Wix Korean Test" },
    "https://example.com/_api/restaurants-menus-item/v1/items",
    "api",
  );

  assert.deepEqual(
    records.map((record) => record.name),
    ["Galbi BBQ Plate", "Soondubu Jjigae"],
  );
  assert.equal(records[0].category, "Korean");
  assert.equal(records[0].sourceKind, "wix-restaurant-menus-api");
});

test("Wix restaurant menu API drops default demo catalogs", () => {
  const payload = {
    items: [
      {
        description: "Our classic burger with lettuce",
        name: "Classic burger",
        visible: true,
      },
      {
        description: "Topped with raspberry jam",
        name: "Classic cheesecake",
        visible: true,
      },
      {
        description: "Fresh catch of the day",
        name: "Fish of the day",
        visible: true,
      },
      { description: "Fresh out the oven", name: "Brownie", visible: true },
      {
        description: "Served with ice cream",
        name: "Sticky date & ice cream",
        visible: true,
      },
      {
        description: "Grilled tofu skewers",
        name: "Tofu skewers",
        visible: true,
      },
    ],
  };

  const records = extractJsonMenuFragmentItems(
    JSON.stringify(payload),
    { category: "Japanese", id: "wix-demo-test", name: "Wix Demo Test" },
    "https://example.com/_api/restaurants-menus-item/v1/items",
    "api",
  );

  assert.equal(records.length, 0);
});

test("schema.org OfferCatalog sections preserve menu categories", () => {
  const payload = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Menu",
      itemListElement: [
        {
          "@type": "OfferCatalog",
          name: "Entrees",
          itemListElement: [
            {
              "@type": "Offer",
              itemOffered: {
                "@type": "MenuItem",
                description: "Shrimp, crab, corn, potatoes, and egg.",
                name: "Seafood Boil",
              },
            },
          ],
        },
      ],
    },
  };

  const records = extractJsonMenuFragmentItems(
    JSON.stringify(payload),
    {
      category: "Bakery",
      id: "pluma-bakery-dc",
      name: "Pluma by Bluebird Bakery",
    },
    "https://places.singleplatform.com/example/menu",
    "menu",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Seafood Boil");
  assert.equal(records[0].category, "Entrees");
});

test("Weebly compact menu pages parse strong item rows with category headings", () => {
  const html = `
    <html><head><link id="wsite-base-style" href="//cdn11.editmysite.com/css/sites.css" /></head>
    <body><div id="wsite-content"><div class="paragraph">
      <font size="5">Appetizers</font><br>
      <strong>Yellowfin Tuna Tartare 26</strong><br>
      Grand Marnier aioli, avocado mousse, jalapeño<br>
      <strong>Caesar Salad 18</strong><br>
      baby romaine, shaved pecorino, marinated anchovy<br>
      <font size="5">​Entrées</font><br>
      <strong>Butter Poached Lobster 29 / 58</strong><br>
      fennel-tomato raviolini, cherry tomatoes, basil, lobster sauce<br>
      <strong>Wild Halibut 48</strong><br>
      English pea-basil purée, bacon, royal trumpet mushrooms, lemon<br>
    </div></div></body></html>
  `;
  const result = extractHtmlItems(
    html,
    {
      allowUnavailableAllergenFallback: true,
      category: "American",
      id: "2941-restaurant-falls-church-va-dc-metro",
    },
    "https://example.com/agrave-la-carte.html",
    "menu",
  );

  assert.deepEqual(
    result.items.map((item) => [item.category, item.name, item.sourceKind]),
    [
      ["Appetizers", "Yellowfin Tuna Tartare", "weebly-compact-menu"],
      ["Appetizers", "Caesar Salad", "weebly-compact-menu"],
      ["Entrées", "Butter Poached Lobster", "weebly-compact-menu"],
      ["Entrées", "Wild Halibut", "weebly-compact-menu"],
    ],
  );
});

test("short menu links are discovered when labels identify food menus", () => {
  const html = `
    <html><body>
      <a href="https://g.snyit.com/lvdinner">View Dinner Menu</a>
      <a href="https://g.snyit.com/lvbrunch">Brunch</a>
      <a href="https://g.snyit.com/lvcocktail">Cocktail Menu</a>
      <a href="https://example.net/privacy">Privacy</a>
    </body></html>
  `;
  const result = extractHtmlItems(
    html,
    {
      category: "Mediterranean",
      id: "la-vie-washington-dc-dc-metro",
      name: "La Vie",
    },
    "https://www.lavie-dc.com/menus",
    "menu",
  );

  assert.deepEqual(
    result.menuPageLinks.map((link) => link.url),
    ["https://g.snyit.com/lvdinner", "https://g.snyit.com/lvbrunch"],
  );
});

test("Google Drive preview URLs canonicalize to direct downloads", () => {
  assert.equal(
    directGoogleDriveDownloadUrl(
      "https://drive.google.com/file/d/1hOfcj4GSuVPh0iU60xuj5LKSmaskpMnY/view?usp=sharing",
    ),
    "https://drive.google.com/uc?export=download&id=1hOfcj4GSuVPh0iU60xuj5LKSmaskpMnY",
  );
  assert.equal(
    directGoogleDriveDownloadUrl(
      "https://drive.google.com/uc?export=download&id=abc123",
    ),
    null,
  );
});

test("official Google Drive allergen chart links are discovered as allergen documents", () => {
  const html = `
    <html><body>
      <a href="https://drive.google.com/file/d/1xQxCJfH24sSD2hdntPQDFuE8sDKWq9Ww/view?usp=sharing">
        View Allergen Guide Chart
      </a>
    </body></html>
  `;
  const result = extractHtmlItems(
    html,
    {
      category: "Bakery",
      domain: "sweetcrimes.com",
      id: "sweet-crimes-bakery-dc",
      name: "Sweet Crimes Bakery",
    },
    "https://sweetcrimes.com/allergen-guide",
    "allergen",
  );
  const link = result.discoveredDocuments[0];

  assert.equal(link.label, "View Allergen Guide Chart");
  assert.equal(
    classifyDocumentLink(
      {
        domain: "sweetcrimes.com",
        id: "sweet-crimes-bakery-dc",
        menuUrls: ["https://sweetcrimes.com/allergen-guide"],
        name: "Sweet Crimes Bakery",
      },
      link,
    ),
    "allergen",
  );
});

test("official allergen iframe embeds are discovered as allergen documents", () => {
  const html = `
    <html><body>
      <main>
        <h1>Allergy Charts</h1>
        <iframe src="https://www.boquepedia.net/allergies-embed"></iframe>
      </main>
    </body></html>
  `;
  const result = extractHtmlItems(
    html,
    {
      category: "Spanish",
      id: "boqueria-penn-quarter-dc",
      name: "Boqueria Test",
    },
    "https://boqueriarestaurant.com/allergy-charts/",
    "allergen",
  );

  assert.deepEqual(result.discoveredDocuments, [
    { label: "", url: "https://www.boquepedia.net/allergies-embed" },
  ]);
  assert.equal(
    classifyDocumentLink(
      {
        domain: "boqueriarestaurant.com",
        id: "boqueria-penn-quarter-dc",
        menuUrls: ["https://boqueriarestaurant.com/allergy-charts/"],
        name: "Boqueria Test",
      },
      result.discoveredDocuments[0],
    ),
    "allergen",
  );
});

test("embedded SinglePlatform widgets discover canonical menu pages", () => {
  const html = `
    <html>
      <body>
        <div data-rich-text="&lt;script data-location=\\&quot;dirty-habit-0\\&quot; data-api_key=\\&quot;test-key\\&quot; src=\\&quot;https://menus.singleplatform.com/widget\\&quot;&gt;&lt;/script&gt;"></div>
      </body>
    </html>
  `;

  const result = extractHtmlItems(
    html,
    {
      category: "American",
      id: "dirty-habit-washington-dc-dc-metro",
      name: "Dirty Habit",
    },
    "https://dirtyhabitdc.com/menu",
    "menu",
  );

  assert.deepEqual(
    result.menuPageLinks.map((link) => link.url),
    ["https://places.singleplatform.com/dirty-habit-0/menu"],
  );
});

test("generic HTML allergen matrices parse category-first headers and direct X markers", () => {
  const html = `
    <table>
      <tr>
        <th>Entrées &amp; Sides</th>
        <th>Calories</th>
        <th>Milk</th>
        <th>Egg</th>
        <th>Wheat</th>
        <th>Gluten Free</th>
      </tr>
      <tr><td>Charburgers</td></tr>
      <tr>
        <td>Charburger with Cheese</td>
        <td>540</td>
        <td>X Contains Milk</td>
        <td>-</td>
        <td>X Contains Wheat</td>
        <td></td>
      </tr>
      <tr>
        <td>Ranch</td>
        <td>210</td>
        <td>May contain Milk</td>
        <td>X</td>
        <td>-</td>
        <td>X</td>
      </tr>
    </table>
  `;

  const result = extractHtmlItems(
    html,
    { category: "Burgers", id: "habit-burger-grill", name: "Habit Test" },
    "https://example.com/nutrition",
    "allergen",
  );
  const records = result.items.filter(
    (item) => item.sourceKind === "html-allergen-matrix",
  );

  assert.deepEqual(
    records.map((record) => record.name),
    ["Charburger with Cheese", "Ranch"],
  );
  assert.deepEqual(records[0].category, "Charburgers");
  assert.deepEqual(records[0].allergens.sort(), ["milk", "wheat"]);
  assert.deepEqual(records[0].mayContain, []);
  assert.match(
    records[0].evidenceText,
    /Charburger with Cheese: contains milk, wheat/,
  );
  assert.deepEqual(records[1].allergens, ["egg"]);
  assert.deepEqual(records[1].mayContain, ["milk"]);
  assert.match(
    records[1].evidenceText,
    /Ranch: contains egg; may contain milk/,
  );
});

test("generic HTML allergen matrices parse icon-only table cells", () => {
  const html = `
    <table>
      <tr>
        <th>Entrées</th>
        <th>Egg</th>
        <th>Dairy</th>
        <th>Tree</th>
        <th>Wheat</th>
        <th>Gluten Free</th>
      </tr>
      <tr>
        <td>Orange Chicken</td>
        <td data-label="Egg"><i class="fas fa-check"></i></td>
        <td data-label="Dairy"></td>
        <td data-label="Tree"></td>
        <td data-label="Wheat"><i class="fas fa-check"></i></td>
        <td data-label="Gluten Free"><i class="fas fa-check"></i></td>
      </tr>
      <tr>
        <td>Cashew Chicken</td>
        <td data-label="Egg"></td>
        <td data-label="Dairy"></td>
        <td data-label="Tree"><i class="fas fa-check"></i></td>
        <td data-label="Wheat"></td>
        <td data-label="Gluten Free"></td>
      </tr>
    </table>
  `;

  const result = extractHtmlItems(
    html,
    { category: "Asian", id: "pei-wei", name: "Pei Wei Test" },
    "https://example.com/allergen-information",
    "allergen",
  );
  const records = result.items.filter(
    (item) => item.sourceKind === "html-allergen-matrix",
  );

  assert.deepEqual(
    records.map((record) => record.name),
    ["Orange Chicken", "Cashew Chicken"],
  );
  assert.deepEqual(records[0].allergens.sort(), ["egg", "wheat"]);
  assert.equal(records[0].allergens.includes("gluten"), false);
  assert.match(records[0].evidenceText, /Orange Chicken: contains egg, wheat/);
  assert.deepEqual(records[1].allergens, ["tree-nut"]);
});

test("generic HTML allergen matrices parse div-based official allergy charts", () => {
  const html = `
    <div class="w-layout-hflex flex-block-header">
      <div class="allergey-chart---dish-header">VERDURAS</div>
      <div class="allergy-chart---allergen-header">DAIRY</div>
      <div class="allergy-chart---allergen-header">EGG</div>
      <div class="allergy-chart---allergen-header">GLUTEN</div>
      <div class="allergy-chart---allergen-header">NUT</div>
      <div class="allergy-chart---allergen-header">SEAFOOD</div>
      <div class="allergy-chart---allergen-header">SHELLFISH</div>
      <div class="allergy-chart---allergen-header">SOY</div>
    </div>
    <div class="w-dyn-list">
      <div role="list" class="w-dyn-items">
        <div class="collection-item-allergy-chart w-dyn-item">
          <div class="w-layout-hflex flex-block">
            <div class="allergey-chart---dish">Caesar Salad</div>
            <div class="allergy-chart---allergen">Dairy</div>
            <div class="allergy-chart---allergen">Egg</div>
            <div class="allergy-chart---allergen">-</div>
            <div class="allergy-chart---allergen">Nut</div>
            <div class="allergy-chart---allergen">Seafood</div>
            <div class="allergy-chart---allergen">-</div>
            <div class="allergy-chart---allergen">-</div>
          </div>
          <div class="text-block-37">Baby gem lettuce, almonds, anchovies, Manchego cheese</div>
        </div>
      </div>
    </div>
  `;

  const result = extractHtmlItems(
    html,
    {
      category: "Spanish",
      id: "boqueria-penn-quarter-dc",
      name: "Boqueria Test",
    },
    "https://www.boquepedia.net/allergies-embed",
    "allergen",
  );
  const records = result.items.filter(
    (item) => item.sourceKind === "html-allergen-matrix",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Caesar Salad");
  assert.equal(records[0].category, "Verduras");
  assert.deepEqual(records[0].allergens.sort(), [
    "egg",
    "fish",
    "milk",
    "tree-nut",
  ]);
  assert.match(records[0].description, /Baby gem/);
  assert.match(
    records[0].evidenceText,
    /Caesar Salad: contains milk, egg, tree-nut, fish/,
  );
});

test("generic HTML allergen matrices parse SVG checkmark charts", () => {
  const html = `
    <main>
      <svg role="img" aria-label="Allergen Guide">
        <text transform="translate(350 15)">Soy</text>
        <text transform="translate(450 15)">Wheat (Gluten)</text>
        <text transform="translate(710 15)">Sesame</text>
        <text transform="translate(4 34)">SANDWICHES</text>
        <text transform="translate(4 52)">PLNT Burger</text>
        <text transform="translate(4 70)">Kids Burger</text>
        <path fill="#852065" d="m487 51-3-3 1-1 2 2 5-5 1 1z"/>
        <path fill="#852065" d="m735 69-3-3 1-1 2 2 5-5 1 1z"/>
      </svg>
    </main>
  `;

  const result = extractHtmlItems(
    html,
    { category: "Burgers", id: "plnt-burger-dc", name: "SVG Chart Test" },
    "https://example.com/allergen-guide",
    "allergen",
  );
  const records = result.items.filter(
    (item) => item.sourceKind === "svg-allergen-matrix",
  );

  assert.equal(records.length, 2);
  assert.deepEqual(records[0].allergens.sort(), ["gluten", "wheat"]);
  assert.deepEqual(records[1].allergens, ["sesame"]);
  assert.equal(records[0].category, "Sandwiches");
  assert.match(records[0].evidenceText, /PLNT Burger: contains wheat, gluten/);
});

test("generic HTML allergen matrices parse class-based grid charts", () => {
  const html = `
    <div class="menu-alergias-container">
      <div class="alergia-grid">
        <div class="alergia-grid__row alergia-grid__row--header">
          <div class="alergia-grid__item-name categoria">Appetizers</div>
          <div class="alergia-grid__cells">
            <div class="alergia-grid__cell alergia-grid__cell--header-label col-dairy">Dairy</div>
            <div class="alergia-grid__cell alergia-grid__cell--header-label col-gluten">Gluten</div>
            <div class="alergia-grid__cell alergia-grid__cell--header-label col-soy">Soy</div>
            <div class="alergia-grid__cell alergia-grid__cell--header-label col-vegetarian">Vegetarian</div>
          </div>
        </div>
        <div class="alergia-grid__row">
          <div class="alergia-grid__item-name">Breaded Coalho Cheese</div>
          <div class="alergia-grid__cells">
            <div class="alergia-grid__cell col-dairy"><img alt="Dairy" /></div>
            <div class="alergia-grid__cell col-gluten"><img alt="Gluten" /></div>
            <div class="alergia-grid__cell col-soy"></div>
            <div class="alergia-grid__cell col-vegetarian"><img alt="Vegetarian" /></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const result = extractHtmlItems(
    html,
    {
      category: "Steakhouse",
      id: "chima-steakhouse-tysons-tysons-va-dc-metro",
      name: "Chima Test",
    },
    "https://example.com/menu-allergies/",
    "allergen",
  );
  const records = result.items.filter(
    (item) => item.sourceKind === "class-grid-allergen-matrix",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Breaded Coalho Cheese");
  assert.deepEqual(records[0].allergens.sort(), ["gluten", "milk"]);
  assert.match(
    records[0].evidenceText,
    /Breaded Coalho Cheese: contains milk, gluten/,
  );
});

test("product pages extract official allergens from embedded ingredient metafields", () => {
  const item = extractProductPageItem(
    `
      <html>
        <head>
          <meta property="og:title" content="Campfire S'mores" />
          <meta name="description" content="Toasty marshmallow ice cream." />
        </head>
        <body>
          <script>
            window.product = {
              metafields: {
                ingredients: "Cream, Milk, Cane Sugar, Chocolate Sauce, ${"Tapioca Syrup, ".repeat(90)} Graham Crackers (Wheat Flour), Chocolate Contains: Milk, Wheat"
              }
            };
          </script>
        </body>
      </html>
    `,
    { category: "Ice Cream", id: "jenis-dc", name: "Jeni's" },
    "https://jenis.com/products/campfire-s-mores",
    null,
  );

  assert.equal(item.name, "Campfire S'mores");
  assert.equal(item.allergenSourceType, "official-product-allergen-section");
  assert.deepEqual(item.allergens.sort(), ["milk", "wheat"]);
  assert.match(item.ingredientsText, /Contains: Milk, Wheat/);
});

test("product pages extract official allergens from visible treat contains sections", () => {
  const item = extractProductPageItem(
    `
      <html>
        <body>
          <h1>Birthday Cake</h1>
          <main>
            <p>Layered birthday cake.</p>
            <section>
              Ingredients
              This treat contains: Eggs Milk Soy
              Our treats are made in a facility that processes: Peanuts & Tree Nuts
              Ingredients: Sugar, eggs, butter, whole milk, soy lecithin.
              Product & Storage Details
            </section>
          </main>
        </body>
      </html>
    `,
    { category: "Desserts", id: "milk-bar-dc", name: "Milk Bar" },
    "https://milkbarstore.com/products/birthday-cake",
    null,
  );

  assert.equal(item.name, "Birthday Cake");
  assert.equal(item.allergenSourceType, "official-product-allergen-section");
  assert.deepEqual(item.allergens.sort(), ["egg", "milk", "soy"]);
  assert.match(item.ingredientsText, /This treat contains/);
  assert.deepEqual(item.mayContain.sort(), ["peanut", "tree-nut"]);
});

test("product page semicolon allergen disclosures separate direct and may contain", () => {
  const item = extractProductPageItem(
    `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Chocolate Cake",
              "description": "Chocolate cake with ganache.",
              "additionalProperty": [
                {
                  "@type": "PropertyValue",
                  "name": "Allergens",
                  "value": "Milk, Soy, Wheat, Egg; Tree Nuts"
                }
              ]
            }
          </script>
        </head>
        <body>
          <h1>Chocolate Cake</h1>
        </body>
      </html>
    `,
    { category: "Desserts", id: "crumbl", name: "Crumbl" },
    "https://crumblcookies.com/profiles/chocolate-cake",
    null,
  );

  assert.equal(item.name, "Chocolate Cake");
  assert.equal(item.allergenSourceType, "official-product-allergen-section");
  assert.deepEqual(item.allergens.sort(), ["egg", "milk", "soy", "wheat"]);
  assert.deepEqual(item.mayContain.sort(), ["tree-nut"]);
});

test("embedded flavor nutrition data emits official allergen records from contains text", () => {
  const html = `
    <script type="module">
      React.createElement(NutritionPage, {
        flavors: {"Result":[
          {
            "FlavorName":"Birthday Cake",
            "ColdTreatType":"Ice Cream",
            "Description":"Yellow Cake Batter Ice Cream. CONTAINS: MILK, SOY, WHEAT.",
            "websiteimageUrl":"https://example.com/birthday-cake"
          },
          {
            "FlavorName":"Watermelon Ice",
            "ColdTreatType":"Ices",
            "Description":"Sunny dairy-free Watermelon Italian Ice."
          }
        ]}
      });
    </script>
  `;

  const result = extractHtmlItems(
    html,
    { category: "Dessert", id: "habit-burger-grill", name: "Bruster's Test" },
    "https://example.com/flavor-nutrition",
    "allergen",
  );
  const records = result.items.filter(
    (item) => item.sourceKind === "embedded-flavor-nutrition",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Birthday Cake");
  assert.equal(records[0].category, "Ice Cream");
  assert.deepEqual(records[0].allergens.sort(), ["milk", "soy", "wheat"]);
  assert.equal(records[0].allergenSourceType, "official-allergen-menu");
});

test("generated Bruster's official flavor rows keep alcohol-flavored ice cream as food", () => {
  const brusters = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "chain-bruster-s-ice-cream",
  );
  const rumRaisin = brusters?.items.find((item) => item.id === "rum-raisin");

  assert.ok(brusters);
  assert.deepEqual(suspiciousMenuRows(brusters.items), []);
  assert.equal(rumRaisin?.name, "Rum Raisin");
  assert.equal(rumRaisin?.category, "Ice Cream");
  assert.equal(rumRaisin?.allergenSourceType, "official-allergen-menu");
  assert.deepEqual(rumRaisin?.allergens, ["milk"]);
});

test("iMenuPro embedded scripts produce menu records with explicit official allergen markers", () => {
  const payload = `
    imenupro['demo'] = {};
    imenupro['demo']['html'] = '<div class="imp-menu">\\
      <div class="imp-heading"><div class="imp-normal-heading">ANTIPASTI</div></div>\\
      <div class="imp-food-cols">\\
        <div class="imp-food-item"><div class="imp-name">Calamari Fritti</div><div class="imp-description">| Spicy Pomodoro (sf,df)</div></div>\\
        <div class="imp-food-item"><div class="imp-name">Bruleed Citrus</div><div class="imp-description">| Pistachio | Mint (gf,df,cn)</div></div>\\
        <div class="imp-food-item"><div class="imp-name">Margherita</div><div class="imp-description">| Pomodoro | Fresh Mozzarella | Basil (v)</div></div>\\
      </div>\\
    </div>';
  `;

  const records = extractIMenuProScriptItems(
    payload,
    { category: "Italian", id: "imenupro-test", name: "iMenuPro Test" },
    "https://imenupro.com/!demo",
    "api",
  );

  assert.deepEqual(
    records.map((record) => record.name),
    ["Calamari Fritti", "Bruleed Citrus", "Margherita"],
  );
  assert.deepEqual(records[0].allergens, ["shellfish"]);
  assert.deepEqual(records[1].allergens, ["tree-nut"]);
  assert.equal(records[2].allergenSourceType, "unavailable");
  assert.equal(records[0].sourceKind, "imenupro-menu-script");
});

test("Lunchbox Nova storefronts discover app bundles and parse class-based allergens", () => {
  const html = `
    <html>
      <body>
        <div id="app"></div>
        <script defer src="/js/app.abc123.js"></script>
        <noscript>lunchbox-storefront</noscript>
      </body>
    </html>
  `;
  const htmlResult = extractHtmlItems(
    html,
    {
      category: "Cafe",
      city: "Washington",
      id: "maman-washington-dc-dc-metro",
      menuUrls: ["https://mamannyc.com/locations/georgetown"],
      name: "maman",
    },
    "https://order.mamannyc.com/127/georgetown",
    "menu",
  );

  const bundleLink = htmlResult.apiLinks.find(
    (link) => link.role === "lunchbox-nova-app-bundle",
  );

  assert.ok(bundleLink);
  assert.equal(bundleLink.url, "https://order.mamannyc.com/js/app.abc123.js");
  assert.equal(bundleLink.storeId, "127");

  const records = extractOfficialApiItems(
    JSON.stringify([
      {
        categories: [
          {
            name: "Sandwiches",
            items: [
              {
                class_ids: [43, 76],
                classes: {
                  contains_dairy: true,
                  contains_wheat: true,
                  gluten_free_available_: true,
                  vegetarian: true,
                },
                image_urls: { standard: "https://example.com/sandwich.jpg" },
                item_id: 1,
                long_desc: "Sharp cheddar and tomato on country bread",
                name: "Cheddar Sandwich",
              },
              {
                classes: {},
                item_id: 2,
                long_desc: "Fresh mint tea",
                name: "Mint Tea",
              },
            ],
          },
        ],
        menu_id: 37,
        name: "Maman Menu",
      },
    ]),
    {
      category: "Cafe",
      id: "maman-washington-dc-dc-metro",
      name: "maman",
    },
    "https://mamannyc.novadine.com/api/v2/stores/127/menus",
    "api",
  );

  assert.equal(records.length, 2);
  assert.equal(records[0].name, "Cheddar Sandwich");
  assert.deepEqual(records[0].allergens.sort(), ["milk", "wheat"]);
  assert.equal(
    records[0].allergenSourceType,
    "official-product-allergen-section",
  );
  assert.equal(records[0].sourceKind, "lunchbox-nova-menu-api");
  assert.equal(records[1].allergenSourceType, "unavailable");
});

test("Squarespace menu roots discover menu pages and parse native menu blocks", () => {
  const homepage = `
    <html>
      <head><script>window.Static = { SQUARESPACE_CONTEXT: {} };</script></head>
      <body class="sqs-seven-one"><main><h1>Kaldi's Social House</h1></main></body>
    </html>
  `;
  const homepageResult = extractHtmlItems(
    homepage,
    {
      category: "Cafe",
      id: "kaldi-s-social-house-silver-spring-silver-spring-md-dc-metro",
      name: "Kaldi's Social House",
    },
    "https://www.kaldissocial.com/",
    "menu",
  );

  assert.deepEqual(
    homepageResult.menuPageLinks.map((link) => link.url),
    ["https://www.kaldissocial.com/menu"],
  );

  const menuHtml = `
    <html>
      <head><script>window.Static = { SQUARESPACE_CONTEXT: {} };</script></head>
      <body class="sqs-seven-one">
        <div class="sqs-block-menu">
          <div class="menu-section">
            <div class="menu-section-title">Breakfast</div>
            <div class="menu-item">
              <div class="menu-item-title">Bacon Egg & Cheese   7</div>
              <div class="menu-item-description">Choice of pork or turkey bacon, cheddar cheese and scrambled egg on sourdough bread</div>
            </div>
            <div class="menu-item">
              <div class="menu-item-title">Smoked Salmon    10</div>
              <div class="menu-item-description">dill mustard cream cheese, greens and red onions on rye bread</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  const menuResult = extractHtmlItems(
    menuHtml,
    {
      category: "Cafe",
      id: "kaldi-s-social-house-silver-spring-silver-spring-md-dc-metro",
      name: "Kaldi's Social House",
    },
    "https://www.kaldissocial.com/menu",
    "menu",
  );

  assert.deepEqual(
    menuResult.items
      .filter((item) => item.sourceKind === "squarespace-menu-block")
      .map((item) => `${item.category}:${item.name}`),
    ["Breakfast:Bacon Egg & Cheese", "Breakfast:Smoked Salmon"],
  );
  assert.match(
    menuResult.items.find(
      (item) => item.sourceKind === "squarespace-menu-block",
    )?.description,
    /cheddar cheese/,
  );
});

test("simple item-card menus parse cards before broad priced-text fallback", () => {
  const html = `
    <html>
      <body>
        <section id="cat-lunch" class="cat-section" aria-label="Lunch Special">
          <h2 class="cat-heading">Lunch Special</h2>
          <div class="item-card">
            <span class="item-name">L-PAD THAI</span>
            <span class="item-price">$11.50</span>
            <p class="item-desc">thin rice noodles stir-fried w/egg, bean curd, scallion, bean sprouts & crushed peanuts</p>
          </div>
          <div class="item-card">
            <span class="item-name">L-SEE EW NOODLES</span>
            <span class="item-price">$11.50</span>
            <p class="item-desc">rice noodles stir-fried w/egg & broccoli in a bean sauce</p>
          </div>
          <div class="item-card">
            <span class="item-name">KAO SOI GAI</span>
            <span class="item-price">$17.00</span>
            <p class="item-desc">Chicken drumstick with coconut milk curry broth served with egg noodles</p>
          </div>
        </section>
        <section id="cat-sushi" class="cat-section" aria-label="Sushi Rolls">
          <h2 class="cat-heading">Sushi Rolls</h2>
          ${[
            "CRAB STICK ROLL",
            "SALMON ROLL",
            "TUNA ROLL",
            "AVOCADO ROLL",
            "YELLOW TAIL & SCALLION",
            "SPICY SALMON",
            "EEL CUCUMBER",
            "CALIFORNIA ROLL",
          ]
            .map(
              (name) => `
            <div class="item-card">
              <span class="item-name">${name}</span>
              <span class="item-price">$5.95</span>
              <p class="item-desc">salmon with cucumber and avocado</p>
            </div>
          `,
            )
            .join("")}
        </section>
      </body>
    </html>
  `;

  const result = extractHtmlItems(
    html,
    {
      category: "Thai;Sushi",
      id: "founding-farmers-dc",
      name: "Generic Card Menu Fixture",
    },
    "https://kindatakoma.com/menu/",
    "menu",
  );

  const simpleCardItems = result.items.filter(
    (item) => item.sourceKind === "simple-item-card",
  );
  assert.equal(simpleCardItems.length, 11);
  assert.deepEqual(
    simpleCardItems.slice(0, 3).map((item) => `${item.category}:${item.name}`),
    [
      "Lunch Special:L-PAD THAI",
      "Lunch Special:L-SEE EW NOODLES",
      "Lunch Special:KAO SOI GAI",
    ],
  );
  assert.equal(
    simpleCardItems.find((item) => item.name === "KAO SOI GAI")?.category,
    "Lunch Special",
  );
  assert.match(simpleCardItems[0].description, /crushed peanuts/);
});

test("take out and meal kit links can be discovered as special food menus", () => {
  const html = `
    <html>
      <head><script>window.Static = { SQUARESPACE_CONTEXT: {} };</script></head>
      <body class="sqs-seven-one">
        <a href="/mealkits">TAKE OUT & MEAL KITS</a>
        <a href="/order">ORDER ONLINE</a>
        <a href="/delivery">Delivery</a>
      </body>
    </html>
  `;
  const result = extractHtmlItems(
    html,
    {
      category: "Korean BBQ",
      id: "so-korean-bbq-centreville-va-dc-metro",
      name: "Sō Korean BBQ",
    },
    "https://www.sokoreanbbq.com/menu",
    "menu",
  );

  assert.deepEqual(
    result.menuPageLinks.map((link) => link.url),
    ["https://www.sokoreanbbq.com/mealkits"],
  );
});

test("Founding Farmers locations share one parser profile and document discovery policy", () => {
  const dc = restaurantSources.find(
    (source) => source.id === "founding-farmers-dc",
  );
  const reston = {
    ...dc,
    id: "founding-farmers-reston-station",
    name: "Founding Farmers Reston Station",
    menuUrls: [
      "https://www.wearefoundingfarmers.com/founding-farmers-reston-station-menu/",
    ],
  };
  const tysons = {
    ...dc,
    id: "founding-farmers-tysons",
    name: "Founding Farmers Tysons",
    menuUrls: [
      "https://www.wearefoundingfarmers.com/founding-farmers-tysons-menu/",
    ],
  };

  for (const source of [dc, reston, tysons]) {
    const classification = classifyRestaurantSource(source);
    assert.equal(classification.brandKey, "founding-farmers");
    assert.equal(classification.sourceFamily, sourceFamilies.websiteMenuPdfs);
    assert.equal(classification.parserProfile, "founding-farmers-pdf-menu");
  }

  assert.equal(
    classifyDocumentLink(reston, {
      label: "Breakfast",
      url: "https://www.wearefoundingfarmers.com/wp-content/uploads/2020/02/Reston-Breakfast_10.21.25_PHASE-4_F.pdf",
    }),
    "menu",
  );
  assert.equal(
    classifyDocumentLink(tysons, {
      label: "Lunch Dinner",
      url: "https://www.wearefoundingfarmers.com/wp-content/uploads/2020/02/FFT-LunchDinner_5.11.26_F.pdf",
    }),
    "menu",
  );
  assert.equal(
    classifyDocumentLink(reston, {
      label: "Happy Hour",
      url: "https://www.wearefoundingfarmers.com/wp-content/uploads/2020/02/FFRS-Happy-Hour.pdf",
    }),
    null,
  );
});

test("configured special menus are audited while discovered special menus stay conservative", () => {
  const source = {
    id: "special-menu-policy-test",
    name: "Special Menu Policy Test",
    domain: "example.com",
    type: "local",
    menuUrls: [
      "https://example.com/happy-hour.pdf",
      "https://example.com/cocktails.pdf",
    ],
    allergenUrls: [],
  };
  const audit = configuredUrlAuditForSource(source);

  assert.equal(
    inferConfiguredUrlRole("https://example.com/happy-hour.pdf", "menu"),
    configuredUrlRoles.specialFoodMenu,
  );
  assert.equal(
    inferConfiguredUrlRole("https://example.com/cocktails.pdf", "menu"),
    configuredUrlRoles.drinksMenu,
  );
  assert.match(
    audit.configuredUrlWarnings.join(" | "),
    /configured-url-special-food-menu/,
  );
  assert.match(
    audit.configuredUrlWarnings.join(" | "),
    /configured-url-drinks-menu/,
  );
  assert.equal(
    normalizeConfiguredSourceUrls({
      menuUrls: ["https://example.com/wp-content/uploads/spring-dinner.pdf%22"],
    })[0].url,
    "https://example.com/wp-content/uploads/spring-dinner.pdf",
  );
  assert.equal(
    classifyDocumentLink(source, {
      label: "Happy Hour",
      url: "https://example.com/happy-hour.pdf",
    }),
    null,
  );
});

test("trusted external menu PDF hosts can be followed when link text is menu-like", () => {
  const marumen = {
    id: "marumen-fairfax-va-dc-metro",
    name: "Marumen",
    domain: "marumenva.com",
    menuUrls: ["https://www.marumenva.com/"],
  };
  const familyEthiopian = {
    id: "family-ethiopian-restaurant-washington-dc-dc-metro",
    name: "Family Ethiopian Restaurant",
    domain: "familyethiopianrestaurant.com",
    menuUrls: ["https://familyethiopianrestaurant.com/menu"],
  };

  assert.equal(
    classifyDocumentLink(marumen, {
      label: "Menu",
      url: "https://qrcgcustomers.s3-eu-west-1.amazonaws.com/account14406880/36106442_1.pdf?0.9499503516586736",
    }),
    "menu",
  );
  assert.equal(
    classifyDocumentLink(familyEthiopian, {
      label: "Download menu",
      url: "https://img1.wsimg.com/blobby/go/example/Summer%202026%20Restaurant%20Menu.pdf",
    }),
    "menu",
  );
  assert.equal(
    classifyDocumentLink(marumen, {
      label: "Happy Hour",
      url: "https://qrcgcustomers.s3-eu-west-1.amazonaws.com/account14406880/happy-hour.pdf",
    }),
    null,
  );
});

test("configured official-source detection separates allergen docs from ordinary menu pages", () => {
  const allergenPdfSource = {
    id: "official-allergen-pdf-policy-test",
    name: "Official Allergen PDF Policy Test",
    domain: "example.com",
    menuUrls: [],
    allergenUrls: [
      "https://www.silverdiner.com/s/SilverDiner_Allergens_Fall_2025-mrcc.pdf",
      "https://contact.mendocinofarms.com/wp-content/uploads/2026/02/Feb2026_NutritionalAllergen.pdf",
      "https://raisingcanes.cdn.prismic.io/raisingcanes/aHquuUMqNJQqIHQh_35074AllergenNutritionInfo_ALL_ENGLISH_DIGITAL.pdf",
      "https://www.zaxbys.com/uploads/ZAX_NAI_Guide_Digital_fe50d02b2b.pdf",
    ],
  };
  const ordinaryMenuSource = {
    id: "ordinary-menu-as-allergen-policy-test",
    name: "Ordinary Menu As Allergen Policy Test",
    domain: "example.com",
    menuUrls: [],
    allergenUrls: [
      "https://order.toasttab.com/online/chicken-whiskey-14th-street",
      "https://www.chilis.com/menu",
    ],
  };

  assert.equal(hasConfiguredOfficialSource(allergenPdfSource), true);
  assert.equal(hasConfiguredOfficialSource(ordinaryMenuSource), false);
  assert.equal(
    inferConfiguredUrlRole(
      "https://contact.mendocinofarms.com/wp-content/uploads/2026/02/Feb2026_NutritionalAllergen.pdf",
      "allergen",
    ),
    configuredUrlRoles.officialAllergen,
  );
  assert.equal(
    inferConfiguredUrlRole(
      "https://order.toasttab.com/online/chicken-whiskey-14th-street",
      "allergen",
    ),
    configuredUrlRoles.primaryMenu,
  );
  assert.equal(
    inferConfiguredUrlRole(
      "https://www.toasttab.com/local/order/rappahannock-oyster-bar-wharf-1150-maine-ave-sw/r-695d443a",
      "menu",
    ),
    configuredUrlRoles.primaryMenu,
  );
  assert.equal(
    inferConfiguredUrlRole("https://www.chilis.com/menu", "allergen"),
    configuredUrlRoles.primaryMenu,
  );
  assert.deepEqual(
    normalizeConfiguredSourceUrls(ordinaryMenuSource).map(
      (entry) => `${entry.kind}:${entry.role}`,
    ),
    ["menu:primary-menu", "menu:primary-menu"],
  );
  assert.deepEqual(
    normalizeConfiguredSourceUrls({
      menuUrls: [
        "https://example.com/menu",
        "https://example.com/nutrition",
        "https://example.com/allergen-guide.pdf",
      ],
    }).map((entry) => `${entry.kind}:${entry.role}`),
    [
      "menu:primary-menu",
      "allergen:official-nutrition",
      "allergen:official-allergen",
    ],
  );
});

test("official extractor migration keeps direct ID dispatch out of migrated profile wrappers", () => {
  const source = readFileSync(
    new URL("./pipeline/legacy-scrape-engine.mjs", import.meta.url),
    "utf8",
  );
  const summary = summarizeRestaurantSourceAudit(
    buildRestaurantSourceAuditRows(),
  );
  const migratedProfileIds =
    summary.documentSchemaProfileMigration.migratedProfileIds;
  const profileDispatchRegion = source.slice(
    source.indexOf("async function extractBrandPdfItems"),
    source.indexOf("async function extractLegacyRestaurantIdPdfItems"),
  );
  const officialApiDispatchRegion = source.slice(
    source.indexOf("function extractOfficialApiItems"),
    source.indexOf("function extractChipotleNutritionApiItems"),
  );
  const htmlDispatchRegion = source.slice(
    source.indexOf("function extractBrandHtmlItems"),
    source.indexOf("function extractPapaJohnsNutritionItems"),
  );
  const xmlDispatchRegion = source.slice(
    source.indexOf("function extractXmlItems"),
    source.indexOf("function extractDominosAllergenXmlItems"),
  );
  const legacyQuarantine = source.slice(
    source.indexOf("async function extractLegacyRestaurantIdPdfItems"),
    source.indexOf("function extractFoundingFarmersMenuPdfItems"),
  );

  assert.equal(/restaurant\.id\s*===/.test(profileDispatchRegion), false);
  assert.equal(/restaurant\.id\s*===/.test(officialApiDispatchRegion), false);
  assert.equal(/restaurant\.id\s*===/.test(htmlDispatchRegion), false);
  assert.equal(/restaurant\.id\s*===/.test(xmlDispatchRegion), false);
  assert.equal(/restaurant\.id\s*===/.test(legacyQuarantine), false);
  assert.equal(
    summary.documentSchemaProfileMigration.emptyPdfQuarantine,
    "extractLegacyRestaurantIdPdfItems",
  );
  assert.deepEqual(
    [
      "chick-fil-a-html-allergen",
      "dominos-xml-allergen",
      "nothing-bundt-cakes-html-ingredients",
      "sonic-allergen-guide-pdf",
      "subway-allergen-matrix-pdf",
      "panera-allergen-guide-pdf",
      "qdoba-allergen-pdf",
      "shake-shack-nutrition-allergen-pdf",
    ].filter((id) => !migratedProfileIds.includes(id)),
    [],
  );
  assert.deepEqual(
    summary.documentSchemaProfileMigration
      .remainingRestaurantIdExtractorSurfaces,
    [],
  );
  assert.deepEqual(
    [
      "configured-nutritionix",
      "nutritionix-official-json",
      "nutritionix-special-diets",
      "rbi-sanity",
      "tim-hortons-nutritionix-with-known-good-fallback",
    ].filter(
      (id) =>
        !summary.documentSchemaProfileMigration.supplementalSourceProfileIds.includes(
          id,
        ),
    ),
    [],
  );
});

test("generic PDF matrix allergen cells accept named allergen evidence", () => {
  assert.equal(isGenericMatrixAllergenCellEvidence("X"), true);
  assert.equal(isGenericMatrixAllergenCellEvidence("Pollock"), true);
  assert.equal(isGenericMatrixAllergenCellEvidence("Anchovy"), true);
  assert.equal(isGenericMatrixAllergenCellEvidence("N"), false);
  assert.equal(isGenericMatrixAllergenCellEvidence("No"), false);
  assert.equal(isGenericMatrixAllergenCellEvidence("10"), false);
  assert.equal(isGenericMatrixAllergenCellEvidence("Gluten free"), false);
});

test("restaurant scraper uses pipeline modules instead of a monolithic CLI file", () => {
  const wrapperLineCount = readFileSync(
    new URL("./scrape-restaurants.mjs", import.meta.url),
    "utf8",
  ).split("\n").length;
  const expectedModules = [
    "./pipeline/build-repository.mjs",
    "./pipeline/fetch-source.mjs",
    "./pipeline/normalize-records.mjs",
    "./pipeline/merge-records.mjs",
    "./pipeline/coverage-gate.mjs",
    "./pipeline/publish-snapshot.mjs",
    "./restaurant-adapters/mcdonalds.mjs",
    "./restaurant-adapters/burger-king.mjs",
    "./restaurant-adapters/founding-farmers.mjs",
    "./restaurant-adapters/generic-html.mjs",
    "./restaurant-adapters/generic-pdf-matrix.mjs",
  ];

  assert.ok(
    wrapperLineCount < 60,
    `scrape-restaurants.mjs has ${wrapperLineCount} lines`,
  );
  assert.deepEqual(
    expectedModules.filter(
      (modulePath) => !existsSync(new URL(modulePath, import.meta.url)),
    ),
    [],
  );
});

test("menu catalog filter removes operational artifacts but keeps real bundles", () => {
  const records = [
    { category: "Burger", name: "$1 Coupon Book - BK Scholars" },
    { category: "Burger", name: "16 Pc. Chicken Nuggets - PDP Test" },
    {
      category: "Burger",
      name: "Dummy Item for Restaurant Only Coupon -- DO NOT USE",
    },
    { category: "Fees", name: "Bag Fee" },
    { category: "Pizza", name: "BY THE SLICE" },
    { category: "Menu Listing", name: "&MORE" },
    { category: "Loyalty", name: "&pizza Loyalty" },
    { category: "Pizza", name: "GARLIC KNOTS CAESAR SALADMEDITERRANEAN SALAD" },
    { category: "Pizza", name: "Be advised: some products contain nuts" },
    { category: "Allergens", name: "Check Before You Eat" },
    { category: "Allergen Guide", name: "Pizza Allergen Information" },
    { category: "Menu", name: "Nutritional Information" },
    { category: "Menu", name: "Fundraising" },
    { category: "Menu", name: "News" },
    { category: "Menu Listing", name: "Trebletree Dev Team" },
    { category: "Pizza", name: "Pork: Our pepperoni is pork-based" },
    { category: "Chicken", name: "12PC BUNDLE" },
    { category: "McValue", name: "The McChicken Meal Deal Bundle" },
    {
      category: "Pizza",
      name: "1 CHEESE/PEPPERONI PIZZA + 6 WINGS + 3 GARLIC KNOTS",
    },
    { category: "Flame Grilled Burgers", name: "Whopper" },
  ];

  assert.deepEqual(
    filterMenuCatalogRecords(records).map((record) => record.name),
    [
      "12PC BUNDLE",
      "The McChicken Meal Deal Bundle",
      "1 CHEESE/PEPPERONI PIZZA + 6 WINGS + 3 GARLIC KNOTS",
      "Whopper",
    ],
  );
});

test("menu catalog filter rejects non-food public-menu utility rows", () => {
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Foodware", name: "Fork" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Extras",
      name: "Napkins, Utensils and Straws.",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Mediterranean",
      name: "Disposable Cutlery and Napkins",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "Arundel Mills" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "DC METRO" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "glenarden" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "Foundation" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "Happy Hour" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Steakhouse",
      name: "All the Bites",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Barbecue",
      name: "American or cheddar cheese",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Restaurant", name: "BRUNCH" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Seafood",
      name: "$26 HALF/ $46 WHOLE",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Restaurant",
      name: "BUILD YOUR OWN",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Chinese",
      name: "HAPPY HOUR HAPPY HOUR",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Steakhouse", name: "CAESAR" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "host at bartaco" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "work at bartaco" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Footer",
      name: "cookie preferences",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Salads",
      name: "Caesar",
      description: "Romaine, croutons, Parmigiano Reggiano.",
    }),
    true,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Italian",
      name: "Picatta di Vitello",
      description: "Veal Scaloppini sautéed with Capers in a Lemon-Wine Sauce",
      sourceType: "html-card",
    }),
    true,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Menu",
      name: "Renaissance Hotel",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Korean", name: "Woodbridge, VA" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Korean",
      name: "Private DiningJoin Our TeamGift CardsFranchise Opportunity",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "Entertainment" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "Parties" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Menu",
      name: "Party & Events Menus",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Burgers", name: "Our Team" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Burgers", name: "PLNT Impact" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Burgers",
      name: "Loved your visit?",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Burgers",
      name: "Delicious Plant-Based Options Delivered Straight to Your Door",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Burgers",
      name: "Find out why PLNT Burger is Washington DC’s favorite spot for healthy fast food",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Indian", name: "Email Us" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Indian", name: "Open Hours" }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Indian",
      name: "Highly Rated & Trusted",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Indian",
      name: "Why Choose Our Catering?",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Privateevents",
      name: "Private Events & Weddings",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Best Of 2015 Nightlife Fun Irish Bar",
      name: "The Auld Shebeen",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Mediterranean",
      name: "Sunday, 11:00am to 8:00 pm",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Gift Cards",
      name: "Treat someone special to the Unconventional Diner experience",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({ category: "Menu", name: "menu offerings." }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Privacy Policy",
      name: "1. Information We Collect",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Refund Policy",
      name: "1. Eligibility for Refunds",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Thai",
      name: "A Thai coconut rice custard with a layer of",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Thai",
      name: "Sautéed green beans combined with choice of",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Thai",
      name: "Marinated chicken sautéed with cashew",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Thai",
      name: "the comforting homemade sweet sticky",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Condiments",
      name: "Honey Mustard Dipping Sauce",
    }),
    true,
  );
});

test("menu catalog filter rejects beverage-only browser cards while preserving food", () => {
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Mediterranean",
      name: "Lemon Drench",
      description: "hanson of sonoma organic vodka, lemon juice, raspberries",
      browserFetched: true,
      sourceType: "html-card",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Mediterranean",
      name: "Port City, Porter, VA 7.5%",
      description: "Crooks, Raspberry Tea, FL, 4.0%",
      browserFetched: true,
      sourceType: "html-card",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Mediterranean",
      name: "Hibiscus Tea",
      description: "iced black tea, hibiscus syrup",
      browserFetched: true,
      sourceType: "html-card",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Mediterranean",
      name: "Pomelo Dulce",
      description: "grapefruit juice, honey, soda water",
      browserFetched: true,
      sourceType: "html-card",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "American",
      name: "ELIXIR",
      description:
        "salted cucumber, ginger cordial, lemon, Q Mixers soda water",
      sourceType: "pdf-menu",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Mediterranean",
      name: "CHOCOLATE TORTA",
      description: "pedro ximenez mousse, banana caramel, caramelized bananas",
      browserFetched: true,
      sourceType: "html-card",
    }),
    true,
  );
});

test("menu catalog filter rejects beverage-only Square product API records", () => {
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Beer",
      name: "450 North // Slushie XL",
      description: "Sour ale with strawberry and mango.",
      sourceKind: "square-online-api",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Bottles / Cans",
      name: "Alexander Valley Cab Sauv",
      description: "Bottle of cabernet sauvignon.",
      sourceKind: "square-online-api",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "American",
      name: "Baby Blue (4-Pack) (Crisp)",
      sourceKind: "html-card",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Steakhouse",
      name: "Chesapeake Pale Ale",
      sourceKind: "html-card",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Na Beverages",
      name: "Coca-Cola",
      sourceKind: "next-flight-products",
    }),
    false,
  );
  assert.equal(
    isProbablyMenuCatalogRecord({
      category: "Food",
      name: "Grilled Cheese",
      description: "Cheddar, sourdough, tomato soup.",
      sourceKind: "square-online-api",
    }),
    true,
  );
});

test("generated Timber Pizza recovery keeps food rows and drops menu artifacts", () => {
  const timber = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "timber-pizza-dc",
  );

  assert.ok(timber);
  assert.equal(timber.coverageStatus, "complete");
  assert.ok(
    timber.items.length >= 20,
    `expected recovered Timber menu, got ${timber.items.length}`,
  );
  assert.deepEqual(
    [
      "Be advised: some products contain nuts",
      "Pizza",
      "Sprite",
      "Tomato Sauce, Fresh Mozzarella, Basil",
      "w/ Spicy Strawberry Jam",
    ].filter((name) => timber.items.some((item) => item.name === name)),
    [],
  );
  assert.ok(timber.items.some((item) => item.name === "Cheese Please"));
  assert.ok(timber.items.some((item) => item.name === "The Tahini"));
});

test("generated Burger King menu is not inflated by catalog artifacts", () => {
  const burgerKing = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "burger-king",
  );

  assert.ok(burgerKing);
  assert.ok(
    burgerKing.items.length < 350,
    `expected Burger King to stay below catalog-inflated counts, got ${burgerKing.items.length}`,
  );
  assert.deepEqual(
    filterMenuCatalogRecords(burgerKing.items).length,
    burgerKing.items.length,
  );
  assert.equal(
    burgerKing.items.some((item) => item.category === "Burger"),
    false,
  );
});

test("generated Sonic menu uses official allergen matrix rows", () => {
  const sonic = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "sonic",
  );

  assert.ok(sonic);
  assert.equal(
    sonic.officialAllergenStatus,
    officialAllergenStatuses.extracted,
  );
  assert.equal(sonic.allergenDataStatus.officialItemCount, sonic.items.length);
  assert.ok(
    sonic.items.length >= 100,
    `expected at least 100 Sonic official rows, got ${sonic.items.length}`,
  );
  assert.equal(
    sonic.items.some((item) => item.name === "Hot"),
    false,
  );
  assert.deepEqual(
    sonic.items.find((item) => item.name === "Hot Dog Bun")?.allergens,
    ["soy", "wheat", "gluten"],
  );
  assert.deepEqual(
    new Set(sonic.items.map((item) => item.sourceType)),
    new Set(["pdf-matrix"]),
  );
});

test("generated Smoothie King uses official product-page allergen disclosures", () => {
  const smoothieKing = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "smoothie-king",
  );

  assert.ok(smoothieKing);
  assert.equal(
    smoothieKing.officialAllergenStatus,
    officialAllergenStatuses.extracted,
  );
  assert.ok(
    smoothieKing.allergenDataStatus.officialItemCount >= 250,
    `expected Smoothie King official product-page matches, got ${smoothieKing.allergenDataStatus.officialItemCount}`,
  );

  const angelFood = smoothieKing.items.find(
    (item) => item.id === "angel-food-20-ounce",
  );
  const angelFoodSlim = smoothieKing.items.find(
    (item) => item.id === "angel-food-slim-20-ounce",
  );
  const cocoaHazeBowl = smoothieKing.items.find(
    (item) => item.id === "acai-cocoa-haze-bowl",
  );

  assert.deepEqual(angelFood?.allergens, ["milk"]);
  assert.equal(angelFood?.allergenSourceType, "official-allergen-menu");
  assert.match(
    angelFood?.evidence?.map((entry) => entry.text).join(" ") ?? "",
    /Official Smoothie King allergen disclosure: Milk\./,
  );
  const angelFoodSlim32 = smoothieKing.items.find(
    (item) => item.id === "angel-food-slim-32-ounce",
  );
  const angelFood32 = smoothieKing.items.find(
    (item) => item.id === "angel-food-32-ounce",
  );

  assert.deepEqual(angelFoodSlim?.allergens, ["milk"]);
  assert.equal(angelFoodSlim?.allergenSourceType, "official-allergen-menu");
  assert.match(
    angelFoodSlim?.evidence?.map((entry) => entry.text).join(" ") ?? "",
    /Official Smoothie King allergen disclosure: Milk\./,
  );
  assert.deepEqual(angelFoodSlim32?.allergens, ["milk"]);
  assert.equal(angelFoodSlim32?.allergenSourceType, "official-allergen-menu");
  assert.deepEqual(angelFood32?.allergens, ["milk"]);
  assert.equal(angelFood32?.allergenSourceType, "official-allergen-menu");
  assert.deepEqual(cocoaHazeBowl?.allergens, ["tree-nut"]);
  assert.equal(cocoaHazeBowl?.allergenSourceType, "official-allergen-menu");
});

test("Tropical Smoothie PDF parser maps footnote and explicit allergen tables", () => {
  const records = extractTropicalSmoothieNutritionPdfItems(
    `
SMOOTHIES
Peanut Butter Cup 3 4 6 \t680 \t450 \t171 \t19 \t6 \t0 \t0 \t190 \t128 \t76 \t7 \t106 \t48 \t10 \tN/A
FLATBREADS
Hawaiian Island Flat \t630 \t215 \t24 \t8 \t0 \t68 \t1280 \t68 \t3 \t17 \t35
Menu Item \tAllergens \tGluten Friendly? \tVegetarian?
Hawaiian Island Flat \tMilk, Soy, Wheat \tNo \tNo
24 oz How Far You’ll Mango Smoothie Full Turbinado \t560 \t1 \t1 \t0 \t0 \t0 \t0 \t141 \t5 \t107 \t2
Menu Item \tAllergens \tGluten Friendly? \tVegetarian?
How Far You’ll Mango Smoothie \tNone \tYes \tNo
‘DILLAS
Santa Fe Chicken 3 8 \t450 \t165 \t18 \t10 \t0 \t75 \t1140 \t46 \t3 \t4 \t28
1. Contains egg. 2. Contains fish. 3. Contains milk. 4. Contains peanuts. 5. Contains shellfish. 6. Contains soy. 7. Contains tree nuts. 8. Contains wheat. 9. Contains sesame.
`,
    { category: "Smoothie", name: "Tropical Smoothie Cafe" },
    "https://www.tropicalsmoothiecafe.com/nutrition/latest",
  ).map(normalizeRecord);
  const byName = new Map(records.map((record) => [record.name, record]));
  const sortedAllergens = (name) =>
    [...(byName.get(name)?.allergens ?? [])].sort();

  assert.deepEqual(sortedAllergens("Peanut Butter Cup"), [
    "milk",
    "peanut",
    "soy",
  ]);
  assert.deepEqual(sortedAllergens("Hawaiian Island Flat"), [
    "milk",
    "soy",
    "wheat",
  ]);
  assert.equal(byName.get("Hawaiian Island Flat")?.category, "Flatbreads");
  assert.deepEqual(
    byName.get("24 oz How Far You’ll Mango Smoothie Full Turbinado")?.allergens,
    [],
  );
  assert.equal(
    byName.get("24 oz How Far You’ll Mango Smoothie Full Turbinado")?.category,
    "Smoothies",
  );
  assert.equal(byName.get("Santa Fe Chicken")?.category, "Dillas");
  assert.deepEqual(sortedAllergens("Santa Fe Chicken"), ["milk", "wheat"]);
  assert.equal(
    byName.get("Santa Fe Chicken")?.nutritionFacts?.["Calories from Fat"],
    "165",
  );
});

test("generated Subway allergen data excludes ingredient-pdf fragments", () => {
  const subway = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "subway",
  );

  assert.ok(subway);
  assert.equal(
    subway.officialAllergenStatus,
    officialAllergenStatuses.extracted,
  );
  assert.ok(
    subway.items.some(
      (item) =>
        item.name === '12" Wrap' &&
        item.allergenSourceType === "official-allergen-menu" &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.deepEqual(
    subway.items
      .filter((item) =>
        /(?:Pasteurized|as ingredients|Enzymes|fermented|food manufacturers|however|Paprika|This list|natural mold|Salt, Palm|Acid\. Contains|And Diglycerides)/i.test(
          `${item.name} ${item.category}`,
        ),
      )
      .map((item) => item.name),
    [],
  );
  assert.deepEqual(
    subway.items
      .filter(
        (item) =>
          item.sourceType === "pdf-matrix" || item.sourceKind === "pdf-matrix",
      )
      .flatMap((item) => item.sourceUrls ?? [])
      .filter((url) => /us-ingredients/i.test(url)),
    [],
  );
});

test("generated BIBIBOP data uses reviewed official matrix rows without nutrition artifacts", () => {
  const bibibopRestaurants = generatedRestaurants.restaurants.filter(
    (restaurant) =>
      ["osm-bibibop-asian-6952285839", "osm-bibbop-7802068505"].includes(
        restaurant.id,
      ),
  );

  assert.equal(bibibopRestaurants.length, 2);

  for (const restaurant of bibibopRestaurants) {
    assert.equal(
      restaurant.officialAllergenStatus,
      officialAllergenStatuses.extracted,
    );
    assert.equal(restaurant.items.length, 40);
    assert.equal(restaurant.allergenDataStatus.officialItemCount, 40);
    assert.ok(
      restaurant.items.every(
        (item) =>
          item.allergenSourceType === "official-allergen-menu" &&
          item.sourceKind === "official-pdf-allergen-matrix",
      ),
    );
    assert.deepEqual(
      restaurant.items.find((item) => item.name === "Miso Glazed Salmon")
        ?.allergens,
      ["soy", "sesame", "fish"],
    );
    assert.deepEqual(
      restaurant.items.find((item) => item.name === "Yum Yum")?.allergens,
      ["milk", "egg", "soy"],
    );
    assert.ok(
      restaurant.items.every(
        (item) =>
          item.mayContain?.includes("gluten") &&
          item.mayContain?.includes("wheat"),
      ),
    );
    assert.deepEqual(
      restaurant.items
        .filter((item) =>
          /calories|sprite|dr pepper|honest kids|kombucha|care|feedback|title|last updated|search results|jingle/i.test(
            `${item.id} ${item.name} ${item.category}`,
          ),
        )
        .map((item) => item.name),
      [],
    );
  }
});

test("generated Hawkers menu uses reviewed official allergen guide rows without guide artifacts", () => {
  const hawkers = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "hawkers-asian-street-food-bethesda-md-dc-metro",
  );

  assert.ok(hawkers, "expected generated Hawkers restaurant");
  assert.equal(
    hawkers.officialAllergenStatus,
    officialAllergenStatuses.extracted,
  );
  assert.equal(hawkers.items.length, 79);
  assert.equal(hawkers.allergenDataStatus.officialItemCount, 79);
  assert.equal(
    hawkers.items.some(
      (item) =>
        /^(?:GUIDE|DIM SUM|MEATS|ROLLS|NOODLES|WINGS|Dining|CATER)$/i.test(
          item.name,
        ) || /vegetable oil|sauces, dressings/i.test(item.name),
    ),
    false,
  );
  assert.deepEqual(
    hawkers.items.find((item) => item.name === "Bao - Singapore Chili Crab")
      ?.allergens,
    ["soy", "milk"],
  );
  assert.deepEqual(
    hawkers.items.find((item) => item.name === "Pad Thai")?.allergens,
    ["soy", "peanut", "sesame"],
  );
  assert.deepEqual(
    hawkers.items.find((item) => item.name === "Pad Thai")?.mayContain,
    ["soy"],
  );
});

test("generated Elephant & Castle does not treat Canada-only nutrition as DC official allergens", () => {
  const elephant = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "elephant-and-castle-washington-dc-dc-metro",
  );

  assert.ok(elephant, "expected generated Elephant & Castle restaurant");
  assert.equal(
    elephant.officialAllergenStatus,
    officialAllergenStatuses.notApplicable,
  );
  assert.equal(elephant.allergenDataStatus.officialItemCount, 0);
  assert.equal(
    elephant.items.some((item) => item.id === "sausage"),
    false,
  );
  assert.equal(
    elephant.items.some((item) =>
      /Serving Size|Cholesterol|Canadian locations only/i.test(
        item.ingredientsText ?? "",
      ),
    ),
    false,
  );
  assert.equal(
    elephant.sourceStatus.officialAllergenRemediationBucket,
    "official-source-not-applicable-to-location",
  );
});

test("generated Crumbl menu uses official product profile allergen disclosures", () => {
  const crumbl = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "crumbl",
  );
  const almondCookie = crumbl?.items.find(
    (item) => item.name === "Almond Coconut Fudge Cookie",
  );
  const classicCheesecake = crumbl?.items.find(
    (item) => item.id === "classic-cheesecake",
  );
  const glutenFriendlyCup = crumbl?.items.find(
    (item) => item.id === "chocolate-strawberry-cup-gluten-friendly",
  );

  assert.ok(crumbl);
  assert.equal(
    crumbl.officialAllergenStatus,
    officialAllergenStatuses.extracted,
  );
  assert.ok(
    crumbl.allergenDataStatus.officialItemCount >= 140,
    `expected at least 140 Crumbl official profile rows, got ${crumbl.allergenDataStatus.officialItemCount}`,
  );
  assert.ok(
    crumbl.allergenDataStatus.officialItemCount < crumbl.items.length,
    "Crumbl package/order cards without allergen disclosures should not be counted as official allergen rows",
  );
  assert.ok(
    crumbl.items.length >= 140,
    `expected at least 140 Crumbl official profile rows, got ${crumbl.items.length}`,
  );
  assert.deepEqual(
    new Set(crumbl.items.map((item) => item.sourceType)),
    new Set(["product-page", "official-api"]),
  );
  assert.deepEqual(
    crumbl.items
      .filter((item) => item.allergenSourceType === "unavailable")
      .map((item) => item.name)
      .sort(),
    [
      "12-Pack Dessert",
      "4-Pack Dessert",
      "6-Pack Dessert",
      "Cookie Dough Bits",
      "Single Dessert",
    ],
  );
  assert.deepEqual(
    [...new Set(crumbl.items.map((item) => item.category))].filter(
      (category) => category === "Menu",
    ),
    [],
  );
  assert.equal(
    crumbl.items.some((item) => item.id === "crumbl-cookies"),
    false,
  );
  assert.equal(
    crumbl.items.some((item) => item.id === "cookie-7-712"),
    false,
  );
  assert.equal(almondCookie?.category, "Cookies");
  assert.deepEqual(almondCookie?.allergens, [
    "wheat",
    "milk",
    "egg",
    "soy",
    "tree-nut",
  ]);
  assert.deepEqual(almondCookie?.mayContain, ["peanut"]);
  assert.equal(classicCheesecake?.category, "Cheesecakes & Pies");
  assert.deepEqual(classicCheesecake?.allergens, [
    "wheat",
    "milk",
    "egg",
    "soy",
  ]);
  assert.deepEqual(classicCheesecake?.mayContain, [
    "sesame",
    "fish",
    "shellfish",
    "peanut",
    "tree-nut",
  ]);
  assert.deepEqual(glutenFriendlyCup?.allergens, ["milk", "soy"]);
  assert.deepEqual(glutenFriendlyCup?.mayContain, []);
  assert.equal(
    almondCookie?.sourceUrls?.[0],
    "https://crumblcookies.com/profiles/almond-coconut-fudge-cookie",
  );
});

test("generated &pizza menu uses official HTML allergen guide", () => {
  const andPizza = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "andpizza-dc",
  );

  assert.ok(andPizza);
  assert.equal(andPizza.officialAllergenStatus, "extracted");
  assert.ok(
    andPizza.allergenDataStatus.officialItemCount >= 40,
    `expected official &pizza allergen records, got ${andPizza.allergenDataStatus.officialItemCount}`,
  );
  assert.ok(
    andPizza.items.some(
      (item) =>
        item.name === "Basil Pesto" &&
        item.allergenSourceType === "official-allergen-menu" &&
        item.allergens.includes("milk"),
    ),
  );
});

test("generated District Taco menu uses official Nutritionix calculator data", () => {
  const districtTaco = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "district-taco-dc",
  );

  assert.ok(districtTaco);
  assert.equal(districtTaco.officialAllergenStatus, "extracted");
  assert.ok(
    districtTaco.allergenDataStatus.officialItemCount >= 35,
    `expected District Taco Nutritionix records, got ${districtTaco.allergenDataStatus.officialItemCount}`,
  );
  assert.ok(
    districtTaco.items.some(
      (item) =>
        item.name === "Fish Taco Deluxe" &&
        item.allergenSourceType === "official-allergen-menu" &&
        item.allergens.includes("fish"),
    ),
  );
});

test("generated True Food menu uses official statement allergen PDF", () => {
  const trueFood = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "true-food-kitchen-arlington",
  );

  assert.ok(trueFood);
  assert.equal(trueFood.officialAllergenStatus, "extracted");
  assert.ok(
    trueFood.allergenDataStatus.officialItemCount >= 100,
    `expected True Food statement allergen records, got ${trueFood.allergenDataStatus.officialItemCount}`,
  );
  assert.ok(
    trueFood.items.some(
      (item) =>
        item.name === "Edamame Dumplings" &&
        item.sourceType === "pdf-allergen-statement" &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("soy") &&
        item.allergens.includes("sesame"),
    ),
  );
});

test("generated DIG menu uses official ingredient allergen rows", () => {
  for (const id of ["dig", "dig-bethesda"]) {
    const dig = generatedRestaurants.restaurants.find(
      (restaurant) => restaurant.id === id,
    );

    assert.ok(dig, `${id} should exist`);
    assert.equal(dig.officialAllergenStatus, "extracted");
    assert.ok(
      dig.allergenDataStatus.officialItemCount >= 10,
      `expected DIG official ingredient records, got ${dig.allergenDataStatus.officialItemCount}`,
    );
    assert.ok(
      dig.items.some(
        (item) =>
          item.name === "Chocolate Chip Cookie" &&
          item.allergenSourceType === "official-allergen-menu" &&
          item.allergens.includes("milk") &&
          item.allergens.includes("egg") &&
          item.allergens.includes("wheat") &&
          item.ingredientsText,
      ),
      `${id} should include official Chocolate Chip Cookie allergen evidence`,
    );
  }
});

test("generated Chasin Tails keeps partial official fried cross-contact evidence", () => {
  const chasin = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id ===
      "chasin-tails-seafood-that-celebrates-falls-church-va-dc-metro",
  );

  assert.ok(chasin);
  assert.equal(chasin.officialAllergenStatus, "extracted");
  assert.ok(
    chasin.allergenDataStatus.officialItemCount >= 9,
    `expected partial Chasin Tails official caution rows, got ${chasin.allergenDataStatus.officialItemCount}`,
  );
  assert.ok(
    chasin.items.some(
      (item) =>
        item.name === "CALAMARI" &&
        item.allergenSourceType === "official-allergen-menu" &&
        item.mayContain.includes("gluten") &&
        item.mayContain.includes("shellfish"),
    ),
  );
});

test("generated DoorDash storefront menu uses Next flight item lists", () => {
  const unconventional = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "unconventional-diner-washington-dc-dc-metro",
  );

  assert.ok(unconventional);
  assert.equal(unconventional.coverageStatus, "complete");
  assert.ok(
    unconventional.items.length >= 40,
    `expected recovered DoorDash menu, got ${unconventional.items.length}`,
  );
  assert.ok(
    unconventional.items.some(
      (item) =>
        item.name === "Double Cheeseburger & Fries" &&
        item.sourceType === "next-flight-products" &&
        /Sesame-Seed Bun/i.test(item.description ?? ""),
    ),
  );
});

test("generated recovered weak DC menus stay complete", () => {
  const expectations = [
    [
      "ambar-restaurant-capitol-hill-washington-dc-dc-metro",
      39,
      "Balkan Kebabs",
    ],
    ["ambar-restaurant-clarendon-arlington-va-dc-metro", 39, "Balkan Kebabs"],
    ["copper-canyon-grill-washington-dc-dc-metro", 70, "Chicken Parmesan"],
    ["crisp-and-juicy-kensington-md-dc-metro", 100, "Whole Chicken"],
    [
      "guapo-s-cocina-and-bar-gaithersburg-md-dc-metro",
      150,
      "Aventura Ceviche",
    ],
    ["joia-burger-dc", 10, "Patty Wagyu Burger"],
    ["la-vie-washington-dc-dc-metro", 35, "SMASH BURGER"],
    ["la-grande-boucherie-dc-washington-dc-dc-metro", 90, "BOUCHERIE BURGER"],
    ["divan-restaurant-mclean-va-dc-metro", 90, "Kashke Bademjan"],
    [
      "los-hermanos-dominican-restaurant-and-catering-washington-dc-dc-metro",
      12,
      "Mofongo De Camarones",
    ],
    ["mon-ami-gabi-bethesda-md-dc-metro", 70, "Onion Soup au Gratin"],
    [
      "mirch-dhamaka-indian-fine-dine-cafe-and-bar-herndon-va-dc-metro",
      250,
      "Dhamaka Dosa (Big 5’ Dosa)",
    ],
    ["2941-restaurant-falls-church-va-dc-metro", 20, "Yellowfin Tuna Tartare"],
    ["old-house-cosmopolitan-alexandria-va-dc-metro", 30, "Wiener Schnitzel"],
    ["texas-jack-s-barbecue-washington-dc-dc-metro", 60, "Brisket Sandwich"],
    ["bluejacket-washington-dc-dc-metro", 60, "Bluejacket Double Burger"],
    ["tiger-fork-washington-dc-dc-metro", 20, "Beef Chow Fun"],
    ["the-grill-washington-dc-dc-metro", 70, "BEEF WELLINGTON"],
    ["ivy-city-smokehouse-washington-dc-dc-metro", 20, "BAGEL & LOX"],
    ["buena-vida-gastrolounge-arlington-va-dc-metro", 90, "BV Smash Burger"],
    ["bistro-du-jour-washington-dc-dc-metro", 55, "Steak Frites"],
    [
      "the-majestic-by-santiago-lopez-alexandria-va-dc-metro",
      45,
      "ARTICHOKE & LOBSTER DIP",
    ],
    [
      "summer-house-santa-monica-bethesda-md-dc-metro",
      80,
      "Classic Margherita",
    ],
    ["taberna-del-alabardero-washington-dc-dc-metro", 70, "GAMBAS AL AJILLO"],
    ["talkin-tacos-washington-dc-washington-dc-dc-metro", 85, "Birria Tacos"],
    ["turmerica-by-tanvi-modi-sterling-va-dc-metro", 80, "Aam Palak Chaat"],
    [
      "uncle-julio-s-gaithersburg-gaithersburg-md-dc-metro",
      143,
      "Acapulco Seafood Salad",
    ],
    ["urban-roast-washington-dc-dc-metro", 100, "Cheeseburger"],
  ];

  for (const [id, minimumItems, expectedItemName] of expectations) {
    const restaurant = generatedRestaurants.restaurants.find(
      (entry) => entry.id === id,
    );

    assert.ok(restaurant, `${id} should exist`);
    assert.ok(
      ["complete", "kept-previous"].includes(restaurant.coverageStatus),
      `${id} should be publishable, got ${restaurant.coverageStatus}`,
    );
    assert.ok(
      restaurant.items.length >= minimumItems,
      `${id} expected at least ${minimumItems} items, got ${restaurant.items.length}`,
    );
    assert.ok(
      restaurant.items.some((item) => item.name === expectedItemName),
      `${id} should include ${expectedItemName}`,
    );
  }
});

test("generated reviewed menu recoveries keep Ingredient Intelligence annotations", () => {
  const expectations = [
    ["catahoula-dc", "cheddar-biscuits", ["gluten", "milk", "wheat"]],
    ["catahoula-dc", "branzino", ["fish"]],
    [
      "replacement-rosemarino-d-italia-i-dupont-circle-washington-dc",
      "calamari-fritti",
      ["egg", "gluten", "shellfish", "wheat"],
    ],
    [
      "shia-dc",
      "scallop-and-fried-oyster-ssam",
      ["egg", "gluten", "shellfish", "wheat"],
    ],
  ];

  for (const [restaurantId, itemId, expectedSignals] of expectations) {
    const restaurant = generatedRestaurants.restaurants.find(
      (entry) => entry.id === restaurantId,
    );
    const menuItem = restaurant?.items.find((entry) => entry.id === itemId);

    assert.ok(menuItem, `${restaurantId}:${itemId} should exist`);
    for (const expectedSignal of expectedSignals) {
      assert.ok(
        menuItem.inferredAllergenSignals?.some(
          (signal) => signal.id === expectedSignal,
        ),
        `${restaurantId}:${itemId} should infer ${expectedSignal}`,
      );
    }
  }
});

test("generated Falafel Inc PDF recovery keeps compact side-grid food rows", () => {
  const falafel = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "falafel-inc-dc",
  );

  assert.ok(falafel);
  assert.ok(falafel.items.length >= 10);
  assert.ok(falafel.items.some((item) => item.name === "ZAATAR FRIES"));
  assert.ok(falafel.items.some((item) => item.name === "HUMMUS"));
  assert.ok(falafel.items.some((item) => item.name === "PITA BREAD (3 PACK)"));
});

test("generated Bluestone Lane menu excludes allergen-disclosure prefix artifact rows", () => {
  for (const id of ["chain-bluestone-lane", "bluestone-lane-west-end-dc"]) {
    const bluestone = generatedRestaurants.restaurants.find(
      (restaurant) => restaurant.id === id,
    );

    assert.ok(bluestone, `${id} should exist`);
    assert.deepEqual(
      bluestone.items
        .filter((item) => /^contains?\s+/i.test(item.name))
        .map((item) => item.name),
      [],
      `${id} should not publish glued allergen-disclosure item names`,
    );
    assert.ok(
      bluestone.items.some(
        (item) =>
          item.name === "Blueberry Pancakes" &&
          item.allergenSourceType === "official-ingredients" &&
          item.allergens.includes("milk") &&
          item.allergens.includes("gluten"),
      ),
      `${id} should keep the reviewed official Blueberry Pancakes row`,
    );
    assert.ok(
      bluestone.items.some(
        (item) =>
          item.name === "Collective Granola" &&
          item.allergenSourceType === "official-ingredients" &&
          item.allergens.includes("milk") &&
          item.allergens.includes("tree-nut") &&
          item.allergens.includes("sesame") &&
          !item.allergens.includes("gluten"),
      ),
      `${id} should not convert GF = Gluten free into a direct gluten allergen`,
    );
  }
});

test("generated official manual repair layer keeps source-backed allergens and removes boundary artifacts", () => {
  const jinya = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "jinya-ramen-dc",
  );
  const dosToros = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "dos-toros-dc",
  );
  const sushiTaro = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "sushi-taro-dc",
  );
  const neutralGround = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "neutral-ground-mclean-va",
  );
  const changChang = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "chang-chang-dc",
  );
  const ometeo = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "ometeo-tysons-va",
  );
  const riverClub = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "river-club-dc",
  );
  const peterChang = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "peter-chang-mclean-va",
  );
  const baanMae = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "baan-mae-dc",
  );
  const rakuya = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "rakuya-dc",
  );
  const northsideSocial = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "northside-social-va",
  );
  const harth = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "harth-tysons-va",
  );
  const kizuna = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "kizuna-sushi-ramen-tysons-va",
  );
  const phoHaiDuong = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "pho-hai-duong-tysons-va",
  );
  const mandnsPizza = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "mandns-pizza-bethesda-md",
  );
  const medina = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "medina-dc",
  );
  const huTieuMiLacay = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "hu-tieu-mi-lacay-cho-lon-falls-church-va",
  );
  const rareBird = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "rare-bird-coffee-roasters-falls-church-va",
  );
  const elPolloRico = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "el-pollo-rico-arlington-va",
  );
  const dogon = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-dogon-by-kwame-onwuachi-washington-dc",
  );
  const arrels = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "arrels-dc",
  );
  const chaoBan = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "chao-ban-tysons-va",
  );
  const amparo = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "amparo-fondita-dc",
  );
  const xiquet = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "xiquet-dc",
  );
  const providencia = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "providencia-dc",
  );
  const azteca = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "azteca-restaurant-college-park-md-dc-metro",
  );
  const primrose = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "primrose-dc",
  );
  const marvsDogs = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "marvs-dogs-dc",
  );
  const bumblebirds = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "bumblebirds-dc",
  );
  const fossette = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "fossette-focacceria-union-market-dc",
  );
  const juliiPike = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "julii-pike-and-rose-md",
  );
  const juliiBethesda = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "julii-bethesda-md-dc-metro",
  );
  const greenhouse = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "greenhouse-jefferson-dc",
  );
  const lighthouseTofu = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "lighthouse-tofu-annandale-va-dc-metro",
  );
  const tigerDumplings = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "tiger-dumplings-arlington-va",
  );
  const rasikaPenn = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "rasika-penn-quarter-dc",
  );
  const bartaco = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "bartaco-wharf-dc",
  );
  const texasDeBrazil = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "texas-de-brazil-fairfax-fairfax-va-dc-metro",
  );
  const kinDa = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-kin-da-2598575314",
  );
  const laCasina = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "la-casina-capitol-hill-dc",
  );
  const laCasinaBufalina = laCasina?.items.find(
    (item) => item.id === "pizza-la-bufalina",
  );
  const laCasinaCarbonara = laCasina?.items.find(
    (item) => item.id === "pizza-la-carbonara",
  );
  const laCasinaMarinare = laCasina?.items.find(
    (item) => item.id === "fritti-le-nuvolette-marinare",
  );
  const laCasinaPistachioTiramisu = laCasina?.items.find(
    (item) => item.id === "desserts-tiramisu-al-pistacchio",
  );
  const laCasinaVesuvio = laCasina?.items.find(
    (item) => item.id === "pizza-vesuvio",
  );
  const boogy = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "boogy-and-peel-dupont-dc",
  );
  const boogyMachaRoni = boogy?.items.find(
    (item) => item.id === "pizza-macha-roni",
  );
  const boogyPatricia = boogy?.items.find(
    (item) => item.id === "sandos-the-patricia-sando",
  );
  const boogyPimentoCheese = boogy?.items.find(
    (item) => item.id === "small-plates-salsa-macha-pimento-cheese",
  );
  const boogyKellyRuben = boogy?.items.find(
    (item) => item.id === "pizza-the-kelly-ruben",
  );
  const thompson = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "thompson-italian-falls-church-dc-metro",
  );
  const thompsonAlexandria = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-thompson-italian-11874404375",
  );
  const zinnia = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "zinnia-silver-spring-dc-metro",
  );
  const zinniaMac = zinnia?.items.find(
    (item) => item.id === "baked-mac-and-cheese",
  );
  const zinniaSeafoodChowder = zinnia?.items.find(
    (item) => item.id === "seafood-chowder",
  );
  const zinniaSpicedCauliflower = zinnia?.items.find(
    (item) => item.id === "spiced-cauliflower",
  );
  const sonnys = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "sonnys-pizza-dc",
  );
  const sonnysCheese = sonnys?.items.find((item) => item.id === "cheese");
  const sonnysGlutenFreeCheese = sonnys?.items.find(
    (item) => item.id === "gluten-free-cheese-pie",
  );
  const sonnysGlutenFreeTomato = sonnys?.items.find(
    (item) => item.id === "gluten-free-tomato-pie",
  );
  const sonnysLongShot = sonnys?.items.find((item) => item.id === "long-shot");
  const kWings = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "k-wings-centreville-dc-metro",
  );
  const kWingsBattered = kWings?.items.find(
    (item) => item.id === "16pcs-wings-bone-in-m",
  );
  const kWingsCalamari = kWings?.items.find(
    (item) => item.id === "fried-calamari",
  );
  const kWingsShrimpTempura = kWings?.items.find(
    (item) => item.id === "shrimp-tempura",
  );
  const kWingsTakoyaki = kWings?.items.find((item) => item.id === "takoyaki");
  const kWingsTteokbokki = kWings?.items.find(
    (item) => item.id === "tteokbokki",
  );
  const kWingsCornDog = kWings?.items.find(
    (item) => item.id === "korean-cheese-corn-dog",
  );
  const ama = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "ama-dc",
  );
  const amaLasagna = ama?.items.find(
    (item) => item.id === "borage-lasagna-verdi-con-ragu-alla-bolognese",
  );
  const amaFocaccia = ama?.items.find((item) => item.id === "classico-fugassa");
  const amaFarinata = ama?.items.find((item) => item.id === "farinata");
  const amaMortadellaPesto = ama?.items.find(
    (item) => item.id === "mortadella-stracchino-pesto-sandwich",
  );
  const amaRiceBowl = ama?.items.find((item) => item.id === "rice-bowl");
  const amaInsalata = ama?.items.find((item) => item.id === "insalata-verde");

  assert.ok(jinya);
  assert.equal(
    jinya.items.some(
      (item) => item.id === "chefs-special" && item.category === "Sashimi",
    ),
    false,
  );
  assert.ok(
    jinya.items.some(
      (item) =>
        item.id === "spicy-creamy-shrimp-tempura" &&
        item.allergenSourceType === "official-allergen-menu" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("wheat"),
    ),
  );

  assert.ok(dosToros);
  assert.equal(
    dosToros.items.some((item) => item.id === "rise-and-roll"),
    false,
  );
  assert.ok(
    dosToros.items.some(
      (item) =>
        item.id === "tortilla-burrito-tortilla" &&
        item.name === "Burrito Tortilla" &&
        item.category === "Tortilla" &&
        item.allergenSourceType === "official-allergen-menu" &&
        item.allergens.includes("gluten") &&
        item.allergens.includes("soy"),
    ),
  );
  assert.ok(
    dosToros.items.some(
      (item) =>
        item.id === "toppings-sour-cream" &&
        item.name === "Sour Cream" &&
        item.allergens.includes("milk") &&
        !item.allergens.includes("egg"),
    ),
  );

  assert.ok(sushiTaro);
  assert.equal(sushiTaro.officialAllergenStatus, "extracted");
  assert.equal(
    sushiTaro.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    49,
  );
  assert.ok(
    sushiTaro.items.some(
      (item) =>
        item.id === "toro-habanero-roll" &&
        item.allergenSourceType === "official-ingredients" &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    sushiTaro.items.some(
      (item) =>
        item.id === "tokujo-chirashi" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("egg") &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    sushiTaro.items.some(
      (item) =>
        item.id === "ebi-tempura-mori" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );

  assert.ok(neutralGround);
  assert.equal(
    neutralGround.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    19,
  );
  assert.ok(
    neutralGround.items.some(
      (item) =>
        item.id === "the-fish" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    neutralGround.items.some(
      (item) =>
        item.id === "hummingbird-cake" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("tree-nut") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    neutralGround.items.some(
      (item) =>
        item.id === "whipped-ricotta" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );

  assert.ok(changChang);
  assert.equal(
    changChang.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    66,
  );
  assert.ok(
    changChang.items.some(
      (item) =>
        item.id === "dry-fried-cumin-fish" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    changChang.items.some(
      (item) =>
        item.id === "cream-cheese-crab-spring-rolls" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    changChang.items.some(
      (item) =>
        item.id === "fresh-thai-summer-roll" &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("wheat") &&
        !item.allergens.includes("gluten"),
    ),
  );

  assert.ok(ometeo);
  assert.equal(
    ometeo.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    67,
  );
  assert.ok(
    ometeo.items.some(
      (item) =>
        item.id === "seafood-torre" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    ometeo.items.some(
      (item) =>
        item.id === "build-your-own-tacos" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    ometeo.items.some(
      (item) =>
        item.id === "chicken-torta" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );

  assert.ok(riverClub);
  assert.equal(
    riverClub.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    42,
  );
  assert.ok(
    riverClub.items.some(
      (item) =>
        item.id === "crab-and-pesto-cavatelli" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    riverClub.items.some(
      (item) =>
        item.id === "rockfish" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    riverClub.items.some(
      (item) =>
        item.id === "tiramisu" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("soy") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    riverClub.items.some(
      (item) =>
        item.id === "watermelon-ashta-sorbet" &&
        item.allergenSourceType === "unavailable" &&
        (item.allergens ?? []).length === 0,
    ),
  );

  assert.ok(peterChang);
  assert.equal(
    peterChang.sourceStatus?.officialEvidenceBucket,
    "official-disclosure-only",
  );
  assert.equal(
    peterChang.allergenDataStatus?.officialEvidence
      ?.suspiciousOfficialParserFragments,
    0,
  );
  assert.equal(
    peterChang.items.some((item) => item.id === "request-advisory"),
    false,
  );
  assert.equal(
    peterChang.items.some((item) => item.id === "spicy"),
    false,
  );
  assert.equal(
    peterChang.items.some((item) => item.id === "togo-seafood"),
    false,
  );
  assert.equal(
    peterChang.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    77,
  );
  assert.ok(
    peterChang.items.some(
      (item) =>
        item.id === "shrimp-lomein" &&
        item.description == null &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    peterChang.items.some(
      (item) =>
        item.id === "spicy-vegan-dan-dan-noodle-w-peanuts-and-tofu" &&
        item.allergens.includes("peanut") &&
        item.allergens.includes("soy") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    peterChang.items.some(
      (item) =>
        item.id === "walnut-custard-bun-2" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("tree-nut") &&
        item.allergens.includes("wheat"),
    ),
  );

  assert.ok(baanMae);
  assert.equal(
    baanMae.items.some((item) => item.id === "lighter"),
    false,
  );
  assert.equal(
    baanMae.items.filter(
      (item) =>
        item.allergenSourceType === "restaurant-linked-menu-ingredients",
    ).length,
    16,
  );
  assert.equal(
    baanMae.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    0,
  );
  assert.ok(
    baanMae.items.some(
      (item) =>
        item.id === "cha-mak-now" &&
        item.allergenSourceType === "unavailable" &&
        (item.allergens ?? []).length === 0,
    ),
  );
  assert.ok(
    baanMae.items.some(
      (item) =>
        item.id === "laphet-thoke-tea-leaf-salad" &&
        item.allergenSourceType === "unavailable" &&
        !item.allergens.includes("tree-nut"),
    ),
  );
  assert.ok(
    baanMae.items.some(
      (item) =>
        item.id === "salmon-belly-sauce" &&
        item.allergenSourceType === "unavailable" &&
        !item.allergens.includes("fish"),
    ),
  );
  assert.ok(
    baanMae.items.some(
      (item) =>
        item.id === "gaeng-dang-crab-puu" &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("tree-nut"),
    ),
  );
  assert.ok(
    baanMae.items.some(
      (item) =>
        item.id === "mee-sua" &&
        item.allergens.includes("milk") &&
        !item.allergens.includes("wheat") &&
        !item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    baanMae.items.some(
      (item) =>
        item.id === "thom-khem-tofu" &&
        item.allergens.includes("soy") &&
        !item.allergens.includes("wheat"),
    ),
  );

  assert.ok(rakuya);
  assert.equal(
    rakuya.items.some((item) => item.id === "kirin-ichiban"),
    false,
  );
  assert.equal(
    rakuya.items.some((item) => item.id === "substitution"),
    false,
  );
  assert.equal(
    rakuya.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    52,
  );
  assert.ok(
    rakuya.items.some(
      (item) =>
        item.id === "shio-ramen-light-broth-contain-shell-fish" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("wheat") &&
        !item.allergens.includes("fish"),
    ),
  );
  assert.ok(
    rakuya.items.some(
      (item) =>
        item.id === "shrimp-and-vegetable-tempura" &&
        item.description == null &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("wheat") &&
        !item.allergens.includes("fish") &&
        !item.allergens.includes("soy"),
    ),
  );
  assert.ok(
    rakuya.items.some(
      (item) =>
        item.id === "veggie-rolls" &&
        item.allergenSourceType === "unavailable" &&
        (item.allergens ?? []).length === 0,
    ),
  );

  assert.ok(northsideSocial);
  assert.equal(
    northsideSocial.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    147,
  );
  assert.ok(
    northsideSocial.items.some(
      (item) =>
        item.id === "sesame-tofu-bowl" &&
        item.allergens.includes("peanut") &&
        item.allergens.includes("sesame") &&
        item.allergens.includes("soy") &&
        !item.allergens.includes("milk"),
    ),
  );
  assert.ok(
    northsideSocial.items.some(
      (item) =>
        item.id === "no-gluten-vegan-cherry-almond" &&
        item.allergens.includes("tree-nut") &&
        !item.allergens.includes("wheat") &&
        !item.allergens.includes("milk"),
    ),
  );
  assert.ok(
    northsideSocial.items.some(
      (item) =>
        item.id === "avocado-toast" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("sesame") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    northsideSocial.items.some(
      (item) =>
        item.id === "sage-breakfast-sausage-and-poached-egg" &&
        item.description == null &&
        item.allergens.includes("egg") &&
        !item.allergens.includes("fish"),
    ),
  );

  assert.ok(harth);
  assert.equal(
    harth.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    41,
  );
  assert.ok(
    harth.items.some(
      (item) =>
        item.id === "banana-granola" &&
        item.allergens.includes("tree-nut") &&
        !item.allergens.includes("milk") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    harth.items.some(
      (item) =>
        item.id === "bandb-pudding" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    harth.items.some(
      (item) =>
        item.id === "vegan-burrito" &&
        item.allergenSourceType === "unavailable" &&
        (item.allergens ?? []).length === 0,
    ),
  );
  assert.ok(
    harth.items.some(
      (item) =>
        item.id === "smoked-salmon-bagel" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );

  assert.ok(kizuna);
  assert.equal(
    kizuna.items.some((item) => item.id === "everyday-rolls"),
    false,
  );
  assert.equal(
    kizuna.items.some((item) => item.id === "ramen"),
    false,
  );
  assert.equal(
    kizuna.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    155,
  );
  assert.ok(
    kizuna.items.some(
      (item) =>
        item.id === "asparagus-roll" &&
        item.allergenSourceType === "unavailable" &&
        (item.allergens ?? []).length === 0,
    ),
  );
  assert.ok(
    kizuna.items.some(
      (item) =>
        item.id === "shrimp-tempura-roll" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("wheat") &&
        !item.allergens.includes("milk"),
    ),
  );
  assert.ok(
    kizuna.items.some(
      (item) =>
        item.id === "kitsune-udon" &&
        item.allergens.includes("soy") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    kizuna.items.some(
      (item) =>
        item.id === "vegetable-roll-trio" &&
        item.description == null &&
        item.allergenSourceType === "unavailable",
    ),
  );

  assert.ok(phoHaiDuong);
  assert.equal(
    phoHaiDuong.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    11,
  );
  assert.ok(
    phoHaiDuong.items.some(
      (item) =>
        item.id === "goi-tom-thit" &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("wheat") &&
        !item.allergens.includes("peanut"),
    ),
  );
  assert.ok(
    phoHaiDuong.items.some(
      (item) =>
        item.id === "pho-do-bien" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("wheat") &&
        !item.allergens.includes("peanut"),
    ),
  );
  assert.ok(
    phoHaiDuong.items.some(
      (item) =>
        item.id === "canh-ga-chien-bo" &&
        item.allergens.includes("milk") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    phoHaiDuong.items.some(
      (item) =>
        item.id === "pho-rau-cai-dau-hu" &&
        item.allergens.includes("soy") &&
        !item.allergens.includes("fish"),
    ),
  );

  assert.ok(mandnsPizza);
  assert.equal(
    mandnsPizza.items.some((item) => item.id === "calzones"),
    false,
  );
  assert.equal(
    mandnsPizza.items.some((item) => item.id === "curries"),
    false,
  );
  assert.equal(
    mandnsPizza.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    110,
  );
  assert.ok(
    mandnsPizza.items.some(
      (item) =>
        item.id === "classic-cheeseburger" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat") &&
        item.allergens.includes("gluten"),
    ),
  );
  assert.ok(
    mandnsPizza.items.some(
      (item) =>
        item.id === "channa-masala-vegan" &&
        item.allergenSourceType === "unavailable" &&
        (item.allergens ?? []).length === 0,
    ),
  );
  assert.ok(
    mandnsPizza.items.some(
      (item) =>
        item.id === "garlic-naan-vegan" &&
        item.allergens.includes("wheat") &&
        !item.allergens.includes("milk"),
    ),
  );
  assert.ok(
    mandnsPizza.items.some(
      (item) =>
        item.id === "spicy-szechuan-tofu-pizza-veg" &&
        item.allergens.includes("soy") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );

  assert.ok(medina);
  assert.equal(
    medina.items.some((item) => item.id === "parsley-scallions"),
    false,
  );
  assert.equal(
    medina.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    17,
  );
  assert.ok(
    medina.items.some(
      (item) =>
        item.id === "brik-a-loeuf" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("fish") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    medina.items.some(
      (item) =>
        item.id === "falafel" &&
        item.allergens.includes("sesame") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    medina.items.some(
      (item) =>
        item.id === "omani-shrimp" &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("fish"),
    ),
  );

  assert.ok(huTieuMiLacay);
  assert.equal(
    huTieuMiLacay.items.some((item) => item.id === "general-info"),
    false,
  );
  assert.equal(
    huTieuMiLacay.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    29,
  );
  assert.ok(
    huTieuMiLacay.items.some(
      (item) =>
        item.id ===
          "concentrated-vietnamese-coffee-with-condensed-milk-i-am-very-rich-in-flavor" &&
        item.description == null &&
        item.allergens.includes("milk") &&
        !item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    huTieuMiLacay.items.some(
      (item) =>
        item.id === "bun-bo-hue" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    huTieuMiLacay.items.some(
      (item) =>
        item.id === "mi-xao-mem-chay" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("soy") &&
        item.allergens.includes("wheat"),
    ),
  );

  assert.ok(rareBird);
  assert.equal(
    rareBird.items.some((item) => String(item.id).startsWith("wholesale-")),
    false,
  );
  assert.equal(
    rareBird.items.some((item) => item.id === "employee-aeropress-filters"),
    false,
  );
  assert.equal(
    rareBird.items.some((item) => item.id === "barkies-dog-biscuits"),
    false,
  );
  assert.equal(
    rareBird.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    46,
  );
  assert.ok(
    rareBird.items.some(
      (item) =>
        item.id === "almond-and-chocolate-croissant" &&
        item.allergens.includes("gluten") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("tree-nut") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    rareBird.items.some(
      (item) =>
        item.id === "breakfast-sandwich" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("gluten") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    rareBird.items.some(
      (item) =>
        item.id === "biscotti" &&
        item.allergens.includes("tree-nut") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    rareBird.items.some(
      (item) =>
        item.id === "tomato-pesto-tart" &&
        item.allergens.includes("gluten") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat") &&
        !item.allergens.includes("tree-nut"),
    ),
  );

  assert.ok(elPolloRico);
  assert.equal(
    elPolloRico.items.some((item) => item.id === "arlington-virginia"),
    false,
  );
  assert.equal(
    elPolloRico.items.some(
      (item) => item.id === "scroll-to-top-scroll-to-top-scroll-to-top",
    ),
    false,
  );
  assert.equal(
    elPolloRico.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    10,
  );
  assert.ok(
    elPolloRico.items.some(
      (item) =>
        item.id === "chicken-turnover-includes-eggs-and-raisins" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("gluten") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    elPolloRico.items.some(
      (item) =>
        item.id === "shortbread-cookie-with-a-caramel-filling" &&
        item.allergens.includes("gluten") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    elPolloRico.items.some(
      (item) =>
        item.id === "flan" &&
        item.allergenSourceType === "official-product-allergen-section" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk"),
    ),
  );
  assert.equal(
    elPolloRico.items.find((item) => item.id === "party-size-coleslaw")
      ?.description,
    "Party-Size Coleslaw, 32 oz (feeds 7-10).",
  );

  assert.ok(dogon);
  assert.equal(dogon.officialAllergenStatus, "extracted");
  assert.equal(
    dogon.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    12,
  );
  assert.ok(
    dogon.items.some(
      (item) =>
        item.id === "curry-branzino" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    dogon.items.some(
      (item) =>
        item.id === "mom-dukes-shrimp" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    dogon.items.some(
      (item) =>
        item.id === "cherries-and-cream" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    dogon.items.some(
      (item) =>
        item.id === "piri-piri-salad" &&
        item.allergens.includes("tree-nut") &&
        !item.allergens.includes("peanut"),
    ),
  );

  assert.ok(arrels);
  assert.equal(arrels.officialAllergenStatus, "extracted");
  assert.equal(
    arrels.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    4,
  );
  assert.ok(
    arrels.items.some(
      (item) =>
        item.id === "esqueixada" &&
        item.allergens.includes("fish") &&
        !item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    arrels.items.some(
      (item) =>
        item.id === "squid-ink-fideua" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("egg") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    arrels.items.some(
      (item) =>
        item.id === "goat-milk-chocolate-cremeux" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    arrels.items.some(
      (item) =>
        item.id === "iberico-presa" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(chaoBan);
  assert.equal(chaoBan.officialAllergenStatus, "extracted");
  assert.equal(
    chaoBan.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    13,
  );
  assert.ok(
    chaoBan.items.some(
      (item) =>
        item.id === "catfished" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("egg") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    chaoBan.items.some(
      (item) =>
        item.id === "honey-pecan-shrimp" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("tree-nut") &&
        item.allergens.includes("egg") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    chaoBan.items.some(
      (item) =>
        item.id === "spicy-peanut-noodles" &&
        item.allergens.includes("peanut") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    chaoBan.items.some(
      (item) =>
        item.id === "beefy-and-beautiful-pho" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(amparo);
  assert.equal(amparo.officialAllergenStatus, "extracted");
  assert.equal(
    amparo.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    6,
  );
  assert.ok(
    amparo.items.some(
      (item) =>
        item.id === "aguachile-de-naranja" &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("fish"),
    ),
  );
  assert.ok(
    amparo.items.some(
      (item) =>
        item.id === "halibut-en-mole-coloradito" &&
        item.allergens.includes("fish") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    amparo.items.some(
      (item) =>
        item.id === "hongos-con-shishito" &&
        item.allergens.includes("milk") &&
        !item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    amparo.items.some(
      (item) =>
        item.id === "tres-leches" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );

  assert.ok(xiquet);
  assert.equal(xiquet.officialAllergenStatus, "extracted");
  assert.equal(
    xiquet.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    5,
  );
  assert.ok(
    xiquet.items.some(
      (item) =>
        item.id === "arros-del-llagosta" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("fish"),
    ),
  );
  assert.ok(
    xiquet.items.some(
      (item) =>
        item.id === "bunyelo" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("egg") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    xiquet.items.some(
      (item) =>
        item.id === "colomi" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );
  assert.ok(
    xiquet.items.some(
      (item) =>
        item.id === "xuleta-de-xai-xiquet" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(providencia);
  assert.equal(providencia.officialAllergenStatus, "extracted");
  assert.equal(
    providencia.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    4,
  );
  assert.ok(
    providencia.items.some(
      (item) =>
        item.id === "pan-de-playa" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    providencia.items.some(
      (item) =>
        item.id === "roasted-eggplant-pupusa" &&
        item.allergens.includes("milk") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    providencia.items.some(
      (item) =>
        item.id === "root-vegetable-tamal" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(azteca);
  assert.equal(azteca.officialAllergenStatus, "extracted");
  assert.equal(
    azteca.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    3,
  );
  assert.ok(
    azteca.items.some(
      (item) =>
        item.id === "ceviche-mixto-peruano" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    azteca.items.some(
      (item) =>
        item.id === "grilled-quesadilla" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );

  assert.ok(primrose);
  assert.equal(primrose.officialAllergenStatus, "extracted");
  assert.equal(
    primrose.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    3,
  );
  assert.ok(
    primrose.items.some(
      (item) =>
        item.id === "scallops" &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("fish"),
    ),
  );
  assert.ok(
    primrose.items.some(
      (item) =>
        item.id === "smash-burger" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    primrose.items.some(
      (item) =>
        item.id === "asparagus" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(marvsDogs);
  assert.equal(
    marvsDogs.items.some((item) => item.id === "additional-pint-vanilla"),
    false,
  );
  assert.equal(marvsDogs.officialAllergenStatus, "extracted");
  assert.equal(
    marvsDogs.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    4,
  );
  assert.ok(
    marvsDogs.items.some(
      (item) =>
        item.id === "dark-chocolate-chip-cookie" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    marvsDogs.items.some(
      (item) =>
        item.id === "french-fries" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );
  assert.ok(
    marvsDogs.items.some(
      (item) =>
        item.id === "party-pack" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );

  assert.ok(bumblebirds);
  assert.equal(bumblebirds.officialAllergenStatus, "extracted");
  assert.equal(
    bumblebirds.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    8,
  );
  assert.ok(
    bumblebirds.items.some(
      (item) =>
        item.id === "blue-ribbon-blt" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    bumblebirds.items.some(
      (item) =>
        item.id === "og-bumble" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    bumblebirds.items.some(
      (item) =>
        item.id === "sweet-potato-fries" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(fossette);
  assert.equal(fossette.officialAllergenStatus, "extracted");
  assert.equal(
    fossette.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    10,
  );
  assert.ok(
    fossette.items.some(
      (item) =>
        item.id === "chicken-parm" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("sesame") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    fossette.items.some(
      (item) =>
        item.id === "mortazza" &&
        item.allergens.includes("tree-nut") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    fossette.items.some(
      (item) =>
        item.id === "circolo" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("wheat") &&
        !item.allergens.includes("milk"),
    ),
  );

  for (const julii of [juliiPike, juliiBethesda]) {
    assert.ok(julii);
    assert.equal(julii.officialAllergenStatus, "extracted");
    assert.equal(
      julii.items.filter((item) => item.allergenSourceType !== "unavailable")
        .length,
      9,
    );
    assert.ok(
      julii.items.some(
        (item) =>
          item.id === "meditteranean-cod-salad" &&
          item.allergens.includes("fish") &&
          item.allergens.includes("milk") &&
          !item.allergens.includes("shellfish"),
      ),
    );
    assert.ok(
      julii.items.some(
        (item) =>
          item.id === "profiteroles" &&
          item.allergens.includes("egg") &&
          item.allergens.includes("milk") &&
          item.allergens.includes("tree-nut") &&
          item.allergens.includes("wheat"),
      ),
    );
    assert.ok(
      julii.items.some(
        (item) =>
          item.id === "salmon-caesar" &&
          item.allergens.includes("fish") &&
          item.allergens.includes("milk") &&
          item.allergens.includes("sesame") &&
          !item.allergens.includes("egg"),
      ),
    );
  }

  assert.ok(greenhouse);
  assert.equal(greenhouse.officialAllergenStatus, "extracted");
  assert.equal(
    greenhouse.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    9,
  );
  assert.ok(
    greenhouse.items.some(
      (item) =>
        item.id === "bagel-and-lox" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat") &&
        !item.allergens.includes("sesame") &&
        item.mayContain.includes("sesame"),
    ),
  );
  assert.ok(
    greenhouse.items.some(
      (item) =>
        item.id === "power-bowl" &&
        item.allergens.includes("milk") &&
        !item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    greenhouse.items.some(
      (item) =>
        item.id === "the-greenhouse-eggs-benedict" &&
        item.allergens.includes("egg") &&
        item.allergens.includes("milk") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    greenhouse.items.some(
      (item) =>
        item.id === "chefs-selection-of-seasonal-fruits-and-berries" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(lighthouseTofu);
  assert.equal(lighthouseTofu.officialAllergenStatus, "extracted");
  assert.equal(
    lighthouseTofu.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    7,
  );
  assert.ok(
    lighthouseTofu.items.some(
      (item) =>
        item.id === "chicken-teriyaki" &&
        item.allergenSourceType !== "unavailable" &&
        item.allergens.includes("soy"),
    ),
  );
  assert.ok(
    lighthouseTofu.items.some(
      (item) =>
        item.id === "fried-dumplings" &&
        item.allergens.includes("gluten") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    lighthouseTofu.items.some(
      (item) =>
        item.id === "seafood-soup-dinner" &&
        item.allergens.includes("shellfish") &&
        !item.allergens.includes("soy"),
    ),
  );
  assert.ok(
    lighthouseTofu.items.some(
      (item) =>
        item.id === "mushroom-soup-lunch" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(tigerDumplings);
  assert.equal(tigerDumplings.officialAllergenStatus, "extracted");
  assert.equal(
    tigerDumplings.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    66,
  );
  assert.ok(
    tigerDumplings.items.some(
      (item) =>
        item.id === "black-truffle-wagyu-beef-dumplings" &&
        item.allergens.includes("gluten") &&
        item.allergens.includes("wheat"),
    ),
  );
  assert.ok(
    tigerDumplings.items.some(
      (item) =>
        item.id === "kung-pao-prawns" &&
        item.allergens.includes("peanut") &&
        item.allergens.includes("shellfish"),
    ),
  );
  assert.ok(
    tigerDumplings.items.some(
      (item) =>
        item.id === "walnuts-prawn" &&
        item.allergens.includes("tree-nut") &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("egg"),
    ),
  );
  assert.ok(
    tigerDumplings.items.some(
      (item) =>
        item.id === "white-rice" &&
        item.allergenSourceType === "unavailable" &&
        item.allergens.length === 0,
    ),
  );

  assert.ok(rasikaPenn);
  assert.equal(
    rasikaPenn.items.some((item) => item.id === "kelt-vsop"),
    false,
  );
  assert.equal(rasikaPenn.officialAllergenStatus, "not-found");

  assert.ok(bartaco);
  assert.equal(bartaco.officialAllergenStatus, "extracted");
  assert.equal(bartaco.parserProfile, "everybite-widget");
  assert.equal(bartaco.sourceProfile, "everybite-widget:bartaco");
  assert.equal(bartaco.items.length, 107);
  assert.equal(
    bartaco.items.filter(
      (item) => item.allergenSourceType === "official-allergen-widget",
    ).length,
    107,
  );
  assert.ok(
    bartaco.items.some(
      (item) =>
        item.id === "tacos-baja-fish" &&
        item.allergenSourceType === "official-allergen-widget" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("egg") &&
        item.allergens.includes("soy"),
    ),
  );
  assert.ok(
    bartaco.items.some(
      (item) =>
        item.id === "tacos-crispy-oyster" &&
        item.allergens.includes("shellfish") &&
        item.allergens.includes("fish") &&
        item.allergens.includes("milk"),
    ),
  );
  assert.ok(
    bartaco.items.some(
      (item) =>
        item.id === "tacos-mushroom-w-queso-fresco" &&
        item.knownIngredients?.some((ingredient) =>
          /queso fresco/i.test(ingredient),
        ) &&
        item.allergens.includes("milk"),
    ),
  );

  assert.ok(texasDeBrazil);
  assert.equal(texasDeBrazil.officialAllergenStatus, "extracted");
  assert.ok(
    texasDeBrazil.items.some(
      (item) =>
        item.id === "caesar-salad" &&
        item.allergenSourceType === "official-ingredients" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("gluten"),
    ),
  );

  assert.ok(kinDa);
  assert.equal(kinDa.officialAllergenStatus, "extracted");
  assert.ok(
    kinDa.items.some(
      (item) =>
        item.id === "l-pad-thai" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("egg") &&
        item.allergens.includes("soy") &&
        item.allergens.includes("peanut"),
    ),
  );

  assert.ok(laCasina);
  assert.ok((laCasina.allergenDataStatus?.officialItemCount ?? 0) >= 30);
  assert.ok(laCasinaBufalina);
  assert.deepEqual(laCasinaBufalina.allergens?.sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(laCasinaCarbonara);
  assert.deepEqual(laCasinaCarbonara.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(laCasinaMarinare);
  assert.deepEqual(laCasinaMarinare.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(laCasinaPistachioTiramisu);
  assert.equal(
    laCasinaPistachioTiramisu.allergenSourceType,
    "official-ingredients",
  );
  assert.deepEqual(laCasinaPistachioTiramisu.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(laCasinaVesuvio);
  assert.deepEqual(laCasinaVesuvio.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(boogy);
  assert.ok((boogy.allergenDataStatus?.officialItemCount ?? 0) >= 20);
  assert.equal(
    boogy.items.some((item) => item.id === "boogy-magnet"),
    false,
  );
  assert.equal(
    boogy.items.some((item) => item.id === "white-claw-mango"),
    false,
  );
  assert.ok(boogyMachaRoni);
  assert.deepEqual(boogyMachaRoni.allergens?.sort(), [
    "gluten",
    "milk",
    "peanut",
    "sesame",
    "wheat",
  ]);
  assert.ok(boogyPatricia);
  assert.deepEqual(boogyPatricia.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(boogyPimentoCheese);
  assert.deepEqual(boogyPimentoCheese.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "peanut",
    "sesame",
    "wheat",
  ]);
  assert.ok(boogyKellyRuben);
  assert.deepEqual(boogyKellyRuben.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "mustard",
    "wheat",
  ]);

  assert.ok(thompson);
  assert.equal(
    thompson.items.some((item) =>
      ["for-orders-of", "includes"].includes(item.id),
    ),
    false,
  );
  assert.ok(thompsonAlexandria);
  assert.equal(
    thompsonAlexandria.items.some((item) => item.id === "includes"),
    false,
  );
  assert.ok(
    thompson.items.some(
      (item) =>
        item.id === "lemon-cheesecake" &&
        item.allergens.includes("milk") &&
        item.allergens.includes("tree-nut"),
    ),
  );

  assert.ok(sonnys);
  assert.ok((sonnys.allergenDataStatus?.officialItemCount ?? 0) >= 20);
  assert.ok(sonnysCheese);
  assert.deepEqual(sonnysCheese.allergens?.sort(), ["gluten", "milk", "wheat"]);
  assert.ok(sonnysGlutenFreeCheese);
  assert.deepEqual(sonnysGlutenFreeCheese.allergens?.sort(), ["milk"]);
  assert.ok(sonnysGlutenFreeTomato);
  assert.equal(sonnysGlutenFreeTomato.allergenSourceType, "unavailable");
  assert.deepEqual(sonnysGlutenFreeTomato.allergens ?? [], []);
  assert.ok(sonnysLongShot);
  assert.deepEqual(sonnysLongShot.allergens?.sort(), [
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);

  assert.ok(kWings);
  assert.ok((kWings.allergenDataStatus?.officialItemCount ?? 0) >= 30);
  assert.ok(kWingsBattered);
  assert.deepEqual(kWingsBattered.allergens?.sort(), ["gluten", "wheat"]);
  assert.ok(kWingsCalamari);
  assert.deepEqual(kWingsCalamari.allergens?.sort(), [
    "egg",
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(kWingsShrimpTempura);
  assert.deepEqual(kWingsShrimpTempura.allergens?.sort(), [
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(kWingsTakoyaki);
  assert.deepEqual(kWingsTakoyaki.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(kWingsTteokbokki);
  assert.deepEqual(kWingsTteokbokki.allergens?.sort(), [
    "fish",
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok(kWingsCornDog);
  assert.deepEqual(kWingsCornDog.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(ama);
  assert.ok((ama.allergenDataStatus?.officialItemCount ?? 0) >= 25);
  assert.ok(amaLasagna);
  assert.deepEqual(amaLasagna.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(amaFocaccia);
  assert.deepEqual(amaFocaccia.allergens?.sort(), ["gluten", "wheat"]);
  assert.ok(amaFarinata);
  assert.equal(amaFarinata.allergenSourceType, "unavailable");
  assert.deepEqual(amaFarinata.allergens ?? [], []);
  assert.ok(amaMortadellaPesto);
  assert.deepEqual(amaMortadellaPesto.allergens?.sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(amaRiceBowl);
  assert.deepEqual(amaRiceBowl.allergens?.sort(), ["fish"]);
  assert.ok(amaInsalata);
  assert.deepEqual(amaInsalata.allergens?.sort(), ["fish"]);

  assert.ok(zinnia);
  assert.ok((zinnia.allergenDataStatus?.officialItemCount ?? 0) >= 30);
  assert.ok(zinniaMac);
  assert.deepEqual(zinniaMac.allergens?.sort(), ["gluten", "milk", "wheat"]);
  assert.ok(zinniaSeafoodChowder);
  assert.deepEqual(zinniaSeafoodChowder.allergens?.sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(zinniaSpicedCauliflower);
  assert.deepEqual(zinniaSpicedCauliflower.allergens?.sort(), ["milk"]);
  assert.deepEqual(zinniaSpicedCauliflower.mayContain ?? [], []);
  assert.ok(
    zinnia.items.some(
      (item) =>
        item.id === "smoked-rainbow-trout-tartine" &&
        item.allergens.includes("fish") &&
        item.allergens.includes("tree-nut"),
    ),
  );
});

test("generated Silver and Sons does not treat gluten-free legend markers as contains gluten", () => {
  const silver = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "silver-and-sons-bbq-bethesda-md",
  );
  const merguez = silver?.items.find(
    (item) => item.id === "merguez-sausage-kabob",
  );

  assert.ok(silver);
  assert.ok(merguez);
  assert.equal(merguez.allergenSourceType, "unavailable");
  assert.deepEqual(merguez.allergens ?? [], []);
  assert.deepEqual(merguez.mayContain ?? [], []);
  assert.deepEqual(merguez.inferredAllergenSignals ?? [], []);
  assert.equal(silver.allergenDataStatus.officialItemCount, 0);
});

test("generated reviewed official corrections avoid global legend and raw-warning smears", () => {
  const silverDiner = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "silver-diner-dc",
  );
  const miVida = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "mi-vida-washington-dc-dc-metro",
  );
  const zanahorias = miVida?.items.find((item) => item.id === "zanahorias");
  const redrocks = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-redrocks-pizza-washington-dc",
  );
  const steakAndCheese = redrocks?.items.find(
    (item) => item.id === "ny-steak-and-cheese",
  );
  const nue = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-nue-elegantly-vietnamese-falls-church-va",
  );
  const tofuNoodleBowl = nue?.items.find(
    (item) => item.id === "tofu-noodle-bowl-v",
  );
  const gemini = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "gemini-dc",
  );
  const sesameCookie = gemini?.items.find(
    (item) => item.id === "sesame-and-chocolate-chip-cookie",
  );
  const rareBird = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "rare-bird-coffee-roasters-falls-church-va",
  );
  const pullApart = rareBird?.items.find((item) => item.id === "pull-apart");
  const heidelberg = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "heidelberg-pastry-shoppe-arlington-va",
  );
  const brownie = heidelberg?.items.find((item) => item.id === "brownie");
  const heidelbergBagels = heidelberg?.items.find(
    (item) => item.id === "bagels",
  );
  const heidelbergDeliPlatter = heidelberg?.items.find(
    (item) => item.id === "all-american-deli-platter",
  );
  const heidelbergFingerTeaSandwiches = heidelberg?.items.find(
    (item) => item.id === "finger-tea-sandwiches",
  );
  const heidelbergObstTorte = heidelberg?.items.find(
    (item) => item.id === "obst-torte",
  );
  const heidelbergVegetableTray = heidelberg?.items.find(
    (item) => item.id === "vegetable-tray",
  );
  const yardbird = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "yardbird-washington-dc-dc-metro",
  );
  const yardbirdHoneyButter = yardbird?.items.find(
    (item) => item.id === "honey-butter",
  );
  const yardbirdAhiTuna = yardbird?.items.find(
    (item) => item.id === "ahi-tuna-avocado-stack",
  );
  const yardbirdAppleCobbler = yardbird?.items.find(
    (item) => item.id === "apple-cobbler",
  );
  const yardbirdCrabCake = yardbird?.items.find(
    (item) => item.id === "jumbo-lump-crab-cake",
  );
  const yardbirdBacon = yardbird?.items.find((item) => item.id === "bacon-gf");
  const capitalGrille = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "the-capital-grille-dc",
  );

  assert.ok(silverDiner);
  assert.equal(silverDiner.allergenDataStatus.officialItemCount, 0);
  assert.equal(
    silverDiner.items.some(
      (item) =>
        item.allergenSourceType && item.allergenSourceType !== "unavailable",
    ),
    false,
  );

  assert.ok(zanahorias);
  assert.equal(zanahorias.allergenSourceType, "official-ingredients");
  assert.deepEqual(zanahorias.allergens?.sort(), ["milk", "peanut"]);
  assert.equal(zanahorias.allergens?.includes("gluten"), false);

  assert.ok(steakAndCheese);
  assert.equal(steakAndCheese.allergenSourceType, "official-ingredients");
  assert.deepEqual(steakAndCheese.allergens, ["milk"]);
  assert.equal(steakAndCheese.allergens?.includes("egg"), false);
  assert.equal(steakAndCheese.allergens?.includes("shellfish"), false);

  assert.ok(tofuNoodleBowl);
  assert.equal(tofuNoodleBowl.mayContain?.includes("egg"), false);

  assert.ok(sesameCookie);
  assert.deepEqual(sesameCookie.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "sesame",
  ]);
  assert.equal(sesameCookie.allergens?.includes("soy"), false);
  assert.equal(sesameCookie.allergens?.includes("tree-nut"), false);
  assert.equal(sesameCookie.mayContain?.includes("soy"), true);
  assert.equal(sesameCookie.mayContain?.includes("tree-nut"), true);

  assert.ok(pullApart);
  assert.equal(pullApart.allergens?.includes("tree-nut"), false);
  assert.equal(pullApart.mayContain?.includes("tree-nut"), true);

  assert.ok(brownie);
  assert.equal(
    heidelberg.items.some((item) => item.id === "cake-sizing-guide"),
    false,
  );
  assert.equal(
    heidelberg.items.some((item) =>
      /^group-[a-f]-breads-1-lb-dollar\d+-2-lb$/i.test(item.id),
    ),
    false,
  );
  assert.equal(
    heidelberg.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    123,
  );
  assert.deepEqual([...brownie.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(brownie.allergens?.includes("tree-nut"), false);
  assert.equal(brownie.mayContain?.includes("tree-nut"), true);
  assert.ok(heidelbergBagels);
  assert.deepEqual([...heidelbergBagels.allergens].sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.equal(heidelbergBagels.allergens?.includes("milk"), false);
  assert.ok(heidelbergDeliPlatter);
  assert.deepEqual([...heidelbergDeliPlatter.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(heidelbergFingerTeaSandwiches);
  assert.deepEqual([...heidelbergFingerTeaSandwiches.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(heidelbergObstTorte);
  assert.deepEqual([...heidelbergObstTorte.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(heidelbergVegetableTray);
  assert.deepEqual(heidelbergVegetableTray.allergens ?? [], ["milk"]);

  assert.ok(yardbirdHoneyButter);
  assert.equal(yardbird?.items.length, 79);
  assert.equal(
    yardbird?.items.some((item) => item.id === "miami"),
    false,
  );
  assert.equal(
    yardbird?.items.some((item) => item.id === "yardbird-old-fashioned"),
    false,
  );
  assert.equal(
    yardbird?.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    55,
  );
  assert.deepEqual([...yardbirdHoneyButter.allergens].sort(), ["milk"]);
  assert.equal(yardbirdHoneyButter.allergens?.includes("tree-nut"), false);
  assert.equal(yardbirdHoneyButter.mayContain?.includes("tree-nut"), false);
  assert.ok(yardbirdAhiTuna);
  assert.deepEqual([...yardbirdAhiTuna.allergens].sort(), ["fish", "milk"]);
  assert.ok(yardbirdAppleCobbler);
  assert.deepEqual([...yardbirdAppleCobbler.allergens].sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(yardbirdCrabCake);
  assert.deepEqual(yardbirdCrabCake.allergens ?? [], ["shellfish"]);
  assert.ok(yardbirdBacon);
  assert.equal(yardbirdBacon.allergenSourceType, "unavailable");
  assert.deepEqual(yardbirdBacon.allergens ?? [], []);

  assert.ok(capitalGrille);
  assert.equal(
    capitalGrille.items.some((item) =>
      ["key-to-this-guide-preparation", "preparation"].includes(item.id ?? ""),
    ),
    false,
  );
});

test("generated P.F. Chang's strict official matrix remains source-backed and reviewed", () => {
  const pfChangs = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "pf-changs",
  );
  const whiteRice = pfChangs?.items.find(
    (item) => item.id === "white-rice-steamed",
  );
  const brownRice = pfChangs?.items.find(
    (item) => item.id === "brown-rice-steamed",
  );
  const gfFriedRice = pfChangs?.items.find(
    (item) => item.id === "gf-fried-rice",
  );

  assert.ok(pfChangs);
  assert.equal(
    officialAllergenDistributionSummary(pfChangs).supportedStrictDirectMatrix,
    true,
  );
  assert.equal(
    pfChangs.sourceStatus?.officialAllergenDistributionReview?.classification,
    "supported-strict-direct-matrix",
  );
  assert.ok(whiteRice);
  assert.deepEqual(whiteRice.allergens, ["wheat"]);
  assert.match(
    JSON.stringify(whiteRice.evidence ?? []),
    /Official P\.F\. Chang's allergen matrix row/,
  );
  assert.ok(brownRice);
  assert.deepEqual(brownRice.allergens, ["wheat"]);
  assert.ok(gfFriedRice);
  assert.equal(gfFriedRice.allergens?.includes("wheat"), false);
});

test("generated reviewed parser-artifact repairs split Italian appetizer section rows", () => {
  const tupelo = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id ===
      "tupelo-honey-southern-kitchen-and-bar-arlington-va-dc-metro",
  );
  const ironGate = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "iron-gate-restaurant-washington-dc-dc-metro",
  );
  const ilPizzico = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-il-pizzico-6595475668",
  );
  const ilPorto = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-il-porto-ristorante-160692021",
  );

  assert.equal(
    tupelo?.items.some((item) => item.id === "dollar1799-970-cal"),
    false,
  );
  assert.equal(
    ironGate?.items.some((item) => item.id === "non-alcoholic"),
    false,
  );
  assert.equal(
    ilPizzico?.items.some((item) => item.id === "antipasti"),
    false,
  );
  assert.equal(
    ilPorto?.items.some((item) => item.id === "antipasti"),
    false,
  );
  assert.ok(
    ilPizzico?.items.some(
      (item) =>
        item.id === "calamari-piccanti" && item.category === "Antipasti",
    ),
  );
  assert.ok(
    ilPizzico?.items.some(
      (item) => item.id === "cozze" && item.category === "Antipasti",
    ),
  );
  assert.ok(
    ilPorto?.items.some(
      (item) => item.id === "calamari-fritti" && item.category === "Antipasti",
    ),
  );
  assert.ok(
    ilPorto?.items.some(
      (item) => item.id === "cozze" && item.category === "Antipasti",
    ),
  );
});

test("generated reviewed menu bleed corrections keep source-backed item fields", () => {
  const texas = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "texas-de-brazil-fairfax-fairfax-va-dc-metro",
  );
  const texasCaesar = texas?.items.find((item) => item.id === "caesar-salad");
  const blueRidge = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "blue-ridge-seafood-restaurant-gainesville-va",
  );
  const hamilton = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "the-hamilton-dc",
  );

  assert.ok(texasCaesar);
  assert.equal(
    texasCaesar.description,
    "Romaine lettuce, cherry tomatoes, shaved Grana Padano cheese, croutons, and Caesar dressing.",
  );
  assert.equal(texasCaesar.allergenSourceType, "official-ingredients");
  assert.deepEqual(texasCaesar.allergens?.sort(), ["gluten", "milk", "wheat"]);
  assert.equal(
    /Brazilian Cheese Bread|Lobster Bisque|See next page/i.test(
      texasCaesar.description ?? "",
    ),
    false,
  );

  assert.ok(blueRidge?.items.some((item) => item.id === "stuffed-shrimp"));
  assert.equal(
    blueRidge?.items.some(
      (item) =>
        item.id ===
        "four-jumbo-shrimp-topped-with-our-homemade-crabmeat-stuffing",
    ),
    false,
  );
  assert.equal(
    hamilton?.items.some((item) => item.id === "burgers-and-sandwiches"),
    false,
  );
});

test("generated reviewed official bleed repairs keep real item evidence and remove legend rows", () => {
  const planta = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "planta-bethesda-bethesda-md-dc-metro",
  );
  const pappe = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "pappe-dc",
  );
  const northside = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "northside-social-va",
  );
  const medina = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "medina-dc",
  );
  const maydan = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "maydan-dc",
  );
  const seray = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-seray-vienna-va",
  );
  const nue = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-nue-elegantly-vietnamese-falls-church-va",
  );
  const sweetLeaf = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "sweet-leaf-arlington",
  );
  const eddieMerlots = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "eddie-merlots-ashburn-va-dc-metro",
  );
  const trueFood = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "true-food-kitchen-arlington",
  );
  const laCasita = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "la-casita-pupusas-dc",
  );
  const laCasitaGaithersburg = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "la-casita-gaithersburg-dc-metro",
  );
  const elTamarindo = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "el-tamarindo-dc",
  );
  const rocklands = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "rocklands-bbq-dc",
  );
  const nomaPizza = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "noma-pizza-dc",
  );
  const takumiNavyYard = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "takumi-navy-yard-dc",
  );
  const toutDeSweet = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "tout-de-sweet-bethesda-dc-metro",
  );
  const vanLeeuwen = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "van-leeuwen-dc",
  );
  const maggianos = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "maggiano-s-little-italy-springfield-va-dc-metro",
  );
  const fishTaco = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "fish-taco-bethesda-md",
  );
  const chopt = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "chopt-dc",
  );
  const rasa = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "rasa-dc",
  );
  const sweetgreen = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "sweetgreen-dc",
  );
  const whiteBeanSoup = northside?.items.find(
    (item) => item.id === "white-bean-and-pesto-soup",
  );
  const medinaLamb = medina?.items.find((item) => item.id === "lamb-shish");
  const nueTofu = nue?.items.find((item) => item.id === "tofu-noodle-bowl-v");
  const sweetLeafFarmers = sweetLeaf?.items.find(
    (item) => item.id === "farmers",
  );
  const sweetLeafCitrusSesame = sweetLeaf?.items.find(
    (item) => item.id === "citrus-sesame-chicken",
  );
  const eddiePeanutButterCup = eddieMerlots?.items.find(
    (item) => item.id === "peanut-butter-cup",
  );
  const eddieAhiTunaWontons = eddieMerlots?.items.find(
    (item) => item.id === "ahi-tuna-wontons",
  );
  const laCasitaPlantainBowl = laCasita?.items.find(
    (item) => item.id === "plantain-and-avocado-bowl",
  );
  const laCasitaShrimpBowl = laCasita?.items.find(
    (item) => item.id === "bowl-fresh-shrimp",
  );
  const laCasitaCeviche = laCasita?.items.find(
    (item) => item.id === "ceviche-mixto",
  );
  const laCasitaSteakCheese = laCasita?.items.find(
    (item) => item.id === "chicken-steak-and-cheese",
  );
  const laCasitaPanDeDia = laCasita?.items.find(
    (item) => item.id === "pan-de-dia",
  );
  const laCasitaSoyChorizo = laCasita?.items.find(
    (item) => item.id === "pupusa-soy-chorizo-rice-flour",
  );
  const laCasitaCornMasa = laCasita?.items.find(
    (item) => item.id === "pupusas-maiz-corn-masa",
  );
  const laCasitaRiceMasa = laCasita?.items.find(
    (item) => item.id === "pupusas-arroz-rice-flour",
  );
  const laCasitaGaithersburgBaleada = laCasitaGaithersburg?.items.find(
    (item) => item.id === "baleada-sencilla",
  );
  const laCasitaGaithersburgCeviche = laCasitaGaithersburg?.items.find(
    (item) => item.id === "ceviche-americas",
  );
  const laCasitaGaithersburgPanPollo = laCasitaGaithersburg?.items.find(
    (item) => item.id === "pan-de-pollo",
  );
  const laCasitaGaithersburgMixtoLeche = laCasitaGaithersburg?.items.find(
    (item) => item.id === "mixto-leche",
  );
  const elTamarindoBreakfastBurrito = elTamarindo?.items.find(
    (item) => item.id === "breakfast-burrito",
  );
  const elTamarindoCeviche = elTamarindo?.items.find(
    (item) => item.id === "ceviche",
  );
  const elTamarindoMariscada = elTamarindo?.items.find(
    (item) => item.id === "mariscada",
  );
  const elTamarindoVegano = elTamarindo?.items.find(
    (item) => item.id === "el-vegano",
  );
  const elTamarindoSoftTacos = elTamarindo?.items.find(
    (item) => item.id === "soft-tacos",
  );
  const rocklandsBurger = rocklands?.items.find(
    (item) => item.id === "4-oz-grilled-burger",
  );
  const rocklandsCatfishSandwich = rocklands?.items.find(
    (item) => item.id === "grilled-catfish-sandwich",
  );
  const rocklandsMacCheese = rocklands?.items.find(
    (item) => item.id === "mac-and-cheese",
  );
  const rocklandsPecanPie = rocklands?.items.find(
    (item) => item.id === "slice-of-pecan-pie",
  );
  const rocklandsPlainRibs = rocklands?.items.find(
    (item) => item.id === "baby-back-ribs-half-rack",
  );
  const nomaTurkey = nomaPizza?.items.find((item) => item.id === "turkey");
  const nomaShrimpPestoWrap = nomaPizza?.items.find(
    (item) => item.id === "shrimp-pesto-wrap",
  );
  const nomaChickenParmesan = nomaPizza?.items.find(
    (item) => item.id === "chicken-parmesan",
  );
  const nomaHummus = nomaPizza?.items.find((item) => item.id === "hummus");
  const nomaLargePizza = nomaPizza?.items.find(
    (item) => item.id === "large-pizza-14",
  );
  const nomaCheesePizza = nomaPizza?.items.find(
    (item) => item.id === "2-large-cheese-pizzas",
  );
  const nomaWings = nomaPizza?.items.find(
    (item) => item.id === "chicken-wings",
  );
  const takumiTeriyaki = takumiNavyYard?.items.find(
    (item) => item.id === "japanese-teriyaki",
  );
  const takumiFriedRice = takumiNavyYard?.items.find(
    (item) => item.id === "fried-rice",
  );
  const takumiDcRoll = takumiNavyYard?.items.find(
    (item) => item.id === "dc-roll",
  );
  const takumiUdon = takumiNavyYard?.items.find(
    (item) => item.id === "spicy-seafood-udon-noodle",
  );
  const takumiSalad = takumiNavyYard?.items.find(
    (item) => item.id === "takumi-salad",
  );
  const takumiAvocadoSalad = takumiNavyYard?.items.find(
    (item) => item.id === "avocado-salad",
  );
  const toutAlmondCroissant = toutDeSweet?.items.find(
    (item) => item.id === "almond-croissant",
  );
  const toutBrownie = toutDeSweet?.items.find((item) => item.id === "brownie");
  const toutNougatPassion = toutDeSweet?.items.find(
    (item) => item.id === "nougat-passion",
  );
  const toutMacarons = toutDeSweet?.items.find(
    (item) => item.id === "macarons",
  );
  const toutMousseSesame = toutDeSweet?.items.find(
    (item) => item.id === "milk-chocolate-mousse-and-sesame",
  );
  const toutSalmonBoard = toutDeSweet?.items.find(
    (item) => item.id === "smoked-salmon-and-naan-bread-board",
  );
  const toutFreshFruit = toutDeSweet?.items.find(
    (item) => item.id === "fresh-fruit",
  );
  const toutOvernightOats = toutDeSweet?.items.find(
    (item) => item.id === "strawberry-overnight-oats",
  );
  const vanLeeuwenHotFudge = vanLeeuwen?.items.find(
    (item) => item.id === "hot-fudge",
  );
  const vanLeeuwenVeganCookieDough = vanLeeuwen?.items.find(
    (item) => item.id === "vegan-choc-chip-cookie-dough",
  );
  const sweetLeafCageFreeEgg = sweetLeaf?.items.find(
    (item) => item.id === "cage-free-egg",
  );
  const sweetLeafBerryBlanco = sweetLeaf?.items.find(
    (item) => item.id === "berry-blanco",
  );
  const maggianosKidsMilk = maggianos?.items.find(
    (item) => item.id === "kids-milk-skim",
  );
  const maggianosRavioli = maggianos?.items.find(
    (item) => item.id === "four-cheese-ravioli-large",
  );
  const maggianosNoCheeseAsparagus = maggianos?.items.find(
    (item) => item.id === "fresh-grilled-asparagus-wo-cheese",
  );
  const fishTacoQueso = fishTaco?.items.find(
    (item) => item.id === "chips-and-queso",
  );
  const fishTacoFlourQuesadilla = fishTaco?.items.find(
    (item) => item.id === "small-cheese-quesadilla-flour-tortilla",
  );
  const choptCoconutChiller = chopt?.items.find(
    (item) => item.id === "blueberry-coconut-chiller",
  );
  const choptBlueCheese = chopt?.items.find(
    (item) => item.id === "blue-cheese",
  );
  const rasaCoconutGinger = rasa?.items.find(
    (item) => item.id === "coconut-ginger-sauce",
  );
  const maydanKebabPlatter = maydan?.items.find(
    (item) => item.id === "kebab-platter",
  );
  const maydanShakshuka = maydan?.items.find((item) => item.id === "shakshuka");
  const maydanTahina = maydan?.items.find((item) => item.id === "tahina");
  const maydanSayyadiah = maydan?.items.find((item) => item.id === "sayyadiah");
  const maydanHalloumi = maydan?.items.find((item) => item.id === "halloumi");

  assert.equal(
    planta?.items.some((item) => item.id === "kids-menufor-children"),
    false,
  );
  assert.equal(
    pappe?.items.some((item) =>
      /foodborneillness|riskoffoodborneillness/i.test(item.id),
    ),
    false,
  );
  assert.equal(
    maydan?.items.some((item) => item.id === "lamb-shish"),
    false,
  );
  assert.equal(
    maydan?.items.some((item) => item.id === "egg-feta"),
    false,
  );
  assert.equal(
    maydan?.items.some((item) =>
      /foodborne|service fee/i.test(`${item.name} ${item.description ?? ""}`),
    ),
    false,
  );
  assert.equal(
    seray?.items.some((item) => item.id === "baked-cheese-gf"),
    false,
  );
  assert.equal(
    seray?.items.some((item) => item.id === "salad-toppings"),
    false,
  );
  assert.equal(
    trueFood?.items.some((item) => item.id === "v1a0"),
    false,
  );

  assert.ok(maydanKebabPlatter);
  assert.equal(maydanKebabPlatter.allergenSourceType, "official-ingredients");
  assert.deepEqual([...maydanKebabPlatter.allergens].sort(), [
    "milk",
    "shellfish",
  ]);

  assert.ok(maydanShakshuka);
  assert.equal(maydanShakshuka.allergenSourceType, "official-ingredients");
  assert.deepEqual([...maydanShakshuka.allergens].sort(), ["egg", "milk"]);

  assert.ok(maydanTahina);
  assert.equal(maydanTahina.allergenSourceType, "official-ingredients");
  assert.deepEqual(maydanTahina.allergens, ["sesame"]);

  assert.ok(maydanSayyadiah);
  assert.equal(maydanSayyadiah.allergenSourceType, "official-ingredients");
  assert.deepEqual(maydanSayyadiah.allergens, ["fish"]);

  assert.ok(maydanHalloumi);
  assert.equal(maydanHalloumi.allergenSourceType, "official-ingredients");
  assert.deepEqual([...maydanHalloumi.allergens].sort(), ["milk", "peanut"]);

  assert.ok(whiteBeanSoup);
  assert.equal(
    whiteBeanSoup.description,
    "Puree of white bean, hint of cream, basil pesto. Contains nuts.",
  );
  assert.equal(whiteBeanSoup.allergenSourceType, "official-ingredients");
  assert.deepEqual(whiteBeanSoup.allergens?.sort(), ["milk", "tree-nut"]);

  assert.ok(medinaLamb);
  assert.equal(
    medinaLamb.description,
    "Kefir labne, cumin, peppers, and onions.",
  );
  assert.equal(medinaLamb.allergenSourceType, "official-ingredients");
  assert.deepEqual(medinaLamb.allergens, ["milk"]);

  assert.ok(nueTofu);
  assert.equal(nueTofu.category, "Lunch");
  assert.equal(
    nueTofu.description,
    "Fresh herbs, summer vegetables, and tamari.",
  );
  assert.equal(nueTofu.allergenSourceType, "official-ingredients");
  assert.deepEqual(nueTofu.allergens, ["soy"]);

  assert.ok(sweetLeafFarmers);
  assert.equal(
    sweetLeafFarmers.description,
    "Cage-free egg, sausage, cheddar cheese, tomato, roasted shallots, spicy aioli on brioche.",
  );
  assert.equal(sweetLeafFarmers.allergenSourceType, "official-ingredients");
  assert.deepEqual([...sweetLeafFarmers.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(sweetLeafCitrusSesame);
  assert.equal(
    /GREEK GARDEN/i.test(sweetLeafCitrusSesame.description ?? ""),
    false,
  );
  assert.deepEqual([...sweetLeafCitrusSesame.allergens].sort(), [
    "sesame",
    "tree-nut",
  ]);

  assert.ok(eddiePeanutButterCup);
  assert.deepEqual([...eddiePeanutButterCup.allergens].sort(), [
    "gluten",
    "milk",
    "peanut",
    "wheat",
  ]);

  assert.ok(eddieAhiTunaWontons);
  assert.deepEqual([...eddieAhiTunaWontons.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "soy",
    "wheat",
  ]);

  assert.ok(laCasitaPlantainBowl);
  assert.equal(
    /ALLERGEN INFORMATION/i.test(laCasitaPlantainBowl.description ?? ""),
    false,
  );
  assert.deepEqual(laCasitaPlantainBowl.allergens ?? [], []);
  assert.deepEqual(laCasitaPlantainBowl.mayContain ?? [], ["milk"]);

  assert.ok(laCasitaShrimpBowl);
  assert.equal(laCasitaShrimpBowl.allergenSourceType, "official-ingredients");
  assert.deepEqual(laCasitaShrimpBowl.allergens ?? [], ["shellfish"]);

  assert.ok(laCasitaCeviche);
  assert.deepEqual([...laCasitaCeviche.allergens].sort(), [
    "fish",
    "shellfish",
  ]);

  assert.ok(laCasitaSteakCheese);
  assert.deepEqual([...laCasitaSteakCheese.allergens].sort(), [
    "egg",
    "milk",
    "mustard",
  ]);

  assert.ok(laCasitaPanDeDia);
  assert.deepEqual([...laCasitaPanDeDia.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(laCasitaSoyChorizo);
  assert.deepEqual(laCasitaSoyChorizo.allergens ?? [], ["soy"]);

  assert.ok(laCasitaCornMasa);
  assert.equal(laCasitaCornMasa.allergenSourceType, "unavailable");
  assert.deepEqual(laCasitaCornMasa.allergens ?? [], []);

  assert.ok(laCasitaRiceMasa);
  assert.equal(laCasitaRiceMasa.allergenSourceType, "unavailable");
  assert.deepEqual(laCasitaRiceMasa.allergens ?? [], []);

  assert.ok(laCasitaGaithersburg);
  assert.ok(
    (laCasitaGaithersburg.allergenDataStatus?.officialItemCount ?? 0) >= 80,
  );
  assert.ok(laCasitaGaithersburgBaleada);
  assert.deepEqual([...laCasitaGaithersburgBaleada.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(laCasitaGaithersburgCeviche);
  assert.deepEqual([...laCasitaGaithersburgCeviche.allergens].sort(), [
    "fish",
    "shellfish",
  ]);
  assert.ok(laCasitaGaithersburgPanPollo);
  assert.deepEqual([...laCasitaGaithersburgPanPollo.allergens].sort(), [
    "egg",
    "gluten",
    "mustard",
    "wheat",
  ]);
  assert.ok(laCasitaGaithersburgMixtoLeche);
  assert.deepEqual([...laCasitaGaithersburgMixtoLeche.allergens].sort(), [
    "gluten",
    "milk",
    "tree-nut",
  ]);

  assert.equal(
    elTamarindo?.items.some(
      (item) => item.id === "ultra-moist-spongecake-soaked-in",
    ),
    false,
  );
  assert.equal(
    elTamarindo?.items.some(
      (item) => item.id === "salvadoran-and-mexican-restaurant",
    ),
    false,
  );
  assert.equal(
    elTamarindo?.items.some(
      (item) => item.id === "salvadoran-punch-with-fresh-chopped",
    ),
    false,
  );

  assert.ok(elTamarindoBreakfastBurrito);
  assert.equal(
    elTamarindoBreakfastBurrito.allergenSourceType,
    "official-ingredients",
  );
  assert.deepEqual([...elTamarindoBreakfastBurrito.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(elTamarindoCeviche);
  assert.deepEqual([...elTamarindoCeviche.allergens].sort(), [
    "fish",
    "shellfish",
  ]);

  assert.ok(elTamarindoMariscada);
  assert.deepEqual([...elTamarindoMariscada.allergens].sort(), [
    "fish",
    "milk",
    "shellfish",
  ]);

  assert.ok(elTamarindoVegano);
  assert.equal(elTamarindoVegano.allergenSourceType, "unavailable");
  assert.deepEqual(elTamarindoVegano.allergens ?? [], []);

  assert.ok(elTamarindoSoftTacos);
  assert.equal(elTamarindoSoftTacos.allergenSourceType, "unavailable");
  assert.deepEqual(elTamarindoSoftTacos.allergens ?? [], []);

  assert.ok(rocklandsBurger);
  assert.equal(rocklandsBurger.allergenSourceType, "official-ingredients");
  assert.deepEqual([...rocklandsBurger.allergens].sort(), ["gluten", "wheat"]);

  assert.ok(rocklandsCatfishSandwich);
  assert.deepEqual([...rocklandsCatfishSandwich.allergens].sort(), [
    "fish",
    "gluten",
    "wheat",
  ]);

  assert.ok(rocklandsMacCheese);
  assert.deepEqual([...rocklandsMacCheese.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(rocklandsPecanPie);
  assert.deepEqual([...rocklandsPecanPie.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);

  assert.ok(rocklandsPlainRibs);
  assert.equal(rocklandsPlainRibs.allergenSourceType, "unavailable");
  assert.deepEqual(rocklandsPlainRibs.allergens ?? [], []);

  assert.ok(nomaTurkey);
  assert.equal(nomaTurkey.allergenSourceType, "unavailable");
  assert.deepEqual(nomaTurkey.allergens ?? [], []);

  assert.ok(nomaShrimpPestoWrap);
  assert.equal(nomaShrimpPestoWrap.allergenSourceType, "official-ingredients");
  assert.deepEqual([...nomaShrimpPestoWrap.allergens].sort(), [
    "gluten",
    "milk",
    "shellfish",
    "tree-nut",
    "wheat",
  ]);

  assert.ok(nomaChickenParmesan);
  assert.deepEqual([...nomaChickenParmesan.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(nomaHummus);
  assert.deepEqual([...nomaHummus.allergens].sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);

  assert.ok(nomaLargePizza);
  assert.equal(nomaLargePizza.allergenSourceType, "unavailable");
  assert.deepEqual(nomaLargePizza.allergens ?? [], []);

  assert.ok(nomaCheesePizza);
  assert.deepEqual([...nomaCheesePizza.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(nomaWings);
  assert.equal(nomaWings.allergenSourceType, "unavailable");
  assert.deepEqual(nomaWings.allergens ?? [], []);

  assert.ok(takumiTeriyaki);
  assert.equal(takumiTeriyaki.allergenSourceType, "official-ingredients");
  assert.deepEqual([...takumiTeriyaki.allergens].sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);

  assert.ok(takumiFriedRice);
  assert.deepEqual(takumiFriedRice.allergens ?? [], ["egg"]);

  assert.ok(takumiDcRoll);
  assert.deepEqual([...takumiDcRoll.allergens].sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);

  assert.ok(takumiUdon);
  assert.deepEqual([...takumiUdon.allergens].sort(), [
    "gluten",
    "shellfish",
    "wheat",
  ]);

  assert.ok(takumiSalad);
  assert.deepEqual([...takumiSalad.allergens].sort(), [
    "fish",
    "gluten",
    "sesame",
    "wheat",
  ]);

  assert.ok(takumiAvocadoSalad);
  assert.equal(takumiAvocadoSalad.allergenSourceType, "unavailable");
  assert.deepEqual(takumiAvocadoSalad.allergens ?? [], []);

  assert.ok(toutAlmondCroissant);
  assert.equal(toutAlmondCroissant.allergenSourceType, "official-ingredients");
  assert.deepEqual([...toutAlmondCroissant.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);

  assert.ok(toutBrownie);
  assert.deepEqual([...toutBrownie.allergens].sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);

  assert.ok(toutNougatPassion);
  assert.deepEqual([...toutNougatPassion.allergens].sort(), [
    "egg",
    "milk",
    "tree-nut",
  ]);

  assert.ok(toutMacarons);
  assert.deepEqual([...toutMacarons.allergens].sort(), ["egg", "tree-nut"]);

  assert.ok(toutMousseSesame);
  assert.deepEqual([...toutMousseSesame.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "sesame",
    "tree-nut",
    "wheat",
  ]);

  assert.ok(toutSalmonBoard);
  assert.deepEqual([...toutSalmonBoard.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(toutFreshFruit);
  assert.equal(toutFreshFruit.allergenSourceType, "unavailable");
  assert.deepEqual(toutFreshFruit.allergens ?? [], []);

  assert.ok(toutOvernightOats);
  assert.deepEqual([...toutOvernightOats.allergens].sort(), [
    "gluten",
    "tree-nut",
  ]);

  assert.ok(vanLeeuwenHotFudge);
  assert.equal(vanLeeuwenHotFudge.description, undefined);
  assert.deepEqual(vanLeeuwenHotFudge.allergens ?? [], ["tree-nut"]);
  assert.equal(vanLeeuwenHotFudge.sourceSummary, "contains coconut");

  assert.ok(vanLeeuwenVeganCookieDough);
  assert.equal(vanLeeuwenVeganCookieDough.description, undefined);
  assert.deepEqual([...vanLeeuwenVeganCookieDough.allergens].sort(), [
    "soy",
    "tree-nut",
    "wheat",
  ]);

  assert.ok(sweetLeafCageFreeEgg);
  assert.deepEqual(sweetLeafCageFreeEgg.allergens ?? [], ["egg"]);

  assert.ok(sweetLeafBerryBlanco);
  assert.equal(
    /Order Now/i.test(sweetLeafBerryBlanco.description ?? ""),
    false,
  );
  assert.deepEqual(sweetLeafBerryBlanco.allergens ?? [], ["tree-nut"]);

  assert.ok(maggianosKidsMilk);
  assert.deepEqual(maggianosKidsMilk.allergens ?? [], ["milk"]);

  assert.ok(maggianosRavioli);
  assert.deepEqual([...maggianosRavioli.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(maggianosNoCheeseAsparagus);
  assert.deepEqual(maggianosNoCheeseAsparagus.allergens ?? [], []);

  assert.ok(fishTacoQueso);
  assert.deepEqual(fishTacoQueso.allergens ?? [], ["milk"]);

  assert.ok(fishTacoFlourQuesadilla);
  assert.deepEqual([...fishTacoFlourQuesadilla.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(choptCoconutChiller);
  assert.deepEqual(choptCoconutChiller.allergens ?? [], ["tree-nut"]);

  assert.ok(choptBlueCheese);
  assert.deepEqual(choptBlueCheese.allergens ?? [], ["milk"]);

  assert.ok(rasaCoconutGinger);
  assert.deepEqual(rasaCoconutGinger.allergens ?? [], ["tree-nut"]);

  assert.equal(
    sweetgreen?.items.some((item) => item.id === "contains-tree-nuts"),
    false,
  );
});

test("generated second-pass reviewed repairs remove template prose and global allergen smears", () => {
  const stJames = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "st-james-dc",
  );
  const mangoSorbet = stJames?.items.find(
    (item) => item.id === "desserts-mango-sorbet",
  );
  const huTieu = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "hu-tieu-mi-lacay-cho-lon-falls-church-va",
  );
  const huTieuLacay = huTieu?.items.find((item) => item.id === "hu-tieu-lacay");
  const fourSisters = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "four-sisters-grill-arlington-va",
  );
  const northside = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "northside-social-va",
  );
  const charley = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "charley-chesapeake-chophouse-gaithersburg-md",
  );
  const mamaTigre = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "mama-tigre-oakton-va",
  );
  const masalaFries = mamaTigre?.items.find(
    (item) => item.id === "masala-fries",
  );

  assert.equal(
    stJames?.items.some((item) => item.id === "espresso-singledouble"),
    false,
  );
  assert.ok(mangoSorbet);
  assert.deepEqual(mangoSorbet.allergens ?? [], []);
  assert.deepEqual(mangoSorbet.mayContain?.sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "peanut",
    "shellfish",
    "soy",
    "tree-nut",
    "wheat",
  ]);

  assert.ok(huTieuLacay);
  assert.equal(
    /reviewer|well-rounded selection/i.test(huTieuLacay.description ?? ""),
    false,
  );
  assert.equal(
    fourSisters?.items.some((item) =>
      [
        "rice",
        "soups",
        "traditional-vietnamese-noodle-soup-with-a-delicate-broth",
      ].includes(item.id),
    ),
    false,
  );
  assert.equal(
    northside?.items.some((item) => ["dog-bones", "pesto"].includes(item.id)),
    false,
  );
  assert.equal(
    charley?.items.some(
      (item) => item.id === "5-spice-pork-shoulder-and-crispy-rice-3",
    ),
    false,
  );
  assert.ok(masalaFries);
  assert.equal(
    /WHITE WINE|RED WINE/i.test(masalaFries.description ?? ""),
    false,
  );
  assert.equal(
    masalaFries.inferredAllergenSignals?.some((signal) => signal.id === "milk"),
    true,
  );
});

test("generated low-official-coverage repairs keep only row-backed official allergens", () => {
  const busboys = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "busboys-and-poets-dc",
  );
  const busboysCaesar = busboys?.items.find(
    (item) => item.id === "caesar-salad",
  );
  const busboysBrussels = busboys?.items.find(
    (item) => item.id === "crispy-brussels-sprouts",
  );
  const busboysBagelLox = busboys?.items.find(
    (item) => item.id === "bagel-w-lox",
  );
  const busboysCrabCakes = busboys?.items.find(
    (item) => item.id === "crab-cakes",
  );
  const busboysFalafel = busboys?.items.find((item) => item.id === "falafel");
  const busboysVeganTuna = busboys?.items.find(
    (item) => item.id === "vegan-tuna-salad",
  );
  const busboysVeganBurger = busboys?.items.find(
    (item) => item.id === "vegan-burger",
  );
  const busboysShrimpCrabFritters = busboys?.items.find(
    (item) => item.id === "shrimp-and-crab-fritters",
  );
  const busboysPecanPie = busboys?.items.find(
    (item) => item.id === "mini-pecan-pie",
  );
  const busboysVeganBbqBeef = busboys?.items.find(
    (item) => item.id === "vegan-bbq-beef-sandwich",
  );
  const busboysShrimpGrits = busboys?.items.find(
    (item) => item.id === "shrimp-and-grits",
  );
  const busboysVeganEggWrap = busboys?.items.find(
    (item) => item.id === "vegan-egg-wrap",
  );
  const dukes = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "dukes-grocery-dupont-dc",
  );
  const dukesWings = dukes?.items.find(
    (item) => item.id === "12-dozen-hackney-chicken-wings",
  );
  const dukesBanhMi = dukes?.items.find((item) => item.id === "banh-mi");
  const dukesCubano = dukes?.items.find(
    (item) => item.id === "cubano-torta-milanesa",
  );
  const dukesFishChips = dukes?.items.find(
    (item) => item.id === "fish-and-chips",
  );
  const dukesImpossibleBurger = dukes?.items.find(
    (item) => item.id === "impossible-burger",
  );
  const dukesTunaMelt = dukes?.items.find(
    (item) => item.id === "mums-tuna-melt",
  );
  const dukesSalmonCroquettes = dukes?.items.find(
    (item) => item.id === "salmon-croquettes",
  );
  const dukesSpicyAubergine = dukes?.items.find(
    (item) => item.id === "spicy-aubergine",
  );
  const dukesMacCheese = dukes?.items.find(
    (item) => item.id === "white-truffle-mac-and-cheese",
  );
  const lapis = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "lapis-dc",
  );
  const lapisAushak = lapis?.items.find((item) => item.id === "aushak");
  const lapisBeets = lapis?.items.find((item) => item.id === "beets");
  const lapisBolani = lapis?.items.find((item) => item.id === "bolani-brunch");
  const lapisHalwa = lapis?.items.find((item) => item.id === "halwa-soji");
  const lapisMahee = lapis?.items.find((item) => item.id === "mahee");
  const lapisShrimp = lapis?.items.find((item) => item.id === "mantoo-shrimp");
  const lapisPistachioCake = lapis?.items.find(
    (item) => item.id === "pistachio-cake",
  );
  const lapisSambosa = lapis?.items.find((item) => item.id === "sambosa-trio");
  const lapisSheerBerenj = lapis?.items.find(
    (item) => item.id === "sheer-berenj",
  );
  const lapisDumplings = lapis?.items.find((item) => item.id === "dumplings");
  const yellow = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "yellow-georgetown-dc",
  );
  const yellowLambShoulder = yellow?.items.find(
    (item) => item.id === "bbq-lamb-shoulder",
  );
  const yellowSpringOnionLabne = yellow?.items.find(
    (item) => item.id === "charred-spring-onion-labne",
  );
  const yellowClassicHummus = yellow?.items.find(
    (item) => item.id === "classic-hummus",
  );
  const yellowFalafel = yellow?.items.find(
    (item) => item.id === "crispy-falafel",
  );
  const yellowFattoush = yellow?.items.find((item) => item.id === "fattoush");
  const yellowPitas = yellow?.items.find((item) => item.id === "pitas");
  const yellowPainSuisse = yellow?.items.find(
    (item) => item.id === "potato-kashkaval-pain-suisse",
  );
  const yellowSmokedFishLabne = yellow?.items.find(
    (item) => item.id === "smoked-fish-labne",
  );
  const yellowDanish = yellow?.items.find(
    (item) => item.id === "spinach-pine-nut-danish",
  );
  const yellowTroutKaak = yellow?.items.find(
    (item) => item.id === "urfa-thing-smoked-trout-kaak",
  );
  const yellowPitaPack = yellow?.items.find(
    (item) => item.id === "wood-fired-pita-6-pk",
  );
  const baanSiamReviewed = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "baan-siam-dc",
  );
  const baanPadChaShrimp = baanSiamReviewed?.items.find(
    (item) => item.id === "pad-cha-shrimp",
  );
  const baanMassaman = baanSiamReviewed?.items.find(
    (item) => item.id === "beef-massaman-curry",
  );
  const baanFriedRiceEgg = baanSiamReviewed?.items.find(
    (item) => item.id === "chicken-and-basil-fried-rice-w-thai-style-fried-egg",
  );
  const baanTapiocaDumplings = baanSiamReviewed?.items.find(
    (item) => item.id === "chicken-tapioca-dumplings",
  );
  const baanCoconutGriddle = baanSiamReviewed?.items.find(
    (item) => item.id === "coconut-milk-griddle-snac",
  );
  const baanCoconutSoup = baanSiamReviewed?.items.find(
    (item) => item.id === "coconut-soup-with-chicken",
  );
  const baanCrabRice = baanSiamReviewed?.items.find(
    (item) => item.id === "crab-paste-fried-rice-with-crab-meat",
  );
  const baanTempuraPumpkin = baanSiamReviewed?.items.find(
    (item) => item.id === "deep-fried-asian-pumpkin",
  );
  const baanBranzino = baanSiamReviewed?.items.find(
    (item) => item.id === "ginger-branzino",
  );
  const baanGreenMango = baanSiamReviewed?.items.find(
    (item) => item.id === "green-mango-salad",
  );
  const baanKhaoSoi = baanSiamReviewed?.items.find(
    (item) => item.id === "khao-soi-gai",
  );
  const baanFriedRiceTofu = baanSiamReviewed?.items.find(
    (item) => item.id === "mixed-vegetable-fried-rice-with-tofu-vegetarian",
  );
  const baanTomYumSoup = baanSiamReviewed?.items.find(
    (item) =>
      item.id === "tom-yum-noodle-soup-wroasted-pork-and-ground-chicken",
  );
  const purplePatch = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "purple-patch-dc",
  );
  const purpleLechon = purplePatch?.items.find(
    (item) => item.id === "lechon-kawali",
  );
  const purpleBiko = purplePatch?.items.find((item) => item.id === "biko");
  const purpleCassavaCake = purplePatch?.items.find(
    (item) => item.id === "cassava-cake",
  );
  const purpleBrazo = purplePatch?.items.find(
    (item) => item.id === "brazo-de-mercedes",
  );
  const purpleAlimasagRice = purplePatch?.items.find(
    (item) => item.id === "alimasag-fried-rice",
  );
  const purpleCauliflowerAdobo = purplePatch?.items.find(
    (item) => item.id === "cauliflower-adobo",
  );
  const purpleBicolExpress = purplePatch?.items.find(
    (item) => item.id === "bicol-express",
  );
  const daikaya = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "daikaya-dc",
  );
  const daikayaFriedGarlic = daikaya?.items.find(
    (item) => item.id === "fried-confit-garlic-cloves",
  );
  const daikayaHarami = daikaya?.items.find(
    (item) => item.id === "harami-beef-dollar16-2-skewers",
  );
  const daikayaNatto = daikaya?.items.find((item) => item.id === "natto-gohan");
  const daikayaSpicySesame = daikaya?.items.find(
    (item) => item.id === "spicy-seseame-hiyashi-chuka",
  );
  const daikayaCatfish = daikaya?.items.find(
    (item) => item.id === "catfish-karaage",
  );
  const daikayaShoyu = daikaya?.items.find((item) => item.id === "shoyu");
  const daikayaSoftServe = daikaya?.items.find(
    (item) => item.id === "soft-serve-with-matcha-mochi",
  );
  const bantamKing = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "bantam-king-dc",
  );
  const bantamKohi = bantamKing?.items.find((item) => item.id === "kohi-time");
  const bantamCookie = bantamKing?.items.find(
    (item) => item.id === "big-fat-chocolate-chip-cookie",
  );
  const bantamNaruto = bantamKing?.items.find((item) => item.id === "naruto");
  const bantamNitamago = bantamKing?.items.find(
    (item) => item.id === "nitamago",
  );
  const bantamGyoza = bantamKing?.items.find((item) => item.id === "gyoza");
  const bantamDrippings = bantamKing?.items.find(
    (item) => item.id === "rice-with-chicken-drippings",
  );
  const bantamOnsenRice = bantamKing?.items.find(
    (item) => item.id === "rice-with-onsen-egg",
  );
  const bantamSpicyMiso = bantamKing?.items.find(
    (item) => item.id === "spicy-miso",
  );
  const bantamVeggieTantanmen = bantamKing?.items.find(
    (item) => item.id === "veggie-tantanmen",
  );
  const bantamMochiIceCream = bantamKing?.items.find(
    (item) => item.id === "mochi-ice-cream",
  );
  const bantamCurrySnowPlate = bantamKing?.items.find(
    (item) => item.id === "curry-snow-fried-chicken-plate",
  );
  const yourOnlyFriend = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "your-only-friend-dc",
  );
  const yofAtlanticBeachPie = yourOnlyFriend?.items.find(
    (item) => item.id === "atlantic-beach-pie",
  );
  const yofButterfinger = yourOnlyFriend?.items.find(
    (item) => item.id === "butterfinger-banana-puddin",
  );
  const yofDopeBeetz = yourOnlyFriend?.items.find(
    (item) => item.id === "dope-beetz-sort-a-salad",
  );
  const yofFishFryday = yourOnlyFriend?.items.find(
    (item) => item.id === "fish-fryday",
  );
  const yofHotFish = yourOnlyFriend?.items.find(
    (item) => item.id === "hot-fish",
  );
  const yofHotNug = yourOnlyFriend?.items.find((item) => item.id === "hot-nug");
  const yofSpicyPavo = yourOnlyFriend?.items.find(
    (item) => item.id === "spicy-panes-con-pavo",
  );
  const taqueriaHabanero = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "taqueria-habanero-dc",
  );
  const thCamarones = taqueriaHabanero?.items.find(
    (item) => item.id === "camarones-enchipotlados",
  );
  const thChilaquiles = taqueriaHabanero?.items.find(
    (item) => item.id === "chilaquiles",
  );
  const thChileRelleno = taqueriaHabanero?.items.find(
    (item) => item.id === "chile-relleno-burrito",
  );
  const thChoriqueso = taqueriaHabanero?.items.find(
    (item) => item.id === "choriqueso-torta",
  );
  const thFajitaMixta = taqueriaHabanero?.items.find(
    (item) => item.id === "fajita-mixta",
  );
  const thScallopTaco = taqueriaHabanero?.items.find(
    (item) => item.id === "scallop-taco-3-per-order",
  );
  const thSideMole = taqueriaHabanero?.items.find(
    (item) => item.id === "side-of-mole",
  );
  const thSideShrimp = taqueriaHabanero?.items.find(
    (item) => item.id === "side-of-shrimp",
  );
  const thTacoTray = taqueriaHabanero?.items.find(
    (item) => item.id === "taco-tray",
  );
  const thTresLeches = taqueriaHabanero?.items.find(
    (item) => item.id === "tres-leches-con-pina",
  );
  const baklawa = yellow?.items.find((item) => item.id === "baklawa");
  const playa = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "playa-bowls-dc",
  );
  const pastis = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "pastis-dc",
  );
  const pastisBarSteak = pastis?.items.find(
    (item) => item.id === "steak-frites-bar-steak",
  );
  const pastisSeafoodPlateau = pastis?.items.find(
    (item) => item.id === "fruits-de-mer-plat-de-fruits-de-mer",
  );
  const pastisCroissant = pastis?.items.find(
    (item) => item.id === "viennoiserie-croissant",
  );
  const pastisChickenSandwich = pastis?.items.find(
    (item) => item.id === "salades-et-sandwiches-grilled-chicken-sandwich",
  );
  const pastisStickyToffee = pastis?.items.find(
    (item) => item.id === "dessert-sticky-toffee-pudding",
  );
  const elPresidente = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "el-presidente-dc",
  );
  const tacosAlCarbon = elPresidente?.items.find(
    (item) => item.id === "tacos-al-carbon",
  );
  const elPresidenteCrabGuacamole = elPresidente?.items.find(
    (item) => item.category === "Guacamole" && item.name === "El Presidente",
  );
  const elPresidenteCaesar = elPresidente?.items.find(
    (item) =>
      item.category === "Appetizers" && item.name === "Tijuana Caesar Salad",
  );
  const elPresidenteQuesoFundido = elPresidente?.items.find(
    (item) => item.category === "Appetizers" && item.name === "Queso Fundido",
  );
  const elPresidenteFriedChickenTorta = elPresidente?.items.find(
    (item) =>
      item.category === "Especialidades" && item.name === "Fried Chicken Torta",
  );
  const elPresidenteSundae = elPresidente?.items.find(
    (item) =>
      item.category === "Desserts" && item.name === "El Presidente Sundae",
  );
  const cane = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "cane-dc",
  );
  const banditTaco = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "bandit-taco-dc",
  );
  const banditQueso = banditTaco?.items.find(
    (item) => item.id === "chips-and-queso",
  );
  const banditNachos = banditTaco?.items.find(
    (item) => item.id === "nachoschoose-protein",
  );
  const banditBreakfastTaco = banditTaco?.items.find(
    (item) => item.id === "bacon-and-egg-taco-until-3pm",
  );
  const banditFishTaco = banditTaco?.items.find(
    (item) => item.id === "baja-fish-taco",
  );
  const banditShrimpTaco = banditTaco?.items.find(
    (item) => item.id === "crispy-shrimp-taco",
  );
  const banditTorta = banditTaco?.items.find(
    (item) => item.id === "adobo-chicken-torta",
  );
  const banditTresLeches = banditTaco?.items.find(
    (item) => item.id === "tres-leches",
  );
  const banditVeggieTaco = banditTaco?.items.find(
    (item) => item.id === "veggie-taco",
  );
  const maman = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "maman-georgetown-dc",
  );
  const mamanCaitlinsWrap = maman?.items.find(
    (item) => item.id === "caitlins-breakfast-wrap",
  );
  const mamanLalitasWrap = maman?.items.find(
    (item) => item.id === "lalitas-garden-wrap",
  );
  const mamanCaesarWrap = maman?.items.find(
    (item) => item.id === "maries-chicken-caesar-wrap",
  );
  const mamanSalmonCroissant = maman?.items.find(
    (item) => item.id === "andreas-smoked-salmon-croissant-sandwich",
  );
  const mamanGreenGoddess = maman?.items.find(
    (item) => item.id === "olivias-green-goddess-bowl",
  );
  const mamanBreakfastSandwich = maman?.items.find(
    (item) => item.id === "mamans-breakfast-sandwich",
  );
  const mamanTahiniLatte = maman?.items.find(
    (item) => item.id === "hot-salted-tahini-honeycomb-latte",
  );
  const mamanVeganGfZucchini = maman?.items.find(
    (item) => item.id === "vegan-gluten-free-zucchini-bread",
  );
  const baanSiam = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "baan-siam-dc",
  );
  const cuttlefish = baanSiam?.items.find(
    (item) => item.id === "stir-fried-cuttlefish-with-chili-paste",
  );
  const ilCanale = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "il-canale-dc",
  );
  const branzino = ilCanale?.items.find(
    (item) => item.id === "branzino-al-cartoccio-siciliano",
  );
  const calamari = ilCanale?.items.find(
    (item) => item.id === "calamari-fritti",
  );
  const rolleDiPollo = ilCanale?.items.find(
    (item) => item.id === "rolle-di-pollo",
  );
  const ilCanaleMarinara = ilCanale?.items.find(
    (item) => item.id === "marinara-no-cheese",
  );
  const ilCanaleGlutenFreePizza = ilCanale?.items.find(
    (item) => item.id === "gluten-free-margherita-pizza",
  );
  const ilCanaleUovo = ilCanale?.items.find(
    (item) => item.id === "uovo-al-tegamino",
  );
  const ilCanaleFocaccia = ilCanale?.items.find(
    (item) => item.id === "focaccia-del-pizzaiolo",
  );
  const ilCanaleLobsterRavioli = ilCanale?.items.find(
    (item) => item.id === "lobster-ravioli",
  );
  const ilCanaleTortaSiciliana = ilCanale?.items.find(
    (item) => item.id === "torta-siciliana",
  );
  const ilCanaleTunnarella = ilCanale?.items.find(
    (item) => item.id === "tunnarella",
  );
  const osteriaMozza = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osteria-mozza-dc",
  );
  const coniDiPizza = osteriaMozza?.items.find(
    (item) => item.id === "coni-di-pizza",
  );
  const mozzarella = osteriaMozza?.items.find(
    (item) => item.id === "mozzarella",
  );
  const kizuna = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "kizuna-sushi-ramen-tysons-va",
  );
  const chiko = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "chiko-dc",
  );
  const chikoNoodles = chiko?.items.find(
    (item) => item.id === "cumin-lamb-stir-fry",
  );
  const chikoShrimp = chiko?.items.find(
    (item) => item.id === "garlic-shrimp-dumpling",
  );
  const chikoPop = chiko?.items.find((item) => item.id === "chiko-pop");
  const chikoFullMonty = chiko?.items.find((item) => item.id === "full-monty");
  const chikoGfGarden = chiko?.items.find(
    (item) => item.id === "gf-korean-garden-noodles",
  );
  const muncheez = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "muncheez-dc",
  );
  const muncheezAdwani = muncheez?.items.find((item) => item.id === "adwani");
  const muncheezHummus = muncheez?.items.find((item) => item.id === "hummus");
  const muncheezKibbeh = muncheez?.items.find((item) => item.id === "kibbeh");
  const muncheezNutellaCrepe = muncheez?.items.find(
    (item) => item.id === "nutella-crepe",
  );
  const muncheezGrapeLeaves = muncheez?.items.find(
    (item) => item.id === "grape-leaves",
  );
  const peetsDmv = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "peets-coffee-dmv",
  );
  const peetsChain = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "chain-peet-s-coffee",
  );
  const peetsBrioche = peetsDmv?.items.find(
    (item) => item.id === "bacon-and-cheddar-brioche",
  );
  const peetsOatLatte = peetsDmv?.items.find(
    (item) => item.id === "protein-banana-cold-brew-oat-latte",
  );
  const peetsMatchaProtein = peetsDmv?.items.find(
    (item) => item.id === "protein-banana-matcha-oat-latte",
  );
  const peetsPlantBased = peetsDmv?.items.find(
    (item) => item.id === "everything-plant-based-sandwich",
  );
  const dailyProvisions = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "daily-provisions-dupont-dc",
  );
  const dailyBroccoliMelt = dailyProvisions?.items.find(
    (item) => item.id === "broccoli-mushroom-melt",
  );
  const dailyChickenSausageEgg = dailyProvisions?.items.find(
    (item) => item.id === "chicken-sausage-egg-and-cheese",
  );
  const dailyChefyMarket = dailyProvisions?.items.find(
    (item) => item.id === "the-chefy-market-salad",
  );
  const dailyGoldilox = dailyProvisions?.items.find(
    (item) => item.id === "the-goldilox",
  );
  const dailyTunaMelt = dailyProvisions?.items.find(
    (item) => item.id === "tuna-melt",
  );
  const dailyCaesar = dailyProvisions?.items.find(
    (item) => item.id === "kale-caesar-salad",
  );
  const twoFifty = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "two-fifty-bbq-dc",
  );
  const zestyGarden = twoFifty?.items.find(
    (item) => item.id === "zesty-garden-mix",
  );
  const twoFiftyMac = twoFifty?.items.find(
    (item) => item.id === "mac-n-cheese",
  );
  const twoFiftyChimichurri = twoFifty?.items.find(
    (item) => item.id === "chimichurri-sauce",
  );
  const twoFiftyRiceBeans = twoFifty?.items.find(
    (item) => item.id === "rice-and-beans",
  );
  const twoFiftyToast = twoFifty?.items.find(
    (item) => item.id === "4-slices-of-texas-toast",
  );
  const twoFiftyPorkSandwich = twoFifty?.items.find(
    (item) => item.id === "pulled-pork-sandwich",
  );
  const filomena = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "filomena-dc",
  );
  const filomenaOil = filomena?.items.find(
    (item) => item.id === "virgin-olive-oil-and-balsamic",
  );
  const dosToros = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "dos-toros-dc",
  );
  const sourCream = dosToros?.items.find(
    (item) => item.id === "toppings-sour-cream",
  );
  const elViejo = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "el-viejo-silver-spring",
  );
  const horchata = elViejo?.items.find(
    (item) => item.id === "central-american-horchata",
  );
  const elViejoBaleada = elViejo?.items.find(
    (item) => item.id === "central-american-baleada",
  );
  const elViejoPanGuanaco = elViejo?.items.find(
    (item) => item.id === "central-american-pan-guanaco",
  );
  const elViejoPescado = elViejo?.items.find(
    (item) => item.id === "central-american-pescado-frito",
  );
  const elViejoTamalElote = elViejo?.items.find(
    (item) => item.id === "central-american-tamal-de-elote",
  );
  const tapori = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "tapori-dc",
  );
  const taporiButterChicken = tapori?.items.find(
    (item) => item.id === "rice-entrees-butter-chicken",
  );
  const taporiCheesecake = tapori?.items.find(
    (item) => item.id === "desserts-rasmalai-cheesecake",
  );
  const taporiCrabIdli = tapori?.items.find(
    (item) => item.id === "rice-entrees-maryland-blue-crab-idli",
  );
  const taporiNaan = tapori?.items.find(
    (item) => item.id === "rice-entrees-tapori-naan",
  );
  const taporiShrimp = tapori?.items.find(
    (item) => item.id === "small-plates-tiger-shrimp-khichdi",
  );
  const taporiVadaPav = tapori?.items.find(
    (item) => item.id === "rice-entrees-vada-pav",
  );
  const gregorys = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "gregorys-coffee-dc",
  );
  const gregorysDeluxe = gregorys?.items.find(
    (item) => item.id === "food-the-deluxe",
  );
  const gregorysVeganDeluxe = gregorys?.items.find(
    (item) => item.id === "food-vegan-deluxe-v",
  );
  const gregorysVeganBar = gregorys?.items.find(
    (item) => item.id === "food-vegan-bar-gf-v",
  );
  const gregorysProteinCoffee = gregorys?.items.find(
    (item) => item.id === "coffee-protein-coffee",
  );
  const bonFresco = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "bon-fresco-rockville-dc-metro",
  );
  const bonFrescoCaesar = bonFresco?.items.find(
    (item) => item.id === "salads-caesar-salad",
  );
  const bonFrescoMozz = bonFresco?.items.find(
    (item) => item.id === "sandwiches-mozzarella-and-tomato",
  );
  const bonFrescoTuna = bonFresco?.items.find(
    (item) => item.id === "sandwiches-tuna-salad-sandwich",
  );
  const bonFrescoVeggie = bonFresco?.items.find(
    (item) => item.id === "sandwiches-grilled-veggie",
  );
  const bonFrescoMediterranean = bonFresco?.items.find(
    (item) => item.id === "salads-mediterranean-salad",
  );
  const occidental = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "occidental-dc",
  );
  const caviar = occidental?.items.find(
    (item) => item.id === "caviar-petrossian-tsar-imperial-baika",
  );
  const iceCream = occidental?.items.find(
    (item) => item.id === "desserts-ice-cream-sherbert-and-sorbet",
  );
  const burtons = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "burtons-grill-and-bar-washington-dc-dc-metro",
  );
  const burtonsFirecracker = burtons?.items.find(
    (item) => item.id === "firecracker-shrimp",
  );
  const ikea = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "ikea-restaurant-college-park-md-dc-metro",
  );
  const planta = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "planta-bethesda-bethesda-md-dc-metro",
  );
  const guajillo = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-guajillo-2563891113",
  );
  const guajilloMole = guajillo?.items.find(
    (item) => item.id === "award-winning-mole-poblano-with-grilled-chicken",
  );
  const karahi = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-karahi-boys-13475305897",
  );
  const butterNaan = karahi?.items.find((item) => item.id === "butter-naan");
  const northside = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "northside-social-va",
  );
  const northsideGranola = northside?.items.find(
    (item) => item.id === "house-made-granola",
  );
  const stJames = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "st-james-dc",
  );
  const macaroniPie = stJames?.items.find(
    (item) => item.id === "sides-macaroni-pie",
  );
  const phoHaiDuong = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "pho-hai-duong-tysons-va",
  );
  const goiCuon = phoHaiDuong?.items.find((item) => item.id === "goi-cuon");
  const chaGio = phoHaiDuong?.items.find((item) => item.id === "cha-gio");
  const soko = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "soko-butcher-dc-metro",
  );
  const sokoYellowfin = soko?.items.find((item) => item.id === "yellowfin");
  const sokoMurrays = soko?.items.find((item) => item.id === "murrays");
  const sokoCowboy = soko?.items.find((item) => item.id === "the-cowboy");
  const sokoPlainPatty = soko?.items.find(
    (item) => item.id === "beef-hamburger-patty-8oz",
  );
  const gracesMandarin = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "grace-s-mandarin-washington-dc-dc-metro",
  );
  const gracesCaliforniaRoll = gracesMandarin?.items.find(
    (item) => item.id === "california-roll",
  );
  const gracesChesapeakeRoll = gracesMandarin?.items.find(
    (item) => item.id === "chesapeake-roll",
  );
  const gracesGoldenShrimpRoll = gracesMandarin?.items.find(
    (item) => item.id === "golden-shrimp-roll",
  );
  const gracesThaiStreetNoodle = gracesMandarin?.items.find(
    (item) => item.id === "thai-street-noodle",
  );
  const gracesVegetarianMedley = gracesMandarin?.items.find(
    (item) => item.id === "vegetarian-medley",
  );
  const gracesWhiteRice = gracesMandarin?.items.find(
    (item) => item.id === "white-rice",
  );
  const boulangerieChristophe = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "boulangerie-christophe-washington-dc-dc-metro",
  );
  const boulangerieAppleTartelette = boulangerieChristophe?.items.find(
    (item) => item.id === "apple-tartelette",
  );
  const boulangerieCafeAuLait = boulangerieChristophe?.items.find(
    (item) => item.id === "cafe-au-lait-12-oz",
  );
  const boulangerieMacaron = boulangerieChristophe?.items.find(
    (item) => item.id === "macaron",
  );
  const boulangerieDripCoffee = boulangerieChristophe?.items.find(
    (item) => item.id === "drip-coffee-12-oz",
  );
  const boulangerieQuicheLorraine = boulangerieChristophe?.items.find(
    (item) => item.id === "quiche-lorraine",
  );
  const genkiIzakaya = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "genki-izakaya-fairfax-va-dc-metro",
  );
  const genkiWagyu = genkiIzakaya?.items.find(
    (item) => item.id === "a5-wagyu-1-pc",
  );
  const genkiAlaskaRoll = genkiIzakaya?.items.find(
    (item) => item.id === "alaska-roll",
  );
  const genkiShrimpTempuraRoll = genkiIzakaya?.items.find(
    (item) => item.id === "shrimp-tempura-roll",
  );
  const genkiPhillyRoll = genkiIzakaya?.items.find(
    (item) => item.id === "philly-roll",
  );
  const genkiTonkotsuRamen = genkiIzakaya?.items.find(
    (item) => item.id === "tonkotsu-ramen",
  );
  const genkiYakiUdon = genkiIzakaya?.items.find(
    (item) => item.id === "yaki-udon",
  );
  const genkiAacRoll = genkiIzakaya?.items.find(
    (item) => item.id === "aac-roll",
  );
  const dogwoodTavern = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "dogwood-tavern-falls-church-va-dc-metro",
  );
  const dogwoodBuddhaBowl = dogwoodTavern?.items.find(
    (item) => item.id === "buddha-bowl",
  );
  const dogwoodNachos = dogwoodTavern?.items.find(
    (item) => item.id === "heaping-nachos",
  );
  const dogwoodCarneAsada = dogwoodTavern?.items.find(
    (item) => item.id === "carne-asada-platter",
  );
  const dogwoodAppleChickenSalad = dogwoodTavern?.items.find(
    (item) => item.id === "apple-and-chicken-salad",
  );
  const dogwoodFriedChickenSandwich = dogwoodTavern?.items.find(
    (item) => item.id === "buttermilk-fried-chicken-sandwich",
  );
  const helloBetty = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "hello-betty-north-bethesda-md",
  );
  const helloBettyAlfredo = helloBetty?.items.find(
    (item) => item.id === "alfredo-pasta",
  );
  const helloBettyAvocadoToast = helloBetty?.items.find(
    (item) => item.id === "avocado-toast",
  );
  const helloBettySoftshellCrab = helloBetty?.items.find(
    (item) => item.id === "softshell-crab-bahn-mi",
  );
  const helloBettyCoffee = helloBetty?.items.find(
    (item) => item.id === "coffee-or-tea",
  );
  const helloBettyVanillaGelato = helloBetty?.items.find(
    (item) => item.id === "vanilla-gelato",
  );
  const moes = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "moes-southwest-grill",
  );
  const moesQueso = moes?.items.find((item) => item.id === "moes-famous-queso");
  const moesDippers = moes?.items.find(
    (item) => item.id === "grilled-burrito-dippers-2-ct",
  );
  const moesChipsDips = moes?.items.find(
    (item) => item.id === "chips-and-dips-trio",
  );
  const moesKidsMilk = moes?.items.find((item) => item.id === "kids-milk");
  const moesKidsTaco = moes?.items.find((item) => item.id === "kids-taco");
  const moesCookie = moes?.items.find(
    (item) => item.id === "sweet-street-chocolate-chunk-cookie",
  );
  const moesWater = moes?.items.find((item) => item.id === "bottled-water");
  const moesTacoValuePack = moes?.items.find(
    (item) => item.id === "taco-value-pack",
  );
  const gemini = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "gemini-dc",
  );
  const geminiChocolateCake = gemini?.items.find(
    (item) => item.id === "chocolate-cake",
  );
  const geminiCashewBrittle = gemini?.items.find(
    (item) => item.id === "dark-chocolate-and-cashew-honeycomb-brittle",
  );
  const geminiMintChip = gemini?.items.find((item) => item.id === "mint-chip");
  const geminiPuppyChow = gemini?.items.find(
    (item) => item.id === "chocobanana-and-puppy-chow",
  );
  const peterChang = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "peter-chang-mclean-va",
  );
  const peterSesameNoodle = peterChang?.items.find(
    (item) => item.id === "tg-sesame-paste-cold-rice-noodle",
  );
  const peterEggTofu = peterChang?.items.find(
    (item) => item.id === "basil-eggplant-w-egg-tofu",
  );
  const tigerDumplings = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "tiger-dumplings-arlington-va",
  );
  const chengduChicken = tigerDumplings?.items.find(
    (item) => item.id === "chengdu-chili-oil-chicken",
  );
  const hawaiianFriedRice = tigerDumplings?.items.find(
    (item) => item.id === "hawaiian-style-fried-rice",
  );
  const elPolloRico = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "el-pollo-rico-arlington-va",
  );
  const partyColeslaw = elPolloRico?.items.find(
    (item) => item.id === "party-size-coleslaw",
  );
  const partyRedBeans = elPolloRico?.items.find(
    (item) => item.id === "party-size-red-beans",
  );
  const carvelIceCream = elPolloRico?.items.find(
    (item) => item.id === "carvel-ice-cream",
  );
  const firenzesGelato = elPolloRico?.items.find(
    (item) => item.id === "firenzes-artisanal-gelato",
  );
  const mediumGreenSauce = elPolloRico?.items.find(
    (item) => item.id === "medium-green-sauce-cup",
  );
  const wholeChickenWhiteMeat = elPolloRico?.items.find(
    (item) => item.id === "whole-chicken-white-meat-only",
  );
  const flan = elPolloRico?.items.find((item) => item.id === "flan");
  const baanMae = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "baan-mae-dc",
  );
  const punYaw = baanMae?.items.find((item) => item.id === "pun-yaw");
  const plantaDc = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-planta-washington-dc-washington-dc",
  );
  const seasonalCheesecakePlatter = plantaDc?.items.find(
    (item) => item.id === "dessert-platters",
  );
  const laFamosa = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-la-famosa-washington-dc",
  );
  const riceAndPigeonPeas = laFamosa?.items.find(
    (item) => item.id === "rice-and-pigeon-peas",
  );
  const arrozConGandules = laFamosa?.items.find(
    (item) => item.id === "arroz-con-gandules",
  );
  const marleys = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-marley-s-bar-and-grill-hyattsville-md",
  );
  const cajunSeafoodPasta = marleys?.items.find(
    (item) => item.id === "cajun-seafood-pasta",
  );
  const shrimpAndGrits = marleys?.items.find(
    (item) => item.id === "shrimp-and-grits",
  );
  const catfishAndGrits = marleys?.items.find(
    (item) => item.id === "catfish-and-grits",
  );
  const dailyDish = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-the-daily-dish-silver-spring-md",
  );
  const dailyDishSteak = dailyDish?.items.find(
    (item) => item.id === "10-oz-prime-new-york-strip-steak",
  );
  const dailyDishCrabCake = dailyDish?.items.find(
    (item) => item.id === "crab-cake",
  );
  const dailyDishShrimp = dailyDish?.items.find(
    (item) => item.id === "shrimp-al-ajillo",
  );
  const donsak = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-donsak-thai-restaurant-washington-dc",
  );
  const donsakButterRice = donsak?.items.find(
    (item) => item.id === "butter-rice-or-regular",
  );
  const donsakCrispyChicken = donsak?.items.find(
    (item) => item.id === "crispy-chicken-over-rice",
  );
  const donsakCrab = donsak?.items.find(
    (item) => item.id === "pad-kra-pao-crab",
  );
  const donsakIsland = donsak?.items.find((item) => item.id === "100-island");
  const donsakRangoon = donsak?.items.find(
    (item) => item.id === "crab-rangoon",
  );
  const redrocks = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-redrocks-pizza-washington-dc",
  );
  const redrocksSteak = redrocks?.items.find(
    (item) => item.id === "ny-steak-and-cheese",
  );
  const purePasty = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-pure-pasty-vienna-shop-vienna-va",
  );
  const sausageRoll = purePasty?.items.find(
    (item) => item.id === "sausage-roll",
  );
  const tiki = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-tiki-on-18th-washington-dc",
  );
  const friedSiomai = tiki?.items.find((item) => item.id === "fried-siomai");
  const sunflower = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-sunflower-vegetarian-restaurant-vienna-va",
  );
  const sunflowerEdamame = sunflower?.items.find(
    (item) => item.id === "a13organic-edamame-soybeans-cold",
  );
  const sunflowerFriedChicken = sunflower?.items.find(
    (item) => item.id === "a5fried-chicken",
  );
  const sunflowerWonton = sunflower?.items.find(
    (item) => item.id === "a9spicy-organic-spinach-wonton-in-red-sauce6",
  );
  const sunflowerWontonSoup = sunflower?.items.find(
    (item) => item.id === "b2organic-spinach-wonton-soup",
  );
  const sunflowerMushrooms = sunflower?.items.find(
    (item) => item.id === "s16amazing-mushrooms-palate",
  );
  const cocineros = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-cocineros-hyattsville-md",
  );
  const cocinerosEmpanadas = cocineros?.items.find(
    (item) => item.id === "empanadas-box",
  );
  const cocinerosFlautasTray = cocineros?.items.find(
    (item) => item.id === "flautas-doradas-tray",
  );
  const cocinerosChipsGuac = cocineros?.items.find(
    (item) => item.id === "large-chips-and-guac-tray",
  );
  const cocinerosSmallChips = cocineros?.items.find(
    (item) => item.id === "small-chips-and-salsa-tray",
  );
  const cocinerosSmallGuac = cocineros?.items.find(
    (item) => item.id === "small-tray-of-chips-and-guac",
  );
  const cocinerosTostonesTray = cocineros?.items.find(
    (item) => item.id === "tostones-tray",
  );
  const lostDog = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro",
  );
  const lostDogHolyCowLess = lostDog?.items.find(
    (item) => item.id === "37-holy-cow-less",
  );
  const chefTony = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-chef-tony-s-fresh-seafood-rockville-md",
  );
  const chefTonyChoppedSalad = chefTony?.items.find(
    (item) => item.id === "chopped-salad",
  );
  const chefTonyPepperoniHemi = chefTony?.items.find(
    (item) => item.id === "cupper-pepperoni-hemi",
  );
  const chefTonyCreamOfCrab = chefTony?.items.find(
    (item) => item.id === "soup-cream-of-crab",
  );
  const chefTonySeafoodPaellaFamily = chefTony?.items.find(
    (item) => item.id === "fm-seafood-paella-family-carry-out-only",
  );
  const chefTonyCodParmesan = chefTony?.items.find(
    (item) => item.id === "cod-parmesan",
  );
  const boardAndBrew = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "the-board-and-brew-college-park-dc-metro",
  );
  const boardAmbi = boardAndBrew?.items.find(
    (item) => item.id === "ambis-adventure",
  );
  const boardBens = boardAndBrew?.items.find(
    (item) => item.id === "bens-abomination-sandwich",
  );
  const boardCheesecake = boardAndBrew?.items.find(
    (item) => item.id === "bnb-peanut-butter-white-chocolate-cheesecake",
  );
  const boardChickenQuinoa = boardAndBrew?.items.find(
    (item) => item.id === "chicken-and-quinoa-bowl",
  );
  const boardKanzu = boardAndBrew?.items.find((item) => item.id === "kanzu");
  const boardSalmon = boardAndBrew?.items.find(
    (item) => item.id === "smoked-salmon-sandwich",
  );
  const redstone = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "redstone-american-grill-washington-dc-dc-metro",
  );
  const redstoneBananaCreamPie = redstone?.items.find(
    (item) => item.id === "banana-cream-pie",
  );
  const redstoneBuffaloShrimp = redstone?.items.find(
    (item) => item.id === "buffalo-jumbo-shrimp",
  );
  const redstoneChickenLettuceWraps = redstone?.items.find(
    (item) => item.id === "chicken-lettuce-wraps",
  );
  const redstoneCheesecake = redstone?.items.find(
    (item) => item.id === "ny-style-cheesecake",
  );
  const redstoneAhiTuna = redstone?.items.find(
    (item) => item.id === "seared-ahi-tuna",
  );
  const redstoneRiceNoodles = redstone?.items.find(
    (item) => item.id === "spicy-thai-noodles",
  );
  const redstoneTempuraChicken = redstone?.items.find(
    (item) => item.id === "tempura-teriyaki-chicken",
  );
  const menomale = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "menomale-dc",
  );
  const menomaleAffettati = menomale?.items.find(
    (item) => item.id === "affettati-misti",
  );
  const menomaleTiramisu = menomale?.items.find(
    (item) => item.id === "tiramisu",
  );
  const menomaleRoastedEggplantTray = menomale?.items.find(
    (item) => item.id === "roasted-eggplant-full-tray",
  );
  const menomaleInsalataPesce = menomale?.items.find(
    (item) => item.id === "insalata-di-pesce",
  );
  const menomaleVerdone = menomale?.items.find(
    (item) => item.id === "verdone-pizza",
  );
  const menomaleRomanaFull = menomale?.items.find(
    (item) => item.id === "romana-alla-romana-full-tray",
  );
  const menomaleFarro = menomale?.items.find(
    (item) => item.id === "farro-with-your-choice-of-protein",
  );
  const menomalePolloVerde = menomale?.items.find(
    (item) => item.id === "pollo-verde-panuozzo",
  );
  const menomaleEggplantParm = menomale?.items.find(
    (item) => item.id === "eggplant-parm",
  );
  const menomaleFrittoMare = menomale?.items.find(
    (item) => item.id === "fritto-di-mare",
  );
  const northsideMenu = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "northside-social-va",
  );
  const northsideChips = northsideMenu?.items.find(
    (item) => item.id === "bag-of-chips",
  );
  const northsideCrackers = northsideMenu?.items.find(
    (item) => item.id === "bag-of-sesame-crackers",
  );
  const northsideAvocadoToast = northsideMenu?.items.find(
    (item) => item.id === "avocado-toast",
  );
  const northsideSalmonSalad = northsideMenu?.items.find(
    (item) => item.id === "baked-salmon-salad",
  );
  const northsideBlt = northsideMenu?.items.find(
    (item) => item.id === "the-blt",
  );
  const northsideGrilledCheese = northsideMenu?.items.find(
    (item) => item.id === "the-grilled-cheese",
  );
  const northsideArnoldPalmer = northsideMenu?.items.find(
    (item) => item.id === "arnold-palmer",
  );
  const northsideMatchaLatte = northsideMenu?.items.find(
    (item) => item.id === "matcha-latte",
  );
  const northsideNosoMatcha = northsideMenu?.items.find(
    (item) => item.id === "noso-signature-matcha-latte",
  );
  const northsideHotCoffee = northsideMenu?.items.find(
    (item) => item.id === "hot-coffee-with-steamed-milk",
  );
  const northsideSaladBowl = northsideMenu?.items.find(
    (item) => item.id === "take-home-large-salad-bowl",
  );
  const hisAndHers = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-his-and-hers-washington-dc",
  );
  const hisAndHersAvocadoToast = hisAndHers?.items.find(
    (item) => item.id === "avocado-toast",
  );
  const hisAndHersFriedRice = hisAndHers?.items.find(
    (item) => item.id === "fried-rice",
  );
  const hisAndHersQuesadilla = hisAndHers?.items.find(
    (item) => item.id === "loaded-quesadila",
  );
  const hisAndHersCrabStuffedSalmon = hisAndHers?.items.find(
    (item) => item.id === "crab-stuffed-salmon",
  );
  const hisAndHersCheesecake = hisAndHers?.items.find(
    (item) => item.id === "berry-cheesecake",
  );
  const hisAndHersMac = hisAndHers?.items.find(
    (item) => item.id === "mac-and-cheese",
  );
  const moxies = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id ===
      "replacement-moxies-washington-dc-restaurant-washington-dc",
  );
  const moxiesBlackenedShrimp = moxies?.items.find(
    (item) => item.id === "blackened-shrimp-skewer",
  );
  const moxiesTacoStation = moxies?.items.find(
    (item) => item.id === "taco-station",
  );
  const moxiesChipotleChicken = moxies?.items.find(
    (item) => item.id === "chipotle-mango-chicken",
  );
  const moxiesLemonQuinoa = moxies?.items.find(
    (item) => item.id === "lemon-quinoa",
  );
  const harbour = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "the-harbour-grille-woodbridge-va-dc-metro",
  );
  const harbourSouthwestEggRolls = harbour?.items.find(
    (item) => item.id === "southwest-egg-rolls",
  );
  const harbourCrabCakeSandwich = harbour?.items.find(
    (item) => item.id === "crab-cake-sandwich",
  );
  const harbourSeafoodCarbonara = harbour?.items.find(
    (item) => item.id === "seafood-carbonara",
  );
  const harbourFishAndChips = harbour?.items.find(
    (item) => item.id === "fish-and-chips",
  );
  const harbourHotTea = harbour?.items.find((item) => item.id === "hot-tea");
  const huncho = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-huncho-house-hyattsville-md",
  );
  const hunchoAhiTuna = huncho?.items.find(
    (item) => item.id === "yellowtail-ahi-tuna",
  );
  const hunchoSeafoodGravy = huncho?.items.find(
    (item) => item.id === "african-seafood-gravy-with-mussels-and-shrimp",
  );
  const hunchoChickenParm = huncho?.items.find(
    (item) => item.id === "bucatini-chicken-parmesan",
  );
  const hunchoCheesecake = huncho?.items.find(
    (item) => item.id === "flaming-banana-foster-cheesecake",
  );
  const hunchoMac = huncho?.items.find(
    (item) => item.id === "huncho-mac-and-cheese",
  );
  const hunchoStickyRibs = huncho?.items.find(
    (item) => item.id === "sticky-ribs-suya",
  );
  const provost = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-provost-restaurant-washington-dc",
  );
  const provostMoscato = provost?.items.find(
    (item) => item.id === "branzini-moscato-nv",
  );
  const provostShrimpPasta = provost?.items.find(
    (item) => item.id === "cajun-chicken-and-shrimp-pasta",
  );
  const provostCrabCake = provost?.items.find(
    (item) => item.id === "crab-cake",
  );
  const provostMacBalls = provost?.items.find(
    (item) => item.id === "four-cheese-mac-and-cheese-balls",
  );
  const provostCoffee = provost?.items.find(
    (item) => item.id === "coffee-and-assorted-teas",
  );
  const inca = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "inca-social-vienna-va-dc-metro",
  );
  const incaAcevichado = inca?.items.find(
    (item) => item.id === "acevichado-roll",
  );
  const incaPescado = inca?.items.find(
    (item) => item.id === "pescado-a-lo-macho",
  );
  const incaPanCon = inca?.items.find(
    (item) => item.id === "pan-con-chicharron",
  );
  const incaSweetSampler = inca?.items.find(
    (item) => item.id === "sweet-sampler",
  );
  const incaIncaBowl = inca?.items.find((item) => item.id === "inca-bowl");
  const delhi = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-delhi-spice-bethesda-md",
  );
  const delhiSamosas = delhi?.items.find((item) => item.id === "samosas");
  const delhiSamosaChaat = delhi?.items.find(
    (item) => item.id === "vegetable-samosa-chaat",
  );
  const delhiButterNaan = delhi?.items.find(
    (item) => item.id === "butter-naan",
  );
  const delhiPrawnMasala = delhi?.items.find(
    (item) => item.id === "prawn-masala",
  );
  const delhiGulabJamun = delhi?.items.find(
    (item) => item.id === "gulab-jamun",
  );
  const delhiMumbaiBreeze = delhi?.items.find(
    (item) => item.id === "mumbai-breeze",
  );
  const delhiFigKofta = delhi?.items.find(
    (item) => item.id === "fig-kofta-curry",
  );
  const plaka = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "plaka-grill-vienna-va-dc-metro",
  );
  const plakaAvgolemeno = plaka?.items.find((item) => item.id === "avgolemeno");
  const plakaCalamari = plaka?.items.find((item) => item.id === "calamari");
  const plakaMoussaka = plaka?.items.find((item) => item.id === "moussaka");
  const plakaGyro = plaka?.items.find((item) => item.id === "plaka-gyro");
  const plakaTzatziki = plaka?.items.find((item) => item.id === "tzatziki");
  const plakaBaklava = plaka?.items.find((item) => item.id === "baklava");
  const plakaKidsPizza = plaka?.items.find((item) => item.id === "kids-pizza");
  const oohhs = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "oohh-s-and-aahh-s-washington-dc-dc-metro",
  );
  const oohhsFriedCroaker = oohhs?.items.find(
    (item) => item.id === "fried-croaker",
  );
  const oohhsCatfishTaco = oohhs?.items.find(
    (item) => item.id === "catfish-taco",
  );
  const oohhsShortRibsGrits = oohhs?.items.find(
    (item) => item.id === "bbq-beef-short-ribs-and-grits",
  );
  const oohhsCaesar = oohhs?.items.find((item) => item.id === "caesar-salad");
  const oohhsTurkeyWings = oohhs?.items.find(
    (item) => item.id === "turkey-wings-2-no-sides",
  );
  const oohhsHalfAndHalf = oohhs?.items.find(
    (item) => item.id === "halfandhalf",
  );
  const oohhsMac = oohhs?.items.find(
    (item) => item.id === "four-cheese-mac-and-cheese-large",
  );
  const flowerChildBethesda = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "flower-child-bethesda",
  );
  const flowerChildOsm = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-flower-child-6327602834",
  );
  const flowerChildForbiddenRice = flowerChildBethesda?.items.find(
    (item) => item.id === "forbidden-rice",
  );
  const flowerChildAvocadoCaesar = flowerChildBethesda?.items.find(
    (item) => item.id === "avocado-caesar",
  );
  const flowerChildClassicHummus = flowerChildBethesda?.items.find(
    (item) => item.id === "classic-hummus",
  );
  const flowerChildMac = flowerChildBethesda?.items.find(
    (item) => item.id === "gluten-free-mac-and-cheese",
  );
  const flowerChildShrimp = flowerChildBethesda?.items.find(
    (item) => item.id === "large-shrimp",
  );
  const flowerChildHotTea = flowerChildBethesda?.items.find(
    (item) => item.id === "hot-tea",
  );
  const trueFood = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "true-food-kitchen",
  );
  const trueFoodArlington = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "true-food-kitchen-arlington",
  );
  const trueFoodAncientGrain = trueFood?.items.find(
    (item) => item.id === "ancient-grain-bowl",
  );
  const trueFoodBurger = trueFood?.items.find(
    (item) => item.id === "all-american-burger",
  );
  const trueFoodGuacamole = trueFood?.items.find(
    (item) => item.id === "guacamole",
  );
  const trueFoodPanang = trueFood?.items.find(
    (item) => item.id === "spicy-panang-curry-bowl",
  );
  const trueFoodFries = trueFood?.items.find(
    (item) => item.id === "true-crispd-air-fried-french-fries",
  );
  const trueFoodBlueberry = trueFood?.items.find(
    (item) => item.id === "blueberry",
  );
  const jimmys = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "jimmys-old-town-tavern-herndon-va-dc-metro",
  );
  const jimmysBeefOnWeck = jimmys?.items.find(
    (item) => item.id === "beef-on-weck",
  );
  const jimmysGrilledCheese = jimmys?.items.find(
    (item) => item.id === "grilled-cheese",
  );
  const jimmysHotHamSwiss = jimmys?.items.find(
    (item) => item.id === "hot-ham-and-swiss",
  );
  const jimmysJottTots = jimmys?.items.find((item) => item.id === "jott-tots");
  const jimmysRibEye = jimmys?.items.find(
    (item) => item.id === "rib-eye-steak",
  );
  const jimmysPineappleJuice = jimmys?.items.find(
    (item) => item.id === "pineapple-juice",
  );
  const teddy = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "teddy-and-the-bully-bar-washington-dc-dc-metro",
  );
  const teddyStations = teddy?.items.find((item) => item.id === "stations");
  const teddyIceCream = teddy?.items.find(
    (item) => item.id === "ice-cream-sorbet",
  );
  const teddyGrilledCheese = teddy?.items.find(
    (item) => item.id === "grilled-cheese-sandwich",
  );
  const teddyMatzohBallSoup = teddy?.items.find(
    (item) => item.id === "matzoh-ball-soup",
  );
  const teddyCoffee = teddy?.items.find(
    (item) => item.id === "coffee-decaf-coffee",
  );
  const joon = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "joon-dc",
  );
  const joonCucumberSalad = joon?.items.find(
    (item) => item.id === "cucumber-salad",
  );
  const joonGilaniKabob = joon?.items.find(
    (item) => item.id === "gilani-kabob-platter",
  );
  const joonDuckFesenjoon = joon?.items.find(
    (item) => item.id === "duck-fesenjoon",
  );
  const joonGrilledPrawns = joon?.items.find(
    (item) => item.id === "grilled-prawns",
  );
  const joonHummusLamb = joon?.items.find(
    (item) => item.id === "hummus-with-lamb",
  );
  const joonKabobPlatter = joon?.items.find(
    (item) => item.id === "joon-kabob-platter",
  );
  const joonLoveCake = joon?.items.find(
    (item) => item.id === "mday-persian-love-cake",
  );
  const joonThanksgivingMeal = joon?.items.find(
    (item) => item.id === "thanksgiving-meal",
  );
  const joonCoffeeService = joon?.items.find(
    (item) => item.id === "coffee-servi-ce",
  );
  const society = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "society-seafood-house-silver-spring-md-dc-metro",
  );
  const societyCatfishSandwich = society?.items.find(
    (item) => item.id === "catfish-sandwich",
  );
  const societyFriedShrimp = society?.items.find(
    (item) => item.id === "fried-shrimp-and-fries",
  );
  const societyChickenSandwich = society?.items.find(
    (item) => item.id === "scotch-bonnet-fried-chicken",
  );
  const societyCaesar = society?.items.find(
    (item) => item.id === "caesar-salad",
  );
  const societyShrimp = society?.items.find(
    (item) => item.id === "society-shrimp",
  );
  const societyBisque = society?.items.find(
    (item) => item.id === "seafood-bisque",
  );
  const societyCatfishPoboy = society?.items.find(
    (item) => item.id === "catfish-poboy",
  );
  const societyHoneyBiscuit = society?.items.find(
    (item) => item.id === "honey-biscuit",
  );
  const silverBethesda = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "silver-bethesda-md-dc-metro",
  );
  const silverAhiTunaPoke = silverBethesda?.items.find(
    (item) => item.id === "ahi-tuna-poke-bowl",
  );
  const silverBeyondBaja = silverBethesda?.items.find(
    (item) => item.id === "beyond-baja-burger",
  );
  const silverKidsAppleJuice = silverBethesda?.items.find(
    (item) => item.id === "kids-apple-juice",
  );
  const silverLambMeatballs = silverBethesda?.items.find(
    (item) => item.id === "lamb-meatballs-sharting-plate",
  );
  const tastyNook = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-tasty-nook-12663327602",
  );
  const tastyBurger = tastyNook?.items.find(
    (item) => item.id === "classic-burger",
  );
  const tastyPancakes = tastyNook?.items.find(
    (item) => item.id === "3-buttermilk-pancakes",
  );
  const tastyCarneAsada = tastyNook?.items.find(
    (item) => item.id === "carne-asada",
  );
  const tastyChickenAlfredo = tastyNook?.items.find(
    (item) => item.id === "chicken-alfredo",
  );
  const tastyCapuccino = tastyNook?.items.find(
    (item) => item.id === "capuccino",
  );
  const tastyPattySausage = tastyNook?.items.find(
    (item) => item.id === "2-patty-sausage",
  );
  const clydesGallery = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "clydes-gallery-place-dc",
  );
  const clydesBurger = clydesGallery?.items.find(
    (item) => item.id === "clydes-classic-burger",
  );
  const clydesCrabCake = clydesGallery?.items.find(
    (item) => item.id === "jumbo-lump-crab-cake",
  );
  const clydesSalmonSalad = clydesGallery?.items.find(
    (item) => item.id === "faroe-islands-salmon-salad",
  );
  const clydesCrabSoup = clydesGallery?.items.find(
    (item) => item.id === "crab-soup",
  );
  const clydesCheesecake = clydesGallery?.items.find(
    (item) => item.id === "baileys-cheesecake",
  );
  const clydesBreakfast = clydesGallery?.items.find(
    (item) => item.id === "all-american-breakfast",
  );
  const clydesGreenBeans = clydesGallery?.items.find(
    (item) => item.id === "greasy-green-beans",
  );
  const ilili = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "ilili-dc",
  );
  const ililiHotTea = ilili?.items.find(
    (item) => item.id === "specialty-hot-tea-plain-t",
  );
  const ililiCoffee = ilili?.items.find(
    (item) => item.id === "afficionado-coffee",
  );
  const ililiMintTea = ilili?.items.find(
    (item) => item.id === "fresh-mint-tea",
  );
  const ililiIceCream = ilili?.items.find((item) => item.id === "ice-cream");
  const sunflowerVeggieShrimpTempura = sunflower?.items.find(
    (item) => item.id === "veggie-shrimp-tempura-roll-8-pc",
  );
  const sunflowerTornado = sunflower?.items.find(
    (item) => item.id === "tornado-roll-una-maki-8-pc",
  );
  const sunflowerMockEel = sunflower?.items.find(
    (item) => item.id === "teriyaki-mock-sesame-eel-4",
  );
  const sunflowerShrimpGarden = sunflower?.items.find(
    (item) => item.id === "s4shrimp-garden-sizzling-rice",
  );
  const sunflowerOrganicSpinachWontonSoup = sunflower?.items.find(
    (item) => item.id === "organic-spinach-wonton-soup",
  );
  const sunflowerGfCheesecake = sunflower?.items.find(
    (item) => item.id === "gf-raspberry-white-chocolate-cheese-cake",
  );
  const sunflowerChocolateMousse = sunflower?.items.find(
    (item) => item.id === "vt-chocolate-mousse",
  );
  const foundingFarmersFamily = [
    "farmers-and-distillers-dc",
    "founding-farmers-dc",
    "founding-farmers-reston-station-va",
    "founding-farmers-tysons-va",
  ].map((id) =>
    generatedRestaurants.restaurants.find((restaurant) => restaurant.id === id),
  );
  const maggie = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "maggie-mcfly-s-springfield-springfield-va-dc-metro",
  );
  const maggieBurgerSliders = maggie?.items.find(
    (item) => item.id === "bacon-cheeseburger-sliders",
  );
  const maggieAhiTaco = maggie?.items.find(
    (item) => item.id === "ahi-tuna-taco",
  );
  const maggieFettuccine = maggie?.items.find(
    (item) => item.id === "fettuccine-alfredo",
  );
  const maggieBrownie = maggie?.items.find(
    (item) => item.id === "brownie-sundae",
  );
  const maggieGrilledCheese = maggie?.items.find(
    (item) => item.id === "grilled-cheese-and-fries",
  );
  const maggieCalamari = maggie?.items.find(
    (item) => item.id === "fried-calamari",
  );
  const maggieSmoothie = maggie?.items.find((item) => item.id === "smoothie");
  const afghania = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-afghania-washington-dc",
  );
  const afghaniaBurger = afghania?.items.find(
    (item) => item.id === "afghania-burger",
  );
  const afghaniaBistroBurger = afghania?.items.find(
    (item) => item.id === "bistro-burger",
  );
  const afghaniaNakhoudChalou = afghania?.items.find(
    (item) => item.id === "nakhoud-chalou",
  );
  const afghaniaBaadenjaanChalou = afghania?.items.find(
    (item) => item.id === "baadenjaan-chalou",
  );
  const afghaniaChalou = afghania?.items.find((item) => item.id === "chalou");
  const afghaniaSalmon = afghania?.items.find((item) => item.id === "salmon");
  const afghaniaChickenLawaan = afghania?.items.find(
    (item) => item.id === "chicken-lawaan",
  );
  const afghaniaLambTenderloinKabob = afghania?.items.find(
    (item) => item.id === "lamb-tenderloin-kabob",
  );
  const aracosia = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-aracosia-3584164912",
  );
  const aracosiaBistroBurger = aracosia?.items.find(
    (item) => item.id === "bistro-burger",
  );
  const aracosiaAushak = aracosia?.items.find(
    (item) => item.id === "leek-and-scallion-dumplings-aushak-entree",
  );
  const aracosiaSalmonWrap = aracosia?.items.find(
    (item) => item.id === "salmon-wrap",
  );
  const aracosiaQabuli = aracosia?.items.find(
    (item) => item.id === "qabuli-rice",
  );
  const aracosiaBaklava = aracosia?.items.find((item) => item.id === "baklava");
  const aracosiaChickenLawaan = aracosia?.items.find(
    (item) => item.id === "chicken-lawaan",
  );
  const botanero = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-botanero-11895212138",
  );
  const botaneroCalamari = botanero?.items.find(
    (item) => item.name === "Fried Calamari",
  );
  const botaneroCrabCakeSandwich = botanero?.items.find(
    (item) => item.name === "Crab Cake Sandwich",
  );
  const botaneroBurger = botanero?.items.find(
    (item) => item.name === "Botanero Burger",
  );
  const botaneroFlatbread = botanero?.items.find(
    (item) => item.name === "BBQ Chicken Flatbread",
  );
  const botaneroSalmonBenedict = botanero?.items.find(
    (item) => item.name === "Smoked Salmon Eggs Benedict",
  );
  const uzu = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "uzu-revolving-sushi-rockville-md-dc-metro",
  );
  const uzuAsparagusTempura = uzu?.items.find(
    (item) => item.id === "asparagus-tempura",
  );
  const uzuAvocadoRoll = uzu?.items.find((item) => item.id === "avocado-roll");
  const uzuHawaiianTruffle = uzu?.items.find(
    (item) => item.id === "hawaiian-truffle-roll",
  );
  const uzuOysterPonzu = uzu?.items.find(
    (item) => item.id === "oyster-w-ikura-and-ponzu",
  );
  const uzuBossCoffee = uzu?.items.find(
    (item) => item.id === "boss-black-coffee",
  );
  const uzuMochi = uzu?.items.find((item) => item.id === "mochi-ice-cream");
  const secretGarden = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "the-secret-garden-cafe-washington-dc-dc-metro",
  );
  const secretGardenAsparagus = secretGarden?.items.find(
    (item) => item.id === "asparagus",
  );
  const secretGardenBahnMi = secretGarden?.items.find(
    (item) => item.id === "bahn-mi",
  );
  const secretGardenCrabCake = secretGarden?.items.find(
    (item) => item.id === "lump-crab-cake-sandwich",
  );
  const secretGardenHalfTea = secretGarden?.items.find(
    (item) => item.id === "halfhalf-tea",
  );
  const secretGardenSalmon = secretGarden?.items.find(
    (item) => item.id === "fresh-atlantic-salmon",
  );
  const secretGardenFrenchToast = secretGarden?.items.find(
    (item) => item.id === "traditional-french-toast",
  );
  const jukeBox = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-juke-box-diner-3925447512",
  );
  const jukeBoxBurger = jukeBox?.items.find(
    (item) => item.id === "bacon-n-bacon-cheeseburger",
  );
  const jukeBoxChickenParm = jukeBox?.items.find(
    (item) => item.id === "chicken-parmigiana",
  );
  const jukeBoxFishChips = jukeBox?.items.find(
    (item) => item.id === "fish-and-chips",
  );
  const jukeBoxBlackAngus = jukeBox?.items.find(
    (item) => item.id === "10oz-black-angus-steak",
  );
  const jukeBoxCoffee = jukeBox?.items.find(
    (item) => item.id === "freshly-brewed-coffee",
  );
  const jukeBoxWaffleSundae = jukeBox?.items.find(
    (item) => item.id === "waffle-sundae",
  );
  const redHotBlue = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-red-hot-blue-1448579525",
  );
  const redHotBlueClassicBurger = redHotBlue?.items.find(
    (item) => item.id === "the-classic-burger",
  );
  const redHotBlueHickoryBurger = redHotBlue?.items.find(
    (item) => item.id === "hickory-bacon-burger",
  );
  const redHotBluePulledPork = redHotBlue?.items.find(
    (item) => item.id === "pulled-pork-plate",
  );
  const redHotBlueCatfish = redHotBlue?.items.find(
    (item) => item.id === "delta-catfish-plate",
  );
  const redHotBlueNachos = redHotBlue?.items.find(
    (item) => item.id === "bbq-nachos",
  );
  const redHotBlueWingsTray = redHotBlue?.items.find(
    (item) => item.id === "40-wings-tray",
  );
  const novaEuropa = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-nova-europa-restaurant-silver-spring-md",
  );
  const novaEuropaCalamari = novaEuropa?.items.find(
    (item) => item.id === "calamari",
  );
  const novaEuropaSeafoodPot = novaEuropa?.items.find(
    (item) => item.id === "caldeirda-nova-europa",
  );
  const novaEuropaChickenParm = novaEuropa?.items.find(
    (item) => item.id === "chicken-parmigiana",
  );
  const novaEuropaSteakPortuguese = novaEuropa?.items.find(
    (item) =>
      item.id === "steak-portuguese-topped-with-egg-and-ham-in-wine-sauce",
  );
  const novaEuropaCheesecake = novaEuropa?.items.find(
    (item) => item.id === "cheese-cake",
  );
  const novaEuropaHouseSalad = novaEuropa?.items.find(
    (item) => item.id === "house-salad",
  );
  const novaEuropaAlfredo = novaEuropa?.items.find(
    (item) => item.id === "fettucini-alfredo",
  );
  const novaEuropaBrie = novaEuropa?.items.find(
    (item) => item.id === "baked-brie-cheese",
  );
  const cuates = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-cuates-12207964801",
  );
  const cuatesAztecaSalad = cuates?.items.find(
    (item) => item.id === "azteca-salad",
  );
  const cuatesSeafoodSoup = cuates?.items.find(
    (item) => item.id === "casuela-de-mariscos",
  );
  const cuatesCheesecakeChimichanga = cuates?.items.find(
    (item) => item.id === "cheesecake-chimichanga",
  );
  const cuatesChickenTenders = cuates?.items.find(
    (item) => item.id === "chicken-tenders",
  );
  const cuatesTacoSalad = cuates?.items.find(
    (item) => item.id === "lunch-taco-salad",
  );
  const cuatesParillada = cuates?.items.find(
    (item) => item.id === "parillada-cuates-grill",
  );
  const cuatesTacosCarbon = cuates?.items.find(
    (item) => item.id === "tacos-al-carbon",
  );
  const cuatesFlourTortillas = cuates?.items.find(
    (item) => item.id === "so-flour-tortillas-3",
  );
  const cuatesMargaritas = cuates?.items.find(
    (item) => item.id === "cuates-famous-margaritas",
  );
  const urbano = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-urbano-9821308296",
  );
  const urbanoSoftTacos = urbano?.items.find(
    (item) => item.id === "2-crispy-or-soft-tacos",
  );
  const urbanoPorkBelly = urbano?.items.find(
    (item) => item.id === "ancho-grilled-pork-belly",
  );
  const urbanoTortillaSoup = urbano?.items.find(
    (item) => item.id === "chicken-tortilla-soup",
  );
  const urbanoFajitaFiesta = urbano?.items.find(
    (item) => item.id === "fajita-fiesta-4-guests",
  );
  const urbanoHalibut = urbano?.items.find(
    (item) => item.id === "grilled-halibut-al-pastor",
  );
  const urbanoShrimp = urbano?.items.find(
    (item) => item.id === "grilled-shrimp",
  );
  const urbanoRitas = urbano?.items.find(
    (item) => item.id === "top-shelf-ritas",
  );
  const urbanoTresLeches = urbano?.items.find(
    (item) => item.id === "tres-leches",
  );
  const eugenia = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-our-mom-eugenia-2578773395",
  );
  const eugeniaCoffee = eugenia?.items.find(
    (item) => item.id === "loumidis-greek-coffee",
  );
  const eugeniaArni = eugenia?.items.find(
    (item) => item.id === "arni-riganato",
  );
  const eugeniaKantaifi = eugenia?.items.find(
    (item) => item.id === "ekmek-kantaifi",
  );
  const eugeniaLavraki = eugenia?.items.find(
    (item) => item.id === "lavraki-gemisto",
  );
  const eugeniaAvgolemono = eugenia?.items.find(
    (item) => item.id === "avgolemono",
  );
  const eugeniaBakaliaros = eugenia?.items.find(
    (item) => item.id === "bakaliaros-and-skordalia",
  );
  const eugeniaFeta = eugenia?.items.find((item) => item.id === "feta-psiti");
  const eugeniaGreekSalad = eugenia?.items.find(
    (item) => item.id === "greek-salad",
  );
  const eugeniaLamburger = eugenia?.items.find(
    (item) => item.id === "lamburger",
  );
  const eugeniaSpanakopita = eugenia?.items.find(
    (item) => item.id === "spanakopita",
  );
  const elPatio = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "el-patio-randolph-rockville-md-dc-metro",
  );
  const elPatioChivito = elPatio?.items.find((item) => item.id === "chivito");
  const elPatioChivitoAlPlato = elPatio?.items.find(
    (item) => item.id === "chivito-al-plato-top-seller",
  );
  const elPatioEmpanada = elPatio?.items.find(
    (item) => item.id === "empanada-tucumana",
  );
  const elPatioMilanesa = elPatio?.items.find(
    (item) => item.id === "milanesa-carne",
  );
  const elPatioShrimpPasta = elPatio?.items.find(
    (item) => item.id === "shrimp-fettuccini",
  );
  const elPatioJuices = elPatio?.items.find(
    (item) => item.id === "all-natural-juices",
  );
  const elPatioCake = elPatio?.items.find(
    (item) => item.id === "torta-de-chocolate-7-layer-v",
  );
  const elPatioSalmon = elPatio?.items.find(
    (item) => item.id === "salmon-a-la-parrilla-grilled-salmon",
  );
  const elPatioChimichurri = elPatio?.items.find(
    (item) => item.id === "chimichurri-sauce",
  );
  const openCity = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "open-city-dc",
  );
  const openCityCroissant = openCity?.items.find(
    (item) => item.id === "bacon-egg-and-cheese-croissant",
  );
  const openCityPancakes = openCity?.items.find(
    (item) => item.id === "buttermilk-pancakes",
  );
  const openCityClub = openCity?.items.find(
    (item) => item.id === "calvert-club-sandwich",
  );
  const openCityHummus = openCity?.items.find(
    (item) => item.id === "hummus-plate",
  );
  const openCitySalmon = openCity?.items.find(
    (item) => item.id === "blackened-salmon",
  );
  const openCityShrimpSide = openCity?.items.find(
    (item) => item.id === "side-shrimp",
  );
  const openCitySmallCaesar = openCity?.items.find(
    (item) => item.id === "small-caesar-salad",
  );
  const organicButcher = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-the-organic-butcher-mclean-va",
  );
  const organicBurgerBlend = organicButcher?.items.find(
    (item) => item.id === "deluxe-custom-burger-blend",
  );
  const organicWings = organicButcher?.items.find(
    (item) => item.id === "chicken-wings-fresh-uncooked",
  );
  const organicSalmon = organicButcher?.items.find(
    (item) => item.id === "organic-salmon",
  );
  const organicGroundLamb = organicButcher?.items.find(
    (item) => item.id === "ground-lamb",
  );
  const organicCasamara = organicButcher?.items.find(
    (item) => item.id === "casamara-club-alta",
  );
  const organicMeatballs = organicButcher?.items.find(
    (item) => item.id === "italian-meatballs-gluten-free",
  );
  const organicBlackCod = organicButcher?.items.find(
    (item) => item.id === "black-cod-fillet",
  );
  const organicSmokedSalmonDip = organicButcher?.items.find(
    (item) => item.id === "house-made-smoked-salmon-dip",
  );
  const organicHummus = organicButcher?.items.find(
    (item) => item.id === "little-sesame-smooth-classic-hummus-large",
  );
  const organicNewYorkStrip = organicButcher?.items.find(
    (item) => item.id === "100percent-grass-fed-new-york-strip",
  );
  const organicMalaySauce = organicButcher?.items.find(
    (item) => item.id === "spicy-malay-grilling-sauce",
  );
  const pleroma = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "pleroma-cuisine-laurel-md-dc-metro",
  );
  const pleromaFufu = pleroma?.items.find(
    (item) => item.id === "any-fufu-of-choice-per-wrap",
  );
  const pleromaShrimpRoll = pleroma?.items.find(
    (item) => item.id === "african-shrimp-roll",
  );
  const pleromaPompano = pleroma?.items.find(
    (item) => item.id === "grilled-pompano",
  );
  const pleromaPlantain = pleroma?.items.find((item) => item.id === "plantain");
  const pleromaChickenWrap = pleroma?.items.find(
    (item) => item.id === "chicken-spiced-wrap",
  );
  const pleromaAsaro = pleroma?.items.find((item) => item.id === "asaro");
  const spacebar = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "spacebar-falls-church-va-dc-metro",
  );
  const spacebarAndromeda = spacebar?.items.find(
    (item) => item.id === "andromeda-melt",
  );
  const spacebarVeganGrilledCheese = spacebar?.items.find(
    (item) => item.id === "vegan-grilled-cheese",
  );
  const spacebarSpacebarBq = spacebar?.items.find(
    (item) => item.id === "spacebar-b-q",
  );
  const spacebarPestoTurko = spacebar?.items.find(
    (item) => item.id === "pesto-turko",
  );
  const spacebarTaterTots = spacebar?.items.find(
    (item) => item.id === "tater-tots",
  );
  const bayou = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "bayou-bakery-arlington-va",
  );
  const bayouCheddaRoast = bayou?.items.find(
    (item) => item.id === "bayou-chedda-roast",
  );
  const bayouMeatballs = bayou?.items.find(
    (item) => item.id === "blackened-turkey-meatballs",
  );
  const bayouVeggieVille = bayou?.items.find(
    (item) => item.id === "veggie-ville",
  );
  const bayouGreens = bayou?.items.find((item) => item.id === "greens");
  const bayouBenedict = bayou?.items.find(
    (item) => item.id === "avocado-benedict",
  );
  const bayouBlt = bayou?.items.find((item) => item.id === "bayou-blt");
  const bayouColdPimento = bayou?.items.find(
    (item) => item.id === "cold-pimento-cheese-sandwich",
  );
  const bayouFishSandwich = bayou?.items.find(
    (item) => item.id === "fillet-o-blue-cat-fish-sandwich-mkt-price",
  );
  const bayouFlan = bayou?.items.find((item) => item.id === "cuban-flan");
  const bayouQuiche = bayou?.items.find(
    (item) => item.id === "daily-quiche-plate-spinach-goat-cheese",
  );
  const bayouSpinachMadeline = bayou?.items.find(
    (item) => item.id === "spinach-madeline",
  );
  const bayouPecanWaffle = bayou?.items.find(
    (item) => item.id === "roasted-pecan-and-brown-butter-waffle",
  );
  const bayouMuffalotta = bayou?.items.find(
    (item) => item.id === "the-muff-a-lotta",
  );
  const miVida = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "mi-vida-washington-dc-dc-metro",
  );
  const miVidaDeviledEggs = miVida?.items.find(
    (item) => item.id === "green-pipian-deviled-eggs",
  );
  const miVidaAtun = miVida?.items.find((item) => item.id === "de-atun");
  const miVidaTropical = miVida?.items.find((item) => item.id === "tropical");
  const miVidaPescado = miVida?.items.find((item) => item.id === "pescado");
  const miVidaSmashburger = miVida?.items.find(
    (item) => item.id === "lb-smashburger",
  );
  const miVidaEnchiladasJaiba = miVida?.items.find(
    (item) => item.id === "enchiladas-jaiba",
  );
  const miVidaJaibaConQueso = miVida?.items.find(
    (item) => item.id === "jaiba-con-queso",
  );
  const dogfish = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "dogfish-head-alehouse-gaithersburg-md-dc-metro",
  );
  const dogfishAhi = dogfish?.items.find((item) => item.id === "ahi-tuna");
  const dogfishCrabDip = dogfish?.items.find((item) => item.id === "crab-dip");
  const dogfishFishChips = dogfish?.items.find(
    (item) => item.id === "crispy-fish-and-chips",
  );
  const dogfishJambalaya = dogfish?.items.find(
    (item) => item.id === "jambalaya",
  );
  const dogfishPotstickers = dogfish?.items.find(
    (item) => item.id === "potstickers",
  );
  const dogfishFarmFresh = dogfish?.items.find(
    (item) => item.id === "the-farm-fresh-burger",
  );
  const dogfishTurkeyClub = dogfish?.items.find(
    (item) => item.id === "turkey-club-with-avocado",
  );
  const allPurpose = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "all-purpose-shaw-dc",
  );
  const allPurposeCaesar = allPurpose?.items.find(
    (item) => item.id === "antipasti-ap-caesar-salad",
  );
  const allPurposeBreakfastSandwich = allPurpose?.items.find(
    (item) => item.id === "brunch-specialties-breakfast-sandwich",
  );
  const allPurposeTripper = allPurpose?.items.find(
    (item) => item.id === "pizza-tripper",
  );
  const allPurposeBakedCookie = allPurpose?.items.find(
    (item) => item.id === "desserts-baked-cookie",
  );
  const blueDuck = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "blue-duck-tavern-dc",
  );
  const blueDuckPorridge = blueDuck?.items.find(
    (item) => item.id === "cereals-10-grain-porridge",
  );
  const blueDuckBagel = blueDuck?.items.find(
    (item) => item.id === "pastries-and-breads-bagel",
  );
  const blueDuckCheeseburger = blueDuck?.items.find(
    (item) => item.id === "lounge-food-bdt-cheeseburger",
  );
  const blueDuckCrabCakes = blueDuck?.items.find(
    (item) => item.id === "lounge-food-jumbo-lump-crab-cakes",
  );
  const blueDuckTrout = blueDuck?.items.find(
    (item) => item.id === "meat-poultry-and-fish-trout",
  );
  const occidentalReviewed = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "occidental-dc",
  );
  const occidentalCaviar = occidentalReviewed?.items.find(
    (item) => item.id === "caviar-petrossian-tsar-imperial-baika",
  );
  const occidentalCrabRoll = occidentalReviewed?.items.find(
    (item) => item.id === "sandwiches-king-crab-roll",
  );
  const occidentalCaesar = occidentalReviewed?.items.find(
    (item) => item.id === "salads-caesar-salad",
  );
  const occidentalBurger = occidentalReviewed?.items.find(
    (item) => item.id === "sandwiches-the-occidental-burger",
  );
  const occidentalSeaBass = occidentalReviewed?.items.find(
    (item) => item.id === "entrees-chilean-sea-bass",
  );
  const occidentalFrenchToast = occidentalReviewed?.items.find(
    (item) => item.id === "brunch-caramelized-french-toast",
  );
  const occidentalCheesecake = occidentalReviewed?.items.find(
    (item) => item.id === "desserts-ny-cheesecake",
  );
  const etVoila = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "et-voila-dc",
  );
  const etVoilaBurger = etVoila?.items.find(
    (item) => item.id === "main-courses-et-voila-burger",
  );
  const etVoilaBeetSalad = etVoila?.items.find(
    (item) => item.id === "starters-beet-salad",
  );
  const etVoilaBenedictSalmon = etVoila?.items.find(
    (item) => item.id === "brunch-benedict-eggs-with-smoked-salmon",
  );
  const etVoilaCaesar = etVoila?.items.find(
    (item) => item.id === "starters-caesar-salad",
  );
  const etVoilaCroqueMadame = etVoila?.items.find(
    (item) => item.id === "brunch-croque-madame",
  );
  const etVoilaMoules = etVoila?.items.find(
    (item) => item.id === "main-courses-moules-mariniere",
  );
  const etVoilaProfiteroles = etVoila?.items.find(
    (item) => item.id === "desserts-profiteroles",
  );

  assert.equal(
    busboys?.items.some(
      (item) => item.id === "gluten-free-friendly-vegan-caesar-salad",
    ),
    false,
  );
  assert.equal(
    busboys?.items.some(
      (item) =>
        item.id ===
        "jyna-maeng-presents-queen-of-whispers-a-book-release-and-reading",
    ),
    false,
  );
  assert.equal(
    busboys?.items.some((item) => item.id === "get-tickets"),
    false,
  );
  assert.ok(busboysCaesar);
  assert.equal(
    busboysCaesar.allergenSourceType,
    "official-product-allergen-section",
  );
  assert.deepEqual(busboysCaesar.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(busboysBrussels);
  assert.deepEqual(busboysBrussels.allergens, ["peanut"]);
  assert.deepEqual(busboysBrussels.mayContain ?? [], []);
  assert.ok(busboysBagelLox);
  assert.equal(busboysBagelLox.allergenSourceType, "official-ingredients");
  assert.deepEqual(busboysBagelLox.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(busboysCrabCakes);
  assert.deepEqual(busboysCrabCakes.allergens?.sort(), [
    "egg",
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(busboysFalafel);
  assert.deepEqual(busboysFalafel.allergens?.sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok(busboysVeganTuna);
  assert.deepEqual(busboysVeganTuna.allergens?.sort(), ["gluten", "wheat"]);
  assert.equal(busboysVeganTuna.allergens?.includes("fish"), false);
  assert.equal(busboysVeganTuna.allergens?.includes("egg"), false);
  assert.equal(busboysVeganTuna.allergens?.includes("milk"), false);
  assert.ok(busboysVeganBurger);
  assert.deepEqual(busboysVeganBurger.allergens?.sort(), ["gluten", "wheat"]);
  assert.equal(busboysVeganBurger.allergens?.includes("soy"), false);
  assert.equal(busboysVeganBurger.allergens?.includes("milk"), false);
  assert.ok(busboysShrimpCrabFritters);
  assert.deepEqual(busboysShrimpCrabFritters.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(busboysPecanPie);
  assert.deepEqual(busboysPecanPie.allergens?.sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(busboysVeganBbqBeef);
  assert.deepEqual(busboysVeganBbqBeef.allergens?.sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.equal(busboysVeganBbqBeef.allergens?.includes("milk"), false);
  assert.ok(busboysShrimpGrits);
  assert.deepEqual(busboysShrimpGrits.allergens?.sort(), ["milk", "shellfish"]);
  assert.ok(busboysVeganEggWrap);
  assert.deepEqual(busboysVeganEggWrap.allergens?.sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.equal(dukes?.officialAllergenRemediationBucket, "official-partial");
  assert.ok((dukes?.allergenDataStatus?.officialItemCount ?? 0) >= 28);
  assert.ok(dukesWings);
  assert.equal(dukesWings.allergenSourceType, "official-ingredients");
  assert.deepEqual(dukesWings.allergens?.sort(), ["egg", "milk"]);
  assert.ok(dukesBanhMi);
  assert.deepEqual(dukesBanhMi.allergens?.sort(), ["egg", "gluten", "wheat"]);
  assert.ok(dukesCubano);
  assert.deepEqual(dukesCubano.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "mustard",
    "wheat",
  ]);
  assert.ok(dukesFishChips);
  assert.deepEqual(dukesFishChips.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "wheat",
  ]);
  assert.ok(dukesImpossibleBurger);
  assert.deepEqual(dukesImpossibleBurger.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(dukesImpossibleBurger.allergens?.includes("soy"), false);
  assert.ok(dukesTunaMelt);
  assert.deepEqual(dukesTunaMelt.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(dukesSalmonCroquettes);
  assert.deepEqual(dukesSalmonCroquettes.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "mustard",
    "wheat",
  ]);
  assert.ok(dukesSpicyAubergine);
  assert.deepEqual(dukesSpicyAubergine.allergens?.sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(dukesMacCheese);
  assert.deepEqual(dukesMacCheese.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(lapis?.officialAllergenRemediationBucket, "official-partial");
  assert.ok((lapis?.allergenDataStatus?.officialItemCount ?? 0) >= 20);
  assert.ok(lapisAushak);
  assert.deepEqual(lapisAushak.allergens?.sort(), ["milk"]);
  assert.ok(lapisBeets);
  assert.deepEqual(lapisBeets.allergens?.sort(), ["milk", "tree-nut"]);
  assert.ok(lapisBolani);
  assert.deepEqual(lapisBolani.allergens?.sort(), ["gluten", "wheat"]);
  assert.ok(lapisHalwa);
  assert.deepEqual(lapisHalwa.allergens?.sort(), [
    "gluten",
    "tree-nut",
    "wheat",
  ]);
  assert.match(JSON.stringify(lapisHalwa.evidence ?? []), /sliced almonds/i);
  assert.ok(lapisMahee);
  assert.deepEqual(lapisMahee.allergens?.sort(), ["fish"]);
  assert.ok(lapisShrimp);
  assert.deepEqual(lapisShrimp.allergens?.sort(), ["shellfish"]);
  assert.ok(lapisPistachioCake);
  assert.deepEqual(lapisPistachioCake.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(lapisSambosa);
  assert.deepEqual(lapisSambosa.allergens?.sort(), ["gluten", "wheat"]);
  assert.ok(lapisSheerBerenj);
  assert.deepEqual(lapisSheerBerenj.allergens?.sort(), ["milk", "tree-nut"]);
  assert.ok(lapisDumplings);
  assert.equal(lapisDumplings.allergenSourceType, "unavailable");
  assert.equal(yellow?.officialAllergenRemediationBucket, "official-partial");
  assert.ok((yellow?.allergenDataStatus?.officialItemCount ?? 0) >= 39);
  assert.ok(yellowLambShoulder);
  assert.deepEqual(yellowLambShoulder.allergens?.sort(), ["milk"]);
  assert.ok(yellowSpringOnionLabne);
  assert.deepEqual(yellowSpringOnionLabne.allergens?.sort(), [
    "milk",
    "tree-nut",
  ]);
  assert.ok(yellowClassicHummus);
  assert.equal(yellowClassicHummus.allergenSourceType, "unavailable");
  assert.ok(yellowFalafel);
  assert.deepEqual(yellowFalafel.allergens?.sort(), ["milk"]);
  assert.ok(yellowFattoush);
  assert.deepEqual(yellowFattoush.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(yellowPitas);
  assert.deepEqual(yellowPitas.allergens?.sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok(yellowPainSuisse);
  assert.deepEqual(yellowPainSuisse.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);
  assert.ok(yellowSmokedFishLabne);
  assert.deepEqual(yellowSmokedFishLabne.allergens?.sort(), ["fish", "milk"]);
  assert.ok(yellowDanish);
  assert.deepEqual(yellowDanish.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(yellowTroutKaak);
  assert.deepEqual(yellowTroutKaak.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(yellowPitaPack);
  assert.deepEqual(yellowPitaPack.allergens?.sort(), ["gluten", "wheat"]);
  assert.equal(
    baanSiamReviewed?.officialAllergenRemediationBucket,
    "official-partial",
  );
  assert.ok(
    (baanSiamReviewed?.allergenDataStatus?.officialItemCount ?? 0) >= 38,
  );
  assert.ok(baanPadChaShrimp);
  assert.deepEqual(baanPadChaShrimp.allergens?.sort(), ["shellfish"]);
  assert.ok(baanMassaman);
  assert.equal(baanMassaman.allergenSourceType, "unavailable");
  assert.ok(baanFriedRiceEgg);
  assert.deepEqual(baanFriedRiceEgg.allergens?.sort(), ["egg"]);
  assert.ok(baanTapiocaDumplings);
  assert.deepEqual(baanTapiocaDumplings.allergens?.sort(), ["peanut"]);
  assert.equal(baanTapiocaDumplings.allergens?.includes("gluten"), false);
  assert.ok(baanCoconutGriddle);
  assert.deepEqual(baanCoconutGriddle.allergens?.sort(), ["gluten", "wheat"]);
  assert.equal(baanCoconutGriddle.allergens?.includes("milk"), false);
  assert.ok(baanCoconutSoup);
  assert.equal(baanCoconutSoup.allergenSourceType, "unavailable");
  assert.ok(baanCrabRice);
  assert.deepEqual(baanCrabRice.allergens?.sort(), ["egg", "shellfish"]);
  assert.ok(baanTempuraPumpkin);
  assert.deepEqual(baanTempuraPumpkin.allergens?.sort(), ["gluten", "wheat"]);
  assert.ok(baanBranzino);
  assert.deepEqual(baanBranzino.allergens?.sort(), ["fish"]);
  assert.ok(baanGreenMango);
  assert.deepEqual(baanGreenMango.allergens?.sort(), ["peanut"]);
  assert.ok(baanKhaoSoi);
  assert.deepEqual(baanKhaoSoi.allergens?.sort(), ["egg", "gluten", "wheat"]);
  assert.ok(baanFriedRiceTofu);
  assert.deepEqual(baanFriedRiceTofu.allergens?.sort(), ["egg", "soy"]);
  assert.ok(baanTomYumSoup);
  assert.deepEqual(baanTomYumSoup.allergens?.sort(), ["peanut"]);
  assert.equal(baanTomYumSoup.allergens?.includes("soy"), false);
  assert.equal(
    purplePatch?.officialAllergenRemediationBucket,
    "official-partial",
  );
  assert.ok((purplePatch?.allergenDataStatus?.officialItemCount ?? 0) >= 57);
  assert.ok(purpleLechon);
  assert.deepEqual(purpleLechon.allergens?.sort(), ["gluten"]);
  assert.ok(purpleBiko);
  assert.equal(purpleBiko.allergenSourceType, "unavailable");
  assert.ok(purpleCassavaCake);
  assert.deepEqual(purpleCassavaCake.allergens?.sort(), ["milk"]);
  assert.equal(purpleCassavaCake.allergens?.includes("gluten"), false);
  assert.ok(purpleBrazo);
  assert.deepEqual(purpleBrazo.allergens?.sort(), ["egg", "milk"]);
  assert.ok(purpleAlimasagRice);
  assert.deepEqual(purpleAlimasagRice.allergens?.sort(), [
    "gluten",
    "shellfish",
    "soy",
    "wheat",
  ]);
  assert.ok(purpleCauliflowerAdobo);
  assert.deepEqual(purpleCauliflowerAdobo.allergens?.sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.equal(purpleCauliflowerAdobo.allergens?.includes("milk"), false);
  assert.ok(purpleBicolExpress);
  assert.deepEqual(purpleBicolExpress.allergens?.sort(), ["shellfish"]);
  assert.equal(purpleBicolExpress.allergens?.includes("milk"), false);
  assert.equal(daikaya?.officialAllergenRemediationBucket, "official-partial");
  assert.ok((daikaya?.allergenDataStatus?.officialItemCount ?? 0) >= 62);
  assert.ok(daikayaFriedGarlic);
  assert.deepEqual(daikayaFriedGarlic.allergens?.sort(), [
    "fish",
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.equal(daikayaFriedGarlic.allergens?.includes("shellfish"), false);
  assert.ok(daikayaHarami);
  assert.deepEqual(daikayaHarami.allergens?.sort(), ["gluten", "wheat"]);
  assert.equal(daikayaHarami.allergens?.includes("milk"), false);
  assert.ok(daikayaNatto);
  assert.deepEqual(daikayaNatto.allergens?.sort(), ["gluten", "soy", "wheat"]);
  assert.equal(daikayaNatto.allergens?.includes("fish"), false);
  assert.ok(daikayaSpicySesame);
  assert.deepEqual(daikayaSpicySesame.allergens?.sort(), [
    "gluten",
    "peanut",
    "sesame",
    "wheat",
  ]);
  assert.equal(daikayaSpicySesame.allergens?.includes("milk"), false);
  assert.ok(daikayaCatfish);
  assert.deepEqual(daikayaCatfish.allergens?.sort(), ["egg", "fish"]);
  assert.ok(daikayaShoyu);
  assert.deepEqual(daikayaShoyu.allergens?.sort(), [
    "egg",
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.ok(daikayaSoftServe);
  assert.deepEqual(daikayaSoftServe.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(
    bantamKing?.officialAllergenRemediationBucket,
    "official-partial",
  );
  assert.ok((bantamKing?.allergenDataStatus?.officialItemCount ?? 0) >= 26);
  assert.equal(
    bantamKing?.items.some(
      (item) => item.id === "made-with-valrhona-chocolate-and",
    ),
    false,
  );
  assert.equal(
    bantamKing?.items.some(
      (item) =>
        item.id ===
        "valrhona-chocolate-and-rendered-chicken-fat-come-together-to-create-this-decadent-cookie",
    ),
    false,
  );
  assert.equal(
    bantamKing?.items.some((item) => item.id === "weekday-lunch-deal"),
    false,
  );
  assert.equal(
    bantamKing?.items.some((item) => item.id === "ramen"),
    false,
  );
  assert.equal(
    bantamKing?.items.some((item) => item.id === "japanese-fish-cake"),
    false,
  );
  assert.ok(bantamKohi);
  assert.deepEqual(bantamKohi.allergens?.sort(), ["milk"]);
  assert.ok(bantamCookie);
  assert.deepEqual(bantamCookie.allergens?.sort(), ["gluten", "milk", "wheat"]);
  assert.ok(bantamNaruto);
  assert.deepEqual(bantamNaruto.allergens?.sort(), ["fish"]);
  assert.ok(bantamNitamago);
  assert.deepEqual(bantamNitamago.allergens?.sort(), ["egg"]);
  assert.ok(bantamGyoza);
  assert.deepEqual(bantamGyoza.allergens?.sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok(bantamDrippings);
  assert.deepEqual(bantamDrippings.allergens?.sort(), [
    "gluten",
    "milk",
    "soy",
    "wheat",
  ]);
  assert.ok(bantamOnsenRice);
  assert.deepEqual(bantamOnsenRice.allergens?.sort(), [
    "egg",
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.ok(bantamSpicyMiso);
  assert.deepEqual(bantamSpicyMiso.allergens?.sort(), [
    "fish",
    "peanut",
    "soy",
  ]);
  assert.ok(bantamVeggieTantanmen);
  assert.deepEqual(bantamVeggieTantanmen.allergens?.sort(), [
    "peanut",
    "sesame",
    "soy",
  ]);
  assert.ok(bantamMochiIceCream);
  assert.deepEqual(bantamMochiIceCream.allergens?.sort(), ["milk"]);
  assert.ok(bantamCurrySnowPlate);
  assert.equal(bantamCurrySnowPlate.allergenSourceType, "unavailable");
  assert.equal(
    yourOnlyFriend?.officialAllergenRemediationBucket,
    "official-partial",
  );
  assert.ok((yourOnlyFriend?.allergenDataStatus?.officialItemCount ?? 0) >= 20);
  assert.equal(
    yourOnlyFriend?.items.some(
      (item) =>
        item.id ===
        "a-guide-to-the-best-chicken-sandwiches-in-dc-nomtastic-foods",
    ),
    false,
  );
  assert.ok(yofAtlanticBeachPie);
  assert.deepEqual(yofAtlanticBeachPie.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(yofButterfinger);
  assert.deepEqual(yofButterfinger.allergens?.sort(), ["milk", "peanut"]);
  assert.ok(yofDopeBeetz);
  assert.deepEqual(yofDopeBeetz.allergens?.sort(), ["sesame", "soy"]);
  assert.equal(yofDopeBeetz.allergens?.includes("gluten"), false);
  assert.equal(yofDopeBeetz.allergens?.includes("wheat"), false);
  assert.ok(yofFishFryday);
  assert.deepEqual(yofFishFryday.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(yofHotFish);
  assert.deepEqual(yofHotFish.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(yofHotNug);
  assert.deepEqual(yofHotNug.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "sesame",
    "soy",
    "wheat",
  ]);
  assert.ok(yofSpicyPavo);
  assert.deepEqual(yofSpicyPavo.allergens?.sort(), [
    "egg",
    "gluten",
    "mustard",
    "peanut",
    "sesame",
    "soy",
    "wheat",
  ]);
  assert.equal(
    taqueriaHabanero?.officialAllergenRemediationBucket,
    "official-partial",
  );
  assert.ok(
    (taqueriaHabanero?.allergenDataStatus?.officialItemCount ?? 0) >= 26,
  );
  assert.ok(thCamarones);
  assert.deepEqual(thCamarones.allergens?.sort(), ["shellfish"]);
  assert.ok(thChilaquiles);
  assert.deepEqual(thChilaquiles.allergens?.sort(), ["egg", "milk"]);
  assert.equal(thChilaquiles.allergens?.includes("shellfish"), false);
  assert.ok(thChileRelleno);
  assert.deepEqual(thChileRelleno.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(thChoriqueso);
  assert.deepEqual(thChoriqueso.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(thFajitaMixta);
  assert.deepEqual(thFajitaMixta.allergens?.sort(), ["shellfish"]);
  assert.ok(thScallopTaco);
  assert.deepEqual(thScallopTaco.allergens?.sort(), ["egg", "shellfish"]);
  assert.ok(thSideMole);
  assert.deepEqual(thSideMole.allergens?.sort(), ["tree-nut"]);
  assert.ok(thSideShrimp);
  assert.deepEqual(thSideShrimp.allergens?.sort(), ["shellfish"]);
  assert.ok(thTacoTray);
  assert.equal(thTacoTray.allergenSourceType, "unavailable");
  assert.ok(thTresLeches);
  assert.deepEqual(thTresLeches.allergens?.sort(), ["gluten", "milk", "wheat"]);

  assert.ok(baklawa);
  assert.deepEqual(baklawa.allergens, ["tree-nut"]);
  assert.equal(baklawa.allergens?.includes("milk"), false);
  assert.equal(
    /contains dairy/i.test(JSON.stringify(baklawa.evidence ?? [])),
    false,
  );

  assert.equal(
    playa?.items.some((item) => item.id === "our"),
    false,
  );
  assert.equal(
    pastis?.items.some((item) => item.name === "lemon, Bordier butter"),
    false,
  );
  assert.equal(
    pastis?.items.some((item) => item.name === "passionfruit, hazelnut"),
    false,
  );
  assert.ok((pastis?.allergenDataStatus?.officialItemCount ?? 0) >= 70);
  assert.ok(pastisBarSteak);
  assert.equal(pastisBarSteak.allergenSourceType, "official-ingredients");
  assert.deepEqual(pastisBarSteak.allergens ?? [], ["milk"]);
  assert.match(JSON.stringify(pastisBarSteak.evidence ?? []), /butter/i);
  assert.ok(pastisSeafoodPlateau);
  assert.deepEqual(pastisSeafoodPlateau.allergens ?? [], ["shellfish"]);
  assert.ok(pastisCroissant);
  assert.deepEqual(pastisCroissant.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(pastisChickenSandwich);
  assert.deepEqual(pastisChickenSandwich.allergens?.sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.ok(pastisStickyToffee);
  assert.deepEqual(pastisStickyToffee.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.equal(
    elPresidente?.items.some((item) =>
      /^poquito dinero/i.test(item.name ?? ""),
    ),
    false,
  );
  assert.equal(
    elPresidente?.items.some(
      (item) => item.name === "charred habanero, jicama, mint, basil",
    ),
    false,
  );
  assert.equal(
    elPresidente?.items.some((item) => item.name === "(DESSERT)"),
    false,
  );
  assert.ok((elPresidente?.allergenDataStatus?.officialItemCount ?? 0) >= 40);
  assert.ok(tacosAlCarbon);
  assert.equal(tacosAlCarbon.allergenSourceType, "official-ingredients");
  assert.deepEqual(tacosAlCarbon.allergens ?? [], ["milk"]);
  assert.ok(elPresidenteCrabGuacamole);
  assert.deepEqual(elPresidenteCrabGuacamole.allergens ?? [], ["shellfish"]);
  assert.ok(elPresidenteCaesar);
  assert.deepEqual(elPresidenteCaesar.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(elPresidenteQuesoFundido);
  assert.deepEqual(elPresidenteQuesoFundido.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(elPresidenteFriedChickenTorta);
  assert.deepEqual(elPresidenteFriedChickenTorta.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(elPresidenteSundae);
  assert.deepEqual(elPresidenteSundae.allergens?.sort(), [
    "milk",
    "peanut",
    "tree-nut",
  ]);

  assert.equal(
    cane?.items.some((item) => item.id === "sorrel-limeade"),
    false,
  );
  assert.equal(
    cane?.items.some((item) => item.id === "with-chaser-or-neat"),
    false,
  );
  assert.equal(
    cane?.items.some((item) => item.id === "12-hour-marinated"),
    false,
  );
  assert.equal(
    cane?.items.some(
      (item) => item.id === "personal-omnivore-serves-1-choose-1-protein-beef",
    ),
    false,
  );
  assert.equal(
    cane?.items.some(
      (item) =>
        item.id ===
        "pineapple-chowmango-chutneyculantro-saucechadon-benitamarind-saucehouse-pepper-sauceeach",
    ),
    false,
  );
  assert.equal(
    cane?.items.some(
      (item) => item.name === "Fried drums glazed in oyster sauce",
    ),
    false,
  );
  assert.equal(
    cane?.items.some(
      (item) =>
        item.name === "Jasmine rice gently cooked in coconut milk and spices",
    ),
    false,
  );
  assert.equal(
    cane?.items.some(
      (item) => item.name === "Trini pastry layered with currants/ coconut",
    ),
    false,
  );
  assert.equal(
    cane?.items.some(
      (item) =>
        item.name ===
        "Trini-style wonton stuffed with spicy shrimp and served with a culantro-soy sauce",
    ),
    false,
  );
  assert.equal(
    cane?.items.some((item) => item.name === "Trini-Chinese Chicken"),
    true,
  );
  assert.equal(
    cane?.items.some((item) => item.name === "Coconut Rice"),
    true,
  );
  assert.equal(
    cane?.items.some((item) => item.name === "Currant Roll"),
    true,
  );
  assert.equal(
    cane?.items.some((item) => item.name === "Shrimp Wontons"),
    true,
  );
  assert.match(
    cane?.items.find((item) => item.id === "jerk-wings")?.description ?? "",
    /^Twelve-hour marinated/,
  );
  assert.equal(cane?.officialAllergenStatus, "extracted");
  assert.equal(
    cane?.officialAllergenRemediationBucket,
    "supported-cross-contact",
  );
  assert.ok(
    cane?.items.every(
      (item) =>
        item.allergenSourceType === "official-global-cross-contact-note" &&
        item.mayContain.includes("wheat") &&
        item.mayContain.includes("shellfish"),
    ),
  );

  assert.ok(banditQueso);
  assert.deepEqual([...banditQueso.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(banditNachos);
  assert.deepEqual([...banditNachos.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok((banditTaco?.allergenDataStatus?.officialItemCount ?? 0) >= 70);
  assert.ok(banditBreakfastTaco);
  assert.deepEqual([...banditBreakfastTaco.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(banditFishTaco);
  assert.deepEqual([...banditFishTaco.allergens].sort(), [
    "fish",
    "gluten",
    "wheat",
  ]);
  assert.ok(banditShrimpTaco);
  assert.deepEqual([...banditShrimpTaco.allergens].sort(), [
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(banditTorta);
  assert.deepEqual([...banditTorta.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(banditTresLeches);
  assert.deepEqual([...banditTresLeches.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(banditVeggieTaco);
  assert.deepEqual([...banditVeggieTaco.allergens].sort(), ["milk"]);

  assert.ok(maman);
  assert.ok((maman.allergenDataStatus?.officialItemCount ?? 0) >= 85);
  assert.ok(mamanCaitlinsWrap);
  assert.deepEqual([...mamanCaitlinsWrap.allergens].sort(), ["egg", "milk"]);
  assert.ok(mamanLalitasWrap);
  assert.deepEqual([...mamanLalitasWrap.allergens].sort(), ["milk"]);
  assert.ok(mamanCaesarWrap);
  assert.deepEqual([...mamanCaesarWrap.allergens].sort(), ["egg", "milk"]);
  assert.ok(mamanSalmonCroissant);
  assert.deepEqual([...mamanSalmonCroissant.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(mamanGreenGoddess);
  assert.deepEqual([...mamanGreenGoddess.allergens].sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok(mamanBreakfastSandwich);
  assert.deepEqual([...mamanBreakfastSandwich.allergens].sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.ok(mamanTahiniLatte);
  assert.deepEqual([...mamanTahiniLatte.allergens].sort(), ["milk", "sesame"]);
  assert.ok(mamanVeganGfZucchini);
  assert.deepEqual([...mamanVeganGfZucchini.allergens].sort(), ["tree-nut"]);

  assert.ok(cuttlefish);
  assert.equal(cuttlefish.allergenSourceType, "official-ingredients");
  assert.deepEqual([...cuttlefish.allergens].sort(), ["peanut", "shellfish"]);

  assert.ok(branzino);
  assert.deepEqual([...branzino.allergens].sort(), ["fish", "gluten"]);
  assert.ok(calamari);
  assert.deepEqual([...calamari.allergens].sort(), ["shellfish", "soy"]);
  assert.ok(rolleDiPollo);
  assert.deepEqual([...rolleDiPollo.allergens].sort(), ["milk", "soy"]);
  assert.equal(ilCanale?.officialAllergenRemediationBucket, "official-partial");
  assert.ok((ilCanale?.allergenDataStatus?.officialItemCount ?? 0) >= 116);
  assert.equal(
    ilCanale?.items.some((item) => item.id === "gluten-free-gf"),
    false,
  );
  assert.equal(
    ilCanale?.items.some(
      (item) =>
        item.id ===
          "organic-bread-with-choice-of-side-house-salad-or-french-fries" ||
        item.id ===
          "no-san-marzano-tomato-sauce-our-pizza-is-made-with-organic-100percent-italian-wheat-00-flour" ||
        item.id === "penne-made-with-rice-and-corn-with-choice-of-sauce",
    ),
    false,
  );
  assert.ok(ilCanaleMarinara);
  assert.deepEqual([...ilCanaleMarinara.allergens].sort(), ["gluten", "wheat"]);
  assert.equal(ilCanaleMarinara.allergens?.includes("milk"), false);
  assert.ok(ilCanaleGlutenFreePizza);
  assert.equal(ilCanaleGlutenFreePizza.allergenSourceType, "unavailable");
  assert.deepEqual(ilCanaleGlutenFreePizza.allergens ?? [], []);
  assert.ok(ilCanaleUovo);
  assert.deepEqual([...ilCanaleUovo.allergens].sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.ok(ilCanaleFocaccia);
  assert.deepEqual([...ilCanaleFocaccia.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(ilCanaleLobsterRavioli);
  assert.deepEqual([...ilCanaleLobsterRavioli.allergens].sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(ilCanaleTortaSiciliana);
  assert.deepEqual([...ilCanaleTortaSiciliana.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(ilCanaleTunnarella);
  assert.deepEqual([...ilCanaleTunnarella.allergens].sort(), ["fish"]);

  assert.equal(
    osteriaMozza?.items.some((item) => item.id === "from-the-mozzarella-bar"),
    false,
  );
  assert.ok(coniDiPizza);
  assert.equal(coniDiPizza.allergenSourceType, "unavailable");
  assert.deepEqual(coniDiPizza.allergens ?? [], []);
  assert.ok(mozzarella);
  assert.equal(mozzarella.allergenSourceType, "unavailable");
  assert.equal(osteriaMozza?.officialAllergenStatus, "not-found");

  assert.equal(
    kizuna?.items.some((item) => item.id === "from-the-sushi-bar"),
    false,
  );

  assert.ok(chiko);
  assert.ok((chiko.allergenDataStatus?.officialItemCount ?? 0) >= 25);
  assert.ok(chikoNoodles);
  assert.deepEqual([...chikoNoodles.allergens].sort(), ["gluten", "wheat"]);
  assert.ok(chikoShrimp);
  assert.deepEqual([...chikoShrimp.allergens].sort(), [
    "gluten",
    "shellfish",
    "soy",
    "wheat",
  ]);
  assert.ok(chikoPop);
  assert.deepEqual([...chikoPop.allergens].sort(), [
    "peanut",
    "sesame",
    "tree-nut",
  ]);
  assert.ok(chikoFullMonty);
  assert.deepEqual([...chikoFullMonty.allergens].sort(), [
    "egg",
    "fish",
    "milk",
  ]);
  assert.ok(chikoGfGarden);
  assert.equal(chikoGfGarden.allergenSourceType, "unavailable");
  assert.deepEqual(chikoGfGarden.allergens ?? [], []);

  assert.ok(muncheez);
  assert.ok((muncheez.allergenDataStatus?.officialItemCount ?? 0) >= 30);
  assert.equal(
    muncheez.items.some(
      (item) => item.id === "crafted-fresh-open-late-made-to-order",
    ),
    false,
  );
  assert.equal(
    muncheez.items.some(
      (item) =>
        item.id === "silky-authentic-lebanese-hummus-with-premium-tahini",
    ),
    false,
  );
  assert.equal(
    muncheez.items.some(
      (item) => item.id === "tomatoes-pickled-turnips-lettuce-tahini",
    ),
    false,
  );
  assert.ok(muncheezAdwani);
  assert.deepEqual([...muncheezAdwani.allergens].sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.ok(muncheezHummus);
  assert.deepEqual([...muncheezHummus.allergens].sort(), ["sesame"]);
  assert.ok(muncheezKibbeh);
  assert.deepEqual([...muncheezKibbeh.allergens].sort(), [
    "gluten",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(muncheezNutellaCrepe);
  assert.deepEqual([...muncheezNutellaCrepe.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(muncheezGrapeLeaves);
  assert.equal(muncheezGrapeLeaves.allergenSourceType, "official-ingredients");
  assert.deepEqual(muncheezGrapeLeaves.allergens ?? [], []);

  assert.ok(peetsDmv);
  assert.ok(peetsChain);
  assert.ok((peetsDmv.allergenDataStatus?.officialItemCount ?? 0) >= 35);
  assert.ok((peetsChain.allergenDataStatus?.officialItemCount ?? 0) >= 35);
  assert.equal(
    peetsChain.items.some((item) => /order now$/i.test(item.name)),
    false,
  );
  assert.equal(
    peetsChain.items.some((item) => item.id === "artisanal-food"),
    false,
  );
  assert.equal(
    peetsChain.items.some((item) => item.id === "visit-a-peets-near-you"),
    false,
  );
  assert.equal(
    peetsChain.items.some(
      (item) => item.id === "sparkling-watermelon-matcha-spritz",
    ),
    false,
  );
  assert.equal(
    peetsDmv.items.some(
      (item) => item.id === "sparkling-watermelon-matcha-spritz",
    ),
    false,
  );
  assert.ok(peetsBrioche);
  assert.deepEqual([...peetsBrioche.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(peetsOatLatte);
  assert.equal(peetsOatLatte.allergenSourceType, "unavailable");
  assert.deepEqual(peetsOatLatte.allergens ?? [], []);
  assert.ok(peetsMatchaProtein);
  assert.deepEqual(peetsMatchaProtein.allergens ?? [], ["milk"]);
  assert.ok(peetsPlantBased);
  assert.deepEqual([...peetsPlantBased.allergens].sort(), ["gluten", "wheat"]);

  assert.ok(dailyProvisions);
  assert.ok((dailyProvisions.allergenDataStatus?.officialItemCount ?? 0) >= 40);
  assert.ok(dailyBroccoliMelt);
  assert.equal(dailyBroccoliMelt.allergenSourceType, "official-ingredients");
  assert.deepEqual([...dailyBroccoliMelt.allergens].sort(), [
    "gluten",
    "milk",
    "soy",
    "wheat",
  ]);
  assert.ok(dailyChickenSausageEgg);
  assert.deepEqual([...dailyChickenSausageEgg.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
  ]);
  assert.ok(dailyChefyMarket);
  assert.deepEqual([...dailyChefyMarket.allergens].sort(), [
    "egg",
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.ok(dailyGoldilox);
  assert.deepEqual([...dailyGoldilox.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(dailyTunaMelt);
  assert.deepEqual([...dailyTunaMelt.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(dailyCaesar);
  assert.deepEqual([...dailyCaesar.allergens].sort(), ["egg", "fish", "milk"]);

  assert.ok(zestyGarden);
  assert.equal(zestyGarden.allergenSourceType, "official-ingredients");
  assert.deepEqual(zestyGarden.allergens ?? [], []);
  assert.match(zestyGarden.description ?? "", /Nut-Free|Dairy-Free|Egg-Free/i);
  assert.ok((twoFifty?.allergenDataStatus?.officialItemCount ?? 0) >= 25);
  assert.equal(
    twoFifty?.allergenDataStatus?.officialEvidence?.bucket,
    "official-disclosure-only",
  );
  assert.ok(twoFiftyToast);
  assert.deepEqual([...twoFiftyToast.allergens].sort(), ["gluten", "wheat"]);
  assert.ok(twoFiftyChimichurri);
  assert.deepEqual([...twoFiftyChimichurri.allergens].sort(), [
    "milk",
    "mustard",
    "tree-nut",
  ]);
  assert.ok(twoFiftyRiceBeans);
  assert.deepEqual([...twoFiftyRiceBeans.allergens].sort(), ["tree-nut"]);
  assert.ok(twoFiftyMac);
  assert.deepEqual([...twoFiftyMac.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(twoFiftyPorkSandwich);
  assert.deepEqual([...twoFiftyPorkSandwich.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(filomenaOil);
  assert.equal(filomenaOil.description, undefined);
  assert.equal(filomenaOil.allergenSourceType, "unavailable");
  assert.equal(filomena?.officialAllergenStatus, "not-found");
  assert.equal(filomena?.officialAllergenRemediationBucket, "not-found");

  assert.ok(sourCream);
  assert.equal(sourCream.allergenSourceType, "official-allergen-menu");
  assert.deepEqual(sourCream.allergens ?? [], ["milk"]);
  assert.equal(dosToros?.officialAllergenStatus, "extracted");

  assert.ok(horchata);
  assert.deepEqual([...horchata.allergens].sort(), ["milk", "tree-nut"]);
  assert.equal(
    elViejo?.items.some((item) => item.id === "cater-your-next-gathering"),
    false,
  );
  assert.ok((elViejo?.allergenDataStatus?.officialItemCount ?? 0) >= 10);
  assert.ok(elViejoBaleada);
  assert.deepEqual(elViejoBaleada.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(elViejoPanGuanaco);
  assert.deepEqual(elViejoPanGuanaco.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(elViejoPescado);
  assert.deepEqual(elViejoPescado.allergens ?? [], ["fish"]);
  assert.ok(elViejoTamalElote);
  assert.deepEqual(elViejoTamalElote.allergens ?? [], ["milk"]);

  assert.ok(taporiCheesecake);
  assert.deepEqual([...taporiCheesecake.allergens].sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok((tapori?.allergenDataStatus?.officialItemCount ?? 0) >= 25);
  assert.ok(taporiButterChicken);
  assert.deepEqual(taporiButterChicken.allergens?.sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(taporiCrabIdli);
  assert.deepEqual(taporiCrabIdli.allergens?.sort(), ["shellfish", "tree-nut"]);
  assert.ok(taporiShrimp);
  assert.deepEqual(taporiShrimp.allergens ?? [], ["shellfish"]);
  assert.ok(taporiVadaPav);
  assert.deepEqual(taporiVadaPav.allergens?.sort(), ["gluten", "wheat"]);
  assert.ok(taporiNaan);
  assert.deepEqual([...taporiNaan.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);

  assert.ok((gregorys?.allergenDataStatus?.officialItemCount ?? 0) >= 15);
  assert.ok(gregorysDeluxe);
  assert.deepEqual(gregorysDeluxe.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "soy",
    "wheat",
  ]);
  assert.ok(gregorysVeganDeluxe);
  assert.deepEqual(gregorysVeganDeluxe.allergens?.sort(), [
    "gluten",
    "tree-nut",
    "wheat",
  ]);
  assert.equal(gregorysVeganDeluxe.allergens?.includes("egg"), false);
  assert.equal(gregorysVeganDeluxe.allergens?.includes("milk"), false);
  assert.ok(gregorysVeganBar);
  assert.deepEqual(gregorysVeganBar.allergens?.sort(), [
    "peanut",
    "sesame",
    "tree-nut",
  ]);
  assert.ok(gregorysProteinCoffee);
  assert.deepEqual(gregorysProteinCoffee.allergens?.sort(), [
    "peanut",
    "tree-nut",
  ]);

  assert.ok((bonFresco?.allergenDataStatus?.officialItemCount ?? 0) >= 40);
  assert.ok(bonFrescoCaesar);
  assert.deepEqual(bonFrescoCaesar.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(bonFrescoMozz);
  assert.deepEqual(bonFrescoMozz.allergens?.sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(bonFrescoTuna);
  assert.deepEqual(bonFrescoTuna.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(bonFrescoVeggie);
  assert.deepEqual(bonFrescoVeggie.allergens?.sort(), ["gluten", "wheat"]);
  assert.equal(bonFrescoVeggie.allergens?.includes("milk"), false);
  assert.ok(bonFrescoMediterranean);
  assert.deepEqual(bonFrescoMediterranean.allergens?.sort(), [
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);

  assert.ok(caviar);
  assert.deepEqual([...caviar.allergens].sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(iceCream);
  assert.equal(iceCream.allergenSourceType, "official-ingredients");
  assert.deepEqual(iceCream.allergens ?? [], ["milk"]);

  assert.equal(
    burtons?.items.some((item) => item.id === "burgers-and-sandwiches"),
    false,
  );
  assert.equal(
    burtons?.items.some(
      (item) => item.id === "gluten-free-burgers-and-sandwiches",
    ),
    false,
  );
  assert.ok(burtonsFirecracker);
  assert.deepEqual([...burtonsFirecracker.allergens].sort(), [
    "sesame",
    "shellfish",
  ]);
  assert.deepEqual(burtonsFirecracker.mayContain ?? [], ["milk"]);

  assert.equal(
    ikea?.items.some((item) => item.id === "ikea-college-park"),
    false,
  );
  assert.equal(ikea?.officialAllergenStatus, "not-found");

  assert.equal(
    planta?.items.some((item) => item.id === "hand-rolls"),
    false,
  );
  assert.equal(
    planta?.items.some((item) => item.id === "signatures-serves"),
    false,
  );
  assert.equal(
    planta?.items.some(
      (item) =>
        item.id === "sushithe-sushi-boxenjoy-our-sushi-box-that-includes",
    ),
    false,
  );

  assert.ok(guajilloMole);
  assert.deepEqual(guajilloMole.allergens ?? [], ["tree-nut"]);

  assert.equal(
    karahi?.items.some((item) => item.id === "cad"),
    false,
  );
  assert.equal(
    karahi?.items.some((item) => item.id === "category-naan-bread-cad"),
    false,
  );
  assert.ok(butterNaan);
  assert.equal(
    butterNaan.allergenSourceType,
    "official-product-allergen-section",
  );
  assert.deepEqual([...butterNaan.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.equal(
    northside?.items.some((item) => item.id === "breakfast-served-all-day"),
    false,
  );
  assert.ok(northsideGranola);
  assert.deepEqual([...northsideGranola.allergens].sort(), [
    "milk",
    "tree-nut",
  ]);

  assert.equal(
    stJames?.items.some(
      (item) => item.id === "pasta-baked-in-cheese-sauce-serves-2",
    ),
    false,
  );
  assert.equal(
    stJames?.items.some((item) => item.id === "brisket-platter"),
    false,
  );
  assert.ok(macaroniPie);
  assert.deepEqual([...macaroniPie.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(macaroniPie.mayContain?.includes("shellfish"), true);

  assert.ok(goiCuon);
  assert.deepEqual([...goiCuon.allergens].sort(), ["peanut", "shellfish"]);
  assert.ok(chaGio);
  assert.deepEqual([...chaGio.allergens].sort(), ["fish", "shellfish"]);

  assert.ok(sokoYellowfin);
  assert.equal(
    soko?.items.some((item) => item.id === "no-substitutions"),
    false,
  );
  assert.equal(soko?.officialAllergenStatus, "extracted");
  assert.equal(
    soko?.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    30,
  );
  assert.deepEqual([...sokoYellowfin.allergens].sort(), [
    "egg",
    "fish",
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.ok(sokoMurrays);
  assert.deepEqual([...sokoMurrays.allergens].sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.ok(sokoCowboy);
  assert.deepEqual([...sokoCowboy.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(sokoPlainPatty);
  assert.equal(sokoPlainPatty.allergenSourceType, "unavailable");
  assert.deepEqual(sokoPlainPatty.allergens ?? [], []);

  assert.ok(gracesMandarin);
  assert.equal(gracesMandarin.officialAllergenStatus, "extracted");
  assert.equal(
    gracesMandarin.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    116,
  );
  assert.ok(gracesCaliforniaRoll);
  assert.equal(gracesCaliforniaRoll.allergenSourceType, "unavailable");
  assert.deepEqual(gracesCaliforniaRoll.allergens ?? [], []);
  assert.ok(gracesChesapeakeRoll);
  assert.deepEqual([...gracesChesapeakeRoll.allergens].sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(gracesGoldenShrimpRoll);
  assert.deepEqual([...gracesGoldenShrimpRoll.allergens].sort(), [
    "gluten",
    "sesame",
    "shellfish",
    "wheat",
  ]);
  assert.ok(gracesThaiStreetNoodle);
  assert.deepEqual([...gracesThaiStreetNoodle.allergens].sort(), [
    "egg",
    "fish",
    "gluten",
    "peanut",
    "wheat",
  ]);
  assert.ok(gracesVegetarianMedley);
  assert.deepEqual([...gracesVegetarianMedley.allergens].sort(), [
    "soy",
    "tree-nut",
  ]);
  assert.ok(gracesWhiteRice);
  assert.equal(gracesWhiteRice.allergenSourceType, "unavailable");
  assert.deepEqual(gracesWhiteRice.allergens ?? [], []);

  assert.ok(boulangerieChristophe);
  assert.equal(
    boulangerieChristophe.items.some(
      (item) => item.id === "boulangerie-christophe-potomac",
    ),
    false,
  );
  assert.equal(
    boulangerieChristophe.items.some((item) => item.id === "item"),
    false,
  );
  assert.equal(boulangerieChristophe.officialAllergenStatus, "extracted");
  assert.equal(
    boulangerieChristophe.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    43,
  );
  assert.ok(boulangerieAppleTartelette);
  assert.deepEqual([...boulangerieAppleTartelette.allergens].sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(boulangerieCafeAuLait);
  assert.deepEqual([...boulangerieCafeAuLait.allergens].sort(), ["milk"]);
  assert.ok(boulangerieMacaron);
  assert.deepEqual([...boulangerieMacaron.allergens].sort(), [
    "egg",
    "tree-nut",
  ]);
  assert.equal(boulangerieMacaron.allergens.includes("gluten"), false);
  assert.ok(boulangerieDripCoffee);
  assert.equal(boulangerieDripCoffee.allergenSourceType, "unavailable");
  assert.deepEqual(boulangerieDripCoffee.allergens ?? [], []);
  assert.ok(boulangerieQuicheLorraine);
  assert.deepEqual([...boulangerieQuicheLorraine.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(genkiIzakaya);
  assert.equal(genkiIzakaya.officialAllergenStatus, "extracted");
  assert.equal(
    genkiIzakaya.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    123,
  );
  assert.ok(genkiWagyu);
  assert.equal(genkiWagyu.allergenSourceType, "unavailable");
  assert.deepEqual(genkiWagyu.allergens ?? [], []);
  assert.ok(genkiAacRoll);
  assert.equal(genkiAacRoll.allergenSourceType, "unavailable");
  assert.deepEqual(genkiAacRoll.allergens ?? [], []);
  assert.ok(genkiAlaskaRoll);
  assert.deepEqual(genkiAlaskaRoll.allergens ?? [], ["fish"]);
  assert.ok(genkiShrimpTempuraRoll);
  assert.deepEqual([...genkiShrimpTempuraRoll.allergens].sort(), [
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(genkiPhillyRoll);
  assert.deepEqual([...genkiPhillyRoll.allergens].sort(), ["fish", "milk"]);
  assert.ok(genkiTonkotsuRamen);
  assert.deepEqual([...genkiTonkotsuRamen.allergens].sort(), [
    "egg",
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok(genkiYakiUdon);
  assert.deepEqual([...genkiYakiUdon.allergens].sort(), [
    "fish",
    "gluten",
    "wheat",
  ]);

  assert.ok(dogwoodTavern);
  assert.equal(dogwoodTavern.officialAllergenStatus, "extracted");
  assert.equal(
    dogwoodTavern.items.filter(
      (item) => item.allergenSourceType !== "unavailable",
    ).length,
    49,
  );
  assert.ok(dogwoodBuddhaBowl);
  assert.deepEqual([...dogwoodBuddhaBowl.allergens].sort(), [
    "egg",
    "milk",
    "tree-nut",
  ]);
  assert.equal(dogwoodBuddhaBowl.allergens.includes("fish"), false);
  assert.equal(dogwoodBuddhaBowl.allergens.includes("shellfish"), false);
  assert.ok(dogwoodNachos);
  assert.deepEqual(dogwoodNachos.allergens ?? [], ["milk"]);
  assert.equal(dogwoodNachos.allergens.includes("gluten"), false);
  assert.ok(dogwoodCarneAsada);
  assert.deepEqual([...dogwoodCarneAsada.allergens].sort(), [
    "gluten",
    "wheat",
  ]);
  assert.ok(dogwoodAppleChickenSalad);
  assert.deepEqual([...dogwoodAppleChickenSalad.allergens].sort(), [
    "milk",
    "tree-nut",
  ]);
  assert.ok(dogwoodFriedChickenSandwich);
  assert.deepEqual([...dogwoodFriedChickenSandwich.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);

  assert.ok(helloBetty);
  assert.equal(
    helloBetty.items.some((item) => item.id === "market-price"),
    false,
  );
  assert.equal(
    helloBetty.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    65,
  );
  assert.ok(helloBettyAlfredo);
  assert.deepEqual([...helloBettyAlfredo.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(helloBettyAvocadoToast);
  assert.deepEqual([...helloBettyAvocadoToast.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(helloBettyAvocadoToast.allergens.includes("shellfish"), false);
  assert.ok(helloBettySoftshellCrab);
  assert.deepEqual([...helloBettySoftshellCrab.allergens].sort(), [
    "egg",
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(helloBettyCoffee);
  assert.equal(helloBettyCoffee.allergenSourceType, "unavailable");
  assert.deepEqual(helloBettyCoffee.allergens ?? [], []);
  assert.equal(helloBettyCoffee.description, undefined);
  assert.ok(helloBettyVanillaGelato);
  assert.deepEqual(helloBettyVanillaGelato.allergens ?? [], ["milk"]);
  assert.equal(
    /Sage Restaurant Concepts|undercooked/i.test(
      helloBettyVanillaGelato.description ?? "",
    ),
    false,
  );

  assert.ok(moes);
  assert.equal(
    moes.items.filter((item) => item.allergenSourceType !== "unavailable")
      .length,
    28,
  );
  assert.ok(moesQueso);
  assert.deepEqual(moesQueso.allergens ?? [], ["milk"]);
  assert.ok(moesDippers);
  assert.deepEqual([...moesDippers.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(moesChipsDips);
  assert.deepEqual(moesChipsDips.allergens ?? [], ["milk"]);
  assert.ok(moesKidsMilk);
  assert.deepEqual(moesKidsMilk.allergens ?? [], ["milk"]);
  assert.ok(moesKidsTaco);
  assert.deepEqual([...moesKidsTaco.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(moesCookie);
  assert.deepEqual([...moesCookie.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(moesWater);
  assert.equal(moesWater.allergenSourceType, "unavailable");
  assert.deepEqual(moesWater.allergens ?? [], []);
  assert.ok(moesTacoValuePack);
  assert.deepEqual(moesTacoValuePack.allergens ?? [], ["milk"]);

  assert.ok(geminiChocolateCake);
  assert.deepEqual(geminiChocolateCake.allergens?.sort() ?? [], [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual(geminiChocolateCake.mayContain?.sort() ?? [], [
    "soy",
    "tree-nut",
  ]);
  assert.ok(geminiCashewBrittle);
  assert.deepEqual(geminiCashewBrittle.allergens?.sort() ?? [], [
    "milk",
    "tree-nut",
  ]);
  assert.deepEqual(geminiCashewBrittle.mayContain?.sort() ?? [], [
    "soy",
    "tree-nut",
  ]);
  assert.ok(geminiMintChip);
  assert.deepEqual(geminiMintChip.allergens ?? [], ["milk"]);
  assert.deepEqual(geminiMintChip.mayContain?.sort() ?? [], [
    "soy",
    "tree-nut",
  ]);
  assert.ok(geminiPuppyChow);
  assert.deepEqual(geminiPuppyChow.allergens?.sort() ?? [], [
    "egg",
    "milk",
    "peanut",
  ]);
  assert.deepEqual(geminiPuppyChow.mayContain?.sort() ?? [], [
    "soy",
    "tree-nut",
  ]);

  assert.equal(
    peterChang?.items.some((item) => item.id === "togo-cold-dish"),
    false,
  );
  assert.equal(
    peterChang?.items.some((item) => item.id === "togo-tapas-veggie"),
    false,
  );
  assert.ok(peterSesameNoodle);
  assert.deepEqual(peterSesameNoodle.allergens ?? [], ["sesame"]);
  assert.ok(peterEggTofu);
  assert.deepEqual(peterEggTofu.allergens ?? [], ["egg"]);

  assert.equal(
    tigerDumplings?.items.some(
      (item) => item.id === "chengdu-spicy-wonton-8-spicy",
    ),
    false,
  );
  assert.ok(chengduChicken);
  assert.deepEqual(chengduChicken.allergens ?? [], ["peanut"]);
  assert.ok(hawaiianFriedRice);
  assert.deepEqual(hawaiianFriedRice.allergens ?? [], ["peanut"]);

  assert.ok(partyColeslaw);
  assert.equal(partyColeslaw.allergenSourceType, "unavailable");
  assert.deepEqual(partyColeslaw.allergens ?? [], []);
  assert.match(partyColeslaw.description ?? "", /^Party-Size Coleslaw, 32 oz/);
  assert.equal(partyColeslaw.ingredientsText, null);
  assert.equal(partyRedBeans?.description, "Party-size container of beans.");
  assert.equal(
    carvelIceCream?.description,
    "8oz cup of Carvel soft-serve ice cream.",
  );
  assert.equal(
    firenzesGelato?.description,
    "6oz individual cup of Firenzes Artisanal Gelato.",
  );
  assert.equal(mediumGreenSauce?.description, "8oz cup of our green sauce.");
  assert.equal(wholeChickenWhiteMeat?.inferredAllergenSignals, undefined);
  assert.ok(flan);
  assert.deepEqual([...flan.allergens].sort(), ["egg", "milk"]);

  assert.ok(punYaw);
  assert.equal(/\\bMains\\b/.test(punYaw.description ?? ""), false);
  assert.deepEqual([...punYaw.allergens].sort(), ["peanut", "shellfish"]);

  assert.ok(seasonalCheesecakePlatter);
  assert.equal(
    seasonalCheesecakePlatter.name,
    "Seasonal Cheesecake Dessert Platter",
  );
  assert.deepEqual(seasonalCheesecakePlatter.allergens ?? [], ["tree-nut"]);

  assert.ok(riceAndPigeonPeas);
  assert.equal(riceAndPigeonPeas.allergenSourceType, "unavailable");
  assert.deepEqual(riceAndPigeonPeas.allergens ?? [], []);
  assert.ok(arrozConGandules);
  assert.equal(arrozConGandules.allergenSourceType, "unavailable");
  assert.deepEqual(arrozConGandules.allergens ?? [], []);

  assert.equal(
    marleys?.items.some((item) => item.id === "main-entreesrasta-pasta"),
    false,
  );
  assert.ok(cajunSeafoodPasta);
  assert.deepEqual([...cajunSeafoodPasta.allergens].sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(shrimpAndGrits);
  assert.deepEqual([...shrimpAndGrits.allergens].sort(), ["milk", "shellfish"]);
  assert.ok(catfishAndGrits);
  assert.deepEqual([...catfishAndGrits.allergens].sort(), [
    "fish",
    "milk",
    "shellfish",
  ]);

  assert.equal(
    dailyDish?.items.some((item) => item.id === "wilted-fresh-greens"),
    false,
  );
  assert.ok(dailyDishSteak);
  assert.equal(dailyDishSteak.allergenSourceType, "unavailable");
  assert.ok(dailyDishCrabCake);
  assert.deepEqual(dailyDishCrabCake.allergens ?? [], ["shellfish"]);
  assert.ok(dailyDishShrimp);
  assert.deepEqual([...dailyDishShrimp.allergens].sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);

  assert.ok(donsakButterRice);
  assert.equal(donsakButterRice.allergenSourceType, "unavailable");
  assert.ok(donsakCrispyChicken);
  assert.deepEqual([...donsakCrispyChicken.allergens].sort(), ["egg", "milk"]);
  assert.ok(donsakCrab);
  assert.deepEqual([...donsakCrab.allergens].sort(), ["egg", "shellfish"]);
  assert.ok(donsakIsland);
  assert.deepEqual([...donsakIsland.allergens].sort(), ["fish", "shellfish"]);
  assert.ok(donsakRangoon);
  assert.deepEqual([...donsakRangoon.allergens].sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);

  assert.ok(redrocksSteak);
  assert.match(redrocksSteak.description ?? "", /^New York strip \(8 oz\)/);

  assert.ok(sausageRoll);
  assert.deepEqual([...sausageRoll.allergens].sort(), ["gluten", "wheat"]);
  assert.deepEqual(sausageRoll.mayContain ?? [], ["sesame"]);

  assert.ok(friedSiomai);
  assert.deepEqual([...friedSiomai.allergens].sort(), [
    "egg",
    "gluten",
    "sesame",
    "shellfish",
    "wheat",
  ]);

  assert.ok(sunflowerEdamame);
  assert.deepEqual([...sunflowerEdamame.allergens].sort(), ["peanut", "soy"]);
  assert.ok(sunflowerFriedChicken);
  assert.deepEqual([...sunflowerFriedChicken.allergens].sort(), [
    "gluten",
    "peanut",
    "soy",
    "wheat",
  ]);
  assert.ok(sunflowerWonton);
  assert.deepEqual([...sunflowerWonton.allergens].sort(), [
    "gluten",
    "peanut",
    "soy",
    "wheat",
  ]);
  assert.ok(sunflowerWontonSoup);
  assert.deepEqual([...sunflowerWontonSoup.allergens].sort(), [
    "gluten",
    "peanut",
    "soy",
    "wheat",
  ]);
  assert.ok(sunflowerMushrooms);
  assert.deepEqual([...sunflowerMushrooms.allergens].sort(), ["peanut", "soy"]);

  assert.ok(cocinerosEmpanadas);
  assert.deepEqual([...cocinerosEmpanadas.allergens].sort(), [
    "gluten",
    "milk",
  ]);
  assert.ok(cocinerosFlautasTray);
  assert.deepEqual(cocinerosFlautasTray.allergens ?? [], ["milk"]);
  assert.deepEqual(cocinerosFlautasTray.mayContain ?? [], ["gluten"]);
  assert.ok(cocinerosChipsGuac);
  assert.deepEqual(cocinerosChipsGuac.allergens ?? [], []);
  assert.deepEqual(cocinerosChipsGuac.mayContain ?? [], ["gluten"]);
  assert.ok(cocinerosSmallChips);
  assert.deepEqual(cocinerosSmallChips.allergens ?? [], []);
  assert.deepEqual(cocinerosSmallChips.mayContain ?? [], ["gluten"]);
  assert.ok(cocinerosSmallGuac);
  assert.deepEqual(cocinerosSmallGuac.allergens ?? [], []);
  assert.deepEqual(cocinerosSmallGuac.mayContain ?? [], ["gluten"]);
  assert.ok(cocinerosTostonesTray);
  assert.deepEqual(cocinerosTostonesTray.allergens ?? [], ["milk"]);
  assert.deepEqual(cocinerosTostonesTray.mayContain ?? [], ["gluten"]);

  assert.equal(
    lostDog?.items.some((item) => item.id === "for-kids-under-12"),
    false,
  );
  assert.equal(
    lostDog?.items.some((item) => item.id === "all-merchandise"),
    false,
  );
  assert.equal(
    lostDog?.items.some((item) => item.id === "join-the-pack"),
    false,
  );
  assert.equal(
    lostDog?.items.some((item) => item.id === "no-cutlery"),
    false,
  );
  assert.equal(
    lostDog?.items.some((item) => item.id === "allergy-guide"),
    false,
  );
  assert.equal(
    lostDog?.items.some((item) => item.id === "lost-dog-gourmet-pizzas"),
    false,
  );
  assert.ok(lostDogHolyCowLess);
  assert.equal(lostDogHolyCowLess.category, "Sandwiches");
  assert.deepEqual([...lostDogHolyCowLess.allergens].sort(), [
    "gluten",
    "milk",
    "soy",
    "wheat",
  ]);

  assert.equal(
    chefTony?.items.some((item) => item.id === "seafood"),
    false,
  );
  assert.equal(
    chefTony?.items.some((item) => item.id === "culinary-journal-book"),
    false,
  );
  assert.equal(
    chefTony?.items.some((item) => item.id === "doordash"),
    false,
  );
  assert.equal(
    chefTony?.items.some((item) => item.id === "flying-fish"),
    false,
  );
  assert.ok(chefTonyChoppedSalad);
  assert.equal(chefTonyChoppedSalad.category, "Salads");
  assert.deepEqual([...chefTonyChoppedSalad.allergens].sort(), [
    "milk",
    "tree-nut",
  ]);
  assert.ok(chefTonyPepperoniHemi);
  assert.equal(chefTonyPepperoniHemi.category, "Pizza");
  assert.ok(chefTonyCreamOfCrab);
  assert.equal(chefTonyCreamOfCrab.category, "Soups");
  assert.deepEqual([...chefTonyCreamOfCrab.allergens].sort(), [
    "milk",
    "shellfish",
  ]);
  assert.ok(chefTonySeafoodPaellaFamily);
  assert.equal(chefTonySeafoodPaellaFamily.category, "Family Meals");
  assert.deepEqual([...chefTonySeafoodPaellaFamily.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(chefTonyCodParmesan);
  assert.equal(chefTonyCodParmesan.category, "Seafood");
  assert.deepEqual([...chefTonyCodParmesan.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "sulfites",
    "wheat",
  ]);

  assert.ok(boardAndBrew);
  assert.ok((boardAndBrew.allergenDataStatus?.officialItemCount ?? 0) >= 60);
  assert.ok(boardAmbi);
  assert.deepEqual([...boardAmbi.allergens].sort(), [
    "gluten",
    "sulfites",
    "wheat",
  ]);
  assert.ok(boardBens);
  assert.deepEqual([...boardBens.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);
  assert.ok(boardCheesecake);
  assert.deepEqual([...boardCheesecake.allergens].sort(), [
    "gluten",
    "milk",
    "peanut",
    "wheat",
  ]);
  assert.ok(boardChickenQuinoa);
  assert.deepEqual([...boardChickenQuinoa.allergens].sort(), [
    "mustard",
    "soy",
    "sulfites",
  ]);
  assert.ok(boardKanzu);
  assert.equal(boardKanzu.allergenSourceType, "unavailable");
  assert.deepEqual(boardKanzu.allergens ?? [], []);
  assert.ok(boardSalmon);
  assert.deepEqual([...boardSalmon.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);

  assert.ok(redstone);
  assert.ok((redstone.allergenDataStatus?.officialItemCount ?? 0) >= 90);
  assert.equal(
    redstone.items.some(
      (item) => item.id === "wood-fired-flavor-without-the-wait",
    ),
    false,
  );
  assert.equal(
    redstone.items.some((item) => item.id === "celebrate-with-redstone"),
    false,
  );
  assert.ok(redstoneBananaCreamPie);
  assert.deepEqual([...redstoneBananaCreamPie.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(redstoneBuffaloShrimp);
  assert.deepEqual([...redstoneBuffaloShrimp.allergens].sort(), [
    "milk",
    "shellfish",
  ]);
  assert.ok(redstoneChickenLettuceWraps);
  assert.deepEqual(redstoneChickenLettuceWraps.allergens, ["tree-nut"]);
  assert.ok(redstoneCheesecake);
  assert.deepEqual([...redstoneCheesecake.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "peanut",
    "wheat",
  ]);
  assert.ok(redstoneAhiTuna);
  assert.deepEqual([...redstoneAhiTuna.allergens].sort(), [
    "fish",
    "soy",
    "sulfites",
  ]);
  assert.ok(redstoneRiceNoodles);
  assert.equal(redstoneRiceNoodles.allergenSourceType, "unavailable");
  assert.deepEqual(redstoneRiceNoodles.allergens ?? [], []);
  assert.ok(redstoneTempuraChicken);
  assert.deepEqual([...redstoneTempuraChicken.allergens].sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);

  assert.equal(
    menomale?.items.some((item) => item.id === "anchovies"),
    false,
  );
  assert.equal(
    menomale?.items.some((item) => item.id === "feta"),
    false,
  );
  assert.equal(
    menomale?.items.some((item) => item.id === "balsamic-glaze"),
    false,
  );
  assert.equal(
    menomale?.items.some((item) => item.id === "gluten-free-crust"),
    false,
  );
  assert.equal(
    menomale?.items.some((item) => item.id === "anchovies-full"),
    false,
  );
  assert.equal(
    menomale?.items.some((item) => item.id === "anchovies-12"),
    false,
  );
  assert.ok(menomaleAffettati);
  assert.equal(menomaleAffettati.category, "Antipasti");
  assert.deepEqual([...menomaleAffettati.allergens].sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(menomaleTiramisu);
  assert.deepEqual([...menomaleTiramisu.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(menomaleRoastedEggplantTray);
  assert.equal(menomaleRoastedEggplantTray.category, "Catering");
  assert.ok((menomale?.allergenDataStatus?.officialItemCount ?? 0) >= 110);
  assert.deepEqual([...menomaleInsalataPesce.allergens].sort(), [
    "fish",
    "shellfish",
  ]);
  assert.deepEqual([...menomaleVerdone.allergens].sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual([...menomaleRomanaFull.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...menomaleFarro.allergens].sort(), ["gluten", "wheat"]);
  assert.deepEqual([...menomalePolloVerde.allergens].sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual([...menomaleEggplantParm.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...menomaleFrittoMare.allergens].sort(), [
    "fish",
    "shellfish",
  ]);

  assert.equal(
    northsideMenu?.items.some((item) => item.id === "austin-eastcider"),
    false,
  );
  assert.equal(
    northsideMenu?.items.some((item) => item.id === "brooklyn-brewery"),
    false,
  );
  assert.equal(
    northsideMenu?.items.some(
      (item) => item.id === "breakfast-sandwiches-served-all-day",
    ),
    false,
  );
  assert.equal(
    northsideMenu?.items.some((item) => item.id === "x-large"),
    false,
  );
  assert.deepEqual(
    [...new Set(northsideMenu?.items.map((item) => item.category))]
      .filter((category) =>
        ["Espresso", "Hot Tea", "ICED", "Large", "Menu", "TEA LATTE"].includes(
          category,
        ),
      )
      .sort(),
    [],
  );
  assert.ok(northsideChips);
  assert.equal(northsideChips.category, "Sides");
  assert.equal(northsideChips.description, undefined);
  assert.match(
    northsideChips.evidence?.[0]?.text ?? "",
    /removed neighboring category\/menu text/i,
  );
  assert.ok(northsideCrackers);
  assert.equal(northsideCrackers.category, "Sides");
  assert.equal(northsideCrackers.description, undefined);
  assert.deepEqual([...(northsideCrackers.allergens ?? [])].sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok(northsideAvocadoToast);
  assert.equal(northsideAvocadoToast.category, "Breakfast");
  assert.deepEqual([...(northsideAvocadoToast.allergens ?? [])].sort(), [
    "egg",
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok(northsideSalmonSalad);
  assert.equal(northsideSalmonSalad.category, "Salads");
  assert.deepEqual([...(northsideSalmonSalad.allergens ?? [])].sort(), [
    "fish",
    "sesame",
  ]);
  assert.ok(northsideBlt);
  assert.equal(northsideBlt.category, "Sandwiches");
  assert.deepEqual([...(northsideBlt.allergens ?? [])].sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.ok(northsideGrilledCheese);
  assert.equal(northsideGrilledCheese.category, "Sandwiches");
  assert.deepEqual([...(northsideGrilledCheese.allergens ?? [])].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(northsideArnoldPalmer?.category, "Beverages");
  assert.equal(
    northsideArnoldPalmer?.description,
    "Half black iced tea, half house-made lemonade.",
  );
  assert.equal(northsideMatchaLatte?.category, "Beverages");
  assert.equal(
    northsideMatchaLatte?.description,
    "Rishi matcha tea blended with your choice of milk. Hot or iced.",
  );
  assert.equal(
    northsideNosoMatcha?.description,
    "Fresh matcha combined with steamed milk and house-made Northside signature matcha syrup.",
  );
  assert.equal(northsideHotCoffee?.description, undefined);
  assert.equal(northsideSaladBowl?.description, undefined);

  assert.ok(hisAndHers);
  assert.deepEqual(
    [...new Set(hisAndHers.items.map((item) => item.category))]
      .filter((category) => ["Items", "Menu", "Restaurant"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "bbq",
    "mayo",
    "ranch",
    "thai-chili",
    "chicken-add-on",
    "shrimp-add-on",
  ]) {
    assert.equal(
      hisAndHers.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(hisAndHersAvocadoToast?.category, "Breakfast");
  assert.deepEqual(
    [...(hisAndHersAvocadoToast?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(hisAndHersFriedRice?.category, "Sides");
  assert.deepEqual(
    [...(hisAndHersFriedRice?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "sesame", "soy", "wheat"],
  );
  assert.equal(hisAndHersQuesadilla?.category, "Appetizers");
  assert.equal(hisAndHersCrabStuffedSalmon?.category, "Seafood");
  assert.equal(hisAndHersCheesecake?.category, "Desserts");
  assert.equal(hisAndHersMac?.category, "Sides");

  assert.ok(moxies);
  assert.deepEqual(
    [...new Set(moxies.items.map((item) => item.category))]
      .filter((category) => ["Menu", "Restaurant"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "group-bookings",
    "buyout",
    "dining-room",
    "patio",
    "serving-size-g",
    "and-garlic-herb-aioli-side-super-greens-salad",
    "brioche-bun-side-super-greens-salad",
    "fresh-flavours",
  ]) {
    assert.equal(
      moxies.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(moxiesBlackenedShrimp?.category, "Seafood");
  assert.deepEqual(moxiesBlackenedShrimp?.allergens ?? [], ["shellfish"]);
  assert.equal(moxiesTacoStation?.category, "Savor & Share");
  assert.equal(moxiesChipotleChicken?.category, "Steaks & Mains");
  assert.equal(moxiesLemonQuinoa?.category, "Sides");

  assert.ok(harbour);
  assert.deepEqual(
    [...new Set(harbour.items.map((item) => item.category))]
      .filter((category) =>
        ["Menu", "Restaurant", "The Harbour Grille 13188 Marina Way"].includes(
          category,
        ),
      )
      .sort(),
    [],
  );
  for (const id of [
    "13188-marina-way-woodbridge-va",
    "apple-pie-moonshine",
    "cinn-toast-crunch",
    "get-in-touch",
    "happenings",
    "rachel-thorne",
    "the-harbour-grille",
  ]) {
    assert.equal(
      harbour.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(harbourSouthwestEggRolls?.category, "Appetizers");
  assert.deepEqual(
    [...(harbourSouthwestEggRolls?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );
  assert.equal(harbourCrabCakeSandwich?.category, "Sandwiches");
  assert.deepEqual(
    [...(harbourCrabCakeSandwich?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "shellfish", "wheat"],
  );
  assert.equal(harbourSeafoodCarbonara?.category, "Pastas");
  assert.deepEqual(
    [...(harbourSeafoodCarbonara?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "milk", "shellfish"],
  );
  assert.equal(harbourFishAndChips?.category, "Seafood");
  assert.equal(harbourHotTea?.category, "Beverages");

  assert.ok(huncho);
  assert.deepEqual(
    [...new Set(huncho.items.map((item) => item.category))]
      .filter((category) => ["Items", "Restaurant"].includes(category))
      .sort(),
    [],
  );
  for (const id of ["african-pepper-sauce", "crab-oscar", "hot-honey"]) {
    assert.equal(
      huncho.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(hunchoAhiTuna?.category, "Sushi");
  assert.deepEqual(
    [...(hunchoAhiTuna?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "shellfish"],
  );
  assert.equal(hunchoSeafoodGravy?.category, "Seafood");
  assert.deepEqual(
    [...(hunchoSeafoodGravy?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "shellfish"],
  );
  assert.equal(hunchoChickenParm?.category, "Entrees");
  assert.deepEqual(
    [...(hunchoChickenParm?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );
  assert.equal(hunchoCheesecake?.category, "Desserts & Brunch");
  assert.equal(hunchoMac?.category, "Pastas, Rice & Noodles");
  assert.equal(hunchoStickyRibs?.category, "Entrees");

  assert.ok(provost);
  assert.deepEqual(
    [...new Set(provost.items.map((item) => item.category))]
      .filter((category) => ["Items", "Restaurant"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "branzini-moscato-nv",
    "connect-social-accounts",
    "heineken",
    "hennessy",
    "mimosa",
    "old-fashion-new-twist",
    "organic-shiraz-stellar-organics",
    "pinot-grigio-simonetti",
    "signature-drinks",
  ]) {
    assert.equal(
      provost.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(provostMoscato, undefined);
  assert.equal(provostShrimpPasta?.category, "Pastas & Rice");
  assert.deepEqual(
    [...(provostShrimpPasta?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "shellfish", "wheat"],
  );
  assert.equal(provostCrabCake?.category, "Seafood");
  assert.deepEqual(
    [...(provostCrabCake?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "shellfish", "wheat"],
  );
  assert.equal(provostMacBalls?.category, "Starters");
  assert.equal(provostCoffee?.category, "Beverages");

  assert.ok(inca);
  assert.deepEqual(
    [...new Set(inca.items.map((item) => item.category))]
      .filter((category) =>
        [
          "Birthday Dinner Reservations",
          "Menu",
          "Restaurant",
          "Sides",
        ].includes(category),
      )
      .sort(),
    [],
  );
  for (const id of [
    "2026-world-cup",
    "available-with-pasta",
    "birthdays",
    "community",
    "crispy-yucca-sticks-served-with",
    "inca-network",
    "insights",
    "party-sticks-add-on-dollar25-available-only-with-the-birthday-package",
    "two-beef-empanadas-filled",
  ]) {
    assert.equal(
      inca.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(incaAcevichado?.category, "Sushi");
  assert.deepEqual(
    [...(incaAcevichado?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "milk", "shellfish", "wheat"],
  );
  assert.equal(incaPescado?.category, "Seafood");
  assert.deepEqual(
    [...(incaPescado?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "milk", "shellfish"],
  );
  assert.equal(incaPanCon?.category, "Sandwiches");
  assert.deepEqual(
    [...(incaPanCon?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "wheat"],
  );
  assert.equal(incaSweetSampler?.category, "Desserts & Brunch");
  assert.equal(incaIncaBowl?.category, "Mains");

  assert.ok(delhi);
  assert.deepEqual(
    [...new Set(delhi.items.map((item) => item.category))]
      .filter((category) => ["Items", "Restaurant"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "connect-social-accounts",
    "entree-singlesharing",
    "go-mobile-first",
    "las-perdices",
    "use-html",
  ]) {
    assert.equal(
      delhi.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(delhiSamosas?.category, "Appetizers & Sides");
  assert.deepEqual(
    [...(delhiSamosas?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "wheat"],
  );
  assert.equal(delhiSamosaChaat?.category, "Appetizers & Sides");
  assert.deepEqual(
    [...(delhiSamosaChaat?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(delhiButterNaan?.category, "Breads");
  assert.deepEqual(
    [...(delhiButterNaan?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(delhiPrawnMasala?.category, "Seafood");
  assert.deepEqual(
    [...(delhiPrawnMasala?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["mustard", "shellfish"],
  );
  assert.equal(delhiGulabJamun?.category, "Desserts");
  assert.equal(delhiMumbaiBreeze?.category, "Beverages");
  assert.equal(delhiFigKofta?.category, "Vegetarian");

  assert.ok(plaka);
  assert.deepEqual(
    [...new Set(plaka.items.map((item) => item.category))]
      .filter((category) => ["Items", "Restaurant"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "actions-after-submission",
    "automatic-lightbox-pop-up",
    "dip-appetizers",
    "kids",
    "make-it-a-combo",
    "salad-proteins",
    "soups-and-salads",
    "wraps",
  ]) {
    assert.equal(
      plaka.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(plakaAvgolemeno?.category, "Soups & Salads");
  assert.deepEqual(
    [...(plakaAvgolemeno?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "wheat"],
  );
  assert.equal(plakaCalamari?.category, "Appetizers");
  assert.deepEqual(
    [...(plakaCalamari?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "shellfish"],
  );
  assert.equal(plakaMoussaka?.category, "Entrees");
  assert.equal(plakaGyro?.category, "Gyros, Souvlaki & Wraps");
  assert.equal(plakaTzatziki?.category, "Dips & Spreads");
  assert.equal(plakaBaklava?.category, "Desserts");
  assert.equal(plakaKidsPizza?.category, "Kids");

  assert.ok(oohhs);
  assert.deepEqual(
    [...new Set(oohhs.items.map((item) => item.category))]
      .filter((category) =>
        [
          "Menu",
          "Restaurant",
          "Oohhs Aahhs U Street",
          "Oohhs And Aahhs Fells Point 616 South Broadway",
        ].includes(category),
      )
      .sort(),
    [],
  );
  for (const id of [
    "616-south-broadway-baltimore-md",
    "apps",
    "bbq-sauce",
    "bleu-cheese-dressing",
    "but-first",
    "dinner-entrees",
    "enjoy-the-experience",
    "extra-sauces",
    "hot-honey-old-bay",
    "no-sides",
    "side-sauces",
    "your-event-our-feast",
  ]) {
    assert.equal(
      oohhs.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(oohhsFriedCroaker?.category, "Seafood");
  assert.deepEqual(
    [...(oohhsFriedCroaker?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "wheat"],
  );
  assert.equal(oohhsCatfishTaco?.category, "Soul Tacos");
  assert.deepEqual(
    [...(oohhsCatfishTaco?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "milk", "wheat"],
  );
  assert.equal(oohhsShortRibsGrits?.category, "Brunch");
  assert.equal(oohhsCaesar?.category, "Salads");
  assert.equal(oohhsTurkeyWings?.category, "Entrees");
  assert.equal(oohhsHalfAndHalf?.category, "Beverages");
  assert.equal(oohhsMac?.category, "Sides");

  for (const flowerChild of [flowerChildBethesda, flowerChildOsm]) {
    assert.ok(flowerChild);
    assert.deepEqual(
      [...new Set(flowerChild.items.map((item) => item.category))]
        .filter((category) =>
          [
            "Bethesda Md Wildwood Shopping Center",
            "Flowerchild",
            "Healthy",
            "Locations Menus",
            "Menu",
            "Omaha Ne",
            "Search",
            "restaurant",
          ].includes(category),
        )
        .sort(),
      [],
    );
    for (const id of [
      "all-good-all-summer-long",
      "ebites",
      "entrees",
      "family-pack",
      "group-dining",
      "healthy-kids",
      "now-pouring-summer-sangrias",
      "omaha",
      "packages",
      "restaurant-hours",
      "rose",
    ]) {
      assert.equal(
        flowerChild.items.some((item) => item.id === id),
        false,
      );
    }
  }
  assert.equal(flowerChildForbiddenRice?.category, "Bowls");
  assert.equal(
    flowerChildForbiddenRice?.allergenSourceType,
    "official-allergen-menu",
  );
  assert.deepEqual([...(flowerChildForbiddenRice?.allergens ?? [])].sort(), [
    "sesame",
    "soy",
  ]);
  assert.equal(flowerChildAvocadoCaesar?.category, "Salads");
  assert.deepEqual([...(flowerChildAvocadoCaesar?.allergens ?? [])].sort(), [
    "milk",
    "sesame",
    "wheat",
  ]);
  assert.equal(flowerChildClassicHummus?.category, "Starters");
  assert.deepEqual([...(flowerChildClassicHummus?.allergens ?? [])].sort(), [
    "sesame",
    "wheat",
  ]);
  assert.equal(flowerChildMac?.category, "Sides");
  assert.deepEqual(flowerChildMac?.allergens ?? [], ["milk"]);
  assert.equal(flowerChildShrimp?.category, "Proteins");
  assert.equal(flowerChildHotTea?.category, "Beverages");

  for (const trueFoodRestaurant of [trueFood, trueFoodArlington]) {
    assert.ok(trueFoodRestaurant);
    assert.deepEqual(
      [...new Set(trueFoodRestaurant.items.map((item) => item.category))]
        .filter((category) =>
          ["Dessert", "Healthy", "Menu", "Whats New"].includes(category),
        )
        .sort(),
      [],
    );
    for (const id of [
      "group-dining",
      "keto-and-paleo-friendly",
      "vegan-options-yes",
      "vegetarian-yes",
      "v1a0",
      "whats-new",
    ]) {
      assert.equal(
        trueFoodRestaurant.items.some((item) => item.id === id),
        false,
      );
    }
  }
  assert.equal(trueFoodAncientGrain?.category, "Bowls & Entrees");
  assert.equal(
    trueFoodAncientGrain?.allergenSourceType,
    "official-allergen-menu",
  );
  assert.deepEqual([...(trueFoodAncientGrain?.allergens ?? [])].sort(), [
    "gluten",
    "sesame",
    "soy",
    "tree-nut",
    "wheat",
  ]);
  assert.equal(trueFoodBurger?.category, "Burgers & Sandwiches");
  assert.deepEqual([...(trueFoodBurger?.allergens ?? [])].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(trueFoodGuacamole?.category, "Starters");
  assert.deepEqual([...(trueFoodGuacamole?.allergens ?? [])].sort(), [
    "gluten",
    "wheat",
  ]);
  assert.equal(trueFoodPanang?.category, "Bowls & Entrees");
  assert.deepEqual([...(trueFoodPanang?.allergens ?? [])].sort(), [
    "fish",
    "shellfish",
  ]);
  assert.equal(trueFoodFries?.category, "Sides & Sauces");
  assert.equal(trueFoodFries?.allergenSourceType, "official-allergen-menu");
  assert.equal(trueFoodBlueberry?.category, "Beverages");

  assert.ok(jimmys);
  assert.deepEqual(
    [...new Set(jimmys.items.map((item) => item.category))]
      .filter((category) => ["Large", "Menu", "Whats New"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "2026-golf-tournament",
    "buffalo-sports",
    "buy-a-brick",
    "cup",
    "cup-dollar625-bowl",
    "history",
    "jott-wing-sauce",
    "weekly-events",
    "whats-new",
  ]) {
    assert.equal(
      jimmys.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(jimmysBeefOnWeck?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(jimmysBeefOnWeck?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "wheat"],
  );
  assert.equal(jimmysGrilledCheese?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(jimmysGrilledCheese?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(jimmysHotHamSwiss?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(jimmysHotHamSwiss?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(jimmysJottTots?.category, "Appetizers");
  assert.equal(/Soup,\s*Stew/i.test(jimmysJottTots?.description ?? ""), false);
  assert.equal(jimmysRibEye?.category, "Entrees");
  assert.equal(jimmysPineappleJuice?.category, "Beverages");
  assert.deepEqual(jimmysPineappleJuice?.inferredAllergenSignals ?? [], []);

  assert.ok(teddy);
  assert.deepEqual(
    [...new Set(teddy.items.map((item) => item.category))]
      .filter((category) =>
        [
          "Coffee & Tea",
          "Dessert",
          "Food",
          "Menu",
          "Passover Menu.Pdf",
          "Soups from Scratch",
          "Tasty Things to Eat",
        ].includes(category),
      )
      .sort(),
    [],
  );
  assert.equal(
    teddy.items.some((item) => item.id === "passover-menu-opens-a-pdf"),
    false,
  );
  assert.equal(teddyStations, undefined);
  assert.equal(teddyIceCream?.category, "Desserts");
  assert.deepEqual(
    [...(teddyIceCream?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk"],
  );
  assert.equal(teddyGrilledCheese?.category, "Kids");
  assert.deepEqual(
    [...(teddyGrilledCheese?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(teddyMatzohBallSoup?.category, "Soups");
  assert.equal(teddyCoffee?.category, "Beverages");

  assert.ok(joon);
  assert.deepEqual(
    [...new Set(joon.items.map((item) => item.category))]
      .filter((category) => ["Dessert", "Food", "Menu"].includes(category))
      .sort(),
    [],
  );
  assert.equal(
    joon.items.some((item) => item.id === "sumac"),
    false,
  );
  assert.equal(
    joon.items.some((item) => item.id === "upgrade-cucumber-salad"),
    false,
  );
  assert.equal(joonCucumberSalad?.category, "Salads");
  assert.deepEqual(
    [...(joonCucumberSalad?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk", "tree-nut"],
  );
  assert.equal(joonGilaniKabob?.category, "Seafood");
  assert.deepEqual(
    [...(joonGilaniKabob?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "shellfish"],
  );
  assert.equal(joonDuckFesenjoon?.category, "Mains");
  assert.equal(joonGrilledPrawns?.category, "Seafood");
  assert.equal(joonHummusLamb?.category, "Mazzeh");
  assert.equal(joonKabobPlatter?.category, "Kabobs and Sandwiches");
  assert.equal(joonLoveCake?.category, "Desserts");
  assert.equal(joonThanksgivingMeal?.category, "Thanksgiving Packages");
  assert.equal(joonCoffeeService?.category, "Beverages");

  assert.ok(society);
  assert.deepEqual(
    [...new Set(society.items.map((item) => item.category))]
      .filter((category) =>
        ["Food", "Menu", "Poboys", "Restaurant", "Soup"].includes(category),
      )
      .sort(),
    [],
  );
  for (const id of [
    "90-min-only",
    "celebrate-in-style",
    "fresh-catch-new-vibes",
    "wednesday-friday-400-pm-700-pm",
    "your-seat-awaits-at-silver-springs-society-restaurant-and-lounge",
  ]) {
    assert.equal(
      society.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(societyCatfishSandwich?.category, "Sandwiches");
  assert.deepEqual(
    [...(societyCatfishSandwich?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "milk", "wheat"],
  );
  assert.equal(societyFriedShrimp?.category, "Baskets");
  assert.deepEqual(
    [...(societyFriedShrimp?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "shellfish", "wheat"],
  );
  assert.equal(societyChickenSandwich?.category, "Sandwiches");
  assert.equal(societyCaesar?.category, "Salads");
  assert.equal(/Wednesday/i.test(societyCaesar?.description ?? ""), false);
  assert.equal(societyShrimp?.category, "Appetizers");
  assert.equal(societyBisque?.category, "Soups");
  assert.deepEqual(
    [...(societyBisque?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "milk", "shellfish"],
  );
  assert.equal(societyCatfishPoboy?.category, "Sandwiches");
  assert.equal(societyHoneyBiscuit?.category, "Sides & Additions");

  assert.ok(silverBethesda);
  assert.deepEqual(
    [...new Set(silverBethesda.items.map((item) => item.category))].filter(
      (category) => category === "Restaurant",
    ),
    [],
  );
  for (const id of [
    "breakfast-brunch-entrees",
    "chimichurri-chicken-wings-caramel-french-toast-and-eggs",
    "crispy-smashed-potatoes-with-add-strawberries",
    "flexitarian-options-hh-lower-in-fat-and-cholesterol-vt-vegetarian-pb-plant-based",
    "goat-cheese-bruschetta-caramel-french-toast",
    "lamb-meatballs-sharting-plate-bison-huevos-rancheros",
  ]) {
    assert.equal(
      silverBethesda.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(silverAhiTunaPoke?.category, "Salads + Bowls");
  assert.equal(silverAhiTunaPoke?.allergenSourceType, "official-allergen-menu");
  assert.deepEqual([...(silverAhiTunaPoke?.allergens ?? [])].sort(), [
    "fish",
    "milk",
    "peanut",
    "sesame",
    "soy",
    "wheat",
  ]);
  assert.equal(silverBeyondBaja?.category, "Burgers + Sandwiches");
  assert.equal(silverBeyondBaja?.allergenSourceType, "official-allergen-menu");
  assert.deepEqual([...(silverBeyondBaja?.allergens ?? [])].sort(), [
    "milk",
    "peanut",
    "wheat",
  ]);
  assert.equal(silverKidsAppleJuice?.category, "Kids");
  assert.equal(
    silverKidsAppleJuice?.allergenSourceType,
    "official-allergen-menu",
  );
  assert.deepEqual(silverKidsAppleJuice?.allergens ?? [], ["milk"]);
  assert.equal(silverLambMeatballs?.name, "Lamb Meatballs Sharing Plate");
  assert.equal(silverLambMeatballs?.category, "Sharing Plates");
  assert.equal(
    silverLambMeatballs?.allergenSourceType,
    "official-allergen-menu",
  );

  assert.ok(tastyNook);
  assert.deepEqual(
    [...new Set(tastyNook.items.map((item) => item.category))]
      .filter((category) =>
        ["Items", "mexican;coffee_shop;breakfast"].includes(category),
      )
      .sort(),
    [],
  );
  assert.equal(
    tastyNook.items.some((item) => item.id === "omelettes"),
    false,
  );
  assert.equal(
    tastyNook.items.some((item) => item.id === "escialty-coffees"),
    false,
  );
  assert.equal(tastyBurger?.category, "Burgers & Sandwiches");
  assert.equal(tastyPancakes?.category, "Sweet Breakfast");
  assert.equal(tastyCarneAsada?.category, "Latin Plates");
  assert.equal(tastyChickenAlfredo?.category, "Entrees");
  assert.equal(tastyCapuccino?.category, "Beverages");
  assert.equal(tastyPattySausage?.category, "Sides & Add-ons");

  assert.ok(clydesGallery);
  assert.deepEqual(
    [...new Set(clydesGallery.items.map((item) => item.category))].filter(
      (category) => category === "American",
    ),
    [],
  );
  for (const id of [
    "cans",
    "chipotle-buttermilk-dressing-parmesan",
    "clydes-blend-coffee",
    "full-order",
    "gpdessert0604",
    "mustard-dipping-sauce",
    "q-is-parking-available-nearby",
  ]) {
    assert.equal(
      clydesGallery.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(clydesBurger?.category, "Burgers & Sandwiches");
  assert.equal(clydesCrabCake?.category, "Raw Bar & Seafood");
  assert.equal(clydesSalmonSalad?.category, "Salads");
  assert.equal(clydesCrabSoup?.category, "Soups");
  assert.equal(clydesCheesecake?.category, "Desserts");
  assert.equal(clydesBreakfast?.category, "Breakfast & Brunch");
  assert.equal(clydesGreenBeans?.category, "Sides");

  assert.ok(ilili);
  assert.deepEqual(
    [...new Set(ilili.items.map((item) => item.category))]
      .filter((category) =>
        ["Coffee & Tea", "Dessert", "Ililis Menu Dc", "Menu Dc"].includes(
          category,
        ),
      )
      .sort(),
    [],
  );
  assert.equal(
    ilili.items.some((item) => item.id === "velvety"),
    false,
  );
  assert.equal(ililiHotTea?.category, "Beverages");
  assert.equal(ililiCoffee?.category, "Beverages");
  assert.equal(ililiMintTea?.category, "Beverages");
  assert.equal(ililiIceCream?.category, "Desserts");
  assert.deepEqual(
    [...(ililiIceCream?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk", "sesame"],
  );

  assert.ok(sunflower);
  assert.deepEqual(
    [...new Set(sunflower.items.map((item) => item.category))]
      .filter((category) =>
        ["Dessert", "Items", "Salad", "Soup"].includes(category),
      )
      .sort(),
    [],
  );
  assert.equal(
    sunflower.items.some((item) => item.id === "x7-sauce"),
    false,
  );
  assert.equal(sunflowerEdamame?.category, "Small Bites");
  assert.equal(sunflowerEdamame?.allergenSourceType, "official-ingredients");
  assert.deepEqual([...(sunflowerEdamame?.allergens ?? [])].sort(), [
    "peanut",
    "soy",
  ]);
  assert.equal(sunflowerMushrooms?.category, "Sunflower Specialties");
  assert.equal(sunflowerMushrooms?.allergenSourceType, "official-ingredients");
  assert.deepEqual([...(sunflowerMushrooms?.allergens ?? [])].sort(), [
    "peanut",
    "soy",
  ]);
  assert.equal(sunflowerOrganicSpinachWontonSoup?.category, "Soups");
  assert.equal(
    sunflowerOrganicSpinachWontonSoup?.allergenSourceType,
    "official-ingredients",
  );
  assert.deepEqual(
    [...(sunflowerOrganicSpinachWontonSoup?.allergens ?? [])].sort(),
    ["gluten", "tree-nut", "wheat"],
  );
  assert.equal(sunflowerVeggieShrimpTempura?.category, "Sushi");
  assert.deepEqual(
    [...(sunflowerVeggieShrimpTempura?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "wheat"],
  );
  assert.equal(
    sunflowerVeggieShrimpTempura?.inferenceSuppressions?.some(
      (suppression) => suppression.id === "shellfish",
    ),
    true,
  );
  assert.deepEqual(
    [...(sunflowerTornado?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "sesame", "wheat"],
  );
  assert.equal(
    sunflowerTornado?.inferenceSuppressions?.some(
      (suppression) => suppression.id === "fish",
    ),
    true,
  );
  assert.equal(
    sunflowerTornado?.inferenceSuppressions?.some(
      (suppression) => suppression.id === "shellfish",
    ),
    true,
  );
  assert.deepEqual(
    [...(sunflowerMockEel?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["sesame"],
  );
  assert.equal(sunflowerShrimpGarden?.category, "Sunflower Specialties");
  assert.deepEqual(sunflowerShrimpGarden?.inferredAllergenSignals ?? [], []);
  assert.equal(sunflowerGfCheesecake?.category, "Desserts");
  assert.deepEqual(
    [...(sunflowerGfCheesecake?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk"],
  );
  assert.equal(sunflowerChocolateMousse?.category, "Desserts");
  assert.deepEqual(
    [...(sunflowerChocolateMousse?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "soy", "wheat"],
  );

  for (const farmersRestaurant of foundingFarmersFamily) {
    assert.ok(farmersRestaurant);
    assert.deepEqual(
      [...new Set(farmersRestaurant.items.map((item) => item.category))]
        .filter((category) =>
          ["American", "American / Farm-to-table", "Dessert", "Menu"].includes(
            category,
          ),
        )
        .sort(),
      [],
    );
    assert.equal(
      farmersRestaurant.items.some(
        (item) => item.id === "chocolate" && item.category === "Menu",
      ),
      false,
    );

    const bananaCreamPie = farmersRestaurant.items.find(
      (item) => item.id === "banana-cream-pie",
    );
    const decaf = farmersRestaurant.items.find(
      (item) => item.id === "farmers-decaf",
    );

    assert.equal(bananaCreamPie?.category, "Desserts");
    assert.equal(bananaCreamPie?.description, undefined);
    assert.deepEqual(
      [...(bananaCreamPie?.inferredAllergenSignals ?? [])]
        .map((signal) => signal.id)
        .sort(),
      ["egg", "gluten", "milk", "wheat"],
    );
    assert.equal(decaf?.category, "Beverages");
    assert.equal(
      /milk chocolate|creamy/i.test(decaf?.description ?? ""),
      false,
    );
    assert.deepEqual(decaf?.inferredAllergenSignals ?? [], []);
  }

  assert.ok(maggie);
  assert.deepEqual(
    [...new Set(maggie.items.map((item) => item.category))]
      .filter((category) =>
        ["American", "Menu", "Menus", "Our Story", "Springfield Va"].includes(
          category,
        ),
      )
      .sort(),
    [],
  );
  for (const id of [
    "100-proof-rye",
    "business-inquiries",
    "budweiser",
    "column",
    "connecticut",
    "discover-maggie-mcflys",
    "eat-drink-be-unique",
    "menu-info-and-hours",
    "new-york",
    "regular",
    "sale",
    "sizing-chart",
    "take-out",
    "team-portal",
  ]) {
    assert.equal(
      maggie.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(maggieBurgerSliders?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(maggieBurgerSliders?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "sesame", "wheat"],
  );
  assert.equal(maggieAhiTaco?.category, "Tacos & Fajitas");
  assert.deepEqual(
    [...(maggieAhiTaco?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish"],
  );
  assert.equal(maggieFettuccine?.category, "Pastas, Rice & Bowls");
  assert.equal(maggieBrownie?.category, "Desserts");
  assert.equal(maggieGrilledCheese?.category, "Burgers & Sandwiches");
  assert.equal(maggieCalamari?.category, "Seafood");
  assert.equal(maggieSmoothie?.category, "Beverages");

  assert.ok(afghania);
  assert.deepEqual(
    [...new Set(afghania.items.map((item) => item.category))]
      .filter((category) =>
        ["Items", "Menu 1", "Restaurant"].includes(category),
      )
      .sort(),
    [],
  );
  for (const id of [
    "chops-and-kabobs",
    "raw-beef-tenderloin-1lb",
    "raw-salmon-1lb",
  ]) {
    assert.equal(
      afghania.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(afghaniaBurger?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(afghaniaBurger?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "sesame", "wheat"],
  );
  assert.equal(afghaniaBistroBurger?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(afghaniaBistroBurger?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "sesame", "wheat"],
  );
  assert.equal(afghaniaNakhoudChalou?.category, "Vegetarian Entrees");
  assert.equal(afghaniaBaadenjaanChalou?.category, "Vegetarian Entrees");
  assert.equal(afghaniaChalou?.category, "Sides & Sauces");
  assert.equal(afghaniaSalmon?.category, "Seafood");
  assert.deepEqual(
    [...(afghaniaSalmon?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish"],
  );
  assert.equal(afghaniaChickenLawaan?.category, "Entrees");
  assert.equal(afghaniaLambTenderloinKabob?.category, "Chops & Kabobs");

  assert.ok(aracosia);
  assert.deepEqual(
    [...new Set(aracosia.items.map((item) => item.category))]
      .filter((category) =>
        ["afghan", "Items", "Restaurant"].includes(category),
      )
      .sort(),
    [],
  );
  for (const id of [
    "billecart-salmon-brut-reserve-champagne-nv",
    "billecart-salmon-rose-champagne-nv",
    "mothers-day-special",
  ]) {
    assert.equal(
      aracosia.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(aracosiaBistroBurger?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(aracosiaBistroBurger?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "sesame", "wheat"],
  );
  assert.equal(aracosiaAushak?.category, "Dumplings & Turnovers");
  assert.deepEqual(
    [...(aracosiaAushak?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(aracosiaSalmonWrap?.category, "Seafood");
  assert.deepEqual(
    [...(aracosiaSalmonWrap?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "gluten", "milk", "wheat"],
  );
  assert.equal(aracosiaQabuli?.category, "Sides & Sauces");
  assert.equal(aracosiaBaklava?.category, "Desserts");
  assert.equal(aracosiaChickenLawaan?.category, "Entrees");

  assert.ok(botanero);
  assert.deepEqual(
    [...new Set(botanero.items.map((item) => item.category))]
      .filter((category) => ["restaurant", "Items", "Menu"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "details",
    "go-to-top",
    "purchase-tickets",
    "page-load-link",
  ]) {
    assert.equal(
      botanero.items.some((item) => item.id === id),
      false,
    );
  }
  assert.ok(botanero.items.length >= 65);
  assert.equal(botaneroCalamari?.category, "Seafood");
  assert.deepEqual(
    [...(botaneroCalamari?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "shellfish", "wheat"],
  );
  assert.equal(botaneroCrabCakeSandwich?.category, "Weekend Brunch");
  assert.deepEqual(
    [...(botaneroCrabCakeSandwich?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "sesame", "shellfish", "wheat"],
  );
  assert.equal(botaneroBurger?.category, "Weekend Brunch");
  assert.deepEqual(
    [...(botaneroBurger?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "mustard", "sesame", "wheat"],
  );
  assert.equal(botaneroFlatbread?.category, "Flatbreads & Dips");
  assert.equal(botaneroSalmonBenedict?.category, "Weekend Brunch");
  assert.equal(
    /SEARED SCALLOPS|WEEKEND BRUNCH|WHITE RED|PURCHASE TICKETS/i.test(
      botaneroCalamari?.description ?? "",
    ),
    false,
  );

  assert.ok(uzu);
  assert.deepEqual(
    [...new Set(uzu.items.map((item) => item.category))]
      .filter((category) => ["Items"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "chunin",
    "genin",
    "jonin",
    "number-of-captions",
    "responsive-support",
    "shuffle-slides",
    "user-friendly-interface",
  ]) {
    assert.equal(
      uzu.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(uzuAsparagusTempura?.category, "Side Dishes / Soups");
  assert.deepEqual(
    [...(uzuAsparagusTempura?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "wheat"],
  );
  assert.equal(uzuAvocadoRoll?.category, "Vegan");
  assert.deepEqual(uzuAvocadoRoll?.inferredAllergenSignals ?? [], []);
  assert.equal(uzuHawaiianTruffle?.category, "Special Rolls");
  assert.deepEqual(
    [...(uzuHawaiianTruffle?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "shellfish", "wheat"],
  );
  assert.equal(uzuOysterPonzu?.category, "Nigiri");
  assert.deepEqual(
    [...(uzuOysterPonzu?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "gluten", "shellfish", "soy", "wheat"],
  );
  assert.equal(uzuBossCoffee?.category, "Beverages");
  assert.deepEqual(uzuBossCoffee?.inferredAllergenSignals ?? [], []);
  assert.equal(uzuMochi?.category, "Desserts");
  assert.deepEqual(
    [...(uzuMochi?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk"],
  );

  assert.ok(secretGarden);
  assert.deepEqual(
    [...new Set(secretGarden.items.map((item) => item.category))].filter(
      (category) => category === "American",
    ),
    [],
  );
  assert.equal(secretGardenAsparagus?.category, "Sides");
  assert.equal(secretGardenAsparagus?.description, undefined);
  assert.deepEqual(secretGardenAsparagus?.inferredAllergenSignals ?? [], []);
  assert.equal(secretGardenBahnMi?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(secretGardenBahnMi?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "soy", "wheat"],
  );
  assert.equal(secretGardenCrabCake?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(secretGardenCrabCake?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "sesame", "shellfish", "wheat"],
  );
  assert.equal(secretGardenHalfTea?.category, "Beverages");
  assert.equal(secretGardenHalfTea?.description, undefined);
  assert.deepEqual(secretGardenHalfTea?.inferredAllergenSignals ?? [], []);
  assert.equal(secretGardenSalmon?.category, "Seafood");
  assert.deepEqual(
    [...(secretGardenSalmon?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "sesame"],
  );
  assert.equal(secretGardenFrenchToast?.category, "Breakfast");
  assert.deepEqual(
    [...(secretGardenFrenchToast?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );

  assert.ok(jukeBox);
  assert.deepEqual(
    [...new Set(jukeBox.items.map((item) => item.category))]
      .filter((category) =>
        [
          "american",
          "Menu",
          "Jbd Interactive Cc Auth Form.Pdf",
          "Desserts Ice Cream",
          "Outreach",
          "Community Impact",
          "The Basics",
        ].includes(category),
      )
      .sort(),
    [],
  );
  for (const id of [
    "book-your-banquet",
    "cc-authorization-form",
    "credit-card-authorization",
    "community-impact",
    "community-outreach",
    "fundraising-with-jbd",
    "substitute-eggs-with-egg-whites-150",
    "lettuce-tomato-and-mayo",
    "topped-with-brown-beef-gravy",
  ]) {
    assert.equal(
      jukeBox.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(jukeBoxBurger?.category, "Burgers & Sandwiches");
  assert.deepEqual(
    [...(jukeBoxBurger?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "sesame", "wheat"],
  );
  assert.equal(jukeBoxChickenParm?.category, "Entrees");
  assert.deepEqual(
    [...(jukeBoxChickenParm?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );
  assert.equal(jukeBoxFishChips?.category, "Seafood");
  assert.deepEqual(
    [...(jukeBoxFishChips?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "wheat"],
  );
  assert.equal(jukeBoxBlackAngus?.category, "Entrees");
  assert.equal(jukeBoxBlackAngus?.description, undefined);
  assert.equal(jukeBoxCoffee?.category, "Beverages");
  assert.deepEqual(jukeBoxCoffee?.inferredAllergenSignals ?? [], []);
  assert.equal(jukeBoxWaffleSundae?.category, "Desserts");
  assert.deepEqual(
    [...(jukeBoxWaffleSundae?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );

  assert.ok(redHotBlue);
  assert.deepEqual(
    [...new Set(redHotBlue.items.map((item) => item.category))].filter(
      (category) => category === "american",
    ),
    [],
  );
  for (const id of [
    "bbq-plates",
    "favorites",
    "meat-samplers",
    "rib-combos",
    "ribs-and-combos",
    "rub-and-sauces",
    "southern-sides",
    "sweets",
    "the-kettle",
    "to-go-drinks",
  ]) {
    assert.equal(
      redHotBlue.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(redHotBlueWingsTray?.category, "Catering & Bulk");
  assert.deepEqual(
    [...(redHotBlueWingsTray?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "milk"],
  );
  assert.equal(redHotBlueNachos?.category, "Starters");
  assert.deepEqual(
    [...(redHotBlueNachos?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk"],
  );
  assert.equal(redHotBlueCatfish?.category, "Seafood");
  assert.equal(
    /Garden or Caesar Side Salad/i.test(redHotBlueCatfish?.description ?? ""),
    false,
  );
  assert.deepEqual(
    [...(redHotBlueCatfish?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "wheat"],
  );
  assert.equal(redHotBluePulledPork?.category, "BBQ Plates & Ribs");
  assert.deepEqual(redHotBluePulledPork?.inferredAllergenSignals ?? [], []);
  assert.equal(redHotBlueClassicBurger?.category, "Sandwiches & Burgers");
  assert.equal(
    /Add cheese/i.test(redHotBlueClassicBurger?.description ?? ""),
    false,
  );
  assert.deepEqual(
    [...(redHotBlueClassicBurger?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "sesame", "wheat"],
  );
  assert.equal(redHotBlueHickoryBurger?.category, "Sandwiches & Burgers");
  assert.deepEqual(
    [...(redHotBlueHickoryBurger?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "sesame", "wheat"],
  );

  assert.ok(novaEuropa);
  assert.deepEqual(
    [...new Set(novaEuropa.items.map((item) => item.category))].filter(
      (category) => category === "Restaurant",
    ),
    [],
  );
  for (const id of [
    "a-selection-of-complete-dinners-for-4-offered-for-carryout",
    "coffeetea-295-espresso",
    "cooked-to-your-preference-and-served-with-potato-and-daily-vegetable",
    "cutlet-chicken-breast-topped-with-cheese-in-marinara-sauce-and-linguini",
    "served-over-capellini-with-cherry-tomatoes-and-basil-in-garlic-sauce",
    "served-tuesday-sunday-5-pm-930pm",
    "stuffed-with-cheese-in-marinara-sauce",
  ]) {
    assert.equal(
      novaEuropa.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(novaEuropaCalamari?.category, "Seafood");
  assert.deepEqual(
    [...(novaEuropaCalamari?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["shellfish"],
  );
  assert.equal(novaEuropaSeafoodPot?.category, "Seafood");
  assert.deepEqual(
    [...(novaEuropaSeafoodPot?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "gluten", "shellfish", "wheat"],
  );
  assert.equal(novaEuropaChickenParm?.category, "Chicken");
  assert.deepEqual(
    [...(novaEuropaChickenParm?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );
  assert.equal(novaEuropaSteakPortuguese?.category, "Steaks & Chops");
  assert.deepEqual(
    [...(novaEuropaSteakPortuguese?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "sulfites"],
  );
  assert.equal(novaEuropaCheesecake?.category, "Desserts");
  assert.deepEqual(
    [...(novaEuropaCheesecake?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );
  assert.equal(novaEuropaHouseSalad?.category, "Salads");
  assert.deepEqual(novaEuropaHouseSalad?.inferredAllergenSignals ?? [], []);
  assert.equal(novaEuropaAlfredo?.name, "Fettuccini ALFREDO");
  assert.equal(novaEuropaAlfredo?.category, "Pasta");
  assert.equal(novaEuropaBrie?.category, "Starters");
  assert.deepEqual(
    [...(novaEuropaBrie?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk"],
  );

  assert.ok(cuates);
  assert.deepEqual(
    [...new Set(cuates.items.map((item) => item.category))]
      .filter((category) =>
        ["Items", "mexican", "Restaurant"].includes(category),
      )
      .sort(),
    [],
  );
  for (const id of [
    "apetaizers",
    "chef-recomendations",
    "dinner-for-two-dine-in-only",
    "enchiladas-burritos-chimichangas",
    "grill-fajitas",
    "mexican-conbinations",
    "saturday-and-sunday-brunch",
    "sides-tray",
    "street-tacos-a-la-carte",
  ]) {
    assert.equal(
      cuates.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(cuatesAztecaSalad?.category, "Salads");
  assert.equal(
    /Romain lettuce|sheered cheese/i.test(cuatesAztecaSalad?.description ?? ""),
    false,
  );
  assert.deepEqual(
    [...(cuatesAztecaSalad?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg"],
  );
  assert.equal(cuatesSeafoodSoup?.category, "Soups");
  assert.deepEqual(
    [...(cuatesSeafoodSoup?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "shellfish"],
  );
  assert.equal(cuatesCheesecakeChimichanga?.category, "Desserts");
  assert.deepEqual(
    [...(cuatesCheesecakeChimichanga?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );
  assert.equal(cuatesChickenTenders?.category, "Entrees");
  assert.deepEqual(
    [...(cuatesChickenTenders?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "wheat"],
  );
  assert.equal(cuatesTacoSalad?.category, "Salads");
  assert.deepEqual(
    [...(cuatesTacoSalad?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(cuatesParillada?.category, "Fajitas & Grilled Plates");
  assert.deepEqual(
    [...(cuatesParillada?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "shellfish", "wheat"],
  );
  assert.equal(cuatesTacosCarbon?.category, "Tacos & Tamales");
  assert.deepEqual(
    [...(cuatesTacosCarbon?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(cuatesFlourTortillas?.category, "Sides");
  assert.deepEqual(
    [...(cuatesFlourTortillas?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "wheat"],
  );
  assert.equal(cuatesMargaritas?.category, "Beverages");
  assert.deepEqual(cuatesMargaritas?.inferredAllergenSignals ?? [], []);

  assert.ok(urbano);
  assert.deepEqual(
    [...new Set(urbano.items.map((item) => item.category))].filter(
      (category) => category === "mexican",
    ),
    [],
  );
  for (const id of [
    "5-de-mayo-taco-sep-ut",
    "burger-tortas",
    "cheese",
    "chefs-corner",
    "chicken",
    "large-flour-tortilla-lightly-fried-until",
    "large-flour-tortilla-with-cheese-served",
    "shredded-beef",
    "shrimp",
    "soup-salad-and",
  ]) {
    assert.equal(
      urbano.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(urbanoSoftTacos?.category, "Tacos & Tortas");
  assert.deepEqual(
    [...(urbanoSoftTacos?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "shellfish", "wheat"],
  );
  assert.equal(urbanoPorkBelly?.category, "Fajitas & Grill");
  assert.equal(
    /MEZCAL MARINATED RIBEYE|panela cheese/i.test(
      urbanoPorkBelly?.description ?? "",
    ),
    false,
  );
  assert.deepEqual(
    [...(urbanoPorkBelly?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["tree-nut"],
  );
  assert.equal(urbanoTortillaSoup?.category, "Soups");
  assert.deepEqual(
    [...(urbanoTortillaSoup?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(urbanoFajitaFiesta?.category, "Family Meals");
  assert.equal(
    /sangria|margarita|wine/i.test(urbanoFajitaFiesta?.description ?? ""),
    false,
  );
  assert.deepEqual(
    [...(urbanoFajitaFiesta?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk"],
  );
  assert.equal(urbanoHalibut?.category, "Seafood");
  assert.deepEqual(
    [...(urbanoHalibut?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "gluten", "wheat"],
  );
  assert.equal(urbanoShrimp?.category, "Seafood");
  assert.deepEqual(
    [...(urbanoShrimp?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["shellfish"],
  );
  assert.equal(urbanoRitas?.category, "Beverages");
  assert.deepEqual(urbanoRitas?.inferredAllergenSignals ?? [], []);
  assert.equal(urbanoTresLeches?.category, "Desserts");
  assert.deepEqual(
    [...(urbanoTresLeches?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );

  assert.ok(eugenia);
  assert.deepEqual(
    [...new Set(eugenia.items.map((item) => item.category))]
      .filter((category) => ["Items", "greek"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "advanced-customizations",
    "avantis-estate-mountrichas",
    "magic-mountain-lazaridis",
    "savvatiano-sokos",
    "meat-appetizers",
    "meat-entrees",
    "seafood-appetizers",
    "seafood-entrees",
    "spreads",
    "cosmopolitan",
    "the-odyssey",
  ]) {
    assert.equal(
      eugenia.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(eugeniaCoffee?.category, "Beverages");
  assert.deepEqual(eugeniaCoffee?.inferredAllergenSignals ?? [], []);
  assert.equal(eugeniaArni?.name, "Arni Riganato");
  assert.equal(eugeniaArni?.category, "Entrees");
  assert.equal(eugeniaKantaifi?.category, "Desserts");
  assert.deepEqual(
    [...(eugeniaKantaifi?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "tree-nut", "wheat"],
  );
  assert.equal(eugeniaLavraki?.category, "Seafood");
  assert.deepEqual(
    [...(eugeniaLavraki?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish", "shellfish"],
  );
  assert.equal(eugeniaAvgolemono?.category, "Soups");
  assert.deepEqual(
    [...(eugeniaAvgolemono?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg"],
  );
  assert.equal(eugeniaBakaliaros?.category, "Seafood");
  assert.deepEqual(
    [...(eugeniaBakaliaros?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "gluten", "wheat"],
  );
  assert.equal(eugeniaFeta?.category, "Meze & Spreads");
  assert.deepEqual(
    [...(eugeniaFeta?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "sesame", "wheat"],
  );
  assert.equal(eugeniaGreekSalad?.category, "Salads");
  assert.deepEqual(
    [...(eugeniaGreekSalad?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["milk"],
  );
  assert.equal(eugeniaLamburger?.category, "Entrees");
  assert.deepEqual(
    [...(eugeniaLamburger?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "sesame", "wheat"],
  );
  assert.equal(eugeniaSpanakopita?.category, "Meze & Spreads");
  assert.deepEqual(
    [...(eugeniaSpanakopita?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );

  assert.ok(elPatio);
  assert.deepEqual(
    [...new Set(elPatio.items.map((item) => item.category))]
      .filter((category) => ["Items", "Thanksgivingmenu"].includes(category))
      .sort(),
    [],
  );
  for (const id of [
    "all-steaks-are-choice-or-better",
    "breaded-steak-or-breaded-chicken-fried",
    "customize-the-text",
    "easy-to-add",
    "make-it-a-combo-fries-and-drink",
  ]) {
    assert.equal(
      elPatio.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(elPatioChivito?.category, "Sandwiches");
  assert.deepEqual(
    [...(elPatioChivito?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "gluten", "milk", "wheat"],
  );
  assert.equal(elPatioChivitoAlPlato?.category, "Grill & Steaks");
  assert.deepEqual(
    [...(elPatioChivitoAlPlato?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "milk"],
  );
  assert.equal(elPatioEmpanada?.category, "Empanadas");
  assert.equal(elPatioMilanesa?.category, "Milanesas");
  assert.equal(elPatioShrimpPasta?.category, "Pasta");
  assert.equal(elPatioJuices, undefined);
  assert.equal(elPatioCake?.category, "Bakery & Pastries");
  assert.equal(elPatioSalmon?.category, "Seafood");
  assert.equal(elPatioChimichurri?.category, "Sides");

  assert.ok(openCity);
  assert.deepEqual(
    [...new Set(openCity.items.map((item) => item.category))].filter(
      (category) => category === "American",
    ),
    [],
  );
  for (const id of ["burgers-and-sandwiches", "earn", "hearth-oven-pizza"]) {
    assert.equal(
      openCity.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(openCityCroissant?.category, "Breakfast");
  assert.equal(openCityCroissant?.allergenSourceType, "official-ingredients");
  assert.deepEqual([...(openCityCroissant?.allergens ?? [])].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(openCityPancakes?.category, "Breakfast");
  assert.deepEqual([...(openCityPancakes?.allergens ?? [])].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(openCityClub?.category, "Burgers & Sandwiches");
  assert.deepEqual([...(openCityClub?.allergens ?? [])].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.equal(openCityHummus?.category, "Starters");
  assert.equal(openCitySalmon?.category, "Bowls & Entrees");
  assert.deepEqual(
    [...(openCitySalmon?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish"],
  );
  assert.equal(openCityShrimpSide?.category, "Sides");
  assert.deepEqual(
    [...(openCityShrimpSide?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["shellfish"],
  );
  assert.equal(openCitySmallCaesar?.category, "Salads");

  assert.ok(organicButcher);
  assert.deepEqual(
    [...new Set(organicButcher.items.map((item) => item.category))].filter(
      (category) => category === "Restaurant",
    ),
    [],
  );
  assert.equal(organicBurgerBlend?.category, "Meat & Poultry");
  assert.deepEqual(organicBurgerBlend?.inferredAllergenSignals ?? [], []);
  assert.equal(organicWings?.category, "Meat & Poultry");
  assert.deepEqual(organicWings?.inferredAllergenSignals ?? [], []);
  assert.equal(organicSalmon?.category, "Seafood");
  assert.deepEqual(
    [...(organicSalmon?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish"],
  );
  assert.equal(organicGroundLamb?.category, "Meat & Poultry");
  assert.deepEqual(organicGroundLamb?.inferredAllergenSignals ?? [], []);
  assert.equal(organicCasamara?.category, "Beverages");
  assert.deepEqual(organicCasamara?.inferredAllergenSignals ?? [], []);
  assert.equal(organicMeatballs?.category, "Prepared Foods");
  assert.equal(organicMeatballs?.allergenSourceType, "official-ingredients");
  assert.deepEqual([...(organicMeatballs?.allergens ?? [])].sort(), [
    "egg",
    "milk",
  ]);
  assert.equal(organicBlackCod?.category, "Seafood");
  assert.deepEqual(
    [...(organicBlackCod?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish"],
  );
  assert.equal(organicSmokedSalmonDip?.category, "Seafood");
  assert.deepEqual(
    [...(organicSmokedSalmonDip?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["egg", "fish", "milk"],
  );
  assert.equal(organicHummus?.category, "Prepared Foods");
  assert.deepEqual(
    [...(organicHummus?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["sesame"],
  );
  assert.equal(organicNewYorkStrip?.category, "Meat & Poultry");
  assert.deepEqual(organicNewYorkStrip?.inferredAllergenSignals ?? [], []);
  assert.equal(organicMalaySauce?.category, "Sauces & Condiments");
  assert.deepEqual(
    [...(organicMalaySauce?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish"],
  );

  assert.ok(pleroma);
  assert.deepEqual(
    [...new Set(pleroma.items.map((item) => item.category))].filter(
      (category) => category === "Restaurant",
    ),
    [],
  );
  for (const id of [
    "brunch-reservations",
    "fathers-day-brunch-reservation",
    "valentine-love-basket",
    "weekly-meal-prep-service",
    "eef",
  ]) {
    assert.equal(
      pleroma.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(pleromaFufu?.category, "Sides & Vegetables");
  assert.deepEqual(pleromaFufu?.inferredAllergenSignals ?? [], []);
  assert.equal(pleromaShrimpRoll?.category, "Small Chops & Snacks");
  assert.deepEqual(
    [...(pleromaShrimpRoll?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "shellfish", "wheat"],
  );
  assert.equal(pleromaPompano?.category, "Seafood");
  assert.deepEqual(
    [...(pleromaPompano?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["fish"],
  );
  assert.equal(pleromaPlantain?.category, "Sides & Vegetables");
  assert.deepEqual(pleromaPlantain?.inferredAllergenSignals ?? [], []);
  assert.equal(pleromaChickenWrap?.category, "Rice & Combos");
  assert.deepEqual(
    [...(pleromaChickenWrap?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "wheat"],
  );
  assert.equal(pleromaAsaro?.category, "Rice & Combos");
  assert.deepEqual(pleromaAsaro?.inferredAllergenSignals ?? [], []);

  assert.ok(spacebar);
  assert.equal(spacebar.items.length, 26);
  assert.deepEqual(
    [...new Set(spacebar.items.map((item) => item.category))].filter(
      (category) => category === "Restaurant",
    ),
    [],
  );
  for (const id of [
    "450-north-slushie-xl",
    "great-lakes-strawberry-wheat",
    "lost-coast-pb-milk",
  ]) {
    assert.equal(
      spacebar.items.some((item) => item.id === id),
      false,
    );
  }
  assert.equal(spacebarAndromeda?.category, "Grilled Cheese & Melts");
  assert.deepEqual(
    [...(spacebarAndromeda?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.equal(spacebarVeganGrilledCheese?.category, "Grilled Cheese & Melts");
  assert.deepEqual(
    [...(spacebarVeganGrilledCheese?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "tree-nut", "wheat"],
  );
  assert.deepEqual(
    [...(spacebarVeganGrilledCheese?.inferenceSuppressions ?? [])]
      .map((suppression) => suppression.id)
      .sort(),
    ["egg", "milk"],
  );
  assert.equal(spacebarSpacebarBq?.category, "Sandwiches");
  assert.deepEqual(
    [...(spacebarSpacebarBq?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "sesame", "soy", "wheat"],
  );
  assert.equal(spacebarPestoTurko?.category, "Sandwiches");
  assert.deepEqual(
    [...(spacebarPestoTurko?.inferredAllergenSignals ?? [])]
      .map((signal) => signal.id)
      .sort(),
    ["gluten", "milk", "soy", "tree-nut", "wheat"],
  );
  assert.equal(spacebarTaterTots?.category, "Sides & Snacks");
  assert.deepEqual(spacebarTaterTots?.inferredAllergenSignals ?? [], []);

  assert.ok(bayouCheddaRoast);
  assert.equal(/Fillet O'/.test(bayouCheddaRoast.description ?? ""), false);
  assert.deepEqual([...bayouCheddaRoast.allergens].sort(), [
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);
  assert.ok(bayouMeatballs);
  assert.equal(/Mac & Cheese/.test(bayouMeatballs.description ?? ""), false);
  assert.deepEqual([...bayouMeatballs.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(bayouVeggieVille);
  assert.deepEqual([...bayouVeggieVille.allergens].sort(), [
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);
  assert.ok(bayouGreens);
  assert.equal(/HAM MELT/i.test(bayouGreens.description ?? ""), false);
  assert.deepEqual(bayouGreens.inferredAllergenSignals ?? [], []);
  assert.ok(bayouBenedict);
  assert.deepEqual(bayouBenedict.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(bayouBlt);
  assert.deepEqual(bayouBlt.allergens?.sort(), ["egg", "gluten", "wheat"]);
  assert.ok(bayouColdPimento);
  assert.deepEqual(bayouColdPimento.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(bayouFishSandwich);
  assert.deepEqual(bayouFishSandwich.allergens?.sort(), [
    "fish",
    "gluten",
    "wheat",
  ]);
  assert.ok(bayouFlan);
  assert.deepEqual(bayouFlan.allergens?.sort(), ["egg", "milk"]);
  assert.ok(bayouQuiche);
  assert.deepEqual(bayouQuiche.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(bayouSpinachMadeline);
  assert.deepEqual(bayouSpinachMadeline.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(bayouPecanWaffle);
  assert.deepEqual(bayouPecanWaffle.allergens?.sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.ok(bayouMuffalotta);
  assert.deepEqual(bayouMuffalotta.allergens?.sort(), [
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);

  assert.equal(
    miVida?.items.some((item) => item.id === "choice-of"),
    false,
  );
  assert.ok(miVidaDeviledEggs);
  assert.equal(
    /NARANJAS ENCHILADAS/i.test(miVidaDeviledEggs.description ?? ""),
    false,
  );
  assert.deepEqual(miVidaDeviledEggs.allergens ?? [], ["egg"]);
  assert.ok(miVidaAtun);
  assert.equal(miVidaAtun.allergenSourceType, "official-ingredients");
  assert.deepEqual(miVidaAtun.allergens ?? [], ["fish"]);
  assert.ok(miVidaTropical);
  assert.deepEqual(miVidaTropical.allergens ?? [], ["shellfish"]);
  assert.ok(miVidaPescado);
  assert.deepEqual(miVidaPescado.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "wheat",
  ]);
  assert.ok(miVidaSmashburger);
  assert.deepEqual(miVidaSmashburger.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(miVidaEnchiladasJaiba);
  assert.deepEqual(miVidaEnchiladasJaiba.allergens?.sort(), [
    "milk",
    "shellfish",
  ]);
  assert.ok(miVidaJaibaConQueso);
  assert.deepEqual(miVidaJaibaConQueso.allergens?.sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok((miVida?.allergenDataStatus?.officialItemCount ?? 0) > 20);

  assert.ok(dogfish);
  assert.equal(
    dogfish.items.some((item) => item.id === "email"),
    false,
  );
  assert.equal(
    dogfish.items.some((item) => item.id === "request-a-party"),
    false,
  );
  assert.equal(
    dogfish.items.some((item) => item.id === "trivia-tuesday-night"),
    false,
  );
  assert.equal(
    dogfish.items.some((item) => item.id === "apps"),
    false,
  );
  assert.ok(dogfishAhi);
  assert.deepEqual(dogfishAhi.allergens ?? [], ["fish", "soy"]);
  assert.ok(dogfishCrabDip);
  assert.deepEqual(dogfishCrabDip.allergens?.sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(dogfishFishChips);
  assert.deepEqual(dogfishFishChips.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "wheat",
  ]);
  assert.ok(dogfishJambalaya);
  assert.deepEqual(dogfishJambalaya.allergens?.sort(), [
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(dogfishPotstickers);
  assert.deepEqual(dogfishPotstickers.allergens?.sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.ok(dogfishFarmFresh);
  assert.deepEqual(dogfishFarmFresh.allergens ?? [], ["milk"]);
  assert.ok(dogfishTurkeyClub);
  assert.deepEqual(dogfishTurkeyClub.allergens?.sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.ok((dogfish.allergenDataStatus?.officialItemCount ?? 0) > 35);

  assert.equal(
    allPurpose?.items.some((item) => item.id === "back-to-shaw-home"),
    false,
  );
  assert.equal(
    allPurpose?.items.some((item) => item.id === "bottomless"),
    false,
  );
  assert.equal(
    allPurpose?.items.some((item) => item.id === "tues-thu-5pm-10pm"),
    false,
  );
  assert.ok((allPurpose?.allergenDataStatus?.officialItemCount ?? 0) >= 30);
  assert.ok(allPurposeCaesar);
  assert.deepEqual(allPurposeCaesar.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(allPurposeBreakfastSandwich);
  assert.deepEqual(allPurposeBreakfastSandwich.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);
  assert.ok(allPurposeTripper);
  assert.deepEqual(allPurposeTripper.allergens?.sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(allPurposeBakedCookie);
  assert.deepEqual(allPurposeBakedCookie.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);

  assert.equal(
    blueDuck?.items.some((item) => item.id === "nuts"),
    false,
  );
  assert.ok((blueDuck?.allergenDataStatus?.officialItemCount ?? 0) >= 45);
  assert.ok(blueDuckPorridge);
  assert.deepEqual(blueDuckPorridge.allergens?.sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.ok(blueDuckBagel);
  assert.deepEqual(blueDuckBagel.allergens?.sort(), [
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);
  assert.ok(blueDuckCheeseburger);
  assert.deepEqual(blueDuckCheeseburger.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(blueDuckCrabCakes);
  assert.deepEqual(blueDuckCrabCakes.allergens?.sort(), [
    "egg",
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(blueDuckTrout);
  assert.deepEqual(blueDuckTrout.allergens?.sort(), [
    "fish",
    "gluten",
    "tree-nut",
    "wheat",
  ]);

  assert.equal(
    occidentalReviewed?.items.some(
      (item) => item.name === "baika caviar, potato, creme fraiche",
    ),
    false,
  );
  assert.equal(
    occidentalReviewed?.items.some((item) => item.name === "cocktail sauce"),
    false,
  );
  assert.ok(
    (occidentalReviewed?.allergenDataStatus?.officialItemCount ?? 0) >= 70,
  );
  assert.ok(occidentalCaviar);
  assert.deepEqual(occidentalCaviar.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(occidentalCrabRoll);
  assert.deepEqual(occidentalCrabRoll.allergens?.sort(), [
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);
  assert.ok(occidentalCaesar);
  assert.deepEqual(occidentalCaesar.allergens?.sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(occidentalBurger);
  assert.deepEqual(occidentalBurger.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(occidentalSeaBass);
  assert.deepEqual(occidentalSeaBass.allergens?.sort(), ["fish", "soy"]);
  assert.ok(occidentalFrenchToast);
  assert.deepEqual(occidentalFrenchToast.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(occidentalCheesecake);
  assert.deepEqual(occidentalCheesecake.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);

  assert.equal(
    etVoila?.items.some((item) => item.id === "automatic-lightbox-pop-up"),
    false,
  );
  assert.ok((etVoila?.allergenDataStatus?.officialItemCount ?? 0) >= 30);
  assert.ok(etVoilaBurger);
  assert.deepEqual(etVoilaBurger.allergens ?? [], ["milk"]);
  assert.ok(etVoilaBeetSalad);
  assert.deepEqual(etVoilaBeetSalad.allergens?.sort(), ["milk", "tree-nut"]);
  assert.ok(etVoilaBenedictSalmon);
  assert.deepEqual(etVoilaBenedictSalmon.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(etVoilaCaesar);
  assert.deepEqual(etVoilaCaesar.allergens?.sort(), [
    "egg",
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.ok(etVoilaCroqueMadame);
  assert.deepEqual(etVoilaCroqueMadame.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "mustard",
    "wheat",
  ]);
  assert.ok(etVoilaMoules);
  assert.deepEqual(etVoilaMoules.allergens ?? [], ["shellfish"]);
  assert.ok(etVoilaProfiteroles);
  assert.deepEqual(etVoilaProfiteroles.allergens?.sort(), [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
});

test("generated Fleming's official matrix excludes dangling add-on boundary rows", () => {
  const flemings = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "flemings-prime-steakhouse-tysons-va",
  );

  assert.ok(flemings);
  assert.equal(
    flemings.items.some(
      (item) => item.id === "add" && /^Add$/i.test(item.name ?? ""),
    ),
    false,
  );
  assert.ok(flemings.items.some((item) => item.id === "add-filet-4-oz"));
  assert.ok(flemings.items.some((item) => item.id === "add-on-poke-trio"));
});

test("generated Bonefish official matrix excludes recovered generic matrix artifacts", () => {
  const bonefish = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "bonefish-grill",
  );

  assert.ok(bonefish);
  assert.ok(
    bonefish.items.some(
      (item) =>
        item.id === "crab-cake" &&
        item.allergenSourceType === "official-allergen-menu" &&
        item.allergens.includes("shellfish") &&
        /Crab Cake:/.test(JSON.stringify(item.evidence ?? [])),
    ),
  );
  assert.equal(
    bonefish.items.some(
      (item) =>
        item.sourceSummary === "Official Bonefish Grill allergen matrix." &&
        (item.evidence ?? []).some(
          (entry) => entry?.source === "reviewed-portfolio-row-recovery",
        ),
    ),
    false,
  );
  assert.equal(
    bonefish.items.some((item) => item.id === "bourbon-glaze"),
    false,
  );
  assert.equal(
    bonefish.items.some((item) => item.id === "bourbon-glaze-serves"),
    false,
  );
});

test("generated reviewed menu repairs keep Marx Cafe and Pizza Boli's from publishing parser artifacts", () => {
  const marx = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id ===
      "replacement-marx-cafe-revolutionary-cuisine-washington-dc",
  );
  const pizzaBolis = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "chain-pizza-boli-s",
  );

  assert.ok(marx);
  assert.equal(marx.items.length, 52);
  assert.ok(
    marx.items.some(
      (item) => item.name === "Calamari Fritti" && item.category === "Starters",
    ),
  );
  assert.ok(
    marx.items.some(
      (item) => item.name === "Tiramisú" && item.category === "Desserts",
    ),
  );
  assert.equal(
    marx.items.some((item) => /^\$/.test(item.name ?? "")),
    false,
  );
  assert.equal(
    marx.items.some((item) =>
      /^(?:brunch items|dinner items|weekly|whites)$/i.test(item.name ?? ""),
    ),
    false,
  );
  assert.equal(
    marx.items.some((item) =>
      /\bShowing all \d+ results\b/i.test(item.name ?? ""),
    ),
    false,
  );

  assert.ok(pizzaBolis);
  assert.equal(pizzaBolis.items.length, 179);
  assert.ok(
    pizzaBolis.items.some(
      (item) => item.name === "Cheese Pizza" && item.category === "Pizza",
    ),
  );
  assert.ok(
    pizzaBolis.items.some(
      (item) =>
        item.name === "Chicken Fetuccine Alfredo" && item.category === "Pastas",
    ),
  );
  assert.ok(
    pizzaBolis.items.some(
      (item) => item.name === "Crispy Fry Tray" && item.category === "Catering",
    ),
  );
  assert.equal(
    pizzaBolis.items.some((item) =>
      /\b(?:S|M|L|XL)\s+(?:10|12|14|16)in\b/i.test(item.name ?? ""),
    ),
    false,
  );
  assert.equal(
    pizzaBolis.items.some((item) =>
      /\b\d{2,4}\s+300\s+n\/a\b/i.test(
        `${item.name ?? ""} ${item.description ?? ""}`,
      ),
    ),
    false,
  );
  assert.equal(
    pizzaBolis.items.some((item) =>
      ["Plain", "BBQ", "Build Your Own", "Caesar"].includes(item.name ?? ""),
    ),
    false,
  );
});

test("generated reviewed low-coverage repairs keep source-backed allergens and remove official-page blobs", () => {
  const lardente = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "lardente-dc",
  );
  const twoFifty = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "two-fifty-bbq-dc",
  );
  const thompsonFallsChurch = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "thompson-italian-falls-church-dc-metro",
  );
  const thompsonAlexandria = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-thompson-italian-11874404375",
  );
  const jackRose = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "jack-rose-dining-saloon-washington-dc-dc-metro",
  );
  const burtons = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "burtons-grill-and-bar-washington-dc-dc-metro",
  );
  const lostDog = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro",
  );
  const nyaj = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "not-your-average-joe-s-reston-reston-va-dc-metro",
  );
  const karahiBoys = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-karahi-boys-13475305897",
  );
  const neutralGround = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "neutral-ground-mclean-va",
  );
  const goodCompany = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "good-company-doughnuts-ballston-va",
  );
  const pubAndPeople = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "the-pub-and-the-people-washington-dc-dc-metro",
  );
  const lacay = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "hu-tieu-mi-lacay-cho-lon-falls-church-va",
  );
  const kizuna = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "kizuna-sushi-ramen-tysons-va",
  );
  const stickyFingers = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "sticky-fingers-bakery-dc",
  );
  const shawsTavern = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "shaw-s-tavern-washington-dc-dc-metro",
  );
  const toastique = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "chain-toastique",
  );

  assert.ok(lardente);
  assert.ok(twoFifty);
  assert.ok(thompsonFallsChurch);
  assert.ok(thompsonAlexandria);
  assert.ok(jackRose);
  assert.ok(burtons);
  assert.ok(lostDog);
  assert.equal(lostDog.sourceStatus?.officialGuideParsed, true);
  assert.equal(
    lostDog.sourceStatus?.officialGuideParserProfile,
    "flipsnack-official-guide",
  );
  assert.equal(
    lostDog.sourceStatus?.officialAllergenRemediationBucket,
    "official-accommodation-guide-parsed",
  );
  assert.equal(
    lostDog.sourceStatus?.reviewedOfficialGuides?.[0]?.title,
    "Lost Dog Cafe Allergen Guide 2024",
  );
  assert.match(
    lostDog.sourceStatus?.reviewedOfficialGuides?.[0]?.summary ?? "",
    /not a full direct-allergen matrix/i,
  );
  assert.ok(nyaj);
  assert.ok(karahiBoys);
  assert.ok(neutralGround);
  assert.ok(goodCompany);
  assert.ok(pubAndPeople);
  assert.ok(lacay);
  assert.ok(kizuna);
  assert.ok(stickyFingers);
  assert.ok(shawsTavern);
  assert.ok(toastique);
  assert.equal(toastique.parserProfile, "shopify-allergen-guide");
  assert.equal(toastique.officialAllergenStatus, "extracted");
  assert.equal(toastique.allergenDataStatus?.officialItemCount, 74);
  assert.equal(
    toastique.allergenDataStatus?.officialEvidence?.bucket,
    "official-full",
  );
  assert.equal(toastique.items.length, 74);

  const toastiqueByName = new Map(
    toastique.items.map((item) => [item.name, item]),
  );
  assert.deepEqual([...toastiqueByName.get("Avocado Smash").allergens].sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.deepEqual([...toastiqueByName.get("Smoked Salmon").allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "sesame",
    "wheat",
  ]);
  assert.deepEqual([...toastiqueByName.get("Spicy Crab").allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "shellfish",
    "soy",
    "wheat",
  ]);
  assert.equal(
    toastique.items.some((item) =>
      /^Nutritional information is based/i.test(item.name),
    ),
    false,
  );
  assert.equal(
    toastique.items.some((item) => /Collection$/i.test(item.name)),
    false,
  );

  const hamachi = lardente.items.find((item) => item.id === "hamachi-crudo");
  const cesare = lardente.items.find((item) => item.id === "cesare");
  const linguine = lardente.items.find(
    (item) => item.id === "linguine-ai-frutti-di-mare",
  );
  const burrata = lardente.items.find((item) => item.id === "burrata");

  assert.ok(hamachi);
  assert.deepEqual([...hamachi.allergens].sort(), ["fish", "tree-nut"]);
  assert.ok(cesare);
  assert.deepEqual([...cesare.allergens].sort(), ["fish", "gluten", "wheat"]);
  assert.ok(linguine);
  assert.deepEqual([...linguine.allergens].sort(), [
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.ok(burrata);
  assert.deepEqual([...burrata.allergens].sort(), [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);

  assert.equal(
    twoFifty.items.some((item) => item.id === "sausage"),
    false,
  );
  assert.ok(twoFifty.items.some((item) => item.id === "chimichurri-sauce"));
  assert.ok(twoFifty.items.some((item) => item.id === "zesty-garden-mix"));

  assert.deepEqual(
    [
      ...thompsonFallsChurch.items.find(
        (item) => item.id === "kids-pizza-sticks-tray",
      ).allergens,
    ].sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.deepEqual(
    [
      ...thompsonFallsChurch.items.find(
        (item) => item.id === "mac-and-cheese-tray",
      ).allergens,
    ].sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.deepEqual(
    [
      ...thompsonAlexandria.items.find(
        (item) => item.id === "lamb-meatballs-tray",
      ).allergens,
    ].sort(),
    ["gluten", "tree-nut", "wheat"],
  );

  assert.deepEqual(
    [
      ...jackRose.items.find((item) => item.id === "fried-mac-and-cheese")
        .allergens,
    ].sort(),
    ["egg", "gluten", "milk", "wheat"],
  );
  const firecrackerShrimp = burtons.items.find(
    (item) => item.id === "firecracker-shrimp",
  );
  assert.deepEqual([...firecrackerShrimp.allergens].sort(), [
    "sesame",
    "shellfish",
  ]);
  assert.deepEqual(firecrackerShrimp.mayContain ?? [], ["milk"]);
  assert.deepEqual(
    [
      ...lostDog.items.find((item) => item.id === "italian-fries").allergens,
    ].sort(),
    ["gluten", "wheat"],
  );
  assert.deepEqual(
    [
      ...lostDog.items.find((item) => item.id === "vegan-meatball-sub")
        .allergens,
    ].sort(),
    ["gluten", "soy", "wheat"],
  );
  assert.equal(
    nyaj.items.some((item) => item.id === "burgers-and-more"),
    false,
  );
  assert.equal(
    nyaj.items.some((item) => item.id === "gluten-sensitive"),
    false,
  );

  assert.deepEqual(
    [
      ...karahiBoys.items.find((item) => item.id === "butter-naan").allergens,
    ].sort(),
    ["gluten", "milk", "wheat"],
  );
  assert.deepEqual(
    [
      ...neutralGround.items.find((item) => item.id === "ng-caesar-salad")
        .allergens,
    ].sort(),
    ["fish", "milk"],
  );
  const mangoHibiscus = goodCompany.items.find(
    (item) => item.id === "mango-hibiscus-vegan",
  );
  const stellasVeggie = goodCompany.items.find(
    (item) => item.id === "stellas-veggie-and-cheese-sandwich",
  );
  const veggieEggCheese = goodCompany.items.find(
    (item) => item.id === "veggie-egg-and-cheese-sandwich",
  );
  const steakCheese = goodCompany.items.find(
    (item) => item.id === "steak-and-cheese-sandwich",
  );
  const veggieSoupBowl = goodCompany.items.find(
    (item) => item.id === "veggie-and-rice-soup-bowl",
  );
  const veggieSoupCup = goodCompany.items.find(
    (item) => item.id === "veggie-and-rice-soup-cup",
  );
  const stellasLunchBox = goodCompany.items.find(
    (item) => item.id === "stellas-veggie-lunch-box",
  );
  const goodCompanyAppleBrieToast = goodCompany.items.find(
    (item) => item.id === "apple-and-brie-toast",
  );
  const goodCompanyAppleScone = goodCompany.items.find(
    (item) => item.id === "apple-cinnamon-scone-gf",
  );
  const goodCompanyBagelLox = goodCompany.items.find(
    (item) => item.id === "bagel-and-lox",
  );
  const goodCompanyBlT = goodCompany.items.find(
    (item) => item.id === "blt-sandwich",
  );
  const goodCompanyBombPork = goodCompany.items.find(
    (item) => item.id === "bomb-pork-belly-sandwich",
  );
  const goodCompanyGreenSmoothie = goodCompany.items.find(
    (item) => item.id === "green-smoothie",
  );
  const goodCompanyPbJ = goodCompany.items.find(
    (item) => item.id === "pbandj-sandwich",
  );
  const goodCompanyPulledChicken = goodCompany.items.find(
    (item) => item.id === "pulled-bbq-chicken",
  );
  const goodCompanyProteinSmoothie = goodCompany.items.find(
    (item) => item.id === "protein-smoothie",
  );
  const goodCompanyVeganDoughnut = goodCompany.items.find(
    (item) => item.id === "mango-hibiscus-vegan",
  );
  assert.deepEqual([...mangoHibiscus.allergens].sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.equal(
    /OUT OF STOCK/i.test(
      `${mangoHibiscus.description ?? ""} ${mangoHibiscus.ingredientsText ?? ""}`,
    ),
    false,
  );
  assert.deepEqual([...stellasVeggie.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "mustard",
    "wheat",
  ]);
  assert.deepEqual([...veggieEggCheese.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...steakCheese.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...goodCompanyAppleBrieToast.allergens].sort(), [
    "gluten",
    "milk",
    "mustard",
    "wheat",
  ]);
  assert.deepEqual([...goodCompanyAppleScone.allergens].sort(), ["milk"]);
  assert.deepEqual([...goodCompanyBagelLox.allergens].sort(), [
    "fish",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...goodCompanyBlT.allergens].sort(), [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.deepEqual([...goodCompanyBombPork.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...goodCompanyGreenSmoothie.allergens].sort(), [
    "tree-nut",
  ]);
  assert.deepEqual([...goodCompanyPbJ.allergens].sort(), [
    "gluten",
    "peanut",
    "wheat",
  ]);
  assert.deepEqual([...goodCompanyPulledChicken.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...goodCompanyProteinSmoothie.allergens].sort(), [
    "peanut",
    "tree-nut",
  ]);
  assert.equal(goodCompanyVeganDoughnut.allergens.includes("milk"), false);
  assert.equal(goodCompanyVeganDoughnut.allergens.includes("egg"), false);
  assert.ok((goodCompany.allergenDataStatus?.officialItemCount ?? 0) > 60);
  assert.equal(
    /Quesadillas/i.test(
      `${veggieSoupBowl.description ?? ""} ${veggieSoupBowl.sourceSummary ?? ""}`,
    ),
    false,
  );
  assert.equal(
    /Quesadillas/i.test(
      `${veggieSoupCup.description ?? ""} ${veggieSoupCup.sourceSummary ?? ""}`,
    ),
    false,
  );
  assert.equal(
    /Turkey Swiss|GOCO Locations/i.test(
      `${stellasLunchBox.sourceSummary ?? ""}`,
    ),
    false,
  );

  const pubHeidi = pubAndPeople.items.find(
    (item) => item.id === "the-heidi-sandwich",
  );
  const pubBiscuits = pubAndPeople.items.find(
    (item) => item.id === "biscuits-and-gravy",
  );
  const pubHotWings = pubAndPeople.items.find(
    (item) => item.id === "hot-wings",
  );
  const pubSalmon = pubAndPeople.items.find(
    (item) => item.id === "citrus-salmon-with-risotto",
  );
  const pubRigatoni = pubAndPeople.items.find(
    (item) => item.id === "creamy-rigatoni-mac-and-cheese",
  );
  const pubBlackBeanBurger = pubAndPeople.items.find(
    (item) => item.id === "seasoned-black-bean-and-rice-burger",
  );
  const pubShrimpTostadas = pubAndPeople.items.find(
    (item) => item.id === "shrimp-tostadas",
  );
  const pubTempuraCauliflower = pubAndPeople.items.find(
    (item) => item.id === "tempura-cauliflower",
  );
  assert.deepEqual([...pubHeidi.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...pubBiscuits.allergens].sort(), [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...pubHotWings.allergens].sort(), ["milk"]);
  assert.deepEqual([...pubSalmon.allergens].sort(), ["fish", "milk"]);
  assert.deepEqual([...pubRigatoni.allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual([...pubBlackBeanBurger.allergens].sort(), ["egg", "milk"]);
  assert.deepEqual([...pubShrimpTostadas.allergens].sort(), [
    "milk",
    "shellfish",
  ]);
  assert.deepEqual([...pubTempuraCauliflower.allergens].sort(), [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assert.ok((pubAndPeople.allergenDataStatus?.officialItemCount ?? 0) > 35);
  assert.deepEqual(
    [...lacay.items.find((item) => item.id === "wonton-soup").allergens].sort(),
    ["gluten", "shellfish", "wheat"],
  );
  assert.deepEqual(
    [
      ...kizuna.items.find((item) => item.id === "vegetable-tempura-app")
        .allergens,
    ].sort(),
    ["gluten", "soy", "wheat"],
  );

  const stickyBostonCream = stickyFingers.items.find(
    (item) => item.id === "boston-cream",
  );
  const stickyCarrotWalnut = stickyFingers.items.find(
    (item) => item.id === "bunny-huggers-carrot-walnut",
  );
  const stickyAllFallBars = stickyFingers.items.find(
    (item) => item.id === "all-fall-bars",
  );
  const stickyAlmondCroissants = stickyFingers.items.find(
    (item) => item.id === "almond-croissant-tray",
  );
  const stickyGlutenFreeLittleDevils = stickyFingers.items.find(
    (item) => item.id === "gluten-free-little-devils",
  );
  const stickySoyFreeChocolateLove = stickyFingers.items.find(
    (item) => item.id === "soy-free-chocolate-love-cupcakes",
  );
  const stickyStromboli = stickyFingers.items.find(
    (item) => item.id === "pepperoni-stromboli",
  );
  assert.deepEqual([...stickyBostonCream.allergens].sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.deepEqual([...stickyCarrotWalnut.allergens].sort(), [
    "gluten",
    "soy",
    "tree-nut",
    "wheat",
  ]);
  assert.ok((stickyFingers.allergenDataStatus?.officialItemCount ?? 0) >= 140);
  assert.deepEqual([...stickyAllFallBars.allergens].sort(), [
    "gluten",
    "soy",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual([...stickyAlmondCroissants.allergens].sort(), [
    "gluten",
    "soy",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual([...stickyGlutenFreeLittleDevils.allergens].sort(), ["soy"]);
  assert.deepEqual([...stickySoyFreeChocolateLove.allergens].sort(), [
    "gluten",
    "wheat",
  ]);
  assert.deepEqual([...stickyStromboli.allergens].sort(), [
    "gluten",
    "soy",
    "wheat",
  ]);
  assert.equal(
    stickyFingers.items.some(
      (item) =>
        /official/i.test(String(item.allergenSourceType ?? "")) &&
        ((item.allergens ?? []).includes("milk") ||
          (item.allergens ?? []).includes("egg")),
    ),
    false,
  );

  const rowTextOnlyOfficialMappings = generatedRestaurants.restaurants.flatMap(
    (restaurant) =>
      (restaurant.items ?? [])
        .filter((item) =>
          /Reviewed official row text: obvious ingredient terms were mapped to app allergens/i.test(
            String(item.sourceSummary ?? ""),
          ),
        )
        .map((item) => ({ restaurantId: restaurant.id, item })),
  );
  assert.ok(rowTextOnlyOfficialMappings.length > 0);
  assert.equal(
    rowTextOnlyOfficialMappings.every(
      ({ item }) => item.allergenSourceType === "official-ingredients",
    ),
    true,
  );

  assert.deepEqual(
    [
      ...shawsTavern.items.find((item) => item.id === "kale-and-beet-salad")
        .allergens,
    ].sort(),
    ["milk", "tree-nut"],
  );
  assert.deepEqual(
    [
      ...shawsTavern.items.find(
        (item) => item.id === "shaved-brussels-and-kale-salad",
      ).allergens,
    ].sort(),
    ["milk", "tree-nut"],
  );
  assert.deepEqual(
    [
      ...shawsTavern.items.find((item) => item.id === "watermelon-salad")
        .allergens,
    ].sort(),
    ["milk"],
  );
});

test("generated restaurant menus do not include operational catalog artifacts", () => {
  // Stale bundled rows that the current scraper now filters out; remove this after the next allowed app-data rebuild.
  const staleGeneratedArtifactAllowlist = new Set([
    'perry-s-restaurant-washington-dc-dc-metro:_____ "Harasu" Hako Sushi',
    "perry-s-restaurant-washington-dc-dc-metro:_____ Aspara",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Avokado",
    "perry-s-restaurant-washington-dc-dc-metro:_____ California",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Chesapeake",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Crunchy Tiger",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Dragon Roll",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Element",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Fire Cracker",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Hiramasa",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Kappa",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Madai",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Negitoro",
    "perry-s-restaurant-washington-dc-dc-metro:_____ O-Toro",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Philly",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Phoenix",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Pink Panther",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Rainbow",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Salmon Avocado",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Shima Aji",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Shrimp Tempura",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Spicy Crunchy Salmon",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Spicy Crunchy Tuna",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Spicy Tuna",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Spider Roll",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Tekka",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Tuna Avocado",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Ume Shiso",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Uni",
    "perry-s-restaurant-washington-dc-dc-metro:_____ Veggie Futomaki",
    "cielo-rojo-restaurant-takoma-park-md-dc-metro:Allow File Uploads",
    "plaka-grill-vienna-va-dc-metro:Allow File Uploads",
    "replacement-j-hollinger-s-waterman-s-chophouse-silver-spring-md:All Night Happy Hour",
    "replacement-j-hollinger-s-waterman-s-chophouse-silver-spring-md:Father’s Day Brunch",
  ]);
  const offenders = generatedRestaurants.restaurants
    .flatMap((restaurant) =>
      restaurant.items
        .filter((item) => !isProbablyMenuCatalogRecord(item))
        .map((item) => `${restaurant.id}:${item.name}`),
    )
    .filter((offender) => !staleGeneratedArtifactAllowlist.has(offender));

  assert.deepEqual(offenders, []);
});

test("generated accommodation policy shells use the active portfolio restaurant id", () => {
  const inn = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "the-inn-at-little-washington-va",
  );

  assert.ok(inn);
  assert.equal(inn.parserProfile, "accommodation-policy-shell");
  assert.equal(inn.sourceFamily, "manual-review");
  assert.equal(inn.officialAllergenStatus, "not-applicable");
  assert.equal(inn.sourceStatus?.accommodationOnly, true);
  assert.equal(inn.allergyAccommodationPolicy?.status, "partial-accommodation");
  assert.equal(
    inn.allergyAccommodationPolicy?.sourceUrl,
    "https://www.theinnatlittlewashington.com/michelin-starred-dining-room",
  );
  assert.deepEqual(inn.allergyAccommodationPolicy?.supported?.sort(), [
    "Dairy",
    "Gluten",
    "Nuts",
    "Pork",
    "Shellfish",
    "Vegetarian menu",
  ]);
});

test("generated restaurant menus contain only rows accepted by the shared row classifier", () => {
  const offenders = generatedRestaurants.restaurants.flatMap((restaurant) =>
    restaurant.items.flatMap((item) => {
      const classified = classifyMenuItemRow(item);

      return classified.kind === "menu-item"
        ? []
        : [
            `${restaurant.id}:${item.name}:${classified.kind}:${classified.reasons.join(",")}`,
          ];
    }),
  );

  assert.deepEqual(offenders, []);
});

test("generated official allergen rows with concerns do not use no-concern source summaries", () => {
  const offenders = generatedRestaurants.restaurants.flatMap((restaurant) =>
    restaurant.items.flatMap((item) => {
      const hasOfficialConcern =
        /official/i.test(String(item.allergenSourceType ?? "")) &&
        ((item.allergens?.length ?? 0) > 0 ||
          (item.mayContain?.length ?? 0) > 0);
      const hasNoConcernSummary = /no major concern marked/i.test(
        String(item.sourceSummary ?? ""),
      );

      return hasOfficialConcern && hasNoConcernSummary
        ? [`${restaurant.id}:${item.name}`]
        : [];
    }),
  );

  assert.deepEqual(offenders, []);
});

test("generated Beteseb menu excludes Wix widget rows while preserving food rows", () => {
  const beteseb = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "beteseb-silver-spring-md",
  );

  assert.ok(beteseb);
  assert.ok(beteseb.items.some((item) => item.name === "Beef Kitfo"));
  assert.ok(beteseb.items.some((item) => item.name === "Gluten Free Injera"));
  assert.deepEqual(
    beteseb.items
      .filter((item) =>
        /activity report|autocomplete suggestions|business dashboard|newsroom smart links|ecommmerce search results|get daily content updates|welcome bar/i.test(
          `${item.name} ${item.description ?? ""}`,
        ),
      )
      .map((item) => item.name),
    [],
  );
});

test("generated AllSpice menu excludes social login legal rows", () => {
  const restaurant = generatedRestaurants.restaurants.find(
    (nextRestaurant) =>
      nextRestaurant.id === "osm-allspice-catering-3397462219",
  );
  const names = new Set((restaurant?.items ?? []).map((item) => item.name));

  assert.ok(restaurant);
  assert.equal(names.has("Agree & Join LinkedIn"), false);
  assert.equal(names.has("New to LinkedIn?"), false);
  assert.equal(names.has("User Agreement"), false);
});

test("generated reviewed wing-tail repairs add cautious inference only where text supports it", () => {
  const barrel = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "replacement-barrel-washington-dc",
  );
  const awakening = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-awakening-bar-and-grill-washington-dc",
  );
  const tristate = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-tristate-indian-cuisine-herndon-va",
  );
  const ruthies = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "ruthie-s-all-day-arlington-va-dc-metro",
  );

  const barrelWings = barrel?.items.find((item) => item.id === "wings");
  const awakeningWings = awakening?.items.find((item) => item.id === "wings");
  const tristateWings = tristate?.items.find(
    (item) => item.id === "tristate-spl-chicken-wings",
  );
  const ruthiesSmokedWings = ruthies?.items.find(
    (item) => item.id === "crispy-smoked-wings-gf",
  );

  assert.ok(barrelWings);
  assert.ok(awakeningWings);
  assert.ok(tristateWings);
  assert.ok(ruthiesSmokedWings);
  assertAllergenSignalsInclude(barrelWings, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(awakeningWings, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(tristateWings, ["gluten", "wheat"]);
  assert.equal(ruthiesSmokedWings.inferredAllergenSignals, undefined);
});

test("generated oversized chain repairs remove regional and modifier catalog artifacts", () => {
  const potbelly = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "potbelly-dc",
  );
  const quiznos = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "quiznos",
  );
  const silverDiner = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "silver-diner-dc",
  );
  const cornerBakery = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "corner-bakery-cafe",
  );
  const rubyTuesday = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "ruby-tuesday",
  );
  const burgerKing = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "burger-king",
  );
  const popeyes = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "popeyes",
  );
  const dairyQueen = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "dairy-queen",
  );
  const applebees = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "applebees",
  );
  const mirchDhamaka = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id ===
      "mirch-dhamaka-indian-fine-dine-cafe-and-bar-herndon-va-dc-metro",
  );
  const asianGrill = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-asian-2393478597",
  );
  const armettas = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "osm-armetta-s-italian-pizzeria-3935138350",
  );

  assert.ok(potbelly);
  assert.ok(quiznos);
  assert.ok(silverDiner);
  assert.ok(cornerBakery);
  assert.ok(rubyTuesday);
  assert.ok(burgerKing);
  assert.ok(popeyes);
  assert.ok(dairyQueen);
  assert.ok(applebees);
  assert.ok(mirchDhamaka);
  assert.ok(asianGrill);
  assert.ok(armettas);
  assert.equal(
    potbelly.items.some((item) =>
      /\b(?:Cincinnati|Dallas|Houston)\b/i.test(
        `${item.name} ${item.category ?? ""}`,
      ),
    ),
    false,
  );
  assert.equal(
    potbelly.items.some((item) => /\bINM only\b/i.test(item.category ?? "")),
    false,
  );
  assert.ok(
    potbelly.items.length < 250,
    `expected Potbelly cleaned menu below 250 items, got ${potbelly.items.length}`,
  );
  assert.equal(
    potbelly.allergenDataStatus?.officialItemCount,
    potbelly.items.length,
  );

  const quiznosModifierCategories =
    /^(?:Condiments, Toppings, & Veggies|Dressings & Sauces|Proteins|Breads|Cheese|Fountain Drinks)$/i;
  assert.equal(
    quiznos.items.some((item) =>
      quiznosModifierCategories.test(item.category ?? ""),
    ),
    false,
  );
  assert.ok(
    quiznos.items.length < 200,
    `expected Quiznos orderable menu below 200 items, got ${quiznos.items.length}`,
  );

  assert.ok(
    silverDiner.items.length < 250,
    `expected Silver Diner cleaned menu below 250 items, got ${silverDiner.items.length}`,
  );
  assert.ok(
    silverDiner.items.some((item) => item.id === "avocado-toast-and-eggs-v"),
  );
  assert.ok(
    silverDiner.items.some(
      (item) => item.id === "crab-cake-melt-and-lobster-au-jus",
    ),
  );
  assert.equal(
    silverDiner.items.some((item) => item.id === "allergenindex"),
    false,
  );
  assert.equal(
    silverDiner.items.some((item) => /\bBWI Airport\b/i.test(item.name)),
    false,
  );
  assert.equal(
    silverDiner.items.some(
      (item) =>
        !(item.sourceUrls ?? []).some(
          (url) =>
            /silverdiner\.com\/(?:menu-|kids-menu|flexitarian-menu)/i.test(
              String(url),
            ) && !/menu-cocktails/i.test(String(url)),
        ),
    ),
    false,
  );

  assert.ok(
    cornerBakery.items.length < 250,
    `expected Corner Bakery cleaned menu below 250 items, got ${cornerBakery.items.length}`,
  );
  assert.equal(
    cornerBakery.items.some((item) =>
      /\b(?:Coffee|Beverages?)\b/i.test(item.category ?? ""),
    ),
    false,
  );
  assert.equal(
    cornerBakery.items.some((item) => (item.sourceUrls ?? []).length === 0),
    false,
  );

  assert.ok(
    rubyTuesday.items.length < 250,
    `expected Ruby Tuesday cleaned menu below 250 items, got ${rubyTuesday.items.length}`,
  );
  assert.equal(
    rubyTuesday.items.some((item) =>
      /^(?:Beverages|Promotions|Utensils|Family Bundle Meals)$/i.test(
        item.category ?? "",
      ),
    ),
    false,
  );

  assert.equal(
    burgerKing.items.some((item) =>
      /^(?:Drinks & Coffee|Condiments)$/i.test(item.category ?? ""),
    ),
    false,
  );
  assert.equal(
    popeyes.items.some((item) =>
      /^(?:Beverages|Family)$/i.test(item.category ?? ""),
    ),
    false,
  );
  assert.equal(
    dairyQueen.items.some((item) =>
      /^(?:Mobile Add Ons|Dressing, Sauces, and Dips)$/i.test(
        item.category ?? "",
      ),
    ),
    false,
  );
  assert.equal(
    dairyQueen.items.some((item) => /^AO\d/i.test(item.name ?? "")),
    false,
  );
  assert.equal(
    applebees.items.some((item) => /\bINM Only\b/i.test(item.category ?? "")),
    false,
  );
  assert.equal(
    applebees.items.some((item) =>
      /\b(?:Dipping Sauce|Flavor -)\b/i.test(item.name ?? ""),
    ),
    false,
  );
  assert.equal(
    mirchDhamaka.items.some((item) =>
      /^Large Group Dining & Private Gatherings$/i.test(item.name ?? ""),
    ),
    false,
  );
  assert.equal(mirchDhamaka.expectedLargeMenu, true);
  assert.equal(asianGrill.sourceFamily, "toast");
  assert.equal(asianGrill.parserProfile, "toast-menu");
  assert.equal(asianGrill.expectedLargeMenu, true);
  assert.equal(
    asianGrill.items.some((item) =>
      /^(?:Coke Can|Diet Coke Can|Sprite Can|Duck Sauce package|Mustard Sauce package|Soy Sauce package|Dumpling sauce|Hoisin Sauce|Hot Sauce|Mumbo sauce|Sweet & Sour Sauce|Extra .+ Sauce)/i.test(
        item.name ?? "",
      ),
    ),
    false,
  );
  assert.equal(
    armettas.items.some((item) => /^(?:1st|2nd) Half\b/i.test(item.name ?? "")),
    false,
  );
});

test("Asian Grill preserves direct menu disclosures without culinary-name inference", () => {
  const asianGrill = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-asian-2393478597",
  );
  assert.ok(asianGrill);
  const items = new Map(asianGrill.items.map((item) => [item.id, item]));

  for (const itemId of [
    "cheese-cake-1-slice",
    "chocolate-mousse-cake-1-slice",
    "home-style-wonton-soup-for-2",
    "mango-mousse-cake-1-slice",
    "wonton-soup",
    "wonton-soup-large",
  ]) {
    assert.deepEqual(
      items.get(itemId)?.allergens,
      [],
      `${itemId} should not use culinary-name inference`,
    );
    assert.equal(items.get(itemId)?.allergenSourceType, "unavailable");
  }

  assert.deepEqual(items.get("crab-cake")?.allergens, ["shellfish"]);
  assert.deepEqual(items.get("vietnamese-garden-rolls-2")?.allergens, [
    "shellfish",
    "peanut",
  ]);
  assert.deepEqual(items.get("d-cashew-nuts-shrimp")?.allergens, [
    "shellfish",
    "tree-nut",
  ]);
  assert.equal(asianGrill.allergenDataStatus?.officialItemCount, 87);
});

test("Astro DC reconciles current specials and explicit allergen disclosures", () => {
  const astro = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "astro-doughnuts-dc",
  );
  assert.ok(astro);
  const items = new Map(astro.items.map((item) => [item.id, item]));

  for (const staleId of [
    "chocolate-smores",
    "peach-melba",
    "strawberry-shortcake",
  ]) {
    assert.equal(items.has(staleId), false);
  }
  for (const currentId of [
    "peach-cobbler",
    "chocolate-birthday-cake",
    "cherry-pie",
    "classic-cruller",
  ]) {
    assert.equal(items.has(currentId), true);
    assert.equal(items.get(currentId)?.allergenSourceType, "unavailable");
  }

  assert.deepEqual(items.get("apollo-smashburger")?.allergens, ["milk"]);
  assert.deepEqual(items.get("breakfast-quesadilla")?.allergens, [
    "milk",
    "egg",
  ]);
  assert.deepEqual(items.get("chocolate-peanut-butter")?.allergens, ["peanut"]);
  assert.deepEqual(items.get("creme-brulee")?.allergens, ["milk"]);
  assert.deepEqual(items.get("double-chocolate-chip")?.allergens, ["milk"]);
  assert.deepEqual(items.get("pbandj")?.allergens, ["peanut"]);
  for (const unavailableId of [
    "the-asteroid",
    "byo-chicken-sandwich",
    "cake-batter-funfetti",
    "honey-bun",
    "old-bay-all-day",
    "smores",
    "snickerdoodle-cookie",
  ]) {
    assert.deepEqual(items.get(unavailableId)?.allergens, []);
    assert.equal(items.get(unavailableId)?.allergenSourceType, "unavailable");
  }
  assert.equal(astro.items.length, 40);
  assert.equal(astro.allergenDataStatus?.officialItemCount, 15);
});

test("Atlacatl rebuilds the current official menu with direct positive disclosures", () => {
  const atlacatl = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-atlacatl-pupuseria-372658150",
  );
  assert.ok(atlacatl);
  const items = new Map(atlacatl.items.map((item) => [item.id, item]));

  assert.equal(atlacatl.items.length, 85);
  assert.equal(new Set(atlacatl.items.map((item) => item.id)).size, 85);
  assert.equal(new Set(atlacatl.items.map((item) => item.category)).size, 15);
  for (const artifactId of [
    "chicken-entrees",
    "comes-with-spicy-red-dipping-sauce",
    "grilled-salmon-with-cream-sauce",
    "latest-atlacatl-news",
    "like-this",
    "market-price",
    "pork-entrees",
    "steak-entrees",
    "steak-or-grilled-chicken-taco",
  ]) {
    assert.equal(
      items.has(artifactId),
      false,
      `${artifactId} should not be a menu item`,
    );
  }

  assert.equal(items.get("taquitos-de-lengua")?.name, "Taquitos de Lengua");
  assert.equal(
    items.get("side-of-fried-yucca")?.description,
    "Comes with spicy red dipping sauce.",
  );
  assert.deepEqual(items.get("salvadoran-style-sandwich-de-pollo")?.allergens, [
    "egg",
    "gluten",
    "wheat",
  ]);
  assert.deepEqual(items.get("fried-shrimp")?.allergens, [
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assert.deepEqual(items.get("salmon")?.allergens, ["fish", "milk"]);
  assert.deepEqual(items.get("lengua-empanizada")?.allergens, ["egg", "milk"]);
  assert.equal(
    items.get("seafood-empanada")?.allergenSourceType,
    "unavailable",
  );
  assert.deepEqual(items.get("seafood-empanada")?.allergens, []);
  assert.equal(items.get("tacos-al-carbon")?.allergenSourceType, "unavailable");
  assert.equal(items.get("tortilla")?.allergenSourceType, "unavailable");
  assert.equal(atlacatl.allergenDataStatus?.officialItemCount, 51);
  assert.equal(atlacatl.allergenDataStatus?.officialEvidence?.unavailable, 34);
});

test("Atlas and Andy's reconciles the current Navy Yard menu", () => {
  const atlas = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "atlas-and-andys-pizza-navy-yard-dc",
  );
  assert.ok(atlas);
  const items = new Map(atlas.items.map((item) => [item.id, item]));

  assert.equal(atlas.items.length, 38);
  assert.equal(new Set(atlas.items.map((item) => item.id)).size, 38);
  assert.deepEqual(
    [...new Set(atlas.items.map((item) => item.category))],
    [
      "Starters + Salads",
      "Specialty Pies",
      "Standard Pies & Slices",
      "Extra Sauce",
    ],
  );
  for (const removedId of [
    "thu-the-garden-pie-vegan",
    "underberg-bitters",
    "wings-buffalo",
    "wings-old-bay",
  ]) {
    assert.equal(
      items.has(removedId),
      false,
      `${removedId} should be excluded`,
    );
  }
  assert.equal(items.get("fried-cauliflower")?.name, "Fried Cauliflower");
  assert.equal(items.get("old-bay-fries")?.name, "Old Bay Fries");
  assert.equal(items.get("side-of-ranch")?.category, "Extra Sauce");
  assert.deepEqual([...items.get("dairy-free-margherita").allergens].sort(), [
    "gluten",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual([...items.get("8-makes-a-pie").allergens].sort(), [
    "gluten",
    "milk",
    "wheat",
  ]);
  for (const item of atlas.items.filter((item) =>
    ["Specialty Pies", "Standard Pies & Slices"].includes(item.category),
  )) {
    assert.equal(
      item.allergens.includes("wheat"),
      true,
      `${item.id} should include wheat`,
    );
    assert.equal(
      item.allergens.includes("gluten"),
      true,
      `${item.id} should include gluten`,
    );
  }
  assert.equal(atlas.allergenDataStatus?.officialItemCount, 32);
  assert.equal(atlas.allergenDataStatus?.officialEvidence?.unavailable, 6);
});

test("Augie's Alexandria restores the current catalog and preserves source authority", () => {
  const augies = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id ===
      "augie-s-mussel-house-and-beer-garden-alexandria-va-dc-metro",
  );
  assert.ok(augies);
  const items = new Map(augies.items.map((item) => [item.id, item]));

  assert.equal(augies.items.length, 122);
  assert.equal(new Set(augies.items.map((item) => item.id)).size, 122);
  assert.equal(new Set(augies.items.map((item) => item.category)).size, 12);
  assert.equal(augies.items.at(-1).category, "Mocktails");
  for (const removedId of [
    "smoked-salmon-and-spinach-2-steak-and-asparagus",
    "smoked-salmon-and-spinach-2-steak-and-asparagus-5-crab-cake",
    "croutons-red-onion-herb-vinaigrette",
    "horseradish-provolone-crispy-onions",
    "single-or-double",
    "upgrades",
    "augies-burger",
    "maryland-crab-dip",
    "mason-fried-chicken",
    "pancake-shot",
  ]) {
    assert.equal(items.has(removedId), false, removedId);
  }

  assert.ok(
    augies.items.every(
      (item) =>
        item.mayContain?.length === 1 && item.mayContain[0] === "gluten",
    ),
  );
  assert.deepEqual(items.get("cheese-fries").allergens, ["gluten", "milk"]);
  assert.deepEqual(items.get("steak-and-cheese-egg-rolls").allergens, [
    "gluten",
    "milk",
  ]);
  assert.deepEqual(items.get("tuna-tartare").allergens, [
    "egg",
    "fish",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual(items.get("buffalo-cauliflower").allergens, []);
  assert.deepEqual(items.get("buffalo-shrimp").allergens, ["shellfish"]);
  assert.deepEqual(items.get("salmon").allergens, ["fish", "gluten", "wheat"]);
  assert.deepEqual(items.get("frites").allergens, []);
  assert.deepEqual(items.get("side-grilled-shrimp").allergens, ["shellfish"]);
  assert.equal(
    items.get("cheese-fries").allergenSourceType,
    "restaurant-linked-product-allergen-section",
  );
  assert.equal(
    items.get("side-grilled-shrimp").allergenSourceType,
    "restaurant-linked-menu-ingredients",
  );
  assert.equal(items.get("american-sliced").allergenSourceType, "unavailable");

  assert.equal(augies.allergenDataStatus?.officialItemCount, 82);
  assert.equal(
    augies.allergenDataStatus?.officialEvidence?.officialIngredientDisclosure,
    68,
  );
  assert.equal(
    augies.allergenDataStatus?.officialEvidence?.globalCrossContactNote,
    14,
  );
  assert.equal(
    augies.allergenDataStatus?.officialEvidence
      ?.restaurantLinkedIngredientDisclosure,
    5,
  );
  assert.equal(
    augies.allergenDataStatus?.officialEvidence?.restaurantLinkedProductSection,
    7,
  );
  assert.equal(augies.allergenDataStatus?.officialEvidence?.unavailable, 28);
  assert.equal(augies.sourceStatus?.canonicalProductCount, 122);
  assert.equal(augies.sourceStatus?.frozenLocationMismatchCount, 9);
  assert.deepEqual(augies.sourceUrls, [
    "https://www.eataugies.com/augies-alexandria-menu",
    "https://www.toasttab.com/local/order/augies-mussel-house-patio",
  ]);
});

test("Auntie Anne's uses the current U.S. guide and preserves global cross-contact semantics", () => {
  const auntieAnnes = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "auntie-annes",
  );
  assert.ok(auntieAnnes);
  const items = new Map(auntieAnnes.items.map((item) => [item.id, item]));
  const commonMayContain = [
    "egg",
    "fish",
    "milk",
    "peanut",
    "sesame",
    "shellfish",
    "soy",
    "tree-nut",
    "wheat",
  ];

  assert.equal(auntieAnnes.items.length, 46);
  assert.equal(new Set(auntieAnnes.items.map((item) => item.id)).size, 46);
  assert.deepEqual(
    [...new Set(auntieAnnes.items.map((item) => item.category))],
    [
      "Classic Pretzels",
      "Pretzel Dogs",
      "Pretzel Nuggets",
      "Dips",
      "Breakfast Sandwiches",
      "Lemonade & Frozen Lemonade",
      "Spritz",
      "Smoothies",
      "Coffee",
      "Fountain Drinks",
    ],
  );
  assert.equal(
    auntieAnnes.items.filter(
      (item) => item.allergenSourceType === "official-allergen-menu",
    ).length,
    39,
  );
  assert.equal(
    auntieAnnes.items.filter(
      (item) =>
        item.allergenSourceType === "official-global-cross-contact-note",
    ).length,
    7,
  );
  for (const item of auntieAnnes.items) {
    assert.deepEqual(
      item.mayContain,
      commonMayContain,
      `${item.id} global warning`,
    );
    assert.equal(
      item.allergens.includes("gluten"),
      false,
      `${item.id} fixed gluten`,
    );
    assert.equal(
      item.mayContain.includes("gluten"),
      false,
      `${item.id} may-contain gluten`,
    );
  }

  assert.deepEqual(items.get("sweet-almond-pretzel")?.allergens, [
    "milk",
    "soy",
    "tree-nut",
    "wheat",
  ]);
  assert.deepEqual(items.get("honey-mustard")?.allergens, ["egg"]);
  assert.deepEqual(items.get("ranch")?.allergens, ["egg", "milk", "soy"]);
  assert.deepEqual(items.get("marinara")?.allergens, []);
  assert.deepEqual(items.get("sweet-glaze")?.allergens, []);
  for (const id of [
    "coca-cola",
    "diet-coke",
    "dr-pepper",
    "fanta-orange",
    "root-beer",
    "sprite",
    "cherry-coke",
  ]) {
    assert.equal(items.get(id)?.category, "Fountain Drinks", id);
    assert.deepEqual(items.get(id)?.allergens, [], id);
    assert.equal(
      items.get(id)?.allergenSourceType,
      "official-global-cross-contact-note",
      id,
    );
  }
  for (const removedId of [
    "clarified-butter",
    "non-stick-spray",
    "pretzels-without-butter",
    "pretzels-with-butter",
    "stabilizer",
    "cheddar-cheese-stuffed-nuggets",
    "frozen-mocha",
    "shake-products",
  ]) {
    assert.equal(items.has(removedId), false, removedId);
  }

  assert.equal(auntieAnnes.allergenDataStatus?.officialItemCount, 46);
  assert.equal(
    auntieAnnes.allergenDataStatus?.officialEvidence?.officialFullMatrixOrApi,
    39,
  );
  assert.equal(
    auntieAnnes.allergenDataStatus?.officialEvidence?.globalCrossContactNote,
    7,
  );
  assert.equal(
    auntieAnnes.allergenDataStatus?.officialEvidence?.unavailable,
    0,
  );
  assert.equal(auntieAnnes.sourceStatus?.canonicalProductCount, 46);
  assert.deepEqual(auntieAnnes.sourceUrls, [
    "https://assets.ctfassets.net/zqt8tllj2cy0/2jjVNaTNGDoMGd4QVucpSy/0f94c0d0541ec11a334dba7ce6fc56b0/Auntie-Annes-Nutrition-Guide.pdf",
  ]);
});

test("Awakening preserves current service presentations and conservative source semantics", () => {
  const awakening = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "replacement-awakening-bar-and-grill-washington-dc",
  );
  assert.ok(awakening);
  const items = new Map(awakening.items.map((item) => [item.id, item]));

  assert.equal(awakening.items.length, 50);
  assert.equal(new Set(awakening.items.map((item) => item.id)).size, 50);
  assert.equal(
    awakening.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    31,
  );
  assert.equal(
    awakening.items.filter((item) => item.allergenSourceType === "unavailable")
      .length,
    19,
  );
  assert.ok(awakening.items.every((item) => item.mayContain.length === 0));
  assert.ok(awakening.items.every((item) => !item.allergens.includes("wheat")));
  assert.ok(
    awakening.items.every((item) => !item.allergens.includes("gluten")),
  );
  assert.deepEqual(
    awakening.items.slice(-2).map((item) => item.name),
    ["Select Draft Beers", "House Mixed Drinks"],
  );

  assert.equal(items.get("chicken-waffles")?.category, "Mains");
  assert.deepEqual(items.get("chicken-waffles")?.allergens, ["milk"]);
  assert.equal(items.get("chicken-waffles-brunch")?.category, "Brunch");
  assert.deepEqual(items.get("chicken-waffles-brunch")?.allergens, []);
  assert.deepEqual(items.get("crab-rolls")?.allergens, ["shellfish"]);
  assert.deepEqual(items.get("candied-bacon-deviled-eggs")?.allergens, ["egg"]);
  assert.deepEqual(items.get("caesar-salad")?.allergens, ["milk"]);
  assert.deepEqual(items.get("rasta-pasta")?.allergens, []);
  assert.equal(
    items.get("bourbon-bread-pudding")?.description,
    "Rich bread pudding with bourbon glaze • Whole 9in pan",
  );
  assert.equal(
    items.get("steak-frites")?.description,
    "Steak Frites 14 oz grilled ribeye with chimichurri and hand-cut fries",
  );
  assert.equal(
    items.get("caesar-salad")?.description,
    "Grilled baby gem romaine, shaved parmesan, Caesar dressing, croutons",
  );
  for (const removedId of [
    "we-are-hiring",
    "a-place-where-flavors-come-together-in-the-best-style",
    "book-your-next-party-with-us",
    "rich-bread-pudding-with-bourbon-glaze-whole-9in-pan",
    "start-your-next-adventure-with-us",
    "all-bar-bites-and-specialty-cocktails",
  ]) {
    assert.equal(items.has(removedId), false, removedId);
  }

  assert.equal(awakening.allergenDataStatus?.officialItemCount, 31);
  assert.equal(
    awakening.allergenDataStatus?.officialEvidence
      ?.officialIngredientDisclosure,
    31,
  );
  assert.equal(awakening.allergenDataStatus?.officialEvidence?.unavailable, 19);
  assert.equal(awakening.sourceStatus?.canonicalProductCount, 50);
  assert.deepEqual(awakening.sourceUrls, [
    "https://awakeningdc.com/",
    "https://awakeningdc.com/food-menu",
  ]);
});

test("Aventino preserves service formulations and linked-source authority", () => {
  const aventino = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "aventino-bethesda",
  );
  assert.ok(aventino);
  assert.equal(
    generatedRestaurants.restaurants.some(
      (restaurant) =>
        restaurant.id === "osm-aventino-cucina-romana-12342520793",
    ),
    false,
  );
  const items = new Map(aventino.items.map((item) => [item.id, item]));
  assert.deepEqual(
    aventino.items.map((item) => item.id),
    [
      "pizza-rossa",
      "acciughe-e-burro",
      "suppli-al-telefono",
      "ricotta",
      "crostini",
      "fiori",
      "prosciutto",
      "misticanza",
      "piselli",
      "funghi",
      "caprese",
      "fritto",
      "capesante",
      "tonnarelli",
      "lumache",
      "bucatini",
      "rigatoni",
      "fettucine",
      "pappardelle",
      "pesce-secondi",
      "pollo",
      "brasato",
      "prosciutto-antipasti",
      "rigatoni-carbonara",
      "prosciutto-panino",
      "aventino-burger",
      "milanese",
      "pesce-pranzo",
      "chocolate-nemesis-cake",
      "gelato-selection",
      "affogato",
      "bombolini",
      "blueberry-coffee-cake",
      "breakfast-panino",
      "lemon-ricotta-pancakes",
      "omelette-del-giorno",
      "eggs-allamatriciana",
      "aventino-tiramisu",
      "mascarpone-cheesecake",
      "chocolate-nemesis",
      "angel-food-cake",
      "cookie-plate",
      "gelato-e-sorbetto",
      "pasta-al-zozzone",
      "pizza-bianca",
      "italian-olives",
      "rosemary-taralli",
      "prosciutto-di-parma",
      "aventino-burger-happy-hour",
      "chocolate-chip-cookies",
      "sourdough-bread",
      "pesce-online-ordering",
    ],
  );

  assert.equal(aventino.items.length, 52);
  assert.equal(new Set(aventino.items.map((item) => item.id)).size, 52);
  assert.equal(
    aventino.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    27,
  );
  assert.equal(
    aventino.items.filter(
      (item) =>
        item.allergenSourceType ===
        "restaurant-linked-product-allergen-section",
    ).length,
    12,
  );
  assert.equal(
    aventino.items.filter((item) => item.allergenSourceType === "unavailable")
      .length,
    13,
  );
  assert.ok(aventino.items.every((item) => item.mayContain.length === 0));

  assert.deepEqual(items.get("rigatoni")?.allergens, ["milk"]);
  assert.deepEqual(items.get("rigatoni-carbonara")?.allergens, [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual(items.get("prosciutto")?.allergens, ["milk"]);
  assert.deepEqual(items.get("prosciutto-antipasti")?.allergens, []);
  assert.deepEqual(items.get("prosciutto-panino")?.allergens, [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.match(
    items.get("prosciutto-panino")?.variantGroup ?? "",
    /Lunch.*Brunch/,
  );
  assert.deepEqual(items.get("aventino-burger")?.allergens, [
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual(items.get("aventino-burger-happy-hour")?.allergens, [
    "milk",
  ]);
  assert.deepEqual(items.get("pesce-secondi")?.allergens, ["fish"]);
  assert.deepEqual(items.get("pesce-pranzo")?.allergens, ["fish"]);
  assert.deepEqual(items.get("pesce-online-ordering")?.allergens, [
    "fish",
    "milk",
    "tree-nut",
  ]);
  assert.equal(
    items.get("pesce-online-ordering")?.allergenSourceType,
    "restaurant-linked-product-allergen-section",
  );
  assert.equal(items.get("pasta-al-zozzone")?.isConfigurable, true);
  assert.equal(
    items.get("pasta-al-zozzone")?.sourceType,
    "restaurant-issued-json-ld-menu",
  );
  assert.deepEqual(items.get("pasta-al-zozzone")?.sourceUrls, [
    "https://aventinocucina.com/menus/",
  ]);
  assert.ok(items.get("pasta-al-zozzone")?.evidence.length > 0);
  for (const removedId of [
    "asparagi",
    "carciofo",
    "rhubarb-coffee-cake",
    "bordiga-bianco",
    "carpano-antica",
    "cocchi-americano",
    "cocchi-dopo-teatro",
    "cocchi-torino",
    "montanaro-extra-dry",
    "punt",
    "aventino-pasta-club",
    "the-washington-posts-best-new-restaurants",
  ]) {
    assert.equal(items.has(removedId), false, removedId);
  }

  assert.equal(aventino.allergenDataStatus?.officialItemCount, 27);
  assert.equal(
    aventino.allergenDataStatus?.officialEvidence?.officialIngredientDisclosure,
    27,
  );
  assert.equal(
    aventino.allergenDataStatus?.officialEvidence
      ?.restaurantLinkedProductSection,
    12,
  );
  assert.equal(aventino.allergenDataStatus?.officialEvidence?.unavailable, 13);
  assert.equal(aventino.sourceStatus?.canonicalProductCount, 52);
  assert.deepEqual(aventino.sourceStatus?.removedDuplicateRestaurantIds, [
    "osm-aventino-cucina-romana-12342520793",
  ]);
  assert.equal(
    aventino.sourceStatus?.reviewedMenuQualityRepairs?.filter(({ note }) =>
      String(note ?? "").startsWith("Verified repair: rebuilt Aventino Cucina"),
    ).length,
    1,
  );
  assert.deepEqual(aventino.sourceUrls, [
    "https://aventinocucina.com/menus/",
    "https://aventinocucina.com/faq/",
    "https://order.toasttab.com/online/aventino-extended-csd",
  ]);
});

test("AYŞE preserves the full current service boundary and narrow source authority", () => {
  const ayse = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "osm-ay-e-meze-lounge-13134929927",
  );
  assert.ok(ayse);
  const items = new Map(ayse.items.map((item) => [item.id, item]));
  assert.equal(ayse.items.length, 151);
  assert.equal(new Set(ayse.items.map((item) => item.id)).size, 151);
  assert.equal(
    ayse.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    109,
  );
  assert.equal(
    ayse.items.filter(
      (item) =>
        item.allergenSourceType ===
        "restaurant-linked-product-allergen-section",
    ).length,
    4,
  );
  assert.equal(
    ayse.items.filter(
      (item) =>
        item.allergenSourceType === "restaurant-linked-menu-ingredients",
    ).length,
    1,
  );
  assert.equal(
    ayse.items.filter((item) => item.allergenSourceType === "unavailable")
      .length,
    37,
  );
  assert.ok(ayse.items.every((item) => item.mayContain.length === 0));
  assert.deepEqual(items.get("fried-green-tomatoes")?.allergens, [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assert.deepEqual(items.get("baklava")?.allergens, [
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assert.equal(
    items.get("baklava")?.allergenSourceType,
    "restaurant-linked-product-allergen-section",
  );
  assert.equal(
    items.get("strawberry-sundae")?.allergenSourceType,
    "restaurant-linked-menu-ingredients",
  );
  assert.deepEqual(items.get("side-ayse-aioli")?.sourceUrls, [
    "https://order.toasttab.com/online/ayse",
  ]);
  assert.deepEqual(items.get("kids-cheese-pizza")?.sourceUrls, [
    "https://aysemeze.com/wp-content/uploads/2026/03/KIDS-MENU.pdf",
  ]);
  assert.equal(
    items.get("todays-lunch-feature")?.allergenSourceType,
    "unavailable",
  );
  assert.equal(items.get("todays-lunch-feature")?.isConfigurable, true);
  for (const removedId of [
    "caesar-salad-hummus-bowl",
    "cheese-pizza-pepperoni-pizza",
    "crabcake-fritters",
    "ice-cream-sundae",
    "linguini-pomodoro",
    "macaroni-and-cheese",
    "muhammara",
    "new-york-strip-steak",
    "salad-add-ons-chicken-dollar7-gulf-shrimp-dollar11-faroe-islands-salmon-dollar16-white-anchovies",
    "warm-pita",
  ])
    assert.equal(items.has(removedId), false, removedId);
  assert.equal(ayse.sourceStatus?.canonicalProductCount, 151);
  assert.equal(ayse.sourceStatus?.frozenAllergenOrProvenanceMismatchCount, 48);
  assert.equal(
    ayse.sourceStatus?.reviewedMenuQualityRepairs?.filter(({ note }) =>
      String(note ?? "").startsWith(
        "Verified repair: rebuilt AYŞE Meze Lounge",
      ),
    ).length,
    1,
  );
  assert.equal(
    ayse.allergenDataStatus?.officialEvidence?.officialIngredientDisclosure,
    109,
  );
  assert.equal(
    ayse.allergenDataStatus?.officialEvidence
      ?.restaurantLinkedIngredientDisclosure,
    1,
  );
  assert.equal(
    ayse.allergenDataStatus?.officialEvidence?.restaurantLinkedProductSection,
    4,
  );
  assert.equal(ayse.allergenDataStatus?.officialEvidence?.unavailable, 37);
});

test("Azteca College Park preserves the full linked ordering catalog and authority", () => {
  const azteca = generatedRestaurants.restaurants.find(
    (restaurant) =>
      restaurant.id === "azteca-restaurant-college-park-md-dc-metro",
  );
  assert.ok(azteca);
  const items = new Map(azteca.items.map((item) => [item.id, item]));
  const categoryCounts = Object.fromEntries(
    [...new Set(azteca.items.map((item) => item.category))].map((category) => [
      category,
      azteca.items.filter((item) => item.category === category).length,
    ]),
  );

  assert.equal(azteca.items.length, 94);
  assert.equal(new Set(azteca.items.map((item) => item.id)).size, 94);
  assert.deepEqual(categoryCounts, {
    Appetizers: 7,
    Quesadillas: 3,
    Soups: 3,
    Salads: 4,
    "Plato Picadera Especial": 1,
    "Plato Grande": 2,
    Combinations: 3,
    "Azteca Sampler": 1,
    Seafood: 7,
    Beef: 8,
    Pork: 1,
    Chicken: 2,
    "Sizzling Fajitas": 7,
    "Tacos / Burritos": 10,
    Chimichangas: 4,
    Enchiladas: 5,
    Vegetarian: 3,
    "Side Orders": 20,
    "Kid's Menu": 3,
  });
  assert.equal(
    azteca.items.filter(
      (item) =>
        item.allergenSourceType === "restaurant-linked-menu-ingredients",
    ).length,
    65,
  );
  assert.equal(
    azteca.items.filter((item) => item.allergenSourceType === "unavailable")
      .length,
    29,
  );
  assert.ok(
    azteca.items.every((item) => !/official/i.test(item.allergenSourceType)),
  );
  assert.ok(azteca.items.every((item) => item.mayContain.length === 0));
  assert.ok(azteca.items.every((item) => !item.allergens.includes("wheat")));
  assert.ok(azteca.items.every((item) => !item.allergens.includes("gluten")));
  assert.deepEqual(items.get("ceviche-mixto-peruano")?.allergens, [
    "fish",
    "shellfish",
  ]);
  assert.deepEqual(items.get("grilled-chicken-quesadilla")?.allergens, [
    "milk",
  ]);
  assert.deepEqual(items.get("mariscada-soup")?.allergens, [
    "egg",
    "fish",
    "shellfish",
  ]);
  assert.equal(items.get("mariscada-soup")?.isConfigurable, true);
  assert.equal(items.get("plato-picadera-especial")?.evidence.length, 2);
  assert.equal(azteca.allergenDataStatus?.officialItemCount, 0);
  assert.equal(
    azteca.allergenDataStatus?.officialEvidence
      ?.restaurantLinkedIngredientDisclosure,
    65,
  );
  assert.equal(azteca.allergenDataStatus?.officialEvidence?.unavailable, 29);
  assert.equal(azteca.sourceStatus?.canonicalProductCount, 94);
  assert.equal(azteca.sourceStatus?.rawMenuPresentationCount, 103);
  assert.equal(azteca.sourceStatus?.uniqueVendorProductCount, 95);
  assert.deepEqual(azteca.sourceUrls, [
    "https://www.aztecarestaurantcantinamd.com/",
    "https://aztecarestaurantcantinamd.com/azteca-restaurant-cantina/menu/9505-Baltimore-Ave/",
  ]);
});

test("B Side preserves all rendered owner-menu boundaries and linked authority", () => {
  const bSide = generatedRestaurants.restaurants.find(
    (restaurant) => restaurant.id === "b-side-mosaic-fairfax-va",
  );
  assert.ok(bSide);
  const items = new Map(bSide.items.map((item) => [item.id, item]));

  assert.deepEqual(
    bSide.items.slice(0, 31).map((item) => item.id),
    [
      "smoked-pimento-cheese",
      "pickled-deviled-eggs",
      "48-hour-fermented-focaccia",
      "brussels-sprouts",
      "caesar-salad",
      "heirloom-tomato-salad",
      "charred-asparagus",
      "grilled-artichokes",
      "sicilian-anchovies",
      "grilled-shishitos",
      "swedish-meatballs",
      "bbqd-carrots",
      "smoked-wings",
      "crispy-chesapeake-oysters",
      "spam",
      "lettuce-wraps",
      "ahi-tuna-poke",
      "smoked-olives",
      "sour-cream-and-onion-chicharrones",
      "chili-spiced-nuts",
      "trio-of-the-above-3-snacks",
      "beef-fat-fries",
      "b-side-smashburger",
      "rambos-spice-bag",
      "steak-frites",
      "hickory-smoked-brisket",
      "mixtape",
      "samples",
      "flourless-brownie",
      "choco-flan",
      "lemon-ricotta-donuts",
    ],
  );
  assert.equal(bSide.items.length, 58);
  assert.equal(new Set(bSide.items.map((item) => item.id)).size, 58);
  assert.equal(
    bSide.items.filter(
      (item) => item.allergenSourceType === "official-ingredients",
    ).length,
    30,
  );
  assert.equal(
    bSide.items.filter(
      (item) =>
        item.allergenSourceType === "restaurant-linked-menu-ingredients",
    ).length,
    2,
  );
  assert.equal(
    bSide.items.filter(
      (item) =>
        item.allergenSourceType ===
        "restaurant-linked-product-allergen-section",
    ).length,
    2,
  );
  assert.equal(
    bSide.items.filter((item) => item.allergenSourceType === "unavailable")
      .length,
    24,
  );
  assert.deepEqual(
    bSide.items
      .filter((item) => item.mayContain.length > 0)
      .map((item) => item.id),
    ["sour-cream-and-onion-chicharrones"],
  );
  for (const id of [
    "swedish-meatballs",
    "smoked-wings",
    "crispy-chesapeake-oysters",
    "spam",
    "lettuce-wraps",
    "ahi-tuna-poke",
  ])
    assert.equal(items.get(id)?.category, "Small Plates", id);
  assert.equal(items.get("mixtape")?.isConfigurable, true);
  assert.equal(items.get("samples")?.isConfigurable, true);
  assert.deepEqual(items.get("charred-asparagus")?.allergens, [
    "milk",
    "sesame",
  ]);
  assert.deepEqual(items.get("sicilian-anchovies")?.allergens, [
    "fish",
    "milk",
  ]);
  assert.deepEqual(items.get("rambos-spice-bag")?.allergens, [
    "gluten",
    "milk",
    "sesame",
    "soy",
  ]);
  assert.equal(
    items.get("rambos-spice-bag")?.allergenSourceType,
    "restaurant-linked-product-allergen-section",
  );
  assert.deepEqual(items.get("caesar-salad")?.allergens, ["fish", "milk"]);
  assert.equal(
    items.get("caesar-salad")?.allergenSourceType,
    "restaurant-linked-menu-ingredients",
  );
  assert.deepEqual(items.get("b-side-smashburger")?.allergens, ["milk"]);
  assert.equal(
    items.get("b-side-smashburger")?.allergenSourceType,
    "restaurant-linked-menu-ingredients",
  );
  assert.deepEqual(items.get("sour-cream-and-onion-chicharrones")?.mayContain, [
    "gluten",
    "milk",
  ]);
  assert.deepEqual(items.get("beef-fat-fries")?.allergens, []);
  assert.ok(items.has("smoked-salmon-eggs-benedict"));
  assert.ok(items.has("kids-quesadilla"));
  assert.ok(items.has("pig-wings"));
  assert.deepEqual(
    bSide.items.slice(-7).map((item) => item.id),
    [
      "french-press-coffee",
      "hot-tea",
      "martinellis-apple-juice",
      "topo-chico-mineral-12-oz",
      "canned-soda",
      "orange-juice",
      "whole-milk",
    ],
  );
  assert.equal(bSide.allergenDataStatus?.officialItemCount, 30);
  assert.equal(
    bSide.allergenDataStatus?.officialEvidence?.officialIngredientDisclosure,
    30,
  );
  assert.equal(
    bSide.allergenDataStatus?.officialEvidence
      ?.restaurantLinkedIngredientDisclosure,
    2,
  );
  assert.equal(
    bSide.allergenDataStatus?.officialEvidence?.restaurantLinkedProductSection,
    2,
  );
  assert.equal(bSide.allergenDataStatus?.officialEvidence?.unavailable, 24);
  assert.equal(bSide.sourceStatus?.canonicalProductCount, 58);
  assert.equal(bSide.sourceStatus?.rawMenuPresentationCount, 66);
  assert.equal(bSide.sourceStatus?.collapsedDuplicatePresentationCount, 8);
  assert.deepEqual(bSide.sourceUrls, [
    "https://www.bsidecuts.com/",
    "https://dfef6bc4-dc09-4504-9828-e216a68da2c8.filesusr.com/ugd/6ace1f_cd888eef59024d1aa7dc49da0d5df425.pdf",
    "https://www.bsidecuts.com/_files/ugd/5d717b_e5db96761a614d97a634404bb38a7f4d.pdf",
    "https://www.bsidecuts.com/_files/ugd/5d717b_daff303633f44d759b504a068297ff4f.pdf",
    "https://www.bsidecuts.com/_files/ugd/5d717b_276bb7bc0e444aa89002445444fcf069.pdf",
    "https://order.online/store/red-apron-b-side-mosaic-fairfax-210444",
  ]);
});

test("generated restaurants include logo metadata", () => {
  const missing = generatedRestaurants.restaurants
    .filter(
      (restaurant) =>
        !restaurant.logoUrl &&
        !restaurant.logoSvgUrl &&
        !restaurant.logoMonogram,
    )
    .map((restaurant) => `${restaurant.id}:${restaurant.name}`);

  assert.deepEqual(missing, []);
});

test("coverage gate publishes complete restaurants", () => {
  const generatedAt = "2026-06-03T08:17:00.000Z";
  const repository = {
    generatedAt,
    restaurants: [
      {
        id: "complete",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [{ name: "Item", allergens: [] }],
      },
    ],
    snapshotVersion: 1,
  };

  const gated = applyCoverageGate(repository);

  assert.equal(gated.manifest.published.length, 1);
  assert.equal(gated.repository.restaurants[0].coverageStatus, "complete");
});

test("coverage gate reconciles official contains and may-contain evidence without downgrading source", () => {
  const repository = {
    generatedAt: "2026-07-06T08:17:00.000Z",
    restaurants: [
      {
        id: "official-evidence-reconcile",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [
          {
            id: "portuguese-roll",
            name: "Portuguese Roll",
            allergenSourceType: "official-allergen-menu",
            allergens: ["wheat"],
            mayContain: [],
            officialSource: true,
            evidence: [
              {
                sourceKind: "pdf-matrix",
                text: "Contains: Wheat May Contain: Milk, Egg, Soy, Sesame Seeds, Sulphites",
              },
            ],
          },
          {
            id: "boneless-breast",
            name: "Boneless Breast",
            allergenSourceType: "official-allergen-menu",
            allergens: [],
            mayContain: [],
            officialSource: true,
            evidence: [
              {
                sourceKind: "pdf-matrix",
                text: "May Contain: Soy, Wheat, Mustard, Egg",
              },
            ],
          },
          {
            id: "vegan-fried-tofu-bento-box",
            name: "Vegan Fried Tofu Bento Box",
            allergenSourceType: "official-ingredients",
            allergens: [],
            mayContain: [],
            officialSource: true,
            sourceSummary:
              "Official source row reviewed; no major concern marked in source row.",
            evidence: [
              {
                sourceKind: "pdf-ingredients",
                text: "Y Y Y Y Y NOTE Y N Y gluten - cross contamination - same fryer as panko chicken",
              },
            ],
          },
        ],
      },
    ],
    snapshotVersion: 1,
  };

  const gated = applyCoverageGate(repository);
  const byId = new Map(
    gated.repository.restaurants[0].items.map((item) => [item.id, item]),
  );

  assert.deepEqual(byId.get("portuguese-roll").allergens, ["wheat"]);
  assert.deepEqual(byId.get("portuguese-roll").mayContain, [
    "egg",
    "milk",
    "sesame",
    "soy",
    "sulfites",
  ]);
  assert.deepEqual(byId.get("boneless-breast").allergens, []);
  assert.deepEqual(byId.get("boneless-breast").mayContain, [
    "egg",
    "mustard",
    "soy",
    "wheat",
  ]);
  assert.equal(byId.get("boneless-breast").officialSource, true);
  assert.deepEqual(byId.get("vegan-fried-tofu-bento-box").allergens, []);
  assert.deepEqual(byId.get("vegan-fried-tofu-bento-box").mayContain, [
    "gluten",
  ]);
  assert.equal(
    byId.get("vegan-fried-tofu-bento-box").sourceSummary,
    "Official dietary matrix note: gluten - cross contamination - same fryer as panko chicken",
  );
});

test("coverage gate keeps previous complete chain when refresh is incomplete", () => {
  const previous = {
    restaurants: [
      {
        id: "chain",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [{ name: "Known Good", allergens: [] }],
        sourceUpdatedAt: "2026-06-02T08:17:00.000Z",
      },
    ],
  };
  const repository = {
    generatedAt: "2026-06-03T08:17:00.000Z",
    restaurants: [
      {
        id: "chain",
        brandKey: "current-chain",
        coveragePercent: 50,
        coverageStatus: "blocked",
        items: [{ name: "Partial", allergens: [] }],
        officialAllergenRemediationBucket: "build-shared-parser",
        officialAllergenStatus: "source-found-unparsed",
        parserProfile: "current-parser-profile",
        sourceFamily: "generic-website",
        sourceProfile: "generic-website:current-parser-profile",
        sourceStatus: { failed: 1, ok: 1, total: 2 },
      },
    ],
    snapshotVersion: 1,
  };

  const gated = applyCoverageGate(repository, previous);

  assert.equal(gated.manifest.keptPrevious.length, 1);
  assert.equal(gated.repository.restaurants[0].coverageStatus, "kept-previous");
  assert.equal(gated.repository.restaurants[0].items[0].name, "Known Good");
  assert.equal(gated.repository.restaurants[0].brandKey, "current-chain");
  assert.equal(gated.repository.restaurants[0].sourceFamily, "generic-website");
  assert.equal(
    gated.repository.restaurants[0].parserProfile,
    "current-parser-profile",
  );
  assert.equal(
    gated.repository.restaurants[0].failedRefresh.attemptedSourceMetadata
      .sourceProfile,
    "generic-website:current-parser-profile",
  );
});

test("coverage gate keeps previous when complete refresh regresses with unparsed official source", () => {
  const previous = {
    restaurants: [
      {
        id: "nutritionix-chain",
        coveragePercent: 2,
        coverageStatus: "complete",
        items: Array.from({ length: 37 }, (_value, index) => ({
          name: `Known Good ${index + 1}`,
          allergens: index === 0 ? ["milk"] : [],
          allergenSourceType:
            index === 0 ? "official-allergen-menu" : "unavailable",
        })),
        officialAllergenStatus: "extracted",
        sourceUpdatedAt: "2026-06-02T08:17:00.000Z",
      },
    ],
  };
  const repository = {
    generatedAt: "2026-06-03T08:17:00.000Z",
    restaurants: [
      {
        id: "nutritionix-chain",
        brandKey: "nutritionix-chain",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [
          {
            name: "Single Live Item",
            allergens: ["milk"],
            allergenSourceType: "official-product-allergen-section",
          },
        ],
        officialAllergenRemediationBucket: "build-shared-parser",
        officialAllergenStatus: "source-found-unparsed",
        parserProfile: "generic-website",
        sourceFamily: "generic-website",
        sourceProfile: "generic-website:generic-website",
        sourceStatus: { failed: 0, ok: 12, total: 12 },
      },
    ],
    snapshotVersion: 1,
  };

  const gated = applyCoverageGate(repository, previous);

  assert.equal(gated.manifest.keptPrevious.length, 1);
  assert.equal(gated.repository.restaurants[0].coverageStatus, "kept-previous");
  assert.equal(gated.repository.restaurants[0].items.length, 37);
  assert.equal(gated.repository.restaurants[0].items[0].name, "Known Good 1");
  assert.equal(
    gated.repository.restaurants[0].officialAllergenStatus,
    "extracted",
  );
  assert.equal(
    gated.repository.restaurants[0].failedRefresh.attemptedSourceMetadata
      .officialAllergenStatus,
    "source-found-unparsed",
  );
  assert.match(
    gated.repository.restaurants[0].failedRefresh.reason,
    /official source/,
  );
});

test("coverage gate can seed previous known-good chains from bundled data", () => {
  const bundledSeed = {
    restaurants: [
      {
        id: "olive-garden",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [{ name: "Known Good Pasta", allergens: ["wheat"] }],
      },
    ],
  };
  const s3Previous = {
    restaurants: [
      {
        id: "olive-garden",
        coveragePercent: 0,
        coverageStatus: "blocked",
        items: [],
      },
    ],
  };
  const repository = {
    generatedAt: "2026-06-03T08:17:00.000Z",
    restaurants: [
      {
        id: "olive-garden",
        coveragePercent: 0,
        coverageStatus: "blocked",
        items: [],
      },
    ],
    snapshotVersion: 1,
  };

  const previous = combinePreviousKnownGoodRepositories(
    bundledSeed,
    s3Previous,
  );
  const gated = applyCoverageGate(repository, previous);

  assert.equal(gated.manifest.keptPrevious.length, 1);
  assert.equal(gated.repository.restaurants[0].coverageStatus, "kept-previous");
  assert.equal(
    gated.repository.restaurants[0].items[0].name,
    "Known Good Pasta",
  );
});

test("coverage metadata stores only the non-derived official item count", () => {
  const restaurant = addCoverageMetadata(
    {
      id: "chain",
      items: [
        {
          name: "Official Pasta",
          allergenSourceType: "official-allergen-menu",
        },
        { name: "Fallback Pasta", allergenSourceType: "unavailable" },
      ],
    },
    { id: "chain", minOfficialItemCount: 1 },
    "2026-06-03T08:17:00.000Z",
  );

  assert.equal(restaurant.allergenDataStatus.officialItemCount, 1);
  assert.equal(
    restaurant.allergenDataStatus.officialEvidence.bucket,
    "official-disclosure-only",
  );
  assert.equal(
    restaurant.sourceStatus.officialEvidenceBucket,
    "official-disclosure-only",
  );
});

test("coverage metadata labels single item official disclosures without dropping them", () => {
  const restaurant = addCoverageMetadata(
    {
      id: "local-with-one-official-disclosure",
      items: [
        {
          name: "White Bean & Pesto Soup",
          allergenSourceType: "official-ingredients",
          allergens: ["milk", "tree-nut"],
        },
        ...Array.from({ length: 30 }, (_, index) => ({
          name: `Menu Item ${index}`,
          allergenSourceType: "unavailable",
        })),
      ],
    },
    { id: "local-with-one-official-disclosure", minOfficialItemCount: 1 },
    "2026-06-03T08:17:00.000Z",
  );

  assert.equal(restaurant.allergenDataStatus.officialItemCount, 1);
  assert.equal(
    restaurant.allergenDataStatus.officialEvidence.officialIngredientDisclosure,
    1,
  );
  assert.equal(
    restaurant.allergenDataStatus.officialEvidence.bucket,
    "official-disclosure-only",
  );
});

test("coverage metadata blocks tiny menu-only fallback restaurants without explicit approval", () => {
  const restaurant = addCoverageMetadata(
    {
      allowUnavailableAllergenFallback: true,
      id: "local-menu-only",
      items: [
        {
          allergenSourceType: "unavailable",
          allergens: [],
          name: "Little Gem Caesar",
        },
      ],
      type: "local",
    },
    {
      approvedMenuOnlyParser: true,
      id: "local-menu-only",
      minMenuItemCount: 20,
      minOfficialItemCount: 1,
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(restaurant.coverageStatus, "blocked");
  assert.equal(restaurant.coveragePercent, 0);
  assert.equal(restaurant.allergenDataStatus.officialItemCount, 0);
  assert.equal(
    restaurant.allergenDataStatus.officialEvidence.bucket,
    "source-found-unparsed",
  );
  assert.equal("allowUnavailableAllergenFallback" in restaurant, false);
});

test("coverage metadata can publish reviewed concise menu-only restaurants", () => {
  const restaurant = addCoverageMetadata(
    {
      id: "reviewed-menu-only",
      items: Array.from({ length: 10 }, (_value, index) => ({
        allergenSourceType: "unavailable",
        allergens: [],
        name: `Reviewed Dish ${index + 1}`,
      })),
      officialAllergenStatus: "not-found",
      reviewedMenuOnlyFallback: true,
      reviewedMenuOnlyMinItemCount: 10,
      type: "local",
    },
    {
      approvedMenuOnlyParser: true,
      id: "reviewed-menu-only",
      minMenuItemCount: 20,
      minOfficialItemCount: 1,
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.coveragePercent, 0);
  assert.equal(restaurant.allergenDataStatus.officialItemCount, 0);
});

test("coverage metadata can publish explicitly expected small menu fallback restaurants", () => {
  const restaurant = addCoverageMetadata(
    {
      allowUnavailableAllergenFallback: true,
      expectedSmallMenu: true,
      id: "small-local-menu-only",
      items: [
        {
          allergenSourceType: "unavailable",
          allergens: [],
          name: "Little Gem Caesar",
        },
      ],
      type: "local",
    },
    {
      approvedMenuOnlyParser: true,
      id: "small-local-menu-only",
      minMenuItemCount: 20,
      minOfficialItemCount: 1,
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.coveragePercent, 0);
  assert.equal(restaurant.allergenDataStatus.officialItemCount, 0);
  assert.equal(
    restaurant.allergenDataStatus.officialEvidence.bucket,
    "source-found-unparsed",
  );
  assert.equal("allowUnavailableAllergenFallback" in restaurant, false);
  assert.equal("expectedSmallMenu" in restaurant, false);
});

test("coverage metadata can publish explicitly opted-in chain menu-only fallback restaurants", () => {
  const restaurant = addCoverageMetadata(
    {
      allowUnavailableAllergenFallback: true,
      id: "chain-menu-only",
      items: Array.from({ length: 20 }, (_value, index) => ({
        allergenSourceType: "unavailable",
        allergens: [],
        name: `Chicken Pesto Bowl ${index + 1}`,
      })),
    },
    {
      approvedMenuOnlyParser: true,
      id: "chain-menu-only",
      minMenuItemCount: 20,
      minOfficialItemCount: 1,
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.coveragePercent, 0);
  assert.equal(restaurant.allergenDataStatus.officialItemCount, 0);
  assert.equal(
    restaurant.allergenDataStatus.officialEvidence.bucket,
    "source-found-unparsed",
  );
  assert.equal("allowUnavailableAllergenFallback" in restaurant, false);
});

test("coverage metadata can publish approved menu-only restaurants when official allergens are not found", () => {
  const restaurant = addCoverageMetadata(
    {
      id: "approved-menu-only-not-found",
      officialAllergenStatus: officialAllergenStatuses.notFound,
      items: Array.from({ length: 20 }, (_value, index) => ({
        allergenSourceType: "unavailable",
        allergens: [],
        name: `Chicken Pesto Bowl ${index + 1}`,
      })),
    },
    {
      approvedMenuOnlyParser: true,
      id: "approved-menu-only-not-found",
      minMenuItemCount: 20,
      minOfficialItemCount: 1,
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.coveragePercent, 0);
  assert.equal(restaurant.allergenDataStatus.officialItemCount, 0);
  assert.equal(
    restaurant.allergenDataStatus.officialEvidence.bucket,
    "source-found-unparsed",
  );
  assert.equal("allowUnavailableAllergenFallback" in restaurant, false);
});

test("coverage metadata can publish useful partial official extraction with fallback", () => {
  const restaurant = addCoverageMetadata(
    {
      allowUnavailableAllergenFallback: true,
      id: "local-partial-official",
      officialAllergenStatus: officialAllergenStatuses.extracted,
      items: Array.from({ length: 50 }, (_value, index) => ({
        allergenSourceType:
          index < 12 ? "official-allergen-menu" : "unavailable",
        name: `Item ${index + 1}`,
      })),
    },
    {
      id: "local-partial-official",
      minMenuItemCount: 20,
      minOfficialItemCount: 1,
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(restaurant.coverageStatus, "complete");
  assert.equal(restaurant.coveragePercent, 24);
  assert.equal(restaurant.allergenDataStatus.officialItemCount, 12);
  assert.equal(
    restaurant.allergenDataStatus.officialEvidence.bucket,
    "official-disclosure-only",
  );
  assert.equal("allowUnavailableAllergenFallback" in restaurant, false);
});

test("coverage gate backfills resolved official source status onto kept previous snapshots", () => {
  const previous = {
    restaurants: [
      {
        id: "resolved-source",
        coveragePercent: 100,
        coverageStatus: "complete",
        items: [{ name: "Known Good", allergenSourceType: "unavailable" }],
        officialAllergenStatus: "source-found-unparsed",
      },
    ],
  };
  const repository = {
    generatedAt: "2026-06-18T08:17:00.000Z",
    restaurants: [
      {
        id: "resolved-source",
        coveragePercent: 0,
        coverageStatus: "blocked",
        items: [{ name: "Attempted", allergenSourceType: "unavailable" }],
        officialAllergenRemediationBucket: "no-official-source",
        officialAllergenStatus: "not-found",
      },
    ],
    snapshotVersion: 1,
  };

  const gated = applyCoverageGate(repository, previous);

  assert.equal(gated.manifest.keptPrevious.length, 1);
  assert.equal(
    gated.repository.restaurants[0].officialAllergenStatus,
    "not-found",
  );
  assert.equal(
    gated.repository.restaurants[0].failedRefresh.attemptedSourceMetadata
      .officialAllergenStatus,
    "not-found",
  );
});

test("snapshot validator rejects missing snapshot version", () => {
  assert.equal(validateRestaurantRepository({ restaurants: [] }), false);
});

test("restaurant search tokens include aliases and normalized prefixes", () => {
  const tokens = searchTokensForRestaurant({
    category: "Burgers",
    id: "mcdonalds",
    name: "McDonald's",
  });

  assert.equal(tokens.includes("mcd"), true);
  assert.equal(tokens.includes("mcdonalds"), true);
  assert.equal(tokens.includes("mickey d"), true);
});

test("restaurant search index emits metadata, popularity, token, and geo rows", () => {
  const rows = buildRestaurantSearchIndexRows({
    generatedAt: "2026-06-18T08:17:00.000Z",
    restaurants: [
      {
        domain: "localtest.example",
        id: "local-test",
        items: [{ allergens: [], name: "Soup" }],
        lat: 35.2271,
        lng: -80.8431,
        logoUrl: "https://cdn.example/logo.png",
        name: "Local Test Cafe",
        rank: 42,
      },
    ],
  });

  const meta = rows.find((row) => row.pk === "META#local-test#national");
  assert.equal(Boolean(meta), true);
  assert.equal(meta?.domain, "localtest.example");
  assert.equal(meta?.logoUrl, "https://cdn.example/logo.png");
  assert.equal(
    rows.some((row) => row.pk === "POPULAR#GLOBAL"),
    true,
  );
  assert.equal(
    rows.some((row) => row.pk === "TOKEN#local"),
    true,
  );
  assert.equal(
    rows.some((row) => String(row.pk).startsWith("GEO#")),
    true,
  );
  assert.equal(
    rows.some((row) => String(row.pk).includes("SCAN")),
    false,
  );
  for (const row of rows.filter((row) => !String(row.pk).startsWith("META#"))) {
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        ...(String(row.pk).startsWith("GEO#") ? ["geohash"] : []),
        ...(String(row.pk).startsWith("TOKEN#") ? ["matchToken"] : []),
        "locationId",
        "pk",
        "rank",
        "restaurantId",
        "sk",
      ].sort(),
    );
  }
});

test("restaurant compatibility summary stores exact item indexes", () => {
  const summary = compatibilitySummaryForRestaurant({
    items: [
      { allergens: ["wheat", "milk"], name: "Mac" },
      { allergens: ["wheat"], mayContain: ["soy"], name: "Bread" },
      { allergenSourceType: "unavailable", allergens: [], name: "Mystery" },
    ],
  });

  assert.deepEqual(summary.directAllergenItemCounts.wheat, 2);
  assert.deepEqual(summary.directAllergenItemIndexes.wheat, [0, 1]);
  assert.deepEqual(summary.mayContainAllergenItemIndexes.soy, [1]);
  assert.deepEqual(summary.unavailableItemIndexes, [0, 1, 2]);
});

test("restaurant compatibility summary keeps official negative coverage allergy-specific", () => {
  const summary = compatibilitySummaryForRestaurant({
    officialAllergenProfiles: {
      m1: { coveredAllergenIds: ["egg", "milk", "wheat"] },
    },
    items: [
      {
        allergenSourceType: "official-allergen-menu",
        allergens: [],
        mayContain: [],
        name: "Salt Packet",
        officialAllergenProfileId: "m1",
      },
    ],
  });

  assert.deepEqual(summary.unavailableAllergenItemIndexes.milk, []);
  assert.deepEqual(summary.unavailableAllergenItemIndexes.gluten, [0]);
  assert.deepEqual(summary.unavailableAllergenItemIndexes.peanut, [0]);
  assert.deepEqual(summary.unavailableItemIndexes, []);
});

test("unprofiled items cannot inherit all-allergen coverage from sibling profiles", () => {
  const summary = compatibilitySummaryForRestaurant({
    officialAllergenProfiles: {
      m1: { coveredAllergenIds: ["milk", "shellfish", "tree-nut"] },
    },
    items: [
      {
        allergenSourceType: "official-allergen-menu",
        allergens: [],
        name: "Profiled Item",
        officialAllergenProfileId: "m1",
      },
      {
        allergenSourceType: "official-ingredients",
        allergens: [],
        name: "Unprofiled Item",
      },
    ],
  });

  assert.deepEqual(summary.unavailableAllergenItemIndexes.shellfish, [1]);
  assert.deepEqual(summary.unavailableAllergenItemIndexes["tree-nut"], [1]);
});

test("colon-suffixed section labels are structural headings rather than menu items", () => {
  assert.deepEqual(
    classifyMenuItemRow({ name: "GLUTEN-SENSITIVE:" }),
    { kind: "source-note", reasons: ["section-header-name"] },
  );
});

test("refresh metadata defaults chains to manual and locals to user-demand", () => {
  const chainMeta = refreshMetadataForRestaurant(
    { sourceUpdatedAt: "2026-06-01T08:17:00.000Z" },
    "2026-06-18T08:17:00.000Z",
  );

  assert.deepEqual(chainMeta.refreshTier, refreshTiers.manual);
  assert.deepEqual(chainMeta.nextEligibleRefreshAt, null);
  assert.deepEqual(
    refreshMetadataForRestaurant(
      { sourceUpdatedAt: "2026-06-01T08:17:00.000Z", type: "local" },
      "2026-06-18T08:17:00.000Z",
    ).refreshTier,
    refreshTiers.userDemandLocal,
  );
});

test("automatic restaurant refresh schedules are disabled by default", () => {
  const fullRefreshResource = readFileSync(
    new URL(
      "../amplify/functions/refresh-restaurant-data/resource.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const refreshJobResource = readFileSync(
    new URL(
      "../amplify/functions/process-restaurant-refresh-jobs/resource.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const searchResource = readFileSync(
    new URL(
      "../amplify/functions/search-restaurants/resource.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    fullRefreshResource,
    /DISABLE_RESTAURANT_FULL_REFRESH:\s*"true"/,
  );
  assert.match(
    refreshJobResource,
    /DISABLE_RESTAURANT_REFRESH_JOB_PROCESSING:\s*"true"/,
  );
  assert.match(searchResource, /DISABLE_RESTAURANT_REFRESH_JOBS:\s*"true"/);
});

test("restaurant visit refresh policy queues stale local restaurants only", () => {
  const staleLocal = evaluateRestaurantRefresh(
    {
      lastRefreshedAt: "2026-05-01T08:17:00.000Z",
      nextEligibleRefreshAt: "2026-05-31T08:17:00.000Z",
      sourceUrls: ["https://example.com/menu"],
      snapshotPath: "restaurant-data/restaurants/local/latest.json",
      type: "local",
    },
    "2026-06-18T08:17:00.000Z",
  );
  const freshLocal = evaluateRestaurantRefresh(
    {
      lastRefreshedAt: "2026-06-10T08:17:00.000Z",
      sourceUrls: ["https://example.com/menu"],
      type: "local",
    },
    "2026-06-18T08:17:00.000Z",
  );
  const chain = evaluateRestaurantRefresh(
    {
      lastRefreshedAt: "2026-05-01T08:17:00.000Z",
      sourceUrls: ["https://example.com/menu"],
      type: "chain",
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(staleLocal.shouldQueue, true);
  assert.equal(staleLocal.reason, "stale-local");
  assert.equal(freshLocal.shouldQueue, false);
  assert.equal(chain.shouldQueue, false);
});

test("restaurant visit refresh policy sends source-less stale locals to review", () => {
  const sourceLessLocal = evaluateRestaurantRefresh(
    {
      lastRefreshedAt: "2026-05-01T08:17:00.000Z",
      nextEligibleRefreshAt: "2026-05-31T08:17:00.000Z",
      snapshotPath: "restaurant-data/restaurants/local/latest.json",
      type: "local",
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(sourceLessLocal.shouldQueue, true);
  assert.equal(sourceLessLocal.reason, "needs-source");
  assert.equal(sourceLessLocal.stale, true);
});

test("restaurant visit refresh policy respects failed-refresh backoff", () => {
  const backoffLocal = evaluateRestaurantRefresh(
    {
      lastFailedAt: "2026-06-17T12:00:00.000Z",
      lastRefreshedAt: "2026-05-01T08:17:00.000Z",
      nextEligibleRefreshAt: "2026-06-17T08:17:00.000Z",
      sourceUrls: ["https://example.com/menu"],
      type: "local",
    },
    "2026-06-18T08:17:00.000Z",
  );
  const eligibleLocal = evaluateRestaurantRefresh(
    {
      lastFailedAt: "2026-06-17T08:00:00.000Z",
      lastRefreshedAt: "2026-05-01T08:17:00.000Z",
      nextEligibleRefreshAt: "2026-06-18T07:59:00.000Z",
      sourceUrls: ["https://example.com/menu"],
      type: "local",
    },
    "2026-06-18T08:17:00.000Z",
  );

  assert.equal(backoffLocal.shouldQueue, false);
  assert.equal(backoffLocal.reason, "backoff");
  assert.equal(backoffLocal.stale, true);
  assert.equal(eligibleLocal.shouldQueue, true);
  assert.equal(eligibleLocal.reason, "stale-local");
});

test("restaurant search index rows include refresh metadata", () => {
  const rows = buildRestaurantSearchIndexRows({
    generatedAt: "2026-06-18T08:17:00.000Z",
    restaurants: [
      {
        id: "local-freshness-test",
        items: [{ allergens: [], name: "Soup" }],
        name: "Freshness Test",
        sourceUpdatedAt: "2026-06-01T08:17:00.000Z",
        type: "local",
      },
    ],
  });
  const meta = rows.find(
    (row) => row.pk === "META#local-freshness-test#national",
  );

  assert.equal(meta.refreshTier, refreshTiers.userDemandLocal);
  assert.equal(meta.lastRefreshedAt, "2026-06-01T08:17:00.000Z");
  assert.equal(meta.refreshStatus, "succeeded");
});

test("restaurant search index preserves location-specific snapshot paths", () => {
  const rows = buildRestaurantSearchIndexRows({
    generatedAt: "2026-06-18T08:17:00.000Z",
    restaurants: [
      {
        id: "local-location-test",
        items: [{ allergens: [], name: "Soup" }],
        locationId: "charlotte-nc",
        name: "Location Test",
        snapshotPath:
          "restaurant-data/restaurants/local-location-test/locations/charlotte-nc/latest.json",
        type: "local",
      },
    ],
  });
  const meta = rows.find(
    (row) => row.pk === "META#local-location-test#charlotte-nc",
  );

  assert.equal(
    meta.snapshotPath,
    "restaurant-data/restaurants/local-location-test/locations/charlotte-nc/latest.json",
  );
});

test("restaurant search index normalizes blank location ids to national", () => {
  const rows = buildRestaurantSearchIndexRows({
    restaurants: [
      {
        id: "blank-location-test",
        items: [{ allergens: [], name: "Soup" }],
        locationId: "",
        name: "Blank Location Test",
      },
    ],
  });

  assert.equal(
    rows.some((row) => row.pk === "META#blank-location-test#national"),
    true,
  );
  assert.equal(
    rows.some(
      (row) => row.pk === "POPULAR#GLOBAL" && row.locationId === "national",
    ),
    true,
  );
});

test("refresh retry backoff moves from one day to weekly retries", () => {
  assert.equal(
    nextRetryAt(0, "2026-06-18T08:17:00.000Z"),
    "2026-06-19T08:17:00.000Z",
  );
  assert.equal(
    nextRetryAt(1, "2026-06-18T08:17:00.000Z"),
    "2026-06-21T08:17:00.000Z",
  );
  assert.equal(
    nextRetryAt(2, "2026-06-18T08:17:00.000Z"),
    "2026-06-25T08:17:00.000Z",
  );
  assert.equal(
    nextRetryAt(9, "2026-06-18T08:17:00.000Z"),
    "2026-06-25T08:17:00.000Z",
  );
});

test("ingredient intelligence infers pesto milk and tree nut signals", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const inference = inferMenuItemIngredientIntelligence(
    {
      category: "Pasta",
      description: "Basil pesto sauce.",
      name: "Basil Pesto",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(inference, ["milk", "tree-nut"]);
  assert.equal(inference.inferenceVersion, manifest.version);
});

test("ingredient intelligence infers chicken parmesan milk wheat and egg signals", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const inference = inferMenuItemIngredientIntelligence(
    {
      category: "Entrees",
      description: "Italian-American favorite with marinara.",
      name: "Chicken Parmesan",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(inference, ["egg", "milk", "wheat"]);
});

test("ingredient intelligence infers cheeseburger milk wheat and gluten signals", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const inference = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Burgers",
      description: "",
      name: "Cheeseburger",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(inference, ["gluten", "milk", "wheat"]);
  assert.deepEqual(inference.inferredIngredients, ["burger_bun", "cheese"]);
  assert.equal(
    inference.inferenceQuestions.includes(
      "Is this served on a wheat bun or bread?",
    ),
    true,
  );
});

test("ingredient intelligence only emits signals outside official profile coverage", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const inference = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "official-allergen-menu",
      allergens: [],
      category: "Burgers",
      description: "",
      name: "Cheeseburger",
      officialAllergenProfileId: "m1",
    },
    {
      manifest,
      officialAllergenProfiles: {
        m1: { coveredAllergenIds: ["milk"] },
      },
    },
  );

  assertAllergenSignalsInclude(inference, ["gluten", "wheat"]);
  assert.equal(
    inference.inferredAllergenSignals.some((signal) => signal.id === "milk"),
    false,
  );
});

test("restaurant-issued allergen terms are promoted out of Ingredient Intelligence", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const item = annotateMenuItemWithIngredientIntelligence(
    {
      allergenSourceType: "official-allergen-menu",
      allergens: [],
      category: "Sauces",
      description: "Restaurant honey mustard dipping sauce.",
      id: "honey-mustard",
      mayContain: [],
      name: "Honey Mustard",
      officialAllergenProfileId: "m1",
      sourceType: "pdf-matrix",
    },
    {
      manifest,
      officialAllergenProfiles: { m1: { coveredAllergenIds: ["milk"] } },
    },
  );

  assert.deepEqual(item.allergens, ["mustard"]);
  assert.equal(
    item.inferredAllergenSignals?.some((signal) => signal.id === "mustard") ??
      false,
    false,
  );
});

test("official API may-contain clauses become canonical cross-contact data", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const item = annotateMenuItemWithIngredientIntelligence(
    {
      allergenSourceType: "official-allergen-menu",
      allergens: ["milk"],
      category: "Desserts",
      id: "candy-dessert",
      ingredientsText: "Ingredients: Milk chocolate. May Contain: Peanuts.",
      mayContain: [],
      name: "Candy Dessert",
      officialAllergenProfileId: "m1",
      sourceType: "official-api",
    },
    {
      comprehensiveOfficialIngredients: true,
      manifest,
      officialAllergenProfiles: { m1: { coveredAllergenIds: ["milk"] } },
    },
  );

  assert.deepEqual(item.mayContain, ["peanut"]);
  assert.equal(
    item.inferredAllergenSignals?.some((signal) => signal.id === "peanut") ??
      false,
    false,
  );
});

test("culinary aliases and negated ingredients remain outside official promotion", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const profiles = { m1: { coveredAllergenIds: ["milk"] } };
  const bao = annotateMenuItemWithIngredientIntelligence(
    {
      allergenSourceType: "official-allergen-menu",
      allergens: [],
      category: "Dim Sum",
      id: "bao",
      mayContain: [],
      name: "Bao - BBQ Pork",
      officialAllergenProfileId: "m1",
      sourceType: "pdf-matrix",
    },
    { manifest, officialAllergenProfiles: profiles },
  );
  const withoutCheese = annotateMenuItemWithIngredientIntelligence(
    {
      allergenSourceType: "official-allergen-menu",
      allergens: [],
      category: "Salads",
      description: "House salad without cheese.",
      id: "salad",
      mayContain: [],
      name: "House Salad",
      officialAllergenProfileId: "m1",
      sourceType: "pdf-matrix",
    },
    { manifest, officialAllergenProfiles: profiles },
  );

  assert.deepEqual(bao.allergens, []);
  assert.equal(
    bao.inferredAllergenSignals?.some((signal) => signal.id === "wheat"),
    true,
  );
  assert.deepEqual(withoutCheese.allergens, []);
});

test("ingredient intelligence extracts menu-text mentions from descriptions", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const inference = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Entrees",
      description: "Linguine with shrimp, garlic butter, and white wine.",
      name: "Shrimp Scampi",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(inference, [
    "gluten",
    "milk",
    "shellfish",
    "sulfites",
    "wheat",
  ]);
  assert.deepEqual(
    inference.extractedIngredientMentions
      .filter((mention) =>
        ["butter", "pasta", "shrimp"].includes(mention.ingredientId),
      )
      .map((mention) => `${mention.ingredientId}:${mention.sourceField}`)
      .sort(),
    [
      "butter:description",
      "pasta:description",
      "shrimp:description",
      "shrimp:name",
    ],
  );
  assert.equal(
    inference.inferenceQuestions.includes(
      "Does this contain shrimp, crab, lobster, or shellfish stock?",
    ),
    true,
  );
});

test("ingredient intelligence avoids category-only, sauce, and allergen-free phrase matches", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const categoryOnlyInference = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Burgers",
      description: "",
      name: "French Fries",
    },
    { manifest },
  );
  const sauceInference = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sauces",
      description: "",
      name: "Burger Sauce",
    },
    { manifest },
  );
  const allergenFreeInference = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Burgers",
      description: "Served with dairy-free cheese on a gluten-free bun.",
      name: "Dairy-Free Cheese Burger",
    },
    { manifest },
  );

  assert.equal(categoryOnlyInference, null);
  assert.equal(sauceInference, null);
  assert.deepEqual(allergenFreeInference?.inferredAllergenSignals ?? [], []);
  assert.deepEqual(
    [...(allergenFreeInference?.inferenceSuppressions ?? [])]
      .map((suppression) => suppression.id)
      .sort(),
    ["milk"],
  );
});

test("ingredient intelligence infers caesar salad milk egg fish and wheat signals", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const inference = inferMenuItemIngredientIntelligence(
    {
      category: "Salads",
      description: "Romaine salad with dressing and croutons.",
      name: "Caesar Salad",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(inference, ["egg", "fish", "milk", "wheat"]);
});

test("ingredient intelligence v2 covers shellfish fish dessert and sandwich misses", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const calamari = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Appetizers",
      description: "Crispy fried calamari with marinara.",
      name: "Calamari",
    },
    { manifest },
  );
  const seafoodTower = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Raw Bar",
      description: "",
      name: "Seafood Tower",
    },
    { manifest },
  );
  const ahiTuna = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sushi",
      description: "Seared ahi tuna.",
      name: "Ahi-Tuna",
    },
    { manifest },
  );
  const cheesecake = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Classic cheesecake with graham cracker crust.",
      name: "Cheesecake",
    },
    { manifest },
  );
  const chickenSandwich = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sandwiches",
      description: "Grilled chicken sandwich with lettuce and tomato.",
      name: "Chicken Sandwich",
    },
    { manifest },
  );
  const glutenFreeChickenSandwich = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sandwiches",
      description: "Served on gluten-free bun.",
      name: "Gluten-free Chicken Sandwich",
    },
    { manifest },
  );
  const glutenFreeAvailableChickenSandwich =
    inferMenuItemIngredientIntelligence(
      {
        allergenSourceType: "unavailable",
        category: "Sandwiches",
        description: "Gluten-free bun available.",
        name: "Chicken Sandwich",
      },
      { manifest },
    );
  const singularSpringRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Appetizers",
      description:
        "Crispy fried veggie roll filled with cellophane noodle, cabbage, and carrot.",
      name: "Spring Roll",
    },
    { manifest },
  );
  const reuben = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sandwiches",
      description: "Pastrami, sauerkraut, swiss and dressing on rye.",
      name: "Reuben",
    },
    { manifest },
  );
  const bao = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Small Plates",
      description: "Steamed bun with pork belly.",
      name: "Bao Bun",
    },
    { manifest },
  );
  const rigatoni = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Pasta",
      description: "Rigatoni with lamb bolognese.",
      name: "Rigatoni Lamb Bolognese",
    },
    { manifest },
  );
  const rockfish = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Seafood",
      description: "Fresh local rockfish from the Chesapeake Bay.",
      name: "Catch of the Day Rockfish",
    },
    { manifest },
  );
  const haddock = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Seafood",
      description: "Fried or broiled.",
      name: "Filet of Haddock",
    },
    { manifest },
  );
  const mahi = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Seafood",
      description: "",
      name: "Blackened Mahi",
    },
    { manifest },
  );
  const cazon = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Seafood",
      description: "Fried marinated shark with mojo verde.",
      name: "Cazón",
    },
    { manifest },
  );
  const rawBar = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Seafood",
      description: "",
      name: "Raw Bar",
    },
    { manifest },
  );
  const grandPlateau = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Steakhouse / Seafood",
      description: "",
      name: "Grand Plateau",
    },
    { manifest },
  );
  const hamSwiss = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sandwiches",
      description: "Crispy ham and swiss.",
      name: "Crispy Ham & Swiss",
    },
    { manifest },
  );
  const labneChicken = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Chicken",
      description: "Crispy batata, pickles, green shatta labne.",
      name: "Smoked Amba Chicken",
    },
    { manifest },
  );
  const flan = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Coconut anglaise with crispy coconut flakes.",
      name: "Flan de Coco",
    },
    { manifest },
  );
  const custardDessert = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Shredded phyllo, vanilla custard, pistachio.",
      name: "Ekmek Kantaifi",
    },
    { manifest },
  );
  const panFriedNoodle = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Chinese",
      description: "",
      name: "Shredded Pork Pan Fried Noodle",
    },
    { manifest },
  );
  const riceNoodle = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Burmese",
      description: "Thin rice noodle stir-fry with chicken and vegetables.",
      name: "Stir-Fried Thin Rice Noodle",
    },
    { manifest },
  );
  const genericNoodleSoup = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Noodles",
      description: "Savory beef broth with tender sliced beef.",
      name: "Beef Noodle Soup",
    },
    { manifest },
  );
  const wontonDumpling = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Appetizers",
      description: "Pan-seared pork dumplings with scallion.",
      name: "Pork Dumplings",
    },
    { manifest },
  );
  const ricePaperRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Appetizers",
      description: "Rice paper rolls with herbs and vegetables.",
      name: "Garden Rolls",
    },
    { manifest },
  );
  const avocadoRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Japanese / Sushi",
      description: "Vegetarian avocado maki.",
      name: "Avocado Roll",
    },
    { manifest },
  );
  const toroRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Japanese / Sushi",
      description: "Negi-toro maki.",
      name: "Toro & Scallion Roll",
    },
    { manifest },
  );
  const eelAvocadoRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Maki Roll",
      description: "Unagi and avocado.",
      name: "Eel Avocado Roll",
    },
    { manifest },
  );
  const californiaRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Roll",
      description: "",
      name: "California Roll",
    },
    { manifest },
  );
  const sushiLunch = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Lunch Special",
      description: "5 pcs sushi and California roll.",
      name: "Sushi Lunch",
    },
    { manifest },
  );
  const bocata = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Huevos",
      description:
        "A traditional sandwich with fresh tomato and Spanish omelette.",
      name: "Bocata de Tortilla de Patatas",
    },
    { manifest },
  );
  const panuozzo = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sandwiches",
      description:
        "Neapolitan-style meatball sandwich served with house greens.",
      name: "Meatball Panuozzo",
    },
    { manifest },
  );
  const boxedSub = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Individual Lunch Boxes",
      description: "Sub of choice. Mini bag of chips. Choice of beverage.",
      name: "Full Lunch",
    },
    { manifest },
  );
  const baguette = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Breads",
      description: "Traditional French baguette.",
      name: "Baguette",
    },
    { manifest },
  );
  const creamer = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Condiments",
      description: "",
      name: "Creamer - French Vanilla",
    },
    { manifest },
  );
  const creamedSpinach = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sides",
      description: "",
      name: "Creamed Spinach",
    },
    { manifest },
  );
  const butteredCorn = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sides",
      description: "",
      name: "Buttered Corn",
    },
    { manifest },
  );
  const concatenatedCalamari = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Seafood",
      description: "Sweet chili sauce.",
      name: "POINTJUDITHCALAMARI",
    },
    { manifest },
  );
  const calamaresFritos = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Items",
      description: "Rabas (Fried Calamares)",
      name: "Rabas (Calamares Fritos)",
    },
    { manifest },
  );
  const flourlessCake = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Tart cherry compote, cognac gelato.",
      name: "Chocolate Flourless Cake",
    },
    { manifest },
  );
  const flourlessWaffle = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Vanilla ice cream.",
      name: "Warm Flourless Chocolate Waffle",
    },
    { manifest },
  );
  const flourlessTorta = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dolci",
      description:
        "Flourless chocolate torta, whipped creme fraiche, candied hazelnuts.",
      name: "Chocolate Nemesis",
    },
    { manifest },
  );
  const bearnaise = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Steak Frites",
      description: "Classic béarnaise sauce.",
      name: "Béarnaise",
    },
    { manifest },
  );
  const gelato = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Madagascar vanilla gelato.",
      name: "Gelato",
    },
    { manifest },
  );
  const namedCheese = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Boards",
      description: "Sheep, butterscotch, nutty.",
      name: "Sweet Grass Gouda",
    },
    { manifest },
  );
  const gorgonzolaCrust = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Enhancements",
      description: "",
      name: "Gorgonzola Crust",
    },
    { manifest },
  );
  const roquefortSalad = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Salads",
      description: "",
      name: "Endive & Roquefort Salad",
    },
    { manifest },
  );
  const tahina = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Mazzeh",
      description: "Local cauliflower, butternut squash, tahina, garlic crisp.",
      name: "Cauliflower and Vegetable",
    },
    { manifest },
  );
  const frybread = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Caribbean",
      description: "Spicy chickpeas, fluffy frybread, cucumber, pepper sauce.",
      name: "Doubles",
    },
    { manifest },
  );
  const shortbread = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Bakery",
      description: "Orange bar with a shortbread crust and white chocolate.",
      name: "Orange Dreamin'",
    },
    { manifest },
  );
  const challahRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Deli",
      description: "BBQ beef on a challah twist roll with cole slaw.",
      name: "BBQ Beef Platter",
    },
    { manifest },
  );
  const kathiRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Indian / Mexican",
      description: "Grilled vegetables rolled in a toasted tortilla.",
      name: "Vegan Kathi Roll",
    },
    { manifest },
  );
  const toastedRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Chesapeake / American",
      description: "Toasted roll, root vegetable slaw, lettuce.",
      name: "Pulled BBQ Mushrooms",
    },
    { manifest },
  );
  const chickenTendies = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Raw Bar / American",
      description: "",
      name: "Chicken Tendies",
    },
    { manifest },
  );
  const oysterVariety = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Oyster on the Half-shell",
      description: "medium, plump, briny, crisp finish",
      name: "Standish Shore",
    },
    { manifest },
  );
  const oysterButterTopping = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Coal Roasted Oysters",
      description: "",
      name: "Cajun Butter",
    },
    { manifest },
  );
  const pakode = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Indian",
      description:
        "Trio vegetables coated in spiced chick pea batter and golden fried.",
      name: "Sabzi Ke Pakode",
    },
    { manifest },
  );
  const huancaina = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Peruvian",
      description: "Golden fried yuca with huancaína sauce.",
      name: "Yuca a la Huancaína",
    },
    { manifest },
  );
  const shimaAji = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Japanese / Sushi",
      description: "Striped jack 1pc.",
      name: "Shima-Aji",
    },
    { manifest },
  );
  const gnudi = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Italian",
      description: "",
      name: "Spinach Gnudi",
    },
    { manifest },
  );
  const soyBean = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Japanese / Sushi",
      description: "Steamed soy bean with sea salt.",
      name: "Cha-mame",
    },
    { manifest },
  );
  const veggieChicken = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Vegetarian",
      description:
        "Made with marinated veggie-chicken, mushrooms, sea salt, and black pepper.",
      name: "Fried Chick'n",
    },
    { manifest },
  );
  const meatloaf = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Diner",
      description: "Half-pound beef with house gravy.",
      name: "Creekstone Farms Black Angus Meatloaf",
    },
    { manifest },
  );
  const crumbFried = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "American",
      description: "",
      name: "Crumb fried & tossed with thin beans & spicy pepper jelly",
    },
    { manifest },
  );
  const typoBreaded = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Bolivian",
      description: "Mashed potato stuffed with beef, creaded and fried.",
      name: "Relleno de Carne",
    },
    { manifest },
  );
  const flautas = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Appetizers",
      description:
        "Order of 6. Shredded beef, deep-fried. Served with green chile sauce.",
      name: "Beef Flautas",
    },
    { manifest },
  );
  const friedChickenChoice = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Platters",
      description:
        "Two boneless skinless double chicken breasts served fried, grilled, or blackened with two signature sides.",
      name: "Chicken Breast",
    },
    { manifest },
  );
  const alooChop = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Appetizer",
      description:
        "Seasoned mashed potato with spices, deep fried srved with homemade chutney",
      name: "Aloo Chop",
    },
    { manifest },
  );
  const kungPaoChicken = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Piqueos",
      description:
        "Stir-fry chicken, Kung Pao sauce, lettuce cups, crispy sweet potato.",
      name: "Ji Song Chifero",
    },
    { manifest },
  );
  const tartareWorcestershire = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Brunch",
      description: "Hand cut NY strip, fried capers, worcestershire emulsion.",
      name: "Steak Tartare",
    },
    { manifest },
  );
  const amatriciana = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Pasta",
      description: "Crispy pancetta, chili flakes, shaved pecorino romano.",
      name: "Radiatorre Amatriciana",
    },
    { manifest },
  );
  const painAuChocolat = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Pastries",
      description: "Flakey pastry filled with morsels of dark chocolate.",
      name: "Pain Au Chocolat",
    },
    { manifest },
  );
  const savoryPastry = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dim Sum",
      description: "Turnip pastry with bacon bits.",
      name: "Turnip & Bacon Pastry",
    },
    { manifest },
  );
  const pastryCream = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Vanilla pastry cream and berries.",
      name: "Pastry Cream",
    },
    { manifest },
  );
  const baklava = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Layered flaky pastry with nuts and syrup.",
      name: "Baklava",
    },
    { manifest },
  );
  const sopapillas = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Dessert",
      description: "Puffed pastry deep fried and served with honey.",
      name: "Sopapillas",
    },
    { manifest },
  );
  const shepherdsPie = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Pub Favorites",
      description: "Beef, lamb, vegetables, and champ potatoes.",
      name: "Shepherd's Pie",
    },
    { manifest },
  );
  const wagyuMelt = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Diner",
      description: "",
      name: "Snake River Farms Wagyu Melt",
    },
    { manifest },
  );
  const kidsBistroBurger = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Burgers & Sandwiches",
      description:
        "Our signature ground beef burger is marinated with fresh herbs and spices.",
      name: "Kids Beef Bistro Burger",
    },
    { manifest },
  );
  const meatPie = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Appetizers",
      description: "Lebanese style lamb meat pie with garlic toum.",
      name: "Sfeeha",
    },
    { manifest },
  );
  const jalapenoPoppers = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Bites",
      description:
        "Bold jalapeno meets creamy filling for the ultimate crispy snack.",
      name: "Pop Start Poppers",
    },
    { manifest },
  );
  const chickenChunks = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Home Style Meals",
      description:
        "Three tender chunks of chicken breast, fried to golden perfection.",
      name: "Spicy Chicken Chunks",
    },
    { manifest },
  );
  const plainRotisserieWhiteMeat = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Chicken",
      description:
        "Whole chicken, made up of white meat only (breasts and wings). Includes sides and sauces.",
      name: "Whole Chicken (WHITE MEAT ONLY)",
    },
    { manifest },
  );
  const buffaloWings = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Wings",
      description: "Buffalo wings served with ranch.",
      name: "Buffalo Wings",
    },
    { manifest },
  );
  const butcherBurgerBlend = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Meat & Poultry",
      description:
        "A daily butcher's blend including hanger, short rib, and brisket. Ground beef sold online.",
      name: "Deluxe / Custom Burger Blend",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(calamari, ["shellfish"]);
  assertAllergenSignalsInclude(seafoodTower, ["fish", "shellfish"]);
  assertAllergenSignalsInclude(ahiTuna, ["fish"]);
  assertAllergenSignalsInclude(cheesecake, ["egg", "gluten", "milk", "wheat"]);
  assertAllergenSignalsInclude(chickenSandwich, ["gluten", "wheat"]);
  assert.deepEqual(
    glutenFreeChickenSandwich?.inferenceSuppressions?.map((entry) => entry.id).sort(),
    ["gluten", "wheat"],
  );
  assertAllergenSignalsInclude(glutenFreeAvailableChickenSandwich, [
    "gluten",
    "wheat",
  ]);
  assertAllergenSignalsInclude(singularSpringRoll, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(reuben, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(bao, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(rigatoni, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(rockfish, ["fish"]);
  assertAllergenSignalsInclude(haddock, ["fish"]);
  assertAllergenSignalsInclude(mahi, ["fish"]);
  assertAllergenSignalsInclude(cazon, ["fish"]);
  assertAllergenSignalsInclude(rawBar, ["fish", "shellfish"]);
  assertAllergenSignalsInclude(grandPlateau, ["fish", "shellfish"]);
  assertAllergenSignalsInclude(hamSwiss, ["milk"]);
  assertAllergenSignalsInclude(labneChicken, ["milk"]);
  assertAllergenSignalsInclude(flan, ["egg", "milk"]);
  assertAllergenSignalsInclude(custardDessert, [
    "egg",
    "gluten",
    "milk",
    "tree-nut",
    "wheat",
  ]);
  assertAllergenSignalsInclude(panFriedNoodle, ["gluten", "wheat"]);
  assert.equal(riceNoodle, null);
  assertAllergenSignalsInclude(genericNoodleSoup, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(wontonDumpling, ["gluten", "wheat"]);
  assert.equal(ricePaperRoll, null);
  assert.equal(avocadoRoll, null);
  assertAllergenSignalsInclude(toroRoll, ["fish"]);
  assertAllergenSignalsInclude(eelAvocadoRoll, ["fish"]);
  assertAllergenSignalsInclude(californiaRoll, ["fish", "shellfish"]);
  assertAllergenSignalsInclude(sushiLunch, ["fish", "shellfish"]);
  assertAllergenSignalsInclude(bocata, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(panuozzo, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(boxedSub, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(baguette, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(creamer, ["milk"]);
  assertAllergenSignalsInclude(creamedSpinach, ["milk"]);
  assertAllergenSignalsInclude(butteredCorn, ["milk"]);
  assertAllergenSignalsInclude(concatenatedCalamari, ["shellfish"]);
  assertAllergenSignalsInclude(calamaresFritos, [
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assertAllergenSignalsInclude(flourlessCake, ["egg", "milk"]);
  assert.equal(
    flourlessCake?.inferredAllergenSignals?.some((signal) =>
      ["gluten", "wheat"].includes(signal.id),
    ),
    false,
  );
  assertAllergenSignalsInclude(flourlessWaffle, ["egg", "milk"]);
  assert.equal(
    flourlessWaffle?.inferredAllergenSignals?.some((signal) =>
      ["gluten", "wheat"].includes(signal.id),
    ),
    false,
  );
  assertAllergenSignalsInclude(flourlessTorta, ["milk", "tree-nut"]);
  assert.equal(
    flourlessTorta?.inferredAllergenSignals?.some((signal) =>
      ["gluten", "wheat"].includes(signal.id),
    ),
    false,
  );
  assertAllergenSignalsInclude(bearnaise, ["egg", "milk"]);
  assertAllergenSignalsInclude(gelato, ["milk"]);
  assertAllergenSignalsInclude(namedCheese, ["milk"]);
  assertAllergenSignalsInclude(gorgonzolaCrust, ["milk"]);
  assertAllergenSignalsInclude(roquefortSalad, ["milk"]);
  assertAllergenSignalsInclude(tahina, ["sesame"]);
  assertAllergenSignalsInclude(frybread, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(shortbread, ["egg", "gluten", "milk", "wheat"]);
  assertAllergenSignalsInclude(challahRoll, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(kathiRoll, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(toastedRoll, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(chickenTendies, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(oysterVariety, ["shellfish"]);
  assert.equal(
    oysterVariety?.inferredAllergenSignals?.some(
      (signal) => signal.id === "fish",
    ),
    false,
  );
  assertAllergenSignalsInclude(oysterButterTopping, ["milk"]);
  assert.equal(
    oysterButterTopping?.inferredAllergenSignals?.some(
      (signal) => signal.id === "shellfish",
    ),
    false,
  );
  assertAllergenSignalsInclude(pakode, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(huancaina, ["milk"]);
  assertAllergenSignalsInclude(shimaAji, ["fish"]);
  assertAllergenSignalsInclude(gnudi, ["egg", "gluten", "milk", "wheat"]);
  assertAllergenSignalsInclude(soyBean, ["soy"]);
  assert.equal(
    soyBean?.inferredAllergenSignals?.some((signal) =>
      ["gluten", "wheat"].includes(signal.id),
    ),
    false,
  );
  assertAllergenSignalsInclude(veggieChicken, ["gluten", "soy", "wheat"]);
  assertAllergenSignalsInclude(meatloaf, ["egg", "gluten", "milk", "wheat"]);
  assertAllergenSignalsInclude(crumbFried, ["egg", "gluten", "wheat"]);
  assertAllergenSignalsInclude(typoBreaded, ["egg", "gluten", "wheat"]);
  assertAllergenSignalsInclude(flautas, ["egg", "gluten", "wheat"]);
  assertAllergenSignalsInclude(friedChickenChoice, ["egg", "gluten", "wheat"]);
  assertAllergenSignalsInclude(alooChop, ["egg", "gluten", "milk", "wheat"]);
  assertAllergenSignalsInclude(kungPaoChicken, ["peanut", "soy"]);
  assertAllergenSignalsInclude(tartareWorcestershire, ["fish"]);
  assertAllergenSignalsInclude(amatriciana, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(painAuChocolat, [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assertAllergenSignalsInclude(savoryPastry, ["gluten", "wheat"]);
  assert.equal(
    savoryPastry?.inferredAllergenSignals?.some((signal) =>
      ["egg", "milk"].includes(signal.id),
    ),
    false,
  );
  assertAllergenSignalsInclude(pastryCream, ["egg", "milk"]);
  assert.equal(
    pastryCream?.inferredAllergenSignals?.some((signal) =>
      ["gluten", "wheat"].includes(signal.id),
    ),
    false,
  );
  assertAllergenSignalsInclude(baklava, ["gluten", "tree-nut", "wheat"]);
  assertAllergenSignalsInclude(sopapillas, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(shepherdsPie, ["milk"]);
  assert.equal(
    shepherdsPie?.inferredAllergenSignals?.some((signal) =>
      ["gluten", "wheat"].includes(signal.id),
    ),
    false,
  );
  assertAllergenSignalsInclude(wagyuMelt, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(kidsBistroBurger, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(meatPie, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(jalapenoPoppers, [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assertAllergenSignalsInclude(chickenChunks, ["egg", "gluten", "wheat"]);
  assert.equal(plainRotisserieWhiteMeat, null);
  assertAllergenSignalsInclude(buffaloWings, ["egg", "milk"]);
  assert.equal(butcherBurgerBlend, null);
});

test("ingredient intelligence v2 keeps shape rules lower confidence and provenanced", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const directTuna = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sushi",
      description: "",
      name: "Ahi Tuna",
    },
    { manifest },
  );
  const sandwich = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sandwiches",
      description: "",
      name: "Chicken Sandwich",
    },
    { manifest },
  );

  assert.equal(manifest.version, "ingredient-intelligence-v2");
  assert.equal(
    (manifest.dishShapeRules ?? []).every(
      (rule) => Array.isArray(rule.provenance) && rule.provenance.length > 0,
    ),
    true,
  );
  assert.equal(
    directTuna.inferredAllergenSignals.find((signal) => signal.id === "fish")
      ?.c,
    "high",
  );
  assert.equal(
    sandwich.inferredAllergenSignals.find((signal) => signal.id === "wheat")?.c,
    "medium",
  );
});

test("ingredient intelligence context rules suppress vegan, gluten-free, and sushi false positives", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const avocadoRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sushi",
      description: "Avocado roll with sesame seeds.",
      name: "Avocado Roll",
    },
    { manifest },
  );
  const shrimpTempuraRoll = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sushi",
      description: "Shrimp tempura roll with crunchy flakes.",
      name: "Shrimp Tempura Roll",
    },
    { manifest },
  );
  const veganCheeseburger = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Burgers",
      description: "Vegan cheese, lettuce, tomato, and a potato roll.",
      name: "Vegan Cheeseburger",
    },
    { manifest },
  );
  const glutenFreeCookie = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Gluten Free Bakery",
      description:
        "Dedicated gluten-free bakery cookie with oat milk chocolate.",
      name: "Chocolate Chip Cookie",
    },
    { manifest },
  );
  const normalCookie = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Bakery",
      description: "Classic chocolate chip cookie.",
      name: "Chocolate Chip Cookie",
    },
    { manifest },
  );
  const normalCupcake = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Bakery",
      description:
        "Lemon cakecup with fresh blueberries and lemon buttercream frosting.",
      name: "Smurfette Cupcake",
    },
    { manifest },
  );
  const glutenFreeCupcake = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Gluten Free Bakery",
      description: "Dedicated gluten-free cupcake with vanilla frosting.",
      name: "Cupcake",
    },
    { manifest },
  );
  const itemLevelGlutenFreeBread = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Bakery",
      description:
        "Our gluten free banana bread is ultra-moist and rich in flavor.",
      name: "Banana Bread",
    },
    { manifest },
  );
  const itemLevelGlutenFreeCookie = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Cookies",
      description: "Individually wrapped gluten-free chocolate chip cookies.",
      name: "Chocolate Chip Cookie",
    },
    { manifest },
  );
  const noGlutenCookie = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Cookies",
      description: "",
      name: "No Gluten Chocolate-Dipped Pistachio Cookie",
    },
    { manifest },
  );
  const bunlessBurger = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Burgers",
      description:
        "Sautéed spinach, red wine onions, bacon, and mixed green salad.",
      name: "Bunless Burger",
    },
    { manifest },
  );
  const lettuceWrapCheeseburger = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Burgers",
      description:
        "Grass-fed beef, American cheese, lettuce, onion, and pickle.",
      name: "Cheese Burger Lettuce Wrap",
    },
    { manifest },
  );
  const pitaWrapWithLettuce = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sandwiches & Wraps",
      description:
        "Tomato and lettuce wrapped in Mediterranean tortilla bread.",
      name: "Adana Wrap",
    },
    { manifest },
  );
  const withoutDairyTea = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Drinks",
      description: "Thai iced tea without dairy, yuzu, and lemon.",
      name: "Thai Iced Tea",
    },
    { manifest },
  );
  const nonDairyYogurt = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Entrees",
      description:
        "Served with qabulirice and contains non-dairy garlic yogurt.",
      name: "Afghania Combination",
    },
    { manifest },
  );
  const coconutSoup = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Thai",
      description:
        "Chicken, young coconut meat, coconut milk, mushrooms, tomatoes, lemongrass, and lime leaves.",
      name: "Coconut Soup with Chicken",
    },
    { manifest },
  );
  const glutenFreeOptionWithContainsWheat = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Cakes",
      description:
        "Vanilla cake with almond frosting. Gluten-Free option available. Allergens: Contains wheat, almonds and soy.",
      name: "Almond Creme",
    },
    { manifest },
  );
  const soyFreeCookie = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Cookies",
      description: "Soy-free chocolate chip cookie topped with cake crumbs.",
      name: "Soy-Free Chocolate Chip Cookie",
    },
    { manifest },
  );
  const wrapperMarkerCupcake = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Bakery",
      description:
        "Chocolate cake, chocolate frosting, topped with chocolate chips. Our gluten-free cupcakes are always in green wrappers. Our soy-free cupcakes are always in blue wrappers.",
      name: "Chocolate Love Cupcakes",
    },
    { manifest },
  );
  const containsSoyCake = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Cakes",
      description:
        "Gluten-free option available. Allergens: Contains wheat, almonds and soy.",
      name: "Almond Creme",
    },
    { manifest },
  );
  const mockCrab = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Vegan",
      description: "Hearts of palm crab with spicy mayo and herbs.",
      name: "Hearts of Palm Crab Cake",
    },
    { manifest },
  );
  const fishWithVeganOption = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sea Food",
      description:
        "Fresh red Tilapia fried whole seasoned with Ethiopian spices served on a bed of mixed greens or your choice of vegan item.",
      name: "Fried Whole Tilapia",
    },
    { manifest },
  );
  const cherriesAndCream = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Sweet",
      description: "Spiced sorbet, pastry cream.",
      name: "Cherries & Cream",
    },
    { manifest },
  );
  const ethiopianRedChiliSauce = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Beef & Lamb",
      description:
        "Slow cooked in a homemade shallot red chili sauce and Ethiopian spices.",
      name: "Ye Beg Wet",
    },
    { manifest },
  );
  const lightBatterDuck = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Thai",
      description:
        "Boneless duck deep fried in a light batter, topped with basil in spicy chili garlic sauce.",
      name: "Crispy Duck Ka Prow",
    },
    { manifest },
  );
  const saffronOrzo = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Eastern Mediterranean",
      description: "Sauces",
      name: "Saffron Orzo",
    },
    { manifest },
  );
  const leadingGfItem = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Indian",
      description: "",
      name: "(GF) Lamb Seekh Kabob",
    },
    { manifest },
  );
  const leadingGlutenFreeItem = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Entrees",
      description: "",
      name: "Gluten-Free Garden Plate",
    },
    { manifest },
  );
  const contradictoryGfItem = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "restaurant_issued_positive",
      allergens: ["wheat"],
      category: "Bakery",
      description: "Official disclosure contains wheat.",
      mayContain: [],
      name: "(GF) Seasonal Bread",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(avocadoRoll, ["sesame"]);
  assertNoAllergenSignalsInclude(avocadoRoll, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(shrimpTempuraRoll, [
    "gluten",
    "shellfish",
    "wheat",
  ]);
  assertAllergenSignalsInclude(veganCheeseburger, ["gluten", "wheat"]);
  assertNoAllergenSignalsInclude(veganCheeseburger, ["milk"]);
  assertNoAllergenSignalsInclude(glutenFreeCookie, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(normalCookie, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(normalCupcake, [
    "egg",
    "gluten",
    "milk",
    "wheat",
  ]);
  assertNoAllergenSignalsInclude(glutenFreeCupcake, ["gluten", "wheat"]);
  assertNoAllergenSignalsInclude(itemLevelGlutenFreeBread, ["gluten", "wheat"]);
  assertNoAllergenSignalsInclude(itemLevelGlutenFreeCookie, [
    "gluten",
    "wheat",
  ]);
  assertNoAllergenSignalsInclude(noGlutenCookie, ["gluten", "wheat"]);
  assertNoAllergenSignalsInclude(bunlessBurger, ["gluten", "sesame", "wheat"]);
  assertAllergenSignalsInclude(lettuceWrapCheeseburger, ["milk"]);
  assertNoAllergenSignalsInclude(lettuceWrapCheeseburger, [
    "gluten",
    "sesame",
    "wheat",
  ]);
  assertAllergenSignalsInclude(pitaWrapWithLettuce, ["gluten", "wheat"]);
  assertNoAllergenSignalsInclude(withoutDairyTea, ["milk"]);
  assertNoAllergenSignalsInclude(nonDairyYogurt, ["milk"]);
  assertNoAllergenSignalsInclude(coconutSoup, ["milk"]);
  assertAllergenSignalsInclude(glutenFreeOptionWithContainsWheat, [
    "gluten",
    "wheat",
  ]);
  assertNoAllergenSignalsInclude(soyFreeCookie, ["soy"]);
  assertAllergenSignalsInclude(wrapperMarkerCupcake, ["gluten", "wheat"]);
  assertNoAllergenSignalsInclude(wrapperMarkerCupcake, ["soy"]);
  assertAllergenSignalsInclude(containsSoyCake, ["soy"]);
  assertNoAllergenSignalsInclude(mockCrab, ["egg", "shellfish"]);
  assert.equal(
    mockCrab?.inferenceSuppressions?.some((entry) => entry.id === "shellfish"),
    true,
  );
  assert.equal(mockCrab?.inferenceSummary.includes("crab"), false);
  assertAllergenSignalsInclude(fishWithVeganOption, ["fish"]);
  assertAllergenSignalsInclude(cherriesAndCream, ["egg", "milk"]);
  assertNoAllergenSignalsInclude(cherriesAndCream, ["gluten", "wheat"]);
  assert.equal(ethiopianRedChiliSauce, null);
  assertAllergenSignalsInclude(lightBatterDuck, ["egg", "gluten", "wheat"]);
  assertAllergenSignalsInclude(saffronOrzo, ["gluten", "wheat"]);
  assert.deepEqual(
    leadingGfItem?.inferenceSuppressions?.map((entry) => entry.id).sort(),
    ["gluten", "wheat"],
  );
  assert.deepEqual(
    leadingGlutenFreeItem?.inferenceSuppressions?.map((entry) => entry.id).sort(),
    ["gluten", "wheat"],
  );
  assert.equal(contradictoryGfItem, null);
});

test("ingredient intelligence multilingual menu terms map to expected allergens", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const inference = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Especiales",
      description: "Camarones con queso fresco, huevo, leche y harina.",
      name: "Tacos de Camarón",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(inference, [
    "egg",
    "gluten",
    "milk",
    "shellfish",
    "wheat",
  ]);

  const crostini = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Steakhouse",
      description:
        "(4) crostini topped with fresh steak tartare and bearnaise sauce.",
      name: "Steak Tartare",
    },
    { manifest },
  );
  const mozzRamyun = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Korean",
      description: "Fried Mozzarrella with Ramyun Noodle Chips.",
      name: "MOZZ",
    },
    { manifest },
  );
  const bisteccaEUova = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Italian",
      description: "NY strip, salsa verde, fried russet potato.",
      name: "Bistecca e Uova",
    },
    { manifest },
  );
  const bandeng = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Indonesian",
      description: "Fried boneless smoked milkfish.",
      name: "Bandeng Asap Goreng",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(crostini, ["gluten", "wheat"]);
  assertAllergenSignalsInclude(mozzRamyun, ["gluten", "milk", "wheat"]);
  assertAllergenSignalsInclude(bisteccaEUova, ["egg"]);
  assertAllergenSignalsInclude(bandeng, ["fish"]);
});

test("ingredient intelligence v2 review batch covers sauces wrappers seafood and Asian dishes", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const cases = [
    {
      item: {
        category: "Seafood",
        description: "Seafood from current menu.",
        name: "SEAFOOD",
      },
      signals: ["fish", "shellfish"],
    },
    {
      item: {
        category: "Brunch",
        description: "Flash fried, sweet chili sauce.",
        name: "SHOTGUNSHRIMP",
      },
      signals: ["shellfish"],
    },
    {
      item: {
        category: "Indian",
        description: "Fried crispy puri filled with potato masala.",
        name: "Pani Puri",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Indian",
        description: "Crispy paneer with bell peppers.",
        name: "Chilli Paneer",
      },
      signals: ["milk"],
    },
    {
      item: {
        category: "Chinese",
        description: "*Contains Shellfish*",
        name: "Szechuan String Beans",
      },
      signals: ["shellfish"],
    },
    {
      item: {
        category: "Chinese",
        description: "Crispy fried beef tossed in house sauce.",
        name: "Crispy Beef",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Antipasti",
        description: "Poached asparagus with tonnato sauce.",
        name: "ASPARAGI",
      },
      signals: ["egg", "fish"],
    },
    {
      item: {
        category: "Snacks",
        description: "Parmesan, Mornay.",
        name: "Gougeres Warm Cheese Puffs",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Seafood",
        description: "Fried black bass.",
        name: "Fried Black Bass",
      },
      signals: ["fish", "gluten", "wheat"],
    },
    {
      item: {
        category: "French",
        description: "Chicken schnitzel with lemon.",
        name: "Chicken Schnitzel",
      },
      signals: ["egg", "gluten", "wheat"],
    },
    {
      item: {
        category: "Party Bundles",
        description:
          "Double fried with your choice of sauce. Complimentary side of pickled radish or coleslaw.",
        name: "Strips",
      },
      signals: ["gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Gyozas",
        description: "Fried, sambal sauce.",
        name: "Lemongrass Chicken",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Bakery",
        description: "Apple phyllo pastry.",
        name: "Apple Strudel",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Breakfast",
        description: "Buttermilk pancakes.",
        name: "Pancake Stack",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Indian",
        description: "Whole wheat flatbread.",
        name: "Paratha",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Grain Bowls",
        description: "Roasted vegetables, farro, herbs.",
        name: "Farro Bowl",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Soups",
        description: "Mushrooms and pearled barley.",
        name: "Mushroom Barley Soup",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Thai",
        description:
          "Sautéed flat rice noodles with egg and Chinese broccoli in a sweet black soy sauce.",
        name: "Pad See Ew",
      },
      signals: ["egg", "gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Thai",
        description:
          "Create your own wrap with grilled chicken, cucumber, noodles, peanut sauce, sesame sauce, and spicy peanut dip.",
        name: "Thai Chicken Wrap",
      },
      signals: ["gluten", "peanut", "sesame", "wheat"],
    },
    {
      item: {
        category: "Japanese",
        description:
          "Tender tofu fried and served with soy dashi, daikon, bonito.",
        name: "Agedashi Tofu",
      },
      signals: ["fish", "gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Indian",
        description:
          "A spicy deep fried appetizer, garnished with onions and cilantro.",
        name: "Babycorn 65",
      },
      signals: ["egg", "gluten", "wheat"],
    },
    {
      item: {
        category: "Indian",
        description:
          "Mashed potato patties dipped in chickpea batter and deep fried.",
        name: "Aloo Tikki",
      },
      signals: ["egg", "gluten", "wheat"],
    },
    {
      item: {
        category: "Thai",
        description:
          "Thin rice noodles with minced chicken, fish balls, crushed peanuts, and crispy wonton skin.",
        name: "Sukhothai",
      },
      signals: ["fish", "gluten", "peanut", "wheat"],
    },
    {
      item: {
        category: "Snacks",
        description: "Crispy cracker with optional masala topping.",
        name: "Masala Cracker",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Snacks",
        description: "",
        name: "Bitterballen - Dutch Deep Fried Beef Cocktail Balls",
      },
      signals: ["gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Salads",
        description:
          "Sweet Grass Asher Blue, Sunflower Seed Vinaigrette, Pickled Vidalia Onion, Crispy Grains",
        name: "Baby Kale Salad",
      },
      signals: ["milk"],
    },
    {
      item: {
        category: "Italian",
        description: "Fried artichoke, bagna cauda sauce",
        name: "Carciofi",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Indian",
        description:
          "Deep fried with spiced batter topped with chef's special sauce.",
        name: "Chicken Lolipop",
      },
      signals: ["egg", "gluten", "wheat"],
    },
    {
      item: {
        category: "Sushi / Ramen",
        description: "Marinated hand-carved chicken thighs, dusted and fried.",
        name: "Chicken Kara Age",
      },
      signals: ["gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Sides",
        description: "Wok Fried, Chili Crisp",
        name: "Bok Choy",
      },
      signals: ["sesame"],
    },
    {
      item: {
        category: "KOREAN FRIED CHICKEN",
        description: "Double fried with your choice of sauce.",
        name: "Boneless",
      },
      signals: ["gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Salads",
        description: "",
        name: "Campero Salad with Fried Filet (No Dressing)",
      },
      signals: ["egg", "gluten", "wheat"],
    },
    {
      item: {
        category: "Dessert",
        description: "",
        name: "Classic Cookie'wich",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Seafood",
        description: "Cherry peppers, Italian parsley, tartar sauce.",
        name: "CRISPY CAL AMARI",
      },
      signals: ["shellfish"],
    },
    {
      item: {
        category: "Indian",
        description:
          "Crispy baby corn pieces toasted in tangy Manchurian sauce with bell pepper and onion.",
        name: "Crispy Baby Corn Manchurian",
      },
      signals: ["gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Chinese",
        description: "",
        name: "Crispy fried roll filled with vegetables and served with a sweet chili sauce",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Ethiopian",
        description:
          "Lightly fried chunked whitening fillet cooked in special tomato and berbere sauce.",
        name: "Asa Goulshe",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "American",
        description: "",
        name: "Fried Calmira",
      },
      signals: ["shellfish"],
    },
    {
      item: {
        category: "Tapas",
        description: "Crispy, golden chicken croquettes.",
        name: "Croquetas de Pollo",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Dessert",
        description: "Crispy golden kunafa filled with rich melted chocolate.",
        name: "Dubai Chocolate Kunafa Nest",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Starters",
        description: "With meat sauce.",
        name: "Fried Risotto Balls",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Indian",
        description: "",
        name: "Gulab Jamoon",
      },
      signals: ["gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Dessert",
        description: "Golden, crispy spirals of deep-fried batter.",
        name: "Jelabi",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Chinese",
        description: "Flash fried dark meat, broccoli, onion, peppers.",
        name: "General Tso’s Chicken",
      },
      signals: ["gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Breakfast",
        description: "Turkey, crispy latkes, Russian & cole slaw on rye",
        name: "Grandpa Max",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Salads",
        description: "",
        name: "Fattoush Salad",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Bakery",
        description: "",
        name: "Maple Cruller",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Pizza",
        description: "Deep fried Pinsa topped with arrabbiata sauce.",
        name: "Le Nuvolette Arrabbiate",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Dessert",
        description: "Fried Pinsa smothered in Nutella®.",
        name: "Le Nuvolette con Nutella",
      },
      signals: ["gluten", "milk", "tree-nut", "wheat"],
    },
    {
      item: {
        category: "Ethiopian",
        description: "Mixed vegetables filled in a crispy shell.",
        name: "Mixed Vegetable Sambusa",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Lebanese",
        description: "Sombousek and fried kebbah.",
        name: "Kanoon Hot Mezza Platter",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Sides",
        description: "",
        name: "OLD BAY MAC‘N’CHEESE",
      },
      signals: ["gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Seafood Sides",
        description: "",
        name: "Hushpuppies",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Seafood",
        description: "Fried",
        name: "Porgy Only",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Chinese",
        description: "",
        name: "190. Crispy Shredded Beef 干煸牛",
      },
      signals: ["gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Sides",
        description: "All The Fixins (6 OF EACH)",
        name: "SHRIMP’N’OYSTERS (3 OF EACH) $18.00",
      },
      signals: ["shellfish"],
    },
    {
      item: {
        category: "Thai",
        description:
          "Deep fried whole Golden Pompano with one choice of sauce on the side.",
        name: "Crispy Whole Golden Pompano",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Seafood",
        description: "Fried",
        name: "Spot Only",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Pizza",
        description: "Crispy thin crust for an additional price.",
        name: "Crispy Thin Crust",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Combo Meals",
        description:
          "Crispy, juicy, perfectly seasoned all-white meat chicken bites.",
        name: "Chicken Bites Box Combo",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Salad",
        description:
          "Deep fried basa filet topped with hot chili and garlic sauce.",
        name: "PLA RAD PRIK",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Chesapeake / American",
        description: "Citrus, carrot consomme, crispy leeks.",
        name: "Red Drum Crudo",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Fish Appetizer",
        description: "",
        name: "Crispy Volcano",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Whole Fish",
        description: "",
        name: "Crispy-Fried (Sweet & Sour Sauce)",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Cuban",
        description: "crispy sazón chicken",
        name: "POLLO FRITO STRIPS",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Vietnamese",
        description:
          "Perfectly seasoned fillings encased in a golden, crispy wrapper.",
        name: "Savory Crispy Eggrolls",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Sides",
        description: "Extra house burger sauce.",
        name: "Extra Burger Sauce",
      },
      signals: ["egg"],
    },
    {
      item: {
        category: "Mediterranean",
        description: "crispy baby artichokes / lemon / evoo",
        name: "Artichokes",
      },
      signals: ["egg", "gluten", "wheat"],
    },
    {
      item: {
        category: "Hot Dishes",
        description: "Cilantro yuzu dressing and crispy yuba.",
        name: "Roasted Cauliflower",
      },
      signals: ["soy"],
    },
    {
      item: {
        category: "American",
        description: "Crispy buffalo chicken with sauce.",
        name: "CRISPY BUFFALO CHICKEN",
      },
      signals: ["egg", "gluten", "wheat"],
    },
    {
      item: {
        category: "Seafood",
        description: "",
        name: "Stri-Fried Quid w.Sour Cabbage",
      },
      signals: ["shellfish"],
    },
    {
      item: {
        category: "Nigiri & Sashimi A La Carte",
        description: "Suzuki",
        name: "Stripe Bass",
      },
      signals: ["fish"],
    },
    {
      item: {
        category: "Kitchen Appetizer",
        description: "Fried",
        name: "Shumai(6)",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Indian",
        description:
          "Crispy vegetable balls tossed in sweet and spicy Manchurian sauce.",
        name: "Veg Manchuria",
      },
      signals: ["gluten", "soy", "wheat"],
    },
    {
      item: {
        category: "Noodles",
        description:
          "Choose veg or chicken. Rice, noodles, vegetables, tangy, crispy noodles, side sauce.",
        name: "Triple Szechwan",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Vietnamese",
        description:
          "Crunchy eggrolls surrounded by fresh vegetables and rice paper.",
        name: "TD Signature Rolls",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Starters",
        description: "Vegan. Spicy. Baby corn, onion, green chili.",
        name: "Crispy Chili Baby Corn",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Snacks",
        description:
          "Traditional Gujarati kachori with pigeon peas, green peas, and spices.",
        name: "Crispy Lilva Bites",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Dessert",
        description: "Maldon sea salt, crispy dark chocolate pearls.",
        name: "Tiramisu",
      },
      signals: ["egg", "gluten", "milk", "wheat"],
    },
    {
      item: {
        category: "Bakery",
        description: "This pie is so delicious, you'll need another.",
        name: "Vegan Berry Pie (Whole)",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Pizza",
        description: "Caramelized onion, green pepper, mushroom, broccolini.",
        name: "Thu The Garden Pie (Vegan)",
      },
      signals: ["gluten", "wheat"],
    },
    {
      item: {
        category: "Wings",
        description:
          "Crispy fried, classic bone-in wings in the flavor of your choice.",
        name: "Classic Wings",
      },
      signals: ["gluten", "wheat"],
    },
  ];

  for (const testCase of cases) {
    assertAllergenSignalsInclude(
      inferMenuItemIngredientIntelligence(
        { allergenSourceType: "unavailable", ...testCase.item },
        { manifest },
      ),
      testCase.signals,
    );
  }

  const savorySamosaPastry = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Indian",
      description: "Crispy pastry with spiced peas and potatoes.",
      name: "Samosas",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(savorySamosaPastry, ["gluten", "wheat"]);
  assertNoAllergenSignalsInclude(savorySamosaPastry, ["egg", "milk"]);

  const freshUncookedWings = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Meat & Poultry",
      description: "Fresh uncooked chicken wings.",
      name: "Chicken Wings Fresh Uncooked",
    },
    { manifest },
  );
  const smokedPlainWings = inferMenuItemIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      category: "Wings",
      description: "Jumbo chicken wings smoked and served plain.",
      name: "Smoked Wings",
    },
    { manifest },
  );

  assert.equal(freshUncookedWings, null);
  assert.equal(smokedPlainWings, null);
});

test("ingredient intelligence audit reports risky uninferred and broad confidence examples", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const repository = {
    generatedAt: "2026-07-01T00:00:00.000Z",
    restaurants: [
      {
        id: "audit-test",
        name: "Audit Test",
        sourceFamily: "generic-website",
        items: [
          {
            allergenSourceType: "unavailable",
            category: "Specials",
            description: "",
            id: "unknown-risk",
            name: "Mystery Crispy Stack",
          },
          {
            allergenSourceType: "unavailable",
            category: "Sandwiches",
            description: "",
            id: "sandwich",
            name: "Chicken Sandwich",
          },
          {
            allergenSourceType: "unavailable",
            category: "Mocktails",
            description: "Mango puree, cranberry, club soda.",
            id: "mocktail",
            name: "Mango Mocktail",
          },
          {
            allergenSourceType: "unavailable",
            category: "Entrees",
            description:
              "Half Pan (8) Wings $90.00 | Full Pan (12) Wings $135.00",
            id: "fried-turkey-wings",
            name: "Fried Turkey Wings",
          },
          {
            allergenSourceType: "unavailable",
            category: "Thai",
            description:
              "Thailand's most popular bar snack, fried, sided w/ cucumber & hot sriracha chili sauce.",
            id: "pork-strip",
            name: "Pork Strip",
          },
        ],
      },
      {
        id: "audit-skip",
        name: "Audit Skip",
        sourceFamily: "generic-website",
        items: [
          {
            allergenSourceType: "unavailable",
            category: "Dessert",
            description: "",
            id: "cake",
            name: "Chocolate Cake",
          },
        ],
      },
    ],
  };
  const report = buildIngredientIntelligenceAudit(repository, manifest, {
    restaurantIds: ["audit-test"],
  });

  assert.equal(report.summary.totalItems, 5);
  assert.equal(report.summary.officialUnavailableItems, 5);
  assert.equal(report.summary.inferredItems, 1);
  assert.equal(report.summary.riskyUninferredItems, 1);
  assert.equal(report.scope.selectedRestaurantCount, 1);
  assert.equal(report.scope.repositoryRestaurantCount, 2);
  assert.equal(
    report.broadLowConfidenceExamples[0].itemName,
    "Chicken Sandwich",
  );

  const emptyChunk = buildIngredientIntelligenceAudit(repository, manifest, {
    limit: 1,
    offset: 1,
    restaurantIds: ["audit-test"],
  });
  assert.equal(emptyChunk.summary.totalItems, 0);
  assert.equal(emptyChunk.scope.selectedRestaurantCount, 0);
});

test("ingredient intelligence sandwich shape can come from menu descriptions", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();

  assertAllergenSignalsInclude(
    inferMenuItemIngredientIntelligence(
      {
        allergenSourceType: "unavailable",
        category: "Pizza",
        description: "Create your own sandwich with Top Round Pastrami.",
        name: "Pastrami",
      },
      { manifest },
    ),
    ["gluten", "wheat"],
  );

  assert.equal(
    inferMenuItemIngredientIntelligence(
      {
        allergenSourceType: "unavailable",
        category: "Sandwiches",
        description: "Served on a gluten-free bun.",
        name: "Chicken Sandwich",
      },
      { manifest },
    ),
    null,
  );
});

test("ingredient intelligence aliases from Open Food Facts vocabulary map to app allergens", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const inference = inferMenuItemIngredientIntelligence(
    {
      category: "Sauces",
      description: "Cream sauce with whey, albumen, and peanut butter.",
      name: "House Sauce",
    },
    { manifest },
  );

  assertAllergenSignalsInclude(inference, ["egg", "milk", "peanut"]);
});

test("ingredient intelligence preserves Wikidata provenance for reviewed profiles", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const caesarProfile = manifest.dishProfiles.find(
    (profile) => profile.id === "caesar_salad",
  );

  assert.equal(caesarProfile.provenance[0].source, "wikidata");
  assert.equal(caesarProfile.provenance[0].qid, "Q275508");
  assert.equal(caesarProfile.provenance[0].pid, "P186");
});

test("ingredient intelligence annotates review-only fields without official safety claims", async () => {
  const manifest = await getDefaultIngredientIntelligenceManifest();
  const item = annotateMenuItemWithIngredientIntelligence(
    {
      allergenSourceType: "unavailable",
      allergens: [],
      category: "Pasta",
      description: "Pesto sauce.",
      id: "pesto",
      name: "Pesto Pasta",
    },
    { manifest },
  );

  assert.equal(item.allergenSourceType, "unavailable");
  assert.deepEqual(item.allergens, []);
  assert.equal(
    item.inferredAllergenSignals.some((signal) => signal.id === "milk"),
    true,
  );
  assert.equal("safetyStatus" in item, false);
});

function signalIds(inference) {
  return inference.inferredAllergenSignals.map((signal) => signal.id).sort();
}

function assertAllergenSignalsInclude(inference, expectedIds) {
  const ids = signalIds(inference);

  for (const expectedId of expectedIds) {
    assert.equal(
      ids.includes(expectedId),
      true,
      `${ids.join(", ")} should include ${expectedId}`,
    );
  }
}

function assertNoAllergenSignalsInclude(inference, forbiddenIds) {
  const ids = inference ? signalIds(inference) : [];

  for (const forbiddenId of forbiddenIds) {
    assert.equal(
      ids.includes(forbiddenId),
      false,
      `${ids.join(", ")} should not include ${forbiddenId}`,
    );
  }
}
