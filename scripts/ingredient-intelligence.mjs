import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const defaultManifest = require("../data/ingredient-intelligence/v2/manifest.json");
const projectRoot = path.resolve(__dirname, "..");
const defaultManifestPath = path.join(
  projectRoot,
  "data/ingredient-intelligence/v2/manifest.json",
);
const confidenceRank = {
  low: 1,
  medium: 2,
  high: 3,
};

export async function loadIngredientIntelligenceManifest(manifestPath = defaultManifestPath) {
  const body = await readFile(manifestPath, "utf8");
  return JSON.parse(body);
}

export async function getDefaultIngredientIntelligenceManifest() {
  return defaultManifest;
}

export async function annotateRestaurantWithIngredientIntelligence(restaurant, options = {}) {
  const manifest = options.manifest ?? (await getDefaultIngredientIntelligenceManifest());
  const items = (restaurant.items ?? []).map((item) =>
    annotateMenuItemWithIngredientIntelligence(item, { manifest }),
  );
  const { inferenceVersion: _inferenceVersion, ...cleanRestaurant } = restaurant;

  return items.some((item) => item.inferenceVersion === manifest.version)
    ? { ...cleanRestaurant, inferenceVersion: manifest.version, items }
    : { ...cleanRestaurant, items };
}

export function annotateMenuItemWithIngredientIntelligence(item, { manifest }) {
  const inference = inferMenuItemIngredientIntelligence(item, { manifest });
  const {
    extractedIngredientMentions: _extractedIngredientMentions,
    inferredIngredients: _inferredIngredients,
    inferredAllergenSignals: _inferredAllergenSignals,
    inferenceQuestions: _inferenceQuestions,
    inferenceSuppressions: _inferenceSuppressions,
    inferenceSummary: _inferenceSummary,
    inferenceVersion: _inferenceVersion,
    ...cleanItem
  } = item;

  if (!inference) {
    return cleanItem;
  }

  return {
    ...cleanItem,
    ...inference,
  };
}

