import { readFileSync } from "node:fs";

const allergenSourceContract = JSON.parse(
  readFileSync(
    new URL("../src/data/allergen-source-contract.json", import.meta.url),
    "utf8",
  ),
);

export const legacyIngredientIntelligenceSourceTypes = new Set(
  allergenSourceContract.legacyIngredientSourceTypes,
);

const allergenTerms = [
  { id: "milk", pattern: /\b(?:milk|dairy)\b/i },
  { id: "egg", pattern: /\beggs?\b/i },
  { id: "fish", pattern: /\b(?:fish|seafood|anchov(?:y|ies)|salmon|tuna|cod|tilapia|trout|halibut)\b/i },
  { id: "shellfish", pattern: /\b(?:seafood|shellfish|shrimp|prawn|crab|lobster|mollus[ck]|clam|mussel|oyster|scallop|squid|calamari|octopus)\b/i },
  { id: "tree-nut", pattern: /\b(?:nuts?|tree[ -]?nuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|pine nuts?)\b/i },
  { id: "peanut", pattern: /\bpeanuts?\b/i },
  { id: "wheat", pattern: /\bwheat\b/i },
  { id: "gluten", pattern: /\bgluten\b/i },
  { id: "soy", pattern: /\bsoy(?:bean)?s?\b/i },
  { id: "sesame", pattern: /\bsesame(?: seeds?)?\b/i },
  { id: "mustard", pattern: /\bmustard\b/i },
];

export function buildExplicitOfficialAllergenDisclosurePlan(repository) {
  const actions = [];

  for (const restaurant of repository.restaurants ?? []) {
    for (const [itemIndex, item] of (restaurant.items ?? []).entries()) {
      if (
        item?.allergenSourceType !== "ingredient_intelligence" &&
        !isReclassifiableAsIngredientIntelligence(item) &&
        !hasExplicitCrossContactDisclosure(item)
      ) continue;
      const disclosure = explicitOfficialAllergenDisclosure(item);
      if (!disclosure) continue;
      if (!officialDisclosureNeedsPromotion(item, disclosure)) continue;

      actions.push({
        ...disclosure,
        itemId: item.id,
        itemIndex,
        itemName: item.name,
        restaurantId: restaurant.id,
      });
    }
  }

  return {
    actions: actions.sort((left, right) =>
      `${left.restaurantId}|${left.itemId}`.localeCompare(
        `${right.restaurantId}|${right.itemId}`,
      ),
    ),
  };
}

export function explicitOfficialAllergenDisclosure(item) {
  const sourceTexts = [
    item?.ingredientsText,
    item?.description,
    ...(item?.evidence ?? [])
      .filter((entry) => !/manual-quality-review/i.test(String(entry?.sourceKind ?? entry?.source ?? "")))
      .map((entry) => entry?.text),
  ].filter((value) => typeof value === "string" && value.trim());

  const contains = new Set();
  const mayContain = new Set();
  let hasContainsDisclosure = false;
  let hasMayContainDisclosure = false;

  for (const text of sourceTexts) {
    for (const clause of labeledAllergenClauses(text)) {
      const parsed = allergensInDisclosureClause(clause.text);
      const explicitlyEmpty = /\b(?:no|none|zero)\s+(?:listed\s+)?allergens?\b/i.test(clause.text);
      if (parsed.length === 0 && !explicitlyEmpty) continue;
      if (clause.kind === "contains") {
        hasContainsDisclosure = true;
        for (const allergen of parsed) contains.add(allergen);
      } else {
        hasMayContainDisclosure = true;
        for (const allergen of parsed) mayContain.add(allergen);
      }
    }
  }

  if (!hasContainsDisclosure && !hasMayContainDisclosure) return null;
  for (const allergen of contains) mayContain.delete(allergen);
  const linked = hasLinkedVendorEvidence(item);

  return {
    allergens: [...contains].sort(),
    mayContain: [...mayContain].sort(),
    sourceType: hasContainsDisclosure
      ? linked
        ? "restaurant-linked-product-allergen-section"
        : "official-product-allergen-section"
      : linked
        ? "restaurant_linked_vendor"
        : "restaurant_issued_positive",
    authorityTier: linked ? "restaurant_linked_vendor" : "restaurant_issued",
  };
}

export function promoteExplicitOfficialAllergenDisclosure(item, disclosure) {
  item.allergens = [...disclosure.allergens];
  item.mayContain = [...disclosure.mayContain];
  if ("mayContainAllergens" in item) item.mayContainAllergens = [...disclosure.mayContain];
  item.allergenSourceType = disclosure.sourceType;
  item.allergenAuthorityTier = disclosure.authorityTier;
  item.allergenSourceEvidenceIds = [...new Set(item.sourceEvidenceIds ?? [])];
  delete item.ingredientIntelligenceBasis;
  delete item.extractedIngredientMentions;
  delete item.inferredIngredients;
  delete item.inferredAllergenSignals;
  delete item.ingredientIntelligenceReviewed;
  delete item.inferenceQuestions;
  delete item.inferenceSuppressions;
  delete item.inferenceSummary;
  delete item.inferenceVersion;
  return item;
}

