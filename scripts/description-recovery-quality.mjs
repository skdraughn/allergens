import { sanitizeMenuItemDisplayFields } from "./menu-item-quality.mjs";

const structurallyPairedDescriptionTypes = new Set([
  "anbe-online-kitchen-api",
  "html-card",
  "json-structured",
  "leye-item-wrap",
  "legacy-verified-recovery",
  "menusifu-api",
  "next-flight-products",
  "official-api",
  "pdf-matrix",
  "product-page",
  "sectioned-image-menu",
  "simple-item-card",
  "elementor-menu-heading",
  "reviewed-official-image-menu",
  "reviewed-official-menu-description",
  "spotapps-nuxt-menu",
  "toast-online-ordering-state",
  "toast-reader-menu",
  "structured-nutrition-description",
  "square-online-api",
  "squarespace-menu-block",
  "webflow-cms-menu",
  "yext-menu-script",
]);

const exactIdStructuredDescriptionTypes = new Set([
  "anbe-online-kitchen-api",
  "elementor-menu-heading",
  "html-allergen-matrix",
  "json-structured",
  "leye-item-wrap",
  "menusifu-api",
  "next-flight-products",
  "official-api",
  "product-page",
  "reviewed-official-image-menu",
  "sectioned-image-menu",
  "simple-item-card",
  "spotapps-nuxt-menu",
  "square-online-api",
  "squarespace-menu-block",
  "toast-online-ordering-state",
  "toast-reader-menu",
  "webflow-cms-menu",
  "yext-menu-script",
]);