export function inferMenuItemIngredientIntelligence(item, { manifest }) {
  if (!manifest) {
    throw new Error("Ingredient Intelligence manifest is required.");
  }

  if (!officialAllergenDataUnavailable(item)) {
    return null;
  }

  const searchableFields = menuItemSearchableFields(item);
  const contextFields = menuItemContextFields(item);
  const normalizedText = normalizeSearchText(searchableFields.map((field) => field.value).join(" "));
  const normalizedContextText = normalizeSearchText(
    contextFields.map((field) => field.value).join(" "),
  );
  const matches = new Map();
  const extractedIngredientMentions = [];

  for (const ingredient of manifest.ingredientAliases ?? []) {
    const matchedAliases = matchingAliasesByField(searchableFields, ingredient.aliases ?? [ingredient.label]);

    if (
      matchedAliases.length > 0 &&
      !aliasesMatch(normalizedText, ingredient.excludeAliases ?? [])
    ) {
      for (const matchedAlias of matchedAliases) {
        extractedIngredientMentions.push({
          ingredientId: ingredient.id,
          label: ingredient.label,
          sourceField: matchedAlias.field,
          text: matchedAlias.alias,
        });
      }

      addIngredientMatch(matches, ingredient.id, {
        confidence: "high",
        evidence: [`menu:${ingredient.id}`, `ingredient:${ingredient.id}`],
        label: ingredient.label,
      });
    }
  }

  for (const composite of manifest.composites ?? []) {
    if (!aliasesMatch(normalizedText, composite.aliases ?? [composite.label])) {
      continue;
    }

    if (aliasesMatch(normalizedText, composite.excludeAliases ?? [])) {
      continue;
    }

    for (const ingredientId of composite.ingredients ?? []) {
      addIngredientMatch(matches, ingredientId, {
        confidence: composite.confidence ?? "medium",
        evidence: [`composite:${composite.id}`],
        label: labelForIngredient(manifest, ingredientId),
      });
    }
  }

  for (const profile of manifest.dishProfiles ?? []) {
    if (!aliasesMatch(normalizedText, profile.aliases ?? [profile.label])) {
      continue;
    }

    const profileSuppressedIngredientIds = suppressedProfileIngredientIds(profile, normalizedText);

    if (
      aliasesMatch(normalizedText, profile.excludeAliases ?? []) &&
      profileSuppressedIngredientIds.size === 0
    ) {
      continue;
    }

    for (const ingredientId of profile.ingredients ?? []) {
      if (profileSuppressedIngredientIds.has(ingredientId)) {
        continue;
      }

      addIngredientMatch(matches, ingredientId, {
        confidence: profile.confidence ?? "medium",
        evidence: [`dish:${profile.id}`],
        label: labelForIngredient(manifest, ingredientId),
      });
    }
  }

  for (const rule of manifest.dishShapeRules ?? []) {
    const fields = searchableFields.filter((field) => fieldAllowedForRule(field, rule));
    const matchedAliases = matchingAliasesByField(fields, rule.aliases ?? [rule.label]);
    const categoryMatches = matchingAliasesByField(
      contextFields.filter((field) => field.name === "category"),
      rule.categoryAliases ?? [],
    );
    const matchedByPrimaryText = matchedAliases.length > 0;
    const matchedByCategoryOnly =
      !matchedByPrimaryText && rule.allowCategoryOnly === true && categoryMatches.length > 0;

    if (!matchedByPrimaryText && !matchedByCategoryOnly) {
      continue;
    }

    if (aliasesMatch(normalizedContextText, rule.excludeAliases ?? [])) {
      continue;
    }

    for (const ingredientId of rule.ingredients ?? []) {
      addIngredientMatch(matches, ingredientId, {
        confidence: rule.confidence ?? "low",
        evidence: [`shape:${rule.id}`],
        label: labelForIngredient(manifest, ingredientId),
      });
    }
  }

  if (matches.size === 0) {
    return null;
  }

  const signalsByAllergen = new Map();

  for (const [ingredientId, match] of matches) {
    for (const mapping of manifest.allergenMappings?.[ingredientId] ?? []) {
      const current = signalsByAllergen.get(mapping.id);
      const confidence = lowerConfidence(match.confidence, mapping.c ?? "medium");
      const evidence = uniqueStrings([
        ...(current?.e ?? []),
        ...match.evidence,
        ...(mapping.e ?? []),
      ]).slice(0, 4);

      if (!current || confidenceRank[confidence] > confidenceRank[current.c]) {
        signalsByAllergen.set(mapping.id, {
          id: mapping.id,
          c: confidence,
          e: evidence,
        });
      } else {
        signalsByAllergen.set(mapping.id, {
          ...current,
          e: evidence,
        });
      }
    }
  }

  const inferredAllergenSignals = Array.from(signalsByAllergen.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const { signals: contextAdjustedSignals, suppressions } = applyContextSuppressions({
    matches,
    normalizedContextText,
    signals: inferredAllergenSignals,
  });

  if (contextAdjustedSignals.length === 0 && suppressions.length === 0) {
    return null;
  }

  const activeAllergenIds = new Set(contextAdjustedSignals.map((signal) => signal.id));
  const inferredIngredients = Array.from(matches.keys())
    .filter((ingredientId) =>
      (manifest.allergenMappings?.[ingredientId] ?? []).some((mapping) =>
        activeAllergenIds.has(mapping.id),
      ),
    )
    .sort();
  const ingredientLabels = inferredIngredients
    .map((ingredientId) => matches.get(ingredientId)?.label ?? ingredientId)
    .slice(0, 6);

  return {
    extractedIngredientMentions: compactMentions(extractedIngredientMentions),
    inferredIngredients,
    inferredAllergenSignals: contextAdjustedSignals,
    inferenceQuestions: buildInferenceQuestions(contextAdjustedSignals, matches),
    ...(suppressions.length > 0 ? { inferenceSuppressions: suppressions } : {}),
    inferenceSummary:
      ingredientLabels.length > 0
        ? `Common ingredients may include ${formatList(ingredientLabels)}.`
        : suppressionSummary(suppressions),
    inferenceVersion: manifest.version,
  };
}

function suppressedProfileIngredientIds(profile, normalizedText) {
  if (!["cheeseburger", "hamburger"].includes(profile.id)) {
    return new Set();
  }

  const suppressed = new Set();

  if (hasBunlessBurgerContext(normalizedText)) {
    suppressed.add("burger_bun");
  }

  if (/\b(?:vegan cheese|dairy free cheese|plant based cheese)\b/.test(normalizedText)) {
    suppressed.add("cheese");
  }

  return suppressed;
}

function hasBunlessBurgerContext(normalizedText) {
  return /\b(?:burger bowl|bunless|without bun|with no bun|no bun|w o bun|wo bun|lettuce wrap|lettuce wrapped burger|lettuce wrapped cheeseburger|gluten free bun|gluten free burger|gluten friendly burger)\b/.test(
    normalizedText,
  );
}

function applyContextSuppressions({ matches, normalizedContextText, signals }) {
  const suppressions = [];
  const adjustedSignals = [];

  for (const signal of signals) {
    const reasons = contextSuppressionReasons(signal.id, matches, normalizedContextText);

    if (reasons.length > 0) {
      suppressions.push({
        id: signal.id,
        reasons,
      });
      continue;
    }

    adjustedSignals.push(signal);
  }

  return { signals: adjustedSignals, suppressions };
}

function contextSuppressionReasons(allergenId, matches, normalizedContextText) {
  const ingredientIds = new Set(matches.keys());
  const reasons = [];
  const veganAnimalScanText = normalizedContextText
    .replace(/\b(?:vegan|plant based|plantbased|dairy free|dairyfree)\s+(?:mayo|mayonnaise|aioli|cheese|cream|crema|mozzarella|ricotta|butter|ice cream)\b/g, "")
    .replace(/\b(?:mock|vegan|vegetarian|veggie|eggie|plant based|plantbased|meatless|soy|hearts? of palm|jackfruit)\s+(?:crab|shellfish|lobster|shrimp)\b/g, "")
    .replace(/\b(?:crab|shellfish|lobster|shrimp)\s+(?:made from|with)\s+(?:hearts? of palm|jackfruit)\b/g, "")
    .replace(/\b(?:mock|vegan|vegetarian|veggie|eggie|plant based|plantbased|meatless|soy|watermelon)\s+(?:tuna|ahi|salmon|fish|eel)\b/g, "")
    .replace(/\b(?:tuna|ahi|salmon|fish)\s+(?:watermelon|made from watermelon)\b/g, "");
  const wholeItemVeganContext =
    /\b(?:vegan|plant based|plantbased)\b/.test(normalizedContextText) &&
    !/\b(?:real|actual|bacon|beef|cheddar|chicken|dairy|duck|egg|feta|fish|gouda|ham|havarti|lamb|milk|mozz|mozzarella|pastrami|pork|salmon|seafood|shrimp|swiss|tilapia|tuna|turkey|crab|lobster|scallop|cheese|butter|cream)\b/.test(
      veganAnimalScanText,
    );

  if (
    ["milk", "egg", "fish", "shellfish"].includes(allergenId) &&
    wholeItemVeganContext
  ) {
    reasons.push("vegan-or-plant-based-context");
  }

  if (
    allergenId === "egg" &&
    /\b(?:vegan|egg free|eggfree)\s+(?:mayo|mayonnaise|aioli)\b/.test(normalizedContextText)
  ) {
    reasons.push("vegan-or-egg-free-mayo");
  }

  if (allergenId === "egg" && /\begg replacer\b/.test(normalizedContextText)) {
    reasons.push("egg-replacer-context");
  }

  if (
    allergenId === "milk" &&
    hasVeganOrDairyFreeDairyTerm(normalizedContextText) &&
    !hasUnsuppressedDairyTerm(normalizedContextText)
  ) {
    reasons.push("vegan-or-dairy-free-dairy-term");
  }

  if (
    allergenId === "milk" &&
    /\bcoconut\s+(?:milk|cream|creamer|ice\s+cream|yogurt)\b/.test(normalizedContextText) &&
    !hasUnsuppressedDairyTerm(normalizedContextText.replace(/\bcoconut\s+(?:milk|cream|creamer|ice\s+cream|yogurt)\b/g, " "))
  ) {
    reasons.push("coconut-dairy-word");
  }

  if (
    allergenId === "shellfish" &&
    (ingredientIds.has("crab") || ingredientIds.has("shrimp") || ingredientIds.has("shellfish_mix")) &&
    /\b(?:mock|vegan|vegetarian|veggie|eggie|plant based|plantbased|meatless|soy|hearts? of palm|jackfruit)\s+(?:crab|shellfish|lobster|shrimp)\b|\b(?:crab|shellfish|lobster|shrimp)\s+(?:made from|with)\s+(?:hearts? of palm|jackfruit|soy|yam)\b/.test(
      normalizedContextText,
    )
  ) {
    reasons.push("mock-or-plant-based-shellfish-term");
  }

  if (
    allergenId === "fish" &&
    /\b(?:mock|vegan|vegetarian|veggie|eggie|plant based|plantbased|meatless|soy|watermelon)\s+(?:tuna|ahi|salmon|fish|eel)\b|\b(?:tuna|ahi|salmon|fish|eel)\s+(?:watermelon|made from watermelon)\b/.test(
      normalizedContextText,
    )
  ) {
    reasons.push("mock-or-plant-based-fish-term");
  }

  if (
    (allergenId === "wheat" || allergenId === "gluten") &&
    /\b(?:dedicated gluten free|dedicated glutenfree|gluten free bakery|glutenfree bakery|100 gluten free|all gluten free|entirely gluten free)\b/.test(
      normalizedContextText,
    ) &&
    !/\b(?:wheat|gluten|contains wheat|contains gluten)\b/.test(
      normalizedContextText.replace(/\b(?:gluten free|glutenfree|wheat free|wheatfree)\b/g, ""),
    )
  ) {
    reasons.push("dedicated-gluten-free-context");
  }

  if (
    (allergenId === "wheat" || allergenId === "gluten") &&
    hasItemLevelGlutenFreeContext(normalizedContextText)
  ) {
    reasons.push("item-level-gluten-free-context");
  }

  if (
    (allergenId === "wheat" || allergenId === "gluten") &&
    /\bflourless\b(?:\s+[a-z0-9]+){0,5}\s+(?:cake|torte|torta|brownie|dessert|waffle|pancake)\b|\b(?:cake|torte|torta|brownie|dessert|waffle|pancake)(?:\s+[a-z0-9]+){0,5}\s+flourless\b/.test(
      normalizedContextText,
    ) &&
    !/\b(?:wheat|gluten|cookie crust|graham cracker|pastry|breadcrumbs?|bread crumbs?)\b/.test(
      normalizedContextText.replace(/\bflourless\b/g, ""),
    )
  ) {
    reasons.push("flourless-baked-good-context");
  }

  if (hasAllergenFreeContext(allergenId, normalizedContextText)) {
    reasons.push("allergen-free-context");
  }

  if (
    ["wheat", "gluten", "sesame"].includes(allergenId) &&
    ingredientIds.has("burger_bun") &&
    hasBunlessBurgerContext(normalizedContextText)
  ) {
    reasons.push("bunless-or-lettuce-wrap-burger-context");
  }

  return Array.from(new Set(reasons));
}

function hasVeganOrDairyFreeDairyTerm(normalizedContextText) {
  return /\b(?:vegan|dairy free|dairyfree|plant based|plantbased|daiya)\b(?:\s+(?:spicy|smoked|grilled|house|cashew|almond|oat|soy|coconut|daiya)){0,4}\s+(?:cheese|mozz|mozzarella|cream|crema|ricotta|butter|ice cream)\b|\b(?:vegan|dairy free|dairyfree|plant based|plantbased|daiya)\s+(?:cheese|mozz|mozzarella|cream|crema|ricotta|butter|ice cream)\b/.test(
    normalizedContextText,
  );
}

function hasUnsuppressedDairyTerm(normalizedContextText) {
  const scanText = normalizedContextText
    .replace(
      /\b(?:vegan|dairy free|dairyfree|plant based|plantbased|daiya)\b(?:\s+(?:spicy|smoked|grilled|house|cashew|almond|oat|soy|coconut|daiya)){0,4}\s+(?:cheese|mozz|mozzarella|cream|crema|ricotta|butter|ice cream)\b/g,
      "",
    )
    .replace(
      /\b(?:cheese|mozz|mozzarella|cream|crema|ricotta|butter|ice cream)\s+(?:alternative|substitute|sub|replacement)\b/g,
      "",
    )
    .replace(/\bgrilled cheese (?:and )?melts\b/g, "");

  return /\b(?:american|brie|burrata|cheddar|cheese|cotija|cream cheese|dairy|feta|goat cheese|gouda|gruyere|havarti|mozz|mozzarella|parmesan|pecorino|provolone|queso|ricotta|swiss)\b/.test(
    scanText,
  );
}

function hasAllergenFreeContext(allergenId, normalizedContextText) {
  const termsByAllergen = {
    egg: ["egg"],
    fish: ["fish"],
    gluten: ["gluten", "wheat"],
    milk: ["dairy", "milk"],
    peanut: ["peanut"],
    sesame: ["sesame"],
    shellfish: ["shellfish"],
    soy: ["soy"],
    "tree-nut": ["tree nut", "nut", "nuts"],
    wheat: ["wheat", "gluten"],
  };
  const terms = termsByAllergen[allergenId] ?? [];

  if (terms.length === 0) {
    return false;
  }

  if (
    (allergenId === "wheat" || allergenId === "gluten") &&
    hasAllergenFreeWrapperMarkerContext(terms, normalizedContextText)
  ) {
    return false;
  }

  const containsPattern = terms
    .map((term) => term.replace(/\s+/g, "\\s+"))
    .join("|");

  if (
    new RegExp(
      `\\b(?:contains?|allergens?\\s+contains?)\\s+(?:[a-z0-9]+\\s+){0,8}(?:${containsPattern})\\b`,
    ).test(normalizedContextText)
  ) {
    return false;
  }

  return terms.some((term) => {
    const pattern = term.replace(/\s+/g, "\\s+");

    if (
      new RegExp(
        `\\b${pattern}\\s+free(?:\\s+[a-z0-9]+){0,3}\\s+(?:option|options|available|upon\\s+request|preference|section)\\b`,
      ).test(normalizedContextText)
    ) {
      return false;
    }

    return (
      new RegExp(`\\b${pattern}\\s+free\\b`).test(normalizedContextText) ||
      new RegExp(`\\bfree\\s+of\\s+(?:[a-z0-9]+\\s+){0,3}${pattern}\\b`).test(
        normalizedContextText,
      ) ||
      new RegExp(`\\b(?:no|without)\\s+(?:[a-z0-9]+\\s+){0,2}${pattern}\\b`).test(
        normalizedContextText,
      )
    );
  });
}

function hasAllergenFreeWrapperMarkerContext(terms, normalizedContextText) {
  return terms.some((term) => {
    const pattern = term.replace(/\s+/g, "\\s+");

    return new RegExp(
      `\\b(?:our|the)\\s+${pattern}\\s+free(?:\\s+[a-z0-9]+){0,4}\\s+are\\s+always\\s+(?:in\\s+)?(?:[a-z0-9]+\\s+){0,3}(?:wrapper|wrappers|wrapped|packaging|sticker|stickers)\\b`,
    ).test(normalizedContextText);
  });
}

function hasItemLevelGlutenFreeContext(normalizedContextText) {
  const textWithoutGlutenFreeMarkers = normalizedContextText.replace(
    /\b(?:gluten free|glutenfree|wheat free|wheatfree|no gluten|no wheat|without gluten|without wheat|gf)\b/g,
    "",
  );

  if (/\b(?:contains|contain|contains allergen|allergens contains?)\s+(?:wheat|gluten)\b/.test(textWithoutGlutenFreeMarkers)) {
    return false;
  }

  if (
    /\b(?:gluten free|glutenfree|wheat free|wheatfree)\s+(?:option|preference|available|upon request|substitution|substitute|crust available|bread available|bun available)\b/.test(
      normalizedContextText,
    )
  ) {
    return false;
  }

  if (hasAllergenFreeWrapperMarkerContext(["gluten", "wheat"], normalizedContextText)) {
    return false;
  }

  const glutenFreeFoodTerm =
    "(?:bagel|bagels|bakery|banana bread|bread|breads|biscuit|biscuits|brownie|brownies|bun|buns|cake|cakes|cakecup|cakecups|cookie|cookies|cupcake|cupcakes|donut|donuts|doughnut|doughnuts|muffin|muffins|pancake|pancakes|pasta|pizza|roll|rolls|sandwich|sandwiches|scone|scones|toast|waffle|waffles)";
  const itemLevelGlutenFreeMarker =
    "(?:gluten free|glutenfree|wheat free|wheatfree|no gluten|no wheat|without gluten|without wheat|gf)";

  return (
    new RegExp(
      `\\b${itemLevelGlutenFreeMarker}(?:\\s+[a-z0-9]+){0,4}\\s+${glutenFreeFoodTerm}\\b`,
    ).test(normalizedContextText) ||
    new RegExp(
      `\\b${glutenFreeFoodTerm}(?:\\s+[a-z0-9]+){0,4}\\s+${itemLevelGlutenFreeMarker}\\b`,
    ).test(normalizedContextText)
  );
}

function officialAllergenDataUnavailable(item) {
  const allergens = item.allergens ?? [];
  const mayContain = item.mayContain ?? [];

  return (
    item.allergenSourceType === "unavailable" ||
    (!item.allergenSourceType && allergens.length === 0 && mayContain.length === 0)
  );
}

export function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function aliasesMatch(normalizedText, aliases) {
  const haystack = ` ${normalizedText} `;

  return aliases.some((alias) => {
    const normalizedAlias = normalizeSearchText(alias);

    return aliasVariants(normalizedAlias).some((variant) => haystack.includes(` ${variant} `));
  });
}

function matchingAliasesByField(fields, aliases) {
  const matches = [];

  for (const field of fields) {
    const haystack = ` ${field.normalized} `;

    for (const alias of aliases) {
      const normalizedAlias = normalizeSearchText(alias);

      if (aliasVariants(normalizedAlias).some((variant) => haystack.includes(` ${variant} `))) {
        matches.push({
          alias,
          field: field.name,
        });
      }
    }
  }

  return matches;
}

function menuItemSearchableFields(item) {
  return [
    { name: "name", value: item.name },
    { name: "description", value: item.description },
    { name: "ingredientsText", value: item.ingredientsText },
    ...(Array.isArray(item.knownIngredients)
      ? item.knownIngredients.map((ingredient, index) => ({
          name: `knownIngredients.${index}`,
          value: ingredient,
        }))
      : []),
  ]
    .filter((field) => typeof field.value === "string" && field.value.trim().length > 0)
    .map((field) => ({
      ...field,
      normalized: normalizeSearchText(field.value),
    }));
}

function menuItemContextFields(item) {
  return [
    ...menuItemSearchableFields(item),
    { name: "category", value: item.category },
  ]
    .filter((field) => typeof field.value === "string" && field.value.trim().length > 0)
    .map((field) => ({
      ...field,
      normalized: normalizeSearchText(field.value),
    }));
}

function fieldAllowedForRule(field, rule) {
  const allowedFields = rule.matchFields ?? ["name", "description", "ingredientsText", "knownIngredients"];

  return allowedFields.some(
    (allowedField) => field.name === allowedField || field.name.startsWith(`${allowedField}.`),
  );
}

function aliasVariants(normalizedAlias) {
  if (!normalizedAlias) {
    return [];
  }

  const variants = new Set([normalizedAlias]);
  const words = normalizedAlias.split(" ");
  const lastWord = words.at(-1);

  if (!lastWord || lastWord.endsWith("s")) {
    return Array.from(variants);
  }

  const prefix = words.slice(0, -1).join(" ");
  const withLastWord = (value) => (prefix ? `${prefix} ${value}` : value);

  variants.add(withLastWord(`${lastWord}s`));

  if (/(s|x|z|ch|sh)$/.test(lastWord)) {
    variants.add(withLastWord(`${lastWord}es`));
  }

  if (lastWord.endsWith("y") && !/[aeiou]y$/.test(lastWord)) {
    variants.add(withLastWord(`${lastWord.slice(0, -1)}ies`));
  }

  return Array.from(variants);
}

function addIngredientMatch(matches, ingredientId, nextMatch) {
  const current = matches.get(ingredientId);

  if (!current) {
    matches.set(ingredientId, nextMatch);
    return;
  }

  matches.set(ingredientId, {
    ...current,
    confidence:
      confidenceRank[nextMatch.confidence] > confidenceRank[current.confidence]
        ? nextMatch.confidence
        : current.confidence,
    evidence: uniqueStrings([...current.evidence, ...nextMatch.evidence]),
  });
}

function labelForIngredient(manifest, ingredientId) {
  return (
    (manifest.ingredientAliases ?? []).find((ingredient) => ingredient.id === ingredientId)
      ?.label ?? ingredientId
  );
}

function lowerConfidence(left, right) {
  return confidenceRank[left] < confidenceRank[right] ? left : right;
}

function uniqueStrings(values) {
  return Array.from(
    new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)),
  );
}

