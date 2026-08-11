import { coverageStatuses, snapshotVersion } from "./restaurant-adapters.mjs";
import {
  classifyMenuItemRow,
  officialEvidenceClassification,
  sanitizeMenuItemDisplayFields,
} from "./menu-item-quality.mjs";
import {
  officialAllergenStatuses,
  officialItemCountForRestaurant,
} from "./restaurant-source-classification.mjs";

const staleSnapshotArtifactItemPatterns = [
  /^add toppings$/i,
  /^served in an award winning\b.*\btortilla$/i,
  /^make a reservation powered by opentable$/i,
  /^request a quote$/i,
  /^(?:bus & tour accommodations|fresh cuisine & friendly service since|fresh seafood restaurant|healthy options|eat healthy)$/i,
  /^(?:military discount|senior discount|mlietz)$/i,
  /archives$/i,
  /^served from \d{1,2}\s*a\.?m\b/i,
  /^we serve\b/i,
  /^(?:black market bistro|black salt restaurant & fish market|black's bar & kitchen)$/i,
  /^what[’']s for dinner\??$/i,
  /^(?:remove logo|remove powered by branding|remove our branding|share via social media)$/i,
  /^(?:ability to purchase tickets|customize your eventbrite app|design and animation|display events on your website|display multiple events|google map integration|highly customizable|multiple feeds|promote and share your events|sell an unlimited number of tickets through your site|showcase the next event|unlimited events|unlimited news items)$/i,
  /^(?:advanced transitions|autoplay videos|custom arrow style|custom slide speed|full customization)$/i,
];

const manualItemDisplayCorrections = new Map([
  [
    "rasika-west-end-dc:kelt-vsop",
    {
      allergenSourceType: "unavailable",
      allergens: [],
      description: null,
      ingredientsText: null,
      mayContain: [],
      officialSource: false,
      sourceSummary:
        "Reviewed Rasika dessert PDF evidence: the attached dietary legend was global menu guidance, not item-level allergen data for Kelt V.S.O.P.",
      manualQualityNote:
        "Removed a global dietary legend that had been attached to the Kelt V.S.O.P. row as fake official allergens.",
    },
  ],
  [
    "mi-vida-washington-dc-dc-metro:zanahorias",
    {
      allergens: ["milk", "peanut"],
      mayContain: [],
      sourceSummary:
        "Reviewed MI VIDA official brunch/lunch PDF: ZANAHORIAS lists queso and salsa macha made with pumpkin seeds and peanuts. The nearby '( ) Contains Gluten' legend and raw-egg advisory are not item-level markers for this dish.",
      manualQualityNote:
        "Removed non-item-level gluten/egg legend bleed from the ZANAHORIAS official allergen row.",
    },
  ],
  [
    "northside-social-va:white-bean-and-pesto-soup",
    {
      allergens: ["milk", "tree-nut"],
      mayContain: [],
      sourceSummary:
        "Reviewed Northside Social menu source: White Bean & Pesto Soup lists a hint of cream, basil pesto, and item-level 'Contains Nuts.' Nearby gluten-free category text was menu bleed from the following item.",
      manualQualityNote:
        "Removed neighboring gluten-free menu bleed from White Bean & Pesto Soup official allergen evidence.",
    },
  ],
  [
    "baan-siam-dc:stir-fried-cuttlefish-with-chili-paste",
    {
      allergens: ["peanut", "shellfish"],
      mayContain: [],
      sourceSummary:
        "Reviewed Baan Siam official Toast row: the item contains cuttlefish and the chili paste note says contains peanuts. No tree-nut disclosure is present in the item row.",
      manualQualityNote:
        "Removed false tree-nut mapping from the peanut disclosure on Stir-fried cuttlefish with chili paste.",
    },
  ],
  [
    "st-james-dc:macaroni-pie",
    {
      allergens: ["gluten", "milk", "wheat"],
      mayContain: [],
      sourceSummary:
        "Reviewed St. James official menu: Macaroni Pie is pasta baked in cheese sauce. Shellfish text came from a neighboring Black Rice boundary row and is not item-level evidence.",
      manualQualityNote:
        "Removed neighboring Black Rice shellfish bleed from the Macaroni Pie official allergen row.",
    },
  ],
  [
    "replacement-redrocks-pizza-washington-dc:ny-steak-and-cheese",
    {
      allergens: ["milk"],
      mayContain: [],
      sourceSummary:
        "Reviewed RedRocks official dinner PDF: N.Y. Steak & Cheese contains fontina cheese. The raw/undercooked shellfish/egg warning and vegetarian/nuts legend are global menu notices, not item-level allergen evidence.",
      manualQualityNote:
        "Removed global raw-warning and legend bleed from the N.Y. Steak & Cheese official allergen row.",
    },
  ],
  [
    "medina-dc:lamb-shish",
    {
      allergens: ["milk"],
      mayContain: [],
      sourceSummary:
        "Reviewed Medina/Maydan official PDF: Lamb Shish lists kefir labne and carries the plus marker for dairy. The nuts/gluten legend and allergy notice are global menu text, not item-level Lamb Shish markers.",
      manualQualityNote:
        "Removed global nuts/gluten legend bleed from the Lamb Shish official allergen row.",
    },
  ],
  [
    "tiger-dumplings-arlington-va:chengdu-chili-oil-chicken",
    {
      allergens: ["peanut"],
      mayContain: [],
      sourceSummary:
        "Reviewed Tiger Dumplings official menu: Chengdu Chili Oil Chicken is explicitly marked as containing peanuts. Fish text belongs to the neighboring Sea Salt Garlic Fish Filet row.",
      manualQualityNote:
        "Removed neighboring fish filet boundary bleed from the Chengdu Chili Oil Chicken official allergen row.",
    },
  ],
  [
    "tiger-dumplings-arlington-va:hawaiian-style-fried-rice",
    {
      allergens: ["peanut"],
      mayContain: [],
      sourceSummary:
        "Reviewed Tiger Dumplings official menu: Hawaiian-style Fried Rice is explicitly marked as containing peanuts. Fish text belongs to the neighboring Sea Salt Garlic Fish Filet row.",
      manualQualityNote:
        "Removed neighboring fish filet boundary bleed from the Hawaiian-style Fried Rice official allergen row.",
    },
  ],
  [
    "replacement-nue-elegantly-vietnamese-falls-church-va:tofu-noodle-bowl-v",
    {
      allergens: ["soy"],
      mayContain: [],
      sourceSummary:
        "Reviewed official NUE summer lunch menu PDF: Tofu Noodle Bowl lists fresh herbs, summer vegetables, and tamari. The raw/undercooked egg/meat/seafood warning and dietary legend are global menu notes, not item-level evidence.",
      manualQualityNote:
        "Removed global raw-warning and dietary-legend bleed from the Tofu Noodle Bowl official allergen row.",
    },
  ],
  [
    "gemini-dc:sesame-and-chocolate-chip-cookie",
    {
      allergens: ["egg", "gluten", "milk", "sesame"],
      mayContain: ["soy", "tree-nut"],
      sourceSummary:
        "Reviewed official inline allergen wording: dairy, egg, gluten, and sesame are direct allergens; nuts and soy are facility-processing cross-contact concerns.",
      manualQualityNote:
        "Separated direct allergens from facility-processing cross-contact on the Sesame & Chocolate Chip Cookie row.",
    },
  ],
  [
    "el-pollo-rico-arlington-va:flan",
    {
      allergens: ["egg", "milk"],
      mayContain: [],
      sourceSummary:
        "Reviewed El Pollo Rico official Toast menu boundary text: Flan is the dairy/egg dessert row. Walnut text belongs to the neighboring rum cake row, not Flan.",
      manualQualityNote:
        "Removed neighboring rum cake walnut boundary bleed from the Flan official allergen row.",
    },
  ],
  [
    "baan-mae-dc:pun-yaw",
    {
      allergens: ["peanut", "shellfish"],
      mayContain: [],
      sourceSummary:
        "Reviewed official Baan Mae Toast menu: Pun Yaw is explicitly marked as containing shellfish and peanuts. No tree-nut disclosure appears in the item row.",
      manualQualityNote:
        "Removed false tree-nut mapping from the peanut disclosure on the Pun Yaw official allergen row.",
    },
  ],
  [
    "replacement-planta-washington-dc-washington-dc:dessert-platters",
    {
      allergens: ["tree-nut"],
      mayContain: [],
      sourceSummary:
        "Reviewed PLANTA Washington DC official menu text: the Seasonal Cheesecake Dessert Platter is marked as containing nuts and gluten free. The gluten-free note is not item-level gluten evidence.",
      manualQualityNote:
        "Removed false gluten mapping from the gluten-free note on the Seasonal Cheesecake Dessert Platter row.",
    },
  ],
  [
    "replacement-marley-s-bar-and-grill-hyattsville-md:cajun-seafood-pasta",
    {
      allergens: ["gluten", "milk", "shellfish", "wheat"],
      mayContain: [],
      sourceSummary:
        "Reviewed Marley’s official PDF/menu text: Cajun Seafood Pasta lists fettuccine, crawfish cream sauce, shrimp, and crab. Fish text came from neighboring salmon/catfish option rows.",
      manualQualityNote:
        "Removed neighboring fish-option boundary bleed from the Cajun Seafood Pasta official allergen row.",
    },
  ],
  [
    "replacement-marley-s-bar-and-grill-hyattsville-md:shrimp-and-grits",
    {
      allergens: ["milk", "shellfish"],
      mayContain: [],
      sourceSummary:
        "Reviewed Marley’s official PDF/menu text: Shrimp & Grits uses cheese grits and Cajun crawfish sauce. Fish text belongs to neighboring catfish/salmon options.",
      manualQualityNote:
        "Removed neighboring fish-option boundary bleed from the Shrimp & Grits official allergen row.",
    },
  ],
  [
    "pearl-dive-oyster-palace-dc:dive-burger",
    {
      allergens: ["egg", "gluten", "milk", "wheat"],
      mayContain: [],
      description:
        "Double patty, bacon, pepper jack, green chilies, lettuce, tomato, onion, and cayenne aioli.",
      sourceSummary:
        "Reviewed Pearl Dive official dinner PDF: Dive Burger lists double patty, bacon, pepper jack, green chilies, LTO, and cayenne aioli. Neighboring Grilled Chicken Sandwich and Po’Boys rows were PDF boundary bleed.",
      manualQualityNote:
        "Removed neighboring sandwich and po’boy menu rows from the Dive Burger description before Ingredient Intelligence recompute.",
    },
  ],
  [
    "pearl-dive-oyster-palace-dc:grilled-asparagus-and-prosciutto",
    {
      allergens: ["gluten", "milk", "tree-nut", "wheat"],
      mayContain: [],
      description:
        "Burrata cheese, pine nuts, Meyer lemon emulsion, balsamic, EVOO, and grilled flatbread.",
      sourceSummary:
        "Reviewed Pearl Dive official dinner PDF: Grilled Asparagus & Prosciutto lists burrata, pine nuts, Meyer lemon emulsion, balsamic, EVOO, and grilled flatbread. Neighboring beet salad and Campechana rows were PDF boundary bleed.",
      manualQualityNote:
        "Removed neighboring salad and seafood menu rows from the Grilled Asparagus & Prosciutto description before Ingredient Intelligence recompute.",
    },
  ],
  [
    "pearl-dive-oyster-palace-dc:steak-and-eggs",
    {
      description:
        "Wood grilled teres major, two eggs, potato hash, salad, and cayenne hollandaise.",
      sourceSummary:
        "Reviewed Pearl Dive brunch PDF: Steak & Eggs lists wood grilled teres major, two eggs, potato hash, salad, and cayenne hollandaise. Neighboring Chopped Salad text was PDF boundary bleed.",
      manualQualityNote:
        "Removed neighboring salad menu row from the Steak & Eggs description before Ingredient Intelligence recompute.",
    },
  ],
  [
    "pearl-dive-oyster-palace-dc:creole-gumbos",
    {
      description: null,
      sourceSummary:
        "Reviewed Pearl Dive PDF output: the published Creole Gumbos row had a sustainability/about-us paragraph attached instead of item-level menu copy.",
      manualQualityNote:
        "Removed non-item restaurant/about-us text from the Creole Gumbos display description.",
    },
  ],
  [
    "pearl-dive-oyster-palace-dc:bottomless-mimosa",
    {
      description: null,
      sourceSummary:
        "Reviewed Pearl Dive brunch PDF output: removed a truncated service-time fragment from Bottomless Mimosa.",
      manualQualityNote:
        "Removed non-menu-copy fragment from the Bottomless Mimosa display description.",
    },
  ],
  [
    "pearl-dive-oyster-palace-dc:cajun-shrimp-and-grits",
    {
      description:
        "Barbecue rubbed shrimp, cayenne grits, bacon braised greens, sherry butter, and grilled baguette.",
      sourceSummary:
        "Reviewed Pearl Dive PDF output: Cajun Shrimp & Grits lists barbecue rubbed shrimp, cayenne grits, bacon braised greens, sherry butter, and grilled baguette. The trailing Hot Oysters text was a section boundary artifact.",
      manualQualityNote:
        "Removed neighboring section text from the Cajun Shrimp & Grits description.",
    },
  ],
  [
    "don-luis-restaurant-authentic-mexican-cuisine-and-cantina-centreville-dc-metro:chicken",
    {
      id: "grilled-chicken-salad",
      name: "Grilled Chicken Salad",
      category: "Salads",
      manualQualityNote:
        "Reviewed PDF evidence showed the parser used the protein option as the title for the grilled salad row.",
    },
  ],
  [
    "anafre-dc:chicken",
    {
      id: "chicken-sandwich",
      name: "Chicken Sandwich",
      manualQualityNote:
        "Reviewed website menu evidence showed this Sandwiches row is the chicken sandwich.",
    },
  ],
  [
    "aroma-pizza-lorton-dc-metro:chicken",
    {
      id: "chicken-pizza",
      name: "Chicken Pizza",
      manualQualityNote:
        "Reviewed Toast menu evidence showed this Pizza row is a chicken pizza, not a standalone protein option.",
    },
  ],
  [
    "bistro-du-jour-washington-dc-dc-metro:snacks",
    {
      id: "gougeres-warm-cheese-puffs",
      name: "Gougères Warm Cheese Puffs",
      category: "Snacks",
      description: "Parmesan, Mornay",
      manualQualityNote:
        "Reviewed PDF evidence showed the section header swallowed the first snack item.",
    },
  ],
  [
    "osm-north-italia-7185443038:pizza",
    {
      id: "margherita-pizza",
      name: "Margherita Pizza",
      category: "Pizza",
      description: "Mozzarella, fresh basil, red sauce, evoo. Make it Tie Dye +3.",
      manualQualityNote:
        "Reviewed North Italia PDF evidence showed the parser used the Pizza section header as the item name and split Margherita into the description.",
    },
  ],
  [
    "moby-dick-dc:sabzi-v",
    {
      id: "sabzi",
      name: "Sabzi",
      category: "Sides",
      manualQualityNote:
        "Reviewed Moby Dick PDF evidence showed V is a dietary marker appended to the Sabzi item name.",
    },
  ],
  [
    "grazie-nonna-dc:antipasti",
    {
      id: "nonna-platter",
      name: "Nonna Platter",
      category: "Antipasti",
      description:
        "Artichokes, roasted red peppers, fresh mozzarella, arugula, pickled banana peppers, white balsamic vinaigrette, served with pizza bianco.",
      manualQualityNote:
        "Reviewed Grazie Nonna menu evidence showed the parser used the Antipasti section header as the item name.",
    },
  ],
  [
    "grazie-nonna-dc:caesar-13romaine-croutons-parmigiano-reggiano",
    {
      id: "caesar",
      name: "Caesar",
      category: "Salads",
      description: "Romaine, croutons, Parmigiano Reggiano.",
      manualQualityNote:
        "Reviewed Grazie Nonna menu evidence showed price and ingredients were merged into the Caesar item title.",
    },
  ],
  [
    "grazie-nonna-dc:meatballs-24bucatini-pomodoro",
    {
      id: "meatballs",
      name: "Meatballs",
      category: "Pasta",
      description: "Bucatini, pomodoro.",
      manualQualityNote:
        "Reviewed Grazie Nonna menu evidence showed price and ingredients were merged into the Meatballs item title.",
    },
  ],
  [
    "grazie-nonna-dc:meatballs-26bucatini-pomodoro",
    {
      id: "meatballs",
      name: "Meatballs",
      category: "Pasta",
      description: "Bucatini, pomodoro.",
      manualQualityNote:
        "Reviewed Grazie Nonna menu evidence showed price and ingredients were merged into the Meatballs item title.",
    },
  ],
  [
    "succotash-dc:chocol-ate-ganache-waffle",
    {
      id: "chocolate-ganache-waffle",
      name: "Chocolate Ganache Waffle",
      category: "Desserts",
      description: "Bananas, Old Bay marshmallow fluff, ginger snap crumbs.",
      manualQualityNote:
        "Reviewed Succotash dessert PDF evidence showed adjacent dessert rows were merged into this item description.",
    },
  ],
  [
    "lebanese-taverna-dc:awamat-10lebanese-donuts-yogurt-milk-pudding",
    {
      id: "awamat",
      name: "Awamat",
      category: "Desserts",
      description: "Lebanese donuts, yogurt-milk pudding.",
      manualQualityNote:
        "Reviewed Lebanese Taverna menu evidence showed the Awamat dessert row was merged with the following Ice Cream Trio row.",
    },
  ],
  [
    "replacement-elizabeth-s-washington-dc:first",
    {
      id: "kale-meringue",
      name: "Kale Meringue",
      category: "Tasting Menu",
      description: "Yuzu, pink celery, crème fraîche.",
      manualQualityNote:
        "Reviewed Elizabeth's official menu evidence showed the course label 'First' carried the actual item details in the description.",
    },
  ],
  [
    "replacement-alta-strada-fairfax-va-fairfax-va:spaghetti-aop",
    {
      id: "spaghetti-aop",
      name: "Spaghetti AOP",
      category: "Pasta",
      description: "Garlic, olive oil, parsley, chili flakes.",
      manualQualityNote:
        "Reviewed Alta Strada menu evidence showed the parser attached the neighboring Rigatoni Alla Vodka description to Spaghetti AOP.",
    },
  ],
  [
    "green-pig-bistro-arlington-va-dc-metro:avocado-toast",
    {
      id: "avocado-toast",
      name: "Avocado Toast",
      category: "Brunch",
      description:
        "House cured salmon, fresh avocado, pickled red onion, cherry tomato, red radish, cilantro, wheat bread, house salad.",
      manualQualityNote:
        "Reviewed Green Pig Bistro menu evidence showed the French Omelette row was merged into the Avocado Toast description.",
    },
  ],
  [
    "green-pig-bistro-arlington-va-dc-metro:egg-sandwich",
    {
      id: "egg-sandwich",
      name: "Egg Sandwich",
      category: "Brunch",
      description:
        "Bacon or sausage, folded egg, cheese, hand cut fries or house salad.",
      manualQualityNote:
        "Reviewed Green Pig Bistro menu evidence showed the Cheeseburger row was merged into the Egg Sandwich description.",
    },
  ],
  [
    "greenhouse-jefferson-dc:chefs-selection-of-seasonal-fruits-and-berries",
    {
      id: "chefs-selection-of-seasonal-fruits-and-berries",
      name: "Chefs Selection of Seasonal Fruits and Berries",
      category: "Breakfast",
      description: undefined,
      manualQualityNote:
        "Reviewed Greenhouse breakfast menu evidence showed the Bagel and Lox description was incorrectly duplicated onto the fruit row.",
    },
  ],
  [
    "greenhouse-jefferson-dc:power-bowl",
    {
      id: "power-bowl",
      name: "Power Bowl",
      category: "Breakfast",
      description:
        "Choice of organic low fat, whole milk yogurt or Greek yogurt. Add on choice of seasonal berries, bananas, or house-made granola.",
      manualQualityNote:
        "Reviewed Greenhouse breakfast menu evidence showed the Seasonal Fruit Plate heading was merged into the Power Bowl description.",
    },
  ],
  [
    "greenhouse-jefferson-dc:the-greenhouse-eggs-benedict",
    {
      id: "the-greenhouse-eggs-benedict",
      name: "The Greenhouse Eggs Benedict",
      category: "Breakfast",
      description:
        "Cage free poached eggs, Italian prosciutto cotto, English muffin, hollandaise sauce, asparagus.",
      manualQualityNote:
        "Reviewed Greenhouse breakfast menu evidence showed PDF navigation text was merged into the Eggs Benedict row.",
    },
  ],
  [
    "replacement-thai-chef-rockville-rockville-md:beef-noodle-soup",
    {
      id: "beef-noodle-soup",
      name: "Beef Noodle Soup",
      category: "Thai",
      description:
        "Well done flank steak with thin rice noodle in homemade beef broth, crispy garlic, scallion, and beansprout.",
      manualQualityNote:
        "Reviewed Thai Chef menu evidence showed the following Southerner's Comfort row was merged into Beef Noodle Soup.",
    },
  ],
  [
    "osm-north-italia-7185443038:crispy-hash-potatoes",
    {
      id: "crispy-hash-potatoes",
      name: "Crispy Hash Potatoes",
      category: "Italian",
      description: undefined,
      manualQualityNote:
        "Reviewed North Italia menu evidence showed dessert-section text was merged into the Crispy Hash Potatoes row.",
    },
  ],
  [
    "north-italia-reston-va:crispy-hash-potatoes",
    {
      id: "crispy-hash-potatoes",
      name: "Crispy Hash Potatoes",
      category: "Italian",
      description: undefined,
      manualQualityNote:
        "Reviewed North Italia Reston menu evidence showed dessert-section text was merged into the Crispy Hash Potatoes row.",
    },
  ],
  [
    "philippe-chow-dc-washington-dc-dc-metro:crunchy-baby-bok-choy",
    {
      id: "crunchy-baby-bok-choy",
      name: "Crunchy Baby Bok Choy",
      category: "Chinese",
      description: "Signature garlic sauce.",
      manualQualityNote:
        "Reviewed Philippe Chow menu evidence showed price/dietary markers were merged into the Crunchy Baby Bok Choy description.",
    },
  ],
  [
    "philippe-chow-dc-washington-dc-dc-metro:crunchy-baby-bok-choy-14-gfdfnfsignature-garlic-sauce",
    {
      id: "crunchy-baby-bok-choy",
      name: "Crunchy Baby Bok Choy",
      category: "Chinese",
      description: "Signature garlic sauce.",
      manualQualityNote:
        "Reviewed Philippe Chow menu evidence showed price/dietary markers and the following shishito row were merged into Crunchy Baby Bok Choy.",
    },
  ],
  [
    "the-pembroke-dc:green-circle-chicken",
    {
      id: "green-circle-chicken",
      name: "Green Circle Chicken",
      category: "American",
      description: "Herb and citrus sauce, charred lemon.",
      manualQualityNote:
        "Reviewed The Pembroke menu evidence showed pork chop, cabbage, steak, and garnish rows were merged into Green Circle Chicken.",
    },
  ],
  [
    "succotash-dc:shrimpnoysters-3-of-each-dollar",
    {
      id: "shrimp-n-oysters-3-of-each",
      name: "Shrimp'n'Oysters (3 of each)",
      category: "Starters",
      description: "Three shrimp and three oysters.",
      manualQualityNote:
        "Reviewed Succotash menu evidence showed the raw-bar item had price and next-section text merged into its parsed row.",
    },
  ],
  [
    "succotash-dc:shrimpnoysters-3-of-each-dollar18-00",
    {
      id: "shrimp-n-oysters-3-of-each",
      name: "Shrimp'n'Oysters (3 of each)",
      category: "Starters",
      description: "Three shrimp and three oysters.",
      manualQualityNote:
        "Reviewed Succotash menu evidence showed the duplicate raw-bar item had price text merged into its parsed row.",
    },
  ],
]);

export function addCoverageMetadata(restaurant, adapter, generatedAt) {
  const totalItemCount = restaurant.items.length;
  const officialItemCount = officialItemCountForRestaurant(restaurant);
  const officialEvidence = officialEvidenceClassification(restaurant);
  const coveragePercent =
    totalItemCount > 0
      ? Math.round((officialItemCount / totalItemCount) * 100)
      : 0;
  const meetsMinimumItemCount = totalItemCount >= (adapter.minOfficialItemCount ?? 1);
  const allowsUnavailableAllergenFallback =
    restaurant.allowUnavailableAllergenFallback === true ||
    (restaurant.officialAllergenStatus === officialAllergenStatuses.notFound &&
      adapter.approvedMenuOnlyParser === true);
  const meetsMenuOnlyFallbackQuality =
    allowsUnavailableAllergenFallback &&
    totalItemCount > 0 &&
    (restaurant.expectedSmallMenu === true ||
      adapter.expectedSmallMenu === true ||
      (adapter.approvedMenuOnlyParser === true &&
        totalItemCount >= (adapter.minMenuItemCount ?? adapter.minOfficialItemCount ?? 1)));
  const meetsPartialOfficialFallbackQuality =
    allowsUnavailableAllergenFallback &&
    restaurant.officialAllergenStatus === officialAllergenStatuses.extracted &&
    totalItemCount >= (adapter.minMenuItemCount ?? adapter.minOfficialItemCount ?? 1) &&
    officialItemCount >= Math.min(10, Math.ceil(totalItemCount * 0.2));
  const meetsReviewedMenuOnlyFallbackQuality =
    restaurant.reviewedMenuOnlyFallback === true &&
    totalItemCount >= (restaurant.reviewedMenuOnlyMinItemCount ?? 10) &&
    restaurant.officialAllergenStatus !== officialAllergenStatuses.sourceFoundUnparsed;
  const complete =
    (totalItemCount > 0 &&
      meetsMinimumItemCount &&
      coveragePercent >= (adapter.coverageRequiredPercent ?? 100)) ||
    meetsMenuOnlyFallbackQuality ||
    meetsPartialOfficialFallbackQuality ||
    meetsReviewedMenuOnlyFallbackQuality;

  return cleanRestaurantSnapshot({
    ...restaurant,
    coveragePercent,
    coverageStatus: complete ? coverageStatuses.complete : coverageStatuses.blocked,
    lastKnownGoodAt: complete ? generatedAt : restaurant.lastKnownGoodAt ?? null,
    regionalScope: adapter.regionalScope,
    sourceUpdatedAt: generatedAt,
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      officialEvidenceBucket: officialEvidence.bucket,
    },
    allergenDataStatus: {
      ...restaurant.allergenDataStatus,
      officialItemCount,
      officialEvidence,
    },
  });
}

export function combinePreviousKnownGoodRepositories(...repositories) {
  const previousById = new Map();

  for (const repository of repositories) {
    for (const restaurant of repository?.restaurants ?? []) {
      if (isEligiblePreviousKnownGood(restaurant)) {
        previousById.set(restaurant.id, restaurant);
      }
    }
  }

  return {
    restaurants: Array.from(previousById.values()),
    snapshotVersion,
  };
}

export function applyCoverageGate(repository, previousRepository = null) {
  const previousById = new Map(
    (previousRepository?.restaurants ?? [])
      .filter((restaurant) => isEligiblePreviousKnownGood(restaurant))
      .map((restaurant) => [restaurant.id, restaurant]),
  );
  const manifest = {
    blocked: [],
    keptPrevious: [],
    published: [],
  };

  const restaurants = repository.restaurants.map((restaurant) => {
    const previous = previousById.get(restaurant.id);

    if (previous && shouldKeepPreviousInsteadOfRefresh(restaurant, previous)) {
      return keepPreviousSnapshot({
        manifest,
        previous,
        repository,
        restaurant,
        reason: refreshRegressionReason(restaurant, previous),
      });
    }

    if (restaurant.coverageStatus === coverageStatuses.complete) {
      manifest.published.push({
        id: restaurant.id,
        coveragePercent: restaurant.coveragePercent,
        itemCount: restaurant.items.length,
      });
      return cleanRestaurantSnapshot(restaurant);
    }

    if (previous) {
      return keepPreviousSnapshot({
        manifest,
        previous,
        repository,
        restaurant,
        reason: "Refresh did not meet 100% official coverage.",
      });
    }

    manifest.blocked.push({
      id: restaurant.id,
      coveragePercent: restaurant.coveragePercent,
      itemCount: restaurant.items.length,
      reason: "No previous 100% official snapshot exists.",
    });

    return cleanRestaurantSnapshot(restaurant);
  });

  return {
    manifest,
    repository: {
      ...repository,
      itemCount: restaurants.reduce((count, restaurant) => count + restaurant.items.length, 0),
      restaurants,
      snapshotVersion,
    },
  };
}

function keepPreviousSnapshot({ manifest, previous, repository, restaurant, reason }) {
  const attemptedSourceMetadata = currentSourceMetadata(restaurant);
  const {
    officialAllergenRemediationBucket: attemptedOfficialAllergenRemediationBucket,
    officialAllergenStatus: attemptedOfficialAllergenStatus,
    sourceStatus: _attemptedSourceStatus,
    sourceUrls: _attemptedSourceUrls,
    ...attemptedClassificationMetadata
  } = attemptedSourceMetadata;
  const previousOfficialItemCount = officialItemCountForRestaurant(previous);
  const publishedOfficialAllergenStatus = resolvedKeptPreviousOfficialAllergenStatus({
    attemptedOfficialAllergenStatus,
    previous,
    previousOfficialItemCount,
  });

  manifest.keptPrevious.push({
    id: restaurant.id,
    attemptedCoveragePercent: restaurant.coveragePercent,
    keptSnapshotGeneratedAt: previous.sourceUpdatedAt ?? previous.lastKnownGoodAt,
    reason,
  });

  return cleanRestaurantSnapshot({
    ...previous,
    ...attemptedClassificationMetadata,
    officialAllergenRemediationBucket:
      previous.officialAllergenRemediationBucket ??
      (publishedOfficialAllergenStatus === officialAllergenStatuses.extracted
        ? "none"
        : attemptedOfficialAllergenRemediationBucket),
    officialAllergenStatus: publishedOfficialAllergenStatus,
    coverageStatus: coverageStatuses.keptPrevious,
    failedRefresh: {
      attemptedAt: repository.generatedAt,
      attemptedCoveragePercent: restaurant.coveragePercent,
      attemptedItemCount: restaurant.items.length,
      attemptedSourceMetadata,
      attemptedSourceStatus: restaurant.sourceStatus ?? null,
      reason,
    },
  });
}

function resolvedKeptPreviousOfficialAllergenStatus({
  attemptedOfficialAllergenStatus,
  previous,
  previousOfficialItemCount,
}) {
  if (
    previous.officialAllergenStatus === officialAllergenStatuses.sourceFoundUnparsed &&
    [
      officialAllergenStatuses.extracted,
      officialAllergenStatuses.notFound,
      officialAllergenStatuses.notApplicable,
    ].includes(attemptedOfficialAllergenStatus)
  ) {
    return attemptedOfficialAllergenStatus;
  }

  return (
    previous.officialAllergenStatus ??
    (previousOfficialItemCount > 0 ? officialAllergenStatuses.extracted : attemptedOfficialAllergenStatus)
  );
}

function shouldKeepPreviousInsteadOfRefresh(restaurant, previous) {
  if (restaurant.coverageStatus !== coverageStatuses.complete) {
    return false;
  }

  if (restaurant.officialAllergenStatus === officialAllergenStatuses.sourceFoundUnparsed) {
    return true;
  }

  if (restaurant.expectedSmallMenu === true) {
    return false;
  }

  if (
    restaurant.officialAllergenStatus === officialAllergenStatuses.extracted &&
    officialItemCountForRestaurant(restaurant) > 0
  ) {
    return false;
  }

  const currentItemCount = restaurant.items?.length ?? 0;
  const previousItemCount = previous.items?.length ?? 0;

  return (
    previousItemCount >= 10 &&
    currentItemCount > 0 &&
    currentItemCount < Math.max(10, Math.floor(previousItemCount * 0.25))
  );
}

function refreshRegressionReason(restaurant, previous) {
  if (restaurant.officialAllergenStatus === officialAllergenStatuses.sourceFoundUnparsed) {
    return "Refresh found an official source but did not extract enough official item-level data.";
  }

  return `Refresh item count regressed from ${previous.items?.length ?? 0} to ${restaurant.items?.length ?? 0}.`;
}

function currentSourceMetadata(restaurant) {
  return {
    brandKey: restaurant.brandKey,
    officialAllergenRemediationBucket: restaurant.officialAllergenRemediationBucket,
    officialAllergenStatus: restaurant.officialAllergenStatus,
    parserProfile: restaurant.parserProfile,
    sourceFamily: restaurant.sourceFamily,
    sourceProfile: restaurant.sourceProfile,
    sourceStatus: restaurant.sourceStatus,
    sourceUrls: restaurant.sourceUrls,
  };
}

function isEligiblePreviousKnownGood(restaurant) {
  if (
    restaurant.coverageStatus !== coverageStatuses.complete &&
    restaurant.coverageStatus !== coverageStatuses.keptPrevious
  ) {
    return false;
  }

  if (restaurant.id === "starbucks" && (restaurant.items?.length ?? 0) < 50) {
    return false;
  }

  if (isArtifactHeavyPreviousSnapshot(restaurant)) {
    return false;
  }

  return true;
}

function isArtifactHeavyPreviousSnapshot(restaurant) {
  const items = restaurant?.items ?? [];

  if (items.length === 0) {
    return false;
  }

  const artifactCount = items.filter((item) => {
    const text = `${item?.name ?? ""} ${item?.description ?? ""}`;
    return (
      staleSnapshotArtifactItemPatterns.some((pattern) =>
        pattern.test(String(item?.name ?? "").trim()),
      ) ||
      /\b(?:add additional fields|allow file uploads|collect custom order instructions|custom html field|discount codes|export form submissions|flexible input validation|get email notifications|inventory tracking|product option groups|receive submissions|recurring subscriptions|reliable protection|use data analysis)\b/i.test(
        text,
      )
    );
  }).length;

  return artifactCount >= 5 && artifactCount / items.length >= 0.4;
}

function cleanRestaurantSnapshot(restaurant) {
  const {
    allowUnavailableAllergenFallback: _allowUnavailableAllergenFallback,
    expectedSmallMenu: _expectedSmallMenu,
    snapshotVersion: _snapshotVersion,
    ...cleaned
  } = restaurant;
  const quarantinedItems = [];
  const seenItemKeys = new Set();
  const items = (restaurant.items ?? [])
    .map((item) => reconcileOfficialAllergenEvidence(item))
    .map((item) => applyManualItemDisplayCorrection(restaurant.id, item))
    .map((item) => ({
      original: item,
      sanitized: sanitizeMenuItemDisplayFields(item),
    }))
    .filter(({ original, sanitized }) => {
      const item = sanitized;

      if (isStaleSnapshotArtifactItem(item)) {
        quarantinedItems.push({
          id: item.id,
          kind: "stale-artifact",
          name: item.name,
          reasons: ["stale-snapshot-artifact"],
        });
        return false;
      }

      const classification = classifyMenuItemRow(original);
      const sanitizedClassification =
        classification.kind === "menu-item" ? classifyMenuItemRow(sanitized) : classification;
      const effectiveClassification =
        classification.kind === "menu-item" ? sanitizedClassification : classification;

      if (effectiveClassification.kind !== "menu-item") {
        quarantinedItems.push({
          id: item.id,
          kind: effectiveClassification.kind,
          name: item.name,
          reasons: effectiveClassification.reasons,
        });
        return false;
      }

      return true;
    })
    .map(({ sanitized }) => sanitized)
    .filter((item) => {
      const itemKey = normalizedMenuItemDedupeKey(item);

      if (seenItemKeys.has(itemKey)) {
        quarantinedItems.push({
          id: item.id,
          kind: "duplicate-menu-item",
          name: item.name,
          reasons: ["duplicate-after-quality-repair"],
        });
        return false;
      }

      seenItemKeys.add(itemKey);
      return true;
    });
  const restaurantForOfficialCount = {
    ...restaurant,
    items,
  };
  const officialItemCount = officialItemCountForRestaurant(restaurantForOfficialCount);
  const officialEvidence = officialEvidenceClassification(restaurantForOfficialCount);
  const sourceStatus = {
    ...(cleaned.sourceStatus ?? {}),
    officialEvidenceBucket: officialEvidence.bucket,
    ...(quarantinedItems.length > 0
      ? {
          discardedItemCount:
            (cleaned.sourceStatus?.discardedItemCount ?? 0) + quarantinedItems.length,
          quarantinedItemExamples: quarantinedItems.slice(0, 12),
        }
      : {}),
  };

  return {
    ...cleaned,
    items,
    sourceStatus,
    allergenDataStatus: {
      ...(cleaned.allergenDataStatus ?? {}),
      officialItemCount,
      officialEvidence,
    },
  };
}

function isOfficialItem(item) {
  return item?.officialSource === true || /official/i.test(item?.allergenSourceType ?? "");
}

const officialEvidenceAllergenMap = new Map([
  ["almond", "tree-nut"],
  ["almonds", "tree-nut"],
  ["cashew", "tree-nut"],
  ["cashews", "tree-nut"],
  ["coconut", "tree-nut"],
  ["coconuts", "tree-nut"],
  ["crustacean", "shellfish"],
  ["crustaceans", "shellfish"],
  ["dairy", "milk"],
  ["egg", "egg"],
  ["eggs", "egg"],
  ["fish", "fish"],
  ["gluten", "gluten"],
  ["milk", "milk"],
  ["mustard", "mustard"],
  ["nut", "tree-nut"],
  ["nuts", "tree-nut"],
  ["peanut", "peanut"],
  ["peanuts", "peanut"],
  ["sesame", "sesame"],
  ["sesame seeds", "sesame"],
  ["shellfish", "shellfish"],
  ["soy", "soy"],
  ["soybean", "soy"],
  ["soybean protein", "soy"],
  ["soybeans", "soy"],
  ["sulphites", "sulfites"],
  ["sulfites", "sulfites"],
  ["tree nut", "tree-nut"],
  ["tree nuts", "tree-nut"],
  ["wheat", "wheat"],
]);

function reconcileOfficialAllergenEvidence(item) {
  if (!isOfficialItem(item) || !Array.isArray(item?.evidence) || item.evidence.length === 0) {
    return item;
  }

  const direct = new Set(item.allergens ?? []);
  const may = new Set(item.mayContain ?? []);
  const crossContactNotes = [];

  for (const evidence of item.evidence) {
    const text = String(evidence?.text ?? "");
    const directFromEvidence = new Set(extractOfficialEvidenceAllergens(text, "contains"));

    for (const allergen of directFromEvidence) {
      direct.add(allergen);
      may.delete(allergen);
    }

    for (const allergen of extractOfficialEvidenceAllergens(text, "may")) {
      if (!direct.has(allergen)) {
        may.add(allergen);
      }
    }

    const crossContact = extractOfficialCrossContactEvidence(text);
    for (const allergen of crossContact.allergens) {
      if (!directFromEvidence.has(allergen)) {
        direct.delete(allergen);
        may.add(allergen);
      }
    }
    if (crossContact.note) {
      crossContactNotes.push(crossContact.note);
    }
  }

  const sourceSummary =
    crossContactNotes.length > 0 &&
    (!item.sourceSummary || /^official source row reviewed; no major concern marked in source row\.?$/i.test(item.sourceSummary))
      ? `Official dietary matrix note: ${crossContactNotes[0]}`
      : item.sourceSummary;

  if (
    setEquals(direct, new Set(item.allergens ?? [])) &&
    setEquals(may, new Set(item.mayContain ?? [])) &&
    sourceSummary === item.sourceSummary
  ) {
    return item;
  }

  return {
    ...item,
    allergens: [...direct].sort(),
    mayContain: [...may].sort(),
    sourceSummary,
  };
}

function extractOfficialEvidenceAllergens(text, mode) {
  const sourceText =
    mode === "contains"
      ? text.replace(/\bMay Contain:?\s*([\s\S]*?)(?=\bContains:|$)/gi, " ")
      : text;
  const pattern =
    mode === "may"
      ? /\bMay Contain:?\s*([^.;()]*?)(?=\bContains:|[.;()]|$)/gi
      : /\bContains:?\s*([^.;()]*?)(?=\bMay Contain:|[.;()]|$)/gi;
  const allergens = [];
  let match;

  while ((match = pattern.exec(sourceText))) {
    if (/\(\s*\)\s*$/i.test(sourceText.slice(Math.max(0, match.index - 8), match.index))) {
      continue;
    }

    if (
      mode === "contains" &&
      /\b(?:fried|cooked)\s+in\s+oil\b[^.]{0,120}\bused\s+to\s+fry\s+products?\s+that\s+contains?\b/i.test(
        sourceText.slice(Math.max(0, match.index - 140), match.index + match[0].length + 80),
      )
    ) {
      continue;
    }

    const labelText = match[1]
      .replace(/\bOfficial\s+.+?\s+allergen\s+row:\s*/gi, "")
      .replace(/\bnon[- ]?dairy(?:\s+\w+){0,3}\s+yogurt\b/gi, "")
      .replace(/\bnon[- ]?dairy\b/gi, "")
      .replace(/\bno allergen disclosure listed\b[\s\S]*$/i, "")
      .replace(/\.$/, "");
    const parts = labelText.split(/\s*,\s*|\s+and\s+|\s*\/\s*/i);

    for (const part of parts) {
      const normalized = part.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
      const mapped = officialEvidenceAllergenMap.get(normalized);

      if (mapped) {
        allergens.push(mapped);
      }
    }
  }

  return [...new Set(allergens)];
}

function extractOfficialCrossContactEvidence(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /\b(gluten|wheat|milk|dairy|egg|soy|sesame|fish|shellfish|peanuts?|tree nuts?|nuts?)\s*-\s*((?:cross[- ]?contamination|cross[- ]?contact|same fryer)[^.;]*)/i,
  );

  if (match) {
    const allergen = officialEvidenceAllergenMap.get(match[1].toLowerCase()) ?? null;

    return {
      allergens: allergen ? [allergen] : [],
      note: `${match[1].toLowerCase()} - ${match[2].trim()}`,
    };
  }

  const sharedOilMatch = normalized.match(
    /\b(?:fried|cooked)\s+in\s+oil\b[^.]{0,160}\bused\s+to\s+fry\s+products?\s+that\s+contains?\s+(gluten|wheat|milk|dairy|egg|soy|sesame|fish|shellfish|peanuts?|tree nuts?|nuts?)\b/i,
  );

  if (!sharedOilMatch) {
    return { allergens: [], note: null };
  }

  const allergen = officialEvidenceAllergenMap.get(sharedOilMatch[1].toLowerCase()) ?? null;

  return {
    allergens: allergen ? [allergen] : [],
    note: `shared frying oil may contact ${sharedOilMatch[1].toLowerCase()}`,
  };
}