export function assessRecoveredDescription(value, itemContext = {}, options = {}) {
  if (typeof value !== "string" || !value.trim()) return { usable: false, reason: "blank" };
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    return { usable: false, reason: "control_character" };
  }
  let cleaned = value.trim().replace(/\s+/g, " ");
  cleaned = cleaned.replace(/,\s*,+/g, ",");
  if (options.enforceStrictFreshCandidate === true) {
    cleaned = cleaned
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1");
  }
  for (let pass = 0; pass < 8; pass += 1) {
    const sanitized = sanitizeMenuItemDisplayFields({
      ...itemContext,
      // A candidate must be judged on its own text. Historical item evidence
      // can be stale or shifted and must never rewrite the description being
      // validated, including when a prior verified recovery is rechecked.
      evidence: [],
      description: cleaned,
    });
    const next = typeof sanitized?.description === "string"
      ? sanitized.description.trim().replace(/\s+/g, " ")
      : "";
    if (next === cleaned) break;
    cleaned = next;
    if (!cleaned) break;
  }
  const nutritionSuffixRepair = stripStructuredNutritionSuffix(cleaned);
  cleaned = nutritionSuffixRepair.value;
  cleaned = stripTrailingMenuPrice(cleaned);
  if (options.enforceStrictFreshCandidate === true) {
    cleaned = stripTrailingProteinMetadata(cleaned);
    cleaned = stripFreshExtractionTails(cleaned);
    cleaned = stripRepeatedItemNameAndPrice(cleaned, itemContext.name);
  }
  if (!cleaned) return { usable: false, reason: "sanitized_blank" };
  if (normalizeRecoveredText(cleaned) === normalizeRecoveredText(itemContext.name)) {
    return { usable: false, reason: "equals_item_name" };
  }
  const gluedPrice = cleaned.match(/^(?:\$?\d+(?:\.\d{1,2})?)(?=[A-Z])/);
  if (gluedPrice) {
    if (options.sourceType !== "html-card") {
      return { usable: false, reason: "glued_leading_price" };
    }
    cleaned = cleaned.slice(gluedPrice[0].length).trim();
  }
  if (normalizeRecoveredText(cleaned) === normalizeRecoveredText(itemContext.category)) {
    return { usable: false, reason: "equals_category" };
  }
  if (
    options.itemNames?.has(normalizeRecoveredText(cleaned))
    && !(
      options.sourceType === "reviewed-official-menu-description"
      || (
        options.exactIdMatch
        && exactIdStructuredDescriptionTypes.has(options.sourceType)
        && looksLikeDescriptionCopy(cleaned)
        && !looksLikeSiblingVariantTitle(cleaned, itemContext.name)
      )
    )
  ) {
    return { usable: false, reason: "equals_another_item_name" };
  }
  if (isSequenceOfSizedMenuItems(cleaned, itemContext.name, options.itemNames)) {
    return { usable: false, reason: "contains_multiple_item_names" };
  }
  if (
    options.enforceStrictFreshCandidate === true
    && options.sourceType !== "product-page"
    && options.sourceType !== "reviewed-official-menu-description"
    && !(
      options.exactIdMatch
      && exactIdStructuredDescriptionTypes.has(options.sourceType)
    )
    && containsAdjacentMenuItemCopy(cleaned, itemContext.name, options.itemNames)
  ) {
    return { usable: false, reason: "contains_adjacent_item_copy" };
  }
  if (isOnlySizePlusItemName(cleaned, itemContext.name)) {
    return { usable: false, reason: "size_plus_item_name" };
  }
  if (
    options.enforceStrictFreshCandidate === true
    && isOnlyQuantityPlusItemName(cleaned, itemContext.name)
  ) {
    return { usable: false, reason: "quantity_plus_item_name" };
  }
  if (looksLikeNonDescriptionMetadata(cleaned)) {
    return { usable: false, reason: "non_description_metadata" };
  }
  if (
    options.enforceStrictFreshCandidate === true
    && looksLikeAllergenOnlyNote(cleaned)
  ) {
    return { usable: false, reason: "allergen_only_note" };
  }
  if (
    options.enforceStrictFreshCandidate === true
    && looksLikeStrictFreshMetadata(cleaned)
  ) {
    return { usable: false, reason: "fresh_non_description_metadata" };
  }
  if (
    options.enforceFreshSectionHeading === true
    && options.sourceType !== "reviewed-official-menu-description"
    && looksLikeMenuSectionHeading(
      itemContext.name,
      options.sourceType,
      options.enforceStrictFreshCandidate === true,
    )
    && !(
      options.exactIdMatch
      && exactIdStructuredDescriptionTypes.has(options.sourceType)
      && looksLikeDescriptionCopy(cleaned)
    )
  ) {
    return { usable: false, reason: "menu_section_heading_record" };
  }
  if (looksVisiblyTruncated(cleaned, options.enforceStrictFreshCandidate === true)) {
    return { usable: false, reason: "truncated_description" };
  }
  if (
    options.enforceStrictFreshCandidate === true
    && looksLikeSentenceTitle(itemContext.name)
  ) {
    return { usable: false, reason: "sentence_like_item_name" };
  }
  if (/\bthis item is not currently available\b/i.test(cleaned)) {
    return { usable: false, reason: "unavailable_item_placeholder" };
  }
  if (/\bswapped for\b[\s\S]{0,160}\badd\b/i.test(cleaned)) {
    return { usable: false, reason: "customization_instruction" };
  }
  if (hasPromotionalCallToActionTail(cleaned)) {
    return { usable: false, reason: "promotional_call_to_action" };
  }
  const words = cleaned.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (cleaned.length > 1_500) return { usable: false, reason: "too_long" };
  const reviewedIngredientList = options.reviewedIngredientList === true;
  const structurallyPaired = structurallyPairedDescriptionTypes.has(options.sourceType)
    || reviewedIngredientList;
  const reviewedSingleWord = options.sourceType === "reviewed-official-image-menu";
  if (words.length < (reviewedSingleWord ? 1 : structurallyPaired ? 2 : 4)) {
    return { usable: false, reason: "too_few_words" };
  }
  if (cleaned.length < (reviewedSingleWord ? 4 : structurallyPaired ? 8 : 18)) {
    return { usable: false, reason: "too_short" };
  }
  const commas = (cleaned.match(/,/g) ?? []).length;
  const sentenceMarks = (cleaned.match(/[.!?](?:\s|$)/g) ?? []).length;
  const explicitlyStructuredIngredientList = /\b(?:contains|ingredients?)\s*:/i.test(cleaned)
    || options.sourceType === "pdf-ingredients";
  if (
    commas >= 5
    && sentenceMarks === 0
    && !structurallyPaired
    && !nutritionSuffixRepair.repaired
    && !explicitlyStructuredIngredientList
  ) {
    return { usable: false, reason: "comma_heavy_without_sentence" };
  }
  if (
    structurallyPaired
    && options.sourceType !== "legacy-verified-recovery"
    && looksLikeAdjacentContentBleed(cleaned)
  ) {
    return { usable: false, reason: "adjacent_content_bleed" };
  }
  return {
    usable: true,
    value: cleaned,
    ...(
      nutritionSuffixRepair.repaired
        ? { acceptedSourceType: "structured-nutrition-description" }
        : reviewedIngredientList
          ? { acceptedSourceType: "reviewed-official-menu-description" }
          : {}
    ),
  };
}

