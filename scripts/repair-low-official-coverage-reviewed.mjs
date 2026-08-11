import fs from "node:fs";
import { classifyMenuItemRow, sanitizeMenuItemDisplayFields } from "./menu-item-quality.mjs";

const GENERATED_PATH = "src/data/generated/restaurants.generated.json";
const FLAG_QUEUE_PATH = "data/audits/allergen-distribution-flag-review-queue.json";

const repository = JSON.parse(fs.readFileSync(GENERATED_PATH, "utf8"));
const flagQueue = JSON.parse(fs.readFileSync(FLAG_QUEUE_PATH, "utf8"));
const lowCoverageIds = new Set(
  flagQueue
    .filter((row) =>
      (row.classes ?? row.classifications ?? []).includes("low-official-coverage:official-disclosure-only"),
    )
    .map((row) => row.id),
);

for (const restaurant of repository.restaurants ?? []) {
  if (
    (restaurant.items ?? []).some((item) =>
      /Reviewed official menu ingredient review|explicit item text was mapped to direct allergen concerns/i.test(
        `${item?.sourceSummary ?? ""} ${(item?.evidence ?? []).map((entry) => entry?.text ?? "").join(" ")}`,
      ),
    )
  ) {
    lowCoverageIds.add(restaurant.id);
  }
}