function setEquals(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function isStaleSnapshotArtifactItem(item) {
  const name = String(item?.name ?? "").trim();
  return staleSnapshotArtifactItemPatterns.some((pattern) => pattern.test(name));
}

function applyManualItemDisplayCorrection(restaurantId, item) {
  const correction = manualItemDisplayCorrections.get(`${restaurantId}:${item?.id}`);

  if (!correction) {
    return item;
  }

  return {
    ...item,
    ...correction,
    sourceSummary: correction.sourceSummary ?? item.sourceSummary ?? correction.manualQualityNote,
    evidence: [
      ...(item.evidence ?? []),
      {
        text: correction.manualQualityNote,
        source: "manual-quality-review",
      },
    ],
  };
}

function normalizedMenuItemDedupeKey(item) {
  return [
    item?.id,
    item?.name,
    item?.category,
    item?.description,
  ]
    .map((part) =>
      String(part ?? "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("|");
}

export function validateRestaurantRepository(repository) {
  if (!repository || typeof repository !== "object") {
    return false;
  }

  if (repository.snapshotVersion !== snapshotVersion || !Array.isArray(repository.restaurants)) {
    return false;
  }

  return repository.restaurants.every(
    (restaurant) =>
      typeof restaurant.id === "string" &&
      typeof restaurant.coveragePercent === "number" &&
      typeof restaurant.coverageStatus === "string" &&
      Array.isArray(restaurant.items),
  );
}