export function buildIngredientDerivedAllergenReclassificationPlan(repository) {
  const actions = [];

  for (const restaurant of repository.restaurants ?? []) {
    for (const [itemIndex, item] of (restaurant.items ?? []).entries()) {
      if (!isReclassifiableAsIngredientIntelligence(item)) continue;
      if (explicitOfficialAllergenDisclosure(item)) continue;

      actions.push({
        allergenCount: unique([...(item.allergens ?? []), ...(item.mayContain ?? [])]).length,
        basis: ingredientIntelligenceBasis(item),
        itemId: item.id,
        itemIndex,
        itemName: item.name,
        priorSourceType: item.allergenSourceType ?? "unavailable",
        restaurantId: restaurant.id,
      });
    }
  }

  return {
    actions: actions.sort((left, right) =>
      `${left.restaurantId}|${left.itemId}`.localeCompare(
        `${right.restaurantId}|${right.itemId}`,
      ),
    ),
  };
}

export function applyIngredientDerivedAllergenReclassificationPlan(repository, plan) {
  const restaurantById = new Map(
    (repository.restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]),
  );

  for (const action of plan.actions ?? []) {
    const restaurant = restaurantById.get(action.restaurantId);
    const item = restaurant?.items?.[action.itemIndex];

    if (!item || item.id !== action.itemId) {
      throw new Error(`Missing ${action.restaurantId}/${action.itemId} during reclassification.`);
    }

    reclassifyIngredientDerivedItem(item);
  }

  return repository;
}

export function reclassifyIngredientDerivedItem(item) {
  if (!isReclassifiableAsIngredientIntelligence(item)) return false;

  item.allergens = [];
  item.mayContain = [];
  if ("mayContainAllergens" in item) item.mayContainAllergens = [];
  item.allergenSourceType = "ingredient_intelligence";
  item.allergenAuthorityTier = "ingredient_intelligence";
  item.ingredientIntelligenceBasis = ingredientIntelligenceBasis(item);
  delete item.allergenSourceEvidenceIds;
  delete item.officialAllergenCoveredIds;
  delete item.officialAllergenProfileId;
  return true;
}

export function reclassifyCanonicalProduct(product) {
  if (!isReclassifiableAsIngredientIntelligence(product)) return false;

  product.containsAllergens = [];
  product.mayContainAllergens = [];
  product.allergenSourceType = "ingredient_intelligence";
  product.allergenAuthorityTier = "ingredient_intelligence";
  product.ingredientIntelligenceBasis = ingredientIntelligenceBasis(product);
  product.allergenSourceEvidenceIds = [];
  delete product.officialAllergenCoveredIds;
  delete product.officialAllergenProfileId;
  return true;
}

export function isReclassifiableAsIngredientIntelligence(item) {
  return Boolean(
    !item?.allergenSourceType ||
      item.allergenSourceType === "unavailable" ||
      legacyIngredientIntelligenceSourceTypes.has(item.allergenSourceType),
  );
}

export function ingredientIntelligenceBasis(item) {
  return [item.description, item.ingredientsText].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  )
    ? "title-description"
    : "title";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function labeledAllergenClauses(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  const marker = /\b(may\s+contain|contains?|allergens?|allergy\s+alert|cross[- ]contamination(?:\s+from\s+(?:the\s+)?fryer)?)\s*[:\-]\s*/gi;
  const matches = [...text.matchAll(marker)];

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return {
      kind: /^(?:may\s+contain|cross[- ]contamination)/i.test(match[1])
        ? "may-contain"
        : "contains",
      text: text.slice(start, end).split(/[.;|]/, 1)[0].replace(/[)\]]+$/g, "").trim(),
    };
  });
}

function allergensInDisclosureClause(value) {
  const disclosureText = String(value ?? "").replace(
    /\b(?:dairy|milk|egg|soy|sesame|peanut|tree[ -]?nut|wheat|gluten|fish|shellfish)[- ]free\b/gi,
    "",
  );

  return allergenTerms
    .filter(({ pattern }) => pattern.test(disclosureText))
    .map(({ id }) => id);
}

function hasLinkedVendorEvidence(item) {
  const evidenceText = [
    item?.sourceType,
    ...(item?.sourceEvidenceIds ?? []),
    ...(item?.sourceUrls ?? []),
    ...(item?.evidence ?? []).flatMap((entry) => [
      entry?.sourceKind,
      entry?.sourceUrl,
    ]),
  ]
    .filter(Boolean)
    .join(" ");

  return /\b(?:linked|vendor|toast|clover|square)\b|toasttab\.com|doordash\.com|grubhub\.com|order\.online/i.test(
    evidenceText,
  );
}

function officialDisclosureNeedsPromotion(item, disclosure) {
  return (
    item.allergenSourceType !== disclosure.sourceType ||
    item.allergenAuthorityTier !== disclosure.authorityTier ||
    JSON.stringify([...(item.allergens ?? [])].sort()) !==
      JSON.stringify(disclosure.allergens) ||
    JSON.stringify([...(item.mayContain ?? [])].sort()) !==
      JSON.stringify(disclosure.mayContain) ||
    Boolean(item.ingredientIntelligenceBasis) ||
    Boolean(item.inferredAllergenSignals?.length)
  );
}

function hasExplicitCrossContactDisclosure(item) {
  return [
    item?.ingredientsText,
    item?.description,
    ...(item?.evidence ?? []).map((entry) => entry?.text),
  ].some((value) =>
    /\bcross[- ]contamination(?:\s+from\s+(?:the\s+)?fryer)?\s*[:\-]/i.test(
      String(value ?? ""),
    ),
  );
}
