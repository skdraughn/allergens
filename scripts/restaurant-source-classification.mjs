import { sharedParserTypes } from "./restaurant-adapters/shared-parser-types.mjs";

export const sourceFamilies = {
  toast: "toast",
  websiteMenuPdfs: "website-menu-pdfs",
  pdfAllergenMatrix: "pdf-allergen-matrix",
  nutritionix: "nutritionix",
  thompsonOrdering: "thompson-ordering",
  officialApi: "official-api",
  thirdPartyMenu: "third-party-menu",
  genericWebsite: "generic-website",
  manualReview: "manual-review",
};

export const officialAllergenStatuses = {
  extracted: "extracted",
  sourceFoundUnparsed: "source-found-unparsed",
  sourceUnreachable: "source-unreachable",
  notFound: "not-found",
  notApplicable: "not-applicable",
};

export const remediationBuckets = {
  none: "none",
  buildSharedParser: "build-shared-parser",
  configuredUrlDrinksOnly: "configured-url-drinks-only",
  configuredUrlNeedsRole: "configured-url-needs-role",
  configuredUrlProducedNoFood: "configured-url-produced-no-food",
  configuredUrlValidSpecialMenu: "configured-url-valid-special-menu",
  fixSourceUrl: "fix-source-url",
  discoverDocuments: "discover-documents",
  manualReview: "manual-review",
  noOfficialSource: "no-official-source",
};

export const configuredUrlRoles = {
  catering: "catering",
  drinksMenu: "drinks-menu",
  officialAllergen: "official-allergen",
  officialNutrition: "official-nutrition",
  primaryMenu: "primary-menu",
  specialFoodMenu: "special-food-menu",
  thirdPartyMenu: "third-party-menu",
  unknown: "unknown",
};

export const sourceFamilyRegistry = {
  [sourceFamilies.toast]: {
    parserProfile: "toast-menu",
    parserTypes: [sharedParserTypes.genericHtmlMenu],
    approvedMenuOnlyParser: true,
    followMenuDocuments: false,
    minMenuItemCount: 20,
    officialExtractor: "none",
  },
  [sourceFamilies.websiteMenuPdfs]: {
    parserProfile: "website-menu-pdfs",
    parserTypes: [sharedParserTypes.genericHtmlMenu, sharedParserTypes.genericPdfMenu],
    approvedMenuOnlyParser: true,
    followMenuDocuments: true,
    minMenuItemCount: 20,
    officialExtractor: "document-discovery",
  },
  [sourceFamilies.pdfAllergenMatrix]: {
    parserProfile: "pdf-allergen-matrix",
    parserTypes: [sharedParserTypes.pdfMatrix, sharedParserTypes.pdfIngredients],
    approvedMenuOnlyParser: false,
    followMenuDocuments: true,
    minMenuItemCount: 15,
    officialExtractor: "pdf-matrix",
  },
  [sourceFamilies.nutritionix]: {
    parserProfile: "nutritionix-official",
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
    approvedMenuOnlyParser: true,
    followMenuDocuments: false,
    minMenuItemCount: 20,
    officialExtractor: "nutritionix",
  },
  [sourceFamilies.thompsonOrdering]: {
    parserProfile: "thompson-ordering",
    parserTypes: [sharedParserTypes.genericHtmlMenu],
    approvedMenuOnlyParser: true,
    followMenuDocuments: false,
    minMenuItemCount: 20,
    officialExtractor: "none",
  },
  [sourceFamilies.officialApi]: {
    parserProfile: "official-api",
    parserTypes: [sharedParserTypes.officialApi, sharedParserTypes.productPage],
    approvedMenuOnlyParser: true,
    followMenuDocuments: false,
    minMenuItemCount: 20,
    officialExtractor: "api",
  },
  [sourceFamilies.thirdPartyMenu]: {
    parserProfile: "third-party-menu",
    parserTypes: [sharedParserTypes.genericHtmlMenu],
    approvedMenuOnlyParser: true,
    followMenuDocuments: false,
    minMenuItemCount: 20,
    officialExtractor: "none",
  },
  [sourceFamilies.genericWebsite]: {
    parserProfile: "generic-website",
    parserTypes: [sharedParserTypes.genericHtmlMenu],
    approvedMenuOnlyParser: true,
    followMenuDocuments: false,
    minMenuItemCount: 20,
    officialExtractor: "document-discovery",
  },
  [sourceFamilies.manualReview]: {
    parserProfile: "manual-review",
    parserTypes: [sharedParserTypes.genericHtmlMenu],
    approvedMenuOnlyParser: false,
    followMenuDocuments: false,
    minMenuItemCount: 20,
    officialExtractor: "manual-review",
  },
};