export function normalizeRecoveredText(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[’'`]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/\s+/g, " ");
}

function looksLikeNonDescriptionMetadata(value) {
  const normalized = value.trim().toLowerCase();
  const countPrefix = normalized.match(/^\d+\s*(?:pieces?|pcs?|count|ct|wings?)\b[ .:\-]*(.*)$/);
  const countPrefixIsOnlyMetadata = countPrefix
    ? (countPrefix[1].match(/[a-z0-9]+/g) ?? []).length < 4
    : false;
  return /^(?:\[?\s*(?:cal(?:ories)?|kcal)\.?\s*\d+\s*\]?|\[?\s*\d+\s*(?:cal(?:ories)?|kcal)\.?\s*\]?)$/.test(normalized)
    || looksLikeDietaryTagRow(value)
    || /^serving(?:\s+\d+(?:\.\d+)?){5,}\b/i.test(value)
    || /^(?:\d+(?:\.\d+)?oz\s+\d+\s*\|\s*)+\d+(?:\.\d+)?oz\s+\d+$/i.test(value)
    || /^(?:cal|cals?|calories?|kcal|island)$/.test(normalized)
    || /^\(?\s*\d+(?:\.\d+)?\s*(?:cal(?:ories)?|kcal)\s*\)?$/.test(normalized)
    || countPrefixIsOnlyMetadata
    || /^(?:limited quantities|market price|seasonal|sold out)$/.test(normalized)
    || /^please allow (?:\w+|\d+(?:\.\d+)?)\s+hours? prep(?:aration)? time\.?$/i.test(value)
    || /^(?:additional|extra) toppings?\s+\$?\d/i.test(normalized)
    || /^\(\d+(?:\.\d+)?\s*cal\)\s*-\s*add$/i.test(normalized)
    || /^\d+(?:\.\d+)?\s*oz\s+or\s+\d+(?:\.\d+)?\s*oz$/i.test(normalized)
    || /^\d+(?:\.\d+)?\s*(?:oz|ounces?|fl oz|ml|l|liter|litre|gal|gallon)s?(?:\s*\[[^\]]+\])?$/.test(normalized)
    || /^per\s+(?:guest|person)\.?$/.test(normalized)
    || (value.length < 80 && (value.match(/\$\s*\d/g) ?? []).length >= 2)
    || ((value.match(/\b\d+(?:\.\d+)?\s*g\s+protein\b/gi) ?? []).length >= 2)
    || (/^\d+(?:\.\d+)?(?=[A-Za-z])/.test(value)
      && !(countPrefix && !countPrefixIsOnlyMetadata)
      && !/^\d+(?:\.\d+)?\s*(?:g|mg|oz|fl\s*oz|ml|l|lb)\b/i.test(value))
    || (isShortAllCaps(value) && !value.includes(","));
}

function looksLikeAllergenOnlyNote(value) {
  const cleaned = value.trim().replace(/^[*\s•]+/, "");
  const words = cleaned.match(/[a-z0-9]+/gi) ?? [];
  return words.length <= 8
    && /^(?:allergens?\s*:|contains?\b|may contain\b)/i.test(cleaned)
    && !/[.!?]\s+\S/.test(cleaned);
}

function stripRepeatedItemNameAndPrice(value, itemName) {
  const name = String(itemName ?? "").trim();
  if (!name) return value;
  const pattern = name
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return value.replace(new RegExp(`^${pattern}\\s+\\$\\d+(?:\\.\\d{1,2})?\\s+`, "i"), "");
}

function looksVisiblyTruncated(value, strictFreshCandidate = false) {
  const cleaned = value.trim();
  if (cleaned.endsWith("…")) return true;
  if (strictFreshCandidate && /(?<!\betc)\.\.\.$/i.test(cleaned)) return true;
  if (strictFreshCandidate && /\b(?:with|and|or|choice of)\s+\d+\s*$/i.test(cleaned)) return true;
  if (strictFreshCandidate && /\bserved\s+with(?:\s+(?:a\s+)?choice\s+of)?\s+(?:one|two|three|four|\d+)\s*$/i.test(cleaned)) return true;
  return /\b(?!etc\.\.\.$)[a-z]{1,3}\.\.\.$/.test(cleaned);
}

