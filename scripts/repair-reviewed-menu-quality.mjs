import fs from "node:fs/promises";
import fsSync from "node:fs";

import {
  annotateMenuItemWithIngredientIntelligence,
  getDefaultIngredientIntelligenceManifest,
} from "./ingredient-intelligence.mjs";
import { extractEveryBiteWidgetRows } from "./pipeline/everybite-widget.mjs";
import {
  classifyMenuItemRow,
  officialEvidenceClassification,
  sanitizeMenuItemDisplayFields,
} from "./menu-item-quality.mjs";

const repositoryPath = "src/data/generated/restaurants.generated.json";
const reviewedRestoreRepositoryPath =
  "data/scraped/launch-coverage/final-1200-portfolio-01/repository.json";

if (process.argv.slice(2).length > 0) {
  console.error("repair-reviewed-menu-quality.mjs does not accept CLI arguments.");
  process.exit(2);
}

const lostDogOfficialAllergyGuide = {
  sourceUrl: "https://www.lostdogcafe.com/allergy-guide/",
  embeddedSourceUrl: "https://player.flipsnack.com?hash=RUFDQTlDNTU2OUIrNzFjYXhoeDRvdA==",
  title: "Lost Dog Cafe Allergen Guide 2024",
  pageCount: 16,
  parsedBy: "flipsnack-official-guide",
  summary:
    "Reviewed official Lost Dog Cafe allergy guide: the guide contains a global cross-contact disclaimer, ingredient/dietary flag tables, and modification-based guidance for gluten-free, dairy-free, vegan, soy-free, and egg-free orders. It is not a full direct-allergen matrix, so only explicit item-level contains statements are stored as direct official allergens.",
  notes: [
    "The guide says menu options may contact wheat/gluten, milk, eggs, peanuts, tree nuts, fish, shellfish, and soy during preparation.",
    "The guide provides modification guidance such as no pita/no croutons for gluten-free salads, no cheese/garlic butter/meat for vegan salads, and bread/crust/condiment choices for sandwiches and pizzas.",
    "Soy-free markings may still include highly refined soybean oil, which the guide says the FDA does not treat as an allergen.",
  ],
};

const reviewedAccommodationPolicies = {
  "the-inn-at-little-washington-va": {
    status: "partial-accommodation",
    scope: "experience",
    summary:
      "The Inn says it accommodates shellfish, pork, nuts, gluten, and dairy restrictions, but does not make further alterations beyond those and its vegetarian menu.",
    advanceNotice: "Before booking",
    supported: ["Shellfish", "Pork", "Nuts", "Gluten", "Dairy", "Vegetarian menu"],
    notSupported: ["Further tasting-menu alterations beyond listed categories"],
    notes: ["This is a destination restaurant outside DC proper but important for the DC metro audience."],
    sourceLabel: "Official dining room page",
    sourceType: "official-site",
    sourceUrl: "https://www.theinnatlittlewashington.com/michelin-starred-dining-room",
    sourceRetrievedAt: "2026-07-03",
  },
};

const foundingFarmersOfficialMenuContext = {
  "bananas-foster": {
    description:
      "A Bananas Foster topping option.",
    sourceUrl:
      "https://www.wearefoundingfarmers.com/scratch-madebreakfast/",
  },
  "maine-blueberry-compote": {
    description:
      "A wild Maine blueberry compote topping option.",
    sourceUrl:
      "https://www.wearefoundingfarmers.com/natures-best-blueberries/",
  },
};

function reviewedOfficialSourceSummary(item, parsedDirectAllergens, parsedMayContain, hasGlobalMayContainNotice) {
  const directCount = parsedDirectAllergens?.size ?? item?.allergens?.length ?? 0;
  const mayContainCount = parsedMayContain?.size ?? item?.mayContain?.length ?? 0;

  if (hasGlobalMayContainNotice && directCount === 0) {
    return "Reviewed official global allergen notice: stored as cross-contact caution, not direct item ingredients.";
  }

  if (mayContainCount > 0) {
    return "Reviewed official inline allergen wording: direct allergens and cross-contact concerns were parsed separately.";
  }

  if (directCount > 0) {
    return "Reviewed official row-level allergen evidence.";
  }

  return "Official source row reviewed; no major concern marked in source row.";
}

const reviewedMenuRowAdditions = [
  {
    restaurantId: "osm-il-pizzico-6595475668",
    rows: [
      {
        id: "carpaccio-di-manzo",
        name: "Carpaccio di manzo",
        category: "Antipasti",
        description: "Thin slices of raw beef served with shaved Parmigiano, mixed greens, and mustard sauce.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilpizzico.com/lunch-menu"],
      },
      {
        id: "prosciutto-e-mozzarella-di-bufala",
        name: "Prosciutto e mozzarella di bufala",
        category: "Antipasti",
        description: "Imported water buffalo mozzarella and prosciutto ham with olive oil.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilpizzico.com/lunch-menu"],
      },
      {
        id: "calamari-piccanti",
        name: "Calamari piccanti",
        category: "Antipasti",
        description: "Calamari stewed in a spicy tomato sauce with peas and garlic croutons.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilpizzico.com/lunch-menu"],
      },
      {
        id: "crostini-del-giorno",
        name: "Crostini del giorno",
        category: "Antipasti",
        description: "Wedges of toasted bread with today's topping.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilpizzico.com/lunch-menu"],
      },
      {
        id: "cozze",
        name: "Cozze",
        category: "Antipasti",
        description: "Mussels sauteed in white wine, parsley, and garlic or Napolitan tomato sauce.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilpizzico.com/lunch-menu"],
      },
      {
        id: "involtino-di-melanzane",
        name: "Involtino di melanzane",
        category: "Antipasti",
        description: "Grilled eggplant bundles filled with smoked mozzarella and ricotta with tomato sauce.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilpizzico.com/lunch-menu"],
      },
      {
        id: "caprese",
        name: "Caprese",
        category: "Antipasti",
        description: "Fresh mozzarella and tomatoes with basil and extra virgin olive oil.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilpizzico.com/lunch-menu"],
      },
    ],
    note: "Reviewed Il Pizzico lunch menu source: split collapsed Antipasti section text into source-backed appetizer rows and removed the section-heading row.",
  },
  {
    restaurantId: "osm-il-porto-ristorante-160692021",
    rows: [
      {
        id: "zuppa-del-giorno",
        name: "Zuppa del Giorno",
        category: "Antipasti",
        description: "Homemade soup of the day.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilportoristorante.com/brunch/", "https://www.ilportoristorante.com/dinner/"],
      },
      {
        id: "antipasto-della-casa",
        name: "Antipasto della Casa",
        category: "Antipasti",
        description: "Assorted Italian meats, cheese, marinated vegetables, and anchovies served on a bed of romaine lettuce.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilportoristorante.com/brunch/", "https://www.ilportoristorante.com/dinner/"],
      },
      {
        id: "buratta-all-caprese",
        name: "Buratta all Caprese",
        category: "Antipasti",
        description: "Italian fresh mozzarella with a soft center served with sliced fresh tomatoes, fresh basil, extra virgin olive oil, and balsamic glaze.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilportoristorante.com/brunch/", "https://www.ilportoristorante.com/dinner/"],
      },
      {
        id: "cozze",
        name: "Cozze",
        category: "Antipasti",
        description: "Mussels sauteed in white wine, parsley, and garlic or Napolitan tomato sauce.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilportoristorante.com/brunch/", "https://www.ilportoristorante.com/dinner/"],
      },
      {
        id: "calamari-fritti",
        name: "Calamari Fritti",
        category: "Antipasti",
        description: "Lightly fried calamari with a side of red marinara sauce.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilportoristorante.com/brunch/", "https://www.ilportoristorante.com/dinner/"],
      },
      {
        id: "bruschetta-il-porto",
        name: "Bruschetta Il Porto",
        category: "Antipasti",
        description: "Bruschetta al pomodoro served with creamy burrata cheese and imported prosciutto crisp.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.ilportoristorante.com/dinner/"],
      },
    ],
    note: "Reviewed Il Porto dinner/brunch menu source: split collapsed Antipasti section text into source-backed appetizer rows and removed the section-heading row.",
  },
  {
    restaurantId: "ambar-restaurant-capitol-hill-washington-dc-dc-metro",
    rows: [
      {
        id: "coke-can",
        name: "Coke (Can)",
        category: "Beverages",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "diet-coke-can",
        name: "Diet Coke (Can)",
        category: "Beverages",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "mexican-coke-bottle",
        name: "Mexican Coke Bottle",
        category: "Beverages",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "sprite-can",
        name: "Sprite (Can)",
        category: "Beverages",
        sourceType: "reviewed-menu-repair",
      },
    ],
    note: "Reviewed Ambar source evidence showed valid soft-drink menu rows were over-quarantined by a previous drink cleanup pass.",
  },
  {
    restaurantId: "ambar-restaurant-clarendon-arlington-va-dc-metro",
    rows: [
      {
        id: "coke-can",
        name: "Coke (Can)",
        category: "Beverages",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "diet-coke-can",
        name: "Diet Coke (Can)",
        category: "Beverages",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "mexican-coke-bottle",
        name: "Mexican Coke Bottle",
        category: "Beverages",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "sprite-can",
        name: "Sprite (Can)",
        category: "Beverages",
        sourceType: "reviewed-menu-repair",
      },
    ],
    note: "Reviewed Ambar source evidence showed valid soft-drink menu rows were over-quarantined by a previous drink cleanup pass.",
  },
  {
    restaurantId: "succotash-dc",
    rows: [
      {
        id: "shrimp-n-oysters-3-of-each",
        name: "Shrimp'n'Oysters (3 of each)",
        category: "Starters",
        description: "Three shrimp and three oysters.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: [
          "https://www.succotashrestaurant.com/wp-content/uploads/2025/05/Succotash-NH-Lunch-5.23.25.pdf",
          "https://www.succotashrestaurant.com/wp-content/uploads/2025/05/Succotash-NH-Brunch-5.23.25.pdf",
        ],
      },
      {
        id: "nanas-banana-pudding",
        name: "Nana's Banana Pudding",
        category: "Desserts",
        description: "House-made vanilla wafers, bourbon caramel.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: [
          "https://www.succotashrestaurant.com/wp-content/uploads/2025/05/Succotash-Prime-Dessert_one-up-5.12.25.pdf",
        ],
      },
      {
        id: "mint-julep-ice-cream",
        name: "Mint Julep Ice Cream",
        category: "Desserts",
        description: "Smoked sugar, bourbon syrup, tea cookie.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: [
          "https://www.succotashrestaurant.com/wp-content/uploads/2025/05/Succotash-Prime-Dessert_one-up-5.12.25.pdf",
        ],
      },
      {
        id: "chocolate-bourbon-pecan-pie",
        name: "Chocolate Bourbon Pecan Pie",
        category: "Desserts",
        sourceType: "reviewed-menu-repair",
        sourceUrls: [
          "https://www.succotashrestaurant.com/wp-content/uploads/2025/05/Succotash-Prime-Supper-Menu-5.12.25.pdf",
        ],
      },
      {
        id: "hummingbird-cake-truffles",
        name: "Hummingbird Cake Truffles",
        category: "Desserts",
        sourceType: "reviewed-menu-repair",
        sourceUrls: [
          "https://www.succotashrestaurant.com/wp-content/uploads/2025/05/Succotash-Prime-Supper-Menu-5.12.25.pdf",
        ],
      },
    ],
    note: "Reviewed Succotash PDF evidence showed dessert rows were merged into neighboring item descriptions by PDF extraction.",
  },
  {
    restaurantId: "joe-s-seafood-prime-steak-and-stone-crab-washington-dc-dc-metro",
    rows: [
      {
        id: "joes-fried-chicken",
        name: "Joe's Fried Chicken",
        category: "Chicken",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.joes.net/washington-dc/menus"],
      },
      {
        id: "herb-roasted-chicken",
        name: "Herb Roasted Chicken",
        category: "Chicken",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.joes.net/washington-dc/menus"],
      },
    ],
    note: "Reviewed Joe's menu evidence showed the parser collapsed the Chicken section into one row containing Joe's Fried Chicken and Herb Roasted Chicken.",
  },
  {
    restaurantId: "lebanese-taverna-dc",
    rows: [
      {
        id: "ice-cream-trio",
        name: "Ice Cream Trio",
        category: "Desserts",
        description: "Pistachio-orange, honey, vanilla-cardamom.",
        sourceType: "reviewed-menu-repair",
        sourceUrls: ["https://www.lebanesetaverna.com/lebanese-taverna-menu"],
      },
    ],
    note: "Reviewed Lebanese Taverna menu evidence showed the Ice Cream Trio row was merged into the Awamat row.",
  },
  {
    restaurantId: "osm-layla-s-lebanese-5550599614",
    rows: [
      {
        id: "hummus",
        name: "Hummus",
        category: "Cold Mezze",
        description: "Garbanzo beans, tahini, fresh lemon juice, garlic, and olive oil.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "black-bean-hummus",
        name: "Black Bean Hummus",
        category: "Cold Mezze",
        description: "Black beans, tahini, fresh lemon juice, garlic, and olive oil.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "baba-gannouj",
        name: "Baba Gannouj",
        category: "Cold Mezze",
        description: "Smoked eggplant, tahini, fresh lemon juice, garlic, and olive oil.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "grape-leaves",
        name: "Grape Leaves",
        category: "Cold Mezze",
        description: "Vine leaves with onion, parsley, lemon juice, and olive oil.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "crispy-chicken-wings",
        name: "Crispy Chicken Wings",
        category: "Appetizers",
        description: "Six deep-fried wings tossed in tangy homemade sauce.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "arayes",
        name: "Arayes",
        category: "Appetizers",
        description: "Baked open-faced pita with seasoned ground beef, onion, parsley, tomato, and pine nuts.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "moujadara",
        name: "Moujadara",
        category: "Mezze",
        description: "Lentils, rice, and caramelized onions.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "tabouleh",
        name: "Tabouleh",
        category: "Mezze",
        description: "Chopped parsley, onion, tomato, crushed bulgur, lemon, and olive oil dressing.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "mixed-grill",
        name: "Mixed Grill",
        category: "From the Grill",
        description: "Lamb, chicken, kafta, grilled vegetables, and Garlic Whip.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "shish-tawouk",
        name: "Shish Tawouk",
        category: "From the Grill",
        description: "Grilled chicken kabob with grilled vegetables, Garlic Whip, and french fries or rice.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "beef-kabob",
        name: "Beef Kabob",
        category: "From the Grill",
        description: "Grilled chunks of ribeye steak with grilled vegetables and Garlic Whip.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "shish-tawouk-platter",
        name: "Shish Tawouk Platter",
        category: "Platters",
        description: "Chicken kabob with marinated chicken breast, vegetables, and Garlic Whip.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "beef-kabob-platter",
        name: "Beef Kabob Platter",
        category: "Platters",
        description: "Marinated chunks of beef with rice, vegetables, and Garlic Whip.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "kafta-kabob-platter",
        name: "Kafta Kabob Platter",
        category: "Platters",
        description: "Ground beef, parsley, onion, red onion, sumac, rice, and Garlic Whip.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "chicken-shawarma-platter",
        name: "Chicken Shawarma Platter",
        category: "Platters",
        description: "Sliced marinated chicken breast with vegetables, rice, and Garlic Whip.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "caesar-salad",
        name: "Caesar Salad",
        category: "Soups & Salads",
        description: "Romaine, parmesan, and Caesar dressing.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "fattoush",
        name: "Fattoush",
        category: "Soups & Salads",
        description: "Mixed greens, fresh vegetables, Layla's dressing, and toasted pita bread.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "house-salad",
        name: "House Salad",
        category: "Soups & Salads",
        description: "Mixed greens, fresh vegetables, and Layla's dressing.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "lentil-soup",
        name: "Lentil Soup",
        category: "Soups & Salads",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "chicken-noodle-soup",
        name: "Chicken Noodle Soup",
        category: "Soups & Salads",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "batenjan-mehshi",
        name: "Batenjan Mehshi",
        category: "Stews",
        description: "Open-faced eggplants with ground beef, onion, pine nuts, and tomato stew.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "kafta-b-tata",
        name: "Kafta B'Tata",
        category: "Stews",
        description: "Lamb kafta, potato chunks, and tomato stew.",
        sourceType: "reviewed-menu-repair",
      },
      {
        id: "moussaka",
        name: "Moussaka",
        category: "Stews",
        description: "Seasonal vegetables, onion, garlic, and tomato stew.",
        sourceType: "reviewed-menu-repair",
      },
    ],
    note: "Reviewed Layla's source evidence showed testimonials and section blobs were mixed into menu rows; split visible menu evidence into clean dishes.",
  },
];

const reviewedMenuRowRestorations = [
  {
    restaurantId: "tropical-smoothie-cafe",
    itemIds: [
      "24-oz-watermelon-mojito-smoothie-add-half-turbinado",
      "24-oz-watermelon-mojito-smoothie-add-splenda",
      "24-oz-watermelon-mojito-smoothie-full-turbinado",
      "24-oz-watermelon-mojito-smoothie-no-turbinado",
    ],
    note: "Reviewed official Tropical Smoothie evidence showed these Watermelon Mojito Smoothie variants are smoothie menu rows, not alcohol rows.",
  },
  {
    restaurantId: "baskin-robbins",
    itemIds: ["daiquiri-ice"],
    note: "Reviewed Baskin-Robbins source evidence showed Daiquiri Ice is an ice cream flavor, not an alcohol row.",
  },
  {
    restaurantId: "california-pizza-kitchen",
    itemIds: ["barqs-root-beer"],
    note: "Reviewed California Pizza Kitchen source evidence showed Barq's Root Beer is a valid soft-drink menu row, not an alcohol row.",
  },
  {
    restaurantId: "founding-farmers-dc",
    itemIds: ["spinach-bacon-blue"],
    note: "Reviewed Founding Farmers source evidence showed Spinach Bacon Blue is a food row; champagne/sherry wording refers to vinaigrette.",
  },
  {
    restaurantId: "the-smith-penn-quarter-dc",
    itemIds: ["the-raw-bar-special"],
    note: "Reviewed The Smith source evidence showed the Raw Bar Special includes oysters and should remain a food row despite martini wording.",
  },
];

const reviewedRecoverySuppressions = new Map([
  [
    "tupelo-honey-southern-kitchen-and-bar-arlington-va-dc-metro",
    new Set(["dollar1799-970-cal"]),
  ],
  [
    "iron-gate-restaurant-washington-dc-dc-metro",
    new Set(["non-alcoholic"]),
  ],
  [
    "osm-il-pizzico-6595475668",
    new Set(["antipasti", "antipasti-dinner"]),
  ],
  [
    "osm-il-porto-ristorante-160692021",
    new Set(["antipasti"]),
  ],
  [
    "replacement-elizabeth-s-washington-dc",
    new Set(["first"]),
  ],
  [
    "philippe-chow-dc-washington-dc-dc-metro",
    new Set(["crunchy-baby-bok-choy-14-gfdfnfsignature-garlic-sauce"]),
  ],
  [
    "succotash-dc",
    new Set(["shrimpnoysters-3-of-each-dollar", "shrimpnoysters-3-of-each-dollar18-00"]),
  ],
  [
    "joe-s-seafood-prime-steak-and-stone-crab-washington-dc-dc-metro",
    new Set(["chicken"]),
  ],
  [
    "elephant-and-castle-washington-dc-dc-metro",
    new Set(["sausage"]),
  ],
  [
    "blue-ridge-seafood-restaurant-gainesville-va",
    new Set(["four-jumbo-shrimp-topped-with-our-homemade-crabmeat-stuffing"]),
  ],
  [
    "planta-bethesda-bethesda-md-dc-metro",
    new Set(["kids-menufor-children", "late-night-happy-hour", "monday-sunday-open-to-close", "sunday-sauceweekly-family-style-italian-feast-in-bethesda"]),
  ],
  [
    "pappe-dc",
    new Set(["foodborneillness", "riskoffoodborneillness"]),
  ],
  [
    "maydan-dc",
    new Set(["egg-feta", "free-spirited", "lamb-shish"]),
  ],
  [
    "jinya-ramen-dc",
    new Set(["chefs-special"]),
  ],
  [
    "bantam-king-dc",
    new Set([
      "chicken-and-sides",
      "fried-chicken",
      "hot-white-rice-topped-with-a-slow-cooked-egg-and-soy-sauce-halal",
      "japanese-fish-cake",
      "ko-hitime",
      "made-with-valrhona-chocolate-and",
      "marinated-soft-boiled-egg-not-vegetarian",
      "miso-and-sesame-seeds-come-together-to-compliment-our-chicken-paitan-stock",
      "ramen",
      "rich-and-runny-egg-poached-in-its-shell",
      "valrhona-chocolate-and-rendered-chicken-fat-come-together-to-create-this-decadent-cookie",
      "weekday-lunch-deal",
    ]),
  ],
  [
    "busboys-and-poets-dc",
    new Set([
      "get-tickets",
      "gluten-free-friendly-vegan-caesar-salad",
      "jyna-maeng-presents-queen-of-whispers-a-book-release-and-reading",
    ]),
  ],
  [
    "dos-toros-dc",
    new Set(["rise-and-roll"]),
  ],
  [
    "playa-bowls-dc",
    new Set(["our"]),
  ],
  [
    "burtons-grill-and-bar-washington-dc-dc-metro",
    new Set([
      "bloody-maria",
      "derby-street-coffee",
      "gluten-free-burgers-and-sandwiches",
      "gluten-free-kids",
      "mediterranean-chicken-risot-to",
      "shor-t-rib-grilled-cheese",
      "spinach-and-ar-tichoke-dip",
      "chicken-mil-anese-alfredo",
      "chicken-piccata",
      "cl-assic-burger",
      "cl-assic-cuts",
      "ex-tras",
      "steak",
    ]),
  ],
  [
    "replacement-seray-vienna-va",
    new Set(["baked-cheese-gf", "salad-toppings"]),
  ],
  [
    "chennai-hoppers-indian-restaurant-gaithersburg-md-dc-metro",
    new Set([
      "customize-background-color",
      "customize-border-color",
      "instant-updates",
      "number-of-social-connections",
    ]),
  ],
  [
    "silverado-annandale-va-dc-metro",
    new Set(["utenslis"]),
  ],
  [
    "perry-s-restaurant-washington-dc-dc-metro",
    new Set([
      "eikun-waterlords-junmai",
      "fontaniels",
      "kamoizumi-komekome-happy-bride",
      "kasume-tsusu-kimoto-extra-dry",
      "liquid-geography",
      "masako-morishita-awarded-rising-culinary-star-of-the-year-at-the-rammys",
      "emerging-chef-winner-masako-morishita-on-achieving-her-american-dream",
      "sawahime-yamahai",
      "spicy-mayo",
      "eel-sauce",
      "mains",
      "soupsalads",
      "theres-more-than-sushi-in-store-at-this-always-evolving-japanese-restaurant",
      "timeslotson-the-quarter-hour-1030am-1245pm",
      "we-use-non-gmo-rice-bran-oil-for-cooking-and-frying-instead-of-generic-vegetable-seed-oils",
    ]),
  ],
  [
    "stone-s-cove-kitbar-herndon-va-dc-metro",
    new Set([
      "fountain-drink-coke",
      "fountain-drink-diet-coke",
      "fountain-drink-mr-pibb",
      "fountain-drink-sprite",
      "hot-tea",
      "kids-milk",
      "large",
      "maine-root-soda",
    ]),
  ],
  [
    "four-sisters-grill-arlington-va",
    new Set(["rice", "soups", "traditional-vietnamese-noodle-soup-with-a-delicate-broth"]),
  ],
  [
    "northside-social-va",
    new Set(["dog-bones", "pesto"]),
  ],
  [
    "charley-chesapeake-chophouse-gaithersburg-md",
    new Set(["5-spice-pork-shoulder-and-crispy-rice-3"]),
  ],
  [
    "chima-steakhouse-tysons-tysons-va-dc-metro",
    new Set(["sausage"]),
  ],
  [
    "silver-bethesda-md-dc-metro",
    new Set(["avocado-toast-1-serving-grilled-branzino", "house-made-riccotta-toast-1-serving-pub-style-fish-chips"]),
  ],
  [
    "rakuya-dc",
    new Set(["milbrandt", "oberon"]),
  ],
  [
    "yardbird-washington-dc-dc-metro",
    new Set(["pick-your-flavor-honey-hot"]),
  ],
  [
    "the-flying-mexican-washington-dc-dc-metro",
    new Set(["pick-4-frozen-flight"]),
  ],
  [
    "replacement-cafe-fiorello-dc-washington-dc",
    new Set(["pick-3-vegetables"]),
  ],
  [
    "inca-social-vienna-va-dc-metro",
    new Set(["kids-monday"]),
  ],
  [
    "replacement-marx-cafe-revolutionary-cuisine-washington-dc",
    new Set([
      "bacon-cheese-burger",
      "brunch-classics",
      "chicken-wings",
      "cup",
      "egg-benedicts",
      "hamburgers",
      "late-night",
      "main-plates",
      "marx-burger",
      "omelets",
      "pastas",
      "pikilia-platter",
      "reg",
      "soup-and-salads",
      "tiramisu",
      "veggie-options",
    ]),
  ],
  [
    "chain-pizza-boli-s",
    new Set([
      "halal-offerings",
      "special-deals",
      "gluten-free-crust",
      "all-pasta-trays-served-with-garlic-bread-10-servings-per-tray",
      "american-cheese",
      "bacon",
      "ben-and-jerrys-choco-chip-cookie-dough",
      "blue-cheese",
      "blue-cheese-dipping-cup-230-210-na",
      "bolisr",
      "breaded-chicken",
      "breadsticks-with-cheese",
      "buffalo-crispy-chicken-wrap-flour-tortilla",
      "buffalo-crispy-chicken-wrap-whole-wheat-tortilla",
      "burger-sub",
      "carrot-cake",
      "cheesesteak-fantastic-fries-763-186-na-15-14-na",
      "chicken-caesar-wrap-flour-tortilla",
      "chicken-caesar-wrap-whole-wheat-tortilla",
      "chicken-cheeseseak-sub",
      "chicken-fettuccini-alfredo-pasta",
      "chicken-filet-sub",
      "chicken-parmesan-1162-78-na",
      "chicken-steak-meat",
      "chicken-steak-sub-380-na-na",
      "chicken-steak-sub-500-na-na",
      "chicken-tenders-platter-3-pcs-with-crispy-fries-857-93-na",
      "chicken-tenders-platter-5-pcs-with-crispy-fries-1376-140-na",
      "chicken-wings",
      "chocolate-cake",
      "crab",
      "creamy-alfredo-sauce-381-na-na",
      "crispy-chicken-tenders",
      "crispy-french-fries-l",
      "crispy-french-fries-s",
      "crispy-french-fries-with-cheddar-cheese-sauce-756-196-na",
      "feta-cheese",
      "fettuccini-pasta-340-na",
      "garden-salad-large",
      "garden-salad-small",
      "garlic-bread-with-cheese-938-na-na",
      "green-olives",
      "grilled-chicken-breast",
      "grilled-chicken-sub",
      "grilled-marinated-chicken-breast",
      "ground-beef",
      "ham-and-cheese-sub",
      "italian-meatball-sub",
      "italian-sausage",
      "jumbo-shrimp-platter-761-93-na",
      "lasagna-pasta-with-meat-sauce-1252-283-na",
      "liquid-garlic-sauce",
      "login",
      "marinara-sauce",
      "marinara-sauce-162-63-na",
      "meatballs",
      "mozzarella-cheese-270-na-na",
      "mozzarella-sticks-6-pcs-960-270-na",
      "mushroom",
      "mushrooms",
      "pasta-orders-are-served-with-a-side-of-garlic-bread",
      "pepperoni",
      "philly-cheesesteak-fantastic-fries-618-185-na",
      "pizza-bolis-cheese",
      "pizza-fantastic-fries-781-140-na-17-16-na",
      "pizza-sauce-side",
      "provolone-cheese",
      "red-bull",
      "salad-comes-with-your-choice-of-dressings-10-servings-per-bowl",
      "seafood-fettuccini-alfredo-pasta",
      "shrimp",
      "shrimp-grilledseared",
      "shrimp-cheesesteak-sub",
      "shrimp-chicken-cheesesteak-sub",
      "shrimp-fettuccini-alfredo-pasta",
      "sirloin-steak-meat",
      "spaghetti-pasta-340-15-na",
      "spaghetti-pasta-with-marinara-sauce-and-meatballs",
      "spaghetti-wmeatballs-tray",
      "steak-sub",
      "subs-and-sandwiches",
      "try-our-new-menu-items",
      "tuna-salad",
      "tuna-salad-sub",
      "tuna-salad-wrap-flour-tortilla",
      "tuna-salad-wrap-whole-wheat-tortilla",
      "veggie-fettuccini-alfredo-pasta",
      "western-fries-l",
      "western-fries-s",
      "western-fries-with-cheddar-cheese-sauce-672-120-na",
      "wings-baked",
      "wings-boneless-bites-baked",
      "wings-boneless-bites-fried-84-28-na",
      "wings-fried-112-53-na",
      "bbq",
      "plain",
      "bolis-bundle",
      "large-2-topping-pizza",
      "pizza-and-wings-combo",
      "sandwich-combo-for-just",
      "unbolivable-stuffed-crust-medium-1-topping-pizza",
    ]),
  ],
  [
    "osm-karahi-boys-13475305897",
    new Set(["cad", "category-naan-bread-cad"]),
  ],
  [
    "mi-la-cay-wheaton-md-dc-metro",
    new Set(["rice-dishes"]),
  ],
  [
    "replacement-the-lafayette-washington-dc",
    new Set(["zucchini-fresh-herbs-wild-mushrooms-fricassee"]),
  ],
  [
    "replacement-sfizi-cafe-falls-church-va",
    new Set(["pick-up-orders"]),
  ],
  [
    "rasika-penn-quarter-dc",
    new Set(["kelt-vsop"]),
  ],
  [
    "replacement-marley-s-bar-and-grill-hyattsville-md",
    new Set(["main-entreesrasta-pasta"]),
  ],
  [
    "replacement-the-daily-dish-silver-spring-md",
    new Set(["wilted-fresh-greens"]),
  ],
  [
    "cane-dc",
    new Set([
      "12-hour-marinated",
      "personal-omnivore-serves-1-choose-1-protein-beef",
      "pineapple-chowmango-chutneyculantro-saucechadon-benitamarind-saucehouse-pepper-sauceeach",
    ]),
  ],
  [
    "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro",
    new Set(["for-kids-under-12"]),
  ],
  [
    "replacement-redrocks-pizza-washington-dc",
    new Set(["caesar-saladdollar7"]),
  ],
  [
    "replacement-nue-elegantly-vietnamese-falls-church-va",
    new Set(["chili-oil-wontons-n"]),
  ],
  [
    "rooster-owl-dc",
    new Set(["kimchi-honey-s", "kimchi-honey-s-large", "thai-green-chili-sauce-large"]),
  ],
  [
    "bartaco-wharf-dc",
    new Set(["cauliflower", "mediterranean-cauliflower"]),
  ],
  [
    "two-fifty-bbq-dc",
    new Set(["sausage"]),
  ],
  [
    "not-your-average-joe-s-reston-reston-va-dc-metro",
    new Set(["burgers-and-more", "gluten-sensitive"]),
  ],
  [
    "district-taco-dc",
    new Set([
      "chips-and-salsaquesoguacamolerice-and-beanschurrosand-more",
      "sides-and-more",
      "try-a-churrito",
    ]),
  ],
  [
    "sweetgreen-dc",
    new Set(["we-also-recently-added-a-crispy-rice-treat-as-our-first-dessert"]),
  ],
  [
    "bistro-l-hermitage-woodbridge-va-dc-metro",
    new Set(["les-entrees", "les-entreesles-poissons"]),
  ],
  [
    "cactus-cantina-dc",
    new Set([
      "bbq-salad-copy",
      "brochette-pl-copy",
      "cajeta-copy",
      "cantina-salad-copy",
      "carne-asada-copy",
      "chile-rellenos-platter-copy",
      "chimichanga-copy",
      "churros-copy",
      "costillas-copy",
      "crispy-taco-platter-copy",
      "del-mar-copy",
      "diablo-pl-copy",
      "el-paso-deluxe-pl-copy",
      "flan-copy",
      "guadalajara-pl-copy",
      "ice-cream-copy",
      "laredo-pl-copy",
      "matamoros-copy",
      "monterey-salad-copy",
      "pechuga-de-pollo-copy",
      "plato-gordo-copy",
      "reynosa-grande-pl-copy",
      "salmon-a-la-parrilla-copy",
      "santa-fe-pl-copy",
      "six-sopapillas-copy",
      "soft-taco-platter-copy",
      "sunshine-salad-copy",
      "tacos-al-carbon-platter-copy",
      "three-enchilada-pl-copy",
      "three-sopapillas-copy",
      "tijuana-copy",
    ]),
  ],
  [
    "ben-s-next-door-washington-dc-dc-metro",
    new Set([
      "buffalo-hot-cauliflower-8oz-rw-lunch-copy",
      "fried-popcorn-shrimp-copy",
      "hot-fyah-jamaican-jerk-wings-dinner-copy",
      "house-made-chicken-noodle-soup-copy",
      "korean-barbecue-wings-copy",
      "no-bone-wings-copy",
      "signature-bone-in-wings-8-copy",
    ]),
  ],
  [
    "ninety-second-pizza-georgetown-dc",
    new Set(["tiramisu-copy"]),
  ],
  [
    "takumi-navy-yard-dc",
    new Set(["rice-and-noodle-tray-copy"]),
  ],
  [
    "bethesda-bagels-dc",
    new Set(["salad-copy"]),
  ],
  [
    "bethesda-bagels-wildwood-dc-metro",
    new Set(["salad-copy"]),
  ],
  [
    "yume-sushi-arlington-dc-metro",
    new Set(["sashimi-roll-copy"]),
  ],
  [
    "carbonara-arlington-va-dc-metro",
    new Set(["warm-molten-chocolate-lava-cake-copy"]),
  ],
  [
    "replacement-the-wharf-alexandria-va",
    new Set(["crab-cocktail-copy"]),
  ],
  [
    "replacement-seray-vienna-va",
    new Set(["baked-cheese-gf", "chicken-tawok-copy", "salad-toppings"]),
  ],
  [
    "pappe-dc",
    new Set(["brunch", "dinner", "foodborneillness", "riskoffoodborneillness"]),
  ],
  [
    "estuary-dc",
    new Set(["addavocadosmash", "pickyourprotein"]),
  ],
  [
    "entyse-tysons-va",
    new Set(["flexible-dates"]),
  ],
  [
    "restaurant-1789-dc",
    new Set(["aclydesrestaurantgroupconcept"]),
  ],
  [
    "ocean-prime-dc",
    new Set(["generalmanagertimmanley"]),
  ],
  [
    "green-pig-bistro-arlington-va-dc-metro",
    new Set([
      "bottles-and-cans",
      "elderflowerelixir",
      "goodvibes",
      "i-pa",
      "maple-and-rosemaryold-fa-shioned",
      "sat-and-sun",
      "sparkling",
      "theppp",
    ]),
  ],
  [
    "osm-josephine-204948014",
    new Set([
      "chanter",
      "chicken-10-shrimp",
      "chicken-10-shrimp-12-split",
      "drip-coffee",
      "pear-pressure",
      "sipn-in-the-patch",
      "steak-14-salmon-12-chicken-10-shrimp-12-split",
    ]),
  ],
  [
    "silver-and-sons-bbq-bethesda-md",
    new Set(["premium"]),
  ],
  [
    "tuscarora-mill-restaurant-leesburg-va-dc-metro",
    new Set([
      "and-parmesan-polenta-in-saffron-tomato-broth",
      "asparagus-carrots-and-capers",
      "bacon-potato-hay",
      "breakfast-potatoes-and-hollandaise",
      "feta-and-honey-mustard-vinaigrette",
      "green-onions",
      "harissa-aioli-16",
      "main-courses",
      "peppers-red-onions-harissa-cilantro-sauce",
      "sandwiches-and-such",
      "small-salad-or-fruit-bowl",
      "snacks-and-shared-plates",
      "wild-mushrooms-and-bacon-fig-sauce",
    ]),
  ],
  [
    "amphoras-diner-deluxe-herndon-va-dc-metro",
    new Set(["april", "aug", "topreviewourfullmenuvisitourwebsite"]),
  ],
  [
    "osm-amphora-diner-deluxe-152763392",
    new Set(["april", "aug", "topreviewourfullmenuvisitourwebsite"]),
  ],
  [
    "circa-at-foggy-bottom-washington-dc-dc-metro",
    new Set(["entr-e", "heineken"]),
  ],
  [
    "osm-circa-2788369922",
    new Set(["entr-e"]),
  ],
  [
    "osm-aandj-9382941658",
    new Set(["buns-dumplings-and-breads-deep-copy", "noodles-deep-copy", "rice-deep-copy"]),
  ],
  [
    "barcelona-wine-bar-washington-dc-dc-metro",
    new Set(["montelobos-joven"]),
  ],
  [
    "sweetgreen-dc",
    new Set(["in-an-eco-friendly-aluminum-bottle-for-plastic-free-oceans"]),
  ],
  [
    "bantam-king-dc",
    new Set(["1130-am-to-230-pm-lunch-5-pm-to-9-pm-dinner"]),
  ],
  [
    "matchbox-capitol-hill-dc",
    new Set(["soda-tea-lemonade-water"]),
  ],
  [
    "osm-ay-e-meze-lounge-13134929927",
    new Set(["hotdrinksdessertcocktails"]),
  ],
  [
    "replacement-1310-kitchen-and-bar-washington-dc",
    new Set(["flatbreads", "grilledsaladadditions"]),
  ],
  [
    "replacement-cocineros-hyattsville-md",
    new Set(["appetizers-appetizers", "cheese", "chicken-wings-chicken-wings"]),
  ],
  [
    "plaka-grill-vienna-va-dc-metro",
    new Set(["templates"]),
  ],
  [
    "replacement-south-house-garden-gaithersburg-md",
    new Set(["templates"]),
  ],
  [
    "no-goodbyes-dc",
    new Set(["coldbrew", "cortado"]),
  ],
  [
    "rumi-s-kitchen-dc-washington-dc-dc-metro",
    new Set(["tea-and-coffee"]),
  ],
  [
    "the-grill-washington-dc-dc-metro",
    new Set(["house-salad-or-clam-chowder"]),
  ],
  [
    "bistro-du-jour-washington-dc-dc-metro",
    new Set(["cotes"]),
  ],
  [
    "succotash-dc",
    new Set(["belles-kiss"]),
  ],
  [
    "el-patio-randolph-rockville-md-dc-metro",
    new Set(["6-units", "grilled-chicken-white-meat"]),
  ],
  [
    "osm-perfect-pita-2245478989",
    new Set(["bluecheese", "whitepizza"]),
  ],
  [
    "silver-diner-dc",
    new Set(["double-smoked-corn-cobb-bacon", "mint-garnish-110-cal"]),
  ],
  [
    "the-queen-vic-washington-dc-dc-metro",
    new Set(["england-5percent"]),
  ],
  [
    "osm-bai-khao-thai-3763902064",
    new Set(["noodles-and-friedric-ec-hoiceofprotein"]),
  ],
  [
    "osm-black-hog-8285173071",
    new Set(["withoutmeat-seeabove"]),
  ],
  [
    "osm-kare-3094959244",
    new Set(["kare-bar-kare-bar", "ponzu-and-olive-oil"]),
  ],
  [
    "replacement-bistro-cacao-washington-dc",
    new Set(["nitro-cold-brew", "saladsaddon"]),
  ],
  [
    "replacement-the-little-grand-washington-dc",
    new Set(["anxo-cidre-blanc-dc-69-abv", "laurent-egoista-orange-viognier-cl", "plates"]),
  ],
  [
    "replacement-cynthia-bar-and-bistro-washington-dc",
    new Set(["red-fruit-casis-ripe-figs"]),
  ],
  [
    "osm-corso-italian-374740005",
    new Set(["garlic-and-parsley-bruschettini-asturi-copy"]),
  ],
  [
    "replacement-kookoo-restaurant-and-lounge-washington-dc",
    new Set([
      "fillet-of-salmon-deep-copy",
      "kookoo-sabzi-persian-herbed-frittata-deep-copy",
      "roulette-cake-deep-copy",
    ]),
  ],
  [
    "replacement-circa-at-navy-yard-washington-dc",
    new Set(["entr-e", "heineken"]),
  ],
  [
    "replacement-circa-at-clarendon-arlington-va",
    new Set(["entr-e"]),
  ],
  [
    "replacement-circa-at-the-boro-tysons-va",
    new Set(["entr-e"]),
  ],
  [
    "the-monocle-dc",
    new Set(["america-250th-birthday-celebration-menu-1776-2026", "main-course-select-two-of-the-following"]),
  ],
  [
    "kizuna-sushi-ramen-tysons-va",
    new Set(["sauce-and-soy-mustard-sauce", "surrounds-a-mountain-of-baked-spicy-scallop"]),
  ],
  [
    "nostos-tysons-va",
    new Set(["cheese", "dips", "soup-salads"]),
  ],
  [
    "true-food-kitchen-arlington",
    new Set(["v1a0"]),
  ],
  [
    "chain-bluestone-lane",
    new Set(["contains-soy-creamy-tomato-soup", "contains-tree-nuts-keen-greens-smoothie"]),
  ],
  [
    "thompson-italian-falls-church-dc-metro",
    new Set(["for-orders-of", "includes"]),
  ],
  [
    "osm-thompson-italian-11874404375",
    new Set(["includes"]),
  ],
  [
    "van-leeuwen-dc",
    new Set([
      "honey-slivered-almonds-contains-tree-nuts",
      "vegan-brownie-sundae-raspberry-swirl-contains-coconut",
    ]),
  ],
  [
    "sweetgreen-dc",
    new Set(["contains-tree-nuts", "in-an-eco-friendly-aluminum-bottle-for-plastic-free-oceans"]),
  ],
  [
    "kogiya-korean-bbq-annandale-va-dc-metro",
    new Set(["includes-1-beef-stew-or-cold-noodles"]),
  ],
  [
    "mi-vida-washington-dc-dc-metro",
    new Set(["includes"]),
  ],
  [
    "dog-haus-biergarten-bethesda-bethesda-md-dc-metro",
    new Set(["includes-fries-or-tots-and-a-fountain-drink-or-juice"]),
  ],
  [
    "glory-days-grill-lorton-va-dc-metro",
    new Set(["cal"]),
  ],
  [
    "osm-glory-days-grille-237472337",
    new Set(["cal"]),
  ],
  [
    "passionfish-reston-reston-va-dc-metro",
    new Set(["includes-your-choice-of-an-appetizer"]),
  ],
  [
    "habit-burger-grill",
    new Set(["contains-egg-x-contains-soy-x-contains-wheat-ahi-tuna-filet-on-seeded-bun"]),
  ],
  [
    "osm-brooklyn-s-deli-6304573741",
    new Set(["includes"]),
  ],
  [
    "osm-kabob-bazaar-1089754237",
    new Set(["include-utensils"]),
  ],
  [
    "replacement-moxies-washington-dc-restaurant-washington-dc",
    new Set(["includes-a-drink-and-dessert-for-children-twelve-and-under"]),
  ],
  [
    "stracci-pizza-alexandria-va",
    new Set(["pick-up-at-the-host-stand"]),
  ],
  [
    "oh-george-tables-and-taphouse-fairfax-va-dc-metro",
    new Set(["dine-in-and-curbside-pickup"]),
  ],
  [
    "the-italian-oven-mclean-va",
    new Set(["fast-pickup-and-direct-restaurant-ordering-through-skytab"]),
  ],
  [
    "dogfish-head-alehouse-gaithersburg-md-dc-metro",
    new Set([
      "apps",
      "benevolence",
      "cool-stuff",
      "email",
      "friday-saturday-9pm-1030pm",
      "leafy-green-things",
      "main-fare",
      "menu-specials",
      "pizzas",
      "request-a-party",
      "sammys",
      "sammys-served-with-beach-fries",
      "sign-up-for-email-list",
      "slow-and-tender-smoking-and-rubs-done-in-house",
      "toppings-dollar150-each",
      "toppings-dollar250-each",
      "toppings-dollar4-each",
      "trivia-tuesday-night",
      "worldwide-dogfish",
    ]),
  ],
  [
    "bartaco-wharf-dc",
    new Set(["kitchen-hours"]),
  ],
  [
    "miss-toya-s-creole-house-silver-spring-md-dc-metro",
    new Set(["pick-up-order-from-silver-spring"]),
  ],
  [
    "chain-rita-s-italian-ice",
    new Set(["sign-up-to-be-alerted-when-we-have-your-favorite-flavor"]),
  ],
  [
    "chain-peet-s-coffee",
    new Set(["grab-and-go-coffeebar-pickup"]),
  ],
  [
    "replacement-silver-social-washington-dc",
    new Set(["creative-food-craft-cocktails"]),
  ],
  [
    "chef-tonys-rockville-dc-metro",
    new Set([
      "apps",
      "brunch-entrees-only-sunday-11-3",
      "desserts",
      "desserts-lunch-wed-friday-only-11-2",
      "insane-combo-chains",
      "italian-pastas",
      "kitchen-critters",
      "mixd-bowls-by-chef-tony",
      "ocean-to-table-seafood-primer-book",
      "over-100-waves",
      "pastas",
      "retail-products",
      "rogue-lobsters",
      "squid",
      "uber-eats",
      "your-weapon-crab-cakes",
    ]),
  ],
  [
    "replacement-chef-tony-s-fresh-seafood-rockville-md",
    new Set([
      "apps",
      "brunch-entrees-only-sunday-11-3",
      "desserts",
      "desserts-lunch-wed-friday-only-11-2",
      "insane-combo-chains",
      "italian-pastas",
      "kitchen-critters",
      "mixd-bowls-by-chef-tony",
      "ocean-to-table-seafood-primer-book",
      "over-100-waves",
      "pastas",
      "pickup-hours",
      "retail-products",
      "rogue-lobsters",
      "squid",
      "uber-eats",
      "your-weapon-crab-cakes",
    ]),
  ],
  [
    "replacement-ambassador-restaurant-washington-dc",
    new Set(["confirm-app-or-pickup-timing"]),
  ],
  [
    "replacement-apapacho-taqueria-washington-dc",
    new Set(["prepare-before-i-arrive"]),
  ],
  [
    "redstone-american-grill-washington-dc-dc-metro",
    new Set([
      "applewood-smoked-bacon-pure-honey-sriracha-aioli",
      "breakfast-toasts-and-stuff",
      "celebrate-with-redstone",
      "crispy-chicken-pickles-coleslaw-brioche-bun",
      "crowded-house",
      "cultusboni-chianti-classico",
      "duckhorn-vineyards",
      "emmolo-merlot",
      "firecracker-batter-sriracha-aioli-chipotle-ranch",
      "fresh-parmesan-garlic-sourdough-croutons-romaine",
      "grana-padano-flatbread-crisps-and-cucumber",
      "grill-favorites-delivered",
      "growler",
      "honey-retail",
      "lobster-meat-cream",
      "mimosa-bar",
      "miraval",
      "murphy-goode-merlot",
      "noodles-vegetables-crackers",
      "redstone-dining-awaits",
      "seghesio-vineyards-zinfandel",
      "skillet-baked-green-chilies-house-maple-butter",
      "sunday-only",
      "the-perfect-setting-for-every-occasion",
      "uganda",
      "unlimited",
      "whitehaven",
      "wood-fired-flavor-for-every-occasion",
      "wood-fired-flavor-without-the-wait",
    ]),
  ],
  [
    "texas-de-brazil-fairfax-fairfax-va-dc-metro",
    new Set([
      "build-your-own-churrasco-plate-dollar19-build-your-own-churrasco-feast",
      "cesar-dressing",
      "dozen",
      "spicy",
      "utensils-set",
    ]),
  ],
]);

const reviewedRecoverySuppressionPredicates = [
  {
    restaurantId: "replacement-crust-pizzeria-napoletana-herndon-va",
    shouldSuppress: (item) => {
      const category = String(item.category ?? "").trim().toLowerCase();
      const id = String(item.id ?? "").trim().toLowerCase();
      const name = String(item.name ?? "").trim().toLowerCase();
      return (
        category !== "stores" ||
        id === "your-go-to-pizza-spot-near-reston-and-sterling" ||
        name.startsWith("your go-to pizza spot")
      );
    },
  },
  {
    restaurantId: "bonefish-grill",
    shouldSuppress: (item) =>
      String(item.sourceSummary ?? "").trim() === "Official Bonefish Grill allergen matrix." &&
      !(item.evidence ?? []).some((entry) => /Bonefish Grill official allergen row:/i.test(String(entry?.text ?? ""))),
  },
  {
    restaurantId: "osm-layla-s-lebanese-5550599614",
    shouldSuppress: () => true,
  },
  {
    restaurantId: "osm-bibibop-asian-6952285839",
    shouldSuppress: () => true,
  },
  {
    restaurantId: "osm-bibbop-7802068505",
    shouldSuppress: () => true,
  },
  {
    restaurantId: "osm-kin-da-2598575314",
    shouldSuppress: (item) => item.sourceKind !== "simple-item-card",
  },
  {
    restaurantId: "replacement-olazzo-bethesda-md",
    shouldSuppress: () => true,
  },
  {
    restaurantId: "hawkers-asian-street-food-bethesda-md-dc-metro",
    shouldSuppress: () => true,
  },
  {
    restaurantId: "replacement-cana-washington-dc",
    shouldSuppress: (item) => String(item.id ?? "") === "acompanhamentos-acompanhamentos",
  },
  {
    restaurantId: "chain-toastique",
    shouldSuppress: () => true,
  },
  {
    restaurantId: "bartaco-wharf-dc",
    shouldSuppress: () => true,
  },
];

function shouldSuppressReviewedRecovery(restaurantId, item) {
  const suppressedIds = reviewedRecoverySuppressions.get(restaurantId);
  if (suppressedIds?.has("*") || suppressedIds?.has(item.id)) {
    return true;
  }
  return reviewedRecoverySuppressionPredicates.some(
    (suppression) => suppression.restaurantId === restaurantId && suppression.shouldSuppress(item),
  );
}

const reviewedItemFieldOverrides = new Map([
  [
    "cane-dc",
    new Map([
      [
        "jerk-wings",
        {
          name: "Jerk Wings",
          description: "Twelve-hour marinated and smoked.",
          category: "Appetizers",
          sourceSummary:
            "Reviewed Cane official lunch/dinner menu: repaired row-boundary extraction so the 12-hour marinated text stays with Jerk Wings instead of becoming its own item.",
        },
      ],
      [
        "fried-drums-glazed-in-oyster-sauce",
        {
          id: "trini-chinese-chicken",
          name: "Trini-Chinese Chicken",
          description: "Fried drums glazed in oyster sauce.",
          category: "Caribbean",
          sourceSummary:
            "Reviewed Cane official dinner menu: repaired row-boundary extraction so the item name is Trini-Chinese Chicken and the fried drums text is its description.",
        },
      ],
      [
        "jasmine-rice-gently-cooked-in-coconut-milk-and-spices",
        {
          id: "coconut-rice",
          name: "Coconut Rice",
          description: "Jasmine rice gently cooked in coconut milk and spices.",
          category: "Sides",
          sourceSummary:
            "Reviewed Cane official lunch/dinner menu: repaired row-boundary extraction so the item name is Coconut Rice and the jasmine rice text is its description.",
        },
      ],
      [
        "trini-pastry-layered-with-currants-coconut",
        {
          id: "currant-roll",
          name: "Currant Roll",
          description: "Trini pastry layered with currants and coconut.",
          category: "Desserts",
          sourceSummary:
            "Reviewed Cane official lunch/dinner menu: repaired row-boundary extraction so the item name is Currant Roll and the pastry text is its description.",
        },
      ],
      [
        "trini-style-wonton-stuffed-with-spicy-shrimp-and-served-with-a-culantro-soy-sauce",
        {
          id: "shrimp-wontons",
          name: "Shrimp Wontons",
          description: "Trini-style wontons stuffed with spicy shrimp and served with a culantro-soy sauce.",
          category: "Caribbean",
          sourceSummary:
            "Reviewed Cane official dinner menu: repaired row-boundary extraction so the item name is Shrimp Wontons and the wonton text is its description.",
        },
      ],
    ]),
  ],
  [
    "flower-child-bethesda",
    new Map([
      ["avocado-caesar", { allergens: ["milk", "wheat", "sesame"] }],
      ["avocado-hummus", { allergens: ["wheat", "sesame"] }],
      ["black-bean-falafel", { allergens: ["wheat", "soy", "sesame"] }],
      ["brussels-sprouts-and-organic-kale", { allergens: ["milk", "tree-nut", "soy"] }],
      ["cauliflower-risotto", { allergens: ["wheat", "sesame"] }],
      ["chicken", { allergens: [] }],
      ["chicken-enchiladas", { allergens: ["milk"] }],
      ["chicken-yakisoba-noodles", { allergens: ["egg", "tree-nut", "wheat", "soy", "sesame"] }],
      ["chocolate-chip-cashew-cookie", { allergens: ["milk", "egg", "tree-nut"] }],
      ["chocolate-pudding", { allergens: ["tree-nut"] }],
      ["chopped-vegetable", { allergens: ["soy", "sesame"] }],
      ["classic-hummus", { allergens: ["wheat", "sesame"] }],
      ["crushed-avocado-toast", { allergens: ["milk", "egg", "wheat", "sesame"] }],
      ["double-chocolate-almond-brownie", { allergens: ["egg", "tree-nut"] }],
      ["flying-avocado", { allergens: ["milk", "wheat", "sesame"] }],
      ["forbidden-rice", { allergens: ["soy", "sesame"] }],
      ["fresh-fruit", { allergens: [] }],
      ["ginger-miso-crunch", { allergens: ["tree-nut", "soy", "sesame"] }],
      ["glow-bowl", { allergens: ["soy"] }],
      ["gluten-free-mac-and-cheese", { allergens: ["milk"] }],
      ["green-chile-queso", { allergens: ["milk"] }],
      ["kale-salad", { allergens: ["milk", "wheat", "sesame"] }],
      ["lemon-olive-oil-cake", { allergens: ["egg"] }],
      ["mexican-fruit-stand", { allergens: [] }],
      ["mother-earth", { allergens: ["wheat", "soy", "sesame"] }],
      ["olive-oil-roasted-vegetables", { allergens: [] }],
      ["peruvian-braised-beef", { allergens: ["milk"] }],
      ["red-chile-glazed-sweet-potato", { allergens: ["soy", "sesame"] }],
      ["roasted-broccoli", { allergens: ["milk", "wheat", "sesame"] }],
      ["roasted-heirloom-carrots", { allergens: ["milk", "sesame"] }],
      ["roasted-sweet-potato-fries", { allergens: ["milk", "egg"] }],
      ["salmon", { allergens: ["fish"] }],
      ["shrimp", { allergens: ["shellfish"] }],
      ["simple-steamed-brown-rice", { allergens: [] }],
      ["smashed-gold-potato", { allergens: ["milk"] }],
      ["spicy-coconut-green-curry", { allergens: [] }],
      ["steak", { allergens: [] }],
      ["summer-ingredient", { allergens: ["milk", "tree-nut"] }],
      ["sweet-corn-and-quinoa", { allergens: ["milk"] }],
      ["the-rebel-french-dip", { allergens: ["milk", "wheat", "soy", "sesame"] }],
      ["tofu", { allergens: ["soy"] }],
      ["turkey-and-avocado-cobb", { allergens: ["milk", "tree-nut", "soy"] }],
      ["yellowfin-tuna-poke", { allergens: ["fish", "wheat", "soy", "sesame"] }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        mayContain: [],
        allergenSourceType: "official-allergen-menu",
        sourceSummary:
          "Reviewed Flower Child official nutrition/allergen PDF matrix: row-level allergen markers were parsed from the June 2026 guide.",
        evidence: [
          {
            sourceKind: "pdf-matrix",
            sourceUrl:
              "https://www.iamaflowerchild.com/wp-content/uploads/2026/06/FC-Omaha_Nutritional-Sheet_06.25.26_MP_v3.pdf",
            text: "Official Flower Child June 2026 nutrition/allergen guide row.",
          },
        ],
      },
    ])),
  ],
  [
    "not-your-average-joe-s-reston-reston-va-dc-metro",
    new Map([
      ["ahi-tuna", { allergens: ["fish", "soy", "wheat", "gluten", "sesame"] }],
      ["ahi-tuna-on-cucumber", { allergens: ["egg", "fish", "sesame"] }],
      ["ahi-tuna-poke-bowl", { allergens: ["egg", "fish", "shellfish", "soy", "wheat", "gluten", "sesame"] }],
      ["ahi-tuna-wontons", { allergens: ["egg", "fish", "soy", "wheat", "gluten", "sesame"] }],
      ["ahi-tuna-wontons-on-cucumbers", { allergens: ["egg", "fish", "soy", "wheat", "gluten", "sesame"] }],
      ["ahi-tuna-wontons-on-wontons", { allergens: ["egg", "fish", "soy", "wheat", "gluten", "sesame"] }],
      ["almond-crusted-goat-cheese", { allergens: ["egg", "milk", "soy", "tree-nut", "wheat", "gluten"] }],
      ["bacon-jam-wagyu-burger", { allergens: ["milk", "soy", "wheat", "gluten", "sesame", "egg"] }],
      ["bacon-jam-wagyu-burger-no-side", { allergens: ["egg", "milk"] }],
      ["bacon-jam-wagyu-burger-w-fries", { allergens: ["milk", "soy", "wheat", "gluten", "sesame"] }],
      ["balsamic-vinaigrette-3-fl-oz", { allergens: [] }],
      ["bbq-meatloaf", { allergens: ["egg", "fish", "milk", "shellfish", "soy", "wheat", "gluten"] }],
      ["bbq-pulled-pork-sandwich", { allergens: ["egg", "milk", "soy", "wheat", "gluten", "sesame"] }],
      ["bbq-pulled-pork-sandwich-wfries", { allergens: ["egg", "milk", "soy", "wheat", "gluten", "sesame"] }],
      ["blue-cheese-2-fl-oz", { allergens: ["egg", "milk"] }],
      ["blue-cheese-3-fl-oz", { allergens: ["egg", "milk"] }],
      ["bread-and-oil-for-table-full-portion", { allergens: ["milk", "wheat", "gluten"] }],
      ["buffalo-caribbean-chicken-tenders", { allergens: ["egg", "milk", "wheat", "gluten", "sesame"] }],
      ["buffalo-chicken", { allergens: ["egg", "milk", "wheat", "gluten", "sesame"] }],
      ["buffalo-chicken-wrap", { allergens: ["egg", "milk", "soy", "wheat", "gluten", "sesame"] }],
      ["buffalo-chicken-wrap-wfries", { allergens: ["egg", "milk", "soy", "wheat", "gluten", "sesame"] }],
      ["buttermilk-ranch-3-fl-oz", { allergens: ["egg", "milk"] }],
      ["caesar-3-fl-oz", { allergens: ["egg", "fish", "milk", "soy"] }],
      ["cape-cod-reuben", { allergens: ["egg", "fish", "milk", "soy", "wheat", "gluten"] }],
      ["cape-cod-reuben-wfries", { allergens: ["egg", "fish", "milk", "soy", "wheat", "gluten"] }],
      ["carrot-cake", { allergens: ["egg", "milk", "tree-nut"] }],
      ["cheese-steak-egg-rolls", { allergens: ["egg", "fish", "milk", "soy", "wheat", "gluten"] }],
      ["chicken-caesar-wrap", { allergens: ["egg", "fish", "milk", "soy", "wheat", "gluten"] }],
      ["chicken-caesar-wrap-wfries", { allergens: ["egg", "fish", "milk", "soy", "wheat", "gluten"] }],
      ["chicken-caprese", { allergens: ["egg", "milk", "soy", "tree-nut", "wheat", "gluten"] }],
      ["chicken-caprese-wfries", { allergens: ["egg", "milk", "soy", "tree-nut", "wheat", "gluten"] }],
      ["chicken-dumplings", { allergens: ["fish", "soy", "wheat", "gluten", "sesame"] }],
      ["chicken-parm", { allergens: ["egg", "milk", "wheat", "gluten", "soy"] }],
      ["chicken-piccata", { allergens: ["milk", "wheat", "gluten", "egg", "soy"] }],
      ["chicken-wings-joes-buffalo", { allergens: ["milk"] }],
      ["chicken-wings-korean-bbq", { allergens: ["fish", "milk", "shellfish", "soy", "wheat", "gluten", "sesame"] }],
      ["chicken-wings-sweet-chili", { allergens: ["milk"] }],
      ["choc-chip-cookie-explosion", { allergens: ["egg", "milk", "soy", "wheat", "gluten"] }],
      ["chocolate-chocolate-mousse", { allergens: ["egg", "milk", "soy", "wheat", "gluten"] }],
      ["classic-caesar", { allergens: ["egg", "fish", "milk", "soy", "wheat", "gluten"] }],
      ["classic-cheese", { allergens: ["egg", "milk", "wheat", "gluten"] }],
      ["cobb", { allergens: ["egg", "milk"] }],
      ["cole-slaw", { allergens: ["egg", "milk"] }],
      ["creme-brulee", { allergens: ["egg", "milk"] }],
      ["crispy-southwest-chicken", { allergens: ["egg", "milk", "wheat", "gluten", "sesame"] }],
      ["fish-and-chips", { allergens: ["egg", "fish", "milk", "soy", "wheat", "gluten"] }],
      ["four-cheese-mac-and-cheese", { allergens: ["fish", "milk", "wheat", "gluten"] }],
      ["french-fries", { allergens: ["soy", "wheat", "gluten"] }],
      ["french-onion-soup", { allergens: ["milk", "soy", "wheat", "gluten"] }],
      ["gf-pizza-crust", { allergens: ["egg", "milk"] }],
      ["glazed-carrots", { allergens: ["milk"] }],
      ["gluten-free-roll-and-oil-for-one-person", { allergens: ["egg", "milk"] }],
      ["green-beans", { allergens: ["milk"] }],
      ["grilled-cheese-and-tomato-soup", { allergens: ["milk", "soy", "wheat", "gluten"] }],
      ["grilled-chicken-caprese-no-side", { allergens: ["egg", "milk"] }],
      ["grilled-salmon", { allergens: ["fish"] }],
      ["herb-crusted-haddock", { allergens: ["egg", "fish", "milk", "wheat", "gluten", "soy"] }],
      ["hot-honey-fried-chicken-sandwich", { allergens: ["milk", "soy", "wheat", "gluten", "sesame"] }],
      ["jambalaya", { allergens: ["fish", "milk", "shellfish", "soy"] }],
      ["jasmine-rice-pilaf", { allergens: ["milk"] }],
      ["kid-cheeseburger-no-side", { allergens: ["egg", "milk"] }],
      ["kid-cheeseburger-wfries", { allergens: ["egg", "milk", "soy", "wheat", "gluten", "sesame"] }],
      ["kid-chicken-tenders-wfries", { allergens: ["egg", "milk", "soy", "wheat", "gluten"] }],
      ["kid-mac-and-cheese", { allergens: ["fish", "milk", "soy", "wheat", "gluten"] }],
      ["kid-pasta-plain", { allergens: ["wheat", "gluten"] }],
      ["kid-pasta-with-butter", { allergens: ["milk", "wheat", "gluten"] }],
      ["kid-pasta-with-sauce", { allergens: ["wheat", "gluten"] }],
      ["kid-pizza", { allergens: ["egg", "milk", "wheat", "gluten"] }],
      ["korean-beef-and-noodle-bowl", { allergens: ["egg", "fish", "shellfish", "soy", "tree-nut", "wheat", "gluten", "sesame"] }],
      ["mac-and-cheese-entree", { allergens: ["fish", "milk"] }],
      ["mashed-potatoes", { allergens: ["milk"] }],
      ["mustard-crusted-chicken", { allergens: ["milk", "wheat", "gluten", "egg", "soy"] }],
      ["mustard-crusted-chicken-blt", { allergens: ["egg", "milk", "soy", "tree-nut", "wheat", "gluten"] }],
      ["mustard-crusted-chicken-blt-no-side", { allergens: ["egg", "milk", "soy"] }],
      ["mustard-crusted-chicken-blt-w-fries", { allergens: ["egg", "milk", "soy", "tree-nut", "wheat", "gluten"] }],
      ["nachos-chicken", { allergens: ["fish", "milk"] }],
      ["nachos-pulled-pork", { allergens: ["fish", "milk"] }],
      ["new-england-clam-chowder", { allergens: ["fish", "milk", "shellfish", "wheat", "gluten"] }],
      ["orange-sesame-vinaigrette-3-fl-oz", { allergens: ["sesame"] }],
      ["pappardelle-bolognese", { allergens: ["egg", "milk", "soy", "wheat", "gluten"] }],
      ["pasta-alla-raffi", { allergens: ["egg", "milk", "soy", "wheat", "gluten"] }],
      ["peanut-butter-thing", { allergens: ["milk", "peanut", "soy", "wheat", "gluten"] }],
      ["raspberry-vinaigrette", { allergens: [] }],
      ["roasted-brussels-sprouts", { allergens: ["milk"] }],
      ["santa-fe-ranch", { allergens: ["egg", "milk"] }],
      ["sesame-ginger-vinaigrette", { allergens: ["egg", "fish", "shellfish", "soy", "wheat", "gluten", "sesame"] }],
      ["simply-prepared-salmon-steamed-broccoli-and-jasmine-rice", { allergens: ["fish"] }],
      ["sirloin-tips", { allergens: ["milk"] }],
      ["super-crunch", { allergens: ["tree-nut", "sesame"] }],
      ["sweet-and-spicy-cauliflower-bites", { allergens: ["egg", "milk", "wheat", "gluten"] }],
      ["sweet-potato-fries", { allergens: ["soy", "wheat", "gluten"] }],
      ["teriyaki-salmon", { allergens: ["egg", "fish", "shellfish", "soy", "wheat", "gluten", "sesame"] }],
      ["thai-chicken-noodle-salad", { allergens: ["egg", "fish", "peanut", "shellfish", "soy", "tree-nut", "wheat", "gluten", "sesame"] }],
      ["thats-fire-burger", { allergens: ["egg", "milk", "soy", "wheat", "gluten", "sesame"] }],
      ["thats-fire-burger-wfries", { allergens: ["egg", "milk", "soy", "wheat", "gluten", "sesame"] }],
      ["the-cuban-wfries", { allergens: ["egg", "milk", "soy", "tree-nut", "wheat", "gluten"] }],
      ["the-margherita", { allergens: ["egg", "milk", "wheat", "gluten"] }],
      ["the-mediterranean", { allergens: ["egg", "milk", "wheat", "gluten"] }],
      ["the-veggie-burger", { allergens: ["milk", "soy", "wheat", "gluten", "sesame", "egg"] }],
      ["the-veggie-burger-no-side", { allergens: ["egg", "milk", "soy"] }],
      ["the-veggie-burger-wfries", { allergens: ["milk", "soy", "wheat", "gluten", "sesame"] }],
      ["the-works", { allergens: ["egg", "milk", "soy", "wheat", "gluten"] }],
      ["tomato-basil-soup", { allergens: ["milk"] }],
      ["turkey-avocado-club-no-side", { allergens: ["egg", "milk", "soy"] }],
      ["turkey-avocado-club-wfries", { allergens: ["egg", "milk", "soy", "wheat", "gluten"] }],
      ["veggie-harvest-bowl", { allergens: ["milk", "tree-nut"] }],
      ["waldorf", { allergens: ["egg", "milk", "tree-nut"] }],
      ["whipped-feta-dip", { allergens: ["egg", "milk", "wheat", "gluten", "sesame"] }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        mayContain: [],
        allergenSourceType: "official-allergen-menu",
        sourceSummary:
          "Reviewed Not Your Average Joe's official common-allergens PDF matrix: row-level X markers were parsed from the 2025/2026 guide.",
        evidence: [
          {
            sourceKind: "pdf-matrix",
            sourceUrl:
              "https://www.notyouraveragejoes.com/files/not-your-average-joes-allergen-info-2025-1-5-26-pdf.pdf",
            text: "Official Not Your Average Joe's common-allergens guide row.",
          },
        ],
      },
    ])),
  ],
  [
    "menomale-dc",
    new Map([
      [
        "tiramisu",
        {
          description:
            "Lady fingers dipped in coffee, layered with whipped mascarpone and chocolate liquor cream. Contains raw eggs.",
          allergens: ["egg", "milk", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Menomale official menu evidence: Tiramisu lists lady fingers, whipped mascarpone cream, and a raw egg disclosure.",
        },
      ],
    ]),
  ],
  [
    "sushi-taro-dc",
    new Map([
      [
        "toro-habanero-roll",
        {
          allergenSourceType: "official-product-allergen-section",
        },
      ],
    ]),
  ],
  [
    "replacement-masala-art-washington-dc",
    new Map([
      [
        "ras-malai",
        {
          sourceSummary:
            "Reviewed Masala Art official menu evidence: Ras Malai has an item-level nuts disclosure; the milk concern is mapped from the official dessert name.",
        },
      ],
    ]),
  ],
  [
    "redstone-american-grill-washington-dc-dc-metro",
    new Map([
      [
        "ny-style-cheesecake",
        {
          sourceSummary:
            "Reviewed Redstone official menu evidence: NY-Style Cheesecake has an item-level peanut disclosure; milk, egg, wheat, and gluten are mapped from the official cheesecake item name.",
        },
      ],
    ]),
  ],
  [
    "il-canale-dc",
    new Map([
      [
        "calamari-fritti",
        {
          allergens: ["soy", "shellfish"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Il Canale official row-level evidence: calamari is shellfish and the item text says the aioli contains soy; no egg disclosure is present.",
        },
      ],
    ]),
  ],
  [
    "tapori-dc",
    new Map([
      [
        "rasmalai-cheesecake",
        {
          allergens: ["gluten", "milk", "tree-nut", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Tapori official menu evidence: Rasmalai Cheesecake states it contains dairy and nuts; the spiced biscuit crust supports wheat/gluten, and no egg disclosure is present.",
        },
      ],
      [
        "desserts-rasmalai-cheesecake",
        {
          allergens: ["gluten", "milk", "tree-nut", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Tapori official menu evidence: Rasmalai Cheesecake states it contains dairy and nuts; the spiced biscuit crust supports wheat/gluten, and no egg disclosure is present.",
        },
      ],
    ]),
  ],
  [
    "osm-il-pizzico-6595475668",
    new Map([
      [
        "carpaccio-di-manzo",
        {
          category: "Antipasti",
          description: "Thin slices of raw beef served with shaved Parmigiano, mixed greens, and mustard sauce.",
          sourceSummary:
            "Reviewed Il Pizzico lunch menu source: corrected collapsed Antipasti section extraction into source-backed dish copy.",
        },
      ],
    ]),
  ],
  [
    "bayou-bakery-arlington-va",
    new Map([
      [
        "all-beef-dog",
        {
          description: null,
          sourceSummary:
            "Reviewed official Bayou Bakery PDF extraction: ALL BEEF DOG is a real food row, but the scraped description belonged to the neighboring Turkey Melt row and was removed.",
        },
      ],
      [
        "greens",
        {
          description: null,
          sourceSummary:
            "Reviewed Bayou Bakery menu extraction: Greens is a side row, but the scraped description belonged to the neighboring Lil Ya't Ham Melt row and was removed.",
        },
      ],
    ]),
  ],
  [
    "replacement-the-wharf-alexandria-va",
    new Map([
      [
        "crab-cocktail",
        {
          description:
            "Chilled lump crab tossed with homemade aioli and chives, served with sliced cucumber and saltine crackers.",
          sourceSummary:
            "Reviewed duplicate extracted Wharf row: kept the canonical Crab Cocktail item and applied the cleaner official menu description from the duplicate row.",
        },
      ],
    ]),
  ],
  [
    "estuary-dc",
    new Map([
      ["appalachianomelet", {
        name: "Appalachian Omelet",
        description:
          "Two cage-free eggs, Meadow Creek cheese, sweet country ham, beech mushroom, peppers.",
      }],
      ["avocadotoast-v", {
        name: "Avocado Toast",
        description: "Toasted brioche, salsa macha, cherry tomatoes.",
      }],
      ["birchermuesli", {
        name: "Bircher Muesli",
        description: "Steel-cut oats, dried fruits, candied nuts.",
      }],
      ["brunchburger", {
        name: "Brunch Burger",
        description: "Potato bun, bacon, cage-free fried egg, aioli.",
      }],
      ["cheeseburger", {
        name: "Cheeseburger",
        description: "Potato bun, aioli, arugula, tomato jam.",
      }],
      ["chesapeakeomelet", {
        name: "Chesapeake Omelet",
        description:
          "Two cage-free eggs, jumbo lump blue crab, local cheddar, caramelized onions, spinach.",
      }],
      ["citycentergrilledcheese", {
        name: "CityCenter Grilled Cheese",
        description:
          "Brioche, cheddar cheese, served with choice of french fries, simple salad, or seasonal fruit.",
      }],
      ["crispychickenstrips", {
        name: "Crispy Chicken Strips",
        description:
          "Four-piece breaded tenders served with secret sauce and a choice of French fries, simple salad, or seasonal fruit.",
      }],
      ["crispysquashblossom", {
        name: "Crispy Squash Blossom",
        description: "Asparagus and almond puree, seasonal greens.",
      }],
      ["drunkenoysters", {
        name: "Drunken Oysters",
        description: "Local oysters, Meyer lemon gin granita, cucumber.",
      }],
      ["farmhousebenedict", {
        name: "Farmhouse Benedict",
        description: "House-made buttermilk biscuit, two cage-free eggs.",
      }],
      ["friedchickensandwich", {
        name: "Fried Chicken Sandwich",
        description: "Potato bun, avocado, bacon, ranch, pickled shallots, lettuce, tomato.",
      }],
      ["greekyogurtbowl-v-g", {
        name: "Greek Yogurt Bowl",
        description: "Honey-vanilla yogurt, fresh berries, berry coulis.",
      }],
      ["heirloomtomatosandwich", {
        name: "Heirloom Tomato Sandwich",
        description: "House-made focaccia, bacon, arugula, citrus aioli.",
      }],
      ["hickorysmoked-labellefarm-wholehen", {
        name: "Hickory Smoked LaBelle Farm Whole Hen",
        description: "Mushrooms, caulini, chermoula, bearnaise sauce.",
      }],
      ["ivycitysmokedsalmon", {
        name: "Ivy City Smoked Salmon",
        description: "Caper berry, herb cream cheese, pickled shallot.",
      }],
      ["jumbolumpcrabcake", {
        name: "Jumbo Lump Crab Cake",
        description: "Old Bay remoulade, bitter greens, citrus and herbs.",
      }],
      ["localoysters-halfdozen", {
        name: "Local Oysters",
        description: "Half dozen oysters with classic mignonette, house-made hot sauce, and lemon.",
      }],
      ["newyorkstrip", {
        name: "New York Strip",
        description: "Onion jus, potato puree, squash.",
      }],
      ["petitesmashburger", {
        name: "Petite Smash Burger",
        description: "Single brisket and chuck patty, cheddar cheese, secret sauce on brioche bun.",
      }],
      ["potomac-spasta", {
        name: "Potomac's Pasta",
        description: "Spaghetti with butter and Parmesan cheese.",
      }],
      ["pulledbbqmushrooms", {
        name: "Pulled BBQ Mushrooms",
        description: "Toasted roll, root vegetable slaw, lettuce.",
      }],
      ["reddrumcrudo-patuxentriver", {
        name: "Red Drum Crudo",
        description: "Citrus, carrot consomme, crispy leeks.",
      }],
      ["roastedfennelsalad", {
        name: "Roasted Fennel Salad",
        description: "House-made lemon ricotta, green peas, citrus.",
      }],
      ["shakshuka", {
        name: "Shakshuka",
        description: "Calabrian chiles, saffron, organic sheep's milk feta.",
      }],
      ["smokedchickenhash", {
        name: "Smoked Chicken Hash",
        description: "Sofrito, poached cage-free egg.",
      }],
      ["softshellbanhmi", {
        name: "Soft Shell Banh Mi",
        description: "Hoagie roll, cucumber, pickled slaw, Fresno aioli.",
      }],
      ["steak-and-eggs", {
        name: "Steak & Eggs",
        description: "Chef's cut of steak, crispy potatoes.",
      }],
      ["tempurabluecatfish", {
        name: "Tempura Blue Catfish",
        description: "Root vegetable slaw, lemon remoulade, lemon.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Estuary menu extraction: corrected OCR-spaced official menu text into readable dish copy.",
      },
    ])),
  ],
  [
    "tuscarora-mill-restaurant-leesburg-va-dc-metro",
    new Map([
      ["applecrispcobbler", {
        name: "Apple Crisp Cobbler",
        description: "Vanilla ice cream and caramel sauce.",
      }],
      ["bourbonpecanpie", {
        name: "Bourbon Pecan Pie",
        description:
          "Brown sugar and bourbon filling topped with toasted pecans, vanilla ice cream, and chocolate sauce.",
      }],
      ["browniesundae", {
        name: "Brownie Sundae",
        description: "Vanilla ice cream, caramel and chocolate, walnuts, and whipped cream.",
      }],
      ["cheesecake-beignets", {
        name: "Cheesecake Beignets",
        description: "Raspberry sauce and whipped cream.",
      }],
      ["vanilla-chocolate-orlocalicecream", {
        name: "Vanilla, Chocolate, or Local Ice Cream",
        description: "With a snickerdoodle cookie.",
      }],
      ["warmbutterscotchbreadpudding", {
        name: "Warm Butterscotch Bread Pudding",
        description: "Vanilla ice cream and caramel sauce.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Tuscarora Mill PDF extraction: corrected OCR-spaced dessert menu text into readable dish copy.",
      },
    ])),
  ],
  [
    "bluejacket-washington-dc-dc-metro",
    new Map([
      ["cherry-and-almondbreadpudding", {
        name: "Cherry & Almond Bread Pudding",
        description: "Almond, Amarena cherry, bourbon caramel, vanilla ice cream.",
      }],
      ["flourlesschocolatecake", {
        name: "Flourless Chocolate Cake",
        description: "Strawberry gelato, chocolate sauce.",
      }],
      ["scoopoficecreamorsorbet", {
        name: "Scoop of Ice Cream or Sorbet",
        description: "Ask for our daily selection.",
      }],
      ["strawberrycheesecake", {
        name: "Strawberry Cheesecake",
        description: "Graham cracker crust, berry compote, whipped cream.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Bluejacket PDF extraction: corrected OCR-spaced dessert menu text into readable dish copy.",
      },
    ])),
  ],
  [
    "chasin-tails-seafood-that-celebrates-falls-church-va-dc-metro",
    new Map([
      [
        "potatoes-3-p-c",
        {
          name: "Potatoes (3 pc)",
          description: "Boiled egg (2 pc) and andouille sausage.",
          sourceSummary:
            "Reviewed Chasin' Tails menu extraction: corrected OCR-spaced add-on text into readable copy.",
        },
      ],
    ]),
  ],
  [
    "replacement-1310-kitchen-and-bar-washington-dc",
    new Map([
      ["choppedchinesechickensalad-26-g-f", {
        name: "Chopped Chinese Chicken Salad",
        description:
          "Cabbage, red pepper, cashews, scallion, cilantro, carrot ginger dressing.",
      }],
      ["cobbsalad", {
        name: "Cobb Salad",
        description: "Avocado, bacon, hard-boiled egg, tomato, blue cheese.",
      }],
      ["frenchfries", {
        name: "French Fries",
        description: null,
      }],
      ["friedchickensandwich", {
        name: "Fried Chicken Sandwich",
        description:
          "Spicy slaw, homemade pickles, served with choice of french fries or mixed greens.",
      }],
      ["gingercoconutcurry", {
        name: "Ginger Coconut Curry",
        description: "Cod, shrimp, vegetables, rice. Vegan option: seasonal vegetables and rice.",
      }],
      ["grilledprimenystripsteak", {
        name: "Grilled Prime NY Strip Steak",
        description: "Chimichurri.",
      }],
      ["hotturkeycubano", {
        name: "Hot Turkey Cubano",
        description:
          "Swiss, mustard, cornichon; served with choice of french fries or mixed greens.",
      }],
      ["jenn-schickenpotpie", {
        name: "Jenn's Chicken Pot Pie",
        description: "Mushrooms, spinach, peas, carrots.",
      }],
      ["parmesanarancini", {
        name: "Parmesan Arancini",
        description: "Garlic aioli.",
      }],
      ["porchetta", {
        name: "Porchetta",
        description: "Fennel, lemon, rosemary, thyme.",
      }],
      ["roastedbeetsalad", {
        name: "Roasted Beet Salad",
        description: "Goat cheese.",
      }],
      ["roastedbroccolini", {
        name: "Roasted Broccolini",
        description: "Garlic oil.",
      }],
      ["sauteedspinach", {
        name: "Sauteed Spinach",
        description: null,
      }],
      ["sesamesearedtuna", {
        name: "Sesame Seared Tuna",
        description: "Brown rice, edamame, avocado, cucumber.",
      }],
      ["thewedge", {
        name: "The Wedge",
        description: "Romaine, bacon, tomato, crouton, blue cheese dressing.",
      }],
      ["tuscankale-and-quinoasalad", {
        name: "Tuscan Kale & Quinoa Salad",
        description: "Apples, almonds, pomegranate, lemon vinaigrette.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed 1310 Kitchen official PDF: corrected OCR-spaced and column-shifted menu extraction into readable source-backed dish copy.",
      },
    ])),
  ],
  [
    "replacement-cocineros-hyattsville-md",
    new Map([
      ["birria-tacos-birria-tacos-dollar", {
        name: "Birria Tacos",
        description:
          "Cocineros' birria recipe, slow-cooked brisket, cheese, fresh onions and cilantro. Served with grilled onions and broth.",
      }],
      ["crazy-tacos-crazy-tacos-dollar", {
        name: "Crazy Tacos",
        description: "Served with pico and guac or salsa.",
      }],
      ["golden-dough-stuffed-with-savory", {
        name: "Empanadas",
        description:
          "Golden dough stuffed with savory proteins. Perfectly crisp, satisfying, and served with house salad. Options include potatoes, chicken, beef, or shrimp.",
      }],
      ["pupusas-pupusas-dollar", {
        name: "Pupusas",
        description:
          "Options include veggies, beans, pork, chicken, and jalapeno mix. Served with cabbage and tomato sauce.",
      }],
      ["three-rolled-tortillas-stuffed-with-the", {
        name: "Enchiladas",
        description:
          "Three rolled tortillas stuffed with protein of your choice, topped with green tangy sauce, onions, sour cream and cheese. Options include chicken, veggies, or birria.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Cocineros official PDF: corrected OCR-spaced menu text into readable source-backed dish copy.",
      },
    ])),
  ],
  ...[
    "glory-days-grill-lorton-va-dc-metro",
    "osm-glory-days-grille-237472337",
  ].map((restaurantId) => [
    restaurantId,
    new Map([
      [
        "the-glory-burger",
        {
          allergens: ["egg", "milk", "gluten", "soy", "wheat"],
          mayContain: [],
          allergenSourceType: "official-allergen-menu",
          sourceSummary:
            "Reviewed official Glory Days allergen matrix: The Glory Burger is marked Y for egg, milk, other gluten, soy, and wheat.",
          evidence: [
            {
              sourceKind: "pdf-matrix",
              sourceUrl:
                "https://www.glorydaysgrill.com/wp-content/uploads/2025/06/glory-days-grill-florida-allergen-information.pdf",
              text: "The Glory Burger: Egg Y, Fish N, Milk Y, MSG N, Other Gluten Y, Peanuts N, Shellfish N, Soy Y, Sulfites N, Tree Nuts N, Wheat Y, Sesame N.",
            },
          ],
        },
      ],
      [
        "ibc-root-beer",
        {
          allergens: [],
          mayContain: [],
          allergenSourceType: "official-allergen-menu",
          sourceSummary:
            "Reviewed official Glory Days allergen matrix: IBC Root Beer is marked N for every listed allergen.",
          evidence: [
            {
              sourceKind: "pdf-matrix",
              sourceUrl:
                "https://www.glorydaysgrill.com/wp-content/uploads/2025/06/glory-days-grill-florida-allergen-information.pdf",
              text: "IBC Root Beer: all allergen columns are N.",
            },
          ],
        },
      ],
      [
        "signature-lemonade",
        {
          allergens: [],
          mayContain: [],
          allergenSourceType: "official-allergen-menu",
          sourceSummary:
            "Reviewed official Glory Days allergen matrix: Signature Lemonade is marked N for every listed allergen.",
          evidence: [
            {
              sourceKind: "pdf-matrix",
              sourceUrl:
                "https://www.glorydaysgrill.com/wp-content/uploads/2025/06/glory-days-grill-florida-allergen-information.pdf",
              text: "Signature Lemonade: all allergen columns are N.",
            },
          ],
        },
      ],
      [
        "strawberry-lemonade",
        {
          allergens: [],
          mayContain: [],
          allergenSourceType: "official-allergen-menu",
          sourceSummary:
            "Reviewed official Glory Days allergen matrix: Strawberry Lemonade is marked N for every listed allergen.",
          evidence: [
            {
              sourceKind: "pdf-matrix",
              sourceUrl:
                "https://www.glorydaysgrill.com/wp-content/uploads/2025/06/glory-days-grill-florida-allergen-information.pdf",
              text: "Strawberry Lemonade: all allergen columns are N.",
            },
          ],
        },
      ],
      [
        "bourbon-butter-cake",
        {
          allergens: ["egg", "milk", "soy", "tree-nut", "wheat"],
          mayContain: [],
          allergenSourceType: "official-allergen-menu",
          sourceSummary:
            "Reviewed official Glory Days allergen matrix: Bourbon Butter Cake is marked Y for egg, milk, soy, tree nuts, and wheat.",
          evidence: [
            {
              sourceKind: "pdf-matrix",
              sourceUrl:
                "https://www.glorydaysgrill.com/wp-content/uploads/2025/06/glory-days-grill-florida-allergen-information.pdf",
              text: "Bourbon Butter Cake: Egg Y, Fish N, Milk Y, MSG N, Other Gluten N, Peanuts N, Shellfish N, Soy Y, Sulfites N, Tree Nuts Y, Wheat Y, Sesame N.",
            },
          ],
        },
      ],
    ]),
  ]),
  [
    "cinemark-centreville-centreville-va-dc-metro",
    new Map([
      [
        "minute-maidr-lemonade",
        {
          allergens: [],
          mayContain: [],
          allergenSourceType: "official-allergen-menu",
          sourceSummary:
            "Reviewed Cinemark official spreadsheet: the Minute Maid Lemonade row has nutrition values and no allergen marker cells.",
          evidence: [
            {
              sourceKind: "official-spreadsheet-matrix",
              sourceUrl:
                "https://www.cinemark.com/media/ggnprcc3/upload-2026-full-circuit-final_update-1.xlsx",
              text: "Minute Maid Lemonade official spreadsheet row has no allergen markers.",
            },
          ],
        },
      ],
    ]),
  ],
  [
    "chain-checkers",
    new Map([
      [
        "crispy-fish-sandwich",
        {
          allergens: ["egg", "fish", "milk", "soy", "sesame", "wheat"],
          mayContain: [],
          allergenSourceType: "official-allergen-menu",
          sourceSummary:
            "Reviewed official Checkers allergen matrix: Crispy Fish Sandwich lists Pollock in the Fish column and marks egg, milk, soy, sesame, and wheat.",
          evidence: [
            {
              sourceKind: "pdf-matrix",
              sourceUrl:
                "https://media-platform.cdn4dd.com/media/online_ordering_asset/processed/5d58bac4-f88d-4c5a-b7c4-6f0f38a68f20.pdf",
              text: "Crispy Fish Sandwich row: Egg X, Fish Pollock, Milk X, Peanut blank, Shellfish blank, Soy X, Tree Nuts blank, Sesame X, Wheat X.",
            },
          ],
        },
      ],
    ]),
  ],
  [
    "silver-and-sons-bbq-bethesda-md",
    new Map([
      [
        "merguez-sausage-kabob",
        {
          description: undefined,
          ingredientsText: undefined,
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Silver and Sons official PDF: the marker beside Merguez Sausage Kabob is G, which the menu legend defines as gluten free, not contains gluten. No direct official allergen claim is stored for this item.",
        },
      ],
    ]),
  ],
  [
    "mi-vida-washington-dc-dc-metro",
    new Map([
      [
        "green-pipian-deviled-eggs",
        {
          description: "Green pipian deviled eggs topped with pickled onions.",
          ingredientsText: "Deviled eggs, green pipian, pickled onions.",
          allergens: ["egg"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed MI VIDA official menu evidence: Green Pipián Deviled Eggs are deviled eggs. The previous Naranjas Enchiladas text was PDF row-boundary bleed from the next item.",
        },
      ],
      [
        "zanahorias",
        {
          description:
            "Grilled carrots, queso, salsa macha made with pumpkin seeds and peanuts.",
          ingredientsText:
            "Grilled carrots, queso, salsa macha made with pumpkin seeds and peanuts.",
          allergens: ["milk", "peanut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed MI VIDA official brunch/lunch PDF: ZANAHORIAS lists queso and salsa macha made with pumpkin seeds and peanuts. The nearby '( ) Contains Gluten' legend is not an item-level gluten marker for this dish.",
        },
      ],
    ]),
  ],
  [
    "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro",
    new Map([
      [
        "37-holy-cow-less",
        {
          description:
            "Vegan meatball crumbles with garlic butter, marinara, melted mozzarella and parmesan cheese, served on a toasted sub roll. Contains soy and wheat.",
          ingredientsText:
            "Vegan meatball crumbles, garlic butter, marinara, mozzarella, parmesan, toasted sub roll. Contains soy and wheat.",
          allergens: ["milk", "soy", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Lost Dog official ordering/menu evidence: #37 Holy Cow-Less lists garlic butter, mozzarella, parmesan, toasted sub roll, and an item-level 'CONTAINS: SOY & WHEAT' statement.",
        },
      ],
    ]),
  ],
  [
    "bayou-bakery-arlington-va",
    new Map([
      [
        "bayou-chopped",
        {
          description:
            "Chopped romaine, blue cheese, bacon, egg, cured tomatoes, radish, avocado, and creole mustard dressing.",
          ingredientsText:
            "Romaine, blue cheese, bacon, egg, cured tomatoes, radish, avocado, creole mustard dressing.",
          allergens: ["milk", "egg"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: Bayou Chopped lists blue cheese and egg. The following Daily Greens text was row-boundary bleed.",
        },
      ],
      [
        "beignets",
        {
          description: null,
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: the scraped Beignets description belonged to the neighboring Latte row, so it was removed.",
        },
      ],
      [
        "bayou-chedda-roast",
        {
          description:
            "Allen Brothers medium rare roast beef, Tillamook sharp cheddar, lemon-dressed arugula, and tangy horseradish sauce. Served on a toasted sesame roll.",
          ingredientsText:
            "Roast beef, Tillamook sharp cheddar, arugula, horseradish sauce, toasted sesame roll.",
          allergens: ["milk", "sesame", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast menu evidence: Bayou Chedda' Roast lists sharp cheddar and a toasted sesame roll. The following fish sandwich text was row-boundary bleed.",
        },
      ],
      [
        "blackened-turkey-meatballs",
        {
          description:
            "Oven-roasted tomato sauce and parmesan. This item cannot be made dairy-free or gluten-free; meatballs contain cheese and breadcrumbs.",
          ingredientsText:
            "Turkey meatballs, tomato sauce, parmesan, cheese, breadcrumbs.",
          allergens: ["milk", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast menu evidence: Blackened Turkey Meatballs say they cannot be made dairy-free or gluten-free because the meatballs contain cheese and breadcrumbs. The following Mac & Cheese text was row-boundary bleed.",
        },
      ],
      [
        "blackened-turkey-meatballs-4",
        {
          description:
            "Oven-roasted tomato sauce and parmesan. This item cannot be made dairy-free or gluten-free; meatballs contain cheese and breadcrumbs.",
          ingredientsText:
            "Turkey meatballs, tomato sauce, parmesan, cheese, breadcrumbs.",
          allergens: ["milk", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: Blackened Turkey Meatballs list parmesan and state the meatballs contain cheese and breadcrumbs. The following Spinach Madeline and Mac & Cheese text was row-boundary bleed.",
        },
      ],
      [
        "cold-blackened-turkey-meatballs",
        {
          description:
            "Five individual meatballs in marinara sauce, served cold. Meatballs contain gluten and parmesan that cannot be removed.",
          ingredientsText:
            "Turkey meatballs, marinara sauce, parmesan, breadcrumbs.",
          allergens: ["gluten", "milk", "wheat"],
          mayContain: [],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: Cold Blackened Turkey Meatballs state the meatballs contain gluten and parmesan that cannot be removed.",
        },
      ],
      [
        "cuban-coffee",
        {
          description:
            "Two shots of espresso sweetened with demerara sugar. No modifications.",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: removed the following Sodas, Iced Teas & Juices section heading from the Cuban Coffee description.",
        },
      ],
      [
        "flat-white",
        {
          description:
            "8 oz pour with two ounces of espresso and six ounces of slightly foamed milk. Cannot be modified or made iced.",
          ingredientsText:
            "Espresso, foamed milk.",
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: Flat White lists foamed milk. The scraped Latte description belonged to the neighboring item.",
        },
      ],
      [
        "honey-lavender-latte",
        {
          description:
            "Lavender flower and vanilla bean steeped in local honey. Ingredients cannot be removed or adjusted because they are steeped together.",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: removed the following Buzzin Bee Hive Latte row from the Honey Lavender Latte description.",
        },
      ],
      [
        "j-baker-pimiento-cheese",
        {
          name: "J. Baker's Pimiento Cheese",
          description:
            "Fire-roasted red pepper, sweet onion, cream cheese, and cheddar dip.",
          ingredientsText:
            "Fire-roasted red pepper, sweet onion, cream cheese, cheddar.",
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: J. Baker's Pimiento Cheese lists cream cheese and cheddar. The scraped Avocado Benedict description belonged to another row.",
        },
      ],
      [
        "roasted-chicken-salad",
        {
          name: "Roasted Chicken Salad",
          description: "8 oz portion of chicken salad for a quick snack.",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: Roasted Chicken Salad is a half-pint chicken salad item; the following sandwich text was row-boundary bleed.",
        },
      ],
      [
        "salmon-toast",
        {
          description:
            "Honey grain toast, lemon-chive cream cheese, everything spice, house-cured gravlax, watercress, radish, and lemon-chili vinaigrette.",
          ingredientsText:
            "Honey grain toast, lemon-chive cream cheese, everything spice, gravlax, watercress, radish, lemon-chili vinaigrette.",
          allergens: ["fish", "milk", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: Salmon Toast lists toast, cream cheese, and house-cured gravlax. The following Muff-a-lotta text was row-boundary bleed.",
        },
      ],
      [
        "veggie-ville",
        {
          allergens: ["milk", "sesame", "wheat", "gluten"],
          sourceSummary:
            "Reviewed Bayou Bakery official Toast menu evidence: Veggie-Ville lists parmesan cheese, pesto containing parmesan, and a toasted sesame seed bun; it also states the item cannot be made dairy-free.",
        },
      ],
    ]),
  ],
  [
    "replacement-redrocks-pizza-washington-dc",
    new Map([
      [
        "ny-steak-and-cheese",
        {
          description:
            "New York strip (8 oz), fontina cheese, arugula, caramelized onion, sweet peppers, and creamy horseradish.",
          ingredientsText:
            "New York strip (8 oz), fontina cheese, arugula, caramelized onion, sweet peppers, and creamy horseradish.",
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed RedRocks official dinner PDF: N.Y. Steak & Cheese contains fontina cheese. The raw/undercooked shellfish/egg warning is a global menu notice, not item-level allergen evidence.",
        },
      ],
    ]),
  ],
  [
    "replacement-pure-pasty-vienna-shop-vienna-va",
    new Map([
      [
        "sausage-roll",
        {
          allergens: ["wheat", "gluten"],
          mayContain: ["sesame"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Pure Pasty official menu evidence: Sausage Roll is pork banger sausage wrapped in puff pastry, with an item-level may-contain sesame statement.",
        },
      ],
    ]),
  ],
  [
    "replacement-tiki-on-18th-washington-dc",
    new Map([
      [
        "fried-siomai",
        {
          allergens: ["shellfish", "egg", "sesame", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed Tiki On 18th official food menu: Fried Siomai lists shrimp dumplings plus item-level egg and sesame oil; dumpling wrappers provide wheat/gluten evidence.",
        },
      ],
    ]),
  ],
  [
    "replacement-sunflower-vegetarian-restaurant-vienna-va",
    new Map([
      [
        "a13organic-edamame-soybeans-cold",
        {
          allergens: ["soy", "peanut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sunflower official ordering/menu evidence: Organic edamame soybeans are flavored with Taiwanese BBQ sauce containing peanut.",
        },
      ],
      [
        "a5fried-chicken",
        {
          allergens: ["soy", "peanut", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sunflower official menu evidence: vegan fried chicken uses non-GMO soy chunks, peanut-containing sauce, and mushrooms battered with breadcrumbs.",
        },
      ],
      [
        "a9spicy-organic-spinach-wonton-in-red-sauce6",
        {
          allergens: ["soy", "peanut", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sunflower official menu evidence: spinach wontons are stuffed with non-GMO soy chunks and bean curd, and the item-level text says contains peanut.",
        },
      ],
      [
        "b2organic-spinach-wonton-soup",
        {
          allergens: ["soy", "peanut", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sunflower official menu evidence: Organic Spinach Wonton Soup includes house-made wontons stuffed with non-GMO soy chunks and bean curd, with an item-level contains-peanut note.",
        },
      ],
      [
        "s16amazing-mushrooms-palate",
        {
          allergens: ["soy", "peanut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sunflower official menu evidence: Amazing Mushrooms Palate lists edamame and a basil BBQ sauce containing peanut.",
        },
      ],
    ]),
  ],
  [
    "replacement-cocineros-hyattsville-md",
    new Map([
      [
        "empanadas-box",
        {
          allergens: ["milk", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Cocineros official Wix menu API: Empanadas Box says chicken/spinach/cheese empanadas contain dairy and the dough contains gluten.",
        },
      ],
      [
        "flautas-doradas-tray",
        {
          allergens: ["milk"],
          mayContain: ["gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Cocineros official Wix menu API. Contains: milk from sour cream. Cross-contact: gluten because the source says the item is fried in oil used for gluten-containing products.",
        },
      ],
      [
        "large-chips-and-guac-tray",
        {
          allergens: [],
          mayContain: ["gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Cocineros official Wix menu API: Large Chips & Guac Tray has no direct top-9 allergen named, but the chips are fried in oil used for gluten-containing products.",
        },
      ],
      [
        "small-chips-and-salsa-tray",
        {
          allergens: [],
          mayContain: ["gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Cocineros official Wix menu API: Small Chips & Salsa Tray has no direct top-9 allergen named, but the chips are fried in oil used for gluten-containing products.",
        },
      ],
      [
        "small-tray-of-chips-and-guac",
        {
          allergens: [],
          mayContain: ["gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Cocineros official Wix menu API: Small tray of chips and guac has no direct top-9 allergen named, but the chips are fried in oil used for gluten-containing products.",
        },
      ],
      [
        "tostones-tray",
        {
          allergens: ["milk"],
          mayContain: ["gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Cocineros official Wix menu API. Contains: milk from cheese. Cross-contact: gluten because the source says the item is fried in oil used for gluten-containing products.",
        },
      ],
    ]),
  ],
  [
    "replacement-nue-elegantly-vietnamese-falls-church-va",
    new Map([
      [
        "chili-oil-wontons",
        {
          description: "Wild gulf shrimp, Berkshire pork, spicy chili oil, and light sweet tamari.",
          ingredientsText:
            "Wild gulf shrimp, Berkshire pork, spicy chili oil, and light sweet tamari.",
          allergens: ["shellfish"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official NUE summer lunch menu PDF: Chili Oil Wontons list wild gulf shrimp and Berkshire pork. The raw/undercooked egg warning is a global menu notice, not item-level egg evidence.",
        },
      ],
      [
        "tofu-noodle-bowl-v",
        {
          category: "Lunch",
          description: "Fresh herbs, summer vegetables, and tamari.",
          ingredientsText: "Fresh herbs, summer vegetables, and tamari.",
          allergens: ["soy"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official NUE summer lunch menu PDF: Tofu Noodle Bowl lists fresh herbs, summer vegetables, and tamari. The raw/undercooked egg/meat/seafood warning and dietary legend are global menu notes, not item-level evidence.",
        },
      ],
    ]),
  ],
  [
    "northside-social-va",
    new Map([
      [
        "white-bean-and-pesto-soup",
        {
          category: "Soups",
          description: "Puree of white bean, hint of cream, basil pesto. Contains nuts.",
          ingredientsText: "White bean, cream, basil pesto. Contains nuts.",
          allergens: ["milk", "tree-nut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Northside Social menu source: White Bean & Pesto Soup lists a hint of cream, basil pesto, and item-level 'Contains Nuts.' The following Chicken Posole and category text were menu bleed.",
        },
      ],
    ]),
  ],
  [
    "medina-dc",
    new Map([
      [
        "lamb-shish",
        {
          name: "Lamb Shish",
          description: "Kefir labne, cumin, peppers, and onions.",
          ingredientsText: "Kefir labne, cumin, peppers, and onions.",
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Medina/Maydan official PDF: Lamb Shish lists kefir labne and carries the plus marker for dairy. The nuts/gluten legend and allergy notice are global menu text, not item-level Lamb Shish markers.",
        },
      ],
    ]),
  ],
  [
    "texas-de-brazil-fairfax-fairfax-va-dc-metro",
    new Map([
      [
        "caesar-salad",
        {
          description:
            "Romaine lettuce, cherry tomatoes, shaved Grana Padano cheese, croutons, and Caesar dressing.",
          ingredientsText:
            "Romaine lettuce, cherry tomatoes, shaved Grana Padano cheese, croutons, and Caesar dressing.",
          allergens: ["milk", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Texas de Brazil official Olo menu API: Caesar Salad lists shaved Grana Padano cheese and croutons. The attached To-Go PDF text blob was menu bleed, not item description.",
        },
      ],
    ]),
  ],
  [
    "st-james-dc",
    new Map([
      [
        "espresso-singledouble",
        {
          description: undefined,
          ingredientsText: undefined,
          allergens: [],
          mayContain: ["peanut", "tree-nut", "milk", "egg", "wheat", "soy", "fish", "shellfish"],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed St. James official menu page: the espresso row only carries the restaurant-wide notice that menu items may contain or contact wheat, milk, eggs, peanuts, tree nuts, fish, shellfish, and soy. These are stored as official cross-contact concerns, not direct ingredients.",
        },
      ],
      [
        "tropical-crush",
        {
          description: "Pineapple juice, mango, ginger beer.",
          ingredientsText: "Pineapple juice, mango, ginger beer.",
          allergens: [],
          mayContain: ["peanut", "tree-nut", "milk", "egg", "wheat", "soy", "fish", "shellfish"],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed St. James official menu page: Tropical Crush lists pineapple juice, mango, and ginger beer. The attached allergen notice is restaurant-wide cross-contact wording and is stored as official cross-contact, not direct ingredients.",
        },
      ],
    ]),
  ],
  [
    "little-blackbird-dc",
    new Map([
      [
        "chicken-milanese",
        {
          category: "Entrees",
          description: "Breaded and pan-fried chicken cutlet with tomato caper vinaigrette and spinach.",
          ingredientsText: "Breaded chicken cutlet, tomato caper vinaigrette, spinach.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          name: "Chicken Milanese",
          sourceSummary:
            "Reviewed Little Blackbird official dinner menu: wine-pairing text was trimmed from the Chicken Milanese row.",
        },
      ],
      [
        "hamachi-crudo",
        {
          description: "Sushi-grade hamachi, coconut shoyu, chili crisp, mandarin, and avocado.",
          ingredientsText: "Hamachi, coconut shoyu, chili crisp, mandarin, avocado.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Little Blackbird official dinner menu: wine-pairing text was trimmed from the Hamachi Crudo row.",
        },
      ],
      [
        "hummus-platter-dollar16-vg",
        {
          name: "Hummus Platter",
          description: "Hummus tahina, harissa hummus, ranch hummus, nigella hummus, and pita chips.",
          ingredientsText: "Hummus tahina, harissa hummus, ranch hummus, nigella hummus, pita chips.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Little Blackbird official dinner menu: price and wine-pairing text were trimmed from the Hummus Platter row.",
        },
      ],
      [
        "little-gem-salad",
        {
          description: "Blue cheese, Moon Drop grapes, celery, and walnut vinaigrette.",
          ingredientsText: "Blue cheese, Moon Drop grapes, celery, walnut vinaigrette.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Little Blackbird official dinner menu: wine-pairing text was trimmed from the Little Gem Salad row.",
        },
      ],
      [
        "petit-filet",
        {
          description:
            "Feta potatoes au gratin and baby tomato salad with sweet sherry vinaigrette. Prepared at the chef's temperature of medium rare.",
          ingredientsText:
            "Petit filet, feta potatoes au gratin, baby tomato salad, sweet sherry vinaigrette.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Little Blackbird official dinner menu: wine-pairing text was trimmed from the Petit Filet row.",
        },
      ],
      [
        "petit-filet-dollar30-gf",
        {
          name: "Petit Filet",
          category: "Entrees",
          description:
            "Feta potatoes au gratin and baby tomato salad with sweet sherry vinaigrette. Prepared at the chef's temperature of medium rare.",
          ingredientsText:
            "Petit filet, feta potatoes au gratin, baby tomato salad, sweet sherry vinaigrette.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Little Blackbird official dinner menu: duplicate price-bearing Petit Filet row was cleaned and wine-pairing text was trimmed.",
        },
      ],
      [
        "pork-chop-dollar28-gf",
        {
          name: "Pork Chop",
          category: "Entrees",
          description: "Hearth-roasted apple, potato, and bourbon caramel.",
          ingredientsText: "Pork chop, hearth-roasted apple, potato, bourbon caramel.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Little Blackbird official dinner menu: price and wine-pairing text were trimmed from the Pork Chop row.",
        },
      ],
      [
        "shrimp",
        {
          description: "Corn puree, jalapeno, Gruyere, and cilantro.",
          ingredientsText: "Shrimp, corn puree, jalapeno, Gruyere, cilantro.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Little Blackbird official dinner menu: wine-pairing text was trimmed from the Shrimp row.",
        },
      ],
    ]),
  ],
  [
    "imperfecto-dc",
    new Map([
      [
        "chuleta-de-cordero",
        {
          name: "Chuleta de Cordero",
          description:
            "Australian lamb rack, sour date syrup glaze, artichoke and roasted eggplant puree, frisee, herbs, and jus.",
          ingredientsText:
            "Australian lamb rack, sour date syrup glaze, artichoke, roasted eggplant puree, frisee, herbs, jus.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Imperfecto official dinner PDF: wine-pairing text was trimmed from Chuleta de Cordero.",
        },
      ],
      [
        "pastrami-sandwich",
        {
          category: "Sandwiches",
          description:
            "House-made brisket pastrami, Havarti cheese, Jerusalem bagel, dijonnaise, and pickles.",
          ingredientsText:
            "Brisket pastrami, Havarti cheese, Jerusalem bagel, dijonnaise, pickles.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Imperfecto official menu evidence: add-on/pricing/service-fee text was trimmed from the Pastrami Sandwich row.",
        },
      ],
    ]),
  ],
  [
    "hu-tieu-mi-lacay-cho-lon-falls-church-va",
    new Map([
      [
        "hu-tieu-lacay",
        {
          description: undefined,
          ingredientsText: undefined,
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Hu Tieu Mi Lacay source evidence: the previous description was reviewer/template prose, not item-level menu copy. The menu item is preserved without a fabricated description.",
        },
      ],
    ]),
  ],
  [
    "mama-tigre-oakton-va",
    new Map([
      [
        "masala-fries",
        {
          description:
            "Crispy fries smothered with tikka sauce, masala queso, crema, cilantro, and chile de arbol.",
          ingredientsText:
            "Crispy fries, tikka sauce, masala queso, crema, cilantro, and chile de arbol.",
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Mama Tigre menu evidence: wine-list rows bled into Masala Fries. The item copy was trimmed to the food description only.",
        },
      ],
    ]),
  ],
  [
    "north-italia-reston-va",
    new Map([
      [
        "cheese-pizza",
        {
          description: undefined,
          ingredientsText: undefined,
          allergens: [],
          mayContain: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed North Italia Reston source evidence: the previous Cheese Pizza description was a kids-menu section bleed. The menu item is preserved without that unrelated description.",
        },
      ],
    ]),
  ],
  [
    "philippe-chow-dc-washington-dc-dc-metro",
    new Map([
      [
        "filet-and-green-beans",
        {
          description: "Stir-fried steak, housemade steak sauce.",
        },
      ],
      [
        "vegetable-stir-fry-19-garlic-sauce",
        {
          id: "vegetable-stir-fry",
          name: "Vegetable Stir Fry",
          description: "Garlic sauce.",
        },
      ],
      [
        "wagyu-ny-steak",
        {
          description:
            "14 oz Australian wagyu striploin, savory Szechuan au poivre, blistered shishitos, crispy shallots.",
        },
      ],
    ]),
  ],
  [
    "california-pizza-kitchen",
    new Map([
      [
        "barqs-root-beer",
        {
          category: "Beverages",
          description: "Barq Root Beer [cal.130]",
        },
      ],
    ]),
  ],
  [
    "bartaco-wharf-dc",
    new Map([
      [
        "cauliflower-contains-pistachio",
        {
          allergens: ["tree-nut"],
          mayContain: [],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed official bartaco menu row: the cauliflower taco lists pistachio in the item name/description and the menu notes it contains pistachio.",
          evidence: [
            {
              sourceKind: "html-card",
              sourceUrl: "https://bartaco.com/location/the-wharf/",
              text:
                "cauliflower (contains pistachio): roasted cauliflower placed on a chickpea hummus topped with pistachio chimichurri and fresh pomegranate seeds.",
            },
          ],
        },
      ],
      [
        "mediterranean-cauliflower-contains-pistachio",
        {
          allergens: ["tree-nut"],
          mayContain: [],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed official bartaco menu row: the mediterranean cauliflower rice bowl lists pistachio chimichurri and the menu notes it contains pistachio.",
          evidence: [
            {
              sourceKind: "html-card",
              sourceUrl: "https://bartaco.com/location/the-wharf/",
              text:
                "mediterranean cauliflower (contains pistachio): roasted cauliflower, chickpea hummus, pistachio chimichurri, honey-harissa glazed carrots, and pomegranate seeds.",
            },
          ],
        },
      ],
      ...[
        ["chicken-taco-w-cheese", { allergens: ["milk"] }],
        ["steak-taco-w-cheese", { allergens: ["milk", "sesame", "soy"] }],
        ["kids-fish-taco", { allergens: ["fish"] }],
        ["kids-corn", { allergens: ["milk"] }],
        ["oaxaca-cheese-snack", { allergens: ["milk"] }],
        ["steamed-broccoli", { allergens: ["milk"] }],
      ].map(([itemId, override]) => [
        itemId,
        {
          ...override,
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official bartaco Olo menu card: the item-level contains field was mapped to app allergens.",
          evidence: [
            {
              sourceKind: "html-card",
              sourceUrl: "https://order.bartaco.com/menu/bartaco-the-wharf",
              text: "Official bartaco Olo menu card contains field.",
            },
          ],
        },
      ]),
      [
        "gelato",
        {
          category: "Dessert",
          sourceSummary:
            "Reviewed official bartaco menu row: the gelato cup/cone note says cones contain gluten.",
        },
      ],
      [
        "kids-trays",
        {
          category: "Kids",
          sourceSummary:
            "Reviewed official bartaco menu row: the kids trays include quesadillas marked with the menu's gluten note.",
        },
      ],
    ]),
  ],
  [
    "lardente-dc",
    new Map([
      [
        "blueberry-panna-cotta",
        {
          allergens: ["milk", "egg", "wheat", "gluten", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: panna cotta, olive oil cake, almond streusel, and yogurt powder support milk, egg, wheat/gluten, and tree nut concerns.",
        },
      ],
      [
        "burrata",
        {
          allergens: ["milk", "wheat", "gluten", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Burrata lists burrata, pesto, and pane bianco, supporting milk, tree nut, and wheat/gluten concerns.",
        },
      ],
      [
        "capesante-al-forno",
        {
          allergens: ["shellfish", "milk", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Capesante al Forno lists bay scallops, kombu brown butter, Parmigiano, and hazelnut gremolata.",
        },
      ],
      [
        "cesare",
        {
          allergens: ["fish", "wheat", "gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Cesare lists anchovy dressing and mint breadcrumbs. The previous shellfish-only mapping came from ambiguous shorthand, not the row ingredients.",
        },
      ],
      [
        "creme-brulee-allamaretto",
        {
          allergens: ["milk", "egg", "wheat", "gluten", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: creme brulee, chocolate-almond biscotti, and amaretto-orange cream support milk, egg, wheat/gluten, and tree nut concerns.",
        },
      ],
      [
        "crostata-di-ciliegie",
        {
          allergens: ["milk", "egg", "wheat", "gluten", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Crostata di Ciliegie lists puff pastry, frangipane, and ice cream.",
        },
      ],
      [
        "farro",
        {
          allergens: ["wheat", "gluten", "milk", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Farro lists ancient grain, pine nuts, and feta.",
        },
      ],
      [
        "gianduja-smores",
        {
          allergens: ["milk", "egg", "wheat", "gluten", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Gianduja S'Mores lists gianduja mousse, graham cracker, meringue, and candy bar caramel.",
        },
      ],
      [
        "grilled-maine-lobster",
        {
          allergens: ["shellfish", "wheat", "gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Grilled Maine Lobster lists lobster and linguine.",
        },
      ],
      [
        "hamachi-crudo",
        {
          allergens: ["fish", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Hamachi Crudo lists hamachi and Sicilian pistachio.",
        },
      ],
      [
        "linguine-ai-frutti-di-mare",
        {
          allergens: ["shellfish", "wheat", "gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Linguine ai Frutti di Mare lists crab, scallops, prawns, squid, linguine, and breadcrumbs.",
        },
      ],
      [
        "maccheroni",
        {
          allergens: ["wheat", "gluten", "milk", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Maccheroni lists pasta, pesto, and Pecorino.",
        },
      ],
      [
        "vanilla-souffle",
        {
          allergens: ["milk", "egg", "tree-nut"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official L'Ardente menu row: Vanilla Souffle lists souffle and Sicilian pistachio gelato.",
        },
      ],
    ]),
  ],
  [
    "thompson-italian-falls-church-dc-metro",
    new Map([
      [
        "classic-meatball-tray",
        {
          allergens: ["milk", "gluten", "wheat"],
          sourceSummary:
            "Reviewed official Thompson Italian catering row: Classic Meatball Tray lists Parmesan and states it contains gluten; wheat is retained because the row is a wheat-based meatball/breadcrumb tray.",
        },
      ],
      [
        "kids-pizza-sticks-tray",
        {
          allergens: ["milk", "gluten", "wheat"],
          sourceSummary:
            "Reviewed official Thompson Italian catering row: Kids Pizza Sticks Tray lists fontina cheese and states it contains gluten; wheat is retained for the pizza sticks.",
        },
      ],
      [
        "mac-and-cheese-tray",
        {
          allergens: ["milk", "gluten", "wheat"],
          sourceSummary:
            "Reviewed official Thompson Italian catering row: Mac & Cheese Tray states it contains gluten and is a wheat pasta dish with cheese.",
        },
      ],
    ]),
  ],
  [
    "osm-thompson-italian-11874404375",
    new Map([
      [
        "kids-pizza-sticks-tray",
        {
          allergens: ["milk", "gluten", "wheat"],
          sourceSummary:
            "Reviewed official Thompson Italian catering row: Kids Pizza Sticks Tray lists fontina cheese and states it contains gluten; wheat is retained for the pizza sticks.",
        },
      ],
      [
        "lamb-meatballs-tray",
        {
          allergens: ["tree-nut", "gluten", "wheat"],
          sourceSummary:
            "Reviewed official Thompson Italian catering row: Lamb Meatballs Tray states it contains gluten and almonds; wheat is retained for the meatball/breadcrumb context.",
        },
      ],
    ]),
  ],
  [
    "jack-rose-dining-saloon-washington-dc-dc-metro",
    new Map([
      [
        "fried-mac-and-cheese",
        {
          allergens: ["milk", "egg", "wheat", "gluten"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official Jack Rose Toast row: Fried Mac & Cheese lists an item-level allergen note for dairy, gluten, and egg. Wheat is retained for the macaroni/breading context.",
        },
      ],
    ]),
  ],
  [
    "burtons-grill-and-bar-washington-dc-dc-metro",
    new Map([
      [
        "firecracker-shrimp",
        {
          allergens: ["shellfish", "sesame"],
          mayContain: ["milk"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official Burtons structured menu row. Contains: shrimp and sesame seeds. Cross-contact: the official row warns this item will have cross contact with dairy in the fryer.",
        },
      ],
    ]),
  ],
  [
    "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro",
    new Map([
      [
        "italian-fries",
        {
          allergens: ["wheat", "gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Lost Dog official ordering row: Italian Fries carry an item-level 'Contains Gluten' statement; wheat is retained for the seasoned fry coating context.",
        },
      ],
      [
        "vegan-meatball-sub",
        {
          allergens: ["soy", "wheat", "gluten"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Lost Dog official ordering row: Vegan Meatball Sub has an item-level 'CONTAINS: SOY & WHEAT' statement.",
        },
      ],
    ]),
  ],
  [
    "osm-karahi-boys-13475305897",
    new Map([
      [
        "butter-naan",
        {
          allergens: ["milk", "wheat", "gluten"],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed Karahi Boys official menu row: Butter Naan is a tandoor-baked naan brushed with butter and has an item-level dairy disclosure. Wheat/gluten are retained for the naan bread context.",
        },
      ],
    ]),
  ],
  [
    "pho-hai-duong-tysons-va",
    new Map([
      [
        "goi-cuon",
        {
          allergens: ["shellfish", "peanut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official Pho Hai Duong image menu: Goi Cuon lists shrimp and peanut sauce; no wheat/gluten disclosure is present.",
        },
      ],
      [
        "cha-gio",
        {
          allergens: ["shellfish", "fish"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official Pho Hai Duong image menu: Cha Gio lists shrimp and fish sauce; no wheat/gluten disclosure is present.",
        },
      ],
    ]),
  ],
  [
    "baan-mae-dc",
    new Map([
      [
        "pun-yaw",
        {
          allergens: ["shellfish", "peanut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed official Baan Mae Toast menu: Pun Yaw is explicitly marked as containing shellfish and peanuts. No tree-nut or wheat/gluten disclosure appears in the item row.",
        },
      ],
    ]),
  ],
  [
    "replacement-planta-washington-dc-washington-dc",
    new Map([
      [
        "dessert-platters",
        {
          name: "Seasonal Cheesecake Dessert Platter",
          description: "Vegan seasonal cheesecake platter. Contains nuts; marked gluten free on the official menu.",
          allergens: ["tree-nut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed PLANTA Washington DC official menu text: the Seasonal Cheesecake Dessert Platter is in the vegan menu context, marked as containing nuts, and marked gluten free.",
        },
      ],
    ]),
  ],
  [
    "replacement-the-daily-dish-silver-spring-md",
    new Map([
      [
        "crab-cake",
        {
          allergens: ["shellfish"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Daily Dish official PDF: Crab Cake explicitly names jumbo lump crab. No wheat/gluten disclosure is present in the row. No egg disclosure is present in the row.",
        },
      ],
    ]),
  ],
  [
    "neutral-ground-mclean-va",
    new Map([
      [
        "ng-caesar-salad",
        {
          allergens: ["fish", "milk"],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed official Neutral Ground Toast row: NG Caesar Salad lists white anchovy filets and dressing containing anchovy, plus crispy parmesan crumble.",
        },
      ],
    ]),
  ],
  [
    "good-company-doughnuts-ballston-va",
    new Map([
      [
        "mango-hibiscus-vegan",
        {
          description:
            "Sourdough doughnut filled with mango filling and topped with glaze. Allergens: wheat, soy.",
          ingredientsText:
            "Sourdough doughnut, mango filling, glaze. Allergens: wheat, soy.",
          allergens: ["wheat", "gluten", "soy"],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed Good Company official ordering row: Mango Hibiscus Vegan lists wheat and soy allergens; gluten is retained for the sourdough doughnut/wheat context. Removed stale OUT OF STOCK copy from the display fields.",
        },
      ],
      [
        "blt-sandwich",
        {
          description:
            "Ciabatta, thick-cut applewood bacon, maple sauce, sliced tomato, onion, butter lettuce, mayo, and lemon vinaigrette.",
          ingredientsText:
            "Ciabatta, thick-cut applewood bacon, maple sauce, sliced tomato, onion, butter lettuce, mayo, and lemon vinaigrette.",
          allergens: ["egg", "gluten", "wheat"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Good Company official Toast row: BLT Sandwich lists ciabatta and mayo. Butter lettuce is produce, not dairy butter.",
        },
      ],
      [
        "stellas-veggie-and-cheese-sandwich",
        {
          description:
            "Multigrain bread, Vermont white cheddar cheese, cucumber, lettuce, tomato, onion, herbs, mayo and Dijon.",
          ingredientsText:
            "Multigrain bread, Vermont white cheddar cheese, cucumber, lettuce, tomato, onion, herbs, mayo and Dijon.",
          allergens: ["egg", "gluten", "milk", "mustard", "wheat"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Good Company official Toast row: Stella's Veggie & Cheese Sandwich lists multigrain bread, white cheddar cheese, mayo, and Dijon.",
        },
      ],
      [
        "veggie-egg-and-cheese-sandwich",
        {
          description:
            "Egg, cheddar cheese, sliced tomato, red onion, baby spinach and caramelized onion on a toasted house English muffin.",
          ingredientsText:
            "Egg, cheddar cheese, sliced tomato, red onion, baby spinach and caramelized onion on a toasted house English muffin.",
          allergens: ["egg", "gluten", "milk", "wheat"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Good Company official Toast row: Veggie Egg & Cheese Sandwich lists egg, cheddar cheese, and a toasted house English muffin.",
        },
      ],
      [
        "steak-and-cheese-sandwich",
        {
          description:
            "Semolina hoagie, house roast beef, fontina cheese, shallot confit, charred jalapeno, mayo and fresh herbs.",
          ingredientsText:
            "Semolina hoagie, house roast beef, fontina cheese, shallot confit, charred jalapeno, mayo and fresh herbs.",
          allergens: ["egg", "gluten", "milk", "wheat"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Good Company official menu row: Steak & Cheese Sandwich lists semolina hoagie, fontina cheese, and mayo.",
        },
      ],
      [
        "veggie-and-rice-soup-cup",
        {
          description:
            "A slow-simmered blend of carrots, celery, yellow onion, vegetable broth, rice, warm spices and fresh herbs.",
          ingredientsText:
            "Carrots, celery, yellow onion, vegetable broth, rice, warm spices and fresh herbs.",
          allergens: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Good Company official Toast row: the soup description lists vegetables, vegetable broth, rice, spices and herbs. No official allergen disclosure is present.",
        },
      ],
      [
        "veggie-and-rice-soup-bowl",
        {
          description:
            "A slow-simmered blend of carrots, celery, yellow onion, vegetable broth, rice, warm spices and fresh herbs.",
          ingredientsText:
            "Carrots, celery, yellow onion, vegetable broth, rice, warm spices and fresh herbs.",
          allergens: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Good Company official Toast row: removed neighboring section boundary text from the soup row. No official allergen disclosure is present.",
        },
      ],
      [
        "stellas-veggie-lunch-box",
        {
          description: "Includes one piece of fruit, chips, and a classic doughnut.",
          ingredientsText: null,
          allergens: [],
          allergenSourceType: "unavailable",
          sourceSummary:
            "Reviewed Good Company official Toast row: removed neighboring lunch-box and location text from the source summary.",
        },
      ],
    ]),
  ],
  [
    "hu-tieu-mi-lacay-cho-lon-falls-church-va",
    new Map([
      [
        "wonton-soup",
        {
          allergens: ["shellfish", "wheat", "gluten"],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed official Lacay menu row: Wonton Soup states the wonton contains pork and shrimp. Wheat/gluten are retained for the wonton wrapper context.",
        },
      ],
    ]),
  ],
  [
    "kizuna-sushi-ramen-tysons-va",
    new Map([
      [
        "vegetable-tempura-app",
        {
          allergens: ["wheat", "gluten", "soy"],
          allergenSourceType: "official-product-allergen-section",
          sourceSummary:
            "Reviewed official Kizuna Toast row: Vegetable Tempura App lists Gluten and Soy; wheat is retained for the tempura batter context.",
        },
      ],
    ]),
  ],
]);

const bibibopOfficialAllergenSourceUrl =
  "https://bibibop.com/wp-content/uploads/2026/04/BIBIBOP-Nutrition-Updated-4.23.26.pdf";
const bibibopOfficialEvidence =
  "Official BIBIBOP Nutrition & Allergen Guide, updated April 2026. The guide states BIBIBOP is peanut-free and MSG-free, cannot guarantee against gluten/wheat cross-contamination, and marks item-level allergens with X in the allergen matrix.";

function slugifyReviewedRowId(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isGenericRestaurantCategory(value) {
  return /^(?:restaurant|menu|food|american|italian|indian|korean|thai|mexican|cafe \/ sandwiches)$/i.test(
    String(value ?? "").trim(),
  );
}

function packedPriceCount(value) {
  return (String(value ?? "").match(/\$\s*\d{1,3}(?:[,.]\d{2})?\+?/g) ?? []).length;
}

function isPackedPricedMenuListRow(item) {
  const description = String(item?.description ?? "");

  if (packedPriceCount(description) < 4) {
    return false;
  }

  if (/\b(?:add ons?|sub |choice of|served with choice|gluten[- ]free pasta)\b/i.test(description)) {
    return false;
  }

  return (
    isGenericRestaurantCategory(item?.category) ||
    /^(?:biryani|tandoori breads|tandoori kebabs|vegetarian entrees|beef|shareables|entrees|sides? (?:&|and) add ons?)$/i.test(
      String(item?.name ?? "").trim(),
    )
  );
}

function splitPackedPricedMenuListRow(item) {
  const description = String(item?.description ?? "");
  const matches = [
    ...description.matchAll(
      /((?:(?:\([A-Z]{1,4}\)\s*)*)[^$]{2,90}?)\s*(\$\s*\d{1,3}(?:[,.]\d{2})?\+?)/g,
    ),
  ];

  if (matches.length < 4) {
    return [];
  }

  const category = String(item.name ?? item.category ?? "Menu").trim();
  const rows = [];

  for (const match of matches) {
    const rawName = String(match[1] ?? "").replace(/\s+/g, " ").trim();
    const price = String(match[2] ?? "").replace(",", ".").replace(/\s+/g, "");
    const markers = [...rawName.matchAll(/\(([A-Z]{1,4})\)/g)].map((entry) => entry[1]);
    const name = rawName.replace(/\([A-Z]{1,4}\)\s*/g, "").trim();

    if (!name || name.length < 3 || /^(?:and|or|with|choice of)$/i.test(name)) {
      continue;
    }

    rows.push({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      allergenSourceType: item.allergenSourceType ?? "unavailable",
      allergens: item.allergens ?? [],
      description: [
        markers.length ? `Menu marker: ${markers.join(", ")}.` : null,
        price ? `Listed price: ${price}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
      evidence: [
        ...(item.evidence ?? []),
        {
          source: "packed-priced-menu-list-repair",
          text: `Split from packed menu list row "${item.name}" in the generated menu output.`,
        },
      ].slice(0, 5),
      mayContain: item.mayContain ?? [],
      sourceKind: "reviewed-packed-priced-menu-list-repair",
      sourceSummary: `Parsed from packed ${category} menu list text in the source menu.`,
      sourceType: "reviewed-menu-repair",
      sourceUrls: item.sourceUrls ?? [],
    });
  }

  return rows;
}

function createBibibopOfficialRows() {
  const rows = [
    ["Citrus Honey Kale", "Bases", []],
    ["Crispy Romaine", "Bases", []],
    ["Purple Rice", "Bases", []],
    ["Sweet Potato Noodles", "Bases", ["soy", "sesame"]],
    ["White Rice", "Bases", []],
    ["Chicken", "Protein", ["soy", "sesame"]],
    ["Korean BBQ Beef", "Protein", ["soy", "sesame"]],
    ["Korean Crispy Chicken", "Protein", ["soy", "sesame"]],
    ["Miso Glazed Salmon", "Protein", ["soy", "sesame", "fish"]],
    ["Spicy Chicken", "Protein", ["soy", "sesame"]],
    ["Steak", "Protein", ["soy", "sesame"]],
    ["Tofu", "Protein", ["soy", "sesame"]],
    ["Bean Sprouts", "Hot Toppings", []],
    ["Black Beans", "Hot Toppings", []],
    ["Curry Chickpeas", "Hot Toppings", []],
    ["Potatoes", "Hot Toppings", []],
    ["Roasted Sesame Broccoli", "Hot Toppings", ["sesame"]],
    ["Avocado", "Cold Toppings", []],
    ["Carrots", "Cold Toppings", ["sesame"]],
    ["Cheese", "Cold Toppings", ["milk"]],
    ["Corn", "Cold Toppings", []],
    ["Cucumber", "Cold Toppings", []],
    ["Eggs", "Cold Toppings", ["egg"]],
    ["Kimchi", "Cold Toppings", []],
    ["Pickled Red Onion", "Cold Toppings", []],
    ["Pineapple", "Cold Toppings", []],
    ["Yum Yum", "Sauces", ["milk", "egg", "soy"]],
    ["Teriyaki", "Sauces", ["soy"]],
    ["Gochujang", "Sauces", ["soy", "sesame"]],
    ["Spicy Sriracha", "Sauces", ["soy", "sesame"]],
    ["Sesame Ginger", "Sauces", ["soy", "sesame"]],
    ["Sesame Oil", "Sauces", ["sesame"]],
    ["Kimchi Side", "Sides", []],
    ["Miso Soup", "Sides", ["soy", "fish"]],
    ["Pineapple Side", "Sides", []],
    ["Purple Rice Side", "Sides", []],
    ["White Rice Side", "Sides", []],
    ["Noodles Side", "Sides", ["soy", "sesame"]],
    ["Chocolate Chip Cookie", "Desserts", ["egg", "soy"]],
    ["Snickerdoodle Cookie", "Desserts", ["egg", "soy"]],
  ];

  return rows.map(([name, category, allergens]) => ({
    id: slugifyReviewedRowId(name),
    name,
    category,
    allergens,
    allergenSourceType: "official-allergen-menu",
    evidence: [
      {
        source: "official-bibibop-allergen-guide",
        text: bibibopOfficialEvidence,
        url: bibibopOfficialAllergenSourceUrl,
      },
    ],
    mayContain: ["gluten", "wheat"],
    sourceKind: "official-pdf-allergen-matrix",
    sourceSummary: "Official BIBIBOP Nutrition & Allergen Guide item-level allergen matrix.",
    sourceType: "reviewed-official-allergen-repair",
    sourceUrls: [bibibopOfficialAllergenSourceUrl],
  }));
}

function createOlazzoOfficialMenuRows() {
  const sourceUrl = "https://www.olazzo.com/our-menu";
  const evidenceText =
    "Codex-reviewed official Olazzo menu page. The source lists item names, descriptions, and prices; it also asks guests to disclose allergy or dietary concerns and says it cannot guarantee food will be completely gluten- or nut-free.";
  const rows = [
    ["P.M.T.", "Sandwiches", "Prosciutto, mozzarella, basil, tomato.", "$17"],
    ["Meatball", "Sandwiches", "Homemade beef meatballs, mozzarella, marinara sauce.", "$15"],
    ["Siciliano", "Sandwiches", "Grilled chicken or eggplant Milanese, roasted red peppers, mozzarella, basil.", "$15"],
    ["Parmesan", "Sandwiches", "Lightly breaded chicken or eggplant, baked mozzarella, marinara.", "$15"],
    ["Italian Coldcut", "Sandwiches", "Salami, mortadella, capocollo, mozzarella, tomato, lettuce.", "$17"],
    ["Caprese", "Sandwiches", "Tomato, mozzarella, basil, extra-virgin olive oil, balsamic.", "$13"],
    ["Sausage & Peppers", "Sandwiches", "Sautéed sausage and peppers with onions, olive oil, and garlic.", "$15"],
    ["Milanese", "Sandwiches", "Lightly breaded chicken or eggplant, lettuce, tomato, vinaigrette.", "$15"],
    ["Italian Toast", "Brunch", "Frangelico and egg-dipped challah with house-made whipped cream.", "$12"],
    ["Eggs Benito", "Brunch", "Two English muffins, poached eggs, pancetta, Hollandaise, marinara.", "$15"],
    ["Sausage and Peppers Omelette", "Brunch", "Mild Italian sausage, mozzarella, bell peppers, onions, marinara.", "$15"],
    ["Florentine Omelette", "Brunch", "Spinach, feta cheese, prosciutto, onion, garlic.", "$15"],
    ["Avocado Toast", "Brunch", "Smashed avocado, sliced tomato, fresh mozzarella, basil, applewood balsamic drizzle, served on multigrain.", "$15"],
    ["Pancetta Crepes", "Brunch", "Crispy pancetta bits, mozzarella, two house-made crepes.", "$15"],
    ["Nutella Crepes", "Brunch", "Sliced banana or strawberry, Nutella, two house-made crepes, house-made whipped cream.", "$15"],
    ["Fried Calamari", "Starters", "Lightly breaded squid, house-made marinara.", "$16"],
    ["Bruschetta", "Starters", "Roma tomatoes, mozzarella, basil, olive oil, garlic, toasted ciabatta.", "$12"],
    ["Mozzarella Garlic Bread", "Starters", "Toasted ciabatta, garlic, mozzarella, house-made marinara.", "$11"],
    ["Mussels", "Starters", "Pemaquid mussels with lemon white wine sauce or marinara.", "$16"],
    ["Meatball Sliders", "Starters", "Three hand-rolled beef meatballs, mozzarella, toasted brioche.", "$15"],
    ["Stuffed Dates", "Starters", "Medjool dates, goat cheese, wrapped in pancetta, balsamic reduction, mint.", "$12"],
    ["Arancini", "Starters", "Saffron risotto balls stuffed with mozzarella, marinara.", "$11"],
    ["Caprese Salad", "Salads", "Fresh mozzarella, tomatoes, basil, house vinaigrette.", "$13"],
    ["House Salad", "Salads", "Romaine, spring greens, homemade vinaigrette, cucumbers, red onions.", "$12"],
    ["Olazzo Salad", "Salads", "Sautéed shrimp, tomatoes, fresh mozzarella, basil, house salad.", "$24"],
    ["Greek Salad", "Salads", "Tomato, cucumber, onion, feta, olives, mixed greens, vinaigrette.", "$17"],
    ["Caesar Salad", "Salads", "Romaine hearts, parmesan, homemade croutons and dressing.", "$16"],
    ["Goat Cheese + Walnut", "Salads", "Spring greens, bell peppers, tomatoes, house vinaigrette.", "$17"],
    ["Meatballs w/ Penne", "Entrees", "House-made meatballs, marinara.", "$18"],
    ["Sausage w/ Penne", "Entrees", "Mild pork sausage, marinara.", "$18"],
    ["Lasagna", "Entrees", "Pasta sheets, ricotta, mozzarella, house-made marinara.", "$16"],
    ["Sausage & Peppers", "Entrees", "Italian sausage, olive oil, garlic, onions, bell peppers, linguine.", "$20"],
    ["Penne Alla Checca", "Entrees", "Diced roma tomatoes, fresh basil, olive oil, garlic.", "$15"],
    ["Fettuccine Alfredo", "Entrees", "Creamy alfredo sauce.", "$16"],
    ["Penne Primavera", "Entrees", "Roma tomatoes, broccoli, peppers, onions, mushrooms, sun-dried tomatoes, garlic.", "$18"],
    ["Ravioli Rosé", "Entrees", "Ricotta, parmesan, romano, mozzarella, tomato-cream sauce.", "$16"],
    ["Chicken Cardinale", "Entrees", "Grilled or Milanese chicken, sun-dried tomatoes, tomato-cream sauce, penne pasta.", "$22"],
    ["Chicken or Eggplant Parmesan", "Entrees", "Breaded chicken or eggplant, mozzarella, marinara, penne.", "$22"],
    ["Littleneck Clams", "Entrees", "Sautéed clams, marinara or lemon-white wine sauce, linguine.", "$23"],
    ["Shrimp & Crab Rosé", "Entrees", "Shrimp, crabmeat, house-made tomato-cream sauce, penne pasta.", "$31"],
    ["Spinach & Garlic Tortellini", "Entrees", "Mushrooms, medjool dates, garlic, olive oil.", "$20"],
    ["Baked Penne", "Entrees", "Eggplant, mild Italian sausage, ricotta, marinara, basil, mozzarella.", "$21"],
    ["Gnocchi Bolognese", "Entrees", "Ricotta gnocchi, beef ragu.", "$21"],
    ["Wild Mushroom Gnocchi", "Entrees", "Ricotta gnocchi, parmesan, cream, truffle oil.", "$21"],
    ["Shrimp Pesto", "Entrees", "Shrimp, basil pesto, pine nuts, touch of cream, linguine.", "$25"],
    ["Salmon", "Entrees", "Grilled Norwegian salmon, sautéed vegetables.", "$29"],
    ["Chicken: Grilled or Milanese", "Sides & Add Ons", "", "$9"],
    ["Meatballs (2)", "Sides & Add Ons", "", "$10"],
    ["Italian Sausage (2)", "Sides & Add Ons", "", "$10"],
    ["Shrimp, Grilled or Sautéed", "Sides & Add Ons", "", "$10"],
    ["Side Seasonal Vegetable", "Sides & Add Ons", "", "$10"],
    ["Grilled Salmon", "Sides & Add Ons", "", "$14"],
    ["Gluten-Free Pasta", "Sides & Add Ons", "", "$3"],
  ];

  return rows.map(([name, category, description, price]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description ? `${description} Listed price: ${price}.` : `Listed price: ${price}.`,
      allergens: [],
      allergenSourceType: "unavailable",
      evidence: [
        {
          source: "official-olazzo-menu-page",
          text: evidenceText,
          url: sourceUrl,
        },
      ],
      mayContain: [],
      sourceKind: "official-menu-page-reviewed",
      sourceSummary: "Official Olazzo menu page reviewed into structured item rows.",
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createHawkersReviewedOfficialRows() {
  const sourceUrl = "https://eathawkers.com/wp-content/uploads/2024/03/Allergen-Guide-3.24-Digital.pdf";
  const evidenceText =
    "Codex-reviewed official Hawkers allergen guide, version 3.24 v2. The guide states cooked dishes use vegetable oil that may contain trace soy protein and marks item-level allergens in a visual matrix.";
  const rows = [
    ["Bao - Chinese BBQ Pork", "Dim Sum", ["soy", "shellfish", "milk", "sesame"]],
    ["Bao - Roast Duck", "Dim Sum", ["soy", "shellfish", "milk", "sesame"]],
    ["Bao - Pork Belly", "Dim Sum", ["soy", "milk", "sesame"]],
    ["Bao - Seoul Hot Chicken", "Dim Sum", ["soy", "fish", "milk", "egg", "peanut"]],
    ["Bao - Singapore Chili Crab", "Dim Sum", ["soy", "milk"]],
    ["Sichuan Wontons", "Dim Sum", ["soy", "shellfish", "milk", "egg", "sesame"]],
    ["Yi-Yi's Chicken Dumplings (w/o Sauce)", "Dim Sum", ["soy", "shellfish", "milk", "egg", "sesame"]],
    ["Golden Wontons (w/o Sauce)", "Dim Sum", ["soy", "shellfish", "egg", "peanut", "sesame"]],
    ["Soup Dumplings (w/o Sauce)", "Dim Sum", []],
    ["Roti Canai (w/o Sauce)", "Dim Sum", ["soy", "shellfish", "egg", "peanut", "sesame"]],
    ["Curry Empanada (w/o Sauce)", "Dim Sum", ["sesame"]],
    ["Chicken Egg Roll (w/o Sauce)", "Rolls", ["egg", "sesame"]],
    ["Spring Rolls (w/o Sauce)", "Rolls", ["sesame"]],
    ["Shrimp Summer Rolls (w/o Sauce)", "Rolls", ["shellfish"]],
    ["Bulgogi Steak", "Meats", ["soy", "egg", "sesame"]],
    ["Coconut Shrimp (w/o Sauce)", "Meats", ["shellfish", "milk", "egg"]],
    ["Crispy Pork Belly (w/o Sauce)", "Meats", ["soy", "shellfish", "sesame"]],
    ["Five Spice Sticky Ribs", "Meats", ["soy", "shellfish", "sesame"]],
    ["Chinese BBQ Pork", "Meats", ["soy", "sesame"]],
    ["Battered Wings", "Wings", []],
    ["Naked Wings", "Wings", ["soy", "sesame"]],
    ["Korean Twice Fried Wings", "Wings", ["soy", "sesame"]],
    ["Grilled Shrimp", "Street Skewers", []],
    ["Satay Chicken", "Street Skewers", ["shellfish"]],
    ["Spiced Lamb (w/o Sauce)", "Street Skewers", ["soy", "peanut"]],
    ["Curry Puff (w/o Sauce)", "Happy Hour Exclusive", []],
    ["Japanese Fried Chicken Bites (w/o Sauce)", "Happy Hour Exclusive", ["soy", "milk"]],
    ["Korean Fried Chicken Bites", "Happy Hour Exclusive", []],
    ["Spicy Kimchi", "Not Meats", []],
    ["Edamame", "Not Meats", ["soy", "sesame"]],
    ["Hawker's Delight", "Not Meats", ["soy", "sesame"]],
    ["Crispy Tofu Bites", "Not Meats", ["soy"]],
    ["Five-Spice Green Beans", "Not Meats", []],
    ["Green Papaya Salad", "Not Meats", ["fish", "peanut"]],
    ["Green Papaya and Shrimp Salad", "Not Meats", ["shellfish", "fish", "peanut"]],
    ["Grilled Shishito Peppers", "Not Meats", ["shellfish", "fish", "peanut"]],
    ["Hawkers Fries (w/o Sauce)", "Not Meats", ["soy", "fish", "egg", "sesame"]],
    ["Penang Poutine", "Not Meats", []],
    ["Beef Haw Fun", "Noodles", ["soy", "egg", "sesame"]],
    ["C.K.T.", "Noodles", ["soy", "shellfish", "fish", "egg", "sesame"]],
    ["Chicken Lo Mein", "Noodles", ["soy", "egg", "sesame"]],
    ["Steak Lo Mein", "Noodles", ["soy", "egg", "sesame"]],
    ["Shrimp Lo Mein", "Noodles", ["soy", "shellfish", "egg", "sesame"]],
    ["Sichuan Dan Dan Noodles", "Noodles", ["soy", "shellfish", "egg", "sesame"]],
    ["Pad Thai", "Noodles", ["soy", "peanut", "sesame"]],
    ["Singapore Mei Fun", "Noodles", ["soy", "shellfish", "fish", "egg", "peanut", "sesame"]],
    ["Yaki Udon", "Noodles", ["shellfish", "egg", "sesame"]],
    ["Curry Duck Noodles", "Noodles", ["shellfish", "egg", "sesame"]],
    ["Hokkien Mee", "Noodles", ["soy", "egg", "sesame"]],
    ["Curry Laksa Ramen", "Noodle Soups", ["soy", "shellfish", "fish", "egg"]],
    ["Hong Kong Wonton", "Noodle Soups", ["soy", "shellfish", "egg", "sesame"]],
    ["Sichuan Tonkotsu Ramen", "Noodle Soups", ["soy", "shellfish", "egg", "sesame"]],
    ["Chow Faan", "Rice and Curry", ["soy", "shellfish", "egg", "sesame"]],
    ["Duck Fried Rice", "Rice and Curry", ["soy", "egg", "sesame"]],
    ["Steak and Kimchi Fried Rice", "Rice and Curry", ["soy", "egg"]],
    ["Basil Fried Rice", "Rice and Curry", ["soy", "egg"]],
    ["Chicken Basil Fried Rice", "Rice and Curry", ["soy", "egg"]],
    ["Steak Basil Fried Rice", "Rice and Curry", ["soy", "egg"]],
    ["Shrimp Basil Fried Rice", "Rice and Curry", ["soy", "shellfish", "egg"]],
    ["Po Po Lo's Curry Chicken", "Rice and Curry", ["soy", "fish"]],
    ["Po Po Lo's Curry Steak", "Rice and Curry", ["soy", "fish", "egg"]],
    ["Po Po Lo's Curry Shrimp", "Rice and Curry", ["soy", "shellfish", "fish"]],
    ["Po Po Lo's Curry Braised Beef", "Rice and Curry", ["soy", "fish"]],
    ["Jasmine Rice", "Rice and Curry", []],
    ["Banana Spring Roll", "Sweets", ["soy", "milk", "peanut", "sesame"]],
    ["Jo-Hé Bag O' Donuts (w/o Sauce)", "Sweets", ["milk", "egg"]],
    ["Toasted Rice Soft Serve (w/toppings)", "Sweets", []],
    ["Ube Soft Serve (w/toppings)", "Sweets", []],
    ["Pandan Soft Serve (w/toppings)", "Sweets", []],
    ["Matcha Soft Serve (w/toppings)", "Sweets", []],
    ["Kids Chicken Lo Mein", "Kids Menu", ["soy", "egg"]],
    ["Kids Chicken Fried Rice", "Kids Menu", ["soy", "egg"]],
    ["Kids Steak Bulgogi", "Kids Menu", ["soy", "egg", "sesame"]],
    ["Kids Chicken Bulgogi", "Kids Menu", ["soy", "sesame"]],
    ["Kids Chicken Dumplings (w/o Sauce)", "Kids Menu", ["sesame"]],
    ["Kids Cheesy Roti", "Kids Menu", []],
    ["Kids Donut", "Kids Menu", ["sesame"]],
    ["Kids Ice Cream", "Kids Menu", ["milk"]],
    ["Kids Fruit Cup", "Kids Menu", ["milk", "egg"]],
  ];

  return rows.map(([name, category, allergens]) => ({
    id: slugifyReviewedRowId(`${category}-${name}`),
    name,
    category,
    allergenSourceType: "official-allergen-menu",
    allergens,
    evidence: [
      {
        source: "official-hawkers-allergen-guide",
        text: evidenceText,
        url: sourceUrl,
      },
    ],
    mayContain: ["soy"],
    sourceKind: "official-pdf-allergen-matrix-reviewed",
    sourceSummary: "Official Hawkers allergen guide item-level matrix.",
    sourceType: "reviewed-official-allergen-repair",
    sourceUrls: [sourceUrl],
  }));
}

function createBotaneroReviewedMenuRows() {
  const dinnerUrl = "https://botarockville.com/wp-content/uploads/2025/06/Botanero-Menu-May-2025.pdf";
  const brunchUrl = "https://botarockville.com/wp-content/uploads/2025/08/Botanero-Menu-Brunch-August-2025.pdf";
  const evidenceText =
    "Codex-reviewed official Botanero menu PDFs. The source lists item names, descriptions, and prices; no official item-level allergen matrix was found, so allergen concerns remain Ingredient Intelligence only.";
  const rows = [
    ["Flaming Shrimp", "Seafood", "Sautéed shrimp, sliced garlic, chili flakes, olive oil, crusty bread.", dinnerUrl],
    ["Maryland Crab Cake", "Seafood", "Seared Maryland crab cake, corn salad, remoulade sauce.", dinnerUrl],
    ["Atlantic Fried", "Seafood", "Deep-fried rockfish, calamari, shrimp, red onion relish, tartar sauce.", dinnerUrl],
    ["Ceviche", "Seafood", "Fresh red snapper cured in fresh citrus juices, spiced with ahi and red fresno pepper.", dinnerUrl],
    ["Paella Del Mar", "Seafood", "Mini paella with seared fish of the day, shrimp, calamari, mussels, saffron, white wine, Spanish sofrito, bomba rice.", dinnerUrl],
    ["Garlic Mussels", "Seafood", "Steamed Prince Edward Island mussels, parmesan garlic cream sauce, parsley.", dinnerUrl],
    ["Grilled Octopus", "Seafood", "Grilled sliced octopus, romesco sauce.", dinnerUrl],
    ["Fried Calamari", "Seafood", "Deep fried squid, sriracha aioli.", dinnerUrl],
    ["Shrimp Tempura", "Seafood", "Deep fried beer-battered shrimp skewers, pineapple dipping sauce.", dinnerUrl],
    ["Barramundi Almondine", "Seafood", "Grilled barramundi, toasted almond, lemon-herb butter, sautéed kale, garlic.", dinnerUrl],
    ["Seared Scallops", "Seafood", "Seared scallops, farro and squash risotto, pistachio jam, tempranillo glaze.", dinnerUrl],
    ["Grilled Salmon", "Seafood", "Grilled salmon with quinoa and lemon butter sauce.", dinnerUrl],
    ["Prosciutto & Burrata Flatbread", "Flatbreads & Dips", "Sliced cured prosciutto, creamy burrata, arugula, balsamic glaze.", dinnerUrl],
    ["Mushroom & Bacon Flatbread", "Flatbreads & Dips", "Roasted mushrooms, garlic herb olive oil, bacon, mozzarella, provolone, arugula, balsamic truffle vinaigrette.", dinnerUrl],
    ["Squash & Artichoke Flatbread", "Flatbreads & Dips", "Butternut squash purée, feta cheese, charcoaled-red onions, sun-dried tomatoes, artichoke, sage aioli, Pedro Ximénez glaze.", dinnerUrl],
    ["Short Rib Flatbread", "Flatbreads & Dips", "Pulled beef short ribs, brie cheese, caramelized Vidalia onions, horseradish aioli, fried shallot, piquillo aioli.", dinnerUrl],
    ["BBQ Chicken Flatbread", "Flatbreads & Dips", "Diced barbecue chicken, mozzarella cheese, red onions, olive, green onion, pepperoncini, jalapeño aioli.", dinnerUrl],
    ["Grilled Shrimp Flatbread", "Flatbreads & Dips", "Grilled shrimp, artichoke, pepperoncini peppers, green olives, feta, garlic aioli.", dinnerUrl],
    ["Hummus Spread", "Flatbreads & Dips", "House garlic hummus, olive oil, roasted carrot, pickled red cabbage, paprika, pita.", dinnerUrl],
    ["Maryland Crab Dip", "Flatbreads & Dips", "Baked creamy Maryland crab dip, served with grilled pita.", dinnerUrl],
    ["Deviled Eggs", "Salads & Vegetables", "Slightly spicy jalapeño deviled eggs, bacon, pickled vegetables, piquillo pepper aioli.", dinnerUrl],
    ["Fried Mozzarella", "Salads & Vegetables", "Deep-fried mozzarella, tomato and garlic compote, pesto aioli.", dinnerUrl],
    ["Mediterranean Chopped Salad", "Salads & Vegetables", "Diced cucumber, cherry tomato, diced red onion, chickpeas, cilantro, feta, sumac Greek yogurt dressing.", dinnerUrl],
    ["Manchego Caesar Salad", "Salads & Vegetables", "Romaine lettuce, croutons, house Caesar dressing, shredded Manchego.", dinnerUrl],
    ["Beet Salad", "Salads & Vegetables", "Roasted beets, pickled onion, arugula, goat cheese, toasted hazelnuts, hazelnut vinaigrette.", dinnerUrl],
    ["Crispy Kale Salad", "Salads & Vegetables", "Kale, shaved carrot, artichoke, feta, sweety drop peppers, crispy shallot, coriander vinaigrette.", dinnerUrl],
    ["Pee Wee Potatoes", "Salads & Vegetables", "Fried baby potatoes, caramelized onion, spicy yellow pepper aioli.", dinnerUrl],
    ["Brussels Sprouts", "Salads & Vegetables", "Fried brussels sprouts, bacon, smoked paprika aioli.", dinnerUrl],
    ["Spinach Empanadas", "Salads & Vegetables", "Fried pastry shell stuffed with spinach and feta cheese, piquillo pepper aioli.", dinnerUrl],
    ["Truffle Mac and Cheese", "Salads & Vegetables", "White cheddar sauce, shell pasta, wild mushrooms, truffle oil, parmesan.", dinnerUrl],
    ["Mushroom Croquettes", "Salads & Vegetables", "Cremini and oyster mushroom béchamel, breaded and fried, piquillo aioli.", dinnerUrl],
    ["Gnocchi with Cream Sauce", "Salads & Vegetables", "Potato gnocchi, roasted carrot, asparagus, garlic cream sauce, manchego.", dinnerUrl],
    ["Grilled Chicken Skewers", "Poultry", "Marinated chicken skewers with garlic and spices, sriracha aioli.", dinnerUrl],
    ["Thai Chicken Egg Rolls", "Poultry", "Pulled chicken, red curry béchamel, green onion, water chestnuts, cilantro aioli.", dinnerUrl],
    ["Duck Confit", "Poultry", "Oven-roasted duck leg, smoked paprika and tomato sauce, black olives, herbed potato purée.", dinnerUrl],
    ["Chicken Croquettes", "Poultry", "Deep fried croquettes, pulled chicken, béchamel, roasted garlic aioli.", dinnerUrl],
    ["Bourbon Chicken Wings", "Poultry", "Fried chicken wings tossed in a sweet and spicy bourbon glaze.", dinnerUrl],
    ["Fettuccini A La Carbonara", "Meats", "Egg fettuccine, bacon and creamy egg sauce, parmesan cheese and parsley.", dinnerUrl],
    ["Bacon-Wrapped Dates", "Meats", "Dates stuffed with goat cheese, bacon, orange marmalade.", dinnerUrl],
    ["Grilled Lamb Chops", "Meats", "Chickpea purée, peppercorn sauce, sun-dried tomato and goat cheese brulée.", dinnerUrl],
    ["Pan-Fried Pork Tenderloin", "Meats", "Breaded and herb-seasoned pan-fried pork tenderloin, pickled onions and asparagus, lemon butter sauce.", dinnerUrl],
    ["Beef Empanadas", "Meats", "Fried stuffed pastry shells, red wine simmered ground beef, mozzarella, citrus aioli.", dinnerUrl],
    ["Beef Short Ribs", "Meats", "Red wine braised short ribs au jus, grits, broccolini.", dinnerUrl],
    ["Lamb Skewers", "Meats", "Herb-seasoned ground lamb skewers, cabbage, cucumber sauce.", dinnerUrl],
    ["Kefta Briouat", "Meats", "Deep-fried Moroccan pastry shells filled with seasoned ground beef and egg.", dinnerUrl],
    ["Asian Pork Buns", "Meats", "Shredded pork belly, hoisin sauce, steamed buns.", dinnerUrl],
    ["Grilled Skirt Steak", "Meats", "Grilled fajita-seasoned skirt steak, grilled seasonal vegetables, cilantro chimichurri.", dinnerUrl],
    ["Charcuterie and Cheese", "Charcuterie", "Choice of cheese and charcuterie selections including manchego, goat cheese nougat, cow's cheese, cheddar, drunken goat, prosciutto, chorizo, and jamón serrano.", dinnerUrl],
    ["Prosciutto Eggs Benedict", "Weekend Brunch", "Prosciutto, poached eggs, arugula, toasted English muffin, hollandaise sauce, home fried potatoes.", brunchUrl],
    ["Smoked Salmon Eggs Benedict", "Weekend Brunch", "Smoked salmon, poached eggs, arugula, red onion, English muffin, hollandaise sauce, home fried potatoes.", brunchUrl],
    ["Crab Cake Eggs Benedict", "Weekend Brunch", "Maryland crab cake, poached eggs, arugula, red onion, English muffin, hollandaise, home fried potatoes.", brunchUrl],
    ["Eggs Florentine", "Weekend Brunch", "Sautéed spinach, piquillo pepper, poached eggs, English muffin, hollandaise, home fried potatoes.", brunchUrl],
    ["Ham and Bacon Omelet", "Weekend Brunch", "Virginia ham, bacon, arugula, red pepper, caramelized onion, white cheddar, home fried potatoes.", brunchUrl],
    ["Braised Beef Omelet", "Weekend Brunch", "Shishito pepper, red pepper, cremini mushroom, caramelized onion, white cheddar, home fried potatoes.", brunchUrl],
    ["Garden Omelet", "Weekend Brunch", "Mushrooms, arugula, red pepper, caramelized onion, white cheddar, home fried potatoes.", brunchUrl],
    ["French Vanilla Waffle", "Weekend Brunch", "House prepared waffle, whipped cream, maple syrup, berries.", brunchUrl],
    ["Shrimp and Grits", "Weekend Brunch", "Seared shrimp, Spanish chorizo, white wine, tomato compote, manchego grits, poached egg, herbs.", brunchUrl],
    ["Steak and Eggs", "Weekend Brunch", "Grilled flank steak, red wine reduction, two sunny side up eggs, home fried potatoes.", brunchUrl],
    ["Chicken and Waffle", "Weekend Brunch", "Deep fried chicken thigh, house waffle, sweet Fresno pepper butter, rosemary maple syrup.", brunchUrl],
    ["Botanero Burger", "Weekend Brunch", "Angus beef, grilled bell pepper, iceberg lettuce, grilled onion, white cheddar, roasted mushroom, tomato jam, Dijon mustard aioli, fried egg, brioche bun.", brunchUrl],
    ["Crab Cake Sandwich", "Weekend Brunch", "Maryland crab, arugula, red onion, sriracha aioli, brioche bun.", brunchUrl],
    ["Smoked Salmon Bagel", "Weekend Brunch", "Toasted bagel, chive cream cheese, arugula, red onion, sweety drop peppers, capers, home fried potatoes.", brunchUrl],
    ["Bacon and Egg Bagel", "Weekend Brunch", "Scrambled eggs, applewood bacon, white cheddar, home fries.", brunchUrl],
    ["Ham and Cheese Empanadas", "Brunch Sides", "Pastry shells stuffed with ham and white cheddar cheese, parsley aioli.", brunchUrl],
    ["Home Fried Potatoes", "Brunch Sides", "Herb-seasoned sautéed baby potatoes, onions, red pepper, yellow pepper aioli.", brunchUrl],
    ["Spinach and Bacon Quiche", "Brunch Sides", "Sautéed spinach, applewood bacon, white cheddar, farm eggs, pastry puff.", brunchUrl],
    ["House Biscuits", "Brunch Sides", "Freshly baked biscuits, whipped butter, local jam.", brunchUrl],
    ["Manchego Grits", "Brunch Sides", "Herbs, manchego cheese, creamy grits.", brunchUrl],
    ["Freshly Sliced Fruit", "Brunch Sides", "Melon, pineapple, berries.", brunchUrl],
    ["Cheddar Mac and Cheese", "Brunch Sides", "Pasta shells, white cheddar cream sauce.", brunchUrl],
    ["Applewood Bacon", "Brunch Sides", "Four slices of applewood bacon.", brunchUrl],
  ];

  return rows.map(([name, category, description, url]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description,
      allergens: [],
      allergenSourceType: "unavailable",
      evidence: [
        {
          source: "official-botanero-menu-pdf",
          text: evidenceText,
          url,
        },
      ],
      mayContain: [],
      sourceKind: "official-menu-pdf-reviewed",
      sourceSummary: "Official Botanero menu PDF reviewed into structured item rows.",
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [url],
    }),
  );
}

function createToastiqueOfficialGuideRows() {
  const guide = JSON.parse(
    fsSync.readFileSync("data/official-guides/toastique-allergen-guide-2026.json", "utf8"),
  );

  return guide.rows.map((row) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${row.category}-${row.name}`),
      name: row.name,
      category: row.category,
      description: row.description || undefined,
      allergens: row.allergens ?? [],
      allergenSourceType: "official-allergen-guide",
      evidence: [
        {
          source: guide.id,
          sourceKind: guide.sourceType,
          sourceUrl: guide.sourceUrl,
          text: `Official Toastique Allergen & Dietary Guide row: ${row.name}; Contains: ${row.containsText}.`,
        },
      ],
      mayContain: [],
      sourceKind: guide.sourceType,
      sourceSummary:
        row.containsText === "No listed allergens"
          ? "Official Toastique Allergen & Dietary Guide row: no listed allergens in the displayed guide table."
          : `Official Toastique Allergen & Dietary Guide row: contains ${row.containsText}.`,
      sourceType: "html-allergen-matrix",
      sourceUrls: [guide.sourceUrl],
    }),
  );
}

function createBartacoEveryBiteOfficialRows() {
  const guide = JSON.parse(
    fsSync.readFileSync("data/official-guides/bartaco-everybite-widget-2026.json", "utf8"),
  );
  const rows = extractEveryBiteWidgetRows(guide, {
    sourceUrl: guide.sourceUrl,
    widgetUrl: guide.widgetUrl,
  });

  return rows.map((row) => {
    const ingredientsText = row.ingredients.length ? row.ingredients.join(", ") : undefined;
    const containsText = row.everyBiteAllergens
      .filter((allergen) => /^contains$/i.test(allergen.type))
      .map((allergen) => allergen.name)
      .join(", ");
    const mayContainText = row.everyBiteAllergens
      .filter((allergen) => !/^contains$/i.test(allergen.type))
      .map((allergen) => `${allergen.type} ${allergen.name}`.trim())
      .join(", ");

    return sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${row.category}-${row.name}`),
      name: row.name,
      category: row.category,
      description: row.description,
      ingredientsText,
      knownIngredients: row.ingredients,
      allergens: row.allergens,
      mayContain: row.mayContain,
      allergenSourceType: "official-allergen-widget",
      evidence: [
        {
          source: "bartaco-everybite-widget-2026",
          sourceKind: "everybite-widget-graphql",
          sourceUrl: row.widgetUrl,
          text:
            containsText || mayContainText
              ? `Official EveryBite widget row: ${row.name}; Contains: ${containsText || "none"}${
                  mayContainText ? `; ${mayContainText}` : ""
                }.`
              : `Official EveryBite widget row: ${row.name}; no listed allergens in the item record.`,
        },
      ],
      sourceKind: "everybite-widget-graphql",
      sourceSummary:
        containsText || mayContainText
          ? `Official Bartaco EveryBite widget row: contains ${containsText || "no direct listed allergens"}${
              mayContainText ? `; ${mayContainText}` : ""
            }.`
          : "Official Bartaco EveryBite widget row: no listed allergens in the item record.",
      sourceType: "official-allergen-widget",
      sourceUrls: [guide.sourceUrl, guide.widgetUrl],
    });
  });
}

function createStJamesOfficialDinnerRows() {
  const sourceUrl = "https://stjames-dc.com/dinner/";
  const globalMayContain = ["egg", "fish", "gluten", "milk", "peanut", "shellfish", "soy", "tree-nut", "wheat"];
  const rows = [
    ["Appetizers", "Callaloo soup", "Pureed greens, chilies, coconut milk, topped with lump crab meat", ["shellfish", "tree-nut"]],
    ["Appetizers", "Aloo and Channa Pies [v]", "Fried bread stuffed with cumin-spiced potatoes, channa, culantro and pepper sauce", ["gluten", "wheat"]],
    ["Appetizers", "Crab Accras", "Crab fritters with culantro and garlic aioli", ["egg", "shellfish"]],
    ["Appetizers", "Jerk Wings", "12-hour marinated, pimento-smoked", []],
    ["Appetizers", "Pork Pow", "Trini-style Chinese steamed buns, stuffed with ground pork", ["gluten", "wheat"]],
    ["Appetizers", "Cassava Fritters", "Deep fried mashed cassava and parmesan cheese, served with garlic aioli", ["egg", "milk"]],
    ["Appetizers", "Maitake Masala [v]", "Maitake mushroom with masala sauce and cauliflower couscous", []],
    ["Appetizers", "Not Your Mother’s Crab & Dumplings", "Super lump crab, cassava dumplings, coconut curry sauce, scotch bonnet pearls", ["gluten", "shellfish", "tree-nut", "wheat"]],
    ["Appetizers", "Garlic Pork", "Pork ribs, roasted garlic aioli, chili sauce, smoked pineapple", ["egg"]],
    ["Appetizers", "Trini Citrus Salad", "Orange, frisee, mint, dill, sorrel leaves, pineapple, avocado, coconut, cauliflower, smoked salt, habanero pearls and sambal vinaigrette", ["tree-nut"]],
    ["Appetizers", "Oxtails", "Marinated and braised oxtails, pigeon peas, served with coconut rice", ["tree-nut"]],
    ["Appetizers", "Trini-Chinese Cornish Hen", "Deep-fried and glazed in a soy-pineapple chili sauce, served with charred cabbage soubise, sweet potatoes and coconut rice", ["soy", "tree-nut"]],
    ["Appetizers", "Bake & Fish Sandwich", "Fried bread, stuffed with fried fish, smoked pineapple, slaw and habanero chilies", ["fish", "gluten", "wheat"]],
    ["Medium Plates", "Pepper Shrimp", "Jumbo shrimp, scotch bonnet and pimento chili sauce, with black rice", ["shellfish"]],
    ["Large Plates", "St James Beef Rib - Serves 2", "8-hour marinated and smoked Dino rib, milk bread", ["gluten", "milk", "wheat"]],
    ["Large Plates", "Paratha Roti Platter", "Assortment of goat, beef, vegetable curries and pumpkin choka; vegan option available", ["gluten", "wheat"]],
    ["Large Plates", "Seafood Black Rice", "Short grain rice, djon djon mushroom stock, mussels, crab and shrimp", ["shellfish"]],
    ["Large Plates", "Brisket Platter", "Smoked brisket, with macaroni pie and greens", ["gluten", "milk", "wheat"]],
    ["Large Plates", "Fried Snapper", "Whole fried snapper, roasted coconut chutney, pickled scotch bonnet and pimento chilies, basil, lime, with coconut rice", ["fish", "tree-nut"]],
    ["Large Plates", "Duck & Dhal", "24-hour-slow-cooked duck leg quarter, dhal puree, coconut, jasmine rice", ["tree-nut"]],
    ["Large Plates", "Dumplings with Braised Pork Shoulder", "Cassava dumplings, coconut reduction, spinach, cherry tomatoes, chilies, braised pork", ["gluten", "tree-nut", "wheat"]],
    ["Sides", "Coconut Rice [v]", "Jasmine rice, lime, coconut milk", ["tree-nut"]],
    ["Sides", "Sweet Plantains [v]", "Fried ripe plantains, ginger crumble, caramel glaze", []],
    ["Sides", "Greens [v]", "Collards, coconut milk", ["tree-nut"]],
    ["Sides", "Side Sampler [v]", "Trio of coconut rice, greens and plantains", ["tree-nut"]],
    ["Sides", "Macaroni Pie", "Pasta baked in cheese sauce", ["gluten", "milk", "wheat"]],
    ["Sides", "Black Rice", "Jasmine rice, djon djon mushroom and shrimp stock, coconut milk; rice contains shellfish", ["shellfish", "tree-nut"]],
    ["Desserts", "Rum Cake a La Mode", "Rum-glazed sponge cake, ice cream", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Molten Chocolate Cake", "Dark chocolate cake, ponche de creme anglaise", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Cassava Pone", "Cassava, pumpkin and coconut cake, caramel glaze", ["egg", "gluten", "tree-nut", "wheat"]],
    ["Desserts", "Mango Sorbet", "Mango sorbet", []],
    ["Desserts", "Passion Fruit-Sago Mousse", "Passion fruit, sago, coconut, sorrel couli", ["milk", "tree-nut"]],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
        id: slugifyReviewedRowId(`${category}-${name}`),
        name,
        category,
        description,
        ingredientsText: description,
        allergens,
        mayContain: globalMayContain.filter((allergen) => !allergens.includes(allergen)),
        allergenSourceType: "official-ingredients",
        evidence: [
          {
            source: "st-james-official-dinner-menu-review",
            sourceKind: "official-menu-ingredient-review",
            sourceUrl,
            text: `Reviewed St. James official dinner menu row: ${name} - ${description}`,
          },
          {
            source: "st-james-official-global-allergen-notice",
            sourceKind: "official-global-cross-contact-note",
            sourceUrl,
            text:
              "Official St. James dinner page states menu items may contain or come into contact with wheat, milk, eggs, peanuts, tree nuts, fish, shellfish and soy.",
          },
        ],
        sourceKind: "official-menu-review",
        sourceSummary:
          "St. James menu ingredient review: direct allergens come from the item text; additional official cross-contact concerns come from the restaurant-wide allergen notice.",
        sourceType: "reviewed-official-menu-repair",
        sourceUrls: [sourceUrl],
      }),
  );
}

function createElPresidenteOfficialMenuRows() {
  const sourceUrl = "https://elpresidentedc.com/";
  const sourceSummary =
    "El Presidente official menu ingredient review: direct allergens come from item names and official ingredient text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Guacamole", "Classic", "Lime, onion, tomato, cilantro, jalapeno chile.", []],
    ["Guacamole", "El Presidente", "Fresh jumbo lump crab, green chile, roasted tomatillo.", ["shellfish"]],
    ["Nachos & Salsa", "Nacho Macho", "Melted queso mixto, black beans, ranchera salsa, sour cream, pickled red onions, jalapeno.", ["milk"]],
    ["Nachos & Salsa", "Macho Nacho", "Nacho Macho with chorizo.", ["milk"]],
    ["Appetizers", "Tortilla Soup", "Chicken, avocado, queso mixto, crema, crispy tortilla.", ["gluten", "milk", "wheat"]],
    ["Appetizers", "Cucarachas", "Crispy shrimp, hot sauce.", ["shellfish"]],
    ["Appetizers", "Queso Fundido", "Sauteed mushrooms, roasted poblano, queso mixto, salsa huevona, flour tortillas.", ["gluten", "milk", "wheat"]],
    ["Appetizers", "Queso Fundido de Chorizo", "House-made chorizo, queso mixto, salsa verde, flour tortillas.", ["gluten", "milk", "wheat"]],
    ["Appetizers", "Tijuana Caesar Salad", "Little gem lettuce, classic caesar dressing, parmesan, croutons.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Appetizers", "Chopped Kale Salad", "Crispy garbanzo beans, tomato, cucumber, pickled onions, queso fresco, avocado-poblano dressing.", ["milk"]],
    ["Appetizers", "Aguachile Verde", "Shrimp, hamachi, crab, tomatillo, melon, jalapeno.", ["fish", "shellfish"]],
    ["Appetizers", "Coctel de Camaron", "Chilled seafood broth, jicama, avocado.", ["fish", "shellfish"]],
    ["Appetizers", "Tuna Ceviche", "Yellowfin tuna, coconut sauce, habanero, cucumber.", ["fish", "tree-nut"]],
    ["Appetizers", "Roasted Chicken Quesadilla", "Chipotle, pickled onions, queso chihuahua and oaxaca on corn tortilla.", ["milk"]],
    ["Tostadas & Tlayudas", "Oaxacan Tlayudas", "Crispy corn flatbread topped with refried black beans, oaxaca cheese, avocado, jalapeno, lettuce, and salsa roja.", ["milk"]],
    ["Tostadas & Tlayudas", "Verde Tostada", "Cucumbers, chipotle ponzu, charred avocado, herbs.", ["soy"]],
    ["Tostadas & Tlayudas", "Tlayuda de Camaron", "Chipotle white bean puree, shrimp in mojo de ajo, queso mixto, queso fresca, grape tomatoes, chimichurri.", ["milk", "shellfish"]],
    ["Tostadas & Tlayudas", "Baja Tuna Tostada", "Yellowfin tuna, chipotle aioli, avocado, salsa macha.", ["egg", "fish"]],
    ["Tacos", "Birria", "Braised short rib, queso monterrey, red chile consomme.", ["milk"]],
    ["Tacos", "Carnitas", "Confit pork, guacamole, spicy pickled onion.", []],
    ["Tacos", "Mahi Mahi", "Crispy mahi mahi, red cabbage, avocado, chipotle remoulade.", ["egg", "fish"]],
    ["Tacos", "Chicken", "Chihuahua cheese, avocado, tomatillo and tomato salsa, crema.", ["milk"]],
    ["Tacos", "Carne Asada", "Grilled skirt steak, corn tortillas, cherry tomato pico, salsa taquera.", []],
    ["Tacos", "Shrimp", "Chile de arbol butter, melted chihuahua cheese.", ["milk", "shellfish"]],
    ["Tacos", "Black Cod al Pastor", "Morita aioli, limey cabbage, grilled pineapple.", ["egg", "fish"]],
    ["Tacos", "Sonoran Filet", "Grilled beef filet, queso mixto, salsa verde, chimichurri, cherry tomato pico.", ["milk"]],
    ["Enchiladas", "Enchiladas Suizas", "Shredded chicken, green chile-tomatillo cream sauce, chihuahua cheese.", ["milk"]],
    ["Enchiladas", "Vegetable Enchilada", "Summer squash, corn, epazote, squash blossoms, chihuahua cheese, verde pipian sauce.", ["milk"]],
    ["Enchiladas", "Crab Enchiladas", "Lump crab, coconut, corn, guajillo chile sauce.", ["shellfish", "tree-nut"]],
    ["Entrees", "Baja Duck Confit", "\"Peking\" style crispy skinned duck confit, hoisin, fresh garnishes, and flour tortillas for making tacos.", ["gluten", "soy", "wheat"]],
    ["Tacos al Carbon", "Tacos al Carbon", "Build-your-own tacos served with grilled shishito peppers and spring onions, refried black beans, guacamole, salsas, crema, and corn tortillas.", ["milk"]],
    ["Tacos al Carbon", "Carne Asada", "", []],
    ["Tacos al Carbon", "Grilled Chicken", "", []],
    ["Tacos al Carbon", "Portabello Mushroom", "", []],
    ["Tacos al Carbon", "Lobster", "", ["shellfish"]],
    ["Sides", "Refried Black Beans", "Avocado leaf, queso fresco, crispy plantain.", ["milk"]],
    ["Sides", "Fried Plantains", "Queso fresco, crema.", ["milk"]],
    ["Sides", "Roasted Sweet Potato", "Goat cheese, pecans, salsa macha.", ["milk", "tree-nut"]],
    ["Sides", "Charred Broccoli", "Chipotle yogurt sauce, toasted almonds.", ["milk", "tree-nut"]],
    ["Sides", "Mexican Street Style Corn", "Corn on the cob, chipotle mayo, queso anejo, tajin.", ["egg", "milk"]],
    ["Poquito Dinero", "Tortilla Soup", "Chicken, avocado, crunchy tortillas, crema fresca, queso fresco.", ["gluten", "milk", "wheat"]],
    ["Poquito Dinero", "Tijuana Caesar Salad", "Little gem lettuce, classic caesar dressing, parmesan, croutons.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Poquito Dinero", "Chicken Taco", "Chihuahua cheese, avocado, tomatillo and tomato salsa, crema.", ["milk"]],
    ["Poquito Dinero", "Birria Taco", "Braised short rib, queso monterrey, red chile consomme.", ["milk"]],
    ["Poquito Dinero", "Vegetable Enchiladas", "Summer squash, corn, epazote, squash blossoms, chihuahua cheese, verde pipian sauce.", ["milk"]],
    ["Poquito Dinero", "Seasonal Ice Cream", "", ["milk"]],
    ["Especialidades", "El Presidente Burger", "Double patty, American cheese, chipotle remoulade, pickled jalapenos and onions.", ["egg", "milk"]],
    ["Especialidades", "Fried Chicken Torta", "Queso mixto, black bean spread, chipotle remoulade, pickled jalapeno, avocado, cabbage.", ["egg", "gluten", "milk", "wheat"]],
    ["Especialidades", "Carne Asada Mission Burrito", "Rice, black beans, queso mixto, guacamole, salsa roja, crema, pico de gallo, pickled jalapeno.", ["gluten", "milk", "wheat"]],
    ["Brunch Especialidades", "Churro Waffle", "Cinnamon-sugar, whipped cream, chocolate sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch Especialidades", "Breakfast Burrito", "Papas bravas, jalapeno cheese sauce, eggs, bacon, pico de gallo.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch Especialidades", "Yucatecan Style Huevos Rancheros", "Fried eggs, slab bacon, roasted tomato sauce, plantains, queso fresco, crispy tostadas.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch Especialidades", "French Toast", "Oven-fired torrejas, maple syrup, whipped cream, candied pecans.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Brunch Especialidades", "El Presidente Burger", "Double patty, American cheese, chipotle remoulade, pickled jalapenos and onions.", ["egg", "milk"]],
    ["Brunch Sides", "Bacon", "", []],
    ["Brunch Sides", "Papas Bravas", "Morita aioli, red onions.", ["egg"]],
    ["Desserts", "Tres Leches", "Strawberries, whipped cream.", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "El Presidente Sundae", "Mexican chocolate ice cream, marshmallow, wet pecans, peanut brittle, whipped cream.", ["milk", "peanut", "tree-nut"]],
    ["Desserts", "Churros", "Chocolate and raspberry sauces.", ["gluten", "wheat"]],
    ["Desserts", "Mexican Chocolate Pudding", "Spiced chocolate cookie, whipped cream, shaved Mexican chocolate.", ["gluten", "milk", "wheat"]],
    ["Snacks", "Salsa Macha-Honey Glazed Wings", "Dried chiles, peanut, toasted sesame, lime.", ["peanut", "sesame"]],
    ["Snacks", "Chicken Taquitos Divorciados", "Crispy rolled tacos, red and green salsa, lime crema.", ["gluten", "milk", "wheat"]],
    ["Snacks", "Esquite Fries", "Creamy esquite puree, morita aioli, grilled corn.", ["egg", "milk"]],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id:
        category === "Tacos al Carbon" && name === "Tacos al Carbon"
          ? "tacos-al-carbon"
          : slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "el-presidente-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed El Presidente official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createPastisOfficialMenuRows() {
  const sourceUrl = "https://pastisdc.com/";
  const sourceSummary =
    "Pastis DC official menu ingredient review: direct allergens come from item names and official menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Plat Du Jour", "Monday - Wiener Schnitzel", "", ["egg", "gluten", "wheat"]],
    ["Plat Du Jour", "Tuesday - Beef Stroganoff", "", ["gluten", "milk", "wheat"]],
    ["Plat Du Jour", "Wednesday - Fish & Chips", "", ["fish", "gluten", "wheat"]],
    ["Plat Du Jour", "Thursday - Chicken Cordon Bleu", "", ["gluten", "milk", "wheat"]],
    ["Plat Du Jour", "Friday - Bouillabaisse", "", ["fish", "shellfish"]],
    ["Plat Du Jour", "Saturday - Duck with Cherries", "", []],
    ["Plat Du Jour", "Sunday - Chicken Pot Pie", "", ["gluten", "milk", "wheat"]],
    ["Fruits De Mer", "6 Oysters", "Mignonette.", ["shellfish"]],
    ["Fruits De Mer", "Scallops Crudo", "Passionfruit, hazelnut.", ["shellfish", "tree-nut"]],
    ["Fruits De Mer", "Tuna Tartare", "Creme fraiche, dill.", ["fish", "milk"]],
    ["Fruits De Mer", "Shrimp Cocktail", "", ["shellfish"]],
    ["Fruits De Mer", "Mussels Escabeche", "", ["shellfish"]],
    ["Fruits De Mer", "Sardines en Conserve", "Lemon, Bordier butter.", ["fish", "milk"]],
    ["Fruits De Mer", "Plat De Fruits De Mer", "Oysters, clams, mussels, scallops, shrimp, jumbo crab.", ["shellfish"]],
    ["Hors D'oeuvres", "Cheese Plate", "A selection of three cheeses from the Cellar of Jasper Hill Farms.", ["milk"]],
    ["Hors D'oeuvres", "Melon & Prosciutto", "", []],
    ["Hors D'oeuvres", "Leeks Vinaigrette", "Almonds.", ["tree-nut"]],
    ["Hors D'oeuvres", "Burrata", "Heirloom tomato, pickled red onion.", ["milk"]],
    ["Hors D'oeuvres", "Gazpacho", "Local tomato, red onion, crouton.", ["gluten", "wheat"]],
    ["Hors D'oeuvres", "Onion Soup", "Gratinee.", ["gluten", "milk", "wheat"]],
    ["Hors D'oeuvres", "Brulee Goat Cheese", "Mache, black mission figs, candied walnuts.", ["milk", "tree-nut"]],
    ["Hors D'oeuvres", "Prosciutto & Melon", "", []],
    ["Hors D'oeuvres", "Steak Tartare", "", ["egg"]],
    ["Hors D'oeuvres", "Gratin au Macaroni", "Jambon.", ["gluten", "milk", "wheat"]],
    ["Hors D'oeuvres", "Crispy Calamari", "Lemon aioli.", ["egg", "gluten", "shellfish", "wheat"]],
    ["Hors D'oeuvres", "Escargots", "Garlic-parsley butter.", ["milk", "shellfish"]],
    ["Hors D'oeuvres", "Foie Gras Parfait", "", []],
    ["Hors D'oeuvres", "Squash Blossoms", "Stuffed with jumbo lump crab.", ["shellfish"]],
    ["Hors D'oeuvres", "Crispy Artichoke", "Garlic, aioli, lemon.", ["egg"]],
    ["Hors D'oeuvres", "Potato Pierogies", "", ["gluten", "milk", "wheat"]],
    ["Salades et Sandwiches", "Beet Salad", "Greens, fennel pollen, goat cheese, espelette hazelnuts.", ["milk", "tree-nut"]],
    ["Salades et Sandwiches", "Green Salad", "Red wine vinaigrette.", []],
    ["Salades et Sandwiches", "Caesar Salad", "", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Salades et Sandwiches", "Salade Nicoise", "Confit tuna, dijon vinaigrette.", ["fish"]],
    ["Salades et Sandwiches", "Grilled Chicken Sandwich", "Bacon, black pepper aioli.", ["egg", "gluten", "wheat"]],
    ["Salades et Sandwiches", "Croque Monsieur / Croque Madame", "", ["egg", "gluten", "milk", "wheat"]],
    ["Salades et Sandwiches", "Steak Sandwich", "Onions, gruyere, aioli.", ["egg", "gluten", "milk", "wheat"]],
    ["Salades et Sandwiches", "Joy Burger", "American cheese, pickles.", ["gluten", "milk", "wheat"]],
    ["Salades et Sandwiches", "Cheeseburger", "American cheese, pickles.", ["gluten", "milk", "wheat"]],
    ["Pastas", "Spaghetti Bolognese", "", ["gluten", "wheat"]],
    ["Pastas", "Spaghetti Limone", "Bottarga.", ["fish", "gluten", "wheat"]],
    ["Steak Frites", "Bar Steak", "Maitre d'hotel butter.", ["milk"]],
    ["Steak Frites", "New York Strip", "Sauce bearnaise.", ["egg", "milk"]],
    ["Steak Frites", "Filet", "Sauce au poivre.", []],
    ["Entrees", "Lamb Steak", "Green asparagus, preserved lemon.", []],
    ["Entrees", "Eggplant Milanese", "Cherry tomato fricassee.", ["egg", "gluten", "milk", "wheat"]],
    ["Entrees", "Salmon", "Morels, asparagus, beurre blanc.", ["fish", "milk"]],
    ["Entrees", "Gruyere Omelette", "Fines herbes.", ["egg", "milk"]],
    ["Entrees", "Crepe Complete", "Ham, comte, egg.", ["egg", "gluten", "milk", "wheat"]],
    ["Entrees", "Boeuf Bourguignon", "Lardons, pommes puree.", ["milk"]],
    ["Entrees", "Lobster Frites", "Garlic-herb butter.", ["milk", "shellfish"]],
    ["Entrees", "Branzino", "Crudites, aioli.", ["egg", "fish"]],
    ["Entrees", "Moules Frites", "Saffron, garlic.", ["shellfish"]],
    ["Entrees", "Chicken Paillard", "Almonds.", ["tree-nut"]],
    ["Entrees", "Scallops", "Gnocchi, summer squash.", ["gluten", "milk", "shellfish", "wheat"]],
    ["Entrees", "Half Roast Chicken", "Endive salad, jus de poulet.", []],
    ["Entrees", "Trout Amandine", "Almonds, haricots vert.", ["fish", "tree-nut"]],
    ["Entrees", "Duck Confit", "Potatoes.", []],
    ["Garnitures", "Sauteed Spinach", "", []],
    ["Garnitures", "Glazed Carrots", "", []],
    ["Garnitures", "Pommes Frites", "", []],
    ["Garnitures", "Pomme Puree", "", ["milk"]],
    ["Viennoiserie", "Croissant", "", ["egg", "gluten", "milk", "wheat"]],
    ["Viennoiserie", "Chocolate Croissant", "", ["egg", "gluten", "milk", "wheat"]],
    ["Viennoiserie", "Blueberry Muffin", "", ["egg", "gluten", "milk", "wheat"]],
    ["Viennoiserie", "Brioche Au Sucre", "", ["egg", "gluten", "milk", "wheat"]],
    ["Viennoiserie", "Pastry Basket", "", ["egg", "gluten", "milk", "wheat"]],
    ["Hors D'oeuvres", "Grapefruit", "", []],
    ["Hors D'oeuvres", "Greek Yogurt", "Granola, nuts, berries.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Hors D'oeuvres", "Steel Cut Oatmeal", "Berries.", []],
    ["Brunch", "Avocado Tartine", "Poached eggs.", ["egg", "gluten", "wheat"]],
    ["Brunch", "Quiche Lorraine", "Bacon, gruyere, onion.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "Ratatouille Omelette", "Egg whites, gruyere.", ["egg", "milk"]],
    ["Brunch", "Eggs Benedict", "Parisian ham, hollandaise.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "Eggs Norwegian", "Smoked salmon, hollandaise.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Brunch", "Eggs Any Style", "Choice of meat, pommes tapees.", ["egg"]],
    ["Brunch", "Croissant & Smoked Salmon Sandwich", "", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Brunch", "Croissant Double Egg, Bacon & American Cheese", "", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "Parisian Crepes", "Nutella.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Brunch", "Buttermilk Pancakes", "Maple syrup.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "French Toast", "Blueberry, chantilly creme.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "NY Strip & Sunny Side Up", "", ["egg"]],
    ["Garnitures", "Bacon", "", []],
    ["Garnitures", "Pork Sausage", "", []],
    ["Garnitures", "Turkey Sausage", "", []],
    ["Garnitures", "Pomme Tapees", "", []],
    ["Dessert", "Vanilla Rice Pudding", "", ["milk"]],
    ["Dessert", "Dark Chocolate Mousse", "", ["egg", "milk"]],
    ["Dessert", "Vanilla Bean Creme Brulee", "", ["egg", "milk"]],
    ["Dessert", "Sticky Toffee Pudding", "Dark rum, vanilla ice cream.", ["egg", "gluten", "milk", "wheat"]],
    ["Dessert", "Profiteroles", "Vanilla ice cream, bittersweet chocolate.", ["egg", "gluten", "milk", "wheat"]],
    ["Dessert", "Artisanal Sorbet & Ice Cream", "", ["milk"]],
    ["Dessert", "Vietnamese Coffee Milkshake", "", ["milk"]],
    ["Dessert", "Vanilla Bean Milkshake", "", ["milk"]],
    ["Dessert", "Strawberry Milkshake", "", ["milk"]],
    ["Happy Hour", "Chunu Oysters", "", ["shellfish"]],
    ["Happy Hour", "Le Petit Plateau", "Salmon tartare, oysters, shrimp.", ["fish", "shellfish"]],
    ["Happy Hour", "Le Grand Aioli", "Crudites, gaufrettes, creme fraiche, dill.", ["egg", "gluten", "milk", "wheat"]],
    ["Happy Hour", "Jambon Beurre Baguette", "", ["gluten", "milk", "wheat"]],
    ["Happy Hour", "Rosemary, Truffle, Gruyere Gougeres", "", ["egg", "gluten", "milk", "wheat"]],
  ];

  const seen = new Set();

  return rows
    .filter(([category, name]) => {
      const key = `${category}::${name}`.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map(([category, name, description, allergens]) =>
      sanitizeMenuItemDisplayFields({
        id: slugifyReviewedRowId(`${category}-${name}`),
        name,
        category,
        description: description || undefined,
        ingredientsText: description || undefined,
        allergens,
        mayContain: [],
        allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
        evidence: [
          {
            source: "pastis-dc-official-menu-review",
            sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
            sourceUrl,
            text: `Reviewed Pastis DC official menu row: ${name}${description ? ` - ${description}` : ""}`,
          },
        ],
        sourceKind: "official-menu-review",
        sourceSummary,
        sourceType: "reviewed-official-menu-repair",
        sourceUrls: [sourceUrl],
      }),
  );
}

function createAllPurposeShawOfficialMenuRows() {
  const sourceUrl = "https://allpurposedc.com/locations/best-pizza-in-washington-dc-shaw/dinner-menu/";
  const sourceSummary =
    "All-Purpose Shaw official menu ingredient review: direct allergens come from item names and official menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Antipasti", "AP Caesar Salad", "Little gem lettuces, parm, breadcrumbs, anchovy dressing.", ["fish", "gluten", "milk", "wheat"]],
    ["Antipasti", "Calamari 'Fritto'", "Polenta-crusted Rhode Island squid, lemon, dill, lemon-basil aioli.", ["egg", "shellfish"]],
    ["Antipasti", "House-Made Giardiniera", "Pickled cauliflower, carrots, celery, chili flake, basil.", []],
    ["Brunch Specialties", "Arancini 'Donatello'", "Crispy risotto fritters, spring peas, salami, roasted garlic, parmigiano, green garlic aioli.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch Specialties", "Baked Eggs 'Funghi'", "Italian farm egg souffle, wild mushroom, mozzarella, cipollini onions, black truffle sauce, house-made focaccia.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch Specialties", "Breakfast Sandwich", "Farm egg omelette, heirloom tomato, Italian sausage, mozz, garlic aioli, sesame seed bun; choice of farm greens salad, Caesar salad, or fries.", ["egg", "fish", "gluten", "milk", "sesame", "wheat"]],
    ["Brunch Specialties", "Brunch Caesar", "Little gem lettuces, parmesan, toasted breadcrumbs, lemon, anchovy dressing.", ["fish", "gluten", "milk", "wheat"]],
    ["Brunch Specialties", "Crispy-Fried Mozzarella", "Panko-breaded NY mozzarella, pecorino Romano, marinara sauce.", ["gluten", "milk", "wheat"]],
    ["Brunch Specialties", "Focaccia Breadsticks", "Focaccia breadsticks with roasted garlic butter, truffle fonduta.", ["gluten", "milk", "wheat"]],
    ["Brunch Specialties", "House Chopped Salad", "Iceberg, radicchio, fresh mozz, pickled peppers, salami, green olives, onion, pecorino, Italian vinaigrette.", ["milk"]],
    ["Brunch Specialties", "Italian Hash Browns", "Roasted potato, sour cream, black pepper, choice of prosciutto or smoked salmon.", ["fish", "milk"]],
    ["Brunch Specialties", "Roasted Garlic Knots", "Pugliese dough, lemon-herb butter, parmigiano.", ["gluten", "milk", "wheat"]],
    ["Brunch Specialties", "Tuscan Olive Oil Cake", "Citrus zest, marinated strawberries, sweet ricotta.", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Baked Cookie", "Baked-to-order, whipped Nutella, hazelnuts, sweet cream.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Desserts", "Rainbow Cake", "Almond cake, Chantilly cream, chocolate sauce.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Dippies", "Calabrian Chili Dippie", "Calabrian chili honey.", []],
    ["Dippies", "Feta Ranch Dippie", "House-made feta ranch.", ["egg", "milk"]],
    ["Dippies", "Marinara Dippie", "House-made old-school Jersey red sauce.", []],
    ["Dippies", "Neonata Dippie", "Sicilian hot sauce dippie.", ["fish"]],
    ["Dippies", "Parm Fonduta Dippie", "Creamy cheese dippie.", ["milk"]],
    ["Dippies", "Volcano Ranch Dippie", "Feta ranch dippie topped with Calabrian chilies.", ["egg", "milk"]],
    ["Happy Hour Food", "Giardiniera", "Pickled cauliflower, red peppers, celery, carrots, chili flakes, basil.", []],
    ["Italian Specialties", "Chicken Parmesan", "Sesame-breaded cutlet, marinara sauce, mozzarella, fresh basil.", ["gluten", "milk", "sesame", "wheat"]],
    ["Italian Specialties", "Eggplant Parm", "Baked eggplant, mozzarella, basil, tomato, garlic olive-oil breadcrumbs.", ["gluten", "milk", "wheat"]],
    ["Italian Specialties", "Nonna's Meatballs", "Tomato-braised, hand-dipped ricotta, grilled focaccia, fresh parsley.", ["gluten", "milk", "wheat"]],
    ["Italian Specialties", "Rigatoni Pomodoro", "House-made tomato sauce, cherry tomatoes, straciatella, basil, extra virgin olive oil.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Buona", "Tomato, mozz, pepperoni, Calabrian chili honey, basil.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Dough Ball", "Fresh pizza dough.", ["gluten", "wheat"]],
    ["Pizza", "Duke #7", "Tomato, mozz, 'nduja sausage, red peppers, giardiniera.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Funghi", "Whipped ricotta, mozzarella, portabella and cremini mushrooms, onion, rosemary, black truffle sauce, fresh parsley.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Godfather", "Tomato, mozz, Italian sausage, spicy chilies, pickled peppers, red onion, pecorino.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Primavera", "Whipped ricotta, mozzarella, asparagus, spring peas, preserved lemon, pea shoots.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Rubirosa", "Tomato fonduta, mozzarella, fontina, cup 'n char pepperoni, parm, basil swirl.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Sedgewick", "Whipped ricotta, mozz, taleggio, parm, truffle honey, chives.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Standard", "Tomato, mozzarella, Siciliana oregano, grana Padano.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Standard Pizza", "Tomato, mozzarella, Siciliana oregano, grana Padano.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Supremo", "Tomato, mozz, Italian sausage, sweet onion, olives, green peppers, pecorino Romano.", ["gluten", "milk", "wheat"]],
    ["Pizza", "The Marinara", "Bianco di Napoli tomatoes, fresh garlic, pecorino Romano, Sicilian oregano, olive oil; this pizza does not come with mozzarella cheese.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Tripper", "Tomato, beef meatballs, ricotta, Sicilian hot sauce, fresh oregano; cannot be made gluten or dairy free; meatballs contain gluten and dairy.", ["gluten", "milk", "wheat"]],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "all-purpose-shaw-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed All-Purpose Shaw official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createBlueDuckTavernOfficialMenuRows() {
  const sourceUrl = "https://www.blueducktavern.com/menu/";
  const sourceSummary =
    "Blue Duck Tavern official menu ingredient review: direct allergens come from item names and official menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Cereals", "10 Grain Porridge", "Wheat, barley, millet, rolled oats, rye, brown rice, flax seed, soy, grits, banana brulee, pumpkin and sunflower seed streusel.", ["gluten", "soy", "wheat"]],
    ["Cereals", "Assorted Cereals", "With bananas or fresh berries.", ["gluten", "wheat"]],
    ["Cereals", "House Made Bircher Muesli", "Oats, fruits.", []],
    ["Cereals", "Irish Steel-Cut Oatmeal", "Raisins, brown sugar.", []],
    ["Lighter Seasonal Fare", "Almond Granola Parfait", "House-made compote, chia yogurt, fresh berries.", ["milk", "tree-nut"]],
    ["Lighter Seasonal Fare", "Avocado Toast", "Cherry tomato, arugula, Aleppo vinaigrette seeds, multigrain, soft-poached egg.", ["egg", "gluten", "wheat"]],
    ["Lighter Seasonal Fare", "Bowl of Mixed Berries", "", []],
    ["Lighter Seasonal Fare", "Fruit Plate", "", []],
    ["Lighter Seasonal Fare", "Low-Fat Greek Yogurt with Fresh Berries", "", ["milk"]],
    ["Lighter Seasonal Fare", "Smoked Salmon", "Cucumber, shallots, capers, tomato, herb cream cheese, toasted bagel.", ["fish", "gluten", "milk", "wheat"]],
    ["Pastries and Breads", "Bagel", "Plain, sesame, everything with cream cheese.", ["gluten", "milk", "sesame", "wheat"]],
    ["Pastries and Breads", "House Made Gluten-Free Coffee Cakes", "Contains almonds.", ["tree-nut"]],
    ["Pastries and Breads", "Pastry Basket", "House-made croissant, pain au chocolat, and muffin.", ["egg", "gluten", "milk", "wheat"]],
    ["Eggs and Specialties", "2 Eggs Any Style", "", ["egg"]],
    ["Eggs and Specialties", "BDT Benedict", "Soft-poached eggs, house-cured Canadian bacon, dijonnaise mustard green, pretzel bun.", ["egg", "gluten", "wheat"]],
    ["Eggs and Specialties", "BDT Omelet", "Roasted market mushrooms, spinach, goat cheese, and your choice of toast.", ["egg", "gluten", "milk", "wheat"]],
    ["Eggs and Specialties", "Duck Confit Hash", "Roasted pepper, onion, sweet potato, soft-poached egg, duck cracklins, and house biscuit.", ["egg", "gluten", "milk", "wheat"]],
    ["Batters", "Strawberry Pancakes", "Rhubarb compote, citrus cream, pistachio crumble.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Batters", "Tonka Bean French Toast", "Brioche, tonka bean creme, gooseberries, blackberries.", ["egg", "gluten", "milk", "wheat"]],
    ["Starter", "Cured Fluke", "Verjus, candied kumquats, mustard seed, trout roe.", ["fish"]],
    ["Starter", "Harvest Field Greens", "Field greens, strawberries, radish, pickled Vidalia, seeds, honey-balsamic vinaigrette.", []],
    ["Starter", "Market Soup", "Market availability.", []],
    ["Starter", "Soft-Poached Duck Egg", "Surryano ham, field pea salad, crimson shallot, mustard vinaigrette.", ["egg"]],
    ["Grain & Vegetable", "Asparagus", "Preserved lemon, sabayon, chili, Parmesan.", ["egg", "milk"]],
    ["Grain & Vegetable", "Carolina Gold Rice Porridge", "Nettles, peas, mushrooms.", []],
    ["Grain & Vegetable", "Collard Greens", "Bacon, lager, cider vinegar.", []],
    ["Grain & Vegetable", "Potato Puree", "Confit garlic.", ["milk"]],
    ["Grain & Vegetable", "Potato Salad", "Tiny taters, pickles, celery smoked roe, dill celery creme.", ["egg", "fish", "milk"]],
    ["Grain & Vegetable", "White Corn Grits", "Red onion marmalade and Appalachian cheese.", ["milk"]],
    ["Grain & Vegetable", "Wilted Spinach", "Garlic, olive oil.", []],
    ["Meat, Poultry & Fish", "BDT Reuben", "Rye bread, pastrami, sauerkraut, Swiss cheese, Thousand Island dressing.", ["egg", "gluten", "milk", "wheat"]],
    ["Meat, Poultry & Fish", "BDT Whole Duck", "Dry aged, perfectly roasted.", []],
    ["Meat, Poultry & Fish", "Dry-Aged Beef Tenderloin", "House made Worcestershire, wild mushrooms.", ["fish"]],
    ["Meat, Poultry & Fish", "Duck, Smoked & Roasted Breast", "Confit leg, fruit mostarda, duck bone reduction.", []],
    ["Meat, Poultry & Fish", "Fried Catfish", "Seeded bun, ginger slaw, preserved lemon aioli, pee wee potatoes.", ["egg", "fish", "gluten", "sesame", "wheat"]],
    ["Meat, Poultry & Fish", "Pasture-Raised Half Chicken", "Sweet tea jus.", []],
    ["Meat, Poultry & Fish", "Prime Bavette Steak", "Horseradish bearnaise, BDT fries, petit salad.", ["egg", "milk"]],
    ["Meat, Poultry & Fish", "Scallops", "Burnt vanilla and parsnip, andouille marmalade, compressed apple.", ["shellfish"]],
    ["Meat, Poultry & Fish", "Trout", "Lemon preserve, cornbread, hazelnut.", ["fish", "gluten", "tree-nut", "wheat"]],
    ["Meat, Poultry & Fish", "Wood-Fired Whole Fish", "Seafood mousseline, lemongrass caviar cream.", ["egg", "fish", "milk", "shellfish"]],
    ["Meat, Poultry & Fish", "Wood-Oven Roasted Chicken", "Airline breast, Parisian gnocchi mushrooms, chicken veloute.", ["gluten", "milk", "wheat"]],
    ["Salad Additions", "Confit Duck Leg", "", []],
    ["Salad Additions", "Pan-Seared Market Fish", "Market availability.", ["fish"]],
    ["Salad Additions", "Prime Side Steak", "", []],
    ["Salad Additions", "Roasted Chicken Breast", "", []],
    ["Lounge Food", "BDT Cheeseburger", "Redmond cheddar, red onion, lettuce, bread and butter pickles, secret sauce, and brioche bun.", ["egg", "gluten", "milk", "wheat"]],
    ["Lounge Food", "Brunch Steak and Eggs", "Prime hanger steak, horseradish bearnaise, BDT fries, petit salad.", ["egg", "milk"]],
    ["Lounge Food", "Caviar Service", "Classic accompaniments, johnny cakes.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Lounge Food", "Charcuterie Board", "Pickled vegetables, house mustard, country bread; with local cheeses.", ["gluten", "milk", "wheat"]],
    ["Lounge Food", "Charred Gem Salad", "Herb anchovy dressing, pistachio lemon aioli, Parmesan, garlic crumb.", ["egg", "fish", "gluten", "milk", "tree-nut", "wheat"]],
    ["Lounge Food", "Clubhouse Turkey", "House smoked turkey breast, arugula walnut pesto, sun-dried tomatoes, turkey bacon, Mountaineer, ciabatta.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Lounge Food", "Crispy Duck Wings", "Smoked, hoisin, benne seed, dukka, peanuts, pickled cherry relish.", ["peanut", "sesame", "soy"]],
    ["Lounge Food", "Hand Cut BDT Fries", "Sauce toum.", []],
    ["Lounge Food", "Harvest Greens", "Field greens, strawberry, radish, pickled Vidalia, seeds, honey-balsamic vinaigrette.", []],
    ["Lounge Food", "House Made Garganelli", "House cured guanciale, kale, house ricotta.", ["gluten", "milk", "wheat"]],
    ["Lounge Food", "Jumbo Lump Crab Cakes", "Cress, frisee, radish, lemon-caper remoulade.", ["egg", "gluten", "shellfish", "wheat"]],
    ["Lounge Food", "Raw Oysters", "Seaweed mignonette.", ["shellfish"]],
    ["Lounge Food", "Sea Island Pea Hummus", "Benne seed crackers.", ["gluten", "sesame", "wheat"]],
    ["Lounge Food", "Seasonal Soup", "Market availability.", []],
    ["Lounge Food", "Selection of Ice Cream & Seasonal Sorbet", "", ["milk"]],
    ["Lounge Food", "Wood Oven-Roasted Bone Marrow", "Onion Bordelaise, pink peppercorn, rye crumble.", ["gluten", "wheat"]],
    ["Caviar Service", "Estate White Sturgeon", "Tsar Nicoulai.", ["fish"]],
    ["Caviar Service", "Tsar Imperial Ossetra", "Petrossian.", ["fish"]],
    ["Sides", "Cheese Grits", "", ["milk"]],
    ["Sides", "Chicken Sausage or Pork Sausage", "", []],
    ["Sides", "Crispy Potatoes", "", []],
    ["Sides", "House-Cured Canadian Bacon", "", []],
    ["Sides", "Pork Sausage", "", []],
    ["Sides", "Side Egg", "", ["egg"]],
    ["Sides", "Side Smoked Salmon", "", ["fish"]],
    ["Sides", "Smoked Bacon", "", []],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "blue-duck-tavern-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Blue Duck Tavern official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createOccidentalOfficialMenuRows() {
  const sourceUrl = "https://theoccidentaldc.com/";
  const sourceSummary =
    "The Occidental official menu ingredient review: direct allergens come from item names and official menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Raw Bar & Seafood Cocktails", "Oysters on the Half Shell", "Red wine mignonette.", ["shellfish"]],
    ["Raw Bar & Seafood Cocktails", "Alaskan King Crab on Ice", "Dijonnaise.", ["egg", "shellfish"]],
    ["Raw Bar & Seafood Cocktails", "Shrimp Cocktail", "Cocktail sauce.", ["shellfish"]],
    ["Raw Bar & Seafood Cocktails", "Tuna Tartare", "Bigeye tuna, lemon, capers, remoulade.", ["egg", "fish"]],
    ["Raw Bar & Seafood Cocktails", "Sea Bream Ceviche", "Leche de tigre.", ["fish"]],
    ["Raw Bar & Seafood Cocktails", "Herring Under a Fur Coat", "Beets, dill, potatoes.", ["fish"]],
    ["Caviar", "Petrossian Tsar Imperial Baika", "Served with blini, egg white, egg yolk, red onion, creme fraiche, and chives.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Caviar", "Petrossian Tsar Imperial Ossetra", "Served with blini, egg white, egg yolk, red onion, creme fraiche, and chives.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Caviar", "Petrossian Tsar Imperial Kaluga", "Served with blini, egg white, egg yolk, red onion, creme fraiche, and chives.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Appetizers", "Crab Stuffed Avocado", "Fresh citrus.", ["shellfish"]],
    ["Appetizers", "Pigs in a Blanket", "Puff pastry, deli mustard.", ["gluten", "wheat"]],
    ["Appetizers", "Seared Foie Gras", "Pineapple, walnuts.", ["tree-nut"]],
    ["Appetizers", "Maryland Crab Cake", "Jumbo lump crab meat.", ["shellfish"]],
    ["Appetizers", "King Crab Roll", "Drawn butter, potato roll.", ["gluten", "milk", "shellfish", "wheat"]],
    ["Appetizers", "Oysters Beurre Blanc", "Caviar.", ["fish", "milk", "shellfish"]],
    ["Appetizers", "Golden Scallops", "Tartar sauce.", ["egg", "shellfish"]],
    ["Appetizers", "Steak Tartare", "Hand-chopped filet, caviar.", ["fish"]],
    ["Appetizers", "Melon Cocktail", "Sauternes vinaigrette.", []],
    ["Bread", "Buttermilk Biscuits", "Honey butter.", ["gluten", "milk", "wheat"]],
    ["Bread", "Croissant", "", ["egg", "gluten", "milk", "wheat"]],
    ["Bread", "Chocolate Croissant", "", ["egg", "gluten", "milk", "wheat"]],
    ["Bread", "Bear Claw", "", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Soups", "Lobster Bisque", "Cognac and cream.", ["milk", "shellfish"]],
    ["Soups", "Peach & Sungold Tomato Gazpacho", "Cucumber, basil, croutons.", ["gluten", "wheat"]],
    ["Salads", "Caesar Salad", "Crisp romaine, parmesan, rustic croutons.", ["fish", "gluten", "milk", "wheat"]],
    ["Salads", "Shrimp Louie Salad", "Jumbo lump crab, poached shrimp, iceberg, Louie dressing.", ["egg", "shellfish"]],
    ["Salads", "Wedge Salad", "Nueske's bacon, Point Reyes blue cheese.", ["milk"]],
    ["Salads", "Chinese Chicken Salad", "Shaved vegetables, mango, cashew, wontons, peanut dressing.", ["gluten", "peanut", "tree-nut", "wheat"]],
    ["Salads", "Strawberries & Burrata", "Harry's berries, strawberry tapenade, crostini.", ["gluten", "milk", "wheat"]],
    ["Salads", "Cucumber Salad", "Feta cheese, sunflower seed crumble, green goddess dressing.", ["milk"]],
    ["Salads", "Grilled Chicken Breast", "", []],
    ["Salads", "Broiled Salmon", "", ["fish"]],
    ["Salads", "Grilled Shrimp", "", ["shellfish"]],
    ["Sandwiches", "French Dip", "Swiss, au jus, horseradish.", ["gluten", "milk", "wheat"]],
    ["Sandwiches", "Corned Beef Reuben", "Swiss, sauerkraut, rye.", ["gluten", "milk", "wheat"]],
    ["Sandwiches", "King Crab Roll", "Drawn butter, potato roll.", ["gluten", "milk", "shellfish", "wheat"]],
    ["Sandwiches", "Turkey Club", "Bacon, avocado, aioli.", ["egg", "gluten", "wheat"]],
    ["Sandwiches", "Crab Cake Sandwich", "Remoulade, brioche.", ["egg", "gluten", "milk", "shellfish", "wheat"]],
    ["Sandwiches", "The Occidental Burger", "Prime beef, special sauce, cheddar cheese, pickles, and onions.", ["egg", "gluten", "milk", "wheat"]],
    ["Sandwiches", "Breakfast Sandwich", "Egg, bacon, bell pepper, cheddar.", ["egg", "gluten", "milk", "wheat"]],
    ["Steaks", "Filet Mignon", "8 oz.", []],
    ["Steaks", "New York Strip", "Prime 50-day aged.", []],
    ["Steaks", "Ribeye", "Prime 35-day dry aged.", []],
    ["Steaks", "Porterhouse", "Prime 30-day dry aged.", []],
    ["Steaks", "Kansas City Strip", "Prime 35-day dry aged.", []],
    ["Prime Rib", "Prime Rib", "21-day dry aged, salt-crusted, freshly grated horseradish.", []],
    ["Prime Rib", "French Dip", "Swiss, au jus, horseradish cream.", ["gluten", "milk", "wheat"]],
    ["Accompaniments", "Bearnaise", "", ["egg", "milk"]],
    ["Accompaniments", "Au Poivre", "", []],
    ["Accompaniments", "Oscar Style", "", ["shellfish"]],
    ["Accompaniments", "Foie Gras", "", []],
    ["Accompaniments", "Point Reyes Blue", "", ["milk"]],
    ["Accompaniments", "Ramp Butter", "", ["milk"]],
    ["Accompaniments", "Truffle Butter", "", ["milk"]],
    ["Accompaniments", "Smoked Bone Marrow", "", []],
    ["Accompaniments", "Sunny Side Up Eggs", "", ["egg"]],
    ["Entrees", "Dover Sole Meuniere", "Golden butter, capers.", ["fish", "milk"]],
    ["Entrees", "Chilean Sea Bass", "Miso marinade, haricots verts.", ["fish", "soy"]],
    ["Entrees", "Broiled Salmon", "Summer squash salad, basil pesto, ratatouille sauce.", ["fish", "milk", "tree-nut"]],
    ["Entrees", "Twin Lobster Tails", "Drawn butter, lemon.", ["milk", "shellfish"]],
    ["Entrees", "Beef Stroganoff", "Egg noodles.", ["egg", "gluten", "milk", "wheat"]],
    ["Entrees", "Virginia Ham", "Grilled pineapple.", []],
    ["Entrees", "Surf & Turf", "8 oz. filet, broiled lobster tail, bearnaise.", ["egg", "milk", "shellfish"]],
    ["Entrees", "Colorado Rack of Lamb", "Mint jelly.", []],
    ["Entrees", "Veal Parmigiana", "Tomato sauce, mozzarella.", ["gluten", "milk", "wheat"]],
    ["Entrees", "Roasted Half Heritage Chicken", "Sauce supreme.", ["milk"]],
    ["Entrees", "The Pork Chop That Saved The World", "Grilled heritage pork chop, gremolata, fondant potato.", []],
    ["Entrees", "The Pheasant Under Glass", "Seared foie gras, sauce Richmond.", []],
    ["Entrees", "Chicken Paillard", "Almonds, picholine olives.", ["tree-nut"]],
    ["Entrees", "French Omelette", "Gruyere.", ["egg", "milk"]],
    ["Sides", "Asparagus", "Egg yolk jam, bearnaise vinaigrette.", ["egg", "milk"]],
    ["Sides", "Steak Fries", "", []],
    ["Sides", "Giant Hash Brown", "", []],
    ["Sides", "Whipped Potatoes", "", ["milk"]],
    ["Sides", "Onion Rings", "", ["gluten", "wheat"]],
    ["Sides", "Mac & Cheese", "Vermont cheddar, stewed tomatoes.", ["gluten", "milk", "wheat"]],
    ["Sides", "Creamed Spinach", "", ["milk"]],
    ["Sides", "Green Beans Amandine", "Brown butter, lemon, toasted almonds.", ["milk", "tree-nut"]],
    ["Sides", "Sauteed Wild Mushrooms", "Smoked leek vinaigrette.", []],
    ["Brunch", "Yogurt Parfait", "Granola, berries.", ["gluten", "milk", "wheat"]],
    ["Brunch", "Caramelized French Toast", "Blueberries, soft Chantilly.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "Eggs Any Style", "Choice of meat, sourdough, roasted potatoes.", ["egg", "gluten", "wheat"]],
    ["Brunch", "Classic Benedict", "Virginia ham, hollandaise, English muffin.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "Avocado Toast", "Poached eggs, sundried tomato.", ["egg", "gluten", "wheat"]],
    ["Brunch", "Ham & Eggs", "Virginia ham steak, eggs any style.", ["egg"]],
    ["Brunch", "Buckwheat Waffle", "Maple syrup.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "Western Omelette", "Virginia ham, roasted peppers, aged cheddar.", ["egg", "milk"]],
    ["Brunch", "Eggs Norwegian", "Smoked salmon, hollandaise, English muffin.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Brunch", "Steak & Eggs", "Pan-seared strip steak, eggs any style.", ["egg"]],
    ["Brunch", "Mushroom Eggs", "Poached eggs, mushroom veloute, sourdough, morel mushrooms.", ["egg", "gluten", "milk", "wheat"]],
    ["Sides", "Side Eggs", "", ["egg"]],
    ["Sides", "Half Avocado", "", []],
    ["Sides", "Bacon", "", []],
    ["Sides", "Pork Sausage", "", []],
    ["Sides", "Turkey Sausage", "", []],
    ["Sides", "Breakfast Potatoes", "", []],
    ["Desserts", "Chocolate Mousse", "Soft vanilla bean whip.", ["egg", "milk"]],
    ["Desserts", "Pink Champagne Cake", "Vanilla custard, champagne buttercream.", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Lemon Icebox", "Chantilly, lemon zest, vanilla anglaise.", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Baked Alaska", "Banana ice cream, apricot jam, toasted meringue.", ["egg", "milk"]],
    ["Desserts", "Coconut Chiffon Cake", "Vanilla sponge, coconut cream.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Desserts", "NY Cheesecake", "Pecan caramel, graham cracker crust.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Desserts", "Bananas Foster", "Brown sugar, walnut, rum, vanilla ice cream.", ["milk", "tree-nut"]],
    ["Desserts", "Ice Cream, Sherbert & Sorbet", "", ["milk"]],
  ];

  const seen = new Set();

  return rows
    .filter(([category, name]) => {
      const key = `${category}::${name}`.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map(([category, name, description, allergens]) =>
      sanitizeMenuItemDisplayFields({
        id: slugifyReviewedRowId(`${category}-${name}`),
        name,
        category,
        description: description || undefined,
        ingredientsText: description || undefined,
        allergens,
        mayContain: [],
        allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
        evidence: [
          {
            source: "occidental-official-menu-review",
            sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
            sourceUrl,
            text: `Reviewed The Occidental official menu row: ${name}${description ? ` - ${description}` : ""}`,
          },
        ],
        sourceKind: "official-menu-review",
        sourceSummary,
        sourceType: "reviewed-official-menu-repair",
        sourceUrls: [sourceUrl],
      }),
    );
}

function createEtVoilaOfficialMenuRows() {
  const sourceUrl = "https://www.etvoiladc.com/menus";
  const sourceSummary =
    "Et Voila official Wix menu ingredient review: direct allergens come from item names and official menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Main Courses", '"Et Voila!" Burger', '"Meyer Ground Beef" from Paint Hill Farm, melted Chimay cheese, bacon, onion and tomato confit. Served with Belgian fries.', ["milk"]],
    ["Desserts", "Alex's Cake", "Dark and milk chocolate mousse, almond biscuit and raspberry coulis. Contains nuts.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Main Courses", "Beef Tartare", "Creek Stone Farm Angus beef mixed with shallots, chives, capers, pickles, Tabasco, Worcestershire and sauce tartare. Served with Belgian fries.", ["egg", "fish"]],
    ["Starters", "Beet Salad", "Beets, feta, grapefruit, green onions, chives, cashew nuts and citrus dressing. Contains nuts.", ["milk", "tree-nut"]],
    ["Sides", "Belgian Fries", "", []],
    ["Brunch", "Benedict Eggs with Country Ham", "Two toasted English muffins, cured country ham and Hollandaise sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["Brunch", "Benedict Eggs with Smoked Salmon", "English muffin, poached eggs and Hollandaise sauce. Served with mixed green salad.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Desserts", "Berries Belgian Waffle", "Mixed berries, vanilla whipped cream and raspberry coulis.", ["egg", "gluten", "milk", "wheat"]],
    ["Starters", "Caesar Salad", "Romaine, boqueron anchovies, shaved Parmesan, crouton and homemade Caesar dressing.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Kids", "Cavatelli Pasta & Parmesan", "", ["gluten", "milk", "wheat"]],
    ["Kids", "Cavatelli Pasta, Butter & Parmesan", "", ["gluten", "milk", "wheat"]],
    ["Starters", "Cheese Board", "Selection of five cheeses, gougeres cheese puffs, dried fruits, caramelized pecans and mixed green salad. Contains nuts.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Brunch", "Cheese Omelette", "Choice of ham or mushrooms. Served with mixed green salad and Belgian fries.", ["egg", "milk"]],
    ["Starters", "Cheese Platter", "Selection of five cheeses, dried fruits, caramelized pecans and mixed green salad. Contains nuts.", ["milk", "tree-nut"]],
    ["Kids", "Chicken Fingers & Belgian Fries", "", ["gluten", "wheat"]],
    ["Desserts", "Chocolate Belgian Waffle", "White chocolate whipped cream, chocolate sauce and sliced almonds.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Brunch", "Croque Madame", "White Pullman bread, Parisian ham, Dijon mustard, Bechamel sauce, Gruyere cheese, topped with fried eggs. Served with mixed green salad.", ["egg", "gluten", "milk", "mustard", "wheat"]],
    ["Brunch", "Croque Monsieur", "White Pullman bread, Parisian ham, Dijon mustard, Bechamel sauce and Gruyere cheese. Served with mixed green salad.", ["gluten", "milk", "mustard", "wheat"]],
    ["Desserts", "Dark Chocolate Mousse", "Contains nuts.", ["tree-nut"]],
    ["Brunch", "Egg Meurette", "English muffin, poached eggs, mushrooms, bacon and red wine sauce. Served with mixed green salad.", ["egg", "gluten", "wheat"]],
    ["Brunch", "Eggs Benedict Florentine", "Two toasted English muffins, spinach and Hollandaise sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["Starters", "Endive Salad", "Belgian endive, Blue and Chimay cheese, roasted pecan nuts, Gala apples and endive dressing. Contains nuts.", ["milk", "tree-nut"]],
    ["Starters", "Escargots", "Baked snails, parsley-garlic butter and toasted country bread.", ["gluten", "milk", "shellfish", "wheat"]],
    ["Main Courses", "Flemish Beef Stew", "Flat iron steak chunks simmered in dark Belgian beer. Served with mashed potatoes.", ["gluten"]],
    ["Desserts", "Floating Island", "Vanilla bean custard cream and caramelized soft meringue.", ["egg", "milk"]],
    ["Starters", "French Onion Soup", "Onion soup, croutons and melted Gruyere cheese.", ["gluten", "milk", "wheat"]],
    ["Main Courses", "Fried Chicken", "Fried chicken thighs, sauce tartare, frisee salad and Belgian fries.", ["egg", "gluten", "wheat"]],
    ["Starters", "Goat Cheese Salad", "Warm goat cheese with pecan brioche and Liege syrup. Contains nuts.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Sides", "Green Peppercorn Sauce", "", []],
    ["Main Courses", "Grilled North Carolina Trout", "Champagne sauce, mashed potato, sauteed spinach with olive oil, shallots and garlic.", ["fish"]],
    ["Main Courses", "Grilled Salmon", "Grilled salmon, lentils Du Puy and Dijon mustard sauce.", ["fish", "mustard"]],
    ["Main Courses", "Hanger Steak", "Hanger steak from Creek Stone Farm. Served with Belgian fries and green peppercorn sauce.", []],
    ["Sides", 'Lentils "Du Puy"', "", []],
    ["Sides", "Mashed Potatoes", "", []],
    ["Main Courses", "Moules Bouillabaisse", "Mussels with tomatoes, parsley, leeks, fennel, Pastis, saffron, confit cherry tomatoes, confit fennel and confit garlic.", ["shellfish"]],
    ["Main Courses", "Moules Mariniere", "Mussels cooked with white wine, leeks, garlic and onions. Served with Belgian fries.", ["shellfish"]],
    ["Main Courses", "Mushroom Ragu Pasta", "Homemade zucca pasta, vegetarian mushroom ragu, tomatoes, shallots, garlic, Parmesan and Gruyere.", ["gluten", "milk", "wheat"]],
    ["Desserts", "Profiteroles", "Puff pastry, vanilla ice cream, chocolate sauce and sliced almonds. Contains nuts.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Main Courses", "Rigatoni Bolognese", "Ground veal, pork and beef, carrots, garlic, San Marzano tomato sauce and 24-month aged Parmigiano Reggiano cheese.", ["gluten", "milk", "wheat"]],
    ["Starters", "Salmon Tartare", "Cilantro, fried green lentils and curry mayonnaise.", ["egg", "fish"]],
    ["Sides", "Sauteed Brussels Sprouts", "Cooked with pork belly.", []],
    ["Sides", "Sauteed Spinach", "", []],
    ["Brunch", "Scrambled Eggs", "Scrambled eggs, English muffin. Choice of spinach, mushrooms or ham.", ["egg", "gluten", "wheat"]],
    ["Main Courses", "Sole Meuniere", "Norway sole sauteed in lemon, parsley, capers and brown butter. Served with Yukon Gold mashed potatoes, spinach and lemon zest.", ["fish", "milk"]],
    ["Brunch", "Steak & Eggs", "Hanger steak, fried eggs and sauce Bordelaise. Served with Belgian fries.", ["egg"]],
    ["Sides", "Sweet Potato Fries", "", []],
    ["Starters", "Tomato Gazpacho", "Tomatoes, cucumber, bread, onion and red pepper.", ["gluten", "wheat"]],
    ["Desserts", "Vanilla Creme Brulee", "Baked English custard and caramelized layer.", ["egg", "milk"]],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "et-voila-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Et Voila official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createElViejoOfficialMenuRows() {
  const sourceUrl = "https://www.elviejocak.com/ourmenu";
  const sourceSummary =
    "El Viejo official menu ingredient review: direct allergens come from official item names and menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Homemade Drinks", "Atol de Elote", "", []],
    ["Homemade Drinks", "Atol de Elote (Seasonal)", "Sweet, creamy corn.", []],
    ["Central American", "Baleada", "Flour tortilla stuffed with eggs, refried beans, queso rallado and crema.", ["egg", "gluten", "milk", "wheat"]],
    ["Central American", "Carne Asada", "Grilled steak served with rice, beans, salad, chimol and two handmade corn tortillas.", []],
    ["Homemade Drinks", "Chocolate Caliente", "Salvadoran hot chocolate.", []],
    ["Central American", "Chuchito de Pollo", "Guatemalan-style chicken tamal served with salsa roja.", []],
    ["Homemade Drinks", "Fresco de Chan", "Strawberry limeade with chia seeds.", []],
    ["Homemade Drinks", "Fresco de Jamaica", "Hibiscus iced tea.", []],
    ["Central American", "Fritanga Nicaraguense", "Gallo pinto, queso frito, tajadas, ensalada de repollo and chilero.", ["milk"]],
    ["Central American", "Horchata", "Salvadoran milk beverage. Contains nuts and dairy.", ["milk", "tree-nut"]],
    ["Central American", "Huevos Rancheros", "Two fried eggs topped with salsa ranchera. Served with casamiento or refried beans, plantains, crema, queso duro and two handmade corn tortillas.", ["egg", "milk"]],
    ["Homemade Drinks", "Maranon", "Cashew fruit beverage.", []],
    ["Central American", "Pan Guanaco", "Bread roll stuffed with eggs, refried beans, queso rallado and crema.", ["egg", "gluten", "milk", "wheat"]],
    ["Central American", "Pescado Frito", "Fried fish served with rice, beans, salad and two handmade corn tortillas.", ["fish"]],
    ["Central American", "Platanos Fritos", "Fried plantains served with crema and refried beans.", ["milk"]],
    ["Central American", "Plato Tipico", "Scrambled eggs mixed with tomatoes, onions and green peppers. Served with casamiento or refried beans, plantains, crema, queso duro and two handmade corn tortillas.", ["egg", "milk"]],
    ["Small Bites", "Pupusa", "Corn masa stuffed with your choice of filling. Served with curtido and salsa roja.", []],
    ["Central American", "Pupusas", "Corn tortilla stuffed with your choice of filling. Served with curtido and salsa roja.", []],
    ["Sides", "Side Beans", "", []],
    ["Sides", "Side Egg", "", ["egg"]],
    ["Sides", "Side Rice", "", []],
    ["Central American", "Tamal de Elote", "Sweet corn tamal served fried or steamed with crema.", ["milk"]],
    ["Central American", "Tamal de Pollo", "Salvadoran-style chicken tamal.", []],
    ["Central American", "Tamal Pisque", "Refried bean tamal served with crema or salsa roja.", ["milk"]],
    ["Homemade Drinks", "Tamarindo", "Tamarind fruit beverage.", []],
    ["Central American", "Taquitos Tostados", "Three shredded chicken taquitos topped with ensalada de repollo, crema and queso rallado.", ["milk"]],
    ["Central American", "Yuca Frita", "Fried yuca served with ensalada de repollo and salsa verde.", []],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "el-viejo-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed El Viejo official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createTaporiOfficialMenuRows() {
  const sourceUrl = "https://www.taporidc.com/menus";
  const sourceSummary =
    "Tapori official menu ingredient review: direct allergens come from official item names and menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Small Plates", "Achari Macchi Kebab", "North Atlantic Canadian salmon, mustard oil, ginger, quinoa upma and gram flour.", ["fish", "mustard"]],
    ["Rice Entrees", "Achari Macchi Kebab (Salmon)", "Tandoor-roasted salmon marinated with mustard oil, ginger and spices, served with fragrant saffron pulao and onion salad.", ["fish", "mustard"]],
    ["Rice Entrees", "Asparagus Pesto Uttapam", "Urad daal, ghee, pumpkin seed, basil, tomato and coconut chutney.", ["milk", "tree-nut"]],
    ["Rice Entrees", "Butter Chicken", "Tender chicken, tomato-cashew sauce, Kashmiri chili, fenugreek, cream and garlic naan.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Rice Entrees", "Cauliflower", "Crispy cauliflower tossed with Kashmiri chili, curry leaf and spices, served with chili mayo. Vegan and gluten free.", []],
    ["Rice Entrees", "Cheese Kulcha", "Caramelized mushroom, spinach and cream cheese.", ["gluten", "milk", "wheat"]],
    ["Rice Entrees", "Cucumber Salad", "", []],
    ["Small Plates", "Daru Lamb Chop", "Black garlic, cashew, green cardamom, mace and tandoori broccoli.", ["tree-nut"]],
    ["Rice Entrees", "Dum Biryani", "Tender slow-roasted goat on the bone, cooked with fragrant basmati rice, saffron, cinnamon and cardamom, served with raita.", ["milk"]],
    ["Rice Entrees", "Garlic Naan", "Contains eggs and dairy.", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Gulab Jamun", "Served warm with lemongrass gelato, chocolate and kataifi nest.", ["gluten", "milk", "wheat"]],
    ["Rice Entrees", "Hudson Valley Duck Choila", "Rohan duck breast, timur, garlic, ginger, mustard, edamame and asparagus.", ["mustard", "soy"]],
    ["Rice Entrees", "Kathal Biriyani", "Young jackfruit seared on grill, cooked with onion, ginger, garlic, saffron, cinnamon, green cardamom, bay leaf, mace, basmati rice and ghee. Served with raita. Contains dairy.", ["milk"]],
    ["Rice Entrees", "Lamb Chop", "Tandoor-roasted leg of lamb marinated with black garlic, cashews and spiced yogurt, served with charred broccoli, mint chutney and crisp onion salad.", ["milk", "tree-nut"]],
    ["Rice Entrees", "Lasooni Palak", "Creamed spinach curry simmered with tomatoes and warm spices.", ["milk"]],
    ["Small Plates", "Lotus Root Chaat", "Gram flour, tamarind, sweet yogurt and black salt.", ["milk"]],
    ["Desserts", "Mango Malai Kulfi", "Saffron, pistachio and kewra water.", ["milk", "tree-nut"]],
    ["Rice Entrees", "Maryland Blue Crab Idli", "Fermented rice and lentil cakes, Chettinad sauce, curry leaf and coconut milk.", ["shellfish", "tree-nut"]],
    ["Rice Entrees", "Nilgiri Scallop", "Pan-seared scallops crusted with gunpowder masala, served in a rich coconut, green chili, mint and cilantro broth.", ["shellfish", "tree-nut"]],
    ["Rice Entrees", "Onion Salad", "", []],
    ["Rice Entrees", "Paneer Chop", "Grilled paneer steak marinated with herbs and green chili, served with radish salad, mint chutney and fresh herb dust.", ["milk"]],
    ["Small Plates", "Pani Puri", "Potato, black chickpea and raw mango.", []],
    ["Rice Entrees", "Plain Naan", "", ["gluten", "wheat"]],
    ["Small Plates", "Podi Masala Dosa", "Fermented rice and lentil crepe, potato, sambar and coconut chutney.", ["tree-nut"]],
    ["Rice Entrees", "Radish Salad", "", []],
    ["Rice Entrees", "Ragda Pattice", "Cassava and plantain patty surrounded by yellow daal and covered with date and tamarind, mint and sweet yogurt chutney. Vegetarian.", ["milk"]],
    ["Small Plates", "Ragda Sabudana Pattice", "Cassava and potato patty, green mint yogurt, date and tamarind chutney, boondi.", ["milk"]],
    ["Desserts", "Rasmalai Cheesecake", "Creamy rasmalai-inspired cheesecake on a spiced biscuit crust with pistachio and sour cherry chutney. Contains dairy and nuts.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Rice Entrees", "Roasted Carrots", "Cal-Organic Farms roasted carrots with cilantro-sesame chutney, dukkah and lapsi powder.", ["gluten", "sesame", "wheat"]],
    ["Rice Entrees", "Sambar", "South Indian lentil stew made with pumpkin, eggplant, shallots, carrots, tomato and curry leaves.", []],
    ["Small Plates", "Spicy Seekh Kebab", "Minced chicken, garlic, green chili and garam masala.", []],
    ["Small Plates", "Squash Phuktan", "Roasted pattypan squash, calabaza puree and quinoa upma.", []],
    ["Rice Entrees", "Tandoori Broccoli", "Vegan.", []],
    ["Rice Entrees", "Tandoori Chicken", "Tandoor-roasted poussin marinated with garam masala, yogurt and Kashmiri chili, served with fragrant mushroom pulao.", ["milk"]],
    ["Small Plates", "Tapori Butter Chicken", "Tender chicken, tomato-cashew sauce, Kashmiri chili, fenugreek, cream and garlic naan.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Rice Entrees", "Tapori Naan", "Pistachio and poppy seed. Contains dairy and eggs.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Small Plates", "Tiger Shrimp Khichdi", "Quinoa, mung daal, garlic chutney and smoked pappadum.", ["shellfish"]],
    ["Rice Entrees", "Vada Pav", "Spicy potato fritter tucked in a soft pav roll with mint chutney and pickled beets. Vegetarian.", ["gluten", "wheat"]],
    ["Rice Entrees", "Wagyu Momo", "Pieces of wagyu beef dumplings in housemade buckwheat wrappers. Served in a tomato and beef spiced broth.", []],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "tapori-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Tapori official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createGregorysCoffeeOfficialMenuRows() {
  const sourceUrl = "https://gregoryscoffee.com/collections/menu";
  const sourceSummary =
    "Gregorys Coffee official Shopify menu/product-page review: direct allergens come from official product names, descriptions, and item-level contains disclosures; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Coffee", "Black Forest Latte", "Cherry and chocolate with espresso, topped with dark chocolate cream foam.", ["milk"]],
    ["Food", "Blueberry Muffin", "House-made blueberry muffin with a light and fluffy base and fresh blueberries.", ["egg", "gluten", "milk", "wheat"]],
    ["Coffee", "Caffe Vienna", "Gregorys take on a timeless European cafe drink.", []],
    ["Food", "Chocolate Croissant", "Chocolate croissant baked fresh daily on site.", ["egg", "gluten", "milk", "wheat"]],
    ["Food", "Croissant", "House-made croissant baked daily with flaky crust and soft buttery texture.", ["egg", "gluten", "milk", "wheat"]],
    ["Food", "Ham and Cheese Croissant", "Freshly baked croissant with ham and American cheese.", ["egg", "gluten", "milk", "wheat"]],
    ["Coffee", "Iced Black Forest Latte", "Cherry and chocolate with espresso, topped with dark chocolate cream foam.", ["milk"]],
    ["Coffee", "Iced Rainbow Cookie Latte", "Raspberry puree, almond syrup and mocha foam.", ["milk", "tree-nut"]],
    ["Coffee", "Iced Rainbow Cookie Matcha", "Raspberry, almond and dark chocolate marzipan foam with matcha.", ["milk", "tree-nut"]],
    ["Coffee", "Matcha Latte (GF | V)", "Ceremonial-grade matcha blended with almond milk.", ["tree-nut"]],
    ["Smoothies", "Morning Boost", "Smoothie from Gregorys' menu.", []],
    ["Coffee", "Protein Coffee", "Cold brew combined with Nuzest plant-based protein, peanut butter, coconut water and date syrup.", ["peanut", "tree-nut"]],
    ["Coffee", "Pumpkin Spice Latte", "Night Vision Espresso combined with milk, vanilla and pumpkin spice syrup.", ["milk"]],
    ["Coffee", "Rainbow Cookie Latte", "Raspberry puree, almond syrup and mocha foam.", ["milk", "tree-nut"]],
    ["Food", "The Deluxe", "Turkey sausage, egg and American cheese on a house-made buttery croissant. Contains egg, milk, soy and wheat.", ["egg", "gluten", "milk", "soy", "wheat"]],
    ["Food", "The New Yorker", "Classic New York-style menu item.", []],
    ["Food", "The Skinny", "Egg whites scrambled with organic turkey bacon and white cheddar cheese served on an Ezekiel sprouted grain English muffin.", ["egg", "gluten", "milk", "wheat"]],
    ["Food", "Vegan Bar (GF | V)", "Peanut butter, granola, rolled oats, coconut, walnuts, apple, banana, figs, dates, prunes, apricots, peanuts, sesame seeds, sunflower seeds, raisins and house-made date syrup.", ["peanut", "sesame", "tree-nut"]],
    ["Food", "Vegan Chia Seed Croissant (V)", "Plant-based croissant with chia seeds.", ["gluten", "wheat"]],
    ["Food", "Vegan Deluxe (V)", "Plant-based breakfast sandwich with vegan egg, Beyond Sausage, vegan cheddar cheese and vegan chia seed croissant. Official page states Contains Nuts.", ["gluten", "tree-nut", "wheat"]],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "gregorys-coffee-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Gregorys Coffee official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createLaCasinaOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/lacasinadc";
  const sourceSummary =
    "La Casina official Toast menu ingredient review: direct allergens come from official item names and menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Drinks", "Acqua Panna Spring Water - PET", "Spring water from the sun-drenched hills of Tuscany.", []],
    ["Kids", "Bambino Margherita w/drink", "Pomodoro sauce and fresh mozzarella. Comes with a drink.", ["gluten", "milk", "wheat"]],
    ["Desserts", "Cannoli della Casa", "Traditional recipe with ricotta filling and chocolate drop.", ["gluten", "milk", "wheat"]],
    ["Fritti", "Chips della Casa", "Handcrafted fresh potato chips topped with Pecorino Romano and black pepper.", ["milk"]],
    ["Fritti", "I Nostri Fritti", "La Casina specialties.", []],
    ["Pizza", "L' Amatrice", "Pomodoro sauce, guanciale, Pecorino Romano, chili-infused extra virgin olive oil and black pepper.", ["gluten", "milk", "wheat"]],
    ["Pizza", "La Bufalina", "Prosciutto San Daniele, mozzarella di Bufala, homemade pesto, extra virgin olive oil, black pepper and fresh basil. Pesto contains pine nuts and cashews.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Pizza", "La Cacio e Pepe", "Cacio Romano cheese, mozzarella Fior di Latte, extra virgin olive oil and black pepper.", ["gluten", "milk", "wheat"]],
    ["Pizza", "La Carbonara", "Guanciale, egg, extra virgin olive oil, Pecorino Romano and black pepper.", ["egg", "gluten", "milk", "wheat"]],
    ["Pizza", "La Classica", "Traditional recipes.", []],
    ["Pizza", "La Gallia", "Prosciutto cotto Italiano, stracciatella cheese, extra virgin oil, black pepper and fresh thyme.", ["gluten", "milk", "wheat"]],
    ["Pizza", "La Garum", "Pomodoro sauce, anchovies, Tuscan olives, black pepper, extra virgin olive oil and fresh oregano.", ["fish", "gluten", "wheat"]],
    ["Desserts", "La Gianduia small", "A sweet full size pinsa with Nutella, dusted with powdered sugar.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Pizza", "La Gricia", "Guanciale, Pecorino Romano, extra virgin olive oil and black pepper.", ["gluten", "milk", "wheat"]],
    ["Pizza", "La Leggera di Bresaola", "Italian bresaola, arugula, black pepper, fresh basil and Grana Padano shavings, drizzled with extra virgin olive oil and fresh lime.", ["gluten", "milk", "wheat"]],
    ["Pizza", "La Margherita della Casina", "Pomodoro sauce, mozzarella Fior di Latte, extra virgin olive oil, black pepper and fresh basil.", ["gluten", "milk", "wheat"]],
    ["Pizza", "La Milanese", "Pomodoro sauce, pepperoni and salame Milano, mozzarella Fior di Latte, crushed red pepper and extra virgin olive oil.", ["gluten", "milk", "wheat"]],
    ["Pizza", "La Porchetta", "Porchetta Romana, truffle-infused extra virgin olive oil, Pecorino Romano, black pepper, black lava salt and fresh rosemary.", ["gluten", "milk", "wheat"]],
    ["Pizza", "La Romana", "The authentic Roman recipes.", []],
    ["Pizza", "La Vegetariana", "Zucchini, Italian eggplant, thinly sliced vegetables and tree nut disclosure.", ["gluten", "tree-nut", "wheat"]],
    ["Fritti", "Le Nuvolette Arrabbiate", "Bites of deep fried pinsa served with La Casina homemade arrabbiata sauce for dipping.", ["gluten", "wheat"]],
    ["Desserts", "Le Nuvolette con Nutella", "Little clouds of fried pinsa smothered in Nutella and dusted with powdered sugar.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Fritti", "Le Nuvolette Marinare", "Bites of deep fried pinsa stuffed with anchovies and fresh mozzarella Fior di Latte.", ["fish", "gluten", "milk", "wheat"]],
    ["Pizza", "Le Ripiene", "Double layer filled with Italian cheese and ham prosciutto.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Le Speciali Casina", "The specials from La Casina.", []],
    ["Pizza", "Margherita D.O.P", "San Marzano pomodoro sauce, mozzarella di Bufala, extra virgin olive oil, black pepper, Grana Padano shavings and fresh basil.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Mediterranea", "Pomodoro Datterino sauce, Tuscan olives, red onions, roasted tomatoes, extra virgin olive oil, black pepper, fresh basil and oregano.", ["gluten", "wheat"]],
    ["Pizza", "Montesacro", "Lamb sausage, mozzarella di Bufala, homemade potato puree, artichokes, chili-infused extra virgin olive oil and fresh rosemary.", ["gluten", "milk", "wheat"]],
    ["Fritti", "Olive Ripiene", "Green Italian olives stuffed with mortadella, sausage and Grana Padano. Breaded and deep fried.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Ottavo Colle", "Lardo di Colonnata with thinly sliced toppings.", ["gluten", "wheat"]],
    ["Desserts", "Pinsa Dolce", "", ["gluten", "wheat"]],
    ["Drinks", "San Pellegrino - Italian Flavors", "Italian sparkling beverage.", []],
    ["Specials", "Special Bruschetta italian sausage & stracchino", "", ["gluten", "milk", "wheat"]],
    ["Specials", "Speciale Chef", "A chef's selection of the best local market ingredients of each season.", []],
    ["Desserts", "Tartufini al Cioccolato", "Mascarpone truffle with a creamy hazelnut center and dusted with cocoa powder.", ["milk", "tree-nut"]],
    ["Desserts", "Tartufini al Cocco", "Mascarpone treat covered in coconut with a heart of hazelnut cream.", ["milk", "tree-nut"]],
    ["Drinks", "Tea hot", "", []],
    ["Desserts", "Tiramisu al Caffe", "Traditional Italian dessert made with sweet creamy mascarpone mix and ladyfingers dipped in coffee.", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Tiramisu al Pistacchio", "Creamy mascarpone mix with pistachios and ladyfingers. Contains eggs.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["Desserts", "Tiramisu alla Fragola", "Strawberry tiramisu with sweet mascarpone mix, ladyfingers and fresh strawberries. Contains eggs.", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Tiramisu/Specialties", "Traditional Italian.", []],
    ["Specials", "Tris Bruschette Romane", "", ["gluten", "wheat"]],
    ["Pizza", "Vesuvio", "San Marzano pomodoro sauce, mozzarella di Bufala, anchovies, extra virgin olive oil, black pepper, black lava salt and fresh basil.", ["fish", "gluten", "milk", "wheat"]],
    ["Desserts", "Wonka House", "Special double layers pinsa with ricotta cheese and Nutella, sprinkled with sugar.", ["gluten", "milk", "tree-nut", "wheat"]],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "la-casina-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed La Casina official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createBoogyAndPeelOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/boogy-peel-1-dupont-circle-nw-suite-115b";
  const sourceSummary =
    "Boogy & Peel official Toast menu ingredient review: direct allergens come from official item names and menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Pizza", "'Mater Pie", "Summer special with Duke's, asiago, heirloom tomatoes and black pepper.", ["egg", "gluten", "milk", "wheat"]],
    ["Pizza", "Marinara", "Red sauce, garlic confit and sub sauce. Vegan; this pizza does not have cheese.", ["gluten", "wheat"]],
    ["Sandos", "The Patricia Sando", "Balsamic marinated vegetables, pesto mayo, arugula and stracciatella on sourdough focaccia. Vegetarian.", ["egg", "gluten", "milk", "wheat"]],
    ["Desserts", "Brown Butter Baddie", "From Hanker N Knead: brown butter, milk chocolate and salted toffee.", ["milk"]],
    ["Sauces", "Buffalo Sauce", "", []],
    ["Pizza", "Caesar Pizza", "Kale, parm, lemon and breadcrumbs. Vegetarian without boquerones add-on.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Cheesy Boi", "Red sauce and 50/50 cheese. Vegetarian.", ["gluten", "milk", "wheat"]],
    ["Sandos", "Chicken Caesar Sando", "Kale Caesar salad, roasted chicken thighs, parm and breadcrumbs on sourdough focaccia.", ["gluten", "milk", "wheat"]],
    ["Wings", "Chicken Wings", "Brined, fried and tossed in your choice of buffalo or sweet BBQ.", []],
    ["Desserts", "Chocolate Chip Pizookie", "From Hanker N Knead: sourdough, rye flour, toasted malt milk and chocolate chips.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Detroit Pie", "Crispy cheesy Detroit square with your choice of sauce and basil. Add pepperoni if you want.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Detroit Slice", "Crispy cheesy Detroit square with your choice of sauce and basil. Add pepperoni if you want.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Detroit Slice Lunch Box", "", ["gluten", "milk", "wheat"]],
    ["Bread", "Focaccia Bread (sando size)", "Wrapped focaccia bread for building your own sando.", ["gluten", "wheat"]],
    ["Pizza", "Harambe Loved Big Macs", "Special sauce, ground beef, American cheese, iceberg lettuce, onions and pickles.", ["egg", "gluten", "milk", "wheat"]],
    ["Sauces", "Honey", "", []],
    ["Salads", "Kale Caesar Salad", "Kale, Caesar dressing, parm, lemon and breadcrumbs. Boquerones not included; add-on available.", ["egg", "gluten", "milk", "wheat"]],
    ["Wings", "Lil' Bear Chicken Wings", "Brined, fried and tossed with Lil' Bear's sweet chili sauce, lime, cilantro, mint and peanuts.", ["peanut"]],
    ["Pizza", "Macha Roni", "Red sauce, 50/50 cheese, pepperoni, basil, Saul's salsa macha and honey. Contains peanuts and sesame seeds.", ["gluten", "milk", "peanut", "sesame", "wheat"]],
    ["Sauces", "Marinara Sauce", "", []],
    ["Desserts", "Pizookie Box", "Pizookies for your munchie needs.", ["gluten", "milk", "wheat"]],
    ["Small Plates", "Salsa Macha Pimento Cheese", "Pimento cheese with Saul's salsa macha and ranch tortilla chips. Contains peanuts and sesame seeds.", ["egg", "gluten", "milk", "peanut", "sesame", "wheat"]],
    ["Pizza", "Shroom Pie", "Asiago fonduta, mushrooms, thyme and lemon.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Stracci Pie", "Red sauce, garlic confit and stracciatella.", ["gluten", "milk", "wheat"]],
    ["Pizza", "Sweet Baby Christos", "Red sauce, eggplant, garlic confit, herbs, peppers, feta and honey. Vegetarian; vegan without feta and honey.", ["gluten", "milk", "wheat"]],
    ["Pizza", "The Bird Reynolds", "Buffalo chicken, ranch, fontinella, iceberg, onion, pickles and dill.", ["egg", "gluten", "milk", "wheat"]],
    ["Pizza", "The Kelly Ruben", "Special sauce, pastrami, Swiss, Gruyere, sauerkraut, pickled mustard seeds and caraway.", ["egg", "gluten", "milk", "mustard", "wheat"]],
    ["Pizza", "Veggie Supreme", "Red sauce, 50/50 cheese, garlic, onions, mushrooms, kale, olives and banana peppers.", ["gluten", "milk", "wheat"]],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "boogy-and-peel-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Boogy & Peel official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createChikoOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/chiko-dupont";
  const alternateSourceUrl = "https://order.toasttab.com/online/chiko-washington";
  const sourceSummary =
    "CHIKO official Toast menu ingredient review: direct allergens come from official item names and menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["bulgogi-tots", "Chinese-Korean", "Bulgogi Tots", "ChiKo tots, bulgogi marinated beef, kimchi cheese, green onion.", ["milk"]],
    ["chiko-brussels-sprouts", "Chinese-Korean", "ChiKo Brussels Sprouts", "Fried brussels sprouts, gochujang aioli, furikake, crispy shallots.", ["egg"]],
    ["chiko-cumin-lamb-spice-blend", "Chinese-Korean", "ChiKo Cumin Lamb Spice Blend", "House toasted spice blend used in the Cumin Lamb Stir Fry.", []],
    ["chiko-hot-sauce", "Chinese-Korean", "ChiKo Hot Sauce", "2 oz ChiKo hot sauce; keep refrigerated.", []],
    ["chiko-pop", "Chinese-Korean", "ChiKo Pop", "Single chocolate-coated peanut butter pop with coconut, sesame, and sea salt.", ["peanut", "sesame", "tree-nut"]],
    ["chiko-pops-1pc", "Chinese-Korean", "ChiKo Pops (1pc)", "Chocolate-coated peanut butter pops with coconut, sesame, and sea salt.", ["peanut", "sesame", "tree-nut"]],
    ["chiko-salt", "Chinese-Korean", "ChiKo Salt", "House salt blend.", []],
    ["chilled-peanut-noodles", "Chinese-Korean", "Chilled Peanut Noodles", "Chili roasted peanuts, Asian pear, sesame chili oil, and cilantro.", ["gluten", "peanut", "sesame", "wheat"]],
    ["coconut-custard", "Chinese-Korean", "Coconut Custard", "Coconut custard, caramel, candied almonds, lime zest, and infused basil seeds.", ["egg", "milk", "tree-nut"]],
    ["confit-duck-fried-rice", "Chinese-Korean", "Confit Duck Fried Rice", "House hoisin and toasted sesame oil.", ["sesame", "soy"]],
    ["crispy-chicken-and-furikake-rice", "Chinese-Korean", "Crispy Chicken & Furikake Rice", "", []],
    ["crispy-chicken-and-tots", "Chinese-Korean", "Crispy Chicken & Tots", "", []],
    ["crispy-chicken-spring-rolls", "Chinese-Korean", "Crispy Chicken Spring Rolls", "Chinese hot mustard.", ["gluten", "mustard", "wheat"]],
    ["cumin-lamb-stir-fry", "Chinese-Korean", "Cumin Lamb Stir Fry", "Wheat flour noodles and caramelized shallots.", ["gluten", "wheat"]],
    ["dan-dan-noodles", "Chinese-Korean", "Dan Dan Noodles", "Chili roasted peanuts, Sichuan spiced beef and pork, sesame sauce, chili oil, and bok choy.", ["gluten", "peanut", "sesame", "wheat"]],
    ["double-fried-chicken-wings", "Chinese-Korean", "Double-Fried Chicken Wings", "Spicy soy glazed or dry spiced.", ["soy"]],
    ["full-monty", "Chinese-Korean", "Full Monty", "Napa cabbage kimchi, turmeric pickled daikon, Sichuan cucumbers, umami egg and smoked trout roe, chili garlic watermelon, and steamed rice with furikake butter.", ["egg", "fish", "milk"]],
    ["furikake-buttered-noodles", "Chinese-Korean", "Furikake Buttered Noodles", "Furikake buttered noodles.", ["gluten", "milk", "wheat"]],
    ["garlic-shrimp-dumpling", "Chinese-Korean", "Garlic Shrimp Dumpling", "Sweet dark soy and chili crunch. Five per order.", ["gluten", "shellfish", "soy", "wheat"]],
    ["garlic-shrimp-dumplings", "Chinese-Korean", "Garlic Shrimp Dumplings", "Sweet soy and chili crunch.", ["gluten", "shellfish", "soy", "wheat"]],
    ["gf-brisket-and-rice-cakes", "Chinese-Korean", "GF Brisket & Rice Cakes", "Smoked brisket, seasonal vegetables, shiitake mushrooms, and GF soy.", ["soy"]],
    ["gf-confit-duck-fried-rice", "Chinese-Korean", "GF Confit Duck Fried Rice", "Seasonal vegetables and toasted sesame oil.", ["sesame"]],
    ["gf-double-fried-chicken-wings", "Chinese-Korean", "GF Double-Fried Chicken Wings", "Dry spiced.", []],
    ["gf-half-a-cado-salad", "Chinese-Korean", "GF Half-a-cado Salad", "Gluten-free citrus vinaigrette, breakfast radish, and crunchy almond slivers.", ["tree-nut"]],
    ["gf-korean-garden-noodles", "Chinese-Korean", "GF Korean Garden Noodles", "Citrus, sweet potato noodles, and seasonal vegetables.", []],
    ["gf-napa-cabbage-kimchi", "Chinese-Korean", "GF Napa Cabbage Kimchi", "", []],
    ["gf-simply-steamed-or-stir-fried", "Chinese-Korean", "GF Simply Steamed or Stir Fried", "Bok choy, carrots, zucchini, and sesame oil. Choice of steamed or stir fried.", ["sesame"]],
    ["gf-steamed-rice-w-butter", "Chinese-Korean", "GF Steamed Rice w/ Butter", "Steamed rice with butter.", ["milk"]],
    ["gf-steamed-rice-w-furikake-butter", "Chinese-Korean", "GF Steamed Rice w/ Furikake Butter", "Steamed rice with furikake butter.", ["milk"]],
    ["gf-the-chicken-and-the-egg-fried-rice", "Chinese-Korean", "GF The Chicken & The Egg Fried Rice", "Confit chicken and bacon. Contains pork; can be made without bacon.", ["egg"]],
    ["gf-wok-blistered-green-beans", "Chinese-Korean", "GF Wok Blistered Green Beans", "Toasted sesame oil and crispy garlic.", ["sesame"]],
    ["half-a-cado-salad", "Chinese-Korean", "Half-a-Cado Salad", "Citrus soy, breakfast radish, and crunchy almond slivers.", ["soy", "tree-nut"]],
    ["iced-green-tea", "Chinese-Korean", "Iced Green Tea", "", []],
    ["iced-oolong-tea", "Chinese-Korean", "Iced Oolong Tea", "", []],
    ["jjajangmyeon", "Chinese-Korean", "Jjajangmyeon", "Shrimp, scallops, roasted black bean sauce, and noodles.", ["gluten", "shellfish", "soy", "wheat"]],
    ["korean-garden-noodles", "Chinese-Korean", "Korean Garden Noodles", "House ponzu, sweet potato noodles, and seasonal vegetables.", ["soy"]],
    ["napa-cabbage-kimchi", "Chinese-Korean", "Napa Cabbage Kimchi", "", []],
    ["orange-ish-chicken", "Chinese-Korean", "Orange-ish Chicken", "Candied mandarins, crispy garlic, CHIKO salt blend, and a side of steamed rice.", []],
    ["pork-and-kimchi-potsticker", "Chinese-Korean", "Pork and Kimchi Potsticker", "Sesame dipping sauce.", ["gluten", "sesame", "wheat"]],
    ["pork-and-kimchi-potstickers", "Chinese-Korean", "Pork and Kimchi Potstickers", "Sesame dipping sauce. Five per order.", ["gluten", "sesame", "wheat"]],
    ["side-of-hot-sauce", "Chinese-Korean", "Side of Hot Sauce", "", []],
    ["side-of-steamed-rice", "Chinese-Korean", "Side of Steamed Rice", "", []],
    ["side-soy-brined-egg", "Chinese-Korean", "Side Soy Brined Egg", "Soy brined egg.", ["egg", "soy"]],
    ["simply-steamed-or-stir-fried", "Chinese-Korean", "Simply Steamed or Stir Fried", "Bok choy, carrots, zucchini, and sesame oil. Choice of steamed or stir fried.", ["sesame"]],
    ["smashed-salmon", "Chinese-Korean", "Smashed Salmon", "Black bean butter, wild mushrooms, house ponzu, and side of steamed rice.", ["fish", "milk", "soy"]],
    ["soy-brined-egg", "Chinese-Korean", "Soy Brined Egg", "Soy brined egg.", ["egg", "soy"]],
    ["soy-glazed-brisket", "Chinese-Korean", "Soy Glazed Brisket", "2Fifty Texas BBQ brisket, soy brined soft egg, furikake butter, and rice.", ["egg", "milk", "soy"]],
    ["spicy-bulgogi-stir-fry", "Chinese-Korean", "Spicy Bulgogi Stir Fry", "Chewy rice cakes, gochujang, and shiitakes.", []],
    ["steamed-rice-w-furikake-butter", "Chinese-Korean", "Steamed Rice w/ Furikake Butter", "Steamed rice with furikake butter.", ["milk"]],
    ["stir-fried-spicy-rice-cakes", "Chinese-Korean", "Stir Fried Spicy Rice Cakes", "Chewy rice cakes, gochujang, and shiitakes.", []],
    ["the-chicken-the-egg-fried-rice", "Chinese-Korean", "The Chicken + The Egg Fried Rice", "Confit chicken and bacon. Contains pork; can be made without bacon.", ["egg"]],
    ["three-pepper-beef-stir-fry", "Chinese-Korean", "Three Pepper Beef Stir Fry", "Wok-velveted skirt steak, bell peppers, and jalapenos.", []],
    ["umami-egg-and-smoked-trout-roe", "Chinese-Korean", "Umami Egg & Smoked Trout Roe", "Umami egg and smoked trout roe.", ["egg", "fish"]],
    ["vegetable-fried-rice", "Chinese-Korean", "Vegetable Fried Rice", "Seasonal vegetables, crispy tempura mushrooms, and furikake.", ["gluten", "wheat"]],
    ["veggie-dumplings", "Chinese-Korean", "Veggie Dumplings", "Chili soy. Five per order.", ["gluten", "soy", "wheat"]],
    ["wing-bucket", "Chinese-Korean", "Wing Bucket", "Korean double-fried chicken wings with spicy soy glaze on the side.", ["soy"]],
    ["wok-blistered-green-beans", "Chinese-Korean", "Wok Blistered Green Beans", "Toasted sesame oil, crispy garlic, and roasted garlic ssamjang.", ["sesame", "soy"]],
    ["wok-charred-wheat-flour-noodles", "Chinese-Korean", "Wok Charred Wheat Flour Noodles", "Spicy noodles and caramelized shallots.", ["gluten", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "chiko-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed CHIKO official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl, alternateSourceUrl],
    }),
  );
}

function createMuncheezOfficialMenuRows() {
  const sourceUrl = "https://www.muncheezdc.com/menu";
  const toastSourceUrl = "https://order.toasttab.com/online/muncheez";
  const sourceSummary =
    "Muncheez official menu ingredient review: direct allergens come from official website and Toast menu item names and descriptions; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["adwani", "Sandwiches", "Adwani", "Chicken shawarma, French fries, garlic mayo, spicy red sauce, all wrapped in saj bread.", ["egg", "gluten", "wheat"]],
    ["authentic-zaatar", "Manakeesh", "Authentic Zaatar", "Fresh baked Lebanese flatbread with olive oil and zaatar.", ["gluten", "wheat"]],
    ["baba-ghannouj", "Sides", "Baba Ghannouj", "Roasted eggplant dip. Contains dairy.", ["milk"]],
    ["barbecue-chicken-pizza", "Pizza", "Barbecue Chicken Pizza", "Barbecue chicken pizza.", ["gluten", "milk", "wheat"]],
    ["beef-platter", "Platters", "Beef Platter", "Beef shawarma, rice, hummus, French fries, mixed green salad, pita, and tahini on the side.", ["gluten", "sesame", "wheat"]],
    ["beef-shawarma", "Sandwiches", "Beef Shawarma", "Beef shawarma, parsley, sumac, onions, tomatoes, mint, pickles, and tahini wrapped in saj bread.", ["gluten", "sesame", "wheat"]],
    ["build-your-own-bowl", "Bowls", "Build Your Own Bowl", "Fresh Lebanese bowl.", []],
    ["cauliflower-sandwich", "Sandwiches", "Cauliflower Sandwich", "Fried cauliflower, French fries, lettuce, tomatoes, and tahini wrapped in saj bread.", ["gluten", "sesame", "wheat"]],
    ["cheese", "Manakeesh", "Cheese", "Warm flatbread topped with melted cheese and sesame seeds.", ["gluten", "milk", "sesame", "wheat"]],
    ["chicken-and-cheese", "Sandwiches", "Chicken & Cheese", "Grilled chicken, melted mozzarella, lettuce, tomatoes, pickles, and garlic mayo rolled in soft flatbread.", ["egg", "gluten", "milk", "wheat"]],
    ["chicken-platter", "Platters", "Chicken Platter", "Chicken shawarma, rice, hummus, French fries, mixed green salad, pita, and garlic sauce on the side.", ["gluten", "wheat"]],
    ["chicken-shawarma", "Sandwiches", "Chicken Shawarma", "Chicken shawarma, garlic whip, French fries, and pickles wrapped in saj bread.", ["gluten", "wheat"]],
    ["curly-fries", "Sides", "Curly Fries", "", []],
    ["el-arabi-beef", "Platters", "El-Arabi Beef", "Beef shawarma with parsley, sumac, onions, tomatoes, mint, pickles, and tahini, wrapped in saj bread and served with hummus, French fries, mixed green salad, and tahini.", ["gluten", "sesame", "wheat"]],
    ["el-arabi-chicken", "Platters", "El-Arabi Chicken", "Chicken shawarma, French fries, and pickles wrapped in saj bread and served with hummus, extra fries, mixed green salad, and garlic whip.", ["gluten", "wheat"]],
    ["el-arabi-falafel", "Platters", "El-Arabi Falafel", "Falafel, tomatoes, pickled turnips, mint, lettuce, hummus, French fries, mixed green salad, and tahini wrapped in saj bread.", ["gluten", "sesame", "wheat"]],
    ["falafel-sandwich", "Sandwiches", "Falafel Sandwich", "Falafel, tomatoes, mint, pickled turnips, lettuce, and tahini wrapped in saj bread.", ["gluten", "sesame", "wheat"]],
    ["fattoush", "Salads", "Fattoush", "Mixed greens, tomatoes, onions, sumac, lemon, and pita chips.", ["gluten", "wheat"]],
    ["grape-leaves", "Sides", "Grape Leaves", "Vegetarian hand-rolled grape leaves stuffed with basmati rice, tomatoes, and parsley. Gluten free and vegan.", [], true],
    ["hummus", "Sides", "Hummus", "Mashed chickpea dip with tahini.", ["sesame"]],
    ["kibbeh", "Sides", "Kibbeh", "Fried beef dumplings with pine nuts and bourghol.", ["gluten", "tree-nut", "wheat"]],
    ["kinder", "Crepes", "Kinder", "German milk chocolate.", ["milk"]],
    ["kinder-crepe", "Crepes", "Kinder Crepe", "Soft crepe filled with melted Kinder bars and topped with powdered sugar.", ["egg", "gluten", "milk", "wheat"]],
    ["labne", "Sides", "Labne", "Strained yogurt dip sprinkled with dry thyme. Gluten free.", ["milk"]],
    ["lahmaajin", "Manakeesh", "Lahmaajin", "Open-faced flatbread topped with ground beef, diced tomatoes, onions, Lebanese spices, and lemon.", ["gluten", "wheat"]],
    ["lindt-white-chocolate", "Crepes", "Lindt White Chocolate", "Soft crepe filled with melted Lindt white chocolate and topped with powdered sugar.", ["egg", "gluten", "milk", "wheat"]],
    ["manakeesh", "Manakeesh", "Manakeesh", "All manakeesh contain gluten.", ["gluten", "wheat"]],
    ["manakeesh-labne", "Manakeesh", "Manakeesh Labne", "Flatbread with creamy labneh, cucumber, tomatoes, olives, and mint.", ["gluten", "milk", "wheat"]],
    ["margherita-pizza", "Pizza", "Margherita Pizza", "Margherita pizza.", ["gluten", "milk", "wheat"]],
    ["mini-falafel-half-dozen", "Sides", "Mini Falafel (Half Dozen)", "", []],
    ["mini-pizza", "Pizza", "Mini Pizza", "Tomato paste, mozzarella, olive, baked on flatbread.", ["gluten", "milk", "wheat"]],
    ["mini-pizza-half-dozen", "Pizza", "Mini Pizza (Half Dozen)", "Mini pizzas baked on flatbread.", ["gluten", "milk", "wheat"]],
    ["mix-kinder-and-nutella-crepe", "Crepes", "Mix Kinder & Nutella Crepe", "Soft crepe filled with melted Kinder chocolate and Nutella, topped with powdered sugar.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["mix-nutella-and-lindt-crepe", "Crepes", "Mix Nutella & Lindt Crepe", "Soft crepe filled with melted Nutella and Lindt white chocolate, topped with powdered sugar.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["mix-shawarma", "Sandwiches", "Mix Shawarma", "Beef and chicken shawarma, garlic sauce, parsley, sumac, onions, fries, pickles, tomatoes, and tahini wrapped in warm saj bread.", ["gluten", "sesame", "wheat"]],
    ["muncheez-cheesesteak", "Sandwiches", "Muncheez Cheesesteak", "Grilled beef, melted mozzarella, parsley, sumac, onions, and garlic mayo rolled in soft flatbread.", ["egg", "gluten", "milk", "wheat"]],
    ["nanas-original", "Manakeesh", "Nana's Original", "Wild thyme, olive oil, labneh, cucumbers, tomatoes, olives, and mint on soft flatbread.", ["gluten", "milk", "wheat"]],
    ["nutella", "Crepes", "Nutella", "Hazelnut spread.", ["milk", "tree-nut"]],
    ["nutella-crepe", "Crepes", "Nutella Crepe", "Soft crepe filled with warm Nutella and topped with powdered sugar.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["pita-bread-1-pc", "Sides", "Pita Bread 1 Pc", "Soft, fresh pita.", ["gluten", "wheat"]],
    ["pita-chips", "Toppings", "Pita Chips", "Pita chips.", ["gluten", "wheat"]],
    ["regular-fries", "Sides", "Regular Fries", "", []],
    ["rice-with-vermicelli", "Bases", "Rice with Vermicelli", "Rice with vermicelli.", ["gluten", "wheat"]],
    ["saj-bread-1-pc", "Sides", "SAJ Bread 1 Pc", "Soft, fresh flatbread.", ["gluten", "wheat"]],
    ["saloum", "Sandwiches", "Saloum", "Chicken, mozzarella, fries, ketchup, garlic mayo, and spicy sauce rolled in flatbread.", ["egg", "gluten", "milk", "wheat"]],
    ["shawarma-platter", "Platters", "Shawarma Platter", "Choice of chicken or beef shawarma, rice, hummus, French fries, mixed green salad, and pita.", ["gluten", "wheat"]],
    ["spinach-pie", "Sides", "Spinach Pie", "Spinach, pine nuts, caramelized onions, and sumac.", ["gluten", "tree-nut", "wheat"]],
    ["sugar-butter-and-cinnamon", "Crepes", "Sugar, Butter & Cinnamon", "Classic crepe brushed with butter, sugar, cinnamon, and powdered sugar.", ["egg", "gluten", "milk", "wheat"]],
    ["tabbouleh-salad", "Salads", "Tabbouleh Salad", "", ["gluten", "wheat"]],
    ["veggie-platter", "Platters", "Veggie Platter", "Falafel, mixed green salad, hummus, baba ghannouj, grape leaves, pita, and tahini.", ["gluten", "milk", "sesame", "wheat"]],
    ["yogurt-ayran", "Drinks", "Yogurt Ayran", "Yogurt ayran.", ["milk"]],
    ["yogurt-cucumber", "Sauces", "Yogurt Cucumber", "Yogurt cucumber sauce.", ["milk"]],
    ["yogurt-drink", "Drinks", "Yogurt Drink", "Yogurt drink.", ["milk"]],
    ["zaatar", "Manakeesh", "Zaatar", "Wild thyme, olive oil, tomatoes, cucumbers, olives, and mint rolled in soft flatbread.", ["gluten", "wheat"]],
    ["zaatar-and-cheese", "Manakeesh", "Zaatar & Cheese", "Flatbread topped with wild thyme, olive oil, and melted cheese.", ["gluten", "milk", "wheat"]],
    ["zaatar-fries", "Sides", "Zaatar Fries", "", []],
  ];

  return rows.map(([id, category, name, description, allergens, explicitFree]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length || explicitFree ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "muncheez-official-menu-review",
          sourceKind: allergens.length || explicitFree ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Muncheez official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl, toastSourceUrl],
    }),
  );
}

function createPeetsCoffeeOfficialMenuRows() {
  const sourceUrl = "https://www.peets.com/collections/all-menu-items";
  const menuSourceUrl = "https://www.peets.com/pages/menu";
  const sourceSummary =
    "Peet's Coffee official menu ingredient review: direct allergens come from official Peet's product names and visible product descriptions; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["americano", "Coffee", "Americano", "", []],
    ["baridi-cold-brew", "Coffee", "Baridi Cold Brew", "", []],
    ["espresso", "Coffee", "Espresso", "", []],
    ["traditional-cappuccino", "Coffee", "Traditional Cappuccino", "", ["milk"]],
    ["caffe-latte", "Coffee", "Caffe Latte", "", ["milk"]],
    ["vanilla-latte", "Coffee", "Vanilla Latte", "", ["milk"]],
    ["skinny-vanilla-latte", "Coffee", "Skinny Vanilla Latte", "", ["milk"]],
    ["caffe-macchiato", "Coffee", "Caffe Macchiato", "", ["milk"]],
    ["caramel-macchiato", "Coffee", "Caramel Macchiato", "", ["milk"]],
    ["caffe-mocha", "Coffee", "Caffe Mocha", "", ["milk"]],
    ["white-chocolate-mocha", "Coffee", "White Chocolate Mocha", "", ["milk"]],
    ["chai-latte", "Tea & Matcha", "Chai Latte", "", ["milk"]],
    ["matcha-green-tea-latte", "Tea & Matcha", "Matcha Green Tea Latte", "", ["milk"]],
    ["pumpkin-latte", "Coffee", "Pumpkin Latte", "", ["milk"]],
    ["iced-caffe-mocha", "Coffee", "Iced Caffe Mocha", "", ["milk"]],
    ["iced-caramel-macchiato", "Coffee", "Iced Caramel Macchiato", "", ["milk"]],
    ["iced-chai-latte", "Tea & Matcha", "Iced Chai Latte", "", ["milk"]],
    ["iced-golden-chai-latte", "Tea & Matcha", "Iced Golden Chai Latte", "", ["milk"]],
    ["iced-matcha-green-tea-latte", "Tea & Matcha", "Iced Matcha Green Tea Latte", "", ["milk"]],
    ["iced-pumpkin-latte", "Coffee", "Iced Pumpkin Latte", "", ["milk"]],
    ["iced-skinny-vanilla-latte", "Coffee", "Iced Skinny Vanilla Latte", "", ["milk"]],
    ["iced-white-chocolate-mocha", "Coffee", "Iced White Chocolate Mocha", "", ["milk"]],
    ["lavender-vanilla-latte", "Coffee", "Lavender Vanilla Latte", "", ["milk"]],
    ["iced-lavender-vanilla-latte", "Coffee", "Iced Lavender Vanilla Latte", "", ["milk"]],
    ["lavender-vanilla-matcha-latte", "Tea & Matcha", "Lavender Vanilla Matcha Latte", "", ["milk"]],
    ["iced-lavender-vanilla-matcha-latte", "Tea & Matcha", "Iced Lavender Vanilla Matcha Latte", "", ["milk"]],
    ["iced-lavender-vanilla-matcha-latte-with-popping-pearls", "Tea & Matcha", "Iced Lavender Vanilla Matcha Latte with Popping Pearls", "", ["milk"]],
    ["iced-rosy-matcha-latte", "Tea & Matcha", "Iced Rosy Matcha Latte", "", ["milk"]],
    ["iced-ube-matcha-latte-with-ube-dream-top", "Tea & Matcha", "Iced Ube Matcha Latte with Ube Dream Top", "", ["milk"]],
    ["iced-vanilla-latte-with-ube-dream-top", "Coffee", "Iced Vanilla Latte with Ube Dream Top", "", ["milk"]],
    ["vanilla-protein-latte", "Coffee", "Vanilla Protein Latte", "", ["milk"]],
    ["iced-vanilla-protein-latte", "Coffee", "Iced Vanilla Protein Latte", "", ["milk"]],
    ["golden-protein-latte", "Coffee", "Golden Protein Latte", "", ["milk"]],
    ["iced-golden-protein-latte", "Coffee", "Iced Golden Protein Latte", "", ["milk"]],
    ["matcha-protein-latte", "Tea & Matcha", "Matcha Protein Latte", "", ["milk"]],
    ["iced-matcha-protein-latte", "Tea & Matcha", "Iced Matcha Protein Latte", "", ["milk"]],
    ["protein-banana-cold-brew-oat-latte", "Coffee", "Protein Banana Cold Brew Oat Latte", "Oat milk blended and topped with Peet's original cold brew.", []],
    ["protein-banana-matcha-oat-latte", "Tea & Matcha", "Protein Banana Matcha Oat Latte", "Whey protein, banana puree, oat milk, and ceremonial-grade matcha. Contains milk.", ["milk"]],
    ["horchata-cold-brew-oat-latte", "Coffee", "Horchata Cold Brew Oat Latte", "Cold brew oat latte.", []],
    ["iced-brown-sugar-matcha-oat-latte-with-jelly", "Tea & Matcha", "Iced Brown Sugar Matcha Oat Latte with Jelly", "Matcha oat latte with brown sugar jelly.", []],
    ["iced-green-tea-lemonade", "Tea & Matcha", "Iced Green Tea Lemonade", "", []],
    ["iced-green-tea-tropical", "Tea & Matcha", "Iced Green Tea Tropical", "", []],
    ["iced-wild-berry-hibiscus-tea", "Tea & Matcha", "Iced Wild Berry Hibiscus Tea", "", []],
    ["mighty-leaf-loose-leaf-teas", "Tea & Matcha", "Mighty Leaf Loose Leaf Teas", "", []],
    ["berry-hibiscus-tea-shaker-with-brown-sugar-jelly", "Tea & Matcha", "Berry Hibiscus Tea Shaker with Brown Sugar Jelly", "", []],
    ["citrus-green-tea-shaker-with-brown-sugar-jelly", "Tea & Matcha", "Citrus Green Tea Shaker with Brown Sugar Jelly", "", []],
    ["citrus-hibiscus-tea-shaker", "Tea & Matcha", "Citrus Hibiscus Tea Shaker", "", []],
    ["citrus-hibiscus-tea-shaker-with-brown-sugar-jelly", "Tea & Matcha", "Citrus Hibiscus Tea Shaker with Brown Sugar Jelly", "", []],
    ["strawberry-lemon-tea-shaker-with-brown-sugar-jelly", "Tea & Matcha", "Strawberry Lemon Tea Shaker with Brown Sugar Jelly", "", []],
    ["tropical-berry-green-tea-shaker", "Tea & Matcha", "Tropical Berry Green Tea Shaker", "", []],
    ["tropical-berry-green-tea-shaker-with-brown-sugar-jelly", "Tea & Matcha", "Tropical Berry Green Tea Shaker with Brown Sugar Jelly", "", []],
    ["yuzu-citrus-black-tea-shaker", "Tea & Matcha", "Yuzu Citrus Black Tea Shaker", "", []],
    ["yuzu-citrus-black-tea-shaker-with-brown-sugar-jelly", "Tea & Matcha", "Yuzu Citrus Black Tea Shaker with Brown Sugar Jelly", "", []],
    ["sparkling-strawberry-energy", "Sparkling Energy", "Sparkling Strawberry Energy", "Strawberry puree, sparkling club soda, and plant-derived caffeine.", []],
    ["sparkling-watermelon-energy", "Sparkling Energy", "Sparkling Watermelon Energy", "Watermelon flavor, sparkling club soda, and plant-derived caffeine.", []],
    ["matcha-pineapple-burst", "Tea & Matcha", "Matcha Pineapple Burst", "", []],
    ["ultra-coffee-concentrate", "Coffee", "Ultra Coffee Concentrate", "", []],
    ["simply-oatmeal", "Food", "Simply Oatmeal", "", []],
    ["bacon-and-cheddar-brioche", "Food", "Bacon & Cheddar Brioche", "Bacon and cheddar on brioche.", ["egg", "gluten", "milk", "wheat"]],
    ["bacon-gouda-frittata", "Food", "Bacon Gouda Frittata", "Bacon and Gouda frittata.", ["egg", "milk"]],
    ["bacon-sausage-cheddar-crispy", "Food", "Bacon Sausage Cheddar Crispy", "Bacon, sausage, cheddar, and crispy bread.", ["egg", "gluten", "milk", "wheat"]],
    ["cheesy-sausage-slider", "Food", "Cheesy Sausage Slider", "Sausage slider with cheese.", ["gluten", "milk", "wheat"]],
    ["chicken-and-waffles-sandwich", "Food", "Chicken & Waffles Sandwich", "Chicken and waffles sandwich.", ["egg", "gluten", "milk", "wheat"]],
    ["chicken-chorizo-wrap", "Food", "Chicken Chorizo Wrap", "Chicken chorizo wrap.", ["gluten", "wheat"]],
    ["crispy-ham-and-swiss", "Food", "Crispy Ham & Swiss", "Crispy ham and Swiss sandwich.", ["gluten", "milk", "wheat"]],
    ["croissant-grilled-cheese", "Food", "Croissant Grilled Cheese", "Grilled cheese on a croissant.", ["egg", "gluten", "milk", "wheat"]],
    ["egg-and-cheese", "Food", "Egg & Cheese", "Egg and cheese sandwich.", ["egg", "gluten", "milk", "wheat"]],
    ["egg-white-tomato-and-feta-frittata", "Food", "Egg White, Tomato & Feta Frittata", "Egg white, tomato, and feta frittata.", ["egg", "milk"]],
    ["elote-taco", "Food", "Elote Taco", "Elote taco.", ["gluten", "milk", "wheat"]],
    ["everything-plant-based-sandwich", "Food", "Everything Plant-Based Sandwich", "Plant-based sandwich on bread.", ["gluten", "wheat"]],
    ["mediterranean-frittata-sandwich", "Food", "Mediterranean Frittata Sandwich", "Frittata sandwich.", ["egg", "gluten", "milk", "wheat"]],
    ["roasted-tomato-focaccia", "Food", "Roasted Tomato Focaccia", "Roasted tomato focaccia.", ["gluten", "wheat"]],
    ["roasted-turkey-parmesan-ciabatta", "Food", "Roasted Turkey Parmesan Ciabatta", "Roasted turkey, parmesan, and ciabatta.", ["gluten", "milk", "wheat"]],
    ["turkey-bacon-and-egg-white-sandwich", "Food", "Turkey Bacon & Egg White Sandwich", "Turkey bacon and egg white sandwich.", ["egg", "gluten", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "peets-coffee-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Peet's Coffee official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl, menuSourceUrl],
    }),
  );
}

function createTwoFiftyBbqOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/2fifty-bbq-washington-dc";
  const sourceSummary =
    "2Fifty Texas BBQ official Toast menu ingredient review: direct allergens come from official item names, ingredient descriptions, and explicit allergen-free statements; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["1-lb-smoked-prime-brisket-chilled", "Barbecue", "1 Lb. Smoked Prime Brisket (chilled)", "Chilled. Instructions are provided on how to reheat. Prime brisket from Creekstone Farms.", []],
    ["1-lb-smoked-pulled-pork-chilled", "Barbecue", "1 Lb. Smoked Pulled Pork (chilled)", "Chilled. Instructions are provided on how to reheat.", []],
    ["1-lb-wagyu-brisket-chilled", "Barbecue", "1 lb. Wagyu Brisket (chilled)", "American Wagyu brisket chilled, from Snake River Farms.", []],
    ["2-brisket-tamales", "Barbecue", "2 Brisket Tamales", "Corn masa, achiote recado, grilled vegetables, and chopped beef brisket wrapped in banana leaves.", []],
    ["2-chilled-brisket-tamales", "Barbecue", "2 Chilled Brisket Tamales", "Vacuum sealed; reheating instructions provided.", []],
    ["4-slices-of-texas-toast", "Barbecue", "4 Slices of Texas Toast", "Texas toast.", ["gluten", "wheat"]],
    ["6-whole-smoked-wings", "Barbecue", "6 Whole Smoked Wings", "", []],
    ["american-wagyu-brisket", "Barbecue", "American Wagyu Brisket", "Half a pound of Snake River Farms American Wagyu, seasoned with the restaurant's rub.", []],
    ["banana-pudding", "Barbecue", "Banana Pudding", "Creamy banana pudding made by the restaurant's pastry chef.", ["milk"]],
    ["beef-ribs", "Barbecue", "Beef Ribs", "Smoked low and slow; seasoned with the restaurant's signature rub.", []],
    ["beef-rub", "Barbecue", "Beef Rub", "Ingredients: salt, pepper, spices, paprika, dehydrated onion, corn starch, sugar, turmeric.", []],
    ["brisket-beans", "Barbecue", "Brisket Beans", "Red kidney beans with brisket trimmings, fried onions, green peppers, smoked feta, and jalapenos.", ["milk"]],
    ["brisket-burger-rosemary-chips", "Barbecue", "Brisket Burger + Rosemary Chips", "", ["gluten", "milk", "wheat"]],
    ["bun", "Barbecue", "Bun", "Lyon Bakery potato roll.", ["gluten", "wheat"]],
    ["chicken-leg-quarter", "Barbecue", "Chicken Leg Quarter", "Smoked leg and thigh jumbo chicken.", []],
    ["chicken-leg-quarters", "Barbecue", "Chicken Leg Quarters", "Skinless leg and thigh jumbo smoked chicken.", []],
    ["chimichurri-sauce", "Barbecue", "Chimichurri Sauce", "Contains walnuts, basil, chili flakes, olive oil, garlic, lemon, parmesan cheese, mustard seeds, salt, and pepper.", ["milk", "mustard", "tree-nut"]],
    ["chocolate-chip-cookie", "Barbecue", "Chocolate Chip Cookie", "Brown butter chocolate chip cookie.", ["egg", "gluten", "milk", "wheat"]],
    ["chopped-beef-sandwich", "Barbecue", "Chopped Beef Sandwich", "Toasted potato roll, pickles, sauce, chopped brisket, and coleslaw. Potato roll by Lyon.", ["egg", "gluten", "wheat"]],
    ["coleslaw", "Barbecue", "Coleslaw", "Mayo-based dressing with freshly sliced green and red cabbage.", ["egg"]],
    ["corn-bread", "Barbecue", "Corn bread", "Corn bread, sometimes described as corn cake, on the sweeter side.", ["egg", "gluten", "milk", "wheat"]],
    ["esquites-corn-salad", "Barbecue", "Esquites (Corn salad)", "Charred creamy corn with red onion and spices, topped with Mexican crema, queso fresco, cilantro, and Taquis Fuego.", ["milk"]],
    ["herby-potato-salad", "Barbecue", "Herby Potato Salad", "Very mustardy potato salad with chopped pickles and green onions.", ["mustard"]],
    ["hot-honey-pork-belly-burnt-ends", "Barbecue", "Hot Honey Pork Belly Burnt Ends", "", []],
    ["hot-honey-pork-belly-burnt-ends-12-lb", "Barbecue", "Hot Honey Pork Belly Burnt Ends 1/2 lb", "Pork belly caramelized with the restaurant's in-house hot honey.", []],
    ["jicama-salad", "Barbecue", "Jicama Salad", "Jicama, pineapple, cucumbers, spring greens, lime mint dressing, and house-grown micro greens.", []],
    ["key-lime-pie", "Barbecue", "Key Lime Pie", "Key lime pie with a tart filling.", ["egg", "gluten", "milk", "wheat"]],
    ["mac-n-cheese", "Barbecue", "Mac n Cheese", "Made from scratch with three cheeses.", ["gluten", "milk", "wheat"]],
    ["poblano-sausage", "Barbecue", "Poblano Sausage", "Beef sausage with poblanos, spices, and pork casing; no cheese.", []],
    ["poblano-sausage-link", "Barbecue", "Poblano Sausage Link", "Beef sausage link with poblanos, spices, and pork casing; no cheese.", []],
    ["pork-rub", "Barbecue", "Pork Rub", "Ingredients: salt, spices, paprika, sugar, corn starch, turmeric, dehydrated onion.", []],
    ["pork-spare-ribs", "Barbecue", "Pork Spare Ribs", "Pork spare ribs seasoned with spices and smoked.", []],
    ["prime-brisket", "Barbecue", "Prime Brisket", "Prime grade beef brisket from Creekstone Farms, smoked with oak wood.", []],
    ["prime-brisket-sandwich", "Barbecue", "Prime Brisket Sandwich", "Brisket sandwich with coleslaw, pickles, and onions on the side.", ["egg", "gluten", "wheat"]],
    ["pulled-lamb", "Barbecue", "Pulled Lamb", "Smoked lamb shoulder served with pickled radish and freshly made purple corn tortillas.", []],
    ["pulled-pork", "Barbecue", "Pulled Pork", "Pork shoulder seasoned with the restaurant's spice mix and smoked.", []],
    ["pulled-pork-sandwich", "Barbecue", "Pulled Pork Sandwich", "Pulled pork on a toasted brioche bun with pickles and coleslaw.", ["egg", "gluten", "milk", "wheat"]],
    ["rice-and-beans", "Barbecue", "Rice & Beans", "Caribbean-inspired rice and beans. Contains coconut. Vegetarian and gluten free.", ["tree-nut"]],
    ["rice-and-beans-tray", "Barbecue", "Rice & Beans Tray", "Caribbean-inspired coconut-infused rice with red kidney beans.", ["tree-nut"]],
    ["shiner-bock", "Barbecue", "Shiner Bock", "Texas beer with roasted barley, German hops, and caramel sweetness.", ["gluten"]],
    ["smoked-beef-tallow-jar", "Barbecue", "Smoked beef tallow jar", "", []],
    ["smoked-feta-cheese-block", "Barbecue", "Smoked Feta Cheese block", "Approximately one pound of smoked feta cheese.", ["milk"]],
    ["spicy-cheddar-sausage", "Barbecue", "Spicy Cheddar Sausage", "Beef and pork sausage with semi-melted cheddar cheese.", ["milk"]],
    ["spicy-cheddar-sausage-link", "Barbecue", "Spicy Cheddar Sausage Link", "Beef and pork sausage link with semi-melted cheddar cheese.", ["milk"]],
    ["texas-chili", "Barbecue", "Texas Chili", "In-house brisket chili; no beans.", []],
    ["tray-of-brisket-beans", "Barbecue", "Tray of Brisket Beans", "Tray of brisket beans.", ["milk"]],
    ["tray-of-coleslaw", "Barbecue", "Tray of Coleslaw", "Tray of mayo-based coleslaw.", ["egg"]],
    ["tray-of-esquites", "Barbecue", "Tray of Esquites", "Tray of creamy corn salad with crema and queso fresco.", ["milk"]],
    ["tray-of-herby-potato-salad", "Barbecue", "Tray of Herby Potato Salad", "Tray of very mustardy potato salad.", ["mustard"]],
    ["tray-of-jicama-salad", "Barbecue", "Tray of Jicama Salad", "Tray of jicama salad.", []],
    ["tray-of-mac-n-cheese", "Barbecue", "Tray of Mac n Cheese", "Tray of mac n cheese.", ["gluten", "milk", "wheat"]],
    ["tray-of-zesty-garden-mix", "Barbecue", "Tray of Zesty Garden Mix", "Watermelon radish, cherry tomatoes, cucumber, red onion, fresh herbs, and citrus. Vegan, gluten-free, nut-free, dairy-free, egg-free, soy-free, and sesame-free.", [], true],
    ["turkey", "Barbecue", "Turkey", "Natural boneless turkey breast.", []],
    ["turkey-breast", "Barbecue", "Turkey Breast", "Half a pound of 100% natural boneless turkey breast.", []],
    ["turkey-sandwich", "Barbecue", "Turkey Sandwich", "Turkey sandwich with coleslaw, pickles, and onions on the side.", ["egg", "gluten", "wheat"]],
    ["wagyu-brisket-sandwich", "Barbecue", "Wagyu Brisket Sandwich", "Wagyu brisket sandwich with two sides.", ["gluten", "wheat"]],
    ["whole-chilled-prime-brisket", "Barbecue", "Whole Chilled Prime Brisket", "Prime brisket seasoned with salt and pepper only, smoked with oak wood, packed and chilled.", []],
    ["whole-chilled-wagyu-brisket", "Barbecue", "Whole Chilled Wagyu Brisket", "Gold Label American Wagyu brisket, gluten free, seasoned with salt and pepper only, smoked with oak wood, packed and chilled.", [], true],
    ["whole-hog", "Barbecue", "Whole Hog", "Suckling pig smoked over coals.", []],
    ["whole-hog-sandwich", "Barbecue", "Whole Hog Sandwich", "Whole hog sandwich topped with coleslaw and barbecue sauce.", ["egg", "gluten", "wheat"]],
    ["whole-smoked-chicken-vacuum-packed", "Barbecue", "Whole Smoked Chicken, Vacuum packed", "Whole smoked chicken with reheating instructions.", []],
    ["whole-wagyu-brisket-warm", "Barbecue", "Whole Wagyu Brisket (warm)", "Gold Label American Wagyu brisket, gluten free, seasoned with salt and pepper only, smoked with oak wood.", [], true],
    ["zesty-garden-mix", "Barbecue", "Zesty Garden Mix", "Watermelon radish, cherry tomatoes, cucumber, red onion, fresh herbs, and citrus. Allergen Info: Vegan | Gluten-Free | Nut-Free | Dairy-Free | Egg-Free | Soy-Free | Sesame-Free.", [], true],
  ];

  return rows.map(([id, category, name, description, allergens, explicitFree]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length || explicitFree ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "two-fifty-bbq-official-toast-menu-review",
          sourceKind: allergens.length || explicitFree ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed 2Fifty Texas BBQ official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createBonFrescoOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/bon-fresco-rockville";
  const sourceSummary =
    "bon fresco official Toast menu ingredient review: direct allergens come from official item names and menu description text; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["Sauces", "Basil Pesto *n", "Basil pesto marked with the restaurant's nut notation.", ["tree-nut"]],
    ["Sandwiches", "BLT", "Applewood smoked bacon, dijonnaise, vine-ripened tomato and mixed greens.", ["egg"]],
    ["Sandwiches", "Brie Cheese", "Brie cheese, sun-dried tomato pesto, caramelized onions and baguette. Oven-warmed; vegetarian.", ["gluten", "milk", "wheat"]],
    ["Sides", "Broccoli Salad", "", []],
    ["Salads", "Build a 1 Topping Salad", "Mixed greens, ciabatta roll and choice dressing on side.", ["gluten", "wheat"]],
    ["Salads", "Build a 4 Topping Salad", "Mixed greens, ciabatta roll and choice dressing on side.", ["gluten", "wheat"]],
    ["Salads", "Caesar Salad", "Romaine, parmesan, croutons, ciabatta roll and Caesar dressing on side.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["Sandwiches", "Capri Italian", "Prosciutto, Genoa salami, capicola, provolone, mixed greens, onions, roasted red peppers, banana peppers, oil and vinegar, ciabatta.", ["gluten", "milk", "wheat"]],
    ["Sides", "Chicken Tender: A La Carte", "", ["gluten", "wheat"]],
    ["Sides", "Chips", "Kettle Classics Original.", []],
    ["Desserts", "Chocolate Chip Cookie", "", ["egg", "gluten", "milk", "wheat"]],
    ["Sandwiches", "Corned Beef", "Lean corned beef brisket, Dijon mustard, Swiss cheese and ciabatta. Oven-warmed.", ["gluten", "milk", "mustard", "wheat"]],
    ["Sandwiches", "Curry Chicken Salad", "Curry chicken salad with red peppers, green peppers, raisins, apples and ciabatta.", ["egg", "gluten", "wheat"]],
    ["Sides", "Curry Chicken Salad Side", "", ["egg"]],
    ["Sandwiches", "Grilled Cheese", "Provolone and ciabatta. Oven-warmed; vegetarian.", ["gluten", "milk", "wheat"]],
    ["Sandwiches", "Grilled Veggie", "Grilled zucchini, roasted red peppers, olive tapenade and baguette. Oven-warmed; vegan.", ["gluten", "wheat"]],
    ["Sandwiches", "Ham & Swiss", "Imported ham, Dijon mustard, Swiss cheese, mixed greens and baguette. Oven-warmed.", ["gluten", "milk", "mustard", "wheat"]],
    ["Sides", "Hummus", "", ["sesame"]],
    ["Sandwiches", "Kalamata Chicken", "Grilled chicken breast, olive tapenade, fresh mozzarella, grilled veggies and ciabatta.", ["gluten", "milk", "wheat"]],
    ["Sides", "Lentils & Feta", "", ["milk"]],
    ["Sandwiches", "London Broil", "Charbroiled medium-rare steak, dijonnaise, provolone, mixed greens, onions and ciabatta. Oven-warmed.", ["egg", "gluten", "milk", "wheat"]],
    ["Salads", "Mediterranean Salad", "Choose a protein and a topping; hummus, mozzarella ciliegine, mixed greens, mini ciabatta roll and dressing on side.", ["gluten", "milk", "sesame", "wheat"]],
    ["Mini Sandwiches", "Mini Corned Beef", "", ["gluten", "milk", "mustard", "wheat"]],
    ["Mini Sandwiches", "Mini Curry Chicken Salad", "Curry chicken salad with red peppers, green peppers, raisins, apples and baby ciabatta.", ["egg", "gluten", "wheat"]],
    ["Mini Sandwiches", "Mini Grilled Veggie", "Grilled zucchini, roasted red peppers, olive tapenade and baby ciabatta. Oven-warmed; vegan.", ["gluten", "wheat"]],
    ["Mini Sandwiches", "Mini Ham & Swiss", "Imported ham, Dijon mustard, Swiss cheese, mixed greens and baby ciabatta. Oven-warmed.", ["gluten", "milk", "mustard", "wheat"]],
    ["Mini Sandwiches", "Mini London Broil", "Charbroiled medium-rare steak, dijonnaise, provolone, mixed greens, onions and baby ciabatta. Oven-warmed.", ["egg", "gluten", "milk", "wheat"]],
    ["Mini Sandwiches", "Mini Mozzarella & Tomato", "Fresh mozzarella, vine-ripened tomato, basil pesto, salt and pepper, baby ciabatta. Vegetarian; contains nuts.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Mini Sandwiches", "Mini Pastrami", "Pastrami, Russian dressing, Swiss, coleslaw and ciabatta. Oven-warmed.", ["egg", "gluten", "milk", "wheat"]],
    ["Mini Sandwiches", "Mini Picante Chicken", "Grilled chicken breast, picante sauce, pepper jack cheese, grilled veggies, caramelized onions, roasted red peppers and baby ciabatta. Oven-warmed.", ["gluten", "milk", "wheat"]],
    ["Mini Sandwiches", "Mini Picante Fresco", "Grilled zucchini, pepper jack cheese, picante sauce, roasted red peppers and baby ciabatta. Oven-warmed; vegetarian.", ["gluten", "milk", "wheat"]],
    ["Mini Sandwiches", "Mini Tomato-Pesto Chicken", "Grilled chicken breast, sun-dried tomato pesto, caramelized onions and baby ciabatta. Oven-warmed.", ["gluten", "wheat"]],
    ["Mini Sandwiches", "Mini Tuna Salad", "Yogurt-based tuna salad, mixed greens, roasted red peppers and baby ciabatta.", ["fish", "gluten", "milk", "wheat"]],
    ["Salads", "Mixed Green Salad", "Mixed greens, ciabatta roll and house dressing on side.", ["gluten", "wheat"]],
    ["Sandwiches", "Mozzarella & Tomato", "Fresh mozzarella, vine-ripened tomato, basil pesto, salt and pepper, ciabatta. Vegetarian; contains nuts.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["Desserts", "Oatmeal Raisin Cookie", "", ["egg", "gluten", "milk", "wheat"]],
    ["Sandwiches", "Pastrami", "Pastrami, Russian dressing, Swiss, coleslaw and ciabatta. Oven-warmed.", ["egg", "gluten", "milk", "wheat"]],
    ["Sandwiches", "Picante Chicken", "Grilled chicken breast, picante sauce, pepper jack cheese, grilled veggies, caramelized onions, roasted red peppers and ciabatta. Oven-warmed.", ["gluten", "milk", "wheat"]],
    ["Salads", "Picante Chicken Salad", "Mixed greens, grilled chicken breast, grilled veggies, caramelized onions, roasted red peppers, parmesan and picante sauce on side.", ["milk"]],
    ["Sandwiches", "Picante Fresco", "Grilled zucchini, picante sauce, pepper jack cheese, roasted red peppers and ciabatta. Oven-warmed; vegetarian.", ["gluten", "milk", "wheat"]],
    ["Sandwiches", "Picante Italian", "Soppressata, capicola, picante sauce, pepper jack cheese, roasted red peppers and ciabatta. Oven-warmed.", ["gluten", "milk", "wheat"]],
    ["Sauces", "Picante Sauce", "", []],
    ["Sandwiches", "Picante Turkey", "Roasted turkey breast, picante sauce, pepper jack cheese, grilled veggies and ciabatta. Oven-warmed.", ["gluten", "milk", "wheat"]],
    ["Sides", "Potato Salad", "", ["egg"]],
    ["Sandwiches", "Prosciutto", "Fresh mozzarella, balsamic vinaigrette, roasted red peppers and ciabatta.", ["gluten", "milk", "wheat"]],
    ["Sandwiches", "Roasted Turkey", "Turkey breast, dijonnaise, provolone, roasted red peppers, mixed greens and ciabatta.", ["egg", "gluten", "milk", "wheat"]],
    ["Sandwiches", "Tomato Mozz & Pesto", "Contains nuts.", ["milk", "tree-nut"]],
    ["Sauces", "Tomato Pesto", "", ["tree-nut"]],
    ["Sandwiches", "Tomato-Pesto Chicken", "Grilled chicken breast, sun-dried tomato pesto, caramelized onions and baguette. Oven-warmed.", ["gluten", "wheat"]],
    ["Sandwiches", "Tuna Salad Sandwich", "Yogurt-based tuna salad, mixed greens, roasted red peppers and ciabatta.", ["fish", "gluten", "milk", "wheat"]],
    ["Sides", "Tuna Salad Side", "", ["fish", "milk"]],
  ];

  return rows.map(([category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "bon-fresco-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed bon fresco official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createSonnysPizzaOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/sonnys-pizza-dc";
  const sourceSummary =
    "Sonny's Pizza official Toast menu ingredient review: direct allergens come from official item names, menu descriptions, and explicit contains notes; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["arugula-and-chili-oil-slice", "Pizza", "Arugula & Chili Oil Slice", "Tomato, mozzarella, arugula, and chili oil.", ["gluten", "milk", "wheat"]],
    ["caesar-salad", "Pizza", "Caesar Salad", "Escarole, Caesar dressing, grana, and croutons. Contains eggs, fish, gluten, milk, and sesame.", ["egg", "fish", "gluten", "milk", "sesame", "wheat"]],
    ["cheese", "Pizza", "Cheese", "Whole pie with tomato, mozzarella, and basil.", ["gluten", "milk", "wheat"]],
    ["cheese-slice", "Pizza", "Cheese Slice", "Tomato, mozzarella, and basil.", ["gluten", "milk", "wheat"]],
    ["chicken-parm", "Pizza", "Chicken Parm", "Chicken, mozzarella, tomato sauce, and basil. Served with house-made sesame focaccia. Contains eggs, milk, gluten, and sesame.", ["egg", "gluten", "milk", "sesame", "wheat"]],
    ["custom-half-and-half-pie", "Pizza", "Custom Half & Half Pie", "Choose your own adventure. Start with either a tomato pie or tomato and mozzarella and add toppings.", ["gluten", "wheat"]],
    ["custom-tomato-half-and-half-pie-no-cheese", "Pizza", "Custom Tomato Half & Half Pie *No Cheese", "Tomato pie with no cheese for a vegan, dairy-free option; customize toppings on each half.", ["gluten", "wheat"]],
    ["custom-whole-pie", "Pizza", "Custom Whole Pie", "Start with a tomato and mozzarella pie and add toppings.", ["gluten", "milk", "wheat"]],
    ["deuce-court", "Pizza", "Deuce Court", "Roasted red peppers, fresh mozzarella, arugula, basil, and balsamic vinaigrette on sesame focaccia.", ["gluten", "milk", "sesame", "wheat"]],
    ["eggplant-parm", "Pizza", "Eggplant Parm", "Fried eggplant, mozzarella, tomato sauce, and basil. Served with house-made sesame focaccia. Contains milk, eggs, sesame, and gluten.", ["egg", "gluten", "milk", "sesame", "wheat"]],
    ["farro-salad", "Pizza", "Farro Salad", "Farro, green olives, slow-roasted tomatoes, golden raisins, radishes, dill, parsley, and honey-lemon dressing.", ["gluten", "wheat"]],
    ["gluten-free-cheese-pie", "Pizza", "Gluten Free Cheese Pie", "Personal pie with tomato, mozzarella, and basil.", ["milk"]],
    ["gluten-free-pesky-mario", "Pizza", "Gluten Free Pesky Mario", "Personal pie with tomato, mozzarella, mushrooms, rapini, and Calabrian chili.", ["milk"]],
    ["gluten-free-pizza-don", "Pizza", "Gluten Free Pizza Don", "Personal pie with tomato, mozzarella, salami, arugula, and fresh oregano.", ["milk"]],
    ["gluten-free-tomato-pie", "Pizza", "Gluten Free Tomato Pie", "Personal pie with tomato, garlic, and basil.", []],
    ["gluten-free-wolfie", "Pizza", "Gluten Free Wolfie", "Personal pie with tomato, mozzarella, pepperoni, onion, and roasted peppers.", ["milk"]],
    ["long-shot", "Pizza", "Long Shot", "Ham, soppressata, provolone, pickled onion, Calabrian chili butter, escarole, and Italian vinaigrette on sesame focaccia.", ["gluten", "milk", "sesame", "wheat"]],
    ["meatballs-and-ricotta", "Pizza", "Meatballs & Ricotta", "Beef and pork meatballs with tomato sauce, grana, and ricotta. Served with house-made sesame focaccia. Contains gluten, eggs, sesame, and milk.", ["egg", "gluten", "milk", "sesame", "wheat"]],
    ["mixed-greens-salad", "Pizza", "Mixed Greens Salad", "Arugula, radicchio, watermelon radish, and Italian vinaigrette.", []],
    ["mushroom-slice", "Pizza", "Mushroom Slice", "Tomato, mozzarella, roasted cremini and portobello mushrooms, and thyme.", ["gluten", "milk", "wheat"]],
    ["pepperoni-slice", "Pizza", "Pepperoni Slice", "Tomato, mozzarella, and pepperoni.", ["gluten", "milk", "wheat"]],
    ["peppers-and-mozz-salad", "Pizza", "Peppers & Mozz Salad", "Arugula, fresh mozzarella, roasted red peppers, and balsamic vinaigrette. Served with house-made sesame focaccia.", ["gluten", "milk", "sesame", "wheat"]],
    ["pesky-mario", "Pizza", "Pesky Mario", "Whole pie with tomato, mozzarella, mushrooms, rapini, and Calabrian chilis.", ["gluten", "milk", "wheat"]],
    ["pizza-don", "Pizza", "Pizza Don", "Whole pie with tomato, mozzarella, salami, arugula, and fresh oregano.", ["gluten", "milk", "wheat"]],
    ["tomato-pie-no-cheese", "Pizza", "Tomato Pie *No Cheese", "Tomato pie with no cheese for a vegan, dairy-free option.", ["gluten", "wheat"]],
    ["tomato-pies", "Pizza", "Tomato Pies", "Tomato pie with no cheese for a vegan, dairy-free option.", ["gluten", "wheat"]],
    ["wolfie", "Pizza", "Wolfie", "Tomato, mozzarella, pepperoni, onion, and roasted red peppers.", ["gluten", "milk", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "sonnys-pizza-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Sonny's Pizza official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createZinniaOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/zinnia";
  const sourceSummary =
    "Zinnia official Toast menu ingredient review: direct allergens come from official item names, menu descriptions, and explicit contains notes; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["applewood-smoked-bacon-blt", "American", "Applewood Smoked Bacon B.L.T", "North Country bacon, local heirloom tomatoes, bibb lettuce, and multigrain.", ["gluten", "wheat"]],
    ["baby-gold-and-ruby-beet-salad", "American", "Baby Gold and Ruby Beet Salad", "Lemon ricotta, wildflower honey vinaigrette, arugula, crispy shallots, and salted pistachios.", ["milk", "tree-nut"]],
    ["baked-mac-and-cheese", "American", "Baked Mac & Cheese", "White cheddar mornay, cavatappi noodles, and parmesan bread crumbs.", ["gluten", "milk", "wheat"]],
    ["bbq-gulf-shrimp-and-lobster", "American", "BBQ Gulf Shrimp and Lobster", "Heirloom grits, shishito peppers, and fresh tomato.", ["shellfish"]],
    ["bentons-country-ham-and-drop-biscuits", "American", "Benton's Country Ham & Drop Biscuits", "Cheddar drop biscuits, B&B pickles, pimento cheese, and hot honey.", ["gluten", "milk", "wheat"]],
    ["blackened-catfish", "American", "Blackened Catfish", "Crawfish etouffee sauce, buttered rice, and scallions.", ["fish", "milk", "shellfish"]],
    ["bread-basket", "American", "Bread Basket", "House-made parker house rolls.", ["gluten", "wheat"]],
    ["brie-and-prosciutto", "American", "Brie & Prosciutto", "Fig jam, baby arugula, and ciabatta.", ["gluten", "milk", "wheat"]],
    ["burrata", "American", "Burrata", "English pea puree, Calabrian chili mint, olive oil, and sea salt. Vegetarian.", ["milk"]],
    ["buttered-noodles", "American", "Buttered Noodles", "Buttered noodles.", ["gluten", "milk", "wheat"]],
    ["cavatelli-pasta", "American", "Cavatelli Pasta", "Cavatelli pasta.", ["gluten", "wheat"]],
    ["chicken-fingers", "American", "Chicken Fingers", "Served with fruit or fries.", ["gluten", "wheat"]],
    ["colesville-cobb-salad", "American", "Colesville Cobb Salad", "Bibb and spinach, bacon lardons, chopped egg, hothouse tomato, Israeli couscous, and herb-goat cheese ranch.", ["egg", "gluten", "milk", "wheat"]],
    ["collard-greens", "American", "Collard Greens", "", []],
    ["crispy-tofu", "American", "Crispy Tofu", "Crispy soy-marinated tofu on top of vegan Hoppin' John beans and dirty rice.", ["soy"]],
    ["fried-green-tomatoes", "American", "Fried Green Tomatoes", "Remoulade and pickled vegetables.", ["egg", "gluten", "wheat"]],
    ["green-goddess-chicken-salad-sandwich", "American", "Green Goddess Chicken Salad Sandwich", "Pulled chicken breast, romaine, avocado, on multigrain bread.", ["gluten", "wheat"]],
    ["grilled-cheese", "American", "Grilled Cheese", "Served with fruit or fries.", ["gluten", "milk", "wheat"]],
    ["gulf-shrimp-po-boy", "American", "Gulf Shrimp Po' Boy", "Gulf shrimp, romaine, shaved onion, bread and butter pickles, and remoulade.", ["egg", "gluten", "shellfish", "wheat"]],
    ["ham-and-cheese-sandwich", "American", "Ham and Cheese Sandwich", "Served with fruit or fries.", ["gluten", "milk", "wheat"]],
    ["hazelnut-crunch-bar", "American", "Hazelnut Crunch Bar", "Chocolate brownie, dulce de leche, and hazelnut chocolate ganache.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["kids-pizza", "American", "Kid's Pizza", "Kid's pizza.", ["gluten", "milk", "wheat"]],
    ["mac-and-cheese", "American", "Mac and Cheese", "Served with fruit or fries.", ["gluten", "milk", "wheat"]],
    ["mediterranean-bowl", "American", "Mediterranean Bowl", "Quinoa, Little Sesame hummus, cucumbers, red peppers, grape tomatoes, feta, arugula, spinach, olives, and champagne vinaigrette. Vegetarian and gluten-free.", ["milk", "sesame"]],
    ["mixed-field-greens-salad", "American", "Mixed Field Greens Salad", "Endive, hazelnuts, carrot, and hazelnut vinaigrette. Vegan and gluten-free.", ["tree-nut"]],
    ["pan-roasted-atlantic-salmon", "American", "Pan Roasted Atlantic Salmon", "Baby carrots, English peas, cherry tomatoes, parmesan polenta, and lemon-dill butter. Gluten-free.", ["fish", "milk"]],
    ["pasta-marinara", "American", "Pasta Marinara", "Served with fruit or fries.", ["gluten", "wheat"]],
    ["pimento-cheese-dip", "American", "Pimento Cheese Dip", "Smoked paprika, aged cheddar, scallions, and brioche croutons. Vegetarian. Contains dairy and gluten from bread.", ["gluten", "milk", "wheat"]],
    ["polenta", "American", "Polenta", "Olive oil, parmesan, and chives.", ["milk"]],
    ["pork-shoulder", "American", "Pork Shoulder", "Black eyed peas, collard greens, smoked ham hock jus. Gluten-free.", []],
    ["rice", "American", "Rice", "", []],
    ["sauteed-asparagus", "American", "Sauteed Asparagus", "Garlic, olive oil, and cherry tomatoes.", []],
    ["seafood-chowder", "American", "Seafood Chowder", "Scallops, blue crab, shrimp, smoked bacon, sherry, and salt and pepper crackers. Contains flour, dairy, and shellfish.", ["gluten", "milk", "shellfish", "wheat"]],
    ["smoked-pulled-pork-sandwich", "American", "Smoked Pulled Pork Sandwich", "Pulled pork smoked in house, mixed with sweet and tangy BBQ sauce, topped with coleslaw on a brioche bun.", ["egg", "gluten", "milk", "wheat"]],
    ["smoked-rainbow-trout-tartine", "American", "Smoked Rainbow Trout Tartine", "Horseradish cream cheese, crushed walnuts, caper persillade, and sourdough. Contains dairy, nuts, and gluten from bread.", ["fish", "gluten", "milk", "tree-nut", "wheat"]],
    ["spiced-cauliflower", "American", "Spiced Cauliflower", "Smoked paprika, lemon, and parmesan. Gluten-free and vegetarian.", ["milk"]],
    ["tiny-herb-dumplings", "American", "Tiny Herb Dumplings", "Shiitake mushrooms, parmesan soubise, and egg yolk.", ["egg", "gluten", "milk", "wheat"]],
    ["tollhouse-caesar", "American", "Tollhouse Caesar", "Little gem and garden greens, focaccia croutons, and freshly grated parmesan.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["whipped-potatoes", "American", "Whipped Potatoes", "", []],
    ["zinnia-burger", "American", "Zinnia Burger", "House blend, American cheese, lettuce, tomato, and herb aioli. Served with hand-cut fries.", ["egg", "gluten", "milk", "wheat"]],
    ["zinnias-fried-chicken", "American", "Zinnia's Fried Chicken", "Sweet cornbread, collard greens, herb ranch, and hot honey.", ["egg", "gluten", "milk", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "zinnia-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Zinnia official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createKWingsOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/k-wings";
  const sourceSummary =
    "K-Wings official Toast menu ingredient review: direct allergens come from official item names and menu descriptions; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["bbq-sauce-2oz", "Chicken", "+BBQ Sauce (2oz)", "", []],
    ["buffalo-sauce-2oz", "Chicken", "+Buffalo Sauce (2oz)", "", []],
    ["gyoza-sauce-2oz", "Chicken", "+Gyoza Sauce (2oz)", "", []],
    ["house-salad-dressing-2oz", "Chicken", "+House Salad Dressing (2oz)", "", []],
    ["soy-garlic-sauce-2oz", "Chicken", "+Soy Garlic Sauce (2oz)", "", ["soy"]],
    ["sweetandspicy-sauce-2oz", "Chicken", "+Sweet&Spicy Sauce (2oz)", "", []],
    ["takoyaki-sauce-2oz", "Chicken", "+Takoyaki Sauce (2oz)", "", []],
    ["tempura-sauce-2oz", "Chicken", "+Tempura Sauce (2oz)", "", []],
    ["10oz-boneless-s", "Chicken", "10oz Boneless (S)", "Lightly battered chicken breast tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["12pcs-drumsticks-l", "Chicken", "12pcs Drumsticks (L)", "Lightly battered drumsticks tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["16pcs-wings-bone-in-m", "Chicken", "16pcs Wings (Bone-In) (M)", "Lightly battered bone-in wings tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["20oz-boneless-m", "Chicken", "20oz Boneless (M)", "Lightly battered chicken breast tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["24pcs-wings-bone-in-l", "Chicken", "24pcs Wings (Bone-In) (L)", "Lightly battered bone-in wings tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["30oz-boneless-l", "Chicken", "30oz Boneless (L)", "Lightly battered chicken breast tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["4pcs-drumsticks-s", "Chicken", "4pcs Drumsticks (S)", "Lightly battered drumsticks tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["8pcs-drumsticks-m", "Chicken", "8pcs Drumsticks (M)", "Lightly battered drumsticks tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["8pcs-wings-bone-in-s", "Chicken", "8pcs Wings (Bone-In) (S)", "Lightly battered bone-in wings tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["agedashi-tofu", "Chicken", "Agedashi Tofu", "Fried tofu covered in housemade tempura sauce. Topped with bonito flakes and dried seaweed flakes.", ["fish", "gluten", "soy", "wheat"]],
    ["beef-bulgogi-korean-bqq-beef-bowl", "Chicken", "Beef Bulgogi (Korean BBQ Beef Bowl)", "Beef bulgogi Korean BBQ beef bowl.", ["sesame"]],
    ["cabbage-salad", "Chicken", "Cabbage Salad", "Fresh cabbage salad served with house salad dressing.", []],
    ["combo-10-wings-4-drumsticks-m", "Chicken", "Combo (10 Wings + 4 Drumsticks) (M)", "Lightly battered bone-in wings and drumsticks tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["combo-14-wings-6-drumsticks-l", "Chicken", "Combo (14 Wings + 6 Drumsticks) (L)", "Lightly battered bone-in wings and drumsticks tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["combo-6-wings-2-drumsticks-s", "Chicken", "Combo (6 Wings + 2 Drumsticks) (S)", "Lightly battered bone-in wings and drumsticks tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["combo-wingsdrumsticks", "Chicken", "Combo (Wings+Drumsticks)", "Lightly battered bone-in wings and drumsticks tossed in your choice of housemade sauce. Served with pickled radish and cabbage salad.", ["gluten", "wheat"]],
    ["edamame", "Chicken", "Edamame", "Steamed immature soybean topped with sea salt.", ["soy"]],
    ["fire-fries", "Chicken", "Fire Fries", "French fries topped with mozzarella cheese, fire sauce, and parsley flakes.", ["milk"]],
    ["fire-noodles", "Chicken", "Fire Noodles", "Stir-fried ramen with spicy fire sauce. Served with cabbage and fried egg.", ["egg", "gluten", "wheat"]],
    ["french-fries", "Chicken", "French Fries", "French fries tossed with housemade fry seasoning.", []],
    ["fried-calamari", "Chicken", "Fried Calamari", "Battered and deep-fried squid served with housemade spicy mayo sauce.", ["egg", "gluten", "shellfish", "wheat"]],
    ["gyoza", "Chicken", "Gyoza", "Chicken and veggie stuffed gyoza dumplings served with housemade gyoza sauce.", ["gluten", "wheat"]],
    ["house-chicken-salad", "Chicken", "House Chicken Salad", "Boneless chicken, spring mix, carrot, cabbage, cherry tomato, and white onion. Served with house salad dressing.", []],
    ["house-garlic-fried-rice", "Chicken", "House Garlic Fried Rice", "Fried garlic, egg, white onion, and green onion stir-fried with steamed rice.", ["egg"]],
    ["k1-set-wingsrice", "Chicken", "K1 Set (Wings+Rice)", "Wings or boneless chicken served with steamed rice, cabbage salad, pickled radish, and kimchi.", ["gluten", "wheat"]],
    ["k2-set-wingsfries", "Chicken", "K2 Set (Wings+Fries)", "Wings or boneless chicken served with french fries.", ["gluten", "wheat"]],
    ["k3-set-drumsrice", "Chicken", "K3 Set (Drums+Rice)", "Drumsticks served with steamed rice, cabbage salad, pickled radish, and kimchi.", ["gluten", "wheat"]],
    ["k4-set-drumsfries", "Chicken", "K4 Set (Drums+Fries)", "Drumsticks served with french fries.", ["gluten", "wheat"]],
    ["kimchi-12oz", "Chicken", "Kimchi (12oz)", "Housemade Korean side dish with fermented chili peppers, napa cabbage, green onion, white onion, and Korean radish.", []],
    ["kimchi-4oz", "Chicken", "Kimchi (4oz)", "", []],
    ["kimchi-fire-noodles", "Chicken", "Kimchi Fire Noodles", "Stir-fried ramen with spicy fire sauce and house kimchi sauce. Served with cabbage, kimchi, and fried egg.", ["egg", "gluten", "wheat"]],
    ["kimchi-fried-rice", "Chicken", "Kimchi Fried Rice", "Housemade kimchi stir-fried with rice, bacon, white onion, and green onion. Topped with fried egg.", ["egg"]],
    ["kimchi-fries", "Chicken", "Kimchi Fries", "French fries topped with housemade kimchi, green onion, mayo, and spicy mayo.", ["egg"]],
    ["korean-cheese-corn-dog", "Chicken", "Korean Cheese Corn Dog", "Korean-style corndog. Mozzarella cheese coated with batter and breadcrumb, drizzled with ketchup and mustard.", ["gluten", "milk", "wheat"]],
    ["korean-cheesefishcake-corn-dog", "Chicken", "Korean Cheese+FishCake Corn Dog", "Korean cheese and fish cake corn dog.", ["fish", "gluten", "milk", "wheat"]],
    ["oh-k-fries", "Chicken", "Oh! K Fries", "French fries tossed in garlic butter topped with housemade fry seasoning, parmesan cheese, and parsley flakes.", ["milk"]],
    ["pickled-radish-12oz", "Chicken", "Pickled Radish (12oz)", "Housemade pickled radish.", []],
    ["seaweed-salad", "Chicken", "Seaweed Salad", "", []],
    ["shrimp-tempura", "Chicken", "Shrimp Tempura", "Lightly battered and fried shrimp served with housemade tempura sauce.", ["gluten", "shellfish", "wheat"]],
    ["takoyaki", "Chicken", "Takoyaki", "Grilled balls of seasoned batter stuffed with octopus chunks. Drizzled with mayo and takoyaki sauce and topped with seaweed flakes and bonito flakes.", ["egg", "fish", "gluten", "shellfish", "wheat"]],
    ["tteokbokki", "Chicken", "Tteokbokki", "Korean wheat rice cake, fish cakes, white onion, and green onion simmered in a sweet, tangy, spicy sauce. Topped with sesame seeds.", ["fish", "gluten", "sesame", "wheat"]],
    ["tteoki-stick", "Chicken", "Tteoki-stick", "Deep-fried wheat rice cake served with housemade sweet and spicy sauce. Topped with parsley flakes.", ["gluten", "wheat"]],
    ["wings-bone-in", "Chicken", "Wings (Bone-In)", "", []],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "k-wings-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed K-Wings official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createAmaOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/ama-dc";
  const sourceSummary =
    "Ama official Toast menu ingredient review: direct allergens come from official item names, menu descriptions, and explicit contains notes; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["amas-signature-bone-broth-16oz-glass-jar", "Italian", "Ama’s Signature Bone Broth (16oz Glass Jar)", "Organic beef and chicken bones simmered with low-FODMAP vegetables.", []],
    ["barbabietole", "Italian", "Barbabietole", "Roasted red beets in balsamic with fresh Robiola cheese, sprouted walnuts, and tarragon. Gluten-free. Vegetarian.", ["milk", "tree-nut"]],
    ["borage-lasagna-verdi-con-ragu-alla-bolognese", "Italian", "Borage Lasagna Verdi con Ragù alla Bolognese", "Borage-infused pasta sheets with Emilia-Romagna beef and pork ragu and Parmigiano Reggiano.", ["egg", "gluten", "milk", "wheat"]],
    ["caffe-focaccia-classico", "Italian", "Caffe Focaccia Classico", "Focaccia Genovese in a classic preparation. Vegetarian.", ["gluten", "wheat"]],
    ["caffe-focaccia-pizzata", "Italian", "Caffe Focaccia Pizzata", "Focaccia Genovese with D.O.P. San Marzano tomato, Stracchino cheese, and oregano. Vegetarian.", ["gluten", "milk", "wheat"]],
    ["classico-fugassa", "Italian", "Classico Fugassa", "Genovese focaccia made with Ligurian extra virgin olive oil. Vegan.", ["gluten", "wheat"]],
    ["cotto-crucolo-onion-sandwich", "Italian", "Cotto, Crucolo, Onion Sandwich", "Prosciutto cotto and Crucolo cheese on onion focaccia.", ["gluten", "milk", "wheat"]],
    ["erbe-in-padella", "Italian", "Erbe in Padella", "Seasonal sauteed leafy greens; options include escarole sauteed in capers, pine nuts, and raisins. Gluten-free.", ["tree-nut"]],
    ["farinata", "Italian", "Farinata", "Savory chickpea pancake baked with Ligurian extra virgin olive oil. Gluten-free and vegan.", []],
    ["finocchio", "Italian", "Finocchio", "Shaved fennel, lemon, and black pepper salad with shaved Pecorino Sardo cheese.", ["milk"]],
    ["fior-di-zucca", "Italian", "Fior Di Zucca", "Ligurian fried zucchini blossoms served with housemade ricotta and basil pesto.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["focaccia-di-formaggio", "Italian", "Focaccia Di Formaggio", "Very thin layered focaccia with Crescenza cheese. Vegetarian.", ["gluten", "milk", "wheat"]],
    ["gnocco-fritto", "Italian", "Gnocco Fritto", "Traditional pillow-like fried dough from Emilia-Romagna topped with aged prosciutto.", ["gluten", "wheat"]],
    ["insalata-verde", "Italian", "Insalata Verde", "Fresh greens, radishes, cucumbers, pumpkin seeds, and signature dressing. Contains anchovies. Gluten-free and dairy-free.", ["fish"]],
    ["knodel-mit-krautsalat", "Italian", "Knodel Mit Krautsalat", "Tyrolean speck and nettle dumplings with cabbage salad.", ["egg", "gluten", "wheat"]],
    ["mortadella-sandwich", "Italian", "Mortadella Sandwich", "Crescenza cheese and pesto on classic fugassa.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["mortadella-stracchino-pesto-sandwich", "Italian", "Mortadella, Stracchino, Pesto Sandwich", "Mortadella, Stracchino cheese, and Pesto Genovese on classic focaccia.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["mozzarella-basil-semi-secchi-tomatos", "Italian", "Mozzarella, Basil, Semi Secchi Tomatos", "Buffalo mozzarella, sun-dried tomatoes, and fresh basil on classic focaccia. Vegetarian.", ["gluten", "milk", "wheat"]],
    ["onion-fugassa", "Italian", "Onion Fugassa", "Fugassa with semi-sweet onions. Vegan.", ["gluten", "wheat"]],
    ["pasta-fagioli", "Italian", "Pasta Fagioli", "Pasta fagioli.", ["gluten", "wheat"]],
    ["patate-al-forno", "Italian", "Patate Al Forno", "Roasted potatoes with rosemary, garlic, and extra virgin olive oil. Gluten-free and vegan.", []],
    ["pesce", "Italian", "Pesce", "Seatopia bronzino with organic escarole and leek salsa verde. Gluten-free.", ["fish"]],
    ["pesto", "Italian", "Pesto", "Pesto.", ["milk", "tree-nut"]],
    ["pizzata-fugassa", "Italian", "Pizzata Fugassa", "Fugassa with San Marzano tomato and Crescenza cheese. Vegetarian.", ["gluten", "milk", "wheat"]],
    ["pollo-arrosto", "Italian", "Pollo Arrosto", "Pasture-raised organic half-chicken roasted with fresh marjoram served with Insalata Verde. Contains anchovies. Gluten-free.", ["fish"]],
    ["polpette-mondeghili", "Italian", "Polpette Mondeghili", "Pasture-raised beef and pork meatballs with mortadella served Milanese style; lightly breaded.", ["gluten", "wheat"]],
    ["prosciutto-parmigiano-arugula-sandwich", "Italian", "Prosciutto, Parmigiano, Arugula Sandwich", "Prosciutto San Daniele, Parmigiano Reggiano, and arugula on classic focaccia.", ["gluten", "milk", "wheat"]],
    ["raviolini-al-tocco", "Italian", "Raviolini Al Tocco", "Ravioli filled with braised pasture-raised beef and escarole served in a meat jus.", ["egg", "gluten", "wheat"]],
    ["rice-bowl", "Italian", "Rice Bowl", "Piedmontese red rice with wild-caught Lummi Island Baker salmon, sauteed zucchini, and arugula.", ["fish"]],
    ["rosti-add-on", "Italian", "Rosti Add On", "Celeriac and potato pancake.", []],
    ["sbriciolona-alta-badia-tomato-sandwich", "Italian", "Sbriciolona, Alta Badia, Tomato Sandwich", "Sbriciolona salame, Alta Badia cheese, and sundried tomatoes on onion focaccia. Available gluten-free.", ["gluten", "milk", "wheat"]],
    ["spaghetti-al-pomodoro", "Italian", "Spaghetti Al Pomodoro", "Monograno Felicetti Kamut flour pasta with D.O.P. San Marzano tomato and basil sauce. Vegetarian. Available gluten-free.", ["gluten", "wheat"]],
    ["tartare-di-salmone", "Italian", "Tartare Di Salmone", "Tuna tartare with sun-dried tomatoes and marinated eggplant.", ["fish"]],
    ["trenette-pesto", "Italian", "Trenette Pesto", "Trenette pasta with pesto.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["trofie-con-pesto", "Italian", "Trofie Con Pesto", "Trofie pasta with pesto.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["vitello-milanese", "Italian", "Vitello Milanese", "Thinly pounded and breaded milk-fed veal served with arugula and lemon. Gluten-free noted by source.", []],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "ama-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Ama official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createClaudiosTableOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/claudios-table-5441-macarthur-boulevard-northwest";
  const sourceSummary =
    "Claudio's Table official Toast menu ingredient review: direct allergens come from official item names and menu descriptions; this is partial official ingredient evidence, not a full allergen matrix.";
  const rows = [
    ["4-stagioni", "Italian", "4 Stagioni", "Mutti Tomato, Artichoke Romano, Portobello Mushroom, Golfera Ham, Taggiasche Olive, Fior Di Latte Mozzarella, Smoked Scamorza.", ["gluten", "milk", "wheat"]],
    ["8-oz-parmesan-side", "Italian", "8 OZ Parmesan Side", "Freshly grated Parmigiano Reggiano.", ["milk"]],
    ["8-oz-pecorino-cheese-side", "Italian", "8 OZ Pecorino Cheese Side", "Freshly grated aged Pecorino cheese.", ["milk"]],
    ["amatriciana-sauce", "Italian", "Amatriciana Sauce", "Onions, garlic, bay leaves, black pepper, espelette pepper, thyme, tomatoes, extra virgin olive oil, and guanciale.", []],
    ["amberjack-crudo", "Italian", "Amberjack Crudo", "Lemon, olive oil, sweet red drop pepper, and fresh dill.", ["fish"]],
    ["arancini", "Italian", "Arancini", "Acquerello rice, Parmigiano Reggiano, onion, bread crumbs, and saffron.", ["gluten", "milk", "wheat"]],
    ["arugula-salad", "Italian", "Arugula Salad", "Olive oil, lemon juice, and shaved Parmesan.", ["milk"]],
    ["beet-salad", "Italian", "Beet salad", "Blood orange, Gorgonzola, pistachio, and Sicilian orange vinaigrette. Contains nuts.", ["milk", "tree-nut"]],
    ["berry-bowl", "Italian", "BERRY BOWL", "", []],
    ["bobolini", "Italian", "BOBOLINI", "Citrus sugar, served with vanilla-verbena creme anglaise.", ["egg", "gluten", "milk", "wheat"]],
    ["bolognaise-sauce", "Italian", "Bolognaise Sauce", "Onions, garlic, bay leaves, black pepper, thyme, fennel pollen, ground pork, beef, veal, Italian sausage, tomatoes, tomato paste, and extra virgin olive oil.", []],
    ["branzino", "Italian", "Branzino", "", ["fish"]],
    ["bruschetta-platter", "Italian", "Bruschetta Platter", "Whipped sheep's ricotta, drizzled honey, Sicilian caponata, Kalamata and Castelvetrano tapenade, and Tuscan bread.", ["gluten", "milk", "wheat"]],
    ["bucatini-allamatriciana", "Italian", "Bucatini All'Amatriciana", "Guanciale, tomato, red onion, and Pecorino.", ["gluten", "milk", "wheat"]],
    ["cacio-e-pepe-pasta", "Italian", "Cacio e Pepe Pasta", "Pecorino Romano and black pepper.", ["gluten", "milk", "wheat"]],
    ["calamarata-sauce", "Italian", "Calamarata Sauce", "Shallots, garlic, thyme, bay leaves, star anise, black pepper, fish stock, extra virgin olive oil, dry vermouth, saffron, and white wine.", ["fish"]],
    ["cannoli", "Italian", "Cannoli", "Sheep ricotta cream.", ["gluten", "milk", "wheat"]],
    ["caprese-torta", "Italian", "caprese torta", "Chocolate and almond tart served with vanilla ice cream.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["carrciofi", "Italian", "Carrciofi", "Fried artichoke toasted with Pecorino Romano and Italian parsley.", ["gluten", "milk", "wheat"]],
    ["cavatelli", "Italian", "Cavatelli", "Tomato, house-made Italian sausage, rapini, and salted ricotta.", ["gluten", "milk", "wheat"]],
    ["cheese-pizza", "Italian", "Cheese Pizza", "", ["gluten", "milk", "wheat"]],
    ["chef-claudio-sauces", "Italian", "Chef Claudio Sauces", "Chef Claudio's sauces are available in 32 oz containers to go.", []],
    ["chicken-breast", "Italian", "Chicken breast", "", []],
    ["clams-sauce", "Italian", "Clams Sauce", "Shallots, fennel, garlic, mussel juice, clam juice, bay leaves, thyme, black pepper, white wine, olive oil, and rice flour.", ["shellfish"]],
    ["claudios-caesar", "Italian", "Claudio's Caesar", "Romaine lettuce, Parmigiano Reggiano, yogurt dressing, and focaccia croutons.", ["gluten", "milk", "wheat"]],
    ["claudios-roasted-chicken", "Italian", "Claudio's Roasted Chicken", "Roasted chicken served with garlic and rosemary sauteed fingerling potatoes.", []],
    ["claudios-rosted-chicken", "Italian", "Claudio's Rosted Chicken", "", []],
    ["cold-corn-soup", "Italian", "Cold corn Soup", "Chicken stock and cream.", ["milk"]],
    ["crushed-potatoes", "Italian", "crushed potatoes", "Green and yellow Romano beans, onions, tomato, and garlic.", []],
    ["funghi", "Italian", "Funghi", "Parmesan cream, seasonal wild mushrooms, Fior di Latte, pancetta, and Parmesan.", ["gluten", "milk", "wheat"]],
    ["gnocchi", "Italian", "Gnocchi", "Tomato, Mozzarella Fior di Latte, basil, and olive oil.", ["gluten", "milk", "wheat"]],
    ["happy-hour-pepperoni", "Italian", "Happy Hour Pepperoni", "", ["gluten", "milk", "wheat"]],
    ["heirloom-tomato-salad", "Italian", "Heirloom Tomato Salad", "", []],
    ["kids-pasta", "Italian", "Kids Pasta", "", ["gluten", "wheat"]],
    ["lamb-meatballs", "Italian", "Lamb Meatballs", "Lamb meatballs served with Napoletana sauce and Parmigiano.", ["milk"]],
    ["lunguini-ai-porcini", "Italian", "Lunguini Ai Porcini", "Olive oil, shallots, garlic, aged Parmigiano, and fresh porcini.", ["gluten", "milk", "wheat"]],
    ["margherita", "Italian", "Margherita", "Fior di Latte Mozzarella, Mutti tomato, basil, and olive oil.", ["gluten", "milk", "wheat"]],
    ["marinara", "Italian", "Marinara", "Fresh tomato, garlic, and oregano.", ["gluten", "wheat"]],
    ["meat-lasagna", "Italian", "Meat lasagna", "Chef's Sunday meat lasagna.", ["egg", "gluten", "milk", "wheat"]],
    ["mixed-green-salad", "Italian", "Mixed Green Salad", "Balsamico-Dijon mustard dressing.", ["mustard"]],
    ["octopus", "Italian", "Octopus", "Crispy potatoes, nduja, roasted garlic, confit lemon, capers, and nduja oil.", ["shellfish"]],
    ["orange-balsamic-scampi", "Italian", "Orange balsamic scampi", "Served with scapece zucchini and tomato confit.", ["shellfish"]],
    ["parmigiana", "Italian", "Parmigiana", "Eggplant Parmesan, tomato sauce, olive oil, basil, and mozzarella cheese.", ["egg", "gluten", "milk", "wheat"]],
    ["pasta-al-ragu", "Italian", "Pasta Al Ragu", "Short ribs, pork ribs, sweet sausage, tomato, garlic, Pecorino cheese, and red onion.", ["gluten", "milk", "wheat"]],
    ["pasta-calamarata", "Italian", "Pasta Calamarata", "Tomato and saffron sauce, calamarata pasta, shrimp, mussels, and clams.", ["gluten", "shellfish", "wheat"]],
    ["pasta-clams", "Italian", "Pasta Clams", "Clams, bread crumbs, garlic, parsley, and chilies.", ["gluten", "shellfish", "wheat"]],
    ["pepperoni", "Italian", "Pepperoni", "Fior di Latte Mozzarella, Mutti tomato, olive oil, and pepperoni.", ["gluten", "milk", "wheat"]],
    ["pizza-bianca", "Italian", "Pizza Bianca", "Pecorino cream, Taleggio, Gorgonzola, Fior di Latte, and Fontinella.", ["gluten", "milk", "wheat"]],
    ["pomodoro-sauce", "Italian", "Pomodoro Sauce", "Onions, garlic, bay leaves, black pepper, thyme, tomatoes, extra virgin olive oil, and fresh basil.", []],
    ["porchetta", "Italian", "Porchetta", "Trevisano salad, orange, toasted almonds, and old fashioned mustard sauce. Contains nuts.", ["mustard", "tree-nut"]],
    ["prime-ny-strip-steak", "Italian", "Prime NY Strip Steak", "Mashed potatoes, sauteed mixed vegetables, and Barolo sauce.", ["milk"]],
    ["prosciutto-and-grisini", "Italian", "Prosciutto and Grisini", "San Daniele prosciutto from Parma and breadstick.", ["gluten", "wheat"]],
    ["prosciutto-arugula", "Italian", "Prosciutto Arugula", "Prosciutto, Parmesan, fresh arugula, Fior di Latte Mozzarella, tomato, basil, and olive oil.", ["gluten", "milk", "wheat"]],
    ["roast-quail", "Italian", "Roast Quail", "Sunday roast quail stuffed with Italian herbs, pancetta, and pistachio, served with fava beans and fregola pasta. Contains nuts.", ["gluten", "tree-nut", "wheat"]],
    ["sauteed-brocoli-rabe", "Italian", "Sauteed Brocoli Rabe", "Olive oil, garlic, shallots, Calabrian pepper, finished with shaved ricotta salata.", ["milk"]],
    ["seasonal-vegetables", "Italian", "Seasonal Vegetables", "", []],
    ["side-sausage", "Italian", "Side sausage", "", []],
    ["spaghetti-alla-chitarra", "Italian", "Spaghetti alla chitarra", "Tomato, chilies, lemon zest, olive oil, and basil.", ["gluten", "wheat"]],
    ["spaghetti-meatballs", "Italian", "Spaghetti meatballs", "", ["gluten", "wheat"]],
    ["special-pizza", "Italian", "Special Pizza", "Tomato sauce, mozzarella cheese, red onions, chorizo, and red piquillo peppers.", ["gluten", "milk", "wheat"]],
    ["sweet-italia", "Italian", "Sweet Italia", "Smoked tomato sauce, Italian sausage, broccoli rabe, Scamorza, Fior di Latte, and Parmesan.", ["gluten", "milk", "wheat"]],
    ["tiramisu", "Italian", "Tiramisu", "Mascarpone cream and ladyfingers.", ["egg", "gluten", "milk", "wheat"]],
    ["tomato-sauce", "Italian", "Tomato sauce", "", []],
    ["vegetarian-lasagna", "Italian", "Vegetarian Lasagna", "Fresh pasta, bell peppers, eggplants, zucchini, tomatoes, onions, garlic, Mozzarella, and Parmigiano.", ["egg", "gluten", "milk", "wheat"]],
    ["vegetariana", "Italian", "Vegetariana", "Mutti tomato, zucchini, eggplant, roasted bell pepper, basil, ricotta cheese, and arugula pesto.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["vitello-tonnato", "Italian", "Vitello Tonnato", "Pantelleria caperberries, Taggiasche olives, anchovies, mayonnaise, olive oil, croutons, and pickled onion.", ["egg", "fish", "gluten", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "claudios-table-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Claudio's Table official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createJackRoseOfficialMenuRows() {
  const sourceUrl = "https://www.jackrosediningsaloon.com/dinnermenu-2";
  const sourceSummary =
    "Jack Rose Dining Saloon official menu ingredient review: direct allergens come from official item names, menu descriptions, and item-level allergen notes; drink/catalog rows were removed from the published food menu.";
  const rows = [
    ["7-wings", "American", "7- Wings", "", []],
    ["chicken-sandwich", "American", "Chicken Sandwich", "Blackened chicken breast, smash sauce, lettuce, tomato, and pickles.", ["gluten", "wheat"]],
    ["chopped-salad", "American", "CHOPPED SALAD", "Bacon, cucumber, sunflower seed, smoked corn, tomato, deviled egg, and fancy ranch.", ["egg", "milk"]],
    ["fish-belly", "American", "Fish Belly", "", ["fish"]],
    ["fish-collar", "American", "Fish Collar", "", ["fish"]],
    ["fried-chicken", "American", "FRIED CHICKEN", "Buttermilk mashed potatoes, bacon braised kale, and smoked tasso gravy.", ["gluten", "milk", "wheat"]],
    ["fried-green-tomatoes", "American", "FRIED GREEN TOMATOES", "Bacon jam and Calabrian chili oil.", ["gluten", "wheat"]],
    ["fried-mac-and-cheese", "American", "FRIED MAC & CHEESE", "Fried macaroni and cheese with truffle aioli. Item-level note lists dairy, gluten, egg, canola fryer oil, and sunflower in the truffle aioli.", ["egg", "gluten", "milk", "wheat"]],
    ["fried-oyster-special", "American", "Fried Oyster Special", "", ["gluten", "shellfish", "wheat"]],
    ["fried-rhode-island-calamari", "American", "Fried Rhode Island Calamari", "Calamari tossed with arugula and fried hot peppers, served with lemon caper aioli.", ["egg", "gluten", "shellfish", "wheat"]],
    ["maryland-crab-cake", "American", "Maryland Crab Cake", "", ["egg", "gluten", "shellfish", "wheat"]],
    ["prosciutto-wrapped-figs", "American", "Prosciutto Wrapped Figs", "Prosciutto, mission figs, bacon jam, herbed goat cheese, and balsamic glaze.", ["milk"]],
    ["roasted-olives", "American", "Roasted Olives", "Castelvetrano, Cerignola, and Taggiasche olives roasted with garlic, lemon, and thyme.", []],
    ["16-oz-new-york-strip", "Classics", "16 oz New York Strip", "Served with buttermilk mashed potatoes and grilled asparagus.", ["milk"]],
    ["american-wagyu-coulotte-steak", "Classics", "AMERICAN WAGYU COULOTTE STEAK", "Crispy salt and vinegar brussels sprouts and chimichurri.", []],
    ["big-jack-burger", "Classics", "BIG JACK BURGER", "Bacon, pimento cheese, shallots, shredded lettuce, aioli, pickles, and fries. Impossible patty available.", ["egg", "gluten", "milk", "wheat"]],
    ["bison-burger", "Classics", "BISON BURGER", "Horseradish mayo, pickled Fresno chiles, pickles, and fries.", ["egg", "gluten", "wheat"]],
    ["grilled-baramundi", "Classics", "Grilled Baramundi", "Carolina gold middlins, roasted baby squash, blistered tomato, fava beans, and herb butter.", ["fish", "milk"]],
    ["lemon-pound-cake", "Dessert", "Lemon Pound Cake", "Strawberry rhubarb compote.", ["egg", "gluten", "milk", "wheat"]],
    ["blackened-chicken-sandwich", "Late Night grill MENU", "BLACKENED CHICKEN SANDWICH", "Shredded lettuce, tomato, pickles, and spicy mayo.", ["egg", "gluten", "wheat"]],
    ["blistered-shishito-peppers", "Late Night grill MENU", "Blistered Shishito Peppers", "Spicy mayo and togarashi.", ["egg"]],
    ["grilled-quesadilla", "Late Night grill MENU", "GRILLED QUESADILLA", "Cheddar, peppers, and onion.", ["gluten", "milk", "wheat"]],
    ["jack-smash-burger", "Late Night grill MENU", "JACK SMASH BURGER", "Five ounce smash patty, smash sauce, lettuce, tomato, pickle, and American cheese. Impossible patty available.", ["egg", "gluten", "milk", "wheat"]],
    ["buttermilk-biscuits", "Sides", "BUTTERMILK BISCUITS", "Fennel honey butter.", ["gluten", "milk", "wheat"]],
    ["fried-brussels-sprouts", "Sides", "FRIED BRUSSELS SPROUTS", "Salt and vinegar.", []],
    ["twice-baked-potato", "Sides", "TWICE BAKED POTATO", "Chives. Optional loaded add-on includes bacon, sour cream, and cheddar.", []],
    ["jalapeno-deviled-egg", "To share", "JALAPENO DEVILED EGG", "Togarashi and chives.", ["egg"]],
    ["pigs-and-figs", "To share", "Pigs & Figs", "Prosciutto, mission figs, bacon jam, herbed goat cheese, and balsamic glaze.", ["milk"]],
    ["steak-tartare", "To share", "Steak Tartare", "Quail egg yolk and mixed greens.", ["egg"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "jack-rose-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Jack Rose official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createMikkoOfficialMenuRows() {
  const sourceUrl = "https://www.chefmikko.com/_api/restaurants-menus-item/v1/items";
  const sourceSummary =
    "Mikko official Wix/Toast menu ingredient review: direct allergens come from official item names and descriptions; non-food event, wine, cocktail, and broad imported retail rows were removed from the published food menu.";
  const rows = [
    ["alexander-cake", "Nordic Cafe", "Alexander Cake", "Raspberry glaze and raspberry filling.", ["egg", "gluten", "milk", "wheat"]],
    ["almond-tart", "Nordic Cafe", "Almond Tart", "Almond meringue cake.", ["egg", "tree-nut"]],
    ["apple-tart", "Nordic Cafe", "Apple Tart", "Baked tart with glaze.", ["egg", "gluten", "milk", "wheat"]],
    ["beef-vegetable-chili", "Nordic Cafe", "Beef- vegetable chili", "Beef-vegetable chili served with sour cream, chopped onion, and shredded cheese.", ["milk"]],
    ["beetroot-soup-borscht", "Nordic Cafe", "Beetroot Soup (Borscht)", "Beetroot vegetable soup served with sour cream and rye bread.", ["gluten", "milk", "wheat"]],
    ["belgian-waffles", "Nordic Cafe", "Belgian Waffles", "Belgian waffles.", ["egg", "gluten", "milk", "wheat"]],
    ["biscuits-and-gravy-with-2-eggs", "Nordic Cafe", "Biscuits and Gravy with 2 Eggs", "House-made gravy with two eggs.", ["egg", "gluten", "milk", "wheat"]],
    ["blueberry-sour-cream-cake", "Nordic Cafe", "Blueberry Sour Cream Cake", "Blueberry sour cream cake with fresh whipped cream.", ["egg", "gluten", "milk", "wheat"]],
    ["bratwurst-with-2-eggs", "Nordic Cafe", "Bratwurst with 2 Eggs", "Nordic take on the classic American breakfast.", ["egg"]],
    ["breakfast-wrap", "Nordic Cafe", "Breakfast Wrap", "Chef's special breakfast wrap.", ["egg", "gluten", "wheat"]],
    ["buckwheat-blini-with-skagen-or-gravlax", "Nordic Cafe", "Buckwheat Blini with Skagen or Gravlax", "Buckwheat blinis with choice of Skagen shrimp salad or gravlax topping.", ["egg", "fish", "milk", "shellfish"]],
    ["chicken-kyiv", "Nordic Cafe", "Chicken Kyiv", "Chicken Kyiv with deruni potato pancakes.", ["gluten", "milk", "wheat"]],
    ["chicken-schnitzel", "Nordic Cafe", "Chicken Schnitzel", "Chicken schnitzel with lemon and caper butter, seasonal vegetables, and fries.", ["egg", "gluten", "milk", "wheat"]],
    ["chocolate-apricot-cake", "Nordic Cafe", "Chocolate Apricot Cake", "Seasonal chocolate apricot cake.", ["egg", "gluten", "milk", "wheat"]],
    ["chocolate-roll-cake", "Nordic Cafe", "Chocolate Roll Cake", "Hazelnut tart; can also be served lactose-free.", ["egg", "gluten", "tree-nut", "wheat"]],
    ["cod-gratin", "Nordic Cafe", "Cod Gratin", "Icelandic cod baked with cheesy gratin sauce, duchess potatoes, and seasonal vegetables.", ["fish", "milk"]],
    ["daily-baked-breads", "Nordic Cafe", "Daily Baked Breads", "Rye bread, 7-seed, sourdough, and other daily baked loaves.", ["gluten", "wheat"]],
    ["daily-baked-cookies", "Nordic Cafe", "Daily Baked Cookies", "Hanna cookies are made without eggs; oat cookies, S-cookies with cinnamon sugar, and spoon cookies filled with raspberry jam.", ["gluten", "milk", "wheat"]],
    ["field-green-salad", "Nordic Cafe", "Field Green Salad", "Fresh vinaigrette, berries, seasonal root vegetables. Gluten-free, vegetarian, and vegan.", []],
    ["finnish-style-fish-soup", "Nordic Cafe", "Finnish-Style Fish Soup", "Atlantic salmon, potatoes, butter, and dill. Can be made without butter and/or gluten free if requested.", ["fish", "milk"]],
    ["fish-soup", "Nordic Cafe", "Fish soup", "Salmon, cod, potato, and fresh dill in light broth. Served with rye bread.", ["fish", "gluten", "wheat"]],
    ["gluten-free-chocolate-brownie", "Nordic Cafe", "Gluten Free Chocolate Brownie", "Gluten-free chocolate brownie.", ["egg", "milk", "tree-nut"]],
    ["gravlax", "Nordic Cafe", "Gravlax", "Rye, mustard, egg, and dill.", ["egg", "fish", "gluten", "mustard", "wheat"]],
    ["grilled-cheese-w-salad", "Nordic Cafe", "Grilled Cheese w/ Salad", "Grilled cheese with salad; can add ham or smoked salmon.", ["gluten", "milk", "wheat"]],
    ["ham-egg-benedict", "Nordic Cafe", "Ham Egg Benedict", "Ham egg Benedict.", ["egg", "gluten", "milk", "wheat"]],
    ["herring", "Nordic Cafe", "Herring", "Egg, greens, mustard, and dill.", ["egg", "fish", "mustard"]],
    ["kyiv-cake", "Nordic Cafe", "Kyiv Cake", "Kyiv cake dessert.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["lamb-meatballs-with-mashed-beans", "Nordic Cafe", "Lamb Meatballs with Mashed Beans", "Lamb meatballs with mashed Great Northern beans.", []],
    ["lingonberry-bread-pudding", "Nordic Cafe", "Lingonberry Bread Pudding", "Dessert cake bread pudding with lingonberries.", ["egg", "gluten", "milk", "wheat"]],
    ["mushroom-omelet", "Nordic Cafe", "Mushroom Omelet", "Savory mushroom omelet.", ["egg", "milk"]],
    ["mushroom-soup", "Nordic Cafe", "Mushroom soup", "Pureed mushroom soup with a dash of truffle oil.", ["milk"]],
    ["nordic-rye-crisps", "Nordic Cafe", "Nordic Rye Crisps", "House-made rye crisps paired with salmon mousse.", ["fish", "gluten", "milk", "wheat"]],
    ["potato-gnocchi-with-creamy-mushrooms", "Nordic Cafe", "Potato Gnocchi with Creamy Mushrooms", "Potato gnocchi with seasonal mushrooms, spinach, and white wine cream sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["potato-rosti-with-mushroom-ragu", "Nordic Cafe", "Potato Rosti with Mushroom Ragu", "Traditional potato rosti and seasonal mushroom ragu.", []],
    ["prinss-sausage-with-2-eggs", "Nordic Cafe", "Prinss Sausage with 2 Eggs", "Prinskorv sausage with eggs and mustard.", ["egg", "mustard"]],
    ["pulla-cinnamon-nordic-toast", "Nordic Cafe", "Pulla Cinnamon Nordic Toast", "Fresh berries, vanilla cream, and maple syrup.", ["egg", "gluten", "milk", "wheat"]],
    ["pulla-french-toast", "Nordic Cafe", "Pulla French Toast", "Nordic French toast made with Pulla bread, cinnamon roll dough, sweets, and berries.", ["egg", "gluten", "milk", "wheat"]],
    ["raclette-cheese-with-prosciutto", "Nordic Cafe", "Raclette Cheese with Prosciutto", "Melted raclette cheese with prosciutto, small potatoes, and cornichons.", ["milk"]],
    ["red-wine-braised-beef-short-ribs", "Nordic Cafe", "Red Wine Braised Beef Short Ribs", "Boneless beef short ribs with root puree, roasted cabbage, and red wine demi-glace.", []],
    ["salmon-and-egg-benedict", "Nordic Cafe", "Salmon and Egg Benedict", "Green salad, English muffin, and dill.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["salmon-and-poached-egg-sandwich", "Nordic Cafe", "Salmon and Poached Egg Sandwich", "Dill, greens, tomato, and Old Bay.", ["egg", "fish", "gluten", "wheat"]],
    ["seared-salmon", "Nordic Cafe", "Seared Salmon", "Seared Atlantic salmon with mushroom risotto, seasonal vegetables, and browned horseradish butter.", ["fish", "milk"]],
    ["semla", "Nordic Cafe", "Semla", "Swedish style with almond paste or Finnish style with raspberry jam; both with whipped cream.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["seven-seed-bread", "Nordic Cafe", "Seven-Seed Bread", "House-baked seed bread; gluten-free.", []],
    ["short-ribs-benedict", "Nordic Cafe", "Short Ribs Benedict", "", ["egg", "gluten", "milk", "wheat"]],
    ["shrimp-salad-skagen", "Nordic Cafe", "Shrimp Salad Skagen", "Shrimp salad Skagen with multigrain bread, dill, and lemon.", ["egg", "gluten", "shellfish", "wheat"]],
    ["smoked-salmon-egg-benedict", "Nordic Cafe", "Smoked Salmon Egg Benedict", "House smoked salmon and house-made hollandaise atop an English muffin with side salad and fresh fruits.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["split-pea-soup", "Nordic Cafe", "Split Pea Soup", "Traditional split pea soup served with mustard and chopped onion; can be made vegetarian without ham.", ["mustard"]],
    ["strawberry-roll-cake", "Nordic Cafe", "Strawberry Roll Cake", "Strawberry roll cake with fresh whipped cream.", ["egg", "gluten", "milk", "wheat"]],
    ["swedish-pancakes", "Nordic Cafe", "Swedish Pancakes", "Swedish pancakes.", ["egg", "gluten", "milk", "wheat"]],
    ["vegetable-quiche", "Nordic Cafe", "Vegetable Quiche", "Seasonal root vegetable quiche.", ["egg", "gluten", "milk", "wheat"]],
    ["vegetable-risotto-with-burrata", "Nordic Cafe", "Vegetable Risotto with Burrata", "House risotto with broccolini, fennel, dill, and burrata.", ["milk"]],
    ["winter-vegetable-fritters", "Nordic Cafe", "Winter Vegetable Fritters", "Lightly fried vegetable fritters served with spicy pimiento sauce.", ["egg", "gluten", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "mikko-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Mikko official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createGhostburgerOfficialMenuRows() {
  const sourceUrl = "https://www.ghostburgerdc.com/menu";
  const sourceSummary =
    "Ghostburger official website/Toast menu ingredient review: direct allergens come from official item names and descriptions; category headers, beverage catalog rows, and beer-pairing prose were removed from the published food menu.";
  const rows = [
    ["a-real-cheesesteak", "Burgers", "A REAL CHEESESTEAK", "Shaved ribeye, caramelized onions, scratch-made cheese whiz, and Sarcone's Philly long roll.", ["gluten", "milk", "wheat"]],
    ["applewood-smoked-bacon", "Brunch Sides", "APPLEWOOD SMOKED BACON", "", []],
    ["backyard-bbq-burger", "Burgers", "BACKYARD BBQ BURGER", "American cheese, bacon, fried onion petals, pickled jalapenos, and housemade curry spicy BBQ sauce on a burger bun.", ["egg", "gluten", "milk", "wheat"]],
    ["bacon-crumbles", "Salad Upgrades", "BACON CRUMBLES", "", []],
    ["banana", "Hand-Spun Milkshakes", "BANANA", "Hand-spun banana milkshake.", ["milk"]],
    ["barbie-girl", "Burgers", "BARBIE GIRL", "Provolone, arugula, jalapenos, pickled red onion and cabbage, and scratch-made chipotle mayo on a burger bun.", ["egg", "gluten", "milk", "wheat"]],
    ["big-mom", "Dogs", "BIG MOM", "All-beef hot dog wrapped in bacon with diced Roma tomatoes, shredded lettuce, red onions, and Yucatan crema.", ["gluten", "milk", "wheat"]],
    ["brekkie-burger", "Breakfast", "BREKKIE BURGER", "Quiche-style eggs, burger patty, lettuce, tomatoes, American cheese, and homemade bacon jam.", ["egg", "gluten", "milk", "wheat"]],
    ["buffalo-bleu-chicken-sammy", "Sandos", "BUFFALO BLEU CHICKEN SAMMY", "Brined and battered fried chicken breast, homemade dill pickle, Buffalo sauce, and bleu cheese on a sandwich bun.", ["egg", "gluten", "milk", "wheat"]],
    ["build-a-burger", "Burgers", "Build A Burger", "Custom burger build on a bun.", ["gluten", "wheat"]],
    ["burger-of-the-month-spooky-shrooms", "Burgers", "BURGER OF THE MONTH - SPOOKY SHROOMS", "Smoked gouda, buna-shimeji mushrooms, spinach, onion ring, cremini mayo, and potato bun.", ["egg", "gluten", "milk", "wheat"]],
    ["burger-patty", "Salad Upgrades", "BURGER PATTY", "", []],
    ["burger-sliders", "Food Specials", "BURGER SLIDERS", "Two sliders with American cheese and spooky sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["cacio-e-pepe-arancini", "Apps & Sides", "CACIO e PEPE ARANCINI", "Pecorino, Parmesan, black pepper, and risotto balls served with housemade ragu.", ["egg", "gluten", "milk", "wheat"]],
    ["cacio-e-pepe-arancini-v", "Food Specials", "CACIO e PEPE ARANCINI (V)", "Risotto, Pecorino, Parmesan, and ragu.", ["egg", "gluten", "milk", "wheat"]],
    ["charlie-burger", "Burgers", "CHARLIE BURGER", "Pimento cheese, red onions, jalapeno mayo, and fried pickles on a burger bun.", ["egg", "gluten", "milk", "wheat"]],
    ["chicken-caesar-burrito", "Breakfast Tacos & Burritos", "CHICKEN CAESAR BURRITO", "Fried chicken, romaine, Parmesan, pickled red onions, jalapenos, diced tomatoes, and house Caesar in a tortilla.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["chicken-parm", "Sandos", "CHICKEN PARM", "Brined and fried chicken breasts, mozzarella, provolone, ragu, and Sarcone's roll.", ["egg", "gluten", "milk", "wheat"]],
    ["chicken-parm-sando", "Sandos", "Chicken Parm Sando", "Brined and fried chicken breasts, homemade ragu sauce, fresh mozzarella, and provolone on a Sarcone's South Philly long roll.", ["egg", "gluten", "milk", "wheat"]],
    ["chicken-sliders", "Food Specials", "CHICKEN SLIDERS", "Two sliders with pickles and honey mustard.", ["egg", "gluten", "mustard", "wheat"]],
    ["chicken-tacos", "Breakfast Tacos & Burritos", "CHICKEN TACOS", "Grilled chicken, scrambled eggs, romaine, pickled onions, cilantro, chipotle mayo, hot sauce, and corn tortillas.", ["egg"]],
    ["chicken-tendies", "Apps & Sides", "CHICKEN TENDIES", "Brined and fried chicken tenders with house seasonings and honey mustard.", ["egg", "gluten", "mustard", "wheat"]],
    ["chili-cheese-dog", "Food Specials", "CHILI CHEESE DOG", "Bacon-wrapped beef hot dog, house chili, diced onions, and cheddar sauce.", ["gluten", "milk", "wheat"]],
    ["chili-dog", "Dogs", "CHILI DOG", "All-beef hot dog wrapped in bacon with house chili, diced onions, and cheddar cheese sauce.", ["gluten", "milk", "wheat"]],
    ["chocolate", "Hand-Spun Milkshakes", "CHOCOLATE", "Hand-spun shake made with real chocolate chunks and homemade chocolate syrup.", ["milk"]],
    ["chocolate-chip-cookie", "Desserts", "CHOCOLATE CHIP COOKIE", "Large homemade cookie with milk chocolate chunks, brown butter, and sea salt.", ["egg", "gluten", "milk", "wheat"]],
    ["egg-and-cheese-sando-v", "Breakfast", "EGG & CHEESE SANDO (V)", "Eggs, choice of cheese, Dijon mayo, and optional additional toppings on a sandwich bun.", ["egg", "gluten", "milk", "mustard", "wheat"]],
    ["falafel-balls-v", "Food Specials", "FALAFEL BALLS (V+)", "Falafel balls with jalapeno crema.", ["milk"]],
    ["falafel-sliders-v", "Food Specials", "FALAFEL SLIDERS (V)", "Two sliders with pickled onions and jalapeno crema.", ["gluten", "milk", "wheat"]],
    ["fire-burger", "Burgers", "FIRE BURGER", "Burger patty, American cheese, arugula, pickled banana peppers, fried onion petals, and fire habanero aioli on a bun.", ["egg", "gluten", "milk", "wheat"]],
    ["fresno-wings", "Food Specials", "FRESNO WINGS", "Jumbo wings with choice of Fresno buffalo or mango habanero sauce and house ranch.", ["egg", "milk"]],
    ["fried-pickles", "Apps & Sides", "FRIED PICKLES", "Battered and seasoned pickle spears with scratch-made jalapeno mayo.", ["egg", "gluten", "wheat"]],
    ["fried-pickles-v", "Food Specials", "FRIED PICKLES (V)", "Pickle spears with paprika mayo.", ["egg", "gluten", "wheat"]],
    ["garden", "Salads", "GARDEN", "Iceberg lettuce, Roma tomatoes, red peppers, red onions, aged feta, cucumbers, Kalamata olives, mint, cilantro, basil, and lemon herb vinaigrette.", ["milk"]],
    ["ghost-fries", "Apps & Sides", "GHOST FRIES", "Crispy crinkle cuts with chile salt and ketchup.", []],
    ["ghost-krispie-treat", "Desserts", "GHOST KRISPIE TREAT", "Rice Krispies, marshmallow fluff, Biscoff butter cookies, melted pink chocolate, and melted white chocolate piping.", ["gluten", "milk", "wheat"]],
    ["ghost-rings", "Apps & Sides", "GHOST RINGS", "Crispy onion rings made in house and served with homemade paprika mayo.", ["egg", "gluten", "wheat"]],
    ["ghostburger", "Burgers", "GHOSTBURGER", "American cheese, red onions, and homemade dill pickle on a burger bun.", ["gluten", "milk", "wheat"]],
    ["glorious-weenie-tower-of-power", "Food Specials", "GLORIOUS WEENIE TOWER OF POWER", "Four dogs, four orders of sliders, cheesesteak, ghost fries, onion rings, and sauces.", ["egg", "gluten", "milk", "wheat"]],
    ["grilled-or-fried-chicken", "Salad Upgrades", "GRILLED OR FRIED CHICKEN", "", ["gluten", "wheat"]],
    ["honey-chicken-sammy", "Sandos", "HONEY CHICKEN SAMMY", "Brined and battered fried chicken breast and homemade dill pickle on a sandwich bun.", ["egg", "gluten", "wheat"]],
    ["hot-wings", "Apps & Sides", "Hot Wings", "Jumbo wings with choice of Fresno buffalo or mango habanero sauce and homemade ranch or bleu cheese.", ["egg", "milk"]],
    ["lotus-cookie", "Hand-Spun Milkshakes", "LOTUS COOKIE", "Vanilla butter cookies and homemade dulce de leche syrup.", ["gluten", "milk", "wheat"]],
    ["misty-meadow-mushroom-glizzy", "Dogs", "MISTY MEADOW MUSHROOM GLIZZY", "Cremini mushrooms, cheese whiz, cilantro, jalapeno, and BBQ sauce on a hot dog bun.", ["gluten", "milk", "wheat"]],
    ["mushroom-burrito-v", "Breakfast Tacos & Burritos", "MUSHROOM BURRITO (V)", "Mozzarella, cremini, scrambled eggs, leeks, romaine, diced tomatoes, Dijon mayo, jalapeno aioli, and flour tortillas.", ["egg", "gluten", "milk", "mustard", "wheat"]],
    ["mushroom-glizzy", "Dogs", "Mushroom Glizzy", "All-beef hot dog wrapped in bacon with sauteed cremini mushrooms, cheese whiz, cilantro, jalapenos, and BBQ sauce.", ["gluten", "milk", "wheat"]],
    ["mushroom-tacos-v", "Breakfast Tacos & Burritos", "MUSHROOM TACOS (V)", "Cremini, scrambled eggs, romaine, pickled onions, diced tomato, banana peppers, Yucatan crema, and corn tortillas.", ["egg", "milk"]],
    ["oatmeal-raisin", "Desserts", "OATMEAL RAISIN", "Gluten-free oatmeal raisin cookie with raisins and crushed walnuts.", ["milk", "tree-nut"]],
    ["oatmeal-raisin-cookie-gf", "Desserts", "Oatmeal Raisin Cookie (GF)", "Large homemade oatmeal cookie with raisins and crushed walnuts, made with gluten-free flour. Contains tree nuts and dairy.", ["milk", "tree-nut"]],
    ["otto-superiore", "Breakfast", "OTTO SUPERIORE", "Scrambled eggs, pimento goat cheese, jalapenos, pickled red onions, bacon, cilantro, and jalapeno aioli.", ["egg", "milk"]],
    ["pancakes", "Breakfast", "PANCAKES", "Fresh strawberries and bananas, powdered sugar, house whipped cream, and maple syrup.", ["egg", "gluten", "milk", "wheat"]],
    ["philly-fry", "Apps & Sides", "PHILLY FRY", "Crinkle-cut fries with shaved ribeye, caramelized onions, cheese whiz, diced tomatoes, jalapenos, cabbage, and Yucatan crema.", ["milk"]],
    ["rick-pickle-dog", "Dogs", "RICK PICKLE DOG", "All-beef hot dog wrapped in bacon with peanut butter, dill pickles, pickle chips, and marshmallow fluff.", ["gluten", "peanut", "wheat"]],
    ["sausage-burrito", "Breakfast Tacos & Burritos", "SAUSAGE BURRITO", "Mozzarella, sausage, scrambled eggs, romaine, tomatoes, Dijon mayo, jalapeno aioli, and flour tortilla.", ["egg", "gluten", "milk", "mustard", "wheat"]],
    ["sausage-patties", "Brunch Sides", "SAUSAGE PATTIES", "", []],
    ["sausage-tacos", "Breakfast Tacos & Burritos", "SAUSAGE TACOS", "Sausage, scrambled eggs, cabbage, pickled onions, cilantro, jalapeno aioli, and corn tortillas.", ["egg"]],
    ["shroomsteak-v", "Sandos", "SHROOMSTEAK (V)", "Marinated cremini mushrooms, jalapenos, leeks, cheese whiz, garlic mayo, shredded lettuce, and diced Roma tomatoes on a Sarcone's Philly long roll.", ["egg", "gluten", "milk", "wheat"]],
    ["side-bbq-sauce", "Sauces", "Side BBQ Sauce", "Housemade BBQ sauce.", []],
    ["side-bleu-cheese-dressing", "Sauces", "Side Bleu Cheese Dressing", "Homemade bleu cheese dressing.", ["egg", "milk"]],
    ["side-buffalo-wing-sauce", "Sauces", "Side Buffalo Wing Sauce", "Buffalo hot wing sauce.", []],
    ["side-chipotle-mayo", "Sauces", "Side Chipotle Mayo", "Chipotle mayo.", ["egg"]],
    ["side-fresno-hot-sauce", "Sauces", "Side Fresno Hot Sauce", "Fresno and habanero hot sauce.", []],
    ["side-garlic-mayo", "Sauces", "Side Garlic Mayo", "Housemade garlic mayo.", ["egg"]],
    ["side-honey-mustard", "Sauces", "Side Honey Mustard", "Housemade honey mustard.", ["mustard"]],
    ["side-house-cheese-whiz", "Sauces", "Side House Cheese Whiz", "Housemade cheese sauce.", ["milk"]],
    ["side-house-ranch", "Sauces", "Side House Ranch", "Homemade buttermilk ranch.", ["egg", "milk"]],
    ["side-jalapeno-aioli", "Sauces", "Side Jalapeno Aioli", "Jalapeno aioli.", ["egg"]],
    ["side-ketchup", "Sauces", "Side Ketchup", "Ketchup.", []],
    ["side-mustard", "Sauces", "Side Mustard", "Yellow mustard.", ["mustard"]],
    ["side-of-eggs", "Brunch Sides", "SIDE OF EGGS", "Choice of scrambled, sunny side up, over easy, over medium, or over hard eggs.", ["egg"]],
    ["side-paprika-mayo", "Sauces", "Side Paprika Mayo", "Homemade paprika mayo.", ["egg"]],
    ["side-plain-mayo", "Sauces", "Side Plain Mayo", "Plain mayo.", ["egg"]],
    ["side-salad", "Apps & Sides", "SIDE SALAD", "Iceberg, Roma tomatoes, cucumbers, pickled red onions, garlic croutons, and choice of homemade Italian or house ranch dressing.", ["egg", "gluten", "milk", "wheat"]],
    ["side-spooky-sauce", "Sauces", "Side Spooky Sauce", "Scratch-made special sauce.", ["egg"]],
    ["strawberry", "Hand-Spun Milkshakes", "STRAWBERRY", "Hand-spun strawberry milkshake.", ["milk"]],
    ["the-frenchie", "Burgers", "THE FRENCHIE", "Sauteed cremini mushrooms, caramelized onions, homemade garlic mayo, and bleu cheese on a burger bun.", ["egg", "gluten", "milk", "wheat"]],
    ["your-very-own-doggie", "Dogs", "Your Very Own Doggie", "Plain hot dog on a potato bun with a la carte toppings.", ["gluten", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "ghostburger-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Ghostburger official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createDoiMoiOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/doi-moi";
  const sourceSummary =
    "doi moi official Toast menu ingredient review: direct allergens come from official item names, menu descriptions, and explicit contains notes; category headers, wine/soda rows, and promotion artifacts were removed from the published food menu.";
  const rows = [
    ["bao-bun-sampler-plate", "Bao Buns ToGo", "Bao Bun Sampler Plate", "Bao buns finished with gochujang aioli, hoisin sauce, pickled vegetables, red finger peppers, and scallions.", ["egg", "gluten", "soy", "wheat"]],
    ["crispy-marinated-tofu-bao-bun", "Bao Buns ToGo", "Crispy Marinated Tofu Bao Bun", "Crispy marinated tofu bao buns finished with gochujang aioli, hoisin sauce, pickled vegetables, red finger peppers, and scallions.", ["egg", "gluten", "soy", "wheat"]],
    ["slow-braised-pork-belly-bao-bun", "Bao Buns ToGo", "Slow Braised Pork Belly Bao Bun", "Slow-braised pork belly bao buns finished with gochujang aioli, hoisin sauce, pickled vegetables, red finger peppers, and scallions.", ["egg", "gluten", "soy", "wheat"]],
    ["bittersweet-slow-drip", "Coffee Togo", "Bittersweet Slow Drip", "Sweet condensed milk or sweet condensed coconut milk.", ["milk"]],
    ["iced-bittersweet-slow-drip", "Coffee Togo", "Iced Bittersweet Slow Drip", "Sweet condensed milk or sweet condensed coconut milk.", ["milk"]],
    ["basil-fried-rice", "Curry, Noodles & Rice ToGo", "Basil Fried Rice", "Coconut jasmine rice, egg, Chinese broccoli, mushrooms, squash, snap peas, Thai basil, soy sauce, and garlic chili paste. Gluten friendly.", ["egg", "soy"]],
    ["drunken-noodles", "Curry, Noodles & Rice ToGo", "Drunken Noodles", "Fresh local rice noodles, broccoli, mushrooms, squash, snap peas, Thai basil, ginger, garlic chili paste, and sweet Indonesian soy sauce. Gluten friendly and vegan.", ["soy"]],
    ["mala-peanut-noodles", "Curry, Noodles & Rice ToGo", "Mala Peanut Noodles", "Mala peanut noodles.", ["gluten", "peanut", "soy", "wheat"]],
    ["ratatouille-curry", "Curry, Noodles & Rice ToGo", "Ratatouille Curry", "Bell pepper, green squash, eggplant, macerated tofu, coconut milk, cilantro, scallions, peanuts, and lemongrass jasmine rice. Gluten friendly and vegan.", ["peanut", "soy"]],
    ["sai-gon-fried-rice", "Curry, Noodles & Rice ToGo", "Sai Gon Fried Rice", "Coconut jasmine rice, egg, sausage, shrimp, mushroom, soy sauce, scallions, and cilantro. Gluten friendly.", ["egg", "shellfish", "soy"]],
    ["stir-fried-rice-noodle", "Curry, Noodles & Rice ToGo", "Stir Fried Rice Noodle", "Fresh local rice noodles, egg, sausage, shrimp, bean sprouts, onion, and black garlic sauce. Gluten friendly.", ["egg", "shellfish"]],
    ["viet-lo", "Curry, Noodles & Rice ToGo", "Viet-Lo", "Cabbage, wood ear mushrooms, bean sprouts, marinated chicken, fresh egg noodles, soy sauce, and crushed peanuts.", ["egg", "gluten", "peanut", "soy", "wheat"]],
    ["coconut-beignet", "Dessert ToGo", "Coconut Beignet", "Coconut sugar, sweetened condensed coconut milk, and coconut chips.", ["gluten", "wheat"]],
    ["mango-and-sticky-rice", "Dessert ToGo", "Mango and Sticky Rice", "Warm sticky rice, butterfly-pea flower sauce, fresh mango, and toasted coconut.", []],
    ["pandan-sponge-cake", "Dessert ToGo", "Pandan Sponge Cake", "Pandan sponge cake.", ["egg", "gluten", "wheat"]],
    ["sai-gon-salad", "Salads ToGo", "Sai Gon Salad", "Shredded green papaya, peanuts, fresh herbs, shredded carrots, fried shallots, and nuoc cham dressing. Contains nuts.", ["fish", "peanut", "tree-nut"]],
    ["braised-tofu-banh-mi", "Sandwiches, Banh Mi ToGo", "Braised Tofu Banh Mi", "Edamame pate, Maggi seasoning, crispy braised tofu, and vegan mayo on banh mi bread.", ["gluten", "soy", "wheat"]],
    ["chicken-banh-mi", "Sandwiches, Banh Mi ToGo", "Chicken Banh Mi", "Soy and mirin marinated chicken thighs, mayo, and red finger pepper on banh mi bread.", ["egg", "gluten", "soy", "wheat"]],
    ["pork-belly-banh-mi", "Sandwiches, Banh Mi ToGo", "Pork Belly Banh Mi", "BBQ sauce, mayo, cucumber, jalapeno, pickled vegetables, red finger pepper, and cilantro on banh mi bread.", ["egg", "gluten", "wheat"]],
    ["crispy-brussels-sprouts", "Street Plates ToGo", "Crispy Brussels Sprouts", "Crispy shallots and vegan nuoc cham sauce.", ["fish"]],
    ["crispy-chicken-wings", "Street Plates ToGo", "Crispy Chicken Wings", "Five wings, pickled vegetables, cilantro, red hot soy glaze, and ginger dipping sauce.", ["soy"]],
    ["crispy-spiced-tofu", "Street Plates ToGo", "Crispy Spiced Tofu", "Crispy tofu cubes, five spice, chili flakes, crispy shallots, and nuoc cham dipping sauce. Vegan.", ["soy"]],
    ["dumplings-5-chicken", "Street Plates ToGo", "Dumplings (5) - Chicken", "Chicken dumplings with micro cilantro and soy peanut sauce.", ["gluten", "peanut", "soy", "wheat"]],
    ["dumplings-5-vegetable", "Street Plates ToGo", "Dumplings (5) - Vegetable", "Vegetable dumplings topped with herb peanut sauce, daikon, and watermelon radish.", ["gluten", "peanut", "soy", "wheat"]],
    ["flash-fried-beef-jerky", "Street Plates ToGo", "Flash Fried Beef Jerky", "Marinated striploin steak strips, spicy honey glaze, cilantro, and Sriracha-lime dipping sauce.", []],
    ["fried-spring-rolls-2", "Street Plates ToGo", "Fried Spring Rolls (2)", "Pork, shrimp, mushrooms, noodles, onion, fish sauce, rolled in wheat wrappers and flash-fried with nuoc cham sauce.", ["fish", "gluten", "shellfish", "wheat"]],
    ["fried-spring-rolls-4", "Street Plates ToGo", "Fried Spring Rolls (4)", "Pork, diced shrimp, mushrooms, noodles, onion, fish sauce, rolled in a wheat wrapper and flash fried with nuoc cham.", ["fish", "gluten", "shellfish", "wheat"]],
    ["potato-dumplings", "Street Plates ToGo", "Potato Dumplings", "Potato dumplings.", ["gluten", "wheat"]],
    ["summer-rolls-2", "Street Plates ToGo", "Summer Rolls (2)", "Poached shrimp summer rolls.", ["shellfish"]],
    ["thai-iced-tea", "Tea ToGo", "Thai Iced Tea", "Black Thai tea, spices, and sweetened condensed milk.", ["milk"]],
    ["vegan-thai-iced-tea", "Tea ToGo", "Vegan Thai Iced Tea", "Black Thai tea, spices, and sweetened condensed coconut milk.", []],
    ["beef-pho", "Traditional House Favorites ToGo", "Beef Pho", "Braised beef broth and shaved beef.", []],
    ["grilled-lemongrass-chicken", "Traditional House Favorites ToGo", "Grilled Lemongrass Chicken", "Lemongrass-chili and soy marinated chicken with fresh herbs, scallions, pickled vegetables, cherry tomatoes, cilantro-chili sauce, and rice noodles.", ["soy"]],
    ["grilled-pork-chops", "Traditional House Favorites ToGo", "Grilled Pork Chops", "Lemongrass marinated pork chops with fresh herbs, nuoc cham dipping sauce, and sticky rice.", ["fish"]],
    ["mekong-style-whole-fried-fish-platter", "Traditional House Favorites ToGo", "Mekong Style Whole Fried Fish Platter", "Catch of the day, scallions, peanuts, kaffir chili salt, ginger sauce, and sticky rice. Contains nuts.", ["fish", "peanut", "tree-nut"]],
    ["shaken-beef", "Traditional House Favorites ToGo", "Shaken Beef", "Filet mignon, soy and fish sauce glaze, red onion, watercress, tomato and cucumber salad, and lemongrass coconut jasmine rice.", ["fish", "soy"]],
    ["turmeric-salmon", "Traditional House Favorites ToGo", "Turmeric Salmon", "Pan-seared salmon, fish sauce, pineapple, dill, radish, vermicelli noodles, peanuts, fresh herbs, pickled red onion, and nuoc cham sauce.", ["fish", "peanut"]],
    ["brussels-sprouts", "Vegetables & Sides ToGo", "Brussels Sprouts", "Cooked in a zesty stir fry sauce.", []],
    ["coconut-and-lemongrass-rice", "Vegetables & Sides ToGo", "Coconut & Lemongrass Rice", "Rice infused with coconut and lemongrass.", []],
    ["five-spice-frites", "Vegetables & Sides ToGo", "Five Spice Frites", "Vietnamese five spice salt and gochujang aioli.", ["egg"]],
    ["mushrooms", "Vegetables & Sides ToGo", "Mushrooms", "Cooked in a zesty stir fry sauce.", []],
    ["sticky-rice", "Vegetables & Sides ToGo", "Sticky Rice", "", []],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "doi-moi-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed doi moi official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createSweetwaterTavernOfficialMenuRows() {
  const sourceUrl = "https://order.greatamericanrestaurants.com/api/vendors/sweetwater-tavern-merrifield";
  const sourceSummary =
    "Sweetwater Tavern official ordering API menu ingredient review: direct allergens come from official item names and descriptions; beer/growler/package rows were removed from the published food menu.";
  const rows = [
    ["3-crispy-fish-tacos", "Fresh Seafood, Chicken & Pasta", "3 Crispy Fish Tacos", "Habanero slaw and corn tacos with sweet potato fries.", ["fish", "gluten", "wheat"]],
    ["baby-back-ribs", "Beef, Ribs & Chops", "Baby Back Ribs", "Hickory smoked ribs served with fries and cole slaw.", ["egg"]],
    ["bacon-cheeseburger", "Sandwiches & Burgers", "Bacon Cheeseburger", "Certified Angus Beef, pecanwood smoked bacon, American cheese, wicked sauce, and fries.", ["gluten", "milk", "wheat"]],
    ["berkshire-pork-chop", "Beef, Ribs & Chops", "Berkshire Pork Chop", "Hickory grilled pork chop with mashed potatoes and grilled broccolini.", ["milk"]],
    ["blue-crab-and-shrimp-fritters", "Starters", "Blue Crab & Shrimp Fritters", "Blue crab and shrimp fritters with grilled corn salsa and lobster ginger sauce.", ["egg", "gluten", "shellfish", "wheat"]],
    ["cheddar-cheeseburger", "Sandwiches & Burgers", "Cheddar Cheeseburger", "Certified Angus Beef, Tillamook cheddar, mustard mayo, ketchup, pickle, and fries.", ["egg", "gluten", "milk", "mustard", "wheat"]],
    ["cheeseburger-kids", "Kids Under 12", "Cheeseburger Kids", "Cheeseburger with choice of fries, applesauce, or carrots.", ["gluten", "milk", "wheat"]],
    ["chicken-fingers-kids", "Kids Under 12", "Chicken Fingers Kids", "Chicken fingers.", ["gluten", "wheat"]],
    ["chop-house-salad", "Fresh Salads", "Chop House Salad", "Mixed greens, fresh corn, tomato, scallions, and basil tossed with buttermilk herb dressing.", ["egg", "milk"]],
    ["crab-and-corn-chowder", "Starters", "Crab & Corn Chowder", "Crab and corn chowder.", ["gluten", "milk", "shellfish", "wheat"]],
    ["crab-cake-and-filet-mignon", "Fresh Seafood, Chicken & Pasta", "Crab Cake & Filet Mignon", "Crab cake and filet mignon with mashed potatoes.", ["egg", "gluten", "milk", "shellfish", "wheat"]],
    ["crispy-brussels-sprouts-with-bacon-and-spiced-pecans", "Sides", "Crispy Brussels Sprouts with Bacon & Spiced Pecans", "Crispy Brussels sprouts with bacon and spiced pecans.", ["tree-nut"]],
    ["crispy-fish-tacos", "Fresh Seafood, Chicken & Pasta", "Crispy Fish Tacos", "Habanero slaw and corn tacos with sweet potato fries.", ["fish", "gluten", "wheat"]],
    ["crispy-fried-point-judith-calamari", "Starters", "Crispy Fried Point Judith Calamari", "Crispy fried calamari with onion straws and lobster ginger sauce.", ["gluten", "shellfish", "wheat"]],
    ["deep-dish-apple-pie", "Desserts", "Deep Dish Apple Pie", "Deep dish apple pie with vanilla ice cream. Contains pecans.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["drunken-ribeye", "Beef, Ribs & Chops", "Drunken Ribeye", "Ribeye marinated in Great American Pale Ale with roasted cremini mushrooms and mashed potatoes.", ["gluten", "milk", "wheat"]],
    ["filet-mignon", "Beef, Ribs & Chops", "Filet Mignon", "Filet mignon with roasted cremini mushrooms and mashed potatoes.", ["milk"]],
    ["firecracker-shrimp", "Starters", "Firecracker Shrimp", "Crumb-fried shrimp tossed with thin beans and spicy pepper jelly.", ["gluten", "shellfish", "wheat"]],
    ["great-american-fries", "Sides", "Great American Fries", "", []],
    ["grilled-broccolini", "Sides", "Grilled Broccolini", "", []],
    ["grilled-cheese-kids", "Kids Under 12", "Grilled Cheese Kids", "Grilled cheese.", ["gluten", "milk", "wheat"]],
    ["grilled-chicken-and-havarti-cheese", "Sandwiches & Burgers", "Grilled Chicken & Havarti Cheese", "Grilled chicken with arugula, roasted peppers, mustard mayo, and Havarti on grilled ice box bread with fries.", ["egg", "gluten", "milk", "mustard", "wheat"]],
    ["grilled-tuna-and-field-greens-salad", "Fresh Salads", "Grilled Tuna & Field Greens Salad", "Sesame crusted tuna with cilantro ginger sauce over field greens, champagne vinaigrette, tomatoes, sundried cranberries, dates, pine nuts, and garlic croutons.", ["fish", "gluten", "sesame", "tree-nut", "wheat"]],
    ["hickory-bbq-burger", "Sandwiches & Burgers", "Hickory BBQ Burger", "Certified Angus Beef with Tillamook, Havarti, hickory BBQ sauce, and fries.", ["gluten", "milk", "wheat"]],
    ["hot-spinach-parmesan-and-artichoke-dip", "Starters", "Hot Spinach, Parmesan & Artichoke Dip", "Hot spinach, Parmesan, and artichoke dip with fresh tortilla chips.", ["milk"]],
    ["jambalaya-pasta", "Fresh Seafood, Chicken & Pasta", "Jambalaya Pasta", "Sauteed shrimp, chicken, andouille sausage, tomato, scallions, and penne pasta in spicy creole cream sauce.", ["gluten", "milk", "shellfish", "wheat"]],
    ["jumbo-lump-crab-cake-sandwich", "Sandwiches & Burgers", "Jumbo Lump Crab Cake Sandwich", "Jumbo lump crab cake with remoulade sauce on brioche and fries.", ["egg", "gluten", "milk", "shellfish", "wheat"]],
    ["key-lime-pie", "Desserts", "Key Lime Pie", "Key lime pie with raspberry sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["loaded-baked-potato", "Sides", "Loaded Baked Potato", "Butter, sour cream, cheddar cheese, bacon, and chives.", ["milk"]],
    ["lobster-bisque", "Starters", "Lobster Bisque", "Lobster bisque.", ["gluten", "milk", "shellfish", "wheat"]],
    ["louisiana-pasta", "Fresh Seafood, Chicken & Pasta", "Louisiana Pasta", "Chicken, andouille sausage, tomato, scallions, and penne pasta in spicy creole cream sauce.", ["gluten", "milk", "wheat"]],
    ["mashed-potatoes", "Sides", "Mashed Potatoes", "", ["milk"]],
    ["monterey-salad-with-spiced-pecans", "Fresh Salads", "Monterey Salad with Spiced Pecans", "Lightly fried chicken on greens with avocado, fresh corn, tomato, crisp tortillas, sun dried cranberries, and buttermilk herb dressing.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["ozzie-rolls", "Starters", "Ozzie Rolls", "Ozzie rolls with honey butter.", ["gluten", "milk", "wheat"]],
    ["roasted-cremini-mushrooms", "Sides", "Roasted Cremini Mushrooms", "", []],
    ["roasted-half-young-chicken", "Fresh Seafood, Chicken & Pasta", "Roasted Half Young Chicken", "Spice-rubbed, smoked, and slow roasted chicken with mashed potatoes and brown butter sauce.", ["milk"]],
    ["sauteed-jumbo-lump-crab-cakes", "Fresh Seafood, Chicken & Pasta", "Sauteed Jumbo Lump Crab Cakes", "Jumbo lump crab cakes with remoulade sauce, fries, and cole slaw.", ["egg", "gluten", "shellfish", "wheat"]],
    ["sauteed-spinach", "Sides", "Sauteed Spinach", "", []],
    ["short-smoked-grilled-salmon-salad", "Fresh Salads", "Short Smoked Grilled Salmon Salad", "Field greens with champagne vinaigrette, sun dried cranberries, dates, and pine nuts.", ["fish", "tree-nut"]],
    ["short-smoked-salmon-filet", "Fresh Seafood, Chicken & Pasta", "Short Smoked Salmon Filet", "Marinated, smoked, and hickory grilled salmon with broccolini, mashed potatoes, and Dijon cream.", ["fish", "milk", "mustard"]],
    ["southwest-chicken-salad", "Fresh Salads", "Southwest Chicken Salad", "Avocado, fresh corn, black beans, mixed greens, Jack and cheddar, tomato, buttermilk herb dressing, and BBQ sauce.", ["egg", "milk"]],
    ["sweet-potato-fries", "Sides", "Sweet Potato Fries", "", []],
    ["sweetwater-fried-chicken-tenders", "Fresh Seafood, Chicken & Pasta", "Sweetwater Fried Chicken Tenders", "Fried chicken tenders with fries, cole slaw, and honey mustard dipping sauce.", ["egg", "gluten", "mustard", "wheat"]],
    ["sweetwater-roast-chicken-salad", "Fresh Salads", "Sweetwater Roast Chicken Salad", "Field greens, fresh corn, tomato, pine nuts, sun dried cranberries, dates, Laura Chenel goat cheese, and champagne vinaigrette.", ["milk", "tree-nut"]],
    ["tex-mex-eggrolls", "Starters", "Tex Mex Eggrolls", "Eggrolls filled with smoked chicken, corn, black beans, onions, peppers, and jalapeno jack cheese with avocado dipping sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["traditional-iceberg-wedge", "Fresh Salads", "Traditional Iceberg Wedge", "Blue cheese, bacon, onion, and tomato.", ["milk"]],
    ["veggie-burger", "Sandwiches & Burgers", "Veggie Burger", "Brown rice, rainbow quinoa, black beans, and beets with chipotle mayo served open faced on grilled ice box bread with tomato, Havarti, guacamole, and fries.", ["egg", "gluten", "milk", "wheat"]],
    ["warm-flourless-chocolate-waffle", "Desserts", "Warm Flourless Chocolate Waffle", "Warm flourless chocolate waffle with vanilla ice cream.", ["egg", "milk"]],
    ["warm-goat-cheese-and-spiced-pecan-salad", "Fresh Salads", "Warm Goat Cheese & Spiced Pecan Salad", "Field greens with grape tomatoes, sun dried cranberries, garlic croutons, and champagne vinaigrette.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["warm-white-chocolate-bread-pudding", "Desserts", "Warm White Chocolate Bread Pudding", "Warm white chocolate bread pudding.", ["egg", "gluten", "milk", "wheat"]],
    ["wood-grilled-chicken-breast", "Fresh Seafood, Chicken & Pasta", "Wood Grilled Chicken Breast", "Wood grilled chicken breast with thin green beans and roasted cremini mushrooms or angel hair pasta with brown butter sauce.", ["gluten", "milk", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "sweetwater-tavern-official-api-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Sweetwater Tavern official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createMajesticOfficialMenuRows() {
  const sourceUrl = "https://www.themajesticva.com/our-menus";
  const sourceSummary =
    "The Majestic official PDF menu ingredient review: direct allergens come from official dish names and descriptions; PDF legend/header/footer rows and row-boundary bleed were removed from the published menu.";
  const rows = [
    ["seared-scallops", "Brunch & Bubbles", "SEARED SCALLOPS & SAFFRON RICE", "Bomba rice, saffron broth, mussels, clams, nduja, and persillade sauce.", ["shellfish"]],
    ["majestic-coconut-cake", "Dessert", "MAJESTIC COCONUT CAKE", "Sour cream-coconut frosting, coconut mousse, and toasted coconut.", ["egg", "gluten", "milk", "wheat"]],
    ["pineapple-jelly-doughnuts", "Dessert", "PINEAPPLE JELLY DOUGHNUTS", "Pineapple jelly doughnuts with mango meringue and coconut jam.", ["egg", "gluten", "wheat"]],
    ["classic-caesar-salad", "Mediterranean", "CLASSIC CAESAR SALAD", "RomaCrunch lettuce, torn croutons, garlic-anchovy dressing, and Pecorino Romano cheese.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["artichoke-and-lobster-dip", "Mediterranean", "ARTICHOKE & LOBSTER DIP", "Lobster-Gruyere mornay, grilled artichokes, spinach, Calabrian chili crisp, and toasted baguette.", ["gluten", "milk", "shellfish", "wheat"]],
    ["braised-brisket-arancinis", "Mediterranean", "BRAISED BRISKET ARANCINIS", "Meyer lemon arborio rice, lime crema, and morita relish.", ["egg", "gluten", "milk", "wheat"]],
    ["chef-santis-salad", "Mediterranean", "CHEF SANTI'S SALAD", "Cucumber, tomatoes, avocado, mint, cilantro, lime, sumac, and lettuce.", []],
    ["fried-cauliflower", "Mediterranean", "FRIED CAULIFLOWER", "Tahini-garlic puree, herb dressing, toasted hazelnuts, and pickled vegetables.", ["gluten", "sesame", "tree-nut", "wheat"]],
    ["fried-chicken-sliders", "Mediterranean", "FRIED CHICKEN SLIDERS", "Nashville hot sauce, pickle slaw, morita honey, and brioche buns.", ["egg", "gluten", "milk", "wheat"]],
    ["gruyere-chive-biscuit", "Mediterranean", "GRUYERE-CHIVE BISCUIT", "Gruyere-chive biscuit with cultured butter.", ["gluten", "milk", "wheat"]],
    ["harvest-salad", "Mediterranean", "HARVEST SALAD", "Mixed lettuce, pears, pickled red onions, walnuts, roasted grapes, feta, and cider vinaigrette.", ["milk", "tree-nut"]],
    ["majestic-board", "Mediterranean", "MAJESTIC BOARD", "Marinated olives, chicken liver mousse with fig jam, prosciutto, artisan cheese, house pickled vegetables, and toasted pan de bastone.", ["gluten", "milk", "wheat"]],
    ["majestic-brined-fried-chicken", "Mediterranean", "MAJESTIC BRINED FRIED CHICKEN", "Fried chicken with smoked gouda mashed potatoes, charred broccolini, house pickles, and coleslaw.", ["egg", "gluten", "milk", "wheat"]],
    ["majestic-burger", "Mediterranean", "MAJESTIC BURGER", "Prime ground beef chuck, onion-bacon jam, pickled onions, smoked gouda, and garlic aioli.", ["egg", "gluten", "milk", "wheat"]],
    ["majestic-jelly-doughnuts-v", "Mediterranean", "MAJESTIC JELLY DOUGHNUTS", "Jelly doughnuts with mango meringue and coconut jam.", ["egg", "gluten", "wheat"]],
    ["majestic-smashed-burger-sliders", "Mediterranean", "MAJESTIC SMASHED BURGER SLIDERS", "House ground prime chuck, raw cheddar, bacon jam, comeback sauce, and brioche buns.", ["egg", "gluten", "milk", "wheat"]],
    ["monkey-bread-v", "Mediterranean", "MONKEY BREAD", "House-made brioche-challah bread, cinnamon sugar, dulce de leche, and candied pecans.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["pork-belly-sliders", "Mediterranean", "PORK BELLY SLIDERS", "Slowly roasted pork belly, pickle slaw, roasted tomato sauce, and cheddar buns.", ["gluten", "milk", "wheat"]],
    ["potato-chips", "Mediterranean", "POTATO CHIPS", "Triple-cooked potato chips with pecan wood smoked bacon, umami seasoning, and Pt Reyes blue cheese fondue.", ["milk"]],
    ["potato-chips-g", "Mediterranean", "POTATO CHIPS", "Pecan wood smoked bacon and umami seasoning.", []],
    ["roasted-beet-salad", "Mediterranean", "ROASTED BEET SALAD", "Waldorf dressing, apple-celery relish, spiced walnuts, harissa vinaigrette, and herbs.", ["egg", "tree-nut"]],
    ["acai-bowl-v", "Brunch", "ACAI BOWL", "Dragon fruit sorbet, acai, almonds, bananas, granola, and fresh berries.", ["gluten", "tree-nut", "wheat"]],
    ["beef-carpaccio", "Salads", "BEEF CARPACCIO", "Aged balsamic dressing, black garlic aioli, toasted almonds, capers, arugula, and crostini.", ["egg", "gluten", "tree-nut", "wheat"]],
    ["grilled-halloumi-and-heirloom-tomato-sandwich-v", "Salads", "GRILLED HALLOUMI & HEIRLOOM TOMATO SANDWICH", "Heirloom tomatoes, arugula, garlic aioli, cider vinaigrette, toasted sourdough, and house cut fries.", ["egg", "gluten", "milk", "wheat"]],
    ["grilled-jumbo-shrimp", "Salads", "Grilled jumbo shrimp", "Grilled jumbo shrimp.", ["shellfish"]],
    ["grilled-shrimp-cobb-g", "Salads", "GRILLED SHRIMP COBB", "Grilled jumbo shrimp, lettuce, avocado, eggs, red onions, tomatoes, and sour cream-remoulade dressing.", ["egg", "milk", "shellfish"]],
    ["majestic-breakfast", "Brunch", "MAJESTIC BREAKFAST", "Eggs, bacon, home fries, and house salad.", ["egg"]],
    ["roasted-pork-belly-omelette", "Brunch", "ROASTED PORK BELLY OMELETTE", "Omelette with roasted pork belly, roasted peppers, caramelized onions, salsa verde, charred tomato sauce, raw cheddar, and home fries.", ["egg", "milk"]],
    ["crispy-artichokes-v", "Salads", "CRISPY ARTICHOKES", "Crispy artichokes with lemon aioli and scallion relish.", ["egg", "gluten", "wheat"]],
    ["salmon-balt-sandwich", "Salads", "SALMON B.A.L.T. SANDWICH", "Grilled salmon, bacon, avocado, lettuce, tomatoes, marble rye, garlic aioli, and house cut fries.", ["egg", "fish", "gluten", "wheat"]],
    ["seasonal-soup", "Salads", "SEASONAL SOUP", "Seasonal soup.", []],
    ["smoked-salmon-benedict", "Brunch", "SMOKED SALMON BENEDICT", "English muffin, whipped cream cheese, scallion relish, dill, and home fries.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["spinach-and-mushroom-omelette", "Brunch", "SPINACH & MUSHROOM OMELETTE", "Garlic spinach, marinated mushrooms, smoked tomato relish, onion soubise, goat cheese, and home fries.", ["egg", "milk"]],
    ["steak-and-eggs-g", "Brunch", "STEAK & EGGS", "Skirt steak, two eggs, and home fries.", ["egg"]],
    ["tuna-and-avocado-toast", "Brunch", "TUNA & AVOCADO TOAST", "Marinated tuna, cucumber-avocado relish, Calabrian chili crisp, toast, and house salad.", ["fish", "gluten", "wheat"]],
    ["lobster", "Dinner", "LOBSTER", "Maine lobster, puff pastry crust, seasonal vegetables, rose harissa, and preserved lemon.", ["gluten", "milk", "shellfish", "wheat"]],
    ["parker-house-rolls-v", "Sides", "PARKER HOUSE ROLLS", "Parker House rolls with orange-miso butter and sea salt.", ["gluten", "milk", "soy", "wheat"]],
    ["roasted-heritage-half-chicken-g", "Dinner", "ROASTED HERITAGE HALF CHICKEN", "Roasted half chicken with schmaltz roasted new potatoes, escarole, tarragon-sherry vinaigrette, madeira au jus, and spiced honey.", []],
    ["roasted-lamb-shank-g", "Dinner", "ROASTED LAMB SHANK", "Roasted lamb shank with mascarpone polenta, matbucha, sumac spiced onions, date molasses, and herb salad.", ["milk"]],
    ["saffron-pei-mussels", "Dinner", "SAFFRON P.E.I. MUSSELS", "P.E.I. mussels with braised leeks, fennel, lemon juice, piquillo peppers, herbs, and rustic bread.", ["gluten", "shellfish", "wheat"]],
    ["pan-roasted-bronzino-g", "Dinner", "PAN ROASTED BRONZINO", "Pan roasted bronzino with lobster Americaine sauce, pancetta, navy beans, and za'atar.", ["fish", "shellfish"]],
    ["seasoned-fries", "Sides", "SEASONED FRIES", "Hand cut fries with house seasoning and sauce trio.", []],
    ["smoked-gouda-aligot-potatoes", "Sides", "SMOKED GOUDA ALIGOT POTATOES", "Smoked gouda aligot potatoes with lots of butter.", ["milk"]],
    ["steak-frites", "Dinner", "STEAK FRITES", "Marinated skirt steak, roasted garlic aioli, red chimichurri, and compound butter.", ["egg", "milk"]],
    ["zucchini-pesto-and-fusilli-v", "Dinner", "ZUCCHINI PESTO & FUSILLI", "Fusilli pasta, zucchini pesto, roasted pine nuts, stracciatella, corn, baby squash, roasted tomatoes, and chili flakes.", ["gluten", "milk", "tree-nut", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "the-majestic-official-pdf-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed The Majestic official PDF menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createTexasJacksOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/texas-jacks-barbecue";
  const sourceSummary =
    "Texas Jack's Barbecue official Toast/PDF menu ingredient review: direct allergens come from official item names and descriptions; download prompts and menu-section artifacts were removed while preserving real combo, meat, side, salad, sandwich, and dessert rows.";
  const rows = [
    ["grilled-salmon-arugula-salad", "Salads", "Grilled Salmon Arugula Salad", "Roasted cherry tomatoes, grilled asparagus, arugula, shaved red onions, goat cheese, and balsamic dressing.", ["fish", "milk"]],
    ["baked-mac-and-cheese", "Barbecue", "Baked Mac and Cheese", "Baked cavatappi pasta with creamy white, yellow cheddar and gruyere cheese.", ["gluten", "milk", "wheat"]],
    ["banana-pudding", "Desserts", "Banana Pudding", "Vanilla custard layered over cinnamon-brown sugar and caramelized bananas.", ["egg", "gluten", "milk", "wheat"]],
    ["barbecue-burrito", "Barbecue", "Barbecue Burrito", "Crispy onions, mixed greens, roasted corn, queso, sour cream, salsa verde and roja, radish, and scallions.", ["gluten", "milk", "wheat"]],
    ["barbecue-combos", "Barbecue", "Barbecue Combos", "Choose one meat and two sides or two meats and two sides.", []],
    ["barbecue-medleys", "Barbecue", "Barbecue Medleys", "Barbecue meat medleys. No meat substitutions.", []],
    ["beef-short-rib", "Barbecue", "Beef Short Rib", "Bone-in short rib carved to order.", []],
    ["berry-patch-cheesecake", "Desserts", "Berry Patch Cheesecake", "Classic cheesecake on a buttery graham cracker crust with mixed berry sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["bone-in-beef-short-rib-combo", "Barbecue", "Bone-In Beef Short Rib Combo", "Slow-smoked bone-in beef short rib served with choice of two sides.", []],
    ["bone-in-chicken", "Barbecue", "Bone-In Chicken", "Chicken brined, smoked, and glazed with house barbecue sauce.", []],
    ["bonein-chicken-qtr-7-half-13-whole", "Barbecue", "Bone-In Chicken", "Bone-in chicken available by quarter, half, or whole.", []],
    ["brisket-and-chicken-combo", "Barbecue", "Brisket and Chicken Combo", "Brisket and chicken combo with choice of two regular sides.", []],
    ["brisket-and-chicken-medley", "Barbecue", "Brisket and Chicken Medley", "Brisket and chicken with two regular sides, sweet and spicy pickles, and red onions.", []],
    ["brisket-egg-rolls", "Barbecue", "Brisket Egg Rolls", "Chopped brisket, sauteed vegetables, garlic, and cotija cheese with cilantro jalapeno sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["brisket-sandwich", "Barbecue", "Brisket Sandwich", "Prime brisket served with crispy onion and queso on a sandwich bun.", ["gluten", "milk", "wheat"]],
    ["chips-and-guacamole", "Barbecue", "Chips and Guacamole", "Tortilla chips with guacamole.", []],
    ["chips-and-queso", "Barbecue", "Chips and Queso", "House-made tortilla chips with white queso dip.", ["milk"]],
    ["coleslaw", "Barbecue", "Coleslaw", "Green and red cabbage and carrots tossed in mayo dressing. Gluten free.", ["egg"]],
    ["cornbread", "Barbecue", "Cornbread", "Cornbread muffins served with honey butter.", ["egg", "gluten", "milk", "wheat"]],
    ["crispy-brussel-sprouts", "Barbecue", "Crispy Brussel Sprouts", "Fried Brussels sprouts tossed in Parmesan lemon aioli.", ["egg", "gluten", "milk", "wheat"]],
    ["crispy-chicken-frisee-salad", "Salads", "Crispy Chicken Frisee Salad", "Frisee greens with apples, spiced almonds, dried cranberries, poached egg, and warm bacon vinaigrette.", ["egg", "gluten", "tree-nut", "wheat"]],
    ["crispy-chicken-sandwich", "Barbecue", "Crispy Chicken Sandwich", "Crispy chicken sandwich with cayenne sauce, sriracha pickles, and coleslaw.", ["egg", "gluten", "wheat"]],
    ["crispy-or-grilled-smoked-wings", "Barbecue", "Crispy or Grilled Smoked Wings", "Smoked wings with Buffalo, garlic Parmesan, barbecue, or Old Bay sauce.", ["milk"]],
    ["cucumber-salad", "Barbecue", "Cucumber Salad", "", []],
    ["deviled-eggs", "Barbecue", "Deviled Eggs", "Dijon mustard, mayo, paprika, pickles, and pickled onions. Gluten free.", ["egg", "mustard"]],
    ["esquites-mexican-street-corn", "Barbecue", "Esquites - Mexican Street Corn", "Roasted corn blended with street corn mayo, cotija cheese, and Tajin. Gluten free and vegetarian.", ["egg", "milk"]],
    ["french-fries", "Barbecue", "French Fries", "", []],
    ["golden-peach-cobbler", "Desserts", "Golden Peach Cobbler", "Peach cobbler with buttery crust and vanilla ice cream.", ["egg", "gluten", "milk", "wheat"]],
    ["grilled-salmon", "Barbecue", "Grilled Salmon", "Fresh seasoned salmon grilled to order.", ["fish"]],
    ["harvest-broccoli-salad", "Sides", "Harvest Broccoli Salad", "Broccoli, red onion, bacon, dried cranberries, pecans, Parmesan, and sweet mayo dressing. Gluten free.", ["egg", "milk", "tree-nut"]],
    ["jacks-tacos", "Barbecue", "Jacks Tacos", "Two corn tortillas with pico de gallo and cilantro jalapeno sauce; choice of pulled pork, pulled chicken, or brisket.", []],
    ["jalapeno-cheddar-sausage", "Barbecue", "Jalapeno-Cheddar Sausage", "Smoked sausage with sharp cheddar and jalapenos.", ["milk"]],
    ["kansas-city-brisket-burnt-ends", "Barbecue", "Kansas City Brisket Burnt Ends", "Brisket burnt ends with sweet and smoky barbecue flavor. Gluten free.", []],
    ["key-lime-pie", "Desserts", "Key Lime Pie", "House-made key lime pie with graham cracker, lime zest, and toasted meringue.", ["egg", "gluten", "milk", "wheat"]],
    ["kids-cheeseburger", "Barbecue", "Kids Cheeseburger", "White American cheese and soft potato bun.", ["gluten", "milk", "wheat"]],
    ["kids-chicken-tenders", "Barbecue", "Kids Chicken Tenders", "Crispy all-white-meat chicken tenders.", ["gluten", "wheat"]],
    ["kids-grilled-cheese", "Barbecue", "Kids Grilled Cheese", "White American cheese on buttery potato bread.", ["gluten", "milk", "wheat"]],
    ["kids-pulled-chicken-sandwich", "Barbecue", "Kids Pulled Chicken Sandwich", "Pulled chicken in barbecue sauce on soft potato bun.", ["gluten", "wheat"]],
    ["kids-pulled-pork", "Barbecue", "Kids Pulled Pork", "Pulled pork on soft potato bun with optional Carolina BBQ sauce, pickles, and coleslaw.", ["gluten", "wheat"]],
    ["large-meat-medley", "Barbecue", "Large Meat Medley", "Brisket, chicken, pork spare ribs, pulled pork, sausage links, and two large sides.", []],
    ["mixed-green-salad", "Salads", "Mixed Green Salad", "Greens with shaved carrots, cherry tomatoes, pickled red onions, spiced almonds, and white balsamic vinaigrette. Gluten free, contains nuts.", ["tree-nut"]],
    ["mixed-greens-salad", "Salads", "Mixed Greens Salad", "Shaved carrots, cherry tomatoes, pickled shallots, spiced almonds, and white balsamic vinaigrette.", ["tree-nut"]],
    ["one-meat-combo", "Barbecue", "One Meat Combo", "Choice of one smoked meat and two small sides.", []],
    ["pork-spare-ribs", "Barbecue", "Pork Spare Ribs", "Oversized pork spare ribs, brined, seasoned, and smoked.", []],
    ["pork-spare-ribs-qtr-11-half-21-full", "Barbecue", "Pork Spare Ribs", "Pork spare ribs available by quarter, half, or full rack.", []],
    ["potato-slider-rolls", "Barbecue", "Potato Slider Rolls", "Martin's slider potato rolls.", ["gluten", "wheat"]],
    ["prime-brisket-double-cheeseburger", "Barbecue", "Prime Brisket Double Cheeseburger", "Prime brisket burger with crispy onions, pickles, Jack's burger sauce, and American or cheddar cheese.", ["egg", "gluten", "milk", "wheat"]],
    ["pulled-chicken", "Barbecue", "Pulled Chicken", "Chicken brined, smoked, pulled, and mixed with barbecue sauce.", []],
    ["pulled-chicken-sandwich", "Barbecue", "Pulled Chicken Sandwich", "Pulled chicken in barbecue sauce topped with coleslaw and sriracha pickles.", ["egg", "gluten", "wheat"]],
    ["pulled-pork", "Barbecue", "Pulled Pork", "Seasoned pork shoulder smoked, pulled, and drizzled with Carolina gold sauce.", []],
    ["pulled-pork-sandwich", "Barbecue", "Pulled Pork Sandwich", "Pulled pork sandwich topped with coleslaw, spicy pickles, and Carolina Gold barbecue sauce.", ["egg", "gluten", "wheat"]],
    ["redskin-potato-salad", "Barbecue", "Redskin Potato Salad", "Red potatoes, red onions, mayo, celery, mustard, pickles, and egg. Gluten free.", ["egg", "mustard"]],
    ["roasted-beet-and-goat-cheese-salad", "Salads", "Roasted Beet and Goat Cheese Salad", "Roasted beets over arugula with goat cheese, mandarin oranges, pistachios, and citrus vinaigrette.", ["milk", "tree-nut"]],
    ["sliced-brisket", "Barbecue", "Sliced Brisket", "USDA Prime brisket, lean and moist, carved to order.", []],
    ["smoked-brisket-chili-cup-9-bowl", "Salads", "Smoked Brisket Chili", "Beanless prime brisket chili with optional sour cream, cheddar cheese, crispy tortilla chips, or diced onions.", ["milk"]],
    ["smoked-meats-by-the-pound", "Barbecue", "Smoked Meats by the Pound", "Smoked meats and sauces are gluten free.", []],
    ["smoked-wings", "Barbecue", "Smoked Wings", "Jumbo chicken wings smoked then fried crispy to order.", []],
    ["texas-baked-beans", "Barbecue", "Texas Baked Beans", "Navy beans with brisket burnt ends. Gluten free.", []],
    ["texas-style-beef-sausage", "Barbecue", "Texas Style Beef Sausage", "All-beef smoked sausage with natural pork casing.", []],
    ["texas-style-brisket-chili", "Barbecue", "Texas-Style Brisket Chili", "Beanless brisket chili topped with crispy tortilla chips; optional sour cream, cheddar cheese, or diced onions.", ["milk"]],
    ["the-big-papa", "Barbecue", "The Big Papa", "Loaded baked potato with cheddar cheese, sour cream, pico de gallo, crispy onions, and all-American sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["the-meat-medley", "Barbecue", "The Meat Medley", "Brisket, chicken, pork spare ribs, pulled pork, sausage link, and two regular sides.", []],
    ["two-meat-combo", "Barbecue", "Two Meat Combo", "Choice of two smoked meats and two small sides.", []],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "texas-jacks-official-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Texas Jack's official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createMattAndTonysOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/matt-tonys-1501-mt-vernon-ave";
  const sourceSummary =
    "Matt & Tony's official Toast menu ingredient review: direct allergens come from official item names and descriptions; non-menu waitlist/promo artifacts were removed from the published food menu.";
  const rows = [
    ["acai-and-yogurt-bowl", "American", "Acai & Yogurt Bowl", "Coconut yogurt, almond butter, candied basil seeds, berries, toasted coconut, pecan granola, banana, and cacao nibs.", ["milk", "peanut", "tree-nut"]],
    ["ahi-tuna-salad", "American", "Ahi Tuna Salad", "Seared rare ahi tuna, cold egg noodle, jicama, carrot, cucumber, sesame soy vinaigrette, and herbs.", ["egg", "fish", "gluten", "sesame", "soy", "wheat"]],
    ["avo-goddess-salad", "American", "Avo Goddess Salad", "Gem lettuce, arugula, asparagus, red onion, avocado, cucumber, cherry tomato, and creamy tarragon vinaigrette.", ["egg", "milk"]],
    ["avocado-toast", "American", "Avocado Toast", "Jammy egg, marinated tomato, everything spiced seed, balsamic, kale tabbouleh, and Vienna toast.", ["egg", "gluten", "sesame", "wheat"]],
    ["bananas-foster-bread-pudding", "American", "Banana's Foster Bread Pudding", "Challah, whipped cream, salted caramel, and bruleed banana.", ["egg", "gluten", "milk", "wheat"]],
    ["biscuit-breakfast-sandwich", "American", "Biscuit Breakfast Sandwich", "Buttermilk biscuit, fried mortadella, scrambled egg, aged white cheddar, chimichurri aioli, and home fries.", ["egg", "gluten", "milk", "wheat"]],
    ["biscuits-and-gravy", "American", "Biscuits & Gravy", "Chicken chorizo gravy, cheddar scallion biscuits, eggs your way, and optional crispy chicken.", ["egg", "gluten", "milk", "wheat"]],
    ["burrata-and-prosciutto", "American", "Burrata & Prosciutto", "Asparagus basil salad, pickled onion, sunflower seed, Calabrian chili honey, pea tendril, and spring radish.", ["milk"]],
    ["caesar-salad", "American", "Caesar Salad", "Gem lettuce, Caesar dressing, jammy egg, Parmesan, and butter toasted gremolata.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["cajun-crawfish-mac-and-cheese", "American", "Cajun Crawfish Mac & Cheese", "Five-cheese mac, Parmesan, garlic breadcrumb, and chive.", ["gluten", "milk", "shellfish", "wheat"]],
    ["cali-breakfast-burrito", "American", "Cali Breakfast Burrito", "Chicken chorizo, scrambled egg, smoked cheddar, guacamole, green chile sauce, pepper and onion, fries, and home fries.", ["egg", "gluten", "milk", "wheat"]],
    ["charred-spring-vegetables", "American", "Charred Spring Vegetables", "Hummus, eggplant, pepper, onion, asparagus, feta, smoked paprika vinaigrette, and grilled pita.", ["gluten", "milk", "sesame", "wheat"]],
    ["chicken-and-french-toast", "American", "Chicken & French Toast", "Cornflake-crusted chicken, thick-cut challah, maple-pecan syrup, berries, and crispy chicken.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["chicken-and-waffles", "American", "Chicken & Waffles", "Crispy chicken, hot honey, mole syrup, and spiced pecans.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["chilaquitos", "American", "Chilaquitos", "Crispy rolled chicken tacos, green chile sauce, lettuce, crema, guacamole, cotija cheese, and fried egg.", ["egg", "milk"]],
    ["corned-beef-sandwich", "American", "Corned Beef Sandwich", "Red wine braised beef cheek, aged white cheddar, arugula, horseradish sauce, and toasted rustic bread.", ["egg", "gluten", "milk", "wheat"]],
    ["cornflake-crusted-french-toast", "American", "Cornflake Crusted French Toast", "Thick-cut challah, maple-pecan syrup, and berries.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["country-fried-chicken", "American", "Country Fried Chicken", "Country fried chicken with black pepper gravy, two eggs, and home fries.", ["egg", "gluten", "milk", "wheat"]],
    ["crab-stuffed-oysters", "American", "Crab Stuffed Oysters", "Oysters, Maryland crab dip, Old Bay, breadcrumbs, and Ritz cracker.", ["gluten", "milk", "shellfish", "wheat"]],
    ["crispy-chicken-and-biscuits", "American", "Crispy Chicken & Biscuits", "Fried chicken, cheddar scallion biscuits, chicken chorizo gravy, and two eggs.", ["egg", "gluten", "milk", "wheat"]],
    ["crispy-chicken-sandwich", "American", "Crispy Chicken Sandwich", "Crispy chicken sandwich with lettuce, tomato, pickles, remoulade, and challah bun.", ["egg", "gluten", "wheat"]],
    ["eggplant-parmesan-sandwich", "American", "Eggplant Parmesan Sandwich", "Garlic toast, breaded eggplant, tomato sauce, fresh mozzarella, basil, and Pecorino Romano.", ["egg", "gluten", "milk", "wheat"]],
    ["flourless-chocolate-cake", "American", "Flourless Chocolate Cake", "Flourless chocolate cake with whipped cream, raspberry puree, and crunchy chocolate pearls.", ["egg", "milk"]],
    ["kale-bowl", "American", "Kale Bowl", "Granny Smith apple, toasted almond, red onion, golden raisin, Parmesan, and smoked paprika vinaigrette.", ["milk", "tree-nut"]],
    ["kids-cheeseburger", "American", "KIDS Cheeseburger", "American cheese on brioche; gluten-free sesame seed bun available.", ["gluten", "milk", "sesame", "wheat"]],
    ["kids-chicken-tenders", "American", "KIDS Chicken Tenders", "Chicken tenders with choice of side.", ["gluten", "wheat"]],
    ["kids-mt-breakfast", "American", "KIDS M+T Breakfast", "Two eggs, peppered bacon, and mixed fruit.", ["egg"]],
    ["kids-mac-and-cheese", "American", "KIDS Mac & Cheese", "Mac and cheese with choice of side.", ["gluten", "milk", "wheat"]],
    ["kids-masa-pancake", "American", "KIDS Masa Pancake", "Cornmeal pancake, powdered sugar, berries, and maple syrup.", ["egg", "milk"]],
    ["kids-salmon", "American", "KIDS Salmon", "Salmon with choice of side.", ["fish"]],
    ["kids-waffle", "American", "KIDS Waffle", "Waffle with powdered sugar, berries, and maple syrup.", ["egg", "gluten", "milk", "wheat"]],
    ["kids-yogurt-bowl", "American", "KIDS Yogurt Bowl", "Coconut Greek yogurt, mixed berries, orange segments, and pecan granola. Contains nuts.", ["milk", "tree-nut"]],
    ["mt-classic-breakfast", "American", "M+T Classic Breakfast", "Two eggs, peppered bacon, home fries, cheddar scallion biscuit, and butter.", ["egg", "gluten", "milk", "wheat"]],
    ["mt-smash-burger", "American", "M+T Smash Burger", "Chuck burger, American cheese, pickles, tomato jam, lettuce, dijonnaise, and challah bun. Gluten-free sesame seed bun available.", ["egg", "gluten", "milk", "sesame", "wheat"]],
    ["masa-pancakes", "American", "Masa Pancakes", "Cornmeal pancakes, mole syrup, and berries.", ["egg", "milk"]],
    ["md-crab-dip-boat", "American", "MD Crab Dip Boat", "Old Bay crab dip, crunchy baguette, chive, and smoked cheddar.", ["gluten", "milk", "shellfish", "wheat"]],
    ["nashville-hot-chicken-sandwich", "American", "Nashville Hot Chicken Sandwich", "Nashville hot chicken sandwich with pepperjack, lettuce, tomato, mayo, pickle, and challah.", ["egg", "gluten", "milk", "wheat"]],
    ["old-bay-shrimp-burger", "American", "Old Bay Shrimp Burger", "Shrimp burger with lettuce, tomato, lemon caper tartar sauce, and challah bun.", ["egg", "gluten", "shellfish", "wheat"]],
    ["passionfruit-tart", "American", "Passionfruit Tart", "Passionfruit custard, pineapple, kiwi and mint compote, toasted coconut, and whipped cream.", ["egg", "gluten", "milk", "wheat"]],
    ["pulled-lamb-pita", "American", "Pulled Lamb Pita", "Pulled lamb pita with feta cheese, pickle, chopped tomato cucumber salad, herbed tahini, and choice of side.", ["gluten", "milk", "sesame", "wheat"]],
    ["rye-loaf", "American", "Rye Loaf", "Rye loaf with citrus butter, cherry balsamic jam, and honey whipped ricotta.", ["gluten", "milk", "wheat"]],
    ["scotch-eggs", "American", "Scotch Eggs", "Jammy eggs, chicken chorizo sausage, panko crumbs, and chimichurri mayo.", ["egg", "gluten", "wheat"]],
    ["shrimp-and-grits", "American", "Shrimp & Grits", "Cajun spiced shrimp, andouille sausage cream sauce, and sharp cheddar grit cakes.", ["milk", "shellfish"]],
    ["side-andouille-sausage", "American", "Side Andouille Sausage", "", []],
    ["side-bacon", "American", "Side Bacon", "", []],
    ["side-caesar-salad", "American", "Side Caesar Salad", "", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["side-chicken-chorizo-sausage", "American", "Side Chicken Chorizo Sausage", "", []],
    ["side-egg", "American", "Side Egg", "", ["egg"]],
    ["side-fried-chicken", "American", "Side Fried Chicken", "", ["gluten", "wheat"]],
    ["side-grilled-chicken", "American", "Side Grilled Chicken", "", []],
    ["side-home-fries", "American", "Side Home Fries", "", []],
    ["side-honey-cornbread", "American", "Side Honey Cornbread", "", ["egg", "gluten", "milk", "wheat"]],
    ["side-masa-pancake", "American", "Side Masa Pancake", "", ["egg", "milk"]],
    ["side-salad", "American", "Side Salad", "Mixed greens, tomato, cucumber, red onion, and white balsamic vinaigrette.", []],
    ["side-salmon", "American", "Side Salmon", "", ["fish"]],
    ["side-seasoned-fries", "American", "Side Seasoned Fries", "", []],
    ["side-shrimp", "American", "Side Shrimp", "", ["shellfish"]],
    ["side-steak", "American", "Side Steak", "", []],
    ["side-sweet-potato-fries", "American", "Side Sweet Potato Fries", "", []],
    ["side-toast", "American", "Side Toast", "", ["gluten", "wheat"]],
    ["side-waffle", "American", "Side Waffle", "", ["egg", "gluten", "milk", "wheat"]],
    ["smoked-salmon-toast", "American", "Smoked Salmon Toast", "Boursin cheese, smoked salmon, whipped deviled egg, crispy caper, pickled onion, dill, and Vienna toast.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["steak-and-eggs", "American", "Steak & Eggs", "Bistro filet, two eggs, home fries, and chimichurri.", ["egg"]],
    ["sweet-potato-and-ricotta-donuts", "American", "Sweet Potato and Ricotta Donuts", "Sweet potato and ricotta donuts with cinnamon sugar and salted caramel sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["tagliatelle-pomodoro", "American", "Tagliatelle Pomodoro", "Tagliatelle with tomato sauce, oven roasted tomato, stracciatella, Pecorino Romano, basil, and tomato powder.", ["egg", "gluten", "milk", "wheat"]],
    ["tonys-patty-melt", "American", "Tony's Patty Melt", "Chuck burger, gruyere, pickles, caramelized onions, Catalina dressing, and marble rye. Gluten-free sesame seed bun available.", ["egg", "gluten", "milk", "sesame", "wheat"]],
    ["vegan-breakfast-burrito", "American", "Vegan Breakfast Burrito", "Vegan burrito with Chunk meat, Just Egg, guacamole, pepper and onion, green chile sauce, fries, and home fries.", ["gluten", "soy", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "matt-and-tonys-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Matt & Tony's official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createRocklandsOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/rocklands-bbq-dc-2418-wisconsin-avenue-nw";
  const sourceSummary =
    "Reviewed official Rocklands Toast menu rows; allergens are populated only when the official item name or description identifies allergen-bearing ingredients.";
  const rows = [
    ["4-oz-grilled-burger", "BBQ", "4 oz Grilled Burger", "A quarter pound all beef burger topped with grilled onions and pickles.", ["gluten", "wheat"]],
    ["5-piece-chicken-tenders-with-fries", "BBQ", "5 Piece Chicken Tenders With Fries", "", ["gluten", "wheat"]],
    ["8-oz-grilled-burger", "BBQ", "8 oz Grilled Burger", "A half pound all beef burger topped with grilled onions and pickles.", ["gluten", "wheat"]],
    ["accompaniment-platter-three-side-plate", "BBQ", "Accompaniment Platter (Three Side Plate)", "Three 4 oz sides and a piece of cornbread.", ["egg", "gluten", "milk", "wheat"]],
    ["baby-back-ribs-half-rack", "BBQ", "Baby Back Ribs Half Rack", "Half rack of baby back ribs.", []],
    ["baby-back-ribs-whole-rack", "BBQ", "Baby Back Ribs Whole Rack", "Whole rack of baby back ribs.", []],
    ["bbq-baked-beans", "BBQ", "BBQ Baked Beans", "", []],
    ["bbq-chicken-half", "BBQ", "BBQ Chicken Half", "", []],
    ["bbq-chicken-quarter", "BBQ", "BBQ Chicken Quarter", "", []],
    ["bbq-chicken-whole", "BBQ", "BBQ Chicken Whole", "", []],
    ["bbq-seasoned-fries", "BBQ", "BBQ Seasoned Fries", "", []],
    ["beef-brisket", "BBQ", "Beef Brisket", "", []],
    ["beef-brisket-sandwich", "BBQ", "Beef Brisket Sandwich", "", ["gluten", "wheat"]],
    ["beef-ribs-half-rack-2-bones", "BBQ", "Beef Ribs Half Rack", "Two beef rib bones.", []],
    ["beef-ribs-one-bone", "BBQ", "Beef Ribs One Bone", "One beef rib bone.", []],
    ["beef-ribs-whole-rack-4-bones", "BBQ", "Beef Ribs Whole Rack", "Four beef rib bones.", []],
    ["belly-buster", "BBQ", "Belly Buster", "Pork spare ribs, sausage link, quarter chicken, beef brisket, grilled onions, and one potato roll.", ["gluten", "wheat"]],
    ["bleu-cheese", "BBQ", "Bleu Cheese", "", ["milk"]],
    ["broccoli-and-bacon-salad", "BBQ", "Broccoli & Bacon Salad", "Contains almonds.", ["tree-nut"]],
    ["caesar-salad-with-smoked-chicken", "BBQ", "Caesar Salad with Smoked Chicken", "", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["chicken-and-beef-rib-platter", "BBQ", "Chicken and Beef Rib Platter", "", []],
    ["chicken-and-spare-ribs-platter", "BBQ", "Chicken and Spare Ribs Platter", "Quarter chicken and two pork spare ribs with two sides of choice.", []],
    ["chocolate-chip-cookie", "BBQ", "Chocolate Chip Cookie", "", ["egg", "gluten", "milk", "wheat"]],
    ["chopped-pork", "BBQ", "Chopped Pork", "", []],
    ["chopped-pork-sandwich", "BBQ", "Chopped Pork Sandwich", "", ["gluten", "wheat"]],
    ["collard-greens", "BBQ", "Collard Greens", "", []],
    ["family-meal", "BBQ", "Family Meal", "Meat, three pints of sides, four honey jalapeno cornbread, and four potato rolls.", ["egg", "gluten", "milk", "wheat"]],
    ["feast-for-five", "BBQ", "Feast for Five", "A whole rack of baby back ribs, barbecue chicken, meat, and three pints of sides.", []],
    ["garden-salad", "BBQ", "Garden Salad", "", []],
    ["grilled-catfish-sandwich", "BBQ", "Grilled Catfish Sandwich", "", ["fish", "gluten", "wheat"]],
    ["grilled-chicken-breast-filet-sandwich", "BBQ", "Grilled Chicken Breast Filet Sandwich", "", ["gluten", "wheat"]],
    ["grilled-lamb", "BBQ", "Grilled Lamb", "", []],
    ["grilled-lamb-sandwich", "BBQ", "Grilled Lamb Sandwich", "Barbecued rosemary-spiced lamb.", ["gluten", "wheat"]],
    ["grilled-salmon", "BBQ", "Grilled Salmon", "", ["fish"]],
    ["grilled-salmon-sandwich", "BBQ", "Grilled Salmon Sandwich", "", ["fish", "gluten", "wheat"]],
    ["grilled-vegetable-sandwich", "BBQ", "Grilled Vegetable Sandwich", "", ["gluten", "wheat"]],
    ["grilled-wings", "BBQ", "Grilled Wings", "", []],
    ["honey-jalapeno-cornbread", "BBQ", "Honey Jalapeño Cornbread", "", ["egg", "gluten", "milk", "wheat"]],
    ["hot-italian-sausage", "BBQ", "Hot Italian Sausage", "Comes with grilled onions and grilled peppers.", []],
    ["hot-italian-sausage-sandwich-w-peppers-and-onions", "BBQ", "Hot Italian Sausage Sandwich with Peppers & Onions", "Topped with grilled onions and peppers on a pretzel roll.", ["gluten", "wheat"]],
    ["june-special-dog-salad-with-cornbread", "BBQ", "Dog Salad with Cornbread", "Chopped pork over rice with coleslaw and sweet and smoky BBQ sauce, served with honey jalapeño cornbread.", ["egg", "gluten", "milk", "wheat"]],
    ["kids-chicken-tenders-3", "BBQ", "Kids Chicken Tenders", "", ["gluten", "wheat"]],
    ["kids-chop-pork", "BBQ", "Kids Chop Pork", "", []],
    ["kids-pull-chicken", "BBQ", "Kids Pull Chicken", "", []],
    ["loaded-texas-style-brisket-sandwich", "BBQ", "Loaded Texas-Style Brisket Sandwich", "Thick-cut brisket with Swiss cheese, caramelized onions, and mild horseradish cream.", ["gluten", "milk", "wheat"]],
    ["mac-and-cheese", "BBQ", "Mac & Cheese", "", ["gluten", "milk", "wheat"]],
    ["macaroni-and-cheese", "BBQ", "Macaroni & Cheese", "", ["gluten", "milk", "wheat"]],
    ["macaroni-salad", "BBQ", "Macaroni Salad", "", ["egg", "gluten", "wheat"]],
    ["mexican-street-corn-salad", "BBQ", "Mexican Street Corn Salad", "", ["milk"]],
    ["minted-cucumber-salad", "BBQ", "Minted Cucumber Salad", "", []],
    ["mixed-rib-platter", "BBQ", "Mixed Rib Platter", "One beef rib bone and two pork spare ribs with two sides of choice.", []],
    ["nightingale-ice-cream-sandwich", "BBQ", "Nightingale Ice Cream Sandwich", "", ["egg", "gluten", "milk", "wheat"]],
    ["old-fashioned-mashed-potatoes", "BBQ", "Old Fashioned Mashed Potatoes", "", ["milk"]],
    ["pit-beef", "BBQ", "Pit Beef", "", []],
    ["pit-beef-caliente-sandwich", "BBQ", "Pit Beef Caliente Sandwich", "Pit beef with pepperoncini, raw onions, American cheese, and mayonnaise.", ["egg", "gluten", "milk", "wheat"]],
    ["pit-beef-sandwich", "BBQ", "Pit Beef Sandwich", "Pit beef served with raw onions and horseradish cream on the side.", ["gluten", "milk", "wheat"]],
    ["pork-belly", "BBQ", "Pork Belly", "", []],
    ["pork-belly-sandwich", "BBQ", "Pork Belly Sandwich", "", ["gluten", "wheat"]],
    ["pulled-chicken", "BBQ", "Pulled Chicken", "", []],
    ["pulled-chicken-sandwich", "BBQ", "Pulled Chicken Sandwich", "", ["gluten", "wheat"]],
    ["red-beans-and-rice", "BBQ", "Red Beans & Rice", "", []],
    ["ribs-and-chicken", "BBQ", "Ribs & Chicken", "", []],
    ["rocklands-pearl", "BBQ", "Rocklands Pearl", "Mac and cheese, baked beans, and chopped pork layered in a pint.", ["gluten", "milk", "wheat"]],
    ["slice-of-apple-pie", "BBQ", "Slice of Apple Pie", "", ["egg", "gluten", "milk", "wheat"]],
    ["slice-of-pecan-pie", "BBQ", "Slice of Pecan Pie", "", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["slice-of-pumpkin-pie", "BBQ", "Slice of Pumpkin Pie", "", ["egg", "gluten", "milk", "wheat"]],
    ["slice-of-sweet-potato-pie", "BBQ", "Slice of Sweet Potato Pie", "", ["egg", "gluten", "milk", "wheat"]],
    ["sliced-pork", "BBQ", "Sliced Pork", "", []],
    ["sliced-pork-sandwich", "BBQ", "Sliced Pork Sandwich", "", ["gluten", "wheat"]],
    ["special-apple-pie-250th", "BBQ", "Special Apple Pie", "", ["egg", "gluten", "milk", "wheat"]],
    ["spinach-strawberry-salad", "BBQ", "Spinach Strawberry Salad", "", []],
    ["sweet-potato-fries", "BBQ", "Sweet Potato Fries", "", []],
    ["three-meat-platter", "BBQ", "Three Meat Platter", "Chopped pork, beef brisket, and pulled chicken with two sides of choice and a potato roll.", ["gluten", "wheat"]],
    ["traditional-potato-salad", "BBQ", "Traditional Potato Salad", "", ["egg"]],
    ["veggie-burger", "BBQ", "Veggie Burger", "", ["gluten", "wheat"]],
    ["watermelon-feta-salad", "BBQ", "Watermelon Feta Salad", "", ["milk"]],
    ["whole-apple-pie", "BBQ", "Whole Apple Pie", "", ["egg", "gluten", "milk", "wheat"]],
    ["whole-pecan-pie", "BBQ", "Whole Pecan Pie", "", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["whole-sweet-potato-pie", "BBQ", "Whole Sweet Potato Pie", "", ["egg", "gluten", "milk", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "rocklands-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Rocklands official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createTakumiNavyYardOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/takumi-navy-yard";
  const sourceSummary =
    "Reviewed official Takumi Toast menu rows; allergens are populated only when the official item name or description identifies allergen-bearing ingredients.";
  const rows = [
    ["agedashi-tofu", "Japanese", "Agedashi Tofu", "", ["soy"]],
    ["anago", "Japanese", "Anago", "Saltwater eel; cannot be gluten free.", ["fish", "gluten", "wheat"]],
    ["asparagus-roll", "Japanese", "Asparagus Roll", "", []],
    ["avocado-salad", "Japanese", "Avocado Salad", "Ginger dressing.", []],
    ["bara-chirashi-don", "Japanese", "Bara Chirashi Don", "Supreme sashimi over sushi rice with o-toro, ikura, uni, scallop, quail egg, and more.", ["egg", "fish", "shellfish"]],
    ["blue-crab-roll", "Japanese", "Blue Crab Roll", "", ["shellfish"]],
    ["bluefin-tuna", "Japanese", "Bluefin Tuna", "", ["fish"]],
    ["california-roll", "Japanese", "California Roll", "Imitation crab meat, avocado, and cucumber.", ["fish", "shellfish"]],
    ["charcoal-grilled-new-zealand-lamb-chops-1pcs", "Japanese", "Charcoal-Grilled New Zealand Lamb Chops", "", []],
    ["chicken-karaage", "Japanese", "Chicken Karaage", "", ["gluten", "wheat"]],
    ["chicken-thigh-with-scallion-2-skewers", "Japanese", "Chicken Thigh with Scallion", "", []],
    ["crazy-maki", "Japanese", "Crazy Maki", "Salmon, white fish, jalapeno, tuna, and honey wasabi mayo.", ["egg", "fish"]],
    ["crepe-cake", "Japanese", "Crepe Cake", "", ["egg", "gluten", "milk", "wheat"]],
    ["crispy-rice", "Japanese", "Crispy Rice", "Crispy rice, tobiko, eel sauce, and spicy mayo.", ["egg", "fish", "gluten", "soy", "wheat"]],
    ["dc-roll", "Japanese", "DC Roll", "Shrimp tempura, cheese, snow crab, tobiko, and spicy mayo.", ["egg", "fish", "gluten", "milk", "shellfish", "wheat"]],
    ["dragon", "Japanese", "Dragon", "Eel, cucumber, avocado, and eel sauce.", ["fish", "gluten", "soy", "wheat"]],
    ["eel-sauce", "Japanese", "Eel Sauce", "", ["gluten", "soy", "wheat"]],
    ["eringi-king-oyster-mushroom-2-skewers", "Japanese", "Eringi King Oyster Mushroom", "", []],
    ["fried-chicken-wings-6pcs-soy-garlic", "Japanese", "Fried Chicken Wings Soy Garlic", "", ["gluten", "soy", "wheat"]],
    ["fried-oyster-5pcs", "Japanese", "Fried Oyster", "", ["gluten", "shellfish", "wheat"]],
    ["fried-rice", "Japanese", "Fried Rice", "Onion, mushroom, carrot, snow peas, scallion, and egg. Vegetable fried rice contains no egg.", ["egg"]],
    ["fried-rice-tray", "Japanese", "Fried Rice Tray", "", ["egg"]],
    ["futo-maki", "Japanese", "Futo Maki", "Fatty tuna, tamago, oshiko, chives, cucumber, and wasabi yuzu sauce.", ["egg", "fish"]],
    ["golden-ramen", "Japanese", "Golden Ramen", "Chicken broth, chicken katsu, egg, fish cake, bean sprout, bamboo shoot, nori, wakame, corn, and scallion.", ["egg", "fish", "gluten", "wheat"]],
    ["gyudon", "Japanese", "Gyudon", "Wagyu beef, egg, onion, scallion, and kimchi.", ["egg"]],
    ["hamachi-yellowtail", "Japanese", "Hamachi Yellowtail", "Yellowtail.", ["fish"]],
    ["hamachi-carpaccio", "Japanese", "Hamachi Carpaccio", "Jalapeno, yuzu dressing, and tobiko.", ["fish"]],
    ["harumaki-4pcs", "Japanese", "Harumaki", "Spring roll.", ["gluten", "wheat"]],
    ["hot-mama", "Japanese", "Hot Mama", "Deep fried roll with kani, cheese, salmon, white fish, eel sauce, and spicy mayo.", ["egg", "fish", "gluten", "milk", "shellfish", "soy", "wheat"]],
    ["hotate-scallop", "Japanese", "Hotate Scallop", "Japanese scallop.", ["shellfish"]],
    ["house-salad", "Japanese", "House Salad", "", []],
    ["hurts", "Japanese", "Hurts", "Shrimp tempura, eel, avocado, soy paper, and asparagus.", ["fish", "gluten", "shellfish", "soy", "wheat"]],
    ["ika-squid", "Japanese", "Ika Squid", "Squid.", ["shellfish"]],
    ["ikura-salmon-egg", "Japanese", "Ikura Salmon Egg", "Salmon fish egg.", ["fish"]],
    ["japanese-teriyaki", "Japanese", "Japanese Teriyaki", "Broccoli, pumpkin, rice, and teriyaki sauce. Not gluten free.", ["gluten", "soy", "wheat"]],
    ["japanese-wagyu-fried-rice", "Japanese", "Japanese Wagyu Fried Rice", "Japanese wagyu beef, onion, mushroom, carrot, snow peas, scallion, egg, and asparagus.", ["egg"]],
    ["kanpachi-greater-amberjack", "Japanese", "Kanpachi Greater Amberjack", "Greater amberjack.", ["fish"]],
    ["katsu-curry", "Japanese", "Katsu Curry", "Stamina egg and broccoli.", ["egg", "gluten", "wheat"]],
    ["kinmedai-golden-eye-snapper", "Japanese", "Kinmedai Golden Eye Snapper", "Golden eye snapper.", ["fish"]],
    ["kurodai-black-snapper", "Japanese", "Kurodai Black Snapper", "Black snapper.", ["fish"]],
    ["love-donburi", "Japanese", "Love Donburi", "Selected fish, side pickled vegetable, seaweed, tamago yaki, and fish egg.", ["egg", "fish"]],
    ["madai-red-seabream", "Japanese", "Madai Red Seabream", "Red seabream.", ["fish"]],
    ["maryland-roll", "Japanese", "Maryland Roll", "Blue crab, shishito, Old Bay torched salmon, spicy mayo, and rice pearls.", ["egg", "fish", "shellfish"]],
    ["miso-soup", "Japanese", "Miso Soup", "Tofu, wakame, and green onion.", ["soy"]],
    ["navyyard-roll", "Japanese", "Navyyard Roll", "Tuna, salmon, white fish, wasabi tobiko, spicy basil sauce, and soy paper.", ["fish", "soy"]],
    ["o-toro", "Japanese", "O-toro", "Super fatty bluefin tuna.", ["fish"]],
    ["osaka-roll", "Japanese", "Osaka Roll", "Snow crab, asparagus, shrimp tempura with soy paper, eel sauce, and spicy mayo.", ["egg", "fish", "gluten", "shellfish", "soy", "wheat"]],
    ["philly-roll", "Japanese", "Philly Roll", "Salmon, avocado, and cream cheese.", ["fish", "milk"]],
    ["ponzu-sauce", "Japanese", "Ponzu Sauce", "", ["gluten", "soy", "wheat"]],
    ["pork-dumpling-party-tray", "Japanese", "Pork Dumpling Party Tray", "", ["gluten", "wheat"]],
    ["pork-dumplings-6pcs", "Japanese", "Pork Dumplings", "", ["gluten", "wheat"]],
    ["premium-kitchen-bento-box", "Japanese", "Premium Kitchen Bento Box", "Lobster tempura, shrimp tempura, vegetable tempura, yakitori chicken, vegetable fried rice, and sukiyaki beef.", ["egg", "gluten", "shellfish", "wheat"]],
    ["premium-sushi-bento-box", "Japanese", "Premium Sushi Bento Box", "Nigiri, sashimi, Crazy Maki, takoyaki, and calamari.", ["egg", "fish", "gluten", "shellfish", "wheat"]],
    ["rainbow", "Japanese", "Rainbow", "California roll with imitation crab meat, avocado, cucumber, tuna, salmon, and white fish.", ["fish", "shellfish"]],
    ["riceandnoodle", "Japanese", "Rice & Noodle", "", []],
    ["rock-shrimp", "Japanese", "Rock Shrimp", "Spicy mayo.", ["egg", "shellfish"]],
    ["salmon", "Japanese", "Salmon", "", ["fish"]],
    ["salmon-belly", "Japanese", "Salmon Belly", "", ["fish"]],
    ["salmon-roll", "Japanese", "Salmon Roll", "", ["fish"]],
    ["salmon-skin-roll", "Japanese", "Salmon Skin Roll", "", ["fish"]],
    ["salmon-skin-salad", "Japanese", "Salmon Skin Salad", "Cucumber, fish egg, spicy mayo, eel sauce, and bonito.", ["egg", "fish", "gluten", "soy", "wheat"]],
    ["sawara-japanese-spanish-mackerel", "Japanese", "Sawara Japanese Spanish Mackerel", "Japanese Spanish mackerel.", ["fish"]],
    ["scallop-carpaccio", "Japanese", "Scallop Carpaccio", "Truffle pesto, vinegar mayo, and dry soy sauce.", ["egg", "shellfish", "soy"]],
    ["seaweed-salad", "Japanese", "Seaweed Salad", "", ["sesame"]],
    ["shima-aji-striped-jack", "Japanese", "Shima Aji Striped Jack", "Striped jack.", ["fish"]],
    ["shrimp-2-skewers", "Japanese", "Shrimp Skewers", "", ["shellfish"]],
    ["shrimp-tempura-appetizer-3pcs", "Japanese", "Shrimp Tempura Appetizer", "Shrimp tempura and vegetable tempura.", ["gluten", "shellfish", "wheat"]],
    ["shrimp-tempura-roll", "Japanese", "Shrimp Tempura Roll", "Lettuce and cucumber.", ["gluten", "shellfish", "wheat"]],
    ["snow-blossom-roll", "Japanese", "Snow Blossom Roll", "Crawfish, eel, mango, cheese, crunch curry, soy paper, and salmon.", ["fish", "gluten", "milk", "shellfish", "soy", "wheat"]],
    ["snow-crab-roll", "Japanese", "Snow Crab Roll", "", ["shellfish"]],
    ["soft-shell-crab-roll", "Japanese", "Soft Shell Crab Roll", "", ["shellfish"]],
    ["spicy-crunch-salmon-roll", "Japanese", "Spicy Crunch Salmon Roll", "", ["fish", "gluten", "wheat"]],
    ["spicy-crunch-tuna-roll", "Japanese", "Spicy Crunch Tuna Roll", "", ["fish", "gluten", "wheat"]],
    ["spicy-kani-salad", "Japanese", "Spicy Kani Salad", "Mango, kani, cucumber, and spicy mayo.", ["egg", "fish", "shellfish"]],
    ["spicy-pizza", "Japanese", "Spicy Pizza", "", ["gluten", "milk", "wheat"]],
    ["spicy-seafood-udon-noodle", "Japanese", "Spicy Seafood Udon Noodle", "Shrimp, mussel, Thai chili, bean sprout, lime, lemongrass, curry, coconut milk, squid, tempura flake, fried onion, and mushroom.", ["gluten", "shellfish", "wheat"]],
    ["sriracha-sauce", "Japanese", "Sriracha Sauce", "", []],
    ["steam-rice", "Japanese", "Steam Rice", "", []],
    ["sushi-rice", "Japanese", "Sushi Rice", "", []],
    ["sweet-chili-sauce", "Japanese", "Sweet Chili Sauce", "", []],
    ["takumi-ramen", "Japanese", "Takumi Ramen", "Tonkotsu pork broth, ajitama egg, fish cake, bean sprout, bamboo shoot, nori, wakame, corn, and scallion.", ["egg", "fish", "gluten", "wheat"]],
    ["takumi-roll", "Japanese", "Takumi Roll", "Spicy tuna, avocado, kombu paper, lobster tempura, and truffle sauce.", ["fish", "gluten", "shellfish", "wheat"]],
    ["takumi-salad", "Japanese", "Takumi Salad", "Raw fish, mango, avocado, cucumber, sesame dressing, fruit, and fried wonton wrappers.", ["fish", "gluten", "sesame", "wheat"]],
    ["takumi-supreme-combo-for-two", "Japanese", "Takumi Supreme Combo For Two", "Assorted nigiri, sashimi, one spicy tuna roll, and one shrimp tempura roll.", ["fish", "gluten", "shellfish", "wheat"]],
    ["tartare", "Japanese", "Tartare", "Avocado, scallion, tobiko, crispy masago, soy ginger, and chips.", ["fish", "soy"]],
    ["tobiko-flying-fish-egg", "Japanese", "Tobiko Flying Fish Egg", "Flying fish egg.", ["fish"]],
    ["tofu-roll", "Japanese", "Tofu Roll", "", ["soy"]],
    ["torch", "Japanese", "Torch", "Spicy tuna, avocado, torched fatty tuna, spicy mayo, and rice pearls.", ["egg", "fish"]],
    ["toro", "Japanese", "Toro", "Fatty bluefin tuna.", ["fish"]],
    ["tuna-crudo", "Japanese", "Tuna Crudo", "Truffle ponzu, scallion, seaweed powder, crispy masago, and spring mix.", ["fish", "gluten", "soy", "wheat"]],
    ["tuna-roll", "Japanese", "Tuna Roll", "", ["fish"]],
    ["udon-noodle-soup", "Japanese", "Udon Noodle Soup", "Fish cake, kani, mushroom, bean sprout, napa, wakame, seaweed, carrot, scallion, snow peas, and tempura flake.", ["fish", "gluten", "shellfish", "wheat"]],
    ["unagi", "Japanese", "Unagi", "Freshwater eel; cannot be gluten free.", ["fish", "gluten", "wheat"]],
    ["vegan-ramen", "Japanese", "Vegan Ramen", "Vegan broth, bean sprout, bamboo shoot, nori, wakame, corn, scallion, and tofu.", ["gluten", "soy", "wheat"]],
    ["vege-dumpling-party-tray", "Japanese", "Vegetable Dumpling Party Tray", "", ["gluten", "wheat"]],
    ["vege-dumplings-6pcs", "Japanese", "Vegetable Dumplings", "", ["gluten", "wheat"]],
    ["virginia-roll", "Japanese", "Virginia Roll", "Kimchi, avocado, crunch, kani, basil sauce, kizami wasabi, and soy paper.", ["fish", "gluten", "shellfish", "soy", "wheat"]],
    ["yum-yum-sauce", "Japanese", "Yum Yum Sauce", "", ["egg", "milk"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "takumi-navy-yard-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Takumi official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createToutDeSweetOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/toutdesweet";
  const sourceSummary =
    "Reviewed official Tout de Sweet Toast menu rows; allergens are populated only when official item names or descriptions identify allergen-bearing bakery, dairy, egg, wheat, nut, fish, sesame, soy, or coconut ingredients.";
  const rows = [
    ["1-dozen-pastries-chefs-selection", "Bakery", "1 Dozen Pastries - Chef's Selection", "Chef's daily selection of twelve pastries.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["affogato", "Bakery", "Affogato", "One scoop of vanilla gelato topped with espresso or matcha.", ["milk"]],
    ["almond-croissant", "Bakery", "Almond Croissant", "Traditional butter croissant filled with almond cream and topped with toasted almonds.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["amandine-pear-tart", "Bakery", "Amandine Pear Tart", "Traditional tart made with sweet dough, pear, and almond cream.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["ambassador", "Bakery", "Ambassador", "Vanilla sponge cake with kirsch pastry cream, seasonal fruits, and buttercream frosting.", ["egg", "gluten", "milk", "wheat"]],
    ["avocado-and-pickled-onion-toast", "Bakery", "Avocado & Pickled Onion Toast", "Avocado puree and pickled onions on multigrain bread with side salad.", ["gluten", "wheat"]],
    ["avocado-and-tomato-toast", "Bakery", "Avocado & Tomato Toast", "Avocado puree, baby heirloom tomatoes, and chives on multigrain bread with side salad.", ["gluten", "wheat"]],
    ["baguette", "Bakery", "Baguette", "Traditional French baguette.", ["gluten", "wheat"]],
    ["baguette-tartine", "Bakery", "Baguette Tartine", "Quarter baguette.", ["gluten", "wheat"]],
    ["baked-goods-box-of", "Bakery", "Baked Goods Box", "Selection of pastries, typically including plain croissant, chocolate croissant, almond croissant, pistachio-chocolate croissant, muffin, fruit Danish, or sweet scone.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["black-forest", "Bakery", "Black Forest", "Chocolate sponge cake with cherry brandy syrup, chocolate whipped cream, vanilla whipped cream, and brandy cherries or raspberries.", ["egg", "gluten", "milk", "wheat"]],
    ["blondie", "Bakery", "Blondie", "Homemade blondie with pecans and chocolate chips.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["bostock", "Bakery", "Bostock", "", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["brownie", "Bakery", "Brownie", "Homemade brownie with chocolate chips; nut-free.", ["egg", "gluten", "milk", "wheat"]],
    ["brunch-box", "Bakery", "Brunch Box", "To-go box with choice of pastry, sandwich, mini fruit cup, and beverage.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["burrata-cheese-and-tomato-toast", "Bakery", "Burrata Cheese & Tomato Toast", "Pesto sauce, burrata cheese, baby heirloom tomatoes, and balsamic reduction on multigrain bread with side salad.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["cake-pops", "Bakery", "Cake Pops", "Carrot cake pops covered in white chocolate. Contains walnuts.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["canapes-board", "Bakery", "Canapes Board", "Canapes on mini bamboo plates. Allergy or gluten-free preference may be noted for substitutions.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["charcuterie-cones", "Bakery", "Charcuterie Cones", "Curated mix of cheese, charcuterie, fruit, and a sweet touch.", ["milk"]],
    ["cheese-and-charcuterie-board", "Bakery", "Cheese & Charcuterie Board", "Cheese, charcuterie, fresh and dried fruit, nuts, jam, garnishes, and crackers.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["chocolate-chip-cookie", "Bakery", "Chocolate Chip Cookie", "Homemade chocolate chip cookies.", ["egg", "gluten", "milk", "wheat"]],
    ["chocolate-crunch", "Bakery", "Chocolate Crunch", "Hazelnut dacquoise, dark chocolate mousse, citrus cream, and praline feuilletine.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["classic-cakes", "Bakery", "Classic Cakes", "Build your own cake.", ["egg", "gluten", "milk", "wheat"]],
    ["cookie-board", "Bakery", "Cookie Board", "Board with chocolate chip cookies, madeleines, blondies, brownies, and financiers.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["croissant-au-beurre", "Bakery", "Croissant au Beurre", "Traditional butter croissant.", ["gluten", "milk", "wheat"]],
    ["croque-monsieur", "Bakery", "Croque-Monsieur", "Sandwich made with bechamel, ham, Swiss cheese, and sourdough bread.", ["gluten", "milk", "wheat"]],
    ["crudite-board", "Bakery", "Crudite Board", "Fresh vegetables with hummus, eggplant, or roasted pepper dip.", ["sesame"]],
    ["financier", "Bakery", "Financier", "Traditional brown butter cake made with almond or hazelnut flour.", ["egg", "milk", "tree-nut"]],
    ["fraisier", "Bakery", "Fraisier", "Vanilla sponge cake with kirsch brandy, pastry cream, fresh strawberries, and Italian meringue.", ["egg", "gluten", "milk", "wheat"]],
    ["french-meringues", "Bakery", "French Meringues", "Assortment of seasonal flavored meringues.", ["egg"]],
    ["fresh-fruit", "Bakery", "Fresh Fruit", "Individual pot of fresh fruit.", []],
    ["fresh-fruit-plate", "Bakery", "Fresh Fruit Plate", "Assortment of fruit, cut and plated to order.", []],
    ["fresh-fruit-tart", "Bakery", "Fresh Fruit Tart", "Sweet dough topped with pastry cream and fresh fruits. Contains almond.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["fruit-board", "Bakery", "Fruit Board", "Fresh fruit board.", []],
    ["fruit-charlotte", "Bakery", "Fruit Charlotte", "Lady finger cake, vanilla mousse, cassis gelee, fresh fruit, and vanilla whipped cream.", ["egg", "gluten", "milk", "wheat"]],
    ["fruit-danish", "Bakery", "Fruit Danish", "Croissant dough filled with cream cheese and topped with fresh fruit.", ["gluten", "milk", "wheat"]],
    ["fruit-preserves", "Bakery", "Fruit Preserves", "French fruit preserves.", []],
    ["gelato", "Bakery", "Gelato", "Traditional Italian gelato.", ["milk"]],
    ["ice-cream-sandwich", "Bakery", "Ice Cream Sandwich", "Ice cream sandwich made with macaron shells and Italian gelato.", ["egg", "milk", "tree-nut"]],
    ["in-store-cakes", "Bakery", "In Store Cakes", "Cakes available for same-day pickup.", ["egg", "gluten", "milk", "wheat"]],
    ["kids-lunch-box", "Bakery", "Kids Lunch Box", "Box with small brioche ham and cheese or almond butter and jam sandwich, chips, fruit cup, vanilla madeleine, and beverage.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["large-french-tart", "Bakery", "Large French Tart", "Homemade tart. Contains nuts.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["lemon-curd-blueberry-and-granola-greek-yogurt", "Bakery", "Lemon Curd-Blueberry & Granola Greek Yogurt", "Greek yogurt pot with homemade lemon curd, berry marmalade, and oat granola.", ["egg", "gluten", "milk", "wheat"]],
    ["lemon-tart", "Bakery", "Lemon Tart", "Almond sweet dough topped with lemon curd and Italian meringue.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["lemon-rasp-cake", "Bakery", "Lemon-Rasp Cake", "Vanilla sponge cake with raspberry syrup, lemon cream, fresh raspberries, and whipped cream.", ["egg", "gluten", "milk", "wheat"]],
    ["les-mendiants", "Bakery", "Les Mendiants", "Dark and white chocolate rectangles studded with dried fruit, nuts, and crunchy pearls.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["les-tablettes-de-chocolat", "Bakery", "Les Tablettes de Chocolat", "Homemade chocolate bars with Valrhona chocolate.", ["milk"]],
    ["letter", "Bakery", "Letter", "Custom cheese and charcuterie or macaron letter/number with fruit, cheese, cured meat, antipasti, dried fruit, crackers, or macarons.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["lunch-box", "Bakery", "Lunch Box", "", ["egg", "gluten", "milk", "wheat"]],
    ["lunette-linzer-cookies", "Bakery", "Lunette Linzer Cookies", "Homemade sable cookie filled with dulce de leche or raspberry jam.", ["egg", "gluten", "milk", "wheat"]],
    ["macaron-box-of", "Bakery", "Macaron Box", "Assorted traditional and seasonal French macarons.", ["egg", "milk", "tree-nut"]],
    ["macaron-gift-box-15pcs", "Bakery", "Macaron Gift Box 15pcs", "Assorted traditional and seasonal French macarons.", ["egg", "milk", "tree-nut"]],
    ["macaron-number-or-letter", "Bakery", "Macaron Number or Letter", "Customized macaron piece.", ["egg", "milk", "tree-nut"]],
    ["macarons", "Bakery", "Macarons", "Homemade almond macarons.", ["egg", "milk", "tree-nut"]],
    ["macarons-favor-box", "Bakery", "Macarons Favor Box", "Macaron favor boxes.", ["egg", "milk", "tree-nut"]],
    ["macarons-gift-box-20-pieces", "Bakery", "Macarons Gift Box - 20 Pieces", "Assorted traditional and seasonal French macarons.", ["egg", "milk", "tree-nut"]],
    ["madeleines", "Bakery", "Madeleines", "Traditional French butter cake made with vanilla, honey, and lemon zest.", ["egg", "gluten", "milk", "wheat"]],
    ["mango-raspberry", "Bakery", "Mango Raspberry", "Vanilla sponge cake, mango mousse, and raspberry mousse.", ["egg", "gluten", "milk", "wheat"]],
    ["milk-chocolate-mousse-and-sesame", "Bakery", "Milk Chocolate Mousse & Sesame", "Milk chocolate mousse with black sesame praline, chocolate cake, and speculoos cookie crust.", ["egg", "gluten", "milk", "sesame", "wheat"]],
    ["mudslide-cookies", "Bakery", "Mudslide Cookies", "Dark chocolate cookie.", ["egg", "gluten", "milk", "wheat"]],
    ["muffin", "Bakery", "Muffin", "Homemade muffins with streusel topping.", ["egg", "gluten", "milk", "wheat"]],
    ["multigrain-loaf", "Bakery", "Multigrain Loaf", "Loaf of multigrain flour and seeds.", ["gluten", "wheat"]],
    ["nougat-passion", "Bakery", "Nougat Passion", "Hazelnut dacquoise, passion fruit mousse, and nougat mousse. Gluten free.", ["egg", "milk", "tree-nut"]],
    ["nougatine-brittle", "Bakery", "Nougatine Brittle", "Nougatine or brittle made with almonds and covered with dark chocolate.", ["tree-nut"]],
    ["opera-cake", "Bakery", "Opera Cake", "Almond sponge cake.", ["egg", "milk", "tree-nut"]],
    ["pain-au-chocolat", "Bakery", "Pain au Chocolat", "Traditional butter croissant with chocolate.", ["gluten", "milk", "wheat"]],
    ["pain-aux-raisin", "Bakery", "Pain aux Raisin", "Croissant dough rolled with pastry cream and raisins.", ["egg", "gluten", "milk", "wheat"]],
    ["pain-suisse", "Bakery", "Pain Suisse", "Croissant dough pastry.", ["egg", "gluten", "milk", "wheat"]],
    ["paris-brest-donut", "Bakery", "Paris-Brest Donut", "Pate a choux filled with pastry cream and hazelnut praline, glazed with milk chocolate and hazelnut bits.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["pastry-board", "Bakery", "Pastry Board", "Selection of viennoiseries including butter croissant, pain au chocolat, pain aux raisin, almond croissant, scone, muffin, fruit Danish, and pistachio croissant.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["petit-four-board", "Bakery", "Petit Four Board", "Bite-sized selection of confections with allergy and menu tag.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["pistachio-cherry-cake", "Bakery", "Pistachio-Cherry Cake", "Butter cake with Morello cherry mousse, pistachio mousse, and white-chocolate pistachio glaze.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["pistachio-choc-croissant", "Bakery", "Pistachio-Choc Croissant", "Chocolate croissant filled with pistachio cream and topped with chopped pistachios.", ["gluten", "milk", "tree-nut", "wheat"]],
    ["plugra-unsalted-butter-1-lb", "Bakery", "Plugra Unsalted Butter 1 lb", "Premium European style unsalted butter.", ["milk"]],
    ["pound-cakes", "Bakery", "Pound Cakes", "Homemade pound cake loaf.", ["egg", "gluten", "milk", "wheat"]],
    ["pour-over", "Bakery", "Pour Over", "Made-to-order manual drip coffee.", []],
    ["quiche", "Bakery", "Quiche", "Homemade quiche.", ["egg", "gluten", "milk", "wheat"]],
    ["royal-chocolate", "Bakery", "Royal Chocolate", "Flourless hazelnut dacquoise disks and dark chocolate mousse. Gluten free.", ["egg", "milk", "tree-nut"]],
    ["royal-dacquoise-cake", "Bakery", "Royal Dacquoise Cake", "Flourless hazelnut dacquoise disks, dark chocolate mousse dollops, and praline cream. Gluten free.", ["egg", "milk", "tree-nut"]],
    ["sandwich-board", "Bakery", "Sandwich Board", "Platter with twelve sandwiches cut in half.", ["egg", "gluten", "milk", "wheat"]],
    ["scones", "Bakery", "Scones", "British style scones served with homemade jam.", ["egg", "gluten", "milk", "wheat"]],
    ["sea-salt-caramelized-pecans", "Bakery", "Sea Salt Caramelized Pecans", "Homemade caramelized pecans.", ["tree-nut"]],
    ["signature-hot-cocoa", "Bakery", "Signature Hot Cocoa", "Homemade dark hot cocoa blend.", ["milk"]],
    ["smoked-salmon-and-avocado-toast", "Bakery", "Smoked Salmon & Avocado Toast", "Avocado puree, smoked salmon, and dill on multigrain bread with side salad.", ["fish", "gluten", "wheat"]],
    ["smoked-salmon-and-naan-bread-board", "Bakery", "Smoked Salmon & Naan Bread Board", "Smoked salmon and mini naan bread with whipped cream cheese, olive tapenade, capers, and pickled onions.", ["fish", "gluten", "milk", "wheat"]],
    ["strawberry-and-cream", "Bakery", "Strawberry & Cream", "Vanilla sponge cake with strawberry syrup, vanilla whipped cream, and fresh strawberries.", ["egg", "gluten", "milk", "wheat"]],
    ["strawberry-overnight-oats", "Bakery", "Strawberry Overnight Oats", "Strawberry puree, coconut milk, oats, chia seeds, maple syrup, fruit, and coconut flakes.", ["tree-nut"]],
    ["traditional-tiramisu", "Bakery", "Traditional Tiramisu", "Espresso-soaked ladyfinger layered with mascarpone cheese mousse.", ["egg", "gluten", "milk", "wheat"]],
    ["trio-of-chocolate", "Bakery", "Trio of Chocolate", "Brownie crust base, white and milk chocolate mousse, and dark chocolate sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["white-choc-berry", "Bakery", "White Choc-Berry", "White chocolate mousse with mixed berry insert and vanilla sponge.", ["egg", "gluten", "milk", "wheat"]],
    ["white-chocolate-caramel-tart", "Bakery", "White Chocolate-Caramel Tart", "Tart shell with caramel citrus cremeux, almond sponge cake, and white chocolate-vanilla whipped ganache.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "tout-de-sweet-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Tout de Sweet official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createThompsonItalianFallsChurchOfficialMenuRows() {
  const sourceUrl = "https://order.toasttab.com/online/thompson-italian";
  const sourceSummary =
    "Reviewed official Thompson Italian Toast menu rows; allergens are populated only when the official item name or description identifies allergen-bearing pasta, bread, cheese, cream, egg, seafood, nut, mustard, wheat, or gluten ingredients.";
  const rows = [
    ["arancini-tray", "Italian", "Arancini Tray", "Arancini with spring pea puree, mint, parmesan, and goat cheese.", ["gluten", "milk", "wheat"]],
    ["artichokes-alla-romana", "Italian", "Artichokes Alla Romana", "Lemon aioli and pecorino. Six pieces.", ["egg", "milk"]],
    ["arugula-salad-tray", "Italian", "Arugula Salad Tray", "Arugula salad, aged parmesan, and white balsamic vinaigrette.", ["milk"]],
    ["baked-rigatoni-bolognese-tray", "Italian", "Baked Rigatoni Bolognese Tray", "Baked rigatoni bolognese with parmesan and bechamel.", ["gluten", "milk", "wheat"]],
    ["baked-rigatoni-tray-vegetarian", "Italian", "Baked Rigatoni Tray - Vegetarian", "Baked rigatoni with tomato, basil, and ricotta.", ["gluten", "milk", "wheat"]],
    ["beef-bolognese-1-qt", "Italian", "Beef Bolognese", "Quart of fresh sauce. Housemade pastas are sold separately.", []],
    ["berry-tiramisu", "Italian", "Berry Tiramisu", "Berry mousse, sponge cake, raspberry liqueur, and amaretti crumbs.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["blackberry-upsidedown-cake", "Italian", "Blackberry Upsidedown Cake", "Vanilla whipped cream, blackberry sauce, and candied pecans.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["branzino", "Italian", "Branzino", "Grilled asparagus, ramp aioli, pickled pepper vinaigrette, and grilled lemon.", ["egg", "fish"]],
    ["burrata", "Italian", "Burrata", "Burrata pugliese, Sicilian olive oil, and grilled focaccia.", ["gluten", "milk", "wheat"]],
    ["caesar-little-gem", "Italian", "Caesar Little Gem", "Caesar dressing, parmesan, and breadcrumbs.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["caesar-salad-tray", "Italian", "Caesar Salad Tray", "Caesar dressing, parmesan, and breadcrumbs.", ["egg", "fish", "gluten", "milk", "wheat"]],
    ["catered-meal-for-10-people", "Italian", "Catered Meal for 10 People", "Catered package with salad, pasta, entree, dessert, and focaccia.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["cavatelli", "Italian", "Cavatelli", "Pork ragu, peperonata, and pecorino.", ["gluten", "milk", "wheat"]],
    ["chicken-parmesan", "Italian", "Chicken Parmesan", "Fontina, marinara, and side of spaghetti pomodoro.", ["egg", "gluten", "milk", "wheat"]],
    ["chicken-parmesan-tray", "Italian", "Chicken Parmesan Tray", "Tray of chicken parmesan.", ["egg", "gluten", "milk", "wheat"]],
    ["chicken-tenders", "Italian", "Chicken Tenders", "", ["gluten", "wheat"]],
    ["chocolate-flourless-cake", "Italian", "Chocolate Flourless Cake", "Whole flourless chocolate cake.", ["egg", "milk"]],
    ["chocolate-hazelnut-cake", "Italian", "Chocolate-Hazelnut Cake", "Chocolate cake with toasted hazelnuts.", ["egg", "gluten", "milk", "tree-nut", "wheat"]],
    ["classic-meatball-tray", "Italian", "Classic Meatball Tray", "Meatball tray with parmesan. Contains gluten.", ["gluten", "milk", "wheat"]],
    ["classic-meatballs", "Italian", "Classic Meatballs", "Beef, pork, pancetta, parmesan, and marinara.", ["milk"]],
    ["crispy-mozzarella", "Italian", "Crispy Mozzarella", "Crispy mozzarella with spicy vodka sauce.", ["egg", "gluten", "milk", "wheat"]],
    ["eggplant-mezzaluna", "Italian", "Eggplant Mezzaluna", "Ricotta, parmesan, tomato butter, basil, and breadcrumbs.", ["egg", "gluten", "milk", "wheat"]],
    ["eggplant-parmesan-tray", "Italian", "Eggplant Parmesan Tray", "Tray of eggplant parmesan.", ["egg", "gluten", "milk", "wheat"]],
    ["focaccia", "Italian", "Focaccia", "Large section of freshly baked focaccia.", ["gluten", "wheat"]],
    ["garganelli-gluten-free-1-lb", "Italian", "Garganelli Gluten Free", "Pound of fresh uncooked gluten-free pasta.", []],
    ["garlic-bread", "Italian", "Garlic Bread", "", ["gluten", "milk", "wheat"]],
    ["gemelli-with-mushroom-ragu-tray", "Italian", "Gemelli with Mushroom Ragu Tray", "Gemelli with mushroom ragu, truffle, and parmesan.", ["gluten", "milk", "wheat"]],
    ["gluten-free-garganelli", "Italian", "Gluten-Free Garganelli", "Housemade gluten-free pasta with choice of sauce.", []],
    ["grated-parmesan-1-cup", "Italian", "Grated Parmesan", "Grated aged parmesan.", ["milk"]],
    ["kids-pizza-sticks-tray", "Italian", "Kids Pizza Sticks Tray", "Kids pizza sticks with marinara and fontina cheese. Contains gluten.", ["gluten", "milk", "wheat"]],
    ["kids-pasta", "Italian", "Kids' Pasta", "", ["gluten", "wheat"]],
    ["kids-pizza-sticks", "Italian", "Kids' Pizza Sticks", "Kids meal with pizza sticks, carrot sticks, and French fries.", ["gluten", "milk", "wheat"]],
    ["lasagna", "Italian", "Lasagna", "Pork sausage, bechamel, marinara, and fontina cheese.", ["gluten", "milk", "wheat"]],
    ["lasagna-bolognese-tray", "Italian", "Lasagna Bolognese Tray", "Lasagna bolognese with bechamel, marinara, and fontina cheese.", ["gluten", "milk", "wheat"]],
    ["lasagna-meal-for-6-people", "Italian", "Lasagna Meal for 6 People", "Meal with garlic bread, marinara, salad, lasagna, and olive oil cake.", ["egg", "gluten", "milk", "wheat"]],
    ["lemon-cheesecake", "Italian", "Lemon Cheesecake", "Whole lemon cheesecake.", ["egg", "milk", "tree-nut", "wheat"]],
    ["mac-and-cheese-tray", "Italian", "Mac & Cheese Tray", "Kids mac and cheese tray. Contains gluten.", ["gluten", "milk", "wheat"]],
    ["mafaldine", "Italian", "Mafaldine", "Roasted mushrooms, truffle cream, and parmesan.", ["gluten", "milk", "wheat"]],
    ["octopus-a-la-plancha", "Italian", "Octopus a la Plancha", "Chili aioli, crispy potatoes, jalapeno, and grilled pineapple.", ["egg", "shellfish"]],
    ["olive-oil-cake", "Italian", "Olive Oil Cake", "Whole olive oil cake.", ["egg", "gluten", "wheat"]],
    ["pomodoro-1-qt", "Italian", "Pomodoro", "Vegan quart of fresh sauce. Housemade pastas are sold separately.", []],
    ["rigatoni-1-lb", "Italian", "Rigatoni", "Pound of fresh uncooked pasta.", ["gluten", "wheat"]],
    ["rigatoni-bolognese", "Italian", "Rigatoni Bolognese", "Beef bolognese and aged parmesan.", ["gluten", "milk", "wheat"]],
    ["roasted-carrots", "Italian", "Roasted Carrots", "Bacon sofrito, watercress, smoked-chile yogurt, saba, and spiced pecans.", ["milk", "tree-nut"]],
    ["roasted-chicken", "Italian", "Roasted Chicken", "Pepper-crusted half chicken, vegetables, pancetta-mustard cream, and tarragon salsa verde.", ["milk", "mustard"]],
    ["roasted-chicken-tray", "Italian", "Roasted Chicken Tray", "Boneless roast chicken pieces served with seasonal vegetables.", []],
    ["roasted-garlic-bread-and-marinara-tray", "Italian", "Roasted Garlic Bread & Marinara Tray", "Roasted garlic bread and marinara.", ["gluten", "milk", "wheat"]],
    ["spaghetti-1-lb", "Italian", "Spaghetti", "Pound of fresh uncooked pasta.", ["gluten", "wheat"]],
    ["spaghetti-alla-chitarra", "Italian", "Spaghetti alla Chitarra", "Pomodoro, basil, and parmesan.", ["gluten", "milk", "wheat"]],
    ["tuscan-kale-salad-tray", "Italian", "Tuscan Kale Salad Tray", "Kale salad with strawberries, pickled fennel, goat cheese, orange vinaigrette, and pistachio dukkah.", ["milk", "tree-nut"]],
    ["vanilla-cheesecake", "Italian", "Vanilla Cheesecake", "Sweet cherry compote and amaretti crust. Gluten free.", ["egg", "milk", "tree-nut"]],
    ["vegetarian-lasagna-tray", "Italian", "Vegetarian Lasagna Tray", "Layers of pasta, kale, ricotta, parmesan, and marinara.", ["gluten", "milk", "wheat"]],
  ];

  return rows.map(([id, category, name, description, allergens]) =>
    sanitizeMenuItemDisplayFields({
      id,
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens,
      mayContain: [],
      allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
      evidence: [
        {
          source: "thompson-italian-falls-church-official-toast-menu-review",
          sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
          sourceUrl,
          text: `Reviewed Thompson Italian official Toast menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createReviewedOfficialMenuRows({ sourceUrl, sourceKey, sourceSummary, rows }) {
  return rows.map(([category, name, description]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description: description || undefined,
      ingredientsText: description || undefined,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      evidence: [
        {
          source: sourceKey,
          sourceKind: "official-menu-row-review",
          sourceUrl,
          text: `Reviewed official menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "official-menu-review",
      sourceSummary,
      sourceType: "reviewed-official-menu-repair",
      sourceUrls: [sourceUrl],
    }),
  );
}

function createBobsShanghaiReviewedMenuRows() {
  const sourceUrl = "https://www.bobsshanghai66.com/shanghai-menu.html";
  const sourceSummary =
    "Reviewed Bob's Shanghai 66 official image menu pages; source contains menu images rather than parseable text, so these rows are manually transcribed from clearly visible official menu rows. No official allergen matrix was found.";

  return createReviewedOfficialMenuRows({
    sourceUrl,
    sourceKey: "bobs-shanghai-66-official-image-menu-review",
    sourceSummary,
    rows: [
      ["Vegetables", "Egg Plant with Garlic Sauce Pot", "Eggplant with garlic sauce."],
      ["Vegetables", "Egg Plant with Mushroom Pot", "Eggplant with mushroom."],
      ["Vegetables", "String Bean Szechuan Style", "Szechuan-style string beans."],
      ["Vegetables", "Salt & Pepper Tofu", "Salt and pepper tofu."],
      ["Vegetables", "Spicy Fried Tofu", "Spicy fried tofu."],
      ["Vegetables", "House Tofu", "House tofu."],
      ["Vegetables", "Kung Pao Tofu", "Kung pao tofu."],
      ["Vegetables", "Ma Po Tofu", "Mapo tofu."],
      ["Vegetables", "Broccoli with Garlic Sauce", "Broccoli with garlic sauce."],
      ["Vegetables", "Bean Curd Sheet with Mustard Greens & Edamame", "Bean curd sheet with mustard greens and edamame."],
      ["Market Vegetables", "Watercress with Garlic", "Watercress with garlic."],
      ["Market Vegetables", "Snow Pea Leaf with Garlic", "Snow pea leaf with garlic."],
      ["Market Vegetables", "Yu Choy with Garlic", "Yu choy with garlic."],
      ["Market Vegetables", "Cabbage with Garlic", "Cabbage with garlic."],
      ["Market Vegetables", "Bok Choy with Garlic", "Bok choy with garlic."],
      ["Market Vegetables", "Mixed Veggies with Brown Sauce", "Broccoli, bamboo, carrots, mushroom, and cabbage with brown sauce."],
      ["Noodle / Rice", "Mushrooms Vegetable Noodle Soup", "Mushroom and vegetable noodle soup."],
      ["Noodle / Rice", "Shredded Pork with Mustard Green Noodle Soup", "Noodle soup with shredded pork and mustard greens."],
      ["Noodle / Rice", "House Special Thick Noodle Soup", "House special thick noodle soup."],
      ["Noodle / Rice", "Szechuan Hot and Spicy Beef or Pork Glass Noodles Soup", "Szechuan hot and spicy glass noodle soup with beef or pork."],
      ["Noodle / Rice", "Yunnan Spicy Beef or Lamb Rice Noodle Soup", "Yunnan spicy rice noodle soup with beef or lamb."],
      ["Noodle / Rice", "Szechuan Style Beef Stew Noodle Soup", "Szechuan-style beef stew noodle soup."],
      ["Noodle / Rice", "Beef & Tendon Stew Noodle Soup", "Beef and tendon stew noodle soup."],
      ["Noodle / Rice", "Seafood Noodle Soup", "Seafood noodle soup."],
      ["Noodle / Rice", "Chicken Wonton Noodle Soup", "Chicken wonton noodle soup."],
      ["Noodle / Rice", "Pork Wonton Noodle Soup", "Pork wonton noodle soup."],
      ["Noodle / Rice", "Dry Noodles with Scallion Sauce", "Dry noodles with scallion sauce."],
      ["Noodle / Rice", "Dry Noodles with Pork & Bean Sauce", "Dry noodles with pork and bean sauce, ja jang noodle style."],
      ["Noodle / Rice", "Dan Dan Beef Noodle", "Dan dan beef noodle."],
      ["Noodle / Rice", "Singapore Curry Rice Noodle", "Singapore curry rice noodle with pork, beef, chicken, shrimp, vegetable, or combo."],
      ["Noodle / Rice", "Yang Chow Fried Rice", "Yang Chow fried rice."],
      ["Noodle / Rice", "Chicken Leg on Rice with Tea Egg", "Chicken leg on rice with tea egg."],
      ["Noodle / Rice", "Pork Chop on Rice with Tea Egg", "Pork chop on rice with tea egg."],
      ["Noodle / Rice", "Double Cooked Pork Belly over Rice", "Double cooked pork belly over rice."],
      ["Noodle / Rice", "Seafood Combo over Rice", "Seafood combo over rice."],
      ["Soup", "Hot & Sour Soup", "Hot and sour soup."],
      ["Soup", "Egg Drop Corn Soup", "Egg drop corn soup."],
      ["Soup", "Chicken Corn Soup", "Chicken corn soup."],
      ["Soup", "Pork Wonton Soup", "Pork wonton soup."],
      ["Soup", "Sour Cabbage, Flounder Fillet in Soup", "Sour cabbage and flounder fillet soup."],
      ["Shanghainese Tapas", "Egg and Cruller Wrap", "Egg and cruller wrap."],
      ["Shanghainese Tapas", "Pork with Long Horn Pepper Wrap", "Pork with long horn pepper wrap."],
      ["Shanghainese Tapas", "Crispy Pork Chop or Crispy Chicken Leg", "Crispy pork chop or crispy chicken leg."],
      ["Shanghainese Tapas", "Scallion Pancake", "Scallion pancake."],
      ["Shanghainese Tapas", "Sticky Rice with Pork & Mushroom Shu Mai", "Sticky rice with pork and mushroom shu mai."],
      ["Shanghainese Tapas", "Shrimp & Chicken Shu Mai", "Shrimp and chicken shu mai."],
      ["Shanghainese Tapas", "Shrimp & Pork Shu Mai", "Shrimp and pork shu mai."],
      ["Shanghainese Tapas", "Chef Special Pork Fried Dumplings", "Chef special pork fried dumplings."],
      ["Shanghainese Tapas", "Vegetable Dumplings", "Vegetable dumplings."],
      ["Shanghainese Tapas", "Shrimp Dumplings", "Shrimp dumplings."],
      ["Shanghainese Tapas", "Leek & Pork Dumplings", "Leek and pork dumplings."],
      ["Shanghainese Tapas", "Spicy Chicken Wontons", "Spicy chicken wontons."],
      ["Shanghainese Tapas", "Spicy Pork Wontons", "Spicy pork wontons."],
    ],
  });
}

function createCourtsideThaiReviewedMenuRows() {
  const sourceUrl = "https://courtsidethai.com/menu/";
  const sourceSummary =
    "Reviewed Courtside Thai official menu page; replaced option/choice fragments with source-backed dish rows from the visible official HTML menu text. No official allergen matrix was found.";

  return createReviewedOfficialMenuRows({
    sourceUrl,
    sourceKey: "courtside-thai-official-menu-review",
    sourceSummary,
    rows: [
      ["Thai Starters", "Satay", "Thai grilled chicken skewers with cucumber relish and peanut dipping sauce."],
      ["Thai Starters", "Nam Tok", "Charcoal-grilled beef with chili-lime juice, mint, and onions."],
      ["Thai Starters", "Larb", "Choice of minced chicken or pork with aromatic herbs on lettuce leaves."],
      ["Thai Starters", "Courtside Thai Dumplings", "Ka Nom Jeeb with shrimp, crabmeat, and chicken topped with fried garlic and cilantro."],
      ["Thai Starters", "Spring Rolls", "Crispy seasoned vegetable rolls and shiitake with sour and sweet dip."],
      ["Thai Starters", "Courtsy Rolls", "Fried rolls stuffed with chicken, pork, taro, carrot, and light chili-garlic sauce."],
      ["Thai Starters", "Bites of Calamari", "Beer-battered calamari slices deep-fried."],
      ["Thai Starters", "Thai Sun-Dried Beef", "Fried marinated flank steak strips with herbs, coriander, and sweet sticky rice."],
      ["Thai Starters", "Tod Mon Pla", "Thai fried fish cakes with curry paste, cucumber, onion, and peanut relish."],
      ["Thai Starters", "Kiew Grob", "Crispy fried stuffed wontons with ground peanut sweet chili sauce."],
      ["Thai Starters", "Tornado Tofu", "Fried tofu with roasted crushed peanut sweet and sour sauce."],
      ["Classic Soups", "Tom Yum", "Spicy lemongrass soup with mushrooms, onions, kaffir lime leaves, cilantro, and choice of shrimp, chicken, seafood, or vegetables."],
      ["Classic Soups", "Chef Wonton Soup", "Soft wontons stuffed with minced shrimp and pork in clear broth."],
      ["Classic Soups", "Thai Jasmine Rice Soup", "Chicken and Thai jasmine rice soup with scallion and cilantro."],
      ["Classic Soups", "Tom Kha", "Coconut milk soup with galangal, mushrooms, cilantro, and choice of shrimp, chicken, seafood, or vegetables."],
      ["Classic Soups", "Tofu & Veggies Soup", "Soft tofu with mixed vegetables in light vegetable broth."],
      ["Healthy Salads", "Cucumber Salad", "Fresh cucumber and red onion with clear vinaigrette and coriander."],
      ["Healthy Salads", "Thai Papaya Salad", "Green papaya with chili peppers, lime juice, string beans, cherry tomatoes, and peanuts."],
      ["Healthy Salads", "Grilled Beef Salad", "Grilled beef with greens, tomato, cucumber, cilantro, spring onions, red onions, and chili-lime dressing."],
      ["Healthy Salads", "Grilled Shrimp & Mango Salad", "Grilled shrimp with lemon roasted chili-lime dressing, mango, lemongrass, red onions, scallions, and mint."],
      ["Healthy Salads", "Gourmet Calamari Salad", "Calamari with lemon, chili peppers, cherry tomatoes, greens, onions, and shallots."],
      ["Healthy Salads", "Supreme Salad", "Shrimp, sea scallops, calamari, and mussels with garlic-pepper-lime sauce over green salad."],
      ["The Favorites", "Ramayama", "Chicken with curried peanut sauce over steamed broccoli and fried shallots."],
      ["The Favorites", "Pla Ma Muang", "Rainbow trout with peppers-lime, mango, cashew nuts, shallots, and cilantro."],
      ["The Favorites", "The Sea of Love", "Shrimp and sea scallops in roasted red pepper sauce with onions, peppers, and cashew nuts."],
      ["The Favorites", "Siam Sarm Chan", "Pork belly with onions, garden peppers, garlic, and basil."],
      ["The Favorites", "Ma Kea Chao Wang", "Shrimp and chicken in sweet red pepper sauce with tamarind, fried eggplants, and cilantro."],
      ["The Favorites", "Gae Pad Pah", "Lamb in Thai jungle chili sauce with eggplant, string beans, zucchini, bamboo shoots, rhizome roots, and basil."],
      ["The Favorites", "Karee Ruam Mit", "Shrimp, chicken, and scallops in yellow curry with potatoes, onions, coconut milk, and cucumber-shallot vinaigrette."],
      ["The Favorites", "Gai Pad Sarm Rod", "Battered fried marinated chicken with Thai three-flavored sauce, steamed vegetables, and jasmine rice."],
      ["The Favorites", "Courtside Catfish", "Crispy catfish filets with red curry-basil sauce, rhizome, and peppers."],
      ["The Favorites", "Gaeng Sapparos", "Pineapple red curry with chicken, shrimp, sea scallops, peppers, tomato, basil, and coconut milk."],
      ["The Favorites", "Pad Thai Talay", "Noodles with sea scallops, shrimp, calamari, dried red beancurd, spring onions, bean sprouts, eggs, and peanuts."],
      ["The Favorites", "Guey Teow Tang Taek", "Street noodles with chicken, shrimp, eggs, broccoli, bean sprouts, spring onions, and wide rice noodles."],
      ["Thai Curry", "Gaeng Phed", "Red curry paste with peppers, bamboo shoots, coconut milk, and basil."],
      ["Thai Curry", "Gaeng Karee", "Thai curry paste with potatoes and onions in coconut milk with cucumber relish."],
      ["Thai Curry", "Gaeng Keow Wan", "Green curry paste with Thai eggplant, basil, and coconut milk."],
      ["Thai Curry", "Gaeng Panang", "Panang curry with coconut milk, peppers, and kaffir lime leaves."],
      ["Thai Curry", "Gaeng Masaman", "Peanut-flavored curry paste with potatoes, onions, and coconut milk."],
      ["Thai Curry", "Gaeng Pah", "Jungle curry with Thai herbs, spices, leaves, chilies, and vegetables."],
      ["Thai Curry", "Duck Red Curry", "Boneless duck in pineapple red curry with tomatoes, grapes, basil, and coconut milk."],
      ["Thai Curry", "Lamb Yellow Curry", "Lamb in yellow curry with potatoes, onions, coconut milk, and cucumber-shallot vinaigrette."],
      ["Thai Curry", "Chef Seafood Panang", "Sea scallops, shrimp, calamari, and mussels in panang curry and coconut milk."],
      ["Noodles & Rice", "Pad Thai", "Noodles with choice of shrimp or chicken, eggs, dried red beancurd, spring onions, bean sprouts, and peanuts."],
      ["Noodles & Rice", "Pad Woonsen", "Shrimp or chicken with vegetables, eggs, and vermicelli clear noodles."],
      ["Noodles & Rice", "Thai Drunken Noodles", "Spicy noodles with string beans, tomatoes, basil, and choice of chicken, beef, tofu, or seafood."],
      ["Noodles & Rice", "Pad See Ew", "Wide rice noodles with choice of chicken, beef, pork, or tofu, broccoli, and eggs."],
      ["Noodles & Rice", "Thai Lard Na", "Chicken, beef, pork, or tofu with gravy sauce, broccoli, and wide rice noodles."],
      ["Noodles & Rice", "The Mama Bowl", "Noodle bowl with chicken, shrimp, scallions, cilantro, and crispy fried wontons."],
      ["Noodles & Rice", "Thai Shiitake Noodle", "Wide rice noodles with shiitake mushrooms, chicken, shrimp, spring onions, eggs, and lettuce."],
      ["Noodles & Rice", "Kao Pad", "Fried rice with eggs, peas, carrots, tomato, onions, scallions, and choice of protein."],
      ["Noodles & Rice", "Kao Pad Gra Prow", "Thai basil fried rice with string beans, tomatoes, and choice of protein."],
      ["Noodles & Rice", "Pineapple Fried Rice", "Pineapple fried rice with peas, carrots, onions, scallions, raisins, and cashew nuts."],
      ["Vegetables", "Pad Kana", "Chinese broccoli sauteed with crushed garlic-bean sauce."],
      ["Vegetables", "Pad Ma Kea Yao", "Long eggplants with peppers-garlic sauce and basil."],
      ["Vegetables", "Pad Pak Ruam Mit", "Mixed vegetables in delicate sauce with garlic."],
      ["Vegetables", "Vegetable Pad Thai", "Vegetable noodles with dried beancurd, eggs, bean sprouts, scallions, and peanuts."],
      ["Vegetables", "Vegetable Drunken Noodles", "Vegetable drunken noodles with chili-pepper sauce, tomatoes, green beans, and basil."],
      ["Desserts", "Sweet Sticky Rice and Fresh Mango", "Sweet sticky rice with fresh mango."],
      ["Desserts", "Fried Banana and Vanilla Ice Cream", "Fried banana with vanilla ice cream."],
      ["Desserts", "Thai Sticky Rice and Ice Cream", "Thai sticky rice with ice cream."],
    ],
  });
}

function createCharmThaiReviewedThirdPartyMenuRows() {
  const sourceUrl = "https://www.grubhub.com/restaurant/charm-thai-restaurant-8408-georgia-ave-silver-spring/281799";
  const sourceSummary =
    "Reviewed Charm Thai public menu evidence. The official site exposes menu categories and points ordering to Toast, but the fetched official Wix/Toast payload did not expose stable item rows; these rows are from the public Grubhub menu and are not official allergen evidence.";
  const rows = [
    ["Best Sellers", "Curry Puff", "Curry puff appetizer."],
    ["Best Sellers", "Garden Roll", "Garden roll appetizer."],
    ["Best Sellers", "Steamed Dumpling", "Steamed dumpling appetizer."],
    ["Noodle & Rice", "Pad Kee Mao", "Drunken noodle stir-fry."],
    ["Noodle & Rice", "Pad Thai", "Pad Thai noodles."],
    ["Noodle & Rice", "Chicken Fried Rice", "Chicken fried rice."],
    ["Noodle & Rice", "Crab Meat Fried Rice", "Fried rice with crab meat."],
    ["Curry", "Green Curry", "Thai green curry."],
    ["Curry", "Panang Curry", "Thai panang curry."],
    ["Soup", "Tom Yum Soup", "Thai hot and sour soup."],
    ["Chef's Special", "Branzino", "Branzino fish entree."],
    ["Monthly Special", "Pork Ribs Southern Curry", "Monthly special highlighted on the official Charm Thai menu page."],
    ["Dessert", "Thai-Style Fried Banana", "Thai-style fried banana dessert."],
  ];

  return rows.map(([category, name, description]) =>
    sanitizeMenuItemDisplayFields({
      id: slugifyReviewedRowId(`${category}-${name}`),
      name,
      category,
      description,
      ingredientsText: description,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      evidence: [
        {
          source: "charm-thai-reviewed-public-menu",
          sourceKind: "reviewed-third-party-menu-row",
          sourceUrl,
          text: `Reviewed public menu row: ${name}${description ? ` - ${description}` : ""}`,
        },
      ],
      sourceKind: "reviewed-third-party-menu",
      sourceSummary,
      sourceType: "reviewed-third-party-menu-repair",
      sourceUrls: [sourceUrl, "https://www.mycharmthai.com/menu"],
    }),
  );
}

const reviewedRestaurantItemReplacements = [
  {
    restaurantIds: ["bob-s-shanghai-66-washington-dc-dc-metro"],
    rows: createBobsShanghaiReviewedMenuRows(),
    note: "Replaced zero-row Bob's Shanghai output with Codex-reviewed rows manually transcribed from the official image menu pages; no official allergen matrix was found.",
    officialAllergenStatus: "not-found",
  },
  {
    restaurantIds: ["replacement-courtside-thai-cuisine-fairfax-va"],
    rows: createCourtsideThaiReviewedMenuRows(),
    note: "Replaced Courtside Thai option/choice fragments with Codex-reviewed rows from the official HTML menu page; no official allergen matrix was found.",
    officialAllergenStatus: "not-found",
  },
  {
    restaurantIds: ["osm-jack-s-place-11761082628"],
    rows: [],
    note: "Removed Jack's Place rows because the configured source produced cuisine/contact/location cards rather than menu items; no reliable official menu rows were found in the current source.",
    officialAllergenStatus: "not-found",
  },
  {
    restaurantIds: ["osm-la-brasita-10119939334"],
    rows: [],
    note: "Removed La Brasita rows because the configured source produced website testimonial-widget template text rather than menu items; no reliable official menu rows were found in the current source.",
    officialAllergenStatus: "not-found",
  },
  {
    restaurantIds: ["osm-charm-thai-1671377421"],
    rows: createCharmThaiReviewedThirdPartyMenuRows(),
    note: "Replaced zero-row Charm Thai output with reviewed public menu rows after the official Wix/Toast sources did not expose stable parseable item rows in fetch; rows are not official allergen evidence.",
    officialAllergenStatus: "not-found",
  },
  {
    restaurantIds: ["osm-bibibop-asian-6952285839", "osm-bibbop-7802068505"],
    rows: createBibibopOfficialRows(),
    note: "Replaced damaged BIBIBOP PDF extraction rows with Codex-reviewed official item-level allergen matrix rows from the April 2026 BIBIBOP Nutrition & Allergen Guide.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["replacement-olazzo-bethesda-md"],
    rows: createOlazzoOfficialMenuRows(),
    note: "Replaced malformed Olazzo packed-list parser output with Codex-reviewed rows from the official Olazzo menu page.",
    officialAllergenStatus: "not-found",
  },
  {
    restaurantIds: ["hawkers-asian-street-food-bethesda-md-dc-metro"],
    rows: createHawkersReviewedOfficialRows(),
    note: "Replaced noisy Hawkers allergen-guide scrape output with Codex-reviewed rows from the official visual allergen matrix.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["osm-botanero-11895212138"],
    rows: createBotaneroReviewedMenuRows(),
    note: "Replaced damaged Botanero PDF/website row-boundary output with Codex-reviewed rows from the official dinner and brunch menu PDFs.",
    officialAllergenStatus: "not-found",
  },
  {
    restaurantIds: ["chain-toastique"],
    rows: createToastiqueOfficialGuideRows(),
    note: "Replaced mixed Toastique Shopify/nutrition-page output with Codex-reviewed official rows parsed from the Toastique Allergen & Dietary Guide.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["bartaco-wharf-dc"],
    rows: createBartacoEveryBiteOfficialRows(),
    note: "Replaced weak Bartaco disclosure-only rows with Codex-reviewed item-level official allergen rows from the EveryBite widget GraphQL source.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["st-james-dc"],
    rows: createStJamesOfficialDinnerRows(),
    note: "Replaced St. James row-boundary bleed with Codex-reviewed official dinner menu rows and separated direct ingredients from the global cross-contact notice.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["el-presidente-dc"],
    rows: createElPresidenteOfficialMenuRows(),
    note: "Replaced shifted El Presidente WordPress menu extraction with Codex-reviewed rows parsed from the official menu page structure and row-level ingredient text.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["pastis-dc"],
    rows: createPastisOfficialMenuRows(),
    note: "Replaced shifted Pastis DC WordPress menu extraction with Codex-reviewed rows parsed from the official menu tab structure and row-level ingredient text.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["all-purpose-shaw-dc"],
    rows: createAllPurposeShawOfficialMenuRows(),
    note: "Replaced All-Purpose Shaw low-coverage official menu output with Codex-reviewed rows parsed from the official menu descriptions and removed drink/time/navigation artifacts.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["blue-duck-tavern-dc"],
    rows: createBlueDuckTavernOfficialMenuRows(),
    note: "Replaced Blue Duck Tavern low-coverage official menu output with Codex-reviewed rows parsed from the official breakfast, lunch, dinner, and lounge menu descriptions and removed option fragments.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["occidental-dc"],
    rows: createOccidentalOfficialMenuRows(),
    note: "Replaced The Occidental shifted official menu output with Codex-reviewed rows parsed from the official menu tab structure and row-level ingredient text.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["et-voila-dc"],
    rows: createEtVoilaOfficialMenuRows(),
    note: "Replaced Et Voila low-coverage Wix menu output with Codex-reviewed rows parsed from the official structured menu payload and removed Wix marketing artifacts.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["el-viejo-silver-spring"],
    rows: createElViejoOfficialMenuRows(),
    note: "Replaced El Viejo low-coverage official menu output with Codex-reviewed rows parsed from the official menu descriptions and removed website template artifacts.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["tapori-dc"],
    rows: createTaporiOfficialMenuRows(),
    note: "Replaced Tapori low-coverage official menu output with Codex-reviewed rows parsed from the official menu descriptions and removed duplicate section/header artifacts.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["gregorys-coffee-dc"],
    rows: createGregorysCoffeeOfficialMenuRows(),
    note: "Replaced Gregorys Coffee low-coverage Shopify menu output with Codex-reviewed rows parsed from official product descriptions and corrected vegan item allergen handling.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["la-casina-capitol-hill-dc"],
    rows: createLaCasinaOfficialMenuRows(),
    note: "Replaced La Casina low-coverage Toast menu output with Codex-reviewed rows parsed from official item descriptions and promoted source-backed pizza, pinsa, seafood, nut, dairy, and dessert allergens.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["boogy-and-peel-dupont-dc"],
    rows: createBoogyAndPeelOfficialMenuRows(),
    note: "Replaced Boogy & Peel low-coverage Toast menu output with Codex-reviewed rows parsed from official food item descriptions and removed beverage/menu-size artifacts.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["chiko-dc"],
    rows: createChikoOfficialMenuRows(),
    note: "Replaced CHIKO low-coverage Toast menu output with Codex-reviewed rows parsed from official item descriptions and promoted source-backed seafood, peanut, sesame, soy, wheat-noodle, egg, dairy, and nut evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["muncheez-dc"],
    rows: createMuncheezOfficialMenuRows(),
    note: "Replaced Muncheez low-coverage official menu output with Codex-reviewed website and Toast rows, promoted source-backed bread, sesame, dairy, egg, nut, wheat, and crepe allergens, and removed marketing/template fragments.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["peets-coffee-dmv", "chain-peet-s-coffee"],
    rows: createPeetsCoffeeOfficialMenuRows(),
    note: "Replaced Peet's Coffee low-coverage menu output with a shared Codex-reviewed official product menu, promoted source-backed latte, breakfast sandwich, pastry, egg, dairy, wheat, and protein-drink evidence, and removed homepage catalog/order artifacts.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["two-fifty-bbq-dc"],
    rows: createTwoFiftyBbqOfficialMenuRows(),
    note: "Replaced 2Fifty Texas BBQ low-coverage Toast menu output with Codex-reviewed rows parsed from official item descriptions, explicit allergen disclosures, and explicit allergen-free statements.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["rocklands-bbq-dc"],
    rows: createRocklandsOfficialMenuRows(),
    note: "Replaced Rocklands low-coverage Toast menu output with Codex-reviewed official menu rows, removed canned soda/sauce catalog artifacts, and promoted source-backed sandwich, roll, cornbread, cheese, mayo, fish, dessert, nut, wheat, gluten, egg, and milk evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["takumi-navy-yard-dc"],
    rows: createTakumiNavyYardOfficialMenuRows(),
    note: "Replaced Takumi Navy Yard low-coverage Toast output with Codex-reviewed official menu rows and promoted source-backed fish, shellfish, tempura, udon, ramen, dumpling, egg, soy, sesame, dairy, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["tout-de-sweet-bethesda-dc-metro"],
    rows: createToutDeSweetOfficialMenuRows(),
    note: "Replaced Tout de Sweet low-coverage Toast bakery output with Codex-reviewed official menu rows and promoted source-backed pastry, tart, croissant, dairy, egg, almond, hazelnut, pistachio, pecan, sesame, salmon, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["thompson-italian-falls-church-dc-metro"],
    rows: createThompsonItalianFallsChurchOfficialMenuRows(),
    note: "Replaced Thompson Italian Falls Church low-coverage Toast output with Codex-reviewed official menu rows, removed operational catering setup artifacts, and promoted source-backed pasta, focaccia, breadcrumbs, cheese, cream, egg, seafood, nut, mustard, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["bon-fresco-rockville-dc-metro"],
    rows: createBonFrescoOfficialMenuRows(),
    note: "Replaced bon fresco low-coverage Toast menu output with Codex-reviewed rows parsed from official sandwich, salad, and side descriptions.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["sonnys-pizza-dc"],
    rows: createSonnysPizzaOfficialMenuRows(),
    note: "Replaced Sonny's Pizza low-coverage Toast menu output with Codex-reviewed rows parsed from official pizza, focaccia, salad, and contains-note descriptions.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["zinnia-silver-spring-dc-metro"],
    rows: createZinniaOfficialMenuRows(),
    note: "Replaced Zinnia low-coverage Toast menu output with Codex-reviewed rows parsed from official item descriptions and explicit contains notes.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["k-wings-centreville-dc-metro"],
    rows: createKWingsOfficialMenuRows(),
    note: "Replaced K-Wings low-coverage Toast menu output with Codex-reviewed rows parsed from official battered chicken, noodle, seafood, corn dog, rice, and side descriptions.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["ama-dc"],
    rows: createAmaOfficialMenuRows(),
    note: "Replaced Ama low-coverage Toast menu output with Codex-reviewed rows parsed from official focaccia, pasta, sandwich, seafood, cheese, pesto, and explicit anchovy descriptions.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["claudios-table-dc"],
    rows: createClaudiosTableOfficialMenuRows(),
    note: "Replaced Claudio's Table low-coverage Toast menu output with Codex-reviewed rows parsed from official pasta, pizza, seafood, cheese, nut, mustard, and dessert descriptions.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["jack-rose-dining-saloon-washington-dc-dc-metro"],
    rows: createJackRoseOfficialMenuRows(),
    note: "Replaced Jack Rose low-coverage mixed website/Toast output with Codex-reviewed food rows from the official menu, removed drink/catalog artifacts, and promoted source-backed seafood, dairy, egg, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["mikko-dc"],
    rows: createMikkoOfficialMenuRows(),
    note: "Replaced Mikko low-coverage Wix/Toast menu output with Codex-reviewed food rows from official menu payloads, removed event/wine/cocktail/imported-retail artifacts, and promoted source-backed bakery, dairy, egg, seafood, mustard, nut, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["ghostburger-dc"],
    rows: createGhostburgerOfficialMenuRows(),
    note: "Replaced Ghostburger low-coverage website/Toast output with Codex-reviewed food rows from official menu descriptions, removed category/beverage artifacts and pairing prose, and promoted source-backed bun, roll, fried, cheese, mayo, ranch, seafood, peanut, mustard, milk, egg, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["doi-moi-washington-dc-dc-metro"],
    rows: createDoiMoiOfficialMenuRows(),
    note: "Replaced doi moi low-coverage Toast output with Codex-reviewed rows from official menu descriptions, removed category/wine/soda/promotion artifacts, and promoted source-backed bao, banh mi, wheat wrapper, dumpling, shrimp, fish sauce, salmon, peanut, soy, egg, milk, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["sweetwater-tavern-falls-church-va-dc-metro"],
    rows: createSweetwaterTavernOfficialMenuRows(),
    note: "Replaced Sweetwater Tavern low-coverage official API output with Codex-reviewed food rows, removed beer/growler/package artifacts, and promoted source-backed seafood, shellfish, dairy, egg, mustard, sesame, tree nut, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["the-majestic-by-santiago-lopez-alexandria-va-dc-metro"],
    rows: createMajesticOfficialMenuRows(),
    note: "Replaced The Majestic low-coverage PDF output with Codex-reviewed official menu rows, removed legend/header/footer and row-boundary bleed artifacts, and promoted source-backed seafood, shellfish, dairy, egg, soy, sesame, tree nut, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["texas-jack-s-barbecue-washington-dc-dc-metro"],
    rows: createTexasJacksOfficialMenuRows(),
    note: "Replaced Texas Jack's low-coverage Toast/PDF output with Codex-reviewed official menu rows, removed download/section artifacts and PDF bleed, and promoted source-backed sandwich, bun, egg roll, cheese, queso, dessert, nut, fish, mayo, mustard, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
  {
    restaurantIds: ["matt-and-tony-s-all-day-kitchen-bar-alexandria-va-dc-metro"],
    rows: createMattAndTonysOfficialMenuRows(),
    note: "Replaced Matt & Tony's low-coverage Toast output with Codex-reviewed official menu rows, removed waitlist/promo artifacts, and promoted source-backed fish, shellfish, egg, dairy, bread, pasta, waffle, biscuit, nut, sesame, soy, wheat, and gluten evidence.",
    officialAllergenStatus: "extracted",
  },
];

const reviewedRestaurantItemReplacementIds = new Set(
  reviewedRestaurantItemReplacements.flatMap((replacement) => replacement.restaurantIds),
);

const reviewedOfficialCrossContactNotes = new Map([
  [
    "longhorn-steakhouse",
    {
      source: "official-longhorn-allergen-guide",
      text:
        "Reviewed official LongHorn Steakhouse allergen guide: normal kitchen operations may involve shared cooking/preparation areas; grill/fryer items present special cross-contact risk and are identified in the guide.",
    },
  ],
  [
    "red-lobster",
    {
      source: "official-red-lobster-allergen-guide",
      text:
        "Reviewed official Red Lobster allergen guide: shared cooking/preparation areas mean cross-contact cannot be eliminated; the preparation marker denotes special risk of cross-contamination of all allergens due to cooking method.",
    },
  ],
  [
    "yard-house",
    {
      source: "official-yard-house-allergen-guide",
      text:
        "Reviewed official Yard House allergen guide: shared cooking/preparation areas are used; grill/fryer items are marked as special cross-contamination risk for all allergens due to cooking method.",
    },
  ],
]);

const repository = JSON.parse(await fs.readFile(repositoryPath, "utf8"));
const restoreRepository = JSON.parse(await fs.readFile(reviewedRestoreRepositoryPath, "utf8"));
const manifest = await getDefaultIngredientIntelligenceManifest();
let addedRows = 0;
let restoredRows = 0;
let classifierRecoveredRows = 0;
let suppressedRecoveredRows = 0;
let predicateSuppressedRows = 0;
let reviewedOverrideRows = 0;
let replacedRestaurantRows = 0;
let packedPricedRowsExpanded = 0;
let packedPricedItemsAdded = 0;

function officialItemCountForRestaurant(restaurant) {
  return (restaurant.items ?? []).filter((item) =>
    /official/i.test(String(item?.allergenSourceType ?? "")) ||
    item?.officialSource === true ||
    item?.officialAllergenSource === true,
  ).length;
}

const inlineOfficialAllergenTerms = new Map([
  ["gluten", "gluten"],
  ["wheat", "wheat"],
  ["milk", "milk"],
  ["dairy", "milk"],
  ["egg", "egg"],
  ["eggs", "egg"],
  ["soy", "soy"],
  ["sesame", "sesame"],
  ["fish", "fish"],
  ["finfish", "fish"],
  ["fin fish", "fish"],
  ["shellfish", "shellfish"],
  ["peanut", "peanut"],
  ["peanuts", "peanut"],
  ["tree nut", "tree-nut"],
  ["tree nuts", "tree-nut"],
  ["nuts", "tree-nut"],
  ["almond", "tree-nut"],
  ["almonds", "tree-nut"],
  ["walnut", "tree-nut"],
  ["walnuts", "tree-nut"],
  ["pecan", "tree-nut"],
  ["pecans", "tree-nut"],
  ["cashew", "tree-nut"],
  ["cashews", "tree-nut"],
  ["pistachio", "tree-nut"],
  ["pistachios", "tree-nut"],
  ["hazelnut", "tree-nut"],
  ["hazelnuts", "tree-nut"],
  ["pine nut", "tree-nut"],
  ["pine nuts", "tree-nut"],
  ["coconut", "tree-nut"],
]);

reviewedItemFieldOverrides.set(
  "daily-provisions-dupont-dc",
  new Map(
    [
      "avocado-toast",
      "bacon-egg-and-cheese-sandwich",
      "blueberry-lemon-muffin",
      "caramel-chocolate-chunk-cookie",
      "chicken-milanese-sandwich",
      "chicken-milanese-with-arugula-salad",
      "chicken-soup",
      "chicken-soup-and-sandwich-combo",
      "cinnamon-cruller",
      "crispy-potatoes",
      "egg-and-cheese-sandwich",
      "everything-croissant",
      "granola",
      "grilled-cheese",
      "grilled-cheese-sandwich",
      "herb-chicken-salad-sandwich",
      "jammy-egg-provisions",
      "kale-caesar-salad",
      "maple-cruller",
      "mashed-potatoes",
      "molasses-spice-cookie",
      "patty-melt",
      "salmon-fillet",
      "salmon-salad-nicoise",
      "sausage-egg-and-cheese-sandwich",
      "scoop-of-tuna-salad",
      "seared-salmon",
      "seared-salmon-main",
      "sliced-smoked-salmon",
      "the-goldilox",
      "the-lovechild",
      "the-lumberjack",
      "the-pastry-box",
      "tuna-melt",
      "tuna-salad-cup",
      "tuna-salad-sandwich",
    ].map((id) => [
      id,
      {
        allergenSourceType: "official-ingredients",
        sourceSummary:
          "Reviewed Daily Provisions official Toast row text: direct ingredient terms were mapped to app allergens.",
      },
    ]),
  ),
);

reviewedItemFieldOverrides.set(
  "bandit-taco-dc",
  new Map(
    [
      "adobo-chicken-bowl",
      "adobo-chicken-burrito",
      "adobo-chicken-quesdilla",
      "adobo-chicken-torta",
      "al-pastor-bowl",
      "al-pastor-burrito",
      "al-pastor-quesadilla",
      "bacon-and-egg-taco-until-3pm",
      "baja-fish-5-side",
      "baja-fish-bowl",
      "baja-fish-burrito",
      "baja-fish-taco",
      "bandit-salsa-trio",
      "barbacoa-bowl",
      "barbacoa-burrito",
      "barbacoa-quesadilla",
      "birria-quesadilla",
      "birria-tacos-3-tacos",
      "birria-torta",
      "breakfast-bowl-until-3-pm",
      "breakfast-burrito-until-3pm",
      "breakfast-quesadilla-until-3pm",
      "breakfast-torta-until-3pm",
      "carnitas-bowl",
      "carnitas-burrito",
      "carnitas-quesadilla",
      "carnitas-torta",
      "cheese-quesdilla",
      "chicken-tinga-bowl",
      "chicken-tinga-burrito",
      "chicken-tinga-quesadilla",
      "chicken-tinga-yuca-loca",
      "chips-and-queso",
      "chocolate-tres-leches-cake",
      "chorizo-and-egg-taco-until-3pm",
      "chorizo-bowl",
      "chorizo-burrito",
      "chorizo-quesadilla",
      "crispy-shrimp-taco",
      "fried-chicken-and-egg-taco-until-3pm",
      "fried-chicken-torta",
      "gios-fried-chicken-bowl",
      "gios-fried-chicken-burrito",
      "kids-cheese-burrito",
      "kids-cheese-quesadilla-combo",
      "kids-chicken-quesadilla-combo",
      "kids-chicken-taco",
      "kids-steak-quesadilla-combo",
      "kids-steak-taco",
      "korean-beef-bowl",
      "korean-beef-burrito",
      "korean-beef-quesadilla",
      "korean-beef-torta",
      "korean-beef-yuca-loca",
      "mushroom-burrito",
      "nachoschoose-protein",
      "refried-beans-and-egg-taco-until-3pm",
      "shrimp-5-side",
      "shrimp-bowl",
      "shrimp-burrito",
      "shrimp-fajita-32-pieces",
      "shrimp-quesadilla",
      "side-of-queso",
      "skirt-steak-bowl",
      "skirt-steak-burrito",
      "skirt-steak-quesadilla",
      "steak-and-egg-taco-until-3pm",
      "steak-torta",
      "street-corn",
      "telera-pan-torta",
      "tofu-bowl",
      "tofu-burrito",
      "tres-leches",
      "veggie-bowl",
      "veggie-burrito",
      "veggie-quesadilla",
      "veggie-taco",
      "wild-mushrooms-bowl",
      "wild-mushrooms-quesadilla",
    ].map((id) => [
      id,
      {
        allergenSourceType: "official-ingredients",
        sourceSummary:
          "Reviewed Bandit Taco official Toast row text: direct ingredient terms were mapped to app allergens.",
      },
    ]),
  ),
);

function allergenIdsFromInlineText(value) {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/tree\s+nuts?/g, "tree nuts")
    .replace(/\bcoconut\s+oil\b/g, "")
    .replace(/[()/&,+]/g, " ");
  const allergens = new Set();

  for (const [term, id] of inlineOfficialAllergenTerms) {
    if (new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i").test(text)) {
      allergens.add(id);
    }
  }

  if (/\bflour\b/i.test(text)) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (/\bnot\s+gluten[- ]?free\b|\bcontains?\s+gluten\b|\bgluten\s+allergens?\b/i.test(text)) {
    allergens.add("gluten");
  }

  return Array.from(allergens);
}

function stripOptionalAddOnTail(value) {
  return String(value ?? "")
    .replace(
      /\b(?:add(?:\s+a)?\s+protein|choose(?:\s+a|\s+your)?\s+protein|choice\s+of\s+protein)\s*(?:[-:–]|$)[\s\S]*$/i,
      "",
    )
    .replace(
      /\badd\s+(?:chicken|shrimp|steak|salmon|fish)\s+for\s+\$?\d[\s\S]*$/i,
      "",
    )
    .trim();
}

function allergenMentionedInBaseText(allergen, value) {
  const text = String(value ?? "");
  switch (allergen) {
    case "milk":
      return /\b(?:milk|dairy|cheese|queso|cream|butter|feta|goat cheese|manchego|parmesan|mozzarella|cheddar|gruy[eè]re)\b/i.test(text);
    case "egg":
      return /\b(?:egg|eggs|aioli|mayo|mayonnaise|custard)\b/i.test(text);
    case "fish":
      return /\b(?:fish|salmon|tuna|ahi|cod|halibut|branzino|sea bass)\b/i.test(text);
    case "shellfish":
      return /\b(?:shellfish|shrimp|lobster|crab|oyster|oysters|clam|clams|mussel|mussels|scallop|scallops)\b/i.test(text);
    case "wheat":
    case "gluten":
      return /\b(?:wheat|gluten|flour|bread|bun|roll|pasta|noodle|tortilla|pita|cracker|crouton)\b/i.test(text);
    case "tree-nut":
      return /\b(?:tree nuts?|nuts?|almond|walnut|pecan|cashew|pistachio|hazelnut|coconut)\b/i.test(text);
    case "peanut":
      return /\bpeanuts?\b/i.test(text);
    case "soy":
      return /\b(?:soy|tamari|tofu)\b/i.test(text);
    case "sesame":
      return /\b(?:sesame|tahini)\b/i.test(text);
    default:
      return true;
  }
}

function normalizeOfficialInlineAllergenDeclarations(item, restaurant) {
  if (
    item?.allergenSourceType === "official-global-cross-contact-note" ||
    /\bmay contain or come into contact with major allergens\b/i.test(String(item?.sourceSummary ?? ""))
  ) {
    return item;
  }

  const description = String(item?.description ?? "");
  const sourceUrls = [
    ...(item?.sourceUrls ?? []),
    ...(item?.evidence ?? []).map((entry) => entry?.sourceUrl).filter(Boolean),
  ].join(" ");
  const canReplayEvidence =
    restaurant?.id === "quincy-hall-arlington-dc-metro" || /\border\.toasttab\.com\/online\/quincyhall\b/i.test(sourceUrls);
  const evidenceText = canReplayEvidence
    ? (item?.evidence ?? []).map((entry) => String(entry?.text ?? "")).join(" ")
    : "";
  const sourceSummary = String(item?.sourceSummary ?? "");
  const parseText = `${description} ${evidenceText}`;
  const mayContainParseText = `${parseText} ${sourceSummary}`;
  const globalNoticeText = `${parseText} ${sourceSummary}`;
  const globalMayContainMatch = globalNoticeText.match(
    /\b(?:our food|menu items?|food prepared here|items prepared here|products?|facility|kitchen|restaurant)\b[\s\S]{0,160}?\b(?:may contain|may contain or come into contact with|may contain or contact|may come into contact with|come into contact with|cross[- ]?contact(?: is)? possible with)\s+([^.]+)/i,
  );
  const hasGlobalMayContainNotice = Boolean(globalMayContainMatch);
  const hasInlineAllergenDeclaration =
    /\bContains?:?\s+[^.]*?\b(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|fin\s*fish|finfish|shellfish|peanuts?|tree nuts?|nuts)\b/i.test(
      parseText,
    ) ||
    /\bContains?:?\s+[^.]*?\bflour\b/i.test(parseText) ||
    /\bnot\s+gluten[- ]?free\b/i.test(parseText) ||
    /\bContains?:?\s+[^.]*?\bcoconut\b/i.test(parseText) ||
    /\b(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts|coconut)(?:\s*[/,&]\s*(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts|coconut))*\s+Allergens?\b/i.test(
      parseText,
    );

  if (!/official/i.test(String(item?.allergenSourceType ?? "")) && !hasInlineAllergenDeclaration) {
    return item;
  }

  const directAllergens = new Set(item?.allergens ?? []);
  const mayContain = new Set(item?.mayContain ?? []);
  const parsedDirectAllergens = new Set();
  const parsedMayContain = new Set();

  if (hasGlobalMayContainNotice) {
    for (const allergen of allergenIdsFromInlineText(globalMayContainMatch?.[1] ?? "")) {
      mayContain.add(allergen);
      parsedMayContain.add(allergen);
    }
  }

  for (const match of parseText.matchAll(/\bContains?:?\s+([^.]*?)(?=\.|\s+Cross[- ]?contact|\s+Possible\s+cross\s+contact|$)/gi)) {
    const preceding = parseText.slice(Math.max(0, match.index - 5), match.index);

    if (/\bmay\s*$/i.test(preceding)) {
      continue;
    }

    const directSegment = match[1]
      .replace(/\bnon[- ]?dairy(?:\s+\w+){0,3}\s+yogurt\b/gi, "")
      .replace(/\bnon[- ]?dairy\b/gi, "")
      .replace(/\band\s+ingredients?\s+from\s+facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?[\s\S]*$/i, "")
      .replace(/\bingredients?\s+from\s+facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?[\s\S]*$/i, "")
      .replace(/\band\s+ingredients?\s+processed\s+in\s+a\s+facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?[\s\S]*$/i, "")
      .replace(/\bingredients?\s+processed\s+in\s+a\s+facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?[\s\S]*$/i, "")
      .replace(/\band\s+ingredients?\s+made\s+in\s+a\s+facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?[\s\S]*$/i, "")
      .replace(/\bingredients?\s+made\s+in\s+a\s+facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?[\s\S]*$/i, "")
      .trim();

    for (const allergen of allergenIdsFromInlineText(directSegment)) {
      directAllergens.add(allergen);
      parsedDirectAllergens.add(allergen);
    }
  }

  for (const match of parseText.matchAll(
    /\b((?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts|coconut)(?:\s*[/,&]\s*(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts|coconut))*)\s+Allergens?\b/gi,
  )) {
    for (const allergen of allergenIdsFromInlineText(match[1])) {
      directAllergens.add(allergen);
      parsedDirectAllergens.add(allergen);
    }
  }

  for (const match of parseText.matchAll(
    /\b(?:Possible\s+cross\s+contact\s+with|Cross[- ]?contact\s+(?:possible\s+)?with|Cross[- ]?contact\s+with)\s+([^.]+)/gi,
  )) {
    for (const allergen of allergenIdsFromInlineText(match[1])) {
      mayContain.add(allergen);
      parsedMayContain.add(allergen);
    }
  }

  for (const match of mayContainParseText.matchAll(
    /\b(?:cross[- ]?contact|allergen alert)[\s\S]{0,120}?\b(?:with|contact with)\s+([^.]+)/gi,
  )) {
    for (const allergen of allergenIdsFromInlineText(match[1])) {
      mayContain.add(allergen);
      parsedMayContain.add(allergen);
    }
  }

  for (const match of mayContainParseText.matchAll(
    /\b(?:(?:some|all)\s+(?:dishes|items|products)\s+)?may contain\s+([^.]+)/gi,
  )) {
    for (const allergen of allergenIdsFromInlineText(match[1])) {
      mayContain.add(allergen);
      parsedMayContain.add(allergen);
    }
  }

  for (const match of mayContainParseText.matchAll(
    /\bfacilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?\s+([^.]+)/gi,
  )) {
    for (const allergen of allergenIdsFromInlineText(match[1])) {
      mayContain.add(allergen);
      parsedMayContain.add(allergen);
    }
  }

  for (const match of mayContainParseText.matchAll(
    /\bingredients?\s+(?:processed|made)\s+in\s+a\s+facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?\s+([^.]+)/gi,
  )) {
    for (const allergen of allergenIdsFromInlineText(match[1])) {
      mayContain.add(allergen);
      parsedMayContain.add(allergen);
    }
  }

  if (parsedMayContain.size === 0) {
    mayContain.clear();
  } else {
    if (hasGlobalMayContainNotice && parsedDirectAllergens.size === 0) {
      directAllergens.clear();
    } else {
      for (const allergen of parsedMayContain) {
        if (!parsedDirectAllergens.has(allergen)) {
          directAllergens.delete(allergen);
        }
      }

      for (const allergen of directAllergens) {
        if (!parsedMayContain.has(allergen)) {
          mayContain.delete(allergen);
        }
      }
    }
  }

  const shouldReplaceInlineSourceSummary =
    (hasGlobalMayContainNotice && parsedDirectAllergens.size === 0) ||
    !item.sourceSummary ||
    item.sourceSummary ===
      "Official source describes shared-equipment or cross-contact risk; stored as Review rather than direct Contains." ||
    item.sourceSummary ===
      "Reviewed official inline allergen wording: direct allergens and cross-contact concerns were parsed separately." ||
    item.sourceSummary === "Reviewed official inline allergen wording: direct allergen labels were parsed from menu text.";
  const nextSourceSummary = shouldReplaceInlineSourceSummary
    ? reviewedOfficialSourceSummary(item, parsedDirectAllergens, parsedMayContain, hasGlobalMayContainNotice)
    : item.sourceSummary;

  if (
    directAllergens.size === (item?.allergens?.length ?? 0) &&
    mayContain.size === (item?.mayContain?.length ?? 0) &&
    nextSourceSummary === item.sourceSummary
  ) {
    return item;
  }

  return {
    ...item,
    allergenSourceType: hasGlobalMayContainNotice && parsedDirectAllergens.size === 0
      ? "official-global-cross-contact-note"
      : /official/i.test(String(item?.allergenSourceType ?? ""))
      ? item.allergenSourceType
      : "official-ingredients",
    allergens: Array.from(directAllergens),
    mayContain: Array.from(mayContain),
    sourceSummary: nextSourceSummary,
  };
}

function normalizeOfficialSemicolonAllergenDisclosure(item) {
  if (!/official/i.test(String(item?.allergenSourceType ?? ""))) {
    return item;
  }

  const disclosure = (item?.evidence ?? [])
    .map((entry) => {
      const sourceKind = String(entry?.sourceKind ?? entry?.source ?? "");
      const text = String(entry?.text ?? "").trim();

      if (!/official-allergen-disclosure/i.test(sourceKind)) {
        return "";
      }

      const match = text.match(/^Official product allergen disclosure:\s*(.+)$/i);
      return match?.[1]?.trim() ?? "";
    })
    .find(Boolean);

  if (!disclosure) {
    return item;
  }

  const [directText, mayContainText = ""] = disclosure.includes(";")
    ? disclosure.split(/;(.*)/s)
    : [disclosure, ""];
  const directAllergens = new Set(allergenIdsFromInlineText(directText));
  const mayContain = new Set(allergenIdsFromInlineText(mayContainText));

  if (directAllergens.size === 0 && mayContain.size === 0) {
    return item;
  }

  const nextAllergens = Array.from(directAllergens);
  const nextMayContain = Array.from(mayContain).filter((allergen) => !directAllergens.has(allergen));

  if (
    nextAllergens.join("|") === (item.allergens ?? []).join("|") &&
    nextMayContain.join("|") === (item.mayContain ?? []).join("|")
  ) {
    return item;
  }

  return {
    ...item,
    allergens: nextAllergens,
    mayContain: nextMayContain,
    sourceSummary:
      item.sourceSummary && /official .* allergen disclosure/i.test(item.sourceSummary)
        ? item.sourceSummary
        : disclosure.includes(";")
        ? `${item.sourceSummary ?? "Reviewed official row-level allergen evidence."} Reviewed official semicolon allergen disclosure: allergens before the semicolon are direct item allergens; allergens after the semicolon are stored as cross-contact caution.`
        : `${item.sourceSummary ?? "Reviewed official row-level allergen evidence."} Reviewed official product allergen disclosure: explicit product disclosure is authoritative for direct item allergens.`,
  };
}

function hasOfficialMenuIngredientEvidence(item) {
  const sourceType = String(item?.sourceType ?? "");
  const sourceKind = String(item?.sourceKind ?? "");
  const sourceSummary = String(item?.sourceSummary ?? "");
  const evidence = Array.isArray(item?.evidence) ? item.evidence : [];
  const evidenceText = evidence
    .map((entry) => `${entry?.sourceKind ?? entry?.source ?? ""} ${entry?.sourceUrl ?? ""} ${entry?.text ?? ""}`)
    .join(" ");
  const sourceUrls = evidence.map((entry) => String(entry?.sourceUrl ?? "")).join(" ");
  const sourceSignal = `${sourceType} ${sourceKind} ${sourceSummary} ${evidenceText}`;

  if (
    /\b(?:allmenus|opentable|ubereats|grubhub|yelp|tripadvisor|google\.com\/maps)\b/i.test(sourceUrls) ||
    /\b(?:manual-quality-review|official-allergen-disclosure)\b/i.test(sourceSignal)
  ) {
    return false;
  }

  return (
    /\b(?:next-flight-products|json-structured|pdf-menu|html-card|product-page|toast|square|clover|shopify|wix|imenupro-menu-script)\b/i.test(
      sourceSignal,
    ) &&
    /\b(?:https?:\/\/|official|menu|order|restaurant|toasttab|thompsonrestaurants|squarespace|cloudfront|wp-content|lukeslobster|lostdogcafe)\b/i.test(
      sourceSignal,
    )
  );
}

function normalizeOfficialObviousIngredientSignals(item) {
  const alreadyOfficial = /official/i.test(String(item?.allergenSourceType ?? ""));
  const officialMenuIngredientEvidence = hasOfficialMenuIngredientEvidence(item);

  if (!alreadyOfficial && !officialMenuIngredientEvidence) {
    return item;
  }

  const sourceSummary = String(item?.sourceSummary ?? "");
  const isRowTextOnlyMapping =
    /\bReviewed official row text: obvious ingredient terms were mapped to app allergens\b/i.test(sourceSummary);

  if (
    alreadyOfficial &&
    /official-global-cross-contact-note/i.test(String(item?.allergenSourceType ?? "")) ||
    ((item?.mayContain?.length ?? 0) > 0 &&
      /\b(?:cross[- ]?contact|shared-equipment|shared equipment|global allergen notice)\b/i.test(
        sourceSummary,
      ))
  ) {
    return item;
  }

  if (alreadyOfficial && isRowTextOnlyMapping && /official-allergen-menu/i.test(String(item?.allergenSourceType ?? ""))) {
    return {
      ...item,
      allergenSourceType: "official-ingredients",
    };
  }

  if (
    alreadyOfficial &&
    /official-allergen-menu/i.test(String(item?.allergenSourceType ?? "")) &&
    ((item?.allergens ?? []).length > 0 || (item?.mayContain ?? []).length > 0)
  ) {
    return item;
  }

  if (
    alreadyOfficial &&
    /official-allergen-menu/i.test(String(item?.allergenSourceType ?? "")) &&
    /\brow-level allergen markers were parsed\b/i.test(sourceSummary)
  ) {
    return item;
  }

  const rawText = [
    item?.name,
    item?.description,
    ...(item?.evidence ?? [])
      .filter((entry) => {
        const hasRemovedBleedReview = [
          item?.sourceSummary,
          ...(item?.evidence ?? []).map((evidenceEntry) => evidenceEntry?.text),
        ]
          .filter(Boolean)
          .some((textValue) => /\bremoved\b.{0,80}\b(?:bleed|neighboring|boundary)\b/i.test(String(textValue)));
        const sourceKind = String(entry?.sourceKind ?? entry?.source ?? "");
        if (hasRemovedBleedReview) {
          return false;
        }
        if (/official-allergen-disclosure|manual-quality-review/i.test(sourceKind)) {
          return false;
        }
        if (
          /\bOfficial\b.{0,80}\b(?:allergen|nutrition)\b.{0,80}\b(?:matrix|guide|PDF|widget|API)\b/i.test(
            String(entry?.text ?? ""),
          )
        ) {
          return false;
        }
        if (
          /pdf-menu/i.test(sourceKind) &&
          /\b(?:text blob was menu bleed|menu bleed|global .* note|dietary[- ]legend bleed)\b/i.test(
            String(item?.sourceSummary ?? ""),
          )
        ) {
          return false;
        }
        if (/\brow-boundary bleed\b/i.test(String(item?.sourceSummary ?? ""))) {
          return false;
        }
        return true;
      })
      .map((entry) => entry?.text),
  ]
    .filter(Boolean)
    .join(" ");
  const optionStrippedRawText = stripOptionalAddOnTail(rawText);
  const hasOptionalTail = optionStrippedRawText.length > 0 && optionStrippedRawText.length < rawText.length;
  const text = optionStrippedRawText
    .replace(/\b(?:ingredients?\s+from\s+)?facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?\b[\s\S]*$/i, "")
    .replace(/\b(?:may\s+contain|processed\s+in|made\s+in|manufactured\s+in)\b[\s\S]*$/i, "")
    .replace(/\*?\s*\bmay\s+contain\s+raw\s+or\s+undercooked\b[\s\S]*$/i, "")
    .replace(/\bconsuming\s+raw\s+or\s+undercooked\b[\s\S]*$/i, "")
    .toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (hasOptionalTail) {
    for (const allergen of Array.from(allergens)) {
      if (!allergenMentionedInBaseText(allergen, optionStrippedRawText)) {
        allergens.delete(allergen);
      }
    }
  }

  for (const allergen of item?.mayContain ?? []) {
    if (!allergenMentionedInBaseText(allergen, text)) {
      allergens.delete(allergen);
    }
  }

  const hasAny = (pattern) => pattern.test(text);
  const hasFreeLabel = (labelPattern) =>
    new RegExp(`\\b(?:${labelPattern})[- ]free\\b|\\bfree\\s+of\\s+(?:${labelPattern})\\b`, "i").test(text);
  const hasAnimalSuppression = hasAny(/\b(?:vegan|plant[- ]based)\b/i);
  const hasMilkSuppression =
    hasAnimalSuppression ||
    (hasAny(/\b(?:w\/o|without|no)\s+cheese\b|\bno\s+(?:dairy|milk)\b|\b(?:dairy|milk)[- ]free\b/i) &&
      !hasAny(
        /\b(?:not\s+(?:dairy|milk)[- ]?free|not\s+made\s+(?:dairy|milk)[- ]?free|cannot\s+be\s+made\b.{0,40}\b(?:dairy|milk)[- ]?free|can'?t\s+be\s+made\b.{0,40}\b(?:dairy|milk)[- ]?free)\b/i,
      ));
  const hasGlutenSuppression = hasAny(/\b(?:gluten[- ]free|gf|without gluten|no gluten)\b/i);
  const hasReviewedNoEggDisclosure = /\bno\s+egg\s+disclosure\b/i.test(String(item?.sourceSummary ?? ""));
  const hasReviewedNoWheatGlutenDisclosure =
    /\bno\b[^.]{0,60}\b(?:wheat|gluten|wheat\/gluten)\s+disclosure\b/i.test(
      String(item?.sourceSummary ?? ""),
    );

  if (
    !hasMilkSuppression &&
    hasAny(
      /\b(?:cheese|queso|cream|creamy|butter|yogurt|ice cream|cheesecake|tres leches|condensed milk|evaporated milk|ras\s+malai|malai|mascarpone|paneer|kheer|gruy[eè]re|gruyere|gorgonzola|parmesan|parm|parmigiano|pecorino|havarti|fontina|fontinella|gouda|raclette|blue cheese|cream cheese|cheddar|mozzarella|cotija|feta|ricotta|stracciatella|fonduta|asiago|pimento cheese|quesadilla|quesdilla|mornay|bechamel|b[eé]chamel)\b/i,
    )
  ) {
    allergens.add("milk");
  }

  if (
    !hasGlutenSuppression &&
    !hasReviewedNoWheatGlutenDisclosure &&
    hasAny(
      /\b(?:gluten|ravioli|fusilli|macaroni|mac & cheese|mac and cheese|pasta|sub roll|hoagie roll|lobster roll|split[- ]top roll|table rolls?|sliders?|sandwich(?:es)?|(?<!crab\s)cakes?|cheesecake|graham cracker|puff pastry|pastry|croissant|cruller|muffin|cookies?|brownies?|focaccia|sourdough|rye|toast|bread\s*crumbs?|breadcrumbs?|pita chips?|flour tortilla|burrito|quesadillas?|quesdillas?|tortas?|telera|bread|bun|buns|wontons?)\b/i,
    )
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (
    !hasReviewedNoEggDisclosure &&
    !hasAnimalSuppression &&
    !hasFreeLabel("eggs?") &&
    hasAny(/\b(?:egg|eggs|mayo|mayonnaise|aioli|hollandaise|custard|(?<!crab\s)cakes?|cheesecake|ravioli)\b/i)
  ) {
    allergens.add("egg");
  }

  if (!hasAnimalSuppression && !hasFreeLabel("fish") && hasAny(/\b(?:fish|tuna|salmon|branzino|swai|cod|halibut|ahi)\b/i)) {
    allergens.add("fish");
  }

  if (
    !hasAnimalSuppression &&
    !hasFreeLabel("shellfish") &&
    hasAny(/\b(?:shellfish|shrimp|lobster|scallops?|crab|oysters?|clams?|mussels?)\b/i)
  ) {
    allergens.add("shellfish");
  }

  if (!hasFreeLabel("peanuts?") && hasAny(/\b(?:peanut|peanuts|peanut butter)\b/i)) {
    allergens.add("peanut");
  }

  if (
    !hasFreeLabel("tree nuts?|nuts?|coconut") &&
    hasAny(/\b(?:tree nuts?|walnuts?|pecans?|almonds?|pistachios?|cashews?|hazelnuts?|coconut)\b/i)
  ) {
    allergens.add("tree-nut");
  }

  if (!hasFreeLabel("soy") && hasAny(/\b(?:soy|sweet soy|soy sauce|tamari)\b/i)) {
    allergens.add("soy");
  }

  if (!hasFreeLabel("sesame") && hasAny(/\b(?:sesame|tahini)\b/i)) {
    allergens.add("sesame");
  }

  if (allergens.size === (item?.allergens ?? []).length) {
    return item;
  }

  return {
    ...item,
    allergenSourceType: alreadyOfficial ? item.allergenSourceType : "official-ingredients",
    allergens: Array.from(allergens),
    mayContain: item?.mayContain ?? [],
    sourceSummary:
      item.sourceSummary === "Official source row reviewed; no major concern marked in source row." || !item.sourceSummary
        ? "Reviewed official row text: obvious ingredient terms were mapped to app allergens."
        : /^contains?\s+/i.test(String(item.sourceSummary ?? ""))
        ? item.sourceSummary
        : /obvious ingredient terms were mapped/i.test(item.sourceSummary)
        ? item.sourceSummary
        : `${item.sourceSummary} Obvious ingredient terms in the official row were also mapped to app allergens.`,
  };
}

function normalizeOfficialMatrixSourceType(item) {
  if (!/official-ingredients/i.test(String(item?.allergenSourceType ?? ""))) {
    return item;
  }

  const evidenceText = JSON.stringify(item?.evidence ?? []);
  const sourceSummary = String(item?.sourceSummary ?? "");

  if (/Reviewed official row text: obvious ingredient terms were mapped to app allergens/i.test(sourceSummary)) {
    return item;
  }

  if (
    /\b(?:official .* allergen row:|pdf-matrix|official-html-table)\b/i.test(evidenceText) ||
    /\b(?:allergen matrix|allergen chart|allergen guide)\b/i.test(sourceSummary)
  ) {
    return {
      ...item,
      allergenSourceType: "official-allergen-menu",
    };
  }

  return item;
}

function normalizeRepeatedReviewedSourceSummary(item) {
  const sourceSummary = String(item?.sourceSummary ?? "");

  if (!sourceSummary) {
    return item;
  }

  const repeatedSentence = "Obvious ingredient terms in the official row were also mapped to app allergens.";
  const occurrences = sourceSummary.split(repeatedSentence).length - 1;

  if (occurrences <= 1) {
    return item;
  }

  return {
    ...item,
    sourceSummary: `${sourceSummary.replaceAll(repeatedSentence, "").replace(/\s+/g, " ").trim()} ${repeatedSentence}`.trim(),
  };
}

function normalizeOfficialConcernSourceSummary(item) {
  if (!/official/i.test(String(item?.allergenSourceType ?? ""))) {
    return item;
  }

  if ((item?.allergens?.length ?? 0) === 0 && (item?.mayContain?.length ?? 0) === 0) {
    return item;
  }

  if (!/no major concern marked/i.test(String(item?.sourceSummary ?? ""))) {
    return item;
  }

  return {
    ...item,
    sourceSummary:
      (item?.mayContain?.length ?? 0) > 0 && (item?.allergens?.length ?? 0) === 0
        ? "Reviewed official source evidence: stored as cross-contact caution, not direct item ingredients."
        : "Reviewed official row-level allergen evidence.",
  };
}

function normalizeOfficialAllergenFreeLabels(item) {
  if (!/official/i.test(String(item?.allergenSourceType ?? ""))) {
    return item;
  }

  const text = `${item?.name ?? ""} ${item?.description ?? ""} ${item?.sourceSummary ?? ""}`.toLowerCase();
  const freeChecks = [
    ["milk", /\b(?:dairy|milk)[- ]free\b|\bfree\s+of\s+(?:dairy|milk)\b|\bnon[- ]?dairy\b/i],
    ["egg", /\beggs?[- ]free\b|\bfree\s+of\s+eggs?\b/i],
    ["soy", /\bsoy[- ]free\b|\bfree\s+of\s+soy\b/i],
    ["sesame", /\bsesame[- ]free\b|\bfree\s+of\s+sesame\b/i],
    ["peanut", /\bpeanuts?[- ]free\b|\bfree\s+of\s+peanuts?\b/i],
    ["tree-nut", /\b(?:tree[- ]nuts?|nuts?|coconut)[- ]free\b|\bfree\s+of\s+(?:tree[- ]nuts?|nuts?|coconut)\b/i],
    ["wheat", /\bwheat[- ]free\b|\bfree\s+of\s+wheat\b/i],
    ["gluten", /\bgluten[- ]free\b|\bfree\s+of\s+gluten\b/i],
    ["fish", /\bfish[- ]free\b|\bfree\s+of\s+fish\b/i],
    ["shellfish", /\bshellfish[- ]free\b|\bfree\s+of\s+shellfish\b/i],
  ];
  const freeAllergens = new Set(freeChecks.filter(([, pattern]) => pattern.test(text)).map(([allergen]) => allergen));

  if (
    freeAllergens.has("gluten") &&
    /\b(?:not\s+gluten[- ]?free|not\s+made\s+gluten[- ]?free|cannot\s+be\s+made\b.{0,40}\bgluten[- ]?free|can'?t\s+be\s+made\b.{0,40}\bgluten[- ]?free)\b/i.test(
      text,
    )
  ) {
    freeAllergens.delete("gluten");
  }

  if (
    freeAllergens.has("milk") &&
    /\b(?:not\s+(?:dairy|milk)[- ]?free|not\s+made\s+(?:dairy|milk)[- ]?free|cannot\s+be\s+made\b.{0,40}\b(?:dairy|milk)[- ]?free|can'?t\s+be\s+made\b.{0,40}\b(?:dairy|milk)[- ]?free)\b/i.test(
      text,
    )
  ) {
    freeAllergens.delete("milk");
  }

  if (freeAllergens.size === 0) {
    return item;
  }

  return {
    ...item,
    allergens: (item.allergens ?? []).filter((allergen) => !freeAllergens.has(allergen)),
    mayContain: (item.mayContain ?? []).filter((allergen) => !freeAllergens.has(allergen)),
  };
}

const allMajorCrossContactAllergens = ["wheat", "milk", "egg", "soy", "fish", "shellfish", "peanut", "tree-nut"];

function restoreReviewedAllergenRegression(item, restaurant) {
  if (["osm-bibibop-asian-6952285839", "osm-bibbop-7802068505"].includes(restaurant?.id)) {
    return {
      ...item,
      mayContain: Array.from(new Set([...(item.mayContain ?? []), "gluten", "wheat"])),
    };
  }

  if (restaurant?.id === "hawkers-asian-street-food-bethesda-md-dc-metro" && item?.name === "Pad Thai") {
    return {
      ...item,
      mayContain: ["soy"],
    };
  }

  if (restaurant?.id === "crumbl" && item?.id === "almond-coconut-fudge-cookie") {
    return {
      ...item,
      mayContain: ["peanut"],
    };
  }

  if (
    restaurant?.id === "chasin-tails-seafood-that-celebrates-falls-church-va-dc-metro" &&
    item?.id === "calamari"
  ) {
    return {
      ...item,
      allergens: [],
      mayContain: ["gluten", "shellfish"],
      allergenSourceType: "official-allergen-menu",
      sourceSummary:
        "Reviewed Chasin Tails official allergy information: fried calamari carries official fried/cross-contact caution evidence.",
    };
  }

  if (restaurant?.id === "elephant-and-castle-washington-dc-dc-metro" && item?.id === "maple-walnut-brussels-sprouts") {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary:
        "Reviewed Elephant & Castle source: Canada-only nutrition/allergen material is not treated as official allergen evidence for the DC location.",
    };
  }

  if (restaurant?.id === "bartaco-wharf-dc" && item?.id === "4-pack-8-pack") {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary:
        "Reviewed bartaco menu extraction: package-size row is a menu/order option and not item-level official allergen evidence.",
    };
  }

  if (restaurant?.id === "amparo-fondita-dc" && item?.id === "hongos-con-shishito") {
    return {
      ...item,
      allergens: ["milk"],
      mayContain: [],
      allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable" ? item.allergenSourceType : "official-ingredients",
      sourceSummary:
        "Reviewed Amparo Fondita official menu: oyster, king oyster, beech, and maitake refer to mushrooms on this row; shellfish was removed and poblano crema remains milk evidence.",
    };
  }

  if (restaurant?.id === "st-james-dc" && item?.id === "espresso-singledouble") {
    return {
      ...item,
      allergens: [],
      mayContain: allMajorCrossContactAllergens,
      allergenSourceType: "official-product-allergen-section",
      sourceSummary:
        "Reviewed St. James official menu page: the espresso row only carries the restaurant-wide notice that menu items may contain or contact wheat, milk, eggs, peanuts, tree nuts, fish, shellfish, and soy. These are stored as official cross-contact concerns, not direct ingredients.",
    };
  }

  if (restaurant?.id === "st-james-dc" && ["macaroni-pie", "sides-macaroni-pie"].includes(item?.id)) {
    const directAllergens = ["milk", "wheat", "gluten"];
    return {
      ...item,
      allergens: directAllergens,
      mayContain: ["egg", "fish", "gluten", "milk", "peanut", "shellfish", "soy", "tree-nut", "wheat"].filter(
        (allergen) => !directAllergens.includes(allergen),
      ),
      allergenSourceType: "official-product-allergen-section",
      sourceSummary:
        "Reviewed St. James official menu: the Macaroni Pie item is described as pasta baked in cheese sauce; a duplicate boundary row incorrectly carried Black Rice allergen text.",
    };
  }

  if (restaurant?.id === "st-james-dc" && ["mango-sorbet", "desserts-mango-sorbet"].includes(item?.id)) {
    return {
      ...item,
      allergens: [],
      mayContain: ["egg", "fish", "gluten", "milk", "peanut", "shellfish", "soy", "tree-nut", "wheat"],
      allergenSourceType: "official-product-allergen-section",
      sourceSummary:
        "Reviewed St. James official menu: Mango Sorbet has no direct major allergen terms in the item row; the restaurant-wide official cross-contact notice is stored as may-contain.",
    };
  }

  if (restaurant?.id === "zinnia-silver-spring-dc-metro" && item?.id === "spiced-cauliflower") {
    return {
      ...item,
      allergens: ["milk"],
      mayContain: ["gluten"],
      allergenSourceType: "official-ingredients",
      sourceSummary: "ALLERGENS: Gluten (CC), Dairy",
    };
  }

  if (restaurant?.id === "filomena-dc" && item?.id === "virgin-olive-oil-and-balsamic") {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary:
        "Reviewed Filomena menu advisory: global cross-contamination language is not treated as item-level official allergen evidence for this olive oil row.",
    };
  }

  if (restaurant?.id === "replacement-donsak-thai-restaurant-washington-dc" && item?.id === "butter-rice-or-regular") {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary:
        "Reviewed Donsak Thai menu extraction: butter rice option text is not treated as item-level official allergen evidence.",
    };
  }

  if (restaurant?.id === "replacement-pure-pasty-vienna-shop-vienna-va" && item?.id === "sausage-roll") {
    return {
      ...item,
      allergens: ["wheat", "gluten"],
      mayContain: ["sesame"],
      allergenSourceType: "official-ingredients",
      sourceSummary:
        "Reviewed Pure Pasty official menu evidence: Sausage Roll is pork banger sausage wrapped in puff pastry, with an item-level may-contain sesame statement.",
    };
  }

  if (
    restaurant?.id === "replacement-cocineros-hyattsville-md" &&
    ["flautas-doradas-tray", "tostones-tray"].includes(item?.id)
  ) {
    return {
      ...item,
      allergens: ["milk"],
      mayContain: ["gluten"],
      allergenSourceType: "official-ingredients",
      sourceSummary:
        "Reviewed Cocineros official Wix menu API. Contains: milk from dairy toppings. Cross-contact: gluten because the source says the item is fried in oil used for gluten-containing products.",
    };
  }

  if (
    restaurant?.id === "replacement-cocineros-hyattsville-md" &&
    ["large-chips-and-guac-tray", "small-tray-of-chips-and-guac", "small-chips-and-salsa-tray"].includes(item?.id)
  ) {
    return {
      ...item,
      allergens: [],
      mayContain: ["gluten"],
      allergenSourceType: "official-ingredients",
      sourceSummary:
        "Reviewed Cocineros official Wix menu API: no direct top-9 allergen is named, but the chips are fried in oil used for gluten-containing products.",
    };
  }

  if (
    restaurant?.id === "cane-dc" &&
    (item?.allergenSourceType === "official-global-cross-contact-note" ||
      /\bmenu items may contain or come into contact with major allergens\b/i.test(String(item?.sourceSummary ?? "")))
  ) {
    return {
      ...item,
      allergenSourceType: "official-global-cross-contact-note",
      allergens: [],
      mayContain: allMajorCrossContactAllergens,
      sourceSummary: "Official Cane allergen notice: menu items may contain or come into contact with major allergens.",
    };
  }

  return item;
}

function normalizeOfficialCrossContactOnlyItem(item) {
  const description = String(item?.description ?? "");
  const sourceSummary = String(item?.sourceSummary ?? "");
  const text = `${description} ${sourceSummary}`;

  if (!/official/i.test(String(item?.allergenSourceType ?? ""))) {
    return item;
  }

  if (
    !/\b(?:shared equipment|shared fryer|shared cooking|cross[- ]?contact|cross[- ]?contamination)\b/i.test(text) ||
    /\b(?:contains|contain)\s*:?/i.test(text) ||
    /\b(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts)(?:\s*[/,&]\s*(?:gluten|wheat|milk|dairy|egg|eggs|soy|sesame|fish|finfish|shellfish|peanuts?|tree nuts?|nuts))*\s+Allergens?\b/i.test(text)
  ) {
    return item;
  }

  const directAllergens = item.allergens ?? [];

  if (directAllergens.length === 0 || (item.mayContain ?? []).length > 0) {
    return item;
  }

  return {
    ...item,
    allergens: [],
    mayContain: Array.from(new Set([...(item.mayContain ?? []), ...directAllergens])),
    sourceSummary:
      item.sourceSummary ??
      "Official source describes shared-equipment or cross-contact risk; stored as Review rather than direct Contains.",
  };
}

function normalizeOfficialGlutenFreeMarkerItem(item) {
  if (!/official/i.test(String(item?.allergenSourceType ?? ""))) {
    return item;
  }

  const directAllergens = item.allergens ?? [];

  if (!directAllergens.includes("gluten")) {
    return item;
  }

  const text = `${item.name ?? ""} ${item.description ?? ""} ${item.ingredientsText ?? ""}`;

  if (!/\b(?:gf\s*[=–-]\s*gluten[- ]?free|gluten[- ]?free|gluten friendly)\b/i.test(text)) {
    return item;
  }

  if (
    /\b(?:not\s+gluten[- ]?free|not\s+made\s+gluten[- ]?free|cannot\s+be\s+made\b.{0,40}\bgluten[- ]?free|can'?t\s+be\s+made\b.{0,40}\bgluten[- ]?free|contains?\s+(?:gluten|flour)|allergens?\s*:\s*gluten|breadcrumbs?)\b/i.test(
      text,
    )
  ) {
    return item;
  }

  const strippedPositiveFreeText = text
    .replace(/\bgf\s*[=–-]\s*gluten[- ]?free\b/gi, " ")
    .replace(/\bgluten[- ]?free\s+flour\b/gi, " ")
    .replace(/\bgluten[- ]?free\b/gi, " ")
    .replace(/\bgluten friendly\b/gi, " ");

  if (/\b(?:contains?\s+gluten|allergens?\s*:\s*gluten|not\s+gluten|wheat flour|flour)\b/i.test(strippedPositiveFreeText)) {
    return item;
  }

  return {
    ...item,
    allergens: directAllergens.filter((allergen) => allergen !== "gluten"),
    sourceSummary:
      item.sourceSummary ??
      "Reviewed official allergen marker text: gluten-free/GF marker is not stored as a direct gluten allergen.",
  };
}

function normalizeGlobalRawWarningAllergens(item) {
  if (!/official/i.test(String(item?.allergenSourceType ?? ""))) {
    return item;
  }

  const text = `${item.description ?? ""} ${item.ingredientsText ?? ""} ${item.sourceSummary ?? ""}`;

  if (!/\b(?:may contain raw or undercooked|consuming raw or undercooked)\b/i.test(text)) {
    return item;
  }

  const stripGlobalWarningAllergens = (allergens) =>
    (allergens ?? []).filter((allergen) => {
      if (!["egg", "shellfish"].includes(allergen)) {
        return true;
      }

      const withoutWarning = text.replace(
        /\*?\s*(?:may contain raw or undercooked|consuming raw or undercooked)[\s\S]*?(?:foodborne illness|medical conditions)\.?/gi,
        " ",
      );

      const allergenPattern = allergen === "egg" ? "eggs?" : allergen;

      return new RegExp(`\\b(?:contains?|allergens?)\\s*(?::|[^.]{0,30})\\b${allergenPattern}\\b`, "i").test(
        withoutWarning,
      );
    });

  return {
    ...item,
    allergens: stripGlobalWarningAllergens(item.allergens),
    mayContain: stripGlobalWarningAllergens(item.mayContain),
  };
}

function normalizeSilverDinerUnsafeOfficialParse(restaurant, item) {
  if (restaurant?.id !== "silver-diner-dc" || !/official/i.test(String(item?.allergenSourceType ?? ""))) {
    return item;
  }

  return {
    ...item,
    allergens: [],
    mayContain: [],
    allergenSourceType: "unavailable",
    sourceSummary:
      item.sourceSummary ??
      "Reviewed Silver Diner official allergen PDF: current text extraction loses allergen-column positions and produced visibly incorrect item-level allergen assignments, so this row is not published as official allergen evidence until the matrix is parsed visually.",
  };
}

const lateReviewedItemFieldOverrides = new Map([
  [
    "pisco-y-nazca-bethesda-md",
    new Map([
      ["steak-n-egg-avocado-toast", {
        description: "Beef tenderloin, fried egg, avocado purée, chimichurri, rocoto aioli, ciabatta.",
      }],
      ["aji-de-gallina-peruvian", {
        name: "Ají de Gallina",
        description: "Peruvian chicken stew with rocoto aioli.",
      }],
      ["tres-leches", {
        description: "‘Three milk’ sponge cake, meringue, Amarena cherry.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Pisco y Nazca official menu extraction: trimmed neighboring brunch/dinner item bleed from user-facing dish copy.",
      },
    ])),
  ],
  [
    "pisco-y-nazca-dc",
    new Map([
      ["steak-n-egg-avocado-toast", {
        description: "Beef tenderloin, fried egg, avocado purée, chimichurri, rocoto aioli, ciabatta.",
      }],
      ["avocado-toast-4-additional", {
        name: "Avocado Toast",
        description: "Beef tenderloin, fried egg, avocado purée, chimichurri, rocoto aioli, ciabatta.",
      }],
      ["aji-de-gallina-peruvian", {
        name: "Ají de Gallina",
        description: "Peruvian chicken stew with rocoto aioli.",
      }],
      ["tres-leches", {
        description: "‘Three milk’ sponge cake, meringue, Amarena cherry.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Pisco y Nazca official menu extraction: trimmed neighboring brunch/dinner item bleed from user-facing dish copy.",
      },
    ])),
  ],
  [
    "kizuna-sushi-ramen-tysons-va",
    new Map([
      ["chicken-kara-age", {
        description: "Marinated hand-carved chicken thighs, dusted and fried.",
      }],
      ["curry-wkatsu-chicken", {
        description: null,
      }],
      ["pork-shoyu", {
        description: "Chicken stock, pork chashu flavor base, and pork toro chashu.",
      }],
      ["black-shitake-mushroom", {
        description: null,
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Kizuna official menu extraction: removed neighboring item bleed from PDF/HTML menu text.",
      },
    ])),
  ],
  [
    "bayou-bakery-arlington-va",
    new Map([
      [
        "flat-white",
        {
          description:
            "Eight-ounce pour with two ounces of espresso and six ounces of slightly foamed milk. Cannot be modified or made iced.",
          allergens: ["milk"],
          mayContain: [],
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: Flat White lists foamed milk. The scraped Latte description belonged to the neighboring item.",
        },
      ],
      [
        "j-baker-pimiento-cheese",
        {
          allergens: ["milk"],
          mayContain: [],
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: J. Baker's Pimiento Cheese lists cream cheese and cheddar. No egg disclosure is present.",
        },
      ],
      [
        "roasted-chicken-salad",
        {
          description: "Eight-ounce portion of chicken salad for a quick snack.",
          sourceSummary:
            "Reviewed Bayou Bakery official Toast/menu evidence: Roasted Chicken Salad is a half-pint chicken salad item; the following sandwich text was row-boundary bleed.",
        },
      ],
    ]),
  ],
  [
    "osm-la-bonne-vie-640716899",
    new Map([
      [
        "36-roasted-cornish-hen",
        {
          name: "Roasted Cornish Hen",
          description: "Rosemary and jus de poulet.",
          sourceSummary:
            "Reviewed La Bonne Vie menu extraction: removed the leading price and following Le Pasta Caviar row-boundary bleed from Roasted Cornish Hen.",
        },
      ],
    ]),
  ],
  [
    "the-monocle-dc",
    new Map([
      ["angus-cheese-burger", {
        description: "Served with fries.",
      }],
      ["brioche-bun-and-fries", {
        description: null,
      }],
      ["filet-mignon", {
        description: "Certified Angus Beef with red wine sauce.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed The Monocle official menu extraction: removed neighboring item and beverage bleed from user-facing dish copy.",
      },
    ])),
  ],
  [
    "carolina-kitchen-bar-and-grill-hyattsville-md-dc-metro",
    new Map([
      ["app-fried-chicken-tenders", {
        description: null,
      }],
      ["bbq-chicken", {
        description: null,
      }],
      ["black-eyed-peas", {
        description: null,
      }],
      ["french-fries", {
        description: null,
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Carolina Kitchen extraction: removed neighboring side/appetizer bleed from user-facing dish copy.",
      },
    ])),
  ],
  [
    "replacement-1310-kitchen-and-bar-washington-dc",
    new Map([
      ["choppedchinesechickensalad-26-g-f", {
        name: "Chopped Chinese Chicken Salad",
        description: "Cabbage, red pepper, cashews, scallion, cilantro, carrot ginger dressing.",
      }],
      ["cobbsalad", {
        name: "Cobb Salad",
        description: "Avocado, bacon, hard-boiled egg, tomato, blue cheese.",
      }],
      ["frenchfries", {
        name: "French Fries",
        description: null,
      }],
      ["friedchickensandwich", {
        name: "Fried Chicken Sandwich",
        description: "Spicy slaw, homemade pickles, served with choice of french fries or mixed greens.",
      }],
      ["gingercoconutcurry", {
        name: "Ginger Coconut Curry",
        description: "Cod, shrimp, vegetables, rice. Vegan option: seasonal vegetables and rice.",
      }],
      ["grilledprimenystripsteak", {
        name: "Grilled Prime NY Strip Steak",
        description: "Chimichurri.",
      }],
      ["hotturkeycubano", {
        name: "Hot Turkey Cubano",
        description: "Swiss, mustard, cornichon; served with choice of french fries or mixed greens.",
      }],
      ["jenn-schickenpotpie", {
        name: "Jenn's Chicken Pot Pie",
        description: "Mushrooms, spinach, peas, carrots.",
      }],
      ["parmesanarancini", {
        name: "Parmesan Arancini",
        description: "Garlic aioli.",
      }],
      ["porchetta", {
        name: "Porchetta",
        description: "Fennel, lemon, rosemary, thyme.",
      }],
      ["roastedbeetsalad", {
        name: "Roasted Beet Salad",
        description: "Goat cheese.",
      }],
      ["roastedbroccolini", {
        name: "Roasted Broccolini",
        description: "Garlic oil.",
      }],
      ["sauteedspinach", {
        name: "Sauteed Spinach",
        description: null,
      }],
      ["sesamesearedtuna", {
        name: "Sesame Seared Tuna",
        description: "Brown rice, edamame, avocado, cucumber.",
      }],
      ["thewedge", {
        name: "The Wedge",
        description: "Romaine, bacon, tomato, crouton, blue cheese dressing.",
      }],
      ["tuscankale-and-quinoasalad", {
        name: "Tuscan Kale & Quinoa Salad",
        description: "Apples, almonds, pomegranate, lemon vinaigrette.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed 1310 Kitchen official PDF: corrected OCR-spaced and column-shifted menu extraction into readable source-backed dish copy.",
      },
    ])),
  ],
  [
    "replacement-cocineros-hyattsville-md",
    new Map([
      ["birria-tacos-birria-tacos-dollar", {
        name: "Birria Tacos",
        description:
          "Cocineros' birria recipe, slow-cooked brisket, cheese, fresh onions and cilantro. Served with grilled onions and broth.",
      }],
      ["crazy-tacos-crazy-tacos-dollar", {
        name: "Crazy Tacos",
        description: "Served with pico and guac or salsa.",
      }],
      ["golden-dough-stuffed-with-savory", {
        name: "Empanadas",
        description:
          "Golden dough stuffed with savory proteins. Perfectly crisp, satisfying, and served with house salad. Options include potatoes, chicken, beef, or shrimp.",
      }],
      ["pupusas-pupusas-dollar", {
        name: "Pupusas",
        description:
          "Options include veggies, beans, pork, chicken, and jalapeno mix. Served with cabbage and tomato sauce.",
      }],
      ["three-rolled-tortillas-stuffed-with-the", {
        name: "Enchiladas",
        description:
          "Three rolled tortillas stuffed with protein of your choice, topped with green tangy sauce, onions, sour cream and cheese. Options include chicken, veggies, or birria.",
      }],
    ].map(([itemId, override]) => [
      itemId,
      {
        ...override,
        sourceSummary:
          "Reviewed Cocineros official PDF: corrected OCR-spaced menu text into readable source-backed dish copy.",
      },
    ])),
  ],
  [
    "ellie-bird-falls-church-va",
    new Map([
      [
        "what-snotapizza",
        {
          name: "What's Not a Pizza",
          description: "Naan pizza, cheese or pepperoni.",
          sourceSummary:
            "Reviewed Ellie Bird official kids PDF: corrected OCR-spaced menu text into readable dish copy.",
        },
      ],
    ]),
  ],
  [
    "amphoras-diner-deluxe-herndon-va-dc-metro",
    new Map([
      [
        "peppercorn-burger",
        {
          description:
            "Hand crafted beef burger with peppercorn seasoning, blue cheese dressing, fried onions, lettuce and tomato. Served with French fries, coleslaw and a pickle spear.",
          sourceSummary:
            "Reviewed Amphora's official PDF: trimmed OCR-spaced section heading from the Peppercorn Burger description.",
        },
      ],
    ]),
  ],
  [
    "osm-amphora-diner-deluxe-152763392",
    new Map([
      [
        "peppercorn-burger",
        {
          description:
            "Hand crafted beef burger with peppercorn seasoning, blue cheese dressing, fried onions, lettuce and tomato. Served with French fries, coleslaw and a pickle spear.",
          sourceSummary:
            "Reviewed Amphora's official PDF: trimmed OCR-spaced section heading from the Peppercorn Burger description.",
        },
      ],
    ]),
  ],
  [
    "farmers-fishers-bakers-dc",
    new Map([
      [
        "bbq-pork-ribs",
        {
          description: "Fries, green beans, coleslaw.",
          sourceSummary:
            "Reviewed Farmers Fishers Bakers official PDF: removed neighboring Sushi & Ceviche section bleed from BBQ Pork Ribs description.",
        },
      ],
    ]),
  ],
  [
    "sweet-leaf-arlington",
    new Map([
      [
        "cage-free-egg",
        {
          allergens: ["egg"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed Sweet Leaf official menu row: CAGE-FREE EGG is an egg item.",
        },
      ],
      [
        "berry-blanco",
        {
          description: "Blueberries, coconut, and honey granola.",
          allergens: ["tree-nut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed Sweet Leaf official menu row: Berry Blanco lists coconut and honey granola.",
        },
      ],
      [
        "farmers",
        {
          description: "Cage-free egg, sausage, cheddar cheese, tomato, roasted shallots, spicy aioli on brioche.",
          category: "Breakfast",
          allergens: ["egg", "gluten", "milk", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sweet Leaf official menu row: Farmers lists egg, cheddar cheese, spicy aioli, and brioche.",
        },
      ],
      [
        "malibu-melt",
        {
          description: "Cage-free egg, crispy bacon, ripe avocado, provolone cheese, on brioche.",
          category: "Breakfast",
          allergens: ["egg", "gluten", "milk", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sweet Leaf official menu row: Malibu Melt lists egg, provolone cheese, and brioche.",
        },
      ],
      [
        "standard",
        {
          description: "Cage-free egg, crispy bacon, cheddar cheese, roasted shallots, spicy aioli on brioche.",
          category: "Breakfast",
          allergens: ["egg", "gluten", "milk", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sweet Leaf official menu row: Standard lists egg, cheddar cheese, spicy aioli, and brioche.",
        },
      ],
      [
        "chocolate",
        {
          description: "Chocolate and milk shake.",
          category: "Shakes",
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed Sweet Leaf official menu row: Chocolate shake lists milk.",
        },
      ],
      [
        "cookies-n-cream",
        {
          description: "Cookies n cream and milk shake.",
          category: "Shakes",
          allergens: ["gluten", "milk", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed Sweet Leaf official menu row: Cookies N Cream shake lists cookies and milk.",
        },
      ],
      [
        "strawberry",
        {
          description: "Strawberry and milk shake.",
          category: "Shakes",
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed Sweet Leaf official menu row: Strawberry shake lists milk.",
        },
      ],
      [
        "citrus-sesame-chicken",
        {
          description:
            "Chicken breast, roasted carrots, cucumber, orange, sesame purple cabbage, cilantro, almonds, organic mesclun, romaine, plum vinaigrette.",
          category: "Salads",
          allergens: ["sesame", "tree-nut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sweet Leaf official menu row: Citrus Sesame Chicken lists sesame purple cabbage and almonds; neighboring Greek Garden text was trimmed.",
        },
      ],
      [
        "berry-toast",
        {
          description:
            "Blueberries, strawberries, banana, coconut, peanut butter, chia and flax seeds, drizzle of honey, on organic multigrain.",
          category: "Toast",
          allergens: ["gluten", "peanut", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sweet Leaf official menu row: Berry Toast lists peanut butter on organic multigrain toast.",
        },
      ],
      [
        "so-cali-club",
        {
          description:
            "Turkey breast, avocado, thick-cut bacon, Swiss, cage-free hard-boiled egg, plum tomato, alfalfa sprout, herb aioli on organic sourdough.",
          category: "Sandwiches",
          allergens: ["egg", "gluten", "milk", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Sweet Leaf official menu row: So Cali Club lists Swiss, hard-boiled egg, herb aioli, and organic sourdough.",
        },
      ],
      [
        "create-your-own-smoothie",
        {
          description: null,
          sourceSummary:
            "Reviewed Sweet Leaf official PDF: Create Your Own Smoothie is a real menu row, but the extracted description belonged to the neighboring Shakes section and was removed.",
        },
      ],
    ]),
  ],
  [
    "eddie-merlots-ashburn-va-dc-metro",
    new Map([
      [
        "peanut-butter-cup",
        {
          allergens: ["gluten", "milk", "peanut", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Eddie Merlot's official menu row: Peanut Butter Cup lists peanut butter filling, graham cracker crust, chocolate ganache, caramel and chocolate sauces, and peanut tuile.",
        },
      ],
      [
        "ahi-tuna-wontons",
        {
          allergens: ["fish", "gluten", "milk", "soy", "wheat"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Eddie Merlot's official menu row: Ahi Tuna Wontons list raw ahi tuna, crispy wontons, wasabi cream sauce, and sweet soy.",
        },
      ],
      [
        "ahi-tuna-steak",
        {
          allergens: ["fish", "sesame"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Eddie Merlot's official menu row: Ahi Tuna Steak lists wild-caught ahi tuna with sesame seed crust.",
        },
      ],
    ]),
  ],
  [
    "frankly-pizza-kensington-md-dc-metro",
    new Map([
      [
        "arugula-romano-lemon-vinaigrette",
        {
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed Frankly...Pizza! official product row: arugula, Romano, lemon vinaigrette lists Romano cheese.",
        },
      ],
    ]),
  ],
  [
    "la-casita-pupusas-dc",
    new Map([
      [
        "plantain-and-avocado-bowl",
        {
          description: "Bowl with rice, whole red seda beans, fried plantains, avocado, chimol, and fritos de tortilla.",
          allergens: [],
          mayContain: ["milk"],
          allergenSourceType: "official-ingredients",
          sourceSummary:
            "Reviewed La Casita official menu row: Plantain and Avocado Bowl states it is made on shared equipment with dairy products.",
        },
      ],
    ]),
  ],
  [
    "maggiano-s-little-italy-springfield-va-dc-metro",
    new Map([
      [
        "kids-milk-skim",
        {
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed Maggiano's official menu row: Kids Milk Skim is a milk item.",
        },
      ],
      [
        "kids-milk-whole",
        {
          allergens: ["milk"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed Maggiano's official menu row: Kids Milk Whole is a milk item.",
        },
      ],
    ]),
  ],
  [
    "chopt-dc",
    new Map([
      [
        "blueberry-coconut-chiller",
        {
          allergens: ["tree-nut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed Chopt official menu row: Blueberry Coconut Chiller lists coconut in the item name.",
        },
      ],
    ]),
  ],
  [
    "rasa-dc",
    new Map([
      [
        "coconut-ginger-sauce",
        {
          allergens: ["tree-nut"],
          mayContain: [],
          allergenSourceType: "official-ingredients",
          sourceSummary: "Reviewed RASA official menu row: Coconut Ginger Sauce lists coconut in the item name.",
        },
      ],
    ]),
  ],
  [
    "succotash-dc",
    new Map([
      [
        "kimchi-crab-dip-dollar26-00",
        {
          name: "Kimchi Crab Dip",
          description: "Jumbo lump crab, grilled Sally Lunn.",
          sourceSummary:
            "Reviewed Succotash official PDF: corrected OCR-spaced Kimchi Crab Dip description.",
        },
      ],
    ]),
  ],
  [
    "the-bungalow-lakehouse-sterling-va-dc-metro",
    new Map([
      [
        "chesapeake-crab-dip",
        {
          description: "Toasted baguettes and tortilla chips. Substitute carrots and celery upon request.",
          sourceSummary:
            "Reviewed Bungalow Lakehouse official PDF: corrected OCR-spaced Chesapeake Crab Dip description.",
        },
      ],
    ]),
  ],
  [
    "the-sovereign-washington-dc-dc-metro",
    new Map([
      [
        "spinach-pesto-and-sausage",
        {
          description:
            "Spinach and basil pesto, Toulouse sausage, mozzarella, pickled chilies, tomato, asparagus, kriek gastrique.",
          sourceSummary:
            "Reviewed The Sovereign official PDF: removed neighboring section bleed from Spinach Pesto & Sausage description.",
        },
      ],
    ]),
  ],
  [
    "el-patio-randolph-rockville-md-dc-metro",
    new Map([
      [
        "torta-de-chocolate-7-layer-v",
        {
          description: "Chocolate layered cake with milk caramel filling.",
          sourceSummary:
            "Reviewed El Patio official menu extraction: trimmed dessert-section bleed from Torta de Chocolate description.",
        },
      ],
    ]),
  ],
  [
    "osm-josephine-204948014",
    new Map([
      [
        "french-dip",
        {
          description: "Roast beef, gruyere, baguette, au jus.",
          sourceSummary:
            "Reviewed Josephine official PDF: trimmed neighboring sandwich and entree bleed from French Dip description.",
        },
      ],
      [
        "shrimp-cocktail",
        {
          description: "Half dozen shrimp cocktail.",
          sourceSummary:
            "Reviewed Josephine official PDF: simplified OCR-collapsed seafood platter bleed to the item-level Shrimp Cocktail description.",
        },
      ],
    ]),
  ],
  [
    "silver-diner-dc",
    new Map([
      [
        "gluten-free-burger-bun-gf-250-cal-add",
        {
          name: "Gluten-Free Burger Bun",
          description: null,
          sourceSummary:
            "Reviewed Silver Diner menu extraction: kept Gluten-Free Burger Bun as a real add-on and removed dietary-legend text from the description.",
        },
      ],
    ]),
  ],
  [
    "chain-pupatella",
    new Map([
      [
        "forkids",
        {
          name: "For Kids",
          description: "Nonna's Meatballs.",
          sourceSummary:
            "Reviewed Pupatella menu extraction: corrected compact kids-menu OCR row.",
        },
      ],
    ]),
  ],
  [
    "osm-greek-unique-12234989460",
    new Map([
      [
        "caesar-salad",
        {
          description:
            "Romaine lettuce, roasted red peppers, Greek spice pita chips, grated Romano, creamy Caesar dressing and olives.",
          sourceSummary:
            "Reviewed Greek Unique menu extraction: corrected OCR-spaced Caesar Salad description.",
        },
      ],
      [
        "gyro",
        {
          description: "Lettuce, tomatoes, onions and tzatziki.",
          sourceSummary:
            "Reviewed Greek Unique menu extraction: corrected OCR-spaced Gyro description.",
        },
      ],
      [
        "spinach-feta-poppers",
        {
          description:
            "Spinach feta rounds rolled in a Greek herb panko crust, served with Greek spiced pita chips and tzatziki.",
          sourceSummary:
            "Reviewed Greek Unique menu extraction: corrected OCR-spaced Spinach Feta Poppers description.",
        },
      ],
      [
        "greek-bruschetta",
        {
          description:
            "Crispy fried onion straws topped with a spicy Greek herb blend and Romano cheese, served with spicy creamy feta sauce.",
          sourceSummary:
            "Reviewed Greek Unique menu extraction: trimmed neighboring item bleed from Greek Bruschetta description.",
        },
      ],
      [
        "lamb-gyro-lettuce-salsa",
        {
          name: "Fiesta Gyro",
          description:
            "Lamb gyro, mozzarella, hot spices, parmesan, lettuce, tomatoes, onions.",
          sourceSummary:
            "Reviewed Greek Unique menu extraction: corrected OCR-spaced Fiesta Gyro text into readable dish copy.",
        },
      ],
    ]),
  ],
  [
    "osm-kare-3094959244",
    new Map([
      [
        "karaage-japanese-fried-chicken-bites",
        {
          name: "Karaage",
          description: "Japanese fried chicken bites.",
          sourceSummary:
            "Reviewed Kare menu extraction: removed neighboring Salad section bleed from Karaage description.",
        },
      ],
    ]),
  ],
  [
    "replacement-thai-ghang-waan-springfield-va",
    new Map([
      [
        "fried-chinese-chives-cake",
        {
          description:
            "Deep fried minced chives cake served with homemade sweet soy sauce.",
          sourceSummary:
            "Reviewed Thai Ghang Waan menu extraction: trimmed neighboring Kai item bleed from Fried Chinese Chives Cake description.",
        },
      ],
    ]),
  ],
  [
    "replacement-teaism-penn-quarter-washington-dc",
    new Map([
      ["chunky-pecan-salty-oat-cookie", {
        description: null,
        sourceSummary:
          "Reviewed Teaism official matrix extraction: removed Y/N allergen-marker text from user-facing description.",
      }],
      ["gf-hempheart-cookie", {
        description: null,
        sourceSummary:
          "Reviewed Teaism official matrix extraction: removed Y/N allergen-marker text from user-facing description.",
      }],
      ["vegan-ginger-scones", {
        description: null,
        sourceSummary:
          "Reviewed Teaism official matrix extraction: removed Y/N allergen-marker text from user-facing description.",
      }],
    ]),
  ],
  [
    "replacement-bistro-cacao-washington-dc",
    new Map([
      [
        "plain-croissant",
        {
          description: null,
          sourceSummary:
            "Reviewed Bistro Cacao menu extraction: Plain Croissant is a real row, but the extracted description was contact/footer text and was removed.",
        },
      ],
      [
        "salade-de-roquette-et-figues",
        {
          description: null,
          sourceSummary:
            "Reviewed Bistro Cacao menu extraction: removed neighboring hours/sides heading from Salade de Roquette et Figues description.",
        },
      ],
    ]),
  ],
  [
    "replacement-pennyroyal-station-mt-rainier-md",
    new Map([
      [
        "fried-fish-sammy",
        {
          description: "Creole remoulade, pickles, hot sauce on soft white bread.",
          sourceSummary:
            "Reviewed Pennyroyal Station menu extraction: trimmed neighboring Sides heading from Fried Fish Sammy description.",
        },
      ],
    ]),
  ],
  [
    "replacement-the-daily-dish-silver-spring-md",
    new Map([
      [
        "angus-beef-bistro-burger",
        {
          description:
            "Beef chuck and brisket blend patty with lettuce, tomato, pickles on a brioche roll. Served with choice of house salad, potato wedges, or coleslaw.",
          sourceSummary:
            "Reviewed Daily Dish menu extraction: trimmed add-on bleed from Angus Beef Bistro Burger description.",
        },
      ],
      [
        "mushroom",
        {
          description:
            "Shiitakes and creminis, roasted garlic, caramelized onion, smoked gouda, mozzarella, house marinara.",
          sourceSummary:
            "Reviewed Daily Dish menu extraction: trimmed create-your-own topping bleed from Mushroom description.",
        },
      ],
    ]),
  ],
  [
    "replacement-ellie-bird-falls-church-va",
    new Map([
      [
        "what-snotapizza",
        {
          name: "What's Not a Pizza",
          description: "Naan pizza, cheese or pepperoni.",
          sourceSummary:
            "Reviewed Ellie Bird official kids PDF: corrected OCR-spaced menu text into readable dish copy.",
        },
      ],
    ]),
  ],
]);

function normalizeReviewedLateItemOverrides(restaurant, item) {
  const lateOverride = lateReviewedItemFieldOverrides.get(restaurant?.id)?.get(item?.id);

  if (lateOverride) {
    return {
      ...item,
      ...lateOverride,
    };
  }

  if (restaurant?.id === "sticky-fingers-bakery-dc") {
    const officialText = `${item?.description ?? ""} ${item?.sourceSummary ?? ""}`;
    const containsText = officialText.match(/\b(?:allergens?:\s*)?contains?:?\s*([^.]*)/i)?.[1] ?? "";
    const parsedAllergens = new Set();
    const directText = `${item?.name ?? ""} ${item?.description ?? ""}`;
    const glutenFree = /\b(?:gluten[- ]free|\bGF\b|without the gluten)\b/i.test(directText);
    const soyFree = /\bsoy[- ]free\b/i.test(directText);

    if (/\bwheat\b/i.test(containsText)) {
      parsedAllergens.add("wheat");
      parsedAllergens.add("gluten");
    }

    if (/\bsoy\b/i.test(containsText)) {
      parsedAllergens.add("soy");
    }

    if (/\b(?:almonds?|walnuts?|coconut|pecans?|cashews?|hazelnuts?|pistachios?)\b/i.test(containsText)) {
      parsedAllergens.add("tree-nut");
    }

    if (/\bpeanuts?\b/i.test(containsText) && !/\bpeanut[- ]free\b/i.test(officialText)) {
      parsedAllergens.add("peanut");
    }

    if (/\b(?:milk|dairy)\b/i.test(containsText) && !/\b(?:dairy|milk)[- ]free\b/i.test(officialText)) {
      parsedAllergens.add("milk");
    }

    if (/\beggs?\b/i.test(containsText) && !/\begg[- ]free\b/i.test(officialText)) {
      parsedAllergens.add("egg");
    }

    if (
      !glutenFree &&
      /\b(?:cake|cupcakes?|cookies?|brownies?|muffins?|croissants?|danish(?:es)?|challah|stromboli|biscuits?|burrito|sticky buns?|shortbread|tiramisu|pain au chocolat|pastry|pancake)\b/i.test(
        directText,
      )
    ) {
      parsedAllergens.add("wheat");
      parsedAllergens.add("gluten");
    }

    if (
      !soyFree &&
      /\b(?:cake|cupcakes?|cookies?|brownies?|muffins?|croissants?|danish(?:es)?|challah|stromboli|biscuits?|burrito|sticky buns?|shortbread|tiramisu|pain au chocolat|pastry|pancake|chocolate|ganache|frosting|buttercream|seitan|mozzarella|cheddar)\b/i.test(
        directText,
      )
    ) {
      parsedAllergens.add("soy");
    }

    if (/\b(?:almonds?|walnuts?|coconut|pecans?|cashews?|hazelnuts?|pistachios?)\b/i.test(directText)) {
      parsedAllergens.add("tree-nut");
    }

    const allergens =
      parsedAllergens.size > 0
        ? Array.from(parsedAllergens)
        : (item.allergens ?? []).filter((allergen) => allergen !== "milk" && allergen !== "egg");

    if (allergens.length === 0 && !/official/i.test(String(item?.allergenSourceType ?? ""))) {
      return item;
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens,
      mayContain: item.mayContain ?? [],
      sourceSummary: /Sticky Fingers vegan bakery official source/i.test(String(item.sourceSummary ?? ""))
        ? item.sourceSummary
        : `${item.sourceSummary ?? "Reviewed official row-level allergen evidence."} Reviewed Sticky Fingers vegan bakery official source: the restaurant describes its products as egg-free and dairy-free, so animal-derived cake-word assumptions were removed and the row-level contains text was used.`,
    };
  }

  if (restaurant?.id === "maman-georgetown-dc") {
    const text = `${item?.name ?? ""} ${item?.description ?? ""}`;
    const normalizedText = text.toLowerCase();
    const glutenFree = /\b(?:gluten[- ]free|\bgf\b)\b/i.test(text);
    const allergens = new Set(item?.allergens ?? []);

    if (
      /\b(?:steamed milk|foamed milk|micro foamed milk|iced milk|milk choice|choice of milk|cream cheese|whipped cream cheese|yogurt|greek yogurt|herbed yogurt|cheese|feta|gruy[eè]re|cheddar|butter|whipped butter|burrata|parmesan|comt[eé]|bechamel|cr[eè]me fra[iî]che|latte|cappuccino|cortado|macchiato|mocha|hot chocolate)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("milk");
    }

    if (
      !glutenFree &&
      /\b(?:croissant|brioche|baguette|sourdough|country bread|toast|sandwich|cookie|cake|brownie|beignet|pastry|pain au chocolat|kouign|scone|pancakes?|croutons?|pita chips?|farro|granola)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("wheat");
      allergens.add("gluten");
    }

    if (/\b(?:egg|eggs|sunny egg|over easy egg|scrambled eggs|omelette|quiche|aioli|caesar dressing|mayo)\b/i.test(normalizedText)) {
      allergens.add("egg");
    }

    if (/\b(?:salmon|smoked salmon)\b/i.test(normalizedText)) {
      allergens.add("fish");
    }

    if (/\b(?:almonds?|walnuts?|pistachios?|nutella|hazelnuts?|coconut)\b/i.test(normalizedText)) {
      allergens.add("tree-nut");
    }

    if (/\b(?:sesame|tahini)\b/i.test(normalizedText)) {
      allergens.add("sesame");
    }

    if (allergens.size === 0 && !/official/i.test(String(item?.allergenSourceType ?? ""))) {
      return item;
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens: Array.from(allergens),
      mayContain: item?.mayContain ?? [],
      sourceSummary:
        "Reviewed Maman official NovaDine menu row text: direct ingredient terms were mapped to app allergens; gluten-free wraps and seed-only descriptions were handled as context.",
    };
  }

  if (restaurant?.id === "la-casita-pupusas-dc" || restaurant?.id === "la-casita-gaithersburg-dc-metro") {
    const text = `${item?.category ?? ""} ${item?.name ?? ""} ${item?.description ?? ""}`;
    const normalizedText = text.toLowerCase();
    const allergens = new Set(item?.allergens ?? []);
    const mayContain = new Set(item?.mayContain ?? []);
    const plantBasedDairyContext =
      /\b(?:plant[- ]based|yuca cheese|plant based cheese|plant-based cheese)\b/i.test(text);
    const nonDairyMilkContext = /\b(?:oat milk|soy milk)\b/i.test(text);

    if (/\b(?:shared equipment with dairy|dairy products)\b/i.test(text)) {
      mayContain.add("milk");
    }

    if (
      !plantBasedDairyContext &&
      (!nonDairyMilkContext || /\b(?:steamed milk|frothed milk|whole milk|fresh milk|\/\s*milk|milk\s*\/)\b/i.test(text)) &&
      /\b(?:milk|leche|steamed milk|frothed milk|cream|crema|cheese|queso|cuajada|mozzarella|parmesan|custard|pudding|latte|cappuccino|tres leches|flan)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("milk");
    }

    if (/\b(?:egg|eggs|huevo|huevos|hard egg|fried egg|custard|flan|mayo|mayonnaise)\b/i.test(normalizedText)) {
      allergens.add("egg");
    }

    if (/\b(?:shrimp|shrimps|shirmp|camarones?|lobster|crab|crabmeat)\b/i.test(normalizedText)) {
      allergens.add("shellfish");
    }

    if (/\b(?:fish|tilapia|rockfish|pescado)\b/i.test(normalizedText)) {
      allergens.add("fish");
    }

    if (/\b(?:soy milk|soy chorizo|soy based|soy-rizo|soyrizo)\b/i.test(normalizedText)) {
      allergens.add("soy");
    }

    if (/\b(?:barley|cebada|oats?)\b/i.test(normalizedText)) {
      allergens.add("gluten");
    }

    if (/\b(?:mustard|mostaza)\b/i.test(normalizedText)) {
      allergens.add("mustard");
    }

    if (
      /\b(?:fresh rolls?|rolls?|cake|bread|pan de|pan frances|sandwich|quesadilla large|quesadilla mini)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("wheat");
      allergens.add("gluten");
    }

    if (/\btres leches\b|\bflan\b/i.test(normalizedText)) {
      allergens.add("milk");
      allergens.add("egg");
    }

    if (allergens.size === 0 && mayContain.size === 0 && !/official/i.test(String(item?.allergenSourceType ?? ""))) {
      return item;
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens: Array.from(allergens),
      mayContain: Array.from(mayContain),
      sourceSummary:
        "Reviewed La Casita official Toast menu row text: direct ingredient terms were mapped to app allergens; corn/rice masa and handmade tortillas were not treated as wheat.",
    };
  }

  if (restaurant?.id === "el-tamarindo-dc") {
    const text = `${item?.category ?? ""} ${item?.name ?? ""} ${item?.description ?? ""}`;
    const normalizedText = text.toLowerCase();
    const allergens = new Set(item?.allergens ?? []);
    const mayContain = new Set(item?.mayContain ?? []);
    const veganContext = /\b(?:vegan|vg|jackfruit|plant[- ]based)\b/i.test(text);

    if (
      !veganContext &&
      /\b(?:milk|three milks|whip cream|whipped cream|heavy whipping cream|custard|flan|cream|crema|sour cream|cheese|queso|quesadilla|cheddar|monterrey jack|melted cheese|queso fresco|cream cheese|ranch|butter|latte|hot chocolate|horchata crema)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("milk");
    }

    if (/\b(?:egg|eggs|sunny side|scrambled eggs|custard|flan|mayo|mayonnaise|ranch)\b/i.test(normalizedText)) {
      allergens.add("egg");
    }

    if (/\b(?:shrimp|baby shrimp|camarones?|lobster|mussels|mariscada)\b/i.test(normalizedText)) {
      allergens.add("shellfish");
    }

    if (/\b(?:fish|cod|salmon|pescado|catch of the day|seafood soup)\b/i.test(normalizedText)) {
      allergens.add("fish");
    }

    if (/\b(?:soy|soy milk|tofu)\b/i.test(normalizedText)) {
      allergens.add("soy");
    }

    if (
      /\b(?:flour tortillas?|burritos?|chimichangas?|croissant|croissant dough|cinnamon roll|churros?|spongecake|chocolate cake|cake|cheesecake|pan dulce|sweet bread|conchas?|muffin)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("wheat");
      allergens.add("gluten");
    }

    if (/\b(?:sesame seeds?|toasted sesame)\b/i.test(normalizedText)) {
      allergens.add("sesame");
    }

    if (/\b(?:coconut)\b/i.test(normalizedText)) {
      allergens.add("tree-nut");
    }

    if (allergens.size === 0 && mayContain.size === 0 && !/official/i.test(String(item?.allergenSourceType ?? ""))) {
      return item;
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens: Array.from(allergens),
      mayContain: Array.from(mayContain),
      sourceSummary:
        "Reviewed El Tamarindo official menu row text: direct ingredient terms were mapped to app allergens; corn tortillas, pupusas, and handmade tortillas were not treated as wheat.",
    };
  }

  if (restaurant?.id === "rocklands-bbq-dc") {
    const text = `${item?.category ?? ""} ${item?.name ?? ""} ${item?.description ?? ""}`;
    const normalizedText = text.toLowerCase();
    const allergens = new Set(item?.allergens ?? []);
    const mayContain = new Set(item?.mayContain ?? []);

    if (
      /\b(?:cheese|bleu cheese|swiss cheese|american cheese|feta|mac (?:n|&|and) cheese|macaroni (?:&|and) cheese|ice cream|cream|horseradish cream|mashed potatoes|cookie|pie|cornbread|ice cream sandwich)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("milk");
    }

    if (/\b(?:mayonnaise|mayo|caesar|potato salad|macaroni salad|cookie|pie|cornbread|chicken tenders?|ice cream sandwich)\b/i.test(normalizedText)) {
      allergens.add("egg");
    }

    if (/\b(?:catfish|salmon|caesar)\b/i.test(normalizedText)) {
      allergens.add("fish");
    }

    if (/\b(?:almonds?|pecans?)\b/i.test(normalizedText)) {
      allergens.add("tree-nut");
    }

    if (
      /\b(?:burger|sandwich|potato rolls?|pretzel rolls?|rolls?|cornbread|chicken tenders?|mac (?:n|&|and) cheese|macaroni|cookie|pie|ice cream sandwich|veggie burger)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("wheat");
      allergens.add("gluten");
    }

    if (allergens.size === 0 && mayContain.size === 0 && !/official/i.test(String(item?.allergenSourceType ?? ""))) {
      return item;
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens: Array.from(allergens),
      mayContain: Array.from(mayContain),
      sourceSummary:
        "Reviewed Rocklands official Toast menu row text: direct ingredient terms and common served-format terms were mapped to app allergens; plain BBQ meats and sides without direct allergen evidence were left unavailable.",
    };
  }

  if (restaurant?.id === "noma-pizza-dc") {
    const text = `${item?.category ?? ""} ${item?.name ?? ""} ${item?.description ?? ""}`;
    const normalizedText = text.toLowerCase();
    const allergens = new Set();
    const mayContain = new Set();

    if (
      /\b(?:cheese|mozzarella|asiago|cheddar|ricotta|parmesan|parm\b|provolone|feta|gorgonzola|yogurt|alfredo|cream(?:y)?|cream sauce|blue cheese)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("milk");
    }

    if (/\b(?:mayo|mayonnaise|caesar|breaded|chicken tenders?|chicken nuggets?|cake|cheesecake)\b/i.test(normalizedText)) {
      allergens.add("egg");
    }

    if (/\bshrimp\b/i.test(normalizedText)) {
      allergens.add("shellfish");
    }

    if (/\bcaesar\b/i.test(normalizedText)) {
      allergens.add("fish");
    }

    if (/\b(?:pine nuts?|pesto)\b/i.test(normalizedText)) {
      allergens.add("tree-nut");
    }

    if (/\b(?:tahini|sesame)\b/i.test(normalizedText)) {
      allergens.add("sesame");
    }

    if (
      /\b(?:cheese pizzas?|pizza crust|cheese slice|pepperoni slice|sicilian pizza|calzones?|pasta|fusilli|ravioli|manicotti|fettuccine|spaghetti|lasagna|breadsticks?|cheesy bread|cheese bread|sandwich|wraps?|pita|pita bread|burger|crescent|cake|cheesecake|breaded|chicken tenders?|chicken nuggets?|filo dough|pinwheel)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("wheat");
      allergens.add("gluten");
    }

    if (allergens.size === 0 && mayContain.size === 0) {
      return {
        ...item,
        allergenSourceType: "unavailable",
        allergens: [],
        mayContain: [],
      };
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens: Array.from(allergens),
      mayContain: Array.from(mayContain),
      sourceSummary:
        "Reviewed Noma Pizza official Toast menu row text: direct pizza, pasta, bread, dairy, egg, seafood, sesame, and pesto/nut terms were mapped to app allergens; rows without direct evidence were left unavailable.",
    };
  }

  if (restaurant?.id === "takumi-navy-yard-dc") {
    const text = `${item?.category ?? ""} ${item?.name ?? ""} ${item?.description ?? ""}`;
    const normalizedText = text.toLowerCase();
    const allergens = new Set();
    const mayContain = new Set();

    if (
      /\b(?:tuna|salmon|yellowtail|hamachi|amberjack|snapper|seabream|mackerel|eel|anago|unagi|fish|white fish|bonito|tobiko|ikura|flying fish egg|salmon egg|fish cake|o-?toro|toro|bluefin)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("fish");
    }

    if (
      /\b(?:shrimp|crab|kani|snow crab|blue crab|soft shell crab|scallop|hotate|squid|ika|oyster|lobster|calamari|crawfish|mussel|takoyaki|octopus)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("shellfish");
    }

    if (/\b(?:egg|quail egg|tamago|ajitama)\b/i.test(normalizedText)) {
      allergens.add("egg");
    }

    if (/\b(?:cheese|cream cheese|cream)\b/i.test(normalizedText)) {
      allergens.add("milk");
    }

    if (/\b(?:soy|tofu|miso|soy paper|soy sauce|soy garlic|dry soy)\b/i.test(normalizedText)) {
      allergens.add("soy");
    }

    if (/\b(?:sesame|sesame dressing)\b/i.test(normalizedText)) {
      allergens.add("sesame");
    }

    if (/\b(?:pesto|coconut milk)\b/i.test(normalizedText)) {
      allergens.add("tree-nut");
    }

    if (
      /\b(?:can not be gluten free|cannot be gluten free|not gluten free|tempura|katsu|karaage|dumplings?|spring roll|harumaki|ramen|udon|noodle|wonton|fried oyster|fried chicken|takoyaki|chips|soy sauce|soy garlic|ponzu|eel sauce|teriyaki)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("gluten");
    }

    if (
      /\b(?:can not be gluten free|cannot be gluten free|not gluten free|tempura|katsu|karaage|dumplings?|spring roll|harumaki|ramen|udon|noodle|wonton|fried oyster|fried chicken|takoyaki|chips|soy sauce|soy garlic|ponzu|eel sauce|teriyaki)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("wheat");
    }

    if (allergens.size === 0 && mayContain.size === 0) {
      return {
        ...item,
        allergenSourceType: "unavailable",
        allergens: [],
        mayContain: [],
      };
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens: Array.from(allergens),
      mayContain: Array.from(mayContain),
      sourceSummary:
        "Reviewed Takumi official Toast menu row text: direct fish, shellfish, egg, dairy, soy, sesame, tempura/noodle/gluten-warning, and pesto/coconut terms were mapped to app allergens; rows without direct evidence were left unavailable.",
    };
  }

  if (restaurant?.id === "tout-de-sweet-bethesda-dc-metro") {
    const text = `${item?.category ?? ""} ${item?.name ?? ""} ${item?.description ?? ""}`;
    const normalizedText = text.toLowerCase();
    const allergens = new Set();
    const mayContain = new Set();
    const glutenFreeContext = /\b(?:gluten free|gluten-free|flourless)\b/i.test(normalizedText);
    const nutFreeContext = /\bnut[- ]free\b/i.test(normalizedText);

    if (
      !glutenFreeContext &&
      /\b(?:pastries?|croissants?|tarts?|sweet dough|sponge cake|cake|blondie|brownie|cookies?|bostock|bread|toast|baguette|sourdough|multigrain|danish|scones?|muffins?|pain au chocolat|pain aux raisin|pain suisse|lady finger|speculoos|pate a choux|pâte à choux|donut|pound cake|quiche|sandwich|brioche|naan|crackers?|tiramisu|tart shell|granola)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("wheat");
      allergens.add("gluten");
    }

    if (/\b(?:granola|oats?)\b/i.test(normalizedText)) {
      allergens.add("gluten");
    }

    if (
      /\b(?:butter|cream|pastry cream|buttercream|whipped cream|cream cheese|gelato|mousse|burrata|cheese|swiss cheese|bechamel|b[eé]chamel|yogurt|greek yogurt|milk chocolate|white chocolate|mascarpone|caramel|ganache|hot cocoa|vanilla whipped cream|chocolate whipped cream)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("milk");
    }

    if (
      /\b(?:cake|cakes|cake pops|sponge cake|meringue|macarons?|madeleines?|quiche|custard|pate a choux|pâte à choux|lady finger|tiramisu|brioche|croissants?|pastries?|tarts?|cookies?|brownie|blondie|muffins?|scones?|financier|dacquoise|danish|pound cake)\b/i.test(
        normalizedText,
      )
    ) {
      allergens.add("egg");
    }

    if (
      /\b(?:almonds?|hazelnuts?|pistachios?|pecans?|walnuts?|coconut|praline|nougatine|dacquoise|macarons?|financier|amandine|almond cream|almond flour|hazelnut flour|pistachio cream|tree nuts?)\b/i.test(
        normalizedText,
      ) ||
      (!nutFreeContext && /\bnuts?\b/i.test(normalizedText))
    ) {
      allergens.add("tree-nut");
    }

    if (/\bsesame\b/i.test(normalizedText)) {
      allergens.add("sesame");
    }

    if (/\b(?:salmon|smoked salmon)\b/i.test(normalizedText)) {
      allergens.add("fish");
    }

    if (allergens.size === 0 && mayContain.size === 0) {
      return {
        ...item,
        allergenSourceType: "unavailable",
        allergens: [],
        mayContain: [],
      };
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens: Array.from(allergens),
      mayContain: Array.from(mayContain),
      sourceSummary:
        "Reviewed Tout de Sweet official Toast menu row text: direct bakery-format, dairy, egg, tree-nut, sesame, oat/granola, and salmon terms were mapped to app allergens; gluten-free/flourless context suppresses wheat/gluten.",
    };
  }

  if (restaurant?.id === "menomale-dc") {
    const text = `${item?.category ?? ""} ${item?.name ?? ""} ${item?.description ?? ""}`.toLowerCase();
    const allergens = new Set(item?.allergens ?? []);

    if (
      /\b(?:pizza|panuozzo|sandwich|rustic loaf|calzone|bruschette?|bruschetta|roman 1\/2 tray|roman 1\/4 tray|full tray|half tray|1\/4 tray|focaccia|fresh dough|pizza dough|fried pizza dough|bread|bread crumbs|bucatini|pasta|farro|lady fingers|cannoli shells|pizza dough pillows)\b/i.test(
        text,
      )
    ) {
      allergens.add("wheat");
      allergens.add("gluten");
    }

    if (
      /\b(?:mozzarella|bufala|burrata|ricotta|ricotta cream|goat cheese|gorgonzola|parmesan|parmigiano|feta|fior di latte|formaggi|cheese|mascarpone|bechamel|b[eé]chamel|cream)\b/i.test(
        text,
      )
    ) {
      allergens.add("milk");
    }

    if (/\b(?:egg|eggs|frittatina)\b/i.test(text)) {
      allergens.add("egg");
    }

    if (/\b(?:anchovies|anchovy|salmon|smoked salmon|pesce|cuttlefish|squid|octopus)\b/i.test(text)) {
      allergens.add("fish");
    }

    if (/\b(?:shrimp|mussels|marinated seafood|fritto di mare)\b/i.test(text)) {
      allergens.add("shellfish");
    }

    if (/\b(?:pesto|walnuts?|nutella)\b/i.test(text)) {
      allergens.add("tree-nut");
    }

    if (allergens.size === 0 && !/official/i.test(String(item?.allergenSourceType ?? ""))) {
      return item;
    }

    return {
      ...item,
      allergenSourceType: "official-ingredients",
      allergens: Array.from(allergens),
      mayContain: item?.mayContain ?? [],
      sourceSummary:
        "Reviewed Menomale official menu row text: direct ingredient terms and dish-format context were mapped to app allergens.",
    };
  }

  if (restaurant?.id === "mi-vida-washington-dc-dc-metro") {
    return normalizeMiVidaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "bayou-bakery-arlington-va") {
    return normalizeBayouBakeryOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "dogfish-head-alehouse-gaithersburg-md-dc-metro") {
    return normalizeDogfishAlehouseOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "good-company-doughnuts-ballston-va") {
    return normalizeGoodCompanyOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "the-pub-and-the-people-washington-dc-dc-metro") {
    return normalizePubAndThePeopleOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "your-only-friend-dc") {
    return normalizeYourOnlyFriendOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "taqueria-habanero-dc") {
    return normalizeTaqueriaHabaneroOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "il-canale-dc") {
    return normalizeIlCanaleOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "dukes-grocery-dupont-dc") {
    return normalizeDukesGroceryOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "yellow-georgetown-dc") {
    return normalizeYellowGeorgetownOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "baan-siam-dc") {
    return normalizeBaanSiamOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "purple-patch-dc") {
    return normalizePurplePatchOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "lapis-dc") {
    return normalizeLapisOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "daikaya-dc") {
    return normalizeDaikayaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "bantam-king-dc") {
    return normalizeBantamKingOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "busboys-and-poets-dc") {
    return normalizeBusboysOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "sushi-taro-dc") {
    return normalizeSushiTaroOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "neutral-ground-mclean-va") {
    return normalizeNeutralGroundOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "chang-chang-dc") {
    return normalizeChangChangOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "ometeo-tysons-va") {
    return normalizeOmeteoOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "river-club-dc") {
    return normalizeRiverClubOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "peter-chang-mclean-va") {
    return normalizePeterChangOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "baan-mae-dc") {
    return normalizeBaanMaeOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "rakuya-dc") {
    return normalizeRakuyaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "northside-social-va") {
    return normalizeNorthsideSocialOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "harth-tysons-va") {
    return normalizeHarthOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "kizuna-sushi-ramen-tysons-va") {
    return normalizeKizunaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "pho-hai-duong-tysons-va") {
    return normalizePhoHaiDuongOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "mandns-pizza-bethesda-md") {
    return normalizeMandNsPizzaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "medina-dc") {
    return normalizeMedinaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "hu-tieu-mi-lacay-cho-lon-falls-church-va") {
    return normalizeHuTieuMiLacayOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "rare-bird-coffee-roasters-falls-church-va") {
    return normalizeRareBirdOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "el-pollo-rico-arlington-va") {
    return normalizeElPolloRicoOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "genki-izakaya-fairfax-va-dc-metro") {
    return normalizeGenkiIzakayaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "dogwood-tavern-falls-church-va-dc-metro") {
    return normalizeDogwoodTavernOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "hello-betty-north-bethesda-md") {
    return normalizeHelloBettyOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "heidelberg-pastry-shoppe-arlington-va") {
    return normalizeHeidelbergOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "moes-southwest-grill") {
    return normalizeMoesSouthwestOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "replacement-dogon-by-kwame-onwuachi-washington-dc") {
    return normalizeDogonOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "arrels-dc") {
    return normalizeArrelsOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "chao-ban-tysons-va") {
    return normalizeChaoBanOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "amparo-fondita-dc") {
    return normalizeAmparoFonditaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "xiquet-dc") {
    return normalizeXiquetOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "providencia-dc") {
    return normalizeProvidenciaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "azteca-restaurant-college-park-md-dc-metro") {
    return normalizeAztecaOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "primrose-dc") {
    return normalizePrimroseOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "marvs-dogs-dc") {
    return normalizeMarvsDogsOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "bumblebirds-dc") {
    return normalizeBumblebirdsOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "fossette-focacceria-union-market-dc") {
    return normalizeFossetteOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "julii-pike-and-rose-md" || restaurant?.id === "julii-bethesda-md-dc-metro") {
    return normalizeJuliiOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "greenhouse-jefferson-dc") {
    return normalizeGreenhouseOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "lighthouse-tofu-annandale-va-dc-metro") {
    return normalizeLighthouseTofuOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "tiger-dumplings-arlington-va") {
    return normalizeTigerDumplingsOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "soko-butcher-dc-metro") {
    return normalizeSokoButcherOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "yardbird-washington-dc-dc-metro") {
    return normalizeYardbirdOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "grace-s-mandarin-washington-dc-dc-metro") {
    return normalizeGracesMandarinOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "boulangerie-christophe-washington-dc-dc-metro") {
    return normalizeBoulangerieChristopheOfficialMenuIngredients(item);
  }

  if (restaurant?.id === "bayou-bakery-arlington-va" && item?.id === "all-beef-dog") {
    return {
      ...item,
      description: null,
      sourceSummary:
        "Reviewed official Bayou Bakery PDF extraction: ALL BEEF DOG is a real food row, but the scraped description belonged to the neighboring Turkey Melt row and was removed.",
    };
  }

  if (restaurant?.id === "bayou-bakery-arlington-va" && item?.id === "greens") {
    return {
      ...item,
      description: null,
      sourceSummary:
        "Reviewed Bayou Bakery menu extraction: Greens is a side row, but the scraped description belonged to the neighboring Lil Ya't Ham Melt row and was removed.",
    };
  }

  if (
    restaurant?.id === "osm-guajillo-2563891113" &&
    item?.id === "award-winning-mole-poblano-with-grilled-chicken"
  ) {
    return {
      ...item,
      allergens: ["tree-nut"],
      mayContain: item.mayContain ?? [],
      sourceSummary: "contains nuts",
    };
  }

  if (restaurant?.id === "baan-siam-dc" && item?.id === "stir-fried-cuttlefish-with-chili-paste") {
    return {
      ...item,
      allergens: ["peanut", "shellfish"],
      mayContain: item.mayContain ?? [],
      sourceSummary:
        "Reviewed Baan Siam official Toast row: the item contains cuttlefish and the chili paste note says contains peanuts. No tree-nut disclosure is present in the item row.",
    };
  }

  if (restaurant?.id === "van-leeuwen-dc" && item?.id === "vegan-choc-chip-cookie-dough") {
    return {
      ...item,
      allergens: ["tree-nut", "wheat", "soy"],
      mayContain: item.mayContain ?? [],
      sourceSummary: "contains coconut, wheat, soy",
    };
  }

  if (restaurant?.id === "fish-taco-bethesda-md" && item?.id === "chips-and-queso") {
    return {
      ...item,
      allergens: ["milk"],
      mayContain: item.mayContain ?? [],
      sourceSummary: "Reviewed official row text: obvious ingredient terms were mapped to app allergens.",
    };
  }

  if (restaurant?.id === "fish-taco-bethesda-md" && item?.id === "small-cheese-quesadilla-flour-tortilla") {
    return {
      ...item,
      allergens: ["milk", "wheat", "gluten"],
      mayContain: item.mayContain ?? [],
      sourceSummary: "Reviewed official row text: obvious ingredient terms were mapped to app allergens.",
    };
  }

  if (restaurant?.id === "pho-hai-duong-tysons-va" && item?.id === "cha-gio") {
    return {
      ...item,
      allergens: ["shellfish", "fish"],
      mayContain: item.mayContain ?? [],
      sourceSummary:
        "Reviewed official Pho Hai Duong image menu: Cha Gio lists shrimp and fish sauce; neighboring peanut-sauce evidence belongs to Goi Cuon, not this row.",
    };
  }

  if (
    restaurant?.id === "tiger-dumplings-arlington-va" &&
    (item?.id === "chengdu-chili-oil-chicken" || item?.id === "hawaiian-style-fried-rice")
  ) {
    return {
      ...item,
      allergens: ["peanut"],
      mayContain: item.mayContain ?? [],
      sourceSummary:
        item.id === "chengdu-chili-oil-chicken"
          ? "Reviewed Tiger Dumplings official menu: Chengdu Chili Oil Chicken is explicitly marked as containing peanuts. Fish text belongs to the neighboring Sea Salt Garlic Fish Filet row."
          : "Reviewed Tiger Dumplings official menu: Hawaiian-style Fried Rice is explicitly marked as containing peanuts. Fish text belongs to the neighboring Sea Salt Garlic Fish Filet row.",
    };
  }

  if (restaurant?.id === "el-pollo-rico-arlington-va" && item?.id === "flan") {
    return {
      ...item,
      allergens: ["egg", "milk"],
      mayContain: item.mayContain ?? [],
      sourceSummary:
        "Reviewed El Pollo Rico official Toast menu boundary text: Flan is the dairy/egg dessert row. Walnut text belongs to the neighboring rum cake row, not Flan.",
    };
  }

  if (restaurant?.id === "il-canale-dc" && item?.id === "branzino-al-cartoccio-siciliano") {
    return {
      ...item,
      allergens: ["fish", "gluten"],
      mayContain: item.mayContain ?? [],
      sourceSummary: "Reviewed official row-level allergen evidence.",
    };
  }

  if (restaurant?.id === "replacement-marley-s-bar-and-grill-hyattsville-md" && item?.id === "shrimp-and-grits") {
    return {
      ...item,
      allergens: ["milk", "shellfish"],
      mayContain: item.mayContain ?? [],
      sourceSummary:
        "Reviewed Marley’s official PDF/menu text: Shrimp & Grits uses cheese grits and shrimp; the brunch note says Cajun sauce served with shrimp/salmon/catfish over grits contains crawfish. Wheat/gluten text belongs to the neighboring pasta option list.",
    };
  }

  if (restaurant?.id === "replacement-marley-s-bar-and-grill-hyattsville-md" && item?.id === "catfish-and-grits") {
    return {
      ...item,
      allergens: ["fish", "milk", "shellfish"],
      mayContain: item.mayContain ?? [],
      sourceSummary:
        "Reviewed Marley’s official PDF/menu text: Catfish & Grits uses cheese grits and catfish; the brunch note says Cajun sauce served with catfish/shrimp/salmon over grits contains crawfish. Wheat/gluten text belongs to the neighboring pasta option list.",
    };
  }

  return item;
}

function normalizeMiVidaOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const rawIngredientsText = String(item?.ingredientsText ?? "");
  const normalizeEvidenceText = (value) =>
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/\p{M}/gu, "")
      .replace(/[.!?,;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const ingredientsText =
    rawIngredientsText &&
    normalizeEvidenceText(rawIngredientsText) !== normalizeEvidenceText(description) &&
    !normalizeEvidenceText(rawIngredientsText).startsWith(normalizeEvidenceText(description))
      ? rawIngredientsText
      : "";
  const text = `${name} ${description} ${ingredientsText}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergenSourceType && item.allergenSourceType !== "unavailable" ? item.allergens ?? [] : []);

  const hasOfficialMenuDescription =
    description.trim().length > 0 &&
    !/\b(?:®\s*lunch|service\s*@|choice\s+of|with\s+blue\s+cheese,\s+grapes,\s+smoked\s+almonds)$/i.test(description.trim());

  if (!hasOfficialMenuDescription && allergens.size === 0) {
    return item;
  }

  if (/\b(?:tuna|at[uú]n|cod|pescado|salmon|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|jaiba|camarones?|mariscos?|jumbo\s+lump\s+crab)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|eggs|huevos?|deviled\s+eggs|scrambled\s+eggs|mayo|mayonnaise|tartar|custard|flan|french\s+toast)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:cheese|queso|chihuahua|cotija|crema|cream|creamy|butter|whipped\s+cream|ice\s+cream|tres\s+leches|flan|cajeta|blue\s+cheese|melted\s+cheese|fontina)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:peanuts?)\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:almonds?|pecans?|pistachio|pistachios|hazelnut|hazelnuts)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\bsesame\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (
    /\b(?:flour\s+tortillas?|brioche\s+bun|buns?|mini\s+pitas?|pitas?|battered|cornbread|sponge\s+cake|cake|brownie|french\s+toast|buñuelos|bunuelos|empanadas?|turnovers?|tortas?|hamburger)\b/i.test(
      text,
    ) ||
    /\(g\)/i.test(name)
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /mividamexico|toasttab/i.test(String(url))) ??
    "https://www.mividamexico.com/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "MI VIDA official menu ingredient review: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "mi-vida-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed MI VIDA official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeBayouBakeryOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const lower = text.toLowerCase();
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );

  const hasOfficialMenuText = description.trim().length > 0 || ingredientsText.trim().length > 0;
  const clearBleedOnlyRows = new Set(["cookie", "rice-krispies", "ham-cheese-croissant", "steel-cut-irish-oats"]);
  const cleaned = clearBleedOnlyRows.has(id)
    ? {
        ...item,
        description: null,
        ingredientsText: item.ingredientsText ?? null,
        sourceSummary:
          "Reviewed Bayou Bakery official menu extraction: removed neighboring menu or bakery-case text from this row display.",
      }
    : item;

  if (!hasOfficialMenuText && allergens.size === 0 && !/\b(?:croissant|flan|muffin|cookie|fish\s+sandwich)\b/i.test(name)) {
    return cleaned;
  }

  if (/\b(?:fish|salmon|gravlax|blue\s+cat)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:egg|eggs|benedict|hollandaise|flan|quiche|mayonnaise|mayo)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:cheese|cheddar|pimento|pimiento|feta|cream\s+cheese|cream|creamy|milk|yogurt|butter|buttermilk|parmesan|provolone|chèvre|chevre|hollandaise|flan|latte)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:pecan|pecans|almond|almonds|nuts)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:peanut|peanuts|peanut\s+butter)\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:sesame\s+(?:roll|seed|seeded)|sesame\s+seed)\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (
    /\b(?:toast|toasted\s+bread|bread|sourdough|biscuit|biscuits|waffle|waffles|croissant|pie|pita|pitas|ritz|roll|bun|sandwich|hot\s+dog|dog|muff-a-lotta|muffalotta|cookie|cake|quiche|battered)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\bdairy\s+free\b/i.test(text) && !/\b(?:cannot|can't|can\s+not|unable\s+to)\s+(?:be\s+)?(?:made\s+)?dairy\s+free\b/i.test(text)) {
    allergens.delete("milk");
  }

  if (allergens.size === 0) {
    return cleaned;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /bayoubakeryva|toasttab|squarespace/i.test(String(url))) ??
    "https://www.bayoubakeryva.com/eat";

  return {
    ...cleaned,
    ingredientsText: cleaned.ingredientsText ?? cleaned.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: cleaned.mayContain ?? [],
    allergenSourceType: cleaned.allergenSourceType && cleaned.allergenSourceType !== "unavailable"
      ? cleaned.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      cleaned.sourceSummary && /Reviewed Bayou Bakery official/i.test(cleaned.sourceSummary)
        ? cleaned.sourceSummary
        : "Reviewed Bayou Bakery official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(cleaned.evidence ?? []),
      {
        source: "bayou-bakery-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Bayou Bakery official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeDogfishAlehouseOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );

  if (!description.trim() && !ingredientsText.trim() && allergens.size === 0) {
    return item;
  }

  if (/\b(?:ahi|tuna|cod|grouper|salmon|trout|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|crab\s+cake|crab\s+dip|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:mayo|mayonnaise|remoulade|tartar|aioli|thousand\s+island|1,?000\s+island|egg\s+rolls?|brownie|cake)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:blue\s+cheese|cheese|cheddar|swiss|gouda|pepper\s+jack|mascarpone|cream\s+cheese|sour\s+cream|buttermilk|ranch|mozzarella|provolone|parmesan|queso|ice\s+cream|whipped\s+cream|butter|tzatziki|feta)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:peanuts?|peanut\s+sauce)\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:pecans?|walnuts?|almonds?|cashews?)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:tahini|sesame)\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (/\b(?:soy\s+ginger|soy\s+sauce|soy)\b/i.test(text)) {
    allergens.add("soy");
  }

  const explicitlyGlutenFree = /\bgluten[-\s]+free\b/i.test(text);
  if (
    !explicitlyGlutenFree &&
    /\b(?:brioche|marble\s+rye|rye|bread|toast|bun|roll|hoagie|ciabatta|fry\s+bread|pretzel|potstickers?|egg\s+rolls?|pita|pizza|croutons?|onion\s+rings?|tortilla\s+chips?|tortilla\s+strips?|penne|battered|brownie|cake)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /dogfishalehouse/i.test(String(url))) ??
    "https://dogfishalehouse.com/menu/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /Reviewed official row-level allergen evidence/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed Dogfish Head Alehouse official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "dogfish-alehouse-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Dogfish Head Alehouse official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeGoodCompanyOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const summary = String(item?.sourceSummary ?? "");
  const usableSummary =
    summary && !/^Reviewed Good Company/i.test(summary) && !/\b(?:GOCO Locations|Location & Hours)\b/i.test(summary)
      ? summary
      : "";
  const text = `${name} ${description} ${ingredientsText} ${usableSummary}`.replace(/\b(?:OUT OF STOCK|24HR NOTICE)\b/gi, " ");
  const lower = text.toLowerCase();
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = description.trim().length > 0 || ingredientsText.trim().length > 0 || usableSummary.trim().length > 0;
  const glutenFree = /\b(?:gluten[-\s]+free|\(gf\)|gf\b)\b/i.test(text);
  const vegan = /\bvegan\b/i.test(text);

  if (!hasEvidenceText && allergens.size === 0 && !/\b(?:doughnut|donut|croissant|muffin|bagel|scone|sandwich|toast|pancake|cake|tart)\b/i.test(name)) {
    return item;
  }

  if (/\b(?:salmon|lox)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:egg|eggs|mayo|aioli|mayonnaise)\b/i.test(text) && !vegan) {
    allergens.add("egg");
  }

  const dairyText = text
    .replace(/\b(?:almond|oat|soy|coconut)\s+milk\b/gi, " ")
    .replace(/\bpeanut\s+butter\b/gi, " ")
    .replace(/\bbutter\s+lettuce\b/gi, " ");

  if (
    /\b(?:milk|cheese|cheddar|brie|burrata|cream\s+cheese|cream|creamy|butter|buttermilk|half\s*&\s*half|1\/2\s*&\s*1\/2|steamed\s+milk|latte|provolone|swiss|fontina|goat\s+cheese|feta|iberico|mascarpone|ganache|bavarian\s+cream|yogurt)\b/i.test(
      dairyText,
    ) &&
    !vegan
  ) {
    allergens.add("milk");
  }

  if (/\b(?:almond|almonds|almond\s+milk|walnuts?|nuts)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:peanut|peanuts|peanut\s+butter|pb&j)\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:tofu|soy|sourdough doughnut.*soy|allergens?:\s*wheat,\s*soy)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\b(?:dijon|mustard)\b/i.test(text)) {
    allergens.add("mustard");
  }

  if (!glutenFree && /\b(?:bread|toast|wholegrain|multigrain|ciabatta|bagel|english\s+muffins?|muffin|hoagie|semolina|sourdough|croissant|panini|sandwich|brioche|bun|doughnuts?|donuts?|scone|pancakes?|cake|coffee\s+cake|tart|pastry|pie|fritter|cinnamon\s+bun|long\s+john|doissant|braid|bagels?|chips|graham\s+cracker)\b/i.test(text)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (glutenFree) {
    allergens.delete("gluten");
    allergens.delete("wheat");
  }

  if (vegan) {
    allergens.delete("egg");
    allergens.delete("milk");
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /gocodough|toasttab/i.test(String(url))) ??
    "https://gocodough.com/menu/ballston-good-company-doughnuts-cafe-672-n-glebe-road-suite-retail-1";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? (usableSummary ? usableSummary : undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /^Reviewed Good Company official/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed Good Company official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "good-company-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Good Company official menu text: ${name}${description || usableSummary ? ` - ${description || usableSummary}` : ""}`,
      },
    ],
  };
}

function normalizePubAndThePeopleOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const summary = String(item?.sourceSummary ?? "");
  const usableSummary =
    summary && !/^Reviewed /i.test(summary) && !/\b(?:source|evidence|row-boundary)\b/i.test(summary)
      ? summary
      : "";
  const text = `${name} ${description} ${ingredientsText} ${usableSummary}`.replace(/\b(?:Not available for to-\s*go)\b/gi, " ");
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = description.trim().length > 0 || ingredientsText.trim().length > 0 || usableSummary.trim().length > 0;
  const glutenFree = /\b(?:gluten[-\s]+free|\(gf\)|\[gf\]|gf\b)\b/i.test(text);
  const vegan = /\bvegan\b/i.test(text);

  if (!hasEvidenceText && allergens.size === 0) {
    return item;
  }

  if (/\b(?:salmon)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|eggs|aioli|mayo|deviled|omelette|creme\s+brulee|cr[eè]me\s+br[uû]l[eé]e|custard)\b/i.test(text) && !vegan) {
    allergens.add("egg");
  }

  const dairyText = text
    .replace(/\bbuttercrunch\s+lettuce\b/gi, " ")
    .replace(/\bbutter\s+lettuce\b/gi, " ");

  if (
    /\b(?:cheddar|provolone|provalone|parm|parmesan|parmesean|cheese|burrata|goat\s+cheese|feta|blue\s+cheese|sour\s+cream|buttermilk|butter|buttered|cream|creamy|veloute|risotto|whipped\s+butter|vanilla\s+ice\s+cream)\b/i.test(
      dairyText,
    ) &&
    !vegan
  ) {
    allergens.add("milk");
  }

  if (/\b(?:soy|tamari)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\b(?:sesame|tahini)\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (/\b(?:miso)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\b(?:mustard|dijon)\b/i.test(text)) {
    allergens.add("mustard");
  }

  if (
    !glutenFree &&
    /\b(?:biscuit|biscuits|waffle|waffles|brioche|bun|multigrain|loaf|toast|toasted|pain\s+de\s+mie|bread|roll|soft\s+roll|crostini|couscous|panko|rigatoni|bread\s+crumbs?|crumbs?|tempura|hush\s*puppies|hushpuppies|pancakes?|cobbler|graham\s+cracker|flour\s+tortillas?|quesadilla|burrito|sandwich)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (glutenFree) {
    allergens.delete("gluten");
    allergens.delete("wheat");
  }

  if (vegan && !/\b(?:buttered|butter|cream|cheese|egg|aioli|mayo)\b/i.test(text)) {
    allergens.delete("egg");
    allergens.delete("milk");
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /thepubandthepeople|toasttab/i.test(String(url))) ??
    "https://thepubandthepeople.com/bloomingdale-shaw-the-pub-and-the-people-food-menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? (usableSummary ? usableSummary : undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /^Reviewed .*official/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed The Pub & The People official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "pub-and-the-people-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed The Pub & The People official menu text: ${name}${description || usableSummary ? ` - ${description || usableSummary}` : ""}`,
      },
    ],
  };
}

function normalizeYourOnlyFriendOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const summary = String(item?.sourceSummary ?? "");
  const rawIngredientsText = String(item?.ingredientsText ?? "");
  const normalizeEvidenceText = (value) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const ingredientsText =
    rawIngredientsText && normalizeEvidenceText(rawIngredientsText) !== normalizeEvidenceText(description)
      ? rawIngredientsText
      : "";
  const previousReviewText = (item.evidence ?? [])
    .filter((entry) => entry?.source === "your-only-friend-official-menu-review")
    .map((entry) => String(entry?.text ?? "").replace(/^Reviewed Your Only Friend official menu text:\s*/i, ""))
    .join(" ");
  const htmlCardEvidenceText = (item.evidence ?? [])
    .filter((entry) => entry?.sourceKind === "html-card")
    .map((entry) => String(entry?.text ?? ""))
    .filter((text) => {
      const normalizedText = normalizeEvidenceText(text);
      const hasAllergenDisclosure = /\b(?:allerg(?:y|en)\s+alert|contains?)\b/i.test(text);
      return (
        !new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(text.trim()) &&
        (hasAllergenDisclosure || !description.trim() || !normalizedText.startsWith(normalizeEvidenceText(description)))
      );
    })
    .join(" ");
  let extraSummary = /^Reviewed /i.test(summary) ? "" : summary;
  if (description.trim() && summary.toLowerCase().startsWith(description.toLowerCase())) {
    extraSummary = summary.slice(description.length).replace(/^[\s,.:-]+/, "");
  }
  if (/^Reviewed /i.test(extraSummary)) {
    extraSummary = "";
  }
  const fullText = `${name} ${description} ${ingredientsText} ${extraSummary}`.trim();
  const parseText = `${fullText} ${htmlCardEvidenceText} ${previousReviewText}`.trim();
  const alertMatches = Array.from(parseText.matchAll(/allerg(?:y|en)\s+alert\s*[:!-]*\s*([^.!?]+(?:!!!)?)/gi));
  const containsMatches = Array.from(parseText.matchAll(/\bcontains?\s+([^.!?]+?)(?:\s*\(|$|[.!?])/gi));
  const alertText = [...alertMatches, ...containsMatches].map((match) => match[1] ?? "").join(" ");
  const evidenceText = alertText || parseText;
  const ingredientEvidenceText = `${evidenceText} ${parseText}`;
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );

  if (/\b(?:anchov(?:y|ies)|fish|cod|bonito|fish\s+sauce)\b/i.test(ingredientEvidenceText)) {
    allergens.add("fish");
  }

  if (/\b(?:dairy|milk|cheese|cream\s+cheese|mozzarella|swiss|parm|ranch|custard|cream|buttered)\b/i.test(ingredientEvidenceText)) {
    allergens.add("milk");
  }

  if (/\b(?:eggs?|mayo|mayonnaise|duke'?s)\b/i.test(ingredientEvidenceText)) {
    allergens.add("egg");
  }

  if (/\bsoy\b/i.test(ingredientEvidenceText)) {
    allergens.add("soy");
  }

  if (/\bsesame\b/i.test(ingredientEvidenceText)) {
    allergens.add("sesame");
  }

  if (/\bmustard\b/i.test(ingredientEvidenceText)) {
    allergens.add("mustard");
  }

  if (/\bpeanuts?\b/i.test(ingredientEvidenceText)) {
    allergens.add("peanut");
  }

  if (/\b(?:nuts?|tree\s+nuts?|almonds?|cashews?|pecans?|walnuts?|pistachios?|hazelnuts?)\b/i.test(ingredientEvidenceText)) {
    allergens.add("tree-nut");
  }

  if (/\bgluten\b/i.test(evidenceText) && !/\bgluten\s*free\b/i.test(evidenceText)) {
    allergens.add("gluten");
  }

  if (
    /\bwheat\b/i.test(evidenceText) ||
    /\b(?:soft\s+roll|roll|bun|bread|focaccia|cracker\s+crust|saltine|rye\s+chips|bagel\s+spice|beer-battered|battered|nugget)\b/i.test(
      fullText,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /youronlyfrienddc|toasttab/i.test(String(url))) ??
    "https://www.youronlyfrienddc.com/menu";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "your-only-friend-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Your Only Friend official menu allergy-alert review: explicit allergy-alert text and direct row ingredients from the official menu were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "your-only-friend-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Your Only Friend official menu text: ${fullText.trim()}`,
      },
    ],
  };
}

function normalizeTaqueriaHabaneroOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const rawIngredientsText = String(item?.ingredientsText ?? "");
  const normalizeEvidenceText = (value) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const ingredientsText =
    rawIngredientsText && normalizeEvidenceText(rawIngredientsText) !== normalizeEvidenceText(description)
      ? rawIngredientsText
      : "";
  const summary = String(item?.sourceSummary ?? "");
  let extraSummary = /^Reviewed /i.test(summary) ? "" : summary;
  if (description.trim() && summary.toLowerCase().startsWith(description.toLowerCase())) {
    extraSummary = summary.slice(description.length).replace(/^[\s,.:-]+/, "");
  }
  if (/^Reviewed /i.test(extraSummary)) {
    extraSummary = "";
  }
  if (extraSummary && description.trim() && normalizeEvidenceText(extraSummary).startsWith(normalizeEvidenceText(description))) {
    extraSummary = extraSummary.slice(description.length).replace(/^[\s,.:-]+/, "");
  }
  const htmlCardEvidenceText = (item.evidence ?? [])
    .filter((entry) => entry?.sourceKind === "html-card")
    .map((entry) => String(entry?.text ?? ""))
    .filter((text) => !new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(text.trim()))
    .join(" ");
  const previousReviewText = (item.evidence ?? [])
    .filter((entry) => entry?.source === "taqueria-habanero-official-menu-review")
    .map((entry) => String(entry?.text ?? "").replace(/^Reviewed Taqueria Habanero official menu text:\s*/i, ""))
    .join(" ");
  const displaySegments = [name, description, ingredientsText, extraSummary, htmlCardEvidenceText].filter(Boolean);
  const uniqueDisplaySegments = [];
  for (const segment of displaySegments) {
    const normalizedSegment = normalizeEvidenceText(segment);
    if (
      !uniqueDisplaySegments.some((existing) => {
        const normalizedExisting = normalizeEvidenceText(existing);
        return (
          normalizedExisting === normalizedSegment ||
          normalizedExisting.startsWith(normalizedSegment) ||
          normalizedSegment.startsWith(normalizedExisting)
        );
      })
    ) {
      uniqueDisplaySegments.push(segment);
    }
  }
  const displayRowText = uniqueDisplaySegments.join(" ").replace(/\s+/g, " ").trim();
  const rowText = `${displayRowText} ${previousReviewText}`.trim();
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = rowText.replace(name, "").trim().length > 0;

  if (
    /\b(?:shrimp|camarones?|scallops?)\b/i.test(rowText) &&
    !/\bchoice\s+of\b[^.]*\bshrimp\b/i.test(rowText)
  ) {
    allergens.add("shellfish");
  }

  if (/\b(?:queso|cheese|oaxaca|chihuahua|crema|cream|sour\s+cream|tres\s+leches|milk|milk\s+trifecta)\b/i.test(rowText)) {
    allergens.add("milk");
  }

  if (/\b(?:egg|eggs|mayo|mayonnaise|aioli)\b/i.test(rowText)) {
    allergens.add("egg");
  }

  if (/\b(?:sesame|ajonjol[ií])\b/i.test(rowText)) {
    allergens.add("sesame");
  }

  if (/\b(?:nuts?|almonds?|pecans?|walnuts?|cashews?|hazelnuts?|pistachios?)\b/i.test(rowText)) {
    allergens.add("tree-nut");
  }

  if (
    /\b(?:flour\s+tortilla|telera|torta|sandwich|breaded|battered|sponge\s+cake|cake|beer)\b/i.test(rowText)
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (!hasEvidenceText && allergens.size === 0) {
    return item;
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /taqueriahabanero|toasttab|drive\.google/i.test(String(url))) ??
    "https://www.taqueriahabanero.com/menus";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "taqueria-habanero-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Taqueria Habanero official menu ingredient review: direct ingredient terms and explicit warnings from the official menu row were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "taqueria-habanero-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Taqueria Habanero official menu text: ${displayRowText}`,
      },
    ],
  };
}

function normalizeIlCanaleOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const rawIngredientsText = String(item?.ingredientsText ?? "");
  const normalizeEvidenceText = (value) =>
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/\p{M}/gu, "")
      .replace(/[.!?,;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const ingredientsText =
    rawIngredientsText &&
    normalizeEvidenceText(rawIngredientsText) !== normalizeEvidenceText(description) &&
    !normalizeEvidenceText(rawIngredientsText).startsWith(normalizeEvidenceText(description))
      ? rawIngredientsText
      : "";
  const summary = String(item?.sourceSummary ?? "");
  let extraSummary = /^Reviewed /i.test(summary) ? "" : summary;
  if (description.trim() && summary.toLowerCase().startsWith(description.toLowerCase())) {
    extraSummary = summary.slice(description.length).replace(/^[\s,.:-]+/, "");
  }
  if (/^Reviewed /i.test(extraSummary)) {
    extraSummary = "";
  }
  const htmlCardEvidenceText = (item.evidence ?? [])
    .filter((entry) => entry?.sourceKind === "html-card" || entry?.sourceKind === "spotapps-nuxt-menu")
    .map((entry) => String(entry?.text ?? ""))
    .filter((text) => {
      const normalizedText = normalizeEvidenceText(text);
      return (
        !new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(text.trim()) &&
        (!description.trim() || !normalizedText.startsWith(normalizeEvidenceText(description)))
      );
    })
    .join(" ");
  const previousReviewText = (item.evidence ?? [])
    .filter((entry) => entry?.source === "il-canale-official-menu-review")
    .map((entry) => String(entry?.text ?? "").replace(/^Reviewed Il Canale official menu text:\s*/i, ""))
    .join(" ");
  const displaySegments = [name, description, ingredientsText, extraSummary, htmlCardEvidenceText].filter(Boolean);
  const uniqueDisplaySegments = [];
  for (const segment of displaySegments) {
    const normalizedSegment = normalizeEvidenceText(segment);
    if (
      !uniqueDisplaySegments.some((existing) => {
        const normalizedExisting = normalizeEvidenceText(existing);
        return (
          normalizedExisting === normalizedSegment ||
          normalizedExisting.startsWith(normalizedSegment) ||
          normalizedSegment.startsWith(normalizedExisting)
        );
      })
    ) {
      uniqueDisplaySegments.push(segment);
    }
  }
  const displayRowText = uniqueDisplaySegments.join(" ").replace(/\s+/g, " ").trim();
  const rowText = `${displayRowText} ${previousReviewText}`.trim();
  const rowTextWithoutNoCheese = rowText.replace(/\bno\s+cheese\b/gi, " ");
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = rowText.replace(name, "").trim().length > 0;

  if (/\b(?:salmon|salmone|tuna|tonno|albacore|anchov(?:y|ies)|branzino|sea\s+bass|fish)\b/i.test(rowText)) {
    allergens.add("fish");
  }

  if (/\b(?:calamari|lobster|shrimp|scoglio|seafood)\b/i.test(rowText)) {
    allergens.add("shellfish");
  }

  if (
    /\b(?:mozzarella|ricotta|cheese|stracciatella|grana\s+padano|parmigiano|parmesan|pecorino|fior\s+di\s+latte|buffalo\s+mozzarella|burrata|bechamel|butter|cream|mascarpone|gelato|panna\s+cotta|goat\s+cheese|blue\s+cheese|fontina|provolone|milk|milks)\b/i.test(
      rowTextWithoutNoCheese,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:egg|eggs|hollandaise|ladyfingers?|sponge\s+cake)\b/i.test(rowText)) {
    allergens.add("egg");
  }

  if (/\b(?:almonds?|pistachios?|hazelnuts?|walnuts?|pecans?)\b/i.test(rowText)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:soy|contains\s+soy|demi-glace\s+contains\s+soy|aioli\s+contains\s+soy)\b/i.test(rowText)) {
    allergens.add("soy");
  }

  const isGlutenFreeNamed = /\bgluten[-\s]*free\b|\b\(gf\)\b/i.test(rowText);
  if (
    /\b(?:organic\s+flour|wheat|00\s*flour|housemade\s+organic\s+flour|pizza|pasta|bread|focaccia|bruschetta|calzone|cannoli|ravioli|gnocchi|lasagna|spaghetti|penne|cannelloni|ladyfingers?|sponge\s+cake|cake|breadcrumbs?)\b/i.test(
      rowText,
    ) &&
    (!isGlutenFreeNamed || /\b(?:wheat|flour|00\s*flour|bread|focaccia|bruschetta|calzone|cannoli|ladyfingers?|sponge\s+cake|cake|breadcrumbs?)\b/i.test(rowText))
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\bcontains\s+gluten\b/i.test(rowText)) {
    allergens.add("gluten");
  }

  if (allergens.size === 0 && !hasEvidenceText) {
    return item;
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /ilcanale|spotapps|toasttab|grubhub/i.test(String(url))) ??
    "https://ilcanale.com/washington-dc-georgetown-il-canale-food-menu";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "il-canale-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Il Canale official menu ingredient review: direct ingredient terms from the official menu row were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "il-canale-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Il Canale official menu text: ${displayRowText}`,
      },
    ],
  };
}

function clearStaleReviewedOfficialIngredientItem(item) {
  if (item?.allergenSourceType !== "official-ingredients") {
    return item;
  }

  const next = { ...item };
  next.allergens = [];
  next.mayContain = [];
  next.allergenSourceType = "unavailable";
  delete next.sourceSummary;
  delete next.ingredientsText;
  next.evidence = (next.evidence ?? []).filter((entry) => entry?.sourceKind !== "official-menu-ingredient-review");
  return next;
}

function normalizeDukesGroceryOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const summary = String(item?.sourceSummary ?? "");
  const usableSummary =
    summary && !/^Reviewed /i.test(summary) && !/\b(?:source|evidence|row-boundary)\b/i.test(summary)
      ? summary
      : "";
  const text = `${name} ${description} ${ingredientsText} ${usableSummary}`;
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = description.trim().length > 0 || ingredientsText.trim().length > 0 || usableSummary.trim().length > 0;

  if (!hasEvidenceText && allergens.size === 0 && !/\b(?:toast|bun|salmon|tuna|burger|waffles?|french\s+toast|mac\s*&?\s*cheese)\b/i.test(name)) {
    return item;
  }

  if (/\b(?:salmon|tuna|cod|worcestershire|fish\s*&?\s*chips?)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (
    /\b(?:egg|eggs|aioli|mayo|mayonnaise|ranch|tartar|dijonnaise|french\s+toast|waffles?|hollandaise)\b/i.test(text)
  ) {
    allergens.add("egg");
  }

  const dairyText = text.replace(/\bvegan\s+(?:cheese|mayo|aioli)\b/gi, " ");
  if (
    /\b(?:milk|cheese|blue\s+cheese|swiss|gouda|cheddar|cream|crema|cotija|feta|b[eé]chamel|butter|ranch|mac\s*&?\s*cheese)\b/i.test(
      dairyText,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:walnut|walnuts|pesto)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:dijon|mustard|dijonnaise)\b/i.test(text)) {
    allergens.add("mustard");
  }

  if (
    /\b(?:toast|bread|bread\s+crumbs?|crusty\s+bread|naan|brioche|bun|ciabatta|torta\s+roll|roll|sourdough|panko|battered|schnitzel|pasta|mac\s*&?\s*cheese|waffles?|french\s+toast)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\bnot\s+gluten\s+free\b/i.test(text)) {
    allergens.add("gluten");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /toasttab\.com\/online\/duke/i.test(String(url))) ??
    "https://order.toasttab.com/online/duke-s-grocery-1513-17th-st-nw";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "dukes-grocery-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? (usableSummary ? usableSummary : undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /^Reviewed Duke/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed Duke's Grocery official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "dukes-grocery-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Duke's Grocery official menu text: ${name}${description || usableSummary ? ` - ${description || usableSummary}` : ""}`,
      },
    ],
  };
}

function normalizeYellowGeorgetownOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const summary = String(item?.sourceSummary ?? "");
  if (
    ["classic-hummus", "green-tomato-tatbili-hummus", "lamb-awarma-hummus"].includes(item?.id) &&
    !/\b(?:tahini|sesame|pita|bread|feta|labne|yogurt)\b/i.test(`${description} ${ingredientsText}`)
  ) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }
  const usableSummary =
    summary && !/^Reviewed /i.test(summary) && !/\b(?:source|evidence|row-boundary)\b/i.test(summary)
      ? summary
      : "";
  const text = `${name} ${description} ${ingredientsText} ${usableSummary}`;
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = description.trim().length > 0 || ingredientsText.trim().length > 0 || usableSummary.trim().length > 0;

  if (
    !hasEvidenceText &&
    allergens.size === 0 &&
    !/\b(?:bun|cookie|croissant|pita|pain\s+suisse|kouign\s+amann|danish|cruffin|brownie|basbousa)\b/i.test(name)
  ) {
    return item;
  }

  if (/\b(?:fish|trout|white\s+fish|schmear)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:egg|eggs|cookie|cake|croissant|pain\s+suisse|kouign\s+amann|shortbread|danish|cruffin|brownie|ranch)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:milk|dairy|feta|labne|yogurt|kashkaval|cheese|cream|cremeux|caramel|toffee|white\s+chocolate|butter|brown\s+butter|ranch|croissant|pain\s+suisse|kouign\s+amann|danish|cruffin|schmear)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:walnut|walnuts|pine\s+nut|pine\s+nuts|pistachio|pistachios)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:sesame|tahini|halawa)\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (
    /\b(?:bun|cookie|cake|croissant|pitas?|pita\s+bread|bread|semolina|pain\s+suisse|kouign\s+amann|shortbread|sfeeha|meat\s+pie|danish|cruffin|brownie|ka'?ak|basbousa)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /toasttab\.com\/online\/yellow/i.test(String(url))) ??
    "https://order.toasttab.com/online/yellowgeorgetown";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "yellow-georgetown-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? (usableSummary ? usableSummary : undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /^Reviewed YELLOW/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed YELLOW official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "yellow-georgetown-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed YELLOW official menu text: ${name}${description || usableSummary ? ` - ${description || usableSummary}` : ""}`,
      },
    ],
  };
}

function normalizeBaanSiamOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const summary = String(item?.sourceSummary ?? "");
  const usableSummary =
    summary && !/^Reviewed /i.test(summary) && !/\b(?:source|evidence|row-boundary)\b/i.test(summary)
      ? summary
      : "";
  const originalText = `${name} ${description} ${ingredientsText} ${usableSummary}`;
  const text = originalText.replace(/\boyster\s+mushrooms?\b/gi, "mushrooms");
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = description.trim().length > 0 || ingredientsText.trim().length > 0 || usableSummary.trim().length > 0;
  const glutenFree = /\b(?:gf|gluten[-\s]+free)\b/i.test(originalText);

  if (
    !hasEvidenceText &&
    allergens.size === 0 &&
    !/\b(?:egg|shrimp|tofu|peanut|branzino|salmon|noodles?|wheat\s+flour|tempura)\b/i.test(name)
  ) {
    return item;
  }

  if (/\b(?:branzino|salmon)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|cuttlefish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|eggs|egg\s+noodles?|fried\s+egg)\b/i.test(text)) {
    allergens.add("egg");
  }

  const dairyText = text.replace(/\b(?:coconut\s+milk|no\s+coconut\s+milk)\b/gi, " ");
  if (/\b(?:cream|thai\s+tea)\b/i.test(dairyText)) {
    allergens.add("milk");
  }

  if (/\b(?:peanut|peanuts|ground\s+peanuts?|peanut\s+sauce)\b/i.test(text)) {
    allergens.add("peanut");
  }

  const soyText = text.replace(/\balso\s+available\s+with\s+tofu\b/gi, " ");
  if (/\b(?:tofu|soy\s+sauce|fermented\s+red\s+bean\s+curd|bean\s+curd)\b/i.test(soyText)) {
    allergens.add("soy");
  }

  if (
    /\b(?:wheat\s+flour|tempura\s+flour|tempura\s+vegetable|egg\s+noodles?|khao\s+soi|steamed\s+noodles)\b/i.test(text)
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (glutenFree && !/\b(?:wheat\s+flour|tempura\s+flour|tempura\s+vegetable|egg\s+noodles?)\b/i.test(text)) {
    allergens.delete("gluten");
    allergens.delete("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /(?:baansiamdc|toasttab\.com\/online\/baan-siam)/i.test(String(url))) ??
    "https://order.toasttab.com/online/baan-siam-425-i-st-nw";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "baan-siam-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? (usableSummary ? usableSummary : undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /^Reviewed Baan Siam/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed Baan Siam official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "baan-siam-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Baan Siam official menu text: ${name}${description || usableSummary ? ` - ${description || usableSummary}` : ""}`,
      },
    ],
  };
}

function normalizePurplePatchOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const summary = String(item?.sourceSummary ?? "");
  const usableSummary =
    summary && !/^Reviewed /i.test(summary) && !/\b(?:source|evidence|row-boundary)\b/i.test(summary)
      ? summary
      : "";
  const text = `${name} ${description} ${ingredientsText} ${usableSummary}`.replace(/\bcoconut\s+milk\b/gi, " ");
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = description.trim().length > 0 || ingredientsText.trim().length > 0 || usableSummary.trim().length > 0;

  if (
    !hasEvidenceText &&
    allergens.size === 0 &&
    !/\b(?:soy|crab|shrimp|bagoong|egg|cheese|milk|custard|mayo|bun|bread|pasta|cake|roll|flour|noodles?)\b/i.test(name)
  ) {
    return item;
  }

  if (/\b(?:crab|shrimp|bagoong|shrimp\s+paste|seafood)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:fish\s+sauce|anchovy|anchovies)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:egg|eggs|mayo|mayonnaise|meringue|custard|leche\s+flan|flan)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:milk|condensed\s+milk|evaporated\s+milk|cheese|gruyere|parmesan|queso|cream|creamy|custard|butter|buttered)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:soy\s+sauce|tofu|tokwa)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (
    /\b(?:soy\s+sauce|pan\s+de\s+sal|bun|buns|bread|breaded|focaccia|pasta|macaroni|noodles?|flour|flour\s+tortilla|roll|lumpia|wrapper|waffle)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\bcontains?\s+gluten\b/i.test(text)) {
    allergens.add("gluten");
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /(?:purplepatchdc|toasttab\.com\/online\/purplepatch)/i.test(String(url))) ??
    "https://order.toasttab.com/online/purplepatchdc";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "purple-patch-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? (usableSummary ? usableSummary : undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /^Reviewed Purple Patch/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed Purple Patch official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "purple-patch-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Purple Patch official menu text: ${name}${description || usableSummary ? ` - ${description || usableSummary}` : ""}`,
      },
    ],
  };
}

function normalizeLapisOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const summary = String(item?.sourceSummary ?? "");
  const evidenceText = (item?.evidence ?? [])
    .filter((entry) => entry?.sourceKind === "html-card")
    .map((entry) => entry?.text)
    .filter(Boolean)
    .join(" ");
  const usableSummary =
    summary && !/^Reviewed /i.test(summary) && !/\b(?:source|evidence|row-boundary)\b/i.test(summary)
      ? summary
      : "";
  const text = `${name} ${description} ${ingredientsText} ${usableSummary} ${evidenceText}`;
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = description.trim().length > 0 || ingredientsText.trim().length > 0 || usableSummary.trim().length > 0;

  if (
    !hasEvidenceText &&
    allergens.size === 0 &&
    !/\b(?:croissant|naan|waffle|pistachio\s+cake|whole\s+pistachio\s+cake|yogurt\s+parfait)\b/i.test(name)
  ) {
    return item;
  }

  if (/\b(?:trout|mahee)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|eggs|cake|mousse|croissant|waffle|pound\s+cake)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:milk|sour\s+cream|goat\s+cheese|parmesan|ricotta|yogurt|pudding|mousse|croissant|waffle|cake)\b/i.test(text)
  ) {
    allergens.add("milk");
  }

  if (/\b(?:walnut|walnuts|pecan|pecans|pistachio|pistachios|almond|almonds|almond\s+flour)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (
    /\b(?:flat\s+bread|bread|croissant|dumpling|semolina\s+flour|flour|naan|pastry|cake|pound\s+cake|waffle)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /toasttab\.com\/online\/lapis/i.test(String(url))) ??
    "https://order.toasttab.com/online/lapis-1847-columbia-rd-nw";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "lapis-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? (usableSummary ? usableSummary : undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /^Reviewed Lapis/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed Lapis official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "lapis-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Lapis official menu text: ${name}${description || usableSummary ? ` - ${description || usableSummary}` : ""}`,
      },
    ],
  };
}

function normalizeDaikayaOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const rawIngredientsText = String(item?.ingredientsText ?? "");
  const normalizeEvidenceText = (value) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const ingredientsText =
    rawIngredientsText && normalizeEvidenceText(rawIngredientsText) !== normalizeEvidenceText(description)
      ? rawIngredientsText
      : "";
  const summary = String(item?.sourceSummary ?? "");
  let rowText = `${name} ${description} ${ingredientsText}`;

  const rowBoundaryTextById = new Map([
    [
      "fried-confit-garlic-cloves",
      "Fried-confit garlic cloves (gluten, fish) kimchi-miso, grilled bread",
    ],
    ["harami-beef-dollar16-2-skewers", "Harami Beef (gluten) salt, garlic, togarashi"],
    ["natto-gohan", "Natto gohan scallion, soy sauce"],
  ]);

  if (rowBoundaryTextById.has(id)) {
    rowText = rowBoundaryTextById.get(id);
  } else if (
    summary &&
    !description.trim() &&
    !/^Reviewed /i.test(summary) &&
    !/\b(?:source|evidence)\b/i.test(summary) &&
    !rowText.toLowerCase().includes(summary.toLowerCase().trim())
  ) {
    rowText = `${rowText} ${summary}`;
  }

  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = rowText.replace(name, "").trim().length > 0;

  if (
    /\b(?:tuna|maguro|chutoro|salmon|ikura|roe|bonito|katsuobushi|anchovies|catfish|fish|hamachi|yellowtail|sashimi|dashi)\b/i.test(
      rowText,
    ) ||
    /\(fish\b/i.test(rowText) ||
    /\bcontains\s+fish\b/i.test(rowText)
  ) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|clam|oyster(?:s)?\b|octopus|takoyaki|seafood|shellfish)\b/i.test(rowText)) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|onsen\s+egg|nitamago|omelet|tamago|mayo|mayonnaise|kewpie)\b/i.test(rowText)) {
    allergens.add("egg");
  }

  const dairyText = rowText.replace(/\bcoconut\s+(?:milk|cream|ice\s+cream|yogurt)\b/gi, " ");
  if (
    /\b(?:milk|dairy|butter|cheese|pecorino|parmesan|labne|soft\s+serve|ice\s+cream|cream)\b/i.test(
      dairyText,
    ) ||
    /\(dairy\b/i.test(rowText)
  ) {
    allergens.add("milk");
  }

  if (/\bpeanuts?\b/i.test(rowText) || /peanut\s+allergen\s+warning/i.test(rowText)) {
    allergens.add("peanut");
  }

  if (/\b(?:sesame|goma)\b/i.test(rowText) || /\(sesame\b/i.test(rowText)) {
    allergens.add("sesame");
  }

  if (/\b(?:soy|shoyu|soy\s+sauce|miso|tofu|edamame|natto)\b/i.test(rowText) || /\(soy\b/i.test(rowText)) {
    allergens.add("soy");
  }

  if (
    /\b(?:wheat\s+noodles?|udon|wonton|grilled\s+bread|bread|panko|dumplings?|takoyaki|spring\s+rolls?|soy\s+sauce|shoyu|ramen\s+noodles?)\b/i.test(
      rowText,
    ) ||
    /\bgluten\b/i.test(rowText)
  ) {
    allergens.add("gluten");
    if (!/\bbarley\s+miso\b/i.test(rowText) || /\b(?:wheat|udon|wonton|bread|panko|dumplings?|takoyaki|spring\s+rolls?|soy\s+sauce|shoyu|ramen\s+noodles?)\b/i.test(rowText)) {
      allergens.add("wheat");
    }
  }

  if (/\bbarley\s+miso\b/i.test(rowText)) {
    allergens.add("gluten");
  }

  if (!hasEvidenceText && allergens.size === 0) {
    return item;
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /daikaya\.com/i.test(String(url))) ?? "https://www.daikaya.com/menus/";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "daikaya-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Daikaya official menu ingredient review: direct terms and explicit allergen notes from the official menu item row were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "daikaya-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Daikaya official menu text: ${rowText.trim()}`,
      },
    ],
  };
}

function normalizeBantamKingOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const rawIngredientsText = String(item?.ingredientsText ?? "");
  const normalizeEvidenceText = (value) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const ingredientsText =
    rawIngredientsText && normalizeEvidenceText(rawIngredientsText) !== normalizeEvidenceText(description)
      ? rawIngredientsText
      : "";
  const summary = String(item?.sourceSummary ?? "");
  let rowText = `${name} ${description} ${ingredientsText}`;

  let extraSummary = summary;
  if (description.trim() && summary.toLowerCase().startsWith(description.toLowerCase())) {
    extraSummary = summary.slice(description.length).replace(/^[\s,.:-]+/, "");
  }

  if (
    extraSummary &&
    !/^Reviewed /i.test(summary) &&
    !/\b(?:source|evidence|recovered from)\b/i.test(summary) &&
    !rowText.toLowerCase().includes(extraSummary.toLowerCase().trim())
  ) {
    rowText = `${rowText} ${extraSummary}`;
  }

  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = rowText.replace(name, "").trim().length > 0;

  if (/\b(?:fish\s+cake|naruto|fish|bonito|dashi)\b/i.test(rowText)) {
    allergens.add("fish");
  }

  if (/\b(?:egg|nitamago|onsen\s+egg|soft-boiled\s+egg|slow\s+cooked\s+egg|mayo|mayonnaise|kewpie)\b/i.test(rowText)) {
    allergens.add("egg");
  }

  if (
    /\b(?:milk|milk-based|condensed\s+milk|butter|ice\s+cream|mochi\s+ice\s+cream|chocolate|cookie)\b/i.test(rowText)
  ) {
    allergens.add("milk");
  }

  if (/\bpeanuts?\b/i.test(rowText) || /peanut\s+allergen\s+warning/i.test(rowText)) {
    allergens.add("peanut");
  }

  if (/\b(?:sesame|goma)\b/i.test(rowText)) {
    allergens.add("sesame");
  }

  if (/\b(?:soy|soy\s+sauce|shoyu|miso|tofu|edamame|tempeh)\b/i.test(rowText)) {
    allergens.add("soy");
  }

  if (
    /\b(?:soy\s+sauce|shoyu|dumplings?|gyoza|dinner\s+roll|roll\b|cookie|wheat|gluten|noodles?)\b/i.test(rowText)
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (!hasEvidenceText && allergens.size === 0) {
    return item;
  }

  if (allergens.size === 0) {
    return clearStaleReviewedOfficialIngredientItem(item);
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /bantamking|toasttab|getbento/i.test(String(url))) ??
    "https://www.bantamking.com/menus/";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "bantam-king-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Bantam King official menu ingredient review: direct terms and explicit allergen notes from the official menu item row were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "bantam-king-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Bantam King official menu text: ${rowText.trim()}`,
      },
    ],
  };
}

function normalizeBusboysOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const summary = String(item?.sourceSummary ?? "");
  const usableSummary =
    summary && !/^Reviewed /i.test(summary) && !/\b(?:source|evidence|row-boundary)\b/i.test(summary)
      ? summary
      : "";
  const text = `${name} ${description} ${ingredientsText} ${usableSummary}`.replace(
    /\b(?:Gluten Free Friendly|Vegetarian|Vegan|Possible Allerg(?:y|ies):?)\b/gi,
    " ",
  );
  const allergens = new Set(
    item?.allergenSourceType &&
      item.allergenSourceType !== "unavailable" &&
      item.allergenSourceType !== "official-ingredients"
      ? item.allergens ?? []
      : [],
  );
  const hasEvidenceText = description.trim().length > 0 || ingredientsText.trim().length > 0 || usableSummary.trim().length > 0;
  const originalText = `${name} ${description} ${ingredientsText} ${usableSummary}`;
  const glutenFree = /\b(?:gluten[-\s]+free|\bgff\b)\b/i.test(originalText);
  const vegan = /\bvegan\b/i.test(originalText);
  const mockAnimal = /\bvegan\s+["“']?(?:tuna|chicken|beef|egg|sausage|cheese|mayo|aioli|sour\s+cream)["”']?\b/i.test(originalText);

  if (!hasEvidenceText && allergens.size === 0 && !/\b(?:muffin|bread|cake|pie|pudding|toast|bagel)\b/i.test(name)) {
    return item;
  }

  if (/\b(?:mahi\s*mahi|salmon|catfish|tuna|lox)\b/i.test(text) && !mockAnimal) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|crab\s+cake|crab\s+grits|fritters)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (
    /\b(?:egg|eggs|omelette|benedict|hollandaise|aioli|mayo|mayonnaise|remoulade|pancakes?|french\s+toast|cake|muffin|bread\s+pudding|creme\s+brulee|cr[eè]me\s+br[uû]l[eé]e)\b/i.test(
      text,
    ) &&
    !mockAnimal
  ) {
    allergens.add("egg");
  }

  const dairyText = text
    .replace(/\bcoconut\s+(?:milk|cream|ice\s+cream)\b/gi, " ")
    .replace(/\bvegan\s+(?:cheese|sour\s+cream|mayo|aioli)\b/gi, " ");

  if (
    /\b(?:milk|steamed\s+milk|cheese|cheddar|cream\s+cheese|cream|creamy|butter|buttermilk|hollandaise|parmesan|gorgonzola|goat\s+cheese|feta|swiss|monterey\s+jack|burrata|provolone|blue\s+cheese|sour\s+cream|grits|risotto|whipped\s+cream|vanilla\s+ice\s+cream)\b/i.test(
      dairyText,
    ) &&
    !mockAnimal
  ) {
    allergens.add("milk");
  }

  if (/\b(?:almond|almonds|walnut|walnuts|pecan|pecans|nuts)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:peanut|peanuts)\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:sesame|tahini)\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (/\b(?:soy|tofu|tempeh|tamari|miso|soy\s+protein)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\b(?:dijon|mustard)\b/i.test(text)) {
    allergens.add("mustard");
  }

  if (
    !glutenFree &&
    /\b(?:bread|toast|whole[-\s]?wheat|multigrain|loaf|french\s+loaf|rustic\s+bread|ciabatta|bagel|pita|brioche|bun|croissant|tortilla|wrap|penne|pasta|garlic\s+bread|bread\s+crumbs?|croutons?|pancakes?|french\s+toast|muffin|cake|pie|pudding|cobbler|graham|fritters?|sandwich|panini)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (glutenFree) {
    allergens.delete("gluten");
    allergens.delete("wheat");
  }

  if (vegan || mockAnimal) {
    allergens.delete("egg");
    allergens.delete("milk");
    if (mockAnimal && !/\b(?:mahi\s*mahi|salmon|catfish|shrimp|crab)\b/i.test(text)) {
      allergens.delete("fish");
      allergens.delete("shellfish");
    }
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /busboysandpoets/i.test(String(url))) ??
    "https://www.busboysandpoets.com/menu/busboys-menu/";
  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.sourceKind !== "official-menu-ingredient-review" || entry?.source !== "busboys-official-menu-review",
  );

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? (usableSummary ? usableSummary : undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: item.allergenSourceType && item.allergenSourceType !== "unavailable"
      ? item.allergenSourceType
      : "official-ingredients",
    sourceSummary:
      item.sourceSummary && /^Reviewed official Busboys/i.test(item.sourceSummary)
        ? item.sourceSummary
        : "Reviewed Busboys and Poets official menu ingredient evidence: direct terms from the official menu item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "busboys-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Busboys and Poets official menu text: ${name}${description || usableSummary ? ` - ${description || usableSummary}` : ""}`,
      },
    ],
  };
}

function normalizeSushiTaroOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set();

  if (
    /\b(?:tuna|toro|maguro|salmon|sake\s+\d|yellowtail|amber\s+jack|kanpachi|shima[-\s]?aji|eel|unagi|anago|fish|sashimi|nigiri|bonito|dashi|roe|ikura|cod|mackerel|aji)\b/i.test(
      text,
    )
  ) {
    allergens.add("fish");
  }

  if (
    /\b(?:shrimp|prawn|ebi|crab|soft[-\s]?shell\s+crab|scallop|hotate|octopus|tako|cephalopod|crustaceans?|mollusks?)\b/i.test(
      text,
    )
  ) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|omelet|omelette|tamago|quail\s+egg|mayo|mayonnaise)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:cream|croquette)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:soy|soy\s+sauce|tofu|soy\s+bean|edamame|cha[-\s]?mame|miso|pon[-\s]?zu|ponzu|eel\s+sauce)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\b(?:gluten|flour|tempura|udon|soy\s+sauce|pon[-\s]?zu|ponzu|eel\s+sauce|miso\s+paste)\b/i.test(text)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\bsesame\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (allergens.size === 0) {
    return item;
  }

  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "amparo-fondita-official-menu-review",
  );

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /sushitaro|toasttab/i.test(String(url))) ??
    "https://www.sushitaro.com/menus/";
  const evidenceText = `Reviewed Sushi Taro official menu text: ${name}${description ? ` - ${description}` : ""}`;

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Sushi Taro menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "sushi-taro-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: evidenceText,
      },
    ],
  };
}

function normalizeNeutralGroundOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description} ${item?.ingredientsText ?? ""}`;
  const allergens = new Set(item?.allergenSourceType === "official-product-allergen-section" ? item.allergens ?? [] : []);

  if (/\b(?:tuna|white\s+fish|redfish|anchov(?:y|ies)|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|crawfish|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (
    /\b(?:cheddar|cheese|goat\s+cheese|burrata|blue\s+cheese|parmesan|labneh|butter|cream\s+cheese|creme\s+anglaise|ricotta|mousse)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:saltine\s+crackers?|bread\s+crumbs?|sourdough|toast|pasta|cake)\b/i.test(text)) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (/\b(?:aioli|cake)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:almond|hazelnut|pecan|praline|coconut)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\bsesame\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /neutralgroundbarandkitchen|toasttab/i.test(String(url))) ??
    "https://www.neutralgroundbarandkitchen.com/eat-drink";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Neutral Ground menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "neutral-ground-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Neutral Ground official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeChangChangOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(item?.allergenSourceType === "official-product-allergen-section" ? item.allergens ?? [] : []);

  if (/\b(?:shrimp|prawns?|scallops?|mussels?|squid|crab|oyster\s+sauce|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:branzino|flounder|fish|whitefish|salmon)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:soy|soy\s+sauce|tofu|soybean|soy\s+bean|broad\s*bean|broadbean|fermented\s+soybean|furu)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\bpeanuts?\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:cashew|coconut)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\bsesame\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (/\b(?:cream\s+cheese|ice\s+cream|gelato|white\s+chocolate|whipped\s+cream|mousse|chiffon)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:egg|egg\s+scramble|custard|curd|meringue|cake|cookies?)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:noodles?|lo\s*mein|chow\s*fun|wonton|dumplings?|spring\s+rolls?|pancakes?|battered|batter|cake|pie|graham\s+cracker|cookies?|crust|flour)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /changchangdc|toasttab/i.test(String(url))) ??
    "https://changchangdc.com/lunch-dinner";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Chang Chang menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "chang-chang-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Chang Chang official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeOmeteoOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(item?.allergenSourceType === "official-product-allergen-section" ? item.allergens ?? [] : []);

  if (/\b(?:at[úu]n|tuna|yellowfin|red\s+drum|hake|pescado|sea\s+bass|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|oysters?|lobster|octopus|seafood|scallops?|prawns?|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (
    /\b(?:queso|cotija|manchego|oaxaca|chihuahua|pepper\s+jack|jack\s+cheese|pimento\s+cheese|cheese|crema|lime\s+crema|labneh|ice\s+creams?|helados?|cheesecake|mascarpone|tres\s+leches|anglaise|milk)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:eggs?|sunny\s+side|mayo|mayonesa|aioli|flan|cheesecake|pancake|cake|shortcake|tres\s+leches|anglaise)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:flour\s+tortillas?|telera\s+bread|bread|saltines?|shortcake|cheesecake|pancake|cake|crumble|torta)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:pecans?|almendrado|almonds?|coconut)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\bsesame\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /ometeotexmex|toasttab/i.test(String(url))) ??
    "https://www.ometeotexmex.com/menu/dinner-texmex/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Ometeo menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "ometeo-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Ometeo official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeRiverClubOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set();

  if (/\b(?:branzino|rockfish|catch\s+of\s+the\s+day|caviar|tuna|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:crab|prawns?|shrimp|lobster|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (
    /\b(?:pecorino|labneh|burrata|butter|parmesan|parmigiano|parmiginano|parmegiano|manchego|mozzarella|tzatziki|creme\s+fraiche|cream|crema|ricotta|gelato|mascarpone|marscapone|cheese)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:aioli|mayo|eggs?|poached\s+eggs?|sunny\s+side|pancake|french\s+toast|cheesecake|tiramisu|lady\s+fingers?|cake)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:ciabatta|cavatelli|focaccia|challah|french\s+toast|pita(?:\s+chip)?|kataifi|pancake|pasta|tagliatelle|taglioni|gnocco|lady\s+fingers?|cake|cheesecake|croutons?)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:pistachio|hazelnuts?|coconut|nuts?)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:sesame|tahina|tahini)\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (/\bmiso\b/i.test(text)) {
    allergens.add("soy");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /riverclubdc/i.test(String(url))) ??
    "https://www.riverclubdc.com/menu/dinner/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "River Club menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "river-club-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed River Club official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function hasPeterChangNeighborBleedDescription(item) {
  const description = String(item?.description ?? "");

  if (!description || item?.sourceType !== "html-card") {
    return false;
  }

  return (
    /\b(?:Vegetable\s+Chow\s+Fun|Yangzhou\s+Seafood\s+Fried\s+Rice|Pan\s+Seared\s+Seafood\s+Noodle|TG\s+Sesame\s+Paste|TG\s+Red\s+Shrimp|TG\s+Garlic\s+Scapes)\b/i.test(
      description,
    ) || description.length > 220
  );
}

function normalizePeterChangOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const rawDescription = String(item?.description ?? "");
  const description = hasPeterChangNeighborBleedDescription(item) ? "" : rawDescription;
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(item?.allergenSourceType === "official-product-allergen-section" ? item.allergens ?? [] : []);

  if (/\b(?:fish|seafood|branzino|flounder|salmon)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|prawns?|scallops?|seafood|calamari|squid|shumai)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:custard|milk)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:egg|egg\s+yolk|egg\s+tofu|custard)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    /\b(?:lomein|lo\s+mein|dan\s+dan\s+noodles?|wonton|dumplings?|bao|buns?|spring\s+rolls?|pancakes?|egg\s+noodles?|shumai)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  const soyText = text.replace(/\begg\s+tofu\b/gi, "");

  if (/\b(?:tofu|soy|black\s+bean|bean\s+sauce|miso)\b/i.test(soyText)) {
    allergens.add("soy");
  }

  if (/\bpeanuts?\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\bwalnuts?\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\bsesame\b/i.test(text)) {
    allergens.add("sesame");
  }

  const cleanedBleed = rawDescription && description !== rawDescription;

  if (allergens.size === 0 && !cleanedBleed) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /peter-chang|toasttab/i.test(String(url))) ??
    "https://order.toasttab.com/online/peter-chang-mclean-6715-lowell-avenue-unit-a";

  return {
    ...item,
    description: cleanedBleed ? null : item.description,
    ingredientsText: item.ingredientsText ?? (cleanedBleed ? undefined : item.description) ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      allergens.size > 0
        ? item.allergenSourceType && item.allergenSourceType !== "unavailable"
          ? item.allergenSourceType
          : "official-ingredients"
        : item.allergenSourceType,
    sourceSummary:
      allergens.size > 0
        ? "Peter Chang menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix."
        : "Reviewed Peter Chang Toast extraction: neighboring item-list text was removed from this row description.",
    evidence:
      allergens.size > 0
        ? [
            ...(item.evidence ?? []),
            {
              source: "peter-chang-official-menu-review",
              sourceKind: "official-menu-ingredient-review",
              sourceUrl,
              text: `Reviewed Peter Chang official menu text: ${name}${description ? ` - ${description}` : ""}`,
            },
          ]
        : item.evidence,
  };
}

function normalizeBaanMaeOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  // Recompute this reviewed row from direct menu text. Carrying the previous
  // array forward made false positives impossible to remove (notably coconut
  // as tree nut and the name-only Mee Sua wheat/gluten inference).
  const allergens = new Set();

  if (/\b(?:catfish|fish\s+sauce|salmon|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:crab|shrimp|goong|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|egg\s+yolk|hard\s+boiled\s+egg)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:butter|milk|cream|cheese)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:soy|tofu)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\bpeanuts?\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:mixed\s+nuts?|pine\s+nuts?|cashews?|almonds?|walnuts?|pecans?|pistachios?|hazelnuts?)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /baanmaedc|toasttab/i.test(String(url))) ??
    "https://www.baanmaedc.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Baan Mae linked Toast menu review: direct terms and unavoidable food identities from the item name/description were mapped to app allergens. This is partial positive ingredient evidence, not a full allergen matrix, negative assurance, or cross-contact statement.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "baan-mae-official-menu-review",
        sourceKind: "restaurant-linked-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Baan Mae official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function hasRakuyaNeighborBleedDescription(item) {
  const description = `${item?.description ?? ""} ${item?.ingredientsText ?? ""}`;

  if (!description.trim()) {
    return false;
  }

  return (
    description.length > 180 ||
    /\b(?:All Sets Come with|All Set Comes with|All above bento boxes come with|Available at 11:30 am|MP\s+MP|Bottomless Mimosa|DELUXE BENTO BOX|OMU HAYASHI|SEOUL TRAIN|EGGIE (?:LOVER|ASSORTMENT)|CRUNCHY SPICY TORO|GRILLED RIBEYE|SPICY KOREAN BBQ)\b/i.test(
      description,
    )
  );
}

function normalizeRakuyaOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const rawDescription = String(item?.description ?? "");
  const hasBleedDescription = hasRakuyaNeighborBleedDescription(item);
  const description = hasBleedDescription ? "" : rawDescription;
  const ingredientsText = hasBleedDescription ? "" : String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set();

  const fishText = text.replace(/\bshell\s*fish\b/gi, "").replace(/\bshellfish\b/gi, "");

  if (
    /\b(?:cod|bonito|salmon|tuna|yellowtail|whitefish|sashimi|chirashi|eel|unagi|fish(?:cake| roe)?|roe|misozuke|miso\s+soup)\b/i.test(
      fishText,
    )
  ) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|scallop|crab|shumai|shell\s*fish|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|chawanmushi|custard|waffle)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:butter|waffle)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:tofu|bean\s+curd|soy|miso|teriyaki|eel\s+sauce)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\b(?:tempura|kara-age|karaage|katsu|waffle|yakisoba|ramen|udon|noodles?|breaded)\b/i.test(text)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0 && !rawDescription) {
    return item;
  }

  if (allergens.size === 0 && description === rawDescription) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /rakuyarestaurant|squarespace/i.test(String(url))) ??
    "https://www.rakuyarestaurant.com/menu";

  return {
    ...item,
    description: description === rawDescription ? item.description : null,
    ingredientsText:
      allergens.size > 0
        ? hasBleedDescription
          ? undefined
          : item.ingredientsText ?? (description === rawDescription ? item.description : undefined) ?? undefined
        : item.ingredientsText,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      allergens.size > 0
        ? item.allergenSourceType && item.allergenSourceType !== "unavailable"
          ? item.allergenSourceType
          : "official-ingredients"
        : item.allergenSourceType,
    sourceSummary:
      allergens.size > 0
        ? "Rakuya menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix."
        : "Reviewed Rakuya PDF extraction: neighboring menu text was removed from this row description.",
    evidence:
      allergens.size > 0
        ? [
            ...(item.evidence ?? []),
            {
              source: "rakuya-official-menu-review",
              sourceKind: "official-menu-ingredient-review",
              sourceUrl,
              text: `Reviewed Rakuya official menu text: ${name}${description ? ` - ${description}` : ""}`,
            },
          ]
        : item.evidence,
  };
}

function hasNorthsideSocialNeighborBleedDescription(item) {
  const text = `${item?.description ?? ""} ${item?.ingredientsText ?? ""}`;

  if (!text.trim()) {
    return false;
  }

  return (
    text.length > 260 ||
    /\b(?:House-Smoked Salmon & Poached Egg|Spinach,\s*Mushroom\s*&\s*Poached\s*Egg|Tea,\s*Chai\s*&\s*Matcha|Salads,\s*Bowls\s*&\s*More|Bake at Home Chocolate Chip Cookie Dough|Chocolate Pudding with Brownie Crumble|Apollo Blend|Northside Social Blend|Slow Motion|Even Keel)\b/i.test(
      text,
    )
  );
}

function normalizeNorthsideSocialOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const rawDescription = String(item?.description ?? "");
  const hasBleed = hasNorthsideSocialNeighborBleedDescription(item);
  const description = hasBleed ? "" : rawDescription;
  const ingredientsText = hasBleed ? "" : String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(item?.allergenSourceType === "official-ingredients" || item?.allergenSourceType === "official-product-allergen-section" ? item.allergens ?? [] : []);
  const noGluten = /\b(?:no\s+gluten|gluten\s+free|gluten-free|flourless)\b/i.test(text);
  const vegan = /\bvegan\b/i.test(text);
  const dairyText = text.replace(/\b(?:peanut|almond|cashew|sunflower|seed)\s+butter\b/gi, "");

  if (/\b(?:salmon|tuna|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (
    !vegan &&
    /\b(?:mozzarella|cheddar|gruy[eè]re|feta|parmesan|fontina|blue\s+cheese|burrata|ricotta|goat\s+cheese|cream\s+cheese|cottage\s+cheese|cheese|brie|camembert|manchego|shropshire\s+blue|yogurt|labneh|cr[eè]me\s+fra[iî]che|milk|butter|buttermilk|cream|ganache|white\s+chocolate|buttercream|latte|cappuccino|flat\s+white|macchiato|hot\s+chocolate|chai\s+latte|matcha\s+latte|tres\s+leches)\b/i.test(
      dairyText,
    )
  ) {
    allergens.add("milk");
  }

  if (!vegan && /\b(?:egg|eggs|poached\s+egg|farm\s+egg|quiche|aioli|mayo|caesar|custard|waffle|cake|cupcake|brownie|croissant|biscotti|bread\s+pudding|cinnamon\s+bun|cinnamon\s+roll)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    !noGluten &&
    /\b(?:bread|toast|crostini|focaccia|flatbread|baguette|pullman|9-grain|sourdough|biscuit|roll|bun|ipa\s+roll|marble\s+rye|croissant|crackers?|sesame\s+crackers?|panko|pretzel|pie|hand\s+pie|pizza|calzone|cake|cupcake|cookie|brownie|blondie|muffin|scone|biscotti|shortcake|coffee\s+cake|cinnamon\s+bun|cinnamon\s+roll|waffle|pot\s+pie|flour)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:almonds?|walnuts?|cashews?|hazelnuts?|pistachios?|pine\s+nuts?|nuts?|coconut|nutella)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:peanut|peanuts|peanut\s+butter)\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:sesame|tofu|soy)\b/i.test(text)) {
    if (/\bsesame\b/i.test(text)) {
      allergens.add("sesame");
    }
    if (/\b(?:tofu|soy)\b/i.test(text)) {
      allergens.add("soy");
    }
  }

  if (allergens.size === 0 && !hasBleed) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /northsidesocialva|toast\.site/i.test(String(url))) ??
    "https://www.northsidesocialva.com/arlington-menus/";

  return {
    ...item,
    description: hasBleed ? null : item.description,
    ingredientsText:
      allergens.size > 0 ? (hasBleed ? undefined : item.ingredientsText ?? item.description ?? undefined) : item.ingredientsText,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      allergens.size > 0
        ? item.allergenSourceType && item.allergenSourceType !== "unavailable"
          ? item.allergenSourceType
          : "official-ingredients"
        : item.allergenSourceType,
    sourceSummary:
      allergens.size > 0
        ? "Northside Social menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix."
        : "Reviewed Northside Social extraction: neighboring menu/catalog text was removed from this row description.",
    evidence:
      allergens.size > 0
        ? [
            ...(item.evidence ?? []),
            {
              source: "northside-social-official-menu-review",
              sourceKind: "official-menu-ingredient-review",
              sourceUrl,
              text: `Reviewed Northside Social official menu text: ${name}${description ? ` - ${description}` : ""}`,
            },
          ]
        : item.evidence,
  };
}

function normalizeHarthOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(item?.allergenSourceType === "official-ingredients" || item?.allergenSourceType === "official-product-allergen-section" ? item.allergens ?? [] : []);
  const vegan = /\bvegan\b/i.test(text);
  const dairyFree = /\bdairy[-\s]?free\b/i.test(text);
  const glutenFree = /\b(?:gluten[-\s]?free|gluten[-\s]?friendly)\b/i.test(text);

  if (/\b(?:salmon|cod|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:crab|shrimp|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (
    !vegan &&
    !dairyFree &&
    /\b(?:butter|cream|creme\s+fraiche|cr[eè]me\s+fra[iî]che|cheese|goat\s+cheese|gouda|mozzarella|provolone|cheddar|parmesan|brie|yogurt|hollandaise|ice\s+cream|mousse|custard|milk)\b/i.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (!vegan && /\b(?:egg|eggs|omelet|poached\s+egg|fried\s+egg|sunny-side-up|hollandaise|custard|pancakes?|cake|brownie|brioche|french\s+toast)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    !glutenFree &&
    /\b(?:toast|sourdough|english\s+muffin|muffin|biscuit|bread|breads|pastries|pancakes?|cornbread\s+croutons?|flatbread|brioche|pita|bagel|pot\s+pie|mac\s+&\s+cheese|mac\s+and\s+cheese|croissant|cake|brownie|streusel|wrap)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:almonds?|pecans?|coconut)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /hilton|harth|fixtures/i.test(String(url))) ??
    "data/fixtures/harth-tysons-official-hilton-menu.json";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Härth menu ingredient review: direct terms from the reviewed official menu image text were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "harth-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Härth official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function hasKizunaNeighborBleedDescription(item) {
  const text = `${item?.description ?? ""} ${item?.ingredientsText ?? ""}`;

  if (!text.trim()) {
    return false;
  }

  return (
    text.length > 260 ||
    /\b(?:Box\s+5:\s*Katsu|Special Tastings|Fast Lunch Donburi|Sushi Moriawase|KAEDAMA|KIZUNA[\s]+spicy|ROCK\S*\s+LOBSTER|Hanjuku|Kamaboko|Tamago Housemade|Flying Dragon|Everyday Rolls|All ramens topped with|All above bento|Side Sushi Rice|Wasabi Kizami|Broccoli Butter Garlic|choose any 2 or 3 rolls|Washington Post)\b/i.test(
      text,
    )
  );
}

function normalizeKizunaOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const rawDescription = String(item?.description ?? "");
  const hasBleed = hasKizunaNeighborBleedDescription(item);
  const description = hasBleed ? "" : rawDescription;
  const ingredientsText = hasBleed ? "" : String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(item?.allergenSourceType === "official-product-allergen-section" ? item.allergens ?? [] : []);
  const glutenFree = /\bgluten[-\s]?free\b/i.test(text);

  if (
    /\b(?:ahi|tuna|maguro|chutoro|o[-\s]?toro|salmon|hamachi|yellowtail|kanpachi|madai|sea\s*bream|monkfish|ankimo|cod|eel|unagi|fish|sashimi|nigiri|roe|tobiko|masago|mentaiko|bonito|mackerel|saba|arctic\s+char|ocean\s+trout|escolar)\b/i.test(
      text,
    )
  ) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|ebi|crab|kanikama|scallop|hotate|clam|hokkigai|lobster|octopus|tako|takoyaki|squid|ika|uni|sea\s+urchin|shellfish)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:egg|tamago|omelet|hanjuku|lava\s+egg|kewpie|mayo|mayonnaise|aioli|tartar\s+sauce)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:cream\s+cheese|cheese|butter)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:tofu|inari|soy|soy\s+sauce|miso|shoyu|teriyaki|eel\s+sauce|ponzu|edamame)\b/i.test(text)) {
    allergens.add("soy");
  }

  if (String(item?.id ?? "") === "kitsune-udon") {
    allergens.add("soy");
  }

  if (
    !glutenFree &&
    /\b(?:tempura|katsu|panko|batter|battered|kara[-\s]?age|gyoza|dumplings?|spring\s+rolls?|harumaki|bao|buns?|ramen|udon|noodles?|wavy\s+noodle|eel\s+sauce|teriyaki|soy\s+sauce)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\bsesame\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (allergens.size === 0 && !hasBleed) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /kizunatysons|toasttab/i.test(String(url))) ??
    "https://www.kizunatysons.com/menu/";

  return {
    ...item,
    description: hasBleed ? null : item.description,
    ingredientsText: allergens.size > 0 ? (hasBleed ? undefined : item.ingredientsText ?? item.description ?? undefined) : item.ingredientsText,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: allergens.size > 0 ? "official-ingredients" : item.allergenSourceType,
    sourceSummary:
      allergens.size > 0
        ? "Kizuna menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix."
        : "Reviewed Kizuna menu extraction: neighboring menu text was removed from this row description.",
    evidence:
      allergens.size > 0
        ? [
            ...(item.evidence ?? []),
            {
              source: "kizuna-official-menu-review",
              sourceKind: "official-menu-ingredient-review",
              sourceUrl,
              text: `Reviewed Kizuna official menu text: ${name}${description ? ` - ${description}` : ""}`,
            },
          ]
        : item.evidence,
  };
}

function normalizePhoHaiDuongOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set();

  if (/\b(?:fish\s+sauce|fish\s+balls?)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|squid|calamari|clams?|seafood)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\bbutter\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\btofu\b/i.test(text)) {
    allergens.add("soy");
  }

  if (/\bpeanut\s+sauce\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: item.mayContain ?? [],
      allergenSourceType: "unavailable",
      sourceSummary:
        item?.allergenSourceType && item.allergenSourceType !== "unavailable"
          ? "Reviewed Pho Hai Duong official image menu: previous broad allergen markings were removed because this row has no direct allergen evidence in the item text."
          : item.sourceSummary,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /phohaiduong|fixtures/i.test(String(url))) ??
    "data/fixtures/pho-hai-duong-tysons-official-image-menu.json";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Pho Hai Duong menu ingredient review: direct terms from the reviewed official image menu were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "pho-hai-duong-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Pho Hai Duong official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeMandNsPizzaOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(item?.allergenSourceType === "official-ingredients" ? item.allergens ?? [] : []);
  const vegan = /\bvegan\b/i.test(text);
  const noGluten = /\b(?:no\s+gluten|gluten[-\s]?free)\b/i.test(text);

  if (/\btuna\b/i.test(text)) {
    allergens.add("fish");
  }

  if (!vegan && /\b(?:cheese|mozzarella|provolone|american|cheddar|feta|asiago|parmesan|paneer|yogurt|lassi|tzatziki|butter|buttermilk|cream|creamy|milk|rasmalai|gulab\s+jamun|tiramisu)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (!vegan && /\b(?:egg|contains\s+egg|mayo|mayonnaise|caesar|cheesecake|cake|tiramisu|custard)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (
    !noGluten &&
    /\b(?:pizza|fried\s+pizza\s+dough|dough|bhatura|bread|white\s+flour|naan|pita|bun|(?:cheese)?burgers?|sub|sandwich|kaiser\s+roll|pasta|calzone|breadsticks?|breaded|nuggets?|tenders?|onion\s+rings?|poppers?|samosas?|fried\s+pastries|cheesecake|cake|tiramisu|pillows?)\b/i.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:almonds?|pistachios?|nutella|nuts?)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\btofu\b/i.test(text)) {
    allergens.add("soy");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /mandns|slicelife/i.test(String(url))) ??
    "https://mandns.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "M&N's Pizza menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "mandns-pizza-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed M&N's Pizza official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeMedinaOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const ingredientsText = String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set(item?.allergenSourceType === "official-ingredients" ? item.allergens ?? [] : []);

  if (/\b(?:tuna|tinned\s+fish|branzino|fish)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\bshrimp\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:gruyere|gruy[eè]re|cheese|yogurt|labne|labneh|kefir|butter)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:egg|l['’]?oeuf|oeuf)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:semolina|couscous|brik)\b/i.test(text)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:sesame|tahina|tahini)\b/i.test(text)) {
    allergens.add("sesame");
  }

  if (/\bpeanut\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\b(?:almonds?|hazelnuts?|pistachios?)\b/i.test(text)) {
    allergens.add("tree-nut");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /medinadc|squarespace/i.test(String(url))) ??
    "https://www.medinadc.com/menu/food/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Medina menu ingredient review: direct terms from the item name/description were mapped to app allergens. This is partial official ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "medina-official-menu-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Medina official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function hasHuTieuMiLacayBleedDescription(item) {
  const id = String(item?.id ?? "");

  return /^(?:concentrated-vietnamese-coffee-with-condensed-milk-i-am-very-rich-in-flavor|goat-curry-with-vietnamese-baguette|roasted-duck-slow-cooked-in-herbal-soup-broth|small-wonton-soup-bowl-with-sliced-pork-wonton-contains-pork-and-shrimp|stir-fried-beef-tenderloin-cubes-with-white-rice-and-fries)$/i.test(
    id,
  );
}

function normalizeHuTieuMiLacayOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const hasBleed = hasHuTieuMiLacayBleedDescription(item);
  const description = hasBleed ? "" : String(item?.description ?? "");
  const ingredientsText = hasBleed ? "" : String(item?.ingredientsText ?? "");
  const text = `${name} ${description} ${ingredientsText}`;
  const allergens = new Set();

  if (/\b(?:fish\s+sauce|fish\s+balls?)\b/i.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|shrimps|calamari|imitation\s+crab|crab|seafood|wonton\s+contains\s+pork\s*&\s*shrimp)\b/i.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:condensed\s+milk|milk)\b/i.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:egg\s+noodles?|egg\s+rolls?|fried\s+egg)\b/i.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:egg\s+noodles?|wonton|banh\s+mi|baguette|crispy\s+egg\s+rolls?|egg\s+rolls?)\b/i.test(text)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\bpeanuts?\b/i.test(text)) {
    allergens.add("peanut");
  }

  if (/\btofu\b/i.test(text)) {
    allergens.add("soy");
  }

  if (allergens.size === 0 && !hasBleed) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /mi-lacay|nearby-res|grubhub|edencenter/i.test(String(url))) ??
    "https://mi-lacay-eden.nearby-res.com/menu";

  return {
    ...item,
    description: hasBleed ? null : item.description,
    ingredientsText: allergens.size > 0 ? (hasBleed ? undefined : item.ingredientsText ?? item.description ?? undefined) : item.ingredientsText,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType: allergens.size > 0 ? "official-ingredients" : item.allergenSourceType,
    sourceSummary:
      allergens.size > 0
        ? "Hu Tieu Mi Lacay menu ingredient review: direct terms from the menu item text were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix."
        : "Reviewed Hu Tieu Mi Lacay extraction: neighboring menu text was removed from this row description.",
    evidence:
      allergens.size > 0
        ? [
            ...(item.evidence ?? []),
            {
              source: "hu-tieu-mi-lacay-menu-review",
              sourceKind: "menu-ingredient-review",
              sourceUrl,
              text: `Reviewed Hu Tieu Mi Lacay menu text: ${name}${description ? ` - ${description}` : ""}`,
            },
          ]
        : item.evidence,
  };
}

function normalizeRareBirdOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set();
  const mayContain = new Set(item?.mayContain ?? []);
  const glutenFree = /\bgluten[-\s]?free\b/.test(lower);
  const vegan = /\bvegan\b/.test(lower);

  const addWheat = () => {
    if (!glutenFree) {
      allergens.add("gluten");
      allergens.add("wheat");
    }
  };

  if (
    /\b(?:croissant|pastr(?:y|ies)|biscuit|sandwich|toast|hand\s+pie|bun|roll|brioche|pain\s+de\s+mie|cookie|bread|muffin|kouign[-\s]?amann|scone|tart|cake|shortbread)\b/.test(
      lower,
    )
  ) {
    addWheat();
  }

  if (/\b(?:buttermilk|buttery|butter|milk|cheese|havarti|brie|feta|mascarpone|latte|cappuccino|café\s+au\s+lait|cafe\s+au\s+lait|steamed\s+milk|hot\s+chocolate|chocolate\s+milk|chocolate\s+ganache|milk\s+chocolate)\b/.test(lower)) {
    if (!vegan) {
      allergens.add("milk");
    }
  }

  if (/\b(?:egg|eggs|brioche)\b/.test(lower)) {
    if (!vegan) {
      allergens.add("egg");
    }
  }

  if (
    /\b(?:almond|almonds|frangipane|pecan|pecans|walnut|walnuts|nuts)\b/.test(lower) &&
    !/\bnut[-\s]?free\b/.test(lower) &&
    !/\bmay\s+contain\s+nuts\b/.test(lower)
  ) {
    allergens.add("tree-nut");
  }

  if (/\bpeanut(?:s)?\b/.test(lower)) {
    allergens.add("peanut");
  }

  if (/\bmay\s+contain\s+nuts\b/.test(lower)) {
    mayContain.add("tree-nut");
  }

  if (allergens.size === 0 && mayContain.size === (item?.mayContain ?? []).length) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /rarebirdcoffee|square\.site|singleplatform/i.test(String(url))) ??
    "https://rarebirdcoffeepickup.square.site/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: Array.from(mayContain).sort(),
    allergenSourceType: allergens.size > 0 ? "official-ingredients" : item.allergenSourceType,
    sourceSummary:
      allergens.size > 0
        ? "Rare Bird official menu ingredient review: direct menu terms and unmistakable bakery/cafe item forms were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix."
        : item.sourceSummary,
    evidence:
      allergens.size > 0
        ? [
            ...(item.evidence ?? []),
            {
              source: "rare-bird-official-menu-review",
              sourceKind: "menu-ingredient-review",
              sourceUrl,
              text: `Reviewed Rare Bird official menu text: ${name}${description ? ` - ${description}` : ""}`,
            },
          ]
        : item.evidence,
  };
}

function normalizeElPolloRicoOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const originalDescription = String(item?.description ?? "");
  let description = item?.description;

  const cleanDescriptions = new Map([
    ["carvel-ice-cream", "8oz cup of Carvel soft-serve ice cream."],
    ["firenzes-artisanal-gelato", "6oz individual cup of Firenzes Artisanal Gelato."],
    ["medium-green-sauce-cup", "8oz cup of our green sauce."],
    ["medium-yellow-sauce-cup", "8oz cup of our yellow sauce."],
    ["party-size-coleslaw", "Party-Size Coleslaw, 32 oz (feeds 7-10)."],
    ["party-size-red-beans", "Party-size container of beans."],
    ["french-fries-large-pan", "Large pan of French fries (feeds 15-20)."],
    ["french-fries-small-pan", "Small pan of French fries (feeds 7-10)."],
    ["white-rice-large-pan", "Large pan of white rice (feeds 15-20)."],
    ["white-rice-small-pan", "Small pan of white rice (feeds 7-10)."],
    ["whole-chicken-dark-meat-only", "Whole chicken, dark meat only. Includes 2 regular sides and 4 sauces."],
    ["12-chicken-white-meat-only", "One half of chicken, white meat only. Includes 2 sides and 2 sauces."],
  ]);

  if (cleanDescriptions.has(id)) {
    description = cleanDescriptions.get(id);
  }

  const text = `${name} ${description ?? ""}`;
  const lower = text.toLowerCase();
  const allergens = new Set(id === "flan" ? [] : item?.allergens ?? []);

  if (/\b(?:turnover|empanada|alfajor|shortbread|cookie|cake|tres\s+leches)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:egg|eggs|flan|tres\s+leches|cake|alfajor)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:ice\s+cream|gelato|flan|tres\s+leches|caramel|shortbread|alfajor|cake)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (/\bwalnuts?\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  const changedDescription = description !== item?.description;

  if (allergens.size === 0 && !changedDescription) {
    return item;
  }

  const existingEvidence = (item.evidence ?? []).filter(
    (entry) =>
      entry?.source !== "el-pollo-rico-official-menu-review" &&
      !/neighboring rum cake walnut boundary bleed/i.test(String(entry?.text ?? "")),
  );

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /elpollorico|heartland|mobilebytes|toasttab/i.test(String(url))) ??
    "https://elpollorico.com/order/";

  return {
    ...item,
    description,
    ingredientsText:
      allergens.size > 0
        ? changedDescription || /^oz\b/i.test(String(item.ingredientsText ?? "").trim())
          ? description ?? item.description ?? undefined
          : item.ingredientsText ?? description ?? item.description ?? undefined
        : changedDescription
          ? null
          : item.ingredientsText,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      allergens.size > 0
        ? item.allergenSourceType && item.allergenSourceType !== "unavailable"
          ? item.allergenSourceType
          : "official-ingredients"
        : item.allergenSourceType,
    sourceSummary:
      allergens.size > 0
        ? "El Pollo Rico official menu ingredient review: direct menu terms and unmistakable dessert/pastry forms were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix."
        : "Reviewed El Pollo Rico menu extraction: neighboring catering/menu text was removed from this row description.",
    evidence:
      allergens.size > 0
        ? [
            ...existingEvidence,
            {
              source: "el-pollo-rico-official-menu-review",
              sourceKind: "menu-ingredient-review",
              sourceUrl,
              text: `Reviewed El Pollo Rico official menu text: ${name}${originalDescription ? ` - ${originalDescription}` : ""}`,
            },
          ]
        : existingEvidence,
  };
}

function normalizeGenkiIzakayaOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set();

  if (
    /\b(?:salmon|tuna|yellowtail|hamachi|toro|eel|unagi|mackerel|saba|snapper|flounder|amberjack|kanpachi|monkfish|fish|bonito|tobiko|ikura|masago|roe|sashimi|nigiri|chirashi|saba|maguro|chutoro|otoro)\b/.test(
      lower,
    )
  ) {
    allergens.add("fish");
  }

  if (
    /\b(?:shrimp|ebi|crab|crabmeat|scallop|hotate|clam|oyster|squid|ika|octopus|tako|lobster|shellfish|sea\s+urchin|uni)\b/.test(
      lower,
    )
  ) {
    allergens.add("shellfish");
  }

  if (/\b(?:tempura|panko|ramen|udon|yakisoba|gyoza|dumpling|katsu|tonkatsu|karaage|bao|bun|toast|burger|crepe|cake|taiyaki|takoyaki|okonomiyaki|cracker|crackers)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:soy|tofu|edamame|miso|ponzu|eel\s+sauce|teriyaki|inari)\b/.test(lower)) {
    allergens.add("soy");
  }

  if (/\b(?:soy\s+sauce|ponzu|eel\s+sauce)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:egg|tamago|omelet|omelette|mayo|mayonnaise|spicy\s+mayo|crepe|cake)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\bsesame\b/.test(lower)) {
    allergens.add("sesame");
  }

  if (/\b(?:cream\s+cheese|cheese|grated\s+cheese|crepe|cake)\b/.test(lower)) {
    allergens.add("milk");
  }

  const existingReviewEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "genki-izakaya-official-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary: undefined,
      evidence: existingReviewEvidence,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /genkiizakaya|postmates|grubhub/i.test(String(url))) ??
    "https://www.genkiizakaya.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Genki Izakaya official menu ingredient review: direct fish, shellfish, tempura/noodle/bun/baked, soy, egg, dairy, and sauce terms from official menu rows were mapped to app allergens. Generic raw-fish allergy warning text was not used as a direct allergen source for unrelated allergens.",
    evidence: [
      ...existingReviewEvidence,
      {
        source: "genki-izakaya-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Genki Izakaya official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeDogwoodTavernOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const sourceSummary = String(item?.sourceSummary ?? "");
  const sourceText =
    sourceSummary &&
    !/Reviewed official row-level allergen evidence|Dogwood Tavern official menu ingredient review/i.test(
      sourceSummary,
    )
      ? sourceSummary
      : "";
  const evidenceText = (item.evidence ?? [])
    .map((entry) => String(entry?.text ?? ""))
    .filter((text) => text && !/^\s*Dogwood Tavern\s*$/i.test(text) && !/Reviewed Dogwood Tavern official menu text/i.test(text))
    .join(" ");
  const directText = `${name} ${description} ${sourceText} ${evidenceText}`
    .replace(/\bAdd(?:\s+ons?)?:[\s\S]*$/i, "")
    .replace(/\bAdd\s+(?:grilled|blackened)?[\s\S]*$/i, "")
    .replace(/\bSub\s+[\s\S]*$/i, "");
  const lower = directText.toLowerCase();
  const allergens = new Set();

  if (
    /\b(?:bread|toast|toasted|roll|potato\s+roll|pita|flour\s+tortillas?|wrap|baguette|po\s*boy|sandwich|burger|bun|pasta|cavatappi|mac\s*(?:&|and)\s*cheese|quesadilla|chicken\s+fingers|fried\s+chicken|calamari|fried\s+oyster|tempura|spring\s+rolls?|brownie|cheesecake|creme\s+brulee|crème\s+brûlée)\b/.test(
      lower,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (
    /\b(?:cheese|blue\s+cheese|cheddar|jack|monterrey\s+jack|swiss|american|pimento\s+cheese|sour\s+cream|tzatziki|ranch|buttermilk|butter|cream|mousse|sundae|cheesecake|creme\s+brulee|crème\s+brûlée|parmesan|grated\s+cheese|pesto)\b/.test(
      lower,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:egg|hard\s+boiled\s+egg|mayo|mayonnaise|remoulade|special\s+sauce|brownie|cheesecake|creme\s+brulee|crème\s+brûlée)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:salmon|mahi|tuna|fish)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|oyster|oysters|calamari)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:pecan|pecans)\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  if (/\bpesto\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:tahini|sesame)\b/.test(lower)) {
    allergens.add("sesame");
  }

  const existingReviewEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "dogwood-tavern-official-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary: undefined,
      evidence: existingReviewEvidence,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /dogwoodtavern|popmenu/i.test(String(url))) ??
    "https://www.dogwoodtavern.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || sourceText || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Dogwood Tavern official menu ingredient review: direct bread, roll, tortilla, pasta, dairy, egg, fish, shellfish, pecan, sesame, and sauce terms from official Popmenu rows were mapped to app allergens. Optional add-on text was not used as base-item allergen evidence.",
    evidence: [
      ...existingReviewEvidence,
      {
        source: "dogwood-tavern-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Dogwood Tavern official menu text: ${name}${description ? ` - ${description}` : sourceText ? ` - ${sourceText}` : ""}`,
      },
    ],
  };
}

function normalizeHelloBettyOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");

  if (id === "coffee-or-tea") {
    return {
      ...item,
      description: undefined,
      ingredientsText: null,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary: undefined,
      evidence: (item.evidence ?? []).filter((entry) => entry?.source !== "hello-betty-official-menu-review"),
    };
  }

  const rawDescription = String(item?.description ?? "");
  const evidenceText = (item.evidence ?? [])
    .map((entry) => String(entry?.text ?? ""))
    .filter((text) => text && text !== "None" && !/Reviewed Hello Betty official menu text/i.test(text))
    .join(" ");
  const sourceSummary = String(item?.sourceSummary ?? "");
  const sourceText = /Hello Betty official menu ingredient review/i.test(sourceSummary) ? "" : sourceSummary;
  const fullText = `${name} ${rawDescription} ${evidenceText} ${sourceText}`
    .replace(/©\s*20\d{2}[\s\S]*$/i, "")
    .replace(/\*Consuming raw or undercooked[\s\S]*$/i, "")
    .replace(/\bAdd\s+[\s\S]*$/i, "");
  const lower = fullText.toLowerCase();
  const allergens = new Set();
  const cleanDescriptions = new Map([
    ["coffee-or-tea", undefined],
    ["vanilla-gelato", undefined],
  ]);
  const description = cleanDescriptions.has(id) ? cleanDescriptions.get(id) : item.description;

  if (
    /\b(?:bread|challah|sourdough|flatbread|baguette|linguine|pasta|waffle\s+crisp|crumble|chicken\s+tenders|crispy\s+chicken|sandwich|potato\s+roll|toast)\b/.test(
      lower,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (
    /\b(?:cream|parmesan|mascarpone|cr[eè]me|crème|crema|gelato|cheese|havarti|beurre\s+blanc|butter|chantilly)\b/.test(
      lower,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:egg|eggs|poached\s+egg|omelet|aioli|mayo|mayonnaise|cr[eè]me\s+br[uû]l[eé]e|crème\s+brûlée|cheesecake)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:crab|softshell\s+crab|oyster|oysters|clams?|shrimp)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:salmon|trout|fish|smoked\s+trout|catch\s+of\s+the\s+day|tuna)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:pistachio|hazelnut|nuts?)\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  const existingReviewEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "hello-betty-official-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      description,
      ingredientsText: description === undefined ? null : item.ingredientsText,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary: undefined,
      evidence: existingReviewEvidence,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /hellobettybethesda/i.test(String(url))) ??
    "https://www.hellobettybethesda.com/menus/";

  return {
    ...item,
    description,
    ingredientsText: item.ingredientsText ?? (description || rawDescription || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Hello Betty official menu ingredient review: direct seafood, bread/pasta, dairy, egg/aioli, and tree-nut terms from official menu rows were mapped to app allergens. Legal/footer text and optional add-on text were not used as base-item allergen evidence.",
    evidence: [
      ...existingReviewEvidence,
      {
        source: "hello-betty-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Hello Betty official menu text: ${name}${rawDescription ? ` - ${rawDescription}` : ""}`,
      },
    ],
  };
}

function normalizeHeidelbergOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const sourceSummary = String(item?.sourceSummary ?? "");
  const evidenceText = (item.evidence ?? [])
    .map((entry) => String(entry?.text ?? ""))
    .filter((text) => text && !/^(?:Select options|Quick View|Description)$/i.test(text.trim()))
    .join(" ");
  const rawText = `${name} ${description} ${sourceSummary} ${evidenceText}`;
  const text = rawText
    .replace(/\*?Cream cheese and butter are available by the pound\.?/gi, "")
    .replace(/\bSelect options\b/gi, "")
    .replace(/\bQuick View\b/gi, "")
    .replace(/\bPrices subject to change without notice\b[\s\S]*$/i, "");
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);
  const mayContain = new Set(item?.mayContain ?? []);

  if (
    /\b(?:cake|cakes|brownie|brownies|cookie|cookies|croissant|croissants|danish|donuts?|berliner|buns?|bagels?|bread|breads?|loaf|rolls?|sandwich(?:es)?|toast|pastr(?:y|ies)|puff\s+pastry|pie\s+crust|strudel|torte|tart|napoleon|petit\s+four|cupcake|cupcakes|coffeecake|coffee\s+cake|poundcake|sheetcake|turnovers?|hamentashen|hamantaschen)\b/.test(
      lower,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (
    /\b(?:butter|buttercream|buttercrumb|milk|cream|cream\s+cheese|cheese|muenster|swiss|brie|cheddar|custard|bavarian|mousse|chocolate|fondant|truffle|ganache|dip)\b/.test(
      lower,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:egg|eggs|mayonnaise|mayo|custard|cake|brownie|cookie|croissant|danish|pastr(?:y|ies)|donuts?|omelet)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:tuna)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:almond|almonds|hazelnut|marzipan|pecan|pecans|walnut|walnuts)\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  if (/\b(?:sesame)\b/.test(lower)) {
    allergens.add("sesame");
  }

  if (/\bmay contain nuts?\b/i.test(rawText)) {
    allergens.delete("tree-nut");
    mayContain.add("tree-nut");
  } else if (/\bcontains nuts?\b/i.test(rawText)) {
    mayContain.delete("tree-nut");
    allergens.add("tree-nut");
  }

  const existingReviewEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "heidelberg-official-menu-review",
  );

  if (allergens.size === 0 && mayContain.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary: undefined,
      evidence: existingReviewEvidence,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /heidelbergbakery/i.test(String(url))) ??
    "https://heidelbergbakery.com/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || sourceSummary || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: Array.from(mayContain).sort(),
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Heidelberg official menu ingredient review: direct bakery, bread, sandwich, dairy, egg, fish, sesame, and tree-nut terms from official product/menu rows were mapped to app allergens. Explicit 'may contain nuts' wording remains cross-contact.",
    evidence: [
      ...existingReviewEvidence,
      {
        source: "heidelberg-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Heidelberg official menu text: ${name}${description ? ` - ${description}` : sourceSummary ? ` - ${sourceSummary}` : ""}`,
      },
    ],
  };
}

function normalizeMoesSouthwestOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const evidenceText = (item.evidence ?? [])
    .map((entry) => String(entry?.text ?? ""))
    .filter((text) => text && text !== "None" && !/Reviewed Moe's Southwest Grill official menu text/i.test(text))
    .join(" ");
  const rawText = `${name} ${description} ${evidenceText}`;
  const text = rawText
    .replace(/\boz\s+of\s+refreshing\s+bliss\b\.?/gi, "")
    .replace(/\bto\s+amp\s+you\s+up\b\.?/gi, "")
    .replace(/\bNice\s+cold\s+H2O\b\.?/gi, "");
  const lower = text.toLowerCase();
  const allergens = new Set();

  const explicitFlourTortilla =
    /\b(?:flour\s+tortillas?|soft\s+flour\s+tortillas?|8"\s*flour\s+tortilla|grilled\s+tortilla)\b/.test(lower);
  const burritoLike =
    /\b(?:burrito|mini\s+burritos?|burrito\s+dippers?|grilled\s+burrito\s+dippers?)\b/.test(lower);
  const quesadillaLike = /\bquesadillas?\b/.test(lower);
  const softShellOnly = /\bsoft\s+shells?\b/.test(lower);

  if (
    explicitFlourTortilla ||
    burritoLike ||
    quesadillaLike ||
    softShellOnly ||
    /\b(?:cookie|pretzel\s+crunch)\b/.test(lower)
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (
    /\b(?:queso|cheese|oaxaca|shredded\s+cheese|sour\s+cream|ranch|chipotle\s+ranch|milk|brown\s+butter|chocolate)\b/.test(
      lower,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:cookie|brown\s+butter\s+cookie)\b/.test(lower)) {
    allergens.add("egg");
  }

  // Moe's taco rows can be hard or soft shell. Keep ambiguous build-your-own taco rows
  // unavailable unless the official row explicitly says soft shell or includes dairy.
  if (/^kids-taco$/i.test(id)) {
    allergens.delete("gluten");
    allergens.delete("wheat");
    if (/\bcookie\b/.test(lower)) {
      allergens.add("egg");
      allergens.add("gluten");
      allergens.add("milk");
      allergens.add("wheat");
    }
  }

  const existingReviewEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "moes-southwest-official-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      sourceSummary: undefined,
      evidence: existingReviewEvidence,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /moes\.com\/menu|moes\.com\/nutrition|nutritionix/i.test(String(url))) ??
    "https://www.moes.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? (description || undefined),
    allergens: Array.from(allergens).sort(),
    mayContain: [],
    allergenSourceType: "official-ingredients",
    sourceSummary:
      "Moe's Southwest Grill official menu ingredient review: direct flour tortilla, burrito, quesadilla, queso, cheese, sour cream, ranch, milk, cookie, and pretzel-crunch terms from official menu rows were mapped to app allergens. Ambiguous build-your-own hard-or-soft taco rows were kept conservative unless the row explicitly included soft shell or dairy.",
    evidence: [
      ...existingReviewEvidence,
      {
        source: "moes-southwest-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Moe's Southwest Grill official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeDogonOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:snapper|branzino|tuna|blue\s+fin|bonito|fish)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:mussel|mussels|crab|oyster|oysters|shrimp)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:butter|parm|parmesan|cream|pastry\s+cream|cheesecake|anglaise)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (/\b(?:roti|patties|cheesecake|bread|coco\s+bread)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:pastry\s+cream|cheesecake|aioli)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:almond|almonds)\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  if (allergens.size === 0) {
    return item;
  }

  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "amparo-fondita-official-menu-review",
  );

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /salamanderdc|dogon/i.test(String(url))) ??
    "https://www.salamanderdc.com/dining/dogon/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Dōgon official menu ingredient review: direct terms from the official menu item name/description were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "dogon-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Dōgon official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeArrelsOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:tuna)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|camarones|squid|cuttlefish)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:aioli)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:goat\s+milk|ice\s+cream|cremeux)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (/\b(?:lavash|fideua)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /arrels|ramw|arlohotels/i.test(String(url))) ??
    "data/fixtures/arrels-dc-reviewed-ramw-menu.json";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Arrels public menu ingredient review: direct ingredient terms from reviewed Arrels/RAMW menu evidence were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "arrels-public-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Arrels menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeChaoBanOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const category = String(item?.category ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${category} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:catfish|fish\s+sauce|nuoc\s+cham)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:mayo|aioli|fried\s+egg)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:banh\s+mi|baguette|dumplings?|spring\s+rolls?|battered|tempura)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:peanut|peanuts)\b/.test(lower)) {
    allergens.add("peanut");
  }

  if (/\b(?:pecan|pecans)\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /eatchaoban/i.test(String(url))) ?? "https://www.eatchaoban.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Chao Ban official menu ingredient review: direct terms from the official menu item name/category/description were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "chao-ban-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Chao Ban official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeAmparoFonditaOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:shrimp)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:halibut)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:crema|tres\s+leches|chantilly|frosting)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (/\b(?:sesame)\b/.test(lower)) {
    allergens.add("sesame");
  }

  if (/\b(?:sponge\s+cake|cake|tres\s+leches)\b/.test(lower)) {
    allergens.add("egg");
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const existingEvidence = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "amparo-fondita-official-menu-review",
  );

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /amparofondita/i.test(String(url))) ??
    "https://amparofondita.com/dinner-menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Amparo Fondita official menu ingredient review: direct ingredient terms from reviewed official image-menu evidence were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...existingEvidence,
      {
        source: "amparo-fondita-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Amparo Fondita official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeXiquetOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:caviar)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:lobster|llagosta|crab|scallop|uni|mussels|musclos)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:aioli)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:fritter|bocata)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /xiquet|xiquetdl/i.test(String(url))) ??
    "https://www.xiquetdl.com/menus";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Xiquet menu ingredient review: direct seafood and preparation terms from public menu evidence were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "xiquet-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Xiquet menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeProvidenciaOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);
  const glutenFree = /\bgluten[-\s]?free\b/.test(lower);

  if (/\b(?:crab)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:cream|milk\s+bread|camembert|cheese|gruyere)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (!glutenFree && /\b(?:maria\s+cookie|cookie|milk\s+bread|toast\s+points)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /barprovidenciadc|providencia/i.test(String(url))) ??
    "data/fixtures/providencia-official-image-menu.json";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Providencia official image-menu ingredient review: direct ingredient terms were mapped to app allergens while respecting vegan/gluten-free menu markers. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "providencia-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Providencia official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeAztecaOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:white\s+fish|fish)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|mussels|calamari)\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:flour\s+tortilla)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:cheese|sour\s+cream)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /aztecarestaurantcantinamd/i.test(String(url))) ??
    "https://aztecarestaurantcantinamd.com/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Azteca menu ingredient review: direct ingredient terms from public menu card evidence were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "azteca-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Azteca menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizePrimroseOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\bscallops?\b/.test(lower)) {
    allergens.add("shellfish");
  }

  if (/\b(?:green\s+goddess|dijonnaise)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\bgruyere\b/.test(lower)) {
    allergens.add("milk");
  }

  if (id === "smash-burger" || /\bsmash\s+burger\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /primrose|canva/i.test(String(url))) ??
    "data/fixtures/primrose-dc-reviewed-canva-menu.json";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Primrose reviewed menu ingredient review: direct menu terms from reviewed Canva/menu evidence were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "primrose-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Primrose menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeMarvsDogsOfficialMenuIngredients(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:cookie|cones?)\b/.test(lower) || /(?:dog|hot\s*dog|party-pack|marvs-favorite-dog)/i.test(id)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:soft\s+serv|vanilla|cookie)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (/\bcookie\b/.test(lower)) {
    allergens.add("egg");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /marvsdogsdc/i.test(String(url))) ?? "https://marvsdogsdc.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Marv's Dogs menu ingredient review: direct dessert, cone, cookie, and hot-dog menu terms were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "marvs-dogs-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Marv's Dogs menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeBumblebirdsOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const category = String(item?.category ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${category} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:biscuit|sandwich(?:es)?|donuts?|crackers?|fried\s+chicken|chicken\s+tenders)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:mayo|ranch|donuts?|fried\s+chicken|chicken\s+tenders)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:butter|havarti|cheese|pimento\s+cheese|chocolate\s+sauce|donuts?)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /bumblebirdsdc/i.test(String(url))) ?? "https://www.bumblebirdsdc.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Bumblebirds official menu ingredient review: direct biscuit, sandwich, dairy, fried chicken, mayo, and dessert terms were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "bumblebirds-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Bumblebirds official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeFossetteOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const category = String(item?.category ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${category} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\bsandwich(?:es)?\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:mozzarella|provolone|swiss\s+cheese|stracciatella|feta|cheese|parmesan)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (/\b(?:aioli)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:sesame)\b/.test(lower)) {
    allergens.add("sesame");
  }

  if (/\b(?:pistachio)\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /fossette|toasttab/i.test(String(url))) ??
    "https://order.toasttab.com/online/fossette-focacceria-union-market-1309-5th-st-ne-washington-dc-20002";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Fossette Focacceria official Toast menu ingredient review: sandwich bread and direct cheese, aioli, sesame, and pistachio terms were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "fossette-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Fossette official Toast menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeJuliiOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:cod|salmon)\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:burrata|ice\s+cream|cremeux|creme\s+brulee|cr[eè]me\s+brul[eé]e|feta|buttermilk|blue\s+cheese|gelato|ganache)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (/\b(?:egg|creme\s+brulee|cr[eè]me\s+brul[eé]e|pate\s+choux|profiteroles)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:chocolate\s+crumble|pate\s+choux|profiteroles)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:pistachio|almonds?)\b/.test(lower)) {
    allergens.add("tree-nut");
  }

  if (/\btahini\b/.test(lower)) {
    allergens.add("sesame");
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /julii/i.test(String(url))) ?? "https://www.julii.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Julii menu ingredient review: direct fish, dairy, egg, wheat, sesame, and tree-nut terms from public Julii menu evidence were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "julii-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Julii menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeGreenhouseOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  const lower = text.toLowerCase();
  const allergens = new Set();
  const mayContain = new Set(item?.mayContain ?? []);

  if (/\bsalmon\b/.test(lower)) {
    allergens.add("fish");
  }

  if (/\b(?:egg|eggs|benedict|omelet|omelet|french\s+toast|pancakes?|waffles?|hollandaise)\b/.test(lower)) {
    allergens.add("egg");
  }

  if (/\b(?:ricotta|cream\s+cheese|whipped\s+cream|yogurt|milk\s+yogurt|greek\s+yogurt|hollandaise|feta|cheese)\b/.test(lower)) {
    allergens.add("milk");
  }

  if (/\b(?:bread|bagel|pancakes?|waffles?|brioche|english\s+muffin|toast)\b/.test(lower)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\bsesame\b/.test(lower)) {
    if (/\bchoice\s+of\s+bagel\b/.test(lower)) {
      mayContain.add("sesame");
    } else {
      allergens.add("sesame");
    }
  }

  if (allergens.size === 0) {
    return item;
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /jeffersondc|greenhouse/i.test(String(url))) ??
    "https://www.jeffersondc.com/dining/the-greenhouse/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: Array.from(mayContain).sort(),
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "The Greenhouse official menu ingredient review: direct breakfast menu terms from the hotel dining page were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...(item.evidence ?? []),
      {
        source: "greenhouse-official-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed The Greenhouse official menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeLighthouseTofuOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const category = String(item?.category ?? "");
  const description = String(item?.description ?? "");
  const nameAndDescription = `${name} ${description}`.toLowerCase();
  const fullRowText = `${name} ${category} ${description}`.toLowerCase();
  const allergens = new Set(item?.allergens ?? []);

  if (/\b(?:tofu|miso|teriyaki)\b/.test(nameAndDescription)) {
    allergens.add("soy");
  }

  if (/\b(?:dumplings?|noodles?|pancake|pa\s+jun)\b/.test(fullRowText)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:seafood|clam|shrimp|octopus)\b/.test(fullRowText)) {
    allergens.add("shellfish");
  }

  const evidenceWithoutLighthouseReview = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "lighthouse-tofu-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: item.mayContain ?? [],
      allergenSourceType: "unavailable",
      sourceSummary:
        item.sourceSummary ===
        "Lighthouse Tofu menu ingredient review: direct tofu, soy-sauce family, dumpling, noodle, pancake, and seafood terms were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix."
          ? item.description
          : item.sourceSummary,
      evidence: evidenceWithoutLighthouseReview,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /lighthousetofu|singleplatform/i.test(String(url))) ??
    "https://places.singleplatform.com/lighthouse-tofu/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Lighthouse Tofu menu ingredient review: direct tofu, soy-sauce family, dumpling, noodle, pancake, and seafood terms were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...evidenceWithoutLighthouseReview,
      {
        source: "lighthouse-tofu-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Lighthouse Tofu menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeTigerDumplingsOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`.toLowerCase();
  const nameText = name.toLowerCase();
  const allergens = new Set();

  if (/\b(?:dumplings?|wontons?|noodles?|pot\s*stickers?|rangoon|spring\s+rolls?|egg\s+rolls?|pancake|battered)\b/.test(text)) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:shrimp|prawns?|crab|oyster\s+sauce)\b/.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:fish|cod|flounder)\b/.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:tofu|soy\s+sauce|bean\s+sauce|black\s+bean)\b/.test(text)) {
    allergens.add("soy");
  }

  if (/\bpeanuts?\b/.test(text)) {
    allergens.add("peanut");
  }

  if (/\bsesame\b/.test(text)) {
    allergens.add("sesame");
  }

  if (/\bcream\s+cheese\b/.test(text)) {
    allergens.add("milk");
  }

  if (/\bwalnuts?\b/.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\bpreserved\s+egg\b/.test(nameText) || /\bmayo\b/.test(text)) {
    allergens.add("egg");
  }

  const evidenceWithoutTigerReview = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "tiger-dumplings-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: item.mayContain ?? [],
      allergenSourceType: "unavailable",
      evidence: evidenceWithoutTigerReview,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /tiger-dumplings/i.test(String(url))) ??
    "https://tiger-dumplings.com/menu";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Tiger Dumplings menu ingredient review: direct dumpling, noodle, wonton, seafood, fish, tofu, soy-sauce, peanut, sesame, dairy, walnut, preserved-egg, and mayo terms were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...evidenceWithoutTigerReview,
      {
        source: "tiger-dumplings-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Tiger Dumplings menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeSokoButcherOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`.toLowerCase();
  const allergens = new Set();

  if (
    /\b(?:bagel|bread|roll|bun|focaccia|ciabatta|rye|breadcrumbs?|cutlets?|fried\s+chicken)\b/.test(text) ||
    /\b(?:sandwich|cheesesteak|philly|blt)\b/.test(name.toLowerCase())
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:cheese|provolone|american|swiss|burrata|brie|parmesan|cheese\s+wiz|cheese\s+sauce|cream\s+cheese|taziki|tzatziki)\b/.test(text)) {
    allergens.add("milk");
  }

  if (/\b(?:egg|mayo|aioli)\b/.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:tuna|yellowfin|anchovies)\b/.test(text)) {
    allergens.add("fish");
  }

  if (/\bsoy\s+sauce\b/.test(text)) {
    allergens.add("soy");
  }

  const evidenceWithoutSokoReview = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "soko-butcher-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: item.mayContain ?? [],
      allergenSourceType: "unavailable",
      evidence: evidenceWithoutSokoReview,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /sokobutcher|toasttab/i.test(String(url))) ??
    "https://www.sokobutcher.com/menu-1";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: item.mayContain ?? [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Soko Butcher menu ingredient review: direct bread, roll, bun, focaccia, ciabatta, dairy, egg, mayo, aioli, tuna, anchovy, and soy-sauce terms from official menu rows were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...evidenceWithoutSokoReview,
      {
        source: "soko-butcher-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Soko Butcher menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeYardbirdOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`.toLowerCase();
  const allergens = new Set();

  if (
    /\b(?:toast|biscuit|biscuits|brioche|roll|wrap|burrito|tortilla|waffles?|pasta|mac\s*&?\s*cheese|oreos?|cobbler|streusel|crumble|bread\s*crumbs?|breadcrumbs?|fried\s+chicken|tenders?|cutlets?|burger|sandwich)\b/.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (
    /\b(?:cheese|cheddar|american|parmesan|manchego|ricotta|queso|crema|cream|whipped\s+cream|ice\s+cream|butter|buttermilk|ranch|cheesy|gravy|nutella)\b/.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:egg|eggs|egg\s+white|mayo|aioli|caesar)\b/.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:ahi|tuna|unagi|salmon|anchovies?)\b/.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:shrimp|crab|lobster)\b/.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:almond|pecan|nutella)\b/.test(text)) {
    allergens.add("tree-nut");
  }

  const evidenceWithoutYardbirdReview = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "yardbird-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      evidence: evidenceWithoutYardbirdReview,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /runchickenrun|toasttab|yardbird|bento/i.test(String(url))) ??
    "https://www.runchickenrun.com/location-page-washington-dc/";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Yardbird menu ingredient review: direct bread, biscuit, toast, wrap, tortilla, waffle, pasta, dessert, dairy, egg, fish, shellfish, almond, pecan, and Nutella terms from official menu rows were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...evidenceWithoutYardbirdReview,
      {
        source: "yardbird-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Yardbird menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeGracesMandarinOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`.toLowerCase();
  const allergens = new Set();

  if (
    /\b(?:tempura|tempura\s+flakes|deep\s+fried|fried|gyoza|rangoon|noodles?|soba|udon|crepes?|spring\s+rolls?|cake|cheesecake|malt\s+vinegar)\b/.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (/\b(?:shrimp|crab|crabmeat|kani|scallop|calamari|mussels?|lobster|seafood|shellfish)\b/.test(text)) {
    allergens.add("shellfish");
  }

  if (/\b(?:fish|tuna|toro|salmon|yellowtail|eel|unagi|rockfish|roe|ikura|sashimi|nigiri|escolar)\b/.test(text)) {
    allergens.add("fish");
  }

  if (/\b(?:soy|tofu|miso|edamame|teriyaki)\b/.test(text)) {
    allergens.add("soy");
  }

  if (/\b(?:egg|tamago|custard|mayo|cake|cheesecake|mousse)\b/.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:cheese|cream\s+cheese|goat\s+cheese|chevre|chèvre|custard|cream|creme|crème|mousse|cake|cheesecake|butter)\b/.test(text)) {
    allergens.add("milk");
  }

  if (/\bsesame\b/.test(text)) {
    allergens.add("sesame");
  }

  if (/\b(?:macadamia|peanuts?|peanut)\b/.test(text)) {
    if (/\bmacadamia\b/.test(text)) {
      allergens.add("tree-nut");
    }
    if (/\bpeanuts?|peanut\b/.test(text)) {
      allergens.add("peanut");
    }
  }

  const evidenceWithoutGracesReview = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "graces-mandarin-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      evidence: evidenceWithoutGracesReview,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /gracesrestaurants/i.test(String(url))) ??
    "https://gracesrestaurants.com/menu/grace-s-mandarin-188-waterfront-st";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Grace's Mandarin menu ingredient review: direct tempura, fried, noodle, gyoza, rangoon, dessert, shellfish, fish, soy, tofu, miso, egg, mayo, dairy, sesame, macadamia, and peanut terms from official menu rows were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...evidenceWithoutGracesReview,
      {
        source: "graces-mandarin-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Grace's Mandarin menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function normalizeBoulangerieChristopheOfficialMenuIngredients(item) {
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`.toLowerCase();
  const allergens = new Set();

  if (
    /\b(?:croissant|chausson|tartelette|tart|pastry|puff\s+pastry|shell|crepes?|gaufres?|waffles?|brioche|baguette|sandwich|bread|loaf|sourdough|eclaire|eclair|choux|mille|millfeuille|feuilles|cake|quiche|granola)\b/.test(
      text,
    )
  ) {
    allergens.add("gluten");
    allergens.add("wheat");
  }

  if (
    /\b(?:café\s+au\s+lait|cafe\s+au\s+lait|butter|whole\s+milk|steamed\s+milk|latte|cappuccino|cheese|brie|gruy[eè]re|béchamel|bechamel|yogurt|cream|cr[eè]me|custard|ganache|mousseline|praline|nutella|chocolate|goat\s+cheese)\b/.test(
      text,
    )
  ) {
    allergens.add("milk");
  }

  if (/\b(?:egg|eggs|omelet|quiche|custard|meringue|macaron|crepes?|gaufres?|waffles?|choux|eclaire|eclair)\b/.test(text)) {
    allergens.add("egg");
  }

  if (/\b(?:macaron|almond|almonds|walnut|walnuts|hazelnut|praline|nutella|nuts?)\b/.test(text)) {
    allergens.add("tree-nut");
  }

  if (/\bsalmon\b/.test(text)) {
    allergens.add("fish");
  }

  if (/^apple-tartelette$/i.test(String(item?.id ?? ""))) {
    allergens.add("milk");
    allergens.add("tree-nut");
  }

  const evidenceWithoutBoulangerieReview = (item.evidence ?? []).filter(
    (entry) => entry?.source !== "boulangerie-christophe-menu-review",
  );

  if (allergens.size === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
      evidence: evidenceWithoutBoulangerieReview,
    };
  }

  const sourceUrl =
    (item?.sourceUrls ?? []).find((url) => /boulangeriechristophe|singleplatform/i.test(String(url))) ??
    "https://www.boulangeriechristophe.com/food-menu-1";

  return {
    ...item,
    ingredientsText: item.ingredientsText ?? item.description ?? undefined,
    allergens: Array.from(allergens).sort(),
    mayContain: [],
    allergenSourceType:
      item.allergenSourceType && item.allergenSourceType !== "unavailable"
        ? item.allergenSourceType
        : "official-ingredients",
    sourceSummary:
      "Boulangerie Christophe menu ingredient review: direct pastry, bread, croissant, crepe, waffle, brioche, sandwich, cake, quiche, dairy, egg, tree-nut, and salmon terms from official menu rows were mapped to app allergens. This is partial menu ingredient evidence, not a full allergen matrix.",
    evidence: [
      ...evidenceWithoutBoulangerieReview,
      {
        source: "boulangerie-christophe-menu-review",
        sourceKind: "menu-ingredient-review",
        sourceUrl,
        text: `Reviewed Boulangerie Christophe menu text: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };
}

function shouldSuppressPublishedReviewedItem(restaurant, item) {
  if (restaurant?.id === "il-canale-dc") {
    const id = String(item?.id ?? "");

    if (
      /^(?:gluten-free-gf|organic-bread-with-choice-of-side-house-salad-or-french-fries|no-san-marzano-tomato-sauce-our-pizza-is-made-with-organic-100percent-italian-wheat-00-flour|penne-made-with-rice-and-corn-with-choice-of-sauce)$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (
    restaurant?.id === "your-only-friend-dc" &&
    /^a-guide-to-the-best-chicken-sandwiches-in-dc-nomtastic-foods$/i.test(String(item?.id ?? ""))
  ) {
    return true;
  }

  if (restaurant?.id === "bantam-king-dc") {
    const id = String(item?.id ?? "");

    if (
      /^(?:chicken-and-sides|fried-chicken|hot-white-rice-topped-with-a-slow-cooked-egg-and-soy-sauce-halal|japanese-fish-cake|ko-hitime|made-with-valrhona-chocolate-and|marinated-soft-boiled-egg-not-vegetarian|miso-and-sesame-seeds-come-together-to-compliment-our-chicken-paitan-stock|ramen|rich-and-runny-egg-poached-in-its-shell|valrhona-chocolate-and-rendered-chicken-fat-come-together-to-create-this-decadent-cookie|weekday-lunch-deal)$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "marvs-dogs-dc" && /^additional-pint-vanilla$/i.test(String(item?.id ?? ""))) {
    return true;
  }

  if (restaurant?.id === "soko-butcher-dc-metro" && /^no-substitutions$/i.test(String(item?.id ?? ""))) {
    return true;
  }

  if (
    restaurant?.id === "yardbird-washington-dc-dc-metro" &&
    /^(?:almond-bitters-demerara-egg-white|bacon-celery-olive-lime-pickled-okra|brown-butter-orange-coffee|cold-brew-coffee|double-espresso|fever-tree-grapefruit-soda|hot-honey-ice-cube|miami|paso-robles-california|sam-adams-seasonal-tap|suisun-valley-california|watermelon-strawberry-basil-lime|white-peach-lemon-sweet-tea|yardbird-old-fashioned)$/i.test(
      String(item?.id ?? ""),
    )
  ) {
    return true;
  }

  if (
    restaurant?.id === "boulangerie-christophe-washington-dc-dc-metro" &&
    /^(?:boulangerie-christophe-potomac|item)$/i.test(String(item?.id ?? ""))
  ) {
    return true;
  }

  if (restaurant?.id === "el-pollo-rico-arlington-va") {
    const id = String(item?.id ?? "");

    if (
      /^(?:arlington(?:-virginia)?|fairfax(?:-virginia)?|wheaton(?:-maryland)?|woodbridge(?:-virginia)?|eat-well|scroll-to-top-scroll-to-top-scroll-to-top|website-designed-and-managed-by-blueunderground-web-design|el-pollo-rico-pollo-a-la-brasa-charcoal-broiled-chicken)$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "el-tamarindo-dc") {
    const id = String(item?.id ?? "");

    if (
      /^(?:ultra-moist-spongecake-soaked-in|salvadoran-and-mexican-restaurant|salvadoran-punch-with-fresh-chopped|poblano-and-toasted-sesame|fish-2225-birria-beef|pinto-bean-soup-served-with-avocado|salvadoran-combination-platter-with-your|shredded-chicken-2225-black-bean|shredded-twin-one-chicken-and-one-beef|steak-2325-grilled-chicken|steak-2525-grilled-chicken|succulent-jumbo-shrimp-sauteed-in|tex-steak-chicken-and-shrimp|two-empanadas-served-with-our-creamy|soups-and-salads|vegetarian-trios-v|fajitas|guacamole-dip-vg|el-tamarindo-nachos-v|seasonal-pan-dulce|cheese)$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "hello-betty-north-bethesda-md" && /^market-price$/i.test(String(item?.id ?? ""))) {
    return true;
  }

  if (
    restaurant?.id === "heidelberg-pastry-shoppe-arlington-va" &&
    /^(?:cake-sizing-guide|tag-breakfast|group-[a-f]-breads-1-lb-dollar\d+-2-lb)$/i.test(String(item?.id ?? ""))
  ) {
    return true;
  }

  if (restaurant?.id === "rare-bird-coffee-roasters-falls-church-va") {
    const id = String(item?.id ?? "");

    if (
      /^wholesale-/i.test(id) ||
      /^(?:employee-aeropress|employee-aeropress-filters|hario-v60-paper-filters|barkies-dog-biscuits|birdie-blend-subscription|decaf-subscription|roasters-choice-subscription)$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "hu-tieu-mi-lacay-cho-lon-falls-church-va") {
    const id = String(item?.id ?? "");

    if (/^(?:general-info|mi-lacay-eden-menu-gallery)$/i.test(id)) {
      return true;
    }
  }

  if (restaurant?.id === "medina-dc") {
    const id = String(item?.id ?? "");

    if (
      /^(?:brown-butter-urfa-aleppo-honey|egyptian-peanut-dukkah-wild-flower-honey|green-garbanzos-glazed-onions-raisins-almonds|hazelnuts-tahina-aleppo-honey|parsley-scallions|selection-of-raw-seasonal-vegetables)$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "mandns-pizza-bethesda-md") {
    const id = String(item?.id ?? "");
    const sourceType = String(item?.sourceType ?? "");

    if (/^(?:calzones|curries|spicy-thai-chicken-pizza)$/i.test(id) && sourceType === "sectioned-image-menu") {
      return true;
    }
  }

  if (restaurant?.id === "kizuna-sushi-ramen-tysons-va") {
    const id = String(item?.id ?? "");

    if (
      /^(?:everyday-rolls|fast-lunch-donburi|japanese-whiskies|kitchen-entrees|lunch-bento-box|ramen|signature-rolls|sushi-platters-combos|white)$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "rakuya-dc") {
    const id = String(item?.id ?? "");

    if (/^(?:kirin-ichiban|peter-lehmann|stadt-krems|substitution|spicytunaseries|tartar-sauce|teriyaki)$/i.test(id)) {
      return true;
    }
  }

  if (restaurant?.id === "baan-mae-dc" && /^lighter$/i.test(String(item?.id ?? ""))) {
    return true;
  }

  if (restaurant?.id === "peter-chang-mclean-va") {
    const id = String(item?.id ?? "");

    if (
      /^(?:request-advisory|without|spicy|spicy-and-numbing|togo-(?:dim-sum|meat-and-poultry|noodles-and-rice|peking-duck|seafood|seasonal-special|soup-and-dessert|tapas-meat-and-seafood|vegan))$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "spacebar-falls-church-va-dc-metro") {
    const description = String(item?.description ?? "").trim();

    if (!description) {
      return true;
    }
  }

  if (restaurant?.id === "pleroma-cuisine-laurel-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:brunch-reservations|fathers-day-brunch-reservation|valentine-love-basket|weekly-meal-prep-service|eef)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:Brunch Reservations|Father's Day Brunch Reservation|Valentine Love Basket|Weekly Meal Prep Service|Eef)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "menomale-dc") {
    const name = String(item?.name ?? "").trim();
    const category = String(item?.category ?? "").trim();
    const description = String(item?.description ?? "").trim();
    const toppingLikeName =
      /^(?:anchovies|artichokes|arugula|black olives|bresaola|capers|cherry tomatoes|chips|eggplant|feta|fior di latte mozzarella|garlic|glaze|goat cheese|gorgonzola|italian sausage|mushrooms|onions|pepperoni|porcini mushrooms|prosciutto cotto \(ham\)|prosciutto di parma|prosciutto e melone|red peppers|ricotta|roasted red peppers|rosemary chicken|salami|side of marinara|side of pesto|smoked salmon|spicy salami|vesuvius tomatoes)(?:\s+(?:full|1\/2|1\/4))?$/i.test(
        name,
      );

    if (
      !description &&
      toppingLikeName &&
      /^(?:Antipasti|Catering|Roman 1\/2 tray \(12 slices\)|Roman 1\/4 tray \(6 slices\))$/i.test(category)
    ) {
      return true;
    }

    if (!description && /^(?:balsamic glaze|boiled eggs|gluten free crust)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();
    const category = String(item?.category ?? "").trim();

    if (
      /^(?:individual-pizzas|large-pizzas|small-pizzas|lost-dog-gourmet-pizzas|lost-dog-specialty-sandwiches-continued)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      category === "Sides" &&
      /^(?:a-white-pizza-with-|homemade-spicy-pizza-sauce-topped|marinara-sauce-with-|our-marinara-sauce-topped-with-fresh)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:A white pizza with|Homemade spicy pizza sauce topped|Marinara sauce with|Our marinara sauce topped with)/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "northside-social-va") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:breakfast-sandwiches-served-all-day|austin-eastcider|brooklyn-brewery|x-large)$/i.test(id) ||
      /^Breakfast Sandwiches\s*\(Served All Day\)$/i.test(name)
    ) {
      return true;
    }
  }

  if (restaurant?.id === "replacement-his-and-hers-washington-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();
    const category = String(item?.category ?? "").trim();

    if (
      /^(?:bbq|boom-boom|ketchup|mayo|ranch|syrup|thai-chili|a1-sauce|blue-cheese|cajun-sauce|hot-sauce|remoulaude-sauce|soy-sauce)$/i.test(
        id,
      ) ||
      (/^(?:Menu|Restaurant)$/i.test(category) &&
        /^(?:A1 Sauce|BBQ|Blue Cheese|Boom|Cajun Sauce|Hot Sauce|Ketchup|Mayo|Ranch|Remoulaude Sauce|Soy Sauce|Syrup|Thai Chili)$/i.test(
          name,
        ))
    ) {
      return true;
    }
  }

  if (restaurant?.id === "replacement-moxies-washington-dc-restaurant-washington-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:group-bookings|3-course-dinner|brunch-buffet|buffet|buyout|dining-room|patio|per-person|fresh-flavours|fresh-flavours-and-standout-dishes-all-summer-long|see-our-summer-feature-menu-and-book-your-patio-table-this-season|your-favourite-bowl-is-back|zero|wdc-100825|serving-size-g|handhelds-also-see-sides|mains-sides-included|pastas-and-bowls-no-bread|soup-and-salads|steaks-also-see-sides|choice-of-two-proteins|feeds-6-8|vegetarian-items|look-for-the-symbol-throughout-the-menu-for-more-vegetarian-options|ask-your-server-for-our-tea-selection|tea-ask-your-server-for-our-tea-selection)$/i.test(
        id,
      ) ||
      /^(?:Group Bookings|BUYOUT|DINING ROOM|PATIO|PER PERSON|Fresh Flavours|SERVING SIZE \(g\)|ZERO)$/i.test(name)
    ) {
      return true;
    }

    if (
      /^(?:and-garlic-herb-aioli-side-super-greens-salad|brioche-bun-side-super-greens-salad|buttered-brioche-bun|cheddar-burger-sauce|cheese-curds-and-chives|fresh-pico-de-gallo-and-guacamole|fresh-seasonal-vegetables|guacamole-25-add-beef-or-blackened-chicken|honey-and-coconut|jasmine-rice-and-fresh-seasonal-vegetables|multi-grain-toast-fresh-fruit|on-multi-grain-toast-home-fries|soup-and|sriracha-aioli-and-sweet-chili-sauce|sushi-soy-sauce|toasted-buttered-brioche-bun-home-fries|vegan-dumplings-with-chili-ponzu-and-fresh-mango-salsa|vegan-option-available|vinaigrette-with-goat-cheese-crostinis|blackened-mahi-mahi-with-mango-slaw-and-garlic-herb-aioli-side-super-greens-salad|brioche-french-toast-bites-with-house-made-caramel-sauce|crown-royal-strawberries-and-syrup-whipped-cream|substitute-grilled-chicken-breast-with-no-spice)$/i.test(
        id,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "the-harbour-grille-woodbridge-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();
    const description = String(item?.description ?? "").trim();

    if (
      /^(?:13188-marina-way-woodbridge-va|get-in-touch|happenings|the-harbour-grille|large|lunch-special|butchers|merritt-mclaughlin|rachel-thorne)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:apple-pie-moonshine|cinn-toast-crunch|creme-de-menth-green|dbl-jack-honey|duck-fart|green-river-ky|harbour-irish-coffee|irish-coffee|jack-honey|long-island-iced-tea)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:Get in Touch|Happenings|The Harbour Grille|LARGE|LUNCH SPECIAL!|BUTCHER’S)$/i.test(name)) {
      return true;
    }

    if (/^Marina Way,\s*Woodbridge,\s*VA$/i.test(description)) {
      return true;
    }
  }

  if (restaurant?.id === "replacement-huncho-house-hyattsville-md") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^(?:african-pepper-sauce|crab-oscar|hot-honey)$/i.test(id)) {
      return true;
    }

    if (/^(?:African pepper sauce|Crab Oscar|Hot honey)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "replacement-provost-restaurant-washington-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:all-day-happy-hour|branzini-moscato-nv|connect-social-accounts|go-mobile-first|heineken|hennessy|improved-mobile-performance|irish-coffee|laurel-cellars-chardonnay|link-to-anything|mimosa|non-alcoholic-beverages|old-fashion-new-twist|organic-shiraz-stellar-organics|organic-shiraz-stellar-organics-south-africa|organic-white-blend-live-a-little|organic-white-blend-live-a-little-south-africa|pinot-grigio-simonetti|pinot-grigio-simonetti-italy|provost-iced-tea|provost-tea|run-effects-with-touch|samuel-adams|signature-drinks|strawberry|the-golden-hour|use-advanced-layout-tools|use-dual-colour-filters|use-html|use-super-sharp-svgs|yuuz-yuzu-ade)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:ALL DAY HAPPY HOUR|Connect Social accounts|Go Mobile First|Heineken|Hennessy|Irish Coffee|Mimosa|NON ALCOHOLIC BEVERAGES|OLD FASHION|Provost Iced Tea|Provost Tea|Run Effects with Touch|Samuel Adams|SIGNATURE DRINKS|THE GOLDEN HOUR)$/i.test(
        name,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "inca-social-vienna-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:2026-world-cup|arlington-va|birthdays|community|inca-network|insights|resources|vienna-va|party-sticks-add-on-dollar25-available-only-with-the-birthday-package)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:available-with-pasta|a-tabbouleh-style-salad-with-avocado|accented-with-delicate-dots-of-black|crispy-yucca-sticks-served-with|grilled-chicken-breast-served|made-with-our-homemade|mozzarella-cheese-inside|our-causa-dough-stuffed-with-your|pan-fried-bean-and-rice-cake|peruvian-chicken-stew-made-with|shaved-tender-pieces-of-spanish-octopus|tender-brisket-infused-with|techniques-with-peruvian-beef|topped-with-our-classic-ceviche|traditional-peruvian-pastry-made-with|two-beef-empanadas-filled|two-chicken-empanadas-filled-with-our|two-empanadas-filled-with-ground|ultra-light-cake-homemade-whipped)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:2026 World Cup|Birthdays|Community|Inca network|Insights|Resources)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "replacement-delhi-spice-bethesda-md") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:connect-social-accounts|entree-singlesharing|go-mobile-first|improved-mobile-performance|las-perdices|link-to-anything|run-effects-with-touch|use-advanced-layout-tools|use-dual-colour-filters|use-html|use-super-sharp-svgs)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:Connect Social accounts|Entree \(Single\/Sharing\)|Go Mobile First|Improved Mobile Performance|Link to Anything|Run Effects with Touch)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "plaka-grill-vienna-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:actions-after-submission|allow-file-uploads|automatic-lightbox-pop-up|confirmation-email-to-user|custom-html-field|customize-your-form-designs|easily-export-your-data|email-formatting|export-form-submissions|export-your-data|file-upload|filter-your-site-visits|find-out-where-visitors-go|flexible-input-validation|get-advanced-insights|get-email-notifications|get-more-form-submissions|get-started-easily|instant-emails|js-customizations|map-your-visitors|number-of-fields|number-of-submissions|pdf-and-print|receive-submissions|reliable-protection|set-email-notifications|show-off-your-visits|storage|unlimited-stats|use-data-analysis|wix-contacts-integration)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:DIP APPETIZERS|KIDS|MAIN COURSES|SOUPS AND SALADS|WRAPS|Make it a Combo|Salad Proteins)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "oohh-s-and-aahh-s-washington-dc-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:616-south-broadway-baltimore-md|apps|bbq-sauce|bleu-cheese-dressing|buffalo-sauce|but-first|chili-yaki-sauce|chiliyaki-sauce|dinner-entrees|enjoy-the-experience|extra-sauces|hot-honey-old-bay|hot-sauce|lemon-pepper-sauce|main-event|mambo-sauce|no-sides|oohhs-and-aahhs|remoulade-sauce|side-sauces|spicy-mambo-sauce|tartar-sauce|teriyaki-sauce|your-event-our-feast)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:Apps|But First|Dinner Entrees|ENJOY THE EXPERIENCE|Extra Sauces|Main Event|No sides|Oohh's & Aahh's|Side Sauces|YOUR EVENT, OUR FEAST)$/i.test(
        name,
      )
    ) {
      return true;
    }
  }

  if (["flower-child-bethesda", "osm-flower-child-6327602834"].includes(restaurant?.id)) {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:all-good-all-summer-long|ebites|entrees|family-pack|follow-us-on-social|group-dining|healthy-kids|now-pouring-summer-sangrias|omaha|packages|red-blend|restaurant-hours|rose|seasonal-sangria)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:All GOOD All Summer Long|eBites|Entrées|Family Pack|Follow us on social|Group Dining|Healthy Kids|Now pouring: Summer Sangrias|Omaha|Packages|Red Blend|RESTAURANT HOURS:|Rosé|Seasonal Sangria)$/i.test(
        name,
      )
    ) {
      return true;
    }
  }

  if (["true-food-kitchen", "true-food-kitchen-arlington"].includes(restaurant?.id)) {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:group-dining|keto-and-paleo-friendly|vegan-options-yes|vegetarian-yes|v1a0|whats-new)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:Group Dining|Keto & Paleo Friendly|Vegan Options Yes|Vegetarian Yes|V1A0|What’s New|What's New)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "jimmys-old-town-tavern-herndon-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:2026-golf-tournament|buffalo-sports|buy-a-brick|cup|cup-dollar625-bowl|history|jimwear|jott-wing-sauce|memories|memory-lane-mural|unlimited-refills|upcoming-events|washington-sports|weekly-events|whats-new)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:2026 Golf Tournament|Buffalo Sports|Buy a Brick|Cup|Cup \$6\.25, Bowl|History|JimWear|JOTT Wing Sauce|Memories|Memory Lane Mural|Unlimited Refills|Upcoming Events|Washington Sports|Weekly Events|What's New)$/i.test(
        name,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "teddy-and-the-bully-bar-washington-dc-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^(?:passover-menu-opens-a-pdf)$/i.test(id)) {
      return true;
    }

    if (/^Passover Menu opens a pdf$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "joon-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^(?:sumac|upgrade-cucumber-salad)$/i.test(id)) {
      return true;
    }

    if (/^(?:Sumac|Upgrade Cucumber Salad)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "society-seafood-house-silver-spring-md-dc-metro") {
    if (/^Restaurant$/i.test(String(item?.category ?? ""))) {
      return true;
    }
  }

  if (restaurant?.id === "silver-bethesda-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:avocado-toasts|breakfast-brunch-entrees|breakfast-side-items|creekstone-burgers-and-sandwiches|desserts-shakes|kids-menu-items|sharing-plates|side-items|side-options-for-omelet|spring)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:AVOCADO TOASTS|BREAKFAST \+ BRUNCH ENTREES|BREAKFAST SIDE ITEMS|CREEKSTONE BURGERS & SANDWICHES|DESSERTS \+ SHAKES|KIDS MENU ITEMS|SHARING PLATES|SIDE ITEMS|Side Options for Omelet|SPRING)$/i.test(
        name,
      )
    ) {
      return true;
    }

    if (
      /^(?:chimichurri-chicken-wings-caramel-french-toast-and-eggs|crispy-smashed-potatoes-with-add-strawberries|goat-cheese-bruschetta-caramel-french-toast|lamb-meatballs-sharting-plate-bison-huevos-rancheros)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^FLEXITARIAN OPTIONS\b/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "osm-tasty-nook-12663327602") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^(?:omelettes|escialty-coffees)$/i.test(id)) {
      return true;
    }

    if (/^(?:OMELETTES|ESCIALTY COFFEES)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "clydes-gallery-place-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();
    const category = String(item?.category ?? "").trim();

    if (
      /^(?:cans|chipotle-buttermilk-dressing-parmesan|clydes-blend-coffee|full-order|gpdessert0604|mustard-dipping-sauce|q-is-parking-available-nearby)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^Q:\s*Is parking available nearby\?/i.test(name) ||
      /^GP_Dessert_/i.test(name) ||
      (/^Dessert$/i.test(category) && /\bCOFFEE & TEA\b/i.test(name)) ||
      (/^Starters$/i.test(category) && /^Full Order$/i.test(name))
    ) {
      return true;
    }
  }

  if (restaurant?.id === "crumbl") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^(?:crumbl-cookies|cookie-7-712)$/i.test(id)) {
      return true;
    }

    if (/^(?:Crumbl Cookies|Cookie 7 \(7\/12\))$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "osm-aracosia-3584164912") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^(?:billecart-salmon-brut-reserve-champagne-nv|billecart-salmon-rose-champagne-nv|mothers-day-special)$/i.test(id)) {
      return true;
    }

    if (/^(?:Billecart Salmon, Brut Reserve, Champagne, NV|Billecart Salmon, Rosé, Champagne, NV|Mother's Day Special)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "uzu-revolving-sushi-rockville-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:chunin|genin|jonin|number-of-captions|responsive-support|shuffle-slides|user-friendly-interface)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:Chunin|Genin|Jonin|Number of Captions|Responsive Support|Shuffle slides|User-friendly interface)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "osm-juke-box-diner-3925447512") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:book-your-banquet|cc-authorization-form|credit-card-authorization|community-impact|community-outreach|fundraising-with-jbd|desserts-and-ice-cream|substitute-eggs-with-egg-whites-150)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:beef-patty-grilled-with-sauteed-onions-and-cheddar|broiled-in-a-lemon-butter-garlic-sauce|cheddar-feta-mozzarella|chicken-bacon-cheddar-bbq|diced-onions-green-pepper-and-ham|diced-onions-green-peppers-and-ham|fried-egg-cheddar-bacon|handmade-meatballs-nestled-in-pasta-with-our-signature-marinara-sauce|lettuce-tomato-and-mayo|lettuce-tomato-mayo-and-bacon|loaded-home-fries-topped-with-our-homemade-sausage-gravy|mushrooms-provolone-cheese-swiss|orange-apple-cranberry-tomato|poached-country-eggs-on-spinach-with-hollandaise-sauce|start-with-3-eggs-and-choice-of-cheese|topped-w-marinara-and-melted-mozzarella-cheese|topped-with-brown-beef-gravy|topped-with-corned-beef-hash-and-poached-country-eggs-with-hollandaise-sauce|topped-with-olive-oil-and-a-side-of-toasted-pita-chips|two-scrambled-country-eggs-with-diced-ham-and-cheese)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^(?:Book your Banquet|CC Authorization Form|Credit Card Authorization|Community Impact|Community Outreach|Fundraising with JBD|Desserts & Ice Cream)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "osm-red-hot-blue-1448579525") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();
    const description = String(item?.description ?? "").trim();

    if (
      /^(?:bbq-plates|favorites|meat-samplers|rib-combos|ribs-and-combos|rub-and-sauces|southern-sides|sweets|the-kettle|to-go-drinks)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/^pulled-pork-pulled-chicken-texas-brisket-smoked-turkey-breast-smoked-sausage$/i.test(id) && /all rights reserved/i.test(description)) {
      return true;
    }

    if (/^(?:BBQ PLATES|FAVORITES|MEAT SAMPLERS|RIB COMBOS|RIBS & COMBOS|RUB & SAUCES|SOUTHERN SIDES|SWEETS|THE KETTLE|To Go Drinks)$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "replacement-nova-europa-restaurant-silver-spring-md") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:a-selection-of-complete-dinners-for-4-offered-for-carryout|coffeetea-295-espresso|cooked-to-your-preference-and-served-with-potato-and-daily-vegetable|cutlet-chicken-breast-topped-with-cheese-in-marinara-sauce-and-linguini|garlic-lemon-sauce|green-pepper-onion-and-tomato-sauce|in-shell-with-garlic-sauce|irish-coffee-895-cappuccino|lemon-garlic-sauce|served-in-a-lemon-sauce-with-sauteed-mushroom|served-over-capellini-with-cherry-tomatoes-and-basil-in-garlic-sauce|served-tuesday-sunday-5-pm-930pm|stuffed-with-cheese-in-marinara-sauce|veal-scallopini-with-mushroom-and-marsala-wine-sauce)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:A Selection of Complete Dinners for 4 offered for carryout|Coffee\/Tea 2\.95 Espresso|Cooked to your preference and served with potato and daily vegetable|Cutlet chicken breast topped with cheese in marinara sauce & linguini|Garlic Lemon Sauce|Green Pepper, Onion, & Tomato Sauce|In Shell with garlic Sauce|Irish coffee 8\.95 Cappuccino|Lemon garlic sauce|Served in a lemon sauce with sautéed mushroom|Served over capellini with cherry tomatoes and basil in garlic sauce|Served Tuesday - Sunday 5 pm - 9:30pm|Stuffed with Cheese in Marinara Sauce|Veal Scallopini with mushroom and marsala wine sauce)$/i.test(
        name,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "osm-cuates-12207964801") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:apetaizers|chef-recomendations|dinner-for-two-dine-in-only|enchiladas-burritos-chimichangas|grill-fajitas|mexican-conbinations|saturday-and-sunday-brunch|sides-tray|street-tacos-a-la-carte)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:APETAIZERS|CHEF RECOMENDATIONS|Dinner for two, dine in only|ENCHILADAS BURRITOS CHIMICHANGAS|GRILL FAJITAS|MEXICAN CONBINATIONS|SATURDAY AND SUNDAY BRUNCH|SIDES TRAY|STREET TACOS A LA CARTE)$/i.test(
        name,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "osm-urbano-9821308296") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:5-de-mayo-taco-sep-ut|burger-tortas|cheese|chefs-corner|chicken|chicken-with-green-tomatillo-sauce|large-flour-tortilla-lightly-fried-until|large-flour-tortilla-with-cheese-served|marinated-pork-in-urbanos-al-pastor|marinated-pork-in-urbanos-signature|shredded-beef|shrimp|shrimp-and-scallop-with-seafood-salsa|soup-salad-and|vegetables-with-ranchero-sauce)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:5 de mayo taco sep ut|BURGER TORTAS|CHEESE \/|CHEF'S CORNER|CHICKEN \/|Chicken with green tomatillo sauce|Large flour tortilla lightly fried until|Large flour tortilla with cheese\. Served|Marinated pork in Urbano’s Al Pastor|Marinated pork in Urbano’s signature|SHREDDED BEEF \/|SHRIMP \/|Shrimp and scallop with seafood salsa|SOUP SALAD &|Vegetables with ranchero sauce)$/i.test(
        name,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "osm-our-mom-eugenia-2578773395") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();
    const description = String(item?.description ?? "").trim();

    if (
      /^(?:advanced-customizations|avantis-estate-mountrichas|bosinakis-ieria-rose|cosmopolitan|cuvee-helene-efrosini|deux-dieux-aivalis|franziskaner-hefe-weiss|geometria-lafazanis|heineken-00percent|kalimera|kikones|ktima-mitravela|leffe-blonde|magic-mountain-lazaridis|magic-mountain-nico-lazaridi|meat-appetizers|meat-entrees|monopati-aivalis|mouhtaro-samartzis|oinotria-gi-costa-lazaridi|pineapple-upside-down|robola-orealios|sarakiniko|savvatiano-sokos|seafood-appetizers|seafood-entrees|spreads|the-odyssey|topos-siedaris)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:Advanced Customizations|“Avantis Estate” Mountrichas|“Magic Mountain” Lazaridis|“Savvatiano” Sokos|Bosinakis Ieria Rosé|Cosmopolitan|Cuvee Helene - Efrosini|Deux Dieux - Aivalis|Franziskaner Hefe Weiss|Geometria - Lafazanis|Heineken 0\.0%|Kalimera|Kikones|Ktima Mitravela|Leffe Blonde|Magic Mountain - Nico Lazaridi|Meat Appetizers|Meat Entrees|Monopati - Aivalis|Mouhtaro - Samartzis|Oinotria Gi - Costa Lazaridi|Pineapple Upside Down|Robola - Orealios|Sarakiniko|Seafood Appetizers|Seafood Entrees|Spreads|The Odyssey|Topos Siedaris)$/i.test(
        name,
      )
    ) {
      return true;
    }

    if (
      /\b(?:Agiorgitiko|Cab Sauv|Moscofilero|Goustolidi|Limnio|Robola|Tsipouro|Chambord|Cointreau|Grey Goose|Bailey|Kahlua|Limoncello|Grenadine|Bavarian Wheat|Belgian Blonde)\b/i.test(
        `${name} ${description}`,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "ilili-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^velvety$/i.test(id) || /^VELVETY$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "replacement-sunflower-vegetarian-restaurant-vienna-va") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^(?:x7-sauce)$/i.test(id) || /^X7 Sauce$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "replacement-afghania-washington-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^raw-/i.test(id) || /^Raw\b/i.test(name)) {
      return true;
    }

    if (/^chops-and-kabobs$/i.test(id) || /^CHOPS AND KABOBS$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "el-patio-randolph-rockville-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (
      /^(?:all-steaks-are-choice-or-better|breaded-steak-or-breaded-chicken-fried|customize-the-text|easy-to-add|make-it-a-combo-fries-and-drink)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:All Steaks are “Choice” or better|Breaded steak or breaded chicken fried|Customize the Text|Easy to Add|Make it a COMBO \(Fries & Drink\))$/i.test(
        name,
      )
    ) {
      return true;
    }
  }

  if (restaurant?.id === "open-city-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();

    if (/^(?:burgers-and-sandwiches|earn|hearth-oven-pizza)$/i.test(id)) {
      return true;
    }

    if (/^(?:Burgers & Sandwiches|Earn|Hearth Oven Pizza)$/i.test(name)) {
      return true;
    }
  }

  if (
    [
      "farmers-and-distillers-dc",
      "farmers-fishers-bakers-dc",
      "founding-farmers-dc",
      "founding-farmers-reston-station-va",
      "founding-farmers-tysons-va",
    ].includes(restaurant?.id)
  ) {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();
    const category = String(item?.category ?? "").trim();

    if (/^Menu$/i.test(category) && /^chocolate$/i.test(id) && /^Chocolate$/i.test(name)) {
      return true;
    }
  }

  if (restaurant?.id === "maggie-mcfly-s-springfield-springfield-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "").trim();
    const description = String(item?.description ?? "").trim();

    if (
      /^(?:business-inquiries|sale|sizing-chart|team-portal|150-chef-curated-dishes|farm-to-table|local-partners|locally-sourced-ingredients|made-fresh|take-out|12-years-and-under|regular|served-with-bbq-maple-dijon-sauce-side|romaine-house-made-croutons-asiago-caesar|cavatappi-melted-cheese|sauce-choice|column|connecticut|discover-maggie-mcflys|eat-drink-be-unique|menu-info-and-hours|new-york)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (
      /^(?:Business Inquiries|Sale|Sizing Chart|Team Portal|150\+ Chef-Curated Dishes|FARM TO TABLE|Locally-sourced Ingredients|Made Fresh|Take-Out|12 YEARS & UNDER|REGULAR|SAUCE CHOICE|Column|Connecticut|Discover Maggie McFly’s|Eat\. Drink\. Be Unique|Menu, Info & Hours|New York)$/i.test(
        name,
      )
    ) {
      return true;
    }

    if (
      /^(?:100-proof-rye|basil-hayden|bermuda-triangle|budweiser|casa-bubbla|corona|corona-light|cucumber-basil|devils-backbone-juicy-magic|founders-dirty-bastard|heavy-seas-loose-cannon|heineken|high-noon-gf|high-west-campfire|honey-lavender-spritzer|long-island|michters-american|oconnor-el-guapo|petite-colada|sly-clyde-inkett|smartmouth-notch|strawberry-basil|truly-wildberry-gf|twisted-tea|victory-sour-monkey|wicked-weed-pernicious)$/i.test(
        id,
      )
    ) {
      return true;
    }

    if (/\$\d+(?:\.\d{2})?\s+\d+oz/i.test(description)) {
      return true;
    }
  }

  return false;
}

function applyReviewedOfficialGuideContext(restaurant) {
  if (restaurant?.id !== "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro") {
    return restaurant;
  }

  const existingGuides = Array.isArray(restaurant.sourceStatus?.reviewedOfficialGuides)
    ? restaurant.sourceStatus.reviewedOfficialGuides
    : [];
  const existingGuideKeys = new Set(existingGuides.map((guide) => guide?.sourceUrl).filter(Boolean));
  const reviewedOfficialGuides = existingGuideKeys.has(lostDogOfficialAllergyGuide.sourceUrl)
    ? existingGuides
    : [...existingGuides, lostDogOfficialAllergyGuide];

  return {
    ...restaurant,
    officialAllergenStatus: "extracted",
    officialAllergenRemediationBucket: "official-accommodation-guide-parsed",
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      officialAllergenRemediationBucket: "official-accommodation-guide-parsed",
      officialGuideParsed: true,
      officialGuideParserProfile: "flipsnack-official-guide",
      reviewedOfficialGuides,
    },
  };
}

function applyReviewedAccommodationPolicyContext(restaurant) {
  const policy = reviewedAccommodationPolicies[restaurant?.id];

  if (!policy) {
    return restaurant;
  }

  return {
    ...restaurant,
    allergyAccommodationPolicy: policy,
    guideLabel: "Official accommodation source",
    guideUrl: policy.sourceUrl,
    allergenDataStatus: {
      ...(restaurant.allergenDataStatus ?? {}),
      officialItemCount: 0,
      officialEvidence: {
        ...(restaurant.allergenDataStatus?.officialEvidence ?? {}),
        bucket: "accommodation-policy-only",
        officialFullMatrixOrApi: 0,
        officialIngredientDisclosure: 0,
        officialProductSection: 0,
        globalCrossContactNote: 0,
        unavailable: 0,
        suspiciousOfficialParserFragments: 0,
        officialTotal: 0,
        totalItemCount: restaurant.items?.length ?? 0,
        officialCoverageRatio: 0,
      },
      officialTotal: 0,
      totalItemCount: restaurant.items?.length ?? 0,
      officialCoverageRatio: 0,
      bucket: "accommodation-policy-only",
    },
    officialAllergenStatus: "not-applicable",
    officialAllergenRemediationBucket: "accommodation-policy-only",
    parserProfile: "accommodation-policy-shell",
    sourceFamily: "manual-review",
    sourceProfile: "accommodation-policy",
    sourceStatus: {
      ...(restaurant.sourceStatus ?? {}),
      accommodationOnly: true,
      officialAllergenRemediationBucket: "accommodation-policy-only",
      officialEvidenceBucket: "accommodation-policy-only",
      officialItemCount: 0,
      reviewedAccommodationPolicy: {
        sourceUrl: policy.sourceUrl,
        reviewedAt: policy.sourceRetrievedAt,
        status: policy.status,
      },
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          updatedRows: 0,
          note:
            "Reviewed official accommodation policy source: no item-level allergen matrix is published, so this restaurant is represented as an accommodation-policy shell instead of source-found-unparsed.",
        },
      ],
    },
    sourceUrls: Array.from(new Set([...(restaurant.sourceUrls ?? []), policy.sourceUrl].filter(Boolean))),
  };
}

function compactReviewedRepairNotes(sourceStatus) {
  if (!sourceStatus?.reviewedMenuQualityRepairs?.length) {
    return sourceStatus;
  }

  const seen = new Set();
  const reviewedMenuQualityRepairs = [];

  for (const repair of sourceStatus.reviewedMenuQualityRepairs) {
    const key = JSON.stringify(repair);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    reviewedMenuQualityRepairs.push(repair);
  }

  return {
    ...sourceStatus,
    reviewedMenuQualityRepairs: reviewedMenuQualityRepairs.slice(-40),
    reviewedMenuQualityRepairDuplicatesRemoved:
      (sourceStatus.reviewedMenuQualityRepairDuplicatesRemoved ?? 0) +
      sourceStatus.reviewedMenuQualityRepairs.length -
      reviewedMenuQualityRepairs.length,
  };
}

function compactReviewedSourceUrl(value) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return raw;
  }

  try {
    const url = new URL(raw);

    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(?:rwg_token|utm_|fbclid|gclid|diningOption|selectedDate|selectedTime)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }

    if ([...url.searchParams.keys()].length === 0) {
      url.search = "";
    }

    return url.toString();
  } catch {
    return raw.length > 500 ? raw.slice(0, 500) : raw;
  }
}

function compactReviewedItemEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return [];
  }

  const compacted = [];
  const seen = new Set();

  for (const entry of evidence) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const next = {
      ...entry,
      sourceUrl: compactReviewedSourceUrl(entry.sourceUrl),
      text: String(entry.text ?? "").replace(/\s+/g, " ").trim().slice(0, 700),
    };
    const key = JSON.stringify(next);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    compacted.push(next);

    if (compacted.length >= 5) {
      break;
    }
  }

  return compacted;
}

function compactReviewedMenuItemForPublish(item) {
  const sourceUrls = Array.from(
    new Set((item?.sourceUrls ?? []).map(compactReviewedSourceUrl).filter(Boolean)),
  ).slice(0, 6);
  const evidence = compactReviewedItemEvidence(item?.evidence);

  return {
    ...item,
    ...(sourceUrls.length ? { sourceUrls } : { sourceUrls: [] }),
    ...(evidence.length ? { evidence } : { evidence: [] }),
    sourceSummary:
      typeof item?.sourceSummary === "string" && item.sourceSummary.length > 900
        ? item.sourceSummary.slice(0, 900)
        : item?.sourceSummary,
  };
}

function isBoardAndBrewReviewedRestaurant(restaurant) {
  return String(restaurant?.id ?? "") === "the-board-and-brew-college-park-dc-metro";
}

function boardAndBrewLooksLikeTastingNote(item) {
  const text = `${item?.name ?? ""} ${item?.description ?? ""}`.toLowerCase();

  if (/\b(?:latte|milk|cake|bread|cookie|brownie|sandwich|burger|toast|bagel|burrito|cheese|cream|soup|salad|shrimp|crab|salmon|oats|yogurt|pancake|pretzel|fries|wings|bites|smoothie|matcha)\b/.test(text)) {
    return false;
  }

  return /\b(?:balanced|grassy|bold\/dark|strong\/floral|cooling\/crisp|soothing\/delicate|citrus\/spice|warmly-spiced\/traditional|onyx|open seas|natural plum|premium dark roast|fruit notes|smoky dark chocolate body)\b/.test(text);
}

function boardAndBrewReviewedOfficialAllergens(item) {
  if (boardAndBrewLooksLikeTastingNote(item)) {
    return [];
  }

  const text = `${item?.id ?? ""} ${item?.name ?? ""} ${item?.description ?? ""} ${item?.sourceSummary ?? ""}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);
  const has = (pattern) => pattern.test(text);

  if (has(/\b(?:shrimp|crab|shellfish)\b/)) {
    allergens.add("shellfish");
  }
  if (has(/\b(?:salmon|caesar dressing|caesar salad|fish|anchov(?:y|ies))\b/)) {
    allergens.add("fish");
  }
  if (has(/\b(?:milk|cream|cream cheese|cheese|cheddar|swiss|parmesan|cotija|jack cheese|sour cream|yogurt|ice cream|whipped cream|buttermilk|butter|provolone|ricotta|goat cheese|feta|mozzarella|white chocolate|chocolate milk|steamed milk|coconut milk|latte|macchiato|cappuccino)\b/)) {
    allergens.add("milk");
  }
  if (has(/\b(?:egg|eggs|over[- ]?easy|mayo|mayonnaise|aioli|custard|brioche|caesar dressing)\b/)) {
    allergens.add("egg");
  }
  if (has(/\b(?:bread|sourdough|bagel|everything bagel|focaccia|foccacia|flour tortilla|brioche|pastry|pastries|cake|cookie|brownie|croissant|pancake|pretzel|macaroni|mac and cheese|croutons?|ginger snap crust|potato roll|ciabatta|multi[- ]?grain|whole wheat|toast|toasted|sandwich|burger|burrito)\b/)) {
    allergens.add("wheat");
    allergens.add("gluten");
  }
  if (has(/\b(?:nuts|hazelnut|hazelnuts|almond|almonds|walnut|walnuts|granola|coconut milk|coconut|coco)\b/)) {
    allergens.add("tree-nut");
  }
  if (has(/\b(?:peanut|peanut butter)\b/)) {
    allergens.add("peanut");
  }
  if (has(/\b(?:soy|tofu|miso|tamari)\b/)) {
    allergens.add("soy");
  }
  if (has(/\b(?:sesame|everything bagel)\b/)) {
    allergens.add("sesame");
  }
  if (has(/\b(?:mustard|dijon)\b/)) {
    allergens.add("mustard");
  }
  if (has(/\b(?:red wine|wine|vinaigrette|balsamic)\b/)) {
    allergens.add("sulfites");
  }

  return ["shellfish", "fish", "milk", "egg", "gluten", "wheat", "tree-nut", "peanut", "soy", "sesame", "mustard", "sulfites"].filter((id) =>
    allergens.has(id),
  );
}

function repairBoardAndBrewOfficialMenuItem(restaurant, item) {
  if (!isBoardAndBrewReviewedRestaurant(restaurant)) {
    return item;
  }

  const allergens = boardAndBrewReviewedOfficialAllergens(item);
  const sourceSummary =
    "Reviewed Board and Brew official Toast menu row text: direct ingredient terms were mapped to app allergens; coffee/tea tasting notes were not treated as ingredients.";

  if (allergens.length === 0) {
    return {
      ...item,
      allergens: [],
      mayContain: [],
      allergenSourceType: "unavailable",
    };
  }

  return {
    ...item,
    allergens,
    mayContain: [],
    allergenSourceType: "official-ingredients",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls: Array.from(new Set([...(item.sourceUrls ?? []), "https://order.toasttab.com/online/the-board-and-brew"])),
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: "official-menu-ingredient-review",
        sourceUrl: "https://order.toasttab.com/online/the-board-and-brew",
        text: `Reviewed Board and Brew official menu row: ${item?.name ?? ""}${item?.description ? ` - ${item.description}` : ""}`,
      },
    ],
  };
}

const chefTonyReviewedRestaurantIds = new Set([
  "chef-tonys-rockville-dc-metro",
  "replacement-chef-tony-s-fresh-seafood-rockville-md",
]);

function isChefTonyReviewedRestaurant(restaurant) {
  return chefTonyReviewedRestaurantIds.has(String(restaurant?.id ?? ""));
}

function chefTonyReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`.toLowerCase();
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);

  const has = (pattern) => pattern.test(text);
  const hasGlutenFree = /\bgluten[-\s]?free\b|\bgf\b/.test(text);
  const hasNutFree = /\bno nuts?\b|\bnut[-\s]?free\b/.test(text);
  const pestoWithoutNuts = /\bpesto\b/.test(text) && /\bno nuts?\b/.test(text);

  if (
    has(/\b(?:crab|shrimp|lobster|scallops?|oysters?|mussels?|clams?|calamari|squid|soft\s*shell|shellfish|seafood)\b/)
  ) {
    allergens.add("shellfish");
  }

  if (has(/\b(?:salmon|cod|halibut|branzino|bronzino|snapper|rockfish|striped\s*bass|anchovies?|tuna|fish)\b/)) {
    allergens.add("fish");
  }

  if (
    has(
      /\b(?:cheese|cheddar|mozzarella|provolone|parmesan|romano|ricotta|fontina|goat\s*cheese|chevre|blue\s*cheese|brick\s*cheese|cream|creamy|butter|alfredo|bechamel|b[eé]chamel|ice\s*cream|whipped\s*cream|custard|cr[eè]me|br[uû]l[eé]e|milk|dairy|yogurt|cannoli)\b/,
    )
  ) {
    allergens.add("milk");
  }

  if (
    has(
      /\b(?:egg|eggs|omelette|omelet|aioli|mayo|mayonnaise|custard|frittata|french\s*toast|tira\s*misu|tiramisu|lady\s*fingers?|cannoli)\b/,
    )
  ) {
    allergens.add("egg");
  }

  if (!hasGlutenFree && has(/\b(?:pasta|penne|linguini|linguine|rigatoni|tortellini|angel\s*hair|lasagna|pizza|hemi|focaccia|bread|brioche|sourdough|flatbread|toast|waffle|french\s*toast|panko|breadcrumb|breadcrumbs|breaded|flour|fried\s+crispy|battered|cannoli|pastry|pie|cookie|cookies|tiramisu|lady\s*fingers?|croutons?|cake|burger|sandwich|paninni|panini|melt|tenders?)\b/)) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (
    !hasNutFree &&
    has(/\b(?:walnut|walnuts|almond|almonds|amaretto|pecan|pecans|pistachio|pistachios|hazelnut|hazelnuts|butter\s*pecan)\b/)
  ) {
    allergens.add("tree-nut");
  }

  if (!pestoWithoutNuts && has(/\bpesto\b/)) {
    allergens.add("tree-nut");
  }

  if (has(/\b(?:wine|marsala|prosecco|champagne)\b/)) {
    allergens.add("sulfites");
  }

  return Array.from(allergens).sort();
}

function repairChefTonyOfficialMenuItem(restaurant, item) {
  if (!isChefTonyReviewedRestaurant(restaurant)) {
    return item;
  }

  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`;
  let category = item.category;

  if (/^\[SOUP\]|\b(?:soup|gazpacho|bisque)\b/i.test(name)) {
    category = "Soups";
  } else if (/\b(?:salad|greens)\b/i.test(name)) {
    category = "Salads";
  } else if (/\b(?:cannoli|tira\s*misu|tiramisu|cr[eè]me br[uû]l[eé]e|ice cream|strawberries|dessert|waffle|french toast|pie|cookie|pudding)\b/i.test(text)) {
    category = "Desserts";
  } else if (/^\[FM\]|\bfamill?y meal|\bfamily meal/i.test(text)) {
    category = "Family Meals";
  } else if (/\b(?:pizza|hemi|detroiter|pepperoni)\b/i.test(text)) {
    category = "Pizza";
  } else if (/\b(?:crab|clam|cod|fish|seafood|shrimp|mussels?|scallops?|lobster|soft shell|calamari|squid|halibut|salmon|snapper|branzino|bronzino|rockfish|bass|oysters?)\b/i.test(text)) {
    category = "Seafood";
  } else if (/\b(?:pasta|linguini|linguine|penne|picatta|marsala|parmesan|rigatoni|tortellini|alfredo|lasagna)\b/i.test(text)) {
    category = "Pastas";
  } else if (/\b(?:burger|sandwich|toast|brioche|paninni|panini|melt)\b/i.test(text)) {
    category = "Sandwiches";
  } else if (/\b(?:omelette|omelet|eggs|bacon|steak and eggs|chorizo)\b/i.test(text)) {
    category = "Brunch";
  } else if (/\b(?:filet satay|appetizer|dip|fries|side|zucchini|hummus|plantains|potatoes|pita)\b/i.test(text)) {
    category = "Appetizers";
  }

  const allergens = chefTonyReviewedOfficialAllergens(item);
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://order.toasttab.com/online/cheftonysrockville",
      "https://cheftonysseafood.com/menu/allergens/",
    ]),
  );
  const sourceSummary =
    "Reviewed Chef Tony official Toast/menu rows and dietary policy: item allergens are mapped from source-backed menu names/descriptions, while the policy page provides accommodation/cross-contact context rather than a full matrix.";
  const repaired = {
    ...item,
    category,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed Chef Tony official menu row: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };

  return repaired;
}

function redstoneReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`.toLowerCase();
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);
  const has = (pattern) => pattern.test(text);
  const hasRiceNoodles = /\brice\s+noodles?\b/.test(text);

  if (has(/\b(?:shrimp|crab|lobster|shellfish|calamari)\b/)) {
    allergens.add("shellfish");
  }

  if (has(/\b(?:salmon|ahi|tuna|fish|sea bass|walleye)\b/)) {
    allergens.add("fish");
  }

  if (
    !hasRiceNoodles &&
    has(
      /\b(?:cheese|cheesecake|cheddar|swiss|jack|monterey\s*jack|mozzarella|parmesan|grana\s*padano|blue\s*cheese|goat\s*cheese|cream|creamy|butter|buttermilk|custard|ice\s*cream|whipped\s*cream|milk|yogurt|hollandaise|ranch|fondue|mac(?:\s*(?:and|&|n)\s*cheese)?)\b/,
    )
  ) {
    allergens.add("milk");
  }

  if (has(/\b(?:egg|eggs|aioli|mayo|mayonnaise|custard|cheesecake|hollandaise|pancakes?|french\s*toast|omelets?)\b/)) {
    allergens.add("egg");
  }

  if (
    has(
      /\b(?:bread|brioche|baguette|sourdough|toast|bagel|challah|hoagie|bun|roll|wrap|tortilla|flatbread|croutons?|cornbread|pasta|pappardelle|linguine|noodles?|macaroni|mac(?:\s*(?:and|&|n)\s*cheese)?|pie|cake|cookie|brownie|cheesecake|pastr(?:y|ies)|waffles?|pancakes?|batter|battered|breaded|tempura|fried\s+(?:calamari|chicken)|egg\s*rolls?|wontons?|onion\s*rings?|strips?|tenders?)\b/,
    )
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (has(/\b(?:almond|almonds|walnut|walnuts|nuts?|mixed\s*nuts|coconut|hazelnut|pecans?)\b/)) {
    allergens.add("tree-nut");
  }

  if (has(/\b(?:peanuts?)\b/)) {
    allergens.add("peanut");
  }

  if (has(/\b(?:soy|tamari|teriyaki|miso|tofu|edamame)\b/)) {
    allergens.add("soy");
  }

  if (has(/\bsesame\b/)) {
    allergens.add("sesame");
  }

  if (has(/\b(?:mustard|dijon)\b/)) {
    allergens.add("mustard");
  }

  if (has(/\b(?:balsamic|vinaigrette|wine|champagne|brandy|r[aà]g[uù])\b/)) {
    allergens.add("sulfites");
  }

  return Array.from(allergens).sort();
}

function repairRedstoneOfficialMenuItem(restaurant, item) {
  if (restaurant?.id !== "redstone-american-grill-washington-dc-dc-metro") {
    return item;
  }

  const name = String(item?.name ?? "");
  let description = item.description;

  if (/^(?:before you order|entr[ée]es include)$/i.test(String(description ?? "").trim())) {
    description = undefined;
  }

  const allergens = redstoneReviewedOfficialAllergens({ ...item, description });
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://redstonegrill.com/food-menu",
      "https://tmt.spotapps.co/ordering-menu/?spot_id=782364",
    ]),
  );
  const sourceSummary =
    "Reviewed Redstone official website/SpotApps menu rows: item allergens are mapped from source-backed menu names and descriptions. This is official menu ingredient evidence, not a full allergen matrix.";
  const repaired = {
    ...item,
    description,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed Redstone official menu row: ${name}${description ? ` - ${description}` : ""}`,
      },
    ],
  };

  if (typeof description === "undefined") {
    delete repaired.description;
  }

  return repaired;
}

function texasDeBrazilReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`.toLowerCase();
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);
  const has = (pattern) => pattern.test(text);

  if (has(/\b(?:lobster|shellfish)\b/)) {
    allergens.add("shellfish");
  }

  if (has(/\b(?:anchov(?:y|ies))\b/)) {
    allergens.add("fish");
  }

  if (
    has(
      /\b(?:cheese|cheesecake|grana\s*padano|parmesan|cream|creamy|butter|buttermilk|blue\s*cheese|ranch|bisque|custard|mousse|whipped\s*cream|cream\s*cheese|au\s*gratin)\b/,
    )
  ) {
    allergens.add("milk");
  }

  if (has(/\b(?:egg|eggs|mayonnaise|mayo|custard|chess\s*pie|cake|cheesecake|mousse)\b/)) {
    allergens.add("egg");
  }

  if (
    has(
      /\b(?:couscous|croutons?|graham\s*cracker|lady\s*finger|cake|cheesecake|pie|mousse\s*cake|bread(?!s?$)|pasta)\b/,
    )
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (has(/\b(?:pecan|pecans|coconut|almond|almonds|walnut|walnuts)\b/)) {
    allergens.add("tree-nut");
  }

  if (has(/\b(?:balsamic|vinaigrette|vinegar|red\s*wine|wine)\b/)) {
    allergens.add("sulfites");
  }

  if (
    /\bbrazilian\s+cheese\s+breads?\b/.test(text) &&
    !/\b(?:couscous|croutons?|graham\s*cracker|lady\s*finger|cake|cheesecake|pie|mousse\s*cake|pasta)\b/.test(text)
  ) {
    allergens.delete("wheat");
    allergens.delete("gluten");
  }

  return Array.from(allergens).sort();
}

function repairTexasDeBrazilOfficialMenuItem(restaurant, item) {
  if (restaurant?.id !== "texas-de-brazil-fairfax-fairfax-va-dc-metro") {
    return item;
  }

  const name = String(item?.name ?? "");
  const allergens = texasDeBrazilReviewedOfficialAllergens(item);
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://texasdebrazil.com/menu/",
      "https://order.texasdebrazil.com/menu/texas-de-brazil-fairfax-2",
      "https://texasdebrazil.com/wp-content/uploads/2026/06/To-Go-Menu-612026.pdf",
    ]),
  );
  const sourceSummary =
    "Reviewed Texas de Brazil official website/Olo/PDF menu rows: item allergens are mapped from source-backed menu names and descriptions. The public Nutrition & Allergies link did not expose a parseable item matrix during review, so this is official menu ingredient evidence.";

  return {
    ...item,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed Texas de Brazil official menu row: ${name}${item.description ? ` - ${item.description}` : ""}`,
      },
    ],
  };
}

function burtonsReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`.toLowerCase();
  const isGlutenFree = /\b(?:gluten[-\s]?free|gf)\b/.test(text);
  const isBurtonsFirecrackerShrimp = /^gluten-free-firecracker-shrimp$|^firecracker-shrimp$/.test(id);
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);
  const has = (pattern) => pattern.test(text);

  if (has(/\b(?:shrimp|lobster|crab|clam|clams|calamari|shellfish)\b/)) {
    allergens.add("shellfish");
  }

  if (has(/\b(?:salmon|ahi|tuna|haddock|fish)\b/)) {
    allergens.add("fish");
  }

  if (
    has(
      /\b(?:cheese|cheddar|american\s+cheese|pepper\s+jack|truffled\s+cheese|blue\s+cheese|feta|parmesan|cream|creamy|butter|buttered|alfredo|milk|chowder|bisque|beurre\s+blanc|hollandaise|béarnaise|bearnaise|ranch|custard|ice\s*cream|cream\s*cheese|sausage\s+gravy|goat\s+cheese)\b/,
    )
  ) {
    allergens.add("milk");
  }

  if (has(/\b(?:egg|eggs|aioli|mayo|mayonnaise|hollandaise|béarnaise|bearnaise|frittata|frit\s*tata|french\s+toast|donuts?|chicken\s+fingers|tenders?)\b/)) {
    allergens.add("egg");
  }

  if (
    !isGlutenFree &&
    has(
      /\b(?:bread|roll|brioche|bun|ciabatta|challah|toast|english\s+muffin|pita|crisps?|tortilla|spring\s+rolls?|onion\s+strings?|panko|pasta|rotini|pappardelle|angel\s+hair|waffles?|donuts?|cake|cheesecake|pie|cobbler|crumble|graham|crusted|chicken\s+fingers|tenders?|haddock|calamari)\b/,
    )
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (
    !isGlutenFree &&
    !isBurtonsFirecrackerShrimp &&
    has(/\b(?:fried|crispy)\b/) &&
    has(/\b(?:calamari|haddock|fish|chicken\s+fingers|chicken\s+tenders|chicken\s+and\s+waffles)\b/)
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (has(/\b(?:almond|almonds|toasted\s+almonds|tree\s+nuts?|pesto)\b/) && !/\bpeanut[-\s]?free\b/.test(text)) {
    allergens.add("tree-nut");
  }

  if (has(/\b(?:sesame|togarashi)\b/)) {
    allergens.add("sesame");
  }

  if (has(/\b(?:soy|tamari|teriyaki|miso|tofu)\b/)) {
    allergens.add("soy");
  }

  if (has(/\b(?:mustard|whole-grain\s+mustard)\b/)) {
    allergens.add("mustard");
  }

  if (has(/\b(?:wine|cabernet|sherry|vinaigrette)\b/)) {
    allergens.add("sulfites");
  }

  if (isGlutenFree) {
    allergens.delete("wheat");
    allergens.delete("gluten");
  }

  return Array.from(allergens).sort();
}

function repairBurtonsOfficialMenuItem(restaurant, item) {
  if (restaurant?.id !== "burtons-grill-and-bar-washington-dc-dc-metro") {
    return item;
  }

  const name = String(item?.name ?? "");
  const allergens = burtonsReviewedOfficialAllergens(item);
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://burtonsgrill.com/menus/md/riverdale-park/all-day/",
      "https://burtonsgrill.com/menus/md/riverdale-park/brunch/",
      "https://burtonsgrill.com/about/allergy-commitment/",
    ]),
  );
  const sourceSummary =
    "Reviewed Burtons Grill official menu and allergy commitment pages: item allergens are mapped from source-backed menu names/descriptions while gluten-free menu variants suppress wheat/gluten unless explicitly named. This is official menu ingredient evidence, not a full public allergen matrix.";

  return {
    ...item,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed Burtons official menu row: ${name}${item.description ? ` - ${item.description}` : ""}`,
      },
    ],
  };
}

function chennaiHoppersReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const category = String(item?.category ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${category} ${name} ${description}`.toLowerCase();
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);
  const has = (pattern) => pattern.test(text);

  if (has(/\b(?:naan|roti|parotta|paroota|kulcha|bread|flat\s*bread|whole\s*wheat|wheat|puff\s+pastry)\b/)) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (
    has(
      /\b(?:milk|yogurt|yoghurt|curd|dahi|raitha|raita|paneer|cheese|cream|creamy|malai|ghee|clarified\s+butter|butter|condensed\s+milk|ice\s*cream|kulfi|palkova|halwa|custard|lassi|korma)\b/,
    )
  ) {
    allergens.add("milk");
  }

  if (has(/\b(?:egg|eggs|omelette|omelet)\b/)) {
    allergens.add("egg");
  }

  if (has(/\b(?:fish|tuna|tilapia|pomfret|sardines?|mackerel|king\s+fish|catch\s+of\s+the\s+day|meen|mahi|nethili|vanjaram)\b/)) {
    allergens.add("fish");
  }

  if (has(/\b(?:shrimp|prawn|prawns|jinga|yera)\b/)) {
    allergens.add("shellfish");
  }

  if (has(/\b(?:almond|almonds|badam|cashew|cashew\s+nut|nuts?|dry\s+fruits?)\b/)) {
    allergens.add("tree-nut");
  }

  if (has(/\b(?:sesame|ellu)\b/)) {
    allergens.add("sesame");
  }

  if (has(/\bmustard\b/)) {
    allergens.add("mustard");
  }

  return Array.from(allergens).sort();
}

function repairChennaiHoppersOfficialMenuItem(restaurant, item) {
  if (restaurant?.id !== "chennai-hoppers-indian-restaurant-gaithersburg-md-dc-metro") {
    return item;
  }

  const name = String(item?.name ?? "");
  const allergens = chennaiHoppersReviewedOfficialAllergens(item);
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://www.chennaihoppers.com/menu",
      "https://order.toasttab.com/online/chennai-hoppers",
    ]),
  );
  const sourceSummary =
    "Reviewed Chennai Hoppers official website/Toast menu rows: item allergens are mapped only from ingredient words present in the official item name or description. This is official menu ingredient evidence, not a full public allergen matrix.";

  return {
    ...item,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed Chennai Hoppers official menu row: ${name}${item.description ? ` - ${item.description}` : ""}`,
      },
    ],
  };
}

function silveradoReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`.toLowerCase();
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);
  const has = (pattern) => pattern.test(text);
  const hasCornTortillaOnly = /\bcorn\s+tortillas?\b/.test(text);

  if (has(/\b(?:fish|cod|salmon|tuna)\b/)) {
    allergens.add("fish");
  }

  if (has(/\b(?:shrimp|crab|lobster|calamari)\b/)) {
    allergens.add("shellfish");
  }

  if (
    has(
      /\b(?:cheese|cheddar|jack|monterey\s+jack|havarti|gouda|goat\s+cheese|blue\s+cheese|parmesan|reggiano|cream|creamy|butter|buttermilk|sour\s+cream|ice\s*cream|bisque|chowder|loaded\s+baked\s+potato|mashed\s+potatoes|bread\s+pudding|quesadilla)\b/,
    )
  ) {
    allergens.add("milk");
  }

  if (has(/\b(?:egg|eggs|deviled|mayo|mayonnaise|remoulade|aioli|meringue|chicken\s+fingers|chicken\s+tenders|fish\s+fingers)\b/)) {
    allergens.add("egg");
  }

  if (
    has(
      /\b(?:bread|roll|brioche|bun|italian\s+bread|ice\s+box\s+bread|pasta|penne|angel\s+hair|croutons?|beer|lager|ale|batter|battered|beer\s+batter|crumb\s+(?:fried|fired)|bread\s+pudding|apple\s+pie|pie|waffle|quesadilla|eggrolls?|chicken\s+fingers|chicken\s+tenders|fish\s+fingers|crab\s+cake|fritters?|fried\s+chicken|calamari)\b/,
    ) ||
    (has(/\btortillas?\b/) && !hasCornTortillaOnly && !/\btortilla\s+chips?\b/.test(text))
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (has(/\b(?:pecan|pecans|walnut|walnuts|pine\s+nuts?|macadamia|nuts?)\b/)) {
    allergens.add("tree-nut");
  }

  if (has(/\bsesame\b/)) {
    allergens.add("sesame");
  }

  if (has(/\b(?:mustard|pommery\s+mustard|honey\s+mustard)\b/)) {
    allergens.add("mustard");
  }

  if (has(/\b(?:soy|tamari|miso)\b/)) {
    allergens.add("soy");
  }

  return Array.from(allergens).sort();
}

function repairSilveradoOfficialMenuItem(restaurant, item) {
  if (restaurant?.id !== "silverado-annandale-va-dc-metro") {
    return item;
  }

  const name = String(item?.name ?? "");
  const allergens = silveradoReviewedOfficialAllergens(item);
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://www.silveradova.com/",
      "https://order.greatamericanrestaurants.com/menu/silverado",
      "https://order.greatamericanrestaurants.com/api/vendors/silverado",
    ]),
  );
  const sourceSummary =
    "Reviewed Silverado / Great American Restaurants official website and ordering menu rows: item allergens are mapped from ingredient words present in official item names/descriptions. This is official menu ingredient evidence, not a full public allergen matrix.";

  return {
    ...item,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed Silverado official menu row: ${name}${item.description ? ` - ${item.description}` : ""}`,
      },
    ],
  };
}

function perrysReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`.toLowerCase();
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);
  const has = (pattern) => pattern.test(text);

  if (
    has(
      /\b(?:fish|mackerel|madai|sea\s*bream|tuna|maguro|toro|salmon|harasu|yellowtail|hamachi|buri|hiramasa|white\s*fish|shiromi|grouper|eel|unagi|ikura|masago|tobiko|flying\s+fish|caviar|cod|suzuki|seabass|sea\s*bass|anchov(?:y|ies))\b/,
    )
  ) {
    allergens.add("fish");
  }

  if (has(/\b(?:shrimp|ebi|prawn|scallop|hotate|crab|kani|softshell|soft\s+shell|squid|ika|calamari|octopus|tako|uni|sea\s+urchin|clam|clams)\b/)) {
    allergens.add("shellfish");
  }

  if (has(/\b(?:cheese|cream\s+cheese|parmesan|cream|whipped|ice\s*cream|butter|brown\s+butter|cheesecake|tiramisu|carbonara|mac\s*&\s*cheese|grilled\s+cheese|milk\s+bread|focaccia)\b/)) {
    allergens.add("milk");
  }

  if (has(/\b(?:egg|eggs|scrambled\s*eggs?|omelet|omelette|tamago|uzura|mayo|mayonnaise|aioli|tartar|caesar|carbonara|meringue|french\s+toast|pancake|waffle|bread\s+pudding)\b/)) {
    allergens.add("egg");
  }

  if (
    has(
      /\b(?:focaccia|spring\s+rolls?|rolls?|bread|milk\s+bread|bun|burger|toast|french\s+toast|pancake|waffle|udon|yakisoba|tempura|tempura\s+flakes|katsu|fritter|fritters|fried\s+chicken|karaage|dumplings?|bread\s+pudding|cheesecake|tiramisu|tart|monaka|mac\s*&\s*cheese|grilled\s+cheese|crab\s+cake|rice\s+cracker)\b/,
    )
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (has(/\b(?:pistachio|pistachio\s+basil|pecan|pecans|walnut|walnuts|macadamia|nuts?|nut\b|almond|almonds)\b/)) {
    allergens.add("tree-nut");
  }

  if (has(/\b(?:sesame|tahini)\b/)) {
    allergens.add("sesame");
  }

  if (has(/\b(?:soy|tamari|miso|tofu|edamame|soy\s+paper|ponzu|eel\s+sauce|kabayaki)\b/)) {
    allergens.add("soy");
  }

  if (id === "breakfast-buffet-ayce") {
    for (const allergen of ["egg", "fish", "gluten", "milk", "soy", "tree-nut", "wheat"]) {
      allergens.add(allergen);
    }
  }

  return Array.from(allergens).sort();
}

function repairPerrysOfficialMenuItem(restaurant, item) {
  if (restaurant?.id !== "perry-s-restaurant-washington-dc-dc-metro") {
    return item;
  }

  const name = String(item?.name ?? "");
  const allergens = perrysReviewedOfficialAllergens(item);
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://www.perrysam.com/",
      "https://order.toasttab.com/online/perrys-1811-columbia-road-northwest",
      "https://www.perrysam.com/brunch",
      "https://www.perrysam.com/breakfast",
    ]),
  );
  const sourceSummary =
    "Reviewed Perry's official website, MenuPro, and Toast menu rows: item allergens are mapped from ingredient words present in official item names/descriptions, including Japanese seafood and sushi terms. This is official menu ingredient evidence, not a full public allergen matrix.";

  return {
    ...item,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed Perry's official menu row: ${name}${item.description ? ` - ${item.description}` : ""}`,
      },
    ],
  };
}

function stonesCoveReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`.toLowerCase();
  const allergens = new Set(Array.isArray(item?.allergens) ? item.allergens : []);
  const has = (pattern) => pattern.test(text);

  if (has(/\b(?:fish|cod|salmon|ahi|tuna)\b/)) {
    allergens.add("fish");
  }

  if (has(/\b(?:crab|lobster|shrimp|seafood|scallop|calamari|clam|clams|mussels?)\b/)) {
    allergens.add("shellfish");
  }

  if (
    has(
      /\b(?:cheese|cheddar|white\s+cheddar|parmesan|mozzarella|gruyere|bleu\s+cheese|blue\s+cheese|goat\s+cheese|feta|queso\s+fresco|cream|creamed|creamy|butter|buttermilk|biscuit|biscuits|gravy|grits|sour\s+cream|milk|cheesecake|mousse|chocolate\s+spread|nutella)\b/,
    )
  ) {
    allergens.add("milk");
  }

  if (has(/\b(?:egg|eggs|omelette|sunny\s+side|mayo|mayonnaise|aioli|caesar|ranch|pudding|cake|meatloaf|fritter|fritters)\b/)) {
    allergens.add("egg");
  }

  if (
    has(
      /\b(?:flatbread|flatbreads|flatbread\s+crackers?|crackers?|sliders?|roll|bun|ciabatta|bread|biscuit|biscuits|flour\s+tortillas?|panko|pasta|cavatappi|fritter|fritters|cake|carrot\s+cake|cheesecake|graham|s'mores|smores|cones?|waffle|pancakes?|corn[-\s]?bread|croutons?|hot\s+dogs?|chili\s+dawgs?)\b/,
    )
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  if (has(/\b(?:pecan|pecans|almond|almonds|hazelnut|nutella|nuts?|nutz)\b/)) {
    allergens.add("tree-nut");
  }

  if (has(/\b(?:peanut|peanut\s+butter)\b/)) {
    allergens.add("peanut");
  }

  if (has(/\b(?:sesame|black\s+sesame)\b/)) {
    allergens.add("sesame");
  }

  if (has(/\b(?:soy|tamari|tofu)\b/)) {
    allergens.add("soy");
  }

  if (has(/\b(?:mustard|cuban\s+mustard)\b/)) {
    allergens.add("mustard");
  }

  return Array.from(allergens).sort();
}

function repairStonesCoveOfficialMenuItem(restaurant, item) {
  if (restaurant?.id !== "stone-s-cove-kitbar-herndon-va-dc-metro") {
    return item;
  }

  const name = String(item?.name ?? "");
  const allergens = stonesCoveReviewedOfficialAllergens(item);
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://stonescove.com/menu",
      "https://order.toasttab.com/online/stones-cove-kitbar-2403-centreville-road",
    ]),
  );
  const sourceSummary =
    "Reviewed Stone's Cove official website and Toast menu rows: item allergens are mapped from ingredient words present in official item names/descriptions. This is official menu ingredient evidence, not a full public allergen matrix.";

  return {
    ...item,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed Stone's Cove official menu row: ${name}${item.description ? ` - ${item.description}` : ""}`,
      },
    ],
  };
}

function plantaReviewedOfficialAllergens(item) {
  const id = String(item?.id ?? "");
  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${id} ${name} ${description}`.toLowerCase();
  const allergens = new Set();
  const has = (pattern) => pattern.test(text);
  const isGlutenFreeMarked = /\bGF\b|gluten[-\s]?free/i.test(`${name} ${description}`);

  if (has(/\b(?:soy|tamari|miso|tofu|tempeh|edamame|hoisin|ponzu|unagi|gochujang|doubanjiang|furikake)\b/)) {
    allergens.add("soy");
  }

  if (has(/\b(?:sesame|tahini|gomae)\b/)) {
    allergens.add("sesame");
  }

  if (has(/\b(?:peanut|peanuts|peanut\s+sauce|peanut\s+butter)\b/)) {
    allergens.add("peanut");
  }

  if (has(/\b(?:cashew|cashews|walnut|walnuts|pine\s+nuts?|hazelnut|nutella|nuts?|nut\b|almond|almonds|pistachio|pumpkin\s+seeds?|super\s+seed)\b/)) {
    allergens.add("tree-nut");
  }

  if (
    !isGlutenFreeMarked &&
    has(
      /\b(?:sourdough|toast|flatbread|flatbreads|pizza|calzone|wraps?|bun|burger|sandwich|bao|baos|gyoza|wonton|wontons|noodles?|udon|ramen|pasta|orecchiette|spaghettini|rigatoni|kamut|quesadilla|flour\s+tortilla|french\s+toast|waffle|cornflakes?|granola|cookie|brownie|cake|cheesecake|graham|tart|pudding|crust|crispy\s+noodles?)\b/,
    )
  ) {
    allergens.add("wheat");
    allergens.add("gluten");
  }

  return Array.from(allergens).sort();
}

function repairPlantaOfficialMenuItem(restaurant, item) {
  if (!["planta-bethesda-bethesda-md-dc-metro", "replacement-planta-washington-dc-washington-dc"].includes(restaurant?.id)) {
    return item;
  }

  const name = String(item?.name ?? "");
  const allergens = plantaReviewedOfficialAllergens(item);
  const sourceUrls = Array.from(
    new Set([
      ...(item.sourceUrls ?? []),
      "https://www.plantarestaurants.com/bethesda-location/",
      "https://order.toasttab.com/online/planta-dc-4910-elm-street",
      "https://order.toasttab.com/online/planta-dc-llc-1200-new-hampshire-ave-nw",
    ]),
  );
  const sourceSummary =
    "Reviewed PLANTA official website, PDF, and Toast menu rows in vegan menu context: animal-derived terms such as ahi, crab, salmon, caviar, cheese, cream, and egg are treated as plant-based menu language unless the row explicitly says otherwise. Official ingredient allergens are mapped only from plant-relevant source text such as soy, sesame, peanuts, tree nuts, and wheat/gluten.";

  return {
    ...item,
    allergens,
    mayContain: Array.isArray(item.mayContain) ? item.mayContain : [],
    allergenSourceType: allergens.length ? "official-ingredients" : "unavailable",
    sourceKind: "official-menu-ingredient-review",
    sourceSummary,
    sourceType: "reviewed-official-menu-repair",
    sourceUrls,
    evidence: [
      {
        source: "manual-quality-review",
        sourceKind: allergens.length ? "official-menu-ingredient-review" : "official-menu-row-review",
        sourceUrl: sourceUrls[0],
        text: `Reviewed PLANTA vegan official menu row: ${name}${item.description ? ` - ${item.description}` : ""}`,
      },
    ],
  };
}

function normalizeReviewedLostDogCategory(restaurant, item) {
  if (restaurant?.id === "silver-bethesda-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = description;
    let nextName = name;

    if (/^lamb-meatballs-sharting-plate$/i.test(id) || /^Lamb Meatballs Sharting Plate$/i.test(name)) {
      nextName = "Lamb Meatballs Sharing Plate";
    }

    if (
      /^(?:Restaurant|Sharing Plates|Starters|Entrée Salads|Entrée Salads \+ Warm Grain Bowls|Entrées|Classic Entrées|Chef Ype's Entrées|Creekstone Burgers \+ Sandwiches|CreekStone Burgers \+ Sandwiches|Sliders \+ Sandwiches|Breakfast|All Day Brunch|All-Day Brunch|Omelets \+ Benedicts|Omelettes and Scramblers|Daily Brunch Sides|A La Carte|Desserts|Classic Hand-Spun Shakes|Kids|FRESH PRESSED JUICES|House-made sodas|Organic Teas|Sides to Share|Lighter Side|Specialty Toasts)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/^kids-/i.test(id) || /\bkids?\b/i.test(nameText)) {
        category = "Kids";
      } else if (
        /\b(?:cold brew|hot chocolate|fresh oj|juice|orange juice|apple juice|soda|ade|water|oatmilk|organic tea|tea)\b/i.test(
          text,
        )
      ) {
        category = "Beverages";
      } else if (/\b(?:shake|beignet|pie|brulee|brûlée|cake|tartlet|mousse|brownie|chunky monkey|cookies?\s*\+?\s*cream|grasshopper|mocha|peppermint patty)\b/i.test(text)) {
        category = "Desserts + Shakes";
      } else if (
        /\b(?:wings?|hummus|bruschetta|brussels sprouts|smashed potatoes|ciabatta|ricotta|street corn|tuna tartare|sharing plate|naan bread)\b/i.test(
          text,
        )
      ) {
        category = "Sharing Plates";
      } else if (
        /\b(?:pancake|french toast|eggs?\b|omelet|omelette|scrambler|benedict|burrito|huevos|breakfast|oatmeal|waffles?|challah|power breakfast|champion breakfast|sausage side|bacon side|home fries|turkey bacon)\b/i.test(
          text,
        )
      ) {
        category = "Breakfast + Brunch";
      } else if (/\b(?:burger|cheeseburger|slider|sandwich|blt|grilled cheese|croque madam)\b/i.test(text)) {
        category = "Burgers + Sandwiches";
      } else if (/\b(?:salad|bowl|poke|cobb|caesar|burrata bowl|veggie salad|slaw)\b/i.test(text)) {
        category = "Salads + Bowls";
      } else if (/\b(?:soup|chowder)\b/i.test(text)) {
        category = "Soups";
      } else if (
        /\b(?:side|fries|mash|spinach|potatoes|sausage|bacon|fruit bowl|kale slaw)\b/i.test(nameText)
      ) {
        category = "Sides";
      } else if (
        /\b(?:pot pie|steak|frites|branzino|salmon|asparagus|scallops?|lamb chops|ribeye|lobster|pasta|fried chicken|mac|crab cake|picatta|meatloaf|curry|tagine|shrimp \+ grits|fish \+ chips|penne|pappardelle)\b/i.test(
          text,
        )
      ) {
        category = "Entrées";
      } else {
        category = "Entrées";
      }
    }

    const hasReviewNote = /Reviewed Silver Bethesda menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextName === name && hasReviewNote
      ? item
      : {
          ...item,
          name: nextName,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Silver Bethesda menu cleanup: preserved source-backed official allergen rows, removed OCR/header boundary artifacts, and replaced the generic Restaurant bucket with reviewed menu sections.`,
        };
  }

  if (restaurant?.id === "osm-tasty-nook-12663327602") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (/^(?:Items|mexican;coffee_shop;breakfast|Breakfast|Beverages|Sides & Add-ons|Breakfast Plates|Burgers & Sandwiches|Salads|Latin Plates|Entrees|Sweet Breakfast|Catering)$/i.test(String(item.category ?? ""))) {
      if (/\b(?:capp?uccino|latte|espresso|coffee|milk shake|coconut water)\b/i.test(text)) {
        category = "Beverages";
      } else if (/\b(?:for 10 pp|10pp|10 pp)\b/i.test(nameText)) {
        category = "Catering";
      } else if (
        /\b(?:tacos?|pupusas?|tamales?|burrito|quesadilla|carne asada|lomo saltado|ropa vieja|pastelitos|rice and beans|pulled chicken|taco salad|shrimp bowl|beef bowl|chicken bowl|huevos rancheros)\b/i.test(
          text,
        )
      ) {
        category = "Latin Plates";
      } else if (/\b(?:salad|nicoise|ceasar|caesar|cobb)\b/i.test(nameText)) {
        category = "Salads";
      } else if (
        /\b(?:pancakes?|waffles?|french toast|crepes?|nutella|butterscotch|blue berry|blueberry|strawberry|pecan|banana|reese|mango|peach)\b/i.test(
          text,
        ) &&
        !/\b(?:chicken crepe|western crepe|burrito crepe|ham & cheese crepe)\b/i.test(text)
      ) {
        category = "Sweet Breakfast";
      } else if (
        /\b(?:omelet|omelette|omlt|eggs?\b|benedict|breakfast|migas|hash|bacon and eggs|sausage and eggs|tipico|platter|avocado toast|bagel|english muffin|toast)\b/i.test(
          text,
        )
      ) {
        category = "Breakfast Plates";
      } else if (
        /\b(?:burger|sandwich|wrap|blt|sub\b|torta|gyro|tuna melt|philly|club)\b/i.test(text)
      ) {
        category = "Burgers & Sandwiches";
      } else if (
        /\b(?:alfredo|pasta|parmesan|picatta|picata|teriyaki|salmon|mustard chicken|grilled chicken breast|chow mein|wings?|crab cake|chicken and waffle|chicken avocado|chicken california)\b/i.test(
          text,
        )
      ) {
        category = "Entrees";
      } else if (/\b(?:salad|nicoise|ceasar|caesar|cobb)\b/i.test(text)) {
        category = "Salads";
      } else if (
        /\b(?:side|bacon|sausage|cheese$|avocado$|vegetable|rice and beans|toast|english muffin|bagel|cream cheese)\b/i.test(
          nameText,
        )
      ) {
        category = "Sides & Add-ons";
      } else {
        category = "Entrees";
      }
    }

    const hasReviewNote = /Reviewed Tasty Nook Cafe menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && hasReviewNote
      ? item
      : {
          ...item,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Tasty Nook Cafe menu cleanup: kept Wix/API food rows, removed section-header rows, and replaced collapsed Items/cuisine buckets with reviewed breakfast, sandwich, Latin plate, entree, side, catering, and beverage sections.`,
        };
  }

  if (restaurant?.id === "clydes-gallery-place-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = description;

    if (
      /^(?:American|Dessert|Raw Bar Platters\*|Starters|Just Steps From Capital One Arena!|Breakfast|Burgers & Sandwiches|Desserts|Entrees|Raw Bar & Seafood|Salads|Sandwiches|Sides|Soups|Starters & Snacks)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/^kid\b|\bkids?\b/i.test(nameText)) {
        category = "Kids";
      } else if (/\b(?:soup|chowder|stew)\b/i.test(text)) {
        category = "Soups";
      } else if (/\b(?:salad|cobb|caesar|greens|beets)\b/i.test(nameText)) {
        category = "Salads";
      } else if (
        /\b(?:oyster|oysters|shrimp|crab|scallops?|mussels?|clam|calamari|cod|catfish|salmon|trout|fish|seafood|raw bar|mermaid|nessie|selkie|triton|crisfield|fra diavolo)\b/i.test(
          text,
        )
      ) {
        category = "Raw Bar & Seafood";
      } else if (
        /\b(?:cheesecake|(?<!crab )cake|pie|pudding|sundae|torte|tres leches|red velvet|s'?mores|dessert|bread pudding)\b/i.test(
          text,
        )
      ) {
        category = "Desserts";
      } else if (
        /\b(?:breakfast|brunch|eggs?\b|benedict|french toast|burrito|challah|steak & eggs)\b/i.test(text)
      ) {
        category = "Breakfast & Brunch";
      } else if (
        /\b(?:burger|cheeseburger|sandwich|reuben|patty melt|brisket|turkey & avocado|roast turkey|walter'?s favorite|blt|chicken #1)\b/i.test(
          text,
        )
      ) {
        category = "Burgers & Sandwiches";
      } else if (
        /\b(?:wings?|eggrolls?|deviled eggs|hummus|dip|pretzel|pigs in a blanket|zucchini chips|fried green tomatoes|brussels sprouts|spreads & bread|rockefeller)\b/i.test(
          text,
        )
      ) {
        category = "Starters & Snacks";
      } else if (
        /\b(?:green beans|asparagus|tater tots|cauliflower|side|beans)\b/i.test(nameText)
      ) {
        category = "Sides";
      } else {
        category = "Entrees";
      }
    }

    const hasReviewNote = /Reviewed Clyde's Gallery Place menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && hasReviewNote
      ? item
      : {
          ...item,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Clyde's Gallery Place menu cleanup: kept source-backed menu rows, removed PDF/FAQ/beverage/modifier artifacts, and replaced the generic American bucket with reviewed brunch, seafood, sandwich, entree, salad, starter, side, kids, soup, and dessert sections.`,
        };
  }

  if (restaurant?.id === "crumbl") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (
      /^(?:Menu|Cookie|Pickup|Single|12 Pack|4 Pack|6 Pack|Large Cookies|Carlota De Limon Icebox Cake|Chocolate Peanut Butter Brownie Ft Reeses Pieces|Chocolate Peanut Butter Pie Ft Oreo X Reeses|Chocolate Peanut Butter Sandwich Cookie Ft Oreo X Reeses|Chocolate Reeses Pieces Cookie|Chocolate Toffee Cake)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/\b(?:12-pack|4-pack|6-pack|single dessert|pack dessert|catering)\b/i.test(text)) {
        category = "Packs & Ordering";
      } else if (/\b(?:cheesecake|pie|banoffee|key lime|cream pie|biscoff.*pie)\b/i.test(text)) {
        category = "Cheesecakes & Pies";
      } else if (/\b(?:brownie|brookie|blondie|krispies|bar|dippers)\b/i.test(text)) {
        category = "Brownies & Bars";
      } else if (/\b(?:cake|trifle|tres leches|pudding|banana bread|muffin|scone|icebox cake|torte)\b/i.test(text)) {
        category = "Cakes & Specialty Desserts";
      } else if (/\bcookie|cookies\b/i.test(text)) {
        category = "Cookies";
      } else {
        category = "Desserts";
      }
    }

    const hasReviewNote = /Reviewed Crumbl menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && hasReviewNote
      ? item
      : {
          ...item,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Crumbl menu cleanup: preserved official product allergen disclosures, removed marketing/placeholder product rows, and grouped profile pages into stable dessert sections instead of generic Menu categories.`,
        };
  }

  if (restaurant?.id === "spacebar-falls-church-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (/^(?:Restaurant|Items|Menu|Menu 1|Grilled Cheese & Melts|Salads|Sandwiches|Sides & Snacks|Soups|Totchos)$/i.test(String(item.category ?? ""))) {
      if (/\btotchos?\b/i.test(text)) {
        category = "Totchos";
      } else if (/\bsalad\b/i.test(text)) {
        category = "Salads";
      } else if (/\btomato soup\b|\bsoup\b/i.test(text)) {
        category = "Soups";
      } else if (/\btater tots?\b|\btots\b/i.test(text)) {
        category = "Sides & Snacks";
      } else if (/\b(?:grilled cheese|melt)\b/i.test(text)) {
        category = "Grilled Cheese & Melts";
      } else {
        category = "Sandwiches";
      }
    }

    const hasReviewNote = /Reviewed Spacebar menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && hasReviewNote
      ? item
      : {
          ...item,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Spacebar menu cleanup: suppressed rotating beer/cider/wine inventory rows from the Square feed and categorized the remaining source-backed food menu rows.`,
        };
  }

  if (restaurant?.id === "pleroma-cuisine-laurel-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (/^(?:Restaurant|Items|Menu|Menu 1|African Classics|Beverages|Catering & Party Trays|Desserts|Grilled Meats & Proteins|Rice & Combos|Seafood|Sides & Vegetables|Small Chops & Snacks|Soups & Stews)$/i.test(String(item.category ?? ""))) {
      if (/\b(?:corporate lunch box|minimum order|party sizes|quarter pan|thanksgiving special|mother'?s day brunch buffet|skewers?\b.*minimum order)\b/i.test(text)) {
        category = "Catering & Party Trays";
      } else if (/\b(?:zobo drink|juice|ginger drink)\b/i.test(text)) {
        category = "Beverages";
      } else if (/\b(?:fufu|plantain|beans|white rice|spinach|salad|vegetable|veggies|bobolo|kwakoko|moi moi|moi-moi|ekwang|cocoyam|cassava|yam|coleslaw)\b/i.test(`${id} ${name}`)) {
        category = "Sides & Vegetables";
      } else if (/\b(?:cake|doughnut|donut|crepe|macaron|puff puff|puff\b|red velvet|chocolate filling)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:samosa|spring roll|egg roll|shrimp roll|meat pie|scotch(?:ed)? eggs?|cheese sticks|chicken tenders|fish sticks|small chops|finger foods)\b/i.test(text)) {
        category = "Small Chops & Snacks";
      } else if (/\b(?:seafood|shrimp|prawn|catfish|fish|croaker|snapper|mackerel|pompano|tilapia|salmon|crab|lobster|mussel|oyster|fisher)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:soup|stew|okro|okra|egusi|efo|eru|ndole|ogbono|oha|bitter leaf|cassava leaf|pepper soup|hot pot|ofada|ayamase|buka|abula|achu|mbongo|peanut butter soup|ata soup)\b/i.test(text)) {
        category = "Soups & Stews";
      } else if (/\b(?:jollof|jellof|fried rice|waakye|rice bowl|burrito|spaghetti|asaro|yam porridge|poulet d\.?g|gizzard dodo)\b/i.test(text)) {
        category = "Rice & Combos";
      } else if (/\b(?:beef|goat|chicken|turkey|lamb|oxtail|suya|kebab|gizzard|ponmo|cow skin|snail|isiewu|hen)\b/i.test(text)) {
        category = "Grilled Meats & Proteins";
      } else if (/\b(?:fufu|plantain|beans|white rice|spinach|salad|vegetable|veggies|bobolo|kwakoko|moi moi|moi-moi|ekwang|cocoyam|cassava|yam|coleslaw)\b/i.test(text)) {
        category = "Sides & Vegetables";
      } else {
        category = "African Classics";
      }
    }

    const hasReviewNote = /Reviewed Pleroma Cuisine menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && hasReviewNote
      ? item
      : {
          ...item,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Pleroma Cuisine menu cleanup: kept Square product rows, removed reservation/service artifacts, and replaced the generic Restaurant bucket with reviewed African menu sections while preserving source-backed item descriptions.`,
        };
  }

  if (restaurant?.id === "replacement-the-organic-butcher-mclean-va") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nextDescription = description
      .replace(/\s*Marinade Options \(Please Specify\)[\s\S]*$/i, "")
      .trim();
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${nextDescription}`;
    let category = item.category;

    if (
      /^(?:Restaurant|Meat & Poultry|Seafood|Prepared Foods|Dairy & Cheese|Produce|Pantry|Beverages|Sauces & Condiments)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/\b(?:wine|loire|merlot|soave|musar|pet nat|pet-nat|soif|toscano|beer|falcon smash|casamara club|drinking chocolate|water sea moss)\b/i.test(nameText)) {
        category = "Beverages";
      } else if (
        /\b(?:salmon|cod|halibut|trout|bass|whitefish|pike|oyster|oysters|shrimp|crab|lobster|langoustine|urchin|roe|seafood)\b/i.test(
          nameText,
        )
      ) {
        category = "Seafood";
      } else if (
        /\b(?:cheese|cheddar|burrata|butter|pimento cheese|cream cheese|gouda|provolone|beurre|trickling springs)\b/i.test(
          nameText,
        )
      ) {
        category = "Dairy & Cheese";
      } else if (
        /\b(?:apple|apples|asparagus|beets|broccolette|brussels|carrots|cauliflorini|clementines|cucumbers|dill|figs|kale|oranges|pear|persimmon|potatoes|radish|romaine|sage|satsumas|squash|strawberries|zucchini|vegetable|vegetables)\b/i.test(
          nameText,
        )
      ) {
        category = "Produce";
      } else if (
        /\b(?:broth|creamed spinach|potatoes au gratin|empanada|meatballs|pot pie|chili|ragu|hummus|dip|pate|pâté|prepared|cooked cocktail shrimp|smoked salmon dip)\b/i.test(
          nameText,
        )
      ) {
        category = "Prepared Foods";
      } else if (
        /\b(?:mayo|sauce|ketchup|rub|harissa|sriracha|miso|honey|syrup|coconut milk|cookie butter|marmalade|jam|maple|coconut sugar|champurrado|marinade|spice|spicy malay)\b/i.test(
          nameText,
        )
      ) {
        category = "Sauces & Condiments";
      } else if (
        /\b(?:pasta|elbows|penne|chips|mallows|gingerbread|cookie|cake|cashew butter|almond cookie|pantry|tallow|sea moss)\b/i.test(
          nameText,
        )
      ) {
        category = "Pantry";
      } else {
        category = "Meat & Poultry";
      }
    }

    const hasReviewNote = /Reviewed The Organic Butcher product cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextDescription === description && hasReviewNote
      ? item
      : {
          ...item,
          category,
          description: nextDescription || item.description,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed The Organic Butcher product cleanup: kept Square product rows and replaced the generic Restaurant bucket with retail product sections while preserving source-backed ingredient evidence.`,
        };
  }

  if (restaurant?.id === "open-city-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (
      /^(?:American|Breakfast|Bakery|Beverages|Pizza|Burgers & Sandwiches|Bowls & Entrees|Salads|Sides|Starters)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/\b(?:americano|espresso|cappuccino|coffee|cold brew|latte|frappe|chai|tea|matcha|mocha|macchiato|cortado|flat white|red eye|hot chocolate|golden milk|milk steamer|mango lassi|rooibos|london fog|persian nectar|fiji green|dragon|earl grey|chamomile|mint tea)\b/i.test(text)) {
        category = "Beverages";
      } else if (/\b(?:hummus plate|house wings|pickle chips|bang bang shrimp)\b/i.test(text)) {
        category = "Starters";
      } else if (/\b(?:sandwich|burger|blt|wrap|reuben|grilled cheese|pita wrap|hummus bagel|open city burger|short rib)\b/i.test(text)) {
        category = "Burgers & Sandwiches";
      } else if (/\b(?:pancake|pancakes|waffle|waffles|french toast|omelet|scramble|huevos|breakfast|avocado toast|bacon|sausage|hash brown|hashbrown|egg and cheese)\b/i.test(text)) {
        category = "Breakfast";
      } else if (/\b(?:muffin|croissant|cookie|brownie|cinnamon roll|danish|pastelito|loaf|pie|macaroon|granola|bread|biscuit)\b/i.test(text)) {
        category = "Bakery";
      } else if (/\b(?:pizza|margherita|hawaiian|bbq chicken|chicken pesto)\b/i.test(text)) {
        category = "Pizza";
      } else if (/\b(?:salad|caesar|greek pasta)\b/i.test(text)) {
        category = "Salads";
      } else if (/\b(?:side|cup of yogurt|fresh fruit|toast|fries|rice|asparagus|hot honey carrots|white bean puree|shrimp side|smoked salmon)\b/i.test(nameText)) {
        category = "Sides";
      } else {
        category = "Bowls & Entrees";
      }
    }

    const hasReviewNote = /Reviewed Open City menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && hasReviewNote
      ? item
      : {
          ...item,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Open City menu cleanup: removed section/header artifacts and rebuilt collapsed Toast menu sections from item names and descriptions.`,
        };
  }

  if (restaurant?.id === "el-patio-randolph-rockville-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (
      /^(?:Items|Bakery|Side|Sandwiches|Salads|Desserts|Thanksgivingmenu|Empanadas|Grill & Steaks|Milanesas|Pasta|Bakery & Pastries|Catering & Party Trays|Seafood|Beverages|Sides|Soups & Stews)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/\b(?:juice|juices|coffee|tea|mate|soda|gaseosa|bottled sodas|canned sodas|malbec|torrontes|blend|quilmes|corona|modelo|heineken)\b/i.test(text)) {
        category = "Beverages";
      } else if (/\b(?:cake|torta|alfajor|alfajores|bud[ií]n|chaja|chajá|chocotorta|pionono|pastel|pastry|pastries|factura|facturas|medialuna|croissant|dulce|flan|panqueque|crepe|cheese cake|cheesecake|helada|ice cream|tiramisu|rogel|ricotta pie|cannoli|canoncito|cañoncito|milhojas)\b/i.test(text)) {
        category = "Bakery & Pastries";
      } else if (/\b(?:empanada|empanadas|saltena|salteña)\b/i.test(text)) {
        category = "Empanadas";
      } else if (/\b(?:milanesa|suprema)\b/i.test(text)) {
        category = "Milanesas";
      } else if (/\b(?:fettuccini|fetuccini|canelones|cannelloni|raviol|lasagna|pasta|ñoqui|gnocchi|noodle|guiso)\b/i.test(text)) {
        category = "Pasta";
      } else if (/\b(?:salad|ensalada|rusa|quinoa salad)\b/i.test(nameText)) {
        category = "Salads";
      } else if (/\b(?:soup|sopa|locro|stew|lentil|garbanzo)\b/i.test(text)) {
        category = "Soups & Stews";
      } else if (
        /\b(?:sandwich|choripan|hamburger|hamburguesa|chivito|lomito|baguette|tea sandwich|tostado)\b/i.test(
          text,
        ) &&
        !/\bchivito\s+al\s+plato\b/i.test(text)
      ) {
        category = "Sandwiches";
      } else if (/\b(?:calamar|calamares|rabas|camarones|shrimp|salmon|fish|tilapia|tuna|atun|atún)\b/i.test(text)) {
        category = "Seafood";
      } else if (
        /\b(?:parrillada|bife|churrasco|entraña|entrana|ribeye|steak|costeleta|asado|chorizo|morcilla|chinchulin|chinchulines|tenderloin|bbq|grill|kabob|brochette|pollo salteado|carne salteada)\b/i.test(
          text,
        )
      ) {
        category = "Grill & Steaks";
      } else if (
        /\b(?:tray|fuente|x 20|serves|dozen|units|party|family meal|mini postres|bocaditos|albondiguitas|huevos rellenos|croquetitas)\b/i.test(
          text,
        )
      ) {
        category = "Catering & Party Trays";
      } else if (
        /\b(?:chimichurri|sauce|side|papas|fries|rice|arroz|mashed potatoes|yuca|vegetable medley|vegetales|tostones|batata frita|papa frita|pur[eé] de papas)\b/i.test(
          nameText,
        )
      ) {
        category = "Sides";
      } else {
        category = "Entrees";
      }
    }

    const hasReviewNote = /Reviewed El Patio menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && hasReviewNote
      ? item
      : {
          ...item,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed El Patio menu cleanup: removed website/template/header artifacts and rebuilt collapsed Toast/Wix/PDF sections from item names and descriptions.`,
        };
  }

  if (restaurant?.id === "osm-red-hot-blue-1448579525") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = description
      .replace(/\s*Add a Garden or Caesar Side Salad to your meal!?\s*\(found in the Salad Menu\)\.?/gi, "")
      .replace(/\s*\(Add cheese \+ \$\)\s*/gi, " ")
      .replace(/\s*Like your sandwich (?:piled|topped) with Cole Slaw\?\s*\.{0,3}\s*ask for Memphis-style\.?/gi, "")
      .replace(/\s*Like your sandwich piled with Cole Slaw\?\s*…\s*ask for Memphis-style\.?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (
      /^(?:american|Bbq Plates|Favorites|Ribs & Combos|Rub & Sauces|Southern Sides|Sweets|Menu|Restaurant|Items)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/\b(?:dr\.?\s*pepper|iced tea|sweet tea|golden peak|fountain|beverage|drink)\b/i.test(text)) {
        category = "Beverages";
      } else if (/\b(?:banana pudding|cobbler|key lime pie|pecan pie|brownie|dessert|sundae)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:gallon|quart|pint|tray|40 wings|1lb|1 lb|1\/2 lb|12 lb|bulk|serves)\b/i.test(text)) {
        category = "Catering & Bulk";
      } else if (/\b(?:nachos|pickles|onion basket|wings|crispers|tenders)\b/i.test(nameText)) {
        category = "Starters";
      } else if (/\b(?:catfish|shrimp|salmon|seafood)\b/i.test(nameText)) {
        category = "Seafood";
      } else if (/\b(?:kid|mini corn dogs|love me tenders)\b/i.test(text)) {
        category = "Kids";
      } else if (/\b(?:sandwich|burger|crispwich|ribwich)\b/i.test(text)) {
        category = "Sandwiches & Burgers";
      } else if (/\b(?:ribs|brisket|pulled pork|pulled chicken|smoked turkey|smoked sausage|whole smoker|two-timer|tennessee triple|half chicken|burnt ends|bbq plate|plate)\b/i.test(nameText)) {
        category = "BBQ Plates & Ribs";
      } else if (/\b(?:sauce|rub|mojo|molasses|hickory bacon)\b/i.test(text)) {
        category = "Sauces";
      } else if (/\b(?:chili|stew|gumbo)\b/i.test(nameText)) {
        category = "Soups & Stews";
      } else if (/\b(?:salad|coleslaw|cole slaw)\b/i.test(nameText) && !/\b(?:gallon|quart|pint)\b/i.test(nameText)) {
        category = "Salads";
      } else if (/\b(?:beans|greens|fries|potato|mac|cheese|vegetable|hushpuppies|sidecar|collard|slaw)\b/i.test(text)) {
        category = "Southern Sides";
      } else {
        category = "BBQ Plates & Ribs";
      }
    }

    const hasReviewNote = /Reviewed Red, Hot & Blue menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextDescription === description && hasReviewNote
      ? item
      : {
          ...item,
          category,
          description: nextDescription || undefined,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Red, Hot & Blue menu cleanup: removed section/page-heading rows and rebuilt collapsed BBQ menu categories from source-backed item names and descriptions.`,
        };
  }

  if (restaurant?.id === "replacement-nova-europa-restaurant-silver-spring-md") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = description
      .replace(/\s+80$/i, "")
      .replace(/^eal\b/i, "Veal")
      .trim();
    let nextName = name.replace(/\bceasar\b/gi, "Caesar").replace(/\bfettucini\b/gi, "Fettuccini").trim();

    if (/^(?:Restaurant|Items|Menu|american)$/i.test(String(item.category ?? ""))) {
      if (/\b(?:coffee|tea|espresso|cappuccino|irish coffee)\b/i.test(nameText)) {
        category = "Beverages";
      } else if (/\b(?:cake|cheese cake|cheesecake|pie|baked alaska|limoncello|dessert)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:caldo verde|soup|stew|sopa)\b/i.test(nameText)) {
        category = "Soups";
      } else if (/\b(?:salad|caesar)\b/i.test(nameText)) {
        category = "Salads";
      } else if (/\b(?:ravioli|linguine|linguini|fettuccini|alfredo|manicotti|pasta|capellini)\b/i.test(nameText)) {
        category = "Pasta";
      } else if (/\b(?:calamari|cod|bacalhau|shrimp|scallop|clam|mussel|cockle|lobster|sole|fish|salmon|sardine|seafood|trout|tuna|vongale|frutos do mar|gambas)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:chicken|francesa|marsala|parmigiana|picata)\b/i.test(nameText) && !/\bsalad\b/i.test(nameText)) {
        category = "Chicken";
      } else if (/\b(?:veal)\b/i.test(nameText)) {
        category = "Veal";
      } else if (/\b(?:filet mignon|rib eye|steak|lamb|pork chop|rack of lamb|surf and turf|brochette)\b/i.test(nameText)) {
        category = "Steaks & Chops";
      } else if (/\b(?:side|rice|vegetable plate|potato|mushroom caps|portebello)\b/i.test(nameText)) {
        category = "Sides";
      } else if (/\b(?:for 4|\(4\)|whole .*pie|14 slices|24 hour advance)\b/i.test(text)) {
        category = "Family Meals & Catering";
      } else if (/\b(?:brie|chourico|escargot|sausage flambe|cocktail|assado)\b/i.test(nameText)) {
        category = "Starters";
      } else {
        category = "Entrees";
      }
    }

    const hasReviewNote = /Reviewed Nova Europa menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextDescription === description && nextName === name && hasReviewNote
      ? item
      : {
          ...item,
          name: nextName,
          category,
          description: nextDescription || undefined,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Nova Europa menu cleanup: removed description-fragment rows and rebuilt collapsed Portuguese/continental menu sections from source-backed item names and descriptions.`,
        };
  }

  if (restaurant?.id === "osm-cuates-12207964801") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextName = name
      .replace(/\bCOFEE\b/gi, "Coffee")
      .replace(/\bEXPRESSO\b/gi, "Espresso")
      .replace(/\bVEGATABLES\b/gi, "Vegetables")
      .replace(/\bCONBINATIONS\b/gi, "Combinations")
      .replace(/\bRECOMENDATIONS\b/gi, "Recommendations")
      .replace(/\bLUNC\b/gi, "Lunch")
      .replace(/\bLUNCHTACOS\b/gi, "Lunch Tacos")
      .trim();
    let nextDescription = description.replace(/\bRomain lettuce\b/gi, "Romaine lettuce").replace(/\bsheered cheese\b/gi, "shredded cheese").trim();

    if (/^(?:Items|mexican|Restaurant|Menu)$/i.test(String(item.category ?? ""))) {
      if (/\b(?:margarita|margaritas|pina colada|perrier|fanta|coffee|cofee|tea|hot chocolate|espresso)\b/i.test(nameText)) {
        category = "Beverages";
      } else if (/\b(?:cheesecake|cajeta|churros|flan|fried ice cream|sopaipillas|tres leches|tamalito dulce|cake|fruit tray|ensalada de frutas)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:sopa|pozole|casuela de mariscos|seafood broth)\b/i.test(text)) {
        category = "Soups";
      } else if (/\b(?:salad|ensalada)\b/i.test(nameText)) {
        category = "Salads";
      } else if (/\b(?:kid|taquito)\b/i.test(nameText)) {
        category = "Kids";
      } else if (/\b(?:tray|for 4|up to ten people)\b/i.test(text)) {
        category = "Catering & Trays";
      } else if (/\b(?:s\/o|side|rice|beans|guacamole|pico|vegetables|vegetales|flour tortillas|mole sauce|french fries|salad)\b/i.test(nameText)) {
        category = "Sides";
      } else if (/\b(?:fajita|fajitas|parillada|arracheras|grilled steak|new york steak|lomo saltado|saltado|pollo saltado|pollo encebollado|pechuga de pollo|bbq pork ribs|steak and|chicken and|ribs and)\b/i.test(nameText)) {
        category = "Fajitas & Grilled Plates";
      } else if (/\b(?:camarones|camaron|shrimp|mariscos|ceviche|mojarra|salmon|seafood|fish|tilapia|scallop|squid|mussels|clams|tostada de camaron)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:huevo|huevos|omelet|steak&eggs|brunch)\b/i.test(nameText)) {
        category = "Breakfast & Brunch";
      } else if (/\b(?:burrito|chimichanga|enchilada|enmolada)\b/i.test(nameText)) {
        category = "Burritos & Enchiladas";
      } else if (/\b(?:taco|tacos|tostada|flautas|tamales|tamales de pollo)\b/i.test(nameText)) {
        category = "Tacos & Tamales";
      } else if (/\b(?:nacho|quesadilla|guacamole|queso|empanadas|platanos|yuca|chicharron|chile relleno)\b/i.test(nameText)) {
        category = "Starters";
      } else {
        category = "Entrees";
      }
    }

    const hasReviewNote = /Reviewed Cuates Grill menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextDescription === description && nextName === name && hasReviewNote
      ? item
      : {
          ...item,
          name: nextName,
          category,
          description: nextDescription || undefined,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Cuates Grill menu cleanup: removed source section/header rows and rebuilt collapsed Mexican menu sections from source-backed item names and descriptions.`,
        };
  }

  if (restaurant?.id === "osm-urbano-9821308296") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextName = name
      .replace(/\s*\/\s*$/g, "")
      .replace(/\bRIBYE\b/gi, "Ribeye")
      .replace(/\bTexas Chilli\b/gi, "Texas Chili")
      .replace(/\bblakc olives\b/gi, "black olives")
      .trim();
    let nextDescription = description
      .replace(/\s+MEZCAL MARINATED RIBEYE\*?\s*\/.*$/i, "")
      .replace(/\s+GRILLED OCTOPUS \/.*$/i, "")
      .replace(/\s+GRILLED SWORDFISH \/.*$/i, "")
      .replace(/\s+TEXAS CHILI \/.*$/i, "")
      .replace(/\s+POZOLE \/.*$/i, "")
      .replace(/\s+\*Includes your choice of 64oz sangria, margarita or 2 bottles of wine\*$/i, "")
      .replace(/\bblakc olives\b/gi, "black olives")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (/^(?:mexican|Items|Restaurant|Menu)$/i.test(String(item.category ?? ""))) {
      if (/\b(?:sangria|rita|ritas|margarita|margaritas|wine|top shelf)\b/i.test(nameText)) {
        category = "Beverages";
      } else if (/\b(?:tres leches|flan|churro|cake fee|dessert)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:soup|pozole|texas chili|texas chilli)\b/i.test(nameText)) {
        category = "Soups";
      } else if (/\b(?:salad)\b/i.test(nameText)) {
        category = "Salads";
      } else if (/\b(?:kids|kid)\b/i.test(nameText)) {
        category = "Kids";
      } else if (/\b(?:side|rice|beans|shredded cheese|egg side|mac and cheese|fries|guacamole|salsa|creamy cilantro rice)\b/i.test(nameText)) {
        category = "Sides";
      } else if (/\b(?:fiesta|for 4|4 guests|6 guests|appetizers for 4)\b/i.test(text)) {
        category = "Family Meals";
      } else if (/\b(?:taco|tacos|torta|tortas|taquito|taquitos|tostada|birria)\b/i.test(nameText)) {
        category = "Tacos & Tortas";
      } else if (/\b(?:burrito|chimi|chimichanga|enchilada|enchiladas)\b/i.test(nameText)) {
        category = "Burritos & Enchiladas";
      } else if (/\b(?:fajita|fajitas|carne asada|carne tampique|molcajete|platter|ribeye|short rib|steak|pork belly|half chicken|texas platter|smoked pork)\b/i.test(nameText)) {
        category = "Fajitas & Grill";
      } else if (/\b(?:ceviche|crab|fish|rockfish|halibut|octopus|oyster|salmon|shrimp|seafood|swordfish|scallop|oysters)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:wings|elotes|queso|papas|pizza|nachos|guacamole|salsa)\b/i.test(nameText)) {
        category = "Starters";
      } else {
        category = "Entrees";
      }
    }

    const hasReviewNote = /Reviewed Urbano menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextDescription === description && nextName === name && hasReviewNote
      ? item
      : {
          ...item,
          name: nextName,
          category,
          description: nextDescription || undefined,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Urbano menu cleanup: removed menu-boundary fragment rows and rebuilt collapsed Mexican menu sections from source-backed item names and descriptions.`,
        };
  }

  if (restaurant?.id === "osm-our-mom-eugenia-2578773395") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextName = name.replace(/^★\s*/, "").trim();
    let nextDescription = description.replace(/\bCanadian bacontopped\b/gi, "Canadian bacon topped").replace(/\bthick-cutpotatoes\b/gi, "thick-cut potatoes").trim();

    if (/^(?:Items|greek|Restaurant|Menu)$/i.test(String(item.category ?? ""))) {
      if (/\b(?:coffee|nespresso|tea)\b/i.test(nameText)) {
        category = "Beverages";
      } else if (/\b(?:cake|baklava|bougatsa|custard|dessert|ekmek|flan|galakto|kantaifi|loukoumades|nutella|portokalopita|profiteroles|rizogalo|tsoureki|yogurt|fruit|meli|frouta)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:soup|fasolada|avgolemono|fakes|kreatosoupa|cream of vegetable)\b/i.test(nameText)) {
        category = "Soups";
      } else if (/\b(?:salad|salata)\b/i.test(nameText)) {
        category = "Salads";
      } else if (/\b(?:avga|omeleta|benediktos|egg|bacon)\b/i.test(nameText)) {
        category = "Breakfast & Brunch";
      } else if (/\b(?:lavraki|branzino|bakaliaros|cod|garides|shrimp|htenia|scallop|kalamarakia|calamari|mussels|mydia|octopus|salmon|solomos|thalassina|taramosalata|surf and turf)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:pita|fries|rice|fasolakia|fava|gigantes|skordalia|potatoes|fruit|side|bread)\b/i.test(nameText)) {
        category = "Sides";
      } else if (/\b(?:dolmades|feta|haloumi|keftedakia|kolokithokeftedes|melitzanosalata|patzaria|red hot roasted pepper|spanakopita|three spreads|tirokafteri|tyrokafteri|tyrokeftedes|tyropita|tzatziki|vegetarian platter|cheese platter)\b/i.test(nameText)) {
        category = "Meze & Spreads";
      } else if (/\b(?:arni|lamb|paidakia|fileto|souvlaki|kotopoulo|chicken|moussaka|pastitsio|mixed grill|boneless half chicken|lamburger|kleftiko|giouvetsi)\b/i.test(text)) {
        category = "Entrees";
      } else {
        category = "Meze & Spreads";
      }
    }

    const hasReviewNote = /Reviewed our mom Eugenia menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextDescription === description && nextName === name && hasReviewNote
      ? item
      : {
          ...item,
          name: nextName,
          category,
          description: nextDescription || undefined,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed our mom Eugenia menu cleanup: removed wine/cocktail/header/widget rows and rebuilt collapsed Greek menu sections from source-backed item names and descriptions.`,
        };
  }

  if (restaurant?.id === "osm-juke-box-diner-3925447512") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = description;

    if (/^(?:10oz-black-angus-steak)$/i.test(id)) {
      nextDescription = "";
    }

    if (
      /^(?:american|Menu|Jbd Interactive Cc Auth Form\.Pdf|Desserts Ice Cream|Outreach|Community Impact|The Basics|Breakfast|Burgers & Sandwiches|Entrees|Pastas|Seafood|Salads|Sides|Desserts|Beverages|Starters|Kids|Soups|Mediterranean)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/\b(?:coffee|tea|smoothie|juice|orange apple cranberry tomato)\b/i.test(text)) {
        category = "Beverages";
      } else if (/\b(?:apple pie|carrot cake|oreo|pecan pie|waffle sundae|ice cream|dessert)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:egg|eggs|omelet|omelette|breakfast|home fries|corned beef hash|english muffin|side toast)\b/i.test(text)) {
        category = "Breakfast";
      } else if (/\b(?:burger|cheeseburger|sandwich|sub|wrap|melt|gyro|falafel sandwich|open faced|grilled cheese|blt)\b/i.test(text)) {
        category = "Burgers & Sandwiches";
      } else if (/\b(?:fish|cod|tuna|shrimp|salmon|seafood)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:spaghetti|pasta|mac and cheese|mac n cheese)\b/i.test(text)) {
        category = "Pastas";
      } else if (/\b(?:salad|cucumber|chopped|dinner salad)\b/i.test(text)) {
        category = "Salads";
      } else if (/\b(?:wings|tenders|mozzarella sticks|hummus|falafel platter|quesadilla|fries|buffalo fries|cheesy fries|disco fries|western cheese fries)\b/i.test(text)) {
        category = "Starters";
      } else if (/\b(?:soup|chili)\b/i.test(text)) {
        category = "Soups";
      } else if (/\b(?:bacon|sausage|broccoli|fruit|fries|rice|potatoes|seasonal vegetables|toast|pita bread|saffron rice|mashed potatoes|side)\b/i.test(text)) {
        category = "Sides";
      } else if (/\b(?:souvlaki|shawarma|fajita|falafel|hummus)\b/i.test(text)) {
        category = "Mediterranean";
      } else {
        category = "Entrees";
      }
    }

    const hasReviewNote = /Reviewed Juke Box Diner menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextDescription === description && hasReviewNote
      ? item
      : {
          ...item,
          category,
          description: nextDescription || undefined,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Juke Box Diner menu cleanup: removed credit-card/community/page artifacts and parser fragment rows, stripped clear cross-row description bleed, and replaced generic american/Menu buckets with reviewed diner menu sections while preserving source-backed menu rows and Ingredient Intelligence evidence.`,
        };
  }

  if (restaurant?.id === "uzu-revolving-sushi-rockville-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (
      /^(?:Items|Sushi|Side Dishes \/ Soups|Nigiri|Sashimi|Special Sashimi|Special Nigiri|Uzu Signature|Rolls|Special Rolls|Handrolls|Vegan|Kids Items)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/\b(?:boss black coffee|hot tea|itoen|ooi ocha|green tea)\b/i.test(nameText)) {
        category = "Beverages";
      } else if (/\b(?:mochi|ice cream)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:kids series|kid'?s|kurobuta pork japanese sausage|karaage roll)\b/i.test(text)) {
        category = "Kids Items";
      } else if (/\b(?:vegan|avocado roll|cucumber roll|beets|ruhan roll|veggie dragon|seaweed salad and cucumber|inari)\b/i.test(text)) {
        category = "Vegan";
      } else if (/\b(?:handroll|hand roll)\b/i.test(text)) {
        category = "Handrolls";
      } else if (/\b(?:roll)\b/i.test(text) && !/\b(?:toro|chuck roll|ribeye)\b/i.test(text)) {
        category = /\b(?:24k|godzilla|green dragon|hawaiian|i-270|just another|kani cheese bomb|loco moco|palate teaser|rainbow|spider|uzumaki|what the fuzz|coco)\b/i.test(text)
          ? "Special Rolls"
          : "Rolls";
      } else if (/\b(?:miso soup|clam miso|udon|takoyaki|edamame|gyoza|karaage|tempura|softshell crab|chicken karaage|chicken gyoza|white rice)\b/i.test(text)) {
        category = "Side Dishes / Soups";
      } else if (/\b(?:sashimi)\b/i.test(text)) {
        category = /\b(?:special|toro|branzino|sea bass|oyster|sweet shrimp|uni|caviar)\b/i.test(text)
          ? "Special Sashimi"
          : "Sashimi";
      } else if (
        /\b(?:nigiri|2pc|1pc|tamago|kani|conch|eel|mackerel|salmon|scallop|shrimp|squid|tako|tuna|yellowtail|branzino|sea bass|wagyu|ribeye|foie gras|toro|uni|caviar|oyster)\b/i.test(
          text,
        )
      ) {
        category = /\b(?:foie gras|truffle|uni|caviar|toro|wagyu|branzino|sea bass|sweet shrimp|jello series|fuzzy series|dashi oil|wasabi ponzu|yuzu|black truffle)\b/i.test(
          text,
        )
          ? "Special Nigiri"
          : "Nigiri";
      } else if (/\b(?:seaweed|cucumber|salad)\b/i.test(text)) {
        category = "Side Dishes / Soups";
      } else {
        category = "Sushi";
      }
    }

    const hasReviewNote = /Reviewed UZU Revolving Sushi menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && hasReviewNote
      ? item
      : {
          ...item,
          category,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed UZU Revolving Sushi menu cleanup: removed website/slideshow and pricing-tier artifacts, then normalized collapsed Wix/API sushi rows into sushi, nigiri, sashimi, rolls, handrolls, vegan, kids, side, dessert, and beverage sections while preserving source-backed descriptions and Ingredient Intelligence evidence.`,
        };
  }

  if (restaurant?.id === "the-secret-garden-cafe-washington-dc-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = description;

    if (/^(?:asparagus|grit-cake|halfhalf-tea)$/i.test(id)) {
      nextDescription = "";
    }

    if (
      /^(?:American|Breakfast|Burgers & Sandwiches|Seafood|Pastas|Salads|Starters|Sides|Kids|Beverages|Desserts|Entrees)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/^(?:asparagus|grit-cake)$/i.test(id)) {
        category = "Sides";
      } else if (/^kids?[-\s]|kid'?s\b/i.test(nameText)) {
        category = "Kids";
      } else if (/\b(?:arnold palmer|tea|coffee|soda|shirley temple|chocolate milk|hot chocolate|raspberry temple|to go)\b/i.test(text)) {
        category = "Beverages";
      } else if (/\b(?:egg|eggs|breakfast|benedict|scramble|shakshuka|french toast)\b/i.test(text)) {
        category = "Breakfast";
      } else if (/\b(?:sandwich|burger|cheesesteak|melt|wrap|blt|bahn mi|bánh mì|monte cristo|pita)\b/i.test(text)) {
        category = "Burgers & Sandwiches";
      } else if (/\b(?:salmon|cod|barramundi|monkfish|rockfish|fish|crab|shrimp)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:cake|pie|pudding|ice cream|sundae|vermont|berry almond crunch)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:salad|cobb|slaw|coleslaw|couscous)\b/i.test(text)) {
        category = "Salads";
      } else if (/\b(?:pasta|linguine|linguini|noodle|noodles|alfredo|rosa)\b/i.test(text)) {
        category = "Pastas";
      } else if (/\b(?:dip|bruschetta|cheese board|hummus|mediterranean spread|carpaccio)\b/i.test(text)) {
        category = "Starters";
      } else if (
        /\b(?:asparagus|bacon|banana|beans|chips|cream cheese|fries|fruit|grit|ham|mashed potatoes|potato hash|maple|rice|sausage|spinach|vegetables|toast|slaw)\b/i.test(
          text,
        )
      ) {
        category = "Sides";
      } else {
        category = "Entrees";
      }
    }

    const hasReviewNote = /Reviewed The Secret Garden Cafe menu cleanup/i.test(String(item.sourceSummary ?? ""));

    return category === item.category && nextDescription === description && hasReviewNote
      ? item
      : {
          ...item,
          category,
          description: nextDescription || undefined,
          sourceSummary: hasReviewNote
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed The Secret Garden Cafe menu cleanup: kept Square/site menu rows, removed clear cross-row description bleed from side/beverage items, and replaced the generic American bucket with reviewed breakfast, sandwich, seafood, pasta, salad, starter, side, kids, beverage, dessert, and entree sections.`,
        };
  }

  if (["replacement-afghania-washington-dc", "osm-aracosia-3584164912"].includes(restaurant?.id)) {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const nameText = `${id} ${name}`;
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (
      /^(?:afghan|Items|Restaurant|Menu 1|Sides & Sauces|Vegetarian Entrees|Dumplings & Turnovers|Chops & Kabobs|Entrees|Desserts|Salads|Soups|Family Meals & Platters|Seafood|Burgers & Sandwiches)$/i.test(
        String(item.category ?? ""),
      )
    ) {
      if (/\b(?:cake|ice cream|sheer birinj|firni|baklava|pudding)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:salad|slaw)\b/i.test(text)) {
        category = "Salads";
      } else if (/\b(?:aush|soup|shorwa|omache|lentil soup)\b/i.test(text)) {
        category = "Soups";
      } else if (/\b(?:dumpling|dumplings|aushak|mantu|turnover|turnovers|boulanee|sambosa)\b/i.test(text)) {
        category = "Dumplings & Turnovers";
      } else if (/\b(?:burger|bun)\b/i.test(text)) {
        category = "Burgers & Sandwiches";
      } else if (/\b(?:salmon|surf and turf)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:dinner for two|family feast|combination platter|combination)\b/i.test(text)) {
        category = "Family Meals & Platters";
      } else if (
        /(?:\bside\b|\bchutney\b|\bsauce\b|yogurt with cucumber|^chalou\b|^qabuli-rice\b|^qabuli-rice\b|^palou\b|^palou-side\b|^nakhoud-side\b|^daal-side\b|^sabzi-side\b|^carrot-slaw\b)/i.test(
          nameText,
        )
      ) {
        category = "Sides & Sauces";
      } else if (
        /\b(?:kabob|kebab|chop|chopaan|tenderloin|ribeye|rack|mix grill|shoulder|seekh|ground beef|chicken breast|chicken thigh|beef tenderloin)\b/i.test(
          nameText,
        )
      ) {
        category = "Chops & Kabobs";
      } else if (
        /\b(?:baadenjaan|bamya|daal|kadoo|kandahari|nakhoud|sabzi|samarooq|mushroom|eggplant|butternut squash|okra|lentil|vegetarian)\b/i.test(
          text,
        )
      ) {
        category = "Vegetarian Entrees";
      } else if (/\b(?:palou|lawaan|moghuli|rumi|qorma|sholah|risotto|do piaza|dopiaza|ghorbandee|quroti|karahi|lamb|veal|chicken)\b/i.test(text)) {
        category = "Entrees";
      } else {
        category = "Entrees";
      }
    }

    const noteLabel =
      restaurant?.id === "osm-aracosia-3584164912" ? "Reviewed Aracosia menu cleanup" : "Reviewed Afghania menu cleanup";
    const noteText =
      restaurant?.id === "osm-aracosia-3584164912"
        ? "Reviewed Aracosia menu cleanup: removed beverage/special-event artifacts and rebuilt collapsed Wix/API sections from Afghan dish names and descriptions while preserving source-backed menu copy and Ingredient Intelligence evidence."
        : "Reviewed Afghania menu cleanup: removed raw retail/section-header rows and rebuilt collapsed website/API sections from dish names and descriptions.";

    return category === item.category && new RegExp(noteLabel, "i").test(String(item.sourceSummary ?? ""))
      ? item
      : {
          ...item,
          category,
          sourceSummary: new RegExp(noteLabel, "i").test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}${noteText}`,
        };
  }

  if (restaurant?.id === "maggie-mcfly-s-springfield-springfield-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (/^American$/i.test(String(item.category ?? ""))) {
      if (
        /\b(?:cupcake|brownie|cake|cheesecake|sundae|smores|s'mores|ice cream|milkshake|tiramisu|apple crisp|lava cake|spongebob shake)\b/i.test(
          text,
        )
      ) {
        category = "Desserts";
      } else if (/\b(?:taco|fajitas)\b/i.test(text)) {
        category = "Tacos & Fajitas";
      } else if (/\b(?:pizza|flatbread)\b/i.test(text)) {
        category = "Pizza";
      } else if (/\b(?:pasta|ravioli|tortellini|fettuccine|ramen|jambalaya|paella|bowl)\b/i.test(text)) {
        category = "Pastas, Rice & Bowls";
      } else if (
        /\b(?:burger|cheeseburger|hotdog|sandwich|club|reuben|french dip|gyro|philly|wrap|cuban|grilled cheese)\b/i.test(
          text,
        )
      ) {
        category = "Burgers & Sandwiches";
      } else if (
        /\b(?:ahi|calamari|clam|coconut shrimp|fish|lobster|salmon|seafood|shrimp|tuna)\b/i.test(
          text,
        )
      ) {
        category = "Seafood";
      } else if (/\b(?:salad|cobb|caesar)\b/i.test(text)) {
        category = "Salads";
      } else if (/\b(?:soup|chowder)\b/i.test(text)) {
        category = "Soups";
      } else if (
        /\b(?:eggroll|egg roll|dip|guacamole|deviled eggs|potstickers|pretzel|brussels|mozzarella|potato skins|onion rings|fries|nacho|wings|quesadilla|calamari|pickles|mac.*cheese bites)\b/i.test(
          text,
        )
      ) {
        category = "Appetizers";
      } else if (
        /\b(?:all-beef hotdog|cheese pizza|cheese quesadilla|fingers and fries|pasta and sauce|popcorn chicken|popcorn shrimp|sliders and fries|mac and cheese)\b/i.test(
          text,
        )
      ) {
        category = "Kids";
      } else if (
        /\b(?:filet|ribeye|strip|steak|short ribs|chicken|costoletta|pot roast|shepherd|mixed grille|meat craver|orange chicken|walnut chicken)\b/i.test(
          text,
        )
      ) {
        category = "Entrees";
      } else if (/\b(?:smoothie)\b/i.test(text)) {
        category = "Beverages";
      } else {
        category = "Entrees";
      }
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Maggie McFly's menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Maggie McFly's menu cleanup: removed location/shop/alcohol artifacts and normalized the collapsed American menu bucket using item names.`,
        };
  }

  if (
    [
      "farmers-and-distillers-dc",
      "farmers-fishers-bakers-dc",
      "founding-farmers-dc",
      "founding-farmers-reston-station-va",
      "founding-farmers-tysons-va",
    ].includes(restaurant?.id)
  ) {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = item.description;
    const officialMenuContext = foundingFarmersOfficialMenuContext[id];
    let changed = false;

    if (/^Dessert$/i.test(String(item.category ?? ""))) {
      category = "Desserts";
    }

    if (/^American(?:\s*\/\s*Farm-to-table)?$/i.test(String(item.category ?? ""))) {
      category = "Lunch & Dinner";
    }

    if (
      /\b(?:americano|cappuccino|coffee|cold brew|decaf|double espresso|espresso|latte|macchiato|mocha)\b/i.test(
        text,
      )
    ) {
      category = "Beverages";
    }

    if (/^Official Founding Farmers DC(?: dessert menu item)?\.?$/i.test(description.trim())) {
      nextDescription = undefined;
      changed = true;
    } else if (/^Official Founding Farmers DC\b/i.test(description.trim())) {
      nextDescription = undefined;
      changed = true;
    } else if (/\s+Talk to your server or follow this QR code with your smart phone to learn more\.?$/i.test(description)) {
      nextDescription = description
        .replace(/\s+Talk to your server or follow this QR code with your smart phone to learn more\.?$/i, "")
        .trim();
      changed = true;
    }

    if (!nextDescription && officialMenuContext) {
      nextDescription = officialMenuContext.description;
      changed = true;
    }

    if (/^farmers-decaf$/i.test(id) && /\bmilk chocolate\b/i.test(String(nextDescription ?? ""))) {
      nextDescription = String(nextDescription).replace(/\bmilk chocolate\b/gi, "chocolate");
      changed = true;
    }

    if (/^farmers-decaf$/i.test(id) && /\bcreamy\b/i.test(String(nextDescription ?? ""))) {
      nextDescription = String(nextDescription).replace(/\bcreamy\b/gi, "smooth");
      changed = true;
    }

    if (category !== item.category) {
      changed = true;
    }

    return changed
      ? {
          ...item,
          category,
          ...(nextDescription ? { description: nextDescription } : { description: undefined }),
          ...(officialMenuContext
            ? {
                sourceUrls: Array.from(
                  new Set([
                    ...(item.sourceUrls ?? []),
                    officialMenuContext.sourceUrl,
                  ]),
                ),
              }
            : {}),
          sourceSummary: /Reviewed Founding Farmers family menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Founding Farmers family menu cleanup: removed section-header rows, stripped source boilerplate descriptions, normalized dessert/beverage sections, and kept source-backed menu items shared across Founding Farmers locations.`,
        }
      : item;
  }

  if (restaurant?.id === "replacement-sunflower-vegetarian-restaurant-vienna-va") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (/^Dessert$/i.test(String(item.category ?? ""))) {
      category = "Desserts";
    } else if (/^Soup$/i.test(String(item.category ?? ""))) {
      category = "Soups";
    } else if (/^Salad$/i.test(String(item.category ?? ""))) {
      category = "Salads";
    } else if (/^Items$/i.test(String(item.category ?? ""))) {
      if (/^(?:a\d|cold-basil-roll|seaweed-salad|steamed-moo-shu-rolls|yummy-homemade-daikon)/i.test(id)) {
        category = "Small Bites";
      } else if (/^(?:d\d|asparagus-roll|avocado-balls|burning-mountain|one-mouth-happiness|shiitake-mushroom-roll|tartar-paradise|teriyaki-mock|tornado-roll|veggie-shrimp-tempura-roll|zen-roll)/i.test(id)) {
        category = "Sushi";
      } else if (/^(?:n\d|chickn-patty-over-noodle|lo-mein|rice-noodle|soba|udon)/i.test(id)) {
        category = "Noodles";
      } else if (/^(?:r\d|thai-tom-yum-fried-rice|veggie-fried-rice)/i.test(id)) {
        category = "Rice";
      } else if (/^(?:s\d|adventure-of-organic-tempeh|curry-paradise|macrobiotic|orange-chickn|sunflowers-satisfaction|sweet-and-sour-sensation|wheat-gluten|zen-of-greens)/i.test(id)) {
        category = "Sunflower Specialties";
      } else if (/^(?:l\d)/i.test(id)) {
        category = "Lunch";
      } else if (/\b(?:cake|cheesecake|cannoli|mousse|baklava)\b/i.test(text)) {
        category = "Desserts";
      } else if (/\b(?:tea|soda|mohito|mojito)\b/i.test(text)) {
        category = "Beverages";
      } else if (/\b(?:soup)\b/i.test(text)) {
        category = "Soups";
      } else if (/\b(?:salad)\b/i.test(text)) {
        category = "Salads";
      } else if (/\b(?:sandwich|burger)\b/i.test(text)) {
        category = "Sandwiches";
      } else if (/^(?:x\d)/i.test(id)) {
        category = "Extra Side Orders";
      } else {
        category = "Vegetarian";
      }
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Sunflower Vegetarian menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Sunflower Vegetarian menu cleanup: normalized the generic ordering API Items bucket into menu sections while preserving row-backed official ingredient disclosures and vegetarian/mock-seafood context.`,
        };
  }

  if (restaurant?.id === "ilili-dc") {
    const category = String(item.category ?? "");
    const id = String(item.id ?? "");
    const name = String(item.name ?? "");
    const text = `${id} ${name} ${String(item.description ?? "")}`;
    let nextCategory = item.category;

    if (
      /^(?:Coffee & Tea|Ililis Menu Dc|Menu Dc)$/i.test(category) ||
      /\b(?:coffee|espresso|cappuccino|hot tea|mint tea|white coffee|turkish coffee)\b/i.test(text)
    ) {
      nextCategory = "Beverages";
    } else if (/^Dessert$/i.test(category)) {
      nextCategory = "Desserts";
    }

    return nextCategory === item.category
      ? item
      : {
          ...item,
          category: nextCategory,
          sourceSummary: /Reviewed ilili DC menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed ilili DC menu cleanup: removed a cocktail descriptor row and normalized coffee/tea and singular dessert sections while preserving source-backed food rows.`,
        };
  }

  if (restaurant?.id === "society-seafood-house-silver-spring-md-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = item.description;
    let changed = false;

    if (/^Soup$/i.test(String(item.category ?? ""))) {
      category = "Soups";
    } else if (/^Poboys$/i.test(String(item.category ?? ""))) {
      category = "Sandwiches";
    } else if (/^Additions$/i.test(String(item.category ?? ""))) {
      category = "Sides & Additions";
    } else if (/^Menu$/i.test(String(item.category ?? ""))) {
      if (/\b(?:sandwich|scotch bonnet fried chicken)\b/i.test(text)) {
        category = "Sandwiches";
      } else {
        category = "Baskets";
      }
    } else if (/^Food$/i.test(String(item.category ?? ""))) {
      if (/\b(?:caesar salad|society salad)\b/i.test(text)) {
        category = "Salads";
      } else if (/\b(?:shrimp tacos?)\b/i.test(text)) {
        category = "Tacos";
      } else if (/\b(?:society shrimp|oysters rockefeller|crab eggroll|mac and cheese balls|spring rolls?|wings?)\b/i.test(text)) {
        category = "Appetizers";
      } else {
        category = "Starters";
      }
    }

    if (
      /^Food$/i.test(String(item.category ?? "")) &&
      /Wednesday\s*[–-]\s*Friday\s+4:00\s*PM\s*-\s*7:00\s*PM/i.test(description)
    ) {
      nextDescription = undefined;
      changed = true;
    }

    if (category !== item.category) {
      changed = true;
    }

    return changed
      ? {
          ...item,
          category,
          ...(nextDescription ? { description: nextDescription } : { description: undefined }),
          sourceSummary: /Reviewed Society Seafood House menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Society Seafood House menu cleanup: removed malformed restaurant/marketing fragment rows, stripped happy-hour boilerplate descriptions, and normalized generic SpotApps menu sections using item text.`,
        }
      : item;
  }

  if (restaurant?.id === "joon-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (
      /^Thanksgiving Beverage Pairings$/i.test(String(item.category ?? "")) ||
      /^(?:coffee-servi-ce|persian-tea|na-serena-sauv-blanc-bottle)$/i.test(id) ||
      /\b(?:coffee service|persian tea|sauv blanc)\b/i.test(text)
    ) {
      category = "Beverages";
    } else if (/^Dessert$/i.test(String(item.category ?? ""))) {
      category = "Desserts";
    } else if (/^Menu$/i.test(String(item.category ?? "")) && /^thanksgiving-meal$/i.test(id)) {
      category = "Thanksgiving Packages";
    } else if (/^Food$/i.test(String(item.category ?? ""))) {
      if (/\b(?:cucumber salad)\b/i.test(text)) {
        category = "Salads";
      } else if (/\b(?:prawns?|swordfish|branzino)\b/i.test(text)) {
        category = "Seafood";
      } else if (/\b(?:hummus)\b/i.test(text)) {
        category = "Mazzeh";
      } else if (/\b(?:kabob|kabab)\b/i.test(text)) {
        category = "Kabobs and Sandwiches";
      } else {
        category = "Mains";
      }
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Joon menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Joon menu cleanup: removed standalone add-on rows and normalized generic website/PDF sections into dinner, beverage, dessert, and Thanksgiving package sections using item text.`,
        };
  }

  if (restaurant?.id === "teddy-and-the-bully-bar-washington-dc-dc-metro") {
    const category = String(item.category ?? "");
    let nextCategory = item.category;

    if (/^Dessert$/i.test(category)) {
      nextCategory = "Desserts";
    } else if (/^Menu$/i.test(category) && /^stations$/i.test(String(item.id ?? ""))) {
      nextCategory = "Stations Menu";
    } else if (/^Food$/i.test(category)) {
      nextCategory = "Kids";
    } else if (/^Tasty Things to Eat$/i.test(category)) {
      nextCategory = "Starters";
    } else if (/^Soups from Scratch$/i.test(category)) {
      nextCategory = "Soups";
    } else if (/^Coffee & Tea$/i.test(category)) {
      nextCategory = "Beverages";
    }

    return nextCategory === item.category
      ? item
      : {
          ...item,
          category: nextCategory,
          sourceSummary: /Reviewed Teddy & The Bully Bar menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Teddy & The Bully Bar menu cleanup: removed PDF-link rows and normalized duplicated/generic website and catering menu sections while preserving source-backed food rows.`,
        };
  }

  if (restaurant?.id === "jimmys-old-town-tavern-herndon-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;
    let nextDescription = item.description;
    let changed = false;

    if (id === "bacon" || /^Bacon$/i.test(name.trim())) {
      category = "Sides";
    } else if (
      /^(?:coffee-and-hot-tea|pineapple-juice|soft-drinks-and-beverages)$/i.test(id) ||
      /\b(?:coffee|hot tea|pineapple juice|soft drinks?|beverages?)\b/i.test(name)
    ) {
      category = "Beverages";
    } else if (/\b(?:hot apple pie)\b/i.test(text)) {
      category = "Desserts";
    } else if (
      /\b(?:rib-eye steak|hot open-faced roast beef|chicken parmesan|pasta with marinara|pierogies)\b/i.test(
        text,
      )
    ) {
      category = "Entrees";
    } else if (
      /\b(?:chef|grilled chicken|grilled salmon|steak)\b/i.test(name) &&
      /\b(?:salad|salad mix|tomatoes|cucumbers|mushrooms|onions|croutons)\b/i.test(description)
    ) {
      category = "Salads";
    } else if (
      /\b(?:all american burger|beef on weck|blt|buffalo wrap|chicken parm sub|chili dogs?|garden burger|grilled cheese|hot ham|jimmys old town tavern burger|jimmy's old town tavern burger|reuben)\b/i.test(
        text,
      )
    ) {
      category = "Burgers & Sandwiches";
    } else if (
      /\b(?:mozzarella sticks?|artichoke.*spinach dip|chicken fingers?|jott tots?|potato skins?|poutine)\b/i.test(
        text,
      )
    ) {
      category = "Appetizers";
    }

    if (
      /^(?:pineapple-juice|soft-drinks-and-beverages)$/i.test(id) &&
      /\b(?:Abita Root Beer|Red Bull|Wines:|Happy Hour|Classic Buffalo Wings)\b/i.test(description)
    ) {
      nextDescription = undefined;
      changed = true;
    }

    if (id === "beef-on-weck" && /\bThinly$/i.test(description.trim())) {
      nextDescription = undefined;
      changed = true;
    }

    if (id === "grilled-chicken" && /^House\s+Our\b/i.test(description)) {
      nextDescription = description.replace(/^House\s+/i, "");
      changed = true;
    }

    if (id === "jott-tots" && /\s+Soup,\s*Stew\s*&\s*Chili\b/i.test(description)) {
      nextDescription = description.replace(/\s+Soup,\s*Stew\s*&\s*Chili\b.*$/i, "").trim();
      changed = true;
    }

    if (category !== item.category) {
      changed = true;
    }

    return changed
      ? {
          ...item,
          category,
          ...(nextDescription ? { description: nextDescription } : { description: undefined }),
          sourceSummary: /Reviewed Jimmy's Old Town Tavern menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Jimmy's Old Town Tavern menu cleanup: removed site-navigation/event rows, stripped beverage bleed from descriptions, and normalized collapsed website/PDF menu sections using item text.`,
        }
      : item;
  }

  if (["true-food-kitchen", "true-food-kitchen-arlington"].includes(restaurant?.id)) {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const text = `${id} ${name} ${String(item?.description ?? "")}`;
    let category = item.category;

    if (
      id === "the-og" ||
      /\b(?:americano|lemonade|spritzer|tea|espresso|coffee|chai|tisane|common bond|bright eyes|herbal|the indigo|the og|blueberry|mimosa|michelob|modelo|water|sangria|margarita|margartia|mojito|martini|stella|ipa)\b/i.test(
        text,
      )
    ) {
      category = "Beverages";
    } else if (
      /\b(?:cookie|ice cream|muffin|carrot cake|dessert|sundae|cosmic bliss|vegan vanilla)\b/i.test(
        text,
      )
    ) {
      category = "Desserts";
    } else if (/\b(?:pizza|margarita-pizza|pepperoni-pizza)\b/i.test(text)) {
      category = "Pizza";
    } else if (
      /\b(?:burger|cheeseburger|sandwich|panini|wrap|toast)\b/i.test(text)
    ) {
      category = "Burgers & Sandwiches";
    } else if (
      /\b(?:salad|kale|crispd-green|farmer|seasonal market|greek salad|chopped)\b/i.test(text)
    ) {
      category = "Salads";
    } else if (
      /\b(?:bowl|noodle|teriyaki|poke|curry|ancient grain|rancher|hash|lasagne|spaghetti|casserole|chicken parmesan|breakfast bowl|soup)\b/i.test(
        text,
      )
    ) {
      category = "Bowls & Entrees";
    } else if (
      /\b(?:dumplings|hummus|guacamole|charred cauliflower|edamame|fresh veggies)\b/i.test(text)
    ) {
      category = "Starters";
    } else if (
      /\b(?:salmon|shrimp|steak frites|chicken tender|asian wild-caught shrimp)\b/i.test(text)
    ) {
      category = "Proteins & Mains";
    } else if (
      /\b(?:noodles|carrots|brussels|veggies|fries|potatoes|sweet potato|ketchup|sauce|vinaigrette|chili garlic crunch|chips)\b/i.test(
        text,
      )
    ) {
      category = "Sides & Sauces";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed True Food Kitchen menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed True Food Kitchen menu cleanup: removed diet-guide, group-dining, what’s-new, and global allergen note rows while preserving official item-level allergen rows and normalizing menu sections.`,
        };
  }

  if (["flower-child-bethesda", "osm-flower-child-6327602834"].includes(restaurant?.id)) {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${id} ${name} ${description}`;
    let category = item.category;

    if (/\b(?:hot tea|kombucha)\b/i.test(text)) {
      category = "Beverages";
    } else if (/\b(?:daily soup|daily-soup)\b/i.test(text)) {
      category = "Soups";
    } else if (/\b(?:cookie|cookies|brownie|brownies|pudding|cake|lemon olive oil cake|cookie brownie duo)\b/i.test(text)) {
      category = "Desserts";
    } else if (
      /\b(?:avocado caesar|chopped vegetable|kale salad|large .*salad|skinny cobb|summer ingredient|turkey .*cobb|brussels sprouts (?:and|&) organic kale|brussels-sprouts-and-organic-kale|ginger miso crunch)\b/i.test(
        text,
      )
    ) {
      category = "Salads";
    } else if (
      /\b(?:avocado hummus|classic hummus|hummus with|black bean falafel|green chile queso)\b/i.test(
        text,
      )
    ) {
      category = "Starters";
    } else if (
      /\b(?:flying avocado|the rebel|french dip|wrap|avocado toast)\b/i.test(text)
    ) {
      category = "Sandwiches & Wraps";
    } else if (
      /\b(?:forbidden[-\\s\"]*rice|cauliflower[-\\s\"]*risotto|yakisoba|glow bowl|mother earth|peruvian braised beef|spicy coconut green curry|yellowfin tuna poke)\b/i.test(
        text,
      )
    ) {
      category = "Bowls";
    } else if (
      /\b(?:get together|bountiful bowls|nourish a tribe|the gatherer|the grateful spread)\b/i.test(
        text,
      )
    ) {
      category = "Catering & Bundles";
    } else if (/\b(?:chicken enchiladas|chicken-enchiladas)\b/i.test(text)) {
      category = "Entrees";
    } else if (
      /^(?:large-)?(?:grilled-)?(?:chicken|salmon|shrimp|steak|tofu)$/.test(id) ||
      /^(?:Large )?(?:Grilled )?(?:Chicken|Salmon|Shrimp|Steak|Tofu)$/i.test(name.trim()) ||
      /\b(?:large chicken|large grilled chicken|large salmon|large shrimp|large steak|large tofu)\b/i.test(
        text,
      )
    ) {
      category = "Proteins";
    } else if (
      /\b(?:vegetarian sides|large sides|choice of.*sides|kids' sides|fresh fruit|gluten-free mac|mac and cheese|mexican fruit|roasted broccoli|roasted heirloom carrots|roasted sweet potato fries|olive oil roasted vegetables|red chile glazed sweet potato|simple steamed brown rice|smashed gold potato|sweet[-\s]corn[-\s](?:and|&)[-\s]quinoa)\b/i.test(
        text,
      )
    ) {
      category = "Sides";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Flower Child menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Flower Child menu cleanup: removed location, promo, alcohol, and section-shell rows and normalized shared Flower Child menu sections using item text.`,
        };
  }

  if (restaurant?.id === "oohh-s-and-aahh-s-washington-dc-dc-metro") {
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;

    if (
      /\b(?:aquafina|gatorade|pepsi|starry|soda|mtn dew|iced tea|sweet tea|half\s*&?\s*half|halfandhalf|lemonade|pure leaf|crush|orange soda|zero pepsi)\b/i.test(
        text,
      )
    ) {
      category = "Beverages";
    } else if (/\b(?:cake|cheesecake|cobbler|banana pudding|cookie butter|red velvet|sprinkle|yellow cake|apple cobbler|peach cobbler)\b/i.test(text)) {
      category = "Desserts";
    } else if (/\b(?:taco)\b/i.test(text)) {
      category = "Soul Tacos";
    } else if (
      /\b(?:sandwich|burger|slider)\b/i.test(text)
    ) {
      category = "Sandwiches";
    } else if (/\b(?:turkey wings?|roasted turkey wings?|fried turkey wings?)\b/i.test(text)) {
      category = "Entrees";
    } else if (
      /\b(?:catfish nuggets?|tenders?|crab dip|brussels sprouts?|fritters?|nachos|crispy shrimp|wings|apps|creamy crab|spinach dip)\b/i.test(
        text,
      )
    ) {
      category = "Appetizers";
    } else if (
      /\b(?:brunch|chicken and waffles|short ribs?\s*(?:and|&)\s*grits|salmon\s*(?:and|&)\s*grits|blackened salmon\s*(?:and|&)\s*grits|whiting\s*(?:and|&)\s*grits|catfish\s*(?:and|&)\s*grits|shrimp\s*(?:and|&)\s*grits|seafood cajun crab grits|salmon cajun crab grits|bbq beef short ribs\s*(?:and|&)\s*grits)\b/i.test(
        text,
      )
    ) {
      category = "Brunch";
    } else if (/\b(?:caesar salad|mixed green salad)\b/i.test(text)) {
      category = "Salads";
    } else if (
      /\b(?:croaker|whiting|catfish|shrimp|salmon|seafood platter|fish)\b/i.test(text)
    ) {
      category = "Seafood";
    } else if (
      /\b(?:chicken|turkey|meatloaf|short ribs|beef short rib|veggie plate|veggie platter|two meat entree|platter|combo|leg quarter|meat only)\b/i.test(
        text,
      )
    ) {
      category = "Entrees";
    } else if (
      /\b(?:mac|cabbage|collard|green beans|grits|mashed potatoes|potato salad|rice|yams|fries|waffle|cornbread|black eyed peas|savory rice|extra pita)\b/i.test(
        text,
      ) &&
      !/\b(?:seafood mac|crab dip|chicken and waffles)\b/i.test(text)
    ) {
      category = "Sides";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Oohh's & Aahh's menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Oohh's & Aahh's menu cleanup: removed menu shell, location, section, and sauce add-on rows and normalized duplicated location/menu sections using item text.`,
        };
  }

  if (restaurant?.id === "plaka-grill-vienna-va-dc-metro") {
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;

    if (/\b(?:kids|kid's)\b/i.test(text)) {
      category = "Kids";
    } else if (
      /\b(?:moussaka|pastitsio|kapama|mixed grill|bifteki|whole roasted chicken|half roasted chicken|quarter roasted chicken|chicken only|gyro meat|souvlaki meat)\b/i.test(
        text,
      )
    ) {
      category = "Entrees";
    } else if (/\b(?:gyro|souvlaki|wrap|loukaniko)\b/i.test(text)) {
      category = "Gyros, Souvlaki & Wraps";
    } else if (
      /\b(?:calamari|dolmadakia|falafel|spanakopita|zucchini fritters?|gigantes|kotopoulaki)\b/i.test(
        text,
      )
    ) {
      category = "Appetizers";
    } else if (/\b(?:avgolemeno|faki|salad|arugula|romaine|village salad|plaka salad)\b/i.test(text)) {
      category = "Soups & Salads";
    } else if (
      /\b(?:hummus|tzatziki|tyrokafteri|taramosalata|melitzanosalata|sampler|olives|feta)\b/i.test(
        text,
      )
    ) {
      category = "Dips & Spreads";
    } else if (/\b(?:baklava|galaktoboureko|greek yogurt|rizogalo|custard|pudding|dessert)\b/i.test(text)) {
      category = "Desserts";
    } else if (
      /\b(?:fries|rice pilaf|potatoes|green beans|mixed veggies|plaka style)\b/i.test(text)
    ) {
      category = "Sides";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Plaka Grill menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Plaka Grill menu cleanup: removed Wix widget/form rows and corrected collapsed menu API sections using item names and descriptions.`,
        };
  }

  if (restaurant?.id === "replacement-delhi-spice-bethesda-md") {
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;

    if (/\b(?:lassi|mumbai breeze|tropical nirvana|tea|soda)\b/i.test(text)) {
      category = "Beverages";
    } else if (/\b(?:gulab jamun|kheer|cake|dessert)\b/i.test(text)) {
      category = "Desserts";
    } else if (
      /\b(?:samosas?|chaat|pakoda|gobi lasooni|papad|momo|spinach fritters|aloo tikki|papri|pickle|chutney|raita)\b/i.test(
        text,
      )
    ) {
      category = "Appetizers & Sides";
    } else if (/\b(?:naan|roti|paratha|kulcha|bathure|bhature|bread)\b/i.test(text)) {
      category = "Breads";
    } else if (/\b(?:rice|biryani)\b/i.test(text)) {
      category = "Rice & Biryani";
    } else if (/\b(?:salad|soup)\b/i.test(text)) {
      category = "Soups & Salads";
    } else if (/\b(?:shrimp|prawn|salmon|fish)\b/i.test(text)) {
      category = "Seafood";
    } else if (/\b(?:chicken|kabab|wings)\b/i.test(text)) {
      category = "Chicken";
    } else if (/\b(?:lamb|goat)\b/i.test(text)) {
      category = "Lamb & Goat";
    } else if (/\b(?:paneer|dal|aloo|gobhi|gobi|bhindi|baingan|kofta|vegetable|chole|saag|kadai|makhani|korma)\b/i.test(text)) {
      category = "Vegetarian";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Delhi Spice menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Delhi Spice menu cleanup: removed Wix widget/drink-only rows and corrected collapsed API menu sections using item text.`,
        };
  }

  if (restaurant?.id === "inca-social-vienna-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;

    if (/\b(?:cheesecake|ice cream|waffle|toast|sweet sampler|fritters|cake|dessert|alfajor|churros)\b/i.test(text)) {
      category = "Desserts & Brunch";
    } else if (/\b(?:coffee|caipirinha|chicha|sparkling|pisco|margarita|fresh limes|yuzu|shot)\b/i.test(text)) {
      category = "Beverages";
    } else if (/\b(?:benedict|omelette|omelet|breakfast|avocado toast|pancake|waffle|tamal)\b/i.test(text)) {
      category = "Brunch";
    } else if (/\b(?:salad|andino|cesar|caesar|garden|limeña|limena|superfood|tabbouleh)\b/i.test(text)) {
      category = "Salads";
    } else if (/\b(?:roll|sushi|nigiri)\b/i.test(name)) {
      category = "Sushi";
    } else if (/\b(?:ceviche|tiradito|choros|mussels?|shrimp|fish|seafood|jalea|pescado|pulpo|octopus|salmon|tuna|snapper)\b/i.test(text)) {
      category = "Seafood";
    } else if (/\b(?:bowl|pasta|linguine|saltado|chaufa|arroz|rice|quinoa)\b/i.test(text)) {
      category = "Mains";
    } else if (/\b(?:burger|sandwich|bao|pan con|milanesa)\b/i.test(text)) {
      category = "Sandwiches";
    } else if (
      /\b(?:empanadas?|yucca|yuquitas|causa|fries|anticucho|beef heart|chicken|pork|tacacho|chicharr[oó]n|cauliflower|tamale|green sauce|buffalo|french fries|sweet potato fries|taco tuesday)\b/i.test(
        text,
      )
    ) {
      category = "Starters & Sides";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Inca Social menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Inca Social menu cleanup: removed PDF/OCR description fragments and event cards while preserving source-backed menu rows.`,
        };
  }

  if (restaurant?.id === "replacement-provost-restaurant-washington-dc") {
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;

    if (/\b(?:coffee|tea|decaf)\b/i.test(text)) {
      category = "Beverages";
    } else if (/\b(?:cheesecake|bread pudding|french toast|pancakes?|waffle)\b/i.test(text)) {
      category = "Brunch & Desserts";
    } else if (/\b(?:omelet|benedict|egg any style|pancake and egg|french toast and egg|bacon|sausage|home fries)\b/i.test(text)) {
      category = "Brunch";
    } else if (/\b(?:salad|fruit plate)\b/i.test(text)) {
      category = "Salads";
    } else if (/\b(?:burger|avocado toast|quesadillas?|sandwich)\b/i.test(text)) {
      category = "Sandwiches";
    } else if (/\b(?:pasta|mac and cheese|vegetarian pasta|fried rice)\b/i.test(text)) {
      category = "Pastas & Rice";
    } else if (
      /\b(?:shrimp|crab|calamari|sea bass|snapper|salmon|seafood|lobster|surf and turf|chowder|branzino)\b/i.test(
        text,
      )
    ) {
      category = "Seafood";
    } else if (/\b(?:wings?|chicken|cauliflower|spinach dip|stuffed mushroom|deviled egg|corn bread|beverages|cheese balls)\b/i.test(text)) {
      category = "Starters";
    } else if (/\b(?:coconut rice|cabbage|potato fries|greens|fries)\b/i.test(text)) {
      category = "Sides";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Provost menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Provost menu cleanup: removed widget/drink-only rows and corrected collapsed Wix/API menu sections using item text.`,
        };
  }

  if (restaurant?.id === "replacement-huncho-house-hyattsville-md") {
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;

    if (
      /\b(?:cake|cheesecake|french toast|bread pudding|croissants?|waffles?|pancakes?|sorbet|green goblin|pretty in pink|banana foster)\b/i.test(
        text,
      )
    ) {
      category = "Desserts & Brunch";
    } else if (/\b(?:salad|romaine|arugula|wedge|caesar)\b/i.test(text)) {
      category = "Salads";
    } else if (/\b(?:roll|sushi|ahi|tuna|california roll|caterpillar|volcano)\b/i.test(text)) {
      category = "Sushi";
    } else if (
      /\b(?:oyster|seafood|mussels?|shrimp|crab|branzino|snapper|salmon|lobster|octopus|scallops?|catfish|ceviche|omelette)\b/i.test(
        text,
      )
    ) {
      category = "Seafood";
    } else if (/\b(?:rigatoni|fettucine|fettuccine|ravioli|noodles|ramen|fried rice|jollof|rice|risotto|mac (?:and|&|n) cheese)\b/i.test(text)) {
      category = "Pastas, Rice & Noodles";
    } else if (
      /\b(?:egg rolls?|arancini|cauliflower|deviled eggs?|fries|wontons?|bao bun|pork belly|shrimp wonton|duo: edamame|edamame|lollipop|bacon|skewers)\b/i.test(
        text,
      )
    ) {
      category = "Starters";
    } else if (
      /\b(?:ribeye|ribs?|oxtails?|lamb chops?|short ribs?|tomahawk|strip|katsu|marsala|chicken parmesan|fried chicken|korean fried chicken|chicken lollipop|steak & eggs|steak and eggs|red snapper|wings)\b/i.test(
        text,
      )
    ) {
      category = "Entrees";
    } else if (
      /\b(?:asparagus|green beans|collard greens|mashed potatoes|hash|jollof rice|jasmine rice|fruit bowl|bacon|sausage|fries|plantains?|mushrooms?)\b/i.test(
        text,
      )
    ) {
      category = "Sides";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed Huncho House menu cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Huncho House menu cleanup: corrected collapsed Wix/API categories and removed standalone condiment/add-on rows while preserving source-backed menu items.`,
        };
  }

  if (restaurant?.id === "the-harbour-grille-woodbridge-va-dc-metro") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;
    let nextDescription = item.description;
    let changed = false;

    if (id === "grilled" && /country benedict/i.test(description)) {
      return {
        ...item,
        name: "Country Benedict",
        category: "Brunch",
        sourceSummary: /Reviewed Harbour Grille menu cleanup/i.test(String(item.sourceSummary ?? ""))
          ? item.sourceSummary
          : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Harbour Grille menu cleanup: repaired an image-menu boundary fragment using the item-specific menu description.`,
      };
    }

    if (/\b(?:coffee|tea|decaf)\b/i.test(text)) {
      category = "Beverages";
    } else if (/\b(?:benedict|omelet|omelet|omelette|biscuits|gravy|brunch|steak and eggs|breakfast)\b/i.test(text)) {
      category = "Brunch";
    } else if (/\b(?:salad|crudite)\b/i.test(text)) {
      category = "Salads";
    } else if (/\b(?:sandwich|burger|reuben|rueben|french dip|club|wrapper|lobster roll|soft shelled crab)\b/i.test(text)) {
      category = "Sandwiches";
    } else if (/\b(?:alfredo|carbonara|pasta|linguini|mac (?:and|&|n) cheese)\b/i.test(text)) {
      category = "Pastas";
    } else if (/\b(?:cake|cheesecake|creme brulee|crème brûlée|pie|sundae|dessert|french toast|waffles?)\b/i.test(text)) {
      category = "Desserts";
    } else if (/\b(?:scallops?|shrimp|crab|calamari|fish|salmon|seafood|clam|lobster|tuna|fresh catch)\b/i.test(text)) {
      category = "Seafood";
    } else if (/\b(?:ribs?|short rib|steak|chicken breast|caribbean chicken|meatballs|cordon bleu|seasonal delight)\b/i.test(text)) {
      category = "Entrees";
    } else if (/\b(?:fries|rice|asparagus|potatoes|toast points|bacon|cheese fries)\b/i.test(text) || /^sd-/i.test(id)) {
      category = "Sides";
    } else if (/\b(?:portabella|slider trio)\b/i.test(text)) {
      category = "Sandwiches";
    } else if (
      /\b(?:dip|wings?|tenders?|wontons?|egg rolls?|hush puppies|pickles|pickle fries|quesadilla|skewers|buffalo chicken dip|cheese platter|fruit and cheese|southwest egg rolls?)\b/i.test(
        text,
      )
    ) {
      category = "Appetizers";
    }

    if (/^(?:harbour-grille-wings-gf)$/i.test(id)) {
      nextDescription = undefined;
      changed = Boolean(item.description);
    }

    changed = changed || category !== item.category;

    if (!changed) {
      return item;
    }

    const repaired = {
      ...item,
      category,
      sourceSummary: /Reviewed Harbour Grille menu cleanup/i.test(String(item.sourceSummary ?? ""))
        ? item.sourceSummary
        : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Harbour Grille menu cleanup: removed website/navigation rows and corrected generic Toast/menu sections using item names and descriptions.`,
    };

    if (typeof nextDescription === "undefined") {
      delete repaired.description;
    } else {
      repaired.description = nextDescription;
    }

    return repaired;
  }

  if (restaurant?.id === "replacement-moxies-washington-dc-restaurant-washington-dc") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;
    let nextDescription = item.description;
    let changed = false;

    if (/^(?:avocado-toast-bites|blackened-shrimp-tacos-gc)$/i.test(id)) {
      nextDescription = description.replace(/\s+(?:ENTR[ÉE]\s*\(choose one\)|substitute sweet potato fries[\s\S]*)$/i, "").trim();
      changed = nextDescription !== item.description;
    } else if (/^(?:french-onion-soup)$/i.test(id)) {
      nextDescription = undefined;
      changed = Boolean(item.description);
    }

    if (/\b(?:tea|espresso|cantaritos|crown royal|licor|old fashioned|tequila|sugar cookie)\b/i.test(text)) {
      category = "Beverages";
    } else if (/\b(?:brownie|cake|churro|flourless|key lime|mocha pie|sticky toffee|dessert|french toast|brioche bites)\b/i.test(text)) {
      category = "Desserts";
    } else if (/\b(?:breakfast|brunch|benedict|frittata|omelet|omelette|egg sandwich|steak & eggs|farmers hash|acai bowl)\b/i.test(text)) {
      category = "Brunch";
    } else if (/\b(?:salad|cobb|greens)\b/i.test(text)) {
      category = "Salads";
    } else if (/\b(?:burger|sandwich|brioche bun|lettuce "bun"|handheld|beef dip|sliders)\b/i.test(text)) {
      category = "Sandwiches";
    } else if (/\b(?:spicy tuna|sushi|ahi|mahi|salmon|prawn|shrimp|crab|calamari|tuna)\b/i.test(text)) {
      category = "Seafood";
    } else if (/\b(?:rigatoni|pappardelle|pasta|ramen|thai curry|zen bowl|power bowl)\b/i.test(text)) {
      category = "Pastas & Bowls";
    } else if (/\b(?:steak|sirloin|filet|frites|prime|madeira|rib|ribs|chipotle mango chicken|grilled chicken)\b/i.test(text)) {
      category = "Steaks & Mains";
    } else if (/\b(?:fries|rice|quinoa|potatoes|vegetables|brussels|brussel|ciabatta|truffle butter|mushroom sauce)\b/i.test(text)) {
      category = "Sides";
    } else if (/\b(?:nachos|guacamole|potstickers|poutine|bruschetta|lettuce wraps|crab dip|crab cakes|steak bites|chicken bites|curds|roasted tomatoes|taco station|thai chili chicken)\b/i.test(text)) {
      category = "Savor & Share";
    }

    changed = changed || category !== item.category;

    if (!changed) {
      return item;
    }

    const repaired = {
      ...item,
      category,
      sourceSummary: /Reviewed Moxies menu cleanup/i.test(String(item.sourceSummary ?? ""))
        ? item.sourceSummary
        : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Moxies menu cleanup: removed source/PDF boundary artifacts and corrected generic source categories using item text and official menu evidence.`,
    };

    if (typeof nextDescription === "undefined") {
      delete repaired.description;
    } else {
      repaired.description = nextDescription;
    }

    return repaired;
  }

  if (restaurant?.id === "replacement-his-and-hers-washington-dc") {
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;

    if (/\b(?:juice|smoothie|cabana|beet of my heart|grass aint greener|spice up your life|honey please|coffee|tea)\b/i.test(text)) {
      category = "Beverages";
    } else if (/\b(?:cheesecake|lava cake|br[uû]l[eé]e|apple pie|sorbet|funnel|waffle|pancake)\b/i.test(text)) {
      category = "Desserts";
    } else if (
      /\b(?:avocado toast|omelet|omelette|breakfast|waffles?|pancakes?|french toast|grits|home fries|hangry|platter|turkey bacon|veggie sausage)\b/i.test(
        text,
      )
    ) {
      category = "Breakfast";
    } else if (/\b(?:salad|greens|caesar|pecan and pear)\b/i.test(text)) {
      category = "Salads";
    } else if (/\b(?:flatbread)\b/i.test(text)) {
      category = "Flatbreads";
    } else if (/\b(?:pasta|spaghetti)\b/i.test(text)) {
      category = "Pastas";
    } else if (/\b(?:quesadila|quesadilla|wings?|tenders?|dip|hummus|pita chips|deviled eggs|cauliflower|fries)\b/i.test(text)) {
      category = "Appetizers";
    } else if (
      /\b(?:sandwich|sammy|burger|sliders?|philly|po\s*boy|glizzy|wrap|sub|quesadilla|patty|ciabatta|roll|bun|pita bread)\b/i.test(
        text,
      )
    ) {
      category = "Sandwiches";
    } else if (/\b(?:crab|shrimp|salmon|catfish|whiting|fish|calamari|seafood)\b/i.test(text)) {
      category = "Seafood";
    } else if (/\b(?:fried rice|mac (?:and|n|&) cheese|pita bagel flats|potatoes?|rice|collard|cabbage|vegetable medley|fruit bowl|toast|grits)\b/i.test(text)) {
      category = "Sides";
    } else if (/\b(?:chicken|lamb|goat|steak|curry|jerk|quarter chicken|meatball marinara)\b/i.test(text)) {
      category = "Entrees";
    }

    return category === item.category
      ? item
      : {
          ...item,
          category,
          sourceSummary: /Reviewed His & Hers category cleanup/i.test(String(item.sourceSummary ?? ""))
            ? item.sourceSummary
            : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed His & Hers category cleanup: corrected generic Wix/Toast sections using item names and official menu descriptions.`,
        };
  }

  if (restaurant?.id === "northside-social-va") {
    const id = String(item?.id ?? "");
    const name = String(item?.name ?? "");
    const description = String(item?.description ?? "");
    const text = `${name} ${description}`;
    let category = item.category;
    let nextDescription = item.description;
    let nextEvidence = item.evidence;
    let changed = false;
    const shouldReplaceNeighborBleedEvidence = /^(?:bag-of-chips|bag-of-sesame-crackers)$/i.test(id);
    const reviewedNorthsideDescription = {
      "arnold-palmer": "Half black iced tea, half house-made lemonade.",
      "matcha-latte": "Rishi matcha tea blended with your choice of milk. Hot or iced.",
      "noso-signature-matcha-latte":
        "Fresh matcha combined with steamed milk and house-made Northside signature matcha syrup.",
    }[id];

    if (shouldReplaceNeighborBleedEvidence) {
      nextDescription = undefined;
      changed = Boolean(item.description) || !/manual-quality-review/i.test(JSON.stringify(item.evidence ?? []));
      category = "Sides";
    } else if (/^(?:hot-coffee-with-steamed-milk|take-home-large-salad-bowl)$/i.test(id)) {
      nextDescription = undefined;
      nextEvidence = [
        {
          source: "manual-quality-review",
          sourceUrl: item.sourceUrls?.[0],
          text: `Reviewed Northside Social menu evidence: removed neighboring price/menu text from the display description for ${name}.`,
        },
      ];
      changed = Boolean(item.description) || !/manual-quality-review/i.test(JSON.stringify(item.evidence ?? []));
    } else if (reviewedNorthsideDescription) {
      nextDescription = reviewedNorthsideDescription;
      nextEvidence = [
        {
          source: "manual-quality-review",
          sourceUrl: item.sourceUrls?.[0],
          text: `Reviewed Northside Social menu evidence: replaced neighboring Toast menu bleed with the item-specific official description for ${name}.`,
        },
        ...(item.evidence ?? []).filter((entry) => /json-structured/i.test(String(entry?.sourceKind ?? entry?.source ?? ""))),
      ];
      changed =
        item.description !== reviewedNorthsideDescription ||
        !/manual-quality-review/i.test(JSON.stringify(item.evidence ?? []));
    } else if (/^(?:avocado-toast)$/i.test(id)) {
      category = "Breakfast";
    } else if (/\b(?:salad|bowl)\b/i.test(name)) {
      category = "Salads";
    } else if (/\b(?:sandwich|blt|grilled cheese|toast|bagel|croissant|feather loaf|bread)\b/i.test(text)) {
      category = "Sandwiches";
    } else if (/\b(?:cookie|scone|muffin|cake|cupcake|quiche)\b/i.test(name)) {
      category = "Cafe / Bakery";
    } else if (/\b(?:soup|posole)\b/i.test(name)) {
      category = "Soups";
    }

    if (/^(?:ICED|TEA LATTE|Hot Tea|Espresso)$/i.test(String(category ?? ""))) {
      category = "Beverages";
    } else if (
      /^Menu$/i.test(String(category ?? "")) &&
      /\b(?:arnold palmer|coffee|cappuccino|espresso|flat white|hot chocolate|latte|macchiato|matcha|tea|chai|lemonade)\b/i.test(name)
    ) {
      category = "Beverages";
    }

    changed = changed || category !== item.category;

    if (!changed) {
      return item;
    }

    const repaired = {
      ...item,
      category,
      sourceSummary: /Reviewed Northside Social menu cleanup/i.test(String(item.sourceSummary ?? ""))
        ? item.sourceSummary
        : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Northside Social menu cleanup: corrected Toast/category bleed against the official website and Toast menu evidence.`,
    };

    if (typeof nextDescription === "undefined") {
      delete repaired.description;
    } else {
      repaired.description = nextDescription;
    }

    if (shouldReplaceNeighborBleedEvidence) {
      repaired.evidence = [
        {
          source: "manual-quality-review",
          sourceUrl: repaired.sourceUrls?.[0],
          text: `Reviewed Northside Social Toast/menu evidence: kept ${name} as a side item and removed neighboring category/menu text from the display description.`,
        },
      ];
    } else if (nextEvidence !== item.evidence) {
      repaired.evidence = nextEvidence;
    }

    return repaired;
  }

  if (isChefTonyReviewedRestaurant(restaurant)) {
    return repairChefTonyOfficialMenuItem(restaurant, item);
  }

  if (isBoardAndBrewReviewedRestaurant(restaurant)) {
    return repairBoardAndBrewOfficialMenuItem(restaurant, item);
  }

  if (restaurant?.id === "redstone-american-grill-washington-dc-dc-metro") {
    return repairRedstoneOfficialMenuItem(restaurant, item);
  }

  if (restaurant?.id === "texas-de-brazil-fairfax-fairfax-va-dc-metro") {
    return repairTexasDeBrazilOfficialMenuItem(restaurant, item);
  }

  if (restaurant?.id === "burtons-grill-and-bar-washington-dc-dc-metro") {
    return repairBurtonsOfficialMenuItem(restaurant, item);
  }

  if (restaurant?.id === "chennai-hoppers-indian-restaurant-gaithersburg-md-dc-metro") {
    return repairChennaiHoppersOfficialMenuItem(restaurant, item);
  }

  if (restaurant?.id === "silverado-annandale-va-dc-metro") {
    return repairSilveradoOfficialMenuItem(restaurant, item);
  }

  if (restaurant?.id === "perry-s-restaurant-washington-dc-dc-metro") {
    return repairPerrysOfficialMenuItem(restaurant, item);
  }

  if (restaurant?.id === "stone-s-cove-kitbar-herndon-va-dc-metro") {
    return repairStonesCoveOfficialMenuItem(restaurant, item);
  }

  if (["planta-bethesda-bethesda-md-dc-metro", "replacement-planta-washington-dc-washington-dc"].includes(restaurant?.id)) {
    return repairPlantaOfficialMenuItem(restaurant, item);
  }

  if (restaurant?.id !== "lost-dog-cafe-dunn-loring-fairfax-va-dc-metro") {
    return item;
  }

  const name = String(item?.name ?? "");
  const description = String(item?.description ?? "");
  const text = `${name} ${description}`;
  let category = item.category;

  if (/side of ice cream/i.test(name)) {
    category = "Desserts";
  } else if (/\b(?:brownie|blondie|ice cream|peanut butter pie|dessert)\b/i.test(text)) {
    category = "Desserts";
  } else if (/\b(?:soup|chowder|chili|bisque)\b/i.test(name)) {
    category = "Soups";
  } else if (/\b(?:salad|greens)\b/i.test(name)) {
    category = "Salads";
  } else if (
    /^(?:ind|sm|lg)\b/i.test(name) ||
    /\bpita pizza\b/i.test(name) ||
    /\b(?:pizza|pizzas|white pizza|big red pie|greek pie|kujo pie|pedigree pie|pit bull pie|popeye pie|spinach bacon feta pie|whippet pie|giddy up goat|nouvelle veggie|mountain cur|catahoula)\b/i.test(
      text,
    )
  ) {
    category = "Pizza";
  } else if (
    /^(?:#?\d+[\s.]|#\d+)\b/.test(name) ||
    /\b(?:sandwich|sub roll|rustic sub|pita|croissant|marble rye|whole wheat bread|toast|brioche bun|club|reuben|gyro|blt)\b/i.test(
      text,
    )
  ) {
    category = "Sandwiches";
  } else if (/\b(?:dip|wings?|nachos|fries|quesadilla|chips|appetizer)\b/i.test(text)) {
    category = "Appetizers";
  }

  return category === item.category
    ? item
    : {
        ...item,
        category,
        sourceSummary: /Reviewed Lost Dog category cleanup/i.test(String(item.sourceSummary ?? ""))
          ? item.sourceSummary
          : `${item.sourceSummary ? `${item.sourceSummary} ` : ""}Reviewed Lost Dog category cleanup: corrected collapsed source categories from the ordering/menu scrape.`,
      };
}

function removeMayContainOnlyDirectAllergens(item) {
  if (
    item?.allergenSourceType !== "official-product-allergen-section" ||
    !(item?.mayContain ?? []).length
  ) {
    return item;
  }

  const directEvidenceText = [
    item?.name,
    item?.description,
    ...(item?.evidence ?? [])
      .filter((entry) => !/official-allergen-disclosure|manual-quality-review/i.test(String(entry?.sourceKind ?? entry?.source ?? "")))
      .map((entry) => entry?.text),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\b(?:may\s+contain|processed\s+in|made\s+in|manufactured\s+in)\b[\s\S]*$/i, "")
    .replace(/\b(?:ingredients?\s+from\s+)?facilit(?:y|ies)\s+that\s+(?:also\s+)?process(?:es)?\b[\s\S]*$/i, "");

  const allergens = (item.allergens ?? []).filter((allergen) => {
    if (!(item.mayContain ?? []).includes(allergen)) {
      return true;
    }

    return allergenMentionedInBaseText(allergen, directEvidenceText);
  });

  if (allergens.length === (item.allergens ?? []).length) {
    return item;
  }

  return {
    ...item,
    allergens,
  };
}

function inferenceInputSignature(item) {
  return JSON.stringify({
    allergenSourceType: item?.allergenSourceType ?? null,
    allergens: item?.allergens ?? [],
    category: item?.category ?? null,
    description: item?.description ?? null,
    ingredientsText: item?.ingredientsText ?? null,
    knownIngredients: item?.knownIngredients ?? [],
    mayContain: item?.mayContain ?? [],
    name: item?.name ?? null,
  });
}

function refreshIngredientIntelligenceIfNeeded(before, after, manifest) {
  const forceRefresh = /Reviewed (?:Northside Social|Jimmy's Old Town Tavern|Joon|Society Seafood House|Sunflower Vegetarian|Maggie McFly's|Afghania|El Patio|Open City|Pleroma Cuisine|Spacebar) menu cleanup|Reviewed The Organic Butcher product cleanup/i.test(
    String(after?.sourceSummary ?? ""),
  );
  const hasIngredientIntelligenceFields =
    Array.isArray(after?.inferredAllergenSignals) ||
    Array.isArray(after?.inferredIngredients) ||
    Boolean(after?.inferenceSummary) ||
    Boolean(after?.inferenceVersion);
  const officialUnavailable = !after?.allergenSourceType || after.allergenSourceType === "unavailable";

  return !forceRefresh &&
    !officialUnavailable &&
    !hasIngredientIntelligenceFields &&
    inferenceInputSignature(before) === inferenceInputSignature(after)
    ? after
    : annotateMenuItemWithIngredientIntelligence(after, { manifest });
}

function cleanSimpleContainsSourceSummary(item) {
  const sourceSummary = String(item?.sourceSummary ?? "");
  const match = sourceSummary.match(/^(contains?:?\s+[^.]+?)\s+Obvious ingredient terms in the official row were also mapped to app allergens\.?$/i);

  if (!match) {
    return item;
  }

  return {
    ...item,
    sourceSummary: match[1],
  };
}

for (const restaurant of repository.restaurants ?? []) {
  const suppressedIds = reviewedRecoverySuppressions.get(restaurant.id);

  if (!suppressedIds || !restaurant.items?.length) {
    continue;
  }

  const beforeCount = restaurant.items.length;
  restaurant.items = restaurant.items.filter((item) => !suppressedIds.has(item.id));
  suppressedRecoveredRows += beforeCount - restaurant.items.length;
}

for (const suppression of reviewedRecoverySuppressionPredicates) {
  const restaurant = repository.restaurants?.find((entry) => entry.id === suppression.restaurantId);

  if (!restaurant?.items?.length) {
    continue;
  }

  const beforeCount = restaurant.items.length;
  restaurant.items = restaurant.items.filter((item) => !suppression.shouldSuppress(item));
  predicateSuppressedRows += beforeCount - restaurant.items.length;
}

{
  const restaurant = repository.restaurants?.find(
    (entry) => entry.id === "elephant-and-castle-washington-dc-dc-metro",
  );

  if (restaurant) {
    restaurant.officialAllergenStatus = "not-applicable";
    restaurant.allergenDataStatus = {
      ...(restaurant.allergenDataStatus ?? {}),
      officialItemCount: 0,
    };
    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenRemediationBucket: "official-source-not-applicable-to-location",
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          removedRows: 1,
          note:
            "Removed a collapsed official nutrition/allergen blob because Elephant & Castle's nutrition page states the information applies to Canadian locations only, not the Washington, DC restaurant.",
        },
      ],
    };
  }
}

for (const restaurant of repository.restaurants ?? []) {
  const itemOverrides = reviewedItemFieldOverrides.get(restaurant.id);

  if (!itemOverrides) {
    continue;
  }

  restaurant.items = (restaurant.items ?? []).map((item) => ({
    ...item,
    ...(itemOverrides.get(item.id) ?? {}),
  }));
}

for (const restaurant of repository.restaurants ?? []) {
  const note = reviewedOfficialCrossContactNotes.get(restaurant.id);

  if (!note) {
    continue;
  }

  let reviewedCount = 0;
  restaurant.items = (restaurant.items ?? []).map((item) => {
    if ((item.mayContain ?? []).length === 0 || !/official/i.test(item.allergenSourceType ?? "")) {
      return item;
    }

    reviewedCount += 1;
    const evidence = [...(item.evidence ?? [])];

    if (!evidence.some((entry) => entry?.source === note.source)) {
      evidence.push(note);
    }

    return {
      ...item,
      evidence: evidence.slice(0, 6),
      sourceSummary: item.sourceSummary ?? note.text,
    };
  });

  if (reviewedCount > 0) {
    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "supported-cross-contact",
        decision: "preserved-source-supported-may-contain",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedCount,
      },
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          reviewedRows: reviewedCount,
          note: note.text,
        },
      ],
    };
  }
}

for (const restaurant of repository.restaurants ?? []) {
  if (restaurant.id !== "pf-changs") {
    continue;
  }

  const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
    /official/i.test(String(item?.allergenSourceType ?? "")) &&
    (item.evidence ?? []).some((entry) =>
      /Official P\.F\. Chang's allergen matrix row/i.test(String(entry?.text ?? "")),
    ),
  );

  if (reviewedOfficialItems.length === 0) {
    continue;
  }

  const reviewNote =
    "Reviewed P.F. Chang's strict official allergen matrix; high direct-allergen counts are source-backed row-level X cells, not a Nutritionix/filter smear.";
  const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

  restaurant.sourceStatus = {
    ...restaurant.sourceStatus,
    officialAllergenDistributionReview: {
      classification: "supported-strict-direct-matrix",
      decision: "preserved-source-supported-direct-allergen-matrix",
      reviewedAt: new Date().toISOString(),
      reviewedItemCount: reviewedOfficialItems.length,
      note:
        "Reviewed P.F. Chang's official Allergens To Go page and June 2026 allergen PDF. The source uses row-level X cells and marks many direct allergen columns, including Wheat for regular steamed rice; gluten-free rows are listed separately without Wheat. Preserved as official direct allergen data.",
    },
    reviewedMenuQualityRepairs: [
      ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
      { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
    ],
  };
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "el-pollo-rico-arlington-va");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed El Pollo Rico official menu rows: accepted partial item-level ingredient evidence from official Toast/Heartland menu text, repaired boundary bleed in catering rows, and kept plain chicken/rice/bean/salad rows unavailable rather than inventing safe official claims.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "genki-izakaya-fairfax-va-dc-metro");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Genki Izakaya official menu rows: replaced raw-fish warning smear with direct row-level ingredient mapping for fish, shellfish, tempura/noodle/bun/baked, soy, egg, dairy, and sauce terms from official menu text.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "dogwood-tavern-falls-church-va-dc-metro");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Dogwood Tavern official Popmenu rows: mapped direct menu ingredient terms to official partial allergen evidence and ignored optional add-on text as base-item evidence.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "hello-betty-north-bethesda-md");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Hello Betty official menu rows: mapped direct seafood, bread/pasta, dairy, egg/aioli, and tree-nut terms to official partial allergen evidence while removing footer/legal bleed and optional add-on evidence.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, removedRows: 1, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "heidelberg-pastry-shoppe-arlington-va");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Heidelberg official product/menu rows: mapped bakery, bread, sandwich, dairy, egg, fish, sesame, and tree-nut terms to official partial allergen evidence while removing price-sheet sizing/group artifacts.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, removedRows: 5, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "moes-southwest-grill");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Moe's Southwest Grill official menu rows: mapped direct flour tortilla, burrito, quesadilla, queso, cheese, sour cream, ranch, milk, cookie, and pretzel-crunch terms to official partial allergen evidence while keeping ambiguous hard-or-soft taco rows conservative.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

{
  const restaurants = (repository.restaurants ?? []).filter((entry) =>
    ["la-casita-pupusas-dc", "la-casita-gaithersburg-dc-metro"].includes(entry.id),
  );

  for (const restaurant of restaurants) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed La Casita official Toast menu rows: mapped direct dairy, egg, shellfish, fish, soy, gluten/oat/barley, roll/bread/cake, and Salvadoran cheese terms to official partial allergen evidence while preserving corn/rice masa and handmade tortilla context.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "el-tamarindo-dc");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed El Tamarindo official Toast/Bento menu rows: removed PDF boundary artifacts and mapped direct dairy, egg, fish, shellfish, sesame, tree-nut/coconut, and wheat/gluten bread-pastry terms while preserving corn tortilla and pupusa context.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, removedRows: 21, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "rocklands-bbq-dc");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Rocklands official Toast menu rows: mapped direct cheese/cream, fish, almond/pecan, sandwich/roll, cornbread, macaroni, tender, cookie, and pie terms to official partial allergen evidence while leaving plain BBQ meats and sides unavailable.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "noma-pizza-dc");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Noma Pizza official Toast menu rows: cleared stale low-coverage official contamination and mapped direct pizza, pasta, bread, dairy, egg, seafood, sesame, and pesto/nut evidence while leaving unsupported rows unavailable.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "takumi-navy-yard-dc");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Takumi official Toast menu rows: cleared stale low-coverage official state and mapped direct fish, shellfish, egg, dairy, soy, sesame, tempura/noodle/gluten-warning, and pesto/coconut evidence while leaving unsupported rows unavailable.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

{
  const restaurant = repository.restaurants?.find((entry) => entry.id === "tout-de-sweet-bethesda-dc-metro");

  if (restaurant) {
    const reviewedOfficialItems = (restaurant.items ?? []).filter((item) =>
      /official/i.test(String(item?.allergenSourceType ?? "")),
    );
    const reviewNote =
      "Reviewed Tout de Sweet official Toast menu rows: mapped direct bakery-format, dairy, egg, tree-nut, sesame, oat/granola, and salmon evidence while suppressing wheat/gluten for explicit gluten-free or flourless items.";
    const existingReviewedRepairs = restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? [];

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenDistributionReview: {
        classification: "official-partial-menu-ingredient-review",
        decision: "preserved-reviewed-partial-official-menu-ingredient-evidence",
        reviewedAt: new Date().toISOString(),
        reviewedItemCount: reviewedOfficialItems.length,
        note: reviewNote,
      },
      reviewedMenuQualityRepairs: [
        ...existingReviewedRepairs.filter((entry) => entry?.note !== reviewNote),
        { reviewedRows: reviewedOfficialItems.length, note: reviewNote },
      ],
    };
  }
}

for (const replacement of reviewedRestaurantItemReplacements) {
  for (const restaurantId of replacement.restaurantIds) {
    const restaurant = repository.restaurants?.find((entry) => entry.id === restaurantId);

    if (!restaurant) {
      continue;
    }

    const officialItemCount = replacement.rows.filter((row) =>
      /official/i.test(String(row.allergenSourceType ?? "")),
    ).length;

    replacedRestaurantRows += restaurant.items?.length ?? 0;
    restaurant.items = replacement.rows.map((row) =>
      annotateMenuItemWithIngredientIntelligence(row, { manifest }),
    );
    restaurant.officialAllergenStatus =
      replacement.officialAllergenStatus ?? restaurant.officialAllergenStatus;
    restaurant.allergenDataStatus = {
      ...(restaurant.allergenDataStatus ?? {}),
      officialItemCount,
    };
    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      extractedFoodItemCount: replacement.rows.length,
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          replacedRows: replacement.rows.length,
          note: replacement.note,
        },
      ],
    };
  }
}

for (const restaurant of repository.restaurants ?? []) {
  const existingIds = new Set((restaurant.items ?? []).map((item) => item.id));
  const existingDisplayKeys = new Set(
    (restaurant.items ?? []).map((item) =>
      `${String(item.category ?? "").trim().toLowerCase()}::${String(item.name ?? "").trim().toLowerCase()}`,
    ),
  );
  const repairedItems = [];
  let expandedForRestaurant = 0;
  let addedForRestaurant = 0;

  for (const item of restaurant.items ?? []) {
    if (!isPackedPricedMenuListRow(item)) {
      repairedItems.push(item);
      continue;
    }

    const candidateSplitRows = splitPackedPricedMenuListRow(item);
    const splitRows = candidateSplitRows
      .map((row) => {
        let id = row.id;
        let counter = 2;

        while (existingIds.has(id)) {
          id = `${row.id}-${counter}`;
          counter += 1;
        }

        existingIds.add(id);
        return annotateMenuItemWithIngredientIntelligence({ ...row, id }, { manifest });
      })
      .map((row) => sanitizeMenuItemDisplayFields(row))
      .filter((row) => classifyMenuItemRow(row).kind === "menu-item")
      .filter((row) => {
        const displayKey =
          `${String(row.category ?? "").trim().toLowerCase()}::${String(row.name ?? "").trim().toLowerCase()}`;

        if (existingDisplayKeys.has(displayKey)) {
          return false;
        }

        existingDisplayKeys.add(displayKey);
        return true;
      });

    if (splitRows.length < 4 && candidateSplitRows.length < 4) {
      repairedItems.push(item);
      continue;
    }

    repairedItems.push(...splitRows);
    expandedForRestaurant += 1;
    addedForRestaurant += splitRows.length;
  }

  if (expandedForRestaurant > 0) {
    restaurant.items = repairedItems;
    packedPricedRowsExpanded += expandedForRestaurant;
    packedPricedItemsAdded += addedForRestaurant;
    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      discardedItemCount: (restaurant.sourceStatus?.discardedItemCount ?? 0) + expandedForRestaurant,
      extractedFoodItemCount:
        (restaurant.sourceStatus?.extractedFoodItemCount ?? restaurant.items.length) -
        expandedForRestaurant +
        addedForRestaurant,
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          expandedRows: expandedForRestaurant,
          addedRows: addedForRestaurant,
          note: "Expanded packed priced menu-list rows into individual source-backed menu items.",
        },
      ],
    };
  }
}

for (const repair of reviewedMenuRowAdditions) {
  const restaurant = repository.restaurants?.find((entry) => entry.id === repair.restaurantId);

  if (!restaurant) {
    continue;
  }

  const existingIds = new Set((restaurant.items ?? []).map((item) => item.id));

  for (const row of repair.rows) {
    if (existingIds.has(row.id)) {
      continue;
    }

    restaurant.items.push(annotateMenuItemWithIngredientIntelligence({
      allergens: [],
      allergenSourceType: "unavailable",
      evidence: [
        {
          source: "manual-quality-review",
          text: repair.note,
        },
      ],
      inferenceSummary: "No Ingredient Intelligence concerns inferred.",
      inferenceVersion: restaurant.items[0]?.inferenceVersion ?? "ingredient-intelligence-v2",
      inferredAllergenSignals: [],
      inferredIngredients: [],
      mayContain: [],
      ...row,
    }, { manifest }));
    existingIds.add(row.id);
    addedRows += 1;
  }

  restaurant.items.sort((left, right) =>
    String(left.category ?? "").localeCompare(String(right.category ?? "")) ||
    String(left.name ?? "").localeCompare(String(right.name ?? "")),
  );

  restaurant.sourceStatus = {
    ...restaurant.sourceStatus,
    reviewedMenuQualityRepairs: [
      ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
      {
        addedRows: repair.rows.length,
        note: repair.note,
      },
    ],
  };
}

for (const restore of reviewedMenuRowRestorations) {
  const restaurant = repository.restaurants?.find((entry) => entry.id === restore.restaurantId);
  const sourceRestaurant = restoreRepository.restaurants?.find(
    (entry) => entry.id === restore.restaurantId,
  );

  if (!restaurant || !sourceRestaurant) {
    continue;
  }

  const existingIds = new Set((restaurant.items ?? []).map((item) => item.id));
  let restoredForRestaurant = 0;

  for (const itemId of restore.itemIds) {
    if (existingIds.has(itemId)) {
      continue;
    }

    const sourceItem = sourceRestaurant.items?.find((item) => item.id === itemId);

    if (!sourceItem) {
      continue;
    }

    const itemOverrides = reviewedItemFieldOverrides.get(restaurant.id)?.get(sourceItem.id) ?? {};

    restaurant.items.push(annotateMenuItemWithIngredientIntelligence({
      ...sourceItem,
      ...itemOverrides,
      evidence: [
        ...(sourceItem.evidence ?? []),
        {
          source: "manual-quality-review",
          text: restore.note,
        },
      ],
      sourceSummary: sourceItem.sourceSummary ?? restore.note,
    }, { manifest }));
    existingIds.add(itemId);
    restoredRows += 1;
    restoredForRestaurant += 1;
  }

  if (restoredForRestaurant > 0) {
    restaurant.items.sort((left, right) =>
      String(left.category ?? "").localeCompare(String(right.category ?? "")) ||
      String(left.name ?? "").localeCompare(String(right.name ?? "")),
    );

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          restoredRows: restoredForRestaurant,
          note: restore.note,
        },
      ],
    };
  }
}

for (const restaurant of repository.restaurants ?? []) {
  if (reviewedRestaurantItemReplacementIds.has(restaurant.id)) {
    continue;
  }

  const sourceRestaurant = restoreRepository.restaurants?.find(
    (entry) => entry.id === restaurant.id,
  );

  if (!sourceRestaurant) {
    continue;
  }

  const existingIds = new Set((restaurant.items ?? []).map((item) => item.id));
  const existingDisplayKeys = new Set(
    (restaurant.items ?? []).map((item) =>
      `${String(item.category ?? "").trim().toLowerCase()}::${String(item.name ?? "").trim().toLowerCase()}`,
    ),
  );
  let recoveredForRestaurant = 0;

  for (const sourceItem of sourceRestaurant.items ?? []) {
    if (existingIds.has(sourceItem.id)) {
      continue;
    }

    if (shouldSuppressReviewedRecovery(restaurant.id, sourceItem)) {
      continue;
    }

    const itemOverrides = reviewedItemFieldOverrides.get(restaurant.id)?.get(sourceItem.id) ?? {};
    const sanitized = sanitizeMenuItemDisplayFields({
      ...sourceItem,
      ...itemOverrides,
    });
    const displayKey =
      `${String(sanitized.category ?? "").trim().toLowerCase()}::${String(sanitized.name ?? "").trim().toLowerCase()}`;

    if (existingDisplayKeys.has(displayKey)) {
      continue;
    }

    const classification = classifyMenuItemRow(sanitized);

    if (classification.kind !== "menu-item") {
      continue;
    }

    restaurant.items.push(annotateMenuItemWithIngredientIntelligence({
      ...sanitized,
      evidence: [
        ...(sanitized.evidence ?? []),
        {
          source: "reviewed-portfolio-row-recovery",
          text: "Recovered from the reviewed launch repository after shared classifier tightening confirmed this row is a menu item.",
        },
      ],
      sourceSummary:
        sanitized.sourceSummary ??
        "Recovered from the reviewed launch repository after shared classifier tightening confirmed this row is a menu item.",
    }, { manifest }));
    existingIds.add(sourceItem.id);
    existingDisplayKeys.add(displayKey);
    classifierRecoveredRows += 1;
    recoveredForRestaurant += 1;
  }

  if (recoveredForRestaurant > 0) {
    restaurant.items.sort((left, right) =>
      String(left.category ?? "").localeCompare(String(right.category ?? "")) ||
      String(left.name ?? "").localeCompare(String(right.name ?? "")),
    );

    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          restoredRows: recoveredForRestaurant,
          note: "Recovered reviewed repository rows that now pass the shared menu-row classifier.",
        },
      ],
    };
  }
}

for (const restaurant of repository.restaurants ?? []) {
  const itemOverrides = reviewedItemFieldOverrides.get(restaurant.id);

  if (!itemOverrides?.size) {
    continue;
  }

  let reviewedOverridesForRestaurant = 0;

  restaurant.items = (restaurant.items ?? []).map((item) => {
    const override = itemOverrides.get(item.id);

    if (!override) {
      return item;
    }

    reviewedOverridesForRestaurant += 1;
    reviewedOverrideRows += 1;

    return annotateMenuItemWithIngredientIntelligence(
      sanitizeMenuItemDisplayFields({
        ...item,
        ...override,
        evidence: override.evidence ?? item.evidence,
      }),
      { manifest },
    );
  });

  if (reviewedOverridesForRestaurant > 0) {
    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          updatedRows: reviewedOverridesForRestaurant,
          note:
            "Applied reviewed source-backed field overrides to existing menu rows before final publish cleanup.",
        },
      ],
    };
  }
}

for (const restaurant of repository.restaurants ?? []) {
  const existingIds = new Set((restaurant.items ?? []).map((item) => item.id));
  const existingDisplayKeys = new Set(
    (restaurant.items ?? []).map((item) =>
      `${String(item.category ?? "").trim().toLowerCase()}::${String(item.name ?? "").trim().toLowerCase()}`,
    ),
  );
  const repairedItems = [];
  let expandedForRestaurant = 0;
  let addedForRestaurant = 0;

  for (const item of restaurant.items ?? []) {
    if (!isPackedPricedMenuListRow(item)) {
      repairedItems.push(item);
      continue;
    }

    const candidateSplitRows = splitPackedPricedMenuListRow(item);
    const splitRows = candidateSplitRows
      .map((row) => {
        let id = row.id;
        let counter = 2;

        while (existingIds.has(id)) {
          id = `${row.id}-${counter}`;
          counter += 1;
        }

        existingIds.add(id);
        return annotateMenuItemWithIngredientIntelligence({ ...row, id }, { manifest });
      })
      .map((row) => sanitizeMenuItemDisplayFields(row))
      .filter((row) => classifyMenuItemRow(row).kind === "menu-item")
      .filter((row) => {
        const displayKey =
          `${String(row.category ?? "").trim().toLowerCase()}::${String(row.name ?? "").trim().toLowerCase()}`;

        if (existingDisplayKeys.has(displayKey)) {
          return false;
        }

        existingDisplayKeys.add(displayKey);
        return true;
      });

    if (splitRows.length < 4 && candidateSplitRows.length < 4) {
      repairedItems.push(item);
      continue;
    }

    repairedItems.push(...splitRows);
    expandedForRestaurant += 1;
    addedForRestaurant += splitRows.length;
  }

  if (expandedForRestaurant > 0) {
    restaurant.items = repairedItems;
    packedPricedRowsExpanded += expandedForRestaurant;
    packedPricedItemsAdded += addedForRestaurant;
    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      discardedItemCount: (restaurant.sourceStatus?.discardedItemCount ?? 0) + expandedForRestaurant,
      extractedFoodItemCount:
        (restaurant.sourceStatus?.extractedFoodItemCount ?? restaurant.items.length) -
        expandedForRestaurant +
        addedForRestaurant,
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          expandedRows: expandedForRestaurant,
          addedRows: addedForRestaurant,
          note: "Expanded packed priced menu-list rows into individual source-backed menu items after reviewed-row recovery.",
        },
      ],
    };
  }
}

repository.itemCount = repository.restaurants.reduce(
  (count, restaurant) => count + (restaurant.items?.length ?? 0),
  0,
);

for (const restaurant of repository.restaurants ?? []) {
  Object.assign(restaurant, applyReviewedAccommodationPolicyContext(applyReviewedOfficialGuideContext(restaurant)));

  const filteredItems = [];

  for (const item of restaurant.items ?? []) {
    const sanitized = sanitizeMenuItemDisplayFields(
      normalizeReviewedLostDogCategory(
        restaurant,
        normalizeReviewedLateItemOverrides(
          restaurant,
          normalizeSilverDinerUnsafeOfficialParse(
            restaurant,
            normalizeGlobalRawWarningAllergens(
              restoreReviewedAllergenRegression(
                    normalizeOfficialGlutenFreeMarkerItem(
                      normalizeOfficialCrossContactOnlyItem(
                        normalizeOfficialAllergenFreeLabels(
                          normalizeRepeatedReviewedSourceSummary(
                            normalizeOfficialMatrixSourceType(
                              normalizeOfficialConcernSourceSummary(
                                normalizeOfficialObviousIngredientSignals(
                                  normalizeOfficialSemicolonAllergenDisclosure(
                                    normalizeOfficialInlineAllergenDeclarations(item, restaurant),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                restaurant,
              ),
            ),
          ),
        ),
      ),
    );
    const classification = shouldSuppressPublishedReviewedItem(restaurant, sanitized)
      ? { kind: "source-note", reasons: ["reviewed-source-fragment"] }
      : classifyMenuItemRow(sanitized);

    if (classification.kind === "menu-item") {
      filteredItems.push(refreshIngredientIntelligenceIfNeeded(item, sanitized, manifest));
    } else {
      restaurant.sourceStatus = {
        ...restaurant.sourceStatus,
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
    }
  }

  restaurant.items = filteredItems
    .map((item) => removeMayContainOnlyDirectAllergens(item))
    .map((item) => cleanSimpleContainsSourceSummary(item))
    .map((item) => compactReviewedMenuItemForPublish(item));

  const previousOfficialItemCount = restaurant.allergenDataStatus?.officialItemCount ?? 0;
  const officialItemCount = officialItemCountForRestaurant(restaurant);
  const officialEvidence = officialEvidenceClassification(restaurant);
  const totalItemCount = restaurant.items?.length ?? 0;

  restaurant.totalItemCount = totalItemCount;
  restaurant.allergenDataStatus = {
    ...(restaurant.allergenDataStatus ?? {}),
    officialItemCount,
    officialEvidence,
    officialTotal: officialItemCount,
    totalItemCount,
    officialCoverageRatio: totalItemCount > 0 ? Number((officialItemCount / totalItemCount).toFixed(3)) : 0,
    bucket: officialEvidence.bucket,
  };
  restaurant.sourceStatus = {
    ...(restaurant.sourceStatus ?? {}),
    officialEvidenceBucket: officialEvidence.bucket,
    officialItemCount,
    extractedFoodItemCount: totalItemCount,
  };

  Object.assign(restaurant, applyReviewedAccommodationPolicyContext(restaurant));

  if (
    officialItemCount === 0 &&
    previousOfficialItemCount > 0 &&
    restaurant.officialAllergenStatus === "extracted"
  ) {
    restaurant.officialAllergenStatus = "not-found";
    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      officialAllergenRemediationBucket: "official-parser-artifacts-removed",
      reviewedMenuQualityRepairs: [
        ...(restaurant.sourceStatus?.reviewedMenuQualityRepairs ?? []),
        {
          removedOfficialRows: previousOfficialItemCount,
          note:
            "Removed rows that were previously counted as official allergen evidence because the shared row classifier identified them as source notes, legends, policies, or parser fragments rather than real menu items.",
        },
      ],
    };
  }

  if (restaurant.sourceStatus?.quarantinedItemExamples?.length) {
    const publishedIds = new Set(restaurant.items.map((item) => item.id));
    restaurant.sourceStatus = {
      ...restaurant.sourceStatus,
      quarantinedItemExamples: restaurant.sourceStatus.quarantinedItemExamples.filter(
        (example) => !publishedIds.has(example.id),
      ),
    };
  }

  restaurant.sourceStatus = compactReviewedRepairNotes(restaurant.sourceStatus);
}

repository.itemCount = repository.restaurants.reduce(
  (count, restaurant) => count + (restaurant.items?.length ?? 0),
  0,
);

const temporaryRepositoryPath = `${repositoryPath}.tmp`;
await fs.writeFile(temporaryRepositoryPath, JSON.stringify(repository));
await fs.rename(temporaryRepositoryPath, repositoryPath);

console.log(
  JSON.stringify(
    {
      repositoryPath,
      addedRows,
      restoredRows,
      classifierRecoveredRows,
      suppressedRecoveredRows,
      predicateSuppressedRows,
      reviewedOverrideRows,
      replacedRestaurantRows,
      packedPricedRowsExpanded,
      packedPricedItemsAdded,
      restaurantCount: repository.restaurants.length,
      itemCount: repository.itemCount,
    },
    null,
    2,
  ),
);