function compactMentions(mentions) {
  const seen = new Set();
  const compact = [];

  for (const mention of mentions) {
    const key = `${mention.ingredientId}:${mention.sourceField}:${normalizeSearchText(mention.text)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    compact.push(mention);
  }

  return compact
    .sort(
      (left, right) =>
        left.ingredientId.localeCompare(right.ingredientId) ||
        left.sourceField.localeCompare(right.sourceField) ||
        left.text.localeCompare(right.text),
    )
    .slice(0, 12);
}

function buildInferenceQuestions(signals, matches) {
  const allergenIds = new Set(signals.map((signal) => signal.id));
  const ingredientIds = new Set(matches.keys());
  const questions = [];

  if (allergenIds.has("wheat") || allergenIds.has("gluten")) {
    questions.push(
      ingredientIds.has("burger_bun") || ingredientIds.has("bread")
        ? "Is this served on a wheat bun or bread?"
        : "Does this include wheat flour, breading, pasta, or a flour tortilla?",
    );
  }

  if (allergenIds.has("milk")) {
    questions.push("Does this contain dairy such as milk, butter, cream, or cheese?");
  }

  if (allergenIds.has("egg")) {
    questions.push("Does this contain egg or an egg-based sauce such as aioli or mayonnaise?");
  }

  if (allergenIds.has("shellfish")) {
    questions.push("Does this contain shrimp, crab, lobster, or shellfish stock?");
  }

  if (allergenIds.has("fish")) {
    questions.push("Does this contain fish, anchovy, fish sauce, or fish stock?");
  }

  if (allergenIds.has("peanut")) {
    questions.push("Does this contain peanut, peanut butter, peanut oil, or peanut sauce?");
  }

  if (allergenIds.has("tree-nut")) {
    questions.push("Does this contain tree nuts or a nut-based sauce or pesto?");
  }

  if (allergenIds.has("soy")) {
    questions.push("Does this contain soy, tofu, edamame, miso, tamari, or soy sauce?");
  }

  if (allergenIds.has("sesame")) {
    questions.push("Does this contain sesame seeds, tahini, sesame oil, or a sesame bun?");
  }

  if (allergenIds.has("mustard")) {
    questions.push("Does this contain mustard, mustard seed, or a mustard-based dressing?");
  }

  if (allergenIds.has("sulfites")) {
    questions.push("Does this contain sulfites, wine, vinegar, dried fruit, or preserved toppings?");
  }

  return uniqueStrings(questions).slice(0, 4);
}

function formatList(values) {
  if (values.length <= 1) {
    return values[0] ?? "common ingredients";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function suppressionSummary(suppressions) {
  const reasonText = new Set((suppressions ?? []).flatMap((suppression) => suppression.reasons ?? []));

  if (reasonText.has("dedicated-gluten-free-context")) {
    return "Common wheat or gluten assumptions were suppressed because the menu text indicates a dedicated gluten-free context.";
  }

  if (reasonText.has("item-level-gluten-free-context")) {
    return "Common wheat or gluten assumptions were suppressed because the menu text describes this item as gluten-free or wheat-free.";
  }

  if (reasonText.has("flourless-baked-good-context")) {
    return "Common wheat or gluten assumptions were suppressed because the menu text describes this baked good as flourless.";
  }

  if (reasonText.has("allergen-free-context")) {
    return "Common allergen assumptions were suppressed because the menu text describes this item as free from that allergen.";
  }

  if (
    reasonText.has("vegan-or-plant-based-context") ||
    reasonText.has("mock-or-plant-based-shellfish-term") ||
    reasonText.has("mock-or-plant-based-fish-term")
  ) {
    return "Common animal-derived allergen assumptions were suppressed because the menu text indicates a vegan, plant-based, or mock ingredient context.";
  }

  return "Common allergen assumptions were suppressed by menu context.";
}