function looksLikeMenuSectionHeading(name, sourceType, strictFreshCandidate) {
  if (sourceType !== "pdf-menu" && !strictFreshCandidate) return false;
  const cleaned = String(name ?? "").trim();
  if (!cleaned || cleaned !== cleaned.toUpperCase()) return false;
  return /\b(?:appetizers?|burgers?|handhelds?|greens?|bowls?|entrees?|desserts?)\b/i.test(cleaned)
    || /^starters?(?:\b|a\s)/i.test(cleaned)
    || /^(?:winning the day)$/i.test(cleaned);
}

function looksLikeStrictFreshMetadata(value) {
  const cleaned = value.trim();
  return /^\d+\s*mg\s+caffeine$/i.test(cleaned)
    || /^add extra\b[\s\S]*\bfor an additional charge\.?$/i.test(cleaned)
    || /^(?:calories per piece|select your size)$/i.test(cleaned)
    || /^(?:house favorites?|chef favorites?)$/i.test(cleaned)
    || /^no substitutions?\.?$/i.test(cleaned)
    || /^please give us\.?$/i.test(cleaned)
    || /^feeds?\s+\d+[–-]\d+\s+people\s+choose your\b/i.test(cleaned)
    || /^follow our (?:facebook|instagram|social media)\b/i.test(cleaned)
    || /^(?:\d+\s*oz\s*,?\s*){2,}(?:&\s*)?\d+\s*oz$/i.test(cleaned)
    || /^(?:(?:small|medium|large)\s+\d+[”″"]?\s*){2,}$/i.test(cleaned)
    || /^\d+\s+each\s+for\s+\$?\d+(?:\.\d{1,2})?$/i.test(cleaned)
    || /^official\s+.+\s+menu\s+item\.?$/i.test(cleaned)
    || /^save\s+\$?\d/i.test(cleaned)
    || /^(?:small|medium|large)\s+pack$/i.test(cleaned)
    || /^(?:view|see)\s+(?:the\s+)?selection$/i.test(cleaned)
    || /^(?:vegan(?:\s*&\s*|\s+and\s+))?gluten[ -]?free$/i.test(cleaned)
    || /\bhosting\s+a\s+private\s+event\b/i.test(cleaned)
    || /\b(?:add|choose from)\s*$/i.test(cleaned)
    || /^(?:vegetarian[- ]friendly|no sides?\.?)$/i.test(cleaned)
    || /^under\s+\d+\s+calories$/i.test(cleaned)
    || /^\d+\/\d+\s+pan\.?\s+serves\s+\d+$/i.test(cleaned)
    || /^(?:kids?|lunch|dinner|brunch)\s+menu$/i.test(cleaned)
    || /^catering\s+menu$/i.test(cleaned)
    || /^(?:side item|half pan)\.?$/i.test(cleaned)
    || /^\d+(?:\.\d+)?\s*oz\s+bowl;?\s+serves?\s+\d+[–-]\d+\.?$/i.test(cleaned)
    || /^\([^)]*(?:gluten[ -]?free|vegan|vegetarian)[^)]*\)$/i.test(cleaned)
    || /^s,\s*(?:soy|wheat|gluten|coconut|hazelnuts?|pistachio)\b/i.test(cleaned)
    || /^years?\s+old\s+and\s+under\s+only\b/i.test(cleaned)
    || /^beverages\b/i.test(cleaned)
    || /^food\s+(?:starters?|entrees?|sides?|desserts?)$/i.test(cleaned)
    || /^(?:dinner|lunch|brunch)\b[\s\S]*\b(?:specials?|starters?|entrees?)$/i.test(cleaned)
    || /^\|\s*[^|]+\|\s*[^|]+$/i.test(cleaned)
    || /\b(?:topping slice\s+\d+\s*){2,}/i.test(cleaned)
    || /\b(?:[a-z]+\s+){0,2}cookies?\s+\d+\b[\s\S]*\bcookies?\s+\d+\b/i.test(cleaned)
    || /^\$?\d+\.\d{2}\+?\s+/.test(cleaned)
    || /[A-Za-z)]\$\d+(?:\.\d{1,2})?$/.test(cleaned)
    || /\.\s+[A-Z][A-Z &,'’()\/-]{8,}(?:\s|$)/.test(cleaned)
    || /\b(?:and|or|with|of|for|in|over)\s*$/i.test(cleaned);
}

