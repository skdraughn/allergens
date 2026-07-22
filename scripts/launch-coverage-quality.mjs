import {
  buildSourceAuditRows,
  officialAllergenDistributionSummary,
  officialAllergenStatuses,
  officialItemCountForRestaurant,
  remediationBuckets,
} from "./restaurant-source-classification.mjs";
import {
  categoryCollapseSummary,
  classifyMenuItemRow,
  isSourceBoilerplateDescription,
  isSourceBoilerplateSummary,
  officialEvidenceClassification,
  textBleedReasons,
} from "./menu-item-quality.mjs";

export const launchQualityStatuses = {
  noSource: "no-source",
  published: "published",
  quarantined: "quarantined",
  reviewNeeded: "review-needed",
};

export const launchRemediationBuckets = {
  accommodationPolicyOnly: "accommodation-policy-only",
  badSource: "bad-source",
  manualReviewNeeded: "manual-review-needed",
  needsOfficialAllergenProfile: "needs-official-allergen-profile",
  needsSharedParserFix: "needs-shared-parser-fix",
  noMenuFound: "no-menu-found",
  sourceFoundUnparsed: "source-found-unparsed",
};

const suspiciousNamePatterns = [
  /\b(?:privacy policy|terms of use|cookie settings|copyright|accessibility|careers?|contact us)\b/i,
  /\b(?:sign in|log in|create account|checkout|cart|gift card|newsletter|subscribe)\b/i,
  /\b(?:powered by|all rights reserved|do not sell|personal information|accept cookies)\b/i,
  /\b(?:calorie needs vary|general nutrition advice|daily values|2,000 calories)\b/i,
  /\b(?:contains raw or undercooked|please inform|please notify|cross[- ]?contact)\b/i,
  /^x\s+contains\b.+/i,
  /\b(?:operational surcharge|join our team)\b/i,
  /\b(?:facebook|instagram|twitter|tiktok|youtube)\b/i,
  /^\$?\s*add\b/i,
  /^\$?\s*sub\b/i,
  /^extra\s+(?:american|avocado|bacon|black beans|blue cheese|cheese|chicken|crab|dressing|honey|lobster|mayo|mayonnaise|ranch|salmon|sauce|shrimp|tartar|tuna|turkey|vegetables?)\b/i,
  /^subscribe to .+ alerts?$/i,
  /^please subscribe to our newsletter$/i,
  /^newsletter sign up$/i,
  /^take out$/i,
  /^kindly note that menu items and prices may vary\b/i,
  /^(?:annual events|bid member resources|bid programs & publications|bidness newsletter|business & office directory|calendar|commercial activity|georgetown dc faqs|guides|office space in georgetown|sidewalk extensions & streateries|subscribe to weekly newsletter|visit)$/i,
  /^ben & jerry'?s insider$/i,
  /^(?:book now|payment|your order)$/i,
  /^(?:making a difference|shared success|thoughtful ingredients)$/i,
  /^our mission$/i,
  /^event reservation$/i,
  /^make a reservation powered by opentable$/i,
  /^request a quote$/i,
  /^(?:bus & tour accommodations|fresh cuisine & friendly service since|fresh seafood restaurant|healthy options|eat healthy)$/i,
  /^(?:military discount|senior discount|mlietz)$/i,
  /^(?:join our team|private dining room|private room|soccer page)$/i,
  /^(?:girls'? night out|kitchen \+ kocktails catering by kevin kelley|latest news|subscribe to enewsletter)$/i,
  /^(?:important:?|overview|share this:?|submit an order|easy food ideas for group events and potlucks)$/i,
  /^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*(?:am|pm)$/i,
  /^archives$/i,
  /^served from \d{1,2}\s*a\.?m\b/i,
  /^a curated selection of\b/i,
  /^(?:executive pastry chef|sous chef|no show\s*&\s*cancellation policy|served with breakfast potatoes)$/i,
  /\b\d{1,3}[A-Z][a-z]/,
  /^join us for\b/i,
  /^what[’']s for dinner\??$/i,
  /^groups?\s*&?\s*private dining$/i,
  /^.+\bcatering gallery$/i,
  /^(?:custom menus,?\s+seamless service|cateringmexicanfusion eats)$/i,
  /^(?:remove logo|remove powered by branding|remove our branding|share via social media)$/i,
  /^(?:ability to purchase tickets|customize your eventbrite app|design and animation|display events on your website|display multiple events|google map integration|highly customizable|multiple feeds|promote and share your events|sell an unlimited number of tickets through your site|showcase the next event|unlimited events|unlimited news items)$/i,
  /^(?:advanced transitions|autoplay videos|custom arrow style|custom slide speed|full customization)$/i,
  /^(?:advertising|back issues|best of nova|contributing writer|dawn klavon|in this issue|internships|magazine|most influential|plaques|realtor client gift subscriptions|submit an event|things to do|top high schools|travel|wellness|writer[’']s guidelines)$/i,
  /^dos\s+(?:xx|equis)$/i,
  /^private parties?(?:\s*&\s*catering|\s+and\s+catering)?$/i,
  /^top it off\b/i,
  /^gluten-friendly yes$/i,
  /^ap pizza kit!?$/i,
  /^house-made sodas$/i,
  /^ice cream catering$/i,
  /^wheat\s*&\s*fruit beers$/i,
  /\b(?:abv|pilsner|lager|whitbier|bourbon|whiskey|vodka|martini|tequila|mezcal|rum|gin|pinot|cabernet|chardonnay|rosé|rosso|riesling)\b/i,
  /^(?:amrut|anarkali|basil hayden|black label|blue moon|birrificio|cir[òo]|kerner|woodpecker|‘?a rina)\b/i,
  /^[A-Z][a-z]+\.?\s+Intense aromas of\b/i,
  /^today'?s hours$/i,
  /^please note that last call\b/i,
  /^(?:cocktails?|wines?|beers?|spirits?|our drinks|hot\s*&\s*cold drinks|drinks?|beverages?)$/i,
  /^\$\d+\s+(?:beers?|cocktails?|wines?)$/i,
  /^served in an award winning\b.*\btortilla$/i,
  /^(?:best restaurants?|best of loudoun|learn more|press|awards?|media|testimonials?)$/i,
  /^(?:dc restaurant openings|dining reports?|openings|stores?|stores\s+\d+|story of .+|sizzlin['’]?\s+szechuan story of q)\b/i,
  /\b(?:contributed to this report|courtesy oyster oyster|influencer[’']s fever dream|cool ranch onion rings|listen to vinyl)\b/i,
  /^(?:followinstagramfacebook|follow instagram facebook|where to find us|avoid the wait and pre[- ]?order)$/i,
  /^(?:menu coming soon|coming soon|opening summer \d{4}|we will see you all very soon)$/i,
  /^.+\s+-\s+(?:alexandria|arlington|ashburn|bethesda|dc|fairfax|falls church|herndon|mclean|reston|tysons|vienna)$/i,
  /\b(?:soda pop|peach tea|less sweet|lemonade|topo chico)\b/i,
  /\b(?:this online store is for takeout only|online store accepts same[- ]?day|limited capacity for takeout)\b/i,
  /^\d{3,5}\s+.+\bWashington\b.*\$\$?\$?\$?\s+·\s+/i,
  /\bfrom the restaurant'?s current official menu or allergen source\b/i,
  /^add toppings$/i,
  /^we serve\b/i,
  /^\(?\d{2,4}(?:\s*\/\s*\d{2,4})?\s*cal\)?$/i,
  /^\$\d+(?:\.\d{2})?\s*[•\-–]\s*\d{1,4}\s*cal$/i,
  /^\d{3,4}\s*cal$/i,
  /^[a-z][a-z ,.'’-]+\.\s*\d{1,3}(?:,\d{3})?\s*cal$/,
  /^\d{3,5}\s+.+\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|boulevard|blvd\.?|plaza|metro plaza|town square)\b/i,
  /^[A-Z][A-Za-z .'-]+,\s*(?:A[LKZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEHINOPST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/i,
  /\bbest\s+(?:breakfast|brunch|lunch|dinner)\b.*\bnear\b/i,
  /^(?:breakfast\/brunch|lunch\s*&\s*dinner|business owners)$/i,
  /^(?:breakfast\s*-\s*a la carte|first bake cafe|buffet brunch|weekday happy hour|summer cocktails|catering)$/i,
  /^(?:boards|salads?\s*\+?\s*soups?|small plates to share|wood[- ]?fired pizzas|customer favorites:?|operating hours|oPERATING HOURS|sans spirits|petite mains|signature cocktails|fusion plates|light\s*&\s*zesty)$/i,
  /^(?:first|second|third|two courses|three courses|adiciones?\s*&\s*maridajes)$/i,
  /^(?:all dishes available a la carte|fines herbes emulsion|olive oil\s*\(v\)|salanova lettuce\b|rhubarb,?\s+cardamom\b)$/i,
  /^(?:gluten-free|halal food|keto(?:\s*\(low-carb\))?|paleo|pescatarian|vegetarian|vegan|whole30)$/i,
  /^carryout is available\b/i,
  /^ages?\s+\d+\s*[–-]\s*\d+\s+for\b/i,
  /^\d+\s+for$/i,
  /\bprivate dining room\b/i,
  /^https?:\/\//i,
  /^[a-z0-9-]+\.(?:com|net|org|co)$/i,
  /^[a-f0-9]{24}\b/i,
  /^[a-f0-9]{12,}\s+.+\.(?:avif|webp|jpe?g|png)$/i,
  /^(?:acid,?\s+natural|aluminum phosphate,?)$/i,
];

const hardSuspiciousNamePatterns = [
  /^\.+\s*\d*\s*/i,
  /^\/\s*/,
  /^jump to (?:footer|main content|navigation) links$/i,
  /^(?:accessible rooms|capital one center|capital one hall|capital one park)$/i,
  /^(?:a day on the line|chef de cuisine|dining at .+|history and inspiration|q&a with chef .+|sign-up)$/i,
  /^(?:large share|small share|snacks|sweet|apps\/sharables|antipasti|hot beverages|coffee\/tea)$/i,
  /^(?:american|age|blended|canadian|highlands|irish|islands|islay|japanese|junmai)$/i,
  /^(?:barcelona reston|brookline|cambridge|cathedral heights|charlotte|dallas|delray beach|denver|fairfield|houston|inman park|minneapolis|nashville|new haven|philadelphia|pittsburgh|raleigh)$/i,
  /^\$?\d+\s+bottles?\s+of\b/i,
  /\b(?:billecart|champagne|brut ros[ée]|veuve clicquot|dassai|denshin|campus oaks|cantina del taburno)\b/i,
  /^(?:disposable bag|extra ginger(?:\s+(?:small|large))?)$/i,
  /^(?:bottomless martinis|ballantine'?s)$/i,
  /^see our menu!?$/i,
  /^crave it\?\s*get it$/i,
  /^a modern take on\b/i,
  /^fresh .+\bin falls church$/i,
  /^ala\s+\d+\b/i,
  /^all pasta dishes\b/i,
  /^‡?\s*pizzas available gluten free$/i,
  /^a la carte signature tacos available$/i,
  /^boxed meals to-go$/i,
  /^carryout is available\b/i,
  /^amuse bouche$/i,
  /^first bouche$/i,
  /^cappuccino:$/i,
  /^espresso:$/i,
  /^french press:$/i,
  /^\+\s*(?:bacon|sausage)\b/i,
  /^ask your server\b/i,
  /^(?:beefeater|boodles)\s+london dry$/i,
  /^both rice and naan$/i,
  /^(?:beef|chicken|grilled|bone-in|eat|offers|elevated dining|local happenings|around the world|lowland|anejo)$/i,
  /^tossed with\b/i,
  /^ala\b/i,
  /^app\s+[A-Z]/,
  /^\(omit sauce\)$/i,
  /^broiled,?\s+added to any entree$/i,
  /^chandon spritz\b/i,
  /\b(?:bichot|meursault)\b/i,
  /^(?:darjeeling|dragonwell|earl grey)\s*\((?:black|green)\)$/i,
  /^(?:junmai daiginjo|junmai ginjo|men\s*&\s*gohan)$/i,
  /^\(no soup\)$/i,
  /^(?:noreen qamar|sarah winicki|sasha shaheen|victoria palucho)$/i,
  /^(?:analytics|customer reviews|groups?\s*&\s*celebrations|atmosphere|book a table|about us)$/i,
  /^(?:d\.?c\.?\s+reservation|reservation|reservations?)$/i,
  /^(?:cooking guide|stores?\s*\d*|openings?|dining report|this .+ serves the best .+ in d\.?c\.?)$/i,
  /^\d+\.\s+(?:add|create|make sure)\b/i,
  /^(?:taco bamba chef victor albisu|taco bamba founder victor albisu|the surprising success story behind taco bamba creator victor albisu)\b/i,
  /^scandinavian cuisine,\s+\w+\s+\d{1,2},?$/i,
  /^(?:limited|upcoming)$/i,
  /^\d+g\s+Protein\b/i,
  /^hours?(?:tues|mon|wed|thurs|fri|sat|sun)/i,
  /^how many pizzas should you order\??$/i,
  /^(?:we put the finishing touches|you can change or add to an existing order)\b/i,
  /^(?:non-alcoholic|peroni|stracci limoncello|union craft brewing|valpolicella|vermentino)\b/i,
  /^red(?:\s+(?:blend|wine|rosso|sangria|cabernet|pinot|zinfandel|merlot|malbec|rioja|nebbiolo|chianti|bordeaux|by the glass|bottle))?$/i,
  /^(?:a rustic specialty made|boneless chicken,|buttery crisp dosa stuffed|chicken kofta simmered|chickpeas served with|crispy all-purpose flour bread|daal ghost\s+-|festive dining experiences|garlic toast topped|indian cheese, house pickle flavor)/i,
  /^collect visitor emails$/i,
  /^(?:customize thumbnail images|easily add videos|highly responsive support|looping videos)$/i,
  /^asharrprivate$/i,
  /^\d+\s*for\s*\$\d+\b/i,
  /^all-you-can-enjoy\b/i,
  /^(?:with bread|dogon)$/i,
];

const suspiciousCategoryPatterns = [
  /\b(?:events?|private dining|merch|gift cards?)\b/i,
  /^business hours telephone$/i,
  /^frequently asked questions$/i,
  /^menu faq[’']?s?$/i,
  /^(?:how we do business|issues we care about|values)$/i,
  /^sign up for blog via email$/i,
  /^(?:cards rewards subscribe|parties and event booking|events catering)$/i,
  /^(?:low\s*&\s*no|zero proof|mocktails?)$/i,
];

export function buildLaunchQualityReport({
  repository,
  run,
  sourceSets,
  targets,
  previousRepository,
} = {}) {
  const sourceResultsById = sourceResultsByRestaurantId(run);
  const sourceAuditRows = buildSourceAuditRows({
    restaurantSources: sourceSets ?? [],
    repository,
    sourceResultsById,
  });
  const auditById = new Map(sourceAuditRows.map((row) => [row.id, row]));
  const targetById = new Map((targets ?? []).map((target) => [target.id, target]));
  const previousById = new Map(
    (previousRepository?.restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]),
  );
  const rows = (repository?.restaurants ?? []).map((restaurant) =>
    evaluateRestaurantLaunchQuality({
      auditRow: auditById.get(restaurant.id),
      previousRestaurant: previousById.get(restaurant.id),
      restaurant,
      sourceResults: sourceResultsById.get(restaurant.id) ?? [],
      target: targetById.get(restaurant.id),
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: summarizeLaunchQualityRows(rows),
    rows,
    sourceAuditRows,
  };
}

export function evaluateRestaurantLaunchQuality({
  auditRow,
  previousRestaurant,
  restaurant,
  sourceResults = [],
  target,
} = {}) {
  const itemCount = restaurant?.items?.length ?? 0;
  const officialItemCount = officialItemCountForRestaurant(restaurant);
  const officialAllergenStatus =
    restaurant?.officialAllergenStatus ??
    auditRow?.officialAllergenStatus ??
    officialAllergenStatuses.notFound;
  const suspiciousRows = suspiciousMenuRows(restaurant?.items ?? []);
  const rowClassificationIssues = classifiedMenuRowIssues(restaurant?.items ?? []);
  const boilerplateDescriptionRows = (restaurant?.items ?? []).filter((item) =>
    isSourceBoilerplateDescription(item?.description),
  );
  const boilerplateSourceSummaryRows = (restaurant?.items ?? []).filter((item) =>
    isSourceBoilerplateSummary(item?.sourceSummary),
  );
  const textBleedRows = (restaurant?.items ?? [])
    .map((item) => ({ item, reasons: textBleedReasons(item) }))
    .filter((entry) => entry.reasons.length > 0);
  const categoryCollapse = categoryCollapseSummary(restaurant?.items ?? []);
  const addOnLikeRows = addOnHeavyMenuRows(restaurant?.items ?? []);
  const itemRowsMissingEvidence = (restaurant?.items ?? []).filter(
    (item) => !hasItemEvidence(item),
  );
  const officialRowsMissingEvidence = (restaurant?.items ?? []).filter(
    (item) => isOfficialItem(item) && !hasItemEvidence(item),
  );
  const officialAllergenDistribution = officialAllergenDistributionSummary(restaurant);
  const officialEvidence = officialEvidenceClassification(restaurant);
  const previousItemCount = previousRestaurant?.items?.length ?? target?.currentItems ?? 0;
  const accommodationPolicyOnly = isAccommodationPolicyOnlyTarget({ restaurant, target });
  const issueCodes = [];

  if (itemCount === 0 && !accommodationPolicyOnly) {
    issueCodes.push("no-menu-items");
  }

  if (itemCount > 0 && itemCount < minimumExpectedItemCount({ restaurant, target })) {
    issueCodes.push("tiny-menu");
  }

  if (
    itemCount <= 1 &&
    (restaurant?.sourceFamily === "website-menu-pdfs" || restaurant?.parserProfile === "website-menu-pdfs") &&
    (sourceResults.filter((entry) => entry.ok).length >= 2 ||
      (restaurant?.sourceUrls ?? []).filter((url) => /\.pdf\b/i.test(url)).length >= 2)
  ) {
    issueCodes.push("pdf-underextracted");
  }

  if (itemCount > maximumExpectedItemCount({ restaurant, target })) {
    issueCodes.push("oversized-menu");
  }

  if (suspiciousRows.length > 0) {
    issueCodes.push("suspicious-menu-rows");
  }

  if (rowClassificationIssues.length > 0) {
    issueCodes.push("row-classification-issues");
  }

  if (boilerplateDescriptionRows.length > 0) {
    issueCodes.push("source-boilerplate-descriptions");
  }

  if (textBleedRows.length > 0) {
    issueCodes.push("possible-text-bleed");
  }

  if (categoryCollapse.collapsed) {
    issueCodes.push("category-collapse");
  }

  if (itemCount >= 15 && addOnLikeRows.length >= 8 && addOnLikeRows.length / itemCount >= 0.25) {
    issueCodes.push("add-on-heavy-menu");
  }

  if (itemRowsMissingEvidence.length > Math.max(3, Math.ceil(itemCount * 0.1))) {
    issueCodes.push("missing-item-evidence");
  }

  if (officialRowsMissingEvidence.length > 0) {
    issueCodes.push("official-claim-missing-evidence");
  }

  if (
    itemCount >= 20 &&
    officialItemCount > 0 &&
    officialItemCount / itemCount < 0.2 &&
    restaurant?.allowUnavailableAllergenFallback !== true &&
    target?.allowUnavailableAllergenFallback !== true &&
    target?.source?.allowUnavailableAllergenFallback !== true
  ) {
    issueCodes.push("low-official-coverage");
  }

  if (officialAllergenDistribution.likelyDirectSmear) {
    issueCodes.push("official-direct-allergen-smear");
  }

  if (officialAllergenDistribution.suspiciousBroadCrossContact) {
    issueCodes.push("official-cross-contact-needs-evidence");
  }

  if (officialAllergenStatus === officialAllergenStatuses.sourceFoundUnparsed) {
    issueCodes.push("official-source-found-unparsed");
  }

  if (officialAllergenStatus === officialAllergenStatuses.sourceUnreachable) {
    issueCodes.push("official-source-unreachable");
  }

  if (isMeaningfulRegression({ itemCount, officialAllergenStatus, previousItemCount, restaurant, target })) {
    issueCodes.push("item-count-regression");
  }

  const remediationBucket = remediationBucketForIssues({
    auditRow,
    coverageStatus: restaurant?.coverageStatus,
    accommodationPolicyOnly,
    issueCodes,
    itemCount,
    officialAllergenStatus,
  });
  const status = launchStatusForIssues(issueCodes, remediationBucket);

  return {
    id: restaurant?.id ?? target?.id ?? "",
    name: restaurant?.name ?? target?.name ?? "",
    targetStatus: target?.sourceStatus ?? "",
    origin: target?.origin ?? "",
    type: target?.type ?? restaurant?.type ?? "",
    brandKey: restaurant?.brandKey ?? auditRow?.brandKey ?? "",
    duplicateOf: target?.duplicateOf ?? null,
    launchSourceKey: target?.launchSourceKey ?? "",
    sourceFamily: restaurant?.sourceFamily ?? auditRow?.sourceFamily ?? "",
    parserProfile: restaurant?.parserProfile ?? auditRow?.parserProfile ?? "",
    sourceProfile: restaurant?.sourceProfile ?? "",
    coverageStatus: restaurant?.coverageStatus ?? "",
    launchStatus: status,
    remediationBucket,
    issueCodes,
    itemCount,
    previousItemCount,
    officialItemCount,
    officialAllergenStatus,
    sourceOkCount: sourceResults.filter((entry) => entry.ok).length,
    sourceFailedCount: sourceResults.filter((entry) => entry.ok === false).length,
    suspiciousRowCount: suspiciousRows.length,
    suspiciousRowExamples: suspiciousRows.slice(0, 5),
    rowClassificationIssueCount: rowClassificationIssues.length,
    rowClassificationIssueExamples: rowClassificationIssues.slice(0, 5),
    boilerplateDescriptionCount: boilerplateDescriptionRows.length,
    boilerplateDescriptionExamples: boilerplateDescriptionRows.slice(0, 5).map((item) => ({
      id: item?.id ?? "",
      name: item?.name ?? "",
      category: item?.category ?? "",
      description: item?.description ?? "",
    })),
    boilerplateSourceSummaryCount: boilerplateSourceSummaryRows.length,
    boilerplateSourceSummaryExamples: boilerplateSourceSummaryRows.slice(0, 5).map((item) => ({
      id: item?.id ?? "",
      name: item?.name ?? "",
      category: item?.category ?? "",
      sourceSummary: item?.sourceSummary ?? "",
    })),
    textBleedRowCount: textBleedRows.length,
    textBleedRowExamples: textBleedRows.slice(0, 5).map(({ item, reasons }) => ({
      id: item?.id ?? "",
      name: item?.name ?? "",
      category: item?.category ?? "",
      reasons,
    })),
    categoryCollapse,
    addOnLikeRowCount: addOnLikeRows.length,
    addOnLikeRowExamples: addOnLikeRows.slice(0, 5),
    itemRowsMissingEvidenceCount: itemRowsMissingEvidence.length,
    officialRowsMissingEvidenceCount: officialRowsMissingEvidence.length,
    officialAllergenDistribution,
    officialEvidence,
    failedUrls: sourceResults
      .filter((entry) => entry.ok === false)
      .map((entry) => entry.url)
      .slice(0, 10),
    sourceUrls: restaurant?.sourceUrls ?? [],
  };
}

export function suspiciousMenuRows(items) {
  return (items ?? [])
    .map((item) => {
      const name = String(item?.name ?? "").trim();
      const category = String(item?.category ?? "").trim();
      const description = String(item?.description ?? "").trim();
      const nameCategoryText = `${name} ${category}`;
      const text = `${nameCategoryText} ${description}`;
      const reasons = [];

      if (!name) {
        reasons.push("missing-name");
      }

      if (name.length > 120) {
        reasons.push("name-too-long");
      }

      if (hasSpacedOutLetterText(name)) {
        reasons.push("spaced-out-letter-text");
      }

      if (
        /^\$?\s*(?:add|sub)\b/i.test(name) &&
        !isOfficialFoodAddonRow(item) &&
        !isTrustedEvidenceBackedFoodRow(item)
      ) {
        reasons.push("artifact-text");
      }

      if (
        hardSuspiciousNamePatterns.some(
          (pattern) => pattern.test(name) || pattern.test(nameCategoryText),
        ) &&
        !isOfficialFoodAddonRow(item) &&
        !isTrustedEvidenceBackedFoodRow(item)
      ) {
        reasons.push("artifact-text");
      } else if (
        suspiciousNamePatterns.some(
          (pattern) => pattern.test(name) || pattern.test(nameCategoryText),
        ) &&
        !isOfficialFoodAddonRow(item) &&
        !isTrustedEvidenceBackedFoodRow(item) &&
        !looksLikeFoodName(name)
      ) {
        reasons.push("artifact-text");
      }

      if (
        suspiciousCategoryPatterns.some((pattern) => pattern.test(category)) &&
        !looksLikeFoodName(name)
      ) {
        reasons.push("non-food-category");
      }

      if (
        /\b(?:vodka|martini|lager|whitbier|bourbon|whiskey|tequila|mezcal|rum|gin)\b/i.test(
        description,
      ) &&
      !/\bvodka\s+sauce\b/i.test(description) &&
      !/\b(?:tequila|vodka|bourbon|whiskey|rum|gin)\s*[- ]\s*infused\b/i.test(description) &&
      !looksLikeFoodName(name) &&
      !looksLikeFoodName(text) &&
      !/\b(?:asparagus|chicken|shrimp|beef|pork|fish|steak|filet|mignon|strip|lamb|salmon|crab|toast|cake|pie|mousse|chocolate|cream|rice|noodle|pasta|ravioli|salad|sprouts?|brussels?|coleslaw|slaw|tamal|tamale|mariscos?|burgers?|sandwich(?:es)?|flatbreads?|fries|cheese|wings?|ragu|potatoes?)\b/i.test(
        name,
      ) &&
      !/\b(?:tacos?|oysters?|clams?|mussels?|scallops?|lobster|calamari|squid|gumbo|po'?boy)\b/i.test(name)
    ) {
      reasons.push("beverage-row");
    }

      return reasons.length > 0
        ? {
            id: item?.id ?? "",
            name,
            category,
            reasons,
          }
        : null;
    })
    .filter(Boolean);
}

export function classifiedMenuRowIssues(items) {
  return (items ?? [])
    .map((item) => {
      const classification = classifyMenuItemRow(item);

      if (classification.kind === "menu-item" && classification.reasons.length === 0) {
        return null;
      }

      return {
        id: item?.id ?? "",
        name: String(item?.name ?? "").trim(),
        category: String(item?.category ?? "").trim(),
        kind: classification.kind,
        reasons: classification.reasons,
      };
    })
    .filter(Boolean);
}

export function addOnHeavyMenuRows(items) {
  return (items ?? [])
    .map((item) => {
      const name = String(item?.name ?? "").trim();
      const category = String(item?.category ?? "").trim();
      const description = String(item?.description ?? "").trim();
      const rowText = `${name} ${category} ${description}`;

      if (!name) {
        return null;
      }

      const isAddOnLike =
        /\b(?:sauce|aioli|mayo|mustard|honey|pickle|pickles|slaw|butter|cream cheese|side|extra|dressing|dip|gravy|syrup|jam|spread)\b/i.test(
          name,
        ) ||
        /^(?:bagel|butter|cream cheese|extras for bagel|weekly specials)$/i.test(name);
      const isClearlyMainDish =
        /\b(?:burger|burrito|biryani|bowl|breakfast|chicken|dosa|entree|feast|fish|fries|kebab|kabob|meal|naan|pasta|pizza|plate|platter|ribs?|salad|salmon|sandwich|shrimp|steak|taco|tender|toast|wings?|wrap)\b/i.test(
          rowText,
        );

      return isAddOnLike && !isClearlyMainDish
        ? {
            id: item?.id ?? "",
            name,
            category,
          }
        : null;
    })
    .filter(Boolean);
}

export function summarizeLaunchQualityRows(rows) {
  return {
    total: rows.length,
    byLaunchStatus: countBy(rows, (row) => row.launchStatus),
    byRemediationBucket: countBy(rows, (row) => row.remediationBucket),
    byTargetStatus: countBy(rows, (row) => row.targetStatus || "unknown"),
    bySourceFamily: countBy(rows, (row) => row.sourceFamily || "unknown"),
    officialAllergenStatuses: countBy(rows, (row) => row.officialAllergenStatus || "unknown"),
    publishableCount: rows.filter((row) => row.launchStatus === launchQualityStatuses.published)
      .length,
    reviewNeededCount: rows.filter((row) => row.launchStatus === launchQualityStatuses.reviewNeeded)
      .length,
    quarantinedCount: rows.filter((row) => row.launchStatus === launchQualityStatuses.quarantined)
      .length,
  };
}

export function launchQualityRowsToCsv(rows) {
  const headers = [
    "id",
    "name",
    "targetStatus",
    "origin",
    "type",
    "brandKey",
    "duplicateOf",
    "launchSourceKey",
    "sourceFamily",
    "parserProfile",
    "coverageStatus",
    "launchStatus",
    "remediationBucket",
    "issueCodes",
    "itemCount",
    "previousItemCount",
    "officialItemCount",
    "officialAllergenStatus",
    "sourceOkCount",
    "sourceFailedCount",
    "suspiciousRowCount",
    "rowClassificationIssueCount",
    "boilerplateDescriptionCount",
    "textBleedRowCount",
    "categoryCollapse",
    "itemRowsMissingEvidenceCount",
    "officialRowsMissingEvidenceCount",
    "officialEvidence",
    "failedUrls",
    "sourceUrls",
  ];

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) =>
          csvCell(
            Array.isArray(row[header]) ? row[header].join(" | ") : row[header],
          ),
        )
        .join(","),
    ),
  ].join("\n");
}

function minimumExpectedItemCount({ restaurant, target }) {
  if (restaurant?.expectedSmallMenu === true || target?.expectedSmallMenu === true) {
    return 1;
  }

  if (target?.sourceStatus === "existing-zero") {
    return 5;
  }

  return 10;
}

function maximumExpectedItemCount({ restaurant, target }) {
  if (restaurant?.expectedLargeMenu === true || target?.expectedLargeMenu === true) {
    return 350;
  }

  if (target?.type === "chain-menu" || restaurant?.type === "chain") {
    return 450;
  }

  if ((restaurant?.sourceFamily === "toast" || restaurant?.parserProfile === "toast-menu")) {
    return 350;
  }

  if (officialItemCountForRestaurant(restaurant) >= 100) {
    return 450;
  }

  return 250;
}

function isMeaningfulRegression({ itemCount, officialAllergenStatus, previousItemCount, restaurant, target }) {
  if (!previousItemCount || target?.sourceStatus === "existing-zero") {
    return false;
  }

  if (restaurant?.expectedSmallMenu === true || target?.expectedSmallMenu === true) {
    return false;
  }

  if (
    officialAllergenStatus === officialAllergenStatuses.extracted &&
    restaurant?.coveragePercent === 100 &&
    itemCount >= 40
  ) {
    return false;
  }

  if (previousItemCount < 20) {
    return itemCount < Math.max(5, Math.floor(previousItemCount * 0.5));
  }

  return previousItemCount - itemCount >= 15 && itemCount < previousItemCount * 0.25;
}

function remediationBucketForIssues({
  accommodationPolicyOnly,
  auditRow,
  coverageStatus,
  issueCodes,
  itemCount,
  officialAllergenStatus,
}) {
  if (accommodationPolicyOnly && itemCount === 0) {
    return launchRemediationBuckets.accommodationPolicyOnly;
  }

  if (itemCount === 0 || issueCodes.includes("no-menu-items")) {
    return launchRemediationBuckets.noMenuFound;
  }

  if (coverageStatus === "kept-previous" && issueCodes.length === 0) {
    return remediationBuckets.none;
  }

  if (issueCodes.includes("official-source-found-unparsed")) {
    return launchRemediationBuckets.needsOfficialAllergenProfile;
  }

  if (officialAllergenStatus === officialAllergenStatuses.sourceFoundUnparsed) {
    return launchRemediationBuckets.sourceFoundUnparsed;
  }

  if (issueCodes.includes("official-source-unreachable")) {
    return launchRemediationBuckets.badSource;
  }

  if (issueCodes.includes("official-direct-allergen-smear")) {
    return launchRemediationBuckets.needsOfficialAllergenProfile;
  }

  if (
    issueCodes.includes("suspicious-menu-rows") ||
    issueCodes.includes("row-classification-issues") ||
    issueCodes.includes("source-boilerplate-descriptions") ||
    issueCodes.includes("possible-text-bleed") ||
    issueCodes.includes("category-collapse") ||
    issueCodes.includes("add-on-heavy-menu") ||
    issueCodes.includes("pdf-underextracted") ||
    issueCodes.includes("oversized-menu") ||
    issueCodes.includes("official-cross-contact-needs-evidence")
  ) {
    return launchRemediationBuckets.needsSharedParserFix;
  }

  if (
    issueCodes.includes("tiny-menu") ||
    issueCodes.includes("item-count-regression") ||
    issueCodes.includes("low-official-coverage") ||
    issueCodes.includes("missing-item-evidence") ||
    issueCodes.includes("official-claim-missing-evidence")
  ) {
    return launchRemediationBuckets.manualReviewNeeded;
  }

  if (
    auditRow?.remediationBucket &&
    auditRow.remediationBucket !== remediationBuckets.none &&
    auditRow.remediationBucket !== remediationBuckets.noOfficialSource
  ) {
    return auditRow.remediationBucket;
  }

  return remediationBuckets.none;
}

function launchStatusForIssues(issueCodes, remediationBucket) {
  if (issueCodes.includes("no-menu-items")) {
    return launchQualityStatuses.quarantined;
  }

  if (remediationBucket === launchRemediationBuckets.accommodationPolicyOnly) {
    return launchQualityStatuses.published;
  }

  if (remediationBucket && remediationBucket !== remediationBuckets.none) {
    return launchQualityStatuses.reviewNeeded;
  }

  return launchQualityStatuses.published;
}

function isAccommodationPolicyOnlyTarget({ restaurant, target }) {
  return Boolean(
    target?.accommodationOnly === true ||
      target?.allergyAccommodationPolicy ||
      restaurant?.sourceStatus?.accommodationOnly === true ||
      restaurant?.allergyAccommodationPolicy,
  );
}

function sourceResultsByRestaurantId(run) {
  const byId = new Map();

  for (const source of run?.sources ?? []) {
    const restaurantId = source.restaurantId;

    if (!restaurantId) {
      continue;
    }

    const entries = byId.get(restaurantId) ?? [];
    entries.push(source);
    byId.set(restaurantId, entries);
  }

  return byId;
}

function hasItemEvidence(item) {
  return Boolean(
    item?.sourceUrl ||
      (Array.isArray(item?.sourceUrls) && item.sourceUrls.length > 0) ||
      item?.sourceEvidenceId ||
      item?.sourceEvidenceIds?.length ||
      (Array.isArray(item?.evidence) && item.evidence.some((entry) => entry?.sourceUrl)),
  );
}

function isOfficialItem(item) {
  return item?.officialSource === true || /official/i.test(item?.allergenSourceType ?? "");
}

function looksLikeFoodName(value) {
  return /\b(?:anchovies|artichokes|arugula|bacon|bagels?|baklava|beef|beignet|biscuits?|boneless|branzino|bread|broccoli|brownie|brussel|buns?|burgers?|butter|cake|calamari|cauli|caviar|cheese|cheesecake|chicken|chickpea|chili|clams?|coffee|cookie|crab|custard|daiquiri|dessert|donuts?|doughnuts?|dressing|egg|eggplant|feast|filet|fish|flatbread|fries|gelato|giardiniera|greens?|hamachi|ice\s*cream|juice|kebab|kabob|kimchi|lamb|latte|lemonade|lobster|mac|meal|meatballs?|mignon|mozzarella|mussels?|nuggets?|octopus|olives?|oysters?|party pack|pasta|pastry|pie|pizza|poke|pork|potato|potatoes|prawns?|pretzels?|pudding|punch bowl|queso|rarebit|raw bar|rib|ribs|rice|salad|salmon|sammie|sandwich|sauce|scallops?|seafood|sherbet|shrimp|sirloin|slider|smoothie|sorbet|soup|squid|steak|sundae|taco|tea|tiramisu|toast|tomatoes|topo chico|tenders?|tres leches|trout|tuna|vinaigrette|waffles?|wings?|wrap|yellowfin)\b/i.test(
    value ?? "",
  );
}

function isOfficialFoodAddonRow(item) {
  const name = String(item?.name ?? "");

  return (
    isOfficialItem(item) &&
    /^\$?\s*(?:add|sub)\b/i.test(name) &&
    looksLikeFoodName(name)
  );
}

function isTrustedEvidenceBackedFoodRow(item) {
  const name = String(item?.name ?? "");
  const category = String(item?.category ?? "");
  const description = String(item?.description ?? "");

  return (
    (isOfficialItem(item) || hasItemEvidence(item)) &&
    (isOfficialWidgetIngredientBackedRow(item) ||
      looksLikeFoodName(`${name} ${category} ${description}`) ||
      isCompactChickenPieceName(name))
  );
}

function isOfficialWidgetIngredientBackedRow(item) {
  return (
    isOfficialItem(item) &&
    /(?:official-allergen-widget|everybite-widget-graphql)/i.test(
      `${item?.sourceType ?? ""} ${item?.sourceKind ?? ""} ${item?.allergenSourceType ?? ""}`,
    ) &&
    ((Array.isArray(item?.knownIngredients) && item.knownIngredients.length > 0) ||
      String(item?.ingredientsText ?? "").trim().length > 0 ||
      (Array.isArray(item?.allergens) && item.allergens.length > 0) ||
      (Array.isArray(item?.mayContain) && item.mayContain.length > 0))
  );
}

function isCompactChickenPieceName(value) {
  return /^\d+\s*pc\s+(?:breast|leg|thigh|wing|tenders?)(?:[A-Z][a-z]+|\s+\w+)*$/i.test(
    String(value ?? "").replace(/\s+/g, " ").trim(),
  );
}

function hasSpacedOutLetterText(value) {
  const tokens = String(value ?? "").trim().split(/\s+/);
  const singleLetterTokens = tokens.filter((token) => /^[A-Za-z]$/.test(token)).length;

  return singleLetterTokens >= 4 && singleLetterTokens / Math.max(tokens.length, 1) >= 0.55;
}

function countBy(rows, keyFn) {
  return rows.reduce((counts, row) => {
    const key = keyFn(row) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