const hostProfileOverrides = [
  {
    hostPattern: /(^|\.)wearefoundingfarmers\.com$/i,
    brandKey: "founding-farmers",
    sourceFamily: sourceFamilies.websiteMenuPdfs,
    parserProfile: "founding-farmers-pdf-menu",
    parserTypes: [sharedParserTypes.genericHtmlMenu, sharedParserTypes.foundingFarmersPdfMenu],
    followMenuDocuments: true,
  },
  {
    hostPattern: /(^|\.)(?:order|www)\.toasttab\.com$/i,
    sourceFamily: sourceFamilies.toast,
    parserProfile: "toast-menu",
  },
  {
    hostPattern: /(^|\.)order\.thompsonrestaurants\.com$/i,
    sourceFamily: sourceFamilies.thompsonOrdering,
    parserProfile: "thompson-ordering",
  },
  {
    hostPattern: /(^|\.)nutritionix\.com$/i,
    sourceFamily: sourceFamilies.nutritionix,
    parserProfile: "nutritionix-official",
  },
];

const officialSourceTerms =
  /\b(?:allergens?|allergies|allergy|ingredients?|nutrition|nutritional|calculator|dietary|sensitivity|sensitivities)\b/i;
const compactOfficialSourceTerms =
  /(?:allergens?|allergies|allergy|ingredients?|nutrition|nutritional|nutritionalallergen|allergennutrition|nutritionalguide|naiguide|calculator|dietary|sensitivities|sensitivity)/i;
const officialAllergenSignalTerms = /(?:allergens?|allergies|allergy|sensitivities|sensitivity|naiguide)/i;
const includeDocumentTerms =
  /\b(?:allergen|allergies|allergy|ingredient|nutrition|nutritional|dietary|breakfast|brunch|lunch|dinner|dessert|menu|first\s*bake|first[-_]?bake|bakery)\b/i;
const excludeDocumentTerms =
  /\b(?:cocktail|wine|beer|beverage|drink|happy\s*hour|hh|catering|event|private\s*event|merch|gift\s*card|careers?|press|delivery|takeout|order\s*online)\b/i;
const compactIncludeDocumentTerms =
  /(?:allergen|allergies|allergy|ingredient|nutrition|nutritional|dietary|breakfast|brunch|lunch|dinner|lunchdinner|dessert|firstbake|bakery|menu)/i;
const compactExcludeDocumentTerms =
  /(?:cocktail|happyhour|hhmenu|wine|beer|beverage|catering|giftcard|privateevent|eventmenu)/i;
const configuredDrinksTerms =
  /\b(?:cocktail|wine|beer|beverage|drink|bar|spirits?|vodka|rum|gin|tequila|whiskey|bourbon|martini)\b/i;
const compactConfiguredDrinksTerms =
  /(?:cocktail|wine|beer|beverage|drink|spirits|vodka|rum|gin|tequila|whiskey|bourbon|martini)/i;
const configuredCateringTerms = /\b(?:catering|private\s*event|event\s*menu)\b/i;
const compactConfiguredCateringTerms = /(?:catering|privateevent|eventmenu)/i;
const configuredSpecialFoodTerms = /\b(?:happy\s*hour|hh|special|seasonal|limited|brunch|dessert|breakfast|lunch|dinner)\b/i;
const compactConfiguredSpecialFoodTerms =
  /(?:happyhour|hhmenu|special|seasonal|limited|brunch|dessert|breakfast|lunch|dinner|lunchdinner)/i;

export function sourceUrlsFor(source) {
  return normalizeConfiguredSourceUrls(source).map((entry) => entry.url).filter(Boolean);
}

export function normalizeConfiguredSourceUrls(source) {
  return [
    ...(source.menuUrls ?? []).map((entry) => normalizeSourceUrlEntry(entry, "menu")),
    ...(source.allergenUrls ?? []).map((entry) => normalizeSourceUrlEntry(entry, "allergen")),
    ...(source.apiUrls ?? []).map((entry) => normalizeSourceUrlEntry(entry, "api")),
  ].filter((entry) => entry.url);
}