function textForItem(item) {
  const hasRemovedBleedReview = [
    item?.sourceSummary,
    ...(item?.evidence ?? []).map((entry) => entry?.text),
  ]
    .filter(Boolean)
    .some((text) => /\bremoved\b.{0,80}\b(?:bleed|neighboring|boundary)\b/i.test(String(text)));

  return [
    item?.name,
    item?.description,
    item?.ingredientsText,
    item?.sourceSummary,
    ...(item?.evidence ?? [])
      .filter((entry) => {
        if (hasRemovedBleedReview) {
          return false;
        }
        return !/manual-quality-review/i.test(String(entry?.sourceKind ?? entry?.source ?? ""));
      })
      .map((entry) => entry?.text),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceTextForItem(item) {
  return [
    item?.sourceType,
    item?.sourceKind,
    item?.sourceSummary,
    ...(item?.evidence ?? []).map((entry) => `${entry?.sourceKind ?? entry?.source ?? ""} ${entry?.sourceUrl ?? ""}`),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasReviewedOfficialMenuEvidence(item) {
  const sourceText = sourceTextForItem(item);

  if (/\b(?:allmenus|opentable|ubereats|grubhub|yelp|tripadvisor|google\.com\/maps)\b/i.test(sourceText)) {
    return false;
  }

  if (/\b(?:manual-quality-review|official-allergen-disclosure)\b/i.test(sourceText)) {
    return false;
  }

  return (
    /\b(?:next-flight-products|json-structured|pdf-menu|html-card|simple-item-card|squarespace-menu-block|product-page|toast|square|clover|shopify|wix|imenupro-menu-script)\b/i.test(
      sourceText,
    ) &&
    /\b(?:https?:\/\/|official|menu|order|restaurant|toasttab|thompsonrestaurants|squarespace|cloudfront|wp-content)\b/i.test(
      sourceText,
    )
  );
}

function hasAny(text, pattern) {
  return pattern.test(text);
}

function dedupeEvidenceEntries(item) {
  const seen = new Set();
  const evidence = [];

  for (const entry of item?.evidence ?? []) {
    const key = JSON.stringify({
      sourceKind: entry?.sourceKind ?? entry?.source ?? "",
      sourceUrl: entry?.sourceUrl ?? "",
      text: entry?.text ?? "",
    });
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    evidence.push(entry);
  }

  return {
    ...item,
    evidence,
  };
}

function addExplicitOfficialAllergens(item) {
  const alreadyOfficial = /official/i.test(String(item?.allergenSourceType ?? ""));
  if (!alreadyOfficial && !hasReviewedOfficialMenuEvidence(item)) {
    return item;
  }

  const rawText = textForItem(item);
  const text = rawText
    .replace(
      /\b(?:organic\s+)?chicken breast\s*\+\s*\d+[\s\S]*$/i,
      "",
    )
    .replace(/\b(?:add|substitute|choice of|choose one)[:\s]+[\s\S]*$/i, "")
    .replace(/\b(?:ingredients?\s+from\s+)?facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?\b[\s\S]*$/i, "")
    .replace(/\b(?:may\s+contain|processed\s+in|made\s+in|manufactured\s+in)\b[\s\S]*$/i, "")
    .toLowerCase();
  const reviewedByThisScript =
    /Reviewed official menu ingredient review/i.test(String(item?.sourceSummary ?? "")) ||
    (item?.evidence ?? []).some((entry) =>
      /Reviewed official menu ingredient review|explicit item text was mapped to direct allergen concerns/i.test(
        `${entry?.sourceKind ?? entry?.source ?? ""} ${entry?.text ?? ""}`,
      ),
    );
  const allergens = reviewedByThisScript ? new Set() : new Set(item?.allergens ?? []);
  const animalSuppressed = hasAny(text, /\b(?:vegan|plant[- ]based)\b/i);
  const milkSuppressed = animalSuppressed || hasAny(text, /\b(?:no|without)\s+(?:cheese|dairy|milk)\b|\b(?:dairy|milk)[- ]free\b/i);
  const glutenSuppressed = hasAny(text, /\b(?:gluten[- ]free|gf|without gluten|no gluten|no bun|lettuce wrap)\b/i);

  if (
    !milkSuppressed &&
    hasAny(
      text,
      /\b(?:cheese|queso|cream|creamy|butter|buttermilk|yogurt|ice cream|cheesecake|condensed milk|evaporated milk|mascarpone|paneer|labneh|kheer|gouda|parmesan|parm|parmigiano|pecorino|havarti|fontina|fontinella|gorgonzola|blue cheese|cream cheese|cheddar|mozzarella|cotija|oaxaca|burrata|brie|swiss|swiss cheese|gruyere|gruy[èe]re|feta|ricotta|stracciatella|fonduta|asiago|pimento cheese|mornay|b[eé]chamel)\b/i,
    )
  ) {
    allergens.add("milk");
  }

  if (
    !glutenSuppressed &&
    !hasAny(text, /\b(?:rice noodles?|corn tortillas?|corn chips?|tortilla chips)\b/i) &&
    hasAny(
      text,
      /\b(?:wheat|gluten|flour tortilla|ravioli|fusilli|macaroni|fettuccine|spaghetti|rigatoni|pasta|ramen|udon|egg noodles?|bread|toast|brioche|bun|buns|sub roll|hoagie roll|lobster roll|split[- ]top roll|pita|naan|lavash|sourdough|rye|marble rye|croissant|biscuit|pancakes?|(?<!crab\s)cakes?|cheesecake|graham cracker|pastry|brownies?|cookies?|focaccia|croutons?|bread\s*crumbs?|breadcrumbs?|wontons?|dumplings?)\b/i,
    )
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (!animalSuppressed && !hasAny(text, /\beggs?[- ]free\b|\bno\s+eggs?\b/i) && hasAny(text, /\b(?:egg|eggs|egg yolk|mayo|mayonnaise|aioli|hollandaise|custard|(?<!crab\s)cakes?|cheesecake|ravioli)\b/i)) {
    allergens.add("egg");
  }

  if (!animalSuppressed && !hasAny(text, /\bfish[- ]free\b|\bmock\s+(?:fish|tuna|salmon)\b/i) && hasAny(text, /\b(?:fish|tuna|ahi|salmon|branzino|cod|halibut|catfish|anchov(?:y|ies)|sardines?|trout|sea bass|snapper|dashi|bonito)\b/i)) {
    allergens.add("fish");
  }

  if (
    !animalSuppressed &&
    !hasAny(text, /\bshellfish[- ]free\b|\bmock\s+(?:crab|lobster|shrimp)\b|\bhearts?\s+of\s+palm\s+crab\b/i) &&
    hasAny(text, /\b(?:shellfish|shrimp|lobster|scallops?|crab|oysters?|clams?|mussels?|calamari|squid|octopus)\b/i)
  ) {
    allergens.add("shellfish");
  }

  if (!hasAny(text, /\bpeanuts?[- ]free\b|\bno\s+peanuts?\b/i) && hasAny(text, /\b(?:peanut|peanuts|peanut butter)\b/i)) {
    allergens.add("peanut");
  }

  if (
    !hasAny(text, /\b(?:tree[- ]nuts?|nuts?|coconut)[- ]free\b|\bnut[- ]free\b|\bno\s+(?:tree[- ]nuts?|nuts?|coconut)\b/i) &&
    hasAny(text, /\b(?:tree nuts?|walnuts?|pecans?|almonds?|pistachios?|cashews?|hazelnuts?|pine nuts?|coconut)\b/i)
  ) {
    allergens.add("tree-nut");
  }

  if (!hasAny(text, /\bsoy[- ]free\b|\bno\s+soy\b/i) && hasAny(text, /\b(?:soy|soy sauce|tamari|tofu|miso|edamame|hoisin)\b/i)) {
    allergens.add("soy");
  }

  if (!hasAny(text, /\bsesame[- ]free\b|\bno\s+sesame\b/i) && hasAny(text, /\b(?:sesame|tahini)\b/i)) {
    allergens.add("sesame");
  }

  const nextAllergens = Array.from(allergens);
  if (!reviewedByThisScript && nextAllergens.length === (item?.allergens ?? []).length) {
    return item;
  }

  if (reviewedByThisScript && nextAllergens.length === 0) {
    const next = { ...item, allergens: [], mayContain: item?.mayContain ?? [] };
    if (String(item?.allergenSourceType ?? "") === "official-ingredients") {
      next.allergenSourceType = "unavailable";
    }
    return next;
  }

  return {
    ...item,
    allergenSourceType: alreadyOfficial ? item.allergenSourceType : "official-ingredients",
    allergens: nextAllergens,
    mayContain: item?.mayContain ?? [],
    sourceSummary: /official menu ingredient review/i.test(String(item?.sourceSummary ?? ""))
      ? item.sourceSummary
      : `${item?.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed official menu ingredient review: direct ingredient terms from source-backed menu item text were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.`.trim(),
    evidence: [
      ...(item?.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text: "Reviewed official menu ingredient review: explicit item text was mapped to direct allergen concerns.",
      },
    ],
  };
}

let removedRows = 0;
let promotedRows = 0;

for (const restaurant of repository.restaurants ?? []) {
  if (!lowCoverageIds.has(restaurant.id)) {
    continue;
  }

  const nextItems = [];
  for (const item of restaurant.items ?? []) {
    const sanitized = sanitizeMenuItemDisplayFields(item);
    const classification = classifyMenuItemRow(sanitized);
    if (classification.kind !== "menu-item") {
      removedRows += 1;
      restaurant.sourceStatus = {
        ...(restaurant.sourceStatus ?? {}),
        discardedItemCount: (restaurant.sourceStatus?.discardedItemCount ?? 0) + 1,
        quarantinedItemExamples: [
          ...(restaurant.sourceStatus?.quarantinedItemExamples ?? []),
          {
            id: sanitized.id,
            kind: classification.kind,
            name: sanitized.name,
            reasons: classification.reasons,
          },
        ].slice(0, 12),
      };
      continue;
    }

    const repaired = dedupeEvidenceEntries(addExplicitOfficialAllergens(sanitized));
    if (
      String(item?.allergenSourceType ?? "unavailable") === "unavailable" &&
      String(repaired?.allergenSourceType ?? "unavailable") !== "unavailable"
    ) {
      promotedRows += 1;
    }
    nextItems.push(repaired);
  }

  restaurant.items = nextItems;
  const officialItemCount = nextItems.filter(
    (item) => item.allergenSourceType && item.allergenSourceType !== "unavailable",
  ).length;
  restaurant.officialAllergenStatus = officialItemCount > 0 ? "extracted" : restaurant.officialAllergenStatus;
  restaurant.allergenDataStatus = {
    ...(restaurant.allergenDataStatus ?? {}),
    officialItemCount,
  };
  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    officialAllergenDistributionReview: {
      reviewedAt: "2026-07-07",
      classification: "official-partial-menu-ingredient-review",
      decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
      reviewedItemCount: nextItems.length,
      officialItemCount,
      note:
        "Reviewed official menu rows and mapped explicit item-level ingredient/allergen terms as partial official evidence. This is not treated as a complete allergen matrix.",
    },
  };
}

{
  const marleys = repository.restaurants?.find(
    (restaurant) => restaurant.id === "replacement-marley-s-bar-and-grill-hyattsville-md",
  );
  const shrimpGrits = marleys?.items?.find((item) => item.id === "shrimp-and-grits");
  if (shrimpGrits) {
    shrimpGrits.allergenSourceType = "official-product-allergen-section";
    shrimpGrits.allergens = ["milk", "shellfish"];
    shrimpGrits.mayContain = [];
    shrimpGrits.sourceSummary =
      "Reviewed Marley’s official menu row: cheese grits and crawfish/shellfish sauce support milk and shellfish; neighboring salmon/catfish option bleed is excluded.";
    shrimpGrits.evidence = [
      ...(shrimpGrits.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Marley’s Shrimp & Grits against the official menu text: kept milk from cheese grits and shellfish from shrimp/crawfish sauce; excluded neighboring fish protein options.",
      },
    ];
  }
  const catfishGrits = marleys?.items?.find((item) => item.id === "catfish-and-grits");
  if (catfishGrits) {
    catfishGrits.allergenSourceType = "official-product-allergen-section";
    catfishGrits.allergens = ["fish", "milk", "shellfish"];
    catfishGrits.mayContain = [];
    catfishGrits.sourceSummary =
      "Reviewed Marley’s official menu row: catfish, cheese grits, and crawfish sauce support fish, milk, and shellfish; neighboring pasta/protein bleed is excluded.";
    catfishGrits.evidence = [
      ...(catfishGrits.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Marley’s Catfish & Grits against the official menu text: kept fish from catfish, milk from cheese grits, and shellfish from crawfish sauce; excluded neighboring pasta/protein boundary text.",
      },
    ];
  }
}

{
  const dailyDish = repository.restaurants?.find(
    (restaurant) => restaurant.id === "replacement-the-daily-dish-silver-spring-md",
  );
  const steak = dailyDish?.items?.find((item) => item.id === "10-oz-prime-new-york-strip-steak");
  if (steak) {
    steak.allergenSourceType = "unavailable";
    steak.allergens = [];
    steak.mayContain = [];
    steak.sourceSummary =
      "Reviewed Daily Dish official menu row: optional add-on protein text was excluded from base steak allergens.";
    steak.evidence = [
      ...(steak.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Daily Dish steak row against the official PDF text: salmon, shrimp, crab cake, anchovy, and other allergen terms are optional add-ons, not base-item allergens.",
      },
    ];
  }
}

{
  const donsak = repository.restaurants?.find(
    (restaurant) => restaurant.id === "replacement-donsak-thai-restaurant-washington-dc",
  );
  const butterRice = donsak?.items?.find((item) => item.id === "butter-rice-or-regular");
  if (butterRice) {
    butterRice.allergenSourceType = "unavailable";
    butterRice.allergens = [];
    butterRice.mayContain = [];
    butterRice.sourceSummary =
      "Reviewed Donsak official menu boundary: the contains-egg fried-rice text belongs to Crispy Chicken Over Rice, not this butter-rice option row.";
    butterRice.evidence = [
      ...(butterRice.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Donsak Butter Rice boundary row against the official PDF text; removed inherited egg/milk concerns from the neighboring Crispy Chicken Over Rice row.",
      },
    ];
  }
  const crabRangoon = donsak?.items?.find((item) => item.id === "crab-rangoon");
  if (crabRangoon) {
    crabRangoon.allergenSourceType = "official-product-allergen-section";
    crabRangoon.allergens = ["milk", "wheat", "gluten", "shellfish"];
    crabRangoon.mayContain = [];
    crabRangoon.sourceSummary =
      "Reviewed Donsak official PDF: Crab Rangoon lists real crabmeat, cream cheese, scallions, crispy wonton skin, and sweet-and-sour sauce.";
    crabRangoon.evidence = [
      ...(crabRangoon.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Donsak Crab Rangoon against the official PDF text; kept milk, wheat/gluten, and shellfish, and excluded egg from a neighboring/alternate spicy-mayo ordering description.",
      },
    ];
  }
}

{
  const donsak = repository.restaurants?.find(
    (restaurant) => restaurant.id === "replacement-donsak-thai-restaurant-washington-dc",
  );
  const butterRice = donsak?.items?.find((item) => item.id === "butter-rice-or-regular");
  if (butterRice) {
    butterRice.allergenSourceType = "unavailable";
    butterRice.allergens = [];
    butterRice.mayContain = [];
    butterRice.sourceSummary =
      "Reviewed Donsak official PDF boundary: this option row carried Crispy Chicken Over Rice allergen text and is not treated as a standalone official allergen item.";
    butterRice.evidence = [
      ...(butterRice.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Donsak Butter Rice or Regular row: contains-egg fried rice evidence belongs to Crispy Chicken Over Rice, not this option boundary row.",
      },
    ];
  }
}

{
  const cocineros = repository.restaurants?.find(
    (restaurant) => restaurant.id === "replacement-cocineros-hyattsville-md",
  );
  const empanadasBox = cocineros?.items?.find((item) => item.id === "empanadas-box");
  if (empanadasBox) {
    empanadasBox.allergenSourceType = "official-ingredients";
    empanadasBox.allergens = ["milk", "gluten"];
    empanadasBox.mayContain = [];
    empanadasBox.sourceSummary =
      "Reviewed Cocineros official API row: empanada options disclose dairy for chicken/spinach/cheese and gluten in the dough.";
    empanadasBox.evidence = [
      ...(empanadasBox.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Cocineros Empanadas Box against official API text; kept milk and gluten from explicit dairy and dough-gluten disclosures.",
      },
    ];
  }
  const flautasTray = cocineros?.items?.find((item) => item.id === "flautas-doradas-tray");
  if (flautasTray) {
    flautasTray.allergenSourceType = "official-ingredients";
    flautasTray.allergens = ["milk"];
    flautasTray.mayContain = ["gluten"];
    flautasTray.sourceSummary =
      "Reviewed Cocineros official API row: dairy is direct from sour cream; gluten is stored as fryer cross-contact because the row says fried in oil used for gluten-containing products.";
    flautasTray.evidence = [
      ...(flautasTray.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Cocineros Flautas Doradas Tray against official API text; kept milk direct and stored gluten as cross-contact from shared frying oil.",
      },
    ];
  }
  const tostonesTray = cocineros?.items?.find((item) => item.id === "tostones-tray");
  if (tostonesTray) {
    tostonesTray.allergenSourceType = "official-ingredients";
    tostonesTray.allergens = ["milk"];
    tostonesTray.mayContain = ["gluten"];
    tostonesTray.sourceSummary =
      "Reviewed Cocineros official API row: dairy is direct from cheese; gluten is stored as fryer cross-contact because the row says fried in oil used for gluten-containing products.";
    tostonesTray.evidence = [
      ...(tostonesTray.evidence ?? []),
      {
        sourceKind: "manual-quality-review",
        text:
          "Reviewed Cocineros Tostones Tray against official API text; kept milk direct and stored gluten as cross-contact from shared frying oil.",
      },
    ];
  }
}

{
  const cocineros = repository.restaurants?.find(
    (restaurant) => restaurant.id === "replacement-cocineros-hyattsville-md",
  );
  const empanadasBox = cocineros?.items?.find((item) => item.id === "empanadas-box");
  if (empanadasBox) {
    empanadasBox.allergenSourceType = "official-ingredients";
    empanadasBox.allergens = ["milk", "gluten"];
    empanadasBox.mayContain = [];
    empanadasBox.sourceSummary =
      "Reviewed Cocineros official API row: empanada box text says some fillings contain dairy/cheese and the dough contains gluten.";
  }

  const flautasTray = cocineros?.items?.find((item) => item.id === "flautas-doradas-tray");
  if (flautasTray) {
    flautasTray.allergenSourceType = "official-ingredients";
    flautasTray.allergens = ["milk"];
    flautasTray.mayContain = ["gluten"];
    flautasTray.sourceSummary =
      "Reviewed Cocineros official API row: flautas tray contains dairy; gluten wording is fryer/shared-oil caution, not direct ingredient.";
  }

  for (const id of ["large-chips-and-guac-tray", "small-chips-and-salsa-tray", "small-tray-of-chips-and-guac"]) {
    const chips = cocineros?.items?.find((item) => item.id === id);
    if (!chips) {
      continue;
    }
    chips.allergenSourceType = "official-ingredients";
    chips.allergens = [];
    chips.mayContain = ["gluten"];
    chips.sourceSummary =
      "Reviewed Cocineros official API row: chips are fried in oil used for gluten-containing products, stored as cross-contact caution.";
  }

  const tostonesTray = cocineros?.items?.find((item) => item.id === "tostones-tray");
  if (tostonesTray) {
    tostonesTray.allergenSourceType = "official-ingredients";
    tostonesTray.allergens = ["milk"];
    tostonesTray.mayContain = ["gluten"];
    tostonesTray.sourceSummary =
      "Reviewed Cocineros official API row: tostones tray contains dairy; gluten wording is fryer/shared-oil caution, not direct ingredient.";
  }
}

repository.itemCount = repository.restaurants.reduce(
  (count, restaurant) => count + (restaurant.items?.length ?? 0),
  0,
);
repository.generatedAt = new Date().toISOString();

fs.writeFileSync(GENERATED_PATH, `${JSON.stringify(repository)}\n`);

console.log(
  JSON.stringify(
    {
      reviewedRestaurants: lowCoverageIds.size,
      removedRows,
      promotedRows,
      itemCount: repository.itemCount,
    },
    null,
    2,
  ),
);