function stripFreshExtractionTails(value) {
  const trailingSectionPattern = /\s+(?:specials|quesadillas|extras|drinks|large plates)\s*$/i;
  const preserveWholeSection = /^(?:dinner|lunch|brunch)\b[\s\S]*\b(?:specials|quesadillas|extras|drinks)\s*$/i
    .test(value);
  return value
    // PDF column markers can be glued directly to the first capitalized word.
    .replace(/^H(?=[A-Z][a-z]{3,}\b)/, "")
    .replace(/^Half Tray\s+\d+-\d+\s+Portions\s+\$\d+(?:\.\d{2})?\s*\|\s*Full Tray\s+\d+-\d+\s+Portions\s+\$\d+(?:\.\d{2})?\s*[•·]\s*/i, "")
    .replace(/\s*\|\s*$/, "")
    .replace(preserveWholeSection ? /$a/ : trailingSectionPattern, "")
    .replace(/\s+[★☆]{3,}[\s\S]*$/u, "")
    .replace(/\s+(?:order|view menu)\s*$/i, "")
    .replace(/\s+added to cart\s*$/i, "")
    .replace(/\s+(?:(?:VG|GF)\s*)+\.?$/i, "")
    .replace(/\s+add chicken\s*$/i, "")
    .replace(/\s+want to add on\??\s*$/i, "")
    .replace(/\s+(?:STARTERS?|ENTREES?|SIDES?|DESSERTS?|MAINS|Food Starters, Salads & Such)\s*$/i, "")
    .replace(/\s+SOPA\s+DEL\s+D[IÍ]A\s+Today[’']?s\s+Soup\s*$/i, "")
    .replace(/\s+WEEKLY\s+CHEF[’']?S\s+SPECIAL\.?(?:\s+Ask your server for a full description\.?)?\s*$/i, "")
    .replace(/\s+(?:Noosh Food Menu Bowls|LIL['’]? Kids Menu|Drinks Beverages|Quesadilla)\s*$/i, "")
    .trim();
}

function stripTrailingProteinMetadata(value) {
  return value
    .replace(/\s+\d+G\s+PROTEIN(?:\s+[A-Z]\d[A-Z]?)?\s*$/i, "")
    .replace(/\s+\d+\s+CAL(?:ORIES)?\s*$/i, "")
    .trim();
}

function containsAdjacentMenuItemCopy(value, currentItemName, itemNames) {
  if (!itemNames) return false;
  const normalizedValue = normalizeRecoveredText(value);
  const normalizedCurrent = normalizeRecoveredText(currentItemName);
  const matches = [];
  for (const itemName of itemNames) {
    if (itemName === normalizedCurrent || itemName.length < 8) continue;
    const words = itemName.split(" ").filter(Boolean);
    if (words.length < 2) continue;
    const pattern = new RegExp(`(?:^| )${escapeRegExp(itemName)}(?: |$)`);
    if (!pattern.test(normalizedValue)) continue;
    matches.push(itemName);
    if (normalizedValue.startsWith(`${itemName} `) || normalizedValue === itemName) return true;
    if (words.length >= 4 || matches.length >= 2) return true;
  }
  return false;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPromotionalCallToActionTail(value) {
  return /(?:^|[.!?]\s+)(?:a\s+[^.!?]{1,80}[—–-]\s*)?order online\b/i.test(value)
    || /(?:^|[.!?]\s+)view\s+(?:nutrition|ingredients)[^.!?]{0,100}\border online\b/i.test(value)
    || /\bsubscribers?\s+always\s+get\b/i.test(value);
}

function stripTrailingMenuPrice(value) {
  return value
    .replace(/\.{2,}\$?\d{1,3}\.\d{2}\s*$/, "")
    .replace(/([.!?)]|\bcal)\s+\$?\d{1,3}(?:\.\d{1,2})?\s*$/i, "$1")
    .replace(/([A-Za-z)])\s+\d{1,3}\.\d{1,2}\s*$/, "$1")
    .replace(/\s+[—–-]\s+\$?\d{1,3}\.\d{2}\s*$/, "")
    .replace(/\s+I\s*$/, "")
    .trim();
}

function isOnlySizePlusItemName(value, itemName) {
  const withoutSize = value.replace(/^\d+(?:\.\d+)?\s*(?:oz|fl\s*oz|ml|l|lb)\b[\s,.:;-]*/i, "");
  const withoutPackaging = withoutSize.replace(/^(?:fountain|fresh(?:ly)? brewed)\s+/i, "");
  return withoutSize !== value
    && normalizeRecoveredText(withoutPackaging) === normalizeRecoveredText(itemName);
}

function isOnlyQuantityPlusItemName(value, itemName) {
  const withoutQuantity = value
    .replace(/^\d+\/\d+\s+dozen\s+/i, "")
    .replace(/^\d+\s+(?:dozen|pieces?|pcs?|count|ct)\s+/i, "")
    .trim();
  if (withoutQuantity === value) return false;
  const singularize = (input) => normalizeRecoveredText(input).replace(/s\b/g, "");
  return singularize(withoutQuantity) === singularize(itemName);
}

function looksLikeSentenceTitle(value) {
  const words = String(value ?? "").match(/[A-Za-z0-9]+/g) ?? [];
  return words.length >= 10 && /\b(?:with|served|topped|and)\b/i.test(value);
}

function isSequenceOfSizedMenuItems(value, currentItemName, itemNames) {
  if (!itemNames) return false;
  if ((value.match(/\b\d+(?:\.\d+)?\s*oz\b/gi) ?? []).length < 2) return false;
  if (
    /\bside\b/i.test(currentItemName)
    && !value.includes(",")
    && !/\b(?:with|and|or)\b/i.test(value)
  ) return true;
  const normalizedValue = normalizeRecoveredText(
    value.replace(/\b\d+(?:\.\d+)?\s*oz\b/gi, " "),
  );
  const normalizedCurrent = normalizeRecoveredText(currentItemName);
  for (const firstName of itemNames) {
    if (firstName === normalizedCurrent || firstName.length < 5) continue;
    if (!normalizedValue.startsWith(`${firstName} `)) continue;
    const secondName = normalizedValue.slice(firstName.length + 1);
    if (secondName !== normalizedCurrent && itemNames.has(secondName)) return true;
  }
  return false;
}

function stripStructuredNutritionSuffix(value) {
  const calories = /(?:^|\s+)Calories\s+\d+(?:\.\d+)?(?:\s*[gG])?\s+(?=(?:Fat|Protein|Carbs?|Sodium)\b)/i.exec(value);
  if (!calories) return { value, repaired: false };
  const prefix = value.slice(0, calories.index);
  const containsIndex = prefix.search(/\s+Contains\s+/i);
  const description = (containsIndex >= 0 ? prefix.slice(0, containsIndex) : prefix).trim();
  return { value: description, repaired: description.length > 0 };
}

function isShortAllCaps(value) {
  const letters = value.replace(/[^A-Za-z]/g, "");
  const words = value.match(/[A-Za-z]+/g) ?? [];
  return letters.length >= 4 && letters === letters.toUpperCase() && words.length <= 6;
}

function looksLikeAdjacentContentBleed(value) {
  const pipes = (value.match(/\|/g) ?? []).length;
  return pipes >= 3
    || /\$\d+(?:\.\d{2})?[A-Za-z]/.test(value)
    || /[A-Za-z]\$\d/.test(value)
    || /\b(?:calories?|protein|carbs?|fat)\s+\d+[A-Z]?\b.*\b(?:protein|carbs?|fat)\s+\d+[A-Z]?\b/i.test(value)
    || /\b(?:vodka|schnapps|lillet|tequila|bourbon|rum|gin)\b[^.!?]{0,80}\|/i.test(value)
    || /\b(?:and|or|with|on|the|a|an|choice of)\s*$/i.test(value);
}

function looksLikeDescriptionCopy(value) {
  const words = value.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length < 3) return false;
  return /[,.;:()]/.test(value)
    || /\b(?:with|served|topped|made|fried|grilled|roasted|braised|stuffed|choice|sauce|dressing)\b/i.test(value);
}

function looksLikeDietaryTagRow(value) {
  const tokens = value.split("|").map((token) => token.trim()).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => /^[A-Z]{1,3}$/.test(token));
}

function looksLikeSiblingVariantTitle(value, itemName) {
  const stripVariant = (input) => normalizeRecoveredText(input)
    .replace(/\b(?:small|medium|large|half|whole|pounds?|lbs?|ounces?|oz|pieces?|pcs?|\d+)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const descriptionBase = stripVariant(value);
  return descriptionBase.length >= 4 && descriptionBase === stripVariant(itemName);
}