export function normalizeSourceUrlEntry(entry, fallbackKind = "menu") {
  const value = typeof entry === "string" ? { url: entry } : entry ?? {};
  const url = cleanConfiguredUrl(value.url);
  const inferredKind = value.kind ?? fallbackKind;
  const role = value.role ?? inferConfiguredUrlRole(url, inferredKind);
  const kind = value.kind ?? normalizeConfiguredKindForRole(inferredKind, role);
  const warnings = configuredUrlWarnings({ ...value, url, kind, role });

  return {
    configured: true,
    expectedContent: value.expectedContent ?? inferExpectedContent(url),
    kind,
    role,
    trust: value.trust ?? "configured",
    url,
    warnings,
  };
}

function cleanConfiguredUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/(?:%22|%27|["'])+$/i, "")
    .replace(/^[<"'“”‘’]+|[>"'“”‘’]+$/g, "");
}

function normalizeConfiguredKindForRole(kind, role) {
  if (
    [
      configuredUrlRoles.officialAllergen,
      configuredUrlRoles.officialNutrition,
    ].includes(role)
  ) {
    return "allergen";
  }

  if (
    kind === "allergen" &&
    ![
      configuredUrlRoles.officialAllergen,
      configuredUrlRoles.officialNutrition,
    ].includes(role)
  ) {
    return "menu";
  }

  return kind;
}

export function inferConfiguredUrlRole(url, kind = "menu") {
  const haystack = normalizeDocumentText(url);
  const compactHaystack = normalizeCompactDocumentText(url);
  const intentHaystack = normalizeUrlIntentText(url);
  const compactIntentHaystack = normalizeCompactDocumentText(intentHaystack);

  if (kind === "api") {
    return configuredUrlRoles.officialNutrition;
  }

  if (/nutritionix\.com/i.test(url ?? "") || hasOfficialSourceTerms(haystack, compactHaystack)) {
    return officialAllergenSignalTerms.test(haystack) || officialAllergenSignalTerms.test(compactHaystack)
      ? configuredUrlRoles.officialAllergen
      : configuredUrlRoles.officialNutrition;
  }

  if (isToastOrderingUrl(url)) {
    return configuredUrlRoles.primaryMenu;
  }

  if (
    configuredCateringTerms.test(intentHaystack) ||
    compactConfiguredCateringTerms.test(compactIntentHaystack)
  ) {
    return configuredUrlRoles.catering;
  }

  if (
    configuredDrinksTerms.test(intentHaystack) ||
    compactConfiguredDrinksTerms.test(compactIntentHaystack)
  ) {
    return configuredUrlRoles.drinksMenu;
  }

  if (
    configuredSpecialFoodTerms.test(intentHaystack) ||
    compactConfiguredSpecialFoodTerms.test(compactIntentHaystack)
  ) {
    return configuredUrlRoles.specialFoodMenu;
  }

  if (/(ubereats|doordash|grubhub|ezcater|chownow|seamless)/i.test(url ?? "")) {
    return configuredUrlRoles.thirdPartyMenu;
  }

  if (/menu|order|restaurant|food/i.test(haystack)) {
    return configuredUrlRoles.primaryMenu;
  }

  return configuredUrlRoles.unknown;
}

function isToastOrderingUrl(url) {
  try {
    const parsed = new URL(url ?? "");
    return (
      /(^|\.)(?:order|www)\.toasttab\.com$/i.test(parsed.hostname) &&
      /\/(?:online|local\/order)\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function configuredUrlWarnings(entry) {
  const warnings = [];

  if (!entry?.url) {
    warnings.push("missing-url");
  }

  if (entry.role === configuredUrlRoles.unknown) {
    warnings.push("configured-url-needs-role");
  }

  if (entry.role === configuredUrlRoles.drinksMenu) {
    warnings.push("configured-url-drinks-menu");
  }

  if (entry.role === configuredUrlRoles.catering) {
    warnings.push("configured-url-catering");
  }

  if (entry.role === configuredUrlRoles.specialFoodMenu) {
    warnings.push("configured-url-special-food-menu");
  }

  return warnings;
}

export function configuredUrlAuditForSource(source) {
  const entries = normalizeConfiguredSourceUrls(source);

  return {
    configuredUrlRoles: entries.map((entry) => `${entry.kind}:${entry.role}:${entry.url}`),
    configuredUrlWarnings: entries.flatMap((entry) =>
      entry.warnings.map((warning) => `${warning}:${entry.url}`),
    ),
    nonFoodDocumentSuspected: entries.some((entry) =>
      [configuredUrlRoles.drinksMenu, configuredUrlRoles.catering].includes(entry.role),
    ),
  };
}

export function classifyRestaurantSource(source) {
  const urls = sourceUrlsFor(source);
  const hosts = unique(urls.map((url) => hostFromUrl(url)).filter(Boolean));
  const domainHost = normalizeHost(source.domain);
  const override = findHostOverride([domainHost, ...hosts]);
  const sourceFamily = override?.sourceFamily ?? inferSourceFamily(source, urls, hosts);
  const registryProfile = sourceFamilyRegistry[sourceFamily] ?? sourceFamilyRegistry[sourceFamilies.manualReview];
  const brandKey = source.brandKey ?? override?.brandKey ?? brandKeyForSource(source, hosts);
  const parserProfile =
    source.parserProfile ?? override?.parserProfile ?? registryProfile.parserProfile;
  const parserTypes = unique([
    ...(registryProfile.parserTypes ?? []),
    ...(override?.parserTypes ?? []),
    ...(source.parserTypes ?? []),
  ]);

  return {
    approvedMenuOnlyParser: registryProfile.approvedMenuOnlyParser,
    brandKey,
    followMenuDocuments: override?.followMenuDocuments ?? registryProfile.followMenuDocuments,
    minMenuItemCount: source.expectedSmallMenu ? 1 : registryProfile.minMenuItemCount,
    officialAllergenStatus: officialAllergenStatuses.notFound,
    officialExtractor: registryProfile.officialExtractor,
    parserProfile,
    parserTypes,
    sourceFamily,
    sourceProfile: `${sourceFamily}:${parserProfile}`,
  };
}

export function classifyDocumentLink(source, link) {
  const classification = classifyRestaurantSource(source);
  const label = typeof link === "string" ? "" : link.label ?? "";
  const url = typeof link === "string" ? link : link.url;
  const rawHaystack = `${url ?? ""} ${label}`;
  const haystack = normalizeDocumentText(rawHaystack);
  const compactHaystack = normalizeCompactDocumentText(rawHaystack);

  if (
    !url ||
    excludeDocumentTerms.test(haystack) ||
    compactExcludeDocumentTerms.test(compactHaystack)
  ) {
    return null;
  }

  const isFileDocument = /\.(?:pdf|xlsx?|csv)(?:[?#]|$)/i.test(url) || isGoogleDriveFileDocumentUrl(url);
  const isOfficialHtmlEmbed =
    hasOfficialSourceTerms(haystack, compactHaystack) &&
    /(?:allergen|allergies|allergy|ingredient|nutrition)/i.test(rawHaystack);

  if (!isFileDocument && !isOfficialHtmlEmbed) {
    return null;
  }

  if (!includeDocumentTerms.test(haystack) && !compactIncludeDocumentTerms.test(compactHaystack)) {
    return null;
  }

  if (hasOfficialSourceTerms(haystack, compactHaystack)) {
    return "allergen";
  }

  return classification.followMenuDocuments || isTrustedFoodMenuDocument(source, url, haystack)
    ? "menu"
    : null;
}

function isGoogleDriveFileDocumentUrl(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.replace(/^www\./i, "");

  if (!/^(?:drive|docs)\.google\.com$/i.test(host)) {
    return false;
  }

  return /\/file\/d\/[^/?#]+/i.test(parsed.pathname) || parsed.searchParams.has("id");
}

function isTrustedFoodMenuDocument(source, url, haystack) {
  if (!/\b(?:breakfast|brunch|lunch|dinner|dessert|food|menu|bakery)\b/i.test(haystack)) {
    return false;
  }

  const sourceHosts = new Set(
    [normalizeHost(source.domain), ...sourceUrlsFor(source).map((sourceUrl) => hostFromUrl(sourceUrl))]
      .filter(Boolean)
      .map((host) => host.replace(/^www\./, "")),
  );
  const linkHost = hostFromUrl(url)?.replace(/^www\./, "");

  return (
    !!linkHost &&
    (sourceHosts.has(linkHost) ||
      /(?:^|\.)getbento\.com$/i.test(linkHost) ||
      /(?:^|\.)static1\.squarespace\.com$/i.test(linkHost) ||
      /(?:^|\.)wixstatic\.com$/i.test(linkHost) ||
      /^qrcgcustomers\.s3[-.][a-z0-9-]+\.amazonaws\.com$/i.test(linkHost) ||
      /^img1\.wsimg\.com$/i.test(linkHost))
  );
}

export function hasConfiguredOfficialSource(source) {
  return normalizeConfiguredSourceUrls(source).some((entry) => isConfiguredOfficialSourceEntry(entry));
}

export function isConfiguredOfficialSourceEntry(entry) {
  if (!entry?.url) {
    return false;
  }

  if (entry.kind === "api") {
    return true;
  }

  if (
    entry.role === configuredUrlRoles.officialAllergen ||
    entry.role === configuredUrlRoles.officialNutrition
  ) {
    return true;
  }

  return hasOfficialSourceTerms(entry.url);
}

export function officialItemCountForRestaurant(restaurant) {
  return (restaurant?.items ?? []).filter((item) => isOfficialAllergenItem(item)).length;
}

export function officialAllergenDistributionSummary(restaurant) {
  const officialItems = (restaurant?.items ?? []).filter((item) => isOfficialAllergenItem(item));

  if (officialItems.length < 20) {
    return {
      officialItemCount: officialItems.length,
      likelyDirectSmear: false,
      supportedStrictDirectMatrix: false,
      supportedBroadCrossContact: false,
      suspiciousBroadCrossContact: false,
      direct: emptyAllergenDistribution(),
      crossContact: emptyAllergenDistribution(),
    };
  }

  const direct = allergenSetDistribution(officialItems, (item) => item?.allergens ?? []);
  const crossContact = allergenSetDistribution(officialItems, (item) => item?.mayContain ?? []);
  const sourceEvidenceText = officialItems
    .flatMap((item) => [
      item?.description,
      item?.sourceType,
      item?.sourceKind,
      item?.sourceUrl,
      ...(item?.sourceUrls ?? []),
      ...(item?.evidence ?? []).flatMap((entry) => [entry?.sourceKind, entry?.sourceUrl, entry?.text]),
    ])
    .filter(Boolean)
    .join(" ");
  const weakDirectEvidence = hasWeakDirectAllergenEvidence(sourceEvidenceText);
  const strongRowLevelEvidence = hasStrongRowLevelAllergenEvidence(sourceEvidenceText);
  const strictDirectMatrixSupported = hasSupportedStrictDirectMatrixEvidence(restaurant, sourceEvidenceText);
  const crossContactSupported = hasOfficialCrossContactEvidence(sourceEvidenceText);
  const likelyDirectSmear = Boolean(
    weakDirectEvidence &&
      !strictDirectMatrixSupported &&
      direct.dominantSet.length >= 5 &&
      direct.dominantCount >= 20 &&
      direct.dominantRatio >= 0.72 &&
      direct.averageAllergenCount >= 4.5,
  );
  const broadCrossContact = Boolean(
    crossContact.dominantSet.length >= 5 &&
      crossContact.dominantCount >= 20 &&
      crossContact.dominantRatio >= 0.5,
  );

  return {
    officialItemCount: officialItems.length,
    likelyDirectSmear,
    supportedStrictDirectMatrix: Boolean(
      !likelyDirectSmear &&
        strictDirectMatrixSupported &&
        strongRowLevelEvidence &&
        direct.itemWithAnyCount >= 20 &&
        direct.averageAllergenCount >= 4.5,
    ),
    supportedBroadCrossContact: broadCrossContact && crossContactSupported,
    suspiciousBroadCrossContact: broadCrossContact && !crossContactSupported,
    direct,
    crossContact,
  };
}

export function officialAllergenSmearSummary(restaurant) {
  const distribution = officialAllergenDistributionSummary(restaurant);

  return {
    suspected: distribution.likelyDirectSmear,
    averageAllergenCount: distribution.direct.averageAllergenCount,
    dominantAllergenCount: distribution.direct.dominantSet.length,
    dominantCount: distribution.direct.dominantCount,
    dominantRatio: distribution.direct.dominantRatio,
    dominantSet: distribution.direct.dominantSet,
    officialItemCount: distribution.officialItemCount,
  };
}

function allergenSetDistribution(items, allergenGetter) {
  const countsBySet = new Map();
  const countHistogram = {};
  let allergenAssignmentCount = 0;
  let itemWithAnyCount = 0;

  for (const item of items) {
    const allergens = unique(allergenGetter(item)).sort();
    allergenAssignmentCount += allergens.length;
    countHistogram[allergens.length] = (countHistogram[allergens.length] ?? 0) + 1;

    if (allergens.length > 0) {
      itemWithAnyCount += 1;
    }

    const key = allergens.join("|");
    const existing = countsBySet.get(key) ?? { allergens, count: 0 };
    existing.count += 1;
    countsBySet.set(key, existing);
  }

  const dominant = Array.from(countsBySet.values()).sort((left, right) => right.count - left.count)[0];

  return {
    averageAllergenCount: items.length > 0 ? allergenAssignmentCount / items.length : 0,
    countHistogram,
    dominantCount: dominant?.count ?? 0,
    dominantRatio: dominant && items.length > 0 ? dominant.count / items.length : 0,
    dominantSet: dominant?.allergens ?? [],
    itemWithAnyCount,
    itemWithAnyRatio: items.length > 0 ? itemWithAnyCount / items.length : 0,
  };
}

function emptyAllergenDistribution() {
  return {
    averageAllergenCount: 0,
    countHistogram: {},
    dominantCount: 0,
    dominantRatio: 0,
    dominantSet: [],
    itemWithAnyCount: 0,
    itemWithAnyRatio: 0,
  };
}

function hasWeakDirectAllergenEvidence(value) {
  const text = String(value ?? "");

  return (
    /nutritionix|allergenTags|allergenFree|online nutrition (?:and allergen )?guide|official-api/i.test(text) &&
    !hasStrongRowLevelAllergenEvidence(text)
  );
}

function hasStrongRowLevelAllergenEvidence(value) {
  return /\b(?:pdf-matrix|allergen matrix|allergen guide row parsed|row parsed|marker glyph|glyphs|direct marker|x marker|contains marker|table cell|spreadsheet|official .* row)\b/i.test(
    String(value ?? ""),
  );
}

function hasOfficialCrossContactEvidence(value) {
  return /\b(?:cross[-\s]?contact|cross[-\s]?contamination|come into contact|shared (?:fryer|equipment|prep|preparation)|preparation risk|risk of cross|shared oil|cooking method|fried prep|marker glyph|glyphs|cross-contact review is retained)\b/i.test(
    String(value ?? ""),
  );
}

function hasSupportedStrictDirectMatrixEvidence(restaurant, value) {
  const text = String(value ?? "");

  return (
    restaurant?.id === "pf-changs" &&
    /\bpfchangs\.com\/nutrition\/allergens-to-go\b/i.test(text) &&
    /\bOfficial P\.F\. Chang's allergen matrix row\b/i.test(text)
  );
}

export function officialStatusForSource({ source, restaurant, sourceResults = [] }) {
  const officialItemCount = officialItemCountForRestaurant(restaurant);
  const hasOfficialSource = hasConfiguredOfficialSource(source);
  const hasConfiguredAllergenSource = hasConfiguredOfficialAllergenSource(source);

  if (officialItemCount > 0 && hasSufficientOfficialExtraction({ restaurant, officialItemCount, hasOfficialSource })) {
    return officialAllergenStatuses.extracted;
  }

  const configuredOfficialUrls = new Set(
    normalizeConfiguredSourceUrls(source)
      .filter((entry) => isConfiguredOfficialSourceEntry(entry))
      .map((entry) => entry.url),
  );
  const officialAttempts = sourceResults.filter((result) => {
    const text = `${result?.url ?? ""} ${result?.finalUrl ?? ""} ${result?.role ?? ""} ${result?.label ?? ""}`;

    return (
      configuredOfficialUrls.has(result?.url) ||
      configuredOfficialUrls.has(result?.finalUrl) ||
      hasOfficialSourceTerms(text)
    );
  });
  const officialAllergenAttempts = officialAttempts.filter((result) => {
    const text = `${result?.url ?? ""} ${result?.finalUrl ?? ""} ${result?.role ?? ""} ${result?.label ?? ""}`;

    if (result?.role === configuredUrlRoles.officialNutrition) {
      return false;
    }

    if (isNutritionixAllergenProbeOnly(result)) {
      return false;
    }

    if (result?.ok === true && result?.officialAllergenContentSignal === false) {
      return false;
    }

    return hasOfficialAllergenSourceTerms(text);
  });
  const hasConfiguredAllergenAttempt =
    !sourceResults.length ||
    officialAllergenAttempts.some((result) => {
      const urls = [result?.url, result?.finalUrl].filter(Boolean);
      return urls.some((url) => configuredOfficialUrls.has(url));
    });

  if (
    officialAllergenAttempts.length > 0 &&
    officialAllergenAttempts.every((result) => result.ok === false)
  ) {
    return officialAllergenStatuses.sourceUnreachable;
  }

  if (officialAllergenAttempts.length > 0 || (hasConfiguredAllergenSource && hasConfiguredAllergenAttempt)) {
    return officialAllergenStatuses.sourceFoundUnparsed;
  }

  return officialAllergenStatuses.notFound;
}

export function hasConfiguredOfficialAllergenSource(source) {
  return normalizeConfiguredSourceUrls(source).some((entry) => {
    if (!isConfiguredOfficialSourceEntry(entry)) {
      return false;
    }

    if (entry.kind === "api") {
      return true;
    }

    if (entry.role === configuredUrlRoles.officialAllergen) {
      return true;
    }

    if (entry.role === configuredUrlRoles.officialNutrition) {
      return false;
    }

    return hasOfficialAllergenSourceTerms(`${entry.url ?? ""} ${entry.role ?? ""}`);
  });
}

function hasOfficialAllergenSourceTerms(value) {
  const text = normalizeDocumentText(value);
  const compactText = normalizeCompactDocumentText(value);

  return (
    /\b(?:allergens?|allergies|allergy|dietary|sensitivity|sensitivities)\b/i.test(text) ||
    /(?:allergens?|allergies|allergy|dietary|sensitivities|sensitivity|naiguide)/i.test(
      compactText,
    )
  );
}

function isNutritionixAllergenProbeOnly(result) {
  const text = `${result?.url ?? ""} ${result?.finalUrl ?? ""} ${result?.role ?? ""}`.toLowerCase();

  return (
    text.includes("nutritionix.com/") &&
    text.includes("allergentags") &&
    !text.includes("/special-diets/")
  );
}

function hasSufficientOfficialExtraction({ restaurant, officialItemCount, hasOfficialSource }) {
  if (officialItemCount <= 0) {
    return false;
  }

  if (officialAllergenSmearSummary(restaurant).suspected) {
    return false;
  }

  if (!hasOfficialSource) {
    return true;
  }

  if (officialItemCount < 5) {
    return false;
  }

  const totalItemCount = restaurant?.items?.length ?? 0;

  if (totalItemCount < 20) {
    return true;
  }

  const minimumUsefulCount = Math.min(10, Math.ceil(totalItemCount * 0.2));

  return officialItemCount >= minimumUsefulCount;
}

export function remediationBucketForStatus(status, { restaurant, source }) {
  if (status === officialAllergenStatuses.extracted) {
    return remediationBuckets.none;
  }

  if (status === officialAllergenStatuses.sourceUnreachable) {
    return remediationBuckets.fixSourceUrl;
  }

  if (status === officialAllergenStatuses.sourceFoundUnparsed) {
    return classifyRestaurantSource(source).followMenuDocuments
      ? remediationBuckets.discoverDocuments
      : remediationBuckets.buildSharedParser;
  }

  if (!restaurant || (restaurant.items?.length ?? 0) === 0) {
    return remediationBuckets.manualReview;
  }

  return remediationBuckets.noOfficialSource;
}

export function buildSourceAuditRows({ restaurantSources, repository, sourceResultsById = new Map() }) {
  const restaurantById = new Map(
    (repository?.restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]),
  );

  return restaurantSources.map((source) => {
    const restaurant = restaurantById.get(source.id);
    const classification = classifyRestaurantSource(source);
    const sourceResults = sourceResultsById.get(source.id) ?? [];
    const officialAllergenStatus =
      !restaurant && sourceResults.length === 0
        ? officialAllergenStatuses.notApplicable
        : sourceResults.length === 0 && restaurant?.officialAllergenStatus
          ? restaurant.officialAllergenStatus
          : officialStatusForSource({ source, restaurant, sourceResults });
    const menuItemCount = restaurant?.items?.length ?? 0;
    const officialItemCount = officialItemCountForRestaurant(restaurant);
    const failedUrls = sourceResults.filter((result) => result.ok === false).map((result) => result.url);
    const configuredUrlAudit = configuredUrlAuditForSource(source);
    const discoveredDocuments = sourceResults
      .flatMap((result) => result.discoveredDocuments ?? [])
      .filter(Boolean);
    const discardedItemCount = restaurant?.sourceStatus?.discardedItemCount ?? "";
    const extractedFoodItemCount = menuItemCount;

    return {
      id: source.id,
      name: source.name,
      brandKey: classification.brandKey,
      sourceFamily: classification.sourceFamily,
      parserProfile: classification.parserProfile,
      officialAllergenStatus,
      remediationBucket: remediationBucketForStatus(officialAllergenStatus, { restaurant, source }),
      domain: source.domain ?? hostFromUrl(sourceUrlsFor(source)[0]) ?? "",
      type: source.type ?? "",
      menuItemCount,
      officialItemCount,
      configuredMenuUrlCount: source.menuUrls?.length ?? 0,
      configuredAllergenUrlCount: source.allergenUrls?.length ?? 0,
      configuredApiUrlCount: source.apiUrls?.length ?? 0,
      configuredUrlRoles: configuredUrlAudit.configuredUrlRoles.join(" | "),
      configuredUrlWarnings: configuredUrlAudit.configuredUrlWarnings.join(" | "),
      nonFoodDocumentSuspected: configuredUrlAudit.nonFoodDocumentSuspected,
      extractedFoodItemCount,
      discardedItemCount,
      failedUrlCount: failedUrls.length,
      failedUrls: failedUrls.join(" | "),
      discoveredDocumentCount: discoveredDocuments.length,
      discoveredDocuments: discoveredDocuments.join(" | "),
      sourceUrls: sourceUrlsFor(source).join(" | "),
    };
  });
}

function inferSourceFamily(source, urls, hosts) {
  const allUrls = urls.join(" ").toLowerCase();
  const allHosts = hosts.join(" ").toLowerCase();

  if (/toasttab\.com/.test(allHosts)) {
    return sourceFamilies.toast;
  }

  if (/thompsonrestaurants\.com/.test(allHosts)) {
    return sourceFamilies.thompsonOrdering;
  }

  if (/nutritionix\.com/.test(allHosts)) {
    return sourceFamilies.nutritionix;
  }

  if (/(ubereats|doordash|grubhub|ezcater|chownow|seamless)\./.test(allHosts)) {
    return sourceFamilies.thirdPartyMenu;
  }

  if (/\b(?:api|json|graphql|calculator)\b/.test(allUrls)) {
    return sourceFamilies.officialApi;
  }

  if (/\.(?:pdf|xlsx?|csv)(?:[?#]|$)/i.test(allUrls) && hasOfficialSourceTerms(allUrls)) {
    return sourceFamilies.pdfAllergenMatrix;
  }

  if (/\.(?:pdf|xlsx?|csv)(?:[?#]|$)/i.test(allUrls)) {
    return sourceFamilies.websiteMenuPdfs;
  }

  return sourceFamilies.genericWebsite;
}

function inferExpectedContent(url) {
  if (/\.(?:pdf)(?:[?#]|$)/i.test(url ?? "")) {
    return "pdf";
  }

  if (/\.(?:xlsx?)(?:[?#]|$)/i.test(url ?? "")) {
    return "spreadsheet";
  }

  if (/\.(?:csv)(?:[?#]|$)/i.test(url ?? "")) {
    return "csv";
  }

  if (/\b(?:api|json|graphql)\b/i.test(url ?? "")) {
    return "json";
  }

  return "html";
}

function findHostOverride(hosts) {
  return hostProfileOverrides.find((profile) =>
    hosts.some((host) => host && profile.hostPattern.test(host)),
  );
}

function brandKeyForSource(source, hosts) {
  if (source.domain) {
    return normalizeBrandKey(source.domain.replace(/^www\./i, "").split(".")[0]);
  }

  const firstHost = hosts.find(Boolean);

  if (firstHost) {
    const parts = firstHost.replace(/^www\./i, "").split(".");
    const base = parts.length > 2 ? parts.at(-2) : parts[0];
    return normalizeBrandKey(base);
  }

  return normalizeBrandKey(source.name ?? source.id);
}

function hostFromUrl(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function normalizeHost(host) {
  return String(host ?? "").toLowerCase().replace(/^www\./, "");
}

function normalizeBrandKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDocumentText(value) {
  return decodeDocumentText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCompactDocumentText(value) {
  return decodeDocumentText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeUrlIntentText(value) {
  const decoded = decodeDocumentText(value);

  try {
    const parsed = new URL(decoded);
    return normalizeDocumentText(`${parsed.pathname} ${parsed.search}`);
  } catch {
    return normalizeDocumentText(decoded);
  }
}

function hasOfficialSourceTerms(value, compactValue = normalizeCompactDocumentText(value)) {
  return officialSourceTerms.test(normalizeDocumentText(value)) || compactOfficialSourceTerms.test(compactValue);
}

function decodeDocumentText(value) {
  const text = String(value ?? "");

  try {
    return decodeURIComponent(text);
  } catch {
    return text.replace(/%20/g, " ");
  }
}

function isOfficialAllergenItem(item) {
  if (isOfficialAllergenLegendItem(item)) {
    return false;
  }

  return /official/i.test(item?.allergenSourceType ?? "") || item?.officialSource === true;
}

function isOfficialAllergenLegendItem(item) {
  const text = `${item?.name ?? ""} ${item?.description ?? ""}`;

  return /\b(?:all items are listed|x denotes|contains allergens|allergen\/vegetarian\/vegan|effective:\s*\d|unless otherwise noted|legend)\b/i.test(
    text,
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
